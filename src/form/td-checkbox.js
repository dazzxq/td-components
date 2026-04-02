import { TdBaseElement } from '../base/td-base-element.js';

/**
 * Checkbox component with custom SVG checkmark and color support.
 *
 * @element td-checkbox
 * @attr {boolean} checked - Whether the checkbox is checked
 * @attr {string} label - Label text displayed next to the checkbox
 * @attr {string} size - Size variant: sm | md | lg (default: md)
 * @attr {string} color - Checked background/border color (default: #2196F3)
 * @fires change - When toggled, detail: { checked: boolean }
 */
export class TdCheckbox extends TdBaseElement {
  static get observedAttributes() { return ['checked', 'label', 'size', 'color']; }
  static get booleanAttributes() { return ['checked']; }

  constructor() {
    super();
    this._uniqueClass = 'td-checkbox-' + Math.random().toString(36).slice(2, 8);
    this._styleEl = null;
  }

  /** @private */
  _getSizeConfig() {
    const sizes = {
      sm: { box: 20, icon: 14, strokeWidth: 2.5, fontSize: '14px', minHeight: 32, padding: '6px' },
      md: { box: 25, icon: 16, strokeWidth: 2.5, fontSize: '16px', minHeight: 36, padding: '7px' },
      lg: { box: 28, icon: 20, strokeWidth: 3, fontSize: '18px', minHeight: 40, padding: '8px' },
    };
    return sizes[this.getAttribute('size') || 'md'] || sizes.md;
  }

  /** @private */
  _getColor() {
    return this.getAttribute('color') || '#2196F3';
  }

  /** @private */
  _buildStyleContent() {
    const s = this._getSizeConfig();
    const color = this._getColor();
    const isChecked = this.hasAttribute('checked');
    const cls = this._uniqueClass;

    return `
      .${cls} {
        display: inline-flex;
        position: relative;
        padding-left: ${s.box + 10}px;
        cursor: pointer;
        font-size: ${s.fontSize};
        user-select: none;
        align-items: center;
        vertical-align: middle;
        min-height: ${s.minHeight}px;
        padding-top: ${s.padding};
        padding-bottom: ${s.padding};
      }
      .${cls} .td-checkbox-input {
        position: absolute;
        opacity: 0;
        cursor: pointer;
        height: 0;
        width: 0;
      }
      .${cls} .td-checkmark {
        position: absolute;
        top: 50%;
        left: 0;
        transform: translateY(-50%);
        height: ${s.box}px;
        width: ${s.box}px;
        background-color: rgba(0, 0, 0, 0.04);
        border: 1.5px solid rgba(0, 0, 0, 0.12);
        border-radius: 6px;
        transition: background-color 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94),
                    border-color 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94),
                    box-shadow 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94);
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .${cls} .td-checkbox-input:checked ~ .td-checkmark {
        background-color: ${color};
        border-color: ${color};
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.2);
      }
      .${cls} .td-checkmark-icon {
        width: ${s.icon}px;
        height: ${s.icon}px;
        opacity: ${isChecked ? 1 : 0};
        transform: scale(${isChecked ? 1 : 0.85});
        transition: opacity 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94),
                    transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
      }
      .${cls} .td-checkbox-input:checked ~ .td-checkmark .td-checkmark-icon {
        opacity: 1;
        transform: scale(1);
      }
      .${cls} .td-checkbox-label {
        margin-left: 8px;
        vertical-align: middle;
        line-height: ${s.box}px;
        display: inline-flex;
        align-items: center;
        height: 100%;
      }
    `;
  }

  /** @private */
  _injectStyle() {
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
    this._styleEl.textContent = this._buildStyleContent();
  }

  render() {
    const isChecked = this.hasAttribute('checked');
    const label = this.escapeHtml(this.getAttribute('label') || '');
    const s = this._getSizeConfig();

    this._injectStyle();

    return `
      <label class="${this._uniqueClass} relative inline-block select-none cursor-pointer">
        <input type="checkbox" class="td-checkbox-input"
          ${isChecked ? 'checked' : ''}
          aria-checked="${isChecked}"
        />
        <span class="td-checkmark">
          <svg viewBox="0 0 24 24" class="td-checkmark-icon" fill="none">
            <path d="M5 13l4 4L19 7" stroke="#fff" stroke-linecap="round" stroke-linejoin="round" stroke-width="${s.strokeWidth}"></path>
          </svg>
        </span>
        ${label ? `<span class="td-checkbox-label">${label}</span>` : ''}
      </label>
    `;
  }

  afterRender() {
    const input = this.querySelector('.td-checkbox-input');
    if (input) {
      this.listen(input, 'change', () => {
        const checked = input.checked;
        if (checked) {
          this.setAttribute('checked', '');
        } else {
          this.removeAttribute('checked');
        }
        input.setAttribute('aria-checked', String(checked));
        this.emit('change', { checked });
      });
    }
  }
}

if (!customElements.get('td-checkbox')) {
  customElements.define('td-checkbox', TdCheckbox);
}
