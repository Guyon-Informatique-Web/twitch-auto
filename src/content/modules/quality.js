// Force la qualite la plus basse quand l'onglet est en arriere-plan (farming AFK),
// et RESTAURE la qualite precedente au retour au premier plan.
// Best-effort via localStorage 'video-quality' lu par le player Twitch.
window.TA = window.TA || {};
TA.modules = TA.modules || {};
TA.modules.quality = (function () {
  const LOW = '160p30';
  let saved = null; // qualite par defaut avant qu'on force le bas (pour pouvoir restaurer)

  function readQ() {
    try { return JSON.parse(localStorage.getItem('video-quality') || '{}') || {}; } catch (e) { return {}; }
  }
  function writeQ(q) {
    try { localStorage.setItem('video-quality', JSON.stringify(q)); } catch (e) { TA.log.error('quality', e); }
  }

  function setLow() {
    const q = readQ();
    if (q.default === LOW) return;
    saved = q.default || 'chunked';       // memorise la qualite precedente (chunked = source/auto)
    q.default = LOW;                        // read-modify-write : on ne touche QUE 'default'
    writeQ(q);
    TA.log.info('quality', 'qualite forcee a 160p (onglet en fond)');
  }
  function restore() {
    if (saved == null) return;
    const q = readQ();
    q.default = saved;
    writeQ(q);
    TA.log.info('quality', `qualite restauree (${saved})`);
    saved = null;
  }
  function onVis() { if (document.hidden) setLow(); else restore(); }

  return {
    id: 'quality',
    settingKey: 'lowQuality',
    // Vrai quand l'onglet EST en qualite basse (pastille du popup). On lit l'etat effectif, pas
    // "est-ce que ce module a ecrit la valeur" : quand le lecteur etait deja en 160p, setLow()
    // n'ecrit rien et 'saved' reste null alors que l'onglet est bel et bien en 160p.
    isLow() { return readQ().default === LOW; },
    start() {
      if (document.hidden) setLow();
      document.addEventListener('visibilitychange', onVis);
    },
    stop() {
      document.removeEventListener('visibilitychange', onVis);
      restore(); // ne pas laisser l'onglet bloque en 160p quand on desactive la fonction
    }
  };
})();
