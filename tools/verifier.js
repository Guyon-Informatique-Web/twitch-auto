#!/usr/bin/env node
// Verification navigateur de l'extension dans Google Chrome STABLE (jamais Chromium : il n'a pas
// le codec H.264 de Twitch). Aucune dependance : Node >= 20, modules integres seulement.
//
// Usage : node tools/verifier.js [--live] [--popup-reel] [--out <dossier>]
//   (sans option)  etape Popup seule : le vrai popup rendu en 360 x 600, FR et EN, etats vide /
//                  plein / noms longs, 4 onglets, sonde de debordement, erreurs console, captures.
//   --live         etape reseau (twitch.tv, non connecte) : lecture, mise en sourdine en arriere-
//                  plan, chaine hors ligne dans l'onglet "En direct".
//   --popup-reel   Chrome AVEC fenetre (placee hors ecran) : chrome.action.openPopup() et mesure
//                  du vrai popup (largeur, defilement horizontal).
//   --out <dir>    dossier de sortie (defaut : tools/verif/AAAA-MM-JJ/).
// Sortie : une ligne OK / ECHEC par controle, captures PNG et rapport.json dans le dossier.
// Code de sortie 1 si un controle echoue.
//
// Tout le CDP passe par un pipe (--remote-debugging-pipe) : messages JSON separes par un octet
// NUL, ecrits sur le fd 3 et lus sur le fd 4 du processus Chrome, sessions "flatten".
// Faits mesures le 06/10/2026 qui expliquent le montage :
//  - Chrome stable >= 137 IGNORE --load-extension (net::ERR_BLOCKED_BY_CLIENT) : on charge
//    l'extension par Extensions.loadUnpacked sur le pipe (flag --enable-unsafe-extension-debugging).
//  - Sans Playwright (qui rend toutes les pages "visibles"), Target.activateTarget donne la vraie
//    visibilite : un onglet non actif a document.hidden === true. Le script de la page (spoof.js)
//    masque document.hidden dans le monde de la page, donc on lit toujours le getter natif.

'use strict';

const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const RACINE = path.resolve(__dirname, '..');
const ID_ATTENDU = 'dahhmaaloghoipbkookjedemalpadhin';
const ONGLETS = ['stats', 'live', 'history', 'settings'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const heure = () => new Date().toISOString().slice(11, 19);

// ------------------------------------------------------------------ options et compte rendu

function lireOptions(argv) {
  const o = { live: false, popupReel: false, out: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--live') o.live = true;
    else if (a === '--popup-reel') o.popupReel = true;
    else if (a === '--out') o.out = argv[++i];
    else if (a === '--help' || a === '-h') { o.aide = true; }
    else { console.error('Option inconnue : ' + a); process.exit(2); }
  }
  if (o.out === undefined) { console.error('--out attend un dossier'); process.exit(2); }
  return o;
}

function dateDuJour() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const rapport = { date: null, chrome: null, extId: null, options: null, controles: [], consoleErreurs: [], captures: [], infos: [] };

// Un controle = une ligne dans la console et une entree dans le rapport.
function controle(nom, ok, detail) {
  rapport.controles.push({ nom, ok: !!ok, detail: detail == null ? '' : String(detail) });
  console.log(`${ok ? 'OK    ' : 'ECHEC '} ${nom}${detail ? ' : ' + detail : ''}`);
  return !!ok;
}
function info(texte) {
  rapport.infos.push(texte);
  console.log(`${heure()} ${texte}`);
}

// ------------------------------------------------------------------ Chrome stable

function dansLePath(nom) {
  const exts = process.platform === 'win32' ? ['.exe', '.cmd', ''] : [''];
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    for (const e of exts) {
      const f = path.join(dir, nom + e);
      try { if (fs.statSync(f).isFile()) return f; } catch (err) { /* absent */ }
    }
  }
  return null;
}

function trouverChrome() {
  if (process.env.CHROME_PATH) {
    if (!fs.existsSync(process.env.CHROME_PATH)) throw new Error('CHROME_PATH introuvable : ' + process.env.CHROME_PATH);
    return process.env.CHROME_PATH;
  }
  const fichiers = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'),
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ].filter(Boolean);
  for (const f of fichiers) if (fs.existsSync(f)) return f;
  for (const n of ['google-chrome-stable', 'google-chrome']) {
    const f = dansLePath(n);
    if (f) return f;
  }
  throw new Error('Google Chrome stable introuvable (definir CHROME_PATH). Chromium est exclu : pas de H.264.');
}

// id d'extension epingle par la cle du manifest : sha256 de la cle decodee, 32 premiers chiffres
// hex, chaque chiffre 0-f traduit en lettre a-p.
function idDepuisLaCle(cleBase64) {
  const hex = crypto.createHash('sha256').update(Buffer.from(cleBase64, 'base64')).digest('hex').slice(0, 32);
  return [...hex].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');
}

