/**
 * Pure gesture maths (v0.36.2, ADR 0019, plan QĐ 11). Internal module (no package subpath), covered by
 * gesture.test.js. Read the pointer type from the EVENT, never from a media query (hybrid laptops have both).
 */

/** Movement (px) before a press becomes a drag, per pointer type. Unknown types behave like a mouse. */
export const DRAG_SLOP = Object.freeze({ mouse: 4, pen: 8, touch: 10 });

/** @param {string} [pointerType] */
export function dragSlop(pointerType) {
  return Object.prototype.hasOwnProperty.call(DRAG_SLOP, pointerType) ? DRAG_SLOP[pointerType] : DRAG_SLOP.mouse;
}

/**
 * Which axis a gesture belongs to once it moved past `slop`. A perfect diagonal goes to `'y'` (the page scroll keeps
 * priority over a horizontal gesture).
 * @returns {'x' | 'y' | null}
 */
export function axisLock(dx, dy, slop) {
  if (Math.hypot(dx, dy) < slop) return null;
  return Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
}

/**
 * Velocity (px/ms) at release from the move samples of the last `windowMs`. Fewer than two samples in the window
 * (the finger stopped before lifting) → 0.
 * @param {{ x: number, t: number }[]} samples coordinate along the axis of interest + timestamp (ms)
 * @param {number} now release time (ms)
 */
export function releaseVelocity(samples, now, windowMs = 100) {
  const recent = samples.filter((s) => s.t >= now - windowMs);
  if (recent.length < 2) return 0;
  const a = recent[0];
  const b = recent[recent.length - 1];
  const dt = b.t - a.t;
  return dt > 0 ? (b.x - a.x) / dt : 0;
}

/** Commit thresholds of a horizontal swipe (fraction of the stage width / flick speed in px/ms). */
export const SWIPE_DISTANCE = 0.25;
export const SWIPE_VELOCITY = 0.3;

/**
 * Outcome of a horizontal swipe in PHYSICAL direction (dx < 0 = finger moved left = next). RTL is the caller's job.
 * @param {{ dx: number, vx: number, width: number, slop: number }} g
 * @returns {'next' | 'prev' | 'cancel'}
 */
export function swipeOutcome({ dx, vx, width, slop }) {
  const far = width > 0 && Math.abs(dx) > SWIPE_DISTANCE * width;
  const flick = Math.abs(vx) > SWIPE_VELOCITY && Math.abs(dx) > slop && Math.sign(vx) === Math.sign(dx);
  if (!dx || !(far || flick)) return 'cancel';
  return dx < 0 ? 'next' : 'prev';
}

export const RUBBER_RESISTANCE = 0.35;

/**
 * Rubber band: follows at RUBBER_RESISTANCE near 0 and approaches a cap (20 % of `width`) without reaching it.
 * @param {number} dx
 * @param {number} width
 */
export function rubberBand(dx, width) {
  const cap = Math.max(1, width) * 0.2;
  const a = Math.abs(dx);
  return Math.sign(dx) * cap * (1 - 1 / ((a * RUBBER_RESISTANCE) / cap + 1));
}
