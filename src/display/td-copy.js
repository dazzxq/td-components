import { TdBaseElement, ssrMarker } from '../base/td-base-element.js';
import { ssrContentNodes, ssrSamePart } from '../base/td-form-element.js';
import { fillIconSlots } from '../icons/td-icon.js';

const DEFAULT_DURATION = 2000;

/**
 * <td-copy> — ONE icon button that copies a value (v0.27.0, plan v0.27.0-dsuite-p0a §D; the dcms2 action-button
 * style). Token-native: needs td.css (src/styles/components/copy.css). Not form-associated.
 *
 * - The button shows ONE registry icon at a time: `copy`, then `check` + the success tone for `duration` ms after a
 *   copy (the base state is rebuilt from the configuration, never from a DOM snapshot — clicks in a row cannot stick
 *   on "copied"). The `label` names it (`aria-label` + `data-tooltip`, picked up by TdTooltip when the site loads it);
 *   while "copied" the button's `aria-label` is `labels.copied` (back to `label` after `duration`) and a polite live
 *   region announces it. No text mode, no toast (the page may call TdToast on
 *   `copy-success`).
 * - Source, in order: the `value` property, the `value` attribute, `for="id"` (an input / textarea / select's value, any
 *   other element's text), the server-authored `<code class="td-copy__source">` (exactly ONE direct child; captured as
 *   state on the first connect, before any render — a re-render rebuilds it with the captured text).
 * - Copy: `navigator.clipboard.writeText` inside the click (user activation). Refused / unavailable → the source is
 *   selected for a manual copy (the `for` input / element, or a temporary read-only field holding the value), the
 *   `error` icon + tone, `labels.manual` announced.
 * - Events (bubbling): `copy-success` `{ value }`, `copy-error` `{ error, value }` — never the value with `sensitive`.
 * - No JS: the declarative markup must carry the server-written source (`<td-copy label="…"><code
 *   class="td-copy__source">…</code></td-copy>`): it shows while the element is undefined (users select it by hand);
 *   once defined it is hidden and the button shows. php/td.php `td_copy()` prints the full contract `copy@1` (SSR,
 *   ADR 0012) — adopted in place when it is exactly render()'s, else rendered (the captured source still copies).
 *
 * DOM contract:
 *   <td-copy label="…">
 *     [<code class="td-copy__source">value</code>]
 *     <button type="button" class="td-copy td-copy--{sm|md}" aria-label="{label}" data-tooltip="{label}"
 *             [data-state="copied|error"]>
 *       <span class="td-copy__icon" data-td-icon="copy|check|error" aria-hidden="true">svg</span></button>
 *     <span class="td-copy__status" role="status">[Đã copy | manual hint]</span>
 *     [<input class="td-copy__manual" readonly>]   ← fallback only, removed on blur
 *   </td-copy>
 *
 * @element td-copy
 * @attr {string} label - button name + tooltip (default: labels.copy)
 * @attr {string} value - text to copy
 * @attr {string} for - id of the element whose value / text is copied
 * @attr {string} size - sm | md (default md)
 * @attr {boolean} sensitive - events carry no value
 * @attr {number} duration - ms of the copied / error feedback (default 2000)
 * @fires copy-success - detail: { value } (no value when sensitive)
 * @fires copy-error - detail: { error, value } (no value when sensitive)
 */
export class TdCopy extends TdBaseElement {
  /** v0.27.0: adopts PHP td_copy() markup in place (contract copy@1). */
  static hydratable = true;

  /** Default texts (Vietnamese); override per site: `TdCopy.labels.copied = 'Copied'`. */
  static labels = {
    copy: 'Copy',
    copied: 'Đã copy',
    manual: 'Nhấn Ctrl/⌘+C để copy',
  };

  static get observedAttributes() { return ['label', 'size', 'value', 'for', 'sensitive', 'duration']; }

  static get booleanAttributes() { return ['sensitive']; }

