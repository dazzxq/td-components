import { expect } from '@esm-bundle/chai';
import { sendKeys, sendMouse, resetMouse } from '@web/test-runner-commands';
import { TdRepeater } from './td-repeater.js';
import { hasActiveAbove } from '../utils/layers.js';

// v0.31.0 (plan docs/internal/plans/v0.31.0-sortable-masked.md M4) — <td-repeater sortable>: the shared SortableController
// on the repeater's own model, opt-in. Without `sortable` the v0.30 behaviour is unchanged (its engines test runs as is).
// Chromium, Firefox AND WebKit. DOM nodes are compared as booleans (`a === b`).
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

function mount(html) {
  const wrap = document.createElement('div');
  for (const [k, v] of [['position', 'absolute'], ['top', '0px'], ['left', '0px'], ['width', '500px'], ['background', '#fff'], ['z-index', '1']]) {
    wrap.style.setProperty(k, v);
  }
  wrap.innerHTML = html;
  document.body.appendChild(wrap);
  extra.push(() => wrap.remove());
  return wrap;
}
const rowsOf = (rep) => [...rep.children].filter((c) => c.hasAttribute('data-td-row'));
const vals = (rep) => rowsOf(rep).map((r) => r.querySelector('input').value);
const handle = (row) => row.querySelector('.td-sortable__handle');
const footer = (rep) => rep.querySelector(':scope > .td-repeater__footer');
const live = (rep) => footer(rep).querySelector('[role="status"]');
const center = (el) => { const r = el.getBoundingClientRect(); return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)]; };
function record(rep) {
  const rec = [];
  rep.addEventListener('rows-change', (e) => rec.push({ reason: e.detail.reason, source: e.detail.source, from: e.detail.from, to: e.detail.to }));
  return rec;
}
const TPL = '<template><div data-td-row><input data-name="items[{i}][name]" aria-label="Tên"></div></template>';
const row = (i, v) => `<div data-td-row><input name="items[${i}][name]" data-name="items[{i}][name]" value="${v}" aria-label="Tên"></div>`;
const rep4 = (attrs = ' sortable') => `<form><td-repeater label="Hộp gồm"${attrs}>${TPL}${row(0, 'A')}${row(1, 'B')}${row(2, 'C')}${row(3, 'D')}</td-repeater></form>`;
const rename = (rows) => rows.forEach((r, i) => r.querySelectorAll('[data-name]')
  .forEach((el) => el.setAttribute('name', el.dataset.name.replaceAll('{i}', String(i)))));
const formNames = (form) => [...new FormData(form).entries()].map(([k, v]) => `${k}=${v}`);

