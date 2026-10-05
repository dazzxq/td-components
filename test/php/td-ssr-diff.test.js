// v0.46.0 (ADR 0012, plan docs/internal/plans/v0.46.0-diff.md QĐ 19–21, M4) — PHP side of td-diff, contract `diff@1`:
// (a) MODEL parity byte for byte — Td::diffModel() = normalize() of src/utils/diff-model.js (JSON.stringify vs
//     json_encode Td::DIFF_JSON), for every case of test/ssr/diff.fixtures.json (snapshot sides are JSON strings: JS
//     JSON.parse, PHP decodes the string) + the generated limit cases of test/ssr/diff-cases.mjs;
// (b) MARKUP parity — td_diff() / td_diff_snapshots() print exactly diffMarkup() of the same model inside the host;
// plus the PHP-only input contract (arrays: narrow array_is_list rule; invalid / deep JSON → a note), host attributes,
// escaping, warnings (codes only), precision-independent numbers, and the browser fixture freshness.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { HAS_PHP, PHP_BIN, ROOT } from './php.mjs';
import { DIFF_FIXTURE_FILE, renderDiffFixture } from '../ssr/ssr.mjs';
import { generatedCases } from '../ssr/diff-cases.mjs';
import { normalize, parityModel, resolveLabels } from '../../src/utils/diff-model.js';
import { diffMarkup } from '../../src/utils/diff-markup.js';

if (!HAS_PHP && process.env.TD_REQUIRE_PHP) throw new Error('TD_REQUIRE_PHP=1 but no php >= 8.0 CLI on PATH');
const opts = { skip: !HAS_PHP && 'php >= 8.0 CLI not found' };
/** Wall-clock budgets get 20× slack on shared hosts; TD_PERF_STRICT=1 = raw. */
const PERF_SLACK = process.env.TD_PERF_STRICT ? 1 : 20;

const SPEC = JSON.parse(readFileSync(join(ROOT, 'test/ssr/diff.fixtures.json'), 'utf8'));
const GEN = generatedCases();
const ALL = [...SPEC.cases, ...GEN];

/** Run every case in one php process (extra -d ini flags allowed). */
function runAll(ini = []) {
  // the runner keeps every case's model + markup in memory (not the helper's footprint): 1 GB for the generated cases
  const r = spawnSync(PHP_BIN, ['-d', 'display_errors=stderr', '-d', 'memory_limit=1G', ...ini, join(ROOT, 'test/ssr/diff-run.php')],
    { encoding: 'utf8', input: JSON.stringify(GEN), maxBuffer: 256 * 1024 * 1024 });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.equal(r.stderr, '', r.stderr);
  return JSON.parse(r.stdout);
}

