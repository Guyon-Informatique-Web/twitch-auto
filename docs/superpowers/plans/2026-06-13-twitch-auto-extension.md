# Twitch Auto - Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construire une extension Chrome locale (Manifest V3, sans build) qui auto-claim les points de chaîne et les drops Twitch, recharge le player en cas de plantage, et fournit des aides de farming AFK (qualité mini, anti "Toujours là", mute fond, notifications).

**Architecture:** Un content script injecté sur `twitch.tv` (un par onglet) observe le DOM via un `MutationObserver` mutualisé et déclenche des modules indépendants (points, drops, reloader, quality, antiAfk, mute). Tous les sélecteurs vivent dans un seul fichier `selectors.js` pour la maintenance. Un service worker centralise les compteurs, les notifications, le badge et l'envoi d'alertes erreur. Un popup pilote tout. Pas de bundler : les fichiers partagent un namespace global `window.TA` et sont chargés dans l'ordre par le manifest.

**Tech Stack:** JavaScript vanilla, HTML/CSS, Chrome Extensions MV3 (storage, notifications, tabs, MutationObserver). Tests des fonctions pures via Node + `assert`. Rasterisation des icônes via Chrome headless.

**Notes de méthode :**
- Pas de framework de test (spec validé). TDD réel sur les fonctions pures (`src/shared/util.js`) via `node test/util.test.js`. Vérification manuelle dans Chrome pour le DOM.
- Tout le code partagé entre fichiers passe par `window.TA` (content) ou `self.TAUtil` / `window.TAUtil` (util pur).
- Typographie : jamais de tiret long, uniquement le tiret simple.
- Commits fréquents (un par tâche).

**Pré-requis à confirmer avec Valentin (non bloquant) :**
- URL exacte de l'endpoint `log-error` de `giw-site-web` (couche email d'alerte). Par défaut configurable dans le popup/settings ; si vide, on ne POST pas (logs + diagnostic restent actifs).

---

### Task 1: Scaffold (manifest + arborescence) et chargement à blanc

**Files:**
- Create: `twitch-auto/manifest.json`
- Create: `twitch-auto/.gitignore`

- [ ] **Step 1: Créer le manifest**

`twitch-auto/manifest.json` :

```json
{
  "manifest_version": 3,
  "name": "Twitch Auto",
  "version": "1.0.0",
  "description": "Auto-claim points de chaine et drops Twitch, reload auto et aides de farming AFK. Usage local.",
  "icons": {
    "16": "icons/icon-16.png",
    "32": "icons/icon-32.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png"
  },
  "permissions": ["storage", "notifications", "tabs"],
  "host_permissions": ["https://www.twitch.tv/*"],
  "background": {
    "service_worker": "src/background/background.js"
  },
  "content_scripts": [
    {
      "matches": ["https://www.twitch.tv/*"],
      "js": [
        "src/shared/util.js",
        "src/content/selectors.js",
        "src/content/observer.js",
        "src/content/log.js",
        "src/content/modules/points.js",
        "src/content/modules/drops.js",
        "src/content/modules/reloader.js",
        "src/content/modules/quality.js",
        "src/content/modules/antiAfk.js",
        "src/content/modules/mute.js",
        "src/content/content.js"
      ],
      "run_at": "document_start"
    }
  ],
  "action": {
    "default_popup": "src/popup/popup.html",
    "default_icon": { "16": "icons/icon-16.png", "32": "icons/icon-32.png" },
    "default_title": "Twitch Auto"
  }
}
```

- [ ] **Step 2: .gitignore (ignorer les artefacts temporaires)**

`twitch-auto/.gitignore` :

```
*.zip
.DS_Store
```

- [ ] **Step 3: Vérifier (manuel, Chrome)**

À ce stade les fichiers référencés n'existent pas encore ; ce step sert juste à valider le JSON.
Run: `node -e "JSON.parse(require('fs').readFileSync('twitch-auto/manifest.json','utf8')); console.log('manifest JSON valide')"`
Expected: `manifest JSON valide`

- [ ] **Step 4: Commit**

```bash
git add twitch-auto/manifest.json twitch-auto/.gitignore
git commit -m "feat(twitch-auto): scaffold manifest MV3 et gitignore"
```

---

### Task 2: Logo SVG + génération des icônes PNG

**Files:**
- Create: `twitch-auto/icons/logo.svg`
- Create: `twitch-auto/tools/render-icons.sh`
- Generated: `twitch-auto/icons/icon-16.png`, `icon-32.png`, `icon-48.png`, `icon-128.png`

- [ ] **Step 1: Créer le logo SVG (validé : coffre + éclair)**

`twitch-auto/icons/logo.svg` :

```xml
<svg width="128" height="128" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#9d57ff"/>
      <stop offset="1" stop-color="#772ce8"/>
    </linearGradient>
  </defs>
  <rect x="2" y="2" width="124" height="124" rx="30" fill="url(#bg)"/>
  <g stroke="#5a1fc0" stroke-width="3" stroke-linejoin="round">
    <path d="M30 52 Q30 36 46 36 H82 Q98 36 98 52 V58 H30 Z" fill="#ffffff"/>
    <path d="M30 58 H98 V92 Q98 96 94 96 H34 Q30 96 30 92 Z" fill="#ffffff"/>
    <rect x="28" y="56" width="72" height="4" rx="2" fill="#cdb8ff" stroke="none"/>
  </g>
  <path d="M70 40 L48 72 H62 L58 100 L84 64 H68 Z"
        fill="#ffd23f" stroke="#5a1fc0" stroke-width="3.5" stroke-linejoin="round"/>
</svg>
```

- [ ] **Step 2: Script de rasterisation via Chrome headless**

`twitch-auto/tools/render-icons.sh` :

```bash
#!/usr/bin/env bash
# Genere les PNG d'icone a partir de icons/logo.svg via Chrome headless.
set -e
cd "$(dirname "$0")/.."
for size in 16 32 48 128; do
  cat > /tmp/ta-icon.html <<HTML
<!doctype html><meta charset="utf-8">
<style>html,body{margin:0;padding:0}img{display:block}</style>
<img src="file://$PWD/icons/logo.svg" width="$size" height="$size">
HTML
  google-chrome --headless=new --disable-gpu --no-sandbox --hide-scrollbars \
    --default-background-color=00000000 \
    --window-size=$size,$size \
    --screenshot=icons/icon-$size.png "file:///tmp/ta-icon.html"
done
echo "icones generees"
```

