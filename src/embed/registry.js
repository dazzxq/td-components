/**
 * Scoped custom element registry of the embed (ADR 0045 Q5, plan v0.116.0 QĐ2). Built from the PAGE realm
 * (`host.ownerDocument.defaultView.CustomElementRegistry`), never from this module's own global, lazily on the first
 * mount, once per (module instance, Document). The page's global registry is never touched: a page that defines its
 * own `td-button`, a re-injected userscript (a new module instance → a new registry) or two kit versions side by side
 * do not conflict.
 */
import { TdButton } from '../form/td-button.js';
import { TdInputField } from '../form/td-input-field.js';
import { TdAlert } from '../feedback/td-alert.js';

/** The guaranteed suite, wave 1 (ADR 0045 Q7): tag → class. */
export const EMBED_ELEMENTS = Object.freeze([
  ['td-button', TdButton],
  ['td-input-field', TdInputField],
  ['td-alert', TdAlert],
]);

/** @type {WeakMap<Document, CustomElementRegistry>} */
const registries = new WeakMap();

/**
 * Whether `view` (a page window) can host the embed: scoped registries (construction, `attachShadow({
 * customElementRegistry })`, `createElement(tag, { customElementRegistry })`) and constructable, adoptable sheets.
 * Probes a detached element only: the caller's host is never touched. Never throws.
 * @param {Window} view
 * @param {Document} doc
 * @returns {CustomElementRegistry | null} the Document's registry when supported (created on the first call)
 */
export function scopedRegistryFor(view, doc) {
  const have = registries.get(doc);
  if (have) return have;
  try {
    if (!view || !('CustomElementRegistry' in view) || typeof view.CustomElementRegistry !== 'function') return null;
    if (typeof view.CSSStyleSheet !== 'function' || typeof view.CSSStyleSheet.prototype.replaceSync !== 'function') return null;
    if (!view.ShadowRoot || !('adoptedStyleSheets' in view.ShadowRoot.prototype)) return null;
    const registry = new view.CustomElementRegistry();
    const probe = doc.createElement('div');
    const root = probe.attachShadow({ mode: 'open', customElementRegistry: registry });
    if (root.customElementRegistry !== registry) return null; // the option was ignored (no scoped registries)
    const el = doc.createElement('td-embed-probe', { customElementRegistry: registry });
    if (el.customElementRegistry !== registry) return null;
    for (const [name, cls] of EMBED_ELEMENTS) registry.define(name, cls);
    registries.set(doc, registry);
    return registry;
  } catch {
    return null;
  }
}
