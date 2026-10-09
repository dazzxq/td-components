// v0.62.0 (plan E): per-instance colours of <td-scroll-top> — pure resolution of the `color` / `text-color` attributes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveScrollTopColors, syncScrollTopVars, SCROLL_TOP_COLOR_VARS } from './scroll-top-colors.js';
import { contrast, parseColor } from '../theme/color.js';

const HEX = /^#[0-9a-f]{6}$/;

test('hex / basic name / rgb() resolve to normalised #rrggbb', () => {
  for (const c of ['#7c3aed', '#7C3AED', '#73e', 'rgb(124 58 237)', 'rgb(124, 58, 237)', 'navy']) {
    const r = resolveScrollTopColors(c);
    assert.ok(r, c);
    assert.match(r.bg, HEX, c);
    assert.match(r.fg, HEX, c);
    assert.match(r.hover, HEX, c);
  }
  assert.equal(resolveScrollTopColors('#73e').bg, '#7733ee');
});

test('not usable → null: empty, non-string, translucent, unparsable, hostile', () => {
  for (const c of [undefined, null, '', '   ', 42, 'rgb(0 0 0 / 50%)', '#00000080', 'transparent', 'hsl(250 80% 60%)', 'oklch(0.54 0.23 293)', 'rebeccapurple', 'notacolor',
    'red;}', 'red; background:url(x)', 'url(javascript:alert(1))', '#fff'.repeat(30), '"><img src=x>']) {
    assert.equal(resolveScrollTopColors(c), null, String(c));
  }
});

test('the icon colour is chosen by contrast: dark on light, light on dark, always >= 4.5:1', () => {
  assert.equal(resolveScrollTopColors('#ffffff').fg, '#000000');
  assert.equal(resolveScrollTopColors('#000000').fg, '#ffffff');
  assert.equal(resolveScrollTopColors('#f59e0b').fg, '#000000'); // amber
  assert.equal(resolveScrollTopColors('#1e40af').fg, '#ffffff'); // blue-800
  let worst = Infinity;
  for (let r = 0; r < 256; r += 17) for (let g = 0; g < 256; g += 17) for (let b = 0; b < 256; b += 17) {
    const bg = `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
    worst = Math.min(worst, contrast(resolveScrollTopColors(bg).fg, bg));
  }
  assert.ok(worst >= 4.5, `worst auto icon contrast ${worst.toFixed(2)}`);
});

test('hover moves 8 % toward the icon colour and keeps the icon >= 3.2:1 on the whole grid; pressed overlay keeps >= 4.7', () => {
  let hov = Infinity;
  let prs = Infinity;
  for (let r = 0; r < 256; r += 17) for (let g = 0; g < 256; g += 17) for (let b = 0; b < 256; b += 17) {
    const bg = `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
    const x = resolveScrollTopColors(bg);
    hov = Math.min(hov, contrast(x.fg, x.hover));
    // pressed: the overlay colour composited over the background
    const over = parseColor(x.pressed);
    prs = Math.min(prs, contrast(x.fg, { r: over.r * over.a + parseColor(bg).r * (1 - over.a), g: over.g * over.a + parseColor(bg).g * (1 - over.a), b: over.b * over.a + parseColor(bg).b * (1 - over.a), a: 1 }));
  }
  assert.ok(hov >= 3.2, `hover ${hov.toFixed(2)}`);
  assert.ok(prs >= 4.7, `pressed ${prs.toFixed(2)}`);
});

test('pressed overlay: black on a light-icon (dark) button, white on a dark-icon (light) button', () => {
  assert.match(resolveScrollTopColors('#1e40af').pressed, /^rgb\(0 0 0 \/ 14%\)$/);
  assert.match(resolveScrollTopColors('#fef3c7').pressed, /^rgb\(255 255 255 \/ 14%\)$/);
});

test('text-color: honoured when it keeps >= 3:1 on the colour, else ignored (textRejected)', () => {
  const ok = resolveScrollTopColors('#1e40af', '#fde68a');
  assert.equal(ok.fg, '#fde68a');
  assert.equal(ok.textRejected, false);
  const bad = resolveScrollTopColors('#1e40af', '#2563eb');
  assert.equal(bad.fg, '#ffffff'); // auto
  assert.equal(bad.textRejected, true);
  const translucent = resolveScrollTopColors('#1e40af', 'rgb(255 255 255 / 40%)');
  assert.equal(translucent.fg, '#ffffff');
  assert.equal(translucent.textRejected, true);
  const hostile = resolveScrollTopColors('#1e40af', 'red;}');
  assert.equal(hostile.textRejected, true);
  assert.equal(resolveScrollTopColors('#1e40af', '').textRejected, false); // nothing given is not a rejection
});

