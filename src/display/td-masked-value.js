import { TdBaseElement, ssrMarker } from '../base/td-base-element.js';
import { ssrContentNodes, ssrSamePart } from '../base/td-form-element.js';
import { fillIconSlots } from '../icons/td-icon.js';
import './td-copy.js';

const UPGRADE_PROPS = ['reveal'];
const DEFAULT_DURATION = 30;
const MIN_DURATION = 2;
const MAX_DURATION = 600;
const SPINNER = '<svg class="td-spinner__svg" viewBox="0 0 50 50" aria-hidden="true" focusable="false">'
  + '<circle class="td-spinner__track" cx="25" cy="25" r="20"></circle>'
  + '<circle class="td-spinner__arc" cx="25" cy="25" r="20"></circle></svg>';

/**
 * <td-masked-value> — shows a value MASKED by the server (`09xx xxx 123`) + a toggle; the app's async `reveal()` hook
 * (permissions, 2FA, purpose code, audit — all app side) returns the real value, shown until the toggle is pressed
 * again or `duration` seconds pass (v0.31.0, plan docs/internal/plans/v0.31.0-sortable-masked.md M5). Styles:
 * src/styles/components/masked-value.css. PHP: `td_masked_value()` prints the masked string only (contract
 * `masked-value@1`, hydrated in place).
 *
 * Secret contract (docs/internal/security-model.md): the kit never sees the real value except as the result of
 * `reveal()`. While revealed it lives in ONE text node (`.td-masked__text`) and one private field; re-masking writes the
 * masked text back, drops the field and removes the `td-copy` child. It never goes into an attribute, `aria-*`,
 * `title` / `data-tooltip`, the live region, an event detail or the console. No promise about JS memory (immutable
 * strings, GC), the clipboard or screenshots.
 *
 * DOM contract:
 *   <td-masked-value label="SĐT khách" masked="09xx xxx 123" [duration="30"] [copyable] [disabled] class="td-masked">
 *     <span class="td-masked__text" translate="no" [data-state="revealed"]>09xx xxx 123</span>
 *     <button type="button" class="td-masked__toggle" aria-pressed="false" aria-label="Hiện SĐT khách"
 *             data-tooltip="Hiện SĐT khách" [aria-disabled="true"] [data-state="loading"]>
 *       <span class="td-masked__icon" data-td-icon="eye|eye-off" aria-hidden="true">svg</span></button>
 *     [<td-copy sensitive size="sm" label="Copy SĐT khách"></td-copy>]   ← only while revealed + copyable
 *     <span class="td-sr-only" role="status"></span>
 *   </td-masked-value>
 *
 * - `reveal({ element, signal }) → Promise<string|null>`: a non-empty string is shown; null / undefined = the user
 *   cancelled in the app (silent); '' / not a string → `reveal-error` `{ kind: 'invalid' }`; a rejection →
 *   `reveal-error` `{ kind: 'rejected' }` (an `AbortError` is silent). The app's error object is NEVER forwarded nor
 *   logged (its message / fields may hold the value). In-flight lock: clicks while pending are ignored (one call = one
 *   audit). Every late result (disconnect, page hidden / pagehide, `masked` changed, `disabled`, `mask()`) is dropped —
 *   `signal` is aborted and a generation counter discards it even when the app ignores `signal`.
 * - Re-masked on: toggle (`user`), timer (`timeout`, announced), page hidden / pagehide (`hidden`), `mask()` / `masked`
 *   changed / `disabled` (`api`), disconnect (no event).
 *
 * @element td-masked-value
 * @attr {string} masked - the masked string (text, computed by the server)
 * @attr {string} label - what the value is (default `labels.value`); the toggle is "Hiện {label}" in every state
 * @attr {number} duration - seconds before re-masking: integer clamped to [2, 600], default 30
 * @attr {boolean} copyable - a sensitive `<td-copy>` while revealed
 * @attr {boolean} disabled - toggle `aria-disabled`; re-masks
 * @property {Function|null} reveal - the hook (else the static `TdMaskedValue.reveal`)
 * @property {boolean} revealed - read only
 * @fires revealed - detail: { duration }
 * @fires remasked - detail: { reason: 'timeout'|'user'|'hidden'|'api' } (only after a value was shown)
 * @fires reveal-error - detail: { kind: 'rejected'|'invalid' }
 */
