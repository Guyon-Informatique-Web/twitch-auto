// SOURCE UNIQUE de tous les selecteurs/textes Twitch.
// Quand Twitch casse l'extension, c'est ICI qu'on corrige.
// Regle : data-test-selector / data-a-target / aria-label / texte. JAMAIS les classes CSS aleatoires.
window.TA = window.TA || {};
TA.selectors = {
  // Coffre bonus de points de chaine (dans le chat).
  // FR confirme : <button aria-label="Récupérer un bonus"> contenant .claimable-bonus__icon
  pointsClaim: [
    '[data-test-selector="community-points-claim"]',
    'button[aria-label*="Récupérer un bonus" i]',
    'button[aria-label*="bonus" i]',
    'button[aria-label*="Claim" i]',
    'button[aria-label*="Réclamer" i]',
    '.claimable-bonus__icon'
  ],

  // Bouton de reclamation d'un drop
  dropClaim: [
    '[data-test-selector="DropsCampaignInProgressRewardPresentation-claim-button"]',
    'button[data-a-target="drops-claim-button"]'
  ],
  // Indices texte pour reclamer un drop TERMINE (page inventaire).
  // FR confirme : le bouton de reclamation est "En profiter".
  // NB : "Obtenir" = lien <a> vers la campagne, PAS une reclamation -> exclu.
  dropClaimTextHints: ['en profiter', 'réclamer', 'reclamer', 'claim now', 'claim'],

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
  ]
};
