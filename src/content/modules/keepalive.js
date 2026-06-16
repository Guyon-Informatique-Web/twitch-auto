// Anti-pause : maintient la lecture des onglets en arriere-plan (sinon pas de farm).
// Chrome refuse l'autoplay AVEC SON d'un onglet jamais clique -> on essaie play(), et si
// c'est refuse on coupe le son de la video (autoplay muet toujours autorise) puis on relance.
// Ne touche JAMAIS l'onglet au premier plan (respecte une pause volontaire).
window.TA = window.TA || {};
TA.modules = TA.modules || {};
TA.modules.keepalive = (function () {
  let unsub = null;
  let timer = null;

  function play(v) {
    const p = v.play();
    if (p && typeof p.catch === 'function') {
      p.catch(() => {
        // autoplay refuse -> on coupe le son de l'element et on relance (autoplay muet OK)
        v.muted = true;
        const p2 = v.play();
        if (p2 && typeof p2.catch === 'function') p2.catch(() => {});
      });
    }
  }

  function resume() {
    if (!document.hidden) return;            // onglet visible -> on laisse l'utilisateur maitre
    if (!TA.dom.currentChannel()) return;     // seulement sur une page de chaine
    document.querySelectorAll('video').forEach((v) => {
      if (v.paused && !v.ended) {
        try { play(v); } catch (e) { /* on reessaiera */ }
      }
    });
  }

  function onVis() { if (document.hidden) resume(); }

  return {
    id: 'keepalive',
    settingKey: 'keepAlive',
    start() {
      unsub = TA.dom.subscribe(resume);       // reagit a l'apparition du player
      document.addEventListener('visibilitychange', onVis);
      timer = setInterval(resume, 30000);     // filet de securite periodique
    },
    stop() {
      if (unsub) { unsub(); unsub = null; }
      document.removeEventListener('visibilitychange', onVis);
      if (timer) { clearInterval(timer); timer = null; }
    }
  };
})();
