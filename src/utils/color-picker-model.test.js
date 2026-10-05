// v0.48.0 (plan v0.48.0-color-picker M0): the pure model of <td-color-picker> — input parsing (one value shape
// `#rrggbb`), presets, HSV state that keeps the hue across greys / black, the area keyboard reducer, pointer mapping,
// the approximate Vietnamese colour names and the area value text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseColorInput, parsePresets, DEFAULT_PRESETS, MAX_PRESETS, HEX_RE, hsvFromHex, hexFromHsv, hueHex, stepArea,
  areaFromPoint, colorName, areaValueText, fill, MAX_PRESET_LABEL,
} from './color-picker-model.js';

const ok = (hex) => ({ ok: true, hex });
const no = (reason) => ({ ok: false, reason });

test('parseColorInput: every accepted syntax → #rrggbb lowercase', () => {
  const cases = [
    ['#ABC', '#aabbcc'], ['#abc', '#aabbcc'], ['#1D4ED8', '#1d4ed8'], ['#1d4ed8', '#1d4ed8'],
    ['#abcf', '#aabbcc'], ['#1d4ed8ff', '#1d4ed8'], // alpha = ff → opaque, accepted
    ['abc', '#aabbcc'], ['1D4ED8', '#1d4ed8'], ['  #AbC  ', '#aabbcc'], ['\t1d4ed8\n', '#1d4ed8'], // bare hex + white space
    ['rgb(29, 78, 216)', '#1d4ed8'], ['rgb(29 78 216)', '#1d4ed8'], ['rgba(29, 78, 216, 1)', '#1d4ed8'],
    ['rgb(29 78 216 / 100%)', '#1d4ed8'], ['color(srgb 1 0 0)', '#ff0000'],
    ['oklch(62.8% 0.2577 29.23)', '#ff0000'], ['red', '#ff0000'], ['Navy', '#000080'], ['white', '#ffffff'],
  ];
  for (const [raw, hex] of cases) assert.deepEqual(parseColorInput(raw), ok(hex), raw);
  // out of the sRGB gamut → gamut-mapped (lightness + hue kept), then rounded: still one valid hex
  const wide = parseColorInput('oklch(0.7 0.4 150)');
  assert.equal(wide.ok, true);
  assert.match(wide.hex, HEX_RE);
});

test('parseColorInput: empty / alpha / invalid', () => {
  for (const raw of ['', '   ', '\n']) assert.deepEqual(parseColorInput(raw), no('empty'), JSON.stringify(raw));
  for (const raw of ['#0000', '#00000080', 'rgb(0 0 0 / 50%)', 'rgba(0, 0, 0, 0.5)', 'transparent', 'color(srgb 0 0 0 / 0.1)']) {
    assert.deepEqual(parseColorInput(raw), no('alpha'), raw);
  }
  for (const raw of ['hsl(0 100% 50%)', 'var(--x)', 'red;}', 'red; } body{display:none', 'url(javascript:alert(1))', 'url(',
    '#ggg', '#12', '#1234567', 'ab', 'abcd', 'abcde', '#', 'tomato', '\u0000', '#fff\u0000', 'expression(1)', '<img>',
    '"#fff"', 'x'.repeat(65), `#fff${' '.repeat(61)}`]) {
    assert.deepEqual(parseColorInput(raw), no('invalid'), JSON.stringify(raw).slice(0, 40));
  }
  for (const raw of [null, undefined, 12, 0xffffff, {}, ['#fff'], true]) assert.deepEqual(parseColorInput(raw), no('invalid'));
  // exactly 64 characters is still looked at
  assert.deepEqual(parseColorInput(`${' '.repeat(60)}#fff`), ok('#ffffff'));
});

test('parseColorInput output always matches HEX_RE (the CSSOM guard)', () => {
  let seed = 1;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed; };
  const alphabet = '#0123456789abcdefABCDEFrgbox(),% ./;}{-:';
  for (let i = 0; i < 5000; i++) {
    const len = rnd() % 14;
    let s = '';
    for (let j = 0; j < len; j++) s += alphabet[rnd() % alphabet.length];
    const r = parseColorInput(s);
    if (r.ok) assert.match(r.hex, HEX_RE, s);
  }
});

