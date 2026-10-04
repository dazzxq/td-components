// v0.32.0 (ADR 0012, plan v0.32.0-media-picker decisions 24-25, 29, M5) — PHP side of the SSR contract `media-field@1`:
//   - td_media_field(): ALWAYS the element + the exact tree <td-media-field> renders + the no-JS form parts (hidden
//     value / crop inputs, the alt input name) with the component's FormData shape (reference / usage);
//   - aspect ratio / crop / accept_kind parsing = src/utils/media-field-model.js (ASPECT_CASES / CROP_CASES / parseKinds);
//   - preview_src gate (Td::safeUrl, then no mailto: / tel:); escaping; owned names reserved in `attrs`; ids;
//     usage + `name[]` → nothing named + ONE E_USER_WARNING; invalid crop / ratio → dropped + ONE E_USER_WARNING.
// Shared fixtures: test/ssr/media-field.fixtures.json (also consumed by src/form/td-media-field.ssr.engines.browser-test.js
// through test/ssr/fixtures/media-field.html — this test fails when it is stale: `node test/ssr/build-media-field-fixture.mjs`).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { HAS_PHP, PHP_BIN, ROOT } from './php.mjs';
import { MEDIA_FIELD_FIXTURES, MEDIA_FIELD_FIXTURE_FILE, renderMediaFieldFixture } from '../ssr/ssr.mjs';
import { ASPECT_CASES, CROP_CASES, FOCAL_CASES, parseKinds, parseFocal, parseCropRatio } from '../../src/utils/media-field-model.js';

if (!HAS_PHP && process.env.TD_REQUIRE_PHP) throw new Error('TD_REQUIRE_PHP=1 but no php >= 8.0 CLI on PATH');
const opts = { skip: !HAS_PHP && 'php >= 8.0 CLI not found' };

/** htmlspecialchars(ENT_QUOTES | ENT_SUBSTITUTE) as Td::e() prints it. */
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

/**
 * td_media_field calls in ONE php process (ids count from 1), each with its own count of td_media_field warnings
 * (the harness forbids stderr). Any other warning / notice fails.
 * @param {any[][]} calls argument lists
 * @param {{ allowHttp?: boolean }} [o]
 * @returns {Array<{ html: string, warns: number }>}
 */
function run(calls, { allowHttp = false } = {}) {
  const code = `require ${JSON.stringify(join(ROOT, 'php/td.php'))}; TdComponents\\Td::configure('/', ${JSON.stringify(ROOT)});`
    + (allowHttp ? ' TdComponents\\Td::allowHttpLinks(true);' : '')
    + ` $calls = json_decode(${JSON.stringify(JSON.stringify(calls))}, true, 64, JSON_THROW_ON_ERROR); $out = [];`
    + ' foreach ($calls as $a) { $w = 0; set_error_handler(function (int $no, string $msg) use (&$w): bool {'
    + " if ($no === E_USER_WARNING && str_starts_with($msg, 'td_media_field:')) { $w++; return true; } return false; });"
    + ' $html = td_media_field(...$a); restore_error_handler(); $out[] = [\'html\' => $html, \'warns\' => $w]; }'
    + ' echo json_encode($out, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);';
  const r = spawnSync(PHP_BIN, ['-d', 'display_errors=stderr', '-d', 'log_errors=0', '-d', 'error_reporting=E_ALL', '-d', 'xdebug.mode=off', '-r', code], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, '', r.stderr);
  return JSON.parse(r.stdout);
}
const one = (...args) => run([args])[0];
const icon = (name) => {
  const code = `require ${JSON.stringify(join(ROOT, 'php/td.php'))}; TdComponents\\Td::configure('/', ${JSON.stringify(ROOT)}); echo TdComponents\\Td::icon(${JSON.stringify(name)});`;
  return spawnSync(PHP_BIN, ['-r', code], { encoding: 'utf8' }).stdout;
};
const hostAttr = (html, name) => {
  const m = new RegExp(` ${name}(?:="([^"]*)")?[ >]`).exec(/^<td-media-field[^>]*>/.exec(html)[0]);
  return m ? (m[1] ?? true) : null;
};

