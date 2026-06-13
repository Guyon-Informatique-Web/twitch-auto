// Force la qualite la plus basse quand l'onglet est en arriere-plan (farming AFK).
// Methode best-effort via localStorage lu par le player Twitch.
window.TA = window.TA || {};
TA.modules = TA.modules || {};
TA.modules.quality = (function () {
  const LOW = '160p30';

  function setLow() {
    try {
      localStorage.setItem('video-quality', JSON.stringify({ default: LOW }));
      TA.log.info('quality', 'qualite forcee a 160p (onglet en fond)');
    } catch (e) { TA.log.error('quality', e); }
  }

  function onVis() {
    if (document.hidden) setLow();
  }

  return {
    id: 'quality',
    settingKey: 'lowQuality',
    start() {
      if (document.hidden) setLow();
      document.addEventListener('visibilitychange', onVis);
    },
    stop() { document.removeEventListener('visibilitychange', onVis); }
  };
})();
