// v0.92.0 (plan v0.92.0-tabs-fit-layout, phần 2) — the host <td-*> prints `name` too, not only the native control inside,
// so a detached / cloned form (template content before a modal attaches) finds `td-dropdown[name="x"]` before upgrade.
// The JS copies the same value onto the host at upgrade (nothing changes after it); attrs can neither override nor duplicate it.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { HAS_PHP, runPhp } from './php.mjs';

if (!HAS_PHP && process.env.TD_REQUIRE_PHP) throw new Error('TD_REQUIRE_PHP=1 but no php >= 8.0 CLI on PATH');
const opts = { skip: !HAS_PHP && 'php >= 8.0 CLI not found' };
const BASE = '/vendor/td/0.92.0';

function one(fn, args, options) {
  const [r] = runPhp([{ fn, args }], options ? { baseUrl: BASE, options } : { baseUrl: BASE });
  assert.equal(r.error, undefined, `${fn}: ${r.message}`);
  return r.out;
}
const hostOf = (out, tag) => new RegExp(`<${tag}\\b[^>]*>`).exec(out)[0];
const names = (tag) => (tag.match(/\sname="/g) || []).length;
const OPTS = { a: 'A', b: 'B' };
const TREE = [{ value: 'a', label: 'A', children: [{ value: 'a1', label: 'A1' }] }, { value: 'b', label: 'B' }];

describe('php/td.php — host name on <td-*> (v0.92.0)', opts, () => {
  for (const element of [false, true]) {
    const mode = element ? 'element mode' : 'plain mode';
    test(`td_dropdown: name on the host and on the select (${mode})`, () => {
      const out = one('td_dropdown', ['x', OPTS, 'a', { id: 'd', element }]);
      assert.match(hostOf(out, 'td-dropdown'), /^<td-dropdown [^>]*\bname="x"/);
      assert.ok(out.includes('<select ') && out.includes(' name="x"'), out);
      assert.equal((out.match(/\sname="x"/g) || []).length, 2, out);
    });

    test(`td_tree_select: name on the host and on the select, multiple keeps the [] name (${mode})`, () => {
      const out = one('td_tree_select', ['t', TREE, 'a', { id: 't', element }]);
      assert.match(hostOf(out, 'td-tree-select'), /\bname="t"/);
      const m = one('td_tree_select', ['t[]', TREE, ['a1'], { id: 'm', multiple: true, element }]);
      assert.match(hostOf(m, 'td-tree-select'), /\bname="t\[\]"/);
    });
  }

  test('td_multiselect: element mode prints name on <td-chip-input>; plain mode has no td-* host (div wrapper)', () => {
    const el = one('td_multiselect', ['r[]', OPTS, ['a'], { id: 'r', element: true }]);
    assert.match(hostOf(el, 'td-chip-input'), /\bname="r\[\]"/);
    const plain = one('td_multiselect', ['r[]', OPTS, ['a'], { id: 'r' }]);
    assert.ok(!plain.includes('<td-chip-input'), plain);
    assert.ok(!/<div class="td-multiselect"[^>]* name=/.test(plain), plain);
  });

  test('name is escaped, empty name prints nothing, attrs can neither override nor duplicate it (any case)', () => {
    const q = one('td_dropdown', ['x"y', OPTS, 'a', { id: 'd', element: true }]);
    assert.ok(hostOf(q, 'td-dropdown').includes('name="x&quot;y"'), q);
    const e = one('td_dropdown', ['', OPTS, 'a', { id: 'd', element: true }]);
    assert.equal(names(hostOf(e, 'td-dropdown')), 0, e);
    for (const [fn, args, tag] of [
      ['td_dropdown', ['real', OPTS, 'a', { id: 'd', element: true, attrs: { name: 'evil', NAME: 'evil2' } }], 'td-dropdown'],
      ['td_tree_select', ['real', TREE, null, { id: 't', element: true, attrs: { name: 'evil', Name: 'evil2' } }], 'td-tree-select'],
      ['td_multiselect', ['real[]', OPTS, [], { id: 'r', element: true, attrs: { name: 'evil', NAME: 'evil2' } }], 'td-chip-input'],
    ]) {
      const out = one(fn, args);
      const host = hostOf(out, tag);
      assert.equal(names(host), 1, host);
      assert.ok(host.includes('name="real'), host);
      assert.ok(!out.includes('evil'), out);
    }
  });
});
