import { escapeHtml } from '../utils/escape.js';
import { safeColor } from '../utils/css-safe.js';

/**
 * Base class for all td-components. Extends HTMLElement with:
 * - Lifecycle management (render on connect, cleanup on disconnect)
 * - Automatic attribute/property sync with boolean support
 * - Event listener and timer cleanup tracking
 * - CustomEvent emission helper
 * - HTML escaping for XSS prevention
 *
 * @example
 * class TdToggle extends TdBaseElement {
 *   static get observedAttributes() { return ['checked', 'disabled', 'label']; }
 *   static get booleanAttributes() { return ['checked', 'disabled']; }
 *   render() {
 *     return `<label>${this.escapeHtml(this.label)}</label>`;
 *   }
 * }
 * if (!customElements.get('td-toggle')) customElements.define('td-toggle', TdToggle);
 */
export class TdBaseElement extends HTMLElement {
  /** @abstract @returns {string[]} Attributes to observe for changes */
  static get observedAttributes() { return []; }

  /** @returns {string[]} Subset of observedAttributes that are boolean */
  static get booleanAttributes() { return []; }

  constructor() {
    super();
    /** @type {boolean} Prevents duplicate render when element is moved in DOM */
    this._initialized = false;
    /** @type {Array<() => void>} Cleanup functions called on disconnect */
    this._cleanups = [];
  }

  connectedCallback() {
    if (!this._initialized) {
      this._initialized = true;
      this._setupProperties();
      this._doRender();
    } else if (this._needsRebind) {
      // Moved/re-inserted: disconnect ran every cleanup (listeners, timers) → render again to re-bind.
      this._needsRebind = false;
      this._doRender();
    }
  }

  disconnectedCallback() {
    this._cleanups.forEach(fn => fn());
    this._cleanups = [];
    if (this._initialized) this._needsRebind = true;
  }

  // --- Rendering ---

  /** @returns {string} HTML string. Override in subclass. */
  render() { return ''; }

  /** @private */
  _doRender() {
    this.innerHTML = this.render();
    this.afterRender();
    // CSP-strict hardening hook: apply per-element SCALAR styles via CSSOM after each
    // render. Optional-chaining so subclasses that don't define `_applyStyles` are
    // completely unaffected. See the `_applyStyles()` contract on the class JSDoc.
    this._applyStyles?.();
  }

  /** Hook for subclass to bind events after render. Called after every render. */
  afterRender() {}

  /**
   * CSP-hardening contract for subclasses (no-op by default — define it to opt in):
   *
   * Define `_applyStyles()` to set per-element SCALAR styles via CSSOM
   * (`el.style.setProperty(...)`) after each render. It is called automatically here
   * after `afterRender()` on the initial render AND on every observed-attribute
   * re-render (since `attributeChangedCallback` funnels through `_doRender()`), so
   * state-dependent scalars (color, size, width %, etc.) stay correct as state changes.
   *
   * Put SELECTOR / pseudo-class (`:hover`/`:focus`/`:checked`/`:disabled`),
   * `::before`/`::after`, state-combinator, `@keyframes`, and `@media` rules in a
   * constructable stylesheet adopted ONCE via `adoptStyles(css, key)` from
   * `utils/adopt-styles.js`, keyed off STABLE classes / `data-*` attributes the
   * component toggles — NOT inline `style=` and NOT an injected `<style>` element,
   * both of which a strict CSP (`style-src 'self'`, no `unsafe-inline`) blocks.
   */

  // --- Attribute/Property Sync ---

  /** @private */
  _setupProperties() {
    const booleans = new Set(this.constructor.booleanAttributes);
    for (const attr of this.constructor.observedAttributes) {
      if (attr in this) continue;
      const isBool = booleans.has(attr);
      const prop = attr.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      Object.defineProperty(this, prop, {
        get: () => isBool ? this.hasAttribute(attr) : (this.getAttribute(attr) ?? ''),
        set: (val) => {
          if (isBool) {
            val ? this.setAttribute(attr, '') : this.removeAttribute(attr);
          } else {
            val == null ? this.removeAttribute(attr) : this.setAttribute(attr, val);
          }
        },
        configurable: true,
      });
    }
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (oldVal !== newVal && this._initialized) {
      this._doRender();
    }
  }

  // --- Cleanup Tracking ---

  /** Add event listener with automatic cleanup on disconnect. */
  listen(target, event, handler, options) {
    target.addEventListener(event, handler, options);
    this._cleanups.push(() => target.removeEventListener(event, handler, options));
  }

  /** setTimeout with automatic cleanup on disconnect. @returns {number} */
  setTimeout(fn, ms) {
    const id = window.setTimeout(fn, ms);
    this._cleanups.push(() => window.clearTimeout(id));
    return id;
  }

  /** setInterval with automatic cleanup on disconnect. @returns {number} */
  setInterval(fn, ms) {
    const id = window.setInterval(fn, ms);
    this._cleanups.push(() => window.clearInterval(id));
    return id;
  }

  // --- Event Emission ---

  /** Dispatch a CustomEvent with bubbles:true, composed:true. */
  emit(name, detail = {}) {
    this.dispatchEvent(new CustomEvent(name, {
      bubbles: true,
      composed: true,
      detail,
    }));
  }

  // --- Utilities ---

  /** Escape HTML entities to prevent XSS in HTML-text and quoted-attribute contexts. */
  escapeHtml(str) {
    return escapeHtml(str);
  }

  /**
   * Validate a CSS color before interpolating it into injected CSS or a `style="…"`
   * attribute. Returns `fallback` for anything that isn't a safe color shape — use this
   * (NOT escapeHtml) for any attribute-derived value that lands in a CSS context.
   */
  safeColor(value, fallback = '') {
    return safeColor(value, fallback);
  }
}
