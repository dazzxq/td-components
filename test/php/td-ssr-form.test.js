// v0.26.0 (ADR 0012, plan v0.26.0 F1) — PHP side of the SSR contracts `input-field@1`, `toggle@1`, `checkbox@1`:
// td_field / td_toggle / td_checkbox ELEMENT mode (opt-in per call `element` + global Td::configure(..., ['ssr_elements'
// => true])), the host ↔ control projection table, id rules, reservation of owned names (case-insensitive), `data-td-*`,
// escaping, native output byte-identical. Shared fixtures: test/ssr/form.fixtures.json (also consumed by
// src/form/td-form.ssr.browser-test.js through test/ssr/fixtures/form.html — this test fails when that generated file is
// stale: `node test/ssr/build-form-fixture.mjs`). test/ssr/form.native.json = the pre-0.26 native output of every case.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HAS_PHP, ROOT, runPhp } from './php.mjs';
import { FORM_FIXTURES, FORM_FIXTURE_FILE, renderFormFixture, SSR_DIR } from '../ssr/ssr.mjs';

if (!HAS_PHP && process.env.TD_REQUIRE_PHP) throw new Error('TD_REQUIRE_PHP=1 but no php >= 8.0 CLI on PATH');
const opts = { skip: !HAS_PHP && 'php >= 8.0 CLI not found' };
const BASE = '/vendor/td/0.26.0';
const NATIVE_V025 = JSON.parse(readFileSync(join(SSR_DIR, 'form.native.json'), 'utf8'));
/**
 * v0.54.0 (plan v0.54.0-hint QĐ 3 — a deliberate change, breaking-changes): a hint WITH an error → the note is hidden and
 * leaves aria-describedby. Every other byte of the v0.25 native baseline is unchanged.
 */
