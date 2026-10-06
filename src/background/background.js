// Service worker : reglages par defaut, compteurs, notifications, badge, alertes erreur, MAJ.
importScripts('../shared/util.js', '../shared/i18n.js');

const DEFAULT_SETTINGS = {
  enabled: true,
  points: true,
  drops: true,
  reload: true,
  lowQuality: true,
  antiAfk: true,
  muteBackground: true,
  notifications: true,
  keepAlive: true,        // relance la lecture des onglets en arriere-plan mis en pause
  autoInventory: false,   // garde/ouvre l'onglet inventaire des drops en arriere-plan (opt-in)
  tracker: true,          // suivi temps de visionnage / drops en cours (pas de toggle visible)
  autoSwitch: false,      // bascule si chaine hors-ligne (opt-in, redirige l'onglet)
  autoSwitchUrl: '',      // ancienne chaine de repli unique (avant la v1.13), migree dans la liste
  autoSwitchChannels: [], // chaines de repli, dans l'ordre (slugs, 5 au plus)
  autoReloadTabs: true,   // apres une mise a jour, recharge les onglets Twitch en arriere-plan
  autoWatch: false,       // drop bloque -> ouvre une chaine participante en arriere-plan (opt-in)
  historyTtlMin: 0,       // vidage auto de l'historique apres X min (0 / vide = jamais)
  errorEndpoint: ''       // URL log-error de giw-site-web (a renseigner ; vide = pas d'envoi)
};
const DEFAULT_STATS = {
  pointsClaimed: 0,
  pointsValue: 0,
  lastPointsClaim: null,
  dropsClaimed: 0,
  lastDropsClaim: null,
  watchSeconds: 0,        // temps de visionnage cumule
  byChannel: {},          // { slug: { points, drops, seconds } }
  inProgress: [],         // drops en cours { name, percent }
  inProgressTs: null,     // date du dernier snapshot non vide (anti-flicker au reload)
  heartbeats: {},         // { tabId: ts } -> nb d'onglets actifs
  watchByGame: {},        // { slug de jeu: secondes de lecture } -> alerte "drop bloque"
  progress: {},           // { cle de drop: { pct, since, watch, notified } } -> alerte "drop bloque"
  stuck: [],              // drops bloques au dernier releve (lus par le popup)
  autoWatchTs: {}         // { slug de jeu: date } -> ouverture auto d'une chaine participante
};
const AUTO_WATCH_GAP = 60 * 60 * 1000;      // au plus une ouverture auto par jeu et par heure
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

// Ouvre l'onglet inventaire des drops en arriere-plan s'il n'est pas deja ouvert (option opt-in).
async function ensureInventoryTab() {
  const { settings } = await chrome.storage.local.get('settings');
  if (!settings || !settings.autoInventory) return;
  try {
    const tabs = await chrome.tabs.query({ url: 'https://www.twitch.tv/drops/inventory*' });
    if (!tabs.length) chrome.tabs.create({ url: 'https://www.twitch.tv/drops/inventory', active: false });
  } catch (e) { /* ignore */ }
}

// Recharge le(s) onglet(s) inventaire deja ouverts (suite a un claim sur un stream),
// pour remettre a jour les barres de progression. Throttle pour absorber une rafale de claims.
const INVENTORY_RELOAD_THROTTLE = 30 * 1000;
let lastInventoryReload = 0;
async function reloadInventoryTabs() {
  try {
    const tabs = await chrome.tabs.query({ url: 'https://www.twitch.tv/drops/inventory*' });
    if (!tabs.length) return;                                           // aucun onglet : ne consomme pas le throttle
    const now = Date.now();
    if (now - lastInventoryReload < INVENTORY_RELOAD_THROTTLE) return;   // anti-rafale (best-effort, SW MV3)
    lastInventoryReload = now;
    for (const tab of tabs) { if (tab.id != null) chrome.tabs.reload(tab.id); }
  } catch (e) { /* ignore */ }
}

