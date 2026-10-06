// Dictionnaire de traduction partage (popup + service worker). Aucun acces DOM ici
// pour rester chargeable dans un worker (importScripts) comme dans le popup (<script>).
// Cle de langue stockee dans settings.lang ('fr' | 'en'). Absente -> auto (navigator.language).
// Typographie francaise : ecrire les chaines FR avec une espace ORDINAIRE avant : ; ? ! et
// apres « ; t() la rend insecable (pas de ponctuation orpheline en debut de ligne).
(function (root) {
  const STRINGS = {
    fr: {
      // En-tete / navigation
      'ui.toggle': 'Activer / désactiver',
      'ui.updateDl': 'Télécharger la mise à jour',
      'ui.tab.stats': 'Stats',
      'ui.tab.live': 'En direct',
      'ui.tab.history': 'Historique',
      'ui.tab.settings': 'Réglages',
      // Pastille d'etat de l'en-tete ({n} + pluriel {s} passes en JS)
      'ui.pill.tabs': '{n} onglet{s}',
      'ui.pill.alerts': '{n} alerte{s}',

      // Onglet Stats
      'ui.stat.points': 'Points',
      'ui.stat.drops': 'Drops',
      'ui.stat.watch': 'Visionnage',
      'ui.nextDrop': 'Prochain drop',
      'ui.minutesLeft': 'minutes restantes',
      'ui.minuteLeft': 'minute restante',
      'ui.remaining': 'restant',
      'ui.done': 'effectué',
      'ui.next': 'Ensuite',
      'ui.campaigns': 'Campagnes',
      'ui.campInProgress': '{n} en cours',
      'ui.campUnnamed': 'Campagne',
      'ui.noGame': 'Sans jeu',
      'ui.dropsCount': '{n} drop{s} en cours',
      'ui.stale': 'Relevé {ago} : ouvre l’inventaire pour l’actualiser.',
      'ui.stuckTitle': '« {name} » n’avance plus depuis {time}.',
      'ui.stuckTitleYesterday': '« {name} » n’avance plus depuis hier, {time}.',
      'ui.stuckTitleDay': '« {name} » n’avance plus depuis le {day}, {time}.',
      'ui.stuckHint': 'Une chaîne de ce jeu est pourtant regardée : elle ne participe peut-être pas à la campagne.',
      'ui.watchParticipating': 'Regarder une chaîne participante',
      'ui.watchParticipatingAria': 'Regarder une chaîne participante : {game}',
      'ui.watchOpened': 'Chaîne ouverte',
      'ui.watchOpenedAria': 'Chaîne ouverte : {game}',
      'ui.campEnds': 'Se termine {when}',
      'ui.campEndsLeft': 'Se termine {when} · encore ~{dur} à regarder',
      'ui.campEndsTight': 'Se termine {when} · encore ~{dur} à regarder : trop juste',
      'ui.noDropTitle': 'Aucun drop en cours',
      'ui.noDropHint': 'L’extension lit ta progression sur la page inventaire. Ouvre-la une fois : elle s’en occupe ensuite toute seule.',
      'ui.noDropCta': 'Ouvrir mon inventaire',
      'ui.noDropAuto': 'Ou active « Inventaire auto » dans Réglages.',
      'ui.topChannels': 'Top chaînes',
      'ui.openInventory': 'Ouvrir mon inventaire de drops',
      'inprog.defaultName': 'Drop',

      // Onglet En direct (un onglet Twitch ouvert = une carte)
      'live.emptyTitle': 'Aucun onglet Twitch ouvert',
      'live.emptyHint': 'Rien ne farme en ce moment. Ouvre un stream : il apparaîtra ici avec sa qualité, son état de lecture et sa progression.',
      'live.openTwitch': 'Ouvrir Twitch',
      'live.state.live': 'EN DIRECT',
      'live.state.offline': 'HORS LIGNE',
      'live.state.stalled': 'FIGÉ',
      'live.state.paused': 'EN PAUSE',
      'live.state.unreachable': 'À RECHARGER',
      'live.state.inventory': 'INVENTAIRE',
      'live.state.other': 'TWITCH',
      'live.state.loading': 'CHARGEMENT',
      'live.goTab': 'Aller à l’onglet',
      'live.reload': 'Recharger',
      'live.close': 'Fermer',
      'live.playing': 'Lecture en cours',
      'live.pausedTxt': 'Lecture en pause : l’anti-pause devrait la relancer.',
      'live.offlineTxt': 'La chaîne n’est plus en direct.',
      'live.stalledTxt': 'Lecteur bloqué depuis {n} min.',
      'live.reloadsN': '{n} rechargement{s} du watchdog',
      'live.loadingTxt': 'Onglet en cours de chargement.',
      'live.unreachableTxt': 'Cet onglet n’est plus suivi : l’extension a été rechargée depuis son ouverture. Recharge-le pour qu’il soit de nouveau compté.',
      'live.inventoryTxt': 'Onglet inventaire des drops.',
      'live.otherTxt': 'Page Twitch hors chaîne : rien à farmer ici.',
      'live.watched': '{dur} sur cette chaîne',
      'live.chip.muted': 'muet',
      'live.chip.off': 'extension coupée',
      'live.bulkTxt': '{n} onglets ne sont plus suivis depuis la mise à jour.',
      'live.bulkBtn': 'Tout recharger',

      // Onglet Historique
      'hist.empty': 'Rien de réclamé pour l’instant',
      'hist.emptyHint': 'Les points et les drops récupérés s’empileront ici, du plus récent au plus ancien. Laisse un stream tourner : le premier coffre tombe en général sous 15 min.',
      'hist.dropDefault': 'Drop réclamé',
      'hist.pointsTier': 'Palier {n} points',
      'hist.today': 'Aujourd’hui',
      'hist.yesterday': 'Hier',
      'hist.dayUnknown': 'Date inconnue',
      'hist.pointsSub': 'Points de chaîne',
      'hist.noGameSub': 'Jeu inconnu',

      // Onglet Reglages
      'ui.autoswitchPh': 'Ajouter une chaîne de repli (ex. : zerator)',
      'ui.autoswitchHint': 'Dans cet ordre : l’auto-switch part sur la suivante si elle est hors ligne.',
      'ui.autoswitchRemove': 'Retirer {ch}',
      'ui.autoswitchFull': 'Cinq chaînes au plus.',
      'ui.autoswitchDup': 'Déjà dans la liste : {ch}.',
      'ui.autoswitchErr': 'Aucune chaîne Twitch reconnue dans « {v} ». Indique un lien twitch.tv ou un nom de chaîne.',
      'ui.historyTtl': 'Vider l’historique après (min)',
      'ui.historyTtlPh': '0 = jamais',
      'ui.diagTest': 'Tester les sélecteurs (sur une page Twitch)',
      // Bloc Sauvegarde (export / import du fichier complet)
      'ui.backup': 'Sauvegarde',
      'ui.exportBtn': 'Exporter',
      'ui.importBtn': 'Importer',
      'ui.backupNote': 'Le fichier contient les réglages, les compteurs et l’historique. L’import applique les réglages du fichier et demande confirmation avant d’écraser les compteurs.',
      'ui.importOk': 'Réglages restaurés : {n}.',
      'ui.importOkStats': 'Réglages et compteurs restaurés.',
      'ui.importAsk': 'Écraser aussi les compteurs et l’historique par ceux du fichier ?',
      'ui.importConfirm': 'Écraser',
      'ui.importCancel': 'Garder les miens',
      'ui.importCancelled': 'Réglages restaurés, compteurs conservés.',
      'ui.importErr': 'Fichier illisible : ce n’est pas un export Twitch Auto.',
      'ui.importFail': 'Les compteurs n’ont pas pu être écrits. Réessaie dans un instant.',
      'ui.resetFail': 'La réinitialisation n’a pas abouti. Réessaie dans un instant.',
      'ui.reset': 'réinitialiser',
      'ui.resetConfirm': 'Confirmer ? (efface compteurs et historique)',
      'ui.donate': 'Faire un don',
      'ui.langLabel': 'Langue',

      // Diagnostic des selecteurs
      'diag.running': 'Test en cours…',
      'diag.needTwitch': 'Ouvre une page Twitch (onglet actif) et relance le test.',
      'diag.noResponse': 'Pas de réponse : recharge la page Twitch puis réessaie.',
      'diag.ok': 'OK',
      'diag.missing': 'absent',
      'diag.result':
        'Points : {points}  |  Solde : {balance}\n' +
        'Drop sélecteur : {dropSel}  |  Drop texte : {dropText}\n' +
        'Overlay lecteur : {overlay}  |  Barres de progression : {bars}\n' +
        'Campagnes avec date de fin : {ends}',
      'diag.lastError': 'Dernière erreur ({module}, {ago}) : {message}',

      // Banniere de mise a jour
      'update.bannerNew': 'Nouvelle version v{v} disponible',
      'update.downloaded': 'Téléchargé ! Dézippe par-dessus ton dossier, puis recharge l’extension.',

      // Reglages : libelle + infobulle de chaque fonction
      'feat.points': 'Points',
      'feat.points.desc': 'Réclame les coffres bonus de points de chaîne.',
      'feat.drops': 'Drops',
      'feat.drops.desc': 'Réclame les drops terminés (inventaire + bandeau sur le stream).',
      'feat.reload': 'Reload auto',
      'feat.reload.desc': 'Recharge le lecteur quand il affiche une erreur ou reste figé en arrière-plan.',
      'feat.lowQuality': 'Qualité mini',
      'feat.lowQuality.desc': 'Passe en 160p les onglets en arrière-plan, même un stream déjà lancé ; ta qualité revient quand tu y retournes.',
      'feat.antiAfk': 'Anti-AFK',
      'feat.antiAfk.desc': 'Clique les fenêtres « Toujours là ? » et le contenu sensible.',
      'feat.muteBackground': 'Mute fond',
      'feat.muteBackground.desc': 'Coupe le son des onglets en arrière-plan (un onglet coupé à la main le reste).',
      'feat.keepAlive': 'Anti-pause',
      'feat.keepAlive.desc': 'Relance la lecture des onglets en arrière-plan s’ils se mettent en pause.',
      'feat.autoInventory': 'Inventaire auto',
      'feat.autoInventory.desc': 'Garde ou ouvre l’onglet inventaire des drops en arrière-plan pour réclamer sans y penser.',
      'feat.notifications': 'Notifications',
      'feat.notifications.desc': 'Notification de bureau sur drop ou palier de points.',
      'feat.autoSwitch': 'Auto-switch',
      'feat.autoSwitch.desc': 'Bascule vers une chaîne de repli si le stream passe hors ligne (règle la liste ci-dessous).',
      'feat.autoReloadTabs': 'Recharge après MAJ',
      'feat.autoReloadTabs.desc': 'Après une mise à jour de l’extension, recharge les onglets Twitch en arrière-plan (jamais celui que tu regardes).',
      'feat.autoWatch': 'Chaîne à drops auto',
      'feat.autoWatch.desc': 'Quand un drop n’avance plus, ouvre en arrière-plan une chaîne en direct qui participe à sa campagne (une fois par heure et par jeu).',

      // Notifications de bureau (service worker)
      'notif.update.title': 'Mise à jour disponible',
      'notif.update.body': 'Twitch Auto v{v} est disponible. Ouvre le popup pour la récupérer.',
      'notif.points.title': 'Points réclamés',
      'notif.points.body': '{n} points cumulés via Twitch Auto',
      'notif.drop.title': 'Drop réclamé',
      'notif.drop.bodyNamed': 'Drop : {name}',
      'notif.drop.bodyAnon': 'Un drop a été réclamé',
      'notif.watch.title': 'Chaîne participante ouverte',
      'notif.watch.body': 'Une chaîne qui a les drops de {game} est ouverte en arrière-plan. Clique ici pour l’afficher : Chrome ne lance la vidéo qu’une fois l’onglet affiché.',
      'notif.stuck.title': 'Drop bloqué',
      'notif.stuck.body': '« {name} » n’avance plus malgré {n} min de visionnage de son jeu : la chaîne regardée ne participe peut-être pas à la campagne.'
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
      'ui.stat.points': 'Points',
      'ui.stat.drops': 'Drops',
      'ui.stat.watch': 'Watch time',
      'ui.nextDrop': 'Next drop',
      'ui.minutesLeft': 'minutes left',
      'ui.minuteLeft': 'minute left',
      'ui.remaining': 'left',
      'ui.done': 'done',
      'ui.next': 'Next up',
      'ui.campaigns': 'Campaigns',
      'ui.campInProgress': '{n} in progress',
      'ui.campUnnamed': 'Campaign',
      'ui.noGame': 'No game',
      'ui.dropsCount': '{n} drop{s} in progress',
      'ui.stale': 'Last read {ago}: open the inventory to refresh it.',
      'ui.stuckTitle': '"{name}" has not moved since {time}.',
      'ui.stuckTitleYesterday': '"{name}" has not moved since yesterday, {time}.',
      'ui.stuckTitleDay': '"{name}" has not moved since {day}, {time}.',
      'ui.stuckHint': 'You are watching a channel of this game though: it may not take part in the campaign.',
      'ui.watchParticipating': 'Watch a participating channel',
      'ui.watchParticipatingAria': 'Watch a participating channel: {game}',
      'ui.watchOpened': 'Channel opened',
      'ui.watchOpenedAria': 'Channel opened: {game}',
      'ui.campEnds': 'Ends {when}',
      'ui.campEndsLeft': 'Ends {when} · about {dur} of watching left',
      'ui.campEndsTight': 'Ends {when} · about {dur} of watching left: too tight',
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
      'live.state.unreachable': 'NEEDS RELOAD',
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
      'live.unreachableTxt': 'This tab is no longer tracked: the extension was reloaded after it opened. Reload it to be counted again.',
      'live.inventoryTxt': 'Drops inventory tab.',
      'live.otherTxt': 'Twitch page outside a channel: nothing to farm here.',
      'live.watched': '{dur} on this channel',
      'live.chip.muted': 'muted',
      'live.chip.off': 'extension off',
      'live.bulkTxt': '{n} tabs are no longer tracked since the update.',
      'live.bulkBtn': 'Reload all',

      // History tab
      'hist.empty': 'Nothing claimed yet',
      'hist.emptyHint': 'Claimed points and drops will pile up here, newest first. Leave a stream running: the first chest usually drops within 15 min.',
      'hist.dropDefault': 'Drop claimed',
      'hist.pointsTier': '{n} points milestone',
      'hist.today': 'Today',
      'hist.yesterday': 'Yesterday',
      'hist.dayUnknown': 'Unknown date',
      'hist.pointsSub': 'Channel points',
      'hist.noGameSub': 'Unknown game',

      // Settings tab
      'ui.autoswitchPh': 'Add a fallback channel (e.g. zerator)',
      'ui.autoswitchHint': 'In this order: auto-switch moves on to the next one if it is offline.',
      'ui.autoswitchRemove': 'Remove {ch}',
      'ui.autoswitchFull': 'Five channels at most.',
      'ui.autoswitchDup': 'Already in the list: {ch}.',
      'ui.autoswitchErr': 'No Twitch channel found in "{v}". Enter a twitch.tv link or a channel name.',
      'ui.historyTtl': 'Clear history after (min)',
      'ui.historyTtlPh': '0 = never',
      'ui.diagTest': 'Test selectors (on a Twitch page)',
      // Backup block (export / import of the whole file)
      'ui.backup': 'Backup',
      'ui.exportBtn': 'Export',
      'ui.importBtn': 'Import',
      'ui.backupNote': 'The file holds settings, counters and history. Importing applies the file\'s settings and asks before overwriting counters.',
      'ui.importOk': 'Settings restored: {n}.',
      'ui.importOkStats': 'Settings and counters restored.',
      'ui.importAsk': 'Also replace your counters and history with the file\'s?',
      'ui.importConfirm': 'Replace',
      'ui.importCancel': 'Keep mine',
      'ui.importCancelled': 'Settings restored, counters kept.',
      'ui.importErr': 'Unreadable file: this is not a Twitch Auto export.',
      'ui.importFail': 'Counters could not be written. Try again in a moment.',
      'ui.resetFail': 'The reset did not go through. Try again in a moment.',
      'ui.reset': 'reset',
      'ui.resetConfirm': 'Confirm? (erases counters and history)',
      'ui.donate': 'Donate',
      'ui.langLabel': 'Language',

      // Selector diagnostics
      'diag.running': 'Testing…',
      'diag.needTwitch': 'Open a Twitch page (active tab) and run the test again.',
      'diag.noResponse': 'No response: reload the Twitch page and try again.',
      'diag.ok': 'OK',
      'diag.missing': 'missing',
      'diag.result':
        'Points: {points}  |  Balance: {balance}\n' +
        'Drop selector: {dropSel}  |  Drop text: {dropText}\n' +
        'Player overlay: {overlay}  |  Progress bars: {bars}\n' +
        'Campaigns with an end date: {ends}',
      'diag.lastError': 'Last error ({module}, {ago}): {message}',

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
      'feat.lowQuality.desc': 'Drops background tabs to 160p, even a stream already playing; your quality comes back when you return.',
      'feat.antiAfk': 'Anti-AFK',
      'feat.antiAfk.desc': 'Clicks "Still watching?" prompts and mature content gates.',
      'feat.muteBackground': 'Mute background',
      'feat.muteBackground.desc': 'Mutes background tabs (a tab you muted yourself stays muted).',
      'feat.keepAlive': 'Anti-pause',
      'feat.keepAlive.desc': 'Resumes playback on background tabs if they pause.',
      'feat.autoInventory': 'Auto inventory',
      'feat.autoInventory.desc': 'Keeps/opens the drops inventory tab in the background to claim hands-free.',
      'feat.notifications': 'Notifications',
      'feat.notifications.desc': 'Desktop notification on drop / points milestone.',
      'feat.autoSwitch': 'Auto-switch',
      'feat.autoSwitch.desc': 'Switches to a fallback channel if the stream goes offline (set the list below).',
      'feat.autoReloadTabs': 'Reload after update',
      'feat.autoReloadTabs.desc': 'After an extension update, reloads background Twitch tabs (never the one you are watching).',
      'feat.autoWatch': 'Auto drops channel',
      'feat.autoWatch.desc': 'When a drop stops progressing, opens a live channel taking part in its campaign in the background (once per hour per game).',

      // Desktop notifications (service worker)
      'notif.update.title': 'Update available',
      'notif.update.body': 'Twitch Auto v{v} is available. Open the popup to get it.',
      'notif.points.title': 'Points claimed',
      'notif.points.body': '{n} points collected via Twitch Auto',
      'notif.drop.title': 'Drop claimed',
      'notif.drop.bodyNamed': 'Drop: {name}',
      'notif.drop.bodyAnon': 'A drop was claimed',
      'notif.watch.title': 'Participating channel opened',
      'notif.watch.body': 'A channel with {game} drops is open in the background. Click here to show it: Chrome only starts the video once the tab has been shown.',
      'notif.stuck.title': 'Drop stuck',
      'notif.stuck.body': '"{name}" has not moved despite {n} min of watching its game: the channel you watch may not take part in the campaign.'
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

  // Espace insecable avant : ; ? ! » et apres « (regle typographique francaise). Appliquee au
  // MODELE, avant l'insertion des variables : un nom de drop ou un message n'est jamais retouche.
  function frTypo(s) {
    return s.replace(/ ([:;?!»])/g, '\u00a0$1').replace(/« /g, '«\u00a0');
  }

  // Traduit une cle. vars : objet {nom: valeur} pour les {placeholder}.
  // Repli : EN manquant -> FR, FR manquant -> la cle brute (jamais d'erreur).
  function t(lang, key, vars) {
    const code = normLang(lang) || 'fr';
    const dict = STRINGS[code] || STRINGS.fr;
    let s = dict[key];
    let fromFr = code === 'fr';
    if (s == null) { s = STRINGS.fr[key]; fromFr = true; }
    if (s == null) return key;
    if (fromFr) s = frTypo(s);
    if (vars) {
      s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));
    }
    return s;
  }

  const api = { STRINGS, normLang, detectLang, resolveLang, t };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TAi18n = api;
})(typeof self !== 'undefined' ? self : this);
