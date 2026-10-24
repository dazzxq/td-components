import { expect } from '@esm-bundle/chai';
import { sendKeys, sendMouse, resetMouse } from '@web/test-runner-commands';
import './td-media-gallery.js';

// v0.81.0 (plan docs/internal/plans/v0.81.0-media-gallery-dcms2-grid.md) — the dcms2-style grid of <td-media-gallery>:
// the Add cell is the LAST cell of the list, the red round X, the tools row (Mô tả / Cắt / Đặt làm ảnh bìa), the usage
// fields collapsed until the tile is open (data-td-open), a whole-tile MOUSE drag (surface of the shared controller)
// whose ending click never toggles the tile, fine-pointer tools shown on hover / focus. Chromium, Firefox AND WebKit.
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

/** A gallery of ids m1…mN in a box 600px wide (4 columns). */
function mount(n, { attrs = '' } = {}) {
  const wrap = document.createElement('div');
  for (const [k, v] of [['position', 'absolute'], ['top', '0px'], ['left', '0px'], ['width', '600px'], ['background', '#fff'], ['z-index', '1']]) {
    wrap.style.setProperty(k, v);
  }
  const items = Array.from({ length: n }, (_, i) => ({ id: `m${i + 1}`, src: `/test/fixtures/${(i % 4) + 1}.svg`, name: `Ảnh ${i + 1}` }));
  wrap.innerHTML = `<form><td-media-gallery name="g" label="Gallery"${attrs}></td-media-gallery></form>`;
  const el = wrap.querySelector('td-media-gallery');
  el.setAttribute('items', JSON.stringify(items));
  document.body.appendChild(wrap);
  extra.push(() => wrap.remove());
  const rec = [];
  for (const t of ['input', 'change']) el.addEventListener(t, (e) => rec.push(`${t}:${e.detail.reason}`));
  return { el, form: wrap.querySelector('form'), rec };
}
const ulOf = (el) => el.querySelector('.td-media-gallery__list');
const lis = (el) => [...el.querySelectorAll('.td-media-gallery__list > li.td-media-gallery__item')];
const handle = (li) => li.querySelector('.td-media-gallery__handle');
const media = (li) => li.querySelector('.td-media-gallery__media');
const edit = (li) => li.querySelector('.td-media-gallery__edit');
const remove = (li) => li.querySelector('.td-media-gallery__remove');
const coverBtn = (li) => li.querySelector('.td-media-gallery__cover-btn');
const center = (n) => { const r = n.getBoundingClientRect(); return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)]; };
/** the Add cell is ul.lastElementChild, holding the Add button */
const addLast = (el) => {
  const cell = ulOf(el).lastElementChild;
  return cell.className === 'td-media-gallery__add-cell' && cell.firstElementChild.className === 'td-media-gallery__add'
    && cell.querySelectorAll('.td-media-gallery__add-cell, .td-media-gallery__add').length === 1;
};
const opened = (el) => lis(el).map((li) => li.getAttribute('data-td-open'));
const expanded = (el) => lis(el).map((li) => edit(li).getAttribute('aria-expanded'));
/** a real mouse press + release at `p` (no movement) */
async function mouseClick(p) {
  await sendMouse({ type: 'move', position: p });
  await sendMouse({ type: 'down' });
  await sendMouse({ type: 'up' });
  await wait();
}
async function until(fn, ms = 1000) {
  const t0 = performance.now();
  while (!fn() && performance.now() - t0 < ms) await wait(20);
  return fn();
}
const vis = (n) => getComputedStyle(n).opacity;

