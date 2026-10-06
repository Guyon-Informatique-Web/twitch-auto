// Tests du module autoswitch : on charge le VRAI src/content/modules/autoswitch.js dans un
// environnement simule. autoswitch est le SEUL module qui agit de facon IRREVERSIBLE
// (location.assign -> change de chaine), donc sa logique anti-faux-positif est testee de pres :
//   - garde 2 ticks offline CONSECUTIFS avant de basculer (anti-transition de raid)
//   - compteur scope par chaine (un hit offline de la chaine quittee ne contamine pas la suivante)
//   - latch 'done' (une seule bascule), gardes (deja sur la cible / url vide / hors chaine)
//   - re-validation offline a l'echeance du delai de 3s (ne pas quitter une chaine redevenue live)
//   - cible comparee en SLUG (casse, www, saisie nue) et plafond de 3 bascules / 10 min
const assert = require('assert');
const path = require('path');

const FALLBACK = 'https://www.twitch.tv/fallback';

function loadAutoswitch({ channel = 'chan', url = FALLBACK, href = 'https://www.twitch.tv/chan', session = null, list = null } = {}) {
  let assignCount = 0;
  let assignedTo = null;
  let timers = [];            // setTimeout en attente (la bascule differee de 3s) : { id, fn }
  let nextId = 1;
  let tickFn = null;          // le tick() capture via TA.dom.subscribe
  let curChannel = channel;
  let offline = false;
  const store = new Map(session ? Object.entries(session) : []);

  global.window = global;
  global.setTimeout = (fn) => { const id = nextId++; timers.push({ id, fn }); return id; };
  global.clearTimeout = (id) => { timers = timers.filter((x) => x.id !== id); };
  global.sessionStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
  global.TAUtil = require('../src/shared/util.js');
  global.location = { href, assign: (u) => { assignCount += 1; assignedTo = u; } };
  global.TA = {
    settings: { autoSwitchUrl: url, autoSwitchChannels: list || [] },
    selectors: { notChannelPaths: ['', 'directory', 'drops', 'login'] },
    log: { info() {}, warn() {}, error() {} },
    dom: {
      currentChannel: () => curChannel,
      isChannelOffline: () => offline,
      subscribe: (cb) => { tickFn = cb; return () => { tickFn = null; }; }
    }
  };

  delete require.cache[require.resolve(path.join(__dirname, '../src/content/modules/autoswitch.js'))];
  require('../src/content/modules/autoswitch.js');

  return {
    mod: global.TA.modules.autoswitch,
    tick: () => tickFn(),
    setOffline: (v) => { offline = v; },
    setChannel: (v) => { curChannel = v; },
    fireTimers: () => { const t = timers.slice(); timers = []; t.forEach((x) => x.fn()); },
    pendingTimers: () => timers.length,
    assignCount: () => assignCount,
    assignedTo: () => assignedTo,
    session: () => store
  };
}

// --- Cas 1 : un seul tick offline -> pas de bascule (il faut 2 confirmations) ---
{
  const d = loadAutoswitch();
  d.mod.start();
  d.setOffline(true);
  d.tick();
  assert.strictEqual(d.pendingTimers(), 0, 'un seul tick offline ne doit pas armer la bascule');
  d.mod.stop();
}

// --- Cas 2 : deux ticks offline consecutifs -> bascule (assign apres echeance du delai) ---
{
  const d = loadAutoswitch();
  d.mod.start();
  d.setOffline(true);
  d.tick();
  d.tick();
  assert.strictEqual(d.pendingTimers(), 1, 'deux ticks offline consecutifs doivent armer la bascule');
  d.fireTimers();
  assert.strictEqual(d.assignCount(), 1, 'la bascule doit appeler location.assign une seule fois');
  assert.strictEqual(d.assignedTo(), FALLBACK, 'la bascule doit viser l URL de repli');
  d.mod.stop();
}

// --- Cas 3 (anti-flicker) : offline -> online -> offline -> pas de bascule (compteur remis a zero) ---
{
  const d = loadAutoswitch();
  d.mod.start();
  d.setOffline(true);
  d.tick();                 // offlineHits = 1
  d.setOffline(false);
  d.tick();                 // online -> offlineHits remis a 0
  d.setOffline(true);
  d.tick();                 // offlineHits = 1 (et non 2)
  assert.strictEqual(d.pendingTimers(), 0, 'un flicker offline->online->offline ne doit pas basculer');
  d.mod.stop();
}

