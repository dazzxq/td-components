import {
  TdFormElement, ssrClassKey, ssrContentNodes, ssrSameAttrs, ssrSamePart, ssrIsErrorNote, SSR_ARIA_DATA, SSR_CONTROL_ATTRS,
} from '../base/td-form-element.js';
import { ssrMarker } from '../base/td-base-element.js';
import { fillIconSlots } from '../icons/td-icon.js';
import { hasActiveAbove } from '../utils/layers.js';
import {
  createBurst, normalizeScan, normalizeValues, scanInt, parseTerminator, isDuplicate, createScanQueue, SCAN_LIMITS,
  MAX_PENDING, MAX_INVALID_ROWS, MAX_VALUES, HARD_MAX,
} from '../utils/scan-burst.js';
import { playBeep, prepareBeep } from '../utils/beep.js';

/** Attributes of the server-rendered single input that exist only for the no-JS form (removed on hydrate). */
const SSR_ONLY = ['name', 'value', 'required'];
/** The fixed scanner-safe attributes of the input (QĐ 8). */
const INPUT_ATTRS = [['autocomplete', 'off'], ['autocapitalize', 'off'], ['autocorrect', 'off'], ['spellcheck', 'false'],
  ['enterkeyhint', 'done']];
const INPUT_MODES = new Set(['none', 'text', 'numeric', 'decimal', 'tel', 'search', 'email', 'url']);
const TEXTAREA_ATTRS = new Set(['class', 'name', 'rows', 'aria-label', 'disabled']);
const HIDDEN_ATTRS = new Set(['type', 'class', 'name', 'value', 'disabled']);
/** A pointerdown on one of these is the user going somewhere: `refocus="always"` never takes the focus back. */
const INTERACTIVE = 'a[href], button, input, select, textarea, label, summary, [tabindex], [contenteditable=""], [contenteditable="true"]';
const REFOCUS_DELAY = 120;
const ANNOUNCE_DEBOUNCE = 300;
const ANNOUNCE_MAX = 1000;

const fill = (t, params) => String(t ?? '').replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m));
const short = (v) => {
  const cps = [...v];
  return cps.length > 8 ? `${cps.slice(0, 4).join('')}…` : v;
};
const make = (tag, cls, attrs = {}) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};

/**
 * <td-scan-input> — a field for KEYBOARD-WEDGE barcode scanners (v0.38.0, plan v0.38.0-scan-input). Token-native: needs
 * td.css (src/styles/components/scan-input.css). Form-associated (TdFormElement).
 *
 * - One real `<input type="text">` (autocomplete / autocapitalize / autocorrect off, spellcheck false, enterkeyhint
 *   done; `inputmode` passed through — `none` on scanner phones). The rhythm of each scan is measured on `beforeinput`
 *   (src/utils/scan-burst.js): `source` = `scanner` (≥ `min-length` characters, mean gap ≤ `key-interval`), `manual`
 *   (typed by hand — allowed unless `manual="reject"`), `paste` (paste / drop / one batch insert ≥ 50 %; never
 *   `scanner`). A scan ends on `terminator` (`enter` default | `tab` | `enter tab` | `none` = silence after a machine
 *   burst); Enter is always prevented (never an implicit form submit), a terminator Tab only after a machine burst.
 * - The value is normalised (C0 / C1 controls stripped, trimmed, cut at `maxlength` code points); empty → ignored.
 *   Same value as the last accepted / pending scan within `dedupe-window` ms → `scan-duplicate` (no validate).
 * - `validate` (property): `(value, { source, signal }) → boolean | string | { valid, message, value } | Promise` —
 *   run in parallel, results applied in scan order; `validate-timeout` aborts; throw / reject → `messages.validateFailed`.
 *   A generation counter drops every pending result on reset / form reset / restore / `clear()` / `value(s)` / disconnect.
 * - Single (default): a valid scan stays in the input, selected (the next scan overwrites it); the form value = the last
 *   valid scan. `multiple`: the input clears after each scan; each scan is a row (newest on top; pending / valid /
 *   invalid + "Bỏ"); FormData = one entry per valid value under `name` (`imei[]`); `max` counts pending scans too;
 *   pending values are reserved (A → B → A while A is pending: the second A is refused at once).
 * - Validity: pending → customError `messages.pending`; single: the last scan error → customError; `required`.
 * - Events (bubble): `scan` { value, source, seq, mixed } (valid only), `scan-invalid` { value, source, seq, message },
 *   `scan-duplicate` { value, source }, `change` { value } | { values } (user changes only), `mute-change` { muted }.
 *   Assigning `value` / `values`, `clear()`, `removeValue()`, `reset()` are silent.
 * - Beeps (`beep`, off by default): Web Audio, no file (src/utils/beep.js); `muted` / the speaker button /
 *   `TdScanInput.muted` (whole page); `TdScanInput.sounds` overrides the tones.
 * - Focus: `refocus` = `scan` (default: keep the focus through each scan, back after "Bỏ") | `always` (+ take it back
 *   when it falls to the body, never from another control, never under an overlay or in a hidden tab) | `off`.
 * - Screen readers: valid / duplicate results through a polite status region (batched: one message per burst), errors
 *   through an assertive one. Every text (value, message from validate) is TEXT (textContent / setAttribute).
 * - SSR (ADR 0012, contract `scan-input@1`): single → the shared form gate (one input, adopted in place); multiple →
 *   its own gate over the input + the no-JS textarea + the list + the hidden inputs (php/td.php td_scan_input).
 *
 * DOM contract (render(); the indicator, speaker button, notice, live regions and list head are added on bind):
 *   <td-scan-input>
 *     <div class="td-scan" [data-mode="multiple"]>
 *       [<label class="td-scan__label" for="{control id}">label</label>]
 *       <div class="td-scan__box">
 *         <input type="text" class="td-scan__input" id="{host id}-input" autocomplete="off" … enterkeyhint="done">
 *         <span class="td-scan__status" aria-hidden="true" data-state="idle|ready">icon + text</span>
 *         [<button class="td-btn td-btn--ghost td-btn--sm td-scan__mute" aria-pressed>]           — beep
 *       </div>
 *       <span class="td-scan__notice" data-tone="info|error" hidden></span>
 *       [<div class="td-scan__head"><span class="td-scan__count"> + <button class="… td-scan__clear"></div>  — multiple
 *        <ul class="td-scan__list" aria-label="Mã đã quét"> li.td-scan__item[data-value][data-state] …</ul>]
 *       <span class="td-sr-only" role="status"></span><span class="td-sr-only" aria-live="assertive"></span>
 *     </div>
 *     [<span class="td-field-error">…</span>]
 *   </td-scan-input>
 *
 * @element td-scan-input
 * @fires scan @fires scan-invalid @fires scan-duplicate @fires change @fires mute-change
 */
export class TdScanInput extends TdFormElement {
  static hydratable = true;

  /** UI texts (Vietnamese); override per site. */
  static labels = {
    input: 'Mã quét',
    ready: 'Sẵn sàng quét',
    idle: 'Bấm vào đây để quét',
    mute: 'Tắt âm báo',
    unmute: 'Bật âm báo',
    list: 'Mã đã quét',
    count: 'Đã quét: {n}',
    clearAll: 'Xoá tất cả',
    remove: 'Bỏ',
    removeLabel: 'Bỏ {value}',
    pending: 'Đang kiểm tra',
    valid: 'Hợp lệ',
    confirmClearTitle: 'Xoá tất cả mã đã quét?',
    confirmClearMessage: 'Xoá {n} mã khỏi danh sách.',
    fallback: 'Nhập tay, mỗi dòng một mã',
    announceOne: 'Mã {value} hợp lệ',
    announceMany: 'Đã quét {count} mã, mã cuối {value} hợp lệ',
    announceError: '{value}: {message}',
  };