// ------------------------------------------------------------------ pipe CDP

const navigateursOuverts = new Set();   // pour tout tuer en cas d'arret brutal

function tuerArbre(pid) {
  try {
    if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    else process.kill(-pid, 'SIGKILL');
  } catch (e) { /* deja mort */ }
}
process.on('exit', () => { for (const b of navigateursOuverts) tuerArbre(b.pid); });
process.on('SIGINT', () => { for (const b of navigateursOuverts) tuerArbre(b.pid); process.exit(130); });

class Navigateur {
  constructor() {
    this.nextId = 1;
    this.pending = new Map();
    this.ecouteurs = [];
    this.sorti = false;
    this.stderr = '';
    this.consoleParSession = new Map();   // sessionId -> erreurs console / exceptions
    this.ua = null;
  }

  // Lance Chrome sur un profil temporaire, branche le pipe, charge l'extension.
  async lancer({ chrome, ext, fenetre, args = [] }) {
    this.profil = fs.mkdtempSync(path.join(os.tmpdir(), 'twitch-auto-verif-'));
    const flags = [
      `--user-data-dir=${this.profil}`, '--remote-debugging-pipe', '--enable-unsafe-extension-debugging',
      '--no-first-run', '--no-default-browser-check', '--disable-search-engine-choice-screen', '--lang=fr-FR',
      ...(fenetre ? [] : ['--headless']), ...args, 'about:blank'
    ];
    this.headless = !fenetre;
    this.proc = spawn(chrome, flags, { stdio: ['ignore', 'pipe', 'pipe', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
    this.pid = this.proc.pid;
    navigateursOuverts.add(this);
    this.proc.stdout.resume();
    this.proc.stderr.on('data', (d) => { this.stderr = (this.stderr + d).slice(-2000); });
    this.proc.once('exit', () => {
      this.sorti = true;
      for (const [, p] of this.pending) p.reject(new Error('Chrome s\'est arrete'));
      this.pending.clear();
    });
    this.proc.once('error', (e) => { throw e; });
    this.ecriture = this.proc.stdio[3];
    const lecture = this.proc.stdio[4];
    lecture.setEncoding('utf8');
    let tampon = '';
    lecture.on('data', (morceau) => {
      tampon += morceau;
      let i;
      while ((i = tampon.indexOf('\0')) >= 0) {
        const brut = tampon.slice(0, i); tampon = tampon.slice(i + 1);
        if (brut) this._recu(JSON.parse(brut));
      }
    });
    this.ecouteurs.push((m) => this._noterConsole(m));

    // Attente que le navigateur reponde, puis chargement de l'extension.
    let v = null;
    for (let i = 0; i < 40 && !v; i++) {
      try { v = await this.send('Browser.getVersion', {}, null, 5000); } catch (e) { await sleep(250); }
    }
    if (!v) throw new Error('Chrome ne repond pas sur le pipe. stderr : ' + this.stderr);
    this.version = v.product;
    this.ua = v.userAgent;
    const r = await this.send('Extensions.loadUnpacked', { path: ext });
    this.extId = r.id;
    return this;
  }

  _recu(msg) {
    if (msg.id != null) {
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      if (msg.error) p.reject(new Error(`${p.methode} : ${msg.error.message}`));
      else p.resolve(msg.result || {});
    } else {
      for (const l of this.ecouteurs) l(msg);
    }
  }

  // Erreurs de console et exceptions, rangees par session pour les controles "sans erreur console".
  _noterConsole(m) {
    let texte = null;
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      texte = 'exception : ' + ((d.exception && d.exception.description) || d.text);
    } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      texte = 'console.error : ' + m.params.args.map((a) => (a.value !== undefined ? a.value : a.description)).join(' ');
    }
    if (texte == null) return;
    const cle = m.sessionId || '';
    if (!this.consoleParSession.has(cle)) this.consoleParSession.set(cle, []);
    this.consoleParSession.get(cle).push(texte.slice(0, 400));
  }
  // Rend les erreurs accumulees pour une session et les vide.
  erreursConsole(sid) {
    const l = this.consoleParSession.get(sid) || [];
    this.consoleParSession.set(sid, []);
    return l;
  }

  send(methode, params = {}, sessionId = null, delai = 30000) {
    if (this.sorti) return Promise.reject(new Error('Chrome est arrete'));
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const t = setTimeout(() => { this.pending.delete(id); reject(new Error(`${methode} : delai depasse`)); }, delai);
      this.pending.set(id, {
        methode,
        resolve: (r) => { clearTimeout(t); resolve(r); },
        reject: (e) => { clearTimeout(t); reject(e); }
      });
      const msg = { id, method: methode, params };
      if (sessionId) msg.sessionId = sessionId;
      this.ecriture.write(JSON.stringify(msg) + '\0');
    });
  }

  // Evalue une expression dans une cible, rend la valeur (JSON) ou leve l'erreur de la page.
  async eval(sid, expression) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sid);
    if (r.exceptionDetails) {
      const d = r.exceptionDetails;
      throw new Error('eval : ' + ((d.exception && d.exception.description) || d.text).slice(0, 300));
    }
    return r.result.value;
  }
  async tryEval(sid, expression) { try { return await this.eval(sid, expression); } catch (e) { return null; } }

  // Ouvre une cible : about:blank, attache, Runtime.enable (console captee des le debut),
  // user agent sans "Headless" (Twitch s'en mefie), taille emulee, puis navigation.
  async ouvrir(url, { activer = false, metrics = null } = {}) {
    const t = await this.send('Target.createTarget', { url: 'about:blank' });
    const a = await this.send('Target.attachToTarget', { targetId: t.targetId, flatten: true });
    const sid = a.sessionId;
    await this.send('Runtime.enable', {}, sid);
    if (this.headless && /HeadlessChrome/.test(this.ua || '')) {
      await this.send('Emulation.setUserAgentOverride', { userAgent: this.ua.replace('HeadlessChrome', 'Chrome') }, sid);
    }
    if (metrics) {
      await this.send('Emulation.setDeviceMetricsOverride', { width: metrics.width, height: metrics.height, deviceScaleFactor: 1, mobile: false }, sid);
    }
    if (activer) await this.send('Target.activateTarget', { targetId: t.targetId });
    if (url !== 'about:blank') {
      const n = await this.send('Page.navigate', { url }, sid);
      if (n.errorText) throw new Error(`navigation vers ${url} : ${n.errorText}`);
    }
    return { targetId: t.targetId, sid };
  }
  activer(cible) { return this.send('Target.activateTarget', { targetId: cible.targetId }); }
  fermerCible(cible) { return this.send('Target.closeTarget', { targetId: cible.targetId }).catch(() => {}); }
  async cibles() { return (await this.send('Target.getTargets', {})).targetInfos; }
  async attacher(targetId) {
    const a = await this.send('Target.attachToTarget', { targetId, flatten: true });
    await this.send('Runtime.enable', {}, a.sessionId);
    return a.sessionId;
  }

  // Capture PNG. Pleine hauteur : clip de la hauteur du document avec captureBeyondViewport.
  async capturer(sid, fichier, { pleineHauteur = true } = {}) {
    const params = { format: 'png' };
    if (pleineHauteur) {
      const d = await this.eval(sid, '({ w: Math.ceil(document.documentElement.clientWidth || innerWidth), h: Math.ceil(Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)) })');
      params.captureBeyondViewport = true;
      params.clip = { x: 0, y: 0, width: d.w, height: d.h, scale: 1 };
    }
    const r = await this.send('Page.captureScreenshot', params, sid);
    fs.writeFileSync(fichier, Buffer.from(r.data, 'base64'));
    rapport.captures.push(path.relative(process.cwd(), fichier).replace(/\\/g, '/'));
  }

  // Ferme proprement, force si besoin, tue l'arbre de processus, supprime le profil temporaire.
  async fermer() {
    if (this.proc && !this.sorti) {
      try { await this.send('Browser.close', {}, null, 3000); } catch (e) { /* ferme ou ne repond plus */ }
      for (let i = 0; i < 20 && !this.sorti; i++) await sleep(250);
    }
    if (this.pid) tuerArbre(this.pid);   // enfants eventuels (gpu, renderers)
    navigateursOuverts.delete(this);
    for (let i = 0; i < 10 && !this.sorti; i++) await sleep(200);
    try { fs.rmSync(this.profil, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); } catch (e) {
      info('profil temporaire non supprime : ' + this.profil);
    }
  }
}

