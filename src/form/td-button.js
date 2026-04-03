import { TdBaseElement } from '../base/td-base-element.js';

/**
 * Button component with glass styling, 6 variants, loading state, and icon support.
 *
 * @element td-button
 * @attr {string} variant - Style variant: primary | secondary | success | danger | info | warning (default: primary)
 * @attr {string} size - Size: sm | md | lg (default: md)
 * @attr {string} icon - Icon CSS class (e.g. "fas fa-edit")
 * @attr {string} icon-position - Icon position: left | right (default: left)
 * @attr {boolean} loading - Shows spinner and disables button
 * @attr {boolean} disabled - Disables button
 * @attr {boolean} full-width - Makes button full width
 * @attr {string} color - Custom background color (overrides variant)
 * @attr {string} text-color - Custom text color (auto-calculated if not set)
 * @attr {string} label - Button text (alternative to textContent)
 * @fires click - When clicked, detail: {}
 */
export class TdButton extends TdBaseElement {
  static get observedAttributes() {
    return ['variant', 'size', 'icon', 'icon-position', 'loading', 'disabled', 'full-width', 'color', 'text-color', 'label'];
  }
  static get booleanAttributes() { return ['loading', 'disabled', 'full-width']; }

  /** @private */
  static _glassStyles = {
    primary: {
      background: 'rgba(31, 41, 55, 0.85)',
      backdropFilter: 'blur(8px)',
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.10), 0 4px 12px rgba(31, 41, 55, 0.20), inset 0 1px 0 rgba(255, 255, 255, 0.10)',
      hoverBoxShadow: '0 2px 6px rgba(0, 0, 0, 0.12), 0 8px 20px rgba(31, 41, 55, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.15)',
    },
    secondary: {
      background: 'rgba(0, 0, 0, 0.04)',
      backdropFilter: 'blur(8px)',
      boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.8), 0 1px 2px rgba(0, 0, 0, 0.05)',
      hoverBoxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.9), 0 2px 4px rgba(0, 0, 0, 0.08)',
    },
    success: {
      background: 'rgba(34, 197, 94, 0.85)',
      backdropFilter: 'blur(8px)',
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.10), 0 4px 12px rgba(34, 197, 94, 0.20), inset 0 1px 0 rgba(255, 255, 255, 0.25)',
      hoverBoxShadow: '0 2px 6px rgba(0, 0, 0, 0.12), 0 8px 20px rgba(34, 197, 94, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.30)',
    },
    danger: {
      background: 'rgba(239, 68, 68, 0.85)',
      backdropFilter: 'blur(8px)',
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.10), 0 4px 12px rgba(239, 68, 68, 0.20), inset 0 1px 0 rgba(255, 255, 255, 0.22)',
      hoverBoxShadow: '0 2px 6px rgba(0, 0, 0, 0.12), 0 8px 20px rgba(239, 68, 68, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.28)',
    },
    info: {
      background: 'rgba(59, 130, 246, 0.85)',
      backdropFilter: 'blur(8px)',
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.10), 0 4px 12px rgba(59, 130, 246, 0.20), inset 0 1px 0 rgba(255, 255, 255, 0.25)',
      hoverBoxShadow: '0 2px 6px rgba(0, 0, 0, 0.12), 0 8px 20px rgba(59, 130, 246, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.30)',
    },
    warning: {
      background: 'rgba(249, 115, 22, 0.85)',
      backdropFilter: 'blur(8px)',
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.10), 0 4px 12px rgba(249, 115, 22, 0.20), inset 0 1px 0 rgba(255, 255, 255, 0.25)',
      hoverBoxShadow: '0 2px 6px rgba(0, 0, 0, 0.12), 0 8px 20px rgba(249, 115, 22, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.30)',
    },
  };

  /** @private */
  static _variantClasses = {
    primary: 'text-white focus:ring-gray-500/30 border border-white/[0.1] active:scale-[0.98] active:duration-100',
    secondary: 'text-gray-700 border border-black/[0.12] hover:bg-black/[0.06] focus:ring-gray-500/20 active:scale-[0.98] active:duration-100',
    success: 'text-white focus:ring-green-500/30 border border-white/[0.15] active:scale-[0.98] active:duration-100',
    danger: 'text-white focus:ring-red-500/30 border border-white/[0.15] active:scale-[0.98] active:duration-100',
    info: 'text-white focus:ring-blue-500/30 border border-white/[0.15] active:scale-[0.98] active:duration-100',
    warning: 'text-white focus:ring-orange-400/30 border border-white/[0.15] active:scale-[0.98] active:duration-100',
  };

  /** @private */
  static _sizeClasses = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-5 py-2.5 text-sm',
    lg: 'px-6 py-3 text-base',
  };

  /**
   * Get contrast color (black or white) for a given background.
   * @param {string} color - Hex color string
   * @returns {string} '#000000' or '#ffffff'
   */
  static _getContrastColor(color) {
    const rgb = TdButton._hexToRgb(color);
    if (!rgb) return '#ffffff';
    const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
    return luminance > 0.5 ? '#000000' : '#ffffff';
  }

  /**
   * Convert hex color to RGB object.
   * @param {string} hex - Color string (hex or named)
   * @returns {{ r: number, g: number, b: number } | null}
   */
  static _hexToRgb(hex) {
    if (!hex) return null;
    if (hex.startsWith('#')) {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      } : null;
    }
    // For non-hex colors, attempt basic parsing
    const match = hex.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
    if (match) {
      return { r: parseInt(match[1]), g: parseInt(match[2]), b: parseInt(match[3]) };
    }
    return null;
  }

  /** @private */
  _getButtonText() {
    return this.getAttribute('label') || this._originalText || 'Button';
  }

  connectedCallback() {
    // Capture textContent before first render overwrites it
    if (!this._originalText) {
      const text = this.textContent.trim();
      this._originalText = text || '';
    }
    super.connectedCallback();
  }

  /**
   * Set loading state programmatically.
   * @param {boolean} isLoading
   */
  setLoading(isLoading) {
    if (isLoading) {
      this.setAttribute('loading', '');
    } else {
      this.removeAttribute('loading');
    }
  }

  /**
   * Set disabled state programmatically.
   * @param {boolean} isDisabled
   */
  setDisabled(isDisabled) {
    if (isDisabled) {
      this.setAttribute('disabled', '');
    } else {
      this.removeAttribute('disabled');
    }
  }

  render() {
    const variant = this.getAttribute('variant') || 'primary';
    const size = this.getAttribute('size') || 'md';
    const icon = this.getAttribute('icon') || '';
    const iconPosition = this.getAttribute('icon-position') || 'left';
    const isLoading = this.hasAttribute('loading');
    const isDisabled = this.hasAttribute('disabled');
    const isFullWidth = this.hasAttribute('full-width');
    const customColor = this.getAttribute('color') || '';
    const customTextColor = this.getAttribute('text-color') || '';
    const buttonText = this.escapeHtml(this._getButtonText());

    // Build CSS classes
    const baseClasses = [
      'inline-flex items-center justify-center font-medium rounded-[10px]',
      'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-offset-1',
      'transition-[transform,opacity,background-color] duration-200',
    ];

    const sizeClass = TdButton._sizeClasses[size] || TdButton._sizeClasses.md;
    baseClasses.push(sizeClass);

    if (isFullWidth) baseClasses.push('w-full');
    if (isDisabled || isLoading) baseClasses.push('opacity-50 cursor-not-allowed');

    // Variant classes (only when no custom color)
    if (!customColor) {
      const vc = TdButton._variantClasses[variant] || TdButton._variantClasses.primary;
      baseClasses.push(vc);
    }

    const classes = baseClasses.join(' ');

    // Build inline styles for glass effect
    let inlineStyle = '';
    if (customColor) {
      const textColor = customTextColor || TdButton._getContrastColor(customColor);
      inlineStyle = `background-color:${customColor};color:${textColor};border-color:${customColor};`;
    } else {
      const gs = TdButton._glassStyles[variant] || TdButton._glassStyles.primary;
      inlineStyle = `background:${gs.background};backdrop-filter:${gs.backdropFilter};-webkit-backdrop-filter:${gs.backdropFilter};box-shadow:${gs.boxShadow};`;
    }

    // Build button content
    let content = '';
    if (isLoading) {
      content = `
        <svg class="animate-spin h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span>Dang xu ly...</span>
      `;
    } else {
      const iconLeft = icon && iconPosition === 'left' ? `<i class="${this.escapeHtml(icon)} mr-2"></i>` : '';
      const iconRight = icon && iconPosition === 'right' ? `<i class="${this.escapeHtml(icon)} ml-2"></i>` : '';
      content = `${iconLeft}<span>${buttonText}</span>${iconRight}`;
    }

    return `
      <button
        class="${classes}"
        style="${inlineStyle}"
        ${isDisabled || isLoading ? 'disabled' : ''}
        type="button"
      >${content}</button>
    `;
  }

  afterRender() {
    const btn = this.querySelector('button');
    if (!btn) return;

    const variant = this.getAttribute('variant') || 'primary';
    const customColor = this.getAttribute('color') || '';
    const isLoading = this.hasAttribute('loading');
    const isDisabled = this.hasAttribute('disabled');

    // Click handler
    this.listen(btn, 'click', (e) => {
      if (isLoading || isDisabled) return;
      this.emit('click', {});
    });

    // Hover/focus effects for glass styles (non-custom-color)
    if (!customColor && !isLoading && !isDisabled) {
      const gs = TdButton._glassStyles[variant] || TdButton._glassStyles.primary;

      this.listen(btn, 'mouseenter', () => {
        btn.style.boxShadow = gs.hoverBoxShadow;
      });
      this.listen(btn, 'mouseleave', () => {
        btn.style.boxShadow = gs.boxShadow;
      });
      this.listen(btn, 'focus', () => {
        btn.style.boxShadow = gs.hoverBoxShadow;
      });
      this.listen(btn, 'blur', () => {
        btn.style.boxShadow = gs.boxShadow;
      });
    }
  }
}

if (!customElements.get('td-button')) {
  customElements.define('td-button', TdButton);
}
