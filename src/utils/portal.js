/**
 * v0.121.0 (plan v0.121.0-portal-root QĐ1): where a body-portalling popup puts its floating root.
 *
 * `resolvePortalRoot(host)`, in order:
 * 1. `host.portalRoot` when it is a CONNECTED Element or ShadowRoot (the property wins). Any other non-null value
 *    (Text, Document, DocumentFragment, a disconnected node, a string…) is ignored with one console warning per host
 *    and value, and resolution continues;
 * 2. `host.getRootNode()` when `portal="local"` and that root is a ShadowRoot;
 * 3. `document.body` (the default: the behaviour before v0.121.0).
 * Generic (the same attribute / property names for every popup that adopts it); v0.121.0 adopts it in td-dropdown.
 */

/** @type {WeakMap<object, unknown>} host → the last invalid `portalRoot` value warned about */
const warned = new WeakMap();

const isShadowRoot = (v) => typeof ShadowRoot !== 'undefined' && v instanceof ShadowRoot;
const isElement = (v) => typeof Element !== 'undefined' && v instanceof Element;

/**
 * @param {Element & { portalRoot?: unknown }} host
 * @returns {Element|ShadowRoot} the node the popup root is appended to
 */
export function resolvePortalRoot(host) {
  const p = host ? host.portalRoot : null;
  if (p != null) {
    if ((isElement(p) || isShadowRoot(p)) && p.isConnected) return /** @type {Element|ShadowRoot} */ (p);
    if (warned.get(host) !== p) {
      warned.set(host, p);
      console.warn(`<${host.localName}>: portalRoot must be a connected Element or ShadowRoot — ignored (portal attribute / document.body used).`, host);
    }
  }
  if (host && typeof host.getAttribute === 'function' && host.getAttribute('portal') === 'local'
    && typeof host.getRootNode === 'function') {
    const root = host.getRootNode();
    if (isShadowRoot(root)) return root;
  }
  return document.body;
}
