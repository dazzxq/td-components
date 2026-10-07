import {
  TdFormElement, ssrClassKey, ssrContentNodes, ssrSameAttrs, ssrIsErrorNote, SSR_ARIA_DATA, SSR_CONTROL_ATTRS,
} from '../base/td-form-element.js';
import { ssrMarker } from '../base/td-base-element.js';

/**
 * v0.26.0 SSR (ADR 0012) — native constraint attributes a NORMALLY rendered + bound control carries, per public type
 * (render() + afterRender(): `_applyRange` forwards min / max to `date`, min / max / step to month / datetime-local /
 * time; `maxlength` comes from render() with a character counter and is checked as structure). Everything else in
 * SSR_CONSTRAINTS exists on the server-rendered control only for the no-JS form and comes off on hydrate (the host owns
 * validity: email / url / number render as text, `required` / `pattern` / `minlength` are never on the control).
 */
const SSR_KEEP = { date: ['min', 'max'], month: ['min', 'max', 'step'], 'datetime-local': ['min', 'max', 'step'], time: ['min', 'max', 'step'] };
const SSR_CONSTRAINTS = ['required', 'pattern', 'minlength', 'min', 'max', 'step'];
/** Native type PHP prints for a public type the component renders as text + inputmode (validation without JS). */
const SSR_NATIVE_TYPE = { email: 'email', url: 'url', number: 'number' };
/**
 * Review round 3: host attribute ↔ the no-JS attribute PHP printed on the control — they must still agree on the first
 * hydrate (`maxlength` is compared as structure).
 */
const SSR_AGREE = [['name', 'name'], ['required', 'required'], ['disabled', 'disabled'], ['readonly', 'readonly'],
  ['pattern', 'pattern'], ['minlength', 'minlength'], ['min', 'min'], ['max', 'max'], ['step', 'step']];
/** Other no-JS-only control attributes removed on hydrate. */
const SSR_ONLY = ['name', 'autofocus'];

