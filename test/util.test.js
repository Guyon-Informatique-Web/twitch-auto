const assert = require('assert');
const { formatRelativeTime, formatCompact, compareVersions, shouldReload, makeThrottle, cleanDropName, pruneHistory,
  isInventoryPath, channelSlug, parseCount, sanitizeSettings, sanitizeStats, sanitizeHistory } = require('../src/shared/util.js');
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
}), { enabled: true, drops: false, historyTtlMin: 15, autoSwitchUrl: 'https://www.twitch.tv/gotaga' });
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

console.log('OK util + i18n');
