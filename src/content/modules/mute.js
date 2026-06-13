// Coupe le son quand l'onglet passe en arriere-plan, le retablit au retour.
window.TA = window.TA || {};
TA.modules = TA.modules || {};
TA.modules.mute = (function () {
  function apply() {
    const hidden = document.hidden;
    document.querySelectorAll('video').forEach((v) => { v.muted = hidden; });
  }

  return {
    id: 'mute',
    settingKey: 'muteBackground',
    start() {
      document.addEventListener('visibilitychange', apply);
      apply();
    },
    stop() {
      document.removeEventListener('visibilitychange', apply);
      document.querySelectorAll('video').forEach((v) => { v.muted = false; });
    }
  };
})();
