import { TdCheckableElement } from '../base/td-checkable-element.js';

/**
 * Checkbox — token-native (needs td.css; no Tailwind). Styles: src/styles/components/checkbox.css.
 * Form-associated (ElementInternals): submits `value` (default "on") only when checked, `required`
 * (valueMissing), reset, `<fieldset disabled>`. Shared behaviour (in-place `checked`, one `change`
 * event, accessible name, error contract): {@link TdCheckableElement}.
 *
 * DOM contract (class map: docs/upgrading/class-map.md):
 *   <label class="td-checkbox td-checkbox--{sm|md|lg}">
 *     <input type="checkbox" class="td-checkbox__input">
 *     <span class="td-checkbox__mark"><span class="td-checkbox__icon" data-td-icon="check">svg</span></span>
 *     [<span class="td-checkbox__label">…</span>]
 *   </label>
 *   [<span class="td-field-error" id="{host-id}-error">…</span>]
 *
 * @element td-checkbox
 * @attr {boolean} checked
 * @attr {string} value - Submitted value when checked (default: "on")
 * @attr {string} name
 * @attr {boolean} required
 * @attr {boolean} disabled - also via ancestor <fieldset disabled>
 * @attr {string} label - Visible label (else host `aria-label`, else external `<label for>`)
 * @attr {string} size - sm | md | lg (default: md)
 * @attr {string} color - Checked fill (default: token --td-checkbox-color = --td-accent)
 * @attr {string} error-text - Error message (see setError())
 * @attr {boolean} indeterminate - v0.36.0: mixed state (native `input.indeterminate` → "mixed" for assistive tech; the
 *   mark shows a bar). Reflected by the `indeterminate` property. A USER toggle clears it (one `change`, no extra event);
 *   setting `checked` from code keeps it (the app owns it, e.g. "select all"). Never submitted; form reset keeps it.
 * @fires change - detail: { checked: boolean } (exactly one per user toggle)
 */
export class TdCheckbox extends TdCheckableElement {
  /** v0.26.0 SSR contract `data-td-ssr="checkbox@1"` (PHP td_checkbox element mode). */
  static SSR_NAME = 'checkbox';

  /** Validation texts (Vietnamese); override per site: `TdCheckbox.messages.valueMissing = 'Please tick this box.'`. */
  static messages = {
    valueMissing: 'Vui lòng chọn ô này.',
  };

  static get observedAttributes() { return [...super.observedAttributes, 'indeterminate']; }

  static get booleanAttributes() { return [...super.booleanAttributes, 'indeterminate']; }

  /** v0.36.0: mixed state (reflects the `indeterminate` attribute). */
  get indeterminate() { return this.hasAttribute('indeterminate'); }

  set indeterminate(v) { this.toggleAttribute('indeterminate', !!v); }

  attributeChangedCallback(name, oldVal, newVal) {
    if (name === 'indeterminate') {
      if (oldVal !== newVal && this._initialized) this._applyIndeterminate(); // in place: focus stays
      return;
    }
    super.attributeChangedCallback(name, oldVal, newVal);
  }

  afterRender() {
    super.afterRender(); // render, SSR adopt and re-connect all run this bind step
    this._applyIndeterminate();
  }

  /** @private host attribute → the native input (the only place it is written) */
  _applyIndeterminate() {
    const input = this._focusTarget();
    if (input) input.indeterminate = this.hasAttribute('indeterminate');
  }

  /** @protected native toggle: the browser already cleared input.indeterminate → drop the host attribute first */
  _onUserToggle(checked) {
    if (this.hasAttribute('indeterminate')) this.removeAttribute('indeterminate');
    super._onUserToggle(checked);
  }

  /** @protected form reset leaves the mixed state alone (native) — re-apply it to the input */
  _restoreDefaults() {
    super._restoreDefaults();
    this._applyIndeterminate();
  }

  /** @protected SSR adopt: a native mixed state set on the server control before define becomes the host attribute */
  hydrateExisting() {
    if (this._ssrControl && this._ssrControl.indeterminate && !this.hasAttribute('indeterminate')) {
      this.setAttribute('indeterminate', '');
    }
    super.hydrateExisting();
  }

  /** @protected safe re-render after an SSR mismatch: a captured native mixed state becomes the host attribute */
  _restoreSsrState(state) {
    if (state && state.indeterminate && !this.hasAttribute('indeterminate')) this.setAttribute('indeterminate', '');
    super._restoreSsrState(state);
    this._applyIndeterminate();
  }

  /** @private @returns {'sm'|'md'|'lg'} */
  _size() {
    const s = this.getAttribute('size');
    return s === 'sm' || s === 'lg' ? s : 'md';
  }

  /** Resolved checked colour (safeColor) — '' when the token default applies. */
  _getColor() {
    return this.safeColor(this.getAttribute('color'), '');
  }

  render() {
    const label = this.getAttribute('label') || '';
    return `<label class="td-checkbox td-checkbox--${this._size()}">`
      + '<input type="checkbox" class="td-checkbox__input">'
      + '<span class="td-checkbox__mark" aria-hidden="true">'
      + '<span class="td-checkbox__icon" data-td-icon="check" data-td-icon-class="td-checkbox__svg"></span>'
      + '</span>'
      + (label ? `<span class="td-checkbox__label">${this.escapeHtml(label)}</span>` : '')
      + '</label>';
  }
}

if (!customElements.get('td-checkbox')) {
  customElements.define('td-checkbox', TdCheckbox);
}
