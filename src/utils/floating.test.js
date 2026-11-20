// v0.34.0 (plan QĐ 7): popups are placed in the VISUAL viewport (the on-screen keyboard shrinks it).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { viewportBox, placeBeside, inTriangle } from './floating.js';

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

// v0.118.0 (plan v0.118.0-menu-submenu QĐ 3 / QĐ 4): submenu placement beside the parent row + the safe triangle.
const P = (x, y) => ({ x, y });

test('inTriangle: inside, outside, on an edge, degenerate', () => {
  const a = P(0, 50);
  const b = P(100, 0);
  const c = P(100, 100);
  assert.equal(inTriangle(P(50, 50), a, b, c), true);
  assert.equal(inTriangle(P(99, 2), a, b, c), true);
  assert.equal(inTriangle(P(10, 10), a, b, c), false);
  assert.equal(inTriangle(P(120, 50), a, b, c), false);
  assert.equal(inTriangle(P(100, 50), a, b, c), true); // on the near edge
  assert.equal(inTriangle(P(50, 25), a, b, c), true); // on the a-b edge
  assert.equal(inTriangle(P(50, 50), P(0, 0), P(50, 50), P(100, 100)), false); // collinear → nothing
  assert.equal(inTriangle(P(0, 0), P(0, 0), P(0, 0), P(0, 0)), false);
  assert.equal(inTriangle(P(50, 50), a, c, b), true); // winding does not matter
});

function stubPanel(w, h) {
  const props = {};
  const listProps = {};
  const style = { setProperty: (k, v) => { props[k] = v; }, removeProperty: (k) => { delete props[k]; } };
  const list = { style: { setProperty: (k, v) => { listProps[k] = v; }, removeProperty: (k) => { delete listProps[k]; } } };
  return { panel: { offsetWidth: w, offsetHeight: h, style }, props, list, listProps };
}
const BOX = { top: 0, left: 0, right: 1000, bottom: 800 };
const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
const ROOT = rect(300, 100, 200, 300); // root menu
const ROW = rect(300, 160, 200, 40); // parent row inside it

test('placeBeside: inline-end fits → abuts the root, first row level with the parent row', () => {
  const { panel, props } = stubPanel(220, 200);
  const r = placeBeside(ROW, panel, { edge: ROOT, box: BOX, padTop: 6 });
  assert.deepEqual(r, { side: 'end', top: 154, left: 500 });
  assert.equal(props.left, '500px');
  assert.equal(props.top, '154px');
});

test('placeBeside: no room at the end → flips to the start side', () => {
  const { panel } = stubPanel(220, 200);
  const root = rect(700, 100, 200, 300);
  const r = placeBeside(rect(700, 160, 200, 40), panel, { edge: root, box: BOX, padTop: 6 });
  assert.equal(r.side, 'start');
  assert.equal(r.left, 480);
});

test('placeBeside: neither side fits → the side with more room, clamped into the box', () => {
  const box = { top: 0, left: 0, right: 600, bottom: 800 };
  const { panel } = stubPanel(250, 200);
  const r1 = placeBeside(rect(150, 160, 200, 40), panel, { edge: rect(150, 100, 200, 300), box, padTop: 6 });
  assert.equal(r1.side, 'end'); // right room 250 ≥ left room 150
  assert.equal(r1.left, 342); // 600 − 8 − 250 (overlaps the root)
  const r2 = placeBeside(rect(250, 160, 200, 40), panel, { edge: rect(250, 100, 200, 300), box, padTop: 6 });
  assert.equal(r2.side, 'start'); // left room 250 > right room 150
  assert.equal(r2.left, 8);
});

test('placeBeside: shifted up at the bottom edge, clamped to the top edge', () => {
  const { panel } = stubPanel(220, 300);
  const r = placeBeside(rect(300, 700, 200, 40), panel, { edge: ROOT, box: BOX, padTop: 6 });
  assert.equal(r.top, 492); // 800 − 8 − 300
  const tall = stubPanel(220, 900);
  const r2 = placeBeside(ROW, tall.panel, { edge: ROOT, box: BOX, padTop: 6 });
  assert.equal(r2.top, 8);
});

test('placeBeside: listMax caps the list (removed without one)', () => {
  const { panel, list, listProps } = stubPanel(220, 200);
  placeBeside(ROW, panel, { edge: ROOT, box: BOX, padTop: 6, list, listMax: 448 });
  assert.equal(listProps['max-height'], '448px');
  placeBeside(ROW, panel, { edge: ROOT, box: BOX, padTop: 6, list });
  assert.equal(listProps['max-height'], undefined);
});

test('placeBeside: RTL — inline-end is the left side', () => {
  const { panel } = stubPanel(220, 200);
  const r = placeBeside(ROW, panel, { edge: ROOT, box: BOX, padTop: 6, dir: 'rtl' });
  assert.deepEqual(r, { side: 'end', top: 154, left: 80 });
  const near = rect(100, 100, 200, 300);
  const r2 = placeBeside(rect(100, 160, 200, 40), panel, { edge: near, box: BOX, padTop: 6, dir: 'rtl' });
  assert.equal(r2.side, 'start');
  assert.equal(r2.left, 300);
});