  /** Validation / feedback texts (Vietnamese); override per site. */
  static messages = {
    invalid: 'Mã không hợp lệ.',
    validateFailed: 'Không kiểm tra được mã, vui lòng quét lại.',
    timeout: 'Kiểm tra mã quá lâu, vui lòng quét lại.',
    manualRejected: 'Vui lòng dùng máy quét.',
    pasteRejected: 'Vui lòng dùng máy quét (máy cần gửi từng ký tự).',
    duplicate: 'Đã quét mã này.',
    alreadyListed: 'Mã đã có trong danh sách.',
    alreadyPending: 'Mã đang được kiểm tra.',
    busy: 'Đang kiểm tra quá nhiều mã, vui lòng chờ.',
    max: 'Đã đủ {max} mã',
    pending: 'Đang kiểm tra mã…',
    valueMissing: 'Vui lòng quét mã.',
    valueMissingMultiple: 'Vui lòng quét ít nhất một mã.',
  };

  /** Tone overrides `{ ok | error | duplicate: { freq, ms, count } }` (clamped: 100–4000 Hz, ≤ 400 ms, 1–3 tones). */
  static sounds = {};

  /** Mute every scan input of the page (e.g. a meeting room). */
  static muted = false;

  static get observedAttributes() {
    return [...super.observedAttributes, 'value', 'label', 'placeholder', 'multiple', 'max', 'readonly', 'min-length', 'maxlength',
      'key-interval', 'terminator', 'manual', 'dedupe-window', 'validate-timeout', 'refocus', 'inputmode', 'beep', 'muted',
      'error-text', 'aria-label'];
  }

  static get booleanAttributes() { return [...super.booleanAttributes, 'readonly', 'multiple', 'beep', 'muted']; }

  static get errorContract() { return true; }

  constructor() {
    super();
    /** @private last valid value (single) */
    this._value = '';
    this._valueSet = false;
    /** @private multiple: rows oldest first `{ value, state, message, entry, el }` */
    this._rows = [];
    this._seq = 0;
    /** @private the last accepted / pending scan `{ value, t, seq }` (dedupe) */
    this._last = null;
    /** @private single: error of the last scan + its seq (ISSUE-1: older results never clear / replace it) */
    this._scanError = '';
    this._errorSeq = 0;
    /** @private seq of the last live-region / tone feedback (round 2 SEC-1) */
    this._feedbackSeq = 0;
    /** @private seq of the notice shown (ISSUE-1) */
    this._noticeSeq = 0;
    this._composing = false;
    this._validate = null;
    this._defaultValues = [];
    const self = this;
    this._burst = createBurst({
      get keyInterval() { return self._cfg().keyInterval; },
      get minLength() { return self._cfg().minLength; },
    });
    this._queue = createScanQueue({ onApply: (e) => this._apply(e) });
    this._silence = 0;
    this._refocusTimer = 0;
    this._lastDown = null;
    this._batch = null;
  }

  connectedCallback() {
    if (!this._initialized) {
      // properties assigned before the upgrade (not observed attributes): replay through the accessors
      for (const prop of ['validate', 'values']) {
        if (Object.prototype.hasOwnProperty.call(this, prop)) {
          const v = this[prop];
          delete this[prop];
          if (prop === 'values') this._earlyValues = normalizeValues(v, this._cfg().maxLength);
          else this[prop] = v;
        }
      }
      if (!this._valueSet) this._value = normalizeScan(this.getAttribute('value'), this._cfg().maxLength);
      if (this._earlyValues) this._rows = this._earlyValues.map((value) => ({ value, state: 'valid' }));
    }
    super.connectedCallback();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._bump(); // a pending scan never survives a move (scan again)
    this._docBound = false;
    window.clearTimeout(this._refocusTimer);
  }

  // --- configuration ---

  /** @private */
  _cfg() {
    const a = (n) => this.getAttribute(n);
    const refocus = a('refocus');
    return {
      keyInterval: scanInt(a('key-interval'), SCAN_LIMITS.keyInterval),
      minLength: scanInt(a('min-length'), SCAN_LIMITS.minLength),
      maxLength: scanInt(a('maxlength'), SCAN_LIMITS.maxLength),
      dedupe: scanInt(a('dedupe-window'), SCAN_LIMITS.dedupeWindow),
      timeout: scanInt(a('validate-timeout'), SCAN_LIMITS.validateTimeout),
      max: a('max') === null ? 0 : scanInt(a('max'), SCAN_LIMITS.max),
      terminator: parseTerminator(a('terminator')),
      manual: a('manual') === 'reject' ? 'reject' : 'allow',
      refocus: refocus === 'off' || refocus === 'always' ? refocus : 'scan',
    };
  }

  get _multiple() { return this.hasAttribute('multiple'); }

  // --- public API ---

  /** @returns {Function|null} the app validator (QĐ 9) */
  get validate() { return this._validate; }

  set validate(fn) { this._validate = typeof fn === 'function' ? fn : null; }

  /** @returns {string} single: the last valid value; multiple: the newest valid value ('' = none) */
  get value() {
    if (!this._multiple) return this._value;
    const v = this._validRows();
    return v.length ? v[v.length - 1].value : '';
  }

  /** Set the valid value silently (normalised; pending scans dropped). Multiple: `values = [v]`. */
  set value(v) {
    if (this._multiple) { this.values = v ? [v] : []; return; } // ISSUE-2: also before connect / upgrade
    this._value = normalizeScan(v, this._cfg().maxLength);
    this._valueSet = true;
    if (!this._initialized) return;
    this._bump();
    this._scanError = '';
    this._errorSeq = 0;
    const input = this._focusTarget();
    if (input) input.value = this._value;
    this._afterChange();
  }

  /** @returns {string[]} the valid values, oldest first (single: [] or [value]) */
  get values() {
    if (!this._multiple) return this._value ? [this._value] : [];
    return this._validRows().map((r) => r.value);
  }

  /** Set the valid values silently (normalised, empty / duplicates dropped; pending scans + invalid rows dropped). */
  set values(list) {
    const vals = normalizeValues(list, this._cfg().maxLength);
    if (!this._initialized) { this._earlyValues = vals; this._rows = vals.map((value) => ({ value, state: 'valid' })); return; }
    if (!this._multiple) { this.value = vals[0] || ''; return; }
    this._bump();
    this._rows = vals.map((value) => ({ value, state: 'valid' }));
    this._renderList();
    this._afterChange();
  }

  /** @returns {boolean} reflects the `muted` attribute */
  get muted() { return this.hasAttribute('muted'); }

  set muted(v) { this.toggleAttribute('muted', !!v); }

  /** Remove every scan (silent; pending validations dropped). */
  clear() {
    this._bump();
    this._value = '';
    this._rows = [];
    this._scanError = '';
    this._errorSeq = 0;
    const input = this._focusTarget();
    if (input) input.value = ''; // ISSUE-3: the scanner textbox too (multiple)
    this._renderList();
    this._notice('');
    this._afterChange();
  }

  /**
   * Remove one valid value (silent). @param {string} v
   * @returns {boolean} whether it was there
   */
  removeValue(v) {
    const value = normalizeScan(v, this._cfg().maxLength);
    if (!this._multiple) {
      if (!value || value !== this._value) return false;
      this.clear();
      return true;
    }
    const row = this._rows.find((r) => r.state === 'valid' && r.value === value);
    if (!row) return false;
    this._dropRow(row);
    this._afterChange();
    return true;
  }

