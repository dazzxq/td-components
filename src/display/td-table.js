import { TdBaseElement } from '../base/td-base-element.js';
import { safeCssDimension, applyStyles } from '../utils/css-safe.js';
import { adoptStyles } from '../utils/adopt-styles.js';
import './td-pagination.js';
import './td-empty-state.js';

/**
 * Data table component with sorting, pagination, loading skeleton, custom column rendering.
 * Port of dcms-table.js (TableSimple) to Web Component extending TdBaseElement.
 *
 * CSP-strict hardening (v0.3.0): td-table emits ZERO declarative inline `style=` attributes.
 * - STATIC "chrome" rules (card background/border/shadow, header & footer bars, thead row
 *   border, data-row transition, zebra `:nth-child(even)` striping) live in ONE constructable
 *   stylesheet adopted once per document via `adoptStyles(SHEET, 'td-table')` (lazy, from
 *   `connectedCallback`), keyed off STABLE element-scoped classes — NOT inline `style=`.
 * - PER-COLUMN scalars (width / min-width / max-width / text-align) and the random skeleton
 *   bar widths are SCALAR styles applied via CSSOM (`applyStyles` → `el.style.setProperty`)
 *   in `_applyStyles()`, keyed off a stable `data-col` index. The base class auto-invokes
 *   `_applyStyles()` after `afterRender()` on initial render AND on every observed-attr /
 *   internal-state re-render, so per-column styling stays correct across sort/page/loading.
 * - Sort-icon SVGs use `opacity` as an SVG presentation attribute (no inline `style=`).
 *
 * @element td-table
 * @attr {number} per-page - Items per page (default 10)
 * @attr {string} active-color - CSS color for pagination active state (default '#ef4444')
 * @attr {boolean} zebra - Zebra striping on alternating rows (default true)
 * @attr {boolean} loading - Show loading skeleton
 * @attr {number} loading-rows - Number of skeleton rows (default 5)
 * @attr {string} title - Optional table title
 * @attr {string} empty-text - Empty state text (default 'Không có dữ liệu')
 * @attr {boolean} server-mode - Enable server-side mode
 * @attr {number} total-items - Total items for server mode pagination
 *
 * @property {Array<{key: string, label: string, sortable?: boolean, width?: string, widthType?: string, minWidth?: string, maxWidth?: string, align?: string, render?: Function}>} columns - Column definitions. `render(row)` returns **trusted raw HTML** for that cell (developer-authored — sanitize any end-user data inside it yourself). Cells WITHOUT a `render` show the plain value, always escaped. `label` is escaped; `width`/`align` are CSS-sanitized.
 *
 * CONSUMER RAW-HTML HATCH (OUT OF SCOPE for the lib's CSP guarantee): column `render(row)`
 * returns CONSUMER-authored HTML that td-table injects verbatim (see `afterRender`). The
 * library does NOT parse/sanitize it — if a consumer hand-writes inline `style=`/`<style>`
 * into `col.render` output, a strict CSP will block THAT consumer content. This is the
 * consumer's responsibility (documented). Only LIBRARY-AUTHORED markup is CSP-hardened here.
 *
 * @property {Array<Object>} data - Row data array
 * @property {Function} onSort - Server mode sort callback ({key, direction})
 * @property {Function} onPageChange - Server mode page change callback (page)
 */

/**
 * STATIC component stylesheet (selector-based rules a strict CSP allows only via an adopted
 * constructable sheet — NOT inline `style=` / injected `<style>`). All values are
 * library-authored constants; no per-instance dynamic value lives in a selector here.
 * Element-scoped under `td-table ` so it never leaks to host markup. Authored ONCE per module.
 */
const TD_TABLE_SHEET = `
td-table .td-table-card {
  background: rgba(255, 255, 255, 0.85);
  border: 1px solid rgba(0, 0, 0, 0.06);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08), 0 4px 16px rgba(0, 0, 0, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.9);
}
td-table .td-table-header-bar {
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  box-shadow: inset 0 -1px 0 rgba(255, 255, 255, 0.5);
}
td-table .td-table-footer-bar {
  border-top: 1px solid rgba(0, 0, 0, 0.06);
  background: rgba(249, 250, 251, 0.5);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8);
}
td-table .td-table-thead-row {
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}
td-table .td-table-row {
  transition: background-color 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}
td-table .td-table-row.td-table-zebra:nth-child(even) {
  background-color: rgba(0, 0, 0, 0.015);
}
td-table .td-table-row:hover {
  background-color: rgba(0, 0, 0, 0.03);
}
td-table .td-table-skel-row.td-table-zebra:nth-child(even) {
  background-color: rgba(0, 0, 0, 0.015);
}
`;

