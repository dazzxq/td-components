// v0.51.0 (plan docs/internal/plans/v0.51.0-gallery-caption.md M2, QĐ 1-4, 7-10, 18) — PHP side of the gallery caption
// + length limits (contract still media-gallery@1, ADR 0021 addendum):
//   - td__media_caption / td__media_caption_value / td__media_text_count = normCaption / captionValue / limitCount
//     (test/ssr/media-text.cases.json) and td__media_limit_opt = parseLimit (test/ssr/media-limit.cases.json — read by
//     PHP from the file itself: JSON floats / huge ints must not pass through JS);
//   - td_media_gallery 'caption' (true | 'line' | 'multiline'; other → warning + line; no usage → warning + off),
//     'alt_maxlength' / 'caption_maxlength' (strict; invalid → ONE warning, off), the caption control (line input /
//     textarea with the leading LF), `[caption]` right after `[alt]`, the counter / error spans;
//   - nothing changes without the new options (the v0.50 markup).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { HAS_PHP, PHP_BIN, ROOT } from './php.mjs';

if (!HAS_PHP && process.env.TD_REQUIRE_PHP) throw new Error('TD_REQUIRE_PHP=1 but no php >= 8.0 CLI on PATH');
const opts = { skip: !HAS_PHP && 'php >= 8.0 CLI not found' };
const PERF_SLACK = process.env.TD_PERF_STRICT ? 1 : 20;
const unesc = (s) => String(s).replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&amp;/g, '&');

