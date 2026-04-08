import { TdBaseElement } from '../base/td-base-element.js';

/**
 * Toggle switch component with SVG cross/checkmark icons and bounce animation.
 *
 * @element td-toggle
 * @attr {boolean} checked - Whether the toggle is on
 * @attr {boolean} disabled - Disables interaction
 * @attr {string} label - Label text displayed next to the switch
 * @attr {string} size - Size variant: sm | md | lg (default: md)
 * @attr {string} color - Active color (default: #4ADE80)
 * @fires change - When toggled, detail: { checked: boolean }
 */
export class TdToggle extends TdBaseElement {
  static get observedAttributes() { return ['checked', 'disabled', 'label', 'size', 'color']; }
  static get booleanAttributes() { return ['checked', 'disabled']; }

  constructor() {
    super();
    this._uniqueClass = 'td-toggle-' + Math.random().toString(36).slice(2, 8);
    this._styleEl = null;
  }

  /** @private */
  _getSizeConfig() {
    const sizes = {
      sm: { width: 40, height: 20, thumb: 16, offset: 2, iconSize: 8, stroke: 1.5 },
      md: { width: 48, height: 24, thumb: 20, offset: 2, iconSize: 10, stroke: 2 },
      lg: { width: 56, height: 28, thumb: 24, offset: 2, iconSize: 12, stroke: 2 },
    };
    return sizes[this.getAttribute('size') || 'md'] || sizes.md;
  }

  /** @private */
  _getColor() {
    return this.getAttribute('color') || '#4ADE80';
  }