  constructor() {
    super();
    /** @type {string|null} text of the server-authored source (captured once) */
    this._source = null;
    this._captured = false;
    /** @type {string|null} */
    this._valueProp = null;
    this._timer = 0;
    /** @private v0.31.0 (masked-value security review SEC-1): copy operation generation — a late clipboard result of an
     * operation that was superseded or whose element left the page is dropped (no feedback, no manual-copy field) */
    this._op = 0;
  }

  connectedCallback() {
    // The source is STATE: captured before any render / hydrate decision (a re-render rebuilds it).
    if (!this._initialized && !this._captured) {
      this._captured = true;
      const direct = [...this.children].filter((e) => e.localName === 'code' && e.classList.contains('td-copy__source'));
      this._source = direct.length === 1 && this.querySelectorAll('.td-copy__source').length === 1 ? direct[0].textContent : null;
    }
    super.connectedCallback();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._stopTimer();
    this._op += 1; // a pending clipboard result is dropped
    this._removeManual();
  }

  /** @returns {string} the text a click copies now ('' when there is none) */
  get value() {
    const t = this._text();
    return t == null ? '' : t;
  }

  /** Text to copy (wins over the attribute, `for` and the <code> source); null / undefined → back to them. */
  set value(v) {
    this._valueProp = v == null ? null : String(v);
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (name !== 'label' && name !== 'size') return; // read at click time
    super.attributeChangedCallback(name, oldVal, newVal);
  }

  /** @private */
  _label() {
    return this.getAttribute('label') || TdCopy.labels.copy || 'Copy';
  }

  render() {
    const label = this.escapeHtml(this._label());
    const size = this.getAttribute('size') === 'sm' ? 'sm' : 'md';
    return (this._source != null ? `<code class="td-copy__source">${this.escapeHtml(this._source)}</code>` : '')
      + `<button type="button" class="td-copy td-copy--${size}" aria-label="${label}" data-tooltip="${label}">`
      + '<span class="td-copy__icon" data-td-icon="copy" aria-hidden="true"></span></button>'
      + '<span class="td-copy__status" role="status"></span>';
  }

  afterRender() {
    this._stopTimer();
    fillIconSlots(this);
    const btn = this._button();
    if (btn) this.listen(btn, 'click', () => { this._copy(); });
  }

  // --- SSR (v0.27.0, ADR 0012, contract copy@1) ---

  /** Marker `copy@1` and children exactly render()'s (the icon slot by its attributes) → adopt in place. */
  canHydrate() {
    const m = ssrMarker(this);
    if (!m || m.name !== 'copy' || m.schema !== 1) return false;
    const tpl = document.createElement('template');
    tpl.innerHTML = this.render();
    const have = ssrContentNodes(this);
    const want = ssrContentNodes(tpl.content);
    return have.length === want.length && want.every((w, i) => ssrSamePart(have[i], w));
  }

  /** Re-connect: render again (stateless; the captured source is kept). */
  canRebind() { return false; }

  /** @private */
  _button() { return this.querySelector('button.td-copy'); }

  /** @private the text to copy, or null when there is no source */
  _text() {
    if (this._valueProp != null) return this._valueProp;
    if (this.hasAttribute('value')) return this.getAttribute('value');
    const target = this._target();
    if (target) return TdCopy._isField(target) ? target.value : target.textContent;
    if (this.hasAttribute('for')) return null;
    return this._source;
  }

  /** @private the `for` element (same document / shadow root) */
  _target() {
    const id = this.getAttribute('for');
    if (!id) return null;
    const root = this.getRootNode();
    const el = root && typeof root.getElementById === 'function' ? root.getElementById(id) : document.getElementById(id);
    return el instanceof HTMLElement ? el : null;
  }

  /** @private */
  static _isField(el) {
    return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
  }

  /** @private */
  _duration() {
    const n = Number.parseInt(this.getAttribute('duration') ?? '', 10);
    return Number.isFinite(n) && n >= 0 ? n : DEFAULT_DURATION;
  }

