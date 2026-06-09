import { TdFormElement } from '../base/td-form-element.js';
import { applyStyles } from '../utils/css-safe.js';

/**
 * Multi-type input field component with validation, counter, and label support.
 * Ported from DCMS InputField — supports text/password/email/tel/number/url/search/textarea/contenteditable.
 *
 * **Form-associated (ElementInternals, 0.2.0):** the HOST submits its value in any
 * `<form>` (FormData/POST) and owns ALL constraint validation. The inner native
 * control carries NO `name` and NO native constraints — for `email`/`url`/`number`
 * it is rendered as `type="text"` (+ `inputmode`) so it can never independently
 * block the host form; the host recomputes `typeMismatch`/`rangeUnderflow`/
 * `rangeOverflow`/`stepMismatch`/`tooLong`/`valueMissing` off a detached probe input
 * and pushes them via {@link TdFormElement#_setValidity}. `password` keeps its real
 * type (masking) — it has no value-dependent native constraint once `required` is
 * removed from the inner control.
 *
 * **0.2.0 BREAKING:** the inner `<input>`/`<textarea>` no longer carries a `name`
 * attribute (submission goes through the host); use the host's `name` instead.
 *
 * @element td-input-field
 * @attr {string} type - Input type: text|password|email|tel|number|url|search|textarea|contenteditable (default: text)
 * @attr {string} size - Size variant: sm|md|lg (default: md)
 * @attr {string} value - Current value
 * @attr {string} placeholder - Placeholder text
 * @attr {boolean} disabled - Disables the input (also via ancestor <fieldset disabled>)
 * @attr {boolean} readonly - Makes input read-only
 * @attr {boolean} required - Marks field as required (shows asterisk on label)
 * @attr {number} max-length - Character/word limit
 * @attr {string} limit-type - Limit type: char|word (default: char)
 * @attr {string} min - Minimum (number type)
 * @attr {string} max - Maximum (number type)
 * @attr {string} step - Step (number type)
 * @attr {string} label - Label text
 * @attr {string} helper-text - Helper text below input
 * @attr {string} error-text - Error text below input (red)
 * @attr {string} field-id - id attribute forwarded to the inner input (for the internal label[for])
 * @attr {string} name - Form field name (submitted via the host)
 * @attr {number} rows - Number of rows for textarea (default 4)
 * @attr {string} validate-on - Auto-show the inline error: blur|input|change
 * @fires input - When input value changes
 * @fires change - When input loses focus (blur)
 */
export class TdInputField extends TdFormElement {
  static get observedAttributes() {
    return [
      ...super.observedAttributes,
      'type', 'size', 'value', 'placeholder', 'readonly',
      'max-length', 'limit-type', 'min', 'max', 'step',
      'label', 'helper-text', 'error-text',
      'field-id', 'rows', 'validate-on',
    ];
  }

  static get booleanAttributes() {
    return [...super.booleanAttributes, 'readonly'];
  }

  /** @private value-dependent native constraints live on these types → neutralize the inner control. */
  static _neutralizeTypes = ['email', 'url', 'number'];

  /** @private inputmode hints kept when the real type is downgraded to text. */
  static _inputModeMap = { email: 'email', url: 'url', number: 'decimal', tel: 'tel', search: 'search' };

  /** @private */
  static _sizeMap = {
    sm: { h: 32, px: '12px', py: '6px', text: 'text-sm', radius: '10px' },
    md: { h: 40, px: '14px', py: '8px', text: 'text-sm', radius: '12px' },
    lg: { h: 48, px: '16px', py: '10px', text: 'text-base', radius: '14px' },
  };

  /** @private */
  static _colors = {
    border: 'rgba(0, 0, 0, 0.1)',
    borderError: '#ef4444',
    bgNormal: 'rgba(255, 255, 255, 0.72)',
    bgDisabled: 'rgba(249, 250, 251, 0.8)',
    textNormal: '#111827',
    textPlaceholder: '#9ca3af',
    textError: '#ef4444',
    textMuted: '#6b7280',
    focusRing: 'rgba(59, 130, 246, 0.2)',
    focusBorder: 'rgba(59, 130, 246, 0.5)',
  };

