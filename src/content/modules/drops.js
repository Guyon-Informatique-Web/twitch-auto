// Auto-claim des drops : par selecteur, fallback par texte sur la page inventaire.
window.TA = window.TA || {};
TA.modules = TA.modules || {};
TA.modules.drops = (function () {
  let unsub = null;
  const claimed = new WeakSet(); // evite de recliquer le meme bouton

  function tick() {
    try {
      // Selecteurs precis partout ; recherche par texte UNIQUEMENT sur la page
      // inventaire (contexte sur : pas de bouton "Obtenir Turbo"/pub a cliquer par erreur).
      let btn = TA.dom.findFirst(TA.selectors.dropClaim);
      if (!btn && location.pathname.startsWith('/drops')) {
        btn = TA.dom.findByText('button, [role="button"], a', TA.selectors.dropClaimTextHints);
      }
      if (btn && !claimed.has(btn) && TA.dom.click(btn)) {
        claimed.add(btn);
        TA.report('drop', {});
        TA.log.info('drops', 'drop reclame');
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
