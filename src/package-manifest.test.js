import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

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

test('v0.18.0 F5: ./alert export, sideEffects, barrel TdAlert, badge + alert CSS in the td.css manifest', async () => {
  assert.equal(pkg.exports['./alert'], './src/feedback/td-alert.js');
  assert.ok(pkg.sideEffects.includes('./src/feedback/td-alert.js'));
  const src = await readFile(join(ROOT, 'index.js'), 'utf8');
  assert.match(src, /export \{ TdAlert \} from '\.\/src\/feedback\/td-alert\.js';/);
  const { files } = JSON.parse(await readFile(join(ROOT, 'src/styles/manifest.json'), 'utf8'));
  for (const f of ['components/badge.css', 'components/alert.css']) {
    assert.ok(files.includes(f), f);
    assert.ok(files.indexOf(f) < files.indexOf('utilities.css'), `${f} before utilities.css`);
  }
  const css = await readFile(join(ROOT, 'td.css'), 'utf8');
  for (const sel of ['.td-badge--stamp', '.td-badge--outline', '.td-alert--danger', '.td-alert__close']) assert.ok(css.includes(sel), sel);
});

test('v0.18.0 F5: npm pack ships td-alert.js, badge.css and alert.css (not its tests / stories)', { timeout: 60000 }, () => {
  const r = spawnSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const paths = JSON.parse(r.stdout)[0].files.map((f) => f.path);
  for (const f of ['src/feedback/td-alert.js', 'src/styles/components/badge.css', 'src/styles/components/alert.css', 'php/td.php', 'td.css']) {
    assert.ok(paths.includes(f), f);
  }
  assert.ok(!paths.some((p) => /td-v018-alert|td-alert\.stories/.test(p)), 'tests / stories not shipped');
});

test('v0.23.0: ./media-grid export, sideEffects, barrel TdMediaGrid, media-grid.css in the td.css manifest', async () => {
  assert.equal(pkg.exports['./media-grid'], './src/display/td-media-grid.js');
  assert.ok(pkg.sideEffects.includes('./src/display/td-media-grid.js'));
  const src = await readFile(join(ROOT, 'index.js'), 'utf8');
  assert.match(src, /export \{ TdMediaGrid \} from '\.\/src\/display\/td-media-grid\.js';/);
  const { files } = JSON.parse(await readFile(join(ROOT, 'src/styles/manifest.json'), 'utf8'));
  assert.ok(files.includes('components/media-grid.css'));
  assert.ok(files.indexOf('components/media-grid.css') < files.indexOf('utilities.css'), 'media-grid.css before utilities.css');
  const css = await readFile(join(ROOT, 'td.css'), 'utf8');
  for (const sel of ['.td-media-grid__tick', '.td-media-grid__item[data-selected]', '--td-media-grid-tick-on-bg']) assert.ok(css.includes(sel), sel);
});

test('v0.23.0: npm pack ships td-media-grid.js and media-grid.css (not its tests / stories)', { timeout: 60000 }, () => {
  const r = spawnSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const paths = JSON.parse(r.stdout)[0].files.map((f) => f.path);
  for (const f of ['src/display/td-media-grid.js', 'src/styles/components/media-grid.css']) assert.ok(paths.includes(f), f);
  assert.ok(!paths.some((p) => /td-v023-media-grid|td-media-grid\.stories/.test(p)), 'tests / stories not shipped');
});

test('v0.27.0: ./otp-input ./drawer ./copy exports, sideEffects, barrel, CSS (otp / drawer / copy / skeleton) in the td.css manifest', async () => {
  assert.equal(pkg.exports['./otp-input'], './src/form/td-otp-input.js');
  assert.equal(pkg.exports['./drawer'], './src/feedback/td-drawer.js');
  assert.equal(pkg.exports['./copy'], './src/display/td-copy.js');
  for (const f of ['./src/form/td-otp-input.js', './src/feedback/td-drawer.js', './src/display/td-copy.js']) assert.ok(pkg.sideEffects.includes(f), f);
  const src = await readFile(join(ROOT, 'index.js'), 'utf8');
  assert.match(src, /export \{ TdOtpInput \} from '\.\/src\/form\/td-otp-input\.js';/);
  assert.match(src, /export \{ TdDrawer \} from '\.\/src\/feedback\/td-drawer\.js';/);
  assert.match(src, /export \{ TdCopy \} from '\.\/src\/display\/td-copy\.js';/);
  const { files } = JSON.parse(await readFile(join(ROOT, 'src/styles/manifest.json'), 'utf8'));
  for (const f of ['components/skeleton.css', 'components/otp-input.css', 'components/drawer.css', 'components/copy.css']) {
    assert.ok(files.includes(f), f);
    assert.ok(files.indexOf(f) < files.indexOf('utilities.css'), `${f} before utilities.css`);
  }
  const css = await readFile(join(ROOT, 'td.css'), 'utf8');
  for (const sel of ['.td-skeleton--text', '.td-skeleton--circle', '.td-skeleton--rect', '--td-skeleton-bg', '--td-skeleton-shine',
    '.td-otp__cell', '.td-drawer-root', '.td-drawer__panel', '.td-copy__source', 'td-copy:not(:defined)', 'td-drawer:not(:defined)']) {
    assert.ok(css.includes(sel), sel);
  }
});