  /** @private Resolve the inner control's render type (neutralized) from the public `type`. */
  _resolveInputType(rawType) {
    if (rawType === 'textarea' || rawType === 'contenteditable') return rawType;
    if (TdInputField._neutralizeTypes.includes(rawType)) return 'text';
    return ['text', 'password', 'tel', 'search'].includes(rawType) ? rawType : 'text';
  }

  render() {
    const type = this.getAttribute('type') || 'text';
    const size = this.getAttribute('size') || 'md';
    const value = this.getAttribute('value') || '';
    const placeholder = this.getAttribute('placeholder') || '';
    const isDisabled = this._effectiveDisabled;
    const isReadonly = this.hasAttribute('readonly');
    const isRequired = this.hasAttribute('required');
    // Coerce once to a positive-integer string ('' if absent/invalid) — never interpolate
    // the raw attribute into `maxlength=""` / `data-max-length=""` / counter text.
    const maxLenNum = Number.parseInt(this.getAttribute('max-length'), 10);
    const maxLength = Number.isFinite(maxLenNum) && maxLenNum > 0 ? String(maxLenNum) : '';
    const limitType = this.getAttribute('limit-type') || 'char';
    const label = this.getAttribute('label') || '';
    const helperText = this.getAttribute('helper-text') || '';
    const errorText = this.getAttribute('error-text') || '';
    const fieldId = this.getAttribute('field-id') || '';
    const rows = parseInt(this.getAttribute('rows') || '4', 10);

    const s = TdInputField._sizeMap[size] || TdInputField._sizeMap.md;

    let labelHtml = '';
    if (label) {
      const asterisk = isRequired ? ` <span class="text-red-500">*</span>` : '';
      const forAttr = fieldId ? ` for="${this.escapeHtml(fieldId)}"` : '';
      labelHtml = `<label class="td-input-label block mb-1 font-medium text-gray-700"${forAttr}>${this.escapeHtml(label)}${asterisk}</label>`;
    }

    let fieldHtml = '';
    const escapedValue = this.escapeHtml(value);
    const escapedPlaceholder = this.escapeHtml(placeholder);
    const idAttr = fieldId ? ` id="${this.escapeHtml(fieldId)}"` : '';
    // NOTE: no `name`, no `required` on the inner control — the host owns submission + validity.

    if (type === 'textarea') {
      const maxLenAttr = maxLength && limitType === 'char' ? ` maxlength="${maxLength}"` : '';
      // Scalar styles (commonStyle + height + resize) applied via CSSOM in _applyStyles().
      fieldHtml = `<textarea
        class="td-input td-input-textarea block ${s.text}"
        placeholder="${escapedPlaceholder}"
        rows="${rows}"
        ${isDisabled ? 'disabled' : ''}
        ${isReadonly ? 'readonly' : ''}
        ${maxLenAttr}
        ${idAttr}
      >${escapedValue}</textarea>`;
    } else if (type === 'contenteditable') {
      // Scalar styles (commonStyle + height + overflow-y) applied via CSSOM in _applyStyles().
      fieldHtml = `<div
        class="td-input td-input-editable block ${s.text}"
        contenteditable="${isDisabled || isReadonly ? 'false' : 'true'}"
        role="textbox"
        aria-multiline="false"
        data-placeholder="${escapedPlaceholder}"
        ${maxLength ? `data-max-length="${maxLength}"` : ''}
        ${idAttr}
      >${value ? this.escapeHtml(value) : ''}</div>`;
    } else {
      const inputType = this._resolveInputType(type);
      const inputMode = TdInputField._inputModeMap[type];
      const inputModeAttr = inputType === 'text' && inputMode ? ` inputmode="${inputMode}"` : '';
      const maxLenAttr = maxLength && limitType === 'char' ? ` maxlength="${maxLength}"` : '';
      // Scalar styles (commonStyle + height) applied via CSSOM in _applyStyles().
      fieldHtml = `<input
        type="${inputType}"
        class="td-input td-input-${inputType} block ${s.text}"
        value="${escapedValue}"
        placeholder="${escapedPlaceholder}"
        ${isDisabled ? 'disabled' : ''}
        ${isReadonly ? 'readonly' : ''}
        ${maxLenAttr}${inputModeAttr}
        ${idAttr}
      />`;
    }

    // Counter (scalar styles applied via CSSOM in _applyStyles()).
    let counterHtml = '';
    if (maxLength) {
      const currentCount = this._countValue(value, limitType);
      const unit = limitType === 'word' ? 'từ' : 'ký tự';
      counterHtml = `<div class="td-input-counter text-xs mt-1 text-right">${currentCount}/${maxLength} ${unit}</div>`;
    }

    // Note (error or helper; scalar styles applied via CSSOM in _applyStyles()).
    let noteHtml = '';
    if (errorText || helperText) {
      const noteText = errorText || helperText;
      noteHtml = `<div class="td-input-note mt-1">${this.escapeHtml(noteText)}</div>`;
    }

    return `
      <div class="td-input-field w-full">
        ${labelHtml}
        <div class="td-input-wrapper">${fieldHtml}</div>
        ${counterHtml}
        ${noteHtml}
      </div>
    `;
  }

