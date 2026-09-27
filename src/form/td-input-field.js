import { TdFormElement } from '../base/td-form-element.js';

/**
 * Multi-type input field — token-native (needs td.css; no Tailwind). Styles: src/styles/components/field.css.
 * Plan: docs/internal/plans/v0.8.0-batch2.md (step 2, D2/D3/D5/D8/D9/D17).
 *
 * **Form-associated (ElementInternals):** the HOST submits its value in any `<form>` and owns ALL constraint
 * validation. The inner control carries NO `name` and NO native constraints — `email`/`url`/`number` render as
 * `type="text"` (+ `inputmode`); the host recomputes `typeMismatch`/`rangeUnderflow`/`rangeOverflow`/
 * `stepMismatch`/`tooLong`/`valueMissing` off a detached probe input. `password` and `date` keep their type.
 *
 * DOM contract (class map: docs/upgrading/class-map.md):
 *   <div class="td-field td-field--{sm|md|lg}[ td-field--textarea| td-field--editable]">
 *     [<label class="td-field__label" id="{host}-label" for="{controlId}">…[<span class="td-field__required" aria-hidden="true"> *</span>]</label>]
 *     <input|textarea class="td-field__control" id="{controlId}" [aria-required] [aria-describedby] [aria-invalid aria-errormessage]>
 *       | <div class="td-field__control" id="{controlId}" contenteditable role="textbox" aria-multiline="true"
 *              [aria-labelledby="{host}-label"] [aria-placeholder data-placeholder] [aria-readonly] [aria-disabled]></div>
 *     <div class="td-field__footer" [hidden]>
 *       [<span class="td-field-error" id="{host}-error">…</span>]     ← base error contract (TdFormElement)
 *       <div class="td-field__note" id="{host}-note" [hidden]>{helper}</div>
 *       [<div class="td-field__counter" id="{host}-counter" [data-state="limit"]>{n}/{max} {ký tự|từ}</div>]
 *     </div>
 *   </div>
 *
 * - `controlId` = `field-id` (verbatim) or `{host-id}-control`; the internal label always targets it.
 * - Accessible name: internal `label` → host `aria-label` → external `<label for="host-id">` (aria-labelledby).
 * - Error AND helper show together (D17); `aria-describedby` = consumer ids + note + counter + error (D3).
 * - value/placeholder/helper/error/disabled/readonly/required update IN PLACE (focus + caret kept).
 * - Exactly one `input` and one `change` per user action (native ones stopped at the host); `change` only when
 *   the value changed since focus (D8).
 *
 * @element td-input-field
 * @attr {string} type - text|password|email|tel|number|url|search|date|textarea|contenteditable (default: text)
 * @attr {string} size - sm|md|lg (default: md)
 * @attr {string} value - Current value
 * @attr {string} placeholder - Placeholder text
 * @attr {boolean} disabled - Disables the input (also via ancestor <fieldset disabled>)
 * @attr {boolean} readonly - Makes input read-only
 * @attr {boolean} required - Required (asterisk on the label, `aria-required` on the control)
 * @attr {number} max-length - Character/word limit
 * @attr {string} limit-type - char|word (default: char)
 * @attr {string} min - Minimum (number/date)
 * @attr {string} max - Maximum (number/date)
 * @attr {string} step - Step (number)
 * @attr {string} label - Label text
 * @attr {string} helper-text - Helper text below the input (kept while an error shows)
 * @attr {string} error-text - Error text below the input (see setError())
 * @attr {string} field-id - id of the inner control (default `{host-id}-control`)
 * @attr {string} name - Form field name (submitted via the host)
 * @attr {number} rows - Rows for textarea (default 4)
 * @attr {boolean} autoresize - textarea grows with its content (CSS `field-sizing`; `rows` stays the minimum), v0.13.0
 * @attr {string} validate-on - Auto-show the constraint message as the error: blur|change|input
 * @fires input - detail: { value } — once per user edit
 * @fires change - detail: { value } — on blur, only when the value changed since focus
 */
export class TdInputField extends TdFormElement {
  static get observedAttributes() {
    return [
      ...super.observedAttributes,
      'type', 'size', 'value', 'placeholder', 'readonly',
      'max-length', 'limit-type', 'min', 'max', 'step',
      'label', 'helper-text', 'error-text',
      'field-id', 'rows', 'validate-on', 'aria-label', 'autoresize',
    ];
  }

