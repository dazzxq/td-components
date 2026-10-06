/**
 * Logical scroll coordinates of `<td-carousel>` — v0.50.0 (plan v0.50.0-rating-carousel C5a). Internal module.
 *
 * `pos` = distance (px, ≥ 0) from the inline-start edge of the content to the inline-start edge of the viewport,
 * 0 … maxPos (= scrollWidth − clientWidth). This file is the ONLY place that reads / writes `scrollLeft` or uses
 * `left` / `right` of client rects for the carousel; carousel-model.js works in `pos` only.
 *
 * Modes: 'ltr' · 'rtl' (CSSOM View standard: scrollLeft runs 0 → −maxPos; Chrome 85+, Firefox, Safari) ·
 * 'rtl-positive' (legacy engines where RTL scrollLeft runs maxPos → 0) — picked by `negativeRtlScroll()`, a one-time
 * probe per document.
 */

/** @typedef {'ltr'|'rtl'|'rtl-positive'} ScrollMode */

/** @param {{ scrollWidth: number, clientWidth: number }} vp */
export function maxPosOf(vp) {
  return Math.max(0, vp.scrollWidth - vp.clientWidth);
}

/**
 * @param {{ scrollLeft: number, scrollWidth: number, clientWidth: number }} vp
 * @param {ScrollMode} mode
 */
export function readPos(vp, mode) {
  const max = maxPosOf(vp);
  const raw = mode === 'ltr' ? vp.scrollLeft : mode === 'rtl' ? -vp.scrollLeft : max - vp.scrollLeft;
  return Math.min(max, Math.max(0, raw));
}

/**
 * The `left` to pass to `scrollTo()` for a logical position.
 * @param {number} pos
 * @param {number} maxPos
 * @param {ScrollMode} mode
 */
export function toScrollLeft(pos, maxPos, mode) {
  if (mode === 'ltr') return pos;
  if (mode === 'rtl') return pos === 0 ? 0 : -pos;
  return maxPos - pos;
}

/**
 * The content box of the viewport (its border-box rect minus the borders) in viewport coordinates.
 * @param {{ clientLeft: number, clientWidth: number }} vp
 * @param {{ left: number }} rect getBoundingClientRect() of the viewport
 */
export function contentBox(vp, rect) {
  const left = rect.left + vp.clientLeft;
  return { left, right: left + vp.clientWidth };
}

/**
 * A slide's inline-start / inline-end edges in logical content coordinates (current `pos` + offset from the viewport's
 * inline-start edge).
 * @param {{ left: number, right: number }} s getBoundingClientRect() of the slide
 * @param {{ left: number, right: number }} v contentBox() of the viewport
 * @param {number} pos
 * @param {ScrollMode} mode
 */
export function slideEdges(s, v, pos, mode) {
  if (mode === 'ltr') return { start: pos + (s.left - v.left), end: pos + (s.right - v.left) };
  return { start: pos + (v.right - s.right), end: pos + (v.right - s.left) };
}

/**
 * @param {string} direction computed `direction` of the viewport
 * @param {() => boolean} isNegative the probe (`negativeRtlScroll`)
 * @returns {ScrollMode}
 */
export function scrollMode(direction, isNegative) {
  if (direction !== 'rtl') return 'ltr';
  return isNegative() ? 'rtl' : 'rtl-positive';
}

const probed = new WeakMap();

/**
 * One probe per document: an invisible RTL scroller (CSSOM sizes, no inline `style` attribute string) — scrollLeft set
 * to −1 reads back negative on standard engines.
 * @param {Document} doc
 */
export function negativeRtlScroll(doc) {
  if (probed.has(doc)) return probed.get(doc);
  let negative = true;
  try {
    const outer = doc.createElement('div');
    const inner = doc.createElement('div');
    outer.setAttribute('dir', 'rtl');
    outer.setAttribute('aria-hidden', 'true');
    for (const [k, v] of [['position', 'absolute'], ['top', '-9999px'], ['inline-size', '4px'], ['block-size', '1px'],
      ['overflow', 'scroll'], ['visibility', 'hidden']]) outer.style.setProperty(k, v);
    inner.style.setProperty('inline-size', '8px');
    inner.style.setProperty('block-size', '1px');
    outer.appendChild(inner);
    (doc.body || doc.documentElement).appendChild(outer);
    outer.scrollLeft = -1;
    negative = outer.scrollLeft < 0;
    outer.remove();
  } catch {
    negative = true;
  }
  probed.set(doc, negative);
  return negative;
}