- [ ] **Step 3: Générer les icônes**

Run:
```bash
chmod +x twitch-auto/tools/render-icons.sh && twitch-auto/tools/render-icons.sh
```
Expected: `icones generees` puis 4 fichiers PNG dans `twitch-auto/icons/`.

- [ ] **Step 4: Vérifier les tailles**

Run: `cd twitch-auto && ls -la icons/*.png && file icons/icon-16.png`
Expected: 4 PNG présents, `icon-16.png` rapporté comme `PNG image data, 16 x 16`.

- [ ] **Step 5: Commit**

```bash
git add twitch-auto/icons/logo.svg twitch-auto/tools/render-icons.sh twitch-auto/icons/*.png
git commit -m "feat(twitch-auto): logo SVG et icones PNG 16/32/48/128"
```

---

### Task 3: Fonctions pures partagées + tests Node (TDD)

**Files:**
- Create: `twitch-auto/src/shared/util.js`
- Test: `twitch-auto/test/util.test.js`

- [ ] **Step 1: Écrire le test qui échoue**

`twitch-auto/test/util.test.js` :

```js
const assert = require('assert');
const { formatRelativeTime, shouldReload, makeThrottle } = require('../src/shared/util.js');

// formatRelativeTime(ts, now)
assert.strictEqual(formatRelativeTime(null, 1000), 'jamais');
assert.strictEqual(formatRelativeTime(1000, 1000 + 30 * 1000), 'a l instant');
assert.strictEqual(formatRelativeTime(0, 5 * 60 * 1000), 'il y a 5 min');
assert.strictEqual(formatRelativeTime(0, 3 * 60 * 60 * 1000), 'il y a 3 h');
assert.strictEqual(formatRelativeTime(0, 2 * 24 * 60 * 60 * 1000), 'il y a 2 j');

// shouldReload(history, now, maxN, windowMs)
assert.strictEqual(shouldReload([], 100, 5, 1000), true);
assert.strictEqual(shouldReload([0, 1, 2, 3, 4], 100, 5, 1000), false);
assert.strictEqual(shouldReload([0, 1, 2, 3, 4], 2000, 5, 1000), true);

// makeThrottle(windowMs) -> allow(key, now)
const t = makeThrottle(1000);
assert.strictEqual(t('a', 0), true);
assert.strictEqual(t('a', 500), false);
assert.strictEqual(t('a', 1500), true);
assert.strictEqual(t('b', 1500), true);

console.log('OK util');
```

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

Run: `cd twitch-auto && node test/util.test.js`
Expected: FAIL (`Cannot find module '../src/shared/util.js'`).

- [ ] **Step 3: Écrire l'implémentation**

`twitch-auto/src/shared/util.js` :

