/**
 * TdToast — toast notification utility. Token-native (needs td.css; no Tailwind). Styles:
 * src/styles/components/toast.css.
 * Static API: TdToast.show(msg, type, duration) · .success(msg) · .error(msg) · .warning(msg) · .info(msg) → a
 * handle `{ close() }` · TdToast.clear() · TdToast.labels.close (close-button aria-label) · TdToast.labels.types
 * (screen-reader type prefix per type).
 *
 * DOM contract (v0.21.0 — dcms style: no icon node, no glass classes):
 *   <div id="td-toast-container" class="td-toasts">                       ← lazily appended to <body>, id kept
 *     <div class="td-toast td-toast--{success|error|warning|info}"
 *          role="status|alert" aria-live="polite|assertive" data-state="entering|open|closing" [data-paused]>
 *       <span class="td-toast__type td-sr-only">{TdToast.labels.types[type] + ' ' — set with the message}</span>
 *       <span class="td-toast__message">{message — text set one frame after insertion}</span>
 *       <button type="button" class="td-toast__close" aria-label="{TdToast.labels.close}"><svg data-icon="close"></svg></button>
 *     </div>
 *   </div>
 *
 * Behaviour:
 * - Pastel fill + same-hue ink + border per type, solid (no blur), one soft shadow; no visible icon, no visible close
 *   button (dcms). Colour is never the only cue: the type is announced by a screen-reader-only prefix
 *   (`labels.types`), errors are role=alert. The close button stays in the DOM and becomes visible on keyboard focus
 *   (:focus-visible), so sticky toasts are keyboard-dismissable. Click anywhere on a toast dismisses it.
 *   Placement top-right via tokens `--td-toast-top/-inline-end` (D11). z-index is the token `--td-z-toast` (CSS only).
 * - Announcements (D12): the toast is appended with its role and EMPTY prefix + message nodes; the text is set one
 *   frame later so `role=status` live regions exist before their content changes. Errors: role=alert, others: status (B6).
 * - Timers pause while the pointer is over the stack, while focus is inside it, and while the page is hidden
 *   (WCAG 2.2.1); remaining time is kept.
 * - Layer: while at least one toast is shown the container is registered in the layer registry
 *   (LAYERS.toast, keyboard 'none', includeInTrap) → never inert under a modal/loading lease, and its close
 *   buttons join a blocking dialog's Tab cycle. Released after the last toast is removed.
 * - MAX_VISIBLE with FIFO eviction; evicted toasts leave the active list synchronously (0.4.1 B1).
 * - The handle returned by show() is the REQUEST: close() drops it from the 50 ms queue, cancels its pending 80 ms
 *   stagger timer, or dismisses the shown toast (like its close button); idempotent. clear() does all three for
 *   every request.
 */

import { tdIcon } from '../icons/td-icon.js';
import { LAYERS, register as registerLayer } from '../utils/layers.js';
import { transitionEndMs } from '../utils/transition.js';

const TYPES = ['success', 'error', 'warning', 'info'];
const CLOSE_LABEL = 'Đóng';
/** Screen-reader type prefixes (Vietnamese defaults; a site overrides TdToast.labels.types). */
const TYPE_LABELS = { success: 'Thành công:', error: 'Lỗi:', warning: 'Cảnh báo:', info: 'Thông tin:' };
/** Minimum wait before a closing toast leaves the DOM (default exit 180 ms + margin); a longer computed exit
 * transition (--td-toast-exit-dur, delays) extends it. */
const REMOVE_DELAY = 200;
const REMOVE_MARGIN = 20;

const raf = (fn) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(fn) : setTimeout(fn, 16));

export class TdToast {
  /** @type {HTMLElement|null} */
  static container = null;
  /** @deprecated z-index is the CSS token --td-z-toast; kept for compatibility only. */
  static TOAST_Z_INDEX_BASE = 500;
  static MAX_VISIBLE = 5;
  /** @type {HTMLElement[]} */
  static _activeToasts = [];
  /** Site-overridable UI strings (Vietnamese defaults). */
  static labels = { close: CLOSE_LABEL, types: { ...TYPE_LABELS } };
  /** @private requests waiting for the 50 ms flush */
  static _pendingQueue = [];
  static _flushScheduled = false;
  /** @private requests whose stagger timer is pending */
  static _scheduled = new Set();
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
   * Variant metadata. Colours live in toast.css. `icon` (registry name) is kept for compatibility only — the toast no
   * longer renders an icon (v0.21.0).
   * @param {string} type
   * @returns {{type: string, icon: string}}
   */
  static getTheme(type) {
    const t = TYPES.includes(type) ? type : 'info';
    return { type: t, icon: t };
  }

  /**
   * @private screen-reader prefix for a type: TdToast.labels.types[type], else the Vietnamese default; '' disables it.
   * @param {string} type normalised type
   * @returns {string}
   */
  static _typeLabel(type) {
    const custom = TdToast.labels && TdToast.labels.types;
    const v = custom && typeof custom === 'object' && type in custom ? custom[type] : TYPE_LABELS[type];
    return v == null ? '' : String(v);
  }