export class TdTable extends TdBaseElement {
  static get observedAttributes() {
    return ['per-page', 'active-color', 'zebra', 'loading', 'loading-rows', 'title', 'empty-text', 'server-mode', 'total-items'];
  }

  static get booleanAttributes() {
    return ['zebra', 'loading', 'server-mode'];
  }

  constructor() {
    super();
    this._columns = [];
    this._data = [];
    this._onSort = null;
    this._onPageChange = null;
    this._sortState = { key: null, direction: null };
    this._currentPage = 1;
  }

  connectedCallback() {
    // Adopt the static stylesheet LAZILY (browser-only, idempotent, never throws). On an
    // unsupported browser / SSR this returns false and the table still renders structurally
    // (Tailwind classes + CSSOM scalars apply); only the selector-driven chrome/zebra/hover
    // embellishments are absent — the documented graceful degradation.
    adoptStyles(TD_TABLE_SHEET, 'td-table');
    super.connectedCallback();
  }

  // --- JS Property accessors ---

  get columns() { return this._columns; }
  set columns(val) {
    this._columns = Array.isArray(val) ? val : [];
    if (this._initialized) this._doRender();
  }

  get data() { return this._data; }
  set data(val) {
    this._data = Array.isArray(val) ? val : [];
    this._currentPage = 1;
    if (this._initialized) this._doRender();
  }

  get onSort() { return this._onSort; }
  set onSort(fn) { this._onSort = typeof fn === 'function' ? fn : null; }

  get onPageChange() { return this._onPageChange; }
  set onPageChange(fn) { this._onPageChange = typeof fn === 'function' ? fn : null; }

  // --- Attribute helpers ---

  _getPerPage() { return Math.max(1, parseInt(this.getAttribute('per-page') || '10', 10)); }
  _getActiveColor() { return this.safeColor(this.getAttribute('active-color'), '#ef4444'); }
  _isZebra() { return !this.hasAttribute('zebra') || this.hasAttribute('zebra'); }
  _isLoading() { return this.hasAttribute('loading'); }
  _getLoadingRows() { return Math.max(1, parseInt(this.getAttribute('loading-rows') || '5', 10)); }
  _getTitle() { return this.getAttribute('title') || ''; }
  _getEmptyText() { return this.getAttribute('empty-text') || 'Không có dữ liệu'; }
  _isServerMode() { return this.hasAttribute('server-mode'); }
  _getTotalItems() { return Math.max(0, parseInt(this.getAttribute('total-items') || '0', 10)); }

  // --- Override attributeChangedCallback ---

  attributeChangedCallback(name, oldVal, newVal) {
    if (oldVal === newVal) return;
    if (!this._initialized) return;
    this._doRender();
  }

  // --- Sort logic (ported from DCMS) ---

  _handleSort(key) {
    if (this._sortState.key !== key) {
      this._sortState = { key, direction: 'asc' };
    } else {
      if (this._sortState.direction === 'asc') {
        this._sortState.direction = 'desc';
      } else if (this._sortState.direction === 'desc') {
        this._sortState = { key: null, direction: null };
      } else {
        this._sortState.direction = 'asc';
      }
    }

    if (this._isServerMode() && this._onSort) {
      this._onSort({ key: this._sortState.key, direction: this._sortState.direction });
    } else {
      this._currentPage = 1;
      this._doRender();
    }
  }

  // --- Pagination + sorting: get current rows ---

