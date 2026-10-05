// v0.41.0 (plan QĐ3 / QĐ4): the auto theme is generated from the dark rules at build time (scripts/css-theme.mjs).
// v0.42.0 (QĐ15, ADR 0020): scoped selectors (src/theme/selectors.js) + the colour / geometry scope lint.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { expandAutoTheme, AUTO_MARK, checkThemeScope, DARK_SELECTOR, AUTO_DARK_SELECTOR, BASE_SELECTOR } from '../../scripts/css-theme.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const count = (s, sub) => s.split(sub).length - 1;
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, (m) => (m.includes('generated auto theme') ? m : ''));

test('a top-level dark rule in @layer gets an auto copy right after it', () => {
  const src = '@layer td.tokens {\n\t:root {\n\t\t--a: #fff;\n\t}\n\n\t:root[data-td-theme="dark"], [data-td-theme][data-td-theme="dark"] {\n\t\tcolor-scheme: dark;\n\t\t--a: #000;\n\t}\n}\n';
  const out = expandAutoTheme(src, 't.css');
  assert.equal(out, '@layer td.tokens {\n\t:root {\n\t\t--a: #fff;\n\t}\n\n\t:root[data-td-theme="dark"], [data-td-theme][data-td-theme="dark"] {\n\t\tcolor-scheme: dark;\n\t\t--a: #000;\n\t}\n'
    + `\t${AUTO_MARK}\n\t@media (prefers-color-scheme: dark) {\n\t\t:root[data-td-theme="auto"], [data-td-theme][data-td-theme="auto"] {\n\t\t\tcolor-scheme: dark;\n\t\t\t--a: #000;\n\t\t}\n\t}\n}\n`);
});

test('a dark rule nested in @supports keeps its @supports (the copy is emitted inside it)', () => {
  const src = '@layer td.tokens {\n\t@supports (color: color-mix(in srgb, red 50%, blue)) {\n\t\t:root {\n\t\t\t--b: 1;\n\t\t}\n\n\t\t:root[data-td-theme="dark"], [data-td-theme][data-td-theme="dark"] {\n\t\t\t--b: 2;\n\t\t}\n\t}\n}\n';
  const out = expandAutoTheme(src, 't.css');
  const sup = out.indexOf('@supports');
  const media = out.indexOf('@media (prefers-color-scheme: dark)');
  assert.ok(media > sup, 'copy inside @supports');
  assert.match(out, /\t\t@media \(prefers-color-scheme: dark\) \{\n\t\t\t:root\[data-td-theme="auto"\], \[data-td-theme\]\[data-td-theme="auto"\] \{\n\t\t\t\t--b: 2;\n\t\t\t\}\n\t\t\}\n\t\}\n\}/);
});

test('several dark blocks / files: one copy each; comments are ignored', () => {
  const src = '/* :root[data-td-theme="auto"] { in a comment } */\n:root[data-td-theme="dark"], [data-td-theme][data-td-theme="dark"] { --x: 1; }\n.a { color: red; }\n:root[data-td-theme="dark"], [data-td-theme][data-td-theme="dark"] {\n\t/* note */\n\t--y: 2;\n}\n';
  const out = expandAutoTheme(src, 't.css');
  assert.equal(count(out, '@media (prefers-color-scheme: dark)'), 2);
  assert.equal(count(code(out), `${AUTO_DARK_SELECTOR} {`), 2);
  assert.match(out, /--y: 2;/);
});

test('hand-written auto rules are rejected — except the light branch `color-scheme: light`', () => {
  assert.throws(() => expandAutoTheme(':root[data-td-theme="auto"] { --a: 1; }', 'x.css'), /x\.css:1: hand-written/);
  assert.throws(() => expandAutoTheme('@media (prefers-color-scheme: dark) { :root[data-td-theme=auto] { --a: 1; } }', 'x.css'), /hand-written/);
  assert.doesNotThrow(() => expandAutoTheme('[data-td-theme="light"], [data-td-theme="auto"] { color-scheme: light; }', 'x.css'));
  assert.throws(() => expandAutoTheme('[data-td-theme="light"], [data-td-theme="auto"] { color-scheme: light; --a: 1; }', 'x.css'), /hand-written/);
  assert.throws(() => expandAutoTheme(':root[data-td-theme="auto"] { color-scheme: light; }', 'x.css'), /hand-written/, 'v0.41 form');
});

