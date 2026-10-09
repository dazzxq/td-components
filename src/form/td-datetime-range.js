import { TdFormElement, ssrContentNodes, ssrSameAttrs, ssrSamePart, ssrIsErrorNote } from '../base/td-form-element.js';
import { ssrMarker } from '../base/td-base-element.js';
import { ValueTitleWatcher, displayedValueText } from '../utils/value-title.js';
import { TdModal } from '../feedback/td-modal.js';
import { fillIconSlots } from '../icons/td-icon.js';
import { CalendarGrid } from './calendar-grid.js';
import { TimeWheels } from './time-wheels.js';
import { freshCalendarLabels, normalizeCalendarLabels } from './calendar-labels.js';
import { clampDate } from '../utils/calendar-model.js';
import { pickDay, cellFlags, rangeDays } from '../utils/range-selection.js';
import {
  parseBound, invalidReason, normalizeMinuteStep, snapMinuteDown, partsFromDate, toModeParts, parseModeValue,
  parseModeDb, formatModeDisplay, formatModeDb, formatModeIso, compareModeParts, MODE_PARTS, toNativeValue, fromNativeValue,
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
 * `<td-datetime-range>` — a date (or date-time) RANGE "from – to" with quick presets (v0.40.0, plan
 * v0.39.0-filters-range QĐ 17–26). A separate element, not a `range` flag on `<td-datetime-picker>`: the value is a
 * pair (`getValue()` → `{ start, end }`), the form gets TWO entries, and the single picker stays untouched. Until v0.59.0 both
 * shared the one-moment editor of src/form/datetime-panel.js; since v0.60.0 the picker has the calendar and ONLY this element
 * still uses that (frozen, legacy) editor — one per side — until it gets the calendar too in v0.61.0.
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
 *     div.td-dtr-panel__switch[role=group] > button.td-dtr-panel__tab[aria-pressed][data-side] × 2   (shown < 720)
 *     div.td-dtr-panel__sides > fieldset.td-dtr-panel__side[data-side] (legend "Từ" / "Đến" + one editor) × 2
 *     p.td-dtr-panel__error[role=alert]  (order / span / a required side; described-by of the target day field)
 *     p.td-sr-only[role=status]          (preset announcements)
 *   Footer: "Đóng" / "Xoá" (both sides, stays open) / "Chọn" (one `change`).
 *
 * Form (ElementInternals): `setFormValue(FormData)` with TWO entries `{start-name | name[start]}` and
 * `{end-name | name[end]}` (an empty side = ''), formatted by `form-value-format`; state = JSON `{"v":1,"start","end"}`.
 * Validity: valueMissing (sides of `required` — requiredParts), badInput, rangeUnderflow / rangeOverflow (min / max),
 * customError (order start ≤ end, `max-days`).
 *
 * SSR (`datetime-range@1`, php td_datetime_range): two native inputs + the trigger; adopted through the component's
 * OWN gate (the shared TdFormElement gate allows exactly one control and stays unchanged) — see `canHydrate()`.
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
 * @fires change - "Chọn" committed: detail { value: { start, end }, dbValue: { start, end }, preset: id | null }
 */
export class TdDatetimeRange extends TdFormElement {
  static get observedAttributes() {
    return [...super.observedAttributes, 'mode', 'start', 'end', 'start-name', 'end-name', 'label', 'placeholder', 'min', 'max',
      'max-days', 'minute-step', 'form-value-format', 'open-at', 'error-text', 'aria-label', 'allow-open-end'];
  }

  /** `required` carries a value (start | end | both), so it is not a boolean attribute here. */
  static get booleanAttributes() { return ['disabled', 'allow-open-end']; }

  static get errorContract() { return true; }

  /** UI strings (Vietnamese); override per site. php/td.php Td::RANGE_LABELS mirrors the SSR ones. */
  static labels = {
    title: 'Chọn khoảng ngày', titleDatetime: 'Chọn khoảng ngày giờ',
    placeholder: 'dd/mm/yyyy – dd/mm/yyyy', placeholderDatetime: 'dd/mm/yyyy hh:mm – dd/mm/yyyy hh:mm',
    start: 'Từ', end: 'Đến', fromPrefix: 'Từ', toPrefix: 'Đến', presets: 'Chọn nhanh', switcher: 'Mốc đang sửa',
    next: 'Tiếp: Đến', emptySide: '—', date: 'Ngày', day: 'Ngày', month: 'Tháng', year: 'Năm', time: 'Giờ',
    hour: 'Giờ', minute: 'Phút', close: 'Đóng', clear: 'Xoá', confirm: 'Chọn', presetChosen: 'Đã chọn {label}: {range}',
    openEnd: 'Không hạn', // v0.59.0 `allow-open-end`
    // v0.61.0 (calendar): cell suffixes, the max-days note, the `role=status` announcements. `date` / `day` / `month` / `year`
    // above are no longer used by the dialog (kept so a site's override does not break).
    rangeStart: 'ngày bắt đầu', rangeEnd: 'ngày kết thúc', rangeSingle: 'ngày bắt đầu và kết thúc', rangeIn: 'trong khoảng',
    overLimit: 'quá {n} ngày — bấm để bắt đầu khoảng mới', maxDaysNote: 'Tối đa {n} ngày',
    startChosen: 'Đã chọn ngày bắt đầu {date}. Chọn ngày kết thúc.', endChosen: 'Đã chọn ngày kết thúc {date}.',
    rangeChosen: 'Đã chọn khoảng {range}, {n} ngày.', restarted: 'Bắt đầu khoảng mới từ {date}. Chọn ngày kết thúc.',
    sideChosen: '{side}: {date}', editing: 'Đang sửa {side}',
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
    this._wheels = null;
    /** @private instance presets (null = TdDatetimeRange.presets) */
    this._presets = null;
    this._warned = new Set();
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
      const message = reason === 'year' ? fill(M.year, years) : M[reason];
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

  afterRender() {
    fillIconSlots(this);
    const trigger = this._trigger();
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
        this._rerender();
        return;
      default: // label
        this._rerender();
    }
  }

  /** @private structural change: close an open dialog, render again, keep the focus on the trigger */
  _rerender() {
    const active = document.activeElement;
    const modalRoot = this._modalId ? document.getElementById(this._modalId) : null;
    const hadFocus = this.contains(active) || !!(modalRoot && modalRoot.contains(active));
    if (this._isOpen) this._close();
    this._doRender();
    if (hadFocus && this._trigger()) this._trigger().focus();
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
      if (next !== raw) this.setAttribute(k, next);
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
    if (this._effectiveDisabled && this._isOpen) this._close();
  }

  /** @private aria-required + the decorative asterisk follow `required` in place (same markup as render()) */
  _applyRequired() {
    const required = this._required().length > 0;
    const trigger = this._trigger();
    if (trigger) {
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
    this._applyAccessibleName(this._trigger(), !!this.getAttribute('label'));
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
    else this._setValidity({});
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

  _focusTarget() { return this._trigger(); }

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
    if (document.activeElement !== trigger) trigger.focus({ preventScroll: true });
    const L = TdDatetimeRange.labels;
    this._isOpen = true;
    const panel = this._buildPanel();
    this._panel = panel;
    const mode = this._mode();
    this._modalId = TdModal.show({
      themeRoot: this, // v0.42.0 (ADR 0020): the range dialog follows the host's theme scope
      title: this._text(L, 'title'),
      body: panel,
      size: mode === 'datetime' ? 'lg' : 'md',
      escapeCloses: true,
      focusTarget: panel.querySelector('.td-cal__day[tabindex="0"]'), // v0.61.0: the active cell of the calendar
      actions: [
        { label: L.close, variant: 'secondary', value: 'close' },
        { label: L.clear, variant: 'secondary', close: false, onClick: () => { this._clearPending(); } },
        { label: L.confirm, variant: 'primary', value: 'confirm', onClick: () => this._confirm() },
      ],
      onClose: () => this._onDialogClosed(panel),
    });
    trigger.setAttribute('aria-expanded', 'true');
    trigger.setAttribute('aria-controls', this._modalId);
    const box = this.querySelector('.td-dtr');
    if (box) box.setAttribute('data-state', 'open');
    // the wheels are centred at once (no opening scroll), after the dialog is laid out
    if (this._wheels) requestAnimationFrame(() => { if (this._wheels) this._wheels.centre(); });
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
    if (this._wheels) this._wheels.destroy();
    this._grid = null;
    this._wheels = null;
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
   * @private Pending parts of one side when the dialog opens: the committed parts (time clamped, minute snapped down);
   * an empty / unreadable side opens EMPTY — or at `open-at` when that attribute is set (start 00:00, end the last slot).
   */
  _initialSide(side) {
    const mode = this._mode();
    const step = this._minuteStep();
    const s = this._side(side);
    let p = null;
    if (s.parts) {
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
    const panel = make('div', 'td-dtr-panel', { 'data-mode': mode, 'data-side': 'start' });
    this._prefix = prefix;

    // the draft (init): two complete endpoints + the side being edited
    const init = {};
    for (const k of SIDES) init[k] = this._initialSide(k);
    this._draft = {
      date: {}, time: {}, side: 'start',
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
      tab.addEventListener('click', () => this._showSide(k, 'grid'));
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
      const t = this._draft.time.start;
      this._wheels = new TimeWheels({
        prefix, labels: L, minuteStep: step, hour: t.hour, minute: t.minute,
        onChange: (v) => { // a USER change of a wheel: it edits the time of the active endpoint
          if (!this._draft) return;
          this._draft.time[this._draft.side] = { hour: v.hour, minute: v.minute };
          this._syncUi();
        },
      });
      main.appendChild(this._wheels.el);
      const next = make('button', 'td-btn td-btn--secondary td-btn--sm td-dtr-panel__next', { type: 'button' }, L.next);
      next.addEventListener('click', () => this._showSide('end', 'grid'));
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
    for (const k of SIDES) {
      if (!this._draft.date[k]) continue;
      const e = this._checkParts(this._partsOf(k));
      if (e) return { side: k, message: e.message };
    }
    const P = this._pending();
    if (this._tried) {
      const req = this._required();
      const miss = SIDES.filter((k) => req.includes(k) && !this._draft.date[k]);
      if (miss.length) return { side: miss[0], message: miss.length === 2 ? M.required : miss[0] === 'start' ? M.requiredStart : M.requiredEnd };
    }
    if (this._draft.date.start && this._draft.date.end) {
      const msg = this._pairCheck(P.start, P.end);
      if (msg) return { side: 'end', message: msg };
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
      if (btn === document.activeElement && this._grid) this._grid.focusActive();
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
    if (!d.date.end) { this._showSide('end', 'grid'); return; }
    d.date.end = null;
    d.time.end = this._defaultTime('end');
    this._showSide('end', 'grid');
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
   * datetime: the date of the active endpoint only (its time is kept).
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
    this._grid.setSelected(dr.date[dr.side]); // month / year views read the grid's own selection: follow the active endpoint (no reveal)
    this._syncUi();
    const n = this._maxDays();
    const note = mode === 'date' && n != null ? ` ${fill(L.maxDaysNote, { n })}.` : '';
    if (mode === 'datetime') {
      const side = res.kind;
      this._announce(fill(L.sideChosen, { side: L[side], date: this._dayText(d) }));
    } else if (res.kind === 'start') this._announce(fill(L.startChosen, { date: this._dayText(d) }) + note);
    else if (res.kind === 'restart') this._announce(fill(L.restarted, { date: this._dayText(d) }) + note);
    else if (dr.date.start) this._announce(fill(L.rangeChosen, { range: `${this._dayText(dr.date.start)} – ${this._dayText(d)}`, n: rangeDays(dr.date.start, d) }));
    else this._announce(fill(L.endChosen, { date: this._dayText(d) }));
  }

  /**
   * @private Change the endpoint being edited (tab, "Tiếp: Đến", "Không hạn", a rejected "Chọn"). Never commits, never fires
   * `change`. `focus`: 'grid' (tab / "Tiếp": the calendar) | 'error' (validation: the tab carrying the error) | false.
   */
  _showSide(side, focus) {
    const dr = this._draft;
    const panel = this._panel;
    if (!dr || !panel || !this._grid) return;
    dr.side = side;
    const date = dr.date[side];
    this._grid.setSelected(date, { reveal: !!date }); // the endpoint's date is shown when it has one; an empty one moves nothing
    if (this._wheels) this._wheels.setTime(dr.time[side].hour, dr.time[side].minute, { smooth: false });
    this._syncUi();
    this._announce(fill(TdDatetimeRange.labels.editing, { side: TdDatetimeRange.labels[side] }));
    if (focus === 'grid') this._grid.focusActive();
    else if (focus === 'error') {
      const tab = panel.querySelector(`.td-dtr-panel__tab[data-side="${side}"]`);
      if (tab) tab.focus();
    }
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
    dr.side = 'start';
    this._grid.setSelected(dr.date.start, { reveal: true });
    if (this._wheels) this._wheels.setTime(dr.time.start.hour, dr.time.start.minute, { smooth: false });
    this._syncUi();
    const range = `${formatModeDisplay(r.start, mode)} – ${formatModeDisplay(r.end, mode)}`;
    this._announce(fill(TdDatetimeRange.labels.presetChosen, { label: r.preset.label != null ? String(r.preset.label) : '', range }));
  }

  /** @private "Xoá": both sides empty (stays open) */
  _clearPending() {
    const dr = this._draft;
    if (!dr) return;
    for (const k of SIDES) { dr.date[k] = null; dr.time[k] = this._defaultTime(k); }
    dr.side = 'start';
    this._tried = false;
    this._grid.setSelected(null);
    if (this._wheels) this._wheels.setTime(dr.time.start.hour, dr.time.start.minute, { smooth: false });
    this._syncUi();
  }

  /** @private "Chọn": validate both sides + the pair, then commit (one `change`); false keeps the dialog open */
  _confirm() {
    if (!this._draft || !this._panel) return false;
    this._tried = true;
    const err = this._syncUi();
    if (err) {
      this._showSide(err.side, 'error');
      return false;
    }
    const mode = this._mode();
    const preset = this._presetState ? this._presetState.matched : null;
    const out = {};
    for (const k of SIDES) {
      if (!this._draft.date[k]) {
        this.removeAttribute(k);
        out[k] = null;
      } else {
        const q = toModeParts(this._partsOf(k), mode);
        this.setAttribute(k, formatModeDisplay(q, mode));
        out[k] = q;
      }
    }
    this._updateValueText();
    this._syncForm();
    const disp = (q) => (q ? formatModeDisplay(q, mode) : '');
    const db = (q) => (q ? formatModeDb(q, mode) : '');
    this.emit('change', {
      value: { start: disp(out.start), end: disp(out.end) },
      dbValue: { start: db(out.start), end: db(out.end) },
      preset,
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
    if (s.refocus) this._trigger()?.focus({ preventScroll: true });
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
