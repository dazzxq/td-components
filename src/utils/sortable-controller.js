/**
 * SortableController — pointer + keyboard reordering shared by <td-sortable> and <td-repeater sortable> (v0.31.0, plan
 * docs/internal/plans/v0.31.0-sortable-masked.md M2). Internal util (not a public export).
 *
 * The controller NEVER reorders the DOM itself: it handles pointer / keyboard / transforms / the placeholder /
 * announcements and calls the consumer's adapter `move(from, to)` (neighbour moves + model.move — the moved item stays
 * attached, focus kept). The order lives in the consumer's OrderedCollectionModel (keys = elements).
 *
 * - Lift / drop / tap-to-move go through ONE path: `click` on a handle (Enter / Space, a screen reader click with
 *   `detail 0`, a tap or a mouse click without a drag). A click right after a real drag is swallowed.
 * - Lifted: ↑ ↓ ← → Home End on the lifted handle move the DOM step by step (keyTarget: list / grid / rtl); Escape (via
 *   layers.js) puts it back; focus leaving the handle drops (except to another handle of this host — tap-to-move).
 * - Pointer: the DOM never changes while dragging (transform on the dragged item + preview shifts on the others +
 *   placeholder); the drop is ONE `move(from, to)`. Any cancel only clears the transforms.
 * - CSP: positions via CSSOM only (`--_td-sort-x` / `--_td-sort-y` custom properties, placeholder `left` / `top` /
 *   `width` / `height`); every property is cleared at the end.
 * - Escape / covering through `register()` of src/utils/layers.js (floating popover layer, `coverAlways`, anchor = the
 *   handle), only while a gesture is active; released exactly once.
 * - Mutations caused by the controller (adapter moves, the placeholder) must never cancel a gesture: consumers skip
 *   records holding only `isOwnNode()` nodes and compare their DOM items with the (already updated) model.
 */
import { register, LAYERS } from './layers.js';
import { columns, layoutKind, hitSlot, shiftDeltas, slotRect, keyTarget, autoScrollSpeed } from './sortable-geometry.js';

/** Texts (Vietnamese) shared by td-sortable and td-repeater[sortable] (`TdSortable.labels` is this object). */
export const SORTABLE_LABELS = {
  handle: 'Sắp xếp {name}',
  item: 'Mục {n}',
  help: 'Nhấn Space hoặc Enter để nhấc, phím mũi tên để di chuyển, Space hoặc Enter để thả, Escape để huỷ.',
  lifted: 'Đã nhấc {name}, vị trí {n} trên {count}.',
  moved: '{name}: vị trí {n} trên {count}.',
  dropped: 'Đã thả {name} ở vị trí {n} trên {count}.',
  cancelled: 'Đã huỷ, {name} về vị trí {n} trên {count}.',
  first: '{name} đã ở đầu danh sách.',
  last: '{name} đã ở cuối danh sách.',
};

/** px of movement before a press on a handle becomes a drag */
const THRESHOLD = 4;
const NAV_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End']);
const X = '--_td-sort-x';
const Y = '--_td-sort-y';

