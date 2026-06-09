/**
 * Shared constructable-stylesheet adoption helper for CSP-strict hardening.
 *
 * Under a strict `Content-Security-Policy` (`default-src 'self'; style-src 'self'`,
 * NO `unsafe-inline`), a JS-injected `<style>` element is BLOCKED and a declarative
 * `style="…"` attribute is BLOCKED. The only CSP-allowed way to ship SELECTOR-based,
 * pseudo-class, `::before`/`::after`, state-combinator, `@keyframes`, or `@media` rules
 * is a constructable `CSSStyleSheet` adopted via `document.adoptedStyleSheets`. This
 * helper adopts a component's static stylesheet ONCE per document, feature-detected,
 * lazily, idempotently, and without ever throwing.
 *
 * USAGE (callers MUST invoke lazily — never at module top-level):
 *   import { adoptStyles } from '../utils/adopt-styles.js';
 *   const SHEET = `.td-checkbox[data-checked] .box { background: var(--c); }`;
 *   class TdCheckbox extends TdBaseElement {
 *     connectedCallback() {
 *       adoptStyles(SHEET, 'td-checkbox'); // safe to call every connect; idempotent
 *       super.connectedCallback();
 *     }
 *   }
 *
 * UNSUPPORTED-BROWSER / SSR SEMANTICS (graceful degradation, documented contract):
 *   - In node/SSR (`typeof document === 'undefined'`) it returns `false` and is a no-op.
 *   - In a browser without constructable-stylesheet support (`CSSStyleSheet` absent or
 *     `adoptedStyleSheets` not on `Document.prototype` — i.e. below Chromium 73 /
 *     Safari 16.4 / Firefox 101) it returns `false` and adopts nothing.
 *   - On `false`, the component STILL renders structurally: its Tailwind `class="…"`
 *     utilities apply, and any per-element SCALAR styles applied via CSSOM
 *     (`el.style.setProperty(...)`) apply. ONLY the selector/pseudo/keyframe-driven
 *     embellishments in the adopted sheet are absent. There is NO `<link>`/CSS-file
 *     fallback — the library ships no CSS by design — so callers must treat the adopted
 *     sheet as enhancement, not as load-bearing structure.
 *
 * @module utils/adopt-styles
 */

/**
 * Adopt a component's static stylesheet ONCE per document. Browser-only, never throws.
 *
 * Idempotency is keyed by `key` (a stable per-component string, e.g. `'td-checkbox'`):
 * repeated calls with the same key on the same document are a cheap no-op returning
 * `true`. The per-document registry lives on `document.__tdAdopted` (a `Map`), so the
 * helper holds no global state and works across multiple documents (e.g. iframes).
 *
 * The sheet is appended with `[...document.adoptedStyleSheets, sheet]` — it NEVER
 * reassign-clobbers the array, so styles adopted by the host page or other components
 * are preserved.
 *
 * @param {string} css - The full CSS text of the component's static stylesheet
 *   (selectors, pseudo-classes, `@keyframes`, etc.). Authored once per component module.
 * @param {string} key - A stable string unique to the component (e.g. `'td-toggle'`).
 *   Used for per-document de-duplication.
 * @returns {boolean} `true` if the sheet is adopted (or was already adopted) for this
 *   document; `false` in node/SSR or an unsupported browser (caller degrades gracefully).
 */
export function adoptStyles(css, key) {
  // Wrapped so the helper NEVER throws (its documented contract): a partial DOM shim,
  // a non-writable `document` property, malformed CSS in `replaceSync`, or a browser
  // quirk on the `adoptedStyleSheets` setter must degrade to a graceful `false`, never
  // escalate into a render/lifecycle exception in callers.
  try {
    // node/SSR: no document → no-op, never throw.
    if (typeof document === 'undefined') return false;
    // Old browser / partial shim without constructable-stylesheet support → caller
    // degrades gracefully. Guard `Document` before touching `Document.prototype`.
    if (
      typeof CSSStyleSheet === 'undefined' ||
      typeof Document === 'undefined' ||
      !('adoptedStyleSheets' in Document.prototype)
    ) {
      return false;
    }
    const root = document;
    root.__tdAdopted ??= new Map();
    // Duplicate guard: one sheet per key per document.
    if (root.__tdAdopted.has(key)) return true;
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    // Append — never reassign-clobber the array (preserves host/other-component sheets).
    root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
    root.__tdAdopted.set(key, sheet);
    return true;
  } catch {
    return false;
  }
}
