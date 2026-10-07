import { TdBaseElement } from '../base/td-base-element.js';
import { tdIcon } from '../icons/td-icon.js';
import { OrderedCollectionModel } from '../utils/ordered-collection.js';
import { SortableController, SORTABLE_LABELS, defaultItemName, formatLabel } from '../utils/sortable-controller.js';

const ROW = 'data-td-row';
const SLOT = '[data-td-row-actions]';
const APP_HANDLE = 'button[data-td-sort-handle]';
/** In-row references renamed together with the ids of a CLONED row (token lists). */
const REF_ATTRS = ['for', 'aria-labelledby', 'aria-describedby', 'aria-controls', 'aria-errormessage', 'aria-owns', 'list', 'field-id'];
/** What can take focus in a new row (first one in tree order, outside the actions). */
const FOCUSABLE = 'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), '
  + 'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

/** v0.56.0 (plan v0.56.0-repeater-icons-date R1): the field key of a row (never derived from `name`). */
const FIELD = 'data-td-field';
/** Longest key / tag text a warning repeats (app data — console only, never markup). */
const WARN_TEXT_MAX = 64;

let _uid = 0;

/**
 * v0.56.0 (R1): the fields of `row` grouped by key, in DOM order — a field belongs to its NEAREST row (nested repeaters
 * never mix). Only form fields: input, select, textarea, custom elements (anything else carrying the key is ignored).
 * @param {Element} row
 * @returns {Map<string, Element[]>}
 */
function fieldGroups(row) {
  const groups = new Map();
  for (const el of row.querySelectorAll(`[${FIELD}]`)) {
    if (el.closest(`[${ROW}]`) !== row) continue;
    const key = el.getAttribute(FIELD);
    if (!key) continue;
    const n = el.localName;
    if (n !== 'input' && n !== 'select' && n !== 'textarea' && !n.includes('-')) continue;
    const list = groups.get(key);
    if (list) list.push(el);
    else groups.set(key, [el]);
  }
  return groups;
}

/**
 * v0.56.0 (R2): how a group of fields is read / written — by ELEMENT KIND, never by tag name list.
 * @param {Element[]} els
 * @returns {{ kind: 'text'|'multi'|'check'|'checks'|'radio'|'bool'|'nested'|'custom'|'file', els: Element[] }}
 */
function kindOf(els) {
  const first = /** @type {any} */ (els[0]);
  if (first.localName === 'input') {
    const t = first.type;
    if (t === 'file') return { kind: 'file', els };
    if (t === 'radio') return { kind: 'radio', els: els.filter((e) => /** @type {any} */ (e).type === 'radio') };
    if (t === 'checkbox') {
      const boxes = els.filter((e) => /** @type {any} */ (e).type === 'checkbox');
      return { kind: boxes.length > 1 ? 'checks' : 'check', els: boxes };
    }
    return { kind: 'text', els };
  }
  if (first.localName === 'select') return { kind: first.multiple ? 'multi' : 'text', els };
  if (first.localName === 'textarea') return { kind: 'text', els };
  if (typeof first.checked === 'boolean') return { kind: 'bool', els };
  return { kind: first.localName === 'td-repeater' ? 'nested' : 'custom', els };
}

/** @param {{ kind: string, els: any[] }} f */
function readField({ kind, els }) {
  const el = els[0];
  switch (kind) {
    case 'multi': return [...el.selectedOptions].map((o) => o.value);
    case 'check':
    case 'bool': return !!el.checked;
    case 'checks': return els.filter((e) => e.checked).map((e) => e.value);
    case 'radio': return els.find((e) => e.checked)?.value ?? null;
    case 'nested':
    case 'custom': return el.value;
    default: return el.value;
  }
}

