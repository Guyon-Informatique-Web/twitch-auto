// Point d'entree du content script : lit les reglages, demarre l'observer,
// active/desactive chaque module selon les toggles, et reagit en direct aux changements.
window.TA = window.TA || {};
(function () {
  const registry = TA.modules || (TA.modules = {});
  const active = new Set();
  let settings = null;

  function apply() {
    if (!settings) return;
    const master = settings.enabled;
    for (const id in registry) {
      const mod = registry[id];
      const want = master && settings[mod.settingKey] !== false;
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
      settings = changes.settings.newValue || {};
      TA.settings = settings;
      apply();
    }
  });

  // Diagnostic des selecteurs (declenche depuis le popup) : indique ce que l'extension trouve
  // sur la page courante. "absent" peut etre normal selon la page (ex. pas de coffre dispo).
  function diagnose() {
    const S = TA.selectors;
    const has = (cands) => !!TA.dom.findFirst(cands);
    return {
      url: location.href,
      points: has(S.pointsClaim),
      pointsBalance: has(S.pointsBalance),
      dropSelector: has(S.dropClaim),
      dropText: !!TA.dom.findByText('button, [role="button"], a', S.dropClaimTextHints),
      playerOverlay: has(S.playerOverlay),
      progressBars: document.querySelectorAll(S.dropProgress.join(',')).length
    };
  }
  // Instantane de l'onglet pour la vue "En direct" du popup. LECTURE SEULE : aucun clic,
  // aucune ecriture, aucun effet de bord (le popup interroge tous les onglets a son ouverture).
  // Chaque etat vient du module qui le detient (watchdog pour le blocage, quality pour le 160p)
  // plutot que d'etre rededuit ici a partir des reglages.
  function liveState() {
    const channel = TA.dom.currentChannel();
    let playing = false;
    for (const v of document.querySelectorAll('video')) {
      if (!v.paused && !v.ended && v.readyState >= 2) { playing = true; break; }
    }
    const wd = (registry.watchdog && registry.watchdog.status) ? registry.watchdog.status() : null;
    return {
      channel,
      inventory: location.pathname.startsWith('/drops'),
      playing,
      hidden: document.hidden,
      // Hors page de chaine (inventaire, annuaire...), la detection hors-ligne n'a pas de sens.
      offline: channel ? TA.dom.isChannelOffline() : false,
      stalled: !!(wd && wd.stalled),
      stalledMin: wd ? wd.stalledMin : null,
      reloads: wd ? wd.reloads : 0,
      lowQuality: !!(registry.quality && registry.quality.isLow && registry.quality.isLow()),
      enabled: !!(settings && settings.enabled)
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
