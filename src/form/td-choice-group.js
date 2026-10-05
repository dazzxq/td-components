import { TdFormElement, ssrClassKey, ssrContentNodes, ssrSameAttrs, ssrIsErrorNote } from '../base/td-form-element.js';
import { ssrMarker } from '../base/td-base-element.js';
import { safeColor } from '../utils/css-safe.js';
import { safeMediaUrl } from '../utils/media-url.js';
import { normalizeOptions, sameValueList, CHOICE_LIMITS } from '../utils/choice-options.js';

const VARIANTS = ['button', 'swatch'];
const GATES = { safeColor, safeMediaUrl: (u) => safeMediaUrl(u) };
/** Every form-associated element (the adopted markup may hold the radios and nothing else). */
const FORM_ASSOCIATED = 'input, textarea, select, button, fieldset, output, object';
/** Attributes a server-rendered radio may carry (php td_choice_group + what the component sets). */
const RADIO_ATTRS = new Set(['type', 'class', 'id', 'value', 'name', 'form', 'autocomplete', 'aria-labelledby', 'aria-describedby',
  'checked', 'required', 'disabled']);
const GROUP_ATTRS = new Set(['class', 'role', 'aria-labelledby', 'aria-label', 'aria-required', 'aria-invalid', 'aria-errormessage',
  'aria-describedby']);
let _groupCounter = 0;

/**
 * <td-choice-group> — choose ONE of N options shown as buttons (text, optional colour dot / small image + a hint line such
 * as a price) or as swatches (colour or image) — v0.49.0, plan docs/internal/plans/v0.49.0-choice-stepper.md. Token-native:
 * needs td.css (src/styles/components/choice-group.css + the field classes). Form-associated (ADR 0003).
 *
 * - The controls are NATIVE radios in a private group without a form owner (ADR 0022): `name="td-choice-{n}"`,
 *   `form=""`, `autocomplete="off"`. Tab / arrows / Space / `disabled` skipping / "n of N" are the browser's; the
 *   component only wraps the arrows at both ends (WebKit does not). The radios never reach FormData: the HOST submits
 *   `name=value` (nothing while nothing is selected).
 * - Two states per option: `disabled` (not selectable — a combination that does not exist) and `unavailable`
 *   (selectable, struck through + a note, default `messages.unavailable` "Hết hàng" — out of stock).
 * - `required` → valueMissing while nothing is selected AND at least one option is enabled (every option disabled →
 *   valid, like a native radio group; `aria-required` removed and a shown valueMissing error cleared).
 * - Events (user only): `input` then `change`, `detail = { value, option }` (`option` = frozen copy). Setting `value`,
 *   `setValue()`, `options` or a form reset never fires.
 * - `options` with the same value list (same order) → patched IN PLACE (radio nodes + focus kept); otherwise re-rendered
 *   (focus follows the value). A selected option that disappears → value '' (+ one warning).
 * - SSR (ADR 0012, contract `choice-group@1`, php td_choice_group — always the element): the server prints NATIVE radios
 *   with the real `name` (the no-JS form works); the markup is adopted IN PLACE when it is exactly render()'s for the
 *   options read back from it (re-checked through the same gate as the property) — same radio nodes (checked + focus
 *   kept), ElementInternals first, then the radios move to the private group. Anything else → safe render now, the live
 *   choice + focus restored. Texts from `messages` (the default "unavailable" note) are state, re-applied on bind.
 * - The app owns the variant logic (combination → variant / price / stock / URL): the kit never reads / writes
 *   `location`, `history`, prices or stock.
 *
 * DOM contract:
 *   <td-choice-group id="{h}">
 *     <div class="td-field td-choice td-choice--{button|swatch}">
 *       [<div class="td-field__label td-choice__label" id="{h}-label">…[<span class="td-field__required" aria-hidden="true"> *</span>]
 *         [<span class="td-choice__current" aria-hidden="true">: {current}</span>  (swatch)]</div>]
 *       <div class="td-choice__options" role="radiogroup" [aria-labelledby] [aria-required] [aria-invalid] [aria-describedby]>
 *         <label class="td-choice__option" data-td-value="{v}" [data-unavailable]>
 *           <input type="radio" class="td-choice__input" id="{h}-o{i}" value="{v}" name="td-choice-{n}" form="" autocomplete="off"
 *                  aria-labelledby="{h}-o{i}-l" [aria-describedby="{h}-o{i}-h {h}-o{i}-n"] [disabled]>
 *           <span class="td-choice__face">
 *             [<svg class="td-choice__swatch" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="16" fill="{colour}"/></svg>
 *              | <img class="td-choice__image" src alt="" width="32" height="32" loading="lazy" decoding="async">]
 *             <span class="td-choice__body">                       (button; swatch: the spans below sit in the face, td-sr-only)
 *               <span class="td-choice__text" id="{h}-o{i}-l">…</span>
 *               [<span class="td-choice__hint" id="{h}-o{i}-h">…</span>] [<span class="td-choice__note" id="{h}-o{i}-n">…</span>]
 *             </span>
 *           </span>
 *         </label>
 *       </div>
 *       <div class="td-field__footer" [hidden]>[error note]<div class="td-field__note" id="{h}-note" [hidden]>…</div></div>
 *     </div>
 *   </td-choice-group>
 *
 * @element td-choice-group
 * @attr {string} name
 * @attr {string} value - default value (reset target); later changes set the live value too (no event)
 * @attr {string} label - visible group label
 * @attr {string} variant - button (default) | swatch
 * @attr {boolean} required / disabled
 * @attr {string} helper-text / error-text / aria-label
 * @fires input - detail: { value, option } (user)
 * @fires change - detail: { value, option } (user, right after `input`)
 */
