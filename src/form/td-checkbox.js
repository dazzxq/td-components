import { TdFormElement } from '../base/td-form-element.js';
import { adoptStyles } from '../utils/adopt-styles.js';
import { applyStyles } from '../utils/css-safe.js';

/**
 * Static stylesheet for td-checkbox, adopted ONCE per document via a constructable
 * `CSSStyleSheet` (CSP-strict: no injected `<style>`, no `style="…"`). These rules are
 * SHARED across every instance, so they key off STABLE, element-scoped selectors
 * (`td-checkbox .td-checkmark`, …) — never a per-instance random class.
 *
 * What lives here (and ONLY here):
 *  - the `:checked ~` SIBLING combinators that style the checkmark/icon LIVE off the
 *    native `<input>:checked` state (CSSOM cannot express a selector/combinator), so
 *    toggling needs no re-render;
 *  - the static box/icon/label appearance that does NOT vary per instance.
 *
 * Per-instance DYNAMIC values are NOT here — they are applied via CSSOM in `_applyStyles`:
 *  - the checked color is the custom property `--td-cb-color` (set on the host),
 *    referenced by the `:checked ~ .td-checkmark` rule below;
 *  - the size-driven px scalars (box/icon width-height, label padding/min-height/font-size,
 *    label line-height) are set directly on the target child elements.
 * @private
 */
const TD_CHECKBOX_CSS = `
  td-checkbox .td-checkbox {
    display: inline-flex;
    position: relative;
    cursor: pointer;
    user-select: none;
    align-items: center;
    vertical-align: middle;
  }
  td-checkbox .td-checkbox.td-checkbox--disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
  td-checkbox .td-checkbox-input {
    position: absolute;
    opacity: 0;
    cursor: pointer;
    height: 0;
    width: 0;
  }
  td-checkbox .td-checkmark {
    position: absolute;
    top: 50%;
    left: 0;
    transform: translateY(-50%);
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
  td-checkbox .td-checkbox-input:checked ~ .td-checkmark {
    background-color: var(--td-cb-color, #2196F3);
    border-color: var(--td-cb-color, #2196F3);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.2);
  }
  td-checkbox .td-checkmark-icon {
    opacity: 0;
    transform: scale(0.85);
    transition: opacity 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94),
                transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  td-checkbox .td-checkbox-input:checked ~ .td-checkmark .td-checkmark-icon {
    opacity: 1;
    transform: scale(1);
  }
  td-checkbox .td-checkbox-label {
    margin-left: 8px;
    vertical-align: middle;
    display: inline-flex;
    align-items: center;
    height: 100%;
  }
`;

/**
 * Checkbox component with custom SVG checkmark and color support.
 * Form-associated (ElementInternals): submits its `value` (default "on") only when
 * checked, supports `required` (valueMissing), reset, and `<fieldset disabled>`.
 *
 * CSP-strict: the box/checkmark styling lives in a constructable stylesheet adopted once
 * (the `:checked ~` sibling rules drive the checked look with no re-render), the custom
 * checked color is the host custom property `--td-cb-color`, and the size-driven px
 * scalars are applied per-element via CSSOM in {@link TdCheckbox#_applyStyles}. No injected
 * `<style>` and no declarative `style="…"`.
 *
 * @element td-checkbox
 * @attr {boolean} checked - Whether the checkbox is checked
 * @attr {string} value - Submitted value when checked (default: "on")
 * @attr {string} name - Form field name (submitted via the host)
 * @attr {boolean} required - Must be checked for the form to be valid
 * @attr {boolean} disabled - Disables interaction (also via ancestor <fieldset disabled>)
 * @attr {string} label - Label text displayed next to the checkbox
 * @attr {string} size - Size variant: sm | md | lg (default: md)
 * @attr {string} color - Checked background/border color (default: #2196F3)
 * @fires change - When toggled, detail: { checked: boolean }
 */