  /**
   * @private CSP-safe per-element SCALAR styling (replaces the removed declarative
   * `style="…"` attributes). Auto-invoked by the base after `afterRender()` on the
   * initial render AND every observed-attribute re-render. For internal-state changes
   * (focus/blur/counter) the relevant handlers re-apply scalars directly via CSSOM.
   *
   * No SELECTOR/pseudo rule is needed: `:focus` styling is driven imperatively by the
   * focus/blur listeners in `afterRender()` (CSSOM — CSP-allowed), exactly as before.
   */
  _applyStyles() {
    const type = this.getAttribute('type') || 'text';
    const size = this.getAttribute('size') || 'md';
    const s = TdInputField._sizeMap[size] || TdInputField._sizeMap.md;
    const colors = TdInputField._colors;

    const isDisabled = this._effectiveDisabled;
    const hasError = !!this.getAttribute('error-text');
    const borderColor = hasError ? colors.borderError : colors.border;
    const bg = isDisabled ? colors.bgDisabled : colors.bgNormal;

    // --- Field control (input / textarea / contenteditable) ---
    const field = this._getFieldElement();
    if (field) {
      const height = type === 'textarea'
        ? `${(s.h * parseInt(this.getAttribute('rows') || '4', 10)) / 2 + 8}px`
        : `${s.h}px`;
      // `_applyStyles()` runs AFTER `afterRender()` (per the base render order), so it
      // must not clobber the muted placeholder color that `afterRender()` set on an empty
      // contenteditable field — preserve `textPlaceholder` while the `.td-placeholder`
      // class is present (otherwise use the normal text color).
      const isCePlaceholder = type === 'contenteditable' && field.classList.contains('td-placeholder');
      applyStyles(field, {
        width: '100%',
        'border-width': '1px',
        'border-style': 'solid',
        'border-color': borderColor,
        'border-radius': s.radius,
        padding: `${s.py} ${s.px}`,
        outline: 'none',
        transition: 'box-shadow .2s cubic-bezier(0.25,0.46,0.45,0.94),' +
          ' border-color .2s cubic-bezier(0.25,0.46,0.45,0.94),' +
          ' background-color .2s cubic-bezier(0.25,0.46,0.45,0.94)',
        'background-color': bg,
        color: isCePlaceholder ? colors.textPlaceholder : colors.textNormal,
        'box-shadow': 'inset 0 1px 0 rgba(255,255,255,0.9)',
        height,
        // type-specific scalars (only set the relevant one; others left at UA default)
        resize: type === 'textarea' ? 'vertical' : null,
        'overflow-y': type === 'contenteditable' ? 'auto' : null,
      });
    }

    // --- Counter ---
    const counter = this.querySelector('.td-input-counter');
    if (counter) {
      const maxLength = parseInt(this.getAttribute('max-length'), 10);
      const limitType = this.getAttribute('limit-type') || 'char';
      const currentCount = this._countValue(this.getAttribute('value') || '', limitType);
      const full = Number.isFinite(maxLength) && currentCount >= maxLength;
      applyStyles(counter, {
        'font-size': '12px',
        'margin-top': '4px',
        'text-align': 'right',
        color: full ? colors.textError : colors.textMuted,
      });
    }

    // --- Note (error or helper) ---
    const note = this.querySelector('.td-input-note');
    if (note) {
      const hasErrorText = !!this.getAttribute('error-text');
      applyStyles(note, {
        color: hasErrorText ? colors.textError : colors.textMuted,
        'font-size': '12px',
      });
    }
  }

