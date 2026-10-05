// v0.29.0 (plan v0.29.0-tree M8) — PHP side of td_tree_select():
//   - a native <select> that works without JS: options in PREORDER, indent = NBSP at the start of the text (2 per level,
//     never "—" in the label) + data-level + data-label (clean label) + data-description;
//   - locks: every locked option carries data-locked; single with a locked selection = that option selected AND enabled,
//     every other option disabled data-native-only (no empty option); multiple: locked selected = disabled selected +
//     one hidden input.td-tree-select__locked each (submitted exactly once), and the select loses `required`;
//     a disabled control disables the hidden inputs too; cascade → parent options disabled data-native-only;
//   - placeholder: single → a first value="" option + allow-clear (not with a locked selection); multiple → text only;
//   - invalid value ('' / null / array / bool) → the whole branch dropped + ONE E_USER_WARNING; duplicate → later
//     dropped; depth ≤ 16; disable_subtree; escaping; owned names reserved in attrs;
//   - element mode (per call / Td::configure ssr_elements): data-td-ssr="tree-select@1", no `size`, value-label(s).
// Shared fixtures: test/ssr/tree-select.fixtures.json (also consumed by the SSR browser test through
// test/ssr/fixtures/tree-select.html — this test fails when it is stale: `node test/ssr/build-tree-select-fixture.mjs`).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { HAS_PHP, runPhp, PHP_BIN, ROOT } from './php.mjs';
import { TREE_SELECT_FIXTURES, TREE_SELECT_FIXTURE_FILE, renderTreeSelectFixture } from '../ssr/ssr.mjs';
// Wall-clock budgets guard against super-linear blow-ups, not micro-speed: on a shared host (CI, several suites at
// once) they get 20× slack, which still catches quadratic behaviour; TD_PERF_STRICT=1 enforces the raw budget.
const PERF_SLACK = process.env.TD_PERF_STRICT ? 1 : 20;

if (!HAS_PHP && process.env.TD_REQUIRE_PHP) throw new Error('TD_REQUIRE_PHP=1 but no php >= 8.0 CLI on PATH');
const opts = { skip: !HAS_PHP && 'php >= 8.0 CLI not found' };
const BASE = '/vendor/td/0.29.0';
const NB = ' ';

/** htmlspecialchars(ENT_QUOTES | ENT_SUBSTITUTE) as Td::e() prints it. */
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

/** One call in its own php process (generated ids start at 1 every time). */
function one(fn, args, options) {
  const [r] = runPhp([{ fn, args }], options ? { baseUrl: BASE, options } : { baseUrl: BASE });
  assert.equal(r.error, undefined, `${fn}: ${r.message}`);
  return r.out;
}

