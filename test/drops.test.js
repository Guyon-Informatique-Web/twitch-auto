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
  bodyText = '', onClick = null, session = null, keepClock = false, settings = undefined, legacySession = {} } = {}) {
  const savedClock = clock;
  installEnv();
  if (keepClock) clock = savedClock;   // "rechargement" de la page : l'heure continue
  // chrome.storage.local partage entre deux chargements = memoire commune a tous les onglets
  // (rechargement de l'inventaire, autre onglet). Copie JSON, comme le vrai stockage.
  const store = session || {};
  global.sessionStorage = {
    getItem: (k) => (k in legacySession ? legacySession[k] : null),
    removeItem: (k) => { delete legacySession[k]; }
  };
  const listeners = [];
  global.chrome = { storage: {
    local: {
      get: async (k) => (k in store ? { [k]: JSON.parse(store[k]) } : {}),
      set: async (o) => { Object.keys(o).forEach((k) => { store[k] = JSON.stringify(o[k]); }); }
    },
    onChanged: {
      addListener: (fn) => listeners.push(fn),
      removeListener: (fn) => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); }
    }
  } };
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
    settings,
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
    // Ecriture faite par un AUTRE onglet (ou la remise a zero) : evenement chrome.storage.onChanged.
    emit: (key, newValue) => listeners.slice().forEach((fn) => fn({ [key]: { newValue } }, 'local')),
    listenerCount: () => listeners.length,
    body,
    store
  };
}

// Laisse passer les promesses (lecture / ecriture de la memoire des drops en erreur).
const flush = () => new Promise((r) => setImmediate(r));

