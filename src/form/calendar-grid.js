import { fillIconSlots } from '../icons/td-icon.js';
import {
  MIN_YEAR, MAX_YEAR, daysInMonth, monthMatrix, addDays, addMonths, addYears, startOfWeek, endOfWeek,
  clampDate, isDateOutOfRange, monthOutOfRange, yearOutOfRange, yearPage,
} from '../utils/calendar-model.js';

/**
 * INTERNAL (not exported from the package): the month / year / day-grid calendar of <td-datetime-picker> (plan
 * v0.60.0-calendar-picker A1–A3, C2, D2–D6). v0.61.0 puts range selection on the same grid; for that the selection is
 * the only thing the cells read from outside (`selected`), and the view logic knows nothing about what a pick means —
 * a pick at the ROOT view of the mode is reported through `onCommit`, every other pick only changes the view.
 *
 * DOM (built once with DOM APIs, then UPDATED IN PLACE — changing the month or the view creates no element):
 *   div.td-cal[data-view=days|months|years]
 *     div.td-cal__head
 *       button.td-cal__nav[data-dir=prev]  div.td-cal__titles > (button.td-cal__title[data-pick=month] + button.td-cal__title[data-pick=year] |
 *                                                                span.td-cal__heading in the root years view)  button.td-cal__nav[data-dir=next]
 *     p.td-sr-only.td-cal__live[aria-live=polite]            the month / year / page, announced once per change
 *     div.td-cal__days > table.td-cal__grid[role=grid] > thead th×7 (abbr + aria-label = the full weekday) + tbody tr×6 > td×7
 *                                                       [role=gridcell][data-date][aria-selected][aria-current=date][aria-disabled][data-outside]
 *     div.td-cal__cells[data-kind=months][role=grid] > div[role=row]×4 > div.td-cal__cell[role=gridcell][data-month]
 *     div.td-cal__cells[data-kind=years][role=grid]  > div[role=row]×4 > div.td-cal__cell[role=gridcell][data-year]
 *   The hidden views keep their nodes (`hidden`). The cell that is the focus has tabindex 0, every other one -1 (one tab stop).
 *
 * State: `focus` (the date the keyboard is on, always inside the bounds), `selected` (the committed / draft date or null),
 * `view`, `returnTo` (where the year grid goes back to). Transitions (plan D2): the month / year header buttons toggle their
 * grid; choosing a month in the months grid → days; choosing a year in the years grid → `returnTo`; the pick at the root view
 * of the mode (day in date / datetime, month in month, year in year) → `onCommit`. Keys (APG date picker dialog) in the days
 * view, ±1 / ±3 / ±12 / ±120 in the month / year grids; Esc is NOT handled here (the layer above closes the dialog).
 */

