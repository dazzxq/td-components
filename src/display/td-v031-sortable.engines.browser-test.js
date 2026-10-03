import { expect } from '@esm-bundle/chai';
import { sendKeys, sendMouse, resetMouse, emulateMedia } from '@web/test-runner-commands';
import { TdSortable } from './td-sortable.js';
import { TdInputField } from '../form/td-input-field.js';
import './td-media-grid.js';
import { TdModal } from '../feedback/td-modal.js';
import { TdLoading } from '../feedback/td-loading.js';
import { hasActiveAbove } from '../utils/layers.js';

// v0.31.0 (plan docs/internal/plans/v0.31.0-sortable-masked.md M2 + M3) — <td-sortable> + the shared SortableController
// in Chromium, Firefox AND WebKit: real mouse drags (sendMouse), synthetic touch / pen PointerEvents, keyboard lift.
// DOM nodes are compared as booleans (`a === b`): a failing chai assertion carrying DOM nodes hangs the runner.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const wait = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
const extra = [];
afterEach(async () => {
  await resetMouse();
  extra.splice(0).reverse().forEach((f) => f());
  await wait();
});

/** mount markup in an absolutely positioned 400px box at the top-left of the viewport */
function mount(html, { width = 400 } = {}) {
  const wrap = document.createElement('div');
  for (const [k, v] of [['position', 'absolute'], ['top', '0px'], ['left', '0px'], ['width', `${width}px`], ['background', '#fff'], ['z-index', '1']]) {
    wrap.style.setProperty(k, v);
  }
  wrap.innerHTML = html;
  document.body.appendChild(wrap);
  extra.push(() => wrap.remove());
  for (const it of wrap.querySelectorAll('[data-td-sort-item]')) {
    if (!it.closest('td-media-grid')) { it.style.setProperty('height', '40px'); it.style.setProperty('box-sizing', 'border-box'); }
  }
  return wrap;
}
const item = (i, more = '') => `<div data-td-sort-item data-id="s${i}" data-td-sort-label="Mục ${i}"${more}>M${i}</div>`;
const list = (n, host = '') => `<td-sortable label="Section"${host}>${Array.from({ length: n }, (_, i) => item(i + 1)).join('')}</td-sortable>`;
const itemsOf = (s) => [...s.children].filter((c) => c.hasAttribute('data-td-sort-item'));
const ids = (s) => itemsOf(s).map((c) => c.getAttribute('data-id'));
const handle = (s, i) => itemsOf(s)[i].querySelector('.td-sortable__handle');
const live = (s) => s.querySelector(':scope > [role="status"]');
const center = (el) => { const r = el.getBoundingClientRect(); return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)]; };
function record(s) {
  const rec = [];
  s.addEventListener('order-change', (e) => rec.push(JSON.parse(JSON.stringify({ ...e.detail }))));
  return rec;
}
function captureWarn() {
  const warns = [];
  const orig = console.warn;
  console.warn = (...a) => warns.push(a.map(String).join(' '));
  extra.push(() => { console.warn = orig; });
  return warns;
}
/** no trace of a gesture left anywhere in the host */
function noTraces(s) {
  expect(s.hasAttribute('data-td-dragging'), 'host data-td-dragging').to.equal(false);
  expect(!!s.querySelector('.td-sortable__placeholder'), 'placeholder').to.equal(false);
  expect(!!s.querySelector('[data-td-sort-state]'), 'item state').to.equal(false);
  for (const it of itemsOf(s)) {
    expect(it.style.getPropertyValue('--_td-sort-x'), 'x').to.equal('');
    expect(it.style.getPropertyValue('--_td-sort-y'), 'y').to.equal('');
  }
  expect(hasActiveAbove(-1), 'no layer registration left').to.equal(false);
}
async function mouseDown(at) {
  await sendMouse({ type: 'move', position: at });
  await sendMouse({ type: 'down' });
}
async function mouseTo(from, to, steps = 6) {
  for (let i = 1; i <= steps; i += 1) {
    await sendMouse({ type: 'move', position: [Math.round(from[0] + ((to[0] - from[0]) * i) / steps), Math.round(from[1] + ((to[1] - from[1]) * i) / steps)] });
    await frame();
  }
}
async function mouseDrag(from, to) {
  await mouseDown(from);
  await mouseTo(from, to);
  await sendMouse({ type: 'up' });
  await frame();
}
/** synthetic pointer event (touch / pen) */
function pe(type, el, x, y, o = {}) {
  el.dispatchEvent(new PointerEvent(type, {
    bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, pointerId: 9, pointerType: 'touch', isPrimary: true,
    button: type === 'pointermove' ? -1 : 0, buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : 1, ...o,
  }));
}
async function touchDrag(s, from, to, { end = 'pointerup', type = 'touch' } = {}) {
  const h = handle(s, from);
  const [x0, y0] = center(h);
  const [x1, y1] = center(itemsOf(s)[to]);
  pe('pointerdown', h, x0, y0, { pointerType: type });
  for (let i = 1; i <= 5; i += 1) {
    pe('pointermove', h, x0 + ((x1 - x0) * i) / 5, y0 + ((y1 - y0) * i) / 5, { pointerType: type });
    await frame();
  }
  if (end) pe(end, h, x1, y1, { pointerType: type });
  await frame();
}