  /** @private */
  async _copy() {
    const op = ++this._op;
    const text = this._text();
    this._removeManual();
    if (text == null) {
      this._fail(new Error('td-copy: no source'), null);
      return;
    }
    const clip = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
    if (!clip || typeof clip.writeText !== 'function') {
      this._fail(new Error('td-copy: clipboard unavailable'), text);
      return;
    }
    try {
      await clip.writeText(text);
    } catch (err) {
      if (op !== this._op || !this.isConnected) return; // superseded / removed meanwhile
      this._fail(err, text);
      return;
    }
    if (op !== this._op || !this.isConnected) return;
    this._feedback('copied', 'check', TdCopy.labels.copied || 'Đã copy', true);
    this.emit('copy-success', this.hasAttribute('sensitive') ? {} : { value: text });
  }

  /** @private copy refused / impossible: select the source for a manual copy, error feedback, `copy-error` */
  _fail(error, text) {
    if (text != null) this._selectForManualCopy(text);
    this._feedback('error', 'error', TdCopy.labels.manual || 'Nhấn Ctrl/⌘+C để copy');
    const detail = { error };
    if (!this.hasAttribute('sensitive') && text != null) detail.value = text;
    this.emit('copy-error', detail);
  }

  /** @private state + icon + announcement, back to the configured base state after `duration` */
  _feedback(state, icon, message, rename = false) {
    const btn = this._button();
    if (!btn) return;
    this._stopTimer();
    btn.setAttribute('data-state', state);
    // review round 1 IMPL-2: the accessible name says "copied" too (restored from `label` by _resetFeedback)
    btn.setAttribute('aria-label', rename ? message : this._label());
    this._setIcon(icon);
    const status = this.querySelector('.td-copy__status');
    if (status) status.textContent = message;
    this._timer = window.setTimeout(() => this._resetFeedback(), this._duration());
  }

  /** @private the base state, rebuilt from the configuration (never a DOM snapshot) */
  _resetFeedback() {
    this._timer = 0;
    const btn = this._button();
    if (btn) {
      btn.removeAttribute('data-state');
      btn.setAttribute('aria-label', this._label());
    }
    this._setIcon('copy');
    const status = this.querySelector('.td-copy__status');
    if (status) status.textContent = '';
  }

  /** @private */
  _stopTimer() {
    if (this._timer) window.clearTimeout(this._timer);
    this._timer = 0;
  }

  /** @private one registry icon in the slot */
  _setIcon(name) {
    const btn = this._button();
    const slot = btn && btn.querySelector('.td-copy__icon');
    if (!slot) return;
    slot.setAttribute('data-td-icon', name);
    fillIconSlots(btn, '.td-copy__icon');
  }

  /** @private the `for` field / element is selected; a value without one goes into a temporary read-only field */
  _selectForManualCopy(text) {
    const target = this._target();
    try {
      if (target && TdCopy._isField(target) && !(target instanceof HTMLSelectElement)) {
        target.focus({ preventScroll: true });
        target.select();
        return;
      }
      if (target && !(target instanceof HTMLSelectElement)) {
        const range = document.createRange();
        range.selectNodeContents(target);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        return;
      }
    } catch { /* fall through to the temporary field */ }
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'td-copy__manual';
    input.readOnly = true;
    input.value = text;
    input.setAttribute('aria-label', TdCopy.labels.manual || 'Nhấn Ctrl/⌘+C để copy');
    const remove = () => this._removeManual();
    input.addEventListener('blur', remove, { once: true });
    input.addEventListener('copy', () => setTimeout(remove, 0), { once: true });
    const status = this.querySelector('.td-copy__status');
    this.insertBefore(input, status);
    this._manual = input;
    input.focus({ preventScroll: true });
    input.select();
  }

  /** @private */
  _removeManual() {
    const m = this._manual;
    this._manual = null;
    if (!m) return;
    m.value = ''; // the copied text never outlives the field (a detached reference keeps nothing either)
    if (m.parentNode) m.remove();
  }
}

if (!customElements.get('td-copy')) {
  customElements.define('td-copy', TdCopy);
}
