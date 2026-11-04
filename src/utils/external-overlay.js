/**
 * External overlays (ADR 0042): UI that is NOT the kit's — a WordPress `wp.media` frame, a third-party dialog, a
 * consent banner — opened as a direct child of `<body>` OVER a blocking kit layer (td-modal, td-drawer, the lightbox,
 * the loading overlay). While such an overlay is VISIBLE and ABOVE the top blocking layer, the kit steps aside:
 * no `inert` on it (inert-lock.js), no Tab trap, no Escape capture (layers.js), no scrim close (td-modal / td-drawer).
 *
 * The SITE declares what is external (owner Q1 — no heuristic):
 * - `registerExternalOverlay(matcher)` — a selector, an Element or a predicate `(el) => boolean`, tested against the
 *   direct children of `<body>` only (owner Q5: nested UI registers its outermost body-level container);
 * - or the attribute `data-td-external-overlay` on that body child (no JS needed).
 * Nothing registered and no attribute → every code path behaves exactly as before.
 *
 * "Above" compares the computed z-index of the body-level roots (ties: the later one in DOM order wins). A body child
 * that creates no stacking context (`z-index: auto`, e.g. the plain wrapper `wp.media` appends around its fixed
 * `.media-modal`) is ranked by the highest z-index among its own element children: those paint in the root stacking
 * context, so that is the z the user sees.
 *
 * Leaf module: imports nothing. No inline style, no `<style>`, no HTML parsing (CSP-strict).
 */

const ATTR = 'data-td-external-overlay';

/** @type {Map<string|Element|((el: Element) => boolean), number>} matcher → number of live registrations */
const matchers = new Map();
/** @type {Set<() => void>} */
const listeners = new Set();
let observer = null;
let queued = false;

const hasDom = () => typeof document !== 'undefined' && !!document.body;

function validSelector(sel) {
  if (typeof document === 'undefined') return false;
  try {
    document.createDocumentFragment().querySelector(sel);
    return true;
  } catch {
    return false;
  }
}

function matcherMatches(m, el) {
  if (typeof m === 'string') {
    try { return el.matches(m); } catch { return false; }
  }
  if (typeof m === 'function') {
    try { return m(el) === true; } catch {
      // SEC (security-model): a fixed message — the site's error is never echoed
      console.error('td-components: an external-overlay predicate threw; treated as "not external".');
      return false;
    }
  }
  return m === el;
}

/**
 * @internal whether `el` is a declared external overlay root (a direct child of `<body>` that carries the attribute or
 * matches a registered matcher).
 * @param {Element|null} el
 * @returns {boolean}
 */
export function isExternalRoot(el) {
  if (!hasDom() || !el || el.parentElement !== document.body) return false;
  if (el.hasAttribute(ATTR)) return true;
  for (const m of matchers.keys()) if (matcherMatches(m, el)) return true;
  return false;
}

function isShown(el) {
  if (el.hidden) return false;
  let cs;
  try { cs = getComputedStyle(el); } catch { return false; }
  if (cs.display === 'none' || cs.visibility === 'hidden') return false;
  if (parseFloat(cs.opacity) === 0) return false; // painted transparent = not shown (fail closed)
  return typeof el.getClientRects !== 'function' || el.getClientRects().length > 0;
}

/**
 * Whether a `z-index: auto` box still makes its own stacking context (its children's z-index cannot escape it).
 * Ambiguous → true (fail closed: the root then ranks at 0, below a kit overlay).
 * @param {CSSStyleDeclaration} cs
 */
function makesStackingContext(cs) {
  if (cs.position === 'fixed' || cs.position === 'sticky') return true;
  if (parseFloat(cs.opacity) < 1) return true;
  if ((cs.transform && cs.transform !== 'none') || (cs.filter && cs.filter !== 'none')) return true;
  // individual transform properties make a stacking context while `transform` still reads `none`
  for (const p of ['translate', 'scale', 'rotate']) if (cs[p] && cs[p] !== 'none') return true;
  if (cs.backdropFilter && cs.backdropFilter !== 'none') return true;
  if (cs.isolation === 'isolate' || (cs.mixBlendMode && cs.mixBlendMode !== 'normal')) return true;
  if ((cs.perspective && cs.perspective !== 'none') || (cs.clipPath && cs.clipPath !== 'none')) return true;
  if ((cs.maskImage && cs.maskImage !== 'none') || (cs.webkitMaskImage && cs.webkitMaskImage !== 'none')) return true;
  if (/\b(layout|paint|strict|content)\b/.test(cs.contain || '')) return true;
  // any will-change hint (other than auto / scroll-position / contents) may make one: fail closed
  const wc = (cs.willChange || 'auto').split(',').map((x) => x.trim()).filter((x) => x && !['auto', 'scroll-position', 'contents'].includes(x));
  if (wc.length) return true;
  return cs.containerType === 'size' || cs.containerType === 'inline-size';
}

