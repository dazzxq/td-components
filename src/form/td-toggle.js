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
 * @fires commit-error - detail: { checked: boolean, error } — a `commit()` failed and the switch reverted
 */
export class TdToggle extends TdCheckableElement {
  static get observedAttributes() { return [...super.observedAttributes, 'controlled']; }
  static get booleanAttributes() { return [...super.booleanAttributes, 'controlled']; }

  _colorProperty() { return '--td-switch-on'; }

  /** Validation texts (Vietnamese); override per site: `TdToggle.messages.valueMissing = 'Please turn this on.'`. */
  static messages = {
    valueMissing: 'Vui lòng bật tùy chọn này.',
  };

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
    if (this._pendingCommit) this._setPending(true); // a re-render (label/size/reconnect) keeps the pending state
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

  /**
   * Persist a switch change optimistically (v0.13.0): shows `next` at once, marks the switch pending (input
   * `aria-busy`, `.td-switch[data-pending]`, further activation ignored) while `fn(next)` runs, then keeps `next` when it
   * resolves (anything but `false`) or reverts and emits `commit-error` `{ checked: previous, error }` when it resolves
   * `false` or rejects. Emits no extra `change`. Meant for `controlled` toggles:
   * `el.addEventListener('change', (e) => el.commit((v) => save(v), e.detail.checked))`.
   * @param {(next: boolean) => any} fn
   * @param {boolean} [next] requested state (default: the opposite of the current one)
   * @returns {Promise<boolean>} the final checked state (a call while pending returns the pending promise)
   */
  commit(fn, next) {
    if (typeof fn !== 'function') return Promise.reject(new TypeError('TdToggle.commit: a function is required'));
    if (this._pendingCommit) return this._pendingCommit;
    const previous = this.hasAttribute('checked');
    const target = typeof next === 'boolean' ? next : !previous;
    const setChecked = (on) => { if (on) this.setAttribute('checked', ''); else this.removeAttribute('checked'); };
    setChecked(target);
    this._setPending(true);
    // The guard exists BEFORE fn runs (a synchronous nested commit() gets the same promise); fn starts a microtask later.
    const p = Promise.resolve().then(() => fn(target)).then(
      (res) => {
        if (res === false) {
          setChecked(previous);
          this.emit('commit-error', { checked: previous, error: null });
          return previous;
        }
        return target;
      },
      (error) => {
        setChecked(previous);
        this.emit('commit-error', { checked: previous, error });
        return previous;
      },
    ).finally(() => {
      this._pendingCommit = null;
      this._setPending(false);
    });
    this._pendingCommit = p;
    return p;
  }

  /** @private */
  _setPending(on) {
    const input = this._focusTarget();
    const root = this.querySelector('.td-switch');
    if (input) { if (on) input.setAttribute('aria-busy', 'true'); else input.removeAttribute('aria-busy'); }
    if (root) root.toggleAttribute('data-pending', on);
  }

  /** Controlled: cancel the native toggle and emit the requested state once. Pending commit: ignore activation. */
  _onInputClick(e) {
    if (this._pendingCommit) {
      e.preventDefault(); // pending: no toggle, no change (the input is re-synced below)
      setTimeout(() => {
        const input = this._focusTarget();
        if (input) input.checked = this.hasAttribute('checked');
      }, 0);
      return true;
    }
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
