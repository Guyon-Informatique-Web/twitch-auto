// Tests du regroupement par jeu / campagne (drops en cours et historique).
// Invariant central : le regroupement peut echouer - Twitch renomme sa page, un claim vient du
// bandeau d'un stream - mais AUCUNE entree ne doit disparaitre au passage.
const assert = require('assert');
const { groupDropsByGame, groupHistoryByDay, dayKey, gameNameFromHref, gameSlugFromHref, participateUrl } = require('../src/shared/util.js');

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

// --- Slug du jeu et annuaire des chaines participantes (v1.13) ---
assert.strictEqual(gameSlugFromHref('/directory/category/escape-from-tarkov?filter=drops'), 'escape-from-tarkov');
assert.strictEqual(gameSlugFromHref('https://www.twitch.tv/directory/game/rust'), 'rust');
assert.strictEqual(gameSlugFromHref('/directory/category/pubg%3A-battlegrounds'), 'pubg%3A-battlegrounds', 'slug garde tel quel (deja encode)');
assert.strictEqual(gameSlugFromHref('/videos/1'), '');
assert.strictEqual(participateUrl('rust'), 'https://www.twitch.tv/directory/category/rust?filter=drops&tawatch=1');
assert.strictEqual(participateUrl(''), '');

// --- Historique par jour (v1.13) ---
// Entree dans l'ordre d'AFFICHAGE (la plus recente d'abord), en heure LOCALE.
const D = (y, m, d, h) => new Date(y, m - 1, d, h).getTime();
const hist = [
  { type: 'drop', name: 'Cap', ts: D(2026, 10, 6, 14), game: 'Rust', campaign: 'R21' },
  { type: 'points', amount: 25000, ts: D(2026, 10, 6, 9) },
  { type: 'drop', name: 'Hoodie', ts: D(2026, 10, 5, 22) },
  { type: 'drop', name: 'Vieux', ts: D(2026, 10, 3, 1) },
  { type: 'drop', name: 'Sans date' }
];
const h = groupHistoryByDay(hist);
assert.deepStrictEqual(h.map((g) => g.day), ['2026-10-06', '2026-10-05', '2026-10-03', ''],
  'un groupe par jour, du plus recent au plus ancien, les entrees sans date a la fin');
assert.deepStrictEqual(h[0].entries.map((e) => e.name || e.type), ['Cap', 'points'], 'ordre conserve dans le jour');
assert.strictEqual(h.reduce((n, g) => n + g.entries.length, 0), hist.length, 'aucune entree perdue');
assert.strictEqual(dayKey(D(2026, 1, 2, 0)), '2026-01-02', 'mois et jour sur deux chiffres');
assert.strictEqual(dayKey(undefined), '');
assert.deepStrictEqual(groupHistoryByDay([null, 5]), [], 'entrees mal formees ignorees');
assert.deepStrictEqual(groupHistoryByDay(null), []);

console.log('OK groupes jeu / campagne');
