import {
  TdFormElement, ssrClassKey, ssrContentNodes, ssrSameAttrs, ssrSamePart, ssrIsErrorNote, SSR_ARIA_DATA, SSR_CONTROL_ATTRS,
} from '../base/td-form-element.js';
import { ssrMarker } from '../base/td-base-element.js';
import {
  otpLength, otpCharset, otpCase, otpFilter, otpPattern, otpCellOk, otpInputAttrs, OTP_DEFAULT_LENGTH,
} from '../utils/otp.js';

const LENGTH = OTP_DEFAULT_LENGTH;
/** Attributes of the server-rendered input that exist only for the no-JS form (removed on hydrate). */
const SSR_ONLY = ['name', 'value', 'required', 'maxlength', 'pattern'];
const CELL_ATTRS = ['class', 'data-state', 'data-active'];
/** v0.36.0: input attributes of a letter charset (must agree with render() for the host's charset + case). */
const OTP_TEXT_ATTRS = new Set(['autocapitalize', 'autocorrect', 'spellcheck']);
/**
 * The ASCII digits of `raw`: full-width / Arabic-Indic digits become ASCII, every other character is dropped (spaces,
 * hyphens, letters). Not truncated. v0.36.0: a wrapper of `otpFilter(raw, { charset: 'numeric' })`
 * (src/utils/otp.js, same rule as php/td.php `td__otp_value()`).
 * @param {unknown} raw
 * @returns {string}
 */
export function otpDigits(raw) {
  return otpFilter(raw, { charset: 'numeric' });
}

/**
 * <td-otp-input> — a one-time code field (v0.27.0, plan v0.27.0-dsuite-p0a §B; v0.36.0: `length` 1–10, `charset`,
 * `case` — plan v0.36.0-polish QĐ 41–48). Token-native: needs td.css
 * (src/styles/components/otp-input.css). Form-associated (TdFormElement): one value under `name`.
 *
 * ONE real `<input type="text" inputmode="numeric" autocomplete="one-time-code">` carries everything native (typing,
 * paste, SMS / password-manager autofill, selection, IME); after the upgrade it is laid transparently over 6 DECORATIVE
 * cells (`aria-hidden` spans) drawn from the value + caret (the current cell gets the focus ring). Without JS the same
 * input is a plain field (php/td.php `td_otp_input`, maxlength 6 + pattern).
 *
 * - `length` (integer 1–10, default 6; anything else → 6 + one console warning per host), `charset` = `numeric`
 *   (default) | `alphanumeric` | `alpha`, `case` = `upper` (default) | `lower` | `preserve` (letters only). Changing any
 *   of them re-renders (the value is re-normalised / cut, `complete` re-armed by the usual rule).
 * - Normalisation (src/utils/otp.js `otpFilter`): digits → ASCII (full-width / Arabic-Indic), letters → NFKC of that
 *   character must be one [A-Za-z] then the case, everything else (spaces, hyphens, `â`, emoji) dropped — on typing,
 *   paste, drop and autofill alike; at most `length` (typing inside a full code overwrites the character after the
 *   caret). Never while an IME composition runs: once after `compositionend` (+ the next `input`).
 * - Input attributes per charset: numeric → `inputmode="numeric"`; letters → `inputmode="text"`, `autocapitalize`
 *   (`characters` for upper, `none` otherwise), `autocorrect="off"`, `spellcheck="false"`; always
 *   `autocomplete="one-time-code"`.
 * - `input` is the native event (bubbles from the inner input; the value is already normalised). `complete`
 *   (`detail: { value }`) fires ONCE per "generation": when the `length`-th character arrives with a value not completed yet;
 *   deleting a digit or `reset()` re-arms it. The component never submits, never calls an API, never counts down.
 * - Constraint validation: `required` + empty → valueMissing; 1…length−1 characters → tooShort (`messages.tooShort` for
 *   numeric, `messages.tooShortChars` for letter charsets). `disabled`, `readonly`, error
 *   contract (`error-text`, `setError()`): the cells take the error colour.
 * - Name: `label` → an internal `<label for>`; else host `aria-label`; else external `<label for="host-id">`; else
 *   `TdOtpInput.labels.input`.
 * - SSR (ADR 0012, contract `otp-input@1`): a host marked `data-td-ssr="otp-input@1"` whose markup is exactly render()'s
 *   (+ the no-JS `name` / `value` / `required` / `maxlength` / `pattern` on the input) is adopted IN PLACE (same input:
 *   value, selection, focus kept); anything else → safe render at once + value / selection / focus restored.
 *   v0.36.0 additive agreement: number of cells == host `length` == wrapper `data-length` (present only when ≠ 6);
 *   `inputmode` (+ letter attributes) match the charset; the first-pass `maxlength` / `pattern` match length + charset;
 *   each cell text fits the charset.
 *
 * DOM contract:
 *   <td-otp-input>
 *     <div class="td-otp" [data-length="N" — only when N ≠ 6]>
 *       [<label class="td-otp__label" for="{control id}">label</label>]
 *       <div class="td-otp__box">
 *         <input type="text" class="td-otp__input" id="{host id}-input" inputmode="numeric|text" autocomplete="one-time-code"
 *                [autocapitalize="characters|none" autocorrect="off" spellcheck="false" — letter charsets]>
 *         <span class="td-otp__cells" aria-hidden="true">
 *           <span class="td-otp__cell" data-state="empty|filled" [data-active]>character</span> × length
 *         </span>
 *       </div>
 *     </div>
 *     [<span class="td-field-error" id="{host id}-error" data-for="{host id}">error</span>]
 *   </td-otp-input>
 *
 * @element td-otp-input
 * @attr {string} name
 * @attr {string} value - default value (normalised); later changes set the live value too
 * @attr {number} length - 1–10 (default 6)
 * @attr {string} charset - numeric | alphanumeric | alpha
 * @attr {string} case - upper | lower | preserve
 * @attr {string} label
 * @attr {boolean} required
 * @attr {boolean} disabled
 * @attr {boolean} readonly
 * @attr {string} error-text
 * @fires input - native, from the inner input
 * @fires complete - detail: { value } — once per generation of a full code
 */