describe('td-sortable — upgrade in place (M3)', () => {
  it('kit handle = first child of each item; host role=list + aria-label; items listitem; help + live region', () => {
    const w = mount(list(3));
    const s = w.querySelector('td-sortable');
    expect(s.getAttribute('role')).to.equal('list');
    expect(s.getAttribute('aria-label')).to.equal('Section');
    const its = itemsOf(s);
    expect(its.map((i) => i.getAttribute('role'))).to.deep.equal(['listitem', 'listitem', 'listitem']);
    const h = its[0].firstElementChild;
    expect(h.localName).to.equal('button');
    expect(h.type).to.equal('button');
    expect(h.classList.contains('td-sortable__handle')).to.equal(true);
    expect(h.getAttribute('aria-label')).to.equal('Sắp xếp Mục 1');
    expect(!!h.querySelector('svg[data-icon="grip"]')).to.equal(true);
    const help = s.querySelector(`#${CSS.escape(h.getAttribute('aria-describedby'))}`);
    expect(!!help && help.parentElement === s && help.hidden).to.equal(true);
    expect(help.textContent).to.equal(TdSortable.labels.help);
    expect(live(s).classList.contains('td-sr-only')).to.equal(true);
    expect(itemsOf(s).length).to.equal(3, 'help / live region are not items');
  });

  it('ids are unique across hosts (counter, not data)', () => {
    const w = mount(list(2) + list(2));
    const [a, b] = w.querySelectorAll('td-sortable');
    expect(handle(a, 0).getAttribute('aria-describedby')).to.not.equal(handle(b, 0).getAttribute('aria-describedby'));
  });

  it('a [data-td-sort-handle] placeholder receives the kit button; an app button is upgraded in place; app roles kept', () => {
    const w = mount(`<td-sortable role="none"><div data-td-sort-item data-id="a" role="option"><span data-td-sort-handle class="slot"></span>A</div>`
      + '<div data-td-sort-item data-id="b"><button type="button" data-td-sort-handle class="mine" aria-label="Kéo B">≡</button>B</div>'
      + '<div data-td-sort-item data-id="c"><button type="button" data-td-sort-handle class="bare"></button>C</div></td-sortable>');
    const s = w.querySelector('td-sortable');
    expect(s.getAttribute('role')).to.equal('none');
    expect(itemsOf(s)[0].getAttribute('role')).to.equal('option');
    const slot = s.querySelector('.slot');
    expect(slot.querySelectorAll('button.td-sortable__handle').length).to.equal(1);
    const mine = s.querySelector('.mine');
    expect(mine.classList.contains('td-sortable__handle')).to.equal(true);
    expect(mine.getAttribute('aria-label')).to.equal('Kéo B');
    expect(!!mine.getAttribute('aria-describedby')).to.equal(true);
    expect(itemsOf(s)[1].querySelectorAll('button').length).to.equal(1, 'no extra kit button');
    expect(s.querySelector('.bare').getAttribute('aria-label')).to.equal('Sắp xếp Mục 3');
  });

  it('re-connect: no duplicate handle / help / live region; one lift per click', async () => {
    const w = mount(list(3));
    const s = w.querySelector('td-sortable');
    s.remove();
    w.appendChild(s);
    await wait();
    expect(s.querySelectorAll('.td-sortable__handle').length).to.equal(3);
    expect(s.querySelectorAll(':scope > [role="status"]').length).to.equal(1);
    expect(s.querySelectorAll(':scope > span[hidden]').length).to.equal(1);
    handle(s, 0).click();
    expect(itemsOf(s)[0].getAttribute('data-td-sort-state')).to.equal('lifted');
    handle(s, 0).click();
    expect(itemsOf(s)[0].hasAttribute('data-td-sort-state')).to.equal(false, 'listener bound once: second click drops');
    noTraces(s);
  });

  it('an item appended later is upgraded', async () => {
    const w = mount(list(2));
    const s = w.querySelector('td-sortable');
    s.insertAdjacentHTML('beforeend', item(9));
    await wait();
    expect(!!handle(s, 2)).to.equal(true);
    expect(itemsOf(s)[2].getAttribute('role')).to.equal('listitem');
    expect(s.order).to.deep.equal(['s1', 's2', 's9']);
  });
});

