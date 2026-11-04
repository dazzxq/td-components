/**
 * v0.96.0 busy helper (plan docs/internal/plans/v0.96.0-busy-button.md §7 node): setButtonBusy / runWithButton /
 * syncButtonState / ensureSpinner / ensureGuard on a minimal self-written DOM (pure module: no customElements shim).
 * Real-browser behaviour (focus, FormData submitter, implicit submission, CSS): td-v096-button-busy.engines.browser-test.js.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { setButtonBusy, runWithButton, syncButtonState, ensureSpinner, ensureGuard } from './button-busy.js';

// ------------------------------------------------------------------------------------------------ minimal DOM
class FakeText {
  constructor(data, doc) { this.nodeType = 3; this.data = data; this.ownerDocument = doc; this.parentNode = null; }
}

class FakeElement {
  constructor(localName, doc, ns = null) {
    this.nodeType = 1;
    this.localName = localName;
    this.namespaceURI = ns;
    this.ownerDocument = doc;
    this.parentNode = null;
    this.childNodes = [];
    this.attrs = new Map();
    this.log = [];
    const self = this;
    this.classList = { contains: (c) => (self.attrs.get('class') || '').split(/\s+/).includes(c) };
  }
  get parentElement() { return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null; }
  get children() { return this.childNodes.filter((n) => n.nodeType === 1); }
  get hidden() { return this.attrs.has('hidden'); }
  set hidden(v) { if (v) this.attrs.set('hidden', ''); else this.attrs.delete('hidden'); }
  getAttribute(n) { return this.attrs.has(n) ? this.attrs.get(n) : null; }
  hasAttribute(n) { return this.attrs.has(n); }
  setAttribute(n, v) { this.log.push(`set ${n}=${v}`); this.attrs.set(n, String(v)); }
  removeAttribute(n) { this.log.push(`remove ${n}`); this.attrs.delete(n); }
  appendChild(c) { return this.insertBefore(c, null); }
  insertBefore(c, ref) {
    if (c.parentNode) c.parentNode.childNodes.splice(c.parentNode.childNodes.indexOf(c), 1);
    const i = ref ? this.childNodes.indexOf(ref) : -1;
    if (i < 0) this.childNodes.push(c); else this.childNodes.splice(i, 0, c);
    c.parentNode = this;
    return c;
  }
  get textContent() { return this.childNodes.map((n) => (n.nodeType === 3 ? n.data : n.textContent)).join(''); }
}

class FakeDocument {
  constructor() { this.nodeType = 9; this.listeners = []; }
  addEventListener(type, fn, capture) { this.listeners.push({ type, fn, capture }); }
  createElement(n) { return new FakeElement(n, this); }
  createElementNS(ns, n) { return new FakeElement(n, this, ns); }
  createTextNode(t) { return new FakeText(t, this); }
}

/** Build an element: el(doc, 'button', { class: 'td-btn' }, [children | 'text']) */
function el(doc, name, attrs = {}, kids = []) {
  const e = doc.createElement(name);
  for (const [k, v] of Object.entries(attrs)) e.attrs.set(k, v);
  for (const k of kids) e.appendChild(typeof k === 'string' ? doc.createTextNode(k) : k);
  return e;
}

const SPIN = (doc) => el(doc, 'span', { class: 'td-btn__spinner td-spinner td-spinner--sm', 'aria-hidden': 'true', hidden: '' });
const LABEL = (doc, t = 'Lưu') => el(doc, 'span', { class: 'td-btn__label' }, [t]);
const spinners = (c) => c.children.filter((k) => k.classList.contains('td-btn__spinner'));
const clicks = (doc) => doc.listeners.filter((l) => l.type === 'click' && l.capture === true);

/** A synthetic click event with a composed path from `target` up. */
function clickOn(target, { composedPath = true } = {}) {
  const path = [];
  for (let n = target; n; n = n.parentNode) path.push(n);
  const ev = {
    type: 'click', target, prevented: false, stopped: false,
    preventDefault() { this.prevented = true; },
    stopImmediatePropagation() { this.stopped = true; },
  };
  if (composedPath) ev.composedPath = () => path;
  return ev;
}
function fire(doc, ev) { for (const l of clicks(doc)) l.fn(ev); return ev; }

