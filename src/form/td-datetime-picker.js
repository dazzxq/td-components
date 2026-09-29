import { TdFormElement } from '../base/td-form-element.js';
import { TdModal } from '../feedback/td-modal.js';
import { fillIconSlots } from '../icons/td-icon.js';
import {
  parseBound, invalidReason, normalizeMinuteStep, snapMinuteDown, partsFromDate, compareParts,
  normalizeMode, toModeParts, parseModeValue, parseModeDb, formatModeDisplay, formatModeDb, formatModeIso,
  compareModeParts, MODE_PARTS,
} from '../utils/datetime.js';

const DEFAULT_MIN_YEAR = 2000; // dcms parity (D5): the range used when `min` / `max` are not set
const DEFAULT_MAX_YEAR = 2099;
const SCROLL_SETTLE_MS = 150; // fallback when `scrollend` is not supported
const MODE_SUFFIX = { datetime: '', date: 'Date', month: 'Month', year: 'Year' };

const pad2 = (n) => String(n).padStart(2, '0');
const fill = (template, vars) => String(template).replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : ''));
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const prefersReducedMotion = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};

/**
 * Date-time picker: a field-look trigger that opens a dialog with three date fields and hour/minute wheels.
 * Token-native since 0.10.0 (plan v0.10.0-batch4 item 1, D1–D10): styles come from td.css
 * (`components/datetime-picker.css`, blocks `.td-dtp`, `.td-dtp-panel`, `.td-dtp-wheel`); state lives in `aria-*`,
 * `[hidden]`, `data-state`, `data-placeholder` — no Tailwind, no adopted stylesheet, no inline style markup.
 *
 * Rendered DOM (the trigger is updated IN PLACE by value / placeholder / error / disabled / required / min / max /
 * minute-step / form-value-format changes; only `label` re-renders):
 *   <td-datetime-picker id="{host}">
 *     <div class="td-dtp" data-state="closed|open">
 *       [<label class="td-field__label" id="{host}-label" for="{host}-trigger">{label}[<span class="td-field__required"> *</span>]</label>]
 *       <button type="button" class="td-dtp__trigger" id="{host}-trigger" role="combobox" aria-haspopup="dialog"
 *               aria-expanded [aria-controls="{modal id}" while open] [aria-required] [aria-invalid] …>
 *         <span class="td-dtp__value" [data-placeholder]>{dd/mm/yyyy - hh:mm | raw | placeholder}</span>
 *         <span class="td-dtp__icon" data-td-icon="calendar" aria-hidden="true"></span>
 *       </button>
 *     </div>
 *     [<span class="td-field-error" id="{host}-error" data-for="{host}">…</span>]
 *   </td-datetime-picker>
 *
 * Panel (a Node body inside TdModal `escapeCloses: true`; `{p}` = `{host}-dtp{n}`, n unique per open): `fieldset.td-dtp-panel__group`
 * with three labelled `input.td-dtp-panel__input[type=number][inputmode=numeric]` (`{p}-day|month|year`), a
 * `[role=group]` with two wheels `.td-dtp-wheel > .td-dtp-wheel__list[role=listbox][tabindex=0]` named "Giờ" / "Phút"
 * (`{p}-hour|minute`) whose `.td-dtp-wheel__option[role=option]` children are never focusable, a preview and a
 * `p.td-dtp-panel__error[role=alert]`. Footer = TdModal actions "Đóng" / "Bây giờ" / "Chọn" (primary).
 *
 * Keyboard: on the trigger Enter, Space, ArrowDown (incl. Alt+ArrowDown) open (never submits a form). In the dialog:
 * focus starts in the day field; date fields validate on `input` and clamp on `change` (D9); each wheel is ONE tab
 * stop — ArrowUp/ArrowDown ±1, PageUp/PageDown ±6 h / ±15 min, Home/End; the active option IS the selection
 * (`aria-activedescendant` + `aria-selected` in sync); click and scroll (CSS scroll-snap) select too. "Chọn" commits
 * the pending state (one `change`), focus returns to the trigger; Escape / X / "Đóng" discard it.
 *
 * **Modes (v0.18.0):** `mode="datetime"` (default, above) | `date` (day/month/year fields only) | `month` (month + year)
 * | `year` (year only). Each mode has its own display / DB / ISO format (table in docs/components/datetime-picker.md);
 * components outside the mode do not exist in the value. `open-at` (today | min | max | a date) positions an EMPTY
 * picker when it opens; without it the picker opens at today, clamped to min–max (v0.19.0 — the 0.18.0 "min before
 * 2000 → min" rule is gone; set `open-at="min"` to open at the start of the range).
 *
 * **Form-associated:** submits ISO-local `YYYY-MM-DDTHH:mm:00` by default, `form-value-format="display"`
 * (dd/mm/yyyy - hh:mm) or `"db"` (yyyy-mm-dd hh:mm:ss) — other modes: `YYYY-MM-DD` | `YYYY-MM` | `YYYY` (iso = db).
 * A malformed or impossible value (e.g. 31/02, 25:99, a year
 * outside the default 2000–2099) sets `badInput` and submits the raw string; `min` / `max` set `rangeUnderflow` /
 * `rangeOverflow`; `required` + empty → `valueMissing`. Error contract: `error-text`, `setError()`, `clearError()`.
 *
 * Ported from DCMS DateTimePicker.
 *
 * @element td-datetime-picker
 * @attr {string} mode - datetime (default) | date | month | year (v0.18.0)
 * @attr {string} value - Display format value of the mode (dd/mm/yyyy - hh:mm | dd/mm/yyyy | mm/yyyy | yyyy); the
 *   mode's ISO (yyyy-mm-ddThh:mm | yyyy-mm-dd | yyyy-mm | yyyy) is accepted too
 * @attr {string} open-at - today | min | max | a date (same formats as `min`): where an empty picker opens (v0.18.0)
 * @attr {string} placeholder - Placeholder text (default: the mode's display pattern)
 * @attr {string} label - Visible label (names the combobox)
 * @attr {string} min - Earliest allowed value: dd/mm/yyyy[ - hh:mm] or yyyy-mm-dd[Thh:mm] (also mm/yyyy, yyyy-mm,
 *   yyyy); a date-only min means 00:00; compared at the mode's granularity (month: the month; year: the year)
 * @attr {string} max - Latest allowed value (same formats); a date-only max means 23:59
 * @attr {number} minute-step - Minute wheel step (1–30, divides 60; default 1); values snap DOWN on open
 * @attr {string} form-value-format - Submitted format: iso (default) | display | db
 * @attr {boolean} disabled - Disables interaction (also via ancestor <fieldset disabled>)
 * @attr {boolean} required - A valid date must be present for the form to be valid
 * @attr {string} name - Form field name (submitted via the host)
 * @attr {string} error-text - Error message (aria-invalid + note)
 * @fires change - When a date is confirmed ("Chọn"), detail: { value, dbValue }
 */
