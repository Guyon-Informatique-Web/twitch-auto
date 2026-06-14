# Twitch Auto

Extension Chrome locale (Manifest V3) : auto-claim points de chaine + drops Twitch, reload auto du player, aides de farming AFK (qualite mini, anti "Toujours la", mute fond, notifications).

Usage personnel, en local, non publie sur le Chrome Web Store.

## Installation

1. Ouvrir `chrome://extensions`
2. Activer le **Mode developpeur** (en haut a droite)
3. "Charger l'extension non empaquetee" -> selectionner le dossier `twitch-auto/`
4. Epingler l'icone. Ouvrir Twitch : c'est actif.

Apres une modif de code : revenir sur `chrome://extensions` et cliquer le bouton recharger de l'extension.

## Mise a jour

L'extension se met a jour EN PLACE. Grace a la cle d'ID epinglee dans le manifest, tu n'as JAMAIS besoin de la supprimer puis re-ajouter : les compteurs et l'historique sont conserves.

1. Recuperer la derniere version :
   - lancer `tools/update.sh` (fait le `git pull` et affiche la version), ou
   - faire `git pull` dans le dossier de l'extension.
2. Aller sur `chrome://extensions` et cliquer le bouton **recharger** sur la carte Twitch Auto.

C'est tout : pas de "Charger l'extension non empaquetee" a refaire, pas de doublon, donnees gardees.

> Charge l'extension depuis UN SEUL dossier (`C:\Mes Projets\PERSO\twitch-auto`). Charger une 2e copie depuis un autre chemin creerait un doublon ; de toute facon Chrome refusera la 2e copie a cause de la cle d'ID identique.

## Reglages

Clic sur l'icone -> popup : interrupteur general, un toggle par fonction, compteurs points/drops.

Pour activer l'email d'alerte erreur : renseigner l'URL `errorEndpoint` (endpoint log-error de giw-site-web) dans le storage :

```js
chrome.storage.local.get('settings', ({ settings }) =>
  chrome.storage.local.set({ settings: { ...settings, errorEndpoint: 'https://VOTRE-ENDPOINT/log-error' } }));
```

Penser a ajouter le domaine de l'endpoint dans `host_permissions` du `manifest.json`.

## Drops : farming hands-free

La reclamation des drops se fait UNIQUEMENT via la page inventaire (`twitch.tv/drops/inventory`), pas depuis le stream. C'est volontaire et c'est la methode utilisee par tous les outils du genre :

- Le bouton "claim" affiche en bas du player en live est instable/cosmetique (il redirige souvent vers l'inventaire) et Twitch change ce DOM en permanence.
- Sur une page de stream, beaucoup de boutons ressemblent a "Claim / En profiter / Obtenir" (sub gratuit, Prime, Turbo, recompense de points) : cliquer a l'aveugle risquerait de cliquer le mauvais.
- Seul l'inventaire a un selecteur stable : `DropsCampaignInProgressRewardPresentation-claim-button` et le bouton texte "En profiter".

**Config recommandee** : garde un onglet ouvert sur `twitch.tv/drops/inventory` **en arriere-plan** (pas l'onglet actif). L'extension le recharge automatiquement toutes les 5 min et reclame les drops termines, sans intervention. Tu regardes tes streams dans les autres onglets.

## Maintenance des selecteurs (quand Twitch casse quelque chose)

Tout est dans **`src/content/selectors.js`**. Procedure :

1. Sur la page Twitch concernee, ouvrir l'inspecteur (F12) sur l'element qui n'est plus clique.
2. Reperer un attribut stable : `data-test-selector`, `data-a-target`, ou `aria-label`. Jamais les classes CSS aleatoires.
3. Ajouter/mettre a jour le candidat en tete de la liste concernee dans `selectors.js`.
4. Recharger l'extension et retester.

### Script de diagnostic (console de la page Twitch)

Coller dans la console pour voir quels selecteurs matchent sur la page courante :

```js
const S = window.TA.selectors;
for (const k of ['pointsClaim', 'dropClaim', 'playerOverlay', 'matureAccept']) {
  const hit = (S[k] || []).find((s) => { try { return document.querySelector(s); } catch (e) { return false; } });
  console.log(k, hit ? 'OK -> ' + hit : 'AUCUN match');
}
```

## Tests

Fonctions pures : `node test/util.test.js` (doit afficher `OK util`).
Le reste se teste manuellement dans Chrome (voir le plan d'implementation dans `docs/superpowers/plans/`).

## Partage avec des amis

Le depot est public. Pour installer :

1. Telecharger le ZIP depuis la derniere release : https://github.com/Guyon-Informatique-Web/twitch-auto/releases/latest (bouton "Source code (zip)" ou l'asset joint).
2. Decompresser, puis `chrome://extensions` -> Mode developpeur -> "Charger l'extension non empaquetee" -> choisir le dossier.

L'extension verifie automatiquement (toutes les 6h + au demarrage) s'il existe une nouvelle release sur GitHub. Si oui : une notification + une banniere "nouvelle version dispo" dans le popup. Il suffit alors de retelecharger le ZIP de la derniere release, remplacer le dossier et recharger l'extension.

## Changelog

- v1.3.4 : corrige la banniere de MAJ qui restait affichee en permanence (le display:flex du CSS ecrasait l'attribut hidden). Combine avec v1.3.3, la banniere s'affiche seulement quand une version plus recente existe.
- v1.3.3 : la banniere de mise a jour disparait des qu'on est sur la derniere version (comparaison avec la version reellement installee, au lieu d'un flag stocke).
- v1.3.2 : le mute des onglets en arriere-plan se fait au niveau de l'onglet (chrome.tabs muted) au lieu de l'element video, ce qui evite de mettre le stream en pause (politique autoplay du navigateur).
- v1.3.1 : bouton "Telecharger la MAJ" dans le popup (telecharge le ZIP de la derniere release en 1 clic ; reste a dezipper + recharger).
- v1.3.0 : verificateur de mise a jour integre (compare la derniere release GitHub a la version installee) avec notification + banniere dans le popup. Depot rendu public.
- v1.2.3 : detection du nom de drop plus robuste (recherche a chaque niveau en remontant depuis le bouton).
- v1.2.2 : nom du drop lu depuis le bon paragraphe (CoreText) -> vrais noms dans l'historique.
- v1.2.1 : reclame TOUS les drops disponibles (plus un seul) ; auto-refresh de l'inventaire desormais aussi au premier plan ; meilleure detection du nom du drop pour l'historique.
- v1.2.0 : auto-refresh de l'inventaire en arriere-plan (toutes les 5 min) pour reclamer les drops termines sans intervention. La reclamation reste via l'inventaire (le claim depuis le stream live n'est pas fiable).
- v1.1.0 : historique des drops (avec nom) et paliers de points dans le popup ; ID d'extension epingle (cle dans le manifest) pour que le stockage survive a un deplacement du dossier.
- v1.0.0 : version initiale (points, drops, reload, quality, antiAfk, mute, notifications, popup).

## Credits

Icones : [Lucide](https://lucide.dev) / [Feather](https://feathericons.com) (licences ISC / MIT).

## Note CGU

L'auto-claim de points/drops est dans une zone grise des CGU Twitch. Approche par clic DOM (risque faible), aucune garantie. Usage assume.
