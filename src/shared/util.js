// Fonctions pures partagees entre service worker, popup et content scripts.
// Aucun acces DOM/Chrome ici -> testable en Node.
(function (root) {
  // Temps relatif a partir d'un timestamp (ms) et de "maintenant".
  // lang : 'fr' (defaut) | 'en'. Defaut FR pour rester retrocompatible.
  function formatRelativeTime(ts, now, lang) {
    const en = String(lang || '').toLowerCase().startsWith('en');
    const L = en
      ? { never: 'never', now: 'just now', min: (m) => `${m} min ago`, h: (h) => `${h} h ago`, d: (d) => `${d} d ago` }
      : { never: 'jamais', now: 'a l instant', min: (m) => `il y a ${m} min`, h: (h) => `il y a ${h} h`, d: (d) => `il y a ${d} j` };
    if (ts == null) return L.never;
    const s = Math.max(0, Math.floor((now - ts) / 1000));
    if (s < 60) return L.now;
    const m = Math.floor(s / 60);
    if (m < 60) return L.min(m);
    const h = Math.floor(m / 60);
    if (h < 24) return L.h(h);
    const j = Math.floor(h / 24);
    return L.d(j);
  }

  // Autorise un reload tant qu'on n'a pas depasse maxN reloads dans la fenetre.
  function shouldReload(history, now, maxN, windowMs) {
    const recent = history.filter((t) => now - t < windowMs);
    return recent.length < maxN;
  }

  // Format compact d'un nombre : 10, 100, 999, 1K, 10K, 1,2M, 3,4B.
  // lang : 'fr' (defaut, separateur ',') | 'en' (separateur '.').
  function formatCompact(n, lang) {
    n = Number(n) || 0;
    const sep = String(lang || '').toLowerCase().startsWith('en') ? '.' : ',';
    const abs = Math.abs(n);
    const units = [{ v: 1e9, s: 'B' }, { v: 1e6, s: 'M' }, { v: 1e3, s: 'K' }];
    for (const u of units) {
      // seuil un poil sous l'unite pour eviter le debordement d'arrondi (999 999 -> "1M", pas "1000K")
      if (abs >= u.v * 0.9995) {
        const val = Math.round((n / u.v) * 10) / 10; // 1 decimale
        return String(val).replace('.', sep) + u.s;
      }
    }
    return String(n);
  }

  // Throttle par cle : allow(key, now) renvoie true au plus une fois par fenetre.
  function makeThrottle(windowMs) {
    const seen = new Map();
    return function allow(key, now) {
      if (seen.has(key) && now - seen.get(key) < windowMs) return false;
      seen.set(key, now);
      return true;
    };
  }

  // Compare deux versions "x.y.z" : 1 si a > b, -1 si a < b, 0 si egales.
  function compareVersions(a, b) {
    const pa = String(a).split('.').map(Number);
    const pb = String(b).split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const x = pa[i] || 0;
      const y = pb[i] || 0;
      if (x > y) return 1;
      if (x < y) return -1;
    }
    return 0;
  }

  // Retire le verbe d'action en tete d'un nom de drop ("Recuperer X" -> "X").
  // Utile quand l'etiquette du bouton de reclamation est captee comme nom (bandeau sur stream).
  function cleanDropName(name) {
    const s = String(name == null ? '' : name).trim();
    const cleaned = s.replace(/^(r[eé]cup[eé]rer|r[eé]clamer|obtenir|claim now|claim)\s+/i, '').trim();
    return cleaned || s; // si le strip vide tout (verbe seul), on garde l'original
  }

  // Retire de l'historique les entrees plus vieilles que ttlMin minutes.
  // ttlMin vide / 0 / non numerique -> aucune purge (on renvoie l'historique tel quel).
  // Les entrees sans timestamp valide sont conservees (on ne peut juger leur age).
  function pruneHistory(history, now, ttlMin) {
    if (!Array.isArray(history)) return [];
    const ttl = Number(ttlMin) > 0 ? Number(ttlMin) * 60000 : 0;
    if (!ttl) return history.slice();
    return history.filter((e) => {
      const ts = e && typeof e.ts === 'number' ? e.ts : null;
      return ts == null || (now - ts) < ttl;
    });
  }

  // Nom de jeu lisible a partir d'un lien vers l'annuaire Twitch
  // ("/directory/category/escape-from-tarkov?filter=drops" -> "Escape from Tarkov").
  // C'est la SEULE source utilisable : sur la page inventaire, le lien porte le libelle du
  // bouton ("chaine en live participante"), jamais le nom du jeu, et celui-ci n'est ecrit
  // nulle part ailleurs dans le bloc de campagne.
  // C'est aussi la seule cle de JOINTURE stable entre les deux chemins de capture (inventaire
  // et bandeau de stream) : deriver le nom du slug des deux cotes garantit qu'un meme jeu ne
  // produit pas deux groupes dans l'historique.
  const NAME_PARTICLES = ['of', 'the', 'from', 'and', 'in', 'on', 'a', 'an', 'to',
    'de', 'du', 'des', 'la', 'le', 'les', 'et', 'un', 'une'];
  function gameNameFromHref(href) {
    const m = String(href || '').match(/\/directory\/(?:category|game)\/([^/?#]+)/);
    if (!m) return '';
    let slug;
    try { slug = decodeURIComponent(m[1]); } catch (e) { slug = m[1]; }
    return slug.split('-').filter(Boolean).map((w, i) => {
      const low = w.toLowerCase();
      // Les particules restent en minuscules sauf en tete ("escape-from-tarkov" -> "Escape from Tarkov").
      if (i > 0 && NAME_PARTICLES.includes(low)) return low;
      return low.charAt(0).toUpperCase() + low.slice(1);
    }).join(' ');
  }

  // Trie les drops en cours "le prochain d'abord" : ETA connu croissant en tete (c'est celui
  // qui tombera en premier), puis progression decroissante pour ceux dont la duree totale n'a
  // pas pu etre lue sur la page inventaire (remainingMin null).
  function sortDropsByEta(list) {
    if (!Array.isArray(list)) return [];
    return list.slice().sort((a, b) => {
      const ea = a && typeof a.remainingMin === 'number' ? a.remainingMin : null;
      const eb = b && typeof b.remainingMin === 'number' ? b.remainingMin : null;
      if (ea != null && eb != null) return ea - eb;
      if (ea != null) return -1;  // un ETA connu passe devant un ETA inconnu
      if (eb != null) return 1;
      return ((b && b.percent) || 0) - ((a && a.percent) || 0);
    });
  }

  // Regroupe les drops en cours par jeu, puis par campagne, en conservant l'ordre "le prochain
  // d'abord" : chaque groupe sort a la place de son drop le plus proche de la fin. Les drops
  // dont le jeu n'a pas pu etre lu forment un groupe a cle vide, toujours place en dernier
  // (ils restent visibles : un regroupement rate ne doit jamais escamoter un drop).
  function groupDropsByGame(list) {
    const sorted = sortDropsByEta(list);
    const games = [];
    const byGame = new Map();
    sorted.forEach((d) => {
      const gKey = (d && d.game) || '';
      let g = byGame.get(gKey);
      if (!g) { g = { game: gKey, campaigns: [] }; byGame.set(gKey, g); games.push(g); }
      const cKey = (d && d.campaign) || '';
      let c = g.campaigns.find((x) => x.campaign === cKey);
      if (!c) { c = { campaign: cKey, drops: [], done: null, total: null }; g.campaigns.push(c); }
      c.drops.push(d);
      // Compteur "n/m" : present uniquement quand le tracker a vu des recompenses terminees.
      if (d && d.campDone != null && d.campTotal != null) { c.done = d.campDone; c.total = d.campTotal; }
    });
    return games.filter((g) => g.game).concat(games.filter((g) => !g.game));
  }

  // Regroupe l'historique par jeu pour l'affichage. Entree attendue dans l'ordre d'affichage
  // (la plus recente d'abord) ; l'ordre est conserve dans chaque groupe, et les groupes sortent
  // dans l'ordre de leur entree la plus recente. Deux groupes a part : les paliers de points
  // (qui n'ont jamais de jeu) gardent leur place chronologique, tandis que les drops non
  // etiquetes - historique d'avant la v1.12, ou claim sans categorie lisible - passent en fin.
  function groupHistoryByGame(entries) {
    if (!Array.isArray(entries)) return [];
    // Cles PREFIXEES : 'p' pour les paliers de points, 'g:<jeu>' pour un jeu ('g:' = non
    // etiquete). Aucun nom de jeu lu dans le DOM ne peut donc percuter le groupe des points.
    const groups = [];
    const byKey = new Map();
    entries.forEach((e) => {
      const points = !!(e && e.type === 'points');
      const game = (!points && e && e.game) || '';
      const key = points ? 'p' : 'g:' + game;
      let g = byKey.get(key);
      if (!g) { g = { key, game, points, entries: [] }; byKey.set(key, g); groups.push(g); }
      g.entries.push(e);
    });
    return groups.filter((g) => g.key !== 'g:').concat(groups.filter((g) => g.key === 'g:'));
  }

  // Etat d'un onglet Twitch pour l'onglet "En direct", a partir de l'instantane renvoye par
  // le content script (null / undefined = pas de reponse : script pas encore injecte).
  // Ordre volontaire : les deux ANOMALIES (hors-ligne, fige) priment sur l'etat de lecture.
  // Note : 'stalled' vient du watchdog, seul detenteur du seuil de blocage ; s'il est
  // desactive on retombe sur 'paused' plutot que d'inventer un second seuil ici.
  function tabState(snap) {
    if (!snap) return 'loading';
    if (snap.inventory) return 'inventory';
    if (!snap.channel) return 'other';
    if (snap.offline) return 'offline';
    if (snap.playing) return 'live';
    if (snap.stalled) return 'stalled';
    return 'paused';
  }

  // Etats qui meritent la pastille d'alerte de l'en-tete (farm interrompu sans qu'on le sache).
  function isTabAlert(state) { return state === 'offline' || state === 'stalled'; }

  const api = {
    formatRelativeTime, formatCompact, compareVersions, shouldReload, makeThrottle,
    cleanDropName, pruneHistory, sortDropsByEta, tabState, isTabAlert,
    groupDropsByGame, groupHistoryByGame, gameNameFromHref
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TAUtil = api;
})(typeof self !== 'undefined' ? self : this);
