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
  // Drop en erreur (refuse par Twitch ou echec) : jamais compte, et plus clique avant le delai
  // du reglage dropRetryMin (60 min par defaut). Memoire dans chrome.storage.local, partagee par
  // tous les onglets Twitch : un onglet inventaire rouvert ou le bandeau d'un stream ne
  // reessaient pas plus tot (en 1.13.2 elle etait par onglet, en sessionStorage).
  const REFUSED_STORE = 'dropsRefused';
  const REFUSED_KEEP = 24 * 60 * 60 * 1000;     // entrees oubliees apres un jour (le delai max)
  let lastClick = 0;
  let recent = [];
  let verifyTimer = null;
  let pending = null;                           // clic en attente de verification
  let refused = {};                             // { cle du drop: { at } }
  let loading = null;                           // lecture de la memoire en cours au demarrage
  let startGen = 0;                             // un stop() pendant la lecture annule le start()

  function retryMs() { return TAUtil.dropRetryMin(TA.settings) * 60 * 1000; }
  function cleanRefused(map, now) {
    const out = {};
    if (!map || typeof map !== 'object') return out;
    Object.keys(map).forEach((k) => {
      const at = map[k] && map[k].at;
      if (typeof at === 'number' && at <= now && now - at < REFUSED_KEEP) out[k] = { at };
    });
    return out;
  }
  // Fusionne avec ce que les autres onglets ont ecrit : la date la plus recente l'emporte.
  function mergeRefused(map) {
    const other = cleanRefused(map, Date.now());
    Object.keys(other).forEach((k) => { if (!refused[k] || refused[k].at < other[k].at) refused[k] = other[k]; });
  }
  function storage() {
    try { return (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) || null; } catch (e) { return null; }
  }
  function loadRefused() {
    // Memoire par onglet de la 1.13.2 (sessionStorage) : reprise une fois, puis effacee.
    try {
      const legacy = sessionStorage.getItem('ta-drops-refused');
      if (legacy) { mergeRefused(JSON.parse(legacy)); sessionStorage.removeItem('ta-drops-refused'); saveRefused(); }
    } catch (e) { /* pas de sessionStorage, contenu illisible */ }
    const st = storage();
    if (!st) return Promise.resolve();
    try {
      return Promise.resolve(st.get(REFUSED_STORE)).then((d) => mergeRefused(d && d[REFUSED_STORE]), () => {});
    } catch (e) { return Promise.resolve(); }   // contexte d'extension invalide (MAJ en cours)
  }
  function saveRefused() {
    const st = storage();
    if (!st) return;
    try {
      // Relit avant d'ecrire : un autre onglet a pu noter un autre drop entre-temps.
      Promise.resolve(st.get(REFUSED_STORE)).then((d) => {
        mergeRefused(d && d[REFUSED_STORE]);
        refused = cleanRefused(refused, Date.now());
        return st.set({ [REFUSED_STORE]: refused });
      }).catch(() => {});
    } catch (e) { /* contexte d'extension invalide */ }
  }
  // Cles d'un drop : campagne + nom ET jeu + nom. Le bandeau d'un stream ne lit que le jeu,
  // l'inventaire lit les deux : noter et chercher les deux cles fait valoir un refus vu sur
  // l'inventaire pour le bandeau du meme drop (et inversement). Vide si rien n'est lisible.
  function refusalKeys(name, meta) {
    const keys = [];
    const add = (where) => { const k = name || where ? `${where}|${name}` : ''; if (k && !keys.includes(k)) keys.push(k); };
    if (meta && meta.campaign) add(meta.campaign);
    if (meta && meta.game) add(meta.game);
    if (!keys.length) add('');
    return keys;
  }
  function isRefused(keys, now) {
    const ttl = retryMs();
    return keys.some((k) => refused[k] && now - refused[k].at < ttl);
  }
  // Un autre onglet a note (ou la remise a zero a efface) un drop en erreur : prise en compte
  // tout de suite, sans attendre le prochain demarrage du module.
  function onStorageChanged(changes, area) {
    if (area !== 'local' || !changes[REFUSED_STORE]) return;
    const nv = changes[REFUSED_STORE].newValue;
    if (nv === undefined) refused = {};
    else mergeRefused(nv);
  }
  function listen(on) {
    try {
      const ev = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged;
      if (!ev) return;
      if (on) ev.addListener(onStorageChanged); else ev.removeListener(onStorageChanged);
    } catch (e) { /* contexte d'extension invalide */ }
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

      if (pending || loading) return;                   // clic pas encore verifie, memoire pas lue

      // Un drop en erreur n'est plus clique avant le delai du reglage (60 min par defaut),
      // meme apres un rechargement de l'inventaire qui recree son bouton.
      const anyRefused = Object.keys(refused).length > 0;
      let btn = null;
      let name = '';
      let meta = null;
      for (const b of findButtons()) {
        if (claimedNodes.has(b) || !TA.dom.isClickable(b)) continue;
        const n = getDropName(b);
        const m = dropMeta(b);
        // Pas de claimedNodes ici : le meme bouton doit pouvoir etre clique une fois le delai passe.
      if (anyRefused && isRefused(refusalKeys(n, m), now)) continue;
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
      verifyTimer = setTimeout(verify, VERIFY_STEP);

      // Re-essaye apres le cooldown pour enchainer les drops suivants.
      // armTimer est remis a null AU DEBUT de la re-tentative : sinon il reste non-null
      // pour toujours et maybeRefresh (qui s'arrete si armTimer) ne recharge plus jamais.
      if (armTimer) clearTimeout(armTimer);
      armTimer = setTimeout(() => { armTimer = null; tick(); }, COOLDOWN + 300);
    } catch (e) { TA.log.error('drops', e); }
  }

  // Verdict d'un clic : refuse des qu'un message de refus est apparu depuis le clic, reclame
  // au bout de VERIFY_MAX sans refus.
  function verify() {
    if (verifyTimer) { clearTimeout(verifyTimer); verifyTimer = null; }
    const p = pending;
    if (!p) return;
    try {
      const reason = TAUtil.claimRefusal(p.before, TAUtil.claimRefusalCounts(pageText()));
      if (!reason && Date.now() - p.at < VERIFY_MAX) {
        verifyTimer = setTimeout(verify, VERIFY_STEP);
        return;
      }
      pending = null;
      if (reason) {
        // Erreur : rien n'est compte (ni compteur, ni historique), et le drop attend le delai.
        const keys = refusalKeys(p.name, p.meta);
        const first = !keys.some((k) => refused[k]);
        const at = Date.now();
        keys.forEach((k) => { refused[k] = { at }; });
        saveRefused();
        const min = TAUtil.dropRetryMin(TA.settings);
        TA.log.warn('drops', `drop refuse par Twitch (${reason === 'link' ? 'compte de jeu a lier' : 'erreur'}) : ${p.name || '?'}, non compte, nouvel essai dans ${min} min`);
        // Une notification par drop (tous onglets confondus, tant que la memoire le garde) : le
        // refus se repete a chaque essai.
        if (first && reason === 'link' && TA.dropRefused) {
          TA.dropRefused({ name: p.name, game: p.meta.game, campaign: p.meta.campaign, retryMin: min });
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
      // La memoire des drops en erreur est lue AVANT le premier clic : sans elle, chaque
      // rechargement de l'inventaire recliquerait aussitot le drop refuse.
      const gen = ++startGen;
      listen(true);
      loading = loadRefused().then(() => {
        if (gen !== startGen) return;                   // stop() entre-temps
        loading = null;
        unsub = TA.dom.subscribe(tick);
      }).catch((e) => { loading = null; TA.log.error('drops', e); });
      refreshTimer = setInterval(maybeRefresh, INVENTORY_REFRESH);
    },
    stop() {
      startGen += 1;
      loading = null;
      listen(false);
      if (unsub) { unsub(); unsub = null; }
      if (armTimer) { clearTimeout(armTimer); armTimer = null; }
      // Un clic deja fait garde sa verification jusqu'au verdict (4 s) : compte s'il passe,
      // jamais compte si Twitch le refuse, meme si le module vient d'etre coupe.
      if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
    }
  };
})();