// ------------------------------------------------------------------------------------------------ 1. targets
describe('resolveTarget (both functions)', () => {
  it('accepts button.td-btn, a.td-btn, <td-button> / <td-action-button> hosts and a host control', () => {
    const doc = new FakeDocument();
    const b = el(doc, 'button', { class: 'td-btn' }, [LABEL(doc), SPIN(doc)]);
    setButtonBusy(b, true);
    assert.equal(b.getAttribute('aria-busy'), 'true');
    const a = el(doc, 'a', { class: 'td-btn', href: '/x' }, [LABEL(doc), SPIN(doc)]);
    setButtonBusy(a, true);
    assert.equal(a.getAttribute('aria-busy'), 'true');
    for (const tag of ['td-button', 'td-action-button']) {
      const host = el(doc, tag);
      const ctl = el(doc, 'button', { class: 'td-btn' }, [LABEL(doc), SPIN(doc)]);
      host.appendChild(ctl);
      setButtonBusy(host, true);
      assert.equal(host.hasAttribute('loading'), true, `${tag} host → loading`);
      setButtonBusy(ctl, false); // the inner control resolves to the host (B10)
      assert.equal(host.hasAttribute('loading'), false, `${tag} control → host`);
      assert.equal(ctl.hasAttribute('aria-busy'), false, 'never written straight onto the host control');
    }
  });

  it('a host with setLoading() delegates to it', () => {
    const doc = new FakeDocument();
    const host = el(doc, 'td-button');
    const calls = [];
    host.setLoading = (v) => calls.push(v);
    setButtonBusy(host, 1);
    setButtonBusy(host, 0);
    assert.deepEqual(calls, [true, false]);
  });

  it('anything else → TypeError (setButtonBusy throws, runWithButton throws synchronously)', () => {
    const doc = new FakeDocument();
    const bad = [null, undefined, 'button', 42, {}, el(doc, 'div', { class: 'td-btn' }), el(doc, 'button'),
      el(doc, 'a', { href: '/x' }), doc.createTextNode('x')];
    for (const t of bad) {
      assert.throws(() => setButtonBusy(t, true), (e) => e instanceof TypeError && /setButtonBusy: expected button\.td-btn/.test(e.message));
      assert.throws(() => runWithButton(t, () => {}), (e) => e instanceof TypeError && /runWithButton: expected/.test(e.message));
    }
  });
});

// ------------------------------------------------------------------------------------------------ 2. button
describe('setButtonBusy — button', () => {
  it('busy = aria-busy + aria-disabled, never disabled; release restores the author aria-disabled', () => {
    const doc = new FakeDocument();
    const b = el(doc, 'button', { class: 'td-btn', type: 'submit', name: 'action', value: 'x' }, [LABEL(doc), SPIN(doc)]);
    setButtonBusy(b, true);
    assert.equal(b.getAttribute('aria-busy'), 'true');
    assert.equal(b.getAttribute('aria-disabled'), 'true');
    assert.equal(b.hasAttribute('disabled'), false);
    assert.equal(spinners(b)[0].hidden, false);
    setButtonBusy(b, false);
    assert.equal(b.hasAttribute('aria-busy'), false);
    assert.equal(b.hasAttribute('aria-disabled'), false);
    assert.equal(spinners(b)[0].hidden, true);
    assert.equal(b.getAttribute('name'), 'action');

    const c = el(doc, 'button', { class: 'td-btn', 'aria-disabled': 'false' }, [LABEL(doc), SPIN(doc)]);
    setButtonBusy(c, true);
    assert.equal(c.getAttribute('aria-disabled'), 'true');
    setButtonBusy(c, false);
    assert.equal(c.getAttribute('aria-disabled'), 'false', 'author value restored verbatim');
  });

  it('server-printed busy (aria-busy + aria-disabled) taken over by the helper: release leaves the button usable', () => {
    const doc = new FakeDocument();
    const b = el(doc, 'button', { class: 'td-btn', 'aria-busy': 'true', 'aria-disabled': 'true' }, [LABEL(doc), SPIN(doc)]);
    setButtonBusy(b, true);
    assert.equal(b.getAttribute('aria-disabled'), 'true');
    setButtonBusy(b, false);
    assert.equal(b.hasAttribute('aria-busy'), false);
    assert.equal(b.hasAttribute('aria-disabled'), false, 'the busy mark is not snapshotted as the author value');
  });
});

