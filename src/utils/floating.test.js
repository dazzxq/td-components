// v0.34.0 (plan QĐ 7): popups are placed in the VISUAL viewport (the on-screen keyboard shrinks it).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { viewportBox } from './floating.js';

test('no visualViewport → the layout viewport', () => {
  assert.deepEqual(viewportBox({ innerWidth: 390, innerHeight: 844 }), { top: 0, left: 0, right: 390, bottom: 844 });
  assert.deepEqual(viewportBox({ innerWidth: 390, innerHeight: 844, visualViewport: null }), { top: 0, left: 0, right: 390, bottom: 844 });
});

test('keyboard open: the visual viewport is shorter (and may be scrolled)', () => {
  const win = { innerWidth: 390, innerHeight: 844, visualViewport: { offsetTop: 120, offsetLeft: 0, width: 390, height: 480 } };
  assert.deepEqual(viewportBox(win), { top: 120, left: 0, right: 390, bottom: 600 });
});

test('clamped to the layout viewport; degenerate visual viewport ignored', () => {
  const win = { innerWidth: 390, innerHeight: 844, visualViewport: { offsetTop: -10, offsetLeft: 300, width: 200, height: 2000 } };
  assert.deepEqual(viewportBox(win), { top: 0, left: 300, right: 390, bottom: 844 });
  assert.deepEqual(viewportBox({ innerWidth: 10, innerHeight: 20, visualViewport: { offsetTop: 0, offsetLeft: 0, width: 0, height: 0 } }), { top: 0, left: 0, right: 10, bottom: 20 });
});
