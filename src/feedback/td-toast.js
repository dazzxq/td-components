/**
 * TdToast — toast notification utility. Token-native (needs td.css; no Tailwind). Styles:
 * src/styles/components/toast.css.
 * Static API: TdToast.show(msg, type, duration) · .success(msg) · .error(msg) · .warning(msg) · .info(msg)
 *
 * DOM contract:
 *   <div id="td-toast-container" class="td-toasts">                       ← lazily appended to <body>, id kept
 *     <div class="td-toast td-toast--{success|error|warning|info} td-glass-surface td-glass-surface--strong"
 *          role="status|alert" aria-live="polite|assertive" data-state="entering|open|closing" [data-paused]>
 *       <span class="td-toast__icon" aria-hidden="true"><svg class="td-icon …" data-icon="{type}"></svg></span>
 *       <span class="td-toast__message">{message — text set one frame after insertion}</span>
 *       <button type="button" class="td-toast__close" aria-label="Đóng"><svg data-icon="close"></svg></button>
 *     </div>
 *   </div>
 *
 * Behaviour:
 * - Strong glass (no saturated fills); the variant is carried by a registry status icon (non-colour cue) and an
 *   error border tint (D13). Placement top-right via tokens `--td-toast-top/-inline-end` (D11). z-index is the
 *   token `--td-z-toast` (CSS only).
 * - Announcements (D12): the toast is appended with its role and an EMPTY message node; the text is set one frame
 *   later so `role=status` live regions exist before their content changes. Errors: role=alert, others: status (B6).
 * - Timers pause while the pointer is over the stack, while focus is inside it, and while the page is hidden
 *   (WCAG 2.2.1); remaining time is kept. Every toast (sticky too) has a focusable close button; clicking a toast
 *   still dismisses it.
 * - Layer: while at least one toast is shown the container is registered in the layer registry
 *   (LAYERS.toast, keyboard 'none', includeInTrap) → never inert under a modal/loading lease, and its close
 *   buttons join a blocking dialog's Tab cycle. Released after the last toast is removed.
 * - MAX_VISIBLE with FIFO eviction; evicted toasts leave the active list synchronously (0.4.1 B1).
 */

import { tdIcon } from '../icons/td-icon.js';
import { LAYERS, register as registerLayer } from '../utils/layers.js';

const TYPES = ['success', 'error', 'warning', 'info'];
const CLOSE_LABEL = 'Đóng';
/** Exit transition length (--td-dur-base) before the node leaves the DOM. */
const REMOVE_DELAY = 200;

const raf = (fn) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(fn) : setTimeout(fn, 16));

export class TdToast {
  /** @type {HTMLElement|null} */
  static container = null;
  /** @deprecated z-index is the CSS token --td-z-toast; kept for compatibility only. */
  static TOAST_Z_INDEX_BASE = 500;
  static MAX_VISIBLE = 5;
  /** @type {HTMLElement[]} */
  static _activeToasts = [];
  static _pendingQueue = [];
  static _flushScheduled = false;
  /** @private layer registration while ≥ 1 toast is in the DOM */
  static _layer = null;
  /** @private pause sources */
  static _hover = false;
  static _focusWithin = false;
  /** @private element focused before focus entered the stack (restored when its toast goes away) */
  static _focusOrigin = null;
  static _visibilityBound = false;

  /**
   * @deprecated The container's z-index is the token `--td-z-toast` (no JS computation). Returns the computed
   * value for compatibility.
   * @returns {number}
   */
  static getToastZIndex() {
    const c = TdToast.container;
    if (c && c.isConnected && typeof getComputedStyle === 'function') {
      const z = parseInt(getComputedStyle(c).zIndex, 10);
      if (Number.isFinite(z)) return z;
    }
    return TdToast.TOAST_Z_INDEX_BASE;
  }

