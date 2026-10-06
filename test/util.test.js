const assert = require('assert');
const { formatRelativeTime, formatCompact, compareVersions, shouldReload, makeThrottle, cleanDropName, pruneHistory,
  isInventoryPath, channelSlug, parseCount, sanitizeSettings, sanitizeStats, sanitizeHistory,
  parseEndDate, campaignRemainingMin, nextFallback, trackProgress, formatRelativeFuture, STUCK_MS } = require('../src/shared/util.js');
const { t: tr, resolveLang, normLang, detectLang } = require('../src/shared/i18n.js');

// formatRelativeTime(ts, now) -> francais par defaut (retrocompatible)
assert.strictEqual(formatRelativeTime(null, 1000), 'jamais');
assert.strictEqual(formatRelativeTime(1000, 1000 + 30 * 1000), 'à l’instant');
assert.strictEqual(formatRelativeTime(0, 5 * 60 * 1000), 'il y a 5 min');
assert.strictEqual(formatRelativeTime(0, 3 * 60 * 60 * 1000), 'il y a 3 h');
assert.strictEqual(formatRelativeTime(0, 2 * 24 * 60 * 60 * 1000), 'il y a 2 j');

// formatRelativeTime(ts, now, 'en') -> anglais
assert.strictEqual(formatRelativeTime(null, 1000, 'en'), 'never');
assert.strictEqual(formatRelativeTime(1000, 1000 + 30 * 1000, 'en'), 'just now');
assert.strictEqual(formatRelativeTime(0, 5 * 60 * 1000, 'en'), '5 min ago');
assert.strictEqual(formatRelativeTime(0, 3 * 60 * 60 * 1000, 'en'), '3 h ago');
assert.strictEqual(formatRelativeTime(0, 2 * 24 * 60 * 60 * 1000, 'en'), '2 d ago');

// formatCompact(n) -> separateur ',' en francais (defaut)
assert.strictEqual(formatCompact(10), '10');
assert.strictEqual(formatCompact(100), '100');
assert.strictEqual(formatCompact(999), '999');
assert.strictEqual(formatCompact(1000), '1K');
assert.strictEqual(formatCompact(5921), '5,9K');
assert.strictEqual(formatCompact(10000), '10K');
assert.strictEqual(formatCompact(1171270), '1,2M');
assert.strictEqual(formatCompact(999999), '1M');

// formatCompact(n, 'en') -> separateur '.'
assert.strictEqual(formatCompact(5921, 'en'), '5.9K');
assert.strictEqual(formatCompact(1171270, 'en'), '1.2M');
assert.strictEqual(formatCompact(1000, 'en'), '1K');

// i18n : normalisation, resolution et interpolation
assert.strictEqual(normLang('en-US'), 'en');
assert.strictEqual(normLang('fr-FR'), 'fr');
assert.strictEqual(normLang('de'), null);
assert.strictEqual(resolveLang({ lang: 'en' }), 'en');
assert.strictEqual(resolveLang({ lang: 'fr' }), 'fr');
assert.strictEqual(['fr', 'en'].includes(resolveLang({})), true); // auto (navigator absent -> 'fr')
assert.strictEqual(['fr', 'en'].includes(detectLang()), true);
assert.strictEqual(tr('fr', 'ui.tab.settings'), 'Réglages');
assert.strictEqual(tr('en', 'ui.tab.settings'), 'Settings');
assert.strictEqual(tr('en', 'hist.pointsTier', { n: '5K' }), '5K points milestone');
assert.strictEqual(tr('fr', 'hist.pointsTier', { n: '5K' }), 'Palier 5K points');
assert.strictEqual(tr('en', 'notif.drop.bodyNamed', { name: 'Skin X' }), 'Drop: Skin X');
assert.strictEqual(tr('en', 'cle.inexistante'), 'cle.inexistante'); // repli sur la cle brute
// Typographie francaise : espace INSECABLE avant ':' et '?', appliquee au modele seulement.
assert.strictEqual(tr('fr', 'notif.drop.bodyNamed', { name: 'Skin : X' }), 'Drop\u00a0: Skin : X',
  'l espace avant ":" du modele devient insecable, celle du nom de drop reste intacte');
