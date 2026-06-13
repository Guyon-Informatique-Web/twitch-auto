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

  // Throttle par cle : allow(key, now) renvoie true au plus une fois par fenetre.
  function makeThrottle(windowMs) {
    const seen = new Map();
    return function allow(key, now) {
      if (seen.has(key) && now - seen.get(key) < windowMs) return false;
      seen.set(key, now);
      return true;
    };
  }

  const api = { formatRelativeTime, shouldReload, makeThrottle };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TAUtil = api;
})(typeof self !== 'undefined' ? self : this);
