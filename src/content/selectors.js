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
  // Etats NON transitoires -> on ne recharge PAS (sinon boucle infinie)
  reloadExcludePatterns: [
    /offline/i,
    /hors[- ]?ligne/i,
    /subscriber/i,
    /abonn/i,
    /unavailable/i,
    /indisponible/i
  ],

  // Segments de chemin qui ne sont PAS une chaine (pour identifier la chaine courante).
  notChannelPaths: [
    '', 'directory', 'drops', 'settings', 'u', 'p', 'subscriptions', 'wallet',
    'inventory', 'friends', 'search', 'videos', 'following', 'prime', 'turbo',
    'downloads', 'jobs', 'store', 'team', 'event', 'popout', 'moderator'
  ],

  // Barre de progression d'un drop en cours (page inventaire).
  dropProgress: ['[role="progressbar"]'],

  // Etat "chaine hors-ligne" (pour l'auto-switch).
  offlinePatterns: [/hors[- ]?ligne/i, /\boffline\b/i, /est absent/i]
};
