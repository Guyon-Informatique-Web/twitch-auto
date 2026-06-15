// Recharge la page quand le player affiche une erreur TRANSITOIRE.
// Garde-fous : max 5 reloads / 10 min, et jamais sur un etat non transitoire.
window.TA = window.TA || {};
TA.modules = TA.modules || {};
TA.modules.reloader = (function () {
  const KEY = 'ta_reload_history';
  const MAX = 5;
  const WINDOW = 10 * 60 * 1000;
  const DELAY = 5000;
  let unsub = null;
  let pending = false;

  function history() {
    try { return JSON.parse(sessionStorage.getItem(KEY) || '[]'); } catch (e) { return []; }
  }
  function record(now) {
    const h = history().filter((t) => now - t < WINDOW);
    h.push(now);
    sessionStorage.setItem(KEY, JSON.stringify(h));
  }
  function hasTransientError() {
    const root = TA.dom.findFirst(TA.selectors.playerOverlay) ||
      document.querySelector('[data-a-target="video-player"]');
    if (!root) return false;
    const txt = root.textContent || '';
    if (TA.selectors.reloadExcludePatterns.some((re) => re.test(txt))) return false;
    return TA.selectors.reloadErrorPatterns.some((re) => re.test(txt));
  }

  function tick() {
    try {
      if (pending || !hasTransientError()) return;
      const now = Date.now();
      if (!TAUtil.shouldReload(history(), now, MAX, WINDOW)) {
        TA.log.warn('reloader', 'limite de reloads atteinte, on arrete');
        return;
      }
      pending = true;
      record(now);
      TA.log.info('reloader', `erreur player detectee, reload dans ${DELAY / 1000}s`);
      setTimeout(() => location.reload(), DELAY);
    } catch (e) { TA.log.error('reloader', e); }
  }

  return {
    id: 'reloader',
    settingKey: 'reload',
    start() { unsub = TA.dom.subscribe(tick); },
    stop() { if (unsub) { unsub(); unsub = null; } }
  };
})();
