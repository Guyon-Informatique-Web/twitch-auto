// Clique automatiquement les gates contenu mature et les prompts "Toujours la ?".
window.TA = window.TA || {};
TA.modules = TA.modules || {};
TA.modules.antiAfk = (function () {
  let unsub = null;

  function tick() {
    try {
      const mature = TA.dom.findFirst(TA.selectors.matureAccept);
      if (TA.dom.click(mature)) {
        TA.log.info('antiAfk', 'gate contenu mature accepte');
        return;
      }
      // Recherche limitee a l'overlay du player (pas tout le DOM) -> moins de scan, moins de faux positifs.
      const root = TA.dom.findFirst(TA.selectors.playerOverlay) ||
        document.querySelector('[data-a-target="video-player"]');
      if (!root) return;
      const still = TA.dom.findByText('button', TA.selectors.stillWatchingHints, root);
      if (TA.dom.click(still)) {
        TA.log.info('antiAfk', 'prompt "toujours la" clique');
      }
    } catch (e) { TA.log.error('antiAfk', e); }
  }

  return {
    id: 'antiAfk',
    settingKey: 'antiAfk',
    start() { unsub = TA.dom.subscribe(tick); },
    stop() { if (unsub) { unsub(); unsub = null; } }
  };
})();