function php(body) {
  const code = `require ${JSON.stringify(join(ROOT, 'php/td.php'))}; TdComponents\\Td::configure('/', ${JSON.stringify(ROOT)});`
    + ' $W = []; set_error_handler(function (int $no, string $msg) use (&$W): bool {'
    + " if ($no === E_USER_WARNING && str_starts_with($msg, 'td_media_gallery:')) { $W[] = $msg; return true; } return false; });"
    + body;
  const r = spawnSync(PHP_BIN, ['-d', 'display_errors=stderr', '-d', 'log_errors=0', '-d', 'error_reporting=E_ALL', '-d', 'xdebug.mode=off', '-r', code], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, '', r.stderr);
  return JSON.parse(r.stdout);
}
function run(calls) {
  return php(` $calls = json_decode(${JSON.stringify(JSON.stringify(calls))}, true, 64, JSON_THROW_ON_ERROR); $out = [];`
    + ' foreach ($calls as $a) { $W = []; $html = td_media_gallery(...$a); $out[] = [\'html\' => $html, \'warns\' => $W]; }'
    + ' echo json_encode($out, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);');
}
const one = (...args) => run([args])[0];
const hostAttr = (html, name) => {
  const m = new RegExp(` ${name}(?:="([^"]*)")?[ >]`).exec(/^<td-media-gallery[^>]*>/.exec(html)[0]);
  return m ? (m[1] ?? true) : null;
};
const entries = (html) => [...html.matchAll(/<input([^>]*)>|<textarea([^>]*)>([\s\S]*?)<\/textarea>/g)]
  .map((m) => (m[1] != null ? { a: m[1], v: unesc(/ value="([^"]*)"/.exec(m[1])?.[1] ?? '') } : { a: m[2], v: unesc(m[3].replace(/^\n/, '')) }))
  .filter(({ a }) => / name="/.test(a) && !/ disabled/.test(a))
  .map(({ a, v }) => [unesc(/ name="([^"]*)"/.exec(a)[1]), v]);
const ITEMS = [{ id: 'm1', src: '/a.jpg', name: 'Ảnh 1', alt: 'Áo', caption: 'Dòng 1\nDòng 2' }, { id: 'm2', src: '/b.jpg' }];

describe('php/td.php — td_media_gallery caption + length limits (v0.51.0)', opts, () => {
  test('media-text.cases.json: td__media_caption / _value / td__media_text_count = the JS model', () => {
    const got = php(` $c = json_decode(file_get_contents(${JSON.stringify(join(ROOT, 'test/ssr/media-text.cases.json'))}), true, 64, JSON_THROW_ON_ERROR)['cases']; $o = [];`
      + ' foreach ($c as $x) { if (!empty($x[\'js_only\'])) { $o[] = null; continue; }'
      + ' $in = isset($x[\'php_hex\']) ? hex2bin($x[\'php_hex\']) : $x[\'input\']; $n = td__media_caption($in); $l = td__media_caption_value($n, \'line\');'
      + ' $o[] = [\'norm\' => $n, \'line\' => $l, \'multi\' => td__media_caption_value($n, \'multiline\'), \'count\' => isset($x[\'php_hex\']) ? null : td__media_text_count($in),'
      + ' \'countNorm\' => td__media_text_count($n), \'countLine\' => td__media_text_count($l)]; }'
      + ' echo json_encode($o, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);');
    const table = JSON.parse(readFileSync(join(ROOT, 'test/ssr/media-text.cases.json'), 'utf8')).cases;
    table.forEach((c, i) => {
      if (c.js_only) return;
      const g = got[i];
      const tag = c.php_hex ?? JSON.stringify(c.input);
      assert.equal(g.norm, c.norm, `norm ${tag}`);
      assert.equal(g.line, c.line, `line ${tag}`);
      assert.equal(g.multi, c.norm, `multi ${tag}`);
      if (!c.php_hex) assert.equal(g.count, c.count, `count ${tag}`);
      assert.equal(g.countNorm, c.countNorm, `countNorm ${tag}`);
      assert.equal(g.countLine, c.countLine, `countLine ${tag}`);
    });
    const cap = php(" echo json_encode([mb_strlen(td__media_caption(str_repeat('ả', 1100))), mb_strlen(td__media_caption(str_repeat('😀', 1001))),"
      + " td__media_caption(7), td__media_caption(null), td__media_caption(['x']), td__media_caption(str_repeat(\"\\0\", 1500) . str_repeat('x', 1000)) === str_repeat('x', 1000)]);");
    assert.deepEqual(cap, [1000, 1000, '', '', '', true]);
  });

  test('media-limit.cases.json: td__media_limit_opt = parseLimit (+ PHP-only ints, floats, bools, arrays, null)', () => {
    const got = php(` $c = json_decode(file_get_contents(${JSON.stringify(join(ROOT, 'test/ssr/media-limit.cases.json'))}), true, 64, JSON_THROW_ON_ERROR)['cases']; $o = [];`
      + ' foreach ($c as $x) { if (!empty($x[\'php_float\'])) { if (!is_float($x[\'input\'])) { throw new Exception(\'not a float\'); } }'
      + ' [$v, $w] = td__media_limit_opt($x[\'input\'], $x[\'ceiling\']); $o[] = [$v, $w]; } echo json_encode($o);');
    const table = JSON.parse(readFileSync(join(ROOT, 'test/ssr/media-limit.cases.json'), 'utf8')).cases;
    table.forEach((c, i) => {
      assert.deepEqual(got[i], [c.expect, c.warn], JSON.stringify(c.input));
    });
  });

  test('caption line: the input right after the alt label, [caption] after [alt], the raw caption in items, projected value', () => {
    const { html, warns } = one('g', ITEMS, { usage: true, caption: true });
    assert.deepEqual(warns, []);
    assert.equal(hostAttr(html, 'caption'), 'line');
    assert.ok(html.includes('<label class="td-media-gallery__alt-field"><span class="td-sr-only">Mô tả ảnh 1 (alt)</span>'
      + '<input type="text" class="td-field__control td-media-gallery__alt" maxlength="500" placeholder="Mô tả (alt)" name="g[0][alt]" value="Áo"></label>'
      + '<label class="td-media-gallery__caption-field"><span class="td-sr-only">Chú thích ảnh 1</span>'
      + '<input type="text" class="td-field__control td-media-gallery__caption" maxlength="1000" placeholder="Chú thích" name="g[0][caption]" value="Dòng 1 Dòng 2"></label>'
      + '<input type="hidden" class="td-media-gallery__crop" name="g[0][crop]" value="null">'), html);
    assert.ok(html.includes('placeholder="Chú thích" name="g[1][caption]"></label>'), html);
    assert.deepEqual(JSON.parse(unesc(hostAttr(html, 'items')))[0].caption, 'Dòng 1\nDòng 2', 'items keeps the raw caption');
    assert.equal(JSON.parse(unesc(hostAttr(html, 'items')))[1].caption, undefined, 'an empty caption is not printed in items');
    assert.deepEqual(entries(html).map(([k]) => k), ['g[0][id]', 'g[0][alt]', 'g[0][caption]', 'g[0][crop]', 'g[1][id]', 'g[1][alt]', 'g[1][caption]', 'g[1][crop]']);
    for (const v of [true, 'line']) assert.equal(one('g', ITEMS, { usage: true, caption: v }).html, html, String(v));
  });

  test('caption multiline: textarea + ONE leading LF; escaped text (no </textarea> break-out); parse_str of the no-JS form', () => {
    const items = [{ id: 'm1', caption: '\nx</textarea><script>alert(1)</script>\r\ny' }];
    const { html, warns } = one('g', items, { usage: true, caption: 'multiline' });
    assert.deepEqual(warns, []);
    assert.equal(hostAttr(html, 'caption'), 'multiline');
    assert.ok(html.includes('<textarea class="td-field__control td-media-gallery__caption" rows="2" maxlength="1000" placeholder="Chú thích" name="g[0][caption]">'
      + '\n\nx&lt;/textarea&gt;&lt;script&gt;alert(1)&lt;/script&gt;\ny</textarea>'), html);
    assert.ok(!/<script/.test(html));
    assert.deepEqual(entries(html)[2], ['g[0][caption]', '\nx</textarea><script>alert(1)</script>\ny']);
    const parsed = php(` parse_str(${JSON.stringify(entries(html).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&'))}, $p); echo json_encode($p, JSON_UNESCAPED_UNICODE);`);
    assert.deepEqual(parsed, { g: [{ id: 'm1', alt: '', caption: '\nx</textarea><script>alert(1)</script>\ny', crop: 'null' }] });
    const empty = one('g', [{ id: 'm1' }], { usage: true, caption: 'multiline' }).html;
    assert.ok(empty.includes('name="g[0][caption]"></textarea>'), empty);
  });

  test('caption without usage / an unknown mode: ONE warning without the value; off / line', () => {
    const [ref, rich, num] = run([
      ['g', [{ id: 'm1', caption: 'SECRET' }], { caption: true }],
      ['g', [{ id: 'm1', caption: 'SECRET' }], { usage: true, caption: 'rich' }],
      ['g', [{ id: 'm1' }], { usage: true, caption: 2 }],
    ]);
    assert.equal(ref.warns.length, 1);
    assert.ok(!ref.html.includes('caption') && !ref.warns[0].includes('SECRET'), ref.html);
    for (const r of [rich, num]) {
      assert.equal(r.warns.length, 1);
      assert.ok(!r.warns[0].includes('rich'), r.warns[0]);
      assert.equal(hostAttr(r.html, 'caption'), 'line');
      assert.ok(r.html.includes('<input type="text" class="td-field__control td-media-gallery__caption"'), r.html);
    }
    for (const off of [false, null]) {
      const r = one('g', [{ id: 'm1', caption: 'x' }], { usage: true, caption: off });
      assert.deepEqual(r.warns, []);
      assert.ok(!r.html.includes('caption'), r.html);
    }
  });

  test('alt_maxlength / caption_maxlength: counter from 80 %, limit / over states, the error + aria on the control', () => {
    const { html, warns } = one('l', [
      { id: 'm1', alt: '1234567', caption: 'abc' }, { id: 'm2', alt: '12345678', caption: 'abcd' },
      { id: 'm3', alt: '  0123456789  ', caption: 'abcde' }, { id: 'm4', alt: '0123456789A', caption: 'abcdef' },
    ], { id: 'lg', usage: true, caption: true, alt_maxlength: 10, caption_maxlength: 5 });
    assert.deepEqual(warns, []);
    assert.equal(hostAttr(html, 'alt-maxlength'), '10');
    assert.equal(hostAttr(html, 'caption-maxlength'), '5');
    const span = (i, f) => new RegExp(`<span class="td-media-gallery__counter" id="lg-${i}-${f}-count"([^>]*)>([^<]*)</span>`
      + `<span class="td-media-gallery__error" id="lg-${i}-${f}-error"([^>]*)>([^<]*)</span>`).exec(html);
    // alt 7/10 hidden; 8/10 shown; 10/10 (trimmed) limit; 11/10 over
    assert.deepEqual(span(0, 'alt').slice(1), [' hidden', '7/10', ' hidden', 'Mô tả (alt) tối đa 10 ký tự.']);
    assert.deepEqual(span(1, 'alt').slice(1), ['', '8/10', ' hidden', 'Mô tả (alt) tối đa 10 ký tự.']);
    assert.deepEqual(span(2, 'alt').slice(1), [' data-state="limit"', '10/10', ' hidden', 'Mô tả (alt) tối đa 10 ký tự.']);
    assert.deepEqual(span(3, 'alt').slice(1), [' data-state="over"', '11/10', '', 'Mô tả (alt) tối đa 10 ký tự.']);
    assert.deepEqual(span(0, 'caption').slice(1), [' hidden', '3/5', ' hidden', 'Chú thích tối đa 5 ký tự.']);
    assert.deepEqual(span(1, 'caption').slice(1), ['', '4/5', ' hidden', 'Chú thích tối đa 5 ký tự.']);
    assert.deepEqual(span(3, 'caption').slice(1), [' data-state="over"', '6/5', '', 'Chú thích tối đa 5 ký tự.']);
    assert.ok(html.includes('<input type="text" class="td-field__control td-media-gallery__alt" maxlength="500" placeholder="Mô tả (alt)" name="l[0][alt]" value="1234567"></label>'), 'below 80 %: no aria');
    assert.ok(html.includes('placeholder="Mô tả (alt)" aria-describedby="lg-1-alt-count" name="l[1][alt]"'), html);
    assert.ok(html.includes('placeholder="Mô tả (alt)" aria-describedby="lg-3-alt-count lg-3-alt-error" aria-invalid="true" name="l[3][alt]"'), html);
    assert.ok(html.includes('placeholder="Chú thích" aria-describedby="lg-3-caption-count lg-3-caption-error" aria-invalid="true" name="l[3][caption]" value="abcdef">'), html);
    // never cut: the no-JS form sends the over-long text as is (the server answers 422)
    assert.deepEqual(entries(html).filter(([k]) => k === 'l[3][alt]' || k === 'l[3][caption]'), [['l[3][alt]', '0123456789A'], ['l[3][caption]', 'abcdef']]);
  });

  test('limit options: strict, invalid → ONE warning each (never the value), off; prerequisites (usage / caption)', () => {
    const out = run([
      ['g', [{ id: 'm1' }], { usage: true, caption: true, alt_maxlength: '2.5e2' }],
      ['g', [{ id: 'm1' }], { usage: true, caption: true, caption_maxlength: '9999999' }],
      ['g', [{ id: 'm1' }], { usage: true, caption: true, alt_maxlength: true }],
      ['g', [{ id: 'm1' }], { caption_maxlength: 5, usage: true }],
      ['g', [{ id: 'm1' }], { alt_maxlength: 5 }],
      ['g', [{ id: 'm1' }], { usage: true, alt_maxlength: null, caption_maxlength: null }],
    ]);
    out.slice(0, 5).forEach((r, i) => {
      assert.equal(r.warns.length, 1, `case ${i}`);
      assert.ok(!/2\.5e2|9999999/.test(r.warns[0]), r.warns[0]);
      assert.ok(!/maxlength="|__counter|__error/.test(r.html.replace(/maxlength="(500|1000)"/g, '')), `case ${i}`);
    });
    assert.deepEqual(out[5].warns, []);
  });

  test('overflow / disabled: the caption control carries no name / is disabled (nothing submitted)', () => {
    const [over, dis] = run([
      ['g', [{ id: 'm1', caption: 'a' }, { id: 'm2' }], { usage: true, caption: 'multiline', max: 1 }],
      ['g', [{ id: 'm1', caption: 'a' }], { usage: true, caption: true, disabled: true }],
    ]);
    assert.ok(!/name="g\[/.test(over.html), over.html);
    assert.ok(over.html.includes('<textarea class="td-field__control td-media-gallery__caption" rows="2" maxlength="1000" placeholder="Chú thích">\na</textarea>'), over.html);
    assert.ok(dis.html.includes('placeholder="Chú thích" name="g[0][caption]" value="a" disabled>'), dis.html);
    assert.deepEqual(entries(dis.html), []);
  });

  test('without the new options the markup has no caption / counter / error part; multi-MB captions are bounded', () => {
    const { html } = one('g', ITEMS, { usage: true });
    assert.ok(!/caption|__counter|__error|aria-invalid/.test(html), html);
    const big = php(" $t = microtime(true); $h = td_media_gallery('g', [['id' => 'm1', 'caption' => str_repeat(\"é\\r\\n\", 2000000)]], ['usage' => true, 'caption' => 'multiline']);"
      + " echo json_encode(['len' => strlen($h), 'ms' => (microtime(true) - $t) * 1000]);");
    assert.ok(big.len < 20000, `${big.len} bytes`);
    assert.ok(big.ms < 1500 * PERF_SLACK, `${big.ms} ms`);
  });
});
