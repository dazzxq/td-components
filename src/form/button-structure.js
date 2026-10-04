/**
 * @internal Shared SSR structure check of the `.td-btn` control (v0.25.0 `button@1`; v0.36.0 `action-button@1`).
 * Not a public subpath. Each caller passes its own allowlists so a subclass can be stricter (td-action-button has no
 * label span).
 */

/** Control attributes that are STRUCTURE for hydrate (state ones — disabled, href, aria-*… — are synced in place). */
export const STRUCT_ATTRS = ['type', 'target', 'rel', 'download'];

/**
 * Review round 1 (SEC-1, v0.25.0): attributes a PRESERVED control may carry — exactly what td_button / td_link
 * (php/td.php: owned names + the `attrs` allowlist Td::ALLOWED_ATTRS + aria-* / data-*) and render() / _syncState() can
 * produce. Anything else (on*, style, form, formaction, formmethod, formenctype, formtarget, formnovalidate, srcdoc,
 * popovertarget, commandfor…) → the markup is not adopted (normal render).
 */
export const CONTROL_ATTRS = new Set(['class', 'type', 'name', 'value', 'disabled', 'aria-busy', 'aria-disabled', 'aria-label',
  'data-tooltip', 'href', 'target', 'rel', 'download', 'role', 'tabindex', 'id', 'title', 'lang', 'dir', 'hidden',
  'translate', 'accesskey', 'autofocus', 'autocomplete', 'inputmode', 'enterkeyhint', 'autocapitalize', 'spellcheck',
  'placeholder', 'readonly', 'required', 'maxlength', 'minlength', 'min', 'max', 'step', 'pattern', 'size', 'rows',
  'cols']);

/** `data-td-*` is the kit's internal namespace (icon slots…) — never accepted on the control (review round 2). */
export const ARIA_DATA_ATTR = /^(?:aria-[a-z0-9][a-z0-9._-]*|data-(?!td-)[a-z0-9][a-z0-9._-]*)$/;

/** Inner nodes of td-button: label span, icon slot (registry / legacy) and spinner span carry only these. */
export const PART_ATTRS = {
  'td-btn__label': new Set(['class']),
  'td-btn__icon': new Set(['class', 'aria-hidden', 'data-td-icon', 'data-td-icon-size']),
  'td-btn__spinner': new Set(['class', 'aria-hidden', 'hidden']),
};

/** @param {string|null} name `download` value → a bare file name (path / reserved characters removed) */
export function safeDownloadName(name) {
  return String(name ?? '').replace(/[\u0000-\u001f\u007f/\\:*?"<>|]/g, '').replace(/^[.\s]+/, '').trim();
}

export const classKey =(el) => [...el.classList].sort().join(' ');

/** Element children + non-blank text nodes (comments / whitespace ignored). */
export const contentNodes = (el) => [...el.childNodes].filter((n) => n.nodeType === 1 || (n.nodeType === 3 && n.data.trim()));

/** @param {Element} el @param {(name: string) => boolean} ok */
const onlyAttrs = (el, ok) => [...el.attributes].every((a) => ok(a.name));

/**
 * Does the server-rendered control `live` have the STRUCTURE render() would produce (`want`)? Tag, class list,
 * type / target / rel / download, and the children in order: icon slot (same registry name + size), label (same text),
 * spinner (same markup). Every preserved node also passes an attribute ALLOWLIST (`controlAttrs` + ARIA_DATA_ATTR on
 * the control, `partAttrs[class]` on a child — a child whose class has no entry is refused); the spinner and a legacy
 * icon must match render() byte for byte; a registry icon's content is re-created by fillIconSlots().
 * @param {Element} live
 * @param {Element|null} want
 * @param {{ controlAttrs?: Set<string>, partAttrs?: Record<string, Set<string>> }} [allow]
 * @returns {boolean}
 */
export function sameControlStructure(live, want, { controlAttrs = CONTROL_ATTRS, partAttrs = PART_ATTRS } = {}) {
  if (!want || live.localName !== want.localName || classKey(live) !== classKey(want)) return false;
  if (!onlyAttrs(live, (n) => controlAttrs.has(n) || ARIA_DATA_ATTR.test(n))) return false;
  for (const a of STRUCT_ATTRS) if (live.getAttribute(a) !== want.getAttribute(a)) return false;
  const have = contentNodes(live);
  const need = [...want.children];
  if (have.length !== need.length) return false;
  return have.every((l, i) => {
    const w = need[i];
    if (l.nodeType !== 1 || l.localName !== w.localName || classKey(l) !== classKey(w)) return false;
    const part = Object.keys(partAttrs).find((c) => w.classList.contains(c));
    if (!part || !onlyAttrs(l, (n) => partAttrs[part].has(n))) return false;
    if (w.classList.contains('td-btn__label')) return l.children.length === 0 && l.textContent === w.textContent;
    if (w.classList.contains('td-btn__spinner')) return l.innerHTML === w.innerHTML;
    if (w.classList.contains('td-btn__icon')) {
      if (!w.hasAttribute('data-td-icon')) return l.innerHTML === w.innerHTML; // legacy class icon
      return l.getAttribute('data-td-icon') === w.getAttribute('data-td-icon')
        && l.getAttribute('data-td-icon-size') === w.getAttribute('data-td-icon-size');
    }
    return false;
  });
}