export class TdOtpInput extends TdFormElement {
  /** v0.27.0: adopts PHP element-mode markup in place; a hydrated element re-binds on re-connect. */
  static hydratable = true;

  /** @deprecated v0.36.0: the DEFAULT length (6); the instance getter `length` gives the real one. */
  static LENGTH = LENGTH;

  /** Default accessible name when nothing else names the field; override per site. */
  static labels = {
    input: 'Mã xác thực',
  };

  /** Validation texts (Vietnamese); override per site: `TdOtpInput.messages.tooShort = 'Enter all {length} digits.'`. */
  static messages = {
    valueMissing: 'Vui lòng nhập mã xác thực.',
    tooShort: 'Mã gồm {length} chữ số.',
    /** v0.36.0: alphanumeric / alpha charsets */
    tooShortChars: 'Mã gồm {length} ký tự.',
  };

  static get observedAttributes() {
    return [...super.observedAttributes, 'value', 'label', 'readonly', 'aria-label', 'error-text', 'length', 'charset', 'case'];
  }

  static get booleanAttributes() { return [...super.booleanAttributes, 'readonly']; }

  static get errorContract() { return true; }

  constructor() {
    super();
    /** @type {string} live value (digits) */
    this._value = '';
    this._valueSet = false;
    /** @type {string|null} the value `complete` fired for (null = armed) */
    this._completed = null;
    /** @private invalid attribute values already warned about (one warning per host and attribute value) */
    this._warned = new Set();
    /** @private an IME composition is running in the input */
    this._composing = false;
  }

  connectedCallback() {
    if (!this._initialized && !this._valueSet) this._assign(this._norm(this.getAttribute('value')), false);
    super.connectedCallback();
  }