test('v0.27.0: npm pack ships the new modules + CSS (not their tests / stories)', { timeout: 60000 }, () => {
  const r = spawnSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const paths = JSON.parse(r.stdout)[0].files.map((f) => f.path);
  for (const f of ['src/form/td-otp-input.js', 'src/feedback/td-drawer.js', 'src/feedback/dialog-layer.js', 'src/display/td-copy.js',
    'src/styles/components/skeleton.css', 'src/styles/components/otp-input.css', 'src/styles/components/drawer.css',
    'src/styles/components/copy.css']) assert.ok(paths.includes(f), f);
  assert.ok(!paths.some((p) => /\.(engines|ssr)\.browser-test\.js$|td-(otp-input|drawer|copy)\.stories/.test(p)), 'tests / stories not shipped');
});

test('v0.29.0: ./tree + ./tree-select exports, sideEffects, barrel, tree CSS in the td.css manifest before utilities', async () => {
  assert.equal(pkg.exports['./tree'], './src/form/td-tree.js');
  assert.equal(pkg.exports['./tree-select'], './src/form/td-tree-select.js');
  for (const f of ['./src/form/td-tree.js', './src/form/td-tree-select.js']) assert.ok(pkg.sideEffects.includes(f), f);
  const src = await readFile(join(ROOT, 'index.js'), 'utf8');
  assert.match(src, /export \{ TdTree \} from '\.\/src\/form\/td-tree\.js';/);
  assert.match(src, /export \{ TdTreeSelect \} from '\.\/src\/form\/td-tree-select\.js';/);
  const { files } = JSON.parse(await readFile(join(ROOT, 'src/styles/manifest.json'), 'utf8'));
  for (const f of ['components/tree.css', 'components/tree-select.css']) {
    assert.ok(files.includes(f), f);
    assert.ok(files.indexOf(f) > files.indexOf('components/copy.css') && files.indexOf(f) < files.indexOf('utilities.css'), f);
  }
});

test('v0.30.0: ./repeater export, sideEffects, barrel, repeater CSS in the td.css manifest before utilities', async () => {
  assert.equal(pkg.exports['./repeater'], './src/form/td-repeater.js');
  assert.ok(pkg.sideEffects.includes('./src/form/td-repeater.js'));
  const src = await readFile(join(ROOT, 'index.js'), 'utf8');
  assert.match(src, /export \{ TdRepeater \} from '\.\/src\/form\/td-repeater\.js';/);
  assert.ok(!/ordered-collection/.test(src), 'OrderedCollectionModel stays internal');
  assert.ok(!Object.values(pkg.exports).some((t) => /ordered-collection/.test(t)), 'no ordered-collection export');
  const { files } = JSON.parse(await readFile(join(ROOT, 'src/styles/manifest.json'), 'utf8'));
  assert.ok(files.includes('components/repeater.css'));
  assert.ok(files.indexOf('components/repeater.css') > files.indexOf('components/tree-select.css')
    && files.indexOf('components/repeater.css') < files.indexOf('utilities.css'));
});

test('v0.30.0: ./number-input export, sideEffects, barrel, number-input CSS before repeater / utilities, number-format internal', async () => {
  assert.equal(pkg.exports['./number-input'], './src/form/td-number-input.js');
  assert.ok(pkg.sideEffects.includes('./src/form/td-number-input.js'));
  const src = await readFile(join(ROOT, 'index.js'), 'utf8');
  assert.match(src, /export \{ TdNumberInput \} from '\.\/src\/form\/td-number-input\.js';/);
  assert.ok(!Object.values(pkg.exports).some((t) => /number-format/.test(t)), 'number-format stays internal');
  const { files } = JSON.parse(await readFile(join(ROOT, 'src/styles/manifest.json'), 'utf8'));
  const i = files.indexOf('components/number-input.css');
  assert.ok(i > files.indexOf('components/tree-select.css') && i < files.indexOf('components/repeater.css') && i < files.indexOf('utilities.css'));
});
