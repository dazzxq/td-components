import { TdBaseElement } from '../base/td-base-element.js';
import { fillIconSlots } from '../icons/td-icon.js';

const FOCUSABLE = 'a[href], button, input, select, textarea, summary, [tabindex], [contenteditable=""], [contenteditable="true"]';

/**
 * `<td-scroll-top>` — round glass "back to top" button fixed in the corner (floating control layer → Liquid Glass
 * strong). Shows once the page has scrolled past `threshold`, scrolls smoothly to the top (instantly under
 * `prefers-reduced-motion`) and moves keyboard focus to the start of the content. Styles: td.css
 * (`components/scroll-top.css`); position/size/z-index via `--td-scroll-top-*` tokens, safe-area aware, stacked
 * BELOW the lightbox / modal / popover layers.
 *
 *   <td-scroll-top></td-scroll-top>                       (anywhere in <body>; one per page)
 *   <td-scroll-top threshold="800" target="#content"></td-scroll-top>
 *
 * Markup: <button type="button" class="td-scroll-top td-glass-surface td-glass-surface--strong"
 *   aria-label="Lên đầu trang" data-visible="true|false"><span class="td-scroll-top__icon" data-td-icon="up"
 *   aria-hidden="true"><svg class="td-icon td-icon--m" data-icon="up" …></svg></span></button>
 * Hidden = `data-visible="false"` → `visibility: hidden` (out of the Tab order and the accessibility tree).
 *
 * @element td-scroll-top
 * @attr {number} threshold - Scroll distance in px after which the button shows (default 400, min 0)
 * @attr {string} target - CSS selector of the element that receives focus after the jump (default `#main`, then
 *   `main` / `[role="main"]`, then `<body>`). A non-focusable target gets a temporary `tabindex="-1"`.
 * @attr {string} label - Accessible name (default `TdScrollTop.labels.button`)
 * @fires scroll-top - After the jump started, detail `{ target }` (the element that got focus)
 */
export class TdScrollTop extends TdBaseElement {
  /** Default texts (Vietnamese); override per site: `TdScrollTop.labels.button = 'Back to top'`. */
  static labels = { button: 'Lên đầu trang' };

  static get observedAttributes() { return ['threshold', 'target', 'label']; }

  _label() {
    return (this.getAttribute('label') || '').trim() || String(TdScrollTop.labels.button ?? '');
  }

  /** @returns {number} px, default 400 */
  _threshold() {
    const n = parseFloat(this.getAttribute('threshold') ?? '');
    return Number.isFinite(n) && n >= 0 ? n : 400;
  }

  render() {
    return `<button type="button" class="td-scroll-top td-glass-surface td-glass-surface--strong" aria-label="${this.escapeHtml(this._label())}" data-visible="false">`
      + '<span class="td-scroll-top__icon" data-td-icon="up" aria-hidden="true"></span></button>';
  }

  afterRender() {
    fillIconSlots(this);
    this._btn = this.querySelector('.td-scroll-top');
    this._visible = false;
    this._raf = 0;
    this.listen(this._btn, 'click', () => this.scrollToTop());
    const schedule = () => {
      if (this._raf) return;
      this._raf = window.requestAnimationFrame(() => { this._raf = 0; this.update(); });
    };
    this.listen(window, 'scroll', schedule, { passive: true });
    this.listen(window, 'resize', schedule, { passive: true });
    this.listen(window, 'pageshow', schedule);
    this._cleanups.push(() => { if (this._raf) window.cancelAnimationFrame(this._raf); this._raf = 0; });
    this.update();
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (oldVal === newVal || !this._initialized || !this._btn) return;
    if (name === 'label') this._btn.setAttribute('aria-label', this._label());
    else if (name === 'threshold') this.update();
  }

  /** Re-evaluate visibility against the current scroll position (runs on scroll/resize automatically). */
  update() {
    if (!this._btn) return;
    const y = window.scrollY || document.documentElement.scrollTop || 0;
    const show = y > this._threshold();
    if (show === this._visible) return;
    this._visible = show;
    this._btn.setAttribute('data-visible', String(show));
  }

  /** Scroll the page to the top and move focus to the `target` (what the button does). */
  scrollToTop() {
    const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    const target = this._focusTarget();
    if (target) {
      if (!target.matches(FOCUSABLE)) {
        target.setAttribute('tabindex', '-1');
        target.addEventListener('blur', () => target.removeAttribute('tabindex'), { once: true });
      }
      target.focus({ preventScroll: true });
    }
    this.emit('scroll-top', { target });
  }

  /** @private */
  _focusTarget() {
    const sel = (this.getAttribute('target') || '').trim();
    let el = null;
    if (sel) {
      try { el = document.querySelector(sel); } catch { el = null; }
      if (!el) console.warn(`td-scroll-top: target "${sel}" not found — focusing the main content`);
    }
    return el || document.getElementById('main') || document.querySelector('main, [role="main"]') || document.body;
  }
}

if (!customElements.get('td-scroll-top')) {
  customElements.define('td-scroll-top', TdScrollTop);
}
