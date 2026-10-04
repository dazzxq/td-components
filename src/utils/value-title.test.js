// v0.34.0: pure parts of the clipped-value title helper (src/utils/value-title.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { displayedValueText, applyClippedTitle } from './value-title.js';

const span = (text, placeholder = false) => ({ localName: 'span', textContent: text, hasAttribute: (n) => placeholder && n === 'data-placeholder' });

test('displayedValueText: span text, placeholder → "", input value, input open for typing → ""', () => {
  assert.equal(displayedValueText(span('Điện thoại')), 'Điện thoại');
  assert.equal(displayedValueText(span('— Chọn —', true)), '');
  assert.equal(displayedValueText({ localName: 'input', value: 'iPhone 16' }), 'iPhone 16');
  assert.equal(displayedValueText({ localName: 'input', value: 'iPhone 16' }, { open: true }), '');
  assert.equal(displayedValueText(null), '');
});

function fakeEl(scrollWidth, clientWidth, title = null) {
  const attrs = new Map(title === null ? [] : [['title', title]]);
  const calls = [];
  return {
    scrollWidth,
    clientWidth,
    calls,
    getAttribute: (n) => (attrs.has(n) ? attrs.get(n) : null),
    hasAttribute: (n) => attrs.has(n),
    setAttribute: (n, v) => { calls.push(['set', v]); attrs.set(n, v); },
    removeAttribute: (n) => { calls.push(['remove']); attrs.delete(n); },
  };
}

test('applyClippedTitle: title only while clipped; removed when it fits / empty; no redundant writes', () => {
  let el = fakeEl(300, 160);
  applyClippedTitle(el, 'Một giá trị rất dài');
  assert.equal(el.getAttribute('title'), 'Một giá trị rất dài');
  applyClippedTitle(el, 'Một giá trị rất dài');
  assert.equal(el.calls.length, 1, 'same title → no second write');
  el.scrollWidth = 100;
  applyClippedTitle(el, 'Một giá trị rất dài');
  assert.equal(el.getAttribute('title'), null);
  el = fakeEl(300, 160, 'cũ');
  applyClippedTitle(el, '');
  assert.equal(el.hasAttribute('title'), false, 'empty / placeholder → removed');
  el = fakeEl(100, 160);
  applyClippedTitle(el, 'ngắn');
  assert.deepEqual(el.calls, [], 'fits and no title → untouched');
});
