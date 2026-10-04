// v0.36.0 (plan v0.36.0-polish QĐ 28–37, ADR 0016) — pure placement helpers of TdToast.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PLACEMENTS, DEFAULT_PLACEMENT, LEGACY, LEGACY_TOKEN_DEFAULTS, isPlacement, legacyCustomized, resolvePlacement, olderSet,
  toastOptions, edgeOf,
} from './toast-placement.js';

const DEFAULTS = { ...LEGACY_TOKEN_DEFAULTS };

test('six logical placements, frozen; no physical names', () => {
  assert.deepEqual(PLACEMENTS, ['top-start', 'top-center', 'top-end', 'bottom-start', 'bottom-center', 'bottom-end']);
  assert.equal(Object.isFrozen(PLACEMENTS), true);
  for (const bad of ['top-right', 'left', 'bottom-left', 'TOP-END', ' top-end', '', null, 3, {}]) assert.equal(isPlacement(bad), false);
  assert.equal(DEFAULT_PLACEMENT, 'top-end');
});

test('legacy tokens: shipped values (or empty) = not customised; any one different = customised', () => {
  assert.equal(legacyCustomized(null), false);
  assert.equal(legacyCustomized({}), false);
  assert.equal(legacyCustomized(DEFAULTS), false);
  assert.equal(legacyCustomized({ ...DEFAULTS, '--td-toast-top': ' 5rem ' }), false);
  assert.equal(legacyCustomized({ ...DEFAULTS, '--td-toast-align': 'FLEX-END' }), false);
  for (const k of Object.keys(DEFAULTS)) {
    assert.equal(legacyCustomized({ ...DEFAULTS, [k]: '1.5rem' }), true, k);
  }
  // the 135 / dwp bottom-centre recipe
  assert.equal(legacyCustomized({ ...DEFAULTS, '--td-toast-top': 'auto', '--td-toast-bottom': '1.5rem' }), true);
});

test('precedence: call > configure > legacy tokens > top-end', () => {
  const custom = { ...DEFAULTS, '--td-toast-bottom': '1.5rem', '--td-toast-top': 'auto' };
  assert.equal(resolvePlacement(null, null, DEFAULTS), 'top-end');
  assert.equal(resolvePlacement(undefined, undefined, null), 'top-end');
  assert.equal(resolvePlacement(null, null, custom), LEGACY);
  assert.equal(resolvePlacement(null, 'bottom-start', custom), 'bottom-start');
  assert.equal(resolvePlacement('top-center', 'bottom-start', custom), 'top-center');
  assert.equal(resolvePlacement('bottom-end', null, DEFAULTS), 'bottom-end');
});

test('an invalid value is reported and the next level decides', () => {
  const seen = [];
  const on = (v, level) => seen.push([v, level]);
  assert.equal(resolvePlacement('top-right', 'bottom-center', DEFAULTS, on), 'bottom-center');
  assert.equal(resolvePlacement('nope', 'also-bad', DEFAULTS, on), 'top-end');
  assert.equal(resolvePlacement('nope', null, { ...DEFAULTS, '--td-toast-shift': '-50%' }, on), LEGACY);
  assert.deepEqual(seen, [['top-right', 'call'], ['nope', 'call'], ['also-bad', 'configure'], ['nope', 'call']]);
  assert.equal(resolvePlacement('bad', null, DEFAULTS), 'top-end'); // no callback: still falls through
});

test('olderSet keeps the two largest sequence numbers globally', () => {
  assert.deepEqual([...olderSet([])], []);
  assert.deepEqual([...olderSet([4])], []);
  assert.deepEqual([...olderSet([1, 2])], []);
  assert.deepEqual([...olderSet([5, 1, 9, 3])].sort((a, b) => a - b), [1, 3]);
  assert.deepEqual([...olderSet([5, 1, 9, 3], 1)].sort((a, b) => a - b), [1, 3, 5]);
  assert.deepEqual([...olderSet([5, 1, 9, 3], 0)].sort((a, b) => a - b), [1, 3, 5, 9]);
});

test('third argument: number | numeric string | { duration?, placement? }', () => {
  assert.deepEqual(toastOptions(undefined, 4000), { duration: 4000, placement: null });
  assert.deepEqual(toastOptions(0, 4000), { duration: 0, placement: null });
  assert.deepEqual(toastOptions('3000', 5000), { duration: '3000', placement: null });
  assert.deepEqual(toastOptions({}, 5000), { duration: 5000, placement: null });
  assert.deepEqual(toastOptions({ placement: 'bottom-end' }, 5000), { duration: 5000, placement: 'bottom-end' });
  assert.deepEqual(toastOptions({ duration: 0, placement: 'top-start' }, 4000), { duration: 0, placement: 'top-start' });
  assert.deepEqual(toastOptions(null, 4000), { duration: null, placement: null }); // as before: null → sticky
});

test('edgeOf', () => {
  assert.equal(edgeOf('top-start'), 'top');
  assert.equal(edgeOf('top-center'), 'top');
  assert.equal(edgeOf('bottom-end'), 'bottom');
});