// ------------------------------------------------------------------------------------------------ 3. link
describe('setButtonBusy — link', () => {
  it('tabindex is set BEFORE href is removed; href is restored BEFORE tabindex is removed', () => {
    const doc = new FakeDocument();
    const a = el(doc, 'a', { class: 'td-btn', href: '/docs' }, [LABEL(doc), SPIN(doc)]);
    setButtonBusy(a, true);
    const on = a.log.filter((l) => /tabindex|href/.test(l));
    assert.deepEqual(on, ['set tabindex=0', 'remove href']);
    assert.equal(a.getAttribute('role'), 'link');
    assert.equal(a.getAttribute('aria-disabled'), 'true');
    assert.equal(a.getAttribute('aria-busy'), 'true');
    a.log.length = 0;
    setButtonBusy(a, false);
    const off = a.log.filter((l) => /tabindex|href/.test(l));
    assert.deepEqual(off, ['set href=/docs', 'remove tabindex']);
    for (const n of ['role', 'aria-disabled', 'aria-busy', 'tabindex']) assert.equal(a.hasAttribute(n), false, n);
    assert.equal(a.getAttribute('href'), '/docs');
  });

  it('restores the author tabindex / role', () => {
    const doc = new FakeDocument();
    const a = el(doc, 'a', { class: 'td-btn', href: '/d', tabindex: '3', role: 'button' }, [LABEL(doc), SPIN(doc)]);
    setButtonBusy(a, true);
    assert.equal(a.getAttribute('tabindex'), '0');
    assert.equal(a.getAttribute('role'), 'link');
    setButtonBusy(a, false);
    assert.equal(a.getAttribute('tabindex'), '3');
    assert.equal(a.getAttribute('role'), 'button');
    assert.equal(a.getAttribute('href'), '/d');
  });

  it('a link inert before (no href / author aria-disabled / author role) stays tabindex=-1 while busy, then is restored exactly', () => {
    const doc = new FakeDocument();
    const cases = [
      { class: 'td-btn', 'aria-disabled': 'true', tabindex: '-1' },                       // PHP disabled td_link()
      { class: 'td-btn', href: '/x', 'aria-disabled': 'true' },                            // href + author aria-disabled
      { class: 'td-btn', 'aria-disabled': 'true', tabindex: '-1', role: 'link' },          // author role
    ];
    for (const attrs of cases) {
      const a = el(doc, 'a', attrs, [LABEL(doc), SPIN(doc)]);
      const before = new Map(a.attrs);
      setButtonBusy(a, true);
      assert.equal(a.getAttribute('tabindex'), '-1', JSON.stringify(attrs));
      assert.equal(a.hasAttribute('href'), false);
      assert.equal(a.getAttribute('aria-busy'), 'true');
      setButtonBusy(a, false);
      assert.deepEqual(new Map(a.attrs), before, `restored: ${JSON.stringify(attrs)}`);
    }
  });
});

// ------------------------------------------------------------------------------------------------ 4. idempotent
describe('setButtonBusy — idempotent', () => {
  it('busy twice never snapshots the busy state', () => {
    const doc = new FakeDocument();
    const a = el(doc, 'a', { class: 'td-btn', href: '/k' }, [LABEL(doc), SPIN(doc)]);
    setButtonBusy(a, true);
    setButtonBusy(a, true);
    setButtonBusy(a, false);
    assert.equal(a.getAttribute('href'), '/k');
    assert.equal(a.hasAttribute('tabindex'), false);
  });

  it('release without a snapshot (server-printed busy) only drops the busy marks', () => {
    const doc = new FakeDocument();
    const b = el(doc, 'button', { class: 'td-btn', 'aria-busy': 'true', 'aria-disabled': 'true', 'aria-describedby': 'h' },
      [LABEL(doc), el(doc, 'span', { class: 'td-btn__spinner' })]);
    setButtonBusy(b, false);
    assert.equal(b.hasAttribute('aria-busy'), false);
    assert.equal(b.hasAttribute('aria-disabled'), false);
    assert.equal(b.getAttribute('aria-describedby'), 'h');
    assert.equal(spinners(b)[0].hidden, true);
    const c = el(doc, 'button', { class: 'td-btn', 'aria-disabled': 'true' }, ['x']);
    setButtonBusy(c, false);
    assert.equal(c.getAttribute('aria-disabled'), 'true', 'not busy → nothing touched');
    assert.equal(c.childNodes.length, 1);
  });
});

