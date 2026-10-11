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

describe('TdButton variant (v0.69.0 plain)', () => {
  const cls = (html) => /^<(?:button|a) class="([^"]*)"/.exec(html)[1].split(' ');

  it('plain is a known variant: td-btn--plain, never the primary fallback', () => {
    const c = cls(renderWith({ variant: 'plain' }));
    assert.ok(c.includes('td-btn--plain'), c.join(' '));
    assert.ok(!c.includes('td-btn--primary'), c.join(' '));
    assert.deepEqual(c, ['td-btn', 'td-btn--plain', 'td-btn--md']);
  });

  it('plain keeps its size and the link form (<a>) like every variant', () => {
    assert.deepEqual(cls(renderWith({ variant: 'plain', size: 'sm' })), ['td-btn', 'td-btn--plain', 'td-btn--sm']);
    assert.deepEqual(cls(renderWith({ variant: 'plain', size: 'lg' })), ['td-btn', 'td-btn--plain', 'td-btn--lg']);
    const link = renderWith({ variant: 'plain', href: '/x' });
    assert.match(link, /^<a class="td-btn td-btn--plain td-btn--md"/);
  });

  it('plain ignores color / text-color: no td-btn--custom (it would become a filled box)', () => {
    for (const attrs of [{ color: '#ff0000' }, { color: '#ff0000', 'text-color': '#ffffff' }, { 'text-color': '#00ff00' },
      { color: 'rgb(1, 2, 3)' }, { color: '#ff0000', href: '/x' }, { color: '#ff0000', 'full-width': '' }]) {
      const c = cls(renderWith({ variant: 'plain', ...attrs }));
      assert.ok(!c.includes('td-btn--custom'), `${JSON.stringify(attrs)} → ${c.join(' ')}`);
      assert.ok(c.includes('td-btn--plain'), `${JSON.stringify(attrs)} → ${c.join(' ')}`);
    }
  });

  it('the exemption is plain only: ghost / primary with a colour still become td-btn--custom', () => {
    assert.ok(cls(renderWith({ variant: 'ghost', color: '#ff0000' })).includes('td-btn--custom'));
    assert.ok(cls(renderWith({ variant: 'primary', color: '#ff0000' })).includes('td-btn--custom'));
    assert.ok(cls(renderWith({ color: '#ff0000' })).includes('td-btn--custom'));
    assert.ok(!cls(renderWith({ variant: 'ghost' })).includes('td-btn--custom'));
  });

  it('an unknown variant still falls back to primary (exact, case-sensitive match only)', () => {
    for (const v of ['nope', 'PLAIN', 'Plain', 'plain ', ' plain', 'plain" onclick="x', 'plainer', '']) {
      const html = renderWith({ variant: v });
      assert.ok(cls(html).includes('td-btn--primary'), `${JSON.stringify(v)} → ${cls(html).join(' ')}`);
      assert.ok(!cls(html).includes('td-btn--plain'), JSON.stringify(v));
      assert.doesNotMatch(html, /onclick/);
    }
    assert.deepEqual(cls(renderWith()), ['td-btn', 'td-btn--primary', 'td-btn--md']);
  });

  it('every other variant is unchanged', () => {
    for (const v of ['primary', 'secondary', 'success', 'danger', 'info', 'warning', 'ghost']) {
      assert.deepEqual(cls(renderWith({ variant: v })), ['td-btn', `td-btn--${v}`, 'td-btn--md'], v);
    }
  });
});
