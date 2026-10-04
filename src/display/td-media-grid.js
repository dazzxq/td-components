import { TdBaseElement } from '../base/td-base-element.js';
import { createCheckMark } from '../utils/check-mark.js';
import { hasActiveAbove } from '../utils/layers.js';
import { packRows, rowStyles, parseAr } from '../utils/justified.js';

const ITEM = '[data-td-media-item]';
const OPEN = '[data-td-media-open]';
const SITE_TICK = '[data-td-media-tick]';
const TICK = `${SITE_TICK}, .td-media-grid__tick`;
/** per-item custom properties of the justified layout (grid-owned, no site snapshot) */
const ROW_VARS = ['--td-mg-w', '--td-mg-sub', '--td-mg-k'];
/** non-item children allowed next to the items in a row container */
const INERT_CHILD = 'template, script, [hidden], .td-sr-only';

/**
 * Media grid with selection (v0.23.0) — ENHANCES site / PHP markup in place, never renders the cells (no innerHTML).
 * Styles: src/styles/components/media-grid.css (block `.td-media-grid`). Content layer → solid surfaces, no glass.
 *
 * Markup contract (site prints it; the element adds what is marked "JS"):
 *   <td-media-grid label="Khung hình cuộn 12"            → JS: class="td-media-grid" role="list" aria-label="…"
 *                                                             [data-selecting] while the selection is not empty
 *     <div data-td-media-item data-id="f1">              → JS: class="td-media-grid__item" role="listitem" [data-selected]
 *       <button type="button" data-td-media-open aria-label="Khung 1"><img src="…" alt=""></button>
 *                                                        → JS: class="td-media-grid__open" (or <a href>)
 *       <button type="button" class="td-media-grid__tick" tabindex="-1" aria-pressed="false" aria-label="Chọn Khung 1">
 *         <span class="td-check td-check--lg td-check--on-media" aria-hidden="true"><svg …></span></button>
 *                                                          (v0.36.0: the shared tick mark, check.css)   → JS, right after the opener (sibling,
 *                                                          never inside an <a>); a site `[data-td-media-tick]` is kept
 *       <!-- site controls (⋯ TdMenu, badge…) are left alone -->
 *     </div>
 *     <span class="td-sr-only" aria-live="polite"></span>   → JS (announces "Đã chọn {n}" / "Tối đa {max} mục")
 *   </td-media-grid>
 * Items may be nested in site wrappers (strips); an item needs a non-empty, unique `data-id` (the first one wins).
 * Items added / removed later are picked up by a MutationObserver (batched per microtask); a removed selected item
 * leaves the selection (`select-change`).
 *
 * select-mode="tick" (v0.33): a plain opener click ALWAYS fires `activate` (selecting or not); the selection changes
 * only via the tick, Space, Ctrl/Cmd+click (flip) and Shift+click / Shift+Space (range). Tick corner: token
 * `--td-media-grid-tick-inline: start | end` (read once per frame → host [data-td-tick="end"]).
 * Default behaviour: nothing selected → opener click = `activate` (cancelable: preventDefault() blocks the opener default,
 * e.g. a link or TdLightbox.bind()), tick click = select. Selecting → opener / tick click flips the item (no
 * activate; the opener default is blocked). Shift + click: range in DOM order from the anchor (adds only; no anchor
 * → single flip). Keyboard on the opener only: Space flips (Shift+Space = range), Enter = `activate` (always, the
 * selection is not changed). Escape clears unless an overlay layer is open (layers.js) or an IME is composing.
 *
 * @element td-media-grid
 * @attr {string} label - Accessible name of the list (aria-label).
 * @attr {number} max - Optional cap (integer ≥ 1) on user selection; past it → `select-limit`.
 * @attr {string} select-mode - `tick`: opener click always activates; select via tick / Space / Ctrl·Cmd+click / Shift.
 * @attr {boolean} disabled - No selecting / flipping by the user (activate still works; the selection is kept).
 *
 * @fires select-change - User changed the selection. detail: { ids: string[] (DOM order), added, removed }
 * @fires activate - Opener clicked (nothing selected) or Enter. Cancelable. detail: { id, item, event }
 * @fires select-limit - A user add would pass `max`. detail: { max }
 *
 * @property {string[]} selectedIds - Selected ids in DOM order (read only).
 * @property {HTMLElement[]} items - Upgraded items in DOM order (read only).
 * @property {Function} onSelectChange - Hook receiving ids, runs before `select-change` (a throw is logged).
 */