const v054 = (html) => (!/class="td-field-error"/.test(html) ? html : html
  .replace(/ aria-describedby="(\S+)-note (\S+-error)"/, ' aria-describedby="$2"')
  .replace(/(<div class="td-field__note" id="[^"]+")>(?!<\/div>)/, '$1 hidden>'));
const NATIVE = Object.fromEntries(Object.entries(NATIVE_V025).map(([k, v]) => [k, v054(v)]));
const TAG = { td_field: 'td-input-field', td_toggle: 'td-toggle', td_checkbox: 'td-checkbox' };

/** htmlspecialchars(ENT_QUOTES | ENT_SUBSTITUTE) as Td::e() prints it. */
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

const ATTRS_RE = '((?:\\s+[a-z][a-z0-9:._-]*(?:="[^"]*")?)*)';

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
function splitHost(html, tag) {
  const m = new RegExp(`^<${tag}${ATTRS_RE}>([\\s\\S]*)</${tag}>$`).exec(html);
  assert.ok(m, `not a <${tag}> host: ${html.slice(0, 120)}`);
  return { host: attrsOf(m[1]), inner: m[2] };
}

/** The case's options with the per-call mode applied (`call`: 'absent' | true | false). */
function withMode(args, call) {
  const a = structuredClone(args);
  const last = a.length - 1;
  if (call !== 'absent') a[last] = { ...a[last], element: call };
  return a;
}

/** Element-mode output of fixture cases (global cases under ssr_elements, the others with element: true). */
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

const ICON = Object.fromEntries(runPhp([
  { fn: 'td_icon', args: ['close'] }, { fn: 'td_icon', args: ['check'] }, { fn: 'Td::icon', args: ['check', 'm', '', 'td-checkbox__svg'] },
], { baseUrl: BASE }).map((r, i) => [['close', 'check', 'checkbox'][i], r.out]));

const intOpt = (v, min = 1) => (v === undefined || v === null || v === '' || Number.isNaN(Number(v)) || Number.parseInt(v, 10) < min
  ? null : String(Number.parseInt(v, 10)));
const str = (v) => (v !== undefined && v !== null && String(v) !== '' ? String(v) : null);
/** UTF-16 length of the value the browser holds (CR LF → LF; an <input> drops line breaks). */
const jsLength = (v, textarea) => (textarea ? v.replace(/\r\n?/g, '\n') : v.replace(/[\r\n]/g, '')).length;

/** E1 hints from options (+ `attrs`, options win), normalised like Td::inputHints(). */
function hintsOf(o) {
  const src = { ...o };
  for (const [k, v] of Object.entries(o.attrs || {})) {
    const l = k.toLowerCase();
    if (['autocomplete', 'inputmode', 'enterkeyhint', 'autocapitalize', 'spellcheck', 'autofocus'].includes(l) && !(l in src)) {
      src[l] = l === 'autofocus' ? v !== false && v !== null : v;
    }
  }
  const out = {};
  if (src.autocomplete != null) {
    const v = String(src.autocomplete).replace(/\s+/g, ' ').trim().toLowerCase();
    if (v && /^[a-z0-9 -]+$/.test(v)) out.autocomplete = v;
  }
  const enums = {
    inputmode: ['none', 'text', 'decimal', 'numeric', 'tel', 'search', 'email', 'url'],
    enterkeyhint: ['enter', 'done', 'go', 'next', 'previous', 'search', 'send'],
    autocapitalize: ['off', 'none', 'on', 'sentences', 'words', 'characters'],
  };
  for (const [k, allowed] of Object.entries(enums)) if (src[k] != null && allowed.includes(String(src[k]).toLowerCase())) out[k] = String(src[k]).toLowerCase();
  if (src.spellcheck === true || src.spellcheck === 'true') out.spellcheck = 'true';
  else if (src.spellcheck === false || src.spellcheck === 'false') out.spellcheck = 'false';
  if (src.autofocus) out.autofocus = true;
  return out;
}

const FIELD_OWNED = ['class', 'type', 'id', 'name', 'value', 'placeholder', 'required', 'aria-required', 'disabled', 'readonly',
  'maxlength', 'minlength', 'pattern', 'min', 'max', 'step', 'rows', 'aria-describedby', 'aria-invalid', 'aria-errormessage',
  'aria-label', 'aria-labelledby', 'autocomplete', 'inputmode', 'enterkeyhint', 'autocapitalize', 'spellcheck', 'autofocus'];
const CHECK_OWNED_CONTROL = ['type', 'role', 'class', 'id', 'name', 'value', 'checked', 'required', 'disabled', 'aria-label',
  'aria-labelledby', 'aria-invalid', 'aria-errormessage', 'aria-busy'];
const CHECK_OWNED_HOST = ['id', 'class', 'name', 'value', 'checked', 'required', 'disabled', 'label', 'size', 'aria-label',
  'color', 'controlled', 'error-text'];
const SAFE = ['id', 'title', 'lang', 'dir', 'role', 'tabindex', 'hidden', 'translate', 'accesskey', 'autofocus', 'autocomplete',
  'inputmode', 'enterkeyhint', 'autocapitalize', 'spellcheck', 'placeholder', 'readonly', 'required', 'disabled', 'maxlength',
  'minlength', 'min', 'max', 'step', 'pattern', 'size', 'rows', 'cols'];
const safeName = (k) => /^(aria|data)-[a-z0-9][a-z0-9._-]*$/.test(k) || SAFE.includes(k);

/** `attrs` / `input_attrs` pass-through: allowlisted, not owned, not data-td-*, first spelling wins. */
function passThrough(extra, owned) {
  const out = {};
  for (const [k, v] of Object.entries(extra || {})) {
    const l = k.toLowerCase();
    if (l in out || owned.includes(l) || l.startsWith('data-td-') || !safeName(l) || v === null || v === false) continue;
    out[l] = v === true ? true : esc(v);
  }
  return out;
}

const GEN_ID = /^td-(?:[A-Za-z0-9_-]+-)?\d+$/;
/** Native td_field ids generated per request (`f-{name}-{n}`) → `f-{name}-N` (one call per php process here). */
const normId = (html) => html.replace(/\bf-([A-Za-z0-9_]*)-\d+/g, 'f-$1-N');

/** Host id: `{id}-host` for a caller id, else a generated `td-{clean name}-{n}`. */
function hostIdOf(c, host) {
  const o = c.args.at(-1);
  const id = str(o.id);
  if (id) {
    assert.equal(host.get('id'), esc(`${id}-host`), `${c.id}: host id`);
    return `${id}-host`;
  }
  const hid = host.get('id');
  assert.match(hid, GEN_ID, `${c.id}: generated host id`);
  assert.ok(hid.startsWith(`td-${String(c.args[0]).replace(/[^A-Za-z0-9_-]/g, '')}-`), `${c.id}: ${hid}`);
  return hid;
}

function checkField(c, r) {
  const [name, value, o] = c.args;
  const { host, inner } = splitHost(r.out, 'td-input-field');
  const hid = hostIdOf(c, host);
  const types = ['text', 'password', 'email', 'number', 'date', 'month', 'datetime-local', 'time', 'search', 'url', 'tel', 'textarea'];
  const type = types.includes(o.type) ? o.type : 'text';
  const size = ['sm', 'md', 'lg'].includes(o.size) ? o.size : 'md';
  const ta = type === 'textarea';
  const cid = str(o.id) ?? `${hid}-control`;
  const label = str(o.label);
  const hint = str(o.hint);
  const error = str(o.error);
  const max = intOpt(o.max_length ?? o.maxlength);
  const hints = hintsOf(o);
  const ariaLabel = Object.entries(o.attrs || {}).find(([k, v]) => k.toLowerCase() === 'aria-label' && typeof v === 'string' && v !== '')?.[1];
  const exp = new Map([['data-td-ssr', 'input-field@1'], ['id', esc(hid)], ['type', type], ['size', size]]);
  if (o.class) exp.set('class', esc(o.class));
  if (name !== '') exp.set('name', esc(name));
  if (value !== '') exp.set('value', esc(value));
  if (label) exp.set('label', esc(label));
  if (str(o.placeholder)) exp.set('placeholder', esc(o.placeholder));
  if (hint) exp.set('helper-text', esc(hint));
  if (error) exp.set('error-text', esc(error));
  for (const b of ['required', 'disabled', 'readonly']) if (o[b]) exp.set(b, true);
  if (max) exp.set('max-length', max);
  if (intOpt(o.minlength)) exp.set('minlength', intOpt(o.minlength));
  for (const k of ['pattern', 'min', 'max', 'step']) if (str(o[k])) exp.set(k, esc(o[k]));
  if (ta) exp.set('rows', intOpt(o.rows) ?? '3');
  if (str(o.id)) exp.set('field-id', esc(o.id));
  for (const [k, v] of Object.entries(hints)) exp.set(k, v);
  if (ariaLabel) exp.set('aria-label', esc(ariaLabel));
  assert.deepEqual(Object.fromEntries(host), Object.fromEntries(exp), `${c.id}: host attributes`);

  const m = new RegExp(`^<div class="td-field td-field--${size}${ta ? ' td-field--textarea' : ''}">(<label[^>]*>[\\s\\S]*?</label>)?`
    + `(<input${ATTRS_RE}>|<textarea${ATTRS_RE}>([\\s\\S]*?)</textarea>)(<div class="td-field__footer"[\\s\\S]*)</div>$`).exec(inner);
  assert.ok(m, `${c.id}: structure ${inner.slice(0, 200)}`);
  const [, labelHtml, , inAttrs, taAttrs, taText, footer] = m;
  if (label) {
    assert.equal(labelHtml, `<label class="td-field__label" id="${esc(hid)}-label" for="${esc(cid)}">${esc(label)}`
      + `${o.required ? '<span class="td-field__required" aria-hidden="true"> *</span>' : ''}</label>`, `${c.id}: label`);
  } else assert.equal(labelHtml, undefined, `${c.id}: no label`);
  assert.equal(!!taAttrs, ta, `${c.id}: control tag`);
  if (ta) assert.equal(taText, `\n${esc(value)}`, `${c.id}: textarea text`);
  // v0.54.0 (QĐ 3): the note leaves the description while an error shows
  const desc = [hint && !error && `${hid}-note`, max && `${hid}-counter`, error && `${hid}-error`].filter(Boolean).join(' ');
  const ctl = {
    ...(ta ? {} : { type }), class: 'td-field__control', id: esc(cid),
    ...(name !== '' ? { name: esc(name) } : {}),
    ...(str(o.placeholder) ? { placeholder: esc(o.placeholder) } : {}),
    ...(o.required ? { required: true, 'aria-required': 'true' } : {}),
    ...(o.disabled ? { disabled: true } : {}), ...(o.readonly ? { readonly: true } : {}),
    ...(max ? { maxlength: max } : {}), ...(intOpt(o.minlength) ? { minlength: intOpt(o.minlength) } : {}),
    ...Object.fromEntries(['pattern', 'min', 'max', 'step'].filter((k) => str(o[k])).map((k) => [k, esc(o[k])])),
    ...hints,
    ...(desc ? { 'aria-describedby': esc(desc) } : {}),
    ...(error ? { 'aria-invalid': 'true', 'aria-errormessage': esc(`${hid}-error`) } : {}),
    ...(!label && ariaLabel ? { 'aria-label': esc(ariaLabel) } : {}),
    ...(ta ? { rows: intOpt(o.rows) ?? '3' } : { value: esc(value) }),
    ...passThrough(o.attrs, FIELD_OWNED),
  };
  assert.deepEqual(Object.fromEntries(attrsOf(ta ? taAttrs : inAttrs)), ctl, `${c.id}: control attributes`);
  const count = max ? jsLength(value, ta) : 0;
  const counter = max ? `<div class="td-field__counter" id="${esc(hid)}-counter"${count >= Number(max) ? ' data-state="limit"' : ''}>${count}/${max} ký tự</div>` : '';
  assert.equal(footer, `<div class="td-field__footer"${!hint && !error && !max ? ' hidden' : ''}>`
    + (error ? `<span class="td-field-error" id="${esc(hid)}-error" data-for="${esc(hid)}">${esc(error)}</span>` : '')
    + `<div class="td-field__note" id="${esc(hid)}-note"${hint && !error ? '' : ' hidden'}>${hint ? esc(hint) : ''}</div>${counter}</div>`,
  `${c.id}: footer`);
}

function checkCheckable(c, r) {
  const [name, checked, label, o] = c.args;
  const toggle = c.fn === 'td_toggle';
  const tag = TAG[c.fn];
  const { host, inner } = splitHost(r.out, tag);
  const hid = hostIdOf(c, host);
  const size = ['sm', 'md', 'lg'].includes(o.size) ? o.size : 'md';
  const value = o.value !== undefined && o.value !== null ? String(o.value) : null;
  const exp = new Map([['data-td-ssr', toggle ? 'toggle@1' : 'checkbox@1'], ['id', esc(hid)], ['size', size]]);
  if (o.class) exp.set('class', esc(o.class));
  if (name !== '') exp.set('name', esc(name));
  if (value !== null) exp.set('value', esc(value));
  if (checked) exp.set('checked', true);
  for (const b of ['required', 'disabled']) if (o[b]) exp.set(b, true);
  if (label !== '') exp.set('label', esc(label));
  if (str(o.aria_label)) exp.set('aria-label', esc(o.aria_label));
  for (const [k, v] of Object.entries(passThrough(o.attrs, CHECK_OWNED_HOST))) exp.set(k, v);
  assert.deepEqual(Object.fromEntries(host), Object.fromEntries(exp), `${c.id}: host attributes`);
  for (const k of c.dropOnHost || []) assert.ok(!host.has(k) || exp.has(k), `${c.id}: ${k} must not reach the host from attrs`);

  const block = toggle ? 'td-switch' : 'td-checkbox';
  const m = new RegExp(`^<label class="${block} ${block}--${size}"><input${ATTRS_RE}>([\\s\\S]*)</label>$`).exec(inner);
  assert.ok(m, `${c.id}: structure ${inner.slice(0, 160)}`);
  const ctl = {
    type: 'checkbox', ...(toggle ? { role: 'switch' } : {}), class: `${block}__input`,
    ...(str(o.id) ? { id: esc(o.id) } : {}),
    ...(name !== '' ? { name: esc(name) } : {}),
    ...(value !== null ? { value: esc(value) } : {}),
    ...(checked ? { checked: true } : {}),
    ...(o.required ? { required: true } : {}), ...(o.disabled ? { disabled: true } : {}),
    ...(label === '' && str(o.aria_label) ? { 'aria-label': esc(o.aria_label) } : {}),
    ...passThrough(o.input_attrs, CHECK_OWNED_CONTROL),
  };
  assert.deepEqual(Object.fromEntries(attrsOf(m[1])), ctl, `${c.id}: control attributes`);
  const deco = toggle
    ? '<span class="td-switch__track" aria-hidden="true"><span class="td-switch__thumb">'
      + `<span class="td-switch__icon td-switch__icon--off" data-td-icon="close">${ICON.close}</span>`
      + `<span class="td-switch__icon td-switch__icon--on" data-td-icon="check">${ICON.check}</span></span></span>`
    : '<span class="td-checkbox__mark" aria-hidden="true">'
      + `<span class="td-checkbox__icon" data-td-icon="check" data-td-icon-class="td-checkbox__svg">${ICON.checkbox}</span></span>`;
  assert.equal(m[2], deco + (label !== '' ? `<span class="${block}__label">${esc(label)}</span>` : ''), `${c.id}: parts`);
}

describe('php/td.php — SSR element mode for td_field / td_toggle / td_checkbox (v0.26.0, ADR 0012)', opts, () => {
  test('native output is byte-identical to v0.25 (every fixture case + mode case, element off / absent)', () => {
    const all = [...FORM_FIXTURES.cases, ...FORM_FIXTURES.modeCases];
    // the same call order as test/ssr/form.native.json (generated ids are a per-request counter)
    const absent = runPhp(all.map((c) => ({ fn: c.fn, args: c.args })), { baseUrl: BASE });
    const off = runPhp(all.map((c) => ({ fn: c.fn, args: withMode(c.args, false) })), { baseUrl: BASE, options: { ssr_elements: true } });
    all.forEach((c, i) => {
      assert.equal(absent[i].out, NATIVE[c.id], `${c.id}: native (absent)`);
      assert.equal(off[i].out, NATIVE[c.id], `${c.id}: native (element => false under ssr_elements)`);
    });
  });

  test('mode: global ssr_elements off/on × per call absent/false/true', () => {
    for (const mc of FORM_FIXTURES.modeCases) {
      for (const mode of FORM_FIXTURES.modes) {
        const cfg = mode.global ? { baseUrl: BASE, options: { ssr_elements: true } } : { baseUrl: BASE };
        const [r] = runPhp([{ fn: mc.fn, args: withMode(mc.args, mode.call) }], cfg);
        assert.equal(r.error, undefined, `${mc.id} ${JSON.stringify(mode)}: ${r.message}`);
        assert.equal(r.out.startsWith(`<${TAG[mc.fn]} data-td-ssr=`), mode.element, `${mc.id} ${JSON.stringify(mode)}: ${r.out.slice(0, 80)}`);
        if (!mode.element) assert.equal(normId(r.out), normId(NATIVE[mc.id]), `${mc.id} ${JSON.stringify(mode)}: native markup`);
      }
    }
  });

  test('projection table: host attributes per option (closed set), control + parts exactly as the component renders', () => {
    const out = renderCases(FORM_FIXTURES.cases);
    for (const c of FORM_FIXTURES.cases) {
      const r = out.get(c.id);
      assert.equal(r.error, undefined, `${c.id}: ${r.message}`);
      if (c.fn === 'td_field') checkField(c, r);
      else checkCheckable(c, r);
      assert.ok(!/<script|<img|<b>|<i>/i.test(r.out), `${c.id}: payload leaked`);
      // attribute NAMES only (quoted values are escaped text, e.g. `value="&lt;img … onerror=…"`)
      const tags = r.out.replace(/="[^"]*"/g, '=""').match(/<[a-z][^>]*>/gi);
      assert.ok(!tags.some((t) => /\son[a-z]+[\s=>]/i.test(t)), `${c.id}: event handler leaked`);
    }
  });

  test('reservation: owned names in attrs / input_attrs never reach the control / host (case-insensitive); data-td-* blocked', () => {
    const out = renderCases(FORM_FIXTURES.cases.filter((c) => c.dropOnControl));
    for (const [id, r] of out) {
      const c = FORM_FIXTURES.cases.find((x) => x.id === id);
      const html = r.out;
      assert.ok(!/data-td-(?!ssr="(?:input-field|toggle|checkbox)@1"|icon="(?:close|check)"|icon-class="td-checkbox__svg")/i.test(html), `${id}: data-td-*: ${html}`);
      assert.ok(!/evil|"x@1"|"radio"|role="button"/.test(html), `${id}: ${html}`);
      assert.ok(html.includes('data-y="2"') || html.includes('data-z="3"'), `${id}: genuine data-* kept`);
      if (c.fn !== 'td_field') assert.ok(html.includes('data-w="4"'), `${id}: genuine host data-* kept`);
    }
  });

  test('id rules: caller id = control id, host {id}-host / generated td-{name}-{n}; field-id; ids unique in a request', () => {
    const res = runPhp([
      { fn: 'td_field', args: ['email', '', { id: 'login-email', label: 'E', element: true }] },
      { fn: 'td_field', args: ['email', '', { label: 'E', element: true }] },
      { fn: 'td_field', args: ['email', '', { label: 'E', element: true }] },
      { fn: 'td_toggle', args: ['a[b]', false, 'T', { id: 'tg', element: true }] },
      { fn: 'td_toggle', args: ['a[b]', false, 'T', { element: true }] },
      { fn: 'td_checkbox', args: ['', false, 'C', { element: true }] },
      { fn: 'td_checkbox', args: ['ok', false, 'C', { id: 'ok', element: true }] },
    ], { baseUrl: BASE }).map((r) => r.out);
    assert.ok(res[0].startsWith('<td-input-field data-td-ssr="input-field@1" id="login-email-host"'), res[0]);
    assert.ok(res[0].includes(' field-id="login-email"') && res[0].includes(' id="login-email" name="email"'), res[0]);
    assert.ok(res[0].includes('<label class="td-field__label" id="login-email-host-label" for="login-email">'), res[0]);
    const g1 = /id="(td-email-\d+)"/.exec(res[1])[1];
    const g2 = /id="(td-email-\d+)"/.exec(res[2])[1];
    assert.notEqual(g1, g2);
    assert.ok(!res[1].includes('field-id'), res[1]);
    assert.ok(res[1].includes(` id="${g1}-control"`) && res[1].includes(`for="${g1}-control"`), res[1]);
    assert.ok(res[3].includes(' id="tg-host"') && res[3].includes('class="td-switch__input" id="tg"'), res[3]);
    assert.match(/<td-toggle[^>]* id="([^"]+)"/.exec(res[4])[1], /^td-ab-\d+$/);
    assert.ok(!/<input[^>]* id=/.test(res[4]), 'no control id without a caller id');
    assert.match(/<td-checkbox[^>]* id="([^"]+)"/.exec(res[5])[1], /^td-\d+$/);
    assert.ok(res[6].includes(' id="ok-host"') && res[6].includes('class="td-checkbox__input" id="ok"'), res[6]);
    // no duplicate id in the whole page
    const ids = res.join('').match(/ id="[^"]+"/g);
    assert.equal(new Set(ids).size, ids.length, ids.join());
  });

  test('escaping: every host / control value is escaped (XSS cases)', () => {
    const out = renderCases(FORM_FIXTURES.cases.filter((c) => /xss/.test(c.id)));
    const f = out.get('f-xss').out;
    assert.ok(f.includes(' value="&lt;img src=x onerror=alert(1)&gt;&quot;&#039;&amp;"'), f);
    assert.ok(f.includes(' label="&lt;script&gt;alert(1)&lt;/script&gt;"') && f.includes(' name="n&quot;x"'), f);
    assert.ok(f.includes(' id="x&quot;y-host"') && f.includes(' field-id="x&quot;y"'), f);
    const t = out.get('t-xss').out;
    assert.ok(t.includes(' value="&quot;&gt;&lt;script&gt;"') && t.includes(' aria-label="&lt;b&gt;"'), t);
    const cb = out.get('c-xss').out;
    assert.ok(cb.includes(' id="c&quot;id-host"') && cb.includes(' id="c&quot;id"') && cb.includes(' class="a b"'), cb);
    for (const html of [f, t, cb]) assert.ok(!/<script|<img/i.test(html), html);
  });

  test('textarea / counter: the parser-dropped leading newline, UTF-16 counter text, data-state="limit"', () => {
    const [ta, full, astral] = runPhp([
      { fn: 'td_field', args: ['b', '\nx', { type: 'textarea', max_length: 5, element: true }] },
      { fn: 'td_field', args: ['b', 'abc', { max_length: 3, element: true }] },
      { fn: 'td_field', args: ['b', 'a😀', { max_length: 9, element: true }] },
    ], { baseUrl: BASE }).map((r) => r.out);
    assert.ok(ta.includes('>\n\nx</textarea>') && ta.includes('>2/5 ký tự</div>'), ta);
    assert.ok(full.includes(' data-state="limit">3/3 ký tự</div>'), full);
    assert.ok(astral.includes('>3/9 ký tự</div>'), astral);
  });

  test('test/ssr/fixtures/form.html (browser fixture) is up to date', () => {
    assert.equal(readFileSync(FORM_FIXTURE_FILE, 'utf8'), renderFormFixture(), 'stale fixture: run `node test/ssr/build-form-fixture.mjs`');
  });
});

