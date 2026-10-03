// v0.26.0 part 2 (ADR 0012, plan v0.26.0-ssr-dropdown-empty) — PHP side of the SSR contracts `dropdown@1` and
// `empty-state@1`:
//   - td_dropdown ELEMENT mode (opt-in per call `element` + global Td::configure(..., ['ssr_elements' => true])) = the
//     native markup + the marker on the host + `td-dropdown__native` on the <select>; owned names reserved in `attrs`;
//     native output byte-identical to the code before element mode (test/ssr/dropdown.native.json).
//   - td_empty(): always the element, exact render() tree, icon fallback `inbox`, heading level, actions through
//     td_link element mode, escaping / attribute allowlist / reservation.
// Shared fixtures: test/ssr/dropdown.fixtures.json + empty.fixtures.json (also consumed by the SSR browser tests through
// test/ssr/fixtures/dropdown.html + empty.html — this test fails when they are stale:
// `node test/ssr/build-dropdown-empty-fixture.mjs`).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HAS_PHP, runPhp } from './php.mjs';
import {
  DROPDOWN_FIXTURES, DROPDOWN_FIXTURE_FILE, renderDropdownFixture,
  EMPTY_FIXTURES, EMPTY_FIXTURE_FILE, renderEmptyFixture, SSR_DIR,
} from '../ssr/ssr.mjs';

if (!HAS_PHP && process.env.TD_REQUIRE_PHP) throw new Error('TD_REQUIRE_PHP=1 but no php >= 8.0 CLI on PATH');
const opts = { skip: !HAS_PHP && 'php >= 8.0 CLI not found' };
const BASE = '/vendor/td/0.26.0';
const NATIVE = JSON.parse(readFileSync(join(SSR_DIR, 'dropdown.native.json'), 'utf8'));

/** htmlspecialchars(ENT_QUOTES | ENT_SUBSTITUTE) as Td::e() prints it. */
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

/** The case's options with the per-call mode applied (`call`: 'absent' | true | false). */
function withMode(args, call) {
  const a = structuredClone(args);
  const last = a.length - 1;
  if (call !== 'absent') a[last] = { ...a[last], element: call };
  return a;
}

/** One call in its own php process (generated ids start at 1 every time). */
function one(fn, args, options) {
  const [r] = runPhp([{ fn, args }], options ? { baseUrl: BASE, options } : { baseUrl: BASE });
  assert.equal(r.error, undefined, `${fn}: ${r.message}`);
  return r.out;
}

/** Element-mode output of a dropdown case (global → ssr_elements, else element: true). */
const elementOf = (c) => (c.global ? one(c.fn, c.args, { ssr_elements: true }) : one(c.fn, withMode(c.args, true)));

/** The documented transformation: native markup + marker on the host + the native class on the select. */
const expectElement = (native) => native.replace(/^<td-dropdown/, '<td-dropdown data-td-ssr="dropdown@1"')
  .replace('<select ', '<select class="td-dropdown__native" ');

