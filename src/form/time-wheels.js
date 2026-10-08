/**
 * INTERNAL (not exported from the package): the hour / minute wheels of the calendar dialog in datetime mode (plan
 * v0.60.0-calendar-picker A1). Same behaviour and the same DOM / CSS (`.td-dtp-wheel*`) as the wheels of the old one-moment
 * editor (src/form/datetime-panel.js, which only <td-datetime-range> still uses until v0.61.0) — minus the opening
 * animation: the wheels are centred immediately (`centre()`), never scrolled "from 00".
 *
 *   div.td-dtp-pop__time[role=group][aria-labelledby={p}-time]
 *     p.td-sr-only#{p}-time                         "Giờ"
 *     div.td-dtp-pop__wheels > .td-dtp-wheel > .td-dtp-wheel__list[role=listbox][tabindex=0][data-part=hour|minute]
 *                                                 (options .td-dtp-wheel__option[role=option] are never focusable)
 *
 * Each wheel is ONE tab stop; ArrowUp / ArrowDown ±1, PageUp / PageDown ±6 h / ±15 min, Home / End; the active option IS the
 * selection (`aria-activedescendant` + `aria-selected` in step); a click, a key and a scroll (CSS scroll-snap) select.
 */
const SCROLL_SETTLE_MS = 150; // fallback when `scrollend` is not supported
const pad2 = (n) => String(n).padStart(2, '0');
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const prefersReducedMotion = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};
function make(tag, cls, attrs = {}, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text != null) n.textContent = String(text);
  return n;
}

/**
 * @typedef {object} TimeWheelsOptions
 * @property {string} prefix unique id prefix (per open)
 * @property {{ time: string, hour: string, minute: string }} labels
 * @property {number} minuteStep 1–30, divides 60
 * @property {number} hour initial
 * @property {number} minute initial (already snapped to the step)
 * @property {(t: { hour: number, minute: number }) => void} onChange after every user selection
 */
export class TimeWheels {
  /** @param {TimeWheelsOptions} o */
  constructor(o) {
    this.o = o;
    this.time = { hour: o.hour, minute: o.minute };
    this._targets = new Map(); // wheel → scrollTop its latest smooth scroll heads to
    this._timers = new Set();
    this._dead = false;
    this.el = this._build();
  }

  /** @private */
  _build() {
    const { prefix, labels: L, minuteStep: step } = this.o;
    const group = make('div', 'td-dtp-pop__time', { role: 'group', 'aria-labelledby': `${prefix}-time` });
    group.appendChild(make('p', 'td-sr-only', { id: `${prefix}-time` }, L.time));
    const wheels = make('div', 'td-dtp-pop__wheels');
    const minutes = [];
    for (let m = 0; m < 60; m += step) minutes.push(m);
    wheels.appendChild(this._wheel('hour', Array.from({ length: 24 }, (_, i) => i)));
    wheels.appendChild(make('span', 'td-dtp-wheel__sep', { 'aria-hidden': 'true' }, ':'));
    wheels.appendChild(this._wheel('minute', minutes));
    group.appendChild(wheels);
    return group;
  }

  /** @private */
  _wheel(part, values) {
    const { prefix, labels: L } = this.o;
    const wrap = make('div', 'td-dtp-wheel');
    const list = make('div', 'td-dtp-wheel__list', {
      role: 'listbox', id: `${prefix}-${part}`, 'aria-label': L[part], tabindex: '0', 'data-part': part,
    });
    const current = this.time[part];
    for (const v of values) {
      const opt = make('div', 'td-dtp-wheel__option', {
        role: 'option', id: `${prefix}-${part}-${v}`, 'aria-selected': v === current ? 'true' : 'false', 'data-value': String(v),
      }, pad2(v));
      if (v === current) list.setAttribute('aria-activedescendant', opt.id);
      list.appendChild(opt);
    }
    wrap.appendChild(list);
    list.addEventListener('pointerdown', () => this._targets.delete(list));
    list.addEventListener('wheel', () => this._targets.delete(list), { passive: true });
    list.addEventListener('touchstart', () => this._targets.delete(list), { passive: true });
    list.addEventListener('keydown', (e) => this._onKey(e, list));
    list.addEventListener('click', (e) => {
      const opt = e.target instanceof Element ? e.target.closest('.td-dtp-wheel__option') : null;
      if (opt && list.contains(opt)) this._select(list, Number(opt.getAttribute('data-value')), true, true);
    });
    // Scrolling (wheel / touch fling, CSS scroll-snap) selects the option that settles in the band.
    const settle = () => {
      if (this._dead) return;
      const heading = this._targets.get(list);
      if (heading !== undefined) {
        if (Math.abs(list.scrollTop - heading) > 2) return; // a superseded smooth scroll ended; the newer one is running
        this._targets.delete(list);
      }
      const opt = this._optionAtCentre(list);
      if (opt && opt.getAttribute('aria-selected') !== 'true') this._select(list, Number(opt.getAttribute('data-value')), false, true);
    };
    if ('onscrollend' in window) {
      list.addEventListener('scrollend', settle);
    } else {
      let timer = 0;
      list.addEventListener('scroll', () => {
        window.clearTimeout(timer);
        this._timers.delete(timer);
        timer = window.setTimeout(() => { this._timers.delete(timer); settle(); }, SCROLL_SETTLE_MS);
        this._timers.add(timer);
      });
    }
    return wrap;
  }

