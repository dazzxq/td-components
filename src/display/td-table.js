import { TdBaseElement } from '../base/td-base-element.js';
import { safeCssDimension, applyStyles } from '../utils/css-safe.js';
import { tdIcon, hasIcon, fillIconSlots } from '../icons/td-icon.js';
import { TdMenu } from '../feedback/td-menu.js';
import { cardRoles } from '../utils/table-card-role.js';
import { KeySelection, keyId } from '../utils/key-selection.js';
import { checkMarkHTML } from '../utils/check-mark.js';
import './td-pagination.js';
import './td-empty-state.js';

/** `cellPaddingClass` vocabulary (dcms, Tailwind names) → `td-table__cell--px-{n}`. Lookup keys only (D15). */
const CELL_PADDING = { 'px-0': 0, 'px-1': 1, 'px-2': 2, 'px-3': 3, 'px-4': 4, 'px-5': 5, 'px-6': 6 };
const ALIGN = ['left', 'center', 'right', 'justify'];
const OFF = new Set(['false', '0', 'off']);
/** `actions[].variant` whitelist → `td-btn--{variant}` (anything else → secondary). */
const ACTION_VARIANTS = new Set(['primary', 'secondary', 'success', 'danger', 'warning', 'info', 'ghost']);
/** More visible actions than this → card mode shows one "Thao tác" menu button instead (QĐ 18). */
const CARD_INLINE_ACTIONS = 2;
/** Attributes whose change rebuilds the structure; every other observed attribute updates in place (D11). */
const STRUCTURAL = new Set(['title', 'heading-level', 'zebra', 'max-height']);
/** v0.37.0: `selectable` values that turn row selection off (absent attribute = off too). */
const SELECT_OFF = new Set(['none', 'false', '0', 'off']);
/** Max length of a row name in the selection control's aria-label (QĐ 7). */
const ROW_LABEL_MAX = 80;
/** Row-selection controls (delegated listeners). */
const SELECT_CTL = '.td-table__select, .td-table__select-all';

let seq = 0;

/**
 * A label template with `{name}` placeholders (TdTable.labels). Replaced by a FUNCTION so `$&` / `$1` in row data stay
 * literal text.
 * @param {unknown} template @param {Record<string, unknown>} vars
 */
function fill(template, vars) {
  return String(template ?? '').replace(/\{(\w+)\}/g, (m, k) => (Object.hasOwn(vars, k) ? String(vars[k]) : m));
}

/**
 * Review SEC-1: the `row-key` field of a row, read without trusting shared prototypes. Own properties first, then the
 * row's own prototype chain (class-instance getters) — anything that would resolve from `Object.prototype` (or a
 * built-in prototype after it) is ignored, so a polluted `Object.prototype.id` never becomes a key. A throwing getter /
 * proxy trap → `undefined` (the row cannot be selected).
 * @param {object} row @param {string} field
 */
