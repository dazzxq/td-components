/**
 * Pure geometry of the SortableController (v0.31.0, plan docs/internal/plans/v0.31.0-sortable-masked.md M1). Internal
 * util (not a public export): no DOM — `node --test` covers every rule (src/utils/sortable-geometry.test.js).
 *
 * A rect is `{ x, y, w, h }` in host coordinates (scroll already added). One hit-test serves lists and grids (no
 * `orientation` attribute): the snapshot itself says whether the items form one column, one row or a grid.
 */

/** Two items whose top edges differ by at most this many px are on the same row. */
const ROW_TOLERANCE = 2;

const ZERO = () => ({ dx: 0, dy: 0 });

/**
 * Number of items on the FIRST row (top edge within 2px of the first item's). 1 = a vertical list.
 * @param {Array<{x:number,y:number,w:number,h:number}>} rects
 * @returns {number}
 */
export function columns(rects) {
  if (!rects || !rects.length) return 0;
  const y0 = rects[0].y;
  let n = 0;
  for (const r of rects) {
    if (Math.abs(r.y - y0) <= ROW_TOLERANCE) n += 1;
    else break;
  }
  return n;
}

/**
 * @param {Array<{x:number,y:number,w:number,h:number}>} rects
 * @returns {'row'|'column'|'grid'} one row / one column (also 0 or 1 item) / anything else
 */
export function layoutKind(rects) {
  const n = rects ? rects.length : 0;
  const cols = columns(rects);
  if (n < 2 || cols <= 1) return 'column';
  if (cols >= n) return 'row';
  return 'grid';
}

/**
 * Slot under a point: the rect containing it, else the one whose centre is nearest.
 * @param {Array<{x:number,y:number,w:number,h:number}>} rects
 * @param {number} px
 * @param {number} py
 * @returns {number} -1 when there is no rect
 */