  /**
   * @private length / charset / case from the attributes (invalid → default + one warning per host and value)
   * @returns {{ length: number, charset: string, case: string }}
   */
  _cfg() {
    const len = otpLength(this.getAttribute('length'));
    const cs = otpCharset(this.getAttribute('charset'));
    const tc = otpCase(this.getAttribute('case'));
    const bad = [];
    if (!len.valid) bad.push(['length', 'an integer 1–10; using 6']);
    if (!cs.valid) bad.push(['charset', 'numeric | alphanumeric | alpha; using numeric']);
    if (!tc.valid) bad.push(['case', 'upper | lower | preserve; using upper']);
    for (const [attr, hint] of bad) {
      const key = `${attr}=${this.getAttribute(attr)}`;
      if (this._warned.has(key)) continue;
      this._warned.add(key);
      console.warn(`td-otp-input: invalid ${attr}="${this.getAttribute(attr)}" — expected ${hint}.`);
    }
    return { length: len.length, charset: cs.charset, case: tc.textCase };
  }

  /** @private normalised + cut to the current length */
  _norm(raw) {
    const c = this._cfg();
    return otpFilter(raw, c).slice(0, c.length);
  }

  /** @returns {number} number of characters (1–10; v0.36.0) — reflects the `length` attribute (resolved) */
  get length() { return this._cfg().length; }

  set length(v) { if (v == null) this.removeAttribute('length'); else this.setAttribute('length', String(v)); }

  /** @returns {string} numeric | alphanumeric | alpha (v0.36.0) — reflects the `charset` attribute (resolved) */
  get charset() { return this._cfg().charset; }

  set charset(v) { if (v == null) this.removeAttribute('charset'); else this.setAttribute('charset', String(v)); }

  /** @returns {string} the characters typed so far (0…length) */
  get value() { return this._value; }

  /** Set the value (normalised; never fires `input` / `complete` — a full value counts as already completed). */
  set value(v) {
    this._assign(this._norm(v), true);
    if (!this._initialized) return;
    const input = this._focusTarget();
    if (input && input.value !== this._value) input.value = this._value;
    this._paint();
    this._syncForm();
  }

  /** Clear the code and re-arm `complete`. */
  reset() {
    this.value = '';
  }

  /** @private */
  _assign(digits, explicit) {
    this._value = digits;
    if (explicit) this._valueSet = true;
    this._completed = digits.length === this._cfg().length ? digits : null;
  }

  /** @protected The inner native input. */
  _focusTarget() {
    return this.querySelector('input.td-otp__input');
  }

  /** @private control id: the caller's (SSR markup) or `{host id}-input` */
  _controlId() {
    return this._ssrControlId || `${this.id}-input`;
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (this._helperAttr(name, oldVal, newVal)) return; // v0.54.0: helper-text in place (TdFormElement)
    if (oldVal === newVal || !this._initialized) {
      super.attributeChangedCallback(name, oldVal, newVal);
      return;
    }
    if (name === 'value') { this.value = newVal ?? ''; return; }
    if (name === 'length' || name === 'charset' || name === 'case') {
      // structural: re-normalise / cut the live value (complete re-armed by the usual rule), then render again
      this._assign(this._norm(this._value), false); // a full value counts as completed, a shorter one re-arms
      this._rerender();
      return;
    }
    if (name === 'readonly') {
      const input = this._focusTarget();
      if (input) input.readOnly = newVal !== null;
      return;
    }
    if (name === 'aria-label') { this._applyName(); return; }
    if (name === 'required') { this._syncForm(); return; }
    if (name === 'name') return; // ElementInternals submits under the host name
    super.attributeChangedCallback(name, oldVal, newVal); // disabled, label (re-render), error-text (in place)
  }

