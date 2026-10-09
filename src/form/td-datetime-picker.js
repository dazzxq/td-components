import { TdFormElement, ssrContentNodes, ssrSameAttrs, ssrSamePart, ssrIsErrorNote } from '../base/td-form-element.js';
import { ssrMarker } from '../base/td-base-element.js';
import { ValueTitleWatcher, displayedValueText } from '../utils/value-title.js';
import { TdModal } from '../feedback/td-modal.js';
import { fillIconSlots } from '../icons/td-icon.js';
import { placeFloating, viewportBox, isReferenceHidden, watchReference } from '../utils/floating.js';
import { LAYERS, register as registerLayer, bridgeTheme, focusablesIn } from '../utils/layers.js';
import { matchesBelow, matches, MQ_COARSE } from '../utils/breakpoints-internal.js';
import { clampDate, isDateOutOfRange, monthOutOfRange, yearOutOfRange } from '../utils/calendar-model.js';
import { CalendarGrid } from './calendar-grid.js';
import { TimeStep } from './time-step.js';
import { freshCalendarLabels, normalizeCalendarLabels } from './calendar-labels.js';
import {
  parseBound, invalidReason, normalizeMinuteStep, snapMinuteDown, partsFromDate, compareParts,
  normalizeMode, toModeParts, parseModeValue, parseModeDb, formatModeDisplay, formatModeDb, formatModeIso,
  compareModeParts, MODE_PARTS, toNativeValue, fromNativeValue, parseTypedValue,
} from '../utils/datetime.js';

// v0.60.0 (plan v0.60.0-calendar-picker B1 / B6): the implicit 2000–2099 year window is GONE from validation — without
// `min` / `max` every representable date (years 1–9999) is valid. These two numbers only survive as the implicit native
// min / max php/td.php v0.56–v0.59 printed (SSR contract `datetime-picker@1`): the hydration gate must still recognise that
// markup during a rolling upgrade. Remove them together with the @1 branch of _nativeTemplate().
const SSR1_MIN_YEAR = 2000;
const SSR1_MAX_YEAR = 2099;
/** SSR contracts this element adopts in place: @1 (php ≤ 0.59) and @2 (php ≥ 0.60). */
const SSR_SCHEMAS = [1, 2];
const MODE_SUFFIX = { datetime: '', date: 'Date', month: 'Month', year: 'Year' };
/** Every form-associated element (v0.56.0 SSR gate: exactly the native input + the trigger). */
const FORM_ASSOCIATED = 'input, textarea, select, button, fieldset, output, object';

/** popover geometry (plan v0.60.0 A5): the margin to the viewport, and the scroll-region height under which the popover clamps instead */
const POP_MARGIN = 8;
const POP_MIN_SCROLL = 220;
const fill = (template, vars) => String(template).replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : ''));
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/**
 * Date-time picker: a field-look trigger that opens a calendar. Token-native since 0.10.0 (plan v0.10.0-batch4 item 1):
 * styles come from td.css (`components/datetime-picker.css`: `.td-dtp` + `.td-dtp-wheel`; `components/calendar.css`:
 * `.td-dtp-pop`, `.td-cal`); state lives in `aria-*`, `[hidden]`, `data-state`, `data-placeholder` — no Tailwind, no adopted
 * stylesheet, no inline style markup.
 *
 * Rendered DOM (the trigger is updated IN PLACE by value / placeholder / error / disabled / required / min / max /
 * minute-step / form-value-format changes; only `label` re-renders):
 *   <td-datetime-picker id="{host}">
 *     <div class="td-dtp" data-state="closed|open">
 *       [<label class="td-field__label" id="{host}-label" for="{host}-trigger">{label}[<span class="td-field__required"> *</span>]</label>]
 *       <button type="button" class="td-dtp__trigger" id="{host}-trigger" role="combobox" aria-haspopup="dialog"
 *               aria-expanded [aria-controls="{dialog id}" while open] [aria-required] [aria-invalid] …>
 *         <span class="td-dtp__value" [data-placeholder]>{dd/mm/yyyy - hh:mm | raw | placeholder}</span>
 *         <span class="td-dtp__icon" data-td-icon="calendar" aria-hidden="true"></span>
 *       </button>
 *     </div>
 *     [<span class="td-field-error" id="{host}-error" data-for="{host}">…</span>]
 *   </td-datetime-picker>
 *
 * **Calendar (v0.60.0, plan v0.60.0-calendar-picker, ADR 0032):** one Monday-first month grid (src/form/calendar-grid.js)
 * with ‹ › (±1 month) and separate month / year header buttons that open a 12-month grid and a paged 12-year grid.
 * ≥ 720 px an anchored popover (`div.td-dtp-pop[role=dialog]` on <body>, the kit's floating layer — not inert, outside
 * pointer closes it); below 720 px the bottom sheet (TdModal, the backdrop never closes it). Same tree in both.
 * `date`: a day commits at once (ONE `change`), closes, focus back on the trigger; "Hôm nay" the same. `month` / `year`:
 * opens on the months / years grid, a pick commits. `datetime`: a day changes the draft, the hour / minute wheels
 * (src/form/time-wheels.js, `minute-step`) too, "Chọn" commits ("Bây giờ" only moves the draft); a draft outside
 * min / max is refused. Choosing a month / year in the date grid is only navigation (no `change`). Esc / X discard.
 *
 * Keyboard: on the trigger Enter, Space (the button's own click) and ArrowDown open it; a click on the trigger while it is
 * open closes it. In the day grid (APG date picker dialog): arrows ±1 day / ±1 week, Home / End Monday / Sunday, PageUp /
 * PageDown ±1 month, Shift+PageUp / PageDown ±1 year, Enter / Space pick; one tab stop; the month / year are announced
 * through a polite live region. The clear button (`clearable`) stays usable while the popover is open: it drops the draft,
 * clears the value (one `change`) and closes. No presets. Typing: only with `editable` (below).
 *
 * **Typed dates — `editable` (v0.63.0, plan v0.63.0-typed-dates):** opt-in; without the attribute nothing above changes. The
 * field becomes a text input (APG "date picker combobox") + an icon button that opens the same calendar:
 *   <div class="td-dtp td-dtp--editable" data-state>
 *     [<label class="td-field__label" id="{host}-label" for="{host}-input">…</label>]
 *     <input type="text" class="td-dtp__input" id="{host}-input" role="combobox" aria-haspopup="dialog" aria-expanded
 *            aria-autocomplete="none" autocomplete="off" spellcheck="false" placeholder [readonly inputmode="none" on touch] …>
 *     <button type="button" class="td-dtp__trigger td-dtp__trigger--icon" id="{host}-trigger" aria-label="{openCalendar}"
 *             aria-haspopup="dialog" aria-expanded><span class="td-dtp__icon" data-td-icon="calendar" aria-hidden="true"></span></button>
 *     [button.td-dtp__clear]
 *   </div>
 * The input has no `name` (the host submits, as before) and its own `input` / `change` never leave it (stopped at the input:
 * the only public `change` is the element's, with `detail`). Typed text is read leniently (parseTypedValue: `15031994`,
 * `15/3/1994`, ISO… — never a 2-digit year) when it is COMMITTED: Enter (no preventDefault — an implicit submit sees the new
 * value), blur, before the calendar opens; unchanged text commits nothing. Every write (typed, calendar, clear button) goes
 * through `_write()`. Commit table (plan D): empty → cleared (one `change` when there was a value; `required` → the
 * "Vui lòng chọn…" typed error, no `change`); valid inside min–max → the display format + ONE `change` when the value differs;
 * outside min–max → written, range error, no `change` (never clamped); unreadable / impossible → the raw text (badInput), the
 * error, no `change`. The typed error (`_typedError`) shows through the error contract — a site error (`error-text` /
 * setError()) wins — with `aria-invalid` on the input; it goes on a valid / empty commit, a calendar write, the clear button,
 * setValue() / setDBValue() / an outside `value` change, reset, or `editable` going off. Escape (calendar closed) puts the
 * committed text back. ArrowDown / Alt+ArrowDown and the icon button commit, then open; the calendar opens at the committed
 * value; closing it puts the focus back on the INPUT; a click into the input while the popover is open closes it (no
 * `change`). The popover anchors to the whole box. Touch-first devices (`MQ_COARSE`, followed live) get a `readonly`
 * `inputmode="none"` input: a tap opens the calendar as before — no on-screen keyboard over the sheet.
 *
 * **Modes (v0.18.0):** `mode="datetime"` (default, above) | `date` (day/month/year fields only) | `month` (month + year)
 * | `year` (year only). Each mode has its own display / DB / ISO format (table in docs/components/datetime-picker.md);
 * components outside the mode do not exist in the value. `open-at` (today | min | max | a date) positions an EMPTY
 * picker when it opens; without it the picker opens at today, clamped to min–max (v0.19.0 — the 0.18.0 "min before
 * 2000 → min" rule is gone; set `open-at="min"` to open at the start of the range).
 *
 * **Form-associated:** submits ISO-local `YYYY-MM-DDTHH:mm:00` by default, `form-value-format="display"`
 * (dd/mm/yyyy - hh:mm) or `"db"` (yyyy-mm-dd hh:mm:ss) — other modes: `YYYY-MM-DD` | `YYYY-MM` | `YYYY` (iso = db).
 * A malformed or impossible value (e.g. 31/02, 25:99, year 0000) sets `badInput` and submits the raw string; `min` / `max`
 * set `rangeUnderflow` / `rangeOverflow`; `required` + empty → `valueMissing`. Without `min` / `max` every representable
 * date is valid: years 1–9999 (v0.60.0 — the implicit 2000–2099 window of v0.10–v0.59 is gone).
 * Error contract: `error-text`, `setError()`, `clearError()`.
 *
 * **SSR (v0.56.0, plan v0.56.0-repeater-icons-date D4–D7; contracts `datetime-picker@1` AND `datetime-picker@2`, v0.60.0
 * plan v0.60.0-calendar-picker B6):** php td_datetime_picker() / td_date() print the host + `div.td-dtp` > [label
 * for={id}-native] + `input.td-dtp__native` (type date | datetime-local: the no-JS field, styled like the trigger before
 * define) + the trigger. The two contracts differ ONLY in the native input's implicit domain when the site sets no bound:
 * @1 (php ≤ 0.59) `min` 2000-01-01 + `max` 2099-12-31; @2 (php ≥ 0.60) no implicit `min`, `max` 9999-12-31 unless the site
 * sets one. The schema of the marker selects the expected native input — each contract adopts its own markup only.
 * The element adopts EXACTLY that markup in place
 * (its own gate — the shared TdFormElement one allows a single control): state = early property > the LIVE native value
 * > attribute, the host's FormData first, then the native input loses its form attributes and goes, its focus moves to
 * the trigger, the label points at the trigger. Anything else → safe render + the live value of the one native candidate.
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
 * @attr {boolean} editable - v0.63.0: the value can be typed (desktop; touch keeps tap-to-open) — see "Typed dates" above
 * @fires change - When a value is WRITTEN by the user (detail: { value, dbValue }; ONE event per write): date / month / year —
 *   activating a day / month / year cell or "Hôm nay" / "Tháng này" / "Năm nay" (the same value again closes without one);
 *   datetime — "Chọn"; the clear button (`clearable`, also while the popover is open) — { value: '', dbValue: '' };
 *   `editable`: a committed typed value that is valid and differs (or an emptied field that had a value).
 *   Esc, an outside click, the trigger toggle, setValue() / setDBValue() and reset never fire it.
 */
