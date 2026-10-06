// Injecte dans le MONDE DE LA PAGE (world: MAIN), comme spoof.js.
// Pilote la qualite du lecteur Twitch DEJA lance. La cle localStorage 'video-quality' n'est lue
// qu'au demarrage du lecteur (mesure du 06/10/2026) : pour un stream deja en cours, seule l'API
// du lecteur agit. Mesure le meme jour : setQuality(160p) en pleine lecture -> 160 lignes en
// moins de 8 s, sans pause et sans ecrire dans localStorage ; setAutoQualityMode(true) -> retour.
// Ordres recus du module quality (monde isole) par evenements DOM : 'ta-quality-low' (onglet en
// arriere-plan) et 'ta-quality-restore' (onglet revenu devant). Sans lecteur reconnu (Twitch a
// change sa page), on ne fait rien : jamais d'erreur, jamais de clic dans l'interface.
// Retour de qualite DIFFERE (mesure du 06/10/2026) : applique pile au moment ou l'onglet
// redevient visible, il percute la reprise de la piste video par Chrome et le flux restait
// bloque en pause ; 1,5 s plus tard, il passe sans accroc. Filet : si la video est encore en
// pause 4 s apres, on relance la lecture (sauf si elle etait deja en pause en partant, ou si
// l'utilisateur a clique ou tape quelque chose entre-temps : sa pause est respectee).
// Qualite a remettre : celle que ce script a lui-meme quittee, ou, pour un lecteur qui a DEMARRE
// en 160p parce qu'un onglet cache avait ecrit la cle commune (onglet recharge ou ouvert en fond),
// celle que le module quality a mise de cote (localStorage 'ta_saved_quality', meme origine donc
// meme stockage ; '' = automatique). Cette valeur est relevee a chaque signal 'low', car le module
// l'efface au retour au premier plan, juste AVANT d'envoyer 'restore'.
(function () {
  var RESTORE_DELAY = 1500;
  var RESUME_CHECK = 4000;
  // Lecteur pas pret au retour (pub, video d'un onglet jamais affiche qui se charge, chaine
  // changee) : nouvel essai toutes les 2 s pendant 30 s, puis abandon.
  var RETRY_MS = 2000;
  var RETRIES = 15;
  var SAVED_KEY = 'ta_saved_quality';
  var saved = null;   // qualite d'avant le 160p : { auto: bool, group: string, playing: bool }
  var moduleSaved = null;   // derniere qualite mise de cote par le module quality, relevee en fond
  var restoreTimer = null;
  var tries = 0;
  var lastInput = 0;
  var restoreAt = 0;  // retour au premier plan : une saisie posterieure = pause voulue
  // Vraie visibilite : spoof.js masque document.hidden sur l'objet document, pas sur le prototype.
  var hiddenDesc = typeof Document !== 'undefined' ? Object.getOwnPropertyDescriptor(Document.prototype, 'hidden') : null;
  function reallyHidden() { try { return hiddenDesc && hiddenDesc.get ? !!hiddenDesc.get.call(document) : false; } catch (e) { return false; } }

  // L'instance du lecteur est passee en prop 'mediaPlayerInstance' a de nombreux composants
  // React ; on remonte l'arbre depuis le conteneur du lecteur (la balise video, creee hors
  // React, n'en porte pas).
  function findPlayer() {
    var roots = [
      document.querySelector('[data-a-target="video-player"]'),
      document.querySelector('.video-player__container')
    ];
    for (var r = 0; r < roots.length; r++) {
      var root = roots[r];
      if (!root) continue;
      var key = null;
      var keys = Object.keys(root);
      for (var k = 0; k < keys.length; k++) {
        if (keys[k].indexOf('__reactFiber$') === 0 || keys[k].indexOf('__reactInternalInstance$') === 0) { key = keys[k]; break; }
      }
      var fiber = key ? root[key] : null;
      for (var i = 0; fiber && i < 150; i++, fiber = fiber.return) {
        var props = fiber.memoizedProps;
        var pl = props && props.mediaPlayerInstance;
        if (pl && typeof pl.setQuality === 'function' && typeof pl.getQualities === 'function') return pl;
      }
    }
    return null;
  }

  // La video du lecteur principal (pas un apercu ni une autre video de la page).
  function playerVideo() {
    return document.querySelector('[data-a-target="video-player"] video') ||
      document.querySelector('.video-player__container video');
  }

  // Qualites video seulement : une entree "audio seul" (sans hauteur utile) n'est jamais choisie.
  function byHeight(qualities, lower) {
    var best = null;
    for (var i = 0; i < qualities.length; i++) {
      var q = qualities[i];
      if (!q || q.group === 'audio_only' || typeof q.height !== 'number' || !(q.height > 0)) continue;
      if (!best || (lower ? q.height < best.height : q.height > best.height)) best = q;
    }
    return best;
  }

  // Qualite mise de cote par le module quality : null s'il n'a rien force.
  function savedByModule() {
    try {
      var v = localStorage.getItem(SAVED_KEY);
      return v == null ? null : { auto: !v, group: String(v) };
    } catch (e) { return null; }
  }

  function toLow() {
    if (restoreTimer) { clearTimeout(restoreTimer); restoreTimer = null; }   // reparti en fond avant le retour
    var m = savedByModule();
    if (m) moduleSaved = m;                     // relevee meme si le lecteur n'est pas encore pret
    try {
      var pl = findPlayer();
      if (!pl) return;
      var qs = pl.getQualities() || [];
      var low = byHeight(qs, true);
      if (!low) return;                         // pub ou flux pas encore pret : on reessaiera
      var auto = typeof pl.isAutoQualityMode === 'function' && pl.isAutoQualityMode();
      var cur = typeof pl.getQuality === 'function' ? pl.getQuality() : null;
      var v = playerVideo();
      var playing = !v || !v.paused;
      if (!auto && cur && cur.group === low.group) {
        // Deja au plus bas : 160p choisi par l'utilisateur, ou lecteur demarre en 160p a cause
        // de la cle commune (restoreNow remettra alors la qualite relevee dans moduleSaved).
        if (moduleSaved) moduleSaved.playing = playing;
        return;
      }
      if (!saved) saved = { auto: !!auto, group: cur ? cur.group : '', playing: playing };
      pl.setQuality(low);
    } catch (e) { /* API changee : sans effet */ }
  }

  function restoreNow() {
    restoreTimer = null;
    try {
      if ((!saved && !moduleSaved) || reallyHidden()) return;
      var pl = findPlayer();
      var qs = pl ? (pl.getQualities() || []) : [];
      if (!pl || !qs.length) {
        // Lecteur pas pret (pub, onglet jamais affiche qui charge sa video) : on garde la qualite
        // d'avant et on reessaie (30 s au plus).
        if (++tries <= RETRIES) restoreTimer = setTimeout(restoreNow, RETRY_MS);
        else { saved = null; moduleSaved = null; tries = 0; }
        return;
      }
      var low = byHeight(qs, true);
      var cur = typeof pl.getQuality === 'function' ? pl.getQuality() : null;
      var autoNow = typeof pl.isAutoQualityMode === 'function' && pl.isAutoQualityMode();
      // Qualite quittee par ce script ; a defaut, et seulement si le lecteur est au plus bas,
      // celle d'avant le 160p de la cle commune.
      var atLow = !autoNow && cur && low && cur.group === low.group;
      var s = saved || (atLow ? moduleSaved : null);
      saved = null;
      moduleSaved = null;
      tries = 0;
      if (!s) return;
      // L'utilisateur a choisi une autre qualite (ou l'automatique) pendant le delai : on la garde.
      if ((autoNow && !s.auto) || (cur && low && cur.group !== low.group && cur.group !== s.group)) return;
      var target = null;
      if (!s.auto && s.group) {
        for (var i = 0; i < qs.length && !target; i++) { if (qs[i] && qs[i].group === s.group) target = qs[i]; }
        // 'chunked' = la qualite source, c'est-a-dire la plus haute du flux.
        if (!target && s.group === 'chunked') target = byHeight(qs, false);
      }
      // Qualite automatique avant le 160p, ou qualite d'avant absente du flux : automatique.
      if (target) pl.setQuality(target);
      else if (typeof pl.setAutoQualityMode === 'function') pl.setAutoQualityMode(true);
      // Base du controle de pause : l'instant du retour (pas celui-ci, 1,5 s plus tard), pour
      // qu'une pause faite pendant le delai compte aussi comme voulue.
      if (s.playing !== false) {
        var at = restoreAt || Date.now();
        setTimeout(function () { resumeIfStuck(at); }, RESUME_CHECK);
      }
    } catch (e) { /* API changee : sans effet */ }
  }

  function resumeIfStuck(since) {
    try {
      if (reallyHidden() || lastInput >= since) return;   // l'utilisateur a agi depuis : sa pause est voulue
      var v = playerVideo();
      if (!v || !v.paused || v.ended) return;
      var p = v.play();
      if (p && typeof p.catch === 'function') p.catch(function () { /* lecture refusee : l'utilisateur relancera */ });
    } catch (e) { /* */ }
  }

  function restore() {
    if (!saved && !moduleSaved) return;
    if (restoreTimer) clearTimeout(restoreTimer);
    tries = 0;
    restoreAt = Date.now();
    restoreTimer = setTimeout(restoreNow, RESTORE_DELAY);
  }

  function onInput(e) { if (!e || e.isTrusted !== false) lastInput = Date.now(); }

  document.addEventListener('ta-quality-low', toLow);
  document.addEventListener('ta-quality-restore', restore);
  // Filet : module quality coupe pendant que l'onglet etait cache -> son signal de retour est
  // arrive onglet cache (sans effet). On remet donc aussi la qualite au retour au premier plan.
  document.addEventListener('visibilitychange', function () { if ((saved || moduleSaved) && !reallyHidden()) restore(); });
  document.addEventListener('pointerdown', onInput, true);
  document.addEventListener('keydown', onInput, true);
})();