test('form fixture covers every projection-table option of the 3 helpers', opts, () => {
  const used = { td_field: new Set(), td_toggle: new Set(), td_checkbox: new Set() };
  for (const c of [...FORM_FIXTURES.cases, ...FORM_FIXTURES.modeCases]) for (const k of Object.keys(c.args.at(-1))) used[c.fn].add(k);
  for (const k of ['label', 'type', 'size', 'placeholder', 'hint', 'error', 'required', 'disabled', 'readonly', 'max_length', 'maxlength',
    'minlength', 'pattern', 'min', 'max', 'step', 'rows', 'autocomplete', 'inputmode', 'id', 'class', 'attrs']) {
    assert.ok(used.td_field.has(k), `td_field fixture misses ${k}`);
  }
  for (const fn of ['td_toggle', 'td_checkbox']) {
    for (const k of ['size', 'value', 'required', 'disabled', 'id', 'aria_label', 'class']) assert.ok(used[fn].has(k), `${fn} fixture misses ${k}`);
  }
  for (const k of ['attrs', 'input_attrs']) assert.ok(used.td_toggle.has(k), `td_toggle fixture misses ${k}`);
  for (const fn of Object.keys(TAG)) assert.ok(FORM_FIXTURES.cases.some((c) => c.global && c.fn === fn), `a global ${fn} case`);
  assert.ok(JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).exports['./input-field']);
});
