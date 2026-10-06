// Qualite mini des onglets en arriere-plan (farming AFK).
// MESURE le 06/10/2026 (Chrome 154, twitch.tv) : le lecteur Twitch ne lit la cle localStorage
// 'video-quality' qu'a son DEMARRAGE. L'ecrire en cours de lecture ne change rien (720p
// maintenu 40 s apres l'ecriture), et la cle est COMMUNE a tous les onglets twitch.tv : un 160p
// laisse dedans faisait demarrer en 160p le prochain stream ouvert au premier plan.
// D'ou le fonctionnement :
//  - onglet cache : on ecrit 160p, que lisent les lecteurs qui DEMARRENT en arriere-plan (onglet
//    ouvert en fond, rechargement par le watchdog, l'auto-switch ou l'inventaire auto, raid) ;
//  - la qualite de l'utilisateur est gardee dans une cle partagee (SAVED_KEY), pour pouvoir la
//    remettre meme quand l'onglet qui avait force le 160p a ete ferme ou recharge entre-temps ;
//  - onglet visible (retour, chargement ou changement de chaine au premier plan) et onglet qui
//    se ferme : on remet la qualite de l'utilisateur. Un onglet encore cache la repassera en
//    160p a son prochain demarrage de lecteur.
window.TA = window.TA || {};
TA.modules = TA.modules || {};
TA.modules.quality = (function () {
  const KEY = 'video-quality';
  const SAVED_KEY = 'ta_saved_quality';   // '' = la cle Twitch n'avait pas de qualite par defaut
  const MIGRATED_KEY = 'ta_quality_v2';   // reparation unique du 160p laisse par les versions < 1.12.1
  const LOW = '160p30';
  let unsub = null;
  let lastPath = null;

  function readQ() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; }
  }
  function writeQ(q) {
    try { localStorage.setItem(KEY, JSON.stringify(q)); } catch (e) { TA.log.error('quality', e); }
  }

  function setLow() {
    const q = readQ();
    if (q.default === LOW) return;   // deja en 160p : par un autre onglet cache, ou par choix de l'utilisateur
    // read-modify-write : on ne touche QUE 'default', et on garde la valeur d'origine a part
    // ('' si elle etait absente, pour la remettre absente et non en "source").
    try { localStorage.setItem(SAVED_KEY, q.default || ''); } catch (e) { return; }
    q.default = LOW;
    writeQ(q);
    TA.log.info('quality', '160p pour les lecteurs qui demarrent en arriere-plan');
  }

  function restore() {
    let saved = null;
    try { saved = localStorage.getItem(SAVED_KEY); } catch (e) { return; }
    if (saved == null) return;       // on n'a jamais force le 160p : rien a remettre
    const q = readQ();
    // Une autre valeur que LOW = l'utilisateur a choisi une qualite entre-temps : on la respecte.
    if (q.default === LOW) {
      if (saved) q.default = saved; else delete q.default;
      writeQ(q);
      TA.log.info('quality', `qualite restauree (${saved || 'par defaut'})`);
    }
    try { localStorage.removeItem(SAVED_KEY); } catch (e) { /* stockage indisponible */ }
  }

  // Les versions < 1.12.1 ont pu laisser '160p30' dans la cle commune SANS valeur gardee : rien
  // ne le distingue d'un choix de l'utilisateur, donc on le retire UNE fois (au premier onglet
  // visible), et le lecteur reprend sa qualite par defaut. Ensuite, un 160p sans valeur gardee
  // est un choix volontaire et n'est plus jamais touche.
  function migrateOnce() {
    try {
      if (localStorage.getItem(MIGRATED_KEY)) return;
      localStorage.setItem(MIGRATED_KEY, '1');
      if (localStorage.getItem(SAVED_KEY) != null) return;
      const q = readQ();
      if (q.default !== LOW) return;
      delete q.default;
      writeQ(q);
      TA.log.info('quality', '160p laisse par une ancienne version retire');
    } catch (e) { /* stockage indisponible */ }
  }

  function onVis() { if (document.hidden) setLow(); else restore(); }
  // Un onglet qui se ferme ou se recharge ne laisse jamais le 160p derriere lui.
  function onPageHide() { restore(); }
  // Navigation interne de Twitch (changement de chaine, raid) : un NOUVEAU lecteur va demarrer
  // et lire la cle. On la remet dans l'etat que veut cet onglet avant qu'il ne la lise.
  function onDom() {
    if (location.pathname === lastPath) return;
    lastPath = location.pathname;
    onVis();
  }

  return {
    id: 'quality',
    settingKey: 'lowQuality',
    start() {
      if (!document.hidden) migrateOnce();
      lastPath = location.pathname;
      onVis(); // cache -> 160p ; visible -> repare un 160p laisse par un onglet ferme en fond
      document.addEventListener('visibilitychange', onVis);
      window.addEventListener('pagehide', onPageHide);
      unsub = TA.dom.subscribe(onDom);
    },
    stop() {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', onPageHide);
      if (unsub) { unsub(); unsub = null; }
      restore(); // ne pas laisser le 160p ecrit quand on desactive la fonction
    }
  };
})();