test('dark selectors of another shape are rejected (they would get no auto copy)', () => {
  for (const sel of ['html[data-td-theme="dark"]', ':root[data-td-theme=dark]', ':root[data-td-theme="dark"] .x', ':root, :root[data-td-theme="dark"]',
    ':root[data-td-theme="dark"]', '[data-td-theme="dark"]']) {
    assert.throws(() => expandAutoTheme(`${sel} { --a: 1; }`, 'x.css'), /dark selector/, sel);
  }
});

test('idempotent: expanding the output again changes nothing', () => {
  const src = '@layer td.tokens {\n\t:root[data-td-theme="dark"], [data-td-theme][data-td-theme="dark"] {\n\t\t--a: #000;\n\t}\n}\n';
  const once = expandAutoTheme(src, 't.css');
  assert.equal(expandAutoTheme(once, 't.css'), once);
});

test('td.css: every dark rule has its generated auto copy (built from every source file)', () => {
  const td = code(readFileSync(join(ROOT, 'td.css'), 'utf8'));
  const dark = count(td, `${DARK_SELECTOR} {`);
  assert.ok(dark >= 20, `dark rules: ${dark}`);
  assert.equal(count(td, AUTO_MARK), dark);
  assert.equal(count(td, '@media (prefers-color-scheme: dark) {'), dark);
});

test('v0.42.0: other theme selectors are rejected; the base slot and the light-scheme rule pass', () => {
  assert.doesNotThrow(() => expandAutoTheme(`${BASE_SELECTOR} { --a: #fff; }`, 'x.css'));
  for (const sel of ['[data-td-theme="beige"]', '.x[data-td-theme]', ':root:not([data-td-theme="dark"])']) {
    assert.throws(() => expandAutoTheme(`${sel} { --a: 1; }`, 'x.css'), /(theme|dark) selector/, sel);
  }
});

test('v0.42.0 checkThemeScope: colour tokens on the scope block, geometry on :root — both directions', () => {
  const ok = [{ file: 'a.css', css: `:root { --td-x-h: 40px; --td-gray-1: #eee; --td-lb-bg: #000; }\n${BASE_SELECTOR} { --td-x-bg: var(--td-y); --td-x-fg: #111; }\n${DARK_SELECTOR} { --td-y: #222; }` }];
  assert.deepEqual(checkThemeScope(ok), []);
  const colourOnRoot = [{ file: 'b.css', css: ':root { --td-x-bg: rgb(0 0 0 / 5%); --td-x-h: 1px; }' }];
  assert.match(checkThemeScope(colourOnRoot)[0], /^b\.css:1: colour token\(s\) on :root only .*--td-x-bg$/);
  const viaVar = [{ file: 'c.css', css: `${BASE_SELECTOR} { --td-a: #fff; }\n:root { --td-b: var(--td-a); }` }];
  assert.match(checkThemeScope(viaVar)[0], /c\.css:2: colour token.*--td-b/);
  const darkOnly = [{ file: 'd.css', css: `:root { --td-c: 1px; }\n${DARK_SELECTOR} { --td-c: 2px; }` }];
  assert.match(checkThemeScope(darkOnly)[0], /colour token.*--td-c/, 'a token a dark rule sets is a theme token');
  const geometryScoped = [{ file: 'e.css', css: `${BASE_SELECTOR} { --td-x-pad: 4px; --td-x-bg: #fff; }` }];
  assert.match(checkThemeScope(geometryScoped)[0], /^e\.css:1: non-colour token\(s\) in a theme scope block .*--td-x-pad$/);
});

test('v0.42.0: the kit sources pass the scope lint (td.css is built from them)', () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'src', 'styles', 'manifest.json'), 'utf8'));
  const entries = manifest.files.map((f) => ({ file: f, css: readFileSync(join(ROOT, 'src', 'styles', f), 'utf8') }));
  assert.deepEqual(checkThemeScope(entries), []);
  const td = readFileSync(join(ROOT, 'td.css'), 'utf8');
  assert.ok(count(td, `${BASE_SELECTOR} {`) >= 30, 'colour blocks are scoped');
});
