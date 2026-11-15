// v0.36.2 (ADR 0019, plan QĐ 7): ensurePressStates() — one passive listener set per document, data-td-pressed for
// touch / pen only, cleared on release / cancel / moving past the slop / blur / visibilitychange.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ensurePressStates, PRESS_TARGETS, PRESS_SELECTOR, pressTargetOf } from './press.js';

/** Minimal element: closest() walks a fixed chain, attributes in a Map. */
class El {
  constructor(name, parent = null, { press = false, disabled = false } = {}) {
    this.name = name; this.parentElement = parent; this.press = press; this.disabled = disabled; this.attrs = new Map();
  }
  setAttribute(k, v) { this.attrs.set(k, String(v)); }
  removeAttribute(k) { this.attrs.delete(k); }
  hasAttribute(k) { return this.attrs.has(k); }
  matches(sel) { return sel === PRESS_SELECTOR ? this.press : this.disabled; }
  closest(sel) { for (let e = this; e; e = e.parentElement) if (e.matches(sel)) return e; return null; }
}

function fakeDoc() {
  const doc = new EventTarget();
  const win = new EventTarget();
  doc.defaultView = win;
  doc.added = [];
  win.added = [];
  for (const t of [doc, win]) {
    const add = t.addEventListener.bind(t);
    t.addEventListener = (type, fn, opts) => { t.added.push({ type, opts }); add(type, fn, opts); };
  }
  return doc;
}

function ptr(type, { target, pointerType = 'touch', pointerId = 1, x = 0, y = 0 } = {}) {
  const e = new Event(type);
  Object.assign(e, { pointerType, pointerId, clientX: x, clientY: y, isPrimary: true });
  Object.defineProperty(e, 'target', { value: target });
  return e;
}

test('PRESS_TARGETS is a non-empty list of selectors; PRESS_SELECTOR joins them', () => {
  assert.ok(Array.isArray(PRESS_TARGETS) && PRESS_TARGETS.length > 20);
  assert.equal(PRESS_SELECTOR, PRESS_TARGETS.join(', '));
  assert.ok(Object.isFrozen(PRESS_TARGETS));
});

test('idempotent: two calls → one listener set; every listener passive; no import side effect', () => {
  const doc = fakeDoc();
  assert.equal(doc.added.length, 0);
  assert.equal(ensurePressStates(doc), true);
  const n = doc.added.length + doc.defaultView.added.length;
  assert.equal(ensurePressStates(doc), false);
  assert.equal(doc.added.length + doc.defaultView.added.length, n);
  const types = doc.added.map((a) => a.type).sort();
  assert.deepEqual(types, ['lostpointercapture', 'pointercancel', 'pointerdown', 'pointermove', 'pointerup', 'touchstart', 'visibilitychange'].sort());
  assert.deepEqual(doc.defaultView.added.map((a) => a.type), ['blur']);
  for (const a of [...doc.added, ...doc.defaultView.added]) assert.equal(a.opts?.passive, true, a.type);
  assert.equal(ensurePressStates(null), false); // no document (SSR / node) → no-op
});

test('touch press sets data-td-pressed on the nearest target; release / cancel clears it', () => {
  const doc = fakeDoc();
  ensurePressStates(doc);
  const btn = new El('btn', null, { press: true });
  const icon = new El('icon', btn);
  doc.dispatchEvent(ptr('pointerdown', { target: icon }));
  assert.ok(btn.hasAttribute('data-td-pressed'));
  doc.dispatchEvent(ptr('pointerup', { target: icon }));
  assert.ok(!btn.hasAttribute('data-td-pressed'));
  doc.dispatchEvent(ptr('pointerdown', { target: icon, pointerType: 'pen' }));
  assert.ok(btn.hasAttribute('data-td-pressed'));
  doc.dispatchEvent(ptr('pointercancel', { target: icon, pointerType: 'pen' }));
  assert.ok(!btn.hasAttribute('data-td-pressed'));
  doc.dispatchEvent(ptr('pointerdown', { target: icon }));
  doc.dispatchEvent(ptr('lostpointercapture', { target: icon }));
  assert.ok(!btn.hasAttribute('data-td-pressed'));
});

test('mouse never sets it (the native :active covers it); disabled targets and non-targets are skipped', () => {
  const doc = fakeDoc();
  ensurePressStates(doc);
  const btn = new El('btn', null, { press: true });
  doc.dispatchEvent(ptr('pointerdown', { target: btn, pointerType: 'mouse' }));
  assert.ok(!btn.hasAttribute('data-td-pressed'));
  const off = new El('off', null, { press: true, disabled: true });
  doc.dispatchEvent(ptr('pointerdown', { target: off }));
  assert.ok(!off.hasAttribute('data-td-pressed'));
  const text = new El('p');
  doc.dispatchEvent(ptr('pointerdown', { target: text })); // no throw, nothing set
  assert.equal(text.attrs.size, 0);
});

