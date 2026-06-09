import { TdBaseElement } from '../base/td-base-element.js';

/**
 * Multi-type input field component with validation, counter, and label support.
 * Ported from DCMS InputField — supports text/password/email/tel/number/url/search/textarea/contenteditable.
 *
 * @element td-input-field
 * @attr {string} type - Input type: text|password|email|tel|number|url|search|textarea|contenteditable (default: text)
 * @attr {string} size - Size variant: sm|md|lg (default: md)
 * @attr {string} value - Current value
 * @attr {string} placeholder - Placeholder text
 * @attr {boolean} disabled - Disables the input
 * @attr {boolean} readonly - Makes input read-only
 * @attr {boolean} required - Marks field as required (shows asterisk on label)
 * @attr {number} max-length - Character/word limit
 * @attr {string} limit-type - Limit type: char|word (default: char)
 * @attr {string} label - Label text
 * @attr {string} helper-text - Helper text below input
 * @attr {string} error-text - Error text below input (red)
 * @attr {string} field-id - id attribute forwarded to the actual input element (for label[for] / FormData)
 * @attr {string} name - name attribute forwarded to the actual input element (for FormData)
 * @attr {number} rows - Number of rows for textarea (default 4)
 * @attr {string} validate-on - Auto-trigger checkValidity(): blur|input|change
 * @fires input - When input value changes
 * @fires change - When input loses focus (blur)
 */
export class TdInputField extends TdBaseElement {
  static get observedAttributes() {
    return [
      'type', 'size', 'value', 'placeholder', 'disabled', 'readonly', 'required',
      'max-length', 'limit-type', 'label', 'helper-text', 'error-text',
      'field-id', 'name', 'rows', 'validate-on',
    ];
  }

  static get booleanAttributes() {
    return ['disabled', 'readonly', 'required'];
  }

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

  render() {
    const type = this.getAttribute('type') || 'text';
    const size = this.getAttribute('size') || 'md';
    const value = this.getAttribute('value') || '';
    const placeholder = this.getAttribute('placeholder') || '';
    const isDisabled = this.hasAttribute('disabled');
    const isReadonly = this.hasAttribute('readonly');
    const isRequired = this.hasAttribute('required');
    const maxLength = this.getAttribute('max-length');
    const limitType = this.getAttribute('limit-type') || 'char';
    const label = this.getAttribute('label') || '';
    const helperText = this.getAttribute('helper-text') || '';
    const errorText = this.getAttribute('error-text') || '';
    const fieldId = this.getAttribute('field-id') || '';
    const name = this.getAttribute('name') || '';
    const rows = parseInt(this.getAttribute('rows') || '4', 10);

    const s = TdInputField._sizeMap[size] || TdInputField._sizeMap.md;
    const colors = TdInputField._colors;
    const hasError = !!errorText;
    const borderColor = hasError ? colors.borderError : colors.border;
    const bg = isDisabled ? colors.bgDisabled : colors.bgNormal;

    const commonStyle = `
      width: 100%;
      border: 1px solid ${borderColor};
      border-radius: ${s.radius};
      padding: ${s.py} ${s.px};
      outline: none;
      transition: box-shadow .2s cubic-bezier(0.25,0.46,0.45,0.94),
                  border-color .2s cubic-bezier(0.25,0.46,0.45,0.94),
                  background-color .2s cubic-bezier(0.25,0.46,0.45,0.94);
      background-color: ${bg};
      color: ${colors.textNormal};
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.9);
    `.replace(/\n\s*/g, ' ').trim();

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
    const nameAttr = name ? ` name="${this.escapeHtml(name)}"` : '';

    if (type === 'textarea') {
      const textareaHeight = `${s.h * rows / 2 + 8}px`;
      const maxLenAttr = maxLength && limitType === 'char' ? ` maxlength="${maxLength}"` : '';
      fieldHtml = `<textarea
        class="td-input td-input-textarea block ${s.text}"
        style="${commonStyle} height: ${textareaHeight}; resize: vertical;"
        placeholder="${escapedPlaceholder}"
        rows="${rows}"
        ${isDisabled ? 'disabled' : ''}
        ${isReadonly ? 'readonly' : ''}
        ${isRequired ? 'required' : ''}
        ${maxLenAttr}
        ${idAttr}${nameAttr}
      >${escapedValue}</textarea>`;
    } else if (type === 'contenteditable') {
      const ceStyle = `${commonStyle} height: ${s.h}px; overflow-y: auto;`;
      fieldHtml = `<div
        class="td-input td-input-editable block ${s.text}"
        contenteditable="${isDisabled || isReadonly ? 'false' : 'true'}"
        role="textbox"
        aria-multiline="false"
        style="${ceStyle}"
        data-placeholder="${escapedPlaceholder}"
        ${maxLength ? `data-max-length="${maxLength}"` : ''}
        ${idAttr}
      >${value ? this.escapeHtml(value) : ''}</div>`;
    } else {
      const inputType = ['text', 'password', 'email', 'tel', 'number', 'url', 'search'].includes(type) ? type : 'text';
      const maxLenAttr = maxLength && limitType === 'char' ? ` maxlength="${maxLength}"` : '';
      fieldHtml = `<input
        type="${inputType}"
        class="td-input td-input-${inputType} block ${s.text}"
        style="${commonStyle} height: ${s.h}px;"
        value="${escapedValue}"
        placeholder="${escapedPlaceholder}"
        ${isDisabled ? 'disabled' : ''}
        ${isReadonly ? 'readonly' : ''}
        ${isRequired ? 'required' : ''}
        ${maxLenAttr}
        ${idAttr}${nameAttr}
      />`;
    }

    // Counter
    let counterHtml = '';
    if (maxLength) {
      const currentCount = this._countValue(value, limitType);
      const unit = limitType === 'word' ? 'từ' : 'ký tự';
      const counterColor = currentCount >= parseInt(maxLength, 10) ? colors.textError : colors.textMuted;
      counterHtml = `<div class="td-input-counter text-xs mt-1 text-right" style="font-size: 12px; margin-top: 4px; text-align: right; color: ${counterColor};">${currentCount}/${maxLength} ${unit}</div>`;
    }

    // Note (error or helper)
    let noteHtml = '';
    if (errorText || helperText) {
      const noteColor = errorText ? colors.textError : colors.textMuted;
      const noteText = errorText || helperText;
      noteHtml = `<div class="td-input-note mt-1" style="color: ${noteColor}; font-size: 12px;">${this.escapeHtml(noteText)}</div>`;
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
      // Emit change event on blur
      this.emit('change', { value: this.getValue() });
    });