export class TdChoiceGroup extends TdFormElement {
  /** v0.49.0: adopts php td_choice_group markup in place (`choice-group@1`); a re-connect renders again. */
  static hydratable = true;

  /** Texts (Vietnamese); override per site. */
  static messages = {
    valueMissing: 'Vui lòng chọn một mục',
    unavailable: 'Hết hàng',
  };

  static get observedAttributes() {
    return [...super.observedAttributes, 'value', 'label', 'variant', 'helper-text', 'error-text', 'aria-label'];
  }

  static get errorContract() { return true; }

  /** @private attributes that change the DOM structure → re-render (value / focus kept) */
  static _structural = new Set(['label', 'variant']);

  constructor() {
    super();
    /** @type {ReadonlyArray<Readonly<import('../utils/choice-options.js').ChoiceOption>>} */
    this._options = Object.freeze([]);
    this._optionsSet = false;
    /** @type {string} live value ('' = none) */
    this._value = '';
    this._valueSet = false;
    this._warned = new Set();
    this._runtimeHelper = null;
    this._groupName = `td-choice-${++_groupCounter}`;
    // An external <label for="{host id}"> focuses the group's Tab stop; it never SELECTS (the base forwarder would click
    // the radio). Registered before the base forwarder (connectedCallback) → it runs first and stops it.
    this.addEventListener('click', (e) => {
      if (e.target !== this) return;
      e.stopImmediatePropagation();
      if (!this._effectiveDisabled) this._tabStop()?.focus();
    });
  }

  connectedCallback() {
    // `options` assigned before the upgrade lives in an own data property that shadows the accessor: replay it
    if (Object.prototype.hasOwnProperty.call(this, 'options')) {
      const v = this.options;
      delete this.options;
      this.options = v;
    }
    if (!this._initialized && !this._valueSet) this._value = this.getAttribute('value') ?? '';
    super.connectedCallback();
  }

  // --- resolved state ---

  /** @private @returns {'button'|'swatch'} */
  _variant() {
    const v = this.getAttribute('variant');
    return VARIANTS.includes(v) ? /** @type {'button'|'swatch'} */ (v) : 'button';
  }

  /** @private options that can be selected (not `disabled`; `unavailable` counts) */
  _hasEnabled() { return this._options.some((o) => !o.disabled); }

  /** @private */
  _optionOf(value) { return value === '' ? null : this._options.find((o) => o.value === value) || null; }

  /** @private frozen public copy of an option (never the internal object) */
  static _publicOption(o) {
    return o ? Object.freeze({ value: o.value, label: o.label, hint: o.hint, disabled: o.disabled, unavailable: o.unavailable, index: o.index }) : null;
  }

  /** @private the note shown for an unavailable option */
  _noteText(o) { return o.unavailableLabel || this._msg('unavailable'); }

  // --- render ---

  render() {
    const esc = (v) => this.escapeHtml(v);
    const id = esc(this.id);
    const label = this.getAttribute('label') || '';
    const variant = this._variant();
    return `<div class="td-field td-choice td-choice--${variant}">`
      + (label ? `<div class="td-field__label td-choice__label" id="${id}-label">${esc(label)}`
        + (variant === 'swatch' ? '<span class="td-choice__current" aria-hidden="true"></span>' : '') + '</div>' : '')
      + `<div class="td-choice__options" role="radiogroup"${label ? ` aria-labelledby="${id}-label"` : ''}>`
      + this._options.map((o) => this._optionHTML(o)).join('')
      + '</div>'
      + `<div class="td-field__footer"><div class="td-field__note" id="${id}-note" hidden></div></div>`
      + '</div>';
  }

  /** @private one option (`label` > radio + face) */
  _optionHTML(o) {
    const esc = (v) => this.escapeHtml(v);
    const oid = `${esc(this.id)}-o${o.index}`;
    return `<label class="td-choice__option" data-td-value="${esc(o.value)}"${o.unavailable ? ' data-unavailable' : ''}${o.disabled ? ' data-disabled' : ''}>`
      + `<input type="radio" class="td-choice__input" id="${oid}" value="${esc(o.value)}" name="${this._groupName}" form="" autocomplete="off"`
      + ` aria-labelledby="${oid}-l"${this._describedBy(o) ? ` aria-describedby="${esc(this._describedBy(o))}"` : ''}${o.disabled ? ' disabled' : ''}>`
      + `<span class="td-choice__face">${this._faceHTML(o)}</span>`
      + '</label>';
  }

