import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeColor, safeHexColor, safeCssDimension, clampNumber, applyStyles } from './css-safe.js';

test('safeColor accepts valid colors', () => {
  assert.equal(safeColor('#fff'), '#fff');
  assert.equal(safeColor('#3b82f6'), '#3b82f6');
  assert.equal(safeColor('#3b82f6f2'), '#3b82f6f2');
  assert.equal(safeColor('red'), 'red');
  assert.equal(safeColor('  rebeccapurple '), 'rebeccapurple');
  assert.equal(safeColor('rgb(1,2,3)'), 'rgb(1,2,3)');
  assert.equal(safeColor('rgba(1, 2, 3, .5)'), 'rgba(1, 2, 3, .5)');
  assert.equal(safeColor('hsl(120, 50%, 50%)'), 'hsl(120, 50%, 50%)');
});

test('safeColor rejects CSS-injection / breakout payloads → fallback', () => {
  const fb = '#000';
  assert.equal(safeColor('red;} body{display:none}', fb), fb);
  assert.equal(safeColor('red}};x{}', fb), fb);
  assert.equal(safeColor('"><script>alert(1)</script>', fb), fb);
  assert.equal(safeColor('" onmouseover="alert(1)', fb), fb);
  assert.equal(safeColor('url(javascript:alert(1))', fb), fb);
  assert.equal(safeColor('expression(alert(1))', fb), fb);
  assert.equal(safeColor('#ggg', fb), fb);          // not hex
  assert.equal(safeColor('rgb(1;2;3)', fb), fb);    // semicolons
  assert.equal(safeColor('', fb), fb);
  assert.equal(safeColor(null, fb), fb);
  assert.equal(safeColor(123, fb), fb);
});

test('safeHexColor normalizes hex and rejects non-hex (for alpha-append callers)', () => {
  assert.equal(safeHexColor('#3B82F6'), '#3b82f6');
  assert.equal(safeHexColor('#abc'), '#aabbcc');        // 3-digit expanded
  assert.equal(safeHexColor('#3b82f6ff'), '#3b82f6');   // 8-digit alpha dropped
  assert.equal(safeHexColor('red', '#000000'), '#000000');         // named → fallback
  assert.equal(safeHexColor('rgb(1,2,3)', '#000000'), '#000000');  // func → fallback
  assert.equal(safeHexColor('#ggg', '#000000'), '#000000');
  assert.equal(safeHexColor('#fff;}x{', '#000000'), '#000000');
});

test('safeCssDimension accepts numbers + units, rejects payloads', () => {
  assert.equal(safeCssDimension('120px'), '120px');
  assert.equal(safeCssDimension('50%'), '50%');
  assert.equal(safeCssDimension('1.5rem'), '1.5rem');
  assert.equal(safeCssDimension('200'), '200');
  assert.equal(safeCssDimension('100px;}html{x', 'auto'), 'auto');
  assert.equal(safeCssDimension('calc(100% - 4px)', 'auto'), 'auto');
  assert.equal(safeCssDimension(undefined, ''), '');
});

test('clampNumber coerces + clamps + falls back', () => {
  assert.equal(clampNumber('5', 0, 10, 1), 5);
  assert.equal(clampNumber('99', 0, 10, 1), 10);
  assert.equal(clampNumber('-99', 0, 10, 1), 0);
  assert.equal(clampNumber('abc', 0, 10, 7), 7);
  assert.equal(clampNumber(Infinity, 0, 10, 7), 7);
});

// Minimal fake element capturing setProperty calls — no DOM needed in node.
function fakeEl() {
  const set = [];
  return { set, style: { setProperty: (prop, value) => set.push([prop, value]) } };
}

test('applyStyles sets each prop via setProperty, stringifying values', () => {
  const el = fakeEl();
  applyStyles(el, { width: '50%', '--c': '#3b82f6', opacity: 0.5, 'z-index': 10 });
  assert.deepEqual(el.set, [
    ['width', '50%'],
    ['--c', '#3b82f6'],
    ['opacity', '0.5'],
    ['z-index', '10'],
  ]);
});

test('applyStyles skips null/undefined values (omit-by-nullish)', () => {
  const el = fakeEl();
  applyStyles(el, { color: 'red', background: null, border: undefined, width: 0 });
  assert.deepEqual(el.set, [['color', 'red'], ['width', '0']]);
});

test('applyStyles is a no-op (never throws) for null el or null styles', () => {
  assert.doesNotThrow(() => applyStyles(null, { color: 'red' }));
  assert.doesNotThrow(() => applyStyles(undefined, { color: 'red' }));
  const el = fakeEl();
  assert.doesNotThrow(() => applyStyles(el, null));
  assert.deepEqual(el.set, []);
});
