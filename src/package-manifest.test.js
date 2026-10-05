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

test('v0.31.0: ./sortable export, sideEffects, barrel, sortable CSS after repeater (and media-grid) before utilities; controller / geometry internal', async () => {
  assert.equal(pkg.exports['./sortable'], './src/display/td-sortable.js');
  assert.ok(pkg.sideEffects.includes('./src/display/td-sortable.js'));
  const src = await readFile(join(ROOT, 'index.js'), 'utf8');
  assert.match(src, /export \{ TdSortable \} from '\.\/src\/display\/td-sortable\.js';/);
  assert.ok(!/sortable-(controller|geometry)/.test(src), 'controller / geometry stay internal');
  assert.ok(!Object.values(pkg.exports).some((t) => /sortable-(controller|geometry)/.test(t)), 'no controller / geometry export');
  const { files } = JSON.parse(await readFile(join(ROOT, 'src/styles/manifest.json'), 'utf8'));
  const i = files.indexOf('components/sortable.css');
  assert.ok(i > files.indexOf('components/repeater.css') && i > files.indexOf('components/media-grid.css') && i < files.indexOf('utilities.css'));
});

test('v0.31.0: ./masked-value export, sideEffects, barrel, masked-value CSS after sortable before utilities', async () => {
  assert.equal(pkg.exports['./masked-value'], './src/display/td-masked-value.js');
  assert.ok(pkg.sideEffects.includes('./src/display/td-masked-value.js'));
  const src = await readFile(join(ROOT, 'index.js'), 'utf8');
  assert.match(src, /export \{ TdMaskedValue \} from '\.\/src\/display\/td-masked-value\.js';/);
  const { files } = JSON.parse(await readFile(join(ROOT, 'src/styles/manifest.json'), 'utf8'));
  const i = files.indexOf('components/masked-value.css');
  assert.ok(i > files.indexOf('components/sortable.css') && i < files.indexOf('utilities.css'));
});

test('v0.35.0: ./cropper export, sideEffects, barrel TdCropper, cropper CSS in the td.css manifest before utilities; crop dialog / geometry internal', async () => {
  assert.equal(pkg.exports['./cropper'], './src/form/td-cropper.js');
  assert.ok(pkg.sideEffects.includes('./src/form/td-cropper.js'));
  assert.ok(!pkg.sideEffects.includes('./src/feedback/crop-dialog.js'), 'crop-dialog defines no element');
  const src = await readFile(join(ROOT, 'index.js'), 'utf8');
  assert.match(src, /export \{ TdCropper \} from '\.\/src\/form\/td-cropper\.js';/);
  assert.ok(!/crop-(dialog|geometry)/.test(src), 'crop dialog / geometry stay internal');
  assert.ok(!Object.values(pkg.exports).some((t) => /crop-(dialog|geometry)/.test(t)), 'no crop-dialog / crop-geometry export');
  const { files } = JSON.parse(await readFile(join(ROOT, 'src/styles/manifest.json'), 'utf8'));
  const i = files.indexOf('components/cropper.css');
  assert.ok(i > files.indexOf('components/modal.css') && i < files.indexOf('utilities.css'), 'cropper.css after modal.css, before utilities.css');
  const css = await readFile(join(ROOT, 'td.css'), 'utf8');
  for (const sel of ['td-cropper:not(:defined)', '.td-cropper__box', '.td-cropper__handle--corner', '.td-cropper__focal',
    '@container td-cropper (width < 480px)', '.td-crop-dialog__cropper', '--td-cropper-h', '--td-cropper-dim', '--td-cropper-line-contrast']) {
    assert.ok(css.includes(sel), sel);
  }
});

test('v0.36.0: ./action-button export, sideEffects, barrel TdActionButton, action-button CSS right after button.css; button-structure internal', async () => {
  assert.equal(pkg.exports['./action-button'], './src/form/td-action-button.js');
  assert.ok(pkg.sideEffects.includes('./src/form/td-action-button.js'));
  assert.ok(!pkg.sideEffects.includes('./src/form/button-structure.js'), 'button-structure defines no element');
  const src = await readFile(join(ROOT, 'index.js'), 'utf8');
  assert.match(src, /export \{ TdActionButton \} from '\.\/src\/form\/td-action-button\.js';/);
  assert.ok(!/button-structure/.test(src), 'button-structure stays internal');
  assert.ok(!Object.values(pkg.exports).some((t) => /button-structure/.test(t)), 'no button-structure export');
  const { files } = JSON.parse(await readFile(join(ROOT, 'src/styles/manifest.json'), 'utf8'));
  const i = files.indexOf('components/action-button.css');
  assert.ok(i > files.indexOf('components/button.css') && i < files.indexOf('utilities.css'), 'action-button.css after button.css, before utilities.css');
  const css = await readFile(join(ROOT, 'td.css'), 'utf8');
  for (const sel of ['.td-btn.td-btn--action', '.td-btn--action-warning', '.td-btn--action-danger', '.td-action-group',
    'td-action-button:not(:defined)', '--td-action-btn-size-md', '--td-action-btn-danger-hover-bg']) {
    assert.ok(css.includes(sel), sel);
  }
});

