// Pilote du popup : compteurs, reglages, historique, reset, inventaire, MAJ.
// Icones : jeu Lucide / Feather (licence ISC/MIT).

const ICONS = {
  gem: '<path d="M6 3h12l4 6-10 13L2 9Z"/><path d="M11 3 8 9l4 13 4-13-3-6"/><path d="M2 9h20"/>',
  gift: '<polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>',
  reload: '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
  quality: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  mute: '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>',
  bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
  shuffle: '<polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/>'
};

// [cle de reglage, libelle, icone, description (infobulle)]
const FEATURES = [
  ['points', 'Points', ICONS.gem, 'Reclame les coffres bonus de points de chaine.'],
  ['drops', 'Drops', ICONS.gift, 'Reclame les drops termines (inventaire + bandeau sur le stream).'],
  ['reload', 'Reload auto', ICONS.reload, 'Recharge le player quand il affiche une erreur.'],
  ['lowQuality', 'Qualite mini', ICONS.quality, 'Passe la video en 160p sur les onglets en arriere-plan.'],
  ['antiAfk', 'Anti-AFK', ICONS.eye, 'Clique les fenetres "Toujours la ?" et le contenu sensible.'],
  ['muteBackground', 'Mute fond', ICONS.mute, 'Coupe le son des onglets en arriere-plan.'],
  ['notifications', 'Notifications', ICONS.bell, 'Notification desktop sur drop / palier de points.'],
  ['autoSwitch', 'Auto-switch', ICONS.shuffle, 'Bascule vers une chaine de repli si le stream passe hors-ligne (regle l URL ci-dessous).']
];
const EMPTY_STATS = { pointsClaimed: 0, pointsValue: 0, lastPointsClaim: null, dropsClaimed: 0, lastDropsClaim: null };
const RELEASES_URL = 'https://github.com/Guyon-Informatique-Web/twitch-auto/releases/latest';
const DL_PREFIX = 'https://github.com/Guyon-Informatique-Web/twitch-auto/releases/download/';
let lastUpdate = null; // derniere info de MAJ connue (pour le bouton telecharger)

// Construit une icone SVG (sans innerHTML). extraClass : classe de couleur optionnelle.
function makeIcon(inner, extraClass) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '15');
  svg.setAttribute('height', '15');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('class', extraClass ? `fic ${extraClass}` : 'fic');
  svg.setAttribute('aria-hidden', 'true');
  const parsed = new DOMParser().parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg">${inner}</svg>`, 'image/svg+xml');
  Array.from(parsed.documentElement.childNodes).forEach((n) => svg.appendChild(document.importNode(n, true)));
  return svg;
}

function renderFeatures(settings) {
  const wrap = document.getElementById('features');
  wrap.replaceChildren();
  const disabled = settings.enabled === false;
  FEATURES.forEach(([key, label, icon, desc]) => {
    const row = document.createElement('label');
    row.className = 'feature';
    if (desc) row.title = desc;
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = settings[key] !== false;
    cb.disabled = disabled; // vraiment desactive (clavier inclus) quand l'extension est off
    if (desc) cb.setAttribute('aria-label', `${label} : ${desc}`);
    cb.addEventListener('change', () => update(key, cb.checked));
    const span = document.createElement('span');
    span.textContent = label;
    row.append(cb, makeIcon(icon), span);
    wrap.appendChild(row);
  });
}

