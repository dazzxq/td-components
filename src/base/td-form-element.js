import { TdBaseElement } from './td-base-element.js';

let _autoIdCounter = 0;
let _labelIdCounter = 0;

// --- v0.26.0 SSR markup checks shared by the form-associated hydratable components (ADR 0012) ---

/** Sorted class list (order-insensitive comparison). @param {Element} el */
export const ssrClassKey = (el) => [...el.classList].sort().join(' ');
/** Element children + non-blank text nodes (comments / whitespace ignored). @param {Node} el */
export const ssrContentNodes = (el) => [...el.childNodes].filter((n) => n.nodeType === 1 || (n.nodeType === 3 && n.data.trim()));
/** `aria-*` and `data-*` (never the kit's internal `data-td-*` namespace). */
export const SSR_ARIA_DATA = /^(?:aria-[a-z0-9][a-z0-9._-]*|data-(?!td-)[a-z0-9][a-z0-9._-]*)$/;
/**
 * Attributes a server-rendered CONTROL may carry: what php/td.php prints (owned names + the `attrs` allowlist
 * Td::ALLOWED_ATTRS) + aria-* / data-*. Anything else (on*, style, form, formaction, formmethod…, contenteditable,
 * srcdoc…) → the markup is not adopted (safe render).
 */
export const SSR_CONTROL_ATTRS = new Set(['class', 'type', 'name', 'value', 'checked', 'id', 'title', 'lang', 'dir', 'role',
  'tabindex', 'hidden', 'translate', 'accesskey', 'autofocus', 'autocomplete', 'inputmode', 'enterkeyhint', 'autocapitalize',
  'spellcheck', 'placeholder', 'readonly', 'required', 'disabled', 'maxlength', 'minlength', 'min', 'max', 'step', 'pattern',
  'size', 'rows', 'cols']);