export class TdMaskedValue extends TdBaseElement {
  /** Contract `masked-value@1`: adopts php/td.php td_masked_value() markup in place. */
  static hydratable = true;

  /** Texts (Vietnamese); override per site: `TdMaskedValue.labels.show = 'Show {label}'`. */
  static labels = {
    value: 'giá trị',
    show: 'Hiện {label}',
    copy: 'Copy {label}',
    loading: 'Đang tải {label}…',
    revealed: 'Đã hiện {label}. Tự che lại sau {s} giây.',
    remasked: 'Đã che {label}.',
    error: 'Không hiện được {label}.',
  };

  /**
   * Page-wide hook used when an element has no `reveal` property (PHP pages: set it once, read `element.dataset.id`).
   * @type {((ctx: { element: TdMaskedValue, signal: AbortSignal }) => Promise<string|null>) | null}
   */
  static reveal = null;

  static get observedAttributes() { return ['masked', 'label', 'duration', 'copyable', 'disabled']; }

  static get booleanAttributes() { return ['copyable', 'disabled']; }

  constructor() {
    super();
    this._hook = null;
    /** @type {'masked'|'loading'|'revealed'} */
    this._state = 'masked';
    /** @private the revealed value — only while `revealed` */
    this._secret = null;
    this._gen = 0;
    this._ac = null;
    this._timer = 0;
    this._guards = null;
    this._warned = new Set();
    this._replayHook();
  }

  connectedCallback() {
    this._replayHook();
    super.connectedCallback();
  }

  disconnectedCallback() {
    this._remask('disconnect');
    super.disconnectedCallback();
  }

  /** @private a hook assigned before the class was defined lives in an own property: re-assign through the setter */
  _replayHook() {
    for (const p of UPGRADE_PROPS) {
      if (Object.prototype.hasOwnProperty.call(this, p)) {
        const v = this[p];
        delete this[p];
        this[p] = v;
      }
    }
  }

  /** @returns {Function|null} */
  get reveal() { return this._hook; }

  /** Only a function; anything else → null (+ one warning). */
  set reveal(fn) {
    if (typeof fn === 'function') {
      this._hook = fn;
      return;
    }
    this._hook = null;
    if (fn != null) this._warnOnce('setter', 'td-masked-value: `reveal` must be a function — ignored.');
  }

  /** @returns {boolean} the real value is shown now */
  get revealed() { return this._state === 'revealed'; }

  /** Mask now (a pending reveal is dropped). */
  mask() { this._remask('api'); }

  // --- render / SSR ---

  /** @private */
  _label() {
    return this.getAttribute('label') || TdMaskedValue.labels.value || 'giá trị';
  }

  /** @private */
  static _fmt(key, vars) {
    return String(TdMaskedValue.labels[key] ?? '').replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  }

  /** @private */
  _showLabel() { return TdMaskedValue._fmt('show', { label: this._label() }); }

  render() {
    const name = this.escapeHtml(this._showLabel());
    return `<span class="td-masked__text" translate="no">${this.escapeHtml(this.getAttribute('masked') ?? '')}</span>`
      + `<button type="button" class="td-masked__toggle" aria-pressed="false" aria-label="${name}" data-tooltip="${name}"`
      + `${this.hasAttribute('disabled') ? ' aria-disabled="true"' : ''}>`
      + '<span class="td-masked__icon" data-td-icon="eye" aria-hidden="true"></span></button>'
      + '<span class="td-sr-only" role="status"></span>';
  }

  /** @private children exactly render()'s (the icon slot by its attributes) */
  _sameAsRender() {
    const tpl = document.createElement('template');
    tpl.innerHTML = this.render();
    const have = ssrContentNodes(this);
    const want = ssrContentNodes(tpl.content);
    return have.length === want.length && want.every((w, i) => ssrSamePart(have[i], w));
  }

  /** Marker `masked-value@1` + exactly render()'s children → adopt in place; anything else renders. */
  canHydrate() {
    const m = ssrMarker(this);
    return !!m && m.name === 'masked-value' && m.schema === 1 && this._sameAsRender();
  }

  /** Re-connect: the same structural check (masked again by the disconnect). */
  canRebind() { return this._sameAsRender(); }