export class TdDatetimePicker extends TdFormElement {
  static get observedAttributes() {
    return [...super.observedAttributes, 'value', 'placeholder', 'label', 'minute-step', 'form-value-format',
      'min', 'max', 'error-text', 'aria-label', 'mode', 'open-at'];
  }

  static get booleanAttributes() { return [...super.booleanAttributes]; }

  static get errorContract() { return true; }

  /** Default UI strings (Vietnamese); override per site: `TdDatetimePicker.labels.confirm = 'OK'`. */
  static labels = {
    title: 'Chọn ngày giờ', placeholder: 'dd/mm/yyyy - hh:mm', date: 'Ngày', day: 'Ngày', month: 'Tháng', year: 'Năm',
    time: 'Giờ', hour: 'Giờ', minute: 'Phút', close: 'Đóng', now: 'Bây giờ', confirm: 'Chọn',
    // Per-mode variants (v0.18.0): `{key}{Date|Month|Year}`, falling back to the datetime `key`.
    titleDate: 'Chọn ngày', titleMonth: 'Chọn tháng', titleYear: 'Chọn năm',
    placeholderDate: 'dd/mm/yyyy', placeholderMonth: 'mm/yyyy', placeholderYear: 'yyyy',
    nowDate: 'Hôm nay', nowMonth: 'Tháng này', nowYear: 'Năm nay',
    dateMonth: 'Tháng', dateYear: 'Năm', // legend of the fields group
  };

  /** Validation messages (`{min}` / `{max}` are filled in); override per site like `labels`. */
  static messages = {
    required: 'Vui lòng chọn ngày giờ',
    requiredDate: 'Vui lòng chọn ngày',
    requiredMonth: 'Vui lòng chọn tháng',
    requiredYear: 'Vui lòng chọn năm',
    format: 'Định dạng ngày giờ không hợp lệ',
    formatDate: 'Định dạng ngày không hợp lệ',
    formatMonth: 'Định dạng tháng không hợp lệ',
    formatYear: 'Định dạng năm không hợp lệ',
    incomplete: 'Vui lòng nhập đầy đủ ngày, tháng, năm',
    incompleteMonth: 'Vui lòng nhập đầy đủ tháng, năm',
    incompleteYear: 'Vui lòng nhập năm',
    day: 'Ngày phải từ 1 đến 31',
    month: 'Tháng phải từ 1 đến 12',
    year: 'Năm phải từ {min} đến {max}',
    hour: 'Giờ phải từ 0 đến 23',
    minute: 'Phút phải từ 0 đến 59',
    date: 'Ngày không hợp lệ',
    min: 'Không được trước {min}',
    max: 'Không được sau {max}',
  };

  constructor() {
    super();
    this._isOpen = false;
    this._modalId = null;
    /** @private pending parts while the dialog is open (committed only by "Chọn") */
    this._pending = null;
    /** @private the open panel element */
    this._panel = null;
    /** @private scroll-settle fallback timers (cancelled on close — bug 1.8.6) */
    this._scrollTimers = new Set();
  }

  // --- Value model (derived from the `value` attribute on demand: nothing to go stale) ---

  /** @private @returns {'datetime'|'date'|'month'|'year'} */
  _mode() { return normalizeMode(this.getAttribute('mode')); }

