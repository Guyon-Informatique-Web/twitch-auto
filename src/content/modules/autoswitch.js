// Auto-switch : quand la chaine regardee passe hors-ligne, bascule vers une chaine de repli
// (URL configurable dans le popup). Desactive par defaut (il redirige l'onglet).
window.TA = window.TA || {};
TA.modules = TA.modules || {};
TA.modules.autoswitch = (function () {
  let unsub = null;
  let done = false;
  let offlineHits = 0;                                    // confirmations consecutives d'etat hors-ligne
  let hitsCh = '';                                        // chaine de reference du compteur (scope par chaine)

  function tick() {
    try {
      if (done) return;
      const ch = TA.dom.currentChannel();
      if (!ch) return;                                     // seulement sur une page de chaine
      // SPA Twitch : un raid change de chaine SANS reload (start() n'est pas rappele). On scope
      // le compteur par chaine (comme le watchdog) pour ne pas reporter un hit offline de la
      // chaine quittee sur la chaine recue par raid -> sinon la garde 2-ticks tombe a 1 effectif.
      if (ch !== hitsCh) { hitsCh = ch; offlineHits = 0; }
      const url = (TA.settings && TA.settings.autoSwitchUrl) || '';
      if (!url) return;                                    // pas de cible -> on ne fait rien
      if (location.href.indexOf(url) === 0) return;        // deja sur la cible -> evite la boucle
      // Detection hors-ligne mutualisee (TA.dom) : meme garde live HLS que le watchdog.
      if (!TA.dom.isChannelOffline()) { offlineHits = 0; return; }
      // On exige 2 verifications consecutives avant de quitter : evite de partir pendant la
      // transition d'un raid (la cible peut etre brievement vue offline avant de monter en live).
      if (++offlineHits < 2) return;
      done = true;
      TA.log.info('autoswitch', `chaine hors-ligne -> bascule vers ${url}`);
      // Re-validation apres le delai : si la chaine est redevenue EN DIRECT pendant ces 3s
      // (raid resolu, lecture reprise), on ne quitte PAS une chaine live -> on re-arme.
      setTimeout(() => {
        if (TA.dom.isChannelOffline()) location.assign(url);
        else { done = false; offlineHits = 0; }
      }, 3000);
    } catch (e) { TA.log.error('autoswitch', e); }
  }

  return {
    id: 'autoswitch',
    settingKey: 'autoSwitch',
    start() { done = false; offlineHits = 0; hitsCh = ''; unsub = TA.dom.subscribe(tick); },
    stop() { if (unsub) { unsub(); unsub = null; } }
  };
})();