  /** Back to the default value(s) captured at connect; pending validations dropped, errors cleared. */
  reset() {
    this._bump();
    this._scanError = '';
    this._errorSeq = 0;
    this._notice('');
    if (this._multiple) {
      this._rows = this._defaultValues.map((value) => ({ value, state: 'valid' }));
      this._renderList();
      const input = this._focusTarget();
      if (input) input.value = ''; // ISSUE-3
    } else {
      this._value = this._defaultValue || '';
      const input = this._focusTarget();
      if (input) input.value = this._value;
    }
    this._afterChange();
  }

  // --- render ---

  /** @protected */
  _focusTarget() { return this.querySelector('input.td-scan__input'); }

  /** @private */
  _controlId() { return this._ssrControlId || `${this.id}-input`; }

  render() {
    const id = this.escapeHtml(this._controlId());
    const label = this.getAttribute('label') || '';
    const ph = this.getAttribute('placeholder');
    const im = this.getAttribute('inputmode');
    const multiple = this._multiple;
    return `<div class="td-scan"${multiple ? ' data-mode="multiple"' : ''}>`
      + (label ? `<label class="td-scan__label" for="${id}">${this.escapeHtml(label)}</label>` : '')
      + `<div class="td-scan__box"><input type="text" class="td-scan__input" id="${id}"`
      + INPUT_ATTRS.map(([k, v]) => ` ${k}="${v}"`).join('')
      + (im && INPUT_MODES.has(im) ? ` inputmode="${im}"` : '')
      + (ph ? ` placeholder="${this.escapeHtml(ph)}"` : '')
      + '></div>'
      + (multiple ? `<ul class="td-scan__list" aria-label="${this.escapeHtml(TdScanInput.labels.list)}"></ul>` : '')
      + '</div>';
  }

  /** Re-render keeping the text being typed + the focus (structural attribute / disabled changes). */
  _doRender() {
    if (this._suppressRender) return;
    const old = this._bound && !this._ssrFreshRender ? this._focusTarget() : null;
    const focused = !!old && old.ownerDocument.activeElement === old;
    // ISSUE-9: a mode switch shows the NEW mode's text (multiple: empty; single: the kept value), never the old text
    const modeSwitch = this._modeSwitch;
    this._modeSwitch = false;
    let text = old ? old.value : null;
    if (modeSwitch) text = this._multiple ? '' : this._value;
    super._doRender();
    const input = this._focusTarget();
    if (input && text != null) input.value = text;
    if (input && focused) {
      input.focus({ preventScroll: true });
      if (modeSwitch && text) {
        try { input.select(); } catch { /* ignore */ }
      }
    }
  }

  afterRender() {
    const input = this._focusTarget();
    if (!input) return;
    this._bound = true;
    if (!this._multiple && !this._hydrating && input.value === '' && this._value) input.value = this._value;
    this._ensureParts();
    this._syncDisabled();
    input.readOnly = this.hasAttribute('readonly');
    this.listen(input, 'beforeinput', (e) => this._onBeforeInput(/** @type {InputEvent} */ (e)));
    this.listen(input, 'input', () => this._onInput(input));
    this.listen(input, 'keydown', (e) => this._onKeydown(/** @type {KeyboardEvent} */ (e)));
    this.listen(input, 'compositionstart', () => {
      this._composing = true;
      window.clearTimeout(this._silence); // ISSUE-8: no terminator="none" end in the middle of a composition
    });
    this.listen(input, 'compositionend', (e) => {
      this._composing = false;
      // QĐ 8: that run is manual. A commit of several characters at once (Android IME / "send as string"; Firefox
      // delivers Playwright's insertText this way too) is one batch insert (QĐ 5a): ≥ 50 % of the value → paste.
      const n = [...(/** @type {CompositionEvent} */ (e).data || '')].length;
      if (n > 1) this._burst.add(e.timeStamp, 'batch', n);
      this._burst.taint();
    });
    this.listen(input, 'focus', () => {
      if (!this._multiple && input.value && input.value === this._value) {
        try { input.select(); } catch { /* ignore */ }
      }
      this._paintStatus();
    });
    this.listen(input, 'blur', (e) => this._onBlur(/** @type {FocusEvent} */ (e)));
    const root = this.querySelector(':scope > .td-scan');
    if (root) {
      this.listen(root, 'click', (e) => this._onClick(/** @type {MouseEvent} */ (e)));
      this.listen(root, 'mousedown', (e) => {
        if (/** @type {Element} */ (e.target).closest?.('.td-scan__status')) e.preventDefault(); // keep the focus in the input
      });
    }
    if (!this._docBound) {
      this._docBound = true;
      this.listen(document, 'pointerdown', (e) => {
        const t = /** @type {Element} */ (e.target);
        this._lastDown = { t: performance.now(), interactive: !!(t && t.closest && t.closest(INTERACTIVE)) && !this.contains(t) };
      }, { capture: true, passive: true });
    }
    this._applyName();
    this._renderList();
    this._paintStatus();
    this._paintMute();
    this._syncForm();
    this._applyErrorState();
  }

  /** @private the parts added on bind (idempotent: SSR markup + render() both lack them) */
  _ensureParts() {
    const root = this.querySelector(':scope > .td-scan');
    const box = root && root.querySelector(':scope > .td-scan__box');
    if (!box) return;
    if (!box.querySelector(':scope > .td-scan__status')) {
      const status = make('span', 'td-scan__status', { 'aria-hidden': 'true', 'data-state': 'idle' });
      status.append(make('span', 'td-scan__status-icon', { 'data-td-icon': 'scan', 'data-td-icon-size': 's' }),
        make('span', 'td-scan__status-text'));
      box.append(status);
      fillIconSlots(status);
    }
    let mute = box.querySelector(':scope > .td-scan__mute');
    if (this.hasAttribute('beep') && !mute) {
      mute = make('button', 'td-btn td-btn--ghost td-btn--sm td-scan__mute', { type: 'button', 'aria-pressed': 'false' });
      mute.append(make('span', 'td-scan__mute-icon', { 'data-td-icon': 'volume', 'aria-hidden': 'true' }));
      box.append(mute);
    } else if (!this.hasAttribute('beep') && mute) {
      mute.remove();
    }
    if (!root.querySelector(':scope > .td-scan__notice')) {
      const notice = make('span', 'td-scan__notice', { id: `${this.id}-notice` });
      notice.hidden = true;
      box.after(notice);
    }
    const list = root.querySelector(':scope > .td-scan__list');
    if (list && !root.querySelector(':scope > .td-scan__head')) {
      const head = make('div', 'td-scan__head');
      const clear = make('button', 'td-btn td-btn--ghost td-btn--sm td-scan__clear', { type: 'button' });
      clear.textContent = TdScanInput.labels.clearAll;
      head.append(make('span', 'td-scan__count'), clear);
      list.before(head);
    }
    if (!root.querySelector(':scope > .td-scan__live')) {
      root.append(make('span', 'td-sr-only td-scan__live', { role: 'status' }),
        make('span', 'td-sr-only td-scan__alert', { 'aria-live': 'assertive' }));
    }
  }

  /** @private */
  _part(cls) { return this.querySelector(`:scope > .td-scan .${cls}`); }

  /** @private */
  _syncDisabled() {
    const off = this._effectiveDisabled;
    const locked = this._locked();
    const input = this._focusTarget();
    if (input) input.disabled = off;
    // ISSUE-4: readonly locks the list ("Bỏ", "Xoá tất cả"); the speaker stays usable
    for (const b of this.querySelectorAll(':scope > .td-scan button')) b.disabled = b.classList.contains('td-scan__mute') ? off : locked;
  }

  /** @private the list cannot change (disabled or readonly) */
  _locked() { return this._effectiveDisabled || this.hasAttribute('readonly'); }