  afterRender() {
    this.classList.add('td-masked');
    fillIconSlots(this, '.td-masked__icon');
    const b = this._btn();
    if (b) this.listen(b, 'click', () => this._onToggle());
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (oldVal === newVal || !this._initialized) return;
    if (!this._btn() || !this._text() || !this._live()) {
      this._remask('api');
      this._doRender();
      return;
    }
    if (name === 'masked') {
      if (this._state !== 'masked') this._remask('api');
      else this._text().textContent = this.getAttribute('masked') ?? '';
    } else if (name === 'label') {
      const n = this._showLabel();
      this._btn().setAttribute('aria-label', n);
      this._btn().setAttribute('data-tooltip', n);
      this._copyEl()?.setAttribute('label', TdMaskedValue._fmt('copy', { label: this._label() }));
    } else if (name === 'disabled') {
      if (this.hasAttribute('disabled')) this._remask('api');
      this._paintToggle();
    } else if (name === 'copyable') {
      if (this._state === 'revealed') {
        if (this.hasAttribute('copyable')) this._addCopy();
        else this._removeCopy();
      }
    }
  }

  // --- parts ---

  /** @private */ _btn() { return /** @type {HTMLButtonElement|null} */ (this.querySelector(':scope > button.td-masked__toggle')); }
  /** @private */ _text() { return this.querySelector(':scope > .td-masked__text'); }
  /** @private */ _live() { return this.querySelector(':scope > [role="status"]'); }
  /** @private */ _copyEl() { return this.querySelector(':scope > td-copy'); }

  /** @private */
  _duration() {
    const n = Number.parseInt(this.getAttribute('duration') ?? '', 10);
    if (!Number.isFinite(n)) return DEFAULT_DURATION;
    return Math.max(MIN_DURATION, Math.min(MAX_DURATION, n));
  }

  /** @private live region (text only, never the value); cleared first so a repeated message is read again */
  _announce(key, vars = {}) {
    const live = this._live();
    if (!live) return;
    live.textContent = '';
    live.textContent = TdMaskedValue._fmt(key, { label: this._label(), ...vars });
  }

  /** @private toggle state from `_state` + `disabled` */
  _paintToggle() {
    const b = this._btn();
    if (!b) return;
    const loading = this._state === 'loading';
    b.setAttribute('aria-pressed', this._state === 'revealed' ? 'true' : 'false');
    if (loading || this.hasAttribute('disabled')) b.setAttribute('aria-disabled', 'true');
    else b.removeAttribute('aria-disabled');
    if (loading) b.setAttribute('data-state', 'loading');
    else b.removeAttribute('data-state');
    const slot = b.querySelector('.td-masked__icon');
    let spin = b.querySelector(':scope > .td-spinner');
    if (slot) {
      slot.hidden = loading;
      const icon = this._state === 'revealed' ? 'eye-off' : 'eye';
      if (slot.getAttribute('data-td-icon') !== icon) {
        slot.setAttribute('data-td-icon', icon);
        fillIconSlots(b, '.td-masked__icon');
      }
    }
    if (loading && !spin) {
      spin = document.createElement('span');
      spin.className = 'td-spinner td-spinner--sm';
      spin.setAttribute('aria-hidden', 'true');
      spin.innerHTML = SPINNER; // static markup, no data
      b.appendChild(spin);
    } else if (!loading && spin) {
      spin.remove();
    }
    if (loading) this.setAttribute('aria-busy', 'true');
    else this.removeAttribute('aria-busy');
  }

  /** @private */
  _addCopy() {
    if (this._secret == null || this._copyEl()) return;
    const c = /** @type {any} */ (document.createElement('td-copy'));
    c.setAttribute('sensitive', '');
    c.setAttribute('size', 'sm');
    c.setAttribute('label', TdMaskedValue._fmt('copy', { label: this._label() }));
    c.value = this._secret; // property, never an attribute
    this.insertBefore(c, this._live());
  }

  /** @private the whole node goes (with td-copy's manual-copy field); focus inside it moves to the toggle */
  _removeCopy() {
    const c = this._copyEl();
    if (!c) return;
    const hadFocus = c.contains(this.ownerDocument.activeElement);
    c.remove();
    if (hadFocus) this._btn()?.focus({ preventScroll: true });
  }

  // --- reveal / re-mask ---

  /** @private */
  _onToggle() {
    if (this.hasAttribute('disabled') || this._state === 'loading') return;
    if (this._state === 'revealed') {
      this._remask('user');
      return;
    }
    this._startReveal();
  }

