import {
  TdFormElement, ssrClassKey, ssrContentNodes, ssrSameAttrs, ssrSamePart, ssrIsErrorNote, SSR_ARIA_DATA, SSR_CONTROL_ATTRS,
} from '../base/td-form-element.js';
import { ssrMarker } from '../base/td-base-element.js';
import {
  asciiDigit, parseCanonical, format, edit, parseLoose, compare, clamp, step as stepValue, stepAligned, fromNumberString,
  MAX_DIGITS,
} from '../utils/number-format.js';

/** Attributes of the server-rendered control that exist only for the no-JS form (removed on hydrate). */
const SSR_ONLY = ['name', 'value', 'min', 'max', 'step', 'required'];
const INPUT_MODES = ['none', 'text', 'decimal', 'numeric', 'tel', 'search', 'email', 'url'];
const GROUPS = ['.', ',', ' ', ''];

/**
 * <td-number-input> — a formatted number / money field (v0.30.0, plan docs/internal/plans/v0.30.0-number-repeater.md
 * M2). Token-native: needs td.css (src/styles/components/number-input.css + the field classes). Form-associated.
 *
 * - Shows grouped digits (`12.990.000`), submits the CANONICAL value (`12990000`: `-?(0|[1-9]\d*)(\.\d+)?`, at most
 *   30 digits, computed with BigInt — never `Number`). Rules live in src/utils/number-format.js (pure, node tests).
 * - A plain textbox (`<input type="text" inputmode>`), not a spinbutton; ↑ / ↓ = `step`, PageUp / PageDown = ×10
 *   (clamped). Prefix / suffix are decorative text (`aria-hidden`); the unit is read through `aria-describedby`.
 * - Typing never moves the caret oddly: structurally wrong insertions are cancelled in `beforeinput` (2nd decimal,
 *   misplaced / forbidden minus, decimal digit past `decimals`, 31st digit, any other character); Backspace / Delete
 *   over a group separator removes the digit beyond it; every other change is normalised by `edit()` (IME, Android,
 *   autofill). Paste: digits only → inserted at the selection (refused past 30 digits / `decimals`), anything else →
 *   `parseLoose()` replaces the whole value or is refused (live region). Drop is blocked.
 * - Out of range: reported (`rangeUnderflow` / `rangeOverflow`), never fixed silently; `clamp` (opt-in) clamps on blur
 *   and announces it. `min` absent = implicit floor 0 (no negatives). Empty ≠ 0 (submits `''`).
 * - Events (user only): the inner native `input` / `change` stop at the host; the host fires `input` `{ value }` when
 *   the canonical value changes and `change` `{ value }` on blur when it differs from the value at focus.
 * - SSR (ADR 0012, contract `number-input@1`): PHP element mode prints a native `type=number` control with the
 *   canonical value; it is adopted IN PLACE (same node: value + focus kept; type → text, no-JS attributes removed,
 *   display formatted — the caret is not restored). Anything else → safe render at once + value / focus restored.
 *
 * DOM contract:
 *   <td-number-input id="{h}">
 *     <div class="td-field td-field--{sm|md|lg} td-number">
 *       [<label class="td-field__label" id="{h}-label" for="{h}-control">…[<span class="td-field__required" aria-hidden="true"> *</span>]</label>]
 *       <div class="td-number__box">
 *         [<span class="td-number__affix td-number__affix--prefix" aria-hidden="true">$</span>]
 *         <input type="text" class="td-number__control" id="{h}-control" inputmode autocomplete="off" spellcheck="false">
 *         [<span class="td-number__affix td-number__affix--suffix" aria-hidden="true">₫</span>]
 *         [<span id="{h}-unit" hidden>{unit-label | suffix | prefix}</span>]
 *       </div>
 *       <div class="td-field__footer" [hidden]>[error note]<div class="td-field__note" id="{h}-note" [hidden]>…</div></div>
 *       <span class="td-sr-only" id="{h}-status" role="status"></span>
 *     </div>
 *   </td-number-input>
 *
 * @element td-number-input
 * @attr {string} name
 * @attr {string} value - default value, canonical (`1500`, `12.5`); later changes set the live value too
 * @attr {string} label / placeholder / helper-text / error-text / aria-label
 * @attr {string} size - sm|md|lg (default md)
 * @attr {boolean} required / disabled / readonly / clamp
 * @attr {string} min / max / step - canonical; `step` > 0
 * @attr {number} decimals - 0..10 (default 0): maximum fraction digits
 * @attr {string} group-separator - `.` | `,` | ` ` | `` (default `.`)
 * @attr {string} decimal-separator - `,` | `.` (default `,`; `.` when the group is `,`)
 * @attr {string} prefix / suffix - decorative unit text; unit-label - the unit as read aloud (e.g. `đồng`)
 * @attr {string} inputmode - overrides the derived keyboard hint
 * @attr {string} validate-on - blur|change|input
 * @fires input - detail: { value } — the canonical value changed (user)
 * @fires change - detail: { value } — on blur, when it differs from the value at focus
 */
