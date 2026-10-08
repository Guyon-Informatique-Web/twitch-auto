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
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  warn: '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  rotate: '<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>',
  tv: '<rect x="2" y="7" width="20" height="15" rx="2"/><polyline points="17 2 12 7 7 2"/>'
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
  ['autoSwitch', ICONS.shuffle],
  ['autoReloadTabs', ICONS.rotate],
  ['autoWatch', ICONS.tv]
];
const MAX_FALLBACKS = 5;          // chaines de repli de l'auto-switch
const RELEASES_URL = 'https://github.com/Guyon-Informatique-Web/twitch-auto/releases/latest';
const DL_PREFIX = 'https://github.com/Guyon-Informatique-Web/twitch-auto/releases/download/';
const LIVE_REFRESH_MS = 5000;   // rafraichissement de la vue "En direct" tant que le popup est ouvert
// Au-dela, le releve des drops en cours est signale comme ancien (sans onglet inventaire ouvert,
// ces chiffres ne bougent plus). Le service worker le rafraichit au moins toutes les 5 min.
const STALE_MS = 15 * 60 * 1000;
const ERROR_SHOW_MS = 24 * 3600 * 1000;   // la derniere erreur n'est plus affichee apres 24 h
// Ordre d'affichage des cartes : les anomalies en haut (c'est ce qu'on doit voir en premier).
const STATE_ORDER = { stalled: 0, offline: 1, unreachable: 2, live: 3, paused: 4, inventory: 5, other: 6, loading: 7 };

let lastUpdate = null;   // derniere info de MAJ connue (pour le bouton telecharger)
let currentLang = 'fr';  // langue active du popup (resolue depuis settings.lang ou auto)
let lastStats = {};      // derniers compteurs charges (temps par chaine pour la vue "En direct")
let resetArmed = false;  // reset en deux temps (declare tot : load() relit cet etat)
let importMsg = null;    // dernier message d'import { key, vars, kind } : retraduit si la langue change
let stuckSig = '';       // signature de l'alerte "drop bloque" affichee : pas de re-rendu a l'identique
let stuckCount = 0;      // campagnes bloquees, comptees dans la pastille d'en-tete
let pillTabs = { farming: 0, alerts: 0 };   // derniers comptes d'onglets de la vue "En direct"
// Jeux dont une chaine participante a ete ouverte depuis ce popup : le bouton reste "Chaine
// ouverte" malgre les re-rendus (sinon il redevenait cliquable 30 s plus tard).
const openedSlugs = new Set();
const t = (key, vars) => TAi18n.t(currentLang, key, vars);
const plural = (n) => (n > 1 ? 's' : '');   // pluriel FR et EN ({s} dans les chaines)
const reserved = () => ((window.TA && TA.selectors && TA.selectors.notChannelPaths) || []);

// N'ecrit que si le texte change : evite de faire relire une zone a un lecteur d'ecran.
function setText(el, txt) { if (el.textContent !== txt) el.textContent = txt; }

// Applique les libelles statiques (attributs data-i18n*) dans la langue courante.
function applyStaticI18n() {
  document.querySelectorAll('[data-i18n]').forEach((el) => { setText(el, t(el.dataset.i18n)); });
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

// Re-rendu d'une zone : le bouton qui avait le focus clavier le retrouve (meme cle data-fk).
function focusedKeyIn(root) {
  const el = document.activeElement;
  return el && el !== document.body && root.contains(el) && el.dataset ? el.dataset.fk || '' : '';
}
function restoreFocus(root, key) {
  if (!key) return;
  const again = Array.from(root.querySelectorAll('[data-fk]')).find((b) => b.dataset.fk === key);
  if (again) again.focus();
}

// Bouton "Regarder une chaine participante". Son nom accessible cite le jeu et la campagne
// (plusieurs boutons identiques sinon, meme pour deux campagnes d'un meme jeu) ; apres le clic,
// il reste "Chaine ouverte", meme apres un re-rendu. aria-disabled plutot que disabled : un
// bouton desactive perdait le focus clavier.
function makeWatchButton(slug, game, campaign, className) {
  const btn = makeButton(t('ui.watchParticipating'), className, () => {
    if (openedSlugs.has(slug)) return;
    watchCampaign(slug);
    // Tous les boutons de ce jeu (alerte et campagnes) passent "Chaine ouverte".
    document.querySelectorAll('button[data-watch]').forEach((b) => { if (b.dataset.watch === slug) markWatchOpened(b); });
  });
  btn.dataset.watch = slug;
  btn.dataset.game = [game || slug, campaign].filter(Boolean).join(', ');
  btn.dataset.fk = className + ':' + slug + ':' + (campaign || '');
  btn.setAttribute('aria-label', t('ui.watchParticipatingAria', { game: btn.dataset.game }));
  if (openedSlugs.has(slug)) markWatchOpened(btn);
  return btn;
}
function markWatchOpened(btn) {
  btn.textContent = t('ui.watchOpened');
  btn.setAttribute('aria-disabled', 'true');
  btn.setAttribute('aria-label', t('ui.watchOpenedAria', { game: btn.dataset.game }));
}

function fmtDuration(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h) return `${h}h${String(m).padStart(2, '0')}`;
  return `${m} min`;
}