describe('td-repeater[sortable] — opt-in', () => {
  it('without sortable: no handle, no controller (v0.30 unchanged); an app button[data-td-sort-handle] is hidden', () => {
    const w = mount(`<td-repeater>${TPL}<div data-td-row><button type="button" data-td-sort-handle class="app">≡</button><input value="A" aria-label="Tên"></div>${row(1, 'B')}</td-repeater>`);
    const rep = w.querySelector('td-repeater');
    expect(rep.querySelectorAll('.td-sortable__handle').length).to.equal(0);
    expect(rep.querySelector('.app').hidden).to.equal(true);
    expect(getComputedStyle(rep.querySelector('.app')).display).to.equal('none');
    expect(!!footer(rep).querySelector('span[hidden]')).to.equal(false, 'no help text');
  });

  it('with sortable: the handle opens the action group (before ↑ ↓ ×), named after the row, described by the help text', () => {
    const rep = mount(rep4()).querySelector('td-repeater');
    const rows = rowsOf(rep);
    const box = rows[1].querySelector('.td-repeater__actions');
    const h = box.firstElementChild;
    expect(h.classList.contains('td-sortable__handle') && h.classList.contains('td-repeater__btn')).to.equal(true);
    expect(h.type).to.equal('button');
    expect(h.getAttribute('aria-label')).to.equal('Sắp xếp Dòng 2');
    expect(!!h.querySelector('svg[data-icon="grip"]')).to.equal(true);
    const help = rep.querySelector(`#${CSS.escape(h.getAttribute('aria-describedby'))}`);
    expect(!!help && help.hidden && footer(rep).contains(help)).to.equal(true);
    expect([...box.children].map((b) => b.getAttribute('data-td-repeater-action') || 'handle')).to.deep.equal(['handle', 'up', 'down', 'remove']);
  });

  it('an app button[data-td-sort-handle] in a row is upgraded in place (not duplicated)', () => {
    const rep = mount(`<td-repeater sortable>${TPL}<div data-td-row><button type="button" data-td-sort-handle class="app" hidden>≡</button><input value="A" aria-label="Tên"></div>${row(1, 'B')}</td-repeater>`).querySelector('td-repeater');
    const app = rep.querySelector('.app');
    expect(app.classList.contains('td-sortable__handle')).to.equal(true);
    expect(rowsOf(rep)[0].querySelectorAll('.td-sortable__handle').length).to.equal(1);
    expect(handle(rowsOf(rep)[0]) === app).to.equal(true);
  });

  it('turning sortable on / off at runtime adds / removes the handles cleanly', async () => {
    const rep = mount(rep4('')).querySelector('td-repeater');
    const rec = record(rep);
    rep.setAttribute('sortable', '');
    expect(rowsOf(rep).every((r) => !!handle(r))).to.equal(true);
    handle(rowsOf(rep)[0]).click();
    expect(rowsOf(rep)[0].getAttribute('data-td-sort-state')).to.equal('lifted');
    rep.removeAttribute('sortable');
    expect(rep.querySelectorAll('.td-sortable__handle').length).to.equal(0);
    expect(!!rep.querySelector('[data-td-sort-state]')).to.equal(false);
    expect(hasActiveAbove(-1)).to.equal(false);
    expect(rec.length).to.equal(0);
    rep.setAttribute('sortable', '');
    expect(rep.querySelectorAll('.td-sortable__handle').length).to.equal(4);
  });
});