assert.ok(/\u00a0\?/.test(tr('fr', 'ui.importAsk')), 'espace insecable avant "?"');
assert.ok(!/\u00a0/.test(tr('en', 'ui.importAsk')), 'jamais d espace insecable en anglais');

// compareVersions(a, b)
assert.strictEqual(compareVersions('1.2.3', '1.2.3'), 0);
assert.strictEqual(compareVersions('1.3.0', '1.2.9'), 1);
assert.strictEqual(compareVersions('1.2.3', '1.2.10'), -1);
assert.strictEqual(compareVersions('1.2', '1.2.0'), 0);
assert.strictEqual(compareVersions('2.0.0', '1.9.9'), 1);

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

// cleanDropName(name) -> retire le verbe d'action en tete ("Recuperer X" -> "X")
assert.strictEqual(cleanDropName('Récupérer Shooting Star'), 'Shooting Star');
assert.strictEqual(cleanDropName('Recuperer Radiant Wilds Chest'), 'Radiant Wilds Chest');
assert.strictEqual(cleanDropName('Récupérer 100 Tech + 10,000 Credits'), '100 Tech + 10,000 Credits');
assert.strictEqual(cleanDropName('Réclamer Bloodfrenzy Drone'), 'Bloodfrenzy Drone');
assert.strictEqual(cleanDropName('Claim Cotton Candy Grrgle'), 'Cotton Candy Grrgle');
assert.strictEqual(cleanDropName('Obtenir Mutant'), 'Mutant');
assert.strictEqual(cleanDropName('Mutant'), 'Mutant');                 // pas de prefixe -> inchange
assert.strictEqual(cleanDropName('Gas Guzzler'), 'Gas Guzzler');
assert.strictEqual(cleanDropName('Get Even'), 'Get Even');             // "get" n'est pas un bouton de claim Twitch -> non touche
assert.strictEqual(cleanDropName('Claim Jumper Deluxe').length > 0, true);
assert.strictEqual(cleanDropName('Récupérer'), 'Récupérer');           // verbe seul (pas de suite) -> inchange
assert.strictEqual(cleanDropName('  Récupérer Skin X  '), 'Skin X');   // espaces externes nettoyes
assert.strictEqual(cleanDropName(''), '');
assert.strictEqual(cleanDropName(null), '');

// pruneHistory(history, now, ttlMin) -> retire les entrees plus vieilles que ttlMin minutes
const NOW = 10 * 60 * 1000;
const hist = [{ ts: 0 }, { ts: 5 * 60 * 1000 }, { ts: 9 * 60 * 1000 }];
assert.strictEqual(pruneHistory(hist, NOW, 0).length, 3, 'ttl 0 -> rien efface');
assert.strictEqual(pruneHistory(hist, NOW, null).length, 3, 'ttl null -> rien efface');
assert.strictEqual(pruneHistory(hist, NOW, '').length, 3, 'ttl vide -> rien efface');
assert.strictEqual(pruneHistory(hist, NOW, 6).length, 2, 'ttl 6 min -> retire l entree de 10 min');
assert.deepStrictEqual(pruneHistory(hist, NOW, 6).map((e) => e.ts), [5 * 60 * 1000, 9 * 60 * 1000]);
assert.strictEqual(pruneHistory(hist, NOW, 6) === hist, false, 'retourne un nouveau tableau (pas de mutation)');
assert.strictEqual(hist.length, 3, 'le tableau d origine n est pas mute');
assert.strictEqual(pruneHistory([{ type: 'drop' }], NOW, 5).length, 1, 'entree sans ts -> gardee');
assert.strictEqual(pruneHistory([], NOW, 5).length, 0, 'historique vide -> vide');