describe('td-sortable — keyboard (lift, arrows, drop)', () => {
  it('Enter lifts, ↓ ↓ moves the DOM (focus kept, fields in the item not re-connected), Space drops: one order-change', async () => {
    const w = mount(`<td-sortable label="L">${item(1)}<div data-td-sort-item data-id="s2" data-td-sort-label="Mục 2"><td-input-field label="Tên" value="x"></td-input-field></div>${item(3)}${item(4)}${item(5)}</td-sortable>`);
    const s = w.querySelector('td-sortable');
    const rec = record(s);
    const field = s.querySelector('td-input-field');
    let reconnects = 0;
    const orig = TdInputField.prototype.connectedCallback;
    TdInputField.prototype.connectedCallback = function patched() { if (this === field) reconnects += 1; return orig.call(this); };
    extra.push(() => { TdInputField.prototype.connectedCallback = orig; });
    const h = handle(s, 1);
    h.focus();
    await sendKeys({ press: 'Enter' });
    expect(itemsOf(s)[1].getAttribute('data-td-sort-state')).to.equal('lifted');
    expect(live(s).textContent).to.equal('Đã nhấc Mục 2, vị trí 2 trên 5.');
    await sendKeys({ press: 'ArrowDown' });
    await sendKeys({ press: 'ArrowDown' });
    expect(ids(s)).to.deep.equal(['s1', 's3', 's4', 's2', 's5']);
    expect(document.activeElement === h).to.equal(true);
    expect(live(s).textContent).to.equal('Mục 2: vị trí 4 trên 5.');
    expect(rec.length).to.equal(0, 'no event per step');
    expect(reconnects).to.equal(0);
    await sendKeys({ press: 'Space' });
    expect(rec.length).to.equal(1);
    expect(rec[0]).to.deep.equal({ order: ['s1', 's3', 's4', 's2', 's5'], previous: ['s1', 's2', 's3', 's4', 's5'], id: 's2', from: 1, to: 3, source: 'keyboard' });
    expect(live(s).textContent).to.equal('Đã thả Mục 2 ở vị trí 4 trên 5.');
    noTraces(s);
  });

  it('Space keydown → keyup → click toggles exactly once (lift, then drop)', async () => {
    const s = mount(list(3)).querySelector('td-sortable');
    handle(s, 0).focus();
    await sendKeys({ press: 'Space' });
    expect(itemsOf(s)[0].getAttribute('data-td-sort-state')).to.equal('lifted');
    await sendKeys({ press: 'Space' });
    expect(itemsOf(s)[0].hasAttribute('data-td-sort-state')).to.equal(false);
  });

  it('a click with detail 0 (screen reader browse mode) lifts', () => {
    const s = mount(list(3)).querySelector('td-sortable');
    handle(s, 2).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 0 }));
    expect(itemsOf(s)[2].getAttribute('data-td-sort-state')).to.equal('lifted');
    handle(s, 2).click();
  });

  it('Escape puts the DOM back, no event, "cancelled" announced', async () => {
    const s = mount(list(4)).querySelector('td-sortable');
    const rec = record(s);
    handle(s, 0).focus();
    await sendKeys({ press: 'Enter' });
    await sendKeys({ press: 'ArrowDown' });
    await sendKeys({ press: 'ArrowDown' });
    expect(ids(s)).to.deep.equal(['s2', 's3', 's1', 's4']);
    await sendKeys({ press: 'Escape' });
    expect(ids(s)).to.deep.equal(['s1', 's2', 's3', 's4']);
    expect(rec.length).to.equal(0);
    expect(live(s).textContent).to.equal('Đã huỷ, Mục 1 về vị trí 1 trên 4.');
    noTraces(s);
  });

  it('Home / End; at a boundary nothing moves and first / last is announced', async () => {
    const s = mount(list(4)).querySelector('td-sortable');
    handle(s, 1).focus();
    await sendKeys({ press: 'Enter' });
    await sendKeys({ press: 'End' });
    expect(ids(s)).to.deep.equal(['s1', 's3', 's4', 's2']);
    await sendKeys({ press: 'ArrowDown' });
    expect(ids(s)).to.deep.equal(['s1', 's3', 's4', 's2']);
    expect(live(s).textContent).to.equal('Mục 2 đã ở cuối danh sách.');
    await sendKeys({ press: 'Home' });
    expect(ids(s)).to.deep.equal(['s2', 's1', 's3', 's4']);
    await sendKeys({ press: 'ArrowUp' });
    expect(live(s).textContent).to.equal('Mục 2 đã ở đầu danh sách.');
    await sendKeys({ press: 'Enter' });
  });

  it('grid (3 columns): ↑ / ↓ = ±3; ← / → reversed under dir=rtl', async () => {
    const w = mount(list(6));
    const s = w.querySelector('td-sortable');
    for (const [k, v] of [['display', 'grid'], ['grid-template-columns', 'repeat(3, 100px)'], ['gap', '10px']]) s.style.setProperty(k, v);
    handle(s, 0).focus();
    await sendKeys({ press: 'Enter' });
    await sendKeys({ press: 'ArrowDown' });
    expect(ids(s)).to.deep.equal(['s2', 's3', 's4', 's1', 's5', 's6']);
    await sendKeys({ press: 'ArrowDown' }); // out of the grid → unchanged
    expect(ids(s)[3]).to.equal('s1');
    await sendKeys({ press: 'ArrowUp' });
    expect(ids(s)[0]).to.equal('s1');
    await sendKeys({ press: 'Enter' });
    s.setAttribute('dir', 'rtl');
    handle(s, 1).focus();
    await sendKeys({ press: 'Enter' });
    await sendKeys({ press: 'ArrowLeft' }); // rtl: ← = forward
    expect(ids(s)).to.deep.equal(['s1', 's3', 's2', 's4', 's5', 's6']);
    await sendKeys({ press: 'ArrowRight' });
    expect(ids(s)).to.deep.equal(['s1', 's2', 's3', 's4', 's5', 's6']);
    await sendKeys({ press: 'Escape' });
  });

  it('focus leaving the handle drops (event)', async () => {
    const w = mount(`${list(3)}<button type="button" class="out">out</button>`);
    const s = w.querySelector('td-sortable');
    const rec = record(s);
    handle(s, 0).focus();
    await sendKeys({ press: 'Enter' });
    await sendKeys({ press: 'ArrowDown' });
    w.querySelector('.out').focus();
    expect(rec.length).to.equal(1);
    expect(rec[0].source).to.equal('keyboard');
    expect(rec[0].order).to.deep.equal(['s2', 's1', 's3']);
    noTraces(s);
  });

  it('arrows on a handle that is not lifted do nothing', async () => {
    const s = mount(list(3)).querySelector('td-sortable');
    handle(s, 0).focus();
    await sendKeys({ press: 'ArrowDown' });
    expect(ids(s)).to.deep.equal(['s1', 's2', 's3']);
  });
});