function renderHistory(history, now) {
  const wrap = document.getElementById('history');
  wrap.replaceChildren();
  if (!history || !history.length) {
    const p = document.createElement('p');
    p.className = 'hist-empty';
    p.textContent = 'Rien encore reclame';
    wrap.appendChild(p);
    return;
  }
  // Plus recent en premier (on cape l'affichage a 40 lignes).
  history.slice(-40).reverse().forEach((e) => {
    const row = document.createElement('div');
    row.className = 'hist-row';
    const isDrop = e.type === 'drop';
    const label = document.createElement('span');
    label.className = 'hist-label';
    label.textContent = isDrop
      ? (e.name || 'Drop reclame')
      : `Palier ${TAUtil.formatCompact(e.amount || 0)} points`;
    label.title = label.textContent; // nom complet au survol (les longs sont tronques)
    const time = document.createElement('span');
    time.className = 'hist-time';
    time.textContent = TAUtil.formatRelativeTime(e.ts, now);
    row.append(makeIcon(isDrop ? ICONS.gift : ICONS.gem, isDrop ? 'gold' : 'cyan'), label, time);
    wrap.appendChild(row);
  });
}

function fmtDuration(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h) return `${h}h${String(m).padStart(2, '0')}`;
  return `${m} min`;
}

function renderMeta(stats) {
  const now = Date.now();
  const hb = stats.heartbeats || {};
  let active = 0;
  for (const k in hb) { if (now - hb[k] < 150000) active += 1; }
  const s = active > 1 ? 's' : '';
  document.getElementById('meta').textContent =
    `${fmtDuration(stats.watchSeconds)} de visionnage - ${active} onglet${s} actif${s}`;
}

function renderInProgress(list) {
  const sec = document.getElementById('inprogress-section');
  const wrap = document.getElementById('inprogress');
  wrap.replaceChildren();
  if (!list || !list.length) { sec.hidden = true; return; }
  sec.hidden = false;
  list.slice(0, 8).forEach((d) => {
    const row = document.createElement('div'); row.className = 'ip-row';
    const name = document.createElement('span'); name.className = 'ip-name';
    name.textContent = d.name || 'Drop'; name.title = name.textContent;
    const bar = document.createElement('div'); bar.className = 'ip-bar';
    const fill = document.createElement('div'); fill.className = 'ip-fill';
    fill.style.width = Math.max(0, Math.min(100, d.percent || 0)) + '%';
    bar.appendChild(fill);
    const pct = document.createElement('span'); pct.className = 'ip-pct';
    pct.textContent = (d.percent || 0) + '%';
    row.append(name, bar, pct);
    wrap.appendChild(row);
  });
}

function renderChannels(byChannel) {
  const sec = document.getElementById('channels-section');
  const wrap = document.getElementById('channels');
  wrap.replaceChildren();
  const entries = Object.entries(byChannel || {})
    .map(([name, c]) => ({ name, points: c.points || 0, drops: c.drops || 0, seconds: c.seconds || 0 }))
    .filter((c) => c.points || c.drops || c.seconds)
    .sort((a, b) => (b.drops - a.drops) || (b.points - a.points) || (b.seconds - a.seconds))
    .slice(0, 5);
  if (!entries.length) { sec.hidden = true; return; }
  sec.hidden = false;
  entries.forEach((c) => {
    const row = document.createElement('div'); row.className = 'ch-row';
    const name = document.createElement('span'); name.className = 'ch-name';
    name.textContent = c.name; name.title = c.name;
    const stat = document.createElement('span'); stat.className = 'ch-stat';
    const parts = [];
    if (c.points) parts.push(TAUtil.formatCompact(c.points) + ' pts');
    if (c.drops) parts.push(c.drops + ' drop' + (c.drops > 1 ? 's' : ''));
    stat.textContent = parts.join(' - ');
    row.append(name, stat);
    wrap.appendChild(row);
  });
}

