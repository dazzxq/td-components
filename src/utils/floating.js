/**
 * Floating panel placement shared by td-dropdown (menu) and td-tooltip (plan v0.9.0 step 0). Panels are portaled
 * to `<body>` with `position: fixed`; geometry is written through CSSOM (CSP-safe), never `style=""` markup.
 */

const EDGE = 8;

/**
 * The visible part of the layout viewport (v0.34.0, plan QĐ 7): `visualViewport` when available — the on-screen
 * keyboard (and pinch zoom) shrink it, so a popup placed in it is never hidden under the keyboard. Coordinates are
 * layout-viewport (getBoundingClientRect / position: fixed) coordinates.
 * @param {{ innerWidth: number, innerHeight: number, visualViewport?: { offsetTop: number, offsetLeft: number,
 *   width: number, height: number } | null }} [win]
 * @returns {{ top: number, left: number, right: number, bottom: number }}
 */
export function viewportBox(win = window) {
  const W = win.innerWidth;
  const H = win.innerHeight;
  const vv = win.visualViewport;
  if (!vv || !(vv.width > 0) || !(vv.height > 0)) return { top: 0, left: 0, right: W, bottom: H };
  const top = Math.min(Math.max(0, vv.offsetTop), H);
  const left = Math.min(Math.max(0, vv.offsetLeft), W);
  return { top, left, right: Math.min(W, left + vv.width), bottom: Math.min(H, top + vv.height) };
}

/**
 * The visible box of `el` inside its clipping ancestors (v0.21.1): the viewport intersected with the padding box of
 * every ancestor whose `overflow` clips (hidden / auto / scroll / clip — e.g. a modal body that scrolls). Stops at a
 * `position: fixed` ancestor (nothing above it clips it) and never uses <body> / <html> (scroll lock sets their
 * overflow; the viewport already covers them).
 * @param {Element} el
 * @returns {{ top: number, bottom: number, left: number, right: number }}
 */
export function clippingRect(el) {
  const clip = viewportBox();
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
  // v0.34.0: the on-screen keyboard opening / closing resizes the visual viewport (no window resize on iOS)
  const vv = typeof window !== 'undefined' ? window.visualViewport : null;
  if (vv) {
    vv.addEventListener('resize', fire);
    vv.addEventListener('scroll', fire);
  }
  return () => {
    if (stopped) return;
    stopped = true;
    if (ro) ro.disconnect();
    detach();
    document.removeEventListener('transitionend', onEnd, true);
    document.removeEventListener('animationend', onEnd, true);
    if (vv) {
      vv.removeEventListener('resize', fire);
      vv.removeEventListener('scroll', fire);
    }
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
  const box = viewportBox();
  const vw = box.right - box.left;
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
  const left = Math.max(box.left + margin, Math.min(wantLeft, box.right - width - margin));
  s.setProperty('left', `${left}px`);

  const naturalH = panel.offsetHeight;
  const chromeH = list ? naturalH - list.offsetHeight : 0;
  const below = box.bottom - rect.bottom - gap - MARGIN;
  const above = rect.top - box.top - gap - MARGIN;
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

const rectOf = (r) => (r && typeof r.getBoundingClientRect === 'function' ? r.getBoundingClientRect() : r);

/**
 * v0.118.0 (plan v0.118.0-menu-submenu QĐ 3, ADR 0046): place a submenu `panel` BESIDE its parent row `ref`:
 * - horizontally against `opts.edge` (the root menu's rect, else `ref`), abutting it (0 gap): the inline-end side
 *   (right in LTR, left with `dir: 'rtl'`) when it fits in the viewport box ± margin, else the inline-start side when
 *   it fits, else the side with more room, clamped into the box (it may then overlap the root);
 * - vertically: the panel's first row level with `ref` (`top = ref.top − padding-top of the panel`), shifted up to
 *   fit the bottom edge, then clamped to the top edge;
 * - `opts.list` (the scrollable part) gets `max-height: opts.listMax` first, like placeFloating.
 * Writes only top / left / max-height (CSSOM). `opts.box` / `opts.padTop` are injectable (node tests).
 * @param {Element|DOMRect} ref the parent row (or its rect)
 * @param {HTMLElement} panel position: fixed element
 * @param {{ edge?: Element|DOMRect, list?: HTMLElement|null, listMax?: number, dir?: 'ltr'|'rtl', margin?: number,
 *           box?: { top: number, left: number, right: number, bottom: number }, padTop?: number }} [opts]
 * @returns {{ side: 'end'|'start', top: number, left: number }}
 */
export function placeBeside(ref, panel, opts = {}) {
  const r = rectOf(ref);
  const edge = opts.edge ? rectOf(opts.edge) : r;
  const box = opts.box || viewportBox();
  const M = opts.margin ?? EDGE;
  const s = panel.style;
  const list = opts.list || null;
  if (list) {
    if (opts.listMax) list.style.setProperty('max-height', `${opts.listMax}px`);
    else list.style.removeProperty('max-height');
  }
  const w = panel.offsetWidth;
  const h = panel.offsetHeight;
  const rtl = opts.dir === 'rtl';
  const rightX = edge.right;
  const leftX = edge.left - w;
  const fitsRight = rightX + w <= box.right - M;
  const fitsLeft = leftX >= box.left + M;
  let left;
  let side;
  if (rtl ? fitsLeft : fitsRight) {
    side = 'end';
    left = rtl ? leftX : rightX;
  } else if (rtl ? fitsRight : fitsLeft) {
    side = 'start';
    left = rtl ? rightX : leftX;
  } else {
    const rightMore = box.right - edge.right >= edge.left - box.left;
    side = rightMore !== rtl ? 'end' : 'start';
    left = Math.max(box.left + M, Math.min(rightMore ? rightX : leftX, box.right - M - w));
  }
  const padTop = typeof opts.padTop === 'number' ? opts.padTop : parseFloat(getComputedStyle(panel).paddingTop) || 0;
  let top = r.top - padTop;
  if (top + h > box.bottom - M) top = box.bottom - M - h;
  top = Math.max(top, box.top + M);
  s.setProperty('left', `${left}px`);
  s.setProperty('top', `${top}px`);
  return { side, top, left };
}

/**
 * v0.118.0 (QĐ 4): whether point `p` lies in the triangle a-b-c (edges included; a degenerate triangle contains
 * nothing). The submenu "safe triangle": the exit point + the two corners of the submenu's near edge.
 * @param {{ x: number, y: number }} p
 * @param {{ x: number, y: number }} a
 * @param {{ x: number, y: number }} b
 * @param {{ x: number, y: number }} c
 * @returns {boolean}
 */
export function inTriangle(p, a, b, c) {
  const cross = (o, u, v) => (u.x - o.x) * (v.y - o.y) - (u.y - o.y) * (v.x - o.x);
  if (cross(a, b, c) === 0) return false;
  const d1 = cross(a, b, p);
  const d2 = cross(b, c, p);
  const d3 = cross(c, a, p);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}
