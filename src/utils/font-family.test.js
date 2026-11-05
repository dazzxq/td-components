import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fontFamilyOf } from './font-family.js';

// Node has no `document`: only the pure gate runs (the CSSOM read-back is covered by the browser test), so every
// value comes back '' — the point here is that nothing throws and the pure rejections never reach CSSOM.
test('v0.97.0 fontFamilyOf: no DOM → "" without throwing', () => {
  assert.equal(fontFamilyOf('"Roboto", sans-serif'), '');
});

test('v0.97.0 fontFamilyOf: non-strings, empty, too long, control chars, CSS-wide keywords → ""', () => {
  for (const v of [null, undefined, 12, {}, '', '   ', 'a'.repeat(201), 'Roboto\nArial', 'inherit', 'INITIAL', 'unset',
    'revert', 'revert-layer']) {
    assert.equal(fontFamilyOf(v), '', String(v));
  }
});
