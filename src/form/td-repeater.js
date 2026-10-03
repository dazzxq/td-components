import { TdBaseElement } from '../base/td-base-element.js';
import { tdIcon } from '../icons/td-icon.js';
import { OrderedCollectionModel } from '../utils/ordered-collection.js';

const ROW = 'data-td-row';
const SLOT = '[data-td-row-actions]';
/** In-row references renamed together with the ids of a CLONED row (token lists). */
const REF_ATTRS = ['for', 'aria-labelledby', 'aria-describedby', 'aria-controls', 'aria-errormessage', 'aria-owns', 'list', 'field-id'];
/** What can take focus in a new row (first one in tree order, outside the actions). */
const FOCUSABLE = 'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), '
  + 'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

let _uid = 0;

/**
 * <td-repeater> — dynamic list of rows (add / remove / reorder) built from the app's own markup (v0.30.0, plan
 * docs/internal/plans/v0.30.0-number-repeater.md M5). Styles: src/styles/components/repeater.css. NOT form-associated:
 * the fields inside the rows submit themselves. Upgrades the app markup IN PLACE (like td-media-grid — `_doRender()`
 * override, never `innerHTML`, never re-parents a row on upgrade).
 *
 * Markup contract (works without JS — the buttons only exist once upgraded):
 *   <td-repeater label="Hộp gồm" min-rows="1" max-rows="20" [add-label="Thêm phụ kiện"]>
 *     <template><div data-td-row>…fields…[<div data-td-row-actions></div>]</div></template>
 *     <div data-td-row>…fields (server-rendered, already named)…</div>   (0..n)
 *   </td-repeater>
 *
 * - The FIRST direct `<template>` child holds exactly one element (`data-td-row` added when missing); anything else →
 *   one warning, the add button is `aria-disabled`. Rows = DIRECT children with `data-td-row`.
 * - JS adds: host `class="td-repeater" role="group"` + `aria-labelledby` (internal `div.td-repeater__label` when
 *   `label` is set); per row `class="td-repeater__row" role="group" aria-label="Dòng n"` (kept when the app set
 *   `aria-labelledby`) `data-td-index`; the ↑ / ↓ / × buttons in `[data-td-row-actions]` or a `div.td-repeater__actions`
 *   appended to the row; `div.td-repeater__footer` (add button + `span.td-sr-only[role=status]`) appended to the host.
 * - Names: the kit NEVER reads or writes `name` / `form` / `value` of anything in a row (decision 7). It keeps
 *   `data-td-index` and fires `rows-change` SYNCHRONOUSLY after every structural change (user and API) — the app
 *   renames there (recipe in docs/components/repeater.md).
 * - Cloned rows (`document.importNode(template.content)`): every `id` (and `field-id`) becomes `{id}--r{n}` (`n` a
 *   per-host counter, never reused, never taken from data); in-row references follow (`for`, `aria-*` id refs, `list`,
 *   `field-id`). References out of the row are kept. Server / app rows are never renamed.
 * - Boundaries use `aria-disabled="true"` (a focused button keeps focus); pressing one does nothing but announce.
 * - Moving always moves the NEIGHBOUR rows, so the row holding the pressed button stays attached (focus kept, its td-*
 *   are not re-connected).
 * - Outside changes (the app inserts / removes / reorders `[data-td-row]` children): a MutationObserver (childList, no
 *   subtree) rebuilds the order from the DOM (the source of truth), upgrades new rows, keeps rows above `max-rows`
 *   (one warning), appends template rows below `min-rows`, then ONE `rows-change` `reason: 'sync'`.
 *
 * @element td-repeater
 * @attr {string} label - visible group label (text)
 * @attr {number} min-rows - integer 0–200 (default 0; above `MAX_MIN_ROWS` = 200 → ignored + one warning): never fewer
 *   rows (filled from the template)
 * @attr {number} max-rows - integer ≥ 0 (default none): no add past it (rows already there are kept)
 * @attr {string} add-label - text of the add button (default `TdRepeater.labels.add`)
 * @fires rows-change - detail: { reason: 'init'|'add'|'remove'|'move'|'sync', source: 'user'|'api', rows, row?, index?, from?, to? }
 * @fires before-remove - cancelable, user × only; detail: { row, index }
 */
