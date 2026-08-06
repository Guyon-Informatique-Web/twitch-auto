// Pilote du popup : compteurs, prochain drop, onglets en direct, reglages, historique,
// sauvegarde (export / import), reset, inventaire, MAJ, langue.
// Icones : jeu Lucide / Feather (licence ISC/MIT).

const ICONS = {
  gem: '<path d="M6 3h12l4 6-10 13L2 9Z"/><path d="M11 3 8 9l4 13 4-13-3-6"/><path d="M2 9h20"/>',
  gift: '<polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>',
  reload: '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
  quality: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  mute: '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>',
  bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
  shuffle: '<polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/>',
  play: '<polygon points="5 3 19 12 5 21 5 3"/>',
  package: '<line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
  monitor: '<rect x="2" y="4" width="20" height="15" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="2" y1="9" x2="22" y2="9"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'
};

// [cle de reglage, icone] ; libelle et infobulle viennent du dictionnaire i18n (feat.<cle>).
const FEATURES = [
  ['points', ICONS.gem],
  ['drops', ICONS.gift],
  ['reload', ICONS.reload],
  ['lowQuality', ICONS.quality],
  ['antiAfk', ICONS.eye],
  ['muteBackground', ICONS.mute],
  ['keepAlive', ICONS.play],
  ['autoInventory', ICONS.package],
  ['notifications', ICONS.bell],
  ['autoSwitch', ICONS.shuffle]
];
const EMPTY_STATS = { pointsClaimed: 0, pointsValue: 0, lastPointsClaim: null, dropsClaimed: 0, lastDropsClaim: null };
// Reglages acceptes a l'import : liste BLANCHE (un fichier bricole ne peut pas polluer le storage).
const SETTING_KEYS = FEATURES.map(([k]) => k).concat(
  ['enabled', 'tracker', 'lang', 'autoSwitchUrl', 'historyTtlMin', 'errorEndpoint']);
const RELEASES_URL = 'https://github.com/Guyon-Informatique-Web/twitch-auto/releases/latest';
const DL_PREFIX = 'https://github.com/Guyon-Informatique-Web/twitch-auto/releases/download/';
const LIVE_REFRESH_MS = 5000;   // rafraichissement de la vue "En direct" tant que le popup est ouvert
// Ordre d'affichage des cartes : les anomalies en haut (c'est ce qu'on doit voir en premier).
const STATE_ORDER = { stalled: 0, offline: 1, unreachable: 2, live: 3, paused: 4, inventory: 5, other: 6, loading: 7 };

let lastUpdate = null;   // derniere info de MAJ connue (pour le bouton telecharger)
let currentLang = 'fr';  // langue active du popup (resolue depuis settings.lang ou auto)
let lastStats = {};      // derniers compteurs charges (temps par chaine pour la vue "En direct")
let liveTimer = null;
const t = (key, vars) => TAi18n.t(currentLang, key, vars);
const plural = (n) => (n > 1 ? 's' : '');   // pluriel FR et EN ({s} dans les chaines)

// Applique les libelles statiques (attributs data-i18n*) dans la langue courante.
function applyStaticI18n() {
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle); });
  document.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
  document.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
  document.documentElement.lang = currentLang;
}

// Surligne le drapeau de la langue active.
function setLangButtons(lang) {
  document.querySelectorAll('.lang-btn').forEach((b) => {
    const on = b.dataset.lang === lang;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}

// Construit une icone SVG (sans innerHTML). extraClass : classe de couleur optionnelle.
function makeIcon(inner, extraClass, size) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size || 15));
  svg.setAttribute('height', String(size || 15));
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

// Bloc d'etat vide : une cause, une phrase, et le geste qui la corrige.
function makeEmpty(icon, title, hint, action) {
  const box = document.createElement('div');
  box.className = 'empty';
  const ic = document.createElement('span');
  ic.className = 'empty-ic';
  ic.appendChild(makeIcon(icon, null, 20));
  const b = document.createElement('b');
  b.textContent = title;
  const p = document.createElement('p');
  p.textContent = hint;
  box.append(ic, b, p);
  if (action) box.appendChild(action);
  return box;
}

