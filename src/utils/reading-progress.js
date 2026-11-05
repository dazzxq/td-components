/**
 * v0.97.0 `<td-scroll-top progress-target>`: how far a target element has been read, from its viewport rect (dwp
 * formula, unchanged). 0 while the target's top is still at or below the viewport top, 1 once its bottom is at or above
 * the viewport bottom (also a target shorter than the viewport that is fully in view), linear in between. An empty
 * box (height 0, e.g. content not mounted yet) is 0: it must not count as read and fire the completion early.
 * @param {{ top: number, bottom: number }} rect - `getBoundingClientRect()` of the target
 * @param {number} viewportHeight - `window.innerHeight`
 * @returns {number} progress in [0, 1]
 */
export function readingProgress(rect, viewportHeight) {
  const top = Number(rect?.top);
  const bottom = Number(rect?.bottom);
  const vh = Number(viewportHeight);
  if (!Number.isFinite(top) || !Number.isFinite(bottom) || !Number.isFinite(vh)) return 0;
  if (bottom <= top) return 0;
  const end = bottom - vh;
  if (end <= 0) return 1;
  if (top >= 0) return 0;
  return Math.min(1, -top / (-top + end));
}
