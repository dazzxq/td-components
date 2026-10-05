/* v0.42.0 R2-2 (plan N1): src/theme/color.js — strict parsing, OKLab / OKLCH round trips, gamut mapping keeps L + hue,
 * deterministic hex rounding, WCAG 2.x + APCA reference vectors. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseColor, srgbToOklch, oklchToSrgb, gamutMap, toHex, toCss, luminance, contrast, composite, pickPole, apcaLc,
  inGamut, MAX_COLOR_INPUT,
} from './color.js';

const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg ?? ''} ${a} ≉ ${b} (±${eps})`);
const rgb255 = (c) => [c.r, c.g, c.b].map((v) => Math.round(v * 255));

test('parseColor: accepted forms', () => {
  assert.deepEqual(rgb255(parseColor('#abc')), [170, 187, 204]);
  assert.deepEqual(rgb255(parseColor('#AABBCC')), [170, 187, 204]);
  assert.equal(parseColor('#abcd').a, 0xdd / 255);
  assert.equal(parseColor('#aabbcc80').a, 0x80 / 255);
  assert.deepEqual(rgb255(parseColor('rgb(10, 20, 30)')), [10, 20, 30]);
  assert.deepEqual(rgb255(parseColor('rgb(10 20 30)')), [10, 20, 30]);
  assert.deepEqual(rgb255(parseColor('rgb(100% 0% 50%)')), [255, 0, 128]);
  assert.equal(parseColor('rgba(10, 20, 30, 0.5)').a, 0.5);
  assert.equal(parseColor('rgb(10 20 30 / 25%)').a, 0.25);
  assert.deepEqual(rgb255(parseColor('rgb(300, -5, 20)')), [255, 0, 20], 'channels clamp like CSS');
  assert.deepEqual(rgb255(parseColor('color(srgb 1 0.5 0)')), [255, 128, 0]);
  assert.equal(parseColor('color(srgb 1 0 0 / 0.3)').a, 0.3);
  assert.deepEqual(rgb255(parseColor('oklch(1 0 0)')), [255, 255, 255]);
  assert.deepEqual(rgb255(parseColor('oklch(62.8% 0.2577 29.23)')), [255, 0, 0]);
  assert.deepEqual(rgb255(parseColor('oklch(0.628 0.2577 29.23deg)')), [255, 0, 0]);
  assert.deepEqual(rgb255(parseColor('navy')), [0, 0, 128]);
  assert.deepEqual(rgb255(parseColor(' White ')), [255, 255, 255]);
  assert.deepEqual(parseColor('transparent'), { r: 0, g: 0, b: 0, a: 0 });
});

test('parseColor: everything else is null (no CSS injection, no eval, length cap)', () => {
  for (const bad of ['', '   ', 'red;}', 'red; --x: 1', '#fff;', '#ffff ff', 'rgb(1,2,3);', 'rgb(1 2)', 'rgb(1,2,3,4,5)',
    'var(--td-accent)', 'currentColor', 'hsl(0 100% 50%)', 'lab(50 20 30)', 'oklab(0.5 0.1 0.1)', 'color(display-p3 1 0 0)',
    'expression(alert(1))', 'url(x)', '#ggg', '#12', '#1234567', '*/', '</style>', '<b>', 'rgb(1,2,3) */ x', 'tomato',
    'constructor', '__proto__', 'toString', 'rgb(1e999, 0, 0)', `#${'f'.repeat(MAX_COLOR_INPUT)}`]) {
    assert.equal(parseColor(bad), null, JSON.stringify(bad));
  }
  for (const bad of [null, undefined, 12, {}, ['#fff']]) assert.equal(parseColor(bad), null);
  assert.equal(parseColor(`${' '.repeat(MAX_COLOR_INPUT - 4)}#fff`) !== null, true, 'exactly at the cap is fine');
});

test('OKLCH reference vectors and round trips', () => {
  const red = srgbToOklch({ r: 1, g: 0, b: 0 });
  near(red.l, 0.62796, 1e-4, 'red L'); near(red.c, 0.25768, 1e-4, 'red C'); near(red.h, 29.2339, 1e-2, 'red H');
  const white = srgbToOklch({ r: 1, g: 1, b: 1 });
  near(white.l, 1, 1e-6); assert.equal(white.c, 0);
  const black = srgbToOklch({ r: 0, g: 0, b: 0 });
  near(black.l, 0, 1e-9);
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  for (let i = 0; i < 2000; i++) {
    const c = { r: rnd(), g: rnd(), b: rnd() };
    const back = oklchToSrgb(srgbToOklch(c));
    near(back.r, c.r, 1e-5); near(back.g, c.g, 1e-5); near(back.b, c.b, 1e-5);
  }
});

test('gamutMap keeps lightness and hue, reduces chroma only when needed', () => {
  const inside = gamutMap({ l: 0.6, c: 0.05, h: 250 });
  assert.equal(inside.reduced, false);
  for (const lch of [{ l: 0.7, c: 0.4, h: 150 }, { l: 0.5, c: 0.37, h: 30 }, { l: 0.9, c: 0.3, h: 270 }, { l: 0.2, c: 0.3, h: 100 }]) {
    const m = gamutMap(lch);
    assert.equal(m.reduced, true);
    assert.ok(m.c < lch.c);
    assert.ok(inGamut(m.rgb));
    const back = srgbToOklch(m.rgb);
    near(back.l, lch.l, 2e-3, 'L kept');
    if (back.c > 0.02) near(back.h, lch.h, 1, 'hue kept');
  }
  assert.deepEqual(gamutMap({ l: 1.2, c: 0.1, h: 10 }).rgb, { r: 1, g: 1, b: 1 });
  assert.deepEqual(gamutMap({ l: -0.1, c: 0.1, h: 10 }).rgb, { r: 0, g: 0, b: 0 });
});

