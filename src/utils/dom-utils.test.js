import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const {
  slugify,
  formatFileSize,
  formatNumber,
  debounce,
  throttle,
  parseColorToRgb,
  relativeLuminance,
  contrastRatio,
  getAccessibleTextColor,
} = await import('./dom-utils.js');

describe('slugify', () => {
  it('slugifies Vietnamese text (tones + đ)', () => {
    assert.equal(slugify('Chuyên mục Tin tức'), 'chuyen-muc-tin-tuc');
    assert.equal(slugify('Đường Phố'), 'duong-pho');
    assert.equal(slugify('Việt Nam'), 'viet-nam');
  });
  it('slugifies plain text with numbers', () => {
    assert.equal(slugify('Hello World 123'), 'hello-world-123');
  });
  it('collapses separators and trims hyphens', () => {
    assert.equal(slugify('  a -- b  '), 'a-b');
    assert.equal(slugify('!!!Wow???'), 'wow');
  });
  it('returns empty string for non-strings/empty', () => {
    assert.equal(slugify(''), '');
    assert.equal(slugify(null), '');
    assert.equal(slugify(123), '');
  });
});

describe('formatFileSize', () => {
  it('formats common sizes', () => {
    assert.equal(formatFileSize(0), '0 Bytes');
    assert.equal(formatFileSize(512), '512 Bytes');
    assert.equal(formatFileSize(1024), '1 KB');
    assert.equal(formatFileSize(1536), '1.5 KB');
    assert.equal(formatFileSize(1024 * 1024 * 2.34), '2.34 MB');
  });
  it('guards invalid input', () => {
    assert.equal(formatFileSize(-5), '0 Bytes');
    assert.equal(formatFileSize(NaN), '0 Bytes');
  });
});

describe('formatNumber', () => {
  it('compacts thousands/millions', () => {
    assert.equal(formatNumber(1500), '1.5K');
    assert.equal(formatNumber(2300000), '2.3M');
  });
  it('groups small numbers', () => {
    // vi-VN uses '.' as thousands separator
    assert.equal(formatNumber(999), '999');
  });
});

describe('debounce', () => {
  it('invokes once after the quiet period', async () => {
    let calls = 0;
    const fn = debounce(() => { calls += 1; }, 20);
    fn(); fn(); fn();
    assert.equal(calls, 0);
    await new Promise((r) => setTimeout(r, 40));
    assert.equal(calls, 1);
  });
  it('passes latest args and this', async () => {
    let received;
    const ctx = { name: 'x' };
    const fn = debounce(function (a) { received = { a, name: this.name }; }, 10);
    fn.call(ctx, 1);
    fn.call(ctx, 2);
    await new Promise((r) => setTimeout(r, 25));
    assert.deepEqual(received, { a: 2, name: 'x' });
  });
});

describe('throttle', () => {
  it('runs immediately then suppresses within the window', async () => {
    let calls = 0;
    const fn = throttle(() => { calls += 1; }, 30);
    fn(); fn(); fn();
    assert.equal(calls, 1);
    await new Promise((r) => setTimeout(r, 45));
    fn();
    assert.equal(calls, 2);
  });
});

describe('parseColorToRgb', () => {
  it('parses hex and rgb forms', () => {
    assert.deepEqual(parseColorToRgb('#ffffff'), { r: 255, g: 255, b: 255 });
    assert.deepEqual(parseColorToRgb('#000'), { r: 0, g: 0, b: 0 });
    assert.deepEqual(parseColorToRgb('#abc'), { r: 170, g: 187, b: 204 });
    assert.deepEqual(parseColorToRgb('rgb(10, 20, 30)'), { r: 10, g: 20, b: 30 });
    assert.deepEqual(parseColorToRgb('rgba(10,20,30,0.5)'), { r: 10, g: 20, b: 30 });
  });
  it('returns null for unparseable colors', () => {
    assert.equal(parseColorToRgb('tomato'), null);
    assert.equal(parseColorToRgb(42), null);
  });
});

describe('contrastRatio / relativeLuminance', () => {
  it('black vs white is 21:1', () => {
    assert.equal(Math.round(contrastRatio('#000000', '#ffffff')), 21);
  });
  it('same color is 1:1', () => {
    assert.equal(contrastRatio('#777777', '#777777'), 1);
  });
  it('luminance is 0 for black and 1 for white', () => {
    assert.equal(relativeLuminance({ r: 0, g: 0, b: 0 }), 0);
    assert.ok(Math.abs(relativeLuminance({ r: 255, g: 255, b: 255 }) - 1) < 1e-9);
  });
  it('returns 1 when a color is unparseable', () => {
    assert.equal(contrastRatio('nope', '#fff'), 1);
  });
});

describe('getAccessibleTextColor', () => {
  it('picks black on light backgrounds, white on dark', () => {
    assert.equal(getAccessibleTextColor('#ffffff'), '#000000');
    assert.equal(getAccessibleTextColor('#000000'), '#ffffff');
    assert.equal(getAccessibleTextColor('#f59e0b'), '#000000'); // amber → dark text
    assert.equal(getAccessibleTextColor('#1e3a8a'), '#ffffff'); // navy → light text
  });
  it('accepts {r,g,b} and defaults to white when unparseable', () => {
    assert.equal(getAccessibleTextColor({ r: 255, g: 255, b: 255 }), '#000000');
    assert.equal(getAccessibleTextColor('tomato'), '#ffffff');
  });
});
