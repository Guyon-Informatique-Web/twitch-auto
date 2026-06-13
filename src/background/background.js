// Service worker : reglages par defaut, compteurs, notifications, badge, alertes erreur.
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
const errorThrottle = TAUtil.makeThrottle(60 * 60 * 1000); // 1 envoi / erreur / heure

// Initialisation des reglages/stats sans ecraser l'existant.
chrome.runtime.onInstalled.addListener(async () => {
  const cur = await chrome.storage.local.get(['settings', 'stats']);
  await chrome.storage.local.set({
    settings: { ...DEFAULT_SETTINGS, ...(cur.settings || {}) },
    stats: { ...DEFAULT_STATS, ...(cur.stats || {}) }
  });
  updateBadge();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.settings) updateBadge();
});

async function updateBadge() {
  const { settings } = await chrome.storage.local.get('settings');
  const on = settings ? settings.enabled : true;
  chrome.action.setBadgeText({ text: on ? 'on' : 'off' });
  chrome.action.setBadgeBackgroundColor({ color: on ? '#00b86b' : '#555555' });
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || !msg.type) return;
  if (msg.type === 'claim') handleClaim(msg);
  else if (msg.type === 'error') handleError(msg, sender);
  return false;
});

async function handleClaim(msg) {
  const data = await chrome.storage.local.get(['stats', 'settings']);
  const s = { ...DEFAULT_STATS, ...(data.stats || {}) };
  const settings = data.settings || {};
  const now = Date.now();

  if (msg.kind === 'points') {
    const before = s.pointsValue;
    s.pointsClaimed += 1;
    s.pointsValue += (msg.amount || 0);
    s.lastPointsClaim = now;
    if (settings.notifications) {
      const crossed = Math.floor(s.pointsValue / POINTS_NOTIFY_STEP) > Math.floor(before / POINTS_NOTIFY_STEP);
      if (crossed) notify('Points reclames', `${s.pointsValue} points cumules via Twitch Auto`);
    }
  } else if (msg.kind === 'drop') {
    s.dropsClaimed += 1;
    s.lastDropsClaim = now;
    if (settings.notifications) notify('Drop reclame', msg.name ? `Drop: ${msg.name}` : 'Un drop a ete reclame');
  }
  await chrome.storage.local.set({ stats: s });
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
  await chrome.storage.local.set({ lastError: { module: msg.module, message: msg.message, ts: Date.now() } });

  const { settings } = await chrome.storage.local.get('settings');
  const endpoint = settings && settings.errorEndpoint;
  if (!endpoint) return;
  if (!errorThrottle(`${msg.module}:${msg.message}`, Date.now())) return;

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
