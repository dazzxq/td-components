/**
 * v0.35.0 (plan v0.35.0-cropper M1, decisions 4-13; ADR 0015) — pure crop geometry of `<td-cropper>`.
 *
 * Model space = pixels of the ORIGINAL image in display orientation (`W × H`). A crop rect is `{ x, y, w, h }` (floats).
 * Everything here is pure (no DOM): the element turns pointer / key / wheel input into calls of these functions and
 * renders the result with CSSOM. Output is numbers only — this module (like the element and the dialog) never creates
 * pixels (no canvas, no blob, no network; guard test in crop-geometry.test.js).
 *
 * @module utils/crop-geometry
 */

/** Internal interaction minimum (decision 11): each side ≥ 16 model px (locked ratio: the SHORT side ≥ 16). Not public API. */
export const MIN_PX = 16;
/** Ratio tolerance (decisions 5, 11): > 1 % ⇒ "different ratio". */
export const RATIO_TOL = 0.01;
/** Zoom step (decision 13): "zoom in" shrinks the box × 0.9, "zoom out" grows it × 1/0.9. */
export const ZOOM_STEP = 0.9;

/** @typedef {{ x: number, y: number, w: number, h: number }} Rect */
/** @typedef {{ x: number, y: number, width: number, height: number }} CropBox */
/**
 * @typedef {{ normalized: CropBox, pixels?: CropBox, aspectRatio: number }} CropValue
 */
/** @typedef {'nw'|'n'|'ne'|'e'|'se'|'s'|'sw'|'w'} Handle */

/** 6-decimal quantiser of normalised values: `round(v·1e6)/1e6`. @param {number} v */
export const q = (v) => Math.round(v * 1e6) / 1e6;
/** 4-decimal rounding of ratios. @param {number} v */
export const round4 = (v) => Math.round(v * 1e4) / 1e4;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const okRatio = (r) => fin(r) && r > 0;

/**
 * The effective minimum `{ w, h }` for an image / ratio: free → 16 × 16 (each capped by the image); locked → short side
 * 16, long side derived; capped by the largest rect of that ratio (an image smaller than the minimum ⇒ that largest rect).
 * @param {number} W @param {number} H @param {number|null|undefined} ratio
 * @returns {{ w: number, h: number }}
 */
export function minSize(W, H, ratio) {
  if (!okRatio(ratio)) return { w: Math.min(MIN_PX, W), h: Math.min(MIN_PX, H) };
  let w = ratio >= 1 ? MIN_PX * ratio : MIN_PX;
  let h = ratio >= 1 ? MIN_PX : MIN_PX / ratio;
  const big = fitLargest(W, H, ratio);
  if (w > big.w || h > big.h) { w = big.w; h = big.h; }
  return { w, h };
}

/**
 * The largest rect of `ratio` (w / h) inside `W × H`, centred on `center` (default: the image centre), clamped inside.
 * No / invalid ratio ⇒ the whole image.
 * @param {number} W @param {number} H @param {number|null|undefined} ratio
 * @param {{ x: number, y: number }} [center]
 * @returns {Rect}
 */
export function fitLargest(W, H, ratio, center) {
  if (!okRatio(ratio)) return { x: 0, y: 0, w: W, h: H };
  let w;
  let h;
  if (W / H > ratio) { h = H; w = H * ratio; } else { w = W; h = W / ratio; }
  const c = center && fin(center.x) && fin(center.y) ? center : { x: W / 2, y: H / 2 };
  return clampRect({ x: c.x - w / 2, y: c.y - h / 2, w, h }, W, H);
}

/**
 * Clamp a rect inside the image: size ≤ image, then position translated inside (`0 ≤ x ≤ W − w`).
 * @param {Rect} r @param {number} W @param {number} H @returns {Rect}
 */
export function clampRect(r, W, H) {
  const w = clamp(r.w, 0, W);
  const h = clamp(r.h, 0, H);
  return { x: clamp(r.x, 0, W - w), y: clamp(r.y, 0, H - h), w, h };
}

/**
 * Move by `(dx, dy)` model px, clamped inside the image (size unchanged).
 * @param {Rect} r @param {number} dx @param {number} dy @param {number} W @param {number} H @returns {Rect}
 */
