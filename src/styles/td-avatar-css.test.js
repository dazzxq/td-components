// v0.105.0 (plan v0.105.0-avatar): static checks of components/avatar.css + its wiring (manifest, export, barrel).
// The rendered geometry is measured by src/display/td-v105-avatar.engines.browser-test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./components/avatar.css', import.meta.url), 'utf8');
const code = src.replace(/\/\*[\s\S]*?\*\//g, '');
const tokens = code.slice(code.indexOf('@layer td.tokens'), code.indexOf('@layer td.component'));
const component = code.slice(code.indexOf('@layer td.component'));
const rule = (sel) => {
  const m = component.match(new RegExp(`(?:^|[}\\s])${sel.replace(/[.\\-]/g, '\\$&')}\\s*\\{([^}]*)\\}`));
  assert.ok(m, `rule ${sel}`);
  return m[1];
};

test('tokens: geometry on :root, colours in the theme scope; --td-avatar-ring is NOT declared (optional override)', () => {
  const [geo, colours] = tokens.split(':root, [data-td-theme]');
  for (const t of ['--td-avatar-size: 40px', '--td-avatar-size-xs: 22px', '--td-avatar-size-sm: 32px', '--td-avatar-size-lg: 96px',
    '--td-avatar-ring-width: 1px', '--td-avatar-ring-gap-width: 2px', '--td-avatar-font-weight: 800',
    '--td-avatar-font-size: 1.375rem', '--td-avatar-font-size-xs: 11px', '--td-avatar-font-size-sm: 0.875rem',
    '--td-avatar-font-size-lg: clamp(2.25rem, 4.5vw, 3.25rem)']) assert.ok(geo.includes(t), t);
  for (const t of ['--td-avatar-ring-gap:', '--td-avatar-ring-color:', '--td-avatar-bg:', '--td-avatar-fg:']) assert.ok(colours.includes(t), t);
  assert.doesNotMatch(code, /--td-avatar-ring\s*:/, 'the whole-ring override stays undeclared');
});

test('base rule: square circle, the layered max-width reset is important, ring composed on the element', () => {
  const base = rule('.td-avatar');
  for (const d of ['inline-size: var(--td-avatar-size) !important', 'block-size: var(--td-avatar-size) !important', 'aspect-ratio: 1',
    'max-inline-size: none !important', 'flex: none', 'border-radius: 50%', 'object-fit: cover', 'place-items: center']) {
    assert.ok(base.includes(d), d);
  }
  assert.match(base, /box-shadow:\s*var\(--td-avatar-ring,\s*0 0 0 var\(--td-avatar-ring-gap-width\)/);
  assert.equal((component.match(/!important/g) || []).length, 3, 'only the size + max-inline-size resets are important');
});

test('size modifiers only set tokens; no :hover; no hard-coded colour but CanvasText', () => {
  for (const m of ['xs', 'sm', 'lg']) {
    const body = rule(`.td-avatar--${m}`);
    for (const decl of body.split(';').map((d) => d.trim()).filter(Boolean)) assert.match(decl, /^--td-avatar-/, `${m}: ${decl}`);
  }
  assert.doesNotMatch(code, /:hover/);
  assert.doesNotMatch(component.replace(/CanvasText/g, ''), /#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i);
});

test('wiring: manifest after badge.css, ./avatar export (pure: not in sideEffects), tdAvatar in the barrel, td.css built', () => {
  const root = new URL('../../', import.meta.url);
  const { files } = JSON.parse(readFileSync(new URL('src/styles/manifest.json', root), 'utf8'));
  assert.equal(files.indexOf('components/avatar.css'), files.indexOf('components/badge.css') + 1);
  const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
  assert.equal(pkg.exports['./avatar'], './src/display/avatar.js');
  assert.ok(!pkg.sideEffects.includes('./src/display/avatar.js'));
  assert.match(readFileSync(new URL('index.js', root), 'utf8'), /export \{ tdAvatar \} from '\.\/src\/display\/avatar\.js';/);
  assert.ok(readFileSync(new URL('td.css', root), 'utf8').includes('.td-avatar--empty'));
});
