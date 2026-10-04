/**
 * Dialog layer controller (internal, v0.27.0 plan v0.27.0-dsuite-p0a §A) — the blocking-overlay mechanics shared by
 * TdModal and td-drawer, extracted from TdModal without changing its behaviour:
 *
 * - mount: the root becomes a child of <body> (when it is not connected yet);
 * - layer registry (utils/layers.js): a BLOCKING keyboard boundary at `layer` (inert lease on everything below, Escape
 *   to `onEscape`, Tab trapped in `dialog` + the higher `includeInTrap` registrations, band promotion over a higher
 *   modal / lightbox layer, `baseZ` for TdModalStackManager.BASE_Z_INDEX);
 * - optional page scroll lease (`scrollLock`; TdModal keeps the one lease of its stack manager instead);
 * - focus moves into the dialog at once; `onOpened()` runs on the second animation frame while still open (initial
 *   focus target + open state there — the content is laid out);
 * - close in TWO explicit phases:
 *     1. `close(reason)` (sync): popups anchored inside close (`coverFloatingIn`), the root goes `data-state="closing"`,
 *        the dialog `inert`, `beforeRelease(ctx)` (TdModal: stack bookkeeping), the layer + scroll lease are released,
 *        focus is restored (`restoreFocus(ctx)` hook, else the generic opener → promoted-over layer → top boundary
 *        chain), then `onClosing(reason, ctx)` — the moment TdModal has always called `onClose`;
 *     2. after the exit transition (`exitMs()`; default: the computed transition of dialog + backdrop + 40 ms) the root
 *        is hidden + removed and the Promise returned by `close()` resolves with the reason (td-drawer gives its nodes
 *        back and emits `close` there).
 *   `close()` is idempotent (the same Promise); `release()` finishes at once (no wait; closes first when still open).
 *
 * No DOM of its own, no styles (CSP-neutral). Not a public API (not exported from the package entry).
 *
 * @module feedback/dialog-layer
 */
import {
  LAYERS, register as registerLayer, trapTab, setFocusHandoff, followFocusHandoff, floatingContains, coverFloatingIn,
  restoreFocus as restoreTopFocus,
} from '../utils/layers.js';
import { lockScroll } from '../utils/scroll-lock.js';
import { transitionEndMs } from '../utils/transition.js';
import { ensurePressStates } from '../utils/press.js';

const EXIT_MARGIN = 40;
const FALLBACK_EXIT_MS = 240;

/**
 * @typedef {object} DialogCloseContext
 * @property {*} reason
 * @property {boolean} wasTop the layer was the top keyboard boundary (or `wasTop()` said so) when the close started
 * @property {Element|null} active the focused element when the close started
 * @property {boolean} focusWasHere focus was in the root (or a popup anchored in it), or nowhere
 * @property {Element|null} over the open layer this one was promoted above (read before the release)
 */

/**
 * Open a dialog layer.
 * @param {object} o
 * @param {HTMLElement} o.root the overlay root (mounted under <body> when not connected)
 * @param {HTMLElement} o.dialog the focus container (`role="dialog"`, tabindex -1)
 * @param {number} [o.layer=LAYERS.modal]
 * @param {HTMLElement|null} [o.opener] restore target (default: the focused element at open time, never <body>)
 * @param {(e: KeyboardEvent) => (boolean|void)} [o.onEscape] Escape on the top layer; anything but `false` consumes it
 * @param {() => (number|null)} [o.baseZ]
 * @param {boolean} [o.scrollLock=false] take a page scroll lease for the lifetime of the layer
 * @param {() => void} [o.onOpened] second animation frame after open, only while still open
 * @param {() => boolean} [o.wasTop] close-time "was on top" (default: the layer registration's isTop())
 * @param {(ctx: DialogCloseContext) => void} [o.beforeRelease] phase 1, right before the layer is released
 * @param {(ctx: DialogCloseContext) => void} [o.restoreFocus] replaces the generic focus restore
 * @param {(reason: *, ctx: DialogCloseContext) => void} [o.onClosing] phase 1, last step (before the exit transition)
 * @param {() => number} [o.exitMs] ms to keep the root connected after phase 1
 * @param {Element|null} [o.backdrop] measured with the dialog by the default exitMs
 * @returns {{ root: HTMLElement, dialog: HTMLElement, layer: ReturnType<typeof registerLayer>, opener: HTMLElement|null,
 *   readonly closed: boolean, close(reason?: *): Promise<*>, release(): void }}
 */