test('v0.38.0: ./scan-input export, sideEffects, barrel TdScanInput, scan-input CSS before utilities; scan-burst / beep internal', async () => {
  assert.equal(pkg.exports['./scan-input'], './src/form/td-scan-input.js');
  assert.ok(pkg.sideEffects.includes('./src/form/td-scan-input.js'));
  const src = await readFile(join(ROOT, 'index.js'), 'utf8');
  assert.match(src, /export \{ TdScanInput \} from '\.\/src\/form\/td-scan-input\.js';/);
  assert.ok(!/scan-burst|utils\/beep/.test(src), 'scan-burst / beep stay internal');
  assert.ok(!Object.values(pkg.exports).some((t) => /scan-burst|utils\/beep/.test(t)), 'no scan-burst / beep export');
  const { files } = JSON.parse(await readFile(join(ROOT, 'src/styles/manifest.json'), 'utf8'));
  const i = files.indexOf('components/scan-input.css');
  assert.ok(i > files.indexOf('components/field.css') && i < files.indexOf('utilities.css'), 'scan-input.css after field.css, before utilities.css');
  const css = await readFile(join(ROOT, 'td.css'), 'utf8');
  for (const sel of ['.td-scan__input', '.td-scan__status[data-state="ready"]', '.td-scan__list', '@container td-scan-input (width < 480px)',
    'td-scan-input:defined .td-scan__fallback', '--td-scan-list-max', '--td-scan-ready']) {
    assert.ok(css.includes(sel), sel);
  }
});

test('v0.39.0: ./filter-chips export, sideEffects, barrel TdFilterChips, filter-chips CSS before utilities; model internal', async () => {
  assert.equal(pkg.exports['./filter-chips'], './src/display/td-filter-chips.js');
  assert.ok(pkg.sideEffects.includes('./src/display/td-filter-chips.js'));
  assert.ok(!Object.values(pkg.exports).includes('./src/utils/filter-chips-model.js'), 'the model stays internal');
  const src = await readFile(join(ROOT, 'index.js'), 'utf8');
  assert.match(src, /export \{ TdFilterChips \} from '\.\/src\/display\/td-filter-chips\.js';/);
  const { files } = JSON.parse(await readFile(join(ROOT, 'src/styles/manifest.json'), 'utf8'));
  const i = files.indexOf('components/filter-chips.css');
  assert.ok(i > 0 && i < files.indexOf('utilities.css'));
});

test('v0.40.0: ./datetime-range export, sideEffects, barrel TdDatetimeRange, datetime-range CSS before utilities; panel / presets internal', async () => {
  assert.equal(pkg.exports['./datetime-range'], './src/form/td-datetime-range.js');
  assert.ok(pkg.sideEffects.includes('./src/form/td-datetime-range.js'));
  const src = await readFile(join(ROOT, 'index.js'), 'utf8');
  assert.match(src, /export \{ TdDatetimeRange \} from '\.\/src\/form\/td-datetime-range\.js';/);
  assert.ok(!/datetime-panel|date-presets/.test(src), 'datetime-panel / date-presets stay internal');
  assert.ok(!Object.values(pkg.exports).some((t) => /datetime-panel|date-presets/.test(t)), 'no datetime-panel / date-presets export');
  const { files } = JSON.parse(await readFile(join(ROOT, 'src/styles/manifest.json'), 'utf8'));
  const i = files.indexOf('components/datetime-range.css');
  assert.ok(i > files.indexOf('components/datetime-picker.css') && i < files.indexOf('utilities.css'), 'datetime-range.css after datetime-picker.css, before utilities.css');
  const css = await readFile(join(ROOT, 'td.css'), 'utf8');
  for (const sel of ['.td-dtr__trigger', '.td-dtr-panel__preset[aria-pressed="true"]', '.td-dtr-panel__switch',
    'td-datetime-range:not(:defined) .td-dtr__trigger', '--td-dtr-preset-on-bg']) {
    assert.ok(css.includes(sel), sel);
  }
});

