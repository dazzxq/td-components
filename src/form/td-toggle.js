import { TdCheckableElement } from '../base/td-checkable-element.js';
import { fillIconSlots } from '../icons/td-icon.js';

/** v0.52.0: code-point cap of status-text / locked-reason (= php Td::TOGGLE_TEXT_MAX; longer is cut). */
const TEXT_MAX = 200;
/**
 * The first TEXT_MAX code points of `v` by a BOUNDED walk (Codex review r1 #3: never `[...v]` of a multi-MB attribute);
 * a surrogate pair is one code point, a lone surrogate too (= the iterator), like choice-options cpSlice.
 * @param {string} v
 */
const cut = (v) => {
  if (v.length <= TEXT_MAX) return v;
  let i = 0;
  for (let n = 0; n < TEXT_MAX && i < v.length; n++) {
    const c = v.charCodeAt(i);
    i += c >= 0xd800 && c <= 0xdbff && i + 1 < v.length && (v.charCodeAt(i + 1) & 0xfc00) === 0xdc00 ? 2 : 1;
  }
  return v.slice(0, i);
};

/** v0.52.0: attributes patched in place (no re-render). */
const EXTRAS = new Set(['tone', 'status-text', 'locked', 'locked-reason']);

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
 *   [<span class="td-switch__status td-sr-only" id="{id}-status">…</span>]      (v0.52.0: tone / status-text)
 *   [<span class="td-switch__lock-reason td-sr-only" id="{id}-lock">…</span>]   (v0.52.0: locked)
 *   (the on icon is `clock` with tone="warning"; `locked` adds `span.td-switch__icon--lock[data-td-icon="lock"]` in the
 *   thumb; the description spans sit OUTSIDE the label so they never join the name)
 *
 * **0.52.0** (plan docs/internal/plans/v0.52.0-toggle-tone-segmented.md): `tone="success|warning"` colours the ON track
 * from the theme contract (status colour + on-status knob; `color` wins the colour) + clock / ✓ icon + a status
 * description while ON (`status-text`, else `messages.statusSuccess|statusWarning`). `locked` freezes the current state
 * for the USER: focusable, still submitted, no `change`, `commit()` ignored, `aria-readonly` + the description
 * "{messages.locked}[: {locked-reason}]". tone / status-text / locked / locked-reason / checked patch the DOM in place.
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
 * @attr {string} tone - success | warning (v0.52.0): ON colour + icon + status description
 * @attr {string} status-text - description while ON (v0.52.0; default from the tone)
 * @attr {boolean} locked - the user cannot change it (v0.52.0); still focusable + submitted
 * @attr {string} locked-reason - why (v0.52.0); description = messages.locked + ": " + reason
 * @fires change - detail: { checked: boolean } — the requested state (exactly one per user action)
 * @fires commit-error - detail: { checked: boolean, error } — a `commit()` failed and the switch reverted
 */
export class TdToggle extends TdCheckableElement {
  /** v0.26.0 SSR contract `data-td-ssr="toggle@1"` (PHP td_toggle element mode). */
  static SSR_NAME = 'toggle';

  static get observedAttributes() {
    return [...super.observedAttributes, 'controlled', 'tone', 'status-text', 'locked', 'locked-reason'];
  }

  static get booleanAttributes() { return [...super.booleanAttributes, 'controlled', 'locked']; }

  _colorProperty() { return '--td-switch-on'; }

