// Tests du regroupement par jeu / campagne (drops en cours et historique).
// Invariant central : le regroupement peut echouer - Twitch renomme sa page, un claim vient du
// bandeau d'un stream - mais AUCUNE entree ne doit disparaitre au passage.
const assert = require('assert');
const { groupDropsByGame, groupHistoryByGame, gameNameFromHref } = require('../src/shared/util.js');

// --- Nom de jeu derive du slug ---
// Les hrefs ci-dessous sont RELEVES sur la vraie page inventaire : le libelle du lien y est
// "chaine en live participante" et l'alt "Image de campagne de drops" ; le nom du jeu n'existe
// que dans l'URL. Ces cas verrouillent la seule source exploitable.
assert.strictEqual(gameNameFromHref('/directory/category/warframe?filter=drops'), 'Warframe');
assert.strictEqual(gameNameFromHref('/directory/category/escape-from-tarkov?filter=drops'), 'Escape from Tarkov');
assert.strictEqual(gameNameFromHref('/directory/category/arena-breakout-infinite?filter=drops'), 'Arena Breakout Infinite');
assert.strictEqual(gameNameFromHref('https://www.twitch.tv/directory/game/rust'), 'Rust', 'ancienne forme /game/ et URL absolue');
assert.strictEqual(gameNameFromHref('/directory/category/league-of-legends'), 'League of Legends', 'les particules restent en minuscules');
assert.strictEqual(gameNameFromHref('/directory/category/of-mice-and-men'), 'Of Mice and Men', 'sauf en tete de nom');
assert.strictEqual(gameNameFromHref('/directory/category/pubg%3A-battlegrounds'), 'Pubg: Battlegrounds', 'slug encode');
// Rien d'exploitable -> chaine vide, jamais une valeur inventee (le regroupement se degrade).
assert.strictEqual(gameNameFromHref('/videos/123'), '');
assert.strictEqual(gameNameFromHref(''), '');
assert.strictEqual(gameNameFromHref(null), '');
// CLE : capte depuis l'inventaire ou depuis un stream, le meme jeu doit donner le MEME libelle,
// sinon l'historique afficherait deux groupes pour un seul jeu.
assert.strictEqual(
  gameNameFromHref('/directory/category/escape-from-tarkov?filter=drops'),
  gameNameFromHref('/directory/category/escape-from-tarkov'));

// --- Libelles ecartes comme nom de campagne (textes REELS de la page inventaire) ---
{
  global.window = global;
  delete global.TA;
  require('../src/content/selectors.js');
  const noise = global.TA.selectors.campaignNoise;
  const rejete = (t) => noise.some((re) => re.test(t));
  ['En cours', 'Date de fin : mar. 4 août, 23:59 UTC+2', 'À propos de ce drop',
    'Cette récompense n’est plus disponible.', 'Terminé', 'In progress'].forEach((t) => {
    assert.ok(rejete(t), `"${t}" ne doit pas etre pris pour un nom de campagne`);
  });
  ['Prime Time #492', 'KORD BREACH S1 Drops', 'Biohazard Loot Rush Drops', 'Summer Games'].forEach((t) => {
    assert.ok(!rejete(t), `"${t}" est un vrai nom de campagne et doit passer`);
  });
  delete global.TA;
}

// --- Drops en cours ---
const drops = [
  { name: 'Summer Tokens', percent: 52, remainingMin: 86, game: 'Overwatch 2', campaign: 'Summer Games' },
  { name: 'Pack', percent: 40, remainingMin: 9, game: 'Marvel Snap', campaign: 'Saison PT27', campDone: 1, campTotal: 3 },
  { name: '2XP', percent: 60, remainingMin: 12, game: 'Overwatch 2', campaign: 'Summer Games' }
];
let g = groupDropsByGame(drops);
assert.deepStrictEqual(g.map((x) => x.game), ['Marvel Snap', 'Overwatch 2'],
  'les groupes sortent dans l ordre du drop le plus proche qu ils contiennent (9 min avant 12 min)');
assert.deepStrictEqual(g[1].campaigns[0].drops.map((d) => d.name), ['2XP', 'Summer Tokens'],
  'dans une campagne, les drops restent tries par ETA');
assert.strictEqual(g[0].campaigns[0].done, 1, 'le compteur n/m est remonte quand le tracker l a mesure');
assert.strictEqual(g[0].campaigns[0].total, 3);
assert.strictEqual(g[1].campaigns[0].done, null, 'sans recompense terminee visible, pas de compteur invente');

