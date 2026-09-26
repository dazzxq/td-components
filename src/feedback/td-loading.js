import { lockScroll } from '../utils/scroll-lock.js';
import { acquireInert } from '../utils/inert-lock.js';

const LOADING_LAYER = 480; // --td-z-loading
import { safeColor } from '../utils/css-safe.js';

/**
 * TdLoading — fullscreen blocking loading overlay + TdLoadingSpinner (inline). Token-native (needs td.css;
 * no Tailwind). Styles: src/styles/components/loading.css + spinner.css.
 *
 * Overlay DOM contract:
 *   <div id="td-loading" class="td-loading" role="status" aria-live="polite" hidden [data-state="open"]>
 *     <div class="td-loading__card td-glass-surface td-glass-surface--strong" tabindex="-1">
 *       <span class="td-loading__spinner td-spinner td-spinner--lg" aria-hidden="true">svg</span>
 *       <p id="td-loading-message" class="td-loading__message">…</p>
 *     </div>
 *   </div>
 *
 * While shown: the card holds focus (previous focus restored after), `<body>` children except the overlay and
 * `#td-toast-container` are `inert` (only what it set is restored), one scroll lease is held. Every exit path —
 * `hide()`, max-duration auto-hide, the last concurrent `wrap()` settling — goes through one `_release()`.
 */

const SVG = '<svg class="td-spinner__svg" viewBox="0 0 50 50" aria-hidden="true" focusable="false">'
  + '<circle class="td-spinner__track" cx="25" cy="25" r="20"></circle>'
  + '<circle class="td-spinner__arc" cx="25" cy="25" r="20"></circle></svg>';

const DEFAULT_MESSAGE = 'Đang tải...';

export class TdLoading {
  /** @type {HTMLElement|null} */
  static element = null;
  static _maxDurationTimer = null;
  /** @private active session: { releaseScroll, inerted, savedFocus } | null */
  static _active = null;
  /** @private concurrent wrap() count of the current generation */
  static _wrapCount = 0;
  /** @private bumped by hide(): wraps from an older generation never touch the current one */
  static _generation = 0;

  /** Build the overlay once (appended to <body>). */
  static init() {
    if (TdLoading.element && TdLoading.element.isConnected) return;
    const overlay = document.createElement('div');
    overlay.id = 'td-loading';
    overlay.className = 'td-loading';
    overlay.setAttribute('role', 'status');
    overlay.setAttribute('aria-live', 'polite');
    overlay.hidden = true;
    overlay.innerHTML = '<div class="td-loading__card td-glass-surface td-glass-surface--strong" tabindex="-1">'
      + `<span class="td-loading__spinner td-spinner td-spinner--lg" aria-hidden="true">${SVG}</span>`
      + '<p id="td-loading-message" class="td-loading__message"></p>'
      + '</div>';
    document.body.appendChild(overlay);
    TdLoading.element = overlay;
  }

  /**
   * Show the overlay.
   * @param {string|{message?: string, maxDuration?: number|false}} [messageOrOptions]
   *   maxDuration defaults to 30000 ms (auto-hide safety net; false/0 disables).
   */
  static show(messageOrOptions = DEFAULT_MESSAGE) {
    TdLoading.init();
    let message = DEFAULT_MESSAGE;
    let maxDuration = 30000;
    if (typeof messageOrOptions === 'string') {
      message = messageOrOptions; // verbatim (an explicit '' shows no text)
    } else if (messageOrOptions && typeof messageOrOptions === 'object') {
      message = messageOrOptions.message || DEFAULT_MESSAGE;
      if ('maxDuration' in messageOrOptions) maxDuration = messageOrOptions.maxDuration;
    }
    const el = TdLoading.element;
    const msgEl = el.querySelector('#td-loading-message');
    if (msgEl) msgEl.textContent = message;

    if (TdLoading._maxDurationTimer) {
      clearTimeout(TdLoading._maxDurationTimer);
      TdLoading._maxDurationTimer = null;
    }

    if (!TdLoading._active) {
      const saved = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      TdLoading._active = {
        releaseScroll: lockScroll(),
        releaseInert: acquireInert([el], LOADING_LAYER), // shared, ref-counted with other overlays
        savedFocus: saved,
      };
      el.hidden = false;
      el.setAttribute('aria-busy', 'true');
      requestAnimationFrame(() => {
        if (!TdLoading._active) return;
        el.setAttribute('data-state', 'open');
      });
      const card = el.querySelector('.td-loading__card');
      if (card) card.focus({ preventScroll: true });
    }

    if (maxDuration && maxDuration > 0) {
      TdLoading._maxDurationTimer = setTimeout(() => {
        console.warn(`Loading auto-hidden after maxDuration (${maxDuration}ms)`);
        TdLoading.hide();
      }, maxDuration);
    }
  }