describe('td-sortable — tap-to-move (WCAG 2.5.7) and pointer', () => {
  it('click handle A then handle C → A goes to C\'s place, source pointer; a pointerdown on C does not drop early', async () => {
    const s = mount(list(4)).querySelector('td-sortable');
    const rec = record(s);
    await mouseDrag(center(handle(s, 0)), center(handle(s, 0)));
    expect(itemsOf(s)[0].getAttribute('data-td-sort-state')).to.equal('lifted');
    const c = handle(s, 2);
    await mouseDown(center(c));
    expect(itemsOf(s)[0].getAttribute('data-td-sort-state')).to.equal('lifted', 'still lifted after pointerdown on C');
    await sendMouse({ type: 'up' });
    await frame();
    expect(ids(s)).to.deep.equal(['s2', 's3', 's1', 's4']);
    expect(rec.length).to.equal(1);
    expect(rec[0]).to.include({ id: 's1', from: 0, to: 2, source: 'pointer' });
    noTraces(s);
  });

  it('< 4px of movement is a click (lift), not a drag', async () => {
    const s = mount(list(3)).querySelector('td-sortable');
    const [x, y] = center(handle(s, 0));
    await mouseDown([x, y]);
    await sendMouse({ type: 'move', position: [x + 2, y + 1] });
    await frame();
    expect(s.hasAttribute('data-td-dragging')).to.equal(false);
    await sendMouse({ type: 'up' });
    expect(itemsOf(s)[0].getAttribute('data-td-sort-state')).to.equal('lifted');
    handle(s, 0).click();
  });

  it('vertical list: drag past the threshold → placeholder + data-td-dragging; drop at the slot under the pointer; click after the drag swallowed', async () => {
    const s = mount(list(5)).querySelector('td-sortable');
    const rec = record(s);
    const from = center(handle(s, 0));
    const to = [from[0], center(itemsOf(s)[3])[1]];
    await mouseDown(from);
    await mouseTo(from, to);
    expect(s.hasAttribute('data-td-dragging')).to.equal(true);
    const ph = s.querySelector(':scope > .td-sortable__placeholder');
    expect(!!ph && ph.getAttribute('aria-hidden') === 'true').to.equal(true);
    expect(itemsOf(s)[0].getAttribute('data-td-sort-state')).to.equal('dragging');
    expect(itemsOf(s)[0].style.getPropertyValue('--_td-sort-y')).to.not.equal('');
    expect(ids(s)).to.deep.equal(['s1', 's2', 's3', 's4', 's5'], 'DOM unchanged while dragging');
    await sendMouse({ type: 'up' });
    await frame();
    expect(ids(s)).to.deep.equal(['s2', 's3', 's4', 's1', 's5']);
    expect(rec.length).to.equal(1);
    expect(rec[0]).to.include({ id: 's1', from: 0, to: 3, source: 'pointer' });
    await wait(50);
    expect(!!s.querySelector('[data-td-sort-state="lifted"]')).to.equal(false, 'the click after a drag is swallowed');
    noTraces(s);
    // a later genuine click still lifts
    handle(s, 0).click();
    expect(itemsOf(s)[0].getAttribute('data-td-sort-state')).to.equal('lifted');
    handle(s, 0).click();
  });

  it('horizontal list (flex row) and 3-column grid drops land on the right index', async () => {
    const w = mount(list(4) + list(6));
    const [row, grid] = w.querySelectorAll('td-sortable');
    row.style.setProperty('display', 'flex');
    for (const it of itemsOf(row)) it.style.setProperty('width', '80px');
    let rec = record(row);
    await mouseDrag(center(handle(row, 3)), center(itemsOf(row)[1]));
    expect(ids(row)).to.deep.equal(['s1', 's4', 's2', 's3']);
    expect(rec[0]).to.include({ from: 3, to: 1 });
    for (const [k, v] of [['display', 'grid'], ['grid-template-columns', 'repeat(3, 100px)'], ['gap', '10px']]) grid.style.setProperty(k, v);
    rec = record(grid);
    await mouseDrag(center(handle(grid, 0)), center(itemsOf(grid)[5]));
    expect(ids(grid)).to.deep.equal(['s2', 's3', 's4', 's5', 's6', 's1']);
    await mouseDrag(center(handle(grid, 5)), center(itemsOf(grid)[1]));
    expect(ids(grid)).to.deep.equal(['s2', 's1', 's3', 's4', 's5', 's6']);
    expect(rec.length).to.equal(2);
    noTraces(grid);
  });

  it('pointercancel (touch) mid-drag → cancelled, DOM unchanged, no traces', async () => {
    const s = mount(list(4)).querySelector('td-sortable');
    const rec = record(s);
    await touchDrag(s, 0, 2, { end: null });
    expect(s.hasAttribute('data-td-dragging')).to.equal(true);
    pe('pointercancel', handle(s, 0), 0, 0);
    await frame();
    expect(ids(s)).to.deep.equal(['s1', 's2', 's3', 's4']);
    expect(rec.length).to.equal(0);
    noTraces(s);
  });

  it('touch and pen drags work; the handle never scrolls the page (touch-action: none)', async () => {
    const s = mount(list(4)).querySelector('td-sortable');
    expect(getComputedStyle(handle(s, 0)).touchAction).to.equal('none');
    const rec = record(s);
    await touchDrag(s, 0, 2);
    expect(ids(s)).to.deep.equal(['s2', 's3', 's1', 's4']);
    await touchDrag(s, 2, 0, { type: 'pen' });
    expect(ids(s)).to.deep.equal(['s1', 's2', 's3', 's4']);
    expect(rec.map((r) => r.source)).to.deep.equal(['pointer', 'pointer']);
    noTraces(s);
  });

  it('Escape mid-drag, page hidden, disconnect, app removing an item → cancelled with no traces', async () => {
    const s = mount(list(4)).querySelector('td-sortable');
    const rec = record(s);
    const from = center(handle(s, 0));
    const to = [from[0], center(itemsOf(s)[2])[1]];
    await mouseDown(from);
    await mouseTo(from, to);
    await sendKeys({ press: 'Escape' });
    await sendMouse({ type: 'up' });
    await frame();
    expect(ids(s)).to.deep.equal(['s1', 's2', 's3', 's4']);
    noTraces(s);

    await touchDrag(s, 0, 2, { end: null });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    delete document.visibilityState;
    noTraces(s);

    await touchDrag(s, 0, 2, { end: null });
    window.dispatchEvent(new Event('pagehide'));
    noTraces(s);

    await touchDrag(s, 0, 2, { end: null });
    const parent = s.parentNode;
    s.remove();
    noTraces(s);
    parent.appendChild(s);
    await wait();

    await touchDrag(s, 0, 2, { end: null });
    itemsOf(s)[3].remove();
    await wait();
    noTraces(s);
    expect(ids(s)).to.deep.equal(['s1', 's2', 's3']);
    pe('pointerup', document.body, 0, 0);
    expect(rec.length).to.equal(0);
  });

  it('auto-scroll: holding near the bottom edge of a scroll container scrolls it; the drop index accounts for the scroll', async () => {
    const w = mount(`<div class="sc">${list(12)}</div>`);
    const sc = w.querySelector('.sc');
    for (const [k, v] of [['height', '160px'], ['overflow', 'auto']]) sc.style.setProperty(k, v);
    const s = sc.querySelector('td-sortable');
    const rec = record(s);
    const from = center(handle(s, 0));
    const r = sc.getBoundingClientRect();
    const to = [from[0], Math.round(r.bottom - 6)];
    await mouseDown(from);
    await mouseTo(from, to);
    await wait(250);
    await frame();
    expect(sc.scrollTop).to.be.greaterThan(0);
    await sendMouse({ type: 'up' });
    await frame();
    const hr = s.getBoundingClientRect();
    const want = Math.min(11, Math.floor((to[1] - hr.top) / 40));
    expect(ids(s).indexOf('s1')).to.equal(want);
    expect(rec[0].to).to.equal(want);
    noTraces(s);
  });
});

describe('td-sortable — fields inside items', () => {
  it('typing, arrows in an input / select and clicking into them never lift or move', async () => {
    const s = mount(`<td-sortable>${item(1)}<div data-td-sort-item data-id="s2"><input class="in" aria-label="x"><select class="sel" aria-label="y"><option>a</option><option>b</option></select></div>${item(3)}</td-sortable>`).querySelector('td-sortable');
    const input = s.querySelector('.in');
    await mouseDrag(center(input), center(input));
    expect(document.activeElement === input).to.equal(true);
    await sendKeys({ type: 'ab' });
    await sendKeys({ press: 'ArrowDown' });
    await sendKeys({ press: 'Space' });
    s.querySelector('.sel').focus();
    await sendKeys({ press: 'ArrowDown' });
    expect(ids(s)).to.deep.equal(['s1', 's2', 's3']);
    expect(!!s.querySelector('[data-td-sort-state]')).to.equal(false);
    expect(input.value).to.equal('ab ');
  });
});

