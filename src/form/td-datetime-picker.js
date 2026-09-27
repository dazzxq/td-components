import { TdFormElement } from '../base/td-form-element.js';
import { TdModal } from '../feedback/td-modal.js';
import { fillIconSlots } from '../icons/td-icon.js';
import {
  parseDisplay, parseDb, parseIsoLocal, parseBound, invalidReason, compareParts,
  formatDisplay, formatDb, formatIsoLocal, normalizeMinuteStep, snapMinuteDown, partsFromDate,
} from '../utils/datetime.js';

const DEFAULT_MIN_YEAR = 2000; // dcms parity (D5): the range used when `min` / `max` are not set
const DEFAULT_MAX_YEAR = 2099;
const SCROLL_SETTLE_MS = 150; // fallback when `scrollend` is not supported
const PARTS = ['day', 'month', 'year', 'hour', 'minute'];

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
 * Panel (a Node body inside TdModal `escapeCloses: true`; `{p}` = `{host}-dtp`): `fieldset.td-dtp-panel__group`
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
 * **Form-associated:** submits ISO-local `YYYY-MM-DDTHH:mm:00` by default, `form-value-format="display"`
 * (dd/mm/yyyy - hh:mm) or `"db"` (yyyy-mm-dd hh:mm:ss). A malformed or impossible value (e.g. 31/02, 25:99, a year
 * outside the default 2000–2099) sets `badInput` and submits the raw string; `min` / `max` set `rangeUnderflow` /
 * `rangeOverflow`; `required` + empty → `valueMissing`. Error contract: `error-text`, `setError()`, `clearError()`.
 *
 * Ported from DCMS DateTimePicker.
 *
 * @element td-datetime-picker
 * @attr {string} value - Display format value (dd/mm/yyyy - hh:mm)
 * @attr {string} placeholder - Placeholder text (default: dd/mm/yyyy - hh:mm)
 * @attr {string} label - Visible label (names the combobox)
 * @attr {string} min - Earliest allowed value: dd/mm/yyyy[ - hh:mm] or yyyy-mm-dd[Thh:mm]; a date-only min means 00:00
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
      'min', 'max', 'error-text', 'aria-label'];
  }

  static get booleanAttributes() { return [...super.booleanAttributes]; }

  static get errorContract() { return true; }

  /** Default UI strings (Vietnamese); override per site: `TdDatetimePicker.labels.confirm = 'OK'`. */
  static labels = {
    title: 'Chọn ngày giờ', placeholder: 'dd/mm/yyyy - hh:mm', date: 'Ngày', day: 'Ngày', month: 'Tháng', year: 'Năm',
    time: 'Giờ', hour: 'Giờ', minute: 'Phút', close: 'Đóng', now: 'Bây giờ', confirm: 'Chọn',
  };

  /** Validation messages (`{min}` / `{max}` are filled in); override per site like `labels`. */
  static messages = {
    required: 'Vui lòng chọn ngày giờ',
    format: 'Định dạng ngày giờ không hợp lệ',
    incomplete: 'Vui lòng nhập đầy đủ ngày, tháng, năm',
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

  /** @private `{ min, max }` parsed bounds (date-only expanded, D5); null = not set / invalid */
  _bounds() {
    return { min: parseBound(this.getAttribute('min'), 'min'), max: parseBound(this.getAttribute('max'), 'max') };
  }

  /** @private year range for the year field and the default-range check */
  _yearRange() {
    const { min, max } = this._bounds();
    return { min: min ? min.year : DEFAULT_MIN_YEAR, max: max ? max.year : DEFAULT_MAX_YEAR };
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
    const { min, max } = this._bounds();
    const years = this._yearRange();
    const reason = invalidReason(p);
    if (reason) {
      const field = reason === 'incomplete' ? PARTS.find((k) => !Number.isInteger(p && p[k])) || null
        : reason === 'date' ? 'day' : reason;
      return { flag: 'badInput', message: reason === 'year' ? fill(M.year, years) : M[reason], field };
    }
    if ((!min && p.year < DEFAULT_MIN_YEAR) || (!max && p.year > DEFAULT_MAX_YEAR)) {
      return { flag: 'badInput', message: fill(M.year, years), field: 'year' };
    }
    if (min && compareParts(p, min) < 0) return { flag: 'rangeUnderflow', message: fill(M.min, { min: formatDisplay(min) }), field: null };
    if (max && compareParts(p, max) > 0) return { flag: 'rangeOverflow', message: fill(M.max, { max: formatDisplay(max) }), field: null };
    return null;
  }

  /** @private current committed state */
  _state() {
    const raw = this.getAttribute('value') || '';
    if (!raw) return { raw, parts: null, error: null, usable: false };
    const parts = parseDisplay(raw);
    const error = parts ? this._check(parts) : { flag: 'badInput', message: TdDatetimePicker.messages.format, field: null };
    // A range violation is still a real value (like a native input); malformed / impossible values are not (D8).
    return { raw, parts, error, usable: !!parts && !(error && error.flag === 'badInput') };
  }

  /** @private submitted string for usable parts, per `form-value-format` */
  _formatForForm(p) {
    switch (this.getAttribute('form-value-format')) {
      case 'display': return formatDisplay(p);
      case 'db': return formatDb(p);
      default: return formatIsoLocal(p);
    }
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
    if (!s.raw) return { text: this.getAttribute('placeholder') || TdDatetimePicker.labels.placeholder, placeholder: true };
    return { text: s.usable ? formatDisplay(s.parts) : s.raw, placeholder: false };
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
        return;
      case 'minute-step': // read on the next open
      case 'name':
        return;
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
        const hadFocus = this.contains(document.activeElement);
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
        this._setValidity({ valueMissing: true }, TdDatetimePicker.messages.required, this._focusTarget());
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
  }

  _restoreDefaults() {
    this.setValue(this._defaultValueAttr);
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
      title: L.title,
      body: panel,
      size: 'sm',
      escapeCloses: true, // D4: closing loses nothing (pending copy)
      focusTarget: panel.querySelector('.td-dtp-panel__input'),
      actions: [
        { label: L.close, variant: 'secondary', value: 'close' },
        { label: L.now, variant: 'secondary', close: false, onClick: () => { this._setNow(); } },
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

  /** @private committed parts (or now), time clamped, minute snapped DOWN to the step (D7) */
  _initialPending() {
    const s = this._state();
    const p = s.parts ? { ...s.parts } : partsFromDate(new Date());
    p.hour = clamp(p.hour, 0, 23);
    p.minute = snapMinuteDown(clamp(p.minute, 0, 59), this._minuteStep());
    return p;
  }

  /** @private build the dialog body with DOM APIs (no HTML string, no trusted hatch) */
  _buildPanel() {
    const L = TdDatetimePicker.labels;
    const prefix = `${this.id}-dtp`;
    const years = this._yearRange();
    const make = (tag, cls, attrs = {}, text) => {
      const n = document.createElement(tag);
      if (cls) n.className = cls;
      for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
      if (text != null) n.textContent = String(text);
      return n;
    };

    const panel = make('div', 'td-dtp-panel');
    const dateGroup = make('fieldset', 'td-dtp-panel__group');
    dateGroup.appendChild(make('legend', 'td-dtp-panel__legend', {}, L.date));
    const fields = make('div', 'td-dtp-panel__fields');
    for (const [part, lo, hi] of [['day', 1, 31], ['month', 1, 12], ['year', years.min, years.max]]) {
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
      const n = /^\d+$/.test(input.value) ? parseInt(input.value, 10) : NaN;
      if (Number.isInteger(n)) input.value = String(clamp(n, Number(input.min), Number(input.max)));
      this._readField(input);
      this._refresh();
    });
    this._refresh(panel);
    return panel;
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
    const v = input.value;
    this._pending[input.getAttribute('data-part')] = /^\d+$/.test(v) ? parseInt(v, 10) : NaN;
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
    panel.querySelector('.td-dtp-panel__preview').textContent = `${f(p.day)}/${f(p.month)}/${f(p.year, 4)} - ${f(p.hour)}:${f(p.minute)}`;
    return err;
  }

  /** @private "Bây giờ": pending = now (minute snapped down) */
  _setNow() {
    const panel = this._panel;
    if (!panel) return;
    const now = partsFromDate(new Date());
    now.minute = snapMinuteDown(now.minute, this._minuteStep());
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
    const p = { ...this._pending };
    const value = formatDisplay(p);
    this.setAttribute('value', value); // in place: the trigger (the dialog's opener) is never replaced (bug 1.8.1)
    this._updateValueText();
    this._syncForm();
    this.emit('change', { value, dbValue: formatDb(p) });
    return true; // TdModal closes → focus returns to the trigger
  }

  // --- Public API ---

  /** Display value `dd/mm/yyyy - hh:mm`, or '' when empty / malformed / impossible (D8). */
  getValue() {
    const s = this._state();
    return s.usable ? formatDisplay(s.parts) : '';
  }

  /** DB value `yyyy-mm-dd hh:mm:00`, or '' when empty / malformed / impossible (D8). */
  getDBValue() {
    const s = this._state();
    return s.usable ? formatDb(s.parts) : '';
  }

  /** Set the value from the display format ('' / null clears it; a malformed string is kept and flagged). */
  setValue(displayValue) {
    if (displayValue == null || displayValue === '') this.removeAttribute('value');
    else this.setAttribute('value', String(displayValue));
    if (this._initialized) {
      this._updateValueText();
      this._syncForm();
    }
  }

  /** Set the value from the DB format `yyyy-mm-dd hh:mm[:ss]` (ISO-local also accepted); anything else is ignored. */
  setDBValue(dbValue) {
    const p = parseDb(dbValue) || parseIsoLocal(dbValue);
    if (!p || invalidReason(p)) return;
    this.setValue(formatDisplay(p));
  }
}

if (!customElements.get('td-datetime-picker')) {
  customElements.define('td-datetime-picker', TdDatetimePicker);
}