// --- Cas 4 (latch) : apres une bascule armee, le latch 'done' bloque toute bascule ulterieure ---
{
  const d = loadAutoswitch();
  d.mod.start();
  d.setOffline(true);
  d.tick(); d.tick();        // bascule armee (done = true)
  assert.strictEqual(d.pendingTimers(), 1, 'la 1ere bascule doit etre armee');
  d.tick(); d.tick();        // done -> early return, aucune 2e bascule
  assert.strictEqual(d.pendingTimers(), 1, 'le latch done empeche d armer une 2e bascule');
  d.mod.stop();
}

// --- Cas 5 : deja sur la cible -> jamais de bascule (anti-boucle) ---
{
  const d = loadAutoswitch({ channel: 'fallback', href: FALLBACK });
  d.mod.start();
  d.setOffline(true);
  d.tick(); d.tick();
  assert.strictEqual(d.pendingTimers(), 0, 'deja sur la cible -> pas de bascule');
  d.mod.stop();
}

// --- Cas 6 : aucune cible configuree (url vide) -> jamais de bascule ---
{
  const d = loadAutoswitch({ url: '' });
  d.mod.start();
  d.setOffline(true);
  d.tick(); d.tick();
  assert.strictEqual(d.pendingTimers(), 0, 'pas de cible -> jamais de bascule');
  d.mod.stop();
}

// --- Cas 7 : hors d une page de chaine -> jamais de bascule ---
{
  const d = loadAutoswitch({ channel: '' });
  d.mod.start();
  d.setOffline(true);
  d.tick(); d.tick();
  assert.strictEqual(d.pendingTimers(), 0, 'hors page de chaine -> jamais de bascule');
  d.mod.stop();
}

// --- Cas 8 (compteur scope par chaine) : un hit offline de la chaine A ne se reporte pas sur B (raid SPA) ---
{
  const d = loadAutoswitch({ channel: 'A' });
  d.mod.start();
  d.setOffline(true);
  d.tick();                 // A vue offline -> offlineHits = 1 (pas de bascule)
  d.setChannel('B');        // raid : navigation SPA vers B sans reload (start() pas rappele)
  d.tick();                 // 1er tick sur B : compteur remis a zero -> offlineHits = 1, PAS 2
  assert.strictEqual(d.pendingTimers(), 0, 'un hit offline de la chaine quittee ne doit pas se reporter sur la chaine recue par raid');
  d.tick();                 // 2e tick offline consecutif sur B -> maintenant on bascule
  assert.strictEqual(d.pendingTimers(), 1, 'deux ticks offline sur la nouvelle chaine arment bien la bascule');
  d.mod.stop();
}

// --- Cas 9 (re-validation a l echeance) : si la chaine redevient live pendant les 3s, pas de bascule + re-arme ---
{
  const d = loadAutoswitch();
  d.mod.start();
  d.setOffline(true);
  d.tick(); d.tick();        // bascule armee
  assert.strictEqual(d.pendingTimers(), 1, 'bascule armee');
  d.setOffline(false);       // la chaine repasse EN DIRECT avant l echeance du delai
  d.fireTimers();            // le timer re-valide l etat -> ne navigue pas
  assert.strictEqual(d.assignCount(), 0, 'une chaine redevenue live pendant le delai ne doit pas etre quittee');
  d.setOffline(true);        // re-offline durable -> on doit pouvoir re-armer
  d.tick(); d.tick();
  assert.strictEqual(d.pendingTimers(), 1, 'apres re-arme, deux nouvelles confirmations offline rebasculent');
  d.fireTimers();
  assert.strictEqual(d.assignCount(), 1, 'la bascule part bien si la chaine est toujours offline a l echeance');
  d.mod.stop();
}

// --- Cas 10 (REGRESSION boucle) : cible saisie sans www et avec une autre casse, alors qu'on
//     est deja dessus et qu'elle est hors-ligne -> AUCUNE bascule (l'ancienne garde par prefixe
//     d'URL ne la reconnaissait pas et redirigeait vers elle-meme toutes les ~4 s) ---
{
  const d = loadAutoswitch({ channel: 'fallback', url: 'https://twitch.tv/FallBack', href: 'https://www.twitch.tv/fallback' });
  d.mod.start();
  d.setOffline(true);
  d.tick(); d.tick(); d.tick();
  assert.strictEqual(d.pendingTimers(), 0, 'deja sur la chaine de repli (autre casse, sans www) -> pas de bascule');
  d.mod.stop();
}

// --- Cas 11 : un nom de chaine nu suffit, la bascule vise l'URL canonique ---
{
  const d = loadAutoswitch({ url: 'Fallback' });
  d.mod.start();
  d.setOffline(true);
  d.tick(); d.tick();
  d.fireTimers();
  assert.strictEqual(d.assignedTo(), 'https://www.twitch.tv/fallback', 'nom nu -> https://www.twitch.tv/<slug>');
  d.mod.stop();
}

