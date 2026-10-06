// Fonctions pures partagees entre service worker, popup et content scripts.
// Aucun acces DOM/Chrome ici -> testable en Node.
(function (root) {
  // Temps relatif a partir d'un timestamp (ms) et de "maintenant".
  // lang : 'fr' (defaut) | 'en'. Defaut FR pour rester retrocompatible.
  function formatRelativeTime(ts, now, lang) {
    const en = String(lang || '').toLowerCase().startsWith('en');
    const L = en
      ? { never: 'never', now: 'just now', min: (m) => `${m} min ago`, h: (h) => `${h} h ago`, d: (d) => `${d} d ago` }
      : { never: 'jamais', now: 'à l’instant', min: (m) => `il y a ${m} min`, h: (h) => `il y a ${h} h`, d: (d) => `il y a ${d} j` };
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

  // Etat d'un onglet Twitch pour l'onglet "En direct", a partir de l'instantane renvoye par le
  // content script (null / undefined = pas de reponse) et du statut de chargement de l'onglet.
  // Pas de reponse sur une page DEJA chargee ('complete') = le script n'y tourne pas : c'est
  // le cas apres une mise a jour de l'extension, qui invalide les scripts deja injectes.
  // L'onglet ne farme plus du tout et il faut le recharger -> etat distinct de 'loading',
  // qui lui est transitoire et se resout tout seul.
  // Ordre volontaire ensuite : les ANOMALIES priment sur l'etat de lecture.
  // Note : 'stalled' vient du watchdog, seul detenteur du seuil de blocage ; s'il est
  // desactive on retombe sur 'paused' plutot que d'inventer un second seuil ici.
  function tabState(snap, tabStatus) {
    if (!snap) return tabStatus === 'complete' ? 'unreachable' : 'loading';
    if (snap.inventory) return 'inventory';
    if (!snap.channel) return 'other';
    if (snap.offline) return 'offline';
    if (snap.playing) return 'live';
    if (snap.stalled) return 'stalled';
    return 'paused';
  }

  // Etats qui meritent la pastille d'alerte de l'en-tete (farm interrompu sans qu'on le sache).
  // 'unreachable' en fait partie : l'onglet a l'air normal mais ne rapporte plus rien.
  function isTabAlert(state) {
    return state === 'offline' || state === 'stalled' || state === 'unreachable';
  }

  // Page inventaire des drops ? Segment EXACT : une chaine nommee "dropsquad" commence aussi
  // par "/drops" et ne doit ni etre rechargee toutes les 3 min ni cliquee par sous-chaine.
  function isInventoryPath(pathname) {
    return /^\/drops(\/|$)/i.test(String(pathname || ''));
  }

  // Slug de chaine a partir d'une saisie libre ("maChaine", "twitch.tv/maChaine",
  // "https://www.twitch.tv/maChaine/videos") -> "machaine". Renvoie '' quand la saisie ne
  // designe pas une chaine Twitch : autre site, chemin reserve (reserved), caracteres interdits.
  // Sert a l'auto-switch : on compare des slugs, jamais des prefixes d'URL (casse, www, slash).
  function channelSlug(input, reserved) {
    let s = String(input == null ? '' : input).trim();
    if (!s) return '';
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) {
      // Pas de schema : un nom de chaine nu, ou un domaine tape sans https.
      s = /^[\w-]+$/.test(s) ? 'https://www.twitch.tv/' + s : 'https://' + s.replace(/^\/+/, '');
    }
    let u;
    try { u = new URL(s); } catch (e) { return ''; }
    if (!/^((www|m)\.)?twitch\.tv$/i.test(u.hostname)) return '';
    const seg = (u.pathname.split('/')[1] || '').toLowerCase();
    if (!/^[a-z0-9_]{1,25}$/.test(seg)) return '';
    if ((reserved || []).includes(seg)) return '';
    return seg;
  }

  // Lit un compteur affiche par Twitch : "1 234", "1,234", "12 345", "12,3 k", "1.2K", "3 M".
  // exact = false quand l'affichage est abrege (k / M) : un ecart de quelques points n'y est
  // pas mesurable ("12,3 k" avant et apres un coffre de 50). null si ce n'est pas un nombre.
  function parseCount(text) {
    const s = String(text == null ? '' : text).replace(/[\s\u00a0\u202f]/g, '').toLowerCase();
    const m = s.match(/^(\d+(?:[.,]\d+)*)(k|m)?$/);
    if (!m) return null;
    if (!m[2]) return { value: parseInt(m[1].replace(/[.,]/g, ''), 10), exact: true };
    // Avec un suffixe, le separateur est decimal : "12,3k" et "12.3k" valent 12 300.
    const n = parseFloat(m[1].replace(',', '.'));
    return Number.isFinite(n) ? { value: Math.round(n * (m[2] === 'k' ? 1e3 : 1e6)), exact: false } : null;
  }

  // --- Import d'une sauvegarde : liste blanche des cles ET des valeurs ---------------------
  // Un fichier bricole (ou partage par un ami) ne doit rien pouvoir poser d'autre que des
  // reglages valides : pas d'URL arbitraire pour l'auto-switch, pas d'adresse d'envoi d'erreurs
  // (errorEndpoint n'est jamais importable), pas de type inattendu qui casserait le rendu.
  const BOOL_SETTINGS = ['enabled', 'points', 'drops', 'reload', 'lowQuality', 'antiAfk',
    'muteBackground', 'keepAlive', 'autoInventory', 'notifications', 'autoSwitch', 'tracker'];
  const TTL_MAX_MIN = 525600;   // un an : au-dela, la valeur n'a pas de sens
  function sanitizeSettings(input, reserved) {
    const out = {};
    if (!input || typeof input !== 'object') return out;
    BOOL_SETTINGS.forEach((k) => { if (typeof input[k] === 'boolean') out[k] = input[k]; });
    if (input.lang === 'fr' || input.lang === 'en') out.lang = input.lang;
    const ttl = input.historyTtlMin;
    if ((typeof ttl === 'number' && Number.isFinite(ttl)) || (typeof ttl === 'string' && /^\d+$/.test(ttl))) {
      const n = Math.floor(Number(ttl));
      if (n >= 0 && n <= TTL_MAX_MIN) out.historyTtlMin = n;
    }
    if (typeof input.autoSwitchUrl === 'string') {
      // Vide = "pas de chaine de repli" (choix explicite). Invalide = ignore : on ne remplace pas
      // une chaine deja reglee par rien.
      if (!input.autoSwitchUrl.trim()) out.autoSwitchUrl = '';
      else {
        const slug = channelSlug(input.autoSwitchUrl, reserved);
        if (slug) out.autoSwitchUrl = 'https://www.twitch.tv/' + slug;
      }
    }
    return out;
  }

  // Compteurs importes : nombres positifs seulement. Les drops en cours et les battements des
  // onglets ne viennent jamais du fichier : ils decrivent CETTE machine, maintenant.
  function sanitizeStats(input) {
    const out = {};
    if (!input || typeof input !== 'object') return out;
    const num = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
    ['pointsClaimed', 'pointsValue', 'dropsClaimed', 'watchSeconds'].forEach((k) => {
      const v = num(input[k]); if (v != null) out[k] = v;
    });
    ['lastPointsClaim', 'lastDropsClaim'].forEach((k) => { if (k in input) out[k] = num(input[k]); });
    if (input.byChannel && typeof input.byChannel === 'object') {
      out.byChannel = {};
      Object.keys(input.byChannel).slice(0, 500).forEach((ch) => {
        const c = input.byChannel[ch];
        if (!c || typeof c !== 'object' || !/^[a-z0-9_]{1,25}$/i.test(ch)) return;
        out.byChannel[ch.toLowerCase()] = { points: num(c.points) || 0, drops: num(c.drops) || 0, seconds: num(c.seconds) || 0 };
      });
    }
    return out;
  }

  // Historique importe : entrees bien formees seulement (une entree null faisait planter
  // chaque rendu du popup), plafonne a max (200 comme le service worker).
  function sanitizeHistory(list, max) {
    if (!Array.isArray(list)) return [];
    const str = (v) => (typeof v === 'string' ? v.slice(0, 200) : '');
    return list.filter((e) => e && typeof e === 'object' && (e.type === 'drop' || e.type === 'points') &&
      typeof e.ts === 'number' && Number.isFinite(e.ts))
      .map((e) => {
        const o = { type: e.type, ts: e.ts };
        if (e.type === 'points') { o.amount = Number(e.amount) || 0; return o; }
        o.name = str(e.name);
        if (str(e.game)) o.game = str(e.game);
        if (str(e.campaign)) o.campaign = str(e.campaign);
        return o;
      })
      .slice(-(max || 200));
  }

  const api = {
    formatRelativeTime, formatCompact, compareVersions, shouldReload, makeThrottle,
    cleanDropName, pruneHistory, sortDropsByEta, tabState, isTabAlert,
    groupDropsByGame, groupHistoryByGame, gameNameFromHref,
    isInventoryPath, channelSlug, parseCount, sanitizeSettings, sanitizeStats, sanitizeHistory
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TAUtil = api;
})(typeof self !== 'undefined' ? self : this);