async function attendre(fn, delai, pas = 500) {
  const fin = Date.now() + delai;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > fin) return null;
    await sleep(pas);
  }
}

// ------------------------------------------------------------------ donnees d'exemple du popup
// Memes formes que celles que le service worker ecrit dans chrome.storage.local.

function fixtures(now, { long = false } = {}) {
  const g = (game, campaign) => ({ game, campaign });
  const camp = (d, t) => ({ campDone: d, campTotal: t });
  const enCours = [
    { name: long ? 'Casque tactique edition limitee Nuit Polaire avec visiere et lampe frontale' : 'Casque tactique Nuit Polaire', percent: 72, remainingMin: 17, ...g('Escape from Tarkov', 'Arena Season 3 Twitch Drops'), ...camp(1, 4) },
    { name: 'Caisse de munitions', percent: 35, remainingMin: 78, ...g('Escape from Tarkov', 'Arena Season 3 Twitch Drops'), ...camp(1, 4) },
    { name: 'Pack de 500 roubles', percent: 10, remainingMin: 162, ...g('Escape from Tarkov', 'Arena Season 3 Twitch Drops'), ...camp(1, 4) },
    { name: 'Pioche Lama dore', percent: 50, remainingMin: 30, ...g(long ? 'Tom Clancys Rainbow Six Siege X Operation Deep Freeze' : 'Fortnite', long ? 'Chapitre 7 Saison 2 : recompenses de la communaute pour les spectateurs fideles' : 'Chapitre 7 Saison 2') },
    { name: 'Emote Victoire', percent: 5, remainingMin: null, ...g('Rocket League', 'RLCS 2026 Viewer Rewards') }
  ];
  const chaineLongue = long ? 'trackmaniaofficialfrance' : 'trackmania';
  const stats = {
    pointsClaimed: 412, pointsValue: 27450, lastPointsClaim: now - 12 * 60e3,
    dropsClaimed: 14, lastDropsClaim: now - 3 * 3600e3,
    watchSeconds: 51 * 3600 + 25 * 60,
    byChannel: {
      zerator: { points: 8450, drops: 3, seconds: 12 * 3600 },
      gotaga: { points: 6200, drops: 5, seconds: 15 * 3600 },
      kamet0: { points: 4100, drops: 2, seconds: 9 * 3600 },
      squeezie: { points: 2900, drops: 0, seconds: 4 * 3600 },
      [chaineLongue]: { points: 950, drops: 4, seconds: 11 * 3600 },
      mistermv: { points: 300, drops: 0, seconds: 1800 }
    },
    inProgress: enCours, inProgressTs: now - 60e3, heartbeats: {}
  };
  const history = [];
  const jeux = [['Escape from Tarkov', 'Arena Season 3 Twitch Drops'], ['Fortnite', 'Chapitre 7 Saison 2'], ['Rocket League', 'RLCS 2026 Viewer Rewards']];
  for (let i = 0; i < 46; i++) {
    const ts = now - (46 - i) * 47 * 60e3;
    if (i % 9 === 4) { history.push({ type: 'points', amount: 5000 * (1 + Math.floor(i / 9)), ts }); continue; }
    if (i < 12) { history.push({ type: 'drop', name: 'Ancien drop ' + i, ts }); continue; }   // avant v1.12 : sans jeu
    const [game, campaign] = jeux[i % 3];
    history.push({ type: 'drop', name: (long && i === 44) ? 'Recompense exclusive de fin de saison pour les spectateurs les plus fideles' : 'Recompense ' + i, game, campaign, ts });
  }
  return { stats, history };
}

