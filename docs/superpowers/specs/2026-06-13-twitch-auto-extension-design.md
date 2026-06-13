# Spec - Extension Chrome "Twitch Auto"

- **Date** : 2026-06-13
- **Auteur** : Valentin Guyon (vibe code avec Claude)
- **Statut** : Validé (design + logo), en attente de relecture du spec
- **Emplacement projet** : `giw-projets-web/twitch-auto/`

---

## 1. Objectif

Recréer une extension Chrome **locale** (chargée en mode développeur, sans publication sur le Web Store) qui automatise la collecte sur Twitch, en remplacement de l'ancienne extension "Automatic Twitch: Drops, Moments and Points" devenue incompatible.

L'extension doit :
1. Réclamer automatiquement les **points de chaîne** (coffres bonus).
2. Réclamer automatiquement les **Drops**.
3. **Recharger** automatiquement la page quand le player Twitch plante.
4. Fournir des **fonctions de farming AFK** : qualité vidéo minimale, anti "Toujours là ?", mute des onglets en arrière-plan, notifications.
5. Être **facile à maintenir** dans le temps (Twitch change souvent son interface).

### Contexte technique (recherche du 2026-06-13)

- Les **"Moments" Twitch ont été supprimés le 5 octobre 2023** : la fonctionnalité n'existe plus, on ne l'implémente pas.
- L'ancienne extension est cassée car écrite en **Manifest V2** (désactivé par Chrome mi-2024) et ciblait Moments.
- Approche retenue : **simulation de clics dans le DOM** (jamais d'appels API GraphQL directs) -> risque de ban quasi nul et meilleure longévité.

---

## 2. Périmètre

### Inclus
- Manifest V3, chargement local, **sans build step** (rechargement direct du dossier).
- Fonctionne en parallèle sur tous les onglets `twitch.tv` (usage actif ET farming AFK multi-onglets).
- Auto-claim points + drops, auto-reload, qualité mini, anti-AFK, mute fond, notifications.
- Popup de contrôle complet (toggle général + toggles par fonction + compteurs).
- Logo + jeu d'icônes (16/32/48/128).

### Exclus (YAGNI)
- Moments (supprimé par Twitch).
- Appels API GraphQL.
- Page d'options séparée (le popup suffit).
- Dons, traduction, historique détaillé, partage social.
- Publication sur le Chrome Web Store.

---

## 3. Contraintes

- **Manifest V3** obligatoire (Chrome actuel).
- **Aucun build / aucune dépendance npm** : que du HTML/CSS/JS vanilla, chargeable tel quel via "Charger l'extension non empaquetée". (Évite aussi le souci `npm install` sur `/mnt/c/`.)
- **Typographie** : jamais de tiret long (`—`/`–`), uniquement le tiret simple. Vaut pour code, commentaires, UI, commits.
- **Tests navigateur** : Google Chrome stable uniquement (jamais Chromium).
- Code **factorisé et commenté** (préférence Valentin).

---

## 4. Architecture

### Arborescence

```
twitch-auto/
├── manifest.json
├── src/
│   ├── content/
│   │   ├── selectors.js        # ★ Fichier de maintenance : tous les sélecteurs/textes Twitch
│   │   ├── observer.js         # MutationObserver mutualisé + debounce + helpers de clic
│   │   ├── content.js          # bootstrap : lit les réglages, instancie les modules actifs
│   │   └── modules/
│   │       ├── points.js
│   │       ├── drops.js
│   │       ├── reloader.js
│   │       ├── quality.js
│   │       ├── antiAfk.js
│   │       └── mute.js
│   ├── background/
│   │   └── background.js        # service worker : compteurs, notifications, badge
│   └── popup/
│       ├── popup.html
│       ├── popup.css
│       └── popup.js
├── icons/
│   ├── logo.svg
│   ├── icon-16.png
│   ├── icon-32.png
│   ├── icon-48.png
│   └── icon-128.png
├── docs/superpowers/specs/2026-06-13-twitch-auto-extension-design.md
└── README.md                    # installation + guide de maintenance des sélecteurs
```

### Chargement des scripts (pas de bundler)

Les fichiers du content script sont déclarés **dans l'ordre** dans `manifest.json` (`content_scripts[].js`). Ils partagent le même "isolated world". Pour partager du code entre fichiers sans build, chacun attache son API à un **namespace global unique** :

```js
// en tête de chaque fichier
window.TA = window.TA || {};
```

`selectors.js` est chargé en premier, puis `observer.js`, les `modules/*`, et enfin `content.js` qui démarre tout.

### Principe de durabilité (clé du projet)

**Tous** les sélecteurs et textes Twitch vivent dans `selectors.js`, sous forme de **listes de candidats** ordonnées (du plus stable au moins stable). Quand Twitch casse quelque chose, on n'édite **qu'un seul fichier**.

Règles de robustesse :
- Cibler `data-test-selector`, `data-a-target`, `aria-label`, le **texte** du bouton. **Jamais** les classes CSS aléatoires de Twitch.
- Supporter FR et EN dans les correspondances de texte/aria ("Claim"/"Réclamer", etc.).
- Détection via `MutationObserver` (pas de polling), avec **debounce** (~150 ms).
- Avant chaque clic : vérifier la **visibilité** (`offsetParent !== null`, `display !== none`) et `!disabled`.
- **Cooldown anti double-clic** par élément (ex. 1500 ms).

---

## 5. Modules (content script)

Chaque module expose `start()` / `stop()` et lit son toggle dans les réglages. `content.js` les active/désactive selon `chrome.storage` et réagit en direct à `chrome.storage.onChanged`.

### 5.1 points.js - Points de chaîne
- Détecte le coffre bonus dès qu'il apparaît dans le chat et le clique.
- Candidats sélecteurs initiaux (à confirmer sur Twitch live) :
  - `[data-test-selector="community-points-claim"]`
  - `button[aria-label*="Claim"]`, `button[aria-label*="Réclamer"]`
  - `.claimable-bonus` / `.claimable-bonus__icon` (cliquer le bouton parent)
  - fallback texte : bouton contenant "Claim"/"Réclamer".
- À chaque claim réussi : message au background (`{type: 'claim', kind: 'points', amount?}`). On somme la valeur du bonus (souvent "+50") quand elle est lisible, sinon on compte le claim.

### 5.2 drops.js - Drops
- Sur `https://www.twitch.tv/drops/inventory` : détecte et clique les boutons "Claim"/"Réclamer" des drops complétés.
- Sur une page de stream : capte le toast/bouton de drop réclamable et le clique.
- Option : le background peut ouvrir l'inventaire dans un onglet en arrière-plan pour déclencher la réclamation (décision d'implémentation, garder simple au départ : on traite l'inventaire quand l'onglet est ouvert).
- À chaque claim : message `{type: 'claim', kind: 'drop', name?}`.

