// v0.47.0 (plan docs/internal/plans/v0.47.0-check-matrix.md M2) — PHP side of <td-check-matrix> (contract check-matrix@1):
//   - td__check_matrix_data() == validateMatrix() on MATRIX_CASES (same reason; ok → same canonical `data`);
//   - td_check_matrix() markup == renderMatrix({ ssr }) of src/utils/check-matrix-render.js BYTE FOR BYTE (only the inline
//     chevron SVG, filled by fillIconSlots() in JS, is stripped);
//   - the no-JS FormData (inputs a browser submits, document order) == matrixEntries() of the model, and PHP's own
//     parse_str reads it as the three states (array / '' / no key); a small max_input_vars cuts `_v` (sentinel works);
//   - fail closed: no input at all + one warning that never contains a value; attrs allowlist; max-height / layout.
// Browser fixture: test/ssr/fixtures/check-matrix.html (stale → `node test/ssr/build-check-matrix-fixture.mjs`).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HAS_PHP, PHP_BIN, ROOT, runPhp } from './php.mjs';
import { MATRIX_CASES, validateMatrix, canonicalMatrix, matrixEntries } from '../../src/utils/check-matrix-model.js';
import { renderMatrix, renderMatrixState, MATRIX_LABELS } from '../../src/utils/check-matrix-render.js';
import { CHECK_MATRIX_FIXTURE_FILE, renderCheckMatrixFixture } from '../ssr/ssr.mjs';
import { denseMatrixData } from '../fixtures/check-matrix-dense.js';
import { MATRIX_LIMITS, matrixJsonBytes } from '../../src/utils/check-matrix-model.js';

if (!HAS_PHP && process.env.TD_REQUIRE_PHP) throw new Error('TD_REQUIRE_PHP=1 but no php >= 8.0 CLI on PATH');
const opts = { skip: !HAS_PHP && 'php >= 8.0 CLI not found' };