export function moveBy(r, dx, dy, W, H) {
  return clampRect({ x: r.x + dx, y: r.y + dy, w: r.w, h: r.h }, W, H);
}

/**
 * Resize by dragging `handle` by `(dx, dy)` model px; the opposite corner / edge is the anchor. Never flips (dragging
 * past the anchor stops at the minimum), never leaves the image. Locked ratio: the dominant axis decides (`axis` forces
 * one — keyboard), the other is derived; an edge handle keeps the opposite edge and the perpendicular centre.
 * @param {Handle} handle @param {Rect} r @param {{ dx: number, dy: number }} d
 * @param {{ ratio?: number|null, W: number, H: number, axis?: 'x'|'y' }} o
 * @returns {Rect}
 */
export function resizeFrom(handle, r, d, o) {
  const { W, H } = o;
  const ratio = okRatio(o.ratio) ? /** @type {number} */ (o.ratio) : null;
  const min = minSize(W, H, ratio);
  const east = handle.includes('e');
  const west = handle.includes('w');
  const south = handle.includes('s');
  const north = handle.includes('n');
  const dx = fin(d.dx) ? d.dx : 0;
  const dy = fin(d.dy) ? d.dy : 0;
  const left = r.x;
  const top = r.y;
  const right = r.x + r.w;
  const bottom = r.y + r.h;

  if (!ratio) {
    let l = left; let t = top; let rr = right; let b = bottom;
    if (west) l = clamp(left + dx, 0, right - min.w);
    if (east) rr = clamp(right + dx, left + min.w, W);
    if (north) t = clamp(top + dy, 0, bottom - min.h);
    if (south) b = clamp(bottom + dy, top + min.h, H);
    return clampRect({ x: l, y: t, w: rr - l, h: b - t }, W, H);
  }

  const corner = (east || west) && (north || south);
  if (corner) {
    const ax = east ? left : right;
    const ay = south ? top : bottom;
    const w1 = r.w + (east ? dx : -dx);
    const h1 = r.h + (south ? dy : -dy);
    let useX;
    if (o.axis === 'x') useX = true;
    else if (o.axis === 'y') useX = false;
    else useX = Math.abs(w1 - r.w) / r.w >= Math.abs(h1 - r.h) / r.h;
    let w = useX ? w1 : h1 * ratio;
    const availW = east ? W - ax : ax;
    const availH = south ? H - ay : ay;
    const wMax = Math.min(availW, availH * ratio);
    w = Math.max(min.w, Math.min(w, wMax));
    const h = w / ratio;
    return clampRect({ x: east ? ax : ax - w, y: south ? ay : ay - h, w, h }, W, H);
  }
  // Edge handle under a lock (hidden in the UI; kept total for robustness).
  if (east || west) {
    const ax = east ? left : right;
    const cy = top + r.h / 2;
    let w = r.w + (east ? dx : -dx);
    const availW = east ? W - ax : ax;
    const availH = 2 * Math.min(cy, H - cy);
    w = Math.max(min.w, Math.min(w, availW, availH * ratio));
    const h = w / ratio;
    return clampRect({ x: east ? ax : ax - w, y: cy - h / 2, w, h }, W, H);
  }
  const ay = south ? top : bottom;
  const cx = left + r.w / 2;
  let h = r.h + (south ? dy : -dy);
  const availH = south ? H - ay : ay;
  const availW = 2 * Math.min(cx, W - cx);
  h = Math.max(min.h, Math.min(h, availH, availW / ratio));
  const w = h * ratio;
  return clampRect({ x: cx - w / 2, y: south ? ay : ay - h, w, h }, W, H);
}

/**
 * Zoom (decision 13) = resize the box by `k` around `anchor` (model px), keeping its current ratio; `k` clamped to
 * `[min, largest rect of the current ratio]`, then translated inside the image.
 * @param {Rect} r @param {number} k @param {{ x: number, y: number }} anchor
 * @param {{ ratio?: number|null, W: number, H: number }} o
 * @returns {Rect}
 */