  /** @private Accessible name: label → host aria-label → external labels → labels.input. */
  _applyName() {
    const input = this._focusTarget();
    if (!input) return;
    const visible = !!this.getAttribute('label');
    super._applyAccessibleName(input, visible);
    if (!visible && !input.hasAttribute('aria-label') && !input.hasAttribute('aria-labelledby')) {
      input.setAttribute('aria-label', TdScanInput.labels.input || 'Mã quét');
    }
  }

  /** @private */
  _paintStatus() {
    const status = this._part('td-scan__status');
    const input = this._focusTarget();
    if (!status || !input) return;
    const ready = input.ownerDocument.activeElement === input;
    status.setAttribute('data-state', ready ? 'ready' : 'idle');
    const text = status.querySelector('.td-scan__status-text');
    if (text) text.textContent = ready ? TdScanInput.labels.ready : TdScanInput.labels.idle;
  }

  /** @private */
  _paintMute() {
    const btn = this._part('td-scan__mute');
    if (!btn) return;
    const muted = this.muted;
    btn.setAttribute('aria-pressed', String(muted));
    btn.setAttribute('aria-label', muted ? TdScanInput.labels.unmute : TdScanInput.labels.mute);
    btn.setAttribute('data-tooltip', muted ? TdScanInput.labels.unmute : TdScanInput.labels.mute);
    const slot = btn.querySelector('.td-scan__mute-icon');
    const icon = muted ? 'volume-off' : 'volume';
    if (slot && (slot.getAttribute('data-td-icon') !== icon || !slot.firstChild)) {
      slot.setAttribute('data-td-icon', icon);
      fillIconSlots(btn);
    }
  }

  /**
   * @private feedback line under the input (duplicate, refusals in multiple mode, pending in single mode). With `seq`, a
   * notice of an OLDER scan never replaces / clears a newer one (ISSUE-1); without, it is authoritative (reset / clear).
   */
  _notice(text, tone = 'info', seq) {
    if (seq != null) {
      if (seq < this._noticeSeq) return;
      this._noticeSeq = seq;
    } else {
      this._noticeSeq = 0;
    }
    const n = this._part('td-scan__notice');
    if (!n) return;
    n.textContent = text;
    n.setAttribute('data-tone', tone);
    n.hidden = !text;
  }

  // --- list (multiple) ---

  _validRows() { return this._rows.filter((r) => r.state === 'valid'); }

  _pendingRows() { return this._rows.filter((r) => r.state === 'pending'); }

  /** @private rebuild every row (render / hydrate / values set) */
  _renderList() {
    const ul = this._part('td-scan__list');
    if (!ul) return;
    const nodes = [];
    for (const row of this._rows) {
      row.el = this._rowEl(row);
      nodes.unshift(row.el);
    }
    ul.replaceChildren(...nodes);
    this._paintCount();
  }

  /** @private */
  _rowEl(row) {
    const li = make('li', 'td-scan__item');
    li._tdScanRow = row;
    this._paintRow(li, row);
    return li;
  }

  /** @private */
  _paintRow(li, row) {
    li.setAttribute('data-value', row.value);
    li.setAttribute('data-state', row.state);
    const value = make('span', 'td-scan__value');
    value.textContent = row.value;
    const meta = make('span', 'td-scan__meta');
    const state = make('span', 'td-scan__state');
    if (row.state === 'pending') {
      state.append(make('span', 'td-scan__spinner', { 'aria-hidden': 'true' }));
      state.append(document.createTextNode(TdScanInput.labels.pending));
    } else {
      state.textContent = row.state === 'valid' ? TdScanInput.labels.valid : (row.message || '');
    }
    const rm = make('button', 'td-btn td-btn--ghost td-btn--sm td-scan__remove', {
      type: 'button', 'aria-label': fill(TdScanInput.labels.removeLabel, { value: row.value }),
    });
    rm.textContent = TdScanInput.labels.remove;
    rm.disabled = this._locked();
    meta.append(state, rm);
    li.replaceChildren(value, meta);
  }

  /** @private */
  _paintCount() {
    const head = this._part('td-scan__head');
    if (!head) return;
    head.hidden = this._rows.length === 0;
    const count = head.querySelector('.td-scan__count');
    if (count) count.textContent = fill(TdScanInput.labels.count, { n: this._validRows().length });
  }

  /** @private remove a row (cancels a pending validation) */
  _dropRow(row) {
    if (row.entry) this._queue.cancel(row.entry); // ISSUE-6: also settled but not applied yet
    if (this._last && row.seq != null && this._last.seq === row.seq) this._last = null; // a removed code can be rescanned
    this._rows = this._rows.filter((r) => r !== row);
    row.el?.remove();
    this._paintCount();
  }

  // --- input handling ---

  /** @private */
  _onBeforeInput(e) {
    if (this._composing || e.isComposing || e.inputType === 'insertCompositionText') return;
    const t = e.timeStamp;
    const type = e.inputType || '';
    if (type === 'insertText' || type === 'insertReplacementText') {
      const n = [...(e.data || '')].length;
      if (!n) return;
      this._burst.add(t, n > 1 || type === 'insertReplacementText' ? 'batch' : 'key', n);
    } else if (type === 'insertFromPaste' || type === 'insertFromDrop' || type === 'insertFromPasteAsQuotation') {
      this._burst.add(t, 'paste', [...(e.data || '')].length || 1);
    } else if (type.startsWith('delete') || type.startsWith('history')) {
      this._burst.taint();
    } else {
      return;
    }
    if (this._burst.size === 1) this._prepareAudio(); // ISSUE-5: Android IME (keyCode 229) has no usable keydown.key
    this._scheduleSilence();
  }

  /** @private hard cut at maxlength code points; an emptied input starts a new run */
  _onInput(input) {
    if (this._composing) return;
    const max = this._cfg().maxLength;
    const cps = [...input.value];
    if (cps.length > max) input.value = cps.slice(0, max).join('');
    if (input.value === '') this._burst.reset();
  }

  /** @private terminator="none": a machine burst followed by silence ends the scan */
  _scheduleSilence() {
    window.clearTimeout(this._silence);
    const cfg = this._cfg();
    if (cfg.terminator.enter || cfg.terminator.tab) return;
    this._silence = window.setTimeout(() => {
      if (this.isConnected && !this._composing && this._burst.machine()) this._finish(false); // a timer: not a user activation
    }, Math.max(3 * cfg.keyInterval, 60));
  }

  /** @private */
  _onKeydown(e) {
    // ISSUE-5: unlock Web Audio in the trusted keystroke that starts a burst (terminator="none" ends on a timer)
    if (e.key && e.key.length === 1 && this._burst.empty) this._prepareAudio();
    if (e.key === 'Enter') {
      if (e.isComposing || e.keyCode === 229 || this._composing) return; // the IME's Enter (QĐ 8)
      e.preventDefault(); // never an implicit form submit
      if (this._cfg().terminator.enter) this._finish();
      return;
    }
    if (e.key === 'Tab' && !e.shiftKey && !e.isComposing && !this._composing && this._cfg().terminator.tab && this._burst.machine()) {
      e.preventDefault(); // a scanner Tab ends the scan; a human Tab leaves as usual
      this._finish();
    }
  }

  /** @private */
  _onBlur(e) {
    this._paintStatus();
    if (this._cfg().refocus !== 'always' || e.relatedTarget) return;
    window.clearTimeout(this._refocusTimer);
    this._refocusTimer = window.setTimeout(() => this._maybeRefocus(), REFOCUS_DELAY);
  }

