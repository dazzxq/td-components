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
      el.connectedCallback(); // connect again without a disconnect: no duplicate render
      assert.equal(renderCount, 1);
    });

    it('re-renders once after disconnect → connect (DOM move) to re-bind listeners', () => {
      let renderCount = 0;
      class TestEl extends TdBaseElement {
        render() { renderCount++; return '<p>test</p>'; }
      }
      const el = new TestEl();
      el.connectedCallback();
      el.disconnectedCallback();
      el.connectedCallback();
      assert.equal(renderCount, 2);
      el.connectedCallback();
      assert.equal(renderCount, 2);
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

// --- v0.25.0 (ADR 0012): SSR hydrate hooks ---
const { ssrMarker } = await import('./td-base-element.js');

describe('TdBaseElement hydrate lifecycle (v0.25.0)', () => {
  /** A subclass that records every lifecycle call. */
  function make({ hydratable = false, can = false } = {}) {
    const calls = [];
    class El extends TdBaseElement {
      static hydratable = hydratable;
      canHydrate() { calls.push('canHydrate'); return can; }
      hydrateExisting() { calls.push('hydrateExisting'); }
      render() { calls.push('render'); return '<p>x</p>'; }
      afterRender() { calls.push('afterRender'); }
      _applyStyles() { calls.push('applyStyles'); }
    }
    return { el: new El(), calls };
  }

  it('defaults: canHydrate() → false, hydrateExisting() exists, static hydratable false', () => {
    const el = new TdBaseElement();
    assert.equal(el.canHydrate(), false);
    assert.equal(typeof el.hydrateExisting, 'function');
    assert.equal(TdBaseElement.hydratable, false);
  });

  it('canHydrate() true → hydrateExisting + afterRender + _applyStyles, NO render / innerHTML', () => {
    const { el, calls } = make({ hydratable: true, can: true });
    el.innerHTML = '<ssr></ssr>';
    el.connectedCallback();
    assert.deepEqual(calls, ['canHydrate', 'hydrateExisting', 'afterRender', 'applyStyles']);
    assert.equal(el.innerHTML, '<ssr></ssr>');
    assert.equal(el._hydrated, true);
  });

  it('canHydrate() false → render as before', () => {
    const { el, calls } = make({ hydratable: true, can: false });
    el.connectedCallback();
    assert.deepEqual(calls, ['canHydrate', 'render', 'afterRender', 'applyStyles']);
    assert.equal(el.innerHTML, '<p>x</p>');
    assert.ok(!el._hydrated);
  });

  it('hydratable: reconnect re-binds (afterRender + _applyStyles) WITHOUT render', () => {
    const { el, calls } = make({ hydratable: true, can: true });
    el.connectedCallback();
    calls.length = 0;
    el.disconnectedCallback();
    el.connectedCallback();
    assert.deepEqual(calls, ['afterRender', 'applyStyles']);
    el.connectedCallback(); // no disconnect in between → nothing
    assert.deepEqual(calls, ['afterRender', 'applyStyles']);
  });

  it('hydratable but rendered (canHydrate false): reconnect still re-binds without render', () => {
    const { el, calls } = make({ hydratable: true, can: false });
    el.connectedCallback();
    calls.length = 0;
    el.disconnectedCallback();
    el.connectedCallback();
    assert.deepEqual(calls, ['afterRender', 'applyStyles']);
  });

  it('NOT hydratable: reconnect renders again (unchanged lifecycle), canHydrate still consulted on first connect', () => {
    const { el, calls } = make({ hydratable: false, can: false });
    el.connectedCallback();
    assert.deepEqual(calls, ['canHydrate', 'render', 'afterRender', 'applyStyles']);
    calls.length = 0;
    el.disconnectedCallback();
    el.connectedCallback();
    assert.deepEqual(calls, ['render', 'afterRender', 'applyStyles']);
  });

  it('data-td-ssr is removed after the first connect of a hydratable element (hydrated or not); kept otherwise', () => {
    const a = make({ hydratable: true, can: true }).el;
    a.setAttribute('data-td-ssr', 'x@1');
    a.connectedCallback();
    assert.equal(a.hasAttribute('data-td-ssr'), false);
    const b = make({ hydratable: true, can: false }).el;
    b.setAttribute('data-td-ssr', 'x@2');
    b.connectedCallback();
    assert.equal(b.hasAttribute('data-td-ssr'), false);
    const c = make({ hydratable: false }).el;
    c.setAttribute('data-td-ssr', 'x@1');
    c.connectedCallback();
    assert.equal(c.getAttribute('data-td-ssr'), 'x@1');
  });

  it('review round 1 IMPL-2: cleanups registered while detached run before the re-connect bind (one listener)', () => {
    for (const hydratable of [true, false]) {
      const target = new MockHTMLElement();
      class El extends TdBaseElement {
        static hydratable = hydratable;
        afterRender() { this.listen(target, 'click', () => {}); }
      }
      const el = new El();
      el.connectedCallback();
      assert.equal(target._listeners.length, 1);
      el.disconnectedCallback();
      assert.equal(target._listeners.length, 0);
      el._doRender(); // e.g. a structural attribute changed while detached
      assert.equal(target._listeners.length, 1);
      el.connectedCallback();
      assert.equal(target._listeners.length, 1, `hydratable=${hydratable}`);
      assert.equal(el._cleanups.length, 1);
    }
  });

  it('review round 1 SEC-1: a hydratable element whose canRebind() fails re-renders on re-connect', () => {
    const calls = [];
    let ok = true;
    class El extends TdBaseElement {
      static hydratable = true;
      canHydrate() { return true; }
      canRebind() { calls.push('canRebind'); return ok; }
      render() { calls.push('render'); return '<p>x</p>'; }
    }
    const el = new El();
    el.connectedCallback();
    el.disconnectedCallback();
    el.connectedCallback();
    assert.deepEqual(calls, ['canRebind']);
    ok = false;
    el.disconnectedCallback();
    el.connectedCallback();
    assert.deepEqual(calls, ['canRebind', 'canRebind', 'render']);
    assert.equal(new TdBaseElement().canRebind(), true);
  });

  it('canHydrate() sees early properties already replayed', () => {
    let seen;
    class El extends TdBaseElement {
      static get observedAttributes() { return ['loading']; }
      static get booleanAttributes() { return ['loading']; }
      canHydrate() { seen = this.hasAttribute('loading'); return true; }
    }
    const el = new El();
    el.loading = true; // before upgrade/connect: own data property
    el.connectedCallback();
    assert.equal(seen, true);
  });

  it('ssrMarker(el) parses data-td-ssr = "<name>@<schema>"; _ssrMatches(name, schema)', () => {
    const el = new TdBaseElement();
    assert.equal(ssrMarker(el), null);
    el.setAttribute('data-td-ssr', 'button@1');
    assert.deepEqual(ssrMarker(el), { name: 'button', schema: 1 });
    assert.equal(el._ssrMatches('button', 1), true);
    assert.equal(el._ssrMatches('button', 2), false);
    assert.equal(el._ssrMatches('alert', 1), false);
    for (const bad of ['button', 'button@', '@1', 'button@0', 'button@x', 'Button@1', 'button@1@2', ' button@1x']) {
      el.setAttribute('data-td-ssr', bad);
      assert.equal(ssrMarker(el), null, bad);
    }
    assert.equal(ssrMarker(null), null);
  });
});
