// v0.39.0 (ADR 0012, plan docs/internal/plans/v0.39.0-filters-range.md QĐ 13–16, M3) — PHP side of the SSR contract
// `filter-chips@1`: td_filter_chips() ALWAYS prints the element + the exact tree <td-filter-chips> builds (each field in
// its own node — never the shown "label: value" text split), × as a safe <a href> or a no-JS-hidden button, the item
// normalisation of src/utils/filter-chips-model.js (types, control characters, lengths, duplicate ids → -2) and the chip
// link policy (Td::safeUrl, then http(s) / relative only — mailto: / tel: refused).
// Shared fixtures: test/ssr/filter-chips.fixtures.json (also consumed by src/display/td-filter-chips.ssr.engines.browser-test.js
// through test/ssr/fixtures/filter-chips.html — this test fails when it is stale: `node test/ssr/build-filter-chips-fixture.mjs`).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { HAS_PHP, PHP_BIN, ROOT } from './php.mjs';
import { FILTER_CHIPS_FIXTURES, FILTER_CHIPS_FIXTURE_FILE, renderFilterChipsFixture } from '../ssr/ssr.mjs';
import { normalizeItems, HREF_CASES, MAX_ITEMS, MAX_CANDIDATES } from '../../src/utils/filter-chips-model.js';
// Wall-clock budgets guard against super-linear blow-ups, not micro-speed: on a shared host (CI, several suites at
// once) they get 20× slack, which still catches quadratic behaviour; TD_PERF_STRICT=1 enforces the raw budget.
const PERF_SLACK = process.env.TD_PERF_STRICT ? 1 : 20;

if (!HAS_PHP && process.env.TD_REQUIRE_PHP) throw new Error('TD_REQUIRE_PHP=1 but no php >= 8.0 CLI on PATH');
const opts = { skip: !HAS_PHP && 'php >= 8.0 CLI not found' };

/** htmlspecialchars(ENT_QUOTES | ENT_SUBSTITUTE) as Td::e() prints it. */
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
const unesc = (s) => s.replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/**
 * td_filter_chips calls in ONE php process, each with its own count of td_filter_chips warnings (the harness forbids
 * stderr). Any other warning / notice fails.
 * @param {any[][]} calls argument lists
 * @returns {Array<{ html: string, warns: number }>}
 */
function run(calls) {
  const code = `require ${JSON.stringify(join(ROOT, 'php/td.php'))}; TdComponents\\Td::configure('/', ${JSON.stringify(ROOT)});`
    + ' $calls = json_decode((string) file_get_contents(\'php://stdin\'), true, 64, JSON_THROW_ON_ERROR); $out = [];'
    + ' foreach ($calls as $a) { $w = 0; set_error_handler(function (int $no, string $msg) use (&$w): bool {'
    + " if ($no === E_USER_WARNING && str_starts_with($msg, 'td_filter_chips:')) { $w++; return true; } return false; });"
    + ' $html = td_filter_chips(...$a); restore_error_handler(); $out[] = [\'html\' => $html, \'warns\' => $w]; }'
    + ' echo json_encode($out, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);';
  const r = spawnSync(PHP_BIN, ['-d', 'display_errors=stderr', '-r', code], { encoding: 'utf8', input: JSON.stringify(calls), maxBuffer: 64 * 1024 * 1024 });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.equal(r.stderr, '', r.stderr);
  return JSON.parse(r.stdout);
}
const one = (args) => run([args])[0];

/** Items read back from the printed markup (each field from its own node / attribute). */
function itemsOf(html) {
  const out = [];
  const re = /<li class="td-filter-chips__item" data-id="([^"]*)" data-key="([^"]*)" data-removable="(true|false)"><span class="td-filter-chips__label">([^<]*)<\/span><span class="td-filter-chips__sep" aria-hidden="true">: <\/span><span class="td-filter-chips__value">([^<]*)<\/span>(<a class="td-filter-chips__remove" href="([^"]*)"|<button type="button" class="td-filter-chips__remove" data-td-js-only|<\/li>)/g;
  let m;
  while ((m = re.exec(html))) {
    const it = { id: unesc(m[1]), key: unesc(m[2]), label: unesc(m[4]), value: unesc(m[5]), removable: m[3] === 'true' };
    if (m[7] !== undefined) it.href = unesc(m[7]);
    out.push(it);
  }
  return out;
}