async function load() {
  const { settings = {}, stats = {}, history = [], lastError, update: upd } =
    await chrome.storage.local.get(['settings', 'stats', 'history', 'lastError', 'update']);
  const now = Date.now();

  // Banniere affichee seulement si la version dispo est STRICTEMENT plus recente que l'installee.
  const installed = chrome.runtime.getManifest().version;
  const banner = document.getElementById('update-banner');
  if (upd && upd.version && TAUtil.compareVersions(upd.version, installed) > 0) {
    banner.hidden = false;
    document.getElementById('update-text').textContent = `Nouvelle version v${upd.version} dispo`;
    lastUpdate = upd;
  } else {
    banner.hidden = true;
    lastUpdate = null;
  }

  document.getElementById('master').checked = settings.enabled !== false;
  document.body.classList.toggle('off', settings.enabled === false);

  document.getElementById('points-value').textContent = TAUtil.formatCompact(stats.pointsValue || 0);
  document.getElementById('points-last').textContent = TAUtil.formatRelativeTime(stats.lastPointsClaim, now);
  document.getElementById('drops-value').textContent = TAUtil.formatCompact(stats.dropsClaimed || 0);
  document.getElementById('drops-last').textContent = TAUtil.formatRelativeTime(stats.lastDropsClaim, now);

  renderFeatures(settings);
  renderMeta(stats);
  renderInProgress(stats.inProgress || []);
  renderChannels(stats.byChannel || {});
  renderHistory(history, now);

  // Ligne URL de l'auto-switch (visible seulement si le toggle est actif).
  document.getElementById('autoswitch-row').hidden = settings.autoSwitch !== true;
  const asInput = document.getElementById('autoswitch-url');
  if (document.activeElement !== asInput) asInput.value = settings.autoSwitchUrl || '';

  document.getElementById('diag').textContent = lastError
    ? `Derniere erreur (${lastError.module}) : ${lastError.message}`
    : '';
}

async function update(key, val) {
  const { settings = {} } = await chrome.storage.local.get('settings');
  settings[key] = val;
  await chrome.storage.local.set({ settings });
  load();
}

document.getElementById('update-dl').addEventListener('click', () => {
  // On ne telecharge que depuis une URL de release de NOTRE repo (sinon on ouvre la page).
  if (lastUpdate && lastUpdate.url && lastUpdate.url.startsWith(DL_PREFIX)) {
    chrome.downloads.download({ url: lastUpdate.url });
    document.getElementById('update-hint').textContent =
      "Telecharge ! Dezippe par-dessus ton dossier, puis recharge l'extension.";
  } else {
    chrome.tabs.create({ url: RELEASES_URL });
  }
});

document.getElementById('autoswitch-url').addEventListener('change', (e) => update('autoSwitchUrl', e.target.value.trim()));
document.getElementById('master').addEventListener('change', (e) => update('enabled', e.target.checked));
document.getElementById('open-inventory').addEventListener('click', () =>
  chrome.tabs.create({ url: 'https://www.twitch.tv/drops/inventory' }));

// Export des compteurs + historique en JSON (sauvegarde).
document.getElementById('export').addEventListener('click', async () => {
  const { stats = {}, history = [] } = await chrome.storage.local.get(['stats', 'history']);
  const payload = JSON.stringify({ exportedAt: new Date().toISOString(), stats, history }, null, 2);
  const url = 'data:application/json;charset=utf-8,' + encodeURIComponent(payload);
  chrome.downloads.download({ url, filename: 'twitch-auto-historique.json' });
});

// Reset en deux temps (evite d'effacer compteurs + historique par megarde).
let resetArmed = false;
let resetTimer = null;
const resetBtn = document.getElementById('reset');
function disarmReset() { resetArmed = false; resetBtn.textContent = 'reinitialiser'; }
resetBtn.addEventListener('click', async () => {
  if (!resetArmed) {
    resetArmed = true;
    resetBtn.textContent = 'Confirmer ? (efface tout)';
    resetTimer = setTimeout(disarmReset, 3000);
    return;
  }
  clearTimeout(resetTimer);
  disarmReset();
  await chrome.storage.local.set({ stats: { ...EMPTY_STATS }, history: [] });
  load();
});

document.getElementById('version').textContent = 'v' + chrome.runtime.getManifest().version;

// Rafraichit le popup en direct quand compteurs/reglages/historique/MAJ changent.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.stats || changes.settings || changes.history || changes.lastError || changes.update)) load();
});

load();