/**
 * Multi-type input field — token-native (needs td.css; no Tailwind). Styles: src/styles/components/field.css.
 * Plan: docs/internal/plans/v0.8.0-batch2.md (step 2, D2/D3/D5/D8/D9/D17).
 *
 * **Form-associated (ElementInternals):** the HOST submits its value in any `<form>` and owns ALL constraint
 * validation. The inner control carries NO `name` and NO native constraints — `email`/`url`/`number` render as
 * `type="text"` (+ `inputmode`); the host recomputes `typeMismatch`/`rangeUnderflow`/`rangeOverflow`/
 * `stepMismatch`/`patternMismatch`/`tooShort`/`tooLong`/`valueMissing` (texts: `TdInputField.messages`), using a
 * detached probe input where the browser's own rules apply. `password`, `date`, `month`, `datetime-local` and `time`
 * keep their type (native picker); the form value of those is the control's own normalised `.value` (v0.18.0).
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
 * - v0.54.0 (plan v0.54.0-hint QĐ 3): while an error shows the helper note is hidden and leaves the description (D17
 *   dropped); `aria-describedby` = consumer ids + note + counter + error (D3). The helper contract (helper-text,
 *   setHelper, a rich <td-hint> child in the footer) lives in TdFormElement.
 * - value/placeholder/helper/error/disabled/readonly/required update IN PLACE (focus + caret kept).
 * - Exactly one `input` and one `change` per user action (native ones stopped at the host); `change` only when
 *   the value changed since focus (D8).
 * - SSR (v0.26.0, ADR 0012): a host marked `data-td-ssr="input-field@1"` (PHP td_field element mode) whose tree is
 *   exactly render()'s is adopted IN PLACE — same control node (focus + selection kept), live value captured (early
 *   `value` property > what the user typed > the attribute), ElementInternals first, then `name` and the constraints the
 *   component does not keep on its control (SSR_KEEP) come off; a native email / url / number control becomes
 *   text + inputmode on the same node; external `<label for="{field-id}">` move to the host; reset → the native
 *   default. Any mismatch → safe render AT ONCE + restore (value, selection, and the focus when the control had it) —
 *   no deferral (ADR 0012 §5). `contenteditable` has no SSR contract (always rendered).
 *
 * @element td-input-field
 * @attr {string} type - text|password|email|tel|number|url|search|date|month|datetime-local|time|textarea|contenteditable
 *   (default: text; month / datetime-local / time since v0.18.0)
 * @attr {string} size - sm|md|lg (default: md)
 * @attr {string} value - Initial value (the `value` PROPERTY is the live value — get/set = getValue()/setValue())
 * @attr {string} placeholder - Placeholder text
 * @attr {boolean} disabled - Disables the input (also via ancestor <fieldset disabled>)
 * @attr {boolean} readonly - Makes input read-only
 * @attr {boolean} required - Required (asterisk on the label, `aria-required` on the control)
 * @attr {number} max-length - Character/word limit
 * @attr {number} minlength - Minimum characters (`tooShort`, only after the user edited — like native), v0.16.0
 * @attr {string} pattern - Regular expression the whole value must match (`patternMismatch`; types text, search,
 *   tel, url, email, password — like native), v0.16.0
 * @attr {string} limit-type - char|word (default: char)
 * @attr {string} min - Minimum (number/date/month/datetime-local/time — same format as the value)
 * @attr {string} max - Maximum (number/date/month/datetime-local/time)
 * @attr {string} step - Step (number/month/datetime-local/time — native units: months, seconds; `step="1"` allows
 *   seconds, `step="0.001"` fractions)
 * @attr {string} label - Label text
 * @attr {string} helper-text - Helper text below the input (hidden while an error shows — v0.54.0)
 * @attr {string} error-text - Error text below the input (see setError())
 * @attr {string} field-id - id of the inner control (default `{host-id}-control`)
 * @attr {string} name - Form field name (submitted via the host)
 * @attr {number} rows - Rows for textarea (default 4)
 * @attr {boolean} autoresize - textarea grows with its content (CSS `field-sizing`; `rows` stays the minimum), v0.13.0
 * @attr {string} validate-on - Auto-show the constraint message as the error: blur|change|input
 * @attr {string} autocomplete - Forwarded to the inner `<input>`/`<textarea>` (token list `[a-z0-9 -]`, e.g.
 *   `current-password`, `email`, `section-a shipping street-address`; anything else is dropped), v0.17.0
 * @attr {string} inputmode - none|text|decimal|numeric|tel|search|email|url → the control (overrides the hint
 *   derived from `type`), v0.17.0
 * @attr {string} enterkeyhint - enter|done|go|next|previous|search|send → the control, v0.17.0
 * @attr {string} autocapitalize - off|none|on|sentences|words|characters → the control, v0.17.0
 * @attr {string} spellcheck - true|false → the control, v0.17.0
 * @attr {boolean} autofocus - Focus the control once when the field is first attached (only when nothing else
 *   outside `<body>` already holds focus), v0.17.0
 * @fires input - detail: { value } — once per user edit
 * @fires change - detail: { value } — on blur, only when the value changed since focus
 */
export class TdInputField extends TdFormElement {
  /** v0.26.0: adopts PHP element-mode markup in place (`input-field@1`); a hydrated element re-binds on re-connect. */
  static hydratable = true;

  static get observedAttributes() {
    return [
      ...super.observedAttributes,
      'type', 'size', 'value', 'placeholder', 'readonly',
      'max-length', 'limit-type', 'min', 'max', 'step',
      'label', 'error-text',
      'field-id', 'rows', 'validate-on', 'aria-label', 'autoresize', 'minlength', 'pattern',
      ...TdInputField._nativeAttrs,
    ];
  }

  static get booleanAttributes() {
    return [...super.booleanAttributes, 'readonly', 'autoresize'];
  }

  static get errorContract() { return true; }

  /**
   * Validation + counter texts (Vietnamese); override per site, e.g.
   * `Object.assign(TdInputField.messages, { valueMissing: 'This field is required' })`.
   * Placeholders: `{min}` `{max}` `{minLength}` `{maxLength}` `{unit}` (= `unitChar` / `unitWord`).
   */
  static messages = {
    valueMissing: 'Trường này là bắt buộc',
    tooLong: 'Vượt quá giới hạn {maxLength} {unit}',
    tooShort: 'Tối thiểu {minLength} ký tự',
    patternMismatch: 'Giá trị không đúng định dạng',
    badInput: 'Giá trị không hợp lệ',
    typeMismatchEmail: 'Email không hợp lệ',
    typeMismatchUrl: 'URL không hợp lệ',
    rangeUnderflow: 'Giá trị tối thiểu là {min}',
    rangeOverflow: 'Giá trị tối đa là {max}',
    stepMismatch: 'Giá trị không đúng bước nhảy',
    dateInvalid: 'Ngày không hợp lệ',
    dateUnderflow: 'Ngày tối thiểu là {min}',
    dateOverflow: 'Ngày tối đa là {max}',
    unitChar: 'ký tự',
    unitWord: 'từ',
  };

