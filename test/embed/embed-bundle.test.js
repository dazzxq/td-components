// v0.116.0 (ADR 0045 QĐ1/QĐ4, plan v0.116.0 "Tests"): the built embed bundle. The global-define gates (1: importing the
// bundle defines nothing globally; 3: a light-DOM import still auto-defines; 4: no direct customElements.define in the
// embed graph — gate 2, a mount defines exactly the three names in the scoped registry only, is a browser case of
// td-v116-embed.engines.browser-test.js), package isolation, freshness and the size budget.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import * as esbuild from 'esbuild';
import { buildEmbed, PLACEHOLDER } from '../../scripts/build-embed.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const ARTIFACT = join(ROOT, 'dist/embed/td-embed.js');
const artifact = readFileSync(ARTIFACT, 'utf8');
const built = await buildEmbed();

/**
 * Size budget (recorded after the first build, v0.116.0: raw 273 461 / min 141 775 / gzip 34 530 bytes, +10% headroom).
 * raw = the same bundle unminified; min = dist/embed/td-embed.js; gzip = level 9 of min. Raising it is a reviewed
 * change (docs/guides/embed.md, CHANGELOG).
 */
const BUDGET = { raw: 300_800, min: 156_000, gzip: 38_000 };

/** A DOM shim just big enough to evaluate the kit modules, with a spy on the global registry. */
function installShim() {
  const defined = [];
  const map = new Map();
  globalThis.HTMLElement ??= class {};
  globalThis.customElements = {
    get: (n) => map.get(n),
    define: (n, c) => {
      if (map.has(n)) throw new Error(`already defined: ${n}`);
      defined.push(n);
      map.set(n, c);
    },
  };
  return defined;
}

test('the committed artifact is the fresh build (check:embed), with the build id in place of the placeholder', () => {
  assert.equal(artifact, built.js);
  assert.equal(readFileSync(join(ROOT, 'dist/embed/td-embed.css'), 'utf8'), built.css);
  assert.ok(!artifact.includes(PLACEHOLDER));
  assert.match(built.build, new RegExp(`^${pkg.version.replace(/\./g, '\\.')}\\+[0-9a-f]{10}$`));
  assert.ok(artifact.includes(JSON.stringify(built.build)), 'TD_EMBED_BUILD = version+hash');
});

test('size budget: raw / min / gzip of td-embed.js', async () => {
  const raw = Buffer.byteLength((await buildEmbed({ minify: false })).js);
  const min = Buffer.byteLength(artifact);
  const gzip = gzipSync(artifact, { level: 9 }).length;
  const full = Buffer.byteLength(readFileSync(join(ROOT, 'td.css')));
  console.log(`td-embed.js raw ${raw}, min ${min}, gzip ${gzip} bytes (full td.css ${full})`);
  assert.ok(raw <= BUDGET.raw, `raw ${raw} > ${BUDGET.raw}`);
  assert.ok(min <= BUDGET.min, `min ${min} > ${BUDGET.min}`);
  assert.ok(gzip <= BUDGET.gzip, `gzip ${gzip} > ${BUDGET.gzip}`);
});

test('package isolation: ./embed is the generated artifact, which imports nothing (self-contained)', async () => {
  assert.equal(pkg.exports['./embed'], './dist/embed/td-embed.js');
  assert.ok(!Object.values(pkg.exports).some((t) => typeof t === 'string' && t.startsWith('./src/embed/')), 'src/embed is never exported');
  assert.ok(pkg.sideEffects.includes('./src/embed/suppress.js'));
  assert.ok(pkg.files.includes('dist'), 'dist/ (with dist/embed/) is packed');
  const res = await esbuild.build({
    entryPoints: [ARTIFACT], bundle: true, write: false, metafile: true, logLevel: 'silent', format: 'esm',
    plugins: [{ name: 'externals', setup(b) { b.onResolve({ filter: /.*/ }, (a) => (a.kind === 'entry-point' ? undefined : { path: a.path, external: true })); } }],
  });
  const inputs = Object.values(res.metafile.inputs);
  assert.equal(inputs.length, 1);
  assert.deepEqual(inputs[0].imports, [], 'no import / export-from in the artifact');
  const exports = Object.values(res.metafile.outputs)[0].exports.sort();
  assert.deepEqual(exports, ['TD_EMBED_BUILD', 'TdEmbedError', 'mountTdEmbed', 'registerIcons']);
});

test('the bundle carries only the icon subset (+ aliases to it) and the embed CSS, never the full registry', () => {
  assert.ok(!built.inputs.includes('src/icons/registry.js'));
  assert.ok(built.inputs.includes('td-embed:icons') && built.inputs.includes('td-embed:css'));
  assert.deepEqual(built.icons.icons, ['info', 'success', 'warning', 'error', 'close', 'eye', 'eye-off']);
  assert.deepEqual(built.icons.aliases, { x: 'close' });
  for (const absent of ['"chevron-left"', '"upload"', '"calendar"']) assert.ok(!artifact.includes(absent), absent);
});

test('gate 4: no module of the embed graph calls customElements.define directly (only defineElement)', () => {
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
  const mods = built.inputs.filter((p) => p.startsWith('src/'));
  assert.ok(mods.includes('src/form/td-button.js') && mods.includes('src/form/td-input-field.js') && mods.includes('src/feedback/td-alert.js'));
  for (const m of mods) {
    if (m === 'src/base/define.js') continue;
    assert.doesNotMatch(strip(readFileSync(join(ROOT, m), 'utf8')), /customElements\s*\.\s*define\s*\(/, m);
  }
  for (const m of ['src/form/td-button.js', 'src/form/td-input-field.js', 'src/feedback/td-alert.js']) {
    assert.match(readFileSync(join(ROOT, m), 'utf8'), /defineElement\('td-/, m);
  }
  // suppress.js is evaluated before every component module (ESM depth-first import order, kept by esbuild)
  const at = (p) => built.inputs.indexOf(p);
  assert.ok(at('src/embed/suppress.js') >= 0 && at('src/embed/suppress.js') < at('src/form/td-button.js'));
  assert.ok(at('src/embed/suppress.js') < at('src/base/td-base-element.js'));
});

test('gate 1 + 3: importing the bundle defines nothing globally; a light-DOM import afterwards still auto-defines', async () => {
  const defined = installShim();
  const embed = await import(`${new URL('../../dist/embed/td-embed.js', import.meta.url).href}?gate=1`);
  assert.deepEqual(defined, [], 'the embed bundle touched the global registry');
  assert.equal(typeof embed.mountTdEmbed, 'function');
  assert.equal(embed.TD_EMBED_BUILD, built.build);
  // a host-less call fails cleanly (validated before anything is touched)
  assert.throws(() => embed.mountTdEmbed(null), (e) => e instanceof embed.TdEmbedError && e.code === 'bad-host');
  // the normal light-DOM module in the same realm is its own module instance → defines td-button globally
  await import('../../src/form/td-button.js');
  assert.deepEqual(defined, ['td-button']);
});