  /** @private ids of the hint + note of an option */
  _describedBy(o) {
    const oid = `${this.id}-o${o.index}`;
    return [o.hint ? `${oid}-h` : '', o.unavailable ? `${oid}-n` : ''].filter(Boolean).join(' ');
  }

  /** @private inside `.td-choice__face` */
  _faceHTML(o) {
    const esc = (v) => this.escapeHtml(v);
    const oid = `${esc(this.id)}-o${o.index}`;
    const swatchMode = this._variant() === 'swatch';
    const sr = swatchMode ? ' td-sr-only' : '';
    let visual = '';
    if (o.image) {
      visual = `<img class="td-choice__image" src="${esc(o.image)}" alt="" width="32" height="32" loading="lazy" decoding="async">`;
    } else if (o.swatch || swatchMode) {
      // the colour is a PRESENTATION attribute (not an inline style: CSP style-src does not apply), set after render
      visual = `<svg class="td-choice__swatch${o.swatch ? '' : ' td-choice__swatch--none'}" viewBox="0 0 32 32" aria-hidden="true">`
        + '<circle cx="16" cy="16" r="16"></circle></svg>';
    }
    const texts = `<span class="td-choice__text${sr}" id="${oid}-l">${esc(o.label)}</span>`
      + (o.hint ? `<span class="td-choice__hint${sr}" id="${oid}-h">${esc(o.hint)}</span>` : '')
      // a site note is marked (`data-td-custom`): the default one is STATE (messages), re-applied on every bind
      + (o.unavailable ? `<span class="td-choice__note${sr}" id="${oid}-n"${o.unavailableLabel ? ' data-td-custom' : ''}>${esc(this._noteText(o))}</span>` : '');
    return visual + (swatchMode ? texts : `<span class="td-choice__body">${texts}</span>`);
  }

  afterRender() {
    const g = this._groupEl();
    if (!g) return;
    this.listen(g, 'input', (e) => e.stopPropagation()); // one event pair: the host's CustomEvents
    this.listen(g, 'change', (e) => {
      e.stopPropagation();
      const r = /** @type {HTMLInputElement} */ (e.target);
      if (r && r.checked && r.classList.contains('td-choice__input')) this._onUserPick(r);
    });
    this.listen(g, 'keydown', (e) => this._onKeydown(/** @type {KeyboardEvent} */ (e)));
    this._applyFills();
    this._applyNotes();
    this._applyChecked();
    this._applyDisabled();
    this._applyRequired();
    this._applyName();
    this._applyHelper();
    this._applyCurrent();
    this._syncForm();
    this._applyErrorState();
  }

  // --- in-place attribute handling ---

  attributeChangedCallback(name, oldVal, newVal) {
    if (oldVal === newVal || !this._initialized || !this._groupEl()) {
      super.attributeChangedCallback(name, oldVal, newVal);
      return;
    }
    if (TdChoiceGroup._structural.has(name)) {
      this._rerender();
      return;
    }
    switch (name) {
      case 'error-text':
        super.attributeChangedCallback(name, oldVal, newVal);
        return;
      case 'value':
        this.setValue(newVal ?? '');
        return;
      case 'helper-text':
        this._runtimeHelper = null;
        this._applyHelper();
        return;
      case 'disabled':
        this._effectiveDisabled = newVal !== null || this._ancestorDisabled;
        this._applyDisabled();
        this._syncForm();
        return;
      case 'required':
        this._applyRequired();
        this._syncForm();
        return;
      case 'aria-label':
        this._applyName();
        return;
      default: // name: read by ElementInternals on submit
    }
  }

  /** Ancestor `<fieldset disabled>` toggled: in place (radio nodes kept). */
  formDisabledCallback(disabled) {
    this._ancestorDisabled = !!disabled;
    this._effectiveDisabled = this.hasAttribute('disabled') || this._ancestorDisabled;
    if (this._initialized && this._groupEl()) {
      this._applyDisabled();
      this._syncForm();
    }
  }

  /** @private full render keeping the value and moving the focus to the same value (or the Tab stop) */
  _rerender() {
    const active = this.ownerDocument.activeElement;
    const had = !!active && this.contains(active);
    const focusValue = had && active.classList?.contains('td-choice__input') ? active.value : null;
    this._doRender();
    if (!had) return;
    const target = (focusValue != null && this._radios().find((r) => r.value === focusValue && !r.disabled)) || this._tabStop();
    target?.focus({ preventScroll: true });
  }

  // --- parts ---

  /** @private */
  _groupEl() { return this.querySelector('.td-choice > .td-choice__options'); }

