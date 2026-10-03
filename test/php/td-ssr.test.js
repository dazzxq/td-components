// v0.25.0 (ADR 0012) — PHP side of the SSR contract `button@1`: td_button / td_link ELEMENT mode (opt-in per call
// `element` + global Td::configure(..., ['ssr_elements' => true])), the host ↔ control projection table, parity of the
// control with native mode, escaping; Td::modulePreloads(); td_badge icon. Shared fixtures: test/ssr/button.fixtures.json
// (also consumed by src/form/td-button.ssr.browser-test.js through test/ssr/fixtures/button.html — this test fails when
// that generated file is stale: `node test/ssr/build-button-fixture.mjs`).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HAS_PHP, ROOT, runPhp, php1 } from './php.mjs';
import { BUTTON_FIXTURES, BUTTON_FIXTURE_FILE, renderButtonFixture } from '../ssr/ssr.mjs';

if (!HAS_PHP && process.env.TD_REQUIRE_PHP) throw new Error('TD_REQUIRE_PHP=1 but no php >= 8.0 CLI on PATH');
const opts = { skip: !HAS_PHP && 'php >= 8.0 CLI not found' };
const BASE = '/vendor/td/0.25.0';

/** htmlspecialchars(ENT_QUOTES | ENT_SUBSTITUTE) as Td::e() prints it. */
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

/** Attributes of a start tag string (` a="b" c`) → Map (values still escaped; bare → true). */
function attrsOf(tagAttrs) {
  const out = new Map();
  for (const m of tagAttrs.matchAll(/\s+([a-z][a-z0-9:._-]*)(?:="([^"]*)")?/g)) {
    assert.ok(!out.has(m[1]), `duplicate attribute ${m[1]}`);
    out.set(m[1], m[2] ?? true);
  }
  return out;
}