// isInventoryPath : segment EXACT (une chaine "dropsquad" n'est pas l'inventaire)
assert.strictEqual(isInventoryPath('/drops/inventory'), true);
assert.strictEqual(isInventoryPath('/drops/campaigns'), true);
assert.strictEqual(isInventoryPath('/drops'), true);
assert.strictEqual(isInventoryPath('/dropsquad'), false, 'une chaine dont le nom commence par drops n est pas l inventaire');
assert.strictEqual(isInventoryPath('/zerator'), false);
assert.strictEqual(isInventoryPath(''), false);

// channelSlug : toutes les saisies raisonnables donnent le meme slug, le reste donne ''
['zerator', 'ZeratoR', 'twitch.tv/zerator', 'www.twitch.tv/ZeratoR', 'https://twitch.tv/zerator',
  'https://www.twitch.tv/zerator/videos', 'http://m.twitch.tv/zerator?x=1', '  https://www.twitch.tv/zerator  ']
  .forEach((v) => assert.strictEqual(channelSlug(v), 'zerator', `saisie "${v}"`));
assert.strictEqual(channelSlug(''), '');
assert.strictEqual(channelSlug('https://www.youtube.com/zerator'), '', 'autre site refuse');
assert.strictEqual(channelSlug('https://www.twitch.tv/'), '', 'pas de chaine dans l URL');
assert.strictEqual(channelSlug('https://www.twitch.tv/directory', ['directory']), '', 'chemin reserve refuse');
assert.strictEqual(channelSlug('javascript:alert(1)'), '', 'schema dangereux refuse');
assert.strictEqual(channelSlug('evil.com/twitch.tv/zerator'), '', 'domaine pieges refuse');

// parseCount : nombres exacts vs abreges (un ecart de 50 points n'est pas mesurable sur "12,3 k")
assert.deepStrictEqual(parseCount('1 234'), { value: 1234, exact: true });
assert.deepStrictEqual(parseCount('1\u00a0234'), { value: 1234, exact: true });
assert.deepStrictEqual(parseCount('1,234'), { value: 1234, exact: true });
assert.deepStrictEqual(parseCount('850'), { value: 850, exact: true });
assert.deepStrictEqual(parseCount('12,3 k'), { value: 12300, exact: false });
assert.deepStrictEqual(parseCount('1.2K'), { value: 1200, exact: false });
assert.deepStrictEqual(parseCount('3 M'), { value: 3000000, exact: false });
assert.strictEqual(parseCount(''), null);
assert.strictEqual(parseCount('Points de chaine'), null);
assert.strictEqual(parseCount(null), null);

// sanitizeSettings : seules les cles connues, avec le bon type ; jamais errorEndpoint
assert.deepStrictEqual(sanitizeSettings({
  enabled: true, points: 'oui', drops: false, lang: 'de', historyTtlMin: '15',
  autoSwitchUrl: 'twitch.tv/Gotaga', errorEndpoint: 'https://evil.example/collect', __proto__x: 1
}), { enabled: true, drops: false, historyTtlMin: 15, autoSwitchUrl: '', autoSwitchChannels: ['gotaga'] },
  'sauvegarde 1.12.1 (chaine unique) -> liste de chaines de repli');
// Liste de chaines de repli : slugs valides, sans doublon, 5 au plus
assert.deepStrictEqual(sanitizeSettings({ autoSwitchChannels: ['Gotaga', 'twitch.tv/gotaga', 'https://evil.example/', 42, 'zerator'] }),
  { autoSwitchChannels: ['gotaga', 'zerator'] });
assert.deepStrictEqual(sanitizeSettings({ autoSwitchChannels: ['a1', 'b2', 'c3', 'd4', 'e5', 'f6'] }).autoSwitchChannels.length, 5);
assert.deepStrictEqual(sanitizeSettings({ autoSwitchChannels: ['https://evil.example/', 7] }), {},
  'liste entierement invalide : ignoree, la liste deja reglee n est pas effacee');
assert.deepStrictEqual(sanitizeSettings({ autoSwitchChannels: [] }), { autoSwitchChannels: [] }, 'liste vide = choix explicite');
assert.deepStrictEqual(sanitizeSettings({ autoSwitchUrl: 'twitch.tv/gotaga', autoSwitchChannels: ['zerator'] }),
  { autoSwitchUrl: 'https://www.twitch.tv/gotaga', autoSwitchChannels: ['zerator'] }, 'la liste prime, la chaine unique reste telle quelle');
