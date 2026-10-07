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
function loadDrops({ pathname = '/drops/inventory', hasButton = true, cardName = null, bruteMeta = false, textEls = [],
  bodyText = '', onClick = null, session = null, keepClock = false } = {}) {
  const savedClock = clock;
  installEnv();
  if (keepClock) clock = savedClock;   // "rechargement" de la page : l'heure continue
  // sessionStorage partage entre deux chargements = rechargement du meme onglet.
  const store = session || {};
  global.sessionStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
  const body = { innerText: bodyText };
  const refusedSent = [];
  const warns = [];

  let reloadCount = 0;
  let inventoryReloadCount = 0;
  const clickedEls = [];
  const reportedNames = [];
  const reported = [];
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
    body,
    // textEls : elements renvoyes pour la recherche par libelle (boutons / liens de l'inventaire).
    querySelectorAll: (sel) => {
      if (sel === '.claim') return hasButton ? [btn] : [];
      if (sel === 'button, [role="button"], a') return textEls;
      return [];
    }
  };
  global.window = global;
  global.TAUtil = require('../src/shared/util.js');
  global.TA = {
    selectors: {
      dropClaim: ['.claim'],
      dropClaimTextHints: ['en profiter'],
      dropClaimExact: ['en profiter']
    },
    log: { info() {}, warn(m, msg) { warns.push(msg); }, error() {} },
    dropRefused: (payload) => { refusedSent.push(payload); },
    report: (kind, payload) => { reportedNames.push(payload && payload.name); reported.push(payload || {}); },
    reloadInventory: () => { inventoryReloadCount += 1; }
  };

  let tickCb = null;
  global.TA.dom = {
    subscribe: (cb) => { tickCb = cb; cb(); return () => {}; },
    isClickable: () => true,
    click: (el) => { clickedEls.push(el); if (onClick) onClick(body); return true; },
    currentChannel: () => 'chan',
    // Etiquetage jeu / campagne (v1.12) : bruteMeta simule une page ou la lecture echoue.
    findCampaign: () => { if (bruteMeta) throw new Error('DOM inattendu'); return { game: 'Rust', campaign: 'Round 21' }; },
    currentGame: () => { if (bruteMeta) throw new Error('DOM inattendu'); return 'Rust'; }
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
    lastReportedName: () => reportedNames[reportedNames.length - 1],
    lastReported: () => reported[reported.length - 1],
    reportedCount: () => reported.length,
    refusedSent,
    warns,
    body,
    store
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
  advance(4100);                       // le clic n est compte qu apres la verification du refus (4 s)
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
  advance(4100);                       // le clic n est compte qu apres la verification du refus (4 s)
  assert.strictEqual(d.lastReportedName(), 'Shooting Star', 'le verbe Recuperer doit etre retire du nom du drop');
  d.mod.stop();
}

// --- Cas 8 : etiquetage jeu / campagne remonte avec le claim (page inventaire) ---
{
  const d = loadDrops({ pathname: '/drops/inventory', hasButton: true });
  d.mod.start();
  advance(4100);                       // le clic n est compte qu apres la verification du refus (4 s)
  assert.strictEqual(d.lastReported().game, 'Rust', 'le jeu doit accompagner le claim');
  assert.strictEqual(d.lastReported().campaign, 'Round 21', 'la campagne doit accompagner le claim');
  d.mod.stop();
}

// --- Cas 9 : sur un stream, on etiquette le JEU mais jamais la campagne (invisible dans le DOM) ---
{
  const d = loadDrops({ pathname: '/somestreamer', hasButton: true });
  d.mod.start();
  advance(4100);                       // le clic n est compte qu apres la verification du refus (4 s)
  assert.strictEqual(d.lastReported().game, 'Rust');
  assert.strictEqual(d.lastReported().campaign, '', 'aucune campagne ne doit etre inventee hors inventaire');
  d.mod.stop();
}

