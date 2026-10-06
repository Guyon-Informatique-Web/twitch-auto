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

  // Au moins une video joue vraiment. On parcourt TOUTES les videos, comme le watchdog et la
  // vue En direct : un lecteur decoratif en pause place avant le stream ne doit pas faire
  // perdre le temps de visionnage.
  function isPlaying() {
    for (const v of document.querySelectorAll('video')) {
      if (!v.paused && !v.ended && v.readyState >= 2) return true;
    }
    return false;
  }

  function beat() {
    const channel = TA.dom.currentChannel();
    if (!channel) return; // seulement sur une page de chaine
    // L'onglet compte comme "actif" tant qu'il est sur une chaine (meme pendant une pub) ;
    // le temps de visionnage ne s'incremente que si la video joue vraiment.
    const playing = isPlaying();
    // Le jeu accompagne le battement : le temps de lecture est aussi compte PAR JEU.
    const gameSlug = playing ? TA.dom.currentGameSlug() : '';
    send({ type: 'watch', channel, seconds: playing ? Math.round(BEAT_MS / 1000) : 0, gameSlug });
  }

  // Drops EN COURS de la page inventaire : nom, %, temps restant, jeu, campagne, date de fin.
  // Meme lecture pour le releve envoye au service worker et pour le diagnostic du popup
  // ("Campagnes avec date de fin"). Les recompenses expirees et les barres a 100 % ne sont pas
  // listees.
  function collect() {
    const list = [];
    const camps = {};   // "jeu|campagne" -> { total, done } : compte les barres VUES dans le DOM
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
      if (pct == null) return;
      // Jeu + campagne AVANT le filtre : une barre a 100 % ne s'affiche pas, mais elle
      // compte pour savoir combien de recompenses la campagne contient deja.
      const meta = TA.dom.findCampaign(bar);
      const key = meta.game + '|' + meta.campaign;
      const c = camps[key] || (camps[key] = { total: 0, done: 0 });
      c.total += 1;
      if (pct >= 100) { c.done += 1; return; }
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
      // La remontee ne sort pas de la carte de la campagne : au-dessus, le "plus disponible"
      // d'une carte voisine terminee faisait ecarter un drop actif.
      const stop = meta.block ? meta.block.parentElement : null;
      let el = bar; let name = ''; let bad = false; let totalMin = null;
      for (let i = 0; i < 7 && el && el !== stop && (!name || totalMin == null) && !bad; i++) {
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
      list.push({
        name, percent: Math.max(0, Math.min(100, pct)), remainingMin,
        game: meta.game, campaign: meta.campaign,
        // Date de fin arrondie au quart d'heure : une date relative ("dans 3 jours") ne change
        // plus a chaque releve (sinon 'stats' etait reecrit toutes les 30 s).
        gameSlug: meta.slug || '', campEnds: meta.endsAt ? Math.round(meta.endsAt / 9e5) * 9e5 : null
      });
    });
    // Compteur "n/m" d'une campagne : uniquement si des barres TERMINEES sont visibles dans
    // ce DOM (done > 0). Sinon Twitch masque les recompenses deja recuperees et un "0/2"
    // affirmerait faussement qu'aucune n'a ete prise : on laisse le popup afficher le
    // nombre de drops en cours, seule valeur qu'on a reellement mesuree.
    list.forEach((d) => {
      const c = camps[d.game + '|' + d.campaign];
      if (c && c.done > 0) { d.campDone = c.done; d.campTotal = c.total; }
    });
    return list;
  }

  function snapshotInProgress() {
    try {
      if (!TAUtil.isInventoryPath(location.pathname)) return;
      const list = collect();
      // Age de la page : sans module drops, l'inventaire n'est plus recharge et ses barres sont
      // figees ; le service worker ne juge alors aucun drop "bloque".
      send({ type: 'inprogress', list: list.slice(0, 12), pageAge: Math.round(performance.now()) });
    } catch (e) { TA.log.error('tracker', e); }
  }

  return {
    id: 'tracker',
    settingKey: 'tracker',
    collect,            // lu par le diagnostic du popup (content.js), module demarre ou non
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