// Hauteur decodee -> libelle de qualite Twitch ("160p" couvre aussi les flux en 144 lignes).
function qualityLabel(h) { return h <= 180 ? '160p' : `${h}p`; }

// Les cases de reglage sont construites UNE fois, puis seulement mises a jour : les recreer a
// chaque ecriture du storage (toutes les 30 a 60 s par onglet qui farme) faisait perdre le focus.
const featureRows = new Map();   // cle -> { row, cb, span }
const OPT_IN = ['autoInventory', 'autoSwitch', 'autoWatch'];
function renderFeatures(settings) {
  const wrap = document.getElementById('features');
  const disabled = settings.enabled === false;
  FEATURES.forEach(([key, icon]) => {
    let f = featureRows.get(key);
    if (!f) {
      const row = document.createElement('label');
      row.className = 'feature';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.addEventListener('change', () => update(key, cb.checked));
      const span = document.createElement('span');
      row.append(cb, makeIcon(icon), span);
      wrap.appendChild(row);
      f = { row, cb, span };
      featureRows.set(key, f);
    }
    const label = t('feat.' + key);
    const desc = t('feat.' + key + '.desc');
    setText(f.span, label);
    f.row.title = desc || '';
    if (desc) f.cb.setAttribute('aria-label', `${label} : ${desc}`);
    // Les fonctions "opt-in" (absentes = coupees) ne doivent pas apparaitre cochees par defaut.
    f.cb.checked = OPT_IN.includes(key) ? settings[key] === true : settings[key] !== false;
    f.cb.disabled = disabled; // vraiment desactive (clavier inclus) quand l'extension est off
  });
}

// Ligne d'historique : nom + heure, puis jeu et campagne EN ENTIER sur une deuxieme ligne
// (avant, la campagne etait tronquee a 96 px sur presque chaque ligne).
function makeHistRow(e) {
  const row = document.createElement('div');
  row.className = 'hist-row';
  const isDrop = e.type === 'drop';
  const label = document.createElement('span');
  label.className = 'hist-label';
  label.textContent = isDrop
    ? (TAUtil.cleanDropName(e.name) || t('hist.dropDefault'))
    : t('hist.pointsTier', { n: TAUtil.formatCompact(e.amount || 0, currentLang) });
  label.title = label.textContent;
  const time = document.createElement('span');
  time.className = 'hist-time';
  time.textContent = typeof e.ts === 'number' ? clock(e.ts) : '';
  const sub = document.createElement('span');
  sub.className = 'hist-sub';
  sub.textContent = !isDrop ? t('hist.pointsSub')
    : e.game ? (e.campaign ? `${e.game} · ${e.campaign}` : e.game)
      : t('hist.noGameSub');
  sub.title = sub.textContent;
  row.append(makeIcon(isDrop ? ICONS.gift : ICONS.gem, isDrop ? 'gold' : 'cyan'), label, time, sub);
  return row;
}

function clock(ts) {
  return new Date(ts).toLocaleTimeString(currentLang === 'en' ? 'en-US' : 'fr-FR', { hour: '2-digit', minute: '2-digit' });
}