// ------------------------------------------------------------------------------------------------ 5. runWithButton
describe('runWithButton', () => {
  it('busy BEFORE fn; a second call while in flight returns the same promise; fn runs once; released after', async () => {
    const doc = new FakeDocument();
    const b = el(doc, 'button', { class: 'td-btn' }, [LABEL(doc), SPIN(doc)]);
    let runs = 0;
    let nested;
    let release;
    const p = runWithButton(b, () => {
      runs += 1;
      assert.equal(b.getAttribute('aria-busy'), 'true', 'busy when fn starts');
      nested = runWithButton(b, () => { runs += 100; });
      return new Promise((r) => { release = r; });
    });
    assert.equal(b.getAttribute('aria-busy'), 'true', 'busy synchronously');
    assert.equal(runs, 0, 'fn starts a microtask later');
    assert.equal(runWithButton(b, () => { runs += 100; }), p);
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(nested, p, 'a synchronous nested call gets the same promise');
    release(7);
    assert.equal(await p, 7);
    assert.equal(runs, 1);
    assert.equal(b.hasAttribute('aria-busy'), false);
    await runWithButton(b, () => { runs += 1; });
    assert.equal(runs, 2, 'after settle a new run starts');
  });

  it('reject / synchronous throw release the busy state and reach the caller', async () => {
    const doc = new FakeDocument();
    const a = el(doc, 'a', { class: 'td-btn', href: '/r' }, [LABEL(doc), SPIN(doc)]);
    await assert.rejects(runWithButton(a, async () => { throw new Error('boom'); }), /boom/);
    assert.equal(a.getAttribute('href'), '/r');
    assert.equal(a.hasAttribute('aria-busy'), false);
    await assert.rejects(runWithButton(a, () => { throw new Error('sync'); }), /sync/);
    assert.equal(a.hasAttribute('aria-busy'), false);
  });

  it('fn not a function → rejected TypeError; a host with run() is delegated to', async () => {
    const doc = new FakeDocument();
    const b = el(doc, 'button', { class: 'td-btn' }, [LABEL(doc), SPIN(doc)]);
    await assert.rejects(runWithButton(b, 'nope'), (e) => e instanceof TypeError && /a function is required/.test(e.message));
    assert.equal(b.hasAttribute('aria-busy'), false);
    const host = el(doc, 'td-button');
    const ctl = el(doc, 'button', { class: 'td-btn' }, [LABEL(doc), SPIN(doc)]);
    host.appendChild(ctl);
    let delegated = 0;
    const sentinel = Promise.resolve('host');
    host.run = (fn) => { delegated += 1; assert.equal(typeof fn, 'function'); return sentinel; };
    assert.equal(runWithButton(host, () => {}), sentinel);
    assert.equal(runWithButton(ctl, () => {}), sentinel);
    assert.equal(delegated, 2);
  });

  it('an un-upgraded host (no run) uses the shared path with the loading attribute', async () => {
    const doc = new FakeDocument();
    const host = el(doc, 'td-button');
    let seen;
    await runWithButton(host, () => { seen = host.hasAttribute('loading'); });
    assert.equal(seen, true);
    assert.equal(host.hasAttribute('loading'), false);
  });
});

// ------------------------------------------------------------------------------------------------ 6. guard
describe('ensureGuard', () => {
  it('one capture listener per document, however often; two documents → two listeners', () => {
    const d1 = new FakeDocument();
    const d2 = new FakeDocument();
    for (let i = 0; i < 100; i += 1) ensureGuard(d1);
    assert.equal(clicks(d1).length, 1);
    assert.equal(ensureGuard(d1), false);
    assert.equal(ensureGuard(d2), true);
    assert.equal(clicks(d2).length, 1);
    assert.equal(ensureGuard(null), false);
    // installed lazily by the first busy state of a document
    const d3 = new FakeDocument();
    const b = el(d3, 'button', { class: 'td-btn' }, [LABEL(d3), SPIN(d3)]);
    assert.equal(clicks(d3).length, 0);
    setButtonBusy(b, true);
    setButtonBusy(b, false);
    setButtonBusy(b, true);
    assert.equal(clicks(d3).length, 1);
  });

  it('a click on a child of a busy control is swallowed; an idle control is untouched (composedPath + parentNode fallback)', () => {
    const doc = new FakeDocument();
    const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const icon = el(doc, 'span', { class: 'td-btn__icon' }, [svg]);
    const b = el(doc, 'button', { class: 'td-btn' }, [icon, LABEL(doc), SPIN(doc)]);
    const wrap = el(doc, 'div', {}, [b]);
    setButtonBusy(b, true);
    for (const composedPath of [true, false]) {
      const ev = fire(doc, clickOn(svg, { composedPath }));
      assert.equal(ev.prevented && ev.stopped, true, `swallowed (composedPath ${composedPath})`);
    }
    setButtonBusy(b, false);
    const ev = fire(doc, clickOn(svg));
    assert.equal(ev.prevented || ev.stopped, false);
    const other = fire(doc, clickOn(wrap));
    assert.equal(other.prevented, false);
  });
});

