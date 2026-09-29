import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const pkg = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'));

/** Every shipped src module (tests and stories are not shipped). */
async function srcModules(dir = join(ROOT, 'src'), out = []) {
  for (const ent of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) await srcModules(p, out);
    else if (p.endsWith('.js') && !/\.(test|browser-test|stories)\.js$/.test(p)) out.push(p);
  }
  return out;
}

/** Source without comments (a `customElements.define` inside a JSDoc example is not a side effect). */
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

test('package.json#sideEffects lists every src module that calls customElements.define (v0.17.0 E7)', async () => {
  const listed = new Set(pkg.sideEffects);
  const definers = [];
  for (const file of await srcModules()) {
    if (/customElements\s*\.\s*define\s*\(/.test(stripComments(await readFile(file, 'utf8')))) {
      definers.push(`./${relative(ROOT, file).split('\\').join('/')}`);
    }
  }
  assert.ok(definers.length >= 15, `found ${definers.length} defining modules`);
  const missing = definers.filter((f) => !listed.has(f));
  assert.deepEqual(missing, [], `missing from sideEffects: ${missing.join(', ')}`);
  for (const f of ['./src/form/td-password-meter.js', './src/feedback/td-scroll-top.js']) assert.ok(definers.includes(f), f);
});

test('package.json#exports: v0.17.0 subpaths resolve to the component modules', () => {
  assert.equal(pkg.exports['./password-meter'], './src/form/td-password-meter.js');
  assert.equal(pkg.exports['./scroll-top'], './src/feedback/td-scroll-top.js');
});

test('package.json#exports + sideEffects: v0.18.0 td-progress / td-dropzone', () => {
  assert.equal(pkg.exports['./progress'], './src/feedback/td-progress.js');
  assert.equal(pkg.exports['./dropzone'], './src/form/td-dropzone.js');
  for (const f of ['./src/feedback/td-progress.js', './src/form/td-dropzone.js']) assert.ok(pkg.sideEffects.includes(f), f);
});

test('index.js re-exports the icon API and dom-utils by explicit name (no export *)', async () => {
  const src = await readFile(join(ROOT, 'index.js'), 'utf8');
  assert.ok(!/export\s*\*/.test(src), 'no export *');
  for (const name of ['TdPasswordMeter', 'TdScrollTop', 'TdProgress', 'TdDropzone', 'tdIcon', 'registerIcons', 'hasIcon', 'listIcons', 'fillIconSlots',
    'slugify', 'formatFileSize', 'formatNumber', 'debounce', 'throttle', 'parseColorToRgb', 'relativeLuminance',
    'contrastRatio', 'getAccessibleTextColor']) {
    assert.match(src, new RegExp(`\\b${name}\\b`), name);
  }
});