/**
 * Whether a numeric `z-index` on `el` takes part in stacking: a positioned box, or a flex / grid item. Otherwise the
 * value is ignored by the browser (a static box with z-index 160000 still paints in normal order).
 * @param {Element} el
 * @param {CSSStyleDeclaration} cs
 */
function zEffective(el, cs) {
  if (cs.position && cs.position !== 'static') return true;
  let pd = '';
  try { pd = el.parentElement ? getComputedStyle(el.parentElement).display : ''; } catch { /* none */ }
  return /\b(flex|grid)\b/.test(pd);
}

/** The effective numeric z-index of `el`, or NaN when it is auto / ineffective. */
function effectiveZ(el, cs) {
  const z = parseInt(cs.zIndex, 10);
  return Number.isFinite(z) && zEffective(el, cs) ? z : NaN;
}

function zOf(el) {
  let cs;
  try { cs = getComputedStyle(el); } catch { return 0; }
  const z = effectiveZ(el, cs);
  if (Number.isFinite(z)) return z;
  if (makesStackingContext(cs)) return 0;
  // no stacking context of its own: its children paint in the root context — rank by the highest SHOWN one
  let best = 0;
  for (const c of el.children) {
    if (!isShown(c)) continue; // a hidden high-z child never lifts the root (security review v0.96.0)
    let cz = NaN;
    try { cz = effectiveZ(c, getComputedStyle(c)); } catch { /* auto */ }
    if (Number.isFinite(cz) && cz > best) best = cz;
  }
  return best;
}

/**
 * Pure order rule (exported for tests): A is above B when its z is higher, or equal and A comes later in the DOM.
 * @param {number} zA
 * @param {number} zB
 * @param {boolean} aAfterB
 * @returns {boolean}
 */
export function isAbove(zA, zB, aAfterB) {
  return zA > zB || (zA === zB && aAfterB);
}

/** The direct child of `<body>` that contains `node` (null when it is not inside one). */
function bodyRootOf(node) {
  if (!hasDom() || !node) return null;
  let n = node;
  while (n && n.parentElement !== document.body) n = n.parentElement;
  return n || null;
}

function aboveRoot(ext, root) {
  if (ext === root) return false;
  // eslint-disable-next-line no-bitwise
  const after = !!(root.compareDocumentPosition(ext) & 4); // DOCUMENT_POSITION_FOLLOWING
  return isAbove(zOf(ext), zOf(root), after);
}

/**
 * @internal `true` when `el` is a declared external overlay that is visible and above every body-level root of `keepEls`
 * (the elements a blocking lease keeps interactive). No usable keep element → false.
 * @param {Element} el a direct child of `<body>`
 * @param {Element[]} keepEls
 * @returns {boolean}
 */
export function externalAbove(el, keepEls) {
  if (!isExternalRoot(el) || !isShown(el)) return false;
  const roots = (keepEls || []).map(bodyRootOf).filter(Boolean);
  if (!roots.length) return false;
  return roots.every((r) => aboveRoot(el, r));
}

/**
 * @internal the first declared external overlay that is visible and above the body-level root holding `refEl`, or null.
 * Fast path: nothing registered and no attribute in the page → null without reading styles.
 * @param {Element|null} refEl
 * @returns {Element|null}
 */
export function externalOverlayAbove(refEl) {
  if (!hasDom() || !refEl) return null;
  if (!matchers.size && !document.body.querySelector(`:scope > [${ATTR}]`)) return null;
  const root = bodyRootOf(refEl);
  if (!root) return null;
  for (const el of document.body.children) {
    if (el !== root && isExternalRoot(el) && isShown(el) && aboveRoot(el, root)) return el;
  }
  return null;
}

function notify() {
  if (queued || !listeners.size) return;
  queued = true;
  queueMicrotask(() => {
    queued = false;
    for (const cb of [...listeners]) {
      try { cb(); } catch (err) { console.error(err); }
    }
  });
}

