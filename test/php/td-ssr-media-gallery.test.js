// v0.43.0 (ADR 0012, ADR 0021, plan v0.43.0-media-gallery decisions 8, 14-15b, 19, M2) — PHP side of the SSR contract
// `media-gallery@1`:
//   - td_media_gallery(): ALWAYS the element + the exact tree <td-media-gallery> renders + the no-JS form parts (hidden
//     inputs per item, the alt input name / value) with the component's FormData shape (reference name[] / usage
//     name[i][…]; empty → one name=);
//   - td__media_gallery_items() = validateItems() of src/utils/media-field-model.js (GALLERY_CASES; PHP turns an int id
//     into its decimal string FIRST);
//   - fail closed (bad items / name ending []) and overflow (count > max): NO control carries a name + ONE
//     E_USER_WARNING that never contains a value;
//   - the no-JS FormData parsed by PHP itself (parse_str) has the shape a server reads.
// Shared fixtures: test/ssr/media-gallery.fixtures.json (also consumed by
// src/form/td-media-gallery.ssr.engines.browser-test.js through test/ssr/fixtures/media-gallery.html — this test fails
// when it is stale: `node test/ssr/build-media-gallery-fixture.mjs`).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { HAS_PHP, PHP_BIN, ROOT } from './php.mjs';
import { MEDIA_GALLERY_FIXTURES, MEDIA_GALLERY_FIXTURE_FILE, renderMediaGalleryFixture } from '../ssr/ssr.mjs';
import { GALLERY_CASES, GALLERY_MAX_ITEMS } from '../../src/utils/media-field-model.js';

if (!HAS_PHP && process.env.TD_REQUIRE_PHP) throw new Error('TD_REQUIRE_PHP=1 but no php >= 8.0 CLI on PATH');
const opts = { skip: !HAS_PHP && 'php >= 8.0 CLI not found' };

/** htmlspecialchars(ENT_QUOTES | ENT_SUBSTITUTE) as Td::e() prints it. */
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
const unesc = (s) => String(s).replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&amp;/g, '&');

/** PHP code run with every td_media_gallery warning counted (and kept: its text is checked). */
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