  _getCurrentRows() {
    if (this._isServerMode()) {
      return { rows: this._data || [], totalItems: this._getTotalItems() || 0 };
    }

    let rows = [...(this._data || [])];

    // Sort
    if (this._sortState.key && this._sortState.direction) {
      const key = this._sortState.key;
      const dir = this._sortState.direction;
      rows.sort((a, b) => {
        const va = a[key];
        const vb = b[key];
        if (va == null && vb == null) return 0;
        if (va == null) return dir === 'asc' ? -1 : 1;
        if (vb == null) return dir === 'asc' ? 1 : -1;
        if (typeof va === 'number' && typeof vb === 'number') {
          return dir === 'asc' ? va - vb : vb - va;
        }
        return dir === 'asc'
          ? String(va).localeCompare(String(vb))
          : String(vb).localeCompare(String(va));
      });
    }

    const totalItems = rows.length;
    const perPage = this._getPerPage();
    const start = (this._currentPage - 1) * perPage;
    const pageRows = rows.slice(start, start + perPage);
    return { rows: pageRows, totalItems };
  }

  // --- Page change handler ---

  _handlePageChange(page) {
    this._currentPage = page;
    if (this._isServerMode() && this._onPageChange) {
      this._onPageChange(page);
    } else {
      this._doRender();
    }
  }

  // --- Sort indicator SVGs ---
  // SVG `opacity` is a PRESENTATION ATTRIBUTE (not a CSS context) — CSP-safe, no inline style=.

  _getSortIcon(colKey) {
    const isActive = this._sortState.key === colKey;
    const dir = this._sortState.direction;

    if (!isActive || !dir) {
      // Both arrows, dimmed
      return `<svg class="w-3 h-3" opacity="0.4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 4l-6 6h12L12 4z"/>
        <path d="M12 20l6-6H6l6 6z"/>
      </svg>`;
    }
    if (dir === 'asc') {
      return `<svg class="w-3 h-3" opacity="1" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 4l-6 6h12L12 4z"/>
      </svg>`;
    }
    // desc
    return `<svg class="w-3 h-3" opacity="1" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 20l6-6H6l6 6z"/>
    </svg>`;
  }

  // --- Column width styles ---
  // Returns a SCALAR style map for CSSOM (NOT an inline `style=` string). `col` is
  // developer-supplied config (trusted), but dimensions still enter a CSS context — sanitize
  // them via `safeCssDimension` so a stray/hostile value can't break out of the declaration.

  _getColumnWidthStyles(col) {
    const widthType = col.widthType || 'flexible';
    const styles = {};
    const width = safeCssDimension(col.width, '');
    if (widthType === 'fixed' && width) {
      styles.width = width;
      styles['min-width'] = width;
      styles['max-width'] = width;
    } else {
      styles.width = 'auto';
      const minW = safeCssDimension(col.minWidth, '');
      const maxW = safeCssDimension(col.maxWidth, '');
      if (minW) styles['min-width'] = minW;
      if (maxW) styles['max-width'] = maxW;
    }
    if (['left', 'center', 'right', 'justify'].includes(col.align)) {
      styles['text-align'] = col.align;
    }
    return styles;
  }

  // --- Pagination HTML ---

  _renderPagination(totalItems) {
    const perPage = this._getPerPage();
    const activeColor = this._getActiveColor();
    return `<td-pagination
      total-items="${totalItems}"
      items-per-page="${perPage}"
      current-page="${this._currentPage}"
      active-color="${activeColor}"
      item-label="mục"
    ></td-pagination>`;
  }

  // --- Loading skeleton ---

  _renderLoadingSkeleton() {
    const columns = this._columns;
    const loadingRows = this._getLoadingRows();
    const titleText = this._getTitle();
    const zebra = this._isZebra();
    const zebraClass = zebra ? ' td-table-zebra' : '';

    const headerCols = columns.map((col, ci) => {
      return `<th class="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider" data-col="${ci}">${this.escapeHtml(col.label)}</th>`;
    }).join('');

    let bodyRows = '';
    for (let i = 0; i < loadingRows; i++) {
      const cells = columns.map((col, ci) => {
        const w = Math.round(Math.random() * 40 + 60);
        return `<td class="px-6 py-4" data-col="${ci}"><div class="h-4 bg-gray-200 rounded-sm animate-pulse td-table-skel-bar" data-skel-w="${w}"></div></td>`;
      }).join('');
      bodyRows += `<tr class="td-table-skel-row${zebraClass}">${cells}</tr>`;
    }

    return `
      <div class="td-table-container td-table-card rounded-xl overflow-hidden">
        <div class="td-table-header-bar flex items-center justify-between px-6 py-4">
          ${titleText ? `<div class="h-6 w-32 bg-gray-200 rounded-sm animate-pulse"></div>` : '<div></div>'}
          <div class="h-8 w-64 bg-gray-200 rounded-sm animate-pulse"></div>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead>
              <tr class="td-table-thead-row bg-gray-50/60">${headerCols}</tr>
            </thead>
            <tbody class="divide-y divide-gray-50">${bodyRows}</tbody>
          </table>
        </div>
        <div class="td-table-footer-bar flex items-center justify-end px-6 py-4">
          <div class="h-8 w-64 bg-gray-200 rounded-sm animate-pulse"></div>
        </div>
      </div>
    `;
  }

