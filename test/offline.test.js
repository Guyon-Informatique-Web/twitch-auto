// Tests de la detection hors-ligne mutualisee TA.dom.isChannelOffline() : on charge les VRAIS
// src/content/selectors.js + src/content/observer.js dans un environnement simule, et on verifie
// que la detection est ROBUSTE et CONSERVATRICE (un faux "offline" tuerait le farm d'un live fige).
const assert = require('assert');

// Charge selectors.js puis observer.js sur un meme global.TA (l'ordre du manifest).
global.window = global;
delete global.TA;
require('../src/content/selectors.js');
require('../src/content/observer.js');
const isChannelOffline = global.TA.dom.isChannelOffline;

// Prepare un document simule. videos: liste d'objets {duration,currentTime,ended}. hits: selecteurs
// "presents" (querySelector renvoie un noeud). text: selecteur -> textContent (compte aussi comme present).
function scenario({ videos = [], hits = [], text = {} } = {}) {
  global.document = {
    querySelectorAll: (sel) => (sel === 'video' ? videos : []),
    querySelector: (sel) => {
      if (Object.prototype.hasOwnProperty.call(text, sel)) return { textContent: text[sel] };
      if (hits.includes(sel)) return {};
      return null;
    }
  };
  return isChannelOffline();
}

const HLS_LIVE = { duration: Infinity, currentTime: 5, ended: false };   // direct HLS en cours
const VOD_PREVIEW = { duration: 120, currentTime: 0, ended: false };     // preview/recommandation finie

// --- Cas 1 : direct HLS en lecture -> JAMAIS hors-ligne ---
assert.strictEqual(scenario({ videos: [HLS_LIVE] }), false, 'un direct HLS en lecture ne doit jamais etre vu hors-ligne');

// --- Cas 2 (CLE) : direct HLS mis en PAUSE en arriere-plan -> PAS hors-ligne (le watchdog doit pouvoir le recharger) ---
assert.strictEqual(scenario({ videos: [{ duration: Infinity, currentTime: 5, ended: false }] }), false,
  'un direct en pause de fond reste un direct (pas hors-ligne) : le watchdog garde la main');

// --- Cas 3 : la garde LIVE HLS prime sur tout signal offline (conteneur + texte presents) ---
assert.strictEqual(scenario({ videos: [HLS_LIVE], hits: ['#offline-channel-main-content'], text: { '.home-offline-hero': 'hors ligne' } }), false,
  'tant qu un direct HLS tourne, on ne conclut jamais hors-ligne');

// --- Cas 4 (PIEGE POST-RAID) : conteneur offline + video de preview FINIE en pause -> hors-ligne ---
assert.strictEqual(scenario({ videos: [VOD_PREVIEW], hits: ['#offline-channel-main-content'] }), true,
  'chaine hors-ligne avec une preview en pause : le marqueur structurel doit l emporter (ancien bug)');

// --- Cas 5 : pas de conteneur structurel mais TEXTE offline dans un root borne -> hors-ligne ---
assert.strictEqual(scenario({ text: { '.home-offline-hero': 'Cette chaine est hors ligne' } }), true,
  'le repli texte sur un root borne doit detecter le hors-ligne');
assert.strictEqual(scenario({ text: { '[data-a-target="player-overlay"]': 'Channel is offline' } }), true,
  'le repli texte EN doit aussi matcher');

// --- Cas 6 : erreur transitoire sur un LIVE (anti-signal live present, aucune video lancee) -> PAS hors-ligne ---
assert.strictEqual(scenario({ videos: [{ duration: NaN, currentTime: 0, ended: false }], hits: ['#live-channel-stream-information'] }), false,
  'un anti-signal live present empeche de conclure hors-ligne (le reloader doit pouvoir recuperer)');

// --- Cas 7 : etat de chargement (rien de concluant) -> PAS hors-ligne (conservateur) ---
assert.strictEqual(scenario({ videos: [], hits: [], text: {} }), false,
  'sans signal fiable, on ne conclut pas hors-ligne (on prefere un faux negatif)');

// --- Cas 8 : le mot "offline" hors des roots bornes (sidebar) ne doit PAS declencher (plus de scan document.body) ---
assert.strictEqual(scenario({ text: { '.side-nav-card__avatar--offline': 'offline', body: 'offline' } }), false,
  'le mot offline dans la sidebar / le body ne doit jamais etre scanne');

// --- Cas 9 : un direct HLS TERMINE (ended) ne compte plus comme live -> le conteneur offline l emporte ---
assert.strictEqual(scenario({ videos: [{ duration: Infinity, currentTime: 50, ended: true }], hits: ['#offline-channel-main-content'] }), true,
  'une video live terminee (ended) ne protege plus : si la chaine est structurellement offline, on conclut hors-ligne');

// --- Cas 10 : conteneur offline seul (sans aucune video) -> hors-ligne ---
assert.strictEqual(scenario({ hits: ['#offline-channel-main-content'] }), true,
  'le conteneur #offline-channel-main-content seul suffit a conclure hors-ligne');

// --- Cas 11 (ORDRE etapes 2/3) : anti-signal live ET conteneur offline coexistent, sans video live
//     -> le LIVE structurel prime (false). Ancre l'invariant 'live prime sur offline' meme en
//     coexistence transitoire (raid / refresh DOM) : une inversion produirait un faux positif. ---
assert.strictEqual(scenario({ hits: ['#live-channel-stream-information', '#offline-channel-main-content'] }), false,
  'live structurel prime sur conteneur offline (ordre etapes 2/3) : coexistence transitoire ne doit JAMAIS conclure hors-ligne');

// --- Cas 12 (PLUSIEURS videos) : une seule video live dans le lot suffit a ecarter le hors-ligne,
//     peu importe l'ordre d'iteration (page de farm reelle : live HLS + preview/clip finie). ---
assert.strictEqual(scenario({ videos: [VOD_PREVIEW, HLS_LIVE] }), false,
  'live + preview : une video live dans le lot ecarte le hors-ligne (preview en 1er)');
assert.strictEqual(scenario({ videos: [HLS_LIVE, VOD_PREVIEW] }), false,
  'live + preview : meme resultat quel que soit l ordre d iteration (live en 1er)');
assert.strictEqual(scenario({ videos: [VOD_PREVIEW, HLS_LIVE], hits: ['#offline-channel-main-content'] }), false,
  'la garde video live prime sur un conteneur offline perissable, meme avec une preview finie presente');

// --- Cas 13 (motif FR /est absent/) : 3e motif de offlinePatterns, dans un root borne -> hors-ligne ---
assert.strictEqual(scenario({ text: { '.home-offline-hero': 'Le streamer est absent' } }), true,
  'le motif FR /est absent/ doit aussi matcher dans un root borne');

// --- Cas 14 (anti-faux-positif texte) : un root offline PRESENT mais sans motif offline -> PAS hors-ligne.
//     La simple presence du root (etape 4) ne doit jamais suffire : il faut un motif texte. ---
assert.strictEqual(scenario({ text: { '[data-a-target="player-overlay"]': 'buffering...' } }), false,
  'un root borne present mais au texte non-offline ne doit pas conclure hors-ligne');

console.log('OK offline');
