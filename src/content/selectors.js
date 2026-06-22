// SOURCE UNIQUE de tous les selecteurs/textes Twitch.
// Quand Twitch casse l'extension, c'est ICI qu'on corrige.
// Regle : data-test-selector / data-a-target / aria-label / texte. JAMAIS les classes CSS aleatoires.
window.TA = window.TA || {};
TA.selectors = {
  // Coffre bonus de points de chaine (dans le chat).
  // FR confirme : <button aria-label="Récupérer un bonus"> contenant .claimable-bonus__icon.
  // Selecteurs SPECIFIQUES uniquement (pas de *="Claim"/"Réclamer" generique qui matcherait un drop).
  pointsClaim: [
    '[data-test-selector="community-points-claim"]',
    'button[aria-label*="Récupérer un bonus" i]',
    'button[aria-label*="Claim Bonus" i]',
    '.claimable-bonus button',
    '.claimable-bonus__icon'
  ],

  // Solde de points de chaine affiche (pour calculer le gain reel d'un coffre).
  // FR confirme : <span class="ScAnimatedNumber-..."> dans un <button aria-label="Vous avez X Points...">.
  // (Le streamer peut renommer ses points, ex. "Points Zen" -> on ne se base pas sur le mot "chaine".)
  pointsBalance: [
    '[data-test-selector="balance-string"]',
    '[data-a-target="balance-string"]',
    '[data-test-selector="community-points-summary"] span[class*="ScAnimatedNumber"]',
    'button[aria-label*="Points" i] span[class*="ScAnimatedNumber"]',
    'span[class*="ScAnimatedNumber"]'
  ],

  // Bouton de reclamation d'un drop
  dropClaim: [
    '[data-test-selector="DropsCampaignInProgressRewardPresentation-claim-button"]',
    'button[data-a-target="drops-claim-button"]'
  ],
  // Indices texte pour reclamer un drop TERMINE sur la page INVENTAIRE (match par sous-chaine, contexte sur).
  // FR confirme : "En profiter".
  dropClaimTextHints: ['en profiter', 'réclamer', 'reclamer', 'claim now', 'claim'],
  // Libelles EXACTS de bouton pour le bandeau "drop pret" SUR UN STREAM (match exact, zone non sure).
  // Le bandeau timer (~20s) au-dessus du chat utilise un <button> "Obtenir" (un <a> "Obtenir" = navigation, ignore).
  dropClaimExact: ['en profiter', 'obtenir', 'réclamer', 'reclamer', 'claim', 'claim now'],

  // Conteneur d'overlay d'erreur du player
  playerOverlay: [
    '[data-a-target="player-overlay-content-gate"]',
    '[data-a-target="player-overlay"]',
    '.content-overlay-gate'
  ],

  // Bouton "Demarrer"/"Start Watching" (gate contenu mature)
  matureAccept: [
    '[data-a-target="player-overlay-mature-accept"]',
    'button[data-a-target="content-classification-gate-overlay-start-watching-button"]'
  ],

  // Indices texte pour le prompt "Vous etes toujours la ?"
  stillWatchingHints: ['still watching', 'continue watching', 'toujours là', 'continuer à regarder'],

  // Erreurs TRANSITOIRES -> on recharge
  reloadErrorPatterns: [
    /#\s?[1-9]\d{3}/,
    /content is not available/i,
    /error loading data/i,
    /une erreur (s'est|est) produite/i,
    /try again/i,
    /réessayer/i
  ],
  // (reloadExcludePatterns est defini APRES l'objet : il derive de offlinePatterns,
  //  ce qui evite deux listes "offline" desynchronisables. Voir bas de fichier.)

  // Segments de chemin qui ne sont PAS une chaine (pour identifier la chaine courante).
  notChannelPaths: [
    '', 'directory', 'drops', 'settings', 'u', 'p', 'subscriptions', 'wallet',
    'inventory', 'friends', 'search', 'videos', 'following', 'prime', 'turbo',
    'downloads', 'jobs', 'store', 'team', 'event', 'popout', 'moderator'
  ],

  // Barre de progression d'un drop en cours (page inventaire).
  dropProgress: ['[role="progressbar"]'],

  // Anti-signaux LIVE : presents UNIQUEMENT quand la chaine courante est EN DIRECT.
  // Leur presence court-circuite toute detection hors-ligne (ils survivent a une pub, une
  // pause ou un gate contenu mature : le stream reste live derriere). On matche l'attribut
  // data-a-target / l'ID, JAMAIS le tag (p vs strong varient selon les versions de Twitch).
  liveSignals: [
    '#live-channel-stream-information',
    '[data-a-target="animated-channel-viewers-count"]'
  ],
  // Signal POSITIF fort hors-ligne : conteneur present UNIQUEMENT sur une page de chaine
  // hors-ligne (pendant exact de #live-channel-stream-information). Insensible a une video
  // de preview/recommandation en pause (le piege post-raid de l'ancienne detection texte).
  offlineSignals: ['#offline-channel-main-content'],
  // Roots BORNES ou chercher le TEXTE hors-ligne (zone offline + overlay player).
  // JAMAIS document.body : le mot "offline" apparait ailleurs (sidebar, recommandations)
  // -> faux positifs. Pas de en-tete de chaine ici (titres "going offline soon" ambigus).
  offlineTextRoots: [
    '#offline-channel-main-content',
    '.home-offline-hero',
    '[data-a-target="player-overlay-content-gate"]',
    '[data-a-target="player-overlay"]',
    '.content-overlay-gate'
  ],

  // Etat "chaine hors-ligne" - motifs TEXTE de repli (FR + EN), volontairement CONSERVATEURS :
  // on evite les libelles ambigus type "sin conexion" qui recoupent une erreur reseau
  // transitoire. L'i18n offline est surtout couverte par offlineSignals (structurel).
  offlinePatterns: [/hors[- ]?ligne/i, /\boffline\b/i, /est absent/i]
};

// Etats NON transitoires pour le reloader : on ne recharge PAS un etat hors-ligne (MEME
// source que watchdog/autoswitch via offlinePatterns) ni les autres etats non recuperables
// (abonnes uniquement, indisponible). Construit APRES l'objet car il reutilise offlinePatterns.
TA.selectors.reloadExcludePatterns = TA.selectors.offlinePatterns.concat([
  /subscriber/i, /abonn/i, /unavailable/i, /indisponible/i
]);
