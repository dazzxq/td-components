import {
  TdFormElement, ssrClassKey, ssrContentNodes, ssrSamePart, ssrIsErrorNote, SSR_ARIA_DATA, SSR_CONTROL_ATTRS,
} from './td-form-element.js';
import { fillIconSlots } from '../icons/td-icon.js';
import { ssrMarker } from './td-base-element.js';

/** v0.26.0: attributes of the server-rendered input that exist only for the no-JS form (removed on hydrate). */
const SSR_ONLY = ['name', 'value', 'checked', 'required'];
/** Attributes the component itself puts on its input / wrapping label (state, not structure). */
const OWN_INPUT_ATTRS = ['aria-busy', 'aria-invalid', 'aria-errormessage', 'aria-describedby', 'aria-label', 'aria-labelledby'];
const LABEL_ATTRS = ['class', 'data-pending', 'data-dragging'];

/**
 * Shared base for checkbox-like controls (td-checkbox, td-toggle). Plan: docs/internal/plans/v0.7.0-batch1.md.
 *
 * - The inner control is a native `<input type="checkbox">` (subclass `_focusTarget()`), so focus, Space,
 *   disabled and form semantics are native.
 * - `checked` changes update the input IN PLACE (no re-render → keyboard focus is kept).
 * - Exactly ONE `change` event reaches the page: the input's native `change`/`input` are stopped at the host
 *   and the host emits a CustomEvent `change` `{ checked }` (keyboard and pointer alike).
 * - Accessible name precedence: internal `label` attr (the wrapping `<label>`) → host `aria-label` (copied to
 *   the input) → external `<label for="host-id">` elements (their ids become the input's `aria-labelledby`).
 * - Error contract (TdFormElement.setError / `error-text`) on by default.
 * - Per-instance colour: host CSSOM custom property (`_colorProperty()`), value through safeColor.
 * - SSR (v0.26.0, ADR 0012): a host marked `data-td-ssr="{SSR_NAME}@1"` (PHP td_toggle / td_checkbox element mode)
 *   whose markup is exactly render()'s (+ the no-JS-only `name` / `value` / `checked` / `required` on the input, an
 *   attribute allowlist on every node) is adopted IN PLACE: same input node (focus kept), state captured (early
 *   property > live `checked` / `value` > attribute) onto the host, ElementInternals first, then the no-JS attributes
 *   come off the input; an external `<label for="{input id}">` moves to the host; the caller's input `id` is kept (and
 *   re-applied after any later render); reset → the native defaults. Mismatch → render + restore (deferred until blur
 *   while the input has focus).
 */
export class TdCheckableElement extends TdFormElement {
  /** v0.26.0: adopts PHP element-mode markup in place; a hydrated element re-binds on re-connect. */
  static hydratable = true;

  /** @type {string|undefined} SSR contract name (`toggle` / `checkbox`) — set by the subclass. */
  static SSR_NAME = undefined;
  static get observedAttributes() {
    return [...super.observedAttributes, 'checked', 'value', 'label', 'size', 'color', 'aria-label', 'error-text'];
  }

  static get booleanAttributes() { return [...super.booleanAttributes, 'checked']; }

  static get errorContract() { return true; }

  /** @protected @returns {string} CSS custom property set on the host from the `color` attribute */
  _colorProperty() { return '--td-checkbox-color'; }

  /** @protected @returns {string} valueMissing message (`<Class>.messages.valueMissing`) */
  _requiredMessage() { return this._msg('valueMissing'); }

  /** @protected The inner native input. */
  _focusTarget() {
    return this.querySelector('input[type="checkbox"]');
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (oldVal === newVal || !this._initialized) {
      super.attributeChangedCallback(name, oldVal, newVal);
      return;
    }
    const input = this._focusTarget();
    if (name === 'checked' && input) {
      input.checked = newVal !== null; // in place: focus stays on the input
      this._syncForm();
      return;
    }
    if (name === 'color') { this._applyColor(); return; }
    if (name === 'aria-label') { this._applyAccessibleName(); return; }
    if (name === 'value' || name === 'required') { this._syncForm(); if (name === 'value') return; }
    super.attributeChangedCallback(name, oldVal, newVal);
  }

