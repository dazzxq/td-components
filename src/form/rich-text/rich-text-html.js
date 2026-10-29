/**
 * v0.88.0 (plan v0.88.0-rich-text, lane B): HTML in / out of a <td-rich-text> document.
 *
 * Input is parsed by the browser into an INERT document (DOMParser `text/html`: no script runs, nothing loads), active
 * content is removed, and only the body goes through the schema parser — which keeps the allowed tags and nothing else
 * (no attribute survives except a safe link `href`). Output is the schema's own serialization: canonical HTML.
 */

/** Elements removed (with their content) before parsing — their text must never become document text. */
export const RICH_TEXT_STRIP = 'script, style, template, iframe, object, embed, svg, math';

/**
 * Hard bound on the HTML (code units) parsed from `value` or a paste / drop — longer input is ignored (one warning, never
 * the value), so an oversized stored draft cannot freeze the tab. Far above any `maxlength` a comment field uses.
 */
export const RICH_TEXT_MAX_HTML = 1_000_000;

/** One warning (never the value) for input over RICH_TEXT_MAX_HTML; @returns {string} '' (what is parsed instead) */
export function warnOversize() {
  console.warn(`<td-rich-text>: input over ${RICH_TEXT_MAX_HTML} characters — ignored`);
  return '';
}

/** @type {{ createHTML(s: string): unknown } | null | undefined} */
let ttPolicy;

/**
 * Module-private (never exported: it must not mint TrustedHTML for any other sink). Under
 * `require-trusted-types-for 'script'` DOMParser needs TrustedHTML: a NAMED policy `td-rich-text` (the site lists
 * it in `trusted-types`) wraps the string; the parse target is an inert document and the result goes through
 * stripUnsafe + the schema. Never a default policy. Without Trusted Types (or when the site does not allow the name) the
 * plain string is used.
 * @param {string} s
 * @returns {unknown}
 */
function trustedHtml(s) {
  if (ttPolicy === undefined) {
    ttPolicy = null;
    const tt = /** @type {any} */ (globalThis).trustedTypes;
    if (tt?.createPolicy) {
      try {
        ttPolicy = tt.createPolicy('td-rich-text', { createHTML: (/** @type {string} */ x) => x });
      } catch {
        // name not allowed by the site's CSP: parsing throws there, like any other sink
      }
    }
  }
  return ttPolicy ? ttPolicy.createHTML(s) : s;
}

/**
 * Remove active / foreign content from a DOM subtree, in place.
 * @param {ParentNode} root
 */
export function stripUnsafe(root) {
  for (const el of [...root.querySelectorAll(RICH_TEXT_STRIP)]) el.remove();
}

/**
 * @param {{ PMDOMParser: object }} PM
 * @param {object} schema
 * @param {string} html
 * @returns {object} ProseMirror doc
 */
export function parseHtml(PM, schema, html) {
  let src = typeof html === 'string' ? html : '';
  if (src.length > RICH_TEXT_MAX_HTML) src = warnOversize();
  const doc = new DOMParser().parseFromString(/** @type {string} */ (trustedHtml(src)), 'text/html');
  stripUnsafe(doc.body);
  return PM.PMDOMParser.fromSchema(schema).parse(doc.body);
}

/**
 * @param {object} doc
 * @returns {boolean} the document is one empty paragraph
 */
export function isEmptyDoc(doc) {
  return doc.childCount === 1 && doc.firstChild.isTextblock && doc.firstChild.content.size === 0;
}

/**
 * @param {{ DOMSerializer: object }} PM
 * @param {object} schema
 * @param {object} doc
 * @returns {string} canonical HTML ('' for an empty document)
 */
export function serializeHtml(PM, schema, doc) {
  if (isEmptyDoc(doc)) return '';
  const htmlDoc = document.implementation.createHTMLDocument('');
  const box = htmlDoc.createElement('div');
  box.appendChild(PM.DOMSerializer.fromSchema(schema).serializeFragment(doc.content, { document: htmlDoc }));
  return box.innerHTML;
}

/**
 * The text a reader sees: paragraph boundaries and hard breaks are `\n`. Used for `required` (trimmed) and `maxlength`
 * (counted in code points: `[...text].length`).
 * @param {object} doc
 * @returns {string}
 */
export function visibleText(doc) {
  const parts = [];
  doc.forEach((block) => {
    let line = '';
    block.forEach((node) => {
      if (node.isText) line += node.text;
      else if (node.type.name === 'hard_break') line += '\n';
    });
    parts.push(line);
  });
  return parts.join('\n');
}