test('parsePresets: defaults, attribute string, property array, labels, duplicates, cap, drops', () => {
  assert.equal(DEFAULT_PRESETS.length, 16);
  for (const h of DEFAULT_PRESETS) assert.match(h, HEX_RE);
  assert.deepEqual(parsePresets(null).items.map((p) => p.hex), [...DEFAULT_PRESETS]);
  assert.deepEqual(parsePresets(undefined).items.length, 16);
  assert.deepEqual(parsePresets(''), { items: [], dropped: 0 });
  assert.deepEqual(parsePresets([]), { items: [], dropped: 0 });
  assert.deepEqual(parsePresets('#1D4ED8, red  #ABC,#abc nope #0000'), {
    items: [{ hex: '#1d4ed8', label: '' }, { hex: '#ff0000', label: '' }, { hex: '#aabbcc', label: '' }],
    dropped: 2,
  });
  const p = parsePresets([{ value: '#B3261E', label: '  Đỏ thương hiệu ' }, '#fff', { value: 'nope', label: 'x' },
    { label: 'no value' }, { value: '#fff', label: 'dup' }, 42, null, { value: '#000', label: 7 }]);
  assert.deepEqual(p.items, [{ hex: '#b3261e', label: 'Đỏ thương hiệu' }, { hex: '#ffffff', label: '' }, { hex: '#000000', label: '' }]);
  assert.equal(p.dropped, 4);
  assert.equal(parsePresets([{ value: '#fff', label: 'x'.repeat(500) }]).items[0].label.length, MAX_PRESET_LABEL);
  const many = Array.from({ length: 60 }, (_, i) => `#${(i * 4).toString(16).padStart(2, '0')}0000`);
  const capped = parsePresets(many);
  assert.equal(capped.items.length, MAX_PRESETS);
  assert.equal(capped.dropped, 12);
  assert.deepEqual(parsePresets({ value: '#fff' }), { items: [], dropped: 1 }, 'not a string / array');
  // an inherited `value` / `label` (prototype pollution shape) is ignored
  const proto = Object.create({ value: '#ff0000', label: 'evil' });
  assert.deepEqual(parsePresets([proto]), { items: [], dropped: 1 });
});

test('HSV state: from hex, keeps hue on grey, keeps hue + saturation on black', () => {
  const blue = hsvFromHex('#1d4ed8');
  assert.equal(hexFromHsv(blue), '#1d4ed8');
  const grey = hsvFromHex('#808080', blue);
  assert.equal(grey.h, blue.h);
  assert.equal(grey.s, 0);
  assert.equal(hexFromHsv(grey), '#808080');
  const black = hsvFromHex('#000000', blue);
  assert.deepEqual(black, { h: blue.h, s: blue.s, v: 0 });
  assert.equal(hexFromHsv(black), '#000000');
  assert.deepEqual(hsvFromHex('#000000'), { h: 0, s: 0, v: 0 }, 'no previous state');
  assert.deepEqual(hsvFromHex('nope', blue), blue);
  assert.equal(hueHex(0), '#ff0000');
  assert.equal(hueHex(120), '#00ff00');
  assert.equal(hueHex(240), '#0000ff');
});

