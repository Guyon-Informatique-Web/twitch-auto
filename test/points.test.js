// Tests du module points : on charge le VRAI src/content/modules/points.js dans un DOM simule.
// Deux regles : un coffre n'est clique et compte qu'une fois, meme si son bouton reste dans le
// DOM pendant l'animation ; le gain n'est mesure que sur un solde EXACT (jamais sur "12,3 k",
// jamais sur le solde de Bits voisin), sinon on garde le repli de 50.
const assert = require('assert');
const path = require('path');

const MOD = path.join(__dirname, '../src/content/modules/points.js');
const BITS = '[data-test-selector="bits-balance-string"]';

function load({ balances = [] } = {}) {
  let clock = 1000000;
  let timers = [];
  const clicks = [];
  const reports = [];
  let tickFn = null;
  let button = { id: 1 };
  // balances : file de lectures successives du solde, chacune = liste d'elements trouves.
  let reads = balances.slice();
  let current = reads.length ? reads[0] : [];

  global.window = global;
  global.Date.now = () => clock;
  global.setTimeout = (fn, ms) => { timers.push({ fn, due: clock + (ms || 0) }); return timers.length; };
  global.TAUtil = require('../src/shared/util.js');
  global.document = {
    querySelectorAll: (sel) => (sel === 'BAL' ? current : [])
  };
  global.TA = {
    selectors: { pointsClaim: ['CLAIM'], pointsBalance: ['BAL'], bitsBalance: [BITS] },
    log: { info() {}, warn() {}, error() {} },
    report: (kind, payload) => reports.push({ kind, ...payload }),
    dom: {
      subscribe: (cb) => { tickFn = cb; return () => { tickFn = null; }; },
      findFirst: () => button,
      isClickable: (el) => !!el,
      click: (el) => { clicks.push(el); return true; },
      currentChannel: () => 'chan'
    }
  };
  delete require.cache[require.resolve(MOD)];
  require(MOD);
  const mod = global.TA.modules.points;
  return {
    mod,
    tick: () => tickFn(),
    advance(ms) {
      clock += ms;
      const due = timers.filter((x) => x.due <= clock);
      timers = timers.filter((x) => x.due > clock);
      if (due.length && reads.length > 1) { reads.shift(); current = reads[0]; }
      due.forEach((x) => x.fn());
    },
    newButton() { button = { id: button.id + 1 }; },
    clicks, reports
  };
}
// Element de solde : texte + appartenance eventuelle au bloc Bits.
const el = (text, inBits) => ({ textContent: text, closest: (sel) => (inBits && sel === BITS ? {} : null) });

// --- Cas 1 (anti double-claim) : bouton encore present 150 ms apres le clic -> un seul clic ---
{
  const d = load({ balances: [[el('1 234')], [el('1 284')]] });
  d.mod.start();
  d.tick();
  d.advance(150);
  d.tick();                     // le bouton est toujours la (animation de retrait)
  d.advance(2000);
  assert.strictEqual(d.clicks.length, 1, 'un meme coffre ne doit etre clique qu une fois');
  assert.strictEqual(d.reports.length, 1, 'et compte une seule fois');
  assert.strictEqual(d.reports[0].amount, 50, 'gain mesure sur un solde exact : 1 284 - 1 234');
  d.mod.stop();
}

// --- Cas 2 : coffre suivant (nouveau bouton, 15 min plus tard) -> bien reclame ---
{
  const d = load();
  d.mod.start();
  d.tick();
  d.advance(15 * 60 * 1000);
  d.newButton();
  d.tick();
  assert.strictEqual(d.clicks.length, 2, 'le coffre suivant est reclame normalement');
  d.mod.stop();
}

// --- Cas 3 : multiplicateur d'abonne -> le vrai gain est remonte ---
{
  const d = load({ balances: [[el('2 000')], [el('2 060')]] });
  d.mod.start();
  d.tick();
  d.advance(1600);
  assert.strictEqual(d.reports[0].amount, 60);
  d.mod.stop();
}

// --- Cas 4 : solde abrege "12,3 k" -> pas de mesure possible, repli sur 50 (jamais 1 point) ---
{
  const d = load({ balances: [[el('12,3 k')], [el('12,4 k')]] });
  d.mod.start();
  d.tick();
  d.advance(1600);
  assert.strictEqual(d.reports[0].amount, 50, 'un solde abrege ne donne jamais un gain de 1 ou de 100');
  d.mod.stop();
}

// --- Cas 5 : le solde de Bits voisin est ignore, le solde de points est lu ---
{
  const d = load({ balances: [[el('0', true), el('3 100')], [el('0', true), el('3 150')]] });
  d.mod.start();
  d.tick();
  d.advance(1600);
  assert.strictEqual(d.reports[0].amount, 50, 'le gain vient du solde de points, pas des Bits');
  d.mod.stop();
}

// --- Cas 6 : seul le solde de Bits est present (page non connectee) -> repli sur 50 ---
{
  const d = load({ balances: [[el('0', true)], [el('0', true)]] });
  d.mod.start();
  d.tick();
  d.advance(1600);
  assert.strictEqual(d.reports[0].amount, 50);
  d.mod.stop();
}

console.log('OK points');
