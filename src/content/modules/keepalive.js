// Anti-pause : maintient la lecture des onglets en arriere-plan (sinon pas de farm).
// On ecoute l'evenement 'pause' de la video (non throttle par Chrome, contrairement aux timers)
// pour relancer INSTANTANEMENT des que Twitch met en pause au changement d'onglet.
// Chrome refuse l'autoplay AVEC SON d'un onglet jamais clique -> repli en muet.
// Ne touche JAMAIS l'onglet au premier plan (respecte une pause volontaire).
window.TA = window.TA || {};
TA.modules = TA.modules || {};
TA.modules.keepalive = (function () {
  let unsub = null;
  let timer = null;
  const wired = new WeakSet();        // videos deja equipees du listener
  const lastPlay = new WeakMap();     // anti-boucle : derniere relance par video

  function play(v) {
    const now = Date.now();
    if (lastPlay.get(v) && now - lastPlay.get(v) < 1500) return; // garde anti-boucle
    lastPlay.set(v, now);
    const p = v.play();
    if (p && typeof p.catch === 'function') {
      p.catch(() => {
        v.muted = true;               // autoplay avec son refuse -> on coupe le son et on relance
        const p2 = v.play();
        if (p2 && typeof p2.catch === 'function') p2.catch(() => {});
      });
    }
  }

  function shouldResume(v) {
    return document.hidden && !!TA.dom.currentChannel() && v.paused && !v.ended;
  }

  function onPause(e) {
    const v = e.target;
    if (shouldResume(v)) play(v);     // relance immediate quand Twitch met en pause en fond
  }

  function wire() {
    document.querySelectorAll('video').forEach((v) => {
      if (wired.has(v)) return;
      wired.add(v);
      v.addEventListener('pause', onPause);
    });
  }

  function sweep() {
    if (!document.hidden || !TA.dom.currentChannel()) return;
    document.querySelectorAll('video').forEach((v) => { if (v.paused && !v.ended) play(v); });
  }

  function tick() { wire(); sweep(); }
  function onVis() { if (document.hidden) sweep(); }

  return {
    id: 'keepalive',
    settingKey: 'keepAlive',
    start() {
      unsub = TA.dom.subscribe(tick);   // equipe les nouvelles videos + reprise
      document.addEventListener('visibilitychange', onVis);
      timer = setInterval(tick, 30000); // filet de securite
    },
    stop() {
      if (unsub) { unsub(); unsub = null; }
      document.removeEventListener('visibilitychange', onVis);
      if (timer) { clearInterval(timer); timer = null; }
    }
  };
})();
