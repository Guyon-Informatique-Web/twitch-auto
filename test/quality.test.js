// Tests du module quality : on charge le VRAI src/content/modules/quality.js, plusieurs fois,
// sur UN localStorage PARTAGE (comme tous les onglets twitch.tv). Fait mesure le 06/10/2026 :
// le lecteur Twitch ne lit 'video-quality' qu'a son demarrage, donc ce qui compte est la valeur
// presente au moment ou un lecteur demarre. Regle verifiee ici : un onglet au premier plan ne
// demarre jamais sur un 160p laisse par un onglet cache (ferme, recharge ou revenu devant).
const assert = require('assert');
const path = require('path');

const MOD = path.join(__dirname, '../src/content/modules/quality.js');
const LOW = '160p30';

function makeStorage(init) {
  const m = new Map(Object.entries(init || {}));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); }
  };
}
const q = (ls) => JSON.parse(ls.getItem('video-quality') || '{}');
const vq = (v, extra) => JSON.stringify({ default: v, ...(extra || {}) });

// Un "onglet" : sa propre instance du module, son document, son URL, ses ecouteurs.
function openTab(ls, hidden, path) {
  const listeners = { visibilitychange: [], pagehide: [], dom: [] };
  const loc = { pathname: path || '/chaine' };
  const doc = {
    hidden,
    addEventListener: (type, fn) => listeners[type].push(fn),
    removeEventListener: (type, fn) => { listeners[type] = listeners[type].filter((f) => f !== fn); }
  };
  const use = () => {
    global.window = global;
    global.localStorage = ls;
    global.document = doc;
    global.addEventListener = (type, fn) => listeners[type].push(fn);
    global.removeEventListener = (type, fn) => { listeners[type] = listeners[type].filter((f) => f !== fn); };
    global.location = loc;
    global.TA = {
      log: { info() {}, warn() {}, error() {} },
      dom: { subscribe: (cb) => { listeners.dom.push(cb); return () => { listeners.dom = listeners.dom.filter((f) => f !== cb); }; } }
    };
  };
  use();
  delete require.cache[require.resolve(MOD)];
  require(MOD);
  const mod = global.TA.modules.quality;
  return {
    start() { use(); mod.start(); },
    stop() { use(); mod.stop(); },
    show() { use(); doc.hidden = false; listeners.visibilitychange.forEach((f) => f()); },
    hide() { use(); doc.hidden = true; listeners.visibilitychange.forEach((f) => f()); },
    close() { use(); listeners.pagehide.forEach((f) => f()); },
    // Navigation interne de Twitch : l'URL change, le DOM bouge, aucun rechargement.
    navigate(p) { use(); loc.pathname = p; listeners.dom.forEach((f) => f()); }
  };
}

// --- Cas 1 : onglet qui demarre cache -> 160p ecrit, qualite d'origine gardee a part ---
{
  const ls = makeStorage({ 'video-quality': vq('720p60') });
  const a = openTab(ls, true);
  a.start();
  assert.strictEqual(q(ls).default, LOW, 'un lecteur qui demarre en fond doit lire 160p');
  assert.strictEqual(ls.getItem('ta_saved_quality'), '720p60', 'la qualite de l utilisateur est gardee');
}

// --- Cas 2 : retour au premier plan -> qualite de l'utilisateur remise ---
{
  const ls = makeStorage({ 'video-quality': vq('720p60') });
  const a = openTab(ls, true);
  a.start();
  a.show();
  assert.strictEqual(q(ls).default, '720p60');
  assert.strictEqual(ls.getItem('ta_saved_quality'), null, 'plus rien en attente apres restauration');
}

// --- Cas 3 (REGRESSION mesuree) : onglet cache FERME, puis stream ouvert au premier plan ---
//     Avant : le 160p restait dans la cle commune et le nouveau stream demarrait en 160p.
{
  const ls = makeStorage({ 'video-quality': vq('chunked') });
  const a = openTab(ls, true);
  a.start();
  a.close();                                   // pagehide d'un onglet cache
  assert.strictEqual(q(ls).default, 'chunked', 'fermer un onglet cache ne laisse pas le 160p');
  const c = openTab(ls, false);
  c.start();
  assert.strictEqual(q(ls).default, 'chunked', 'le stream ouvert au premier plan demarre en qualite source');
}

// --- Cas 4 : etat laisse par un onglet tue sans pagehide -> repare au demarrage d'un onglet visible ---
{
  const ls = makeStorage({ 'video-quality': vq(LOW), ta_saved_quality: '1080p60' });
  const c = openTab(ls, false);
  c.start();
  assert.strictEqual(q(ls).default, '1080p60', 'un onglet visible remet la qualite de l utilisateur avant que son lecteur demarre');
  assert.strictEqual(ls.getItem('ta_saved_quality'), null);
}

// --- Cas 5 : l'utilisateur a CHOISI 160p (apres la reparation unique) -> jamais touche ---
{
  const ls = makeStorage({ 'video-quality': vq(LOW), ta_quality_v2: '1' });
  const a = openTab(ls, true);
  a.start();
  assert.strictEqual(ls.getItem('ta_saved_quality'), null, 'rien a garder : 160p est son choix');
  a.show();
  assert.strictEqual(q(ls).default, LOW, 'son 160p reste en place');
}