  /** @private re-render in place keeping focus + caret (length / charset / case changed) */
  _rerender() {
    const input = this._focusTarget();
    const focused = !!input && input.ownerDocument.activeElement === input;
    let sel = null;
    try { if (input && focused) sel = [input.selectionStart, input.selectionEnd]; } catch { /* ignore */ }
    this._doRender();
    const next = this._focusTarget();
    if (focused && next) {
      next.focus({ preventScroll: true });
      const max = this._value.length;
      try { if (sel) next.setSelectionRange(Math.min(sel[0], max), Math.min(sel[1], max)); } catch { /* ignore */ }
      this._paint();
    }
  }

  render() {
    const id = this.escapeHtml(this._controlId());
    const label = this.getAttribute('label') || '';
    const { length, charset, case: textCase } = this._cfg();
    const attrs = otpInputAttrs(charset, textCase).map(([k, v]) => ` ${k}="${v}"`).join('');
    return `<div class="td-otp"${length !== LENGTH ? ` data-length="${length}"` : ''}>`
      + (label ? `<label class="td-otp__label" for="${id}">${this.escapeHtml(label)}</label>` : '')
      + '<div class="td-otp__box">'
      + `<input type="text" class="td-otp__input" id="${id}"${attrs}>`
      + `<span class="td-otp__cells" aria-hidden="true">${'<span class="td-otp__cell"></span>'.repeat(length)}</span>`
      + '</div></div>';
  }

  afterRender() {
    const input = this._focusTarget();
    if (!input) return;
    if (input.value !== this._value) input.value = this._value;
    input.disabled = this._effectiveDisabled;
    input.readOnly = this.hasAttribute('readonly');
    const paint = () => this._paint();
    this.listen(input, 'input', (e) => this._onInput(/** @type {InputEvent} */ (e)));
    this.listen(input, 'compositionstart', () => { this._composing = true; });
    this.listen(input, 'compositionend', () => { this._composing = false; this._normalizeInput(input, null); });
    for (const ev of ['focus', 'blur', 'select', 'keyup']) this.listen(input, ev, paint);
    this.listen(document, 'selectionchange', () => { if (document.activeElement === input) paint(); });
    this.listen(input, 'click', (e) => this._placeCaret(input, /** @type {MouseEvent} */ (e)));
    this._applyName();
    this._paint();
    this._syncForm();
    this._applyErrorState();
  }

  /**
   * @private Normalise what the browser put in the input (typing, paste, drop, autofill), then redraw + revalidate and
   * fire `complete` for a new full value. The event keeps propagating (the page sees the normalised value).
   * @param {InputEvent} e
   */
  _onInput(e) {
    // IME (v0.36.0 QĐ 44): never touch the value mid-composition — normalised once at compositionend / the next input
    if (e.isComposing || this._composing) return;
    this._normalizeInput(/** @type {HTMLInputElement} */ (e.target), e.inputType);
  }

  /**
   * @private Normalise the input's value (typing, paste, drop, autofill, end of an IME composition).
   * @param {HTMLInputElement} input
   * @param {string|null|undefined} inputType
   */
  _normalizeInput(input, inputType) {
    const cfg = this._cfg();
    const n = cfg.length;
    const raw = input.value;
    let digits = otpFilter(raw, cfg);
    let caret = input.selectionStart == null ? digits.length : otpFilter(raw.slice(0, input.selectionStart), cfg).length;
    if (digits.length > n && inputType === 'insertText' && caret < digits.length) {
      // typing inside a full code overwrites the character(s) after the caret
      const extra = digits.length - n;
      digits = digits.slice(0, caret) + digits.slice(caret + extra);
    }
    digits = digits.slice(0, n);
    caret = Math.min(caret, digits.length);
    if (raw !== digits) {
      input.value = digits;
      try { if (document.activeElement === input) input.setSelectionRange(caret, caret); } catch { /* ignore */ }
    }
    this._value = digits;
    this._valueSet = true;
    this._paint();
    this._syncForm();
    if (digits.length === n) {
      if (this._completed !== digits) {
        this._completed = digits;
        this.emit('complete', { value: digits });
      }
    } else {
      this._completed = null; // a shorter value re-arms `complete`
    }
  }