export class TdMediaGrid extends TdBaseElement {
  /** Default texts (Vietnamese); override per site: `TdMediaGrid.labels.select = 'Select {name}'`. */
  static labels = {
    select: 'Chọn {name}',
    count: 'Đã chọn {n}',
    limit: 'Tối đa {max} mục',
  };

  static get observedAttributes() {
    return ['label', 'max', 'disabled', 'layout'];
  }

  static get booleanAttributes() {
    return ['disabled'];
  }

  constructor() {
    super();
    /** @type {Set<string>} */
    this._selected = new Set();
    /** @type {string|null} */
    this._anchor = null;
    this._onSelectChange = null;
    this._mo = null;
    this._live = null;
    this._docKey = null;
    this._passClick = false;
    this._syncQueued = false;
    this._ownLabel = false;
    this._raf = 0;
    this._ro = null;
    /** layout applied by the last write phase: 'justified' | 'default' | null (never written) */
    this._mode = null;
    this._dirty = true;
    this._rowKey = '';
    this._warned = false;
    /** @type {WeakMap<HTMLElement, Map<string, { value: string, priority: string }>>} site inline values, first write */
    this._snap = new WeakMap();
    /** @type {Set<HTMLElement>} elements carrying a snapshot (WeakMap is not iterable) */
    this._owned = new Set();
    /** @type {Set<HTMLElement>} items carrying the justified row vars */
    this._varItems = new Set();
  }

  get onSelectChange() { return this._onSelectChange; }
  set onSelectChange(fn) { this._onSelectChange = typeof fn === 'function' ? fn : null; }

  /** @returns {HTMLElement[]} items with a usable data-id, DOM order, first of a duplicate id wins */
  get items() {
    const seen = new Set();
    const out = [];
    for (const el of this.querySelectorAll(ITEM)) {
      if (el.closest('td-media-grid') !== this) continue; // a nested grid owns its own items
      const id = el.getAttribute('data-id');
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(/** @type {HTMLElement} */ (el));
    }
    return out;
  }

  /** @returns {string[]} */
  get selectedIds() {
    return this.items.map((el) => el.getAttribute('data-id')).filter((id) => this._selected.has(id));
  }

  // --- lifecycle (in place: never re-renders the children) ---

  attributeChangedCallback(name, oldVal, newVal) {
    if (oldVal === newVal || !this._initialized) return;
    if (name === 'layout') {
      if (this.isConnected) this._schedule(true);
      return;
    }
    this._syncAttrs();
  }

