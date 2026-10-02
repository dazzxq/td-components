/**
 * td icons — render icons BY NAME from one registry (ADR 0010). No side effects on import.
 *
 *   import { tdIcon, registerIcons } from '@dazzxq/td-components/icons';
 *   button.appendChild(tdIcon('close'));                         // decorative (aria-hidden)
 *   host.appendChild(tdIcon('info', { size: 'l', label: 'Thông tin' })); // meaningful → role="img"
 *   registerIcons({ 'site-camera': { viewBox: '0 0 24 24', paint: 'stroke', nodes: [['path', { d: '…' }]] } });
 *
 * Built with createElementNS (never innerHTML) → CSP/XSS safe. Definitions are DATA ONLY: a fixed
 * allowlist of shape tags and geometry attributes; strings of SVG markup are rejected.
 * Core geometry: Lucide (ISC) — see THIRD_PARTY_NOTICES.md. Markup contract (SSR parity):
 *   <svg class="td-icon td-icon--m" data-icon="close" viewBox="0 0 24 24" fill="none"
 *        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
 *        aria-hidden="true" focusable="false"><path d="…"/>…</svg>
 * Aliases (v0.18.0, icons.json "aliases" — the same table PHP reads): `x` → close, `chevron-left` → prev,
 * `external-link` → external… An alias applies only when the name is not itself a registered (core or site) icon;
 * the rendered `data-icon` is the resolved core name.
 */

import CORE, { aliases as CORE_ALIASES } from './registry.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const NAME_RE = /^[a-z][a-z0-9-]{0,63}$/;
const CLASS_RE = /^[A-Za-z_][A-Za-z0-9_-]*$/;
const SIZES = ['s', 'm', 'l'];

const TAGS = new Set(['path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse']);
const PATH_DATA = /^[0-9MmLlHhVvCcSsQqTtAaZzEe.,+\-\s]*$/;
const NUMBERS = /^[0-9.,+\-eE\s]*$/;
const NUMBER = /^-?(\d+\.?\d*|\.\d+)$/;
const ATTRS = {
  d: PATH_DATA,
  points: NUMBERS,
  cx: NUMBER, cy: NUMBER, r: NUMBER, rx: NUMBER, ry: NUMBER,
  x: NUMBER, y: NUMBER, x1: NUMBER, y1: NUMBER, x2: NUMBER, y2: NUMBER,
  width: NUMBER, height: NUMBER,
  'fill-rule': /^(nonzero|evenodd)$/,
  'clip-rule': /^(nonzero|evenodd)$/,
  opacity: /^(0(\.\d+)?|1(\.0+)?)$/,
  'fill-opacity': /^(0(\.\d+)?|1(\.0+)?)$/,
  'stroke-opacity': /^(0(\.\d+)?|1(\.0+)?)$/,
};
// Complexity limits (security review: bounded parsing/validation/rendering work for untrusted input).
const MAX_NODES = 64;
const MAX_ATTR_LENGTH = 8000;
const MAX_SVG_STRING = 32000;
const VIEWBOX = /^-?\d+(\.\d+)?( -?\d+(\.\d+)?){3}$/;

/** @type {Map<string, {viewBox: string, paint: 'stroke'|'fill', nodes: Array<[string, Record<string,string>]>}>} */
const registry = new Map();

/**
 * Validate + deep-copy + freeze one definition. Throws on anything outside the allowlist.
 * @returns {{viewBox: string, paint: 'stroke'|'fill', nodes: Array}}
 */
function validate(name, def) {
  return _validateIconDefinition(name, def);
}

/**
 * The ONE geometry validator (registerIcons + svgStringToDefinition). Throws on anything outside the allowlist.
 * @internal
 */
