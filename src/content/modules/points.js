// Auto-claim des coffres bonus de points de chaine.
// Calcule le gain REEL via le solde affiche (repli sur 50 si illisible).
window.TA = window.TA || {};
TA.modules = TA.modules || {};
TA.modules.points = (function () {
  let unsub = null;

  function readBalance() {
    const el = TA.dom.findFirst(TA.selectors.pointsBalance);
    if (!el) return null;
    const digits = (el.textContent || '').replace(/[^\d]/g, ''); // "1 234" / "1,234" -> "1234"
    if (!digits) return null;
    const n = parseInt(digits, 10);
    return Number.isFinite(n) ? n : null;
  }

  function tick() {
    try {
      const btn = TA.dom.findFirst(TA.selectors.pointsClaim);
      if (!btn || !TA.dom.isClickable(btn)) return;
      const before = readBalance();
      if (!TA.dom.click(btn)) return;
      TA.log.info('points', 'coffre reclame');
      // Le solde se met a jour apres le claim : on relit ~1.5s plus tard pour le delta exact.
      setTimeout(() => {
        const after = readBalance();
        let amount = 50; // repli si le solde n'est pas lisible
        if (before != null && after != null && after > before && after - before <= 100000) {
          amount = after - before;
        }
        TA.report('points', { amount });
      }, 1500);
    } catch (e) { TA.log.error('points', e); }
  }

  return {
    id: 'points',
    settingKey: 'points',
    start() { unsub = TA.dom.subscribe(tick); },
    stop() { if (unsub) { unsub(); unsub = null; } }
  };
})();
