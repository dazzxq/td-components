// v0.84.0 (plan v0.84.0-dropdown-rich, Decisions 11) — PHP side: td_dropdown prints <optgroup> and the rich
// per-option data-* (icon, icon-tone, description, status, status-tone, meta, keywords), each only when valid, escaped.
// v0.95.0 (plan v0.95.0-small-kit §4.2, K6): `image` → `data-image` through td__media_url (td_choice_group parity).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { HAS_PHP, PHP_BIN, ROOT, runPhp } from './php.mjs';

if (!HAS_PHP && process.env.TD_REQUIRE_PHP) throw new Error('TD_REQUIRE_PHP=1 but no php >= 8.0 CLI on PATH');
const opts = { skip: !HAS_PHP && 'php >= 8.0 CLI not found' };
const BASE = '/vendor/td/0.84.0';

function one(args) {
  const [r] = runPhp([{ fn: 'td_dropdown', args }], { baseUrl: BASE });
  assert.equal(r.error, undefined, `td_dropdown: ${r.message}`);
  return r.out;
}
const sel = (html) => html.slice(html.indexOf('<select'), html.indexOf('</select>') + 9);

describe('td_dropdown rich rows + groups (PHP)', opts, () => {
  test('optgroup: order, group disabled, ungrouped leaf stays in place', () => {
    const html = sel(one(['f', [
      { value: 'x', label: 'Loose' },
      { label: 'Cloud', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B', disabled: true }] },
      { label: 'Local', disabled: true, options: { c: 'C' } },
    ], '']));
    const iLoose = html.indexOf('value="x"'), iCloud = html.indexOf('<optgroup label="Cloud">'),
      iLocal = html.indexOf('<optgroup label="Local" disabled>');
    assert.ok(iLoose > 0 && iLoose < iCloud && iCloud < iLocal, html);
    assert.match(html, /<optgroup label="Cloud"><option value="a">A<\/option><option value="b" disabled>B<\/option><\/optgroup>/);
    assert.match(html, /<optgroup label="Local" disabled><option value="c">C<\/option><\/optgroup>/);
  });

  test('placeholder stays first, outside any group', () => {
    const html = sel(one(['f', [{ label: 'G', options: [{ value: 'a', label: 'A' }] }], '', { placeholder: 'Pick' }]));
    assert.match(html, /^<select[^>]*><option value="">Pick<\/option><optgroup label="G">/);
  });

  test('selected leaf inside a group', () => {
    const html = one(['f', [{ label: 'G', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] }], 'b']);
    assert.match(html, /<option value="b" selected>B<\/option>/);
    assert.ok(!/value="a" selected/.test(html));
  });

  test('each data-* printed when valid', () => {
    const html = one(['f', [{
      value: 'r', label: 'Repo', icon: 'folder', icon_tone: 'accent', description: 'Main repo',
      status: { text: 'Live', tone: 'success' }, meta: '12 GB', keywords: ['git', 'code', 7],
    }, { value: 'k', label: 'K', icon: 'check', iconTone: 'info', keywords: 'one two' }], '']);
    assert.match(html, /<option value="r" data-icon="folder" data-icon-tone="accent" data-description="Main repo" data-status="Live" data-status-tone="success" data-meta="12 GB" data-keywords="git code 7">Repo<\/option>/);
    assert.match(html, /<option value="k" data-icon="check" data-icon-tone="info" data-keywords="one two">K<\/option>/);
  });

  test('invalid icon name / tone dropped; empty status has no tone', () => {
    const html = one(['f', [
      { value: 'a', label: 'A', icon: 'Bad Name', icon_tone: 'accent' },
      { value: 'b', label: 'B', icon: 'folder', icon_tone: 'purple', status: { text: 'S', tone: 'rainbow' } },
      { value: 'c', label: 'C', status: { tone: 'success' }, description: '  ', meta: '', keywords: [] },
      { value: 'd', label: 'D', icon: '"><script>' },
    ], '']);
    assert.match(html, /<option value="a">A<\/option>/);
    assert.match(html, /<option value="b" data-icon="folder" data-status="S">B<\/option>/);
    assert.match(html, /<option value="c">C<\/option>/);
    assert.match(html, /<option value="d">D<\/option>/);
    assert.ok(!html.includes('data-icon-tone'));
  });

  test('escapes label, description, status, meta, keywords and group label', () => {
    const x = '<script>"\'&';
    const html = one(['f', [{ label: x, options: [{
      value: 'v', label: x, description: x, status: { text: x, tone: 'info' }, meta: x, keywords: [x],
    }] }], '']);
    assert.ok(!html.includes('<script>'), html);
    assert.match(html, /<optgroup label="&lt;script&gt;/);
    for (const a of ['data-description', 'data-status', 'data-meta', 'data-keywords']) {
      assert.match(html, new RegExp(`${a}="&lt;script&gt;`));
    }
  });

  test('plain call unchanged: no data-*, no optgroup', () => {
    const html = one(['f', { a: 'A', b: 'B' }, 'a']);
    assert.ok(!/data-(icon|description|status|meta|keywords)|optgroup/.test(html));
    assert.match(html, /<option value="a" selected>A<\/option><option value="b">B<\/option>/);
  });
});

/** td_dropdown calls in one php process, optionally with Td::allowHttpLinks(true) (the shared harness has no switch). */
function runDropdown(calls, { allowHttp = false } = {}) {
  const code = `require ${JSON.stringify(join(ROOT, 'php/td.php'))}; TdComponents\\Td::configure('/', ${JSON.stringify(ROOT)});`
    + (allowHttp ? ' TdComponents\\Td::allowHttpLinks(true);' : '')
    + ` $calls = json_decode(${JSON.stringify(JSON.stringify(calls))}, true, 64, JSON_THROW_ON_ERROR); $out = [];`
    + ' foreach ($calls as $a) { $out[] = td_dropdown(...$a); }'
    + ' echo json_encode($out, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);';
  const r = spawnSync(PHP_BIN, ['-d', 'display_errors=stderr', '-d', 'log_errors=0', '-d', 'error_reporting=E_ALL', '-d', 'xdebug.mode=off', '-r', code], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, '', r.stderr);
  return JSON.parse(r.stdout);
}

describe('td_dropdown option image (v0.95.0, PHP)', opts, () => {
  test('a valid image → data-image after data-swatch, before data-icon (fixed attribute order)', () => {
    const html = one(['f', [{
      value: 'a12', label: 'Lễ hội 2026', swatch: '#ff0000', image: 'https://cdn.example.com/albums/12/cover-96.webp',
      icon: 'folder', description: '48 ảnh',
    }], 'a12']);
    assert.match(html, /<option value="a12" selected data-swatch="#ff0000" data-image="https:\/\/cdn\.example\.com\/albums\/12\/cover-96\.webp" data-icon="folder" data-description="48 ảnh">Lễ hội 2026<\/option>/);
  });

  test('scheme-less / relative URLs are kept; javascript: / data: / blob: / non-strings are not printed', () => {
    const html = one(['f', [
      { value: 'a', label: 'A', image: '/media/a.webp' },
      { value: 'b', label: 'B', image: 'javascript:alert(1)' },
      { value: 'c', label: 'C', image: 'data:image/svg+xml,<svg onload=alert(1)>' },
      { value: 'd', label: 'D', image: 'blob:https://x.example/1' },
      { value: 'e', label: 'E', image: ['https://x.example/a.png'] },
      { value: 'f', label: 'F', image: '' },
    ], '']);
    assert.match(html, /<option value="a" data-image="\/media\/a\.webp">A<\/option>/);
    for (const v of ['b', 'c', 'd', 'e', 'f']) assert.match(html, new RegExp(`<option value="${v}">${v.toUpperCase()}</option>`));
  });

  test('http: only with Td::allowHttpLinks(true)', () => {
    const call = ['f', [{ value: 'a', label: 'A', image: 'http://cdn.example.com/a.png' }], ''];
    assert.ok(!runDropdown([call])[0].includes('data-image'));
    assert.match(runDropdown([call], { allowHttp: true })[0], /data-image="http:\/\/cdn\.example\.com\/a\.png"/);
  });

  test('escaped in the attribute: a quote-breaking URL never makes markup', () => {
    const html = one(['f', [{ value: 'a', label: 'A', image: 'https://x.example/a.png?"><svg onload=alert(1)>' }], '']);
    assert.ok(!html.includes('<svg'), html);
    assert.match(html, /data-image="https:\/\/x\.example\/a\.png\?&quot;&gt;&lt;svg onload=alert\(1\)&gt;"/);
  });

  test('same gate as td_choice_group — test/ssr/media-url.cases.json (php column), with and without allowHttpLinks', () => {
    const { cases } = JSON.parse(readFileSync(join(ROOT, 'test/ssr/media-url.cases.json'), 'utf8'));
    for (const allowHttp of [false, true]) {
      const list = cases.filter((c) => c.allowHttp === allowHttp);
      const out = runDropdown(list.map((c) => ['f', [{ value: 'a', label: 'A', image: c.url }], '']), { allowHttp });
      list.forEach((c, k) => assert.equal(out[k].includes('data-image="') ? 'keep' : 'refuse', c.php, `${c.url.slice(0, 50)} allowHttp=${allowHttp}`));
    }
  });

  test('element mode prints the same data-image; group leaves too', () => {
    const html = one(['f', [{ label: 'G', options: [{ value: 'a', label: 'A', image: 'https://x.example/a.png' }] }], '', { element: true }]);
    assert.match(html, /data-td-ssr="dropdown@1"/);
    assert.match(html, /<optgroup label="G"><option value="a" data-image="https:\/\/x\.example\/a\.png">A<\/option><\/optgroup>/);
  });

  test('no image → byte-identical option (no data-image)', () => {
    const html = one(['f', [{ value: 'a', label: 'A', swatch: '#00ff00', icon: 'check' }], '']);
    assert.match(html, /<option value="a" data-swatch="#00ff00" data-icon="check">A<\/option>/);
    assert.ok(!html.includes('data-image'));
  });
});

describe('td_dropdown option font (v0.97.0, PHP)', opts, () => {
  test('a font-family list → data-font after data-image, before data-icon (escaped)', () => {
    const html = one(['f', [{
      value: 'r', label: 'Roboto', image: 'https://x.example/r.png', font: ' "Roboto", sans-serif ', icon: 'check',
    }], 'r']);
    assert.match(html, /<option value="r" selected data-image="https:\/\/x\.example\/r\.png" data-font="&quot;Roboto&quot;, sans-serif" data-icon="check">Roboto<\/option>/);
  });

  test('unusable fonts are not printed: non-strings, empty, too long, ; { } < >, control chars, CSS-wide keywords', () => {
    const bad = [12, null, true, '', '   ', 'a'.repeat(201), 'Roboto; color: red', 'x}', 'a<b', 'A\nB',
      'inherit', 'INITIAL', 'unset', 'revert', 'revert-layer'];
    const html = one(['f', bad.map((font, k) => ({ value: `v${k}`, label: `L${k}`, font })), '']);
    assert.ok(!html.includes('data-font'), html);
  });

  test('a CSS escape (backslash) is kept: the browser parser decides', () => {
    assert.match(one(['f', [{ value: 'a', label: 'A', font: '\\52 oboto, serif' }], '']), /data-font="\\52 oboto, serif"/);
  });

  test('no font → byte-identical option (no data-font)', () => {
    const html = one(['f', [{ value: 'a', label: 'A' }], '']);
    assert.match(html, /<option value="a">A<\/option>/);
  });
});
