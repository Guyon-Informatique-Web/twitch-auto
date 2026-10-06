// Point d'entree du content script : lit les reglages, demarre l'observer,
// active/desactive chaque module selon les toggles, et reagit en direct aux changements.
window.TA = window.TA || {};
(function () {
  const registry = TA.modules || (TA.modules = {});
  const active = new Set();
  let settings = null;

  function apply() {
    if (!settings) return;
    const master = settings.enabled !== false;   // meme lecture que le popup : absent = actif
    for (const id in registry) {
      const mod = registry[id];
      // ignoreMaster : module qui n'agit que sur une demande explicite (bouton du popup) ; il
      // tourne meme extension coupee, sinon le bouton ouvrait l'annuaire et s'arretait la.
      const want = (master || mod.ignoreMaster === true) && settings[mod.settingKey] !== false;
      const isOn = active.has(id);
      try {
        if (want && !isOn) { mod.start(); active.add(id); TA.log.info('core', 'start', id); }
        else if (!want && isOn) { mod.stop(); active.delete(id); TA.log.info('core', 'stop', id); }
      } catch (e) { TA.log.error('core', e); }
    }
  }

  async function init() {
    const data = await chrome.storage.local.get('settings');
    settings = data.settings || { enabled: true };
    TA.settings = settings;
    // L'observer demarre tout seul au 1er module actif (subscribe) et s'arrete quand
    // plus aucun module n'est actif. Pas de start() inconditionnel ici.
    apply();
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.settings) {
      settings = changes.settings.newValue || { enabled: true };
      TA.settings = settings;
      apply();
    }
  });

  // Diagnostic des selecteurs (declenche depuis le popup) : indique ce que l'extension trouve
  // sur la page courante. "absent" peut etre normal selon la page (ex. pas de coffre dispo).
  function diagnose() {
    const S = TA.selectors;
    const has = (cands) => !!TA.dom.findFirst(cands);
    // Sur l'inventaire : combien de campagnes ont une date de fin lisible (fonction "fin de
    // campagne", verifiable seulement connecte).
    let camps = 0;
    let ends = 0;
    if (TAUtil.isInventoryPath(location.pathname)) {
      const seen = new Set();
      document.querySelectorAll(S.dropProgress.join(',')).forEach((bar) => {
        const m = TA.dom.findCampaign(bar);
        const k = m.game + '|' + m.campaign;
        if (seen.has(k)) return;
        seen.add(k);
        camps += 1;
        if (m.endsAt) ends += 1;
      });
    }
    return {
      campaignEnds: camps ? `${ends}/${camps}` : '-',
      url: location.href,
      points: has(S.pointsClaim),
      // Meme lecture que le calcul du gain : le solde de Bits voisin ne compte pas comme un solde
      // de points (sur une page non connectee, il faisait afficher "Solde : OK" a tort).
      pointsBalance: !!(registry.points && registry.points.balance && registry.points.balance()),
      dropSelector: has(S.dropClaim),
      dropText: !!TA.dom.findByText('button, [role="button"], a', S.dropClaimTextHints),
      playerOverlay: has(S.playerOverlay),
      progressBars: document.querySelectorAll(S.dropProgress.join(',')).length
    };
  }
  // Instantane de l'onglet pour la vue "En direct" du popup. LECTURE SEULE : aucun clic,
  // aucune ecriture, aucun effet de bord (le popup interroge tous les onglets a son ouverture).
  // Chaque etat vient de sa source de verite : le watchdog pour le blocage, la video elle-meme
  // pour la qualite (la cle 'video-quality' est commune a tous les onglets, elle ne dit rien de
  // CET onglet), plutot que d'etre rededuit ici a partir des reglages.
  function liveState() {
    const channel = TA.dom.currentChannel();
    let playing = false;
    let height = 0;
    for (const v of document.querySelectorAll('video')) {
      if (!v.paused && !v.ended && v.readyState >= 2) { playing = true; height = v.videoHeight || 0; break; }
    }
    const wd = (registry.watchdog && registry.watchdog.status) ? registry.watchdog.status() : null;
    return {
      channel,
      inventory: TAUtil.isInventoryPath(location.pathname),
      playing,
      hidden: document.hidden,
      // Hors page de chaine (inventaire, annuaire...), la detection hors-ligne n'a pas de sens.
      offline: channel ? TA.dom.isChannelOffline() : false,
      stalled: !!(wd && wd.stalled),
      stalledMin: wd ? wd.stalledMin : null,
      reloads: wd ? wd.reloads : 0,
      quality: playing && height ? height : null,   // hauteur reellement decodee (160, 720, 1080...)
      enabled: !!settings && settings.enabled !== false
    };
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === 'diagnose') {
      try { sendResponse(diagnose()); } catch (e) { sendResponse({ error: String(e) }); }
    }
    if (msg && msg.type === 'liveState') {
      try { sendResponse(liveState()); } catch (e) { sendResponse({ error: String(e) }); }
    }
    return false;
  });

  init().catch((e) => TA.log.error('core', e));
})();