  /** @private */
  async _startReveal() {
    const hook = this._hook || (typeof TdMaskedValue.reveal === 'function' ? TdMaskedValue.reveal : null);
    if (!hook) {
      this._warnOnce('nohook', 'td-masked-value: no reveal hook (set element.reveal or TdMaskedValue.reveal) — nothing to show.');
      return;
    }
    const gen = ++this._gen;
    const ac = typeof AbortController === 'function' ? new AbortController() : null;
    this._ac = ac;
    this._state = 'loading';
    this._paintToggle();
    this._announce('loading');
    this._guard(true);
    let result;
    try {
      result = await hook({ element: this, signal: ac ? ac.signal : undefined });
    } catch (err) {
      if (gen !== this._gen) return; // dropped (disconnect, hidden, masked changed, disabled, mask())
      this._settleMasked();
      if (TdMaskedValue._isAbort(err)) return;
      this._announce('error');
      this.emit('reveal-error', { kind: 'rejected' }); // a kit-made detail: the app error is never forwarded
      return;
    }
    if (gen !== this._gen) return;
    if (result == null) {
      this._settleMasked(); // the user cancelled in the app (2FA dialog closed…)
      return;
    }
    if (typeof result !== 'string' || result === '') {
      this._settleMasked();
      this._announce('error');
      this.emit('reveal-error', { kind: 'invalid' });
      return;
    }
    this._show(result);
  }

  /** @private does not read anything but `name` (guarded: an app error may have hostile getters) */
  static _isAbort(err) {
    try { return !!err && err.name === 'AbortError'; } catch { return false; }
  }

  /** @private back to `masked` after a failed / cancelled reveal (no value was shown) */
  _settleMasked() {
    this._ac = null;
    this._state = 'masked';
    this._guard(false);
    this._paintToggle();
    const live = this._live();
    if (live) live.textContent = '';
  }

  /** @private */
  _show(value) {
    this._ac = null;
    this._secret = value;
    this._state = 'revealed';
    const t = this._text();
    if (t) {
      t.textContent = value;
      t.setAttribute('data-state', 'revealed');
    }
    this._paintToggle();
    if (this.hasAttribute('copyable')) this._addCopy();
    const s = this._duration();
    this._timer = window.setTimeout(() => this._remask('timeout'), s * 1000);
    this._announce('revealed', { s });
    this.emit('revealed', { duration: s });
  }

  /**
   * @private Mask now: masked text back, private value dropped, td-copy removed, timer / page guards gone, a pending
   * reveal aborted (and its result dropped by the generation counter).
   * @param {'timeout'|'user'|'hidden'|'api'|'disconnect'} reason
   */
  _remask(reason) {
    const was = this._state;
    if (was === 'masked') return;
    this._gen += 1;
    const ac = this._ac;
    this._ac = null;
    if (ac) { try { ac.abort(); } catch { /* ignore */ } }
    if (this._timer) window.clearTimeout(this._timer);
    this._timer = 0;
    this._guard(false);
    this._secret = null;
    this._state = 'masked';
    const t = this._text();
    if (t) {
      t.textContent = this.getAttribute('masked') ?? '';
      t.removeAttribute('data-state');
    }
    this._removeCopy();
    this._paintToggle();
    if (reason === 'timeout') this._announce('remasked');
    else {
      const live = this._live();
      if (live) live.textContent = '';
    }
    if (was === 'revealed' && reason !== 'disconnect') this.emit('remasked', { reason });
  }

  /** @private page hidden / pagehide → mask; bound only while loading / revealed */
  _guard(on) {
    if (on && !this._guards) {
      const doc = this.ownerDocument;
      const win = doc.defaultView || window;
      const vis = () => { if (doc.visibilityState === 'hidden') this._remask('hidden'); };
      const hide = () => this._remask('hidden');
      doc.addEventListener('visibilitychange', vis);
      win.addEventListener('pagehide', hide);
      this._guards = () => {
        doc.removeEventListener('visibilitychange', vis);
        win.removeEventListener('pagehide', hide);
      };
    } else if (!on && this._guards) {
      this._guards();
      this._guards = null;
    }
  }

  /** @private */
  _warnOnce(kind, msg) {
    if (this._warned.has(kind)) return;
    this._warned.add(kind);
    console.warn(msg); // never the element: its live DOM may hold the revealed value
  }
}

if (!customElements.get('td-masked-value')) {
  customElements.define('td-masked-value', TdMaskedValue);
}
