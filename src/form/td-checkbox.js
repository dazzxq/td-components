import { TdFormElement } from '../base/td-form-element.js';
import { adoptStyles } from '../utils/adopt-styles.js';
import { applyStyles } from '../utils/css-safe.js';

/**
 * Static stylesheet for td-checkbox, adopted ONCE per document via a constructable
 * `CSSStyleSheet` (CSP-strict: no injected `<style>`, no `style="…"`). These rules are
 * SHARED across every instance, so they key off STABLE, element-scoped selectors
 * (`td-checkbox .td-checkmark`, …) — never a per-instance random class.
 *
 * IMPORTANT (codex ISSUE-1): this sheet is a pure, NON-LOAD-BEARING ENHANCEMENT. It must
 * contain ONLY embellishments that are acceptable to lose on an ancient browser without
 * `adoptedStyleSheets` support (where {@link adoptStyles} returns `false`):
 *  - the `transition` declarations (so checked/unchecked changes ANIMATE on capable
 *    browsers — losing the animation is fine, the end state still applies via CSSOM);
 *  - REDUNDANT `:checked ~` sibling rules that re-state the checked target values. They
 *    are the transition targets; they are NOT the only source of the checked look — the
 *    authoritative checked color/box-shadow/icon visibility is set inline via CSSOM in
 *    {@link TdCheckbox#_applyStyles} (inline wins over the sheet), so the checked SIGNAL
 *    survives even with the sheet absent.
 *
 * EVERYTHING structural or state-conveying lives in CSSOM (`_applyStyles`), not here:
 *  - native input hiding (position/opacity/size 0);
 *  - checkmark/icon/label LAYOUT (position, display, top/left/transform, align/justify,
 *    border, radius, size px);
 *  - the CHECKED-STATE appearance (checkmark bg/border = `var(--td-cb-color)` value,
 *    box-shadow, and icon opacity/scale) — set from `this.hasAttribute('checked')`.
 * That makes the component fully usable on every browser; the sheet only smooths/animates.
 * @private
 */
const TD_CHECKBOX_CSS = `
  td-checkbox .td-checkmark {
    transition: background-color 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94),
                border-color 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94),
                box-shadow 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  }
  td-checkbox .td-checkbox-input:checked ~ .td-checkmark {
    background-color: var(--td-cb-color, #2196F3);
    border-color: var(--td-cb-color, #2196F3);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.2);
  }
  td-checkbox .td-checkmark-icon {
    transition: opacity 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94),
                transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  td-checkbox .td-checkbox-input:checked ~ .td-checkmark .td-checkmark-icon {
    opacity: 1;
    transform: scale(1);
  }
`;

