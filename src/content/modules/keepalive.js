// Anti-pause : relance la lecture d'un onglet en arriere-plan s'il se met en pause
// (Chrome/Twitch peuvent mettre en pause les onglets inactifs -> on perd le farm).
// Ne touche JAMAIS l'onglet au premier plan (respecte une pause volontaire de l'utilisateur).
window.TA = window.TA || {};
TA.modules = TA.modules || {};
TA.modules.keepalive = (function () {
  let timer = null;

  function resume() {
    if (!document.hidden) return;            // onglet visible -> on laisse l'utilisateur maitre
    if (!TA.dom.currentChannel()) return;     // seulement sur une page de chaine
    document.querySelectorAll('video').forEach((v) => {
      if (v.paused && !v.ended) {
        try {
          const p = v.play();
          if (p && typeof p.catch === 'function') p.catch(() => {});
        } catch (e) { /* lecture refusee -> on reessaiera au prochain tick */ }
      }
    });
  }

  function onVis() { if (document.hidden) resume(); }

  return {
    id: 'keepalive',
    settingKey: 'keepAlive',
    start() {
      document.addEventListener('visibilitychange', onVis);
      timer = setInterval(resume, 20000); // re-verifie toutes les 20s tant que l'onglet est en fond
    },
    stop() {
      document.removeEventListener('visibilitychange', onVis);
      if (timer) { clearInterval(timer); timer = null; }
    }
  };
})();