// --- Cas 10 (CLE) : si la lecture du jeu explose, le drop est quand meme COMPTE ---
//     L'etiquette est un confort d'affichage ; la perdre ne doit jamais coûter un claim.
{
  const d = loadDrops({ pathname: '/drops/inventory', hasButton: true, bruteMeta: true });
  d.mod.start();
  advance(4100);                       // le clic n est compte qu apres la verification du refus (4 s)
  assert.strictEqual(d.clickedEls.length, 1, 'le drop doit etre reclame malgre l echec d etiquetage');
  assert.ok(d.lastReported(), 'le claim doit etre remonte au background');
  assert.strictEqual(d.lastReported().game, '', 'sans jeu lisible, l entree part sans etiquette');
  d.mod.stop();
}

// --- Cas 11 : une CHAINE dont le nom commence par "drops" n'est pas l'inventaire ---
//     (avant : startsWith('/drops') la rechargeait toutes les 3 min et cliquait par sous-chaine)
{
  const d = loadDrops({ pathname: '/dropsquad', hasButton: false });
  d.mod.start();
  setClock(100000 + 10 * 60 * 1000);
  d.refresh();
  assert.strictEqual(d.reloadCount(), 0, '/dropsquad est une page de stream : jamais rechargee par le module drops');
  d.mod.stop();
}

// --- Cas 12 : sur l'inventaire, seul le VRAI bouton est clique (et compte) ---
//     Ecartes : le conteneur dont le texte inclut celui du bouton, un lien de navigation,
//     un libelle d'etat "Claimed" (qui contient "claim").
{
  const fake = (tagName, text, { href = null, hasChildButton = false } = {}) => ({
    tagName, textContent: text,
    getAttribute: (a) => (a === 'href' ? href : ''),
    querySelector: () => (hasChildButton ? {} : null),
    querySelectorAll: () => [],
    parentElement: null
  });
  const container = fake('DIV', 'Casque Nuit Polaire En profiter', { hasChildButton: true });
  const link = fake('A', 'How to claim drops', { href: '/help/drops' });
  const done = fake('BUTTON', 'Claimed');
  const real = fake('BUTTON', 'En profiter');
  const d = loadDrops({ pathname: '/drops/inventory', hasButton: false, textEls: [container, link, done, real] });
  d.mod.start();
  advance(4300);
  advance(4300);
  assert.deepStrictEqual(d.clickedEls, [real], 'seul le bouton "En profiter" doit etre clique');
  d.mod.stop();
}

// --- Cas 13 (REGRESSION 07/10/2026) : Twitch refuse le drop (compte de jeu a lier) ---
//     Avant : chaque rechargement de l'inventaire recliquait "En profiter" et comptait un drop.
{
  const LINK = 'Une erreur est survenue. Liez vos comptes de jeu à votre compte Twitch pour recevoir cette récompense en jeu.';
  const session = {};
  const refuse = (body) => { body.innerText = 'Inventaire ' + LINK; };
  let d = loadDrops({ cardName: 'Drops 15 Min Reward', onClick: refuse, session });
  d.mod.start();
  assert.strictEqual(d.clickedEls.length, 1, 'le drop est essaye une fois');
  advance(4100);
  assert.strictEqual(d.reportedCount(), 0, 'un drop refuse ne doit pas etre compte comme reclame');
  assert.strictEqual(d.refusedSent.length, 1, 'le refus est signale au service worker');
  assert.strictEqual(d.refusedSent[0].name, 'Drops 15 Min Reward');
  assert.ok(d.warns.some((w) => /compte de jeu a lier/.test(w)), 'le refus est journalise');
  d.mod.stop();

  // Rechargement de l'inventaire (meme onglet) : nouveau bouton, meme drop -> pas recliqué.
  d = loadDrops({ cardName: 'Drops 15 Min Reward', onClick: refuse, session, keepClock: true, bodyText: 'Inventaire' });
  d.mod.start();
  advance(10000);
  assert.strictEqual(d.clickedEls.length, 0, 'un drop refuse ne doit pas etre reclique apres un rechargement');
  d.mod.stop();

  // 31 min plus tard : nouvel essai (le compte a peut-etre ete lie), sans seconde notification.
  advance(31 * 60 * 1000);
  d = loadDrops({ cardName: 'Drops 15 Min Reward', onClick: refuse, session, keepClock: true, bodyText: 'Inventaire' });
  d.mod.start();
  assert.strictEqual(d.clickedEls.length, 1, 'apres 30 min, le drop est reessaye');
  advance(4100);
  assert.strictEqual(d.reportedCount(), 0);
  assert.strictEqual(d.refusedSent.length, 0, 'une seule notification par drop et par onglet');
  d.mod.stop();

  // Compte lie entre-temps : l'essai suivant passe et compte.
  advance(31 * 60 * 1000);
  d = loadDrops({ cardName: 'Drops 15 Min Reward', session, keepClock: true, bodyText: 'Inventaire' });
  d.mod.start();
  advance(4100);
  assert.strictEqual(d.reportedCount(), 1, 'une fois le compte lie, le drop est reclame et compte');
  d.mod.stop();
}