export class TdDatetimePicker extends TdFormElement {
  static get observedAttributes() {
    return [...super.observedAttributes, 'value', 'placeholder', 'label', 'minute-step', 'form-value-format',
      'min', 'max', 'error-text', 'aria-label', 'mode', 'open-at', 'clearable', 'editable'];
  }

  static get booleanAttributes() { return [...super.booleanAttributes, 'clearable', 'editable']; }

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
    // v0.59.0 `clearable`: the name of the clear button (per mode, like the others)
    clear: 'Xoá ngày', clearDate: 'Xoá ngày', clearMonth: 'Xoá tháng', clearYear: 'Xoá năm',
    // v0.63.0 `editable`: the name of the icon button that opens the calendar (per mode)
    openCalendar: 'Mở lịch', openCalendarDate: 'Chọn ngày', openCalendarMonth: 'Chọn tháng', openCalendarYear: 'Chọn năm',
    // v0.60.0 calendar (plan v0.60.0-calendar-picker E1): the calendar keys come from src/form/calendar-labels.js (fresh weekday arrays)
    ...freshCalendarLabels(),
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
    incomplete: 'Vui lòng nhập đầy đủ ngày và giờ', // v0.63.0: datetime (a typed date without the time); date has its own key
    incompleteDate: 'Vui lòng nhập đầy đủ ngày, tháng, năm',
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
    /** @private the open dialog element (`.td-dtp-pop`: the popover itself, or the body of the sheet); null when closed */
    this._pop = null;
    /** @private true while the dialog is the bottom sheet (TdModal), decided when it opened */
    this._sheet = false;
    /** @private the open calendar (src/form/calendar-grid.js) / the datetime wheels (time-wheels.js); null when closed */
    this._cal = null;
    /** @private datetime: the TIME screen (src/form/time-step.js — the only owner of the wheels); null when closed */
    this._timeStep = null;
    /** @private datetime: 'date' | 'time' — the screen showing (v0.61.0: the dialog is two screens); 'date' otherwise */
    this._step = 'date';
    /** @private the action buttons { today, now, confirm } (popover row OR the sheet footer nodes) and the footer nodes for TdModal */
    this._btn = null;
    this._footerNodes = null;
    this._status = null;
    /** @private datetime: the draft { date, hour, minute }, committed by "Chọn" only; null when closed */
    this._draft = null;
    /** @private v0.63.0 `editable`: the error of the last typed commit (shown after a site error); null = none */
    this._typedError = null;
    /** @private v0.63.0: the committed value came from typing (its error follows min / max / required / mode changes) */
    this._typedOrigin = false;
    /** @private v0.63.0: the text the element last put into the input (a commit of the same text is a no-op) */
    this._inputText = '';
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

  /**
   * @private year range of the year field + the `{min}` / `{max}` of `messages.year`: the bound's year, else the limit of
   * the parts helpers (1 / 9999). v0.60.0: no implicit 2000–2099 default any more.
   */
  _yearRange() {
    const { min, max } = this._bounds();
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
    if (this._editable()) return this._renderEditable();
    const esc = (s) => this.escapeHtml(String(s));
    const id = esc(this.id);
    const label = this.getAttribute('label') || '';
    const { text, placeholder } = this._triggerText();
    const clearable = this.hasAttribute('clearable');
    return `<div class="td-dtp${clearable ? ' td-dtp--clearable' : ''}" data-state="${this._isOpen ? 'open' : 'closed'}">`
      + (label ? `<label class="td-field__label" id="${id}-label" for="${id}-trigger">${esc(label)}</label>` : '')
      + `<button type="button" class="td-dtp__trigger" id="${id}-trigger" role="combobox" aria-haspopup="dialog"`
      + ` aria-expanded="${this._isOpen}"${this._effectiveDisabled ? ' disabled' : ''}>`
      + `<span class="td-dtp__value"${placeholder ? ' data-placeholder' : ''}>${esc(text)}</span>`
      + '<span class="td-dtp__icon" data-td-icon="calendar" aria-hidden="true"></span>'
      + '</button>'
      + (clearable ? `<button type="button" class="td-dtp__clear" aria-label="${esc(this._text(TdDatetimePicker.labels, 'clear'))}"`
        + `${this._clearHidden() ? ' hidden' : ''}><span class="td-dtp__clear-icon" data-td-icon="close" data-td-icon-size="s"`
        + ' aria-hidden="true"></span></button>' : '')
      + '</div>';
  }

  /**
   * @private v0.63.0 `editable` (plan B): the text input (the combobox) + the icon button that opens the calendar + the clear
   * button (as 0.62). The input's text = the committed value (the raw string when unusable), '' when empty (placeholder).
   */
  _renderEditable() {
    const esc = (s) => this.escapeHtml(String(s));
    const id = esc(this.id);
    const label = this.getAttribute('label') || '';
    const clearable = this.hasAttribute('clearable');
    const L = TdDatetimePicker.labels;
    const off = this._effectiveDisabled ? ' disabled' : '';
    const touch = this._coarse() ? ' readonly inputmode="none"' : '';
    return `<div class="td-dtp td-dtp--editable${clearable ? ' td-dtp--clearable' : ''}" data-state="${this._isOpen ? 'open' : 'closed'}">`
      + (label ? `<label class="td-field__label" id="${id}-label" for="${id}-input">${esc(label)}</label>` : '')
      + `<input type="text" class="td-dtp__input" id="${id}-input" role="combobox" aria-haspopup="dialog" aria-expanded="${this._isOpen}"`
      + ` aria-autocomplete="none" autocomplete="off" spellcheck="false" placeholder="${esc(this._placeholderText())}"`
      + ` value="${esc(this._fieldText())}"${touch}${off}>`
      + `<button type="button" class="td-dtp__trigger td-dtp__trigger--icon" id="${id}-trigger" aria-label="${esc(this._text(L, 'openCalendar'))}"`
      + ` aria-haspopup="dialog" aria-expanded="${this._isOpen}"${off}>`
      + '<span class="td-dtp__icon" data-td-icon="calendar" aria-hidden="true"></span></button>'
      + (clearable ? `<button type="button" class="td-dtp__clear" aria-label="${esc(this._text(L, 'clear'))}"`
        + `${this._clearHidden() ? ' hidden' : ''}><span class="td-dtp__clear-icon" data-td-icon="close" data-td-icon-size="s"`
        + ' aria-hidden="true"></span></button>' : '')
      + '</div>';
  }