function makeButton(label, className, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = className;
  btn.textContent = label;
  btn.addEventListener('click', onClick);
  return btn;
}

function fmtDuration(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h) return `${h}h${String(m).padStart(2, '0')}`;
  return `${m} min`;
}

function renderFeatures(settings) {
  const wrap = document.getElementById('features');
  wrap.replaceChildren();
  const disabled = settings.enabled === false;
  FEATURES.forEach(([key, icon]) => {
    const label = t('feat.' + key);
    const desc = t('feat.' + key + '.desc');
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

function makeHistRow(e, now) {
  const row = document.createElement('div');
  row.className = 'hist-row';
  const isDrop = e.type === 'drop';
  const label = document.createElement('span');
  label.className = 'hist-label';
  label.textContent = isDrop
    ? (TAUtil.cleanDropName(e.name) || t('hist.dropDefault'))
    : t('hist.pointsTier', { n: TAUtil.formatCompact(e.amount || 0, currentLang) });
  label.title = label.textContent; // nom complet au survol (les longs sont tronques)
  const time = document.createElement('span');
  time.className = 'hist-time';
  time.textContent = TAUtil.formatRelativeTime(e.ts, now, currentLang);
  row.append(makeIcon(isDrop ? ICONS.gift : ICONS.gem, isDrop ? 'gold' : 'cyan'), label);
  // La campagne, quand elle a pu etre lue au moment du claim, precise le drop sans le noyer.
  if (isDrop && e.campaign) {
    const camp = document.createElement('span');
    camp.className = 'hist-camp';
    camp.textContent = e.campaign;
    camp.title = e.campaign;
    row.appendChild(camp);
  }
  row.appendChild(time);
  return row;
}

function renderHistory(history, now) {
  const wrap = document.getElementById('history');
  wrap.replaceChildren();
  if (!history || !history.length) {
    wrap.appendChild(makeEmpty(ICONS.clock, t('hist.empty'), t('hist.emptyHint')));
    return;
  }
  // Plus recent en premier (on cape l'affichage a 40 lignes).
  const rows = history.slice(-40).reverse();
  const groups = TAUtil.groupHistoryByGame(rows);
  // Repli : rien d'etiquete (historique d'avant la v1.12) -> liste plate, sans intitule vide.
  if (groups.length === 1 && !groups[0].game && !groups[0].points) {
    rows.forEach((e) => wrap.appendChild(makeHistRow(e, now)));
    return;
  }
  groups.forEach((g) => {
    const head = document.createElement('div');
    head.className = 'hist-group';
    head.textContent = g.points ? t('ui.stat.points') : (g.game || t('ui.noGame'));
    wrap.appendChild(head);
    g.entries.forEach((e) => wrap.appendChild(makeHistRow(e, now)));
  });
}

// Carte "prochain drop" : celui dont l'ETA est le plus court (a defaut, le plus avance).
function renderHero(list) {
  const wrap = document.getElementById('hero');
  wrap.replaceChildren();
  const sorted = TAUtil.sortDropsByEta(list);
  // L'etat vide porte deja son bouton "Ouvrir mon inventaire" : garder celui du pied donnerait
  // deux boutons violets identiques a l'ecran.
  document.querySelector('#tab-stats .foot').hidden = !sorted.length;
  if (!sorted.length) {
    const card = document.createElement('div');
    card.className = 'hero';
    card.appendChild(makeEmpty(
      ICONS.package, t('ui.noDropTitle'), t('ui.noDropHint'),
      makeButton(t('ui.noDropCta'), 'btn', openInventory)
    ));
    const note = document.createElement('p');
    note.className = 'empty-note';
    note.textContent = t('ui.noDropAuto');
    wrap.append(card, note);
    return sorted;
  }

  const d = sorted[0];
  const pct = Math.max(0, Math.min(100, d.percent || 0));
  const card = document.createElement('div');
  card.className = 'hero';

  const eyebrow = document.createElement('div');
  eyebrow.className = 'hero-eyebrow';
  eyebrow.textContent = t('ui.nextDrop');

  const name = document.createElement('div');
  name.className = 'hero-name';
  name.textContent = d.name || t('inprog.defaultName');
  name.title = name.textContent;

  // Sous l'heure : le nombre de minutes se lit d'un coup d'oeil ; au-dela on passe en h/min.
  // Sans duree totale lisible sur l'inventaire, on retombe sur le pourcentage.
  const count = document.createElement('div');
  count.className = 'hero-count';
  const big = document.createElement('span');
  big.className = 'hero-big';
  const unit = document.createElement('span');
  unit.className = 'hero-unit';
  if (d.remainingMin != null && d.remainingMin < 60) {
    big.textContent = String(d.remainingMin);
    unit.textContent = t('ui.minutesLeft');
  } else if (d.remainingMin != null) {
    big.textContent = fmtDuration(d.remainingMin * 60);
    unit.textContent = t('ui.remaining');
  } else {
    big.textContent = pct + ' %';
    unit.textContent = t('ui.done');
  }
  count.append(big, unit);

  const bar = document.createElement('div');
  bar.className = 'hero-bar';
  const fill = document.createElement('i');
  fill.style.width = pct + '%';
  bar.appendChild(fill);

  const meta = document.createElement('div');
  meta.className = 'hero-meta';
  const left = document.createElement('span');
  left.textContent = t('ui.dropsCount', { n: sorted.length, s: plural(sorted.length) });
  const right = document.createElement('span');
  right.className = 'num';
  right.textContent = pct + ' %';
  meta.append(left, right);

  card.append(eyebrow, name, count, bar, meta);
  wrap.appendChild(card);
  return sorted;
}

// Ligne d'un drop dans un bloc de campagne : nom + % + ETA, barre fine dessous.
function makeCampDrop(d) {
  const pct = Math.max(0, Math.min(100, d.percent || 0));
  const row = document.createElement('div'); row.className = 'camp-drop';
  const line = document.createElement('div'); line.className = 'camp-line';
  const name = document.createElement('span'); name.className = 'camp-dname';
  name.textContent = d.name || t('inprog.defaultName'); name.title = name.textContent;
  const p = document.createElement('span'); p.className = 'camp-pct';
  p.textContent = pct + ' %';
  line.append(name, p);
  if (d.remainingMin != null) {
    const eta = document.createElement('span'); eta.className = 'camp-eta';
    eta.textContent = '~' + fmtDuration(d.remainingMin * 60);
    line.appendChild(eta);
  }
  const bar = document.createElement('div'); bar.className = 'camp-bar';
  const fill = document.createElement('i'); fill.style.width = pct + '%';
  bar.appendChild(fill);
  row.append(line, bar);
  return row;
}

// Drops en cours ranges par jeu puis par campagne. Repli en liste plate "Ensuite" quand
// aucun jeu n'a pu etre lu : le regroupement peut echouer, la liste des drops jamais.
function renderDropGroups(sorted) {
  const sec = document.getElementById('next-section');
  const wrap = document.getElementById('next');
  const title = document.getElementById('next-title');
  wrap.replaceChildren();
  const groups = TAUtil.groupDropsByGame(sorted);
  const flat = !groups.length || (groups.length === 1 && !groups[0].game);

  if (flat) {
    // "Ensuite" = les drops APRES celui mis en avant par la carte du haut.
    const rest = sorted.slice(1, 8);
    if (!rest.length) { sec.hidden = true; return; }
    sec.hidden = false;
    title.textContent = t('ui.next');
    rest.forEach((d) => {
      const row = document.createElement('div'); row.className = 'nx-row';
      const name = document.createElement('span'); name.className = 'nx-name';
      name.textContent = d.name || t('inprog.defaultName'); name.title = name.textContent;
      const bar = document.createElement('div'); bar.className = 'nx-bar';
      const fill = document.createElement('i');
      fill.style.width = Math.max(0, Math.min(100, d.percent || 0)) + '%';
      bar.appendChild(fill);
      const eta = document.createElement('span'); eta.className = 'nx-eta';
      eta.textContent = d.remainingMin != null ? '~' + fmtDuration(d.remainingMin * 60) : (d.percent || 0) + ' %';
      row.append(name, bar, eta);
      wrap.appendChild(row);
    });
    return;
  }

  // Vue par campagne : elle montre TOUS les drops, y compris celui de la carte du haut.
  // L'exclure fausserait le compte affiche en tete de campagne.
  sec.hidden = false;
  title.textContent = t('ui.campaigns');
  groups.forEach((g) => {
    g.campaigns.forEach((c) => {
      const box = document.createElement('div'); box.className = 'camp';
      const game = document.createElement('div'); game.className = 'camp-game';
      game.textContent = g.game || t('ui.noGame');
      game.title = game.textContent;
      const top = document.createElement('div'); top.className = 'camp-top';
      const nm = document.createElement('span'); nm.className = 'camp-name';
      nm.textContent = c.campaign; nm.title = c.campaign;
      const count = document.createElement('span'); count.className = 'camp-count';
      // "n/m" seulement quand le tracker a vu des recompenses terminees dans le bloc ;
      // sinon on affiche ce qu'on a mesure : le nombre de drops encore en cours.
      count.textContent = (c.done != null && c.total != null)
        ? `${c.done}/${c.total}`
        : t('ui.campInProgress', { n: c.drops.length });
      top.append(nm, count);
      box.append(game, top);
      c.drops.forEach((d) => box.appendChild(makeCampDrop(d)));
      wrap.appendChild(box);
    });
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
    const av = document.createElement('span'); av.className = 'ch-av';
    av.textContent = (c.name[0] || '?').toUpperCase();
    const name = document.createElement('span'); name.className = 'ch-name';
    name.textContent = c.name; name.title = c.name;
    const stat = document.createElement('span'); stat.className = 'ch-stat';
    const parts = [];
    if (c.points) parts.push(TAUtil.formatCompact(c.points, currentLang) + ' pts');
    if (c.drops) parts.push(c.drops + ' drop' + plural(c.drops));
    stat.textContent = parts.join(' - ');
    row.append(av, name, stat);
    wrap.appendChild(row);
  });
}

// ---------------------------------------------------------------------------
// Onglet "En direct" : un instantane demande a CHAQUE onglet Twitch ouvert.
// Rien n'est stocke : la verite vient des onglets eux-memes a l'ouverture du popup.
// ---------------------------------------------------------------------------

// Interroge un onglet. Forme callback volontaire : sans recepteur (script pas encore injecte),
// la version promesse rejette et pollue la console ; ici on lit lastError et on renvoie null.
function askTab(tabId) {
  return new Promise((resolve) => {
    try {
      chrome.tabs.sendMessage(tabId, { type: 'liveState' }, (r) => {
        void chrome.runtime.lastError; // pas de recepteur = cas normal (page en chargement)
        resolve(r && !r.error ? r : null);
      });
    } catch (e) { resolve(null); }
  });
}

async function collectTabs() {
  let tabs = [];
  try { tabs = await chrome.tabs.query({ url: 'https://www.twitch.tv/*' }); } catch (e) { return []; }
  const snaps = await Promise.all(tabs.map((tab) => (tab.id != null ? askTab(tab.id) : Promise.resolve(null))));
  return tabs
    .map((tab, i) => ({ tab, snap: snaps[i], state: TAUtil.tabState(snaps[i], tab.status) }))
    .sort((a, b) => (STATE_ORDER[a.state] - STATE_ORDER[b.state]) || 0);
}

function focusTab(tab) {
  if (tab.id != null) chrome.tabs.update(tab.id, { active: true });
  if (tab.windowId != null) chrome.windows.update(tab.windowId, { focused: true });
  window.close();
}

function makeLiveCard(entry) {
  const { tab, snap, state } = entry;
  const card = document.createElement('div');
  card.className = 'lcard';
  if (TAUtil.isTabAlert(state)) card.classList.add('warn');
  else if (state === 'inventory' || state === 'other' || state === 'loading') card.classList.add('idle');

  // Ligne 1 : etat + nom.
  const top = document.createElement('div'); top.className = 'lcard-top';
  const label = document.createElement('span'); label.className = 'lcard-state';
  label.textContent = t('live.state.' + state);
  const name = document.createElement('span'); name.className = 'lcard-name';
  name.textContent = (snap && snap.channel) || tab.title || 'Twitch';
  name.title = tab.url || name.textContent;
  top.append(label, name);

  // Ligne 2 : ce qui se passe, en une phrase.
  const txt = document.createElement('p'); txt.className = 'lcard-txt';
  if (state === 'live') {
    const ch = (lastStats.byChannel || {})[snap.channel];
    txt.textContent = ch && ch.seconds
      ? `${t('live.playing')} - ${t('live.watched', { dur: fmtDuration(ch.seconds) })}`
      : t('live.playing');
  } else if (state === 'paused') {
    txt.textContent = t('live.pausedTxt');
  } else if (state === 'offline') {
    txt.textContent = t('live.offlineTxt');
  } else if (state === 'stalled') {
    const parts = [t('live.stalledTxt', { n: snap.stalledMin != null ? snap.stalledMin : '?' })];
    if (snap.reloads) parts.push(t('live.reloadsN', { n: snap.reloads, s: plural(snap.reloads) }));
    txt.textContent = parts.join(' ');
  } else if (state === 'unreachable') {
    txt.textContent = t('live.unreachableTxt');
  } else if (state === 'inventory') {
    txt.textContent = t('live.inventoryTxt');
  } else if (state === 'other') {
    txt.textContent = t('live.otherTxt');
  } else {
    txt.textContent = t('live.loadingTxt');
  }

  // Ligne 3 : ce que l'extension applique + les actions.
  const foot = document.createElement('div'); foot.className = 'lcard-foot';
  const chip = (label2) => { const c = document.createElement('span'); c.className = 'chip'; c.textContent = label2; return c; };
  if (snap && snap.lowQuality) foot.appendChild(chip('160p'));
  if (tab.mutedInfo && tab.mutedInfo.muted) foot.appendChild(chip(t('live.chip.muted')));
  if (snap && snap.enabled === false) foot.appendChild(chip(t('live.chip.off')));

  const acts = document.createElement('span'); acts.className = 'lcard-acts';
  // Recharger a du sens pour un lecteur FIGE et pour un onglet injoignable (c'est meme le
  // seul remede la). Sur une chaine hors-ligne ca ne ramene rien : le reloader exclut deja
  // cet etat pour la meme raison (cf. reloadExcludePatterns).
  if (state === 'stalled' || state === 'unreachable') {
    acts.appendChild(makeButton(t('live.reload'), 'act', () => {
      if (tab.id != null) chrome.tabs.reload(tab.id);
      loadLive();
    }));
  }
  acts.appendChild(makeButton(t('live.goTab'), 'act', () => focusTab(tab)));
  // Fermeture manuelle : utile des qu'une chaine ne rapporte plus rien. Jamais automatique.
  acts.appendChild(makeButton(t('live.close'), 'act', () => {
    if (tab.id != null) chrome.tabs.remove(tab.id);
    loadLive();
  }));
  foot.appendChild(acts);

  card.append(top, txt, foot);
  return card;
}

function renderLive(list) {
  const wrap = document.getElementById('live');
  wrap.replaceChildren();
  if (!list.length) {
    wrap.appendChild(makeEmpty(
      ICONS.monitor, t('live.emptyTitle'), t('live.emptyHint'),
      makeButton(t('live.openTwitch'), 'btn sec', () => chrome.tabs.create({ url: 'https://www.twitch.tv/' }))
    ));
    return;
  }
  list.forEach((entry) => wrap.appendChild(makeLiveCard(entry)));
}

// Pastille d'en-tete : les alertes priment sur le compte d'onglets qui farment.
function renderPill(farming, alerts) {
  const pill = document.getElementById('pill');
  if (alerts > 0) {
    pill.hidden = false;
    pill.classList.add('warn');
    pill.textContent = t('ui.pill.alerts', { n: alerts, s: plural(alerts) });
  } else if (farming > 0) {
    pill.hidden = false;
    pill.classList.remove('warn');
    pill.textContent = t('ui.pill.tabs', { n: farming, s: plural(farming) });
  } else {
    pill.hidden = true;
  }
  document.getElementById('watch-tabs').textContent =
    farming > 0 ? t('ui.pill.tabs', { n: farming, s: plural(farming) }) : '';
}

async function loadLive() {
  const list = await collectTabs();
  renderLive(list);
  renderPill(
    list.filter((x) => x.state === 'live').length,
    list.filter((x) => TAUtil.isTabAlert(x.state)).length
  );
}

// ---------------------------------------------------------------------------

async function load() {
  const { settings = {}, stats = {}, history = [], lastError, update: upd } =
    await chrome.storage.local.get(['settings', 'stats', 'history', 'lastError', 'update']);
  const now = Date.now();
  lastStats = stats;

  // Langue effective d'abord : conditionne tous les libelles ci-dessous.
  currentLang = TAi18n.resolveLang(settings);
  applyStaticI18n();
  setLangButtons(currentLang);

  // Banniere affichee seulement si la version dispo est STRICTEMENT plus recente que l'installee.
  const installed = chrome.runtime.getManifest().version;
  const banner = document.getElementById('update-banner');
  if (upd && upd.version && TAUtil.compareVersions(upd.version, installed) > 0) {
    banner.hidden = false;
    document.getElementById('update-text').textContent = t('update.bannerNew', { v: upd.version });
    lastUpdate = upd;
  } else {
    banner.hidden = true;
    lastUpdate = null;
  }

  document.getElementById('master').checked = settings.enabled !== false;
  document.body.classList.toggle('off', settings.enabled === false);

  document.getElementById('points-value').textContent = TAUtil.formatCompact(stats.pointsValue || 0, currentLang);
  document.getElementById('points-last').textContent = TAUtil.formatRelativeTime(stats.lastPointsClaim, now, currentLang);
  document.getElementById('drops-value').textContent = TAUtil.formatCompact(stats.dropsClaimed || 0, currentLang);
  document.getElementById('drops-last').textContent = TAUtil.formatRelativeTime(stats.lastDropsClaim, now, currentLang);
  document.getElementById('watch-value').textContent = fmtDuration(stats.watchSeconds);

  renderFeatures(settings);
  renderDropGroups(renderHero(stats.inProgress || []));
  renderChannels(stats.byChannel || {});
  // Vidage auto de l'historique : on filtre a l'affichage (meme sans nouveau claim) et, si des
  // entrees ont expire, on demande au background de persister la purge (ecriture serialisee via
  // enqueue -> pas de course avec un claim concurrent ; le popup n'ecrit jamais history lui-meme).
  const prunedHistory = TAUtil.pruneHistory(history, now, settings.historyTtlMin);
  if (prunedHistory.length !== history.length) {
    try {
      const p = chrome.runtime.sendMessage({ type: 'pruneHistory' });
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (e) { /* contexte invalide */ }
  }
  renderHistory(prunedHistory, now);

  // Ligne URL de l'auto-switch (visible seulement si le toggle est actif).
  document.getElementById('autoswitch-row').hidden = settings.autoSwitch !== true;
  const asInput = document.getElementById('autoswitch-url');
  if (document.activeElement !== asInput) asInput.value = settings.autoSwitchUrl || '';

  const histInput = document.getElementById('history-ttl');
  if (document.activeElement !== histInput) histInput.value = settings.historyTtlMin || '';

  document.getElementById('diag').textContent = lastError
    ? t('diag.lastError', { module: lastError.module, message: lastError.message })
    : '';
}

async function update(key, val) {
  const { settings = {} } = await chrome.storage.local.get('settings');
  settings[key] = val;
  await chrome.storage.local.set({ settings });
  load();
}

function openInventory() {
  chrome.tabs.create({ url: 'https://www.twitch.tv/drops/inventory' });
}

document.getElementById('update-dl').addEventListener('click', () => {
  // On ne telecharge que depuis une URL de release de NOTRE repo (sinon on ouvre la page).
  if (lastUpdate && lastUpdate.url && lastUpdate.url.startsWith(DL_PREFIX)) {
    chrome.downloads.download({ url: lastUpdate.url });
    document.getElementById('update-hint').textContent = t('update.downloaded');
  } else {
    chrome.tabs.create({ url: RELEASES_URL });
  }
});

document.getElementById('autoswitch-url').addEventListener('change', (e) => update('autoSwitchUrl', e.target.value.trim()));

// Vidage auto de l'historique : champ vide ou <= 0 -> 0 (desactive, n'efface rien).
document.getElementById('history-ttl').addEventListener('change', (e) => {
  const n = parseInt(e.target.value, 10);
  update('historyTtlMin', Number.isFinite(n) && n > 0 ? n : 0);
});

// Choix de la langue : clic sur un drapeau -> enregistre settings.lang et recharge.
document.querySelectorAll('.lang-btn').forEach((b) => {
  b.addEventListener('click', () => update('lang', b.dataset.lang));
});

document.getElementById('diag-test-btn').addEventListener('click', async () => {
  const out = document.getElementById('diag-result');
  out.textContent = t('diag.running');
  let tab;
  try { [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); } catch (e) { /* */ }
  if (!tab || !/^https:\/\/www\.twitch\.tv\//.test(tab.url || '')) {
    out.textContent = t('diag.needTwitch');
    return;
  }
  try {
    const r = await chrome.tabs.sendMessage(tab.id, { type: 'diagnose' });
    if (!r) { out.textContent = t('diag.noResponse'); return; }
    const yn = (b) => (b ? t('diag.ok') : t('diag.missing'));
    out.textContent = t('diag.result', {
      points: yn(r.points), balance: yn(r.pointsBalance),
      dropSel: yn(r.dropSelector), dropText: yn(r.dropText),
      overlay: yn(r.playerOverlay), bars: r.progressBars
    });
  } catch (e) {
    out.textContent = t('diag.noResponse');
  }
});
document.getElementById('master').addEventListener('change', (e) => update('enabled', e.target.checked));
document.getElementById('open-inventory').addEventListener('click', openInventory);

// ---------------------------------------------------------------------------
// Sauvegarde : un seul fichier JSON pour reglages + compteurs + historique.
// ---------------------------------------------------------------------------

document.getElementById('export').addEventListener('click', async () => {
  const { settings = {}, stats = {}, history = [] } = await chrome.storage.local.get(['settings', 'stats', 'history']);
  const payload = JSON.stringify({ exportedAt: new Date().toISOString(), settings, stats, history }, null, 2);
  const url = 'data:application/json;charset=utf-8,' + encodeURIComponent(payload);
  chrome.downloads.download({ url, filename: 'twitch-auto-sauvegarde.json' });
});

const importResult = document.getElementById('import-result');
const importInput = document.getElementById('import-file');
let pendingStats = null;   // compteurs en attente de confirmation (import en deux temps)

function showImport(msg, kind) {
  importResult.textContent = msg;
  importResult.className = 'bk-result' + (kind ? ' ' + kind : '');
}

// Applique les REGLAGES tout de suite (sans risque), et met les compteurs en attente : ecraser
// 27 000 points par megarde n'est pas rattrapable, donc ca demande un second clic explicite.
async function applyImport(data) {
  if (!data || typeof data !== 'object' || (!data.settings && !data.stats && !data.history)) {
    showImport(t('ui.importErr'), 'err');
    return;
  }
  let n = 0;
  if (data.settings && typeof data.settings === 'object') {
    const { settings = {} } = await chrome.storage.local.get('settings');
    SETTING_KEYS.forEach((k) => {           // liste blanche : on ignore tout le reste du fichier
      if (Object.prototype.hasOwnProperty.call(data.settings, k)) { settings[k] = data.settings[k]; n += 1; }
    });
    await chrome.storage.local.set({ settings });
  }
  const hasStats = (data.stats && typeof data.stats === 'object') || Array.isArray(data.history);
  if (hasStats) {
    pendingStats = { stats: data.stats, history: data.history };
    showImport(t('ui.importAsk'), 'ask');
  } else {
    pendingStats = null;
    showImport(t('ui.importOk', { n }));
  }
  load();
}

// Second clic sur le message : la, on ecrase compteurs et historique.
importResult.addEventListener('click', async () => {
  if (!pendingStats) return;
  const patch = {};
  if (pendingStats.stats && typeof pendingStats.stats === 'object') patch.stats = pendingStats.stats;
  if (Array.isArray(pendingStats.history)) patch.history = pendingStats.history;
  pendingStats = null;
  await chrome.storage.local.set(patch);
  showImport(t('ui.importOkStats'));
  load();
});

function readImportFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    let data = null;
    try { data = JSON.parse(String(reader.result)); } catch (e) { data = null; }
    applyImport(data);
  };
  reader.onerror = () => showImport(t('ui.importErr'), 'err');
  reader.readAsText(file);
}

document.getElementById('import').addEventListener('click', () => importInput.click());
importInput.addEventListener('change', (e) => {
  readImportFile(e.target.files && e.target.files[0]);
  e.target.value = ''; // reimporter deux fois le meme fichier doit redeclencher le change
});

// Glisser-deposer sur le bloc Sauvegarde : selon la plateforme, ouvrir le selecteur de fichier
// peut fermer le popup (perte de focus). Le drop, lui, marche toujours.
const backup = document.querySelector('.backup');
backup.addEventListener('dragover', (e) => { e.preventDefault(); });
backup.addEventListener('drop', (e) => {
  e.preventDefault();
  readImportFile(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]);
});

// Reset en deux temps (evite d'effacer compteurs + historique par megarde).
let resetArmed = false;
let resetTimer = null;
const resetBtn = document.getElementById('reset');
function disarmReset() { resetArmed = false; resetBtn.textContent = t('ui.reset'); }
resetBtn.addEventListener('click', async () => {
  if (!resetArmed) {
    resetArmed = true;
    resetBtn.textContent = t('ui.resetConfirm');
    resetTimer = setTimeout(disarmReset, 3000);
    return;
  }
  clearTimeout(resetTimer);
  disarmReset();
  await chrome.storage.local.set({ stats: { ...EMPTY_STATS }, history: [] });
  load();
});

document.getElementById('version').textContent = 'v' + chrome.runtime.getManifest().version;

// Onglets : Stats / En direct / Historique / Reglages.
function showTab(name) {
  document.querySelectorAll('.tab').forEach((tab) => {
    const on = tab.dataset.tab === name;
    tab.classList.toggle('active', on);
    tab.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  ['stats', 'live', 'history', 'settings'].forEach((n) => {
    document.getElementById('tab-' + n).hidden = (n !== name);
  });
  if (name === 'live') loadLive(); // etat frais des l'affichage, sans attendre le prochain tick
}
document.querySelectorAll('.tab').forEach((tab) => tab.addEventListener('click', () => showTab(tab.dataset.tab)));
showTab('stats');

// Rafraichit le popup en direct quand compteurs/reglages/historique/MAJ changent.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.stats || changes.settings || changes.history || changes.lastError || changes.update)) load();
});

// Premier rendu : libelles dans la langue auto avant meme le retour du storage (anti-flash),
// puis load() affine avec le choix explicite eventuel (settings.lang).
currentLang = TAi18n.detectLang();
applyStaticI18n();
setLangButtons(currentLang);
load();
loadLive();
liveTimer = setInterval(loadLive, LIVE_REFRESH_MS);
window.addEventListener('unload', () => { if (liveTimer) clearInterval(liveTimer); });
