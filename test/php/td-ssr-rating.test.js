// v0.50.0 (ADR 0012, plan docs/internal/plans/v0.50.0-rating-carousel.md R4 / R11) — PHP side of the SSR contract
// `rating@1`: td_rating() ALWAYS prints the element + the exact tree <td-rating> builds; numbers, labels and data-fill steps
// equal src/utils/rating-model.js (no Intl: the Vietnamese format is written out on both sides). Shared fixtures:
// test/ssr/rating.fixtures.json (also consumed by src/display/td-v050-rating.engines.browser-test.js through
// test/ssr/fixtures/rating.html — this test fails when it is stale: `node test/ssr/build-rating-fixture.mjs`).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { HAS_PHP, PHP_BIN, ROOT } from './php.mjs';
import { RATING_FIXTURES, RATING_FIXTURE_FILE, renderRatingFixture } from '../ssr/ssr.mjs';
import { ratingModel, RATING_LABELS, formatValueAttr } from '../../src/utils/rating-model.js';

if (!HAS_PHP && process.env.TD_REQUIRE_PHP) throw new Error('TD_REQUIRE_PHP=1 but no php >= 8.0 CLI on PATH');
const opts = { skip: !HAS_PHP && 'php >= 8.0 CLI not found' };

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

/**
 * td_rating calls in ONE php process, each with its count of td_rating warnings (any other warning fails).
 * @param {any[][]} calls
 */
function run(calls) {
  const code = `require ${JSON.stringify(join(ROOT, 'php/td.php'))}; TdComponents\\Td::configure('/', ${JSON.stringify(ROOT)});`
    + ' $calls = json_decode((string) file_get_contents(\'php://stdin\'), true, 64, JSON_THROW_ON_ERROR); $out = [];'
    + ' foreach ($calls as $a) { $w = 0; set_error_handler(function (int $no, string $msg) use (&$w): bool {'
    + " if ($no === E_USER_WARNING && str_starts_with($msg, 'td_rating:')) { $w++; return true; } return false; });"
    + ' $html = td_rating(...$a); restore_error_handler(); $out[] = [\'html\' => $html, \'warns\' => $w]; }'
    + ' echo json_encode($out, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);';
  const r = spawnSync(PHP_BIN, ['-d', 'display_errors=stderr', '-r', code], { encoding: 'utf8', input: JSON.stringify(calls) });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.equal(r.stderr, '', r.stderr);
  return JSON.parse(r.stdout);
}
const one = (args) => run([args])[0];

function phpIcon(cls) {
  const r = spawnSync(PHP_BIN, ['-r', `require ${JSON.stringify(join(ROOT, 'php/td.php'))}; TdComponents\\Td::configure('/', ${JSON.stringify(ROOT)}); echo TdComponents\\Td::icon('star', 'm', '', '${cls}');`], { encoding: 'utf8' });
  return r.stdout;
}

/**
 * The JS spec of the markup: the children <td-rating> builds for these host attributes (the engines test proves the
 * element builds exactly this DOM from the same attributes).
 */
function children(attrs, off, on) {
  const m = ratingModel(attrs);
  if (m.empty) return `<span class="td-rating__none">${esc(m.noneText)}</span>`;
  let h = Object.hasOwn(attrs, 'show-value') ? `<span class="td-rating__value" aria-hidden="true">${esc(m.valueText)}</span>` : '';
  h += '<span class="td-rating__stars" aria-hidden="true">';
  for (const s of m.stars) h += `<span class="td-rating__star" data-fill="${s.step}">${off}${on}</span>`;
  h += `</span><span class="td-sr-only">${esc(m.label)}</span>`;
  if (m.countText) h += `<span class="td-rating__count">${esc(m.countText)}</span>`;
  return h;
}

/** Host attributes in the order PHP prints them. */
function hostOpen(attrs) {
  const order = ['id', 'class', 'value', 'max', 'precision', 'count', 'show-value', 'size'];
  let h = '<td-rating data-td-ssr="rating@1"';
  for (const k of order) if (Object.hasOwn(attrs, k)) h += attrs[k] === '' && k === 'show-value' ? ` ${k}` : ` ${k}="${esc(attrs[k])}"`;
  if (ratingModel(attrs).empty) h += ' data-empty';
  for (const [k, v] of Object.entries(attrs)) if (!order.includes(k)) h += ` ${k}="${esc(v)}"`;
  return `${h}>`;
}