export class TdRepeater extends TdBaseElement {
  /**
   * Texts (Vietnamese); override per site. Placeholders: `{n}` (1-based row / position), `{count}`, `{min}`, `{max}`.
   */
  static labels = {
    add: 'Thêm dòng',
    row: 'Dòng {n}',
    remove: 'Xoá dòng {n}',
    moveUp: 'Chuyển dòng {n} lên',
    moveDown: 'Chuyển dòng {n} xuống',
    added: 'Đã thêm dòng {n}. Có {count} dòng.',
    removed: 'Đã xoá dòng {n}. Còn {count} dòng.',
    moved: 'Đã chuyển tới vị trí {n} / {count}.',
    full: 'Tối đa {max} dòng.',
    atMin: 'Cần ít nhất {min} dòng.',
  };

  /**
   * Hard ceiling of `min-rows` (security review v0.30.0): above it the attribute is ignored (one warning), so the
   * auto-fill from the template never clones more than this many rows. `max-rows` may be larger.
   */
  static MAX_MIN_ROWS = OrderedCollectionModel.MAX_MIN;

  static get observedAttributes() {
    return ['label', 'min-rows', 'max-rows', 'add-label'];
  }

  constructor() {
    super();
    this._uid = ++_uid;
    /** @private clone counter (ids `{id}--r{n}`), never reused */
    this._cloneN = 0;
    this._model = new OrderedCollectionModel({
      warn: (m) => this._warnOnce(m.includes('ceiling') ? 'mincap' : 'model',
        m.includes('ceiling') ? `td-repeater: min-rows above ${TdRepeater.MAX_MIN_ROWS} is ignored.` : m),
    });
    /** @private @type {HTMLTemplateElement|null} */
    this._template = null;
    this._templateOk = false;
    this._warned = new Set();
    this._mo = null;
    this._labelEl = null;
    this._footer = null;
    this._addBtn = null;
    this._live = null;
    this._ownLabelledBy = false;
    this._started = false;
  }

  // --- public API ---

  /** @returns {HTMLElement[]} the rows in DOM order */
  get rows() {
    this._flush();
    return this._domRows();
  }

  /**
   * Add a row from the template (respects `max-rows`). Fires `rows-change` (`source: 'api'`).
   * @param {{ at?: number }} [opts] - index (default: at the end)
   * @returns {HTMLElement|null} the new row, or null (full / bad template / not upgraded)
   */
  addRow({ at } = {}) {
    this._flush();
    return this._add(at, 'api');
  }

  /**
   * Remove a row (respects `min-rows`; no `before-remove`). Fires `rows-change` (`source: 'api'`).
   * @param {HTMLElement|number} rowOrIndex
   * @returns {boolean}
   */
  removeRow(rowOrIndex) {
    if (!this._started) return false;
    this._flush();
    const rows = this._domRows();
    const row = typeof rowOrIndex === 'number' ? rows[rowOrIndex] : rowOrIndex;
    if (!row || !rows.includes(row)) return false;
    return this._remove(row, 'api');
  }

  /**
   * Move the row at `from` so that it ends up at index `to`. Fires `rows-change` (`source: 'api'`).
   * @param {number} from
   * @param {number} to
   * @returns {boolean}
   */
  moveRow(from, to) {
    if (!this._started) return false;
    this._flush();
    return this._move(from, to, 'api');
  }

  // --- lifecycle (in place: never renders over the children) ---

  attributeChangedCallback(name, oldVal, newVal) {
    if (oldVal === newVal || !this._initialized || !this._started) return;
    if (name === 'label') this._syncLabel();
    else if (name === 'add-label') this._syncAddLabel();
    else {
      this._applyLimits();
      // detached: the model may be stale (no observer) — reconnect rebuilds it from the DOM and fills min (round 3)
      if (!this.isConnected) return;
      this._flush(); // pending direct DOM changes first, under the new limits (impl review round 2)
      if (this._fillMin() > 0) this._changed({ reason: 'sync', source: 'api' });
      else this._paint();
    }
  }

  /**
   * First connect and every re-connect (disconnect ran the cleanups): upgrade in place (idempotent), bind the click
   * delegate + the observer.
   * @private
   */
  _doRender() {
    if (this._suppressRender) return;
    const first = !this._started;
    this._started = true;
    this.classList.add('td-repeater');
    this.setAttribute('role', 'group');
    if (first) this._readTemplate();
    this._syncLabel();
    this._ensureFooter();
    this._applyLimits();
    const rows = this._domRows();
    const before = this._model.keys();
    const same = before.length === rows.length && before.every((r, i) => r === rows[i]);
    this._model.reset(rows);
    this._warnOver();
    const filled = this._fillMin();
    this._paint();
    this.listen(this, 'click', (e) => this._onClick(e));
    if (typeof MutationObserver === 'function') {
      this._mo = new MutationObserver(() => this._sync());
      this._mo.observe(this, { childList: true });
      this._cleanups.push(() => { this._mo?.disconnect(); this._mo = null; });
    }
    if (first) this._changed({ reason: 'init', source: 'api' });
    else if (!same || filled) this._changed({ reason: 'sync', source: 'api' });
  }

