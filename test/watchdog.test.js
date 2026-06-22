// Tests du module watchdog : on charge le VRAI src/content/modules/watchdog.js dans un
// environnement navigateur simule (DOM + horloge + sessionStorage controles) pour verifier
// le rechargement d'un onglet de chaine en arriere-plan dont le player reste fige, ET surtout
// l'arret apres N reloads consecutifs sans reprise (anti-boucle DUR).
const assert = require('assert');
const path = require('path');
const TAUtil = require('../src/shared/util.js');

const STALL = 10 * 60 * 1000;
const BASE = 30 * 1000 * 1000;     // base d'horloge >> STALL : expose une init manquante de lastOkTs
let clock = 0;
let intervals = [];

function installEnv() {
  clock = BASE;
  intervals = [];
  global.setInterval = (fn, delay) => { intervals.push({ fn, delay }); return intervals.length; };
  global.clearInterval = () => {};
  global.Date.now = () => clock;
}
function setClock(v) { clock = v; }

// videos : tableau d'objets {paused, ended, readyState} (mutables entre deux ticks). undefined -> un player en pause.
// offline : etat renvoye par la detection hors-ligne mutualisee (TA.dom.isChannelOffline), mockee ici.
function loadWatchdog({ hidden = true, channel = 'chan', videos, offline = false, fails = null, failsForChannel = null } = {}) {
  installEnv();
  let reloadCount = 0;
  let offlineState = offline;          // mutable entre deux ticks (transition hors-ligne -> en ligne)
  const store = {};
  if (fails != null) store['ta_watchdog_state'] = JSON.stringify({ ch: failsForChannel || channel, n: fails });
  const vids = videos === undefined ? [{ paused: true, ended: false, readyState: 4 }] : videos;

  global.location = { reload: () => { reloadCount += 1; } };
  global.sessionStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); }
  };
  global.document = {
    hidden,
    querySelectorAll: (sel) => (sel === 'video' ? vids : []),
    querySelector: () => null,
    body: { textContent: '' }
  };
  global.window = global;
  global.TAUtil = TAUtil;
  global.TA = {
    selectors: { playerOverlay: ['.overlay'], offlinePatterns: [/hors[- ]?ligne/i, /\boffline\b/i] },
    log: { info() {}, warn() {}, error() {} },
    dom: { currentChannel: () => channel, findFirst: () => null, isChannelOffline: () => offlineState }
  };

  delete require.cache[require.resolve(path.join(__dirname, '../src/content/modules/watchdog.js'))];
  require('../src/content/modules/watchdog.js');

  return {
    mod: global.TA.modules.watchdog,
    tick: () => intervals[0].fn(),
    reloadCount: () => reloadCount,
    setOffline: (v) => { offlineState = v; },
    fails: () => { try { return JSON.parse(store['ta_watchdog_state'] || '{}').n || 0; } catch (e) { return 0; } },
    vids
  };
}

// --- Cas 1 : player fige > 10 min sur un onglet de chaine en arriere-plan -> reload (compteur a 1) ---
{
  const d = loadWatchdog();
  d.mod.start();
  setClock(BASE + STALL + 1000);
  d.tick();
  assert.strictEqual(d.reloadCount(), 1, 'un player fige >10 min en arriere-plan doit declencher un reload');
  assert.strictEqual(d.fails(), 1, 'le compteur de reloads consecutifs doit passer a 1');
  d.mod.stop();
}

// --- Cas 2 : le player joue -> jamais de reload ---
{
  const d = loadWatchdog({ videos: [{ paused: false, ended: false, readyState: 4 }] });
  d.mod.start();
  setClock(BASE + STALL + 1000);
  d.tick();
  assert.strictEqual(d.reloadCount(), 0, 'un player qui joue ne doit jamais etre recharge');
  d.mod.stop();
}

// --- Cas 3 : onglet au premier plan -> on ne recharge pas ---
{
  const d = loadWatchdog({ hidden: false });
  d.mod.start();
  setClock(BASE + STALL + 1000);
  d.tick();
  assert.strictEqual(d.reloadCount(), 0, 'pas de reload sur un onglet au premier plan');
  d.mod.stop();
}

// --- Cas 4 : chaine hors-ligne (detection mutualisee) -> pas de reload (autoswitch gere) ---
{
  const d = loadWatchdog({ offline: true });
  d.mod.start();
  setClock(BASE + STALL + 1000);
  d.tick();
  assert.strictEqual(d.reloadCount(), 0, 'pas de reload si la chaine est hors-ligne');
  d.mod.stop();
}

// --- Cas 5 : moins de 10 min de blocage -> pas encore de reload ---
{
  const d = loadWatchdog();
  d.mod.start();
  setClock(BASE + 5 * 60 * 1000);
  d.tick();
  assert.strictEqual(d.reloadCount(), 0, 'pas de reload avant 10 min de blocage');
  d.mod.stop();
}