test('v0.42.0: ./theme subpath (pure: not in sideEffects); the palette golden is not shipped from src', () => {
  assert.equal(pkg.exports['./theme'], './src/theme/index.js');
  assert.ok(!pkg.sideEffects.some((f) => f.startsWith('./src/theme/')), 'theme modules have no side effect');
});

test('v0.42.0: the td-theme bin is declared and shipped (executable, not its test)', { timeout: 60000 }, async () => {
  assert.deepEqual(pkg.bin, { 'td-theme': 'bin/td-theme.mjs' });
  const { statSync } = await import('node:fs');
  assert.ok(statSync(join(ROOT, 'bin', 'td-theme.mjs')).mode & 0o111, 'executable');
  assert.match(await readFile(join(ROOT, 'bin', 'td-theme.mjs'), 'utf8'), /^#!\/usr\/bin\/env node\n/);
  const r = spawnSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const paths = JSON.parse(r.stdout)[0].files.map((f) => f.path);
  for (const f of ['bin/td-theme.mjs', 'src/theme/index.js', 'src/theme/palette.js', 'src/theme/color.js', 'src/theme/serialize.js',
    'src/theme/presets.js', 'src/theme/selectors.js', 'src/theme/tokens.js']) assert.ok(paths.includes(f), f);
  assert.ok(!paths.some((p) => /\.test\.(m?js)$/.test(p)), 'no tests shipped');
});

test('v0.44.0: trackFormDirty is a named export of ./form-validation and of index.js', async () => {
  assert.equal(pkg.exports['./form-validation'], './src/utils/form-validation.js');
  const fv = await readFile(join(ROOT, 'src/utils/form-validation.js'), 'utf8');
  assert.match(fv, /export \{ trackFormDirty \} from '\.\/form-dirty\.js';/);
  const index = await readFile(join(ROOT, 'index.js'), 'utf8');
  assert.match(index, /export \{ TdFormValidation, trackFormDirty \} from '\.\/src\/utils\/form-validation\.js';/);
});

test('v0.45.0: ./steps + ./timeline exports, sideEffects, barrel TdSteps / TdTimeline, CSS before utilities; models internal', async () => {
  assert.equal(pkg.exports['./steps'], './src/display/td-steps.js');
  assert.equal(pkg.exports['./timeline'], './src/display/td-timeline.js');
  for (const f of ['./src/display/td-steps.js', './src/display/td-timeline.js']) assert.ok(pkg.sideEffects.includes(f), f);
  for (const m of ['steps-model', 'timeline-model', 'ssr-tree']) {
    assert.ok(!Object.values(pkg.exports).includes(`./src/utils/${m}.js`), `${m} stays internal`);
  }
  const src = await readFile(join(ROOT, 'index.js'), 'utf8');
  assert.match(src, /export \{ TdSteps \} from '\.\/src\/display\/td-steps\.js';/);
  assert.match(src, /export \{ TdTimeline \} from '\.\/src\/display\/td-timeline\.js';/);
  const { files } = JSON.parse(await readFile(join(ROOT, 'src/styles/manifest.json'), 'utf8'));
  for (const f of ['components/steps.css', 'components/timeline.css']) {
    const i = files.indexOf(f);
    assert.ok(i > files.indexOf('components/skeleton.css') && i < files.indexOf('utilities.css'), f);
  }
  const css = await readFile(join(ROOT, 'td.css'), 'utf8');
  for (const sel of ['.td-steps__marker', '@container td-steps (width < 480px)', '--td-steps-marker', '.td-timeline__summary',
    '@container td-timeline (width < 480px)', '--td-timeline-connector']) {
    assert.ok(css.includes(sel), sel);
  }
});

test('v0.46.0: ./diff export, sideEffects, barrel TdDiff, diff CSS before utilities; model + markup internal', async () => {
  assert.equal(pkg.exports['./diff'], './src/display/td-diff.js');
  assert.ok(pkg.sideEffects.includes('./src/display/td-diff.js'));
  for (const m of ['./src/utils/diff-model.js', './src/utils/diff-markup.js']) assert.ok(!Object.values(pkg.exports).includes(m), `${m} stays internal`);
  const src = await readFile(join(ROOT, 'index.js'), 'utf8');
  assert.match(src, /export \{ TdDiff \} from '\.\/src\/display\/td-diff\.js';/);
  const { files } = JSON.parse(await readFile(join(ROOT, 'src/styles/manifest.json'), 'utf8'));
  const i = files.indexOf('components/diff.css');
  assert.ok(i > 0 && i < files.indexOf('utilities.css'));
});