  // --- structure ---

  /** @private direct `[data-td-row]` children, DOM order */
  _domRows() {
    return /** @type {HTMLElement[]} */ ([...this.children].filter((c) => c.hasAttribute(ROW)));
  }

  /** @private the first direct `<template>`; exactly one element inside */
  _readTemplate() {
    const tpl = [...this.children].find((c) => c.localName === 'template');
    this._template = /** @type {HTMLTemplateElement|null} */ (tpl || null);
    const count = tpl ? tpl.content.children.length : 0;
    this._templateOk = count === 1;
    if (!this._templateOk) {
      this._warnOnce('template', `td-repeater: the first direct <template> child must hold exactly one element (found ${tpl ? count : 'no template'}) — rows cannot be added.`);
    }
  }

  /** @private */
  _applyLimits() {
    this._model.setLimits({ min: this.getAttribute('min-rows'), max: this.getAttribute('max-rows') });
  }

  /** @private */
  _warnOver() {
    if (this._model.size > this._model.max) {
      this._warnOnce('over', `td-repeater: ${this._model.size} rows exceed max-rows=${this._model.max} — all kept.`);
    }
  }

  /** @private append template rows until min-rows; @returns {number} how many */
  _fillMin() {
    let n = 0;
    // bounded twice: min ≤ MAX_MIN_ROWS (model) and never more than that many clones in one fill
    while (this._templateOk && this._model.size < this._model.min && n < TdRepeater.MAX_MIN_ROWS) {
      const row = this._cloneRow();
      this._insertRowNode(row, this._model.size);
      this._model.insert(row, this._model.size);
      n += 1;
    }
    return n;
  }

  /** @private label div (text) at the start of the host + aria-labelledby */
  _syncLabel() {
    const text = this.getAttribute('label') || '';
    if (text) {
      if (!this._labelEl) {
        this._labelEl = document.createElement('div');
        this._labelEl.className = 'td-repeater__label';
        this._labelEl.id = `td-repeater-${this._uid}-label`;
      }
      this._labelEl.textContent = text;
      if (this._labelEl.parentNode !== this) this.prepend(this._labelEl);
      this.setAttribute('aria-labelledby', this._labelEl.id);
      this._ownLabelledBy = true;
    } else {
      this._labelEl?.remove();
      this._labelEl = null;
      if (this._ownLabelledBy) this.removeAttribute('aria-labelledby');
      this._ownLabelledBy = false;
    }
  }

  /** @private footer (add button + live region), last child of the host */
  _ensureFooter() {
    if (!this._footer) {
      const footer = document.createElement('div');
      footer.className = 'td-repeater__footer';
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'td-btn td-btn--secondary td-btn--sm td-repeater__add';
      add.setAttribute('data-td-repeater-action', 'add');
      const icon = tdIcon('plus', { size: 's' });
      if (icon) add.appendChild(icon);
      const text = document.createElement('span');
      text.className = 'td-repeater__add-label';
      add.appendChild(text);
      const live = document.createElement('span');
      live.className = 'td-sr-only';
      live.setAttribute('role', 'status');
      footer.append(add, live);
      this._footer = footer;
      this._addBtn = add;
      this._live = live;
    }
    this._syncAddLabel();
    if (this._footer.parentNode !== this || this.lastElementChild !== this._footer) this.appendChild(this._footer);
  }

  /** @private */
  _syncAddLabel() {
    const span = this._addBtn?.querySelector('.td-repeater__add-label');
    if (span) span.textContent = this.getAttribute('add-label') || TdRepeater._label('add');
  }

  /** @private upgrade one row (idempotent): class, role, actions + buttons */
  _upgradeRow(row) {
    row.classList.add('td-repeater__row');
    row.setAttribute('role', 'group');
    let box = this._actionsOf(row);
    if (!box) {
      box = document.createElement('div');
      box.className = 'td-repeater__actions';
      row.appendChild(box);
    }
    box.classList.add('td-repeater__actions');
    for (const [kind, icon] of [['up', 'up'], ['down', 'down'], ['remove', 'close']]) {
      if (box.querySelector(`:scope > .td-repeater__btn--${kind}`)) continue;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `td-repeater__btn td-repeater__btn--${kind}`;
      b.setAttribute('data-td-repeater-action', kind);
      const svg = tdIcon(icon, { size: 's' });
      if (svg) b.appendChild(svg);
      box.appendChild(b);
    }
  }