describe('php/td.php — td_dropdown element mode (v0.26.0 part 2, contract dropdown@1)', opts, () => {
  test('native output is byte-identical to the code before element mode (absent, and element => false under ssr_elements)', () => {
    const all = [...DROPDOWN_FIXTURES.cases, ...DROPDOWN_FIXTURES.modeCases];
    // same call order as test/ssr/dropdown.native.json (generated ids are a per-request counter)
    const absent = runPhp(all.map((c) => ({ fn: c.fn, args: c.args })), { baseUrl: BASE });
    const off = runPhp(all.map((c) => ({ fn: c.fn, args: withMode(c.args, false) })), { baseUrl: BASE, options: { ssr_elements: true } });
    all.forEach((c, i) => {
      assert.equal(absent[i].out, NATIVE[c.id], `${c.id}: native (absent)`);
      assert.equal(off[i].out, NATIVE[c.id], `${c.id}: native (element => false under ssr_elements)`);
    });
  });

  test('mode: global ssr_elements off/on × per call absent/false/true', () => {
    for (const mc of DROPDOWN_FIXTURES.modeCases) {
      for (const mode of DROPDOWN_FIXTURES.modes) {
        const out = one(mc.fn, withMode(mc.args, mode.call), mode.global ? { ssr_elements: true } : undefined);
        assert.equal(out.startsWith('<td-dropdown data-td-ssr="dropdown@1"'), mode.element, `${mc.id} ${JSON.stringify(mode)}: ${out.slice(0, 80)}`);
        assert.equal(out, mode.element ? expectElement(NATIVE[mc.id]).replace(/dd-m-\d+/g, 'dd-m-1') : NATIVE[mc.id].replace(/dd-m-\d+/g, 'dd-m-1'),
          `${mc.id} ${JSON.stringify(mode)}`);
      }
    }
  });

  test('projection: element = native + host marker + select.td-dropdown__native (ids, label, star, options, selection unchanged)', () => {
    for (const c of DROPDOWN_FIXTURES.cases) {
      if (c.dropOnHost) continue; // reservation case: below
      const native = c.global ? one(c.fn, c.args) : one(c.fn, withMode(c.args, false));
      assert.equal(elementOf(c), expectElement(native), c.id);
    }
  });

  test('reservation: owned names in attrs never reach the host (case-insensitive), data-td-* blocked, aria-label lifted to the select', () => {
    const c = DROPDOWN_FIXTURES.cases.find((x) => x.id === 'd-attrs');
    const out = elementOf(c);
    assert.equal(out, '<td-dropdown data-td-ssr="dropdown@1" id="at" label="Thuộc tính" searchable="false" allow-clear="false" data-y="2" title="Gợi ý">'
      + '<label class="td-field__label" for="at-select">Thuộc tính</label>'
      + '<select class="td-dropdown__native" id="at-select" name="at" aria-label="Nhãn ARIA"><option value="a" selected>A</option></select></td-dropdown>');
    // an explicit aria_label option wins over attrs aria-label; required / disabled only through the options
    const both = one('td_dropdown', ['b', { a: 'A' }, 'a', { aria_label: 'Từ tuỳ chọn', required: true, attrs: { 'aria-label': 'Từ attrs', Required: false, 'data-td-x': '1' }, element: true }]);
    assert.ok(both.includes('<select class="td-dropdown__native" id="dd-b-1-select" name="b" required aria-label="Từ tuỳ chọn">'), both);
    assert.ok(!/<td-dropdown[^>]*(required|aria-label|data-td-x)/.test(both), both);
  });

  test('escaping: every value is escaped (XSS case)', () => {
    const out = elementOf(DROPDOWN_FIXTURES.cases.find((x) => x.id === 'd-xss'));
    assert.ok(out.startsWith('<td-dropdown data-td-ssr="dropdown@1" id="x&quot;y" label="&lt;img src=x onerror=alert(1)&gt;"'), out);
    assert.ok(out.includes('<select class="td-dropdown__native" id="x&quot;y-select" name="x&quot;s">'), out);
    assert.ok(out.includes('<option value="&lt;b&gt;">&lt;script&gt;alert(1)&lt;/script&gt;</option>'), out);
    assert.ok(!/<script|<img|<b>/i.test(out), out);
  });

  test('test/ssr/fixtures/dropdown.html (browser fixture) is up to date', () => {
    assert.equal(readFileSync(DROPDOWN_FIXTURE_FILE, 'utf8'), renderDropdownFixture(), 'stale fixture: run `node test/ssr/build-dropdown-empty-fixture.mjs`');
  });
});

// ------------------------------------------------------------------------------------------------- td_empty --------
const SIZES = { sm: 28, md: 40, lg: 56 };
const VARIANTS = ['primary', 'secondary', 'danger'];
const SAFE = ['id', 'title', 'lang', 'dir', 'role', 'tabindex', 'hidden', 'translate', 'accesskey', 'autofocus', 'autocomplete',
  'inputmode', 'enterkeyhint', 'autocapitalize', 'spellcheck', 'placeholder', 'readonly', 'required', 'disabled', 'maxlength',
  'minlength', 'min', 'max', 'step', 'pattern', 'size', 'rows', 'cols'];