describe('td-media-gallery v0.81 — the Add cell is the last cell of the list', () => {
  it('after setting items, after Gỡ, after a keyboard reorder, after an outside DOM change', async () => {
    const { el } = mount(3);
    expect(addLast(el), 'items attribute').to.equal(true);
    el.value = ['m3', 'm1'];
    expect(lis(el).length).to.equal(2);
    expect(addLast(el), 'value =').to.equal(true);
    el.setSelection([{ assetId: 'a' }, { assetId: 'b' }, { assetId: 'c' }]);
    expect(lis(el).length).to.equal(3);
    expect(addLast(el), 'setSelection').to.equal(true);

    remove(lis(el)[1]).click();
    expect(lis(el).length).to.equal(2);
    expect(addLast(el), 'Gỡ').to.equal(true);

    handle(lis(el)[0]).focus();
    await sendKeys({ press: 'Enter' });
    await sendKeys({ press: 'ArrowRight' });
    await sendKeys({ press: 'Space' });
    await wait();
    expect(el.value).to.deep.equal(['c', 'a']);
    expect(addLast(el), 'keyboard reorder').to.equal(true);

    ulOf(el).prepend(document.createElement('li'));
    ulOf(el).append(document.createElement('li'));
    await wait();
    expect(lis(el).length).to.equal(2);
    expect(ulOf(el).children.length).to.equal(3, 'the intruders are gone');
    expect(addLast(el), 'outside DOM change').to.equal(true);
  });

  it('empty list: the Add cell is the only child; the cell and its button hide together at max and come back', () => {
    const { el } = mount(0);
    expect(ulOf(el).children.length).to.equal(1);
    expect(addLast(el)).to.equal(true);
    expect(ulOf(el).lastElementChild.hidden).to.equal(false);
    const b = mount(3, { attrs: ' max="3"' });
    const cell = ulOf(b.el).lastElementChild;
    expect([cell.hidden, cell.firstElementChild.hidden]).to.deep.equal([true, true]);
    expect(getComputedStyle(cell).display).to.equal('none');
    remove(lis(b.el)[0]).click();
    expect([cell.hidden, cell.firstElementChild.hidden]).to.deep.equal([false, false]);
    expect(addLast(b.el)).to.equal(true);
    expect(cell.firstElementChild.querySelector(':scope > svg.td-media-gallery__sizer')).to.not.equal(null);
  });

  it('the Add cell is a grid cell after the last tile (same row when there is room)', () => {
    const { el } = mount(2);
    const t = lis(el)[1].getBoundingClientRect();
    const a = ulOf(el).lastElementChild.getBoundingClientRect();
    expect(Math.abs(a.top - t.top)).to.be.lessThan(2);
    expect(a.left).to.be.greaterThan(t.right - 1);
  });
});

describe('td-media-gallery v0.81 — the red X', () => {
  it('Gỡ removes the tile (input + change, reason remove) and is a plain button without the __btn chip class', () => {
    const { el, rec } = mount(3);
    const x = remove(lis(el)[1]);
    expect(x.classList.contains('td-media-gallery__btn')).to.equal(false);
    expect(x.parentElement.className).to.equal('td-media-gallery__media');
    x.click();
    expect(el.value).to.deep.equal(['m1', 'm3']);
    expect(rec).to.deep.equal(['input:remove', 'change:remove']);
  });
});

