const assert = require('assert');
const { formatRelativeTime, shouldReload, makeThrottle } = require('../src/shared/util.js');

// formatRelativeTime(ts, now)
assert.strictEqual(formatRelativeTime(null, 1000), 'jamais');
assert.strictEqual(formatRelativeTime(1000, 1000 + 30 * 1000), 'a l instant');
assert.strictEqual(formatRelativeTime(0, 5 * 60 * 1000), 'il y a 5 min');
assert.strictEqual(formatRelativeTime(0, 3 * 60 * 60 * 1000), 'il y a 3 h');
assert.strictEqual(formatRelativeTime(0, 2 * 24 * 60 * 60 * 1000), 'il y a 2 j');

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