  /** @private @returns {HTMLInputElement[]} */
  _radios() {
    const g = this._groupEl();
    return g ? /** @type {HTMLInputElement[]} */ ([...g.querySelectorAll(':scope > .td-choice__option > input.td-choice__input')]) : [];
  }

  /** @private radio of an option (by position: the list and the radios are built from the same array) */
  _radioAt(i) { return this._radios()[i] || null; }

  /** @private the group's Tab stop: the checked enabled radio, else the first enabled one */
  _tabStop() {
    const rs = this._radios().filter((r) => !r.disabled);
    return rs.find((r) => r.checked) || rs[0] || null;
  }

  /** @protected the Tab stop (label forwarding, validity bubble, focus()) */
  _focusTarget() { return this._tabStop(); }

  /** @protected aria-invalid / -errormessage / -describedby live on the radiogroup */
  _ariaTarget() { return this._groupEl(); }

  // --- state → DOM (idempotent) ---

  /** @private swatch colours: SVG `fill` presentation attribute through setAttribute (gated by safeColor) */
  _applyFills() {
    const rs = this._radios();
    this._options.forEach((o, i) => {
      const c = rs[i]?.parentElement?.querySelector('.td-choice__face > svg.td-choice__swatch > circle');
      if (!c) return;
      if (o.swatch) c.setAttribute('fill', o.swatch);
      else c.removeAttribute('fill');
    });
  }

  /** @private default "unavailable" notes = the current messages (server markup carries the server's text) */
  _applyNotes() {
    const rs = this._radios();
    this._options.forEach((o, i) => {
      const n = o.unavailable && !o.unavailableLabel ? rs[i]?.parentElement?.querySelector('.td-choice__face .td-choice__note') : null;
      if (n && n.textContent !== this._msg('unavailable')) n.textContent = this._msg('unavailable');
    });
  }

  /** @private */
  _applyChecked() {
    for (const r of this._radios()) r.checked = this._value !== '' && r.value === this._value;
  }

  /** @private host / fieldset disabled locks every radio; otherwise each option's own flag */
  _applyDisabled() {
    const rs = this._radios();
    this._options.forEach((o, i) => { if (rs[i]) rs[i].disabled = this._effectiveDisabled || o.disabled; });
  }

  /** @private `aria-required` on the radiogroup + the decorative star (only while an option can be selected) */
  _applyRequired() {
    const g = this._groupEl();
    const on = this.hasAttribute('required') && this._hasEnabled();
    if (g) {
      if (on) g.setAttribute('aria-required', 'true');
      else g.removeAttribute('aria-required');
    }
    const label = this.querySelector('.td-choice__label');
    if (!label) return;
    let star = label.querySelector(':scope > .td-field__required');
    if (this.hasAttribute('required') && !star) {
      star = document.createElement('span');
      star.className = 'td-field__required';
      star.setAttribute('aria-hidden', 'true');
      star.textContent = ' *';
      const cur = label.querySelector(':scope > .td-choice__current');
      label.insertBefore(star, cur);
    } else if (!this.hasAttribute('required') && star) star.remove();
  }

  /** @private */
  _applyName() {
    this._applyAccessibleName(this._groupEl(), !!this.getAttribute('label'));
  }

  /** @private swatch variant: "Màu sắc: Titan đen" (+ " — Hết hàng") */
  _applyCurrent() {
    const cur = this.querySelector('.td-choice__label > .td-choice__current');
    if (!cur) return;
    const o = this._optionOf(this._value);
    cur.textContent = o ? `: ${o.label}${o.unavailable ? ` — ${this._noteText(o)}` : ''}` : '';
  }

  /** @private @returns {string} */
  _effectiveHelper() {
    if (this._runtimeHelper != null) return this._runtimeHelper;
    return this.getAttribute('helper-text') || '';
  }

  /** @private */
  _applyHelper() {
    const note = this.querySelector('.td-choice > .td-field__footer > .td-field__note');
    if (!note) return;
    const text = this._effectiveHelper();
    note.textContent = text;
    note.hidden = !text;
    this._syncDescribedBy();
    this._syncFooter();
  }

  /** @private */
  _syncFooter() {
    const footer = this.querySelector('.td-choice > .td-field__footer');
    if (footer) footer.hidden = ![...footer.children].some((c) => !c.hidden);
  }

  /** @protected the error note goes first in the footer */
  _mountErrorNote(note) {
    const footer = this.querySelector('.td-choice > .td-field__footer');
    if (footer) footer.prepend(note);
    else super._mountErrorNote(note);
  }

  /** @protected helper note id on the radiogroup (the base adds the error id) */
  _describedByIds() {
    return this._effectiveHelper() && this.querySelector('.td-choice > .td-field__footer > .td-field__note') ? [`${this.id}-note`] : [];
  }

  /** @protected */
  _applyErrorState() {
    super._applyErrorState();
    this._syncFooter();
  }

  // --- user ---