export function scaleAround(r, k, anchor, o) {
  const { W, H } = o;
  if (!fin(k) || k <= 0) return { ...r };
  const min = minSize(W, H, okRatio(o.ratio) ? o.ratio : null);
  const kMin = Math.max(min.w / r.w, min.h / r.h);
  const kMax = Math.min(W / r.w, H / r.h);
  const kk = kMin > kMax ? kMax : clamp(k, kMin, kMax);
  const ax = fin(anchor?.x) ? anchor.x : r.x + r.w / 2;
  const ay = fin(anchor?.y) ? anchor.y : r.y + r.h / 2;
  return clampRect({ x: ax - (ax - r.x) * kk, y: ay - (ay - r.y) * kk, w: r.w * kk, h: r.h * kk }, W, H);
}

/**
 * Change preset (decision 12): a ratio ⇒ the largest rect of it, keeping the CENTRE of `r`; `null` (free) ⇒ unchanged.
 * @param {Rect} r @param {number|null} ratio @param {number} W @param {number} H @returns {Rect}
 */
export function applyPreset(r, ratio, W, H) {
  if (!okRatio(ratio)) return { ...r };
  return fitLargest(W, H, ratio, { x: r.x + r.w / 2, y: r.y + r.h / 2 });
}

/**
 * Initial box (decision 11) from a normalised crop (or null): null ⇒ largest of the ratio (centred) / whole image; a
 * locked ratio off by > 1 % ⇒ the largest rect of the ratio INSIDE it (same centre); smaller than the minimum ⇒ grown
 * around its centre, clamped inside the image.
 * @param {CropBox|null|undefined} crop
 * @param {{ W: number, H: number, ratio?: number|null }} o
 * @returns {Rect}
 */
export function normalizeInitial(crop, o) {
  const { W, H } = o;
  const ratio = okRatio(o.ratio) ? /** @type {number} */ (o.ratio) : null;
  if (!crop || ![crop.x, crop.y, crop.width, crop.height].every(fin) || crop.width <= 0 || crop.height <= 0) {
    return fitLargest(W, H, ratio);
  }
  let r = clampRect({ x: crop.x * W, y: crop.y * H, w: crop.width * W, h: crop.height * H }, W, H);
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  if (ratio && ratioMismatch(r.w, r.h, ratio, 1)) {
    if (r.w / r.h > ratio) r = { x: 0, y: 0, w: r.h * ratio, h: r.h };
    else r = { x: 0, y: 0, w: r.w, h: r.w / ratio };
  } else if (ratio) {
    r = { x: 0, y: 0, w: r.w, h: r.w / ratio };
  }
  const min = minSize(W, H, ratio);
  let w = r.w;
  let h = r.h;
  if (w < min.w || h < min.h) {
    if (ratio) { w = min.w; h = min.h; } else { w = Math.max(w, min.w); h = Math.max(h, min.h); }
  }
  if (ratio && (w > W || h > H)) {
    const big = fitLargest(W, H, ratio);
    w = big.w; h = big.h;
  }
  return clampRect({ x: cx - w / 2, y: cy - h / 2, w, h }, W, H);
}

/**
 * Keyboard step (decision 15): 1 % of the image side on that axis (≥ 1 px), × 10 with Shift.
 * @param {number} size W or H @param {boolean} [big] @returns {number}
 */
export function stepFor(size, big) {
  const s = Math.max(1, size / 100);
  return big ? s * 10 : s;
}

/**
 * The one output function (decision 7): integer pixels (round, then `w = min(w, W − x)`, `≥ 1`), normalised values
 * computed FROM those integers with `q()` and `x + width ≤ 1` guaranteed (so every result passes `parseCrop`, JS + PHP),
 * whole image ⇒ exactly 0 / 1. `pixelsKnown = false` ⇒ no `pixels` key (the size may be a thumbnail's).
 * `aspectRatio` = the locked ratio (4 decimals) or `round4(px.w / px.h)`.
 * @param {Rect} r
 * @param {{ W: number, H: number, pixelsKnown?: boolean, ratio?: number|null }} o
 * @returns {CropValue}
 */
