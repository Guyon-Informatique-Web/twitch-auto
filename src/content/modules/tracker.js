// Tracker : heartbeat 60s par onglet (temps de visionnage + onglets actifs)
// et snapshot des drops EN COURS sur la page inventaire (nom + pourcentage). Best-effort.
window.TA = window.TA || {};
TA.modules = TA.modules || {};
TA.modules.tracker = (function () {
  const BEAT_MS = 60 * 1000;
  let beatTimer = null;
  let progressTimer = null;

  function send(msg) {
    try {
      const p = chrome.runtime.sendMessage(msg);
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (e) { /* SW endormi */ }
  }

  function isPlaying() {
    const v = document.querySelector('video');
    return !!(v && !v.paused && !v.ended && v.readyState >= 2);
  }

  function beat() {
    const channel = TA.dom.currentChannel();
    if (!channel) return; // seulement sur une page de chaine
    // L'onglet compte comme "actif" tant qu'il est sur une chaine (meme pendant une pub) ;
    // le temps de visionnage ne s'incremente que si la video joue vraiment.
    const playing = isPlaying();
    send({ type: 'watch', channel, seconds: playing ? Math.round(BEAT_MS / 1000) : 0 });
  }

  function snapshotInProgress() {
    try {
      if (!location.pathname.startsWith('/drops')) return;
      const list = [];
      document.querySelectorAll(TA.selectors.dropProgress.join(',')).forEach((bar) => {
        let pct = null;
        const vt = bar.getAttribute('aria-valuetext') || '';
        const m = vt.match(/(\d{1,3})\s*%/);
        if (m) pct = parseInt(m[1], 10);
        if (pct == null) {
          const now = Number(bar.getAttribute('aria-valuenow'));
          const max = Number(bar.getAttribute('aria-valuemax')) || 100;
          if (Number.isFinite(now) && max) pct = Math.round((now / max) * 100);
        }
        if (pct == null || pct >= 100) return;
        // nom = 1er libelle CoreText qui n'est PAS un texte de progression ("56% de 30 minutes"...).
        // On ecarte les recompenses expirees, et on capte la duree totale pour estimer le temps restant.
        const isProgress = (t) => /%/.test(t) || /^\d+\s*(min|h|heure|jour|sec|de\b)/i.test(t);
        const UNAVAILABLE = /n['’]est plus disponible|plus disponible|no longer available|expir/i;
        const parseTotalMin = (t) => {
          const after = t.split(/\bde\b|\bof\b/i).pop();          // "X% de Y minutes" -> on prend Y
          const mm = (after || t).match(/(\d+(?:[.,]\d+)?)\s*(h|heure|hour|min)/i);
          if (!mm) return null;
          const n = parseFloat(mm[1].replace(',', '.'));
          return /^h/i.test(mm[2]) ? Math.round(n * 60) : Math.round(n);
        };
        let el = bar; let name = ''; let bad = false; let totalMin = null;
        for (let i = 0; i < 7 && el && (!name || totalMin == null) && !bad; i++) {
          if (el.querySelectorAll) {
            el.querySelectorAll('p[class*="CoreText"], [role="heading"], h3, h4').forEach((p) => {
              const t = (p.textContent || '').trim();
              if (UNAVAILABLE.test(t)) bad = true;
              else if (isProgress(t)) { if (totalMin == null) { const d = parseTotalMin(t); if (d) totalMin = d; } }
              else if (!name && t.length >= 3 && t.length <= 80 && !/ic[oô]ne|image/i.test(t)) name = t;
            });
          }
          el = el.parentElement;
        }
        if (bad) return; // recompense expiree -> on ne l'affiche pas
        const remainingMin = (totalMin != null) ? Math.max(0, Math.round(totalMin * (1 - pct / 100))) : null;
        list.push({ name, percent: Math.max(0, Math.min(100, pct)), remainingMin });
      });
      send({ type: 'inprogress', list: list.slice(0, 12) });
    } catch (e) { TA.log.error('tracker', e); }
  }

  return {
    id: 'tracker',
    settingKey: 'tracker',
    start() {
      beat();
      beatTimer = setInterval(beat, BEAT_MS);
      snapshotInProgress();
      progressTimer = setInterval(snapshotInProgress, 30 * 1000);
    },
    stop() {
      if (beatTimer) { clearInterval(beatTimer); beatTimer = null; }
      if (progressTimer) { clearInterval(progressTimer); progressTimer = null; }
    }
  };
})();
