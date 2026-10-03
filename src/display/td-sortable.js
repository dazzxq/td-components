import { TdBaseElement } from '../base/td-base-element.js';
import { tdIcon } from '../icons/td-icon.js';
import { OrderedCollectionModel } from '../utils/ordered-collection.js';
import { SortableController, SORTABLE_LABELS, defaultItemName, formatLabel } from '../utils/sortable-controller.js';

const ITEM = 'data-td-sort-item';
const HANDLE = '[data-td-sort-handle]';

let _uid = 0;

/**
 * <td-sortable> — reorder the app's own items by drag (from a handle) AND keyboard (Space / Enter lifts, arrows move,
 * Space / Enter drops, Escape cancels), announced to screen readers; lists and grids alike (v0.31.0, plan
 * docs/internal/plans/v0.31.0-sortable-masked.md M3). Styles: src/styles/components/sortable.css. Upgrades the app markup
 * IN PLACE (like td-media-grid / td-repeater — `_doRender()` override, never `innerHTML`). Saving the order is the app's
 * job: the element only fires `order-change` on a drop.
 *
 * Markup contract:
 *   <td-sortable label="Section trang chủ" [disabled]>
 *     <div data-td-sort-item data-id="hero" [data-td-sort-label="Banner đầu trang"]>
 *       [<span data-td-sort-handle></span> | <button type="button" data-td-sort-handle>…</button>]   ← optional
 *       …app content (may hold fields)…
 *     </div>
 *   </td-sortable>
 *
 * - Items = DIRECT children with `data-td-sort-item`, each with a non-empty, unique `data-id`. One missing / duplicate
 *   id → sorting is off for the whole host (handles `aria-disabled`, one warning) — a partial order is never emitted.
 *   Re-checked when a direct child's `data-id` / `data-td-sort-item` changes, right before a lift / drag and right
 *   before the event.
 * - JS adds: host `role="list"` (an app role is kept, e.g. `role="none"` inside td-media-grid) + `aria-label`; items
 *   `role="listitem"` (kept when set); per item a handle `button.td-sortable__handle` (`aria-label` "Sắp xếp {name}",
 *   `aria-describedby` = the hidden help text): an app `<button data-td-sort-handle>` is upgraded, another
 *   `[data-td-sort-handle]` element receives the kit button inside it, else the button becomes the item's first child.
 *   `span.td-sr-only[role=status]` + `span[hidden]` help are appended to the host (never items).
 * - The DOM is really reordered (reading, Tab and form order follow the visual order), by moving the NEIGHBOURS — the
 *   moved item stays attached (focus kept, its td-* are not re-connected).
 * - Outside changes (MutationObserver): the DOM is the source of truth — a running gesture is cancelled, new items
 *   upgraded; no event.
 *
 * @element td-sortable
 * @attr {string} label - accessible name of the list
 * @attr {boolean} disabled - handles `aria-disabled` (still focusable); a running gesture is cancelled
 * @fires order-change - on a drop that changed the order (never per keyboard step, never on cancel / API).
 *   detail: { order: string[], previous: string[], id, from, to, source: 'pointer'|'keyboard' }
 */
export class TdSortable extends TdBaseElement {
  /** Texts (Vietnamese), shared with td-repeater[sortable]; override per site: `TdSortable.labels.item = 'Item {n}'`. */
  static labels = SORTABLE_LABELS;

  static get observedAttributes() { return ['label', 'disabled']; }

  static get booleanAttributes() { return ['disabled']; }

  constructor() {
    super();
    this._uid = ++_uid;
    this._model = new OrderedCollectionModel({ warn: () => {} });
    this._ctl = null;
    this._mo = null;
    this._live = null;
    this._help = null;
    this._valid = true;
    this._ownLabel = false;
    /** @type {WeakSet<Element>} handles whose aria-label the kit owns */
    this._ownName = new WeakSet();
    this._warned = new Set();
    this._started = false;
  }

  // --- public API ---

  /** @returns {string[]} the item ids in DOM order */
  get order() {
    return this._domItems().map((it) => it.getAttribute('data-id'));
  }

