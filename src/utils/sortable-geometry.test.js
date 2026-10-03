// v0.31.0 (plan docs/internal/plans/v0.31.0-sortable-masked.md M1) — pure geometry of the SortableController: slot
// snapshot → layout kind, hit-test, preview shifts, keyboard targets, auto-scroll speed. No DOM.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  columns, layoutKind, hitSlot, shiftDeltas, keyTarget, autoScrollSpeed, slotRect,
} from './sortable-geometry.js';

/** a vertical list: heights h[i], gap g, starting at y0 */
function vlist(heights, g = 8, y0 = 0, x = 0, w = 200) {
  let y = y0;
  return heights.map((h) => { const r = { x, y, w, h }; y += h + g; return r; });
}
/** a horizontal row: widths w[i], gap g */
function hrow(widths, g = 10, x0 = 0, y = 0, h = 40) {
  let x = x0;
  return widths.map((w) => { const r = { x, y, w, h }; x += w + g; return r; });
}
/** a uniform grid: n items, cols columns, cell w × h, gap g */
function grid(n, cols, w = 100, h = 100, g = 10) {
  return Array.from({ length: n }, (_, i) => ({ x: (i % cols) * (w + g), y: Math.floor(i / cols) * (h + g), w, h }));
}

describe('sortable-geometry — columns / layoutKind', () => {
  it('vertical list → 1 column, "column"', () => {
    const r = vlist([40, 80, 20]);
    assert.equal(columns(r), 1);
    assert.equal(layoutKind(r), 'column');
  });
  it('horizontal row → n columns, "row"', () => {
    const r = hrow([50, 70, 30, 40]);
    assert.equal(columns(r), 4);
    assert.equal(layoutKind(r), 'row');
  });
  it('3-column grid (full and last row short) → 3, "grid"', () => {
    assert.equal(columns(grid(6, 3)), 3);
    assert.equal(layoutKind(grid(6, 3)), 'grid');
    assert.equal(columns(grid(7, 3)), 3);
    assert.equal(layoutKind(grid(7, 3)), 'grid');
  });
  it('rows aligned within 2px count as the same row; empty / single', () => {
    const r = [{ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 1.5, w: 10, h: 10 }, { x: 40, y: 2, w: 10, h: 10 }, { x: 0, y: 30, w: 10, h: 10 }];
    assert.equal(columns(r), 3);
    assert.equal(columns([]), 0);
    assert.equal(columns([{ x: 0, y: 0, w: 1, h: 1 }]), 1);
    assert.equal(layoutKind([{ x: 0, y: 0, w: 1, h: 1 }]), 'column');
    assert.equal(layoutKind([]), 'column');
  });
});

describe('sortable-geometry — hitSlot', () => {
  const r = grid(6, 3);
  it('point inside a cell → that cell', () => {
    assert.equal(hitSlot(r, 50, 50), 0);
    assert.equal(hitSlot(r, 160, 160), 4);
    assert.equal(hitSlot(r, 329, 209), 5);
  });
  it('point in the gap between cells → nearest centre', () => {
    assert.equal(hitSlot(r, 104, 50), 0); // gap 100..110, closer to cell 0 centre (50) than cell 1 (160)
    assert.equal(hitSlot(r, 107, 50), 1); // 107: |107-50|=57 > |107-160|=53
  });
  it('outside the host → nearest centre', () => {
    assert.equal(hitSlot(r, -500, -500), 0);
    assert.equal(hitSlot(r, 5000, 5000), 5);
    assert.equal(hitSlot(r, 5000, 0), 2);
  });
  it('empty → -1', () => {
    assert.equal(hitSlot([], 0, 0), -1);
  });
});

