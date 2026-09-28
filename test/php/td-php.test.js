// PHP SSR adapter php/td.php (plan v0.17.0 E5): snapshots, escaping (XSS payloads), whitelists, import map, icons,
// fixture freshness. Runs the php CLI; skipped WITH A WARNING when php >= 8.1 is missing.
//   node --test test/php/            (TD_UPDATE_SNAPSHOTS=1 rewrites test/php/snapshots.json)
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { HAS_PHP, HERE, ROOT, PHP_BIN, runPhp, php1, renderFixture, FIXTURE_FILE } from './php.mjs';

if (!HAS_PHP) console.warn('\n⚠ td-php tests SKIPPED: php >= 8.1 CLI not found on PATH (set PHP_BIN to point at one).\n');
const opts = { skip: !HAS_PHP && 'php >= 8.1 CLI not found' };

// --- A tiny tokenizer for the adapter's output: it must be ONLY well-formed tags with double-quoted, fully escaped
// attribute values + text without raw < > (so no payload can open a tag or an attribute). ---
const TAG = /^<(\/?)([a-z][a-z0-9-]*)((?:\s+[A-Za-z][A-Za-z0-9:._-]*(?:="[^"<>]*")?)*)\s*(\/?)>/;
const ATTR = /\s+([A-Za-z][A-Za-z0-9:._-]*)(?:="([^"]*)")?/g;
function tokenize(html) {
  const tags = [];
  let rest = html;
  while (rest.length) {
    if (rest[0] === '<') {
      if (rest.startsWith('<!--')) {
        const end = rest.indexOf('-->');
        assert.ok(end > 0, 'unterminated comment');
        rest = rest.slice(end + 3);
        continue;
      }
      const m = TAG.exec(rest);
      assert.ok(m, `malformed tag at: ${rest.slice(0, 80)}`);
      const attrs = [];
      for (const a of m[3].matchAll(ATTR)) attrs.push([a[1].toLowerCase(), a[2] ?? null]);
      tags.push({ close: !!m[1], name: m[2], attrs });
      rest = rest.slice(m[0].length);
    } else {
      const next = rest.indexOf('<');
      const text = next < 0 ? rest : rest.slice(0, next);
      assert.ok(!text.includes('>'), `raw ">" in text: ${text}`);
      rest = next < 0 ? '' : rest.slice(next);
    }
  }
  return tags;
}
const ALLOWED_ATTRS = new Set(['class', 'type', 'id', 'name', 'value', 'disabled', 'aria-busy', 'aria-disabled',
  'aria-label', 'aria-hidden', 'data-tooltip', 'href', 'target', 'rel', 'download', 'tabindex', 'viewbox', 'fill',
  'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'focusable', 'role', 'd', 'cx', 'cy', 'r', 'x',
  'y', 'x1', 'y1', 'x2', 'y2', 'rx', 'ry', 'width', 'height', 'points', 'data-icon', 'for', 'placeholder',
  'required', 'aria-required', 'readonly', 'maxlength', 'minlength', 'pattern', 'min', 'max', 'step', 'autocomplete',
  'inputmode', 'enterkeyhint', 'autocapitalize', 'spellcheck', 'autofocus', 'aria-describedby', 'aria-invalid',
  'aria-errormessage', 'rows', 'data-for', 'hidden', 'label', 'searchable', 'allow-clear', 'selected', 'checked',
  'data-x', 'aria-pressed', 'nonce', 'data-safe']);
function assertSafe(html) {
  for (const t of tokenize(html)) {
    assert.ok(!['script', 'style', 'iframe', 'img', 'object', 'embed'].includes(t.name), `forbidden tag <${t.name}>`);
    for (const [name, value] of t.attrs) {
      assert.ok(ALLOWED_ATTRS.has(name), `unexpected attribute ${name}="${value}" on <${t.name}>`);
      if (name === 'href') assert.match(value, /^(https?:|mailto:|tel:|\/|#|[^:]*$)/i, `unsafe href ${value}`);
    }
  }
}

// --- Snapshots ---------------------------------------------------------------------------------------------------
const CASES = {
  'button primary + icon': ['td_button', 'Tải', { variant: 'primary', icon: 'download' }],
  'button default (secondary) submit name/value': ['td_button', 'Lưu', { type: 'submit', name: 'action', value: 'save' }],
  'button ghost sm xs→sm icon right': ['td_button', 'Bỏ', { variant: 'ghost', size: 'xs', icon: 'close', icon_position: 'right' }],
  'button loading': ['td_button', 'Đang lưu', { variant: 'primary', loading: true }],
  'button disabled full + tooltip + attrs': ['td_button', 'Khoá', { disabled: true, full_width: true, tooltip: 'Gợi ý', class: 'td-x app', attrs: { 'aria-pressed': 'false', 'data-x': '1' } }],
  'button icon-only aria_label': ['td_button', '', { icon: 'menu', aria_label: 'Mở menu' }],
  'button href link _blank download': ['td_button', 'Tải file', { href: '/f/a.pdf', target: '_blank', download: 'báo cáo.pdf', variant: 'primary' }],
  'button href disabled': ['td_button', 'Mở', { href: '/x', disabled: true }],
  'button href loading': ['td_button', 'Mở', { href: '/x', loading: true }],
  'link default ghost': ['td_link', 'Xem site', '/', { icon: 'external-link', target: '_blank' }],
  'field text + hint + error': ['td_field', 'email', 'x', { label: 'Email', type: 'email', hint: 'Email công ty', error: 'Sai', id: 'em' }],
  'field password autocomplete required': ['td_field', 'password', '', { label: 'Mật khẩu', type: 'password', autocomplete: 'current-password', required: true, id: 'pw' }],
  'field E1 hints': ['td_field', 'q', '', { inputmode: 'search', enterkeyhint: 'search', autocapitalize: 'off', spellcheck: false, autofocus: true, id: 'q' }],
  'field month + datetime-local': ['td_field', 'm', '2026-09', { type: 'month', id: 'mo' }],
  'field textarea rows maxlength size lg': ['td_field', 'bio', 'a\nb', { type: 'textarea', rows: 5, max_length: 200, size: 'lg', id: 'bio' }],
  'field number min/max/step readonly disabled': ['td_field', 'n', '3', { type: 'number', min: 1, max: 9, step: 2, readonly: true, disabled: true, id: 'n' }],
  'dropdown required + label': ['td_dropdown', 'city', { hn: 'Hà Nội', sg: 'Sài Gòn' }, 'sg', { label: 'Thành phố', required: true, id: 'city' }],
  'dropdown placeholder searchable auto + disabled option': ['td_dropdown', 'n', [...Array(9)].map((_, i) => ({ value: i, label: `Mục ${i}`, disabled: i === 2 })), null, { placeholder: '— chọn —', id: 'n' }],
  'toggle checked': ['td_toggle', 'wifi', true, 'Wifi', {}],
  'toggle lg value required disabled': ['td_toggle', 'x', false, '', { size: 'lg', value: '1', required: true, disabled: true, aria_label: 'Bật X', id: 'tx' }],
  'checkbox sm class input_attrs': ['td_checkbox', '', false, '', { size: 'sm', class: 'td-frame-check', input_attrs: { 'aria-label': 'Chọn khung 1', 'data-x': '1' } }],
  'checkbox checked value': ['td_checkbox', 'agree', true, 'Đồng ý', { value: 'yes' }],
  'icon m decorative': ['td_icon', 'check'],
  'icon l labelled': ['td_icon', 'info', 'l', 'Thông tin'],
  'icon alias x → close': ['td_icon', 'x', 's'],
  'icon unknown → empty': ['td_icon', 'no-such-icon'],
  'stylesheet tag + nonce': ['td_stylesheet_tag', 'abc123'],
};

describe('php/td.php', opts, () => {
  test('snapshots', () => {
    const names = Object.keys(CASES);
    const res = runPhp(names.map((n) => ({ fn: CASES[n][0], args: CASES[n].slice(1) })));
    const got = Object.fromEntries(names.map((n, i) => [n, res[i].error ? `THROWS ${res[i].error}` : res[i].out]));
    const file = join(HERE, 'snapshots.json');
    if (process.env.TD_UPDATE_SNAPSHOTS || !existsSync(file)) writeFileSync(file, `${JSON.stringify(got, null, 2)}\n`);
    const want = JSON.parse(readFileSync(file, 'utf8'));
    assert.deepEqual(got, want);
    for (const n of names) if (typeof got[n] === 'string') assertSafe(got[n]);
  });

  test('button: variants, sizes, native submit, 135 defaults', () => {
    assert.match(php1('td_button', 'A'), /^<button class="td-btn td-btn--secondary td-btn--md" type="button">/);
    assert.match(php1('td_button', 'A', { variant: 'ghost' }), /class="td-btn td-btn--ghost td-btn--md"/);
    assert.match(php1('td_button', 'A', { variant: 'evil"x', size: 'huge', type: 'image' }), /class="td-btn td-btn--secondary td-btn--md" type="button"/);
    const sub = php1('td_button', 'A', { type: 'submit', name: 'act', value: 'go' });
    assert.match(sub, /type="submit" name="act" value="go"/);
    const busy = php1('td_button', 'A', { loading: true });
    assert.match(busy, /disabled aria-busy="true" aria-disabled="true"/);
    assert.match(busy, /td-btn__spinner td-spinner td-spinner--sm" aria-hidden="true"><svg/, 'spinner visible');
  });

  test('button href → <a> (E3 link contract)', () => {
    const a = php1('td_button', 'Mở', { href: 'https://x.vn/a?b=1&c=2', target: '_blank' });
    assert.match(a, /^<a class="td-btn td-btn--secondary td-btn--md" href="https:\/\/x.vn\/a\?b=1&amp;c=2" target="_blank" rel="noopener noreferrer">/);
    assert.ok(!/ type=/.test(a), 'no type on a link');
    assert.match(a, /<\/a>$/);
    const dis = php1('td_button', 'Mở', { href: '/x', disabled: true });
    assert.ok(!dis.includes('href='));
    assert.match(dis, /aria-disabled="true" tabindex="-1"/);
    const load = php1('td_button', 'Mở', { href: '/x', loading: true });
    assert.ok(!load.includes('href='));
    assert.match(load, /aria-disabled="true" aria-busy="true" tabindex="0"/);
    assert.match(php1('td_button', 'x', { href: '/f', download: true }), / download>/);
    assert.match(php1('td_button', 'x', { href: '/f', download: '../../etc/pa:ss*wd?.txt' }), / download="etcpasswd\.txt"/);
    assert.ok(!php1('td_button', 'x', { href: '/f', target: 'javascript:x' }).includes('target='));
    assert.equal(php1('td_link', 'x', '/a', { target: '_self' }).slice(0, 60), '<a class="td-btn td-btn--ghost td-btn--md" href="/a" target=');
  });

  test('URL allowlist (href)', () => {
    const calls = [];
    const bad = ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' javascript:alert(1)', 'java\tscript:alert(1)',
      'java\nscript:x', '\x01javascript:x', 'data:text/html,<script>alert(1)</script>', 'vbscript:x', 'blob:https://a/b',
      'file:///etc/passwd', 'a:b/c', 'http://a.vn' /* no HTTPS→HTTP downgrade by default */];
    const good = ['https://a.vn/x', '/p?q=1#h', 'p/q', '../x', '#top', '?a=1', 'mailto:a@b.vn', 'tel:+8412',
      '//cdn.vn/a.js', '/a:b'];
    for (const u of [...bad, ...good]) calls.push({ fn: 'td_button', args: ['x', { href: u }] });
    const res = runPhp(calls);
    bad.forEach((u, i) => assert.ok(!res[i].out.includes('href='), `blocked: ${JSON.stringify(u)}`));
    good.forEach((u, i) => assert.ok(res[bad.length + i].out.includes('href="'), `allowed: ${u}`));
  });

  test('http: links only after Td::allowHttpLinks(); a rejected href renders a disabled link (review v0.17.0)', () => {
    const [def, , allowed] = runPhp([
      { fn: 'td_button', args: ['x', { href: 'http://legacy.vn/a' }] },
      { fn: 'Td::allowHttpLinks', args: [true] },
      { fn: 'td_button', args: ['x', { href: 'http://legacy.vn/a' }] },
    ]).map((r) => r.out);
    assert.ok(!def.includes('href='), def);
    assert.match(def, /role="link" aria-disabled="true" tabindex="-1"/);
    assert.match(allowed, /href="http:\/\/legacy\.vn\/a"/);
    const bad = php1('td_button', 'x', { href: 'javascript:alert(1)' });
    assert.ok(!bad.includes('href='));
    assert.match(bad, /role="link" aria-disabled="true" tabindex="-1"/);
  });

  test('attrs: positive allowlist — form-owner / submitter overrides are dropped (security review v0.17.0)', () => {
    const out = php1('td_button', 'Đăng nhập', { type: 'submit', attrs: {
      formmethod: 'get', formnovalidate: true, form: 'victim', formenctype: 'text/plain', formtarget: '_blank',
      dirname: 'x', popovertarget: 'p', commandfor: 'c', 'aria-label': 'ok', 'data-x': '1', tabindex: '-1', title: 't',
    } });
    const names = tokenize(out)[0].attrs.map(([n]) => n);
    for (const bad of ['formmethod', 'formnovalidate', 'form', 'formenctype', 'formtarget', 'dirname', 'popovertarget', 'commandfor']) {
      assert.ok(!names.includes(bad), `${bad} must be dropped: ${out}`);
    }
    for (const ok of ['aria-label', 'data-x', 'tabindex', 'title']) assert.ok(names.includes(ok), `${ok} kept: ${out}`);
    const field = php1('td_field', 'q', '', { attrs: { pattern: '\\d*', inputmode: 'numeric', minlength: '8', min: '1', max: '9', autofocus: 'autofocus', formaction: '/x' } });
    assert.ok(!field.includes('formaction'));
    for (const ok of ['pattern=', 'inputmode=', 'minlength=', 'min=', 'max=', 'autofocus']) assert.ok(field.includes(ok), `${ok} kept (135 uses it): ${field}`);
  });

  test('XSS payloads are escaped everywhere', () => {
    const P = '"><script>alert(1)</script><img src=x onerror=alert(2)>\'';
    const calls = [
      ['td_button', P, { name: P, value: P, id: P, tooltip: P, aria_label: P, class: P, icon: P }],
      ['td_button', P, { href: P, target: P, download: P }],
      ['td_button', 'x', { attrs: { onclick: 'alert(1)', ONMOUSEOVER: 'x', style: 'color:red', href: 'javascript:x', src: 'x', formaction: 'javascript:x', srcdoc: P, 'x" onfocus="a': '1', '"><b': '1', 'data-safe': P, class: 'evil', type: 'submit' } }],
      ['td_link', P, `javascript:${P}`, { class: P, attrs: { onclick: 'x' } }],
      ['td_field', P, P, { label: P, hint: P, error: P, placeholder: P, id: P, pattern: P, min: P, max: P, autocomplete: P, inputmode: P, class: P, attrs: { onfocus: 'x', 'data-safe': P, inputmode: P } }],
      ['td_field', P, P, { type: 'textarea', label: P, rows: P }],
      ['td_field', 'n', 'v', { type: P }],
      ['td_dropdown', P, { [P]: P, a: 'b' }, P, { label: P, placeholder: P, id: P, class: P, aria_label: P, attrs: { onchange: 'x', 'data-safe': P } }],
      ['td_toggle', P, true, P, { value: P, id: P, aria_label: P, class: P, attrs: { onclick: 'x' }, input_attrs: { onchange: 'x', 'data-safe': P } }],
      ['td_checkbox', P, true, P, { value: P, id: P, class: P, size: P, attrs: { style: 'x' }, input_attrs: { onclick: 'x' } }],
      ['td_icon', P, P, P],
      ['td_icon', 'info', 'm', P],
      ['td_stylesheet_tag', P],
    ];
    const res = runPhp(calls.map(([fn, ...args]) => ({ fn, args })));
    res.forEach((r, i) => {
      assert.ok(!r.error, `${calls[i][0]} threw ${r.error}: ${r.message}`);
      assertSafe(r.out);
      assert.ok(!/<script|<img/i.test(r.out), `payload leaked in ${calls[i][0]}: ${r.out}`);
    });
    // the escaped payload is present as text (not dropped silently) in labels
    assert.ok(res[0].out.includes('&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;'));
    assert.ok(res[0].out.includes('&#039;'));
    // attrs: blocked names never printed, allowed data-* kept (escaped), helper-owned names not duplicated
    const attrOut = res[2].out;
    const printed = tokenize(attrOut)[0].attrs.map(([n]) => n);
    assert.deepEqual(printed, ['class', 'type', 'data-safe'], attrOut);
    assert.match(attrOut, /type="button"/);
    assert.match(attrOut, / data-safe="&quot;&gt;&lt;script&gt;/);
    // unknown class tokens dropped (class stays within the allowlist)
    assert.match(res[9].out, /^<label class="td-checkbox td-checkbox--md">/);
  });

  test('E1 native attributes: whitelisted values, attrs passthrough goes through the whitelist', () => {
    const res = runPhp([
      { fn: 'td_field', args: ['a', '', { autocomplete: 'Current-Password', inputmode: 'numeric', enterkeyhint: 'send', autocapitalize: 'words', spellcheck: 'true', id: 'a' }] },
      { fn: 'td_field', args: ['b', '', { autocomplete: 'x";y', inputmode: 'keyboard', enterkeyhint: 'jump', autocapitalize: 'yes', spellcheck: 'maybe', id: 'b' }] },
      { fn: 'td_field', args: ['c', '', { attrs: { autofocus: 'autofocus', inputmode: 'numeric', autocomplete: 'bad<', pattern: '\\d*' }, id: 'c' }] },
      { fn: 'td_field', args: ['d', '', { inputmode: 'text', attrs: { inputmode: 'numeric' }, id: 'd' }] },
    ]).map((r) => r.out);
    assert.match(res[0], /autocomplete="current-password" inputmode="numeric" enterkeyhint="send" autocapitalize="words" spellcheck="true"/);
    for (const k of ['autocomplete', 'inputmode', 'enterkeyhint', 'autocapitalize', 'spellcheck']) assert.ok(!res[1].includes(`${k}=`), k);
    assert.match(res[2], / inputmode="numeric" autofocus/);
    assert.ok(!res[2].includes('autocomplete='));
    assert.match(res[2], /pattern="\\d\*"/);
    assert.match(res[3], /inputmode="text"/);
    assert.ok(!res[3].includes('inputmode="numeric"'), 'option wins over attrs');
  });

  test('td_dropdown: host + native select (E2 contract)', () => {
    const html = php1('td_dropdown', 'city', { hn: 'Hà Nội', sg: 'Sài Gòn', 7: 'Bảy' }, 7, { label: 'TP', id: 'c' });
    assert.match(html, /^<td-dropdown id="c" label="TP" searchable="false" allow-clear="false"><label class="td-field__label" for="c-select">TP<\/label><select id="c-select" name="city">/);
    assert.match(html, /<option value="7" selected>Bảy<\/option>/);
    assert.match(html, /<\/select><\/td-dropdown>$/);
    assert.equal((html.match(/ selected/g) || []).length, 1);
    assert.ok(!/<td-dropdown[^>]* (name|value|required)=/.test(html), 'name/value/required live on the select only');
    const ph = php1('td_dropdown', 'x', { a: 'A' }, '', { placeholder: 'Chọn', required: true });
    assert.match(ph, /<select id="dd-x-1-select" name="x" required><option value="">Chọn<\/option><option value="a">A<\/option>/);
    assert.ok(!ph.includes(' allow-clear='), 'placeholder = clearable');
    assert.ok(!ph.includes(' selected'));
    const many = php1('td_dropdown', 'x', Object.fromEntries([...Array(9)].map((_, i) => [`k${i}`, `v${i}`])), 'k1');
    assert.ok(!many.includes('searchable='), '> 8 options → searchable (default on)');
    assert.ok(php1('td_dropdown', 'x', { a: 'A' }, 'a', { searchable: true }).indexOf('searchable=') < 0);
  });

  test('toggle / checkbox contract', () => {
    const t = php1('td_toggle', 'w', true, 'Wifi');
    assert.match(t, /^<label class="td-switch td-switch--md"><input type="checkbox" role="switch" class="td-switch__input" name="w" checked>/);
    assert.ok(!t.includes('value='), 'default submits native "on" like <td-toggle>');
    assert.match(t, /td-switch__icon td-switch__icon--off"><svg class="td-icon td-icon--m" data-icon="close"/);
    const c = php1('td_checkbox', 'a', false, 'OK', { size: 'lg', value: '1', required: true });
    assert.match(c, /^<label class="td-checkbox td-checkbox--lg"><input type="checkbox" class="td-checkbox__input" name="a" value="1" required>/);
    assert.match(c, /<svg class="td-icon td-icon--m td-checkbox__svg" data-icon="check"/);
  });

  test('ids: explicit or unique per request', () => {
    const res = runPhp([
      { fn: 'td_field', args: ['name', ''] },
      { fn: 'td_field', args: ['name', ''] },
      { fn: 'td_dropdown', args: ['na me', {}, ''] },
    ]).map((r) => r.out);
    assert.match(res[0], /id="f-name-1"/);
    assert.match(res[1], /id="f-name-2"/);
    assert.match(res[2], /id="dd-name-3"/);
  });

  test('icons: full geometry from icons.json, registerIcons validation', () => {
    const icons = JSON.parse(readFileSync(join(ROOT, 'src/icons/icons.json'), 'utf8')).icons;
    const names = Object.keys(icons);
    const res = runPhp(names.map((n) => ({ fn: 'td_icon', args: [n] })));
    names.forEach((n, i) => {
      const svg = res[i].out;
      assert.match(svg, new RegExp(`^<svg class="td-icon td-icon--m" data-icon="${n}" viewBox="${icons[n].viewBox}"`));
      assert.equal((svg.match(/<(path|circle|rect|line|polyline|polygon|ellipse) /g) || []).length, icons[n].nodes.length, n);
    });
    const def = { viewBox: '0 0 24 24', paint: 'fill', nodes: [['circle', { cx: 12, cy: 12, r: 4 }]] };
    const out = runPhp([
      { fn: 'Td::registerIcons', args: [{ 'site-dot': def }] },
      { fn: 'td_icon', args: ['site-dot', 'l'] },
      { fn: 'Td::registerIcons', args: [{ check: def }] },
      { fn: 'Td::registerIcons', args: [{ 'site-dot': def }] },
      { fn: 'Td::registerIcons', args: [{ 'Bad Name': def }] },
      { fn: 'Td::registerIcons', args: [{ 'site-x': { nodes: [['script', {}]] } }] },
      { fn: 'Td::registerIcons', args: [{ 'site-y': { nodes: [['path', { d: 'M0 0" onload="x' }]] } }] },
      { fn: 'Td::registerIcons', args: [{ 'site-z': { nodes: [['path', { style: 'x' }]] } }] },
      { fn: 'Td::registerIcons', args: [{ 'site-v': { viewBox: '0 0 24 24"', nodes: [['path', { d: 'M0 0' }]] } }] },
      { fn: 'Td::siteIcons', args: [] },
      { fn: 'Td::hasIcon', args: ['site-dot'] },
    ]);
    assert.equal(out[1].out, '<svg class="td-icon td-icon--l" data-icon="site-dot" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="4"/></svg>');
    for (const i of [2, 3, 4, 5, 6, 7, 8]) assert.equal(out[i].error, 'InvalidArgumentException', `case ${i}`);
    assert.deepEqual(Object.keys(out[9].out), ['site-dot']);
    assert.equal(out[10].out, true);
  });

  test('import map: kit entries from package.json exports, extra merged after, collisions throw', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    const res = runPhp([
      { fn: 'td_import_map', args: [{ app: '/assets/app.js', dompurify: '/v/purify.es.js' }] },
      { fn: 'td_import_map', args: [{ '@dazzxq/td-components/button': '/evil.js' }] },
      { fn: 'td_import_map', args: [{ '@dazzxq/td-components': '/evil.js' }] },
      { fn: 'td_import_map', args: [{ '': '/x.js' }] },
      { fn: 'td_import_map', args: [[1, 2]] },
      { fn: 'Td::importMap', args: [] },
    ], { baseUrl: '/vendor/td/0.17.0/' });
    const map = res[0].out;
    const kit = Object.entries(pkg.exports).filter(([, t]) => typeof t === 'string' && t.endsWith('.js'));
    const keys = Object.keys(map);
    assert.deepEqual(keys.slice(0, kit.length), kit.map(([s]) => (s === '.' ? pkg.name : `${pkg.name}/${s.slice(2)}`)), 'kit first, exports order');
    assert.deepEqual(keys.slice(kit.length), ['app', 'dompurify'], 'extra after');
    for (const [s, t] of kit) assert.equal(map[s === '.' ? pkg.name : `${pkg.name}/${s.slice(2)}`], `/vendor/td/0.17.0/${t.slice(2)}`);
    assert.ok(!keys.some((k) => /td\.css|icons\.json|package\.json/.test(map[k])), 'only .js entries');
    for (const i of [1, 2, 3, 4]) assert.equal(res[i].error, 'InvalidArgumentException', `case ${i}`);
    assert.deepEqual(res[5].out, Object.fromEntries(Object.entries(map).slice(0, kit.length)));
  });

  test('import map tag: HEX-escaped JSON, nonce escaped, parses back to the same map', () => {
    const extra = { app: '/a.js?x=</script><script>alert(1)</script>&y=\'"' };
    const [tag, plain, noNonce, css] = runPhp([
      { fn: 'td_import_map_tag', args: [extra, 'n"><script>'] },
      { fn: 'td_import_map', args: [extra] },
      { fn: 'td_import_map_tag', args: [] },
      { fn: 'td_stylesheet_tag', args: ['"><x'] },
    ]).map((r) => r.out);
    const m = /^<script type="importmap" nonce="n&quot;&gt;&lt;script&gt;">(.*)<\/script>$/s.exec(tag);
    assert.ok(m, tag.slice(0, 120));
    assert.ok(!/<|>|&|'/.test(m[1]), 'HEX flags: no < > & \' inside the script');
    assert.ok(m[1].includes('/vendor/td/0.17.0/index.js'), 'slashes unescaped');
    assert.deepEqual(JSON.parse(m[1]), { imports: plain });
    assert.match(noNonce, /^<script type="importmap">\{"imports":\{/);
    assert.equal(css, '<link rel="stylesheet" href="/vendor/td/0.17.0/td.css" nonce="&quot;&gt;&lt;x">');
  });

  test('configure: required for import map / stylesheet, validates baseUrl', () => {
    const r = runPhp([{ fn: 'td_import_map', args: [] }, { fn: 'td_stylesheet_tag', args: [] }], {});
    assert.equal(r[0].error, 'LogicException');
    assert.equal(r[1].error, 'LogicException');
    const bad = runPhp([
      { fn: 'Td::configure', args: ['javascript:alert(1)', ROOT] },
      { fn: 'Td::configure', args: ['/ok', join(ROOT, 'no-such-dir')] },
      { fn: 'Td::configure', args: ['https://cdn.example/td/0.17.0', ROOT] },
      { fn: 'td_stylesheet_tag', args: [] },
    ], {});
    assert.equal(bad[0].error, 'InvalidArgumentException');
    assert.equal(bad[1].error, 'InvalidArgumentException');
    assert.equal(bad[3].out, '<link rel="stylesheet" href="https://cdn.example/td/0.17.0/td.css">');
  });

  test('global namespace: only td_* functions + TdComponents\\Td', () => {
    const r = spawnPhpCode(`$before = get_defined_functions()['user']; $cls = get_declared_classes();
      require ${JSON.stringify(join(ROOT, 'php/td.php'))};
      echo json_encode(['f' => array_values(array_diff(get_defined_functions()['user'], $before)), 'c' => array_values(array_diff(get_declared_classes(), $cls))]);`);
    const { f, c } = JSON.parse(r);
    assert.ok(f.length > 0);
    for (const fn of f) assert.match(fn, /^td_/);
    assert.deepEqual(c, ['TdComponents\\Td']);
  });

  test('PHP 8.1 syntax (php -l) and fixture test/php/fixtures/ssr.html is up to date', () => {
    const lint = spawnPhpArgs(['-l', join(ROOT, 'php/td.php')]);
    assert.match(lint, /No syntax errors/);
    assert.equal(readFileSync(FIXTURE_FILE, 'utf8'), renderFixture(), 'stale fixture: run `node test/php/build-fixture.mjs`');
  });
});

function spawnPhpArgs(args) {
  const r = spawnSync(PHP_BIN, args, { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  return r.stdout;
}
function spawnPhpCode(code) {
  return spawnPhpArgs(['-r', code]);
}