export class TdCheckbox extends TdFormElement {
  static get observedAttributes() { return [...super.observedAttributes, 'checked', 'value', 'label', 'size', 'color']; }
  static get booleanAttributes() { return [...super.booleanAttributes, 'checked']; }

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
    return this.safeColor(this.getAttribute('color'), '#2196F3');
  }

  connectedCallback() {
    // Adopt the static stylesheet ONCE (idempotent, lazy — never at module top-level).
    // On unsupported browsers/SSR this is a no-op (returns false) and the component still
    // renders structurally via Tailwind classes + the CSSOM size scalars; only the
    // selector/`:checked`-driven box embellishments are absent (graceful degradation).
    adoptStyles(TD_CHECKBOX_CSS, 'td-checkbox');
    super.connectedCallback();
  }

  render() {
    const isChecked = this.hasAttribute('checked');
    const isDisabled = this._effectiveDisabled;
    const label = this.escapeHtml(this.getAttribute('label') || '');
    const s = this._getSizeConfig();

    return `
      <label class="td-checkbox${isDisabled ? ' td-checkbox--disabled' : ''} relative inline-block select-none cursor-pointer">
        <input type="checkbox" class="td-checkbox-input"
          ${isChecked ? 'checked' : ''}
          ${isDisabled ? 'disabled' : ''}
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

  /**
   * @private CSP-safe per-element SCALAR styling via CSSOM (no `style="…"`). Auto-invoked
   * by the base after `afterRender()` on the initial render AND on every observed-attribute
   * re-render (`checked`/`size`/`color`/`disabled`/`label`), so the custom checked color
   * and the size-driven px stay correct as state changes. Selector/`:checked` rules and the
   * default color live in the adopted sheet; only per-instance scalars are set here.
   */
  _applyStyles() {
    const s = this._getSizeConfig();
    // Custom checked color → host custom property, consumed by the sheet's
    // `:checked ~ .td-checkmark { background/border: var(--td-cb-color) }` rule.
    this.style.setProperty('--td-cb-color', this._getColor());

    // Size-driven px on the label root (drives the absolute checkmark's geometry).
    applyStyles(this.querySelector('.td-checkbox'), {
      'padding-left': (s.box + 10) + 'px',
      'font-size': s.fontSize,
      'min-height': s.minHeight + 'px',
      'padding-top': s.padding,
      'padding-bottom': s.padding,
    });
    // Box size.
    applyStyles(this.querySelector('.td-checkmark'), {
      width: s.box + 'px',
      height: s.box + 'px',
    });
    // Icon size (opacity/scale stay sheet-driven off `:checked`).
    applyStyles(this.querySelector('.td-checkmark-icon'), {
      width: s.icon + 'px',
      height: s.icon + 'px',
    });
    // Label line-height tracks the box height.
    applyStyles(this.querySelector('.td-checkbox-label'), {
      'line-height': s.box + 'px',
    });
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
        this._syncForm();
        this.emit('change', { checked });
      });
    }
    this._syncForm();
  }

  /** @private Push the checkbox state into form submission + constraint validation. */
  _syncForm() {
    const checked = this.hasAttribute('checked');
    const value = this.getAttribute('value') ?? 'on';
    this._setFormValue(checked ? value : null);
    if (this.hasAttribute('required') && !checked) {
      this._setValidity({ valueMissing: true }, 'Please check this box.', this._focusTarget());
    } else {
      this._setValidity({});
    }
  }

  _captureDefaults() {
    super._captureDefaults();
    // Presence-aware: null = no `value` attr (submits "on"); a string = explicit value (ISSUE-2).
    this._defaultValueAttr = this.getAttribute('value');
  }

  _restoreDefaults() {
    if (this._defaultChecked) this.setAttribute('checked', '');
    else this.removeAttribute('checked');
    if (this._defaultValueAttr === null) this.removeAttribute('value');
    else this.setAttribute('value', this._defaultValueAttr);
    this._syncForm();
  }

  _focusTarget() {
    return this.querySelector('.td-checkbox-input');
  }
}

if (!customElements.get('td-checkbox')) {
  customElements.define('td-checkbox', TdCheckbox);
}
