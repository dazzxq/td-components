// v0.50.0 (ADR 0012, plan docs/internal/plans/v0.50.0-rating-carousel.md C2 / C18 / C21) — PHP side of the SSR contract
// `carousel@1`: td_carousel() ALWAYS prints the element + the frame <td-carousel> adopts (viewport > track > slides, the
// JS-only controls, the live region), the PREDICTED pages and the controls layout of src/utils/carousel-model.js
// (controlsLayout table in test/ssr/carousel.fixtures.json — PHP parity). Slides are trusted HTML strings (raw-HTML hatch).
// test/ssr/fixtures/carousel.html must be fresh (`node test/ssr/build-carousel-fixture.mjs`).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { HAS_PHP, PHP_BIN, ROOT } from './php.mjs';
import { CAROUSEL_FIXTURES, CAROUSEL_FIXTURE_FILE, renderCarouselFixture } from '../ssr/ssr.mjs';
import { controlsLayout, predictedPages, CAROUSEL_LABELS } from '../../src/utils/carousel-model.js';

if (!HAS_PHP && process.env.TD_REQUIRE_PHP) throw new Error('TD_REQUIRE_PHP=1 but no php >= 8.0 CLI on PATH');
const opts = { skip: !HAS_PHP && 'php >= 8.0 CLI not found' };

/** PHP snippets in ONE process; td_carousel warnings counted per call (any other warning fails). */
function php(calls) {
  const code = `require ${JSON.stringify(join(ROOT, 'php/td.php'))}; TdComponents\\Td::configure('/', ${JSON.stringify(ROOT)});`
    + ' $calls = json_decode((string) file_get_contents(\'php://stdin\'), true, 64, JSON_THROW_ON_ERROR); $out = [];'
    + ' foreach ($calls as $c) { $w = 0; set_error_handler(function (int $no, string $msg) use (&$w): bool {'
    + " if ($no === E_USER_WARNING && str_starts_with($msg, 'td_carousel:')) { $w++; return true; } return false; });"
    + " $res = $c[0] === 'layout' ? td__carousel_layout(...$c[1]) : td_carousel(...$c[1]); restore_error_handler(); $out[] = ['out' => $res, 'warns' => $w]; }"
    + ' echo json_encode($out, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);';
  const r = spawnSync(PHP_BIN, ['-d', 'display_errors=stderr', '-r', code], { encoding: 'utf8', input: JSON.stringify(calls), maxBuffer: 16 * 1024 * 1024 });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.equal(r.stderr, '', r.stderr);
  return JSON.parse(r.stdout);
}
const one = (args) => php([['carousel', args]])[0];

function icon(name) {
  const r = spawnSync(PHP_BIN, ['-r', `require ${JSON.stringify(join(ROOT, 'php/td.php'))}; TdComponents\\Td::configure('/', ${JSON.stringify(ROOT)}); echo TdComponents\\Td::icon('${name}');`], { encoding: 'utf8' });
  return r.stdout;
}