  afterRender() {
    const input = this._focusTarget();
    fillIconSlots(this);
    // v0.26.0: the caller's input id from the SSR markup is part of the accessibility contract — kept across renders
    if (input && this._ssrControlId && !input.id) input.id = this._ssrControlId;
    if (input) {
      input.checked = this.hasAttribute('checked');
      input.disabled = this._effectiveDisabled;
      this.listen(input, 'input', (e) => e.stopPropagation());
      this.listen(input, 'click', (e) => this._onInputClick(e));
      this.listen(input, 'change', (e) => {
        e.stopPropagation(); // one event: the host's CustomEvent below
        this._onUserToggle(input.checked);
      });
    }
    this._applyColor();
    this._applyAccessibleName();
    this._syncForm();
    this._applyErrorState();
  }

  /**
   * Hook for controlled mode (td-toggle): return true after cancelling the native toggle.
   * @protected
   * @param {MouseEvent} _e
   * @returns {boolean} whether the click was handled (no native change will follow)
   */
  _onInputClick(_e) { return false; }

  /** @protected The user toggled the input (native change). */
  _onUserToggle(checked) {
    if (checked) this.setAttribute('checked', '');
    else this.removeAttribute('checked');
    this.emit('change', { checked });
  }

  /** @protected */
  _applyColor() {
    // Owned: without a colour only a value WE set is removed (a site's own inline var survives).
    this._setOwnedStyle(this._colorProperty(), this.safeColor(this.getAttribute('color'), ''));
  }

  /** @protected Accessible name precedence (see class doc; shared helper in TdFormElement). */
  _applyAccessibleName() {
    super._applyAccessibleName(this._focusTarget(), !!this.getAttribute('label'));
  }

  /** @protected Push the state into form submission + constraint validation. */
  _syncForm() {
    const checked = this.hasAttribute('checked');
    const value = this.getAttribute('value') ?? 'on';
    this._setFormValue(checked ? value : null);
    if (this.hasAttribute('required') && !checked) {
      this._setValidity({ valueMissing: true }, this._requiredMessage(), this._focusTarget());
    } else {
      this._setValidity({});
    }
  }

  _captureDefaults() {
    super._captureDefaults();
    // Presence-aware: null = no `value` attr (submits "on"); a string = explicit value.
    this._defaultValueAttr = this.getAttribute('value');
    if (this._ssrDefaults) {
      // v0.26.0: reset target = the NATIVE defaults of the server-rendered input (not the state at upgrade)
      this._defaultChecked = this._ssrDefaults.checked;
      this._defaultValueAttr = this._ssrDefaults.value;
      this._defaultValue = this._ssrDefaults.value ?? '';
    }
  }

  // --- SSR hydrate (v0.26.0, ADR 0012) ---

  /**
   * Marker `{SSR_NAME}@1` + a native checkbox input inside → capture its state, then adopt the markup when it is
   * exactly render()'s (else render + restore; 'defer' while the input has focus). Evaluated again (live state only)
   * when a deferred element is re-connected.
   * @returns {boolean|'defer'}
   */
  canHydrate() {
    const live = !!this._ssrSeen;
    if (!live) {
      // Review round 1 IMPL-1: a marker naming THIS component with an unsupported schema is never adopted, but its
      // control state still goes through the state-safe path (no marker → legacy render, unchanged).
      const m = ssrMarker(this);
      if (!m || m.name !== this.constructor.SSR_NAME) return false;
      this._ssrSchemaOk = m.schema === 1;
    }
    this._ssrSeen = true;
    const control = this.querySelector('input[type="checkbox"]');
    if (!control) return false; // nothing stateful: plain render
    if (!this._ssrDefaults) this._ssrDefaults = { checked: control.defaultChecked, value: control.getAttribute('value') };
    if (this._ssrControlId === undefined) this._ssrControlId = control.id || null;
    return this._ssrDecide(control, this._ssrSchemaOk && this._markupMatches(true), live);
  }

  /**
   * Re-connect of a HYDRATED element: re-bind in place while the markup is still the component's own. Review round 1
   * IMPL-2: rejected → the live state of the current input is captured and restored after the re-render.
   */
  canRebind() {
    if (!this._hydrated) return false;
    if (this._markupMatches(false)) return true;
    const control = this.querySelector('input[type="checkbox"]');
    if (control) this._ssrRestore = this._ssrCapture(control, true);
    return false;
  }