  /**
   * Reorder to `ids` (a permutation of the current ids). No event. A running gesture is cancelled first.
   * @param {string[]} ids
   * @returns {boolean} false (+ one warning) when `ids` is not exactly the current ids
   */
  setOrder(ids) {
    this._flush();
    const items = this._domItems();
    const byId = new Map(items.map((it) => [it.getAttribute('data-id'), it]));
    const ok = Array.isArray(ids) && this._valid && ids.length === items.length && byId.size === items.length
      && new Set(ids).size === ids.length && ids.every((id) => typeof id === 'string' && byId.has(id));
    if (!ok) {
      console.warn('td-sortable: setOrder() needs a permutation of the current item ids — refused.', this);
      return false;
    }
    this._ctl?.cancel('api');
    this._model.reset(this._domItems());
    ids.forEach((id, i) => {
      const j = this._model.indexOf(byId.get(id));
      if (j !== i) this._moveItem(j, i);
    });
    this._paint();
    return true;
  }

  /** Cancel a running drag / lift (a lift goes back to where it started). */
  cancel() {
    this._ctl?.cancel('api');
  }

  // --- lifecycle (in place) ---

  attributeChangedCallback(name, oldVal, newVal) {
    if (oldVal === newVal || !this._initialized || !this._started) return;
    if (name === 'label') this._syncLabel();
    else if (name === 'disabled') {
      if (this.hasAttribute('disabled')) this._ctl?.cancel('disabled');
      this._paint();
    }
  }

