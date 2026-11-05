import { TdBaseElement } from '../base/td-base-element.js';
import { fillIconSlots } from '../icons/td-icon.js';
import { resolveScrollTopColors, syncScrollTopVars } from '../utils/scroll-top-colors.js';
import { readingProgress } from '../utils/reading-progress.js';

/** v0.97.0: how long the check replaces the arrow after a target is read to the end (dwp parity, fixed). */
const COMPLETE_MS = 3000;
// v0.97.0: fixed markup (no data) — the ring overlay: track + arc, pathLength 100 so dashoffset = 100 × (1 − p)
const RING_SVG = '<svg class="td-scroll-top__ring" viewBox="0 0 48 48" aria-hidden="true" focusable="false">'
  + '<circle class="td-scroll-top__track" cx="24" cy="24" r="22.5"/>'
  + '<circle class="td-scroll-top__arc" cx="24" cy="24" r="22.5" pathLength="100" transform="rotate(-90 24 24)"/></svg>';

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
 * @attr {string} color - v0.62.0 button fill (hex, basic name or rgb(); opaque only). Sets `--td-scroll-top-bg / -fg /
 *   -bg-hover / -pressed` on the host through CSSOM (never `style="…"`); the icon colour is picked by contrast (black / white,
 *   >= 4.58:1). Without it (or invalid) the `--td-scroll-top-*` tokens apply. Increased contrast / forced colours win.
 * @attr {string} text-color - v0.62.0 icon colour with `color` (opaque, >= 3:1 on `color`, else ignored)
 * @attr {string} progress-target - v0.97.0 CSS selector of the content whose reading progress the ring shows. Every
 *   `update()` re-resolves it: the first match with client rects wins. No match / invalid → no ring (invalid: one warn).
 * @prop {Element|null} progressTarget - v0.97.0 the same as an Element; non-null wins over `progress-target`
 * @fires scroll-top - After the jump started, detail `{ target }` (the element that got focus)
 * @fires reading-progress-complete - v0.97.0 bubbling, detail `{ target }`: the first time a target is read to the end
 *   (once per element, ever)
 */
export class TdScrollTop extends TdBaseElement {
  /** Default texts (Vietnamese); override per site: `TdScrollTop.labels.button = 'Back to top'`. */
  static labels = { button: 'Lên đầu trang' };

  static get observedAttributes() { return ['threshold', 'target', 'label', 'color', 'text-color', 'progress-target']; }

  constructor() {
    super();
    this._progressTarget = null; // v0.97.0
    this._readTargets = new WeakSet(); // v0.97.0 history: targets already read to the end (event + check used), never cleared
  }

  connectedCallback() {
    // v0.97.0: a `progressTarget` assigned before the upgrade shadows the accessor — re-apply it
    if (Object.prototype.hasOwnProperty.call(this, 'progressTarget')) {
      const v = this.progressTarget;
      delete this.progressTarget;
      this.progressTarget = v;
    }
    super.connectedCallback();
  }

