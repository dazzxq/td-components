// v0.95.0 (plan docs/internal/plans/v0.95.0-selection-bar.md §4.3 / §5.4 / §11.1) — the pure halves of the selection
// group: rangeAcross (Shift range over the member grids of a group) and fitActions (td-selection-bar overflow with
// hysteresis). The DOM halves are browser-tested (td-v095-*.engines.browser-test.js).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { rangeAcross, fitActions } from './media-selection-group.js';

const mem = (ids, opts = {}) => ({
  ids,
  pending: new Set(opts.pending || []),
  selected: new Set(opts.selected || []),
  max: opts.max ?? Infinity,
  disabled: !!opts.disabled,
});

/** td-media-grid `_userFlip` Shift branch before v0.95.0 (the single-grid reference) */
function legacyRange(ids, pending, selected, max, from, to) {
  const next = new Set(selected);
  let limited = false;
  const step = to >= from ? 1 : -1;
  for (let i = from; ; i += step) {
    if (!next.has(ids[i]) && !pending.has(ids[i])) {
      if (next.size >= max) { limited = true; break; }
      next.add(ids[i]);
    }
    if (i === to) break;
  }
  return { added: [...next].filter((id) => !selected.has(id)), limited };
}

/** mulberry32 — fixed seed, same cases on every run */
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('rangeAcross', () => {
  const three = () => [mem(['a1', 'a2', 'a3']), mem(['b1', 'b2']), mem(['c1', 'c2', 'c3'])];

  it('forward across 3 grids: anchor → target, both included', () => {
    const r = rangeAcross(three(), { member: 0, index: 1 }, { member: 2, index: 0 });
    assert.deepEqual(r.adds, [['a2', 'a3'], ['b1', 'b2'], ['c1']]);
    assert.deepEqual(r.limited, [false, false, false]);
  });

  it('backward across 3 grids (target before the anchor)', () => {
    const r = rangeAcross(three(), { member: 2, index: 1 }, { member: 0, index: 2 });
    assert.deepEqual(r.adds, [['a3'], ['b2', 'b1'], ['c2', 'c1']]);
  });

  it('adds only: already selected ids are kept, never removed', () => {
    const m = three();
    m[1].selected = new Set(['b1']);
    const r = rangeAcross(m, { member: 0, index: 2 }, { member: 1, index: 1 });
    assert.deepEqual(r.adds, [['a3'], ['b2'], []]);
  });

  it('skips pending items (not counted against max)', () => {
    const m = [mem(['a1', 'a2', 'a3'], { pending: ['a2'], max: 2 }), mem(['b1', 'b2'], { pending: ['b1'] })];
    const r = rangeAcross(m, { member: 0, index: 0 }, { member: 1, index: 1 });
    assert.deepEqual(r.adds, [['a1', 'a3'], ['b2']]);
    assert.deepEqual(r.limited, [false, false]);
  });

  it('each grid stops at its own max (limit flag) and the range goes on in the next grid (Q4)', () => {
    const m = [mem(['a1', 'a2', 'a3', 'a4'], { max: 2, selected: ['a4'] }), mem(['b1', 'b2']), mem(['c1'], { max: 1 })];
    const r = rangeAcross(m, { member: 0, index: 0 }, { member: 2, index: 0 });
    assert.deepEqual(r.adds, [['a1'], ['b1', 'b2'], ['c1']]);
    assert.deepEqual(r.limited, [true, false, false]);
  });

  it('a disabled grid inside the range is skipped', () => {
    const m = three();
    m[1].disabled = true;
    const r = rangeAcross(m, { member: 0, index: 2 }, { member: 2, index: 1 });
    assert.deepEqual(r.adds, [['a3'], [], ['c1', 'c2']]);
  });

  it('empty grids between anchor and target are crossed', () => {
    const m = [mem(['a1']), mem([]), mem([]), mem(['d1', 'd2'])];
    assert.deepEqual(rangeAcross(m, { member: 0, index: 0 }, { member: 3, index: 1 }).adds, [['a1'], [], [], ['d1', 'd2']]);
    assert.deepEqual(rangeAcross(m, { member: 3, index: 1 }, { member: 0, index: 0 }).adds, [['a1'], [], [], ['d2', 'd1']]);
  });

  it('the same id in two grids: the item inside the range is the one added', () => {
    const m = [mem(['x', 'y']), mem(['x', 'z'])];
    const r = rangeAcross(m, { member: 0, index: 1 }, { member: 1, index: 0 });
    assert.deepEqual(r.adds, [['y'], ['x']]);
  });

  it('invalid anchor / target → no change', () => {
    const m = three();
    assert.deepEqual(rangeAcross(m, { member: 0, index: 9 }, { member: 1, index: 0 }).adds, [[], [], []]);
    assert.deepEqual(rangeAcross(m, { member: 5, index: 0 }, { member: 1, index: 0 }).adds, [[], [], []]);
    assert.deepEqual(rangeAcross(m, { member: 0, index: 0 }, { member: 1, index: -1 }).adds, [[], [], []]);
  });

  it('anchor and target in the same grid = the single-grid algorithm (200 random cases)', () => {
    const rand = prng(0x95);
    for (let c = 0; c < 200; c++) {
      const n = 1 + Math.floor(rand() * 12);
      const ids = Array.from({ length: n }, (_, i) => `i${i}`);
      const pending = new Set(ids.filter(() => rand() < 0.15));
      const selected = new Set(ids.filter((id) => !pending.has(id) && rand() < 0.3));
      const max = rand() < 0.4 ? 1 + Math.floor(rand() * n) : Infinity;
      const from = Math.floor(rand() * n);
      const to = Math.floor(rand() * n);
      const ref = legacyRange(ids, pending, selected, max, from, to);
      const got = rangeAcross([{ ids, pending, selected, max }], { member: 0, index: from }, { member: 0, index: to });
      assert.deepEqual(new Set(got.adds[0]), new Set(ref.added), `case ${c}`);
      assert.equal(got.limited[0], ref.limited, `case ${c} limited`);
    }
  });

  it('does not mutate the members', () => {
    const m = three();
    m[0].selected = new Set(['a1']);
    rangeAcross(m, { member: 0, index: 0 }, { member: 2, index: 2 });
    assert.deepEqual([...m[0].selected], ['a1']);
  });

  it('50 grids × 40 items: one pass, linear', () => {
    const m = Array.from({ length: 50 }, (_, g) => mem(Array.from({ length: 40 }, (_, i) => `g${g}-${i}`)));
    const t = performance.now();
    const r = rangeAcross(m, { member: 0, index: 0 }, { member: 49, index: 39 });
    assert.equal(r.adds.reduce((s, a) => s + a.length, 0), 2000);
    assert.ok(performance.now() - t < 200);
  });
});