// Ecrit un etat dans le stockage de l'extension depuis une cible qui a l'API chrome.* (popup ou
// service worker). Les reglages sont fusionnes avec ceux qui existent deja.
function expressionSeed({ donnees = {}, reglages = {}, retirer = [] }) {
  return `(async () => {
    const cur = (await chrome.storage.local.get('settings')).settings || {};
    const set = ${JSON.stringify(donnees)};
    set.settings = Object.assign({}, cur, ${JSON.stringify(reglages)});
    await chrome.storage.local.set(set);
    ${retirer.length ? `await chrome.storage.local.remove(${JSON.stringify(retirer)});` : ''}
    return true;
  })()`;
}

// ------------------------------------------------------------------ sonde de debordement
// Evaluee DANS la page. Generique : le popup peut evoluer, rien n'y est code en dur.
//  - DEBORDE : un element visible dont le bord droit depasse celui du body (sauf s'il est coupe
//    par un ancetre qui masque ou defile volontairement) ;
//  - COUPE : un texte plus large que sa boite, sans points de suspension ;
//  - tronque : texte coupe AVEC points de suspension (informatif, voulu).
function sondeDebordement() {
  const problemes = []; const tronques = [];
  const corps = document.body.getBoundingClientRect();
  const bordDroit = corps.right;
  const decrire = (el) => {
    const cls = (typeof el.className === 'string' && el.className.trim()) ? '.' + el.className.trim().split(/\s+/).join('.') : '';
    return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + cls;
  };
  const coupeParAncetre = (el) => {
    for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
      if (getComputedStyle(p).overflowX !== 'visible' && p.getBoundingClientRect().right <= bordDroit + 0.5) return true;
    }
    return false;
  };
  document.querySelectorAll('body *').forEach((el) => {
    if (el.closest('[hidden]') || !el.getClientRects().length) return;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden') return;
    const r = el.getBoundingClientRect();
    const txt = (el.textContent || '').trim().slice(0, 50);
    if (r.width > 0 && r.right > bordDroit + 0.5 && !coupeParAncetre(el)) {
      problemes.push(`DEBORDE ${decrire(el)} (${Math.round(r.right)} > ${Math.round(bordDroit)}) : "${txt}"`);
    }
    if (el.scrollWidth > el.clientWidth + 1) {
      if (cs.textOverflow === 'ellipsis') tronques.push(`tronque ${decrire(el)} : "${txt}"`);
      else if (cs.overflowX === 'visible' && el.children.length === 0 && cs.display !== 'inline') {
        problemes.push(`COUPE ${decrire(el)} (${el.scrollWidth} > ${el.clientWidth}) : "${txt}"`);
      }
    }
  });
  const doc = document.documentElement;
  return { hauteur: doc.scrollHeight, defileX: doc.scrollWidth > doc.clientWidth + 1, problemes, tronques };
}

