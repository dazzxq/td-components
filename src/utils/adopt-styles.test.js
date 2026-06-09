import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adoptStyles } from './adopt-styles.js';

// These globals do not exist in node by default. Each test that needs a fake DOM
// installs them on globalThis and restores afterward so tests stay isolated and the
// node no-op path can be asserted with nothing installed.

test('node/SSR: returns false and never throws when document is undefined', () => {
  assert.equal(typeof document, 'undefined');
  let result;
  assert.doesNotThrow(() => { result = adoptStyles('.x{color:red}', 'td-x'); });
  assert.equal(result, false);
});

test('unsupported browser: document present but CSSStyleSheet absent → false', (t) => {
  globalThis.document = { adoptedStyleSheets: [] };
  // CSSStyleSheet intentionally NOT defined.
  t.after(() => { delete globalThis.document; });
  assert.equal(typeof CSSStyleSheet, 'undefined');
  assert.equal(adoptStyles('.x{color:red}', 'td-unsupported'), false);
});

test('unsupported browser: adoptedStyleSheets not on Document.prototype → false', (t) => {
  globalThis.document = { adoptedStyleSheets: [] };
  globalThis.CSSStyleSheet = class {};
  globalThis.Document = class {}; // no adoptedStyleSheets on the prototype
  t.after(() => {
    delete globalThis.document;
    delete globalThis.CSSStyleSheet;
    delete globalThis.Document;
  });
  assert.equal(adoptStyles('.x{color:red}', 'td-noproto'), false);
});

test('supported env: adopts once, idempotent per key, never clobbers the array', (t) => {
  const replaced = [];
  globalThis.CSSStyleSheet = class {
    constructor() { this.css = null; }
    replaceSync(css) { this.css = css; replaced.push(css); }
  };
  // adoptedStyleSheets must be detectable on Document.prototype.
  globalThis.Document = class {};
  Object.defineProperty(globalThis.Document.prototype, 'adoptedStyleSheets', {
    value: [], configurable: true,
  });
  // Seed the document with a pre-existing host sheet to prove we never clobber it.
  const hostSheet = { host: true };
  globalThis.document = { adoptedStyleSheets: [hostSheet] };
  t.after(() => {
    delete globalThis.document;
    delete globalThis.CSSStyleSheet;
    delete globalThis.Document;
  });

  // First adoption for a key → true, appends one sheet, replaceSync called once.
  assert.equal(adoptStyles('.a{color:red}', 'td-a'), true);
  assert.equal(globalThis.document.adoptedStyleSheets.length, 2);
  assert.equal(globalThis.document.adoptedStyleSheets[0], hostSheet); // host preserved
  assert.equal(replaced.length, 1);
  assert.equal(replaced[0], '.a{color:red}');

  // Second call SAME key → idempotent: true, no new sheet, no new replaceSync.
  assert.equal(adoptStyles('.a{color:red}', 'td-a'), true);
  assert.equal(globalThis.document.adoptedStyleSheets.length, 2);
  assert.equal(replaced.length, 1);

  // Different key → adopts a second component sheet (host + a + b = 3).
  assert.equal(adoptStyles('.b{color:blue}', 'td-b'), true);
  assert.equal(globalThis.document.adoptedStyleSheets.length, 3);
  assert.equal(globalThis.document.adoptedStyleSheets[0], hostSheet);
  assert.equal(replaced.length, 2);

  // The per-document registry is keyed and lives on the document.
  assert.ok(globalThis.document.__tdAdopted instanceof Map);
  assert.deepEqual([...globalThis.document.__tdAdopted.keys()].sort(), ['td-a', 'td-b']);
});

test('never throws: hostile env (replaceSync throws) → returns false', (t) => {
  globalThis.CSSStyleSheet = class {
    replaceSync() { throw new Error('bad CSS'); }
  };
  globalThis.Document = class {};
  Object.defineProperty(globalThis.Document.prototype, 'adoptedStyleSheets', {
    value: [], configurable: true,
  });
  globalThis.document = { adoptedStyleSheets: [] };
  t.after(() => {
    delete globalThis.document;
    delete globalThis.CSSStyleSheet;
    delete globalThis.Document;
  });
  let result;
  assert.doesNotThrow(() => { result = adoptStyles('.x{color:red}', 'td-hostile'); });
  assert.equal(result, false);
});

test('never throws: document present but Document constructor absent → false', (t) => {
  globalThis.document = { adoptedStyleSheets: [] };
  globalThis.CSSStyleSheet = class {};
  // Document intentionally NOT defined — typeof Document === 'undefined'.
  t.after(() => {
    delete globalThis.document;
    delete globalThis.CSSStyleSheet;
  });
  let result;
  assert.doesNotThrow(() => { result = adoptStyles('.x{color:red}', 'td-nodoc'); });
  assert.equal(result, false);
});