  /** Hide the overlay (also ends every pending wrap() count). */
  static hide() {
    TdLoading._wrapCount = 0;
    TdLoading._generation += 1;
    TdLoading._release();
  }

  /** @private Single exit path: restores inert, scroll and focus exactly once. */
  static _release() {
    if (TdLoading._maxDurationTimer) {
      clearTimeout(TdLoading._maxDurationTimer);
      TdLoading._maxDurationTimer = null;
    }
    const active = TdLoading._active;
    TdLoading._active = null;
    const el = TdLoading.element;
    if (el) {
      el.hidden = true;
      el.removeAttribute('data-state');
      el.removeAttribute('aria-busy');
    }
    if (!active) return;
    active.releaseInert();
    active.releaseScroll();
    const f = active.savedFocus;
    if (f && f.isConnected && typeof f.focus === 'function') {
      try { f.focus({ preventScroll: true }); } catch { /* ignore */ }
    }
  }

  /**
   * Run an async function under the overlay. Ref-counted: concurrent wraps keep the overlay until the LAST one
   * settles (fulfilled or rejected). A direct hide() ends them all.
   * @template T
   * @param {() => Promise<T>} asyncFn
   * @param {string} [message]
   * @returns {Promise<T>}
   */
  static async wrap(asyncFn, message = DEFAULT_MESSAGE) {
    const gen = TdLoading._generation;
    TdLoading._wrapCount += 1;
    TdLoading.show(message);
    try {
      return await asyncFn();
    } finally {
      // Only the generation this wrap joined; a hide() in between started a new one.
      if (gen === TdLoading._generation && TdLoading._wrapCount > 0) {
        TdLoading._wrapCount -= 1;
        if (TdLoading._wrapCount === 0) TdLoading._release();
      }
    }
  }
}

/** Inline spinner factory. */
export class TdLoadingSpinner {
  /**
   * @param {{ size?: 'sm'|'md'|'lg', color?: string, trackColor?: string, className?: string, label?: string }} [options]
   *   `label` → role="status" + aria-label (meaningful); none → aria-hidden (decorative).
   * @returns {HTMLElement}
   */
  static create(options = {}) {
    const { size = 'md', color = '', trackColor = '', className = '', label = '' } = options;
    const el = document.createElement('span');
    const s = ['sm', 'md', 'lg'].includes(size) ? size : 'md';
    el.className = `td-spinner td-spinner--${s}`;
    if (typeof className === 'string') {
      for (const c of className.split(/\s+/)) if (c) el.classList.add(c); // DOM class API: no HTML context
    }
    const fg = safeColor(color, '');
    const track = safeColor(trackColor, '');
    if (fg) el.style.setProperty('--td-spinner-color', fg);
    if (track) {
      el.style.setProperty('--td-spinner-track', track);
      el.setAttribute('data-track', '');
    }
    if (typeof label === 'string' && label.trim()) {
      el.setAttribute('role', 'status');
      el.setAttribute('aria-label', label.trim());
    } else {
      el.setAttribute('aria-hidden', 'true');
    }
    el.innerHTML = SVG; // constant markup, no interpolation
    return el;
  }
}