const SONDE = `(${sondeDebordement.toString()})()`;
// Etat natif de la visibilite : le script de la page masque document.hidden.
const HIDDEN_NATIF = `Object.getOwnPropertyDescriptor(Document.prototype, 'hidden').get.call(document)`;

// ------------------------------------------------------------------ etape Popup

async function etapePopup(nav, sortie) {
  info('Etape Popup (360 x 600, FR et EN, vide / plein / noms longs)');
  const url = `chrome-extension://${nav.extId}/src/popup/popup.html`;
  const pop = await nav.ouvrir(url, { activer: true, metrics: { width: 360, height: 600 } });
  await attendre(() => nav.tryEval(pop.sid, `document.readyState === 'complete'`), 10000, 200);
  const now = await nav.eval(pop.sid, 'Date.now()');
  const etats = {
    vide: { donnees: { stats: {}, history: [] } },
    plein: { donnees: fixtures(now) },
    'noms-longs': { donnees: fixtures(now, { long: true }) }
  };
  for (const lang of ['fr', 'en']) {
    for (const [etat, def] of Object.entries(etats)) {
      await nav.eval(pop.sid, expressionSeed({
        donnees: def.donnees,
        reglages: { lang, autoSwitch: false, autoSwitchUrl: '', historyTtlMin: 0, enabled: true },
        retirer: ['lastError', 'update']
      }));
      nav.erreursConsole(pop.sid);
      await nav.eval(pop.sid, 'location.reload(), true');
      await sleep(400);
      await attendre(() => nav.tryEval(pop.sid, `document.readyState === 'complete' && !!document.querySelector('.tab[data-tab="stats"]')`), 10000, 200);
      await sleep(500);
      for (const onglet of ONGLETS) {
        const nom = `popup ${lang}/${etat}/${onglet}`;
        try {
          await nav.eval(pop.sid, `document.querySelector('.tab[data-tab="${onglet}"]').click(), true`);
          await sleep(500);
          const sonde = await nav.eval(pop.sid, SONDE);
          // Le defilement horizontal du document n'est pas un controle ici : a 360 px emules, la
          // barre verticale (contenu > 600 px) rogne la largeur utile. Le vrai popup, lui, est
          // elargi par Chrome ; c'est l'etape --popup-reel qui le mesure.
          controle(`${nom} : pas de debordement`, sonde.problemes.length === 0, sonde.problemes.join(' | '));
          const erreurs = nav.erreursConsole(pop.sid);
          controle(`${nom} : aucune erreur console`, erreurs.length === 0, erreurs.join(' | '));
          erreurs.forEach((e) => rapport.consoleErreurs.push(`${nom} : ${e}`));
          if (sonde.tronques.length) rapport.infos.push(`${nom} : ${sonde.tronques.length} texte(s) tronque(s) avec points de suspension`);
          await nav.capturer(pop.sid, path.join(sortie, `popup-${lang}-${etat}-${onglet}.png`));
        } catch (e) {
          controle(`${nom} : execution`, false, e.message);
        }
      }
    }
  }
  await nav.fermerCible(pop);
}

// ------------------------------------------------------------------ etape --live

// Lit l'etat reel d'un onglet Twitch depuis sa propre page.
const SONDE_VIDEO = `(() => {
  const v = document.querySelector('video');
  return {
    chemin: location.pathname, hiddenNatif: ${HIDDEN_NATIF},
    lecture: !!(v && !v.paused && !v.ended && v.readyState >= 2),
    hauteur: v ? v.videoHeight : null, temps: v ? v.currentTime : null,
    info: !!document.querySelector('#live-channel-stream-information, [data-a-target="animated-channel-viewers-count"]'),
    categorie: !!document.querySelector('a[href*="/directory/category/"]'),
    horsLigne: !!document.querySelector('#offline-channel-main-content') && !document.querySelector('#live-channel-stream-information')
  };
})()`;

const ETAT_ONGLETS_TWITCH = `chrome.tabs.query({ url: 'https://www.twitch.tv/*' }).then((t) =>
  t.map((x) => ({ chemin: new URL(x.url).pathname, muted: !!(x.mutedInfo && x.mutedInfo.muted), active: x.active })))`;

