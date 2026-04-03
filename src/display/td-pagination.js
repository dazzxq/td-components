import { TdBaseElement } from '../base/td-base-element.js';

/**
 * Pagination component with page navigation, ellipsis, info text, and custom active color.
 * Port of dcms-pagination.js (PaginationSimple) to Web Component extending TdBaseElement.
 *
 * @element td-pagination
 * @attr {number} total-items - Total number of items (default 0)
 * @attr {number} items-per-page - Items per page (default 10)
 * @attr {number} current-page - Current page, 1-based (default 1)
 * @attr {string} active-color - CSS color for active page (default '#ef4444')
 * @attr {string} item-label - Label shown in info text (default 'muc')
 * @attr {number} max-pages - Number of page buttons to show (default 5)
 * @fires page-change - When page changes, detail: { page }
 */
export class TdPagination extends TdBaseElement {
  static get observedAttributes() {
    return ['total-items', 'items-per-page', 'current-page', 'active-color', 'item-label', 'max-pages'];
  }

  // --- Attribute helpers ---

  _getTotalItems() { return Math.max(0, parseInt(this.getAttribute('total-items') || '0', 10)); }
  _getItemsPerPage() { return Math.max(1, parseInt(this.getAttribute('items-per-page') || '10', 10)); }
  _getCurrentPage() { return Math.max(1, parseInt(this.getAttribute('current-page') || '1', 10)); }
  _getActiveColor() { return this.getAttribute('active-color') || '#ef4444'; }
  _getItemLabel() { return this.getAttribute('item-label') || 'muc'; }
  _getMaxPages() { return Math.max(1, parseInt(this.getAttribute('max-pages') || '5', 10)); }

  _getTotalPages() {
    return Math.max(1, Math.ceil(this._getTotalItems() / this._getItemsPerPage()));
  }

  // --- Rendering ---

