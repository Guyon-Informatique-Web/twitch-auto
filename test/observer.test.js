// Tests de findCampaign (src/content/observer.js) et du releve du tracker sur la STRUCTURE REELLE
// d'un inventaire connecte, relevee le 06/10/2026 : une carte par campagne, avec le lien de son
// nom (/drops/campaigns), sa date de fin, et un lien vers le jeu ("chaine en live participante")
// seulement si la campagne est en cours. On charge les VRAIS fichiers dans un mini DOM.
const assert = require('assert');
const path = require('path');

// --- Mini DOM : juste ce que lisent observer.js et tracker.js ---------------------------------
class El {
  constructor(tag, attrs, children, text) {
    this.tagName = tag.toUpperCase();
    this.attrs = attrs || {};
    this.children = [];
    this.parentElement = null;
    this.ownText = text || '';
    (children || []).forEach((c) => { c.parentElement = this; this.children.push(c); });
  }
  getAttribute(n) { return Object.prototype.hasOwnProperty.call(this.attrs, n) ? this.attrs[n] : null; }
  get textContent() { return this.ownText + this.children.map((c) => c.textContent).join(''); }
  matches(sel) { return sel.split(',').some((s) => matchSimple(this, s.trim())); }
  querySelectorAll(sel) {
    const out = [];
    const walk = (n) => n.children.forEach((c) => { if (c.matches(sel)) out.push(c); walk(c); });
    walk(this);
    return out;
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  closest(sel) { for (let n = this; n; n = n.parentElement) if (n.matches(sel)) return n; return null; }
}
function matchSimple(el, s) {
  const m = s.match(/^([a-z0-9]*)((?:\[[^\]]+\])*)$/i);
  if (!m) throw new Error('selecteur non gere par le mini DOM : ' + s);
  if (m[1] && el.tagName !== m[1].toUpperCase()) return false;
  return (m[2].match(/\[[^\]]+\]/g) || []).every((a) => {
    const am = a.match(/^\[([\w-]+)(?:([*^]?=)"([^"]*)"( i)?)?\]$/);
    if (!am) throw new Error('attribut non gere par le mini DOM : ' + a);
    const v = el.getAttribute(am[1]);
    if (!am[2]) return v != null;
    if (v == null) return false;
    const val = am[4] ? v.toLowerCase() : v;
    const want = am[4] ? am[3].toLowerCase() : am[3];
    return am[2] === '=' ? val === want : am[2] === '*=' ? val.includes(want) : val.startsWith(want);
  });
}
const h = (tag, attrs, ...kids) => new El(tag, attrs, kids.filter((k) => typeof k !== 'string'), kids.filter((k) => typeof k === 'string').join(''));
const NB = String.fromCharCode(0xa0);
const CT = { class: 'CoreText-sc-1txzju1-0' };

// Carte de campagne comme sur twitch.tv (colonne gauche : nom, date, liens ; droite : recompenses).
function card({ id, name, end, gameHref, rewards }) {
  return h('div', {},
    h('div', {},
      h('div', {}, h('p', CT, h('a', { href: '/drops/campaigns?dropID=' + id }, name))),
      h('div', {}, h('p', CT, h('span', {}, 'Date de fin' + NB + ':'), h('span', {}, ' ' + end))),
      h('div', {},
        h('div', {}, h('img', { alt: 'Image de campagne de drops' })),
        h('div', {}, gameHref ? h('a', { href: gameHref }, 'chaîne en live participante') : h('p', CT),
          h('a', { href: 'https://example.com/about' }, h('div', {}, 'À propos de ce drop'))))),
    h('div', {}, ...rewards.map((r) => h('div', {},
      h('div', {}, h('div', { role: 'progressbar', 'aria-valuenow': String(r.pct), 'aria-valuemax': '100' })),
      h('div', {}, h('p', CT, r.name), h('p', CT, r.pct + ' % de ' + r.total)),
      r.expired ? h('p', CT, 'Cette récompense n’est plus disponible.') : h('p', {})))));
}

