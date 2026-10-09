import { TdFormElement, ssrContentNodes, ssrSameAttrs, ssrSamePart, ssrIsErrorNote } from '../base/td-form-element.js';
import { ssrMarker } from '../base/td-base-element.js';
import { ValueTitleWatcher, displayedValueText } from '../utils/value-title.js';
import { TdModal } from '../feedback/td-modal.js';
import { fillIconSlots } from '../icons/td-icon.js';
import { CalendarGrid } from './calendar-grid.js';
import { maskOnInput, maskAfterComposition } from './typed-mask.js';
import { TimeStep } from './time-step.js';
import { freshCalendarLabels, normalizeCalendarLabels } from './calendar-labels.js';
import { clampDate, compareDates, isDateOutOfRange } from '../utils/calendar-model.js';
import { matches, MQ_COARSE } from '../utils/breakpoints-internal.js';
import { pickDay, cellFlags, rangeDays } from '../utils/range-selection.js';
import {
  parseBound, invalidReason, normalizeMinuteStep, snapMinuteDown, partsFromDate, toModeParts, parseModeValue,
  parseModeDb, formatModeDisplay, formatModeDb, formatModeIso, compareModeParts, MODE_PARTS, toNativeValue, fromNativeValue,
  parseTypedValue,
} from '../utils/datetime.js';
import {
  normalizeRangeMode, requiredParts, lastMinute, emptyParts, isEmptyParts, defaultPresets, resolvePreset, sameRange,
  spanDays,
} from '../utils/date-presets.js';

const SIDES = /** @type {const} */ (['start', 'end']);
/** Every form-associated element (the SSR gate counts them: exactly the two natives + the trigger). */
const FORM_ASSOCIATED = 'input, textarea, select, button, fieldset, output, object';
const STATE_MAX = 64; // a restored side longer than this is ignored (formStateRestoreCallback)

const fill = (template, vars) => String(template).replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : ''));
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

// v0.56.0: the native value helpers moved to src/utils/datetime.js (shared with td-datetime-picker); re-exported here
export { toNativeValue, fromNativeValue };

/**
 * `<td-datetime-range>` — a date (or date-time) RANGE "from – to" with quick presets (v0.40.0, plan v0.39.0-filters-range QĐ 17–26). A
 * separate element, not a `range` flag on `<td-datetime-picker>`: the value is a pair (`getValue()` → `{ start, end }`), the form gets
 * TWO entries, and the single picker stays untouched. Since v0.61.0 (plan v0.61.0-range-calendar) the dialog is the calendar of
 * v0.60.0: ONE grid (src/form/calendar-grid.js, painted through its `cellState` hook) for both endpoints, the "Từ | Đến" switch, and
 * (datetime) one hour / minute wheel pair (src/form/time-wheels.js) that follows the endpoint being edited.
 *
 * Rendered DOM (in place updates for start / end / placeholder / required / disabled / min / max / names / formats;
 * only `label` and `mode` re-render):
 *   <td-datetime-range id="{id}">
 *     <div class="td-dtr" data-state="closed|open">
 *       [<span class="td-field__label td-dtr__label" id="{id}-label">{label}[<span class="td-field__required" aria-hidden="true"> *</span>]</span>]
 *       <button type="button" class="td-dtr__trigger" id="{id}-trigger" role="combobox" aria-haspopup="dialog"
 *               aria-expanded="false" [aria-labelledby="{id}-label"] [aria-required="true"] [disabled]>
 *         <span class="td-dtr__value" [data-placeholder]>{dd/mm/yyyy – dd/mm/yyyy | Từ … | Đến … | placeholder}</span>
 *         <span class="td-dtr__icon" data-td-icon="calendar" aria-hidden="true"></span>
 *       </button>
 *     </div>
 *     [<span class="td-field-error" id="{id}-error" data-for="{id}">…</span>]
 *   </td-datetime-range>
 *
 * Dialog (TdModal, sheet < 720, centred box ≥ 720; `{p}` = `{id}-dtr{n}`):
 *   div.td-dtr-panel[data-mode][data-side=start|end]
 *     div.td-dtr-panel__presets[role=group][aria-label="Chọn nhanh"] > button.td-dtr-panel__preset[aria-pressed] …
 *     div.td-dtr-panel__main
 *       div.td-dtr-panel__switch[role=group] > button.td-dtr-panel__tab[aria-pressed][data-side] × 2   (every width, both modes)
 *       [button.td-dtr-panel__preset.td-dtr-panel__open-end[aria-pressed]]                              (allow-open-end)
 *       div.td-cal …                                                                                    (the calendar; day cells carry data-range / data-preview / data-dimmed)
 *       [div.td-dtp-pop__time (hour / minute wheels) + button.td-dtr-panel__next "Tiếp: Đến"]            (datetime)
 *     p.td-dtr-panel__hint            "Tối đa N ngày" (date mode + max-days, while the end is chosen)
 *     p.td-dtr-panel__error[role=alert]  (order / span / required / outside min–max; described-by of the tab it is about)
 *     p.td-sr-only[role=status]          (preset + Từ / Đến announcements)
 *   Footer: "Đóng" / "Xoá" (both sides, stays open) / "Chọn" (one `change`).
 *   The dialog draft (v0.61.0 B8) = { date: { start, end }, time: { start, end }, side } is the ONE source of truth; the grid, the wheels,
 *   the tabs, the presets and the error line are views of it. The selection logic is src/utils/range-selection.js.
 *
 * Form (ElementInternals): `setFormValue(FormData)` with TWO entries `{start-name | name[start]}` and
 * `{end-name | name[end]}` (an empty side = ''), formatted by `form-value-format`; state = JSON `{"v":1,"start","end"}`.
 * Validity: valueMissing (sides of `required` — requiredParts), badInput, rangeUnderflow / rangeOverflow (min / max),
 * customError (order start ≤ end, `max-days`).
 *
 * SSR (`datetime-range@1`, php td_datetime_range): two native inputs + the trigger; adopted through the component's
 * OWN gate (the shared TdFormElement gate allows exactly one control and stays unchanged) — see `canHydrate()`.
 *
 * **Typed dates — `editable` (v0.63.0, plan v0.63.0-typed-dates B / D):** opt-in; without it nothing above changes. The field
 * becomes two text inputs + the icon button that opens the same dialog:
 *   <div class="td-dtr td-dtr--editable" data-state>
 *     [span.td-field__label.td-dtr__label#{id}-label]
 *     <span id="{id}-start-name" hidden>Từ ngày</span>
 *     <input type="text" class="td-dtr__input" data-side="start" id="{id}-start-input" aria-labelledby="{id}-label {id}-start-name"
 *            autocomplete="off" spellcheck="false" placeholder [aria-required] [readonly inputmode="none" on touch] [disabled]>
 *     <span class="td-dtr__sep" aria-hidden="true">–</span>
 *     <span id="{id}-end-name" hidden>Đến ngày</span> <input … data-side="end" …>   (allow-open-end: placeholder "Không hạn")
 *     <button type="button" class="td-dtr__trigger td-dtr__trigger--icon" id="{id}-trigger" aria-label="Mở lịch" aria-haspopup="dialog"
 *             aria-expanded><span class="td-dtr__icon" data-td-icon="calendar" aria-hidden="true"></span></button>
 *   </div>
 * No `name` on the inputs (the host submits); their native `input` / `change` are stopped at the input. Each input commits ITS
 * side (Enter without preventDefault, blur, before the dialog opens; unchanged text → nothing) with the picker's table
 * (parseTypedValue; empty → cleared; unreadable / impossible → the raw text). After the write, ONE `change` (detail as "Chọn",
 * `preset: null`) when the whole range is valid (validity clean: requiredParts, order, `max-days`, min / max, badInput) and
 * differs from the range before — so an open range fires after "Từ", again after "Đến"; `required` waits for both. Every
 * write (typed side, "Chọn") goes through `_write()`. The typed error (D3) shows through the error contract (a site error
 * wins), `aria-invalid` on the input it is about: that side's own error (format / date / min / max / required of that side),
 * else the order / `max-days` error on the side just committed, else the other side's own error. It goes on "Chọn",
 * setValue() / setDBValue() / an outside start / end change, reset, `editable` off, or once the range is valid. Escape puts
 * the committed text back; ArrowDown / Alt+ArrowDown open the dialog; closing it returns to an INPUT (the one it was opened from,
 * else the last focused side, else the start). A `change` needs the COMPLETE validity (a site's setCustomValidity too). Touch-first devices (`MQ_COARSE`, followed live):
 * `readonly` + `inputmode="none"`, a tap opens the dialog.
 *
 * @element td-datetime-range
 * @attr {string} mode - date (default) | datetime (month / year → date + a warning)
 * @attr {string} start - start: display format of the mode or its ISO
 * @attr {string} end - end: same formats
 * @attr {string} name - form name → `name[start]` / `name[end]`
 * @attr {string} start-name - overrides the start entry name (e.g. `date_from`)
 * @attr {string} end-name - overrides the end entry name (e.g. `date_to`)
 * @attr {string} label - visible label
 * @attr {string} placeholder - trigger text when both sides are empty
 * @attr {string} min - earliest allowed value (both sides; formats of td-datetime-picker)
 * @attr {string} max - latest allowed value
 * @attr {number} max-days - longest range in calendar days (both ends included)
 * @attr {number} minute-step - minute wheel step (datetime)
 * @attr {string} form-value-format - iso (default) | display | db
 * @attr {string} open-at - today | min | max | a date: where an EMPTY side opens (without it an empty side opens empty)
 * @attr {string} required - '' / both (both sides) | start | end (see requiredParts)
 * @attr {boolean} disabled
 * @attr {boolean} allow-open-end - v0.59.0: the end may stay empty ("Không hạn"): never required (required / both → start
 *   only; required="end" → one warning), trigger "{start} – Không hạn", a "Không hạn" toggle in the "Đến" side (pressed =
 *   the end being edited is empty). Value / FormData / events unchanged (end ''). In place, also while the dialog is open.
 * @attr {string} error-text - error message (error contract)
 * @attr {boolean} editable - v0.63.0: both sides can be typed (desktop; touch keeps tap-to-open) — see "Typed dates" above
 * @fires change - "Chọn" committed: detail { value: { start, end }, dbValue: { start, end }, preset: id | null }; `editable`:
 *   a typed side committed while the whole range is valid and differs (preset null)
 */
export class TdDatetimeRange extends TdFormElement {
  static get observedAttributes() {
    return [...super.observedAttributes, 'mode', 'start', 'end', 'start-name', 'end-name', 'label', 'placeholder', 'min', 'max',
      'max-days', 'minute-step', 'form-value-format', 'open-at', 'error-text', 'aria-label', 'allow-open-end', 'editable'];
  }

  /** `required` carries a value (start | end | both), so it is not a boolean attribute here. */
  static get booleanAttributes() { return ['disabled', 'allow-open-end', 'editable']; }

  static get errorContract() { return true; }