  /** @private first connect and every re-connect (disconnect ran the cleanups) */
  _doRender() {
    if (this._suppressRender) return;
    this._started = true;
    if (!this.hasAttribute('role')) this.setAttribute('role', 'list');
    this._syncLabel();
    this._ensureAux();
    this._model.reset(this._domItems());
    this._validate();
    this._paint();
    this._ctl = new SortableController(this, {
      items: () => this._model.keys(),
      handleOf: (it) => this._handleOf(it),
      move: (from, to) => this._moveItem(from, to),
      commit: (d) => this._commit(d),
      nameOf: (it, i) => defaultItemName(it, i, TdSortable.labels),
      live: this._live,
      enabled: () => this._enabled(),
      labels: TdSortable.labels,
    });
    this._cleanups.push(() => { this._ctl?.destroy(); this._ctl = null; });
    if (typeof MutationObserver === 'function') {
      this._mo = new MutationObserver((records) => this._onMutations(records));
      this._mo.observe(this, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-id', ITEM] });
      this._cleanups.push(() => { this._mo?.disconnect(); this._mo = null; });
    }
  }

  // --- structure ---

  /** @private direct `[data-td-sort-item]` children, DOM order */
  _domItems() {
    return /** @type {HTMLElement[]} */ ([...this.children].filter((c) => c.hasAttribute(ITEM)));
  }

  /** @private */
  _syncLabel() {
    const label = this.getAttribute('label');
    if (label) {
      this.setAttribute('aria-label', label);
      this._ownLabel = true;
    } else if (this._ownLabel) {
      this.removeAttribute('aria-label');
      this._ownLabel = false;
    }
  }

  /** @private live region + hidden help text, direct children of the host (never items) */
  _ensureAux() {
    if (!this._help) {
      this._help = document.createElement('span');
      this._help.hidden = true;
      this._help.id = `td-sortable-${this._uid}-help`;
      this._live = document.createElement('span');
      this._live.className = 'td-sr-only';
      this._live.setAttribute('role', 'status');
    }
    this._help.textContent = String(TdSortable.labels.help ?? '');
    if (this._help.parentNode !== this) this.appendChild(this._help);
    if (this._live.parentNode !== this) this.appendChild(this._live);
  }

  /** @private keys valid = every item has a non-empty, unique data-id */
  _validate() {
    const seen = new Set();
    let ok = true;
    for (const it of this._domItems()) {
      const id = it.getAttribute('data-id');
      if (!id || seen.has(id)) { ok = false; break; }
      seen.add(id);
    }
    const changed = ok !== this._valid;
    this._valid = ok;
    if (!ok && !this._warned.has('keys')) {
      this._warned.add('keys');
      console.warn('td-sortable: every [data-td-sort-item] needs a non-empty, unique data-id — sorting is off.', this);
    }
    return changed;
  }

  /** @private */
  _enabled() {
    if (this.hasAttribute('disabled')) return false;
    this._validate();
    if (!this._valid) this._paint();
    return this._valid;
  }

  /** @private the item's handle button (owned by this item, not by a nested one) */
  _handleOf(it) {
    for (const el of it.querySelectorAll('.td-sortable__handle')) {
      if (el.closest(`[${ITEM}]`) === it) return /** @type {HTMLElement} */ (el);
    }
    return null;
  }

  /** @private upgrade one item (idempotent) */
  _upgrade(it) {
    if (!it.hasAttribute('role')) it.setAttribute('role', 'listitem');
    if (this._handleOf(it)) return;
    let slot = null;
    for (const el of it.querySelectorAll(HANDLE)) {
      if (el.closest(`[${ITEM}]`) === it) { slot = el; break; }
    }
    if (slot && slot.localName === 'button') {
      slot.classList.add('td-sortable__handle');
      if (!slot.hasAttribute('type')) slot.setAttribute('type', 'button');
      if (!slot.hasAttribute('aria-label')) this._ownName.add(slot);
      return;
    }
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'td-sortable__handle';
    const svg = tdIcon('grip', { size: 's' });
    if (svg) b.appendChild(svg);
    this._ownName.add(b);
    if (slot) slot.appendChild(b);
    else it.prepend(b);
  }

  /** @private names, help reference, enabled state of every handle */
  _paint() {
    const off = this.hasAttribute('disabled') || !this._valid;
    this._model.keys().forEach((it, i) => {
      this._upgrade(it);
      const h = this._handleOf(it);
      if (!h) return;
      if (this._ownName.has(h)) {
        h.setAttribute('aria-label', formatLabel(TdSortable.labels.handle, { name: defaultItemName(it, i, TdSortable.labels) }));
      }
      if (this._help) h.setAttribute('aria-describedby', this._help.id);
      if (off) h.setAttribute('aria-disabled', 'true');
      else h.removeAttribute('aria-disabled');
    });
  }

  /** @private adapter: move the item at `from` to `to` by moving the neighbours, then the model (before any observer) */
  _moveItem(from, to) {
    if (!this._model.canMove(from, to)) return;
    const items = this._model.keys();
    const it = items[from];
    if (from < to) for (let k = from + 1; k <= to; k += 1) it.before(items[k]);
    else for (let k = from - 1; k >= to; k -= 1) it.after(items[k]);
    this._model.move(from, to);
    this._paint();
  }

  /** @private drop → `order-change`, only with valid keys (checked again right now) */
  _commit({ item, from, to, source }) {
    this._validate();
    if (!this._valid || this.hasAttribute('disabled')) {
      this._paint();
      if (!this._warned.has('commit')) {
        this._warned.add('commit');
        console.warn('td-sortable: the item ids became invalid during the gesture — no order-change.', this);
      }
      return;
    }
    const order = this._model.keys().map((it) => it.getAttribute('data-id'));
    const previous = order.slice();
    const [moved] = previous.splice(to, 1);
    previous.splice(from, 0, moved);
    this.emit('order-change', { order, previous, id: item.getAttribute('data-id'), from, to, source });
  }

  /** @private pending records first (an API call right after a direct DOM change) */
  _flush() {
    if (!this._mo || !this.isConnected) return;
    const recs = this._mo.takeRecords();
    if (recs.length) this._onMutations(recs);
  }

  /** @private the DOM is the source of truth; the controller's own mutations change nothing */
  _onMutations(records) {
    if (!this.isConnected || !this._started) return;
    const own = (n) => this._ctl?.isOwnNode(n) || n === this._live || n === this._help;
    let attrs = false;
    let relevant = false;
    for (const r of records) {
      const t = r.target;
      if (t !== this && t.parentNode !== this) continue;
      if (r.type === 'attributes') { attrs = true; relevant = true; continue; }
      if (t === this && [...r.addedNodes, ...r.removedNodes].every(own)) continue;
      if (t === this._live || t === this._help) continue;
      relevant = true;
    }
    if (!relevant) return;
    const dom = this._domItems();
    const keys = this._model.keys();
    const same = dom.length === keys.length && dom.every((it, i) => it === keys[i]);
    if (!same) {
      this._ctl?.cancel('external');
      this._model.reset(dom);
      this._validate();
      this._ensureAux();
      this._paint();
      return;
    }
    if (attrs && this._validate()) {
      this._ctl?.cancel('invalid');
      this._paint();
    }
  }
}

if (!customElements.get('td-sortable')) {
  customElements.define('td-sortable', TdSortable);
}
