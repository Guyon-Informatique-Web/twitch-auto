// Auto-claim des drops TERMINES via la page inventaire (methode fiable).
// Reclame TOUS les drops disponibles, un par un (cooldown), avec garde anti-boucle.
window.TA = window.TA || {};
TA.modules = TA.modules || {};
TA.modules.drops = (function () {
  let unsub = null;
  let armTimer = null;
  let refreshTimer = null;
  const claimedNodes = new WeakSet();          // ne reclique pas le meme noeud
  const COOLDOWN = 4000;                        // delai mini entre deux clics
  const MAX_PER_LOAD = 40;                      // garde anti-boucle : plafond de claims par chargement de page
  const INVENTORY_REFRESH = 5 * 60 * 1000;     // recharge l'inventaire (Twitch ne le met pas a jour en direct)
  let lastClick = 0;
  let claimCount = 0;

  // Tous les boutons de reclamation candidats (selecteurs precis partout + texte sur l'inventaire).
  function findButtons() {
    const out = [];
    TA.selectors.dropClaim.forEach((sel) => {
      try { document.querySelectorAll(sel).forEach((el) => out.push(el)); } catch (e) { /* selecteur invalide */ }
    });
    if (location.pathname.startsWith('/drops')) {
      const hints = TA.selectors.dropClaimTextHints;
      document.querySelectorAll('button, [role="button"], a').forEach((el) => {
        const t = (el.textContent || '').trim().toLowerCase();
        const a = (el.getAttribute('aria-label') || '').toLowerCase();
        if (hints.some((h) => t.includes(h) || a.includes(h))) out.push(el);
      });
    }
    return out;
  }

  // Le nom du drop est un <p class="CoreText-sc-..."> dans la carte du drop.
  // On remonte vers la carte (1er ancetre avec une image) puis on prend le 1er
  // paragraphe CoreText qui n'est pas du bruit (statut, pourcentage, "En profiter"...).
  const NAME_NOISE = /^(en profiter|obtenu|claim now|claim|claimed|r[eé]clamer|\d+\s*%|termin[eé]|completed|in progress|en cours)$/i;

  function getDropName(btn) {
    let card = btn;
    for (let i = 0; i < 7 && card.parentElement; i++) {
      card = card.parentElement;
      if (card.querySelector && card.querySelector('img')) break;
    }
    if (!card.querySelectorAll) return '';
    const els = card.querySelectorAll('p[class*="CoreText"], h1, h2, h3, h4, h5, h6, [role="heading"]');
    for (const el of els) {
      const t = (el.textContent || '').trim();
      if (t && t.length >= 3 && !NAME_NOISE.test(t) && !/ic[oô]ne|image/i.test(t)) return t;
    }
    return '';
  }

  function tick() {
    try {
      const now = Date.now();
      if (now - lastClick < COOLDOWN) return;
      if (claimCount >= MAX_PER_LOAD) {
        TA.log.warn('drops', `plafond de ${MAX_PER_LOAD} claims atteint pour ce chargement (securite anti-boucle)`);
        return;
      }

      // Premier bouton candidat pas encore reclame et cliquable.
      const btn = findButtons().find((b) => !claimedNodes.has(b) && TA.dom.isClickable(b));
      if (!btn || !TA.dom.click(btn)) return;

      claimedNodes.add(btn);
      lastClick = now;
      claimCount += 1;
      const name = getDropName(btn);
      TA.report('drop', { name });
      TA.log.info('drops', name ? `drop reclame : ${name}` : 'drop reclame');

      // Re-essaye apres le cooldown pour enchainer les drops suivants.
      if (armTimer) clearTimeout(armTimer);
      armTimer = setTimeout(tick, COOLDOWN + 300);
    } catch (e) { TA.log.error('drops', e); }
  }

  return {
    id: 'drops',
    settingKey: 'drops',
    start() {
      unsub = TA.dom.subscribe(tick);
      // L'inventaire ne se met pas a jour en direct : on le recharge periodiquement
      // pour reclamer les drops termines sans intervention.
      if (location.pathname.startsWith('/drops')) {
        refreshTimer = setInterval(() => location.reload(), INVENTORY_REFRESH);
      }
    },
    stop() {
      if (unsub) { unsub(); unsub = null; }
      if (armTimer) { clearTimeout(armTimer); armTimer = null; }
      if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
    }
  };
})();
