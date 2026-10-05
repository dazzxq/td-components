import { TdModal } from '../feedback/td-modal.js';
import { MODE_PARTS } from '../utils/datetime.js';

/**
 * INTERNAL (not exported from the package): the "one-moment editor" shared by `<td-datetime-picker>` (one editor) and
 * `<td-datetime-range>` (two editors, v0.40.0). Extracted from the picker's `_buildPanel` / `_buildTimeGroup` /
 * `_buildWheel` / `_refresh` / wheel intro without any behaviour change (plan v0.39.0-filters-range QĐ 17, M1).
 *
 * DOM (built with DOM APIs — no HTML string, no trusted hatch; `{p}` = the caller's unique prefix):
 *   <div class="td-dtp-panel" data-mode="{mode}">
 *     <fieldset class="td-dtp-panel__group"><legend class="td-dtp-panel__legend">{legend}</legend>
 *       <div class="td-dtp-panel__fields">  day / month / year: label + input.td-dtp-panel__input[type=number] ({p}-{part})
 *     [datetime: div.td-dtp-panel__group[role=group] > p.td-dtp-panel__legend#{p}-time + div.td-dtp-panel__wheels
 *       (two .td-dtp-wheel > .td-dtp-wheel__list[role=listbox][tabindex=0]#{p}-hour|minute)]
 *     [p.td-dtp-panel__preview]   (option `preview`, default true)
 *     <p class="td-dtp-panel__error" id="{p}-error" role="alert" hidden>
 *   </div>
 *
 * The caller owns the dialog; it calls `destroy()` when the dialog closes (every scroll timer / intro stops, settle
 * handlers become no-ops).
 */

const SCROLL_SETTLE_MS = 150; // fallback when `scrollend` is not supported
const INTRO_FALLBACK_MS = 300; // --td-modal-enter-dur default (used when the token cannot be read)
const INTRO_SAFETY_MS = 1500; // the intro scroll never suppresses scroll-settle selection longer than this

const pad2 = (n) => String(n).padStart(2, '0');
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const prefersReducedMotion = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};

/** @private DOM helper: element + class + attributes + text */
function make(tag, cls, attrs = {}, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text != null) n.textContent = String(text);
  return n;
}

/**
 * @typedef {object} DatetimeEditorOptions
 * @property {'datetime'|'date'|'month'|'year'} mode
 * @property {string} prefix unique id prefix (per open)
 * @property {object} pending the initial pending parts (mutated in place while editing)
 * @property {{ min: number, max: number }} years year field bounds
 * @property {number} minuteStep
 * @property {Record<string, string>} labels day / month / year / time / hour / minute
 * @property {string} legend text of the date fieldset legend
 * @property {(p: object) => ({ message: string, field: string|null }|null)} check validation of the pending parts
 * @property {boolean} [preview] render the preview line (default true)
 * @property {() => void} [onRefresh] called after every refresh (the range re-checks the pair)
 */

export class DatetimeEditor {
  /** @param {DatetimeEditorOptions} o */
  constructor(o) {
    this.o = o;
    this.mode = o.mode;
    /** pending parts (committed only by the caller) */
    this.pending = o.pending;
    /** opening wheel animation while it waits / runs; null otherwise */
    this.intro = null;
    /** @type {{ message: string, field: string|null }|null} */
    this.error = null;
    /** @private wheel → scrollTop its latest programmatic SMOOTH scroll is heading to */
    this._scrollTargets = new Map();
    /** @private scroll-settle fallback timers */
    this._scrollTimers = new Set();
    this._dead = false;
    this.el = this._build();
  }

