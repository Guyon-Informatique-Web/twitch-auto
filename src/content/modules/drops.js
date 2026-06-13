// Auto-claim des drops TERMINES : selecteurs precis partout, recherche par texte
// uniquement sur la page inventaire (contexte sur). Garde anti-boucle integre.
window.TA = window.TA || {};
TA.modules = TA.modules || {};
TA.modules.drops = (function () {
  let unsub = null;
  const claimedNodes = new WeakSet(); // ne reclique pas le meme noeud
  const COOLDOWN = 4000;              // delai mini entre deux clics
  const BURST_MAX = 4;               // au-dela de N clics rapides -> on suspecte une boucle
  const BURST_WINDOW = 30000;
  const BACKOFF = 60000;             // pause si boucle suspectee
  let lastClick = 0;
  let recent = [];
  let backoffUntil = 0;

  function findButton() {
    let btn = TA.dom.findFirst(TA.selectors.dropClaim);
    if (!btn && location.pathname.startsWith('/drops')) {
      btn = TA.dom.findByText('button, [role="button"], a', TA.selectors.dropClaimTextHints);
    }
    return btn;
  }

  function tick() {
    try {
      const now = Date.now();
      if (now < backoffUntil) return;          // en pause anti-boucle
      if (now - lastClick < COOLDOWN) return;  // cooldown entre clics

      const btn = findButton();
      if (!btn || claimedNodes.has(btn) || !TA.dom.click(btn)) return;

      claimedNodes.add(btn);
      lastClick = now;
      recent = recent.filter((t) => now - t < BURST_WINDOW);
      recent.push(now);
      TA.report('drop', {});
      TA.log.info('drops', 'drop reclame');

      if (recent.length >= BURST_MAX) {
        backoffUntil = now + BACKOFF;
        recent = [];
        TA.log.warn('drops', 'trop de clics rapproches, pause 60s (selecteur a verifier ?)');
      }
    } catch (e) { TA.log.error('drops', e); }
  }

  return {
    id: 'drops',
    settingKey: 'drops',
    start() { unsub = TA.dom.subscribe(tick); },
    stop() { if (unsub) { unsub(); unsub = null; } }
  };
})();