const rust = card({ id: '1', name: 'Rust Isles Facemask', end: 'lun. 5 oct., 01:58 UTC+2', gameHref: null, rewards: [{ pct: 45, name: 'Rust Isles Facemask', total: '2 heures', expired: true }] });
const eve = card({ id: '2', name: 'Crimson Harvest Drop 1', end: 'ven. 9 oct., 12:57 UTC+2', gameHref: '/directory/category/eve-online?filter=drops', rewards: [{ pct: 17, name: 'Mysterious Booster Crate', total: '4 heures' }] });
const ow = card({ id: '3', name: 'OWCS Stage 3 Asia Kickoff', end: 'sam. 10 oct., 09:59 UTC+2', gameHref: '/directory/category/overwatch-2?filter=drops', rewards: [{ pct: 40, name: 'Esports Loot Box', total: '10 heures' }, { pct: 100, name: 'Fini', total: '1 heure' }] });
const root = h('div', {}, h('p', CT, 'En cours'), rust, eve, ow);

// --- Environnement : vrais fichiers, horloge figee au 06/10/2026 15:00 (heure locale) ----------
const NOW = new Date(2026, 9, 6, 15, 0).getTime();
Date.now = () => NOW;
global.window = global;
global.TAUtil = require(path.join(__dirname, '../src/shared/util.js'));
global.document = {
  documentElement: { lang: 'fr-FR' },
  querySelectorAll: (sel) => root.querySelectorAll(sel),
  querySelector: (sel) => root.querySelector(sel)
};
require(path.join(__dirname, '../src/content/selectors.js'));
require(path.join(__dirname, '../src/content/observer.js'));
require(path.join(__dirname, '../src/content/modules/tracker.js'));
const bars = root.querySelectorAll('[role="progressbar"]');

// Carte terminee SANS lien de jeu : on s'arrete a la carte (jeu inconnu), jamais le jeu voisin.
{
  const m = TA.dom.findCampaign(bars[0]);
  assert.strictEqual(m.game, '', 'pas le jeu de la carte voisine (EVE Online)');
  assert.strictEqual(m.slug, '');
  assert.strictEqual(m.campaign, 'Rust Isles Facemask', 'le nom de la carte reste lu');
  assert.strictEqual(m.endsAt, null, 'sa date est passee : rien, pas la date de la campagne voisine');
  assert.strictEqual(m.block, rust);
}
// Carte en cours : jeu, lien de l'annuaire, nom et date de fin de SA campagne.
{
  const m = TA.dom.findCampaign(bars[1]);
  assert.strictEqual(m.game, 'Eve Online');
  assert.strictEqual(m.slug, 'eve-online');
  assert.strictEqual(m.campaign, 'Crimson Harvest Drop 1');
  assert.strictEqual(m.endsAt, new Date(2026, 9, 9, 12, 57).getTime());
  assert.strictEqual(m.block, eve);
}
// Releve du tracker : drops en cours seulement (terminee et 100 % exclus), bien ranges.
{
  const list = TA.modules.tracker.collect();
  assert.deepStrictEqual(list.map((d) => [d.name, d.percent, d.game, d.campaign, d.gameSlug]), [
    ['Mysterious Booster Crate', 17, 'Eve Online', 'Crimson Harvest Drop 1', 'eve-online'],
    ['Esports Loot Box', 40, 'Overwatch 2', 'OWCS Stage 3 Asia Kickoff', 'overwatch-2']
  ]);
  assert.strictEqual(list[0].remainingMin, 199, '17 % de 4 heures : 199 min restantes');
  assert.strictEqual(list[0].campEnds, new Date(2026, 9, 9, 13, 0).getTime(), 'date de fin arrondie au quart d heure');
  assert.strictEqual(list[1].campDone, 1, 'la barre a 100 % compte dans SA campagne');
  assert.strictEqual(list[1].campTotal, 2);
}

console.log('OK observer (inventaire connecte)');