  /** @private refocus="always": only when the focus fell to the body (QĐ 17) */
  _maybeRefocus() {
    const input = this._focusTarget();
    if (!input || !this.isConnected || this._effectiveDisabled || this._cfg().refocus !== 'always') return;
    const doc = this.ownerDocument;
    const active = doc.activeElement;
    if (active && active !== doc.body && active !== doc.documentElement) return;
    if (doc.visibilityState === 'hidden' || hasActiveAbove(-1)) return;
    const down = this._lastDown;
    if (down && down.interactive && performance.now() - down.t < 1000) return;
    input.focus({ preventScroll: true });
  }

  /** @private delegated clicks: indicator, speaker, remove, clear all */
  _onClick(e) {
    const t = /** @type {Element} */ (e.target);
    if (!t || !t.closest) return;
    const input = this._focusTarget();
    if (t.closest('.td-scan__status')) {
      if (!this._effectiveDisabled) input?.focus();
      return;
    }
    if (t.closest('.td-scan__mute')) {
      this.muted = !this.muted;
      this.emit('mute-change', { muted: this.muted });
      return;
    }
    const rm = t.closest('.td-scan__remove');
    if (rm) {
      const li = rm.closest('li.td-scan__item');
      const row = li && li._tdScanRow;
      if (!row || this._locked()) return;
      const wasValid = row.state === 'valid';
      this._dropRow(row);
      this._afterChange();
      if (wasValid) this.emit('change', { values: this.values });
      if (this._cfg().refocus !== 'off') input?.focus({ preventScroll: true });
      return;
    }
    if (t.closest('.td-scan__clear')) this._clearAll();
  }

  /** @private "Xoá tất cả": confirm from 5 valid codes, then clear + change */
  async _clearAll() {
    if (this._locked()) return;
    const n = this._validRows().length;
    if (n >= 5) {
      const { TdModal } = await import('../feedback/td-modal.js');
      const ok = await TdModal.confirm({
        title: TdScanInput.labels.confirmClearTitle,
        message: fill(TdScanInput.labels.confirmClearMessage, { n }),
        confirmText: TdScanInput.labels.clearAll,
        confirmVariant: 'danger',
      });
      if (!ok || this._locked()) return;
    }
    const had = this._validRows().length > 0;
    this.clear();
    if (had) this.emit('change', { values: [] });
    if (this._cfg().refocus !== 'off') this._focusTarget()?.focus({ preventScroll: true });
  }

  // --- one scan ---

  /** @private end of a scan (terminator / silence) */
  _finish(trusted = true) {
    window.clearTimeout(this._silence);
    const input = this._focusTarget();
    if (!input || this._effectiveDisabled || this.hasAttribute('readonly')) { this._burst.reset(); return; }
    const cfg = this._cfg();
    const multiple = this._multiple;
    const value = normalizeScan(input.value, cfg.maxLength);
    const fresh = !this._burst.empty;
    const { source, mixed } = this._burst.classify();
    this._burst.reset();
    if (multiple) input.value = '';
    else if (input.ownerDocument.activeElement === input) {
      try { input.select(); } catch { /* ignore */ } // the next scan overwrites it
    }
    if (!value) return; // QĐ 7: empty → ignored silently
    if (!multiple && !fresh && value === this._value) return; // Enter again on the accepted value
    // ISSUE-5: unlock Web Audio inside the trusted keystroke; the tones are scheduled later, in scan order (_apply)
    if (trusted) this._prepareAudio();
    this._accept(value, source, mixed, false);
  }

  /** @private checks + queue (also the server textarea lines: `fromServer` skips dedupe) */
  _accept(value, source, mixed, fromServer) {
    const cfg = this._cfg();
    const multiple = this._multiple;
    const seq = ++this._seq;
    const now = performance.now();
    if (!fromServer) this._notice('', 'info', seq);
    if (!fromServer && isDuplicate(this._last, value, now, cfg.dedupe)) {
      this._notice(TdScanInput.messages.duplicate, 'info', seq);
      this._feedbackSeq = seq;
      this._say('polite', TdScanInput.messages.duplicate);
      this._beep('duplicate');
      this.emit('scan-duplicate', { value, source });
      return;
    }
    const M = TdScanInput.messages;
    let refusal = null;
    if (!fromServer && source !== 'scanner' && cfg.manual === 'reject') refusal = source === 'paste' ? M.pasteRejected : M.manualRejected;
    else if (multiple && this._validRows().some((r) => r.value === value)) refusal = M.alreadyListed;
    else if (multiple && this._pendingRows().some((r) => r.value === value)) refusal = M.alreadyPending;
    else if (multiple && this._validRows().length + this._pendingRows().length >= this._ceiling(cfg)) refusal = fill(M.max, { max: this._ceiling(cfg) });
    else if (this._queue.size >= MAX_PENDING) refusal = M.busy;
    if (refusal) {
      this._refuse(value, source, seq, refusal);
      return;
    }
    this._last = { value, t: now, seq };
    const input = this._focusTarget();
    const entry = this._queue.submit({
      seq, value, source, run: this._validate, timeoutMs: cfg.timeout,
      data: { mixed, focused: !!input && input.ownerDocument.activeElement === input },
    });
    if (multiple) {
      const row = { value, state: 'pending', entry, seq };
      entry.data.row = row;
      this._rows.push(row);
      const ul = this._part('td-scan__list');
      if (ul) {
        row.el = this._rowEl(row);
        ul.prepend(row.el); // one li — never the whole list (500 codes stay smooth)
      }
      this._paintCount();
    } else if (this._validate) {
      this._notice(M.pending, 'info', seq);
    }
    this._syncForm();
  }

  /** @private SEC-2: valid + pending scans in multiple mode never exceed min(max, HARD_MAX) */
  _ceiling(cfg) { return cfg.max ? Math.min(cfg.max, HARD_MAX) : HARD_MAX; }

  /** @private a scan refused before validate */
  _refuse(value, source, seq, message) {
    if (this._multiple) {
      this._notice(message, 'error', seq);
    } else {
      this._scanError = message;
      this._errorSeq = seq;
      this._syncForm();
      this._applyErrorState();
    }
    this._feedbackSeq = seq;
    this._sayError(value, message);
    this._beep('error');
    this.emit('scan-invalid', { value, source, seq, message });
  }

