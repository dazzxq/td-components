import { fillIconSlots } from '../icons/td-icon.js';
import { weekdayOf } from '../utils/calendar-model.js';
import { TimeWheels } from './time-wheels.js';

/**
 * INTERNAL (not exported from the package): the TIME screen of the datetime dialogs — shared by <td-datetime-picker
 * mode="datetime"> and <td-datetime-range mode="datetime"> (plan v0.61.0 "Bổ sung owner 2026-10-09: datetime 2 màn").
 *
 *   div.td-time-step[hidden]
 *     div.td-time-step__head > button.td-time-step__back[data-action=back][aria-label="Chọn lại ngày"] + p.td-time-step__heading
 *     div.td-dtp-pop__time (the TimeWheels)
 *     [button.td-btn.td-time-step__now[data-action=now]]                                  (`withNow`: the range keeps it in the body)
 *
 * ONLY this class touches the wheels (`setTime` / `centre` / `destroy`). `show()` is the one entry into the screen; its order:
 * (1) unhide, (2) the heading + the time loaded SILENTLY (`setTime`, never `onChange`), (3) layout is forced, (4) both wheels
 * are centred, (5) the focus per policy: 'hour' = the hour wheel · 'preserve' = leave it where it is · 'none' = the caller
 * focuses. `hide()` is the way back to the date screen (it never touches the wheels). Backspace on this screen = back.
 * It keeps no value state of its own: the dialogs own their draft and pass it in.
 */
const fill = (template, vars) => String(template).replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : ''));
const make = (tag, cls, attrs = {}, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text != null) n.textContent = String(text);
  return n;
};

/**
 * @typedef {object} TimeStepOptions
 * @property {string} prefix unique id prefix (per open)
 * @property {Record<string, any>} labels table with timeBack / timeHeading / time / hour / minute (+ now when `withNow`)
 * @property {number} minuteStep
 * @property {boolean} [withNow] render the "Bây giờ" button in the body
 * @property {string} [nowLabel]
 * @property {() => void} onBack the "‹" button / Backspace
 * @property {() => void} [onNow]
 * @property {(t: { hour: number, minute: number }) => void} onChange a USER change of a wheel
 */
export class TimeStep {
  /** @param {TimeStepOptions} o */
  constructor(o) {
    this.o = o;
    const L = o.labels;
    this.el = make('div', 'td-time-step', { 'data-step-screen': 'time' });
    this.el.hidden = true;
    const head = make('div', 'td-time-step__head');
    this.back = make('button', 'td-cal__nav td-time-step__back', { type: 'button', 'data-action': 'back', 'aria-label': L.timeBack });
    this.back.appendChild(make('span', 'td-cal__nav-icon', { 'data-td-icon': 'prev', 'aria-hidden': 'true' }));
    this.heading = make('p', 'td-time-step__heading', { id: `${o.prefix}-time-heading` });
    head.append(this.back, this.heading);
    this.wheels = new TimeWheels({
      prefix: o.prefix, labels: L, minuteStep: o.minuteStep, hour: 0, minute: 0,
      onChange: (t) => o.onChange(t),
    });
    this.el.append(head, this.wheels.el);
    this.now = null;
    if (o.withNow) {
      this.now = make('button', 'td-btn td-btn--secondary td-btn--sm td-time-step__now', { type: 'button', 'data-action': 'now' });
      this.now.appendChild(make('span', 'td-btn__label', {}, o.nowLabel || L.now));
      this.now.addEventListener('click', () => { if (o.onNow) o.onNow(); });
      this.el.appendChild(this.now);
    }
    fillIconSlots(this.el);
    this.back.addEventListener('click', () => o.onBack());
    this.el.addEventListener('keydown', (e) => {
      if (e.key !== 'Backspace' || e.altKey || e.ctrlKey || e.metaKey) return;
      e.preventDefault(); // the wheels are listboxes (no text): the key only goes back; a draft loses nothing
      o.onBack();
    });
  }

  /** "Thứ Năm, 15/10/2026" for a calendar day */
  headingFor(d, prefixText = '') {
    const L = this.o.labels;
    const text = fill(L.timeHeading, { weekday: L.weekdaysLong[weekdayOf(d.year, d.month, d.day)], day: String(d.day).padStart(2, '0'), month: String(d.month).padStart(2, '0'), year: d.year });
    return prefixText ? `${prefixText} · ${text}` : text;
  }

  /**
   * Show the screen on `{ hour, minute }`. Idempotent (also the way to reload the time while it is already shown).
   * @param {{ dateLabel: string, hour: number, minute: number, focus?: 'hour'|'preserve'|'none' }} a
   */
  show({ dateLabel, hour, minute, focus = 'hour' }) {
    this.el.hidden = false; // (1)
    this.setDateLabel(dateLabel); // (2)
    this.wheels.setTime(hour, minute, { smooth: false });
    void this.el.offsetHeight; // (3) the wheels have a layout now
    this.wheels.centre(); // (4)
    if (focus === 'hour') { // (5)
      const list = this.el.querySelector('.td-dtp-wheel__list[data-part="hour"]');
      if (list) list.focus({ preventScroll: true });
    }
  }

  /** Back to the date screen (never touches the wheels). */
  hide() { this.el.hidden = true; }

  /** @returns {boolean} */
  isShown() { return !this.el.hidden; }

  /** @returns {{ hour: number, minute: number }} */
  getTime() { return this.wheels.getTime(); }

  setDateLabel(text) {
    if (this.heading.textContent !== text) this.heading.textContent = text;
  }

  destroy() { this.wheels.destroy(); }
}