describe('td-sortable — keys (data-id) are mandatory', () => {
  it('missing / duplicate data-id → handles aria-disabled, one warning, never order-change; fixed → enabled', async () => {
    const warns = captureWarn();
    const s = mount(`<td-sortable>${item(1)}<div data-td-sort-item data-id="s1">dup</div><div data-td-sort-item>none</div></td-sortable>`).querySelector('td-sortable');
    const rec = record(s);
    expect(itemsOf(s).every((it) => it.querySelector('.td-sortable__handle').getAttribute('aria-disabled') === 'true')).to.equal(true);
    expect(warns.filter((m) => m.includes('td-sortable')).length).to.equal(1);
    handle(s, 0).click();
    expect(!!s.querySelector('[data-td-sort-state]')).to.equal(false);
    await mouseDrag(center(handle(s, 0)), center(itemsOf(s)[2]));
    expect(ids(s)).to.deep.equal(['s1', 's1', null]);
    expect(rec.length).to.equal(0);
    itemsOf(s)[1].setAttribute('data-id', 's2');
    itemsOf(s)[2].setAttribute('data-id', 's3');
    await wait();
    expect(handle(s, 0).hasAttribute('aria-disabled')).to.equal(false);
    handle(s, 0).focus();
    await sendKeys({ press: 'Enter' });
    await sendKeys({ press: 'ArrowDown' });
    await sendKeys({ press: 'Enter' });
    expect(rec.length).to.equal(1);
    expect(warns.filter((m) => m.includes('td-sortable')).length).to.equal(1, 'still one warning');
  });

  it('data-id made a duplicate while lifted → gesture cancelled, no event', async () => {
    const s = mount(list(3)).querySelector('td-sortable');
    const rec = record(s);
    captureWarn();
    handle(s, 0).focus();
    await sendKeys({ press: 'Enter' });
    await sendKeys({ press: 'ArrowDown' });
    itemsOf(s)[2].setAttribute('data-id', 's1');
    await wait();
    expect(!!s.querySelector('[data-td-sort-state]')).to.equal(false);
    expect(handle(s, 0).getAttribute('aria-disabled')).to.equal('true');
    await sendKeys({ press: 'Enter' });
    expect(rec.length).to.equal(0);
    expect(hasActiveAbove(-1)).to.equal(false);
  });

  it('data-id changed but still valid while lifted → the gesture goes on, order-change carries the NEW id', async () => {
    const s = mount(list(3)).querySelector('td-sortable');
    const rec = record(s);
    handle(s, 0).focus();
    await sendKeys({ press: 'Enter' });
    itemsOf(s)[0].setAttribute('data-id', 'new1');
    await wait();
    await sendKeys({ press: 'ArrowDown' });
    await sendKeys({ press: 'Enter' });
    expect(rec.length).to.equal(1);
    expect(rec[0].id).to.equal('new1');
    expect(rec[0].order).to.deep.equal(['s2', 'new1', 's3']);
    expect(rec[0].previous).to.deep.equal(['new1', 's2', 's3']);
  });

  it('duplicate id set in the same task as the drop → the pre-commit check blocks the event', async () => {
    captureWarn();
    const s = mount(list(3)).querySelector('td-sortable');
    const rec = record(s);
    await touchDrag(s, 0, 2, { end: null });
    const h = handle(s, 0);
    itemsOf(s)[1].setAttribute('data-id', 's3');
    pe('pointerup', h, ...center(itemsOf(s)[2]));
    expect(rec.length).to.equal(0);
    await wait();
    noTraces(s);
  });
});

describe('td-sortable — the controller\'s own mutations', () => {
  it('lift + ↓ ↓ ↓ (direct children reordered) and the drag placeholder never cancel the gesture', async () => {
    const s = mount(list(5)).querySelector('td-sortable');
    handle(s, 0).focus();
    await sendKeys({ press: 'Enter' });
    for (let i = 0; i < 3; i += 1) { await sendKeys({ press: 'ArrowDown' }); await wait(); }
    expect(itemsOf(s)[3].getAttribute('data-td-sort-state')).to.equal('lifted');
    expect(ids(s)).to.deep.equal(['s2', 's3', 's4', 's1', 's5']);
    await sendKeys({ press: 'Escape' });
    expect(ids(s)).to.deep.equal(['s1', 's2', 's3', 's4', 's5']);
    await touchDrag(s, 0, 3, { end: null });
    await wait();
    expect(s.hasAttribute('data-td-dragging')).to.equal(true, 'placeholder insertion did not cancel');
    pe('pointerup', handle(s, 0), ...center(itemsOf(s)[3]));
    expect(ids(s)).to.deep.equal(['s2', 's3', 's4', 's1', 's5']);
  });

  it('the app inserting an item while lifted → cancelled "external" (no move back), model = DOM', async () => {
    const s = mount(list(3)).querySelector('td-sortable');
    const rec = record(s);
    handle(s, 0).focus();
    await sendKeys({ press: 'Enter' });
    await sendKeys({ press: 'ArrowDown' });
    s.insertAdjacentHTML('afterbegin', item(7));
    await wait();
    expect(!!s.querySelector('[data-td-sort-state]')).to.equal(false);
    expect(ids(s)).to.deep.equal(['s7', 's2', 's1', 's3'], 'not moved back');
    expect(rec.length).to.equal(0);
    expect(hasActiveAbove(-1)).to.equal(false);
    handle(s, 0).focus();
    await sendKeys({ press: 'Enter' });
    await sendKeys({ press: 'End' });
    await sendKeys({ press: 'Enter' });
    expect(ids(s)).to.deep.equal(['s2', 's1', 's3', 's7']);
    expect(rec[0].previous).to.deep.equal(['s7', 's2', 's1', 's3']);
  });
});