  /** @private - Convert any CSS color to RGB using computed style */
  _parseHexToRgb(color) {
    if (!color) return { r: 74, g: 222, b: 128 };
    // Try hex first
    if (color.startsWith('#')) {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(color);
      if (result) return { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) };
      // Short hex (#abc)
      const short = /^#?([a-f\d])([a-f\d])([a-f\d])$/i.exec(color);
      if (short) return { r: parseInt(short[1]+short[1], 16), g: parseInt(short[2]+short[2], 16), b: parseInt(short[3]+short[3], 16) };
    }
    // Named colors / rgb() / etc — use computed style
    const temp = document.createElement('div');
    temp.style.color = color;
    document.body.appendChild(temp);
    const computed = getComputedStyle(temp).color;
    document.body.removeChild(temp);
    const m = computed.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
    if (m) return { r: parseInt(m[1]), g: parseInt(m[2]), b: parseInt(m[3]) };
    return { r: 74, g: 222, b: 128 };
  }

  /** @private */
  _buildStyleContent(color) {
    const s = this._getSizeConfig();
    const translateX = s.width - s.thumb - s.offset * 2;
    const rgb = this._parseHexToRgb(color);
    const darker = { r: Math.max(0, rgb.r - 20), g: Math.max(0, rgb.g - 20), b: Math.max(0, rgb.b - 20) };
    const cls = this._uniqueClass;

    return `
      .${cls} .td-toggle-track {
        width: ${s.width}px;
        height: ${s.height}px;
        background: rgba(0, 0, 0, 0.1);
        border-radius: ${s.height / 2}px;
        position: relative;
        transition: background 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94),
                    box-shadow 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
        display: inline-block;
        box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.08);
      }
      .${cls} .td-toggle-track--active {
        background: linear-gradient(180deg, rgba(${rgb.r},${rgb.g},${rgb.b},0.95) 0%, rgba(${darker.r},${darker.g},${darker.b},0.95) 100%);
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.2), 0 2px 8px rgba(${rgb.r},${rgb.g},${rgb.b},0.3);
      }
      .${cls} .td-toggle-thumb {
        width: ${s.thumb}px;
        height: ${s.thumb}px;
        background-color: #fff;
        border-radius: 50%;
        position: absolute;
        top: ${s.offset}px;
        left: ${s.offset}px;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15), 0 1px 2px rgba(0, 0, 0, 0.1);
        transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
      }
      .${cls} .td-toggle-thumb--active {
        transform: translateX(${translateX}px);
      }
      .${cls} .td-toggle-icon {
        width: ${s.iconSize}px;
        height: ${s.iconSize}px;
        transition: opacity 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94);
      }
    `;
  }

  /** @private */
  _injectStyle(color) {
    if (!this._styleEl) {
      this._styleEl = document.createElement('style');
      document.head.appendChild(this._styleEl);
      this._cleanups.push(() => {
        if (this._styleEl && this._styleEl.parentNode) {
          this._styleEl.parentNode.removeChild(this._styleEl);
          this._styleEl = null;
        }
      });
    }
    this._styleEl.textContent = this._buildStyleContent(color);
  }

  /**
   * Change toggle color at runtime without re-rendering.
   * @param {string} newColor - CSS hex color (e.g. '#f59e0b')
   */
  setColor(newColor) {
    this.setAttribute('color', newColor);
  }

  render() {
    const isChecked = this.hasAttribute('checked');
    const isDisabled = this.hasAttribute('disabled');
    const label = this.escapeHtml(this.getAttribute('label') || '');
    const color = this._getColor();
    const s = this._getSizeConfig();

    this._injectStyle(color);

    const crossOpacity = isChecked ? '0' : '1';
    const crossPosition = isChecked ? 'absolute' : 'static';
    const checkOpacity = isChecked ? '1' : '0';
    const checkPosition = isChecked ? 'static' : 'absolute';
    const trackActive = isChecked ? ' td-toggle-track--active' : '';
    const thumbActive = isChecked ? ' td-toggle-thumb--active' : '';
    const disabledClass = isDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer';

    return `
      <div class="flex items-center gap-2" style="line-height:1">
        <label class="${this._uniqueClass} relative inline-flex items-center ${disabledClass}" style="vertical-align:middle">
          <div class="td-toggle-track${trackActive}">
            <div class="td-toggle-thumb${thumbActive}">
              <svg viewBox="0 0 12 12" fill="none" class="td-toggle-icon" style="opacity:${crossOpacity};position:${crossPosition}">
                <path d="M3 3L9 9M9 3L3 9" stroke="#9ca3af" stroke-width="${s.stroke}" stroke-linecap="round"></path>
              </svg>
              <svg viewBox="0 0 12 12" fill="none" class="td-toggle-icon" style="opacity:${checkOpacity};position:${checkPosition}">
                <path d="M2.5 6L5 8.5L9.5 3.5" stroke="${this.escapeHtml(color)}" stroke-width="${s.stroke}" stroke-linecap="round"></path>
              </svg>
            </div>
          </div>
        </label>
        ${label ? `<span class="text-sm font-medium text-gray-700 select-none" style="line-height:${s.height}px">${label}</span>` : ''}
      </div>
    `;
  }

  /**
   * Override attributeChangedCallback to do lightweight DOM updates
   * instead of full re-render for 'checked' and 'color' changes.
   */
  attributeChangedCallback(name, oldVal, newVal) {
    if (oldVal === newVal) return;
    if (!this._initialized) return;

    if (name === 'checked') {
      this._updateToggleState();
      return;
    }

    if (name === 'color') {
      this._injectStyle(newVal || '#4ADE80');
      // Also update check icon stroke color
      const checkIcon = this.querySelector('.td-toggle-icon:last-child path');
      if (checkIcon) checkIcon.setAttribute('stroke', newVal || '#4ADE80');
      return;
    }

    // For other attributes (disabled, label, size), full re-render
    this._doRender();
  }

  /**
   * Lightweight DOM update for toggle state — no re-render, CSS transition plays.
   * @private
   */
  _updateToggleState() {
    const isChecked = this.hasAttribute('checked');
    const track = this.querySelector('.td-toggle-track');
    const thumb = this.querySelector('.td-toggle-thumb');
    const crossIcon = this.querySelector('.td-toggle-icon:first-child');
    const checkIcon = this.querySelector('.td-toggle-icon:last-child');

    if (track) {
      track.classList.toggle('td-toggle-track--active', isChecked);
    }
    if (thumb) {
      thumb.classList.toggle('td-toggle-thumb--active', isChecked);
    }
    if (crossIcon) {
      crossIcon.style.opacity = isChecked ? '0' : '1';
      crossIcon.style.position = isChecked ? 'absolute' : 'static';
    }
    if (checkIcon) {
      checkIcon.style.opacity = isChecked ? '1' : '0';
      checkIcon.style.position = isChecked ? 'static' : 'absolute';
    }
  }

  afterRender() {
    const labelEl = this.querySelector('label');
    if (labelEl) {
      this.listen(labelEl, 'click', (e) => {
        e.preventDefault();
        if (this.hasAttribute('disabled')) return;

        const isChecked = this.hasAttribute('checked');

        // Only emit event — do NOT toggle state here.
        // The consumer is responsible for setting/removing the checked attribute
        // after confirming the action or receiving API success.
        // This prevents the toggle from flipping when the user cancels a confirm
        // dialog or when the API call fails.
        this.emit('change', { checked: !isChecked });
      });
    }
  }
}

if (!customElements.get('td-toggle')) {
  customElements.define('td-toggle', TdToggle);
}
