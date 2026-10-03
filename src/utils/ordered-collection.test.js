// v0.30.0 (plan docs/internal/plans/v0.30.0-number-repeater.md M4) — OrderedCollectionModel: an ordered list of opaque
// keys + count limits. No DOM, no events. Used by <td-repeater> (and v0.31 td-sortable: move / keys).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { OrderedCollectionModel } from './ordered-collection.js';

function mk(opts = {}) {
  const warns = [];
  const m = new OrderedCollectionModel({ ...opts, warn: (msg) => warns.push(String(msg)) });
  return { m, warns };
}

describe('ordered-collection — basics', () => {
  it('empty by default: size 0, no limits', () => {
    const { m } = mk();
    assert.equal(m.size, 0);
    assert.deepEqual(m.keys(), []);
    assert.equal(m.min, 0);
    assert.equal(m.max, Infinity);
    assert.equal(m.canAdd(), true);
    assert.equal(m.canRemove(), false);
  });

  it('keys() is a copy; indexOf / at', () => {
    const a = {}; const b = {}; const c = {};
    const { m } = mk({ keys: [a, b, c] });
    const k = m.keys();
    k.pop();
    assert.equal(m.size, 3);
    assert.equal(m.indexOf(b), 1);
    assert.equal(m.indexOf({}), -1);
    assert.equal(m.at(2), c);
    assert.equal(m.at(3), undefined);
    assert.equal(m.at(-1), undefined);
  });

  it('initial duplicate keys: the first one wins (one warning)', () => {
    const { m, warns } = mk({ keys: ['a', 'b', 'a', 'a'] });
    assert.deepEqual(m.keys(), ['a', 'b']);
    assert.equal(warns.length, 1);
  });
});

describe('ordered-collection — insert / remove', () => {
  it('insert at the end by default, at an index, clamped to [0, size]', () => {
    const { m } = mk({ keys: ['a'] });
    assert.equal(m.insert('b'), 1);
    assert.equal(m.insert('c', 0), 0);
    assert.equal(m.insert('d', 99), 3);
    assert.equal(m.insert('e', -5), 0);
    assert.deepEqual(m.keys(), ['e', 'c', 'a', 'b', 'd']);
  });

  it('insert: a duplicate key → -1 (unchanged)', () => {
    const { m } = mk({ keys: ['a', 'b'] });
    assert.equal(m.insert('a'), -1);
    assert.deepEqual(m.keys(), ['a', 'b']);
  });

  it('insert: full (size >= max) → -1', () => {
    const { m } = mk({ keys: ['a', 'b'], max: 2 });
    assert.equal(m.canAdd(), false);
    assert.equal(m.insert('c'), -1);
    assert.deepEqual(m.keys(), ['a', 'b']);
  });

  it('remove returns the former index; missing key → -1', () => {
    const { m } = mk({ keys: ['a', 'b', 'c'] });
    assert.equal(m.remove('b'), 1);
    assert.deepEqual(m.keys(), ['a', 'c']);
    assert.equal(m.remove('zz'), -1);
  });

  it('remove at min → -1 (unchanged)', () => {
    const { m } = mk({ keys: ['a', 'b'], min: 2 });
    assert.equal(m.canRemove(), false);
    assert.equal(m.remove('a'), -1);
    assert.deepEqual(m.keys(), ['a', 'b']);
  });

  it('canRemove: size > min', () => {
    const { m } = mk({ keys: ['a', 'b'], min: 1 });
    assert.equal(m.canRemove(), true);
    m.remove('a');
    assert.equal(m.canRemove(), false);
  });
});