export class TdNumberInput extends TdFormElement {
  /** v0.30.0: adopts PHP element-mode markup in place (`number-input@1`); a hydrated element re-binds on re-connect. */
  static hydratable = true;

  /**
   * Texts (Vietnamese); override per site. `{min}` / `{max}` are formatted with the unit ("1.000 ₫"); `{step}`,
   * `{decimals}`, `{value}` (formatted + unit).
   */
  static messages = {
    valueMissing: 'Trường này là bắt buộc',
    badInput: 'Giá trị không hợp lệ',
    rangeUnderflow: 'Giá trị tối thiểu là {min}',
    rangeOverflow: 'Giá trị tối đa là {max}',
    stepMismatch: 'Giá trị phải theo bước {step}',
    tooManyDecimals: 'Tối đa {decimals} chữ số thập phân',
    pasteRejected: 'Không dán được: giá trị không hợp lệ',
    clamped: 'Đã chỉnh về {value}',
  };

  static get observedAttributes() {
    return [...super.observedAttributes, 'value', 'label', 'placeholder', 'helper-text', 'error-text', 'size', 'readonly',
      'min', 'max', 'step', 'decimals', 'group-separator', 'decimal-separator', 'prefix', 'suffix', 'unit-label', 'clamp',
      'inputmode', 'validate-on', 'aria-label'];
  }

  static get booleanAttributes() { return [...super.booleanAttributes, 'readonly', 'clamp']; }

  static get errorContract() { return true; }

  /** @private attributes that change the DOM structure → re-render */
  static _structural = new Set(['label', 'size', 'prefix', 'suffix', 'unit-label']);

  constructor() {
    super();
    /** @type {string} canonical live value ('' = empty) */
    this._value = '';
    this._valueSet = false;
    /** @private a lone `-` / decimal is in the field (badInput, value '') */
    this._bad = false;
    this._valueAtFocus = null;
    this._warned = new Set();
    this._runtimeHelper = null;
  }

  connectedCallback() {
    if (!this._initialized && !this._valueSet) this._value = this._canonAttr('value') ?? '';
    super.connectedCallback();
  }

  // --- resolved options ---

  /** @private @returns {number} 0..10 */
  _decimals() {
    const raw = this.getAttribute('decimals');
    if (raw == null || raw === '') return 0;
    const n = Number(raw);
    if (Number.isInteger(n) && n >= 0 && n <= 10) return n;
    this._warnOnce(`decimals:${raw}`, `td-number-input: decimals="${raw}" is not an integer 0–10 — 0 is used.`);
    return 0;
  }

  /** @private */
  _group() {
    const raw = this.getAttribute('group-separator');
    if (raw == null) return '.';
    if (GROUPS.includes(raw)) return raw;
    this._warnOnce(`group:${raw}`, `td-number-input: group-separator="${raw}" must be ".", ",", " " or "" — "." is used.`);
    return '.';
  }

  /** @private */
  _decimalSep() {
    const group = this._group();
    const fallback = group === ',' ? '.' : ',';
    const raw = this.getAttribute('decimal-separator');
    if (raw == null) return fallback;
    if ((raw === ',' || raw === '.') && raw !== group) return raw;
    this._warnOnce(`decsep:${raw}:${group}`, `td-number-input: decimal-separator="${raw}" is invalid or equals the group separator — "${fallback}" is used.`);
    return fallback;
  }

  /** @private canonical attribute through the one gate; invalid → null + one warning */
  _canonAttr(name) {
    const raw = this.getAttribute(name);
    if (raw == null || raw === '') return null;
    const d = this._decimals();
    const v = parseCanonical(raw, d);
    if (v == null) {
      this._warnOnce(`${name}:${raw}:${d}`, `td-number-input: ${name}="${raw}" is not a canonical number with at most ${d} decimals / ${MAX_DIGITS} digits — ignored.`);
    }
    return v;
  }

  /** @private explicit min (null = absent / invalid) */
  _minAttr() { return this._canonAttr('min'); }

  /** @private effective min: implicit floor 0 when absent (decision 5) */
  _min() { return this._minAttr() ?? '0'; }

  /** @private */
  _max() { return this._canonAttr('max'); }

  /** @private valid step (> 0) or null */
  _stepAttr() {
    const v = this._canonAttr('step');
    if (v == null) return null;
    if (compare(v, '0') <= 0) {
      this._warnOnce(`step>0:${v}`, `td-number-input: step="${v}" must be > 0 — ignored.`);
      return null;
    }
    return v;
  }

  /** @private */
  _negative() { return compare(this._min(), '0') < 0; }

  /** @private options for number-format */
  _opts() {
    return {
      group: this._group(), decimal: this._decimalSep(), decimals: this._decimals(), negative: this._negative(),
      prefix: this.getAttribute('prefix') || '', suffix: this.getAttribute('suffix') || '',
    };
  }