describe('td-repeater[sortable] — keyboard / pointer go through _move (rows-change per step)', () => {
  it('lift + ↓ ↓: one rows-change move/user per step, focus kept, names follow; Escape: one more back; no order-change', async () => {
    const w = mount(rep4());
    const form = w.querySelector('form');
    const rep = w.querySelector('td-repeater');
    rep.addEventListener('rows-change', (e) => rename(e.detail.rows));
    const rec = record(rep);
    let orderChanges = 0;
    rep.addEventListener('order-change', () => { orderChanges += 1; });
    const h = handle(rowsOf(rep)[0]);
    h.focus();
    await sendKeys({ press: 'Enter' });
    expect(live(rep).textContent).to.equal('Đã nhấc Dòng 1, vị trí 1 trên 4.');
    await sendKeys({ press: 'ArrowDown' });
    await sendKeys({ press: 'ArrowDown' });
    await wait();
    expect(vals(rep)).to.deep.equal(['B', 'C', 'A', 'D']);
    expect(document.activeElement === h).to.equal(true);
    expect(rec).to.deep.equal([{ reason: 'move', source: 'user', from: 0, to: 1 }, { reason: 'move', source: 'user', from: 1, to: 2 }]);
    expect(formNames(form)).to.deep.equal(['items[0][name]=B', 'items[1][name]=C', 'items[2][name]=A', 'items[3][name]=D']);
    expect(live(rep).textContent).to.equal('Dòng 3: vị trí 3 trên 4.', 'the controller announces, the repeater stays quiet');
    await sendKeys({ press: 'Escape' });
    await wait();
    expect(vals(rep)).to.deep.equal(['A', 'B', 'C', 'D']);
    expect(rec.length).to.equal(3);
    expect(rec[2]).to.deep.equal({ reason: 'move', source: 'user', from: 2, to: 0 });
    expect(formNames(form)[0]).to.equal('items[0][name]=A');
    expect(rec.some((r) => r.reason === 'sync')).to.equal(false);
    expect(orderChanges).to.equal(0);
    // drop with Space: no extra rows-change
    await sendKeys({ press: 'Space' });
    await sendKeys({ press: 'ArrowDown' });
    await sendKeys({ press: 'Space' });
    await wait();
    expect(rec.length).to.equal(4);
    expect(vals(rep)).to.deep.equal(['B', 'A', 'C', 'D']);
    expect(hasActiveAbove(-1)).to.equal(false);
  });

  it('pointer drag: one rows-change; the placeholder never moves the footer nor triggers a sync; names follow', async () => {
    const w = mount(rep4());
    const form = w.querySelector('form');
    const rep = w.querySelector('td-repeater');
    rep.addEventListener('rows-change', (e) => rename(e.detail.rows));
    const rec = record(rep);
    const ft = footer(rep);
    const from = center(handle(rowsOf(rep)[0]));
    const to = [from[0], center(rowsOf(rep)[2])[1]];
    await sendMouse({ type: 'move', position: from });
    await sendMouse({ type: 'down' });
    for (let i = 1; i <= 6; i += 1) {
      await sendMouse({ type: 'move', position: [from[0], Math.round(from[1] + ((to[1] - from[1]) * i) / 6)] });
      await frame();
    }
    await wait();
    expect(rep.hasAttribute('data-td-dragging')).to.equal(true, 'gesture alive after the placeholder insertion');
    const ph = rep.querySelector(':scope > .td-sortable__placeholder');
    expect(!!ph && ph.nextElementSibling === ft).to.equal(true, 'placeholder before the footer');
    expect(rep.lastElementChild === ft).to.equal(true);
    expect(rec.length).to.equal(0);
    await sendMouse({ type: 'up' });
    await frame();
    await wait();
    expect(vals(rep)).to.deep.equal(['B', 'C', 'A', 'D']);
    expect(rec).to.deep.equal([{ reason: 'move', source: 'user', from: 0, to: 2 }]);
    expect(rep.lastElementChild === ft).to.equal(true);
    expect(!!rep.querySelector('.td-sortable__placeholder')).to.equal(false);
    expect(formNames(form)).to.deep.equal(['items[0][name]=B', 'items[1][name]=C', 'items[2][name]=A', 'items[3][name]=D']);
  });

  it('the app inserting a row while lifted → cancelled "external" + exactly one rows-change sync', async () => {
    const rep = mount(rep4()).querySelector('td-repeater');
    const rec = record(rep);
    handle(rowsOf(rep)[0]).focus();
    await sendKeys({ press: 'Enter' });
    await sendKeys({ press: 'ArrowDown' });
    rowsOf(rep)[0].insertAdjacentHTML('beforebegin', row(9, 'Z'));
    await wait();
    expect(!!rep.querySelector('[data-td-sort-state]')).to.equal(false);
    expect(vals(rep)).to.deep.equal(['Z', 'B', 'A', 'C', 'D'], 'not moved back');
    expect(rec.map((r) => r.reason)).to.deep.equal(['move', 'sync']);
    expect(hasActiveAbove(-1)).to.equal(false);
    expect(!!handle(rowsOf(rep)[0])).to.equal(true, 'the new row is upgraded with a handle');
  });

  it('↑ / ↓ buttons still work (and announce "x trên y")', () => {
    const rep = mount(rep4()).querySelector('td-repeater');
    rowsOf(rep)[0].querySelector('.td-repeater__btn--down').click();
    expect(vals(rep)).to.deep.equal(['B', 'A', 'C', 'D']);
    expect(live(rep).textContent).to.equal('Đã chuyển tới vị trí 2 trên 4.');
    expect(TdRepeater.labels.moved).to.equal('Đã chuyển tới vị trí {n} trên {count}.');
  });

  it('tap-to-move on rows', async () => {
    const rep = mount(rep4()).querySelector('td-repeater');
    const rec = record(rep);
    handle(rowsOf(rep)[3]).click();
    handle(rowsOf(rep)[0]).click();
    expect(vals(rep)).to.deep.equal(['D', 'A', 'B', 'C']);
    expect(rec).to.deep.equal([{ reason: 'move', source: 'user', from: 3, to: 0 }]);
  });
});