  render() {
    const totalItems = this._getTotalItems();
    const itemsPerPage = this._getItemsPerPage();
    const currentPage = this._getCurrentPage();
    const activeColor = this._getActiveColor();
    const itemLabel = this._getItemLabel();
    const maxPages = this._getMaxPages();
    const totalPages = this._getTotalPages();

    const start = totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
    const end = Math.min(currentPage * itemsPerPage, totalItems);

    const pageItems = this._buildPageItems(totalPages, currentPage, maxPages);
    const navDisabledLeft = currentPage <= 1;
    const navDisabledRight = currentPage >= totalPages;

    const disabledLeftClasses = navDisabledLeft ? 'opacity-50 cursor-not-allowed pointer-events-none' : 'hover:bg-black/5';
    const disabledRightClasses = navDisabledRight ? 'opacity-50 cursor-not-allowed pointer-events-none' : 'hover:bg-black/5';

    const pageNumbersHTML = pageItems.map(item => {
      if (item === '...') {
        return `<span class="px-2 text-gray-500">...</span>`;
      }
      const isActive = item === currentPage;
      if (isActive) {
        return `<span class="px-2 py-1 rounded-md font-semibold cursor-default" style="color:${activeColor}">${item}</span>`;
      }
      return `<span class="px-2 py-1 rounded-md text-gray-700 hover:bg-black/5 cursor-pointer transition-colors" data-page="${item}">${item}</span>`;
    }).join('');

    const chevronLeft = `<svg class="w-4 h-4" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>`;
    const chevronRight = `<svg class="w-4 h-4" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd"/></svg>`;

    return `
      <div class="td-pagination-container flex justify-end">
        <div class="flex items-center gap-3 text-sm">
          <span class="td-pagination-info text-gray-600">${this.escapeHtml(`Hien thi ${start}-${end} / ${totalItems} ${itemLabel}`)}</span>
          <div class="flex items-center gap-2">
            <button class="td-pagination-prev w-8 h-8 inline-flex items-center justify-center rounded-md border border-gray-300 text-gray-700 transition-colors ${disabledLeftClasses}" ${navDisabledLeft ? 'disabled' : ''} title="Trang truoc">
              ${chevronLeft}
            </button>
            <span class="td-pagination-pages inline-flex items-center gap-1">
              ${pageNumbersHTML}
            </span>
            <button class="td-pagination-next w-8 h-8 inline-flex items-center justify-center rounded-md border border-gray-300 text-gray-700 transition-colors ${disabledRightClasses}" ${navDisabledRight ? 'disabled' : ''} title="Trang sau">
              ${chevronRight}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  afterRender() {
    const prevBtn = this.querySelector('.td-pagination-prev');
    const nextBtn = this.querySelector('.td-pagination-next');

    if (prevBtn && !prevBtn.disabled) {
      this.listen(prevBtn, 'click', () => {
        this._setPage(this._getCurrentPage() - 1);
      });
    }

    if (nextBtn && !nextBtn.disabled) {
      this.listen(nextBtn, 'click', () => {
        this._setPage(this._getCurrentPage() + 1);
      });
    }

    this.querySelectorAll('.td-pagination-pages [data-page]').forEach(el => {
      this.listen(el, 'click', () => {
        const page = parseInt(el.getAttribute('data-page'), 10);
        this._setPage(page);
      });
    });
  }

  /**
   * Override attributeChangedCallback to optimize current-page changes.
   * Only update display without full re-render for current-page.
   */
  attributeChangedCallback(name, oldVal, newVal) {
    if (oldVal === newVal) return;
    if (!this._initialized) return;

    // For current-page changes, update display (still need re-render for button states)
    this._doRender();
  }

  // --- Page logic ---

  /**
   * Build page items array with ellipsis for large page counts.
   * Ported directly from dcms-pagination.js PaginationSimple._buildPageItems.
   */
  _buildPageItems(totalPages, currentPage, maxPagesToShow) {
    const pages = [];
    if (totalPages <= maxPagesToShow) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
      return pages;
    }
    const showNeighbors = 1;
    const firstBlock = [1, 2, 3, 4, 5];
    const lastBlock = [totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    const nearStart = currentPage <= 3;
    const nearEnd = currentPage >= totalPages - 2;

    if (nearStart) {
      pages.push(...firstBlock);
      pages.push('...');
      pages.push(totalPages);
      return Array.from(new Set(pages.filter(n => typeof n === 'number' ? n >= 1 && n <= totalPages : true)));
    }
    if (nearEnd) {
      pages.push(1);
      pages.push('...');
      pages.push(...lastBlock);
      return Array.from(new Set(pages.filter(n => typeof n === 'number' ? n >= 1 && n <= totalPages : true)));
    }
    pages.push(1);
    pages.push('...');
    pages.push(currentPage - showNeighbors);
    pages.push(currentPage);
    pages.push(currentPage + showNeighbors);
    pages.push('...');
    pages.push(totalPages);
    return Array.from(new Set(pages.filter(n => typeof n === 'number' ? n >= 1 && n <= totalPages : true)));
  }

  /**
   * Set page and emit page-change event.
   * @param {number} page - Target page number
   */
  _setPage(page) {
    const totalPages = this._getTotalPages();
    const newPage = Math.max(1, Math.min(totalPages, parseInt(page) || 1));
    if (newPage === this._getCurrentPage()) return;

    this.setAttribute('current-page', String(newPage));
    this.emit('page-change', { page: newPage });
  }

  // --- Public API ---

  /** Set current page programmatically */
  setPage(page) { this._setPage(page); }

  /** Get current pagination state */
  getState() {
    return {
      totalItems: this._getTotalItems(),
      itemsPerPage: this._getItemsPerPage(),
      currentPage: this._getCurrentPage(),
      totalPages: this._getTotalPages(),
    };
  }
}

if (!customElements.get('td-pagination')) {
  customElements.define('td-pagination', TdPagination);
}
