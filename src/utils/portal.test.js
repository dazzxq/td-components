// v0.121.0 (plan v0.121.0-portal-root QĐ1): resolvePortalRoot(host) — the connected `portalRoot` property wins (an
// Element or a ShadowRoot); an invalid / disconnected one is ignored with ONE warning per host + value; then
// `portal="local"` inside a ShadowRoot; else document.body. Plain stand-ins for Element / ShadowRoot / document.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolvePortalRoot } from './portal.js';

class FakeElement { constructor(connected = true) { this.isConnected = connected; } }
class FakeShadowRoot { constructor(connected = true) { this.isConnected = connected; this.host = new FakeElement(); } }
const body = new FakeElement();
const saved = {};
let warns;
const origWarn = console.warn;

beforeEach(() => {
  for (const k of ['Element', 'ShadowRoot', 'document']) saved[k] = Object.getOwnPropertyDescriptor(globalThis, k);
  globalThis.Element = FakeElement;
  globalThis.ShadowRoot = FakeShadowRoot;
  globalThis.document = { body };
  warns = [];
  console.warn = (...a) => { warns.push(String(a[0])); };
});
afterEach(() => {
  console.warn = origWarn;
  for (const [k, d] of Object.entries(saved)) {
    if (d) Object.defineProperty(globalThis, k, d);
    else delete globalThis[k];
  }
});

/** a dropdown-like host: attributes, its root node and an optional portalRoot property */
function host({ portal = null, root = globalThis.document, portalRoot } = {}) {
  const h = new FakeElement();
  h.localName = 'td-dropdown';
  h.getAttribute = (n) => (n === 'portal' ? portal : null);
  h.getRootNode = () => root;
  if (portalRoot !== undefined) h.portalRoot = portalRoot;
  return h;
}

test('no attribute, no property → document.body', () => {
  assert.equal(resolvePortalRoot(host()), body);
  assert.equal(warns.length, 0);
});

test('portal="local" inside a ShadowRoot → that root; in the document → body', () => {
  const sr = new FakeShadowRoot();
  assert.equal(resolvePortalRoot(host({ portal: 'local', root: sr })), sr);
  assert.equal(resolvePortalRoot(host({ portal: 'local' })), body);
});

test('other values of portal → body (even inside a ShadowRoot)', () => {
  const sr = new FakeShadowRoot();
  for (const v of ['', 'body', 'LOCAL', 'shadow']) assert.equal(resolvePortalRoot(host({ portal: v, root: sr })), body, v);
});

test('the property wins over the attribute: a connected Element or ShadowRoot', () => {
  const sr = new FakeShadowRoot();
  const el = new FakeElement();
  const other = new FakeShadowRoot();
  assert.equal(resolvePortalRoot(host({ portal: 'local', root: sr, portalRoot: el })), el);
  assert.equal(resolvePortalRoot(host({ portal: 'local', root: sr, portalRoot: other })), other);
  assert.equal(resolvePortalRoot(host({ portalRoot: el })), el);
  assert.equal(warns.length, 0);
});

test('null / undefined property → the attribute / body, no warning', () => {
  const sr = new FakeShadowRoot();
  assert.equal(resolvePortalRoot(host({ portal: 'local', root: sr, portalRoot: null })), sr);
  assert.equal(resolvePortalRoot(host({ portalRoot: null })), body);
  assert.equal(warns.length, 0);
});

test('disconnected / non-root values are ignored (fall back) with ONE warning per host and value', () => {
  const sr = new FakeShadowRoot();
  const gone = new FakeElement(false);
  const h = host({ portal: 'local', root: sr, portalRoot: gone });
  assert.equal(resolvePortalRoot(h), sr);
  assert.equal(resolvePortalRoot(h), sr);
  assert.equal(warns.length, 1);
  assert.match(warns[0], /portalRoot/);
  const text = { nodeType: 3, isConnected: true }; // a Text node (not an Element / ShadowRoot)
  h.portalRoot = text;
  assert.equal(resolvePortalRoot(h), sr);
  assert.equal(warns.length, 2);
  for (const v of [{ nodeType: 9, isConnected: true }, 'body', new FakeShadowRoot(false)]) {
    assert.equal(resolvePortalRoot(host({ portalRoot: v })), body);
  }
  assert.equal(warns.length, 5);
});