test('stepArea: arrows ±1 %, Shift ±10 %, PageUp / PageDown, Home / End, clamped; unknown key → null', () => {
  const s0 = { h: 210, s: 0.5, v: 0.5 };
  const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≉ ${b}`);
  near(stepArea(s0, 'ArrowRight').s, 0.51);
  near(stepArea(s0, 'ArrowLeft').s, 0.49);
  near(stepArea(s0, 'ArrowUp').v, 0.51);
  near(stepArea(s0, 'ArrowDown').v, 0.49);
  near(stepArea(s0, 'ArrowRight', true).s, 0.6);
  near(stepArea(s0, 'ArrowUp', true).v, 0.6);
  near(stepArea(s0, 'PageUp').v, 0.6);
  near(stepArea(s0, 'PageDown').v, 0.4);
  assert.equal(stepArea(s0, 'Home').s, 0);
  assert.equal(stepArea(s0, 'End').s, 1);
  assert.equal(stepArea({ h: 0, s: 0.995, v: 0.005 }, 'ArrowRight').s, 1);
  assert.equal(stepArea({ h: 0, s: 0.995, v: 0.005 }, 'ArrowDown').v, 0);
  assert.equal(stepArea(s0, 'ArrowRight').h, 210, 'hue untouched');
  assert.equal(stepArea(s0, 'a'), null);
  assert.equal(stepArea(s0, 'Enter'), null);
  // five steps right = +5 % (whole percent in aria-valuenow)
  let st = { h: 0, s: 0.8611, v: 0.3 };
  for (let i = 0; i < 5; i++) st = stepArea(st, 'ArrowRight');
  assert.equal(Math.round(st.s * 100), Math.round(0.8611 * 100) + 5);
});

test('areaFromPoint: x → saturation, y → value (top = 1), clamped', () => {
  const r = { left: 10, top: 20, width: 200, height: 100 };
  assert.deepEqual(areaFromPoint(r, 10, 20), { s: 0, v: 1 });
  assert.deepEqual(areaFromPoint(r, 210, 120), { s: 1, v: 0 });
  assert.deepEqual(areaFromPoint(r, 110, 70), { s: 0.5, v: 0.5 });
  assert.deepEqual(areaFromPoint(r, -50, 500), { s: 0, v: 0 });
  assert.deepEqual(areaFromPoint(r, 999, -9), { s: 1, v: 1 });
  assert.deepEqual(areaFromPoint({ left: 0, top: 0, width: 0, height: 0 }, 5, 5), { s: 0, v: 0 });
});

test('colorName: ~30 reference colours (approximate Vietnamese names)', () => {
  const FIXTURES = {
    '#ffffff': 'trắng', '#f5f5f5': 'trắng', '#e5e7eb': 'xám nhạt', '#d4d4d8': 'xám nhạt', '#9ca3af': 'xám', '#808080': 'xám',
    '#374151': 'xám đậm', '#111113': 'đen', '#000000': 'đen',
    '#ff0000': 'đỏ', '#dc2626': 'đỏ', '#7f1d1d': 'đỏ đậm', '#fecaca': 'đỏ nhạt',
    '#f97316': 'cam', '#ffa500': 'cam', '#8b4513': 'nâu', '#78350f': 'nâu',
    '#eab308': 'vàng', '#ffff00': 'vàng', '#fef08a': 'vàng nhạt',
    '#84cc16': 'xanh lá', '#00ff00': 'xanh lá', '#14532d': 'xanh lá đậm',
    '#14b8a6': 'xanh ngọc', '#0ea5e9': 'xanh lơ',
    '#3b82f6': 'xanh dương', '#1d4ed8': 'xanh dương', '#000080': 'xanh dương đậm', '#bfdbfe': 'xanh dương nhạt',
    '#8b5cf6': 'tím', '#800080': 'tím đậm', '#ec4899': 'hồng', '#fbcfe8': 'hồng nhạt',
  };
  for (const [hex, name] of Object.entries(FIXTURES)) assert.equal(colorName(hex), name, hex);
  assert.equal(colorName('nope'), '');
});

test('areaValueText / fill', () => {
  assert.equal(areaValueText({ s: 0.62, v: 0.401 }, '#1d4ed8', 'xanh dương'), 'Bão hoà 62 %, độ sáng 40 % — xanh dương, #1d4ed8');
  assert.equal(areaValueText({ s: 1, v: 0 }, '#000000', 'đen', 'S {s} V {v} {name} {hex} {x}'), 'S 100 V 0 đen #000000 {x}');
  assert.equal(fill('{a}-{b}', { a: 1 }), '1-{b}');
});
