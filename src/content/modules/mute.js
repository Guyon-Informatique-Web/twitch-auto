// Coupe le son quand l'onglet passe en arriere-plan, le retablit au retour.
// On mute au niveau de l'ONGLET (via le service worker) et non l'element video :
// changer v.muted sans interaction utilisateur met le player en pause (politique autoplay).
window.TA = window.TA || {};
TA.modules = TA.modules || {};
TA.modules.mute = (function () {
  function setMuted(hidden) {
    try {
      const p = chrome.runtime.sendMessage({ type: 'mute', hidden });
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (e) { /* SW endormi / contexte invalide */ }
  }

  function onVis() { setMuted(document.hidden); }

  return {
    id: 'mute',
    settingKey: 'muteBackground',
    start() {
      document.addEventListener('visibilitychange', onVis);
      setMuted(document.hidden);
    },
    stop() {
      document.removeEventListener('visibilitychange', onVis);
      setMuted(false); // on retablit le son de l'onglet quand on desactive la fonction
    }
  };
})();