  /** @private per-mode string: `{key}{Date|Month|Year}` when defined, else the (datetime) `key` */
  _text(table, key) {
    return table[key + MODE_SUFFIX[this._mode()]] ?? table[key];
  }

  /** @private `{ min, max }` parsed bounds (date-only expanded, D5); null = not set / invalid */
  _bounds() {
    return { min: parseBound(this.getAttribute('min'), 'min'), max: parseBound(this.getAttribute('max'), 'max') };
  }

  /** @private year range for the year field and the default-range check */
  _yearRange() {
    const { min, max } = this._bounds();
    if (!min && !max) return { min: DEFAULT_MIN_YEAR, max: DEFAULT_MAX_YEAR };
    // An explicit bound replaces the whole default range: the other side is the helpers' valid year limit, so a
    // one-sided bound outside 2000–2099 never yields an impossible range (review ISSUE-2).
    return { min: min ? min.year : 1, max: max ? max.year : 9999 };
  }

  /** @private */
  _minuteStep() { return normalizeMinuteStep(this.getAttribute('minute-step')); }

  /**
   * Validate parts (committed or pending).
   * @private
   * @returns {{ flag: 'badInput'|'rangeUnderflow'|'rangeOverflow', message: string, field: string|null }|null}
   */
  _check(p) {
    const M = TdDatetimePicker.messages;
    const mode = this._mode();
    const { min, max } = this._bounds();
    const years = this._yearRange();
    const reason = invalidReason(p);
    if (reason) {
      const field = reason === 'incomplete' ? MODE_PARTS[mode].find((k) => !Number.isInteger(p && p[k])) || null
        : reason === 'date' ? 'day' : reason;
      const message = reason === 'year' ? fill(M.year, years)
        : reason === 'incomplete' ? this._text(M, 'incomplete') : M[reason];
      return { flag: 'badInput', message, field };
    }
    if (!min && !max && (p.year < DEFAULT_MIN_YEAR || p.year > DEFAULT_MAX_YEAR)) {
      return { flag: 'badInput', message: fill(M.year, years), field: 'year' };
    }
    if (min && compareModeParts(p, min, mode) < 0) {
      return { flag: 'rangeUnderflow', message: fill(M.min, { min: formatModeDisplay(min, mode) }), field: null };
    }
    if (max && compareModeParts(p, max, mode) > 0) {
      return { flag: 'rangeOverflow', message: fill(M.max, { max: formatModeDisplay(max, mode) }), field: null };
    }
    return null;
  }

  /** @private current committed state */
  _state() {
    const raw = this.getAttribute('value') || '';
    if (!raw) return { raw, parts: null, error: null, usable: false };
    const parts = parseModeValue(raw, this._mode()); // the mode's display or ISO format
    const error = parts ? this._check(parts)
      : { flag: 'badInput', message: this._text(TdDatetimePicker.messages, 'format'), field: null };
    // A range violation is still a real value (like a native input); malformed / impossible values are not (D8).
    return { raw, parts, error, usable: !!parts && !(error && error.flag === 'badInput') };
  }

  /** @private submitted string for usable parts, per `form-value-format` */
  _formatForForm(p) {
    const mode = this._mode();
    switch (this.getAttribute('form-value-format')) {
      case 'display': return formatModeDisplay(p, mode);
      case 'db': return formatModeDb(p, mode);
      default: return formatModeIso(p, mode); // datetime: `yyyy-mm-ddThh:mm:00`, unchanged since v0.17.0
    }
  }

  /** @private valid parts clamped into [min, max] at the mode's granularity, reduced to the mode's components */
  _clampToBounds(p) {
    const mode = this._mode();
    const { min, max } = this._bounds();
    if (min && compareModeParts(p, min, mode) < 0) return toModeParts(min, mode);
    if (max && compareModeParts(p, max, mode) > 0) return toModeParts(max, mode);
    return toModeParts(p, mode);
  }

  /**
   * @private `mode` changed while a value is set: keep the components that still mean something, give new ones the
   * fixed defaults (month 01, day 01, 00:00), clamp, rewrite `value` in the new display format. No `change` event.
   * @param {string} oldMode
   */
  _convertValueMode(oldMode) {
    const raw = this.getAttribute('value');
    if (!raw) return;
    const parts = parseModeValue(raw, oldMode);
    if (!parts || invalidReason(parts)) return; // unusable: kept verbatim (the new mode flags it)
    const next = formatModeDisplay(this._clampToBounds(toModeParts(parts, oldMode)), this._mode());
    if (next !== raw) this.setAttribute('value', next);
  }

  // --- Rendering ---

  render() {
    const esc = (s) => this.escapeHtml(String(s));
    const id = esc(this.id);
    const label = this.getAttribute('label') || '';
    const { text, placeholder } = this._triggerText();
    return `<div class="td-dtp" data-state="${this._isOpen ? 'open' : 'closed'}">`
      + (label ? `<label class="td-field__label" id="${id}-label" for="${id}-trigger">${esc(label)}</label>` : '')
      + `<button type="button" class="td-dtp__trigger" id="${id}-trigger" role="combobox" aria-haspopup="dialog"`
      + ` aria-expanded="${this._isOpen}"${this._effectiveDisabled ? ' disabled' : ''}>`
      + `<span class="td-dtp__value"${placeholder ? ' data-placeholder' : ''}>${esc(text)}</span>`
      + '<span class="td-dtp__icon" data-td-icon="calendar" aria-hidden="true"></span>'
      + '</button></div>';
  }