// Deux campagnes du meme jeu -> deux blocs sous un seul groupe de jeu.
g = groupDropsByGame([
  { name: 'a', remainingMin: 5, game: 'Rust', campaign: 'Round 21' },
  { name: 'b', remainingMin: 8, game: 'Rust', campaign: 'Round 22' },
  { name: 'c', remainingMin: 6, game: 'Rust', campaign: 'Round 21' }
]);
assert.strictEqual(g.length, 1);
assert.deepStrictEqual(g[0].campaigns.map((c) => c.campaign), ['Round 21', 'Round 22']);
assert.deepStrictEqual(g[0].campaigns[0].drops.map((d) => d.name), ['a', 'c']);

// Jeu illisible -> groupe a cle vide, TOUJOURS en dernier, et rien n'est perdu.
g = groupDropsByGame([
  { name: 'orphelin', remainingMin: 1 },
  { name: 'range', remainingMin: 50, game: 'Rust', campaign: 'R21' }
]);
assert.deepStrictEqual(g.map((x) => x.game), ['Rust', ''], 'le groupe sans jeu passe en dernier meme si son drop tombe en premier');
assert.strictEqual(g[1].campaigns[0].drops[0].name, 'orphelin');

// Aucun jeu du tout -> un seul groupe vide : c'est le signal qui fait retomber le popup
// sur une liste plate au lieu d'afficher un intitule de groupe vide.
g = groupDropsByGame([{ name: 'x', remainingMin: 3 }, { name: 'y', remainingMin: 4 }]);
assert.strictEqual(g.length, 1);
assert.strictEqual(g[0].game, '');
assert.strictEqual(g[0].campaigns[0].drops.length, 2);

assert.deepStrictEqual(groupDropsByGame([]), []);
assert.deepStrictEqual(groupDropsByGame(null), []);

// --- Historique ---
// Entree dans l'ordre d'AFFICHAGE (la plus recente d'abord).
const hist = [
  { type: 'drop', name: 'Cap', ts: 500, game: 'Rust', campaign: 'R21' },
  { type: 'points', amount: 25000, ts: 400 },
  { type: 'drop', name: 'Vieux', ts: 300 },
  { type: 'drop', name: 'Hoodie', ts: 200, game: 'Rust', campaign: 'R21' }
];
let h = groupHistoryByGame(hist);
assert.deepStrictEqual(h.map((x) => (x.points ? '<points>' : x.game)), ['Rust', '<points>', ''],
  'groupes par recence, paliers de points a leur place chronologique, non etiquetes en dernier');
assert.deepStrictEqual(h[0].entries.map((e) => e.name), ['Cap', 'Hoodie'], 'ordre conserve dans le groupe');
assert.strictEqual(h[1].points, true, 'le groupe des paliers est marque comme tel');
assert.strictEqual(h[1].game, '', 'un palier de points n a pas de jeu');
assert.strictEqual(h[2].entries[0].name, 'Vieux', 'une entree d avant l etiquetage reste visible');

// Total conserve : aucune entree perdue, quel que soit l etiquetage.
const total = groupHistoryByGame(hist).reduce((n, x) => n + x.entries.length, 0);
assert.strictEqual(total, hist.length, 'le regroupement ne doit jamais perdre une entree');

// Un jeu qui s'appellerait "points" ne doit PAS tomber dans le groupe des paliers : les cles
// sont prefixees ('g:' contre 'p'), donc aucune collision possible avec un nom lu dans le DOM.
h = groupHistoryByGame([{ type: 'drop', name: 'd', ts: 1, game: 'points' }, { type: 'points', amount: 5, ts: 2 }]);
assert.strictEqual(h.length, 2);
assert.strictEqual(h.filter((x) => x.points).length, 1);
assert.strictEqual(h.find((x) => !x.points).entries[0].name, 'd');

// Historique 100 % non etiquete -> un seul groupe vide (repli en liste plate cote popup).
h = groupHistoryByGame([{ type: 'drop', name: 'a', ts: 2 }, { type: 'drop', name: 'b', ts: 1 }]);
assert.strictEqual(h.length, 1);
assert.strictEqual(h[0].game, '');
assert.strictEqual(h[0].points, false);

assert.deepStrictEqual(groupHistoryByGame([]), []);
assert.deepStrictEqual(groupHistoryByGame(null), []);

console.log('OK groupes jeu / campagne');
