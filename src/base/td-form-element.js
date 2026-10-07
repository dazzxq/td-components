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
  'autocorrect', 'spellcheck', 'placeholder', 'readonly', 'required', 'disabled', 'maxlength', 'minlength', 'min', 'max', 'step',
  'pattern', 'size', 'rows', 'cols']);

/** Review round 1 SEC-01 — what can legitimately sit under a form host (php/td.php element mode + render()). */
const SSR_HTML_TAGS = new Set(['div', 'label', 'span', 'input', 'textarea']);
const SSR_SVG_TAGS = new Set(['svg', 'title', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse']);
const SSR_INPUT_TYPES = new Set(['text', 'password', 'email', 'number', 'url', 'search', 'tel', 'date', 'month',
  'datetime-local', 'time', 'checkbox']);
/** Every form-associated element (review rounds 2 + 4: exactly one may exist under a hydrated host). */
const SSR_FORM_ASSOCIATED = 'input, textarea, select, button, fieldset, output, object';
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
 * v0.54.0 (plan v0.54.0-hint QĐ 11): the helper note php/td.php prints for a control (`div.td-field__note#{host}-note`,
 * text only, optionally `hidden` while an error shows) — the SSR checks accept it right before the error note.
 * @param {Node} n @param {string} hostId
 */
export const ssrIsHelperNote = (n, hostId) => n.nodeType === 1 && n.localName === 'div' && ssrClassKey(n) === 'td-field__note'
  && n.id === `${hostId}-note` && [...n.attributes].every((a) => ['class', 'id', 'hidden'].includes(a.name)) && n.children.length === 0;

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
    // v0.54.0 (plan v0.54.0-hint QĐ 1): `helper-text` is part of every form control's contract (in place, never a render)
    return ['name', 'disabled', 'required', 'helper-text'];
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
    /** @private v0.54.0: runtime helper (setHelper); null = use the `helper-text` attribute. */
    this._runtimeHelper = null;
    /** @private v0.54.0: the page's rich <td-hint> child (QĐ 4), taken out of the host before the first render */
    this._hintChild = null;
    /** @private v0.54.0: the text note the BASE created (the controls that render their own note never set it) */
    this._ownNote = null;
    /** @private v0.54.0: standalone <td-hint for> linked to this control → the token (its id) it wrote (QĐ 5) */
    this._linkedHints = new Map();
  }

  connectedCallback() {
    // v0.54.0 (QĐ 4): a rich <td-hint> child (no `for`) is taken out BEFORE the first render / hydrate (render replaces
    // innerHTML; the SSR checks never see it) and mounted in the hint slot after every bind.
    if (!this._initialized) this._takeHintChild();
    // Compute effective-disabled BEFORE the first render so guards/styling are correct.
    this._effectiveDisabled = this.hasAttribute('disabled') || this._ancestorDisabled;
    // Assign the host id BEFORE the first render so a subclass that renders an internal
    // `<label for="${this.id}">` gets a real target on the very first paint (ISSUE-1).
    this._ensureId();
    super.connectedCallback(); // _setupProperties + first _doRender (if not yet initialized)
    this._ssrFreshRender = false; // review round 4: only the render replacing refused SSR markup ignores the old DOM
    // v0.26.0 (ADR 0012): server markup that could not be adopted was rendered → put the captured state back (silently).
    if (this._ssrRestore) {
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

  // --- Helper contract (v0.54.0, plan docs/internal/plans/v0.54.0-hint.md QĐ 1–4) ---

  /**
   * Set the helper text ('' clears it). A later `helper-text` attribute value replaces it.
   * @param {string} msg
   */
  setHelper(msg) {
    this._runtimeHelper = msg ? String(msg) : '';
    this._applyHelperState();
  }

  /** @returns {string} the helper text currently applied ('' = none); a rich <td-hint> child is not text */
  get helperMessage() {
    if (this._runtimeHelper != null) return this._runtimeHelper;
    return this.getAttribute('helper-text') || '';
  }

  /**
   * @protected `helper-text` is handled here, in place (no render). Every subclass with its own
   * attributeChangedCallback calls this first: `if (this._helperAttr(name, oldVal, newVal)) return;`.
   * @returns {boolean} the attribute was `helper-text` (handled)
   */
  _helperAttr(name, oldVal, newVal) {
    if (name !== 'helper-text') return false;
    if (oldVal !== newVal) {
      this._runtimeHelper = null; // the latest attribute value is the current intent
      this._applyHelperState();
    }
    return true;
  }

  /**
   * @protected The kit text note: tag, class and id suffix (`{host-id}-{idSuffix}`). Default `div.td-field__note#{id}-note`;
   * media-field / media-gallery keep their `span.__help#{id}-help` (contract @1).
   * @returns {{ tag: string, className: string, idSuffix: string }}
   */
  _helperNoteSpec() {
    return { tag: 'div', className: 'td-field__note', idSuffix: 'note' };
  }

  /**
   * @protected Where the hint goes — the kit text note AND a rich <td-hint> child (Codex r1 #4): `before` null = append.
   * Default: the error host, right before the error note → `[control][hint][error]`.
   * @returns {{ parent: Element, before: Node|null }|null}
   */
  _helperSlot() {
    const parent = this._errorHost();
    if (!parent) return null;
    const err = this._errorNote && this._errorNote.parentNode === parent ? this._errorNote : null;
    return { parent, before: err };
  }

  /** @protected Hook after the hint state changed (footer visibility…). */
  _helperChanged() {}

  /** @private the hint is hidden while an error shows (QĐ 3) — only controls with an error contract */
  _helperSuppressed() {
    return !!this.constructor.errorContract && !!this.errorMessage;
  }

  /** @private QĐ 4: take the first rich <td-hint> child (no `for`) out of the host, keep the node */
  _takeHintChild() {
    if (this._hintChild) return;
    const all = [...this.children].filter((c) => c.localName === 'td-hint');
    const kids = all.filter((c) => !c.hasAttribute('for'));
    // Codex impl r1 #6: every OTHER direct <td-hint> (a second one, a standalone `for` one) is the page's: set aside with
    // the owned one before each render (innerHTML would destroy it) and put back, the same node, at the end of the host
    this._extraHints = all.filter((c) => c !== kids[0]);
    this._extrasAside = new WeakSet();
    for (const x of this._extraHints) { x.remove(); this._extrasAside.add(x); }
    if (kids.length > 1 && !this._warnedHints) {
      this._warnedHints = true;
      console.warn(`<${this.localName}>: only the first <td-hint> child is the control's hint; the others are left as they are`);
    }
    if (!kids.length) return;
    const hint = kids[0];
    hint.remove();
    hint._tdOwner = this;
    this._hintChild = hint;
    this._hintDetached = true;
    if (this.hasAttribute('helper-text')) console.warn(`<${this.localName}>: a <td-hint> child replaces helper-text`);
  }

  /** @protected The page removed the <td-hint> child (TdHint calls this): the text note comes back. */
  _releaseHint(hint) {
    if (hint !== this._hintChild || this.contains(hint)) return;
    this._hintChild = null;
    hint._tdOwner = null;
    hint.removeAttribute('data-td-suppressed');
    this._applyHelperState();
  }

  /** @protected A standalone <td-hint for> linked itself to this control with `token` (its id). */
  _linkHint(hint, token) {
    this._linkedHints.set(hint, token);
    this._applyHelperState();
  }

  /** @protected The standalone <td-hint for> left this control. */
  _unlinkHint(hint) {
    if (!this._linkedHints.delete(hint)) return;
    hint.removeAttribute('data-td-suppressed');
    this._applyHelperState();
  }

  /** @protected ids of the hint parts currently shown (child hint or text note, then linked hints) — for _describedByIds() */
  _helperDescribedByIds() {
    const ids = [];
    if (this._helperSuppressed()) return ids;
    const el = this._helperEl;
    if (el && el.id && !el.hidden && this.contains(el)) ids.push(el.id);
    for (const [hint, token] of this._linkedHints) if (token && !hint.hidden) ids.push(token);
    return ids;
  }

  /**
   * @protected Put the hint DOM in its state (QĐ 1–4): text note (created / updated / hidden), the rich child mounted in the
   * slot (it owns the id then — the text note gives it up), the error rule, then the description. Idempotent; runs after
   * every bind (render, hydrate, re-connect), on helper / error changes and when hints link / unlink.
   */
  _applyHelperState() {
    if (!this._initialized) return;
    const slot = this._helperSlot();
    if (!slot || !slot.parent) return;
    const spec = this._helperNoteSpec();
    const noteId = `${this.id}-${spec.idSuffix}`;
    const off = this._helperSuppressed();
    const child = this._hintChild;
    if (child && !this._hintDetached && !this.contains(child)) { // moved / removed by the page
      this._releaseHint(child);
      return;
    }
    let note = this._ownNote && this._ownNote.parentNode === slot.parent ? this._ownNote : null;
    if (!note) note = [...slot.parent.children].find((c) => c.localName === spec.tag && c.classList.contains(spec.className)) || null;
    const rendered = !!note && note !== this._ownNote; // a note render() prints (input / number / choice / media)
    if (child) {
      // Codex r1 #1: exactly one element carries the hint id — the text note gives it up (rendered) or goes (base-made)
      if (note) {
        if (rendered) {
          if (note.id === noteId || note.id === child.id) note.removeAttribute('id');
          note.textContent = '';
          note.hidden = true;
        } else {
          note.remove();
          this._ownNote = null;
        }
      }
      if (!child.id) child.id = noteId;
      const ref = slot.before && slot.before.parentNode === slot.parent ? slot.before : null;
      const placed = child.parentNode === slot.parent && (ref ? child.nextSibling === ref : slot.parent.lastChild === child);
      if (!placed) slot.parent.insertBefore(child, ref);
      this._hintDetached = false;
      child.toggleAttribute('data-td-suppressed', off);
      this._helperEl = child;
    } else {
      const text = this.helperMessage;
      if (text && !note) {
        note = document.createElement(spec.tag);
        note.className = spec.className;
        const ref = slot.before && slot.before.parentNode === slot.parent ? slot.before : null;
        slot.parent.insertBefore(note, ref);
        this._ownNote = note;
      }
      if (note) {
        if (!text && note === this._ownNote) {
          note.remove();
          this._ownNote = null;
          note = null;
        } else {
          note.id = noteId;
          if (note.textContent !== text) note.textContent = text;
          note.hidden = !text || off;
        }
      }
      this._helperEl = note && text ? note : null;
    }
    for (const hint of this._linkedHints.keys()) hint.toggleAttribute('data-td-suppressed', off);
    this._syncDescribedBy();
    this._helperChanged();
  }

  /**
   * @private v0.54.0: every bind (render, SSR adopt, re-connect) ends with the hint state — no subclass has to remount it.
   */
  _bindStep() {
    super._bindStep();
    this._applyHelperState();
    this._restoreExtraHints();
  }

  /** @private Codex impl r1 #6: the page's other <td-hint> children the kit set aside come back (same nodes, host end) */
  _restoreExtraHints() {
    for (const x of this._extraHints || []) {
      if (!x.parentNode && this._extrasAside.has(x)) {
        this._extrasAside.delete(x);
        this.appendChild(x);
      }
    }
  }

  /** @private v0.54.0: a full render replaces innerHTML — the rich hint child is set aside first (same node kept). */
  _doRender() {
    if (this._suppressRender) return;
    if (this._hintChild && this._hintChild.parentNode) {
      this._hintDetached = true;
      this._hintChild.remove();
    }
    for (const x of this._extraHints || []) {
      if (x.parentNode === this) { x.remove(); this._extrasAside.add(x); }
    }
    super._doRender();
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
    return this._helperDescribedByIds();
  }

  /**
   * Merge the component-owned description ids (+ the error id while an error shows) into the control's
   * `aria-describedby`, preserving any ids the page put there itself.
   * @protected
   */
  _syncDescribedBy() {
    const target = this._ariaTarget();
    if (!target) return;
    const own = [...this._describedByIds()];
    if (this.constructor.errorContract && this.errorMessage) own.push(`${this.id}-error`);
    const prevOwn = this._ownDescribedBy || new Set();
    let foreign;
    const old = this._describedByTarget;
    if (old && old !== target && this.contains(old)) {
      // v0.54.0 (QĐ 3b): the aria target MOVED inside the host (td-check-matrix's roving cell) — the component's ids
      // leave the old element (its other ids stay), the new one keeps its own foreign ids.
      const rest = (old.getAttribute('aria-describedby') || '').split(/\s+/).filter((x) => x && !prevOwn.has(x));
      if (rest.length) old.setAttribute('aria-describedby', rest.join(' '));
      else old.removeAttribute('aria-describedby');
      const current = (target.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
      foreign = current.filter((idRef) => !prevOwn.has(idRef));
    } else if (old && old !== target) {
      // The control was replaced by a re-render: keep the page's own ids from the previous control.
      foreign = this._foreignDescribedBy || [];
    } else {
      const current = (target.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
      foreign = current.filter((idRef) => !prevOwn.has(idRef));
    }
    // v0.54.0: the helper note / error ids derived from the host id are the component's even when the server printed
    // them (SSR) — never kept as page ids (the order and the error rule stay the component's)
    const derived = new Set([`${this.id}-${this._helperNoteSpec().idSuffix}`, `${this.id}-error`]);
    foreign = foreign.filter((idRef) => !derived.has(idRef));
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
    const target = this._ariaTarget();
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
    // error id also in aria-describedby (aria-errormessage support is patchy); v0.54.0: the hint follows the error (QĐ 3)
    this._syncDescribedBy();
    this._applyHelperState();
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
    if (this._helperAttr(name, oldVal, newVal)) return;
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
  //   true  → hydrateExisting() adopts the SAME nodes (state onto the host, ElementInternals FIRST, then the no-JS-only
  //           attributes come off the control, external labels move to the host);
  //   false → safe render AT ONCE, then `_restoreSsrState(this._ssrRestore)` (connectedCallback above) puts the value /
  //           selection / checked / indeterminate / control id back and, when the control had focus, the focus too —
  //           without events. Review round 3 (ADR 0012 §5): there is no deferral, whatever the reason of the mismatch.

  /**
   * @protected SSR state of `control` (subclass). `live` = ignore early properties (re-connect revalidation).
   * @param {HTMLElement} _control @param {boolean} _live
   * @returns {object}
   */
  _ssrCapture(_control, _live) { return {}; }

  /** @protected Put a captured state into the rendered control, silently; `state.refocus` → focus it (subclass). */
  _restoreSsrState(_state) {}

  /**
   * @protected An SSR markup check found the control: record it, capture its state, and turn the checks into the
   * canHydrate() decision. Adopted only when the component's structural match (`matches`), the subtree scan
   * (`_ssrUnsafe()`) and the skeleton / cardinality check (`_ssrSkeletonOk()`) all pass; anything else → safe render now
   * + restore (focus included when the control had it).
   * @param {HTMLElement} control
   * @param {boolean} matches
   * @param {boolean} live
   * @returns {boolean}
   */
  _ssrDecide(control, matches, live) {
    this._ssrControl = control;
    const state = this._ssrCapture(control, live);
    if (matches && !this._ssrUnsafe() && this._ssrSkeletonOk()) {
      this._ssrState = state;
      return true;
    }
    state.refocus = control === control.ownerDocument.activeElement;
    this._ssrRestore = state;
    this._ssrFreshRender = true; // review round 4: the render reads the host, never the refused DOM
    return false;
  }

  /**
   * @protected Review round 4 (ISSUE-8): the ONLY trustworthy source of SSR state. The control at the exact skeleton
   * slot of the current schema (`_ssrSlotControl()`, unique there) wins; without one, the generic fallback (unsupported
   * schema / drift) is used only when the host holds exactly ONE form-associated element and it is a plausible control
   * (`_ssrPlausible()`). Otherwise null: several candidates / ambiguous slot → no state, default, id or focus is ever
   * taken from any of them (an injected control placed first would otherwise win by query order).
   * @returns {HTMLElement|null}
   */
  _ssrStateSource() {
    const slot = this._ssrSlotControl();
    if (slot) return slot;
    const all = this.querySelectorAll(SSR_FORM_ASSOCIATED);
    return all.length === 1 && all[0].matches(this._ssrPlausible()) ? all[0] : null;
  }

  /**
   * @protected v0.54.0 (QĐ 11): the host's content nodes WITHOUT the helper note php/td.php prints (the base mounts it, so
   * render() never has it): `div.td-field__note#{id}-note` right before a trailing error note, else last. It must be there
   * exactly when a helper text is set (else null = not the component's markup → safe render).
   * @param {Node[]} nodes
   * @returns {Node[]|null}
   */
  _ssrWithoutHelperNote(nodes) {
    const last = nodes.length - 1;
    const i = last >= 0 && ssrIsErrorNote(nodes[last]) ? last - 1 : last;
    const has = i >= 0 && ssrIsHelperNote(nodes[i], this.id);
    if (has !== !!this.helperMessage || (has && this._hintChild)) return null;
    return has ? nodes.filter((_, j) => j !== i) : nodes;
  }

  /** @protected The unique control at the expected skeleton slot, or null (subclass). @returns {HTMLElement|null} */
  _ssrSlotControl() { return null; }

  /** @protected Selector of a plausible stateful control for the fallback (subclass). @returns {string} */
  _ssrPlausible() { return 'input, textarea'; }

  /**
   * @protected Review round 4: no trustworthy state source → render clean from the host attributes only; the focus
   * goes to the new control only when it was inside the host (and the element is connected — `live` = re-connect).
   * @param {boolean} live
   * @returns {false}
   */
  _ssrClean(live) {
    this._ssrControl = null;
    const active = this.ownerDocument.activeElement;
    this._ssrRestore = { clean: true, refocus: !live && !!active && active !== this && this.contains(active) };
    this._ssrFreshRender = true;
    return false;
  }

  /**
   * @protected Review round 3: on the FIRST hydrate the no-JS form attributes the server printed on the control must
   * still agree with the host (a script changed `name` / `required` / `disabled` / a constraint on either side before
   * define → the markup is no longer the component's: safe render). Booleans compare by presence.
   * @param {HTMLElement} control
   * @param {Array<[string, string]>} pairs [host attribute, control attribute]
   * @param {string[]} booleans host attribute names compared by presence
   * @returns {boolean}
   */
  _ssrFormAttrsAgree(control, pairs, booleans) {
    return pairs.every(([h, c]) => (booleans.includes(h)
      ? this.hasAttribute(h) === control.hasAttribute(c)
      : this.getAttribute(h) === control.getAttribute(c)));
  }

  /**
   * @protected Re-connect of a HYDRATED element (review round 1 IMPL-2): re-bind in place only while the markup still
   * passes the same gate as adoption (strict structure, subtree scan, skeleton); else capture the live state of the
   * current control so it is restored after the re-render.
   * @param {HTMLElement|null} control
   * @returns {boolean}
   */
  _ssrRevalidate(control) {
    if (!this._hydrated) return false;
    this._ssrControl = control;
    const ok = !!control && this._markupMatches(false) && !this._ssrUnsafe() && this._ssrSkeletonOk();
    this._ssrControl = null;
    if (ok) return true;
    // review round 4: `control` comes from _ssrStateSource() — null (ambiguous) → clean render, nothing transplanted
    if (!control) return this._ssrClean(true);
    this._ssrRestore = this._ssrCapture(control, true);
    this._ssrFreshRender = true;
    return false;
  }

  /** @protected Strict structural match with render() (subclass). @param {boolean} _first */
  _markupMatches(_first) { return false; }

  /**
   * @protected The host holds the component's known skeleton (tags / classes / cardinality of every part,
   * `this._ssrControl` in its place). Part of the adoption gate. Subclass; default: false (never adopt).
   * @returns {boolean}
   */
  _ssrSkeletonOk() { return false; }

  /**
   * @protected Review round 1 SEC-01: does anything under the host fall outside what php/td.php / render() can produce,
   * whatever the structure? Unexpected node types or elements (only the form-control parts + inline icon SVG are
   * known), or an attribute outside the allowlists (control: SSR_CONTROL_ATTRS + aria-* / data-* without data-td-*;
   * parts: + `for` / `data-for` / the icon slot's data-td-icon*; SVG: geometry + presentation attributes).
   * @returns {boolean}
   */
  _ssrUnsafe() {
    // v0.49.0: parts the subclass already compared EXACTLY with render() (e.g. the number stepper's buttons) are not
    // re-checked against the generic tag / attribute allowlist, nor counted as a second control; their subtree is.
    const verified = new Set(this._ssrVerifiedParts());
    const walk = (node) => [...node.childNodes].some((n) => {
      if (n.nodeType === 3 || n.nodeType === 8) return false;
      if (n.nodeType !== 1) return true;
      if (verified.has(n)) return walk(n);
      const svg = n.namespaceURI === 'http://www.w3.org/2000/svg';
      if (svg ? !SSR_SVG_TAGS.has(n.localName) : (n.namespaceURI !== 'http://www.w3.org/1999/xhtml' || !SSR_HTML_TAGS.has(n.localName))) return true;
      const control = n.localName === 'input' || n.localName === 'textarea';
      if (n.localName === 'input' && !SSR_INPUT_TYPES.has((n.getAttribute('type') || 'text').toLowerCase())) return true;
      const ok = (name) => (svg ? SSR_SVG_ATTRS.has(name)
        : SSR_CONTROL_ATTRS.has(name) || SSR_ARIA_DATA.test(name) || (!control && SSR_PART_ATTRS.has(name)));
      if (![...n.attributes].every((a) => ok(a.name))) return true;
      return walk(n);
    });
    if (walk(this)) return true;
    // Review round 2: exactly ONE native control — any other form-associated element (an injected hidden input /
    // textarea would submit with the form) makes the markup unsafe.
    const controls = [...this.querySelectorAll(SSR_FORM_ASSOCIATED)].filter((c) => !verified.has(c));
    return controls.length !== 1 || controls[0] !== this._ssrControl;
  }

  /**
   * @protected v0.49.0: elements under the host that the subclass verified exactly against render() before calling
   * `_ssrDecide()` (structure + attributes) and that may therefore be extra form-associated elements (buttons). Default: none.
   * @returns {Element[]}
   */
  _ssrVerifiedParts() { return []; }

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
   * v0.49.0: the element carrying the error / description ARIA (`aria-invalid`, `aria-errormessage`, `aria-describedby`).
   * Default: the focus target; a group control (td-choice-group) returns its `role="radiogroup"` element.
   * @returns {HTMLElement|null}
   * @protected
   */
  _ariaTarget() {
    return this._focusTarget();
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