describe('td-media-gallery v0.81 — collapsed usage fields (Mô tả)', () => {
  const U = ' usage caption';

  it('closed by default: the fields are display:none; Mô tả toggles data-td-open + aria-expanded, one tile at a time', () => {
    const { el } = mount(3, { attrs: U });
    const alt = (i) => lis(el)[i].querySelector('.td-media-gallery__alt');
    expect(opened(el)).to.deep.equal([null, null, null]);
    expect(expanded(el)).to.deep.equal(['false', 'false', 'false']);
    expect(getComputedStyle(alt(0)).display === 'none' || alt(0).getBoundingClientRect().height === 0 || alt(0).offsetParent === null).to.equal(true);
    edit(lis(el)[0]).click();
    expect(opened(el)).to.deep.equal(['', null, null]);
    expect(expanded(el)).to.deep.equal(['true', 'false', 'false']);
    expect(alt(0).offsetParent).to.not.equal(null);
    edit(lis(el)[1]).click();
    expect(opened(el)).to.deep.equal([null, '', null], 'only one user-opened tile');
    expect(expanded(el)).to.deep.equal(['false', 'true', 'false']);
    edit(lis(el)[1]).click();
    expect(opened(el)).to.deep.equal([null, null, null]);
    expect(expanded(el)).to.deep.equal(['false', 'false', 'false']);
    expect(alt(1).offsetParent).to.equal(null);
  });

  it('no usage → no Mô tả button and a click on the picture does nothing', async () => {
    const { el } = mount(2);
    expect(el.querySelectorAll('.td-media-gallery__edit').length).to.equal(0);
    await mouseClick(center(media(lis(el)[0])));
    expect(el.querySelector('[data-td-open]')).to.equal(null);
  });

  it('a real click on the picture toggles the tile (no drag)', async () => {
    const { el } = mount(3, { attrs: U });
    await mouseClick(center(media(lis(el)[0])));
    expect(opened(el)).to.deep.equal(['', null, null]);
    expect(expanded(el)).to.deep.equal(['true', 'false', 'false']);
    await mouseClick(center(media(lis(el)[2])));
    expect(opened(el)).to.deep.equal([null, null, '']);
    await mouseClick(center(media(lis(el)[2])));
    expect(opened(el)).to.deep.equal([null, null, null]);
  });

  it('an over-long alt keeps its tile open ("error"): Mô tả and the picture cannot close it; fixing it releases it', async () => {
    const { el } = mount(2, { attrs: ' usage alt-maxlength="5"' });
    el.setSelection([{ assetId: 'a', usage: { altText: 'abcdefgh' } }, { assetId: 'b', usage: { altText: 'ok' } }]);
    expect(opened(el)).to.deep.equal(['error', null]);
    expect(expanded(el)).to.deep.equal(['true', 'false']);
    edit(lis(el)[0]).click();
    expect(opened(el)[0]).to.equal('error');
    await mouseClick(center(media(lis(el)[0])));
    expect(opened(el)[0]).to.equal('error');
    // typing in a user-opened tile past the limit flips it to "error"
    edit(lis(el)[1]).click();
    expect(opened(el)).to.deep.equal(['error', '']);
    const alt1 = lis(el)[1].querySelector('.td-media-gallery__alt');
    alt1.value = 'way too long';
    alt1.dispatchEvent(new Event('input', { bubbles: true }));
    expect(opened(el)).to.deep.equal(['error', 'error']);
    expect(lis(el)[1].querySelector('.td-media-gallery__error').hidden).to.equal(false);
    // fixed → no longer forced
    const alt0 = lis(el)[0].querySelector('.td-media-gallery__alt');
    alt0.value = 'abc';
    alt0.dispatchEvent(new Event('input', { bubbles: true }));
    expect(opened(el)[0]).to.equal(null);
    expect(expanded(el)[0]).to.equal('false');
  });

  it('a runtime limit change (number → number) re-syncs the open state; a removed open tile leaves no stale state', () => {
    const { el } = mount(2, { attrs: ' usage alt-maxlength="20"' });
    el.setSelection([{ assetId: 'a', usage: { altText: 'abcdefgh' } }, { assetId: 'b', usage: { altText: 'ok' } }]);
    expect(opened(el)).to.deep.equal([null, null]);
    el.setAttribute('alt-maxlength', '5');
    expect(opened(el)).to.deep.equal(['error', null]);
    el.setAttribute('alt-maxlength', '30');
    expect(opened(el)).to.deep.equal([null, null]);
    edit(lis(el)[1]).click();
    expect(opened(el)).to.deep.equal([null, '']);
    remove(lis(el)[1]).click();
    el.setSelection([{ assetId: 'a', usage: { altText: 'x' } }, { assetId: 'b', usage: { altText: 'y' } }]);
    expect(opened(el)).to.deep.equal([null, null]);
  });

  it('an open tile removed while usage is off does not reopen when re-added and usage comes back', async () => {
    const { el } = mount(2, { attrs: ' usage' });
    edit(lis(el)[1]).click();
    expect(opened(el)).to.deep.equal([null, '']);
    el.removeAttribute('usage');
    await frame();
    remove(lis(el)[1]).click();
    expect(lis(el).length).to.equal(1);
    el.setSelection([{ assetId: 'm1' }, { assetId: 'm2' }]);
    expect(await until(() => lis(el).length === 2)).to.equal(true);
    el.setAttribute('usage', '');
    expect(await until(() => lis(el).length === 2 && !!edit(lis(el)[1]))).to.equal(true);
    expect(opened(el)).to.deep.equal([null, null]);
  });

  it('a text field keeps a typed value while the tile is closed and re-opened', () => {
    const { el } = mount(2, { attrs: U });
    edit(lis(el)[0]).click();
    const alt = lis(el)[0].querySelector('.td-media-gallery__alt');
    alt.value = 'Mô tả mới';
    alt.dispatchEvent(new Event('input', { bubbles: true }));
    edit(lis(el)[0]).click();
    edit(lis(el)[0]).click();
    expect(alt.value).to.equal('Mô tả mới');
    expect(el.selection[0].usage.altText).to.equal('Mô tả mới');
  });
});