/** @param {string} tpl @param {Record<string, *>} vars */
export function formatLabel(tpl, vars = {}) {
  return String(tpl ?? '').replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

/**
 * Default accessible name of an item: `data-td-sort-label` > `aria-label` > text of `aria-labelledby` > labels.item
 * ("Mục {n}"). NEVER the item's textContent (may hold field values, too long).
 * @param {Element} item
 * @param {number} index
 * @param {object} labels
 * @returns {string}
 */
export function defaultItemName(item, index, labels = SORTABLE_LABELS) {
  const own = item.getAttribute('data-td-sort-label')?.trim() || item.getAttribute('aria-label')?.trim();
  if (own) return own;
  const ref = item.getAttribute('aria-labelledby');
  if (ref) {
    const root = item.getRootNode();
    const text = ref.split(/\s+/).filter(Boolean)
      .map((id) => (typeof root.getElementById === 'function' ? root.getElementById(id) : null)?.textContent?.trim() || '')
      .filter(Boolean).join(' ');
    if (text) return text;
  }
  return formatLabel(labels.item, { n: index + 1 });
}

/** @private clear the controller's custom properties (and an emptied style attribute) */
function clearPos(el) {
  if (!el || !el.style) return;
  el.style.removeProperty(X);
  el.style.removeProperty(Y);
  if (!el.style.length && el.getAttribute('style') === '') el.removeAttribute('style');
}

/** @private nearest scroll container of `el` (itself first), else the document scroller */
function scrollParent(el) {
  const doc = el.ownerDocument;
  for (let n = el; n && n !== doc.body && n !== doc.documentElement; n = n.parentElement) {
    const cs = getComputedStyle(n);
    const y = /(auto|scroll)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight;
    const x = /(auto|scroll)/.test(cs.overflowX) && n.scrollWidth > n.clientWidth;
    if (x || y) return n;
  }
  return doc.scrollingElement || doc.documentElement;
}

export class SortableController {
  /**
   * @param {HTMLElement} host
   * @param {{
   *   items: () => HTMLElement[],
   *   handleOf: (item: HTMLElement) => HTMLElement|null,
   *   move: (from: number, to: number) => void,
   *   commit: (d: { item: HTMLElement, from: number, to: number, source: 'pointer'|'keyboard' }) => void,
   *   nameOf?: (item: HTMLElement, index: number) => string,
   *   live: HTMLElement|null,
   *   enabled: () => boolean,
   *   labels?: object,
   *   placePlaceholder?: (ph: HTMLElement) => void,
   *   reconcile?: () => void,
   * }} opts
   *   `reconcile` (review round 1 IMPL-1): drain the consumer's pending MutationObserver records synchronously and apply
   *   them (an outside change cancels the gesture as 'external'); called right before every drop.
   */
  constructor(host, opts) {
    this.host = host;
    this.o = opts;
    this.labels = opts.labels || SORTABLE_LABELS;
    /** @type {'idle'|'pending'|'dragging'|'lifted'} */
    this.state = 'idle';
    this._g = null; // the active gesture
    this._suppressClick = false;
    this._suppressTimer = 0;
    this._downOnHandle = false;
    this._downTimer = 0;
    this._placeholder = null;
    this._onPointerDown = (e) => this._pointerDown(e);
    this._onClick = (e) => this._click(e);
    this._onKeyDown = (e) => this._keyDown(e);
    this._onFocusOut = (e) => this._focusOut(e);
    host.addEventListener('pointerdown', this._onPointerDown);
    host.addEventListener('click', this._onClick);
    host.addEventListener('keydown', this._onKeyDown);
    host.addEventListener('focusout', this._onFocusOut);
  }

  /** @returns {boolean} the node belongs to the controller (the placeholder) */
  isOwnNode(node) {
    return !!node && node === this._placeholder;
  }

  /** Cancel the active gesture (if any). `external`: the DOM changed outside — nothing is moved back. */
  cancel(reason = 'api') {
    const g = this._g;
    if (!g) {
      this.state = 'idle';
      return;
    }
    if (g.mode === 'lifted') {
      if (reason !== 'external') {
        const cur = this._indexOf(g.item);
        if (cur >= 0 && cur !== g.origin && g.origin < this._items().length) this._safeMove(cur, g.origin);
      }
      if (reason === 'escape') this._announce('cancelled', g.item, g.origin);
    }
    // a click already on its way (the button may still be down, or the observer cancelled during the click's own
    // dispatch — a microtask checkpoint runs between listeners) must not lift again; a fresh press (pointerdown,
    // Enter / Space keydown) clears it
    this._swallowClick();
    this._end();
  }

  /** Remove every listener (and cancel). */
  destroy() {
    this.cancel('destroy');
    const h = this.host;
    h.removeEventListener('pointerdown', this._onPointerDown);
    h.removeEventListener('click', this._onClick);
    h.removeEventListener('keydown', this._onKeyDown);
    h.removeEventListener('focusout', this._onFocusOut);
    clearTimeout(this._suppressTimer);
    clearTimeout(this._downTimer);
  }

  // --- helpers ---

  /** @private the click that may follow a real drag (same press) is swallowed — reset by the next press / 500ms */
  _swallowClick() {
    this._suppressClick = true;
    clearTimeout(this._suppressTimer);
    this._suppressTimer = setTimeout(() => { this._suppressClick = false; }, 500);
  }

  /** @private */
  _items() { return this.o.items() || []; }

  /** @private */
  _indexOf(item) { return this._items().indexOf(item); }

  /** @private the item whose handle is (or contains) `target` — only this host's own items (not a nested sortable) */
  _itemOfHandle(target) {
    if (!(target instanceof Element)) return null;
    const h = target.closest('.td-sortable__handle');
    if (!h || !this.host.contains(h)) return null;
    for (const it of this._items()) if (this.o.handleOf(it) === h) return { item: it, handle: /** @type {HTMLElement} */ (h) };
    return null;
  }

  /** @private */
  _enabled() {
    try { return !!this.o.enabled(); } catch { return false; }
  }

  /** @private */
  _usable(handle) {
    return this._enabled() && handle.getAttribute('aria-disabled') !== 'true' && !handle.matches(':disabled');
  }

  /** @private */
  _name(item, index) {
    const i = index ?? this._indexOf(item);
    return this.o.nameOf ? this.o.nameOf(item, i) : defaultItemName(item, i, this.labels);
  }

  /** @private live region: cleared then written (a repeated message is announced again), text only */
  _announce(key, item, index) {
    const live = this.o.live;
    if (!live) return;
    const i = index ?? this._indexOf(item);
    live.textContent = '';
    live.textContent = formatLabel(this.labels[key], { name: this._name(item, i), n: i + 1, count: this._items().length });
  }

  /** @private adapter move, guarded */
  _safeMove(from, to) {
    if (from === to) return;
    try { this.o.move(from, to); } catch (err) { console.error(err); }
  }

  /** @private a lift: gesture state + page guards + layer */
  _begin(mode, item, handle, origin) {
    const g = {
      mode, item, handle, origin, source: 'keyboard',
      layer: null, listeners: [],
    };
    this._g = g;
    this.state = mode;
    this._guardPage(g);
    this._register(g);
    return g;
  }

  /** @private the layer registration (Escape, covering) — once per gesture */
  _register(g) {
    if (g.layer) return;
    g.layer = register({
      layer: LAYERS.popover,
      element: this.host,
      keyboard: 'boundary',
      onEscape: () => { this.cancel('escape'); },
      anchor: g.handle,
      onCovered: () => this.cancel('covered'),
      coverAlways: true,
    });
  }

  /** @private page hidden / pagehide cancel — installed once per gesture, from `pending` on (review round 1 IMPL-3) */
  _guardPage(g) {
    if (g.guarded) return;
    g.guarded = true;
    const doc = this.host.ownerDocument;
    const win = doc.defaultView;
    this._on(doc, 'visibilitychange', () => { if (doc.visibilityState === 'hidden') this.cancel('hidden'); });
    this._on(win, 'pagehide', () => this.cancel('hidden'));
  }

  /**
   * @private Review round 1 IMPL-1: right before a drop the consumer drains its pending MutationObserver records; an
   * outside change cancels the gesture ('external'). Also checks the live DOM against the model itself.
   * @returns {boolean} the gesture `g` is still active and its DOM is the model's
   */
  _reconciled(g) {
    if (this.o.reconcile) {
      try { this.o.reconcile(); } catch (err) { console.error(err); }
    }
    if (this._g !== g) return false;
    const items = this._items();
    if (!items.includes(g.item) || items.some((it) => it.parentNode !== this.host)) {
      this.cancel('external');
      return false;
    }
    return true;
  }

  /** @private temporary listener of the active gesture */
  _on(target, type, fn, opts) {
    if (!target || !this._g) return;
    target.addEventListener(type, fn, opts);
    this._g.listeners.push(() => target.removeEventListener(type, fn, opts));
  }

  /** @private end of every path: clean everything, exactly once */
  _end() {
    const g = this._g;
    this._g = null;
    this.state = 'idle';
    if (!g) return;
    g.listeners.forEach((off) => off());
    g.listeners = [];
    if (g.raf) cancelAnimationFrame(g.raf);
    g.raf = 0;
    if (g.captured) {
      try { g.handle.releasePointerCapture(g.pointerId); } catch { /* already released */ }
    }
    for (const el of g.touched || []) clearPos(el);
    clearPos(g.item);
    g.item.removeAttribute('data-td-sort-state');
    this.host.removeAttribute('data-td-dragging');
    if (this._placeholder) {
      this._placeholder.remove();
      this._placeholder = null;
    }
    if (g.layer) g.layer.release();
    g.layer = null;
  }

  // --- click: lift / drop / tap-to-move ---

  /** @private */
  _click(e) {
    const hit = this._itemOfHandle(e.target);
    if (!hit) return;
    if (this._suppressClick) {
      this._suppressClick = false;
      clearTimeout(this._suppressTimer);
      return;
    }
    this._downOnHandle = false;
    const g = this._g;
    if (g && g.mode === 'lifted') {
      if (!this._reconciled(g)) return;
      if (hit.item === g.item) {
        this._drop(g.source);
        return;
      }
      // tap-to-move (WCAG 2.5.7): the lifted item goes to the clicked item's place and is dropped
      const cur = this._indexOf(g.item);
      const to = this._indexOf(hit.item);
      if (cur >= 0 && to >= 0 && cur !== to) this._safeMove(cur, to);
      const handle = g.handle;
      this._drop('pointer');
      if (handle.isConnected) handle.focus({ preventScroll: true });
      return;
    }
    if (g) return; // pending / dragging: the pointer path owns it
    if (!this._usable(hit.handle)) return;
    this._lift(hit.item, hit.handle);
  }

  /** @private */
  _lift(item, handle) {
    const origin = this._indexOf(item);
    if (origin < 0) return;
    this._begin('lifted', item, handle, origin);
    item.setAttribute('data-td-sort-state', 'lifted');
    this._announce('lifted', item, origin);
  }

  /** @private drop (lifted or dragging): commit when the index changed */
  _drop(source) {
    const g = this._g;
    if (!g || !this._reconciled(g)) return;
    const item = g.item;
    const from = g.origin;
    this._end();
    const to = this._indexOf(item);
    if (to < 0 || to === from) {
      if (g.mode === 'lifted' && to >= 0) this._announce('dropped', item, to);
      return;
    }
    try { this.o.commit({ item, from, to, source }); } catch (err) { console.error(err); }
    this._announce('dropped', item, to);
  }

  // --- keyboard (lifted) ---

  /** @private */
  _keyDown(e) {
    // a click produced by Enter / Space is never the tail of a pointer drag: it must not be swallowed
    if ((e.key === 'Enter' || e.key === ' ') && this._itemOfHandle(e.target)) this._suppressClick = false;
    const g = this._g;
    if (!g || g.mode !== 'lifted' || e.target !== g.handle) return;
    if (!NAV_KEYS.has(e.key) || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    const items = this._items();
    const cur = items.indexOf(g.item);
    if (cur < 0) return;
    const rects = this._snapshot(items);
    const cols = layoutKind(rects) === 'grid' ? columns(rects) : 1;
    const rtl = getComputedStyle(this.host).direction === 'rtl';
    const t = keyTarget(cur, items.length, e.key, { cols, rtl });
    if (t === cur) {
      const back = e.key === 'Home' || e.key === 'ArrowUp' || (e.key === 'ArrowLeft' && !(cols > 1 && rtl))
        || (e.key === 'ArrowRight' && cols > 1 && rtl);
      if (cur === 0 && back) this._announce('first', g.item, cur);
      else if (cur === items.length - 1 && !back) this._announce('last', g.item, cur);
      else this._announce('moved', g.item, cur);
      return;
    }
    this._safeMove(cur, t);
    g.source = 'keyboard';
    const now = this._indexOf(g.item);
    try { g.item.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch { /* old engines */ }
    this._announce('moved', g.item, now);
  }

  /** @private focus leaving the lifted handle drops — unless it goes to another handle of this host (tap-to-move) */
  _focusOut(e) {
    const g = this._g;
    if (!g || g.mode !== 'lifted' || e.target !== g.handle) return;
    if (this._downOnHandle) return; // a press on a handle of this host: tap-to-move decides (Safari focuses nothing)
    this._drop(g.source);
  }

  // --- pointer ---

  /** @private */
  _pointerDown(e) {
    const hit = this._itemOfHandle(e.target);
    if (!hit) return;
    this._downOnHandle = true;
    clearTimeout(this._downTimer);
    this._downTimer = setTimeout(() => { this._downOnHandle = false; }, 1000);
    this._suppressClick = false;
    if (this._g) return; // lifted: the click decides (tap-to-move / drop)
    if (e.button !== 0 || !e.isPrimary || !this._usable(hit.handle)) return;
    const g = {
      mode: 'pending', item: hit.item, handle: hit.handle, origin: this._indexOf(hit.item), source: 'pointer',
      pointerId: e.pointerId, sx: e.clientX, sy: e.clientY, cx: e.clientX, cy: e.clientY, listeners: [], touched: new Set(),
      layer: null, raf: 0, captured: false, to: -1,
    };
    if (g.origin < 0) return;
    this._g = g;
    this.state = 'pending';
    const doc = this.host.ownerDocument;
    this._on(doc, 'pointermove', (ev) => this._pointerMove(ev), true);
    this._on(doc, 'pointerup', (ev) => this._pointerUp(ev), true);
    this._on(doc, 'pointercancel', (ev) => { if (ev.pointerId === g.pointerId) this.cancel('pointercancel'); }, true);
    this._guardPage(g);
  }

  /** @private */
  _pointerMove(e) {
    const g = this._g;
    if (!g || e.pointerId !== g.pointerId) return;
    g.cx = e.clientX;
    g.cy = e.clientY;
    if (g.mode === 'pending') {
      if (Math.hypot(g.cx - g.sx, g.cy - g.sy) <= THRESHOLD) return;
      if (!this._enabled()) { this.cancel('disabled'); return; }
      this._startDrag(g);
      if (this._g !== g) return;
    }
    if (g.mode === 'dragging') {
      e.preventDefault();
      if (!g.raf) g.raf = requestAnimationFrame(() => this._frame());
    }
  }

  /** @private pending → dragging */
  _startDrag(g) {
    const items = this._items();
    g.origin = items.indexOf(g.item);
    if (g.origin < 0) { this.cancel('external'); return; }
    // the same gesture goes on: pointer listeners + page guards (from `pending`) kept, the layer added once
    g.mode = 'dragging';
    this.state = 'dragging';
    this._guardPage(g);
    this._register(g);
    if (this._g !== g) return; // covered at once
    try {
      g.handle.setPointerCapture(g.pointerId);
      g.captured = true;
    } catch { g.captured = false; }
    if (g.captured) this._on(g.handle, 'lostpointercapture', () => { if (this._g === g) this.cancel('capture'); });
    g.items = items;
    g.rects = this._snapshot(items);
    const p = this._toHost(g.sx, g.sy);
    g.px0 = p.x;
    g.py0 = p.y;
    g.to = g.origin;
    g.scroller = scrollParent(this.host);
    g.item.setAttribute('data-td-sort-state', 'dragging');
    this.host.setAttribute('data-td-dragging', '');
    const ph = this.host.ownerDocument.createElement('div');
    ph.className = 'td-sortable__placeholder';
    ph.setAttribute('aria-hidden', 'true');
    this._placeholder = ph;
    this._placePh(g.rects, g.origin, g.origin);
    if (this.o.placePlaceholder) this.o.placePlaceholder(ph);
    else this.host.appendChild(ph);
  }

  /** @private client → host content coordinates */
  _toHost(cx, cy) {
    const h = this.host;
    const r = h.getBoundingClientRect();
    return { x: cx - r.left - h.clientLeft + h.scrollLeft, y: cy - r.top - h.clientTop + h.scrollTop };
  }

  /** @private rects of the items in host content coordinates (transforms of a running drag are not cleared here) */
  _snapshot(items) {
    const h = this.host;
    const r = h.getBoundingClientRect();
    const ox = r.left + h.clientLeft - h.scrollLeft;
    const oy = r.top + h.clientTop - h.scrollTop;
    return items.map((it) => {
      const b = it.getBoundingClientRect();
      return { x: b.left - ox, y: b.top - oy, w: b.width, h: b.height };
    });
  }

  /** @private */
  _placePh(rects, from, to) {
    const ph = this._placeholder;
    const r = slotRect(rects, from, to);
    if (!ph || !r) return;
    ph.style.setProperty('left', `${r.x}px`);
    ph.style.setProperty('top', `${r.y}px`);
    ph.style.setProperty('width', `${r.w}px`);
    ph.style.setProperty('height', `${r.h}px`);
  }

  /** @private hit-test + preview at the current pointer position */
  _update(g) {
    const p = this._toHost(g.cx, g.cy);
    g.item.style.setProperty(X, `${p.x - g.px0}px`);
    g.item.style.setProperty(Y, `${p.y - g.py0}px`);
    const to = hitSlot(g.rects, p.x, p.y);
    if (to < 0) return;
    if (to !== g.to) {
      g.to = to;
      const d = shiftDeltas(g.rects, g.origin, to);
      g.items.forEach((it, k) => {
        if (k === g.origin) return;
        if (d[k].dx || d[k].dy) {
          it.style.setProperty(X, `${d[k].dx}px`);
          it.style.setProperty(Y, `${d[k].dy}px`);
          g.touched.add(it);
        } else if (g.touched.has(it)) {
          clearPos(it);
          g.touched.delete(it);
        }
      });
      this._placePh(g.rects, g.origin, to);
    }
  }

  /** @private one animation frame of a drag: auto-scroll, then hit-test / preview */
  _frame() {
    const g = this._g;
    if (!g || g.mode !== 'dragging') return;
    g.raf = 0;
    const sc = g.scroller;
    const doc = this.host.ownerDocument;
    const page = sc === doc.scrollingElement || sc === doc.documentElement;
    const box = page
      ? { top: 0, left: 0, bottom: doc.defaultView.innerHeight, right: doc.defaultView.innerWidth }
      : sc.getBoundingClientRect();
    const vy = autoScrollSpeed(g.cy, box.top, box.bottom);
    const vx = autoScrollSpeed(g.cx, box.left, box.right);
    let scrolled = false;
    if (vy || vx) {
      const t0 = sc.scrollTop;
      const l0 = sc.scrollLeft;
      sc.scrollTop += vy;
      sc.scrollLeft += vx;
      scrolled = sc.scrollTop !== t0 || sc.scrollLeft !== l0;
    }
    this._update(g);
    if (scrolled) g.raf = requestAnimationFrame(() => this._frame());
  }

  /** @private */
  _pointerUp(e) {
    const g = this._g;
    if (!g || e.pointerId !== g.pointerId) return;
    if (g.mode === 'pending') {
      this._end(); // a click follows: lift
      return;
    }
    if (g.mode !== 'dragging') return;
    this._swallowClick();
    if (!this._reconciled(g)) return; // an outside change right before the drop: cancelled, nothing moved
    g.cx = e.clientX;
    g.cy = e.clientY;
    this._update(g);
    const from = g.origin;
    const to = g.to;
    const item = g.item;
    this._end();
    if (to < 0 || to === from || !this._enabled()) return;
    if (this._indexOf(item) !== from) return; // the DOM changed under the gesture
    this._safeMove(from, to);
    const now = this._indexOf(item);
    if (now === from) return;
    try { this.o.commit({ item, from, to: now, source: 'pointer' }); } catch (err) { console.error(err); }
    this._announce('dropped', item, now);
  }
}