// Intitule d'un jour : Aujourd'hui, Hier, puis "Lundi 5 octobre".
function dayLabel(day, now) {
  if (!day) return t('hist.dayUnknown');
  if (day === TAUtil.dayKey(now)) return t('hist.today');
  const y = new Date(now); y.setDate(y.getDate() - 1);
  if (day === TAUtil.dayKey(y.getTime())) return t('hist.yesterday');
  const [yy, mm, dd] = day.split('-').map(Number);
  const txt = new Date(yy, mm - 1, dd).toLocaleDateString(currentLang === 'en' ? 'en-US' : 'fr-FR',
    { weekday: 'long', day: 'numeric', month: 'long' });
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

function renderHistory(history, now) {
  const wrap = document.getElementById('history');
  wrap.replaceChildren();
  // Entrees mal formees (sauvegarde bricolee, ancien format) : ignorees, jamais bloquantes.
  const valid = (history || []).filter((e) => e && typeof e === 'object');
  if (!valid.length) {
    wrap.appendChild(makeEmpty(ICONS.clock, t('hist.empty'), t('hist.emptyHint')));
    return;
  }
  // Plus recent en premier, range par jour (on cape l'affichage a 60 lignes).
  const rows = valid.slice(-60).reverse();
  TAUtil.groupHistoryByDay(rows).forEach((g) => {
    const head = document.createElement('div');
    head.className = 'hist-group';
    head.textContent = dayLabel(g.day, now);
    wrap.appendChild(head);
    g.entries.forEach((e) => wrap.appendChild(makeHistRow(e)));
  });
}

// Intitule de l'alerte : "depuis 14:05" le jour meme, "depuis hier, 22:10", puis la date (le
// pourcentage peut ne plus avoir bouge depuis la veille, avant meme qu'on regarde le jeu).
function stuckTitle(x, now) {
  const name = x.name || x.campaign || x.game || t('inprog.defaultName');
  const time = clock(x.since);
  const day = TAUtil.dayKey(x.since);
  if (day === TAUtil.dayKey(now)) return t('ui.stuckTitle', { name, time });
  const y = new Date(now); y.setDate(y.getDate() - 1);
  if (day === TAUtil.dayKey(y.getTime())) return t('ui.stuckTitleYesterday', { name, time });
  const date = new Date(x.since).toLocaleDateString(currentLang === 'en' ? 'en-US' : 'fr-FR', { day: 'numeric', month: 'long' });
  return t('ui.stuckTitleDay', { name, day: date, time });
}

// Alerte "drop bloque" : une par campagne (ses drops avancent ensemble, une seule cause).
// Affichee seulement si le releve est frais : sans inventaire ouvert, rien n'est juge. Texte
// stable ("depuis 14:05", pas un compte de minutes qui change sans cesse) et zone reconstruite
// seulement quand il change : le bouton garde son focus, et la zone d'annonce (role=status,
// #stuck-live) ne parle qu'a l'apparition d'une alerte, pas a chaque releve.
function renderStuck(stats, now) {
  const box = document.getElementById('stuck');
  const fresh = stats.inProgressTs && now - stats.inProgressTs < STALE_MS;
  const seen = new Set();
  const items = [];
  (fresh && Array.isArray(stats.stuck) ? stats.stuck : []).forEach((x) => {
    if (!x || typeof x !== 'object' || !Number.isFinite(x.since)) return;
    const k = (x.game || '') + '|' + (x.campaign || '');
    if (!seen.has(k)) { seen.add(k); items.push(x); }
  });
  stuckCount = items.length;
  renderPill();
  const shown = items.slice(0, 2);
  const titles = shown.map((x) => stuckTitle(x, now));
  // Signature sur le texte affiche : "aujourd'hui" devient "hier" a minuit, la zone suit.
  const sig = currentLang + JSON.stringify(shown.map((x, i) => [titles[i], x.game, x.campaign, x.gameSlug, openedSlugs.has(x.gameSlug)]));
  if (sig === stuckSig) return;
  stuckSig = sig;
  const focusKey = focusedKeyIn(box);
  box.replaceChildren();
  box.hidden = !shown.length;
  shown.forEach((x, i) => {
    const el = document.createElement('div');
    el.className = 'alertbox';
    const txt = document.createElement('div');
    const b = document.createElement('b');
    b.textContent = titles[i];
    txt.append(b, document.createTextNode(' ' + t('ui.stuckHint')));
    if (x.gameSlug) txt.appendChild(makeWatchButton(x.gameSlug, x.game, x.campaign, 'alert-act'));
    el.append(makeIcon(ICONS.warn, null, 15), txt);
    box.appendChild(el);
  });
  setText(document.getElementById('stuck-live'), titles.join(' '));
  restoreFocus(box, focusKey);
}

// Ouvre une chaine en direct qui participe a la campagne, au premier plan : Chrome ne charge pas
// la video d'un onglet de fond jamais affiche (mesure du 06/10/2026). Le service worker ouvre
// l'annuaire du jeu filtre "drops", le script de contenu y choisit la premiere chaine.
function watchCampaign(slug) {
  openedSlugs.add(slug);
  try {
    const p = chrome.runtime.sendMessage({ type: 'watchCampaign', slug });
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch (e) { /* SW */ }
}

// Carte "prochain drop" : celui dont l'ETA est le plus court (a defaut, le plus avance).
function renderHero(list, stats, now) {
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
    unit.textContent = t(d.remainingMin > 1 ? 'ui.minutesLeft' : 'ui.minuteLeft');
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
  // Sans ETA, le pourcentage est deja le gros chiffre : on ne le repete pas en pied de carte.
  right.textContent = d.remainingMin != null ? pct + ' %' : '';
  meta.append(left, right);

  card.append(eyebrow, name, count, bar, meta);
  // Releve ancien : sans onglet inventaire ouvert, le temps restant affiche ne bouge plus.
  if (stats.inProgressTs && now - stats.inProgressTs > STALE_MS) {
    const stale = document.createElement('p');
    stale.className = 'hero-stale';
    stale.textContent = t('ui.stale', { ago: TAUtil.formatRelativeTime(stats.inProgressTs, now, currentLang) });
    card.appendChild(stale);
  }
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
  // Colonne ETA toujours presente (vide si la duree est inconnue) : les % restent alignes.
  const eta = document.createElement('span'); eta.className = 'camp-eta';
  eta.textContent = d.remainingMin != null ? '~' + fmtDuration(d.remainingMin * 60) : '';
  line.append(name, p, eta);
  const bar = document.createElement('div'); bar.className = 'camp-bar';
  const fill = document.createElement('i'); fill.style.width = pct + '%';
  bar.appendChild(fill);
  row.append(line, bar);
  return row;
}

// Drops en cours ranges par jeu puis par campagne. Repli en liste plate "Ensuite" quand
// aucun jeu n'a pu etre lu : le regroupement peut echouer, la liste des drops jamais.
function renderDropGroups(sorted, now) {
  const sec = document.getElementById('next-section');
  const wrap = document.getElementById('next');
  const title = document.getElementById('next-title');
  const focusKey = focusedKeyIn(wrap);
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
      // Nom de campagne illisible : un intitule generique plutot qu'une ligne vide.
      nm.textContent = c.campaign || t('ui.campUnnamed'); nm.title = nm.textContent;
      const count = document.createElement('span'); count.className = 'camp-count';
      // "n/m" seulement quand le tracker a vu des recompenses terminees dans le bloc ;
      // sinon on affiche ce qu'on a mesure : le nombre de drops encore en cours.
      count.textContent = (c.done != null && c.total != null)
        ? `${c.done}/${c.total}`
        : t('ui.campInProgress', { n: c.drops.length });
      top.append(nm, count);
      box.append(game, top);
      c.drops.forEach((d) => box.appendChild(makeCampDrop(d)));
      // Fin de campagne (lue sur l'inventaire) contre le temps de visionnage encore necessaire.
      const ends = (c.drops.find((d) => d.campEnds) || {}).campEnds;
      if (ends && ends > now) {
        const left = TAUtil.campaignRemainingMin(c.drops);
        const tight = left != null && now + left * 60000 > ends;
        const key = left == null ? 'ui.campEnds' : tight ? 'ui.campEndsTight' : 'ui.campEndsLeft';
        const line = document.createElement('div');
        line.className = 'camp-end' + (tight ? ' warn' : '');
        line.append(makeIcon(ICONS.clock, null, 12), document.createTextNode(t(key, {
          when: TAUtil.formatRelativeFuture(ends, now, currentLang),
          dur: left != null ? fmtDuration(left * 60) : ''
        })));
        box.appendChild(line);
      }
      const slug = (c.drops.find((d) => d.gameSlug) || {}).gameSlug;
      if (slug) box.appendChild(makeWatchButton(slug, g.game, c.campaign, 'camp-act'));
      wrap.appendChild(box);
    });
  });
  restoreFocus(wrap, focusKey);
}