  hydrateExisting() {
    const control = this._ssrControl;
    const state = this._ssrState;
    this._ssrSetHostState(state); // the component's model (in place: no render, no event)
    control.checked = state.checked; // dirty checkedness → removing the `checked` attribute below changes nothing
    this._syncForm(); // ElementInternals FIRST…
    for (const a of SSR_ONLY) control.removeAttribute(a); // …then the no-JS form attributes: FormData has ONE entry
    const note = [...this.children].find(ssrIsErrorNote);
    if (note) this._errorNote = note;
    this._ssrRetargetLabels(control);
    this._ssrControl = null; // review round 1 IMPL-3: adopted — no stale references
    this._ssrState = null;
  }

  /** @protected */
  _ssrCapture(control, live) {
    const early = live ? null : this._earlyProps;
    return {
      checked: early?.has('checked') ? this.hasAttribute('checked') : control.checked,
      // live: the host `value` was synced into the model when the hydration was deferred
      value: live || early?.has('value') ? this.getAttribute('value') : control.getAttribute('value'),
      indeterminate: control.indeterminate,
    };
  }

  /** @protected Deferred: the resolved state goes to the model (host) and the still-native input. */
  _ssrPrime(control, state) {
    this._ssrSetHostState(state);
    control.checked = state.checked;
    if (state.value === null) control.removeAttribute('value');
    else control.setAttribute('value', state.value);
  }

  /** @protected */
  _restoreSsrState(state) {
    this._ssrSetHostState(state);
    const input = this._focusTarget();
    if (input) {
      input.checked = state.checked;
      input.indeterminate = !!state.indeterminate;
    }
    this._syncForm();
    // review round 1 SEC-01: unsafe markup replaced while focused → the focus moves to the new input
    if (state.refocus && input) input.focus({ preventScroll: true });
  }

  /** @private `checked` / `value` host attributes = the captured state. */
  _ssrSetHostState(state) {
    if (state.value === null) this.removeAttribute('value');
    else this.setAttribute('value', state.value);
    this.toggleAttribute('checked', !!state.checked);
  }

  /**
   * @private Exactly render()'s tree: `label.{block}` > input + decorative parts (+ the label text), an optional base
   * error note after it. `first` (SSR markup): the input may still carry its no-JS form attributes; on re-connect
   * (`first` false) it may not.
   * @param {boolean} first
   */
  _markupMatches(first) {
    const kids = ssrContentNodes(this);
    if (!kids.length || kids.length > 2 || (kids.length === 2 && !ssrIsErrorNote(kids[1]))) return false;
    // review round 1 IMPL-4: the error note is there exactly when the component shows an error
    if ((kids.length === 2) !== !!this.errorMessage) return false;
    const live = kids[0];
    const tpl = document.createElement('template');
    tpl.innerHTML = this.render();
    const want = tpl.content.firstElementChild;
    if (live.nodeType !== 1 || live.localName !== 'label' || ssrClassKey(live) !== ssrClassKey(want)) return false;
    if (![...live.attributes].every((a) => LABEL_ATTRS.includes(a.name))) return false;
    const have = ssrContentNodes(live);
    const need = [...want.children];
    if (have.length !== need.length) return false;
    const [input, ...parts] = have;
    const wantInput = need[0];
    if (input.nodeType !== 1 || input.localName !== 'input' || input.getAttribute('type') !== 'checkbox'
      || ssrClassKey(input) !== ssrClassKey(wantInput) || input.getAttribute('role') !== wantInput.getAttribute('role')) return false;
    const ok = (n) => (SSR_CONTROL_ATTRS.has(n) && (first || !SSR_ONLY.includes(n))) || SSR_ARIA_DATA.test(n) || OWN_INPUT_ATTRS.includes(n);
    if (![...input.attributes].every((a) => ok(a.name))) return false;
    return parts.every((p, i) => ssrSamePart(p, need[i + 1]));
  }

  _restoreDefaults() {
    if (this._defaultChecked) this.setAttribute('checked', '');
    else this.removeAttribute('checked');
    if (this._defaultValueAttr === null) this.removeAttribute('value');
    else this.setAttribute('value', this._defaultValueAttr);
    this._syncForm();
  }

  /**
   * Browser form-state restore (bfcache / session history): the state is the submitted value while checked,
   * `null` while unchecked (see `_syncForm`). Restores `checked` only — the `value` attribute is left alone.
   * @protected
   */
  _restoreState(state, _mode) {
    if (state != null) this.setAttribute('checked', '');
    else this.removeAttribute('checked');
    this._syncForm();
  }
}