export function toOutput(r, o) {
  const W = Math.max(1, Math.round(o.W));
  const H = Math.max(1, Math.round(o.H));
  const px = clamp(Math.round(r.x), 0, W - 1);
  const py = clamp(Math.round(r.y), 0, H - 1);
  const pw = Math.max(1, Math.min(Math.round(r.w), W - px));
  const ph = Math.max(1, Math.min(Math.round(r.h), H - py));
  const nx = q(px / W);
  const ny = q(py / H);
  const out = {
    normalized: { x: nx, y: ny, width: fitNorm(nx, q(pw / W)), height: fitNorm(ny, q(ph / H)) },
    aspectRatio: okRatio(o.ratio) ? round4(/** @type {number} */ (o.ratio)) : round4(pw / ph),
  };
  if (o.pixelsKnown) out.pixels = { x: px, y: py, width: pw, height: ph };
  return out;
}

/** `n + size ≤ 1` (decision 7): shrink by 1e-6 steps if floats still exceed. @param {number} n @param {number} size */
function fitNorm(n, size) {
  let s = size;
  if (n + s > 1) s = q(1 - n);
  let guard = 0;
  while (n + s > 1 && guard++ < 10) s = q(s - 1e-6);
  return s;
}

/**
 * Whole image (decision 8) — the integrations turn it into `crop = null`.
 * @param {CropValue|{ normalized: CropBox }|null|undefined} v
 * @returns {boolean}
 */
export function isWholeImage(v) {
  const n = v?.normalized;
  return !!n && n.x === 0 && n.y === 0 && n.width === 1 && n.height === 1;
}

/**
 * Focal point (decision 17): quantised `q()` and clamped to `[0, 1]`; non-finite ⇒ null.
 * @param {{ x: number, y: number }|null|undefined} p
 * @returns {{ x: number, y: number }|null}
 */
export function clampFocal(p) {
  if (!p || !fin(p.x) || !fin(p.y)) return null;
  return { x: clamp(q(p.x), 0, 1), y: clamp(q(p.y), 0, 1) };
}

/**
 * Do two sizes differ in ratio by more than `tol` (default 1 %, symmetric: `max(k, 1/k) − 1`)? Non-positive / non-finite
 * input ⇒ true.
 * @param {number} aW @param {number} aH @param {number} bW @param {number} bH @param {number} [tol]
 * @returns {boolean}
 */
export function ratioMismatch(aW, aH, bW, bH, tol = RATIO_TOL) {
  if (![aW, aH, bW, bH].every((v) => fin(v) && v > 0)) return true;
  const k = (aW / aH) / (bW / bH);
  return Math.max(k, 1 / k) - 1 > tol;
}

/**
 * Display px (relative to the image's top-left on screen) → model px. @param {{ x: number, y: number }} p
 * @param {number} scale display / model @returns {{ x: number, y: number }}
 */
export function displayToModel(p, scale) {
  return { x: p.x / scale, y: p.y / scale };
}

/**
 * Model rect → display rect (px, relative to the image's top-left). @param {Rect} r @param {number} scale @returns {Rect}
 */
export function modelToDisplay(r, scale) {
  return { x: r.x * scale, y: r.y * scale, w: r.w * scale, h: r.h * scale };
}

/**
 * "contain" fit of a `W × H` image in a `bw × bh` box: `{ scale, x, y, w, h }` (display px, centred).
 * @param {number} W @param {number} H @param {number} bw @param {number} bh
 */
export function containFit(W, H, bw, bh) {
  if (!(W > 0 && H > 0 && bw > 0 && bh > 0)) return { scale: 0, x: 0, y: 0, w: 0, h: 0 };
  const scale = Math.min(bw / W, bh / H);
  const w = W * scale;
  const h = H * scale;
  return { scale, x: (bw - w) / 2, y: (bh - h) / 2, w, h };
}

/**
 * Wheel zoom factor (decision 14): `exp(−deltaY·0.002)` clamped to `[0.8, 1.25]` per event; `deltaMode` 1 (lines) × 16,
 * 2 (pages) × 16 × 24. Returns the factor applied to the BOX size (< 1 = zoom in).
 * @param {number} deltaY @param {number} [deltaMode]
 * @returns {number}
 */
export function wheelFactor(deltaY, deltaMode = 0) {
  if (!fin(deltaY) || deltaY === 0) return 1;
  const px = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 16 * 24 : deltaY;
  return clamp(Math.exp(px * 0.002), 0.8, 1.25);
}
