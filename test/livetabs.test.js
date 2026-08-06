// Tests des fonctions pures de la vue "En direct" et du tri des drops, plus le garde-fou
// de parite FR / EN : une cle presente d'un seul cote retomberait silencieusement en francais
// dans une interface annoncee bilingue (le repli de t() masque le trou).
const assert = require('assert');
const { sortDropsByEta, tabState, isTabAlert } = require('../src/shared/util.js');
const { STRINGS } = require('../src/shared/i18n.js');

// --- sortDropsByEta : "le prochain d'abord" ---
const drops = [
  { name: 'Summer Tokens', percent: 52, remainingMin: 86 },
  { name: '2XP', percent: 60, remainingMin: 12 },
  { name: 'Pack', percent: 40, remainingMin: 9 }
];
assert.deepStrictEqual(sortDropsByEta(drops).map((d) => d.name), ['Pack', '2XP', 'Summer Tokens'],
  'les drops doivent sortir dans l ordre ou ils vont tomber, pas par pourcentage');

// L'entree n'est jamais mutee (le popup reaffiche a partir de stats.inProgress).
const before = drops.map((d) => d.name);
sortDropsByEta(drops);
assert.deepStrictEqual(drops.map((d) => d.name), before, 'sortDropsByEta ne doit pas trier en place');

// ETA inconnu (duree totale illisible sur l'inventaire) -> derriere ceux qui en ont un,
// et departages entre eux par progression decroissante.
const mixed = [
  { name: 'sansEta-40', percent: 40, remainingMin: null },
  { name: 'avecEta', percent: 5, remainingMin: 30 },
  { name: 'sansEta-90', percent: 90 }
];
assert.deepStrictEqual(sortDropsByEta(mixed).map((d) => d.name), ['avecEta', 'sansEta-90', 'sansEta-40'],
  'un ETA connu passe devant, les autres sont ranges par progression');

assert.deepStrictEqual(sortDropsByEta(null), [], 'entree invalide -> liste vide (jamais d exception)');
assert.deepStrictEqual(sortDropsByEta([]), []);

// remainingMin 0 est une valeur VALIDE (drop qui tombe a l instant) : ne doit pas etre
// confondu avec "inconnu" par un test de verite.
assert.strictEqual(sortDropsByEta([{ name: 'x', percent: 10 }, { name: 'zero', remainingMin: 0, percent: 99 }])[0].name,
  'zero', 'remainingMin = 0 doit rester un ETA connu, donc en tete');

// --- tabState : les anomalies priment sur l etat de lecture ---
assert.strictEqual(tabState(null), 'loading', 'pas de reponse du content script -> chargement');
assert.strictEqual(tabState(undefined), 'loading');
assert.strictEqual(tabState({ inventory: true, channel: '' }), 'inventory');
assert.strictEqual(tabState({ channel: '' }), 'other', 'page Twitch hors chaine');
assert.strictEqual(tabState({ channel: 'a', playing: true }), 'live');
assert.strictEqual(tabState({ channel: 'a', playing: false }), 'paused');
assert.strictEqual(tabState({ channel: 'a', playing: false, stalled: true }), 'stalled');
assert.strictEqual(tabState({ channel: 'a', playing: false, offline: true }), 'offline');
// Ordre CLE : une chaine hors-ligne dont le lecteur est aussi fige est d abord hors-ligne
// (recharger n y changerait rien), et un lecteur qui joue n est jamais "fige".
assert.strictEqual(tabState({ channel: 'a', offline: true, stalled: true }), 'offline');
assert.strictEqual(tabState({ channel: 'a', playing: true, stalled: true }), 'live');
// L inventaire prime meme sur une chaine : /drops n est pas une page de farm.
assert.strictEqual(tabState({ channel: 'a', inventory: true, playing: true }), 'inventory');

// --- isTabAlert : ce qui merite la pastille ambre ---
assert.strictEqual(isTabAlert('offline'), true);
assert.strictEqual(isTabAlert('stalled'), true);
['live', 'paused', 'inventory', 'other', 'loading'].forEach((s) => {
  assert.strictEqual(isTabAlert(s), false, `${s} n est pas une alerte`);
});

// --- Parite des dictionnaires FR / EN ---
const fr = Object.keys(STRINGS.fr).sort();
const en = Object.keys(STRINGS.en).sort();
assert.deepStrictEqual(en.filter((k) => !STRINGS.fr[k]), [], 'cles presentes en EN mais absentes en FR');
assert.deepStrictEqual(fr.filter((k) => !STRINGS.en[k]), [], 'cles presentes en FR mais absentes en EN');
// Meme jeu de placeholders des deux cotes : un {n} oublie en anglais afficherait "{n}" brut.
fr.forEach((k) => {
  const holes = (s) => (String(s).match(/\{(\w+)\}/g) || []).sort().join(',');
  assert.strictEqual(holes(STRINGS.en[k]), holes(STRINGS.fr[k]), `placeholders differents pour ${k}`);
});

console.log('OK livetabs + i18n parite');