describe('td-media-gallery v0.81 — whole-tile mouse drag', () => {
  it('a real mouse drag on the picture reorders; the click that ends it does NOT toggle the tile; the next plain click does', async () => {
    const { el, rec } = mount(3, { attrs: ' usage' });
    const from = center(media(lis(el)[0]));
    const to = center(lis(el)[2]);
    await sendMouse({ type: 'move', position: from });
    await sendMouse({ type: 'down' });
    for (let i = 1; i <= 8; i += 1) {
      await sendMouse({ type: 'move', position: [Math.round(from[0] + ((to[0] - from[0]) * i) / 8), Math.round(from[1] + ((to[1] - from[1]) * i) / 8)] });
      await frame();
    }
    await sendMouse({ type: 'up' });
    await frame();
    await wait();
    expect(el.value).to.deep.equal(['m2', 'm3', 'm1']);
    expect(rec).to.deep.equal(['input:reorder', 'change:reorder']);
    expect(el.querySelector('[data-td-open]')).to.equal(null);
    expect(addLast(el)).to.equal(true);
    await mouseClick(center(media(lis(el)[0])));
    expect(opened(el)).to.deep.equal(['', null, null]);
  });

  it('a press on Gỡ or Mô tả never starts a drag (they act on click)', async () => {
    const { el, rec } = mount(3, { attrs: ' usage' });
    const ul = ulOf(el);
    const m = media(lis(el)[0]);
    const pe = (target, type, x, y) => target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, pointerId: 5, pointerType: 'mouse', isPrimary: true, button: type === 'pointermove' ? -1 : 0, buttons: type === 'pointerup' ? 0 : 1 }));
    for (const btn of [remove(lis(el)[0]), edit(lis(el)[0])]) {
      const [x, y] = center(btn);
      pe(btn, 'pointerdown', x, y);
      for (let i = 1; i <= 5; i += 1) { pe(document, 'pointermove', x + i * 30, y); await frame(); }
      expect(ul.hasAttribute('data-td-dragging'), btn.className).to.equal(false);
      pe(document, 'pointerup', x + 150, y);
      await wait();
    }
    expect(m.isConnected).to.equal(true);
    expect(el.value).to.deep.equal(['m1', 'm2', 'm3']);
    expect(rec).to.deep.equal([]);
  });

  it('a touch / pen press on the picture does not drag; tap-to-move on the handles still works', async () => {
    const { el, rec } = mount(3);
    const ul = ulOf(el);
    const m = media(lis(el)[0]);
    const [x, y] = center(m);
    const [x2] = center(lis(el)[2]);
    for (const pointerType of ['touch', 'pen']) {
      const pe = (type, xx) => m.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, clientX: xx, clientY: y, pointerId: 8, pointerType, isPrimary: true, button: type === 'pointermove' ? -1 : 0, buttons: type === 'pointerup' ? 0 : 1 }));
      pe('pointerdown', x);
      for (let i = 1; i <= 5; i += 1) { pe('pointermove', x + ((x2 - x) * i) / 5); await frame(); }
      expect(ul.hasAttribute('data-td-dragging'), pointerType).to.equal(false);
      pe('pointerup', x2);
      await wait();
    }
    expect(el.value).to.deep.equal(['m1', 'm2', 'm3']);
    expect(rec).to.deep.equal([]);
    handle(lis(el)[0]).click();
    handle(lis(el)[2]).click();
    await wait();
    expect(el.value).to.deep.equal(['m2', 'm3', 'm1']);
  });
});