function renderChannels(byChannel) {
  const sec = document.getElementById('channels-section');
  const wrap = document.getElementById('channels');
  wrap.replaceChildren();
  const entries = Object.entries(byChannel || {})
    .map(([name, c]) => ({ name, points: (c && c.points) || 0, drops: (c && c.drops) || 0, seconds: (c && c.seconds) || 0 }))
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
    // Chaine seulement regardee (ni coffre ni drop encore) : on montre au moins le temps passe.
    if (!parts.length && c.seconds) parts.push(fmtDuration(c.seconds));
    stat.textContent = parts.join(' · ');
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
  if (tab.id != null) chrome.tabs.update(tab.id, { active: true }).catch(() => {});
  if (tab.windowId != null) chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
  window.close();
}

function makeLiveCard(entry) {
  const { tab, snap, state } = entry;
  const card = document.createElement('div');
  card.className = 'lcard';
  if (TAUtil.isTabAlert(state)) card.classList.add('warn');
  else if (state === 'paused') card.classList.add('paused');
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
      ? `${t('live.playing')} · ${t('live.watched', { dur: fmtDuration(ch.seconds) })}`
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

  // Ligne 3 : ce que l'onglet fait reellement + les actions. La qualite affichee est celle que
  // la video DECODE (la cle de qualite de Twitch est commune a tous les onglets).
  const foot = document.createElement('div'); foot.className = 'lcard-foot';
  const chip = (label2) => { const c = document.createElement('span'); c.className = 'chip'; c.textContent = label2; return c; };
  if (snap && snap.quality) foot.appendChild(chip(qualityLabel(snap.quality)));
  if (tab.mutedInfo && tab.mutedInfo.muted) foot.appendChild(chip(t('live.chip.muted')));
  if (snap && snap.enabled === false) foot.appendChild(chip(t('live.chip.off')));

  const acts = document.createElement('span'); acts.className = 'lcard-acts';
  const act = (key, onClick) => {
    const b = makeButton(t(key), 'act', onClick);
    b.dataset.key = `${tab.id}:${key}`;   // pour rendre le focus clavier apres un re-rendu
    return b;
  };
  // Recharger a du sens pour un lecteur FIGE et pour un onglet injoignable (c'est meme le
  // seul remede la). Sur une chaine hors-ligne ca ne ramene rien : le reloader exclut deja
  // cet etat pour la meme raison (cf. reloadExcludePatterns).
  if (state === 'stalled' || state === 'unreachable') {
    acts.appendChild(act('live.reload', () => {
      if (tab.id != null) chrome.tabs.reload(tab.id).catch(() => {}).then(() => loadLive(true));
    }));
  }
  acts.appendChild(act('live.goTab', () => focusTab(tab)));
  // Fermeture manuelle : utile des qu'une chaine ne rapporte plus rien. Jamais automatique.
  acts.appendChild(act('live.close', () => {
    if (tab.id != null) chrome.tabs.remove(tab.id).catch(() => {}).then(() => loadLive(true));
  }));
  foot.appendChild(acts);

  card.append(top, txt, foot);
  return card;
}

