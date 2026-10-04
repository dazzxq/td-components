/**
 * Overlay layer registry + keyboard arbitration (plan v0.9.0 "Layer ownership").
 *
 * - LAYERS mirrors the z-index tokens in tokens.css (keep both in sync).
 * - register() records an active overlay for its lifetime (open → close). Blocking registrations (modal, lightbox,
 *   loading) take an inert lease (everything below becomes inert); floating ones (dropdown menu, tooltip, toast
 *   container) never inert anything but are exempt from LOWER blocking leases.
 * - Keyboard: one capture-phase `keydown` listener walks active registrations from the top, considering only
 *   `keyboard: 'boundary'` ones:
 *     Escape → the highest boundary; consumed unless its onEscape(e) returns false (e.g. media controls).
 *     Tab    → the highest boundary with onTab; 'pass' hands it to the next lower one. Blocking traps may include
 *              focusables of higher registrations that opt in (`includeInTrap`, e.g. toasts) — trapContainers().
 *   Escape skips a boundary whose `wantsEscape(e)` returns false (v0.21.1: a hover tooltip above an open popup).
 * - v0.21.1 anchor lifetime: floating registrations may name their `anchor` (the trigger) and an `onCovered()` hook.
 *   A newer BLOCKING registration below a floating one covers it (onCovered: the popup closes without focusing its
 *   now-inert trigger; `coverAlways` = also under higher blocking layers, e.g. the tooltip under the loading overlay).
 *   coverFloatingIn(root) / floatingContains(root, node) / childFloatingIn(container) let a closing modal / lightbox
 *   / hovercard take the popups anchored inside it along.
 * - v0.21.1 band promotion: a blocking registration in the modal/lightbox band [LAYERS.lightbox, LAYERS.popover)
 *   opened over a HIGHER in-band one (a lightbox opened from a modal) gets the logical layer above it (capped below
 *   the popover) and a visual z-index of that element's computed z-index + 1 (CSSOM). Loading / toast / tooltip and
 *   everything outside the band never move.
 */
import { acquireInert, registerFloating } from './inert-lock.js';

export const LAYERS = Object.freeze({
  dropdown: 100,
  overlay: 300,
  lightbox: 350,
  modal: 400,
  popover: 450,
  loading: 480,
  toast: 500,
  tooltip: 510,
});

/** @type {Array<object>} active registrations, sorted by layer then registration order */
const active = [];
let seq = 0;
let listening = false;

function sort() {
  active.sort((a, b) => a.layer - b.layer || a.seq - b.seq);
}

function wantsEscape(r, e) {
  if (typeof r.wantsEscape !== 'function') return true;
  try { return r.wantsEscape(e) !== false; } catch (err) { console.error(err); return true; }
}

function onKeydown(e) {
  if (e.key !== 'Escape' && e.key !== 'Tab') return;
  if (e.key === 'Escape' && (e.isComposing || e.keyCode === 229)) return; // IME: Escape cancels the composition
  const boundaries = active.filter((r) => r.keyboard === 'boundary');
  if (e.key === 'Escape') {
    // the highest boundary that wants it (a hover tooltip hands Escape to the popup below it — v0.21.1)
    let top = null;
    for (let i = boundaries.length - 1; i >= 0 && !top; i--) if (wantsEscape(boundaries[i], e)) top = boundaries[i];
    if (!top) return;
    let consumed = true;
    if (typeof top.onEscape === 'function') {
      try { consumed = top.onEscape(e) !== false; } catch (err) { console.error(err); }
    }
    if (consumed) {
      e.preventDefault();
      e.stopPropagation();
    }
    return;
  }
  for (let i = boundaries.length - 1; i >= 0; i--) {
    const r = boundaries[i];
    if (typeof r.onTab !== 'function') continue;
    let result = 'pass';
    try { result = r.onTab(e); } catch (err) { console.error(err); }
    if (result !== 'pass') return;
  }
}

function ensureListener() {
  if (typeof document === 'undefined') return;
  if (active.length && !listening) {
    document.addEventListener('keydown', onKeydown, true);
    listening = true;
  } else if (!active.length && listening) {
    document.removeEventListener('keydown', onKeydown, true);
    listening = false;
  }
}

