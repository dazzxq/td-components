/**
 * Chromium CDP touch input for the touch lane (v0.36.2, ADR 0019, plan M7). `Input.dispatchTouchEvent` produces REAL
 * touch input (pointer events, implicit capture, touch-action, scrolling, :active) with explicit timestamps, so a
 * gesture's speed is deterministic without sleeping: `event.timeStamp` follows the `timestamp` we send.
 */

/** @param {import('playwright-core').Page} page */
export async function cdpFor(page) {
  return page.context().newCDPSession(page);
}

/** A monotonic clock (seconds) for CDP timestamps; every gesture starts after the previous one ended. */
let clock = Date.now() / 1000;
const next = (ms = 0) => { clock = Math.max(clock + ms / 1000, Date.now() / 1000); return clock; };

const send = (cdp, type, touchPoints, timestamp) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints, timestamp });

/** Touch down at `pt` (one finger, id 0). Returns the timestamp. */
export async function touchDown(cdp, pt) {
  const t = next(50);
  await send(cdp, 'touchStart', [{ x: pt.x, y: pt.y, id: 0 }], t);
  return t;
}

/** Move the finger to `pt`, `ms` after the previous event. */
export async function touchMoveTo(cdp, pt, ms = 16) {
  const t = next(ms);
  await send(cdp, 'touchMove', [{ x: pt.x, y: pt.y, id: 0 }], t);
  return t;
}

export async function touchUp(cdp, ms = 16) {
  await send(cdp, 'touchEnd', [], next(ms));
}

export async function touchCancel(cdp, ms = 16) {
  await send(cdp, 'touchCancel', [], next(ms));
}

/**
 * Drag one finger through `pts` ([{x, y}], first = touch down) in `durationMs`, moves every ~16 ms (linear between
 * waypoints). `{ end: false }` keeps the finger down; `{ cancel: true }` ends with touchCancel.
 */
export async function touchDrag(cdp, pts, { durationMs = 240, end = true, cancel = false } = {}) {
  await touchDown(cdp, pts[0]);
  const steps = Math.max(pts.length - 1, Math.round(durationMs / 16));
  const segs = pts.length - 1;
  for (let i = 1; i <= steps; i++) {
    const f = (i / steps) * segs;
    const k = Math.min(segs - 1, Math.floor(f));
    const r = f - k;
    const a = pts[k];
    const b = pts[k + 1];
    await touchMoveTo(cdp, { x: a.x + (b.x - a.x) * r, y: a.y + (b.y - a.y) * r }, durationMs / steps);
  }
  if (cancel) await touchCancel(cdp);
  else if (end) await touchUp(cdp);
}

/** Two-finger pinch around `center`: finger distance `from` → `to` px (horizontal), `{ end: false }` keeps them down. */
export async function pinch(cdp, center, from, to, { durationMs = 200, end = true } = {}) {
  const two = (d) => [{ x: center.x - d / 2, y: center.y, id: 0 }, { x: center.x + d / 2, y: center.y, id: 1 }];
  await send(cdp, 'touchStart', two(from), next(50));
  const steps = Math.max(2, Math.round(durationMs / 16));
  for (let i = 1; i <= steps; i++) await send(cdp, 'touchMove', two(from + ((to - from) * i) / steps), next(durationMs / steps));
  if (end) await send(cdp, 'touchEnd', [], next(16));
}

/** Two taps 120 ms apart at `pt` (double-tap). */
export async function doubleTap(cdp, pt) {
  for (let i = 0; i < 2; i++) {
    await send(cdp, 'touchStart', [{ x: pt.x, y: pt.y, id: 0 }], next(i ? 120 : 50));
    await send(cdp, 'touchEnd', [], next(30));
  }
}