  /** @private @returns {'sm'|'md'|'lg'} */
  _size() {
    const s = this.getAttribute('size');
    return s === 'sm' || s === 'lg' ? s : 'md';
  }

  /** @private keyboard hint: host value wins, else numeric / decimal / text (negatives: iOS numeric pads lack "-") */
  _inputMode() {
    const host = (this.getAttribute('inputmode') || '').trim().toLowerCase();
    if (INPUT_MODES.includes(host)) return host;
    if (this._negative()) return 'text';
    return this._decimals() > 0 ? 'decimal' : 'numeric';
  }

  /** @private unit read aloud: unit-label → suffix → prefix */
  _unitText() {
    return this.getAttribute('unit-label') || this.getAttribute('suffix') || this.getAttribute('prefix') || '';
  }

  /** @private formatted value + affixes for messages ("1.000 ₫", "$5") */
  _withUnit(v) {
    const prefix = this.getAttribute('prefix') || '';
    const suffix = this.getAttribute('suffix') || '';
    return `${prefix}${format(v, this._opts())}${suffix ? ` ${suffix}` : ''}`;
  }

  /** @private @returns {string} id of the control */
  _controlId() {
    return this._ssrControlId || `${this.id}-control`;
  }

  // --- render ---

  render() {
    const esc = (v) => this.escapeHtml(v);
    const id = esc(this.id);
    const cid = esc(this._controlId());
    const label = this.getAttribute('label') || '';
    const prefix = this.getAttribute('prefix') || '';
    const suffix = this.getAttribute('suffix') || '';
    const unit = this._unitText();
    return `<div class="td-field td-field--${this._size()} td-number">`
      + (label ? `<label class="td-field__label" id="${id}-label" for="${cid}">${esc(label)}</label>` : '')
      + '<div class="td-number__box">'
      + (prefix ? `<span class="td-number__affix td-number__affix--prefix" aria-hidden="true">${esc(prefix)}</span>` : '')
      + `<input type="text" class="td-number__control" id="${cid}" inputmode="${esc(this._inputMode())}" autocomplete="off" spellcheck="false">`
      + (suffix ? `<span class="td-number__affix td-number__affix--suffix" aria-hidden="true">${esc(suffix)}</span>` : '')
      + (unit ? `<span id="${id}-unit" hidden>${esc(unit)}</span>` : '')
      + '</div>'
      + `<div class="td-field__footer"><div class="td-field__note" id="${id}-note" hidden></div></div>`
      + `<span class="td-sr-only" id="${id}-status" role="status"></span>`
      + '</div>';
  }

  afterRender() {
    const c = this._focusTarget();
    if (!c) return;
    this.listen(c, 'beforeinput', (e) => this._onBeforeInput(/** @type {InputEvent} */ (e)));
    this.listen(c, 'input', (e) => this._onInput(/** @type {InputEvent} */ (e)));
    this.listen(c, 'change', (e) => e.stopPropagation()); // the host fires its own `change` on blur
    this.listen(c, 'keydown', (e) => this._onKeydown(/** @type {KeyboardEvent} */ (e)));
    this.listen(c, 'paste', (e) => this._onPaste(/** @type {ClipboardEvent} */ (e)));
    this.listen(c, 'drop', (e) => e.preventDefault());
    this.listen(c, 'compositionend', () => this._applyEdit(c.value, c.selectionStart ?? c.value.length));
    this.listen(c, 'focus', () => { this._valueAtFocus = this._value; });
    this.listen(c, 'blur', () => this._onBlur());
    // a press on the box / an affix focuses the control (the box is what looks like the field)
    const box = c.parentElement;
    if (box) {
      this.listen(box, 'mousedown', (e) => {
        if (e.target === c || c.disabled) return;
        e.preventDefault();
        c.focus();
      });
    }
    this._paintValue();
    this._applyPlaceholder();
    this._applyInteractivity();
    this._applyInputMode();
    this._applyRequired();
    this._applyName();
    this._applyHelper();
    this._syncForm();
    this._applyErrorState();
  }

  // --- in-place attribute handling ---

  attributeChangedCallback(name, oldVal, newVal) {
    if (oldVal === newVal || !this._initialized || !this._focusTarget()) {
      super.attributeChangedCallback(name, oldVal, newVal);
      return;
    }
    if (TdNumberInput._structural.has(name)) {
      super.attributeChangedCallback(name, oldVal, newVal); // re-render (value kept: render paints this._value)
      return;
    }
    switch (name) {
      case 'error-text':
        super.attributeChangedCallback(name, oldVal, newVal);
        return;
      case 'value':
        this.setValue(newVal ?? '');
        return;
      case 'placeholder':
        this._applyPlaceholder();
        return;
      case 'helper-text':
        this._runtimeHelper = null;
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
      case 'aria-label':
        this._applyName();
        return;
      case 'inputmode':
        this._applyInputMode();
        return;
      case 'min':
      case 'max':
      case 'step':
      case 'decimals':
      case 'group-separator':
      case 'decimal-separator':
        if (name === 'decimals') { this._minAttr(); this._max(); this._stepAttr(); } // re-checked now (warn once)
        this._bad = false;
        this._paintValue();
        this._applyInputMode();
        this._syncForm();
        return;
      default: // name, clamp, validate-on: read on demand
    }
  }

