// Helpers DOM + MutationObserver unique partage par tous les modules.
window.TA = window.TA || {};
TA.dom = (function () {
  // Element visible et cliquable ?
  function isClickable(el) {
    if (!el || el.disabled) return false;
    if (el.offsetParent === null) return false;
    const cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden';
  }

  // Premier element trouve parmi une liste de selecteurs candidats.
  function findFirst(candidates, root) {
    root = root || document;
    for (const sel of candidates) {
      try {
        const el = root.querySelector(sel);
        if (el) return el;
      } catch (e) { /* selecteur invalide -> on ignore */ }
    }
    return null;
  }

  // Recherche par texte/aria-label. exact=true -> le libelle doit EGALER un indice
  // (utile hors zone sure, ex. un stream, pour ne pas cliquer "Obtenir Turbo").
  function findByText(tag, hints, root, exact) {
    root = root || document;
    const low = hints.map((h) => h.toLowerCase());
    const els = Array.from(root.querySelectorAll(tag));
    return els.find((el) => {
      const t = (el.textContent || '').trim().toLowerCase();
      const a = (el.getAttribute('aria-label') || '').trim().toLowerCase();
      if (exact) return low.includes(t) || low.includes(a);
      return low.some((h) => t.includes(h) || a.includes(h));
    }) || null;
  }

  function click(el) {
    if (!isClickable(el)) return false;
    el.click();
    return true;
  }

  // Observation mutualisee avec debounce, demarree/arretee par comptage de references.
  let observer = null;
  let timer = null;
  const listeners = new Set();

  function runAll() {
    timer = null;
    for (const cb of listeners) {
      try { cb(); } catch (e) { if (TA.log) TA.log.error('observer', e); }
    }
  }
  function schedule() {
    if (timer) return;
    // Onglet en arriere-plan (farming AFK multi-onglets) : on relache la cadence -> moins de CPU.
    const delay = document.hidden ? 1200 : 150;
    timer = setTimeout(runAll, delay);
  }

  function ensureObserving() {
    if (observer) return;
    observer = new MutationObserver(schedule);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-label', 'disabled'] // 'class' retire : mutations massives et inutiles sur Twitch
    });
  }
  function disconnect() {
    if (observer) { observer.disconnect(); observer = null; }
    if (timer) { clearTimeout(timer); timer = null; }
  }

  function subscribe(cb) {
    listeners.add(cb);
    ensureObserving();
    try { cb(); } catch (e) { if (TA.log) TA.log.error('observer', e); }
    return () => {
      listeners.delete(cb);
      if (listeners.size === 0) disconnect(); // plus aucun module actif -> on libere l'observer
    };
  }

  // Slug de la chaine courante ('' si on n'est pas sur une page de chaine).
  function currentChannel() {
    const seg = (location.pathname.split('/')[1] || '').toLowerCase();
    const block = (TA.selectors && TA.selectors.notChannelPaths) || [];
    if (!seg || block.includes(seg)) return '';
    return seg;
  }

  // Chaine courante HORS-LIGNE ? Detection robuste et CONSERVATRICE cote faux positif :
  // un faux "offline" empecherait le watchdog de relancer un live fige (= perte de farm).
  // On combine plusieurs signaux par OR, du plus fiable au moins fiable, source UNIQUE
  // partagee par watchdog (s'arrete), autoswitch (bascule) et reloader (n'exclut).
  function isChannelOffline() {
    const S = TA.selectors || {};
    // 1) Garde LIVE la PLUS fiable, independante du CSS / de la langue / du mode theatre /
    //    plein ecran : un direct HLS a une <video> de duree infinie deja lancee. Tant qu'une
    //    telle video existe (meme mise en pause en arriere-plan), la chaine est EN DIRECT
    //    -> jamais hors-ligne (survit a pub, pause et gate mature).
    const vids = document.querySelectorAll('video');
    for (const v of vids) { if (!isFinite(v.duration) && v.currentTime > 0 && !v.ended) return false; }
    // 2) Anti-signaux LIVE structurels (panneau direct / compteur de spectateurs) en complement.
    if (S.liveSignals && findFirst(S.liveSignals)) return false;
    // 3) Signal POSITIF fort : conteneur present UNIQUEMENT sur une chaine hors-ligne. Le live
    //    etant deja ecarte, sa presence = hors-ligne certain, meme avec une video de preview
    //    en pause dans la page.
    if (S.offlineSignals && findFirst(S.offlineSignals)) return true;
    // 4) Repli TEXTE multi-langue sur un root BORNE (jamais document.body). Pas de root reconnu
    //    -> on ne conclut pas (return false : on prefere un faux negatif a un faux positif).
    const root = findFirst(S.offlineTextRoots || S.playerOverlay || []);
    if (!root) return false;
    const txt = root.textContent || '';
    return (S.offlinePatterns || []).some((re) => re.test(txt));
  }

  return { isClickable, findFirst, findByText, click, subscribe, currentChannel, isChannelOffline, start: ensureObserving, stop: disconnect };
})();
