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

  const api = { formatRelativeTime, formatCompact, compareVersions, shouldReload, makeThrottle, cleanDropName, pruneHistory };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TAUtil = api;
})(typeof self !== 'undefined' ? self : this);
