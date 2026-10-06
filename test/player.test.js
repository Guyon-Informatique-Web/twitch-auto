// Tests de src/content/player.js (monde de la page) : on charge le VRAI fichier avec un faux
// arbre React et un faux lecteur qui reproduisent l'API mesuree le 06/10/2026 sur twitch.tv
// (getQualities, getQuality, setQuality, isAutoQualityMode, setAutoQualityMode).
const assert = require('assert');
const path = require('path');

const MOD = path.join(__dirname, '../src/content/player.js');
const Q = [
  { name: '1080p60', group: 'chunked', height: 1080 },
  { name: '720p60', group: '720p60', height: 720 },
  { name: '160p', group: '160p30', height: 160 }
];

function load({ auto = true, current = Q[0], withPlayer = true, qualities = Q, store = null, video = null } = {}) {
  const calls = [];
  const player = {
    q: current, auto, list: qualities,
    getQualities() { return this.list; },
    getQuality() { return this.q; },
    isAutoQualityMode() { return this.auto; },
    setQuality(q) { calls.push('set:' + q.group); this.q = q; this.auto = false; },
    setAutoQualityMode(b) { calls.push('auto:' + b); this.auto = b; }
  };
  // Le lecteur est porte par un ANCETRE du conteneur dans l'arbre React (fibre.return).
  const top = { memoizedProps: withPlayer ? { mediaPlayerInstance: player } : {}, return: null };
  const mid = { memoizedProps: { other: 1 }, return: top };
  const root = { __reactFiber$abc123: { memoizedProps: {}, return: mid } };
  const handlers = {};
  let timers = [];
  const vis = { hidden: false };
  global.setTimeout = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };
  global.clearTimeout = (id) => { if (timers[id - 1]) timers[id - 1].fn = () => {}; };
  // Vraie visibilite lue sur le prototype (spoof.js ne masque que l'objet document).
  global.Document = function () {};
  Object.defineProperty(global.Document.prototype, 'hidden', { get() { return vis.hidden; }, configurable: true });
  global.document = {
    querySelector: (sel) => {
      if (sel === '[data-a-target="video-player"]') return root;
      if (sel === '[data-a-target="video-player"] video') return video;
      return null;
    },
    addEventListener: (type, fn) => { handlers[type] = fn; }
  };
  if (store) global.localStorage = { getItem: (k) => (k in store ? store[k] : null) };
  else delete global.localStorage;
  delete require.cache[require.resolve(MOD)];
  require(MOD);
  // Le retour est DIFFERE de 1,5 s : on fait passer le temps a la main.
  const flush = () => { const t = timers; timers = []; t.forEach((x) => x.fn()); };
  return {
    player, calls, vis, flush, top,
    pending: () => timers.filter((x) => x.fn.toString() !== '() => {}').length,
    low: () => handlers['ta-quality-low'](),
    restore: () => { handlers['ta-quality-restore'](); flush(); },
    restoreNoFlush: () => handlers['ta-quality-restore'](),
    visible: () => { vis.hidden = false; handlers.visibilitychange(); },
    input: (isTrusted = true) => handlers.pointerdown({ isTrusted })
  };
}

// --- Cas 1 : qualite automatique -> 160p en fond, retour en automatique ---
{
  const d = load({ auto: true });
  d.low();
  assert.strictEqual(d.player.q.group, '160p30', 'le lecteur deja lance passe en 160p');
  d.restore();
  assert.deepStrictEqual(d.calls, ['set:160p30', 'auto:true'], 'au retour : qualite automatique, comme avant');
}

// --- Cas 2 : qualite choisie a la main (720p) -> 160p, puis retour exact a 720p ---
{
  const d = load({ auto: false, current: Q[1] });
  d.low();
  d.restore();
  assert.deepStrictEqual(d.calls, ['set:160p30', 'set:720p60']);
  assert.strictEqual(d.player.auto, false, 'pas de passage force en automatique');
}

// --- Cas 3 : deja en 160p choisi a la main -> on ne touche a rien, ni en fond ni au retour ---
{
  const d = load({ auto: false, current: Q[2] });
  d.low();
  d.restore();
  assert.deepStrictEqual(d.calls, []);
}

