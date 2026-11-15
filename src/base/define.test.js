// v0.116.0 (ADR 0045 QĐ1): defineElement() defines once on the global registry; suppressAutoDefine() turns it off
// for that module instance (one-way). Each test imports a fresh module instance (query string) with its own registry.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

let n = 0;
const fresh = () => import(`./define.js?case=${++n}`);

function mockRegistry() {
  const map = new Map();
  const calls = [];
  return {
    calls,
    get: (name) => map.get(name),
    define(name, cls) {
      if (map.has(name)) throw new Error(`already defined: ${name}`);
      calls.push(name);
      map.set(name, cls);
    },
  };
}

function withRegistry(reg, fn) {
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'customElements');
  const prev = globalThis.customElements;
  if (reg === undefined) delete globalThis.customElements;
  else globalThis.customElements = reg;
  return Promise.resolve().then(fn).finally(() => {
    if (had) globalThis.customElements = prev;
    else delete globalThis.customElements;
  });
}

test('defineElement defines once; a second call (or an existing definition) is a no-op', () => withRegistry(mockRegistry(), async () => {
  const { defineElement } = await fresh();
  class A {}
  class B {}
  defineElement('td-x', A);
  defineElement('td-x', B); // already defined → kept, no throw
  assert.deepEqual(globalThis.customElements.calls, ['td-x']);
  assert.equal(globalThis.customElements.get('td-x'), A);
}));

test('suppressAutoDefine: nothing is defined afterwards (one-way, per module instance)', () => withRegistry(mockRegistry(), async () => {
  const { defineElement, suppressAutoDefine } = await fresh();
  defineElement('td-before', class {});
  suppressAutoDefine();
  defineElement('td-after', class {});
  suppressAutoDefine(); // idempotent
  defineElement('td-after-2', class {});
  assert.deepEqual(globalThis.customElements.calls, ['td-before']);
  // another module instance is not affected
  const other = await fresh();
  other.defineElement('td-other', class {});
  assert.deepEqual(globalThis.customElements.calls, ['td-before', 'td-other']);
}));

test('no customElements (SSR / plain node) → no throw', () => withRegistry(undefined, async () => {
  const { defineElement } = await fresh();
  assert.doesNotThrow(() => defineElement('td-x', class {}));
}));

test('define.js and suppress.js are leaf modules; the three embed components use defineElement', async () => {
  const define = await readFile(new URL('./define.js', import.meta.url), 'utf8');
  assert.ok(!/^\s*import\b/m.test(define), 'define.js imports nothing');
  const suppress = await readFile(new URL('../embed/suppress.js', import.meta.url), 'utf8');
  const imports = [...suppress.matchAll(/^\s*import\b.*$/gm)].map((m) => m[0].trim());
  assert.deepEqual(imports, ["import { suppressAutoDefine } from '../base/define.js';"]);
  for (const [file, name] of [['../form/td-button.js', 'td-button'], ['../form/td-input-field.js', 'td-input-field'], ['../feedback/td-alert.js', 'td-alert']]) {
    const src = await readFile(new URL(file, import.meta.url), 'utf8');
    assert.ok(!/customElements\s*\.\s*define\s*\(/.test(src), `${file}: no direct customElements.define`);
    assert.match(src, new RegExp(`defineElement\\('${name}', `), file);
  }
});

test('suppress.js calls suppressAutoDefine on import', async () => {
  const src = await readFile(new URL('../embed/suppress.js', import.meta.url), 'utf8');
  assert.match(src, /^suppressAutoDefine\(\);$/m);
});