assert.deepStrictEqual(sanitizeSettings({ autoSwitchUrl: 'https://evil.example/' }), {},
  'une URL hors Twitch est ignoree : jamais recopiee, et la chaine deja reglee n est pas effacee');
assert.deepStrictEqual(sanitizeSettings({ autoSwitchUrl: '' }), { autoSwitchUrl: '' }, 'vide = pas de repli (choix explicite)');
assert.deepStrictEqual(sanitizeSettings({ autoSwitchUrl: 'twitch.tv/directory' }, ['directory']), {}, 'chemin reserve ignore');
assert.deepStrictEqual(sanitizeSettings({ historyTtlMin: true }), {}, 'un booleen n est pas une duree');
assert.deepStrictEqual(sanitizeSettings({ historyTtlMin: 1e300 }), {}, 'duree absurde ignoree');
assert.deepStrictEqual(sanitizeSettings({ historyTtlMin: 1440 }), { historyTtlMin: 1440 });
assert.deepStrictEqual(sanitizeSettings(null), {});
assert.deepStrictEqual(sanitizeSettings({ historyTtlMin: -5 }), {}, 'duree negative ignoree');

// sanitizeStats : nombres positifs seulement, chaines valides, jamais inProgress
const st = sanitizeStats({ pointsValue: 27450, dropsClaimed: '14', watchSeconds: -3, lastPointsClaim: null,
  inProgress: [{ name: 'x' }], byChannel: { Zerator: { points: 10, drops: 'x' }, 'pas une chaine!': { points: 1 } } });
assert.deepStrictEqual(st, { pointsValue: 27450, lastPointsClaim: null, byChannel: { zerator: { points: 10, drops: 0, seconds: 0 } } });

// sanitizeHistory : une entree null faisait planter chaque rendu du popup
const sh = sanitizeHistory([null, 5, { type: 'drop', name: 'A', ts: 1, game: 'Rust', extra: 'x' },
  { type: 'points', amount: '5000', ts: 2 }, { type: 'drop', ts: 'hier' }, { type: 'autre', ts: 3 }]);
assert.deepStrictEqual(sh, [{ type: 'drop', ts: 1, name: 'A', game: 'Rust' }, { type: 'points', ts: 2, amount: 5000 }]);
assert.strictEqual(sanitizeHistory(Array.from({ length: 300 }, (_, i) => ({ type: 'drop', ts: i })), 200).length, 200);
assert.deepStrictEqual(sanitizeHistory('pas un tableau'), []);

