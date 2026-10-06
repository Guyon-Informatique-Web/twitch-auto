// Ouvre une chaine participante d'une campagne de drops. Le popup (bouton) ou le service worker
// (alerte "drop bloque", option) ouvre l'annuaire du jeu filtre sur les chaines qui ont les drops
// actives, avec ?tawatch=1 ; ici, sur cette page, on part sur la premiere chaine en direct.
window.TA = window.TA || {};
TA.modules = TA.modules || {};
TA.modules.participate = (function () {
  const FLAG = 'ta_watch_pick';
  // En onglet de fond jamais affiche, Chrome ralentit la page : mesure du 06/10/2026, 10 a 25 s
  // avant que les cartes apparaissent. Au-dela de 2 min, on renonce et l'annuaire reste affiche.
  const MAX_WAIT = 120 * 1000;

  // Lu au chargement du script (document_start), avant que le routeur de Twitch ne puisse
  // reecrire l'URL. Le drapeau vit en sessionStorage : propre a CET onglet, perdu a sa fermeture.
  try {
    if (/[?&]tawatch=1(&|$)/.test(location.search)) sessionStorage.setItem(FLAG, String(Date.now()));
  } catch (e) { /* stockage indisponible */ }

  let unsub = null;
  let timer = null;

  function pending() {
    try { const t = Number(sessionStorage.getItem(FLAG)); return !!t && Date.now() - t < MAX_WAIT; }
    catch (e) { return false; }
  }
  function clear() { try { sessionStorage.removeItem(FLAG); } catch (e) { /* */ } }

  function tick() {
    try {
      if (!pending()) { stopWatching(); return; }
      if (!/^\/directory\/(category|game)\//.test(location.pathname)) return;
      const link = TA.dom.findFirst(TA.selectors.directoryChannelLink || []);
      if (!link) return;                                   // cartes pas encore rendues
      const slug = ((link.getAttribute('href') || '').split('/')[1] || '').toLowerCase();
      if (!/^[a-z0-9_]{1,25}$/.test(slug)) return;
      clear();                                             // une seule bascule par demande
      stopWatching();
      TA.log.info('participate', `chaine participante ouverte : ${slug}`);
      // replace et non assign : l'annuaire ne reste pas dans l'historique, donc le bouton
      // Precedent ne rouvre pas l'annuaire (qui reposerait le drapeau et repartirait ici).
      location.replace('https://www.twitch.tv/' + slug);
    } catch (e) { TA.log.error('participate', e); }
  }

  function stopWatching() {
    if (unsub) { unsub(); unsub = null; }
    if (timer) { clearTimeout(timer); timer = null; }
  }

  return {
    id: 'participate',
    // Reglage propre, absent = actif, et hors interrupteur general : le bouton du popup doit
    // marcher meme drops coupes ou extension coupee (il n'agit que sur ?tawatch=1).
    settingKey: 'participate',
    ignoreMaster: true,
    start() {
      if (!pending()) return;
      unsub = TA.dom.subscribe(tick);
      timer = setTimeout(() => { clear(); stopWatching(); }, MAX_WAIT);
    },
    stop() { stopWatching(); }
  };
})();
