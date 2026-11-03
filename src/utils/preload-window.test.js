import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePreload, preloadWindow, PRELOAD_MAX } from './preload-window.js';

// v0.95.0 (plan v0.95.0-small-kit §6.1 / §6.6): the lightbox preload window and option — pure, node-tested.
describe('preloadWindow (v0.95.0)', () => {
  it('default ±1: next first, then previous; wraps', () => {
    assert.deepEqual(preloadWindow(0, 10, 1, 1), [1, 9]);
    assert.deepEqual(preloadWindow(5, 10, 1, 1), [6, 4]);
    assert.deepEqual(preloadWindow(9, 10, 1, 1), [0, 8]);
  });

  it('interleaves by distance: +1, −1, +2, −2, … and stops each side at its own count', () => {
    assert.deepEqual(preloadWindow(5, 10, 2, 1), [6, 4, 7]);
    assert.deepEqual(preloadWindow(5, 10, 1, 3), [6, 4, 3, 2]);
    assert.deepEqual(preloadWindow(5, 10, 3, 3), [6, 4, 7, 3, 8, 2]);
    assert.deepEqual(preloadWindow(0, 10, 2, 0), [1, 2]);
    assert.deepEqual(preloadWindow(0, 10, 0, 2), [9, 8]);
  });

  it('both 0 → nothing', () => {
    assert.deepEqual(preloadWindow(3, 10, 0, 0), []);
  });

  it('n < 2 → nothing; n = 2 → the other position once', () => {
    assert.deepEqual(preloadWindow(0, 1, 5, 5), []);
    assert.deepEqual(preloadWindow(0, 0, 1, 1), []);
    assert.deepEqual(preloadWindow(0, 2, 1, 1), [1]);
    assert.deepEqual(preloadWindow(1, 2, 5, 5), [0]);
  });

  it('small galleries wrap onto themselves: repeats and the current position are dropped', () => {
    assert.deepEqual(preloadWindow(0, 3, 2, 2), [1, 2]);
    assert.deepEqual(preloadWindow(1, 3, 5, 5), [2, 0]);
    assert.deepEqual(preloadWindow(2, 5, 5, 5), [3, 1, 4, 0]);
  });

  it(`counts are clamped to [0, ${PRELOAD_MAX}] and floored; non-numbers fall back to 1`, () => {
    assert.equal(PRELOAD_MAX, 5);
    assert.deepEqual(preloadWindow(0, 20, 99, 0), [1, 2, 3, 4, 5]);
    assert.deepEqual(preloadWindow(0, 20, 2.9, 0), [1, 2]);
    assert.deepEqual(preloadWindow(0, 20, -3, 0), []);
    assert.deepEqual(preloadWindow(0, 20, NaN, 0), [1]);
    assert.deepEqual(preloadWindow(0, 20, '3', 0), [1]);
    assert.deepEqual(preloadWindow(0, 20, Infinity, 0), [1]);
  });

  it('a bad index / length → nothing', () => {
    assert.deepEqual(preloadWindow(-1, 5, 1, 1), []);
    assert.deepEqual(preloadWindow(5, 5, 1, 1), []);
    assert.deepEqual(preloadWindow(1.5, 5, 1, 1), []);
    assert.deepEqual(preloadWindow(0, 2.5, 1, 1), []);
  });
});

describe('normalizePreload (v0.95.0)', () => {
  it('the three v0.24.0 values keep their meaning', () => {
    assert.equal(normalizePreload(false), false);
    assert.deepEqual(normalizePreload('same-origin'), { ahead: 1, behind: 1, cross: 'none' });
    assert.deepEqual(normalizePreload('all'), { ahead: 1, behind: 1, cross: 'all' });
  });

  it('missing / unknown → ±1 same origin', () => {
    for (const v of [undefined, null, true, 0, 1, '', 'ALL', 'none', [], [1, 2]]) {
      assert.deepEqual(normalizePreload(v), { ahead: 1, behind: 1, cross: 'none' }, String(v));
    }
  });

  it('object: counts (default 1, clamp 0..5, floor, junk → 1)', () => {
    assert.deepEqual(normalizePreload({}), { ahead: 1, behind: 1, cross: 'none' });
    assert.deepEqual(normalizePreload({ ahead: 2, behind: 1 }), { ahead: 2, behind: 1, cross: 'none' });
    assert.deepEqual(normalizePreload({ ahead: 0, behind: 0 }), { ahead: 0, behind: 0, cross: 'none' });
    assert.deepEqual(normalizePreload({ ahead: 9, behind: -1 }), { ahead: 5, behind: 0, cross: 'none' });
    assert.deepEqual(normalizePreload({ ahead: 2.7, behind: NaN }), { ahead: 2, behind: 1, cross: 'none' });
    assert.deepEqual(normalizePreload({ ahead: '3', behind: null }), { ahead: 1, behind: 1, cross: 'none' });
  });

  it('object: allowCrossOrigin function → kept by reference; true → all; anything else → none', () => {
    const fn = () => true;
    assert.equal(normalizePreload({ allowCrossOrigin: fn }).cross, fn);
    assert.equal(normalizePreload({ allowCrossOrigin: true }).cross, 'all');
    for (const v of [false, 'all', 1, {}, null, undefined]) {
      assert.equal(normalizePreload({ allowCrossOrigin: v }).cross, 'none', String(v));
    }
  });
});