### 5.3 reloader.js - Auto-reload sur plantage
- Détecte un overlay d'erreur du player : texte matchant `/#\s?[1-9]\d{3}/` (codes #1000/#2000/#3000/#4000/#5000), ou phrases type "Content not available", "Une erreur", "réessayer".
- Recharge la page après un **délai** (défaut 5 s).
- **Garde-fous anti-boucle (critique)** :
  - Maximum **5 reloads / 10 min** par onglet (compteur en `sessionStorage`), au-delà on s'arrête.
  - On **ne recharge pas** sur les états non transitoires : "hors-ligne", "abonnés uniquement", "chaîne indisponible" (sinon boucle infinie). Liste d'exclusion dans `selectors.js`.

### 5.4 quality.js - Qualité minimale (best-effort)
- Force la qualité la plus basse (160p) sur les onglets restés **en arrière-plan**, et restaure quand l'onglet repasse au premier plan.
- Méthode 1 (prioritaire) : écrire `localStorage['video-quality'] = '{"default":"160p30"}'` (lu par le player).
- Méthode 2 (fallback) : ouvrir le menu réglages du player (`[data-a-target="player-settings-button"]`) -> qualité -> sélectionner la plus basse.
- Note : module le plus susceptible de casser/nécessiter maintenance, traité en "best-effort".