function _validateIconDefinition(name, def) {
  if (!def || typeof def !== 'object' || Array.isArray(def)) throw new TypeError(`icon "${name}": definition must be an object`);
  const viewBox = def.viewBox == null ? '0 0 24 24' : String(def.viewBox);
  if (!VIEWBOX.test(viewBox)) throw new TypeError(`icon "${name}": invalid viewBox`);
  const paint = def.paint == null ? 'stroke' : def.paint;
  if (paint !== 'stroke' && paint !== 'fill') throw new TypeError(`icon "${name}": paint must be "stroke" or "fill"`);
  if (!Array.isArray(def.nodes) || !def.nodes.length) throw new TypeError(`icon "${name}": nodes must be a non-empty array`);
  if (def.nodes.length > MAX_NODES) throw new TypeError(`icon "${name}": more than ${MAX_NODES} shapes`);
  const nodes = def.nodes.map((node, i) => {
    if (!Array.isArray(node) || node.length !== 2) throw new TypeError(`icon "${name}": node ${i} must be [tag, attrs]`);
    const [tag, attrs] = node;
    if (!TAGS.has(tag)) throw new TypeError(`icon "${name}": tag "${tag}" not allowed`);
    if (!attrs || typeof attrs !== 'object' || Array.isArray(attrs)) throw new TypeError(`icon "${name}": node ${i} attrs must be an object`);
    const clean = {};
    for (const [k, v] of Object.entries(attrs)) {
      const rule = ATTRS[k];
      const val = String(v);
      if (!rule) throw new TypeError(`icon "${name}": attribute "${k}" not allowed`);
      if (val.length > MAX_ATTR_LENGTH) throw new TypeError(`icon "${name}": attribute "${k}" is too long`);
      if (!rule.test(val)) throw new TypeError(`icon "${name}": attribute "${k}" has an invalid value`);
      clean[k] = val;
    }
    return Object.freeze([tag, Object.freeze(clean)]);
  });
  return Object.freeze({ viewBox, paint, nodes: Object.freeze(nodes) });
}

for (const [name, def] of Object.entries(CORE)) registry.set(name, validate(name, def));

/** @type {Map<string, string>} alias → core name (own keys only; never the prototype) */
const ALIASES = new Map(Object.entries(CORE_ALIASES || {}));

/**
 * Resolve a name to a registered icon name: the name itself when registered, else its alias target, else null.
 * @param {string} name
 * @returns {string|null}
 */
export function resolveIconName(name) {
  if (typeof name !== 'string') return null;
  if (registry.has(name)) return name;
  const target = ALIASES.get(name);
  return target !== undefined && registry.has(target) ? target : null;
}

/**
 * Register additional icons (site extensions). Data only; collisions with existing names throw
 * (core names are reserved — prefix site icons, e.g. `site-camera`).
 * @param {Record<string, object>} defs
 */
export function registerIcons(defs) {
  if (!defs || typeof defs !== 'object') throw new TypeError('registerIcons: expected an object of definitions');
  const staged = [];
  for (const [name, def] of Object.entries(defs)) {
    if (!NAME_RE.test(name)) throw new TypeError(`registerIcons: invalid name "${name}"`);
    if (registry.has(name)) throw new Error(`registerIcons: "${name}" already exists`);
    staged.push([name, validate(name, def)]);
  }
  for (const [name, def] of staged) registry.set(name, def); // all-or-nothing
}

/** @param {string} name @returns {boolean} registered (core / site) or an alias of a core icon */
export function hasIcon(name) {
  return resolveIconName(name) !== null;
}

/** @returns {string[]} registered names (aliases not included — see resolveIconName) */
export function listIcons() {
  return [...registry.keys()];
}

/**
 * Render an icon.
 * @param {string} name registered name or alias (rendered with the resolved name in `data-icon`)
 * @param {{ size?: 's'|'m'|'l'|number, label?: string, class?: string }} [opts]
 *   size: named token size (default 'm') or an integer 8–128 (px, via width/height attributes).
 *   label: empty = decorative (aria-hidden); non-empty = role="img" + <title>.
 * @returns {SVGSVGElement|null} null for an unknown name
 */
export function tdIcon(name, opts = {}) {
  const resolved = resolveIconName(name);
  if (resolved === null) {
    if (typeof console !== 'undefined') console.warn(`tdIcon: unknown icon "${name}"`);
    return null;
  }
  name = resolved;
  const def = registry.get(name);
  const { size = 'm', label = '', class: extra = '' } = opts || {};
  const svg = document.createElementNS(SVG_NS, 'svg');
  const classes = ['td-icon'];
  if (typeof size === 'number' && Number.isInteger(size) && size >= 8 && size <= 128) {
    svg.setAttribute('width', String(size));
    svg.setAttribute('height', String(size));
  } else {
    classes.push(`td-icon--${SIZES.includes(size) ? size : 'm'}`);
  }
  if (typeof extra === 'string') {
    for (const c of extra.split(/\s+/)) if (CLASS_RE.test(c)) classes.push(c);
  }
  svg.setAttribute('class', classes.join(' '));
  svg.setAttribute('data-icon', name);
  svg.setAttribute('viewBox', def.viewBox);
  if (def.paint === 'stroke') {
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
  } else {
    svg.setAttribute('fill', 'currentColor');
  }
  const text = typeof label === 'string' ? label.trim() : '';
  if (text) {
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', text);
    const title = document.createElementNS(SVG_NS, 'title');
    title.textContent = text;
    svg.appendChild(title);
  } else {
    svg.setAttribute('aria-hidden', 'true');
  }
  svg.setAttribute('focusable', 'false');
  for (const [tag, attrs] of def.nodes) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    svg.appendChild(el);
  }
  return svg;
}