// --- Cas 12 : cible invalide (autre site, chemin reserve, pas de chaine) -> jamais de bascule ---
['https://evil.example/x', 'https://www.twitch.tv/directory', 'twitch.tv/'].forEach((url) => {
  const d = loadAutoswitch({ url });
  d.mod.start();
  d.setOffline(true);
  d.tick(); d.tick();
  assert.strictEqual(d.pendingTimers(), 0, `cible invalide "${url}" -> pas de bascule`);
  d.mod.stop();
});

// --- Cas 13 : plafond de 3 bascules / 10 min pour l'onglet (filet anti-boucle ultime) ---
{
  const now = Date.now();
  const d = loadAutoswitch({ session: { ta_autoswitch_log: JSON.stringify([now - 1000, now - 2000, now - 3000]) } });
  d.mod.start();
  d.setOffline(true);
  d.tick(); d.tick();
  assert.strictEqual(d.pendingTimers(), 0, '3 bascules recentes -> on reste sur place');
  d.mod.stop();
}
{
  const d = loadAutoswitch();
  d.mod.start();
  d.setOffline(true);
  d.tick(); d.tick();
  d.fireTimers();
  assert.strictEqual(JSON.parse(d.session().get('ta_autoswitch_log')).length, 1, 'chaque bascule est enregistree');
  d.mod.stop();
}

// --- Cas 14 : couper la fonction pendant les 3 s annule la bascule armee ---
{
  const d = loadAutoswitch();
  d.mod.start();
  d.setOffline(true);
  d.tick(); d.tick();
  assert.strictEqual(d.pendingTimers(), 1, 'bascule armee');
  d.mod.stop();
  assert.strictEqual(d.pendingTimers(), 0, 'stop() annule le minuteur');
  assert.strictEqual(d.assignCount(), 0, 'aucune navigation apres stop()');
}

// --- Cas 15 : changement de chaine (raid) pendant les 3 s -> on ne quitte pas la nouvelle ---
{
  const d = loadAutoswitch({ channel: 'A' });
  d.mod.start();
  d.setOffline(true);
  d.tick(); d.tick();
  d.setChannel('B');
  d.fireTimers();
  assert.strictEqual(d.assignCount(), 0, 'la chaine a change pendant le delai -> pas de bascule');
  d.mod.stop();
}

// --- Cas 16 (v1.13, liste) : hors liste -> la premiere ; sur une chaine de la liste -> la suivante ---
{
  const d = loadAutoswitch({ channel: 'zz', url: '', list: ['alpha', 'beta', 'gamma'] });
  d.mod.start(); d.setOffline(true); d.tick(); d.tick(); d.fireTimers();
  assert.strictEqual(d.assignedTo(), 'https://www.twitch.tv/alpha', 'hors liste -> premiere chaine');
  d.mod.stop();
}
{
  const d = loadAutoswitch({ channel: 'beta', url: '', list: ['alpha', 'beta', 'gamma'] });
  d.mod.start(); d.setOffline(true); d.tick(); d.tick(); d.fireTimers();
  assert.strictEqual(d.assignedTo(), 'https://www.twitch.tv/gamma', 'beta hors ligne -> gamma');
  d.mod.stop();
}

// --- Cas 17 : derniere chaine de la liste hors ligne -> on reste (jamais de retour au debut) ---
{
  const d = loadAutoswitch({ channel: 'gamma', url: '', list: ['alpha', 'beta', 'gamma'] });
  d.mod.start(); d.setOffline(true); d.tick(); d.tick();
  assert.strictEqual(d.pendingTimers(), 0, 'bout de la liste : pas de bascule');
  d.mod.stop();
}

// --- Cas 18 : la liste prime sur l'ancienne chaine unique ; doublons et invalides ecartes ---
{
  const d = loadAutoswitch({ channel: 'zz', url: 'https://www.twitch.tv/ancienne', list: ['https://evil.example/x', 'Alpha', 'alpha'] });
  d.mod.start(); d.setOffline(true); d.tick(); d.tick(); d.fireTimers();
  assert.strictEqual(d.assignedTo(), 'https://www.twitch.tv/alpha');
  d.mod.stop();
}

// --- Cas 19 : une liste de 5 doit pouvoir etre parcourue malgre le plafond de 3 ---
{
  const now = Date.now();
  const d = loadAutoswitch({ channel: 'c4', url: '', list: ['c1', 'c2', 'c3', 'c4', 'c5'],
    session: { ta_autoswitch_log: JSON.stringify([now - 1000, now - 2000, now - 3000]) } });
  d.mod.start(); d.setOffline(true); d.tick(); d.tick(); d.fireTimers();
  assert.strictEqual(d.assignedTo(), 'https://www.twitch.tv/c5', 'plafond = taille de la liste (5)');
  d.mod.stop();
}

console.log('OK autoswitch');