/**
 * Checkbox component with custom SVG checkmark and color support.
 * Form-associated (ElementInternals): submits its `value` (default "on") only when
 * checked, supports `required` (valueMissing), reset, and `<fieldset disabled>`.
 *
 * CSP-strict: ALL structure (input hiding, checkmark/icon/label layout) and the checked
 * STATE (checkmark color/box-shadow, icon opacity/scale) are applied per-element via CSSOM
 * in {@link TdCheckbox#_applyStyles} — so the component is fully usable even without
 * `adoptedStyleSheets` (codex ISSUE-1). A constructable stylesheet adopted once adds ONLY
 * `transition` smoothing (a redundant `:checked ~` rule is overridden by the inline CSSOM).
 * No injected `<style>` and no declarative `style="…"`.
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
    // Adopt the enhancement stylesheet ONCE (idempotent, lazy — never at module top-level).
    // On unsupported browsers/SSR this is a no-op (returns false) and the component is STILL
    // fully usable: ALL structure (input hiding, checkmark/icon/label layout) AND the checked
    // STATE (checkmark color/box-shadow, icon opacity/scale) apply via CSSOM in `_applyStyles`.
    // Only the `transition` smoothing in the sheet is lost — the change snaps instead of
    // animating (codex ISSUE-1: the sheet is enhancement, not load-bearing).
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
   * @private CSP-safe per-element styling via CSSOM (no `style="…"`). Auto-invoked by the
   * base after `afterRender()` on the initial render AND on every observed-attribute
   * re-render (`checked`/`size`/`color`/`disabled`/`label`), so ALL structure and the
   * checked state stay correct as state changes.
   *
   * codex ISSUE-1: this is the AUTHORITATIVE source for everything load-bearing — it works
   * on EVERY browser, even without `adoptedStyleSheets`. It sets:
   *  - native input hiding (position/opacity/size 0);
   *  - checkmark/icon/label LAYOUT (position, display, top/left/transform, border, radius,
   *    align/justify, size px);
   *  - the CHECKED-STATE appearance from `this.hasAttribute('checked')`: the checkmark
   *    bg/border (the `safeColor`-sanitised value), box-shadow, and the icon opacity/scale.
   * The adopted sheet only adds `transition` smoothing (and a REDUNDANT `:checked ~` rule
   * the inline CSSOM overrides). Loss of the sheet costs only the animation, never the look.
   */
  _applyStyles() {
    const s = this._getSizeConfig();
    const color = this._getColor(); // safeColor-sanitised (XSS-safe)
    const isChecked = this.hasAttribute('checked');
    const isDisabled = this._effectiveDisabled;

    // Custom checked color → host custom property. This is the value consumed by the sheet's
    // REDUNDANT `:checked ~ .td-checkmark { background: var(--td-cb-color) }` rule; the inline
    // `.td-checkmark` background below is the AUTHORITATIVE source (wins over the sheet, and
    // works with the sheet absent). Setting the var via CSSOM also keeps the XSS-containment
    // contract (a payload color is dropped to the fallback before it ever reaches CSS).
    this.style.setProperty('--td-cb-color', color);

    // --- Root label: layout + size-driven px (drives the absolute checkmark's geometry). ---
    applyStyles(this.querySelector('.td-checkbox'), {
      position: 'relative',
      display: 'inline-flex',
      'align-items': 'center',
      'vertical-align': 'middle',
      'user-select': 'none',
      cursor: isDisabled ? 'not-allowed' : 'pointer',
      opacity: isDisabled ? '0.5' : '1',
      'padding-left': (s.box + 10) + 'px',
      'font-size': s.fontSize,
      'min-height': s.minHeight + 'px',
      'padding-top': s.padding,
      'padding-bottom': s.padding,
    });

    // --- Native input: visually hidden, but stays in the accessibility/focus tree. ---
    applyStyles(this.querySelector('.td-checkbox-input'), {
      position: 'absolute',
      opacity: '0',
      cursor: 'pointer',
      height: '0',
      width: '0',
    });

    // --- Checkmark box: LAYOUT (always) + STATE appearance (checked vs unchecked). ---
    applyStyles(this.querySelector('.td-checkmark'), {
      position: 'absolute',
      top: '50%',
      left: '0',
      transform: 'translateY(-50%)',
      display: 'flex',
      'align-items': 'center',
      'justify-content': 'center',
      'border-style': 'solid',
      'border-width': '1.5px',
      'border-radius': '6px',
      width: s.box + 'px',
      height: s.box + 'px',
      // CHECKED STATE — authoritative here (inline beats the sheet's redundant :checked rule).
      'background-color': isChecked ? color : 'rgba(0, 0, 0, 0.04)',
      'border-color': isChecked ? color : 'rgba(0, 0, 0, 0.12)',
      'box-shadow': isChecked ? 'inset 0 1px 0 rgba(255, 255, 255, 0.2)' : 'none',
    });

    // --- Icon: size + CHECKED-STATE visibility (opacity/scale) set here, not sheet-only. ---
    applyStyles(this.querySelector('.td-checkmark-icon'), {
      width: s.icon + 'px',
      height: s.icon + 'px',
      opacity: isChecked ? '1' : '0',
      transform: isChecked ? 'scale(1)' : 'scale(0.85)',
    });

    // --- Label: layout + line-height tracks the box height. ---
    applyStyles(this.querySelector('.td-checkbox-label'), {
      'margin-left': '8px',
      'vertical-align': 'middle',
      display: 'inline-flex',
      'align-items': 'center',
      height: '100%',
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
