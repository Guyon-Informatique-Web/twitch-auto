// Watchdog player : filet de securite quand keepalive n'arrive pas a relancer la lecture.
// Sur un onglet de chaine EN ARRIERE-PLAN (farming AFK), si AUCUNE video ne joue pendant
// 10 min d'affilee et que la chaine n'est pas hors-ligne, on recharge la page.
// Anti-boucle DUR : on abandonne apres 3 reloads CONSECUTIFS sans reprise de lecture
// (compteur persistant en sessionStorage, remis a zero des que la lecture repart) -> pas
// de boucle infinie sur un stream durablement fige que le reload ne corrige pas.
window.TA = window.TA || {};
TA.modules = TA.modules || {};
TA.modules.watchdog = (function () {
  const KEY = 'ta_watchdog_state';     // { ch, n } : reloads consecutifs sans reprise POUR la chaine ch
  const MAX_RELOADS = 3;               // au-dela, on arrete (le reload n'aide visiblement pas)
  const STALL = 10 * 60 * 1000;        // 10 min sans lecture -> reload
  const CHECK = 60 * 1000;             // verification chaque minute
  let timer = null;
  let lastOkTs = 0;                    // dernier instant ou tout allait bien (lecture / 1er plan / offline / start)

  // Compteur scope par chaine : un changement de chaine repart de zero (pas de contamination).
  function state() {
    try { const s = JSON.parse(sessionStorage.getItem(KEY) || '{}'); return { ch: s.ch || '', n: parseInt(s.n, 10) || 0 }; }
    catch (e) { return { ch: '', n: 0 }; }
  }
  function setState(ch, n) { try { sessionStorage.setItem(KEY, JSON.stringify({ ch, n })); } catch (e) { /* quota */ } }

  // Au moins une video joue vraiment. On itere TOUTES les videos (comme keepalive) : un player
  // decoratif en pause (preview, clip du chat) ne doit pas faire croire que le stream est fige.
  function anyPlaying(vids) {
    for (const v of vids) { if (!v.paused && !v.ended && v.readyState >= 2) return true; }
    return false;
  }
  function isOffline() {
    const root = TA.dom.findFirst(TA.selectors.playerOverlay) ||
      document.querySelector('[data-a-target="video-player"]') || document.body;
    const txt = (root && root.textContent) || '';
    return TA.selectors.offlinePatterns.some((re) => re.test(txt));
  }

  function tick() {
    try {
      const now = Date.now();
      const ch = TA.dom.currentChannel();
      const vids = document.querySelectorAll('video');
      // Hors zone de farm : 1er plan, pas une chaine, aucun player, ou hors-ligne -> on n'agit pas.
      if (!document.hidden || !ch || !vids.length || isOffline()) { lastOkTs = now; return; }
      if (anyPlaying(vids)) {                                   // reprise -> reset du compteur de cette chaine
        lastOkTs = now;
        const s = state(); if (s.n || s.ch !== ch) setState(ch, 0);
        return;
      }
      if (now - lastOkTs < STALL) return;                       // pas encore 10 min de blocage continu
      const s = state();
      const n = (s.ch === ch) ? s.n : 0;                        // changement de chaine -> on repart de zero
      if (n >= MAX_RELOADS) {                                   // le reload n'a pas aide -> on abandonne
        TA.log.warn('watchdog', 'reloads repetes sans reprise, on arrete');
        return;
      }
      setState(ch, n + 1);
      lastOkTs = now;
      TA.log.info('watchdog', 'player fige > 10 min en arriere-plan, reload');
      location.reload();
    } catch (e) { TA.log.error('watchdog', e); }
  }

  return {
    id: 'watchdog',
    settingKey: 'reload',
    start() { lastOkTs = Date.now(); timer = setInterval(tick, CHECK); },
    stop() { if (timer) { clearInterval(timer); timer = null; } }
  };
})();
