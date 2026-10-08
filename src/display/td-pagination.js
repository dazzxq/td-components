import { TdBaseElement } from '../base/td-base-element.js';
import { TdButton } from '../form/td-button.js';
import { pickPole } from '../theme/color.js';
import { fillIconSlots } from '../icons/td-icon.js';
import { pageRange, hookText } from '../utils/page-info.js';

/** `{name}` placeholders from `vars`; unknown ones are kept as written. */
const format = (tpl, vars = {}) => String(tpl ?? '').replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));

/**
 * Pagination — token-native (v0.8.0). Styles: td.css (`components/pagination.css`, block `.td-pagination`).
 *
 * Markup: `<nav class="td-pagination" aria-label>` > `p.td-pagination__info[aria-live=polite]` +
 * `.td-pagination__controls` (prev/next `button.td-pagination__nav` with registry `prev`/`next` icons,
 * `ul.td-pagination__pages` of `button.td-pagination__page[data-page]`, current = `[aria-current="page"]`).
 * Page changes keep the nav + live region and rebuild only the controls, restoring keyboard focus.
 *
 * Responsive (v0.34.0, plan QĐ 8): the host is a size container (`container: td-pagination / inline-size` — it needs
 * its width from the parent). Every `<li>` carries a static `data-rel`: `current` | `edge` (first / last page) |
 * `adjacent` (current ± 1) | `far` (the rest of the window) | `ellipsis` (a regular gap, always shown) | `gap` (an ellipsis only the compact form shows). Below
 * 480px of container width CSS hides `adjacent` + `far` and shows `gap` → "‹ 1 … 57 … 200 ›" with exactly one
 * ellipsis wherever pages are hidden, and the info line takes its own row. Below 360px (ADR 0014 container-only `2xs`)
 * the STATUS form "‹ 57 / 200 ›": prev + `span.td-pagination__status[aria-hidden]` (`labels.status`, rebuilt with the
 * controls on every page change) + next; the page list is hidden and the info line is visually hidden but stays the
 * (single) live region. No JS runs on resize.
 *
 * @element td-pagination
 * @attr {number} total-items - Total number of items (default 0)
 * @attr {number} items-per-page - Items per page (default 10)
 * @attr {number} current-page - Current page, 1-based (default 1; clamped to [1, totalPages] when rendered)
 * @attr {string} active-color - Current-page pill colour (safeColor; default token `--td-pagination-active`
 *   = accent). The text colour is chosen by WCAG contrast against the colour as rendered (translucent colours
 *   are composited over the nearest opaque ancestor background, fallback the page `--td-color-bg`).
 * @attr {string} item-label - Item noun in the info text (`{item}`; default `TdPagination.labels.item` = 'mục')
 * @attr {number} max-pages - Size of the sliding window of consecutive page buttons (default 5); the first and
 *   last pages are always shown, gaps as an ellipsis.
 * @attr {string} aria-label - Landmark name of the `<nav>` (default 'Phân trang'); give each instance on a page
 *   a distinct label.
 * @attr {boolean} quiet - Info text is not a live region (a second pagination for the same list, e.g. td-table's
 *   top one, so a page change is announced once).
 * @fires page-change - When page changes, detail: { page }
 *
 * Texts: `TdPagination.labels` — `prev`, `next`, `page` (`{n}`), `info` (`{from}`, `{to}`, `{total}`, `{item}`),
 * `item`, `status` (`{current}`, `{total}` pages; v0.34.0). Override per site; they apply on the next render.
 *
 * @property {Function|null} formatInfo - v0.57.2 per-instance info text: `(ctx) => string` with ctx = `{ from, to,
 *   total, item, page, perPage, totalPages, text }` (`text` = the default text). The result is TEXT (never HTML); a
 *   non-string / a throw → the default text + one console warning per instance. Assigning it (even the same function
 *   again) refreshes the info text in place (the controls are not rebuilt); `null` = the default text.
 */
export class TdPagination extends TdBaseElement {
  /** Default texts (Vietnamese); override per site: `TdPagination.labels.info = 'Showing {from}-{to} of {total}'`. */
  static labels = {
    prev: 'Trang trước',
    next: 'Trang sau',
    page: 'Trang {n}',
    info: 'Hiển thị {from}-{to} / {total} {item}',
    item: 'mục',
    status: '{current} / {total}',
  };

  static get booleanAttributes() { return ['quiet']; }

  static get observedAttributes() {
    return ['total-items', 'items-per-page', 'current-page', 'active-color', 'item-label', 'max-pages', 'aria-label', 'quiet'];
  }

