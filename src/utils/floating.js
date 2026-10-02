/**
 * Floating panel placement shared by td-dropdown (menu) and td-tooltip (plan v0.9.0 step 0). Panels are portaled
 * to `<body>` with `position: fixed`; geometry is written through CSSOM (CSP-safe), never `style=""` markup.
 */

const EDGE = 8;

/**
 * The visible box of `el` inside its clipping ancestors (v0.21.1): the viewport intersected with the padding box of
 * every ancestor whose `overflow` clips (hidden / auto / scroll / clip — e.g. a modal body that scrolls). Stops at a
 * `position: fixed` ancestor (nothing above it clips it) and never uses <body> / <html> (scroll lock sets their
 * overflow; the viewport already covers them).
 * @param {Element} el
 * @returns {{ top: number, bottom: number, left: number, right: number }}
 */
export function clippingRect(el) {
  const clip = { top: 0, left: 0, bottom: window.innerHeight, right: window.innerWidth };
  const root = document.documentElement;
  for (let node = el.parentElement; node && node !== document.body && node !== root; node = node.parentElement) {
    const cs = getComputedStyle(node);
    if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') {
      const r = node.getBoundingClientRect();
      const top = r.top + node.clientTop;
      const left = r.left + node.clientLeft;
      if (cs.overflowY !== 'visible') {
        clip.top = Math.max(clip.top, top);
        clip.bottom = Math.min(clip.bottom, top + node.clientHeight);
      }
      if (cs.overflowX !== 'visible') {
        clip.left = Math.max(clip.left, left);
        clip.right = Math.min(clip.right, left + node.clientWidth);
      }
    }
    if (cs.position === 'fixed') break;
  }
  return clip;
}

/**
 * Whether a reference rect is effectively hidden: not rendered, or scrolled out of the viewport (8 px edge). With
 * `el` (the reference element, v0.21.1) it is also hidden once its CENTRE leaves the visible box of its clipping
 * ancestors — a trigger scrolled under a modal's header / footer inside the modal body: a panel anchored to it would
 * otherwise float over that chrome.
 * @param {DOMRect|{top:number,bottom:number,left:number,right:number,width:number,height:number}} rect
 * @param {Element} [el]
 * @returns {boolean}
 */
export function isReferenceHidden(rect, el) {
  if (!rect) return true;
  const notRendered = rect.width === 0 && rect.height === 0;
  const offVertical = rect.bottom < EDGE || rect.top > window.innerHeight - EDGE;
  const offHorizontal = rect.right < EDGE || rect.left > window.innerWidth - EDGE;
  if (notRendered || offVertical || offHorizontal) return true;
  if (!el || typeof el.getBoundingClientRect !== 'function') return false;
  const c = clippingRect(el);
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  return cy < c.top || cy > c.bottom || cx < c.left || cx > c.right;
}

/** @type {Map<Element, Set<() => void>>} watched references → callbacks (one shared observer for all open popups) */
const disconnectWatchers = new Map();
let disconnectObserver = null;

function onDomMutation() {
  for (const [el, fns] of [...disconnectWatchers]) {
    if (el.isConnected) continue;
    for (const fn of [...fns]) fn(); // a callback usually closes its popup → unregisters itself
  }
}

/**
 * Call `fn` when `el` leaves the DOM. One document-wide MutationObserver (childList + subtree) is shared by every
 * watcher and disconnected when the last one stops.
 * @param {Element} el
 * @param {() => void} fn
 * @returns {() => void} stop
 */
function watchDisconnect(el, fn) {
  if (typeof MutationObserver === 'undefined') return () => {};
  let fns = disconnectWatchers.get(el);
  if (!fns) disconnectWatchers.set(el, (fns = new Set()));
  fns.add(fn);
  if (!disconnectObserver) {
    disconnectObserver = new MutationObserver(onDomMutation);
    disconnectObserver.observe(document, { childList: true, subtree: true });
  }
  return () => {
    const set = disconnectWatchers.get(el);
    if (set) {
      set.delete(fn);
      if (!set.size) disconnectWatchers.delete(el);
    }
    if (!disconnectWatchers.size && disconnectObserver) {
      disconnectObserver.disconnect();
      disconnectObserver = null;
    }
  };
}