describe('php/td.php — td_rating (v0.50.0, contract rating@1)', opts, () => {
  const off = phpIcon('td-rating__off');
  const on = phpIcon('td-rating__on');

  test('the star icon is the registry star (svg.td-icon.td-icon--m[data-icon=star]) with the layer class', () => {
    assert.match(off, /^<svg class="td-icon td-icon--m td-rating__off" data-icon="star" viewBox="0 0 24 24" fill="none" stroke="currentColor"/);
    assert.match(on, /^<svg class="td-icon td-icon--m td-rating__on" data-icon="star"/);
  });

  test('every fixture case: exact markup = the JS spec (model labels, data-fill, attribute order), no warning', () => {
    const out = run(RATING_FIXTURES.cases.map((c) => c.args));
    RATING_FIXTURES.cases.forEach((c, i) => {
      assert.equal(out[i].warns, 0, c.id);
      assert.equal(out[i].html, `${hostOpen(c.attrs)}${children(c.attrs, off, on)}</td-rating>`, c.id);
      const m = ratingModel(c.attrs);
      assert.equal(m.label, c.expect.label, `${c.id} label`);
      assert.equal(m.countText, c.expect.count, `${c.id} count`);
      assert.deepEqual(m.stars.map((s) => s.step), c.expect.fills, `${c.id} fills`);
    });
  });

  test('numbers print the same attribute as formatValueAttr (4 decimals, integer arithmetic) and fill the same', () => {
    const nums = [4.123456, 0.03125, 2.4999999999999996, 1e-7, -2, 3, 4.75, 0.1 + 0.2, 9.99995];
    const out = run(nums.map((n) => [n, { precision: 'exact' }]));
    nums.forEach((n, i) => {
      const attr = formatValueAttr(n);
      const attrs = { value: attr, max: '5', precision: 'exact' };
      assert.equal(out[i].html, `${hostOpen(attrs)}${children(attrs, off, on)}</td-rating>`, String(n));
    });
  });

  test('bad input: value strings / types → no rating; max 0 / 11 / 2.5 / "x" → 5 + one warning; bad count / size dropped', () => {
    for (const v of ['', ' 4', '-1', '1e3', '4,5', '.5', '12345678901234567', 'NaN']) {
      assert.match(one([v, {}]).html, /^<td-rating data-td-ssr="rating@1" max="5" data-empty><span class="td-rating__none">Chưa có đánh giá<\/span><\/td-rating>$/, v);
    }
    for (const max of [0, 11, 2.5, 'x', '-3', true]) {
      const r = one(['4', { max }]);
      assert.equal(r.warns, 1, String(max));
      assert.match(r.html, / max="5"/);
    }
    const r = one(['4', { count: -1, size: 'xl', precision: 'nope', show_value: false }]);
    assert.equal(r.html.startsWith('<td-rating data-td-ssr="rating@1" value="4" max="5">'), true, r.html);
    assert.equal(one(['4', { count: '007' }]).html.includes('count="7"'), true);
  });

  test('text is escaped; a `labels` option is ignored (R13); attrs cannot print owned names / on* / data-td-*', () => {
    const r = one(['4', { labels: { value: '<b>{value}</b>' }, id: '"x', class: 'a "b', attrs: { onclick: 'x()', 'data-td-ssr': 'p@1', 'data-empty': '', size: 'l', 'aria-describedby': 'd' } }]);
    assert.ok(r.html.includes('<span class="td-sr-only">4 trên 5 sao</span>'));
    assert.ok(r.html.includes('id="&quot;x"'));
    assert.ok(r.html.includes('class="a"'), 'invalid class token dropped');
    assert.ok(!/onclick|p@1|size=|data-empty/.test(r.html), r.html);
    assert.ok(r.html.includes('aria-describedby="d"'));
    assert.equal(RATING_LABELS.value, '{value} trên {max} sao');
  });

  test('the generated fixture HTML is fresh (node test/ssr/build-rating-fixture.mjs)', () => {
    assert.equal(readFileSync(RATING_FIXTURE_FILE, 'utf8'), renderRatingFixture());
  });
});
