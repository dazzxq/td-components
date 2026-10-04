// v0.36.0 (plan QĐ 11 + 14) — td_action_button() ↔ <td-action-button>: one preset inventory (the 23 dcms2 keys) in JS
// (TdActionButton.presets) and PHP (Td::ACTION_PRESETS); element-mode markup == render() of the JS component for every
// preset × 3 tones × 3 sizes × button / link / disabled (structure: the state attributes are compared with what
// TdButton._syncState() sets); XSS of the label; unknown action → '' + one E_USER_WARNING; the generated SSR fixture
// (test/ssr/fixtures/action-button.html) is fresh.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { HAS_PHP, PHP_BIN, ROOT, runPhp } from './php.mjs';
import { ACTION_BUTTON_FIXTURES, ACTION_BUTTON_FIXTURE_FILE, renderActionButtonFixture } from '../ssr/build-action-button-fixture.mjs';

if (!HAS_PHP && process.env.TD_REQUIRE_PHP) throw new Error('TD_REQUIRE_PHP=1 but no php >= 8.0 CLI on PATH');
const opts = { skip: !HAS_PHP && 'php >= 8.0 CLI not found' };

// --- Minimal DOM shim (render() only reads attributes) — like src/form/td-button.test.js ---
class MockHTMLElement {
  constructor() { this._attributes = new Map(); this.innerHTML = ''; this.textContent = ''; }
  getAttribute(n) { return this._attributes.get(n) ?? null; }
  setAttribute(n, v) { this._attributes.set(n, String(v)); }
  removeAttribute(n) { this._attributes.delete(n); }
  hasAttribute(n) { return this._attributes.has(n); }
  addEventListener() {}
  removeEventListener() {}
  querySelector() { return null; }
}
const registry = new Map();
globalThis.customElements ??= { get: (n) => registry.get(n), define: (n, c) => { if (!registry.has(n)) registry.set(n, c); } };
globalThis.HTMLElement ??= MockHTMLElement;
const { TdActionButton, canonAction } = await import('../../src/form/td-action-button.js');

