// v0.116.0 (ADR 0045 QĐ4/Q8, plan v0.116.0 "Tests"): the embed CSS. Rewrite units (selectors, rem, the tokenizer's
// comments / strings / url()), the static checks on the built text, the custom-property quarantine (and its one
// exemption) and the token gate (consumer tokens ∪ tokens the embed uses, light and dark).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import {
  mask, rewriteRootSelector, rewriteRemValue, rewriteEmbedCss, analyzeCss, checkEmbedCss, quarantineList, declarations,
  buildEmbedCss, readEmbedManifest, REM_VAR,
} from '../../scripts/build-embed.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const R = 'var(--td-embed-rem, 16px)';
const built = await buildEmbedCss();
const committed = readFileSync(join(ROOT, 'dist/embed/td-embed.css'), 'utf8');

test('mask keeps offsets and hides comments, strings and unquoted url() bodies', () => {
  const src = `a/* :root 1rem */b "x:root 2rem" 'y;}' url(a:root.png) url( "q:root" ) c`;
  const m = mask(src);
  assert.equal(m.length, src.length);
  assert.ok(!m.includes(':root'), m);
  assert.ok(!m.includes('rem'), m);
  assert.ok(m.startsWith('a') && m.endsWith(' c'));
});

test(':root → .td-embed-root in selectors, compounds included; strings and look-alikes untouched', () => {
  assert.equal(rewriteRootSelector(':root'), '.td-embed-root');
  assert.equal(rewriteRootSelector(':root, [data-td-theme]'), '.td-embed-root, [data-td-theme]');
  assert.equal(rewriteRootSelector(':root[data-td-theme="dark"], [data-td-theme][data-td-theme="dark"]'),
    '.td-embed-root[data-td-theme="dark"], [data-td-theme][data-td-theme="dark"]');
  assert.equal(rewriteRootSelector(':root[data-td-glass="off"] :is(.a, .b)'), '.td-embed-root[data-td-glass="off"] :is(.a, .b)');
  assert.equal(rewriteRootSelector(':ROOT .x'), '.td-embed-root .x');
  assert.equal(rewriteRootSelector('[title=":root"] .x'), '[title=":root"] .x');
  assert.equal(rewriteRootSelector(':root-ish'), ':root-ish');
});

test('Nrem → calc(N * var(--td-embed-rem, 16px)) in values only', () => {
  assert.equal(rewriteRemValue(' 1rem'), ` calc(1 * ${R})`);
  assert.equal(rewriteRemValue('0.875rem'), `calc(0.875 * ${R})`);
  assert.equal(rewriteRemValue('.5rem -0.25rem +2rem'), `calc(.5 * ${R}) calc(-0.25 * ${R}) calc(+2 * ${R})`);
  assert.equal(rewriteRemValue('600 0.875rem/1.4 var(--f)'), `600 calc(0.875 * ${R})/1.4 var(--f)`);
  assert.equal(rewriteRemValue('calc(100% - 2rem)'), `calc(100% - calc(2 * ${R}))`);
  assert.equal(rewriteRemValue('1REM'), `calc(1 * ${R})`);
  // not a length: idents, strings, url(), em / px, a number glued to an ident
  for (const v of ['var(--x-1rem)', '"1rem"', 'url(a1rem.png)', '1em', '16px', 'x1rem', '--a-2rem', '1remx']) {
    assert.equal(rewriteRemValue(v), v, v);
  }
});