  afterRender() {
    const field = this._getFieldElement();
    if (!field) return;

    const type = this.getAttribute('type') || 'text';
    const colors = TdInputField._colors;
    const validateOn = this.getAttribute('validate-on') || '';

    // Focus/blur styles
    this.listen(field, 'focus', () => {
      field.style.boxShadow = '0 0 0 3px rgba(59,130,246,.2), inset 0 1px 0 rgba(255,255,255,0.9)';
      field.style.borderColor = 'rgba(59, 130, 246, 0.5)';
      field.style.backgroundColor = 'rgba(255, 255, 255, 0.85)';
      // contenteditable placeholder
      if (type === 'contenteditable' && field.classList.contains('td-placeholder')) {
        field.innerText = '';
        field.style.color = colors.textNormal;
        field.classList.remove('td-placeholder');
      }
    });

    this.listen(field, 'blur', () => {
      const hasError = this.hasAttribute('error-text') && this.getAttribute('error-text');
      field.style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,0.9)';
      field.style.borderColor = hasError ? colors.borderError : colors.border;
      field.style.backgroundColor = colors.bgNormal;
      // contenteditable placeholder restore
      if (type === 'contenteditable' && !field.innerText.trim()) {
        field.classList.add('td-placeholder');
        field.innerText = field.dataset.placeholder || '';
        field.style.color = colors.textPlaceholder;
      }
      this._syncForm();
      if (validateOn === 'blur' || validateOn === 'change') this._showInlineValidity();
      // Emit change event on blur
      this.emit('change', { value: this.getValue() });
    });

    // Input event + counter update
    this.listen(field, 'input', () => {
      this._updateCounter();
      this._handleWordLimit();
      this._syncForm();
      if (validateOn === 'input') this._showInlineValidity();
      this.emit('input', { value: this.getValue() });
    });

    // contenteditable placeholder init
    if (type === 'contenteditable' && !field.innerText.trim()) {
      field.classList.add('td-placeholder');
      field.innerText = field.dataset.placeholder || '';
      field.style.color = colors.textPlaceholder;
    }

    // Expose public API methods on the element (NOTE: checkValidity/focus are NOT
    // re-bound — the form-associated base owns them so form.requestSubmit() works).
    this.getValue = this._getValue.bind(this);
    this.setValue = this._setValue.bind(this);
    this.setError = this._setError.bind(this);
    this.setHelper = this._setHelper.bind(this);
    this.setDisabled = this._setDisabled.bind(this);
    this.setReadOnly = this._setReadOnly.bind(this);