const decode = (s) => s.replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
/** ` a="b" c` → Map (decoded; bare → '') */
function attrsOf(src) {
  const out = new Map();
  for (const m of src.matchAll(/\s+([a-z][a-z0-9:._-]*)(?:="([^"]*)")?/g)) {
    assert.ok(!out.has(m[1]), `duplicate attribute ${m[1]}`);
    out.set(m[1], m[2] === undefined ? '' : decode(m[2]));
  }
  return out;
}
const ATTRS = '((?:\\s+[a-z][a-z0-9:._-]*(?:="[^"]*")?)*)';
/** control markup → { tag, attrs, inner } with the icon slot's SVG removed (JS fills it after render) */
function control(html) {
  const m = new RegExp(`^<(button|a)${ATTRS}>([\\s\\S]*)</\\1>$`).exec(html);
  assert.ok(m, `not a control: ${html.slice(0, 100)}`);
  return { tag: m[1], attrs: attrsOf(m[2]), inner: m[3].replace(/(<span class="td-btn__icon"[^>]*>)<svg class="td-icon[\s\S]*?<\/svg>/, '$1') };
}
function splitHost(html) {
  const m = new RegExp(`^<td-action-button${ATTRS}>([\\s\\S]*)</td-action-button>$`).exec(html);
  assert.ok(m, `not a host: ${html.slice(0, 100)}`);
  return { host: attrsOf(m[1]), control: control(m[2]) };
}
/** render() of a JS host carrying exactly these attributes */
function jsRender(hostAttrs) {
  const el = new TdActionButton();
  for (const [k, v] of hostAttrs) if (k !== 'data-td-ssr') el.setAttribute(k, v);
  return el.render();
}
const STATE = ['disabled', 'href', 'role', 'tabindex', 'aria-disabled'];
const withoutState = (m) => new Map([...m].filter(([k]) => !STATE.includes(k)));

function phpPresets() {
  const r = spawnSync(PHP_BIN, ['-d', 'display_errors=stderr', '-r',
    `require ${JSON.stringify(join(ROOT, 'php/td.php'))}; echo json_encode(TdComponents\\Td::ACTION_PRESETS, JSON_UNESCAPED_UNICODE);`], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}
/** td_action_button with JSON args, capturing the warnings on stderr (the harness forbids stderr) */
function withWarnings(args) {
  const code = `require ${JSON.stringify(join(ROOT, 'php/td.php'))}; TdComponents\\Td::configure('/', ${JSON.stringify(ROOT)});`
    + ` $a = json_decode(${JSON.stringify(JSON.stringify(args))}, true); echo td_action_button(...$a);`;
  const r = spawnSync(PHP_BIN, ['-d', 'display_errors=stderr', '-d', 'log_errors=0', '-d', 'error_reporting=E_ALL', '-d', 'xdebug.mode=off', '-r', code], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return { out: r.stdout, warnings: (r.stderr.match(/Warning: +td_action_button:/g) || []).length };
}

describe('td-action-button presets (QĐ 11) — one inventory', () => {
  test('JS: exactly the 23 dcms2 keys (camelCase → kebab), every icon in the registry', async () => {
    const names = Object.keys(TdActionButton.presets);
    assert.equal(names.length, 23);
    assert.deepEqual(names, ACTION_BUTTON_FIXTURES.dcmsKeys.map(canonAction));
    assert.equal(canonAction('sendToPublish'), 'send-to-publish');
    assert.equal(canonAction('forceRelease'), 'force-release');
    assert.equal(canonAction('moveup'), 'moveup');
    assert.equal(canonAction('../x'), null);
    const { hasIcon } = await import('../../src/icons/td-icon.js');
    for (const [n, p] of Object.entries(TdActionButton.presets)) {
      assert.ok(hasIcon(p.icon), `${n}: icon ${p.icon}`);
      assert.ok(['standard', 'warning', 'danger'].includes(p.tone), n);
      assert.ok(p.label.trim(), n);
    }
  });

  test('PHP Td::ACTION_PRESETS == TdActionButton.presets (name, icon, label, tone, order)', opts, () => {
    const php = phpPresets();
    assert.deepEqual(Object.keys(php), Object.keys(TdActionButton.presets));
    for (const [n, [icon, label, tone]] of Object.entries(php)) assert.deepEqual({ icon, label, tone }, TdActionButton.presets[n], n);
  });
});

describe('php td_action_button — element mode == render() (QĐ 14)', opts, () => {
  test('every preset × 3 tones × 3 sizes × button / link / disabled', () => {
    const calls = [];
    for (const name of Object.keys(TdActionButton.presets)) {
      for (const tone of ['standard', 'warning', 'danger']) {
        for (const size of ['sm', 'md', 'lg']) {
          for (const mode of ['button', 'link', 'disabled']) {
            const o = { tone, size, element: true };
            if (mode === 'link') o.href = '/bai-viet/1?a=1&b=2';
            if (mode === 'disabled') o.disabled = true;
            calls.push({ fn: 'td_action_button', args: [name, o], mode });
          }
        }
      }
    }
    const res = runPhp(calls.map(({ fn, args }) => ({ fn, args })), { baseUrl: '/' });
    assert.equal(res.length, 23 * 27);
    res.forEach((r, i) => {
      const { args: [name, o], mode } = calls[i];
      const ctx = `${name} ${o.tone} ${o.size} ${mode}`;
      assert.equal(r.error, undefined, `${ctx}: ${r.message}`);
      const { host, control: php } = splitHost(r.out);
      assert.equal(host.get('data-td-ssr'), 'action-button@1', ctx);
      const js = control(jsRender(host));
      assert.equal(php.tag, js.tag, ctx);
      assert.deepEqual(withoutState(php.attrs), withoutState(js.attrs), ctx);
      assert.equal(php.inner, js.inner, ctx);
      const p = TdActionButton.presets[name];
      assert.equal(php.attrs.get('aria-label'), p.label, ctx);
      assert.equal(php.attrs.get('data-tooltip'), p.label, ctx);
      assert.ok(php.attrs.get('class').split(' ').includes(`td-btn--action-${o.tone}`), ctx);
      assert.ok(php.inner.includes(`data-td-icon="${p.icon}"`), ctx);
      assert.ok(!php.inner.includes('td-btn__label'), `${ctx}: no label span`);
      // state = what TdButton._syncState() puts on the control
      if (mode === 'link') {
        assert.equal(php.attrs.get('href'), '/bai-viet/1?a=1&b=2', ctx);
        for (const a of ['role', 'tabindex', 'aria-disabled', 'disabled']) assert.ok(!php.attrs.has(a), `${ctx}: ${a}`);
      } else if (mode === 'disabled') {
        assert.equal(php.attrs.get('disabled'), '', ctx);
      } else {
        for (const a of STATE) assert.ok(!php.attrs.has(a), `${ctx}: ${a}`);
      }
    });
  });

  test('fixture cases: overrides, aliases, link / rejected href, name precedence aria_label > label > preset', () => {
    const cases = ACTION_BUTTON_FIXTURES.cases;
    const res = runPhp(cases.map((c) => ({ fn: 'td_action_button', args: [c.action, { ...c.o, element: true }] })), { baseUrl: '/' });
    const byId = new Map(cases.map((c, i) => [c.id, splitHost(res[i].out)]));
    for (const [id, { host, control: php }] of byId) {
      const js = control(jsRender(host));
      const keep = (m) => new Map([...withoutState(m)].filter(([k]) => k === 'class' || k === 'type' || k === 'target' || k === 'rel'
        || k === 'aria-label' || k === 'data-tooltip'));
      assert.deepEqual(keep(php.attrs), keep(js.attrs), id);
      assert.equal(php.inner, js.inner, id);
    }
    assert.equal(byId.get('alias-camel').control.attrs.get('aria-label'), 'Gửi chờ xuất bản');
    assert.equal(byId.get('alias-force').control.attrs.get('class'), 'td-btn td-btn--action td-btn--action-danger td-btn--action-md');
    assert.equal(byId.get('own-label').control.attrs.get('aria-label'), 'Sửa bài viết');
    assert.equal(byId.get('aria-label').control.attrs.get('aria-label'), 'Sửa bài số 1');
    assert.equal(byId.get('aria-label').control.attrs.get('data-tooltip'), 'Sửa bài số 1');
    assert.equal(byId.get('aria-label').host.get('label'), 'Sửa');
    assert.equal(byId.get('custom').control.attrs.get('class'), 'td-btn td-btn--action td-btn--action-warning td-btn--action-md');
    const rejected = byId.get('link-rejected');
    assert.equal(rejected.host.get('href'), '');
    assert.ok(!rejected.control.attrs.has('href'));
    assert.equal(rejected.control.attrs.get('tabindex'), '-1');
    assert.equal(byId.get('link-blank').control.attrs.get('rel'), 'noopener noreferrer');
    const pressed = byId.get('pressed');
    assert.equal(pressed.host.get('aria-pressed'), 'true');
    assert.equal(pressed.control.attrs.get('aria-pressed'), 'true');
    const site = byId.get('site-attrs');
    assert.equal(site.host.get('id'), 'ab-1');
    assert.equal(site.host.get('class'), 'site-x');
    for (const a of ['onclick', 'style', 'data-td-icon', 'id']) assert.ok(!site.control.attrs.has(a), a);
    assert.equal(site.control.attrs.get('data-row'), '7');
  });

  test('XSS: the label is text in an attribute — never markup', () => {
    const [r] = runPhp([{ fn: 'td_action_button', args: ['edit', { label: '<img src=x onerror="alert(1)">', element: true }] }], { baseUrl: '/' });
    assert.ok(!/<img/i.test(r.out), r.out);
    assert.ok(r.out.includes('aria-label="&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"'), r.out);
    assert.equal(splitHost(r.out).control.attrs.get('data-tooltip'), '<img src=x onerror="alert(1)">');
  });

  test('unknown action without icon + label → "" + exactly one E_USER_WARNING; with icon + label → rendered', () => {
    const none = withWarnings(['khong-co']);
    assert.equal(none.out, '');
    assert.equal(none.warnings, 1);
    const halfIcon = withWarnings(['khong-co', { icon: 'star' }]);
    assert.equal(halfIcon.out, '');
    assert.equal(halfIcon.warnings, 1);
    const ok = withWarnings(['khong-co', { icon: 'star', label: 'Ghim' }]);
    assert.equal(ok.warnings, 0);
    assert.match(ok.out, /^<button class="td-btn td-btn--action td-btn--action-standard td-btn--action-md" type="button" aria-label="Ghim"/);
  });

  test('native mode (no element): the control alone, site id / class on it, svg filled, no data-td-icon slot name', () => {
    const [r] = runPhp([{ fn: 'td_action_button', args: ['delete', { id: 'x1', class: 'a b', disabled: true }] }], { baseUrl: '/' });
    const c = control(r.out);
    assert.equal(c.tag, 'button');
    assert.equal(c.attrs.get('id'), 'x1');
    assert.equal(c.attrs.get('class'), 'td-btn td-btn--action td-btn--action-danger td-btn--action-md a b');
    assert.equal(c.attrs.get('disabled'), '');
    assert.ok(r.out.includes('data-icon="trash"'));
  });

  test('test/ssr/fixtures/action-button.html is fresh (node test/ssr/build-action-button-fixture.mjs)', () => {
    assert.equal(readFileSync(ACTION_BUTTON_FIXTURE_FILE, 'utf8'), renderActionButtonFixture());
  });
});