  constructor() {
    super();
    /** @private custom properties THIS component set on the host (a site's own inline vars are never removed) */
    this._ownVars = new Set();
    /** v0.57.2 per-instance info text hook; warned once. */
    this._formatInfo = null;
    this._infoWarned = false;
    // One delegated listener on the host for the element's lifetime (no per-render listeners to leak,
    // survives disconnect/reconnect).
    this.addEventListener('click', (e) => this._onClick(e));
  }

  // --- Attribute helpers ---

  /** Integer attribute; values outside the safe-integer range are clamped (float precision would break paging). */
  _int(name, fallback) {
    const n = parseInt(this.getAttribute(name) ?? '', 10);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(-Number.MAX_SAFE_INTEGER, Math.min(Number.MAX_SAFE_INTEGER, n));
  }

  _getTotalItems() { return Math.max(0, this._int('total-items', 0)); }
  _getItemsPerPage() { return Math.max(1, this._int('items-per-page', 10)); }
  /** Current page clamped to [1, totalPages] (the attribute may be out of range). */
  _getCurrentPage() { return Math.min(this._getTotalPages(), Math.max(1, this._int('current-page', 1))); }
  _getItemLabel() { return this.getAttribute('item-label') || String(TdPagination.labels.item ?? ''); }
  /** Window size, clamped to 1…25 (security review: bounded DOM regardless of attribute values). */
  _getMaxPages() { return Math.max(1, Math.min(25, this._int('max-pages', 5))); }
  _getNavLabel() { return (this.getAttribute('aria-label') || '').trim() || 'Phân trang'; }

  _getTotalPages() {
    return Math.max(1, Math.ceil(this._getTotalItems() / this._getItemsPerPage()));
  }

  _infoText() {
    const total = this._getTotalItems();
    const per = this._getItemsPerPage();
    const page = this._getCurrentPage();
    const { from, to } = pageRange(total, per, page);
    const item = this._getItemLabel();
    const text = format(TdPagination.labels.info, { from, to, total, item });
    if (!this._formatInfo) return text;
    const ctx = { from, to, total, item, page, perPage: per, totalPages: this._getTotalPages(), text };
    const warn = (msg) => {
      if (this._infoWarned) return;
      this._infoWarned = true;
      console.warn(msg);
    };
    return hookText(this._formatInfo, ctx, warn, 'td-pagination: formatInfo') ?? text;
  }

  /** v0.57.2: `(ctx) => string` per-instance info text (see the class doc); a non-function = null. */
  get formatInfo() { return this._formatInfo; }
  set formatInfo(fn) {
    this._formatInfo = typeof fn === 'function' ? fn : null;
    if (this._initialized) this._syncInfo();
  }

  /** @private Rewrite the info text only (same live region; written only when it changed). */
  _syncInfo() {
    const info = this.querySelector(':scope > .td-pagination > .td-pagination__info');
    if (!info) return;
    const text = this._infoText();
    if (info.textContent !== text) info.textContent = text;
  }

  // --- Rendering ---

  render() {
    return `<nav class="td-pagination" aria-label="${this.escapeHtml(this._getNavLabel())}">`
      + `<p class="td-pagination__info"${this.hasAttribute('quiet') ? '' : ' aria-live="polite"'}>${this.escapeHtml(this._infoText())}</p>`
      + `<div class="td-pagination__controls">${this._controlsHtml()}</div>`
      + '</nav>';
  }

  _controlsHtml() {
    const current = this._getCurrentPage();
    const totalPages = this._getTotalPages();
    const L = TdPagination.labels;
    const esc = (s) => this.escapeHtml(String(s ?? ''));
    const nav = (dir, label, disabled) => `<button type="button" class="td-pagination__nav td-pagination__nav--${dir}"`
      + ` data-nav="${dir}" aria-label="${esc(label)}"${disabled ? ' aria-disabled="true"' : ''}>`
      + `<span class="td-pagination__icon" data-td-icon="${dir}"></span></button>`;
    const items = TdPagination._withCompactGaps(this._buildPageItems(totalPages, current, this._getMaxPages()), current, totalPages)
      .map((item) => {
        if (item === '...') return '<li class="td-pagination__ellipsis" data-rel="ellipsis" aria-hidden="true">…</li>';
        if (item === 'gap') return '<li class="td-pagination__ellipsis" data-rel="gap" aria-hidden="true">…</li>';
        const cur = item === current ? ' aria-current="page"' : '';
        return `<li data-rel="${TdPagination._rel(item, current, totalPages)}"><button type="button" class="td-pagination__page" data-page="${item}" aria-label="${esc(format(L.page, { n: item }))}"${cur}>${item}</button></li>`;
      }).join('');
    // v0.34.0: the status form's "57 / 200" (shown by CSS only below 360px of container width). aria-hidden: the
    // live region (.td-pagination__info, kept as a visually hidden live region in that form) is the ONE announcement.
    const status = `<span class="td-pagination__status" aria-hidden="true">${esc(format(L.status, { current, total: totalPages }))}</span>`;
    return nav('prev', L.prev, current <= 1)
      + status
      + `<ul class="td-pagination__pages">${items}</ul>`
      + nav('next', L.next, current >= totalPages);
  }

