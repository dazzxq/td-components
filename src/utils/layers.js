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

function onKeydown(e) {
  if (e.key !== 'Escape' && e.key !== 'Tab') return;
  if (e.key === 'Escape' && (e.isComposing || e.keyCode === 229)) return; // IME: Escape cancels the composition
  const boundaries = active.filter((r) => r.keyboard === 'boundary');
  if (e.key === 'Escape') {
    const top = boundaries[boundaries.length - 1];
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

/**
 * Register an active overlay.
 * @param {{ layer: number, element: Element, blocking?: boolean, keyboard?: 'boundary'|'none',
 *           onEscape?: (e: KeyboardEvent) => (boolean|void), onTab?: (e: KeyboardEvent) => ('handled'|'pass'),
 *           includeInTrap?: boolean }} opts
 * @returns {{ release(): void, isTop(): boolean, readonly layer: number }}
 */
export function register(opts) {
  const reg = {
    layer: Number(opts.layer) || 0,
    element: opts.element,
    blocking: !!opts.blocking,
    keyboard: opts.keyboard === 'none' ? 'none' : 'boundary',
    onEscape: opts.onEscape,
    onTab: opts.onTab,
    includeInTrap: !!opts.includeInTrap,
    seq: ++seq,
    releaseInert: null,
  };
  reg.releaseInert = reg.blocking
    ? acquireInert([reg.element], reg.layer)
    : registerFloating(reg.element, reg.layer);
  active.push(reg);
  sort();
  ensureListener();
  let released = false;
  return {
    get layer() { return reg.layer; },
    release() {
      if (released) return;
      released = true;
      const i = active.indexOf(reg);
      if (i >= 0) active.splice(i, 1);
      reg.releaseInert();
      ensureListener();
    },
    /** true while this is the highest active keyboard boundary */
    isTop() {
      const b = active.filter((r) => r.keyboard === 'boundary');
      return b[b.length - 1] === reg;
    },
  };
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
    (el) => el.tabIndex >= 0 && !el.disabled && !el.closest('[hidden], [inert]') && el.getClientRects().length > 0,
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
