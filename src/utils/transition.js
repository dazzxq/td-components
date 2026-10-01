/**
 * Internal helper: how long an element's current CSS transitions run, read from computed style. Used to keep a
 * closing node in the DOM until its exit transition (driven by a public token such as --td-toast-exit-dur) is done.
 *
 * @module utils/transition
 */

/**
 * Parse one CSS time ("0.18s" / "180ms") to ms; NaN when unparsable.
 * @param {string} raw
 * @returns {number}
 */
function timeMs(raw) {
  const m = /^\s*(-?[\d.]+)(ms|s)\s*$/i.exec(String(raw));
  if (!m) return NaN;
  return Number(m[1]) * (m[2].toLowerCase() === 's' ? 1000 : 1);
}

/**
 * Longest `duration + delay` across a computed transition list (lists repeat to the longer length, as in CSS).
 * Pure — unit-testable without a DOM.
 * @param {string} durations computed `transition-duration`, e.g. "0.18s, 0.18s"
 * @param {string} delays computed `transition-delay`, e.g. "0s"
 * @returns {number|null} ms (≥ 0), or null when nothing parsable
 */
export function transitionTotalMs(durations, delays) {
  const d = String(durations || '').split(',').map(timeMs);
  const l = String(delays || '0s').split(',').map(timeMs);
  if (!d.length || d.every((n) => !Number.isFinite(n))) return null;
  let max = 0;
  const n = Math.max(d.length, l.length);
  for (let i = 0; i < n; i++) {
    const dur = d[i % d.length];
    const del = l[i % l.length];
    const total = (Number.isFinite(dur) ? Math.max(0, dur) : 0) + (Number.isFinite(del) ? del : 0);
    if (total > max) max = total;
  }
  return max;
}

/**
 * Longest transition (duration + delay) currently computed on any of `elements`.
 * @param {...(Element|null|undefined)} elements
 * @returns {number|null} ms, or null when no element's style could be read
 */
export function transitionEndMs(...elements) {
  let max = null;
  for (const el of elements) {
    if (!el) continue;
    let cs;
    try { cs = getComputedStyle(el); } catch { continue; }
    if (!cs) continue;
    const ms = transitionTotalMs(cs.transitionDuration, cs.transitionDelay);
    if (ms !== null && (max === null || ms > max)) max = ms;
  }
  return max;
}