// parseEndDate : formats FR / EN de l'inventaire ; rien de sur -> null (jamais une date inventee)
const NOW6 = new Date(2026, 9, 6, 15, 0).getTime();
const at = (y, m, d, hh, mm) => new Date(y, m - 1, d, hh, mm).getTime();
assert.strictEqual(parseEndDate('Date de fin : 14 oct. 2026 à 01:59', NOW6, 'fr'), at(2026, 10, 14, 1, 59));
assert.strictEqual(parseEndDate('Se termine le mardi 14 octobre à 01:59', NOW6, 'fr'), at(2026, 10, 14, 1, 59));
assert.strictEqual(parseEndDate('Ends Oct 14, 2026, 1:59 PM', NOW6, 'en'), at(2026, 10, 14, 13, 59));
assert.strictEqual(parseEndDate('Ends Tue, Oct 14, 12:30 AM', NOW6, 'en'), at(2026, 10, 14, 0, 30));
assert.strictEqual(parseEndDate('14/10/2026 01:59', NOW6, 'fr'), at(2026, 10, 14, 1, 59), 'jj/mm/aaaa en francais');
assert.strictEqual(parseEndDate('10/14/2026 1:59 AM', NOW6, 'en'), at(2026, 10, 14, 1, 59), 'mm/jj/aaaa en anglais');
assert.strictEqual(parseEndDate('Se termine dans 3 jours', NOW6, 'fr'), NOW6 + 3 * 864e5);
assert.strictEqual(parseEndDate('Ends in 5 hours', NOW6, 'en'), NOW6 + 5 * 36e5);
assert.strictEqual(parseEndDate('Date de fin : 12 janvier', NOW6, 'fr'), at(2027, 1, 12, 23, 59), 'sans annee ni heure : prochaine occurrence, 23:59');
assert.strictEqual(parseEndDate('Arena Season 3', NOW6, 'fr'), null);
assert.strictEqual(parseEndDate('Date de fin : 14 oct. 2020', NOW6, 'fr'), null, 'date passee : ignoree');
assert.strictEqual(parseEndDate('', NOW6, 'fr'), null);
assert.strictEqual(parseEndDate('Ends Tue, Oct 14, 1:59am', NOW6, 'en'), at(2026, 10, 14, 1, 59), 'heure collee a am/pm');
assert.strictEqual(parseEndDate('Se termine demain à 01:59', NOW6, 'fr'), at(2026, 10, 7, 1, 59));
assert.strictEqual(parseEndDate('12/11/2026', NOW6, 'en'), null, 'jj/mm ou mm/jj : impossible a trancher hors fr / en-us');
assert.strictEqual(parseEndDate('12/11/2026', NOW6, 'en-US'), at(2026, 12, 11, 23, 59), 'mm/jj en anglais americain');
assert.strictEqual(parseEndDate('12/11/2026', NOW6, 'fr-FR'), at(2026, 11, 12, 23, 59), 'jj/mm en francais');
assert.strictEqual(parseEndDate('Date de début : 3 oct. - Date de fin : 14 oct.', NOW6, 'fr'), null, 'deux dates : on ne choisit pas');
assert.strictEqual(parseEndDate('Date de fin : 30 sept.', NOW6, 'fr'), null, 'passee de moins d un mois : campagne finie, pas l an prochain');
// Formats REELS de l'inventaire connecte (releves le 06/10/2026) : jour abrege, virgule apres le
// mois, heure collee, fuseau, espace insecable avant les deux-points. "oct., 12:57" ne doit pas
// donner une seconde date "oct 12" (avant la 1.13.1, aucune date reelle n'etait lue).
{
  const NB = String.fromCharCode(0xa0);
  assert.strictEqual(parseEndDate('Date de fin' + NB + ': ven. 9 oct., 12:57 UTC+2', NOW6, 'fr-FR'), at(2026, 10, 9, 12, 57));
  assert.strictEqual(parseEndDate('Date de fin' + NB + ': sam. 10 oct., 09:59 UTC+2', NOW6, 'fr-FR'), at(2026, 10, 10, 9, 59));
  assert.strictEqual(parseEndDate('Date de fin' + NB + ': mar. 13 oct., 18:00 UTC+2', NOW6, 'fr-FR'), at(2026, 10, 13, 18, 0));
  assert.strictEqual(parseEndDate('Date de fin' + NB + ': lun. 5 oct., 01:58 UTC+2', NOW6, 'fr-FR'), null, 'campagne finie la veille');
  assert.strictEqual(parseEndDate('Ends Fri, Oct 9, 12:57 PM GMT+2', NOW6, 'en-US'), at(2026, 10, 9, 12, 57));
}
assert.strictEqual(parseEndDate('Date de fin : 31 nov. 2026', NOW6, 'fr'), null, 'date impossible');
assert.strictEqual(parseEndDate('Date de fin : 14 oct. 2026, reste 2 h 00 min', NOW6, 'fr'), at(2026, 10, 14, 23, 59),
  'une duree n est pas une heure');
assert.strictEqual(parseEndDate('Date de fin : 14 oct. 2026 à 01:59 (dans 8 jours)', NOW6, 'fr'), at(2026, 10, 14, 1, 59),
  'la date absolue prime sur le relatif ecrit a cote');
assert.strictEqual(parseEndDate('Se termine le mar. 14 oct. à 01:59', NOW6, 'fr'), at(2026, 10, 14, 1, 59),
  'jour abrege : "mar." n est pas mars');