  /** @private v0.63.0 */
  _editable() { return this.hasAttribute('editable'); }

  /** @private v0.63.0: the typing input (only rendered with `editable`) */
  _input() { return this.querySelector('.td-dtp__input'); }

  /** @private v0.63.0: where the focus goes back to (a commit, Esc, the clear button): the input when editable, else the trigger */
  _home() { return this._input() || this._trigger(); }

  /** @private v0.63.0: what the popover anchors to — the whole box when editable (input + button), else the trigger */
  _anchor() { return this._input() ? this.querySelector('.td-dtp') : this._trigger(); }

  /** @private v0.63.0 plan E: a touch-first device (hover: none + pointer: coarse) — the input is read-only there */
  _coarse() { return matches(MQ_COARSE); }

  /** @private the placeholder text (attribute, else the mode's pattern) */
  _placeholderText() {
    return this.getAttribute('placeholder') || this._text(TdDatetimePicker.labels, 'placeholder');
  }

  /** @private v0.63.0: the input's text for the committed value ('' when empty; the raw string when unusable) */
  _fieldText() {
    const s = this._state();
    if (!s.raw) return '';
    return s.usable ? formatModeDisplay(s.parts, this._mode()) : s.raw;
  }

  /**
   * @private v0.63.0: the input in place — text (the program wins, also while focused: plan D), placeholder, touch mode.
   */
  _syncInput() {
    const input = this._input();
    if (!input) return;
    const text = this._fieldText();
    if (input.value !== text) input.value = text;
    this._inputText = text;
    const ph = this._placeholderText();
    if (input.getAttribute('placeholder') !== ph) input.setAttribute('placeholder', ph);
  }

  /**
   * @private v0.63.0 plan E: follow `(hover: none) and (pointer: coarse)` live (a hybrid device). Touch → `readonly` +
   * `inputmode="none"` (a tap opens the calendar, no on-screen keyboard); a pointer → typing. Pending text is committed first.
   */
  _applyTouchMode() {
    const input = this._input();
    if (!input) return;
    const touch = this._coarse();
    if (touch === input.readOnly) return;
    if (touch) {
      this._commitTyped();
      input.readOnly = true;
      input.setAttribute('inputmode', 'none');
    } else {
      input.readOnly = false;
      input.removeAttribute('inputmode');
    }
  }

  /** @private v0.63.0: one `matchMedia(MQ_COARSE)` change listener per connection (released on disconnect) */
  _watchTouch() {
    if (this._touchWatch || typeof window.matchMedia !== 'function') return;
    let mql = null;
    try { mql = window.matchMedia(MQ_COARSE); } catch { return; }
    if (!mql || typeof mql.addEventListener !== 'function') return;
    const onChange = () => this._applyTouchMode();
    mql.addEventListener('change', onChange);
    this._touchWatch = () => mql.removeEventListener('change', onChange);
    this._cleanups.push(() => {
      if (this._touchWatch) this._touchWatch();
      this._touchWatch = null;
    });
  }

  /**
   * @private v0.63.0 plan B / D2 / E / F: the input's listeners. Its native `input` / `change` are stopped AT the input (they
   * would bubble through the host as detail-less events); Enter / blur commit; Escape puts the committed text back;
   * ArrowDown / Alt+ArrowDown open the calendar; a click opens it on touch, and closes an open popover otherwise.
   */
  _bindInput(input) {
    const stop = (e) => e.stopPropagation();
    this.listen(input, 'input', stop);
    this.listen(input, 'change', stop);
    this.listen(input, 'blur', () => {
      if (input === this._input()) this._commitTyped();
    });
    this.listen(input, 'pointerdown', () => {
      // the popover is open and the user clicks back into the field: close it (draft dropped, no change); the focus
      // lands in the input by itself. (The sheet makes the page inert — no click reaches the input.)
      if (this._isOpen && !this._sheet) this._closeDialog({ focus: false });
    });
    this.listen(input, 'click', () => {
      if (input.readOnly && !this._isOpen) this._open(); // touch: a tap opens the calendar as before
    });
    this.listen(input, 'keydown', (e) => {
      if (e.isComposing || e.keyCode === 229) return; // IME composition
      if (e.key === 'Enter') {
        this._commitTyped(); // no preventDefault: an implicit form submission follows and sees the new value
      } else if (e.key === 'Escape') {
        if (!this._isOpen && input.value !== this._inputText) {
          input.value = this._inputText; // back to the committed text; nothing committed, no event
          e.preventDefault();
        }
      } else if (e.key === 'ArrowDown' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        e.preventDefault();
        if (this._isOpen) { if (this._cal) this._cal.focusActive(); } else this._open();
      }
    });
  }

  /**
   * @private v0.63.0 plan D: commit the input's text (Enter / blur / before the calendar opens). Unchanged text → nothing.
   * The table: empty → cleared (`change` when there was a value; `required` → the required typed error, no `change`);
   * valid inside min–max → the display format, ONE `change` when it differs; outside min–max → written, range error, no
   * `change`; unreadable / impossible → the raw text (badInput), the error, no `change`. Everything goes through `_write()`.
   */
  _commitTyped() {
    const input = this._input();
    if (!input || !input.isConnected || input.readOnly || this._effectiveDisabled) return;
    const text = input.value;
    if (text === this._inputText) return;
    const mode = this._mode();
    const prev = this._state();
    const t = text.trim();
    // `change` only once the element's COMPLETE validity is clean (a site's setCustomValidity too — Codex impl r1 #1)
    const typed = { typedError: this._typedErrorFor(t), typed: true };
    if (!t) {
      this._write(null, { ...typed, change: prev.raw && !typed.typedError ? { value: '', dbValue: '' } : null });
      return;
    }
    const parts = parseTypedValue(t, mode);
    if (!parts || invalidReason(parts)) {
      this._write(t, typed); // the raw text (badInput)
      return;
    }
    const p = toModeParts(parts, mode);
    const value = formatModeDisplay(p, mode);
    if (typed.typedError) {
      this._write(value, typed); // outside min / max: written, never clamped
      return;
    }
    const same = prev.usable && !prev.error && formatModeDisplay(prev.parts, mode) === value;
    this._write(value, { ...typed, change: same ? null : { value, dbValue: formatModeDb(p, mode) } });
  }

  /**
   * @private v0.63.0 D3: the typed error of a committed text (`raw`) under the CURRENT mode / bounds / required — the same
   * table for a commit and for a re-check after `min` / `max` / `required` / `mode` changed. null = nothing wrong.
   * @param {string} raw
   */
  _typedErrorFor(raw) {
    const M = TdDatetimePicker.messages;
    const mode = this._mode();
    const t = raw.trim();
    if (!t) return this.hasAttribute('required') ? this._text(M, 'required') : null;
    const parts = parseTypedValue(t, mode);
    if (!parts) return this._text(M, 'format');
    const err = this._check(invalidReason(parts) ? parts : toModeParts(parts, mode));
    return err ? err.message : null;
  }

  /**
   * @private v0.63.0 (Codex impl r1 #5): a validation-driving attribute changed (min / max / required / mode) — the typed
   * error is recomputed from the committed value (another message, or gone when nothing is wrong now). Before _syncForm().
   */
  _recheckTypedError() {
    if (!this._typedOrigin || !this._editable()) return;
    const next = this._typedErrorFor(this.getAttribute('value') || '');
    if (next === this._typedError) return;
    this._typedError = next;
    this._applyErrorState();
  }

  /**
   * @private v0.63.0 (plan Rủi ro): the ONE write of a user value — a calendar pick / "Chọn" (`_commit`), the typed text
   * (`_commitTyped`), the clear button (`_clearByUser`): the attribute, the field text, the form value + validity, the typed
   * error, then at most ONE `change` (callers move the focus after it).
   * @param {string|null} value the new `value` attribute (null removes it)
   * @param {{ change?: {value: string, dbValue: string}|null, typedError?: string|null, typed?: boolean }} [o]
   *   `typed` (typed commits): the value is typed (its error is re-judged later); the `change` waits for the element's
   *   complete validity (a site's setCustomValidity included). Otherwise the typed state goes.
   */
  _write(value, { change = null, typedError = null, typed = false } = {}) {
    this._writing = true;
    try {
      if (value) this.setAttribute('value', value); // in place: the trigger (the dialog's opener) is never replaced (bug 1.8.1)
      else this.removeAttribute('value');
    } finally {
      this._writing = false;
    }
    const hadTyped = this._typedError != null;
    this._typedError = typedError;
    this._typedOrigin = typed;
    this._updateValueText();
    this._syncForm();
    if (hadTyped || typedError != null) this._applyErrorState();
    if (change && (!typed || this.validity.valid)) this.emit('change', change);
  }

  /** @private v0.63.0 D3: the typed error goes (an outside value change, setValue, reset, `editable` off) */
  _dropTypedError() {
    this._typedOrigin = false;
    this._hideTypedError();
  }