  /**
   * First render builds the whole tree; later renders keep the `<nav>` and the live region (so the info text
   * change is announced) and rebuild only the controls, re-focusing the control the user was on.
   * @private
   */
  _doRender() {
    // Colours first: the host custom properties exist before the buttons get their first computed style (so the
    // current page never animates from the token colours to the custom ones).
    this._applyStyles();
    const nav = this.querySelector(':scope > .td-pagination');
    if (!nav) {
      this.innerHTML = this.render();
      this.afterRender();
      return;
    }
    const focusKey = this._focusKey();
    nav.setAttribute('aria-label', this._getNavLabel());
    const info = nav.querySelector('.td-pagination__info');
    if (info) {
      if (this.hasAttribute('quiet')) info.removeAttribute('aria-live');
      else info.setAttribute('aria-live', 'polite');
    }
    const text = this._infoText();
    if (info && info.textContent !== text) info.textContent = text;
    const controls = nav.querySelector('.td-pagination__controls');
    if (controls) controls.innerHTML = this._controlsHtml();
    this.afterRender();
    if (focusKey) this._restoreFocus(focusKey);
  }

  afterRender() {
    fillIconSlots(this);
  }

  /** @private The role of the focused control inside this pagination, or null. */
  _focusKey() {
    const a = document.activeElement;
    if (!a || !this.contains(a)) return null;
    if (a.hasAttribute('data-nav')) return a.getAttribute('data-nav');
    if (a.hasAttribute('data-page')) return `page:${a.getAttribute('data-page')}`;
    return null;
  }

  /** @private */
  _restoreFocus(key) {
    let target = null;
    if (key === 'prev' || key === 'next') {
      target = this.querySelector(`[data-nav="${key}"]:not([aria-disabled="true"])`);
    } else {
      target = this.querySelector(`.td-pagination__page[data-page="${key.slice(5)}"]`);
    }
    target = target || this.querySelector('.td-pagination__page[aria-current="page"]');
    // v0.34.0 status form (< 360px): the page list is not rendered → stay on the same nav button, now aria-disabled
    // (still focusable by design) instead of losing focus to <body>.
    if (target && !target.getClientRects().length && (key === 'prev' || key === 'next')) {
      target = this.querySelector(`[data-nav="${key}"]`);
    }
    target?.focus();
  }

  /** @private Delegated click handler (buttons only; aria-disabled nav buttons are inert). */
  _onClick(e) {
    const btn = e.target instanceof Element ? e.target.closest('button') : null;
    if (!btn || !this.contains(btn)) return;
    if (btn.getAttribute('aria-disabled') === 'true') { e.preventDefault(); return; }
    const dir = btn.getAttribute('data-nav');
    if (dir === 'prev') this._setPage(this._getCurrentPage() - 1);
    else if (dir === 'next') this._setPage(this._getCurrentPage() + 1);
    else if (btn.hasAttribute('data-page')) this._setPage(parseInt(btn.getAttribute('data-page'), 10));
  }

  /**
   * D10: `active-color` → host `--td-pagination-active` (safeColor) + `--td-pagination-active-fg` chosen by
   * WCAG contrast against the colour as rendered. Without a (valid) colour the ones this component set are removed
   * (a site's own inline values are left alone) and the tokens apply.
   * @private
   */
  _applyStyles() {
    const color = this.safeColor(this.getAttribute('active-color'), '');
    const parsed = color ? TdButton._parseColor(color) : null;
    if (!parsed) {
      this._removeOwnVar('--td-pagination-active');
      this._removeOwnVar('--td-pagination-active-fg');
      return;
    }
    // The NORMALISED literal (contextual values such as currentColor resolved once) — exactly the colour the
    // contrast was computed for.
    this._setOwnVar('--td-pagination-active', parsed.css);
    this._setOwnVar('--td-pagination-active-fg', TdPagination._contrastFg(parsed, this._backdrop()));
  }

  /** @private Set a host custom property and remember that this component owns it. */
  _setOwnVar(name, value) {
    this.style.setProperty(name, value);
    this._ownVars.add(name);
  }

