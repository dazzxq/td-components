/**
 * Floating panel placement shared by td-dropdown (menu) and td-tooltip (plan v0.9.0 step 0). Panels are portaled
 * to `<body>` with `position: fixed`; geometry is written through CSSOM (CSP-safe), never `style=""` markup.
 */

const EDGE = 8;

/**
 * Whether a reference rect is effectively hidden: not rendered, or scrolled out of the viewport (8 px edge).
 * @param {DOMRect|{top:number,bottom:number,left:number,right:number,width:number,height:number}} rect
 * @returns {boolean}
 */
export function isReferenceHidden(rect) {
  if (!rect) return true;
  const notRendered = rect.width === 0 && rect.height === 0;
  const offVertical = rect.bottom < EDGE || rect.top > window.innerHeight - EDGE;
  const offHorizontal = rect.right < EDGE || rect.left > window.innerWidth - EDGE;
  return notRendered || offVertical || offHorizontal;
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