  /**
   * Show a toast notification. Uses a staggered queue to prevent lag when many toasts fire at once.
   * @param {string} message - Toast message text (rendered as text, never HTML)
   * @param {'success'|'error'|'warning'|'info'} type - Toast variant (unknown → info)
   * @param {number} duration - Auto-dismiss delay in ms (≤ 0 = sticky: dismissed by a click or the keyboard close button)
   * @returns {{ close(): void }} handle of this request (queued, staggered or shown); close() is idempotent
   */
  static show(message, type = 'info', duration = 4000) {
    const req = { message, type, duration, state: message ? 'queued' : 'closed', timer: null, toast: null };
    const handle = { close: () => TdToast._cancel(req) };
    if (!message) return handle;

    TdToast._pendingQueue.push(req);
    if (!TdToast._flushScheduled) {
      TdToast._flushScheduled = true;
      setTimeout(() => TdToast._flush(), 50);
    }
    return handle;
  }

  /**
   * Flush queued toasts with staggered rendering (80ms between each).
   * @private
   */
  static _flush() {
    TdToast._flushScheduled = false;
    const queue = TdToast._pendingQueue.splice(0);
    queue.forEach((req, i) => {
      req.state = 'scheduled';
      TdToast._scheduled.add(req);
      req.timer = setTimeout(() => {
        req.timer = null;
        TdToast._scheduled.delete(req);
        if (req.state !== 'scheduled') return;
        req.state = 'shown';
        req.toast = TdToast._showSingle(req.message, req.type, req.duration);
      }, i * 80);
    });
  }

  /**
   * @private End one request whatever its stage (idempotent).
   * @param {{state: string, timer: *, toast: HTMLElement|null}} req
   */
  static _cancel(req) {
    const was = req.state;
    req.state = 'closed';
    if (was === 'queued') {
      const i = TdToast._pendingQueue.indexOf(req);
      if (i !== -1) TdToast._pendingQueue.splice(i, 1);
    } else if (was === 'scheduled') {
      if (req.timer) clearTimeout(req.timer);
      req.timer = null;
      TdToast._scheduled.delete(req);
    } else if (was === 'shown' && req.toast && req.toast._removeToast) {
      req.toast._removeToast(); // no-op if it already went away
    }
  }

  /** Drop every queued toast, cancel every pending stagger timer and dismiss every shown toast. */
  static clear() {
    for (const req of TdToast._pendingQueue.splice(0)) req.state = 'closed';
    for (const req of [...TdToast._scheduled]) TdToast._cancel(req);
    for (const t of TdToast._activeToasts.slice()) {
      if (t._removeToast) t._removeToast();
    }
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

    const { type: variant } = TdToast.getTheme(type);
    const text = message == null ? '' : String(message);

    const toast = document.createElement('div');
    toast.className = `td-toast td-toast--${variant}`;
    // Only errors interrupt (role=alert, assertive); everything else is an advisory status (polite).
    toast.setAttribute('role', variant === 'error' ? 'alert' : 'status');
    toast.setAttribute('aria-live', variant === 'error' ? 'assertive' : 'polite');
    toast.setAttribute('data-state', 'entering');

    // Type prefix for screen readers only (no visible icon): colour is never the only cue.
    const prefix = document.createElement('span');
    prefix.className = 'td-toast__type td-sr-only'; // EMPTY on insertion (D12), filled with the message
    const typeLabel = TdToast._typeLabel(variant);

    const msg = document.createElement('span');
    msg.className = 'td-toast__message'; // EMPTY on insertion (D12)

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'td-toast__close';
    close.setAttribute('aria-label', TdToast.labels.close || CLOSE_LABEL);
    const x = tdIcon('close', { size: 's' });
    if (x) close.appendChild(x);

    toast.append(prefix, msg, close);
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
      // The exit transition in effect now that data-state="closing" applies (site may lengthen --td-toast-exit-dur).
      const exitMs = transitionEndMs(toast);
      setTimeout(() => {
        toast.remove();
        const c = TdToast.container;
        if (!c || !c.querySelector('.td-toast')) {
          TdToast._releaseLayer();
          TdToast._hover = false;
          TdToast._focusWithin = false;
        }
      }, Math.max(REMOVE_DELAY, (exitMs || 0) + REMOVE_MARGIN));
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
      if (typeLabel) prefix.textContent = `${typeLabel} `;
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
   * @returns {{ close(): void }}
   */
  static success(message, duration = 4000) {
    return TdToast.show(message, 'success', duration);
  }

  /**
   * Show error toast (longer default duration).
   * @param {string} message
   * @param {number} duration
   * @returns {{ close(): void }}
   */
  static error(message, duration = 5000) {
    return TdToast.show(message, 'error', duration);
  }

  /**
   * Show warning toast.
   * @param {string} message
   * @param {number} duration
   * @returns {{ close(): void }}
   */
  static warning(message, duration = 4000) {
    return TdToast.show(message, 'warning', duration);
  }

  /**
   * Show info toast.
   * @param {string} message
   * @param {number} duration
   * @returns {{ close(): void }}
   */
  static info(message, duration = 4000) {
    return TdToast.show(message, 'info', duration);
  }
}