  /** Ancestor `<fieldset disabled>` toggled: update in place (focus kept). */
  formDisabledCallback(disabled) {
    this._ancestorDisabled = !!disabled;
    this._effectiveDisabled = this.hasAttribute('disabled') || this._ancestorDisabled;
    if (this._initialized && this._focusTarget()) {
      this._applyInteractivity();
      this._syncForm();
    }
  }

  /** @private display = formatted canonical value */
  _paintValue() {
    const c = this._focusTarget();
    if (!c) return;
    const display = format(this._value, this._opts());
    if (c.value !== display) c.value = display;
  }

  /** @private */
  _applyPlaceholder() {
    const c = this._focusTarget();
    if (!c) return;
    const ph = this.getAttribute('placeholder') || '';
    if (ph) c.setAttribute('placeholder', ph);
    else c.removeAttribute('placeholder');
  }

  /** @private */
  _applyInteractivity() {
    const c = this._focusTarget();
    if (!c) return;
    c.disabled = this._effectiveDisabled;
    c.readOnly = this.hasAttribute('readonly');
  }

  /** @private */
  _applyInputMode() {
    this._focusTarget()?.setAttribute('inputmode', this._inputMode());
  }

  /** @private `aria-required` + the decorative star in the label (in place) */
  _applyRequired() {
    const c = this._focusTarget();
    const required = this.hasAttribute('required');
    if (c) {
      if (required) c.setAttribute('aria-required', 'true');
      else c.removeAttribute('aria-required');
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

  /** @private */
  _applyName() {
    this._applyAccessibleName(this._focusTarget(), !!this.getAttribute('label'));
  }

  /** @private @returns {string} */
  _effectiveHelper() {
    if (this._runtimeHelper != null) return this._runtimeHelper;
    return this.getAttribute('helper-text') || '';
  }

  /** @private */
  _applyHelper() {
    const note = this.querySelector('.td-field__note');
    if (!note) return;
    const text = this._effectiveHelper();
    note.textContent = text;
    note.hidden = !text;
    this._syncDescribedBy();
    this._syncFooter();
  }

  /** @private */
  _syncFooter() {
    const footer = this.querySelector('.td-field__footer');
    if (footer) footer.hidden = ![...footer.children].some((c) => !c.hidden);
  }

  /** @protected the error note goes first in the footer */
  _mountErrorNote(note) {
    const footer = this.querySelector('.td-field__footer');
    if (footer) footer.prepend(note);
    else super._mountErrorNote(note);
  }

  /** @protected unit + note ids (the base adds the error id) */
  _describedByIds() {
    const ids = [];
    if (this._unitText() && this.querySelector('.td-number__box > span[hidden]')) ids.push(`${this.id}-unit`);
    if (this._effectiveHelper() && this.querySelector('.td-field__note')) ids.push(`${this.id}-note`);
    return ids;
  }

  /** @protected */
  _applyErrorState() {
    super._applyErrorState();
    this._syncFooter();
  }

  // --- typing ---

  /** @private is the control editable by the user right now? */
  _editable() {
    const c = this._focusTarget();
    return !!c && !c.disabled && !c.readOnly;
  }

  /**
   * @private Would replacing [s, e) of the field with `data` keep a well-formed number? (group characters of the
   * current display are ignored; the inserted text must not contain any.)
   */
  _structureOk(raw, s, e, data) {
    const o = this._opts();
    const strip = (t) => [...t].filter((ch) => !(o.group && ch === o.group)).join('');
    const cand = strip(raw.slice(0, s)) + data + strip(raw.slice(e));
    let digits = 0;
    let frac = 0;
    let seenDec = false;
    let i = 0;
    for (const ch of cand) {
      if (asciiDigit(ch) != null) {
        digits += 1;
        if (seenDec) frac += 1;
      } else if (ch === o.decimal && o.decimals > 0 && !seenDec) {
        seenDec = true;
      } else if ((ch === '-' || ch === '−') && o.negative && i === 0) {
        // leading minus
      } else {
        return false;
      }
      i += 1;
    }
    return digits <= MAX_DIGITS && frac <= o.decimals;
  }

  /** @private */
  _onBeforeInput(e) {
    if (e.isComposing) return;
    const c = /** @type {HTMLInputElement} */ (e.target);
    const s = c.selectionStart ?? c.value.length;
    const end = c.selectionEnd ?? s;
    const t = e.inputType;
    if (t === 'insertText' && e.data != null) {
      if (!this._structureOk(c.value, s, end, e.data)) e.preventDefault();
      return;
    }
    if (t === 'insertFromDrop') { e.preventDefault(); return; }
    const group = this._group();
    if (!group || s !== end) return;
    if (t === 'deleteContentBackward' && s >= 2 && c.value[s - 1] === group) {
      e.preventDefault();
      this._applyEdit(c.value.slice(0, s - 2) + c.value.slice(s), s - 2);
    } else if (t === 'deleteContentForward' && c.value[s] === group && s + 1 < c.value.length) {
      e.preventDefault();
      this._applyEdit(c.value.slice(0, s + 1) + c.value.slice(s + 2), s + 1);
    }
  }

  /** @private */
  _onInput(e) {
    e.stopPropagation(); // one event: the host's CustomEvent (_applyEdit)
    if (e.isComposing) return;
    const c = /** @type {HTMLInputElement} */ (e.target);
    if (!e.inputType || e.inputType === 'insertReplacementText') {
      // autofill / replacement: the whole value, exact, refused rather than guessed
      const v = parseLoose(c.value, this._opts());
      if (v == null) { this._paintBack(); return; }
      this._commitValue(v, true);
      return;
    }
    this._applyEdit(c.value, c.selectionStart ?? c.value.length);
  }

  /** @private normalise `raw` (edit()), write it back with the caret, update the value; fires `input` on change */
  _applyEdit(raw, caret) {
    const c = this._focusTarget();
    if (!c) return;
    const r = edit(raw, caret, this._opts());
    if (c.value !== r.display) c.value = r.display;
    if (c.ownerDocument.activeElement === c) {
      try { c.setSelectionRange(r.caret, r.caret); } catch { /* ignore */ }
    }
    const changed = r.value !== this._value;
    this._value = r.value;
    this._valueSet = true;
    this._bad = r.bad;
    this._syncForm();
    if (this.getAttribute('validate-on') === 'input') this._showInlineValidity();
    if (changed) this.emit('input', { value: r.value });
  }

  /** @private set a whole new canonical value from the user (paste / autofill / step): display + caret at the end */
  _commitValue(v, user) {
    const c = this._focusTarget();
    const changed = v !== this._value;
    this._value = v;
    this._valueSet = true;
    this._bad = false;
    this._paintValue();
    if (c && c.ownerDocument.activeElement === c) {
      try { c.setSelectionRange(c.value.length, c.value.length); } catch { /* ignore */ }
    }
    this._syncForm();
    if (user && this.getAttribute('validate-on') === 'input') this._showInlineValidity();
    if (user && changed) this.emit('input', { value: v });
  }

  /** @private refused change: the field shows the current value again */
  _paintBack() {
    this._paintValue();
    const c = this._focusTarget();
    if (c && c.ownerDocument.activeElement === c) {
      try { c.setSelectionRange(c.value.length, c.value.length); } catch { /* ignore */ }
    }
  }

  /** @private */
  _onKeydown(e) {
    if (e.isComposing || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.code === 'NumpadDecimal' && e.key !== 'Delete') {
      e.preventDefault();
      if (this._decimals() > 0 && this._editable()) this._insertText(this._decimalSep());
      return;
    }
    const dir = { ArrowUp: 1, ArrowDown: -1, PageUp: 10, PageDown: -10 }[e.key];
    if (!dir || e.shiftKey) return; // Shift+↑ / ↓ keeps the native selection
    e.preventDefault();
    if (!this._editable()) return;
    const min = this._min();
    const next = stepValue(this._value, dir, { step: this._stepAttr() || '1', base: min, min, max: this._max() });
    // same gate as typing: a result past 30 digits (or `decimals`) is refused, the value stays
    if (parseCanonical(next, this._decimals()) == null) return;
    this._commitValue(next, true);
  }

  /** @private type `text` at the selection through the same structural check + edit() */
  _insertText(text) {
    const c = this._focusTarget();
    if (!c) return;
    const s = c.selectionStart ?? c.value.length;
    const end = c.selectionEnd ?? s;
    if (!this._structureOk(c.value, s, end, text)) return;
    this._applyEdit(c.value.slice(0, s) + text + c.value.slice(end), s + text.length);
  }

  /** @private */
  _onPaste(e) {
    e.preventDefault();
    if (!this._editable()) return;
    const text = e.clipboardData ? e.clipboardData.getData('text/plain') : '';
    const c = this._focusTarget();
    const chars = [...text];
    if (chars.length && chars.every((ch) => asciiDigit(ch) != null)) {
      const digits = chars.map(asciiDigit).join('');
      const s = c.selectionStart ?? c.value.length;
      const end = c.selectionEnd ?? s;
      if (!this._structureOk(c.value, s, end, digits)) { this._announce(this._msg('pasteRejected')); return; }
      this._applyEdit(c.value.slice(0, s) + digits + c.value.slice(end), s + digits.length);
      return;
    }
    const v = parseLoose(text, this._opts());
    if (v == null) { this._announce(this._msg('pasteRejected')); return; }
    this._commitValue(v, true);
  }

  /** @private commit: `12,` → 12, lone `-` → empty, clamp (opt-in), validate-on, `change` */
  _onBlur() {
    let v = this._value;
    let clamped = false;
    if (this.hasAttribute('clamp') && v) {
      const next = clamp(v, this._min(), this._max());
      if (next !== v) { v = next; clamped = true; }
    }
    const changed = v !== this._value;
    this._value = v;
    this._bad = false;
    this._paintValue();
    this._syncForm();
    if (changed) this.emit('input', { value: v });
    if (clamped) this._announce(this._msg('clamped', { value: this._withUnit(v) }));
    const mode = this.getAttribute('validate-on');
    if (mode === 'blur' || mode === 'change') this._showInlineValidity();
    const atFocus = this._valueAtFocus;
    this._valueAtFocus = null;
    if (atFocus !== null && v !== atFocus) this.emit('change', { value: v });
  }

  /** @private live region (text); cleared first so the same message is announced again */
  _announce(text) {
    const s = this.querySelector('.td-number > [role="status"]');
    if (!s) return;
    s.textContent = '';
    s.textContent = text;
  }

  // --- form participation ---

  /** @private */
  _syncForm() {
    this._setFormValue(this._value, this._value);
    const { flags, message } = this._computeValidity();
    this._setValidity(flags, message, this._focusTarget() || undefined);
  }

  /** @private */
  _computeValidity() {
    const v = this._value;
    const M = (k, vars) => this._msg(k, vars);
    if (this._bad) return { flags: { badInput: true }, message: M('badInput') };
    if (!v) return this.hasAttribute('required') ? { flags: { valueMissing: true }, message: M('valueMissing') } : { flags: {}, message: '' };
    const decimals = this._decimals();
    const frac = v.includes('.') ? v.length - v.indexOf('.') - 1 : 0;
    if (frac > decimals) return { flags: { badInput: true }, message: M('tooManyDecimals', { decimals }) };
    const min = this._min();
    const max = this._max();
    if (compare(v, min) < 0) return { flags: { rangeUnderflow: true }, message: M('rangeUnderflow', { min: this._withUnit(min) }) };
    if (max && compare(v, max) > 0) return { flags: { rangeOverflow: true }, message: M('rangeOverflow', { max: this._withUnit(max) }) };
    const st = this._stepAttr();
    if (st && !stepAligned(v, st, min)) {
      return { flags: { stepMismatch: true }, message: M('stepMismatch', { step: format(st, this._opts()) }) };
    }
    return { flags: {}, message: '' };
  }

  /** @private */
  _showInlineValidity() {
    this.setError(this._computeValidity().message || '');
  }

  _captureDefaults() {
    this._defaultValue = this._ssrDefaults ? this._ssrDefaults.value : (this._canonAttr('value') ?? '');
  }

  /**
   * Form reset: the captured default is already canonical — restored as is (no precision gate: a default kept after
   * `decimals` was reduced stays, with badInput), silently.
   */
  _restoreDefaults() {
    this._value = this._defaultValue;
    this._valueSet = true;
    this._bad = false;
    if (!this._initialized) return;
    this._paintValue();
    const c = this._focusTarget();
    if (c && c.ownerDocument.activeElement === c) this._valueAtFocus = this._value; // programmatic ≠ user change
    this._syncForm();
  }

  _restoreState(state) {
    if (typeof state === 'string') this.setValue(state);
  }

  _focusTarget() {
    return this.querySelector('input.td-number__control');
  }

  // --- public API ---

  /** @type {string} the canonical value ('' = empty); setting it = setValue() */
  get value() { return this._value; }
  set value(v) { this.setValue(v); }

  /** @returns {number} Number(value) — convenience only, inexact past Number.MAX_SAFE_INTEGER; NaN when empty */
  get valueAsNumber() { return this._value ? Number(this._value) : Number.NaN; }

  /** @returns {string} */
  getValue() { return this._value; }

  /**
   * Set the value (no event). A canonical string with at most `decimals` fraction digits, or a finite number that
   * `String()` writes without an exponent; '' / null clears; anything else → '' + one warning.
   * @param {string|number|null|undefined} v
   */
  setValue(v) {
    let next = '';
    if (v != null && v !== '') {
      const d = this._decimals();
      let str = null;
      if (typeof v === 'number') {
        if (Number.isFinite(v) && (Number.isSafeInteger(v) || !/e/i.test(String(v)))) str = String(v);
      } else str = String(v);
      next = str == null ? null : parseCanonical(str, d);
      if (next == null) {
        this._warnOnce(`set:${String(v)}:${d}`, `td-number-input: value ${JSON.stringify(String(v))} is not a canonical number with at most ${d} decimals / ${MAX_DIGITS} digits — cleared.`);
        next = '';
      }
    }
    this._value = next;
    this._valueSet = true;
    this._bad = false;
    if (!this._initialized) return;
    this._paintValue();
    const c = this._focusTarget();
    if (c && c.ownerDocument.activeElement === c) this._valueAtFocus = next; // programmatic ≠ user change
    this._syncForm();
  }

  /** @param {string} msg helper text ('' clears; a later `helper-text` attribute replaces it) */
  setHelper(msg) {
    this._runtimeHelper = msg ? String(msg) : '';
    this._applyHelper();
  }

  /** @private */
  _warnOnce(key, msg) {
    if (this._warned.has(key)) return;
    this._warned.add(key);
    console.warn(msg, this);
  }

  // --- SSR hydrate (v0.30.0, ADR 0012, contract number-input@1) ---

  /**
   * Marker `number-input@<n>` + the control at its skeleton slot → capture its state; adopt the markup only when the
   * schema is 1, it is exactly render()'s (the control may still be the native `type=number` with the no-JS
   * attributes), those attributes agree with the host and it passes the subtree scan + skeleton.
   * @returns {boolean}
   */
  canHydrate() {
    const m = ssrMarker(this);
    if (!m || m.name !== 'number-input') return false;
    const control = this._ssrStateSource();
    if (!control) return this._ssrClean(false);
    this._ssrDefaults = { value: fromNumberString(control.defaultValue) ?? '' };
    this._ssrControlId = control.id || null;
    const matches = m.schema === 1 && this._markupMatches(true)
      && this._ssrFormAttrsAgree(control, [['name', 'name'], ['required', 'required'], ['disabled', 'disabled'], ['readonly', 'readonly']],
        ['required', 'disabled', 'readonly'])
      && this._ssrRangeAgrees(control);
    return this._ssrDecide(control, matches, false);
  }

  /** Re-connect of a HYDRATED element: re-bind in place while the markup is still the component's own. */
  canRebind() {
    return this._ssrRevalidate(this._ssrStateSource());
  }

  /** @private a native control's min / max / step are exactly what php/td.php prints for this host */
  _ssrRangeAgrees(control) {
    if (control.getAttribute('type') !== 'number') return !['min', 'max', 'step'].some((a) => control.hasAttribute(a));
    const d = this._decimals();
    const want = {
      min: this._min(),
      max: this._max(),
      step: this._stepAttr() || (d ? `0.${'0'.repeat(d - 1)}1` : '1'),
    };
    return ['min', 'max', 'step'].every((a) => (control.getAttribute(a) ?? null) === (want[a] ?? null));
  }

  /** @protected `div.td-field.td-number` > `div.td-number__box` > `input.td-number__control` — each unique */
  _ssrSlotControl() {
    const one = (parent, tag, cls) => {
      const c = [...parent.children].filter((e) => e.localName === tag && e.classList.contains(cls));
      return c.length === 1 ? c[0] : null;
    };
    const root = one(this, 'div', 'td-number');
    const box = root && one(root, 'div', 'td-number__box');
    return box ? one(box, 'input', 'td-number__control') : null;
  }

  /** @protected */
  _ssrPlausible() { return 'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="file"])'; }

  /** @protected */
  _ssrCapture(control, live) {
    const focused = control === control.ownerDocument.activeElement;
    const early = !live && this._earlyProps?.has('value');
    return { value: early ? this._value : (fromNumberString(control.value) ?? ''), focused, early };
  }

  hydrateExisting() {
    const control = /** @type {HTMLInputElement} */ (this._ssrControl);
    const state = this._ssrState;
    this._value = state.value;
    this._valueSet = true;
    if (control.type !== 'text') control.type = 'text'; // same node
    control.value = format(state.value, this._opts()); // also makes the value dirty: removing `value` changes nothing
    if (state.focused && control.ownerDocument.activeElement !== control) control.focus({ preventScroll: true });
    // focus baseline: an early property is programmatic (no `change` for it); a value typed into the native control
    // before define is the user's → compared with the server default
    if (state.focused && this._valueAtFocus == null) this._valueAtFocus = state.early ? state.value : (this._ssrDefaults?.value ?? state.value);
    const own = new Set([`${this.id}-unit`, `${this.id}-note`, `${this.id}-error`]);
    const rest = (control.getAttribute('aria-describedby') || '').split(/\s+/).filter((t) => t && !own.has(t));
    if (rest.length) control.setAttribute('aria-describedby', rest.join(' '));
    else control.removeAttribute('aria-describedby');
    const note = this.querySelector('.td-field__footer > .td-field-error');
    if (note) this._errorNote = note;
    this._syncForm(); // ElementInternals FIRST…
    for (const a of SSR_ONLY) control.removeAttribute(a); // …then the no-JS attributes: FormData has ONE entry
    this._ssrRetargetLabels(control);
    this._ssrControl = null;
    this._ssrState = null;
  }

  /** @protected */
  _restoreSsrState(state) {
    const c = this._focusTarget();
    if (!state.clean) {
      this._value = state.value;
      this._valueSet = true;
      this._paintValue();
      this._syncForm();
    }
    if (state.refocus && c) c.focus({ preventScroll: true });
  }

  /**
   * @protected The known skeleton — one `div.td-field.td-number` > [optional label (text + at most the star), the box
   * holding THIS control, the footer (text-only error note / note), the status span].
   */
  _ssrSkeletonOk() {
    const kids = ssrContentNodes(this);
    if (kids.length !== 1 || kids[0].nodeType !== 1 || kids[0].localName !== 'div' || !kids[0].classList.contains('td-number')) return false;
    const parts = ssrContentNodes(kids[0]);
    if (parts.some((n) => n.nodeType !== 1)) return false;
    const i = parts[0]?.localName === 'label' ? 1 : 0;
    if (parts.length !== i + 3) return false;
    const [box, footer, live] = parts.slice(i);
    if (box.localName !== 'div' || !box.classList.contains('td-number__box') || this._ssrControl?.parentElement !== box) return false;
    if (footer.localName !== 'div' || !footer.classList.contains('td-field__footer')) return false;
    const seen = new Set();
    const footerOk = ssrContentNodes(footer).every((n) => {
      if (n.nodeType !== 1 || n.children.length) return false;
      const kind = ssrIsErrorNote(n) ? 'error' : n.localName === 'div' && n.classList.contains('td-field__note') ? 'note' : null;
      if (!kind || seen.has(kind)) return false;
      seen.add(kind);
      return true;
    });
    return footerOk && live.localName === 'span' && live.children.length === 0;
  }

  /**
   * @private Exactly render()'s tree for the current host attributes: wrapper, label (+ star ⇔ required), box (affixes
   * + unit compared exactly, the control: type text — or number on the first hydrate —, id, attribute allowlist),
   * footer (error note ⇔ an error shows, note), status span.
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
      if (w.classList.contains('td-number__box')) return this._ssrBoxOk(l, w, first);
      if (w.classList.contains('td-field__footer')) return this._ssrFooterOk(l);
      return l.localName === 'span' && ssrSameAttrs(l, w) && l.children.length === 0;
    });
  }

  /** @private */
  _ssrLabelOk(l, w) {
    if (l.localName !== 'label' || !ssrSameAttrs(l, w)) return false;
    const nodes = ssrContentNodes(l);
    const star = nodes.length && nodes[nodes.length - 1].nodeType === 1 ? nodes.pop() : null;
    if (nodes.some((n) => n.nodeType !== 3) || nodes.map((n) => n.data).join('') !== w.textContent) return false;
    if (!!star !== this.hasAttribute('required')) return false;
    return !star || (star.localName === 'span' && ssrClassKey(star) === 'td-field__required' && star.attributes.length === 2
      && star.getAttribute('aria-hidden') === 'true' && star.children.length === 0 && star.textContent === ' *');
  }

  /** @private */
  _ssrBoxOk(box, want, first) {
    if (box.localName !== 'div' || !ssrSameAttrs(box, want)) return false;
    const have = ssrContentNodes(box);
    const need = [...want.children];
    if (have.length !== need.length || have.some((n) => n.nodeType !== 1)) return false;
    return need.every((w, i) => {
      const c = have[i];
      if (!w.classList.contains('td-number__control')) return ssrSamePart(c, w);
      if (c.localName !== 'input' || ssrClassKey(c) !== 'td-number__control' || c.id !== w.id) return false;
      const t = c.getAttribute('type');
      if (t !== 'text' && !(first && t === 'number')) return false;
      const ok = (n) => (SSR_CONTROL_ATTRS.has(n) && n !== 'checked' && (first || !SSR_ONLY.includes(n))) || SSR_ARIA_DATA.test(n);
      return [...c.attributes].every((a) => ok(a.name));
    });
  }

  /** @private footer: [error note ⇔ an error shows] + the note (text only) */
  _ssrFooterOk(f) {
    if (f.localName !== 'div' || ssrClassKey(f) !== 'td-field__footer'
      || ![...f.attributes].every((a) => a.name === 'class' || a.name === 'hidden')) return false;
    const have = ssrContentNodes(f);
    const note = have.length > 0 && ssrIsErrorNote(have[0]);
    if (note !== !!this.errorMessage) return false;
    if (note) have.shift();
    return have.length === 1 && have[0].nodeType === 1 && have[0].localName === 'div' && ssrClassKey(have[0]) === 'td-field__note'
      && have[0].id === `${this.id}-note` && have[0].children.length === 0
      && [...have[0].attributes].every((a) => ['class', 'id', 'hidden'].includes(a.name));
  }
}

if (!customElements.get('td-number-input')) {
  customElements.define('td-number-input', TdNumberInput);
}