const MOTION_EVENTS = ['transitionend', 'transitioncancel', 'animationend', 'animationcancel'];

/** @param {Event} e */
function onMotionEnd(e) {
  const t = e.target;
  if (!t || t.nodeType !== 1 || !anyDeclared()) return;
  const root = bodyRootOf(t);
  if (root && isExternalRoot(root)) notify();
}

let lastAny = false;
function anyDeclared() {
  return matchers.size > 0 || !!document.body.querySelector(`:scope > [${ATTR}]`);
}

function observeChildren() {
  if (!observer) return; // stopped meanwhile (last consumer gone while a record was still queued)
  // a declared root is watched with its subtree too (a persistent wrapper whose nested dialog shows / hides)
  for (const c of document.body.children) {
    // childList too: a nested dialog inserted / removed inside a persistent wrapper (or a child that makes a
    // predicate match) resyncs
    // EVERY attribute (no filter): a registered selector / predicate may depend on any of them, and losing a match must
    // re-inert the root at once (security review v0.96.0 r4)
    observer.observe(c, { attributes: true, childList: true, subtree: isExternalRoot(c) });
  }
}

function startObserver() {
  if (observer || typeof MutationObserver === 'undefined' || !hasDom()) return;
  observer = new MutationObserver((records, self) => {
    // a stale observer (stopped / restarted while its records were queued) must not touch the current one
    if (self !== observer) return;
    // follow new body children; a root that just became declared (attribute added) starts its subtree watch
    // (any observed attribute on a direct child: a class / style change can make a selector / predicate match it)
    if (records.some((r) => r.type === 'childList' || (r.type === 'attributes' && r.target.parentElement === document.body))) {
      observeChildren();
    }
    // nothing declared now nor at the last check → the answer cannot have changed (a popup repositioning itself
    // through CSSOM costs no resync)
    const any = anyDeclared();
    if (!any && !lastAny) return;
    lastAny = any;
    notify();
  });
  observer.observe(document.body, { childList: true });
  observeChildren();
  // a fade / animation ends without any mutation: recompute when one finishes inside a declared root
  for (const t of MOTION_EVENTS) document.addEventListener(t, onMotionEnd, true);
  lastAny = anyDeclared();
}

/**
 * @internal call `cb` (batched in a microtask) whenever the "visible external overlay above" answer may have changed:
 * body children added / removed, a style / class / hidden / attribute change on one of them, or the registry changing.
 * Listeners recompute their own state (nothing is passed).
 * @param {() => void} cb
 * @returns {() => void} unsubscribe (idempotent)
 */
export function onExternalOverlayChange(cb) {
  if (typeof cb !== 'function') return () => {};
  listeners.add(cb);
  startObserver();
  let done = false;
  return () => {
    if (done) return;
    done = true;
    listeners.delete(cb);
    if (!listeners.size && observer) {
      observer.disconnect();
      observer = null;
      for (const t of MOTION_EVENTS) document.removeEventListener(t, onMotionEnd, true);
    }
  };
}

/**
 * Declare UI the kit does not own (opened as a direct child of `<body>`) as an external overlay: while it is visible and
 * above a blocking kit layer, that layer does not inert it, trap Tab, capture Escape or close on a scrim click.
 * @param {string|Element|((el: Element) => boolean)} matcher a selector, an element, or a predicate — tested against
 *   the direct children of `<body>` only. An invalid selector / other value logs a fixed error and registers nothing.
 * @returns {() => void} unregister (idempotent)
 */
export function registerExternalOverlay(matcher) {
  const ok = (typeof matcher === 'string' && matcher.trim() !== '' && validSelector(matcher))
    || typeof matcher === 'function'
    || (typeof Element !== 'undefined' && matcher instanceof Element);
  if (!ok) {
    console.error('td-components: registerExternalOverlay() needs a valid selector, an Element or a function.');
    return () => {};
  }
  // the same matcher registered twice is ref-counted: it stays until every registration is undone
  const n = matchers.get(matcher) || 0;
  matchers.set(matcher, n + 1);
  if (observer) observeChildren();
  if (!n) notify();
  let done = false;
  return () => {
    if (done) return;
    done = true;
    const left = (matchers.get(matcher) || 1) - 1;
    if (left > 0) { matchers.set(matcher, left); return; }
    matchers.delete(matcher);
    notify();
  };
}
