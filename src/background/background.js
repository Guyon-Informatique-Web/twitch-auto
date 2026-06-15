// Service worker : reglages par defaut, compteurs, notifications, badge, alertes erreur, MAJ.
importScripts('../shared/util.js');

const DEFAULT_SETTINGS = {
  enabled: true,
  points: true,
  drops: true,
  reload: true,
  lowQuality: true,
  antiAfk: true,
  muteBackground: true,
  notifications: true,
  errorEndpoint: '' // URL log-error de giw-site-web (a renseigner ; vide = pas d'envoi)
};
const DEFAULT_STATS = {
  pointsClaimed: 0,
  pointsValue: 0,
  lastPointsClaim: null,
  dropsClaimed: 0,
  lastDropsClaim: null
};
const POINTS_NOTIFY_STEP = 5000;            // notif points tous les 5000 pts cumules
const HISTORY_MAX = 200;                    // nombre max d'evenements conserves
const ERROR_THROTTLE_MS = 60 * 60 * 1000;   // 1 email max / erreur identique / heure
const UPDATE_API = 'https://api.github.com/repos/Guyon-Informatique-Web/twitch-auto/releases/latest';

// File de serialisation : toutes les ecritures storage passent ici -> pas de read-modify-write
// concurrent (plusieurs onglets ecrivent stats/history via l'unique service worker).
let writeQueue = Promise.resolve();
function enqueue(fn) {
  const run = writeQueue.then(fn, fn);
  writeQueue = run.catch(() => {});
  return run;
}

// L'alarme MV3 doit etre creee UNE seule fois : la recreer a chaque reveil du SW
// reinitialise le compteur et elle ne se declenche jamais.
function ensureAlarm() {
  chrome.alarms.get('checkUpdate', (a) => {
    if (!a) chrome.alarms.create('checkUpdate', { periodInMinutes: 360 });
  });
}

chrome.runtime.onInstalled.addListener(async () => {
  const cur = await chrome.storage.local.get(['settings', 'stats']);
  await chrome.storage.local.set({
    settings: { ...DEFAULT_SETTINGS, ...(cur.settings || {}) },
    stats: { ...DEFAULT_STATS, ...(cur.stats || {}) }
  });
  ensureAlarm();
  updateBadge();
  checkUpdate();
});

chrome.runtime.onStartup.addListener(() => { ensureAlarm(); checkUpdate(); });
chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'checkUpdate') checkUpdate(); });

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.settings) updateBadge();
});

async function updateBadge() {
  const { settings } = await chrome.storage.local.get('settings');
  const on = settings ? settings.enabled : true;
  chrome.action.setBadgeText({ text: on ? 'on' : 'off' });
  chrome.action.setBadgeBackgroundColor({ color: on ? '#00b86b' : '#555555' });
}

// Verifie la derniere release publiee sur GitHub et signale si une MAJ existe.
async function checkUpdate() {
  try {
    const res = await fetch(UPDATE_API, { cache: 'no-store', headers: { Accept: 'application/vnd.github+json' } });
    if (!res.ok) return;
    const data = await res.json();
    const remote = String(data.tag_name || '').replace(/^v/, '');
    if (!remote) return;
    const current = chrome.runtime.getManifest().version;
    const prev = (await chrome.storage.local.get('update')).update;
    if (TAUtil.compareVersions(remote, current) > 0) {
      const asset = (data.assets || []).find((a) => a.name && a.name.toLowerCase().endsWith('.zip'));
      const url = asset ? asset.browser_download_url : '';
      await chrome.storage.local.set({ update: { available: true, version: remote, url } });
      if (!prev || prev.version !== remote) {
        notify('Mise a jour disponible', `Twitch Auto v${remote} est disponible. Ouvre le popup pour la recuperer.`);
      }
    } else {
      await chrome.storage.local.set({ update: { available: false, version: current } });
    }
  } catch (e) { /* hors ligne / GitHub injoignable */ }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return false;
  // On garde le canal ouvert (return true) jusqu'a la fin de l'ecriture storage.
  if (msg.type === 'claim') {
    handleClaim(msg).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (msg.type === 'error') {
    handleError(msg, sender).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (msg.type === 'mute') {
    // Mute/unmute au niveau de l'onglet (n'interrompt pas la lecture, contrairement a v.muted).
    if (sender.tab && sender.tab.id != null) {
      chrome.tabs.update(sender.tab.id, { muted: !!msg.hidden }).catch(() => {});
    }
    return false;
  }
  return false;
});

function handleClaim(msg) {
  return enqueue(async () => {
    const data = await chrome.storage.local.get(['stats', 'settings', 'history']);
    const s = { ...DEFAULT_STATS, ...(data.stats || {}) };
    const settings = data.settings || {};
    const history = Array.isArray(data.history) ? data.history : [];
    const now = Date.now();

    if (msg.kind === 'points') {
      const before = s.pointsValue;
      s.pointsClaimed += 1;
      s.pointsValue += (msg.amount || 0);
      s.lastPointsClaim = now;
      const crossed = Math.floor(s.pointsValue / POINTS_NOTIFY_STEP) > Math.floor(before / POINTS_NOTIFY_STEP);
      if (crossed) {
        history.push({ type: 'points', amount: s.pointsValue, ts: now });
        if (settings.notifications) notify('Points reclames', `${s.pointsValue} points cumules via Twitch Auto`);
      }
    } else if (msg.kind === 'drop') {
      s.dropsClaimed += 1;
      s.lastDropsClaim = now;
      history.push({ type: 'drop', name: msg.name || '', ts: now });
      if (settings.notifications) notify('Drop reclame', msg.name ? `Drop: ${msg.name}` : 'Un drop a ete reclame');
    }

    if (history.length > HISTORY_MAX) history.splice(0, history.length - HISTORY_MAX);
    await chrome.storage.local.set({ stats: s, history });
  });
}

function notify(title, message) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
    title,
    message
  });
}

async function handleError(msg, sender) {
  console.error('[TwitchAuto] erreur signalee:', msg.module, msg.message);
  const now = Date.now();
  const key = `${msg.module}:${msg.message}`;

  // Throttle PERSISTANT (survit aux morts du service worker) + ecriture de lastError, serialise.
  const endpoint = await enqueue(async () => {
    const { settings = {}, errorThrottle = {} } = await chrome.storage.local.get(['settings', 'errorThrottle']);
    await chrome.storage.local.set({ lastError: { module: msg.module, message: msg.message, ts: now } });
    const ep = settings.errorEndpoint || '';
    if (!ep) return '';
    if (now - (errorThrottle[key] || 0) < ERROR_THROTTLE_MS) return '';
    errorThrottle[key] = now;
    for (const k in errorThrottle) { if (now - errorThrottle[k] > ERROR_THROTTLE_MS) delete errorThrottle[k]; }
    await chrome.storage.local.set({ errorThrottle });
    return ep;
  });
  if (!endpoint) return;

  try {
    await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'twitch-auto-extension',
        module: msg.module,
        message: msg.message,
        url: sender && sender.url,
        userAgent: navigator.userAgent,
        version: chrome.runtime.getManifest().version,
        ts: new Date().toISOString()
      })
    });
  } catch (e) {
    console.error('[TwitchAuto] echec POST erreur:', e);
  }
}