  /** @private the row's actions container: the app slot (owned by this row) or ours */
  _actionsOf(row) {
    for (const el of row.querySelectorAll(`${SLOT}, .td-repeater__actions`)) {
      if (el.closest(`[${ROW}]`) === row) return /** @type {HTMLElement} */ (el);
    }
    return null;
  }

  /** @private index + labels + boundary states of every row, the add button */
  _paint() {
    const rows = this._model.keys();
    const n = rows.length;
    const canRemove = this._model.canRemove();
    rows.forEach((row, i) => {
      this._upgradeRow(row);
      row.setAttribute('data-td-index', String(i));
      if (row.hasAttribute('aria-labelledby')) row.removeAttribute('aria-label');
      else row.setAttribute('aria-label', TdRepeater._label('row', { n: i + 1 }));
      const box = this._actionsOf(row);
      const set = (kind, label, off) => {
        const b = box?.querySelector(`:scope > .td-repeater__btn--${kind}`);
        if (!b) return;
        b.setAttribute('aria-label', TdRepeater._label(label, { n: i + 1 }));
        if (off) b.setAttribute('aria-disabled', 'true');
        else b.removeAttribute('aria-disabled');
      };
      set('up', 'moveUp', i === 0);
      set('down', 'moveDown', i === n - 1);
      set('remove', 'remove', !canRemove);
    });
    if (this._addBtn) {
      if (this._templateOk && this._model.canAdd()) this._addBtn.removeAttribute('aria-disabled');
      else this._addBtn.setAttribute('aria-disabled', 'true');
    }
  }

  /** @private a new row from the template, ids made unique */
  _cloneRow() {
    const frag = document.importNode(/** @type {HTMLTemplateElement} */ (this._template).content, true);
    const row = /** @type {HTMLElement} */ (frag.firstElementChild);
    if (!row.hasAttribute(ROW)) row.setAttribute(ROW, '');
    const n = ++this._cloneN;
    const map = new Map();
    const all = [row, ...row.querySelectorAll('*')];
    for (const el of all) {
      for (const a of ['id', 'field-id']) {
        const v = el.getAttribute(a);
        if (v && !map.has(v)) map.set(v, `${v}--r${n}`);
      }
    }
    if (map.size) {
      for (const el of all) {
        if (el.id && map.has(el.id)) el.id = map.get(el.id);
        for (const a of REF_ATTRS) {
          const v = el.getAttribute(a);
          if (v == null) continue;
          const tokens = v.split(/\s+/).filter(Boolean);
          if (tokens.some((t) => map.has(t))) el.setAttribute(a, tokens.map((t) => map.get(t) ?? t).join(' '));
        }
      }
    }
    return row;
  }

  /** @private put `row` at DOM index `at` among the rows (before the footer when last) */
  _insertRowNode(row, at) {
    const rows = this._domRows();
    if (at < rows.length) rows[at].before(row);
    else if (rows.length) rows[rows.length - 1].after(row);
    else if (this._footer && this._footer.parentNode === this) this.insertBefore(row, this._footer);
    else this.appendChild(row);
  }

  // --- operations ---

  /** @private */
  _add(at, source) {
    if (!this._started || !this._templateOk || !this._model.canAdd()) return null;
    const size = this._model.size;
    const n = Number(at);
    const i = at == null || !Number.isFinite(n) ? size : Math.max(0, Math.min(Math.trunc(n), size));
    const row = this._cloneRow();
    this._insertRowNode(row, i);
    this._model.insert(row, i);
    this._changed({ reason: 'add', source, row, index: i });
    return row;
  }

  /** @private */
  _remove(row, source) {
    const index = this._model.indexOf(row);
    if (index < 0 || !this._model.canRemove()) return false;
    const active = this.ownerDocument.activeElement;
    const hadFocus = !!active && row.contains(active);
    this._model.remove(row);
    row.remove();
    this._changed({ reason: 'remove', source, row, index });
    if (hadFocus) {
      const rows = this._model.keys();
      const j = OrderedCollectionModel.focusAfterRemove(index, rows.length);
      const target = j >= 0 ? this._actionsOf(rows[j])?.querySelector(':scope > .td-repeater__btn--remove') : this._addBtn;
      /** @type {HTMLElement|null|undefined} */ (target)?.focus();
    }
    if (hadFocus || source === 'user') this._announce('removed', { n: index + 1, count: this._model.size });
    return true;
  }

