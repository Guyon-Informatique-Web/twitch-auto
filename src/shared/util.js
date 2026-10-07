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

  // Delai a venir, compact : "dans 45 min", "dans 3 h", "dans 2 j" (FR) ou "in 3 h" (EN).
  function formatRelativeFuture(ts, now, lang) {
    const en = String(lang || '').toLowerCase().startsWith('en');
    const min = Math.max(0, Math.round((ts - now) / 60000));
    if (min < 60) return en ? `in ${min} min` : `dans ${min} min`;
    const h = Math.round(min / 60);
    if (h < 48) return en ? `in ${h} h` : `dans ${h} h`;
    const d = Math.round(h / 24);
    return en ? `in ${d} d` : `dans ${d} j`;
  }

  // Retire le verbe d'action en tete d'un nom de drop ("Recuperer X" -> "X").
  // Utile quand l'etiquette du bouton de reclamation est captee comme nom (bandeau sur stream).
  function cleanDropName(name) {
    const s = String(name == null ? '' : name).trim();
    const cleaned = s.replace(/^(r[eé]cup[eé]rer|r[eé]clamer|obtenir|claim now|claim)\s+/i, '').trim();
    return cleaned || s; // si le strip vide tout (verbe seul), on garde l'original
  }

  // Message de refus que Twitch affiche apres un clic sur "En profiter" (bandeau rouge en bas de
  // page). Vu le 07/10/2026 : "Une erreur est survenue. Liez vos comptes de jeu a votre compte
  // Twitch pour recevoir cette recompense en jeu." On COMPTE les occurrences : le texte de la page
  // est lu avant et apres le clic, et seul un message apparu entre les deux vaut refus (un bandeau
  // laisse par le clic precedent ne doit pas etre attribue au drop suivant).
  // link = compte de jeu a lier (rien ne passera tant que l'utilisateur ne l'a pas fait),
  // error = echec generique.
  const REFUSAL_LINK = /li(?:ez|er) (?:vos|votre|ton|tes) comptes? de jeu|link (?:your )?(?:game )?accounts?|connect (?:your )?game accounts?/g;
  const REFUSAL_ERROR = /une erreur (?:est survenue|s.est produite)|an error (?:has )?occurred|something went wrong/g;
  function claimRefusalCounts(text) {
    const t = String(text == null ? '' : text).toLowerCase();
    return { link: (t.match(REFUSAL_LINK) || []).length, error: (t.match(REFUSAL_ERROR) || []).length };
  }

  // Refus apparu entre deux lectures : 'link', 'error' ou ''.
  function claimRefusal(before, after) {
    if (after.link > before.link) return 'link';
    if (after.error > before.error) return 'error';
    return '';
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

  // Slug BRUT (tel qu'ecrit dans l'URL) du jeu porte par un lien vers l'annuaire :
  // "/directory/category/escape-from-tarkov?filter=drops" -> "escape-from-tarkov".
  function gameSlugFromHref(href) {
    const m = String(href || '').match(/\/directory\/(?:category|game)\/([^/?#]+)/);
    return m && /^[\w%.-]+$/.test(m[1]) ? m[1] : '';
  }

  // Annuaire des chaines EN DIRECT qui ont les drops actives pour ce jeu (verifie le 06/10/2026 :
  // ?filter=drops ne garde que les chaines "DropsEnabled"). tawatch=1 demande au script de
  // contenu d'y ouvrir la premiere chaine (module participate).
  function participateUrl(slug) {
    return slug ? `https://www.twitch.tv/directory/category/${slug}?filter=drops&tawatch=1` : '';
  }

  // Jour LOCAL d'un horodatage, en cle triable "AAAA-MM-JJ" ('' sans horodatage valide).
  function dayKey(ts) {
    if (typeof ts !== 'number' || !Number.isFinite(ts)) return '';
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // Historique groupe par jour, dans l'ordre recu (le plus recent d'abord). Les entrees sans
  // date forment un dernier groupe a cle vide : jamais perdues.
  function groupHistoryByDay(entries) {
    if (!Array.isArray(entries)) return [];
    const groups = [];
    const byKey = new Map();
    entries.forEach((e) => {
      if (!e || typeof e !== 'object') return;
      const key = dayKey(e.ts);
      let g = byKey.get(key);
      if (!g) { g = { day: key, entries: [] }; byKey.set(key, g); groups.push(g); }
      g.entries.push(e);
    });
    return groups.filter((g) => g.day).concat(groups.filter((g) => !g.day));
  }

  // Date de fin d'une campagne, lue dans le texte du bloc de campagne de l'inventaire
  // ("Date de fin : 14 oct. 2026 a 01:59", "Se termine dans 3 jours", "Ends Oct 14, 1:59 AM",
  // "14/10/2026 01:59"...). Le texte recu commence a l'indice de fin (observer.js coupe ce qui
  // precede : une date de debut ne peut pas etre prise pour la fin). Renvoie un horodatage, ou
  // null des que la lecture est douteuse (deux dates, date impossible, jj/mm ambigu) : l'affichage
  // disparait alors, il ne devine jamais.
  const MONTHS = {
    janv: 0, jan: 0, janvier: 0, january: 0, fevr: 1, fev: 1, feb: 1, fevrier: 1, february: 1,
    mars: 2, mar: 2, march: 2, avr: 3, apr: 3, avril: 3, april: 3, mai: 4, may: 4,
    juin: 5, jun: 5, june: 5, juil: 6, jul: 6, juillet: 6, july: 6, aout: 7, aug: 7, august: 7,
    sept: 8, sep: 8, septembre: 8, september: 8, oct: 9, octobre: 9, october: 9,
    nov: 10, novembre: 10, november: 10, dec: 11, decembre: 11, december: 11
  };
  function parseEndDate(text, now, lang) {
    const s = String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[\s\u00a0\u202f]+/g, ' ');
    if (!s.trim()) return null;
    const ok = (ts) => (Number.isFinite(ts) && ts > now - 864e5 && ts < now + 400 * 864e5 ? ts : null);
    // Heure, cherchee APRES la date : "a 01:59", "1:59 am", "01h59" ; jamais une duree ("2 h 00 min").
    const timeIn = (str) => {
      const tm = str.match(/\b(\d{1,2}) ?[:h] ?(\d{2})(?!\d)(?! ?min) ?(am|pm)?/);
      if (!tm) return null;
      let hh = parseInt(tm[1], 10) % 24;
      const mm = parseInt(tm[2], 10);
      if (mm > 59) return null;
      if (tm[3] === 'pm' && hh < 12) hh += 12;
      if (tm[3] === 'am' && hh === 12) hh = 0;
      return [hh, mm];
    };
    // Date absolue d'abord, plus precise qu'un "(dans 8 jours)" ecrit a cote : numerique
    // (jj/mm/aaaa en francais, mm/jj/aaaa en anglais americain) ou en mots. Les jours abreges
    // francais sont retires avant : dans "mar. 14 oct.", "mar" serait lu comme mars.
    const lg = String(lang || '').toLowerCase();
    const s1 = s.replace(/\b(lun|mar|mer|jeu|ven|sam|dim)\. /g, '');
    const words = s1.replace(/[.,]/g, ' ').replace(/ +/g, ' ');   // "14 oct. 2026" -> "14 oct 2026"
    const dates = [];
    let m;
    const numRe = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/g;
    while ((m = numRe.exec(s1))) dates.push({ kind: 'num', a: +m[1], b: +m[2], y: +m[3], at: m.index, len: m[0].length });
    const frRe = /\b(\d{1,2})(?:er)? ([a-z]+)(?: (\d{4}))?/g;
    while ((m = frRe.exec(words))) if (MONTHS[m[2]] != null) dates.push({ kind: 'fr', day: +m[1], month: MONTHS[m[2]], y: m[3] ? +m[3] : null, at: m.index, len: m[0].length, src: words });
    // Jamais "oct 12" dans "9 oct., 12:57" (format reel de l'inventaire Twitch en francais,
    // releve le 06/10/2026) : un nombre suivi de ":" ou "h" est une heure, pas un jour.
    const enRe = /\b([a-z]+) (\d{1,2})(?:st|nd|rd|th)?(?: (\d{4}))?\b(?! ?[:h] ?\d)/g;
    while ((m = enRe.exec(words))) if (MONTHS[m[1]] != null) dates.push({ kind: 'en', day: +m[2], month: MONTHS[m[1]], y: m[3] ? +m[3] : null, at: m.index, len: m[0].length, src: words });
    if (dates.length > 1) return null;              // plusieurs dates : on ne choisit pas
    if (!dates.length) {
      // Relatif : "dans 3 jours", "in 5 hours".
      const rel = s1.match(/\b(?:dans|in) (\d+) ?(minutes?|min|heures?|hours?|h|jours?|days?|j|d|semaines?|weeks?)\b/);
      if (rel) {
        const n = parseInt(rel[1], 10);
        const u = rel[2];
        const ms = /^min/.test(u) ? 6e4 : /^(h|heure|hour)/.test(u) ? 36e5 : /^(semaine|week)/.test(u) ? 7 * 864e5 : 864e5;
        return ok(now + n * ms);
      }
      // "Demain a 01:59" : le jour J+1 a l'heure lue (23:59 sans heure).
      const tom = s1.match(/\b(demain|tomorrow)\b/);
      if (tom) {
        const tt = timeIn(s1.slice(tom.index)) || [23, 59];
        const d = new Date(now);
        return ok(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, tt[0], tt[1]).getTime());
      }
      return null;
    }
    const d0 = dates[0];
    let day; let month; let year;
    if (d0.kind === 'num') {
      if (d0.a > 12 && d0.b <= 12) { day = d0.a; month = d0.b - 1; }
      else if (d0.b > 12 && d0.a <= 12) { day = d0.b; month = d0.a - 1; }
      else if (lg.startsWith('fr')) { day = d0.a; month = d0.b - 1; }
      else if (lg === 'en-us') { day = d0.b; month = d0.a - 1; }
      else return null;                             // jj/mm ou mm/jj : impossible a trancher
      year = d0.y;
    } else { day = d0.day; month = d0.month; year = d0.y; }
    const t = timeIn((d0.src || s1).slice(d0.at + d0.len)) || [23, 59];
    const y0 = new Date(now).getFullYear();
    const build = (y) => {
      const dt = new Date(y, month, day, t[0], t[1]);
      return dt.getMonth() === month && dt.getDate() === day ? dt.getTime() : NaN;   // pas de 31 novembre
    };
    let ts = build(year || y0);
    if (!Number.isFinite(ts)) return null;
    // Sans annee : une date passee de plus d'un mois est celle de l'an prochain ("14 janv." lu en
    // decembre) ; passee de moins d'un mois, c'est une campagne terminee -> null.
    if (!year && ts < now - 864e5) ts = ts < now - 30 * 864e5 ? build(y0 + 1) : NaN;
    return ok(ts);
  }

  // Temps de visionnage encore necessaire pour finir une campagne : ses drops avancent EN MEME
  // TEMPS, donc c'est le plus long des temps restants (null si aucun n'est connu).
  function campaignRemainingMin(drops) {
    const v = (drops || []).map((d) => (d && typeof d.remainingMin === 'number' ? d.remainingMin : null)).filter((x) => x != null);
    return v.length ? Math.max(...v) : null;
  }

  // Chaine de repli suivante : celle qui suit la chaine courante dans la liste, ou la premiere si
  // on n'y est pas. Jamais de retour au debut : une liste entierement hors ligne s'arrete au bout.
  function nextFallback(list, current) {
    const l = (Array.isArray(list) ? list : []).filter(Boolean);
    if (!l.length) return '';
    const i = l.indexOf(current);
    if (i < 0) return l[0];
    return i + 1 < l.length ? l[i + 1] : '';
  }

  // Suivi de progression des drops en cours, pour l'alerte "drop bloque". prev : { cle: { pct,
  // since, watch, notified } } du releve precedent ; watchByGame : { slug de jeu: secondes de
  // lecture cumulees sur des chaines de CE jeu }. Un drop est BLOQUE quand :
  //  - son pourcentage n'a pas bouge depuis le seuil (30 min, ou deux "points de %" pour un drop
  //    tres long) ;
  //  - au moins 25 min sur 30 de lecture ont ete comptees sur des chaines de SON jeu pendant ce
  //    temps (une campagne laissee de cote, dont on ne regarde pas le jeu, n'est jamais jugee) ;
  //  - aucun autre drop de sa campagne n'avance (sinon il attend son tour : campagne sequentielle).
  const STUCK_MS = 30 * 60 * 1000;
  const STUCK_WATCH_RATIO = 25 / 30;
  function dropKey(d) { return [d.game || '', d.campaign || '', d.name || ''].join('|'); }
  function trackProgress(prev, list, now, watchByGame) {
    const progress = {};
    const stuck = [];
    const games = watchByGame && typeof watchByGame === 'object' ? watchByGame : {};
    // Lecture "propre" : un jeu nomme "constructor" ne doit pas lire Object.prototype.
    const watchOf = (slug) => (slug ? (Object.prototype.hasOwnProperty.call(games, slug) ? Number(games[slug]) || 0 : 0) : null);
    const items = (Array.isArray(list) ? list : []).filter((d) => d && typeof d === 'object');
    items.forEach((d) => {
      const key = dropKey(d);
      const p = prev && Object.prototype.hasOwnProperty.call(prev, key) ? prev[key] : null;
      // Meme % : on garde le suivi. Jeu inconnu au premier releve (watch null) puis lu : le
      // compteur de lecture part de maintenant, la date du dernier mouvement est gardee.
      progress[key] = (p && p.pct === d.percent && p.watch !== undefined)
        ? { ...p, watch: p.watch == null ? watchOf(d.gameSlug) : p.watch }
        : { pct: d.percent, since: now, watch: watchOf(d.gameSlug), notified: false };
    });
    const moving = new Set();
    items.forEach((d) => { if (now - progress[dropKey(d)].since < STUCK_MS) moving.add((d.game || '') + '|' + (d.campaign || '')); });
    items.forEach((d) => {
      const key = dropKey(d);
      const e = progress[key];
      if (!d.gameSlug || e.watch == null) return;                         // jeu inconnu : on ne juge pas
      if (moving.has((d.game || '') + '|' + (d.campaign || ''))) return;  // la campagne avance
      const perPct = typeof d.remainingMin === 'number' && d.percent < 100 ? d.remainingMin / (100 - d.percent) : 0;
      const thr = Math.max(STUCK_MS, 2 * perPct * 60000);
      const watched = watchOf(d.gameSlug) - e.watch;
      if (now - e.since >= thr && watched >= (thr / 1000) * STUCK_WATCH_RATIO) {
        stuck.push({
          key, name: d.name || '', game: d.game || '', campaign: d.campaign || '', gameSlug: d.gameSlug,
          since: e.since, watchedMin: Math.floor(watched / 60), fresh: !e.notified
        });
      }
    });
    return { progress, stuck };
  }

  // --- Import d'une sauvegarde : liste blanche des cles ET des valeurs ---------------------
  // Un fichier bricole (ou partage par un ami) ne doit rien pouvoir poser d'autre que des
  // reglages valides : pas d'URL arbitraire pour l'auto-switch, pas d'adresse d'envoi d'erreurs
  // (errorEndpoint n'est jamais importable), pas de type inattendu qui casserait le rendu.
  const BOOL_SETTINGS = ['enabled', 'points', 'drops', 'reload', 'lowQuality', 'antiAfk',
    'muteBackground', 'keepAlive', 'autoInventory', 'notifications', 'autoSwitch', 'tracker',
    'autoReloadTabs', 'autoWatch'];
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
    // Liste de chaines de repli (v1.13) : slugs valides, sans doublon, 5 au plus. Une liste
    // entierement invalide est ignoree (elle n'efface pas celle deja reglee) ; une liste vide est un
    // choix explicite. Une sauvegarde 1.12.1, qui ne porte que la chaine unique, devient une liste.
    if (Array.isArray(input.autoSwitchChannels)) {
      const list = [];
      input.autoSwitchChannels.forEach((x) => {
        const slug = typeof x === 'string' ? channelSlug(x, reserved) : '';
        if (slug && !list.includes(slug)) list.push(slug);
      });
      if (list.length || !input.autoSwitchChannels.length) out.autoSwitchChannels = list.slice(0, 5);
    } else if (out.autoSwitchUrl) {
      out.autoSwitchChannels = [channelSlug(out.autoSwitchUrl)];
      out.autoSwitchUrl = '';
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
    formatRelativeTime, formatRelativeFuture, formatCompact, compareVersions, shouldReload, makeThrottle,
    cleanDropName, claimRefusalCounts, claimRefusal, pruneHistory, sortDropsByEta, tabState, isTabAlert,
    groupDropsByGame, gameNameFromHref, gameSlugFromHref, participateUrl,
    dayKey, groupHistoryByDay, parseEndDate, campaignRemainingMin, nextFallback,
    dropKey, trackProgress, STUCK_MS,
    isInventoryPath, channelSlug, parseCount, sanitizeSettings, sanitizeStats, sanitizeHistory
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TAUtil = api;
})(typeof self !== 'undefined' ? self : this);