export function openDialogLayer(o) {
  const { root, dialog } = o;
  const layerNo = typeof o.layer === 'number' ? o.layer : LAYERS.modal;
  ensurePressStates(document); // v0.36.2 (ADR 0019): imperative overlays may open before any element connects
  const active0 = document.activeElement;
  const opener = o.opener !== undefined ? o.opener
    : (active0 instanceof HTMLElement && active0 !== document.body ? active0 : null);
  if (!root.isConnected) document.body.appendChild(root);
  const releaseScroll = o.scrollLock ? lockScroll() : null;

  let closed = false;
  let removed = false;
  let timer = 0;
  /** @type {Promise<*>|null} */
  let promise = null;
  let resolveClosed = () => {};
  let reasonOut;

  const layer = registerLayer({
    layer: layerNo,
    element: root,
    blocking: true,
    onEscape: (e) => (typeof o.onEscape === 'function' ? o.onEscape(e) : true),
    onTab: (e) => trapTab(e, dialog, layerNo),
    ...(typeof o.baseZ === 'function' ? { baseZ: o.baseZ } : {}),
  });
  // Focus moves into the dialog immediately (the opener is inert now); the initial target is chosen once laid out.
  try { dialog.focus({ preventScroll: true }); } catch { /* ignore */ }
  requestAnimationFrame(() => {
    if (closed) return;
    requestAnimationFrame(() => {
      if (closed) return;
      if (typeof o.onOpened === 'function') o.onOpened();
    });
  });

  const remove = () => {
    if (removed) return;
    removed = true;
    if (timer) clearTimeout(timer);
    timer = 0;
    root.hidden = true;
    if (root.parentNode) root.remove();
    resolveClosed(reasonOut);
  };

  /** Generic focus restore: the opener (through closed overlays' hand-offs) → the promoted-over layer → top boundary. */
  const genericRestore = (ctx) => {
    let resolved = followFocusHandoff(opener);
    if (resolved && root.contains(resolved)) resolved = null;
    if (!ctx.wasTop) {
      setFocusHandoff(root, resolved);
      return;
    }
    const over = ctx.over;
    const overTarget = over
      ? /** @type {HTMLElement|null} */ (over.querySelector('[role="dialog"], [role="alertdialog"]'))
        || (over instanceof HTMLElement ? over : null)
      : null;
    const chain = [resolved, overTarget].filter((t) => t instanceof HTMLElement && !root.contains(t));
    setFocusHandoff(root, chain[0] || null);
    if (!ctx.focusWasHere) return;
    let moved = false;
    for (const t of chain) {
      try { t.focus({ preventScroll: true }); } catch { /* ignore */ }
      if (document.activeElement === t) { moved = true; break; }
    }
    if (!moved) moved = restoreTopFocus(null) && !root.contains(document.activeElement);
    if (!moved && root.contains(document.activeElement) && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  };

  const defaultExitMs = () => {
    const measured = transitionEndMs(dialog, o.backdrop || null);
    return measured === null ? FALLBACK_EXIT_MS : measured + EXIT_MARGIN;
  };

  const handle = {
    root,
    dialog,
    layer,
    opener,
    get closed() { return closed; },
    close(reason) {
      if (promise) return promise;
      closed = true;
      reasonOut = reason;
      promise = new Promise((r) => { resolveClosed = r; });
      const wasTop = typeof o.wasTop === 'function' ? !!o.wasTop() : layer.isTop();
      const active = document.activeElement;
      // v0.21.1 F2b: focus in a popup anchored in this dialog (a portaled dropdown search) counts as "here"…
      const focusWasHere = !active || active === document.body || root.contains(active) || floatingContains(root, active);
      // …and those popups close now, not after the exit transition
      coverFloatingIn(root);
      /** @type {DialogCloseContext} */
      const ctx = { reason, wasTop, active, focusWasHere, over: layer.promotedOver };
      // Closing state first, and `inert` on the DIALOG (not the body child, whose inert inert-lock owns)
      root.setAttribute('data-state', 'closing');
      dialog.setAttribute('inert', '');
      if (typeof o.beforeRelease === 'function') o.beforeRelease(ctx);
      layer.release();
      if (releaseScroll) releaseScroll();
      if (typeof o.restoreFocus === 'function') o.restoreFocus(ctx);
      else genericRestore(ctx);
      if (typeof o.onClosing === 'function') {
        try { o.onClosing(reason, ctx); } catch (err) { console.error(err); }
      }
      if (!removed) {
        const ms = typeof o.exitMs === 'function' ? o.exitMs() : defaultExitMs();
        timer = setTimeout(remove, ms);
      }
      return promise;
    },
    release() {
      if (!promise) handle.close(undefined);
      remove();
    },
  };
  return handle;
}