/** td_media_gallery calls in ONE php process (ids count from 1): [{ html, warns: string[] }]. */
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
/** The no-JS FormData of printed markup: named, not disabled inputs in tree order. */
const entries = (html) => [...html.matchAll(/<input([^>]*)>/g)].map((m) => m[1])
  .filter((a) => / name="/.test(a) && !/ disabled/.test(a))
  .map((a) => [unesc(/ name="([^"]*)"/.exec(a)[1]), unesc(/ value="([^"]*)"/.exec(a)?.[1] ?? '')]);
const icon = (name) => php(` echo json_encode(TdComponents\\Td::icon(${JSON.stringify(name)}));`);

describe('php/td.php — td_media_gallery (v0.43.0, contract media-gallery@1)', opts, () => {
  test('empty reference gallery: the exact tree + ONE hidden name= after the list', () => {
    const { html, warns } = one('gallery', [], { label: 'Ảnh sản phẩm', id: 'g1' });
    assert.deepEqual(warns, []);
    assert.equal(html, '<td-media-gallery data-td-ssr="media-gallery@1" id="g1" class="td-media-gallery" name="gallery" label="Ảnh sản phẩm">'
      + '<div class="td-media-gallery__head"><span class="td-media-gallery__label" id="g1-label">Ảnh sản phẩm</span>'
      + '<span class="td-media-gallery__count" id="g1-count">0 ảnh</span></div>'
      + '<ul class="td-media-gallery__list" role="list" aria-labelledby="g1-label" aria-describedby="g1-count"></ul>'
      + '<input type="hidden" class="td-media-gallery__value" name="gallery" value="">'
      + '<button type="button" class="td-media-gallery__add" data-state="empty" aria-haspopup="dialog">'
      + `<span class="td-media-gallery__icon" data-td-icon="image" aria-hidden="true">${icon('image')}</span>`
      + '<span class="td-media-gallery__prompt">Chọn ảnh</span></button>'
      + '<span class="td-sr-only td-media-gallery__status" role="status"></span>'
      + '<span class="td-sr-only td-media-gallery__sort-status" role="status"></span>'
      + '<span class="td-media-gallery__sort-help" id="g1-sort-help" hidden>Nhấn Space hoặc Enter để nhấc, phím mũi tên để di chuyển, Space hoặc Enter để thả, Escape để huỷ.</span>'
      + '</td-media-gallery>');
  });

  test('one item (reference): media (sizer, img, handle), bar (Gỡ), hidden value; names carry the position', () => {
    const { html } = one('images', [{ id: 'm1', src: '/a.jpg', name: 'anh-1.jpg' }], { id: 'g2', aspect_ratio: '4/3', max: 6 });
    const li = /<li [^]*<\/li>/.exec(html)[0];
    assert.equal(li, '<li class="td-media-gallery__item" data-kind="image"><div class="td-media-gallery__media">'
      + '<svg class="td-media-gallery__sizer" viewBox="0 0 4 3" aria-hidden="true" focusable="false"></svg>'
      + '<img class="td-media-gallery__img" src="/a.jpg" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">'
      + '<button type="button" class="td-sortable__handle td-media-gallery__handle" aria-label="Sắp xếp Ảnh 1 trên 1: anh-1.jpg" aria-describedby="g2-sort-help">'
      + `<span class="td-media-gallery__icon" data-td-icon="grip" aria-hidden="true">${icon('grip')}</span></button></div>`
      + '<div class="td-media-gallery__bar">'
      + '<button type="button" class="td-media-gallery__btn td-media-gallery__remove" aria-label="Gỡ Ảnh 1 trên 1: anh-1.jpg">'
      + `<span class="td-media-gallery__icon" data-td-icon="trash" aria-hidden="true">${icon('trash')}</span></button></div>`
      + '<input type="hidden" class="td-media-gallery__value" name="images[]" value="m1"></li>');
    assert.ok(html.includes('<span class="td-media-gallery__count" id="g2-count">1/6 ảnh</span>'), html);
    assert.ok(html.includes('<button type="button" class="td-media-gallery__add" data-state="filled" aria-haspopup="dialog">'
      + `<span class="td-media-gallery__icon" data-td-icon="plus" aria-hidden="true">${icon('plus')}</span><span class="td-media-gallery__prompt">Thêm ảnh</span></button>`), html);
    assert.equal(hostAttr(html, 'items'), esc('[{"id":"m1","src":"/a.jpg","name":"anh-1.jpg"}]'));
  });

  test('usage + croppable + focal + cover: alt label / input (name, value), crop button, cover badge, entries in order', () => {
    const c = MEDIA_GALLERY_FIXTURES.cases.find((x) => x.id === 'usage');
    const { html, warns } = one(...c.args);
    assert.deepEqual(warns, []);
    assert.ok(html.includes('<span class="td-media-gallery__cover">Ảnh bìa</span>'), html);
    assert.equal(html.split('td-media-gallery__cover"').length, 2, 'one cover badge (first item)');
    assert.ok(html.includes('aria-label="Gỡ Ảnh 1 trên 2: Ảnh 1, ảnh bìa"'), html);
    assert.ok(html.includes('<button type="button" class="td-media-gallery__btn td-media-gallery__crop-btn" aria-haspopup="dialog" aria-label="Cắt Ảnh 2 trên 2: Ảnh 2">'), html);
    assert.ok(html.includes('<label class="td-media-gallery__alt-field"><span class="td-sr-only">Mô tả ảnh 1 (alt)</span>'
      + '<input type="text" class="td-field__control td-media-gallery__alt" maxlength="500" placeholder="Mô tả (alt)" name="g[0][alt]" value="Áo thun trắng"></label>'), html);
    assert.ok(html.includes('placeholder="Mô tả (alt)" name="g[1][alt]"></label>'), html);
    assert.deepEqual(entries(html), c.expect.entries);
    for (const a of ['usage', 'croppable', 'focal-point', 'cover']) assert.equal(hostAttr(html, a), true, a);
    assert.equal(hostAttr(html, 'crop-ratio'), '1:1');
    assert.equal(hostAttr(html, 'min'), '1');
    assert.equal(hostAttr(html, 'max'), '4');
  });

  test('crop button hidden without a safe src or for a video / file; never without croppable + usage (one warning)', () => {
    const [noSrc, vid, plain, noUsage] = run([
      ['c', [{ id: 'm1' }], { usage: true, croppable: true }],
      ['c', [{ id: 'm4', kind: 'video', src: '/v.jpg' }], { usage: true, croppable: true }],
      ['c', [{ id: 'm1', src: '/a.jpg' }], { usage: true }],
      ['c', [{ id: 'm1', src: '/a.jpg' }], { croppable: true, focal_point: true }],
    ]);
    for (const r of [noSrc, vid]) assert.ok(/td-media-gallery__crop-btn" aria-haspopup="dialog" aria-label="[^"]*" hidden>/.test(r.html), r.html);
    assert.ok(!plain.html.includes('td-media-gallery__crop-btn'), plain.html);
    assert.ok(!noUsage.html.includes('td-media-gallery__crop') && hostAttr(noUsage.html, 'croppable') === null, noUsage.html);
    assert.equal(noUsage.warns.length, 1);
    assert.ok(vid.html.includes('<span class="td-media-gallery__badge">Video</span>'), vid.html);
  });

  test('kinds: video → poster + "Video" badge (never <video>); file → icon + name; no src → "Không có ảnh xem trước"', () => {
    const c = MEDIA_GALLERY_FIXTURES.cases.find((x) => x.id === 'kinds');
    const { html } = one(...c.args);
    assert.ok(!/<video|<iframe/.test(html), html);
    assert.ok(html.includes('<li class="td-media-gallery__item" data-kind="file">'), html);
    assert.ok(html.includes('<span class="td-media-gallery__name">tai-lieu.pdf</span>'), html);
    assert.ok(html.includes('<span class="td-media-gallery__name">Không có ảnh xem trước</span>'), html);
    assert.ok(html.includes('data-td-icon="file"'), html);
    assert.equal(hostAttr(html, 'accept-kind'), 'image video file');
  });

  test('GALLERY_CASES parity: td__media_gallery_items() = validateItems() (PHP: int ids → decimal strings first)', () => {
    const got = php(` $cases = json_decode(${JSON.stringify(JSON.stringify(GALLERY_CASES))}, true, 64, JSON_THROW_ON_ERROR); $out = [];`
      + ' foreach ($cases as $c) { $r = td__media_gallery_items($c[\'items\'], $c[\'max\'] ?? ' + GALLERY_MAX_ITEMS + ');'
      + ' $out[] = [\'reason\' => $r[\'reason\'], \'items\' => $r[\'items\']]; }'
      + ' echo json_encode($out, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);');
    GALLERY_CASES.forEach((c, i) => {
      const want = c.php ?? c.expect;
      assert.equal(got[i].reason, want.reason, c.id);
      if (want.ids) assert.deepEqual((got[i].items || []).map((x) => x.id), want.ids, c.id);
      if (want.items && !c.php) {
        const map = { src: 'src', previewAlt: 'name', kind: 'kind', alt: 'alt', cropRaw: 'crop', focalRaw: 'focal' };
        want.items.forEach((w, k) => {
          for (const [jsKey, v] of Object.entries(w)) {
            const pv = got[i].items[k][map[jsKey]];
            assert.equal(pv ?? (jsKey === 'cropRaw' || jsKey === 'focalRaw' ? null : ''), v, `${c.id} ${jsKey}`);
          }
        });
      }
    });
  });

  test('fail closed (bad items, name ending []): the broken tree, NO name anywhere, ONE warning without values', () => {
    const [dup, name, floatId, ceiling] = run([
      ['b', [{ id: 'secret-1' }, { id: 'secret-1' }], { label: 'L' }],
      ['x[]', [{ id: 'secret-2' }], {}],
      ['f', [{ id: 1.5 }], {}],
      ['c', Array.from({ length: 101 }, (_, i) => ({ id: `s${i}` })), {}],
    ]);
    for (const r of [dup, name, floatId, ceiling]) {
      assert.equal(r.warns.length, 1, r.html.slice(0, 200));
      assert.ok(!/ name="/.test(r.html.replace(/^<td-media-gallery[^>]*>/, '')), 'no named control');
      assert.ok(!/<input/.test(r.html), 'no input at all');
      assert.ok(r.html.includes('<span class="td-media-gallery__broken">Không đọc được danh sách ảnh</span>'), r.html);
      assert.ok(!r.warns[0].includes('secret') && !r.warns[0].includes('1.5'), r.warns[0]);
      // the element fails closed too: bad items → `[null]`; a bad name keeps the (valid) items, the name fails it
      assert.equal(hostAttr(r.html, 'items'), r === name ? esc('[{"id":"secret-2"}]') : '[null]');
    }
    assert.match(dup.warns[0], /duplicate/);
    assert.match(floatId.warns[0], /id/);
    assert.match(ceiling.warns[0], /101/);
  });

  test('overflow (count > max ≤ 100): every item printed, NO name, Add hidden, one warning with the counts only', () => {
    const c = MEDIA_GALLERY_FIXTURES.cases.find((x) => x.id === 'overflow');
    const { html, warns } = one(...c.args);
    assert.equal(warns.length, 1);
    assert.match(warns[0], /4 .*max 2/);
    assert.equal((html.match(/<li /g) || []).length, 4);
    assert.ok(!/<input[^>]* name="/.test(html), html);
    assert.equal((html.match(/<input type="hidden"/g) || []).length, 0);
    assert.ok(/class="td-media-gallery__add" data-state="filled" aria-haspopup="dialog" hidden>/.test(html), html);
    assert.ok(html.includes('>Vượt giới hạn: 4/2 ảnh</span>'), html);
  });

  test('max: clamped to 100, invalid → dropped (default 100, attribute absent); min clamped to max; full → Add hidden + "Đã đủ"', () => {
    const [big, bad, minBig, full] = run([
      ['a', [], { max: 500 }], ['a', [], { max: 'abc' }], ['a', [], { max: 3, min: 9 }],
      ...MEDIA_GALLERY_FIXTURES.cases.filter((x) => x.id === 'full').map((x) => x.args),
    ]);
    assert.equal(hostAttr(big.html, 'max'), '100');
    assert.equal(hostAttr(bad.html, 'max'), null);
    assert.equal(hostAttr(minBig.html, 'min'), '3');
    assert.ok(full.html.includes('>Đã đủ 3 ảnh</span>'), full.html);
    assert.ok(/class="td-media-gallery__add" data-state="filled" aria-haspopup="dialog" hidden>/.test(full.html), full.html);
  });

  test('disabled: every button, the alt and the hidden inputs disabled (no-JS submits nothing)', () => {
    const { html } = one('d', [{ id: 'm1', src: '/a.jpg' }, { id: 'm2' }], { disabled: true, usage: true, croppable: true });
    assert.equal((html.match(/<button[^>]* disabled>/g) || []).length, 2 * 3 + 1);
    assert.equal((html.match(/<input[^>]* disabled>/g) || []).length, 2 * 3);
    assert.deepEqual(entries(html), []);
  });

  test('ids: PHP ints → strings (0 → "0"); ids / names / alt escaped; the items attribute is JSON v1 of the normalised list', () => {
    const c = MEDIA_GALLERY_FIXTURES.cases.find((x) => x.id === 'int-ids');
    const { html } = one(...c.args);
    assert.deepEqual(entries(html), c.expect.entries);
    assert.equal(unesc(hostAttr(html, 'items')), '[{"id":"0"},{"id":"42"}]');
    const x = MEDIA_GALLERY_FIXTURES.cases.find((y) => y.id === 'xss');
    const xh = one(...x.args).html;
    assert.ok(!/<img src=x|<script|<b>|<i>/i.test(xh), xh);
    assert.deepEqual(entries(xh), x.expect.entries);
  });

  test('attrs: allowlisted on the host; owned names (any case) + data-td-* reserved; unsafe names dropped', () => {
    const c = MEDIA_GALLERY_FIXTURES.cases.find((x) => x.id === 'attrs');
    const { html } = one(...c.args);
    assert.ok(html.startsWith('<td-media-gallery data-td-ssr="media-gallery@1" id="mg-att" class="td-media-gallery a b" name="att" label="Attrs" data-x="1" title="Gợi ý">'), html);
    for (const bad of ['onclick', 'style=', 'data-td-z', 'items=', ' max=']) assert.ok(!html.includes(bad), bad);
  });

  test('the no-JS FormData as PHP parses it (parse_str): reference → list, usage → nested rows, empty → ""', () => {
    const cases = ['ref', 'usage', 'empty', 'int-ids'].map((id) => MEDIA_GALLERY_FIXTURES.cases.find((x) => x.id === id));
    const out = run(cases.map((c) => c.args));
    const bodies = out.map((r) => entries(r.html).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&'));
    const parsed = php(` $b = json_decode(${JSON.stringify(JSON.stringify(bodies))}, true); $o = [];`
      + ' foreach ($b as $s) { parse_str($s, $p); $o[] = $p; } echo json_encode($o, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);');
    assert.deepEqual(parsed[0], { images: ['m1', 'm2', 'm3'] });
    assert.deepEqual(parsed[1], { g: [
      { id: 'm1', alt: 'Áo thun trắng', crop: '{"v":1,"x":0.1,"y":0,"width":0.5,"height":1}', focal: '{"v":1,"x":0.25,"y":0.5}' },
      { id: 'm2', alt: '', crop: '{"v":1,"x":0,"y":0,"width":1,"height":0.5}', focal: 'null' }] });
    assert.deepEqual(parsed[2], { gallery: '' });
    assert.deepEqual(parsed[3], { n: ['0', '42'] });
  });

  test('fixture cases: warnings + the no-JS FormData of every case = expect.entries', () => {
    const out = run(MEDIA_GALLERY_FIXTURES.cases.map((c) => c.args));
    MEDIA_GALLERY_FIXTURES.cases.forEach((c, i) => {
      assert.equal(out[i].warns.length, c.warns ? 1 : 0, c.id);
      assert.deepEqual(entries(out[i].html), c.expect.entries, c.id);
    });
  });

  test('never prints adapter endpoints, permissions or a serialized asset (unknown item / option keys ignored)', () => {
    const { html } = one('h', [{ id: 'm1', asset: { urls: { original: 'https://secret.example/o.jpg' } }, permissions: ['delete'] }],
      { endpoint: 'https://api.example/media' });
    assert.ok(!/api\.example|secret\.example|delete|permissions/.test(html), html);
  });

  test('test/ssr/fixtures/media-gallery.html (browser fixture) is up to date', () => {
    assert.equal(readFileSync(MEDIA_GALLERY_FIXTURE_FILE, 'utf8'), renderMediaGalleryFixture(), 'stale fixture: run `node test/ssr/build-media-gallery-fixture.mjs`');
  });
});