  /** Validation texts (Vietnamese); override per site: `TdToggle.messages.valueMissing = 'Please turn this on.'`. */
  static messages = {
    valueMissing: 'Vui lòng bật tùy chọn này.',
    /** v0.52.0: default status descriptions while ON (tone="success" / "warning"; `status-text` overrides) */
    statusSuccess: 'Đã xác nhận',
    statusWarning: 'Đang chờ',
    /** v0.52.0: the localised prefix of the lock description ("{locked}: {locked-reason}") */
    locked: 'Không thể thay đổi',
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

  /** @private @returns {'success'|'warning'|''} v0.52.0 */
  _tone() {
    const t = this.getAttribute('tone');
    return t === 'success' || t === 'warning' ? t : '';
  }

  /** @private v0.52.0: a status description exists (a tone, or a non-empty status-text) */
  _hasStatus() { return !!this._tone() || !!this.getAttribute('status-text'); }

  /** @private v0.52.0: the icon name of the ON slot */
  _onIcon() { return this._tone() === 'warning' ? 'clock' : 'check'; }

  /** @private v0.52.0: status description text */
  _statusText() {
    const own = this.getAttribute('status-text');
    if (own) return cut(own);
    const t = this._tone();
    return t ? this._msg(t === 'warning' ? 'statusWarning' : 'statusSuccess') : '';
  }

  /** @private v0.52.0: "{messages.locked}[: {locked-reason}]" */
  _lockText() {
    const reason = this.getAttribute('locked-reason');
    const prefix = this._msg('locked');
    return reason ? `${prefix}: ${cut(reason)}` : prefix;
  }

  render() {
    const label = this.getAttribute('label') || '';
    const id = this.escapeHtml(this.id);
    const locked = this.hasAttribute('locked');
    // v0.52.0: the description texts are STATE (messages / attributes), filled in afterRender — not part of the
    // compared server markup
    return `<label class="td-switch td-switch--${this._size()}">`
      + '<input type="checkbox" role="switch" class="td-switch__input">'
      + '<span class="td-switch__track" aria-hidden="true"><span class="td-switch__thumb">'
      + '<span class="td-switch__icon td-switch__icon--off" data-td-icon="close"></span>'
      + `<span class="td-switch__icon td-switch__icon--on" data-td-icon="${this._onIcon()}"></span>`
      + (locked ? '<span class="td-switch__icon td-switch__icon--lock" data-td-icon="lock"></span>' : '')
      + '</span></span>'
      + (label ? `<span class="td-switch__label">${this.escapeHtml(label)}</span>` : '')
      + '</label>'
      + (this._hasStatus() ? `<span class="td-switch__status td-sr-only" id="${id}-status"></span>` : '')
      + (locked ? `<span class="td-switch__lock-reason td-sr-only" id="${id}-lock"></span>` : '');
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (this._helperAttr(name, oldVal, newVal)) return; // v0.54.0: helper-text in place (TdFormElement)
    const live = oldVal !== newVal && this._initialized && !!this.querySelector(':scope > .td-switch');
    // v0.52.0: in place — never a re-render (the 2FA flow sets the tone while the input has focus)
    if (live && EXTRAS.has(name)) {
      this._applyExtras();
      return;
    }
    super.attributeChangedCallback(name, oldVal, newVal);
    if (live && name === 'checked') this._syncDescribedBy(); // the status description exists only while ON
  }

  /**
   * @private v0.52.0: tone / status / lock parts IN PLACE (the input node and its focus are kept): the ON icon slot,
   * the lock slot, the two description spans (structure exactly render()'s), their texts, aria-readonly, describedby.
   */
  _applyExtras() {
    const root = this.querySelector(':scope > .td-switch');
    const input = this._focusTarget();
    if (!root || !input) return;
    const thumb = root.querySelector('.td-switch__thumb');
    const on = thumb?.querySelector(':scope > .td-switch__icon--on');
    if (on && on.getAttribute('data-td-icon') !== this._onIcon()) {
      on.setAttribute('data-td-icon', this._onIcon());
      fillIconSlots(thumb, ':scope > .td-switch__icon--on');
    }
    const locked = this.hasAttribute('locked');
    let lockIcon = thumb?.querySelector(':scope > .td-switch__icon--lock') || null;
    if (locked && !lockIcon && thumb) {
      lockIcon = document.createElement('span');
      lockIcon.className = 'td-switch__icon td-switch__icon--lock';
      lockIcon.setAttribute('data-td-icon', 'lock');
      thumb.appendChild(lockIcon);
      fillIconSlots(thumb, ':scope > .td-switch__icon--lock');
    } else if (!locked && lockIcon) lockIcon.remove();
    const span = (cls, want, after) => {
      let el = this.querySelector(`:scope > .${cls}`);
      if (want && !el) {
        el = document.createElement('span');
        el.className = `${cls} td-sr-only`;
        after.after(el);
      } else if (!want && el) {
        el.remove();
        el = null;
      }
      return el;
    };
    const status = span('td-switch__status', this._hasStatus(), root);
    if (status) {
      status.id = `${this.id}-status`;
      status.textContent = this._statusText();
    }
    const lock = span('td-switch__lock-reason', locked, status || root);
    if (lock) {
      lock.id = `${this.id}-lock`;
      lock.textContent = this._lockText();
    }
    if (locked) input.setAttribute('aria-readonly', 'true');
    else input.removeAttribute('aria-readonly');
    this._syncDescribedBy();
  }

  /**
   * v0.52.0: the server printed the input's `aria-describedby` from its own state (status while ON, lock) — those ids
   * are the component's, not the page's: claim them before the first describedby sync so they follow the state.
   */
  hydrateExisting() {
    this._ownDescribedBy = new Set([`${this.id}-status`, `${this.id}-lock`]);
    super.hydrateExisting();
  }

  /** @protected v0.52.0: the status description while ON + the lock description while locked */
  _describedByIds() {
    const ids = [];
    if (this._hasStatus() && this.hasAttribute('checked') && this.querySelector(':scope > .td-switch__status')) ids.push(`${this.id}-status`);
    if (this.hasAttribute('locked') && this.querySelector(':scope > .td-switch__lock-reason')) ids.push(`${this.id}-lock`);
    ids.push(...this._helperDescribedByIds()); // v0.54.0
    return ids;
  }

  afterRender() {
    super.afterRender();
    this._applyExtras();
    if (this._pendingCommit) this._setPending(true); // a re-render (label/size/reconnect) keeps the pending state
    const thumbHost = this.querySelector('.td-switch');
    if (thumbHost) {
      // [data-dragging] while pressed (a styling hook; since v0.20.0 the default CSS does not change the knob).
      // State by attribute, never a visual class.
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
    // v0.52.0: locked → ignored (the user cannot change it; code sets `checked` directly)
    if (this.hasAttribute('locked')) return Promise.resolve(this.hasAttribute('checked'));
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
    // v0.52.0: locked — every user activation (pointer, Space, wrapping / external label) is cancelled, no change
    if (this.hasAttribute('locked') && !this._effectiveDisabled) {
      e.preventDefault();
      setTimeout(() => {
        const input = this._focusTarget();
        if (input) input.checked = this.hasAttribute('checked');
      }, 0);
      return true;
    }
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