const fill = (template, vars) => String(template).replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : ''));
const make = (tag, cls, attrs = {}, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text != null) n.textContent = String(text);
  return n;
};
const setAttr = (el, name, value) => {
  if (value === null || value === false) {
    if (el.hasAttribute(name)) el.removeAttribute(name);
  } else if (el.getAttribute(name) !== String(value)) el.setAttribute(name, String(value));
};
const setText = (el, text) => { if (el.textContent !== text) el.textContent = text; };
const same = (a, b) => !!a && !!b && a.year === b.year && a.month === b.month && a.day === b.day;
const copy = (d) => ({ year: d.year, month: d.month, day: d.day });
const isoDate = (d) => `${String(d.year).padStart(4, '0')}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;

/**
 * @typedef {{ year: number, month: number, day: number }} CalDate
 * @typedef {object} CalendarGridOptions
 * @property {string} prefix unique id prefix (per open)
 * @property {Record<string, any>} labels TdDatetimePicker.labels (weekdaysShort / weekdaysLong / heading… keys)
 * @property {'days'|'months'|'years'} root the view of the mode: days (date, datetime) | months (month) | years (year)
 * @property {CalDate} focus the date the keyboard starts on (already inside the bounds)
 * @property {CalDate|null} selected
 * @property {CalDate|null} min  inclusive; extra fields (hour, minute) are ignored
 * @property {CalDate|null} max
 * @property {CalDate} today
 * @property {(level: 'day'|'month'|'year', date: CalDate) => void} onCommit a pick at the root view
 * @property {(view: string) => void} [onView] the view changed (the popover re-places itself)
 * @property {(date: CalDate) => CellState} [cellState] v0.61.0 (range): what each DAY cell shows, read on every paint (days view
 *   only; the month / year grids keep reading `selected`). Without it the cells are painted exactly as in 0.60.
 * @property {boolean} [multiselectable] with `cellState`: `aria-multiselectable="true"` on the day grid (default true)
 * @property {(date: CalDate|null) => void} [onFocusDate] v0.61.0: the DOM focus is on a day cell (its date) / left the grid (null)
 * @property {(date: CalDate|null) => void} [onHoverDate] v0.61.0: a MOUSE is over a day cell (its date) / left the day grid (null)
 *
 * @typedef {object} CellState
 * @property {boolean} [selected] aria-selected
 * @property {'start'|'end'|'single'|'in'|null} [role] -> data-range
 * @property {'in'|'end'|null} [preview] -> data-preview
 * @property {boolean} [disabled] -> aria-disabled (min / max)
 * @property {boolean} [dimmed] -> data-dimmed ONLY (still enabled: max-days)
 * @property {string} [label] appended to the aria-label
 */
export class CalendarGrid {
  /** @param {CalendarGridOptions} o */
  constructor(o) {
    this.o = o;
    this.L = o.labels;
    this.root = o.root;
    this.view = o.root;
    this.returnTo = 'days';
    /** @private the focus date a view had when it was LEFT for a deeper grid (days → months → years): restored when the pressed
     *  title toggles back; arrows / paging / ‹ › in the deeper grid only navigate (Codex r1 #3) */
    this._snaps = { days: null, months: null };
    this.focus = copy(o.focus);
    this.selected = o.selected ? copy(o.selected) : null;
    this.min = o.min || null;
    this.max = o.max || null;
    this.today = copy(o.today);
    this._dead = false;
    this.el = this._build();
    this._paint();
  }

  // --- build ---

  /** @private */
  _build() {
    const { prefix, labels: L } = this.o;
    const el = make('div', 'td-cal', { 'data-view': this.view });
    const head = make('div', 'td-cal__head');
    this.prev = make('button', 'td-cal__nav', { type: 'button', 'data-dir': 'prev' });
    this.next = make('button', 'td-cal__nav', { type: 'button', 'data-dir': 'next' });
    for (const [b, icon] of [[this.prev, 'prev'], [this.next, 'next']]) {
      b.appendChild(make('span', 'td-cal__nav-icon', { 'data-td-icon': icon, 'aria-hidden': 'true' }));
    }
    this.monthBtn = make('button', 'td-cal__title', { type: 'button', 'data-pick': 'month' });
    this.yearBtn = make('button', 'td-cal__title', { type: 'button', 'data-pick': 'year' });
    this.heading = make('span', 'td-cal__heading');
    this.heading.hidden = true;
    const titles = make('div', 'td-cal__titles');
    titles.append(this.monthBtn, this.yearBtn, this.heading);
    head.append(this.prev, titles, this.next);
    this.live = make('p', 'td-sr-only td-cal__live', { id: `${prefix}-live`, 'aria-live': 'polite' });

    // days
    this.days = make('div', 'td-cal__days');
    const table = make('table', 'td-cal__grid', { role: 'grid', 'aria-labelledby': this.live.id });
    if (this.o.cellState && this.o.multiselectable !== false) table.setAttribute('aria-multiselectable', 'true');
    const hr = make('tr');
    L.weekdaysShort.forEach((short, i) => {
      const th = make('th', 'td-cal__weekday', { scope: 'col', abbr: L.weekdaysLong[i], 'aria-label': L.weekdaysLong[i] }, short);
      hr.appendChild(th);
    });
    table.appendChild(make('thead')).appendChild(hr);
    const tbody = make('tbody');
    /** @type {HTMLElement[]} */
    this.dayCells = [];
    for (let r = 0; r < 6; r++) {
      const tr = make('tr');
      for (let c = 0; c < 7; c++) {
        const td = make('td', 'td-cal__day', { role: 'gridcell', tabindex: '-1' });
        this.dayCells.push(td);
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    this.days.appendChild(table);

    // months / years
    const grid = (kind) => {
      const wrap = make('div', 'td-cal__cells', { 'data-kind': kind, role: 'grid', 'aria-labelledby': this.live.id });
      const cells = [];
      for (let r = 0; r < 4; r++) {
        const row = make('div', 'td-cal__row', { role: 'row' });
        for (let c = 0; c < 3; c++) {
          const cell = make('div', 'td-cal__cell', { role: 'gridcell', tabindex: '-1' });
          cells.push(cell);
          row.appendChild(cell);
        }
        wrap.appendChild(row);
      }
      return { wrap, cells };
    };
    const m = grid('months');
    const y = grid('years');
    this.months = m.wrap;
    this.monthCells = m.cells;
    this.years = y.wrap;
    this.yearCells = y.cells;
    el.append(head, this.live, this.days, this.months, this.years);
    fillIconSlots(el);

    el.addEventListener('click', (e) => this._onClick(e));
    el.addEventListener('keydown', (e) => this._onKey(e));
    if (this.o.onFocusDate) {
      el.addEventListener('focusin', (e) => this._emitFocus(e));
      el.addEventListener('focusout', (e) => this._emitFocus(e));
    }
    if (this.o.onHoverDate) {
      this.days.addEventListener('pointerover', (e) => this._emitHover(e));
      this.days.addEventListener('pointerleave', () => this._setHover(null));
    }
    return el;
  }

  // --- paint (in place) ---

  /** @private everything the current state shows */
  _paint() {
    const v = this.view;
    const L = this.L;
    if (this._hoverKey) this._setHover(null); // the cells under a still mouse are about to be other dates (month / view change)
    setAttr(this.el, 'data-view', v);
    this.days.hidden = v !== 'days';
    this.months.hidden = v !== 'months';
    this.years.hidden = v !== 'years';
    const f = this.focus;

    // header
    const rootYears = this.root === 'years';
    this.monthBtn.hidden = v === 'years' || this.root === 'months';
    this.yearBtn.hidden = rootYears;
    this.heading.hidden = !rootYears;
    const page = yearPage(f.year);
    const pageEnd = page.years.filter((x) => x !== null).pop();
    const monthText = fill(L.monthName, { n: f.month });
    const yearText = v === 'years' ? fill(L.headingYears, { from: page.start, to: pageEnd }) : String(f.year);
    setText(this.monthBtn, monthText);
    setAttr(this.monthBtn, 'aria-label', `${monthText}, ${L.pickMonth}`);
    setAttr(this.monthBtn, 'aria-pressed', v === 'months' ? 'true' : 'false');
    setText(this.yearBtn, yearText);
    setAttr(this.yearBtn, 'aria-label', `${yearText}, ${L.pickYear}`);
    setAttr(this.yearBtn, 'aria-pressed', v === 'years' ? 'true' : 'false');
    setText(this.heading, fill(L.headingYears, { from: page.start, to: pageEnd }));

    // nav
    const [prevLabel, nextLabel] = v === 'days' ? [L.prevMonth, L.nextMonth] : v === 'months' ? [L.prevYear, L.nextYear] : [L.prevYears, L.nextYears];
    setAttr(this.prev, 'aria-label', prevLabel);
    setAttr(this.next, 'aria-label', nextLabel);
    setAttr(this.prev, 'aria-disabled', this._navDisabled(-1) ? 'true' : null);
    setAttr(this.next, 'aria-disabled', this._navDisabled(1) ? 'true' : null);

    // body + the announcement (only when the text changes)
    if (v === 'days') {
      this._paintDays();
      setText(this.live, fill(L.heading, { month: f.month, year: f.year }));
    } else if (v === 'months') {
      this._paintMonths();
      setText(this.live, fill(L.headingMonths, { year: f.year }));
    } else {
      this._paintYears(page);
      setText(this.live, fill(L.headingYears, { from: page.start, to: pageEnd }));
    }
  }

  /** @private */
  _paintDays() {
    const L = this.L;
    const matrix = monthMatrix(this.focus.year, this.focus.month).flat();
    const hook = this.o.cellState || null;
    for (let i = 0; i < 42; i++) {
      const cell = this.dayCells[i];
      const d = matrix[i];
      if (!d) {
        cell.textContent = '';
        for (const a of ['data-date', 'aria-label', 'aria-selected', 'aria-current', 'aria-disabled', 'data-outside', 'tabindex', 'data-range', 'data-preview', 'data-dimmed']) setAttr(cell, a, null);
        setAttr(cell, 'aria-hidden', 'true');
        continue;
      }
      const isToday = same(d, this.today);
      const weekday = L.weekdaysLong[i % 7];
      setAttr(cell, 'aria-hidden', null);
      setAttr(cell, 'data-date', isoDate(d));
      setText(cell, String(d.day));
      const label = fill(L.dayLabel, { weekday, day: d.day, month: d.month, year: d.year });
      const st = hook ? hook({ year: d.year, month: d.month, day: d.day }) : null;
      const text = (isToday ? `${label}, ${L.todaySuffix}` : label) + (st && st.label ? `, ${st.label}` : '');
      setAttr(cell, 'aria-label', text);
      setAttr(cell, 'aria-selected', (st ? !!st.selected : same(d, this.selected)) ? 'true' : 'false');
      setAttr(cell, 'aria-current', isToday ? 'date' : null);
      setAttr(cell, 'aria-disabled', isDateOutOfRange(d, this.min, this.max) || (st && st.disabled) ? 'true' : null);
      if (hook) {
        setAttr(cell, 'data-range', st && st.role ? st.role : null);
        setAttr(cell, 'data-preview', st && st.preview ? st.preview : null);
        setAttr(cell, 'data-dimmed', st && st.dimmed ? '' : null);
      }
      setAttr(cell, 'data-outside', d.outside ? '' : null);
      setAttr(cell, 'tabindex', same(d, this.focus) ? '0' : '-1');
    }
  }

  /** @private */
  _paintMonths() {
    const L = this.L;
    const f = this.focus;
    this.monthCells.forEach((cell, i) => {
      const m = i + 1;
      setAttr(cell, 'data-month', m);
      setText(cell, fill(L.monthName, { n: m }));
      setAttr(cell, 'aria-label', fill(L.heading, { month: m, year: f.year }));
      setAttr(cell, 'aria-selected', this.selected && this.selected.year === f.year && this.selected.month === m ? 'true' : 'false');
      setAttr(cell, 'data-today', this.today.year === f.year && this.today.month === m ? '' : null);
      setAttr(cell, 'aria-disabled', monthOutOfRange(f.year, m, this.min, this.max) ? 'true' : null);
      setAttr(cell, 'tabindex', m === f.month ? '0' : '-1');
    });
  }

  /** @private */
  _paintYears(page) {
    const L = this.L;
    this.yearCells.forEach((cell, i) => {
      const y = page.years[i];
      if (y === null) {
        cell.textContent = '';
        for (const a of ['data-year', 'aria-label', 'aria-selected', 'aria-disabled', 'data-today', 'tabindex']) setAttr(cell, a, null);
        setAttr(cell, 'aria-hidden', 'true');
        return;
      }
      setAttr(cell, 'aria-hidden', null);
      setAttr(cell, 'data-year', y);
      setText(cell, String(y));
      setAttr(cell, 'aria-label', fill(L.yearLabel, { year: y }));
      setAttr(cell, 'aria-selected', this.selected && this.selected.year === y ? 'true' : 'false');
      setAttr(cell, 'data-today', this.today.year === y ? '' : null);
      setAttr(cell, 'aria-disabled', yearOutOfRange(y, this.min, this.max) ? 'true' : null);
      setAttr(cell, 'tabindex', y === this.focus.year ? '0' : '-1');
    });
  }

  /** @private is the previous / next period unreachable (outside the bounds or past 0001 / 9999)? */
  _navDisabled(dir) {
    const f = this.focus;
    if (this.view === 'days') {
      const t = addMonths({ year: f.year, month: f.month, day: 1 }, dir);
      return (t.year === f.year && t.month === f.month) || monthOutOfRange(t.year, t.month, this.min, this.max);
    }
    if (this.view === 'months') {
      const y = f.year + dir;
      return y < MIN_YEAR || y > MAX_YEAR || yearOutOfRange(y, this.min, this.max);
    }
    const page = yearPage(f.year);
    const y = dir < 0 ? page.start - 1 : page.start + 12;
    return y < MIN_YEAR || y > MAX_YEAR || yearOutOfRange(y, this.min, this.max);
  }

  // --- state changes ---

  /** @private move the roving focus + repaint (+ the DOM focus when asked) */
  _goto(date, { domFocus = true } = {}) {
    const next = clampDate(date, this.min, this.max);
    if (same(next, this.focus)) { if (domFocus) this.focusActive(); return; }
    this.focus = copy(next);
    this._paint();
    if (domFocus) {
      this.focusActive();
      this._syncFocusDate();
    }
  }

  /**
   * @private change the view and put the DOM focus on the active cell of the new view.
   * `returnTo`: where the year grid goes back to. `back`: a pressed title toggled the deeper grid away — the focus date goes
   * back to the one the returning view was left on (a cell ACTIVATION never passes `back`: it keeps the navigated date).
   */
  _show(view, { returnTo = null, back = false } = {}) {
    if (returnTo) this.returnTo = returnTo;
    if (back && this._snaps[view]) this.focus = copy(clampDate(this._snaps[view], this.min, this.max));
    if (back || !(view === 'months' || view === 'years')) this._snaps[view] = null;
    this.view = view;
    this._paint();
    this.focusActive();
    if (this.o.onView) this.o.onView(view);
  }

  /** @private remember the focus date of the view we are leaving for a deeper grid */
  _leave(toView) {
    if (toView === 'months' || toView === 'years') this._snaps[this.view] = copy(this.focus);
  }

  /** Put the DOM focus on the active cell of the current view (the roving tab stop). */
  focusActive() {
    if (this._dead) return;
    const sel = this.view === 'days' ? '.td-cal__day[tabindex="0"]' : `.td-cal__cells[data-kind="${this.view}"] .td-cal__cell[tabindex="0"]`;
    const cell = this.el.querySelector(sel);
    if (!cell) return;
    cell.focus({ preventScroll: true });
    this._reveal(cell);
  }

  /**
   * @private `focus({ preventScroll })` scrolls nothing: when the popover's region is short (or the sheet body scrolls) bring
   * the cell into the visible part of the nearest scrolling ancestor, by just enough (no scrollIntoView — ADR 0019 rule 12).
   * The sticky action row of the sheet covers the bottom of its scroller, so it bounds the visible part.
   */
  _reveal(cell) {
    let sc = cell.parentElement;
    while (sc && sc !== this.el.ownerDocument.body) {
      const oy = getComputedStyle(sc).overflowY;
      // any overflow counts (no "+ 1" slack): the popover's region after the v0.61 two-screen change overflows by only a few px,
      // and scrollHeight / clientHeight are INTEGERS while the cell rect is fractional (WebKit on Linux)
      if ((oy === 'auto' || oy === 'scroll') && sc.scrollHeight > sc.clientHeight) break;
      sc = sc.parentElement;
    }
    if (!sc || sc === this.el.ownerDocument.body) return;
    const fit = () => {
      const c = cell.getBoundingClientRect();
      const r = sc.getBoundingClientRect();
      let bottom = r.bottom;
      const act = sc.querySelector(':scope .td-dtp-pop__actions') || (sc.closest('.td-dtp-pop') && sc.closest('.td-dtp-pop').querySelector('.td-dtp-pop__actions'));
      if (act && getComputedStyle(act).position === 'sticky') bottom = Math.min(bottom, act.getBoundingClientRect().top);
      // round the step UP: a browser stores scrollTop as an integer (device pixels), so a fractional step can fall short by < 1 px
      if (c.top < r.top - 0.01) sc.scrollTop -= Math.ceil(r.top - c.top);
      else if (c.bottom > bottom + 0.01) sc.scrollTop += Math.ceil(c.bottom - bottom);
    };
    fit();
    fit(); // a second pass absorbs what the integer rounding of the first one left (it never moves a cell that already fits)
  }

  /**
   * The selection shown (a date or null) — the picker owns what it means. `reveal` also moves the keyboard focus date there
   * and goes back to the root view ("Bây giờ": the draft jumps to now).
   */
  setSelected(date, { reveal = false } = {}) {
    this.selected = date ? copy(date) : null;
    if (reveal && date) {
      this.focus = copy(clampDate(date, this.min, this.max));
      this.view = this.root;
    }
    this._paint();
  }

  /**
   * v0.61.0: repaint ONLY the attributes of the day cells (the `cellState` hook changed what they show). Idempotent (`setAttr`),
   * creates no node, never touches the live region or the DOM focus. A no-op outside the days view.
   */
  refreshCells() {
    if (this.view === 'days') this._paintDays();
  }

  /** @private focusin / focusout of the grid → `onFocusDate` (a day cell's date, null when the focus leaves the grid or sits elsewhere) */
  _emitFocus(e) {
    let date = null;
    if (e.type === 'focusin') {
      const t = e.target instanceof Element ? e.target.closest('.td-cal__day[data-date]') : null;
      if (t) { const [y, m, d] = t.getAttribute('data-date').split('-').map(Number); date = { year: y, month: m, day: d }; }
    }
    this._focusKey = this._key(date, this._focusKey, (v) => this.o.onFocusDate(v));
  }

  /** @private pointerover on the day grid (mouse only: touch and pen have no hover) */
  _emitHover(e) {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    const t = e.target instanceof Element ? e.target.closest('.td-cal__day[data-date]') : null;
    let date = null;
    if (t && t.getAttribute('aria-hidden') !== 'true') { const [y, m, d] = t.getAttribute('data-date').split('-').map(Number); date = { year: y, month: m, day: d }; }
    this._setHover(date);
  }

  /** @private */
  _setHover(date) {
    this._hoverKey = this._key(date, this._hoverKey, (v) => this.o.onHoverDate(v));
  }

  /** @private the roving cell may be the SAME element (a month change or a bound clamp relabels it): no focusin fires — report the new date explicitly */
  _syncFocusDate() {
    if (this.o.onFocusDate && this.view === 'days') this._focusKey = this._key(this.focus, this._focusKey, (v) => this.o.onFocusDate(v));
  }

  /** @private call `fn(date)` only when the date changed; returns the new key */
  _key(date, prev, fn) {
    const k = date ? isoDate(date) : '';
    if (k !== (prev || '')) fn(date);
    return k;
  }

  /** New bounds (the `min` / `max` attributes changed while open); the focus is kept inside them. */
  setBounds(min, max) {
    const hadFocus = this.el.contains(this.el.ownerDocument.activeElement);
    this.min = min || null;
    this.max = max || null;
    this.focus = copy(clampDate(this.focus, this.min, this.max));
    for (const k of Object.keys(this._snaps)) if (this._snaps[k]) this._snaps[k] = copy(clampDate(this._snaps[k], this.min, this.max));
    this._paint();
    // the roving stop moved to an enabled cell: a focus that was inside the grid follows it (never left on a disabled cell)
    if (hadFocus && this.el.ownerDocument.activeElement.closest('.td-cal__day, .td-cal__cell')) {
      this.focusActive();
      this._syncFocusDate();
    }
  }

  /** @returns {'days'|'months'|'years'} */
  getView() { return this.view; }

  destroy() { this._dead = true; }

  // --- picks ---

  /** @private a pick at a day / month / year cell (already known to be enabled) */
  _pickDay(d) {
    if (!this.o.cellState) this.selected = copy(d); // with a cellState hook the owner decides what a pick means (range)
    this.focus = copy(d);
    this._paint();
    this.focusActive();
    this.o.onCommit('day', copy(d));
  }

  /** @private */
  _pickMonth(month) {
    const f = this.focus;
    if (this.root === 'months') {
      const d = { year: f.year, month, day: 1 };
      this.selected = copy(d);
      this.focus = copy(d);
      this._paint();
      this.focusActive();
      this.o.onCommit('month', d);
      return;
    }
    this.focus = copy(clampDate({ year: f.year, month, day: Math.min(f.day, daysInMonth(f.year, month)) }, this.min, this.max));
    this._snaps = { days: null, months: null }; // an activation keeps the navigated date
    this._show('days');
  }

  /** @private */
  _pickYear(year) {
    const f = this.focus;
    if (this.root === 'years') {
      const d = { year, month: 1, day: 1 };
      this.selected = copy(d);
      this.focus = copy(d);
      this._paint();
      this.focusActive();
      this.o.onCommit('year', d);
      return;
    }
    this.focus = copy(clampDate({ year, month: f.month, day: Math.min(f.day, daysInMonth(year, f.month)) }, this.min, this.max));
    this._snaps = { days: null, months: null }; // an activation keeps the navigated date (and ends the way back)
    this._show(this.returnTo);
  }

  /** @private activate a cell (click, Enter, Space) */
  _activate(cell) {
    if (cell.getAttribute('aria-disabled') === 'true' || cell.hasAttribute('aria-hidden')) return;
    if (cell.hasAttribute('data-date')) {
      const [y, m, d] = cell.getAttribute('data-date').split('-').map(Number);
      this._pickDay({ year: y, month: m, day: d });
    } else if (cell.hasAttribute('data-month')) {
      this._pickMonth(Number(cell.getAttribute('data-month')));
    } else if (cell.hasAttribute('data-year')) {
      this._pickYear(Number(cell.getAttribute('data-year')));
    }
  }

  /** @private header buttons: toggle the month / year grid, ‹ › */
  _onHeader(btn) {
    if (btn === this.monthBtn) {
      if (this.view === 'months') this._show('days', { back: true });
      else { this._leave('months'); this._show('months'); }
    } else if (btn === this.yearBtn) {
      if (this.view === 'years') this._show(this.returnTo, { back: true });
      else { const from = this.view; this._leave('years'); this._show('years', { returnTo: from }); }
    } else if (btn.getAttribute('aria-disabled') !== 'true') {
      const dir = btn === this.prev ? -1 : 1;
      const f = this.focus;
      const target = this.view === 'days' ? addMonths(f, dir) : this.view === 'months' ? addYears(f, dir) : addYears(f, dir * 12);
      this._goto(target, { domFocus: false });
    }
  }

  /** @private */
  _onClick(e) {
    const t = e.target instanceof Element ? e.target : null;
    if (!t) return;
    const btn = t.closest('.td-cal__nav, .td-cal__title');
    if (btn && this.el.contains(btn)) {
      this._onHeader(btn);
      return;
    }
    const cell = t.closest('.td-cal__day, .td-cal__cell');
    if (cell && this.el.contains(cell)) this._activate(cell);
  }

  // --- keyboard (APG date picker dialog) ---

  /** @private */
  _onKey(e) {
    const t = e.target instanceof Element ? e.target.closest('.td-cal__day, .td-cal__cell') : null;
    if (!t || !this.el.contains(t) || e.altKey || e.ctrlKey || e.metaKey) return;
    const k = e.key;
    if (k === 'Enter' || k === ' ') {
      e.preventDefault();
      this._activate(t);
      return;
    }
    const f = this.focus;
    let target = null;
    if (this.view === 'days') {
      if (k === 'ArrowLeft') target = addDays(f, -1);
      else if (k === 'ArrowRight') target = addDays(f, 1);
      else if (k === 'ArrowUp') target = addDays(f, -7);
      else if (k === 'ArrowDown') target = addDays(f, 7);
      else if (k === 'Home') target = startOfWeek(f);
      else if (k === 'End') target = endOfWeek(f);
      else if (k === 'PageUp') target = e.shiftKey ? addYears(f, -1) : addMonths(f, -1);
      else if (k === 'PageDown') target = e.shiftKey ? addYears(f, 1) : addMonths(f, 1);
    } else if (this.view === 'months') {
      const row = f.month - 1 - ((f.month - 1) % 3) + 1;
      if (k === 'ArrowLeft') target = addMonths(f, -1);
      else if (k === 'ArrowRight') target = addMonths(f, 1);
      else if (k === 'ArrowUp') target = addMonths(f, -3);
      else if (k === 'ArrowDown') target = addMonths(f, 3);
      else if (k === 'Home') target = { year: f.year, month: row, day: Math.min(f.day, daysInMonth(f.year, row)) };
      else if (k === 'End') target = { year: f.year, month: row + 2, day: Math.min(f.day, daysInMonth(f.year, row + 2)) };
      else if (k === 'PageUp') target = addYears(f, -1);
      else if (k === 'PageDown') target = addYears(f, 1);
    } else {
      const start = yearPage(f.year).start;
      const col = (f.year - start) % 3;
      if (k === 'ArrowLeft') target = addYears(f, -1);
      else if (k === 'ArrowRight') target = addYears(f, 1);
      else if (k === 'ArrowUp') target = addYears(f, -3);
      else if (k === 'ArrowDown') target = addYears(f, 3);
      else if (k === 'Home') target = addYears(f, -col);
      else if (k === 'End') target = addYears(f, 2 - col);
      else if (k === 'PageUp') target = addYears(f, e.shiftKey ? -120 : -12);
      else if (k === 'PageDown') target = addYears(f, e.shiftKey ? 120 : 12);
    }
    if (!target) return;
    e.preventDefault(); // no page scroll
    this._goto(target);
  }
}