assert.strictEqual(parseEndDate('Ends Mar 14, 2027', NOW6, 'en'), at(2027, 3, 14, 23, 59), 'Mar reste mars en anglais');

// campaignRemainingMin : les drops d'une campagne avancent EN MEME TEMPS -> le plus long
assert.strictEqual(campaignRemainingMin([{ remainingMin: 17 }, { remainingMin: 162 }, { remainingMin: null }]), 162);
assert.strictEqual(campaignRemainingMin([{ remainingMin: null }]), null);
assert.strictEqual(campaignRemainingMin(null), null);

// formatRelativeFuture
assert.strictEqual(formatRelativeFuture(NOW6 + 45 * 6e4, NOW6, 'fr'), 'dans 45 min');
assert.strictEqual(formatRelativeFuture(NOW6 + 3 * 36e5, NOW6, 'fr'), 'dans 3 h');
assert.strictEqual(formatRelativeFuture(NOW6 + 3 * 864e5, NOW6, 'en'), 'in 3 d');

// nextFallback : la suivante de la liste, jamais de retour au debut
assert.strictEqual(nextFallback(['a', 'b', 'c'], 'x'), 'a', 'hors liste -> la premiere');
assert.strictEqual(nextFallback(['a', 'b', 'c'], 'a'), 'b');
assert.strictEqual(nextFallback(['a', 'b', 'c'], 'c'), '', 'bout de la liste : on reste');
assert.strictEqual(nextFallback([], 'a'), '');
assert.strictEqual(nextFallback(null, 'a'), '');

