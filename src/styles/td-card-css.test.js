// v0.95.0 (plan v0.95.0-card §11.1): static checks of components/card.css — container-sized (no viewport query), no
// scale / lift, ratio modifiers, interaction rules only on `a.td-card`, tap highlight off. The rendered geometry is
// measured by src/display/td-v095-card.engines.browser-test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./components/card.css', import.meta.url), 'utf8');
const code = src.replace(/\/\*[\s\S]*?\*\//g, ''); // comments out
const component = code.slice(code.indexOf('@layer td.component'));

/** Every `selector { … }` rule of the component layer, nested at-rules flattened: [{ at: string[], sel, body }]. */
function rules(css) {
  const out = [];
  const walk = (text, at) => {
    let i = 0;
    while (i < text.length) {
      const open = text.indexOf('{', i);
      if (open < 0) break;
      const head = text.slice(i, open).trim();
      let depth = 1;
      let j = open + 1;
      while (j < text.length && depth) {
        if (text[j] === '{') depth++;
        else if (text[j] === '}') depth--;
        j++;
      }
      const body = text.slice(open + 1, j - 1);
      if (head.startsWith('@')) walk(body, [...at, head]);
      else out.push({ at, sel: head.replace(/\s+/g, ' '), body });
      i = j;
    }
  };
  walk(css.slice(css.indexOf('{') + 1, css.lastIndexOf('}')), []);
  return out;
}
const all = rules(component);

test('sized by the container: no width media query, no vw / vh, the card sets no container-type', () => {
  assert.doesNotMatch(code, /@media\s*\([^)]*(min|max)-(width|height|inline-size|block-size)/);
  assert.doesNotMatch(code, /@media\s*\(width|@container/);
  assert.doesNotMatch(code, /\d(vw|vh|vi|vb|dvw|dvh|svw|svh|lvw|lvh)\b/);
  assert.doesNotMatch(code, /container-type|container-name/);
});

test('no scale / lift / transform / translate anywhere in the card rules (minimal surfaces rule 4)', () => {
  assert.doesNotMatch(component, /\b(transform|scale|translate|rotate)\s*:/);
  assert.doesNotMatch(component, /\b(scale|translate|rotate|translate3d|matrix)\(/);
});

test('the media box takes its ratio from the token; every modifier sets exactly its value', () => {
  const media = all.find((r) => r.sel === '.td-card__media');
  assert.match(media.body, /aspect-ratio:\s*var\(--td-card-ratio\)/);
  assert.match(code, /--td-card-ratio:\s*4 \/ 3/);
  const want = { '1x1': '1 / 1', '4x3': '4 / 3', '3x2': '3 / 2', '16x9': '16 / 9', '3x4': '3 / 4' };
  for (const [k, v] of Object.entries(want)) {
    const r = all.find((x) => x.sel === `.td-card--ratio-${k}`);
    assert.ok(r, `.td-card--ratio-${k}`);
    assert.equal(r.body.replace(/\s+/g, ' ').trim(), `--td-card-ratio: ${v};`);
  }
  assert.equal(all.filter((r) => /^\.td-card--ratio-/.test(r.sel)).length, 5);
});

test('every :hover / :active / :focus-visible / [data-td-pressed] selector is anchored on a.td-card (a static card never reacts)', () => {
  const interactive = all.filter((r) => /:(hover|active|focus-visible)|\[data-td-pressed\]/.test(r.sel));
  assert.ok(interactive.length >= 5, 'interaction rules exist');
  for (const r of interactive) assert.match(r.sel, /^a\.td-card\b/, `${r.sel} must start at a.td-card`);
  for (const r of all.filter((x) => /:hover/.test(x.sel))) {
    assert.ok(r.at.some((a) => /^@media \(hover: hover\) and \(pointer: fine\)$/.test(a)), `${r.sel} sits inside the hover gate`);
  }
  assert.doesNotMatch(all.find((r) => r.sel === '.td-card').body, /cursor/);
  assert.match(all.find((r) => r.sel === 'a.td-card').body, /cursor:\s*pointer/);
});

test('the link card turns the tap highlight off', () => {
  assert.match(all.find((r) => r.sel === '.td-card').body, /-webkit-tap-highlight-color:\s*transparent/);
});

test('the press layer: --td-color-pressed over the image, no transition; surface has its own press base', () => {
  const layer = all.find((r) => r.sel === 'a.td-card:is(:active, [data-td-pressed]) .td-card__media::after');
  assert.match(layer.body, /background-color:\s*var\(--td-color-pressed\)/);
  assert.match(all.find((r) => r.sel === 'a.td-card:is(:active, [data-td-pressed]) .td-card__media').body, /transition-duration:\s*0s/);
  assert.ok(all.some((r) => r.sel === 'a.td-card.td-card--surface:is(:active, [data-td-pressed])' && /--td-color-pressed/.test(r.body)));
});

test('focus: ring around the whole card, transparent outline kept for forced colours', () => {
  const f = all.find((r) => r.sel === 'a.td-card:focus-visible' && !r.at.length);
  assert.match(f.body, /outline:\s*2px solid transparent/);
  assert.match(f.body, /box-shadow:\s*var\(--td-focus-ring\)/);
  assert.ok(all.some((r) => r.sel === 'a.td-card:focus-visible' && r.at.some((a) => a === '@media (forced-colors: active)') && /Highlight/.test(r.body)));
});

test('the cover image is absolute and ignores the host img reset; title is clamped by the token', () => {
  const img = all.find((r) => r.sel === '.td-card__media img');
  assert.match(img.body, /position:\s*absolute/);
  assert.match(img.body, /inset:\s*0/);
  assert.match(img.body, /max-inline-size:\s*none/);
  assert.match(img.body, /object-fit:\s*var\(--td-card-fit\)/);
  const title = all.find((r) => r.sel === '.td-card__title');
  assert.match(title.body, /-webkit-line-clamp:\s*var\(--td-card-title-lines\)/);
  assert.match(title.body, /overflow-wrap:\s*anywhere/);
  assert.match(title.body, /margin:\s*0/);
});

test('the grid has no container query and no container-type; the card paints no colour literal or url()', () => {
  const grid = all.find((r) => r.sel === '.td-card-grid');
  assert.match(grid.body, /minmax\(min\(var\(--td-card-grid-min\), 100%\), 1fr\)/);
  assert.doesNotMatch(component, /#[0-9a-fA-F]{3,8}\b|url\(|style=/);
});

test('fallbacks: reduced motion drops the transitions, increased contrast uses currentColor edges, forced colours CanvasText', () => {
  assert.ok(all.some((r) => r.at.includes('@media (prefers-reduced-motion: reduce)') && /transition:\s*none/.test(r.body)));
  assert.ok(all.some((r) => r.at.includes('@media (prefers-contrast: more)') && /border-color:\s*currentColor/.test(r.body)));
  assert.ok(all.some((r) => r.at.includes('@media (forced-colors: active)') && /border-color:\s*CanvasText/.test(r.body)));
});

test('only logical properties (no physical left / right / margin-left… in the card)', () => {
  assert.doesNotMatch(component, /\b(margin|padding|border)-(left|right)\b|\b(left|right)\s*:|\btext-align:\s*(left|right)/);
});