describe('sortable-geometry — shiftDeltas', () => {
  it('from === to → all zero', () => {
    const d = shiftDeltas(vlist([40, 80, 20]), 1, 1);
    assert.deepEqual(d, [{ dx: 0, dy: 0 }, { dx: 0, dy: 0 }, { dx: 0, dy: 0 }]);
  });
  it('column, from < to: items in (from, to] move up by the dragged height + measured gap (mixed heights)', () => {
    const r = vlist([40, 80, 20, 60], 8);
    const d = shiftDeltas(r, 0, 2);
    assert.deepEqual(d, [{ dx: 0, dy: 0 }, { dx: 0, dy: -48 }, { dx: 0, dy: -48 }, { dx: 0, dy: 0 }]);
  });
  it('column, from > to: items in [to, from) move down by the dragged height + gap', () => {
    const r = vlist([40, 80, 20, 60], 8);
    const d = shiftDeltas(r, 3, 1);
    assert.deepEqual(d, [{ dx: 0, dy: 0 }, { dx: 0, dy: 68 }, { dx: 0, dy: 68 }, { dx: 0, dy: 0 }]);
  });
  it('an explicit gap wins over the measured one', () => {
    const d = shiftDeltas(vlist([40, 80], 8), 0, 1, 0);
    assert.deepEqual(d[1], { dx: 0, dy: -40 });
  });
  it('row: shifts along x by the dragged width + gap (RTL row: reversed sign)', () => {
    const r = hrow([50, 70, 30], 10);
    assert.deepEqual(shiftDeltas(r, 0, 2), [{ dx: 0, dy: 0 }, { dx: -60, dy: 0 }, { dx: -60, dy: 0 }]);
    assert.deepEqual(shiftDeltas(r, 2, 0), [{ dx: 40, dy: 0 }, { dx: 40, dy: 0 }, { dx: 0, dy: 0 }]);
    // RTL: the flow runs right → left
    const rtl = [{ x: 200, y: 0, w: 50, h: 40 }, { x: 120, y: 0, w: 70, h: 40 }, { x: 80, y: 0, w: 30, h: 40 }];
    assert.deepEqual(shiftDeltas(rtl, 0, 2), [{ dx: 0, dy: 0 }, { dx: 60, dy: 0 }, { dx: 60, dy: 0 }]);
  });
  it('grid: each shifted item goes to the cell of its new index', () => {
    const r = grid(6, 3);
    const d = shiftDeltas(r, 0, 4); // items 1..4 move back one cell
    assert.deepEqual(d[0], { dx: 0, dy: 0 });
    assert.deepEqual(d[1], { dx: -110, dy: 0 });
    assert.deepEqual(d[3], { dx: 220, dy: -110 }); // index 3 (row 1 col 0) → index 2 (row 0 col 2)
    assert.deepEqual(d[4], { dx: -110, dy: 0 });
    assert.deepEqual(d[5], { dx: 0, dy: 0 });
    const back = shiftDeltas(r, 5, 1); // items 1..4 move forward one cell
    assert.deepEqual(back[2], { dx: -220, dy: 110 });
    assert.deepEqual(back[0], { dx: 0, dy: 0 });
  });
  it('out-of-range indexes → all zero', () => {
    assert.deepEqual(shiftDeltas(vlist([10, 10]), 0, 5), [{ dx: 0, dy: 0 }, { dx: 0, dy: 0 }]);
    assert.deepEqual(shiftDeltas([], 0, 0), []);
  });
});

describe('sortable-geometry — slotRect (placeholder of the target slot)', () => {
  it('column: from < to → ends where slot `to` ends; from > to → starts at slot `to`', () => {
    const r = vlist([40, 80, 20], 8);
    assert.deepEqual(slotRect(r, 0, 2), { x: 0, y: 136 + 20 - 40, w: 200, h: 40 });
    assert.deepEqual(slotRect(r, 2, 0), { x: 0, y: 0, w: 200, h: 20 });
    assert.deepEqual(slotRect(r, 1, 1), r[1]);
  });
  it('grid: the cell of `to` with the dragged size', () => {
    const r = grid(6, 3);
    assert.deepEqual(slotRect(r, 0, 4), { x: 110, y: 110, w: 100, h: 100 });
  });
});