```js
// Fonctions pures partagees entre service worker, popup et content scripts.
// Aucun acces DOM/Chrome ici -> testable en Node.
(function (root) {
  // Temps relatif en francais a partir d'un timestamp (ms) et de "maintenant".
  function formatRelativeTime(ts, now) {
    if (!ts) return 'jamais';
    const s = Math.max(0, Math.floor((now - ts) / 1000));
    if (s < 60) return 'a l instant';
    const m = Math.floor(s / 60);
    if (m < 60) return `il y a ${m} min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `il y a ${h} h`;
    const j = Math.floor(h / 24);
    return `il y a ${j} j`;
  }

  // Autorise un reload tant qu'on n'a pas depasse maxN reloads dans la fenetre.
  function shouldReload(history, now, maxN, windowMs) {
    const recent = history.filter((t) => now - t < windowMs);
    return recent.length < maxN;
  }

  // Throttle par cle : allow(key, now) renvoie true au plus une fois par fenetre.
  function makeThrottle(windowMs) {
    const seen = new Map();
    return function allow(key, now) {
      const last = seen.get(key) || 0;
      if (now - last < windowMs) return false;
      seen.set(key, now);
      return true;
    };
  }

  const api = { formatRelativeTime, shouldReload, makeThrottle };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TAUtil = api;
})(typeof self !== 'undefined' ? self : this);
```

- [ ] **Step 4: Lancer le test, vérifier qu'il passe**

Run: `cd twitch-auto && node test/util.test.js`
Expected: `OK util`

- [ ] **Step 5: Commit**

```bash
git add twitch-auto/src/shared/util.js twitch-auto/test/util.test.js
git commit -m "feat(twitch-auto): util pur (temps relatif, garde reload, throttle) + tests"
```

---

### Task 4: selectors.js (le fichier de maintenance)

**Files:**
- Create: `twitch-auto/src/content/selectors.js`

- [ ] **Step 1: Écrire les sélecteurs**

`twitch-auto/src/content/selectors.js` :

```js
// SOURCE UNIQUE de tous les selecteurs/textes Twitch.
// Quand Twitch casse l'extension, c'est ICI qu'on corrige.
// Regle : data-test-selector / data-a-target / aria-label / texte. JAMAIS les classes CSS aleatoires.
window.TA = window.TA || {};
TA.selectors = {
  // Coffre bonus de points de chaine (dans le chat)
  pointsClaim: [
    '[data-test-selector="community-points-claim"]',
    '.claimable-bonus button',
    '.claimable-bonus',
    'button[aria-label*="Claim" i]',
    'button[aria-label*="Réclamer" i]'
  ],

  // Bouton de reclamation d'un drop
  dropClaim: [
    '[data-test-selector="DropsCampaignInProgressRewardPresentation-claim-button"]',
    'button[data-a-target="drops-claim-button"]'
  ],
  // Indices texte pour la page inventaire (fallback)
  dropClaimTextHints: ['claim now', 'claim', 'réclamer'],

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
```

- [ ] **Step 2: Vérifier la syntaxe**

Run: `cd twitch-auto && node --check src/content/selectors.js && echo "selectors OK"`
Expected: `selectors OK`

- [ ] **Step 3: Commit**

```bash
git add twitch-auto/src/content/selectors.js
git commit -m "feat(twitch-auto): selectors.js centralise (points, drops, erreurs, gates)"
```

---

### Task 5: observer.js (MutationObserver mutualisé + helpers DOM)

**Files:**
- Create: `twitch-auto/src/content/observer.js`

- [ ] **Step 1: Écrire le helper DOM**

`twitch-auto/src/content/observer.js` :

```js
// Helpers DOM + MutationObserver unique partage par tous les modules.
window.TA = window.TA || {};
TA.dom = (function () {
  // Element visible et cliquable ?
  function isClickable(el) {
    if (!el || el.disabled) return false;
    if (el.offsetParent === null) return false;
    const cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden';
  }

  // Premier element trouve parmi une liste de selecteurs candidats.
  function findFirst(candidates, root) {
    root = root || document;
    for (const sel of candidates) {
      try {
        const el = root.querySelector(sel);
        if (el) return el;
      } catch (e) { /* selecteur invalide -> on ignore */ }
    }
    return null;
  }

  // Recherche par texte/aria-label (fallback robuste).
  function findByText(tag, hints, root) {
    root = root || document;
    const low = hints.map((h) => h.toLowerCase());
    const els = Array.from(root.querySelectorAll(tag));
    return els.find((el) => {
      const t = (el.textContent || '').trim().toLowerCase();
      const a = (el.getAttribute('aria-label') || '').toLowerCase();
      return low.some((h) => t.includes(h) || a.includes(h));
    }) || null;
  }

  function click(el) {
    if (!isClickable(el)) return false;
    el.click();
    return true;
  }

  // Observation mutualisee avec debounce.
  let observer = null;
  let timer = null;
  const listeners = new Set();

  function schedule() {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      for (const cb of listeners) {
        try { cb(); } catch (e) { if (TA.log) TA.log.error('observer', e); }
      }
    }, 150);
  }

  function subscribe(cb) {
    listeners.add(cb);
    try { cb(); } catch (e) { if (TA.log) TA.log.error('observer', e); }
    return () => listeners.delete(cb);
  }

  function start() {
    if (observer) return;
    observer = new MutationObserver(schedule);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-label', 'disabled', 'class']
    });
  }

  function stop() {
    if (observer) { observer.disconnect(); observer = null; }
  }

  return { isClickable, findFirst, findByText, click, subscribe, start, stop };
})();
```

- [ ] **Step 2: Vérifier la syntaxe**

Run: `cd twitch-auto && node --check src/content/observer.js && echo "observer OK"`
Expected: `observer OK`

- [ ] **Step 3: Commit**

```bash
git add twitch-auto/src/content/observer.js
git commit -m "feat(twitch-auto): observer mutualise + helpers DOM (findFirst, findByText, click)"
```

---

### Task 6: log.js (logs + remontée erreurs/claims au background)

**Files:**
- Create: `twitch-auto/src/content/log.js`

- [ ] **Step 1: Écrire le logger**

`twitch-auto/src/content/log.js` :

```js
// Logger prefixe + remontee des erreurs et des claims au service worker.
window.TA = window.TA || {};
TA.log = {
  info(module, ...a) { console.log(`[TwitchAuto][${module}]`, ...a); },
  warn(module, ...a) { console.warn(`[TwitchAuto][${module}]`, ...a); },
  error(module, err) {
    const message = err && err.message ? err.message : String(err);
    console.error(`[TwitchAuto][${module}]`, err);
    try { chrome.runtime.sendMessage({ type: 'error', module, message }); } catch (e) { /* SW endormi */ }
  }
};

// Signale un claim au background (points ou drop).
TA.report = function (kind, payload) {
  try { chrome.runtime.sendMessage({ type: 'claim', kind, ...(payload || {}) }); } catch (e) { /* SW endormi */ }
};
```

- [ ] **Step 2: Vérifier la syntaxe**

Run: `cd twitch-auto && node --check src/content/log.js && echo "log OK"`
Expected: `log OK`

- [ ] **Step 3: Commit**

```bash
git add twitch-auto/src/content/log.js
git commit -m "feat(twitch-auto): logger prefixe + remontee erreurs/claims au SW"
```

---

### Task 7: Service worker (background.js)

**Files:**
- Create: `twitch-auto/src/background/background.js`

- [ ] **Step 1: Écrire le service worker**

`twitch-auto/src/background/background.js` :

```js
// Service worker : reglages par defaut, compteurs, notifications, badge, alertes erreur.
importScripts('../shared/util.js');

const DEFAULT_SETTINGS = {
  enabled: true,
  points: true,
  drops: true,
  reload: true,
  lowQuality: true,
  antiAfk: true,
  muteBackground: true,
  notifications: true,
  errorEndpoint: '' // URL log-error de giw-site-web (a renseigner ; vide = pas d'envoi)
};
const DEFAULT_STATS = {
  pointsClaimed: 0,
  pointsValue: 0,
  lastPointsClaim: null,
  dropsClaimed: 0,
  lastDropsClaim: null
};
const POINTS_NOTIFY_STEP = 5000;            // notif points tous les 5000 pts cumules
const errorThrottle = TAUtil.makeThrottle(60 * 60 * 1000); // 1 envoi / erreur / heure

// Initialisation des reglages/stats sans ecraser l'existant.
chrome.runtime.onInstalled.addListener(async () => {
  const cur = await chrome.storage.local.get(['settings', 'stats']);
  await chrome.storage.local.set({
    settings: { ...DEFAULT_SETTINGS, ...(cur.settings || {}) },
    stats: { ...DEFAULT_STATS, ...(cur.stats || {}) }
  });
  updateBadge();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.settings) updateBadge();
});

async function updateBadge() {
  const { settings } = await chrome.storage.local.get('settings');
  const on = settings ? settings.enabled : true;
  chrome.action.setBadgeText({ text: on ? 'on' : 'off' });
  chrome.action.setBadgeBackgroundColor({ color: on ? '#00b86b' : '#555555' });
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || !msg.type) return;
  if (msg.type === 'claim') handleClaim(msg);
  else if (msg.type === 'error') handleError(msg, sender);
  return false;
});

