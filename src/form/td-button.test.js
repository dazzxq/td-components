import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// --- Minimal DOM shim for Node testing (mirrors td-base-element.test.js) ---
class MockEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.bubbles = options.bubbles ?? false;
    this.composed = options.composed ?? false;
    this.detail = options.detail ?? null;
  }
}

class MockHTMLElement {
  constructor() {
    this._attributes = new Map();
    this._listeners = [];
    this.innerHTML = '';
    this.textContent = '';
  }
  getAttribute(name) { return this._attributes.get(name) ?? null; }
  setAttribute(name, value) {
    const old = this._attributes.get(name) ?? null;
    this._attributes.set(name, String(value));
    if (this.attributeChangedCallback && this.constructor.observedAttributes?.includes(name)) {
      this.attributeChangedCallback(name, old, String(value));
    }
  }
  removeAttribute(name) { this._attributes.delete(name); }
  hasAttribute(name) { return this._attributes.has(name); }
  addEventListener(type, handler, options) { this._listeners.push({ type, handler, options }); }
  removeEventListener() {}
  dispatchEvent(event) { this._lastDispatchedEvent = event; return true; }
  querySelector() { return null; }
}

const registry = new Map();
globalThis.customElements = {
  get: (name) => registry.get(name),
  define: (name, cls) => { if (!registry.has(name)) registry.set(name, cls); },
};
globalThis.HTMLElement = MockHTMLElement;
globalThis.CustomEvent = MockEvent;
globalThis.window = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id),
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (id) => clearInterval(id),
};

const { TdButton } = await import('./td-button.js');

/** Render a td-button with the given attributes and return the HTML string. */
function renderWith(attrs = {}) {
  const el = new TdButton();
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el.render();
}

describe('TdButton type attribute', () => {
  it('observes the "type" attribute', () => {
    assert.ok(TdButton.observedAttributes.includes('type'));
  });

  it('defaults the inner button to type="button"', () => {
    assert.match(renderWith(), /type="button"/);
  });

  it('renders type="submit" when type="submit"', () => {
    const html = renderWith({ type: 'submit' });
    assert.match(html, /type="submit"/);
    assert.doesNotMatch(html, /type="button"/);
  });

  it('renders type="reset" when type="reset"', () => {
    const html = renderWith({ type: 'reset' });
    assert.match(html, /type="reset"/);
  });

  it('falls back to type="button" for an invalid type (whitelist)', () => {
    const html = renderWith({ type: 'evil' });
    assert.match(html, /type="button"/);
    assert.doesNotMatch(html, /evil/);
  });

  it('does not allow attribute injection via the type value', () => {
    const html = renderWith({ type: 'button" onclick="alert(1)' });
    assert.match(html, /type="button"/);
    assert.doesNotMatch(html, /onclick/);
  });
});