  /**
   * Called by TdBaseElement on the first connect and on every re-connect (after disconnect ran the cleanups):
   * upgrade the items in place and (re)bind the listeners + observer.
   * @private
   */
  _doRender() {
    if (this._suppressRender) return;
    this.classList.add('td-media-grid');
    this.setAttribute('role', 'list');
    this._syncAttrs();
    this._sync(true);

    this.listen(this, 'click', (e) => this._onClick(e), true);
    this.listen(this, 'keydown', (e) => this._onKeydown(e));
    this.listen(this, 'keyup', (e) => this._onKeyup(e));
    if (typeof MutationObserver === 'function') {
      this._mo = new MutationObserver((records) => {
        if (records.every((r) => this._live && (r.target === this._live || this._live.contains(r.target)))) return;
        this._queueSync();
      });
      // data-id changes too: the selection is reconciled (an id that no longer exists leaves it)
      this._mo.observe(this, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-id', 'data-td-ar'] });
      this._cleanups.push(() => { this._mo?.disconnect(); this._mo = null; });
    }
    this._cleanups.push(() => this._setDocKey(false));
    this._setDocKey(this._selected.size > 0);

    // token reads (tick corner…) happen in one rAF read phase; a resize may cross a breakpoint that changes them
    if (typeof ResizeObserver === 'function') {
      this._ro = new ResizeObserver(() => this._schedule());
      this._ro.observe(this);
      this._cleanups.push(() => { this._ro?.disconnect(); this._ro = null; });
    }
    // an image of unknown ratio finished loading → its ratio is known now (load does not bubble: capture)
    this.listen(this, 'load', (e) => this._onMediaLoad(e), true);
    this.listen(this, 'loadedmetadata', (e) => this._onMediaLoad(e), true);
    this._cleanups.push(() => {
      if (this._raf) cancelAnimationFrame(this._raf);
      this._raf = 0;
      this._release();
    });
    this._dirty = true;
    this._frame();
  }

  /** @private batch the next read + write phase into one animation frame; `dirty` = items / ratios / layout changed */
  _schedule(dirty = false) {
    if (dirty) this._dirty = true;
    if (this._raf || typeof requestAnimationFrame !== 'function') return;
    this._raf = requestAnimationFrame(() => {
      this._raf = 0;
      if (this.isConnected) this._frame();
    });
  }

  /**
   * One read phase (computed style of the host / row container + attributes / natural sizes — no per-item layout
   * reads), then one write phase. Justified rows are rebuilt only when the items / ratios / layout changed (dirty) or
   * the Σ target / gap read now differ from the last build; a plain resize only re-reads (widths are percentages).
   * @private
   */
  _frame() {
    if (typeof getComputedStyle !== 'function') return;
    // --- read ---
    const cs = getComputedStyle(this);
    const tick = cs.getPropertyValue('--td-media-grid-tick-inline').trim() === 'end' ? 'end' : null;
    const items = this.items;
    const wantJustified = this.getAttribute('layout') === 'justified';
    let box = null;
    let plan = null;
    if (wantJustified) {
      box = this._rowBox(items);
      if (!box && !this._warned) {
        this._warned = true;
        console.warn('td-media-grid: layout="justified" needs the items as direct children of the grid or of ONE '
          + 'direct-child <td-sortable>; using the default layout.');
      }
    }
    const mode = box ? 'justified' : 'default';
    if (box) {
      // v0.34.0: Σ follows the grid's width (container query on the items, components/media-grid.css)
      const sigma = items.length ? getComputedStyle(items[0]).getPropertyValue('--_td-mg-sigma') : '';
      const target = Number.parseFloat(sigma || cs.getPropertyValue('--td-media-grid-row-ratio'));
      const t = Number.isFinite(target) && target > 0 ? target : 5.5;
      const gap = Number.parseFloat(getComputedStyle(box).columnGap);
      const g = Number.isFinite(gap) && gap > 0 ? gap : 0;
      const key = `${t}|${g}`;
      if (this._dirty || this._mode !== 'justified' || key !== this._rowKey) {
        const fb = parseAr(cs.getPropertyValue('--td-media-grid-fallback-ar'));
        const fallback = Number.isFinite(fb) ? fb : 1.5;
        plan = { key, t, g, ars: items.map((it) => this._arOf(it, fallback)) };
      }
    }
    // --- write ---
    this._dirty = false;
    if (tick) {
      if (this.getAttribute('data-td-tick') !== tick) this.setAttribute('data-td-tick', tick);
    } else if (this.hasAttribute('data-td-tick')) {
      this.removeAttribute('data-td-tick');
    }
    const flag = wantJustified ? mode : null;
    if (flag) {
      if (this.getAttribute('data-td-layout') !== flag) this.setAttribute('data-td-layout', flag);
    } else if (this.hasAttribute('data-td-layout')) {
      this.removeAttribute('data-td-layout');
    }
    this._mode = mode;
    if (plan) {
      this._rowKey = plan.key;
      this._relayout(items, plan.ars, plan.t, plan.g);
    } else if (mode !== 'justified') {
      this._rowKey = '';
      for (const it of [...this._varItems]) this._clearRowVars(it);
    }
    for (const it of items) this._size(it);
  }

  /**
   * The justified row container: the grid itself (items are its direct children) or ONE direct-child <td-sortable>
   * holding the items. Anything else → null (default layout).
   * @private
   */
  _rowBox(items) {
    const kids = [...this.children].filter((el) => el !== this._live && !el.matches(INERT_CHILD));
    const set = new Set(items);
    if (kids.every((el) => set.has(el))) return this;
    if (kids.length === 1 && kids[0].localName === 'td-sortable') {
      const s = kids[0];
      const inner = [...s.children].filter((el) => !el.matches(INERT_CHILD));
      if (items.every((it) => it.parentElement === s) && inner.every((el) => set.has(el))) return s;
    }
    return null;
  }

  /**
   * Aspect ratio of an item: data-td-ar > <img> width / height attributes > natural size once loaded > fallback.
   * @private
   */
  _arOf(item, fallback) {
    const own = parseAr(item.getAttribute('data-td-ar'));
    if (Number.isFinite(own)) return own;
    const m = this._mediaOf(item);
    if (m) {
      const w = Number(m.getAttribute('width'));
      const h = Number(m.getAttribute('height'));
      if (w > 0 && h > 0) return w / h;
      if (m.localName === 'img' && m.naturalWidth > 0 && m.naturalHeight > 0) return m.naturalWidth / m.naturalHeight;
      if (m.localName === 'video' && m.videoWidth > 0 && m.videoHeight > 0) return m.videoWidth / m.videoHeight;
    }
    return fallback;
  }

  /** @private true when the ratio of `item` comes from its loaded media (no data-td-ar, no width / height) */
  _arFromLoad(item, m) {
    if (Number.isFinite(parseAr(item.getAttribute('data-td-ar')))) return false;
    return !(Number(m.getAttribute('width')) > 0 && Number(m.getAttribute('height')) > 0);
  }

  /** @private */
  _onMediaLoad(e) {
    if (this.getAttribute('layout') !== 'justified') return;
    const m = e.target;
    const item = m instanceof Element ? this._itemFrom(m) : null;
    if (!item || this._mediaOf(item) !== m || !this._arFromLoad(item, m)) return;
    this._schedule(true);
  }

  /**
   * Write the row vars (only values that changed). Tests spy on this method to count rebuilds.
   * @private
   */
  _relayout(items, ars, target, gap) {
    const rows = rowStyles(packRows(ars, target), target, gap);
    let i = 0;
    for (const row of rows) {
      for (const c of row.cells) {
        const it = items[i++];
        this._setVar(it, '--td-mg-w', String(c.w));
        this._setVar(it, '--td-mg-sub', String(c.sub));
        this._setVar(it, '--td-mg-k', String(row.k));
        this._varItems.add(it);
      }
    }
    // items that are no longer laid out (left the grid) lose their vars
    const now = new Set(items);
    for (const it of [...this._varItems]) if (!now.has(it)) this._clearRowVars(it);
  }

  /** @private */
  _setVar(el, prop, value) {
    if (el.style.getPropertyValue(prop) !== value) el.style.setProperty(prop, value);
  }

  /** @private */
  _clearRowVars(item) {
    for (const p of ROW_VARS) item.style.removeProperty(p);
    this._varItems.delete(item);
  }

  /** @private first <img> / <video> of the opener (a <picture> img included) */
  _mediaOf(item) {
    const open = this._openOf(item);
    return open ? /** @type {HTMLElement|null} */ (open.querySelector('img, video')) : null;
  }

  /**
   * Kit-owned tile sizing (decision 37): inline + !important via CSSOM, so no site author CSS (layered or not,
   * !important or not) can resize the image inside the opener. Writes only, no reads of layout.
   * @private
   */
  _size(item) {
    const open = this._openOf(item);
    if (!open) return;
    const justified = this._mode === 'justified';
    this._hold(open, 'width', '100%');
    this._hold(open, 'height', justified ? '100%' : 'auto');
    this._hold(open, 'aspect-ratio', justified ? 'auto' : 'var(--td-media-grid-ratio, auto)');
    const m = this._mediaOf(item);
    if (!m) return;
    this._hold(m, 'width', '100%');
    this._hold(m, 'height', '100%');
    this._hold(m, 'max-width', 'none');
    this._hold(m, 'object-fit', 'var(--td-media-grid-fit, cover)');
  }

  /**
   * Set an owned property (inline, !important). The FIRST write per element + property snapshots the site's inline
   * value + priority; later writes never re-snapshot, so the snapshot is always the site's.
   * @private
   */
  _hold(el, prop, value) {
    let snap = this._snap.get(el);
    if (!snap) {
      snap = new Map();
      this._snap.set(el, snap);
      this._owned.add(el);
    }
    if (!snap.has(prop)) {
      snap.set(prop, { value: el.style.getPropertyValue(prop), priority: el.style.getPropertyPriority(prop) });
    }
    if (el.style.getPropertyValue(prop) !== value || el.style.getPropertyPriority(prop) !== 'important') {
      el.style.setProperty(prop, value, 'important');
    }
  }

  /** @private put the site's inline values back (empty original → removed) and forget the snapshot */
  _restore(el) {
    const snap = this._snap.get(el);
    if (snap) {
      for (const [prop, { value, priority }] of snap) {
        if (value === '') el.style.removeProperty(prop);
        else el.style.setProperty(prop, value, priority);
      }
    }
    this._snap.delete(el);
    this._owned.delete(el);
  }

  /**
   * Restore owned elements that left the grid (item removed, opener / media replaced) and drop row vars of items that
   * left. Runs on every sync (after a mutation).
   * @private
   */
  _prune(items) {
    const now = new Set(items);
    const keep = new Set();
    for (const it of items) {
      const open = this._openOf(it);
      if (open) keep.add(open);
      const m = this._mediaOf(it);
      if (m) keep.add(m);
    }
    for (const el of [...this._owned]) if (!keep.has(el)) this._restore(el);
    for (const it of [...this._varItems]) if (!now.has(it)) this._clearRowVars(it);
  }

  /** @private disconnect: give everything back (snapshots, row vars, host flags) */
  _release() {
    for (const el of [...this._owned]) this._restore(el);
    for (const it of [...this._varItems]) this._clearRowVars(it);
    this.removeAttribute('data-td-layout');
    this.removeAttribute('data-td-tick');
    this._mode = null;
    this._rowKey = '';
  }

  /** @private label / disabled → host + ticks (incremental, no re-render) */
  _syncAttrs() {
    const label = this.getAttribute('label');
    if (label != null && label !== '') {
      this.setAttribute('aria-label', label);
      this._ownLabel = true;
    } else if (this._ownLabel) {
      this.removeAttribute('aria-label');
      this._ownLabel = false;
    }
    const disabled = this.hasAttribute('disabled');
    for (const item of this.items) {
      const t = this._tickOf(item);
      if (t && 'disabled' in t) t.disabled = disabled;
    }
  }

  /** @private */
  _max() {
    const n = Number(this.getAttribute('max'));
    return Number.isInteger(n) && n >= 1 ? n : Infinity;
  }

  /** @private */
  _queueSync() {
    if (this._syncQueued) return;
    this._syncQueued = true;
    queueMicrotask(() => {
      this._syncQueued = false;
      if (this.isConnected) this._sync(false);
    });
  }

  /**
   * Upgrade every item (idempotent) and drop ids that are gone from the selection.
   * @param {boolean} initial true on connect (a prune then is silent: the page changed while detached)
   * @private
   */
  _sync(initial) {
    this._ensureLiveRegion();
    const items = this.items;
    const present = new Set();
    for (const item of items) {
      present.add(item.getAttribute('data-id'));
      this._upgrade(item);
    }
    const removed = [...this._selected].filter((id) => !present.has(id));
    for (const id of removed) this._selected.delete(id);
    if (this._anchor != null && !present.has(this._anchor)) this._anchor = null;
    this._paint(items);
    this._prune(items);
    if (!initial && this._mode) {
      for (const item of items) this._size(item); // new items are sized at once (writes only), rows in the next rAF
      this._schedule(true);
    }
    if (removed.length && !initial) this._changed([], removed, true);
  }

  /**
   * One polite live region, last child of the host — recreated / re-attached when the site replaced the children
   * (pagination via innerHTML).
   * @private
   */
  _ensureLiveRegion() {
    if (this._live && this._live.parentNode === this) return;
    this._live = this._live || document.createElement('span');
    this._live.className = 'td-sr-only';
    this._live.setAttribute('aria-live', 'polite');
    this.appendChild(this._live);
  }

  /** @private */
  _upgrade(item) {
    item.classList.add('td-media-grid__item');
    item.setAttribute('role', 'listitem');
    const open = this._openOf(item);
    if (open) open.classList.add('td-media-grid__open');
    let t = this._tickOf(item);
    if (!t) {
      t = document.createElement('button');
      t.type = 'button';
      t.className = 'td-media-grid__tick td-media-grid__tick--mark';
      t.setAttribute('tabindex', '-1');
      t.appendChild(createCheckMark('lg', { onMedia: true })); // v0.36.0: the shared td-checkbox look (ADR 0017)
      t.setAttribute('aria-label', String(TdMediaGrid.labels.select ?? '').replace('{name}', this._nameOf(item, open)));
      if (open && open.parentNode) open.after(t);
      else item.appendChild(t);
    } else {
      t.classList.add('td-media-grid__tick');
    }
    if ('disabled' in t) t.disabled = this.hasAttribute('disabled');
  }

  /** @private accessible name of an item: opener aria-label → img alt → data-id (text only, set via setAttribute) */
  _nameOf(item, open) {
    const aria = open?.getAttribute('aria-label')?.trim();
    if (aria) return aria;
    const alt = (open || item).querySelector('img[alt]')?.getAttribute('alt')?.trim();
    if (alt) return alt;
    return item.getAttribute('data-id') || '';
  }

  /** @private first element of `sel` inside `item` that belongs to it (not to a nested item) */
  _own(item, sel) {
    for (const el of item.querySelectorAll(sel)) if (el.closest(ITEM) === item) return /** @type {HTMLElement} */ (el);
    return null;
  }

  /** @private */
  _openOf(item) { return this._own(item, OPEN); }

  /** @private */
  _tickOf(item) { return this._own(item, TICK); }

  /** @private reflect the selection on the DOM */
  _paint(items = this.items) {
    // Owned items that are no longer valid (data-id removed / emptied / a losing duplicate) drop any stale state.
    const valid = new Set(items);
    for (const el of this.querySelectorAll(ITEM)) {
      if (valid.has(el) || el.closest('td-media-grid') !== this) continue;
      el.removeAttribute('data-selected');
      this._tickOf(/** @type {HTMLElement} */ (el))?.setAttribute('aria-pressed', 'false');
    }
    for (const item of items) {
      const on = this._selected.has(item.getAttribute('data-id'));
      item.toggleAttribute('data-selected', on);
      this._tickOf(item)?.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    this.toggleAttribute('data-selecting', this._selected.size > 0);
    if (this.isConnected) this._setDocKey(this._selected.size > 0);
  }

  // --- events ---

  /** @private the grid item (with a usable id) that contains `node` */
  _itemFrom(node) {
    const el = node instanceof Element ? node.closest(ITEM) : null;
    if (!el || el.closest('td-media-grid') !== this) return null;
    return this.items.includes(/** @type {HTMLElement} */ (el)) ? /** @type {HTMLElement} */ (el) : null;
  }

  /** @private capture phase: runs before site / TdLightbox.bind() handlers */
  _onClick(e) {
    if (this._passClick) return; // our own replay of an Enter activation
    const item = this._itemFrom(e.target);
    if (!item) return;
    const target = /** @type {Element} */ (e.target);
    const tick = this._tickOf(item);
    const open = this._openOf(item);
    const onTick = !!tick && tick.contains(target);
    const onOpen = !onTick && !!open && open.contains(target);
    if (!onTick && !onOpen) return; // site controls in the item (⋯, links…) handle themselves
    if (e.button !== 0) return;
    const disabled = this.hasAttribute('disabled');
    if (onTick) {
      e.preventDefault();
      e.stopPropagation();
      if (!disabled) this._userFlip(item, e.shiftKey);
      return;
    }
    // select-mode="tick": a plain opener click ALWAYS activates; only Ctrl/Cmd+click (flip) and Shift+click (range)
    // change the selection from the opener. Default mode: selecting (or Shift) → the opener flips.
    const flip = this._tickMode()
      ? (e.shiftKey || e.ctrlKey || e.metaKey)
      : (this._selected.size > 0 || e.shiftKey);
    if (!disabled && flip) {
      e.preventDefault();
      e.stopPropagation();
      this._userFlip(item, e.shiftKey);
      return;
    }
    if (!this._activate(item, e)) e.preventDefault();
  }

  /** @private select-mode="tick" (opener click = activate; select via tick / Space / Ctrl·Cmd+click / Shift range) */
  _tickMode() { return this.getAttribute('select-mode') === 'tick'; }

  /** @private focused opener of this grid for a key event, else null */
  _openFromKey(e) {
    const item = this._itemFrom(e.target);
    if (!item) return null;
    const open = this._openOf(item);
    return open && open.contains(/** @type {Node} */ (e.target)) ? { item, open } : null;
  }

  /** @private */
  _onKeydown(e) {
    if (e.defaultPrevented || e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key !== ' ' && e.key !== 'Enter') return;
    const hit = this._openFromKey(e);
    if (!hit) return;
    e.preventDefault(); // Space: no page scroll / native click; Enter: we replay the click below
    if (e.key === ' ') {
      if (!e.repeat && !this.hasAttribute('disabled')) this._userFlip(hit.item, e.shiftKey);
      return;
    }
    if (!this._activate(hit.item, e)) return;
    // not prevented → run the opener's own default (link, TdLightbox.bind(), site click handler) exactly once
    this._passClick = true;
    try { hit.open.click(); } finally { this._passClick = false; }
  }

  /** @private a button activates on Space keyup — keep that from turning into a click */
  _onKeyup(e) {
    if (e.key === ' ' && this._openFromKey(e)) e.preventDefault();
  }

  /** @private */
  _setDocKey(on) {
    if (typeof document === 'undefined') return;
    if (on && !this._docKey) {
      this._docKey = (e) => this._onDocKeydown(e);
      document.addEventListener('keydown', this._docKey, true);
    } else if (!on && this._docKey) {
      document.removeEventListener('keydown', this._docKey, true);
      this._docKey = null;
    }
  }

  /** @private Escape clears the selection, unless an overlay layer is open or an IME is composing */
  _onDocKeydown(e) {
    if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing || e.keyCode === 229) return;
    // defaultPrevented: a layer registered earlier already consumed this Escape (and may have unregistered itself)
    if (!this._selected.size || this.hasAttribute('disabled') || hasActiveAbove(0)) return;
    this._commit(new Set(), true);
    this._anchor = null;
  }

  /** @private @returns {boolean} false when the activate event was prevented */
  _activate(item, event) {
    return this.dispatchEvent(new CustomEvent('activate', {
      bubbles: true,
      composed: true,
      cancelable: true,
      detail: { id: item.getAttribute('data-id'), item, event },
    }));
  }

  // --- selection ---

  /** @private user flip / Shift range (disabled already checked) */
  _userFlip(item, shift) {
    const items = this.items;
    const ids = items.map((el) => el.getAttribute('data-id'));
    const id = item.getAttribute('data-id');
    const max = this._max();
    const next = new Set(this._selected);
    let limited = false;
    const from = this._anchor != null ? ids.indexOf(this._anchor) : -1;
    if (shift && from >= 0) {
      // range in DOM order from the anchor towards the item (adds only; fills up to the cap), anchor kept
      const to = ids.indexOf(id);
      const step = to >= from ? 1 : -1;
      for (let i = from; ; i += step) {
        if (!next.has(ids[i])) {
          if (next.size >= max) { limited = true; break; }
          next.add(ids[i]);
        }
        if (i === to) break;
      }
    } else if (next.has(id)) {
      next.delete(id);
      this._anchor = next.size ? id : null;
    } else if (next.size >= max) {
      limited = true;
    } else {
      next.add(id);
      this._anchor = id;
    }
    this._commit(next, true);
    if (limited) {
      this.emit('select-limit', { max });
      this._announce(String(TdMediaGrid.labels.limit ?? '').replace('{max}', String(max)));
    }
  }

  /**
   * Apply a new selection set.
   * @private
   * @param {Set<string>} next
   * @param {boolean} emit user action (or `{ emit: true }`) → hook + select-change + announcement
   */
  _commit(next, emit) {
    const added = [...next].filter((id) => !this._selected.has(id));
    const removed = [...this._selected].filter((id) => !next.has(id));
    if (!added.length && !removed.length) return;
    this._selected = next;
    if (!next.size) this._anchor = null;
    this._paint();
    this._changed(added, removed, emit);
  }

  /** @private */
  _changed(added, removed, emit) {
    if (!emit) return;
    const order = this.items.map((el) => el.getAttribute('data-id'));
    const sort = (list) => list.slice().sort((a, b) => order.indexOf(a) - order.indexOf(b));
    const ids = this.selectedIds;
    if (this._onSelectChange) {
      try { this._onSelectChange(ids.slice()); } catch (err) { console.error(err); }
    }
    this.emit('select-change', { ids, added: sort(added), removed: removed.slice() });
    this._announce(String(TdMediaGrid.labels.count ?? '').replace('{n}', String(ids.length)));
  }

  /** @private one live-region update per action (the last message of the task wins) */
  _announce(text) {
    this._pendingAnnounce = text;
    if (this._announceQueued) return;
    this._announceQueued = true;
    queueMicrotask(() => {
      this._announceQueued = false;
      if (!this._live) return;
      // the same text again (e.g. a second limit attempt): clear first so the region mutates and is read again
      if (this._live.textContent === this._pendingAnnounce) this._live.textContent = '';
      this._live.textContent = this._pendingAnnounce;
    });
  }

  /** @private known ids from a list argument */
  _ids(list) {
    const known = new Set(this.items.map((el) => el.getAttribute('data-id')));
    const arr = list == null ? [] : (typeof list === 'string' ? [list] : [...list]);
    return arr.map(String).filter((id) => known.has(id));
  }

  /**
   * Add ids to the selection (unknown ids are ignored; the `max` cap applies). No event unless `{ emit: true }`.
   * @param {string|Iterable<string>} ids
   * @param {{ emit?: boolean }} [opts]
   */
  select(ids, opts = {}) {
    const next = new Set(this._selected);
    const max = this._max();
    const order = this.items.map((el) => el.getAttribute('data-id'));
    for (const id of this._ids(ids).sort((a, b) => order.indexOf(a) - order.indexOf(b))) {
      if (!next.has(id) && next.size < max) next.add(id);
    }
    this._commit(next, !!opts?.emit);
  }

  /**
   * Remove ids from the selection. No event unless `{ emit: true }`.
   * @param {string|Iterable<string>} ids
   * @param {{ emit?: boolean }} [opts]
   */
  deselect(ids, opts = {}) {
    const next = new Set(this._selected);
    for (const id of (ids == null ? [] : (typeof ids === 'string' ? [ids] : [...ids]))) next.delete(String(id));
    this._commit(next, !!opts?.emit);
  }

  /**
   * Flip one id. No event unless `{ emit: true }`.
   * @param {string} id
   * @param {{ emit?: boolean }} [opts]
   */
  toggle(id, opts = {}) {
    if (this._selected.has(String(id))) this.deselect([id], opts);
    else this.select([id], opts);
  }

  /** Select every item (up to `max`). No event unless `{ emit: true }`. @param {{ emit?: boolean }} [opts] */
  selectAll(opts = {}) {
    this.select(this.items.map((el) => el.getAttribute('data-id')), opts);
  }

  /** Clear the selection. No event unless `{ emit: true }`. @param {{ emit?: boolean }} [opts] */
  clear(opts = {}) {
    this._commit(new Set(), !!opts?.emit);
    this._anchor = null;
  }
}

if (!customElements.get('td-media-grid')) {
  customElements.define('td-media-grid', TdMediaGrid);
}