function renderLive(list) {
  const wrap = document.getElementById('live');
  // Le rendu est rejoue toutes les 5 s : on rend le focus clavier au meme bouton apres coup.
  const focusedKey = wrap.contains(document.activeElement) ? document.activeElement.dataset.key : null;
  wrap.replaceChildren();
  if (!list.length) {
    wrap.appendChild(makeEmpty(
      ICONS.monitor, t('live.emptyTitle'), t('live.emptyHint'),
      makeButton(t('live.openTwitch'), 'btn sec', () => chrome.tabs.create({ url: 'https://www.twitch.tv/' }))
    ));
    return;
  }
  // Apres une mise a jour, tous les onglets ouverts passent "a recharger" : un seul geste.
  const orphans = list.filter((x) => x.state === 'unreachable' && x.tab.id != null);
  if (orphans.length >= 2) {
    const bulk = document.createElement('div');
    bulk.className = 'bulk';
    const span = document.createElement('span');
    span.textContent = t('live.bulkTxt', { n: orphans.length });
    const btn = makeButton(t('live.bulkBtn'), 'act', () => {
      Promise.all(orphans.map((x) => chrome.tabs.reload(x.tab.id).catch(() => {}))).then(() => loadLive(true));
    });
    btn.dataset.key = 'bulk';
    bulk.append(span, btn);
    wrap.appendChild(bulk);
  }
  list.forEach((entry) => wrap.appendChild(makeLiveCard(entry)));
  if (focusedKey) {
    const again = Array.from(wrap.querySelectorAll('button[data-key]')).find((b) => b.dataset.key === focusedKey);
    if (again) again.focus();
  }
}

// Pastille d'en-tete : les alertes (onglet en defaut, campagne bloquee) priment sur le compte
// d'onglets qui farment. Sans argument : garde les derniers comptes d'onglets (appel de
// renderStuck, qui ne connait que les campagnes bloquees).
function renderPill(tabsFarming, tabAlerts) {
  if (tabsFarming != null) pillTabs = { farming: tabsFarming, alerts: tabAlerts || 0 };
  const farming = pillTabs.farming;
  const alerts = pillTabs.alerts + stuckCount;
  const pill = document.getElementById('pill');
  if (alerts > 0) {
    pill.hidden = false;
    pill.classList.add('warn');
    setText(pill, t('ui.pill.alerts', { n: alerts, s: plural(alerts) }));
  } else if (farming > 0) {
    pill.hidden = false;
    pill.classList.remove('warn');
    setText(pill, t('ui.pill.tabs', { n: farming, s: plural(farming) }));
  } else {
    pill.hidden = true;
  }
  setText(document.getElementById('watch-tabs'),
    farming > 0 ? t('ui.pill.tabs', { n: farming, s: plural(farming) }) : '');
}