async function handleClaim(msg) {
  const data = await chrome.storage.local.get(['stats', 'settings']);
  const s = { ...DEFAULT_STATS, ...(data.stats || {}) };
  const settings = data.settings || {};
  const now = Date.now();

  if (msg.kind === 'points') {
    const before = s.pointsValue;
    s.pointsClaimed += 1;
    s.pointsValue += (msg.amount || 0);
    s.lastPointsClaim = now;
    if (settings.notifications) {
      const crossed = Math.floor(s.pointsValue / POINTS_NOTIFY_STEP) > Math.floor(before / POINTS_NOTIFY_STEP);
      if (crossed) notify('Points reclames', `${s.pointsValue} points cumules via Twitch Auto`);
    }
  } else if (msg.kind === 'drop') {
    s.dropsClaimed += 1;
    s.lastDropsClaim = now;
    if (settings.notifications) notify('Drop reclame', msg.name ? `Drop: ${msg.name}` : 'Un drop a ete reclame');
  }
  await chrome.storage.local.set({ stats: s });
}

function notify(title, message) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
    title,
    message
  });
}

async function handleError(msg, sender) {
  console.error('[TwitchAuto] erreur signalee:', msg.module, msg.message);
  await chrome.storage.local.set({ lastError: { module: msg.module, message: msg.message, ts: Date.now() } });

  const { settings } = await chrome.storage.local.get('settings');
  const endpoint = settings && settings.errorEndpoint;
  if (!endpoint) return;
  if (!errorThrottle(`${msg.module}:${msg.message}`, Date.now())) return;

  try {
    await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'twitch-auto-extension',
        module: msg.module,
        message: msg.message,
        url: sender && sender.url,
        userAgent: navigator.userAgent,
        version: chrome.runtime.getManifest().version,
        ts: new Date().toISOString()
      })
    });
  } catch (e) {
    console.error('[TwitchAuto] echec POST erreur:', e);
  }
}
```

- [ ] **Step 2: Vérifier la syntaxe**

Run: `cd twitch-auto && node --check src/background/background.js && echo "background OK"`
Expected: `background OK` (note : `importScripts`/`chrome` ne sont pas résolus par `--check`, mais la syntaxe est validée.)

- [ ] **Step 3: Commit**

```bash
git add twitch-auto/src/background/background.js
git commit -m "feat(twitch-auto): service worker (settings, compteurs, notifs, badge, alertes erreur)"
```

---

### Task 8: content.js (bootstrap, registre de modules, on/off live)

**Files:**
- Create: `twitch-auto/src/content/content.js`

- [ ] **Step 1: Écrire le bootstrap**

`twitch-auto/src/content/content.js` :

```js
// Point d'entree du content script : lit les reglages, demarre l'observer,
// active/desactive chaque module selon les toggles, et reagit en direct aux changements.
window.TA = window.TA || {};
(function () {
  const registry = TA.modules || (TA.modules = {});
  const active = new Set();
  let settings = null;

  function apply() {
    if (!settings) return;
    const master = settings.enabled;
    for (const id in registry) {
      const mod = registry[id];
      const want = master && settings[mod.settingKey] !== false;
      const isOn = active.has(id);
      try {
        if (want && !isOn) { mod.start(); active.add(id); TA.log.info('core', 'start', id); }
        else if (!want && isOn) { mod.stop(); active.delete(id); TA.log.info('core', 'stop', id); }
      } catch (e) { TA.log.error('core', e); }
    }
  }

  async function init() {
    const data = await chrome.storage.local.get('settings');
    settings = data.settings || { enabled: true };
    TA.settings = settings;
    TA.dom.start();
    apply();
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.settings) {
      settings = changes.settings.newValue || {};
      TA.settings = settings;
      apply();
    }
  });

  init().catch((e) => TA.log.error('core', e));
})();
```

- [ ] **Step 2: Vérifier la syntaxe**

Run: `cd twitch-auto && node --check src/content/content.js && echo "content OK"`
Expected: `content OK`

- [ ] **Step 3: Vérifier le chargement complet dans Chrome (manuel)**

Les modules ne sont pas encore écrits (registre vide), mais l'extension doit charger sans erreur.
1. `chrome://extensions` -> Mode développeur -> "Charger l'extension non empaquetée" -> dossier `twitch-auto/`.
2. Vérifier : aucune erreur rouge sur la carte de l'extension.
3. Ouvrir `https://www.twitch.tv`, ouvrir la console (F12).
Expected: pas d'erreur `[TwitchAuto]`, le service worker est "actif".

- [ ] **Step 4: Commit**

```bash
git add twitch-auto/src/content/content.js
git commit -m "feat(twitch-auto): bootstrap content (registre modules, on/off live)"
```

---

### Task 9: Module points

**Files:**
- Create: `twitch-auto/src/content/modules/points.js`

- [ ] **Step 1: Écrire le module**

`twitch-auto/src/content/modules/points.js` :

```js
// Auto-claim des coffres bonus de points de chaine.
window.TA = window.TA || {};
TA.modules = TA.modules || {};
TA.modules.points = (function () {
  let unsub = null;

  function tick() {
    try {
      const btn = TA.dom.findFirst(TA.selectors.pointsClaim);
      if (TA.dom.click(btn)) {
        // Le bonus de base Twitch est 50 pts ; valeur estimee (le bouton n'expose pas le montant).
        TA.report('points', { amount: 50 });
        TA.log.info('points', 'coffre reclame');
      }
    } catch (e) { TA.log.error('points', e); }
  }

  return {
    id: 'points',
    settingKey: 'points',
    start() { unsub = TA.dom.subscribe(tick); },
    stop() { if (unsub) { unsub(); unsub = null; } }
  };
})();
```

- [ ] **Step 2: Vérifier la syntaxe**

Run: `cd twitch-auto && node --check src/content/modules/points.js && echo "points OK"`
Expected: `points OK`

- [ ] **Step 3: Vérifier dans Chrome (manuel)**

