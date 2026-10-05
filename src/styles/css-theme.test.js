// v0.41.0 (plan QĐ3 / QĐ4): the auto theme is generated from the dark rules at build time (scripts/css-theme.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { expandAutoTheme, AUTO_MARK } from '../../scripts/css-theme.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const count = (s, sub) => s.split(sub).length - 1;
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, (m) => (m.includes('generated auto theme') ? m : ''));

test('a top-level dark rule in @layer gets an auto copy right after it', () => {
  const src = '@layer td.tokens {\n\t:root {\n\t\t--a: #fff;\n\t}\n\n\t:root[data-td-theme="dark"] {\n\t\tcolor-scheme: dark;\n\t\t--a: #000;\n\t}\n}\n';
  const out = expandAutoTheme(src, 't.css');
  assert.equal(out, '@layer td.tokens {\n\t:root {\n\t\t--a: #fff;\n\t}\n\n\t:root[data-td-theme="dark"] {\n\t\tcolor-scheme: dark;\n\t\t--a: #000;\n\t}\n'
    + `\t${AUTO_MARK}\n\t@media (prefers-color-scheme: dark) {\n\t\t:root[data-td-theme="auto"] {\n\t\t\tcolor-scheme: dark;\n\t\t\t--a: #000;\n\t\t}\n\t}\n}\n`);
});

test('a dark rule nested in @supports keeps its @supports (the copy is emitted inside it)', () => {
  const src = '@layer td.tokens {\n\t@supports (color: color-mix(in srgb, red 50%, blue)) {\n\t\t:root {\n\t\t\t--b: 1;\n\t\t}\n\n\t\t:root[data-td-theme="dark"] {\n\t\t\t--b: 2;\n\t\t}\n\t}\n}\n';
  const out = expandAutoTheme(src, 't.css');
  const sup = out.indexOf('@supports');
  const media = out.indexOf('@media (prefers-color-scheme: dark)');
  assert.ok(media > sup, 'copy inside @supports');
  assert.match(out, /\t\t@media \(prefers-color-scheme: dark\) \{\n\t\t\t:root\[data-td-theme="auto"\] \{\n\t\t\t\t--b: 2;\n\t\t\t\}\n\t\t\}\n\t\}\n\}/);
});

test('several dark blocks / files: one copy each; comments are ignored', () => {
  const src = '/* :root[data-td-theme="auto"] { in a comment } */\n:root[data-td-theme="dark"] { --x: 1; }\n.a { color: red; }\n:root[data-td-theme="dark"] {\n\t/* note */\n\t--y: 2;\n}\n';
  const out = expandAutoTheme(src, 't.css');
  assert.equal(count(out, '@media (prefers-color-scheme: dark)'), 2);
  assert.equal(count(code(out), ':root[data-td-theme="auto"] {'), 2);
  assert.match(out, /--y: 2;/);
});

test('hand-written auto rules are rejected — except the light branch `color-scheme: light`', () => {
  assert.throws(() => expandAutoTheme(':root[data-td-theme="auto"] { --a: 1; }', 'x.css'), /x\.css:1: hand-written/);
  assert.throws(() => expandAutoTheme('@media (prefers-color-scheme: dark) { :root[data-td-theme=auto] { --a: 1; } }', 'x.css'), /hand-written/);
  assert.doesNotThrow(() => expandAutoTheme(':root[data-td-theme="auto"] { color-scheme: light; }', 'x.css'));
  assert.throws(() => expandAutoTheme(':root[data-td-theme="auto"] { color-scheme: light; --a: 1; }', 'x.css'), /hand-written/);
});

test('dark selectors of another shape are rejected (they would get no auto copy)', () => {
  for (const sel of ['html[data-td-theme="dark"]', ':root[data-td-theme=dark]', ':root[data-td-theme="dark"] .x', ':root, :root[data-td-theme="dark"]']) {
    assert.throws(() => expandAutoTheme(`${sel} { --a: 1; }`, 'x.css'), /dark selector/, sel);
  }
});

test('idempotent: expanding the output again changes nothing', () => {
  const src = '@layer td.tokens {\n\t:root[data-td-theme="dark"] {\n\t\t--a: #000;\n\t}\n}\n';
  const once = expandAutoTheme(src, 't.css');
  assert.equal(expandAutoTheme(once, 't.css'), once);
});

test('td.css: every dark rule has its generated auto copy (built from every source file)', () => {
  const td = code(readFileSync(join(ROOT, 'td.css'), 'utf8'));
  const dark = count(td, ':root[data-td-theme="dark"] {');
  assert.ok(dark >= 20, `dark rules: ${dark}`);
  assert.equal(count(td, AUTO_MARK), dark);
  assert.equal(count(td, '@media (prefers-color-scheme: dark) {'), dark);
});