  // --- Main render ---

  render() {
    if (this._isLoading()) {
      return this._renderLoadingSkeleton();
    }

    const columns = this._columns;
    const { rows, totalItems } = this._getCurrentRows();
    const hasData = rows.length > 0 || totalItems > 0;
    const titleText = this._getTitle();
    const zebra = this._isZebra();
    const zebraClass = zebra ? ' td-table-zebra' : '';
    const emptyText = this._getEmptyText();

    // Header columns
    const headerCols = columns.map((col, ci) => {
      const attrKey = this.escapeHtml(String(col.key ?? ''));
      if (col.sortable) {
        return `<th class="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider" data-col="${ci}" data-sort-key="${attrKey}">
          <button type="button" class="td-table-sort-btn inline-flex items-center gap-1.5 hover:text-gray-900 transition-colors" data-sort-key="${attrKey}">
            <span>${this.escapeHtml(col.label)}</span>
            ${this._getSortIcon(col.key)}
          </button>
        </th>`;
      }
      return `<th class="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider" data-col="${ci}">${this.escapeHtml(col.label)}</th>`;
    }).join('');

    // Body rows
    let bodyHTML = '';
    if (rows.length === 0) {
      bodyHTML = `<tr><td colspan="${columns.length || 1}" class="px-6 py-16">
        <td-empty-state
          title="Không có dữ liệu"
          message="${this.escapeHtml(emptyText)}"
          size="sm"
          compact
        ></td-empty-state>
      </td></tr>`;
    } else {
      bodyHTML = rows.map((row, idx) => {
        const cells = columns.map((col, ci) => {
          // Will handle render in afterRender for elements; for now mark with data attribute
          if (col.render && typeof col.render === 'function') {
            const attrKey = this.escapeHtml(String(col.key ?? ''));
            return `<td class="px-6 py-4 text-sm text-gray-900 td-table-render-cell" data-col="${ci}" data-col-key="${attrKey}" data-row-idx="${idx}"></td>`;
          }
          const value = row[col.key];
          const display = value == null ? '' : this.escapeHtml(String(value));
          return `<td class="px-6 py-4 text-sm text-gray-900" data-col="${ci}">${display}</td>`;
        }).join('');
        return `<tr class="td-table-row${zebraClass} transition-colors" data-row-idx="${idx}">${cells}</tr>`;
      }).join('');
    }

    // Header section
    const headerSection = (titleText || hasData) ? `
      <div class="td-table-header-bar flex items-center justify-between px-6 py-4">
        ${titleText ? `<h3 class="text-lg font-semibold text-gray-900">${this.escapeHtml(titleText)}</h3>` : '<div></div>'}
        ${hasData ? `<div class="td-table-header-pagination">${this._renderPagination(totalItems)}</div>` : ''}
      </div>
    ` : '';

    // Footer
    const footerSection = hasData ? `
      <div class="td-table-footer-bar flex items-center justify-end px-6 py-4">
        <div class="td-table-footer-pagination">${this._renderPagination(totalItems)}</div>
      </div>
    ` : '';

    return `
      <div class="td-table-container td-table-card rounded-xl overflow-hidden">
        ${headerSection}
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead>
              <tr class="td-table-thead-row bg-gray-50/60">${headerCols}</tr>
            </thead>
            <tbody class="divide-y divide-gray-50">${bodyHTML}</tbody>
          </table>
        </div>
        ${footerSection}
      </div>
    `;
  }