  /** @private A click on cell N puts the caret there (never past the digits typed). */
  _placeCaret(input, e) {
    if (input.readOnly || input.disabled || input.selectionStart !== input.selectionEnd) return;
    const r = input.getBoundingClientRect();
    if (!r.width || !e.clientX) return;
    const idx = Math.floor((e.clientX - r.left) / (r.width / this._cfg().length));
    const pos = Math.max(0, Math.min(idx, this._value.length));
    try { input.setSelectionRange(pos, pos); } catch { /* ignore */ }
    this._paint();
  }

  /** @private Draw the cells: digit, filled / empty, the caret cell (or the selected cells) while focused. */
  _paint() {
    const input = this._focusTarget();
    const cells = this.querySelectorAll('.td-otp__cell');
    const n = cells.length;
    if (!input || n !== this._cfg().length) return;
    const focused = input.ownerDocument.activeElement === input;
    let s = 0;
    let e = 0;
    try { s = input.selectionStart ?? this._value.length; e = input.selectionEnd ?? s; } catch { s = e = this._value.length; }
    cells.forEach((cell, i) => {
      const ch = this._value[i] || '';
      if (cell.textContent !== ch) cell.textContent = ch;
      cell.setAttribute('data-state', ch ? 'filled' : 'empty');
      const active = focused && (s === e ? i === Math.min(s, n - 1) : i >= s && i < e);
      cell.toggleAttribute('data-active', active);
    });
  }

  /** @private Accessible name: label → host aria-label → external labels (shared helper) → labels.input. */
  _applyName() {
    const input = this._focusTarget();
    if (!input) return;
    const visible = !!this.getAttribute('label');
    super._applyAccessibleName(input, visible);
    if (!visible && !input.hasAttribute('aria-label') && !input.hasAttribute('aria-labelledby')) {
      input.setAttribute('aria-label', TdOtpInput.labels.input || 'Mã xác thực');
    }
  }

  /** @protected Push the value into form submission + constraint validation. */
  _syncForm() {
    const v = this._value;
    this._setFormValue(v);
    const input = this._focusTarget() || undefined;
    if (this.hasAttribute('required') && !v) {
      this._setValidity({ valueMissing: true }, this._msg('valueMissing'), input);
    } else if (v && v.length < this._cfg().length) {
      const { length, charset } = this._cfg();
      this._setValidity({ tooShort: true }, this._msg(charset === 'numeric' ? 'tooShort' : 'tooShortChars', { length }), input);
    } else {
      this._setValidity({});
    }
  }

  _captureDefaults() {
    this._defaultValue = this._norm(this._ssrDefaults ? this._ssrDefaults.value : this.getAttribute('value'));
  }

  _restoreDefaults() {
    this.value = this._defaultValue;
  }

  // --- SSR hydrate (v0.27.0, ADR 0012, contract otp-input@1) ---

  /**
   * Marker `otp-input@<n>` + the input at its skeleton slot → capture its state; adopt the markup only when the schema
   * is 1, it is exactly render()'s, its no-JS form attributes still agree with the host and it passes the subtree scan
   * + skeleton (else safe render at once + restore, focus included).
   * @returns {boolean}
   */
  canHydrate() {
    const m = ssrMarker(this);
    if (!m || m.name !== 'otp-input') return false;
    const control = this._ssrStateSource();
    if (!control) return this._ssrClean(false);
    this._ssrDefaults = { value: control.defaultValue };
    this._ssrControlId = control.id || null;
    const matches = m.schema === 1 && this._markupMatches(true)
      && this._ssrFormAttrsAgree(control, [['name', 'name'], ['required', 'required'], ['disabled', 'disabled'], ['readonly', 'readonly']],
        ['required', 'disabled', 'readonly']);
    return this._ssrDecide(control, matches, false);
  }