  /** @private Types where the native `pattern` attribute applies. */
  static _patternTypes = ['text', 'search', 'tel', 'url', 'email', 'password'];

  /** @private value-dependent native constraints live on these types → neutralize the inner control. */
  static _neutralizeTypes = ['email', 'url', 'number'];

  /** @private inputmode hints kept when the real type is downgraded to text. */
  static _inputModeMap = { email: 'email', url: 'url', number: 'decimal', tel: 'tel', search: 'search' };

  /**
   * @private Native attributes forwarded to the inner control (v0.17.0, E1): name → value whitelist. A value outside
   * the whitelist is not forwarded (the attribute is removed from the control). `autocomplete` only applies to
   * `<input>`/`<textarea>`; the others are global attributes and also reach the contenteditable box.
   */
  static _nativeAttrs = ['autocomplete', 'inputmode', 'enterkeyhint', 'autocapitalize', 'spellcheck'];

  /** @private @type {Record<string, string[]>} enumerated values (lower-cased before the check) */
  static _nativeEnums = {
    inputmode: ['none', 'text', 'decimal', 'numeric', 'tel', 'search', 'email', 'url'],
    enterkeyhint: ['enter', 'done', 'go', 'next', 'previous', 'search', 'send'],
    autocapitalize: ['off', 'none', 'on', 'sentences', 'words', 'characters'],
    spellcheck: ['true', 'false'],
  };

  /**
   * @private The whitelisted value of a forwarded attribute, or null (absent / not allowed).
   * @param {string} name
   * @param {string|null} raw
   * @returns {string|null}
   */
  static _nativeValue(name, raw) {
    if (raw == null) return null;
    const v = String(raw).trim().toLowerCase();
    if (name === 'autocomplete') {
      // HTML autofill detail tokens: lower-case letters, digits, hyphen, separated by spaces.
      const tokens = v.split(/\s+/).filter(Boolean);
      return tokens.length && tokens.every((t) => /^[a-z0-9-]+$/.test(t)) ? tokens.join(' ') : null;
    }
    if (name === 'spellcheck' && v === '') return 'true'; // `spellcheck` alone = true (HTML)
    return TdInputField._nativeEnums[name]?.includes(v) ? v : null;
  }

  /** @private Attributes that change the DOM structure → full re-render. Everything else updates in place. */
  static _structural = new Set(['type', 'size', 'label', 'max-length', 'limit-type', 'rows', 'field-id', 'autoresize']);

  /** @private Known public types. */
  static _types = [
    'text', 'password', 'email', 'tel', 'number', 'url', 'search', 'date', 'month', 'datetime-local', 'time',
    'textarea', 'contenteditable',
  ];

  /** @private Date/time types that keep their real (native picker) type — v0.18.0 adds month/datetime-local/time. */
  static _dateTypes = ['date', 'month', 'datetime-local', 'time'];

