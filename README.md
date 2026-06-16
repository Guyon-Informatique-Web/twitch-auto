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

Deux voies de reclamation :

- **Page inventaire** (`twitch.tv/drops/inventory`) : voie principale et fiable. Match large par texte ("En profiter"...) car le contexte est sur.
- **Bandeau "drop pret" sur un stream** : quand un drop se termine pendant le visionnage, un bandeau avec timer (~20s) apparait au-dessus du chat avec un `<button>` "Obtenir". On le clique en exigeant un libelle de bouton EXACT (pour ne jamais cliquer le lien `<a>` "Obtenir" de navigation, ni "Obtenir Turbo", etc.).

**Config recommandee** : garde un onglet ouvert sur `twitch.tv/drops/inventory` **en arriere-plan**. L'extension le recharge automatiquement toutes les 5 min et reclame les drops termines, sans intervention. Les drops qui se terminent pendant que tu regardes un stream sont aussi reclames via leur bandeau.

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

- v1.9.0 : ETA (temps restant estime) a cote de chaque drop en cours ; bouton "Tester les selecteurs" dans Reglages (diagnostic quand Twitch change son interface) ; option "Inventaire auto" qui garde/ouvre l'onglet inventaire en arriere-plan.
- v1.8.3 : empeche carrement la mise en pause des onglets en arriere-plan (override de video.pause() dans le contexte de la page quand l'onglet est cache) -> plus de tug-of-war avec Twitch.
- v1.8.2 : anti-pause instantane - ecoute l'evenement 'pause' de la video (non throttle) pour relancer des que Twitch met en pause au changement d'onglet (avec garde anti-boucle).
- v1.8.1 : anti-pause renforce - les onglets de fond dont la lecture est refusee par Chrome (autoplay avec son bloque) sont relances en muet, pour qu'ils jouent vraiment et farment.
- v1.8.0 : les Drops progressent maintenant sur TOUS les onglets en parallele (pas seulement l'onglet actif). Un script injecte dans le contexte de la page fait croire a Twitch que chaque onglet est visible ; nos modules (mute/qualite/anti-pause) voient toujours la vraie visibilite (monde isole separe).
- v1.7.1 : "Drops en cours" masque les recompenses expirees ("Cette recompense n'est plus disponible").
- v1.7.0 : module Anti-pause - relance la lecture des onglets en arriere-plan mis en pause (Chrome/Twitch pausent parfois les onglets inactifs), sans toucher l'onglet regarde.
- v1.6.3 : corrige "Drops en cours" qui disparaissait au reload de l'inventaire (on ignore le vidage transitoire pendant 6 min) ; un onglet sur une chaine compte comme actif meme pendant une pub (le temps de visionnage ne monte que si ca joue).
- v1.6.2 : "Drops en cours" trie par progression decroissante (le plus avance en haut).
- v1.6.1 : "Drops en cours" affiche le vrai nom du drop (ignore le texte de progression "X% de Y minutes").
- v1.6.0 : popup reorganise en 3 onglets (Stats / Historique / Reglages). Le toggle general reste en tete, visible partout.
- v1.5.0 : suivi du temps de visionnage + nombre d'onglets actifs, vue "drops en cours" (% de progression), stats par chaine (top chaines), et auto-switch vers une chaine de repli quand le stream regarde passe hors-ligne (toggle + URL de repli, opt-in).
- v1.4.1 : bouton "exporter" (sauvegarde compteurs + historique en JSON) ; permission api.github.com conservee pour garantir la notif de MAJ chez les amis.
- v1.4.0 : gros pack qualite. Bugs : qualite 160p restauree au 1er plan (plus de blocage permanent), drops anti-boucle a fenetre glissante + refresh inventaire SPA-safe, alarme de MAJ fiable, gain de points reel (lu dans le DOM), formatCompact. Drops : reclamation aussi depuis le bandeau "drop pret" sur un stream (bouton "Obtenir"). Perf : observer allege (retrait class, debounce ralenti en arriere-plan, arret quand tout est off), scans cibles. UX/accessibilite : toggle au clavier, confirmation du reset, infobulles des reglages et des noms de drops, libelles + regions live. Securite : ecritures storage serialisees, throttle erreurs persistant, permission api.github retiree, *.pem dans .gitignore, URL de telechargement validee.
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