describe('td-sortable — layers (Escape, modal, loading)', () => {
  it('inside an open td-modal: Escape cancels the lift, the modal stays open; the second Escape goes to the modal', async () => {
    const body = document.createElement('div');
    body.innerHTML = list(3);
    const id = TdModal.show({ title: 'M', body });
    extra.push(() => TdModal.closeById(id));
    await frame();
    await wait(50);
    const s = body.querySelector('td-sortable');
    handle(s, 0).focus();
    await sendKeys({ press: 'Enter' });
    await sendKeys({ press: 'ArrowDown' });
    await sendKeys({ press: 'Escape' });
    expect(ids(s)).to.deep.equal(['s1', 's2', 's3']);
    expect(!!document.querySelector('.td-modal[data-state="open"]')).to.equal(true);
    expect(hasActiveAbove(450)).to.equal(false);
    // drag inside the modal: Escape cancels, modal open
    const from = center(handle(s, 0));
    await mouseDown(from);
    await mouseTo(from, [from[0], center(itemsOf(s)[2])[1]]);
    expect(s.hasAttribute('data-td-dragging')).to.equal(true);
    await sendKeys({ press: 'Escape' });
    await sendMouse({ type: 'up' });
    expect(ids(s)).to.deep.equal(['s1', 's2', 's3']);
    expect(!!document.querySelector('.td-modal[data-state="open"]')).to.equal(true);
  });

  it('TdModal.show() / TdLoading.show() by code during a lift / drag → cancelled (DOM back, no event)', async () => {
    const s = mount(list(3)).querySelector('td-sortable');
    const rec = record(s);
    handle(s, 0).focus();
    await sendKeys({ press: 'Enter' });
    await sendKeys({ press: 'ArrowDown' });
    const id = TdModal.show({ title: 'Code', body: 'x' });
    expect(ids(s)).to.deep.equal(['s1', 's2', 's3']);
    expect(!!s.querySelector('[data-td-sort-state]')).to.equal(false);
    TdModal.closeById(id);
    await wait(50);
    await touchDrag(s, 0, 2, { end: null });
    TdLoading.show({ maxDuration: false });
    extra.push(() => TdLoading.hide());
    expect(s.hasAttribute('data-td-dragging')).to.equal(false);
    TdLoading.hide();
    pe('pointerup', document.body, 0, 0);
    expect(rec.length).to.equal(0);
    expect(ids(s)).to.deep.equal(['s1', 's2', 's3']);
    await wait(50);
    expect(hasActiveAbove(-1)).to.equal(false);
  });

  it('the modal holding the sortable closed by code mid-lift → cancelled', async () => {
    const body = document.createElement('div');
    body.innerHTML = list(3);
    const id = TdModal.show({ title: 'M', body });
    await frame();
    const s = body.querySelector('td-sortable');
    handle(s, 1).click();
    expect(itemsOf(s)[1].getAttribute('data-td-sort-state')).to.equal('lifted');
    TdModal.closeById(id);
    expect(!!s.querySelector('[data-td-sort-state]')).to.equal(false);
    await wait(50);
    expect(hasActiveAbove(-1)).to.equal(false);
  });
});

describe('td-sortable — API, disabled, nesting', () => {
  it('setOrder: a permutation reorders without an event (cancels a lift first); anything else is refused + warned', async () => {
    const warns = captureWarn();
    const s = mount(list(4)).querySelector('td-sortable');
    const rec = record(s);
    handle(s, 0).click();
    expect(s.setOrder(['s4', 's3', 's2', 's1'])).to.equal(true);
    expect(ids(s)).to.deep.equal(['s4', 's3', 's2', 's1']);
    expect(s.order).to.deep.equal(['s4', 's3', 's2', 's1']);
    expect(!!s.querySelector('[data-td-sort-state]')).to.equal(false);
    expect(s.setOrder(['s1', 's2'])).to.equal(false);
    expect(s.setOrder(['s1', 's2', 's3', 's3'])).to.equal(false);
    expect(s.setOrder(['s1', 's2', 's3', 'x'])).to.equal(false);
    expect(s.setOrder('s1')).to.equal(false);
    expect(ids(s)).to.deep.equal(['s4', 's3', 's2', 's1']);
    expect(warns.some((m) => m.includes('setOrder'))).to.equal(true);
    expect(rec.length).to.equal(0);
  });

  it('disabled: handles aria-disabled (still focusable), no lift; set while lifted → cancelled back', async () => {
    const s = mount(list(3)).querySelector('td-sortable');
    handle(s, 0).focus();
    await sendKeys({ press: 'Enter' });
    await sendKeys({ press: 'ArrowDown' });
    s.disabled = true;
    expect(ids(s)).to.deep.equal(['s1', 's2', 's3']);
    expect(handle(s, 0).getAttribute('aria-disabled')).to.equal('true');
    handle(s, 0).focus();
    expect(document.activeElement === handle(s, 0)).to.equal(true);
    await sendKeys({ press: 'Enter' });
    expect(!!s.querySelector('[data-td-sort-state]')).to.equal(false);
    s.disabled = false;
    expect(handle(s, 0).hasAttribute('aria-disabled')).to.equal(false);
  });

  it('nested sortable: the inner handles never drive the outer host', async () => {
    const s = mount(`<td-sortable class="outer"><div data-td-sort-item data-id="o1">O1${list(2)}</div><div data-td-sort-item data-id="o2">O2</div></td-sortable>`).querySelector('.outer');
    const inner = s.querySelector('td-sortable td-sortable');
    const outerRec = record(s);
    handle(inner, 0).focus();
    await sendKeys({ press: 'Enter' });
    await sendKeys({ press: 'ArrowDown' });
    await sendKeys({ press: 'Enter' });
    expect(ids(inner)).to.deep.equal(['s2', 's1']);
    expect(ids(s)).to.deep.equal(['o1', 'o2']);
    expect(outerRec.filter((r) => r.id.startsWith('o')).length).to.equal(0);
  });

  it('XSS: data-td-sort-label / label with markup stay text (aria-label, live region)', async () => {
    const bad = '<img src=x onerror="window.__pwned=1">';
    const w = mount('<td-sortable></td-sortable>');
    const s = w.querySelector('td-sortable');
    s.setAttribute('label', bad);
    const it = document.createElement('div');
    it.setAttribute('data-td-sort-item', '');
    it.setAttribute('data-id', 'a');
    it.setAttribute('data-td-sort-label', bad);
    s.appendChild(it);
    await wait();
    expect(s.getAttribute('aria-label')).to.equal(bad);
    expect(handle(s, 0).getAttribute('aria-label')).to.equal(`Sắp xếp ${bad}`);
    handle(s, 0).click();
    expect(live(s).textContent).to.include(bad);
    expect(!!s.querySelector('img')).to.equal(false);
    handle(s, 0).click();
    expect(window.__pwned).to.equal(undefined);
  });
});