// --- Cas 4 : signal repete en fond (toutes les 15 s) -> la qualite d'origine n'est pas ecrasee ---
{
  const d = load({ auto: false, current: Q[1] });
  d.low(); d.low(); d.low();
  d.restore();
  assert.deepStrictEqual(d.calls, ['set:160p30', 'set:720p60'], 'on revient a 720p, pas a 160p');
}

// --- Cas 5 : flux pas pret (pub) -> rien, puis le signal suivant agit ---
{
  const d = load({ auto: true, qualities: [] });
  d.low();
  assert.deepStrictEqual(d.calls, []);
  d.player.list = Q;
  d.low();
  assert.deepStrictEqual(d.calls, ['set:160p30']);
}

// --- Cas 6 : lecteur introuvable (Twitch a change sa page) -> aucun effet, aucune erreur ---
{
  const d = load({ withPlayer: false });
  d.low();
  d.restore();
  assert.deepStrictEqual(d.calls, []);
}

// --- Cas 7 : retour sans passage en 160p prealable -> rien (on ne touche pas au choix de l'utilisateur) ---
{
  const d = load({ auto: false, current: Q[1] });
  d.restore();
  assert.deepStrictEqual(d.calls, []);
}

// --- Cas 8 : reparti en arriere-plan pendant les 1,5 s du retour -> le retour est annule ---
{
  const d = load({ auto: true });
  d.low();
  d.restoreNoFlush();
  d.low();               // l'onglet repasse en fond avant l'echeance
  d.flush();
  assert.deepStrictEqual(d.calls, ['set:160p30'], 'pas de retour en automatique si on est reparti en fond');
}

// --- Cas 9 : lecteur DEMARRE en 160p a cause de la cle commune (onglet ouvert ou recharge en
// fond) -> au retour, la qualite mise de cote par le module quality ---
{
  const d = load({ auto: false, current: Q[2], store: { ta_saved_quality: '720p60' } });
  d.low();
  assert.deepStrictEqual(d.calls, [], 'deja en 160p : rien a faire en fond');
  d.restore();
  assert.deepStrictEqual(d.calls, ['set:720p60'], 'retour a la qualite d\'avant, pas de 160p fige');
}
{
  const d = load({ auto: false, current: Q[2], store: { ta_saved_quality: '' } });
  d.low();
  d.restore();
  assert.deepStrictEqual(d.calls, ['auto:true'], "'' = pas de qualite par defaut = automatique");
}

// --- Cas 10 : 'chunked' (source) absent de la liste -> la plus haute qualite du flux ---
{
  const list = [{ group: '1080p60', height: 1080 }, { group: '480p30', height: 480 }, { group: '160p30', height: 160 }];
  const d = load({ auto: false, current: list[2], qualities: list, store: { ta_saved_quality: 'chunked' } });
  d.low();
  d.restore();
  assert.deepStrictEqual(d.calls, ['set:1080p60']);
}

// --- Cas 11 : lecteur absent au retour (pub) -> on garde la qualite d'avant et on reessaie ---
{
  const d = load({ auto: false, current: Q[1] });
  d.low();
  const props = d.top.memoizedProps;
  d.top.memoizedProps = {};          // lecteur demonte
  d.restore();
  assert.deepStrictEqual(d.calls, ['set:160p30'], 'rien tant que le lecteur manque');
  d.top.memoizedProps = props;       // lecteur revenu
  d.flush();
  assert.deepStrictEqual(d.calls, ['set:160p30', 'set:720p60'], 'applique au nouvel essai');
}
{
  const d = load({ auto: false, current: Q[1] });
  d.low();
  d.top.memoizedProps = {};
  d.restore();
  for (let i = 0; i < 10; i++) d.flush();
  assert.ok(d.pending() > 0, 'toujours en attente apres 20 s (pub, video qui se charge)');
  for (let i = 0; i < 10; i++) d.flush();
  assert.strictEqual(d.pending(), 0, 'abandon apres 30 s, plus aucune minuterie');
}

// --- Cas 12 : module coupe pendant que l'onglet etait cache -> retour au premier plan quand meme ---
{
  const d = load({ auto: false, current: Q[1] });
  d.vis.hidden = true;
  d.low();
  d.restore();                       // signal du module coupe : arrive onglet cache, sans effet
  assert.deepStrictEqual(d.calls, ['set:160p30']);
  d.visible();
  d.flush();
  assert.deepStrictEqual(d.calls, ['set:160p30', 'set:720p60'], 'remis en revenant devant');
}