  /** @private a validate result, in scan order (createScanQueue) */
  _apply(entry) {
    const r = entry.result;
    const M = TdScanInput.messages;
    const cfg = this._cfg();
    // SEC-4: a fixed message only — the thrown / rejected value may carry server text, tokens or PII (the app logs its own)
    if (r.kind === 'error') console.error('td-scan-input: validate threw or rejected (the app should log its own redacted diagnostics)');
    let valid = r.valid;
    let message = '';
    const finalValue = (valid && r.value && normalizeScan(r.value, cfg.maxLength)) || entry.value;
    const row = entry.data.row;
    if (valid && this._multiple) {
      if (this._validRows().some((x) => x !== row && x.value === finalValue)) { valid = false; message = M.alreadyListed; } // final check (R1-3)
      else if (this._validRows().length >= this._ceiling(cfg)) { valid = false; message = fill(M.max, { max: this._ceiling(cfg) }); } // R2-6 / SEC-2
    }
    if (!valid && !message) {
      message = r.kind === 'timeout' ? M.timeout : r.kind === 'error' ? M.validateFailed : (r.message || M.invalid);
    }
    if (!valid && this._last && this._last.seq === entry.seq) this._last = null; // an invalid scan never blocks a rescan
    if (this._multiple) {
      if (!row || !this._rows.includes(row)) return;
      row.state = valid ? 'valid' : 'invalid';
      row.message = message;
      if (valid) row.value = finalValue;
      row.entry = null;
      if (row.el) this._paintRow(row.el, row);
      if (!valid) this._trimInvalid();
      this._paintCount();
      this._notice('', 'info', entry.seq);
    } else {
      const input = this._focusTarget();
      const latest = entry.seq === this._seq && this._burst.empty;
      if (valid) {
        // ISSUE-1 / SEC-1: an OLDER result never clears the error of a NEWER scan (refused / invalid)
        if (entry.seq > this._errorSeq) this._scanError = ''; // (the seq stays: still newer than any pending result)
        const changed = finalValue !== this._value;
        this._value = finalValue;
        if (input && latest) {
          input.value = finalValue;
          if (input.ownerDocument.activeElement === input) {
            try { input.select(); } catch { /* ignore */ }
          }
        }
        if (changed) this._changed = true;
      } else if (entry.seq >= this._errorSeq) {
        this._scanError = message;
        this._errorSeq = entry.seq;
      }
      if (!this._queue.size) this._notice('', 'info', entry.seq);
    }
    this._syncForm();
    this._applyErrorState();
    // SEC-1: an OLDER result (a newer scan already gave feedback) updates its own row and fires its app event, but never
    // touches the live regions or plays a tone that would contradict the newer feedback
    const fresh = entry.seq > this._feedbackSeq;
    if (fresh) this._feedbackSeq = entry.seq;
    if (valid) {
      if (fresh) {
        this._announceValid(finalValue);
        this._beep('ok');
      }
      if (this._multiple) this.emit('change', { values: this.values });
      else if (this._changed) { this._changed = false; this.emit('change', { value: this._value }); }
      this.emit('scan', { value: finalValue, source: entry.source, seq: entry.seq, mixed: !!entry.data.mixed });
    } else {
      if (fresh) {
        this._sayError(entry.value, message);
        this._beep('error');
      }
      this.emit('scan-invalid', { value: entry.value, source: entry.source, seq: entry.seq, message });
    }
    this._refocusAfter(entry);
  }

  /** @private keep the newest MAX_INVALID_ROWS invalid rows */
  _trimInvalid() {
    const bad = this._rows.filter((r) => r.state === 'invalid');
    for (const r of bad.slice(0, Math.max(0, bad.length - MAX_INVALID_ROWS))) this._dropRow(r);
  }

  /** @private refocus after an async result: only when the focus was in the input and fell to the body */
  _refocusAfter(entry) {
    if (this._cfg().refocus === 'off' || !entry.data.focused) return;
    const input = this._focusTarget();
    const doc = this.ownerDocument;
    const active = doc.activeElement;
    if (input && this.isConnected && !this._effectiveDisabled && (!active || active === doc.body)) input.focus({ preventScroll: true });
  }

  /** @private new generation: pending results dropped, pending rows removed (QĐ 10) */
  _bump() {
    this._queue.bump();
    window.clearTimeout(this._silence);
    this._burst.reset();
    this._last = null;
    this._batch = null;
    window.clearTimeout(this._batchTimer);
    if (this._rows.some((r) => r.state === 'pending')) {
      for (const r of this._rows) if (r.state === 'pending') r.el?.remove();
      this._rows = this._rows.filter((r) => r.state !== 'pending');
      this._paintCount();
    }
    this._notice('');
    if (this._initialized) this._syncForm();
  }

  /** @private value / values / reset / clear changed: form + error state */
  _afterChange() {
    this._paintCount();
    this._syncForm();
    this._applyErrorState();
  }

  // --- feedback ---

  /** @private ISSUE-5: create / resume the AudioContext in a trusted interaction (no sound) */
  _prepareAudio() {
    if (this.hasAttribute('beep') && !this.muted && !TdScanInput.muted) prepareBeep();
  }

  /** @private */
  _beep(kind) {
    if (!this.hasAttribute('beep') || this.muted || TdScanInput.muted) return;
    playBeep(kind, TdScanInput.sounds);
  }

  /** @private write a live region (a repeated identical text gets a trailing NBSP toggled so it is read again) */
  _say(kind, text) {
    const region = this._part(kind === 'polite' ? 'td-scan__live' : 'td-scan__alert');
    if (!region) return;
    region.textContent = region.textContent === text ? `${text} ` : text;
  }

  /** @private */
  _sayError(value, message) {
    this._say('assertive', fill(TdScanInput.labels.announceError, { value: short(value), message }));
  }

  /** @private valid results are batched: one polite message per burst (debounce 300 ms, at most 1 s) */
  _announceValid(value) {
    const now = performance.now();
    if (!this._batch) this._batch = { count: 0, value: '', t0: now };
    this._batch.count++;
    this._batch.value = value;
    window.clearTimeout(this._batchTimer);
    const wait = Math.max(0, Math.min(ANNOUNCE_DEBOUNCE, this._batch.t0 + ANNOUNCE_MAX - now));
    this._batchTimer = window.setTimeout(() => {
      const b = this._batch;
      this._batch = null;
      if (!b || !this.isConnected) return;
      const L = TdScanInput.labels;
      this._say('polite', b.count === 1 ? fill(L.announceOne, { value: short(b.value) })
        : fill(L.announceMany, { count: b.count, value: short(b.value) }));
    }, wait);
  }

  // --- form ---

  /** @returns {string} the app error (error-text / setError) or, single mode, the last scan error */
  get errorMessage() {
    const base = super.errorMessage;
    return base || (this._multiple ? '' : this._scanError || '');
  }

  /** @protected */
  _syncForm() {
    const multiple = this._multiple;
    const name = this.getAttribute('name');
    if (multiple) {
      const vals = this.values;
      let fd = null;
      if (name && vals.length) {
        fd = new FormData();
        for (const v of vals) fd.append(name, v);
      }
      this._setFormValue(fd, JSON.stringify({ v: 1, values: vals }));
    } else {
      this._setFormValue(this._value, this._value);
    }
    const input = this._focusTarget() || undefined;
    const M = TdScanInput.messages;
    if (this._queue.size > 0) {
      this._setValidity({ customError: true }, M.pending, input);
    } else if (!multiple && this._scanError) {
      this._setValidity({ customError: true }, this._scanError, input);
    } else if (this.hasAttribute('required') && !this.values.length) {
      this._setValidity({ valueMissing: true }, multiple ? M.valueMissingMultiple : M.valueMissing, input);
    } else {
      this._setValidity({});
    }
  }

  _captureDefaults() {
    this._defaultValue = this._ssrDefaults ? this._ssrDefaults.value : normalizeScan(this.getAttribute('value'), this._cfg().maxLength);
    this._defaultValues = this._multiple ? this.values : [];
  }

  _restoreDefaults() {
    this.reset();
  }