  /** @private a radio became checked by the user (pointer, Space, arrows) */
  _onUserPick(r) {
    const i = this._radios().indexOf(r);
    const o = this._options[i];
    if (!o || o.value === this._value) return;
    this._value = o.value;
    this._valueSet = true;
    this._applyCurrent();
    this._syncForm();
    if (this.errorMessage && this.errorMessage === this._msg('valueMissing')) this.clearError();
    const detail = () => ({ value: o.value, option: TdChoiceGroup._publicOption(o) });
    this.emit('input', detail());
    this.emit('change', detail());
  }

  /**
   * @private The native group moves + checks with the arrows; WebKit does not wrap at the ends (ADR 0022) — the
   * component wraps there itself in every engine (one code path), between ENABLED radios.
   */
  _onKeydown(e) {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const dir = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    const r = /** @type {HTMLElement} */ (e.target);
    if (!dir || !r.classList?.contains('td-choice__input')) return;
    const enabled = this._radios().filter((x) => !x.disabled);
    const i = enabled.indexOf(/** @type {HTMLInputElement} */ (r));
    if (i < 0 || enabled.length < 2) return;
    const atEnd = dir > 0 ? i === enabled.length - 1 : i === 0;
    if (!atEnd) return;
    e.preventDefault();
    const next = enabled[dir > 0 ? 0 : enabled.length - 1];
    next.focus();
    next.checked = true;
    this._onUserPick(next);
  }

  // --- form participation ---

  /** @private */
  _syncForm() {
    this._setFormValue(this._value || null, this._value);
    const missing = this.hasAttribute('required') && this._value === '' && this._hasEnabled();
    if (missing) {
      this._setValidity({ valueMissing: true }, this._msg('valueMissing'), this._tabStop() || undefined);
    } else {
      this._setValidity({});
    }
  }

  _captureDefaults() {
    this._defaultValue = this._ssrDefaults ? this._ssrDefaults.value : (this.getAttribute('value') ?? '');
  }

  /** Form reset: the captured default (kept only while it is one of the options), silently. */
  _restoreDefaults() {
    this._value = this._defaultValue;
    this._valueSet = true;
    this._reconcileValue();
    if (!this._initialized) return;
    this._applyChecked();
    this._applyCurrent();
    this._syncForm();
  }

  _restoreState(state) {
    if (typeof state === 'string') this.setValue(state);
  }

  /** @private once options are known, a value that is not one of them becomes '' (+ one warning) */
  _reconcileValue() {
    if (!this._optionsSet || this._value === '' || this._optionOf(this._value)) return;
    this._warnOnce(`gone:${this._value}`, `td-choice-group: the value (${this._value.length} chars) is not one of the options — cleared.`);
    this._value = '';
  }

  // --- public API ---

  /** @type {string} the selected value ('' = none); setting it = setValue() */
  get value() { return this._value; }
  set value(v) { this.setValue(v); }

  /** @returns {string} */
  getValue() { return this._value; }

  /**
   * Select by value, silently (no event). '' / null clears; a value that is not one of the options → '' + one warning
   * (before the options are known it is kept and checked when they arrive).
   * @param {string|number|null|undefined} v
   */
  setValue(v) {
    this._value = v == null ? '' : String(v);
    this._valueSet = true;
    this._reconcileValue();
    if (!this._initialized) return;
    this._applyChecked();
    this._applyCurrent();
    this._syncForm();
  }

  /** @type {Array<object>} normalised frozen copies; setting it validates (warnings) and patches / re-renders */
  get options() { return this._options.map((o) => Object.freeze({ ...o })); }

  set options(raw) {
    const { options, warnings } = normalizeOptions(raw, GATES);
    for (const w of warnings) this._warnOnce(`opt:${w}`, `td-choice-group: ${w}`);
    const prev = this._options;
    const samePositions = this._optionsSet && sameValueList(prev, options);
    this._options = options;
    this._optionsSet = true;
    this._reconcileValue();
    if (!this._initialized || !this._groupEl()) return;
    if (samePositions && this._radios().length === options.length) this._patch();
    else this._rerender();
    // required with no enabled option left: valid, and a shown valueMissing error goes (QĐ 6)
    if (!this._hasEnabled() && this.errorMessage && this.errorMessage === this._msg('valueMissing')) this.clearError();
  }

  /** @type {object|null} frozen copy of the selected option */
  get selectedOption() { return TdChoiceGroup._publicOption(this._optionOf(this._value)); }

  /** @param {string} msg helper text ('' clears; a later `helper-text` attribute replaces it) */
  setHelper(msg) {
    this._runtimeHelper = msg ? String(msg) : '';
    this._applyHelper();
  }

  /** Focus the group's Tab stop (the selected option, else the first enabled one). */
  focus(options) {
    const t = this._tabStop();
    if (t) t.focus(options);
  }

