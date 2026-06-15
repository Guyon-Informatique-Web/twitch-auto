// Auto-claim des drops : page inventaire (fiable) + bandeau "drop pret" sur un stream.
// Reclame TOUS les drops dispo, un par un (cooldown), avec garde anti-boucle a fenetre glissante.
window.TA = window.TA || {};
TA.modules = TA.modules || {};
TA.modules.drops = (function () {
  let unsub = null;
  let armTimer = null;
  let refreshTimer = null;
  const claimedNodes = new WeakSet();          // ne reclique pas le meme noeud
  const COOLDOWN = 4000;                        // delai mini entre deux clics
  const WINDOW = 10 * 60 * 1000;               // fenetre glissante anti-boucle (se reinitialise seule)
  const MAX_IN_WINDOW = 30;                    // max claims / 10 min
  const INVENTORY_REFRESH = 5 * 60 * 1000;     // recharge l'inventaire (Twitch ne le met pas a jour en direct)
  let lastClick = 0;
  let recent = [];

  function onInventory() { return location.pathname.startsWith('/drops'); }

  // Boutons de reclamation candidats.
  function findButtons() {
    const out = [];
    // 1) selecteurs precis (partout)
    TA.selectors.dropClaim.forEach((sel) => {
      try { document.querySelectorAll(sel).forEach((el) => out.push(el)); } catch (e) { /* selecteur invalide */ }
    });
    if (onInventory()) {
      // 2) page inventaire = contexte sur : match par sous-chaine sur boutons/liens
      const hints = TA.selectors.dropClaimTextHints;
      document.querySelectorAll('button, [role="button"], a').forEach((el) => {
        const t = (el.textContent || '').trim().toLowerCase();
        const a = (el.getAttribute('aria-label') || '').toLowerCase();
        if (hints.some((h) => t.includes(h) || a.includes(h))) out.push(el);
      });
    } else {
      // 3) sur un stream = bandeau "drop pret" : UNIQUEMENT un <button> dont le libelle EGALE
      //    un mot de reclamation (evite le lien <a> "Obtenir" de navigation et "Obtenir Turbo").
      const exact = TA.selectors.dropClaimExact;
      document.querySelectorAll('button').forEach((el) => {
        const t = (el.textContent || '').trim().toLowerCase();
        if (exact.includes(t)) out.push(el);
      });
    }
    return out;
  }

  // Le nom du drop est un <p class="CoreText-sc-..."> dans la carte du drop.
  const NAME_NOISE = /^(en profiter|obtenir|obtenu|claim now|claim|claimed|r[eé]clamer|\d+\s*%|termin[eé]|completed|in progress|en cours)$/i;

  function getDropName(btn) {
    // On remonte depuis le bouton ; a chaque niveau on cherche un libelle de nom.
    let el = btn;
    for (let depth = 0; depth < 8 && el; depth++) {
      if (el.querySelectorAll) {
        const cands = el.querySelectorAll('p[class*="CoreText"], span[class*="CoreText"], h1, h2, h3, h4, h5, h6, [role="heading"]');
        for (const c of cands) {
          const t = (c.textContent || '').trim();
          if (t && t.length >= 3 && t.length <= 80 && !NAME_NOISE.test(t) && !/ic[oô]ne|image/i.test(t)) {
            return t;
          }
        }
      }
      el = el.parentElement;
    }
    return '';
  }

  function tick() {
    try {
      const now = Date.now();
      if (now - lastClick < COOLDOWN) return;
      recent = recent.filter((t) => now - t < WINDOW);
      if (recent.length >= MAX_IN_WINDOW) {
        TA.log.warn('drops', `plafond de ${MAX_IN_WINDOW} claims / 10 min atteint (securite anti-boucle)`);
        return;
      }

      const btn = findButtons().find((b) => !claimedNodes.has(b) && TA.dom.isClickable(b));
      if (!btn || !TA.dom.click(btn)) return;

      claimedNodes.add(btn);
      lastClick = now;
      recent.push(now);
      const name = getDropName(btn);
      TA.report('drop', { name, channel: TA.dom.currentChannel() });
      TA.log.info('drops', name ? `drop reclame : ${name}` : 'drop reclame');

      // Re-essaye apres le cooldown pour enchainer les drops suivants.
      if (armTimer) clearTimeout(armTimer);
      armTimer = setTimeout(tick, COOLDOWN + 300);
    } catch (e) { TA.log.error('drops', e); }
  }

  // Recharge l'inventaire periodiquement, mais seulement si on y est encore (SPA) et hors claim.
  function maybeRefresh() {
    if (!onInventory()) return;                         // ne recharge pas une page de stream
    if (armTimer) return;                               // sequence de claim en cours
    if (Date.now() - lastClick < COOLDOWN * 2) return;  // claim tout juste effectue
    location.reload();
  }

  return {
    id: 'drops',
    settingKey: 'drops',
    start() {
      unsub = TA.dom.subscribe(tick);
      refreshTimer = setInterval(maybeRefresh, INVENTORY_REFRESH);
    },
    stop() {
      if (unsub) { unsub(); unsub = null; }
      if (armTimer) { clearTimeout(armTimer); armTimer = null; }
      if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
    }
  };
})();