async function etapeLive(nav, sortie) {
  info('Etape live (twitch.tv, non connecte)');
  // Le popup sert de poste de pilotage : il a l'API chrome.* (onglets, stockage).
  const popup = await nav.ouvrir(`chrome-extension://${nav.extId}/src/popup/popup.html`, { metrics: { width: 360, height: 600 } });
  await attendre(() => nav.tryEval(popup.sid, `document.readyState === 'complete'`), 10000, 200);
  await nav.eval(popup.sid, expressionSeed({ donnees: { stats: {}, history: [] }, reglages: { lang: 'fr', enabled: true, autoSwitch: false }, retirer: ['lastError', 'update'] }));

  // 1. Chaine en direct la plus regardee (le tri par defaut de /directory/all est l'audience).
  const dir = await nav.ouvrir('https://www.twitch.tv/directory/all');
  await sleep(4000);
  await nav.tryEval(dir.sid, `(() => { const b = [...document.querySelectorAll('button')].find((x) => /^(rejeter|refuser|reject|decline)/i.test(x.textContent.trim())); if (b) b.click(); return !!b; })()`);
  const slug = await attendre(() => nav.tryEval(dir.sid, `(() => {
    const a = document.querySelector('a[data-a-target="preview-card-channel-link"], a[data-a-target="preview-card-image-link"]');
    return a ? a.getAttribute('href').split('/').filter(Boolean)[0] : null;
  })()`), 30000, 1000);
  await nav.fermerCible(dir);
  if (!controle('live : chaine la plus regardee trouvee', !!slug, slug || 'aucune carte dans /directory/all (page de consentement ou DOM change ?)')) return;
  info('chaine : ' + slug);

  // 2. La chaine au premier plan : lecture et pages d'information.
  const A = await nav.ouvrir('https://www.twitch.tv/' + slug, { activer: true });
  const lecture = await attendre(async () => { const p = await nav.tryEval(A.sid, SONDE_VIDEO); return p && p.lecture && p.hauteur ? p : null; }, 45000, 1000);
  controle('live : la video est en lecture au premier plan', !!lecture, lecture ? `videoHeight ${lecture.hauteur}` : 'pas de lecture en 45 s');
  const pageInfo = await attendre(async () => { const p = await nav.tryEval(A.sid, SONDE_VIDEO); return p && p.info && p.categorie ? p : null; }, 15000, 1000);
  const p0 = await nav.tryEval(A.sid, SONDE_VIDEO) || {};
  controle('live : bloc d\'information de la chaine present', !!(pageInfo || p0.info), '#live-channel-stream-information ou compteur de spectateurs');
  controle('live : lien de categorie /directory/category/ present', !!(pageInfo || p0.categorie));

  // 3. Le popup passe devant : la chaine passe en arriere-plan, l'extension doit couper le son
  // sans arreter la lecture.
  await nav.activer(popup);
  const t0 = (await nav.tryEval(A.sid, SONDE_VIDEO) || {}).temps;
  await sleep(8000);
  const fond = await nav.tryEval(A.sid, SONDE_VIDEO) || {};
  const onglets = await nav.tryEval(popup.sid, ETAT_ONGLETS_TWITCH) || [];
  const ongletA = onglets.find((x) => x.chemin === '/' + slug) || {};
  controle('live : onglet reellement en arriere-plan (getter natif hidden)', fond.hiddenNatif === true, 'hidden natif = ' + fond.hiddenNatif);
  controle('live : onglet en arriere-plan mis en sourdine (tabs.mutedInfo)', ongletA.muted === true, JSON.stringify(ongletA));
  controle('live : la lecture avance en arriere-plan (currentTime)', fond.temps != null && t0 != null && fond.temps > t0 + 2, `${t0 && t0.toFixed(1)} -> ${fond.temps && fond.temps.toFixed(1)}`);

  // 4. Retour au premier plan : le son revient.
  await nav.activer(A);
  await sleep(4000);
  const onglets2 = await nav.tryEval(popup.sid, ETAT_ONGLETS_TWITCH) || [];
  const ongletA2 = onglets2.find((x) => x.chemin === '/' + slug) || {};
  controle('live : son remis au retour au premier plan', ongletA2.muted === false, JSON.stringify(ongletA2));

  // 5. Une chaine hors ligne doit apparaitre HORS LIGNE dans l'onglet "En direct".
  let horsLigne = null;
  const vus = [];
  for (const candidate of ['twitchdev', 'jeuxvideocom', 'domingo', 'mistermv']) {
    const O = await nav.ouvrir('https://www.twitch.tv/' + candidate, { activer: true });
    // En direct = marqueurs du direct ET video qui joue : pendant le chargement d'une chaine hors
    // ligne, le squelette de la page de direct s'affiche un instant (mesure du 06/10/2026 : trois
    // chaines hors ligne prises pour des directs).
    const trouve = await attendre(async () => { const p = await nav.tryEval(O.sid, SONDE_VIDEO); return p && (p.horsLigne || (p.info && p.lecture)) ? p : null; }, 20000, 1000);
    vus.push(candidate + (trouve ? (trouve.horsLigne ? ' hors ligne' : ' en direct') : ' indeterminee'));
    if (trouve && trouve.horsLigne) { horsLigne = { slug: candidate, cible: O }; break; }
    await nav.fermerCible(O);
  }
  if (!horsLigne) {
    // Toutes reellement en direct : rien a reprocher a l'extension, controle non verifiable.
    // Une page ni en direct ni hors ligne, elle, signale un changement du DOM de Twitch.
    if (vus.every((v) => v.endsWith(' en direct'))) {
      const msg = 'live : aucune chaine hors ligne parmi les candidates (' + vus.join(', ') + ') : carte HORS LIGNE non verifiee';
      rapport.infos.push(msg);
      info(msg);
    } else {
      controle('live : une chaine hors ligne a ete trouvee', false, vus.join(', ') + ' (page ni en direct ni hors ligne : DOM de Twitch change ?)');
    }
    await nav.fermerCible(A); await nav.fermerCible(popup);
    return;
  }
  controle('live : une chaine hors ligne a ete trouvee', true, horsLigne.slug);
  await nav.activer(popup);
  await sleep(2500);   // le content script de l'onglet hors ligne publie son etat
  await nav.eval(popup.sid, 'location.reload(), true');
  await attendre(() => nav.tryEval(popup.sid, `document.readyState === 'complete' && !!document.querySelector('.tab[data-tab="live"]')`), 10000, 200);
  await nav.eval(popup.sid, `document.querySelector('.tab[data-tab="live"]').click(), true`);
  const LECTURE_CARTES = `[...document.querySelectorAll('.lcard')].map((c) => ({
    etat: ((c.querySelector('.lcard-state') || {}).textContent || '').trim(),
    nom: ((c.querySelector('.lcard-name') || {}).textContent || '').trim(),
    texte: c.textContent.replace(/\\s+/g, ' ').trim().slice(0, 120)
  }))`;
  const cartes = await attendre(async () => {
    const c = await nav.tryEval(popup.sid, LECTURE_CARTES);
    return c && c.some((x) => /HORS LIGNE|OFFLINE/i.test(x.etat) && x.nom.toLowerCase().includes(horsLigne.slug)) ? c : null;
  }, 15000, 1000);
  const toutes = cartes || await nav.tryEval(popup.sid, LECTURE_CARTES) || [];
  controle(`live : carte HORS LIGNE / OFFLINE pour ${horsLigne.slug} dans l'onglet En direct`, !!cartes, JSON.stringify(toutes.map((x) => `${x.etat} ${x.nom}`)));
  await sleep(300);
  await nav.capturer(popup.sid, path.join(sortie, 'live-popup-en-direct.png'));
  const sonde = await nav.tryEval(popup.sid, SONDE);
  if (sonde) controle('live : onglet En direct sans debordement', sonde.problemes.length === 0, sonde.problemes.join(' | '));
  const erreurs = nav.erreursConsole(popup.sid);
  controle('live : popup sans erreur console', erreurs.length === 0, erreurs.join(' | '));
  erreurs.forEach((e) => rapport.consoleErreurs.push(`live : ${e}`));

  await nav.fermerCible(horsLigne.cible); await nav.fermerCible(A); await nav.fermerCible(popup);
}

