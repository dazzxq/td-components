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
 * - v0.91.0 gutter colour: the reserved strip (gutter / padding area) paints only <html>'s background, and fixed
 *   overlays do not cover it, so a light strip stayed beside a dark scrim. `holdGutterColor(scrimEl)` (one colour
 *   lease per overlay, LIFO) sets an inline `background-color` on <html> = the topmost live scrim composited over
 *   the canvas colour (html, else body, else white), both normalised to sRGBA through a 1x1 canvas (oklch(),
 *   color(display-p3 …), alpha all work). Only when the width measured before the lock is > 0; the previous inline
 *   value + priority comes back with the last scroll lease. Instant (no transition), CSSOM only.
 * - CSSOM writes only (`el.style.x = …`) — allowed under strict CSP.
 */

let _count = 0;
/** @type {string|null} */
let _prevOverflow = null;
/** @type {Array<{ prop: string, value: string, priority: string }>|null} inline declarations we replaced */
let _prevGutter = null;

const GAP_VAR = '--td-scroll-lock-gap';

/** v0.91.0 — gutter colour state (see the header). */
let _gap = 0; // innerWidth - clientWidth measured before the first lease locked (0 = never paint)
/** @type {{ r: number, g: number, b: number }|null} */
let _canvas = null; // canvas colour recorded at the first lease
/** @type {{ value: string, priority: string }|null} */
let _prevBg = null; // html's inline background-color before the kit touched it
let _painted = false;
/** @type {Array<{ el: Element }>} LIFO colour leases (last = topmost) */
const _colorLeases = [];
/** @type {CanvasRenderingContext2D|null|undefined} undefined = not tried yet */
let _ctx;

/** @returns {CanvasRenderingContext2D|null} */
function colorContext() {
  if (_ctx !== undefined) return _ctx;
  _ctx = null;
  try {
    const c = document.createElement('canvas');
    c.width = 1; c.height = 1;
    _ctx = c.getContext('2d', { willReadFrequently: true }) || null;
  } catch { _ctx = null; }
  return _ctx;
}

/**
 * Any CSS colour → sRGBA (0-255 / alpha 0-1) through a 1x1 canvas; null when it cannot be read.
 * @param {string} css
 * @returns {{ r: number, g: number, b: number, a: number }|null}
 */
function toRgba(css) {
  const ctx = colorContext();
  if (!ctx || !css) return null;
  try {
    // an invalid colour leaves fillStyle untouched: it is invalid only if it "keeps" two different sentinels
    // (a single sentinel would reject a scrim that happens to equal it — impl review r1)
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = '#000000';
    ctx.fillStyle = css;
    if (ctx.fillStyle === '#000000') {
      ctx.fillStyle = '#ffffff';
      ctx.fillStyle = css;
      if (ctx.fillStyle === '#ffffff') return null;
    }
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
  } catch { return null; }
}

/** Opaque colour of what the page paints behind the strip: html, else body, else white. */
function readCanvasColor() {
  const white = { r: 255, g: 255, b: 255 };
  try {
    for (const el of [document.documentElement, document.body]) {
      if (!el) continue;
      const c = toRgba(getComputedStyle(el).backgroundColor);
      if (c && c.a > 0) {
        return { r: Math.round(c.a * c.r + (1 - c.a) * 255), g: Math.round(c.a * c.g + (1 - c.a) * 255), b: Math.round(c.a * c.b + (1 - c.a) * 255) };
      }
    }
  } catch { /* white */ }
  return white;
}

function restoreBg(root) {
  if (!_painted) return;
  _painted = false;
  if (_prevBg && _prevBg.value) root.style.setProperty('background-color', _prevBg.value, _prevBg.priority);
  else root.style.removeProperty('background-color');
}

/** Paint (or unpaint) the strip from the topmost readable colour lease. */
function repaintGutter() {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (_count <= 0 || !(_gap > 0) || !_canvas) return;
  for (let i = _colorLeases.length - 1; i >= 0; i -= 1) {
    let scrim = null;
    try { scrim = toRgba(getComputedStyle(_colorLeases[i].el).backgroundColor); } catch { /* next */ }
    if (!scrim) continue;
    const a = scrim.a;
    const mix = (s, c) => Math.round(a * s + (1 - a) * c);
    _painted = true;
    root.style.setProperty('background-color', `rgb(${mix(scrim.r, _canvas.r)} ${mix(scrim.g, _canvas.g)} ${mix(scrim.b, _canvas.b)})`);
    return;
  }
  restoreBg(root);
}

/**
 * v0.91.0: one colour lease per overlay. While the page is scroll-locked and a scrollbar strip was reserved, `<html>`
 * is painted with the topmost live scrim over the canvas colour. Take the SCROLL lease first and call this after the
 * overlay's theme scope is applied (the scrim's computed colour is read then and again on every change).
 * @param {Element} scrimEl the element whose computed `background-color` is the overlay's scrim
 * @returns {() => void} release (idempotent)
 */
export function holdGutterColor(scrimEl) {
  if (typeof document === 'undefined' || !scrimEl) return () => {};
  const lease = { el: scrimEl };
  _colorLeases.push(lease);
  repaintGutter();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const i = _colorLeases.indexOf(lease);
    if (i !== -1) _colorLeases.splice(i, 1);
    repaintGutter();
  };
}

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
    // value + priority: a site's inline `overflow: … !important` comes back exactly (v0.22.1 review)
    _prevOverflow = { value: root.style.getPropertyValue('overflow'), priority: root.style.getPropertyPriority('overflow') };
    // v0.91.0: everything the gutter colour needs is read BEFORE the lock changes anything
    try { _gap = window.innerWidth - root.clientWidth; } catch { _gap = 0; }
    _prevBg = null;
    _canvas = null;
    if (_gap > 0) {
      _prevBg = { value: root.style.getPropertyValue('background-color'), priority: root.style.getPropertyPriority('background-color') };
      _canvas = colorContext() ? readCanvasColor() : null;
    }
    hideKeepingGutter(root);
    _count += 1;
    repaintGutter(); // colour leases recorded before the lock (they painted nothing while unlocked)
  } else {
    _count += 1;
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    _count -= 1;
    if (_count <= 0) {
      _count = 0;
      if (_prevOverflow && _prevOverflow.value) root.style.setProperty('overflow', _prevOverflow.value, _prevOverflow.priority);
      else root.style.removeProperty('overflow');
      _prevOverflow = null;
      restoreGutter(root);
      restoreBg(root);
      _gap = 0;
      _canvas = null;
      _prevBg = null;
    }
  };
}

/** @returns {boolean} true while at least one lease is held */
export function isScrollLocked() {
  return _count > 0;
}