describe('fitActions', () => {
  const W = [80, 80, 80, 80]; // 320 + 3 gaps of 8 = 344

  it('everything fits → all shown', () => {
    assert.equal(fitActions(W, 400, 44, null, 8), 4);
    assert.equal(fitActions(W, 345, 44, null, 8), 4); // need 344 ≤ avail + 1
  });

  it('enters the overflow past avail + 1; keeps as many as fit next to "…"', () => {
    // need(k) = 80k + 8k + 44: k=2 → 220, k=3 → 308
    assert.equal(fitActions(W, 343, 44, 4, 8), 4, 'within the 1px tolerance');
    assert.equal(fitActions(W, 342, 44, 4, 8), 3);
    assert.equal(fitActions(W, 330, 44, 4, 8), 3);
    assert.equal(fitActions(W, 250, 44, null, 8), 2);
    assert.equal(fitActions(W, 100, 44, null, 8), 0, 'only "…" left');
  });

  it('leaves the overflow only with 4px to spare (no flip-flop)', () => {
    assert.equal(fitActions(W, 345, 44, 3, 8), 3, '344 > 345 − 4 → stays');
    assert.equal(fitActions(W, 347, 44, 3, 8), 3);
    assert.equal(fitActions(W, 348, 44, 3, 8), 4, '344 ≤ 348 − 4 → leaves');
  });

  it('grows / shrinks the visible count with the same hysteresis inside the overflow', () => {
    // from 2 visible: k=3 needs 308 → grows only when 308 ≤ avail − 4
    assert.equal(fitActions(W, 311, 44, 2, 8), 2);
    assert.equal(fitActions(W, 312, 44, 2, 8), 3);
    // from 3 visible: shrinks when 308 > avail + 1
    assert.equal(fitActions(W, 307, 44, 3, 8), 3);
    assert.equal(fitActions(W, 306, 44, 3, 8), 2);
  });

  it('resizing back and forth around the edge is stable', () => {
    let k = null;
    const seq = [];
    for (const w of [400, 343, 342, 343, 344, 343, 330, 345, 347, 348, 346]) {
      k = fitActions(W, w, 44, k, 8);
      seq.push(k);
    }
    assert.deepEqual(seq, [4, 4, 3, 3, 3, 3, 3, 3, 3, 4, 4]);
  });

  it('no actions → 0', () => {
    assert.equal(fitActions([], 300, 44, null), 0);
  });
});