chrome.runtime.onInstalled.addListener(async (details) => {
  const cur = await chrome.storage.local.get(['settings', 'stats']);
  const settings = { ...DEFAULT_SETTINGS, ...(cur.settings || {}) };
  // v1.13 : l'ancienne chaine de repli unique devient le premier element de la liste.
  if ((!Array.isArray(settings.autoSwitchChannels) || !settings.autoSwitchChannels.length) && settings.autoSwitchUrl) {
    const slug = TAUtil.channelSlug(settings.autoSwitchUrl);
    settings.autoSwitchChannels = slug ? [slug] : [];
  }
  await chrome.storage.local.set({
    settings,
    stats: { ...DEFAULT_STATS, ...(cur.stats || {}) }
  });
  ensureAlarm();
  updateBadge();
  checkUpdate();
  ensureInventoryTab();
  // Apres une installation ou une mise a jour (rechargement de l'extension compris), les
  // onglets Twitch deja ouverts n'ont plus de scripts : ils ne sont plus suivis. On recharge
  // ceux qui sont en arriere-plan ; l'onglet actif de chaque fenetre, peut-etre regarde, est
  // laisse au bouton "Recharger" du popup.
  if ((details.reason === 'install' || details.reason === 'update') && settings.autoReloadTabs !== false) {
    reloadBackgroundTwitchTabs();
  }
});

// Pages ou un rechargement peut faire perdre une saisie (paiement, reglages, abonnement...) :
// jamais rechargees d'office.
const NO_AUTO_RELOAD = /^\/(settings|subs|checkout|payments|redeem|wallet|bits|login|signup|activate|messages)(\/|$)/i;
async function reloadBackgroundTwitchTabs() {
  try {
    const tabs = await chrome.tabs.query({ url: 'https://www.twitch.tv/*' });
    let delay = 0;
    for (const tab of tabs) {
      if (tab.active || tab.id == null || tab.discarded || tab.status === 'unloaded') continue;   // endormis : laisses tels quels
      // Onglet de fond qu'on entend (son non coupe) : tu l'ecoutes, on n'y touche pas. Un onglet
      // coupe par le mute de fond reste "audible" pour Chrome : celui-la est recharge.
      if (tab.audible && !(tab.mutedInfo && tab.mutedInfo.muted)) continue;
      let path = '';
      try { path = new URL(tab.url).pathname; } catch (e) { continue; }
      if (NO_AUTO_RELOAD.test(path)) continue;
      setTimeout(() => chrome.tabs.reload(tab.id).catch(() => {}), delay);   // espaces : pas de rafale
      delay += 800;
    }
  } catch (e) { /* ignore */ }
}

// Ouvre l'annuaire du jeu filtre sur les chaines qui ont les drops actives ; le module
// participate y choisit la premiere chaine en direct. Mesure du 06/10/2026 : Chrome ne charge
// pas la video d'un onglet ouvert en arriere-plan tant qu'il n'a jamais ete affiche. Le bouton du
// popup ouvre donc l'onglet au premier plan ; l'ouverture automatique le cree en fond et previent
// par une notification (un clic l'affiche, et la lecture demarre).
async function openParticipating(slug, active, notice) {
  const url = TAUtil.participateUrl(slug);
  if (!url) return;
  try {
    const tab = await chrome.tabs.create({ url, active: !!active });
    if (!active && notice && tab && tab.id != null) {
      chrome.notifications.create('watch-' + tab.id, {
        type: 'basic', iconUrl: chrome.runtime.getURL('icons/icon-128.png'), title: notice.title, message: notice.message
      });
    }
  } catch (e) { /* onglet refuse */ }
}

// Clic sur la notification d'une chaine ouverte en fond : on l'affiche (la lecture demarre).
chrome.notifications.onClicked.addListener((id) => {
  const m = /^watch-(\d+)$/.exec(id);
  if (!m) return;
  const tabId = Number(m[1]);
  chrome.tabs.update(tabId, { active: true }).then((tab) => {
    if (tab && tab.windowId != null) chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
  }).catch(() => {});
  chrome.notifications.clear(id);
});

chrome.runtime.onStartup.addListener(() => { ensureAlarm(); checkUpdate(); ensureInventoryTab(); });
chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'checkUpdate') checkUpdate(); });

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.settings) {
    updateBadge();
    // Si on vient d'activer "Inventaire auto", on ouvre l'onglet tout de suite.
    const cur = changes.settings.newValue || {};
    const prev = changes.settings.oldValue || {};
    if (cur.autoInventory && !prev.autoInventory) ensureInventoryTab();
  }
});

