/**
 * On-screen keyboard and full-screen dialogs (v0.36.2, ADR 0019, plan QĐ 15–17). Internal module.
 *
 * iOS Safari and Android Chrome ≥ 108 (`interactive-widget=resizes-visual`, the default) do NOT shrink the layout
 * viewport when the keyboard opens — a `position: fixed; inset: 0` overlay keeps its full height and the keyboard
 * covers its footer and the focused field. While a dialog layer is open, `watchKeyboardViewport()` follows
 * `visualViewport` (the same box popups use, floating.js `viewportBox()`):
 *   - writes `--td-vv-top` / `--td-vv-height` (px, CSSOM) on the overlay root while a keyboard box exists — the root
 *     CSS (`.td-modal`, `.td-drawer-root`) is `top: var(--td-vv-top, 0); height: var(--td-vv-height, 100%)`, so the
 *     dialog / sheet / drawer and its footer sit above the keyboard; removes them otherwise;
 *   - scrolls the dialog's scroller (only that element's scrollTop) so the focused control's `.td-field` box (label,
 *     hint, error) is visible — never `focus()`, never `scrollIntoView()` (iOS would scroll the window too).
 * No keyboard box while pinch-zoomed (scale ≠ 1): the user's zoom is never fought.
 * `--td-vv-*` start with `--td-` but are NOT an API (written by the kit, read by the kit).
 */
import { viewportBox } from './floating.js';

/**
 * The visible box while an on-screen keyboard (or any visual-viewport shrink) is up, in layout-viewport coordinates;
 * null without visualViewport, while pinch-zoomed (|scale − 1| > 0.01) or when the visual viewport covers the layout
 * viewport (±1 px — e.g. a site with `interactive-widget=resizes-content`, where the layout viewport already shrank).
 * Reads `globalThis` at call time when no window is given.
 * @param {{ innerWidth: number, innerHeight: number, visualViewport?: any }} [win]
 * @returns {{ top: number, height: number, inset: number } | null}
 */
export function keyboardBox(win = globalThis) {
  const vv = win && win.visualViewport;
  if (!vv || !(vv.height > 0)) return null;
  if (Math.abs((typeof vv.scale === 'number' ? vv.scale : 1) - 1) > 0.01) return null;
  const H = win.innerHeight;
  const box = viewportBox(win);
  const height = box.bottom - box.top;
  if (box.top <= 1 && height >= H - 1) return null;
  return { top: box.top, height, inset: H - box.bottom };
}

/**
 * px to add to the scroller's scrollTop so `target` lies inside the part of the scroller that is visible (`visible`
 * = the keyboard box), with `margin` px of air. A target taller than that part shows its top edge.
 * @param {{ top: number, bottom: number }} target
 * @param {{ top: number, bottom: number }} scroller
 * @param {{ top: number, bottom: number }} visible
 */
export function revealDelta(target, scroller, visible, margin = 8) {
  const top = Math.max(scroller.top, visible.top) + margin;
  const bottom = Math.min(scroller.bottom, visible.bottom) - margin;
  if (target.bottom - target.top > bottom - top) return target.top - top;
  if (target.top < top) return target.top - top;
  if (target.bottom > bottom) return target.bottom - bottom;
  return 0;
}

const TOP = '--td-vv-top';
const HEIGHT = '--td-vv-height';

/**
 * Follow the keyboard while a dialog layer is open. Returns `stop()` (removes the listeners and both variables).
 * @param {{ root: HTMLElement, scroller?: HTMLElement | ((active: Element) => HTMLElement | null) | null }} o
 * @returns {() => void}
 */
export function watchKeyboardViewport({ root, scroller }) {
  const win = root.ownerDocument.defaultView || globalThis;
  const vv = win.visualViewport;
  let raf = 0;
  let last = null;
  const clearVars = () => {
    root.style.removeProperty(TOP);
    root.style.removeProperty(HEIGHT);
    last = null;
  };
  const apply = () => {
    raf = 0;
    const kb = keyboardBox(win);
    if (!kb) {
      if (last) clearVars();
      return;
    }
    if (!last || Math.abs(last.top - kb.top) >= 1 || Math.abs(last.height - kb.height) >= 1) {
      root.style.setProperty(TOP, `${Math.round(kb.top)}px`);
      root.style.setProperty(HEIGHT, `${Math.round(kb.height)}px`);
      last = kb;
    }
    const active = root.ownerDocument.activeElement;
    if (!(active instanceof Element) || !root.contains(active)) return;
    const sc = typeof scroller === 'function' ? scroller(active) : scroller;
    if (!sc || !sc.contains(active) || sc === active) return;
    const visible = { top: kb.top, bottom: kb.top + kb.height };
    const sr = sc.getBoundingClientRect();
    const field = active.closest('.td-field');
    let target = active.getBoundingClientRect();
    if (field && sc.contains(field)) {
      const fr = field.getBoundingClientRect();
      const room = Math.min(sr.bottom, visible.bottom) - Math.max(sr.top, visible.top) - 16;
      if (fr.height <= room) target = fr;
    }
    const d = revealDelta(target, sr, visible);
    if (Math.abs(d) >= 1) sc.scrollTop += d;
  };
  const schedule = () => { if (!raf) raf = win.requestAnimationFrame(apply); };
  vv?.addEventListener('resize', schedule);
  vv?.addEventListener('scroll', schedule);
  root.addEventListener('focusin', schedule);
  schedule();
  return () => {
    if (raf) win.cancelAnimationFrame(raf);
    raf = 0;
    vv?.removeEventListener('resize', schedule);
    vv?.removeEventListener('scroll', schedule);
    root.removeEventListener('focusin', schedule);
    clearVars();
  };
}

/**
 * A `scroller` resolver for dialogs with several scrolling regions (media picker results / detail pane, upload and
 * filter sheets): the nearest ancestor of the focused element, inside `root`, whose overflow-y scrolls.
 * @param {HTMLElement} root
 * @returns {(active: Element) => HTMLElement | null}
 */
export function nearestScroller(root) {
  return (active) => {
    for (let n = active.parentElement; n && n !== root; n = n.parentElement) {
      const oy = getComputedStyle(n).overflowY;
      if (oy === 'auto' || oy === 'scroll') return n;
    }
    return null;
  };
}