export function hitSlot(rects, px, py) {
  if (!rects || !rects.length) return -1;
  for (let i = 0; i < rects.length; i += 1) {
    const r = rects[i];
    if (px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h) return i;
  }
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < rects.length; i += 1) {
    const r = rects[i];
    const d = Math.hypot(px - (r.x + r.w / 2), py - (r.y + r.h / 2));
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

/** @private flow axis of a 1-D layout: 'y' for a column, 'x' for a row; sign +1 / -1 (RTL row, reversed column) */
function flow(rects, kind) {
  const axis = kind === 'row' ? 'x' : 'y';
  const sign = rects.length >= 2 && rects[1][axis] < rects[0][axis] ? -1 : 1;
  return { axis, size: axis === 'x' ? 'w' : 'h', sign };
}

/** @private measured gap between the first two items along the flow (>= 0) */
function measuredGap(rects, f) {
  if (rects.length < 2) return 0;
  const [a, b] = rects;
  const g = f.sign > 0 ? b[f.axis] - (a[f.axis] + a[f.size]) : a[f.axis] - (b[f.axis] + b[f.size]);
  return Number.isFinite(g) && g > 0 ? g : 0;
}

/** @private where item k (≠ from) ends up when `from` moves to `to` */
function newIndex(k, from, to) {
  if (from < to && k > from && k <= to) return k - 1;
  if (from > to && k >= to && k < from) return k + 1;
  return k;
}

const inRange = (i, n) => Number.isInteger(i) && i >= 0 && i < n;

/**
 * Preview shifts while `from` is dragged over slot `to`: one `{ dx, dy }` per item (`from` itself: 0 — it follows the
 * pointer). Column / row → 1-D reflow by the real sizes (items between shift by the dragged item's size + the gap);
 * grid → item k moves to the cell of its new index (exact for uniform cells; the drop index is exact anyway).
 * @param {Array<{x:number,y:number,w:number,h:number}>} rects
 * @param {number} from
 * @param {number} to
 * @param {number} [gap] - default: measured between the first two items
 * @returns {Array<{dx:number,dy:number}>}
 */
export function shiftDeltas(rects, from, to, gap) {
  const n = rects ? rects.length : 0;
  const out = Array.from({ length: n }, ZERO);
  if (!inRange(from, n) || !inRange(to, n) || from === to) return out;
  const kind = layoutKind(rects);
  if (kind === 'grid') {
    for (let k = 0; k < n; k += 1) {
      if (k === from) continue;
      const j = newIndex(k, from, to);
      if (j !== k) out[k] = { dx: rects[j].x - rects[k].x, dy: rects[j].y - rects[k].y };
    }
    return out;
  }
  const f = flow(rects, kind);
  const g = Number.isFinite(gap) && gap >= 0 ? gap : measuredGap(rects, f);
  const step = (rects[from][f.size] + g) * f.sign;
  for (let k = 0; k < n; k += 1) {
    if (k === from) continue;
    const j = newIndex(k, from, to);
    if (j === k) continue;
    const d = j < k ? -step : step; // moving back along the flow = toward the first item
    out[k] = f.axis === 'x' ? { dx: d, dy: 0 } : { dx: 0, dy: d };
  }
  return out;
}

/**
 * Rect of the placeholder (target slot) for `from` dropped at `to`: grid → the cell of `to` with the dragged size;
 * 1-D → the dragged size placed where it will sit (from < to: ends where slot `to` ends; from > to: starts at it).
 * @param {Array<{x:number,y:number,w:number,h:number}>} rects
 * @param {number} from
 * @param {number} to
 * @returns {{x:number,y:number,w:number,h:number}|null}
 */
export function slotRect(rects, from, to) {
  const n = rects ? rects.length : 0;
  if (!inRange(from, n) || !inRange(to, n)) return null;
  const a = rects[from];
  const t = rects[to];
  if (from === to) return { x: a.x, y: a.y, w: a.w, h: a.h };
  const kind = layoutKind(rects);
  if (kind === 'grid') return { x: t.x, y: t.y, w: a.w, h: a.h };
  const f = flow(rects, kind);
  const r = { x: t.x, y: t.y, w: a.w, h: a.h };
  // the far edge of slot `to` along the flow, minus the dragged size (sign-aware)
  const forward = from < to;
  if (f.sign > 0 && forward) r[f.axis] = t[f.axis] + t[f.size] - a[f.size];
  else if (f.sign < 0 && !forward) r[f.axis] = t[f.axis] + t[f.size] - a[f.size];
  return r;
}

/**
 * Target index of a key while an item is lifted. List (`cols` ≤ 1): ↑ / ← back one, ↓ / → forward one. Grid: ← / →
 * ±1 (reversed when `rtl`), ↑ / ↓ ±cols (outside the grid → unchanged, no wrap). Home / End. Clamped; any other key →
 * `index`.
 * @param {number} index
 * @param {number} size
 * @param {string} key - KeyboardEvent.key
 * @param {{ cols?: number, rtl?: boolean }} [opts]
 * @returns {number}
 */
export function keyTarget(index, size, key, { cols = 1, rtl = false } = {}) {
  if (!(size > 0)) return index;
  const last = size - 1;
  const clamp = (i) => Math.max(0, Math.min(last, i));
  if (key === 'Home') return 0;
  if (key === 'End') return last;
  const grid = cols > 1;
  if (!grid) {
    if (key === 'ArrowUp' || key === 'ArrowLeft') return clamp(index - 1);
    if (key === 'ArrowDown' || key === 'ArrowRight') return clamp(index + 1);
    return index;
  }
  if (key === 'ArrowLeft') return clamp(index + (rtl ? 1 : -1));
  if (key === 'ArrowRight') return clamp(index + (rtl ? -1 : 1));
  if (key === 'ArrowUp' || key === 'ArrowDown') {
    const t = index + (key === 'ArrowUp' ? -cols : cols);
    return t < 0 || t > last ? index : t;
  }
  return index;
}

/**
 * Auto-scroll speed (px / frame) for a pointer at `pos` on an axis whose visible range is [start, end]: negative in
 * the leading edge zone, positive in the trailing one, linear with the depth into it up to `max` (also beyond the
 * range), 0 elsewhere.
 * @param {number} pos
 * @param {number} start
 * @param {number} end
 * @param {number} [edge]
 * @param {number} [max]
 * @returns {number}
 */
export function autoScrollSpeed(pos, start, end, edge = 48, max = 20) {
  if (!(edge > 0)) return 0;
  const lead = start + edge - pos;
  if (lead > 0) return -Math.min(max, (max * lead) / edge);
  const trail = pos - (end - edge);
  if (trail > 0) return Math.min(max, (max * trail) / edge);
  return 0;
}