// Signature d'un instantane : on ne recree pas des cartes identiques toutes les 5 s (un clic
// qui tombait pendant le remplacement etait perdu).
let liveSig = '';
let liveGen = 0;
async function loadLive(force) {
  const gen = ++liveGen;
  const list = await collectTabs();
  if (gen !== liveGen) return;   // un instantane plus recent est deja parti
  const byCh = lastStats.byChannel || {};
  const sig = currentLang + JSON.stringify(list.map(({ tab, snap, state }) => [
    tab.id, state, tab.title, tab.mutedInfo && tab.mutedInfo.muted,
    snap && [snap.channel, snap.quality, snap.enabled, snap.stalledMin, snap.reloads],
    snap && snap.channel && byCh[snap.channel] ? Math.floor((byCh[snap.channel].seconds || 0) / 60) : 0
  ]));
  if (force === true || sig !== liveSig) { liveSig = sig; renderLive(list); }
  renderPill(
    // Un onglet dont l'extension est coupee ne farme pas, meme s'il joue.
    list.filter((x) => x.state === 'live' && !(x.snap && x.snap.enabled === false)).length,
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
  const prevLang = currentLang;
  currentLang = TAi18n.resolveLang(settings);
  applyStaticI18n();
  setLangButtons(currentLang);
  if (resetArmed) setText(resetBtn, t('ui.resetConfirm'));   // le libelle arme survit au re-rendu
  if (importMsg) renderImportMsg();                            // message d'import dans la bonne langue
  if (prevLang !== currentLang) loadLive(true);

  // Banniere affichee seulement si la version dispo est STRICTEMENT plus recente que l'installee.
  const installed = chrome.runtime.getManifest().version;
  const banner = document.getElementById('update-banner');
  if (upd && upd.version && TAUtil.compareVersions(upd.version, installed) > 0) {
    banner.hidden = false;
    setText(document.getElementById('update-text'), t('update.bannerNew', { v: upd.version }));
    lastUpdate = upd;
  } else {
    banner.hidden = true;
    lastUpdate = null;
  }

  document.getElementById('master').checked = settings.enabled !== false;
  document.body.classList.toggle('off', settings.enabled === false);

  setText(document.getElementById('points-value'), TAUtil.formatCompact(stats.pointsValue || 0, currentLang));
  setText(document.getElementById('points-last'), TAUtil.formatRelativeTime(stats.lastPointsClaim, now, currentLang));
  setText(document.getElementById('drops-value'), TAUtil.formatCompact(stats.dropsClaimed || 0, currentLang));
  setText(document.getElementById('drops-last'), TAUtil.formatRelativeTime(stats.lastDropsClaim, now, currentLang));
  setText(document.getElementById('watch-value'), fmtDuration(stats.watchSeconds));

  renderFeatures(settings);
  renderStuck(stats, now);
  renderDropGroups(renderHero(stats.inProgress || [], stats, now), now);
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

  // Chaines de repli de l'auto-switch (bloc visible seulement si le toggle est actif). Une
  // ancienne chaine unique invalide (page d'annuaire, /videos...) est signalee : sinon
  // l'utilisateur croit le repli en place.
  document.getElementById('autoswitch-row').hidden = settings.autoSwitch !== true;
  fallbacks = fallbackList(settings);
  renderFallbacks();
  if (!asPending) {
    const legacy = settings.autoSwitchUrl || '';
    const legacyBad = !fallbacks.length && legacy && !TAUtil.channelSlug(legacy, reserved());
    if (legacyBad) { setText(asErr, t('ui.autoswitchErr', { v: legacy.slice(0, 60) })); asErr.hidden = false; }
    else if (asNotice) { setText(asErr, t(asNotice.key, asNotice.vars)); asErr.hidden = false; }
    else asErr.hidden = true;
  }

  const histInput = document.getElementById('history-ttl');
  if (document.activeElement !== histInput) histInput.value = settings.historyTtlMin || '';
  const retryInput = document.getElementById('drop-retry');
  if (document.activeElement !== retryInput) retryInput.value = TAUtil.dropRetryMin(settings);

  // Derniere erreur : datee, et plus affichee au bout de 24 h (elle restait la pour toujours).
  const showErr = lastError && lastError.ts && now - lastError.ts < ERROR_SHOW_MS;
  setText(document.getElementById('diag'), showErr
    ? t('diag.lastError', { module: lastError.module, ago: TAUtil.formatRelativeTime(lastError.ts, now, currentLang), message: lastError.message })
    : '');
}

// Ecritures de reglages en file : deux cases cochees coup sur coup ne s'ecrasent plus
// (chacune relisait les reglages avant que l'autre ait ecrit). Le re-rendu vient de
// storage.onChanged, pas d'un load() en plus ici.
let settingsChain = Promise.resolve();
function update(key, val) {
  return patchSettings({ [key]: val });
}
function patchSettings(patch) {
  settingsChain = settingsChain.then(async () => {
    const { settings = {} } = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({ settings: { ...settings, ...patch } });
  }).catch(() => {});
  return settingsChain;
}

function openInventory() {
  chrome.tabs.create({ url: 'https://www.twitch.tv/drops/inventory' });
}

document.getElementById('update-dl').addEventListener('click', () => {
  // On ne telecharge que depuis une URL de release de NOTRE repo (sinon on ouvre la page).
  if (lastUpdate && lastUpdate.url && lastUpdate.url.startsWith(DL_PREFIX)) {
    chrome.downloads.download({ url: lastUpdate.url })
      .then(() => setText(document.getElementById('update-hint'), t('update.downloaded')))
      .catch(() => chrome.tabs.create({ url: RELEASES_URL }));
  } else {
    chrome.tabs.create({ url: RELEASES_URL });
  }
});

// Chaines de repli : une liste ordonnee de 5 chaines au plus. La saisie accepte un nom ou un
// lien (avec ou sans https / www), et plusieurs a la fois separes par des virgules ou des
// espaces ; on enregistre des slugs. Saisie invalide = message, rien d'enregistre.
const asErr = document.getElementById('autoswitch-err');
const asInput = document.getElementById('autoswitch-url');
// Saisie refusee en attente de correction : load() ne masque pas son message.
let asPending = false;
// Information sur la derniere saisie (liste pleine, chaine deja presente) : { key, vars }. Elle
// survit au re-rendu que declenche l'enregistrement (sinon le message clignotait et disparaissait).
let asNotice = null;
let fallbacks = [];

function fallbackList(settings) {
  const raw = Array.isArray(settings.autoSwitchChannels) && settings.autoSwitchChannels.length
    ? settings.autoSwitchChannels : [settings.autoSwitchUrl || ''];
  const out = [];
  raw.forEach((x) => { const slug = TAUtil.channelSlug(x, reserved()); if (slug && !out.includes(slug)) out.push(slug); });
  return out.slice(0, MAX_FALLBACKS);
}

function saveFallbacks(list) {
  // autoSwitchUrl est vide des qu'une liste existe : une seule source de verite.
  patchSettings({ autoSwitchChannels: list, autoSwitchUrl: '' });
}

function renderFallbacks() {
  const wrap = document.getElementById('autoswitch-list');
  const focusKey = focusedKeyIn(wrap);
  wrap.replaceChildren();
  fallbacks.forEach((ch, i) => {
    const chip = document.createElement('span');
    chip.className = 'as-chip';
    const rm = document.createElement('button');
    rm.type = 'button';
    rm.textContent = '×';
    rm.dataset.fk = 'as:' + ch;
    rm.setAttribute('aria-label', t('ui.autoswitchRemove', { ch }));
    rm.addEventListener('click', () => {
      asNotice = null;
      asInput.focus();   // la puce disparait : le focus clavier ne doit pas tomber dans le vide
      saveFallbacks(fallbacks.filter((x) => x !== ch));
    });
    chip.append(document.createTextNode(`${i + 1}. ${ch}`), rm);
    wrap.appendChild(chip);
  });
  restoreFocus(wrap, focusKey);
}

asInput.addEventListener('change', (e) => {
  const parts = e.target.value.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
  asNotice = null;
  if (!parts.length) { asPending = false; asErr.hidden = true; return; }
  const bad = parts.filter((x) => !TAUtil.channelSlug(x, reserved()));
  if (bad.length) {
    asErr.textContent = t('ui.autoswitchErr', { v: bad[0].slice(0, 60) });
    asErr.hidden = false;
    asPending = true;
    return;
  }
  const next = fallbacks.slice();
  const dup = [];
  parts.forEach((x) => {
    const slug = TAUtil.channelSlug(x, reserved());
    if (next.includes(slug)) { if (!dup.includes(slug)) dup.push(slug); } else next.push(slug);
  });
  asPending = false;
  // Liste pleine, ou chaine deja presente : on le dit (avant, la saisie disparaissait sans rien).
  if (next.length > MAX_FALLBACKS) asNotice = { key: 'ui.autoswitchFull' };
  else if (dup.length) asNotice = { key: 'ui.autoswitchDup', vars: { ch: dup.join(', ') } };
  if (asNotice) { asErr.textContent = t(asNotice.key, asNotice.vars); asErr.hidden = false; }
  else asErr.hidden = true;
  e.target.value = '';
  if (next.length !== fallbacks.length) saveFallbacks(next.slice(0, MAX_FALLBACKS));
});

// Vidage auto de l'historique : champ vide ou <= 0 -> 0 (desactive, n'efface rien).
document.getElementById('history-ttl').addEventListener('change', (e) => {
  const n = parseInt(e.target.value, 10);
  update('historyTtlMin', Number.isFinite(n) && n > 0 ? n : 0);
});

// Delai avant de reessayer un drop en erreur : 1 a 1440 min ; vide ou invalide -> 60 (defaut).
document.getElementById('drop-retry').addEventListener('change', (e) => {
  const n = parseInt(e.target.value, 10);
  const v = Number.isFinite(n) ? Math.min(Math.max(n, 1), TAUtil.DROP_RETRY_MAX_MIN) : TAUtil.DROP_RETRY_DEFAULT_MIN;
  e.target.value = v;
  update('dropRetryMin', v);
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
      overlay: yn(r.playerOverlay), bars: r.progressBars, ends: r.campaignEnds || '-'
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
  // Date dans le nom : deux sauvegardes ne s'ecrasent pas (twitch-auto-sauvegarde-2026-10-06.json).
  const day = new Date().toISOString().slice(0, 10);
  chrome.downloads.download({ url, filename: `twitch-auto-sauvegarde-${day}.json` });
});

const importResult = document.getElementById('import-result');
const importActions = document.getElementById('import-actions');
const importInput = document.getElementById('import-file');
let pendingStats = null;   // compteurs en attente de confirmation (import en deux temps)

// Le message est garde sous forme de cle : il suit un changement de langue.
function showImport(key, vars, kind) {
  importMsg = { key, vars: vars || null, kind: kind || '' };
  renderImportMsg();
}
function renderImportMsg() {
  importResult.textContent = importMsg ? t(importMsg.key, importMsg.vars) : '';
  importResult.className = 'bk-result' + (importMsg && importMsg.kind ? ' ' + importMsg.kind : '');
  importActions.hidden = !(importMsg && importMsg.kind === 'ask' && pendingStats);
}

// Applique les REGLAGES tout de suite (valeurs filtrees), et met les compteurs en attente :
// ecraser 27 000 points par megarde n'est pas rattrapable, donc ca demande un clic explicite.
async function applyImport(data) {
  if (!data || typeof data !== 'object' || (!data.settings && !data.stats && !data.history)) {
    pendingStats = null;   // un fichier invalide n'arme jamais les compteurs du fichier precedent
    showImport('ui.importErr', null, 'err');
    return;
  }
  let n = 0;
  if (data.settings && typeof data.settings === 'object') {
    const clean = TAUtil.sanitizeSettings(data.settings, reserved());
    n = Object.keys(clean).length;
    if (n) await patchSettings(clean);
  }
  const hasStats = (data.stats && typeof data.stats === 'object') || Array.isArray(data.history);
  if (hasStats) {
    pendingStats = { stats: data.stats, history: data.history };
    showImport('ui.importAsk', null, 'ask');
  } else {
    pendingStats = null;
    showImport('ui.importOk', { n, s: plural(n) });
  }
}

// Confirmation : le service worker ecrit compteurs et historique (valeurs filtrees, meme file
// que les claims). Refus : on garde les compteurs actuels.
document.getElementById('import-confirm').addEventListener('click', async () => {
  if (!pendingStats) return;
  const { stats, history } = pendingStats;
  pendingStats = null;
  let r = null;
  try { r = await chrome.runtime.sendMessage({ type: 'importStats', stats, history }); } catch (e) { r = null; }
  if (r && r.ok) showImport('ui.importOkStats');
  else showImport('ui.importFail', null, 'err');
});
document.getElementById('import-cancel').addEventListener('click', () => {
  pendingStats = null;
  showImport('ui.importCancelled');
});

function readImportFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    let data = null;
    try { data = JSON.parse(String(reader.result)); } catch (e) { data = null; }
    applyImport(data);
  };
  reader.onerror = () => { pendingStats = null; showImport('ui.importErr', null, 'err'); };
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