### 5.5 antiAfk.js - Anti "Toujours là ?" + gates
- Clique automatiquement :
  - le prompt "Continuer à regarder" / "Are you still watching?",
  - le gate contenu mature ("Démarrer"/"Start Watching", `[data-a-target="player-overlay-mature-accept"]`).
- Sélecteurs/textes dans `selectors.js`.

### 5.6 mute.js - Mute des onglets en arrière-plan
- Sur `visibilitychange` : si l'onglet est masqué et le toggle actif, couper le son (`video.muted = true` sur les `<video>`), rétablir au retour au premier plan.

---

## 6. Service worker (background.js)

- **Compteurs** persistés dans `chrome.storage.local` :
  - `pointsClaimed` (nb de coffres), `pointsValue` (somme estimée), `lastPointsClaim` (timestamp)
  - `dropsClaimed` (nb), `lastDropsClaim` (timestamp)
- Reçoit les messages de claim des content scripts -> incrémente les compteurs.
- **Notifications desktop** (`chrome.notifications`) : sur chaque **drop** réclamé et sur les **paliers de points** (ex. tous les 5000 pts) pour éviter le spam (un coffre toutes les ~15 min).
- **Badge** sur l'icône : pastille verte quand actif, grise quand off.
- `onInstalled` : initialise les réglages par défaut (tout activé).

---

## 7. Modèle de données (`chrome.storage.local`)

```js
settings: {
  enabled: true,        // interrupteur général
  points: true,
  drops: true,
  reload: true,
  lowQuality: true,
  antiAfk: true,
  muteBackground: true,
  notifications: true
}
stats: {
  pointsClaimed: 0,
  pointsValue: 0,
  lastPointsClaim: null,
  dropsClaimed: 0,
  lastDropsClaim: null
}
```

---

## 8. Popup (UI)

Thème sombre, accents violet Twitch. Inspiré de l'ancienne extension, épuré.

```
┌────────────────────────────────────────────┐
│ [logo]  Twitch Auto              [ On ●——]  │
├────────────────────────────────────────────┤
│  Réclamé via l'extension :                  │
│   🪙  1 171 270        dernier : il y a 3 j │  (cyan)
│   🎁  5 921            dernier : il y a 1 h │  (doré)
├────────────────────────────────────────────┤
│  Réglages                                   │
│   [✓] Points de chaîne   [✓] Drops          │
│   [✓] Reload auto        [✓] Qualité mini   │
│   [✓] Anti "Toujours là" [✓] Mute fond      │
│   [✓] Notifications                          │
├────────────────────────────────────────────┤
│   [ Ouvrir mon inventaire de drops ]        │
│   v1.0.0          ⟲ réinitialiser compteurs │
└────────────────────────────────────────────┘
```

- Palette : fond `#18181b`, surfaces `#1f1f23`, violet `#9147ff`, points en cyan `#00e0c7`, drops en doré `#ffc83d`, texte `#efeff1`.
- Le toggle général grise visuellement les toggles de fonction quand off.
- "Ouvrir mon inventaire" ouvre `https://www.twitch.tv/drops/inventory`.
- Les "dernier : il y a X" sont calculés en temps relatif depuis les timestamps.

---

## 9. Logo et icônes

- Direction validée : **coffre blanc + éclair doré** sur carré arrondi violet (`#9147ff` -> `#772ce8`).
- Source : `icons/logo.svg` (déjà prototypé et validé).
- Génération des PNG 16/32/48/128 via Chrome headless (déjà disponible sur la machine) ou tout outil de rasterisation au moment de l'implémentation.

---

## 10. Permissions (manifest)

```json
{
  "permissions": ["storage", "notifications", "tabs"],
  "host_permissions": [
    "https://www.twitch.tv/*",
    "https://<domaine-giw-site-web>/*"
  ]
}
```

