import { TdBaseElement } from '../base/td-base-element.js';

/**
 * Empty state component for tables, modals, and standalone sections.
 * Port of dcms-empty-state.js (EmptyState) to Web Component extending TdBaseElement.
 *
 * @element td-empty-state
 * @attr {string} icon - SVG string or icon identifier (default renders inline inbox SVG)
 * @attr {string} title - Title text (default 'Khong co du lieu')
 * @attr {string} message - Message text (default 'Chua co muc nao duoc tao.')
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

  _getTitle() { return this.getAttribute('title') || 'Khong co du lieu'; }
  _getMessage() { return this.getAttribute('message') || 'Chua co muc nao duoc tao.'; }
  _isCompact() { return this.hasAttribute('compact'); }

  // --- Default inbox SVG icon ---

  _getIconHtml(s) {
    const customIcon = this.getAttribute('icon');
    if (customIcon && customIcon !== 'inbox') {
      // If user provides custom SVG string (starts with <svg)
      if (customIcon.trim().startsWith('<svg')) {
        return customIcon;
      }
      // Otherwise treat as text identifier — still show default
    }

    return `
      <svg class="td-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:${s.icon}px;height:${s.icon}px;color:#9ca3af;">
        <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859M12 3v8.25m0 0l-3-3m3 3l3-3M2.25 13.5V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18v-4.5"/>
      </svg>
    `;
  }

  // --- Rendering ---

  render() {
    const s = this._getSize();
    const title = this._getTitle();
    const message = this._getMessage();
    const compact = this._isCompact();
    const padding = compact ? Math.round(s.padding / 2) : s.padding;

    return `
      <div class="td-empty-state-card w-full flex flex-col items-center justify-center text-center border border-dashed rounded-xl"
           style="border-color:rgba(0,0,0,0.12);padding:${padding}px;background-color:rgba(255,255,255,0.6);box-shadow:inset 0 1px 0 rgba(255,255,255,0.8);">
        <div style="margin-bottom:${s.gap}px;">
          ${this._getIconHtml(s)}
        </div>
        <h3 class="td-empty-title font-semibold text-gray-800 ${s.title}" style="margin-bottom:${s.gap - 2}px;">
          ${this.escapeHtml(title)}
        </h3>
        <p class="td-empty-message text-gray-500 ${s.message}">
          ${this.escapeHtml(message)}
        </p>
        <div class="td-empty-actions flex flex-wrap gap-2" style="margin-top:${s.gap + 6}px;${this._actions.length === 0 ? 'display:none;' : ''}">
        </div>
      </div>
    `;
  }

  afterRender() {
    this._renderActions();
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