// ---- syncScrollTopVars: never destroy a value the site had set (Codex impl r1) -------------------------------------------

/** A minimal CSSOM declaration block (value + priority per property). */
function fakeStyle(init = {}) {
  const m = new Map(Object.entries(init).map(([k, v]) => [k, Array.isArray(v) ? v : [v, '']]));
  return {
    getPropertyValue: (n) => (m.has(n) ? m.get(n)[0] : ''),
    getPropertyPriority: (n) => (m.has(n) ? m.get(n)[1] : ''),
    setProperty: (n, v, p = '') => { m.set(n, [v, p]); },
    removeProperty: (n) => { const o = m.has(n) ? m.get(n)[0] : ''; m.delete(n); return o; },
    snapshot: () => Object.fromEntries([...m].map(([k, [v, p]]) => [k, p ? `${v} !${p}` : v])),
  };
}
const V = SCROLL_TOP_COLOR_VARS;
const BLUE = resolveScrollTopColors('#1e40af');
const BLUE_TEXT = resolveScrollTopColors('#1e40af', '#fde68a');
const AMBER = resolveScrollTopColors('#f59e0b');

test('sync: nothing pre-set → set then remove leaves the block empty', () => {
  const st = fakeStyle();
  const owned = new Map();
  syncScrollTopVars(st, owned, BLUE);
  assert.equal(st.getPropertyValue(V.bg), '#1e40af');
  assert.equal(st.getPropertyValue(V.fg), '#ffffff');
  syncScrollTopVars(st, owned, null);
  assert.deepEqual(st.snapshot(), {});
  assert.equal(owned.size, 0);
});

test('sync: a site value (and its !important) survives set -> remove', () => {
  const st = fakeStyle({ [V.bg]: ['#ff0000', 'important'], [V.fg]: '#00ff00', other: '1' });
  const owned = new Map();
  syncScrollTopVars(st, owned, BLUE);
  assert.equal(st.getPropertyValue(V.bg), '#1e40af');
  syncScrollTopVars(st, owned, null);
  assert.deepEqual(st.snapshot(), { [V.bg]: '#ff0000 !important', [V.fg]: '#00ff00', other: '1' });
});

test('sync: a site value survives set -> invalid (null) too, and a later valid colour works again', () => {
  const st = fakeStyle({ [V.pressed]: 'rgb(1 2 3 / 50%)' });
  const owned = new Map();
  syncScrollTopVars(st, owned, BLUE);
  syncScrollTopVars(st, owned, resolveScrollTopColors('not a colour'));
  assert.deepEqual(st.snapshot(), { [V.pressed]: 'rgb(1 2 3 / 50%)' });
  syncScrollTopVars(st, owned, AMBER);
  assert.equal(st.getPropertyValue(V.bg), '#f59e0b');
});

test('sync: set -> change -> remove restores the ORIGINAL site value, not an intermediate one of ours', () => {
  const st = fakeStyle({ [V.bg]: '#ff0000' });
  const owned = new Map();
  syncScrollTopVars(st, owned, BLUE);
  syncScrollTopVars(st, owned, AMBER);
  syncScrollTopVars(st, owned, BLUE_TEXT);
  assert.equal(st.getPropertyValue(V.fg), '#fde68a'); // text-color applied on top
  syncScrollTopVars(st, owned, BLUE); // text-color removed: fg falls back to the automatic colour, still ours
  assert.equal(st.getPropertyValue(V.fg), '#ffffff');
  syncScrollTopVars(st, owned, null);
  assert.deepEqual(st.snapshot(), { [V.bg]: '#ff0000' });
});

test('sync: text-color is independent — dropping it keeps the site fg for later; a property the site rewrote after us stays', () => {
  const st = fakeStyle({ [V.fg]: '#123456' });
  const owned = new Map();
  syncScrollTopVars(st, owned, BLUE_TEXT);
  syncScrollTopVars(st, owned, BLUE);
  st.setProperty(V.bg, '#abcdef'); // the site rewrites the fill while we own it
  syncScrollTopVars(st, owned, null);
  assert.equal(st.getPropertyValue(V.fg), '#123456'); // original restored
  assert.equal(st.getPropertyValue(V.bg), '#abcdef'); // the site's newer value is not clobbered
  assert.equal(st.getPropertyValue(V.hover), '');
});