/** Split element-mode output → { host: Map, inner: string }. */
function splitHost(html) {
  const m = /^<td-button((?:\s+[a-z][a-z0-9:._-]*(?:="[^"]*")?)*)>([\s\S]*)<\/td-button>$/.exec(html);
  assert.ok(m, `not a <td-button> host: ${html.slice(0, 120)}`);
  return { host: attrsOf(m[1]), inner: m[2] };
}

const FORWARDED = ['aria-pressed', 'aria-expanded', 'aria-haspopup', 'aria-controls'];

/** The case's options with the per-call mode applied (`call`: 'absent' | true | false). */
function withMode(args, call) {
  const a = structuredClone(args);
  const last = a.length - 1;
  if (call !== 'absent') a[last] = { ...a[last], element: call };
  return a;
}

/** Element-mode output of every fixture case (global cases under ssr_elements, the others with element: true). */
function renderCases(cases) {
  const local = cases.filter((c) => !c.global);
  const global = cases.filter((c) => c.global);
  const outLocal = runPhp(local.map((c) => ({ fn: c.fn, args: withMode(c.args, true) })), { baseUrl: BASE });
  const outGlobal = global.length
    ? runPhp(global.map((c) => ({ fn: c.fn, args: c.args })), { baseUrl: BASE, options: { ssr_elements: true } })
    : [];
  const map = new Map();
  local.forEach((c, i) => map.set(c.id, outLocal[i]));
  global.forEach((c, i) => map.set(c.id, outGlobal[i]));
  return map;
}

describe('php/td.php — SSR element mode (v0.25.0, ADR 0012)', opts, () => {
  test('mode: global ssr_elements off/on × per call absent/false/true; td_link bare never; native output unchanged', () => {
    for (const mc of BUTTON_FIXTURES.modeCases) {
      const legacy = runPhp([{ fn: mc.fn, args: mc.args }], { baseUrl: BASE })[0].out; // pre-0.25 call
      for (const mode of BUTTON_FIXTURES.modes) {
        const cfg = mode.global ? { baseUrl: BASE, options: { ssr_elements: true } } : { baseUrl: BASE };
        const [r] = runPhp([{ fn: mc.fn, args: withMode(mc.args, mode.call) }], cfg);
        assert.equal(r.error, undefined, `${mc.id} ${JSON.stringify(mode)}: ${r.message}`);
        const element = mode.element && !mc.neverElement;
        assert.equal(r.out.startsWith('<td-button'), element, `${mc.id} ${JSON.stringify(mode)}: ${r.out.slice(0, 80)}`);
        if (!element) assert.equal(r.out, legacy, `${mc.id} ${JSON.stringify(mode)}: native mode must print exactly the pre-0.25 markup`);
      }
    }
    // without configure() at all the default is native
    assert.ok(php1('td_button', 'x').startsWith('<button'));
  });

  test('Td::configure options: ssr_elements must be a bool, unknown keys throw, a later configure() resets it', () => {
    const res = runPhp([
      { fn: 'Td::configure', args: [BASE, ROOT, { ssr_elements: 'yes' }] },
      { fn: 'Td::configure', args: [BASE, ROOT, { ssr_element: true }] },
      { fn: 'Td::configure', args: [BASE, ROOT, { ssr_elements: true }] },
      { fn: 'Td::ssrElements', args: [] },
      { fn: 'td_button', args: ['a'] },
      { fn: 'Td::configure', args: [BASE, ROOT] },
      { fn: 'Td::ssrElements', args: [] },
      { fn: 'td_button', args: ['a'] },
    ], {});
    assert.equal(res[0].error, 'InvalidArgumentException');
    assert.equal(res[1].error, 'InvalidArgumentException');
    assert.equal(res[2].error, undefined, res[2].message);
    assert.equal(res[3].out, true);
    assert.ok(res[4].out.startsWith('<td-button data-td-ssr="button@1"'), res[4].out);
    assert.equal(res[6].out, false);
    assert.ok(res[7].out.startsWith('<button'), res[7].out);
  });

  test('projection table: host attributes per option (closed set), control = native control minus id / site class', () => {
    const cases = BUTTON_FIXTURES.cases;
    const out = renderCases(cases);
    const natives = runPhp(cases.map((c) => ({ fn: c.fn, args: withMode(c.args, false) })), { baseUrl: BASE });
    const known = new Map(runPhp(cases.map((c) => ({ fn: 'Td::hasIcon', args: [String(c.args.at(-1).icon ?? '')] })), { baseUrl: BASE })
      .map((r, i) => [cases[i].id, r.out]));
    const safeHref = new Map(runPhp(cases.map((c) => ({ fn: 'Td::safeUrl', args: [String(c.fn === 'td_link' ? c.args[1] : c.args.at(-1).href ?? '')] })), { baseUrl: BASE })
      .map((r, i) => [cases[i].id, r.out]));
    cases.forEach((c, i) => {
      const r = out.get(c.id);
      assert.equal(r.error, undefined, `${c.id}: ${r.message}`);
      const o = c.args.at(-1);
      const label = c.args[0];
      const isLink = c.fn === 'td_link' || o.href != null;
      const { host, inner } = splitHost(r.out);
      const expected = new Map([['data-td-ssr', 'button@1']]);
      const variants = ['primary', 'secondary', 'success', 'danger', 'info', 'warning', 'ghost'];
      expected.set('variant', variants.includes(o.variant) ? o.variant : (c.fn === 'td_link' ? 'ghost' : 'secondary'));
      expected.set('size', o.size === 'xs' ? 'sm' : (['sm', 'md', 'lg'].includes(o.size) ? o.size : 'md'));
      if (o.full_width) expected.set('full-width', true);
      const iconOk = !!o.icon && known.get(c.id);
      if (iconOk) expected.set('icon', esc(o.icon));
      if (iconOk && o.icon_position === 'right') expected.set('icon-position', 'right');
      if (label !== '') expected.set('label', esc(label));
      if (!isLink) {
        expected.set('type', ['button', 'submit', 'reset'].includes(o.type) ? o.type : 'button');
        if (o.name) expected.set('name', esc(o.name));
        if (o.value != null) expected.set('value', esc(o.value));
      }
      if (o.disabled) expected.set('disabled', true);
      if (o.loading) expected.set('loading', true);
      if (isLink) {
        expected.set('href', esc(safeHref.get(c.id)));
        if (['_blank', '_self', '_parent', '_top'].includes(o.target)) expected.set('target', o.target);
        if (o.download === true) expected.set('download', true);
        else if (typeof o.download === 'string') expected.set('download', esc(o.download));
      }
      const attrs = o.attrs || {};
      const ariaLabel = o.aria_label || attrs['aria-label'];
      if (ariaLabel) expected.set('aria-label', esc(ariaLabel));
      for (const a of FORWARDED) if (attrs[a] != null) expected.set(a, esc(attrs[a]));
      if (o.id) expected.set('id', esc(o.id));
      if (o.class) expected.set('class', esc(o.class));
      assert.deepEqual(Object.fromEntries(host), Object.fromEntries(expected), `${c.id}: host attributes`);

      // control: the native control with the HOST-only attributes moved out (id, site class) and the icon slot the
      // component would create (data-td-icon + data-td-icon-size="s")
      let native = natives[i].out;
      assert.ok(/^<(button|a)[ >]/.test(native), `${c.id}: native ${native.slice(0, 60)}`);
      if (o.id) native = native.replace(` id="${esc(o.id)}"`, '');
      if (o.class) native = native.replace(` ${esc(o.class)}"`, '"');
      if (iconOk) {
        native = native.replace('<span class="td-btn__icon" aria-hidden="true">',
          `<span class="td-btn__icon" data-td-icon="${esc(o.icon)}" data-td-icon-size="s" aria-hidden="true">`);
      }
      // the control's own start tag: same attribute SET (order may differ — owned names are printed first), minus
      // the `attrs` entries that collide with names the component owns (review round 1 IMPL-1: reserved in element
      // mode even when the owned value is false / null); everything after the start tag byte-identical
      const tagRe = /^<(button|a)((?:\s+[a-z][a-z0-9:._-]*(?:="[^"]*")?)*)>/;
      const [nTag, , nAttrs] = tagRe.exec(native);
      const [eTag, , eAttrs] = tagRe.exec(inner);
      const want = Object.fromEntries(attrsOf(nAttrs));
      for (const k of c.dropOnControl || []) delete want[k];
      assert.deepEqual(Object.fromEntries(attrsOf(eAttrs)), want, `${c.id}: control attributes`);
      assert.equal(inner.slice(eTag.length), native.slice(nTag.length), `${c.id}: control content`);
      assert.ok(!/<script|<img/i.test(r.out), `${c.id}: payload leaked`);
    });
  });

  test('escaping: every host value is escaped (XSS case)', () => {
    const c = BUTTON_FIXTURES.cases.find((x) => x.id === 'xss');
    const html = renderCases([c]).get('xss').out;
    assert.ok(html.includes(' label="&lt;img src=x onerror=alert(1)&gt;&quot;&#039;&amp;"'), html);
    assert.ok(html.includes(' aria-label="&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;"'), html);
    assert.ok(html.includes(' name="n&quot;x"') && html.includes(' value="&lt;v&gt;"'), html);
    assert.ok(!/<script|<img/i.test(html));
  });

  test('review round 1 IMPL-1: owned control names are reserved in element mode even when their value is false / null', () => {
    const res = runPhp([
      { fn: 'td_button', args: ['A', { element: true, disabled: false, attrs: { disabled: true, 'aria-busy': 'true', 'aria-disabled': 'true', type: 'reset', class: 'x', 'data-tooltip': 'y' } }] },
      { fn: 'td_button', args: ['A', { element: false, attrs: { disabled: true } }] }, // native mode unchanged
      { fn: 'td_link', args: ['L', '/l', { element: true, attrs: { 'aria-busy': 'true', 'aria-disabled': 'true', href: '/evil', tabindex: '4', role: 'button' } }] },
      { fn: 'td_link', args: ['L', '/l', { element: true, disabled: true, attrs: { tabindex: '4', role: 'button' } }] },
      { fn: 'td_button', args: ['A', { element: true, attrs: { 'aria-pressed': 'bogus', 'aria-expanded': 'true', 'aria-controls': '  ' } }] },
    ], { baseUrl: BASE }).map((x) => x.out);
    const ctl = (html) => Object.fromEntries(attrsOf(/<(?:button|a)((?:\s+[a-z][a-z0-9:._-]*(?:="[^"]*")?)*)>/.exec(splitHost(html).inner)[1]));
    assert.deepEqual(ctl(res[0]), { class: 'td-btn td-btn--secondary td-btn--md', type: 'button' }, res[0]);
    assert.ok(!splitHost(res[0]).host.has('disabled'));
    assert.match(res[1], /^<button class="td-btn td-btn--secondary td-btn--md" type="button" disabled>/);
    // link: state names reserved; genuine tabindex / role pass-through kept while the link is not inert
    assert.deepEqual(ctl(res[2]), { class: 'td-btn td-btn--ghost td-btn--md', href: '/l', tabindex: '4', role: 'button' }, res[2]);
    assert.deepEqual(ctl(res[3]), { class: 'td-btn td-btn--ghost td-btn--md', role: 'link', 'aria-disabled': 'true', tabindex: '-1' }, res[3]);
    // forwarded ARIA: only values the component would forward reach host and control (same whitelist as JS)
    const { host } = splitHost(res[4]);
    assert.equal(host.get('aria-pressed'), undefined);
    assert.equal(host.get('aria-controls'), undefined);
    assert.equal(host.get('aria-expanded'), 'true');
    assert.deepEqual(ctl(res[4]), { class: 'td-btn td-btn--secondary td-btn--md', type: 'button', 'aria-expanded': 'true' }, res[4]);
  });

  test('a rejected href keeps link mode with an empty host href (inert link, like <td-button href>)', () => {
    const html = php1('td_link', 'x', 'javascript:alert(1)', { element: true });
    const { host, inner } = splitHost(html);
    assert.equal(host.get('href'), '');
    assert.ok(!html.includes('javascript'), html);
    assert.match(inner, /^<a class="td-btn td-btn--ghost td-btn--md" role="link" aria-disabled="true" tabindex="-1">/);
  });

  test('test/ssr/fixtures/button.html (browser fixture) is up to date', () => {
    assert.equal(readFileSync(BUTTON_FIXTURE_FILE, 'utf8'), renderButtonFixture(), 'stale fixture: run `node test/ssr/build-button-fixture.mjs`');
  });
});

describe('Td::modulePreloads (v0.25.0)', opts, () => {
  test('short and full names → <link rel="modulepreload"> with the import-map URL, deduplicated, in order', () => {
    const [r, empty] = runPhp([
      { fn: 'Td::modulePreloads', args: [['button', '@dazzxq/td-components/alert', 'button', 'icons']] },
      { fn: 'Td::modulePreloads', args: [[]] },
    ], { baseUrl: BASE });
    const html = r.out;
    assert.equal(html, `<link rel="modulepreload" href="${BASE}/src/form/td-button.js">`
      + `<link rel="modulepreload" href="${BASE}/src/feedback/td-alert.js">`
      + `<link rel="modulepreload" href="${BASE}/src/icons/td-icon.js">`);
    // the URL is exactly the import map's (same configured version)
    const map = runPhp([{ fn: 'Td::importMap', args: [] }], { baseUrl: BASE })[0].out;
    assert.ok(html.includes(`href="${map['@dazzxq/td-components/button']}"`));
    assert.equal(empty.out, '');
  });

  test('unknown / non-kit / non-string names throw InvalidArgumentException; values are escaped; nonce', () => {
    const res = runPhp([
      { fn: 'Td::modulePreloads', args: [['no-such']] },
      { fn: 'Td::modulePreloads', args: [['td.css']] },
      { fn: 'Td::modulePreloads', args: [['@dazzxq/td-components/td.css']] },
      { fn: 'Td::modulePreloads', args: [[1]] },
      { fn: 'Td::modulePreloads', args: [['app']] },
      { fn: 'Td::modulePreloads', args: [['button'], 'n"1'] },
    ], { baseUrl: BASE });
    for (const r of res.slice(0, 5)) assert.equal(r.error, 'InvalidArgumentException', JSON.stringify(r));
    assert.equal(res[5].out, `<link rel="modulepreload" href="${BASE}/src/form/td-button.js" nonce="n&quot;1">`);
    const amp = runPhp([{ fn: 'Td::modulePreloads', args: [['button']] }], { baseUrl: '/v/a&b' })[0].out;
    assert.equal(amp, '<link rel="modulepreload" href="/v/a&amp;b/src/form/td-button.js">');
  });

  test('requires configure()', () => {
    const [r] = runPhp([{ fn: 'Td::modulePreloads', args: [['button']] }], {});
    assert.equal(r.error, 'LogicException');
  });
});

describe('td_badge icon (v0.25.0)', opts, () => {
  const svgOf = (name) => php1('td_icon', name, 's');
  test('core icon, alias, site-* icon → span.td-badge__icon (aria-hidden, size s) before span.td-badge__label', () => {
    const def = { viewBox: '0 0 24 24', paint: 'fill', nodes: [['circle', { cx: '12', cy: '12', r: '4' }]] };
    const res = runPhp([
      { fn: 'td_badge', args: ['Đã duyệt', { variant: 'success', icon: 'check' }] },
      { fn: 'td_badge', args: ['Đóng', { icon: 'x' }] },
      { fn: 'Td::registerIcons', args: [{ 'site-dot': def }] },
      { fn: 'td_badge', args: ['<b>Chấm</b>', { icon: 'site-dot', variant: 'info', id: 'b1' }] },
      { fn: 'td_icon', args: ['site-dot', 's'] },
    ], { baseUrl: BASE }).map((r) => r.out);
    assert.equal(res[0], `<span class="td-badge td-badge--success"><span class="td-badge__icon" aria-hidden="true">${svgOf('check')}</span>`
      + '<span class="td-badge__label">Đã duyệt</span></span>');
    assert.equal(res[1], `<span class="td-badge td-badge--neutral"><span class="td-badge__icon" aria-hidden="true">${svgOf('close')}</span>`
      + '<span class="td-badge__label">Đóng</span></span>');
    assert.equal(res[3], `<span class="td-badge td-badge--info" id="b1"><span class="td-badge__icon" aria-hidden="true">${res[4]}</span>`
      + '<span class="td-badge__label">&lt;b&gt;Chấm&lt;/b&gt;</span></span>');
  });

  test('unknown / empty / non-string icon → no icon span, label kept escaped (markup as without icon)', () => {
    const res = runPhp([
      { fn: 'td_badge', args: ['A & B', { icon: 'no-such-icon' }] },
      { fn: 'td_badge', args: ['A & B', { icon: '' }] },
      { fn: 'td_badge', args: ['A & B', { icon: ['x'] }] },
      { fn: 'td_badge', args: ['A & B', { icon: '"><script>' }] },
      { fn: 'td_badge', args: ['A & B'] },
    ], { baseUrl: BASE }).map((r) => r.out);
    for (const html of res) assert.equal(html, '<span class="td-badge td-badge--neutral">A &amp; B</span>');
  });
});

// docs mention (cheap guard that the shared fixture covers the projection table rows)
test('fixture covers every projection-table option', opts, () => {
  const used = new Set();
  for (const c of BUTTON_FIXTURES.cases) {
    for (const k of Object.keys(c.args.at(-1))) used.add(k);
    if (c.fn === 'td_link') used.add('href');
  }
  for (const k of ['variant', 'size', 'full_width', 'icon', 'icon_position', 'type', 'name', 'value', 'disabled', 'loading',
    'aria_label', 'tooltip', 'href', 'target', 'download', 'id', 'class', 'attrs']) {
    assert.ok(used.has(k), `fixture misses option ${k}`);
  }
  assert.ok(BUTTON_FIXTURES.cases.some((c) => c.global), 'a global (ssr_elements) case');
  assert.ok(JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).exports['./button']);
});
