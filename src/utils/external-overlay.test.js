/**
 * v0.96.0 external overlays (ADR 0042) — registry + "visible and above" rule, on a tiny DOM shim (no layout: z-index,
 * display and visibility come from a per-element fake computed style). Browser behaviour (inert, Escape, Tab, scrim,
 * focus return): src/feedback/td-v096-modal-external.engines.browser-test.js.
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

class FakeEl {
  constructor(cls = '', css = {}) {
    this.className = cls;
    // a numeric z-index only counts on a positioned box (v0.96.0 security r2): fakes with a z default to fixed
    this.css = { display: 'block', visibility: 'visible', zIndex: 'auto', opacity: '1', ...css };
    if (!('position' in css)) this.css.position = this.css.zIndex === 'auto' ? 'static' : 'fixed';
    this.attrs = new Map();
    this.children = [];
    this.parentElement = null;
    this.hidden = false;
  }
  hasAttribute(n) { return this.attrs.has(n); }
  setAttribute(n, v) { this.attrs.set(n, String(v)); }
  removeAttribute(n) { this.attrs.delete(n); }
  appendChild(c) { c.parentElement = this; this.children.push(c); return c; }
  matches(sel) {
    return sel.split(',').map((s) => s.trim()).some((s) => {
      if (!/^\.[\w-]+$/.test(s)) throw new SyntaxError('unsupported');
      return this.className.split(/\s+/).includes(s.slice(1));
    });
  }
  getClientRects() { return this.css.display === 'none' ? [] : [{}]; }
  compareDocumentPosition(other) {
    const kids = document.body.children;
    return kids.indexOf(other) > kids.indexOf(this) ? 4 : 2;
  }
  querySelector() { return null; }
}

class FakeBody extends FakeEl {
  querySelector(sel) {
    const m = /^:scope > \[([\w-]+)\]$/.exec(sel);
    if (!m) throw new SyntaxError('unsupported');
    return this.children.find((c) => c.hasAttribute(m[1])) || null;
  }
}

const body = new FakeBody();
globalThis.Element = FakeEl;
globalThis.document = {
  body,
  createDocumentFragment: () => ({
    querySelector(sel) {
      if (/^[.#]?[\w-]+(\s*,\s*[.#]?[\w-]+)*$/.test(sel.trim())) return null;
      throw new SyntaxError(`'${sel}' is not a valid selector`);
    },
  }),
};
globalThis.getComputedStyle = (el) => el.css;

const {
  registerExternalOverlay, isExternalRoot, externalAbove, externalOverlayAbove, onExternalOverlayChange, isAbove,
} = await import('./external-overlay.js');

const tick = () => new Promise((r) => setTimeout(r, 0));
let offs = [];
let errors = [];
const origError = console.error;

beforeEach(() => {
  body.children = [];
  offs = [];
  errors = [];
  console.error = (...a) => { errors.push(a.join(' ')); };
});
afterEach(() => {
  for (const off of offs) off();
  console.error = origError;
});

function setup() {
  const modal = body.appendChild(new FakeEl('td-modal', { zIndex: '400' }));
  const ext = body.appendChild(new FakeEl('fake-ext', { zIndex: '160000' }));
  return { modal, ext };
}

describe('isAbove (pure order rule)', () => {
  it('higher z wins; equal z → the later one in DOM order', () => {
    assert.equal(isAbove(5, 4, false), true);
    assert.equal(isAbove(4, 5, true), false);
    assert.equal(isAbove(4, 4, true), true);
    assert.equal(isAbove(4, 4, false), false);
  });
});

describe('registerExternalOverlay', () => {
  it('nothing registered and no attribute → nothing is external (old behaviour)', () => {
    const { modal, ext } = setup();
    assert.equal(isExternalRoot(ext), false);
    assert.equal(externalAbove(ext, [modal]), false);
    assert.equal(externalOverlayAbove(modal), null);
  });

  it('a selector registers; off() unregisters and is idempotent', () => {
    const { modal, ext } = setup();
    const off = registerExternalOverlay('.fake-ext');
    assert.equal(externalOverlayAbove(modal), ext);
    off();
    off();
    assert.equal(externalOverlayAbove(modal), null);
  });

  it('an invalid selector / value logs a fixed error, never throws, registers nothing', () => {
    const { modal } = setup();
    let off;
    assert.doesNotThrow(() => { off = registerExternalOverlay('[[nope'); });
    assert.doesNotThrow(() => registerExternalOverlay(42));
    assert.doesNotThrow(() => registerExternalOverlay(''));
    assert.equal(typeof off, 'function');
    off();
    assert.equal(errors.length, 3);
    assert.ok(errors.every((m) => m === errors[0]), 'one fixed message');
    assert.equal(externalOverlayAbove(modal), null);
  });

  it('a predicate that throws counts as "not external" with a fixed message (the site error is not echoed)', () => {
    const { modal } = setup();
    offs.push(registerExternalOverlay(() => { throw new Error('SECRET site detail'); }));
    assert.equal(externalOverlayAbove(modal), null);
    assert.ok(errors.length >= 1);
    assert.ok(errors.every((m) => !m.includes('SECRET')));
  });

  it('a predicate and an Element match', () => {
    const { modal, ext } = setup();
    const offA = registerExternalOverlay((el) => el.className === 'fake-ext');
    assert.equal(externalOverlayAbove(modal), ext);
    offA();
    const offB = registerExternalOverlay(ext);
    assert.equal(externalOverlayAbove(modal), ext);
    offB();
    assert.equal(externalOverlayAbove(modal), null);
  });

  it('the same matcher twice is ref-counted', () => {
    const { modal, ext } = setup();
    const a = registerExternalOverlay('.fake-ext');
    const b = registerExternalOverlay('.fake-ext');
    a();
    assert.equal(externalOverlayAbove(modal), ext, 'still registered by b');
    b();
    assert.equal(externalOverlayAbove(modal), null);
  });

  it('the data-td-external-overlay attribute counts without JS registration', () => {
    const { modal, ext } = setup();
    ext.setAttribute('data-td-external-overlay', '');
    assert.equal(isExternalRoot(ext), true);
    assert.equal(externalOverlayAbove(modal), ext);
  });

  it('only direct children of <body> count (a nested match is ignored)', () => {
    const { modal } = setup();
    const wrap = body.appendChild(new FakeEl('wrap', { zIndex: '170000' }));
    const nested = wrap.appendChild(new FakeEl('fake-ext', { zIndex: '170000' }));
    body.children = body.children.filter((c) => c.className !== 'fake-ext');
    offs.push(registerExternalOverlay('.fake-ext'));
    assert.equal(isExternalRoot(nested), false);
    assert.equal(externalOverlayAbove(modal), null);
  });
});

describe('visible and above', () => {
  it('hidden (display:none, [hidden], visibility:hidden) does not count', () => {
    const { modal, ext } = setup();
    offs.push(registerExternalOverlay('.fake-ext'));
    ext.css.display = 'none';
    assert.equal(externalOverlayAbove(modal), null);
    assert.equal(externalAbove(ext, [modal]), false);
    ext.css.display = 'block';
    ext.hidden = true;
    assert.equal(externalOverlayAbove(modal), null);
    ext.hidden = false;
    ext.css.visibility = 'hidden';
    assert.equal(externalOverlayAbove(modal), null);
    ext.css.visibility = 'visible';
    assert.equal(externalOverlayAbove(modal), ext);
  });

  it('below the layer does not count; equal z → DOM order decides', () => {
    const { modal, ext } = setup();
    offs.push(registerExternalOverlay('.fake-ext'));
    ext.css.zIndex = '10';
    assert.equal(externalOverlayAbove(modal), null);
    assert.equal(externalAbove(ext, [modal]), false);
    ext.css.zIndex = '400';
    assert.equal(externalOverlayAbove(modal), ext, 'same z, later in DOM');
    body.children = [ext, modal];
    assert.equal(externalOverlayAbove(modal), null, 'same z, earlier in DOM');
  });

  it('a z-index:auto wrapper ranks by its highest child z (wp.media wraps its fixed .media-modal)', () => {
    const modal = body.appendChild(new FakeEl('td-modal', { zIndex: '400' }));
    const wrap = body.appendChild(new FakeEl('', { zIndex: 'auto' }));
    wrap.appendChild(new FakeEl('media-modal', { zIndex: '160000' }));
    wrap.appendChild(new FakeEl('media-modal-backdrop', { zIndex: '159900' }));
    offs.push(registerExternalOverlay((el) => el.children.some((c) => c.className === 'media-modal')));
    assert.equal(externalOverlayAbove(modal), wrap);
  });

  it('fails closed (security review v0.96.0): opacity 0, hidden high-z child, ineffective static z, stacking wrapper', () => {
    const modal = body.appendChild(new FakeEl('td-modal', { zIndex: '400' }));
    const faded = body.appendChild(new FakeEl('fake-ext', { zIndex: '160000', opacity: '0' }));
    faded.setAttribute('data-td-external-overlay', '');
    assert.equal(externalAbove(faded, [modal]), false, 'opacity 0 = not shown');
    const wrap = body.appendChild(new FakeEl('', { zIndex: 'auto' }));
    wrap.setAttribute('data-td-external-overlay', '');
    wrap.appendChild(new FakeEl('media-modal', { zIndex: '160000', display: 'none' }));
    assert.equal(externalAbove(wrap, [modal]), false, 'a hidden high-z child never lifts the root');
    const stat = body.appendChild(new FakeEl('fake-ext', { zIndex: '160000', position: 'static' }));
    stat.setAttribute('data-td-external-overlay', '');
    assert.equal(externalAbove(stat, [modal]), false, 'z-index on a static box is ignored');
    const moved = body.appendChild(new FakeEl('', { zIndex: 'auto', translate: '0px' }));
    moved.setAttribute('data-td-external-overlay', '');
    moved.appendChild(new FakeEl('media-modal', { zIndex: '160000' }));
    assert.equal(externalAbove(moved, [modal]), false, 'a translate wrapper is its own stacking context → ranks 0');
    const hinted = body.appendChild(new FakeEl('', { zIndex: 'auto', willChange: 'clip-path' }));
    hinted.setAttribute('data-td-external-overlay', '');
    hinted.appendChild(new FakeEl('media-modal', { zIndex: '160000' }));
    assert.equal(externalAbove(hinted, [modal]), false, 'any will-change hint → its own stacking context');
  });

  it('externalAbove needs every kept element below it, and at least one kept element', () => {
    const { modal, ext } = setup();
    const lb = body.appendChild(new FakeEl('td-lightbox', { zIndex: '200000' }));
    offs.push(registerExternalOverlay('.fake-ext'));
    assert.equal(externalAbove(ext, [modal]), true);
    assert.equal(externalAbove(ext, [modal, lb]), false);
    assert.equal(externalAbove(ext, []), false);
    // a kept element nested in a body child is ranked by that body child
    const inner = modal.appendChild(new FakeEl('td-modal__dialog', { zIndex: '999999' }));
    assert.equal(externalAbove(ext, [inner]), true);
  });
});

describe('onExternalOverlayChange', () => {
  it('fires (batched) when the registry changes; unsubscribe is idempotent', async () => {
    setup();
    let calls = 0;
    const off = onExternalOverlayChange(() => { calls += 1; });
    const a = registerExternalOverlay('.fake-ext');
    const b = registerExternalOverlay('.other');
    await tick();
    assert.equal(calls, 1, 'two changes in one task → one call');
    a();
    await tick();
    assert.equal(calls, 2);
    off();
    off();
    b();
    await tick();
    assert.equal(calls, 2, 'no call after unsubscribe');
  });

  it('a throwing listener does not stop the others', async () => {
    let ok = 0;
    const offA = onExternalOverlayChange(() => { throw new Error('x'); });
    const offB = onExternalOverlayChange(() => { ok += 1; });
    const off = registerExternalOverlay('.fake-ext');
    await tick();
    assert.equal(ok, 1);
    off(); offA(); offB();
  });
});
