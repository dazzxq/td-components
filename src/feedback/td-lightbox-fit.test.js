// v0.114.0 (plan docs/internal/plans/v0.114.0-lightbox-fill-sheet.md QĐ1 / QĐ4 / QĐ5): option + item normalizers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeFit, normalizeSheet, normalizeItem } from './td-lightbox.js';

function withLocation(href, fn) {
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'location');
  const prev = globalThis.location;
  Object.defineProperty(globalThis, 'location', { value: new URL(href), configurable: true, writable: true });
  try { fn(); } finally {
    if (had) Object.defineProperty(globalThis, 'location', { value: prev, configurable: true, writable: true });
    else delete globalThis.location;
  }
}

test("normalizeFit: only 'fill' (any case, trimmed) is fill; everything else is contain", () => {
  for (const v of ['fill', 'FILL', ' Fill ', '\tfill\n']) assert.equal(normalizeFit(v), 'fill', JSON.stringify(v));
  for (const v of [undefined, null, '', 'contain', 'cover', 'fil', 'fill-x', 1, true, {}, ['fill']]) {
    assert.equal(normalizeFit(v), 'contain', String(v));
  }
});

test("normalizeSheet: only 'stack' (any case, trimmed) is stack; everything else is overlay", () => {
  for (const v of ['stack', 'STACK', ' Stack ']) assert.equal(normalizeSheet(v), 'stack', JSON.stringify(v));
  for (const v of [undefined, null, '', 'overlay', 'stacked', 0, false, {}]) assert.equal(normalizeSheet(v), 'overlay', String(v));
});

test('normalizeItem keeps width / height only as positive finite numbers (numeric strings accepted)', () => {
  withLocation('https://site.example/', () => {
    const allow = () => true;
    const dims = (width, height) => {
      const it = normalizeItem({ src: 'https://cdn.example/a.jpg', width, height }, allow);
      return [it.width, it.height];
    };
    assert.deepEqual(dims(1200, 800), [1200, 800]);
    assert.deepEqual(dims('1200', ' 800 '), [1200, 800]);
    assert.deepEqual(dims(0.5, 2.25), [0.5, 2.25]);
    for (const bad of [0, -1, '-5', NaN, Infinity, -Infinity, 'Infinity', '', '  ', 'abc', '12px', null, undefined, true, {}, []]) {
      const [w, h] = dims(bad, bad);
      assert.equal(w, undefined, `width ${String(bad)}`);
      assert.equal(h, undefined, `height ${String(bad)}`);
    }
    // each one on its own; an item without them has no such keys (unchanged shape)
    assert.deepEqual(dims(640, 'x'), [640, undefined]);
    const plain = normalizeItem('https://cdn.example/a.jpg', allow);
    assert.equal('width' in plain || 'height' in plain, false);
  });
});