describe('php/td.php — td_carousel (v0.50.0, contract carousel@1)', opts, () => {
  test('controlsLayout parity: the whole fixture table through PHP td__carousel_layout', () => {
    const out = php(CAROUSEL_FIXTURES.layout.map(([P, dots]) => ['layout', [P, dots]]));
    CAROUSEL_FIXTURES.layout.forEach(([P, dots, narrow, wide], i) => {
      const js = controlsLayout(P, dots);
      assert.deepEqual(out[i].out, [js.hidden, narrow, wide], `${P} ${dots}`);
      assert.deepEqual([js.narrow, js.wide], [narrow, wide], `JS ${P} ${dots}`);
    });
  });

  test('exact frame: host attributes (predicted pages / rows), slides wrapped with "n / total", controls + live region', () => {
    const { out, warns } = one([['<b>A</b>', '<i>B</i>', 'C'], { label: 'Nổi bật', per_view: 2 }]);
    assert.equal(warns, 0);
    const L = CAROUSEL_LABELS;
    const slide = (i, html) => `<div class="td-carousel__slide" role="group" aria-roledescription="${L.roleSlide}" aria-label="${i} / 3">${html}</div>`;
    assert.equal(out, '<td-carousel data-td-ssr="carousel@1" label="Nổi bật" per-view="2" data-td-pages="2" data-td-rows-narrow="1" '
      + 'data-td-rows-wide="inline" role="region" aria-roledescription="băng chuyền" aria-label="Nổi bật">'
      + `<div class="td-carousel__viewport"><div class="td-carousel__track">${slide(1, '<b>A</b>')}${slide(2, '<i>B</i>')}${slide(3, 'C')}</div></div>`
      + '<div class="td-carousel__controls" data-td-js-only>'
      + `<button type="button" class="td-carousel__btn" data-td-carousel="prev" aria-label="Mục trước">${icon('prev')}</button>`
      + '<span class="td-carousel__counter" aria-hidden="true"></span>'
      + `<button type="button" class="td-carousel__btn" data-td-carousel="next" aria-label="Mục tiếp theo">${icon('next')}</button>`
      + '<div class="td-carousel__dots" role="group" aria-label="Chọn trang"></div></div>'
      + '<p class="td-sr-only" role="status" aria-live="polite" aria-atomic="true"></p></td-carousel>');
  });

  test('every fixture case: predicted pages / rows = model (predictedPages + controlsLayout), hidden only for one page', () => {
    const out = php(CAROUSEL_FIXTURES.cases.map((c) => ['carousel', c.args]));
    CAROUSEL_FIXTURES.cases.forEach((c, i) => {
      const html = out[i].out;
      assert.equal(out[i].warns, 0, c.id);
      const n = c.args[0].length;
      const P = predictedPages(n, c.args[1].per_view ?? 1);
      const lay = controlsLayout(P, c.args[1].dots ?? 'auto');
      assert.equal(P, c.expect.pages, c.id);
      assert.deepEqual([lay.hidden, lay.narrow, lay.wide], [c.expect.hidden, c.expect.narrow, c.expect.wide], c.id);
      assert.ok(html.includes(` data-td-pages="${P}" data-td-rows-narrow="${lay.narrow}" data-td-rows-wide="${lay.wide}"`), c.id);
      assert.equal(html.includes('data-td-js-only hidden>'), lay.hidden, c.id);
      assert.equal((html.match(/class="td-carousel__slide"/g) || []).length, n, c.id);
      assert.ok(html.includes(`aria-label="${n} / ${n}">`), c.id);
    });
  });

  test('bad input: non-string slides dropped + ONE warning; missing label → default name + one warning', () => {
    const r = one([['<p>a</p>', 5, null, ['x'], '<p>b</p>'], { label: 'X' }]);
    assert.equal(r.warns, 1);
    assert.equal((r.out.match(/class="td-carousel__slide"/g) || []).length, 2);
    assert.ok(r.out.includes('aria-label="2 / 2"'));
    const nl = one([['a', 'b'], {}]);
    assert.equal(nl.warns, 1);
    assert.ok(nl.out.includes('aria-label="Băng chuyền">'));
    assert.ok(!nl.out.includes(' label='));
    const empty = one([[], { label: 'Trống' }]);
    assert.ok(empty.out.includes('data-td-pages="1"') && empty.out.includes('data-td-js-only hidden>'));
  });

  test('options: per_view 1–6 only, dots / step enums, text escaped, attrs cannot print owned names / on* / data-td-*', () => {
    const bad = [0, 7, '2.5', 'x', true, -1];
    const outs = php([...bad.map((pv) => ['carousel', [['a'], { label: 'L', per_view: pv }]]),
      ['carousel', [['a'], { label: 'L', per_view: '3' }]], ['carousel', [['a'], { label: 'L', dots: 'yes', step: 'page' }]]]);
    bad.forEach((pv, i) => assert.ok(!outs[i].out.includes('per-view='), String(pv)));
    assert.ok(outs[bad.length].out.includes('per-view="3"'));
    assert.ok(!outs[bad.length + 1].out.match(/ dots=| step=/));
    const r = one([['a', 'b'], { label: '<script>alert(1)</script>"', id: 'c"1', class: 'ok bad"cls', labels: { prev: 'X' },
      attrs: { onclick: 'x()', role: 'list', 'aria-label': 'y', 'data-td-ssr': 'p@1', 'data-list': 'home', style: 'color:red' } }]);
    assert.ok(r.out.includes('label="&lt;script&gt;alert(1)&lt;/script&gt;&quot;"'));
    assert.ok(r.out.includes('aria-label="&lt;script&gt;alert(1)&lt;/script&gt;&quot;"'));
    assert.ok(r.out.includes('id="c&quot;1"'));
    assert.ok(r.out.includes('class="ok"'));
    assert.ok(r.out.includes('data-list="home"'));
    assert.ok(!/onclick|role="list"|aria-label="y"|p@1|style=/.test(r.out), r.out);
    assert.ok(r.out.includes('aria-label="Mục trước"'), 'a labels option is ignored (R13)');
  });

  test('the generated fixture HTML is fresh (node test/ssr/build-carousel-fixture.mjs)', () => {
    assert.equal(readFileSync(CAROUSEL_FIXTURE_FILE, 'utf8'), renderCarouselFixture());
  });
});