/** Inline PHP returning JSON (stderr forbidden). */
function php(code) {
  const r = spawnSync(PHP_BIN, ['-d', 'display_errors=stderr', '-r', `require ${JSON.stringify(join(ROOT, 'php/td.php'))};`
    + ` TdComponents\\Td::configure('/', ${JSON.stringify(ROOT)}); ${code}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  return { out: r.stdout, err: r.stderr };
}

/** The JS input of a case (snapshot sides parsed like the browser app would). */
function jsInput(c) {
  if (c.mode === 'items') return { items: c.items };
  const parse = (s) => (typeof s === 'string' ? JSON.parse(s) : s);
  return { before: parse(c.before), after: parse(c.after), fields: c.fields };
}
const jsModel = (c) => normalize(jsInput(c), { json: !!c.opts.json, labels: c.opts.labels });
/** Host + body of the PHP markup; `&#039;` (PHP) = `&#39;` (JS) — same DOM. */
const body = (html) => /^<td-diff[^>]*>([\s\S]*)<\/td-diff>$/.exec(html)[1].replace(/&#039;/g, '&#39;');
const host = (html) => /^<td-diff[^>]*>/.exec(html)[0];

describe('php/td.php — td_diff / td_diff_snapshots (v0.46.0, contract diff@1)', opts, () => {
  let outs;
  const outOf = (id) => {
    outs ??= runAll();
    return outs.find((o) => o.id === id);
  };

  test('(a) model parity: Td::diffModel = normalize() byte for byte, every shared + generated case', () => {
    for (const c of ALL.filter((x) => !x.phpOnly)) {
      assert.equal(outOf(c.id).model, JSON.stringify(parityModel(jsModel(c))), c.id);
    }
  });

  test('(b) markup parity: td_diff* body = diffMarkup() of the same model; host carries diff@1', () => {
    for (const c of ALL.filter((x) => !x.phpOnly)) {
      const o = outOf(c.id);
      const want = diffMarkup(jsModel(c), { labels: resolveLabels(c.opts.labels), label: c.opts.label, unchanged: c.opts.unchanged, json: !!c.opts.json });
      assert.equal(body(o.html), want, c.id);
      assert.match(host(o.html), /^<td-diff data-td-ssr="diff@1"/, c.id);
    }
  });

  test('warnings: one E_USER_WARNING per call with codes only (no value); none for clean input', () => {
    for (const c of ALL) assert.equal(outOf(c.id).warns, c.warns ?? 0, c.id);
    const r = php("set_error_handler(function ($n, $m) { echo $m; return true; }); td_diff([['key' => 'a', 'before' => 'SECRET', 'kind' => 'nope']]);");
    assert.match(r.out, /^td_diff: kind/);
    assert.ok(!r.out.includes('SECRET'));
  });

  test('numbers (QĐ 7a): unsafe / non-finite never shown as digits, uncertain on both runtimes, no PHP warning', () => {
    const m = JSON.parse(outOf('i-numbers').model);
    const show = Object.fromEntries(m.rows.map((r) => [r.path[0], r.after && (r.after.s ?? r.after.items?.map((i) => i.m + i.s))]));
    assert.deepEqual([show.safe, show.p53, show.p53p1, show.m53, show.i64, show.i64p1, show.e21, show.e300],
      ['9.007.199.254.740.991', '[số quá lớn]', '[số quá lớn]', '[số quá lớn]', '[số quá lớn]', '[số quá lớn]', '[số quá lớn]', '[số quá lớn]']);
    assert.deepEqual([show.tenth, show.one, show.mzero, show.mzerof, show.e7, show.e6], ['0,30000000000000004', '1', '0', '0', '1e-7', '0,000001']);
    assert.equal(show.str, '12345678901234567890');
    const cmp = m.rows.find((r) => r.path[0] === 'cmp');
    assert.deepEqual([cmp.kind, cmp.uncertain], ['changed', true]);
    assert.deepEqual(m.notes, ['unsafe']);
    const nf = JSON.parse(outOf('i-nonfinite').model);
    assert.deepEqual(nf.rows.map((r) => [r.path[0], r.kind, r.uncertain]), [['a', 'changed', true], ['b', 'changed', true], ['c', 'added', false],
      ['l', 'changed', false], ['deep', 'added', false]]);
    assert.ok(!nf.json.after.includes('INF') && !nf.json.after.includes('Infinity'));
    for (const id of ['i-numbers', 'i-nonfinite', 's-numbers']) assert.equal(outOf(id).error, null, id);
    const t = JSON.parse(outOf('i-types').model);
    assert.deepEqual(t.rows.slice(0, 2).map((r) => [r.before?.s, r.after?.s]), [['123,46', '1,01'], [undefined, '1,123457']]);
  });

  test('numbers do not depend on serialize_precision / precision ini', () => {
    const a = runAll();
    const b = runAll(['-d', 'serialize_precision=17', '-d', 'precision=14']);
    assert.deepEqual(b.map((o) => o.model), a.map((o) => o.model));
  });

  test('PHP-only input contract: invalid JSON / deeper than 64 → a note, no rows, nothing thrown; > 2 MB → too large', () => {
    for (const c of SPEC.cases.filter((x) => x.phpOnly)) {
      const m = JSON.parse(outOf(c.id).model);
      assert.deepEqual([m.rows.length, m.notes], [0, c.expectNotes], c.id);
      assert.match(outOf(c.id).html, /<p class="td-diff__empty">Không có thay đổi\.<\/p><p class="td-diff__note">/, c.id);
    }
    const big = php("echo json_encode(TdComponents\\Td::diffModel(['before' => '\"' . str_repeat('a', 2 * 1024 * 1024) . '\"', 'after' => '{}'])['notes']);");
    assert.equal(big.out, '["tooLarge"]');
  });

  test('PHP arrays (narrow rule): list → list, associative / int-keyed → object (string segments), same model as the JSON', () => {
    const cases = [
      ["['b' => 1, 10 => 2, 2 => 3, 'a' => 4]", '{"b":1,"10":2,"2":3,"a":4}'],
      ["['o' => [3 => 'x'], 'l' => ['a', 'b'], 'm' => [0 => 'p', 1 => 'q']]", '{"o":{"3":"x"},"l":["a","b"],"m":["p","q"]}'],
      ["['lines' => [['qty' => 1], ['qty' => 2]], 'k' => ['12' => ['qty' => 1]]]", '{"lines":[{"qty":1},{"qty":2}],"k":{"12":{"qty":1}}}'],
      ["['e' => [], 'n' => null, 'f' => 1.0, 'big' => PHP_INT_MAX]", '{"e":[],"n":null,"f":1,"big":9223372036854775807}'],
    ];
    for (const [lit, json] of cases) {
      const r = php(`echo json_encode(TdComponents\\Td::diffModel(['before' => null, 'after' => ${lit}], ['json' => true]), TdComponents\\Td::DIFF_JSON);`);
      assert.equal(r.out, JSON.stringify(parityModel(normalize({ before: null, after: JSON.parse(json) }, { json: true }))), lit);
      assert.ok(JSON.parse(r.out).rows.every((row) => row.path.every((s, i) => typeof s === 'string' || (typeof s === 'number' && i > 0))), lit);
    }
    // stdClass keeps numeric keys as STRING segments; a non-stdClass object nested → [không hỗ trợ]
    const s = php("$o = new stdClass(); $o->{'12'} = 1; $o->d = new DateTime('2020-01-01'); echo json_encode(TdComponents\\Td::diffModel(['before' => null, 'after' => $o]), TdComponents\\Td::DIFF_JSON);");
    const m = JSON.parse(s.out);
    assert.deepEqual(m.rows.map((r) => [r.path, r.after.s]), [[['12'], '1'], [['d'], '[không hỗ trợ]']]);
  });

  test('signatures (reflection): typed snapshot sides; items array; options array', () => {
    const r = php("$f = new ReflectionFunction('td_diff_snapshots'); $g = new ReflectionFunction('td_diff');"
      + " echo json_encode([array_map(fn ($p) => (string) $p->getType(), $f->getParameters()), array_map(fn ($p) => (string) $p->getType(), $g->getParameters())]);");
    assert.deepEqual(JSON.parse(r.out), [['stdClass|array|string|null', 'stdClass|array|string|null', 'array'], ['array', 'array']]);
    const e = spawnSync(PHP_BIN, ['-r', `require ${JSON.stringify(join(ROOT, 'php/td.php'))}; try { td_diff_snapshots(new DateTime(), null); } catch (TypeError $e) { echo 'TypeError'; }`], { encoding: 'utf8' });
    assert.equal(e.stdout, 'TypeError');
  });

  test('host: options + attrs allowlist (owned names, data-td-*, on*, style dropped); escaping of label / labels', () => {
    const r = php(`echo td_diff([['key' => 'a', 'after' => 1]], ['id' => 'df1', 'class' => 'x "y', 'view' => 'inline', 'unchanged' => 'hide',
      'json' => true, 'label' => 'Đơn <b>"12"</b>', 'attrs' => ['data-scope' => 'orders', 'onclick' => 'x()', 'style' => 'color:red',
      'view' => 'table', 'data-td-ssr' => 'x@9', 'aria-describedby' => 'h']]);`);
    assert.equal(host(r.out), '<td-diff data-td-ssr="diff@1" id="df1" class="x" view="inline" unchanged="hide" json label="Đơn &lt;b&gt;&quot;12&quot;&lt;/b&gt;" data-scope="orders" aria-describedby="h">');
    assert.ok(r.out.includes('aria-label="Đơn &lt;b&gt;&quot;12&quot;&lt;/b&gt;"'));
    const bad = php("echo td_diff([], ['view' => 'x', 'unchanged' => 'y', 'labels' => ['none' => '<i>Trống</i>', 'table' => 5]]);");
    assert.equal(bad.out, '<td-diff data-td-ssr="diff@1"><p class="td-diff__empty">&lt;i&gt;Trống&lt;/i&gt;</p></td-diff>');
  });

  test('XSS: keys, labels, values, enum options, fields labels — escaped text only', () => {
    for (const id of ['i-strings', 's-xss']) {
      const html = outOf(id).html;
      assert.ok(!/<img|<svg/i.test(html), id);
      assert.ok(!/<[a-z][^>]*\s(on\w+|style)=/i.test(html), id); // escaped text has no raw `<`: only real tags are seen
    }
  });

  test('Codex round 1: identity (S1), work budget (S2), Unicode (S3), sets (I1), masked list (I3), json type (I5) — PHP side', () => {
    const rows = (id) => JSON.parse(outOf(id).model).rows;
    assert.equal(rows('r1-prefix-collide').length, 2);
    assert.deepEqual(rows('r1-nfc-nfd').map((r) => r.kind), ['unchanged', 'changed']);
    const over = JSON.parse(outOf('r1-overcap-key').model);
    assert.deepEqual(over.rows.map((r) => r.kind).sort(), ['added', 'changed', 'removed']);
    assert.equal(over.counts.truncated, true);
    assert.deepEqual(rows('r1-mask-list').map((r) => [r.id, r.masked]), [['["lines",0]', true], ['["tags"]', true], ['["lines",1,"p"]', false], ['["other"]', true]]);
    assert.ok(!outOf('r1-mask-list').html.includes('secret'), 'masked list element never printed');
    const inv = outOf('r1-invisible').html;
    for (const c of ['061C', '2060', '00AD', '180E', 'E0041', '2064']) assert.ok(inv.includes(`<span class="td-diff__ctl">⟨U+${c}⟩</span>`), c);
    assert.ok(!inv.includes('⟨U+FE0F⟩'));
    assert.deepEqual(rows('r1-sets').map((r) => [r.path[0], r.kind, r.uncertain]), [['order', 'unchanged', false], ['dup', 'unchanged', false],
      ['unsafe', 'changed', true], ['more', 'changed', false], ['mixed', 'unchanged', false], ['nf', 'changed', false]]);
    assert.deepEqual(rows('r1-json-type').map((r) => r.after && r.after.s), ['"chuỗi \\"x\\""', 'true', '1', '0.1', '"[số quá lớn]"', '["a", 1, null]', null, '{"a": [1]}']);
    const work = JSON.parse(outOf('g-work-lists').model);
    assert.equal(work.counts.truncated, true);
    assert.equal(work.rows[0].after.items.length, 200);
    assert.equal(work.rows[0].after.more, 800);
    assert.equal(work.rows.at(-1).after.k, 'note');
    assert.ok(JSON.parse(outOf('g-list-text').model).notes.includes('textBudget'));
  });

  test('Codex round 1 I4: 10 MB values / keys / FieldDef segments in PHP — bounded time, cut before any regex', () => {
    const t0 = Date.now();
    const r = php("$big = str_repeat('x', 10 * 1024 * 1024); $m = TdComponents\\Td::diffModel(['items' => [['key' => $big, 'before' => $big, 'after' => $big . 'y'],"
      + " ['key' => 'l', 'before' => [$big], 'after' => [$big . 'z']]]]); $o = new stdClass(); $o->{$big} = 1;"
      + " $n = TdComponents\\Td::diffModel(['before' => null, 'after' => $o, 'fields' => [['path' => [$big]]]]);"
      + " echo json_encode([array_map(fn ($r) => [$r['kind'], $r['uncertain']], $m['rows']), count($n['rows']), $n['counts']['truncated']]);");
    assert.ok(Date.now() - t0 < 2000 * PERF_SLACK, `${Date.now() - t0} ms`);
    assert.equal(r.out.split('\n').pop(), '[[["changed",true],["changed",true]],1,true]');
  });

  test('test/ssr/fixtures/diff.html (browser fixture) is up to date', () => {
    assert.equal(readFileSync(DIFF_FIXTURE_FILE, 'utf8'), renderDiffFixture(), 'stale fixture: run `node test/ssr/build-diff-fixture.mjs`');
  });
});

describe('php/td.php — td-diff Codex round 2 (PHP native input)', opts, () => {
  test('A: invalid UTF-8 keys never merge, invalid values compare by raw bytes (display keeps U+FFFD)', () => {
    const r = php("$m = TdComponents\\Td::diffModel(['before' => [\"\\x80\" => 1, 'v' => \"a\\x80\", 'w' => \"\\xC3\"], 'after' => [\"\\x81\" => 1, 'v' => \"a\\x81\", 'w' => \"\\xC3\"]]);"
      + " $n = TdComponents\\Td::diffModel(['items' => [['key' => 'x', 'before' => \"\\x80\", 'after' => \"\\x81\"], ['key' => \"k\\xFF\", 'after' => 1], ['key' => \"k\\xFE\", 'after' => 2]]]);"
      + " echo json_encode([array_map(fn ($r) => [$r['label'], $r['kind']], $m['rows']), array_map(fn ($r) => [$r['label'], $r['kind'], $r['after']['s'] ?? null], $n['rows']),"
      + " count(array_unique(array_column($n['rows'], 'id')))], TdComponents\\Td::DIFF_JSON);");
    const [snap, items, ids] = JSON.parse(r.out);
    assert.equal(snap.filter(([l]) => l.startsWith('\uFFFD')).length, 2, 'two invalid keys → two rows (never merged)');
    assert.deepEqual(snap.filter(([l]) => l === 'v').map(([, k]) => k), ['changed']);
    assert.deepEqual(snap.filter(([l]) => l === 'w').map(([, k]) => k), ['unchanged']);
    assert.deepEqual(items[0], ['x', 'changed', '\uFFFD']);
    assert.equal(ids, 3, 'k\\xFF and k\\xFE stay two rows');
  });

  test('C: an over-cap container is refused before its values are read (bounded time, uncertain)', () => {
    const t0 = Date.now();
    const r = php("$a = array_fill(0, 200000, ['x' => str_repeat('y', 100)]); $b = $a;"
      + " $m = TdComponents\\Td::diffModel(['items' => [['key' => 'k', 'before' => [$a], 'after' => [$b]]]]);"
      + " echo json_encode(array_map(fn ($r) => [$r['kind'], $r['uncertain']], $m['rows']));");
    assert.ok(Date.now() - t0 < 1500 * PERF_SLACK, `${Date.now() - t0} ms`);
    assert.equal(r.out, '[["changed",true]]');
  });
});