  /** @private */
  _build() {
    const o = this.o;
    const { prefix, labels: L, years } = o;
    const shown = MODE_PARTS[this.mode];
    const panel = make('div', 'td-dtp-panel');
    panel.setAttribute('data-mode', this.mode);
    const dateGroup = make('fieldset', 'td-dtp-panel__group');
    dateGroup.appendChild(make('legend', 'td-dtp-panel__legend', {}, o.legend));
    const fields = make('div', 'td-dtp-panel__fields');
    const dateFields = [['day', 1, 31], ['month', 1, 12], ['year', years.min, years.max]].filter(([k]) => shown.includes(k));
    for (const [part, lo, hi] of dateFields) {
      const field = make('div', 'td-dtp-panel__field');
      const id = `${prefix}-${part}`;
      field.appendChild(make('label', 'td-dtp-panel__label', { for: id }, L[part]));
      const input = make('input', 'td-dtp-panel__input', {
        id, type: 'number', inputmode: 'numeric', min: String(lo), max: String(hi), autocomplete: 'off', 'data-part': part,
      });
      const v = this.pending[part];
      input.value = Number.isInteger(v) ? String(v) : '';
      field.appendChild(input);
      fields.appendChild(field);
    }
    dateGroup.appendChild(fields);
    panel.appendChild(dateGroup);

    if (this.mode === 'datetime') this._buildTimeGroup(panel);

    if (o.preview !== false) panel.appendChild(make('p', 'td-dtp-panel__preview'));
    const error = make('p', 'td-dtp-panel__error', { id: `${prefix}-error`, role: 'alert' });
    error.hidden = true;
    panel.appendChild(error);

    // Date fields: validate on input (no rewriting while typing), clamp on change (D9).
    panel.addEventListener('input', (e) => {
      const input = e.target;
      if (!(input instanceof HTMLInputElement) || !input.classList.contains('td-dtp-panel__input')) return;
      this.readField(input);
      this.refresh();
    });
    panel.addEventListener('change', (e) => {
      const input = e.target;
      if (!(input instanceof HTMLInputElement) || !input.classList.contains('td-dtp-panel__input')) return;
      const n = input.valueAsNumber;
      if (Number.isInteger(n)) input.value = String(clamp(n, Number(input.min), Number(input.max)));
      this.readField(input);
      this.refresh();
    });
    this.el = panel;
    this.refresh();
    return panel;
  }

  /** @private the hour / minute wheels (datetime mode only) */
  _buildTimeGroup(panel) {
    const { prefix, labels: L } = this.o;
    const timeGroup = make('div', 'td-dtp-panel__group', { role: 'group', 'aria-labelledby': `${prefix}-time` });
    timeGroup.appendChild(make('p', 'td-dtp-panel__legend', { id: `${prefix}-time` }, L.time));
    const wheels = make('div', 'td-dtp-panel__wheels');
    const step = this.o.minuteStep;
    const minutes = [];
    for (let m = 0; m < 60; m += step) minutes.push(m);
    wheels.appendChild(this._buildWheel('hour', Array.from({ length: 24 }, (_, i) => i)));
    wheels.appendChild(make('span', 'td-dtp-wheel__sep', { 'aria-hidden': 'true' }, ':'));
    wheels.appendChild(this._buildWheel('minute', minutes));
    timeGroup.appendChild(wheels);
    panel.appendChild(timeGroup);
  }