describe('td-repeater[sortable] — app handle before define (iframe)', () => {
  it('hidden (visibility) before define, same handle box after; upgraded when sortable, hidden when not', async () => {
    const iframe = document.createElement('iframe');
    const r = (cls) => `<div data-td-row><button type="button" data-td-sort-handle class="${cls}" aria-label="Kéo">≡</button><input value="A" aria-label="Tên"></div>`;
    iframe.srcdoc = '<!doctype html><html><head><link rel="stylesheet" href="/td.css"></head><body>'
      + `<td-repeater sortable class="on"><template>${r('t')}</template>${r('h1')}${r('h2')}</td-repeater>`
      + `<td-repeater class="off"><template>${r('t')}</template>${r('h3')}</td-repeater></body></html>`;
    for (const [k, v] of [['width', '500px'], ['height', '300px']]) iframe.style.setProperty(k, v);
    document.body.appendChild(iframe);
    extra.push(() => iframe.remove());
    await new Promise((res) => { iframe.onload = res; });
    const doc = iframe.contentDocument;
    await new Promise((res) => { const l = doc.querySelector('link'); if (l.sheet) res(); else l.onload = res; });
    const win = iframe.contentWindow;
    const h1 = doc.querySelector('.h1');
    expect(win.getComputedStyle(h1).visibility).to.equal('hidden');
    h1.focus();
    expect(doc.activeElement === h1).to.equal(false);
    // the row itself is restyled by the v0.30 upgrade (row class, actions); the handle box must not move / resize
    const box = h1.getBoundingClientRect();
    const script = doc.createElement('script');
    script.type = 'module';
    script.textContent = "import '/src/form/td-repeater.js';";
    doc.head.appendChild(script);
    for (let i = 0; i < 100 && !win.customElements.get('td-repeater'); i += 1) await wait(20);
    await wait(20);
    expect(win.getComputedStyle(h1).visibility).to.equal('visible');
    expect(h1.classList.contains('td-sortable__handle')).to.equal(true);
    const after = h1.getBoundingClientRect();
    for (const p of ['width', 'height']) expect(Math.abs(after[p] - box[p]), p).to.be.at.most(1);
    expect(doc.querySelector('.h3').hidden).to.equal(true);
  });
});

describe('td-repeater[sortable] — review round 1', () => {
  it('IMPL-1: a row inserted in a capture pointerup listener right before the drop → no move, one rows-change sync, model = DOM', async () => {
    const rep = mount(rep4()).querySelector('td-repeater');
    const rec = record(rep);
    const h = handle(rowsOf(rep)[0]);
    const [x, y] = center(h);
    const [, y2] = center(rowsOf(rep)[2]);
    const pe = (type, yy) => h.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: yy, pointerId: 4, pointerType: 'touch', isPrimary: true, button: type === 'pointermove' ? -1 : 0, buttons: type === 'pointerup' ? 0 : 1 }));
    pe('pointerdown', y);
    for (let i = 1; i <= 5; i += 1) { pe('pointermove', y + ((y2 - y) * i) / 5); await frame(); }
    expect(rep.hasAttribute('data-td-dragging')).to.equal(true);
    const mutate = () => { rowsOf(rep)[0].insertAdjacentHTML('beforebegin', row(9, 'Z')); };
    window.addEventListener('pointerup', mutate, { capture: true, once: true });
    extra.push(() => window.removeEventListener('pointerup', mutate, true));
    pe('pointerup', y2);
    await wait();
    expect(vals(rep)).to.deep.equal(['Z', 'A', 'B', 'C', 'D']);
    expect(rec.map((r) => r.reason)).to.deep.equal(['sync']);
    expect(rep.hasAttribute('data-td-dragging')).to.equal(false);
    expect(!!rep.querySelector('.td-sortable__placeholder')).to.equal(false);
  });
});

