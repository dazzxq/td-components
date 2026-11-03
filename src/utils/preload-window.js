/**
 * Lightbox preload window (v0.95.0, plan v0.95.0-small-kit §6) — pure, no DOM. Used by `TdLightbox`:
 *   - `normalizePreload(opt)` reads the `preload` option once per session;
 *   - `preloadWindow(index, n, ahead, behind)` lists the gallery positions to fetch ahead of time.
 */

/** Hard cap of `ahead` / `behind` (D12): a misconfiguration never pulls a whole album. */
export const PRELOAD_MAX = 5;

/** `ahead` / `behind`: a finite number → floor → clamp [0, PRELOAD_MAX]; anything else → 1. */
function count(v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 1;
  return Math.max(0, Math.min(PRELOAD_MAX, Math.floor(v)));
}

/**
 * @typedef {{ ahead: number, behind: number, cross: 'none'|'all'|((url: string, item: object) => boolean) }} PreloadConfig
 */

/**
 * `preload: false | 'same-origin' | 'all' | { ahead?, behind?, allowCrossOrigin? }`.
 * `false` → false (off). `'all'` → ±1, every origin. A plain object → its counts (default 1 each) and its cross-origin
 * rule: a function (called for cross-origin images only), `true` (= every origin) or anything else (= same origin only).
 * Missing / anything else → ±1, same origin only (the v0.24.0 default).
 * @param {unknown} opt
 * @returns {false | PreloadConfig}
 */
export function normalizePreload(opt) {
  if (opt === false) return false;
  if (opt === 'all') return { ahead: 1, behind: 1, cross: 'all' };
  if (opt && typeof opt === 'object' && !Array.isArray(opt)) {
    const o = /** @type {Record<string, unknown>} */ (opt);
    let cross = 'none';
    if (typeof o.allowCrossOrigin === 'function') cross = /** @type {any} */ (o.allowCrossOrigin);
    else if (o.allowCrossOrigin === true) cross = 'all';
    return { ahead: count(o.ahead), behind: count(o.behind), cross };
  }
  return { ahead: 1, behind: 1, cross: 'none' };
}

/**
 * Gallery positions to preload around `index` in a gallery of `n` (wrapping), nearest first and interleaved:
 * +1, −1, +2, −2, … (a side stops at its own count). The current position and repeats (a small gallery wraps onto
 * itself) are dropped. Counts are positions — the caller skips videos without shifting the window.
 * @param {number} index current position (0 ≤ index < n)
 * @param {number} n gallery length
 * @param {number} ahead positions after `index` ("next" direction)
 * @param {number} behind positions before `index`
 * @returns {number[]}
 */
export function preloadWindow(index, n, ahead, behind) {
  if (!Number.isInteger(n) || n < 2 || !Number.isInteger(index) || index < 0 || index >= n) return [];
  const a = count(ahead);
  const b = count(behind);
  const out = [];
  const seen = new Set([index]);
  const add = (i) => {
    if (!seen.has(i)) { seen.add(i); out.push(i); }
  };
  for (let d = 1; d <= Math.max(a, b); d++) {
    if (d <= a) add((index + d) % n);
    if (d <= b) add((((index - d) % n) + n) % n);
  }
  return out;
}
