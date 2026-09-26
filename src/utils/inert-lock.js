/**
 * Shared, ref-counted background `inert` for blocking overlays (TdLoading, td-lightbox, …). Same idea as
 * scroll-lock.js: every overlay takes a LEASE; the manager computes which `<body>` children must be inert.
 *
 * - A lease names the elements it keeps interactive (its own overlay). `#td-toast-container` is always kept.
 * - FLOATING registrations (registerFloating: dropdown menu, tooltip, toast container) never inert anything; they
 *   only exempt their element from LOWER blocking leases (a menu opened inside a modal stays usable).
 * - Leases stack by `layer` (the overlay's z-index token; ties: later lease on top): an element kept by a
 *   HIGHER layer is exempt from LOWER leases, so a loading overlay (480) opened over the lightbox (350) stays
 *   usable, while the lightbox becomes inert under it — in either opening order.
 * - `inert` is removed only when no lease requires it any more; elements that were inert before (set by the
 *   site) are never touched.
 * - Body children appended while a lease is active are handled (MutationObserver on `<body>` childList).
 */

/** @type {Array<{ keep: Set<Element>, layer: number, seq: number, blocking: boolean }>} */
const leases = [];
/** Elements WE made inert. */
const managed = new Set();
let seq = 0;
let observer = null;

function isKeptByHigher(el, index) {
  for (let j = index + 1; j < leases.length; j++) if (leases[j].keep.has(el)) return true;
  return false;
}

function shouldBeInert(el) {
  if (el.id === 'td-toast-container') return false;
  for (let i = 0; i < leases.length; i++) {
    if (!leases[i].blocking || leases[i].keep.has(el)) continue;
    if (!isKeptByHigher(el, i)) return true;
  }
  return false;
}

function sync() {
  if (typeof document === 'undefined' || !document.body) return;
  for (const el of document.body.children) {
    const want = shouldBeInert(el);
    if (want && !managed.has(el)) {
      if (el.hasAttribute('inert')) continue; // the site's own inert: never ours to remove
      el.setAttribute('inert', '');
      managed.add(el);
    } else if (!want && managed.has(el)) {
      el.removeAttribute('inert');
      managed.delete(el);
    }
  }
  for (const el of [...managed]) {
    if (el.parentNode !== document.body) {
      el.removeAttribute('inert');
      managed.delete(el);
    }
  }
}

function addLease(keep, layer, blocking) {
  if (typeof document === 'undefined') return () => {};
  const lease = { keep: new Set(keep.filter(Boolean)), layer: Number(layer) || 0, seq: ++seq, blocking };
  leases.push(lease);
  leases.sort((a, b) => a.layer - b.layer || a.seq - b.seq);
  if (!observer && typeof MutationObserver !== 'undefined' && document.body) {
    observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true });
  }
  sync();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const i = leases.indexOf(lease);
    if (i >= 0) leases.splice(i, 1);
    sync();
    if (!leases.length && observer) {
      observer.disconnect();
      observer = null;
    }
  };
}

/**
 * Take a blocking inert lease.
 * @param {Element[]} keep elements that stay interactive (the overlay itself)
 * @param {number} [layer=0] stacking layer (use the overlay's z-index token value)
 * @returns {() => void} release (idempotent)
 */
export function acquireInert(keep = [], layer = 0) {
  return addLease(keep, layer, true);
}

/**
 * Register a non-blocking floating element (portaled to `<body>`): exempt from LOWER blocking leases, never
 * inerts anything. A blocking lease at a higher layer still inerts it.
 * @param {Element} el
 * @param {number} layer
 * @returns {() => void} release (idempotent)
 */
export function registerFloating(el, layer = 0) {
  return addLease([el], layer, false);
}

/** @returns {boolean} whether a floating registration above `layer` is active */
export function hasFloatingAbove(layer) {
  const l = Number(layer) || 0;
  return leases.some((x) => !x.blocking && x.layer > l);
}