const inBand = (layer) => layer >= LAYERS.lightbox && layer < LAYERS.popover;

/** Elements whose inline z-index the band promotion wrote (cleared when they register again unpromoted). */
const bandZ = new WeakSet();

const computedZ = (el) => {
  const z = parseInt(getComputedStyle(el).zIndex, 10);
  return Number.isFinite(z) ? z : 0;
};

const isActiveElement = (el) => !!el && active.some((o) => o.element === el);

/** The normal z of a band registration: `baseZ()` (BASE_Z_INDEX, written inline by its owner) or null (token). */
function baseZOf(r) {
  if (!r.baseZ) return null;
  const b = r.baseZ();
  return typeof b === 'number' && Number.isFinite(b) ? b : null;
}

/**
 * Undo the inline z-index the promotion wrote on `r.element`: back to the owner's BASE_Z_INDEX value, or to the token
 * (inline removed).
 */
function unwindBandZ(r) {
  const el = r.element;
  if (typeof HTMLElement === 'undefined' || !(el instanceof HTMLElement) || !bandZ.has(el)) return;
  bandZ.delete(el);
  const base = baseZOf(r);
  if (base !== null) el.style.setProperty('z-index', String(base));
  else el.style.removeProperty('z-index');
}

/**
 * Visual z-index of the promoted band registrations (v0.21.1), in opening order: max(own normal z, computed z of the
 * element it was promoted over + 1). Once that element is no longer open the promotion ends: the reference is cleared
 * and the element goes back to its normal z (token, or `baseZ()` = TdModalStackManager.BASE_Z_INDEX). Called on
 * register / release and by TdModalStackManager._sync() (which rewrites BASE_Z_INDEX z-indexes).
 */
export function restackBand() {
  if (typeof document === 'undefined') return;
  const promoted = active.filter((r) => r.promotedOver).sort((a, b) => a.seq - b.seq);
  for (const r of promoted) {
    const el = r.element;
    if (!(el instanceof HTMLElement)) continue;
    unwindBandZ(r);
    if (!isActiveElement(r.promotedOver)) {
      r.promotedOver = null; // the layer below closed: normal z from now on (the logical layer keeps its order)
      continue;
    }
    const base = baseZOf(r);
    const normal = base !== null ? base : computedZ(el);
    const z = Math.max(normal, computedZ(r.promotedOver) + 1);
    if (z > normal) {
      el.style.setProperty('z-index', String(z));
      bandZ.add(el);
    }
  }
}

/**
 * Register an active overlay.
 * @param {{ layer: number, element: Element, blocking?: boolean, keyboard?: 'boundary'|'none',
 *           onEscape?: (e: KeyboardEvent) => (boolean|void), onTab?: (e: KeyboardEvent) => ('handled'|'pass'),
 *           includeInTrap?: boolean, wantsEscape?: (e: KeyboardEvent) => boolean, anchor?: Element|null,
 *           onCovered?: () => void, coverAlways?: boolean, baseZ?: () => (number|null) }} opts
 *   Internal options (v0.21.1): `wantsEscape` (false → Escape goes to the next lower boundary); floating `anchor`
 *   (the trigger) + `onCovered` (close without focusing the trigger) + `coverAlways`; blocking `baseZ` (the normal
 *   inline z-index of a promoted dialog, see restackBand()).
 * @returns {{ release(): void, isTop(): boolean, isNewest(): boolean, readonly layer: number,
 *             readonly promotedOver: Element|null }}
 */
