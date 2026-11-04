// v0.96.0 (plan v0.96.0-modal-wp §6.4, ADR 0042): lint of compat/td-wp-admin.css — unlayered on purpose, only
// `.td-*` selectors (each compound is `:is(.td-…)` repeated three times → 0,3,0), only `revert-layer` values, no
// !important (not even for the checkbox / radio padding leak), no @import / url( / @layer, every referenced class
// exists in td.css, the package ships it. Rendering: src/styles/td-v096-wp-admin-compat.engines.browser-test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const raw = readFileSync(new URL('../../compat/td-wp-admin.css', import.meta.url), 'utf8');
const css = raw.replace(/\/\*[\s\S]*?\*\//g, '');
const tdCss = readFileSync(new URL('../../td.css', import.meta.url), 'utf8');
const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

/** [{ selector, decls: [[prop, value]] }] — flat file, no at-rules (asserted below). */
function rules(text) {
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(text))) {
    const decls = m[2].split(';').map((d) => d.trim()).filter(Boolean).map((d) => {
      const i = d.indexOf(':');
      return [d.slice(0, i).trim(), d.slice(i + 1).trim()];
    });
    out.push({ selector: m[1].replace(/\s+/g, ' ').trim(), decls });
  }
  return out;
}

const RULES = rules(css);
const ALL_CLASSES = [...new Set(css.match(/\.td-[\w-]+/g) || [])];

/** Split a compound like `:is(a, b):is(a, b):is(a, b)::before` into its :is() argument lists + trailing pseudo-element. */
function isGroups(sel) {
  const groups = [];
  let i = 0;
  while (sel.startsWith(':is(', i)) {
    const close = sel.indexOf(')', i);
    groups.push(sel.slice(i + 4, close).split(',').map((s) => s.trim()));
    i = close + 1;
  }
  return { groups, rest: sel.slice(i) };
}

test('compat file: unlayered, no !important / @import / url( / @layer / any at-rule', () => {
  assert.doesNotMatch(css, /!important/i);
  assert.doesNotMatch(css, /@import|@layer|url\(/i);
  assert.doesNotMatch(css, /@/, 'no at-rules at all: flat unlayered rules');
  assert.doesNotMatch(css, /<\/?style/i);
  assert.ok(RULES.length >= 4, 'has the four rule groups');
});

// The one element-selector rule: td_dropdown()'s SSR <select> has no class before the upgrade.
const SSR_SELECT = 'td-dropdown:not(:defined):not(:defined):not(:defined) > select';

test('compat file: every selector is :is(.td-…) ×3 (0,3,0), identical lists, optional ::before only', () => {
  assert.equal(RULES.filter((r) => r.selector === SSR_SELECT).length, 1, 'SSR select rule (0,3,2) present once');
  for (const r of RULES) {
    if (r.selector === SSR_SELECT) continue;
    assert.doesNotMatch(r.selector, /,(?![^(]*\))/, `${r.selector}: one compound per rule (no top-level list)`);
    const { groups, rest } = isGroups(r.selector);
    assert.equal(groups.length, 3, `${r.selector}: three :is() groups → specificity 0,3,0`);
    assert.ok(rest === '' || rest === '::before', `${r.selector}: only ::before may follow`);
    for (const g of groups) {
      assert.deepEqual(g, groups[0], 'the three :is() lists match (same element, specificity only)');
      for (const s of g) assert.match(s, /^\.td-[a-z0-9]+(?:-[a-z0-9]+)*(?:__[a-z0-9-]+)?$/, `${s}: a single .td-* class`);
    }
  }
});

test('compat file: every declaration is `revert-layer` (td values are never copied)', () => {
  for (const r of RULES) {
    assert.ok(r.decls.length > 0, `${r.selector}: not empty`);
    for (const [prop, value] of r.decls) {
      assert.match(prop, /^[a-z-]+$/, `${r.selector}: property ${prop}`);
      assert.equal(value, 'revert-layer', `${r.selector} { ${prop}: ${value} }`);
    }
  }
});

test('compat file: padding of the hidden checkbox / radio inputs is NOT touched (accepted !important leak)', () => {
  const toggle = RULES.find((r) => r.selector.includes('.td-checkbox__input') && !r.selector.endsWith('::before'));
  assert.ok(toggle, 'checkbox / radio rule exists');
  assert.ok(!toggle.decls.some(([p]) => p === 'padding' || p.startsWith('padding-')), 'no padding: wp-admin has it !important');
  assert.match(raw, /padding: 0 !important[\s\S]*cannot be reverted/, 'header documents the accepted leak');
});

test('compat file: every referenced class exists in td.css (no typo)', () => {
  assert.ok(ALL_CLASSES.length > 10);
  for (const c of ALL_CLASSES) {
    assert.ok(new RegExp(`\\${c}(?![\\w-])`).test(tdCss), `${c} is a class td.css styles`);
  }
  assert.ok(tdCss.includes('td-dropdown:not(:defined) > select'), 'td.css still styles the SSR <select> this way');
});

test('compat file: covers the controls measured on wp-admin 7.1 (plan §6.2)', () => {
  const measured = ['.td-field__control', '.td-dropdown__native', '.td-otp__input', '.td-chip-input__input',
    '.td-checkbox__input', '.td-switch__input', '.td-check-matrix__input', '.td-choice__input', '.td-btn'];
  for (const c of measured) assert.ok(ALL_CLASSES.includes(c), `${c} covered`);
  const text = RULES.find((r) => r.selector.includes('.td-field__control'));
  const props = text.decls.map(([p]) => p);
  for (const p of ['border', 'border-radius', 'box-shadow', 'padding', 'min-height', 'line-height', 'color', 'background', 'margin', 'max-width']) {
    assert.ok(props.includes(p), `text-like controls revert ${p}`);
  }
  const before = RULES.find((r) => r.selector.endsWith('::before'));
  assert.ok(before.decls.some(([p]) => p === 'content'), '::before tick / dot of wp-admin removed');
  const btn = RULES.find((r) => r.selector.startsWith(':is(.td-btn)'));
  assert.ok(btn.decls.some(([p]) => p === 'font-size'), 'button font-size (13px inherit leak)');
});

test('package ships compat/ as source (exports + files), outside dist and td.css', () => {
  assert.equal(pkg.exports['./compat/td-wp-admin.css'], './compat/td-wp-admin.css');
  assert.ok(pkg.files.includes('compat'), 'files includes compat');
  assert.doesNotMatch(tdCss, /revert-layer/, 'not bundled into td.css');
});