// --- Cas 13 : l'utilisateur choisit une autre qualite pendant le delai -> on la respecte ---
{
  const d = load({ auto: false, current: Q[1] });
  d.low();
  d.restoreNoFlush();
  d.player.q = Q[0];                 // 1080p choisi a la main
  d.flush();
  assert.deepStrictEqual(d.calls, ['set:160p30']);
}

// --- Cas 14 : video en pause au retour -> relancee, sauf pause voulue ---
{
  let plays = 0;
  const video = { paused: false, ended: false, play() { plays++; return Promise.resolve(); } };
  const d = load({ auto: true, video });
  d.low();
  d.restore();
  video.paused = true;
  d.flush();                         // controle 4 s plus tard
  assert.strictEqual(plays, 1, 'flux bloque apres le retour : relance');
}
{
  let plays = 0;
  const video = { paused: false, ended: false, play() { plays++; return Promise.resolve(); } };
  const d = load({ auto: true, video });
  d.low();
  d.restore();
  video.paused = true;
  d.input();                         // l'utilisateur a clique (pause volontaire)
  d.flush();
  assert.strictEqual(plays, 0, 'pause de l\'utilisateur respectee');
}
{
  let plays = 0;
  const video = { paused: false, ended: false, play() { plays++; return Promise.resolve(); } };
  const d = load({ auto: true, video });
  d.low();
  d.restore();
  video.paused = true;
  d.input(false);                    // evenement synthetique (script) : ne compte pas
  d.flush();
  assert.strictEqual(plays, 1);
}
{
  let plays = 0;
  const video = { paused: true, ended: false, play() { plays++; return Promise.resolve(); } };
  const d = load({ auto: true, video });
  d.low();                           // deja en pause en partant
  d.restore();
  d.flush();
  assert.strictEqual(plays, 0, 'une video en pause avant le depart reste en pause');
}

// --- Cas 14 bis : pause faite PENDANT le delai de 1,5 s du retour -> respectee aussi ---
{
  let plays = 0;
  const video = { paused: false, ended: false, play() { plays++; return Promise.resolve(); } };
  const d = load({ auto: true, video });
  d.low();
  d.restoreNoFlush();                // retour au premier plan
  video.paused = true;
  d.input();                         // pause de l'utilisateur avant que la qualite ne revienne
  d.flush();                         // la qualite revient
  d.flush();                         // controle 4 s plus tard
  assert.strictEqual(plays, 0);
}

// --- Cas 14 ter : une entree "audio seul" n'est jamais prise pour le plus bas ---
{
  const list = [{ group: 'audio_only', height: 0 }, ...Q];
  const d = load({ auto: true, qualities: list });
  d.low();
  assert.deepStrictEqual(d.calls, ['set:160p30']);
}

// --- Cas 15 : onglet ouvert en fond, jamais affiche : lecteur pas pret tant qu'il est cache, puis
// demarre en 160p (cle commune) quand on l'affiche -> la qualite d'avant est remise ---
{
  const store = { ta_saved_quality: '720p60' };
  const d = load({ auto: false, current: null, qualities: [], store });
  d.low();                           // en fond : rien a piloter, mais la qualite d'avant est relevee
  delete store.ta_saved_quality;     // le module l'efface au retour au premier plan...
  d.restoreNoFlush();                // ...juste avant d'envoyer 'restore'
  d.flush();                         // video pas encore chargee : nouvel essai
  assert.deepStrictEqual(d.calls, []);
  d.player.list = Q; d.player.q = Q[2];   // la video demarre, en 160p
  d.flush();
  assert.deepStrictEqual(d.calls, ['set:720p60']);
}

// --- Cas 16 : meme situation, mais le lecteur a demarre a la bonne qualite -> rien ---
{
  const store = { ta_saved_quality: '720p60' };
  const d = load({ auto: true, current: Q[1], qualities: [], store });
  d.low();
  d.player.list = Q;
  d.restore();
  assert.deepStrictEqual(d.calls, [], 'pas au plus bas : la qualite relevee ne sert pas');
}

console.log('OK player');