  /** @protected autofill / bfcache restore: single → the value string; multiple → `{"v":1,"values":[…]}` */
  _restoreState(state) {
    if (typeof state !== 'string') return;
    if (!this._multiple) { this.value = state; return; }
    let vals = [];
    try {
      const o = state.length <= 1_000_000 ? JSON.parse(state) : null;
      if (o && o.v === 1 && Array.isArray(o.values)) vals = o.values;
    } catch { /* ignore */ }
    this.values = vals;
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (oldVal === newVal || !this._initialized) {
      super.attributeChangedCallback(name, oldVal, newVal);
      return;
    }
    switch (name) {
      case 'value':
        if (!this._multiple) this.value = newVal ?? '';
        return;
      case 'multiple': {
        // ISSUE-9: read the PREVIOUS mode's state (the attribute has already changed, so `values` reads the new mode)
        const vals = newVal !== null ? (this._value ? [this._value] : []) : this._validRows().map((r) => r.value);
        this._bump();
        this._value = vals[vals.length - 1] || '';
        this._rows = vals.map((value) => ({ value, state: 'valid' }));
        this._scanError = '';
        this._errorSeq = 0;
        this._modeSwitch = true;
        super.attributeChangedCallback(name, oldVal, newVal); // re-render (list in / out)
        this._modeSwitch = false;
        return;
      }
      case 'readonly': {
        const input = this._focusTarget();
        if (input) input.readOnly = newVal !== null;
        this._syncDisabled(); // ISSUE-4
        return;
      }
      case 'placeholder':
      case 'inputmode': {
        const input = this._focusTarget();
        if (!input) return;
        const ok = newVal !== null && (name === 'placeholder' || INPUT_MODES.has(newVal));
        if (ok) input.setAttribute(name, newVal);
        else input.removeAttribute(name);
        return;
      }
      case 'aria-label': this._applyName(); return;
      case 'required':
      case 'name':
      case 'max':
        this._syncForm();
        return;
      case 'beep':
        this._ensureParts();
        this._syncDisabled();
        this._paintMute();
        return;
      case 'muted': this._paintMute(); return;
      case 'disabled':
        this._effectiveDisabled = newVal !== null || this._ancestorDisabled;
        this._syncDisabled();
        for (const r of this._rows) if (r.el) this._paintRow(r.el, r);
        return;
      case 'min-length': case 'maxlength': case 'key-interval': case 'terminator': case 'manual': case 'dedupe-window':
      case 'validate-timeout': case 'refocus':
        return; // read at use
      default:
        super.attributeChangedCallback(name, oldVal, newVal); // label (re-render), error-text (in place)
    }
  }

  /** fieldset disabled: in place (no re-render) */
  _syncEffectiveDisabled() {
    const next = this.hasAttribute('disabled') || this._ancestorDisabled;
    if (next === this._effectiveDisabled) return;
    this._effectiveDisabled = next;
    if (!this._initialized) return;
    this._syncDisabled();
    for (const r of this._rows) if (r.el) this._paintRow(r.el, r);
  }

  // --- SSR hydrate (ADR 0012, contract scan-input@1) ---

  /**
   * Single: the shared form gate (`_ssrDecide`). Multiple: its own gate over input + textarea + list + hidden inputs
   * (review R1-4): values from the hidden inputs, the textarea lines queued for `validate` after the bind.
   * @returns {boolean}
   */
  canHydrate() {
    const m = ssrMarker(this);
    if (!m || m.name !== 'scan-input') return false;
    if (this._multiple) return this._ssrMultiple(m.schema);
    const control = this._ssrStateSource();
    if (!control) return this._ssrClean(false);
    this._ssrDefaults = { value: this._earlyProps?.has('value') ? this._value : normalizeScan(this.getAttribute('value'), this._cfg().maxLength) };
    this._ssrControlId = control.id || null;
    const matches = m.schema === 1 && this._markupMatches(true)
      && this._ssrFormAttrsAgree(control, [['name', 'name'], ['required', 'required'], ['disabled', 'disabled']], ['required', 'disabled']);
    return this._ssrDecide(control, matches, false);
  }

  /** A moved element re-renders (pending scans are dropped on disconnect anyway; the state lives in the fields). */
  canRebind() { return false; }

  /** @protected */
  _ssrSlotControl() {
    const one = (parent, tag, cls) => {
      const c = [...parent.children].filter((e) => e.localName === tag && e.classList.contains(cls));
      return c.length === 1 ? c[0] : null;
    };
    const root = one(this, 'div', 'td-scan');
    const box = root && one(root, 'div', 'td-scan__box');
    return box ? one(box, 'input', 'td-scan__input') : null;
  }

  /** @protected */
  _ssrPlausible() { return 'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="file"])'; }

  /** @protected single: the text being typed (not the form value — that is the host `value`) + selection + focus */
  _ssrCapture(control, _live) {
    const focused = control === control.ownerDocument.activeElement;
    let selection = null;
    try {
      if (control.selectionStart != null) selection = [control.selectionStart, control.selectionEnd, control.selectionDirection || 'none'];
    } catch { /* no selection API */ }
    return { text: [...String(control.value)].slice(0, this._cfg().maxLength).join(''), selection, focused };
  }

  hydrateExisting() {
    if (this._ssrMulti) { this._hydrateMultiple(); return; }
    const control = this._ssrControl;
    const state = this._ssrState;
    control.value = state.text; // dirty: removing the value attribute below changes nothing
    const note = [...this.children].find(ssrIsErrorNote);
    if (note) this._errorNote = note;
    const own = `${this.id}-error`;
    const rest = (control.getAttribute('aria-describedby') || '').split(/\s+/).filter((t) => t && t !== own);
    if (rest.length) control.setAttribute('aria-describedby', rest.join(' '));
    else control.removeAttribute('aria-describedby');
    this._syncForm(); // ElementInternals FIRST…
    for (const a of SSR_ONLY) control.removeAttribute(a); // …then the no-JS attributes: FormData has ONE entry
    this._ssrRetargetLabels(control);
    this._ssrControl = null;
    this._ssrState = null;
    this._hydrating = true;
    queueMicrotask(() => { this._hydrating = false; });
  }

  /** @protected after refused markup was replaced: the typed text / list + the focus */
  _restoreSsrState(state) {
    const input = this._focusTarget();
    if (state.multi) {
      this._rows = state.multi.values.map((value) => ({ value, state: 'valid' }));
      this._renderList();
      if (input && state.multi.text) input.value = state.multi.text;
      this._afterChange();
      this._queueLines(state.multi.lines);
      if (state.multi.focused && input) input.focus({ preventScroll: true });
      return;
    }
    if (state.clean) {
      if (state.refocus && input) input.focus({ preventScroll: true });
      return;
    }
    if (input) input.value = state.text;
    if (state.refocus && input) {
      input.focus({ preventScroll: true });
      if (state.selection) {
        try { input.setSelectionRange(...state.selection); } catch { /* ignore */ }
      }
    }
  }

  /** @protected `div.td-scan` > [label] + `div.td-scan__box` > input — then at most the error note */
  _ssrSkeletonOk() {
    const kids = ssrContentNodes(this);
    if (!kids.length || kids.length > 2 || kids.some((n) => n.nodeType !== 1) || (kids[1] && !ssrIsErrorNote(kids[1]))) return false;
    const root = kids[0];
    if (root.localName !== 'div' || ssrClassKey(root) !== 'td-scan') return false;
    const parts = ssrContentNodes(root);
    if (parts.some((n) => n.nodeType !== 1) || parts.length < 1 || parts.length > 2) return false;
    if (parts.length === 2 && (parts[0].localName !== 'label' || parts[0].children.length)) return false;
    const box = parts[parts.length - 1];
    if (box.localName !== 'div' || ssrClassKey(box) !== 'td-scan__box') return false;
    const inner = ssrContentNodes(box);
    return inner.length === 1 && inner[0] === this._ssrControl;
  }

  /**
   * @private Exactly render()'s tree (single): wrapper, label, box, the input (type text, id, the fixed attributes,
   * inputmode / placeholder as render(); allowlist; `first` = the no-JS name / value / required may still be there).
   */
  _markupMatches(first) {
    const kids = ssrContentNodes(this);
    if (!kids.length || kids.length > 2 || (kids.length === 2 && !ssrIsErrorNote(kids[1]))) return false;
    if ((kids.length === 2) !== !!this.errorMessage) return false;
    const want = this._template().firstElementChild;
    const root = kids[0];
    if (root.nodeType !== 1 || root.localName !== 'div' || !ssrSameAttrs(root, want)) return false;
    const have = ssrContentNodes(root);
    const need = [...want.children];
    if (have.length !== need.length || have.some((n) => n.nodeType !== 1)) return false;
    return need.every((w, i) => (w.localName === 'label' ? ssrSamePart(have[i], w) : this._ssrBoxOk(have[i], w, first)));
  }

  /** @private */
  _template() {
    const tpl = document.createElement('template');
    tpl.innerHTML = this.render();
    return tpl.content;
  }

