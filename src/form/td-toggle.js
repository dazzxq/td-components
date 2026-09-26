import { TdCheckableElement } from '../base/td-checkable-element.js';

/**
 * Toggle switch — token-native (needs td.css; no Tailwind). Styles: src/styles/components/switch.css
 * (block `.td-switch`, the 135 kit contract). The control is a visually-hidden native
 * `<input type="checkbox" role="switch">` → native focus, Space, disabled and labelling.
 * Shared behaviour: {@link TdCheckableElement}.
 *
 * **0.2.0:** uncontrolled by default (self-toggles + emits `change`); `controlled` = emit only, the page
 * flips `checked`. **0.7.0:** Enter no longer toggles (APG switch: Space only).
 *
 * DOM contract:
 *   <label class="td-switch td-switch--{sm|md|lg}">
 *     <input type="checkbox" role="switch" class="td-switch__input">
 *     <span class="td-switch__track" aria-hidden="true"><span class="td-switch__thumb">
 *       <span class="td-switch__icon td-switch__icon--off" data-td-icon="close">svg</span>
 *       <span class="td-switch__icon td-switch__icon--on" data-td-icon="check">svg</span>
 *     </span></span>
 *     [<span class="td-switch__label">…</span>]
 *   </label>
 *
 * @element td-toggle
 * @attr {boolean} checked
 * @attr {boolean} controlled - emit `change` only, do NOT self-toggle
 * @attr {string} value - Submitted value when on (default: "on")
 * @attr {string} name
 * @attr {boolean} required
 * @attr {boolean} disabled
 * @attr {string} label
 * @attr {string} size - sm | md | lg (default: md)
 * @attr {string} color - On colour (default: token --td-switch-on)
 * @attr {string} error-text
 * @fires change - detail: { checked: boolean } — the requested state (exactly one per user action)
 */
export class TdToggle extends TdCheckableElement {
  static get observedAttributes() { return [...super.observedAttributes, 'controlled']; }
  static get booleanAttributes() { return [...super.booleanAttributes, 'controlled']; }

  _colorProperty() { return '--td-switch-on'; }

  _requiredMessage() { return 'Please turn this on.'; }

  /** @private @returns {'sm'|'md'|'lg'} */
  _size() {
    const s = this.getAttribute('size');
    return s === 'sm' || s === 'lg' ? s : 'md';
  }

  /** Resolved on-colour (safeColor) — '' when the token default applies. */
  _getColor() {
    return this.safeColor(this.getAttribute('color'), '');
  }

  /** Change the on-colour at runtime (no re-render). */
  setColor(newColor) {
    this.setAttribute('color', newColor);
  }

  render() {
    const label = this.getAttribute('label') || '';
    return `<label class="td-switch td-switch--${this._size()}">`
      + '<input type="checkbox" role="switch" class="td-switch__input">'
      + '<span class="td-switch__track" aria-hidden="true"><span class="td-switch__thumb">'
      + '<span class="td-switch__icon td-switch__icon--off" data-td-icon="close"></span>'
      + '<span class="td-switch__icon td-switch__icon--on" data-td-icon="check"></span>'
      + '</span></span>'
      + (label ? `<span class="td-switch__label">${this.escapeHtml(label)}</span>` : '')
      + '</label>';
  }

  afterRender() {
    super.afterRender();
    const thumbHost = this.querySelector('.td-switch');
    if (thumbHost) {
      // Knob "lifts" while pressed (liquid-glass: glass only during interaction; CSS disables under
      // reduced motion). State by attribute, never a visual class.
      const up = () => thumbHost.removeAttribute('data-dragging');
      this.listen(thumbHost, 'pointerdown', () => {
        if (!this._effectiveDisabled) thumbHost.setAttribute('data-dragging', '');
      });
      this.listen(thumbHost, 'pointerup', up);
      this.listen(thumbHost, 'pointercancel', up);
      this.listen(thumbHost, 'pointerleave', up);
    }
  }

  /** Controlled: cancel the native toggle and emit the requested state once. */
  _onInputClick(e) {
    if (!this.hasAttribute('controlled') || this._effectiveDisabled) return false;
    e.preventDefault(); // native checkbox reverts; no change event follows
    this.emit('change', { checked: !this.hasAttribute('checked') });
    // The canceled activation reverts input.checked AFTER dispatch — a handler that accepted the change
    // synchronously (el.checked = e.detail.checked) would otherwise leave the input out of sync.
    setTimeout(() => {
      const input = this._focusTarget();
      if (input) input.checked = this.hasAttribute('checked');
    }, 0);
    return true;
  }
}

if (!customElements.get('td-toggle')) {
  customElements.define('td-toggle', TdToggle);
}
