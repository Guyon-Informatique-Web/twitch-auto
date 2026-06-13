// Pilote du popup : affiche compteurs/reglages, ecrit les toggles, reset, ouvre l'inventaire.
// Icones : jeu Lucide / Feather (licence ISC/MIT).

// [cle de reglage, libelle, contenu SVG de l'icone (24x24, stroke)]
const FEATURES = [
  ['points', 'Points', '<path d="M6 3h12l4 6-10 13L2 9Z"/><path d="M11 3 8 9l4 13 4-13-3-6"/><path d="M2 9h20"/>'],
  ['drops', 'Drops', '<polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>'],
  ['reload', 'Reload auto', '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>'],
  ['lowQuality', 'Qualite mini', '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>'],
  ['antiAfk', 'Anti-AFK', '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'],
  ['muteBackground', 'Mute fond', '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>'],
  ['notifications', 'Notifications', '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>']
];
const EMPTY_STATS = { pointsClaimed: 0, pointsValue: 0, lastPointsClaim: null, dropsClaimed: 0, lastDropsClaim: null };

// Construit une icone SVG Lucide a partir de son contenu (sans innerHTML).
function makeIcon(inner) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '15');
  svg.setAttribute('height', '15');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('class', 'fic');
  svg.setAttribute('aria-hidden', 'true');
  const parsed = new DOMParser().parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg">${inner}</svg>`, 'image/svg+xml');
  Array.from(parsed.documentElement.childNodes).forEach((n) => svg.appendChild(document.importNode(n, true)));
  return svg;
}

async function load() {
  const { settings = {}, stats = {}, lastError } = await chrome.storage.local.get(['settings', 'stats', 'lastError']);
  const now = Date.now();

  document.getElementById('master').checked = settings.enabled !== false;
  document.body.classList.toggle('off', settings.enabled === false);

  document.getElementById('points-value').textContent = TAUtil.formatCompact(stats.pointsValue || 0);
  document.getElementById('points-last').textContent = TAUtil.formatRelativeTime(stats.lastPointsClaim, now);
  document.getElementById('drops-value').textContent = TAUtil.formatCompact(stats.dropsClaimed || 0);
  document.getElementById('drops-last').textContent = TAUtil.formatRelativeTime(stats.lastDropsClaim, now);

  const wrap = document.getElementById('features');
  wrap.replaceChildren();
  FEATURES.forEach(([key, label, icon]) => {
    const row = document.createElement('label');
    row.className = 'feature';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = settings[key] !== false;
    cb.addEventListener('change', () => update(key, cb.checked));
    const span = document.createElement('span');
    span.textContent = label;
    row.append(cb, makeIcon(icon), span);
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

// Rafraichit le popup en direct quand les compteurs/reglages changent (popup ouvert).
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.stats || changes.settings || changes.lastError)) load();
});

load();
