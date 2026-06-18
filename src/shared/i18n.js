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
      'ui.tab.history': 'Historique',
      'ui.tab.settings': 'Reglages',

      // Onglet Stats
      'ui.aria.points': 'Points reclames',
      'ui.aria.drops': 'Drops reclames',
      'ui.stat.points': 'Points',
      'ui.stat.drops': 'Drops',
      'ui.inProgress': 'Drops en cours',
      'ui.topChannels': 'Top chaines',
      'ui.openInventory': 'Ouvrir mon inventaire de drops',
      'inprog.defaultName': 'Drop',

      // Onglet Historique
      'hist.empty': 'Rien encore reclame',
      'hist.dropDefault': 'Drop reclame',
      'hist.pointsTier': 'Palier {n} points',

      // Onglet Reglages
      'ui.autoswitchPh': 'URL de repli (ex: https://www.twitch.tv/maChaine)',
      'ui.diagTest': 'Tester les selecteurs (sur une page Twitch)',
      'ui.export': 'exporter',
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

      // Meta (visionnage + onglets) : {dur} {n} ; pluriel gere en JS
      'meta.watch': '{dur} de visionnage - {n} onglet{s} actif{s}',

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
      'ui.tab.history': 'History',
      'ui.tab.settings': 'Settings',

      // Stats tab
      'ui.aria.points': 'Points claimed',
      'ui.aria.drops': 'Drops claimed',
      'ui.stat.points': 'Points',
      'ui.stat.drops': 'Drops',
      'ui.inProgress': 'Drops in progress',
      'ui.topChannels': 'Top channels',
      'ui.openInventory': 'Open my drops inventory',
      'inprog.defaultName': 'Drop',

      // History tab
      'hist.empty': 'Nothing claimed yet',
      'hist.dropDefault': 'Drop claimed',
      'hist.pointsTier': '{n} points milestone',

      // Settings tab
      'ui.autoswitchPh': 'Fallback URL (e.g. https://www.twitch.tv/myChannel)',
      'ui.diagTest': 'Test selectors (on a Twitch page)',
      'ui.export': 'export',
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

      // Meta (watch time + tabs): {dur} {n} ; plural handled in JS
      'meta.watch': '{dur} watched - {n} active tab{s}',

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
