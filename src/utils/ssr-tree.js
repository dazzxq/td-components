/**
 * v0.45.0 (plan v0.45.0-steps-timeline QĐ G3) — strict SSR gate helper: is the server markup EXACTLY the tree the
 * component would build? Element by element: same local name + namespace, the same attribute names with the same
 * values (nothing more), the same children. Whitespace-only text between elements is tolerated where the expected node
 * has element children only; comments, extra nodes, handlers, `style` — any difference → false.
 * Two escape hatches, marked on EXPECTED nodes by the builder:
 * - `wildText`: the actual node may hold any TEXT (leaf, no element) — text the component recomputes right after the
 *   hydrate (a day label "Hôm nay" printed by yesterday's cache);
 * - `iconSlot` (a WeakMap expected slot → the canonical registry `<svg>` for its name, or null for a name the registry
 *   does not know): the actual slot is EMPTY or holds exactly that SVG (same tree, attributes, namespace — review
 *   ISSUE-1); anything else is a mismatch.
 * Internal module (no package subpath).
 * @module utils/ssr-tree
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * @param {Node[]} actual children of the host (live markup)
 * @param {Node[]} expected children built by the component
 * @param {{ wildText?: WeakSet<Element>, iconSlot?: WeakMap<Element, Element|null> }} [marks]
 * @returns {boolean}
 */
export function sameChildren(actual, expected, marks = {}) {
  const exp = [...expected];
  const elementsOnly = exp.every((n) => n.nodeType === 1);
  const act = [];
  for (const n of actual) {
    if (n.nodeType === 3 && elementsOnly && !/\S/.test(n.data)) continue;
    if (n.nodeType !== 1 && n.nodeType !== 3) return false;
    act.push(n);
  }
  if (act.length !== exp.length) return false;
  return act.every((a, i) => sameNode(a, exp[i], marks));
}

/** @param {Node} a actual @param {Node} e expected */
function sameNode(a, e, marks) {
  if (e.nodeType === 3) return a.nodeType === 3 && a.data === e.data;
  if (a.nodeType !== 1 || a.localName !== e.localName || a.namespaceURI !== e.namespaceURI) return false;
  const names = e.getAttributeNames();
  if (a.getAttributeNames().length !== names.length) return false;
  for (const n of names) if (a.getAttribute(n) !== e.getAttribute(n)) return false;
  if (marks.wildText?.has(e)) return [...a.childNodes].every((c) => c.nodeType === 3);
  if (marks.iconSlot?.has(e)) {
    const kids = [...a.childNodes];
    if (!kids.length) return true;
    const svg = marks.iconSlot.get(e);
    return !!svg && kids.length === 1 && svg.namespaceURI === SVG_NS && sameNode(kids[0], svg, {});
  }
  return sameChildren(a.childNodes, e.childNodes, marks);
}
