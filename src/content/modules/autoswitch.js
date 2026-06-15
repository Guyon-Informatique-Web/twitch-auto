// Auto-switch : quand la chaine regardee passe hors-ligne, bascule vers une chaine de repli
// (URL configurable dans le popup). Desactive par defaut (il redirige l'onglet).
window.TA = window.TA || {};
TA.modules = TA.modules || {};
TA.modules.autoswitch = (function () {
  let unsub = null;
  let done = false;

  function tick() {
    try {
      if (done) return;
      if (!TA.dom.currentChannel()) return;               // seulement sur une page de chaine
      const url = (TA.settings && TA.settings.autoSwitchUrl) || '';
      if (!url) return;                                    // pas de cible -> on ne fait rien
      if (location.href.indexOf(url) === 0) return;        // deja sur la cible -> evite la boucle
      const root = TA.dom.findFirst(TA.selectors.playerOverlay) ||
        document.querySelector('[data-a-target="video-player"]') || document.body;
      const txt = root.textContent || '';
      if (!TA.selectors.offlinePatterns.some((re) => re.test(txt))) return;
      done = true;
      TA.log.info('autoswitch', `chaine hors-ligne -> bascule vers ${url}`);
      setTimeout(() => location.assign(url), 3000);
    } catch (e) { TA.log.error('autoswitch', e); }
  }

  return {
    id: 'autoswitch',
    settingKey: 'autoSwitch',
    start() { done = false; unsub = TA.dom.subscribe(tick); },
    stop() { if (unsub) { unsub(); unsub = null; } }
  };
})();