const OWNED = ['id', 'class', 'title', 'message', 'size', 'compact', 'heading-level', 'icon'];
const safeName = (k) => /^(aria|data)-[a-z0-9][a-z0-9._-]*$/.test(k) || SAFE.includes(k);
const classTokens = (c) => [...new Set(String(c ?? '').trim().split(/\s+/).filter((t) => /^[A-Za-z_][A-Za-z0-9_-]*$/.test(t)))].join(' ');

/** The exact td_empty() output expected for a case (icon SVG + action markup taken from Td::icon / td_link). */
function expectEmpty(c) {
  const [title, message, o] = c.args;
  const size = Object.hasOwn(SIZES, o.size) ? o.size : 'md';
  const px = SIZES[size];
  const lvl = Number.parseInt(o.heading, 10);
  const heading = lvl >= 2 && lvl <= 6 ? lvl : null;
  const iconKnown = c.icon !== 'inbox' || o.icon === 'inbox';
  let host = '<td-empty-state data-td-ssr="empty-state@1"';
  if (o.id) host += ` id="${esc(o.id)}"`;
  if (classTokens(o.class)) host += ` class="${esc(classTokens(o.class))}"`;
  if (title !== '') host += ` title="${esc(title)}"`;
  if (message !== '') host += ` message="${esc(message)}"`;
  host += ` size="${size}"`;
  if (o.compact) host += ' compact';
  if (heading) host += ` heading-level="${heading}"`;
  if (o.icon && iconKnown) host += ` icon="${esc(o.icon)}"`;
  const seen = new Set(OWNED);
  for (const [k, v] of Object.entries(o.attrs || {})) {
    const l = k.toLowerCase();
    if (seen.has(l) || l.startsWith('data-td-') || !safeName(l) || v === null || v === false) continue;
    seen.add(l);
    host += v === true ? ` ${l}` : ` ${l}="${esc(v)}"`;
  }
  const [svg] = runPhp([{ fn: 'Td::icon', args: [c.icon, px] }], { baseUrl: BASE }).map((r) => r.out);
  const actions = (o.actions || []).filter((a) => a && typeof a === 'object' && typeof a.href === 'string')
    .map((a) => ({ ...a, safe: runPhp([{ fn: 'Td::safeUrl', args: [a.href] }], { baseUrl: BASE })[0].out }))
    .filter((a) => a.safe !== '')
    .map((a) => one('td_link', [a.label ? String(a.label) : 'Thực hiện', a.href,
      { variant: VARIANTS.includes(a.variant) ? a.variant : 'secondary', size: 'sm', element: true }]));
  const h = `h${heading ?? 3}`;
  return `${host}><div class="td-empty-state td-empty-state--${size}${o.compact ? ' td-empty-state--compact' : ''}">`
    + `<div class="td-empty-state__icon" aria-hidden="true"><span data-td-icon="${c.icon}" data-td-icon-size="${px}">${svg}</span></div>`
    + `<${h} class="td-empty-state__title">${esc(title || 'Không có dữ liệu')}</${h}>`
    + `<p class="td-empty-state__message">${esc(message || 'Chưa có mục nào được tạo.')}</p>`
    + `<div class="td-empty-state__actions"${actions.length ? '' : ' hidden'}>${actions.join('')}</div></div></td-empty-state>`;
}