describe('sortable-geometry — keyTarget', () => {
  it('list: ↑ / ← back one, ↓ / → forward one, clamped; Home / End', () => {
    const o = { cols: 1 };
    assert.equal(keyTarget(2, 5, 'ArrowUp', o), 1);
    assert.equal(keyTarget(2, 5, 'ArrowLeft', o), 1);
    assert.equal(keyTarget(2, 5, 'ArrowDown', o), 3);
    assert.equal(keyTarget(2, 5, 'ArrowRight', o), 3);
    assert.equal(keyTarget(0, 5, 'ArrowUp', o), 0);
    assert.equal(keyTarget(4, 5, 'ArrowDown', o), 4);
    assert.equal(keyTarget(2, 5, 'Home', o), 0);
    assert.equal(keyTarget(2, 5, 'End', o), 4);
    assert.equal(keyTarget(2, 5, 'a', o), 2);
    // rtl does not change a list
    assert.equal(keyTarget(2, 5, 'ArrowLeft', { cols: 1, rtl: true }), 1);
  });
  it('grid: ← / → ±1, ↑ / ↓ ± cols; out of the grid → unchanged (no wrap)', () => {
    const o = { cols: 3 };
    assert.equal(keyTarget(4, 7, 'ArrowLeft', o), 3);
    assert.equal(keyTarget(4, 7, 'ArrowRight', o), 5);
    assert.equal(keyTarget(3, 7, 'ArrowLeft', o), 2);
    assert.equal(keyTarget(4, 7, 'ArrowUp', o), 1);
    assert.equal(keyTarget(1, 7, 'ArrowDown', o), 4);
    assert.equal(keyTarget(1, 7, 'ArrowUp', o), 1);
    assert.equal(keyTarget(4, 7, 'ArrowDown', o), 4); // 7 is out
    assert.equal(keyTarget(3, 7, 'ArrowDown', o), 6);
    assert.equal(keyTarget(0, 7, 'ArrowLeft', o), 0);
    assert.equal(keyTarget(6, 7, 'ArrowRight', o), 6);
    assert.equal(keyTarget(4, 7, 'Home', o), 0);
    assert.equal(keyTarget(4, 7, 'End', o), 6);
  });
  it('grid rtl: ← / → reversed', () => {
    const o = { cols: 3, rtl: true };
    assert.equal(keyTarget(4, 6, 'ArrowLeft', o), 5);
    assert.equal(keyTarget(4, 6, 'ArrowRight', o), 3);
    assert.equal(keyTarget(4, 6, 'ArrowUp', o), 1);
  });
  it('degenerate sizes', () => {
    assert.equal(keyTarget(0, 1, 'ArrowDown', { cols: 1 }), 0);
    assert.equal(keyTarget(0, 0, 'End', { cols: 1 }), 0);
  });
});

describe('sortable-geometry — autoScrollSpeed', () => {
  it('0 away from the edges', () => {
    assert.equal(autoScrollSpeed(250, 0, 500), 0);
    assert.equal(autoScrollSpeed(48, 0, 500), 0);
    assert.equal(autoScrollSpeed(452, 0, 500), 0);
  });
  it('linear with the depth into the edge zone, up to max', () => {
    assert.equal(autoScrollSpeed(24, 0, 500), -10);
    assert.equal(autoScrollSpeed(0, 0, 500), -20);
    assert.equal(autoScrollSpeed(476, 0, 500), 10);
    assert.equal(autoScrollSpeed(500, 0, 500), 20);
  });
  it('beyond the container → clamped to ±max; custom edge / max', () => {
    assert.equal(autoScrollSpeed(-100, 0, 500), -20);
    assert.equal(autoScrollSpeed(900, 0, 500), 20);
    assert.equal(autoScrollSpeed(110, 100, 300, 20, 10), -5);
  });
});