  afterRender() {
    fillIconSlots(this);
    const trigger = this._trigger();
    if (trigger) {
      this.listen(trigger, 'click', () => this._open());
      this.listen(trigger, 'keydown', (e) => {
        // APG combobox with a dialog popup. preventDefault: no implicit form submission, no page scroll.
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
          e.preventDefault();
          this._open();
        }
      });
    }
    this._applyName();
    this._applyRequired();
    this._syncForm();
    this._applyErrorState();
  }

  /** @private */
  _triggerText() {
    const s = this._state();
    if (!s.raw) {
      return { text: this.getAttribute('placeholder') || this._text(TdDatetimePicker.labels, 'placeholder'), placeholder: true };
    }
    return { text: s.usable ? formatModeDisplay(s.parts, this._mode()) : s.raw, placeholder: false };
  }

  /** @private */
  _updateValueText() {
    const span = this.querySelector('.td-dtp__value');
    if (!span) return;
    const { text, placeholder } = this._triggerText();
    span.textContent = text;
    if (placeholder) span.setAttribute('data-placeholder', '');
    else span.removeAttribute('data-placeholder');
  }

  /** In place: everything except `label` (structure). */
  attributeChangedCallback(name, oldVal, newVal) {
    if (oldVal === newVal) return;
    if (name === 'disabled') this._effectiveDisabled = newVal !== null || this._ancestorDisabled;
    if (!this._initialized) return;
    switch (name) {
      case 'value':
        this._updateValueText();
        this._syncForm();
        return;
      case 'placeholder':
        this._updateValueText();
        return;
      case 'form-value-format':
      case 'min':
      case 'max':
        this._updateValueText();
        this._syncForm();
        if (this._panel) { // open dialog: the year field's native bounds + the pending validation follow
          const years = this._yearRange();
          const y = this._panel.querySelector('.td-dtp-panel__input[data-part="year"]');
          if (y) { y.min = String(years.min); y.max = String(years.max); }
          this._refresh();
        }
        return;
      case 'minute-step': // read on the next open
      case 'open-at':
      case 'name':
        return;
      case 'mode': { // other fields / formats: close an open dialog, convert the value, redraw the trigger
        const active = document.activeElement;
        const modalRoot = this._modalId ? document.getElementById(this._modalId) : null;
        const hadFocus = this.contains(active) || !!(modalRoot && modalRoot.contains(active));
        if (this._isOpen) this._close();
        this._convertValueMode(normalizeMode(oldVal));
        this._updateValueText();
        this._syncForm();
        if (hadFocus && this._trigger()) this._trigger().focus();
        return;
      }
      case 'disabled':
        this._applyDisabled();
        return;
      case 'required':
        this._applyRequired();
        this._syncForm();
        return;
      case 'aria-label':
        this._applyName();
        return;
      case 'error-text':
        super.attributeChangedCallback(name, oldVal, newVal); // base error contract, no re-render
        return;
      default: { // label
        const active = document.activeElement;
        const modalRoot = this._modalId ? document.getElementById(this._modalId) : null;
        const hadFocus = this.contains(active) || !!(modalRoot && modalRoot.contains(active));
        if (this._isOpen) this._close();
        this._doRender();
        if (hadFocus && this._trigger()) this._trigger().focus();
      }
    }
  }

  /** @protected <fieldset disabled> toggles in place (no re-render → focus kept). */
  _syncEffectiveDisabled() {
    const next = this.hasAttribute('disabled') || this._ancestorDisabled;
    if (next === this._effectiveDisabled) return;
    this._effectiveDisabled = next;
    if (this._initialized) this._applyDisabled();
  }

  /** @private */
  _applyDisabled() {
    const trigger = this._trigger();
    if (trigger) trigger.disabled = this._effectiveDisabled;
    if (this._effectiveDisabled && this._isOpen) this._close();
  }

  /** @private `aria-required` on the combobox + decorative asterisk in the label. */
  _applyRequired() {
    const trigger = this._trigger();
    const required = this.hasAttribute('required');
    if (trigger) {
      if (required) trigger.setAttribute('aria-required', 'true');
      else trigger.removeAttribute('aria-required');
    }
    const label = this.querySelector('.td-field__label');
    if (!label) return;
    let star = label.querySelector('.td-field__required');
    if (required && !star) {
      star = document.createElement('span');
      star.className = 'td-field__required';
      star.setAttribute('aria-hidden', 'true');
      star.textContent = ' *';
      label.appendChild(star);
    } else if (!required && star) star.remove();
  }

  /** @private naming precedence (TdFormElement helper): internal label → host aria-label → external <label for>. */
  _applyName() {
    this._applyAccessibleName(this._trigger(), !!this.getAttribute('label'));
  }

  // --- Form participation ---

  /** @private Push the current value + validity to the form. */
  _syncForm() {
    const s = this._state();
    if (!s.raw) {
      this._setFormValue(null);
      if (this.hasAttribute('required')) {
        this._setValidity({ valueMissing: true }, this._text(TdDatetimePicker.messages, 'required'), this._focusTarget());
      } else {
        this._setValidity({});
      }
      return;
    }
    // Never derive a formatted value from an unusable string: submit it raw (paired with badInput).
    this._setFormValue(s.usable ? this._formatForForm(s.parts) : s.raw, s.raw);
    if (s.error) this._setValidity({ [s.error.flag]: true }, s.error.message, this._focusTarget());
    else this._setValidity({});
  }

  _captureDefaults() {
    super._captureDefaults();
    /** @private null = no initial `value` attr; a string = explicit. */
    this._defaultValueAttr = this.getAttribute('value');
    /** @private the mode the default value was written for (reset converts it if `mode` changed since — review v0.18.0) */
    this._defaultMode = this._mode();
  }

  _restoreDefaults() {
    const v = this._defaultValueAttr;
    const from = this._defaultMode || this._mode();
    if (v == null || from === this._mode()) { this.setValue(v); return; }
    // `mode` changed after load: convert the original default into the current mode (same rules as a live mode change)
    const parts = parseModeValue(v, from);
    if (!parts || invalidReason(parts)) { this.setValue(v); return; }
    this.setValue(formatModeDisplay(this._clampToBounds(toModeParts(parts, from)), this._mode()));
  }

  _restoreState(state, _mode) {
    if (typeof state === 'string') this.setValue(state);
  }

  _focusTarget() {
    return this._trigger();
  }

  /** @private */
  _trigger() { return this.querySelector('.td-dtp__trigger'); }

  disconnectedCallback() {
    if (this._isOpen) this._close(); // never leave a dialog bound to a detached host (bug 1.8.8)
    super.disconnectedCallback();
  }

  // --- Dialog ---

  /** Open the picker dialog (no-op when disabled, detached or already open). */
  _open() {
    if (this._isOpen || this._effectiveDisabled || !this.isConnected) return;
    const trigger = this._trigger();
    if (!trigger) return;
    // The dialog restores focus to whatever was focused when it opened (a mouse click does not focus a button in
    // every engine) → make that the trigger.
    if (document.activeElement !== trigger) trigger.focus({ preventScroll: true });
    const L = TdDatetimePicker.labels;
    this._pending = this._initialPending();
    this._isOpen = true;
    const panel = this._buildPanel();
    this._panel = panel;
    this._modalId = TdModal.show({
      title: this._text(L, 'title'),
      body: panel,
      size: 'sm',
      escapeCloses: true, // D4: closing loses nothing (pending copy)
      focusTarget: panel.querySelector('.td-dtp-panel__input'),
      actions: [
        { label: L.close, variant: 'secondary', value: 'close' },
        { label: this._text(L, 'now'), variant: 'secondary', close: false, onClick: () => { this._setNow(); } },
        { label: L.confirm, variant: 'primary', value: 'confirm', onClick: () => this._confirm() },
      ],
      onShow: () => this._centreWheels(false),
      onClose: () => this._onDialogClosed(panel),
    });
    trigger.setAttribute('aria-expanded', 'true');
    trigger.setAttribute('aria-controls', this._modalId);
    const box = this.querySelector('.td-dtp');
    if (box) box.setAttribute('data-state', 'open');
    this._centreWheels(false);
  }

  /** Close the dialog, discarding the pending state. */
  _close() {
    if (!this._isOpen) return;
    const panel = this._panel;
    if (this._modalId) TdModal.closeById(this._modalId);
    this._onDialogClosed(panel); // idempotent (TdModal already called it)
  }

  /** @private every close path ends here (TdModal onClose) */
  _onDialogClosed(panel) {
    if (!this._isOpen || this._panel !== panel) return;
    this._scrollTimers.forEach((t) => window.clearTimeout(t));
    this._scrollTimers.clear();
    this._isOpen = false;
    this._modalId = null;
    this._pending = null;
    this._panel = null;
    const trigger = this._trigger();
    if (trigger) {
      trigger.setAttribute('aria-expanded', 'false');
      trigger.removeAttribute('aria-controls');
    }
    const box = this.querySelector('.td-dtp');
    if (box) box.setAttribute('data-state', 'closed');
  }

  /**
   * @private committed parts, else the `open-at` position; time clamped, minute snapped DOWN to the step (D7).
   * Components outside the mode hold their defaults.
   */
  _initialPending() {
    const s = this._state();
    const p = s.parts ? { ...s.parts } : this._openAtParts();
    p.hour = clamp(p.hour, 0, 23);
    p.minute = snapMinuteDown(clamp(p.minute, 0, 59), this._minuteStep());
    if (!s.parts) this._snapIntoBounds(p);
    return toModeParts(p, this._mode());
  }

  /**
   * @private The down-snap can land before `min` (min 10:07, step 5 → 10:05): move to the first step-aligned slot at
   * or after `min` (carrying into the next hour/day), unless that slot is past `max` — then keep the down-snap.
   * @param {import('../utils/datetime.js').DateTimeParts} p mutated in place
   */
  _snapIntoBounds(p) {
    const { min, max } = this._bounds();
    if (!min || compareParts(p, min) >= 0) return;
    const step = this._minuteStep();
    const d = new Date(2000, 0, 1);
    d.setFullYear(min.year, min.month - 1, min.day); // setFullYear: years 0–99 stay literal
    d.setHours(min.hour, min.minute + ((step - (min.minute % step)) % step), 0, 0);
    const up = partsFromDate(d);
    if (max && compareParts(up, max) > 0) return;
    Object.assign(p, up);
  }

  /**
   * @private Where an EMPTY picker opens: `open-at` today | min | max | a date (same formats as `min`) — explicit
   * always wins; without it (or naming a missing bound / an invalid date) → today (v0.19.0 G6). Clamped to min–max.
   * @returns {import('../utils/datetime.js').DateTimeParts}
   */
  _openAtParts() {
    const { min, max } = this._bounds();
    const at = (this.getAttribute('open-at') || '').trim();
    let p = null;
    if (at === 'today') p = partsFromDate(new Date());
    else if (at === 'min') p = min;
    else if (at === 'max') p = max;
    else if (at) p = parseBound(at, 'min');
    if (!p) p = partsFromDate(new Date());
    return this._clampToBounds(p);
  }

  /** @private build the dialog body with DOM APIs (no HTML string, no trusted hatch) */
  _buildPanel() {
    const L = TdDatetimePicker.labels;
    TdDatetimePicker._openSeq = (TdDatetimePicker._openSeq || 0) + 1;
    const prefix = `${this.id}-dtp${TdDatetimePicker._openSeq}`; // unique per open: a closing dialog may linger
    const years = this._yearRange();
    const make = (tag, cls, attrs = {}, text) => {
      const n = document.createElement(tag);
      if (cls) n.className = cls;
      for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
      if (text != null) n.textContent = String(text);
      return n;
    };

    const mode = this._mode();
    const shown = MODE_PARTS[mode];
    const panel = make('div', 'td-dtp-panel');
    panel.setAttribute('data-mode', mode);
    const dateGroup = make('fieldset', 'td-dtp-panel__group');
    dateGroup.appendChild(make('legend', 'td-dtp-panel__legend', {}, this._text(L, 'date')));
    const fields = make('div', 'td-dtp-panel__fields');
    const dateFields = [['day', 1, 31], ['month', 1, 12], ['year', years.min, years.max]].filter(([k]) => shown.includes(k));
    for (const [part, lo, hi] of dateFields) {
      const field = make('div', 'td-dtp-panel__field');
      const id = `${prefix}-${part}`;
      field.appendChild(make('label', 'td-dtp-panel__label', { for: id }, L[part]));
      const input = make('input', 'td-dtp-panel__input', {
        id, type: 'number', inputmode: 'numeric', min: String(lo), max: String(hi), autocomplete: 'off', 'data-part': part,
      });
      const v = this._pending[part];
      input.value = Number.isInteger(v) ? String(v) : '';
      field.appendChild(input);
      fields.appendChild(field);
    }
    dateGroup.appendChild(fields);
    panel.appendChild(dateGroup);

    if (mode === 'datetime') this._buildTimeGroup(make, prefix, panel, L);

    panel.appendChild(make('p', 'td-dtp-panel__preview'));
    const error = make('p', 'td-dtp-panel__error', { id: `${prefix}-error`, role: 'alert' });
    error.hidden = true;
    panel.appendChild(error);

    // Date fields: validate on input (no rewriting while typing), clamp on change (D9).
    panel.addEventListener('input', (e) => {
      const input = e.target;
      if (!(input instanceof HTMLInputElement) || !input.classList.contains('td-dtp-panel__input')) return;
      this._readField(input);
      this._refresh();
    });
    panel.addEventListener('change', (e) => {
      const input = e.target;
      if (!(input instanceof HTMLInputElement) || !input.classList.contains('td-dtp-panel__input')) return;
      const n = input.valueAsNumber;
      if (Number.isInteger(n)) input.value = String(clamp(n, Number(input.min), Number(input.max)));
      this._readField(input);
      this._refresh();
    });
    this._refresh(panel);
    return panel;
  }

  /** @private the hour / minute wheels (datetime mode only) */
  _buildTimeGroup(make, prefix, panel, L) {
    const timeGroup = make('div', 'td-dtp-panel__group', { role: 'group', 'aria-labelledby': `${prefix}-time` });
    timeGroup.appendChild(make('p', 'td-dtp-panel__legend', { id: `${prefix}-time` }, L.time));
    const wheels = make('div', 'td-dtp-panel__wheels');
    const step = this._minuteStep();
    const minutes = [];
    for (let m = 0; m < 60; m += step) minutes.push(m);
    wheels.appendChild(this._buildWheel(make, prefix, 'hour', Array.from({ length: 24 }, (_, i) => i), panel));
    wheels.appendChild(make('span', 'td-dtp-wheel__sep', { 'aria-hidden': 'true' }, ':'));
    wheels.appendChild(this._buildWheel(make, prefix, 'minute', minutes, panel));
    timeGroup.appendChild(wheels);
    panel.appendChild(timeGroup);
  }

  /** @private one listbox wheel (the ONE normative model: listbox = tab stop, options never focusable) */
  _buildWheel(make, prefix, part, values, panel) {
    const wrap = make('div', 'td-dtp-wheel');
    const list = make('div', 'td-dtp-wheel__list', {
      role: 'listbox', id: `${prefix}-${part}`, 'aria-label': TdDatetimePicker.labels[part], tabindex: '0', 'data-part': part,
    });
    const current = this._pending[part];
    for (const v of values) {
      const opt = make('div', 'td-dtp-wheel__option', {
        role: 'option', id: `${prefix}-${part}-${v}`, 'aria-selected': v === current ? 'true' : 'false', 'data-value': String(v),
      }, pad2(v));
      if (v === current) list.setAttribute('aria-activedescendant', opt.id);
      list.appendChild(opt);
    }
    wrap.appendChild(list);

    list.addEventListener('keydown', (e) => this._onWheelKey(e, list));
    list.addEventListener('click', (e) => {
      const opt = e.target instanceof Element ? e.target.closest('.td-dtp-wheel__option') : null;
      if (opt && list.contains(opt)) this._selectWheel(list, Number(opt.getAttribute('data-value')), true);
    });
    // Scrolling (wheel / touch fling, CSS scroll-snap) selects the option that settles in the band.
    const settle = () => {
      if (!this._isOpen || this._panel !== panel) return;
      const opt = this._optionAtCentre(list);
      if (opt && opt.getAttribute('aria-selected') !== 'true') this._selectWheel(list, Number(opt.getAttribute('data-value')), false);
    };
    if ('onscrollend' in window) {
      list.addEventListener('scrollend', settle);
    } else {
      let timer = 0;
      list.addEventListener('scroll', () => {
        window.clearTimeout(timer);
        this._scrollTimers.delete(timer);
        timer = window.setTimeout(() => { this._scrollTimers.delete(timer); settle(); }, SCROLL_SETTLE_MS);
        this._scrollTimers.add(timer);
      });
    }
    return wrap;
  }

  /** @private */
  _onWheelKey(e, list) {
    const opts = [...list.children];
    const cur = Math.max(0, opts.findIndex((o) => o.getAttribute('aria-selected') === 'true'));
    const page = list.getAttribute('data-part') === 'hour' ? 6 : Math.max(1, Math.round(15 / this._minuteStep()));
    let i;
    switch (e.key) {
      case 'ArrowUp': i = cur - 1; break;
      case 'ArrowDown': i = cur + 1; break;
      case 'PageUp': i = cur - page; break;
      case 'PageDown': i = cur + page; break;
      case 'Home': i = 0; break;
      case 'End': i = opts.length - 1; break;
      default: return;
    }
    e.preventDefault(); // no native scroll: the selection drives the scroll position
    const opt = opts[clamp(i, 0, opts.length - 1)];
    if (opt) this._selectWheel(list, Number(opt.getAttribute('data-value')), true);
  }

  /** @private selection follows the active option: aria-selected + aria-activedescendant + pending, together */
  _selectWheel(list, value, scroll, smooth = true) {
    const part = list.getAttribute('data-part');
    let target = null;
    for (const o of list.children) {
      const on = Number(o.getAttribute('data-value')) === value;
      o.setAttribute('aria-selected', on ? 'true' : 'false');
      if (on) target = o;
    }
    if (!target) return;
    list.setAttribute('aria-activedescendant', target.id);
    if (this._pending) this._pending[part] = value;
    if (scroll) this._centre(list, target, smooth);
    this._refresh();
  }

  /** @private scroll offset of an option inside its list (layout-based: unaffected by the dialog's open transform) */
  _optionTop(list, opt) {
    return opt.offsetTop - (opt.offsetParent === list ? 0 : list.offsetTop);
  }

  /** @private */
  _centre(list, opt, smooth) {
    const top = this._optionTop(list, opt) - (list.clientHeight - opt.offsetHeight) / 2;
    // Reduced motion: an instant jump (R11). CSS keeps `scroll-behavior: auto`, so 'auto' is instant.
    list.scrollTo({ top: Math.max(0, top), behavior: smooth && !prefersReducedMotion() ? 'smooth' : 'auto' });
  }

  /** @private */
  _centreWheels(smooth) {
    if (!this._panel) return;
    for (const list of this._panel.querySelectorAll('.td-dtp-wheel__list')) {
      const opt = list.querySelector('[aria-selected="true"]');
      if (opt) this._centre(list, opt, smooth);
    }
  }

  /** @private the option whose centre is nearest the list's centre */
  _optionAtCentre(list) {
    const mid = list.scrollTop + list.clientHeight / 2;
    let best = null;
    let dist = Infinity;
    for (const o of list.children) {
      const d = Math.abs(this._optionTop(list, o) + o.offsetHeight / 2 - mid);
      if (d < dist) { dist = d; best = o; }
    }
    return best;
  }

  /** @private */
  _readField(input) {
    if (!this._pending) return;
    const n = input.valueAsNumber; // finite integers (incl. negatives) are kept so range validation names the field
    this._pending[input.getAttribute('data-part')] = Number.isInteger(n) ? n : NaN;
  }

  /**
   * @private validate the pending state, sync field ARIA + the error line + the preview.
   * @returns {ReturnType<TdDatetimePicker['_check']>}
   */
  _refresh(panel = this._panel) {
    if (!panel || !this._pending) return null;
    const p = this._pending;
    const err = this._check(p);
    const error = panel.querySelector('.td-dtp-panel__error');
    for (const control of panel.querySelectorAll('.td-dtp-panel__input, .td-dtp-wheel__list')) {
      if (err && err.field === control.getAttribute('data-part')) control.setAttribute('aria-invalid', 'true');
      else control.removeAttribute('aria-invalid');
      // A hidden element still feeds aria-describedby → only reference the error while it shows.
      if (err) control.setAttribute('aria-describedby', error.id);
      else control.removeAttribute('aria-describedby');
    }
    if (err) {
      if (error.textContent !== err.message) error.textContent = err.message;
      error.hidden = false;
    } else {
      error.hidden = true;
      error.textContent = '';
    }
    const f = (n, w = 2) => (Number.isInteger(n) ? String(n).padStart(w, '0') : '-'.repeat(w));
    const preview = {
      datetime: () => `${f(p.day)}/${f(p.month)}/${f(p.year, 4)} - ${f(p.hour)}:${f(p.minute)}`,
      date: () => `${f(p.day)}/${f(p.month)}/${f(p.year, 4)}`,
      month: () => `${f(p.month)}/${f(p.year, 4)}`,
      year: () => f(p.year, 4),
    }[this._mode()];
    panel.querySelector('.td-dtp-panel__preview').textContent = preview();
    return err;
  }

  /** @private "Bây giờ": pending = now (minute snapped down) */
  _setNow() {
    const panel = this._panel;
    if (!panel) return;
    const now = partsFromDate(new Date());
    now.minute = snapMinuteDown(now.minute, this._minuteStep());
    Object.assign(this._pending, toModeParts(now, this._mode())); // components outside the mode keep their defaults
    for (const input of panel.querySelectorAll('.td-dtp-panel__input')) {
      input.value = String(now[input.getAttribute('data-part')]);
      this._readField(input);
    }
    for (const list of panel.querySelectorAll('.td-dtp-wheel__list')) {
      this._selectWheel(list, now[list.getAttribute('data-part')], true);
    }
    this._refresh();
  }

  /** @private "Chọn": commit the pending state (false keeps the dialog open) */
  _confirm() {
    const panel = this._panel;
    if (!panel || !this._pending) return false;
    const err = this._refresh();
    if (err) {
      const field = err.field && panel.querySelector(`[data-part="${err.field}"]`);
      if (field) field.focus();
      return false;
    }
    const mode = this._mode();
    const p = toModeParts(this._pending, mode);
    const value = formatModeDisplay(p, mode);
    this.setAttribute('value', value); // in place: the trigger (the dialog's opener) is never replaced (bug 1.8.1)
    this._updateValueText();
    this._syncForm();
    this.emit('change', { value, dbValue: formatModeDb(p, mode) });
    return true; // TdModal closes → focus returns to the trigger
  }

  // --- Public API ---

  /**
   * Display value of the mode (`dd/mm/yyyy - hh:mm` | `dd/mm/yyyy` | `mm/yyyy` | `yyyy`), or '' when empty /
   * malformed / impossible / out of min–max (D8).
   */
  getValue() {
    const s = this._state();
    return s.usable && !s.error ? formatModeDisplay(s.parts, this._mode()) : ''; // out of min/max is invalid too (D8)
  }

  /**
   * DB value of the mode (`yyyy-mm-dd hh:mm:00` | `yyyy-mm-dd` | `yyyy-mm` | `yyyy`), or '' when empty / malformed /
   * impossible / out of min–max (D8).
   */
  getDBValue() {
    const s = this._state();
    return s.usable && !s.error ? formatModeDb(s.parts, this._mode()) : '';
  }

  /**
   * Set the value from the mode's display format (or its ISO format); '' / null clears it; a malformed string is
   * kept and flagged.
   */
  setValue(displayValue) {
    if (displayValue == null || displayValue === '') this.removeAttribute('value');
    else this.setAttribute('value', String(displayValue));
    if (this._initialized) {
      this._updateValueText();
      this._syncForm();
    }
  }

  /**
   * Set the value from the mode's DB format (`yyyy-mm-dd hh:mm[:ss]` | `yyyy-mm-dd` | `yyyy-mm` | `yyyy`; the mode's
   * ISO is accepted too); '' / null / undefined clears it like `setValue(null)` (v0.19.0, no `change`); any other
   * malformed string is ignored.
   */
  setDBValue(dbValue) {
    if (dbValue == null || dbValue === '') { this.setValue(null); return; }
    const mode = this._mode();
    const p = parseModeDb(dbValue, mode);
    if (!p || invalidReason(p)) return;
    this.setValue(formatModeDisplay(p, mode));
  }
}

if (!customElements.get('td-datetime-picker')) {
  customElements.define('td-datetime-picker', TdDatetimePicker);
}
