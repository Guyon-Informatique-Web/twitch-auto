// Injecte dans le MONDE DE LA PAGE (world: MAIN). Deux roles :
// 1) Faire croire a Twitch que l'onglet est toujours visible -> les Drops progressent en fond.
// 2) Empecher la mise en PAUSE des videos quand l'onglet est reellement en arriere-plan
//    (Twitch/Chrome mettent en pause au changement d'onglet -> on neutralise ca pour farmer).
// Nos autres modules tournent dans le monde ISOLE et voient la VRAIE visibilite (cet override
// ne s'applique qu'au monde de la page) -> mute / qualite / anti-pause restent corrects.
(function () {
  try {
    var FALSE = function () { return false; };
    var VISIBLE = function () { return 'visible'; };

    // Recupere le VRAI etat de visibilite (getter natif du prototype) avant de masquer document.hidden,
    // pour ne neutraliser la pause QUE lorsque l'onglet est reellement cache.
    var realHiddenGet = null;
    try {
      var d = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden');
      if (d && d.get) realHiddenGet = d.get;
    } catch (e) { /* ignore */ }
    function realHidden() {
      try { return realHiddenGet ? !!realHiddenGet.call(document) : false; } catch (e) { return false; }
    }

    Object.defineProperty(document, 'hidden', { get: FALSE, configurable: true });
    Object.defineProperty(document, 'webkitHidden', { get: FALSE, configurable: true });
    Object.defineProperty(document, 'visibilityState', { get: VISIBLE, configurable: true });
    Object.defineProperty(document, 'webkitVisibilityState', { get: VISIBLE, configurable: true });
    document.hasFocus = function () { return true; };

    // Neutralise pause() sur les onglets en arriere-plan (laisse passer au premier plan).
    if (window.HTMLMediaElement && HTMLMediaElement.prototype && !HTMLMediaElement.prototype.__taNoPause) {
      var origPause = HTMLMediaElement.prototype.pause;
      HTMLMediaElement.prototype.pause = function () {
        if (realHidden()) return undefined;   // onglet cache -> on ignore la pause (farm continu)
        return origPause.apply(this, arguments);
      };
      HTMLMediaElement.prototype.__taNoPause = true;
    }
  } catch (e) { /* noop */ }
})();