test('rewriteEmbedCss: declarations (custom properties too) rewritten; @media / @container / @supports preludes and comments kept', () => {
  const src = `/* :root 1rem */
@media (min-width: 40rem) { :root { --a: 1rem; } }
@container td-x (width < 30rem) { .x { padding: 0.5rem; } }
@supports (width: 1rem) { .y { margin: 2rem; content: "3rem"; } }
@keyframes k { from { inset: 1rem; } }
:root[data-td-theme="dark"] { --b: url(x1rem.png); }`;
  const out = rewriteEmbedCss(src);
  assert.match(out, /^\/\* :root 1rem \*\//);
  assert.match(out, /@media \(min-width: 40rem\)/);
  assert.match(out, /@container td-x \(width < 30rem\)/);
  assert.match(out, /@supports \(width: 1rem\)/);
  assert.match(out, new RegExp(`\\.td-embed-root \\{ --a: calc\\(1 \\* var\\(--td-embed-rem, 16px\\)\\); \\}`));
  assert.match(out, /padding: calc\(0\.5 \*/);
  assert.match(out, /margin: calc\(2 \*/);
  assert.match(out, /content: "3rem"/);
  assert.match(out, /from \{ inset: calc\(1 \*/);
  assert.match(out, /\.td-embed-root\[data-td-theme="dark"\] \{ --b: url\(x1rem\.png\); \}/);
});

test('static checks catch every rule they own', () => {
  const head = ':host{all:initial!important;display:block!important}';
  assert.deepEqual(checkEmbedCss(`${head}.td-embed-root{--a:1px}.x{color:var(--a)}`), []);
  const bad = checkEmbedCss(`.x:root{width:1rem;color:var(--nope);animation:spin 1s linear;contain:paint}@container box (width>1px){.y{color:red}}`);
  assert.ok(bad.some((e) => /:root left/.test(e)));
  assert.ok(bad.some((e) => /rem left/.test(e)));
  assert.ok(!bad.some((e) => /--nope/.test(e)), 'an undeclared var is quarantined, so it resolves');
  assert.ok(bad.some((e) => /animation "spin"/.test(e)));
  assert.ok(bad.some((e) => /@container box/.test(e)));
  assert.ok(bad.some((e) => /:host head block/.test(e)));
  assert.ok(bad.some((e) => /contain/.test(e)));
});

test('the built embed CSS passes the static checks and is the committed dist/embed/td-embed.css', () => {
  assert.deepEqual(checkEmbedCss(built.css), []);
  assert.equal(committed, `${built.css}\n`);
  const f = analyzeCss(built.css);
  assert.ok(f.keyframes.has('td-spinner-rotate') && f.animations.has('td-spinner-rotate'));
  assert.ok(f.containerNames.has('td-alert') && f.containerQueries.has('td-alert'));
  assert.ok(built.css.startsWith('@layer td.tokens,td.component,td.utilities;'), 'layer order first');
  assert.ok(!/\bcontain\s*:/.test(built.css));
  assert.match(built.css, /\.td-embed-root\{[^}]*direction:ltr;unicode-bidi:isolate;color-scheme:light\}/);
});

test('quarantine: every referenced var not declared on the root gets initial; --td-embed-rem is exempt', () => {
  assert.ok(!built.quarantine.includes(REM_VAR));
  assert.ok(built.css.includes(`var(${REM_VAR},16px)`) || built.css.includes(`var(${REM_VAR}, 16px)`));
  assert.ok(!new RegExp(`${REM_VAR}\\s*:`).test(built.css), '--td-embed-rem is never declared (it inherits from the host)');
  const decls = declarations(built.css);
  const initial = new Set(decls.filter((d) => d.value === 'initial' && d.items.includes('.td-embed-root')).map((d) => d.name));
  assert.deepEqual([...initial].sort(), built.quarantine);
  // the ones that inherit from the page in light DOM and must not here: private vars and hooks read with a fallback
  for (const v of ['--td-btn-bg', '--td-btn-bg-v', '--_td-field-h', '--td-spinner-color']) assert.ok(initial.has(v), v);
  // every public token the rules read is either declared on the root or quarantined
  const f = analyzeCss(built.css);
  for (const v of f.referenced) {
    if (v === REM_VAR) continue;
    assert.ok(f.rootDeclared.has(v), `${v}: neither declared on .td-embed-root nor quarantined`);
  }
  assert.deepEqual(quarantineList({ referenced: new Set([REM_VAR, '--a']), rootDeclared: new Set() }), ['--a']);
});

test('the embed CSS file list is the reviewed manifest (layers first, td.css order, native-select after field)', () => {
  const m = readEmbedManifest();
  const td = JSON.parse(readFileSync(join(ROOT, 'src/styles/manifest.json'), 'utf8')).files;
  assert.deepEqual(m.files, ['layers.css', 'tokens.css', 'theme-dark.css', 'components/icon.css', 'components/field.css',
    'components/native-select.css', 'components/hint.css', 'components/spinner.css', 'components/button.css',
    'components/loading.css', 'components/form-validation.css', 'components/alert.css']);
  const idx = m.files.map((f) => td.indexOf(f));
  assert.ok(idx.every((i) => i >= 0), 'every file is a td.css source');
  assert.deepEqual([...idx].sort((a, b) => a - b), idx, 'td.css order');
});

// --- token gate ------------------------------------------------------------------------------------------------------

const consumer = JSON.parse(readFileSync(join(ROOT, 'test/embed/consumer-tokens.json'), 'utf8'));
const tdDecls = declarations(readFileSync(join(ROOT, 'td.css'), 'utf8'));
const emDecls = declarations(built.css);
const layerOnly = (d) => d.conditions.every((c) => /^@layer\b/.test(c));
const DARK = '[data-td-theme=dark]';
const AUTO = '[data-td-theme=auto]';
const onScope = (decls, scope, suffix, inMedia) => new Set(decls.filter((d) => d.value !== 'initial' && d.items.includes(`${scope}${suffix}`)
  && (inMedia ? d.conditions.some((c) => /prefers-color-scheme:\s*dark/.test(c)) : layerOnly(d))).map((d) => d.name));
const td = { light: onScope(tdDecls, ':root', '', false), dark: onScope(tdDecls, ':root', DARK, false), auto: onScope(tdDecls, ':root', AUTO, true) };
const em = {
  light: onScope(emDecls, '.td-embed-root', '', false),
  dark: onScope(emDecls, '.td-embed-root', DARK, false),
  auto: onScope(emDecls, '.td-embed-root', AUTO, true),
};

test('token gate: every consumer token has a light declaration on .td-embed-root, and dark + auto where td.css has one', () => {
  assert.equal(consumer.required_light_and_dark.length, 25);
  for (const t of consumer.required_light_and_dark) {
    assert.ok(td.light.has(t), `${t}: not a td.css :root token (consumer list drifted)`);
    assert.ok(em.light.has(t), `${t}: no light declaration on .td-embed-root`);
    if (td.dark.has(t)) {
      assert.ok(em.dark.has(t), `${t}: td.css has a dark value, the embed has none`);
      assert.ok(em.auto.has(t), `${t}: no auto (OS dark) copy in the embed`);
    }
  }
  for (const t of consumer.no_fallback_in_consumer) assert.ok(consumer.required_light_and_dark.includes(t), t);
  assert.ok(em.dark.size > 50, `dark declarations found: ${em.dark.size}`);
});

test('token gate: every token the embed CSS reads resolves on .td-embed-root as in td.css (light, dark, auto)', () => {
  const used = [...analyzeCss(built.css).referenced].filter((v) => v.startsWith('--td-') && v !== REM_VAR);
  assert.ok(used.length > 100, `tokens used: ${used.length}`);
  const q = new Set(built.quarantine);
  // read only by rules of elements outside the embed suite (field.css also styles td-number-input's box): declared by
  // number-input.css in td.css, so quarantined here — and never matched inside the embed
  const OUTSIDE_SUITE = { '--td-number-affix-gap': /\.td-number__/, '--td-number-affix-fg': /\.td-number__/ };
  for (const [t, re] of Object.entries(OUTSIDE_SUITE)) {
    const readers = emDecls.filter((d) => d.value.includes(`var(${t}`));
    assert.ok(readers.length > 0, `${t} is still read (else drop the exemption)`);
    for (const d of readers) assert.ok(d.items.every((i) => re.test(i)), `${t} read by ${d.items.join(', ')}`);
  }
  for (const t of used) {
    if (Object.hasOwn(OUTSIDE_SUITE, t)) { assert.ok(q.has(t), t); continue; }
    if (td.light.has(t)) assert.ok(em.light.has(t), `${t}: td.css declares it on :root, the embed not on .td-embed-root`);
    else assert.ok(q.has(t) || em.light.has(t), `${t}: undeclared and not quarantined`);
    if (td.dark.has(t)) assert.ok(em.dark.has(t), `${t}: dark value missing in the embed`);
    if (td.auto.has(t)) assert.ok(em.auto.has(t), `${t}: auto copy missing in the embed`);
  }
});
