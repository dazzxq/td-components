import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

// --- Minimal DOM shim for Node testing ---
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
  }

  getAttribute(name) {
    return this._attributes.get(name) ?? null;
  }

  setAttribute(name, value) {
    const old = this._attributes.get(name) ?? null;
    this._attributes.set(name, String(value));
    if (this.attributeChangedCallback && this.constructor.observedAttributes?.includes(name)) {
      this.attributeChangedCallback(name, old, String(value));
    }
  }

  removeAttribute(name) {
    const old = this._attributes.get(name) ?? null;
    this._attributes.delete(name);
    if (this.attributeChangedCallback && this.constructor.observedAttributes?.includes(name)) {
      this.attributeChangedCallback(name, old, null);
    }
  }

  hasAttribute(name) {
    return this._attributes.has(name);
  }

  addEventListener(type, handler, options) {
    this._listeners.push({ type, handler, options });
  }

  removeEventListener(type, handler, options) {
    this._listeners = this._listeners.filter(
      l => !(l.type === type && l.handler === handler)
    );
  }

  dispatchEvent(event) {
    this._lastDispatchedEvent = event;
    return true;
  }
}

// Mock customElements registry
const registry = new Map();
globalThis.customElements = {
  get: (name) => registry.get(name),
  define: (name, cls) => {
    if (registry.has(name)) throw new Error(`Already defined: ${name}`);
    registry.set(name, cls);
  },
};

globalThis.HTMLElement = MockHTMLElement;
globalThis.CustomEvent = MockEvent;
globalThis.window = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id),
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (id) => clearInterval(id),
};

// --- Import modules under test ---
const { escapeHtml } = await import('../utils/escape.js');
const { TdBaseElement } = await import('./td-base-element.js');

// --- escapeHtml tests ---
describe('escapeHtml', () => {
  it('escapes & character', () => {
    assert.equal(escapeHtml('a&b'), 'a&amp;b');
  });

  it('escapes < character', () => {
    assert.equal(escapeHtml('<script>'), '&lt;script&gt;');
  });

  it('escapes > character', () => {
    assert.equal(escapeHtml('a>b'), 'a&gt;b');
  });

  it('escapes " character', () => {
    assert.equal(escapeHtml('"hello"'), '&quot;hello&quot;');
  });

  it("escapes ' character", () => {
    assert.equal(escapeHtml("it's"), "it&#39;s");
  });

  it('handles non-string input', () => {
    assert.equal(escapeHtml(42), '42');
    assert.equal(escapeHtml(null), '');
    assert.equal(escapeHtml(undefined), '');
  });
});

