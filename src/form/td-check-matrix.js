import { TdFormElement, ssrClassKey } from '../base/td-form-element.js';
import { ssrMarker } from '../base/td-base-element.js';
import { fillIconSlots } from '../icons/td-icon.js';
import {
  validateMatrix, MatrixState, decodeMatrixState, isLocked, isNa, MATRIX_LIMITS,
} from '../utils/check-matrix-model.js';
import { renderMatrix, renderMatrixState, fillMatrixLabel, MATRIX_LABELS, MATRIX_LAYOUTS } from '../utils/check-matrix-render.js';

/** max-height attribute (plan QĐ 20): stricter than the table's — no calc() / var() / url() / `;`. */
const MAX_HEIGHT = /^(none|\d{1,4}(\.\d{1,2})?(px|rem|em|vh|svh|dvh|lvh|%))$/;
/** Data properties a page may set before the element upgrades (replayed through the class setters). */
const UPGRADE_PROPS = ['columns', 'rows', 'cells', 'value'];
const PAGE = 10;
const SVG_NS = 'http://www.w3.org/2000/svg';
const SVG_TAGS = new Set(['svg', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse']);
const SVG_ATTRS = new Set(['class', 'data-icon', 'viewBox', 'xmlns', 'fill', 'stroke', 'stroke-width', 'stroke-linecap',
  'stroke-linejoin', 'aria-hidden', 'focusable', 'd', 'points', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2',
  'width', 'height', 'fill-rule', 'clip-rule', 'opacity', 'fill-opacity', 'stroke-opacity']);

let labelIds = 0;
const visible = (el) => !!el && el.getClientRects().length > 0;

/**
 * Checkbox grid rows × columns (v0.47.0, plan docs/internal/plans/v0.47.0-check-matrix.md; ADR 0022) — e.g. permissions ×
 * roles. Form-associated, light DOM, token-native (`components/check-matrix.css`). `<table role="grid">`, one native
 * checkbox per applicable cell (no name in JS mode), one tab stop + APG grid keys (roving tabindex).
 *
 * Data (JS properties, validated by ONE path — src/utils/check-matrix-model.js; a structural error fails CLOSED: broken
 * state, every control locked, NO FormData entry):
 *   m.columns = [{ key, label, description?, locked? }]          (≤ 32)
 *   m.rows = [{ key, label, description?, locked? } | { key, label, collapsed?, locked?, rows: [...] }]   (≤ 500 rows, ≤ 64 groups)
 *   m.cells = { [row]: { [col]: { locked?, na?, note? } } }       (special cells only)
 *   m.value = { [col]: [row, …] }                                  (ticked cells, by column)
 * Property assignments are batched (one validation + render at the next microtask); `setData({ … })` is atomic. The
 * `data` attribute (JSON `{"v":1,columns,rows,cells,value}`, ≤ 512 KiB) is the same input (php td_check_matrix prints it).
 *
 * FormData (public contract, ADR 0022): `name[col]=''` for every column first, `name[col][]=row` per ticked cell (locked
 * ones included), `name[_v]=1` last. No `name` attribute → no form value (the grid still works through events).
 *
 * @element td-check-matrix
 * @attr {string} name - FormData name (empty or ending in `[]` → broken state)
 * @attr {string} label - visible label (names the grid)
 * @attr {'auto'|'grid'|'column'} layout - narrow "one column at a time" mode (auto: container < 720px)
 * @attr {string} max-height - scroll box height (default token 70vh; `none` = no inner vertical scroll)
 * @attr {string} data - JSON input (SSR)
 * @attr {boolean} disabled
 * @fires change - user only: `{ added: [[row, col]…], removed: [[row, col]…], trigger }` (app keys)
 * @fires expanded-change - user only: `{ group, expanded }`
 */
export class TdCheckMatrix extends TdFormElement {
  static hydratable = true;

  /** Markup contract version of `data-td-ssr="check-matrix@N"`. */
  static SSR_SCHEMA = 1;

  static get observedAttributes() {
    return [...super.observedAttributes, 'label', 'layout', 'max-height', 'data', 'aria-label'];
  }

  /** Default texts (Vietnamese); override per site: `TdCheckMatrix.labels.rows = 'Quyền'` (PHP: option `labels`). */
  static labels = { ...MATRIX_LABELS };

  constructor() {
    super();
    /** @private pending property assignments (batched to a microtask) */
    this._pending = null;
    this._flushQueued = false;
    /** @private last valid data { columns, rows, cells } (raw, as given) */
    this._raw = null;
    /** @type {import('../utils/check-matrix-model.js').MatrixModel|null} */
    this._model = null;
    /** @type {MatrixState|null} */
    this._state = null;
    /** @private 'empty' | 'ready' | 'broken' */
    this._status = 'empty';
    /** @private live collapse state per group */
    this._collapsed = [];
    /** @private reset target as keys { col: [row] } (captured once, at the first valid data) */
    this._defKeys = null;
    /** @private narrow mode: index of the picked column */
    this._activeCol = 0;
    /** @private roving position as keys: { row: 'head'|'bulk'|'g:<key>'|'r:<key>', col: 'bulk'|'label'|'c:<key>' } */
    this._activeKey = null;
    this._warned = new Set();
    // a click on an external <label for="{host}"> focuses the tab stop (never toggles a cell)
    this._labelForwarder = (e) => {
      if (e.target !== this || this._effectiveDisabled) return;
      this.focus();
    };
    this.addEventListener('click', this._labelForwarder);
    this._replayUpgradeProps();
  }

  /** @private */
  _replayUpgradeProps() {
    for (const p of UPGRADE_PROPS) {
      if (Object.prototype.hasOwnProperty.call(this, p)) {
        const v = this[p];
        delete this[p];
        this[p] = v;
        (this._earlyData ||= new Set()).add(p);
      }
    }
  }

  connectedCallback() {
    this._replayUpgradeProps();
    super.connectedCallback();
    this._observeSize();
  }

  disconnectedCallback() {
    this._resizeObs?.disconnect();
    this._resizeObs = null;
    super.disconnectedCallback();
  }

  // --- data -------------------------------------------------------------------------------------------------------

  get columns() { return this._pending && 'columns' in this._pending ? this._pending.columns : this._raw?.columns; }
  set columns(v) { this._queue('columns', v); }

  get rows() { return this._pending && 'rows' in this._pending ? this._pending.rows : this._raw?.rows; }
  set rows(v) { this._queue('rows', v); }

  get cells() { return this._pending && 'cells' in this._pending ? this._pending.cells : this._raw?.cells; }
  set cells(v) { this._queue('cells', v); }

  /** `{ col: [row…] }` with the app's keys (a pending assignment is applied first). */
  get value() { return this.getValue(); }
  set value(v) { this._queue('value', v); }

  /** @returns {Record<string, Array<string|number>>} */
  getValue() {
    this._flush();
    return this._state ? this._state.valueObject() : {};
  }

  /**
   * Programmatic value (silent, no event). With data already in place an invalid value is REFUSED (state unchanged,
   * one warning); before any data it is part of the first data input.
   * @param {Record<string, Array<string|number>>} v
   */
  setValue(v) {
    this._queue('value', v);
    this._flush();
  }

  /**
   * Atomic data assignment (no intermediate state): `{ columns, rows, cells?, value? }`.
   * @param {{ columns: Array, rows: Array, cells?: Object, value?: Object }} data
   */
  setData(data) {
    const d = data && typeof data === 'object' ? data : {};
    this._pending = { columns: d.columns, rows: d.rows, cells: d.cells, ...('value' in d ? { value: d.value } : {}) };
    this._flush();
  }

  /** Number of cells that differ from the defaults. */
  get changedCount() {
    this._flush();
    return this._state ? this._state.changedCount : 0;
  }

  /** @private */
  _queue(key, v) {
    (this._pending ||= {})[key] = v;
    if (this._flushQueued) return;
    this._flushQueued = true;
    queueMicrotask(() => {
      this._flushQueued = false;
      this._flush();
    });
  }

  /** @private warn once per key (never a value) */
  _warn(key, msg) {
    if (this._warned.has(key)) return;
    this._warned.add(key);
    console.warn(`td-check-matrix: ${msg}`);
  }

  /** @private apply the pending assignments (QĐ 6 entry table) */
  _flush() {
    const p = this._pending;
    if (!p) return;
    this._pending = null;
    const dataChanged = 'columns' in p || 'rows' in p || 'cells' in p;
    if (!dataChanged && !this._model) {
      // a value before any data (early property, SSR host before its `data` is read): held for the first data
      this._heldValue = { value: p.value };
      return;
    }
    if (!dataChanged && this._model) {
      // value = / setValue() with data in place: refuse an invalid value, keep the state
      const res = validateMatrix({ ...this._raw, value: p.value });
      if (!res.ok) {
        console.warn(`td-check-matrix: value refused (${res.reason}) — state unchanged`);
        return;
      }
      this._state.setAll(res.model.value);
      this._afterStateChange(null);
      return;
    }
    const raw = {
      columns: 'columns' in p ? p.columns : this._raw?.columns,
      rows: 'rows' in p ? p.rows : this._raw?.rows,
      cells: 'cells' in p ? p.cells : this._raw?.cells,
    };
    this._applyData(raw, 'value' in p ? { value: p.value } : this._takeHeld());
  }

  /** @private the value held before any data (once) */
  _takeHeld() {
    const h = this._heldValue || null;
    this._heldValue = null;
    return h;
  }

  /**
   * @private New data (+ optional value). Without a value, the current ticks of cells that still exist are kept.
   * @param {{ columns: any, rows: any, cells: any }} raw
   * @param {{ value: any }|null} withValue
   */
  _applyData(raw, withValue) {
    const res = validateMatrix({ ...raw, value: withValue ? withValue.value : null });
    if (!res.ok) {
      this._fail(res.reason);
      return;
    }
    const model = res.model;
    let on = model.value;
    if (!withValue && this._state) on = this._carry(model, this._state.valueObject());
    if (!this._defKeys) this._defKeys = this._keysOf(model, on);
    const def = this._carry(model, this._defKeys);
    const prevCollapsed = new Map((this._model?.groups || []).map((g, i) => [g.key, this._collapsed[i]]));
    this._raw = raw;
    this._model = model;
    this._state = new MatrixState(model, on, def);
    this._collapsed = model.groups.map((g) => (prevCollapsed.has(g.key) ? prevCollapsed.get(g.key) : g.collapsed));
    if (this._activeCol >= model.columns.length) this._activeCol = 0;
    this._status = 'ready';
    this._rerender();
  }

  /** @private keys { col: [row] } of ticks */
  _keysOf(model, on) {
    const C = model.columns.length;
    const out = {};
    model.columns.forEach((c, j) => {
      out[c.key] = model.rows.filter((_, r) => on[r * C + j]).map((r) => r.key);
    });
    return out;
  }

  /** @private keys (string or app form) → ticks of `model`; unknown / n/a cells dropped */
  _carry(model, keys) {
    const C = model.columns.length;
    const on = new Uint8Array(model.rows.length * C);
    for (const [ck, list] of Object.entries(keys || {})) {
      const c = model.colIndex.get(String(ck));
      if (c === undefined || !Array.isArray(list)) continue;
      for (const rk of list) {
        const r = model.rowIndex.get(String(rk));
        if (r !== undefined && !isNa(model, r * C + c)) on[r * C + c] = 1;
      }
    }
    return on;
  }

  /** @private fail closed (QĐ 13): broken state, no FormData entry */
  _fail(reason) {
    console.warn(`td-check-matrix: invalid data (${reason}) — nothing is submitted`);
    this._status = 'broken';
    this._model = null;
    this._state = null;
    this._rerender();
  }

  /** @private the `data` attribute (SSR / declarative) → atomic data path */
  _applyDataAttr(str) {
    if (typeof str !== 'string' || str.length > MATRIX_LIMITS.json) {
      this._fail('data-size');
      return;
    }
    let o;
    try {
      o = JSON.parse(str);
    } catch {
      this._fail('data-json');
      return;
    }
    if (!o || typeof o !== 'object' || o.v !== 1) {
      this._fail('data-version');
      return;
    }
    this._applyData({ columns: o.columns, rows: o.rows, cells: o.cells }, { value: o.value });
    // an early `value` property wins over the attribute's (ADR 0012 §3); the defaults stay the attribute's
    const held = this._takeHeld();
    if (held && this._state) {
      const res = validateMatrix({ ...this._raw, value: held.value });
      if (res.ok) this._state.setAll(res.model.value);
      else console.warn(`td-check-matrix: value refused (${res.reason}) — state unchanged`);
    }
  }

  // --- groups -----------------------------------------------------------------------------------------------------

  /** Open a group (no event). @param {string|number} key */
  expand(key) { this._setGroup(key, false); }

  /** Close a group (no event). @param {string|number} key */
  collapse(key) { this._setGroup(key, true); }

  expandAll() {
    this._flush();
    this._collapsed = this._collapsed.map(() => false);
    this._syncGroups();
  }

  collapseAll() {
    this._flush();
    this._collapsed = this._collapsed.map(() => true);
    this._syncGroups();
  }

  /** @private */
  _setGroup(key, shut) {
    this._flush();
    const g = this._model?.groupIndex.get(String(key));
    if (g === undefined) return;
    this._collapsed[g] = shut;
    this._syncGroups();
  }

  // --- attributes / lifecycle -----------------------------------------------------------------------------------

  _setupProperties() {
    super._setupProperties();
    this._flush();
    // the declarative / SSR input, unless the page assigned data before upgrade (early property > attribute)
    const early = this._earlyData && ['columns', 'rows', 'cells'].some((k) => this._earlyData.has(k));
    if (!early && !this._model && this.hasAttribute('data')) {
      this._suppressRender = true;
      try {
        this._applyDataAttr(this.getAttribute('data'));
      } finally {
        this._suppressRender = false;
      }
    } else if (!this._model && ssrMarker(this)?.name === 'check-matrix') {
      this._status = 'broken'; // a server fail-closed host (no data)
    }
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (oldVal === newVal) return;
    if (name === 'disabled') this._effectiveDisabled = newVal !== null || this._ancestorDisabled;
    if (!this._initialized) return;
    switch (name) {
      case 'data':
        if (newVal !== null) this._applyDataAttr(newVal);
        return;
      case 'disabled':
        this._applyDisabled();
        return;
      case 'name':
        this._rerender();
        return;
      case 'label':
      case 'aria-label':
        this._rerender();
        return;
      case 'layout':
        this._root?.setAttribute('data-layout', this._layout());
        this._ensureActiveVisible();
        return;
      case 'max-height':
        this._applyStyles();
        return;
      default:
    }
  }

  /** @protected <fieldset disabled> toggles in place (no re-render → focus kept). */
  _syncEffectiveDisabled() {
    const next = this.hasAttribute('disabled') || this._ancestorDisabled;
    if (next === this._effectiveDisabled) return;
    this._effectiveDisabled = next;
    if (this._initialized) this._applyDisabled();
  }

  /** @private */
  _layout() {
    const l = (this.getAttribute('layout') || '').toLowerCase();
    return MATRIX_LAYOUTS.includes(l) ? l : 'auto';
  }

  /** @private name attribute present but empty / ending in [] → broken (QĐ 13) */
  _nameBroken() {
    if (!this.hasAttribute('name')) return false;
    const n = this.getAttribute('name');
    return n === '' || n.endsWith('[]');
  }

  /** @private */
  _labels() {
    return { ...MATRIX_LABELS, ...this.constructor.labels };
  }

  /** @private render options (shared by render() and the SSR gate) */
  _renderOpts(model, def, collapsed, ssr) {
    const state = this._state;
    return {
      model, def, collapsed, id: this.id, label: this.getAttribute('label') || '', ariaLabel: this.getAttribute('aria-label') || '',
      labels: this._labels(), layout: this._layout(), disabled: this._effectiveDisabled, ssr,
      bulkDisabled: ssr || !state ? null : (kind, a, b) => state.stats(kind, a, b).free === 0,
    };
  }

  render() {
    const base = { id: this.id, label: this.getAttribute('label') || '', ariaLabel: this.getAttribute('aria-label') || '', labels: this._labels() };
    if (this._status === 'ready' && this._nameBroken()) {
      this._warn('name', 'the name is empty or ends in [] — nothing is submitted');
      return renderMatrixState(base, 'broken');
    }
    if (this._status !== 'ready') return renderMatrixState(base, this._status);
    return renderMatrix(this._renderOpts(this._model, this._state.def, this._collapsed, null));
  }

  /** @private full re-render keeping the active cell (by key) and the focus */
  _rerender() {
    if (this._initialized && !this.isConnected) this._stale = true; // re-rendered (not re-bound) on the next connect
    if (!this._initialized || !this.isConnected) return;
    const hadFocus = this.contains(this.ownerDocument.activeElement);
    this._cleanups.forEach((fn) => fn());
    this._cleanups = [];
    this._doRender();
    if (hadFocus) this._activeTarget()?.focus({ preventScroll: true });
  }

  /** @private the grid is interactive (ready, name ok) */
  _live() {
    return this._status === 'ready' && !!this._grid;
  }

  afterRender() {
    this._stale = false;
    const root = this.querySelector(':scope > .td-check-matrix');
    this._root = root;
    this._grid = root?.querySelector('.td-check-matrix__grid') || null;
    if (this._status !== 'ready' || !this._grid) {
      this._grid = null;
      this._cache = null;
      this._applyName();
      this._syncForm();
      return;
    }
    root.setAttribute('data-layout-js', '');
    fillIconSlots(root, '.td-check-matrix__chevron');
    this._buildCache();
    this._bind();
    this._syncAll();
    this._applyName();
    this._syncForm();
  }

  /** @private references to every part (no selector ever built from data) */
  _buildCache() {
    const m = this._model;
    const C = m.columns.length;
    const grid = this._grid;
    const rows = [...grid.rows];
    const cells = new Array(m.rows.length * C).fill(null);
    const bulk = new Map();
    const groupBodies = [];
    for (const tr of rows) {
      const kind = tr.classList.contains('td-check-matrix__row') ? 'row' : null;
      if (kind) {
        const r = Number(tr.getAttribute('data-r'));
        bulk.set(`row:${r}`, tr.cells[0]);
        for (let c = 0; c < C; c++) cells[r * C + c] = tr.cells[2 + c];
      } else if (tr.classList.contains('td-check-matrix__grouprow')) {
        const g = Number(tr.parentElement.getAttribute('data-g'));
        groupBodies[g] = tr.parentElement;
        bulk.set(`group:${g}`, tr.cells[0]);
        for (let c = 0; c < C; c++) bulk.set(`group-column:${g}:${c}`, tr.cells[2 + c]);
      } else if (tr.classList.contains('td-check-matrix__bulkrow')) {
        bulk.set('all', tr.cells[0]);
        for (let c = 0; c < C; c++) bulk.set(`column:${c}`, tr.cells[2 + c]);
      }
    }
    const bar = this._root.querySelector('.td-check-matrix__bar');
    this._cache = {
      rows, cells, bulk, groupBodies,
      colHeads: rows[0] ? [...rows[0].cells].slice(2) : [],
      bar, colpick: bar.querySelector('select'), barBulk: bar.querySelector('.td-check-matrix__bulk'),
      note: this._root.querySelector('.td-check-matrix__note'),
      status: this._root.querySelector('[role="status"]'),
      scroll: this._root.querySelector('.td-check-matrix__scroll'),
    };
  }

  /** @private delegated listeners (one per event type, never per cell) */
  _bind() {
    const root = this._root;
    const stop = (e) => {
      if (e.target !== this) e.stopPropagation();
    };
    this.listen(root, 'input', stop);
    this.listen(root, 'change', (e) => {
      stop(e);
      this._onChange(e);
    });
    this.listen(root, 'click', (e) => this._onClick(e));
    this.listen(this._grid, 'keydown', (e) => this._onKey(e));
    this.listen(this._grid, 'focusin', (e) => this._onFocus(e));
    this.listen(this._grid, 'pointerdown', (e) => this._onPointer(e), { passive: true });
    this.listen(this._grid, 'pointerover', (e) => {
      if (e.pointerType === 'mouse') this._showNote(this._cellOf(e.target));
    }, { passive: true });
    this.listen(this._grid, 'pointerleave', () => this._showNote(this._activeCell()), { passive: true });
  }

  /** @private ResizeObserver: the active cell must stay reachable when the narrow mode switches on / off */
  _observeSize() {
    if (this._resizeObs || typeof ResizeObserver === 'undefined') return;
    let last = -1;
    this._resizeObs = new ResizeObserver((entries) => {
      const w = Math.round(entries[0].contentRect.width);
      if (w === last) return;
      last = w;
      this._ensureActiveVisible();
    });
    this._resizeObs.observe(this);
  }

  // --- state → DOM ------------------------------------------------------------------------------------------------

  /** @private everything that depends on the live state (idempotent: render, hydrate, re-bind) */
  _syncAll() {
    for (let i = 0; i < this._cache.cells.length; i++) this._paintCell(i);
    for (const [k] of this._cache.bulk) this._paintBulk(k);
    this._syncGroups();
    this._syncColumn();
    this._applyDisabled(); // + roving + FormData
  }

  /** @private one data cell: checked + changed mark */
  _paintCell(i) {
    const td = this._cache.cells[i];
    if (!td || isNa(this._model, i)) return;
    const input = td.firstElementChild;
    const on = this._state.on[i] === 1;
    if (input.checked !== on) input.checked = on;
    const changed = this._state.on[i] !== this._state.def[i];
    if (changed !== td.hasAttribute('data-changed')) td.toggleAttribute('data-changed', changed);
  }

  /** @private one bulk cell from its key (`all`, `row:r`, `column:c`, `group:g`, `group-column:g:c`) */
  _paintBulk(key) {
    const el = key === 'bar' ? this._cache.barBulk : this._cache.bulk.get(key);
    if (!el) return;
    const [kind, a, b] = key === 'bar' ? ['column', this._activeCol] : key.split(':');
    const s = this._state.bulkState(kind, Number(a || 0), Number(b || 0));
    const input = el.firstElementChild;
    input.checked = s.state === 'checked';
    input.indeterminate = s.state === 'mixed';
    const off = s.disabled || this._effectiveDisabled;
    if (input.disabled !== off) input.disabled = off;
  }

  /** @private bulk cells touched by a change of cells `idx` */
  _paintBulksFor(idx) {
    const m = this._model;
    const C = m.columns.length;
    const keys = new Set(['all', 'bar']);
    for (const i of idx) {
      const r = Math.floor(i / C);
      const c = i - r * C;
      const g = m.rows[r].group;
      keys.add(`row:${r}`).add(`column:${c}`);
      if (g >= 0) keys.add(`group:${g}`).add(`group-column:${g}:${c}`);
    }
    for (const k of keys) this._paintBulk(k);
  }

  /** @private host disabled / fieldset disabled, in place */
  _applyDisabled() {
    if (!this._live()) {
      this._syncForm();
      return;
    }
    const dis = this._effectiveDisabled;
    this._cache.cells.forEach((td, i) => {
      if (!td || isNa(this._model, i) || isLocked(this._model, i)) return;
      td.firstElementChild.disabled = dis;
    });
    for (const [k] of this._cache.bulk) this._paintBulk(k);
    this._paintBulk('bar');
    this._cache.colpick.disabled = dis;
    this._initRoving();
    this._syncForm();
  }

  /** @private collapse state → tbody + button (one function after render, hydrate and re-bind) */
  _syncGroups() {
    if (!this._live()) return;
    const active = this._activeCell();
    this._cache.groupBodies.forEach((tb, g) => {
      const shut = !!this._collapsed[g];
      tb.toggleAttribute('data-collapsed', shut);
      const btn = tb.querySelector('.td-check-matrix__group-toggle');
      btn.disabled = false;
      btn.setAttribute('aria-expanded', shut ? 'false' : 'true');
    });
    if (active && !visible(active)) {
      // the focused row was collapsed → the same column of its group row
      const tr = active.parentElement;
      const head = tr.parentElement.rows[0];
      const x = active.cellIndex;
      const hadFocus = this.contains(this.ownerDocument.activeElement);
      this._setActive(head.cells[x] || head.cells[1], hadFocus);
    }
  }

  /** @private narrow mode: data-col-active on every cell of the picked column + the bar */
  _syncColumn() {
    if (!this._live()) return;
    const C = this._model.columns.length;
    const j = this._activeCol;
    const mark = (el, on) => {
      if (el && on !== el.hasAttribute('data-col-active')) el.toggleAttribute('data-col-active', on);
    };
    for (const tr of this._cache.rows) for (let c = 0; c < C; c++) mark(tr.cells[2 + c], c === j);
    const sel = this._cache.colpick;
    if (sel.value !== String(j)) sel.value = String(j);
    const input = this._cache.barBulk.firstElementChild;
    input.setAttribute('aria-label', fillMatrixLabel(this._labels().column, { col: this._model.columns[j].label }));
    this._paintBulk('bar');
  }

  /** @private QĐ 16: the grid name always exists */
  _applyName() {
    const table = this._grid;
    const own = `${this.id}-label`;
    if (!table) return;
    const external = this.hasAttribute('label') ? [] : [...(this._internals?.labels || [])];
    if (external.length) {
      table.setAttribute('aria-labelledby', external.map((l) => {
        if (!l.id) l.id = `td-cm-lbl-${++labelIds}`;
        return l.id;
      }).join(' '));
      return;
    }
    table.setAttribute('aria-labelledby', own);
    if (!this.hasAttribute('label') && !this.getAttribute('aria-label')) this._warn('label', 'give the grid a `label` (or aria-label / <label for>)');
  }

  /** @private FormData (QĐ 10–13) */
  _syncForm() {
    if (!this._initialized) return;
    const name = this.getAttribute('name');
    let fd = null;
    let state = null;
    if (this._status === 'ready' && this._state && !this._nameBroken()) {
      state = this._state.encodeState();
      const entries = name !== null && !this._effectiveDisabled ? this._state.entries(name) : null;
      if (entries) {
        fd = new FormData();
        for (const [k, v] of entries) fd.append(k, v);
      }
    }
    this._setFormValue(fd, state);
  }

  /** @protected CSSOM scalar (QĐ 20 — the only per-instance style) */
  _applyStyles() {
    const v = this.getAttribute('max-height');
    let ok = null;
    if (v !== null) {
      ok = MAX_HEIGHT.test(v) && (typeof CSS === 'undefined' || !CSS.supports || CSS.supports('max-height', v)) ? v : null;
      if (!ok) this._warn('max-height', 'max-height must be `none` or a number + px / rem / em / vh / svh / dvh / lvh / % — ignored');
    }
    this._setOwnedStyle('--td-check-matrix-max-height', ok);
  }

  /** @private after a programmatic / reset / restore change of the whole state */
  _afterStateChange(diff) {
    if (this._live()) {
      for (let i = 0; i < this._cache.cells.length; i++) this._paintCell(i);
      for (const [k] of this._cache.bulk) this._paintBulk(k);
      this._paintBulk('bar');
    }
    this._syncForm();
    return diff;
  }

  // --- user actions -----------------------------------------------------------------------------------------------

  /** @private the data cell / bulk cell owning `el` */
  _cellOf(el) {
    const cell = el?.closest?.('td, th');
    return cell && this._grid?.contains(cell) ? cell : null;
  }

  /** @private `[row, col]` app keys of indexes */
  _pairs(list) {
    const m = this._model;
    const C = m.columns.length;
    return list.map((i) => [m.rows[Math.floor(i / C)].raw, m.columns[i % C].raw]);
  }

  /** @private */
  _onChange(e) {
    const input = e.target;
    if (this._live() && input === this._cache.colpick) {
      this._activeCol = Math.min(Math.max(0, Number(input.value) || 0), this._model.columns.length - 1);
      this._syncColumn();
      this._ensureActiveVisible();
      return;
    }
    if (!this._live() || !(input instanceof HTMLInputElement) || !input.classList.contains('td-check-matrix__input')) return;
    const holder = input.parentElement;
    const m = this._model;
    const C = m.columns.length;
    if (this._effectiveDisabled) {
      this._afterStateChange(null);
      return;
    }
    if (holder.classList.contains('td-check-matrix__cell')) {
      const r = Number(holder.parentElement.getAttribute('data-r'));
      const c = Number(holder.getAttribute('data-c'));
      const diff = this._state.toggleCell(r, c);
      this._paintCell(r * C + c);
      if (!diff) return;
      this._paintBulksFor([...diff.added, ...diff.removed]);
      this._syncForm();
      this._emitChange(diff, 'cell');
      return;
    }
    // a bulk cell: never one the user cannot see (narrow mode hides the row / group / all ones — QĐ 7, acceptance 4)
    const kind = holder.getAttribute('data-kind');
    let args;
    if (kind === 'column-active') args = ['column', this._activeCol];
    else if (kind === 'column') args = ['column', Number(holder.getAttribute('data-c'))];
    else if (kind === 'row') args = ['row', Number(holder.parentElement.getAttribute('data-r'))];
    else if (kind === 'group') args = ['group', Number(holder.parentElement.parentElement.getAttribute('data-g'))];
    else if (kind === 'group-column') args = ['group-column', Number(holder.parentElement.parentElement.getAttribute('data-g')), Number(holder.getAttribute('data-c'))];
    else if (kind === 'all') args = ['all'];
    if (!args || !visible(holder)) {
      this._paintBulk(kind === 'column-active' ? 'bar' : this._bulkKey(holder));
      return;
    }
    const diff = this._state.toggleSet(...args);
    const touched = [...diff.added, ...diff.removed];
    for (const i of touched) this._paintCell(i);
    for (const [k] of this._cache.bulk) this._paintBulk(k);
    this._paintBulk('bar');
    this._syncForm();
    if (touched.length) this._announce(fillMatrixLabel(this._labels().changed, { n: touched.length }));
    this._emitChange(diff, args[0]);
  }

  /** @private cache key of a bulk element */
  _bulkKey(holder) {
    for (const [k, el] of this._cache.bulk) if (el === holder) return k;
    return 'all';
  }

  /** @private */
  _emitChange(diff, trigger) {
    this.emit('change', { added: this._pairs(diff.added), removed: this._pairs(diff.removed), trigger });
  }

  /** @private */
  _announce(text) {
    const s = this._cache?.status;
    if (s) s.textContent = text;
  }

  /** @private group toggles + the column picker */
  _onClick(e) {
    if (!this._live()) return;
    const btn = e.target.closest?.('.td-check-matrix__group-toggle');
    if (btn && this._grid.contains(btn)) {
      const g = Number(btn.closest('tbody').getAttribute('data-g'));
      this._collapsed[g] = !this._collapsed[g];
      this._syncGroups();
      this._setActive(btn.parentElement, true);
      this.emit('expanded-change', { group: this._model.groups[g].raw, expanded: !this._collapsed[g] });
    }
  }

  /** @private */
  _onPointer(e) {
    const cell = this._cellOf(e.target);
    if (!cell) return;
    this._showNote(cell);
    // Safari never focuses a clicked checkbox: keep the roving stop on the cell the user touched
    this._setActive(cell, false);
  }

  /** @private */
  _onFocus(e) {
    const cell = this._cellOf(e.target);
    if (!cell) return;
    const target = this._targetOf(cell);
    if (target !== e.target && e.target === cell) {
      target.focus({ preventScroll: true });
      return;
    }
    this._setActive(cell, false);
    this._reveal(cell);
    this._showNote(cell);
  }

  /** @private the note line shows the note of the focused / touched / hovered cell (QĐ 17) */
  _showNote(cell) {
    const p = this._cache?.note;
    if (!p) return;
    const sr = cell?.classList.contains('td-check-matrix__cell') ? cell.querySelector(':scope > .td-sr-only[id]') : null;
    const text = sr ? sr.textContent : '';
    if (p.textContent !== text) p.textContent = text;
  }

  // --- roving tabindex + keys (QĐ 18) -----------------------------------------------------------------------------

  /** @private the focus point of a cell: an enabled input / the group button / the cell itself */
  _targetOf(cell) {
    const btn = cell.querySelector(':scope > .td-check-matrix__group-toggle');
    if (btn) return btn;
    const input = cell.querySelector(':scope > .td-check-matrix__input');
    return input && !input.disabled ? input : cell;
  }

  /** @private key of a cell position (survives a data change) */
  _keyOf(cell) {
    const tr = cell.parentElement;
    const m = this._model;
    let row = 'head';
    if (tr.classList.contains('td-check-matrix__bulkrow')) row = 'bulk';
    else if (tr.classList.contains('td-check-matrix__row')) row = `r:${m.rows[Number(tr.getAttribute('data-r'))].key}`;
    else if (tr.classList.contains('td-check-matrix__grouprow')) row = `g:${m.groups[Number(tr.parentElement.getAttribute('data-g'))].key}`;
    const x = cell.cellIndex;
    const col = x === 0 ? 'bulk' : x === 1 ? 'label' : `c:${m.columns[x - 2].key}`;
    return { row, col };
  }

  /** @private the cell of a key position, or null */
  _cellAt(key) {
    if (!key || !this._live()) return null;
    const m = this._model;
    let tr = null;
    if (key.row === 'head') tr = this._cache.rows[0];
    else if (key.row === 'bulk') tr = this._cache.rows[1];
    else if (key.row.startsWith('r:')) {
      const r = m.rowIndex.get(key.row.slice(2));
      tr = r === undefined ? null : this._cache.cells[r * m.columns.length]?.parentElement || null;
    } else {
      const g = m.groupIndex.get(key.row.slice(2));
      tr = g === undefined ? null : this._cache.groupBodies[g]?.rows[0] || null;
    }
    if (!tr) return null;
    let x = key.col === 'bulk' ? 0 : key.col === 'label' ? 1 : null;
    if (x === null) {
      const c = m.colIndex.get(key.col.slice(2));
      x = c === undefined ? null : c + 2;
    }
    return x === null ? null : tr.cells[x] || null;
  }

  /** @private the active cell */
  _activeCell() {
    return this._cellAt(this._activeKey);
  }

  /** @private the active focus point */
  _activeTarget() {
    const cell = this._activeCell();
    return cell ? this._targetOf(cell) : null;
  }

  /** @private one tabindex=0 in the grid; every other focus point -1 */
  _initRoving() {
    if (!this._live()) return;
    let cell = this._activeCell();
    if (!cell) {
      const first = this._cache.cells.find(Boolean);
      cell = first || this._cache.rows[0].cells[2];
    }
    for (const el of this._grid.querySelectorAll('[tabindex="0"]')) el.setAttribute('tabindex', '-1');
    this._activeKey = this._keyOf(cell);
    this._targetOf(cell).setAttribute('tabindex', '0');
    this._crosshair(cell);
  }

  /** @private move the roving stop (and the focus) */
  _setActive(cell, focus) {
    if (!cell || !this._live()) return;
    const prev = this._activeTarget();
    const next = this._targetOf(cell);
    if (prev && prev !== next) prev.setAttribute('tabindex', '-1');
    next.setAttribute('tabindex', '0');
    this._activeKey = this._keyOf(cell);
    this._crosshair(cell);
    if (focus && this.ownerDocument.activeElement !== next) {
      next.focus({ preventScroll: true });
      this._reveal(cell);
    }
  }

  /** @private header of the active column carries data-active (the row uses :focus-within) */
  _crosshair(cell) {
    const x = cell.cellIndex - 2;
    this._cache.colHeads.forEach((th, c) => {
      if ((c === x) !== th.hasAttribute('data-active')) th.toggleAttribute('data-active', c === x);
    });
  }

  /** @private keep a focused cell out from under the sticky header / first columns (QĐ 20) */
  _reveal(cell) {
    const sc = this._cache?.scroll;
    if (!sc || !visible(cell)) return;
    const r = cell.getBoundingClientRect();
    const box = sc.getBoundingClientRect();
    const head = this._grid.tHead?.getBoundingClientRect();
    const rtl = getComputedStyle(this).direction === 'rtl';
    const tr = cell.parentElement;
    const inHead = tr.parentElement === this._grid.tHead;
    const sticky = cell.cellIndex >= 2 ? tr.cells[1].getBoundingClientRect() : null;
    const top = inHead || !head ? box.top : Math.max(box.top, head.bottom);
    if (r.top < top) sc.scrollTop -= top - r.top;
    else if (r.bottom > box.bottom) sc.scrollTop += Math.min(r.bottom - box.bottom, r.top - top);
    if (sticky) {
      if (!rtl && r.left < sticky.right) sc.scrollLeft -= sticky.right - r.left;
      else if (rtl && r.right > sticky.left) sc.scrollLeft += r.right - sticky.left;
    }
    if (!rtl && r.right > box.right) sc.scrollLeft += r.right - box.right;
    else if (rtl && r.left < box.left) sc.scrollLeft -= box.left - r.left;
  }

  /** @private the active cell is hidden (narrow mode switched on, picked column changed) → nearest visible one */
  _ensureActiveVisible() {
    if (!this._live()) return;
    const cell = this._activeCell();
    if (!cell || visible(cell)) return;
    const tr = cell.parentElement;
    const want = tr.cells[this._activeCol + 2];
    const next = visible(want) ? want : [...tr.cells].find(visible) || this._cache.rows[0].cells[1];
    const hadFocus = this.contains(this.ownerDocument.activeElement);
    this._setActive(next, hadFocus);
  }

  /** @private */
  _onKey(e) {
    if (!this._live() || e.altKey || e.metaKey) return;
    const cell = this._cellOf(e.target);
    if (!cell) return;
    const rows = this._cache.rows;
    const tr = cell.parentElement;
    let y = rows.indexOf(tr);
    const x = cell.cellIndex;
    const rtl = getComputedStyle(this).direction === 'rtl';
    const shown = (yy) => visible(rows[yy]);
    const inRow = (yy, from, step) => {
      for (let xx = from; xx >= 0 && xx < rows[yy].cells.length; xx += step) if (visible(rows[yy].cells[xx])) return rows[yy].cells[xx];
      return null;
    };
    const vert = (from, step, count) => {
      let last = null;
      let n = 0;
      for (let yy = from + step; yy >= 0 && yy < rows.length; yy += step) {
        if (!shown(yy) || !visible(rows[yy].cells[x])) continue;
        last = rows[yy].cells[x];
        if (++n >= count) break;
      }
      return last;
    };
    let next = null;
    const k = e.key;
    if (k === 'ArrowRight' || k === 'ArrowLeft') {
      if (e.ctrlKey) return;
      const step = (k === 'ArrowRight') !== rtl ? 1 : -1;
      next = inRow(y, x + step, step);
    } else if (k === 'ArrowDown') next = vert(y, 1, 1);
    else if (k === 'ArrowUp') next = vert(y, -1, 1);
    else if (k === 'PageDown') next = vert(y, 1, PAGE);
    else if (k === 'PageUp') next = vert(y, -1, PAGE);
    else if (k === 'Home' || k === 'End') {
      const first = k === 'Home';
      if (e.ctrlKey) {
        y = first ? 0 : rows.length - 1;
        while (y >= 0 && y < rows.length && !shown(y)) y += first ? 1 : -1;
        if (y < 0 || y >= rows.length) return;
      }
      next = first ? inRow(y, 0, 1) : inRow(y, rows[y].cells.length - 1, -1);
    } else if (k === ' ' || k === 'Spacebar') {
      // Space on an input / button is native; on a locked / n/a / label cell: nothing (no page scroll)
      if (e.target === cell) e.preventDefault();
      return;
    } else return;
    e.preventDefault();
    if (next) this._setActive(next, true);
  }

  // --- form lifecycle (QĐ 14) -------------------------------------------------------------------------------------

  formResetCallback() {
    this._flush();
    if (!this._state) return;
    const diff = this._state.setAll(this._state.def);
    // form.reset() resets the inner checkboxes AFTER this callback (tree order): repaint once it is done
    queueMicrotask(() => {
      this._afterStateChange(diff);
      this._emitChange(diff, 'reset');
    });
    this._syncForm();
  }

  _restoreState(state) {
    this._flush();
    if (!this._state || !this._raw) return;
    const on = decodeMatrixState(state, this._raw);
    if (!on) {
      this._warn('restore', 'restored form state does not match the data — ignored');
      return;
    }
    this._state.setAll(on);
    this._afterStateChange(null);
  }

  /** @protected label click / focus() → the tab stop */
  _focusTarget() {
    return this._live() ? this._activeTarget() : null;
  }

  // --- SSR (contract check-matrix@1, plan QĐ 29) -------------------------------------------------------------------

  /**
   * Marker `check-matrix@1` + a valid `data` attribute + EVERY node equal to renderMatrix({ ssr }) of that data (the
   * no-JS form included) → adopt in place. Anything else → safe render from `data` (no value is ever taken from the
   * markup) + the focus back on the matching cell.
   * @returns {boolean}
   */
  canHydrate() {
    const m = ssrMarker(this);
    if (!m || m.name !== 'check-matrix') return false;
    const early = this._earlyData && ['columns', 'rows', 'cells'].some((k) => this._earlyData.has(k));
    const ok = m.schema === this.constructor.SSR_SCHEMA && !early && this._status === 'ready' && !this._nameBroken()
      && this.hasAttribute('name') && this._ssrGate();
    if (ok) return true;
    if (this._status === 'ready') console.warn('td-check-matrix: server markup does not match its data — rendered again');
    const active = this.ownerDocument.activeElement;
    if (active && active !== this && this.contains(active)) {
      const cell = active.closest('td, th');
      const tr = cell?.parentElement;
      this._ssrRestore = { refocus: { r: tr?.getAttribute('data-r'), c: cell?.getAttribute('data-c') } };
    }
    this._ssrFreshRender = true;
    return false;
  }

  /** @private compare every node with the expected server markup */
  _ssrGate() {
    const model = this._model;
    const tpl = document.createElement('template');
    tpl.innerHTML = renderMatrix({
      ...this._renderOpts(model, model.value, model.groups.map((g) => g.collapsed), { name: this.getAttribute('name') }),
      disabled: this.hasAttribute('disabled'), // the server only knows the attribute (a <fieldset disabled> applies after)
    });
    const want = [...tpl.content.childNodes];
    const have = [...this.childNodes].filter((n) => n.nodeType === 1 || (n.nodeType === 3 && n.data.trim()) || n.nodeType === 8);
    if (have.some((n) => n.nodeType === 8)) return false;
    if (have.length !== want.length) return false;
    return have.every((n, i) => this._ssrSame(n, want[i]));
  }

  /** @private one node equals its expected twin (attributes exactly, text exactly; the icon slot holds one safe SVG) */
  _ssrSame(live, want) {
    if (live.nodeType !== want.nodeType) return false;
    if (live.nodeType === 3) return live.data === want.data;
    if (live.nodeType !== 1 || live.localName !== want.localName || live.namespaceURI !== want.namespaceURI) return false;
    if (live.attributes.length !== want.attributes.length) return false;
    for (const a of want.attributes) {
      if (!live.hasAttribute(a.name)) return false;
      if (a.name === 'class' ? ssrClassKey(live) !== ssrClassKey(want) : live.getAttribute(a.name) !== a.value) return false;
    }
    if (want.hasAttribute('data-td-icon')) return this._ssrIcon(live);
    const a = [...live.childNodes].filter((n) => n.nodeType !== 3 || n.data !== '');
    const b = [...want.childNodes];
    return a.length === b.length && a.every((n, i) => this._ssrSame(n, b[i]));
  }

  /** @private the chevron slot: nothing, or exactly one inline SVG of allowlisted shapes / attributes */
  _ssrIcon(slot) {
    const kids = [...slot.childNodes].filter((n) => n.nodeType !== 3 || n.data.trim());
    if (!kids.length) return true;
    if (kids.length !== 1) return false;
    const ok = (el) => el.nodeType === 1 && el.namespaceURI === SVG_NS && SVG_TAGS.has(el.localName)
      && [...el.attributes].every((a) => SVG_ATTRS.has(a.name))
      && [...el.childNodes].every((n) => (n.nodeType === 3 && !n.data.trim()) || (n.nodeType === 1 && n.localName !== 'svg' && ok(n)));
    return kids[0].localName === 'svg' && ok(kids[0]);
  }

  /** Adopt the server markup in place: live ticks of the free cells (early `value` wins), FormData FIRST, then the no-JS form goes. */
  hydrateExisting() {
    const m = this._model;
    const C = m.columns.length;
    const on = Uint8Array.from(this._state.on);
    const earlyValue = this._earlyData?.has('value');
    for (const tr of this.querySelectorAll('tr.td-check-matrix__row')) {
      const r = Number(tr.getAttribute('data-r'));
      for (let c = 0; c < C; c++) {
        const i = r * C + c;
        if (isNa(m, i) || isLocked(m, i) || earlyValue) continue;
        on[i] = tr.cells[2 + c].firstElementChild.checked ? 1 : 0;
      }
    }
    this._state.setAll(on);
    this._root = this.querySelector(':scope > .td-check-matrix');
    this._grid = this._root.querySelector('.td-check-matrix__grid');
    this._syncForm(); // ElementInternals FIRST…
    // …then the no-JS form: markers / sentinel / locked hidden inputs go, checkboxes lose name / value (one set of entries)
    for (const el of [...this.children]) if (el.localName === 'input') el.remove();
    for (const el of this._root.querySelectorAll('input[type="hidden"]')) el.remove();
    for (const el of this._root.querySelectorAll('input[name]')) {
      el.removeAttribute('name');
      el.removeAttribute('value');
    }
  }

  /** Re-connect: re-bind in place while the parts are still ours (else safe render from the state). */
  canRebind() {
    if (this._stale) return false; // the data / status changed while detached: render it
    const root = this._root;
    if (!root || root.parentNode !== this || this.children.length !== 1) return false;
    if (this._status !== 'ready') return true;
    const expected = this._cache ? this._cache.cells.filter(Boolean).length : -1;
    const inputs = root.querySelectorAll('input, select, textarea, button, object, output, fieldset');
    const grid = root.querySelectorAll('td.td-check-matrix__cell').length;
    return grid === expected && [...inputs].every((el) => !el.hasAttribute('name') && !el.hasAttribute('form'));
  }

  /** @protected refused server markup was replaced: focus back on the matching cell */
  _restoreSsrState(s) {
    if (!s?.refocus || !this._live()) return;
    const { r, c } = s.refocus;
    const C = this._model.columns.length;
    const ri = Number(r);
    const ci = Number(c);
    const cell = r != null && c != null && ri >= 0 && ri < this._model.rows.length && ci >= 0 && ci < C
      ? this._cache.cells[ri * C + ci] : null;
    const target = cell || this._cache.cells.find(Boolean) || this._cache.rows[0].cells[2];
    this._setActive(target, true);
  }
}

if (!customElements.get('td-check-matrix')) customElements.define('td-check-matrix', TdCheckMatrix);
