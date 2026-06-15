const assert = require('assert');
const { formatRelativeTime, formatCompact, compareVersions, shouldReload, makeThrottle } = require('../src/shared/util.js');

// formatRelativeTime(ts, now)
assert.strictEqual(formatRelativeTime(null, 1000), 'jamais');
assert.strictEqual(formatRelativeTime(1000, 1000 + 30 * 1000), 'a l instant');
assert.strictEqual(formatRelativeTime(0, 5 * 60 * 1000), 'il y a 5 min');
assert.strictEqual(formatRelativeTime(0, 3 * 60 * 60 * 1000), 'il y a 3 h');
assert.strictEqual(formatRelativeTime(0, 2 * 24 * 60 * 60 * 1000), 'il y a 2 j');

// formatCompact(n)
assert.strictEqual(formatCompact(10), '10');
assert.strictEqual(formatCompact(100), '100');
assert.strictEqual(formatCompact(999), '999');
assert.strictEqual(formatCompact(1000), '1K');
assert.strictEqual(formatCompact(5921), '5,9K');
assert.strictEqual(formatCompact(10000), '10K');
assert.strictEqual(formatCompact(1171270), '1,2M');
assert.strictEqual(formatCompact(999999), '1M');

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

console.log('OK util');