  /** Re-connect of a HYDRATED element: re-bind in place while the markup is still the component's own (else restore). */
  canRebind() {
    return this._ssrRevalidate(this._ssrStateSource());
  }

  /** @protected `div.td-otp` > `div.td-otp__box` > `input.td-otp__input` — each unique at its level. */
  _ssrSlotControl() {
    const one = (parent, tag, cls) => {
      const c = [...parent.children].filter((e) => e.localName === tag && e.classList.contains(cls));
      return c.length === 1 ? c[0] : null;
    };
    const root = one(this, 'div', 'td-otp');
    const box = root && one(root, 'div', 'td-otp__box');
    return box ? one(box, 'input', 'td-otp__input') : null;
  }

  /** @protected */
  _ssrPlausible() { return 'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="file"])'; }

  /** @protected */
  _ssrCapture(control, live) {
    const focused = control === control.ownerDocument.activeElement;
    let selection = null;
    try {
      if (control.selectionStart != null) selection = [control.selectionStart, control.selectionEnd, control.selectionDirection || 'none'];
    } catch { /* no selection API */ }
    const early = !live && this._earlyProps?.has('value');
    return { value: early ? this._value : this._norm(control.value), selection, focused };
  }

  hydrateExisting() {
    const control = this._ssrControl;
    const state = this._ssrState;
    this._assign(state.value, true);
    // Assign even when equal (same value: the selection stays): the value becomes dirty, so removing the `value`
    // attribute below changes nothing. A changed value (normalised / early property) puts a focused caret back.
    const changed = control.value !== state.value;
    control.value = state.value;
    const sel = state.selection;
    if (changed && state.focused && sel) {
      try { control.setSelectionRange(Math.min(sel[0], state.value.length), Math.min(sel[1], state.value.length), sel[2]); } catch { /* ignore */ }
    }
    const note = [...this.children].find(ssrIsErrorNote);
    if (note) this._errorNote = note;
    // the component re-adds its own error id (in its order) on bind; the page's own ids stay
    const own = `${this.id}-error`;
    const rest = (control.getAttribute('aria-describedby') || '').split(/\s+/).filter((t) => t && t !== own);
    if (rest.length) control.setAttribute('aria-describedby', rest.join(' '));
    else control.removeAttribute('aria-describedby');
    this._syncForm(); // ElementInternals FIRST…
    for (const a of SSR_ONLY) control.removeAttribute(a); // …then the no-JS attributes: FormData has ONE entry
    this._ssrRetargetLabels(control);
    this._ssrControl = null;
    this._ssrState = null;
  }

  /** @protected */
  _restoreSsrState(state) {
    const input = this._focusTarget();
    if (state.clean) {
      if (state.refocus && input) input.focus({ preventScroll: true });
      return;
    }
    this._assign(state.value, true);
    if (input) input.value = state.value;
    this._syncForm();
    if (state.refocus && input) {
      input.focus({ preventScroll: true });
      if (state.selection) {
        try { input.setSelectionRange(...state.selection); } catch { /* ignore */ }
      }
    }
    this._paint();
  }

  /**
   * @protected Review-round rules of v0.26: the known skeleton — `div.td-otp` > [optional text-only label,
   * `div.td-otp__box` > [this input, `span.td-otp__cells` > exactly 6 cells]], then at most the base error note.
   */
  _ssrSkeletonOk() {
    const kids = this._ssrWithoutHelperNote(ssrContentNodes(this)); // v0.54.0: minus the PHP helper note
    if (!kids || !kids.length || kids.length > 2 || kids.some((n) => n.nodeType !== 1) || (kids[1] && !ssrIsErrorNote(kids[1]))) return false;
    const root = kids[0];
    if (root.localName !== 'div' || !root.classList.contains('td-otp')) return false;
    const parts = ssrContentNodes(root);
    if (parts.some((n) => n.nodeType !== 1) || parts.length < 1 || parts.length > 2) return false;
    if (parts.length === 2 && (parts[0].localName !== 'label' || parts[0].children.length)) return false;
    const box = parts[parts.length - 1];
    if (box.localName !== 'div' || !box.classList.contains('td-otp__box')) return false;
    const inner = ssrContentNodes(box);
    if (inner.length !== 2 || inner[0] !== this._ssrControl) return false;
    const cells = inner[1];
    const n = this._cfg().length;
    return cells.nodeType === 1 && cells.localName === 'span' && cells.classList.contains('td-otp__cells')
      && cells.children.length === n && ssrContentNodes(cells).length === n;
  }

