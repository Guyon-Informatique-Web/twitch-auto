// Tests du module autoswitch : on charge le VRAI src/content/modules/autoswitch.js dans un
// environnement simule. autoswitch est le SEUL module qui agit de facon IRREVERSIBLE
// (location.assign -> change de chaine), donc sa logique anti-faux-positif est testee de pres :
//   - garde 2 ticks offline CONSECUTIFS avant de basculer (anti-transition de raid)
//   - compteur scope par chaine (un hit offline de la chaine quittee ne contamine pas la suivante)
//   - latch 'done' (une seule bascule), gardes (deja sur la cible / url vide / hors chaine)
//   - re-validation offline a l'echeance du delai de 3s (ne pas quitter une chaine redevenue live)
const assert = require('assert');
const path = require('path');

const FALLBACK = 'https://www.twitch.tv/fallback';

function loadAutoswitch({ channel = 'chan', url = FALLBACK, href = 'https://www.twitch.tv/chan' } = {}) {
  let assignCount = 0;
  let assignedTo = null;
  const timers = [];          // callbacks de setTimeout en attente (la bascule differee de 3s)
  let tickFn = null;          // le tick() capture via TA.dom.subscribe
  let curChannel = channel;
  let offline = false;

  global.window = global;
  global.setTimeout = (fn) => { timers.push(fn); return timers.length; };
  global.location = { href, assign: (u) => { assignCount += 1; assignedTo = u; } };
  global.TA = {
    settings: { autoSwitchUrl: url },
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
    fireTimers: () => { const t = timers.slice(); timers.length = 0; t.forEach((fn) => fn()); },
    pendingTimers: () => timers.length,
    assignCount: () => assignCount,
    assignedTo: () => assignedTo
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
  const d = loadAutoswitch({ href: FALLBACK });
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

console.log('OK autoswitch');