describe('php/td.php — td_empty() (v0.26.0 part 2, contract empty-state@1)', opts, () => {
  test('every fixture case = the exact render() tree (host projection, icon slot, heading, message, actions)', () => {
    for (const c of EMPTY_FIXTURES.cases) assert.equal(one('td_empty', c.args), expectEmpty(c), c.id);
  });

  test('always the element: `element` false / ssr_elements off change nothing', () => {
    const c = EMPTY_FIXTURES.cases.find((x) => x.id === 'e-actions');
    const base = one('td_empty', c.args);
    assert.equal(one('td_empty', withMode(c.args, false)), base);
    assert.equal(one('td_empty', withMode(c.args, false), { ssr_elements: true }), base);
    assert.ok(base.startsWith('<td-empty-state data-td-ssr="empty-state@1"'), base);
  });

  test('icon: absent / unknown → inbox (no icon attribute), alias kept as given, px size per size', () => {
    const out = (o) => one('td_empty', ['T', 'M', o]);
    for (const o of [{}, { icon: 'khong-co' }, { icon: '' }, { icon: '<svg onload=x>' }, { icon: ['x'] }]) {
      const html = out(o);
      assert.ok(html.includes('<span data-td-icon="inbox" data-td-icon-size="40"><svg class="td-icon"'), html);
      assert.ok(!/<td-empty-state[^>]* icon=/.test(html), html);
    }
    assert.ok(out({ icon: 'x', size: 'lg' }).includes('<span data-td-icon="x" data-td-icon-size="56"><svg class="td-icon" data-icon="close"'));
    assert.ok(out({ icon: 'search', size: 'sm' }).includes(' width="28" height="28"'));
  });

  test('heading: 2–6 (int or numeric string) → heading-level + hN; anything else → h3 without the attribute', () => {
    for (const [v, lvl, attr] of [[2, 2, true], ['6', 6, true], [3, 3, true], [1, 3, false], [7, 3, false], ['x', 3, false], [null, 3, false]]) {
      const html = one('td_empty', ['T', '', { heading: v }]);
      assert.ok(html.includes(`<h${lvl} class="td-empty-state__title">T</h${lvl}>`), `${v}: ${html}`);
      assert.equal(html.includes(' heading-level='), attr, `${v}`);
    }
  });

  test('actions: td_link element mode (variant primary|secondary|danger, size sm); unsafe / missing href or non-array skipped', () => {
    const html = one('td_empty', ['T', 'M', { actions: [
      { label: 'A', href: '/a', variant: 'primary' }, { label: 'B', href: 'javascript:alert(1)' }, { label: 'C' },
      { label: 'D', href: '//ok.example/x', variant: 'warning' }, 'rác', null,
    ] }]);
    const links = html.match(/<td-button [^>]*>/g);
    assert.deepEqual(links, [
      '<td-button data-td-ssr="button@1" variant="primary" size="sm" label="A" href="/a">',
      '<td-button data-td-ssr="button@1" variant="secondary" size="sm" label="D" href="//ok.example/x">',
    ]);
    assert.ok(!html.includes('javascript'), html);
    assert.ok(html.includes('<div class="td-empty-state__actions"><td-button'), 'container visible with actions');
    assert.ok(one('td_empty', ['T', 'M', { actions: 'x' }]).includes('<div class="td-empty-state__actions" hidden></div>'));
  });

  test('escaping + attribute allowlist (on*, style, data-td-*, owned names never printed from attrs)', () => {
    const x = one('td_empty', EMPTY_FIXTURES.cases.find((c) => c.id === 'e-xss').args);
    assert.ok(x.includes(' id="e&quot;x"') && x.includes(' title="&lt;script&gt;alert(1)&lt;/script&gt;"'), x);
    assert.ok(x.includes('>&lt;script&gt;alert(1)&lt;/script&gt;</h3>') && x.includes('>&quot;&gt;&lt;img src=x onerror=alert(1)&gt;</p>'), x);
    assert.ok(!/<script|<img|onclick=/i.test(x.replace(/="[^"]*"/g, '=""')), x);
    const a = one('td_empty', EMPTY_FIXTURES.cases.find((c) => c.id === 'e-id-class').args);
    assert.ok(a.startsWith('<td-empty-state data-td-ssr="empty-state@1" id="orders-empty" class="my-empty wide" title="Có id" message="Và class." size="md" data-y="2" aria-label="Trống">'), a);
    assert.ok(!/evil|onclick|style=|x@1/.test(a), a);
  });

  test('test/ssr/fixtures/empty.html (browser fixture) is up to date', () => {
    assert.equal(readFileSync(EMPTY_FIXTURE_FILE, 'utf8'), renderEmptyFixture(), 'stale fixture: run `node test/ssr/build-dropdown-empty-fixture.mjs`');
  });
});
