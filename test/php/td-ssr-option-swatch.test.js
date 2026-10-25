// v0.82.0 (plan v0.82.0-option-swatch) — PHP side: a `swatch` on a td_dropdown / td_multiselect option prints
// `data-swatch="…"` on the <option> (Td::safeColor gate, escaped); an invalid one is not printed.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { HAS_PHP, runPhp } from './php.mjs';

if (!HAS_PHP && process.env.TD_REQUIRE_PHP) throw new Error('TD_REQUIRE_PHP=1 but no php >= 8.0 CLI on PATH');
const opts = { skip: !HAS_PHP && 'php >= 8.0 CLI not found' };
const BASE = '/vendor/td/0.82.0';

function one(fn, args) {
  const [r] = runPhp([{ fn, args }], { baseUrl: BASE });
  assert.equal(r.error, undefined, `${fn}: ${r.message}`);
  return r.out;
}

const BAD = ['red;x', 'url(x)', '#12', 'x'.repeat(65), '" onfocus="x', 5, null];

describe('option swatch (PHP)', opts, () => {
  test('td_dropdown prints a valid swatch', () => {
    const html = one('td_dropdown', ['color', [
      { value: 'r', label: 'Đỏ', swatch: '#ff0000' },
      { value: 'b', label: 'Xanh', swatch: ' rgb(0, 0, 255) ' },
      { value: 'n', label: 'Không màu' },
    ], 'r']);
    assert.match(html, /<option value="r" selected data-swatch="#ff0000">Đỏ<\/option>/);
    assert.match(html, /<option value="b" data-swatch="rgb\(0, 0, 255\)">Xanh<\/option>/);
    assert.match(html, /<option value="n">Không màu<\/option>/);
  });

  test('td_dropdown drops an invalid swatch (never printed, never escaped into an attribute)', () => {
    for (const bad of BAD) {
      const html = one('td_dropdown', ['color', [{ value: 'r', label: 'Đỏ', swatch: bad }]]);
      assert.ok(!html.includes('data-swatch'), `printed for ${JSON.stringify(bad)}`);
      assert.match(html, /<option value="r">Đỏ<\/option>/);
    }
  });

  test('td_dropdown without any swatch is unchanged (plain map)', () => {
    const html = one('td_dropdown', ['c', { a: 'A', b: 'B' }]);
    assert.ok(!html.includes('data-swatch'));
  });

  test('td_multiselect prints a valid swatch, drops an invalid one', () => {
    const html = one('td_multiselect', ['colors[]', [
      { value: 'r', label: 'Đỏ', swatch: '#f00' },
      { value: 'g', label: 'Xanh lá', swatch: 'green' },
      { value: 'x', label: 'Xấu', swatch: 'url(x)' },
    ], ['r']]);
    assert.match(html, /<option value="r" selected data-swatch="#f00">Đỏ<\/option>/);
    assert.match(html, /<option value="g" data-swatch="green">Xanh lá<\/option>/);
    assert.match(html, /<option value="x">Xấu<\/option>/);
  });

  test('td_multiselect: a swatch inside an optgroup leaf', () => {
    const html = one('td_multiselect', ['c[]', [
      { label: 'Nhóm', options: [{ value: 'r', label: 'Đỏ', swatch: '#ff0000' }] },
    ]]);
    assert.match(html, /<option value="r" data-swatch="#ff0000">Đỏ<\/option>/);
  });
});