1. Recharger l'extension (`chrome://extensions` -> bouton recharger).
2. Ouvrir un live Twitch, attendre l'apparition du coffre bonus dans le chat (ou cliquer rapidement avant l'auto-claim pour observer).
3. Console : message `[TwitchAuto][points] coffre reclame`. Le popup (Task 16) montrera le compteur ; pour l'instant vérifier via : `chrome.storage.local.get('stats', console.log)` dans la console du service worker.
Expected: `pointsClaimed` incrémenté.
Note: si rien ne se claim, ouvrir le script de diagnostic (Task 17) pour vérifier le sélecteur `pointsClaim`.

- [ ] **Step 4: Commit**

```bash
git add twitch-auto/src/content/modules/points.js
git commit -m "feat(twitch-auto): module points (auto-claim coffre bonus)"
```

---

### Task 10: Module drops

**Files:**
- Create: `twitch-auto/src/content/modules/drops.js`

- [ ] **Step 1: Écrire le module**

`twitch-auto/src/content/modules/drops.js` :

```js
// Auto-claim des drops : par selecteur, fallback par texte sur la page inventaire.
window.TA = window.TA || {};
TA.modules = TA.modules || {};
TA.modules.drops = (function () {
  let unsub = null;
  const claimed = new WeakSet(); // evite de recliquer le meme bouton

  function tick() {
    try {
      let btn = TA.dom.findFirst(TA.selectors.dropClaim);
      if (!btn) btn = TA.dom.findByText('button', TA.selectors.dropClaimTextHints);
      if (btn && !claimed.has(btn) && TA.dom.click(btn)) {
        claimed.add(btn);
        TA.report('drop', {});
        TA.log.info('drops', 'drop reclame');
      }
    } catch (e) { TA.log.error('drops', e); }
  }

  return {
    id: 'drops',
    settingKey: 'drops',
    start() { unsub = TA.dom.subscribe(tick); },
    stop() { if (unsub) { unsub(); unsub = null; } }
  };
})();
```

- [ ] **Step 2: Vérifier la syntaxe**

Run: `cd twitch-auto && node --check src/content/modules/drops.js && echo "drops OK"`
Expected: `drops OK`

- [ ] **Step 3: Vérifier dans Chrome (manuel)**

1. Recharger l'extension.
2. Ouvrir `https://www.twitch.tv/drops/inventory` avec au moins un drop réclamable.
3. Console : `[TwitchAuto][drops] drop reclame` et le bouton "Claim" se déclenche tout seul.
Expected: `dropsClaimed` incrémenté dans `stats`.
Note: si le bouton n'est pas trouvé, ajuster `dropClaim`/`dropClaimTextHints` dans `selectors.js` via le diagnostic.

- [ ] **Step 4: Commit**

```bash
git add twitch-auto/src/content/modules/drops.js
git commit -m "feat(twitch-auto): module drops (auto-claim inventaire + fallback texte)"
```

---

### Task 11: Module reloader (avec garde anti-boucle)

**Files:**
- Create: `twitch-auto/src/content/modules/reloader.js`

- [ ] **Step 1: Écrire le module**

`twitch-auto/src/content/modules/reloader.js` :

```js
// Recharge la page quand le player affiche une erreur TRANSITOIRE.
// Garde-fous : max 5 reloads / 10 min, et jamais sur un etat non transitoire.
window.TA = window.TA || {};
TA.modules = TA.modules || {};
TA.modules.reloader = (function () {
  const KEY = 'ta_reload_history';
  const MAX = 5;
  const WINDOW = 10 * 60 * 1000;
  const DELAY = 5000;
  let unsub = null;
  let pending = false;

  function history() {
    try { return JSON.parse(sessionStorage.getItem(KEY) || '[]'); } catch (e) { return []; }
  }
  function record(now) {
    const h = history().filter((t) => now - t < WINDOW);
    h.push(now);
    sessionStorage.setItem(KEY, JSON.stringify(h));
  }
  function hasTransientError() {
    const root = TA.dom.findFirst(TA.selectors.playerOverlay) ||
      document.querySelector('[data-a-target="video-player"]');
    if (!root) return false;
    const txt = root.innerText || '';
    if (TA.selectors.reloadExcludePatterns.some((re) => re.test(txt))) return false;
    return TA.selectors.reloadErrorPatterns.some((re) => re.test(txt));
  }

  function tick() {
    try {
      if (pending || !hasTransientError()) return;
      const now = Date.now();
      if (!TAUtil.shouldReload(history(), now, MAX, WINDOW)) {
        TA.log.warn('reloader', 'limite de reloads atteinte, on arrete');
        return;
      }
      pending = true;
      record(now);
      TA.log.info('reloader', `erreur player detectee, reload dans ${DELAY / 1000}s`);
      setTimeout(() => location.reload(), DELAY);
    } catch (e) { TA.log.error('reloader', e); }
  }

  return {
    id: 'reloader',
    settingKey: 'reload',
    start() { unsub = TA.dom.subscribe(tick); },
    stop() { if (unsub) { unsub(); unsub = null; } }
  };
})();
```

- [ ] **Step 2: Vérifier la syntaxe**

Run: `cd twitch-auto && node --check src/content/modules/reloader.js && echo "reloader OK"`
Expected: `reloader OK`

- [ ] **Step 3: Vérifier dans Chrome (manuel)**

La logique de comptage est déjà testée en Node (Task 3). Test d'intégration :
1. Recharger l'extension, ouvrir un live.
2. Simuler une erreur : dans la console, injecter un faux overlay :
   `document.body.insertAdjacentHTML('beforeend','<div data-a-target="player-overlay">Error #2000</div>')`
3. Console : `[TwitchAuto][reloader] erreur player detectee, reload dans 5s`, puis la page recharge.
Expected: reload déclenché une fois ; au 6e en 10 min, message "limite de reloads atteinte".

- [ ] **Step 4: Commit**

```bash
git add twitch-auto/src/content/modules/reloader.js
git commit -m "feat(twitch-auto): module reloader (erreurs transitoires + garde anti-boucle)"
```

---

### Task 12: Module quality (qualité mini en arrière-plan)

**Files:**
- Create: `twitch-auto/src/content/modules/quality.js`