describe('php/td.php — td_filter_chips (v0.39.0, contract filter-chips@1)', opts, () => {
  const icon = () => {
    const r = spawnSync(PHP_BIN, ['-r', `require ${JSON.stringify(join(ROOT, 'php/td.php'))}; TdComponents\\Td::configure('/', ${JSON.stringify(ROOT)}); echo TdComponents\\Td::icon('close', 14);`], { encoding: 'utf8' });
    return r.stdout;
  };

  test('exact tree: group > list > li (label / ": " / value / ×) + "Xoá tất cả" + live region', () => {
    const c = FILTER_CHIPS_FIXTURES.cases.find((x) => x.id === 'f-basic');
    const { html, warns } = one(c.args);
    assert.equal(warns, 0);
    const x = (label, value) => `<button type="button" class="td-filter-chips__remove" data-td-js-only aria-label="${esc(`Bỏ lọc ${label}: ${value}`)}">`
      + `<span class="td-filter-chips__icon" data-td-icon="close" data-td-icon-size="14" aria-hidden="true">${icon()}</span></button>`;
    assert.equal(html, '<td-filter-chips data-td-ssr="filter-chips@1">'
      + '<div class="td-filter-chips" role="group" aria-label="Bộ lọc đang áp dụng"><ul class="td-filter-chips__list" role="list">'
      + '<li class="td-filter-chips__item" data-id="status" data-key="status" data-removable="true"><span class="td-filter-chips__label">Trạng thái</span>'
      + '<span class="td-filter-chips__sep" aria-hidden="true">: </span><span class="td-filter-chips__value">Đang bán</span>'
      + `${x('Trạng thái', 'Đang bán')}</li>`
      + '<li class="td-filter-chips__item" data-id="q" data-key="q" data-removable="true"><span class="td-filter-chips__label">Tìm</span>'
      + '<span class="td-filter-chips__sep" aria-hidden="true">: </span><span class="td-filter-chips__value">iphone 15</span>'
      + `${x('Tìm', 'iphone 15')}</li></ul>`
      + '<button type="button" class="td-btn td-btn--ghost td-btn--sm td-filter-chips__clear" data-td-js-only>Xoá tất cả</button></div>'
      + '<p class="td-sr-only" role="status"></p></td-filter-chips>');
  });

  test('every fixture case: items read back from the markup = expect.items = normalizeItems() (JS parity); links; clear; group', () => {
    const outs = run(FILTER_CHIPS_FIXTURES.cases.map((c) => c.args));
    FILTER_CHIPS_FIXTURES.cases.forEach((c, i) => {
      const { html, warns } = outs[i];
      assert.equal(warns, 0, c.id);
      assert.deepEqual(itemsOf(html), c.expect.items, c.id);
      assert.deepEqual(itemsOf(html), normalizeItems(c.args[0], { baseURI: 'https://shop.example/', protocol: 'https:' }).items, c.id);
      const links = [...html.matchAll(/data-id="([^"]*)"[^>]*>(?:(?!<\/li>).)*<a class="td-filter-chips__remove"/g)].map((m) => unesc(m[1]));
      assert.deepEqual(links, c.expect.links, `${c.id} links`);
      const clear = /<a class="td-btn td-btn--ghost td-btn--sm td-filter-chips__clear" href="[^"]*">/.test(html) ? 'link'
        : /<button type="button" class="td-btn td-btn--ghost td-btn--sm td-filter-chips__clear" data-td-js-only>/.test(html) ? 'button' : null;
      assert.equal(clear, c.expect.clear, `${c.id} clear`);
      assert.ok(html.includes(`role="group" aria-label="${esc(c.expect.group)}"`), `${c.id} group`);
      assert.equal(/^<td-filter-chips[^>]* hidden[ >]/.test(html), !!c.expect.hidden, `${c.id} hidden`);
    });
  });

  test('escaping: label / value / aria-label / href are escaped text; no raw tag, no handler', () => {
    const c = FILTER_CHIPS_FIXTURES.cases.find((x) => x.id === 'f-special');
    const { html } = one(c.args);
    assert.ok(!/<img|onerror=alert\(1\)>/.test(html.replace(/&lt;img src=x onerror=alert\(1\)&gt;/g, '')), html);
    assert.ok(html.includes(`<span class="td-filter-chips__value">${esc(c.args[0][0].value)}</span>`));
    assert.ok(html.includes(`aria-label="${esc(`Bỏ lọc ${c.args[0][0].label}: ${c.args[0][0].value}`)}"`));
  });

  test('chip link policy: javascript: / data: / mailto: / java\\tscript: → no link (button data-td-js-only); clear_href the same', () => {
    const c = FILTER_CHIPS_FIXTURES.cases.find((x) => x.id === 'f-href-bad');
    const { html } = one(c.args);
    assert.ok(!/href=/.test(html), html);
    assert.equal((html.match(/data-td-js-only/g) || []).length, 5); // 4 × + clear
    assert.ok(!html.includes('clear-href'), 'refused clear_href not printed');
    const ok = FILTER_CHIPS_FIXTURES.cases.find((x) => x.id === 'f-href');
    assert.match(one(ok.args).html, /^<td-filter-chips data-td-ssr="filter-chips@1" label="Đang lọc" clear-href="\?">/);
    assert.ok(!one([[{ key: 'a', value: '1', href: 'http://plain.example/x' }], {}]).html.includes('href='), 'http: refused by default');
  });

  test('host options + attrs: allowlist; owned names and data-td-* reserved; handlers / style dropped; empty → hidden', () => {
    const c = FILTER_CHIPS_FIXTURES.cases.find((x) => x.id === 'f-number');
    const host = /^<td-filter-chips[^>]*>/.exec(one(c.args).html)[0];
    assert.equal(host, '<td-filter-chips data-td-ssr="filter-chips@1" id="fc-num" class="my-chips x" empty-focus="search-q" data-scope="orders">');
    const e = FILTER_CHIPS_FIXTURES.cases.find((x) => x.id === 'f-empty');
    const out = one(e.args).html;
    assert.equal(out, '<td-filter-chips data-td-ssr="filter-chips@1" empty-focus="search-q" hidden><div class="td-filter-chips" role="group"'
      + ' aria-label="Bộ lọc đang áp dụng"><ul class="td-filter-chips__list" role="list"></ul></div><p class="td-sr-only" role="status"></p></td-filter-chips>');
    const own = one([[{ key: 'a', value: '1' }], { attrs: { label: 'x', 'clear-href': '/evil', hidden: true, 'empty-focus': 'z', 'data-td-ssr': 'x@9' } }]).html;
    assert.match(own, /^<td-filter-chips data-td-ssr="filter-chips@1">/);
  });

  test('invalid items: dropped + ONE E_USER_WARNING each (array value, missing key, bool / object fields, non-array item)', () => {
    const outs = run([
      [[{ key: 'tag', label: 'Nhãn', value: ['a', 'b'] }], {}],
      [[{ label: 'x', value: '1' }, { key: '', value: '1' }], {}],
      [[{ key: 'a', value: true }, { key: 'a', value: '1', label: { x: 1 } }, 'str'], {}],
      [[{ key: 'a', value: '1', id: false }, { key: 'b', value: null }], {}],
    ]);
    assert.deepEqual(outs.map((o) => o.warns), [1, 1, 1, 1]); // SEC-1: ONE warning per call for dropped items
    for (const o of outs) assert.deepEqual(itemsOf(o.html), []);
  });

  test('normalisation parity: control characters removed, lengths cut in code points, duplicate ids → -2 / -3, numbers', () => {
    const long = '😀'.repeat(600);
    const input = [{ key: `a\u0000b\u001fc\u007fd\u0085`, label: long, value: long, id: long }, { id: 'x', key: 'k', value: 1 },
      { id: 'x', key: 'k', value: 2 }, { key: 'x', value: 3 }, { key: 'k', value: '', label: '' }];
    const { html, warns } = one([input, {}]);
    assert.equal(warns, 0);
    assert.deepEqual(itemsOf(html), normalizeItems(input).items);
  });

  test('SEC-1: 10 000 identical ids / 10 000 malformed items: ≤ MAX_ITEMS chips, ONE warning, fast; huge strings bounded', () => {
    const t0 = Date.now();
    const outs = run([
      [Array.from({ length: 10000 }, () => ({ id: 'x', key: 'k', value: 'v' })), {}],
      [Array.from({ length: 10000 }, (_, i) => ({ key: '', value: i })), {}],
      [[{ key: 'k', value: 'é'.repeat(1_000_000) }], {}],
    ]);
    assert.ok(Date.now() - t0 < 3000 * PERF_SLACK, `${Date.now() - t0}ms`);
    const ids = itemsOf(outs[0].html).map((i) => i.id);
    assert.equal(ids.length, MAX_ITEMS);
    assert.equal(new Set(ids).size, MAX_ITEMS);
    assert.deepEqual(ids.slice(0, 3), ['x', 'x-2', 'x-3']);
    assert.equal(outs[0].warns, 1, 'cap: one warning');
    assert.equal(itemsOf(outs[1].html).length, 0);
    assert.equal(outs[1].warns, 2, 'malformed: one dropped warning + one candidate-cap warning');
    assert.equal(Array.from(itemsOf(outs[2].html)[0].value).length, 500);
    assert.equal(outs[2].warns, 0);
  });

  test('SEC-1 round 2: inspected candidates capped at MAX_CANDIDATES like JS (malformed prefix, then valid entries)', () => {
    const bad = Array.from({ length: MAX_CANDIDATES - 2 }, () => null);
    const good = Array.from({ length: 5 }, (_, i) => ({ key: `k${i}`, value: 'v' }));
    const outs = run([[[...bad, ...good], {}], [Array.from({ length: MAX_CANDIDATES + 5 }, () => ({ key: '' })), {}],
      [[...bad, ...good.slice(0, 2)], {}]]);
    assert.equal([...bad, ...good.slice(0, 2)].length, MAX_CANDIDATES);
    assert.deepEqual(itemsOf(outs[0].html).map((i) => i.key), ['k0', 'k1']);
    assert.deepEqual(itemsOf(outs[0].html), normalizeItems([...bad, ...good]).items);
    assert.equal(outs[0].warns, 2, 'one dropped warning + one cap warning');
    assert.equal(itemsOf(outs[1].html).length, 0);
    assert.equal(outs[1].warns, 2);
    assert.equal(itemsOf(outs[2].html).length, 2);
    assert.equal(outs[2].warns, 1, 'exactly MAX_CANDIDATES entries: dropped warning only, not capped');
  });

  test('SEC-2: chip links are relative only in PHP (HREF_CASES php column, same table as JS)', () => {
    const outs = run(HREF_CASES.map(([href]) => [[{ key: 'k', value: 'v', href }], {}]));
    HREF_CASES.forEach(([href, , php], i) => {
      const got = itemsOf(outs[i].html)[0].href ?? null;
      assert.equal(got, php, JSON.stringify(href));
    });
    const clear = run([[[{ key: 'a', value: '1' }, { key: 'b', value: '2' }], { clear_href: '//evil.example/' }]])[0].html;
    assert.ok(!clear.includes('clear-href') && !clear.includes('href='), clear);
  });

  test('ISSUE-2: numbers are printed like JavaScript String(n) (-0, exponent thresholds, shortest round-trip)', () => {
    const lits = ['-0.0', '1e-6', '1e-7', '1e20', '1e21', '0.1 + 0.2', '123.456', '5e-324', '12.5', '3.0', '-1.5e-9', '1.7976931348623157e308', '100', '-7'];
    const js = [-0, 1e-6, 1e-7, 1e20, 1e21, 0.1 + 0.2, 123.456, 5e-324, 12.5, 3.0, -1.5e-9, 1.7976931348623157e308, 100, -7].map((n) => String(n));
    const r = spawnSync(PHP_BIN, ['-d', 'display_errors=stderr', '-r', `require ${JSON.stringify(join(ROOT, 'php/td.php'))};`
      + ` echo json_encode([${lits.map((l) => `td__filter_text(${l}, 500)`).join(', ')}]);`], { encoding: 'utf8' });
    assert.equal(r.stderr, '');
    assert.deepEqual(JSON.parse(r.stdout), js);
    assert.equal(js[0], '0');
  });

  test('test/ssr/fixtures/filter-chips.html (browser fixture) is up to date', () => {
    assert.equal(readFileSync(FILTER_CHIPS_FIXTURE_FILE, 'utf8'), renderFilterChipsFixture(),
      'stale fixture: run `node test/ssr/build-filter-chips-fixture.mjs`');
  });
});