  /** @private Remove a host custom property only if this component set it. */
  _removeOwnVar(name) {
    if (!this._ownVars.delete(name)) return;
    this.style.removeProperty(name);
  }

  /** @private The opaque colour behind this element: translucent ancestor backgrounds composited over the
   * nearest opaque one (fallback: the page `--td-color-bg`, else white). */
  _backdrop() {
    const layers = [];
    let base = null;
    for (let el = this; el; el = el.parentElement) {
      const c = TdButton._parseColor(getComputedStyle(el).backgroundColor);
      if (!c || c.a <= 0) continue;
      if (c.a >= 1) { base = c; break; }
      layers.push(c);
    }
    if (!base) {
      const page = getComputedStyle(document.documentElement).getPropertyValue('--td-color-bg').trim();
      const p = page ? TdButton._parseColor(page) : null;
      base = p ? TdPagination._over(p, { r: 255, g: 255, b: 255 }) : { r: 255, g: 255, b: 255 };
    }
    for (let i = layers.length - 1; i >= 0; i--) base = TdPagination._over(layers[i], base);
    return base;
  }

  /** @private Composite colour `c` (with alpha) over an opaque `under`. */
  static _over(c, under) {
    const a = c.a == null ? 1 : c.a;
    const mix = (k) => c[k] * a + under[k] * (1 - a);
    return { r: mix('r'), g: mix('g'), b: mix('b'), a: 1 };
  }

  /** @private Black or white, whichever contrasts more with `color` rendered over `under`. */
  static _contrastFg(color, under) {
    const c = TdPagination._over(color, under);
    return pickPole({ r: c.r / 255, g: c.g / 255, b: c.b / 255 }, { tie: 'black' }); // v0.42.0: src/theme/color.js
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (oldVal === newVal || !this._initialized) return;
    if (name === 'active-color') { this._applyStyles(); return; }
    this._doRender();
  }

  // --- Page logic ---

  /**
   * Page items: a window of `maxPages` consecutive pages around the current one (clamped to the range),
   * plus the first/last page; a gap of one page shows that page, larger gaps an ellipsis.
   */
  _buildPageItems(totalPages, currentPage, maxPages) {
    if (totalPages <= maxPages) return Array.from({ length: totalPages }, (_, i) => i + 1);
    let start = currentPage - Math.floor((maxPages - 1) / 2);
    start = Math.max(1, Math.min(start, totalPages - maxPages + 1));
    const end = start + maxPages - 1;
    const items = [];
    if (start > 1) {
      items.push(1);
      if (start === 3) items.push(2);
      else if (start > 3) items.push('...');
    }
    // Index-bounded (never more than maxPages iterations, whatever the page numbers' magnitude).
    for (let i = 0; i < maxPages && start + i <= end; i++) items.push(start + i);
    if (end < totalPages) {
      if (end === totalPages - 2) items.push(totalPages - 1);
      else if (end < totalPages - 2) items.push('...');
      items.push(totalPages);
    }
    return items;
  }

  /**
   * v0.34.0: relation of a page to the current one — what the compact form (< 480px) keeps (`current`, `edge`).
   * @param {number} page
   * @param {number} current
   * @param {number} totalPages
   * @returns {'current'|'edge'|'adjacent'|'far'}
   */
  static _rel(page, current, totalPages) {
    if (page === current) return 'current';
    if (page === 1 || page === totalPages) return 'edge';
    return Math.abs(page - current) === 1 ? 'adjacent' : 'far';
  }

  /**
   * v0.34.0: the compact form shows only first / current / last, so every side with a hidden page needs an ellipsis.
   * A regular ellipsis ('...', `data-rel="ellipsis"`, shown in both forms — compact it stands for hidden pages too) already
   * covers its side; a side without one gets a compact-only 'gap' item next to its edge page. Result: exactly one
   * visible ellipsis per side with hidden pages, in both forms.
   * @param {Array<number|'...'>} items
   * @param {number} current
   * @param {number} totalPages
   * @returns {Array<number|'...'|'gap'>}
   */
  static _withCompactGaps(items, current, totalPages) {
    const at = items.indexOf(current);
    const out = items.slice();
    // after the current page first (indices before it stay valid)
    if (current <= totalPages - 2 && !items.slice(at + 1).includes('...')) out.splice(out.length - 1, 0, 'gap');
    if (current >= 3 && !items.slice(0, at).includes('...')) out.splice(1, 0, 'gap');
    return out;
  }

  /**
   * Set page and emit page-change event.
   * @param {number} page - Target page number
   */
  _setPage(page) {
    const totalPages = this._getTotalPages();
    const newPage = Math.max(1, Math.min(totalPages, parseInt(page, 10) || 1));
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
