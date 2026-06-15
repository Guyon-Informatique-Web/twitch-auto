// Fonctions pures partagees entre service worker, popup et content scripts.
// Aucun acces DOM/Chrome ici -> testable en Node.
(function (root) {
  // Temps relatif en francais a partir d'un timestamp (ms) et de "maintenant".
  function formatRelativeTime(ts, now) {
    if (ts == null) return 'jamais';
    const s = Math.max(0, Math.floor((now - ts) / 1000));
    if (s < 60) return 'a l instant';
    const m = Math.floor(s / 60);
    if (m < 60) return `il y a ${m} min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `il y a ${h} h`;
    const j = Math.floor(h / 24);
    return `il y a ${j} j`;
  }

  // Autorise un reload tant qu'on n'a pas depasse maxN reloads dans la fenetre.
  function shouldReload(history, now, maxN, windowMs) {
    const recent = history.filter((t) => now - t < windowMs);
    return recent.length < maxN;
  }

  // Format compact d'un nombre : 10, 100, 999, 1K, 10K, 1,2M, 3,4B.
  function formatCompact(n) {
    n = Number(n) || 0;
    const abs = Math.abs(n);
    const units = [{ v: 1e9, s: 'B' }, { v: 1e6, s: 'M' }, { v: 1e3, s: 'K' }];
    for (const u of units) {
      // seuil un poil sous l'unite pour eviter le debordement d'arrondi (999 999 -> "1M", pas "1000K")
      if (abs >= u.v * 0.9995) {
        const val = Math.round((n / u.v) * 10) / 10; // 1 decimale
        return String(val).replace('.', ',') + u.s;
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

  const api = { formatRelativeTime, formatCompact, compareVersions, shouldReload, makeThrottle };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TAUtil = api;
})(typeof self !== 'undefined' ? self : this);