  /** Ensure the toast container exists in the DOM (created lazily, re-created if it was removed). */
  static ensureContainer() {
    const existing = TdToast.container;
    if (existing && existing.isConnected) return;
    if (existing) TdToast._releaseLayer();

    const container = document.createElement('div');
    container.id = 'td-toast-container';
    container.className = 'td-toasts';
    container.addEventListener('pointerenter', () => { TdToast._hover = true; TdToast._syncPause(); });
    container.addEventListener('pointerleave', () => { TdToast._hover = false; TdToast._syncPause(); });
    container.addEventListener('focusin', (e) => {
      if (!TdToast._focusWithin) {
        const from = e.relatedTarget;
        TdToast._focusOrigin = from instanceof HTMLElement && !container.contains(from) ? from : null;
      }
      TdToast._focusWithin = true;
      TdToast._syncPause();
    });
    container.addEventListener('focusout', (e) => {
      if (e.relatedTarget instanceof Node && container.contains(e.relatedTarget)) return;
      TdToast._focusWithin = false;
      TdToast._focusOrigin = null;
      TdToast._syncPause();
    });
    if (!TdToast._visibilityBound && typeof document !== 'undefined') {
      TdToast._visibilityBound = true;
      document.addEventListener('visibilitychange', () => TdToast._syncPause());
    }
    document.body.appendChild(container);
    TdToast.container = container;
    TdToast._hover = false;
    TdToast._focusWithin = false;
  }

  /**
   * Variant metadata (icon = registry name). Colours live in toast.css.
   * @param {string} type
   * @returns {{type: string, icon: string}}
   */
  static getTheme(type) {
    const t = TYPES.includes(type) ? type : 'info';
    return { type: t, icon: t };
  }

  /**
   * Show a toast notification. Uses a staggered queue to prevent lag when many toasts fire at once.
   * @param {string} message - Toast message text (rendered as text, never HTML)
   * @param {'success'|'error'|'warning'|'info'} type - Toast variant (unknown → info)
   * @param {number} duration - Auto-dismiss delay in ms (0 = sticky: dismissed by its close button or a click)
   */
  static show(message, type = 'info', duration = 4000) {
    if (!message) return;

    TdToast._pendingQueue.push({ message, type, duration });
    if (!TdToast._flushScheduled) {
      TdToast._flushScheduled = true;
      setTimeout(() => TdToast._flush(), 50);
    }
  }

  /**
   * Flush queued toasts with staggered rendering (80ms between each).
   * @private
   */
  static _flush() {
    TdToast._flushScheduled = false;
    const queue = TdToast._pendingQueue.splice(0);
    queue.forEach((item, i) => {
      setTimeout(() => TdToast._showSingle(item.message, item.type, item.duration), i * 80);
    });
  }

  /** @private whether auto-dismiss timers are currently frozen */
  static _isPaused() {
    return TdToast._hover || TdToast._focusWithin || (typeof document !== 'undefined' && document.hidden === true);
  }

  /** @private apply the pause state to every active toast */
  static _syncPause() {
    const paused = TdToast._isPaused();
    for (const t of TdToast._activeToasts) {
      if (paused) t._pause?.();
      else t._resume?.();
    }
  }

  /** @private register the container as a floating layer (first visible toast) */
  static _ensureLayer() {
    if (TdToast._layer || !TdToast.container) return;
    TdToast._layer = registerLayer({
      layer: LAYERS.toast,
      element: TdToast.container,
      keyboard: 'none',
      includeInTrap: true,
    });
  }

  /** @private release the registration (after the last toast left the DOM) */
  static _releaseLayer() {
    if (!TdToast._layer) return;
    TdToast._layer.release();
    TdToast._layer = null;
  }