    // Initial form value + validity so an untouched required field already blocks submit.
    this._syncForm();
  }

  // --- Form participation ---

  /** @private Push the current value + recomputed constraint validity to the form. */
  _syncForm() {
    this._setFormValue(this._getValue());
    const { flags, message } = this._computeValidity();
    this._setValidity(flags, message, this._focusTarget());
  }

  /**
   * @private Recompute native-style constraint validity off the COMPONENT value,
   * using a detached probe input for type/range/step (the inner control is neutralized).
   * @returns {{flags: ValidityStateFlags, message: string}}
   */
  _computeValidity() {
    const type = this.getAttribute('type') || 'text';
    const value = this._getValue();
    const required = this.hasAttribute('required');
    const maxLength = parseInt(this.getAttribute('max-length'), 10);
    const limitType = this.getAttribute('limit-type') || 'char';
    const isEmpty = value == null || String(value).trim() === '';

    if (required && isEmpty) {
      return { flags: { valueMissing: true }, message: 'Trường này là bắt buộc' };
    }

    if (maxLength && maxLength > 0 && value) {
      const count = this._countValue(value, limitType);
      if (count > maxLength) {
        const unit = limitType === 'word' ? 'từ' : 'ký tự';
        return { flags: { tooLong: true }, message: `Vượt quá giới hạn ${maxLength} ${unit}` };
      }
    }

    if (!isEmpty && TdInputField._neutralizeTypes.includes(type)) {
      // `number` must be syntax-checked BEFORE the probe: assigning an invalid number
      // string to a native `<input type="number">` sanitizes `.value` to "" (which then
      // reads as valid), so "abc" would slip through. Validate the HTML floating-point
      // grammar explicitly, then use the probe only for range/step.
      if (type === 'number') {
        const trimmed = String(value).trim();
        if (!/^-?(\d+(\.\d*)?|\.\d+)([eE][-+]?\d+)?$/.test(trimmed)) {
          return { flags: { badInput: true }, message: 'Giá trị không hợp lệ' };
        }
      }
      const probe = document.createElement('input');
      probe.type = type;
      if (type === 'number') {
        for (const a of ['min', 'max', 'step']) {
          const v = this.getAttribute(a);
          if (v != null) probe.setAttribute(a, v);
        }
      }
      probe.value = String(value);
      const v = probe.validity;
      if (v.badInput || v.typeMismatch) {
        const msg = type === 'number' ? 'Giá trị không hợp lệ'
          : type === 'email' ? 'Email không hợp lệ' : 'URL không hợp lệ';
        return { flags: { typeMismatch: true }, message: msg };
      }
      if (v.rangeUnderflow) return { flags: { rangeUnderflow: true }, message: `Giá trị tối thiểu là ${this.getAttribute('min')}` };
      if (v.rangeOverflow) return { flags: { rangeOverflow: true }, message: `Giá trị tối đa là ${this.getAttribute('max')}` };
      if (v.stepMismatch) return { flags: { stepMismatch: true }, message: 'Giá trị không đúng bước nhảy' };
    }

    return { flags: {}, message: '' };
  }

  /** @private Mirror the current constraint message into the inline note (validate-on UX). */
  _showInlineValidity() {
    const { message } = this._computeValidity();
    this._setError(message || '');
  }

  // --- Default capture + reset (presence-aware) ---

  _captureDefaults() {
    super._captureDefaults();
    /** @private null = no initial `value` attr; a string = explicit initial value. */
    this._defaultValueAttr = this.getAttribute('value');
  }

  _restoreDefaults() {
    if (this._defaultValueAttr === null) this.removeAttribute('value');
    else this.setAttribute('value', this._defaultValueAttr);
    // The `value` attribute change re-renders; force the field text too in case the
    // attribute value is unchanged (no attributeChangedCallback fires).
    this._setValue(this._defaultValueAttr ?? '');
    this._syncForm();
  }

  _restoreState(state, _mode) {
    if (typeof state === 'string') {
      this._setValue(state);
      this._syncForm();
    }
  }

  _focusTarget() {
    return this.querySelector('.td-input');
  }

  // --- Private helpers ---

  /** @private Get the actual input/textarea/div field element */
  _getFieldElement() {
    return this.querySelector('.td-input');
  }

  /** @private Count value by char or word */
  _countValue(text, limitType) {
    if (!text) return 0;
    if (limitType === 'word') {
      return text.trim().split(/\s+/).filter(w => w.length > 0).length;
    }
    return text.length;
  }

  /** @private Update the counter display */
  _updateCounter() {
    const counter = this.querySelector('.td-input-counter');
    if (!counter) return;
    const maxLength = parseInt(this.getAttribute('max-length'), 10);
    const limitType = this.getAttribute('limit-type') || 'char';
    const currentCount = this._countValue(this.getValue(), limitType);
    const unit = limitType === 'word' ? 'từ' : 'ký tự';
    const colors = TdInputField._colors;
    counter.textContent = `${currentCount}/${maxLength} ${unit}`;
    counter.style.color = currentCount >= maxLength ? colors.textError : colors.textMuted;

    const field = this._getFieldElement();
    if (field) {
      field.style.borderColor = currentCount >= maxLength ? colors.borderError : colors.border;
    }
  }

  /** @private Handle word limit truncation with cursor restore */
  _handleWordLimit() {
    const maxLength = parseInt(this.getAttribute('max-length'), 10);
    if (!maxLength || maxLength <= 0) return;
    const limitType = this.getAttribute('limit-type') || 'char';
    if (limitType !== 'word') return;

    const type = this.getAttribute('type') || 'text';
    const field = this._getFieldElement();
    if (!field) return;

    if (type === 'contenteditable') {
      const text = field.innerText || '';
      const words = text.trim().split(/\s+/).filter(w => w.length > 0);
      if (words.length > maxLength) {
        const truncated = words.slice(0, maxLength).join(' ');
        field.innerText = truncated;
        // Move cursor to end
        const range = document.createRange();
        const sel = window.getSelection();
        range.selectNodeContents(field);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    } else {
      const text = field.value || '';
      const words = text.trim().split(/\s+/).filter(w => w.length > 0);
      if (words.length > maxLength) {
        const truncated = words.slice(0, maxLength).join(' ');
        const cursorPos = field.selectionStart;
        field.value = truncated;
        const newPos = Math.min(cursorPos - 1, truncated.length);
        field.setSelectionRange(newPos, newPos);
      }
    }
  }

  // --- Public API ---

  /** @private Get current value */
  _getValue() {
    const type = this.getAttribute('type') || 'text';
    const field = this._getFieldElement();
    if (!field) return '';
    if (type === 'contenteditable') {
      return field.classList.contains('td-placeholder') ? '' : field.innerText;
    }
    return field.value;
  }

  /** @private Set value */
  _setValue(val) {
    const type = this.getAttribute('type') || 'text';
    const field = this._getFieldElement();
    if (!field) return;

    const maxLength = parseInt(this.getAttribute('max-length'), 10);
    const limitType = this.getAttribute('limit-type') || 'char';
    if (maxLength && maxLength > 0 && val) {
      val = this._truncateToLimit(String(val), maxLength, limitType);
    }

    if (type === 'contenteditable') {
      field.classList.remove('td-placeholder');
      field.style.color = TdInputField._colors.textNormal;
      field.innerText = val ?? '';
    } else {
      field.value = val ?? '';
    }
    this._updateCounter();
    this._syncForm();
  }

  /** @private Truncate text to limit */
  _truncateToLimit(text, maxLength, limitType) {
    if (!maxLength || maxLength <= 0) return text;
    if (limitType === 'word') {
      const words = text.trim().split(/\s+/).filter(w => w.length > 0);
      if (words.length <= maxLength) return text;
      return words.slice(0, maxLength).join(' ');
    }
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength);
  }

  /** @private Set error text and red border (visual only; use setCustomValidity for constraint state) */
  _setError(msg) {
    const field = this._getFieldElement();
    const colors = TdInputField._colors;
    if (field) {
      field.style.borderColor = msg ? colors.borderError : colors.border;
    }
    let note = this.querySelector('.td-input-note');
    if (!note) {
      note = document.createElement('div');
      note.className = 'td-input-note mt-1';
      note.style.fontSize = '12px';
      this.querySelector('.td-input-field')?.appendChild(note);
    }
    note.style.color = msg ? colors.textError : colors.textMuted;
    note.textContent = msg || '';
  }

  /** @private Set helper text */
  _setHelper(msg) {
    let note = this.querySelector('.td-input-note');
    if (!note) {
      note = document.createElement('div');
      note.className = 'td-input-note mt-1';
      note.style.fontSize = '12px';
      this.querySelector('.td-input-field')?.appendChild(note);
    }
    note.style.color = TdInputField._colors.textMuted;
    note.textContent = msg || '';
  }

  /** @private Toggle disabled state */
  _setDisabled(bool) {
    if (bool) this.setAttribute('disabled', '');
    else this.removeAttribute('disabled');
  }

  /** @private Toggle readonly state */
  _setReadOnly(bool) {
    if (bool) this.setAttribute('readonly', '');
    else this.removeAttribute('readonly');
  }
}

if (!customElements.get('td-input-field')) {
  customElements.define('td-input-field', TdInputField);
}
