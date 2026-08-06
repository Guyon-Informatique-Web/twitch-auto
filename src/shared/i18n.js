// Dictionnaire de traduction partage (popup + service worker). Aucun acces DOM ici
// pour rester chargeable dans un worker (importScripts) comme dans le popup (<script>).
// Cle de langue stockee dans settings.lang ('fr' | 'en'). Absente -> auto (navigator.language).
(function (root) {
  const STRINGS = {
    fr: {
      // En-tete / navigation
      'ui.toggle': 'Activer / desactiver',
      'ui.updateDl': 'Telecharger la MAJ',
      'ui.tab.stats': 'Stats',
      'ui.tab.live': 'En direct',
      'ui.tab.history': 'Historique',
      'ui.tab.settings': 'Reglages',
      // Pastille d'etat de l'en-tete ({n} + pluriel {s} passes en JS)
      'ui.pill.tabs': '{n} onglet{s}',
      'ui.pill.alerts': '{n} alerte{s}',

      // Onglet Stats
      'ui.aria.points': 'Points reclames',
      'ui.aria.drops': 'Drops reclames',
      'ui.stat.points': 'Points',
      'ui.stat.drops': 'Drops',
      'ui.stat.watch': 'Visionnage',
      'ui.nextDrop': 'Prochain drop',
      'ui.minutesLeft': 'minutes restantes',
      'ui.remaining': 'restant',
      'ui.done': 'termine',
      'ui.next': 'Ensuite',
      'ui.campaigns': 'Campagnes',
      'ui.campInProgress': '{n} en cours',
      'ui.noGame': 'Sans jeu',
      'ui.dropsCount': '{n} drop{s} en cours',
      'ui.noDropTitle': 'Aucun drop en cours',
      'ui.noDropHint': 'L extension lit ta progression sur la page inventaire. Ouvre-la une fois : elle s en occupe ensuite toute seule.',
      'ui.noDropCta': 'Ouvrir mon inventaire',
      'ui.noDropAuto': 'Ou active "Inventaire auto" dans Reglages.',
      'ui.topChannels': 'Top chaines',
      'ui.openInventory': 'Ouvrir mon inventaire de drops',
      'inprog.defaultName': 'Drop',

      // Onglet En direct (un onglet Twitch ouvert = une carte)
      'live.emptyTitle': 'Aucun onglet Twitch ouvert',
      'live.emptyHint': 'Rien ne farme en ce moment. Ouvre un stream : il apparaitra ici avec sa qualite, son etat de lecture et sa progression.',
      'live.openTwitch': 'Ouvrir Twitch',
      'live.state.live': 'EN DIRECT',
      'live.state.offline': 'HORS-LIGNE',
      'live.state.stalled': 'FIGE',
      'live.state.paused': 'EN PAUSE',
      'live.state.inventory': 'INVENTAIRE',
      'live.state.other': 'TWITCH',
      'live.state.loading': 'CHARGEMENT',
      'live.goTab': 'Aller a l onglet',
      'live.reload': 'Recharger',
      'live.close': 'Fermer',
      'live.playing': 'Lecture en cours',
      'live.pausedTxt': 'Lecture en pause : l anti-pause devrait la relancer.',
      'live.offlineTxt': 'La chaine n est plus en direct.',
      'live.stalledTxt': 'Lecteur bloque depuis {n} min.',
      'live.reloadsN': '{n} rechargement{s} du watchdog',
      'live.loadingTxt': 'Onglet en cours de chargement.',
      'live.inventoryTxt': 'Onglet inventaire des drops.',
      'live.otherTxt': 'Page Twitch hors chaine : rien a farmer ici.',
      'live.watched': '{dur} sur cette chaine',
      'live.chip.muted': 'muet',
      'live.chip.off': 'extension off',

      // Onglet Historique
      'hist.empty': 'Rien encore reclame',
      'hist.emptyHint': 'Les points et les drops recuperes s empileront ici, du plus recent au plus ancien. Laisse un stream tourner : le premier coffre tombe en general sous 15 min.',
      'hist.dropDefault': 'Drop reclame',
      'hist.pointsTier': 'Palier {n} points',

      // Onglet Reglages
      'ui.autoswitchPh': 'URL de repli (ex: https://www.twitch.tv/maChaine)',
      'ui.historyTtl': 'Vider l historique apres (min)',
      'ui.historyTtlPh': '0 = jamais',
      'ui.diagTest': 'Tester les selecteurs (sur une page Twitch)',
      // Bloc Sauvegarde (export / import du fichier complet)
      'ui.backup': 'Sauvegarde',
      'ui.exportBtn': 'Exporter',
      'ui.importBtn': 'Importer',
      'ui.backupNote': 'Le fichier contient les reglages, les compteurs et l historique. L import remplace la configuration actuelle et demande confirmation avant d ecraser les compteurs.',
      'ui.importOk': 'Reglages restaures - {n} fonctions.',
      'ui.importOkStats': 'Reglages et compteurs restaures.',
      'ui.importAsk': 'Ecraser aussi les compteurs et l historique ? (clic pour confirmer)',
      'ui.importErr': 'Fichier illisible : ce n est pas un export Twitch Auto.',
      'ui.reset': 'reinitialiser',
      'ui.resetConfirm': 'Confirmer ? (efface tout)',
      'ui.donate': 'Faire un don',
      'ui.langLabel': 'Langue',

      // Diagnostic des selecteurs
      'diag.running': 'Test en cours...',
      'diag.needTwitch': 'Ouvre une page Twitch (onglet actif) et relance le test.',
      'diag.noResponse': 'Pas de reponse - recharge la page Twitch puis reessaie.',
      'diag.ok': 'OK',
      'diag.missing': 'absent',
      'diag.result':
        'Points: {points}  |  Solde: {balance}\n' +
        'Drop selecteur: {dropSel}  |  Drop texte: {dropText}\n' +
        'Overlay player: {overlay}  |  Barres progression: {bars}',
      'diag.lastError': 'Derniere erreur ({module}) : {message}',

      // Banniere de mise a jour
      'update.bannerNew': 'Nouvelle version v{v} dispo',
      'update.downloaded': "Telecharge ! Dezippe par-dessus ton dossier, puis recharge l'extension.",

      // Reglages : libelle + infobulle de chaque fonction
      'feat.points': 'Points',
      'feat.points.desc': 'Reclame les coffres bonus de points de chaine.',
      'feat.drops': 'Drops',
      'feat.drops.desc': 'Reclame les drops termines (inventaire + bandeau sur le stream).',
      'feat.reload': 'Reload auto',
      'feat.reload.desc': 'Recharge le player quand il affiche une erreur ou reste fige en arriere-plan.',
      'feat.lowQuality': 'Qualite mini',
      'feat.lowQuality.desc': 'Passe la video en 160p sur les onglets en arriere-plan.',
      'feat.antiAfk': 'Anti-AFK',
      'feat.antiAfk.desc': 'Clique les fenetres "Toujours la ?" et le contenu sensible.',
      'feat.muteBackground': 'Mute fond',
      'feat.muteBackground.desc': 'Coupe le son des onglets en arriere-plan.',
      'feat.keepAlive': 'Anti-pause',
      'feat.keepAlive.desc': 'Relance la lecture des onglets en arriere-plan s ils se mettent en pause.',
      'feat.autoInventory': 'Inventaire auto',
      'feat.autoInventory.desc': 'Garde/ouvre l onglet inventaire des drops en arriere-plan pour reclamer sans y penser.',
      'feat.notifications': 'Notifications',
      'feat.notifications.desc': 'Notification desktop sur drop / palier de points.',
      'feat.autoSwitch': 'Auto-switch',
      'feat.autoSwitch.desc': 'Bascule vers une chaine de repli si le stream passe hors-ligne (regle l URL ci-dessous).',

      // Notifications desktop (service worker)
      'notif.update.title': 'Mise a jour disponible',
      'notif.update.body': 'Twitch Auto v{v} est disponible. Ouvre le popup pour la recuperer.',
      'notif.points.title': 'Points reclames',
      'notif.points.body': '{n} points cumules via Twitch Auto',
      'notif.drop.title': 'Drop reclame',
      'notif.drop.bodyNamed': 'Drop: {name}',
      'notif.drop.bodyAnon': 'Un drop a ete reclame'
    },

    en: {
      // Header / navigation
      'ui.toggle': 'Enable / disable',
      'ui.updateDl': 'Download update',
      'ui.tab.stats': 'Stats',
      'ui.tab.live': 'Live',
      'ui.tab.history': 'History',
      'ui.tab.settings': 'Settings',
      // Header status pill ({n} + plural {s} passed from JS)
      'ui.pill.tabs': '{n} tab{s}',
      'ui.pill.alerts': '{n} alert{s}',

      // Stats tab
      'ui.aria.points': 'Points claimed',
      'ui.aria.drops': 'Drops claimed',
      'ui.stat.points': 'Points',
      'ui.stat.drops': 'Drops',
      'ui.stat.watch': 'Watch time',
      'ui.nextDrop': 'Next drop',
      'ui.minutesLeft': 'minutes left',
      'ui.remaining': 'left',
      'ui.done': 'done',
      'ui.next': 'Next up',
      'ui.campaigns': 'Campaigns',
      'ui.campInProgress': '{n} in progress',
      'ui.noGame': 'No game',
      'ui.dropsCount': '{n} drop{s} in progress',
      'ui.noDropTitle': 'No drop in progress',
      'ui.noDropHint': 'The extension reads your progress from the inventory page. Open it once: it takes over from there.',
      'ui.noDropCta': 'Open my inventory',
      'ui.noDropAuto': 'Or turn on "Auto inventory" in Settings.',
      'ui.topChannels': 'Top channels',
      'ui.openInventory': 'Open my drops inventory',
      'inprog.defaultName': 'Drop',

      // Live tab (one open Twitch tab = one card)
      'live.emptyTitle': 'No Twitch tab open',
      'live.emptyHint': 'Nothing is farming right now. Open a stream: it will show up here with its quality, playback state and progress.',
      'live.openTwitch': 'Open Twitch',
      'live.state.live': 'LIVE',
      'live.state.offline': 'OFFLINE',
      'live.state.stalled': 'FROZEN',
      'live.state.paused': 'PAUSED',
      'live.state.inventory': 'INVENTORY',
      'live.state.other': 'TWITCH',
      'live.state.loading': 'LOADING',
      'live.goTab': 'Go to tab',
      'live.reload': 'Reload',
      'live.close': 'Close',
      'live.playing': 'Playing',
      'live.pausedTxt': 'Playback paused: anti-pause should resume it.',
      'live.offlineTxt': 'This channel is no longer live.',
      'live.stalledTxt': 'Player stuck for {n} min.',
      'live.reloadsN': '{n} watchdog reload{s}',
      'live.loadingTxt': 'Tab is still loading.',
      'live.inventoryTxt': 'Drops inventory tab.',
      'live.otherTxt': 'Twitch page outside a channel: nothing to farm here.',
      'live.watched': '{dur} on this channel',
      'live.chip.muted': 'muted',
      'live.chip.off': 'extension off',

      // History tab
      'hist.empty': 'Nothing claimed yet',
      'hist.emptyHint': 'Claimed points and drops will pile up here, newest first. Leave a stream running: the first chest usually drops within 15 min.',
      'hist.dropDefault': 'Drop claimed',
      'hist.pointsTier': '{n} points milestone',

      // Settings tab
      'ui.autoswitchPh': 'Fallback URL (e.g. https://www.twitch.tv/myChannel)',
      'ui.historyTtl': 'Clear history after (min)',
      'ui.historyTtlPh': '0 = never',
      'ui.diagTest': 'Test selectors (on a Twitch page)',
      // Backup block (export / import of the whole file)
      'ui.backup': 'Backup',
      'ui.exportBtn': 'Export',
      'ui.importBtn': 'Import',
      'ui.backupNote': 'The file holds settings, counters and history. Importing replaces your current configuration and asks before overwriting counters.',
      'ui.importOk': 'Settings restored - {n} features.',
      'ui.importOkStats': 'Settings and counters restored.',
      'ui.importAsk': 'Also overwrite counters and history? (click to confirm)',
      'ui.importErr': 'Unreadable file: this is not a Twitch Auto export.',
      'ui.reset': 'reset',
      'ui.resetConfirm': 'Confirm? (erases everything)',
      'ui.donate': 'Donate',
      'ui.langLabel': 'Language',

      // Selector diagnostics
      'diag.running': 'Testing...',
      'diag.needTwitch': 'Open a Twitch page (active tab) and run the test again.',
      'diag.noResponse': 'No response - reload the Twitch page and try again.',
      'diag.ok': 'OK',
      'diag.missing': 'missing',
      'diag.result':
        'Points: {points}  |  Balance: {balance}\n' +
        'Drop selector: {dropSel}  |  Drop text: {dropText}\n' +
        'Player overlay: {overlay}  |  Progress bars: {bars}',
      'diag.lastError': 'Last error ({module}): {message}',

      // Update banner
      'update.bannerNew': 'New version v{v} available',
      'update.downloaded': 'Downloaded! Unzip over your folder, then reload the extension.',

      // Settings: label + tooltip for each feature
      'feat.points': 'Points',
      'feat.points.desc': 'Claims channel points bonus chests.',
      'feat.drops': 'Drops',
      'feat.drops.desc': 'Claims completed drops (inventory + on-stream banner).',
      'feat.reload': 'Auto reload',
      'feat.reload.desc': 'Reloads the player when it shows an error or stays frozen in the background.',
      'feat.lowQuality': 'Min quality',
      'feat.lowQuality.desc': 'Sets video to 160p on background tabs.',
      'feat.antiAfk': 'Anti-AFK',
      'feat.antiAfk.desc': 'Clicks "Still watching?" prompts and mature content gates.',
      'feat.muteBackground': 'Mute background',
      'feat.muteBackground.desc': 'Mutes background tabs.',
      'feat.keepAlive': 'Anti-pause',
      'feat.keepAlive.desc': 'Resumes playback on background tabs if they pause.',
      'feat.autoInventory': 'Auto inventory',
      'feat.autoInventory.desc': 'Keeps/opens the drops inventory tab in the background to claim hands-free.',
      'feat.notifications': 'Notifications',
      'feat.notifications.desc': 'Desktop notification on drop / points milestone.',
      'feat.autoSwitch': 'Auto-switch',
      'feat.autoSwitch.desc': 'Switches to a fallback channel if the stream goes offline (set the URL below).',

      // Desktop notifications (service worker)
      'notif.update.title': 'Update available',
      'notif.update.body': 'Twitch Auto v{v} is available. Open the popup to get it.',
      'notif.points.title': 'Points claimed',
      'notif.points.body': '{n} points collected via Twitch Auto',
      'notif.drop.title': 'Drop claimed',
      'notif.drop.bodyNamed': 'Drop: {name}',
      'notif.drop.bodyAnon': 'A drop was claimed'
    }
  };

  // Normalise une valeur de langue : 'en'/'fr' valides, sinon null.
  function normLang(l) {
    l = String(l || '').toLowerCase();
    if (l.startsWith('en')) return 'en';
    if (l.startsWith('fr')) return 'fr';
    return null;
  }

  // Langue auto par defaut : navigateur si dispo, sinon francais.
  function detectLang() {
    try {
      return normLang(typeof navigator !== 'undefined' && navigator.language) || 'fr';
    } catch (e) { return 'fr'; }
  }

  // Langue effective : choix explicite (settings.lang) sinon auto.
  function resolveLang(settings) {
    return normLang(settings && settings.lang) || detectLang();
  }

  // Traduit une cle. vars : objet {nom: valeur} pour les {placeholder}.
  // Repli : EN manquant -> FR, FR manquant -> la cle brute (jamais d'erreur).
  function t(lang, key, vars) {
    const code = normLang(lang) || 'fr';
    const dict = STRINGS[code] || STRINGS.fr;
    let s = dict[key];
    if (s == null) s = STRINGS.fr[key];
    if (s == null) return key;
    if (vars) {
      s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));
    }
    return s;
  }

  const api = { STRINGS, normLang, detectLang, resolveLang, t };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TAi18n = api;
})(typeof self !== 'undefined' ? self : this);
