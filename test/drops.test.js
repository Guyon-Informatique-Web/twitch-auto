// Tests du module drops : on charge le VRAI src/content/modules/drops.js dans un
// environnement navigateur simule (DOM + timers + horloge controles) pour verifier
// le rechargement periodique de la page inventaire (maybeRefresh).
const assert = require('assert');
const path = require('path');

// --- Faux ordonnanceur de timers + horloge deterministes ---
let clock = 0;
let nextId = 1;
let timers = [];        // setTimeout : { id, fn, due }
let intervals = [];     // setInterval : { id, fn, delay }

function installEnv() {
  clock = 100000;       // > COOLDOWN pour que le 1er tick passe le garde (lastClick initial = 0)
  nextId = 1;
  timers = [];
  intervals = [];

  global.setTimeout = (fn, delay) => { const id = nextId++; timers.push({ id, fn, due: clock + (delay || 0) }); return id; };
  global.clearTimeout = (id) => { const i = timers.findIndex((t) => t.id === id); if (i >= 0) timers.splice(i, 1); };
  global.setInterval = (fn, delay) => { const id = nextId++; intervals.push({ id, fn, delay }); return id; };
  global.clearInterval = (id) => { const i = intervals.findIndex((t) => t.id === id); if (i >= 0) intervals.splice(i, 1); };
  global.Date.now = () => clock;
}

// Avance l'horloge en executant les setTimeout arrives a echeance (dans l'ordre).
function advance(ms) {
  const target = clock + ms;
  for (;;) {
    const due = timers.filter((t) => t.due <= target).sort((a, b) => a.due - b.due);
    if (!due.length) break;
    const t = due[0];
    timers.splice(timers.indexOf(t), 1);
    clock = t.due;
    t.fn();
  }
  clock = target;
}

// Avance l'horloge SANS executer les timers (pour tester un claim encore en cours).
function setClock(v) { clock = v; }

// Charge drops.js a neuf avec un faux DOM/TA. Renvoie les leviers de pilotage.
function loadDrops({ pathname = '/drops/inventory', hasButton = true, cardName = null } = {}) {
  installEnv();

  let reloadCount = 0;
  let inventoryReloadCount = 0;
  const clickedEls = [];
  const reportedNames = [];
  // Un bouton de claim ; quand cardName est fourni, son libelle CoreText interne sert de nom.
  const btn = {
    textContent: 'En profiter',
    getAttribute: () => '',
    querySelectorAll: (sel) => (cardName && /CoreText/.test(String(sel))) ? [{ textContent: cardName }] : [],
    parentElement: null
  };

  global.location = { pathname, reload: () => { reloadCount += 1; } };
  global.document = {
    hidden: false,
    querySelectorAll: (sel) => (hasButton && sel === '.claim') ? [btn] : []
  };
  global.window = global;
  global.TAUtil = require('../src/shared/util.js');
  global.TA = {
    selectors: {
      dropClaim: ['.claim'],
      dropClaimTextHints: ['en profiter'],
      dropClaimExact: ['en profiter']
    },
    log: { info() {}, warn() {}, error() {} },
    report: (kind, payload) => { reportedNames.push(payload && payload.name); },
    reloadInventory: () => { inventoryReloadCount += 1; }
  };

  let tickCb = null;
  global.TA.dom = {
    subscribe: (cb) => { tickCb = cb; cb(); return () => {}; },
    isClickable: () => true,
    click: (el) => { clickedEls.push(el); return true; },
    currentChannel: () => 'chan'
  };

  delete require.cache[require.resolve(path.join(__dirname, '../src/content/modules/drops.js'))];
  require('../src/content/modules/drops.js');
  const mod = global.TA.modules.drops;

  return {
    mod,
    refresh: () => intervals[0].fn(),   // declenche maybeRefresh (la seule callback setInterval)
    refreshDelay: () => intervals[0].delay,
    tick: () => tickCb(),
    clickedEls,
    reloadCount: () => reloadCount,
    inventoryReloadCount: () => inventoryReloadCount,
    lastReportedName: () => reportedNames[reportedNames.length - 1]
  };
}

// --- Cas 1 (REGRESSION) : apres une sequence de claim TERMINEE, l'inventaire doit se recharger ---
{
  const d = loadDrops();
  d.mod.start();                       // subscribe -> 1er tick -> reclame le drop, arme le retry
  assert.strictEqual(d.clickedEls.length, 1, 'le drop dispo doit etre reclame au demarrage');

  advance(4300);                       // le retry s'execute : plus de drop a reclamer -> fin de sequence
  advance(4000);                       // on depasse COOLDOWN*2 depuis le dernier clic (8000 ms)

  d.refresh();                         // tick periodique de rechargement de l'inventaire
  assert.strictEqual(d.reloadCount(), 1, 'apres un claim termine, maybeRefresh doit recharger l inventaire');
  d.mod.stop();
}

// --- Cas 2 : pendant une sequence de claim EN COURS, on ne recharge pas (anti-coupure) ---
{
  const d = loadDrops();
  d.mod.start();                       // reclame + arme le retry, qui n'est PAS encore execute
  setClock(100000 + 8001);             // depasse COOLDOWN*2 mais le retry reste en attente
  d.refresh();
  assert.strictEqual(d.reloadCount(), 0, 'pas de reload pendant une sequence de claim en cours');
  d.mod.stop();
}

// --- Cas 3 : hors page inventaire, jamais de reload ---
{
  const d = loadDrops({ pathname: '/somestreamer', hasButton: false });
  d.mod.start();
  setClock(100000 + 60000);
  d.refresh();
  assert.strictEqual(d.reloadCount(), 0, 'pas de reload hors de la page inventaire');
  d.mod.stop();
}

// --- Cas 4 : l'inventaire se recharge toutes les 3 min ---
{
  const d = loadDrops({ hasButton: false });
  d.mod.start();
  assert.strictEqual(d.refreshDelay(), 3 * 60 * 1000, 'la cadence de rechargement de l inventaire doit etre 3 min');
  d.mod.stop();
}

// --- Cas 5 : un drop reclame SUR UN STREAM declenche le rechargement de l'inventaire ---
{
  const d = loadDrops({ pathname: '/somestreamer', hasButton: true });
  d.mod.start();                       // reclame le drop via le bandeau du stream
  assert.strictEqual(d.clickedEls.length, 1, 'le drop du bandeau stream doit etre reclame');
  assert.strictEqual(d.inventoryReloadCount(), 1, 'un claim sur un stream doit demander le rechargement de l inventaire');
  assert.strictEqual(d.reloadCount(), 0, 'on ne recharge pas la page du stream elle-meme');
  d.mod.stop();
}

// --- Cas 6 : un drop reclame SUR la page inventaire ne redemande pas de rechargement (maybeRefresh s'en charge) ---
{
  const d = loadDrops({ pathname: '/drops/inventory', hasButton: true });
  d.mod.start();
  assert.strictEqual(d.clickedEls.length, 1, 'le drop de l inventaire doit etre reclame');
  assert.strictEqual(d.inventoryReloadCount(), 0, 'pas de demande de rechargement supplementaire depuis l inventaire');
  d.mod.stop();
}

// --- Cas 7 : le nom d'un drop reclame sur un stream est nettoye du verbe d'action ---
{
  const d = loadDrops({ pathname: '/somestreamer', hasButton: true, cardName: 'Récupérer Shooting Star' });
  d.mod.start();
  assert.strictEqual(d.lastReportedName(), 'Shooting Star', 'le verbe Recuperer doit etre retire du nom du drop');
  d.mod.stop();
}

console.log('OK drops');