  static get booleanAttributes() {
    return [...super.booleanAttributes, 'readonly', 'autoresize'];
  }

  static get errorContract() { return true; }

  /** @private value-dependent native constraints live on these types → neutralize the inner control. */
  static _neutralizeTypes = ['email', 'url', 'number'];

  /** @private inputmode hints kept when the real type is downgraded to text. */
  static _inputModeMap = { email: 'email', url: 'url', number: 'decimal', tel: 'tel', search: 'search' };

  /** @private Attributes that change the DOM structure → full re-render. Everything else updates in place. */
  static _structural = new Set(['type', 'size', 'label', 'max-length', 'limit-type', 'rows', 'field-id', 'autoresize']);

  /** @private Known public types. */
  static _types = ['text', 'password', 'email', 'tel', 'number', 'url', 'search', 'date', 'textarea', 'contenteditable'];

  constructor() {
    super();
    /** @private Runtime helper (setHelper); null = use the `helper-text` attribute. */
    this._runtimeHelper = null;
    /** @private Value when the control gained focus (D8: change only if it differs on blur). */
    this._valueAtFocus = null;
  }

  // --- Resolved attributes ---

  /** @private @returns {string} public type (unknown → text) */
  _type() {
    const t = this.getAttribute('type') || 'text';
    return TdInputField._types.includes(t) ? t : 'text';
  }

  /** @private @returns {'sm'|'md'|'lg'} */
  _size() {
    const s = this.getAttribute('size');
    return s === 'sm' || s === 'lg' ? s : 'md';
  }