  /**
   * @private Move the row at `from` to index `to` by moving the rows in between (the moved row stays attached).
   */
  _move(from, to, source) {
    if (!this._model.canMove(from, to)) return false;
    const rows = this._model.keys();
    const row = rows[from];
    if (from < to) for (let k = from + 1; k <= to; k += 1) row.before(rows[k]);
    else for (let k = from - 1; k >= to; k -= 1) row.after(rows[k]);
    this._model.move(from, to);
    this._changed({ reason: 'move', source, row, from, to });
    if (source === 'user') this._announce('moved', { n: to + 1, count: this._model.size });
    return true;
  }

  /** @private repaint + the one structural event */
  _changed(detail) {
    this._paint();
    this.emit('rows-change', { ...detail, rows: this._model.keys() });
  }

  /**
   * @private Impl review round 1: a public API call right after a direct DOM change (same task, observer callback not run
   * yet) reconciles first — pending records taken (the queued callback then sees nothing), `_sync()` emits the one
   * `sync` if the DOM and the model differ.
   */
  _flush() {
    if (!this._started) return;
    this._mo?.takeRecords();
    this._sync(true); // explicit (API / limits): also reconciles a started-but-detached repeater (impl review round 3)
  }

  /** @private outside change (MutationObserver): the DOM is the source of truth */
  _sync(force = false) {
    if (!this._started || (!force && !this.isConnected)) return;
    if (this._footer && this.lastElementChild !== this._footer) this.appendChild(this._footer);
    const rows = this._domRows();
    const keys = this._model.keys();
    if (keys.length === rows.length && keys.every((r, i) => r === rows[i])) return;
    this._model.reset(rows);
    this._warnOver();
    this._fillMin();
    this._changed({ reason: 'sync', source: 'api' });
  }

  // --- events ---

  /** @private click delegate (buttons are real `<button type="button">`; fieldset-disabled ones fire nothing) */
  _onClick(e) {
    const target = /** @type {Element} */ (e.target);
    const b = target instanceof Element ? target.closest('button[data-td-repeater-action]') : null;
    if (!b || b.closest('td-repeater') !== this) return;
    const kind = b.getAttribute('data-td-repeater-action');
    if (kind === 'add') {
      if (b !== this._addBtn) return;
      if (!this._templateOk) return;
      if (!this._model.canAdd()) { this._announce('full', { max: this._model.max }); return; }
      const row = this._add(undefined, 'user');
      if (!row) return;
      this._focusRow(row);
      this._announce('added', { n: this._model.indexOf(row) + 1, count: this._model.size });
      return;
    }
    const row = b.closest(`[${ROW}]`);
    const index = row ? this._model.indexOf(row) : -1;
    if (index < 0 || row.parentElement !== this) return;
    if (kind === 'remove') {
      if (!this._model.canRemove()) { this._announce('atMin', { min: this._model.min }); return; }
      const ev = new CustomEvent('before-remove', { bubbles: true, composed: true, cancelable: true, detail: { row, index } });
      if (!this.dispatchEvent(ev)) return;
      // a listener may have changed the rows meanwhile
      if (this._model.indexOf(row) < 0) return;
      this._remove(row, 'user');
    } else if (kind === 'up') {
      if (index > 0) this._move(index, index - 1, 'user');
    } else if (kind === 'down') {
      if (index < this._model.size - 1) this._move(index, index + 1, 'user');
    }
  }

  /** @private focus the first focusable thing of a new row (outside its actions) */
  _focusRow(row) {
    const box = this._actionsOf(row);
    for (const el of row.querySelectorAll(FOCUSABLE)) {
      if (box && box.contains(el)) continue;
      /** @type {HTMLElement} */ (el).focus();
      if (row.contains(this.ownerDocument.activeElement)) return;
    }
  }

  /** @private live region (text); cleared first so a repeated message is announced again */
  _announce(key, vars) {
    if (!this._live) return;
    this._live.textContent = '';
    this._live.textContent = TdRepeater._label(key, vars);
  }

  /** @private */
  static _label(key, vars = {}) {
    return String(TdRepeater.labels[key] ?? '').replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  }

  /** @private */
  _warnOnce(kind, msg) {
    if (this._warned.has(kind)) return;
    this._warned.add(kind);
    console.warn(msg, this);
  }
}

if (!customElements.get('td-repeater')) {
  customElements.define('td-repeater', TdRepeater);
}
