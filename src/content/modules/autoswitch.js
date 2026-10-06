// Auto-switch : quand la chaine regardee passe hors-ligne, bascule vers une chaine de repli
// (reglee dans le popup). Desactive par defaut (il redirige l'onglet).
window.TA = window.TA || {};
TA.modules = TA.modules || {};
TA.modules.autoswitch = (function () {
  const KEY = 'ta_autoswitch_log';                       // dates des bascules de CET onglet
  const MAX = 3;                                          // au plus 3 bascules / 10 min par onglet :
  const WINDOW = 10 * 60 * 1000;                          // jamais de boucle, quelle que soit la cible
  let unsub = null;
  let done = false;
  let switchTimer = null;
  let offlineHits = 0;                                    // confirmations consecutives d'etat hors-ligne
  let hitsCh = '';                                        // chaine de reference du compteur (scope par chaine)

  // Bascules recentes, en sessionStorage : survivent a la navigation de l'onglet, pas a sa fermeture.
  function recent(now) {
    try { return JSON.parse(sessionStorage.getItem(KEY) || '[]').filter((t) => now - t < WINDOW); }
    catch (e) { return []; }
  }
  function record(now) {
    try { sessionStorage.setItem(KEY, JSON.stringify(recent(now).concat(now))); } catch (e) { /* quota */ }
  }

  function tick() {
    try {
      if (done) return;
      const ch = TA.dom.currentChannel();
      if (!ch) return;                                     // seulement sur une page de chaine
      // SPA Twitch : un raid change de chaine SANS reload (start() n'est pas rappele). On scope
      // le compteur par chaine (comme le watchdog) pour ne pas reporter un hit offline de la
      // chaine quittee sur la chaine recue par raid -> sinon la garde 2-ticks tombe a 1 effectif.
      if (ch !== hitsCh) { hitsCh = ch; offlineHits = 0; }
      // Cible ramenee a un slug : on compare des CHAINES, plus des prefixes d'URL. Une saisie
      // sans "www", avec une autre casse ou relative faisait boucler la redirection.
      const raw = (TA.settings && TA.settings.autoSwitchUrl) || '';
      const target = TAUtil.channelSlug(raw, (TA.selectors && TA.selectors.notChannelPaths) || []);
      if (!target || target === ch) return;                // pas de cible valide, ou deja dessus
      // Detection hors-ligne mutualisee (TA.dom) : meme garde live HLS que le watchdog.
      if (!TA.dom.isChannelOffline()) { offlineHits = 0; return; }
      // On exige 2 verifications consecutives avant de quitter : evite de partir pendant la
      // transition d'un raid (la cible peut etre brievement vue offline avant de monter en live).
      if (++offlineHits < 2) return;
      done = true;
      const now = Date.now();
      if (!TAUtil.shouldReload(recent(now), now, MAX, WINDOW)) {
        TA.log.warn('autoswitch', `${MAX} bascules en 10 min : on reste sur place`);
        return;                                            // done reste vrai jusqu'au prochain chargement
      }
      TA.log.info('autoswitch', `chaine hors-ligne -> bascule vers ${target}`);
      // Re-validation apres le delai : si la chaine est redevenue EN DIRECT pendant ces 3s
      // (raid resolu, lecture reprise), on ne quitte PAS une chaine live -> on re-arme.
      switchTimer = setTimeout(() => {
        switchTimer = null;
        if (TA.dom.currentChannel() === ch && TA.dom.isChannelOffline()) {
          record(Date.now());
          location.assign('https://www.twitch.tv/' + target);
        } else { done = false; offlineHits = 0; }
      }, 3000);
    } catch (e) { TA.log.error('autoswitch', e); }
  }

  return {
    id: 'autoswitch',
    settingKey: 'autoSwitch',
    start() { done = false; offlineHits = 0; hitsCh = ''; unsub = TA.dom.subscribe(tick); },
    stop() {
      if (unsub) { unsub(); unsub = null; }
      // Une bascule armee ne part pas si on coupe la fonction pendant les 3 s.
      if (switchTimer) { clearTimeout(switchTimer); switchTimer = null; }
      done = false;
    }
  };
})();