  /** @private @returns {number} positive int limit, 0 = none (never interpolate the raw attribute) */
  _maxLength() {
    const n = Number.parseInt(this.getAttribute('max-length'), 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  /** @private @returns {'char'|'word'} */
  _limitType() {
    return this.getAttribute('limit-type') === 'word' ? 'word' : 'char';
  }

  /** @private @returns {string} id of the inner control: explicit `field-id` verbatim, else `{host}-control` */
  _controlId() {
    return this.getAttribute('field-id') || `${this.id}-control`;
  }

  /** @private Resolve the inner control's render type (neutralized) from the public `type`. */
  _resolveInputType(rawType) {
    if (rawType === 'textarea' || rawType === 'contenteditable') return rawType;
    if (TdInputField._neutralizeTypes.includes(rawType)) return 'text';
    // `date` keeps its real type → native picker; the host still recomputes range validity.
    return ['text', 'password', 'tel', 'search', 'date'].includes(rawType) ? rawType : 'text';
  }

  // --- Render ---

  render() {
    const esc = (v) => this.escapeHtml(v);
    const type = this._type();
    // A structural re-render keeps what the user typed (the live value), not the stale attribute.
    const value = this._getFieldElement() ? this._getValue() : (this.getAttribute('value') || '');
    const maxLength = this._maxLength();
    const limitType = this._limitType();
    const label = this.getAttribute('label') || '';
    const controlId = this._controlId();
    const rows = Number.parseInt(this.getAttribute('rows'), 10);
    const safeRows = Number.isFinite(rows) && rows > 0 ? rows : 4;
    const maxAttr = maxLength && limitType === 'char' ? ` maxlength="${maxLength}"` : '';

    const mod = type === 'textarea' ? ' td-field--textarea' : type === 'contenteditable' ? ' td-field--editable' : '';
    const labelHtml = label
      ? `<label class="td-field__label" id="${esc(this.id)}-label" for="${esc(controlId)}">${esc(label)}</label>`
      : '';

    let control;
    if (type === 'textarea') {
      const auto = this.hasAttribute('autoresize') ? ' data-autoresize' : '';
      control = `<textarea class="td-field__control" id="${esc(controlId)}" rows="${safeRows}"${maxAttr}${auto}>${esc(value)}</textarea>`;
    } else if (type === 'contenteditable') {
      // A <div> cannot be targeted by <label for>: name it through aria-labelledby.
      const named = label ? ` aria-labelledby="${esc(this.id)}-label"` : '';
      control = `<div class="td-field__control" id="${esc(controlId)}" role="textbox" aria-multiline="true"${named}>${esc(value)}</div>`;
    } else {
      const inputType = this._resolveInputType(type);
      const inputMode = TdInputField._inputModeMap[type];
      const modeAttr = inputType === 'text' && inputMode ? ` inputmode="${inputMode}"` : '';
      control = `<input type="${inputType}" class="td-field__control" id="${esc(controlId)}" value="${esc(value)}"${maxAttr}${modeAttr}>`;
    }

    let counter = '';
    if (maxLength) {
      counter = `<div class="td-field__counter" id="${esc(this.id)}-counter">${this._counterText(value)}</div>`;
    }

    return `<div class="td-field td-field--${this._size()}${mod}">${labelHtml}${control}`
      + `<div class="td-field__footer"><div class="td-field__note" id="${esc(this.id)}-note" hidden></div>${counter}</div>`
      + '</div>';
  }

  afterRender() {
    const field = this._getFieldElement();
    if (!field) return;
    if (field.hasAttribute('data-autoresize')) field.style.setProperty('--td-field-rows', field.getAttribute('rows') || '4');

    this.listen(field, 'focus', () => { this._valueAtFocus = this._getValue(); });
    this.listen(field, 'input', (e) => {
      e.stopPropagation(); // one event: the host's CustomEvent below (D8)
      this._onInput();
    });
    // Native `change` (input/textarea commit) never reaches the page; the host emits its own on blur.
    this.listen(field, 'change', (e) => e.stopPropagation());
    this.listen(field, 'blur', () => this._onBlur());

    this._applyPlaceholder();
    this._applyInteractivity();
    this._applyRequired();
    this._applyRange();
    this._applyName();
    this._applyHelper();
    this._updateCounter();
    this._syncForm(); // an untouched required field already blocks submit
    this._applyErrorState(); // also syncs aria-describedby + footer
  }

  // --- User interaction ---

  /** @private */
  _onInput() {
    const field = this._getFieldElement();
    if (this._type() === 'contenteditable') this._normalizeEditable(field, false);
    this._handleWordLimit();
    this._updateCounter();
    this._syncForm();
    if (this.getAttribute('validate-on') === 'input') this._showInlineValidity();
    this.emit('input', { value: this.getValue() });
  }

  /** @private */
  _onBlur() {
    const field = this._getFieldElement();
    if (this._type() === 'contenteditable') {
      this._normalizeEditable(field, true);
      this._updateCounter();
    }
    this._syncForm();
    const v = this.getAttribute('validate-on');
    if (v === 'blur' || v === 'change') this._showInlineValidity();
    const value = this.getValue();
    const changed = this._valueAtFocus !== null && value !== this._valueAtFocus;
    this._valueAtFocus = null;
    if (changed) this.emit('change', { value });
  }

  /**
   * @private Keep `:empty` true when the editable holds no text, so the CSS placeholder shows and is never part
   * of the value. Browsers leave a `<br>` (or `<div><br></div>`) behind after deleting everything.
   * @param {HTMLElement} field
   * @param {boolean} trimWhitespace - on blur, whitespace-only content is treated as empty too
   */
  _normalizeEditable(field, trimWhitespace) {
    if (!field || !field.firstChild) return;
    const text = field.textContent || '';
    const empty = trimWhitespace ? text.trim() === '' : /^[\n​]*$/.test(text);
    if (!empty) return;
    if (field.querySelector('img, video, audio, iframe, object, embed, svg, canvas, input')) return;
    field.replaceChildren();
  }

  // --- In-place attribute handling ---

  attributeChangedCallback(name, oldVal, newVal) {
    if (oldVal === newVal || !this._initialized || !this._getFieldElement()) {
      super.attributeChangedCallback(name, oldVal, newVal);
      return;
    }
    if (TdInputField._structural.has(name)) {
      super.attributeChangedCallback(name, oldVal, newVal); // full re-render
      return;
    }
    switch (name) {
      case 'error-text':
        super.attributeChangedCallback(name, oldVal, newVal); // base contract, no re-render
        return;
      case 'value':
        if ((newVal ?? '') !== this._getValue()) this._setValue(newVal ?? '');
        return;
      case 'placeholder':
        this._applyPlaceholder();
        return;
      case 'helper-text':
        this._runtimeHelper = null; // the latest attribute value is the current intent
        this._applyHelper();
        return;
      case 'disabled':
        this._effectiveDisabled = newVal !== null || this._ancestorDisabled;
        this._applyInteractivity();
        this._syncForm();
        return;
      case 'readonly':
        this._applyInteractivity();
        return;
      case 'required':
        this._applyRequired();
        this._syncForm();
        return;
      case 'min':
      case 'max':
      case 'step':
        this._applyRange();
        this._syncForm();
        return;
      case 'aria-label':
        this._applyName();
        return;
      default: // name, validate-on: read on demand, nothing to redraw
    }
  }

  /** Ancestor `<fieldset disabled>` toggled: update in place (no re-render, focus kept). */
  formDisabledCallback(disabled) {
    this._ancestorDisabled = !!disabled;
    this._effectiveDisabled = this.hasAttribute('disabled') || this._ancestorDisabled;
    if (this._initialized && this._getFieldElement()) this._applyInteractivity();
  }

  /** @private */
  _applyPlaceholder() {
    const field = this._getFieldElement();
    if (!field) return;
    const ph = this.getAttribute('placeholder') || '';
    if (this._type() === 'contenteditable') {
      if (ph) {
        field.setAttribute('data-placeholder', ph);
        field.setAttribute('aria-placeholder', ph);
      } else {
        field.removeAttribute('data-placeholder');
        field.removeAttribute('aria-placeholder');
      }
    } else if (ph) field.setAttribute('placeholder', ph);
    else field.removeAttribute('placeholder');
  }

  /** @private disabled / readonly on the control (native props, or aria-* + contenteditable for the div). */
  _applyInteractivity() {
    const field = this._getFieldElement();
    if (!field) return;
    const disabled = this._effectiveDisabled;
    const readonly = this.hasAttribute('readonly');
    if (this._type() === 'contenteditable') {
      field.setAttribute('contenteditable', disabled || readonly ? 'false' : 'true');
      if (disabled) field.setAttribute('aria-disabled', 'true');
      else field.removeAttribute('aria-disabled');
      if (readonly) field.setAttribute('aria-readonly', 'true');
      else field.removeAttribute('aria-readonly');
      // A read-only textbox stays focusable (like a native readonly input); disabled leaves the tab order.
      if (readonly && !disabled) field.setAttribute('tabindex', '0');
      else field.removeAttribute('tabindex');
    } else {
      field.disabled = disabled;
      field.readOnly = readonly;
    }
  }

  /** @private `aria-required` on the control + decorative asterisk in the label. */
  _applyRequired() {
    const field = this._getFieldElement();
    const required = this.hasAttribute('required');
    if (field) {
      if (required) field.setAttribute('aria-required', 'true');
      else field.removeAttribute('aria-required');
    }
    const label = this.querySelector('.td-field__label');
    if (!label) return;
    let star = label.querySelector('.td-field__required');
    if (required && !star) {
      star = document.createElement('span');
      star.className = 'td-field__required';
      star.setAttribute('aria-hidden', 'true');
      star.textContent = ' *';
      label.appendChild(star);
    } else if (!required && star) star.remove();
  }

  /** @private Forward min/max to a native date control (picker bounds); the host still owns validity. */
  _applyRange() {
    const field = this._getFieldElement();
    if (!field || field.getAttribute('type') !== 'date') return;
    for (const a of ['min', 'max']) {
      const v = this.getAttribute(a);
      if (v != null) field.setAttribute(a, v);
      else field.removeAttribute(a);
    }
  }

  /** @private Accessible-name precedence (shared helper in TdFormElement). */
  _applyName() {
    this._applyAccessibleName(this._getFieldElement(), !!this.getAttribute('label'));
  }

  /** @private @returns {string} helper: runtime setHelper() wins over the `helper-text` attribute */
  _effectiveHelper() {
    if (this._runtimeHelper != null) return this._runtimeHelper;
    return this.getAttribute('helper-text') || '';
  }

  /** @private Sync the helper note (kept visible while an error shows — D17). */
  _applyHelper() {
    const note = this.querySelector('.td-field__note');
    if (!note) return;
    const text = this._effectiveHelper();
    note.textContent = text;
    note.hidden = !text;
    this._syncDescribedBy();
    this._syncFooter();
  }

  /** @private The footer is hidden while it has nothing to show (no error, helper or counter). */
  _syncFooter() {
    const footer = this.querySelector('.td-field__footer');
    if (!footer) return;
    footer.hidden = ![...footer.children].some((c) => !c.hidden);
  }

  // --- Error contract hooks (TdFormElement) ---

  /** @protected The error note goes first in the footer (before helper + counter). */
  _mountErrorNote(note) {
    const footer = this.querySelector('.td-field__footer');
    if (footer) footer.prepend(note);
    else super._mountErrorNote(note);
  }

  /** @protected Helper + counter ids for the control's aria-describedby (the base adds the error id). */
  _describedByIds() {
    const ids = [];
    if (this._effectiveHelper() && this.querySelector('.td-field__note')) ids.push(`${this.id}-note`);
    if (this.querySelector('.td-field__counter')) ids.push(`${this.id}-counter`);
    return ids;
  }

  /** @protected */
  _applyErrorState() {
    super._applyErrorState();
    this._syncFooter();
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
    const type = this._type();
    const value = this._getValue();
    const required = this.hasAttribute('required');
    const maxLength = this._maxLength();
    const limitType = this._limitType();
    const isEmpty = value == null || String(value).trim() === '';

    if (required && isEmpty) {
      return { flags: { valueMissing: true }, message: 'Trường này là bắt buộc' };
    }

    if (maxLength && value) {
      const count = this._countValue(value, limitType);
      if (count > maxLength) {
        const unit = limitType === 'word' ? 'từ' : 'ký tự';
        return { flags: { tooLong: true }, message: `Vượt quá giới hạn ${maxLength} ${unit}` };
      }
    }

    if (!isEmpty && TdInputField._neutralizeTypes.includes(type)) {
      // `number` must be syntax-checked BEFORE the probe: a native number input sanitizes an invalid string
      // to "" (which reads as valid), so "abc" would slip through.
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

    // `date`: the inner control keeps its real type, but the HOST still owns validity.
    if (!isEmpty && type === 'date') {
      const probe = document.createElement('input');
      probe.type = 'date';
      for (const a of ['min', 'max']) {
        const av = this.getAttribute(a);
        if (av != null) probe.setAttribute(a, av);
      }
      probe.value = String(value);
      const v = probe.validity;
      // An invalid date string is sanitized to "" by the native control → detect it explicitly.
      if (probe.value === '' || v.badInput || v.typeMismatch) {
        return { flags: { typeMismatch: true }, message: 'Ngày không hợp lệ' };
      }
      if (v.rangeUnderflow) return { flags: { rangeUnderflow: true }, message: `Ngày tối thiểu là ${this.getAttribute('min')}` };
      if (v.rangeOverflow) return { flags: { rangeOverflow: true }, message: `Ngày tối đa là ${this.getAttribute('max')}` };
    }

    return { flags: {}, message: '' };
  }

  /** @private Mirror the current constraint message into the error (validate-on UX). */
  _showInlineValidity() {
    const { message } = this._computeValidity();
    this.setError(message || '');
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
    // The attribute may be unchanged (no callback) while the live value differs: force it.
    this.setValue(this._defaultValueAttr ?? '');
  }

  _restoreState(state, _mode) {
    if (typeof state === 'string') this.setValue(state);
  }

  _focusTarget() {
    return this.querySelector('.td-field__control');
  }

  // --- Private helpers ---

  /** @private The inner input/textarea/editable div. */
  _getFieldElement() {
    return this.querySelector('.td-field__control');
  }

  /** @private Count value by char or word */
  _countValue(text, limitType) {
    if (!text) return 0;
    if (limitType === 'word') {
      return text.trim().split(/\s+/).filter((w) => w.length > 0).length;
    }
    return text.length;
  }

  /** @private @returns {string} "n/max unit" */
  _counterText(value) {
    const limitType = this._limitType();
    const unit = limitType === 'word' ? 'từ' : 'ký tự';
    return `${this._countValue(value, limitType)}/${this._maxLength()} ${unit}`;
  }

  /** @private Counter text + `data-state="limit"` at count >= max (colour only, no red border — D9). */
  _updateCounter() {
    const counter = this.querySelector('.td-field__counter');
    if (!counter) return;
    const value = this._getValue();
    counter.textContent = this._counterText(value);
    if (this._countValue(value, this._limitType()) >= this._maxLength()) counter.setAttribute('data-state', 'limit');
    else counter.removeAttribute('data-state');
  }

  /** @private Word-limit truncation; the caret stays where it was relative to the kept text. */
  _handleWordLimit() {
    const maxLength = this._maxLength();
    if (!maxLength || this._limitType() !== 'word') return;
    const field = this._getFieldElement();
    if (!field) return;

    if (this._type() === 'contenteditable') {
      const text = field.innerText || '';
      const words = text.trim().split(/\s+/).filter((w) => w.length > 0);
      if (words.length > maxLength) {
        field.innerText = words.slice(0, maxLength).join(' ');
        const range = document.createRange();
        const sel = window.getSelection();
        range.selectNodeContents(field);
        range.collapse(false); // caret to the end
        sel.removeAllRanges();
        sel.addRange(range);
      }
      return;
    }
    const text = field.value || '';
    const words = text.trim().split(/\s+/).filter((w) => w.length > 0);
    if (words.length <= maxLength) return;
    const truncated = words.slice(0, maxLength).join(' ');
    const caret = field.selectionStart; // null for types without a text selection (date)
    field.value = truncated;
    if (caret != null) {
      const newPos = TdInputField._caretAfterTruncate(text, caret, truncated.length);
      field.setSelectionRange(newPos, newPos);
    }
  }

  /**
   * @private Map a caret offset in `text` to the word-normalised text (words joined by one space, trimmed).
   * The prefix before the caret is normalised the same way, so a paste in the middle keeps the caret right after
   * the pasted words (the legacy `cursorPos - 1` was off by one).
   * @param {string} text
   * @param {number} caret
   * @param {number} maxPos - length of the truncated text
   * @returns {number}
   */
  static _caretAfterTruncate(text, caret, maxPos) {
    const before = text.slice(0, caret);
    const prefix = before.trim().split(/\s+/).filter((w) => w.length > 0).join(' ');
    const sep = prefix && /\s$/.test(before) ? 1 : 0;
    return Math.min(prefix.length + sep, maxPos);
  }

  /** @private Truncate text to limit */
  _truncateToLimit(text, maxLength, limitType) {
    if (!maxLength || maxLength <= 0) return text;
    if (limitType === 'word') {
      const words = text.trim().split(/\s+/).filter((w) => w.length > 0);
      if (words.length <= maxLength) return text;
      return words.slice(0, maxLength).join(' ');
    }
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength);
  }

  /** @private Live value from the control ('' before the first render). */
  _getValue() {
    const field = this._getFieldElement();
    if (!field) return '';
    if (TdInputField._isEditable(field)) {
      // Browser leftovers (<br>) are not a value; the placeholder is CSS, never text.
      return (field.textContent || '') === '' ? '' : field.innerText;
    }
    return field.value;
  }

  /**
   * @private Decide by the ELEMENT, not the `type` attribute: during a `type` re-render the attribute is already
   * new while the old control is still in the DOM.
   * @param {HTMLElement} field
   */
  static _isEditable(field) {
    return field.localName === 'div';
  }

  // --- Public API (prototype methods: available before the first connect) ---

  /** @returns {string} the current value */
  getValue() {
    return this._getValue();
  }

  /**
   * Set the value (truncated to `max-length`). Does not fire `input`/`change`.
   * @param {string} val
   */
  setValue(val) {
    const field = this._getFieldElement();
    if (!field) {
      if (val == null) this.removeAttribute('value');
      else this.setAttribute('value', String(val)); // rendered on connect
      return;
    }
    let next = val == null ? '' : String(val);
    const maxLength = this._maxLength();
    if (maxLength && next) next = this._truncateToLimit(next, maxLength, this._limitType());
    if (TdInputField._isEditable(field)) field.textContent = next;
    else field.value = next;
    if (document.activeElement === field) this._valueAtFocus = this._getValue(); // programmatic ≠ user change
    this._updateCounter();
    this._syncForm();
  }

  /** @private legacy name kept for internal callers */
  _setValue(val) {
    this.setValue(val);
  }

  /**
   * Set the helper text ('' clears it). A later `helper-text` attribute value replaces it.
   * @param {string} msg
   */
  setHelper(msg) {
    this._runtimeHelper = msg ? String(msg) : '';
    this._applyHelper();
  }

  /** @param {boolean} bool */
  setDisabled(bool) {
    if (bool) this.setAttribute('disabled', '');
    else this.removeAttribute('disabled');
  }

  /** @param {boolean} bool */
  setReadOnly(bool) {
    if (bool) this.setAttribute('readonly', '');
    else this.removeAttribute('readonly');
  }
}

if (!customElements.get('td-input-field')) {
  customElements.define('td-input-field', TdInputField);
}