  /** @private */
  _onKey(e, list) {
    const opts = [...list.children];
    const cur = Math.max(0, opts.findIndex((o) => o.getAttribute('aria-selected') === 'true'));
    const page = list.getAttribute('data-part') === 'hour' ? 6 : Math.max(1, Math.round(15 / this.o.minuteStep));
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
    if (opt) this._select(list, Number(opt.getAttribute('data-value')), true, true);
  }

  /** @private selection follows the active option: aria-selected + aria-activedescendant + the value, together */
  _select(list, value, scroll, notify) {
    const part = list.getAttribute('data-part');
    let target = null;
    for (const o of list.children) {
      const on = Number(o.getAttribute('data-value')) === value;
      if (o.getAttribute('aria-selected') !== (on ? 'true' : 'false')) o.setAttribute('aria-selected', on ? 'true' : 'false');
      if (on) target = o;
    }
    if (!target) return;
    list.setAttribute('aria-activedescendant', target.id);
    this.time[part] = value;
    if (scroll) this._centre(list, target, true);
    if (notify) this.o.onChange({ ...this.time });
  }

  /** @private scrollTop that centres `opt` in the band (layout-based: unaffected by the dialog's open transform) */
  _centreTop(list, opt) {
    const offset = opt.offsetTop - (opt.offsetParent === list ? 0 : list.offsetTop);
    return clamp(offset - (list.clientHeight - opt.offsetHeight) / 2, 0, Math.max(0, list.scrollHeight - list.clientHeight));
  }

  /** @private reduced motion: an instant jump */
  _centre(list, opt, smooth) {
    const top = this._centreTop(list, opt);
    const behavior = smooth && !prefersReducedMotion() ? 'smooth' : 'auto';
    if (behavior === 'smooth') this._targets.set(list, top);
    else this._targets.delete(list);
    list.scrollTo({ top, behavior });
  }

  /** @private the option whose centre is nearest the list's centre */
  _optionAtCentre(list) {
    const mid = list.scrollTop + list.clientHeight / 2;
    let best = null;
    let dist = Infinity;
    for (const o of list.children) {
      const top = o.offsetTop - (o.offsetParent === list ? 0 : list.offsetTop);
      const d = Math.abs(top + o.offsetHeight / 2 - mid);
      if (d < dist) { dist = d; best = o; }
    }
    return best;
  }

  /** The time shown. */
  getTime() { return { ...this.time }; }

  /** Select a time from outside ("Bây giờ"); never reports through `onChange`. */
  setTime(hour, minute) {
    for (const list of this.el.querySelectorAll('.td-dtp-wheel__list')) {
      this._select(list, list.getAttribute('data-part') === 'hour' ? hour : minute, true, false);
    }
  }

  /** Centre both wheels on their selection at once (call once the dialog is in the document and laid out). */
  centre() {
    for (const list of this.el.querySelectorAll('.td-dtp-wheel__list')) {
      const opt = list.querySelector('[aria-selected="true"]');
      if (opt) this._centre(list, opt, false);
    }
  }

  destroy() {
    this._dead = true;
    this._targets.clear();
    this._timers.forEach((t) => window.clearTimeout(t));
    this._timers.clear();
  }
}
