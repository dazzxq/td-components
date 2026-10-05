// v0.36.2 (ADR 0019, plan QĐ 15): the on-screen keyboard box (visualViewport) and the reveal maths for dialogs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keyboardBox, revealDelta } from './keyboard-viewport.js';

const win = (vv, W = 390, H = 844) => ({ innerWidth: W, innerHeight: H, visualViewport: vv });
const vv = (o) => ({ offsetTop: 0, offsetLeft: 0, width: 390, height: 844, scale: 1, ...o });

test('keyboardBox: no visualViewport / a full one → null', () => {
  assert.equal(keyboardBox(win(null)), null);
  assert.equal(keyboardBox(win(undefined)), null);
  assert.equal(keyboardBox(win(vv({}))), null);
  assert.equal(keyboardBox(win(vv({ height: 843.5 }))), null); // ±1 px
});

test('keyboardBox: keyboard open (390×844, vv 480) → top 0, height 480, inset 364', () => {
  assert.deepEqual(keyboardBox(win(vv({ height: 480 }))), { top: 0, height: 480, inset: 364 });
});

test('keyboardBox: iOS scrolled the layout viewport (offsetTop 120) → top 120', () => {
  assert.deepEqual(keyboardBox(win(vv({ height: 480, offsetTop: 120 }))), { top: 120, height: 480, inset: 244 });
});

test('keyboardBox: pinch zoom (scale 1.6) → null (the user is zooming, never interfere)', () => {
  assert.equal(keyboardBox(win(vv({ height: 300, width: 240, scale: 1.6 }))), null);
  assert.deepEqual(keyboardBox(win(vv({ height: 480, scale: 1.005 }))), { top: 0, height: 480, inset: 364 });
});

test('keyboardBox: reads globalThis when no window is passed', () => {
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'visualViewport');
  const savedH = Object.getOwnPropertyDescriptor(globalThis, 'innerHeight');
  try {
    Object.defineProperty(globalThis, 'innerHeight', { value: 844, configurable: true });
    Object.defineProperty(globalThis, 'innerWidth', { value: 390, configurable: true });
    Object.defineProperty(globalThis, 'visualViewport', { value: vv({ height: 500 }), configurable: true });
    assert.deepEqual(keyboardBox(), { top: 0, height: 500, inset: 344 });
  } finally {
    if (saved) Object.defineProperty(globalThis, 'visualViewport', saved); else delete globalThis.visualViewport;
    if (savedH) Object.defineProperty(globalThis, 'innerHeight', savedH); else delete globalThis.innerHeight;
    delete globalThis.innerWidth;
  }
});

test('revealDelta: below / above / inside / taller than the visible part of the scroller', () => {
  const scroller = { top: 100, bottom: 800 };
  const visible = { top: 0, bottom: 480 };
  // area = [100 + 8, 480 − 8] = [108, 472]
  assert.equal(revealDelta({ top: 500, bottom: 560 }, scroller, visible), 560 - 472); // below → scroll down
  assert.equal(revealDelta({ top: 50, bottom: 90 }, scroller, visible), 50 - 108); // above → scroll up
  assert.equal(revealDelta({ top: 200, bottom: 260 }, scroller, visible), 0); // inside
  assert.equal(revealDelta({ top: 300, bottom: 900 }, scroller, visible), 300 - 108); // taller → top edge first
  assert.equal(revealDelta({ top: 500, bottom: 560 }, scroller, visible, 0), 560 - 480);
});
