# Twitch Auto

Extension Chrome locale (Manifest V3) : auto-claim points de chaine + drops Twitch, reload auto du player, aides de farming AFK (qualite mini, anti "Toujours la", mute fond, notifications).

Usage personnel, en local, non publie sur le Chrome Web Store.

## Installation

1. Ouvrir `chrome://extensions`
2. Activer le **Mode developpeur** (en haut a droite)
3. "Charger l'extension non empaquetee" -> selectionner le dossier `twitch-auto/`
4. Epingler l'icone. Ouvrir Twitch : c'est actif.

Apres une modif de code : revenir sur `chrome://extensions` et cliquer le bouton recharger de l'extension.

## Reglages

Clic sur l'icone -> popup : interrupteur general, un toggle par fonction, compteurs points/drops.

Pour activer l'email d'alerte erreur : renseigner l'URL `errorEndpoint` (endpoint log-error de giw-site-web) dans le storage :

```js
chrome.storage.local.get('settings', ({ settings }) =>
  chrome.storage.local.set({ settings: { ...settings, errorEndpoint: 'https://VOTRE-ENDPOINT/log-error' } }));
```

Penser a ajouter le domaine de l'endpoint dans `host_permissions` du `manifest.json`.

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

## Changelog

- v1.1.0 : historique des drops (avec nom) et paliers de points dans le popup ; ID d'extension epingle (cle dans le manifest) pour que le stockage survive a un deplacement du dossier.
- v1.0.0 : version initiale (points, drops, reload, quality, antiAfk, mute, notifications, popup).

## Credits

Icones : [Lucide](https://lucide.dev) / [Feather](https://feathericons.com) (licences ISC / MIT).

## Note CGU

L'auto-claim de points/drops est dans une zone grise des CGU Twitch. Approche par clic DOM (risque faible), aucune garantie. Usage assume.
