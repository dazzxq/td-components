/**
 * Root-aware focus read (v0.116.0, ADR 0045 QĐ3). Leaf module: no imports.
 *
 * `activeIn(node)` is the focused element as seen from `node`'s root: the Document in light DOM (identical to
 * `ownerDocument.activeElement`), the ShadowRoot inside the embed (where `document.activeElement` is the shadow
 * host). A detached node's root is its own top ancestor, which has no `activeElement`, so it falls back to the
 * owner document.
 * @param {Node | null | undefined} node
 * @returns {Element | null}
 */
export function activeIn(node) {
  if (!node) return null;
  const root = typeof node.getRootNode === 'function' ? node.getRootNode() : null;
  const scope = root && 'activeElement' in root ? root : node.ownerDocument;
  return scope?.activeElement ?? null;
}