  /** v0.97.0: the Element whose reading progress the ring shows; wins over `progress-target`. Non-Element → null. */
  get progressTarget() { return this._progressTarget; }
  set progressTarget(el) {
    this._progressTarget = el instanceof Element ? el : null;
    if (this._btn) this.update();
  }

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
      + RING_SVG
      + '<span class="td-scroll-top__icon" data-td-icon="up" aria-hidden="true"></span>'
      + '<span class="td-scroll-top__icon td-scroll-top__icon--check" data-td-icon="check" aria-hidden="true"></span></button>';
  }

  afterRender() {
    fillIconSlots(this);
    this._btn = this.querySelector('.td-scroll-top');
    this._arc = this.querySelector('.td-scroll-top__arc');
    this._visible = false;
    this._raf = 0;
    this._target = null; // v0.97.0 the resolved progress target (UI state)
    this._progress = -1;
    this._completeTimer = 0;
    this._ro = null;
    this._applyColors();
    this.listen(this._btn, 'click', () => this.scrollToTop());
    const schedule = () => {
      if (this._raf) return;
      this._raf = window.requestAnimationFrame(() => { this._raf = 0; this.update(); });
    };
    this.listen(window, 'scroll', schedule, { passive: true });
    this.listen(window, 'resize', schedule, { passive: true });
    this.listen(window, 'pageshow', schedule);
    this._schedule = schedule;
    this._cleanups.push(() => { if (this._raf) window.cancelAnimationFrame(this._raf); this._raf = 0; });
    // v0.97.0: target size changes (lazy images, late content) move the progress without a scroll
    if (typeof ResizeObserver === 'function') {
      this._ro = new ResizeObserver(schedule);
      this._cleanups.push(() => { this._ro.disconnect(); this._ro = null; this._target = null; });
    } else {
      this._cleanups.push(() => { this._target = null; });
    }
    this._cleanups.push(() => this._clearComplete());
    this.update();
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (oldVal === newVal || !this._initialized || !this._btn) return;
    if (name === 'label') this._btn.setAttribute('aria-label', this._label());
    else if (name === 'threshold' || name === 'progress-target') this.update();
    else if (name === 'color' || name === 'text-color') this._applyColors();
  }

  /**
   * v0.62.0: `color` / `text-color` → host custom properties via CSSOM (CSP-safe). Invalid / absent → the properties go back to
   * what the site had set before (restored, not blindly removed — see syncScrollTopVars). One fixed-text warning per element
   * for an unusable value (never the value itself).
   * @private
   */
  _applyColors() {
    const raw = this.getAttribute('color');
    const r = resolveScrollTopColors(raw, this.getAttribute('text-color'));
    syncScrollTopVars(this.style, this._colorVars || (this._colorVars = new Map()), r);
    if (!r) {
      if (raw && raw.trim() && !this._warnedColor) {
        this._warnedColor = true;
        console.warn('td-scroll-top: unusable color (use an opaque hex, basic name or rgb()) — the token colours apply');
      }
      return;
    }
    if (r.textRejected && !this._warnedText) {
      this._warnedText = true;
      console.warn('td-scroll-top: unusable text-color (opaque, >= 3:1 on color) — the icon colour is chosen automatically');
    }
  }

  /**
   * Re-evaluate visibility against the current scroll position and (v0.97.0) the reading progress (runs on scroll /
   * resize / target resize automatically). Call it after swapping content without a scroll (SPA view change).
   */
  update() {
    if (!this._btn) return;
    const y = window.scrollY || document.documentElement.scrollTop || 0;
    const show = y > this._threshold();
    if (show !== this._visible) {
      this._visible = show;
      this._btn.setAttribute('data-visible', String(show));
    }
    this._updateProgress();
  }

  /** @private v0.97.0: the current progress target (property, else the first selector match with client rects), or null. */
  _resolveTarget() {
    const el = this._progressTarget;
    if (el) return el.isConnected && el.getClientRects().length ? el : null;
    const sel = (this.getAttribute('progress-target') || '').trim();
    if (!sel || sel === this._badSel) return null; // a known-invalid selector is not reparsed every frame
    let list;
    try {
      list = document.querySelectorAll(sel);
    } catch {
      this._badSel = sel;
      if (!this._warnedSel) {
        this._warnedSel = true;
        console.warn('td-scroll-top: invalid progress-target selector — no progress ring');
      }
      return null;
    }
    for (const node of list) if (node.getClientRects().length) return node;
    return null;
  }

  /** @private v0.97.0: ring + completion state for the resolved target. */
  _updateProgress() {
    const target = this._resolveTarget();
    if (target !== this._target) {
      // identity changed / gone: transient UI resets, the history (_readTargets) stays
      if (this._ro) {
        if (this._target) this._ro.unobserve(this._target);
        if (target) this._ro.observe(target);
      }
      this._target = target;
      this._clearComplete();
    }
    const on = !!target;
    if (on !== (this._btn.getAttribute('data-progress') === 'true')) {
      if (on) this._btn.setAttribute('data-progress', 'true');
      else this._btn.removeAttribute('data-progress');
    }
    if (!target) { this._progress = -1; return; }
    const p = readingProgress(target.getBoundingClientRect(), window.innerHeight);
    if (p !== this._progress) {
      this._progress = p;
      if (this._arc) this._arc.style.strokeDashoffset = String(100 * (1 - p));
    }
    if (p >= 1) {
      if (!this._readTargets.has(target)) {
        this._readTargets.add(target);
        this._btn.setAttribute('data-complete', 'true');
        this._completeTimer = window.setTimeout(() => {
          this._completeTimer = 0;
          this._btn?.removeAttribute('data-complete');
        }, COMPLETE_MS);
        this.emit('reading-progress-complete', { target });
      }
    } else if (this._completeTimer) {
      this._clearComplete(); // scrolled back while the check shows → the arrow at once (the check is used)
    }
  }

  /** @private v0.97.0 */
  _clearComplete() {
    if (this._completeTimer) window.clearTimeout(this._completeTimer);
    this._completeTimer = 0;
    this._btn?.removeAttribute('data-complete');
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