// ------------------------------------------------------------------ etape --popup-reel

async function etapePopupReel(nav, sortie) {
  info('Etape popup reel (fenetre hors ecran, chrome.action.openPopup)');
  const ext = nav.extId;
  const sw = await attendre(async () => (await nav.cibles()).find((t) => t.type === 'service_worker' && t.url.includes(ext)), 10000, 400);
  if (!controle('popup reel : service worker de l\'extension trouve', !!sw, sw ? '' : 'aucune cible service_worker')) return;
  const swSid = await nav.attacher(sw.targetId);
  const f = fixtures(Date.now());
  await nav.eval(swSid, expressionSeed({ donnees: f, reglages: { lang: 'fr', enabled: true, autoSwitch: false, historyTtlMin: 0 }, retirer: ['lastError', 'update'] }));
  // Une page normale au premier plan, puis le popup.
  const page = await nav.ouvrir('about:blank', { activer: true });
  await sleep(800);
  const ouvert = await nav.eval(swSid, `chrome.action.openPopup().then(() => 'ouvert', (e) => 'refus : ' + e.message)`);
  controle('popup reel : chrome.action.openPopup()', ouvert === 'ouvert', ouvert);
  const cible = await attendre(async () => (await nav.cibles()).find((t) => t.url.includes(ext) && t.url.includes('popup.html')), 8000, 400);
  if (!controle('popup reel : cible du popup trouvee', !!cible)) { await nav.fermerCible(page); return; }
  const sid = await nav.attacher(cible.targetId);
  await sleep(800);
  for (const onglet of ONGLETS) {
    const nom = `popup reel/${onglet}`;
    try {
      await nav.eval(sid, `document.querySelector('.tab[data-tab="${onglet}"]').click(), true`);
      await sleep(700);
      const m = await nav.eval(sid, `({ innerW: innerWidth, innerH: innerHeight, clientW: document.documentElement.clientWidth, scrollW: document.documentElement.scrollWidth, scrollH: document.documentElement.scrollHeight })`);
      controle(`${nom} : pas de defilement horizontal`, m.scrollW <= m.clientW, `innerWidth ${m.innerW}, scrollWidth ${m.scrollW}, clientWidth ${m.clientW}, hauteur du contenu ${m.scrollH}`);
      const erreurs = nav.erreursConsole(sid);
      controle(`${nom} : aucune erreur console`, erreurs.length === 0, erreurs.join(' | '));
      erreurs.forEach((e) => rapport.consoleErreurs.push(`${nom} : ${e}`));
      await nav.capturer(sid, path.join(sortie, `popup-reel-${onglet}.png`), { pleineHauteur: false });
    } catch (e) {
      controle(`${nom} : execution`, false, e.message);
    }
  }
  await nav.fermerCible(page);
}

