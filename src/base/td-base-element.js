import { escapeHtml } from '../utils/escape.js';

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
    }
  }

  disconnectedCallback() {
    this._cleanups.forEach(fn => fn());
    this._cleanups = [];
  }

  // --- Rendering ---

  /** @returns {string} HTML string. Override in subclass. */
  render() { return ''; }

  /** @private */
  _doRender() {
    this.innerHTML = this.render();
    this.afterRender();
  }

  /** Hook for subclass to bind events after render. Called after every render. */
  afterRender() {}

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

  /** Escape HTML entities to prevent XSS. */
  escapeHtml(str) {
    return escapeHtml(str);
  }
}