  /** UI strings (Vietnamese); override per site. php/td.php Td::RANGE_LABELS mirrors the SSR ones. */
  static labels = {
    title: 'Chọn khoảng ngày', titleDatetime: 'Chọn khoảng ngày giờ',
    placeholder: 'dd/mm/yyyy – dd/mm/yyyy', placeholderDatetime: 'dd/mm/yyyy hh:mm – dd/mm/yyyy hh:mm',
    start: 'Từ', end: 'Đến', fromPrefix: 'Từ', toPrefix: 'Đến', presets: 'Chọn nhanh', switcher: 'Mốc đang sửa',
    next: 'Tiếp: Đến', emptySide: '—', date: 'Ngày', day: 'Ngày', month: 'Tháng', year: 'Năm', time: 'Giờ',
    hour: 'Giờ', minute: 'Phút', close: 'Đóng', clear: 'Xoá', confirm: 'Chọn', presetChosen: 'Đã chọn {label}: {range}',
    openEnd: 'Không hạn', // v0.59.0 `allow-open-end`
    // v0.63.0 `editable`: the icon button, the hidden names of the two inputs, their placeholder (per mode)
    openCalendar: 'Mở lịch', startInput: 'Từ ngày', endInput: 'Đến ngày', startInputDatetime: 'Từ', endInputDatetime: 'Đến',
    sidePlaceholder: 'dd/mm/yyyy', sidePlaceholderDatetime: 'dd/mm/yyyy - hh:mm',
    // v0.61.0 (calendar): cell suffixes, the max-days note, the `role=status` announcements. `date` / `day` / `month` / `year`
    // above are no longer used by the dialog (kept so a site's override does not break).
    rangeStart: 'ngày bắt đầu', rangeEnd: 'ngày kết thúc', rangeSingle: 'ngày bắt đầu và kết thúc', rangeIn: 'trong khoảng',
    overLimit: 'quá {n} ngày — bấm để bắt đầu khoảng mới', maxDaysNote: 'Tối đa {n} ngày',
    startChosen: 'Đã chọn ngày bắt đầu {date}. Chọn ngày kết thúc.', endChosen: 'Đã chọn ngày kết thúc {date}.',
    rangeChosen: 'Đã chọn khoảng {range}, {n} ngày.', restarted: 'Bắt đầu khoảng mới từ {date}. Chọn ngày kết thúc.',
    sideChosen: '{side}: {date}', editing: 'Đang sửa {side}', now: 'Bây giờ',
    // the calendar keys (weekday names, month headings…) are shared with td-datetime-picker (src/form/calendar-labels.js)
    ...freshCalendarLabels(),
  };

  /** Validation messages (`{min}` / `{max}` / `{n}` filled in). */
  static messages = {
    required: 'Vui lòng chọn khoảng ngày',
    requiredStart: 'Vui lòng chọn ngày bắt đầu',
    requiredEnd: 'Vui lòng chọn ngày kết thúc',
    format: 'Định dạng ngày không hợp lệ',
    formatDatetime: 'Định dạng ngày giờ không hợp lệ',
    incomplete: 'Vui lòng nhập đầy đủ ngày, tháng, năm',
    incompleteDatetime: 'Vui lòng nhập đầy đủ ngày và giờ', // v0.63.0: a typed date without the time
    day: 'Ngày phải từ 1 đến 31',
    month: 'Tháng phải từ 1 đến 12',
    year: 'Năm phải từ {min} đến {max}',
    hour: 'Giờ phải từ 0 đến 23',
    minute: 'Phút phải từ 0 đến 59',
    date: 'Ngày không hợp lệ',
    min: 'Không được trước {min}',
    max: 'Không được sau {max}',
    order: 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc',
    span: 'Khoảng tối đa {n} ngày',
  };

  /** Default quick ranges (Hôm nay · 7 ngày qua · 30 ngày qua · Tháng này); a site may replace / extend the array. */
  static presets = defaultPresets();

  /** "Now" of the presets — the browser's local wall clock; a site on another server time zone overrides it. */
  static now() { return new Date(); }

  constructor() {
    super();
    this._isOpen = false;
    this._modalId = null;
    this._panel = null;
    /** @private the one dialog draft (v0.61.0 B8: two endpoints + side), the calendar and the wheels (null when closed) */
    this._draft = null;
    this._grid = null;
    this._timeStep = null; // datetime: the TIME screen (the only owner of the wheels)
    this._footer = null; // the hand-built TdModal footer nodes { close, clear, confirm }
    /** @private instance presets (null = TdDatetimeRange.presets) */
    this._presets = null;
    this._warned = new Set();
    /** @private v0.63.0 `editable` (D3): { own: { start, end } (messages|null), pair: { side, message }|null, last } | null */
    this._typedError = null;
    /** @private v0.63.0: the sides whose committed value came from typing + the last typed side (null = none typed) */
    this._typedOrigin = null;
    /** @private v0.63.0: the text the element last put into each input (a commit of the same text is a no-op) */
    this._inputText = { start: '', end: '' };
  }

  // --- Properties ---

  /** Quick ranges of THIS element (`[]` hides the row); null / undefined → `TdDatetimeRange.presets`. */
  get presets() { return this._presets ?? TdDatetimeRange.presets; }

  set presets(v) { this._presets = Array.isArray(v) ? v : null; }

  // --- Model (derived from the attributes on demand) ---

  /** @private */
  _mode() {
    const r = normalizeRangeMode(this.getAttribute('mode'));
    if (r.unknown) this._warnOnce('mode', `td-datetime-range: mode="${this.getAttribute('mode')}" is not supported — using "date".`);
    return r.mode;
  }

  /** @private sides of `required` (requiredParts table) */
  _required() {
    const r = requiredParts(this.getAttribute('required'));
    if (r.unknown) this._warnOnce('required', `td-datetime-range: required="${this.getAttribute('required')}" is unknown — both sides are required.`);
    if (!this.hasAttribute('allow-open-end')) return r.parts;
    // v0.59.0 (plan QĐ E2): an open end is never required; required="end" contradicts it (one warning)
    if (r.parts.length === 1 && r.parts[0] === 'end') {
      this._warnOnce('open-end', 'td-datetime-range: required="end" conflicts with allow-open-end — the end stays optional.');
    }
    return r.parts.filter((k) => k !== 'end');
  }

  /** @private */
  _bounds() {
    return { min: parseBound(this.getAttribute('min'), 'min'), max: parseBound(this.getAttribute('max'), 'max') };
  }

  /**
   * @private year range of the year fields + `messages.year`: the bound's year, else 1 / 9999 (v0.60.0, plan
   * v0.60.0-calendar-picker B4: like td-datetime-picker, no implicit 2000–2099 window any more)
   */
  _yearRange() {
    const { min, max } = this._bounds();
    return { min: min ? min.year : 1, max: max ? max.year : 9999 };
  }

  /** @private */
  _minuteStep() { return normalizeMinuteStep(this.getAttribute('minute-step')); }

  /** @private `max-days` as a positive integer, else null */
  _maxDays() {
    const raw = this.getAttribute('max-days');
    const n = raw == null || raw.trim() === '' ? NaN : Number(raw);
    return Number.isInteger(n) && n >= 1 ? n : null;
  }

  /** @private per-mode text: `{key}Datetime` in datetime mode when defined */
  _text(table, key) {
    return (this._mode() === 'datetime' && table[`${key}Datetime`]) || table[key];
  }