describe('td-sortable — app handle before define (iframe, module not loaded yet)', () => {
  it('button[data-td-sort-handle] is visibility:hidden and not focusable; after define it shows, boxes unchanged (≤ 1px)', async () => {
    const iframe = document.createElement('iframe');
    iframe.srcdoc = '<!doctype html><html><head><link rel="stylesheet" href="/td.css"></head><body>'
      + '<td-sortable><div data-td-sort-item data-id="a"><button type="button" data-td-sort-handle class="h" aria-label="Kéo A">≡</button> A</div>'
      + '<div data-td-sort-item data-id="b"><button type="button" data-td-sort-handle class="h" aria-label="Kéo B">≡</button> B</div></td-sortable></body></html>';
    for (const [k, v] of [['width', '400px'], ['height', '200px']]) iframe.style.setProperty(k, v);
    document.body.appendChild(iframe);
    extra.push(() => iframe.remove());
    await new Promise((r) => { iframe.onload = r; });
    const doc = iframe.contentDocument;
    await new Promise((r) => { const l = doc.querySelector('link'); if (l.sheet) r(); else l.onload = r; });
    const h = doc.querySelector('.h');
    const it = doc.querySelector('[data-td-sort-item]');
    expect(iframe.contentWindow.getComputedStyle(h).visibility).to.equal('hidden');
    h.focus();
    expect(doc.activeElement === h).to.equal(false);
    const before = [it.getBoundingClientRect(), h.getBoundingClientRect()];
    const script = doc.createElement('script');
    script.type = 'module';
    script.textContent = "import '/src/display/td-sortable.js';";
    doc.head.appendChild(script);
    for (let i = 0; i < 100 && !iframe.contentWindow.customElements.get('td-sortable'); i += 1) await wait(20);
    await wait(20);
    expect(iframe.contentWindow.getComputedStyle(h).visibility).to.equal('visible');
    expect(h.classList.contains('td-sortable__handle')).to.equal(true);
    const after = [it.getBoundingClientRect(), h.getBoundingClientRect()];
    for (let k = 0; k < 2; k += 1) {
      for (const p of ['x', 'y', 'width', 'height']) expect(Math.abs(after[k][p] - before[k][p]), `${k}.${p}`).to.be.at.most(1);
    }
  });
});

describe('td-sortable — reduced motion', () => {
  it('shifted items transition 150ms by default, 0 under prefers-reduced-motion: reduce', async () => {
    const s = mount(list(3)).querySelector('td-sortable');
    await touchDrag(s, 0, 2, { end: null });
    expect(getComputedStyle(itemsOf(s)[1]).transitionDuration).to.equal('0.15s');
    pe('pointercancel', handle(s, 0), 0, 0);
    await emulateMedia({ reducedMotion: 'reduce' });
    extra.push(() => { emulateMedia({ reducedMotion: 'no-preference' }); });
    await touchDrag(s, 0, 2, { end: null });
    expect(getComputedStyle(itemsOf(s)[1]).transitionDuration).to.equal('0s');
    pe('pointercancel', handle(s, 0), 0, 0);
    await emulateMedia({ reducedMotion: 'no-preference' });
  });
});

describe('td-sortable — gallery recipe (td-media-grid > td-sortable role="none")', () => {
  const gallery = () => `<td-media-grid label="Ảnh"><td-sortable role="none" label="Thứ tự ảnh">${Array.from({ length: 6 }, (_, i) => `<div data-td-media-item data-td-sort-item data-id="p${i + 1}"><button type="button" data-td-media-open aria-label="Ảnh ${i + 1}"><span class="ph">${i + 1}</span></button></div>`).join('')}</td-sortable></td-media-grid>`;
  function setup() {
    const w = mount(gallery(), { width: 360 });
    const mg = w.querySelector('td-media-grid');
    mg.style.setProperty('--td-media-grid-cols', 'repeat(3, 1fr)');
    for (const ph of w.querySelectorAll('.ph')) { ph.style.setProperty('display', 'block'); ph.style.setProperty('height', '60px'); }
    return { mg, s: w.querySelector('td-sortable') };
  }

  it('it is a real grid with the shared tokens: ≥ 2 distinct lefts, display grid, full width; columns follow --td-media-grid-cols', async () => {
    const { mg, s } = setup();
    await frame();
    expect(getComputedStyle(s).display).to.equal('grid');
    expect(Math.abs(s.getBoundingClientRect().width - mg.getBoundingClientRect().width)).to.be.at.most(1);
    const lefts = new Set(itemsOf(s).map((i) => Math.round(i.getBoundingClientRect().left)));
    expect(lefts.size).to.equal(3);
    const tops = new Set(itemsOf(s).map((i) => Math.round(i.getBoundingClientRect().top)));
    expect(tops.size).to.equal(2);
    mg.style.setProperty('--td-media-grid-cols', 'repeat(2, 1fr)');
    await frame();
    expect(new Set(itemsOf(s).map((i) => Math.round(i.getBoundingClientRect().left))).size).to.equal(2);
  });

  it('lifted ↑ / ↓ = ±3; a drag to another column drops on the right index; Space on the opener selects, on the handle lifts; selectedIds follow the new order', async () => {
    const { mg, s } = setup();
    await frame();
    const rec = record(s);
    handle(s, 0).focus();
    await sendKeys({ press: 'Space' });
    expect(itemsOf(s)[0].getAttribute('data-td-sort-state')).to.equal('lifted');
    expect(mg.selectedIds).to.deep.equal([]);
    await sendKeys({ press: 'ArrowDown' });
    expect(ids(s)).to.deep.equal(['p2', 'p3', 'p4', 'p1', 'p5', 'p6']);
    await sendKeys({ press: 'Space' });
    expect(rec.length).to.equal(1);
    await mouseDrag(center(handle(s, 5)), center(itemsOf(s)[1]));
    expect(ids(s)).to.deep.equal(['p2', 'p6', 'p3', 'p4', 'p1', 'p5']);
    // Space on the opener = media-grid selection (sortable untouched)
    itemsOf(s)[4].querySelector('[data-td-media-open]').focus();
    await sendKeys({ press: 'Space' });
    itemsOf(s)[1].querySelector('[data-td-media-open]').focus();
    await sendKeys({ press: 'Space' });
    expect(!!s.querySelector('[data-td-sort-state]')).to.equal(false);
    expect(mg.selectedIds).to.deep.equal(['p6', 'p1']);
    s.setOrder(['p1', 'p2', 'p3', 'p4', 'p5', 'p6']);
    expect(mg.selectedIds).to.deep.equal(['p1', 'p6']);
  });
});

