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
  const INVENTORY_REFRESH = 3 * 60 * 1000;     // recharge l'inventaire (Twitch ne le met pas a jour en direct)
  // Un clic n'est compte comme drop reclame qu'apres VERIFY_MAX, si Twitch n'a pas affiche de refus
  // entre-temps (bandeau "Liez vos comptes de jeu...", vu le 07/10/2026 : sans cette verification,
  // chaque rechargement de l'inventaire recliquait le meme drop et le comptait comme reclame).
  // La page est relue toutes les VERIFY_STEP ; VERIFY_MAX reste sous COOLDOWN + 300 pour que la
  // re-tentative qui enchaine le drop suivant arrive apres le verdict.
  const VERIFY_STEP = 500;
  const VERIFY_MAX = 4000;
  const REFUSED_TTL = 30 * 60 * 1000;          // drop refuse : nouvel essai au plus toutes les 30 min
  const REFUSED_STORE = 'ta-drops-refused';    // sessionStorage : survit au rechargement de l'onglet
  let lastClick = 0;
  let recent = [];
  let verifyTimer = null;
  let pending = null;                           // clic en attente de verification
  const refused = loadRefused();                // { cle du drop: { at } }

  function loadRefused() {
    try { return JSON.parse(sessionStorage.getItem(REFUSED_STORE) || '{}') || {}; } catch (e) { return {}; }
  }
  function saveRefused() {
    try { sessionStorage.setItem(REFUSED_STORE, JSON.stringify(refused)); } catch (e) { /* quota, pas de sessionStorage */ }
  }
  // Cle d'un drop : campagne (ou jeu) + nom. Vide si on ne lit ni l'un ni l'autre.
  function refusalKey(name, meta) {
    const where = (meta && (meta.campaign || meta.game)) || '';
    return name || where ? `${where}|${name}` : '';
  }
  function isRefused(key, now) {
    const r = key && refused[key];
    return !!r && now - r.at < REFUSED_TTL;
  }
  function pageText() {
    try { const b = document.body; return b ? (b.innerText || b.textContent || '') : ''; } catch (e) { return ''; }
  }

  // Segment exact : une chaine nommee "dropsquad" n'est pas la page inventaire.
  function onInventory() { return TAUtil.isInventoryPath(location.pathname); }

  // Un lien qui navigue (href reel) n'est jamais un bouton de reclamation : le cliquer ferait
  // quitter l'inventaire et serait compte comme un drop.
  function isNavLink(el) {
    if (el.tagName !== 'A') return false;
    const h = (el.getAttribute('href') || '').trim();
    return !!h && h !== '#' && !/^javascript:/i.test(h);
  }

  // Boutons de reclamation candidats.
  function findButtons() {
    const out = [];
    // 1) selecteurs precis (partout)
    TA.selectors.dropClaim.forEach((sel) => {
      try { document.querySelectorAll(sel).forEach((el) => out.push(el)); } catch (e) { /* selecteur invalide */ }
    });
    if (onInventory()) {
      // 2) page inventaire = contexte sur : match par sous-chaine sur boutons/liens. On ecarte
      //    les conteneurs (leur texte contient celui du vrai bouton : deux clics, deux drops
      //    comptes), les liens de navigation et les libelles d'etat ("Claimed" contient "claim").
      const hints = TA.selectors.dropClaimTextHints;
      document.querySelectorAll('button, [role="button"], a').forEach((el) => {
        const t = (el.textContent || '').trim().toLowerCase();
        const a = (el.getAttribute('aria-label') || '').toLowerCase();
        if (!hints.some((h) => t.includes(h) || a.includes(h))) return;
        if (/\b(un)?claimed\b/.test(t) || isNavLink(el)) return;
        if (el.querySelector('button, [role="button"]')) return;
        out.push(el);
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
  const NAME_NOISE = /^(en profiter|obtenir|obtenu|claim now|claim|claimed|r[eé]clamer|r[eé]cup[eé]rer|\d+\s*%|termin[eé]|completed|in progress|en cours)$/i;

  function getDropName(btn) {
    // On remonte depuis le bouton ; a chaque niveau on cherche un libelle de nom.
    let el = btn;
    for (let depth = 0; depth < 8 && el; depth++) {
      if (el.querySelectorAll) {
        const cands = el.querySelectorAll('p[class*="CoreText"], span[class*="CoreText"], h1, h2, h3, h4, h5, h6, [role="heading"]');
        for (const c of cands) {
          // On retire un eventuel verbe d'action en tete ("Recuperer X" -> "X") : le libelle du
          // bouton de reclamation est parfois capte comme nom (bandeau sur un stream).
          const t = TAUtil.cleanDropName((c.textContent || '').trim());
          if (t && t.length >= 3 && t.length <= 80 && !NAME_NOISE.test(t) && !/ic[oô]ne|image/i.test(t)) {
            return t;
          }
        }
      }
      el = el.parentElement;
    }
    return '';
  }

  // Etiquetage jeu / campagne pour l'historique. Sur l'inventaire, le bloc de campagne porte le
  // jeu ET le nom de campagne ; depuis le bandeau d'un stream la campagne n'est ecrite nulle
  // part, on ne prend donc que la categorie de la chaine plutot que de deviner un nom faux.
  // Isole dans son propre try : c'est un CONFORT d'affichage, il ne doit jamais faire echouer
  // la remontee du claim (sinon un drop reclame ne serait pas compte).
  function dropMeta(btn) {
    try {
      return onInventory()
        ? TA.dom.findCampaign(btn)
        : { game: TA.dom.currentGame(), campaign: '' };
    } catch (e) {
      TA.log.warn('drops', 'jeu / campagne illisibles, drop enregistre sans etiquette');
      return { game: '', campaign: '' };
    }
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

      if (pending) return;                              // clic precedent pas encore verifie

      // Un drop refuse par Twitch (compte de jeu a lier) n'est plus clique avant REFUSED_TTL,
      // meme apres un rechargement de l'inventaire qui recree son bouton.
      const anyRefused = Object.keys(refused).length > 0;
      let btn = null;
      let name = '';
      let meta = null;
      for (const b of findButtons()) {
        if (claimedNodes.has(b) || !TA.dom.isClickable(b)) continue;
        const n = getDropName(b);
        const m = dropMeta(b);
        if (anyRefused && isRefused(refusalKey(n, m), now)) { claimedNodes.add(b); continue; }
        btn = b; name = n; meta = m;
        break;
      }
      if (!btn) return;

      const before = TAUtil.claimRefusalCounts(pageText());
      if (!TA.dom.click(btn)) return;

      claimedNodes.add(btn);
      lastClick = now;
      recent.push(now);
      pending = { name, meta, before, at: now, onInventory: onInventory(), channel: TA.dom.currentChannel() };
      verifyTimer = setTimeout(() => verify(false), VERIFY_STEP);

      // Re-essaye apres le cooldown pour enchainer les drops suivants.
      // armTimer est remis a null AU DEBUT de la re-tentative : sinon il reste non-null
      // pour toujours et maybeRefresh (qui s'arrete si armTimer) ne recharge plus jamais.
      if (armTimer) clearTimeout(armTimer);
      armTimer = setTimeout(() => { armTimer = null; tick(); }, COOLDOWN + 300);
    } catch (e) { TA.log.error('drops', e); }
  }

  // Verdict d'un clic : refuse des qu'un message de refus est apparu depuis le clic, reclame
  // au bout de VERIFY_MAX sans refus. final = verdict immediat (arret du module).
  function verify(final) {
    if (verifyTimer) { clearTimeout(verifyTimer); verifyTimer = null; }
    const p = pending;
    if (!p) return;
    try {
      const reason = TAUtil.claimRefusal(p.before, TAUtil.claimRefusalCounts(pageText()));
      if (!reason && !final && Date.now() - p.at < VERIFY_MAX) {
        verifyTimer = setTimeout(() => verify(false), VERIFY_STEP);
        return;
      }
      pending = null;
      if (reason) {
        const key = refusalKey(p.name, p.meta);
        const first = !!key && !refused[key];
        if (key) { refused[key] = { at: Date.now() }; saveRefused(); }
        TA.log.warn('drops', `drop refuse par Twitch (${reason === 'link' ? 'compte de jeu a lier' : 'erreur'}) : ${p.name || '?'}, nouvel essai dans 30 min`);
        // Une notification par drop et par onglet : le refus se repete a chaque essai.
        if (first && reason === 'link' && TA.dropRefused) {
          TA.dropRefused({ name: p.name, game: p.meta.game, campaign: p.meta.campaign });
        }
        return;
      }
      TA.report('drop', { name: p.name, channel: p.channel, game: p.meta.game, campaign: p.meta.campaign });
      TA.log.info('drops', p.name ? `drop reclame : ${p.name}` : 'drop reclame');
      // Claim depuis le bandeau d'un stream (hors page inventaire) : demande au
      // service worker de recharger l'onglet inventaire pour remettre a jour les
      // barres de progression (sur l'inventaire, maybeRefresh s'en charge deja).
      if (!p.onInventory) TA.reloadInventory();
    } catch (e) { TA.log.error('drops', e); }
  }

  // Recharge l'inventaire periodiquement, mais seulement si on y est encore (SPA) et hors claim.
  function maybeRefresh() {
    if (!onInventory()) return;                         // ne recharge pas une page de stream
    if (armTimer || pending) return;                    // sequence de claim en cours
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
      verify(true);                                     // un clic deja fait reste compte (ou refuse)
      if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
    }
  };
})();