  /**
   * @private Validate one side's parts (like td-datetime-picker `_check`, date / datetime only).
   * @returns {{ flag: 'badInput'|'rangeUnderflow'|'rangeOverflow', message: string, field: string|null }|null}
   */
  _checkParts(p) {
    const M = TdDatetimeRange.messages;
    const mode = this._mode();
    const { min, max } = this._bounds();
    const years = this._yearRange();
    const reason = invalidReason(p);
    if (reason) {
      const field = reason === 'incomplete' ? MODE_PARTS[mode].find((k) => !Number.isInteger(p && p[k])) || null
        : reason === 'date' ? 'day' : reason;
      const message = reason === 'year' ? fill(M.year, years) : reason === 'incomplete' ? this._text(M, 'incomplete') : M[reason];
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

  /** @private committed state of one side (from its attribute) */
  _side(side) {
    const raw = this.getAttribute(side) || '';
    if (!raw) return { raw, parts: null, error: null, usable: false };
    const parts = parseModeValue(raw, this._mode());
    const error = parts ? this._checkParts(parts)
      : { flag: 'badInput', message: this._text(TdDatetimeRange.messages, 'format'), field: null };
    return { raw, parts, error, usable: !!parts && !(error && error.flag === 'badInput') };
  }

  /** @private the first failing constraint of the committed pair, or null */
  _validity() {
    const M = TdDatetimeRange.messages;
    const s = { start: this._side('start'), end: this._side('end') };
    const req = this._required();
    const miss = SIDES.filter((k) => !s[k].raw && req.includes(k));
    if (miss.length) {
      return { flags: { valueMissing: true }, message: miss.length === 2 ? M.required : miss[0] === 'start' ? M.requiredStart : M.requiredEnd };
    }
    for (const k of SIDES) if (s[k].error && s[k].error.flag === 'badInput') return { flags: { badInput: true }, message: s[k].error.message };
    for (const k of SIDES) if (s[k].error) return { flags: { [s[k].error.flag]: true }, message: s[k].error.message };
    if (s.start.usable && s.end.usable) {
      const pair = this._pairCheck(s.start.parts, s.end.parts);
      if (pair) return { flags: { customError: true }, message: pair };
    }
    return null;
  }

  /** @private order + span of two valid sides → a message or null */
  _pairCheck(a, b) {
    const M = TdDatetimeRange.messages;
    const mode = this._mode();
    if (compareModeParts(a, b, mode) > 0) return M.order;
    const n = this._maxDays();
    if (n && spanDays(a, b) > n) return fill(M.span, { n });
    return null;
  }

  /** @private submitted string of one side */
  _formatForForm(p) {
    const mode = this._mode();
    switch (this.getAttribute('form-value-format')) {
      case 'display': return formatModeDisplay(p, mode);
      case 'db': return formatModeDb(p, mode);
      default: return formatModeIso(p, mode);
    }
  }

  /** @private resolved entry names `[start, end]` ('' when neither the override nor `name` gives one) */
  _names() {
    const name = this.getAttribute('name') || '';
    const pick = (attr, key) => this.getAttribute(attr) || (name ? `${name}[${key}]` : '');
    return [pick('start-name', 'start'), pick('end-name', 'end')];
  }

  // --- Rendering ---

  render() {
    if (this._editable()) return this._renderEditable();
    const esc = (s) => this.escapeHtml(String(s));
    const id = esc(this.id);
    const label = this.getAttribute('label') || '';
    const required = this._required().length > 0;
    const disabled = this._ssrRender ? this.hasAttribute('disabled') : this._effectiveDisabled;
    const { text, placeholder } = this._triggerText();
    return `<div class="td-dtr" data-state="${this._isOpen ? 'open' : 'closed'}">`
      + (label ? `<span class="td-field__label td-dtr__label" id="${id}-label">${esc(label)}`
        + (required ? '<span class="td-field__required" aria-hidden="true"> *</span>' : '') + '</span>' : '')
      + `<button type="button" class="td-dtr__trigger" id="${id}-trigger" role="combobox" aria-haspopup="dialog"`
      + ` aria-expanded="${this._isOpen}"${label ? ` aria-labelledby="${id}-label"` : ''}${required ? ' aria-required="true"' : ''}`
      + `${disabled ? ' disabled' : ''}>`
      + `<span class="td-dtr__value"${placeholder ? ' data-placeholder' : ''}>${esc(text)}</span>`
      + '<span class="td-dtr__icon" data-td-icon="calendar" aria-hidden="true"></span>'
      + '</button></div>';
  }

  /** @private v0.63.0 `editable` (plan B): label + two text inputs (hidden side names) + the separator + the icon button */
  _renderEditable() {
    const esc = (s) => this.escapeHtml(String(s));
    const id = esc(this.id);
    const L = TdDatetimeRange.labels;
    const label = this.getAttribute('label') || '';
    const req = this._required();
    const disabled = this._ssrRender ? this.hasAttribute('disabled') : this._effectiveDisabled;
    const off = disabled ? ' disabled' : '';
    const touch = this._coarse() ? ' readonly inputmode="none"' : '';
    const input = (k) => `<span id="${id}-${k}-name" hidden>${esc(this._text(L, `${k}Input`))}</span>`
      + `<input type="text" class="td-dtr__input" data-side="${k}" id="${id}-${k}-input"`
      + ` aria-labelledby="${label ? `${id}-label ` : ''}${id}-${k}-name" autocomplete="off" spellcheck="false"`
      + ` placeholder="${esc(this._sidePlaceholder(k))}" value="${esc(this._sideText(k))}"`
      + `${req.includes(k) ? ' aria-required="true"' : ''}${touch}${off}>`;
    return `<div class="td-dtr td-dtr--editable" data-state="${this._isOpen ? 'open' : 'closed'}">`
      + (label ? `<span class="td-field__label td-dtr__label" id="${id}-label">${esc(label)}`
        + (req.length ? '<span class="td-field__required" aria-hidden="true"> *</span>' : '') + '</span>' : '')
      + input('start')
      + '<span class="td-dtr__sep" aria-hidden="true">–</span>'
      + input('end')
      + `<button type="button" class="td-dtr__trigger td-dtr__trigger--icon" id="${id}-trigger" aria-label="${esc(L.openCalendar)}"`
      + ` aria-haspopup="dialog" aria-expanded="${this._isOpen}"${off}>`
      + '<span class="td-dtr__icon" data-td-icon="calendar" aria-hidden="true"></span></button></div>';
  }

  /** @private v0.63.0 */
  _editable() { return this.hasAttribute('editable'); }

  /** @private v0.63.0: the typing input of one side (only rendered with `editable`) */
  _input(side) { return this.querySelector(`.td-dtr__input[data-side="${side}"]`); }

  /** @private v0.63.0: both inputs (none without `editable`) */
  _inputs() { return [...this.querySelectorAll('.td-dtr__input')]; }

  /** @private v0.63.0 plan E: a touch-first device — the inputs are read-only there */
  _coarse() { return matches(MQ_COARSE); }

  /** @private v0.63.0: the placeholder of one input (`allow-open-end`: the end reads "Không hạn") */
  _sidePlaceholder(side) {
    const L = TdDatetimeRange.labels;
    return side === 'end' && this.hasAttribute('allow-open-end') ? L.openEnd : this._text(L, 'sidePlaceholder');
  }

  /** @private v0.63.0: the inputs in place — text (the program wins, also while focused), placeholder */
  _syncInputs() {
    for (const k of SIDES) {
      const input = this._input(k);
      if (!input) continue;
      const text = this._sideText(k);
      if (input.value !== text) input.value = text;
      this._inputText[k] = text;
      const ph = this._sidePlaceholder(k);
      if (input.getAttribute('placeholder') !== ph) input.setAttribute('placeholder', ph);
    }
  }

  /** @private v0.63.0 plan E: follow MQ_COARSE live — touch → readonly + inputmode=none (pending text committed first) */
  _applyTouchMode() {
    const touch = this._coarse();
    for (const input of this._inputs()) {
      if (touch === input.readOnly) continue;
      if (touch) {
        this._commitSide(input.getAttribute('data-side'));
        input.readOnly = true;
        input.setAttribute('inputmode', 'none');
      } else {
        input.readOnly = false;
        input.removeAttribute('inputmode');
      }
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
   * @private v0.63.0 plan B / D2 / E: the listeners of one input. Its native `input` / `change` stop AT the input; Enter / blur
   * commit its side; Escape puts the committed text back; ArrowDown / Alt+ArrowDown open the dialog; a tap opens it on touch.
   */
  _bindInput(input) {
    const side = input.getAttribute('data-side');
    const stop = (e) => e.stopPropagation();
    this.listen(input, 'input', (e) => { // v0.63.1: the live mask (11122026 → 11/12/2026); never public
      e.stopPropagation();
      maskOnInput(/** @type {InputEvent} */ (e), input, this._mode());
    });
    this.listen(input, 'compositionend', () => maskAfterComposition(input, this._mode())); // v0.63.1: IME text, masked once it is done
    this.listen(input, 'change', stop);
    this.listen(input, 'focus', () => { this._lastSide = side; }); // the dialog opened from the icon button returns here
    this.listen(input, 'blur', () => {
      if (input === this._input(side)) this._commitSide(side);
    });
    this.listen(input, 'click', () => {
      if (input.readOnly) this._open(); // touch: a tap opens the dialog as before
    });
    this.listen(input, 'keydown', (e) => {
      if (e.isComposing || e.keyCode === 229) return; // IME composition
      if (e.key === 'Enter') {
        this._commitSide(side); // no preventDefault: an implicit form submission follows and sees the new value
      } else if (e.key === 'Escape') {
        if (input.value !== this._inputText[side]) {
          input.value = this._inputText[side]; // back to the committed text; nothing committed, no event
          e.preventDefault();
        }
      } else if (e.key === 'ArrowDown' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        e.preventDefault();
        this._open();
      }
    });
  }

  /**
   * @private v0.63.0 plan D (range): commit ONE side's typed text (Enter / blur / before the dialog opens). Unchanged text →
   * nothing. The side is written like the picker's table (empty → cleared; valid → the display format; outside min–max →
   * written, never clamped; unreadable / impossible → the raw text); then ONE `change` when the whole range is valid and
   * differs from the range before. Everything goes through `_write()`.
   * @param {'start'|'end'} side
   */
  _commitSide(side) {
    const input = this._input(side);
    if (!input || !input.isConnected || input.readOnly || this._effectiveDisabled) return;
    const text = input.value;
    if (text === this._inputText[side]) return;
    const mode = this._mode();
    // the COMPLETE validity (a site's setCustomValidity too — Codex impl r1 #1); null = the range before was not valid
    const before = this.validity.valid ? this.getValue() : null;
    const t = text.trim();
    let value = null;
    if (t) {
      const parts = parseTypedValue(t, mode);
      value = !parts || invalidReason(parts) ? t // the raw text (badInput, like a malformed attribute)
        : formatModeDisplay(toModeParts(parts, mode), mode);
    }
    this._write({ [side]: value }, {
      typed: () => {
        this._typedOrigin = { start: false, end: false, ...(this._typedOrigin || {}), [side]: true, last: side };
        return this._typedErrorNow();
      },
      change: () => {
        if (!this.validity.valid) return null; // read after _syncForm(): custom validity included
        const v = this.getValue();
        if (before && before.start === v.start && before.end === v.end) return null;
        return { value: v, dbValue: this.getDBValue(), preset: null };
      },
    });
  }

  /**
   * @private v0.63.0 D3: the own typed error of one side from its committed attribute under the CURRENT mode / bounds —
   * format / impossible date / min / max; empty + `withRequired` + a required side → its required message. null = fine.
   * @param {'start'|'end'} side @param {boolean} withRequired
   */
  _ownTypedError(side, withRequired) {
    const M = TdDatetimeRange.messages;
    const mode = this._mode();
    const raw = (this.getAttribute(side) || '').trim();
    if (!raw) return withRequired && this._required().includes(side) ? (side === 'start' ? M.requiredStart : M.requiredEnd) : null;
    const parts = parseTypedValue(raw, mode);
    if (!parts) return this._text(M, 'format');
    const err = this._checkParts(invalidReason(parts) ? parts : toModeParts(parts, mode));
    return err ? err.message : null;
  }

  /** @private v0.63.0 D3: the order / max-days message of the committed pair (both sides usable), or null */
  _pairTypedError() {
    const a = this._side('start');
    const b = this._side('end');
    return a.usable && b.usable ? this._pairCheck(a.parts, b.parts) : null;
  }

  /**
   * @private v0.63.0 (Codex impl r1 #5): a validation-driving attribute changed (min / max / max-days / required / mode /
   * allow-open-end) — each side's typed error and the pair error are recomputed from the committed values (a required-empty
   * error stays only on a side that had one), or the typed error goes when nothing is wrong now. Before _syncForm().
   */
  _recheckTypedError() {
    if (!this._typedOrigin || !this._editable()) return;
    this._typedError = this._typedErrorNow();
    this._applyErrorState();
  }

  /**
   * @private v0.63.0 D3: the typed error of the committed pair now — each TYPED side's own error (format / date / min / max /
   * its required message when it was committed empty), the order / max-days error on the last typed side. null = none.
   */
  _typedErrorNow() {
    const o = this._typedOrigin;
    if (!o) return null;
    const own = { start: null, end: null };
    for (const k of SIDES) if (o[k]) own[k] = this._ownTypedError(k, true);
    const pair = this._pairTypedError();
    const next = { own, pair: pair ? { side: o.last, message: pair } : null, last: o.last }; // order / max-days: the last typed side
    return own.start || own.end || next.pair ? next : null;
  }

  /**
   * @private v0.63.0 (plan Rủi ro): the ONE write of a user value — "Chọn" (`_confirm`) and a typed side (`_commitSide`): the
   * attributes, the field text, the form value + validity, the typed error, then at most ONE `change`. `typed` / `change` may be
   * functions, read AFTER the attributes are written (the validity of the new range decides).
   * @param {{ start?: string|null, end?: string|null }} next the sides to write (null removes the attribute)
   * @param {{ typed?: object|null|(() => object|null), change?: object|null|(() => object|null) }} [o]
   */
  _write(next, { typed = null, change = null } = {}) {
    this._writing = true;
    try {
      for (const k of SIDES) {
        if (!(k in next)) continue;
        if (next[k]) this.setAttribute(k, next[k]);
        else this.removeAttribute(k);
      }
    } finally {
      this._writing = false;
    }
    const hadTyped = this._typedError != null;
    if (typeof typed !== 'function') this._typedOrigin = null; // "Chọn": nothing typed any more
    this._typedError = typeof typed === 'function' ? typed() : typed;
    this._updateValueText();
    this._syncForm();
    if (hadTyped || this._typedError) this._applyErrorState();
    const detail = typeof change === 'function' ? change() : change;
    if (detail) this.emit('change', detail);
  }

  /** @private v0.63.0 D3: the typed error shown — `{ side, message }` or null (own error of the last side > pair > the other side) */
  _typedShown() {
    const t = this._typedError;
    if (!t || !this._editable()) return null;
    const other = t.last === 'start' ? 'end' : 'start';
    if (t.own[t.last]) return { side: t.last, message: t.own[t.last] };
    if (t.pair) return t.pair;
    if (t.own[other]) return { side: other, message: t.own[other] };
    return null;
  }

  /** @private v0.63.0 D3: the typed error goes (an outside value change, setValue, reset, `editable` off, a valid range) */
  _dropTypedError() {
    this._typedOrigin = null;
    this._hideTypedError();
  }

  /** @private v0.63.0: the range is valid now — the message goes, the typed sides stay (a later bound change re-judges them) */
  _hideTypedError() {
    if (this._typedError == null) return;
    this._typedError = null;
    this._applyErrorState();
  }

  /** v0.63.0 D3: the site's error (`setError()` / `error-text`) first, else the typed error. */
  get errorMessage() {
    const shown = this._typedShown();
    return super.errorMessage || (shown ? shown.message : '');
  }

  /** @protected v0.63.0: the error ARIA sits on the input the typed error is about (else the start input / the trigger) */
  _ariaTarget() {
    const shown = this._typedShown();
    return (shown && this._input(shown.side)) || this._focusTarget();
  }

  /** @protected v0.63.0: only the failing input carries aria-invalid (the target may move between the two inputs) */
  _applyErrorState() {
    super._applyErrorState();
    const target = this._ariaTarget();
    for (const input of this._inputs()) {
      if (input === target) continue;
      input.removeAttribute('aria-invalid');
      input.removeAttribute('aria-errormessage');
    }
  }

  afterRender() {
    fillIconSlots(this);
    const trigger = this._trigger();
    for (const input of this._inputs()) { // v0.63.0 `editable`
      this._bindInput(input);
      this._inputText[input.getAttribute('data-side')] = input.value;
    }
    if (this._inputs().length) {
      this._watchTouch();
      this._applyTouchMode();
    }
    if (trigger) {
      this.listen(trigger, 'click', () => this._open());
      this.listen(trigger, 'keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
          e.preventDefault(); // no implicit submit, no page scroll
          this._open();
        }
      });
    }
    this._applyName();
    this._syncForm();
    this._applyErrorState();
    this._watchValueTitle();
  }

  /** @private v0.34.0 value-title: `title` = the full text while it is cut */
  _watchValueTitle() {
    const el = this.querySelector('.td-dtr__value');
    if (!this._vt) {
      this._vt = new ValueTitleWatcher((node) => displayedValueText(node));
      this._cleanups.push(() => {
        if (this._vt) this._vt.destroy();
        this._vt = null;
      });
    }
    this._vt.watch(el);
  }

  /** @private display text of one committed side ('' when empty) */
  _sideText(side) {
    const s = this._side(side);
    if (!s.raw) return '';
    return s.usable ? formatModeDisplay(s.parts, this._mode()) : s.raw;
  }

  /** @private */
  _triggerText() {
    const L = TdDatetimeRange.labels;
    const a = this._sideText('start');
    const b = this._sideText('end');
    if (!a && !b) return { text: this.getAttribute('placeholder') || this._text(L, 'placeholder'), placeholder: true };
    if (a && b) return { text: `${a} – ${b}`, placeholder: false };
    if (a && this.hasAttribute('allow-open-end')) return { text: `${a} – ${L.openEnd}`, placeholder: false }; // v0.59.0
    return { text: a ? `${L.fromPrefix} ${a}` : `${L.toPrefix} ${b}`, placeholder: false };
  }

  /** @private */
  _updateValueText() {
    if (this._inputs().length) { // v0.63.0 `editable`: the inputs show the sides
      this._syncInputs();
      return;
    }
    const span = this.querySelector('.td-dtr__value');
    if (!span) return;
    const { text, placeholder } = this._triggerText();
    if (span.textContent !== text) span.textContent = text;
    if (placeholder) span.setAttribute('data-placeholder', '');
    else span.removeAttribute('data-placeholder');
    if (this._vt) this._vt.schedule();
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (this._helperAttr(name, oldVal, newVal)) return; // v0.54.0: helper-text in place (TdFormElement)
    if (oldVal === newVal) return;
    if (name === 'disabled') this._effectiveDisabled = newVal !== null || this._ancestorDisabled;
    if (!this._initialized) return;
    if ((name === 'start' || name === 'end') && !this._writing) this._dropTypedError(); // v0.63.0 D3: a value from outside
    // v0.63.0 (Codex impl r1 #5): validation-driving attributes re-judge the typed error first
    if (['min', 'max', 'max-days', 'required', 'allow-open-end'].includes(name)) this._recheckTypedError();
    switch (name) {
      case 'start':
      case 'end':
      case 'placeholder':
      case 'form-value-format':
      case 'min':
      case 'max':
      case 'max-days':
      case 'name':
      case 'start-name':
      case 'end-name':
        this._updateValueText();
        this._syncForm();
        if (this._grid && (name === 'min' || name === 'max' || name === 'max-days')) { // B7: the draft stays; bounds / flags / errors recomputed
          const { min, max } = this._dateBounds();
          this._grid.setBounds(min, max);
          this._syncUi();
        }
        return;
      case 'minute-step':
      case 'open-at':
        return; // read on the next open
      case 'required':
        this._applyRequired();
        this._syncForm();
        return;
      case 'allow-open-end': // v0.59.0 (plan QĐ E2b): in place — required / validity / trigger, the open dialog's button
        this._applyRequired();
        this._updateValueText();
        this._syncForm();
        this._applyErrorState();
        if (this._panel) {
          this._syncOpenEnd(this._panel);
          this._syncUi();
        }
        return;
      case 'disabled':
        this._applyDisabled();
        return;
      case 'aria-label':
        this._applyName();
        return;
      case 'error-text':
        super.attributeChangedCallback(name, oldVal, newVal);
        return;
      case 'mode':
        this._convertMode(normalizeRangeMode(oldVal).mode);
        this._recheckTypedError(); // v0.63.0: a raw side kept verbatim is judged by the new mode
        this._rerender();
        return;
      case 'editable': // v0.63.0: another field — uncommitted text and the typed error go
        this._typedError = null;
        this._typedOrigin = null;
        this._rerender();
        return;
      default: // label
        this._rerender();
    }
  }

  /** @private structural change: close an open dialog, render again, keep the focus on the trigger (v0.63.0: or on the same input) */
  _rerender() {
    const active = document.activeElement;
    const modalRoot = this._modalId ? document.getElementById(this._modalId) : null;
    const hadFocus = this.contains(active) || !!(modalRoot && modalRoot.contains(active));
    const side = active instanceof Element && active.matches('.td-dtr__input') && this.contains(active) ? active.getAttribute('data-side') : null;
    if (this._isOpen) this._close();
    this._doRender();
    const home = (side && this._input(side)) || this._trigger();
    if (hadFocus && home) home.focus();
  }

  /**
   * @private `mode` changed: rewrite each usable side in the new display format (date → datetime: start 00:00, end the
   * last minute slot; datetime → date: the time is dropped). Unusable values are kept verbatim. No `change`.
   */
  _convertMode(oldMode) {
    const mode = this._mode();
    if (oldMode === mode) return;
    for (const k of SIDES) {
      const raw = this.getAttribute(k);
      if (!raw) continue;
      const p = parseModeValue(raw, oldMode);
      if (!p || invalidReason(p)) continue;
      const q = toModeParts(p, mode);
      if (mode === 'datetime' && oldMode === 'date' && k === 'end') { q.hour = 23; q.minute = lastMinute(this._minuteStep()); }
      const next = formatModeDisplay(q, mode);
      if (next === raw) continue;
      // v0.63.0 (Codex impl r2): an INTERNAL write — a typed side stays typed (its error is re-judged by the new mode)
      const was = this._writing;
      this._writing = true;
      try {
        this.setAttribute(k, next);
      } finally {
        this._writing = was;
      }
    }
  }

  /** @protected <fieldset disabled> toggles in place (focus kept) */
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
    for (const input of this._inputs()) input.disabled = this._effectiveDisabled; // v0.63.0
    if (this._effectiveDisabled && this._isOpen) this._close();
  }

  /** @private aria-required + the decorative asterisk follow `required` in place (same markup as render()) */
  _applyRequired() {
    const req = this._required();
    const required = req.length > 0;
    const trigger = this._trigger();
    const inputs = this._inputs();
    if (inputs.length) { // v0.63.0 `editable`: per side, on the inputs (the icon button is not the field)
      for (const input of inputs) {
        if (req.includes(input.getAttribute('data-side'))) input.setAttribute('aria-required', 'true');
        else input.removeAttribute('aria-required');
      }
    } else if (trigger) {
      if (required) trigger.setAttribute('aria-required', 'true');
      else trigger.removeAttribute('aria-required');
    }
    const label = this.querySelector('.td-dtr__label');
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

  /** @private visible label (aria-labelledby in render()) → host aria-label → external <label for> */
  _applyName() {
    const inputs = this._inputs();
    if (!inputs.length) {
      this._applyAccessibleName(this._trigger(), !!this.getAttribute('label'));
      return;
    }
    // v0.63.0 `editable`: each input = the field's name + its hidden side name ("Từ ngày" / "Đến ngày"): the visible label,
    // else external <label for="{host}"> elements, else the host aria-label (copied as text in front of the side name)
    const label = this.getAttribute('label');
    const aria = this.getAttribute('aria-label');
    let names = [];
    if (label) names = [`${this.id}-label`];
    else if (!aria) {
      this._applyAccessibleName(inputs[0], false); // generates the external labels' ids into aria-labelledby
      names = (inputs[0].getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean);
    }
    for (const input of inputs) {
      const k = input.getAttribute('data-side');
      const nameEl = [...this.querySelectorAll('span[hidden]')].find((n) => n.id === `${this.id}-${k}-name`);
      if (nameEl) nameEl.textContent = (!label && aria ? `${aria} ` : '') + this._text(TdDatetimeRange.labels, `${k}Input`);
      input.removeAttribute('aria-label');
      input.setAttribute('aria-labelledby', [...names, `${this.id}-${k}-name`].join(' '));
    }
  }

  // --- Form participation ---

  /** @private FormData (two entries) + restore state + validity, from the attributes */
  _syncForm() {
    const [startName, endName] = this._names();
    const raw = { start: this.getAttribute('start') || '', end: this.getAttribute('end') || '' };
    const state = JSON.stringify({ v: 1, start: raw.start, end: raw.end });
    if (!startName || !endName) {
      this._warnOnce('name', 'td-datetime-range: no `name` (or start-name + end-name) — the range is not submitted.');
      this._setFormValue(null, state);
    } else {
      const fd = new FormData();
      for (const [k, n] of [['start', startName], ['end', endName]]) {
        const s = this._side(k);
        fd.append(n, !s.raw ? '' : s.usable ? this._formatForForm(s.parts) : s.raw);
      }
      this._setFormValue(fd, state);
    }
    const v = this._validity();
    if (v) this._setValidity(v.flags, v.message, this._focusTarget());
    else {
      this._setValidity({});
      this._hideTypedError(); // v0.63.0: the range is valid — a stale typed error goes
    }
  }

  _captureDefaults() {
    super._captureDefaults();
    const d = this._ssrDefaults;
    this._ssrDefaults = null;
    /** @private the reset values (attributes at load, or the server defaults of an adopted SSR markup) */
    this._defaultRange = d || { start: this.getAttribute('start'), end: this.getAttribute('end') };
    this._defaultMode = this._mode();
  }

  _restoreDefaults() {
    const d = this._defaultRange || { start: null, end: null };
    const from = this._defaultMode || this._mode();
    const conv = (v) => {
      if (v == null || from === this._mode()) return v;
      const p = parseModeValue(v, from);
      return p && !invalidReason(p) ? formatModeDisplay(toModeParts(p, this._mode()), this._mode()) : v;
    };
    this.setValue({ start: conv(d.start), end: conv(d.end) });
  }

  /** @protected bfcache / autofill restore: only a JSON v1 state of two short strings */
  _restoreState(state) {
    if (typeof state !== 'string' || state.length > 512) return;
    let o;
    try { o = JSON.parse(state); } catch { return; }
    if (!o || typeof o !== 'object' || o.v !== 1) return;
    const ok = (x) => typeof x === 'string' && x.length <= STATE_MAX;
    if (!ok(o.start) || !ok(o.end)) return;
    this.setValue({ start: o.start, end: o.end });
  }

  _focusTarget() { return this._input('start') || this._trigger(); } // v0.63.0 `editable`: the start input

  /** @private */
  _trigger() { return this.querySelector('.td-dtr__trigger'); }

  disconnectedCallback() {
    if (this._isOpen) this._close();
    super.disconnectedCallback();
  }

  // --- Dialog ---

  /** @private Open the dialog (no-op when disabled, detached or already open). */
  _open() {
    if (this._isOpen || this._effectiveDisabled || !this.isConnected) return;
    const trigger = this._trigger();
    if (!trigger) return;
    const inputs = this._inputs();
    if (inputs.length) { // v0.63.0 `editable`: typed text is committed before the dialog opens (it opens at that range)
      for (const k of SIDES) this._commitSide(k);
      if (this._isOpen || this._effectiveDisabled || !this.isConnected || this._trigger() !== trigger) return; // a `change` listener changed it
    }
    // the dialog gives the focus back to its opener: the trigger; v0.63.0 `editable` (plan F, Codex impl r1 #3): an INPUT —
    // the one it was opened from (ArrowDown), else the last side input that had the focus, else the start input
    const active = /** @type {any} */ (document.activeElement);
    const opener = !inputs.length ? trigger
      : inputs.includes(active) ? active : (this._input(this._lastSide || 'start') || inputs[0]);
    if (active !== opener) opener.focus({ preventScroll: true });
    const L = TdDatetimeRange.labels;
    this._isOpen = true;
    const panel = this._buildPanel();
    this._panel = panel;
    const mode = this._mode();
    this._modalId = TdModal.show({
      themeRoot: this, // v0.42.0 (ADR 0020): the range dialog follows the host's theme scope
      title: this._text(L, 'title'),
      body: panel,
      size: 'md', // datetime is two screens now: the same width for both modes
      escapeCloses: true,
      focusTarget: panel.querySelector('.td-cal__day[tabindex="0"]'), // v0.61.0: the active cell of the calendar
      footer: this._makeFooter(), // hand-built nodes carrying `data-action` (close | clear | confirm); see _makeFooter()
      onClose: () => this._onDialogClosed(panel),
    });
    trigger.setAttribute('aria-expanded', 'true');
    trigger.setAttribute('aria-controls', this._modalId);
    // Backspace on the TIME screen = back, from ANY control of the dialog (the footer buttons and the endpoint tabs are outside .td-time-step)
    const modalRoot = document.getElementById(this._modalId);
    if (modalRoot) modalRoot.addEventListener('keydown', (e) => this._onDialogKey(e));
    const box = this.querySelector('.td-dtr');
    if (box) box.setAttribute('data-state', 'open');
  }

  /** @private dialog-level Backspace: on the time screen it goes back to the date screen (never inside a text field — there are none, but be safe) */
  _onDialogKey(e) {
    if (e.key !== 'Backspace' || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || !this._draft || this._draft.step !== 'time') return;
    const t = e.target instanceof Element ? e.target : null;
    if (t && t.closest('input, textarea, select, [contenteditable="true"]')) return;
    e.preventDefault();
    this._showSide(this._draft.side, 'date', 'grid');
  }

  /** @private Close, discarding the pending pair. */
  _close() {
    if (!this._isOpen) return;
    const panel = this._panel;
    if (this._modalId) TdModal.closeById(this._modalId);
    this._onDialogClosed(panel);
  }

  /** @private every close path ends here: the draft, the calendar and the wheels go */
  _onDialogClosed(panel) {
    if (!this._isOpen || this._panel !== panel) return;
    if (this._grid) this._grid.destroy();
    if (this._timeStep) this._timeStep.destroy();
    this._grid = null;
    this._timeStep = null;
    this._footer = null;
    this._draft = null;
    this._hoverDate = null;
    this._focusDate = null;
    this._isOpen = false;
    this._modalId = null;
    this._panel = null;
    this._presetState = null;
    const trigger = this._trigger();
    if (trigger) {
      trigger.setAttribute('aria-expanded', 'false');
      trigger.removeAttribute('aria-controls');
    }
    const box = this.querySelector('.td-dtr');
    if (box) box.setAttribute('data-state', 'closed');
  }

  /**
   * @private The dialog footer: hand-built `.td-btn` nodes carrying `data-action` (TdModal `footer:` appends them as is; its `actions`
   * cannot carry metadata). "Đóng" → `TdModal.requestClose`; "Xoá" stays open; "Chọn" closes ONLY when `_confirm()` succeeded
   * (a rejected confirm leaves the dialog open on the field that is wrong). "Chọn" is shown per `_syncFooter()`.
   */
  _makeFooter() {
    const L = TdDatetimeRange.labels;
    const btn = (variant, action, label, onClick) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `td-btn td-btn--${variant}`;
      b.setAttribute('data-action', action);
      const t = document.createElement('span');
      t.className = 'td-btn__label';
      t.textContent = label;
      b.appendChild(t);
      b.addEventListener('click', onClick);
      return b;
    };
    this._footer = {
      close: btn('secondary', 'close', L.close, () => { if (this._modalId) TdModal.requestClose(this._modalId, 'close'); }),
      clear: btn('secondary', 'clear', L.clear, () => this._clearPending()),
      confirm: btn('primary', 'confirm', L.confirm, () => {
        if (this._confirm() && this._modalId) TdModal.requestClose(this._modalId, 'confirm');
      }),
    };
    this._syncFooter();
    return [this._footer.close, this._footer.clear, this._footer.confirm];
  }

  /**
   * @private "Chọn" visibility. mode date: always. datetime: ONLY on the time screen — the one exception is a completely EMPTY
   * draft (after "Xoá"): "Chọn" shows on the date screen and commits the empty range (removing a table filter must stay possible).
   */
  _syncFooter() {
    const d = this._draft;
    if (!this._footer || !d) return;
    const empty = !d.date.start && !d.date.end;
    this._footer.confirm.hidden = this._mode() === 'datetime' && d.step === 'date' && !empty;
  }

  /**
   * @private Pending parts of one side when the dialog opens: the committed parts (time clamped, minute snapped down);
   * an empty / unreadable side opens EMPTY — or at `open-at` when that attribute is set (start 00:00, end the last slot).
   */
  _initialSide(side) {
    const mode = this._mode();
    const step = this._minuteStep();
    const s = this._side(side);
    let p = null;
    if (s.usable) { // v0.63.0 (Codex impl r1 #4): a bad-input side (31/02/1994, 25:99) opens like an empty one
      p = { ...s.parts };
      p.hour = clamp(p.hour, 0, 23);
      p.minute = snapMinuteDown(clamp(p.minute, 0, 59), step);
    } else if (this.hasAttribute('open-at')) {
      p = this._openAtParts();
      p.hour = side === 'start' ? 0 : 23;
      p.minute = side === 'start' ? 0 : lastMinute(step);
    }
    if (!p) return emptyParts(side, step);
    const out = toModeParts(p, mode);
    if (mode === 'datetime') { out.hour = p.hour; out.minute = p.minute; }
    return out;
  }

  /** @private `open-at` (today | min | max | a date) clamped to min–max, like td-datetime-picker */
  _openAtParts() {
    const { min, max } = this._bounds();
    const at = (this.getAttribute('open-at') || '').trim();
    let p = null;
    if (at === 'min') p = min;
    else if (at === 'max') p = max;
    else if (at && at !== 'today') p = parseBound(at, 'min');
    if (!p) p = partsFromDate(TdDatetimeRange.now());
    const mode = this._mode();
    if (min && compareModeParts(p, min, mode) < 0) p = min;
    if (max && compareModeParts(p, max, mode) > 0) p = max;
    return { ...p };
  }

  /** @private `min` / `max` at calendar-day granularity for the grid (the time part of a datetime bound is checked by _checkParts) */
  _dateBounds() {
    const { min, max } = this._bounds();
    const d = (p) => (p ? { year: p.year, month: p.month, day: p.day } : null);
    return { min: d(min), max: d(max) };
  }

  /** @private the context of the pure range-selection model */
  _selCtx() {
    const { min, max } = this._dateBounds();
    return { mode: this._mode(), maxDays: this._maxDays(), min, max };
  }

  /** @private the selection model view of the draft */
  _sel() {
    const d = this._draft;
    return { start: d.date.start, end: d.date.end, side: d.side };
  }

  /** @private default time of an endpoint that has no date (start 00:00, end the last minute slot) */
  _defaultTime(side) {
    return { hour: side === 'start' ? 0 : 23, minute: side === 'start' ? 0 : lastMinute(this._minuteStep()) };
  }

  /** @private full parts of one draft endpoint (NaN date parts when it is empty) */
  _partsOf(k) {
    const d = this._draft.date[k];
    const t = this._draft.time[k];
    if (!d) return emptyParts(k, this._minuteStep());
    return { day: d.day, month: d.month, year: d.year, hour: t.hour, minute: t.minute };
  }

  /** @private "dd/mm/yyyy" of a calendar day */
  _dayText(d) {
    return formatModeDisplay({ day: d.day, month: d.month, year: d.year, hour: 0, minute: 0 }, 'date');
  }

  /**
   * @private build the dialog body with DOM APIs (labels / preset labels are TEXT). The draft (B8) is the one source of truth;
   * the calendar, the wheels, the tabs, the presets and the error line are views of it.
   */
  _buildPanel() {
    const L = TdDatetimeRange.labels;
    TdDatetimeRange._openSeq = (TdDatetimeRange._openSeq || 0) + 1;
    const prefix = `${this.id}-dtr${TdDatetimeRange._openSeq}`;
    const mode = this._mode();
    const step = this._minuteStep();
    const make = (tag, cls, attrs = {}, text) => {
      const n = document.createElement(tag);
      if (cls) n.className = cls;
      for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
      if (text != null) n.textContent = String(text);
      return n;
    };
    const panel = make('div', 'td-dtr-panel', { 'data-mode': mode, 'data-side': 'start', 'data-step': 'date' });
    this._prefix = prefix;

    // the draft (init): two complete endpoints + the side being edited
    const init = {};
    for (const k of SIDES) init[k] = this._initialSide(k);
    this._draft = {
      date: {}, time: {}, side: 'start', step: 'date',
    };
    for (const k of SIDES) {
      const p = init[k];
      this._draft.date[k] = isEmptyParts(p) ? null : { year: p.year, month: p.month, day: p.day };
      this._draft.time[k] = Number.isInteger(p.hour) && Number.isInteger(p.minute) ? { hour: p.hour, minute: p.minute } : this._defaultTime(k);
    }
    this._hoverDate = null;
    this._focusDate = null;

    // Presets (resolved ONCE per open at TdDatetimeRange.now(); matched again on every change)
    const list = Array.isArray(this.presets) ? this.presets : [];
    const now = this._now();
    const ctx = { mode, minuteStep: step, ...this._bounds() };
    const results = list.map((preset) => {
      const r = resolvePreset(preset, now, ctx);
      if (!r.ok && r.reason !== 'empty') {
        const pid = preset && typeof preset.id === 'string' ? preset.id : '?';
        this._errorOnce(`preset:${pid}`, `td-datetime-range: preset "${pid}" ${r.reason === 'threw' ? 'threw' : 'returned an invalid range'} — disabled.`, r.error);
      }
      return { preset, ...r };
    });
    this._presetState = { results, matched: null };
    if (results.length) {
      const row = make('div', 'td-dtr-panel__presets', { role: 'group', 'aria-label': L.presets });
      results.forEach((r, i) => {
        const label = r.preset && r.preset.label != null ? String(r.preset.label) : '';
        const b = make('button', 'td-dtr-panel__preset', { type: 'button', 'aria-pressed': 'false', 'data-index': String(i) }, label);
        if (r.preset && typeof r.preset.id === 'string') b.setAttribute('data-id', r.preset.id);
        if (!r.ok) b.setAttribute('aria-disabled', 'true');
        row.appendChild(b);
      });
      row.addEventListener('click', (e) => {
        const b = e.target instanceof Element ? e.target.closest('.td-dtr-panel__preset') : null;
        if (b && row.contains(b)) this._applyPreset(Number(b.getAttribute('data-index')));
      });
      panel.appendChild(row);
    }

    const main = make('div', 'td-dtr-panel__main');
    // "Từ | Đến": which endpoint the next pick edits (every width, both modes)
    const sw = make('div', 'td-dtr-panel__switch', { role: 'group', 'aria-label': L.switcher });
    for (const k of SIDES) {
      const tab = make('button', 'td-dtr-panel__tab', { type: 'button', 'data-side': k, 'aria-pressed': k === 'start' ? 'true' : 'false' });
      tab.appendChild(make('span', 'td-dtr-panel__tab-label', {}, L[k]));
      tab.appendChild(make('span', 'td-dtr-panel__tab-value', {}, L.emptySide));
      tab.addEventListener('click', () => this._onTab(k));
      sw.appendChild(tab);
    }
    main.appendChild(sw);
    this._syncOpenEnd(main);

    // the calendar (the same grid as the picker; the range reads/paints it through `cellState`)
    const labels = normalizeCalendarLabels(L, (key) => this._warnOnce(`labels:${key}`, `td-datetime-range: labels.${key} must be an array of 7 strings — the defaults are used.`));
    const { min, max } = this._dateBounds();
    const today = partsFromDate(now);
    const firstDate = this._draft.date.start || this._draft.date.end || (() => {
      const o = this._openAtParts();
      return { year: o.year, month: o.month, day: o.day };
    })();
    this._grid = new CalendarGrid({
      prefix, labels, root: 'days',
      focus: clampDate(firstDate, min, max),
      selected: this._draft.date.start || this._draft.date.end || null,
      min, max,
      today: { year: today.year, month: today.month, day: today.day },
      cellState: (d) => this._cellState(d),
      onCommit: (level, d) => { if (level === 'day') this._onPick(d); },
      onFocusDate: (d) => { this._focusDate = d; this._refreshCells(); },
      onHoverDate: (d) => { this._hoverDate = d; this._refreshCells(); },
    });
    main.appendChild(this._grid.el);

    if (mode === 'datetime') {
      // the TIME screen (hidden until a day is activated); the "Tiếp: Đến" button sits under it (only while editing Từ)
      this._timeStep = new TimeStep({
        prefix, labels, minuteStep: step, withNow: true, nowLabel: L.now, // the NORMALIZED label table (a malformed weekday array must not reach the time screen)
        onBack: () => this._showSide(this._draft.side, 'date', 'grid'),
        onNow: () => this._nowForSide(),
        onChange: (v) => { // a USER change of a wheel: it edits the time of the active endpoint
          if (!this._draft) return;
          this._draft.time[this._draft.side] = { hour: v.hour, minute: v.minute };
          this._syncUi();
        },
      });
      main.appendChild(this._timeStep.el);
      const next = make('button', 'td-btn td-btn--secondary td-btn--sm td-dtr-panel__next', { type: 'button', 'data-action': 'next' }, L.next);
      next.addEventListener('click', () => this._showSide('end', 'date', 'grid'));
      main.appendChild(next);
    }
    panel.appendChild(main);
    panel.appendChild(make('p', 'td-dtr-panel__hint', { id: `${prefix}-hint` }));
    const err = make('p', 'td-dtr-panel__error', { id: `${prefix}-pair-error`, role: 'alert' });
    err.hidden = true;
    panel.appendChild(err);
    panel.appendChild(make('p', 'td-sr-only td-dtr-panel__status', { role: 'status' }));
    this._tried = false;
    this._syncUi();
    return panel;
  }

  /** @private */
  _now() {
    let d;
    try { d = TdDatetimeRange.now(); } catch { d = null; }
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d : new Date();
  }

  /** @private pending pair (full parts of both endpoints) */
  _pending() {
    return this._draft ? { start: this._partsOf('start'), end: this._partsOf('end') } : null;
  }

  /** @private the date that drives the interval preview: the mouse, else the keyboard focus */
  _previewDate() {
    return this._hoverDate || this._focusDate || null;
  }

  /** @private what a day cell shows (the grid's `cellState` hook) */
  _cellState(d) {
    const L = TdDatetimeRange.labels;
    const f = cellFlags(this._sel(), d, this._previewDate(), this._selCtx());
    let label = '';
    if (f.role === 'start') label = L.rangeStart;
    else if (f.role === 'end') label = L.rangeEnd;
    else if (f.role === 'single') label = L.rangeSingle;
    else if (f.role === 'in') label = L.rangeIn;
    if (f.dimmed) label = fill(L.overLimit, { n: this._maxDays() });
    return { selected: f.role === 'start' || f.role === 'end' || f.role === 'single', role: f.role, preview: f.preview, disabled: f.disabled, dimmed: f.dimmed, label };
  }

  /** @private repaint the cells only (hover / focus preview) */
  _refreshCells() {
    if (this._grid) this._grid.refreshCells();
  }

  /**
   * @private The error line of the pending pair, in this order: an endpoint outside min–max (or unreadable), a required
   * side left empty (only once "Chọn" was tried), the order and `max-days`.
   * @returns {{ side: 'start'|'end', message: string }|null}
   */
  _pairError() {
    if (!this._draft) return null;
    const M = TdDatetimeRange.messages;
    const mode = this._mode();
    const { min, max } = this._dateBounds();
    for (const k of SIDES) {
      const dt = this._draft.date[k];
      if (!dt) continue;
      const e = this._checkParts(this._partsOf(k));
      if (e) {
        // a bound missed only by the TIME of day (same day as the bound) is fixed on the time screen; anything else on the date screen
        const byDate = e.flag === 'badInput' || isDateOutOfRange(dt, min, max);
        return { side: k, message: e.message, step: mode === 'datetime' && !byDate ? 'time' : 'date' };
      }
    }
    const P = this._pending();
    if (this._tried) {
      const req = this._required();
      const miss = SIDES.filter((k) => req.includes(k) && !this._draft.date[k]);
      if (miss.length) return { side: miss[0], message: miss.length === 2 ? M.required : miss[0] === 'start' ? M.requiredStart : M.requiredEnd, step: 'date' };
    }
    if (this._draft.date.start && this._draft.date.end) {
      const msg = this._pairCheck(P.start, P.end);
      if (msg) {
        // order: across days → date screen; the same day (start time after end time) → time screen; max-days → date screen
        const sameDay = compareDates(this._draft.date.start, this._draft.date.end) === 0;
        const order = compareModeParts(P.start, P.end, mode) > 0;
        return { side: 'end', message: msg, step: mode === 'datetime' && order && sameDay ? 'time' : 'date' };
      }
    }
    return null;
  }

  /**
   * @private After any change of the draft: the cells, the tabs (values), the pair error line (+ `aria-describedby` of the tab it
   * is about), the preset `aria-pressed`, the "Không hạn" toggle, the `max-days` hint.
   * @returns {{ side: 'start'|'end', message: string }|null}
   */
  _syncUi() {
    const panel = this._panel || (this._grid && this._grid.el.closest('.td-dtr-panel'));
    const d = this._draft;
    if (!d || !panel) return null;
    if (this._grid) this._grid.refreshCells();
    const err = this._pairError();
    const line = panel.querySelector('.td-dtr-panel__error');
    if (line) {
      if (err) {
        if (line.textContent !== err.message) line.textContent = err.message;
        line.hidden = false;
      } else {
        line.hidden = true;
        line.textContent = '';
      }
    }
    for (const tab of panel.querySelectorAll('.td-dtr-panel__tab')) {
      const k = tab.getAttribute('data-side');
      const v = tab.querySelector('.td-dtr-panel__tab-value');
      const t = this._pendingText(k);
      if (v && v.textContent !== t) v.textContent = t;
      tab.setAttribute('aria-pressed', k === d.side ? 'true' : 'false');
      if (err && err.side === k && line) tab.setAttribute('aria-describedby', line.id);
      else tab.removeAttribute('aria-describedby');
    }
    panel.setAttribute('data-side', d.side);
    panel.setAttribute('data-step', d.step);
    this._syncFooter();
    // presets: pressed = the pending pair equals its resolved range
    const st = this._presetState;
    if (st) {
      const P = this._pending();
      const mode = this._mode();
      st.matched = null;
      st.results.forEach((r, i) => {
        const on = r.ok && st.matched === null && sameRange(P, r, mode);
        if (on) st.matched = r.preset && typeof r.preset.id === 'string' ? r.preset.id : String(i);
        const b = panel.querySelector(`.td-dtr-panel__preset[data-index="${i}"]`);
        if (b) b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    }
    // v0.59.0: the "Không hạn" toggle is pressed while the end being edited is empty
    const open = panel.querySelector('.td-dtr-panel__open-end');
    if (open) open.setAttribute('aria-pressed', d.date.end ? 'false' : 'true');
    this._syncHint(panel);
    return err;
  }

  /** @private the visible "Tối đa N ngày" note: date mode, `max-days`, while the end is being chosen after a start */
  _syncHint(panel) {
    const hint = (panel || this._panel).querySelector('.td-dtr-panel__hint');
    if (!hint) return;
    const n = this._maxDays();
    const on = !!this._draft && this._mode() === 'date' && n != null && this._draft.side === 'end' && !!this._draft.date.start;
    hint.hidden = !on;
    const text = on ? fill(TdDatetimeRange.labels.maxDaysNote, { n }) : '';
    if (hint.textContent !== text) hint.textContent = text;
  }

  /** @private announce through the dialog's `role=status` */
  _announce(text) {
    const status = this._panel && this._panel.querySelector('.td-dtr-panel__status');
    if (status) status.textContent = text;
  }

  /**
   * @private v0.59.0 (plan QĐ E2 / E2b): the "Không hạn" toggle — created next to the "Từ | Đến" switch when `allow-open-end` is
   * set, removed otherwise (a focused button hands the focus to the calendar first). Its `aria-pressed` is DERIVED from the
   * pending end (empty = pressed) in _syncUi(). `root` = the panel or its `.td-dtr-panel__main`.
   */
  _syncOpenEnd(root) {
    const main = root.matches('.td-dtr-panel__main') ? root : root.querySelector('.td-dtr-panel__main');
    if (!main) return;
    let btn = main.querySelector(':scope > .td-dtr-panel__open-end');
    if (!this.hasAttribute('allow-open-end')) {
      if (!btn) return;
      if (btn === document.activeElement) { // hand the focus to the control that is on screen: the hour wheel (time screen) or the calendar
        const wheel = this._draft && this._draft.step === 'time' && this._timeStep ? this._timeStep.el.querySelector('.td-dtp-wheel__list[data-part="hour"]') : null;
        if (wheel) wheel.focus({ preventScroll: true });
        else if (this._grid) this._grid.focusActive();
      }
      btn.remove();
      return;
    }
    if (btn) return;
    btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'td-dtr-panel__preset td-dtr-panel__open-end';
    btn.setAttribute('aria-pressed', 'false');
    btn.textContent = TdDatetimeRange.labels.openEnd;
    btn.addEventListener('click', () => this._toggleOpenEnd());
    main.querySelector(':scope > .td-dtr-panel__switch').after(btn);
  }

  /** @private "Không hạn": empty the end being edited and edit it next; already empty → the calendar (to pick a date) */
  _toggleOpenEnd() {
    const d = this._draft;
    if (!d) return;
    if (!d.date.end) { this._showSide('end', 'date', 'grid'); return; }
    d.date.end = null;
    d.time.end = this._defaultTime('end');
    // datetime: the range is now confirmable from the time screen of Từ (when Từ has a date); date mode: edit the end
    if (this._mode() === 'datetime') this._showSide('start', d.date.start ? 'time' : 'date', d.date.start ? 'hour' : 'grid');
    else this._showSide('end', 'date', 'grid');
  }

  /** @private one pending side as display text ('—' when empty / not valid yet; v0.59.0 "Không hạn" for an open end) */
  _pendingText(side) {
    const L = TdDatetimeRange.labels;
    const d = this._draft && this._draft.date[side];
    if (side === 'end' && this.hasAttribute('allow-open-end') && !d) return L.openEnd;
    if (!d) return L.emptySide;
    const p = this._partsOf(side);
    if (invalidReason(p)) return L.emptySide;
    return formatModeDisplay(toModeParts(p, this._mode()), this._mode());
  }

  /**
   * @private a pick at the root (days) view of the grid. mode date: the alternating Từ / Đến machine (range-selection); mode
   * datetime: the date of the active endpoint only (its time is kept) and then the TIME screen of that endpoint.
   */
  _onPick(d) {
    const dr = this._draft;
    if (!dr) return;
    const L = TdDatetimeRange.labels;
    const mode = this._mode();
    const res = pickDay(this._sel(), d, this._selCtx());
    if (res.kind === 'ignored') return;
    dr.date.start = res.state.start;
    dr.date.end = res.state.end;
    dr.side = res.state.side;
    if (mode === 'datetime') { // a day does NOT commit: it opens the time screen of the endpoint
      this._showSide(dr.side, 'time', 'hour');
      return;
    }
    this._grid.setSelected(dr.date[dr.side]); // month / year views read the grid's own selection: follow the active endpoint (no reveal)
    this._syncUi();
    const n = this._maxDays();
    const note = n != null ? ` ${fill(L.maxDaysNote, { n })}.` : '';
    if (res.kind === 'start') this._announce(fill(L.startChosen, { date: this._dayText(d) }) + note);
    else if (res.kind === 'restart') this._announce(fill(L.restarted, { date: this._dayText(d) }) + note);
    else if (dr.date.start) this._announce(fill(L.rangeChosen, { range: `${this._dayText(dr.date.start)} – ${this._dayText(d)}`, n: rangeDays(dr.date.start, d) }));
    else this._announce(fill(L.endChosen, { date: this._dayText(d) }));
  }

  /** @private a tab "Từ" / "Đến": the screen KIND is kept when the target endpoint has a date (datetime), else its date screen */
  _onTab(k) {
    const dr = this._draft;
    if (!dr) return;
    const time = this._mode() === 'datetime' && dr.step === 'time' && !!dr.date[k];
    this._showSide(k, time ? 'time' : 'date', time ? 'hour' : 'grid');
  }

  /**
   * @private Change the endpoint being edited and/or the screen (datetime). Never commits, never fires `change`. The ONLY place that
   * switches the screens, and the only caller of the TimeStep. `step`: 'date' | 'time' (a date range is always 'date'; 'time'
   * needs a date on `side`). `focus`: 'grid' (the calendar) | 'hour' (the hour wheel) | 'preserve' | 'error' (validation: the
   * tab carrying the error, the wheels still centred) | false.
   */
  _showSide(side, step, focus) {
    const dr = this._draft;
    const panel = this._panel;
    if (!dr || !panel || !this._grid) return;
    const L = TdDatetimeRange.labels;
    const date = dr.date[side];
    const time = this._mode() === 'datetime' && step === 'time' && !!date;
    dr.side = side;
    dr.step = time ? 'time' : 'date';
    this._grid.setSelected(date, { reveal: !!date }); // the endpoint's day is shown when it has one; an empty one moves nothing
    if (time) {
      this._grid.el.hidden = true;
      this._timeStep.show({
        dateLabel: this._timeStep.headingFor(date, L[side]),
        hour: dr.time[side].hour,
        minute: dr.time[side].minute,
        focus: focus === 'preserve' ? 'preserve' : focus === 'error' || focus === false || focus === 'grid' ? 'none' : 'hour',
      });
    } else {
      if (this._timeStep) this._timeStep.hide();
      this._grid.el.hidden = false;
    }
    this._syncUi();
    this._announce(time
      ? fill(L.timeFor, { date: `${L[side]} ${this._dayText(date)}` })
      : fill(L.editing, { side: L[side] }));
    if (focus === 'error') {
      const tab = panel.querySelector(`.td-dtr-panel__tab[data-side="${side}"]`);
      if (tab) tab.focus();
    } else if (!time && focus === 'grid') this._grid.focusActive();
  }

  /** @private "Bây giờ" of the time screen: THIS endpoint becomes now (snapped; outside min–max the draft is kept and the error shows) */
  _nowForSide() {
    const dr = this._draft;
    if (!dr) return;
    const now = partsFromDate(this._now());
    const k = dr.side;
    dr.date[k] = { year: now.year, month: now.month, day: now.day };
    dr.time[k] = { hour: now.hour, minute: snapMinuteDown(now.minute, this._minuteStep()) };
    this._showSide(k, 'time', 'preserve');
  }

  /** @private a preset fills BOTH sides (the dialog stays open — "Chọn" commits) */
  _applyPreset(i) {
    const st = this._presetState;
    const r = st && st.results[i];
    const dr = this._draft;
    if (!r || !r.ok || !dr) return;
    const mode = this._mode();
    for (const k of SIDES) {
      const p = r[k];
      dr.date[k] = { year: p.year, month: p.month, day: p.day };
      if (mode === 'datetime') dr.time[k] = { hour: p.hour, minute: p.minute };
    }
    // datetime: the time screen of Từ (adjust the time / "Tiếp: Đến" / "Chọn"); date: the calendar shows the range
    this._showSide('start', mode === 'datetime' ? 'time' : 'date', mode === 'datetime' ? 'hour' : false);
    const range = `${formatModeDisplay(r.start, mode)} – ${formatModeDisplay(r.end, mode)}`;
    this._announce(fill(TdDatetimeRange.labels.presetChosen, { label: r.preset.label != null ? String(r.preset.label) : '', range }));
  }

  /** @private "Xoá": both sides empty (stays open); the date screen, where an EMPTY draft can be confirmed ("Chọn" = remove the filter) */
  _clearPending() {
    const dr = this._draft;
    if (!dr) return;
    for (const k of SIDES) { dr.date[k] = null; dr.time[k] = this._defaultTime(k); }
    this._tried = false;
    this._showSide('start', 'date', false);
  }

  /**
   * @private "Chọn": validate both sides + the pair, then commit (one `change`). A rejected confirm returns false, leaves the
   * dialog open and moves to the field that is wrong: `_showSide(side, 'date' | 'time', 'error')`.
   * @returns {boolean}
   */
  _confirm() {
    if (!this._draft || !this._panel) return false;
    this._tried = true;
    const err = this._syncUi();
    if (err) {
      this._showSide(err.side, err.step, 'error');
      return false;
    }
    const mode = this._mode();
    const preset = this._presetState ? this._presetState.matched : null;
    const out = {};
    for (const k of SIDES) out[k] = this._draft.date[k] ? toModeParts(this._partsOf(k), mode) : null;
    const disp = (q) => (q ? formatModeDisplay(q, mode) : '');
    const db = (q) => (q ? formatModeDb(q, mode) : '');
    // v0.63.0: through the one write path (`editable`: a typed error goes)
    this._write({ start: disp(out.start) || null, end: disp(out.end) || null }, {
      change: {
        value: { start: disp(out.start), end: disp(out.end) },
        dbValue: { start: db(out.start), end: db(out.end) },
        preset,
      },
    });
    return true;
  }

  // --- Public API ---

  /** `{ start, end }` in the display format of the mode; '' for an empty / malformed / out-of-range side. */
  getValue() {
    const v = (k) => {
      const s = this._side(k);
      return s.usable && !s.error ? formatModeDisplay(s.parts, this._mode()) : '';
    };
    return { start: v('start'), end: v('end') };
  }

  /** `{ start, end }` in the DB format of the mode ('' like getValue()). */
  getDBValue() {
    const v = (k) => {
      const s = this._side(k);
      return s.usable && !s.error ? formatModeDb(s.parts, this._mode()) : '';
    };
    return { start: v('start'), end: v('end') };
  }

  /**
   * Set both sides from the display (or ISO) format of the mode, silently; a missing / '' / null side is cleared;
   * `setValue(null)` clears both. A malformed string is kept and flagged (badInput) like the single picker.
   * @param {{ start?: string|null, end?: string|null }|null} v
   */
  setValue(v) {
    const o = v && typeof v === 'object' ? v : {};
    for (const k of SIDES) {
      const x = o[k];
      if (x == null || x === '') this.removeAttribute(k);
      else this.setAttribute(k, String(x));
    }
    this._dropTypedError(); // v0.63.0 D3 (also when no attribute changed)
    if (this._initialized) {
      this._updateValueText();
      this._syncForm();
    }
  }

  /**
   * Set both sides from the DB format of the mode (`yyyy-mm-dd` | `yyyy-mm-dd hh:mm[:ss]`; ISO accepted), silently.
   * A missing / '' / null side is cleared; a malformed non-empty side → the whole call is ignored.
   * @param {{ start?: string|null, end?: string|null }|null} v
   */
  setDBValue(v) {
    const o = v && typeof v === 'object' ? v : {};
    const mode = this._mode();
    const next = {};
    for (const k of SIDES) {
      const x = o[k];
      if (x == null || x === '') { next[k] = null; continue; }
      const p = parseModeDb(String(x), mode);
      if (!p || invalidReason(p)) return;
      next[k] = formatModeDisplay(p, mode);
    }
    this.setValue(next);
  }

  // --- SSR (contract datetime-range@1, plan QĐ 26) ---

  /**
   * Marker `datetime-range@1` + EXACTLY the skeleton php td_datetime_range() prints (the div, the label, the two native
   * inputs of the mode with the resolved names / min / max / disabled / per-side required, the trigger as their SIBLING,
   * an optional error note) → adopt in place: state first (early property > live native value > attribute), then the
   * host's FormData, then the natives go. Anything else → safe render now + the live values of the natives (only when
   * each side has exactly one candidate) + the focus on the trigger. The shared TdFormElement gate is NOT used (it
   * allows one control) and stays unchanged.
   * @returns {boolean}
   */
  canHydrate() {
    const m = ssrMarker(this);
    if (!m || m.name !== 'datetime-range') return false;
    this.removeAttribute('data-td-ssr'); // consumed (this element is not `hydratable`: a re-connect renders again)
    this._ssrDefaults = { start: this.getAttribute('start'), end: this.getAttribute('end') };
    const gate = m.schema === 1 ? this._ssrGate() : null;
    if (gate) {
      this._ssrAdopt = gate;
      return true;
    }
    const mode = this._mode();
    const live = {};
    for (const k of SIDES) {
      if (this._earlyProps && this._earlyProps.has(k)) continue;
      const c = this.querySelectorAll(`input[data-part="${k}"]`);
      if (c.length !== 1) continue;
      const v = c[0].value;
      if (v === '') live[k] = '';
      else {
        const p = fromNativeValue(v, mode);
        if (p) live[k] = formatModeDisplay(p, mode);
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
    const dflt = (input) => {
      const p = fromNativeValue(input.getAttribute('value'), mode);
      return p ? formatModeDisplay(p, mode) : null;
    };
    this._ssrDefaults = { start: dflt(g.inputs[0]), end: dflt(g.inputs[1]) };
    const active = this.ownerDocument.activeElement;
    const hadFocus = g.inputs.includes(active);
    // (1) state: early property > the LIVE native value > attribute
    g.inputs.forEach((input, i) => {
      const k = SIDES[i];
      if (this._earlyProps && this._earlyProps.has(k)) return;
      const v = input.value;
      const p = v === '' ? null : fromNativeValue(v, mode);
      if (v === '') this.removeAttribute(k);
      else if (p) this.setAttribute(k, formatModeDisplay(p, mode));
    });
    this._errorNote = g.note;
    // (2) the host's FormData FIRST…
    this._updateValueText();
    this._syncForm();
    // (3) …then the no-JS natives lose every form attribute and go (FormData holds ONE set of entries)
    for (const input of g.inputs) for (const a of ['name', 'value', 'required', 'min', 'max']) input.removeAttribute(a);
    g.natives.remove();
    // (4) a native input had the focus → the trigger
    if (hadFocus) g.trigger.focus({ preventScroll: true });
  }

  /** @protected refused markup was replaced: the live native values (when unambiguous) + the focus */
  _restoreSsrState(s) {
    if (s.live) {
      for (const k of SIDES) {
        if (!(k in s.live)) continue;
        if (s.live[k] === '') this.removeAttribute(k);
        else this.setAttribute(k, s.live[k]);
      }
      this._updateValueText();
      this._syncForm();
    }
    if (s.refocus) this._focusTarget()?.focus({ preventScroll: true }); // v0.63.0 `editable`: the start input
  }

  /**
   * @private The strict gate. Returns the parts to adopt, or null.
   * @returns {{ natives: HTMLElement, inputs: HTMLInputElement[], trigger: HTMLElement, note: HTMLElement|null }|null}
   */
  _ssrGate() {
    const nodes = this._ssrWithoutHelperNote(ssrContentNodes(this)); // v0.54.0: minus the PHP helper note
    if (!nodes || !nodes.length || nodes.some((n) => n.nodeType !== 1) || nodes.length > 2) return null;
    const [box, note = null] = nodes;
    const msg = this.errorMessage;
    if (note) {
      if (!msg || !ssrIsErrorNote(note) || note.id !== `${this.id}-error` || note.getAttribute('data-for') !== this.id
        || note.textContent !== msg) return null;
    } else if (msg) return null;
    const tpl = document.createElement('template');
    this._ssrRender = true;
    try {
      tpl.innerHTML = this.render();
    } finally {
      this._ssrRender = false;
    }
    const wantBox = tpl.content.firstElementChild;
    if (!wantBox || box.localName !== 'div' || box.namespaceURI !== wantBox.namespaceURI || !ssrSameAttrs(box, wantBox)) return null;
    const have = ssrContentNodes(box);
    const want = [...wantBox.children];
    if (have.some((n) => n.nodeType !== 1) || have.length !== want.length + 1) return null;
    const withLabel = want.length === 2;
    if (withLabel && !ssrSamePart(have[0], want[0])) return null;
    const natives = have[withLabel ? 1 : 0];
    const trigger = have[have.length - 1];
    if (!this._ssrTriggerOk(trigger, want[want.length - 1])) return null;
    const inputs = this._ssrNativesOk(natives);
    if (!inputs) return null;
    const controls = [...this.querySelectorAll(FORM_ASSOCIATED)];
    if (controls.length !== 3 || controls[0] !== inputs[0] || controls[1] !== inputs[1] || controls[2] !== trigger) return null;
    return { natives, inputs, trigger, note };
  }

  /** @private the trigger = render()'s attributes; value span (class + data-placeholder, text only) + the empty icon slot */
  _ssrTriggerOk(live, want) {
    if (live.localName !== 'button' || !ssrSameAttrs(live, want)) return false;
    const kids = ssrContentNodes(live);
    if (kids.length !== 2 || kids.some((n) => n.nodeType !== 1)) return false;
    const [value, icon] = kids;
    if (value.localName !== 'span' || value.className !== 'td-dtr__value' || value.children.length
      || ![...value.attributes].every((a) => a.name === 'class' || (a.name === 'data-placeholder' && a.value === ''))) return false;
    // the icon slot must be EMPTY (ssrSamePart would skip its content; fillIconSlots draws it after adoption)
    return ssrSameAttrs(icon, want.children[1]) && icon.localName === 'span' && ssrContentNodes(icon).length === 0;
  }

  /** @private the no-JS block = php's exactly (an input's `value` may be any valid native value); [start, end] or null */
  _ssrNativesOk(live) {
    const want = this._nativesTemplate();
    if (live.localName !== 'div' || !ssrSameAttrs(live, want)) return null;
    const have = ssrContentNodes(live);
    const need = [...want.children];
    if (have.length !== 4 || have.some((n) => n.nodeType !== 1)) return null;
    const mode = this._mode();
    for (let i = 0; i < 4; i++) {
      const h = have[i];
      const w = need[i];
      if (h.localName !== w.localName || h.namespaceURI !== w.namespaceURI) return null;
      if (w.localName === 'label') {
        if (!ssrSamePart(h, w)) return null;
        continue;
      }
      if (h.children.length) return null;
      const attrs = [...h.attributes].filter((a) => a.name !== 'value');
      if (attrs.length !== w.attributes.length) return null;
      if (!attrs.every((a) => w.hasAttribute(a.name) && (a.name === 'class'
        ? [...h.classList].sort().join(' ') === [...w.classList].sort().join(' ') : a.value === w.getAttribute(a.name)))) return null;
      const v = h.getAttribute('value');
      if (v != null && v !== '' && !fromNativeValue(v, mode)) return null;
    }
    return [have[1], have[3]];
  }

  /** @private the expected no-JS block (php td_datetime_range), without `value` */
  _nativesTemplate() {
    const L = TdDatetimeRange.labels;
    const mode = this._mode();
    const id = this.id;
    const label = this.getAttribute('label') || '';
    const req = this._required();
    const { min, max } = this._bounds();
    const names = this._names();
    const err = this.errorMessage;
    const div = document.createElement('div');
    div.className = 'td-dtr__natives';
    div.setAttribute('role', 'group');
    if (label) div.setAttribute('aria-labelledby', `${id}-label`);
    SIDES.forEach((k, i) => {
      const lab = document.createElement('label');
      lab.className = 'td-dtr__native-label';
      lab.setAttribute('for', `${id}-${k}`);
      lab.textContent = L[k];
      const input = document.createElement('input');
      input.className = 'td-dtr__native';
      input.setAttribute('type', mode === 'datetime' ? 'datetime-local' : 'date');
      input.setAttribute('id', `${id}-${k}`);
      input.setAttribute('data-part', k);
      if (names[i]) input.setAttribute('name', names[i]);
      if (min) input.setAttribute('min', toNativeValue(min, mode));
      if (max) input.setAttribute('max', toNativeValue(max, mode));
      if (req.includes(k)) input.setAttribute('required', '');
      if (this.hasAttribute('disabled')) input.setAttribute('disabled', '');
      if (err) {
        input.setAttribute('aria-invalid', 'true');
        input.setAttribute('aria-describedby', `${id}-error`);
      }
      // v0.54.0: php td_datetime_range describes the natives with the helper note (no error)
      else if (this.helperMessage) input.setAttribute('aria-describedby', `${id}-note`);
      div.append(lab, input);
    });
    return div;
  }

  // --- helpers ---

  /** @private */
  _warnOnce(key, msg) {
    if (this._warned.has(key)) return;
    this._warned.add(key);
    console.warn(msg);
  }

  /** @private */
  _errorOnce(key, msg, error) {
    if (this._warned.has(key)) return;
    this._warned.add(key);
    if (error !== undefined) console.error(msg, error);
    else console.error(msg);
  }
}

if (!customElements.get('td-datetime-range')) {
  customElements.define('td-datetime-range', TdDatetimeRange);
}