// Reset en deux temps (evite d'effacer compteurs + historique par megarde). Les drops en cours
// sont gardes : ils decrivent la progression actuelle, pas un cumul.
let resetTimer = null;
const resetBtn = document.getElementById('reset');
function disarmReset() { resetArmed = false; setText(resetBtn, t('ui.reset')); }
resetBtn.addEventListener('click', async () => {
  if (!resetArmed) {
    resetArmed = true;
    setText(resetBtn, t('ui.resetConfirm'));
    resetTimer = setTimeout(disarmReset, 3000);
    return;
  }
  clearTimeout(resetTimer);
  disarmReset();
  let r = null;
  try { r = await chrome.runtime.sendMessage({ type: 'resetStats' }); } catch (e) { r = null; }
  if (!r || !r.ok) setText(document.getElementById('diag'), t('ui.resetFail'));
});

document.getElementById('version').textContent = 'v' + chrome.runtime.getManifest().version;

// Onglets : Stats / En direct / Historique / Reglages. Clavier : fleches, Debut, Fin
// (motif ARIA "tabs" : un seul onglet dans l'ordre de tabulation, celui qui est actif).
const TAB_NAMES = ['stats', 'live', 'history', 'settings'];
function showTab(name) {
  document.querySelectorAll('.tab').forEach((tab) => {
    const on = tab.dataset.tab === name;
    tab.classList.toggle('active', on);
    tab.setAttribute('aria-selected', on ? 'true' : 'false');
    tab.tabIndex = on ? 0 : -1;
  });
  TAB_NAMES.forEach((n) => {
    document.getElementById('tab-' + n).hidden = (n !== name);
  });
  if (name === 'live') loadLive(true); // etat frais des l'affichage, sans attendre le prochain tick
}
document.querySelectorAll('.tab').forEach((tab) => tab.addEventListener('click', () => showTab(tab.dataset.tab)));
document.querySelector('.tabs').addEventListener('keydown', (e) => {
  const cur = TAB_NAMES.indexOf(document.activeElement && document.activeElement.dataset.tab);
  if (cur < 0) return;
  let next = null;
  if (e.key === 'ArrowRight') next = (cur + 1) % TAB_NAMES.length;
  else if (e.key === 'ArrowLeft') next = (cur + TAB_NAMES.length - 1) % TAB_NAMES.length;
  else if (e.key === 'Home') next = 0;
  else if (e.key === 'End') next = TAB_NAMES.length - 1;
  if (next == null) return;
  e.preventDefault();
  showTab(TAB_NAMES[next]);
  document.getElementById('tabbtn-' + TAB_NAMES[next]).focus();
});
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
// Le minuteur meurt avec le popup : pas besoin de le liberer (et l'evenement 'unload',
// deprecie par Chrome, n'est plus utilise).
setInterval(loadLive, LIVE_REFRESH_MS);
