import { TdBaseElement } from '../base/td-base-element.js';
import { tdIcon } from '../icons/td-icon.js';
import { hasActiveAbove } from '../utils/layers.js';

const ITEM = '[data-td-media-item]';
const OPEN = '[data-td-media-open]';
const SITE_TICK = '[data-td-media-tick]';
const TICK = `${SITE_TICK}, .td-media-grid__tick`;

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
 *         <svg class="td-icon td-icon--s" data-icon="check" …></svg></button>   → JS, right after the opener (sibling,
 *                                                          never inside an <a>); a site `[data-td-media-tick]` is kept
 *       <!-- site controls (⋯ TdMenu, badge…) are left alone -->
 *     </div>
 *     <span class="td-sr-only" aria-live="polite"></span>   → JS (announces "Đã chọn {n}" / "Tối đa {max} mục")
 *   </td-media-grid>
 * Items may be nested in site wrappers (strips); an item needs a non-empty, unique `data-id` (the first one wins).
 * Items added / removed later are picked up by a MutationObserver (batched per microtask); a removed selected item
 * leaves the selection (`select-change`).
 *
 * Behaviour: nothing selected → opener click = `activate` (cancelable: preventDefault() blocks the opener default,
 * e.g. a link or TdLightbox.bind()), tick click = select. Selecting → opener / tick click flips the item (no
 * activate; the opener default is blocked). Shift + click: range in DOM order from the anchor (adds only; no anchor
 * → single flip). Keyboard on the opener only: Space flips (Shift+Space = range), Enter = `activate` (always, the
 * selection is not changed). Escape clears unless an overlay layer is open (layers.js) or an IME is composing.
 *
 * @element td-media-grid
 * @attr {string} label - Accessible name of the list (aria-label).
 * @attr {number} max - Optional cap (integer ≥ 1) on user selection; past it → `select-limit`.
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
    return ['label', 'max', 'disabled'];
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
      this._mo.observe(this, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-id'] });
      this._cleanups.push(() => { this._mo?.disconnect(); this._mo = null; });
    }
    this._cleanups.push(() => this._setDocKey(false));
    this._setDocKey(this._selected.size > 0);
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
      t.className = 'td-media-grid__tick';
      t.setAttribute('tabindex', '-1');
      const svg = tdIcon('check', { size: 's' });
      if (svg) t.appendChild(svg);
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
    if (!disabled && (this._selected.size > 0 || e.shiftKey)) {
      e.preventDefault();
      e.stopPropagation();
      this._userFlip(item, e.shiftKey);
      return;
    }
    if (!this._activate(item, e)) e.preventDefault();
  }

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