// ------------------------------------------------------------------ principal

async function avecNavigateur(chrome, { fenetre, args }, etape) {
  const nav = new Navigateur();
  try {
    await nav.lancer({ chrome, ext: RACINE, fenetre, args });
    rapport.chrome = rapport.chrome || nav.version;
    // Chargement de l'extension : l'id rendu doit etre l'id epingle.
    if (rapport.extId !== nav.extId) {
      rapport.extId = nav.extId;
      controle('extension chargee avec l\'id epingle', nav.extId === ID_ATTENDU, `${nav.extId}${nav.extId === ID_ATTENDU ? '' : ' (attendu ' + ID_ATTENDU + ')'}`);
    }
    await etape(nav);
  } catch (e) {
    controle('execution de l\'etape', false, e.stack ? e.stack.split('\n').slice(0, 3).join(' / ') : e.message);
  } finally {
    await nav.fermer();
  }
}

async function main() {
  const opts = lireOptions(process.argv.slice(2));
  if (opts.aide) {
    console.log('Usage : node tools/verifier.js [--live] [--popup-reel] [--out <dossier>]');
    return 0;
  }
  const sortie = path.resolve(opts.out || path.join(__dirname, 'verif', dateDuJour()));
  fs.mkdirSync(sortie, { recursive: true });
  rapport.date = new Date().toISOString();
  rapport.options = { live: opts.live, popupReel: opts.popupReel, out: sortie };

  const chrome = trouverChrome();
  if (/chromium/i.test(chrome)) throw new Error('Chromium refuse (pas de H.264) : ' + chrome);
  info('Chrome : ' + chrome);

  // Controle de coherence : l'id epingle vient bien de la cle du manifest.
  const manifest = JSON.parse(fs.readFileSync(path.join(RACINE, 'manifest.json'), 'utf8'));
  const idCalcule = manifest.key ? idDepuisLaCle(manifest.key) : null;
  controle('id epingle = id calcule depuis la cle du manifest', idCalcule === ID_ATTENDU, idCalcule || 'pas de cle dans le manifest');

  // Popup et live partagent un Chrome sans fenetre ; le popup reel a le sien, avec fenetre.
  await avecNavigateur(chrome, { fenetre: false, args: ['--window-size=1280,900'] }, async (nav) => {
    await etapePopup(nav, sortie);
    if (opts.live) await etapeLive(nav, sortie);
  });
  if (opts.popupReel) {
    await avecNavigateur(chrome, { fenetre: true, args: ['--window-position=-3000,-3000', '--window-size=900,800'] }, (nav) => etapePopupReel(nav, sortie));
  }

  const echecs = rapport.controles.filter((c) => !c.ok);
  console.log(`\n${rapport.controles.length - echecs.length} OK, ${echecs.length} ECHEC. Captures : ${rapport.captures.length}. Sortie : ${sortie}`);
  fs.writeFileSync(path.join(sortie, 'rapport.json'), JSON.stringify(rapport, null, 2));
  return echecs.length ? 1 : 0;
}

main().then((code) => { process.exitCode = code; }).catch((e) => { console.error('ERREUR', e); process.exitCode = 1; });