// ------------------------------------------------------------------------------------------------ 7. spinner
describe('ensureSpinner', () => {
  it('builds the spinner once (no style attribute), reuses existing markup, wraps bare text once', () => {
    const doc = new FakeDocument();
    const b = el(doc, 'button', { class: 'td-btn td-btn--primary' }, ['  Lưu  ']);
    const s1 = ensureSpinner(b);
    const s2 = ensureSpinner(b);
    assert.equal(s1, s2);
    assert.equal(spinners(b).length, 1);
    assert.equal(s1.getAttribute('class'), 'td-btn__spinner td-spinner td-spinner--sm');
    assert.equal(s1.getAttribute('aria-hidden'), 'true');
    assert.equal(s1.hidden, true);
    const svg = s1.children[0];
    assert.equal(svg.localName, 'svg');
    assert.equal(svg.namespaceURI, 'http://www.w3.org/2000/svg');
    assert.equal(svg.getAttribute('viewBox'), '0 0 50 50');
    assert.deepEqual(svg.children.map((c) => c.getAttribute('class')), ['td-spinner__track', 'td-spinner__arc']);
    const all = [b, ...b.children, s1, svg, ...svg.children];
    assert.equal(all.some((n) => n.hasAttribute('style')), false);
    const labels = b.children.filter((k) => k.classList.contains('td-btn__label'));
    assert.equal(labels.length, 1);
    assert.equal(labels[0].textContent, '  Lưu  ');
    assert.equal(b.childNodes[0], labels[0], 'label in place of the text');
    assert.equal(b.childNodes.at(-1), s1, 'spinner last');

    const c = el(doc, 'button', { class: 'td-btn' }, [LABEL(doc), SPIN(doc)]);
    const existing = spinners(c)[0];
    assert.equal(ensureSpinner(c), existing);
    assert.equal(c.children.length, 2);
  });

  it('busy → built; release → kept hidden; busy again → not duplicated', () => {
    const doc = new FakeDocument();
    const b = el(doc, 'button', { class: 'td-btn' }, ['Gửi']);
    setButtonBusy(b, true);
    setButtonBusy(b, false);
    setButtonBusy(b, true);
    assert.equal(spinners(b).length, 1);
    assert.equal(spinners(b)[0].hidden, false);
    assert.equal(b.children.filter((k) => k.classList.contains('td-btn__label')).length, 1);
  });
});

// ------------------------------------------------------------------------------------------------ syncButtonState (td-button path)
describe('syncButtonState (td-button path)', () => {
  it('inert link (disabled / unsafe href) → tabindex -1; idle restores the pass-through', () => {
    const doc = new FakeDocument();
    const a = el(doc, 'a', { class: 'td-btn' }, [LABEL(doc), SPIN(doc)]);
    syncButtonState(a, { busy: true, inert: true, restore: { href: '/h' } });
    assert.equal(a.getAttribute('tabindex'), '-1');
    assert.equal(a.getAttribute('aria-busy'), 'true');
    syncButtonState(a, { busy: false, inert: false, restore: { href: '/h', tabindex: '2', role: null, ariaDisabled: null } });
    assert.equal(a.getAttribute('href'), '/h');
    assert.equal(a.getAttribute('tabindex'), '2');
    assert.equal(a.hasAttribute('role'), false);
    assert.equal(a.hasAttribute('aria-disabled'), false);
    a.log.length = 0;
    syncButtonState(a, { busy: false, inert: false, restore: { href: '/h', tabindex: '2' } });
    assert.deepEqual(a.log, [], 'idempotent: no redundant writes');
  });
});