describe('td-media-gallery v0.81 — Đặt làm ảnh bìa (cover)', () => {
  it('only with `cover`: hidden on the first tile; shown (and following the order) on the others', () => {
    const none = mount(3);
    expect(none.el.querySelectorAll('.td-media-gallery__cover-btn').length).to.equal(0);
    const { el } = mount(3, { attrs: ' cover' });
    expect(lis(el).map((li) => coverBtn(li).hidden)).to.deep.equal([true, false, false]);
    expect(coverBtn(lis(el)[1]).getAttribute('aria-label')).to.equal('Đặt Ảnh 2 trên 3: Ảnh 2 làm ảnh bìa');
    el.value = ['m2', 'm1', 'm3'];
    expect(lis(el).map((li) => coverBtn(li).hidden)).to.deep.equal([true, false, false]);
  });

  it('click: the tile becomes the first one, input + change (reorder), announced, focus on its handle', () => {
    const { el, form, rec } = mount(3, { attrs: ' cover' });
    const li = lis(el)[2];
    coverBtn(li).click();
    expect(el.value).to.deep.equal(['m3', 'm1', 'm2']);
    expect(lis(el)[0] === li, 'same tile').to.equal(true);
    expect(rec).to.deep.equal(['input:reorder', 'change:reorder']);
    expect(el.querySelector('.td-media-gallery__status').textContent).to.equal('Đã đặt Ảnh 3 làm ảnh bìa.');
    expect(document.activeElement === handle(li)).to.equal(true);
    expect(coverBtn(li).hidden).to.equal(true);
    expect(lis(el).map((x) => coverBtn(x).hidden)).to.deep.equal([true, false, false]);
    expect(li.querySelectorAll('.td-media-gallery__cover').length).to.equal(1);
    expect([...new FormData(form)].map(([, v]) => String(v))).to.deep.equal(['m3', 'm1', 'm2']);
    expect(addLast(el)).to.equal(true);
  });
});

describe('td-media-gallery v0.81 — tools on a fine pointer', () => {
  it('opacity 0 at rest; 1 on hover and on focus (:focus-within); the controls stay focusable', async function () {
    if (!matchMedia('(hover: hover) and (pointer: fine)').matches) this.skip();
    const { el } = mount(3, { attrs: ' usage' });
    await sendMouse({ type: 'move', position: [900, 700] });
    await wait(300);
    const tools = (li) => [handle(li), remove(li), li.querySelector('.td-media-gallery__actions')];
    for (const li of lis(el)) for (const t of tools(li)) expect(vis(t), t.className).to.equal('0');
    await sendMouse({ type: 'move', position: center(media(lis(el)[1])) });
    expect(await until(() => tools(lis(el)[1]).every((t) => vis(t) === '1'))).to.equal(true, 'hover');
    expect(tools(lis(el)[0]).every((t) => vis(t) === '0')).to.equal(true, 'other tiles stay hidden');
    await sendMouse({ type: 'move', position: [900, 700] });
    expect(await until(() => tools(lis(el)[1]).every((t) => vis(t) === '0'))).to.equal(true, 'hover gone');
    handle(lis(el)[2]).focus();
    expect(await until(() => tools(lis(el)[2]).every((t) => vis(t) === '1'))).to.equal(true, 'focus-within');
    handle(lis(el)[2]).blur();
    expect(await until(() => tools(lis(el)[2]).every((t) => vis(t) === '0'))).to.equal(true, 'blur');
    edit(lis(el)[0]).click();
    expect(await until(() => tools(lis(el)[0]).every((t) => vis(t) === '1'))).to.equal(true, 'an open tile keeps its tools');
    await sendKeys({ press: 'Tab' }); // focus is somewhere; the invisible controls are still reachable
    expect(remove(lis(el)[1]).disabled).to.equal(false);
  });
  it('disabled: the dimmed tools still hide at rest (filter, not opacity)', async function () {
    if (!matchMedia('(hover: hover) and (pointer: fine)').matches) this.skip();
    const { el } = mount(2, { attrs: ' disabled' });
    await sendMouse({ type: 'move', position: [900, 700] });
    await wait(300);
    for (const li of lis(el)) for (const t of [handle(li), remove(li)]) expect(vis(t), t.className).to.equal('0');
  });
});
