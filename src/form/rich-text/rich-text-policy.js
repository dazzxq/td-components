/**
 * v0.88.0 (plan v0.88.0-rich-text): the ONE allowlist behind <td-rich-text> — the client schema is built from it, and
 * rich-text-policy.json (generated from RICH_TEXT_POLICY, read by php/td-rich-text-policy.php) gives the server the same
 * rules. Pure: no DOM, runs under node.
 *
 * The server never trusts the client: it picks the features / allowHttp / linkTarget of ITS field and sanitizes again.
 */

/** Feature order is fixed (toolbar order, policy order) — it never follows the order an author wrote. */
export const RICH_TEXT_FEATURES = Object.freeze(['bold', 'italic', 'underline', 'strike', 'link']);

/** Link targets an instance (or the server) may force. `none` = no `target` attribute. */
export const RICH_TEXT_LINK_TARGETS = Object.freeze(['none', '_self', '_blank']);

const deepFreeze = (o) => {
  for (const v of Object.values(o)) if (v && typeof v === 'object') deepFreeze(v);
  return Object.freeze(o);
};

export const RICH_TEXT_POLICY = deepFreeze({
  version: 1,
  /** Always allowed: the document is paragraphs + hard breaks. */
  blocks: { tags: ['p', 'br'] },
  /** feature → the ONLY tags it serializes to, and the attributes each keeps (none unless listed). */
  features: {
    bold: { tags: ['strong'] },
    italic: { tags: ['em'] },
    underline: { tags: ['u'] },
    strike: { tags: ['s'] },
    link: { tags: ['a'], attrs: { a: ['href'] } },
  },
  presets: { comment: ['bold', 'italic', 'underline', 'strike', 'link'] },
  link: {
    schemes: ['https', 'mailto', 'tel'],
    /** opt-in per field (`allow-http` / `$allowHttp`) */
    optionalSchemes: ['http'],
    relative: true,
    fragment: true,
    /** forced on every link; incoming rel / target are dropped */
    rel: 'nofollow noopener',
    targets: ['_self', '_blank'],
  },
});

/**
 * The features an instance enables: `features` (space- or comma-separated tokens) overrides `preset`; an unknown
 * preset falls back to `comment`. Unknown tokens are dropped and returned in `unknown` (the component warns once).
 * @param {{ preset?: string|null, features?: string|null }} [opts]
 * @returns {{ features: string[], unknown: string[] }} features in RICH_TEXT_FEATURES order, no duplicates
 */
export function resolveFeatures({ preset, features } = {}) {
  const raw = typeof features === 'string' ? features.trim() : '';
  if (raw) {
    const tokens = raw.toLowerCase().split(/[\s,]+/).filter(Boolean);
    return {
      features: RICH_TEXT_FEATURES.filter((f) => tokens.includes(f)),
      unknown: [...new Set(tokens.filter((t) => !RICH_TEXT_FEATURES.includes(t)))],
    };
  }
  const name = typeof preset === 'string' ? preset.trim().toLowerCase() : '';
  const list = Object.hasOwn(RICH_TEXT_POLICY.presets, name) ? RICH_TEXT_POLICY.presets[name] : RICH_TEXT_POLICY.presets.comment;
  return { features: RICH_TEXT_FEATURES.filter((f) => list.includes(f)), unknown: [] };
}

/** `none` unless the value is exactly one of RICH_TEXT_LINK_TARGETS. @param {unknown} v @returns {string} */
export function normalizeLinkTarget(v) {
  return typeof v === 'string' && RICH_TEXT_LINK_TARGETS.includes(v) ? v : 'none';
}

/**
 * Validate a link href (an attribute value already decoded by an HTML parser, or what the user typed in the link
 * dialog). Returns the cleaned href to store, or null when the link must be dropped (its text is kept).
 *   - leading/trailing C0 controls + space are trimmed, tab / CR / LF removed anywhere (what the URL parser ignores, so
 *     `java\tscript:` cannot hide a scheme); any other control character → null
 *   - `#fragment`: allowed; `scheme:` must be https / mailto / tel (+ http with allowHttp), compared case-insensitively
 *   - no scheme = relative (`/a`, `a/b`, `?q`, `./x`); a network-path reference (`//host`, `\\host`, `/\host` — browsers
 *     read `\` as `/`) would leave the site → null
 * @param {unknown} href
 * @param {{ allowHttp?: boolean }} [opts]
 * @returns {string|null}
 */
export function isSafeUrl(href, { allowHttp = false } = {}) {
  if (typeof href !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const s = href.replace(/^[\u0000- ]+|[\u0000- ]+$/g, '').replace(/[\t\n\r]/g, '');
  // eslint-disable-next-line no-control-regex
  if (!s || /[\u0000-\u001F\u007F]/.test(s)) return null;
  if (s.startsWith('#')) return RICH_TEXT_POLICY.link.fragment ? s : null;
  const scheme = /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(s);
  if (scheme) {
    const name = scheme[1].toLowerCase();
    const ok = RICH_TEXT_POLICY.link.schemes.includes(name) || (allowHttp && name === 'http');
    if (!ok) return null;
    // `https:` / `http:` must name a host: `https:foo` and `https:/foo` are relative-ish oddities, never a link out
    if ((name === 'https' || name === 'http') && !/^[A-Za-z][A-Za-z0-9+.-]*:\/\/[^/\\?#\s]/.test(s)) return null;
    return s;
  }
  if (!RICH_TEXT_POLICY.link.relative) return null;
  if (/^[/\\]{2}/.test(s)) return null;
  // a colon before any / ? # would make a later parser read a scheme (`a:b` is caught above; this guards odd prefixes)
  const head = s.split(/[/?#]/, 1)[0];
  if (head.includes(':')) return null;
  return s;
}

/**
 * The resolved rules for one field — what the server applies (the PHP loader mirrors this from the JSON).
 * @param {string[]} features from resolveFeatures
 * @param {{ allowHttp?: boolean, linkTarget?: string }} [opts]
 * @returns {{ version: number, tags: Record<string, string[]>, link: null | { schemes: string[], relative: boolean,
 *   fragment: boolean, rel: string, target: string } }}
 */
export function policyFor(features, { allowHttp = false, linkTarget = 'none' } = {}) {
  const on = RICH_TEXT_FEATURES.filter((f) => Array.isArray(features) && features.includes(f));
  /** @type {Record<string, string[]>} */
  const tags = {};
  for (const t of RICH_TEXT_POLICY.blocks.tags) tags[t] = [];
  for (const f of on) {
    const def = RICH_TEXT_POLICY.features[f];
    for (const t of def.tags) tags[t] = [...(def.attrs?.[t] ?? [])];
  }
  const L = RICH_TEXT_POLICY.link;
  return {
    version: RICH_TEXT_POLICY.version,
    tags,
    link: on.includes('link') ? {
      schemes: allowHttp ? [...L.schemes, ...L.optionalSchemes] : [...L.schemes],
      relative: L.relative,
      fragment: L.fragment,
      rel: L.rel,
      target: normalizeLinkTarget(linkTarget),
    } : null,
  };
}
