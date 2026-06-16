// Injecte dans le MONDE DE LA PAGE (world: MAIN) : fait croire a Twitch que l'onglet est
// toujours visible/actif, pour que les Drops progressent meme en arriere-plan (multi-onglets).
// Nos autres modules tournent dans le monde ISOLE et voient, eux, la VRAIE visibilite
// (ce override ne s'applique qu'au monde de la page) -> mute/qualite/anti-pause restent corrects.
(function () {
  try {
    const FALSE = function () { return false; };
    const VISIBLE = function () { return 'visible'; };
    Object.defineProperty(document, 'hidden', { get: FALSE, configurable: true });
    Object.defineProperty(document, 'webkitHidden', { get: FALSE, configurable: true });
    Object.defineProperty(document, 'visibilityState', { get: VISIBLE, configurable: true });
    Object.defineProperty(document, 'webkitVisibilityState', { get: VISIBLE, configurable: true });
    document.hasFocus = function () { return true; };
  } catch (e) { /* noop */ }
})();
