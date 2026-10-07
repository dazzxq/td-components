import { TdBaseElement } from '../base/td-base-element.js';
import { safeCssDimension, applyStyles } from '../utils/css-safe.js';
import { tdIcon, hasIcon, fillIconSlots } from '../icons/td-icon.js';
import { TdMenu } from '../feedback/td-menu.js';
import { cardRoles } from '../utils/table-card-role.js';
import { KeySelection, keyId } from '../utils/key-selection.js';
import { checkMarkHTML } from '../utils/check-mark.js';
import { TableTreeModel, compareRows } from '../utils/table-tree-model.js';
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
const STRUCTURAL = new Set(['title', 'heading-level', 'zebra', 'max-height', 'column-menu',
  'tree', 'children-key', 'parent-key', 'tree-column']);
/** v0.37.0: `selectable` values that turn row selection off (absent attribute = off too). */
const SELECT_OFF = new Set(['none', 'false', '0', 'off']);
/** Max length of a row name in the selection control's aria-label (QĐ 7). */
const ROW_LABEL_MAX = 80;
/** Row-selection controls (delegated listeners). */
const SELECT_CTL = '.td-table__select, .td-table__select-all';
/** v0.57.0 (QĐ 13): a lazy branch shows its "Đang tải…" row only after this delay (no flash; = td-tree LOADING_MS). */
const TREE_LOADING_MS = 400;
/** v0.57.0 (QĐ 7): the elements of a row that roving takes out of the Tab order (same list as layers.js FOCUSABLE). */
const ROVE_SEL = 'a[href], area[href], button, input:not([type="hidden"]), select, textarea, summary, iframe, '
  + 'object, embed, video[controls], audio[controls], [tabindex], [contenteditable]:not([contenteditable="false"])';

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
    if (n.nodeType === 1 && (n.classList.contains('td-table__cell-label') || n.classList.contains('td-table__tree-toggle')
      || n.classList.contains('td-table__tree-spacer'))) continue;
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
 *
 * v0.39.0 column show / hide (QĐ 6–10): a column may set `hideable` (default true; false for the card `primary` and
 * the `actions` column) and `hidden` (initial state). A hideable column needs a unique non-empty `key` (else it is not
 * hideable + one warning). Hiding = the `hidden` attribute on its th / td / skeleton cells — no re-render (focus,
 * selection kept); the sort of a hidden column is kept. The selection column is never hidden.
 * @attr {boolean} column-menu - A "Cột" button in the header opens a TdMenu of checkbox items (+ "Khôi phục mặc
 *   định" = the `hidden` flags of `columns`)
 * @attr {number} min-visible - Visible columns never go below this (default 1, ≥ 1): the last item that may still be
 *   turned off is locked (aria-disabled + hint)
 * @property {string[]} hiddenColumns - Keys of the hidden columns (get / set, silent; `null` → the `hidden` flags).
 *   The app persists it (from `columns-change`) and sets it back before the first render.
 * @fires columns-change - `{ hidden: string[], reason: 'toggle'|'reset' }` — user changes only
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
    // v0.39.0 column menu
    columns: 'Cột',
    columnsReset: 'Khôi phục mặc định',
    columnsMin: 'Cần ít nhất {n} cột',
    // v0.57.0 tree table. `{label}` = the row's name (as selectRow).
    expandRow: 'Mở {label}',
    collapseRow: 'Thu gọn {label}',
    treeLoading: 'Đang tải…',
    treeLoadError: 'Không tải được các dòng con',
    treeRetry: 'Thử lại',
    treeLoadingRow: 'Đang tải các dòng con của {label}…',
    treeLoaded: 'Đã tải {n} dòng con của {label}',
    treeLoadErrorRow: 'Không tải được các dòng con của {label}',
    treeRetrying: 'Đang tải lại…',
  };

  /** v0.37.0 (ADR 0018): form-associated for the optional `name` (the selected keys). NOT a TdFormElement. */
  static formAssociated = true;

  static get observedAttributes() {
    return ['per-page', 'active-color', 'zebra', 'loading', 'loading-rows', 'title', 'heading-level', 'aria-label',
      'empty-title', 'empty-text', 'server-mode', 'total-items', 'max-height',
      'selectable', 'row-key', 'max-selected', 'name', 'disabled', 'controlled', 'column-menu', 'min-visible',
      'tree', 'children-key', 'parent-key', 'tree-column', 'max-depth'];
  }

  // `zebra` is tri-state (default ON), so it is NOT a boolean attribute — see the `zebra` accessor.
  static get booleanAttributes() {
    return ['loading', 'server-mode', 'disabled', 'controlled', 'column-menu', 'tree'];
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
    /** Controlled: the latest requested state while waiting — the next request builds on it (a sort asked for, then a
     * filter typed before the answer, keeps that sort). */
    this._lastReq = null;
    /** A page change waiting for the end of its click (`_flushPage`). */
    this._pendingPage = null;
    /** `setState({ sort })` before the columns are known: resolved by key when they arrive. */
    this._pendingSortKey = null;
    /** `setState()` in progress: attribute updates do not re-render until it ends (one atomic update). */
    this._batching = false;
    // v0.39.0 column show / hide
    /** Keys asked to be hidden (hiddenColumns / user), or null = the `hidden` flags of `columns`. */
    this._hiddenKeys = null;
    /** Hidden column INDICES (resolved from _hiddenKeys, hideable + min-visible applied). */
    this._hidden = new Set();
    /** Per column: its key as a string when hideable (unique non-empty key), else null. */
    this._hideKeys = [];
    // v0.57.0 tree table (plan v0.57.0-tree-table): the model lives for the element's lifetime (expandedKeys before
    // the first render); it is rebuilt from `data` when `_treeDirty`.
    this._tree = new TableTreeModel({ keyOf: (row) => this._keyOf(row), warn: (msg) => console.warn(msg) });
    this._treeDirty = true;
    /** The body holds rows of the current model (incremental updates allowed). */
    this._treeRendered = false;
    this._loadChildren = null;
    this._rowHasChildren = null;
    this._canDrop = null;
    /** tr → { node, status, level, key, enabled, label } (rows of the current body). */
    this._trInfo = new WeakMap();
    /** node → its data row tr; node → its status row tr. */
    this._nodeTr = new WeakMap();
    this._statusTr = new WeakMap();
    /** Original tabindex of the controls roving took out of the Tab order (QĐ 7). */
    this._savedTab = new WeakMap();
    /** The roving row (tabindex 0) and its identity (survives re-renders): `{ id, status }`. */
    this._activeTr = null;
    this._activeKey = null;
    this._treeMo = null;
    /** Lazy loads: node → { timer, seq, announced } (QĐ 13). */
    this._loadTimers = new Map();
    /** Nodes whose "Đang tải…" status row is shown (after TREE_LOADING_MS, or at once after Retry). */
    this._statusShown = new Set();
    /** Server mode: local root-count change from moveRow until the app sends data / total-items (QĐ 17b.3). */
    this._rootDelta = 0;
    /** Full re-render: where the focus goes when its row is gone (moveRow). */
    this._refocusFallback = null;
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
    this.addEventListener('keydown', (e) => this._onTreeKeydown(e));
    this.addEventListener('focusin', (e) => this._onTreeFocusin(e));
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._ro?.disconnect();
    this._ro = null;
    // v0.57.0: requests in flight are aborted (opening again / reconnecting reloads); timers + observer go
    this._tree.abortAll();
    this._clearLoadTimers();
    this._treeMo?.disconnect();
    this._treeMo = null;
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

  /** v0.39.0: keys of the hidden columns, in column order (silent setter; `null` = the `hidden` flags of `columns`). */
  get hiddenColumns() {
    if (!this._columns.length) return this._hiddenKeys ? this._hiddenKeys.slice() : [];
    this._computeHidden();
    return [...this._hidden].sort((a, b) => a - b).map((ci) => this._hideKeys[ci]);
  }
  set hiddenColumns(v) {
    this._hiddenKeys = Array.isArray(v) ? v.filter((k) => k != null).map(String) : null;
    if (this._root) this._applyHidden();
  }
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
    // v0.57.0 (QĐ 11, Codex r1 #4): tree mode → identity → the OWNING node of the model (never an index into `data`)
    const tree = this._treeOn() ? this._treeModel() : null;
    for (const id of this._sel.ids()) {
      if (tree) {
        const row = tree.ownerOf(id)?.row ?? this._rowCache.get(id);
        if (row !== undefined) out.push(row);
        continue;
      }
      const di = this._isServerMode() ? undefined : this._dataRows().get(id);
      const row = (di === undefined ? undefined : this._data[di]) ?? this._rowCache.get(id);
      if (row !== undefined) out.push(row);
    }
    return out;
  }

  // --- v0.57.0 tree table: properties (plan v0.57.0-tree-table QĐ 4, 13, 18) ---

  /** Expanded keys: the known ones in preorder, then remembered ones not in the tree now. Set = replace, silent. */
  get expandedKeys() { return this._tree.expandedKeys(); }
  set expandedKeys(keys) {
    this._tree.setExpanded(keys);
    this._treeRefresh();
  }

  /** `(row, { signal }) => Promise<Array>|Array` — children of a lazy branch (`rowHasChildren`). */
  get loadChildren() { return this._loadChildren; }
  set loadChildren(fn) {
    this._loadChildren = typeof fn === 'function' ? fn : null;
    if (this._initialized && this._treeRendered) this._treeAutoLoad();
  }

  /** `(row) => boolean` — a row without children in the data that can load some (default `row.hasChildren === true`). */
  get rowHasChildren() { return this._rowHasChildren; }
  set rowHasChildren(fn) {
    this._rowHasChildren = typeof fn === 'function' ? fn : null;
    this._treeDirty = true;
    if (this._initialized && this._treeOn()) this._update();
  }

  /** `({ key, row, parentKey, parentRow, index, level }) => boolean` — may moveRow put a row there? A throw = false. */
  get canDrop() { return this._canDrop; }
  set canDrop(fn) { this._canDrop = typeof fn === 'function' ? fn : null; }

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
  /**
   * v0.34.0 QĐ 14: `table-layout: fixed` only when EVERY column is `widthType: 'fixed'` with a valid width. v0.39.0
   * (QĐ 8): every VISIBLE column.
   */
  _isFixedLayout() {
    const cols = this._columns.filter((_, ci) => !this._hidden.has(ci));
    return cols.length > 0 && cols.every((c) => c && c.widthType === 'fixed' && safeCssDimension(c.width, ''));
  }

  // --- v0.39.0 column show / hide (plan v0.39.0-filters-range QĐ 6–10) ---

  /** `min-visible` (integer ≥ 1, default 1), never above the number of columns. */
  _minVisible() {
    return Math.max(1, Math.min(this._int('min-visible', 1), Math.max(1, this._columns.length)));
  }

  _colMenuOn() { return this.hasAttribute('column-menu'); }

  /** @private Resolve `_hideKeys` + `_hidden` from the columns, `_hiddenKeys` and `min-visible`. */
  _computeHidden() {
    const cols = this._columns;
    const roles = this._cardRoles();
    const counts = new Map();
    for (const c of cols) {
      const k = c && c.key != null ? String(c.key) : '';
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    const treeCi = this._treeColIndex();
    this._hideKeys = cols.map((col, ci) => {
      const c = col || {};
      if (ci === treeCi) {
        // v0.57.0 (QĐ 14): the tree column (indent + toggle) is never hidden
        if (c.hideable === true || c.hidden === true) this._warnOnce('td-table: the tree column cannot be hidden — `hideable` / `hidden` ignored.');
        return null;
      }
      const hideable = typeof c.hideable === 'boolean' ? c.hideable
        : !(roles[ci] === 'primary' || roles[ci] === 'actions' || Array.isArray(c.actions));
      if (!hideable) return null;
      const k = c.key != null ? String(c.key) : '';
      if (!k || counts.get(k) > 1) {
        if (this._colMenuOn() || c.hidden === true || c.hideable === true) {
          this._warnOnce('td-table: a hideable column needs a unique, non-empty `key` — that column cannot be hidden.');
        }
        return null;
      }
      return k;
    });
    const want = new Set(this._hiddenKeys
      ?? cols.filter((c, ci) => c && c.hidden === true && this._hideKeys[ci] !== null).map((c) => String(c.key)));
    const hidden = [];
    this._hideKeys.forEach((k, ci) => { if (k !== null && want.has(k)) hidden.push(ci); });
    const min = this._minVisible();
    while (hidden.length && cols.length - hidden.length < min) {
      hidden.pop();
      this._warnOnce(`td-table: hiding these columns would leave fewer than min-visible (${min}) — some stay visible.`);
    }
    this._hidden = new Set(hidden);
  }

  /** @private ` hidden` for the cells of column `ci` (render strings). */
  _hiddenAttr(ci) { return this._hidden.has(ci) ? ' hidden' : ''; }

  /** @private Recompute and apply IN PLACE (no re-render): cells, fixed layout, empty colspan. */
  _applyHidden() {
    this._computeHidden();
    if (!this._table) return;
    const cells = this._table.querySelectorAll(':scope > thead > tr > [data-col], :scope > tbody > tr > [data-col]');
    for (const cell of cells) {
      const h = this._hidden.has(Number(cell.getAttribute('data-col')));
      if (cell.hidden !== h) cell.hidden = h;
    }
    this._root.classList.toggle('td-table--fixed', this._isFixedLayout());
    const empty = this._tbody.querySelector(':scope > .td-table__empty-row > .td-table__empty');
    if (empty) empty.setAttribute('colspan', String(this._emptySpan()));
    for (const td of this._tbody.querySelectorAll(':scope > .td-table__row--tree-status > td')) td.setAttribute('colspan', String(this._emptySpan()));
  }

  _emptySpan() {
    return Math.max(1, this._columns.length - this._hidden.size) + (this._selOn ? 1 : 0);
  }

  /** @private Items of the column menu (labels are text; ids `c{index}`). */
  _columnMenuItems() {
    this._computeHidden();
    const L = TdTable.labels;
    const min = this._minVisible();
    const visible = this._columns.length - this._hidden.size;
    const hint = fill(L.columnsMin, { n: min });
    const items = [];
    this._columns.forEach((col, ci) => {
      const key = this._hideKeys[ci];
      if (key === null) return;
      const c = col || {};
      const on = !this._hidden.has(ci);
      const locked = on && visible <= min;
      const text = c.label == null ? '' : String(c.label).trim();
      items.push({
        type: 'checkbox',
        id: `c${ci}`,
        label: text || key,
        checked: on,
        disabled: locked,
        hint: locked ? hint : '',
        onSelect: (ctx) => this._toggleColumn(ci, ctx.checked, ctx),
      });
    });
    if (!items.length) return [];
    items.push({ separator: true }, { id: 'reset', label: L.columnsReset, onSelect: () => this._resetColumns() });
    return items;
  }

  /** @private A user toggled a column in the menu (it stays open): apply, `columns-change`, re-lock the items. */
  _toggleColumn(ci, show, ctx) {
    const key = this._hideKeys[ci];
    if (key == null) return;
    const keys = new Set(this.hiddenColumns);
    if (show) keys.delete(key);
    else keys.add(key);
    this._hiddenKeys = [...keys];
    this._applyHidden();
    this.emit('columns-change', { hidden: this.hiddenColumns, reason: 'toggle' });
    if (!ctx || typeof ctx.setDisabled !== 'function') return;
    const min = this._minVisible();
    const visible = this._columns.length - this._hidden.size;
    const hint = fill(TdTable.labels.columnsMin, { n: min });
    this._hideKeys.forEach((k, i) => {
      if (k === null) return;
      const locked = !this._hidden.has(i) && visible <= min;
      ctx.setDisabled(`c${i}`, locked, locked ? hint : '');
    });
  }

  /** @private "Khôi phục mặc định": back to the `hidden` flags of `columns`. */
  _resetColumns() {
    this._hiddenKeys = null;
    this._applyHidden();
    this.emit('columns-change', { hidden: this.hiddenColumns, reason: 'reset' });
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
    if (name === 'min-visible') { if (this._root) this._applyHidden(); return; }
    if (name === 'disabled') { this._paintSelection(); return; }
    // v0.57.0: tree structure attributes rebuild the model; `max-depth` is read by moveRow; a new `total-items` is the
    // app's truth again (the local root-count change of moveRow is dropped — QĐ 17b.3)
    if (name === 'max-depth') return;
    if (name === 'tree' || name === 'children-key' || name === 'parent-key') this._treeDirty = true;
    if (name === 'total-items') this._rootDelta = 0;
    if (name === 'loading' && newVal === null) { this._awaiting = false; this._reqSort = null; this._lastReq = null; }
    if (STRUCTURAL.has(name)) this._doRender();
    else this._update();
  }

  /** @private The row identity changed: clear the selection (no event) and rebuild. */
  _rowKeyChanged() {
    this._dataIndex = null;
    this._treeDirty = true;
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
    this._computeHidden();
    const title = this._getTitle();
    const h = `h${this._getHeadingLevel()}`;
    const tree = this._treeOn();
    const mods = (this._isZebra() ? ' td-table--zebra' : '')
      + (this._isFixedLayout() ? ' td-table--fixed' : '')
      + (this._getMaxHeight() ? ' td-table--scroll-y' : '')
      + (tree ? ' td-table--tree' : '');
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
        + ` data-card="${roles[ci]}"${this._hiddenAttr(ci)}>${inner}</th>`;
    }).join('');
    const titleHtml = title ? `<${h} class="td-table__title" id="${esc(this._titleId)}">${esc(title)}</${h}>` : '';
    const selHead = this._selOn ? this._selectHeadHtml() : '';
    // v0.39.0: the column menu button (between the title and the top pagination)
    const colBtn = this._colMenuOn()
      ? '<button type="button" class="td-btn td-btn--ghost td-btn--sm td-table__columns" aria-haspopup="menu" aria-expanded="false">'
        + '<span class="td-table__columns-icon" data-td-icon="columns" data-td-icon-size="16" aria-hidden="true"></span>'
        + `<span class="td-table__columns-label">${esc(TdTable.labels.columns)}</span></button>`
      : '';
    const pag = (cls, label, quiet) => `<div class="${cls}"${quiet ? ' hidden' : ''}><td-pagination${quiet ? ' quiet' : ''}`
      + ` item-label="${esc(TdTable.labels.itemLabel)}" aria-label="${esc(label)}"></td-pagination></div>`;
    return `<div class="td-table${mods}" data-state="ready">`
      + `<div class="td-table__header">${titleHtml}${colBtn}${pag('td-table__pagination', TdTable.labels.paginationTop, true)}</div>`
      + `<div class="td-table__scroll"><table class="td-table__table" role="${tree ? 'treegrid' : 'table'}">`
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
    if (this.hasAttribute('tree') && !this.rowKey) {
      this._warnOnce('td-table: `tree` needs `rowKey` (row-key) — only the root rows are shown, as a flat table.');
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
    // v0.57.0 (QĐ 7): roving tabindex is re-applied to rows whose content changes (app controls re-rendering)
    this._treeMo?.disconnect();
    this._treeMo = null;
    this._activeTr = null;
    this._treeRendered = false;
    if (this._treeOn() && typeof MutationObserver !== 'undefined') {
      this._treeMo = new MutationObserver((recs) => this._onTreeMutations(recs));
      this._treeMo.observe(this._tbody, { childList: true, subtree: true });
    }
    this._selAll = this._selOn ? this._table.querySelector(':scope > thead > tr > th > .td-table__select-all') : null;
    if (this._selAll) fillIconSlots(this._selAll);
    const colBtn = this._header.querySelector(':scope > .td-table__columns');
    if (colBtn) {
      fillIconSlots(colBtn);
      TdMenu.bind(colBtn, () => this._columnMenuItems(), { align: 'end' });
    }
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
    if (this._treeOn()) return this._treeView();
    // v0.57.0 (QĐ 1): `tree` without rowKey → the roots only (parent-key data: rows without a parent key)
    const pk = this.hasAttribute('tree') ? this._parentKeyAttr() : '';
    const isRoot = (row) => keyId(readKeyField(row, pk)) === null;
    if (this._isServerMode()) {
      const total = this._getServerTotal();
      if (total !== null) {
        const pages = Math.max(1, Math.ceil(total / this._getPerPage()));
        this._currentPage = Math.min(Math.max(1, this._currentPage), pages);
      }
      return { rows: pk ? this._data.filter(isRoot) : this._data, src: null, total };
    }
    // review ISSUE-4: sort / page SOURCE INDICES (into `data`), so row selection knows which occurrence a row is
    let order = this._sortedIndices();
    if (pk) order = order.filter((i) => isRoot(this._data[i]));
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
    const cmp = col ? compareRows(col.key, direction) : null;
    if (!cmp) return idx;
    return idx.sort((ia, ib) => cmp(data[ia], data[ib]));
  }

  _update() {
    if (!this._root || this._batching) return;
    const loading = this._isLoading();
    const server = this._isServerMode();
    const active = document.activeElement;
    if (active && (this._pagTop?.contains(active) || this._pagBottom?.contains(active))) {
      this._refocusPagination = this._pagTop.contains(active) ? 'top' : 'bottom';
    }
    const { rows, src, total, entries } = this._view();
    const empty = !loading && rows.length === 0;
    // v0.57.0 (QĐ 7): a full re-render with the focus in the body → the row with the same key gets it back
    const refocus = entries ? this._treeFocusState() : null;

    // Body
    if (loading || empty) {
      this._pageKeys = [];
      this._pageEnabled = [];
      this._pageLabels = [];
    }
    if (loading) this._tbody.innerHTML = this._skeletonHtml();
    else if (empty) this._renderEmpty();
    else if (entries) this._renderTree(entries);
    else this._renderRows(rows, src);
    this._treeRendered = !!entries && !loading && !empty;
    if (!this._treeRendered) this._activeTr = null;
    this._pageRows = loading || empty ? [] : rows;
    this._paintSelection();

    const showPag = this._syncPag(total, loading, server);

    // State + naming
    this._root.setAttribute('data-state', loading ? 'loading' : empty ? 'empty' : 'ready');
    if (loading) this._table.setAttribute('aria-busy', 'true');
    else this._table.removeAttribute('aria-busy');
    const statusText = loading ? TdTable.labels.loading : '';
    if (this._status.textContent !== statusText) this._status.textContent = statusText;
    this._applyName(this._table);
    this._applyStyles();
    this._syncOverflow();

    if (this._treeRendered) {
      this._treeRovingAll();
      this._treeRefocus(refocus);
      this._treeAutoLoad();
    }

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

  /**
   * @private Paginations (updated in place: live region + focus restore stay inside td-pagination). v0.39.0: a
   * controlled request in flight keeps them (focus stays on the activated page button).
   * @returns {boolean} shown
   */
  _syncPag(total, loading, server) {
    let showPag = !loading || this._awaiting;
    const count = total;
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
    this._header.hidden = !showPag && !this._getTitle() && !this._colMenuOn();
    return showPag;
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
    const P = this._rowParts();
    if (this._selOn) this._pageSelection(rows, src);
    this._tbody.innerHTML = rows.map((row, ri) => this._rowHtml(row, ri, P, null)).join('');
    this._bindRows([...this._tbody.children], rows, 0, null, true);
  }

  /** @private What every row of one render shares (v0.57.0: split out of _renderRows — QĐ 12). */
  _rowParts() {
    const esc = (v) => this.escapeHtml(v);
    const cols = this._columns;
    const labels = cols.map((col) => {
      const l = col && col.label != null ? String(col.label) : '';
      return `<span class="td-table__cell-label" aria-hidden="true">${esc(l)}</span>`;
    });
    const tree = this._treeOn();
    const cellRole = tree ? 'gridcell' : 'cell';
    // v0.37.0: the selection cell comes first (no data-col: data columns keep 0..n-1); its state is painted after.
    const selCell = this._selOn ? `<td class="td-table__cell td-table__cell--select td-table__card-select" role="${cellRole}" data-card="select">`
      + `<button type="button" class="td-table__select" role="checkbox" aria-checked="false">${checkMarkHTML('md')}</button></td>` : '';
    return { esc, pad: this._cellPadClass(), cols, roles: this._cardRoles(), labels, selCell, cellRole, treeCi: tree ? this._treeColIndex() : -1 };
  }

  /**
   * @private One body row. `e` = the tree entry (`{ node, level, setsize, posinset }`) or null (flat table: the markup
   * is byte-identical to v0.54).
   */
  _rowHtml(row, ri, P, e) {
    const { esc, pad, cols, roles, labels } = P;
    const cells = cols.map((col, ci) => {
      const c = col || {};
      const actions = Array.isArray(c.actions);
      const treeCell = ci === P.treeCi;
      const cls = `td-table__cell${c.ellipsis && !actions ? ' td-table__cell--ellipsis' : ''}`
        + `${this._isNowrap(c) ? ' td-table__cell--nowrap' : ''}${actions ? ' td-table__cell--actions' : ''}`
        + `${treeCell ? ' td-table__cell--tree' : ''}${pad}`;
      const attrs = `class="${cls}" role="${P.cellRole}" data-col="${ci}" data-col-key="${esc(String(c.key ?? ''))}"`
        + ` data-card="${roles[ci]}"${this._hiddenAttr(ci)}`;
      // v0.57.0 (QĐ 8, QĐ 14): the toggle (or a same-width spacer) leads the tree cell, outside .td-table__truncate
      const lead = treeCell ? labels[ci] + this._treeToggleHtml(e.node) : labels[ci];
      if (actions) return `<td ${attrs}>${lead}${this._actionsHtml(c, row)}</td>`;
      if (typeof c.render === 'function') return `<td ${attrs}>${lead}</td>`;
      const v = row && typeof row === 'object' ? row[c.key] : undefined;
      const text = v == null ? '' : String(v);
      if (c.ellipsis) return `<td ${attrs}>${lead}<div class="td-table__truncate" title="${esc(text)}">${esc(text)}</div></td>`;
      return `<td ${attrs}>${lead}${esc(text)}</td>`;
    }).join('');
    return `<tr class="td-table__row" role="row" data-row-idx="${ri}"${e ? this._treeRowAttrs(e) : ''}>${P.selCell}${cells}</tr>`;
  }

  /**
   * @private After rows are in the DOM: action icons + card menus, `render` cells (column by column), selection names.
   * `at` = the page index of the first row (number) or one index per row (array, tree inserts); `entries` (tree) adds
   * the `ctx` argument of `render`; `full` = the rows are the whole body.
   */
  _bindRows(trs, rows, at, entries, full) {
    const cols = this._columns;
    const sel = this._selOn;
    const riOf = (i) => (Array.isArray(at) ? at[i] : at + i);
    // Actions (QĐ 18): icons from the registry, the "Thao tác" menu button bound as an APG menu button (TdMenu).
    // v0.57.0 (QĐ 12, Codex r1 #3): the menu reads its row LIVE from the button (never an index frozen at render).
    if (cols.some((c) => c && Array.isArray(c.actions))) {
      if (full) fillIconSlots(this._tbody, '.td-table__actions [data-td-icon]');
      else for (const tr of trs) fillIconSlots(tr, '.td-table__actions [data-td-icon]');
      for (const tr of trs) {
        for (const btn of tr.querySelectorAll('.td-table__actions-menu')) {
          const ci = Number(btn.closest('td').getAttribute('data-col'));
          TdMenu.bind(btn, () => this._menuItems(ci, btn), { align: 'end' });
        }
      }
    }

    // Render cells, resolved by column INDEX (fixes 2.8.4). CONSUMER HATCH: a string is trusted developer HTML.
    // The cell already holds its aria-hidden card label, so content is APPENDED after it.
    cols.forEach((col, ci) => {
      if (!col || typeof col.render !== 'function' || Array.isArray(col.actions)) return;
      trs.forEach((tr, i) => {
        const row = rows[i];
        const ri = riOf(i);
        const td = tr.children[ci + (sel ? 1 : 0)];
        let out;
        try {
          out = entries ? col.render(row, ri, this._renderCtx(entries[i])) : col.render(row, ri);
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

    if (entries) return; // tree: names + toggles in _treeLabels
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

  /**
   * @private TdMenu items of the card-mode menu (labels are text; disabled items are inert). v0.57.0 (QĐ 12, Codex r1
   * #3): the row is read LIVE from the menu button when the menu opens, and checked again when an item is chosen — a
   * row that left the body (branch closed, page changed) or whose index now points at another row → nothing.
   */
  _menuItems(ci, btn) {
    const col = this._columns[ci];
    const tr = btn.closest('tr');
    const ri = tr && tr.parentElement === this._tbody ? Number(tr.getAttribute('data-row-idx')) : -1;
    if (!col || !Array.isArray(col.actions) || !(ri >= 0 && ri < this._pageRows.length)) return [];
    const row = this._pageRows[ri];
    return this._rowActions(col, row).map(({ a, idx, disabled }) => ({
      label: a.label == null ? '' : String(a.label),
      icon: typeof a.icon === 'string' && hasIcon(a.icon) ? a.icon : undefined,
      danger: a.variant === 'danger',
      disabled,
      onSelect: () => {
        if (!tr.isConnected || tr.parentElement !== this._tbody) return;
        const now = Number(tr.getAttribute('data-row-idx'));
        if (this._pageRows[now] !== row) return;
        this._fireRowAction(ci, idx, now);
      },
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
    const n = this._emptySpan();
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
      + ` data-card="${roles[ci]}"${this._hiddenAttr(ci)}><span class="td-table__skeleton"></span></td>`).join('')
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
    // v0.57.0: the tree toggle (QĐ 8) and the "Thử lại" button of a failed lazy branch (QĐ 13)
    const tt = t && this._treeRendered ? t.closest('.td-table__tree-toggle, .td-table__tree-retry') : null;
    if (tt && tt.closest('td-table') === this) {
      const tr = tt.closest('tr');
      const info = tr && this._trInfo.get(tr);
      if (!info) return;
      if (tt.classList.contains('td-table__tree-retry')) this._treeRetry(tr);
      else this._treeSetExpanded(info.node, !this._tree.isExpanded(info.node), true);
      return;
    }
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
    const cur = this._pendingState();
    const s = { ...cur, ...over };
    const state = Object.freeze({
      page: s.page,
      perPage: s.perPage,
      sort: Object.freeze({ key: s.sort.key, direction: s.sort.direction }),
      filters: s.filters,
    });
    if (this._isControlled()) {
      this._awaiting = true;
      this._lastReq = state;
      if (!this.hasAttribute('loading')) this.setAttribute('loading', '');
    }
    this.emit('request-change', { state, reason, requestId });
  }

  /** @private The state a new request builds on: the latest one asked for while a controlled request waits, else the table's. */
  _pendingState() {
    if (this._awaiting && this._lastReq) return this._lastReq;
    return { page: this._currentPage, perPage: this._getPerPage(), sort: this._sortState(), filters: this._filters };
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
    this._treeDirty = true;
    this._rootDelta = 0;
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
      // v0.57.0 (QĐ 10): a client tree counts its ROOTS (the paginations page roots)
      totalItems: this._isServerMode() ? this._getServerTotal() : this._treeOn() ? this._treeModel().roots.length : this._data.length,
      requestId: this._reqSeq,
      selection: { mode: this._selMode(), keys: this._sel.keys() },
      expandedKeys: this._tree.expandedKeys(),
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
        this._treeDirty = true;
        this._rootDelta = 0;
        if (!this._isServerMode()) this._currentPage = 1;
      }
      if ('expandedKeys' in o) this._tree.setExpanded(o.expandedKeys); // v0.57.0 (QĐ 4)
      const page = num(o.page);
      if (Number.isFinite(page)) this._currentPage = Math.max(1, page);
      if (hasData) {
        this._awaiting = false;
        this._reqSort = null;
        this._lastReq = null;
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
    const page = opts && opts.resetPage === false ? this._pendingState().page : 1;
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

  // --- v0.57.0 tree table: public API (plan v0.57.0-tree-table QĐ 4, 17) — all silent (no event) ---

  /** Open a row's branch (a lazy one loads). An unknown key is remembered (opened when it shows up). */
  expand(key) {
    const n = this._treeOn() ? this._treeModel().node(key) : null;
    if (n) this._treeSetExpanded(n, true, false);
    else this._tree.expand(key);
  }

  /** Close a row's branch. */
  collapse(key) {
    const n = this._treeOn() ? this._treeModel().node(key) : null;
    if (n) this._treeSetExpanded(n, false, false);
    else this._tree.collapse(key);
  }

  /** Open ↔ close. */
  toggleExpanded(key) {
    const n = this._treeOn() ? this._treeModel().node(key) : null;
    if (n ? this._tree.isExpanded(n) : this._tree.expandedKeys().some((k) => keyId(k) === keyId(key))) this.collapse(key);
    else this.expand(key);
  }

  /** Open every LOADED branch (lazy branches are not loaded — no request storm). */
  expandAll() {
    if (this._treeOn()) this._treeModel().expandAll();
    this._treeRefresh();
  }

  /** Close every branch (also forgets remembered keys of rows that are gone). */
  collapseAll() {
    this._tree.collapseAll();
    this._treeRefresh();
  }

  /**
   * Move a row (with its branch) under `parentKey` (null = root) at `index` = its FINAL position (from 0) among the new
   * siblings, counted after removing it (QĐ 17). `index` must be an integer ≥ 0 (a larger one = the end). Refused
   * (unknown key / parent, the parent's children not loaded, into itself or its branch, deeper than `max-depth`,
   * `canDrop` false / throwing, bad index) → false + one warning, nothing changes. The same place → true, nothing
   * happens. The app's `data` is never written: the new order lives in the table (getTree()). Silent.
   * @returns {boolean}
   */
  moveRow(key, parentKey = null, index = 0) {
    if (!this._treeOn()) {
      this._warnOnce('td-table: moveRow needs `tree` and `rowKey`.');
      return false;
    }
    const m = this._treeModel();
    const focus = this._treeRendered ? this._treeFocusState() : null;
    const r = m.move(key, parentKey, index, { maxDepth: this._maxDepth(), canDrop: this._canDrop });
    if (!r.ok) return false;
    if (r.noop) return true;
    const server = this._isServerMode();
    // QĐ 17b.3: server mode keeps a LOCAL root-count change until the app sends data / total-items again
    if (server) this._rootDelta += (r.to.parent === null ? 1 : 0) - (r.from.parent === null ? 1 : 0);
    if (!this._initialized || !this._root || this._batching || this._isLoading() || !this._treeRendered) return true;
    let inBlock = false;
    for (let p = focus ? focus.node : null; p; p = p.parent) if (p === r.node) inBlock = true;
    // QĐ 17b.6: focus inside the moved block whose row is no longer shown → the new parent, else the row now at the
    // old place (next, then previous)
    const fallback = inBlock ? () => {
      const ptr = r.node.parent ? this._nodeTr.get(r.node.parent) : null;
      if (ptr && ptr.parentElement === this._tbody) return ptr;
      const rows = this._rovingRows();
      return rows[focus.index] || rows[focus.index - 1] || null;
    } : null;
    if (!server && (r.from.parent === null || r.to.parent === null)) {
      // client mode: the page is cut by roots → the whole page again
      this._refocusFallback = fallback;
      try { this._update(); } finally { this._refocusFallback = null; }
    } else {
      this._treeSync({ fallback });
    }
    return true;
  }

  /** The tree in the table's order: `[{ key, row, children: [...] | null }]` (null = lazy, not loaded yet). */
  getTree() {
    return this._treeOn() ? this._treeModel().getTree() : [];
  }

  // --- v0.57.0 tree table: internals ---

  /** @private `tree` is on AND a rowKey exists (else the roots as a flat table + one warning — QĐ 1). */
  _treeOn() { return this.hasAttribute('tree') && !!this.rowKey; }

  _parentKeyAttr() { return (this.getAttribute('parent-key') || '').trim(); }

  /** @private `max-depth` (integer ≥ 1, default 16 = TREE_MAX_DEPTH, capped there by the model). */
  _maxDepth() {
    const raw = (this.getAttribute('max-depth') || '').trim();
    const n = Number(raw);
    if (!raw) return 16;
    if (Number.isInteger(n) && n >= 1) return n;
    this._warnOnce(`td-table: ignored invalid max-depth "${raw}" — use an integer ≥ 1.`);
    return 16;
  }

  /** @private The model, rebuilt from `data` when something structural changed. */
  _treeModel() {
    if (this._treeDirty) {
      // Codex r2 #2: a build that throws (a row getter / proxy) propagates and keeps the old tree, its timers and the
      // dirty flag — only a successful build is committed
      this._tree.setData(this._data, {
        childrenKey: (this.getAttribute('children-key') || '').trim() || 'children',
        parentKey: this._parentKeyAttr() || null,
        hasChildren: this._rowHasChildren || ((row) => !!row && typeof row === 'object' && row.hasChildren === true),
        readField: readKeyField,
      });
      this._treeDirty = false;
      this._clearLoadTimers();
    }
    return this._tree;
  }

  /**
   * @private Index of the tree column (QĐ 14): `tree-column` = a column key; default = the card `primary` column, else
   * the first column that is not an `actions` column (an actions column never holds the tree).
   */
  _treeColIndex() {
    if (!this._treeOn() || !this._columns.length) return -1;
    const cols = this._columns;
    const isAct = (c) => !!c && Array.isArray(c.actions);
    const want = (this.getAttribute('tree-column') || '').trim();
    if (want) {
      const ci = cols.findIndex((c) => c && String(c.key ?? '') === want);
      if (ci >= 0 && !isAct(cols[ci])) return ci;
      this._warnOnce(ci >= 0 ? `td-table: tree-column "${want}" is an actions column — the default tree column is used.`
        : `td-table: tree-column "${want}" is not a column key — the default tree column is used.`);
    }
    const pi = this._cardRoles().indexOf('primary');
    if (pi >= 0 && !isAct(cols[pi])) return pi;
    const first = cols.findIndex((c) => !isAct(c));
    return first >= 0 ? first : 0;
  }

  /** @private The current client sort as a row comparator (null = model order). */
  _sortCmp() {
    const { col: ci, direction } = this._sort;
    const col = ci === null ? null : this._columns[ci];
    return col ? compareRows(col.key, direction) : null;
  }

  /**
   * @private Tree view (QĐ 9, 10, 17b.3): client → roots sorted within their group, paged BY ROOT; server → the roots
   * of `data` as they are, the root count = `total-items` + the local moveRow change. `total` feeds the paginations,
   * `entries` = the rows to show (+ status rows).
   */
  _treeView() {
    const m = this._treeModel();
    const per = this._getPerPage();
    const server = this._isServerMode();
    const cmp = server ? null : this._sortCmp();
    let roots;
    let total;
    let ariaTotal;
    if (server) {
      roots = m.roots;
      const t = this._getServerTotal();
      if (t === null) total = null;
      else if (this._rootDelta === 0) {
        const pages = Math.max(1, Math.ceil(t / per));
        this._currentPage = Math.min(Math.max(1, this._currentPage), pages);
        total = t;
      } else {
        // a provisional count: never cut / clamp the page; at least the current page stays in range
        ariaTotal = Math.max(0, t + this._rootDelta);
        total = Math.max(ariaTotal, (this._currentPage - 1) * per + 1);
      }
    } else {
      const sorted = m.sortedRoots(cmp);
      const pages = Math.max(1, Math.ceil(sorted.length / per));
      this._currentPage = Math.min(Math.max(1, this._currentPage), pages);
      const start = (this._currentPage - 1) * per;
      roots = sorted.slice(start, start + per);
      total = sorted.length;
    }
    const offset = (this._currentPage - 1) * per;
    if (ariaTotal === undefined) ariaTotal = total === null ? offset + roots.length : total;
    const entries = m.visible(roots, cmp, { offset, total: ariaTotal, status: (n) => this._statusOf(n) });
    const rows = [];
    for (const e of entries) if (!e.status) rows.push(e.node.row);
    return { rows, src: null, total, entries };
  }

  /** @private The status row of an open branch without children: 'error' | 'loading' (after the delay) | null. */
  _statusOf(node) {
    if (node.loadError) return 'error';
    return node.loading && this._statusShown.has(node) ? 'loading' : null;
  }

  /** @private ` aria-level … tabindex` of a tree row (QĐ 6): aria-expanded only on parents; aria-busy while loading. */
  _treeRowAttrs(e) {
    const m = this._tree;
    const n = e.node;
    const can = m.expandable(n);
    return ` aria-level="${e.level}" aria-setsize="${e.setsize}" aria-posinset="${e.posinset}"`
      + (can ? ` aria-expanded="${m.isExpanded(n) ? 'true' : 'false'}"` : '')
      + (n.loading ? ' aria-busy="true"' : '') + ' tabindex="-1"';
  }

  /** @private The toggle (QĐ 8: a real button, out of the Tab order, named in _treeLabels) or a spacer for a leaf. */
  _treeToggleHtml(node) {
    if (!this._tree.expandable(node)) return '<span class="td-table__tree-spacer" aria-hidden="true"></span>';
    return '<button type="button" class="td-table__tree-toggle" tabindex="-1">'
      + '<span class="td-table__tree-icon" data-td-icon="next" data-td-icon-size="16" aria-hidden="true"></span></button>';
  }

  /** @private `ctx` of `render(row, rowIndex, ctx)` (QĐ 12). */
  _renderCtx(e) {
    const m = this._tree;
    const n = e.node;
    const can = m.expandable(n);
    return { level: e.level, parentKey: n.parent ? n.parent.key : null, hasChildren: can, expanded: can && m.isExpanded(n) };
  }

  /** @private Per-row record kept on the tr: identity, level, parent at render, selection key / enabled, name. */
  _treeRowInfo(e) {
    const n = e.node;
    const key = n.id !== null && !n.dup ? n.key : null;
    const enabled = this._selOn && key !== null && this._isRowSelectable(n.row);
    if (key !== null && this._sel.has(key)) this._rowCache.set(n.id, n.row);
    return { node: n, status: null, level: e.level, parent: n.parent, key, enabled, label: '' };
  }

  /** @private A status row (QĐ 13, Codex r2 #7): a real treegrid row of level n + 1 in the roving list. */
  _statusRowHtml(e, P) {
    const L = TdTable.labels;
    const esc = P.esc;
    const body = e.status === 'error'
      ? `<span class="td-table__tree-status-text">${esc(L.treeLoadError)}</span>`
        + `<button type="button" class="td-btn td-btn--sm td-btn--secondary td-table__tree-retry">${esc(L.treeRetry)}</button>`
      : `<span class="td-table__tree-status-text">${esc(L.treeLoading)}</span>`;
    return `<tr class="td-table__row td-table__row--tree-status" role="row" aria-level="${e.level}" aria-setsize="1"`
      + ` aria-posinset="1" tabindex="-1"><td class="td-table__cell td-table__tree-status${P.pad}" role="gridcell"`
      + ` colspan="${this._emptySpan()}" data-state="${e.status}">${body}</td></tr>`;
  }

  /** @private Register a new tr: info, node → tr, CSSOM indent level (CSP-safe). */
  _treeAdopt(tr, info) {
    this._trInfo.set(tr, info);
    (info.status ? this._statusTr : this._nodeTr).set(info.node, tr);
    tr.style.setProperty('--td-table-tree-level', String(info.level - 1));
  }

  /** @private Full body render of the tree (sort / page / data / columns). */
  _renderTree(entries) {
    const P = this._rowParts();
    const infos = [];
    const html = [];
    let ri = 0;
    for (const e of entries) {
      if (e.status) {
        infos.push({ node: e.node, status: e.status, level: e.level });
        html.push(this._statusRowHtml(e, P));
        continue;
      }
      infos.push(this._treeRowInfo(e));
      html.push(this._rowHtml(e.node.row, ri, P, e));
      ri += 1;
    }
    this._tbody.innerHTML = html.join('');
    const trs = [];
    const data = [];
    [...this._tbody.children].forEach((tr, i) => {
      this._treeAdopt(tr, infos[i]);
      if (!infos[i].status) {
        trs.push(tr);
        data.push(entries[i]);
      }
    });
    this._bindRows(trs, data.map((e) => e.node.row), 0, data, true);
    this._treeLabels(trs, 0, true);
    this._treeArrays(trs);
  }

  /**
   * @private Names (like v0.37 `_bindSelectRows`: the primary cell's text, else rowFallback) → the selection control
   * and the toggle's "Mở / Thu gọn {label}"; icons of the new toggles / marks.
   */
  _treeLabels(trs, at, full) {
    const L = TdTable.labels;
    const pi = this._cardRoles().indexOf('primary');
    const sel = '.td-table__tree-toggle [data-td-icon], .td-table__select [data-td-icon]';
    if (full) fillIconSlots(this._tbody, sel);
    else for (const tr of trs) fillIconSlots(tr, sel);
    trs.forEach((tr, i) => {
      const info = this._trInfo.get(tr);
      const td = pi >= 0 ? tr.querySelector(`:scope > [data-col="${pi}"]`) : null;
      info.label = (td && cellText(td)) || fill(L.rowFallback, { n: (Array.isArray(at) ? at[i] : at + i) + 1 });
      tr.querySelector(':scope > .td-table__cell--select > .td-table__select')?.setAttribute('aria-label', fill(L.selectRow, { label: info.label }));
      this._treeToggleLabel(tr);
    });
  }

  /** @private The toggle's name follows the state ("Mở {label}" / "Thu gọn {label}"). */
  _treeToggleLabel(tr) {
    const info = this._trInfo.get(tr);
    const t = tr.querySelector(':scope > .td-table__cell--tree > .td-table__tree-toggle');
    if (!t || !info) return;
    const L = TdTable.labels;
    const v = fill(this._tree.isExpanded(info.node) ? L.collapseRow : L.expandRow, { label: info.label });
    if (t.getAttribute('aria-label') !== v) t.setAttribute('aria-label', v);
  }

  /** @private The page arrays (row-action / selection / labels) + `data-row-idx`, from the data rows in DOM order. */
  _treeArrays(trs) {
    this._pageRows = [];
    this._pageKeys = [];
    this._pageEnabled = [];
    this._pageLabels = [];
    trs.forEach((tr, i) => {
      const info = this._trInfo.get(tr);
      const v = String(i);
      if (tr.getAttribute('data-row-idx') !== v) tr.setAttribute('data-row-idx', v);
      this._pageRows.push(info.node.row);
      this._pageKeys.push(info.key);
      this._pageEnabled.push(info.enabled);
      this._pageLabels.push(info.label);
    });
  }

  /** @private A reused row after a tree change: ARIA numbers, expanded / busy, toggle ↔ spacer (leaf ↔ parent). */
  _treeUpdateRow(tr, e) {
    const m = this._tree;
    const n = e.node;
    const set = (a, v) => { if (tr.getAttribute(a) !== v) tr.setAttribute(a, v); };
    set('aria-setsize', String(e.setsize));
    set('aria-posinset', String(e.posinset));
    const can = m.expandable(n);
    if (can) set('aria-expanded', m.isExpanded(n) ? 'true' : 'false');
    else tr.removeAttribute('aria-expanded');
    if (n.loading) set('aria-busy', 'true');
    else tr.removeAttribute('aria-busy');
    const cell = tr.querySelector(':scope > .td-table__cell--tree');
    if (cell) {
      const t = cell.querySelector(':scope > .td-table__tree-toggle');
      const sp = cell.querySelector(':scope > .td-table__tree-spacer');
      if (can && !t && sp) {
        const tpl = document.createElement('template');
        tpl.innerHTML = this._treeToggleHtml(n);
        const btn = tpl.content.firstElementChild;
        sp.replaceWith(btn);
        fillIconSlots(btn);
      } else if (!can && t) {
        const focused = t === document.activeElement;
        const span = document.createElement('span');
        span.className = 'td-table__tree-spacer';
        span.setAttribute('aria-hidden', 'true');
        t.replaceWith(span);
        if (focused) tr.focus();
      }
    }
    this._treeToggleLabel(tr);
  }

  /**
   * @private Incremental update of the body after open / close / load / moveRow (QĐ 12, 17b): rows that stay are KEPT
   * (same nodes, focus, app state), new rows are rendered and bound alone (`render` only for them — and for a row whose
   * level or parent changed), rows that leave are removed; then the page arrays, data-row-idx, ARIA numbers, selection
   * paint, roving and focus. Anything structural (data, loading, empty) → the full `_update()`.
   * @param {{ fallback?: Function|null }} [opts] where the focus goes when its row left (default: the nearest shown
   *   ancestor, then the row now at the old place)
   */
  _treeSync(opts = {}) {
    if (!this._root || this._batching) return;
    if (this._isLoading() || this._treeDirty || !this._treeRendered) {
      this._update();
      return;
    }
    const { rows, entries, total } = this._view();
    if (!rows.length) {
      this._update();
      return;
    }
    const tbody = this._tbody;
    const focus = this._treeFocusState();
    const oldTrs = [...tbody.children];
    const keepData = new Map();
    const keepStatus = new Map();
    for (const tr of oldTrs) {
      const info = this._trInfo.get(tr);
      if (info) (info.status ? keepStatus : keepData).set(info.node, tr);
    }
    const P = this._rowParts();
    const want = [];
    const fresh = [];
    let ri = 0;
    for (const e of entries) {
      if (e.status) {
        const tr = keepStatus.get(e.node);
        const info = tr && this._trInfo.get(tr);
        if (info && info.status === e.status && info.level === e.level) {
          keepStatus.delete(e.node);
          want.push(tr);
        } else {
          fresh.push({ at: want.length, e, html: this._statusRowHtml(e, P) });
          want.push(null);
        }
        continue;
      }
      const tr = keepData.get(e.node);
      const info = tr && this._trInfo.get(tr);
      if (info && info.level === e.level && info.parent === e.node.parent) {
        keepData.delete(e.node);
        want.push(tr);
        this._treeUpdateRow(tr, e);
      } else {
        fresh.push({ at: want.length, e, ri, html: this._rowHtml(e.node.row, ri, P, e) });
        want.push(null);
      }
      ri += 1;
    }
    const keep = new Set(want);
    for (const tr of oldTrs) if (!keep.has(tr)) tr.remove();
    if (fresh.length) {
      const tpl = document.createElement('template');
      tpl.innerHTML = `<table><tbody>${fresh.map((f) => f.html).join('')}</tbody></table>`;
      const made = [...tpl.content.querySelector('tbody').children];
      fresh.forEach((f, k) => {
        want[f.at] = made[k];
        this._treeAdopt(made[k], f.e.status ? { node: f.e.node, status: f.e.status, level: f.e.level } : this._treeRowInfo(f.e));
      });
    }
    let cursor = tbody.firstElementChild;
    for (const tr of want) {
      if (tr === cursor) cursor = cursor.nextElementSibling;
      else tbody.insertBefore(tr, cursor);
    }
    const freshData = fresh.filter((f) => !f.e.status);
    if (freshData.length) {
      const trs = freshData.map((f) => want[f.at]);
      const at = freshData.map((f) => f.ri);
      this._bindRows(trs, freshData.map((f) => f.e.node.row), at, freshData.map((f) => f.e), false);
      this._treeLabels(trs, at, false);
      const styles = this._columns.map((c) => this._getColumnWidthStyles(c));
      for (const tr of trs) {
        for (const cell of tr.querySelectorAll(':scope > [data-col]')) {
          const st = styles[Number(cell.getAttribute('data-col'))];
          if (st && Object.keys(st).length) applyStyles(cell, st);
        }
      }
    }
    this._treeArrays(want.filter((tr) => !this._trInfo.get(tr).status));
    this._paintSelection();
    if (this._isServerMode()) this._syncPag(total, false, true);
    // roving: new rows join (inactive); the active row may have left
    let act = this._activeTr && this._activeTr.parentElement === tbody ? this._activeTr : null;
    for (const f of fresh) this._roveRow(want[f.at], false);
    if (!act) act = this._treeFindActive();
    this._activeTr = null;
    if (act) this._setActive(act);
    this._treeRestoreFocus(focus, opts.fallback || null);
    this._treeMo?.takeRecords();
    this._syncOverflow();
    this._treeAutoLoad();
  }

  /** @private Open / close a node; `user` → `expanded-change` (QĐ 5). A lazy branch loads (QĐ 13). */
  _treeSetExpanded(node, expanded, user) {
    const m = this._tree;
    if (expanded && !m.expandable(node)) return false;
    const changed = expanded ? m.expand(node.key) : m.collapse(node.key);
    if (!changed) return false;
    if (expanded && node.children === null && !node.loading) {
      if (!this._loadChildren) {
        this._warnOnce('td-table: a lazy row (rowHasChildren) was opened without a loadChildren hook.');
        m.collapse(node.key);
        return false;
      }
      this._treeLoad(node, false);
    }
    this._treeSync();
    if (user) this.emit('expanded-change', { key: node.key, row: node.row, expanded });
    return true;
  }

  /** @private expandedKeys / expandAll / collapseAll: incremental when the tree is on screen, else a full update. */
  _treeRefresh() {
    if (!this._initialized || !this._root || !this._treeOn()) return;
    if (this._treeRendered && !this._treeDirty) this._treeSync();
    else this._update();
  }

  /** @private Load the shown, open, not-loaded lazy branches (after a render / data / reconnect — QĐ 4). */
  _treeAutoLoad() {
    if (!this._treeRendered) return;
    const m = this._tree;
    const todo = [];
    for (const tr of this._tbody.children) {
      const info = this._trInfo.get(tr);
      const n = info && !info.status ? info.node : null;
      if (n && n.children === null && n.lazy && !n.loading && !n.loadError && m.isExpanded(n)) todo.push(n);
    }
    if (!todo.length) return;
    if (!this._loadChildren) {
      this._warnOnce('td-table: a lazy row (rowHasChildren) was opened without a loadChildren hook.');
      for (const n of todo) m.collapse(n.key);
      this._treeSync();
      return;
    }
    for (const n of todo) this._treeLoad(n, false);
    this._treeSync();
  }

  /**
   * @private Load a lazy branch (QĐ 13): aria-busy at once; the status row + "Đang tải các dòng con của {label}…" only
   * when still loading after TREE_LOADING_MS (the timer of an older request never speaks for a newer one); done →
   * children inserted (+ "Đã tải {n}…" if "loading" was announced); error → status row with "Thử lại", `load-error`,
   * announced at once.
   */
  _treeLoad(node, retry) {
    const m = this._tree;
    const p = m.load(node, this._loadChildren);
    const old = this._loadTimers.get(node);
    if (old && old.seq === node.seq) return; // the same request (shared)
    if (old) clearTimeout(old.timer);
    const t = { timer: 0, seq: node.seq, announced: !!retry };
    this._loadTimers.set(node, t);
    const label = () => this._trInfo.get(this._nodeTr.get(node))?.label || String(node.key);
    const shown = () => m.isExpanded(node) && this._nodeTr.get(node)?.parentElement === this._tbody;
    t.timer = setTimeout(() => {
      if (this._loadTimers.get(node) !== t || !node.loading || node.seq !== t.seq) return;
      this._statusShown.add(node);
      if (!shown()) return;
      this._treeSync();
      t.announced = true;
      this._announce(fill(TdTable.labels.treeLoadingRow, { label: label() }));
    }, TREE_LOADING_MS);
    // Codex r2 #3: an unexpected rejection still ends the request (timer, aria-busy, error row, announcement)
    p.catch((error) => {
      if (node.loading) {
        node.loading = false;
        node.ctrl = null;
        node.promise = null;
      }
      node.loadError = true;
      return { ok: false, error: error == null ? new Error('loadChildren failed') : error };
    }).then((res) => {
      if (res.stale || this._loadTimers.get(node) !== t) return;
      clearTimeout(t.timer);
      this._loadTimers.delete(node);
      this._statusShown.delete(node);
      const visible = shown();
      this._treeSync();
      if (res.ok) {
        if (t.announced && visible) this._announce(fill(TdTable.labels.treeLoaded, { n: res.n, label: label() }));
      } else {
        this.emit('load-error', { key: node.key, row: node.row, error: res.error });
        if (visible) this._announce(fill(TdTable.labels.treeLoadErrorRow, { label: label() }));
      }
    });
  }

  /** @private "Thử lại" (QĐ 13): the status row turns "Đang tải…" at once, focus → the parent row, announced. */
  _treeRetry(statusTr) {
    const info = this._trInfo.get(statusTr);
    if (!info || !this._loadChildren) return;
    const node = info.node;
    const parent = this._nodeTr.get(node);
    this._treeLoad(node, true);
    this._statusShown.add(node);
    this._treeSync({ fallback: () => parent });
    if (parent && parent.parentElement === this._tbody) this._focusRow(parent);
    this._announce(TdTable.labels.treeRetrying);
  }

  _clearLoadTimers() {
    for (const t of this._loadTimers.values()) clearTimeout(t.timer);
    this._loadTimers.clear();
    this._statusShown.clear();
  }

  // --- v0.57.0 roving row focus (QĐ 7) ---

  /** @private Rows of the roving list: data rows + status rows (never skeleton / empty rows). */
  _rovingRows() {
    return [...this._tbody.children].filter((tr) => this._trInfo.has(tr));
  }

  /** @private The row that should hold tabindex 0 now: the remembered identity, else the first row. */
  _treeFindActive() {
    const rows = this._rovingRows();
    const k = this._activeKey;
    if (k && k.id !== null) {
      const tr = rows.find((r) => {
        const i = this._trInfo.get(r);
        return i.node.id === k.id && !!i.status === !!k.status;
      });
      if (tr) return tr;
    }
    return rows[0] || null;
  }

  /** @private After a full render: one tab stop, every other row (and its controls) out of the Tab order. */
  _treeRovingAll() {
    const act = this._treeFindActive();
    this._activeTr = act;
    if (act) {
      const i = this._trInfo.get(act);
      this._activeKey = { id: i.node.id, status: i.status };
    }
    for (const tr of this._rovingRows()) this._roveRow(tr, tr === act);
    this._treeMo?.takeRecords();
  }

  /** @private Make `tr` the roving row (the old one leaves the Tab order with its controls). */
  _setActive(tr) {
    if (!tr) return;
    const old = this._activeTr;
    this._activeTr = tr;
    const info = this._trInfo.get(tr);
    if (info) this._activeKey = { id: info.node.id, status: info.status };
    if (old && old !== tr && old.parentElement === this._tbody) this._roveRow(old, false);
    this._roveRow(tr, true);
  }

  /**
   * @private The row's own tabindex (0 / -1) and its controls: out of the Tab order (original tabindex kept in a
   * WeakMap) unless this is the active row (given back). Controls of nested tables (in `render`) are left alone.
   */
  _roveRow(tr, on) {
    const v = on ? '0' : '-1';
    if (tr.getAttribute('tabindex') !== v) tr.setAttribute('tabindex', v);
    for (const el of tr.querySelectorAll(ROVE_SEL)) {
      if (el.closest('tr') !== tr) continue;
      if (on) {
        if (!this._savedTab.has(el)) continue;
        const orig = this._savedTab.get(el);
        this._savedTab.delete(el);
        if (orig === null) el.removeAttribute('tabindex');
        else el.setAttribute('tabindex', orig);
      } else if (!this._savedTab.has(el)) {
        this._savedTab.set(el, el.getAttribute('tabindex'));
        if (el.getAttribute('tabindex') !== '-1') el.setAttribute('tabindex', '-1');
      }
    }
  }

  /** @private Content of rows changed (an app control re-rendered): re-apply roving to those rows. */
  _onTreeMutations(recs) {
    if (!this._treeRendered) return;
    const rows = new Set();
    for (const r of recs) {
      if (r.target === this._tbody) {
        for (const n of r.addedNodes) if (n.nodeType === 1) rows.add(n);
        continue;
      }
      let t = r.target;
      while (t && t.parentElement !== this._tbody) t = t.parentElement;
      if (t) rows.add(t);
    }
    for (const tr of rows) if (tr.parentElement === this._tbody && this._trInfo.has(tr)) this._roveRow(tr, tr === this._activeTr);
  }

  /** @private A control of another row took focus (pointer, script): that row becomes the roving row. */
  _onTreeFocusin(e) {
    if (!this._treeRendered || !this._tbody) return;
    let tr = e.target instanceof Element ? e.target : null;
    if (!tr || !this._tbody.contains(tr)) return;
    while (tr && tr.parentElement !== this._tbody) tr = tr.parentElement;
    if (tr && tr !== this._activeTr && this._trInfo.has(tr)) this._setActive(tr);
  }

  _focusRow(tr) {
    if (!tr) return;
    this._setActive(tr);
    tr.focus();
  }

  /** @private Where the focus is in the body: its row, the control index in that row (-1 = the row itself). */
  _treeFocusState() {
    const a = document.activeElement;
    if (!a || !this._tbody || !this._tbody.contains(a)) return null;
    let tr = a;
    while (tr && tr.parentElement !== this._tbody) tr = tr.parentElement;
    const info = tr && this._trInfo.get(tr);
    if (!info) return null;
    const control = a === tr ? -1 : [...tr.querySelectorAll(ROVE_SEL)].filter((x) => x.closest('tr') === tr).indexOf(a);
    return { el: a, tr, node: info.node, id: info.node.id, status: info.status, control, index: this._rovingRows().indexOf(tr) };
  }

  /** @private Focus the same control (by index) of `tr`, or the row. */
  _focusRowControl(tr, control) {
    this._setActive(tr);
    const c = control >= 0 ? [...tr.querySelectorAll(ROVE_SEL)].filter((x) => x.closest('tr') === tr)[control] : null;
    (c || tr).focus();
  }

  /** @private After an incremental update: the same element, else its row re-created, else `fallback` / ancestor / old place. */
  _treeRestoreFocus(state, fallback) {
    if (!state) return;
    if (state.el.isConnected && this._tbody.contains(state.el)) {
      if (document.activeElement !== state.el) state.el.focus({ preventScroll: true });
      return;
    }
    // a data row re-created (level / parent changed) → the same control; a REPLACED status row → its parent (QĐ 13)
    let tr = state.status ? null : this._nodeTr.get(state.node);
    if (tr && tr.parentElement === this._tbody) {
      this._focusRowControl(tr, state.control);
      return;
    }
    tr = fallback ? fallback(state) : null;
    if (!tr) {
      for (let p = state.status ? state.node : state.node.parent; p && !tr; p = p.parent) {
        const x = this._nodeTr.get(p);
        if (x && x.parentElement === this._tbody) tr = x;
      }
    }
    if (!tr) {
      const rows = this._rovingRows();
      tr = rows[state.index] || rows[state.index - 1] || null;
    }
    if (tr) this._focusRow(tr);
  }

  /** @private After a full render (QĐ 7): the row with the same key if shown, else the moveRow fallback, else the first row. */
  _treeRefocus(state) {
    if (!state) return;
    const a = document.activeElement;
    if (a && a !== document.body && a.isConnected && !this._tbody.contains(a) && a !== state.el) return; // moved elsewhere
    const node = state.id !== null ? this._tree.ownerOf(state.id) : null;
    let tr = node ? (state.status ? this._statusTr : this._nodeTr).get(node) : null;
    if (tr && tr.parentElement === this._tbody) {
      this._focusRowControl(tr, state.control);
      return;
    }
    tr = this._refocusFallback ? this._refocusFallback(state) : null;
    if (!tr) tr = this._rovingRows()[0] || null;
    if (tr) this._focusRow(tr);
  }

  /** @private Keyboard on a ROW (QĐ 7) — never while the focus is inside a control of the row. */
  _onTreeKeydown(e) {
    if (!this._treeRendered || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const tr = e.target;
    if (!(tr instanceof Element) || tr.parentElement !== this._tbody) return;
    const info = this._trInfo.get(tr);
    if (!info) return;
    const m = this._tree;
    const rows = this._rovingRows();
    const i = rows.indexOf(tr);
    let key = e.key;
    if ((key === 'ArrowLeft' || key === 'ArrowRight') && getComputedStyle(this).direction === 'rtl') {
      key = key === 'ArrowLeft' ? 'ArrowRight' : 'ArrowLeft';
    }
    const node = info.node;
    switch (key) {
      case 'ArrowDown': this._focusRow(rows[i + 1]); break;
      case 'ArrowUp': this._focusRow(rows[i - 1]); break;
      case 'Home': this._focusRow(rows[0]); break;
      case 'End': this._focusRow(rows[rows.length - 1]); break;
      case 'ArrowRight': {
        if (info.status || !m.expandable(node)) break;
        if (!m.isExpanded(node)) {
          this._treeSetExpanded(node, true, true);
          break;
        }
        const next = rows[i + 1];
        const ni = next && this._trInfo.get(next);
        if (ni && ni.level === info.level + 1) this._focusRow(next);
        break;
      }
      case 'ArrowLeft': {
        if (!info.status && m.expandable(node) && m.isExpanded(node)) {
          this._treeSetExpanded(node, false, true);
          break;
        }
        const parent = info.status ? node : node.parent;
        const ptr = parent ? this._nodeTr.get(parent) : null;
        if (ptr && ptr.parentElement === this._tbody) this._focusRow(ptr);
        break;
      }
      case '*': {
        if (info.status) break;
        const sibs = node.parent ? node.parent.children : m.roots;
        const opened = [];
        for (const s of sibs) {
          if (s.children && s.children.length && m.expandable(s) && m.expand(s.key)) opened.push(s);
        }
        if (opened.length) this._treeSync();
        for (const s of opened) this.emit('expanded-change', { key: s.key, row: s.row, expanded: true });
        break;
      }
      case ' ': {
        if (info.status || !this._selOn || e.repeat) break;
        const btn = tr.querySelector(':scope > .td-table__cell--select > .td-table__select');
        if (btn && !btn.disabled) this._activateSelect(btn, e.shiftKey);
        break;
      }
      default:
        return;
    }
    e.preventDefault();
  }

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
      this._treeDirty = true;
      this._rootDelta = 0;
      if (!this._isServerMode()) this._currentPage = 1;
    }
    // v0.57.0 tree table
    if (o.expandedKeys !== undefined) this._tree.setExpanded(o.expandedKeys);
    if (o.loadChildren !== undefined) this._loadChildren = typeof o.loadChildren === 'function' ? o.loadChildren : null;
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