  /** @private one listbox wheel (the ONE normative model: listbox = tab stop, options never focusable) */
  _buildWheel(part, values) {
    const { prefix, labels: L } = this.o;
    const wrap = make('div', 'td-dtp-wheel');
    const list = make('div', 'td-dtp-wheel__list', {
      role: 'listbox', id: `${prefix}-${part}`, 'aria-label': L[part], tabindex: '0', 'data-part': part,
    });
    const current = this.pending[part];
    for (const v of values) {
      const opt = make('div', 'td-dtp-wheel__option', {
        role: 'option', id: `${prefix}-${part}-${v}`, 'aria-selected': v === current ? 'true' : 'false', 'data-value': String(v),
      }, pad2(v));
      if (v === current) list.setAttribute('aria-activedescendant', opt.id);
      list.appendChild(opt);
    }
    wrap.appendChild(list);

    // Direct manipulation cancels the opening animation of this wheel (keys / clicks cancel via select()).
    const userScroll = () => {
      this._scrollTargets.delete(list); // the user's own scroll settles normally
      this._cancelIntro(list);
    };
    list.addEventListener('pointerdown', userScroll);
    list.addEventListener('wheel', userScroll, { passive: true });
    list.addEventListener('touchstart', userScroll, { passive: true });
    list.addEventListener('keydown', (e) => this._onWheelKey(e, list));
    list.addEventListener('click', (e) => {
      const opt = e.target instanceof Element ? e.target.closest('.td-dtp-wheel__option') : null;
      if (opt && list.contains(opt)) this.selectWheel(list, Number(opt.getAttribute('data-value')), true);
    });
    // Scrolling (wheel / touch fling, CSS scroll-snap) selects the option that settles in the band.
    const settle = () => {
      if (this._dead) return;
      // The opening scroll passes over other options: it never changes the selection (it ends here).
      const heading = this._scrollTargets.get(list);
      if (heading !== undefined) {
        // a smooth scroll that was superseded (e.g. an arrow key mid-scroll) ended: the newer one is still running
        if (Math.abs(list.scrollTop - heading) > 2) return;
        this._scrollTargets.delete(list);
      }
      if (this.intro && this.intro.scrolling.has(list)) {
        this._cancelIntro(list);
        return;
      }
      const opt = this._optionAtCentre(list);
      if (opt && opt.getAttribute('aria-selected') !== 'true') this.selectWheel(list, Number(opt.getAttribute('data-value')), false);
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
    if (opt) this.selectWheel(list, Number(opt.getAttribute('data-value')), true);
  }

  /** Selection follows the active option: aria-selected + aria-activedescendant + pending, together. */
  selectWheel(list, value, scroll, smooth = true) {
    const part = list.getAttribute('data-part');
    let target = null;
    for (const o of list.children) {
      const on = Number(o.getAttribute('data-value')) === value;
      o.setAttribute('aria-selected', on ? 'true' : 'false');
      if (on) target = o;
    }
    if (!target) return;
    list.setAttribute('aria-activedescendant', target.id);
    if (this.pending) this.pending[part] = value;
    if (scroll) {
      this._cancelIntro(list); // a key / click / "Bây giờ" wins over the opening animation
      this._centre(list, target, smooth);
    }
    this.refresh();
  }

  /** @private scroll offset of an option inside its list (layout-based: unaffected by the dialog's open transform) */
  _optionTop(list, opt) {
    return opt.offsetTop - (opt.offsetParent === list ? 0 : list.offsetTop);
  }

  /** @private scrollTop that centres `opt` in the band (clamped to the scroll range) */
  _centreTop(list, opt) {
    const top = this._optionTop(list, opt) - (list.clientHeight - opt.offsetHeight) / 2;
    return clamp(top, 0, Math.max(0, list.scrollHeight - list.clientHeight));
  }

  /** @private */
  _centre(list, opt, smooth) {
    // Reduced motion: an instant jump (R11). CSS keeps `scroll-behavior: auto`, so 'auto' is instant.
    const top = this._centreTop(list, opt);
    const behavior = smooth && !prefersReducedMotion() ? 'smooth' : 'auto';
    if (behavior === 'smooth') this._scrollTargets.set(list, top);
    else this._scrollTargets.delete(list);
    list.scrollTo({ top, behavior });
  }

  /**
   * Opening animation (v0.21.0, like dcms): every wheel starts at the top of its list (scrollTop 0), then — once the
   * modal's entry transition has finished (`transitionend` of opacity / transform on .td-modal__dialog, or a fallback
   * timeout of --td-modal-enter-dur + 50 ms) — ONE smooth scroll per wheel (all at once) brings the selected option
   * into the band. The selection / pending value / aria-activedescendant hold the target from the start; the
   * scroll-settle handler ignores the intro scroll. Pointer / wheel / touch / key / click on a wheel cancels that
   * wheel's intro. Reduced motion → centred instantly. destroy() cancels everything.
   */
  startIntro() {
    this.endIntro();
    const panel = this.el;
    const lists = [...panel.querySelectorAll('.td-dtp-wheel__list')];
    if (!lists.length) return;
    if (prefersReducedMotion()) {
      this.centreWheels(false);
      return;
    }
    for (const list of lists) list.scrollTop = 0;
    const dialog = panel.closest('.td-modal__dialog');
    const intro = { waiting: new Set(lists), scrolling: new Set(), timer: 0, safety: 0, onEnd: null, dialog };
    this.intro = intro;
    const run = () => {
      if (this.intro !== intro) return;
      this._stopIntroWait(intro);
      if (this._dead) { this.endIntro(); return; }
      for (const list of intro.waiting) {
        const opt = list.querySelector('[aria-selected="true"]');
        if (!opt) continue;
        const top = this._centreTop(list, opt);
        if (Math.abs(top - list.scrollTop) < 1) continue; // already in the band: no scroll, no scrollend
        intro.scrolling.add(list);
        this._scrollTargets.set(list, top);
        list.scrollTo({ top, behavior: 'smooth' });
      }
      intro.waiting.clear();
      if (!intro.scrolling.size) { this.endIntro(); return; }
      // never leave the settle handler muted (an engine that drops scrollend for an interrupted scroll)
      intro.safety = window.setTimeout(() => { if (this.intro === intro) this.endIntro(); }, INTRO_SAFETY_MS);
    };
    if (dialog) {
      intro.onEnd = (e) => {
        if (e.target === dialog && (e.propertyName === 'opacity' || e.propertyName === 'transform')) run();
      };
      dialog.addEventListener('transitionend', intro.onEnd);
    }
    const wait = (dialog ? TdModal._cssMs(dialog, '--td-modal-enter-dur', INTRO_FALLBACK_MS) : 0) + 50;
    intro.timer = window.setTimeout(run, wait);
  }

  /** @private stop waiting for the modal entry (listener + fallback timer) */
  _stopIntroWait(intro) {
    if (intro.timer) window.clearTimeout(intro.timer);
    intro.timer = 0;
    if (intro.onEnd && intro.dialog) intro.dialog.removeEventListener('transitionend', intro.onEnd);
    intro.onEnd = null;
  }

  /** @private the user took over one wheel: no intro scroll for it, its settle selection works normally again */
  _cancelIntro(list) {
    const intro = this.intro;
    if (!intro) return;
    intro.waiting.delete(list);
    intro.scrolling.delete(list);
    if (!intro.waiting.size && !intro.scrolling.size) this.endIntro();
  }

  /** Drop the opening animation entirely (close / re-open / done). */
  endIntro() {
    const intro = this.intro;
    if (!intro) return;
    this.intro = null;
    this._stopIntroWait(intro);
    if (intro.safety) window.clearTimeout(intro.safety);
    intro.safety = 0;
  }

  /** Centre every wheel on its selected option. */
  centreWheels(smooth) {
    for (const list of this.el.querySelectorAll('.td-dtp-wheel__list')) {
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

  /** Read one date field into the pending parts. */
  readField(input) {
    if (!this.pending) return;
    const n = input.valueAsNumber; // finite integers (incl. negatives) are kept so range validation names the field
    this.pending[input.getAttribute('data-part')] = Number.isInteger(n) ? n : NaN;
  }

  /** The year field's native bounds (min / max attribute changed while open). */
  setYearRange(years) {
    const y = this.el.querySelector('.td-dtp-panel__input[data-part="year"]');
    if (y) { y.min = String(years.min); y.max = String(years.max); }
  }

  /**
   * Validate the pending state, sync field ARIA + the error line + the preview.
   * @returns {{ message: string, field: string|null }|null}
   */
  refresh() {
    const panel = this.el;
    if (!panel || !this.pending) return null;
    const p = this.pending;
    const err = this.o.check(p);
    /** the latest validation result (the range reads it to merge its pair error) */
    this.error = err;
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
    const previewEl = panel.querySelector('.td-dtp-panel__preview');
    if (previewEl) {
      const f = (n, w = 2) => (Number.isInteger(n) ? String(n).padStart(w, '0') : '-'.repeat(w));
      const preview = {
        datetime: () => `${f(p.day)}/${f(p.month)}/${f(p.year, 4)} - ${f(p.hour)}:${f(p.minute)}`,
        date: () => `${f(p.day)}/${f(p.month)}/${f(p.year, 4)}`,
        month: () => `${f(p.month)}/${f(p.year, 4)}`,
        year: () => f(p.year, 4),
      }[this.mode];
      previewEl.textContent = preview();
    }
    if (this.o.onRefresh) this.o.onRefresh();
    return err;
  }

  /**
   * Put `parts` into the fields + wheels (the shown components only; "Bây giờ", a preset). Date components that are
   * not integers empty their field.
   * @param {object} parts
   */
  setParts(parts) {
    Object.assign(this.pending, parts);
    for (const input of this.el.querySelectorAll('.td-dtp-panel__input')) {
      const v = parts[input.getAttribute('data-part')];
      input.value = Number.isInteger(v) ? String(v) : '';
      this.readField(input);
    }
    for (const list of this.el.querySelectorAll('.td-dtp-wheel__list')) {
      this.selectWheel(list, parts[list.getAttribute('data-part')], true);
    }
    this.refresh();
  }

  /** Focus the field / wheel of a part; false when it does not exist. */
  focusPart(part) {
    const field = part && this.el.querySelector(`[data-part="${part}"]`);
    if (!field) return false;
    field.focus();
    return true;
  }

  /** The dialog closed: stop the intro + every timer; settle handlers become no-ops. */
  destroy() {
    this._dead = true;
    this.endIntro();
    this._scrollTargets.clear();
    this._scrollTimers.forEach((t) => window.clearTimeout(t));
    this._scrollTimers.clear();
  }
}