// trackProgress : un drop est BLOQUE si son % ne bouge plus depuis 30 min ALORS qu'on regarde
// SON jeu (temps de lecture compte par jeu : { slug: secondes })
{
  const d = { name: 'Casque', game: 'EFT', campaign: 'S3', gameSlug: 'escape-from-tarkov', percent: 40 };
  const w = (s) => ({ 'escape-from-tarkov': s });
  let r = trackProgress({}, [d], 0, w(1000));
  assert.deepStrictEqual(r.stuck, [], 'premier releve : rien a juger');
  r = trackProgress(r.progress, [d], STUCK_MS, w(1000 + 30 * 60));
  assert.strictEqual(r.stuck.length, 1, '30 min sans bouger avec 30 min de lecture du jeu -> bloque');
  assert.strictEqual(r.stuck[0].since, 0, 'depuis quand le % ne bouge plus (heure affichee par le popup)');
  assert.strictEqual(r.stuck[0].watchedMin, 30, 'minutes de lecture du jeu pendant ce temps (notification)');
  assert.strictEqual(r.stuck[0].gameSlug, 'escape-from-tarkov');
  assert.strictEqual(r.stuck[0].fresh, true, 'pas encore notifie');
  r.progress[r.stuck[0].key].notified = true;
  r = trackProgress(r.progress, [d], STUCK_MS + 6e4, w(1000 + 31 * 60));
  assert.strictEqual(r.stuck[0].fresh, false, 'deja notifie : pas de seconde notification');
  r = trackProgress(r.progress, [{ ...d, percent: 41 }], STUCK_MS + 12e4, w(1000 + 32 * 60));
  assert.deepStrictEqual(r.stuck, [], 'le % repart -> plus bloque');
  // Aucun stream du jeu ne joue : pas d'alerte, rien ne pouvait avancer.
  r = trackProgress({}, [d], 0, w(5000));
  r = trackProgress(r.progress, [d], 2 * STUCK_MS, w(5000 + 60));
  assert.deepStrictEqual(r.stuck, [], 'sans lecture du jeu, un drop immobile n est pas bloque');
  // Une heure de lecture sur un AUTRE jeu ne compte pas (campagne laissee de cote).
  r = trackProgress({}, [d], 0, { 'escape-from-tarkov': 100, rust: 0 });
  r = trackProgress(r.progress, [d], 2 * STUCK_MS, { 'escape-from-tarkov': 100, rust: 3600 });
  assert.deepStrictEqual(r.stuck, [], 'lecture d un autre jeu : pas d alerte');
  // Jeu inconnu (slug absent) : jamais juge.
  r = trackProgress({}, [{ ...d, gameSlug: '' }], 0, w(0));
  r = trackProgress(r.progress, [{ ...d, gameSlug: '' }], 2 * STUCK_MS, w(3600));
  assert.deepStrictEqual(r.stuck, []);
  // Un drop disparu de la liste disparait du suivi.
  r = trackProgress({ 'x|y|z': { pct: 1, since: 0, watch: 0 } }, [d], 10, w(0));
  assert.deepStrictEqual(Object.keys(r.progress), ['EFT|S3|Casque']);
}
// Campagne sequentielle : un autre drop de la campagne avance -> celui-ci attend son tour.
{
  const a = { name: 'A', game: 'EFT', campaign: 'S3', gameSlug: 'eft', percent: 0 };
  const b = { name: 'B', game: 'EFT', campaign: 'S3', gameSlug: 'eft', percent: 50 };
  let r = trackProgress({}, [a, b], 0, { eft: 0 });
  r = trackProgress(r.progress, [a, { ...b, percent: 90 }], STUCK_MS, { eft: 1800 });
  assert.deepStrictEqual(r.stuck, [], 'B avance : A n est pas bloque');
}
// Drop tres long (30 min par point de %) : seuil a deux points, soit 60 min.
{
  const d = { name: 'Long', game: 'EFT', campaign: 'S4', gameSlug: 'eft', percent: 40, remainingMin: 1800 };
  let r = trackProgress({}, [d], 0, { eft: 0 });
  r = trackProgress(r.progress, [d], STUCK_MS, { eft: 1800 });
  assert.deepStrictEqual(r.stuck, [], '30 min : un drop long peut ne pas avoir bouge');
  r = trackProgress(r.progress, [d], 2 * STUCK_MS, { eft: 3600 });
  assert.strictEqual(r.stuck.length, 1, '60 min sans bouger : bloque');
}
// Jeu illisible au premier releve, lu au suivant : le suivi le rattrape (sinon plus d'alerte).
{
  const d = { name: 'Casque', game: 'EFT', campaign: 'S3', percent: 40 };
  let r = trackProgress({}, [{ ...d, gameSlug: '' }], 0, { eft: 0 });
  assert.strictEqual(r.progress['EFT|S3|Casque'].watch, null);
  r = trackProgress(r.progress, [{ ...d, gameSlug: 'eft' }], 6e4, { eft: 100 });
  assert.strictEqual(r.progress['EFT|S3|Casque'].watch, 100, 'compteur rattrape, date du dernier mouvement gardee');
  assert.strictEqual(r.progress['EFT|S3|Casque'].since, 0);
  r = trackProgress(r.progress, [{ ...d, gameSlug: 'eft' }], STUCK_MS + 6e4, { eft: 100 + 1800 });
  assert.strictEqual(r.stuck.length, 1);
}
// Un jeu nomme "constructor" (slug reel) ne lit pas Object.prototype.
{
  const d = { name: 'X', game: 'Constructor', campaign: 'C', gameSlug: 'constructor', percent: 10 };
  let r = trackProgress({}, [d], 0, {});
  assert.strictEqual(r.progress['Constructor|C|X'].watch, 0);
  r = trackProgress(r.progress, [d], STUCK_MS, { constructor: 1800 });
  assert.strictEqual(r.stuck.length, 1);
}
// Ancienne forme du suivi (sans 'watch') : repart de zero au lieu de tout juger d'un coup.
{
  const d = { name: 'Casque', game: 'EFT', campaign: 'S3', gameSlug: 'eft', percent: 40 };
  const r = trackProgress({ 'EFT|S3|Casque': { pct: 40, since: 0 } }, [d], 2 * STUCK_MS, { eft: 7200 });
  assert.deepStrictEqual(r.stuck, []);
  assert.strictEqual(r.progress['EFT|S3|Casque'].since, 2 * STUCK_MS);
}

console.log('OK util + i18n');
