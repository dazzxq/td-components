import { TdBaseElement } from '../base/td-base-element.js';
import { safeCssDimension, applyStyles } from '../utils/css-safe.js';
import { tdIcon, hasIcon } from '../icons/td-icon.js';
import './td-pagination.js';
import './td-empty-state.js';

/** `cellPaddingClass` vocabulary (dcms, Tailwind names) → `td-table__cell--px-{n}`. Lookup keys only (D15). */
const CELL_PADDING = { 'px-0': 0, 'px-1': 1, 'px-2': 2, 'px-3': 3, 'px-4': 4, 'px-5': 5, 'px-6': 6 };
const ALIGN = ['left', 'center', 'right', 'justify'];
const OFF = new Set(['false', '0', 'off']);
/** Attributes whose change rebuilds the structure; every other observed attribute updates in place (D11). */
const STRUCTURAL = new Set(['title', 'heading-level', 'zebra', 'max-height']);

let seq = 0;

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
 *     > `table.td-table__table[aria-labelledby|aria-label][aria-busy]` > `thead.td-table__head` (`th.td-table__th
 *       [scope=col][data-col][data-col-key][aria-sort]`, sortable → `button.td-table__sort[data-sort-col]`)
 *       + `tbody.td-table__body` (`tr.td-table__row[data-row-idx] > td.td-table__cell[data-col][data-col-key]`)
 *   > `div.td-table__footer > td-pagination` > `p.td-sr-only[role=status]` (loading text).
 * Sorting, paging and data loads keep `thead` and both paginations, so focus stays on the activated control and the
 * bottom pagination's live region announces each page once (the top one is `quiet`).
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
 *
 * @property {Array<Object>} columns - Column definitions: `{ key, label, sortable?, width?, widthType?:
 *   'fixed'|'flexible', minWidth?, maxWidth?, align?: 'left'|'center'|'right'|'justify', ellipsis?, render? }`.
 *   `label` and plain values are always escaped; `width`/`minWidth`/`maxWidth` pass `safeCssDimension`, `align` a
 *   whitelist, all applied via CSSOM. Columns are resolved by INDEX (keys may repeat, be numeric or missing).
 *   `ellipsis: true` → one line, truncated, full text in `title`. Any `width` or `ellipsis` → `table-layout: fixed`.
 *   `render(row, rowIdxInPage)` — TRUSTED HATCH: return a Node (preferred, appended), a string (**trusted HTML**,
 *   developer markup only, injected with innerHTML — escape any end-user data inside it yourself; its CSP
 *   compliance is the consumer's responsibility) or anything else (text). A render column sorts by `row[key]`.
 * @property {Array<Object>} data - Rows. Client mode: resets to page 1. Server mode: keeps the current page.
 * @property {string} cellPaddingClass - Cell horizontal padding, one of `px-0`…`px-6` (dcms vocabulary) → the
 *   `td-table__cell--px-{n}` modifier on header, data and skeleton cells; anything else is ignored (one warning).
 * @property {Function} onSort - `({key, direction})` after a sort change (server mode: sort on the server)
 * @property {Function} onPageChange - `(page)` in server mode (fetch that page, then set `data`)
 * @fires sort-change - `{ key, direction }` (direction `'asc'|'desc'|null`), bubbling, before `onSort`
 * @fires page-change - from the inner td-pagination elements, `{ page }` (bubbles through the host)
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
  };

  static get observedAttributes() {
    return ['per-page', 'active-color', 'zebra', 'loading', 'loading-rows', 'title', 'heading-level', 'aria-label',
      'empty-title', 'empty-text', 'server-mode', 'total-items', 'max-height'];
  }

  // `zebra` is tri-state (default ON), so it is NOT a boolean attribute — see the `zebra` accessor.
  static get booleanAttributes() {
    return ['loading', 'server-mode'];
  }

  constructor() {
    super();
    this._columns = [];
    this._data = [];
    this._onSort = null;
    this._onPageChange = null;
    /** Sorted column by INDEX (fixes numeric/duplicate keys). */
    this._sort = { col: null, direction: null };
    this._currentPage = 1;
    this._cellPadding = null;
    this._warned = new Set();
    this._ro = null;
    this._refocusPagination = null;
    // Delegated listeners live for the element's lifetime (survive re-renders and reconnects).
    this.addEventListener('click', (e) => this._onClick(e));
    this.addEventListener('page-change', (e) => this._onPaginationChange(e));
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
    if (this._initialized) this._doRender();
  }

  get data() { return this._data; }
  set data(val) { this.setData(val); }

  get onSort() { return this._onSort; }
  set onSort(fn) { this._onSort = typeof fn === 'function' ? fn : null; }

  get onPageChange() { return this._onPageChange; }
  set onPageChange(fn) { this._onPageChange = typeof fn === 'function' ? fn : null; }

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
  _isFixedLayout() {
    return this._columns.some((c) => c && (c.ellipsis || safeCssDimension(c.width, '')));
  }

  _warnOnce(msg) {
    if (this._warned.has(msg)) return;
    this._warned.add(msg);
    console.warn(msg);
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (oldVal === newVal || !this._initialized) return;
    if (STRUCTURAL.has(name)) this._doRender();
    else this._update();
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
    const heads = this._columns.map((col, ci) => {
      const c = col || {};
      const key = esc(String(c.key ?? ''));
      const label = esc(c.label == null ? '' : String(c.label));
      const inner = c.sortable
        ? `<button type="button" class="td-table__sort" data-sort-col="${ci}"><span class="td-table__sort-label">${label}</span>`
          + '<span class="td-table__sort-icon" aria-hidden="true"></span></button>'
        : label;
      return `<th class="td-table__th${pad}" scope="col" data-col="${ci}" data-col-key="${key}">${inner}</th>`;
    }).join('');
    const titleHtml = title ? `<${h} class="td-table__title" id="${esc(this._titleId)}">${esc(title)}</${h}>` : '';
    const pag = (cls, label, quiet) => `<div class="${cls}"${quiet ? ' hidden' : ''}><td-pagination${quiet ? ' quiet' : ''}`
      + ` item-label="${esc(TdTable.labels.itemLabel)}" aria-label="${esc(label)}"></td-pagination></div>`;
    return `<div class="td-table${mods}" data-state="ready">`
      + `<div class="td-table__header">${titleHtml}${pag('td-table__pagination', TdTable.labels.paginationTop, true)}</div>`
      + '<div class="td-table__scroll"><table class="td-table__table">'
      + `<thead class="td-table__head"><tr>${heads}</tr></thead><tbody class="td-table__body"></tbody></table></div>`
      + `<div class="td-table__footer" hidden>${pag('td-table__pagination td-table__pagination--bottom', TdTable.labels.paginationBottom, false)}</div>`
      + '<p class="td-sr-only" role="status"></p>'
      + '</div>';
  }

  /** Structural render: only for columns / title / heading-level / zebra / max-height / cellPaddingClass. */
  _doRender() {
    if (!this._titleId) this._titleId = `${this.id || `td-table-${++seq}`}-title`;
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
    const mh = this._getMaxHeight();
    if (mh) this._root.style.setProperty('--td-table-max-h', mh);
    else if (this.hasAttribute('max-height')) this._warnOnce(`td-table: ignored invalid max-height "${this.getAttribute('max-height')}".`);
    this._syncSortUi();
    this._update();
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
      return { rows: this._data, total };
    }
    const rows = this._sortedRows();
    const per = this._getPerPage();
    const pages = Math.max(1, Math.ceil(rows.length / per));
    this._currentPage = Math.min(Math.max(1, this._currentPage), pages);
    const start = (this._currentPage - 1) * per;
    return { rows: rows.slice(start, start + per), total: rows.length };
  }

  /** @private Client sort (D12): numbers numerically, strings with a vi numeric collator, nulls first in asc. */
  _sortedRows() {
    const rows = [...this._data];
    const { col: ci, direction } = this._sort;
    const col = ci === null ? null : this._columns[ci];
    if (!col || !direction) return rows;
    const key = col.key;
    const collator = new Intl.Collator('vi', { numeric: true, sensitivity: 'base' });
    const sign = direction === 'asc' ? 1 : -1;
    const val = (row) => (row && typeof row === 'object' ? row[key] : undefined);
    return rows.sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      if (va == null && vb == null) return 0;
      if (va == null) return -sign;
      if (vb == null) return sign;
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sign;
      return collator.compare(String(va), String(vb)) * sign;
    });
  }

  _update() {
    if (!this._root) return;
    const loading = this._isLoading();
    const server = this._isServerMode();
    const active = document.activeElement;
    if (active && (this._pagTop?.contains(active) || this._pagBottom?.contains(active))) {
      this._refocusPagination = this._pagTop.contains(active) ? 'top' : 'bottom';
    }
    const { rows, total } = this._view();
    const empty = !loading && rows.length === 0;

    // Body
    if (loading) this._tbody.innerHTML = this._skeletonHtml();
    else if (empty) this._renderEmpty();
    else this._renderRows(rows);

    // Paginations (updated in place: live region + focus restore stay inside td-pagination)
    let showPag = !loading;
    let count = total;
    if (server) {
      if (total === null) {
        showPag = false;
        if (rows.length) this._warnOnce('td-table: server-mode needs `total-items` — pagination is hidden until it is set.');
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

  _renderRows(rows) {
    const esc = (v) => this.escapeHtml(v);
    const pad = this._cellPadClass();
    const cols = this._columns;
    this._tbody.innerHTML = rows.map((row, ri) => {
      const cells = cols.map((col, ci) => {
        const c = col || {};
        const cls = `td-table__cell${c.ellipsis ? ' td-table__cell--ellipsis' : ''}${pad}`;
        const attrs = `class="${cls}" data-col="${ci}" data-col-key="${esc(String(c.key ?? ''))}"`;
        if (typeof c.render === 'function') return `<td ${attrs}></td>`;
        const v = row && typeof row === 'object' ? row[c.key] : undefined;
        const text = v == null ? '' : String(v);
        if (c.ellipsis) return `<td ${attrs}><div class="td-table__truncate" title="${esc(text)}">${esc(text)}</div></td>`;
        return `<td ${attrs}>${esc(text)}</td>`;
      }).join('');
      return `<tr class="td-table__row" data-row-idx="${ri}">${cells}</tr>`;
    }).join('');

    // Render cells, resolved by column INDEX (fixes 2.8.4). CONSUMER HATCH: a string is trusted developer HTML.
    const trs = this._tbody.children;
    cols.forEach((col, ci) => {
      if (!col || typeof col.render !== 'function') return;
      rows.forEach((row, ri) => {
        const td = trs[ri].children[ci];
        const out = col.render(row, ri);
        let target = td;
        if (col.ellipsis) {
          target = document.createElement('div');
          target.className = 'td-table__truncate';
          td.appendChild(target);
        }
        if (typeof out === 'string') target.innerHTML = out;
        else if (typeof Node !== 'undefined' && out instanceof Node) target.appendChild(out);
        else target.textContent = out == null ? '' : String(out);
        if (col.ellipsis && !target.querySelector('[title]')) target.title = target.textContent.trim();
      });
    });
  }

  _renderEmpty() {
    const n = Math.max(1, this._columns.length);
    const level = Math.min(6, (this._getTitle() ? this._getHeadingLevel() : 2) + 1);
    const esc = (v) => this.escapeHtml(v);
    this._tbody.innerHTML = `<tr class="td-table__empty-row"><td class="td-table__empty" colspan="${n}">`
      + `<td-empty-state compact size="sm" heading-level="${level}" title="${esc(this._getEmptyTitle())}"`
      + ` message="${esc(this._getEmptyText())}"></td-empty-state></td></tr>`;
  }

  /** Deterministic skeleton rows (widths come from td.css :nth-child rules — D19). */
  _skeletonHtml() {
    const pad = this._cellPadClass();
    const cells = this._columns.map((_, ci) => `<td class="td-table__cell${pad}" data-col="${ci}"><span class="td-table__skeleton"></span></td>`).join('')
      || `<td class="td-table__cell${pad}"><span class="td-table__skeleton"></span></td>`;
    const row = `<tr class="td-table__row td-table__row--skeleton" aria-hidden="true">${cells}</tr>`;
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
    for (const th of this._table.querySelectorAll(':scope > thead > tr > th')) {
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
    if (this._sort.col !== ci) this._sort = { col: ci, direction: 'asc' };
    else if (this._sort.direction === 'asc') this._sort = { col: ci, direction: 'desc' };
    else this._sort = { col: null, direction: null };
    const detail = { key: this._sort.col === null ? null : col.key, direction: this._sort.direction };
    this._syncSortUi();
    this.emit('sort-change', detail);
    if (this._isServerMode()) {
      this._onSort?.({ ...detail });
      return;
    }
    this._currentPage = 1;
    this._update();
  }

  _onClick(e) {
    const btn = e.target instanceof Element ? e.target.closest('.td-table__sort') : null;
    if (!btn || btn.closest('td-table') !== this) return;
    this._handleSort(Number(btn.getAttribute('data-sort-col')));
  }

  // --- Paging ---

  _onPaginationChange(e) {
    const p = e.target;
    if (p !== this._pagTop && p !== this._pagBottom) return;
    const page = Number(e.detail?.page);
    if (!Number.isFinite(page) || page === this._currentPage) return;
    this._currentPage = page;
    if (this._isServerMode()) {
      const other = p === this._pagTop ? this._pagBottom : this._pagTop;
      other.setAttribute('current-page', String(page));
      this._onPageChange?.(page);
      return;
    }
    this._update();
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
      styles.width = 'auto';
      const minW = safeCssDimension(c.minWidth, '');
      const maxW = safeCssDimension(c.maxWidth, '');
      if (minW) styles['min-width'] = minW;
      if (maxW) styles['max-width'] = maxW;
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
      if (s) applyStyles(cell, s);
    }
  }

  // --- Public API ---

  /** Replace the rows. Client mode: back to page 1. Server mode: the current page is kept (fixes 2.8.2). */
  setData(data) {
    this._data = Array.isArray(data) ? data : [];
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

  /** Current state; `sort.key` is the sorted column's original key. */
  getState() {
    const col = this._sort.col === null ? null : this._columns[this._sort.col];
    return {
      columns: this._columns,
      data: this._data,
      page: this._currentPage,
      perPage: this._getPerPage(),
      sort: { key: col ? col.key : null, direction: this._sort.direction },
    };
  }

  /** Merge options (non-array `columns`/`data` are ignored; `data` follows setData's page rule, then `page`). */
  update(opts = {}) {
    const o = opts && typeof opts === 'object' ? opts : {};
    let structural = false;
    if (Array.isArray(o.columns)) {
      this._columns = o.columns;
      this._resetStaleSort();
      structural = true;
    }
    if (Array.isArray(o.data)) {
      this._data = o.data;
      if (!this._isServerMode()) this._currentPage = 1;
    }
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