// --- Cas 6 : qualite changee a la main entre-temps -> on garde le nouveau choix ---
{
  const ls = makeStorage({ 'video-quality': vq('480p30'), ta_saved_quality: 'chunked' });
  const c = openTab(ls, false);
  c.start();
  assert.strictEqual(q(ls).default, '480p30', 'une valeur autre que 160p est un choix de l utilisateur');
  assert.strictEqual(ls.getItem('ta_saved_quality'), null, 'la valeur gardee perimee est effacee');
}

// --- Cas 7 : deux onglets caches, l'un se ferme, l'autre se recharge en fond ---
{
  const ls = makeStorage({ 'video-quality': vq('chunked') });
  const a = openTab(ls, true); a.start();
  const b = openTab(ls, true); b.start();
  assert.strictEqual(ls.getItem('ta_saved_quality'), 'chunked', 'le second onglet n ecrase pas la valeur gardee');
  a.close();
  assert.strictEqual(q(ls).default, 'chunked', 'apres la fermeture de A, plus de 160p residuel');
  b.close();                                   // B se recharge (watchdog) : pagehide...
  const b2 = openTab(ls, true); b2.start();    // ...puis demarre de nouveau en fond
  assert.strictEqual(q(ls).default, LOW, 'le lecteur de B redemarre bien en 160p');
  const c = openTab(ls, false); c.start();     // l'utilisateur ouvre un stream au premier plan
  assert.strictEqual(q(ls).default, 'chunked', 'le stream au premier plan ne demarre pas en 160p');
}

// --- Cas 8 : couper la fonction remet la qualite ; sans qualite au depart, on la remet ABSENTE
//     (le lecteur reprend son propre choix par defaut, au lieu d'etre force en "source") ---
{
  const ls = makeStorage();
  const a = openTab(ls, true);
  a.start();
  assert.strictEqual(q(ls).default, LOW);
  a.stop();
  assert.strictEqual('default' in q(ls), false, 'pas de qualite au depart -> pas de qualite apres');
}

// --- Cas 9 : read-modify-write, les autres champs de la cle Twitch sont preserves ---
{
  const ls = makeStorage({ 'video-quality': vq('720p60', { other: 42 }) });
  const a = openTab(ls, true);
  a.start();
  a.show();
  assert.deepStrictEqual(q(ls), { default: '720p60', other: 42 });
}

// --- Cas 10 (mise a jour depuis < 1.12.1) : 160p laisse par l'ancienne version, sans valeur gardee ---
//     Repare UNE fois au premier onglet visible ; ensuite un 160p sans valeur gardee est un choix.
{
  const ls = makeStorage({ 'video-quality': vq(LOW, { other: 1 }) });
  const c = openTab(ls, false);
  c.start();
  assert.deepStrictEqual(q(ls), { other: 1 }, 'le 160p herite est retire, le reste de la cle est garde');
  assert.strictEqual(ls.getItem('ta_quality_v2'), '1', 'la reparation ne se fera plus');
  ls.setItem('video-quality', vq(LOW));          // l'utilisateur choisit 160p lui-meme ensuite
  const d = openTab(ls, false);
  d.start();
  assert.strictEqual(q(ls).default, LOW, 'un 160p choisi apres la reparation est respecte');
}
{
  // Premier lancement dans un onglet CACHE : la reparation attend un onglet visible.
  const ls = makeStorage({ 'video-quality': vq(LOW) });
  const b = openTab(ls, true);
  b.start();
  assert.strictEqual(ls.getItem('ta_quality_v2'), null, 'pas de reparation depuis un onglet cache');
  const c = openTab(ls, false);
  c.start();
  assert.strictEqual('default' in q(ls), false, 'le premier onglet visible repare');
}

// --- Cas 11 : onglet visible qui change de chaine SANS recharger (navigation interne) pendant
//     qu'un onglet cache a pose le 160p -> le nouveau lecteur part dans la qualite de l'utilisateur ---
{
  const ls = makeStorage({ 'video-quality': vq('1080p60'), ta_quality_v2: '1' });
  const a = openTab(ls, false, '/zerator'); a.start();
  const b = openTab(ls, true, '/gotaga'); b.start();      // B cache demarre : 160p pose
  assert.strictEqual(q(ls).default, LOW);
  a.navigate('/kamet0');
  assert.strictEqual(q(ls).default, '1080p60', 'la chaine ouverte au premier plan demarre en 1080p60');
  // Raid dans l'onglet cache B : son nouveau lecteur doit repartir en 160p.
  b.navigate('/squeezie');
  assert.strictEqual(q(ls).default, LOW, 'le lecteur recu par raid en arriere-plan demarre en 160p');
  // Un simple mouvement du DOM sans changement d'URL ne touche a rien.
  a.navigate('/kamet0');
  assert.strictEqual(q(ls).default, LOW, 'pas de restauration sans changement de chaine');
}

console.log('OK quality');