  /**
   * @private Same value list: update every option in place — the radio node (focus, checked) is kept; its states /
   * describedby change and the FACE is rebuilt (text / hint / note / colour / image).
   */
  _patch() {
    const rs = this._radios();
    // review I1: the focused radio may become disabled (the browser then drops the focus to <body>)
    const active = this.ownerDocument.activeElement;
    const focused = rs.includes(/** @type {HTMLInputElement} */ (active)) ? /** @type {HTMLInputElement} */ (active) : null;
    this._options.forEach((o, i) => {
      const r = rs[i];
      const opt = r.parentElement;
      opt.toggleAttribute('data-unavailable', o.unavailable);
      opt.toggleAttribute('data-disabled', o.disabled);
      const desc = this._describedBy(o);
      if (desc) r.setAttribute('aria-describedby', desc);
      else r.removeAttribute('aria-describedby');
      const face = opt.querySelector(':scope > .td-choice__face');
      if (face) face.innerHTML = this._faceHTML(o);
    });
    this._applyFills();
    this._applyChecked();
    this._applyDisabled();
    this._applyRequired();
    this._applyCurrent();
    this._syncForm();
    if (focused && focused.disabled) this._tabStop()?.focus({ preventScroll: true });
  }

  // --- SSR hydrate (contract choice-group@1, ADR 0012 + 0022) ---

  /**
   * Marker `choice-group@<n>` → read the options back from the strict skeleton (root > radiogroup > option labels > radio
   * + face) through normalizeOptions(); adopt only when the schema is 1, no option was refused, no `options` property was
   * assigned before define, and the markup is exactly render()'s for those options (+ the no-JS radio attributes).
   * Otherwise: safe render now, the live choice + focus restored (no event).
   * @returns {boolean}
   */
  canHydrate() {
    const m = ssrMarker(this);
    if (!m || m.name !== 'choice-group') return false;
    let parsed = this._ssrParse();
    if (parsed === 'over') {
      this._warnOnce('ssr-over', 'td-choice-group: server markup over the limits — not adopted, rendered from scratch.');
      parsed = null;
    }
    const active = this.ownerDocument.activeElement;
    let options = null;
    let warnings = [];
    if (parsed) ({ options, warnings } = normalizeOptions(parsed.raw, GATES));
    const liveValue = parsed ? (parsed.radios.find((r) => r.checked)?.value ?? '') : null;
    if (parsed) this._ssrDefaults = { value: parsed.radios.find((r) => r.defaultChecked)?.value ?? '' };
    const ok = m.schema === 1 && !!parsed && !this._optionsSet && !warnings.length && options.length === parsed.radios.length
      && this._ssrGate(parsed, options);
    if (ok) {
      this._ssrAdopt = { radios: parsed.radios, options, liveValue };
      return true;
    }
    // refused: the component renders from the host (+ the options read back, when the skeleton was readable)
    if (!this._optionsSet && options) {
      for (const w of warnings) this._warnOnce(`opt:${w}`, `td-choice-group: ${w}`);
      this._options = options;
      this._optionsSet = true;
    }
    if (liveValue != null && !this._earlyProps?.has('value')) {
      this._value = liveValue;
      this._valueSet = true;
    }
    this._reconcileValue();
    const inside = !!active && active !== this && this.contains(active);
    this._ssrRestore = { refocus: inside, focusValue: inside && parsed?.radios.includes(active) ? active.value : null };
    return false;
  }

  /** A re-connect renders again (the model — options + value — is the component's after adoption). */
  canRebind() { return false; }

  hydrateExisting() {
    const a = this._ssrAdopt;
    this._ssrAdopt = null;
    if (!a) return;
    this._options = a.options;
    this._optionsSet = true;
    if (!this._earlyProps?.has('value')) {
      this._value = a.liveValue;
      this._valueSet = true;
    }
    this._reconcileValue();
    const note = this.querySelector('.td-choice > .td-field__footer > .td-field-error');
    if (note) this._errorNote = note;
    this._syncForm(); // ElementInternals FIRST…
    for (const r of a.radios) { // …then the radios leave the form: private group, no form owner (same nodes)
      r.name = this._groupName;
      r.setAttribute('form', '');
      r.setAttribute('autocomplete', 'off');
      r.removeAttribute('required');
    }
  }

  /** @protected refused markup was replaced: the focus goes to the radio of the same value (or the Tab stop) */
  _restoreSsrState(state) {
    if (!state.refocus) return;
    const t = (state.focusValue != null && this._radios().find((r) => r.value === state.focusValue && !r.disabled)) || this._tabStop();
    t?.focus({ preventScroll: true });
  }

