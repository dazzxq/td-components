/**
 * Pure model of `<td-carousel>` — v0.50.0 (plan v0.50.0-rating-carousel C5 / C21). Internal module (no package subpath).
 * Every number is in LOGICAL scroll coordinates (`pos`, C5a — src/utils/carousel-scroll.js converts): the distance from
 * the inline-start edge of the content to the inline-start edge of the viewport, 0 … maxPos. A slide is `{ start, end }`
 * in the same coordinates (its inline-start / inline-end edge measured from the content start).
 * PHP td_carousel() mirrors `controlsLayout()` and `predictedPages()` (fixture table test/ssr/carousel.fixtures.json).
 */

/** Default texts (`TdCarousel.labels`; PHP prints the frame ones — R13: one static set per site). */
export const CAROUSEL_LABELS = Object.freeze({
  carousel: 'Băng chuyền',          // region name when the host has no `label` (+ one warning)
  roleCarousel: 'băng chuyền',      // aria-roledescription of the host (D7)
  roleSlide: 'mục',                 // aria-roledescription of a slide
  slide: '{n} / {total}',           // aria-label of a slide
  prev: 'Mục trước',
  next: 'Mục tiếp theo',
  dots: 'Chọn trang',               // group of page buttons
  dot: 'Trang {n} / {total}',
  status: 'Mục {from}–{to} / {total}', // live region after a button / dot / API move
  statusOne: 'Mục {n} / {total}',
});

/** Fill `{name}` placeholders in ONE pass (a value is never re-expanded; unknown names stay). Text only. */
export function fill(tpl, vars) {
  return String(tpl).replace(/\{([a-z]+)\}/g, (m, k) => (Object.hasOwn(vars, k) ? String(vars[k]) : m));
}

/** Tolerance (px) of every comparison between positions. */
export const EPS = 1;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Sorted, deduplicated (≤ EPS apart), rounded, clamped targets. */
function clean(list, maxPos) {
  const out = [];
  for (const raw of list) {
    const t = Math.round(clamp(raw, 0, maxPos));
    if (!out.length || t > out[out.length - 1] + EPS) out.push(t);
  }
  return out;
}

/**
 * Number of slides fully inside the viewport when the first slide is aligned to the start (≥ 1).
 * @param {Array<{start: number, end: number}>} slides
 * @param {number} avail the viewport inline size minus the scroll padding of both sides
 */
function perPage(slides, avail) {
  if (!slides.length) return 1;
  const s0 = slides[0].start;
  let k = 0;
  while (k < slides.length && slides[k].end - s0 <= avail + EPS) k++;
  return Math.max(1, k);
}

/**
 * C5 page targets: slides 0, k, 2k, … (k = slides fully in view), each aligned to the start (minus `pad`), clamped to
 * maxPos — the last page ends flush; maxPos itself is added when the last target falls short of it.
 * @param {Array<{start: number, end: number}>} slides
 * @param {{ view: number, maxPos: number, pad?: number, padEnd?: number }} g
 * @returns {number[]}
 */
export function pageTargets(slides, { view, maxPos, pad = 0, padEnd = 0 }) {
  if (!slides.length) return [0];
  const k = perPage(slides, view - pad - padEnd);
  const raw = [];
  for (let i = 0; i < slides.length; i += k) raw.push(slides[i].start - pad);
  const out = clean(raw, maxPos);
  if (out[out.length - 1] < maxPos - EPS) out.push(Math.round(maxPos));
  return out;
}

/**
 * `step="slide"` targets: one per slide (aligned to the start minus `pad`), clamped, duplicates dropped.
 * @param {Array<{start: number, end: number}>} slides
 * @param {{ maxPos: number, pad?: number }} g
 */
export function slideTargets(slides, { maxPos, pad = 0 }) {
  if (!slides.length) return [0];
  return clean(slides.map((s) => s.start - pad), maxPos);
}

/** Index of the target nearest to `pos` (first one on a tie). */
export function nearestIndex(targets, pos) {
  let best = 0;
  for (let i = 1; i < targets.length; i++) if (Math.abs(targets[i] - pos) < Math.abs(targets[best] - pos)) best = i;
  return best;
}

/** First target past `pos` (+ EPS), or null at the end. */
export function nextTarget(targets, pos) {
  for (const t of targets) if (t > pos + EPS) return t;
  return null;
}

/** Last target before `pos` (− EPS), or null at the start. */
export function prevTarget(targets, pos) {
  for (let i = targets.length - 1; i >= 0; i--) if (targets[i] < pos - EPS) return targets[i];
  return null;
}

/**
 * Index of the first slide whose start is at / after the viewport start (`pos + pad`, EPS tolerance) — the "current"
 * slide; the last slide when none is.
 */
export function firstVisible(slides, pos, pad = 0) {
  for (let i = 0; i < slides.length; i++) if (slides[i].start - pad >= pos - EPS) return i;
  return Math.max(0, slides.length - 1);
}

/**
 * [first, last] slide fully in view (for the live region); a slide wider than the view → [first, first].
 * @param {{ view: number, pad?: number, padEnd?: number }} g
 */
export function visibleRange(slides, pos, { view, pad = 0, padEnd = 0 }) {
  const lo = pos + pad - EPS;
  const hi = pos + view - padEnd + EPS;
  let a = -1;
  let b = -1;
  slides.forEach((s, i) => {
    if (s.start >= lo && s.end <= hi) {
      if (a < 0) a = i;
      b = i;
    }
  });
  if (a < 0) {
    const f = firstVisible(slides, pos, pad);
    return [f, f];
  }
  return [a, b];
}

/** The page target holding slide `idx`: the largest target ≤ the slide's own (clamped) target. */
export function targetForSlide(targets, slides, idx, pad = 0) {
  const own = slides[idx] ? slides[idx].start - pad : 0;
  let t = targets[0] ?? 0;
  for (const x of targets) if (x <= Math.max(0, own) + EPS) t = x;
  return t;
}

/** Dots per row: narrow container (< 480px) / wide (≥ 480px). */
export const DOTS_PER_ROW = Object.freeze({ narrow: 6, wide: 8 });

/**
 * C21 controls layout for P pages — the ONE rule shared by PHP (prediction) / JS (measured) / CSS (attributes).
 * `narrow`: rows of dots under the [‹ counter ›] row (0 = counter only); `wide`: 'inline' ([‹ dots ›], P ≤ 8) or rows
 * like narrow. `auto`: dots only while ≤ 2 rows; `on`: always; `off`: never. P ≤ 1 → the controls are hidden.
 * @param {number} P
 * @param {string} dots
 * @returns {{ hidden: boolean, narrow: number, wide: number|'inline' }}
 */
export function controlsLayout(P, dots) {
  const mode = dots === 'on' || dots === 'off' ? dots : 'auto';
  if (P <= 1 || mode === 'off') return { hidden: P <= 1, narrow: 0, wide: 0 };
  let narrow = Math.ceil(P / DOTS_PER_ROW.narrow);
  let wide = P <= DOTS_PER_ROW.wide ? 'inline' : Math.ceil(P / DOTS_PER_ROW.wide);
  if (mode === 'auto') {
    if (narrow > 2) narrow = 0;
    if (wide !== 'inline' && wide > 2) wide = 0;
  }
  return { hidden: false, narrow, wide };
}

/** PHP's page count before any measure (C21): max(1, ceil(n / per_view)). */
export function predictedPages(n, perView) {
  return Math.max(1, Math.ceil(n / Math.max(1, perView)));
}