// --- Cas 6 : aucun element <video> (sous-page /about, /schedule...) -> pas de reload ---
{
  const d = loadWatchdog({ videos: [] });
  d.mod.start();
  setClock(BASE + STALL + 1000);
  d.tick();
  assert.strictEqual(d.reloadCount(), 0, 'pas de reload s il n y a aucun player video');
  d.mod.stop();
}

// --- Cas 7 : pas une page de chaine -> pas de reload ---
{
  const d = loadWatchdog({ channel: '' });
  d.mod.start();
  setClock(BASE + STALL + 1000);
  d.tick();
  assert.strictEqual(d.reloadCount(), 0, 'pas de reload hors d une page de chaine');
  d.mod.stop();
}

// --- Cas 8 (ANTI-BOUCLE DUR) : apres 3 reloads consecutifs sans reprise, on ABANDONNE ---
{
  const d = loadWatchdog({ fails: 3 });
  d.mod.start();
  setClock(BASE + STALL + 1000);
  d.tick();
  assert.strictEqual(d.reloadCount(), 0, 'apres 3 reloads sans reprise, le watchdog doit s arreter (pas de boucle infinie)');
  d.mod.stop();
}

// --- Cas 9 : une reprise de lecture remet le compteur a zero, le watchdog se re-arme ---
{
  const vid = { paused: false, ended: false, readyState: 4 };
  const d = loadWatchdog({ videos: [vid], fails: 3 });
  d.mod.start();
  setClock(BASE + 60 * 1000);
  d.tick();                                   // lecture OK -> compteur remis a zero
  assert.strictEqual(d.fails(), 0, 'une reprise de lecture doit remettre le compteur a zero');
  vid.paused = true;                          // nouveau blocage
  setClock(BASE + 60 * 1000 + STALL + 1000);
  d.tick();
  assert.strictEqual(d.reloadCount(), 1, 'apres une reprise, un nouveau blocage de 10 min doit pouvoir recharger');
  d.mod.stop();
}

// --- Cas 10 (CONTINU, pas cumule) : une reprise au milieu remet le minuteur de 10 min a zero ---
{
  const vid = { paused: true, ended: false, readyState: 4 };
  const d = loadWatchdog({ videos: [vid] });
  d.mod.start();                              // lastOk = BASE
  setClock(BASE + 6 * 60 * 1000);
  d.tick();                                   // 6 min de blocage -> pas de reload
  vid.paused = false;
  setClock(BASE + 7 * 60 * 1000);
  d.tick();                                   // reprise -> minuteur remis a zero (lastOk = BASE+7min)
  vid.paused = true;
  setClock(BASE + 14 * 60 * 1000);
  d.tick();                                   // 7 min depuis la reprise -> pas de reload (pas cumule)
  assert.strictEqual(d.reloadCount(), 0, 'le blocage doit etre CONTINU : une reprise remet le minuteur a zero');
  setClock(BASE + 18 * 60 * 1000);
  d.tick();                                   // 11 min continus depuis la reprise -> reload
  assert.strictEqual(d.reloadCount(), 1, 'apres 10 min CONTINUES depuis la reprise, reload');
  d.mod.stop();
}

// --- Cas 11 : changement de chaine -> le compteur d'abandon repart de zero (pas de contamination inter-chaine) ---
{
  const d = loadWatchdog({ channel: 'chan', fails: 3, failsForChannel: 'autre' }); // budget epuise pour une AUTRE chaine
  d.mod.start();
  setClock(BASE + STALL + 1000);
  d.tick();
  assert.strictEqual(d.reloadCount(), 1, 'un changement de chaine doit remettre le compteur d abandon a zero');
  assert.strictEqual(d.fails(), 1, 'le compteur repart a 1 pour la nouvelle chaine');
  d.mod.stop();
}

// --- Cas 12 (offline NON cumule) : une periode hors-ligne ne s accumule pas vers le minuteur ;
//     au retour en ligne, le minuteur de 10 min repart (pas de reload immediat). Ancre le
//     reset de lastOkTs dans la branche offline (sinon reload des le retour, sans echec de test). ---
{
  const vid = { paused: true, ended: false, readyState: 4 };
  const d = loadWatchdog({ videos: [vid], offline: true });
  d.mod.start();                                       // lastOk = BASE
  setClock(BASE + STALL + 1000);
  d.tick();                                            // hors-ligne >10 min -> pas de reload, lastOk remis a now
  assert.strictEqual(d.reloadCount(), 0, 'une chaine hors-ligne ne doit jamais etre rechargee');
  d.setOffline(false);                                 // retour en ligne, player encore fige
  setClock(BASE + STALL + 2000);
  d.tick();                                            // 1er tick post-retour : minuteur reparti -> pas de reload immediat
  assert.strictEqual(d.reloadCount(), 0, 'au retour en ligne le minuteur repart (la periode offline ne s accumule pas)');
  setClock(BASE + 2 * STALL + 2000);                   // 10 min CONTINUES de fige depuis le tick offline
  d.tick();
  assert.strictEqual(d.reloadCount(), 1, 'apres 10 min continues de fige post-retour, reload');
  d.mod.stop();
}

console.log('OK watchdog');