  /**
   * @private The strict skeleton → the radios + raw option data, or null. Only exact positions are read (an injected
   * control elsewhere is never a state source).
   */
  _ssrParse() {
    // review round 2: bounded BEFORE extraction — only the expected direct-child shape is walked (no deep query), element
    // counts are checked before iterating, every text / attribute is length-checked before it is copied. Over a limit →
    // OVER (not adopted: fresh render + one fixed warning); a wrong shape → null.
    const L = CHOICE_LIMITS;
    const OVER = 'over';
    if (this.childElementCount !== 1) return null;
    const root = this.firstElementChild;
    if (root.localName !== 'div' || !root.classList.contains('td-choice') || root.childElementCount > 8) return null; // label, options, footer (+ slack: a foreign sibling is refused by the gate, the options stay readable)
    const groups = [...root.children].filter((e) => e.localName === 'div' && e.classList.contains('td-choice__options'));
    if (groups.length !== 1) return null;
    const group = groups[0];
    if (group.childElementCount > L.options) return OVER; // the server never prints more: nothing below is read
    /** text of a leaf span, refused (OVER) past `cap` code points (UTF-16 bound) before it is copied */
    const leafText = (el, cap) => {
      if (el.childElementCount !== 0 || el.childNodes.length > 4) return OVER;
      let n = 0;
      for (const t of el.childNodes) n += t.nodeType === 3 ? t.length : 0;
      return n > 2 * cap ? OVER : el.textContent;
    };
    /** attribute value, refused (OVER) past `cap` code points; null when absent */
    const attr = (el, name, cap) => {
      if (el.attributes.length > 16) return OVER;
      const a = el.getAttributeNode(name);
      if (!a) return null;
      return a.value.length > 2 * cap ? OVER : a.value;
    };
    const radios = [];
    const raw = [];
    for (const l of group.children) {
      if (l.localName !== 'label' || !l.classList.contains('td-choice__option') || l.childElementCount !== 2) return null;
      const r = l.firstElementChild;
      const face = r.nextElementSibling;
      if (r.localName !== 'input' || r.getAttribute('type') !== 'radio' || face.localName !== 'span'
        || !face.classList.contains('td-choice__face') || face.childElementCount > 4) return null;
      const o = { value: attr(r, 'value', L.value) ?? '', label: '', hint: '', swatch: '', image: '', unavailableLabel: '',
        disabled: l.hasAttribute('data-disabled'), unavailable: l.hasAttribute('data-unavailable') };
      if (o.value === OVER) return OVER;
      // face: [svg.td-choice__swatch > circle | img.td-choice__image] + texts (button: inside span.td-choice__body)
      let texts = [...face.children];
      const v = texts[0];
      if (v && v.localName === 'svg') {
        if (!v.classList.contains('td-choice__swatch') || v.childElementCount !== 1 || v.firstElementChild.localName !== 'circle') return null;
        o.swatch = attr(v.firstElementChild, 'fill', L.swatch) ?? '';
        texts = texts.slice(1);
      } else if (v && v.localName === 'img') {
        if (!v.classList.contains('td-choice__image')) return null;
        o.image = attr(v, 'src', L.image) ?? '';
        texts = texts.slice(1);
      }
      if (o.swatch === OVER || o.image === OVER) return OVER;
      if (texts.length === 1 && texts[0].classList.contains('td-choice__body')) {
        if (texts[0].childElementCount > 3) return null;
        texts = [...texts[0].children];
      }
      if (texts.length < 1 || texts.length > 3) return null;
      for (const t of texts) {
        if (t.localName !== 'span') return null;
        const key = t.classList.contains('td-choice__text') ? 'label' : t.classList.contains('td-choice__hint') ? 'hint'
          : t.classList.contains('td-choice__note') ? 'note' : null;
        if (!key) return null;
        const txt = leafText(t, key === 'note' ? L.note : L[key]);
        if (txt === OVER) return OVER;
        if (key === 'note') o.unavailableLabel = t.hasAttribute('data-td-custom') ? txt : '';
        else o[key] = txt;
      }
      raw.push(o);
      radios.push(/** @type {HTMLInputElement} */ (r));
    }
    return { root, group, radios, raw };
  }


  /** @private exactly render()'s tree for `options` (+ the no-JS radio attributes / server state texts) */
  _ssrGate(parsed, options) {
    const tpl = document.createElement('template');
    const prev = this._options;
    this._options = options;
    try {
      tpl.innerHTML = this.render();
    } finally {
      this._options = prev;
    }
    const want = tpl.content.firstElementChild;
    if (!ssrSameAttrs(parsed.root, want)) return false;
    const have = ssrContentNodes(parsed.root);
    const need = [...want.children];
    if (have.length !== need.length || have.some((n) => n.nodeType !== 1)) return false;
    const partsOk = need.every((w, i) => {
      const l = /** @type {Element} */ (have[i]);
      if (w.classList.contains('td-choice__label')) return this._ssrLabelOk(l, w);
      if (w.classList.contains('td-choice__options')) return this._ssrGroupOk(l, w, options);
      return this._ssrFooterOk(l);
    });
    if (!partsOk) return false;
    const controls = [...this.querySelectorAll(FORM_ASSOCIATED)];
    return controls.length === parsed.radios.length && controls.every((c, i) => c === parsed.radios[i]);
  }

