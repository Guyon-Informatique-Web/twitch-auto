# Propositions en réserve

Pistes montrées en maquette le 6 octobre 2026 et **non retenues** pour la 1.13. Elles ont déjà été pensées et chiffrées : on peut les reprendre telles quelles si le besoin revient. Maquette interactive (privée) : https://claude.ai/artifact/TqNJhe2ZunJR1J4W8UEvQr

| Proposition | Ce que ça change | Intérêt | Effort |
|---|---|---|---|
| **Badge utile sur l'icône** | À la place de « on » : les minutes avant le prochain drop (« 17m »), et le nombre d'alertes en orange quand un onglet est figé, hors ligne ou à recharger. | Fort | S |
| **En-tête fixe, hauteur stable** | En-tête et onglets restent visibles quand on fait défiler (Stats dépasse 1 000 px avec 3 campagnes), le popup ne change plus de hauteur d'un onglet à l'autre, bandeau « Extension coupée » quand l'interrupteur général est éteint. | Moyen | XS |
| **Réglages en sections** | Trois sections (Collecte, Onglets en arrière-plan, Alertes et bascule), interrupteurs au lieu de cases, description visible de chaque fonction au lieu d'une infobulle, libellés tout en français (Rechargement auto, Son coupé en fond, Bascule auto). | Moyen | S |
| **Carte « Prochain drop » enrichie** | Le jeu dans le surtitre, la campagne et son avancement (1/4) sous le nom, l'heure d'arrivée estimée (« vers 15 h 42 »), l'âge du relevé. | Moyen | S |

## Notes pour la reprise

- **Badge** : `chrome.action.setBadgeText` est déjà appelé par `updateBadge()` dans `src/background/background.js`. Le prochain drop se lit dans `stats.inProgress` (même tri que `TAUtil.sortDropsByEta`). Le nombre d'alertes demande les états des onglets, aujourd'hui calculés par le popup seul.
- **Hauteur stable** : le vrai popup prend la hauteur de son contenu, jusqu'à 600 px. Mesuré le 06/10/2026 : 600, 596, 532 puis 334 px selon l'onglet. Au-delà de 600 px, Chrome élargit le popup à 375 px pour loger la barre verticale, donc pas de défilement horizontal.
- **Libellés français** : les noms actuels (« Reload auto », « Mute fond », « Auto-switch ») sont des choix de Valentin. Ne les changer qu'avec son accord.