    // Input event + counter update
    this.listen(field, 'input', () => {
      this._updateCounter();
      this._handleWordLimit();
      this.emit('input', { value: this.getValue() });
    });

    // Auto-validation
    if (validateOn) {
      const eventName = type === 'contenteditable' && validateOn === 'change' ? 'blur' : validateOn;
      this.listen(field, eventName, () => this._checkValidity());
    }

    // contenteditable placeholder init
    if (type === 'contenteditable' && !field.innerText.trim()) {
      field.classList.add('td-placeholder');
      field.innerText = field.dataset.placeholder || '';
      field.style.color = colors.textPlaceholder;
    }

    // Expose public API methods on the element
    this.getValue = this._getValue.bind(this);
    this.setValue = this._setValue.bind(this);
    this.setError = this._setError.bind(this);
    this.setHelper = this._setHelper.bind(this);
    this.setDisabled = this._setDisabled.bind(this);
    this.setReadOnly = this._setReadOnly.bind(this);
    this.checkValidity = this._checkValidity.bind(this);
    this.focus = () => field.focus();
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

  /** @private Set error text and red border */
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
    const type = this.getAttribute('type') || 'text';
    const field = this._getFieldElement();
    const colors = TdInputField._colors;
    if (!field) return;
    if (type === 'contenteditable') {
      field.contentEditable = bool ? 'false' : 'true';
      field.style.cursor = bool ? 'not-allowed' : '';
      field.style.backgroundColor = bool ? colors.bgDisabled : colors.bgNormal;
    } else {
      field.disabled = !!bool;
      field.style.cursor = bool ? 'not-allowed' : '';
      field.style.backgroundColor = bool ? colors.bgDisabled : colors.bgNormal;
    }
    if (bool) {
      this.setAttribute('disabled', '');
    } else {
      this.removeAttribute('disabled');
    }
  }

  /** @private Toggle readonly state */
  _setReadOnly(bool) {
    const type = this.getAttribute('type') || 'text';
    const field = this._getFieldElement();
    const colors = TdInputField._colors;
    if (!field) return;
    if (type === 'contenteditable') {
      field.contentEditable = bool ? 'false' : 'true';
    } else {
      field.readOnly = !!bool;
    }
    field.style.cursor = bool ? 'not-allowed' : '';
    field.style.backgroundColor = bool ? colors.bgDisabled : colors.bgNormal;
    if (bool) {
      this.setAttribute('readonly', '');
    } else {
      this.removeAttribute('readonly');
    }
  }

  /** @private Validate required + maxLength, set error if invalid */
  _checkValidity() {
    const type = this.getAttribute('type') || 'text';
    const field = this._getFieldElement();
    const isRequired = this.hasAttribute('required');
    const maxLength = parseInt(this.getAttribute('max-length'), 10);
    const limitType = this.getAttribute('limit-type') || 'char';

    if (!field) return false;

    if (maxLength && maxLength > 0) {
      const currentCount = this._countValue(this.getValue(), limitType);
      if (currentCount > maxLength) {
        const unit = limitType === 'word' ? 'từ' : 'ký tự';
        this._setError(`Vượt quá giới hạn ${maxLength} ${unit}`);
        return false;
      }
    }

    if (type === 'contenteditable') {
      const text = field.innerText.trim();
      if (isRequired && !text) {
        this._setError('Trường này là bắt buộc');
        return false;
      }
      this._setError('');
      return true;
    }

    if (field.checkValidity && !field.checkValidity()) {
      const message = field.validationMessage || 'Trường này là bắt buộc';
      this._setError(message);
      return false;
    }

    this._setError('');
    return true;
  }
}

if (!customElements.get('td-input-field')) {
  customElements.define('td-input-field', TdInputField);
}