  /** @private v0.63.0: nothing is wrong now — the message goes, the value stays typed (a later min / max change re-judges it) */
  _hideTypedError() {
    if (this._typedError == null) return;
    this._typedError = null;
    this._applyErrorState();
  }

  /** v0.63.0 D3: the site's error (`setError()` / `error-text`) first, else the error of the last typed commit. */
  get errorMessage() {
    return super.errorMessage || (this._typedError != null && this._editable() ? this._typedError : '');
  }

  /**
   * @private v0.59.0 (plan v0.59.0-dsuite-small QĐ E1b): the clear button shows while there is a value (a malformed one
   * too — clearing it is the fix) and the field is neither required nor disabled (`<fieldset disabled>` included).
   */
  _clearHidden() {
    return !this.getAttribute('value') || this.hasAttribute('required') || !!this._effectiveDisabled;
  }

  /** @private the clear button follows value / required / disabled IN PLACE (no re-render) */
  _syncClear() {
    const b = this.querySelector('.td-dtp__clear');
    if (!b) return;
    const hide = this._clearHidden();
    if (hide && !this._clearing && b === this.ownerDocument.activeElement) this._home()?.focus({ preventScroll: true });
    b.hidden = hide;
  }

  /** @private v0.59.0 the user cleared the value: like "Chọn" with nothing — one `change`, the focus on the trigger */
  _clearByUser() {
    if (this._clearHidden()) { // nothing to clear (or not clearable now): an open dialog just closes (v0.60.0 C4), no change
      if (this._isOpen) this._closeDialog({ focus: true });
      return;
    }
    this._clearing = true; // the focus moves AFTER the change event (below)
    // v0.60.0 (plan C4): the button stays clickable while the popover is open — the draft is dropped and the dialog closes
    // WITHOUT a focus move (same end state as clearing while closed: one change, then the focus on the trigger)
    if (this._isOpen) this._closeDialog({ focus: false });
    try {
      this._write(null); // v0.63.0: the one write path (a typed error goes too)
      this._applyErrorState();
    } finally {
      this._clearing = false;
    }
    // `change` first: trackFormDirty re-takes its baseline on a focusin before the user's first change — a focus move
    // ahead of the event would make the clear look like no change at all
    this.emit('change', { value: '', dbValue: '' });
    this._home()?.focus({ preventScroll: true }); // v0.63.0: the input when editable
    this._syncClear();
  }