- `storage` : réglages + compteurs.
- `notifications` : alertes desktop.
- `tabs` : gestion mute/qualité selon la visibilité de l'onglet.
- `host_permissions` Twitch : restreint à Twitch pour les content scripts.
- `host_permissions` giw-site-web : autorise le `fetch` du service worker vers l'endpoint `log-error` (couche email, section 11). Domaine exact à confirmer à l'implémentation.

---

## 11. Gestion des erreurs et capture

> Décision validée le 2026-06-13 : logs + diagnostic popup + email via endpoint existant.

Cette extension est **100% locale et sans backend** : le pattern email/SMTP habituel (qui exige un serveur) ne tourne pas dans l'extension elle-même. On respecte malgré tout la règle globale "emails d'alerte erreur" en déléguant l'envoi à un endpoint déjà existant. Approche retenue, 3 couches :

1. **Logs console** clairs et préfixés (`[TwitchAuto]`) pour chaque action et chaque échec de sélecteur.
2. **Dernière erreur visible dans le popup** (petite zone "diagnostic") pour repérer vite quand un sélecteur casse.
3. **Email via endpoint existant** : le service worker `POST` les erreurs vers l'endpoint `log-error` déjà en place sur `giw-site-web`, qui se charge d'envoyer l'email habituel à `vguyon.dev@hotmail.com`.

Détails de la couche email :
- **Centralisée dans le background** (service worker) : les content scripts remontent leurs erreurs par message, le background fait le `fetch` (un seul point de sortie réseau).
- **Throttling anti-spam** : 1 envoi max par erreur identique / heure (clé = message + module), aligné sur le pattern de référence.
- **Payload** : message, module/feature, URL Twitch, user-agent, version extension, timestamp.
- **Pré-requis implémentation (à confirmer)** :
  - URL exacte de l'endpoint `log-error` de `giw-site-web` (voir `memory/error-email-alerts.md`).
  - L'endpoint doit accepter les requêtes de l'extension : ajouter son domaine aux `host_permissions` du manifest (cf. section 10) et gérer le CORS côté serveur (origin de type `chrome-extension://<id>`).
- Chaque module reste **isolé en try/catch** : un module qui casse n'arrête jamais les autres et son erreur part dans les 3 couches.

---

## 12. Stratégie de tests

- **Test manuel principal** : charger l'extension non empaquetée dans Chrome, ouvrir Twitch, vérifier chaque module (points, drops sur l'inventaire, reload simulé, qualité, anti-AFK, mute, notifications, compteurs popup).
- **Robustesse sélecteurs** : un petit script de console (fourni dans le README) qui teste si chaque liste de candidats trouve bien sa cible sur la page courante -> facilite la maintenance.
- Pas de framework de test automatisé (extension DOM-dépendante, ROI faible pour un outil perso local).

---

## 13. Installation (local)

1. `chrome://extensions`
2. Activer le **Mode développeur** (en haut à droite).
3. "Charger l'extension non empaquetée" -> sélectionner le dossier `twitch-auto/`.
4. Épingler l'icône, ouvrir Twitch, c'est actif.
5. Après une modif de code : revenir sur `chrome://extensions` et cliquer le bouton recharger de l'extension.

Le README documentera aussi **comment réparer un sélecteur cassé** (où regarder dans `selectors.js`, comment trouver le nouveau `data-a-target`/`aria-label` via l'inspecteur).

---

## 14. Risque CGU (note honnête)

L'auto-claim de points/drops est dans une zone grise des CGU Twitch (l'automatisation est techniquement déconseillée). En usage personnel et en approche DOM, le risque observé de bannissement est très faible, mais il n'existe aucune garantie. Décision assumée par l'utilisateur.

---

## 15. Maintenance prévue

- `selectors.js` = point d'entrée unique des correctifs quand Twitch change.
- Versionner (`v1.0.0`...) et tenir un court CHANGELOG dans le README.
- Re-tester via le script de diagnostic après chaque changement visible de l'UI Twitch.