async function updateBadge() {
  const { settings } = await chrome.storage.local.get('settings');
  const on = !settings || settings.enabled !== false;   // meme lecture que le popup et les onglets
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
    const store = await chrome.storage.local.get(['update', 'settings']);
    const prev = store.update;
    if (TAUtil.compareVersions(remote, current) > 0) {
      const asset = (data.assets || []).find((a) => a.name && a.name.toLowerCase().endsWith('.zip'));
      const url = asset ? asset.browser_download_url : '';
      await chrome.storage.local.set({ update: { available: true, version: remote, url } });
      if (!prev || prev.version !== remote) {
        const lang = TAi18n.resolveLang(store.settings);
        notify(TAi18n.t(lang, 'notif.update.title'), TAi18n.t(lang, 'notif.update.body', { v: remote }));
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
    if (sender.tab && sender.tab.id != null) queueMute(sender.tab.id, !!msg.hidden);
    return false;
  }
  if (msg.type === 'watch') { handleWatch(msg, sender); return false; }
  if (msg.type === 'inprogress') { handleInProgress(msg); return false; }
  if (msg.type === 'inventoryReload') { reloadInventoryTabs(); return false; }
  if (msg.type === 'pruneHistory') { pruneHistoryNow(); return false; }
  // Reset et import des compteurs : demandes par le popup SEUL, et ecrites dans la meme file
  // que les claims (sinon un battement d'onglet concurrent pouvait ressusciter les compteurs).
  // Bouton "Regarder une chaine participante" du popup.
  if (msg.type === 'watchCampaign') {
    if (!sender.url || !sender.url.startsWith(chrome.runtime.getURL(''))) return false;
    if (typeof msg.slug === 'string' && /^[\w%.-]+$/.test(msg.slug)) openParticipating(msg.slug, true);
    return false;
  }
  if (msg.type === 'resetStats' || msg.type === 'importStats') {
    if (!sender.url || !sender.url.startsWith(chrome.runtime.getURL(''))) return false;
    const job = msg.type === 'resetStats' ? resetStats() : importStats(msg);
    job.then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true;
  }
  return false;
});

// Coupe ou remet le son d'un onglet. On ne remet le son que si c'est NOUS qui l'avions coupe
// (mutedInfo.reason 'extension' + notre id) : un mute choisi a la main est respecte.
// En file PAR ONGLET : "cache" puis "visible" coup sur coup (Ctrl+Tab) relisaient sinon le meme
// etat avant la premiere ecriture, et l'onglet revenu devant restait coupe.
const muteChains = new Map();
function queueMute(tabId, mute) {
  const next = (muteChains.get(tabId) || Promise.resolve()).then(() => setTabMuted(tabId, mute));
  muteChains.set(tabId, next);
  next.then(() => { if (muteChains.get(tabId) === next) muteChains.delete(tabId); });
}
async function setTabMuted(tabId, mute) {
  try {
    const tab = await chrome.tabs.get(tabId);
    const info = tab.mutedInfo || {};
    const ours = info.reason === 'extension' && info.extensionId === chrome.runtime.id;
    if (mute && !info.muted) await chrome.tabs.update(tabId, { muted: true });
    else if (!mute && info.muted && ours) await chrome.tabs.update(tabId, { muted: false });
  } catch (e) { /* onglet ferme entre-temps */ }
}

// Reinitialise compteurs et historique. Les drops en cours sont gardes : ils decrivent la
// progression actuelle, pas un cumul (sans eux la carte "Prochain drop" tombait vide).
function resetStats() {
  return enqueue(async () => {
    const { stats } = await chrome.storage.local.get('stats');
    const cur = stats || {};
    await chrome.storage.local.set({
      stats: {
        ...DEFAULT_STATS, byChannel: {}, heartbeats: {}, watchByGame: {}, progress: {}, stuck: [], autoWatchTs: {},
        inProgress: cur.inProgress || [], inProgressTs: cur.inProgressTs || null
      },
      history: []
    });
    await chrome.storage.local.remove('lastError');
  });
}

// Import des compteurs et de l'historique d'une sauvegarde (valeurs filtrees par TAUtil).
function importStats(msg) {
  return enqueue(async () => {
    const { stats } = await chrome.storage.local.get('stats');
    const patch = {};
    if (msg.stats && typeof msg.stats === 'object') {
      const cur = { ...DEFAULT_STATS, ...(stats || {}) };
      // Le suivi des drops bloques repart de zero : le temps importe ne doit pas faire passer
      // d'un coup tous les drops immobiles pour bloques.
      patch.stats = { ...cur, ...TAUtil.sanitizeStats(msg.stats), progress: {}, stuck: [] };
    }
    if (Array.isArray(msg.history)) patch.history = TAUtil.sanitizeHistory(msg.history, HISTORY_MAX);
    if (Object.keys(patch).length) await chrome.storage.local.set(patch);
  });
}