export function register(opts) {
  const reg = {
    layer: Number(opts.layer) || 0,
    element: opts.element,
    blocking: !!opts.blocking,
    keyboard: opts.keyboard === 'none' ? 'none' : 'boundary',
    onEscape: opts.onEscape,
    onTab: opts.onTab,
    wantsEscape: typeof opts.wantsEscape === 'function' ? opts.wantsEscape : null,
    includeInTrap: !!opts.includeInTrap,
    anchor: typeof Element !== 'undefined' && opts.anchor instanceof Element ? opts.anchor : null,
    onCovered: typeof opts.onCovered === 'function' ? opts.onCovered : null,
    coverAlways: !!opts.coverAlways,
    baseZ: typeof opts.baseZ === 'function' ? opts.baseZ : null,
    promotedOver: null,
    seq: ++seq,
    releaseInert: null,
  };
  if (reg.blocking && inBand(reg.layer)) {
    if (typeof HTMLElement !== 'undefined' && reg.element instanceof HTMLElement && bandZ.has(reg.element)) {
      reg.element.style.removeProperty('z-index'); // a persistent overlay (lightbox) opening again
      bandZ.delete(reg.element);
    }
    // Opening order wins inside the band: over a HIGHER in-band blocking layer (a lightbox opened from a modal) this
    // one goes just above it. Equal layers (modal over modal) already stack by order + DOM order.
    const band = active.filter((r) => r.blocking && inBand(r.layer));
    const top = band[band.length - 1];
    if (top && top.layer > reg.layer) {
      reg.layer = Math.min(LAYERS.popover - 1, top.layer + 1);
      reg.promotedOver = top.element;
    }
  }
  reg.releaseInert = reg.blocking
    ? acquireInert([reg.element], reg.layer)
    : registerFloating(reg.element, reg.layer);
  active.push(reg);
  sort();
  ensureListener();
  if (reg.promotedOver) restackBand();
  if (reg.blocking) {
    // A newer blocking layer BELOW an open popup covers it (a modal opened by code over a dropdown in a lower modal):
    // the popup closes; focus goes into the new layer. coverAlways (tooltip): under any newer blocking layer.
    active.filter((r) => !r.blocking && r.onCovered && r.seq < reg.seq && (r.coverAlways || reg.layer < r.layer))
      .forEach(callCovered);
  }
  let released = false;
  return {
    get layer() { return reg.layer; },
    /** the open blocking element this one was promoted above (null when not promoted, or once that one closed) */
    get promotedOver() { return isActiveElement(reg.promotedOver) ? reg.promotedOver : null; },
    release() {
      if (released) return;
      released = true;
      const i = active.indexOf(reg);
      if (i >= 0) active.splice(i, 1);
      reg.releaseInert();
      ensureListener();
      // promotion state never outlives the registration: inline z back to normal, reference dropped (a lightbox that
      // closed over a modal fades out at its token z, under the modal)
      unwindBandZ(reg);
      reg.promotedOver = null;
      if (active.some((r) => r.promotedOver)) restackBand();
    },
    /** true while this is the highest active keyboard boundary */
    isTop() {
      const b = active.filter((r) => r.keyboard === 'boundary');
      return b[b.length - 1] === reg;
    },
    /** true while this is the most recently registered active keyboard boundary */
    isNewest() {
      let newest = null;
      for (const r of active) if (r.keyboard === 'boundary' && (!newest || r.seq > newest.seq)) newest = r;
      return newest === reg;
    },
  };
}

function callCovered(r) {
  if (!active.includes(r)) return; // closed meanwhile (e.g. by an earlier onCovered)
  try { r.onCovered(); } catch (err) { console.error(err); }
}

const anchoredIn = (root, r) => !r.blocking && !!r.anchor && !!root && root.contains(r.anchor);

/**
 * Floating registrations whose anchor lies inside `container` (a hovercard's child menu, the popups of a dialog).
 * @param {Element} container
 * @returns {Array<{ element: Element, anchor: Element }>}
 */
export function childFloatingIn(container) {
  return active.filter((r) => anchoredIn(container, r)).map((r) => ({ element: r.element, anchor: r.anchor }));
}

/**
 * Whether `node` lies in a floating registration anchored inside `root` (focus in the portaled search of a dropdown
 * of a dialog counts as "in the dialog").
 * @param {Element} root
 * @param {Node|null} node
 * @returns {boolean}
 */
