/**
 * Auto-define gate (v0.116.0, ADR 0045 QĐ1). Leaf module: no imports.
 *
 * Component modules call `defineElement()` at load instead of `customElements.define()` directly. A light-DOM page
 * sees no change: the element is defined on the global registry once, as before. The embed bundle imports
 * `src/embed/suppress.js` first, which turns auto-define off for that bundle's module instance, so the elements can
 * live in a scoped registry and the host page registry is never touched. Suppression is one-way.
 */

let suppressed = false;

/** Define `name` on the global registry unless it already exists or auto-define is suppressed. */
export function defineElement(name, cls) {
  if (suppressed || typeof customElements === 'undefined') return;
  if (!customElements.get(name)) customElements.define(name, cls);
}

/** Turn auto-define off for this module instance (one-way). */
export function suppressAutoDefine() {
  suppressed = true;
}