function handleClaim(msg) {
  return enqueue(async () => {
    const data = await chrome.storage.local.get(['stats', 'settings', 'history']);
    const s = { ...DEFAULT_STATS, ...(data.stats || {}) };
    const settings = data.settings || {};
    const history = Array.isArray(data.history) ? data.history : [];
    const now = Date.now();
    const lang = TAi18n.resolveLang(settings);

    if (msg.kind === 'points') {
      const before = s.pointsValue;
      s.pointsClaimed += 1;
      s.pointsValue += (msg.amount || 0);
      s.lastPointsClaim = now;
      const crossed = Math.floor(s.pointsValue / POINTS_NOTIFY_STEP) > Math.floor(before / POINTS_NOTIFY_STEP);
      if (crossed) {
        history.push({ type: 'points', amount: s.pointsValue, ts: now });
        if (settings.notifications) notify(TAi18n.t(lang, 'notif.points.title'), TAi18n.t(lang, 'notif.points.body', { n: s.pointsValue }));
      }
    } else if (msg.kind === 'drop') {
      s.dropsClaimed += 1;
      s.lastDropsClaim = now;
      // game / campaign servent au regroupement dans l'historique. Champs OPTIONNELS : les
      // entrees d'avant la v1.12 et les claims sans categorie lisible n'en ont pas, et le
      // popup les range alors dans un groupe "sans jeu" au lieu de les perdre.
      const entry = { type: 'drop', name: msg.name || '', ts: now };
      if (msg.game) entry.game = msg.game;
      if (msg.campaign) entry.campaign = msg.campaign;
      history.push(entry);
      if (settings.notifications) {
        const body = msg.name ? TAi18n.t(lang, 'notif.drop.bodyNamed', { name: msg.name }) : TAi18n.t(lang, 'notif.drop.bodyAnon');
        notify(TAi18n.t(lang, 'notif.drop.title'), body);
      }
    }

    // Agregation par chaine.
    const ch = msg.channel || '';
    if (ch) {
      s.byChannel = s.byChannel || {};
      const c = s.byChannel[ch] || { points: 0, drops: 0, seconds: 0 };
      if (msg.kind === 'points') c.points += (msg.amount || 0);
      else if (msg.kind === 'drop') c.drops += 1;
      s.byChannel[ch] = c;
    }

    if (history.length > HISTORY_MAX) history.splice(0, history.length - HISTORY_MAX);
    const pruned = TAUtil.pruneHistory(history, now, settings.historyTtlMin);
    await chrome.storage.local.set({ stats: s, history: pruned });
  });
}

function handleWatch(msg, sender) {
  return enqueue(async () => {
    const { stats } = await chrome.storage.local.get('stats');
    const s = { ...DEFAULT_STATS, ...(stats || {}) };
    const now = Date.now();
    const sec = Math.max(0, Math.min(120, msg.seconds || 0)); // borne de securite
    s.watchSeconds = (s.watchSeconds || 0) + sec;
    // Temps de lecture PAR JEU (alerte "drop bloque" : un drop n'est juge que sur son jeu).
    if (sec && typeof msg.gameSlug === 'string' && /^[\w%.-]{1,80}$/.test(msg.gameSlug) && msg.gameSlug !== '__proto__') {
      s.watchByGame = { ...(s.watchByGame || {}) };
      // Lecture "propre" : un jeu nomme "constructor" ne doit pas lire Object.prototype.
      const prevSec = Object.prototype.hasOwnProperty.call(s.watchByGame, msg.gameSlug) ? Number(s.watchByGame[msg.gameSlug]) || 0 : 0;
      s.watchByGame[msg.gameSlug] = prevSec + sec;
    }
    const ch = msg.channel || '';
    if (ch) {
      s.byChannel = s.byChannel || {};
      const c = s.byChannel[ch] || { points: 0, drops: 0, seconds: 0 };
      c.seconds += sec;
      s.byChannel[ch] = c;
    }
    // Onglets actifs : dernier battement par onglet, purge des vieux.
    s.heartbeats = s.heartbeats || {};
    if (sender.tab && sender.tab.id != null) s.heartbeats[sender.tab.id] = now;
    for (const k in s.heartbeats) { if (now - s.heartbeats[k] > 150000) delete s.heartbeats[k]; }
    await chrome.storage.local.set({ stats: s });
  });
}