describe('td-sortable — review round 1 (impl + security)', () => {
  it('IMPL-1: the app mutating direct children in a capture pointerup listener right before the drop → no order-change, model = DOM', async () => {
    const s = mount(list(4)).querySelector('td-sortable');
    const rec = record(s);
    await touchDrag(s, 0, 2, { end: null });
    const mutate = () => { s.insertAdjacentHTML('afterbegin', item(9)); };
    window.addEventListener('pointerup', mutate, { capture: true, once: true });
    extra.push(() => window.removeEventListener('pointerup', mutate, true));
    pe('pointerup', handle(s, 1), ...center(itemsOf(s)[3]));
    expect(rec.length).to.equal(0);
    expect(ids(s)).to.deep.equal(['s9', 's1', 's2', 's3', 's4'], 'nothing moved');
    await wait();
    expect(s.order).to.deep.equal(['s9', 's1', 's2', 's3', 's4']);
    noTraces(s);
    // the model follows the DOM: the next keyboard move works on the new order
    handle(s, 0).focus();
    await sendKeys({ press: 'Enter' });
    await sendKeys({ press: 'ArrowDown' });
    await sendKeys({ press: 'Enter' });
    expect(rec.length).to.equal(1);
    expect(rec[0].previous).to.deep.equal(['s9', 's1', 's2', 's3', 's4']);
  });

  it('IMPL-1: keyboard-drop variant — a capture click listener removing an item right before Space drops → no order-change', async () => {
    const s = mount(list(4)).querySelector('td-sortable');
    const rec = record(s);
    handle(s, 0).focus();
    await sendKeys({ press: 'Enter' });
    await sendKeys({ press: 'ArrowDown' });
    const mutate = () => { itemsOf(s)[3].remove(); };
    window.addEventListener('click', mutate, { capture: true, once: true });
    extra.push(() => window.removeEventListener('click', mutate, true));
    await sendKeys({ press: 'Space' });
    expect(rec.length).to.equal(0);
    expect(ids(s)).to.deep.equal(['s2', 's1', 's3']);
    await wait();
    expect(s.order).to.deep.equal(['s2', 's1', 's3']);
    noTraces(s);
  });

  it('IMPL-2: lifted with the keyboard, focus moving to ANOTHER handle (Tab) drops', async () => {
    const s = mount(list(3)).querySelector('td-sortable');
    const rec = record(s);
    handle(s, 0).focus();
    await sendKeys({ press: 'Enter' });
    await sendKeys({ press: 'ArrowDown' });
    handle(s, 2).focus();
    expect(!!s.querySelector('[data-td-sort-state]')).to.equal(false, 'dropped');
    expect(rec.length).to.equal(1);
    expect(rec[0]).to.include({ id: 's1', from: 0, to: 1, source: 'keyboard' });
    noTraces(s);
  });

  it('IMPL-3: pagehide / page hidden while a press is still pending (before the 4px threshold) → no drag afterwards', async () => {
    const s = mount(list(3)).querySelector('td-sortable');
    for (const fire of [
      () => window.dispatchEvent(new Event('pagehide')),
      () => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
        document.dispatchEvent(new Event('visibilitychange'));
        delete document.visibilityState;
      },
    ]) {
      const h = handle(s, 0);
      const [x, y] = center(h);
      pe('pointerdown', h, x, y);
      fire();
      for (let i = 1; i <= 4; i += 1) { pe('pointermove', h, x, y + i * 20); await frame(); }
      expect(s.hasAttribute('data-td-dragging')).to.equal(false);
      pe('pointerup', h, x, y + 80);
      noTraces(s);
    }
  });

  it('IMPL-4: an invalid setOrder() during a gesture still cancels it first', async () => {
    captureWarn();
    const s = mount(list(3)).querySelector('td-sortable');
    handle(s, 0).focus();
    await sendKeys({ press: 'Enter' });
    await sendKeys({ press: 'ArrowDown' });
    expect(s.setOrder(['nope'])).to.equal(false);
    expect(!!s.querySelector('[data-td-sort-state]')).to.equal(false);
    expect(ids(s)).to.deep.equal(['s1', 's2', 's3'], 'the lift went back');
    expect(hasActiveAbove(-1)).to.equal(false);
  });

  it('SEC-3: warnings never carry the host element (fixed text + counts only)', () => {
    const args = [];
    const orig = console.warn;
    console.warn = (...a) => args.push(...a);
    extra.push(() => { console.warn = orig; });
    const s = mount('<td-sortable><div data-td-sort-item data-id="a">A</div><div data-td-sort-item data-id="a">B</div></td-sortable>').querySelector('td-sortable');
    s.setOrder(['x']);
    expect(args.length).to.be.greaterThan(1);
    expect(args.every((a) => !(a instanceof Node))).to.equal(true);
  });
});

describe('td-sortable — impl review round 2 (click suppression scope)', () => {
  const at0 = (el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 0 }));

  it('ISSUE-5 (a): keyboard lift → external cancel → a fresh screen-reader click (detail 0, no pointerdown / keydown) lifts', async () => {
    const s = mount(list(3)).querySelector('td-sortable');
    handle(s, 0).focus();
    await sendKeys({ press: 'Enter' });
    s.insertAdjacentHTML('beforeend', item(7));
    await wait();
    expect(!!s.querySelector('[data-td-sort-state]')).to.equal(false, 'cancelled external');
    at0(handle(s, 1));
    expect(itemsOf(s)[1].getAttribute('data-td-sort-state')).to.equal('lifted');
    at0(handle(s, 1));
    // Escape cancel (lifted) → an immediate browse-mode click lifts too
    at0(handle(s, 2));
    await sendKeys({ press: 'Escape' });
    expect(!!s.querySelector('[data-td-sort-state]')).to.equal(false);
    at0(handle(s, 2));
    expect(itemsOf(s)[2].getAttribute('data-td-sort-state')).to.equal('lifted');
    at0(handle(s, 2));
    noTraces(s);
  });

  it('ISSUE-5 (c): a cancelled pointer drag still swallows its compatibility click', async () => {
    const s = mount(list(3)).querySelector('td-sortable');
    await touchDrag(s, 0, 2, { end: null });
    expect(s.hasAttribute('data-td-dragging')).to.equal(true);
    pe('pointercancel', handle(s, 0), 0, 0);
    at0(handle(s, 0)); // the click the browser may still send for that press
    expect(!!s.querySelector('[data-td-sort-state]')).to.equal(false);
    // one-shot: the next activation is a fresh one and lifts
    at0(handle(s, 0));
    expect(itemsOf(s)[0].getAttribute('data-td-sort-state')).to.equal('lifted');
    at0(handle(s, 0));
    noTraces(s);
  });
});