- [ ] **Step 1: Écrire le module**

`twitch-auto/src/content/modules/quality.js` :

```js
// Force la qualite la plus basse quand l'onglet est en arriere-plan (farming AFK).
// Methode best-effort via localStorage lu par le player Twitch.
window.TA = window.TA || {};
TA.modules = TA.modules || {};
TA.modules.quality = (function () {
  const LOW = '160p30';

  function setLow() {
    try {
      localStorage.setItem('video-quality', JSON.stringify({ default: LOW }));
      TA.log.info('quality', 'qualite forcee a 160p (onglet en fond)');
    } catch (e) { TA.log.error('quality', e); }
  }

  function onVis() {
    if (document.hidden) setLow();
  }

  return {
    id: 'quality',
    settingKey: 'lowQuality',
    start() {
      if (document.hidden) setLow();
      document.addEventListener('visibilitychange', onVis);
    },
    stop() { document.removeEventListener('visibilitychange', onVis); }
  };
})();
```

- [ ] **Step 2: Vérifier la syntaxe**

Run: `cd twitch-auto && node --check src/content/modules/quality.js && echo "quality OK"`
Expected: `quality OK`

- [ ] **Step 3: Vérifier dans Chrome (manuel)**

1. Recharger l'extension, ouvrir un live, passer l'onglet en arrière-plan (changer d'onglet).
2. Revenir, recharger la page du live : elle démarre en 160p.
3. Console : `[TwitchAuto][quality] qualite forcee a 160p`.
Expected: clé `video-quality` dans localStorage = `{"default":"160p30"}`.
Note: best-effort, peut nécessiter un reload pour prendre effet ; module le plus susceptible de maintenance.

- [ ] **Step 4: Commit**

```bash
git add twitch-auto/src/content/modules/quality.js
git commit -m "feat(twitch-auto): module quality (160p auto en arriere-plan)"
```

---

### Task 13: Module antiAfk

**Files:**
- Create: `twitch-auto/src/content/modules/antiAfk.js`

- [ ] **Step 1: Écrire le module**

`twitch-auto/src/content/modules/antiAfk.js` :

```js
// Clique automatiquement les gates contenu mature et les prompts "Toujours la ?".
window.TA = window.TA || {};
TA.modules = TA.modules || {};
TA.modules.antiAfk = (function () {
  let unsub = null;

  function tick() {
    try {
      const mature = TA.dom.findFirst(TA.selectors.matureAccept);
      if (TA.dom.click(mature)) {
        TA.log.info('antiAfk', 'gate contenu mature accepte');
        return;
      }
      const still = TA.dom.findByText('button', TA.selectors.stillWatchingHints);
      if (TA.dom.click(still)) {
        TA.log.info('antiAfk', 'prompt "toujours la" clique');
      }
    } catch (e) { TA.log.error('antiAfk', e); }
  }

  return {
    id: 'antiAfk',
    settingKey: 'antiAfk',
    start() { unsub = TA.dom.subscribe(tick); },
    stop() { if (unsub) { unsub(); unsub = null; } }
  };
})();
```

- [ ] **Step 2: Vérifier la syntaxe**

Run: `cd twitch-auto && node --check src/content/modules/antiAfk.js && echo "antiAfk OK"`
Expected: `antiAfk OK`

- [ ] **Step 3: Vérifier dans Chrome (manuel)**

1. Recharger l'extension, ouvrir une chaîne marquée contenu mature.
2. Le bouton "Démarrer"/"Start Watching" est cliqué automatiquement.
Expected: `[TwitchAuto][antiAfk] gate contenu mature accepte`, le stream démarre sans intervention.

- [ ] **Step 4: Commit**

```bash
git add twitch-auto/src/content/modules/antiAfk.js
git commit -m "feat(twitch-auto): module antiAfk (gate mature + toujours la)"
```

---

### Task 14: Module mute

**Files:**
- Create: `twitch-auto/src/content/modules/mute.js`

- [ ] **Step 1: Écrire le module**

`twitch-auto/src/content/modules/mute.js` :

```js
// Coupe le son quand l'onglet passe en arriere-plan, le retablit au retour.
window.TA = window.TA || {};
TA.modules = TA.modules || {};
TA.modules.mute = (function () {
  function apply() {
    const hidden = document.hidden;
    document.querySelectorAll('video').forEach((v) => { v.muted = hidden; });
  }

  return {
    id: 'mute',
    settingKey: 'muteBackground',
    start() {
      document.addEventListener('visibilitychange', apply);
      apply();
    },
    stop() {
      document.removeEventListener('visibilitychange', apply);
      document.querySelectorAll('video').forEach((v) => { v.muted = false; });
    }
  };
})();
```

- [ ] **Step 2: Vérifier la syntaxe**

Run: `cd twitch-auto && node --check src/content/modules/mute.js && echo "mute OK"`
Expected: `mute OK`

- [ ] **Step 3: Vérifier dans Chrome (manuel)**

1. Recharger l'extension, ouvrir un live avec du son.
2. Passer sur un autre onglet : le son du live se coupe. Revenir : le son revient.
Expected: `video.muted` suit la visibilité de l'onglet.

- [ ] **Step 4: Commit**

```bash
git add twitch-auto/src/content/modules/mute.js
git commit -m "feat(twitch-auto): module mute (onglets en arriere-plan)"
```

---

### Task 15: Popup - HTML + CSS

**Files:**
- Create: `twitch-auto/src/popup/popup.html`
- Create: `twitch-auto/src/popup/popup.css`

- [ ] **Step 1: Écrire le HTML**

`twitch-auto/src/popup/popup.html` :

```html
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <link rel="stylesheet" href="popup.css">
</head>
<body>
  <header class="head">
    <img src="../../icons/icon-32.png" alt="" width="28" height="28">
    <h1>Twitch Auto</h1>
    <label class="switch" title="Activer / desactiver">
      <input type="checkbox" id="master">
      <span class="slider"></span>
    </label>
  </header>

  <section class="stats">
    <div class="stat">
      <span class="ic">🪙</span>
      <span class="val cyan" id="points-value">0</span>
      <span class="last" id="points-last">jamais</span>
    </div>
    <div class="stat">
      <span class="ic">🎁</span>
      <span class="val gold" id="drops-value">0</span>
      <span class="last" id="drops-last">jamais</span>
    </div>
  </section>

  <section>
    <h2>Reglages</h2>
    <div id="features" class="features"></div>
  </section>

  <p id="diag" class="diag"></p>

  <footer class="foot">
    <button id="open-inventory" class="btn">Ouvrir mon inventaire de drops</button>
    <div class="foot-row">
      <span id="version">v1.0.0</span>
      <button id="reset" class="link">reinitialiser compteurs</button>
    </div>
  </footer>

  <script src="../shared/util.js"></script>
  <script src="popup.js"></script>
</body>
</html>
```

- [ ] **Step 2: Écrire le CSS**

`twitch-auto/src/popup/popup.css` :

```css
:root {
  --bg: #18181b;
  --surface: #1f1f23;
  --purple: #9147ff;
  --cyan: #00e0c7;
  --gold: #ffc83d;
  --text: #efeff1;
  --muted: #adadb8;
}
* { box-sizing: border-box; }
body {
  width: 320px;
  margin: 0;
  font-family: system-ui, "Segoe UI", sans-serif;
  background: var(--bg);
  color: var(--text);
}
.head { display: flex; align-items: center; gap: 10px; padding: 14px 16px; }
.head h1 { font-size: 16px; margin: 0; flex: 1; }
.switch { position: relative; display: inline-block; width: 46px; height: 26px; }
.switch input { display: none; }
.slider {
  position: absolute; inset: 0; cursor: pointer;
  background: #3a3a3d; border-radius: 26px; transition: .2s;
}
.slider::before {
  content: ""; position: absolute; height: 20px; width: 20px; left: 3px; top: 3px;
  background: #fff; border-radius: 50%; transition: .2s;
}
.switch input:checked + .slider { background: var(--purple); }
.switch input:checked + .slider::before { transform: translateX(20px); }

.stats { display: flex; gap: 10px; padding: 0 16px 12px; }
.stat {
  flex: 1; background: var(--surface); border-radius: 10px; padding: 12px;
  display: flex; flex-direction: column; gap: 2px;
}
.stat .ic { font-size: 16px; }
.val { font-size: 22px; font-weight: 700; }
.cyan { color: var(--cyan); }
.gold { color: var(--gold); }
.last { font-size: 11px; color: var(--muted); }

section h2 { font-size: 12px; text-transform: uppercase; color: var(--muted); margin: 0 16px 8px; letter-spacing: .04em; }
.features { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 12px; padding: 0 16px 12px; }
.feature { display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer; }
.feature input { accent-color: var(--purple); width: 16px; height: 16px; }

.diag { color: #ff6b6b; font-size: 11px; margin: 0 16px; min-height: 14px; }

.foot { padding: 8px 16px 16px; }
.btn {
  width: 100%; padding: 9px; border: 0; border-radius: 8px;
  background: var(--purple); color: #fff; font-weight: 600; cursor: pointer;
}
.btn:hover { background: #772ce8; }
.foot-row { display: flex; justify-content: space-between; align-items: center; margin-top: 10px; font-size: 11px; color: var(--muted); }
.link { background: none; border: 0; color: var(--muted); cursor: pointer; text-decoration: underline; font-size: 11px; }
body.off .features { opacity: .4; pointer-events: none; }
```

- [ ] **Step 3: Vérifier (manuel)**

Ouvrir `twitch-auto/src/popup/popup.html` dans Chrome directement pour contrôler le rendu visuel (les compteurs resteront à 0 hors contexte extension).
Expected: header avec toggle, 2 stats, grille de réglages, bouton inventaire, footer.

- [ ] **Step 4: Commit**

```bash
git add twitch-auto/src/popup/popup.html twitch-auto/src/popup/popup.css
git commit -m "feat(twitch-auto): popup HTML + CSS (theme sombre Twitch)"
```

---

### Task 16: Popup - JS

**Files:**
- Create: `twitch-auto/src/popup/popup.js`

- [ ] **Step 1: Écrire le JS du popup**

`twitch-auto/src/popup/popup.js` :

```js
// Pilote du popup : affiche compteurs/reglages, ecrit les toggles, reset, ouvre l'inventaire.
const FEATURES = [
  ['points', 'Points de chaine'],
  ['drops', 'Drops'],
  ['reload', 'Reload auto'],
  ['lowQuality', 'Qualite mini'],
  ['antiAfk', 'Anti "Toujours la"'],
  ['muteBackground', 'Mute fond'],
  ['notifications', 'Notifications']
];
const EMPTY_STATS = { pointsClaimed: 0, pointsValue: 0, lastPointsClaim: null, dropsClaimed: 0, lastDropsClaim: null };

async function load() {
  const { settings = {}, stats = {}, lastError } = await chrome.storage.local.get(['settings', 'stats', 'lastError']);
  const now = Date.now();

  document.getElementById('master').checked = settings.enabled !== false;
  document.body.classList.toggle('off', settings.enabled === false);

  document.getElementById('points-value').textContent = (stats.pointsValue || 0).toLocaleString('fr-FR');
  document.getElementById('points-last').textContent = TAUtil.formatRelativeTime(stats.lastPointsClaim, now);
  document.getElementById('drops-value').textContent = (stats.dropsClaimed || 0).toLocaleString('fr-FR');
  document.getElementById('drops-last').textContent = TAUtil.formatRelativeTime(stats.lastDropsClaim, now);

  const wrap = document.getElementById('features');
  wrap.innerHTML = '';
  FEATURES.forEach(([key, label]) => {
    const row = document.createElement('label');
    row.className = 'feature';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = settings[key] !== false;
    cb.addEventListener('change', () => update(key, cb.checked));
    const span = document.createElement('span');
    span.textContent = label;
    row.append(cb, span);
    wrap.appendChild(row);
  });

  document.getElementById('diag').textContent = lastError
    ? `Derniere erreur (${lastError.module}) : ${lastError.message}`
    : '';
}

async function update(key, val) {
  const { settings = {} } = await chrome.storage.local.get('settings');
  settings[key] = val;
  await chrome.storage.local.set({ settings });
  load();
}

document.getElementById('master').addEventListener('change', (e) => update('enabled', e.target.checked));
document.getElementById('open-inventory').addEventListener('click', () =>
  chrome.tabs.create({ url: 'https://www.twitch.tv/drops/inventory' }));
document.getElementById('reset').addEventListener('click', async () => {
  await chrome.storage.local.set({ stats: { ...EMPTY_STATS } });
  load();
});
document.getElementById('version').textContent = 'v' + chrome.runtime.getManifest().version;

load();
```

- [ ] **Step 2: Vérifier la syntaxe**

Run: `cd twitch-auto && node --check src/popup/popup.js && echo "popup js OK"`
Expected: `popup js OK`

- [ ] **Step 3: Vérifier dans Chrome (manuel)**

1. Recharger l'extension, cliquer l'icône.
2. Basculer le toggle général : les réglages se grisent ; vérifier qu'un live arrête/reprend les claims.
3. Cocher/décocher une fonction : l'effet est immédiat (storage.onChanged).
4. Les compteurs affichent les valeurs réelles et les "dernier : il y a X".
5. "reinitialiser compteurs" remet à 0 ; "Ouvrir mon inventaire" ouvre l'onglet inventaire.
Expected: tout réagit, aucune erreur console.

- [ ] **Step 4: Commit**

```bash
git add twitch-auto/src/popup/popup.js
git commit -m "feat(twitch-auto): popup JS (compteurs, toggles live, reset, inventaire)"
```

---

### Task 17: README (installation + maintenance + diagnostic)

**Files:**
- Create: `twitch-auto/README.md`

- [ ] **Step 1: Écrire le README**

`twitch-auto/README.md` :

````markdown
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
chrome.storage.local.get('settings', ({settings}) => chrome.storage.local.set({settings: {...settings, errorEndpoint: 'https://VOTRE-ENDPOINT/log-error'}}));
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
for (const k of ['pointsClaim','dropClaim','playerOverlay','matureAccept']) {
  const hit = (S[k]||[]).find(s => { try { return document.querySelector(s); } catch(e){ return false; } });
  console.log(k, hit ? 'OK -> ' + hit : 'AUCUN match');
}
```

## Tests

Fonctions pures : `node test/util.test.js` (doit afficher `OK util`).
Le reste se teste manuellement dans Chrome (voir le plan d'implementation).

## Changelog

- v1.0.0 : version initiale (points, drops, reload, quality, antiAfk, mute, notifications, popup).

## Note CGU

L'auto-claim de points/drops est dans une zone grise des CGU Twitch. Approche par clic DOM (risque faible), aucune garantie. Usage assume.
````

- [ ] **Step 2: Vérifier (manuel)**

Run: `cd twitch-auto && grep -cP "\x{2014}|\x{2013}" README.md`
Expected: `0` (aucun tiret long).

- [ ] **Step 3: Commit**

```bash
git add twitch-auto/README.md
git commit -m "docs(twitch-auto): README (install, maintenance selecteurs, diagnostic)"
```

---

### Task 18: Vérification end-to-end + tag de version

**Files:**
- (aucun fichier créé ; validation globale)

- [ ] **Step 1: Vérifier qu'il n'y a aucun tiret long dans le projet**

Run: `cd twitch-auto && grep -rnP "\x{2014}|\x{2013}" . --include="*.js" --include="*.json" --include="*.md" --include="*.css" --include="*.html" | grep -v node_modules; echo "exit:$?"`
Expected: aucune ligne affichée.

- [ ] **Step 2: Re-lancer les tests purs**

Run: `cd twitch-auto && node test/util.test.js`
Expected: `OK util`

- [ ] **Step 3: Checklist manuelle complète dans Chrome**

Charger l'extension propre, puis cocher :
- [ ] Extension charge sans erreur (`chrome://extensions`)
- [ ] Points : coffre bonus réclamé automatiquement (compteur cyan monte)
- [ ] Drops : claim auto sur `/drops/inventory` (compteur doré monte)
- [ ] Reload : faux overlay d'erreur -> reload (et garde anti-boucle au-delà de 5/10min)
- [ ] Qualité : onglet en fond -> 160p au prochain load
- [ ] Anti-AFK : gate mature accepté tout seul
- [ ] Mute : son coupé quand l'onglet passe en fond, rétabli au retour
- [ ] Notifications : notif desktop sur drop / palier de points
- [ ] Popup : toggles live, compteurs, temps relatif, reset, ouvrir inventaire
- [ ] Multi-onglets : 2 lives ouverts -> les deux réclament en parallèle

- [ ] **Step 4: Tag de version**

```bash
git tag twitch-auto-v1.0.0
echo "v1.0.0 taggee"
```

---

## Self-Review (rempli par l'auteur du plan)

**Couverture spec :**
- Points / Drops / Reload : Tasks 9, 10, 11.
- Qualité mini / Anti-AFK / Mute / Notifications : Tasks 12, 13, 14, 7 (notifs).
- Popup complet (toggle + toggles + compteurs) : Tasks 15, 16.
- Logo + icônes : Task 2.
- selectors.js centralisé : Task 4.
- Erreurs (logs + diagnostic popup + email endpoint) : Tasks 6 (remontée), 7 (handleError + POST), 16 (zone diag), 17 (config endpoint).
- Permissions / manifest : Task 1.
- Moments : exclus (non implémentés), conforme au spec.
- Maintenance / README / diagnostic : Task 17.

**Placeholders :** aucun "TBD/TODO" dans le code. Seul point externe = URL `errorEndpoint`, géré proprement (configurable, vide par défaut, pas de POST si vide).

**Cohérence des types/noms :** `settings`/`stats` identiques entre background, content et popup. Clés de réglages (`enabled, points, drops, reload, lowQuality, antiAfk, muteBackground, notifications, errorEndpoint`) cohérentes partout. Chaque module expose `{id, settingKey, start(), stop()}` et `content.js` les pilote via `settingKey`. `TAUtil` (util pur) chargé en content (manifest), background (importScripts) et popup (script tag).
