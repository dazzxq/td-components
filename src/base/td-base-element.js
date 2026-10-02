import { escapeHtml } from '../utils/escape.js';
import { safeColor } from '../utils/css-safe.js';

/**
 * v0.25.0 (ADR 0012): parse the SSR marker `data-td-ssr="<name>@<schema>"` (name: lower-case kebab token; schema: a
 * positive integer — the version of the component's MARKUP contract, not of the package).
 * @param {Element|null|undefined} el
 * @returns {{ name: string, schema: number } | null} null when absent or malformed
 */
export function ssrMarker(el) {
  const raw = el?.getAttribute?.('data-td-ssr');
  if (typeof raw !== 'string') return null;
  const m = /^([a-z][a-z0-9-]*)@([1-9][0-9]{0,5})$/.exec(raw);
  return m ? { name: m[1], schema: Number(m[2]) } : null;
}

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
  /**
   * v0.25.0 (ADR 0012): a component that can adopt server-rendered markup in place sets this to true. It changes the
   * RE-CONNECT lifecycle: a moved / re-inserted element re-binds (`afterRender()` + `_applyStyles()`) without
   * re-rendering (node identity + focus kept). Every other component keeps re-rendering on re-connect.
   * @type {boolean}
   */
  static hydratable = false;

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
      // Accessors + replay of properties assigned before connect/define happen BEFORE `_initialized`, with renders
      // suppressed, so the element renders exactly once below with its final state.
      this._setupProperties();
      this._initialized = true;
      // v0.25.0 (ADR 0012): server-rendered markup that matches the contract is adopted IN PLACE (no innerHTML);
      // anything else renders as before. canHydrate() reads the host AFTER the early-property replay above.
      const hydrate = this.canHydrate();
      if (this.constructor.hydratable) this.removeAttribute('data-td-ssr'); // consumed: a later render never re-reads it
      if (hydrate) {
        this._hydrated = true;
        this.hydrateExisting();
        this._bindStep();
      } else {
        this._doRender();
      }
    } else if (this._needsRebind) {
      // Moved/re-inserted: disconnect ran every cleanup (listeners, timers). A hydratable component re-binds in place
      // (same nodes, focus kept); the others render again to re-bind (unchanged lifecycle).
      this._needsRebind = false;
      if (this.constructor.hydratable) this._bindStep();
      else this._doRender();
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
    // Shared choke point: subclasses that re-render straight from their own attributeChangedCallback also land here,
    // so the property replay in _setupProperties() never renders a half-set state.
    if (this._suppressRender) return;
    this.innerHTML = this.render();
    this._bindStep();
  }

  /**
   * @private The bind step shared by render, hydrate and re-connect: `afterRender()` (listeners, in-place state), then
   * the CSP-strict hardening hook — per-element SCALAR styles via CSSOM. Optional-chaining so subclasses that don't
   * define `_applyStyles` are completely unaffected. See the `_applyStyles()` contract on the class JSDoc.
   */
  _bindStep() {
    this.afterRender();
    this._applyStyles?.();
  }

  /** Hook for subclass to bind events after render. Called after every render (and after hydrate / re-bind). */
  afterRender() {}

  // --- SSR hydrate (v0.25.0, ADR 0012) ---

  /**
   * Hook: can the CURRENT children (server-rendered, marked `data-td-ssr="<name>@<schema>"`) be adopted as they are?
   * Called once, on the first connect, after the early-property replay. Must not modify the DOM. Default: false
   * (render as before).
   * @returns {boolean}
   */
  canHydrate() { return false; }

  /**
   * Hook: adopt the existing markup (only called when canHydrate() returned true). Must NOT replace the children
   * (node identity, focus, native state are kept). The shared bind step (`afterRender()` + `_applyStyles()`) runs
   * right after it. Default: nothing.
   */
  hydrateExisting() {}

  /**
   * @protected Does the host carry the SSR marker `data-td-ssr="<name>@<schema>"` for exactly this contract?
   * @param {string} name
   * @param {number} schema
   * @returns {boolean}
   */
  _ssrMatches(name, schema) {
    const m = ssrMarker(this);
    return !!m && m.name === name && m.schema === schema;
  }

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
   * `::before`/`::after`, state-combinator, `@keyframes`, and `@media` rules in the
   * component's token CSS file (`src/styles/components/<name>.css`, built into td.css —
   * ADR 0008), keyed off STABLE BEM classes / `aria-*` / `data-*` state — NOT inline
   * `style=`, NOT an injected `<style>` and NOT CSS-in-JS (`adopt-styles.js` was removed
   * in 0.10.0).
   */

  // --- Attribute/Property Sync ---

  /**
   * Install the attribute-backed property accessors (camelCase of each observed attribute) and replay any value
   * assigned BEFORE connect / before `customElements.define` (such a value lives in an own data property that
   * would otherwise shadow the accessor and never reach the attribute). Names that already have an accessor on
   * the prototype chain (e.g. a subclass `value` getter/setter) keep it; an early value is replayed through it.
   * @private
   */
  _setupProperties() {
    const booleans = new Set(this.constructor.booleanAttributes);
    const early = [];
    for (const attr of this.constructor.observedAttributes) {
      const prop = attr.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      if (Object.prototype.hasOwnProperty.call(this, prop)) {
        early.push([prop, this[prop]]);
        delete this[prop];
      }
      if (prop in this) continue; // a subclass accessor (incl. camelCase of a dashed attribute) is kept
      const isBool = booleans.has(attr);
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
    if (!early.length) return;
    this._suppressRender = true;
    try {
      for (const [prop, val] of early) this[prop] = val;
    } finally {
      this._suppressRender = false;
    }
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (oldVal !== newVal && this._initialized) {
      this._doRender();
    }
  }

  // --- Owned inline custom properties ---

  /**
   * Set (or clear) a CSS custom property on the host that the COMPONENT owns. A non-empty `value` sets it and
   * remembers the name; an empty/null `value` removes it ONLY if this component set it earlier — a variable the
   * site put on the host itself (`el.style.setProperty('--td-…', x)`) is never wiped by a re-render.
   * @param {string} name - e.g. `'--td-btn-bg'`
   * @param {string|null|undefined} value
   * @protected
   */
  _setOwnedStyle(name, value) {
    if (!this.style) return; // non-DOM environments (node render tests)
    const owned = this._ownedStyles || (this._ownedStyles = new Set());
    if (value != null && value !== '') {
      this.style.setProperty(name, String(value));
      owned.add(name);
    } else if (owned.has(name)) {
      this.style.removeProperty(name);
      owned.delete(name);
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
