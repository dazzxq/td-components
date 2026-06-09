import { TdBaseElement } from '../base/td-base-element.js';
import { applyStyles } from '../utils/css-safe.js';

/**
 * Empty state component for tables, modals, and standalone sections.
 * Port of dcms-empty-state.js (EmptyState) to Web Component extending TdBaseElement.
 *
 * @element td-empty-state
 * @attr {string} icon - Icon identifier OR a raw `<svg>…</svg>` string. A value starting
 *   with `<svg` is injected as **trusted raw HTML** — pass only developer-authored markup,
 *   never end-user input. `title`/`message` are always escaped.
 * @attr {string} title - Title text (default 'Không có dữ liệu')
 * @attr {string} message - Message text (default 'Chưa có mục nào được tạo.')
 * @attr {string} size - Size variant: 'sm' | 'md' | 'lg' (default 'md')
 * @attr {boolean} compact - Compact mode with reduced padding
 *
 * @property {Array<{label: string, variant?: string, onClick: Function}>} actions - Action buttons
 */
export class TdEmptyState extends TdBaseElement {
  static get observedAttributes() {
    return ['icon', 'title', 'message', 'size', 'compact'];
  }

  static get booleanAttributes() {
    return ['compact'];
  }

  constructor() {
    super();
    this._actions = [];
  }

  // --- JS Property: actions ---

  get actions() { return this._actions; }
  set actions(val) {
    this._actions = Array.isArray(val) ? val : [];
    if (this._initialized) {
      this._renderActions();
    }
  }

  // --- Size config ---

  static get _sizeMap() {
    return {
      sm: { icon: 28, title: 'text-base', message: 'text-xs', gap: 8, padding: 16 },
      md: { icon: 40, title: 'text-lg', message: 'text-sm', gap: 10, padding: 22 },
      lg: { icon: 56, title: 'text-xl', message: 'text-base', gap: 12, padding: 28 },
    };
  }

  _getSize() {
    const size = this.getAttribute('size') || 'md';
    return TdEmptyState._sizeMap[size] || TdEmptyState._sizeMap.md;
  }

  _getTitle() { return this.getAttribute('title') || 'Không có dữ liệu'; }
  _getMessage() { return this.getAttribute('message') || 'Chưa có mục nào được tạo.'; }
  _isCompact() { return this.hasAttribute('compact'); }

  // --- Default inbox SVG icon ---

  _getIconHtml(s) {
    const customIcon = this.getAttribute('icon');
    if (customIcon && customIcon !== 'inbox') {
      // CONSUMER RAW-SVG HATCH (OUT OF SCOPE for the lib's CSP guarantee): a value
      // starting with `<svg` is injected verbatim as trusted raw HTML. The library does
      // NOT sanitize it — if the consumer passes inline `style=`/`<style>` here, a strict
      // CSP will block that consumer content. Documented in the @attr JSDoc above.
      if (customIcon.trim().startsWith('<svg')) {
        return customIcon;
      }
      // Otherwise treat as text identifier — still show default
    }

    // LIBRARY-AUTHORED default icon. CSP-safe: width/height are SVG PRESENTATION
    // ATTRIBUTES (not inline style=); the `color` scalar that drives `currentColor` for
    // `stroke` is applied via CSSOM in `_applyStyles()` (keyed off the stable
    // `.td-empty-icon` class).
    return `
      <svg class="td-empty-icon" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2" width="${s.icon}" height="${s.icon}">
        <rect x="12" y="24" width="40" height="28" rx="3" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M12 32h14l4 6h4l4-6h14" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M26 18l6-6 6 6" stroke-linecap="round" stroke-linejoin="round" opacity="0.4"/>
        <path d="M32 12v12" stroke-linecap="round" stroke-linejoin="round" opacity="0.4"/>
      </svg>
    `;
  }

  // --- Rendering ---

  render() {
    const title = this._getTitle();
    const message = this._getMessage();
    const s = this._getSize();

    return `
      <div class="td-empty-state-card w-full flex flex-col items-center justify-center text-center border border-dashed rounded-xl">
        <div class="td-empty-icon-wrap">
          ${this._getIconHtml(s)}
        </div>
        <h3 class="td-empty-title font-semibold text-gray-800 ${s.title}">
          ${this.escapeHtml(title)}
        </h3>
        <p class="td-empty-message text-gray-500 ${s.message}">
          ${this.escapeHtml(message)}
        </p>
        <div class="td-empty-actions flex flex-wrap gap-2">
        </div>
      </div>
    `;
  }

  afterRender() {
    this._renderActions();
  }

  /**
   * CSP-safe per-element SCALAR styling via CSSOM (replaces the former declarative
   * `style="…"` attributes). Auto-invoked by TdBaseElement after `afterRender()` on the
   * initial render and on every observed-attribute re-render, so size/compact-driven
   * scalars stay correct as attributes change. All values are library-authored constants
   * (size map ints + fixed colors), so no attribute-derived sanitization is needed.
   */
  _applyStyles() {
    const s = this._getSize();
    const padding = this._isCompact() ? Math.round(s.padding / 2) : s.padding;

    applyStyles(this.querySelector('.td-empty-state-card'), {
      'border-color': 'rgba(0,0,0,0.12)',
      padding: `${padding}px`,
      'background-color': 'rgba(255,255,255,0.6)',
      'box-shadow': 'inset 0 1px 0 rgba(255,255,255,0.8)',
    });

    applyStyles(this.querySelector('.td-empty-icon-wrap'), {
      'margin-bottom': `${s.gap}px`,
    });

    // Default icon color drives `currentColor` for the SVG `stroke`. Only present for the
    // library-authored default icon; a consumer raw `<svg>` has no `.td-empty-icon` node,
    // so this is a no-op for that hatch.
    applyStyles(this.querySelector('.td-empty-icon'), {
      color: '#9ca3af',
    });

    applyStyles(this.querySelector('.td-empty-title'), {
      'margin-bottom': `${s.gap - 2}px`,
    });

    applyStyles(this.querySelector('.td-empty-actions'), {
      'margin-top': `${s.gap + 6}px`,
      display: this._actions.length === 0 ? 'none' : null,
    });
  }

  /**
   * Render action buttons into the actions container.
   * Uses plain HTML buttons styled with Tailwind (self-contained, no td-button dependency).
   */
  _renderActions() {
    const container = this.querySelector('.td-empty-actions');
    if (!container) return;

    container.innerHTML = '';

    if (this._actions.length === 0) {
      container.style.display = 'none';
      return;
    }

    container.style.display = '';

    this._actions.forEach((action, index) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = action.label || 'Action';

      // Variant styling
      const variant = action.variant || 'secondary';
      const baseClasses = 'px-4 py-2 text-sm font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1';

      if (variant === 'primary') {
        btn.className = `${baseClasses} bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500`;
      } else if (variant === 'danger') {
        btn.className = `${baseClasses} bg-red-600 text-white hover:bg-red-700 focus:ring-red-500`;
      } else {
        // secondary / default
        btn.className = `${baseClasses} border border-gray-300 text-gray-700 hover:bg-gray-50 focus:ring-gray-400`;
      }

      if (typeof action.onClick === 'function') {
        this.listen(btn, 'click', action.onClick);
      }

      container.appendChild(btn);
    });
  }
}

if (!customElements.get('td-empty-state')) {
  customElements.define('td-empty-state', TdEmptyState);
}
