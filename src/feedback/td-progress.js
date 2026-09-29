import { TdBaseElement } from '../base/td-base-element.js';

const VARIANTS = ['primary', 'success', 'danger', 'warning'];
const SIZES = ['sm', 'md'];

/** `{name}` placeholders from `vars`; unknown ones are kept as written. */
const format = (tpl, vars = {}) => String(tpl ?? '').replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));

/** Finite number from an attribute string, else null (empty / non-numeric). */
const num = (s) => {
  if (s == null || String(s).trim() === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/**
 * `<td-progress>` — progress bar (content layer → solid fills, no glass). Styles: td.css (`components/progress.css`).
 *
 *   <td-progress value="40" label="Đang tải lên"></td-progress>          (40 %)
 *   <td-progress value="3" max="8" variant="success" size="sm"></td-progress>
 *   <td-progress label="Đang xử lý"></td-progress>                        (no value → indeterminate)
 *
 * The HOST is the progressbar: `role="progressbar"`, `aria-valuemin="0"`, `aria-valuemax` = max, `aria-valuenow` =
 * value and `aria-valuetext` = "N%" (`TdProgress.labels.valueText`). Indeterminate (no / non-numeric `value`):
 * no `aria-valuenow` / `aria-valuetext`, `aria-busy="true"`, and an animated bar that stops under
 * `prefers-reduced-motion` (a static partial bar instead). `label` → the host `aria-label` (a page-set `aria-label`
 * / `aria-labelledby` is kept when there is no `label`).
 *
 * Markup: <div class="td-progress td-progress--{size} td-progress--{variant}" data-state="determinate|indeterminate">
 *   <div class="td-progress__bar"></div></div> — the bar width is set via CSSOM (`style.setProperty('width', …)`),
 * never an inline `style=""` attribute in markup (CSP strict).
 *
 * @element td-progress
 * @attr {number} value - Current value, clamped to 0..max. Missing / not a number → indeterminate
 * @attr {number} max - Maximum (default 100; ≤ 0 or not a number → 100)
 * @attr {string} label - Accessible name (host `aria-label`)
 * @attr {'primary'|'success'|'danger'|'warning'} variant - Bar colour (default primary)
 * @attr {'sm'|'md'} size - Bar thickness (default md)
 */
export class TdProgress extends TdBaseElement {
  /** Default texts; override per site: `TdProgress.labels.valueText = '{n} percent'`. */
  static labels = { valueText: '{n}%' };

  static get observedAttributes() { return ['value', 'max', 'label', 'variant', 'size']; }

  /** @returns {number} */
  _max() {
    const m = num(this.getAttribute('max'));
    return m != null && m > 0 ? m : 100;
  }

  /** @returns {number|null} clamped value, null = indeterminate */
  _value() {
    const v = num(this.getAttribute('value'));
    if (v == null) return null;
    return Math.min(this._max(), Math.max(0, v));
  }

  /** @type {boolean} true while there is no numeric `value` */
  get indeterminate() { return this._value() == null; }

  /** @type {number|null} 0..100 (rounded), null when indeterminate */
  get percent() {
    const v = this._value();
    return v == null ? null : Math.round((v / this._max()) * 100);
  }

  render() {
    return '<div class="td-progress"><div class="td-progress__bar"></div></div>';
  }

  afterRender() {
    this._root = this.querySelector('.td-progress');
    this._bar = this.querySelector('.td-progress__bar');
    this._update();
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (oldVal === newVal || !this._initialized) return;
    this._update(); // in place: no re-render (keeps the width transition)
  }

  /** @private Sync classes, aria and the bar width with the attributes. */
  _update() {
    const root = this._root;
    if (!root) return;
    const variant = VARIANTS.includes(this.getAttribute('variant')) ? this.getAttribute('variant') : 'primary';
    const size = SIZES.includes(this.getAttribute('size')) ? this.getAttribute('size') : 'md';
    root.className = `td-progress td-progress--${size} td-progress--${variant}`;

    if (this.getAttribute('role') !== 'progressbar') this.setAttribute('role', 'progressbar');
    const max = this._max();
    const value = this._value();
    this.setAttribute('aria-valuemin', '0');
    this.setAttribute('aria-valuemax', String(max));
    if (value == null) {
      root.setAttribute('data-state', 'indeterminate');
      this.removeAttribute('aria-valuenow');
      this.removeAttribute('aria-valuetext');
      this.setAttribute('aria-busy', 'true');
      this._bar.style.removeProperty('width');
    } else {
      const pct = Math.round((value / max) * 100);
      root.setAttribute('data-state', 'determinate');
      this.setAttribute('aria-valuenow', String(value));
      this.setAttribute('aria-valuetext', format(TdProgress.labels.valueText, { n: pct }));
      this.removeAttribute('aria-busy');
      this._bar.style.setProperty('width', `${(value / max) * 100}%`); // CSSOM (CSP strict)
    }

    const label = (this.getAttribute('label') || '').trim();
    if (label) {
      this.setAttribute('aria-label', label);
      this._ownsLabel = true;
    } else if (this._ownsLabel) {
      this.removeAttribute('aria-label');
      this._ownsLabel = false;
    }
  }
}

if (!customElements.get('td-progress')) {
  customElements.define('td-progress', TdProgress);
}
