/**
 * Shared, ref-counted page scroll lock for overlays (modal stack, lightbox, …).
 *
 * - Locks on `<html>` (the viewport scroller), NOT `<body>`: `overflow:hidden` on body
 *   while html is `visible` propagates to the viewport anyway, but setting it on body
 *   when html is not `visible` turns body into a scroll container and breaks
 *   `position: sticky` descendants.
 * - Remembers the host's previous inline `overflow` on `<html>` and restores exactly
 *   that value when the last lease is released (never blindly writes `''`).
 * - Ref-counted: every overlay takes its own lease; the page unlocks only when all
 *   leases are released. Releasing a lease twice is a no-op.
 * - CSSOM writes only (`el.style.x = …`) — allowed under strict CSP.
 */

let _count = 0;
/** @type {string|null} */
let _prevOverflow = null;

/**
 * Acquire a scroll-lock lease.
 * @returns {() => void} release function (idempotent)
 */
export function lockScroll() {
  if (typeof document === 'undefined') return () => {};
  const root = document.documentElement;
  if (_count === 0) {
    _prevOverflow = root.style.overflow;
    root.style.overflow = 'hidden';
  }
  _count += 1;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    _count -= 1;
    if (_count <= 0) {
      _count = 0;
      root.style.overflow = _prevOverflow || '';
      _prevOverflow = null;
    }
  };
}

/** @returns {boolean} true while at least one lease is held */
export function isScrollLocked() {
  return _count > 0;
}