function handleInProgress(msg) {
  return enqueue(async () => {
    const { stats } = await chrome.storage.local.get('stats');
    const s = { ...DEFAULT_STATS, ...(stats || {}) };
    const list = Array.isArray(msg.list) ? msg.list.slice(0, 12) : [];
    const now = Date.now();
    // Au reload de l'inventaire, la page renvoie brievement 0 drop : on ignore ce vidage
    // transitoire tant qu'on a eu une liste non vide il y a moins de 6 min.
    if (list.length === 0 && s.inProgressTs && now - s.inProgressTs < 6 * 60 * 1000) return;
    // Suivi de progression : un drop dont le % ne bouge plus alors qu'un stream joue est bloque.
    // Page inventaire figee (module drops coupe : plus de rechargement) -> rien n'est juge.
    const pageFresh = typeof msg.pageAge !== 'number' || msg.pageAge < 10 * 60 * 1000;
    const tracked = TAUtil.trackProgress(s.progress || {}, list, now, s.watchByGame || {});
    const progress = tracked.progress;
    const stuck = pageFresh ? tracked.stuck : [];
    const fresh = stuck.filter((x) => x.fresh);
    if (fresh.length) {
      const { settings = {} } = await chrome.storage.local.get('settings');
      const lang = TAi18n.resolveLang(settings);
      // Une notification par CAMPAGNE (ses drops avancent ensemble : une seule cause).
      const seen = new Set();
      fresh.forEach((x) => {
        progress[x.key].notified = true;
        const camp = x.game + '|' + x.campaign;
        if (seen.has(camp)) return;
        seen.add(camp);
        if (settings.notifications !== false) {
          notify(TAi18n.t(lang, 'notif.stuck.title'), TAi18n.t(lang, 'notif.stuck.body', { name: x.name || x.campaign || x.game, n: x.watchedMin }));
        }
        // Option : ouvrir une chaine participante, au plus une fois par jeu et par heure.
        s.autoWatchTs = { ...(s.autoWatchTs || {}) };
        if (settings.autoWatch === true && x.gameSlug && now - (s.autoWatchTs[x.gameSlug] || 0) > AUTO_WATCH_GAP) {
          s.autoWatchTs[x.gameSlug] = now;
          openParticipating(x.gameSlug, false, {
            title: TAi18n.t(lang, 'notif.watch.title'),
            message: TAi18n.t(lang, 'notif.watch.body', { game: x.game || x.campaign || x.name })
          });
        }
      });
    }
    // 'since' (et non des minutes) : la vue ne change qu'a l'apparition ou la fin d'un blocage.
    const stuckView = stuck.map(({ key, name, game, campaign, gameSlug, since }) => ({ key, name, game, campaign, gameSlug, since }));
    // Liste identique et rien de nouveau : on ne reecrit pas 'stats' pour rien (chaque ecriture
    // fait re-rendre le popup ouvert), sauf pour rafraichir la date du releve toutes les 5 min.
    const same = JSON.stringify(list) === JSON.stringify(s.inProgress || []) &&
      JSON.stringify(stuckView) === JSON.stringify(s.stuck || []);
    if (same && !fresh.length && list.length && s.inProgressTs && now - s.inProgressTs < 5 * 60 * 1000) return;
    s.inProgress = list;
    s.progress = progress;
    s.stuck = stuckView;
    if (list.length) s.inProgressTs = now;
    await chrome.storage.local.set({ stats: s });
  });
}

// Purge de l'historique demandee par le popup. Passe par la file enqueue (comme toutes les
// ecritures de history) pour eviter un read-modify-write concurrent avec handleClaim.
function pruneHistoryNow() {
  return enqueue(async () => {
    const { settings = {}, history = [] } = await chrome.storage.local.get(['settings', 'history']);
    const pruned = TAUtil.pruneHistory(history, Date.now(), settings.historyTtlMin);
    if (pruned.length !== history.length) await chrome.storage.local.set({ history: pruned });
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