test('toHex: one deterministic rounding point; toCss keeps alpha', () => {
  assert.equal(toHex({ r: 0.5, g: 0, b: 1 }), '#8000ff');
  assert.equal(toHex({ r: 127.5 / 255, g: 127.49 / 255, b: 2 }), '#807fff');
  assert.equal(toHex(parseColor('#ECE5D8')), '#ece5d8');
  assert.equal(toCss({ r: 1, g: 1, b: 1, a: 0.9 }), 'rgb(255 255 255 / 90%)');
  assert.equal(toCss({ r: 0, g: 0, b: 0, a: 1 }), '#000000');
});

test('WCAG 2.x luminance / contrast / composite', () => {
  near(contrast('#000', '#fff'), 21, 1e-9);
  near(contrast('#777777', '#ffffff'), 4.478089, 1e-6);
  near(contrast('#ffffff', '#777777'), 4.478089, 1e-6, 'symmetric');
  near(luminance('#ffffff'), 1, 1e-12);
  assert.equal(contrast('nope', '#fff'), 0);
  const half = composite('rgb(0 0 0 / 50%)', '#ffffff');
  near(half.r, 0.5, 1e-12);
  near(contrast('rgb(0 0 0 / 50%)', '#ffffff'), contrast(toHex(half), '#ffffff'), 0.05, 'translucent fg composited first');
});

test('pickPole agrees with the legacy black / white comparison on every 12-bit colour', () => {
  for (let i = 0; i < 4096; i++) {
    const c = { r: ((i >> 8) & 15) / 15, g: ((i >> 4) & 15) / 15, b: (i & 15) / 15 };
    const L = luminance(c);
    const legacyBlack = (L + 0.05) / 0.05 >= 1.05 / (L + 0.05) ? '#000000' : '#ffffff';
    assert.equal(pickPole(c, { tie: 'black' }), legacyBlack);
  }
});

test('APCA Lc reference values (0.0.98G-4g)', () => {
  near(apcaLc('#000000', '#ffffff'), 106.04, 0.1);
  near(apcaLc('#ffffff', '#000000'), -107.88, 0.1);
  near(apcaLc('#888888', '#ffffff'), 63.06, 0.1);
  near(apcaLc('#ffffff', '#888888'), -68.54, 0.1);
  assert.equal(apcaLc('#777777', '#777777'), 0);
});

// v0.48.0 (plan v0.48.0-color-picker QĐ 7, M0): HSV for the colour picker's 2-D area — pure, channels 0..1, h in degrees.
test('v0.48.0 srgbToHsv / hsvToSrgb: reference vectors and edges', async () => {
  const { srgbToHsv, hsvToSrgb } = await import('./color.js');
  assert.deepEqual(srgbToHsv({ r: 1, g: 0, b: 0 }), { h: 0, s: 1, v: 1 });
  assert.deepEqual(srgbToHsv({ r: 0, g: 1, b: 0 }), { h: 120, s: 1, v: 1 });
  assert.deepEqual(srgbToHsv({ r: 0, g: 0, b: 1 }), { h: 240, s: 1, v: 1 });
  assert.deepEqual(srgbToHsv({ r: 0, g: 0, b: 0 }), { h: 0, s: 0, v: 0 }, 'black: s = 0, v = 0, h = 0');
  assert.deepEqual(srgbToHsv({ r: 0.5, g: 0.5, b: 0.5 }), { h: 0, s: 0, v: 0.5 }, 'grey: s = 0');
  near(srgbToHsv({ r: 1, g: 0, b: 0.5 }).h, 330, 1e-9, 'magenta side wraps into 0..360');
  assert.deepEqual(hsvToSrgb({ h: 0, s: 1, v: 1 }), { r: 1, g: 0, b: 0 });
  assert.deepEqual(hsvToSrgb({ h: 360, s: 1, v: 1 }), { r: 1, g: 0, b: 0 }, 'h = 360 = 0');
  assert.deepEqual(hsvToSrgb({ h: -120, s: 1, v: 1 }), hsvToSrgb({ h: 240, s: 1, v: 1 }), 'negative hue wraps');
  assert.deepEqual(hsvToSrgb({ h: 200, s: 0, v: 0.25 }), { r: 0.25, g: 0.25, b: 0.25 }, 's = 0 → grey whatever the hue');
  assert.deepEqual(hsvToSrgb({ h: 200, s: 1, v: 0 }), { r: 0, g: 0, b: 0 }, 'v = 0 → black');
  assert.deepEqual(hsvToSrgb({ h: 30, s: 2, v: -1 }), { r: 0, g: 0, b: 0 }, 's / v clamped to 0..1');
  assert.equal(toHex(hsvToSrgb({ h: 30, s: 1, v: 2 })), '#ff8000');
});

test('v0.48.0 HSV round trip: toHex(hsvToSrgb(srgbToHsv(c))) is the same hex for all 4096 #rgb + 20 000 random hex', async () => {
  const { srgbToHsv, hsvToSrgb } = await import('./color.js');
  const trip = (hex) => toHex(hsvToSrgb(srgbToHsv(parseColor(hex))));
  for (let i = 0; i < 4096; i++) {
    const hex = `#${[(i >> 8) & 15, (i >> 4) & 15, i & 15].map((n) => n.toString(16).repeat(2)).join('')}`;
    assert.equal(trip(hex), hex);
  }
  let seed = 48;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed; };
  for (let i = 0; i < 20000; i++) {
    const hex = `#${(rnd() & 0xffffff).toString(16).padStart(6, '0')}`;
    assert.equal(trip(hex), hex);
  }
});