/** Run td_tree_select with arguments as JSON and capture stdout + stderr (warnings) — the harness forbids stderr. */
function withWarnings(args) {
  const code = `require ${JSON.stringify(join(ROOT, 'php/td.php'))}; TdComponents\\Td::configure('/', ${JSON.stringify(ROOT)});`
    + ` $a = json_decode(${JSON.stringify(JSON.stringify(args))}, true); echo td_tree_select(...$a);`;
  const r = spawnSync(PHP_BIN, ['-d', 'display_errors=stderr', '-d', 'log_errors=0', '-d', 'error_reporting=E_ALL', '-r', code], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return { out: r.stdout, warnings: (r.stderr.match(/Warning: +td_tree_select:/g) || []).length, stderr: r.stderr };
}

const SMALL = [{ value: 'a', label: 'A', children: [{ value: 'a1', label: 'A1', description: 'D' }] }, { value: 'b', label: 'B' }];
const opt = (v, level, label, extra = '') => `<option value="${v}" data-level="${level}" data-label="${label}"${extra}>${NB.repeat(2 * level)}${label}</option>`;

describe('php/td.php — td_tree_select (v0.29.0 M8)', opts, () => {
  test('native mode (default): <td-tree-select> host (no marker) + label + preorder select, NBSP indent, data-level / data-label', () => {
    assert.equal(one('td_tree_select', ['t', SMALL, 'a1', { id: 't', label: 'Nhãn' }]),
      '<td-tree-select id="t" label="Nhãn"><label class="td-field__label" for="t-select">Nhãn</label>'
      + '<select class="td-tree-select__native" id="t-select" name="t">'
      + opt('a', 0, 'A') + opt('a1', 1, 'A1', ' data-description="D" selected') + opt('b', 0, 'B')
      + '</select></td-tree-select>');
    // generated id, no label, int value selected
    const out = one('td_tree_select', ['cat', [{ value: 7, label: 'Bảy' }], 7, {}]);
    assert.ok(out.startsWith('<td-tree-select id="td-cat-1"><select class="td-tree-select__native" id="td-cat-1-select" name="cat">'), out);
    assert.ok(out.includes(opt('7', 0, 'Bảy', ' selected')), out);
    assert.ok(!out.includes('—'), 'never an em dash in the label');
  });

  test('placeholder: single → first value="" option + allow-clear; required → host + select + label star', () => {
    const out = one('td_tree_select', ['t', SMALL, null, { id: 't', label: 'L', placeholder: '— Chọn —', required: true }]);
    assert.equal(out, '<td-tree-select id="t" label="L" placeholder="— Chọn —" allow-clear required>'
      + '<label class="td-field__label" for="t-select">L<span class="td-field__required" aria-hidden="true"> *</span></label>'
      + '<select class="td-tree-select__native" id="t-select" name="t" required><option value="">— Chọn —</option>'
      + opt('a', 0, 'A') + opt('a1', 1, 'A1', ' data-description="D"') + opt('b', 0, 'B') + '</select></td-tree-select>');
  });

  test('multiple (native): size rows (default 8), every selected value, placeholder = text only (no empty option)', () => {
    const out = one('td_tree_select', ['m[]', SMALL, ['b', 'a1', ''], { id: 'm', multiple: true, placeholder: 'Chọn' }]);
    assert.equal(out, '<td-tree-select id="m" placeholder="Chọn" multiple>'
      + '<select class="td-tree-select__native" id="m-select" name="m[]" multiple size="8">'
      + opt('a', 0, 'A') + opt('a1', 1, 'A1', ' data-description="D" selected') + opt('b', 0, 'B', ' selected') + '</select></td-tree-select>');
    assert.ok(one('td_tree_select', ['m[]', SMALL, [], { multiple: true, size: 3 }]).includes(' multiple size="3">'));
  });

  test('cascade: parents disabled data-native-only, parent values dropped from the selection', () => {
    const out = one('td_tree_select', ['p[]', SMALL, ['a', 'a1'], { id: 'p', multiple: true, cascade: true }]);
    assert.ok(out.startsWith('<td-tree-select id="p" multiple cascade>'), out);
    assert.ok(out.includes(opt('a', 0, 'A', ' disabled data-native-only')), out);
    assert.ok(out.includes(opt('a1', 1, 'A1', ' data-description="D" selected')), out);
    assert.ok(out.includes(opt('b', 0, 'B')), out);
    // cascade without multiple is ignored
    assert.ok(!one('td_tree_select', ['p', SMALL, null, { cascade: true }]).includes('cascade'));
  });

  test('locks: data-locked on every locked option (disabled + disable_subtree inherit down)', () => {
    const tree = [{ value: 'a', label: 'A', disabled: true, children: [{ value: 'a1', label: 'A1' }] }, { value: 'b', label: 'B', children: [{ value: 'b1', label: 'B1' }] }];
    const out = one('td_tree_select', ['t', tree, null, { id: 't', disable_subtree: ['b'] }]);
    assert.ok(out.includes(opt('a', 0, 'A', ' data-locked disabled')), out);
    assert.ok(out.includes(opt('a1', 1, 'A1', ' data-locked disabled')), out);
    assert.ok(out.includes(opt('b', 0, 'B', ' data-locked disabled')), out);
    assert.ok(out.includes(opt('b1', 1, 'B1', ' data-locked disabled')), out);
  });

  test('single with a LOCKED selection: that option selected + enabled, every other disabled data-native-only, no empty option, no allow-clear', () => {
    const tree = [{ value: 'a', label: 'A', disabled: true }, { value: 'b', label: 'B' }, { value: 'c', label: 'C', disabled: true }];
    const out = one('td_tree_select', ['t', tree, 'a', { id: 't', placeholder: 'P', required: true }]);
    assert.equal(out, '<td-tree-select id="t" placeholder="P" required>'
      + '<select class="td-tree-select__native" id="t-select" name="t" required>'
      + opt('a', 0, 'A', ' data-locked selected') + opt('b', 0, 'B', ' disabled data-native-only') + opt('c', 0, 'C', ' data-locked disabled')
      + '</select></td-tree-select>');
  });

  test('multiple with a LOCKED selection: disabled selected + one hidden input each, no `required` on the select (host keeps it)', () => {
    const tree = [{ value: 'a', label: 'A', disabled: true }, { value: 'b', label: 'B' }, { value: 'c', label: 'C', disabled: true }];
    const out = one('td_tree_select', ['p[]', tree, ['a', 'b', 'c'], { id: 'p', multiple: true, required: true }]);
    assert.equal(out, '<td-tree-select id="p" multiple required>'
      + '<select class="td-tree-select__native" id="p-select" name="p[]" multiple size="8">'
      + opt('a', 0, 'A', ' data-locked selected disabled') + opt('b', 0, 'B', ' selected') + opt('c', 0, 'C', ' data-locked selected disabled')
      + '</select><input type="hidden" class="td-tree-select__locked" name="p[]" value="a">'
      + '<input type="hidden" class="td-tree-select__locked" name="p[]" value="c"></td-tree-select>');
    // the whole control disabled → the hidden inputs too (nothing is submitted)
    const dis = one('td_tree_select', ['p[]', tree, ['a'], { id: 'p', multiple: true, disabled: true }]);
    assert.ok(dis.includes(' multiple size="8" disabled>'), dis);
    assert.ok(dis.includes('<input type="hidden" class="td-tree-select__locked" name="p[]" value="a" disabled>'), dis);
    // no locked selection → required stays on the select
    assert.ok(one('td_tree_select', ['p[]', tree, ['b'], { multiple: true, required: true }]).includes(' multiple size="8" required>'));
  });

  test('element mode: marker, no size, value-label / value-labels, display', () => {
    assert.equal(one('td_tree_select', ['t', SMALL, 'a1', { id: 't', element: true, display: 'path' }]),
      '<td-tree-select data-td-ssr="tree-select@1" id="t" display="path" value-label="A1">'
      + '<select class="td-tree-select__native" id="t-select" name="t">'
      + opt('a', 0, 'A') + opt('a1', 1, 'A1', ' data-description="D" selected') + opt('b', 0, 'B') + '</select></td-tree-select>');
    const m = one('td_tree_select', ['m[]', SMALL, ['b', 'a1'], { id: 'm', element: true, multiple: true }]);
    assert.ok(m.startsWith(`<td-tree-select data-td-ssr="tree-select@1" id="m" multiple value-labels="${esc('{"a1":"A1","b":"B"}')}">`), m);
    assert.ok(m.includes('<select class="td-tree-select__native" id="m-select" name="m[]" multiple>'), m);
  });

  test('mode: global ssr_elements off/on × per call absent/false/true', () => {
    for (const mode of TREE_SELECT_FIXTURES.modes) {
      const args = mode.call === 'absent' ? ['c', SMALL, null, {}] : ['c', SMALL, null, { element: mode.call }];
      const out = one('td_tree_select', args, mode.global ? { ssr_elements: true } : undefined);
      assert.equal(out.startsWith('<td-tree-select data-td-ssr="tree-select@1"'), mode.element, `${JSON.stringify(mode)}: ${out.slice(0, 60)}`);
    }
  });

  test('invalid value / shape → branch dropped + ONE warning; duplicate → later dropped; depth ≤ 16', () => {
    const r = withWarnings(['t', [
      { value: '', label: 'empty', children: [{ value: 'c', label: 'C' }] },
      { value: null, label: 'null' }, { value: ['x'], label: 'arr' }, { value: true, label: 'bool' }, 'scalar',
      { value: 'ok', label: 'OK', children: [{ value: 'ok', label: 'dup' }] },
    ], null, { id: 't' }]);
    assert.equal(r.warnings, 1, r.stderr);
    assert.ok(/E_USER_WARNING|Warning/.test(r.stderr), r.stderr);
    assert.ok(!r.out.includes('empty') && !r.out.includes('value="c"') && !r.out.includes('dup'), r.out);
    assert.ok(r.out.includes(opt('ok', 0, 'OK')), r.out);
    // depth
    let deep = { value: 'd0', label: 'd0' };
    const root = deep;
    for (let i = 1; i < 20; i++) { const c = { value: `d${i}`, label: `d${i}` }; deep.children = [c]; deep = c; }
    const d = withWarnings(['t', [root], null, { id: 't' }]);
    assert.equal(d.warnings, 1, d.stderr);
    assert.ok(d.out.includes('value="d15"') && !d.out.includes('value="d16"'), d.out);
    // a valid tree never warns
    assert.equal(withWarnings(['t', SMALL, null, {}]).warnings, 0);
  });

  test('review S-01: linear walk — 8× the nodes costs ≈ 8× the time (no per-node array_keys), 40 000 nodes < 2 s', () => {
    const code = `require ${JSON.stringify(join(ROOT, 'php/td.php'))}; TdComponents\\Td::configure('/', ${JSON.stringify(ROOT)});`
      + ' $mk = function (int $n): array { $t = []; for ($i = 0; $i < $n; $i++) { $t[] = ["value" => "v$i", "label" => "L$i"]; } return $t; };'
      + ' $time = function (array $t): float { $best = INF; for ($k = 0; $k < 3; $k++) { $s = microtime(true); td_tree_select("x", $t); $best = min($best, microtime(true) - $s); } return $best; };'
      + ' $a = $time($mk(5000)); $b = $time($mk(40000)); echo json_encode([$a, $b]);';
    const r = spawnSync(PHP_BIN, ['-d', 'display_errors=stderr', '-r', code], { encoding: 'utf8', timeout: 120000 });
    assert.equal(r.status, 0, r.stderr);
    const [small, big] = JSON.parse(r.stdout);
    assert.ok(big < 2 * PERF_SLACK, `40k nodes took ${big.toFixed(2)} s`);
    // linear ≈ 8×, quadratic ≈ 64×: 25× leaves room for noise without hiding a quadratic walk
    assert.ok(big / small < 25, `5k → 40k: ${(big / small).toFixed(1)}× (${small.toFixed(3)} s → ${big.toFixed(3)} s)`);
  });

  test('$selected filtered like the values ("" / bool / unknown dropped); single keeps one', () => {
    const out = one('td_tree_select', ['t', SMALL, ['', 'zzz', 'b', 'a'], { id: 't' }]);
    assert.equal((out.match(/ selected/g) || []).length, 1, out);
    assert.ok(out.includes(opt('b', 0, 'B', ' selected')), out);
  });

  test('reservation: owned names in attrs never print, data-td-* blocked, unsafe names dropped; aria-label names the select', () => {
    const out = one('td_tree_select', ['t', SMALL, null, { id: 't', element: true, attrs: { 'data-x': '1', onclick: 'x()', Name: 'evil',
      value: 'a', multiple: '', 'data-td-ssr': 'x', 'aria-label': 'Tên', title: 'Gợi ý', 'allow-clear': '' } }]);
    const host = /<td-tree-select[^>]*>/.exec(out)[0];
    assert.equal(host, '<td-tree-select data-td-ssr="tree-select@1" id="t" data-x="1" title="Gợi ý">');
    assert.ok(out.includes('<select class="td-tree-select__native" id="t-select" name="t" aria-label="Tên">'), out);
    assert.ok(!out.includes('onclick') && !out.includes('evil'), out);
    assert.equal((out.match(/\sname=/g) || []).length, 1);
  });

  test('escaping: name, ids, labels, values, descriptions, value-label(s)', () => {
    const c = TREE_SELECT_FIXTURES.cases.find((x) => x.id === 's-xss');
    const out = one('td_tree_select', [...c.args.slice(0, 3), { ...c.args[3], element: true }]);
    assert.ok(out.includes(`name="${esc('x"y')}"`), out);
    assert.ok(out.includes(`label="${esc('<i>nhãn</i>')}"`), out);
    assert.ok(out.includes(`data-label="${esc('<img src=x onerror=alert(1)>')}"`), out);
    assert.ok(out.includes(`>${esc('<img src=x onerror=alert(1)>')}</option>`), out);
    assert.ok(out.includes(`data-description="${esc('"><script>d</script>')}"`), out);
    assert.ok(out.includes(`value-label="${esc('"q"')}"`), out);
    assert.ok(!/<img|<script|<b>|<i>/i.test(out), out);
  });

  test('test/ssr/fixtures/tree-select.html (browser fixture) is up to date', () => {
    assert.equal(readFileSync(TREE_SELECT_FIXTURE_FILE, 'utf8'), renderTreeSelectFixture(), 'stale fixture: run `node test/ssr/build-tree-select-fixture.mjs`');
  });
});