  /**
   * Internal: render a single toast immediately.
   * @private
   * @returns {HTMLElement}
   */
  static _showSingle(message, type, duration) {
    TdToast.ensureContainer();
    const container = TdToast.container;
    // Toasts removed behind our back (e.g. container.innerHTML = '') no longer count.
    TdToast._activeToasts = TdToast._activeToasts.filter((t) => t.isConnected && t.parentNode === container);

    const { type: variant, icon } = TdToast.getTheme(type);
    const text = message == null ? '' : String(message);

    const toast = document.createElement('div');
    toast.className = `td-toast td-toast--${variant} td-glass-surface td-glass-surface--strong`;
    // Only errors interrupt (role=alert, assertive); everything else is an advisory status (polite).
    toast.setAttribute('role', variant === 'error' ? 'alert' : 'status');
    toast.setAttribute('aria-live', variant === 'error' ? 'assertive' : 'polite');
    toast.setAttribute('data-state', 'entering');

    const iconSlot = document.createElement('span');
    iconSlot.className = 'td-toast__icon';
    iconSlot.setAttribute('aria-hidden', 'true');
    const svg = tdIcon(icon, { size: 'm' });
    if (svg) iconSlot.appendChild(svg);

    const msg = document.createElement('span');
    msg.className = 'td-toast__message'; // EMPTY on insertion (D12)

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'td-toast__close';
    close.setAttribute('aria-label', CLOSE_LABEL);
    const x = tdIcon('close', { size: 's' });
    if (x) close.appendChild(x);

    toast.append(iconSlot, msg, close);
    container.appendChild(toast);
    TdToast._ensureLayer();

    // ---- timer (pausable) ----
    let timer = null;
    let remaining = duration > 0 ? Number(duration) : 0;
    let startedAt = 0;
    const clear = () => { if (timer) { clearTimeout(timer); timer = null; } };
    toast._pause = () => {
      if (toast._removed) return;
      toast.setAttribute('data-paused', '');
      if (!timer) return;
      clear();
      remaining = Math.max(0, remaining - (Date.now() - startedAt));
    };
    toast._resume = () => {
      if (toast._removed) return;
      toast.removeAttribute('data-paused');
      if (timer || !(remaining > 0)) return;
      startedAt = Date.now();
      timer = setTimeout(removeToast, remaining);
    };

    const removeToast = () => {
      if (toast._removed) return;
      toast._removed = true;
      clear();
      toast.setAttribute('data-state', 'closing');
      // Leave the active list synchronously: the FIFO cap below loops on its length (0.4.1 B1).
      TdToast._activeToasts = TdToast._activeToasts.filter((t) => t !== toast);
      // Focus inside the leaving toast → next toast's close button, else back where it came from.
      const active = document.activeElement;
      if (active && toast.contains(active)) {
        const next = TdToast._activeToasts.find((t) => t.isConnected);
        const target = next ? next.querySelector('.td-toast__close') : TdToast._focusOrigin;
        if (target && target.isConnected && typeof target.focus === 'function') {
          target.focus({ preventScroll: true });
        } else {
          active.blur();
        }
      }
      setTimeout(() => {
        toast.remove();
        const c = TdToast.container;
        if (!c || !c.querySelector('.td-toast')) {
          TdToast._releaseLayer();
          TdToast._hover = false;
          TdToast._focusWithin = false;
        }
      }, REMOVE_DELAY);
    };

    toast._removeToast = removeToast;
    TdToast._activeToasts.push(toast);

    // FIFO eviction when exceeding MAX_VISIBLE
    while (TdToast._activeToasts.length > TdToast.MAX_VISIBLE) {
      const oldest = TdToast._activeToasts.shift();
      if (oldest && oldest._removeToast) oldest._removeToast();
    }

    // D12: text one frame after insertion; the enter state one frame later (the entering style must be rendered).
    raf(() => {
      msg.textContent = text;
      raf(() => {
        if (!toast._removed) toast.setAttribute('data-state', 'open');
      });
    });

    toast.addEventListener('click', removeToast);

    if (TdToast._isPaused()) toast._pause(); // starts frozen (remaining time untouched)
    else toast._resume();

    return toast;
  }

  /**
   * Show success toast.
   * @param {string} message
   * @param {number} duration
   */
  static success(message, duration = 4000) {
    TdToast.show(message, 'success', duration);
  }

  /**
   * Show error toast (longer default duration).
   * @param {string} message
   * @param {number} duration
   */
  static error(message, duration = 5000) {
    TdToast.show(message, 'error', duration);
  }

  /**
   * Show warning toast.
   * @param {string} message
   * @param {number} duration
   */
  static warning(message, duration = 4000) {
    TdToast.show(message, 'warning', duration);
  }

  /**
   * Show info toast.
   * @param {string} message
   * @param {number} duration
   */
  static info(message, duration = 4000) {
    TdToast.show(message, 'info', duration);
  }
}