  afterRender() {
    fillIconSlots(this);
    const trigger = this._trigger();
    const input = this._input();
    if (input) { // v0.63.0 `editable`
      this._bindInput(input);
      this._watchTouch();
      this._applyTouchMode();
      this._inputText = input.value;
    }
    if (trigger) {
      // Enter / Space are the button's own click; v0.60.0: a click while the dialog is open closes it (toggle, no change)
      this.listen(trigger, 'click', () => this._open());
      this.listen(trigger, 'keydown', (e) => {
        // APG combobox with a dialog popup: ArrowDown opens it (or moves into it); no page scroll
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          if (this._isOpen) { if (this._cal) this._cal.focusActive(); } else this._open();
        }
      });
    }
    const clear = this.querySelector('.td-dtp__clear');
    if (clear) this.listen(clear, 'click', () => this._clearByUser());
    this._syncClear();
    this._applyName();
    this._applyRequired();
    this._syncForm();
    this._applyErrorState();
    this._watchValueTitle();
  }

  /**
   * @private v0.34.0 (plan QĐ 11): the value span gets `title` = the full formatted value while its text is cut (…).
   * One ResizeObserver on the span (re-checks on resize, no polling), released on disconnect by the cleanups.
   */
  _watchValueTitle() {
    const el = this.querySelector('.td-dtp__value');
    if (!this._vt) {
      this._vt = new ValueTitleWatcher((node) => this._valueTitleText(node));
      this._cleanups.push(() => {
        if (this._vt) this._vt.destroy();
        this._vt = null;
      });
    }
    this._vt.watch(el);
  }

  /** @private value text changed: re-check next frame (src/utils/value-title.js) */
  _scheduleValueTitle() {
    if (this._vt) this._vt.schedule();
  }

  /** @private title only for a cut NON-placeholder value; removed when it fits / placeholder / empty */
  _syncValueTitle() {
    if (this._vt) this._vt.sync();
  }

  /** @private the displayed value text (placeholder → '') */
  _valueTitleText(el) {
    return displayedValueText(el);
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
    if (this._input()) { // v0.63.0 `editable`: the input shows the value
      this._syncInput();
      this._syncClear();
      return;
    }
    const span = this.querySelector('.td-dtp__value');
    if (!span) return;
    const { text, placeholder } = this._triggerText();
    span.textContent = text;
    if (placeholder) span.setAttribute('data-placeholder', '');
    else span.removeAttribute('data-placeholder');
    this._scheduleValueTitle();
    this._syncClear();
  }

  /** In place: everything except `label` (structure). */
  attributeChangedCallback(name, oldVal, newVal) {
    if (this._helperAttr(name, oldVal, newVal)) return; // v0.54.0: helper-text in place (TdFormElement)
    if (oldVal === newVal) return;
    if (name === 'disabled') this._effectiveDisabled = newVal !== null || this._ancestorDisabled;
    if (!this._initialized) return;
    switch (name) {
      case 'value':
        if (!this._writing) this._dropTypedError(); // v0.63.0 D3: a value from outside replaces what was typed
        this._updateValueText();
        this._syncForm();
        return;
      case 'placeholder':
        this._updateValueText();
        return;
      case 'form-value-format':
      case 'min':
      case 'max':
        if (name !== 'form-value-format') this._recheckTypedError(); // v0.63.0 (Codex impl r1 #5)
        this._updateValueText();
        this._syncForm();
        if (this._isOpen) this._applyBoundsToDialog(); // open dialog: the cells re-evaluate in place, the draft is re-checked
        return;
      case 'minute-step': // read on the next open
      case 'open-at':
      case 'name':
        return;
      case 'mode': { // other fields / formats: close an open dialog, convert the value, redraw the trigger
        const active = document.activeElement;
        const hadFocus = this.contains(active) || !!(this._pop && this._pop.contains(active));
        if (this._isOpen) this._close();
        this._convertValueMode(normalizeMode(oldVal));
        this._recheckTypedError(); // v0.63.0: a raw value kept verbatim is judged by the new mode
        this._updateValueText();
        this._syncForm();
        const clear = this.querySelector('.td-dtp__clear'); // v0.59.0: its name follows the mode
        if (clear) clear.setAttribute('aria-label', this._text(TdDatetimePicker.labels, 'clear'));
        if (this._input()) this._trigger()?.setAttribute('aria-label', this._text(TdDatetimePicker.labels, 'openCalendar'));
        if (hadFocus && this._home()) this._home().focus();
        return;
      }
      case 'disabled':
        this._applyDisabled();
        return;
      case 'required':
        this._applyRequired();
        this._recheckTypedError(); // v0.63.0
        this._syncForm();
        this._syncClear();
        return;
      case 'aria-label':
        this._applyName();
        return;
      case 'error-text':
        super.attributeChangedCallback(name, oldVal, newVal); // base error contract, no re-render
        return;
      default: { // label; v0.63.0 `editable` (another field: the calendar closes, uncommitted text and the typed error go)
        const active = document.activeElement;
        const hadFocus = this.contains(active) || !!(this._pop && this._pop.contains(active));
        if (this._isOpen) this._close();
        if (name === 'editable') { this._typedError = null; this._typedOrigin = false; }
        this._doRender();
        if (hadFocus && this._home()) this._home().focus();
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
    const input = this._input();
    if (input) input.disabled = this._effectiveDisabled; // v0.63.0
    if (this._effectiveDisabled && this._isOpen) this._close();
    this._syncClear();
  }

  /** @private `aria-required` on the combobox (v0.63.0 `editable`: the input) + decorative asterisk in the label. */
  _applyRequired() {
    const trigger = this._focusTarget();
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
    this._applyAccessibleName(this._focusTarget(), !!this.getAttribute('label')); // the combobox: v0.63.0 `editable` → the input
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
        this._hideTypedError(); // v0.63.0: nothing is wrong any more (e.g. `required` went) — a stale typed error goes
      }
      return;
    }
    // Never derive a formatted value from an unusable string: submit it raw (paired with badInput).
    this._setFormValue(s.usable ? this._formatForForm(s.parts) : s.raw, s.raw);
    // v0.63.0: the typed error is the more precise message of the same failure (31021994 → "Ngày không hợp lệ")
    if (s.error) this._setValidity({ [s.error.flag]: true }, this._typedError ?? s.error.message, this._focusTarget());
    else {
      this._setValidity({});
      this._hideTypedError();
    }
  }

  _captureDefaults() {
    super._captureDefaults();
    const d = this._ssrDefault;
    this._ssrDefault = null;
    /** @private null = no initial `value` attr; a string = explicit (v0.56.0: the SERVER value of SSR markup). */
    this._defaultValueAttr = d ? d.value : this.getAttribute('value');
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
    return this._input() || this._trigger(); // v0.63.0 `editable`: the input (label click, validity bubble, aria-invalid)
  }

  // --- SSR (contracts datetime-picker@1 + @2; v0.56.0 D5, v0.60.0 B6) ---

  /**
   * Marker `datetime-picker@1` or `@2` + EXACTLY the skeleton php td_datetime_picker() prints FOR THAT SCHEMA → adopt in
   * place; anything else (another schema number, markup of the other schema) → safe render now + the live native value
   * (only from exactly one native candidate) + the focus on the trigger. The schema is read BEFORE the marker is
   * consumed and handed to the gate (it selects the expected native input — _nativeTemplate()).
   * @returns {boolean}
   */
  canHydrate() {
    const m = ssrMarker(this);
    if (!m || m.name !== 'datetime-picker') return false;
    this.removeAttribute('data-td-ssr'); // consumed (not `hydratable`: a re-connect renders again)
    this._ssrDefault = { value: this.getAttribute('value') };
    const schema = m.schema;
    const gate = SSR_SCHEMAS.includes(schema) ? this._ssrGate(schema) : null;
    if (gate) {
      this._ssrAdopt = gate;
      return true;
    }
    const mode = this._mode();
    let live;
    const c = this.querySelectorAll('input');
    if (!(this._earlyProps && this._earlyProps.has('value')) && c.length === 1 && (mode === 'date' || mode === 'datetime')) {
      const v = c[0].value;
      if (v === '') live = '';
      else {
        const p = fromNativeValue(v, mode);
        if (p) live = formatModeDisplay(p, mode);
      }
    }
    const active = this.ownerDocument.activeElement;
    this._ssrRestore = { live, refocus: !!active && active !== this && this.contains(active) };
    this._ssrFreshRender = true;
    return false;
  }

  hydrateExisting() {
    const g = this._ssrAdopt;
    this._ssrAdopt = null;
    if (!g) return;
    const mode = this._mode();
    const server = fromNativeValue(g.input.getAttribute('value'), mode);
    this._ssrDefault = { value: server ? formatModeDisplay(server, mode) : null }; // form reset → the server value
    const hadFocus = this.ownerDocument.activeElement === g.input;
    // (1) state: early property > the LIVE native value (dirty, typed before define) > attribute
    if (!(this._earlyProps && this._earlyProps.has('value'))) {
      const v = g.input.value;
      if (v === '') this.removeAttribute('value');
      else {
        const p = fromNativeValue(v, mode);
        if (p) this.setAttribute('value', formatModeDisplay(p, mode)); // a value the parts helpers cannot read (a 5-digit year) → the attribute stays
      }
    }
    if (g.label) g.label.setAttribute('for', `${this.id}-trigger`);
    this._errorNote = g.note;
    // (2) the host's FormData FIRST…
    this._updateValueText();
    this._syncForm();
    // (3) …then the no-JS input loses every form attribute and goes (FormData holds ONE entry)
    for (const a of ['name', 'value', 'required', 'min', 'max', 'step']) g.input.removeAttribute(a);
    g.input.remove();
    // (4) the native input had the focus → the trigger
    if (hadFocus) g.trigger.focus({ preventScroll: true });
  }

  /** @protected refused markup was replaced: the live native value (when unambiguous) + the focus */
  _restoreSsrState(s) {
    if (s.live !== undefined) {
      if (s.live === '') this.removeAttribute('value');
      else this.setAttribute('value', s.live);
      this._updateValueText();
      this._syncForm();
    }
    if (s.refocus) this._home()?.focus({ preventScroll: true });
  }

  /**
   * @private The strict gate. Returns the parts to adopt, or null.
   * @param {number} schema the marker's schema (1 | 2) — REQUIRED: it decides the native input the markup must carry
   * @returns {{ input: HTMLInputElement, trigger: HTMLElement, label: HTMLElement|null, note: HTMLElement|null }|null}
   */
  _ssrGate(schema) {
    if (!SSR_SCHEMAS.includes(schema)) return null;
    const mode = this._mode();
    if (mode !== 'date' && mode !== 'datetime') return null;
    const nodes = this._ssrWithoutHelperNote(ssrContentNodes(this)); // v0.54.0: minus the PHP helper note
    if (!nodes || !nodes.length || nodes.some((n) => n.nodeType !== 1) || nodes.length > 2) return null;
    const [box, note = null] = nodes;
    const msg = this.errorMessage;
    if (note) {
      if (!msg || !ssrIsErrorNote(note) || note.id !== `${this.id}-error` || note.getAttribute('data-for') !== this.id
        || note.textContent !== msg) return null;
    } else if (msg) return null;
    const tpl = document.createElement('template');
    tpl.innerHTML = this.render();
    const wantBox = tpl.content.firstElementChild;
    if (!wantBox || box.localName !== 'div' || box.namespaceURI !== wantBox.namespaceURI || !ssrSameAttrs(box, wantBox)) return null;
    const have = ssrContentNodes(box);
    const want = [...wantBox.children];
    if (have.some((n) => n.nodeType !== 1) || have.length !== want.length + 1) return null;
    const required = this.hasAttribute('required');
    // v0.59.0 `clearable`: the clear button closes the box (its `hidden` follows the LIVE value — synced after adoption)
    const clearable = this.hasAttribute('clearable');
    let clear = null;
    if (clearable) {
      clear = /** @type {HTMLElement} */ (have.pop());
      const wc = want.pop();
      if (!this._ssrClearOk(clear, wc)) return null;
    }
    let label = null;
    if (want.length === 2) {
      // php points the label at the native input (no JS) and prints the required star (JS adds it after render)
      const wl = want[0];
      wl.setAttribute('for', `${this.id}-native`);
      if (required) {
        const star = document.createElement('span');
        star.className = 'td-field__required';
        star.setAttribute('aria-hidden', 'true');
        star.textContent = ' *';
        wl.appendChild(star);
      }
      if (!ssrSamePart(have[0], wl)) return null;
      label = /** @type {HTMLElement} */ (have[0]);
    }
    const input = /** @type {HTMLInputElement} */ (have[have.length - 2]);
    const trigger = /** @type {HTMLElement} */ (have[have.length - 1]);
    const wt = want[want.length - 1];
    if (required) wt.setAttribute('aria-required', 'true');
    if (!this._ssrTriggerOk(trigger, wt) || !this._ssrNativeOk(input, mode, schema)) return null;
    const controls = [...this.querySelectorAll(FORM_ASSOCIATED)];
    const wantControls = clear ? [input, trigger, clear] : [input, trigger];
    if (controls.length !== wantControls.length || controls.some((c, i) => c !== wantControls[i])) return null;
    return { input, trigger, label, note: /** @type {HTMLElement|null} */ (note) };
  }

  /** @private v0.59.0 the clear button = render()'s (attributes except `hidden`; one EMPTY icon slot) */
  _ssrClearOk(live, want) {
    if (!want || live.localName !== 'button' || want.localName !== 'button') return false;
    const strip = (el) => { const c = el.cloneNode(true); c.removeAttribute('hidden'); return c; };
    if (!ssrSameAttrs(strip(live), strip(want))) return false;
    const kids = ssrContentNodes(live);
    return kids.length === 1 && kids[0].nodeType === 1 && ssrSameAttrs(kids[0], want.children[0])
      && kids[0].localName === 'span' && ssrContentNodes(kids[0]).length === 0;
  }

  /** @private the trigger = render()'s attributes (+ aria-required); value span (class + data-placeholder, text only) + the empty icon slot */
  _ssrTriggerOk(live, want) {
    if (live.localName !== 'button' || !ssrSameAttrs(live, want)) return false;
    const kids = ssrContentNodes(live);
    if (kids.length !== 2 || kids.some((n) => n.nodeType !== 1)) return false;
    const [value, icon] = kids;
    if (value.localName !== 'span' || value.className !== 'td-dtp__value' || value.children.length
      || ![...value.attributes].every((a) => a.name === 'class' || (a.name === 'data-placeholder' && a.value === ''))) return false;
    // the icon slot must be EMPTY (ssrSamePart would skip its content; fillIconSlots draws it after adoption)
    return ssrSameAttrs(icon, want.children[1]) && icon.localName === 'span' && ssrContentNodes(icon).length === 0;
  }

  /**
   * @private the no-JS input = php's exactly FOR THIS SCHEMA (its `value` may be any valid native value of the mode)
   * @param {Element} live @param {'date'|'datetime'} mode @param {number} schema 1 | 2 (required)
   */
  _ssrNativeOk(live, mode, schema) {
    const want = this._nativeTemplate(mode, schema);
    if (!want) return false;
    if (live.localName !== 'input' || live.namespaceURI !== want.namespaceURI || live.childNodes.length) return false;
    const attrs = [...live.attributes].filter((a) => a.name !== 'value');
    if (attrs.length !== want.attributes.length) return false;
    if (!attrs.every((a) => want.hasAttribute(a.name) && (a.name === 'class'
      ? [...live.classList].sort().join(' ') === [...want.classList].sort().join(' ') : a.value === want.getAttribute(a.name)))) return false;
    const v = live.getAttribute('value');
    return v == null || v === '' || !!fromNativeValue(v, mode);
  }

  /**
   * @private the expected no-JS input (php td_datetime_picker), without `value`, for one SSR schema (v0.60.0 B6):
   *   @1 (php ≤ 0.59): without min / max the implicit domain 2000-01-01 … 2099-12-31 (D3b); with a bound only the bounds;
   *   @2 (php ≥ 0.60): no implicit `min`; `max` = the site's, else 9999-12-31[T23:59] — the limit of what the parts
   *       helpers represent (a native date input without `max` takes a 6-digit year in Chromium).
   * The implicit values exist on the native input only, never on the host. An unknown schema → null (never adopted).
   * @param {'date'|'datetime'} mode @param {number} schema 1 | 2 (required — no default: a caller that forgets it adopts nothing)
   * @returns {HTMLInputElement|null}
   */
  _nativeTemplate(mode, schema) {
    if (!SSR_SCHEMAS.includes(schema)) return null;
    const id = this.id;
    const input = document.createElement('input');
    input.className = 'td-dtp__native';
    input.setAttribute('type', mode === 'datetime' ? 'datetime-local' : 'date');
    input.setAttribute('id', `${id}-native`);
    const name = this.getAttribute('name');
    if (name) input.setAttribute('name', name);
    const { min, max } = this._bounds();
    if (schema === 1) {
      if (!min && !max) {
        input.setAttribute('min', mode === 'datetime' ? `${SSR1_MIN_YEAR}-01-01T00:00` : `${SSR1_MIN_YEAR}-01-01`);
        input.setAttribute('max', mode === 'datetime' ? `${SSR1_MAX_YEAR}-12-31T23:59` : `${SSR1_MAX_YEAR}-12-31`);
      } else {
        if (min) input.setAttribute('min', toNativeValue(min, mode));
        if (max) input.setAttribute('max', toNativeValue(max, mode));
      }
    } else {
      if (min) input.setAttribute('min', toNativeValue(min, mode));
      input.setAttribute('max', max ? toNativeValue(max, mode) : (mode === 'datetime' ? '9999-12-31T23:59' : '9999-12-31'));
    }
    if (mode === 'datetime' && this.getAttribute('minute-step') != null) input.setAttribute('step', String(this._minuteStep() * 60));
    if (this.hasAttribute('required')) input.setAttribute('required', '');
    if (this.hasAttribute('disabled')) input.setAttribute('disabled', '');
    const aria = this.getAttribute('aria-label');
    if (!this.getAttribute('label') && aria) input.setAttribute('aria-label', aria);
    if (this.errorMessage) {
      input.setAttribute('aria-invalid', 'true');
      input.setAttribute('aria-describedby', `${id}-error`);
    } else if (this.helperMessage) input.setAttribute('aria-describedby', `${id}-note`);
    return input;
  }

  /** @private */
  _trigger() { return this.querySelector('.td-dtp__trigger'); }

  disconnectedCallback() {
    if (this._isOpen) this._close(); // never leave a dialog bound to a detached host (bug 1.8.8)
    super.disconnectedCallback();
  }

  // --- Dialog (v0.60.0: the calendar; plan v0.60.0-calendar-picker A5, C2–C4, D) ---

  /**
   * Open the calendar dialog (no-op when disabled or detached); a second call while it is open closes it (the trigger toggles:
   * the draft is dropped, no `change`). ≥ 720 px a popover on <body>, below the bottom sheet (TdModal) — decided at open.
   */
  _open() {
    if (this._isOpen) {
      this._closeDialog({ focus: true });
      return;
    }
    if (this._effectiveDisabled || !this.isConnected) return;
    const trigger = this._trigger();
    if (!trigger) return;
    const input = this._input();
    if (input) { // v0.63.0 plan F: typed text is committed BEFORE the calendar opens (it opens at that value)
      this._commitTyped();
      if (this._effectiveDisabled || !this.isConnected || this._trigger() !== trigger) return; // a `change` listener changed it
    }
    // The dialog restores focus to whatever was focused when it opened (a mouse click does not focus a button in
    // every engine) → make that the trigger (v0.63.0 `editable`: the input — closing returns there).
    const home = this._home();
    if (document.activeElement !== home) home.focus({ preventScroll: true });
    const L = TdDatetimePicker.labels;
    const mode = this._mode();
    const sheet = matchesBelow('md');
    this._isOpen = true;
    this._sheet = sheet;
    const pop = this._buildPop(sheet);
    this._pop = pop;
    if (sheet) {
      this._modalId = TdModal.show({
        themeRoot: this, // v0.42.0 (ADR 0020): the dialog follows the host's theme scope
        title: this._text(L, 'title'),
        body: pop,
        size: 'sm',
        escapeCloses: true, // closing loses nothing (the draft is a copy)
        focusTarget: pop.querySelector('.td-cal [tabindex="0"]'),
        // v0.61.0: the actions are the TdModal FOOTER (not scrolled, never over the content): hand-built nodes carrying `data-action`
        // (today | now | confirm); the popover keeps its own row. A date / month / year pick still commits by itself.
        footer: this._footerNodes,
        onClose: () => this._onDialogClosed(pop),
      });
      trigger.setAttribute('aria-controls', this._modalId);
      if (input) input.setAttribute('aria-controls', this._modalId);
      const modalRoot = document.getElementById(this._modalId);
      if (modalRoot) modalRoot.addEventListener('keydown', (e) => this._onDialogKey(e)); // the footer is outside .td-time-step
    } else {
      pop.addEventListener('keydown', (e) => this._onDialogKey(e));
      document.body.appendChild(pop);
      this._unbridge = bridgeTheme(pop, this);
      trigger.setAttribute('aria-controls', pop.id);
      if (input) input.setAttribute('aria-controls', pop.id);
      this._placePop();
      pop.setAttribute('data-state', 'open');
      this._layer = registerLayer({
        layer: LAYERS.popover,
        element: pop,
        keyboard: 'boundary',
        onEscape: () => { this._closeDialog({ focus: true }); return true; },
        onTab: (e) => this._onPopTab(e),
        anchor: this,
        onCovered: () => this._closeDialog({ focus: false }), // a newer modal / lightbox covers it: no focus into the inert page
      });
      this._onDocDown = (e) => {
        const t = /** @type {Node} */ (e.target);
        if (this._pop && !this._pop.contains(t) && !this.contains(t)) this._closeDialog({ focus: false });
      };
      this._onReposition = (e) => {
        // a scroll INSIDE the popover (its region, the wheels) cannot move the trigger: re-placing resets the region's
        // max-height, which clamps its scrollTop and pulls the cell the keyboard just revealed out of view (v0.62.1)
        if (e && e.type === 'scroll' && e.target instanceof Node && this._pop && this._pop.contains(e.target)) return;
        if (this._posRaf) return;
        this._posRaf = requestAnimationFrame(() => { this._posRaf = 0; this._updatePop(); });
      };
      document.addEventListener('pointerdown', this._onDocDown, true);
      window.addEventListener('resize', this._onReposition);
      window.addEventListener('scroll', this._onReposition, true);
      this._unwatchRef = watchReference(this._anchor(), () => this._updatePop());
    }
    trigger.setAttribute('aria-expanded', 'true');
    if (input) input.setAttribute('aria-expanded', 'true');
    const box = this.querySelector('.td-dtp');
    if (box) box.setAttribute('data-state', 'open');
    if (!sheet) this._cal.focusActive();
    void mode;
  }

  /**
   * Close the dialog, discarding the draft. `focus`: put the focus back on the trigger (Esc, a commit, a toggle) — not for a
   * click elsewhere or a covering layer.
   * @private
   * @param {{ focus?: boolean }} [o]
   */
  _closeDialog({ focus = false } = {}) {
    if (!this._isOpen) return;
    const pop = this._pop;
    if (this._sheet) {
      if (this._modalId) TdModal.closeById(this._modalId); // TdModal restores the focus to the opener itself
      this._onDialogClosed(pop);
    } else {
      this._onDialogClosed(pop);
    }
    const home = this._home(); // v0.63.0 `editable`: back to the input (plan F)
    if (focus && home && !home.disabled && this.isConnected) home.focus({ preventScroll: true });
  }

  /** Close the dialog without moving the focus (attribute changes, disconnect). */
  _close() { this._closeDialog({ focus: false }); }

  /** @private every close path ends here (TdModal onClose, popover teardown): idempotent state reset */
  _onDialogClosed(pop) {
    if (!this._isOpen || this._pop !== pop) return;
    if (this._timeStep) this._timeStep.destroy();
    if (this._cal) this._cal.destroy();
    this._timeStep = null;
    this._btn = null;
    this._footerNodes = null;
    this._status = null;
    this._step = 'date';
    this._cal = null;
    this._draft = null;
    this._isOpen = false;
    this._modalId = null;
    this._pop = null;
    this._popScroll = null;
    this._inset = null;
    if (this._layer) { this._layer.release(); this._layer = null; }
    if (this._unbridge) { this._unbridge(); this._unbridge = null; }
    if (this._unwatchRef) { this._unwatchRef(); this._unwatchRef = null; }
    if (this._posRaf) { cancelAnimationFrame(this._posRaf); this._posRaf = 0; }
    if (this._onDocDown) {
      document.removeEventListener('pointerdown', this._onDocDown, true);
      window.removeEventListener('resize', this._onReposition);
      window.removeEventListener('scroll', this._onReposition, true);
      this._onDocDown = null;
      this._onReposition = null;
    }
    if (!this._sheet && pop) pop.remove();
    for (const el of [this._trigger(), this._input()]) { // v0.63.0: the input is the combobox too
      if (!el) continue;
      el.setAttribute('aria-expanded', 'false');
      el.removeAttribute('aria-controls');
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
    const p = s.usable ? { ...s.parts } : this._openAtParts();
    p.hour = clamp(p.hour, 0, 23);
    p.minute = snapMinuteDown(clamp(p.minute, 0, 59), this._minuteStep());
    if (!s.usable && this._mode() === 'datetime') this._snapIntoBounds(p); // only datetime has a minute wheel
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

  /** @private the label table with the calendar keys validated (a site may override them; a bad shape → the defaults, once) */
  _calLabels() {
    return normalizeCalendarLabels(TdDatetimePicker.labels, (k) => {
      if (this._warnedLabels) return;
      this._warnedLabels = true;
      console.warn(`td-datetime-picker: labels.${k} must be an array of 7 strings — the defaults are used.`);
    });
  }

  /** @private build the dialog tree (DOM API: labels are text) — the same for the popover and the sheet */
  _buildPop(sheet) {
    const L = this._calLabels();
    const mode = this._mode();
    TdDatetimePicker._openSeq = (TdDatetimePicker._openSeq || 0) + 1;
    const prefix = `${this.id}-dtp${TdDatetimePicker._openSeq}`; // unique per open: a closing dialog may linger
    const { min, max } = this._bounds();
    const pend = this._initialPending();
    const s = this._state();
    const date = { year: pend.year, month: pend.month, day: pend.day };
    const today = partsFromDate(new Date());
    const committed = s.usable ? date : null;
    const selected = committed || (mode === 'datetime' ? date : null);
    const make = (tag, cls, attrs = {}, text) => {
      const n = document.createElement(tag);
      if (cls) n.className = cls;
      for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
      if (text != null) n.textContent = String(text);
      return n;
    };

    const pop = make('div', sheet ? 'td-dtp-pop td-dtp-pop--sheet' : 'td-dtp-pop td-glass-surface td-glass-surface--strong', {
      id: `${prefix}-pop`, 'data-mode': mode,
    });
    if (!sheet) {
      pop.setAttribute('role', 'dialog');
      pop.setAttribute('aria-label', this._text(L, 'title'));
      pop.setAttribute('tabindex', '-1');
      pop.setAttribute('data-state', 'closed');
    }
    const scroll = make('div', 'td-dtp-pop__scroll');
    this._popScroll = scroll;
    this._draft = { date: selected ? { ...selected } : { ...date }, hour: pend.hour, minute: pend.minute };

    this._cal = new CalendarGrid({
      prefix,
      labels: L,
      root: { datetime: 'days', date: 'days', month: 'months', year: 'years' }[mode],
      focus: clampDate(date, min, max),
      selected,
      min,
      max,
      today,
      onCommit: (level, d) => this._onPick(level, d),
      onView: () => { if (!this._sheet) this._placePop(); },
    });
    scroll.appendChild(this._cal.el);

    let err = null;
    this._step = 'date';
    pop.setAttribute('data-step', 'date');
    if (mode === 'datetime') {
      this._timeStep = new TimeStep({
        prefix, labels: L, minuteStep: this._minuteStep(),
        onBack: () => this._goDate(),
        onChange: (t) => { this._draft.hour = t.hour; this._draft.minute = t.minute; this._refreshDraft(); },
      });
      scroll.appendChild(this._timeStep.el);
      err = make('p', 'td-dtp-pop__error', { id: `${prefix}-error`, role: 'alert' });
      err.hidden = true;
      scroll.appendChild(err);
      this._status = make('p', 'td-sr-only td-dtp-pop__status', { role: 'status' });
      pop.appendChild(this._status);
    }
    pop.appendChild(scroll);

    // actions: date / month / year → "Hôm nay" / "Tháng này" / "Năm nay"; datetime → date screen "Hôm nay"; time screen "Bây giờ" + "Chọn".
    // Same `data-action` nodes in the popover row and in the sheet footer (TdModal `footer`, hand-built: no `actions` metadata needed).
    const button = (variant, action, label, onClick) => {
      const b = make('button', sheet ? `td-btn td-btn--${variant}` : `td-btn td-btn--${variant} td-btn--sm`, { type: 'button', 'data-action': action });
      b.appendChild(make('span', 'td-btn__label', {}, label));
      b.addEventListener('click', onClick);
      return b;
    };
    const btns = {};
    if (mode === 'datetime') {
      btns.today = button('secondary', 'today', this._text(L, 'now') === L.now ? L.nowDate : this._text(L, 'now'), () => this._pickToday());
      btns.now = button('secondary', 'now', this._text(L, 'now'), () => this._setNow());
      btns.confirm = button('primary', 'confirm', L.confirm, () => this._confirm());
      if (isDateOutOfRange(today, min, max)) btns.today.setAttribute('aria-disabled', 'true');
    } else {
      btns.today = button('secondary', 'today', this._text(L, 'now'), () => this._pickToday());
      const out = mode === 'date' ? isDateOutOfRange(today, min, max)
        : mode === 'month' ? monthOutOfRange(today.year, today.month, min, max) : yearOutOfRange(today.year, min, max);
      if (out) btns.today.setAttribute('aria-disabled', 'true');
    }
    this._btn = btns;
    this._footerNodes = Object.values(btns);
    if (!sheet) {
      const actions = make('div', 'td-dtp-pop__actions');
      for (const b of this._footerNodes) actions.appendChild(b);
      pop.appendChild(actions);
    }
    this._syncActions();
    this._popErr = err;
    if (mode === 'datetime') this._refreshDraft();
    return pop;
  }

  /** @private a pick at the root view of the mode (the grid reports it; every other pick only changed the view) */
  _onPick(level, d) {
    const mode = this._mode();
    if (mode === 'datetime') { // v0.61.0: a day does NOT commit — it opens the time screen
      this._draft.date = { year: d.year, month: d.month, day: d.day };
      this._goTime('hour');
      return;
    }
    this._commit({ year: d.year, month: d.month, day: d.day, hour: 0, minute: 0 });
    void level;
  }

  /**
   * @private "Hôm nay" / "Tháng này" / "Năm nay": commit the current day / month / year (disabled outside min–max). datetime
   * (v0.61.0): the date screen's "Hôm nay" picks today and goes to the TIME screen (like activating that day) — no commit.
   */
  _pickToday() {
    const btn = this._btn && this._btn.today;
    if (!btn || btn.getAttribute('aria-disabled') === 'true') return;
    const t = partsFromDate(new Date());
    if (this._mode() === 'datetime') {
      this._draft.date = { year: t.year, month: t.month, day: t.day };
      this._cal.setSelected(this._draft.date, { reveal: true });
      this._goTime('hour');
      return;
    }
    this._commit({ year: t.year, month: t.month, day: t.day, hour: 0, minute: 0 });
  }

  /** @private dialog-level Backspace: on the time screen = back to the date screen, from any control (footer buttons included) */
  _onDialogKey(e) {
    if (e.key !== 'Backspace' || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || this._step !== 'time' || !this._draft) return;
    const t = e.target instanceof Element ? e.target : null;
    if (t && t.closest('input, textarea, select, [contenteditable="true"]')) return;
    e.preventDefault();
    this._goDate();
  }

  /** @private "dd/mm/yyyy" of a calendar day */
  _dayText(d) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.day)}/${pad(d.month)}/${d.year}`;
  }

  /** @private announce through the dialog's own `role=status` (not the grid's live region) */
  _say(text) {
    if (this._status && this._status.textContent !== text) this._status.textContent = text;
  }

  /** @private show / hide the action buttons for the screen (datetime): date → "Hôm nay"; time → "Bây giờ" + "Chọn" */
  _syncActions() {
    if (!this._btn || this._mode() !== 'datetime') return;
    const time = this._step === 'time';
    this._btn.today.hidden = time;
    this._btn.now.hidden = !time;
    this._btn.confirm.hidden = !time;
  }

  /**
   * @private datetime: the TIME screen. `focus` is the TimeStep policy ('hour' | 'preserve' | 'none'). Everything that opens the
   * time screen goes through here → TimeStep.show() (unhide → time → layout → centre → focus).
   */
  _goTime(focus) {
    const d = this._draft;
    if (!d || !this._timeStep) return;
    const wasDate = this._step !== 'time';
    this._step = 'time';
    this._pop.setAttribute('data-step', 'time');
    this._cal.el.hidden = true;
    this._timeStep.show({ dateLabel: this._timeStep.headingFor(d.date), hour: d.hour, minute: d.minute, focus });
    this._syncActions();
    this._refreshDraft();
    if (wasDate) this._say(fill(TdDatetimePicker.labels.timeFor, { date: this._dayText(d.date) }));
    if (!this._sheet) this._placePop();
  }

  /**
   * @private datetime: back to the DATE screen ("‹" / Backspace). The draft (even one outside min–max) and its error stay; the focus
   * lands on the nearest ENABLED day (the draft date clamped into min–max).
   */
  _goDate() {
    const d = this._draft;
    if (!d || !this._timeStep) return;
    this._step = 'date';
    this._pop.setAttribute('data-step', 'date');
    this._timeStep.hide();
    this._cal.el.hidden = false;
    this._cal.setSelected(d.date, { reveal: true }); // the grid clamps its focus date into min–max
    this._cal.focusActive();
    this._syncActions();
    if (!this._sheet) this._placePop();
  }

  /** @private datetime: "Bây giờ" — the draft becomes the real now (minute snapped down; outside min–max the range error shows); no commit */
  _setNow() {
    if (!this._draft || !this._cal) return;
    const now = partsFromDate(new Date());
    const d = { year: now.year, month: now.month, day: now.day };
    const minute = snapMinuteDown(now.minute, this._minuteStep());
    // the REAL now goes into the draft (Codex r1 #4): outside min / max "Chọn" is refused with the range error; only the
    // calendar's navigation focus is clamped (reveal), so the view lands on the nearest allowed month
    this._draft = { date: d, hour: now.hour, minute };
    this._cal.setSelected(d, { reveal: true });
    this._timeStep.show({ dateLabel: this._timeStep.headingFor(d), hour: now.hour, minute, focus: 'preserve' });
    this._refreshDraft();
    this._say(fill(TdDatetimePicker.labels.timeFor, { date: this._dayText(d) }));
  }

  /**
   * @private validate the datetime draft: the error line (role=alert) + aria on the wheels. Returns the error or null.
   * @returns {ReturnType<TdDatetimePicker['_check']>}
   */
  _refreshDraft() {
    if (!this._draft || !this._popErr) return null;
    const d = this._draft;
    const err = this._check({ ...d.date, hour: d.hour, minute: d.minute });
    const line = this._popErr;
    if (err) {
      if (line.textContent !== err.message) line.textContent = err.message;
      line.hidden = false;
    } else {
      line.hidden = true;
      line.textContent = '';
    }
    if (this._timeStep) {
      for (const list of this._timeStep.el.querySelectorAll('.td-dtp-wheel__list')) {
        if (err) list.setAttribute('aria-describedby', line.id);
        else list.removeAttribute('aria-describedby');
      }
    }
    return err;
  }

  /** @private "Chọn" (datetime): commit the draft — refused (dialog stays, focus on the wheel) while it violates min / max */
  _confirm() {
    if (!this._draft) return;
    const err = this._refreshDraft();
    if (err) { // refused: stay on the time screen, the wheels centred, the focus on the hour wheel (the error is announced)
      this._timeStep.show({ dateLabel: this._timeStep.headingFor(this._draft.date), hour: this._draft.hour, minute: this._draft.minute, focus: 'hour' });
      return;
    }
    const d = this._draft;
    this._commit({ ...d.date, hour: d.hour, minute: d.minute });
  }

  /**
   * @private write the value, emit ONE `change`, close, focus the trigger. The same value as before (date / month / year
   * mode) closes without a `change`; datetime "Chọn" always emits (the v0.59 contract).
   */
  _commit(parts) {
    const mode = this._mode();
    const p = toModeParts(parts, mode);
    const value = formatModeDisplay(p, mode);
    const unchanged = mode !== 'datetime' && this.getAttribute('value') === value;
    // `change` first: the focus moves after it. v0.63.0: through the one write path (`editable`: a typed error goes)
    if (!unchanged) this._write(value, { change: { value, dbValue: formatModeDb(p, mode) } });
    this._closeDialog({ focus: true });
  }

  /** @private min / max attributes changed while open: the cells re-evaluate in place, the draft is re-checked */
  _applyBoundsToDialog() {
    if (!this._cal) return;
    const { min, max } = this._bounds();
    this._cal.setBounds(min, max);
    const today = this._btn && this._btn.today;
    if (today) {
      const t = partsFromDate(new Date());
      const mode = this._mode();
      const out = mode === 'date' || mode === 'datetime' ? isDateOutOfRange(t, min, max)
        : mode === 'month' ? monthOutOfRange(t.year, t.month, min, max) : yearOutOfRange(t.year, min, max);
      if (out) today.setAttribute('aria-disabled', 'true');
      else today.removeAttribute('aria-disabled');
    }
    this._refreshDraft();
    if (!this._sheet) this._placePop();
  }

  // --- popover geometry (plan A5: scroll region + pinned actions, flip, clamp) ---

  /**
   * @private the safe-area insets (a notch / home bar in landscape) as numbers: a zero-size hidden probe in the popover whose
   * padding is `env(safe-area-inset-*)` (calendar.css) — the computed padding resolves env(), CSP-safe (no style markup).
   * @returns {{ top: number, right: number, bottom: number, left: number }}
   */
  _insets() {
    if (!this._inset) {
      const probe = document.createElement('span');
      probe.className = 'td-dtp-pop__inset';
      probe.setAttribute('aria-hidden', 'true');
      this._pop.appendChild(probe);
      this._inset = probe;
    }
    const cs = getComputedStyle(this._inset);
    const n = (v) => Math.max(0, parseFloat(v) || 0);
    return { top: n(cs.paddingTop), right: n(cs.paddingRight), bottom: n(cs.paddingBottom), left: n(cs.paddingLeft) };
  }

  /**
   * @private place the popover against the trigger: the side with room, the scroll region shrinks, else clamp. The height
   * budget and the clamp bounds are the visual viewport MINUS the safe-area insets (Codex r1 #5).
   */
  _placePop() {
    const pop = this._pop;
    const trigger = this._anchor(); // v0.63.0 `editable`: the whole box
    const scroll = this._popScroll;
    if (!pop || !trigger || !scroll) return;
    const keep = scroll.scrollTop; // re-measuring drops the region's max-height for a moment: keep where the user is
    const box = viewportBox();
    const ins = this._insets();
    const top = box.top + ins.top;
    const bottom = box.bottom - ins.bottom;
    pop.style.setProperty('max-height', `${Math.max(0, bottom - top - 2 * POP_MARGIN)}px`);
    scroll.style.removeProperty('max-height');
    // placeFloating has one margin for every edge: the widest inset keeps it inside the safe rectangle on all four
    const edge = POP_MARGIN + Math.max(ins.top, ins.right, ins.bottom, ins.left);
    const placed = placeFloating(trigger, pop, { width: 'auto', align: 'start', list: scroll, margin: edge });
    pop.setAttribute('data-placement', placed.side);
    // neither side has room (a short viewport, the trigger in the middle): drop the per-side cap and keep the whole
    // popover inside the safe rectangle — it may cover the trigger (like td-color-picker)
    if (scroll.clientHeight < Math.min(POP_MIN_SCROLL, scroll.scrollHeight)) {
      scroll.style.removeProperty('max-height');
      const h = pop.offsetHeight;
      const rect = trigger.getBoundingClientRect();
      const want = placed.side === 'bottom' ? rect.bottom + 8 : rect.top - 8 - h;
      const clamped = Math.max(top + POP_MARGIN, Math.min(want, bottom - h - POP_MARGIN));
      pop.style.setProperty('top', `${clamped}px`);
    }
    scroll.scrollTop = keep;
  }

  /** @private scroll / resize / reference change: close once the trigger is hidden, else follow it */
  _updatePop() {
    if (!this._pop) return;
    const trigger = this._anchor();
    if (!trigger || !trigger.isConnected || isReferenceHidden(trigger.getBoundingClientRect(), trigger)) {
      this._closeDialog({ focus: false });
      return;
    }
    this._placePop();
  }

  /** @private Tab / Shift+Tab cycle inside the popover (explicit: WebKit does not Tab to buttons by default) */
  _onPopTab(e) {
    const pop = this._pop;
    if (!pop) return 'pass';
    const nodes = focusablesIn(pop);
    if (!nodes.length) { e.preventDefault(); pop.focus({ preventScroll: true }); return 'handled'; }
    const i = nodes.indexOf(/** @type {HTMLElement} */ (document.activeElement));
    const next = i < 0 ? 0 : (i + (e.shiftKey ? -1 : 1) + nodes.length) % nodes.length;
    e.preventDefault();
    nodes[next].focus({ preventScroll: true });
    return 'handled';
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
    this._dropTypedError(); // v0.63.0 D3 (also when the attribute did not change)
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
