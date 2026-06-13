// Pilote du popup : affiche compteurs/reglages, ecrit les toggles, reset, ouvre l'inventaire.
const FEATURES = [
  ['points', 'Points de chaine'],
  ['drops', 'Drops'],
  ['reload', 'Reload auto'],
  ['lowQuality', 'Qualite mini'],
  ['antiAfk', 'Anti "Toujours la"'],
  ['muteBackground', 'Mute fond'],
  ['notifications', 'Notifications']
];
const EMPTY_STATS = { pointsClaimed: 0, pointsValue: 0, lastPointsClaim: null, dropsClaimed: 0, lastDropsClaim: null };

async function load() {
  const { settings = {}, stats = {}, lastError } = await chrome.storage.local.get(['settings', 'stats', 'lastError']);
  const now = Date.now();

  document.getElementById('master').checked = settings.enabled !== false;
  document.body.classList.toggle('off', settings.enabled === false);

  document.getElementById('points-value').textContent = (stats.pointsValue || 0).toLocaleString('fr-FR');
  document.getElementById('points-last').textContent = TAUtil.formatRelativeTime(stats.lastPointsClaim, now);
  document.getElementById('drops-value').textContent = (stats.dropsClaimed || 0).toLocaleString('fr-FR');
  document.getElementById('drops-last').textContent = TAUtil.formatRelativeTime(stats.lastDropsClaim, now);

  const wrap = document.getElementById('features');
  wrap.replaceChildren();
  FEATURES.forEach(([key, label]) => {
    const row = document.createElement('label');
    row.className = 'feature';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = settings[key] !== false;
    cb.addEventListener('change', () => update(key, cb.checked));
    const span = document.createElement('span');
    span.textContent = label;
    row.append(cb, span);
    wrap.appendChild(row);
  });

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

document.getElementById('master').addEventListener('change', (e) => update('enabled', e.target.checked));
document.getElementById('open-inventory').addEventListener('click', () =>
  chrome.tabs.create({ url: 'https://www.twitch.tv/drops/inventory' }));
document.getElementById('reset').addEventListener('click', async () => {
  await chrome.storage.local.set({ stats: { ...EMPTY_STATS } });
  load();
});
document.getElementById('version').textContent = 'v' + chrome.runtime.getManifest().version;

load();