/** @param {{ kind: string, els: any[] }} f @param {boolean} present @param {unknown} v */
function writeField({ kind, els }, present, v) {
  const el = els[0];
  const list = present && Array.isArray(v) ? v.map(String) : [];
  switch (kind) {
    case 'multi':
      for (const o of el.options) o.selected = list.includes(o.value);
      return;
    case 'check':
    case 'bool':
      el.checked = present && !!v;
      return;
    case 'checks':
      for (const e of els) e.checked = list.includes(e.value);
      return;
    case 'radio':
      for (const e of els) e.checked = present && v != null && e.value === String(v);
      return;
    case 'nested':
      el.value = present ? v : [];
      return;
    case 'custom':
      el.value = present ? v : '';
      return;
    default:
      el.value = present ? String(v ?? '') : '';
  }
}

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
 * - v0.31.0 `sortable` (opt-in, plan v0.31.0-sortable-masked M4): drag / keyboard lift through the shared
 *   SortableController (src/utils/sortable-controller.js) — a handle `button.td-repeater__btn.td-sortable__handle` opens
 *   each action group (an app `button[data-td-sort-handle]` in the row is upgraded instead); every keyboard step, drop
 *   and Escape goes through `_move()` → one `rows-change` `reason: 'move'` `source: 'user'` each (no `order-change`).
 *   Without `sortable` nothing of it exists (an app handle button gets `hidden`).
 *
 * - v0.56.0 data (plan v0.56.0-repeater-icons-date R1–R4, ADR 0029): fields marked `data-td-field="key"` are read / written
 *   by `value` (an array of row objects, one per row, DOM order) — by element kind (text / select / multiple / one
 *   checkbox → boolean / checkbox group → values / radio group → value | null / td-* `checked` → boolean / other td-*
 *   `value`, a nested td-repeater its own array); `input[type=file]` is skipped. Still NEVER `name` / `form`: the app's
 *   naming recipe on `rows-change` stays the one source of FormData names. Setting `value` reuses rows BY POSITION
 *   (clamped to min-rows / max-rows, else `MAX_VALUE_ROWS`) and fires ONE `rows-change` `reason: 'set'` `source: 'api'`.
 *   Per instance hooks `readRow(row, defaultRead)` / `writeRow(row, data, defaultWrite)` replace the defaults.
 *
 * @element td-repeater
 * @attr {string} label - visible group label (text)
 * @attr {number} min-rows - integer 0–200 (default 0; above `MAX_MIN_ROWS` = 200 → ignored + one warning): never fewer
 *   rows (filled from the template)
 * @attr {number} max-rows - integer ≥ 0 (default none): no add past it (rows already there are kept)
 * @attr {string} add-label - text of the add button (default `TdRepeater.labels.add`)
 * @attr {boolean} sortable - v0.31.0: drag handle + keyboard lift (texts: `TdSortable.labels`, shared)
 * @fires rows-change - detail: { reason: 'init'|'add'|'remove'|'move'|'sync'|'set', source: 'user'|'api', rows, row?, index?, from?, to? }
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
    moved: 'Đã chuyển tới vị trí {n} trên {count}.',
    full: 'Tối đa {max} dòng.',
    atMin: 'Cần ít nhất {min} dòng.',
  };

  /**
   * Hard ceiling of `min-rows` (security review v0.30.0): above it the attribute is ignored (one warning), so the
   * auto-fill from the template never clones more than this many rows. `max-rows` may be larger.
   */
  static MAX_MIN_ROWS = OrderedCollectionModel.MAX_MIN;

  /**
   * v0.56.0 (R3, Q5): without `max-rows`, `value = data` never builds more rows than this (one warning, the rest dropped)
   * — data from a server / API can never drive an unbounded clone loop.
   */
  static MAX_VALUE_ROWS = 1000;

  static get observedAttributes() {
    return ['label', 'min-rows', 'max-rows', 'add-label', 'sortable'];
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
    /** @private v0.31.0 sortable: controller (only while `sortable` and connected), help text */
    this._ctl = null;
    this._help = null;
    /** @type {WeakSet<Element>} handles whose aria-label the kit owns */
    this._ownName = new WeakSet();
    /** @private v0.56.0 hooks (null = the default reader / writer) */
    this._readRow = null;
    this._writeRow = null;
  }

  /**
   * P1 (plan v0.56.0): `value` / `readRow` / `writeRow` assigned BEFORE the upgrade (a <template> clone, createElement
   * before define) are own data properties shadowing the accessors — hand them to the setters before the first render
   * (hooks first, so the early value is written with them). Superseded by the base replay of v0.54.1.
   */
  connectedCallback() {
    if (!this._initialized) {
      for (const p of ['readRow', 'writeRow', 'value']) {
        if (!Object.prototype.hasOwnProperty.call(this, p)) continue;
        const v = this[p];
        delete this[p];
        this[p] = v;
      }
    }
    super.connectedCallback();
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

  /**
   * v0.56.0 (R2, R4): the rows' data — one object per row (DOM order) of its `data-td-field` fields. Read straight from
   * the DOM (also upgraded-but-detached); a new array every time. Before the upgrade the element is a plain HTMLElement
   * (no rows value) — `await customElements.whenDefined('td-repeater')` first.
   * @returns {Array<Record<string, unknown>>}
   */
  get value() {
    this._flush();
    return this._domRows().map((row) => this._readOne(row));
  }

  /**
   * v0.56.0 (R3): rebuild the rows from data — rows reused by position (same nodes, focus kept), new ones from the
   * template, extra ones removed from the end; count clamped to min-rows / max-rows (else MAX_VALUE_ROWS); every key of a
   * row written (absent → the empty value of its kind). One `rows-change` `{ reason: 'set', source: 'api' }` (none
   * before the first connect: the upgrade's `init` reports the rows). Not an array → one warning, nothing changes.
   * Runs while `disabled` / `readonly` too (like `.value` of a disabled input).
   * @param {Array<Record<string, unknown>>} data
   */
  set value(data) {
    if (!Array.isArray(data)) {
      console.warn('td-repeater: value must be an array of row objects — ignored.');
      return;
    }
    this._setValue(data);
  }

  /**
   * v0.56.0 hook: `(row, defaultRead) => object` reading one row (default null = the kit reader). A throwing hook (or one
   * returning a non-object) → console.error + the default.
   * @returns {((row: HTMLElement, defaultRead: (row: HTMLElement) => Record<string, unknown>) => Record<string, unknown>)|null}
   */
  get readRow() { return this._readRow; }
  set readRow(fn) { this._readRow = typeof fn === 'function' ? fn : null; }

  /**
   * v0.56.0 hook: `(row, data, defaultWrite) => void` writing one row (default null = the kit writer). A throwing hook →
   * console.error + the default.
   * @returns {((row: HTMLElement, data: Record<string, unknown>, defaultWrite: (row: HTMLElement, data: object) => void) => void)|null}
   */
  get writeRow() { return this._writeRow; }
  set writeRow(fn) { this._writeRow = typeof fn === 'function' ? fn : null; }

  // --- lifecycle (in place: never renders over the children) ---

  attributeChangedCallback(name, oldVal, newVal) {
    if (oldVal === newVal || !this._initialized || !this._started) return;
    if (name === 'label') this._syncLabel();
    else if (name === 'add-label') this._syncAddLabel();
    else if (name === 'sortable') {
      this._syncSortable();
      this._paint();
    } else {
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
    this._syncSortable();
    this._cleanups.push(() => this._stopSortable());
    this._paint();
    this.listen(this, 'click', (e) => this._onClick(e));
    if (typeof MutationObserver === 'function') {
      // records holding only the controller's own nodes (the drag placeholder) change nothing (plan v0.31 M2)
      this._mo = new MutationObserver((records) => {
        const own = (n) => !!this._ctl && this._ctl.isOwnNode(n);
        if (records.every((r) => [...r.addedNodes, ...r.removedNodes].every(own))) return;
        this._sync();
      });
      this._mo.observe(this, { childList: true });
      this._cleanups.push(() => { this._mo?.disconnect(); this._mo = null; });
    }
    if (first) this._changed({ reason: 'init', source: 'api' });
    else if (!same || filled) this._changed({ reason: 'sync', source: 'api' });
  }

  // --- data (v0.56.0) ---

  /** @private */
  _setValue(data) {
    const started = this._started;
    if (started) this._flush();
    else {
      // upgraded, not connected yet (or the early replay): write the DOM rows directly — the first render upgrades them
      this._applyLimits();
      this._readTemplate();
    }
    const { min, max } = this._model;
    const cap = Number.isFinite(max) ? max : TdRepeater.MAX_VALUE_ROWS;
    let list = data;
    if (list.length > cap) {
      this._warnOnce('valueover', `td-repeater: value has ${list.length} rows, more than ${Number.isFinite(max)
        ? `max-rows=${max}` : `TdRepeater.MAX_VALUE_ROWS (${cap})`} — the rest is dropped.`);
      list = list.slice(0, cap);
    }
    const n = Math.max(list.length, min);
    const rows = started ? this._model.keys() : this._domRows();
    while (rows.length < n) {
      if (!this._templateOk) break; // warned by _readTemplate
      const row = this._cloneRow();
      this._insertRowNode(row, rows.length);
      if (started) this._model.insert(row, rows.length);
      rows.push(row);
    }
    while (rows.length > n) {
      const row = rows.pop();
      if (started) this._model.remove(row);
      row.remove();
    }
    rows.forEach((row, i) => {
      const d = list[i];
      const obj = d && typeof d === 'object' && !Array.isArray(d) ? d : {};
      if (d != null && obj !== d) this._warnOnce('valuerow', 'td-repeater: a value row must be an object — written as empty.');
      this._writeOne(row, obj);
    });
    if (started) this._changed({ reason: 'set', source: 'api' });
  }

  /** @private one row through the hook (or the default reader) */
  _readOne(row) {
    const read = (r) => this._readFields(r);
    const fn = this._readRow;
    if (fn) {
      try {
        const out = fn.call(this, row, read);
        if (out && typeof out === 'object') return out;
        console.error('td-repeater: readRow must return an object — the default reader is used.');
      } catch (err) {
        console.error('td-repeater: readRow threw — the default reader is used.', err);
      }
    }
    return read(row);
  }

  /** @private one row through the hook (or the default writer) */
  _writeOne(row, data) {
    const write = (r, d) => this._writeFields(r, d && typeof d === 'object' ? d : {});
    const fn = this._writeRow;
    if (fn) {
      try {
        fn.call(this, row, data, write);
        return;
      } catch (err) {
        console.error('td-repeater: writeRow threw — the default writer is used.', err);
      }
    }
    write(row, data);
  }

  /** @private the default reader (R2): own properties (Object.fromEntries — a `__proto__` key stays a plain key) */
  _readFields(row) {
    const out = [];
    for (const [key, els] of fieldGroups(row)) {
      const f = kindOf(els);
      if (f.kind === 'file') { this._warnFile(); continue; }
      out.push([key, readField(f)]);
    }
    return Object.fromEntries(out);
  }

  /** @private the default writer (R2 / R3): every key of the row written; data keys without a field → one warning */
  _writeFields(row, data) {
    const groups = fieldGroups(row);
    for (const [key, els] of groups) {
      const f = kindOf(els);
      if (f.kind === 'file') { this._warnFile(); continue; }
      const present = Object.prototype.hasOwnProperty.call(data, key);
      writeField(f, present, present ? data[key] : undefined);
    }
    const unknown = Object.keys(data).filter((k) => !groups.has(k));
    if (unknown.length) {
      this._warnOnce('valuekey', `td-repeater: value key "${String(unknown[0]).slice(0, WARN_TEXT_MAX)}"${unknown.length > 1
        ? ` (+${unknown.length - 1})` : ''} has no [data-td-field] in the row — ignored.`);
    }
  }

  /** @private */
  _warnFile() {
    this._warnOnce('file', 'td-repeater: input[type=file] cannot be read or written by value — skipped.');
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
    this._syncHandle(row, box);
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
      const h = this._handleOf(row);
      if (h) {
        // the kit names its own button and an app button that came without a name
        if (!h.hasAttribute('data-td-sort-handle') || !h.hasAttribute('aria-label') || this._ownName.has(h)) {
          this._ownName.add(h);
          h.setAttribute('aria-label', formatLabel(SORTABLE_LABELS.handle, { name: defaultItemName(row, i, SORTABLE_LABELS) }));
        }
        if (this._help) h.setAttribute('aria-describedby', this._help.id);
      }
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
  _move(from, to, source, { quiet = false } = {}) {
    if (!this._model.canMove(from, to)) return false;
    const rows = this._model.keys();
    const row = rows[from];
    if (from < to) for (let k = from + 1; k <= to; k += 1) row.before(rows[k]);
    else for (let k = from - 1; k >= to; k -= 1) row.after(rows[k]);
    this._model.move(from, to);
    this._changed({ reason: 'move', source, row, from, to });
    if (source === 'user' && !quiet) this._announce('moved', { n: to + 1, count: this._model.size });
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
    // the footer stays last — the drag placeholder (a controller node, inserted before the footer) does not count
    let last = this.lastElementChild;
    if (last && this._ctl && this._ctl.isOwnNode(last)) last = last.previousElementSibling;
    if (this._footer && last !== this._footer) this.appendChild(this._footer);
    const rows = this._domRows();
    const keys = this._model.keys();
    if (keys.length === rows.length && keys.every((r, i) => r === rows[i])) return;
    this._ctl?.cancel('external'); // the DOM is the source of truth: nothing is moved back
    this._model.reset(rows);
    this._warnOver();
    this._fillMin();
    this._changed({ reason: 'sync', source: 'api' });
  }

  // --- sortable (v0.31.0, opt-in) ---

  /** @private start / stop the controller + help text to match the `sortable` attribute */
  _syncSortable() {
    const on = this.hasAttribute('sortable') && this.isConnected;
    if (on && !this._ctl) {
      if (!this._help) {
        this._help = document.createElement('span');
        this._help.hidden = true;
        this._help.id = `td-repeater-${this._uid}-sort-help`;
      }
      this._help.textContent = String(SORTABLE_LABELS.help ?? '');
      if (this._footer && this._help.parentNode !== this._footer) this._footer.appendChild(this._help);
      this._ctl = new SortableController(this, {
        items: () => this._model.keys(),
        handleOf: (row) => this._handleOf(row),
        move: (from, to) => { this._move(from, to, 'user', { quiet: true }); },
        commit: () => {}, // rows-change already fired for every step
        nameOf: (row, i) => defaultItemName(row, i, SORTABLE_LABELS),
        live: this._live,
        enabled: () => this.hasAttribute('sortable'),
        labels: SORTABLE_LABELS,
        reconcile: () => this._flush(), // review round 1 IMPL-1: pending outside changes → 'external' + sync first
        placePlaceholder: (ph) => {
          if (this._footer && this._footer.parentNode === this) this._footer.before(ph);
          else this.appendChild(ph);
        },
      });
    } else if (!this.hasAttribute('sortable')) {
      this._stopSortable();
      this._help?.remove();
    }
    for (const row of this._model.keys()) {
      const box = this._actionsOf(row);
      if (box) this._syncHandle(row, box);
    }
  }

  /** @private */
  _stopSortable() {
    this._ctl?.destroy();
    this._ctl = null;
  }

  /** @private the row's sort handle (the kit's or an upgraded app button), owned by this row */
  _handleOf(row) {
    for (const el of row.querySelectorAll('.td-sortable__handle')) {
      if (el.closest(`[${ROW}]`) === row) return /** @type {HTMLElement} */ (el);
    }
    return null;
  }

  /**
   * @private one row's handle to match `sortable`: on → the app `button[data-td-sort-handle]` upgraded, else a kit
   * button first in the action group; off → the kit button removed, an app button hidden.
   */
  _syncHandle(row, box) {
    let app = null;
    for (const el of row.querySelectorAll(APP_HANDLE)) {
      if (el.closest(`[${ROW}]`) === row) { app = /** @type {HTMLElement} */ (el); break; }
    }
    const on = this.hasAttribute('sortable');
    if (app) {
      if (on) {
        app.classList.add('td-repeater__btn', 'td-sortable__handle');
        app.hidden = false;
      } else {
        app.classList.remove('td-sortable__handle');
        app.hidden = true; // no dead button once defined (before define: CSS keeps it invisible)
      }
      return;
    }
    const kit = box.querySelector(':scope > .td-repeater__btn--sort');
    if (on && !kit) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'td-repeater__btn td-repeater__btn--sort td-sortable__handle';
      const svg = tdIcon('grip', { size: 's' });
      if (svg) b.appendChild(svg);
      box.prepend(b);
    } else if (!on && kit) {
      kit.remove();
    }
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
    console.warn(msg);
  }
}

if (!customElements.get('td-repeater')) {
  customElements.define('td-repeater', TdRepeater);
}