(async () => {
// --- Cas 1 (REGRESSION) : apres une sequence de claim TERMINEE, l'inventaire doit se recharger ---
{
  const d = loadDrops();
  await d.mod.start(); await flush();                       // subscribe -> 1er tick -> reclame le drop, arme le retry
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
  await d.mod.start(); await flush();                       // reclame + arme le retry, qui n'est PAS encore execute
  setClock(100000 + 8001);             // depasse COOLDOWN*2 mais le retry reste en attente
  d.refresh();
  assert.strictEqual(d.reloadCount(), 0, 'pas de reload pendant une sequence de claim en cours');
  d.mod.stop();
}

// --- Cas 3 : hors page inventaire, jamais de reload ---
{
  const d = loadDrops({ pathname: '/somestreamer', hasButton: false });
  await d.mod.start(); await flush();
  setClock(100000 + 60000);
  d.refresh();
  assert.strictEqual(d.reloadCount(), 0, 'pas de reload hors de la page inventaire');
  d.mod.stop();
}

// --- Cas 4 : l'inventaire se recharge toutes les 3 min ---
{
  const d = loadDrops({ hasButton: false });
  await d.mod.start(); await flush();
  assert.strictEqual(d.refreshDelay(), 3 * 60 * 1000, 'la cadence de rechargement de l inventaire doit etre 3 min');
  d.mod.stop();
}

// --- Cas 5 : un drop reclame SUR UN STREAM declenche le rechargement de l'inventaire ---
{
  const d = loadDrops({ pathname: '/somestreamer', hasButton: true });
  await d.mod.start(); await flush();                       // reclame le drop via le bandeau du stream
  advance(4100);                       // le clic n est compte qu apres la verification du refus (4 s)
  assert.strictEqual(d.clickedEls.length, 1, 'le drop du bandeau stream doit etre reclame');
  assert.strictEqual(d.inventoryReloadCount(), 1, 'un claim sur un stream doit demander le rechargement de l inventaire');
  assert.strictEqual(d.reloadCount(), 0, 'on ne recharge pas la page du stream elle-meme');
  d.mod.stop();
}

// --- Cas 6 : un drop reclame SUR la page inventaire ne redemande pas de rechargement (maybeRefresh s'en charge) ---
{
  const d = loadDrops({ pathname: '/drops/inventory', hasButton: true });
  await d.mod.start(); await flush();
  assert.strictEqual(d.clickedEls.length, 1, 'le drop de l inventaire doit etre reclame');
  assert.strictEqual(d.inventoryReloadCount(), 0, 'pas de demande de rechargement supplementaire depuis l inventaire');
  d.mod.stop();
}

// --- Cas 7 : le nom d'un drop reclame sur un stream est nettoye du verbe d'action ---
{
  const d = loadDrops({ pathname: '/somestreamer', hasButton: true, cardName: 'Récupérer Shooting Star' });
  await d.mod.start(); await flush();
  advance(4100);                       // le clic n est compte qu apres la verification du refus (4 s)
  assert.strictEqual(d.lastReportedName(), 'Shooting Star', 'le verbe Recuperer doit etre retire du nom du drop');
  d.mod.stop();
}

// --- Cas 8 : etiquetage jeu / campagne remonte avec le claim (page inventaire) ---
{
  const d = loadDrops({ pathname: '/drops/inventory', hasButton: true });
  await d.mod.start(); await flush();
  advance(4100);                       // le clic n est compte qu apres la verification du refus (4 s)
  assert.strictEqual(d.lastReported().game, 'Rust', 'le jeu doit accompagner le claim');
  assert.strictEqual(d.lastReported().campaign, 'Round 21', 'la campagne doit accompagner le claim');
  d.mod.stop();
}

// --- Cas 9 : sur un stream, on etiquette le JEU mais jamais la campagne (invisible dans le DOM) ---
{
  const d = loadDrops({ pathname: '/somestreamer', hasButton: true });
  await d.mod.start(); await flush();
  advance(4100);                       // le clic n est compte qu apres la verification du refus (4 s)
  assert.strictEqual(d.lastReported().game, 'Rust');
  assert.strictEqual(d.lastReported().campaign, '', 'aucune campagne ne doit etre inventee hors inventaire');
  d.mod.stop();
}

// --- Cas 10 (CLE) : si la lecture du jeu explose, le drop est quand meme COMPTE ---
//     L'etiquette est un confort d'affichage ; la perdre ne doit jamais coûter un claim.
{
  const d = loadDrops({ pathname: '/drops/inventory', hasButton: true, bruteMeta: true });
  await d.mod.start(); await flush();
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
  await d.mod.start(); await flush();
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
  await d.mod.start(); await flush();
  advance(4300);
  advance(4300);
  assert.deepStrictEqual(d.clickedEls, [real], 'seul le bouton "En profiter" doit etre clique');
  d.mod.stop();
}

// --- Cas 13 (REGRESSION 07/10/2026) : Twitch refuse le drop (compte de jeu a lier) ---
//     Avant : chaque rechargement de l'inventaire recliquait "En profiter" et comptait un drop.
//     Depuis la 1.13.3 : jamais compte, et pas de nouvel essai avant 60 min (reglage par defaut).
{
  const LINK = 'Une erreur est survenue. Liez vos comptes de jeu à votre compte Twitch pour recevoir cette récompense en jeu.';
  const session = {};
  const refuse = (body) => { body.innerText = 'Inventaire ' + LINK; };
  let d = loadDrops({ cardName: 'Drops 15 Min Reward', onClick: refuse, session });
  await d.mod.start(); await flush();
  assert.strictEqual(d.clickedEls.length, 1, 'le drop est essaye une fois');
  advance(4100); await flush();
  assert.strictEqual(d.reportedCount(), 0, 'un drop refuse ne doit pas etre compte (ni compteur ni historique)');
  assert.strictEqual(d.refusedSent.length, 1, 'le refus est signale au service worker');
  assert.strictEqual(d.refusedSent[0].name, 'Drops 15 Min Reward');
  assert.strictEqual(d.refusedSent[0].retryMin, 60, 'la notification annonce le delai reel');
  assert.ok(d.warns.some((w) => /compte de jeu a lier.*non compte.*60 min/.test(w)), 'le refus est journalise avec le delai');
  d.mod.stop();

  // Rechargement de l'inventaire (meme onglet) : nouveau bouton, meme drop -> pas reclique.
  d = loadDrops({ cardName: 'Drops 15 Min Reward', onClick: refuse, session, keepClock: true, bodyText: 'Inventaire' });
  await d.mod.start(); await flush();
  advance(10000);
  assert.strictEqual(d.clickedEls.length, 0, 'un drop refuse ne doit pas etre reclique apres un rechargement');
  d.mod.stop();

  // 31 min apres : toujours rien (l'ancien delai de 30 min ne vaut plus).
  advance(31 * 60 * 1000);
  d = loadDrops({ cardName: 'Drops 15 Min Reward', onClick: refuse, session, keepClock: true, bodyText: 'Inventaire' });
  await d.mod.start(); await flush();
  assert.strictEqual(d.clickedEls.length, 0, 'pas de nouvel essai avant 60 min');
  d.mod.stop();

  // 61 min apres le refus : nouvel essai (le compte a peut-etre ete lie), sans seconde notification.
  advance(30 * 60 * 1000);
  d = loadDrops({ cardName: 'Drops 15 Min Reward', onClick: refuse, session, keepClock: true, bodyText: 'Inventaire' });
  await d.mod.start(); await flush();
  assert.strictEqual(d.clickedEls.length, 1, 'apres 60 min, le drop est reessaye');
  advance(4100); await flush();
  assert.strictEqual(d.reportedCount(), 0);
  assert.strictEqual(d.refusedSent.length, 0, 'une seule notification par drop');
  d.mod.stop();

  // Compte lie entre-temps : l'essai suivant passe et compte.
  advance(61 * 60 * 1000);
  d = loadDrops({ cardName: 'Drops 15 Min Reward', session, keepClock: true, bodyText: 'Inventaire' });
  await d.mod.start(); await flush();
  advance(4100);
  assert.strictEqual(d.reportedCount(), 1, 'une fois le compte lie, le drop est reclame et compte');
  d.mod.stop();
}

// --- Cas 13b : la memoire des drops en erreur est COMMUNE aux onglets ---
//     Un autre onglet (inventaire rouvert, bandeau d'un stream) ne reessaie pas plus tot.
{
  const session = {};
  const refuse = (body) => { body.innerText = 'Liez vos comptes de jeu à votre compte Twitch'; };
  let d = loadDrops({ cardName: 'Casque', onClick: refuse, session });
  await d.mod.start(); await flush();
  advance(4100); await flush();
  d.mod.stop();
  // Nouvel onglet : son propre DOM, aucune trace locale, meme stockage d'extension.
  d = loadDrops({ cardName: 'Casque', session, keepClock: true });
  await d.mod.start(); await flush();
  advance(10000);
  assert.strictEqual(d.clickedEls.length, 0, 'un autre onglet ne reclique pas un drop en erreur');
  d.mod.stop();
}

// --- Cas 13c : le delai suit le reglage dropRetryMin ---
{
  const session = {};
  const refuse = (body) => { body.innerText = 'Liez vos comptes de jeu à votre compte Twitch'; };
  const settings = { dropRetryMin: 5 };
  let d = loadDrops({ cardName: 'Casque', onClick: refuse, session, settings });
  await d.mod.start(); await flush();
  advance(4100); await flush();
  assert.strictEqual(d.refusedSent[0].retryMin, 5);
  d.mod.stop();
  advance(4 * 60 * 1000);
  d = loadDrops({ cardName: 'Casque', session, keepClock: true, settings });
  await d.mod.start(); await flush();
  assert.strictEqual(d.clickedEls.length, 0, 'pas avant 5 min');
  d.mod.stop();
  advance(2 * 60 * 1000);
  d = loadDrops({ cardName: 'Casque', session, keepClock: true, settings });
  await d.mod.start(); await flush();
  assert.strictEqual(d.clickedEls.length, 1, 'reessaye apres 5 min');
  d.mod.stop();
}

// --- Cas 13d : un echec generique ("Impossible de recuperer") n'est pas compte non plus ---
{
  const session = {};
  const fail = (body) => { body.innerText = 'Impossible de récupérer cette récompense. Réessayez plus tard.'; };
  let d = loadDrops({ cardName: 'Casque', onClick: fail, session });
  await d.mod.start(); await flush();
  advance(4100); await flush();
  assert.strictEqual(d.reportedCount(), 0, 'un echec de recuperation ne doit pas etre compte');
  assert.strictEqual(d.refusedSent.length, 0, 'pas de notification "compte de jeu" pour un echec generique');
  d.mod.stop();
  d = loadDrops({ cardName: 'Casque', session, keepClock: true });
  await d.mod.start(); await flush();
  assert.strictEqual(d.clickedEls.length, 0, 'le drop en echec attend le delai lui aussi');
  d.mod.stop();
}

// --- Cas 13f : un refus note par la 1.13.2 (sessionStorage de l'onglet) est repris apres la MAJ ---
{
  const legacy = { 'ta-drops-refused': JSON.stringify({ 'Round 21|Casque': { at: 100000 } }) };
  const d = loadDrops({ cardName: 'Casque', legacySession: legacy });
  await d.mod.start(); await flush();
  assert.strictEqual(d.clickedEls.length, 0, 'le refus de la 1.13.2 vaut encore apres la mise a jour');
  assert.ok(!('ta-drops-refused' in legacy), 'l ancienne cle est effacee');
  assert.ok(d.store.dropsRefused, 'le refus passe dans la memoire commune');
  d.mod.stop();
}

// --- Cas 13g : un refus vu sur l'INVENTAIRE vaut pour le bandeau du meme drop sur un STREAM ---
{
  const session = {};
  const refuse = (body) => { body.innerText = 'Liez vos comptes de jeu à votre compte Twitch'; };
  let d = loadDrops({ cardName: 'Casque', onClick: refuse, session });
  await d.mod.start(); await flush();
  advance(4100); await flush();
  d.mod.stop();
  d = loadDrops({ pathname: '/somestreamer', cardName: 'Casque', session, keepClock: true });
  await d.mod.start(); await flush();
  advance(10000);
  assert.strictEqual(d.clickedEls.length, 0, 'le bandeau du stream ne reessaie pas un drop refuse sur l inventaire');
  d.mod.stop();
}

// --- Cas 13h : onglet DEJA ouvert : un refus note par un autre onglet compte tout de suite ---
{
  const d = loadDrops({ pathname: '/somestreamer', hasButton: false, cardName: 'Casque' });
  await d.mod.start(); await flush();
  assert.strictEqual(d.listenerCount(), 1, 'le module ecoute la memoire commune');
  d.emit('dropsRefused', { 'Rust|Casque': { at: 100000 } });
  // le bandeau du drop apparait ensuite sur ce stream
  const d2 = d;   // meme module
  global.document.querySelectorAll = (sel) => (sel === '.claim' ? [{ textContent: 'En profiter', getAttribute: () => '',
    querySelectorAll: (q) => (/CoreText/.test(String(q)) ? [{ textContent: 'Casque' }] : []), parentElement: null }] : []);
  d2.tick();
  assert.strictEqual(d2.clickedEls.length, 0, 'le refus ecrit par l autre onglet est respecte');
  // Remise a zero (cle effacee) : nouvel essai possible aussitot.
  d.emit('dropsRefused', undefined);
  d2.tick();
  assert.strictEqual(d2.clickedEls.length, 1, 'apres la remise a zero, le drop est reessaye');
  d.mod.stop();
  assert.strictEqual(d.listenerCount(), 0, 'l ecoute est retiree a l arret');
}

// --- Cas 13i : le MEME bouton, ignore pendant le delai, est clique une fois le delai passe ---
{
  const session = { dropsRefused: JSON.stringify({ 'Round 21|Casque': { at: 100000 } }) };
  const d = loadDrops({ cardName: 'Casque', session, settings: { dropRetryMin: 5 } });
  await d.mod.start(); await flush();
  assert.strictEqual(d.clickedEls.length, 0);
  setClock(100000 + 6 * 60 * 1000);
  d.tick();
  assert.strictEqual(d.clickedEls.length, 1, 'le bouton reste cliquable apres le delai, sans rechargement');
  d.mod.stop();
}

// --- Cas 13e : arret du module pendant la lecture de la memoire : aucun clic ensuite ---
{
  const d = loadDrops({ cardName: 'Casque' });
  d.mod.start();
  d.mod.stop();
  await flush();
  assert.strictEqual(d.clickedEls.length, 0, 'un module arrete ne doit pas cliquer a la fin de la lecture');
}

// --- Cas 14 : un bandeau de refus DEJA affiche avant le clic n'est pas attribue au drop ---
{
  const LINK = 'Liez vos comptes de jeu à votre compte Twitch pour recevoir cette récompense en jeu.';
  const d = loadDrops({ cardName: 'Casque', bodyText: LINK });
  await d.mod.start(); await flush();
  advance(4100);
  assert.strictEqual(d.reportedCount(), 1, 'un message laisse par un clic precedent ne vaut pas refus');
  d.mod.stop();
}

// --- Cas 15 : arreter le module juste apres un clic ne perd pas le drop (verdict a 4 s) ---
{
  const d = loadDrops({ cardName: 'Casque' });
  await d.mod.start(); await flush();
  d.mod.stop();
  assert.strictEqual(d.reportedCount(), 0, 'pas de verdict avant 4 s, meme a l arret');
  advance(4100);
  assert.strictEqual(d.reportedCount(), 1, 'le clic deja fait est compte a l issue de sa verification');
}

// --- Cas 15b : arret du module puis refus de Twitch : le drop n'est PAS compte ---
{
  const late = (body) => { setTimeout(() => { body.innerText = 'Liez vos comptes de jeu à votre compte Twitch'; }, 1000); };
  const d = loadDrops({ cardName: 'Casque', onClick: late });
  await d.mod.start(); await flush();
  d.mod.stop();
  advance(4100);
  assert.strictEqual(d.reportedCount(), 0, 'un refus apres l arret du module ne doit pas etre compte');
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
  await d.mod.start(); await flush();
  advance(4100);
  assert.strictEqual(d.reportedCount(), 0, 'un refus affiche apres 2 s ne doit pas etre compte comme reclame');
  assert.strictEqual(d.refusedSent.length, 1);
  d.mod.stop();
}

console.log('OK drops');
})().catch((e) => { console.error(e); process.exit(1); });
