import { TdFormElement } from './td-form-element.js';
import { fillIconSlots } from '../icons/td-icon.js';

/**
 * Shared base for checkbox-like controls (td-checkbox, td-toggle). Plan: docs/plans/v0.7.0-batch1.md.
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
 */
export class TdCheckableElement extends TdFormElement {
  static get observedAttributes() {
    return [...super.observedAttributes, 'checked', 'value', 'label', 'size', 'color', 'aria-label', 'error-text'];
  }

  static get booleanAttributes() { return [...super.booleanAttributes, 'checked']; }

  static get errorContract() { return true; }

  /** @protected @returns {string} CSS custom property set on the host from the `color` attribute */
  _colorProperty() { return '--td-checkbox-color'; }

  /** @protected @returns {string} valueMissing message */
  _requiredMessage() { return 'Vui lòng chọn ô này.'; }

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
    const prop = this._colorProperty();
    const color = this.safeColor(this.getAttribute('color'), '');
    if (color) this.style.setProperty(prop, color);
    else this.style.removeProperty(prop);
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
  }

  _restoreDefaults() {
    if (this._defaultChecked) this.setAttribute('checked', '');
    else this.removeAttribute('checked');
    if (this._defaultValueAttr === null) this.removeAttribute('value');
    else this.setAttribute('value', this._defaultValueAttr);
    this._syncForm();
  }
}