function readKeyField(row, field) {
  try {
    for (let o = row; o && o !== Object.prototype && o !== Function.prototype && o !== Array.prototype; o = Object.getPrototypeOf(o)) {
      const d = Object.getOwnPropertyDescriptor(o, field);
      if (!d) continue;
      if ('value' in d) return d.value;
      return typeof d.get === 'function' ? d.get.call(row) : undefined;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

/** Visible text of a body cell (the aria-hidden card label excluded), whitespace collapsed, ≤ ROW_LABEL_MAX chars. */
function cellText(td) {
  let text = '';
  for (const n of td.childNodes) {
    if (n.nodeType === 1 && n.classList.contains('td-table__cell-label')) continue;
    text += n.textContent;
  }
  return Array.from(text.replace(/\s+/g, ' ').trim()).slice(0, ROW_LABEL_MAX).join('').trim();
}

/**
 * A developer CSS value for `max-height`, or '' (D14): it must parse as a `max-height` and must not pull in
 * url()/var() or break out of the declaration. Same rule as TdModal's `cssValue`.
 * @param {unknown} value
 * @returns {string}
 */
function safeMaxHeight(value) {
  if (value === null || value === undefined) return '';
  const v = String(value).trim();
  if (!v) return '';
  const ok = v.length <= 200 && !/url\(|var\(|image-set\(|[;{}]/i.test(v)
    && typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('max-height', v);
  return ok ? v : '';
}

/**
 * Data table — token-native (v0.10.0). Styles: td.css (`components/table.css`, block `.td-table`). Content layer:
 * solid surface, hairline rows, no glass (the sticky header fill is opaque).
 *
 * Markup (structure rendered once; data, sort, page, loading and counts are updated IN PLACE — D11):
 * `div.td-table[.td-table--zebra|--fixed|--scroll-y][data-state=ready|loading|empty]`
 *   > `div.td-table__header` (`h{n}.td-table__title#{host}-title` + `div.td-table__pagination > td-pagination[quiet]`)
 *   > `div.td-table__scroll` (focusable named `role=region` only while it overflows)
 *     > `table.td-table__table[role=table][aria-labelledby|aria-label][aria-busy]` > `thead.td-table__head[role=rowgroup]`
 *       > `tr[role=row]` > `th.td-table__th[role=columnheader][scope=col][data-col][data-col-key][data-card][aria-sort]`
 *       (sortable → `button.td-table__sort[data-sort-col]`) + `tbody.td-table__body[role=rowgroup]`
 *       (`tr.td-table__row[role=row][data-row-idx] > td.td-table__cell[role=cell][data-col][data-col-key][data-card]
 *       > span.td-table__cell-label[aria-hidden=true]` + value; actions column → `div.td-table__actions`)
 *   > `div.td-table__footer > td-pagination` > `p.td-sr-only[role=status]` (loading text).
 * Sorting, paging and data loads keep `thead` and both paginations, so focus stays on the activated control and the
 * bottom pagination's live region announces each page once (the top one is `quiet`).
 * v0.34.0 card mode (QĐ 15–20) is PURE CSS on the same DOM: the host is `container: td-table / inline-size`; `layout`
 * / `card-below` are read by td.css only (no re-render on resize or attribute change). The explicit roles keep the
 * table semantics when card mode changes `display`; the cell labels are aria-hidden (the columnheader names a cell).
 *
 * @element td-table
 * @attr {number} per-page - Items per page (default 10)
 * @attr {string} active-color - Pagination current-page colour (safeColor; default: td-pagination's token)
 * @attr {string} zebra - Striped rows, default ON; off only with `zebra="false"|"0"|"off"`
 * @attr {boolean} loading - Loading state: `aria-busy`, status text, deterministic skeleton rows, paginations hidden
 * @attr {number} loading-rows - Number of skeleton rows (default 5)
 * @attr {string} title - Table title (a heading that names the table). Also the global HTML attribute → browsers show
 *   it as a tooltip over the component.
 * @attr {number} heading-level - Heading level of the title, 2–6 (default 3); the empty state uses level + 1
 * @attr {string} aria-label - Accessible name when there is no title (fallback: `TdTable.labels.table`)
 * @attr {string} empty-title - Empty-state heading (default 'Không có dữ liệu')
 * @attr {string} empty-text - Empty-state message (default 'Chưa có dữ liệu để hiển thị.')
 * @attr {boolean} server-mode - Rows are one server page: no client sort/slice; `data` keeps the current page
 * @attr {number} total-items - Server mode total (REQUIRED in server mode — without it the rows render, both
 *   paginations stay hidden and one console warning is printed)
 * @attr {string} max-height - Any CSS `max-height` (e.g. `320px`, `50vh`): the table scrolls inside and the header is
 *   sticky (validated with `CSS.supports`; url()/var() rejected)
 * @attr {string} layout - `auto` (default: cards when the host is narrower than `card-below`) | `table` (always a
 *   table with horizontal scroll — pre-0.34 behaviour, no container) | `cards` (always cards). CSS only.
 * @attr {string} card-below - `sm` (480) | `md` (720, default) | `lg` (1024): container width under which `auto` shows
 *   cards. CSS only.
 * @attr {string} selectable - v0.37.0 row selection: `multiple` (also empty / unknown values) | `single`; absent /
 *   `none` / `false` / `0` / `off` = off. Needs `rowKey` (no key → no selection column + one warning, fail closed).
 * @attr {string} row-key - Field name of the row key (or the `rowKey` property: name or `(row) => key`)
 * @attr {number} max-selected - Cap (integer ≥ 1) on USER selection in `multiple` mode; the API is never capped
 * @attr {string} name - Form field name: the selected keys are submitted (one entry per key, `String(key)`)
 * @attr {boolean} disabled - Locks the selection controls (selection kept; nothing submitted)
 *
 * @property {Array<Object>} columns - Column definitions: `{ key, label, sortable?, width?, widthType?:
 *   'fixed'|'flexible', minWidth?, maxWidth?, align?: 'left'|'center'|'right'|'justify', ellipsis?, nowrap?,
 *   card?: 'lead'|'primary'|'secondary'|'meta'|'actions'|false, actions?, render? }`.
 *   `width` is applied ONLY with `widthType: 'fixed'` (width = min = max); the default `'flexible'` ignores it and
 *   uses `minWidth`/`maxWidth` (width `auto`). `table-layout: fixed` only when EVERY column is fixed (v0.34.0).
 *   `nowrap` (default true for `align: 'right'`) keeps the value on one line. `card` = role on a card (default:
 *   first column primary — or `lead` when another column declares `card: 'primary'` (v0.36.1) —, an `actions` column
 *   actions, others secondary; `false` = not on the card). `lead` = a short identifier (ID, code) before the primary
 *   on the card's first line, muted, no label.
 *   `actions: [{ id, label, icon?, variant?, hidden?(row), disabled?(row) }]` → small `td-btn` buttons (labels are
 *   text, `variant` whitelisted, `icon` a registry name); in card mode more than 2 visible actions collapse into one
 *   menu button (`TdTable.labels.actions`, TdMenu). v0.36.1: in card mode a button whose action has a valid `icon`
 *   (and the menu button) shows ONLY the icon — the text stays in the DOM (visually hidden) and names the button. A throwing `hidden` / `disabled` counts as true.
 *   `label` and plain values are always escaped; `width`/`minWidth`/`maxWidth` pass `safeCssDimension`, `align` a
 *   whitelist, all applied via CSSOM. Columns are resolved by INDEX (keys may repeat, be numeric or missing).
 *   `ellipsis: true` → one line, truncated at `maxWidth` or `--td-table-ellipsis-max` (18rem), full text in `title`.
 *   `render(row, rowIdxInPage)` — TRUSTED HATCH: return a Node (preferred, appended), a string (**trusted HTML**,
 *   developer markup only, injected with innerHTML — escape any end-user data inside it yourself; its CSP
 *   compliance is the consumer's responsibility) or anything else (text); it is appended after the cell's card label. A render column sorts by `row[key]`.
 *   A `render` that throws leaves that cell empty (`console.error`); the rest of the table still renders.
 * @property {Array<Object>} data - Rows. Client mode: resets to page 1. Server mode: keeps the current page.
 * @property {string} cellPaddingClass - Cell horizontal padding, one of `px-0`…`px-6` (dcms vocabulary) → the
 *   `td-table__cell--px-{n}` modifier on header, data and skeleton cells; anything else is ignored (one warning).
 * @property {Function} onSort - `({key, direction})` after a sort change — SERVER MODE ONLY (sort on the server);
 *   in client mode the table sorts itself and only `sort-change` fires
 * @property {Function} onPageChange - `(page)` — SERVER MODE ONLY (fetch that page, then set `data`); in client mode
 *   the table pages itself (listen to `page-change` if needed). A throwing `onSort`/`onPageChange` is logged
 *   (`console.error`) and the table state stays consistent.
 * @fires sort-change - `{ key, direction }` (direction `'asc'|'desc'|null`), bubbling, before `onSort`
 * @fires page-change - from the inner td-pagination elements, `{ page }` (bubbles through the host)
 * @fires row-action - `{ id, row, rowIndex }` (rowIndex = index in the current page, like `render`), bubbling, then
 *   `onRowAction(detail)` (property; a throw is logged)
 *
 * v0.37.0 row selection (plan v0.37.0-table-row-selection, ADR 0018): the table stays `role="table"` (no APG grid);
 * each row gets `td.td-table__cell--select.td-table__card-select > button.td-table__select[role=checkbox][aria-checked]`
 * (both modes — `single` is an EXCLUSIVE checkbox, never role=radio) holding the shared `.td-check` mark; `multiple`
 * adds `th.td-table__th--select > button.td-table__select-all[role=checkbox][aria-checked=false|true|mixed]` (this
 * page only). Selected rows carry `[data-selected]` (CSS only; no aria-selected in a table). Identity = `String(key)`,
 * the original key is returned; the key never reaches the DOM (row ↔ key via `data-row-idx`). The selection lives
 * across pages / sort / `data`; events only for user changes (or `{ emit: true }`). The element is form-associated
 * (NOT a TdFormElement): with `name`, the keys are its form value.
 * @property {string|Function} rowKey - Row key: field name or `(row) => key` (valid: non-empty string, finite number,
 *   bigint). A throwing function / invalid / duplicate key → that row cannot be selected (one warning per kind).
 * @property {Function} rowSelectable - `(row) => boolean`; false or a throw → the row's control is locked (API can
 *   still select it)
 * @property {Array} selectedKeys - Original keys in selection order; set = replace (no event; `single` keeps the last)
 * @property {Array<Object>} selectedRows - Known rows of the selected keys (read only; never-seen keys are skipped)
 * @property {Function} onSelectChange - `(keys)` before `select-change` (a throw is logged)
 * @fires select-change - `{ keys, added, removed, trigger: 'toggle'|'range'|'page'|'reset'|'api' }`
 * @fires select-limit - `{ max }` — a USER add stopped at `max-selected`
 *
 * v0.39.0 external filters + controlled mode (plan v0.39.0-filters-range QĐ 1–5): the table STATE is
 * `{ page, perPage, sort: { key, direction }, filters }` — `filters` is opaque to the kit (shallow-copied + frozen;
 * the kit never filters rows, not even in client mode). Every user page / sort change and every `setFilters()` fires
 * `request-change` `{ state, reason: 'page'|'sort'|'filters', requestId }` (`state` = the REQUESTED state, frozen;
 * `requestId` counts up per table) after `sort-change` / `page-change` and before `onSort` / `onPageChange`.
 * (`'per-page'` is a reserved reason: the kit has no per-page UI.) URL / history sync is the app's.
 * @attr {boolean} controlled - With `server-mode` only (else one warning, ignored): the table never applies a page /
 *   sort itself — it fires `request-change`, shows the skeleton (`loading`, aria-busy; the paginations stay so focus
 *   stays on the activated control) and waits for `setState()`.
 * @fires request-change - `{ state, reason, requestId }`
 */
export class TdTable extends TdBaseElement {
  /** Site-overridable strings. */
  static labels = {
    table: 'Bảng dữ liệu',
    loading: 'Đang tải dữ liệu…',
    paginationTop: 'Phân trang (trên)',
    paginationBottom: 'Phân trang (dưới)',
    itemLabel: 'mục',
    emptyTitle: 'Không có dữ liệu',
    emptyText: 'Chưa có dữ liệu để hiển thị.',
    actions: 'Thao tác',
    // v0.37.0 row selection. `{label}` = the row's name (its primary cell text, else rowFallback).
    selectRow: 'Chọn {label}',
    rowFallback: 'dòng {n}',
    selectAll: 'Chọn tất cả trên trang',
    selectColumn: 'Chọn',
    selectedCount: 'Đã chọn {n} dòng',
    selectedRow: 'Đã chọn {label}',
    deselected: 'Đã bỏ chọn',
    selectLimit: 'Tối đa {max} dòng',
  };

  /** v0.37.0 (ADR 0018): form-associated for the optional `name` (the selected keys). NOT a TdFormElement. */
  static formAssociated = true;

  static get observedAttributes() {
    return ['per-page', 'active-color', 'zebra', 'loading', 'loading-rows', 'title', 'heading-level', 'aria-label',
      'empty-title', 'empty-text', 'server-mode', 'total-items', 'max-height',
      'selectable', 'row-key', 'max-selected', 'name', 'disabled', 'controlled', 'column-menu', 'min-visible'];
  }

  // `zebra` is tri-state (default ON), so it is NOT a boolean attribute — see the `zebra` accessor.
  static get booleanAttributes() {
    return ['loading', 'server-mode', 'disabled', 'controlled', 'column-menu'];
  }

  constructor() {
    super();
    this._columns = [];
    this._data = [];
    this._onSort = null;
    this._onPageChange = null;
    this._onRowAction = null;
    /** Rows of the rendered page (row-action → `row`). */
    this._pageRows = [];
    /** Sorted column by INDEX (fixes numeric/duplicate keys). */
    this._sort = { col: null, direction: null };
    this._currentPage = 1;
    this._cellPadding = null;
    this._warned = new Set();
    this._ro = null;
    this._refocusPagination = null;
    // v0.37.0 row selection
    this._sel = new KeySelection();
    this._rowKeyFn = null;
    this._rowSelectable = null;
    this._onSelectChange = null;
    /** Anchor of a Shift range: the key IDENTITY of the last user-toggled row. */
    this._anchor = null;
    /** Per rendered row: original key (null = cannot be selected), enabled flag, name for labels / announcements. */
    this._pageKeys = [];
    this._pageEnabled = [];
    this._pageLabels = [];
    /** Selected rows seen on a rendered page (server mode / filtered data): id → row. */
    this._rowCache = new Map();
    /** Client mode: id → row of `data`, built lazily. */
    this._dataIndex = null;
    this._selOn = false;
    this._formDisabled = false;
    // v0.39.0 external filters + controlled mode
    /** Opaque filters (frozen shallow copy). */
    this._filters = Object.freeze({});
    /** requestId of the latest `request-change` (0 = none yet). */
    this._reqSeq = 0;
    /** Controlled: a request is in flight (loading keeps the paginations; set by `_request`, cleared by data). */
    this._awaiting = false;
    /** Controlled: the sort (by index) of the latest request, so a second click cycles from it. */
    this._reqSort = null;
    /** A page change waiting for the end of its click (`_flushPage`). */
    this._pendingPage = null;
    /** `setState({ sort })` before the columns are known: resolved by key when they arrive. */
    this._pendingSortKey = null;
    /** `setState()` in progress: attribute updates do not re-render until it ends (one atomic update). */
    this._batching = false;
    this._internals = null;
    if (typeof this.attachInternals === 'function') {
      try { this._internals = this.attachInternals(); } catch { this._internals = null; }
    }
    // Delegated listeners live for the element's lifetime (survive re-renders and reconnects).
    this.addEventListener('click', (e) => this._onClick(e));
    this.addEventListener('page-change', (e) => this._onPaginationChange(e));
    this.addEventListener('keydown', (e) => this._onSelectKeydown(e));
    this.addEventListener('keyup', (e) => this._onSelectKeyup(e));
    this.addEventListener('mousedown', (e) => this._onSelectMousedown(e));
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._ro?.disconnect();
    this._ro = null;
  }

  // --- JS properties ---

  get columns() { return this._columns; }
  set columns(val) {
    this._columns = Array.isArray(val) ? val : [];
    this._resetStaleSort();
    this._resolvePendingSort();
    if (this._initialized) this._doRender();
  }

  get data() { return this._data; }
  set data(val) { this.setData(val); }

  get onSort() { return this._onSort; }
  set onSort(fn) { this._onSort = typeof fn === 'function' ? fn : null; }

  get onPageChange() { return this._onPageChange; }
  set onPageChange(fn) { this._onPageChange = typeof fn === 'function' ? fn : null; }

  get onRowAction() { return this._onRowAction; }
  set onRowAction(fn) { this._onRowAction = typeof fn === 'function' ? fn : null; }

  // --- v0.37.0 row selection: properties ---

  /** Field name (the `row-key` attribute) or `(row) => key`. Changing it clears the selection (identity changed). */
  get rowKey() { return this._rowKeyFn || this.getAttribute('row-key') || null; }
  set rowKey(v) {
    const prevFn = this._rowKeyFn;
    if (typeof v === 'function') {
      this._rowKeyFn = v;
      if (v !== prevFn) this._rowKeyChanged();
      return;
    }
    this._rowKeyFn = null;
    const name = v == null ? '' : String(v).trim();
    const before = this.getAttribute('row-key');
    if (name) this.setAttribute('row-key', name);
    else this.removeAttribute('row-key');
    // attributeChangedCallback covers an attribute change; a function → the same name needs the reset here
    if (prevFn && before === (name || null)) this._rowKeyChanged();
  }

  get rowSelectable() { return this._rowSelectable; }
  set rowSelectable(fn) {
    this._rowSelectable = typeof fn === 'function' ? fn : null;
    if (this._initialized) this._update();
  }

  get onSelectChange() { return this._onSelectChange; }
  set onSelectChange(fn) { this._onSelectChange = typeof fn === 'function' ? fn : null; }

  /** Original keys in selection order (all pages). Set = replace, no event (`single` keeps the last valid key). */
  get selectedKeys() { return this._sel.keys(); }
  set selectedKeys(list) { this._commitSel(this._sel.replace(list), 'api', false); }

  /** Known rows of the selected keys, selection order; a key whose row was never seen is skipped. */
  get selectedRows() {
    const out = [];
    for (const id of this._sel.ids()) {
      const di = this._isServerMode() ? undefined : this._dataRows().get(id);
      const row = (di === undefined ? undefined : this._data[di]) ?? this._rowCache.get(id);
      if (row !== undefined) out.push(row);
    }
    return out;
  }

  /** `layout` attribute (`auto` | `table` | `cards`) — CSS only, never re-renders. */
  get layout() {
    const v = (this.getAttribute('layout') || '').trim();
    return v === 'table' || v === 'cards' ? v : 'auto';
  }
  set layout(v) {
    if (v === 'table' || v === 'cards') this.setAttribute('layout', v);
    else this.removeAttribute('layout');
  }

  /** `card-below` attribute (`sm` | `md` | `lg`, default `md`) — CSS only, never re-renders. */
  get cardBelow() {
    const v = (this.getAttribute('card-below') || '').trim();
    return v === 'sm' || v === 'lg' ? v : 'md';
  }
  set cardBelow(v) {
    if (v === 'sm' || v === 'lg') this.setAttribute('card-below', v);
    else this.removeAttribute('card-below');
  }

  get cellPaddingClass() { return this._cellPadding || ''; }
  set cellPaddingClass(val) {
    const v = val == null ? '' : String(val).trim();
    let next = null;
    if (v && Object.hasOwn(CELL_PADDING, v)) next = v;
    else if (v) this._warnOnce(`td-table: ignored cellPaddingClass "${v}" — use one of px-0 … px-6.`);
    if (next === this._cellPadding) return;
    this._cellPadding = next;
    if (this._initialized) this._doRender();
  }

  /** Effective zebra flag. `el.zebra = false` writes `zebra="false"`; `true` removes the attribute (default ON). */
  get zebra() { return this._isZebra(); }
  set zebra(v) { if (v === false) this.setAttribute('zebra', 'false'); else this.removeAttribute('zebra'); }

  // --- Attribute helpers ---

  _int(name, fallback) {
    const n = parseInt(this.getAttribute(name) ?? '', 10);
    return Number.isFinite(n) ? n : fallback;
  }

  _getPerPage() { return Math.max(1, Math.min(10000, this._int('per-page', 10))); }
  _getActiveColor() { return this.safeColor(this.getAttribute('active-color'), ''); }
  _isZebra() {
    if (!this.hasAttribute('zebra')) return true;
    return !OFF.has((this.getAttribute('zebra') || '').trim().toLowerCase());
  }
  _isLoading() { return this.hasAttribute('loading'); }
  _getLoadingRows() { return Math.max(1, Math.min(50, this._int('loading-rows', 5))); }
  _getTitle() { return (this.getAttribute('title') || '').trim(); }
  _getHeadingLevel() {
    const n = this._int('heading-level', 3);
    return n >= 2 && n <= 6 ? n : 3;
  }
  _getEmptyTitle() { return this.getAttribute('empty-title') || TdTable.labels.emptyTitle; }
  _getEmptyText() { return this.getAttribute('empty-text') || TdTable.labels.emptyText; }
  _isServerMode() { return this.hasAttribute('server-mode'); }
  /** Server-mode total, or null when the attribute is missing/invalid. */
  _getServerTotal() {
    if (!this.hasAttribute('total-items')) return null;
    const n = parseInt(this.getAttribute('total-items'), 10);
    return Number.isFinite(n) ? Math.max(0, n) : null;
  }
  _getMaxHeight() { return safeMaxHeight(this.getAttribute('max-height')); }
  _getHostLabel() { return (this.getAttribute('aria-label') || '').trim(); }
  /** v0.34.0 QĐ 14: `table-layout: fixed` only when EVERY column is `widthType: 'fixed'` with a valid width. */
  _isFixedLayout() {
    const cols = this._columns;
    return cols.length > 0 && cols.every((c) => c && c.widthType === 'fixed' && safeCssDimension(c.width, ''));
  }

  /** Card role of every column (QĐ 16 + v0.36.1 `lead`), computed once per render — see utils/table-card-role.js. */
  _cardRoles() {
    return cardRoles(this._columns);
  }

  /** `nowrap` (QĐ 14): explicit boolean, default true for `align: 'right'` (amounts keep "₫" on their line). */
  _isNowrap(col) {
    const c = col || {};
    return typeof c.nowrap === 'boolean' ? c.nowrap : c.align === 'right';
  }

  _warnOnce(msg) {
    if (this._warned.has(msg)) return;
    this._warned.add(msg);
    console.warn(msg);
  }

  /** v0.37.0: `none` | `multiple` | `single` (the attribute; the column also needs a rowKey — `_selOn`). */
  _selMode() {
    if (!this.hasAttribute('selectable')) return 'none';
    const v = (this.getAttribute('selectable') || '').trim().toLowerCase();
    if (SELECT_OFF.has(v)) return 'none';
    return v === 'single' ? 'single' : 'multiple';
  }

  /** `max-selected` (integer ≥ 1) in multiple mode, else no cap; an invalid value is ignored with one warning. */
  _maxSelected() {
    if (this._selMode() !== 'multiple' || !this.hasAttribute('max-selected')) return Infinity;
    const raw = (this.getAttribute('max-selected') || '').trim();
    const n = Number(raw);
    if (/^\d+$/.test(raw) && Number.isSafeInteger(n) && n >= 1) return n;
    this._warnOnce(`td-table: ignored invalid max-selected "${raw}" — use an integer ≥ 1.`);
    return Infinity;
  }

  /** Selection controls locked: host `disabled` or an ancestor `<fieldset disabled>` (QĐ 16). */
  _selLocked() { return this.hasAttribute('disabled') || this._formDisabled; }

  attributeChangedCallback(name, oldVal, newVal) {
    if (oldVal === newVal || !this._initialized) return;
    if (name === 'selectable') {
      const mode = this._selMode();
      if (mode === 'none') this._sel.clear();
      this._anchor = null;
      this._pruneRowCache();
      this._doRender(); // the selection column comes / goes (exclusive is synced there)
      return;
    }
    if (name === 'row-key') {
      if (!this._rowKeyFn) this._rowKeyChanged();
      return;
    }
    if (name === 'name') { this._syncForm(); return; }
    if (name === 'max-selected') return; // read at the next user action
    if (name === 'disabled') { this._paintSelection(); return; }
    if (name === 'loading' && newVal === null) { this._awaiting = false; this._reqSort = null; }
    if (STRUCTURAL.has(name)) this._doRender();
    else this._update();
  }

  /** @private The row identity changed: clear the selection (no event) and rebuild. */
  _rowKeyChanged() {
    this._dataIndex = null;
    if (!this._initialized) return;
    this._sel.clear();
    this._rowCache.clear();
    this._anchor = null;
    this._doRender();
  }

  // --- Structure (D11) ---

  _cellPadClass() {
    return this._cellPadding ? ` td-table__cell--px-${CELL_PADDING[this._cellPadding]}` : '';
  }

  render() {
    const title = this._getTitle();
    const h = `h${this._getHeadingLevel()}`;
    const mods = (this._isZebra() ? ' td-table--zebra' : '')
      + (this._isFixedLayout() ? ' td-table--fixed' : '')
      + (this._getMaxHeight() ? ' td-table--scroll-y' : '');
    const pad = this._cellPadClass();
    const esc = (v) => this.escapeHtml(v);
    const roles = this._cardRoles();
    const heads = this._columns.map((col, ci) => {
      const c = col || {};
      const key = esc(String(c.key ?? ''));
      const label = esc(c.label == null ? '' : String(c.label));
      const inner = c.sortable
        ? `<button type="button" class="td-table__sort" data-sort-col="${ci}"><span class="td-table__sort-label">${label}</span>`
          + '<span class="td-table__sort-icon" aria-hidden="true"></span></button>'
        : label;
      return `<th class="td-table__th${c.sortable ? ' td-table__th--sortable' : ''}${pad}" role="columnheader" scope="col" data-col="${ci}" data-col-key="${key}"`
        + ` data-card="${roles[ci]}">${inner}</th>`;
    }).join('');
    const titleHtml = title ? `<${h} class="td-table__title" id="${esc(this._titleId)}">${esc(title)}</${h}>` : '';
    const selHead = this._selOn ? this._selectHeadHtml() : '';
    const pag = (cls, label, quiet) => `<div class="${cls}"${quiet ? ' hidden' : ''}><td-pagination${quiet ? ' quiet' : ''}`
      + ` item-label="${esc(TdTable.labels.itemLabel)}" aria-label="${esc(label)}"></td-pagination></div>`;
    return `<div class="td-table${mods}" data-state="ready">`
      + `<div class="td-table__header">${titleHtml}${pag('td-table__pagination', TdTable.labels.paginationTop, true)}</div>`
      + '<div class="td-table__scroll"><table class="td-table__table" role="table">'
      + `<thead class="td-table__head" role="rowgroup"><tr role="row">${selHead}${heads}</tr></thead>`
      + '<tbody class="td-table__body" role="rowgroup"></tbody></table></div>'
      + `<div class="td-table__footer" hidden>${pag('td-table__pagination td-table__pagination--bottom', TdTable.labels.paginationBottom, false)}</div>`
      + '<p class="td-sr-only" role="status"></p>'
      + '</div>';
  }

  /** Structural render: only for columns / title / heading-level / zebra / max-height / cellPaddingClass. */
  _doRender() {
    if (!this._titleId) this._titleId = `${this.id || `td-table-${++seq}`}-title`;
    const mode = this._selMode();
    this._sel.setExclusive(mode === 'single');
    this._pruneRowCache(); // review ISSUE-3: single keeps only the last key
    this._selOn = mode !== 'none' && !!this.rowKey;
    this._dataIndex = null;
    if (mode !== 'none' && !this._selOn) {
      this._warnOnce('td-table: `selectable` needs `rowKey` (row-key) — no selection column (rows are never selected by index).');
    }
    this.innerHTML = this.render();
    this._root = this.firstElementChild;
    this._header = this._root.querySelector(':scope > .td-table__header');
    this._scroll = this._root.querySelector(':scope > .td-table__scroll');
    this._table = this._scroll.firstElementChild;
    this._tbody = this._table.querySelector(':scope > tbody');
    this._footer = this._root.querySelector(':scope > .td-table__footer');
    this._pagTop = this._header.querySelector(':scope > .td-table__pagination > td-pagination');
    this._pagBottom = this._footer.querySelector('td-pagination');
    this._status = this._root.querySelector(':scope > [role="status"]');
    this._selAll = this._selOn ? this._table.querySelector(':scope > thead > tr > th > .td-table__select-all') : null;
    if (this._selAll) fillIconSlots(this._selAll);
    const mh = this._getMaxHeight();
    if (mh) this._root.style.setProperty('--td-table-max-h', mh);
    else if (this.hasAttribute('max-height')) this._warnOnce(`td-table: ignored invalid max-height "${this.getAttribute('max-height')}".`);
    this._syncSortUi();
    this._update();
    this._syncForm();
    this._observeOverflow();
  }

  // --- In-place update (D11) ---

  /** @private Sorted + paged view of the data; clamps the page (fixes 2.8.3). */
  _view() {
    if (this._isServerMode()) {
      const total = this._getServerTotal();
      if (total !== null) {
        const pages = Math.max(1, Math.ceil(total / this._getPerPage()));
        this._currentPage = Math.min(Math.max(1, this._currentPage), pages);
      }
      return { rows: this._data, src: null, total };
    }
    // review ISSUE-4: sort / page SOURCE INDICES (into `data`), so row selection knows which occurrence a row is
    const order = this._sortedIndices();
    const per = this._getPerPage();
    const pages = Math.max(1, Math.ceil(order.length / per));
    this._currentPage = Math.min(Math.max(1, this._currentPage), pages);
    const start = (this._currentPage - 1) * per;
    const src = order.slice(start, start + per);
    return { rows: src.map((i) => this._data[i]), src, total: order.length };
  }

  /**
   * @private Client sort (D12): numbers numerically, strings with a vi numeric collator, nulls first in asc. Returns
   * indices into `data` (stable: ties keep data order).
   */
  _sortedIndices() {
    const data = this._data;
    const idx = data.map((_, i) => i);
    const { col: ci, direction } = this._sort;
    const col = ci === null ? null : this._columns[ci];
    if (!col || !direction) return idx;
    const key = col.key;
    const collator = new Intl.Collator('vi', { numeric: true, sensitivity: 'base' });
    const sign = direction === 'asc' ? 1 : -1;
    const val = (row) => (row && typeof row === 'object' ? row[key] : undefined);
    return idx.sort((ia, ib) => {
      const va = val(data[ia]);
      const vb = val(data[ib]);
      if (va == null && vb == null) return 0;
      if (va == null) return -sign;
      if (vb == null) return sign;
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sign;
      return collator.compare(String(va), String(vb)) * sign;
    });
  }

  _update() {
    if (!this._root || this._batching) return;
    const loading = this._isLoading();
    const server = this._isServerMode();
    const active = document.activeElement;
    if (active && (this._pagTop?.contains(active) || this._pagBottom?.contains(active))) {
      this._refocusPagination = this._pagTop.contains(active) ? 'top' : 'bottom';
    }
    const { rows, src, total } = this._view();
    const empty = !loading && rows.length === 0;

    // Body
    if (loading || empty) {
      this._pageKeys = [];
      this._pageEnabled = [];
      this._pageLabels = [];
    }
    if (loading) this._tbody.innerHTML = this._skeletonHtml();
    else if (empty) this._renderEmpty();
    else this._renderRows(rows, src);
    this._pageRows = loading || empty ? [] : rows;
    this._paintSelection();

    // Paginations (updated in place: live region + focus restore stay inside td-pagination). v0.39.0: a controlled
    // request in flight keeps them (focus stays on the activated page button).
    let showPag = !loading || this._awaiting;
    let count = total;
    if (server) {
      if (total === null) {
        showPag = false;
        if (!loading) this._warnOnce('td-table: server-mode needs `total-items` — pagination is hidden until it is set.');
      } else if (total === 0) showPag = false;
    } else if (total === 0) showPag = false;
    if (showPag) {
      const color = this._getActiveColor();
      for (const p of [this._pagTop, this._pagBottom]) {
        const set = (a, v) => { if (p.getAttribute(a) !== v) p.setAttribute(a, v); };
        set('total-items', String(count));
        set('items-per-page', String(this._getPerPage()));
        set('current-page', String(this._currentPage));
        if (color) set('active-color', color);
        else p.removeAttribute('active-color');
      }
    }
    this._pagTop.parentElement.hidden = !showPag;
    this._footer.hidden = !showPag;
    this._header.hidden = !showPag && !this._getTitle();

    // State + naming
    this._root.setAttribute('data-state', loading ? 'loading' : empty ? 'empty' : 'ready');
    if (loading) this._table.setAttribute('aria-busy', 'true');
    else this._table.removeAttribute('aria-busy');
    const statusText = loading ? TdTable.labels.loading : '';
    if (this._status.textContent !== statusText) this._status.textContent = statusText;
    this._applyName(this._table);
    this._applyStyles();
    this._syncOverflow();

    if (!loading && !showPag) this._refocusPagination = null;
    if (showPag && this._refocusPagination) {
      const which = this._refocusPagination;
      this._refocusPagination = null;
      const a = document.activeElement;
      if (!a || a === document.body || !a.isConnected) {
        const p = which === 'top' ? this._pagTop : this._pagBottom;
        p.querySelector('.td-pagination__page[aria-current="page"]')?.focus();
      }
    }
  }

  /** @private title → aria-labelledby, else host aria-label, else the fallback label (D18, review ISSUE-4). */
  _applyName(el) {
    if (this._getTitle()) {
      el.setAttribute('aria-labelledby', this._titleId);
      el.removeAttribute('aria-label');
    } else {
      el.removeAttribute('aria-labelledby');
      el.setAttribute('aria-label', this._getHostLabel() || TdTable.labels.table);
    }
  }

  _renderRows(rows, src = null) {
    const esc = (v) => this.escapeHtml(v);
    const pad = this._cellPadClass();
    const cols = this._columns;
    const roles = this._cardRoles();
    const labels = cols.map((col) => {
      const l = col && col.label != null ? String(col.label) : '';
      return `<span class="td-table__cell-label" aria-hidden="true">${esc(l)}</span>`;
    });
    const sel = this._selOn;
    if (sel) this._pageSelection(rows, src);
    // v0.37.0: the selection cell comes first (no data-col: data columns keep 0..n-1); its state is painted after.
    const selCell = sel ? '<td class="td-table__cell td-table__cell--select td-table__card-select" role="cell" data-card="select">'
      + `<button type="button" class="td-table__select" role="checkbox" aria-checked="false">${checkMarkHTML('md')}</button></td>` : '';
    this._tbody.innerHTML = rows.map((row, ri) => {
      const cells = cols.map((col, ci) => {
        const c = col || {};
        const actions = Array.isArray(c.actions);
        const cls = `td-table__cell${c.ellipsis && !actions ? ' td-table__cell--ellipsis' : ''}`
          + `${this._isNowrap(c) ? ' td-table__cell--nowrap' : ''}${actions ? ' td-table__cell--actions' : ''}${pad}`;
        const attrs = `class="${cls}" role="cell" data-col="${ci}" data-col-key="${esc(String(c.key ?? ''))}"`
          + ` data-card="${roles[ci]}"`;
        if (actions) return `<td ${attrs}>${labels[ci]}${this._actionsHtml(c, row)}</td>`;
        if (typeof c.render === 'function') return `<td ${attrs}>${labels[ci]}</td>`;
        const v = row && typeof row === 'object' ? row[c.key] : undefined;
        const text = v == null ? '' : String(v);
        if (c.ellipsis) return `<td ${attrs}>${labels[ci]}<div class="td-table__truncate" title="${esc(text)}">${esc(text)}</div></td>`;
        return `<td ${attrs}>${labels[ci]}${esc(text)}</td>`;
      }).join('');
      return `<tr class="td-table__row" role="row" data-row-idx="${ri}">${selCell}${cells}</tr>`;
    }).join('');

    const trs = this._tbody.children;
    // Actions (QĐ 18): icons from the registry, the "Thao tác" menu button bound as an APG menu button (TdMenu).
    if (cols.some((c) => c && Array.isArray(c.actions))) {
      fillIconSlots(this._tbody, '.td-table__actions [data-td-icon]');
      for (const btn of this._tbody.querySelectorAll('.td-table__actions-menu')) {
        const td = btn.closest('td');
        const ci = Number(td.getAttribute('data-col'));
        const ri = Number(td.parentElement.getAttribute('data-row-idx'));
        TdMenu.bind(btn, () => this._menuItems(ci, ri), { align: 'end' });
      }
    }

    // Render cells, resolved by column INDEX (fixes 2.8.4). CONSUMER HATCH: a string is trusted developer HTML.
    // The cell already holds its aria-hidden card label, so content is APPENDED after it.
    cols.forEach((col, ci) => {
      if (!col || typeof col.render !== 'function' || Array.isArray(col.actions)) return;
      rows.forEach((row, ri) => {
        const td = trs[ri].children[ci + (sel ? 1 : 0)];
        let out;
        try {
          out = col.render(row, ri);
        } catch (err) {
          console.error('td-table: column render threw', err); // the cell stays empty
          return;
        }
        let target = td;
        if (col.ellipsis) {
          target = document.createElement('div');
          target.className = 'td-table__truncate';
          td.appendChild(target);
        }
        if (typeof out === 'string') target.insertAdjacentHTML('beforeend', out);
        else if (typeof Node !== 'undefined' && out instanceof Node) target.appendChild(out);
        else if (out != null) target.appendChild(document.createTextNode(String(out)));
        if (col.ellipsis && !target.querySelector('[title]')) target.title = target.textContent.trim();
      });
    });

    if (sel) this._bindSelectRows(trs);
  }

  // --- v0.37.0 row selection (plan v0.37.0-table-row-selection, ADR 0018) ---

  /** @private `th` of the selection column; multiple → the tri-state "select all on this page" checkbox button. */
  _selectHeadHtml() {
    const esc = (v) => this.escapeHtml(v);
    const L = TdTable.labels;
    if (this._selMode() === 'single') {
      return '<th class="td-table__th td-table__th--select" role="columnheader" scope="col" data-card="select">'
        + `<span class="td-sr-only">${esc(L.selectColumn)}</span></th>`;
    }
    return '<th class="td-table__th td-table__th--select td-table__th--select-all" role="columnheader" scope="col" data-card="select">'
      + `<button type="button" class="td-table__select-all" role="checkbox" aria-checked="false">${checkMarkHTML('md')}`
      + `<span class="td-table__select-all-label">${esc(L.selectAll)}</span></button></th>`;
  }

  /** @private The key of a row, or null (invalid key / throwing `rowKey` → cannot be selected; one warning per kind). */
  _keyOf(row) {
    let k;
    if (this._rowKeyFn) {
      try {
        k = this._rowKeyFn(row);
      } catch {
        this._warnOnce('td-table: rowKey threw — that row cannot be selected.');
        return null;
      }
    } else {
      const field = this.getAttribute('row-key');
      k = field && row && typeof row === 'object' ? readKeyField(row, field) : undefined;
    }
    if (keyId(k) === null) {
      this._warnOnce('td-table: a row has no valid key (non-empty string, finite number or bigint) — it cannot be selected.');
      return null;
    }
    return k;
  }

  /** @private `rowSelectable(row)`; a throw counts as false (fail closed, like actions[].disabled). */
  _isRowSelectable(row) {
    if (!this._rowSelectable) return true;
    try {
      return !!this._rowSelectable(row);
    } catch (err) {
      console.error('td-table: rowSelectable threw', err);
      return false;
    }
  }

  /** @private Review ISSUE-3: the row cache only ever holds rows of SELECTED keys (mode changes bypass _commitSel). */
  _pruneRowCache() {
    for (const id of [...this._rowCache.keys()]) if (!this._sel.has(id)) this._rowCache.delete(id);
  }

  /**
   * @private Keys + enabled flags of the rows about to render. A duplicate key (after `String(key)`) → only the first
   * row with it can be selected: client mode compares against the WHOLE `data` (review SEC-2 — the first row in data
   * order owns the key, on whatever page it is), server mode against the page (keys must be globally unique — docs).
   */
  _pageSelection(rows, src) {
    const seen = new Set();
    const owners = src ? this._dataRows() : null;
    this._pageKeys = rows.map((row, ri) => {
      const k = this._keyOf(row);
      if (k === null) return null;
      const id = keyId(k);
      // review ISSUE-4: ownership by SOURCE INDEX (the same object twice in data is two occurrences)
      if (seen.has(id) || (owners && owners.get(id) !== src[ri])) {
        this._warnOnce('td-table: duplicate row key — only the first row with it can be selected (keys must be unique; use a composite key such as `${tenantId}:${id}`).');
        return null;
      }
      seen.add(id);
      if (this._sel.has(k)) this._rowCache.set(id, row);
      return k;
    });
    this._pageEnabled = rows.map((row, ri) => this._pageKeys[ri] !== null && this._isRowSelectable(row));
  }

  /** @private After the body render: tick icons + names (setAttribute — row data never enters HTML here). */
  _bindSelectRows(trs) {
    fillIconSlots(this._tbody, '.td-table__select [data-td-icon]');
    const pi = this._cardRoles().indexOf('primary');
    const L = TdTable.labels;
    this._pageLabels = [];
    for (let ri = 0; ri < trs.length; ri++) {
      const tr = trs[ri];
      const td = pi >= 0 ? tr.querySelector(`:scope > [data-col="${pi}"]`) : null;
      const name = (td && cellText(td)) || fill(L.rowFallback, { n: ri + 1 });
      this._pageLabels.push(name);
      tr.querySelector(':scope > .td-table__cell--select > .td-table__select')?.setAttribute('aria-label', fill(L.selectRow, { label: name }));
    }
  }

  /** @private isEnabled(key) over the current page (valid, unique, rowSelectable). */
  _enabledFn() {
    const ids = new Set();
    this._pageKeys.forEach((k, i) => { if (k !== null && this._pageEnabled[i]) ids.add(keyId(k)); });
    return (k) => ids.has(keyId(k));
  }

  /** @private Paint the selection IN PLACE (no re-render: focus stays on the activated control). */
  _paintSelection() {
    if (!this._selOn || !this._tbody) return;
    const locked = this._selLocked();
    for (const tr of this._tbody.children) {
      const btn = tr.querySelector(':scope > .td-table__cell--select > .td-table__select');
      if (!btn) continue;
      const ri = Number(tr.getAttribute('data-row-idx'));
      const k = this._pageKeys[ri];
      const on = k != null && this._sel.has(k);
      btn.setAttribute('aria-checked', on ? 'true' : 'false');
      btn.disabled = locked || !this._pageEnabled[ri];
      tr.toggleAttribute('data-selected', on);
    }
    if (this._selAll) {
      const state = this._isLoading() ? 'disabled' : this._sel.headerState(this._pageKeys, this._enabledFn());
      this._selAll.setAttribute('aria-checked', state === 'all' ? 'true' : state === 'some' ? 'mixed' : 'false');
      this._selAll.disabled = locked || state === 'disabled';
    }
  }

  /** @private A user activated a row control or the header (click / Space / Shift+Space). */
  _activateSelect(btn, shift) {
    if (!this._selOn || this._selLocked()) return;
    const mode = this._selMode();
    this._sel.max = this._maxSelected();
    if (btn.classList.contains('td-table__select-all')) {
      if (mode === 'multiple') this._userResult(this._sel.userPage(this._pageKeys, this._enabledFn()), 'page');
      return;
    }
    const ri = Number(btn.closest('tr')?.getAttribute('data-row-idx'));
    const k = this._pageKeys[ri];
    if (k == null || !this._pageEnabled[ri]) return;
    const anchorOnPage = this._anchor !== null && this._pageKeys.some((p) => p !== null && keyId(p) === this._anchor);
    let result;
    let trigger = 'toggle';
    if (mode === 'multiple' && shift && anchorOnPage) {
      result = this._sel.userRange(this._pageKeys, this._anchor, k, this._enabledFn());
      trigger = 'range';
    } else {
      result = this._sel.userToggle(k);
    }
    if (mode === 'multiple') this._anchor = keyId(k);
    this._userResult(result, trigger);
  }

  /** @private Commit a user change; an add stopped at the cap → `select-limit` + announcement (after the change). */
  _userResult(result, trigger) {
    this._commitSel(result, trigger, true);
    if (result.limited) {
      const max = this._sel.max;
      this.emit('select-limit', { max });
      this._announce(fill(TdTable.labels.selectLimit, { max }));
    }
  }

  /**
   * @private Apply a selection diff: paint, form value; `emit` (user action or `{ emit: true }`) → `onSelectChange`,
   * `select-change`, announcement.
   */
  _commitSel(diff, trigger, emit) {
    if (!diff.added.length && !diff.removed.length) return;
    for (const k of diff.removed) this._rowCache.delete(keyId(k));
    if (diff.added.length) {
      this._pageKeys.forEach((k, ri) => {
        if (k !== null && this._sel.has(k) && ri < this._pageRows.length) this._rowCache.set(keyId(k), this._pageRows[ri]);
      });
    }
    this._paintSelection();
    this._syncForm();
    if (!emit) return;
    const keys = this._sel.keys();
    if (this._onSelectChange) {
      try {
        this._onSelectChange(keys.slice());
      } catch (err) {
        console.error('td-table: onSelectChange threw', err);
      }
    }
    this.emit('select-change', { keys, added: diff.added.slice(), removed: diff.removed.slice(), trigger });
    const L = TdTable.labels;
    if (this._selMode() === 'single') {
      const k = diff.added[diff.added.length - 1];
      this._announce(k === undefined ? L.deselected : fill(L.selectedRow, { label: this._labelOfKey(k) }));
    } else {
      this._announce(fill(L.selectedCount, { n: this._sel.size }));
    }
  }

  /** @private Name of a key's row on this page (announcements), else the key as text. */
  _labelOfKey(k) {
    const id = keyId(k);
    const ri = this._pageKeys.findIndex((p) => p !== null && keyId(p) === id);
    return ri >= 0 && this._pageLabels[ri] ? this._pageLabels[ri] : String(k);
  }

  /** @private One live-region update per task (the last message wins); never over the loading text. */
  _announce(text) {
    if (!this._status || this._isLoading()) return;
    this._pendingAnnounce = String(text ?? '');
    if (this._announceQueued) return;
    this._announceQueued = true;
    queueMicrotask(() => {
      this._announceQueued = false;
      if (!this._status || this._isLoading()) return;
      // the same text again (e.g. a second limit attempt): clear first so the region mutates and is read again
      if (this._status.textContent === this._pendingAnnounce) this._status.textContent = '';
      this._status.textContent = this._pendingAnnounce;
    });
  }

  /** @private Client mode: id → index in `data` of the FIRST row with that key (its owner), built lazily. */
  _dataRows() {
    if (!this._dataIndex) {
      const m = new Map();
      if (this._selOn) {
        for (let i = 0; i < this._data.length; i++) {
          const k = this._keyOf(this._data[i]);
          if (k === null) continue;
          if (!m.has(keyId(k))) m.set(keyId(k), i);
          else this._warnOnce('td-table: duplicate row key — only the first row with it can be selected (keys must be unique; use a composite key such as `${tenantId}:${id}`).');
        }
      }
      this._dataIndex = m;
    }
    return this._dataIndex;
  }

  /** @private Form value (QĐ 22): `name` + selection on → one FormData entry per key (`String(key)`); else nothing. */
  _syncForm() {
    const internals = this._internals;
    if (!internals || typeof internals.setFormValue !== 'function') return;
    const name = this.getAttribute('name') || '';
    if (!this._selOn || !name || !this._sel.size) {
      internals.setFormValue(null);
      return;
    }
    const fd = new FormData();
    for (const id of this._sel.ids()) fd.append(name, id);
    internals.setFormValue(fd);
  }

  /** Form reset → the selection is cleared and ONE `select-change` (`trigger: 'reset'`) fires (QĐ 22). */
  formResetCallback() {
    this._anchor = null;
    this._commitSel(this._sel.clear(), 'reset', true);
  }

  /** Host `disabled` / ancestor `<fieldset disabled>` → the controls are locked; the selection is kept (QĐ 16). */
  formDisabledCallback(disabled) {
    this._formDisabled = !!disabled;
    this._paintSelection();
  }

  /** Nothing is restored (bfcache / back): the rows may not be loaded yet — the app sets `selectedKeys` (QĐ 22). */
  formStateRestoreCallback() {}

  /** @private The selection control an event belongs to (this table's own), or null. */
  _selectTarget(e) {
    const t = e.target instanceof Element ? e.target : null;
    const btn = t ? t.closest(SELECT_CTL) : null;
    return btn && btn.closest('td-table') === this ? btn : null;
  }

  /** @private Space = click, Shift+Space = Shift+click (a key-generated click has no reliable shiftKey); Enter: nothing. */
  _onSelectKeydown(e) {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    const btn = this._selectTarget(e);
    if (!btn) return;
    e.preventDefault();
    if (e.key === 'Enter' || e.repeat || btn.disabled) return;
    this._activateSelect(btn, e.shiftKey);
  }

  /** @private A button activates on Space keyup — keep that from turning into a second toggle. */
  _onSelectKeyup(e) {
    if (e.key === ' ' && this._selectTarget(e)) e.preventDefault();
  }

  /** @private Shift+mousedown on a control: no text selection (the click handler focuses the control). */
  _onSelectMousedown(e) {
    if (e.shiftKey && this._selectTarget(e)) e.preventDefault();
  }

  // --- Row actions (v0.34.0 QĐ 18) ---

  /** @private An action flag (`hidden` / `disabled`): boolean or `(row) => boolean`; a throw counts as true. */
  _actionFlag(a, name, row) {
    if (typeof a[name] !== 'function') return a[name] === true;
    try {
      return !!a[name](row);
    } catch (err) {
      console.error(`td-table: actions[].${name} threw`, err); // fail closed: hidden / disabled
      return true;
    }
  }

  /** @private Visible actions of a column for a row: `[{ a, idx, disabled }]`. */
  _rowActions(col, row) {
    const out = [];
    col.actions.forEach((a, idx) => {
      if (!a || typeof a !== 'object' || this._actionFlag(a, 'hidden', row)) return;
      out.push({ a, idx, disabled: this._actionFlag(a, 'disabled', row) });
    });
    return out;
  }

  /**
   * @private Inline buttons (table mode; card mode when ≤ 2) + one "Thao tác" menu button when > 2. CSS shows exactly
   * one of the two sets per mode (the other is display:none), so a mode never has duplicate tab stops.
   */
  _actionsHtml(col, row) {
    const esc = (v) => this.escapeHtml(v);
    const list = this._rowActions(col, row);
    const valid = (name) => typeof name === 'string' && hasIcon(name);
    const icon = (name) => (valid(name)
      ? `<span class="td-table__action-icon" data-td-icon="${esc(name)}" data-td-icon-size="16" aria-hidden="true"></span>` : '');
    // v0.36.1 (QĐ 7): `--icon` → icon-only in card mode (the label stays in the DOM, visually hidden: same name)
    const iconCls = (name) => (valid(name) ? ' td-table__action--icon' : '');
    const btns = list.map(({ a, idx, disabled }) => {
      const v = ACTION_VARIANTS.has(a.variant) ? a.variant : 'secondary';
      const label = a.label == null ? '' : String(a.label);
      return `<button type="button" class="td-btn td-btn--sm td-btn--${v} td-table__action${iconCls(a.icon)}" data-action-idx="${idx}"`
        + `${disabled ? ' disabled' : ''}>${icon(a.icon)}<span class="td-table__action-label">${esc(label)}</span></button>`;
    }).join('');
    const menu = list.length > CARD_INLINE_ACTIONS;
    const more = menu
      ? `<button type="button" class="td-btn td-btn--sm td-btn--secondary td-table__actions-menu${iconCls('more')}" aria-haspopup="menu"`
        + ` aria-expanded="false">${icon('more')}<span class="td-table__action-label">${esc(TdTable.labels.actions)}</span></button>`
      : '';
    return `<div class="td-table__actions${menu ? ' td-table__actions--menu' : ''}">${btns}${more}</div>`;
  }

  /** @private TdMenu items of the card-mode menu (labels are text; disabled items are inert). */
  _menuItems(ci, ri) {
    const col = this._columns[ci];
    const row = this._pageRows[ri];
    if (!col || !Array.isArray(col.actions) || ri >= this._pageRows.length) return [];
    return this._rowActions(col, row).map(({ a, idx, disabled }) => ({
      label: a.label == null ? '' : String(a.label),
      icon: typeof a.icon === 'string' && hasIcon(a.icon) ? a.icon : undefined,
      danger: a.variant === 'danger',
      disabled,
      onSelect: () => this._fireRowAction(ci, idx, ri),
    }));
  }

  /** @private `row-action` { id, row, rowIndex } (bubbling), then `onRowAction(detail)`. */
  _fireRowAction(ci, idx, ri) {
    const col = this._columns[ci];
    const a = col && Array.isArray(col.actions) ? col.actions[idx] : null;
    if (!a || !(ri >= 0 && ri < this._pageRows.length)) return;
    const detail = { id: a.id, row: this._pageRows[ri], rowIndex: ri };
    this.emit('row-action', detail);
    this._safeCall(this._onRowAction, detail, 'onRowAction');
  }

  _renderEmpty() {
    const n = Math.max(1, this._columns.length) + (this._selOn ? 1 : 0);
    const level = Math.min(6, (this._getTitle() ? this._getHeadingLevel() : 2) + 1);
    const esc = (v) => this.escapeHtml(v);
    this._tbody.innerHTML = `<tr class="td-table__empty-row" role="row"><td class="td-table__empty" role="cell" colspan="${n}">`
      + `<td-empty-state compact size="sm" heading-level="${level}" title="${esc(this._getEmptyTitle())}"`
      + ` message="${esc(this._getEmptyText())}"></td-empty-state></td></tr>`;
  }

  /** Deterministic skeleton rows (widths come from td.css :nth-child rules — D19). */
  _skeletonHtml() {
    const pad = this._cellPadClass();
    const roles = this._cardRoles();
    const cells = this._columns.map((c, ci) => `<td class="td-table__cell${pad}" role="cell" data-col="${ci}"`
      + ` data-card="${roles[ci]}"><span class="td-table__skeleton"></span></td>`).join('')
      || `<td class="td-table__cell${pad}" role="cell" data-card="primary"><span class="td-table__skeleton"></span></td>`;
    const selCell = this._selOn ? '<td class="td-table__cell td-table__cell--select td-table__card-select" role="cell" data-card="select"></td>' : '';
    const row = `<tr class="td-table__row td-table__row--skeleton" role="row" aria-hidden="true">${selCell}${cells}</tr>`;
    return row.repeat(this._getLoadingRows());
  }

  // --- Sorting (D12) ---

  /** @private New columns: drop the sort when its index no longer points at a sortable column. */
  _resetStaleSort() {
    const col = this._sort.col === null ? null : this._columns[this._sort.col];
    if (!col || !col.sortable) this._sort = { col: null, direction: null };
  }

  _syncSortUi() {
    if (!this._table) return;
    for (const th of this._table.querySelectorAll(':scope > thead > tr > th[data-col]')) {
      const ci = Number(th.getAttribute('data-col'));
      const on = this._sort.col === ci && this._sort.direction;
      if (on) th.setAttribute('aria-sort', this._sort.direction === 'asc' ? 'ascending' : 'descending');
      else th.removeAttribute('aria-sort');
      const slot = th.querySelector(':scope > .td-table__sort > .td-table__sort-icon');
      if (slot) this._fillSortIcon(slot, on ? this._sort.direction : null);
    }
  }

  /** @private Registry icons: `up` / `down`; unsorted = `sort` when registered, else a stacked up+down pair. */
  _fillSortIcon(slot, dir) {
    const name = dir === 'asc' ? 'up' : dir === 'desc' ? 'down' : 'sort';
    if (slot.getAttribute('data-sort-icon') === name) return;
    slot.setAttribute('data-sort-icon', name);
    let icons;
    if (name !== 'sort') icons = [tdIcon(name, { size: 14 })];
    else if (hasIcon('sort')) icons = [tdIcon('sort', { size: 14 })];
    else icons = [tdIcon('up', { size: 12 }), tdIcon('down', { size: 12 })];
    slot.replaceChildren(...icons.filter(Boolean));
  }

  _handleSort(ci) {
    const col = this._columns[ci];
    if (!col || !col.sortable) return;
    const controlled = this._isControlled();
    // controlled: cycle from the sort already asked for (the table's own sort only changes with setState)
    const base = controlled && this._awaiting && this._reqSort ? this._reqSort : this._sort;
    let next;
    if (base.col !== ci) next = { col: ci, direction: 'asc' };
    else if (base.direction === 'asc') next = { col: ci, direction: 'desc' };
    else next = { col: null, direction: null };
    const detail = { key: next.col === null ? null : col.key, direction: next.direction };
    if (!controlled) {
      this._sort = next;
      this._syncSortUi();
    }
    this.emit('sort-change', detail);
    if (controlled) this._reqSort = next;
    // v0.39.0: request-change after sort-change, before onSort (a new sort asks for page 1)
    this._request('sort', { sort: detail, page: 1 });
    if (this._isServerMode()) {
      this._safeCall(this._onSort, { ...detail }, 'onSort');
      return;
    }
    this._currentPage = 1;
    this._update();
  }

  _onClick(e) {
    this._flushPage(); // v0.39.0: the click that changed the page has finished its page-change dispatch
    const t = e.target instanceof Element ? e.target : null;
    const btn = t ? t.closest(`.td-table__sort, .td-table__action, ${SELECT_CTL}`) : null;
    if (!btn || btn.closest('td-table') !== this) return;
    if (btn.matches(SELECT_CTL)) {
      if (btn.disabled) return;
      btn.focus(); // WebKit does not focus a clicked button; Shift+mousedown is prevented (no text selection)
      this._activateSelect(btn, e.shiftKey);
      return;
    }
    if (btn.classList.contains('td-table__sort')) {
      this._handleSort(Number(btn.getAttribute('data-sort-col')));
      return;
    }
    if (btn.disabled) return;
    const td = btn.closest('td');
    this._fireRowAction(Number(td.getAttribute('data-col')), Number(btn.getAttribute('data-action-idx')),
      Number(td.parentElement.getAttribute('data-row-idx')));
  }

  // --- Paging ---

  _onPaginationChange(e) {
    const p = e.target;
    if (p !== this._pagTop && p !== this._pagBottom) return;
    const page = Number(e.detail?.page);
    if (!Number.isFinite(page) || page === this._currentPage) return;
    if (this._isControlled()) {
      // v0.39.0: the table's page only changes with setState — the clicked pagination goes back (it keeps focus on the
      // same control: td-pagination restores it by role after its re-render)
      p.setAttribute('current-page', String(this._currentPage));
    } else {
      this._currentPage = page;
      if (this._isServerMode()) {
        const other = p === this._pagTop ? this._pagBottom : this._pagTop;
        other.setAttribute('current-page', String(page));
      } else {
        this._update();
      }
    }
    // request-change + onPageChange run once page-change has finished bubbling: at the end of the click that caused it
    // (the host's click listener runs after td-pagination's), else (pagination.setPage()) in a microtask.
    this._pendingPage = page;
    queueMicrotask(() => this._flushPage());
  }

  /** @private v0.39.0: `request-change` (reason page) then `onPageChange` (server mode) for the page change pending. */
  _flushPage() {
    const page = this._pendingPage;
    if (page == null) return;
    this._pendingPage = null;
    this._request('page', { page });
    if (this._isServerMode()) this._safeCall(this._onPageChange, page, 'onPageChange');
  }

  // --- v0.39.0 external filters + controlled mode (plan v0.39.0-filters-range QĐ 1–5) ---

  /** @private `controlled` counts only with `server-mode` (else one warning, ignored). */
  _isControlled() {
    if (!this.hasAttribute('controlled')) return false;
    if (this._isServerMode()) return true;
    this._warnOnce('td-table: `controlled` needs `server-mode` — ignored (the table pages and sorts itself).');
    return false;
  }

  /** @private The current sort as `{ key, direction }` (original key). */
  _sortState(sort = this._sort) {
    const col = sort.col === null ? null : this._columns[sort.col];
    return { key: col ? col.key : null, direction: col ? sort.direction : null };
  }

  /**
   * @private Fire `request-change` for the state the user asked for (`over` replaces parts of the current one).
   * Controlled: the skeleton is shown BEFORE the event, so a listener answering synchronously with setState() wins.
   */
  _request(reason, over) {
    const requestId = ++this._reqSeq;
    const cur = { page: this._currentPage, perPage: this._getPerPage(), sort: this._sortState(), filters: this._filters };
    const s = { ...cur, ...over };
    const state = Object.freeze({
      page: s.page,
      perPage: s.perPage,
      sort: Object.freeze({ key: s.sort.key, direction: s.sort.direction }),
      filters: s.filters,
    });
    if (this._isControlled()) {
      this._awaiting = true;
      if (!this.hasAttribute('loading')) this.setAttribute('loading', '');
    }
    this.emit('request-change', { state, reason, requestId });
  }

  /** @private Filters → a frozen shallow copy (arrays copied + frozen); null / undefined → {}; other types → {} + warning. */
  _normFilters(f) {
    if (f == null) return Object.freeze({});
    if (typeof f !== 'object' || Array.isArray(f)) {
      this._warnOnce('td-table: filters must be a plain object — ignored.');
      return Object.freeze({});
    }
    const out = {};
    for (const k of Object.keys(f)) {
      if (k === '__proto__') continue;
      const v = f[k];
      out[k] = Array.isArray(v) ? Object.freeze(v.slice()) : v;
    }
    return Object.freeze(out);
  }

  /** @private Sort by column KEY (setState / URL): unknown or not sortable → no sort + one warning. */
  _applySortKey(sort) {
    const dir = sort && (sort.direction === 'asc' || sort.direction === 'desc') ? sort.direction : null;
    const key = sort && sort.key != null ? sort.key : null;
    this._pendingSortKey = null;
    if (key === null || !dir) {
      this._sort = { col: null, direction: null };
      return;
    }
    if (!this._columns.length) {
      this._pendingSortKey = { key, direction: dir };
      return;
    }
    const ci = this._columns.findIndex((c) => c && c.sortable && String(c.key) === String(key));
    if (ci < 0) {
      this._sort = { col: null, direction: null };
      this._warnOnce(`td-table: setState sort key "${String(key)}" is not a sortable column — sort cleared.`);
      return;
    }
    this._sort = { col: ci, direction: dir };
  }

  /** @private New columns: a sort set by key before they existed is resolved now. */
  _resolvePendingSort() {
    if (this._pendingSortKey && this._columns.length) this._applySortKey(this._pendingSortKey);
  }

  /** @private Run a site callback (if set); a throw is logged and never breaks the table. */
  _safeCall(fn, arg, what) {
    if (!fn) return;
    try {
      fn(arg);
    } catch (err) {
      console.error(`td-table: ${what} threw`, err);
    }
  }

  // --- Overflow region (D16) ---

  _observeOverflow() {
    this._ro?.disconnect();
    this._ro = null;
    if (typeof ResizeObserver === 'undefined' || !this.isConnected) return;
    this._ro = new ResizeObserver(() => this._syncOverflow());
    this._ro.observe(this._scroll);
    this._ro.observe(this._table);
  }

  /** @private Focusable + named `role=region` only while the wrapper overflows (keyboard scrolling, WCAG 2.1.1). */
  _syncOverflow() {
    const s = this._scroll;
    if (!s) return;
    const over = s.scrollWidth > s.clientWidth + 1 || s.scrollHeight > s.clientHeight + 1;
    if (over) {
      s.setAttribute('tabindex', '0');
      s.setAttribute('role', 'region');
      this._applyName(s);
    } else {
      for (const a of ['tabindex', 'role', 'aria-label', 'aria-labelledby']) s.removeAttribute(a);
    }
  }

  // --- Column styles (CSSOM) ---

  /**
   * Per-column SCALAR styles (width / min-width / max-width / text-align) for CSSOM. Column config is developer
   * data, but it enters a CSS context: dimensions pass `safeCssDimension`, `align` a whitelist.
   */
  _getColumnWidthStyles(col) {
    const c = col || {};
    const widthType = c.widthType || 'flexible';
    const styles = {};
    const width = safeCssDimension(c.width, '');
    if (widthType === 'fixed' && width) {
      styles.width = width;
      styles['min-width'] = width;
      styles['max-width'] = width;
    } else {
      // v0.34.0: no `width: auto` (the default) — a column without config gets no inline style at all.
      const minW = safeCssDimension(c.minWidth, '');
      const maxW = safeCssDimension(c.maxWidth, '');
      if (minW) styles['min-width'] = minW;
      if (maxW) styles['max-width'] = maxW;
      // ellipsis content truncates at the column maxWidth (a table cell's max-width alone is ignored in auto layout)
      if (maxW && c.ellipsis) styles['--td-table-ellipsis-max'] = maxW;
    }
    if (ALIGN.includes(c.align)) styles['text-align'] = c.align;
    return styles;
  }

  /** CSSOM per-column styles on this table's own header and body cells (never on nested tables in render cells). */
  _applyStyles() {
    if (!this._table) return;
    const styles = this._columns.map((c) => this._getColumnWidthStyles(c));
    const cells = this._table.querySelectorAll(':scope > thead > tr > [data-col], :scope > tbody > tr > [data-col]');
    for (const cell of cells) {
      const s = styles[Number(cell.getAttribute('data-col'))];
      if (s && Object.keys(s).length) applyStyles(cell, s);
    }
  }

  // --- Public API ---

  /** Replace the rows. Client mode: back to page 1. Server mode: the current page is kept (fixes 2.8.2). */
  setData(data) {
    this._data = Array.isArray(data) ? data : [];
    this._dataIndex = null;
    if (!this._isServerMode()) this._currentPage = 1;
    if (this._initialized) this._update();
  }

  /** Go to a page (clamped). Does not call `onPageChange`. */
  setPage(page) {
    this._currentPage = Math.max(1, parseInt(page, 10) || 1);
    if (this._initialized) this._update();
  }

  /** Toggle the loading state. */
  setLoading(bool) {
    if (bool) this.setAttribute('loading', '');
    else this.removeAttribute('loading');
  }

  /**
   * Current state; `sort.key` is the sorted column's original key. v0.39.0: `filters` (frozen), `totalItems` (server
   * mode: `total-items` or null; client mode: the number of rows) and `requestId` (of the latest `request-change`, 0
   * before any).
   */
  getState() {
    return {
      columns: this._columns,
      data: this._data,
      page: this._currentPage,
      perPage: this._getPerPage(),
      sort: this._sortState(),
      filters: this._filters,
      totalItems: this._isServerMode() ? this._getServerTotal() : this._data.length,
      requestId: this._reqSeq,
      selection: { mode: this._selMode(), keys: this._sel.keys() },
    };
  }

  /**
   * v0.39.0: apply a state in ONE update, silently (no event). Every field is optional: `page`, `perPage`,
   * `sort: { key, direction }` (by column key — unknown / not sortable → no sort + one warning), `filters` (opaque),
   * `data` (also ends the loading state), `totalItems` (server mode `total-items`), `requestId`. A `requestId` older
   * than the latest `request-change` → ignored (a late response never overwrites a newer one). Also the way to restore
   * a state from the URL (before or after connect).
   * @returns {boolean} false when ignored (stale requestId)
   */
  setState(state = {}) {
    const o = state && typeof state === 'object' ? state : {};
    if (o.requestId != null) {
      const id = Number(o.requestId);
      if (Number.isFinite(id) && id < this._reqSeq) return false;
    }
    const hasData = Array.isArray(o.data);
    const num = (v) => (v == null || v === '' ? NaN : Math.trunc(Number(v)));
    this._batching = true;
    try {
      const per = num(o.perPage);
      if (Number.isFinite(per) && per >= 1) this.setAttribute('per-page', String(Math.min(10000, per)));
      const total = num(o.totalItems);
      if (Number.isFinite(total) && total >= 0) this.setAttribute('total-items', String(total));
      if ('filters' in o) this._filters = this._normFilters(o.filters);
      if ('sort' in o) this._applySortKey(o.sort);
      if (hasData) {
        this._data = o.data;
        this._dataIndex = null;
        if (!this._isServerMode()) this._currentPage = 1;
      }
      const page = num(o.page);
      if (Number.isFinite(page)) this._currentPage = Math.max(1, page);
      if (hasData) {
        this._awaiting = false;
        this._reqSort = null;
        this.removeAttribute('loading');
      }
    } finally {
      this._batching = false;
    }
    if (this._initialized) {
      this._syncSortUi();
      this._update();
    }
    return true;
  }

  /**
   * v0.39.0: ask for new filters — `request-change` reason `filters` (page 1 unless `{ resetPage: false }`). Not
   * controlled: the table also keeps them (getState) and goes to that page; it never filters the rows itself.
   * @param {object} filters
   * @param {{ resetPage?: boolean }} [opts]
   */
  setFilters(filters, opts = {}) {
    const f = this._normFilters(filters);
    const page = opts && opts.resetPage === false ? this._currentPage : 1;
    if (!this._isControlled()) {
      this._filters = f;
      this._currentPage = page;
      if (this._initialized) this._update();
    }
    this._request('filters', { filters: f, page });
  }

  /** Add keys to the selection (API: never capped by `max-selected`). No event unless `{ emit: true }`. */
  select(keys, opts = {}) { this._commitSel(this._sel.add(keys), 'api', !!opts?.emit); }

  /** Remove keys from the selection. No event unless `{ emit: true }`. */
  deselect(keys, opts = {}) { this._commitSel(this._sel.remove(keys), 'api', !!opts?.emit); }

  /** Flip one key. No event unless `{ emit: true }`. */
  toggle(key, opts = {}) {
    if (this._sel.has(key)) this.deselect([key], opts);
    else this.select([key], opts);
  }

  /** Clear the selection (all pages). No event unless `{ emit: true }`. */
  clearSelection(opts = {}) {
    this._anchor = null;
    this._commitSel(this._sel.clear(), 'api', !!opts?.emit);
  }

  /** Is this key selected (1 and "1" are the same row)? */
  isSelected(key) { return this._sel.has(key); }

  /** Merge options (non-array `columns`/`data` are ignored; `data` follows setData's page rule, then `page`). */
  update(opts = {}) {
    const o = opts && typeof opts === 'object' ? opts : {};
    let structural = false;
    if (Array.isArray(o.columns)) {
      this._columns = o.columns;
      this._resetStaleSort();
      this._resolvePendingSort();
      structural = true;
    }
    if (Array.isArray(o.data)) {
      this._data = o.data;
      this._dataIndex = null;
      if (!this._isServerMode()) this._currentPage = 1;
    }
    // v0.37.0: rowKey first (it clears the selection), then the rest
    if (typeof o.rowKey === 'function' || typeof o.rowKey === 'string') this.rowKey = o.rowKey;
    if (o.rowSelectable !== undefined) this._rowSelectable = typeof o.rowSelectable === 'function' ? o.rowSelectable : null;
    if (o.selectedKeys !== undefined) this._commitSel(this._sel.replace(o.selectedKeys), 'api', false);
    if (o.page != null && Number.isFinite(Number(o.page))) this._currentPage = Math.max(1, Math.trunc(Number(o.page)));
    if (typeof o.onSort === 'function') this._onSort = o.onSort;
    if (typeof o.onPageChange === 'function') this._onPageChange = o.onPageChange;
    if (!this._initialized) return;
    if (structural) this._doRender();
    else this._update();
  }
}

if (!customElements.get('td-table')) {
  customElements.define('td-table', TdTable);
}