  constructor() {
    super();
    /** @private Value when the control gained focus (D8: change only if it differs on blur). */
    this._valueAtFocus = null;
    /** @private The value was last changed by the user (native "dirty by user edit" — gates `tooShort`). */
    this._userEdited = false;
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

  /** @private @returns {number} `minlength` as a positive int, 0 = none */
  _minLength() {
    const n = Number.parseInt(this.getAttribute('minlength'), 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  /** @private @returns {string} counter / tooLong unit (`messages.unitChar` | `messages.unitWord`) */
  _unit() {
    return this._msg(this._limitType() === 'word' ? 'unitWord' : 'unitChar');
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
    // date/month/datetime-local/time keep their real type → native picker; the host still recomputes validity.
    if (TdInputField._dateTypes.includes(rawType)) return rawType;
    return ['text', 'password', 'tel', 'search'].includes(rawType) ? rawType : 'text';
  }

  // --- Render ---

  render() {
    const esc = (v) => this.escapeHtml(v);
    const type = this._type();
    // A structural re-render keeps what the user typed (the live value), not the stale attribute. Review round 4: the
    // render that replaces REFUSED SSR markup never reads it (an injected control could come first) — the host value
    // is rendered and the trusted captured state is restored afterwards.
    const fresh = !!this._ssrFreshRender;
    const value = this._getFieldElement() && !fresh ? this._getValue() : (this.getAttribute('value') || '');
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
    this._applyNativeAttrs();
    this._applyRequired();
    this._applyRange();
    this._applyName();
    this._updateCounter();
    this._syncForm(); // an untouched required field already blocks submit
    this._applyErrorState(); // also syncs aria-describedby + footer
    this._autofocusOnce();
  }

  /** @private Forward the whitelisted native attributes (autocomplete, inputmode, …) to the control, in place. */
  _applyNativeAttrs() {
    const field = this._getFieldElement();
    if (!field) return;
    const editable = TdInputField._isEditable(field);
    for (const name of TdInputField._nativeAttrs) {
      let v = TdInputField._nativeValue(name, this.getAttribute(name));
      if (name === 'autocomplete' && editable) v = null; // not an autofill field
      if (name === 'inputmode' && v == null && !editable && field.getAttribute('type') === 'text') {
        v = TdInputField._inputModeMap[this._type()] || null; // hint for a downgraded email/url/number/…
      }
      if (v == null) field.removeAttribute(name);
      else field.setAttribute(name, v);
    }
  }

  /**
   * @private `autofocus`: focus the control ONCE per element, on its first render while connected — never stealing
   * focus from another element that already holds it (only when focus is on body / nothing), never a disabled field.
   */
  _autofocusOnce() {
    if (this._autofocused || !this.isConnected) return;
    this._autofocused = true; // decided on the FIRST connected render only (a later attribute / re-render never focuses)
    if (!this.hasAttribute('autofocus')) return;
    const field = this._getFieldElement();
    if (!field || this._effectiveDisabled) return;
    const active = document.activeElement;
    if (active && active !== document.body && active !== document.documentElement) return;
    field.focus();
  }

  // --- User interaction ---

  /** @private */
  _onInput() {
    this._userEdited = true;
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
    if (this._helperAttr(name, oldVal, newVal)) return; // v0.54.0: helper-text in place (TdFormElement)
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
      case 'minlength':
      case 'pattern':
        this._syncForm();
        return;
      case 'aria-label':
        this._applyName();
        return;
      case 'autocomplete':
      case 'inputmode':
      case 'enterkeyhint':
      case 'autocapitalize':
      case 'spellcheck':
        this._applyNativeAttrs();
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

  /**
   * @private Forward min/max (+ step for month/datetime-local/time: picker granularity, e.g. a seconds field with
   * `step="1"`) to a native date/time control; the host still owns validity.
   */
  _applyRange() {
    const field = this._getFieldElement();
    const t = field?.getAttribute('type');
    if (!field || !TdInputField._dateTypes.includes(t)) return;
    for (const a of t === 'date' ? ['min', 'max'] : ['min', 'max', 'step']) {
      const v = this.getAttribute(a);
      if (v != null) field.setAttribute(a, v);
      else field.removeAttribute(a);
    }
  }

  /** @private Accessible-name precedence (shared helper in TdFormElement). */
  _applyName() {
    this._applyAccessibleName(this._getFieldElement(), !!this.getAttribute('label'));
  }

  /** @protected v0.54.0: the helper note (text or a rich <td-hint>) lives in the footer, before the counter */
  _helperSlot() {
    const footer = this.querySelector(':scope > .td-field > .td-field__footer');
    if (!footer) return super._helperSlot();
    return { parent: footer, before: footer.querySelector(':scope > .td-field__counter') };
  }

  /** @protected */
  _helperChanged() { this._syncFooter(); }

  /** @private The footer is hidden while it has nothing to show (no error, helper or counter). */
  _syncFooter() {
    const footer = this.querySelector('.td-field__footer');
    if (!footer) return;
    footer.hidden = ![...footer.children].some((c) => !c.hidden && !c.hasAttribute('data-td-suppressed'));
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
    const ids = this._helperDescribedByIds();
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

    const M = (key, vars) => this._msg(key, vars);

    // An incomplete / unconvertible user entry in a native date/time control has `.value === ''` but
    // `validity.badInput` — never treat it as empty (review v0.18.0).
    if (TdInputField._dateTypes.includes(type)) {
      const f = this._getFieldElement();
      if (f && f.validity && f.validity.badInput) return { flags: { badInput: true }, message: M('badInput') };
    }

    if (required && isEmpty) {
      return { flags: { valueMissing: true }, message: M('valueMissing') };
    }

    if (maxLength && value) {
      const count = this._countValue(value, limitType);
      if (count > maxLength) {
        return { flags: { tooLong: true }, message: M('tooLong', { maxLength, unit: this._unit() }) };
      }
    }

    // `minlength`: like native, only for a non-empty value the USER edited (programmatic values never trip it).
    const minLength = this._minLength();
    if (minLength && value && this._userEdited && type !== 'number' && !TdInputField._dateTypes.includes(type)
      && String(value).length < minLength) {
      return { flags: { tooShort: true }, message: M('tooShort', { minLength }) };
    }

    if (!isEmpty && TdInputField._neutralizeTypes.includes(type)) {
      // `number` must be syntax-checked BEFORE the probe: a native number input sanitizes an invalid string
      // to "" (which reads as valid), so "abc" would slip through.
      if (type === 'number') {
        const trimmed = String(value).trim();
        if (!/^-?(\d+(\.\d*)?|\.\d+)([eE][-+]?\d+)?$/.test(trimmed)) {
          return { flags: { badInput: true }, message: M('badInput') };
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
        const msg = type === 'number' ? M('badInput')
          : type === 'email' ? M('typeMismatchEmail') : M('typeMismatchUrl');
        return { flags: { typeMismatch: true }, message: msg };
      }
      const range = { min: this.getAttribute('min') ?? '', max: this.getAttribute('max') ?? '' };
      if (v.rangeUnderflow) return { flags: { rangeUnderflow: true }, message: M('rangeUnderflow', range) };
      if (v.rangeOverflow) return { flags: { rangeOverflow: true }, message: M('rangeOverflow', range) };
      if (v.stepMismatch) return { flags: { stepMismatch: true }, message: M('stepMismatch') };
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
        return { flags: { typeMismatch: true }, message: M('dateInvalid') };
      }
      const range = { min: this.getAttribute('min') ?? '', max: this.getAttribute('max') ?? '' };
      if (v.rangeUnderflow) return { flags: { rangeUnderflow: true }, message: M('dateUnderflow', range) };
      if (v.rangeOverflow) return { flags: { rangeOverflow: true }, message: M('dateOverflow', range) };
    }

    // month / datetime-local / time (v0.18.0): same probe, with `step` (months / seconds) like the native control.
    if (!isEmpty && TdInputField._dateTypes.includes(type) && type !== 'date') {
      const probe = document.createElement('input');
      probe.type = type;
      for (const a of ['min', 'max', 'step']) {
        const av = this.getAttribute(a);
        if (av != null) probe.setAttribute(a, av);
      }
      probe.value = String(value);
      const v = probe.validity;
      if (probe.value === '' || v.badInput || v.typeMismatch) {
        return { flags: { badInput: true }, message: M('badInput') };
      }
      const range = { min: this.getAttribute('min') ?? '', max: this.getAttribute('max') ?? '' };
      if (v.rangeUnderflow) return { flags: { rangeUnderflow: true }, message: M('rangeUnderflow', range) };
      if (v.rangeOverflow) return { flags: { rangeOverflow: true }, message: M('rangeOverflow', range) };
      if (v.stepMismatch) return { flags: { stepMismatch: true }, message: M('stepMismatch') };
    }

    // `pattern`: the browser's own rules (whole-value match, `v` flag, an invalid pattern is ignored) on a probe.
    const pattern = this.getAttribute('pattern');
    // pattern tests the RAW value (whitespace-only is not "empty" for it, as in native inputs)
    if (value != null && String(value) !== '' && pattern != null && TdInputField._patternTypes.includes(type)) {
      const probe = document.createElement('input');
      probe.type = 'text';
      probe.setAttribute('pattern', pattern);
      probe.value = String(value);
      if (probe.validity.patternMismatch) return { flags: { patternMismatch: true }, message: M('patternMismatch') };
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
    if (this._ssrDefaults) {
      // v0.26.0: reset target = the NATIVE default of the server-rendered control (not the value at upgrade)
      this._defaultValueAttr = this._ssrDefaults.value;
      this._defaultValue = this._ssrDefaults.value;
    }
  }

  // --- SSR hydrate (v0.26.0, ADR 0012) ---

  /**
   * Marker `input-field@<n>` + a native input / textarea control → capture its state; adopt the tree only when the
   * schema is 1, it is exactly render()'s for the current host attributes, its no-JS form attributes still agree with
   * the host and it passes the subtree scan + skeleton (else safe render at once + restore, focus included).
   * `contenteditable` never hydrates.
   * @returns {boolean}
   */
  canHydrate() {
    // Review round 1 IMPL-1: `input-field@<other schema>` is never adopted, but its control state still goes through
    // the state-safe path (no marker → legacy render, unchanged).
    const m = ssrMarker(this);
    if (!m || m.name !== 'input-field') return false;
    // review round 4 (ISSUE-8): state comes only from the expected skeleton slot (or the single control there is)
    const control = this._ssrStateSource();
    if (!control) return this._ssrClean(false); // none / ambiguous: clean render from the host, nothing transplanted
    this._ssrDefaults = { value: control.defaultValue };
    const matches = m.schema === 1 && this._type() !== 'contenteditable' && this._markupMatches(true)
      && this._ssrFormAttrsAgree(control, SSR_AGREE, ['required', 'disabled', 'readonly']);
    return this._ssrDecide(control, matches, false);
  }

  /** Re-connect of a HYDRATED element: re-bind in place while the markup is still the component's own (else restore). */
  canRebind() {
    return this._ssrRevalidate(this._ssrStateSource());
  }

  /** @protected Review round 4: `div.td-field` (unique host child) > `input|textarea.td-field__control` (unique child). */
  _ssrSlotControl() {
    const roots = [...this.children].filter((e) => e.localName === 'div' && e.classList.contains('td-field'));
    if (roots.length !== 1) return null;
    const c = [...roots[0].children].filter((e) => (e.localName === 'input' || e.localName === 'textarea')
      && e.classList.contains('td-field__control'));
    return c.length === 1 ? c[0] : null;
  }

  /** @protected */
  _ssrPlausible() {
    return 'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]), textarea';
  }

  hydrateExisting() {
    const control = this._ssrControl;
    const state = this._ssrState;
    const type = this._type();
    // Same node: a native email / url / number control becomes the component's text control (+ inputmode on bind).
    let rewrote = false;
    const renderType = this._resolveInputType(type);
    if (control.localName === 'input' && control.getAttribute('type') !== renderType) {
      control.type = renderType;
      rewrote = true;
    }
    if (control.value !== state.value) {
      control.value = state.value; // only when required: an early value, or an engine that cleared it on the type change
      rewrote = true;
    }
    if (rewrote && state.focused && state.selection) {
      try { control.setSelectionRange(...state.selection); } catch { /* type without a selection API */ }
    }
    if (state.focused && control.ownerDocument.activeElement !== control) control.focus({ preventScroll: true });
    // focused before define: `change` on blur compares with the value the field had when the page was served
    if (state.focused && this._valueAtFocus == null) this._valueAtFocus = control.defaultValue;
    this._userEdited = state.edited;
    // the component's own description ids are re-added (in its order) by the bind; the page's own ids stay
    const own = new Set([`${this.id}-note`, `${this.id}-counter`, `${this.id}-error`]);
    const rest = (control.getAttribute('aria-describedby') || '').split(/\s+/).filter((t) => t && !own.has(t));
    if (rest.length) control.setAttribute('aria-describedby', rest.join(' '));
    else control.removeAttribute('aria-describedby');
    const note = this.querySelector('.td-field__footer > .td-field-error');
    if (note) this._errorNote = note;
    this._syncForm(); // ElementInternals FIRST…
    const keep = SSR_KEEP[type] || [];
    for (const a of [...SSR_ONLY, ...SSR_CONSTRAINTS.filter((c) => !keep.includes(c))]) control.removeAttribute(a); // …then
    this._ssrRetargetLabels(control);
    this._ssrControl = null; // review round 1 IMPL-3: adopted — no stale references
    this._ssrState = null;
  }

  /**
   * @protected Review round 2: the known skeleton — one `div.td-field` > [optional label (text + at most the required
   * star), THIS control, footer of text-only error note / helper note / counter, each at most once].
   */
  _ssrSkeletonOk() {
    const kids = ssrContentNodes(this);
    if (kids.length !== 1 || kids[0].nodeType !== 1 || kids[0].localName !== 'div' || !kids[0].classList.contains('td-field')) return false;
    const parts = ssrContentNodes(kids[0]);
    if (parts.some((n) => n.nodeType !== 1)) return false;
    let i = 0;
    if (parts[0]?.localName === 'label') {
      const nodes = ssrContentNodes(parts[0]);
      const els = nodes.filter((n) => n.nodeType === 1);
      if (els.length > 1 || (els[0] && (els[0] !== nodes[nodes.length - 1] || !els[0].classList.contains('td-field__required')
        || els[0].localName !== 'span' || els[0].children.length))) return false;
      i = 1;
    }
    if (parts[i] !== this._ssrControl || parts.length !== i + 2) return false;
    const footer = parts[i + 1];
    if (footer.localName !== 'div' || !footer.classList.contains('td-field__footer')) return false;
    const seen = new Set();
    return ssrContentNodes(footer).every((n) => {
      if (n.nodeType !== 1 || n.children.length) return false;
      const kind = ssrIsErrorNote(n) ? 'error'
        : n.localName === 'div' && n.classList.contains('td-field__note') ? 'note'
          : n.localName === 'div' && n.classList.contains('td-field__counter') ? 'counter' : null;
      if (!kind || seen.has(kind)) return false;
      seen.add(kind);
      return true;
    });
  }

  /** @protected */
  _ssrCapture(control, live) {
    const focused = control === control.ownerDocument.activeElement;
    let selection = null;
    if (focused) {
      try {
        if (control.selectionStart != null) selection = [control.selectionStart, control.selectionEnd, control.selectionDirection || 'none'];
      } catch { /* no selection API for this type */ }
    }
    const early = !live && this._earlyProps?.has('value') && this._earlyValue !== undefined;
    let value = early ? this._earlyValue : control.value;
    const max = this._maxLength();
    if (early && max && value) value = this._truncateToLimit(value, max, this._limitType());
    // native "dirty by user edit" (gates tooShort): the user changed it before the module loaded
    return { value, selection, focused, edited: !early && control.value !== control.defaultValue };
  }

  /** @protected */
  _restoreSsrState(state) {
    const field = this._getFieldElement();
    if (!field) return;
    if (state.clean) { // review round 4: rendered from the host only — nothing to put back but the focus
      if (state.refocus) field.focus({ preventScroll: true });
      return;
    }
    if (TdInputField._isEditable(field)) return;
    if (field.value !== state.value) field.value = state.value;
    this._userEdited = !!state.edited;
    this._updateCounter();
    this._syncForm();
    if (state.refocus) {
      // the replaced control had focus → focus + selection move to the new one (review rounds 1 + 3);
      // `change` on blur still compares with the value the page was served with
      field.focus({ preventScroll: true });
      if (state.selection) {
        try { field.setSelectionRange(...state.selection); } catch { /* type without a selection API */ }
      }
      this._valueAtFocus = this._ssrDefaults?.value ?? this._valueAtFocus;
    }
  }

  /**
   * @private The single `.td-field` child is exactly render()'s tree for the current host attributes: wrapper classes,
   * internal label (+ the required star), control (tag, type — or its native SSR type on the first hydrate —, id,
   * maxlength, rows / autoresize, attribute allowlist), footer (error note, helper note, counter). `first` = the SSR
   * markup (no-JS-only attributes allowed on the control); re-connect (`first` false) is strict.
   * @param {boolean} first
   */
  _markupMatches(first) {
    const kids = ssrContentNodes(this);
    if (kids.length !== 1 || kids[0].nodeType !== 1) return false;
    const root = kids[0];
    const tpl = document.createElement('template');
    tpl.innerHTML = this.render();
    const want = tpl.content.firstElementChild;
    if (root.localName !== 'div' || !ssrSameAttrs(root, want)) return false;
    const have = ssrContentNodes(root);
    const need = [...want.children];
    if (have.length !== need.length || have.some((n) => n.nodeType !== 1)) return false;
    return need.every((w, i) => {
      const l = have[i];
      if (w.localName === 'label') return this._ssrLabelOk(l, w);
      if (w.classList.contains('td-field__control')) return this._ssrControlOk(l, w, first);
      return this._ssrFooterOk(l, w);
    });
  }

  /** @private Internal label: same attributes, the label text, then at most the required star. */
  _ssrLabelOk(l, w) {
    if (l.localName !== 'label' || !ssrSameAttrs(l, w)) return false;
    const nodes = ssrContentNodes(l);
    const star = nodes.length && nodes[nodes.length - 1].nodeType === 1 ? nodes.pop() : null;
    if (nodes.some((n) => n.nodeType !== 3) || nodes.map((n) => n.data).join('') !== w.textContent) return false;
    if (!!star !== this.hasAttribute('required')) return false; // review round 1 IMPL-4: star ⇔ required
    return !star || (star.localName === 'span' && ssrClassKey(star) === 'td-field__required' && star.attributes.length === 2
      && star.getAttribute('aria-hidden') === 'true' && star.children.length === 0 && star.textContent === ' *');
  }

  /** @private The control: structure + attribute allowlist (see _markupMatches). */
  _ssrControlOk(c, w, first) {
    if (c.localName !== w.localName || ssrClassKey(c) !== 'td-field__control' || c.id !== w.id) return false;
    if (c.getAttribute('maxlength') !== w.getAttribute('maxlength')) return false;
    const type = this._type();
    if (c.localName === 'textarea') {
      if (c.children.length || c.getAttribute('rows') !== w.getAttribute('rows')
        || c.hasAttribute('data-autoresize') !== w.hasAttribute('data-autoresize')) return false;
    } else {
      const t = c.getAttribute('type');
      if (t !== w.getAttribute('type') && !(first && t === SSR_NATIVE_TYPE[type])) return false;
    }
    const keep = SSR_KEEP[type] || [];
    const ssrOnly = [...SSR_ONLY, ...SSR_CONSTRAINTS.filter((a) => !keep.includes(a))];
    return [...c.attributes].every(({ name }) => ((SSR_CONTROL_ATTRS.has(name) && name !== 'checked' && (first || !ssrOnly.includes(name)))
      || SSR_ARIA_DATA.test(name)) && !(name === 'data-autoresize' && c.localName !== 'textarea'));
  }

  /** @private Footer: [base error note] + helper note + [counter] (text only), ids derived from the host id. */
  _ssrFooterOk(f, w) {
    if (f.localName !== 'div' || ssrClassKey(f) !== 'td-field__footer'
      || ![...f.attributes].every((a) => a.name === 'class' || a.name === 'hidden')) return false;
    const have = ssrContentNodes(f);
    const note = have.length > 0 && ssrIsErrorNote(have[0]);
    if (note !== !!this.errorMessage) return false; // review round 1 IMPL-4: error note ⇔ an error is shown
    if (note) have.shift();
    const need = [...w.children];
    if (have.length !== need.length) return false;
    const allowed = { 'td-field__note': ['class', 'id', 'hidden'], 'td-field__counter': ['class', 'id', 'data-state'] };
    return need.every((x, i) => {
      const n = have[i];
      const cls = ssrClassKey(x);
      return n.nodeType === 1 && n.localName === 'div' && ssrClassKey(n) === cls && n.id === x.id && n.children.length === 0
        && [...n.attributes].every((a) => allowed[cls]?.includes(a.name));
    });
  }

  _restoreDefaults() {
    this._userEdited = false;
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
    return `${this._countValue(value, this._limitType())}/${this._maxLength()} ${this._unit()}`;
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

  /**
   * The LIVE value (what the user typed), like a native input's `value` property — v0.16.0; before that it
   * returned the (stale) attribute. Setting it = setValue() (the `value` attribute stays the initial value).
   * @type {string}
   */
  get value() { return this.getValue(); }
  set value(v) { this.setValue(v); }

  /** @returns {string} the current value (before the first render: the `value` attribute) */
  getValue() {
    return this._getFieldElement() ? this._getValue() : (this.getAttribute('value') ?? '');
  }

  /**
   * Set the value (truncated to `max-length`). Does not fire `input`/`change`.
   * @param {string} val
   */
  setValue(val) {
    // v0.26.0: a value assigned before upgrade (replayed during the first connect) is remembered as given — SSR hydrate
    // applies it to the adopted control after its type is normalised (a native number control would sanitise it).
    if (!this._initialized) this._earlyValue = val == null ? '' : String(val);
    const field = this._getFieldElement();
    if (!field) {
      if (val == null) this.removeAttribute('value');
      else this.setAttribute('value', String(val)); // rendered on connect
      return;
    }
    this._userEdited = false; // programmatic value: native clears the "user edit" flag (no tooShort)
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
