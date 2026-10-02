/**
 * Shared, ref-counted page scroll lock for overlays (modal stack, lightbox, …).
 *
 * - Locks on `<html>` (the viewport scroller), NOT `<body>`: `overflow:hidden` on body
 *   while html is `visible` propagates to the viewport anyway, but setting it on body
 *   when html is not `visible` turns body into a scroll container and breaks
 *   `position: sticky` descendants.
 * - Keeps the scrollbar's space (v0.22.1): with a classic scrollbar (Windows, macOS "always show"),
 *   `overflow:hidden` would remove it and the whole page — and every centred fixed overlay — would jump
 *   sideways by its width mid-animation. While locked, `<html>` gets `scrollbar-gutter: stable` (or, where
 *   unsupported or not honoured, the measured scrollbar width added to its `padding-inline-end` plus
 *   `--td-scroll-lock-gap` on `<html>` for fixed overlays, see modal.css). Only when the page had a scrollbar
 *   (`innerWidth - clientWidth > 0`); overlay scrollbars take no space and need nothing.
 * - Remembers the host's previous inline `overflow` / `scrollbar-gutter` / `padding-inline-end` on `<html>`
 *   (value and priority) and restores exactly those when the last lease is released (never blindly writes `''`).
 * - Ref-counted: every overlay takes its own lease; the page unlocks only when all
 *   leases are released. Releasing a lease twice is a no-op.
 * - CSSOM writes only (`el.style.x = …`) — allowed under strict CSP.
 */

let _count = 0;
/** @type {string|null} */
let _prevOverflow = null;
/** @type {Array<{ prop: string, value: string, priority: string }>|null} inline declarations we replaced */
let _prevGutter = null;

const GAP_VAR = '--td-scroll-lock-gap';

function gutterSupported() {
  try { return typeof CSS !== 'undefined' && CSS.supports('scrollbar-gutter', 'stable'); } catch { return false; }
}

/** @param {HTMLElement} root @param {string[]} props */
function remember(root, props) {
  _prevGutter = props.map((prop) => ({
    prop, value: root.style.getPropertyValue(prop), priority: root.style.getPropertyPriority(prop),
  }));
}

/**
 * Hide the page scrollbar while keeping its space. Measured before the scrollbar goes away; after locking, the
 * width is verified (Chromium ignores `scrollbar-gutter` on a root whose scrollbar is a custom
 * `::-webkit-scrollbar`), and a gutter that did not hold falls back to padding.
 * @param {HTMLElement} root
 */
function hideKeepingGutter(root) {
  let width = 0;
  let before = 0;
  try {
    before = root.clientWidth;
    width = window.innerWidth - before;
  } catch { width = 0; }
  if (!(width > 0)) { // no classic scrollbar (overlay / none) → nothing will disappear
    root.style.overflow = 'hidden';
    return;
  }
  remember(root, ['scrollbar-gutter', 'padding-inline-end', GAP_VAR]);
  if (gutterSupported()) {
    root.style.setProperty('scrollbar-gutter', 'stable');
    root.style.overflow = 'hidden';
    if (root.clientWidth <= before) return; // the gutter held
    restoreGutter(root, false); // it did not: undo, use padding instead
  } else {
    root.style.overflow = 'hidden';
  }
  let pad = 0;
  try { pad = parseFloat(getComputedStyle(root).paddingInlineEnd) || 0; } catch { /* 0 */ }
  root.style.setProperty('padding-inline-end', `${pad + width}px`, 'important');
  // fixed overlays (td-modal) read this to stay centred where they were: the viewport itself grew by `width`
  root.style.setProperty(GAP_VAR, `${width}px`);
}

/** @param {HTMLElement} root @param {boolean} [clear=true] forget what was remembered */
function restoreGutter(root, clear = true) {
  if (!_prevGutter) return;
  for (const { prop, value, priority } of _prevGutter) {
    if (value) root.style.setProperty(prop, value, priority);
    else root.style.removeProperty(prop);
  }
  if (clear) _prevGutter = null;
}

/**
 * Acquire a scroll-lock lease.
 * @returns {() => void} release function (idempotent)
 */
export function lockScroll() {
  if (typeof document === 'undefined') return () => {};
  const root = document.documentElement;
  if (_count === 0) {
    _prevOverflow = root.style.overflow;
    hideKeepingGutter(root);
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
      restoreGutter(root);
    }
  };
}

/** @returns {boolean} true while at least one lease is held */
export function isScrollLocked() {
  return _count > 0;
}