export function floatingContains(root, node) {
  if (typeof Node === 'undefined' || !(node instanceof Node)) return false;
  return active.some((r) => anchoredIn(root, r) && !!r.element && r.element.contains(node));
}

/**
 * Close (onCovered) every floating registration anchored inside `root`: a closing modal / lightbox / hovercard takes
 * its popups along at once, not after its exit transition.
 * @param {Element} root
 */
export function coverFloatingIn(root) {
  active.filter((r) => anchoredIn(root, r) && r.onCovered).forEach(callCovered);
}

/** @returns {boolean} whether a keyboard-boundary registration above `layer` is active */
export function hasActiveAbove(layer) {
  return active.some((r) => r.keyboard === 'boundary' && r.layer > layer);
}

/**
 * Extra containers a blocking focus trap at `layer` must include (higher registrations with includeInTrap).
 * @param {number} layer
 * @returns {Element[]}
 */
export function trapContainers(layer) {
  return active.filter((r) => r.includeInTrap && r.layer > layer && r.element).map((r) => r.element);
}

const FOCUSABLE = 'a[href], area[href], button, input:not([type="hidden"]), select, textarea, summary, iframe, '
  + 'object, embed, video[controls], audio[controls], [tabindex], [contenteditable]:not([contenteditable="false"])';

/**
 * Visible, sequentially focusable descendants of `root` (in DOM order): native focusables + [tabindex], filtered by
 * the element's own tabIndex (≥ 0), `disabled`, `[hidden]`/`[inert]` ancestors and rendering.
 * @param {Element} root
 * @returns {HTMLElement[]}
 */
export function focusablesIn(root) {
  if (!root) return [];
  return [...root.querySelectorAll(FOCUSABLE)].filter(
    (el) => el.tabIndex >= 0 && !el.matches(':disabled') && !el.closest('[hidden], [inert]')
      && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden',
  );
}

/**
 * Tab-trap helper for blocking boundaries: cycles through `container`'s focusables plus those of higher
 * `includeInTrap` registrations (toasts). Inside the container, Tab moves natively (media controls keep their
 * internal order); at the edges, into/out of the extra containers, and from anywhere outside, focus is moved
 * explicitly. Always 'handled'.
 * @param {KeyboardEvent} e
 * @param {HTMLElement} container the dialog / overlay (focused itself when it has no focusables)
 * @param {number} layer
 * @returns {'handled'}
 */
export function trapTab(e, container, layer) {
  const own = focusablesIn(container);
  const nodes = [...own, ...trapContainers(layer).flatMap(focusablesIn)];
  if (!nodes.length) {
    e.preventDefault();
    container.focus({ preventScroll: true });
    return 'handled';
  }
  const active = document.activeElement;
  let i = nodes.indexOf(/** @type {HTMLElement} */ (active));
  if (i < 0 && active instanceof Node && container.contains(active)) {
    // focus on a non-listed node inside the dialog (the dialog itself, a media control): leave interior moves native
    if (active !== container) return 'handled';
    i = e.shiftKey ? 0 : -1;
  }
  const step = e.shiftKey ? -1 : 1;
  const target = i < 0 && !(active === container) ? (e.shiftKey ? nodes.length - 1 : 0)
    : (i + step + nodes.length) % nodes.length;
  const interior = i >= 0 && i < own.length && target < own.length && target === i + step;
  if (interior) return 'handled'; // native move stays inside the dialog
  e.preventDefault();
  nodes[target].focus({ preventScroll: true });
  return 'handled';
}

/**
 * Focus hand-off for overlays that close while a HIGHER layer holds focus (e.g. a modal closed under the loading
 * overlay): the closing container records where focus should go instead; restoreFocus() follows the chain.
 * @param {Element} container the closing overlay root
 * @param {HTMLElement|null} target its resolved restore target
 */
export function setFocusHandoff(container, target) {
  if (!container) return;
  /** @type {any} */ (container)._tdFocusHandoff = target || null;
  container.setAttribute('data-td-focus-handoff', '');
}

/** Forget a container's hand-off (a persistent overlay that opens again, e.g. the lightbox). */
export function clearFocusHandoff(container) {
  if (!container) return;
  delete /** @type {any} */ (container)._tdFocusHandoff;
  container.removeAttribute('data-td-focus-handoff');
}