test('moving: under the touch slop keeps it, past it clears; another pointerId does not count', () => {
  const doc = fakeDoc();
  ensurePressStates(doc);
  const btn = new El('btn', null, { press: true });
  doc.dispatchEvent(ptr('pointerdown', { target: btn, x: 100, y: 100 }));
  doc.dispatchEvent(ptr('pointermove', { target: btn, x: 106, y: 100 }));
  assert.ok(btn.hasAttribute('data-td-pressed'), '6 px < 10');
  doc.dispatchEvent(ptr('pointermove', { target: btn, x: 160, y: 100, pointerId: 2 }));
  assert.ok(btn.hasAttribute('data-td-pressed'), 'other pointer');
  doc.dispatchEvent(ptr('pointerup', { target: btn, pointerId: 2 }));
  assert.ok(btn.hasAttribute('data-td-pressed'), 'other pointer up');
  doc.dispatchEvent(ptr('pointermove', { target: btn, x: 112, y: 100 }));
  assert.ok(!btn.hasAttribute('data-td-pressed'), '12 px > 10');
});

test('one holder at a time; blur / visibilitychange clear it', () => {
  const doc = fakeDoc();
  ensurePressStates(doc);
  const a = new El('a', null, { press: true });
  const b = new El('b', null, { press: true });
  doc.dispatchEvent(ptr('pointerdown', { target: a }));
  doc.dispatchEvent(ptr('pointerdown', { target: b, pointerId: 2 }));
  assert.ok(!a.hasAttribute('data-td-pressed'));
  assert.ok(b.hasAttribute('data-td-pressed'));
  doc.defaultView.dispatchEvent(new Event('blur'));
  assert.ok(!b.hasAttribute('data-td-pressed'));
  doc.dispatchEvent(ptr('pointerdown', { target: a }));
  doc.dispatchEvent(new Event('visibilitychange'));
  assert.ok(!a.hasAttribute('data-td-pressed'));
});

// v0.116.0 (ADR 0045 QĐ3): the document-level listener sees `e.target` retargeted to the shadow host; the pressed
// control is the first PRESS_SELECTOR match in composedPath()
function withPath(e, path) {
  Object.defineProperty(e, 'composedPath', { value: () => path });
  return e;
}

test('shadow root: the pressed control comes from composedPath(), not the retargeted e.target', () => {
  const doc = fakeDoc();
  ensurePressStates(doc);
  const outer = new El('outer', null, { press: true }); // a pressable ancestor of the host in the page
  const host = new El('host', outer);
  const btn = new El('btn', null, { press: true }); // inside the shadow root (its closest() stops at the root)
  const icon = new El('icon', btn);
  const shadowRoot = { name: 'shadow-root' }; // no matches()
  const path = [icon, btn, shadowRoot, host, outer, doc, doc.defaultView];
  doc.dispatchEvent(withPath(ptr('pointerdown', { target: host }), path));
  assert.ok(btn.hasAttribute('data-td-pressed'));
  assert.ok(!outer.hasAttribute('data-td-pressed'));
  doc.dispatchEvent(withPath(ptr('pointerup', { target: host }), path));
  assert.ok(!btn.hasAttribute('data-td-pressed'));
});

test('composedPath: a disabled first match is skipped (not replaced by an outer ancestor), like closest()', () => {
  const doc = fakeDoc();
  ensurePressStates(doc);
  const outer = new El('outer', null, { press: true });
  const off = new El('off', outer, { press: true, disabled: true });
  doc.dispatchEvent(withPath(ptr('pointerdown', { target: off }), [off, outer, doc]));
  assert.ok(!off.hasAttribute('data-td-pressed'));
  assert.ok(!outer.hasAttribute('data-td-pressed'));
});

test('pressTargetOf: light-DOM path = closest(); no / empty composedPath falls back to e.target.closest()', () => {
  const btn = new El('btn', null, { press: true });
  const icon = new El('icon', btn);
  assert.equal(pressTargetOf(withPath(ptr('pointerdown', { target: icon }), [icon, btn])), btn);
  assert.equal(pressTargetOf(withPath(ptr('pointerdown', { target: icon }), [])), btn);
  assert.equal(pressTargetOf({ target: icon }), btn);
  assert.equal(pressTargetOf({ target: null }), null);
  assert.equal(pressTargetOf(withPath(ptr('pointerdown', { target: new El('p') }), [new El('p')])), null);
});