/** Run PHP calls in one process, capturing warnings (the shared harness forbids stderr). */
function phpCalls(calls, ini = []) {
  const code = `require ${JSON.stringify(join(ROOT, 'php/td.php'))}; TdComponents\\Td::configure('/', ${JSON.stringify(ROOT)});`
    + ' $in = json_decode(stream_get_contents(STDIN), true, 512, JSON_THROW_ON_ERROR); $out = [];'
    + ' foreach ($in as $c) { $out[] = ($c["fn"])(...$c["args"]); } echo json_encode($out, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);';
  const r = spawnSync(PHP_BIN, ['-d', 'display_errors=stderr', '-d', 'log_errors=0', '-d', 'error_reporting=E_ALL', '-d', 'xdebug.mode=off', ...ini, '-r', code],
    { input: JSON.stringify(calls), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  assert.equal(r.status, 0, r.stderr);
  return { out: JSON.parse(r.stdout), stderr: r.stderr };
}

/** JSON-able args of a case (undefined → null) */
const args = (d) => [d.columns ?? null, d.rows ?? null, d.cells ?? null, d.value ?? null];

/** The inputs a browser submits from this markup, in document order. */
function submitted(html) {
  const out = [];
  for (const [tag] of html.matchAll(/<input\b[^>]*>/g)) {
    const attr = (n) => {
      const m = new RegExp(`\\s${n}(?:="([^"]*)")?(?=[\\s>])`).exec(tag);
      return m ? (m[1] ?? '') : null;
    };
    const name = attr('name');
    if (name === null || attr('disabled') !== null) continue;
    const type = attr('type');
    if (type === 'checkbox' && attr('checked') === null) continue;
    const un = (s) => s.replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    out.push([un(name), un(attr('value') ?? 'on')]);
  }
  return out;
}

const hostSplit = (html) => {
  const m = /^(<td-check-matrix\b[^>]*>)([\s\S]*)<\/td-check-matrix>$/.exec(html);
  assert.ok(m, html.slice(0, 200));
  return { open: m[1], inner: m[2].replace(/(data-td-icon="next" data-td-icon-size="s" aria-hidden="true">)<svg[\s\S]*?<\/svg>/g, '$1') };
};
const dataAttr = (open) => JSON.parse(/ data="([^"]*)"/.exec(open)[1].replace(/&quot;/g, '"').replace(/&#039;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));

/** The JS render for the same model / options */
function jsSsr(model, o = {}) {
  return renderMatrix({ model, def: model.value, collapsed: model.groups.map((g) => g.collapsed), id: o.id ?? 'm', label: o.label ?? '',
    ariaLabel: o.ariaLabel ?? '', labels: MATRIX_LABELS, layout: o.layout ?? 'auto', disabled: !!o.disabled, ssr: { name: o.name ?? 'p' } });
}

describe('php/td.php — td_check_matrix (v0.47.0, contract check-matrix@1)', opts, () => {
  test('Td::CHECK_MATRIX_LABELS == MATRIX_LABELS (JS)', () => {
    const r = spawnSync(PHP_BIN, ['-r', `require ${JSON.stringify(join(ROOT, 'php/td.php'))}; echo json_encode(TdComponents\\Td::CHECK_MATRIX_LABELS, JSON_UNESCAPED_UNICODE);`], { encoding: 'utf8' });
    assert.deepEqual(JSON.parse(r.stdout), { ...MATRIX_LABELS });
  });

  test('td__check_matrix_data == validateMatrix on MATRIX_CASES (reason; ok → same canonical data)', () => {
    const cases = MATRIX_CASES.filter((c) => c.json !== false);
    const { out } = phpCalls(cases.map((c) => ({ fn: 'td__check_matrix_data', args: args(c.data) })));
    cases.forEach((c, i) => {
      assert.equal(out[i].reason, c.phpReason ?? c.reason, `php reason: ${c.name}`);
      assert.equal(out[i].ok, (c.phpReason ?? c.reason) === null, c.name);
    });
    const okCases = cases.filter((c) => c.reason === null);
    const { out: html } = phpCalls(okCases.map((c) => ({ fn: 'td_check_matrix', args: ['p', c.data.columns, c.data.rows, c.data.value ?? [], { id: 'm', cells: c.data.cells ?? null }] })));
    okCases.forEach((c, i) => {
      const model = validateMatrix(c.data).model;
      const { open, inner } = hostSplit(html[i]);
      assert.deepEqual(dataAttr(open), { v: 1, ...JSON.parse(JSON.stringify(canonicalMatrix(model))) }, `data: ${c.name}`);
      assert.equal(inner, jsSsr(model), `markup: ${c.name}`);
      assert.deepEqual(submitted(html[i]), matrixEntries('p', model, model.value), `FormData: ${c.name}`);
    });
  });

  const COLS = [{ key: 'owner', label: 'Chủ <cửa hàng>', description: 'Toàn quyền' }, { key: 'sales', label: "Bán 'hàng'" }, { key: 0, label: 'Số 0', locked: true }];
  const ROWS = [
    { key: 'dash.view', label: 'Xem tổng quan', description: 'Trang chủ' },
    { key: 'cat', label: 'Sản phẩm & kho', collapsed: true, rows: [{ key: 'cat.view', label: 'Xem' }, { key: 'cat.del', label: 'Xoá $& <b>' }] },
    { key: 'ord', label: 'Đơn', locked: true, rows: [{ key: 'ord.list', label: 'Danh sách' }] },
    { key: 7, label: 'Báo cáo' },
  ];
  const CELLS = { 'cat.del': { owner: { locked: true, note: 'Không tự <sửa> role' }, sales: { na: true, note: 'N/A "x"' } }, 7: { sales: { note: 'ghi chú' } } };
  const VALUE = { owner: ['cat.del', 'dash.view'], sales: ['ord.list'], 0: ['7'] };

  test('full grid: groups, collapsed, locks (cell / row / column / group), n/a, notes, descriptions, escaping', () => {
    const { out: [html], stderr } = phpCalls([{ fn: 'td_check_matrix', args: ['role[perms]', COLS, ROWS, VALUE, { id: 'pm', cells: CELLS, label: 'Quyền <vai trò>', layout: 'column', max_height: '24rem', class: 'x y', attrs: { 'data-x': '1', onclick: 'evil()', style: 'color:red', 'data-td-y': '1', name: 'evil', data: '{}' } }] }]);
    assert.equal(stderr, '');
    const model = validateMatrix({ columns: COLS, rows: ROWS, cells: CELLS, value: VALUE }).model;
    const { open, inner } = hostSplit(html);
    assert.equal(inner, jsSsr(model, { id: 'pm', name: 'role[perms]', label: 'Quyền <vai trò>', layout: 'column' }));
    assert.ok(open.startsWith('<td-check-matrix data-td-ssr="check-matrix@1" id="pm" class="x y" name="role[perms]" label="Quyền &lt;vai trò&gt;" layout="column" max-height="24rem" data="'), open);
    assert.ok(open.includes(' data-x="1"') && !/onclick|style=|data-td-y|evil/.test(open), open);
    assert.ok(!/ style="/.test(html), 'never a style attribute');
    assert.ok(inner.includes('Xoá $&amp; &lt;b&gt;') && !inner.includes('<b>'), 'labels escaped, $& literal');
    assert.ok(inner.includes('<svg') === false && html.includes('<svg class="td-icon td-icon--s" data-icon="next"'), 'chevron inline SVG without JS');
    // FormData: markers, ticks (locked-ticked once: hidden after its disabled checkbox), sentinel last
    const sent = submitted(html);
    assert.deepEqual(sent, matrixEntries('role[perms]', model, model.value));
    assert.deepEqual(sent, [['role[perms][owner]', ''], ['role[perms][sales]', ''], ['role[perms][0]', ''],
      ['role[perms][owner][]', 'dash.view'], ['role[perms][owner][]', 'cat.del'], ['role[perms][sales][]', 'ord.list'],
      ['role[perms][0][]', '7'], ['role[perms][_v]', '1']]);
    assert.ok(/<input type="checkbox" class="td-check-matrix__input" tabindex="-1" aria-labelledby="pm-r2 pm-c0" aria-describedby="pm-n0" checked disabled><input type="hidden" name="role\[perms\]\[owner\]\[\]" value="cat.del">/.test(html));
  });

  test('PHP parses the no-JS POST into the three states; max_input_vars cuts the sentinel first', () => {
    const { out: [html] } = phpCalls([{ fn: 'td_check_matrix', args: ['perms', COLS, ROWS, { owner: ['dash.view', 'cat.del'] }, { cells: CELLS }] }]);
    const body = new URLSearchParams(submitted(html)).toString();
    const parse = (ini) => {
      const r = spawnSync(PHP_BIN, ['-d', 'display_errors=stderr', '-d', 'log_errors=0', ...ini, '-r',
        'parse_str(stream_get_contents(STDIN), $o); echo json_encode($o);'], { input: body, encoding: 'utf8' });
      return { out: JSON.parse(r.stdout), stderr: r.stderr };
    };
    const full = parse([]);
    // locked-ticked cat.del / owner is sent once; `0` (a locked column with nothing ticked) is '' like sales
    assert.deepEqual(full.out, { perms: { owner: ['dash.view', 'cat.del'], sales: '', 0: '', _v: '1' } });
    const cut = parse(['-d', 'max_input_vars=4']);
    assert.equal(cut.out.perms._v, undefined, 'the sentinel is the first entry lost');
    assert.match(cut.stderr, /max_input_vars/);
  });

  test('disabled: every input disabled (nothing submitted), still the full markup', () => {
    const { out: [html] } = phpCalls([{ fn: 'td_check_matrix', args: ['perms', COLS, ROWS, VALUE, { id: 'd', cells: CELLS, disabled: true }] }]);
    assert.deepEqual(submitted(html), []);
    const model = validateMatrix({ columns: COLS, rows: ROWS, cells: CELLS, value: VALUE }).model;
    assert.equal(hostSplit(html).inner, jsSsr(model, { id: 'd', name: 'perms', disabled: true }));
    assert.ok(hostSplit(html).open.includes(' disabled '));
  });

  test('fail closed: bad data / bad name → broken state, NO input, one warning naming the reason only', () => {
    const secret = 'SECRET-perm-key';
    const bad = [
      ['perms', COLS, [{ key: secret }, { key: secret }], [], {}],
      ['perms', COLS, ROWS, { owner: [`${secret}x`] }, {}],
      ['perms', COLS, ROWS, [], { cells: { [secret]: {} } }],
      ['', COLS, ROWS, [], {}],
      ['perms[]', COLS, ROWS, [], {}],
      ['perms', [], ROWS, [], {}],
    ];
    const { out, stderr } = phpCalls(bad.map((a, i) => ({ fn: 'td_check_matrix', args: [a[0], a[1], a[2], a[3], { ...a[4], id: `b${i}`, label: 'L' }] })));
    for (const [i, html] of out.entries()) {
      assert.ok(!/<input/.test(html), html);
      assert.ok(!/ data="/.test(html), 'no data attribute');
      assert.ok(html.endsWith(`${renderMatrixState({ id: `b${i}`, label: 'L', labels: MATRIX_LABELS }, 'broken')}</td-check-matrix>`), html);
    }
    assert.equal((stderr.match(/Warning: +td_check_matrix:/g) || []).length, bad.length);
    assert.ok(!stderr.includes(secret), 'the warning never contains a value');
    assert.match(stderr, /duplicate-row/);
    assert.match(stderr, /value-unknown-row/);
    assert.match(stderr, /cells-unknown-row/);
    assert.match(stderr, /invalid name/);
  });

  test('review r1 #2: the `data` attribute limit = JS (512 KiB of UTF-8, note-dense matrix): limit ok, limit + 1 fails closed', () => {
    const L = MATRIX_LIMITS.json;
    const cases = [L - 1, L, L + 1].map((t) => denseMatrixData(t));
    const { out, stderr } = phpCalls(cases.map(({ data }, i) => ({ fn: 'td_check_matrix', args: ['p', data.columns, data.rows, data.value, { id: `z${i}`, cells: data.cells }] })));
    for (const i of [0, 1]) {
      const { open } = hostSplit(out[i]);
      const attr = / data="([^"]*)"/.exec(open)[1].replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
      assert.equal(attr, cases[i].json, 'PHP prints the same JSON the JS side measures');
      assert.equal(matrixJsonBytes(attr), L - 1 + i);
      assert.ok(out[i].includes('name="p[_v]"'));
    }
    assert.ok(!/<input/.test(out[2]) && !/ data="/.test(out[2]) && out[2].includes('data-state="broken"'), 'limit + 1 → fail closed');
    assert.equal((stderr.match(/Warning: +td_check_matrix: invalid data \(data-size\)/g) || []).length, 1, stderr.slice(0, 300));
  });

  test('name of the grid: label > attrs aria-label (sr-only span) > fallback text', () => {
    const { out } = phpCalls([
      { fn: 'td_check_matrix', args: ['p', COLS, ROWS, [], { id: 'a', attrs: { 'aria-label': 'Quyền "x"' } }] },
      { fn: 'td_check_matrix', args: ['p', COLS, ROWS, [], { id: 'b' }] },
    ]);
    assert.ok(out[0].includes('<span class="td-sr-only" id="a-label">Quyền &quot;x&quot;</span>') && out[0].includes(' aria-label="Quyền &quot;x&quot;"'));
    assert.ok(out[1].includes('<span class="td-sr-only" id="b-label">Ma trận chọn</span>'));
  });

  test('max_height: the QĐ 20 regex (never calc / var / url); layout: auto | grid | column; labels override', () => {
    const cases = [['24rem', true], ['70vh', true], ['none', true], ['12.5px', true], ['50%', true], ['calc(1px)', false],
      ['var(--x)', false], ['10', false], ['1rem;color:red', false], ['12345px', false], ['url(x)', false]];
    const { out } = phpCalls([
      ...cases.map(([v]) => ({ fn: 'td_check_matrix', args: ['p', COLS, ROWS, [], { id: 'h', max_height: v }] })),
      { fn: 'td_check_matrix', args: ['p', COLS, ROWS, [], { id: 'l', layout: 'cards' }] },
      { fn: 'td_check_matrix', args: ['p', COLS, ROWS, [], { id: 'k', labels: { all: 'Tất cả {x}', nope: 'x', rows: 5 } }] },
    ]);
    cases.forEach(([v, okv], i) => assert.equal(hostSplit(out[i]).open.includes(` max-height="${v}"`), okv, v));
    assert.ok(!hostSplit(out[cases.length]).open.includes('layout=') && out[cases.length].includes('data-layout="auto"'));
    assert.ok(out[cases.length + 1].includes('aria-label="Tất cả {x}"') && out[cases.length + 1].includes('>Mục</th>'));
  });

  test('the shared harness sees no warning on a valid call', () => {
    const [r] = runPhp([{ fn: 'td_check_matrix', args: ['p', COLS, ROWS, VALUE, { cells: CELLS }] }], { baseUrl: '/' });
    assert.equal(r.error, undefined);
    assert.match(r.out, /^<td-check-matrix data-td-ssr="check-matrix@1" id="td-cm-\d+"/);
  });

  test('test/ssr/fixtures/check-matrix.html (browser fixture) is up to date', () => {
    assert.equal(readFileSync(CHECK_MATRIX_FIXTURE_FILE, 'utf8'), renderCheckMatrixFixture(),
      'stale fixture: run `node test/ssr/build-check-matrix-fixture.mjs`');
  });
});