function usable(el) {
  if (!(el instanceof HTMLElement) || !el.isConnected) return false;
  if (el.matches(':disabled') || el.closest('[inert], [hidden], [data-td-focus-handoff]')) return false;
  return el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
}

/**
 * Follow hand-offs from `saved` (also through containers already removed from the DOM). Record-time helper: the
 * result may be temporarily inert (under a higher blocking layer); restoreFocus() checks usability at restore time.
 * @param {HTMLElement|null} saved
 * @returns {HTMLElement|null}
 */
export function followFocusHandoff(saved) {
  let t = saved;
  const seen = new Set();
  while (t instanceof HTMLElement && !seen.has(t)) {
    seen.add(t);
    const c = t.closest('[data-td-focus-handoff]'); // works in detached subtrees too
    if (!c) break;
    t = /** @type {any} */ (c)._tdFocusHandoff || null;
  }
  return t instanceof HTMLElement ? t : null;
}

/**
 * followFocusHandoff() + usable now (connected, enabled, rendered, not inert/hidden).
 * @param {HTMLElement|null} saved
 * @returns {HTMLElement|null}
 */
export function resolveFocusTarget(saved) {
  const t = followFocusHandoff(saved);
  return usable(t) ? t : null;
}

const tryFocus = (el) => {
  if (!(el instanceof HTMLElement)) return false;
  try { el.focus({ preventScroll: true }); } catch { return false; }
  return document.activeElement === el;
};

/**
 * Restore focus to `saved` (a blocking overlay's opener), following hand-offs of containers that closed meanwhile;
 * if that fails, the top keyboard boundary's dialog/element; else focus is left alone.
 * @param {HTMLElement|null} saved
 * @returns {boolean} whether focus was moved
 */
export function restoreFocus(saved) {
  if (tryFocus(resolveFocusTarget(saved))) return true;
  const b = active.filter((r) => r.keyboard === 'boundary' && r.element instanceof HTMLElement);
  const top = b[b.length - 1];
  if (!top) return false;
  const el = /** @type {HTMLElement} */ (top.element);
  return tryFocus(el.querySelector('[role="dialog"], [role="alertdialog"]')) || tryFocus(el);
}

/* ------------------------------------------------------------------ v0.36.0 internal: swallowed outside press */

/** @type {null|{ id: number, timer: number, up: (e: Event) => void, click: (e: Event) => void, down: () => void }} */
let swallowed = null;

function clearSwallowedPress() {
  const st = swallowed;
  if (!st) return;
  swallowed = null;
  clearTimeout(st.timer);
  window.removeEventListener('pointerup', st.up, true);
  window.removeEventListener('click', st.click, true);
  window.removeEventListener('pointerdown', st.down, true);
}

/**
 * INTERNAL (v0.36.0, not a public API): the rest of a MOUSE press that only dismissed a popup is swallowed — its
 * pointerup (same pointerId) and the click it generates never reach the page (e.g. the lightbox image would zoom). The
 * guard ends with that click, the next pointerdown, or after 1 s. The caller already prevented + stopped the pointerdown.
 * @param {number} pointerId
 */
export function swallowPointerPress(pointerId) {
  if (typeof window === 'undefined') return;
  clearSwallowedPress();
  const stop = (e) => { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); };
  const st = {
    id: pointerId,
    timer: 0,
    up: (e) => { if (/** @type {PointerEvent} */ (e).pointerId === st.id) stop(e); },
    click: (e) => { stop(e); clearSwallowedPress(); },
    down: () => clearSwallowedPress(),
  };
  // added while the swallowed pointerdown is still being dispatched (document capture): window capture is already
  // behind it, so `down` only sees the NEXT press
  window.addEventListener('pointerup', st.up, true);
  window.addEventListener('click', st.click, true);
  window.addEventListener('pointerdown', st.down, true);
  st.timer = setTimeout(clearSwallowedPress, 1000);
  swallowed = st;
}

