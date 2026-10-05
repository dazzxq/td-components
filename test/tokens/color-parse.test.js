// v0.41.0 (plan M0): the shared colour parser of the token / contrast / page gates.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseColor, rgbaArray, over, contrast, normalizeColor, normalizeColorsIn } from './color-parse.js';

const near = (got, want, eps = 0.01) => {
  assert.ok(got, `parsed: ${JSON.stringify(got)}`);
  for (const k of ['r', 'g', 'b', 'a']) assert.ok(Math.abs(got[k] - want[k]) <= eps * (k === 'a' ? 1 : 255), `${k}: ${got[k]} vs ${want[k]}`);
};

test('rgb() / rgba() — comma and space syntax, alpha number or %', () => {
  near(parseColor('rgb(28, 28, 30)'), { r: 28, g: 28, b: 30, a: 1 });
  near(parseColor('rgba(0, 0, 0, 0.05)'), { r: 0, g: 0, b: 0, a: 0.05 });
  near(parseColor('rgb(255 255 255 / 60%)'), { r: 255, g: 255, b: 255, a: 0.6 });
  near(parseColor('rgb(10 10 12 / 0.45)'), { r: 10, g: 10, b: 12, a: 0.45 });
  near(parseColor('rgba(0, 0, 0, 0)'), { r: 0, g: 0, b: 0, a: 0 });
});

test('color(srgb …) channels are 0..1, `none` = 0, alpha optional / %', () => {
  near(parseColor('color(srgb 0.5 0.25 1)'), { r: 127.5, g: 63.75, b: 255, a: 1 });
  near(parseColor('color(srgb 0.0941 0.3882 0.9216 / 0.14)'), { r: 24, g: 99, b: 235, a: 0.14 });
  near(parseColor('color(srgb none 1 none / 50%)'), { r: 0, g: 255, b: 0, a: 0.5 });
  // the false result of the audit: a color-mix() badge fill must not read as near-black
  assert.ok(parseColor('color(srgb 0.87 0.92 0.99)').r > 200);
});

test('hex + transparent; unknown spaces → null', () => {
  near(parseColor('#fff'), { r: 255, g: 255, b: 255, a: 1 });
  near(parseColor('#1c1c1e'), { r: 28, g: 28, b: 30, a: 1 });
  near(parseColor('#00000080'), { r: 0, g: 0, b: 0, a: 128 / 255 });
  near(parseColor('transparent'), { r: 0, g: 0, b: 0, a: 0 });
  assert.equal(parseColor('oklch(0.5 0.1 200)'), null);
  assert.equal(parseColor('red'), null);
  assert.equal(parseColor(''), null);
});

test('composite + contrast', () => {
  assert.equal(over('rgba(0, 0, 0, 0.5)', 'rgb(255, 255, 255)'), 'rgb(128, 128, 128)');
  assert.equal(over('color(srgb 0 0 0 / 0.5)', '#fff'), 'rgb(128, 128, 128)');
  assert.ok(Math.abs(contrast('#000', '#fff') - 21) < 1e-9);
  assert.ok(Math.abs(contrast('rgb(107, 107, 115)', 'rgb(255, 255, 255)') - 5.28) < 0.01);
  assert.deepEqual(rgbaArray('color(srgb 1 1 1 / 0.1)'), [255, 255, 255, 0.1]);
});

test('normalise for golden files', () => {
  assert.equal(normalizeColor('color(srgb 1 1 1)'), 'rgb(255, 255, 255)');
  assert.equal(normalizeColor('rgb(0 0 0 / 7%)'), 'rgba(0, 0, 0, 0.07)');
  assert.equal(normalizeColorsIn('rgba(0, 0, 0, 0.06) 0px 2px 6px 0px,  color(srgb 0 0 0 / 0.12) 0px 8px 24px 0px'),
    'rgba(0, 0, 0, 0.06) 0px 2px 6px 0px, rgba(0, 0, 0, 0.12) 0px 8px 24px 0px');
});
