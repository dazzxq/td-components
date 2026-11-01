/**
 * v0.88.0 (plan v0.88.0-rich-text, lane B): the ProseMirror schema of <td-rich-text>, built from the policy allowlist.
 * The document is paragraphs + hard breaks; only the ENABLED marks exist, so anything else in the input is dropped by
 * the parser itself (its text is kept). Parsing reads tags only — never `style` (no `font-weight` → bold).
 *
 * `PM` (the engine module) is a parameter so a test can pass ProseMirror from node_modules instead of the bundle.
 */

import { isSafeUrl, linkAttrsFrom, linkRel } from './rich-text-policy.js';

/** feature → mark name, in mark order (outermost → innermost): link wraps strong wraps em wraps u wraps s. */
export const RICH_TEXT_MARKS = Object.freeze([
  ['link', 'link'],
  ['bold', 'strong'],
  ['italic', 'em'],
  ['underline', 'u'],
  ['strike', 's'],
]);

/**
 * @param {{ Schema: Function }} PM - engine module (needs `Schema`)
 * @param {string[]} features - from resolveFeatures
 * @param {{ allowHttp?: boolean }} [opts] - v0.91.0: `linkTarget` is no longer a schema option (target is per link);
 *   it is ignored if passed
 * @returns {object} ProseMirror Schema
 */
export function buildSchema(PM, features, { allowHttp = false } = {}) {
  const on = Array.isArray(features) ? features : [];

  const nodes = {
    doc: { content: 'block+' },
    paragraph: {
      content: 'inline*',
      group: 'block',
      parseDOM: [{ tag: 'p' }],
      toDOM: () => ['p', 0],
    },
    text: { group: 'inline' },
    hard_break: {
      inline: true,
      group: 'inline',
      selectable: false,
      parseDOM: [{ tag: 'br' }],
      toDOM: () => ['br'],
      leafText: () => '\n',
    },
  };

  /** @type {Record<string, object>} */
  const defs = {
    // v0.91.0: target / noreferrer per link (linkAttrsFrom). Output attribute order: href, rel, target.
    link: {
      attrs: { href: {}, target: { default: null }, noreferrer: { default: false } },
      inclusive: false,
      parseDOM: [{
        tag: 'a[href]',
        getAttrs: (dom) => {
          const href = isSafeUrl(dom.getAttribute('href'), { allowHttp: !!allowHttp });
          return href == null ? false : { href, ...linkAttrsFrom(dom.getAttribute('target'), dom.getAttribute('rel')) };
        },
      }],
      toDOM: (mark) => {
        const attrs = { href: mark.attrs.href, rel: linkRel(mark.attrs.noreferrer === true) };
        if (mark.attrs.target === '_blank') attrs.target = '_blank';
        return ['a', attrs, 0];
      },
    },
    strong: { parseDOM: [{ tag: 'strong' }, { tag: 'b' }], toDOM: () => ['strong', 0] },
    em: { parseDOM: [{ tag: 'em' }, { tag: 'i' }], toDOM: () => ['em', 0] },
    u: { parseDOM: [{ tag: 'u' }], toDOM: () => ['u', 0] },
    s: { parseDOM: [{ tag: 's' }, { tag: 'strike' }, { tag: 'del' }], toDOM: () => ['s', 0] },
  };

  /** @type {Record<string, object>} */
  const marks = {};
  for (const [feature, name] of RICH_TEXT_MARKS) {
    if (on.includes(feature)) marks[name] = defs[name];
  }
  return new PM.Schema({ nodes, marks });
}

/**
 * @param {string} feature
 * @returns {string|null} the mark name of a feature
 */
export function markOf(feature) {
  const hit = RICH_TEXT_MARKS.find(([f]) => f === feature);
  return hit ? hit[1] : null;
}
