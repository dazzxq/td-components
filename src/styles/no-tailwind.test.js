// Guard (v0.11.0): no Tailwind utility classes in rendered markup. Every class token written in a `class=` /
// `className=` string of non-test source must be a kit class (`td-*`), a story-layout helper (`sb-*`, `fd-*`) or a
// template fragment. Explanatory comments ("no Tailwind") are fine — only class strings are scanned.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.js') && !/\.(browser-)?test\.js$/.test(p)) out.push(p);
  }
  return out;
}

const ALLOWED = /^(td-|sb-|fd-)/;
// Template fragments that are not class names (e.g. the pieces of `td-btn--${variant}` around the interpolation).
const FRAGMENT = /[${}?:'"`+]|^\W*$/;

test('no Tailwind classes in rendered markup (src/**)', () => {
  const offenders = [];
  for (const file of walk('src')) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/class(?:Name)?\s*=\s*(["'`])([^"'`]*)\1/g)) {
      for (const tok of m[2].split(/\s+/).filter(Boolean)) {
        if (ALLOWED.test(tok) || FRAGMENT.test(tok)) continue;
        offenders.push(`${file}: ${tok}`);
      }
    }
  }
  assert.deepEqual(offenders, []);
});

test('no module imports Tailwind', () => {
  const offenders = walk('src').filter((f) => /(?:from|import)\s+['"][^'"]*tailwind/.test(readFileSync(f, 'utf8')));
  assert.deepEqual(offenders, []);
});