/**
 * Fill every `[data-td-icon="name"]` slot under `root` with its icon (components that render HTML
 * strings emit empty slots, then call this after render). Optional `data-td-icon-size` (s|m|l|px) and
 * `data-td-icon-class`. Idempotent: the slot's children are replaced.
 * @param {ParentNode} root
 * @param {string} [selector] which descendants are slots (default `[data-td-icon]`; a component scopes it to its own slots)
 */
export function fillIconSlots(root, selector = '[data-td-icon]') {
  if (!root || typeof root.querySelectorAll !== 'function') return;
  for (const slot of root.querySelectorAll(selector)) {
    const rawSize = slot.getAttribute('data-td-icon-size') || 'm';
    const size = /^\d+$/.test(rawSize) ? Number(rawSize) : rawSize;
    const svg = tdIcon(slot.getAttribute('data-td-icon'), { size, class: slot.getAttribute('data-td-icon-class') || '' });
    slot.replaceChildren(...(svg ? [svg] : []));
  }
}

/**
 * Convert an SVG MARKUP STRING to a validated icon definition, or null. Used for deprecated string inputs
 * (e.g. td-empty-state `icon="<svg …>"`). Parsed as `image/svg+xml` (never HTML); the root must be `<svg>` with a
 * valid viewBox; every child must be an allowlisted shape with allowlisted attributes — anything else (script,
 * foreignObject, use/href, on*, style, url(), nested groups, parser errors) → null. No partial rendering.
 * @param {string} str
 * @returns {{viewBox: string, paint: 'stroke'|'fill', nodes: Array}|null}
 */
export function svgStringToDefinition(str) {
  if (typeof str !== 'string' || typeof DOMParser === 'undefined') return null;
  if (str.length > MAX_SVG_STRING || /<!(DOCTYPE|ENTITY)/i.test(str)) return null; // no DTDs, bounded size
  let doc;
  try {
    doc = new DOMParser().parseFromString(str.trim(), 'image/svg+xml');
  } catch {
    return null;
  }
  const root = doc.documentElement;
  if (!root || root.localName !== 'svg' || root.namespaceURI !== SVG_NS || doc.getElementsByTagName('parsererror').length) {
    return null;
  }
  // Root attributes are allowlisted too (security review: `<svg onload=…>` must be rejected, not just dropped).
  const ROOT_ATTRS = new Set(['xmlns', 'xmlns:xlink', 'viewBox', 'fill', 'stroke', 'stroke-width', 'stroke-linecap',
    'stroke-linejoin', 'width', 'height', 'class', 'aria-hidden', 'focusable', 'role', 'version']);
  for (const a of root.attributes) {
    if (!ROOT_ATTRS.has(a.name) || /url\s*\(|javascript:/i.test(a.value)) return null;
  }
  if (!root.hasAttribute('viewBox')) return null;
  const fill = (root.getAttribute('fill') || '').trim().toLowerCase();
  const def = {
    viewBox: root.getAttribute('viewBox'), // required (D1): missing → rejected by the validator below
    paint: fill && fill !== 'none' ? 'fill' : 'stroke',
    nodes: [],
  };
  for (const child of root.children) {
    const attrs = {};
    for (const a of child.attributes) attrs[a.name] = a.value;
    def.nodes.push([child.localName, attrs]);
  }
  try {
    return _validateIconDefinition('svg-string', def);
  } catch {
    return null;
  }
}

/**
 * Render a validated definition (from svgStringToDefinition) without registering it.
 * @param {{viewBox: string, paint: string, nodes: Array}} def
 * @param {{ size?: 's'|'m'|'l'|number, class?: string }} [opts]
 * @returns {SVGSVGElement|null}
 */
export function renderIconDefinition(def, opts = {}) {
  if (!def) return null;
  let safe;
  try {
    safe = _validateIconDefinition('inline', def); // exported → never trust the caller's definition
  } catch {
    return null;
  }
  const key = '__td-inline-def__';
  registry.set(key, safe);
  try {
    const svg = tdIcon(key, opts);
    if (svg) svg.setAttribute('data-icon', 'custom');
    return svg;
  } finally {
    registry.delete(key);
  }
}