/** Review round 1 SEC-01 — what can legitimately sit under a form host (php/td.php element mode + render()). */
const SSR_HTML_TAGS = new Set(['div', 'label', 'span', 'input', 'textarea']);
const SSR_SVG_TAGS = new Set(['svg', 'title', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse']);
const SSR_INPUT_TYPES = new Set(['text', 'password', 'email', 'number', 'url', 'search', 'tel', 'date', 'month',
  'datetime-local', 'time', 'checkbox']);
/** Non-control parts: label `for`, error note `data-for`, the kit's icon slot attributes. */
const SSR_PART_ATTRS = new Set(['for', 'data-td-icon', 'data-td-icon-class', 'data-td-icon-size']);
const SSR_SVG_ATTRS = new Set(['class', 'data-icon', 'viewBox', 'xmlns', 'fill', 'stroke', 'stroke-width', 'stroke-linecap',
  'stroke-linejoin', 'aria-hidden', 'aria-label', 'role', 'focusable', 'd', 'points', 'cx', 'cy', 'r', 'rx', 'ry', 'x',
  'y', 'x1', 'y1', 'x2', 'y2', 'width', 'height', 'fill-rule', 'clip-rule', 'opacity', 'fill-opacity', 'stroke-opacity']);

/** Same attribute set + values (class order-insensitive). @param {Element} a @param {Element} b */
export function ssrSameAttrs(a, b) {
  if (a.attributes.length !== b.attributes.length) return false;
  return [...b.attributes].every((x) => a.hasAttribute(x.name)
    && (x.name === 'class' ? ssrClassKey(a) === ssrClassKey(b) : a.getAttribute(x.name) === x.value));
}

/**
 * A decorative / text part equals render()'s: same tag, exactly the same attributes, same children (text compared
 * exactly). An icon slot (`data-td-icon`) is compared by its attributes only — its content is re-created by
 * fillIconSlots() on bind.
 * @param {Node} live @param {Node} want
 */
export function ssrSamePart(live, want) {
  if (live.nodeType !== want.nodeType) return false;
  if (live.nodeType === 3) return live.data === want.data;
  if (live.localName !== want.localName || !ssrSameAttrs(live, want)) return false;
  if (want.hasAttribute('data-td-icon')) return true;
  const a = ssrContentNodes(live);
  const b = ssrContentNodes(want);
  return a.length === b.length && a.every((n, i) => ssrSamePart(n, b[i]));
}

/** The error note the base error contract renders (`span.td-field-error`, text only). @param {Node} n */
export const ssrIsErrorNote = (n) => n.nodeType === 1 && n.localName === 'span' && ssrClassKey(n) === 'td-field-error'
  && [...n.attributes].every((a) => ['class', 'id', 'data-for'].includes(a.name)) && n.children.length === 0;

/**
 * Base class for form-associated td-components. Extends {@link TdBaseElement}
 * with native form participation via **ElementInternals** (no Shadow DOM).
 *
 * A subclass gets the standard form-control contract for free and only has to
 * call {@link TdFormElement#_setFormValue} (and optionally {@link TdFormElement#_setValidity})
 * whenever its value changes:
 *
 * - `static formAssociated = true` + `attachInternals()` so the element submits
 *   its value in any host `<form>` (FormData/POST) and participates in
 *   constraint validation, form reset, and `<fieldset disabled>` propagation.
 * - Reflected `name` / `disabled` / `required` attributes (public API unchanged).
 * - Read-only `form` / `validity` / `validationMessage` / `willValidate` / `labels`.
 * - `checkValidity()` / `reportValidity()` delegating to internals.
 * - **Label association (ISSUE-2):** an external `<label for="<host-id>">` targets
 *   the CUSTOM ELEMENT (form-associated CEs are labelable, so `el.labels` works);
 *   the host is given an `id` if it has none, the inner native control carries NO
 *   colliding `id`, and a label click focuses the inner control via the overridden
 *   {@link TdFormElement#focus}.
 * - **Default-state + reset (ISSUE-4):** the initial `value`/`checked` attributes are
 *   captured ONCE at connect, kept separate from the live state that mutates during
 *   use; {@link TdFormElement#formResetCallback} restores them. `setFormValue(value, state)`
 *   carries a display `state` for controls where the shown value ≠ the submitted value
 *   (e.g. dropdown label vs id); {@link TdFormElement#formStateRestoreCallback} re-applies
 *   it on autofill/bfcache.
 * - **Effective-disabled (ISSUE-5):** {@link TdFormElement#_effectiveDisabled} is
 *   `(disabled attr) OR (ancestor <fieldset disabled>)`. Rendering and every event
 *   guard read this flag; a fieldset-disabled state never reflects onto the `disabled`
 *   attribute.
 *
 * Subclasses override the small protected hooks (`_restoreDefaults`, `_restoreState`,
 * `_focusTarget`, `_validationAnchor`) as needed.
 *
 * @element (abstract)
 */
export class TdFormElement extends TdBaseElement {
  static formAssociated = true;

  /** @returns {string[]} Base observed attributes. Subclasses must spread these in. */
  static get observedAttributes() {
    return ['name', 'disabled', 'required'];
  }

  /**
   * Opt-in error contract (setError/clearError/`error-text`). Subclasses that return true must also
   * list `'error-text'` in their observedAttributes. Used by checkbox, switch, input-field, slider.
   * @returns {boolean}
   */
  static get errorContract() { return false; }

  /** @returns {string[]} Base boolean attributes. Subclasses must spread these in. */
  static get booleanAttributes() {
    return ['disabled', 'required'];
  }

  constructor() {
    super();
    /** @type {ElementInternals} */
    this._internals = this.attachInternals();
    /** @type {boolean} disabled attr OR ancestor <fieldset disabled> */
    this._effectiveDisabled = false;
    /** @type {boolean} last value from formDisabledCallback */
    this._ancestorDisabled = false;
    /** @private */
    this._defaultsCaptured = false;
    /** @type {string} initial `value` attribute, captured once */
    this._defaultValue = '';
    /** @type {boolean} initial `checked` attribute, captured once */
    this._defaultChecked = false;
    /** @private Constraint flags set by the subclass (separate from customError). */
    this._baseFlags = {};
    /** @private */
    this._baseMessage = '';
    /** @private @type {HTMLElement|undefined} */
    this._baseAnchor = undefined;
    /** @private Custom validity message (setCustomValidity), kept separate. */
    this._customMessage = '';
    /** @private Runtime error (setError); null = use the `error-text` attribute. */
    this._runtimeError = null;
  }

  connectedCallback() {
    // Compute effective-disabled BEFORE the first render so guards/styling are correct.
    this._effectiveDisabled = this.hasAttribute('disabled') || this._ancestorDisabled;
    // Assign the host id BEFORE the first render so a subclass that renders an internal
    // `<label for="${this.id}">` gets a real target on the very first paint (ISSUE-1).
    this._ensureId();
    super.connectedCallback(); // _setupProperties + first _doRender (if not yet initialized)
    // v0.26.0 (ADR 0012): server markup that could not be adopted was rendered → put the captured state back (silently).
    if (this._ssrRestore && !this._deferred) {
      const state = this._ssrRestore;
      this._ssrRestore = null;
      this._ssrControl = null; // review round 1 IMPL-3: the old control is gone — no stale reference
      this._restoreSsrState(state);
    }
    // External <label for="host-id">: the browser runs the label's activation on the HOST (form-associated
    // custom elements are labelable). Forward it to the inner control like a native one: focus it, and
    // activate checkable controls (checkbox/switch).
    if (!this._labelForwarder) {
      this._labelForwarder = (e) => {
        if (e.target !== this || this._effectiveDisabled) return;
        const control = this._focusTarget();
        if (!control) return;
        control.focus();
        if (control instanceof HTMLInputElement && (control.type === 'checkbox' || control.type === 'radio')) control.click();
      };
      this.addEventListener('click', this._labelForwarder);
    }
    if (!this._defaultsCaptured) {
      this._captureDefaults();
      this._defaultsCaptured = true;
    }
  }

  // --- Form identity / state (read-only, delegate to internals) ---

  /** @returns {HTMLFormElement|null} The owning form, or null. */
  get form() { return this._internals.form; }

  /** @returns {ValidityState} */
  get validity() { return this._internals.validity; }

  /** @returns {string} */
  get validationMessage() { return this._internals.validationMessage; }

  /** @returns {boolean} */
  get willValidate() { return this._internals.willValidate; }

  /** @returns {NodeList} Labels associated with this element via `<label for>`. */
  get labels() { return this._internals.labels; }

  /** @returns {boolean} */
  checkValidity() { return this._internals.checkValidity(); }

  /** @returns {boolean} */
  reportValidity() { return this._internals.reportValidity(); }

  // --- Value + validity wrappers (subclasses call these) ---

  /**
   * Set the value submitted in FormData.
   * @param {File|string|FormData|null} value - The submitted value (null = not submitted).
   * @param {File|string|FormData|null} [state] - Optional display/restore state when it differs
   *   from the submitted value (e.g. a dropdown's label vs its id).
   * @protected
   */
  _setFormValue(value, state) {
    if (this._deferred) return; // v0.26.0: the native SSR control still submits until the deferred render
    if (state === undefined) this._internals.setFormValue(value);
    else this._internals.setFormValue(value, state);
  }

  /**
   * Set constraint-validation flags. Passing an empty/all-false object clears validity.
   * @param {ValidityStateFlags} [flags] - e.g. `{ valueMissing: true }`.
   * @param {string} [message] - Validation message (required when any flag is set).
   * @param {HTMLElement} [anchor] - Element the browser anchors the validity bubble to.
   * @protected
   */
  _setValidity(flags = {}, message, anchor) {
    const hasFlag = flags && Object.values(flags).some(Boolean);
    this._baseFlags = hasFlag ? { ...flags } : {};
    this._baseMessage = hasFlag ? (message ?? '') : '';
    this._baseAnchor = anchor;
    this._applyValidity();
  }

  /**
   * Native-style custom validity hook. Mirrors `HTMLInputElement.setCustomValidity`:
   * a non-empty message adds a `customError`; an empty string clears ONLY the custom
   * error WITHOUT wiping subclass constraint flags like `valueMissing` (ISSUE-2).
   * @param {string} message
   */
  setCustomValidity(message) {
    this._customMessage = message || '';
    this._applyValidity();
  }

  /**
   * @private Merge subclass constraint flags with the custom-error message and push the
   * combined validity to internals. Custom message takes display precedence when present.
   */
  _applyValidity() {
    if (this._deferred) return; // v0.26.0: the native SSR control still validates until the deferred render
    const flags = { ...this._baseFlags };
    let message = this._baseMessage;
    if (this._customMessage) {
      flags.customError = true;
      message = this._customMessage;
    }
    const hasFlag = Object.values(flags).some(Boolean);
    if (!hasFlag) {
      this._internals.setValidity({});
      return;
    }
    // The stored anchor may have been detached by a re-render (TdBaseElement replaces
    // innerHTML), so only reuse it while it is still a descendant; else re-resolve it (ISSUE-4).
    const anchor = (this._baseAnchor && this.contains(this._baseAnchor))
      ? this._baseAnchor
      : this._validationAnchor();
    this._internals.setValidity(flags, message || ' ', anchor);
  }

  /**
   * Element the validity bubble anchors to. Defaults to the inner focusable control.
   * @returns {HTMLElement|undefined}
   * @protected
   */
  _validationAnchor() {
    return this._focusTarget() ?? undefined;
  }

  /**
   * Validation text from the subclass's static `messages` object (site-translatable, e.g.
   * `TdSlider.messages.rangeUnderflow = 'Minimum is {min}.'`), `{name}` placeholders filled from `vars`
   * (an unknown placeholder is left as is).
   * @param {string} key
   * @param {Object<string, *>} [vars]
   * @returns {string}
   * @protected
   */
  _msg(key, vars = {}) {
    const tpl = this.constructor.messages?.[key];
    return String(tpl ?? '').replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  }

  // --- Error contract (visual + a11y; constraint validity stays in setCustomValidity) ---

  /**
   * Show an error message for this control (aria-invalid + aria-errormessage + a text note).
   * `setError('')` / `clearError()` clears it. A later `error-text` attribute value replaces it.
   * @param {string} message
   */
  setError(message) {
    if (!this.constructor.errorContract) return;
    this._runtimeError = message ? String(message) : '';
    this._applyErrorState();
  }

  /** Clear the error set by setError() or the `error-text` attribute. */
  clearError() {
    this.setError('');
  }

  /** @returns {string} the error currently shown ('' = none) */
  get errorMessage() {
    if (this._runtimeError != null) return this._runtimeError;
    return this.getAttribute('error-text') || '';
  }

  /**
   * Where the error note is placed (appended). Default: the host.
   * @returns {HTMLElement}
   * @protected
   */
  _errorHost() {
    return this;
  }

  /**
   * Insert a freshly created error note. Default: append to `_errorHost()`. Subclasses with a footer
   * (td-input-field) override to prepend it there.
   * @param {HTMLElement} note
   * @protected
   */
  _mountErrorNote(note) {
    this._errorHost().appendChild(note);
  }

  /**
   * Ids (helper note, counter…) the subclass wants in the control's `aria-describedby`, besides the error.
   * @returns {string[]}
   * @protected
   */
  _describedByIds() {
    return [];
  }

  /**
   * Merge the component-owned description ids (+ the error id while an error shows) into the control's
   * `aria-describedby`, preserving any ids the page put there itself.
   * @protected
   */
  _syncDescribedBy() {
    const target = this._focusTarget();
    if (!target) return;
    const own = [...this._describedByIds()];
    if (this.constructor.errorContract && this.errorMessage) own.push(`${this.id}-error`);
    const prevOwn = this._ownDescribedBy || new Set();
    let foreign;
    if (this._describedByTarget && this._describedByTarget !== target) {
      // The control was replaced by a re-render: keep the page's own ids from the previous control.
      foreign = this._foreignDescribedBy || [];
    } else {
      const current = (target.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
      foreign = current.filter((idRef) => !prevOwn.has(idRef));
    }
    this._describedByTarget = target;
    this._foreignDescribedBy = foreign;
    const next = [...new Set([...foreign, ...own])];
    if (next.length) target.setAttribute('aria-describedby', next.join(' '));
    else target.removeAttribute('aria-describedby');
    this._ownDescribedBy = new Set(own);
  }

  /**
   * Accessible-name precedence shared by every form control: (1) a visible internal label names it (nothing
   * to add); (2) else the host `aria-label` is copied to the control; (3) else the ids of external
   * `<label for="host-id">` elements (generated when missing) become the control's `aria-labelledby`.
   * @param {HTMLElement|null} control
   * @param {boolean} hasVisibleLabel
   * @protected
   */
  _applyAccessibleName(control, hasVisibleLabel) {
    if (!control) return;
    control.removeAttribute('aria-label');
    if (!hasVisibleLabel) control.removeAttribute('aria-labelledby');
    if (hasVisibleLabel) return;
    const aria = this.getAttribute('aria-label');
    if (aria) { control.setAttribute('aria-label', aria); return; }
    const labels = this._internals && this._internals.labels ? [...this._internals.labels] : [];
    const ids = labels.map((l) => {
      if (!l.id) l.id = `td-lbl-${++_labelIdCounter}`;
      return l.id;
    });
    if (ids.length) control.setAttribute('aria-labelledby', ids.join(' '));
  }

  /** @protected Sync the note + aria on the focus target with the current error. */
  _applyErrorState() {
    if (!this.constructor.errorContract || !this._initialized) return;
    const msg = this.errorMessage;
    const target = this._focusTarget();
    const id = `${this.id}-error`;
    // Direct reference (no selector built from the id); a re-render detaches it → recreate.
    let note = this._errorNote && this.contains(this._errorNote) ? this._errorNote : null;
    if (msg) {
      if (!note) {
        note = document.createElement('span');
        note.className = 'td-field-error';
        this._mountErrorNote(note);
        this._errorNote = note;
      }
      note.id = id;
      note.setAttribute('data-for', this.id);
      note.textContent = msg;
      if (target) {
        target.setAttribute('aria-invalid', 'true');
        target.setAttribute('aria-errormessage', id);
      }
    } else {
      if (note) note.remove();
      this._errorNote = null;
      if (target) {
        target.removeAttribute('aria-invalid');
        target.removeAttribute('aria-errormessage');
      }
    }
    this._syncDescribedBy(); // error id also in aria-describedby (aria-errormessage support is patchy)
  }

  // --- Defaults + reset (ISSUE-4) ---

  /**
   * Capture the initial submitted state ONCE, separate from the live value.
   * Subclasses with non-`value` semantics may override.
   * @protected
   */
  _captureDefaults() {
    this._defaultValue = this.getAttribute('value') ?? '';
    this._defaultChecked = this.hasAttribute('checked');
  }

  /** Restore live state to the captured defaults on form reset (also clears a shown error). */
  formResetCallback() {
    this._restoreDefaults();
    if (this.constructor.errorContract) {
      this._runtimeError = '';
      this._applyErrorState();
    }
  }

  /**
   * Restore the control's live state to its captured defaults. Default implementation
   * handles `value`-based controls; checkbox/toggle/dropdown/datetime override.
   * @protected
   */
  _restoreDefaults() {
    if (this.constructor.observedAttributes.includes('value')) {
      this.value = this._defaultValue; // setter reflects the attribute → re-render
    }
  }

  /**
   * Re-apply restored state on autofill / bfcache restore.
   * @param {File|string|FormData} state
   * @param {'restore'|'autocomplete'} mode
   */
  formStateRestoreCallback(state, mode) {
    this._restoreState(state, mode);
  }

  /**
   * Apply a restored `state` (the 2nd arg of setFormValue) back to the live UI.
   * Stateful controls where display ≠ submitted value override this.
   * @param {File|string|FormData} state
   * @param {'restore'|'autocomplete'} _mode
   * @protected
   */
  _restoreState(state, _mode) {
    if (this.constructor.observedAttributes.includes('value') && typeof state === 'string') {
      this.value = state;
    }
  }

  // --- Disabled propagation (ISSUE-5) ---

  /**
   * Called by the platform when an ancestor `<fieldset disabled>` toggles.
   * Updates the effective-disabled state WITHOUT touching the `disabled` attribute.
   * @param {boolean} disabled
   */
  formDisabledCallback(disabled) {
    this._ancestorDisabled = !!disabled;
    this._syncEffectiveDisabled();
  }

  /** @private Recompute `_effectiveDisabled`; re-render only if it changed. */
  _syncEffectiveDisabled() {
    const next = this.hasAttribute('disabled') || this._ancestorDisabled;
    if (next !== this._effectiveDisabled) {
      this._effectiveDisabled = next;
      if (this._initialized) this._doRender();
    }
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (name === 'error-text' && this.constructor.errorContract) {
      if (oldVal !== newVal) {
        this._runtimeError = null; // the latest attribute value is the current intent
        this._applyErrorState();
      }
      return; // no re-render needed
    }
    if (name === 'disabled') {
      // Keep effective-disabled in sync, then fall through to the base re-render.
      this._effectiveDisabled = newVal !== null || this._ancestorDisabled;
    }
    super.attributeChangedCallback(name, oldVal, newVal);
  }

  // --- SSR hydrate of a form-associated component (v0.26.0, ADR 0012 §3–5) ---
  //
  // A subclass's canHydrate() finds the server-rendered native control (`this._ssrControl`), captures its state with
  // `_ssrCapture(control, live)` (precedence: early property > live native state > attribute; `live` = the native state
  // only), stores the native defaults (`this._ssrDefaults`, reset target) and then returns:
  //   true     → hydrateExisting() adopts the SAME nodes (state onto the host, ElementInternals FIRST, then the no-JS-only
  //              attributes come off the control, external labels move to the host);
  //   false    → normal render, then `_restoreSsrState(this._ssrRestore)` (connectedCallback above);
  //   'defer'  → the control has focus: deferHydration() below waits for its blur.

  /**
   * v0.26.0 (F0): the refused SSR control has focus → do not replace it under the user's fingers. The early / resolved
   * state is pushed into it (`_ssrPrime`), the native control keeps submitting + validating alone (internals cleared),
   * ONE capture-phase `blur` listener (removed on disconnect) then captures the LIVE state, resumes (one render = one
   * bind) and restores that state into the new control without events.
   * @param {() => boolean} resume
   */
  deferHydration(resume) {
    const control = this._ssrControl;
    const state = this._ssrRestore;
    this._ssrRestore = null;
    if (!control || !state) {
      if (resume() && state) this._restoreSsrState(state);
      return;
    }
    this._ssrPrime(control, state);
    this._internals.setFormValue(null);
    this._internals.setValidity({});
    // Review round 1 IMPL-3: the listener and ITS cleanup entry go away together (blur) — a disconnect first runs it.
    const off = () => control.removeEventListener('blur', onBlur, true);
    const onBlur = () => {
      off();
      this._cleanups = this._cleanups.filter((fn) => fn !== off);
      const live = this._ssrCapture(control, true);
      this._ssrControl = null;
      if (resume()) this._restoreSsrState(live);
    };
    control.addEventListener('blur', onBlur, true);
    this._cleanups.push(off);
  }

  /**
   * @protected SSR state of `control` (subclass). `live` = ignore early properties (re-evaluation, blur).
   * @param {HTMLElement} _control @param {boolean} _live
   * @returns {object}
   */
  _ssrCapture(_control, _live) { return {}; }

  /** @protected Push a captured state into the still-native control while deferred (subclass). */
  _ssrPrime(_control, _state) {}

  /** @protected Put a captured state into the rendered control, silently (subclass). */
  _restoreSsrState(_state) {}

  /**
   * @protected An SSR markup check found the control: record it + the native defaults (once), capture its state, and
   * turn "does the markup match" into the canHydrate() decision (see the block comment above).
   * @param {HTMLElement} control
   * @param {boolean} matches
   * @param {boolean} live
   * @returns {boolean|'defer'}
   */
  _ssrDecide(control, matches, live) {
    this._ssrControl = control;
    const state = this._ssrCapture(control, live);
    if (matches) {
      this._ssrState = state;
      return true;
    }
    this._ssrRestore = state;
    if (control !== control.ownerDocument.activeElement) return false;
    // Review round 1 SEC-01: only BENIGN drift (label text, size…) may stay live under the user's fingers until blur.
    // Markup refused for a security reason (attribute outside the allowlists — on*, style, form… —, unexpected
    // element / node) is replaced AT ONCE; the state (value, selection, checked) and the focus move to the new control.
    if (this._ssrUnsafe()) {
      state.refocus = true;
      return false;
    }
    return 'defer';
  }

  /**
   * @protected Review round 1 SEC-01: does anything under the host fall outside what php/td.php / render() can produce,
   * whatever the structure? Unexpected node types or elements (only the form-control parts + inline icon SVG are
   * known), or an attribute outside the allowlists (control: SSR_CONTROL_ATTRS + aria-* / data-* without data-td-*;
   * parts: + `for` / `data-for` / the icon slot's data-td-icon*; SVG: geometry + presentation attributes).
   * @returns {boolean}
   */
  _ssrUnsafe() {
    const walk = (node) => [...node.childNodes].some((n) => {
      if (n.nodeType === 3 || n.nodeType === 8) return false;
      if (n.nodeType !== 1) return true;
      const svg = n.namespaceURI === 'http://www.w3.org/2000/svg';
      if (svg ? !SSR_SVG_TAGS.has(n.localName) : (n.namespaceURI !== 'http://www.w3.org/1999/xhtml' || !SSR_HTML_TAGS.has(n.localName))) return true;
      const control = n.localName === 'input' || n.localName === 'textarea';
      if (n.localName === 'input' && !SSR_INPUT_TYPES.has((n.getAttribute('type') || 'text').toLowerCase())) return true;
      const ok = (name) => (svg ? SSR_SVG_ATTRS.has(name)
        : SSR_CONTROL_ATTRS.has(name) || SSR_ARIA_DATA.test(name) || (!control && SSR_PART_ATTRS.has(name)));
      if (![...n.attributes].every((a) => ok(a.name))) return true;
      return walk(n);
    });
    return walk(this);
  }

  /**
   * @protected Hydrate step 4: only EXTERNAL `<label for="{control id}">` (outside the host) move to the host, like a
   * labelled form-associated element (the component forwards the activation to the control). Internal / wrapping
   * labels stay — they keep naming the control.
   * @param {HTMLElement} control
   */
  _ssrRetargetLabels(control) {
    if (!control.id || !control.labels) return;
    for (const l of [...control.labels]) {
      if (!this.contains(l) && l.htmlFor === control.id) l.htmlFor = this.id;
    }
  }

  // --- Id + label-click focus delegation (ISSUE-2) ---

  /** @private Give the host an id so external `<label for>` can target it. */
  _ensureId() {
    if (!this.id) {
      this.id = `td-${this.localName || 'form-el'}-${++_autoIdCounter}`;
    }
  }

  /**
   * The inner focusable native control. Subclasses override to return their
   * `<input>`/`<textarea>`/button so label clicks and validity bubbles land there.
   * @returns {HTMLElement|null}
   * @protected
   */
  _focusTarget() {
    return this.querySelector('input, textarea, select, [contenteditable="true"], button, [tabindex]');
  }

  /**
   * Delegate focus to the inner control. Clicking an external `<label for="<host-id>">`
   * focuses this element (FACE elements are labelable); we forward that to the real control.
   * @param {FocusOptions} [options]
   */
  focus(options) {
    const target = this._focusTarget();
    if (target && typeof target.focus === 'function') target.focus(options);
    else super.focus(options);
  }
}