  /** @private label div: text, [star ⇔ required], [current span ⇔ swatch] */
  _ssrLabelOk(l, w) {
    if (l.localName !== 'div' || !ssrSameAttrs(l, w)) return false;
    const nodes = ssrContentNodes(l);
    const cur = this._variant() === 'swatch' ? nodes.pop() : null;
    if (cur && !(cur.nodeType === 1 && cur.localName === 'span' && ssrClassKey(cur) === 'td-choice__current'
      && cur.attributes.length === 2 && cur.getAttribute('aria-hidden') === 'true' && cur.children.length === 0)) return false;
    const star = nodes.length && nodes[nodes.length - 1].nodeType === 1 ? nodes.pop() : null;
    if (!!star !== this.hasAttribute('required')) return false;
    if (star && !(star.localName === 'span' && ssrClassKey(star) === 'td-field__required' && star.attributes.length === 2
      && star.getAttribute('aria-hidden') === 'true' && star.children.length === 0 && star.textContent === ' *')) return false;
    return nodes.every((n) => n.nodeType === 3) && nodes.map((n) => n.data).join('') === (this.getAttribute('label') || '');
  }

  /** @private the radiogroup + one option label per option (radio attribute allowlist, face exactly render()'s) */
  _ssrGroupOk(g, w, options) {
    if (g.localName !== 'div' || ssrClassKey(g) !== ssrClassKey(w) || g.getAttribute('role') !== 'radiogroup') return false;
    if (![...g.attributes].every((a) => GROUP_ATTRS.has(a.name))) return false;
    if (w.hasAttribute('aria-labelledby') && g.getAttribute('aria-labelledby') !== w.getAttribute('aria-labelledby')) return false;
    const have = ssrContentNodes(g);
    if (have.length !== options.length || have.length !== w.children.length) return false;
    const name = this.getAttribute('name') || '';
    return options.every((o, i) => {
      const l = /** @type {Element} */ (have[i]);
      const wl = w.children[i];
      if (l.nodeType !== 1 || !ssrSameAttrs(l, wl)) return false;
      const parts = ssrContentNodes(l);
      if (parts.length !== 2 || parts.some((n) => n.nodeType !== 1)) return false;
      const [r, face] = /** @type {Element[]} */ (parts);
      const wr = wl.children[0];
      if (![...r.attributes].every((a) => RADIO_ATTRS.has(a.name))) return false;
      if (ssrClassKey(r) !== 'td-choice__input' || r.id !== wr.id || r.getAttribute('value') !== o.value
        || r.getAttribute('aria-labelledby') !== wr.getAttribute('aria-labelledby')
        || r.getAttribute('aria-describedby') !== wr.getAttribute('aria-describedby')) return false;
      // the no-JS form attributes still agree with the host (a nameless group: the private server name + no form owner)
      const nameOk = name ? r.getAttribute('name') === name && !r.hasAttribute('form')
        : r.getAttribute('name') === `${this.id}-group` && r.getAttribute('form') === '';
      if (!nameOk || r.hasAttribute('autocomplete')) return false;
      if (r.hasAttribute('required') !== this.hasAttribute('required')) return false;
      if (r.hasAttribute('disabled') !== (this.hasAttribute('disabled') || o.disabled)) return false;
      return this._ssrSame(face, wl.children[1], o);
    });
  }

  /**
   * @private A face part equals render()'s: same tag / attributes / children; the swatch circle may carry the option's
   * own `fill`; an image `src` may be the server's (unnormalised) form of the option's URL; the default note text is
   * state (not compared).
   */
  _ssrSame(live, want, o) {
    if (live.nodeType !== want.nodeType) return false;
    if (live.nodeType === 3) return live.data === want.data;
    if (live.localName !== want.localName || live.namespaceURI !== want.namespaceURI) return false;
    if (want.localName === 'circle') {
      const fill = live.getAttribute('fill');
      if ((o.swatch ? fill !== o.swatch : fill !== null) || live.attributes.length !== want.attributes.length + (o.swatch ? 1 : 0)) return false;
      if (![...want.attributes].every((a) => live.getAttribute(a.name) === a.value)) return false;
      return live.childNodes.length === 0;
    }
    if (want.localName === 'img') {
      if (live.attributes.length !== want.attributes.length || safeMediaUrl(live.getAttribute('src')) !== want.getAttribute('src')) return false;
      return [...want.attributes].every((a) => a.name === 'src' || live.getAttribute(a.name) === a.value) && live.childNodes.length === 0;
    }
    if (!ssrSameAttrs(live, want)) return false;
    const a = ssrContentNodes(live);
    const b = ssrContentNodes(want);
    if (want.classList?.contains('td-choice__note') && !o.unavailableLabel) return a.length <= 1 && a.every((n) => n.nodeType === 3);
    return a.length === b.length && a.every((n, i) => this._ssrSame(n, b[i], o));
  }

  /** @private footer: [error note ⇔ an error shows] + the note div (text only) */
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

  /** @private */
  _warnOnce(key, msg) {
    if (this._warned.has(key)) return;
    this._warned.add(key);
    console.warn(msg);
  }
}

if (!customElements.get('td-choice-group')) {
  customElements.define('td-choice-group', TdChoiceGroup);
}