  /**
   * CSP-strict hook (auto-invoked by the base class after every render): apply per-element
   * SCALAR styles via CSSOM (`el.style.setProperty`) instead of declarative `style=`.
   * - Per-column width / min-width / max-width / text-align (sanitized via `safeCssDimension`),
   *   keyed off the stable `data-col` index — applied to every header `<th>` and body `<td>`
   *   in that column (data + loading skeleton).
   * - The random skeleton-bar widths (`data-skel-w`) — non-deterministic, excluded from the
   *   parity oracle, but still routed through CSSOM so no inline `style=` survives.
   */
  _applyStyles() {
    const columns = this._columns;

    // Per-column scalar styles (width/align) → every cell/header sharing that data-col index.
    columns.forEach((col, ci) => {
      const styles = this._getColumnWidthStyles(col);
      this.querySelectorAll(`[data-col="${ci}"]`).forEach(el => applyStyles(el, styles));
    });

    // Skeleton bar widths (random %, excluded from parity but must not be inline style=).
    this.querySelectorAll('.td-table-skel-bar[data-skel-w]').forEach(bar => {
      applyStyles(bar, { width: `${bar.dataset.skelW}%` });
    });
  }

  afterRender() {
    const { rows } = this._getCurrentRows();

    // Handle custom render cells.
    // CONSUMER RAW-HTML HATCH (out of scope for the lib's CSP guarantee): `col.render`
    // returns CONSUMER-authored HTML injected verbatim below. The library does NOT
    // sanitize it for CSP — if the consumer hand-writes inline `style=`/`<style>` here,
    // a strict CSP will block that consumer content (documented on the @property JSDoc).
    this.querySelectorAll('.td-table-render-cell').forEach(td => {
      const colKey = td.dataset.colKey;
      const rowIdx = parseInt(td.dataset.rowIdx, 10);
      const col = this._columns.find(c => c.key === colKey);
      const row = rows[rowIdx];
      if (!col || !row || !col.render) return;

      const rendered = col.render(row, rowIdx);
      if (typeof rendered === 'string') {
        td.innerHTML = rendered;
      } else if (rendered instanceof HTMLElement) {
        td.appendChild(rendered);
      } else {
        td.textContent = rendered == null ? '' : String(rendered);
      }
    });

    // Bind sort buttons
    this.querySelectorAll('.td-table-sort-btn').forEach(btn => {
      const key = btn.dataset.sortKey;
      this.listen(btn, 'click', () => this._handleSort(key));
    });

    // Row hover is handled by the adopted stylesheet's `.td-table-row:hover` rule (CSP-safe
    // selector) — no per-element mouseenter/mouseleave CSSOM writes needed.

    // Bind pagination events
    this.querySelectorAll('td-pagination').forEach(pag => {
      this.listen(pag, 'page-change', (e) => {
        this._handlePageChange(e.detail.page);
      });
    });
  }

  // --- Public API ---

  /** Update data array and reset pagination */
  setData(data) {
    this._data = Array.isArray(data) ? data : [];
    this._currentPage = 1;
    if (this._initialized) this._doRender();
  }

  /** Navigate to specific page */
  setPage(page) {
    const perPage = this._getPerPage();
    const totalItems = this._isServerMode() ? this._getTotalItems() : this._data.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / perPage));
    this._currentPage = Math.max(1, Math.min(totalPages, parseInt(page) || 1));
    if (this._initialized) this._doRender();
  }

  /** Toggle loading state */
  setLoading(bool) {
    if (bool) {
      this.setAttribute('loading', '');
    } else {
      this.removeAttribute('loading');
    }
  }

  /** Get current table state */
  getState() {
    return {
      columns: this._columns,
      data: this._data,
      page: this._currentPage,
      perPage: this._getPerPage(),
      sort: { ...this._sortState },
    };
  }

  /** Merge options and re-render */
  update(opts = {}) {
    if (opts.columns) this._columns = opts.columns;
    if (opts.data) {
      this._data = opts.data;
      this._currentPage = 1;
    }
    if (opts.page) this._currentPage = Math.max(1, opts.page);
    if (opts.onSort) this._onSort = opts.onSort;
    if (opts.onPageChange) this._onPageChange = opts.onPageChange;
    if (this._initialized) this._doRender();
  }
}

if (!customElements.get('td-table')) {
  customElements.define('td-table', TdTable);
}