  /**
   * @private Exactly render()'s tree: wrapper, label, box, the input (type text, id, inputmode, autocomplete, attribute
   * allowlist; `first` = the SSR markup may still carry the no-JS attributes — then maxlength / pattern must agree with
   * length + charset), `length` cells (text = at most one character of the charset);
   * the error note there exactly when an error shows.
   * @param {boolean} first
   */
  _markupMatches(first) {
    const kids = this._ssrWithoutHelperNote(ssrContentNodes(this)); // v0.54.0: minus the PHP helper note
    if (!kids || !kids.length || kids.length > 2 || (kids.length === 2 && !ssrIsErrorNote(kids[1]))) return false;
    if ((kids.length === 2) !== !!this.errorMessage) return false;
    const tpl = document.createElement('template');
    tpl.innerHTML = this.render();
    const want = tpl.content.firstElementChild;
    const root = kids[0];
    if (root.nodeType !== 1 || root.localName !== 'div' || !ssrSameAttrs(root, want)) return false;
    const have = ssrContentNodes(root);
    const need = [...want.children];
    if (have.length !== need.length || have.some((n) => n.nodeType !== 1)) return false;
    return need.every((w, i) => (w.localName === 'label' ? ssrSamePart(have[i], w) : this._ssrBoxOk(have[i], w, first)));
  }

  /** @private */
  _ssrBoxOk(box, want, first) {
    if (box.localName !== 'div' || !ssrSameAttrs(box, want)) return false;
    const parts = ssrContentNodes(box);
    if (parts.length !== 2 || parts.some((n) => n.nodeType !== 1)) return false;
    const [c, cells] = parts;
    const [wc, wcells] = [...want.children];
    if (c.localName !== 'input' || c.getAttribute('type') !== 'text' || ssrClassKey(c) !== 'td-otp__input' || c.id !== wc.id) return false;
    // v0.36.0 agreement: inputmode / autocomplete / letter attributes exactly as render() for this charset + case
    for (const name of ['inputmode', 'autocomplete', ...OTP_TEXT_ATTRS]) {
      if (c.getAttribute(name) !== wc.getAttribute(name)) return false;
    }
    const { length, charset } = this._cfg();
    if (first) {
      if (c.hasAttribute('maxlength') && c.getAttribute('maxlength') !== String(length)) return false;
      if (c.hasAttribute('pattern') && c.getAttribute('pattern') !== otpPattern(charset, length)) return false;
    }
    const ok = (n) => (SSR_CONTROL_ATTRS.has(n) && n !== 'checked' && (first || !SSR_ONLY.includes(n))) || SSR_ARIA_DATA.test(n);
    if (![...c.attributes].every((a) => ok(a.name))) return false;
    if (cells.localName !== 'span' || !ssrSameAttrs(cells, wcells)) return false;
    const list = ssrContentNodes(cells);
    return list.length === length && list.every((cell) => cell.nodeType === 1 && cell.localName === 'span'
      && ssrClassKey(cell) === 'td-otp__cell' && [...cell.attributes].every((a) => CELL_ATTRS.includes(a.name))
      && cell.children.length === 0 && otpCellOk(cell.textContent, charset));
  }
}

if (!customElements.get('td-otp-input')) {
  customElements.define('td-otp-input', TdOtpInput);
}
