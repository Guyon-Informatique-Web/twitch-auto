// Auto-claim des drops TERMINES : selecteurs precis partout, recherche par texte
// uniquement sur la page inventaire (contexte sur). Garde anti-boucle integre.
window.TA = window.TA || {};
TA.modules = TA.modules || {};
TA.modules.drops = (function () {
  let unsub = null;
  const claimedNodes = new WeakSet(); // ne reclique pas le meme noeud
  const COOLDOWN = 4000;              // delai mini entre deux clics
  const BURST_MAX = 4;               // au-dela de N clics rapides -> on suspecte une boucle
  const BURST_WINDOW = 30000;
  const BACKOFF = 60000;             // pause si boucle suspectee
  let lastClick = 0;
  let recent = [];
  let backoffUntil = 0;
  let refreshTimer = null;
  const INVENTORY_REFRESH = 5 * 60 * 1000; // recharge l'inventaire en fond (Twitch ne le met pas a jour en direct)

  function findButton() {
    let btn = TA.dom.findFirst(TA.selectors.dropClaim);
    if (!btn && location.pathname.startsWith('/drops')) {
      btn = TA.dom.findByText('button, [role="button"], a', TA.selectors.dropClaimTextHints);
    }
    return btn;
  }

  // Remonte depuis le bouton pour trouver le nom du drop (alt de l'image de la carte).
  function getDropName(btn) {
    let el = btn;
    for (let i = 0; i < 6 && el; i++) {
      const img = el.querySelector ? el.querySelector('img[alt]') : null;
      if (img && img.alt && img.alt.trim()) return img.alt.trim();
      el = el.parentElement;
    }
    return '';
  }

  function tick() {
    try {
      const now = Date.now();
      if (now < backoffUntil) return;          // en pause anti-boucle
      if (now - lastClick < COOLDOWN) return;  // cooldown entre clics

      const btn = findButton();
      if (!btn || claimedNodes.has(btn) || !TA.dom.click(btn)) return;

      claimedNodes.add(btn);
      lastClick = now;
      recent = recent.filter((t) => now - t < BURST_WINDOW);
      recent.push(now);
      const name = getDropName(btn);
      TA.report('drop', { name });
      TA.log.info('drops', name ? `drop reclame : ${name}` : 'drop reclame');

      if (recent.length >= BURST_MAX) {
        backoffUntil = now + BACKOFF;
        recent = [];
        TA.log.warn('drops', 'trop de clics rapproches, pause 60s (selecteur a verifier ?)');
      }
    } catch (e) { TA.log.error('drops', e); }
  }

  return {
    id: 'drops',
    settingKey: 'drops',
    start() {
      unsub = TA.dom.subscribe(tick);
      // L'inventaire ne se met pas a jour en direct : on le recharge periodiquement
      // quand l'onglet est en arriere-plan, pour reclamer les drops termines sans intervention.
      if (location.pathname.startsWith('/drops')) {
        refreshTimer = setInterval(() => { if (document.hidden) location.reload(); }, INVENTORY_REFRESH);
      }
    },
    stop() {
      if (unsub) { unsub(); unsub = null; }
      if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
    }
  };
})();