/**
 * Follow the lifetime of an open popup's reference element (v0.21.1) — things a scroll / resize listener never sees:
 * - ResizeObserver on `el`: it was resized or stopped rendering (`display: none` → 0×0: tab switched, accordion
 *   closed, an ancestor hidden);
 * - MutationObserver (document, childList + subtree), only to notice `el` leaving the DOM (`!el.isConnected`);
 * - `transitionend` / `animationend` of an ANCESTOR of `el` (capture, document): e.g. a modal whose entry transform
 *   (translateY + scale) just finished — the popup was placed against the moving dialog.
 * `onChange` is the popup's reposition (which already closes once isReferenceHidden() / the reference is gone).
 * @param {Element} el
 * @param {() => void} onChange
 * @returns {() => void} stop (idempotent)
 */
export function watchReference(el, onChange) {
  if (typeof document === 'undefined' || !el) return () => {};
  let stopped = false;
  const fire = () => {
    if (stopped) return;
    try { onChange(); } catch (err) { console.error(err); }
  };
  let ro = null;
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(fire); // the initial notification is one harmless reposition
    ro.observe(el);
  }
  const detach = watchDisconnect(el, fire);
  const onEnd = (e) => {
    const t = e.target;
    if (t instanceof Node && t !== el && t.contains(el)) fire();
  };
  document.addEventListener('transitionend', onEnd, true);
  document.addEventListener('animationend', onEnd, true);
  return () => {
    if (stopped) return;
    stopped = true;
    if (ro) ro.disconnect();
    detach();
    document.removeEventListener('transitionend', onEnd, true);
    document.removeEventListener('animationend', onEnd, true);
  };
}

/**
 * Place `panel` against `trigger`:
 * - opens on the preferred side when it fits, else on the side with more room — never overlapping the trigger;
 * - when neither side fits, caps `opts.list` (the scrollable part) to the room instead of clamping `top`;
 * - horizontally: `width: 'match'` = same width as the trigger (viewport-capped), aligned to its left edge;
 *   `width: 'auto'` = natural width, aligned by `align` (`'center'` default, `'start'` = left edges, `'end'` = right
 *   edges); both clamped into the viewport with an 8 px margin when there is room for it.
 * @param {Element|DOMRect} trigger element or its rect
 * @param {HTMLElement} panel position: fixed element
 * @param {{ side?: 'bottom'|'top', gap?: number, margin?: number, width?: 'match'|'auto',
 *           align?: 'start'|'center'|'end', list?: HTMLElement|null, listMax?: number }} [opts]
 * @returns {{ side: 'bottom'|'top', top: number, left: number }}
 */
export function placeFloating(trigger, panel, opts = {}) {
  const rect = typeof trigger.getBoundingClientRect === 'function' ? trigger.getBoundingClientRect() : trigger;
  const gap = opts.gap ?? 8;
  const MARGIN = opts.margin ?? 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const s = panel.style;

  let width;
  if (opts.width === 'match') {
    width = Math.min(rect.width, vw);
    s.setProperty('width', `${width}px`);
    s.setProperty('min-width', `${width}px`);
    s.setProperty('max-width', `${width}px`);
  }

  const list = opts.list || null;
  if (list) {
    if (opts.listMax) list.style.setProperty('max-height', `${opts.listMax}px`);
    else list.style.removeProperty('max-height');
  }

  if (width === undefined) width = Math.min(panel.offsetWidth, vw);
  const margin = vw - width >= 2 * MARGIN ? MARGIN : 0;
  let wantLeft;
  if (opts.width === 'match' || opts.align === 'start') wantLeft = rect.left;
  else if (opts.align === 'end') wantLeft = rect.right - width;
  else wantLeft = rect.left + rect.width / 2 - width / 2;
  const left = Math.max(margin, Math.min(wantLeft, vw - width - margin));
  s.setProperty('left', `${left}px`);

  const naturalH = panel.offsetHeight;
  const chromeH = list ? naturalH - list.offsetHeight : 0;
  const below = vh - rect.bottom - gap - MARGIN;
  const above = rect.top - gap - MARGIN;
  const preferTop = opts.side === 'top';
  const first = preferTop ? above : below;
  const second = preferTop ? below : above;
  const onFirst = naturalH <= first || first >= second;
  const side = onFirst === preferTop ? 'top' : 'bottom';
  const space = Math.max(0, side === 'bottom' ? below : above);

  if (naturalH > space && list) {
    list.style.setProperty('max-height', `${Math.max(0, space - chromeH)}px`);
  }
  const h = panel.offsetHeight;
  const top = side === 'bottom' ? rect.bottom + gap : rect.top - gap - h;
  s.setProperty('top', `${top}px`);
  return { side, top, left };
}
