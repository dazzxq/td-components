import {
  TdFormElement, ssrClassKey, ssrContentNodes, ssrSamePart, ssrSameAttrs, ssrIsErrorNote, SSR_ARIA_DATA, SSR_CONTROL_ATTRS,
} from './td-form-element.js';
import { fillIconSlots } from '../icons/td-icon.js';
import { ssrMarker } from './td-base-element.js';

/** v0.26.0: attributes of the server-rendered input that exist only for the no-JS form (removed on hydrate). */
const SSR_ONLY = ['name', 'value', 'checked', 'required'];
/** Attributes the component itself puts on its input / wrapping label (state, not structure). */
const OWN_INPUT_ATTRS = ['aria-busy', 'aria-invalid', 'aria-errormessage', 'aria-describedby', 'aria-label', 'aria-labelledby',
  'aria-readonly'];
/** v0.52.0 (td-toggle): text-only description spans render() may put after the label (their text is state). */
const DESC_PARTS = ['td-switch__status', 'td-switch__lock-reason'];
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
 *   re-applied after any later render); reset → the native defaults. Any mismatch → safe render AT ONCE + restore
 *   (checked / value / indeterminate / id, and the focus when the input had it) — no deferral (ADR 0012 §5).
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
    if (this._helperAttr(name, oldVal, newVal)) return; // v0.54.0: helper-text in place (TdFormElement)
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
   * Marker `{SSR_NAME}@<n>` + a native checkbox input inside → capture its state; adopt the markup only when the schema
   * is 1, it is exactly render()'s, its no-JS form attributes still agree with the host and it passes the subtree scan +
   * skeleton (else safe render at once + restore, focus included).
   * @returns {boolean}
   */
  canHydrate() {
    // Review round 1 IMPL-1: a marker naming THIS component with an unsupported schema is never adopted, but its
    // control state still goes through the state-safe path (no marker → legacy render, unchanged).
    const m = ssrMarker(this);
    if (!m || m.name !== this.constructor.SSR_NAME) return false;
    // review round 4 (ISSUE-8): state comes only from the expected skeleton slot (or the single control there is)
    const control = this._ssrStateSource();
    if (!control) return this._ssrClean(false); // none / ambiguous: clean render from the host, nothing transplanted
    this._ssrDefaults = { checked: control.defaultChecked, value: control.getAttribute('value') };
    this._ssrControlId = control.id || null;
    const matches = m.schema === 1 && this._markupMatches(true)
      && this._ssrFormAttrsAgree(control, [['name', 'name'], ['required', 'required'], ['disabled', 'disabled']], ['required', 'disabled']);
    return this._ssrDecide(control, matches, false);
  }

  /** Re-connect of a HYDRATED element: re-bind in place while the markup is still the component's own (else restore). */
  canRebind() {
    return this._ssrRevalidate(this._ssrStateSource());
  }

  /** @protected Review round 4: `label.{block}` (unique) > its first child `input.{block}__input` (unique there). */
  _ssrSlotControl() {
    const block = this.constructor.SSR_NAME === 'toggle' ? 'td-switch' : 'td-checkbox';
    const labels = [...this.children].filter((e) => e.localName === 'label' && e.classList.contains(block));
    if (labels.length !== 1) return null;
    const inputs = [...labels[0].children].filter((e) => e.localName === 'input' && e.classList.contains(`${block}__input`));
    const first = labels[0].firstElementChild;
    return inputs.length === 1 && inputs[0] === first && first.type === 'checkbox' ? first : null;
  }

  /** @protected */
  _ssrPlausible() { return 'input[type="checkbox"]'; }

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

  /**
   * @protected Review round 2: the known skeleton — `label.{block}` > [this input, the track / mark span, optional
   * text-only label span], then at most the base error note. Inner decoration is covered by the tag / attribute scan +
   * the one-control rule of `_ssrUnsafe()`.
   */
  _ssrSkeletonOk() {
    const block = this.constructor.SSR_NAME === 'toggle' ? 'td-switch' : 'td-checkbox';
    const kids = ssrContentNodes(this);
    if (!kids.length || kids.some((n) => n.nodeType !== 1)) return false;
    // v0.52.0: td-toggle may carry its description spans (text only) between the label and the error note
    const tail = kids.slice(1);
    if (tail.length && ssrIsErrorNote(tail[tail.length - 1])) tail.pop();
    if (tail.length > (block === 'td-switch' ? DESC_PARTS.length : 0)
      || !tail.every((n) => n.localName === 'span' && DESC_PARTS.some((c) => n.classList.contains(c)) && n.children.length === 0)) return false;
    const label = kids[0];
    if (label.localName !== 'label' || !label.classList.contains(block)) return false;
    const parts = ssrContentNodes(label);
    if (parts.length < 2 || parts.length > 3 || parts.some((n) => n.nodeType !== 1) || parts[0] !== this._ssrControl) return false;
    const deco = parts[1];
    if (deco.localName !== 'span' || !deco.classList.contains(block === 'td-switch' ? 'td-switch__track' : 'td-checkbox__mark')) return false;
    const text = parts[2];
    return !text || (text.localName === 'span' && text.classList.contains(`${block}__label`) && text.children.length === 0);
  }

  /** @protected */
  _ssrCapture(control, live) {
    const early = live ? null : this._earlyProps;
    return {
      checked: early?.has('checked') ? this.hasAttribute('checked') : control.checked,
      // live (re-connect of a hydrated element): the host `value` is the component's model
      value: live || early?.has('value') ? this.getAttribute('value') : control.getAttribute('value'),
      indeterminate: control.indeterminate,
    };
  }

  /** @protected */
  _restoreSsrState(state) {
    const input = this._focusTarget();
    if (state.clean) { // review round 4: rendered from the host only — nothing to put back but the focus
      if (state.refocus && input) input.focus({ preventScroll: true });
      return;
    }
    this._ssrSetHostState(state);
    if (input) {
      input.checked = state.checked;
      input.indeterminate = !!state.indeterminate;
    }
    this._syncForm();
    // the replaced input had focus → the focus moves to the new one (review rounds 1 + 3)
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
    const tpl = document.createElement('template');
    tpl.innerHTML = this.render();
    const [want, ...extras] = [...tpl.content.children];
    // review round 1 IMPL-4: the error note is there exactly when the component shows an error
    const err = this.errorMessage ? 1 : 0;
    if (!kids.length || kids.length !== 1 + extras.length + err || (err && !ssrIsErrorNote(kids[kids.length - 1]))) return false;
    // v0.52.0: render()'s description spans after the label — same tag + attributes, text only (the text is state:
    // messages / attributes, re-applied on bind)
    const extrasOk = extras.every((w, i) => {
      const n = kids[1 + i];
      return n.nodeType === 1 && n.localName === w.localName && ssrSameAttrs(n, w) && n.children.length === 0;
    });
    if (!extrasOk) return false;
    const live = kids[0];
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
    // v0.26.0 (pre-existing bug): form.reset() also resets the inner native input — it carries no `checked` attribute,
    // so it ends unchecked — and runs BEFORE this callback (custom element reaction). When the host attribute did not
    // change, no attributeChangedCallback re-syncs it: do it here. (`indeterminate` has no host model and native reset
    // leaves it alone, so it is not touched.)
    const input = this._focusTarget();
    if (input) input.checked = this.hasAttribute('checked');
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
