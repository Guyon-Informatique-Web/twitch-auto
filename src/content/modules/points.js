// Auto-claim des coffres bonus de points de chaine.
// Calcule le gain REEL via le solde affiche (repli sur 50 si illisible ou abrege).
window.TA = window.TA || {};
TA.modules = TA.modules || {};
TA.modules.points = (function () {
  // Un coffre apparait toutes les ~15 min : ces deux gardes ne retardent jamais un vrai claim,
  // mais empechent de recliquer (et de compter deux fois) un bouton encore present pendant
  // son animation de retrait.
  const COOLDOWN = 5000;              // delai mini entre deux clics, toutes chaines confondues
  const NODE_GUARD = 60 * 1000;       // un meme bouton n'est pas reclique avant 60 s
  const clickedAt = new WeakMap();    // bouton -> date du clic (WeakMap : pas de fuite memoire)
  let unsub = null;
  let lastClaim = 0;

  // Solde de points de chaine : premier candidat lisible qui n'est PAS le solde de Bits voisin.
  function readBalance() {
    const S = TA.selectors;
    const bits = (S.bitsBalance || []).join(',');
    for (const sel of S.pointsBalance) {
      let els = [];
      try { els = document.querySelectorAll(sel); } catch (e) { continue; }
      for (const el of els) {
        if (bits && el.closest(bits)) continue;
        const c = TAUtil.parseCount(el.textContent);
        if (c) return c;
      }
    }
    return null;
  }

  function tick() {
    try {
      const now = Date.now();
      if (now - lastClaim < COOLDOWN) return;
      const btn = TA.dom.findFirst(TA.selectors.pointsClaim);
      if (!btn || now - (clickedAt.get(btn) || 0) < NODE_GUARD || !TA.dom.isClickable(btn)) return;
      const before = readBalance();
      if (!TA.dom.click(btn)) return;
      clickedAt.set(btn, now);
      lastClaim = now;
      TA.log.info('points', 'coffre reclame');
      // Le solde se met a jour apres le claim : on relit ~1.5s plus tard pour le delta exact.
      // Un solde abrege ("12,3 k") ne permet pas de mesurer 50 points : on garde alors le repli.
      setTimeout(() => {
        const after = readBalance();
        let amount = 50;
        if (before && after && before.exact && after.exact &&
          after.value > before.value && after.value - before.value <= 100000) {
          amount = after.value - before.value;
        }
        TA.report('points', { amount, channel: TA.dom.currentChannel() });
      }, 1500);
    } catch (e) { TA.log.error('points', e); }
  }

  return {
    id: 'points',
    settingKey: 'points',
    // Lecture seule, pour le diagnostic du popup : meme regle que le calcul du gain (Bits exclus).
    balance: readBalance,
    start() { unsub = TA.dom.subscribe(tick); },
    stop() { if (unsub) { unsub(); unsub = null; } }
  };
})();