// --- TdBaseElement tests ---
describe('TdBaseElement', () => {
  it('extends HTMLElement', () => {
    assert.ok(TdBaseElement.prototype instanceof HTMLElement);
  });

  it('has all required methods', () => {
    const proto = TdBaseElement.prototype;
    const methods = ['render', 'afterRender', 'listen', 'setTimeout', 'setInterval', 'emit', 'escapeHtml'];
    for (const m of methods) {
      assert.equal(typeof proto[m], 'function', `Missing method: ${m}`);
    }
  });

  describe('lifecycle', () => {
    it('calls render() on connectedCallback', () => {
      class TestEl extends TdBaseElement {
        render() { return '<p>hello</p>'; }
      }
      const el = new TestEl();
      el.connectedCallback();
      assert.equal(el.innerHTML, '<p>hello</p>');
    });

    it('_initialized flag prevents duplicate render on DOM move', () => {
      let renderCount = 0;
      class TestEl extends TdBaseElement {
        render() { renderCount++; return '<p>test</p>'; }
      }
      const el = new TestEl();
      el.connectedCallback();
      el.connectedCallback(); // simulates DOM move
      assert.equal(renderCount, 1);
    });
  });

  describe('cleanup tracking', () => {
    it('listen() tracks and disconnectedCallback removes listeners', () => {
      const el = new TdBaseElement();
      el.connectedCallback();

      const target = new MockHTMLElement();
      const handler = () => {};
      el.listen(target, 'click', handler);

      assert.equal(target._listeners.length, 1);

      el.disconnectedCallback();
      assert.equal(target._listeners.length, 0);
    });

    it('setTimeout is tracked and cleared on disconnect', () => {
      const el = new TdBaseElement();
      el.connectedCallback();

      let called = false;
      const clearSpy = mock.fn();
      const origClear = globalThis.window.clearTimeout;
      globalThis.window.clearTimeout = clearSpy;

      el.setTimeout(() => { called = true; }, 10000);
      el.disconnectedCallback();

      assert.equal(clearSpy.mock.calls.length, 1);
      globalThis.window.clearTimeout = origClear;
    });

    it('setInterval is tracked and cleared on disconnect', () => {
      const el = new TdBaseElement();
      el.connectedCallback();

      const clearSpy = mock.fn();
      const origClear = globalThis.window.clearInterval;
      globalThis.window.clearInterval = clearSpy;

      el.setInterval(() => {}, 1000);
      el.disconnectedCallback();

      assert.equal(clearSpy.mock.calls.length, 1);
      globalThis.window.clearInterval = origClear;
    });
  });

  describe('attribute/property sync', () => {
    it('boolean attributes use hasAttribute getter and toggle via setter', () => {
      class TestEl extends TdBaseElement {
        static get observedAttributes() { return ['checked', 'disabled']; }
        static get booleanAttributes() { return ['checked', 'disabled']; }
      }
      const el = new TestEl();
      el.connectedCallback();

      assert.equal(el.checked, false);
      el.checked = true;
      assert.equal(el.hasAttribute('checked'), true);
      assert.equal(el.checked, true);

      el.checked = false;
      assert.equal(el.hasAttribute('checked'), false);
      assert.equal(el.checked, false);
    });

    it('string attributes use getAttribute getter and setAttribute via setter', () => {
      class TestEl extends TdBaseElement {
        static get observedAttributes() { return ['label', 'size']; }
      }
      const el = new TestEl();
      el.connectedCallback();

      assert.equal(el.label, '');
      el.label = 'Hello';
      assert.equal(el.getAttribute('label'), 'Hello');
      assert.equal(el.label, 'Hello');
    });
  });

  describe('attributeChangedCallback', () => {
    it('triggers re-render when initialized', () => {
      let renderCount = 0;
      class TestEl extends TdBaseElement {
        static get observedAttributes() { return ['label']; }
        render() { renderCount++; return `<span>${this.label}</span>`; }
      }
      const el = new TestEl();
      el.connectedCallback(); // renderCount = 1
      el.attributeChangedCallback('label', 'old', 'new'); // renderCount = 2
      assert.equal(renderCount, 2);
    });

    it('does not re-render before initialization', () => {
      let renderCount = 0;
      class TestEl extends TdBaseElement {
        render() { renderCount++; return ''; }
      }
      const el = new TestEl();
      el.attributeChangedCallback('x', null, 'v');
      assert.equal(renderCount, 0);
    });

    it('does not re-render when value unchanged', () => {
      let renderCount = 0;
      class TestEl extends TdBaseElement {
        render() { renderCount++; return ''; }
      }
      const el = new TestEl();
      el.connectedCallback(); // renderCount = 1
      el.attributeChangedCallback('x', 'same', 'same');
      assert.equal(renderCount, 1);
    });
  });

  describe('emit()', () => {
    it('dispatches CustomEvent with bubbles:true, composed:true, and detail', () => {
      const el = new TdBaseElement();
      el.emit('my-event', { value: 42 });
      const evt = el._lastDispatchedEvent;
      assert.equal(evt.type, 'my-event');
      assert.equal(evt.bubbles, true);
      assert.equal(evt.composed, true);
      assert.deepEqual(evt.detail, { value: 42 });
    });
  });

  describe('auto-registration', () => {
    it('skips if tag already defined (no error thrown)', () => {
      // Register a dummy element
      class DummyEl extends TdBaseElement {}
      registry.set('td-dummy', DummyEl);

      // Attempting to define again should not throw when using the check pattern
      assert.doesNotThrow(() => {
        if (!customElements.get('td-dummy')) {
          customElements.define('td-dummy', DummyEl);
        }
      });
    });
  });

  describe('escapeHtml instance method', () => {
    it('delegates to utility function', () => {
      const el = new TdBaseElement();
      assert.equal(el.escapeHtml('<b>'), '&lt;b&gt;');
    });
  });
});