describe('php/td.php — td_media_field (v0.32.0, contract media-field@1)', opts, () => {
  test('empty reference field: the exact tree + one hidden input (name=)', () => {
    const { html, warns } = one('hero', null, { label: 'Ảnh đại diện', aspect_ratio: '3/2', required: true });
    assert.equal(warns, 0);
    assert.equal(html, '<td-media-field data-td-ssr="media-field@1" id="td-hero-1" class="td-media-field" name="hero" label="Ảnh đại diện" aspect-ratio="3/2" required>'
      + '<span class="td-media-field__label" id="td-hero-1-label">Ảnh đại diện<span class="td-field__required" aria-hidden="true"> *</span></span>'
      + '<div class="td-media-field__frame" data-state="empty" data-kind="image">'
      + '<svg class="td-media-field__sizer" viewBox="0 0 3 2" aria-hidden="true" focusable="false"></svg>'
      + '<button type="button" class="td-media-field__open" aria-haspopup="dialog" aria-labelledby="td-hero-1-label td-hero-1-state">'
      + `<span class="td-media-field__empty"><span class="td-media-field__icon" data-td-icon="image" aria-hidden="true">${icon('image')}</span>`
      + '<span class="td-media-field__prompt">Chọn ảnh</span><span class="td-media-field__ratio">3:2</span></span>'
      + '<span class="td-sr-only" id="td-hero-1-state">Chưa chọn</span></button></div>'
      + '<div class="td-media-field__actions" hidden>'
      + '<button type="button" class="td-btn td-btn--secondary td-btn--sm td-media-field__replace" aria-haspopup="dialog">Đổi ảnh</button>'
      + '<button type="button" class="td-btn td-btn--ghost td-btn--sm td-media-field__remove">Gỡ</button></div>'
      + '<input type="hidden" class="td-media-field__value" name="hero" value=""></td-media-field>');
  });

  test('usage, filled: name[id] / name[alt] / name[crop] in DOM order, image, help + error wiring', () => {
    const { html } = one('og', 'm2', {
      usage: true, alt: 'Mô tả', crop: { x: 0.1, y: 0, width: 0.5, height: 1 }, preview_src: 'https://cdn.example/og.jpg',
      preview_alt: 'og.jpg', helper_text: 'Gợi ý', error_text: 'Sai', id: 'og-field',
    });
    const crop = '{"v":1,"x":0.1,"y":0,"width":0.5,"height":1}';
    assert.equal(hostAttr(html, 'crop'), esc(crop));
    assert.equal(hostAttr(html, 'id'), 'og-field');
    assert.ok(html.includes('<img class="td-media-field__img" src="https://cdn.example/og.jpg" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">'), html);
    assert.ok(html.includes('aria-describedby="og-field-help og-field-error" aria-invalid="true" aria-errormessage="og-field-error">'), html);
    assert.ok(html.includes('<span class="td-sr-only" id="og-field-state">Đã chọn: og.jpg</span>'), html);
    const names = [...html.matchAll(/<input[^>]* name="([^"]*)"(?: value="([^"]*)")?/g)].map((m) => [m[1], m[2] ?? '']);
    assert.deepEqual(names, [['og[id]', 'm2'], ['og[alt]', 'Mô tả'], ['og[crop]', esc(crop)]]);
    assert.ok(html.endsWith('<span class="td-media-field__help" id="og-field-help">Gợi ý</span><span class="td-field-error" id="og-field-error" data-for="og-field">Sai</span></td-media-field>'), html);
    const empty = one('og2', null, { usage: true }).html;
    assert.ok(empty.includes('name="og2[crop]" value="null"'), empty);
    assert.ok(empty.includes('<input type="hidden" class="td-media-field__value" name="og2[id]" value="">'), empty);
  });

  test('aspect_ratio parity with parseAspectRatio() (ASPECT_CASES): viewBox + ratio text, invalid → dropped + one warning', () => {
    const out = run(ASPECT_CASES.map(([input]) => ['r', null, { aspect_ratio: input }]));
    ASPECT_CASES.forEach(([input, want], i) => {
      const { html, warns } = out[i];
      if (want) {
        assert.ok(html.includes(`viewBox="0 0 ${want.w} ${want.h}"`), `${input}: ${html.slice(0, 400)}`);
        assert.ok(html.includes(`<span class="td-media-field__ratio">${want.text}</span>`), input);
        assert.equal(hostAttr(html, 'aspect-ratio'), esc(input), input);
        assert.equal(warns, 0, input);
      } else {
        assert.ok(!html.includes('td-media-field__sizer') && !html.includes('td-media-field__ratio'), input);
        assert.equal(hostAttr(html, 'aspect-ratio'), null, input);
        assert.equal(warns, input === '' ? 0 : 1, input);
      }
    });
  });

  test('crop parity with parseCrop() (CROP_CASES): valid JSON v1 printed as is; invalid → null + one warning', () => {
    const out = run(CROP_CASES.map(([input]) => ['c', 'm1', { usage: true, crop: input }]));
    CROP_CASES.forEach(([input, valid], i) => {
      const { html, warns } = out[i];
      assert.equal(hostAttr(html, 'crop'), valid ? esc(input) : null, input);
      assert.ok(html.includes(`name="c[crop]" value="${valid ? esc(input) : 'null'}"`), input);
      assert.equal(warns, valid || input === 'null' ? 0 : 1, input);
    });
  });

  test('crop as an array → JSON v1; out of range / extra key / non-number → null + one warning', () => {
    const out = run([
      ['c', 'm1', { usage: true, crop: { x: 0, y: 0.25, width: 1, height: 0.5 } }],
      ['c', 'm1', { usage: true, crop: { x: 0.6, y: 0, width: 0.5, height: 0.5 } }],
      ['c', 'm1', { usage: true, crop: { x: 0, y: 0, width: 1, height: 1, z: 1 } }],
      ['c', 'm1', { usage: true, crop: { x: '0', y: 0, width: 1, height: 1 } }],
      ['c', 'm1', { usage: true, crop: null }],
    ]);
    assert.equal(hostAttr(out[0].html, 'crop'), esc('{"v":1,"x":0,"y":0.25,"width":1,"height":0.5}'));
    assert.deepEqual(out.map((r) => r.warns), [0, 1, 1, 1, 0]);
    for (const r of out.slice(1)) assert.ok(r.html.includes('name="c[crop]" value="null"'));
  });

  test('accept_kind parity with parseKinds(): string / array, invalid → image; prompt, icon and replace text follow', () => {
    const inputs = ['video', 'VIDEO, image', ['file', 'x', 'file'], 'nope', ' file video '];
    const out = run(inputs.map((k) => ['k', null, { accept_kind: k }]));
    const prompts = { image: 'Chọn ảnh', video: 'Chọn video', file: 'Chọn file' };
    inputs.forEach((input, i) => {
      const kinds = parseKinds(input);
      const { html } = out[i];
      assert.equal(hostAttr(html, 'accept-kind'), kinds.join(' '), JSON.stringify(input));
      assert.ok(html.includes(`data-kind="${kinds[0]}"`) && html.includes(`data-td-icon="${kinds[0]}"`), JSON.stringify(input));
      assert.ok(html.includes(`<span class="td-media-field__prompt">${prompts[kinds[0]]}</span>`), JSON.stringify(input));
    });
    assert.equal(hostAttr(one('k', null, {}).html, 'accept-kind'), null);
  });

  test('kinds of a filled field: video → poster + "Video" badge (never <video>); file → icon + name; no preview → noPreview', () => {
    const [v, f, n] = run([
      ['v', 'm14', { kind: 'video', preview_src: '/p.jpg' }],
      ['f', 'm11', { kind: 'file', preview_src: '/p.jpg', preview_alt: 'a.pdf' }],
      ['n', 'm1', {}],
    ]).map((r) => r.html);
    assert.ok(v.includes('<img class="td-media-field__img" src="/p.jpg"') && v.includes('<span class="td-media-field__badge">Video</span>'), v);
    assert.ok(v.includes('>Đổi video</button>') && !/<video|<iframe/.test(v), v);
    assert.ok(!f.includes('<img') && f.includes('<span class="td-media-field__name">a.pdf</span>') && f.includes('data-td-icon="file"'), f);
    assert.ok(n.includes('<span class="td-media-field__name">Đã chọn (không có ảnh xem trước)</span>'), n);
    assert.ok(n.includes('>Đã chọn (không có ảnh xem trước)</span></button>'), n);
  });

  test('preview_src: javascript: / mailto: / tel: / data: / file: refused → no img, no attribute; https / relative ok; http only when allowed', () => {
    const bad = ['javascript:alert(1)', 'mailto:a@b.c', 'tel:+84', 'data:image/png;base64,AAAA', 'file:///etc/passwd', ' java\tscript:alert(1)', 'http://legacy.example/a.jpg'];
    const out = run(bad.map((src) => ['p', 'm1', { preview_src: src }]));
    bad.forEach((src, i) => {
      assert.ok(!out[i].html.includes('<img'), src);
      assert.equal(hostAttr(out[i].html, 'preview-src'), null, src);
    });
    const ok = run([['p', 'm1', { preview_src: '//cdn.example/a.jpg' }], ['p', 'm1', { preview_src: ' /media/a.jpg ' }]]);
    assert.ok(ok[0].html.includes('src="//cdn.example/a.jpg"'));
    assert.ok(ok[1].html.includes('src="/media/a.jpg"') && hostAttr(ok[1].html, 'preview-src') === '/media/a.jpg');
    const http = run([['p', 'm1', { preview_src: 'http://legacy.example/a.jpg' }]], { allowHttp: true })[0].html;
    assert.ok(http.includes('src="http://legacy.example/a.jpg"'), http);
  });

  test('usage + name ending in [] → nothing named, one warning; reference mode keeps it', () => {
    const [u, r] = run([['list[]', 'm1', { usage: true }], ['list[]', 'm1', {}]]);
    assert.equal(u.warns, 1);
    assert.ok(!/<input[^>]* name=/.test(u.html), u.html);
    assert.equal(hostAttr(u.html, 'name'), 'list[]');
    assert.equal(r.warns, 0);
    assert.ok(r.html.includes('<input type="hidden" class="td-media-field__value" name="list[]" value="m1">'), r.html);
  });

  test('disabled: buttons, alt and hidden inputs disabled (no-JS submits nothing)', () => {
    const { html } = one('d', 'm1', { disabled: true, usage: true });
    assert.equal((html.match(/<button[^>]* disabled>/g) || []).length, 3);
    assert.equal((html.match(/<input[^>]* disabled>/g) || []).length, 3);
  });

  test('attrs: allowlisted on the host; owned names (any case) + data-td-* reserved; unsafe names dropped', () => {
    const c = MEDIA_FIELD_FIXTURES.cases.find((x) => x.id === 'attrs');
    const { html } = one(...c.args);
    assert.ok(html.startsWith('<td-media-field data-td-ssr="media-field@1" id="mf-att" class="td-media-field a b" name="att" data-x="1" title="Gợi ý">'), html);
    for (const bad of ['onclick', 'style=', 'evil', 'data-td-z']) assert.ok(!html.includes(bad), bad);
  });

  test('never prints adapter endpoints, permissions or a serialized asset (unknown options ignored)', () => {
    const { html } = one('h', 'm1', { endpoint: 'https://api.example/media', permissions: ['delete'], asset: { id: 'm1', urls: { original: 'https://secret.example/o.jpg' } } });
    assert.ok(!/api\.example|secret\.example|delete|permissions/.test(html), html);
  });

  test('escaping: every value is escaped (XSS case)', () => {
    const c = MEDIA_FIELD_FIXTURES.cases.find((x) => x.id === 'xss');
    const { html } = one(...c.args);
    assert.ok(html.includes(`name="${esc('x"y')}"`) && html.includes(`value="${esc('id"<1>')}"`), html);
    assert.ok(html.includes(`>${esc('<img src=x onerror=alert(1)>')}</span>`), html);
    assert.ok(html.includes(`>${esc('<b>p</b>')}</span>`) || !html.includes('td-media-field__prompt'), html);
    assert.ok(html.includes(`>${esc('<script>alert(1)</script>')}</span>`), html);
    assert.ok(!/<img src=x|<b>|<i>|<script/i.test(html), html);
  });

  test('fixture cases: the no-JS FormData shape of every case (hidden inputs + alt) = expect.entries', () => {
    const out = run(MEDIA_FIELD_FIXTURES.cases.map((c) => c.args));
    MEDIA_FIELD_FIXTURES.cases.forEach((c, i) => {
      const { html, warns } = out[i];
      assert.equal(warns, c.warns ?? 0, c.id);
      const inputs = [...html.matchAll(/<input([^>]*)>/g)].map((m) => m[1]);
      const entries = inputs.filter((a) => / name="/.test(a) && !/ disabled/.test(a)).map((a) => {
        const name = /name="([^"]*)"/.exec(a)[1];
        const value = /value="([^"]*)"/.exec(a)?.[1] ?? '';
        return [name, value];
      });
      assert.deepEqual(entries, c.expect.entries.map(([k, v]) => [esc(k), esc(v)]), c.id);
    });
  });

  test('test/ssr/fixtures/media-field.html (browser fixture) is up to date', () => {
    assert.equal(readFileSync(MEDIA_FIELD_FIXTURE_FILE, 'utf8'), renderMediaFieldFixture(), 'stale fixture: run `node test/ssr/build-media-field-fixture.mjs`');
  });

  test('impl review #5: no mbstring / iconv calls anywhere in php/td.php (plain PHP ≥ 8.0)', () => {
    const src = readFileSync(join(ROOT, 'php/td.php'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*(\/\/|#).*$/gm, '');
    assert.equal(/\b(mb_[a-z_]+|iconv[a-z_]*)\s*\(/.test(src), false);
  });

  test('impl review #5: alt truncated to 500 code points with UTF-8 PCRE (astral chars intact)', () => {
    const { html } = one('og', 'a1', { usage: true, alt: '😀'.repeat(600) });
    const alt = /class="td-field__control td-media-field__alt"[^>]* value="([^"]*)"/.exec(html) || /td-media-field__alt[^>]*value="([^"]*)"/.exec(html);
    assert.ok(alt, html);
    assert.equal([...alt[1]].length, 500);
  });

  test('v0.35 golden: every v0.34 fixture case prints byte-identical markup (sha256 of the case HTML)', () => {
    // computed from test/ssr/fixtures/media-field.html at v0.34.0 (0702b2e) — the v0.35 options are opt-in
    const GOLDEN = {
      free: 'f3ef18fb75acc155', 'ref-empty': 'edd2210dbc201da5', 'ref-filled': 'af82cdbc7389d620', 'usage-full': '5e8701d63d865fa5',
      'usage-empty': '243892c3e54bc710', contain: '7042fe109a6f3aa2', video: '6e7eaf8218c2dbdb', file: '9f1241032c04ff3d',
      disabled: '53633ad6a40820bd', 'required-error': '0a2429bd5a177e61', 'unsafe-src': '2fac2b22a3163944',
      'array-usage': 'b19ed352800479ff', attrs: 'ee523e9f1292784c', xss: '9b16273f56f87cd6',
    };
    const html = readFileSync(MEDIA_FIELD_FIXTURE_FILE, 'utf8');
    const got = {};
    for (const m of html.matchAll(/<form class="ssr-case" data-case="([^"]+)"[^>]*>(.*)<\/form>\n/g)) {
      got[m[1]] = createHash('sha256').update(m[2]).digest('hex').slice(0, 16);
    }
    for (const [id, h] of Object.entries(GOLDEN)) assert.equal(got[id], h, id);
  });

  test('v0.35 focal parity with parseFocal() (FOCAL_CASES): valid JSON v1 printed + submitted as is; invalid → null + one warning', () => {
    const out = run(FOCAL_CASES.map(([input]) => ['f', 'm1', { usage: true, focal_point: true, focal: input }]));
    FOCAL_CASES.forEach(([input, valid], i) => {
      assert.equal(!!parseFocal(input), valid, `JS ${input}`);
      const { html, warns } = out[i];
      assert.equal(hostAttr(html, 'focal'), valid ? esc(input) : null, input);
      assert.ok(html.includes(`<input type="hidden" class="td-media-field__focal" name="f[focal]" value="${valid ? esc(input) : 'null'}">`), input);
      assert.equal(warns, valid || input === 'null' || input === '' ? 0 : 1, input);
    });
  });

  test('v0.35 focal as an array → JSON v1; out of range / extra key / non-number → null + one warning', () => {
    const out = run([
      ['f', 'm1', { usage: true, focal_point: true, focal: { x: 0.25, y: 1 } }],
      ['f', 'm1', { usage: true, focal_point: true, focal: { x: 1.5, y: 0 } }],
      ['f', 'm1', { usage: true, focal_point: true, focal: { x: 0, y: 0, z: 1 } }],
      ['f', 'm1', { usage: true, focal_point: true, focal: { x: '0', y: 0 } }],
      ['f', 'm1', { usage: true, focal_point: true }],
    ]);
    assert.equal(hostAttr(out[0].html, 'focal'), esc('{"v":1,"x":0.25,"y":1}'));
    assert.deepEqual(out.map((r) => r.warns), [0, 1, 1, 1, 0]);
    for (const r of out.slice(1)) assert.ok(r.html.includes('name="f[focal]" value="null"'), r.html);
  });

  test('v0.35 FormData order id, alt, crop, focal; without focal_point exactly the v0.34 three entries (focal attr kept)', () => {
    const [withF, without] = run([
      ['o', 'm2', { usage: true, focal_point: true, focal: '{"v":1,"x":0.5,"y":0.5}', alt: 'A' }],
      ['o', 'm2', { usage: true, focal: '{"v":1,"x":0.5,"y":0.5}', alt: 'A' }],
    ]);
    const names = (html) => [...html.matchAll(/<input[^>]* name="([^"]*)"/g)].map((m) => m[1]);
    assert.deepEqual(names(withF.html), ['o[id]', 'o[alt]', 'o[crop]', 'o[focal]']);
    assert.deepEqual(names(without.html), ['o[id]', 'o[alt]', 'o[crop]']);
    assert.equal(hostAttr(withF.html, 'focal-point'), true);
    assert.equal(hostAttr(without.html, 'focal-point'), null);
  });

  test('v0.35 croppable: "Cắt ảnh" between Đổi and Gỡ + the status region; hidden unless an image with preview_src; disabled', () => {
    const [shown, noSrc, empty, video, dis, plain] = run([
      ['c', 'm1', { usage: true, croppable: true, preview_src: '/a.jpg' }],
      ['c', 'm1', { usage: true, croppable: true }],
      ['c', null, { usage: true, croppable: true }],
      ['c', 'm4', { usage: true, croppable: true, kind: 'video', preview_src: '/a.jpg' }],
      ['c', 'm1', { usage: true, croppable: true, preview_src: '/a.jpg', disabled: true }],
      ['c', 'm1', { usage: true, preview_src: '/a.jpg' }],
    ]).map((r) => r.html);
    const btn = '<button type="button" class="td-btn td-btn--secondary td-btn--sm td-media-field__crop-btn" aria-haspopup="dialog"';
    assert.ok(shown.includes(`aria-haspopup="dialog">Đổi ảnh</button>${btn}>Cắt ảnh</button><button type="button" class="td-btn td-btn--ghost td-btn--sm td-media-field__remove">Gỡ</button></div><span class="td-media-field__status" role="status"></span>`), shown);
    assert.equal(hostAttr(shown, 'croppable'), true);
    for (const h of [noSrc, empty, video]) assert.ok(h.includes(`${btn} hidden>Cắt ảnh</button>`), h);
    assert.ok(dis.includes(`${btn} disabled>Cắt ảnh</button>`), dis);
    assert.ok(!plain.includes('crop-btn') && !plain.includes('td-media-field__status') && hostAttr(plain, 'croppable') === null, plain);
  });

  test('v0.35 crop_ratio parity with parseCropRatio(): free / ratios printed as given; invalid → dropped + one warning', () => {
    const inputs = ['free', ' FREE ', '16:9', '1.91', '3/2', 'abc', '0', '1e9', ''];
    const out = run(inputs.map((r) => ['r', 'm1', { usage: true, croppable: true, crop_ratio: r }]));
    inputs.forEach((input, i) => {
      const valid = parseCropRatio(input) !== null;
      assert.equal(hostAttr(out[i].html, 'crop-ratio'), valid ? esc(input) : null, input);
      assert.equal(out[i].warns, valid || input === '' ? 0 : 1, input);
    });
  });

  test('v0.35 without usage: croppable / crop_ratio / focal_point / focal dropped (no button, no focal input) + ONE warning', () => {
    const [a, b, c] = run([
      ['n', 'm1', { croppable: true, focal_point: true, focal: { x: 0.5, y: 0.5 }, crop_ratio: '3/2', preview_src: '/a.jpg' }],
      ['n', 'm1', { focal_point: true }],
      ['n', 'm1', { croppable: false, focal_point: false, crop_ratio: '', focal: null }],
    ]);
    assert.equal(a.warns, 1);
    assert.equal(b.warns, 1);
    assert.equal(c.warns, 0);
    for (const r of [a, b, c]) {
      assert.ok(!/crop-btn|td-media-field__focal|td-media-field__status|croppable|focal|crop-ratio/.test(r.html), r.html);
      assert.ok(r.html.includes('<input type="hidden" class="td-media-field__value" name="n" value="m1">'), r.html);
    }
  });

  test('v0.35 owned names reserved in attrs: croppable / crop-ratio / focal-point / focal', () => {
    const { html } = one('a', 'm1', { attrs: { croppable: '', 'crop-ratio': '1', 'focal-point': '', focal: 'x', title: 't' } });
    assert.ok(!/croppable|crop-ratio|focal/.test(html), html);
    assert.equal(hostAttr(html, 'title'), 't');
  });

  test('impl review #5: $assetId accepts only string / int; float / bool / array → ignored + one bounded warning, never coerced', () => {
    const out = run([['h', 12, {}], ['h', 'x9', {}], ['h', 12.5, {}], ['h', true, {}], ['h', ['m1'], {}], ['h', null, {}]]);
    assert.equal(hostAttr(out[0].html, 'value'), '12');
    assert.equal(hostAttr(out[1].html, 'value'), 'x9');
    for (const i of [2, 3, 4]) {
      assert.equal(out[i].warns, 1, String(i));
      assert.equal(hostAttr(out[i].html, 'value'), null, String(i));
      assert.ok(/td-media-field__value" name="h" value=""/.test(out[i].html), String(i));
    }
    assert.equal(out[5].warns, 0);
  });
});
