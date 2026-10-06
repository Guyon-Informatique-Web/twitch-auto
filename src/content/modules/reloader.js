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
  let reloadTimer = null;

  function history() {
    try { return JSON.parse(sessionStorage.getItem(KEY) || '[]'); } catch (e) { return []; }
  }
  function record(now) {
    const h = history().filter((t) => now - t < WINDOW);
    h.push(now);
    sessionStorage.setItem(KEY, JSON.stringify(h));
  }
  function hasTransientError() {
    // Chaine hors-ligne (detection mutualisee, garde live HLS incluse) : ce n'est pas une
    // erreur transitoire -> on ne recharge pas (sinon boucle de reloads sur un stream coupe).
    if (TA.dom.isChannelOffline && TA.dom.isChannelOffline()) return false;
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
      TA.log.info('reloader', `erreur player detectee, reload dans ${DELAY / 1000}s`);
      reloadTimer = setTimeout(() => {
        reloadTimer = null;
        // Le lecteur a pu repartir seul pendant ces 5 s : on ne recharge (et on ne compte dans le
        // quota de 5 / 10 min) que si l'erreur est encore la. Une erreur qui clignote ne grille
        // donc plus le quota sans jamais recharger.
        if (!hasTransientError()) { pending = false; return; }
        try { record(Date.now()); } catch (e) { pending = false; return; }   // sans compteur, pas de reload (anti-boucle)
        location.reload();
      }, DELAY);
    } catch (e) { TA.log.error('reloader', e); }
  }

  return {
    id: 'reloader',
    settingKey: 'reload',
    start() { unsub = TA.dom.subscribe(tick); },
    stop() {
      if (unsub) { unsub(); unsub = null; }
      if (reloadTimer) { clearTimeout(reloadTimer); reloadTimer = null; }   // fonction coupee : pas de reload
      pending = false;
    }
  };
})();
