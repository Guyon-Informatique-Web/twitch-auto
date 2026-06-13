// Auto-claim des coffres bonus de points de chaine.
window.TA = window.TA || {};
TA.modules = TA.modules || {};
TA.modules.points = (function () {
  let unsub = null;

  function tick() {
    try {
      const btn = TA.dom.findFirst(TA.selectors.pointsClaim);
      if (TA.dom.click(btn)) {
        // Le bonus de base Twitch est 50 pts ; valeur estimee (le bouton n'expose pas le montant).
        TA.report('points', { amount: 50 });
        TA.log.info('points', 'coffre reclame');
      }
    } catch (e) { TA.log.error('points', e); }
  }

  return {
    id: 'points',
    settingKey: 'points',
    start() { unsub = TA.dom.subscribe(tick); },
    stop() { if (unsub) { unsub(); unsub = null; } }
  };
})();