describe('ordered-collection — move', () => {
  it('move(from, to) puts the key AT index `to`', () => {
    const { m } = mk({ keys: ['a', 'b', 'c', 'd'] });
    assert.equal(m.move(0, 2), true);
    assert.deepEqual(m.keys(), ['b', 'c', 'a', 'd']);
    assert.equal(m.move(3, 0), true);
    assert.deepEqual(m.keys(), ['d', 'b', 'c', 'a']);
  });

  it('out of range / same index → false (unchanged)', () => {
    const { m } = mk({ keys: ['a', 'b'] });
    for (const [f, t] of [[0, 0], [-1, 0], [0, 2], [2, 0], [0, -1], [0.5, 1], [NaN, 0]]) {
      assert.equal(m.canMove(f, t), false, `${f}->${t}`);
      assert.equal(m.move(f, t), false, `${f}->${t}`);
    }
    assert.deepEqual(m.keys(), ['a', 'b']);
    assert.equal(m.canMove(0, 1), true);
  });

  it('move ignores min / max (a full collection can still be reordered)', () => {
    const { m } = mk({ keys: ['a', 'b'], min: 2, max: 2 });
    assert.equal(m.move(1, 0), true);
    assert.deepEqual(m.keys(), ['b', 'a']);
  });
});

describe('ordered-collection — limits', () => {
  it('min / max are coerced to integers >= 0; invalid → defaults', () => {
    const { m } = mk({ min: '2', max: '5' });
    assert.equal(m.min, 2);
    assert.equal(m.max, 5);
    m.setLimits({ min: -3, max: 'abc' });
    assert.equal(m.min, 0);
    assert.equal(m.max, Infinity);
    m.setLimits({ min: 1.7, max: 3.2 });
    assert.equal(m.min, 1);
    assert.equal(m.max, 3);
    m.setLimits({ min: null, max: null });
    assert.equal(m.min, 0);
    assert.equal(m.max, Infinity);
  });

  it('max < min → max = min (one warning)', () => {
    const { m, warns } = mk({ min: 3, max: 1 });
    assert.equal(m.max, 3);
    assert.equal(warns.length, 1);
    m.setLimits({ min: 4, max: 2 });
    assert.equal(m.max, 4);
    assert.equal(warns.length, 1, 'once');
  });

  it('initial keys above max: all kept, one warning; canAdd false', () => {
    const { m, warns } = mk({ keys: ['a', 'b', 'c'], max: 2 });
    assert.deepEqual(m.keys(), ['a', 'b', 'c']);
    assert.equal(m.canAdd(), false);
    assert.equal(warns.length, 1);
  });

  it('setLimits never removes extra keys (max lowered → only canAdd false)', () => {
    const { m } = mk({ keys: ['a', 'b', 'c'] });
    m.setLimits({ max: 1 });
    assert.equal(m.size, 3);
    assert.equal(m.canAdd(), false);
    assert.equal(m.remove('a'), 0, 'removing is still allowed above max');
  });
});

describe('ordered-collection — reset', () => {
  it('replaces the whole order; min / max not applied; duplicates dropped', () => {
    const { m } = mk({ keys: ['a'], min: 2, max: 2 });
    m.reset(['x', 'y', 'z', 'y']);
    assert.deepEqual(m.keys(), ['x', 'y', 'z']);
    m.reset([]);
    assert.equal(m.size, 0);
    assert.equal(m.canRemove(), false);
  });

  it('reset does not warn about max (DOM is the source of truth)', () => {
    const { m, warns } = mk({ max: 1 });
    m.reset(['a', 'b']);
    assert.equal(warns.length, 0);
  });
});

describe('ordered-collection — focusAfterRemove', () => {
  it('the row taking the place, else the previous, empty → -1', () => {
    // size = size AFTER the removal
    assert.equal(OrderedCollectionModel.focusAfterRemove(1, 3), 1);
    assert.equal(OrderedCollectionModel.focusAfterRemove(0, 2), 0);
    assert.equal(OrderedCollectionModel.focusAfterRemove(3, 3), 2, 'last row removed → previous');
    assert.equal(OrderedCollectionModel.focusAfterRemove(0, 0), -1);
  });
});