  /** @private the box holds exactly render()'s input (+ allowed attributes) */
  _ssrBoxOk(box, want, first) {
    if (!box || box.localName !== 'div' || !ssrSameAttrs(box, want)) return false;
    const parts = ssrContentNodes(box);
    if (parts.length !== 1 || parts[0].nodeType !== 1) return false;
    return this._ssrInputOk(parts[0], want.firstElementChild, first);
  }

  /** @private */
  _ssrInputOk(c, wc, first) {
    if (c.localName !== 'input' || c.getAttribute('type') !== 'text' || ssrClassKey(c) !== 'td-scan__input' || c.id !== wc.id) return false;
    for (const a of wc.attributes) {
      if (a.name === 'class' || a.name === 'id' || a.name === 'type') continue;
      if (c.getAttribute(a.name) !== a.value) return false;
    }
    for (const n of ['inputmode', 'placeholder']) if (c.hasAttribute(n) !== wc.hasAttribute(n)) return false;
    const ok = (n) => (SSR_CONTROL_ATTRS.has(n) && n !== 'checked' && (first || !SSR_ONLY.includes(n))) || SSR_ARIA_DATA.test(n);
    return [...c.attributes].every((a) => ok(a.name));
  }

  /**
   * @private Multiple (review R1-4 / R2-7): the strict gate; on success adopt in place, else safe render + ONE warning.
   * The values = the hidden inputs (or `values` assigned early, which win); the textarea lines are captured only from
   * exactly one `textarea.td-scan__fallback` and queued for validate after the bind.
   */
  _ssrMultiple(schema) {
    const max = this._cfg().maxLength;
    const fallbacks = this.querySelectorAll('textarea.td-scan__fallback');
    const raw = fallbacks.length === 1 ? String(fallbacks[0].value).split(/\r\n|\r|\n/).slice(0, MAX_VALUES) : [];
    const gate = schema === 1 ? this._ssrMultiGate() : null;
    if (!gate) console.warn('td-scan-input: server markup does not match scan-input@1 — the list starts empty (the server stays the source of truth on save).');
    const values = this._earlyValues || (gate ? normalizeValues(gate.values, max) : []);
    const taken = new Set(values);
    const lines = [];
    for (const l of raw) {
      const v = normalizeScan(l, max);
      if (!v || taken.has(v)) continue;
      taken.add(v);
      lines.push(v);
    }
    const input = gate ? gate.input : this.querySelectorAll('input.td-scan__input').length === 1 ? this.querySelector('input.td-scan__input') : null;
    const multi = {
      values, lines,
      text: input ? [...String(input.value)].slice(0, max).join('') : '',
      focused: !!input && input === input.ownerDocument.activeElement,
    };
    if (gate) {
      this._ssrMulti = { ...multi, gate };
      this._ssrControlId = gate.input.id || null;
      return true;
    }
    const active = this.ownerDocument.activeElement;
    multi.focused = !!active && active !== this && this.contains(active);
    this._ssrRestore = { multi };
    this._ssrFreshRender = true;
    return false;
  }

  /** @private host > div.td-scan[data-mode=multiple] > [label] + box > input, textarea, ul > li × N; then N hidden (+ note) */
  _ssrMultiGate() {
    const name = this.getAttribute('name');
    const disabled = this.hasAttribute('disabled');
    const kids = ssrContentNodes(this);
    if (!kids.length || kids.some((n) => n.nodeType !== 1)) return null;
    const [root, ...rest] = kids;
    const note = rest.length && ssrIsErrorNote(rest[rest.length - 1]) ? rest.pop() : null;
    if (!!note !== !!this.errorMessage) return null;
    const hidden = rest;
    this._ssrControlId = null;
    const control = root.querySelector?.(':scope > .td-scan__box > input.td-scan__input');
    if (control) this._ssrControlId = control.id || null;
    const want = this._template().firstElementChild;
    if (root.localName !== 'div' || !ssrSameAttrs(root, want)) return null;
    const have = ssrContentNodes(root);
    const need = [...want.children]; // [label?], box, ul
    if (have.length !== need.length + 1 || have.some((n) => n.nodeType !== 1)) return null;
    const ta = have[need.length - 1];
    const parts = [...have.slice(0, need.length - 1), have[need.length]];
    for (let i = 0; i < need.length; i++) {
      const w = need[i];
      const h = parts[i];
      if (w.localName === 'label' && !ssrSamePart(h, w)) return null;
      if (w.localName === 'div' && !this._ssrBoxOk(h, w, false)) return null;
      if (w.localName === 'ul' && (h.localName !== 'ul' || !ssrSameAttrs(h, w))) return null;
    }
    const input = parts[need.length - 2].firstElementChild;
    if (input.hasAttribute('name') || input.hasAttribute('value')) return null;
    if (ta.localName !== 'textarea' || ssrClassKey(ta) !== 'td-scan__fallback' || ta.children.length
      || ![...ta.attributes].every((a) => TEXTAREA_ATTRS.has(a.name))
      || ta.getAttribute('name') !== name || ta.hasAttribute('disabled') !== disabled) return null;
    const items = [...parts[need.length - 1].childNodes].filter((n) => n.nodeType === 1 || (n.nodeType === 3 && n.data.trim()));
    if (items.length !== hidden.length) return null;
    const values = [];
    for (let i = 0; i < items.length; i++) {
      const li = items[i];
      const h = hidden[i];
      if (li.nodeType !== 1 || li.localName !== 'li' || ssrClassKey(li) !== 'td-scan__item'
        || ![...li.attributes].every((a) => a.name === 'class' || a.name === 'data-value')) return null;
      const spans = ssrContentNodes(li);
      if (spans.length !== 1 || spans[0].nodeType !== 1 || spans[0].localName !== 'span' || ssrClassKey(spans[0]) !== 'td-scan__value'
        || spans[0].attributes.length !== 1 || spans[0].children.length) return null;
      const v = li.getAttribute('data-value');
      if (v === null || spans[0].textContent !== v) return null;
      if (h.localName !== 'input' || (h.getAttribute('type') || '').toLowerCase() !== 'hidden' || ssrClassKey(h) !== 'td-scan__hidden'
        || ![...h.attributes].every((a) => HIDDEN_ATTRS.has(a.name)) || h.getAttribute('name') !== name
        || h.getAttribute('value') !== v || h.hasAttribute('disabled') !== disabled) return null;
      values.push(v);
    }
    return { values, input, textarea: ta, hidden, items };
  }

  /** @private multiple adoption: values on the host, internals FIRST, then the no-JS parts go (FormData = one set) */
  _hydrateMultiple() {
    const st = this._ssrMulti;
    this._ssrMulti = null;
    this._rows = st.values.map((value) => ({ value, state: 'valid' }));
    st.gate.input.value = st.text;
    const note = [...this.children].find(ssrIsErrorNote);
    if (note) this._errorNote = note;
    this._syncForm();
    for (const n of [...st.gate.hidden, st.gate.textarea]) {
      n.removeAttribute('name');
      n.remove();
    }
    for (const li of st.gate.items) li.remove();
    this._ssrRetargetLabels(st.gate.input);
    this._queueLines(st.lines);
  }

  /** @private the textarea lines typed before the module loaded → validate, in order, same generation (QĐ 19 step 5) */
  _queueLines(lines) {
    if (!lines.length) return;
    const gen = this._queue.gen;
    queueMicrotask(() => {
      if (gen !== this._queue.gen || !this.isConnected) return;
      for (const v of lines) this._accept(v, 'manual', false, true);
    });
  }
}

if (!customElements.get('td-scan-input')) {
  customElements.define('td-scan-input', TdScanInput);
}