// --- Cas 14 : un bandeau de refus DEJA affiche avant le clic n'est pas attribue au drop ---
{
  const LINK = 'Liez vos comptes de jeu à votre compte Twitch pour recevoir cette récompense en jeu.';
  const d = loadDrops({ cardName: 'Casque', bodyText: LINK });
  d.mod.start();
  advance(4100);
  assert.strictEqual(d.reportedCount(), 1, 'un message laisse par un clic precedent ne vaut pas refus');
  d.mod.stop();
}

// --- Cas 15 : arreter le module juste apres un clic ne perd pas le drop ---
{
  const d = loadDrops({ cardName: 'Casque' });
  d.mod.start();
  d.mod.stop();
  assert.strictEqual(d.reportedCount(), 1, 'le clic deja fait reste compte a l arret du module');
}

// --- Cas 16 : detection du message de refus (FR / EN), par comptage ---
{
  const U = require('../src/shared/util.js');
  const fr = U.claimRefusalCounts('Une erreur est survenue. Liez vos comptes de jeu à votre compte Twitch pour recevoir cette récompense en jeu.');
  assert.deepStrictEqual(fr, { link: 1, error: 1 });
  assert.strictEqual(U.claimRefusal({ link: 0, error: 0 }, fr), 'link');
  assert.strictEqual(U.claimRefusal({ link: 0, error: 0 }, U.claimRefusalCounts('Something went wrong.')), 'error');
  assert.strictEqual(U.claimRefusal({ link: 0, error: 0 }, U.claimRefusalCounts('Link your game accounts to your Twitch account to receive this reward in-game.')), 'link');
  assert.strictEqual(U.claimRefusal(fr, fr), '', 'meme nombre avant et apres : pas de nouveau refus');
  assert.deepStrictEqual(U.claimRefusalCounts(''), { link: 0, error: 0 });
  assert.strictEqual(U.claimRefusal({ link: 0, error: 0 }, U.claimRefusalCounts('Drops 15 Min Reward En profiter Se connecter')), '');
}

// --- Cas 17 : un bandeau de refus qui arrive tard (2 s apres le clic) est quand meme vu ---
{
  const late = (body) => { setTimeout(() => { body.innerText = 'Liez vos comptes de jeu à votre compte Twitch'; }, 2000); };
  const d = loadDrops({ cardName: 'Casque', onClick: late });
  d.mod.start();
  advance(4100);
  assert.strictEqual(d.reportedCount(), 0, 'un refus affiche apres 2 s ne doit pas etre compte comme reclame');
  assert.strictEqual(d.refusedSent.length, 1);
  d.mod.stop();
}

console.log('OK drops');
