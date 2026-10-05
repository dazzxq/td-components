import { expect } from '@esm-bundle/chai';
import { sendKeys, sendMouse, resetMouse } from '@web/test-runner-commands';
import './td-media-gallery.js';
import { hasActiveAbove } from '../utils/layers.js';

// v0.43.0 (plan docs/internal/plans/v0.43.0-media-gallery.md M4, decision 10, acceptance 4) — reordering a
// <td-media-gallery> with the shared SortableController: real mouse drag (sendMouse), keyboard on a 2- and a 4-column
// grid (arrows, Home / End, Escape), tap-to-move, ONE input + change (reason reorder) per drop, names / cover badge /
// FormData follow, an outside DOM change mid-gesture cancels. Chromium, Firefox AND WebKit — its own web-test-runner
// group (POINTER_FILES: a mouse release of another page must not reach the captured handle here).
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

/** A gallery of ids m1…mN in a box `width` px wide (tile-min 8rem → 2 columns at 300px, 4 at 600px). */
function mount(n, { width = 600, attrs = '' } = {}) {
  const wrap = document.createElement('div');
  for (const [k, v] of [['position', 'absolute'], ['top', '0px'], ['left', '0px'], ['width', `${width}px`], ['background', '#fff'], ['z-index', '1']]) {
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
const lis = (el) => [...el.querySelectorAll('.td-media-gallery__list > li')];
const handle = (li) => li.querySelector('.td-media-gallery__handle');
const live = (el) => el.querySelector('.td-media-gallery__sort-status');
const center = (n) => { const r = n.getBoundingClientRect(); return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)]; };
const fd = (form) => [...new FormData(form)].map(([, v]) => String(v));

describe('td-media-gallery — keyboard reorder', () => {
  it('2 columns: Enter lifts, ↓ moves one ROW (two places), → one place, Space drops: ONE input + change (reorder)', async () => {
    const { el, form, rec } = mount(4, { width: 300 });
    const h = handle(lis(el)[0]);
    h.focus();
    await sendKeys({ press: 'Enter' });
    expect(lis(el)[0].getAttribute('data-td-sort-state')).to.equal('lifted');
    expect(live(el).textContent).to.equal('Đã nhấc Ảnh 1, vị trí 1 trên 4.');
    await sendKeys({ press: 'ArrowDown' });
    expect(el.value).to.deep.equal(['m2', 'm3', 'm1', 'm4']);
    expect(live(el).textContent).to.equal('Ảnh 1: vị trí 3 trên 4.');
    await sendKeys({ press: 'ArrowRight' });
    expect(el.value).to.deep.equal(['m2', 'm3', 'm4', 'm1']);
    expect(document.activeElement === h).to.equal(true);
    expect(rec).to.deep.equal([], 'no event while lifted');
    expect(fd(form)).to.deep.equal(['m2', 'm3', 'm4', 'm1'], 'FormData follows each step');
    await sendKeys({ press: 'Space' });
    await wait();
    expect(rec).to.deep.equal(['input:reorder', 'change:reorder']);
    expect(live(el).textContent).to.equal('Đã thả Ảnh 1 ở vị trí 4 trên 4.');
    expect(hasActiveAbove(-1)).to.equal(false);
    // names carry the new positions
    expect(handle(lis(el)[3]).getAttribute('aria-label')).to.equal('Sắp xếp Ảnh 4 trên 4: Ảnh 1');
    expect(lis(el)[0].querySelector('.td-media-gallery__remove').getAttribute('aria-label')).to.equal('Gỡ Ảnh 1 trên 4: Ảnh 2');
  });

  it('4 columns: Home / End; Escape puts it back with no event; the gallery live region stays quiet', async () => {
    const { el, rec } = mount(6, { width: 600 });
    const st = el.querySelector('.td-media-gallery__status');
    handle(lis(el)[2]).focus();
    await sendKeys({ press: 'Enter' });
    await sendKeys({ press: 'End' });
    expect(el.value).to.deep.equal(['m1', 'm2', 'm4', 'm5', 'm6', 'm3']);
    await sendKeys({ press: 'Home' });
    expect(el.value[0]).to.equal('m3');
    await sendKeys({ press: 'Escape' });
    await wait();
    expect(el.value).to.deep.equal(['m1', 'm2', 'm3', 'm4', 'm5', 'm6']);
    expect(rec).to.deep.equal([]);
    expect(live(el).textContent).to.equal('Đã huỷ, Ảnh 3 về vị trí 3 trên 6.');
    expect(st.textContent).to.equal('');
  });

  it('cover: the badge and ", ảnh bìa" follow the first position (Home on a lifted tile = make it the cover)', async () => {
    const { el } = mount(3, { attrs: ' cover' });
    handle(lis(el)[2]).focus();
    await sendKeys({ press: 'Enter' });
    await sendKeys({ press: 'Home' });
    await sendKeys({ press: 'Enter' });
    await wait();
    expect(el.value).to.deep.equal(['m3', 'm1', 'm2']);
    expect(el.querySelectorAll('.td-media-gallery__cover').length).to.equal(1);
    expect(!!lis(el)[0].querySelector('.td-media-gallery__cover')).to.equal(true);
    expect(handle(lis(el)[0]).getAttribute('aria-label')).to.equal('Sắp xếp Ảnh 1 trên 3: Ảnh 3, ảnh bìa');
  });

  it('the arrows never act on the alt input (only a lifted handle moves)', async () => {
    const { el, rec } = mount(3, { attrs: ' usage' });
    const alt = lis(el)[0].querySelector('.td-media-gallery__alt');
    alt.focus();
    await sendKeys({ press: 'ArrowDown' });
    await sendKeys({ press: 'End' });
    expect(el.value).to.deep.equal(['m1', 'm2', 'm3']);
    expect(rec).to.deep.equal([]);
  });
});

describe('td-media-gallery — pointer / tap reorder', () => {
  it('a real mouse drag on the handle: ONE input + change on drop; the placeholder lives in the list; DOM unchanged while dragging', async () => {
    const { el, form, rec } = mount(4, { width: 600 });
    const ul = el.querySelector('.td-media-gallery__list');
    const from = center(handle(lis(el)[0]));
    const to = center(lis(el)[2]);
    await sendMouse({ type: 'move', position: from });
    await sendMouse({ type: 'down' });
    for (let i = 1; i <= 8; i += 1) {
      await sendMouse({ type: 'move', position: [Math.round(from[0] + ((to[0] - from[0]) * i) / 8), Math.round(from[1] + ((to[1] - from[1]) * i) / 8)] });
      await frame();
    }
    await wait();
    expect(ul.hasAttribute('data-td-dragging')).to.equal(true, 'gesture alive');
    expect(!!ul.querySelector(':scope > .td-sortable__placeholder')).to.equal(true);
    expect(el.value).to.deep.equal(['m1', 'm2', 'm3', 'm4'], 'the DOM order never changes while dragging');
    expect(rec).to.deep.equal([]);
    await sendMouse({ type: 'up' });
    await frame();
    await wait();
    expect(el.value).to.deep.equal(['m2', 'm3', 'm1', 'm4']);
    expect(rec).to.deep.equal(['input:reorder', 'change:reorder']);
    expect(!!ul.querySelector('.td-sortable__placeholder')).to.equal(false);
    expect(fd(form)).to.deep.equal(['m2', 'm3', 'm1', 'm4']);
    expect(ul.hasAttribute('data-td-dragging')).to.equal(false);
    expect(lis(el).every((li) => !li.hasAttribute('style') || !li.style.getPropertyValue('--_td-sort-x'))).to.equal(true);
  });

  it('a drag that starts on the image body does nothing (only the handle drags)', async () => {
    const { el, rec } = mount(3);
    const from = center(lis(el)[0].querySelector('.td-media-gallery__media'));
    const p = [from[0] - 20, from[1] + 10];
    await sendMouse({ type: 'move', position: p });
    await sendMouse({ type: 'down' });
    await sendMouse({ type: 'move', position: [p[0] + 200, p[1]] });
    await sendMouse({ type: 'up' });
    await wait();
    expect(el.value).to.deep.equal(['m1', 'm2', 'm3']);
    expect(rec).to.deep.equal([]);
  });

  it('tap-to-move (WCAG 2.5.7): tap a handle, then another tile\'s handle → moved there, ONE change', async () => {
    const { el, rec } = mount(4);
    handle(lis(el)[3]).click();
    handle(lis(el)[0]).click();
    await wait();
    expect(el.value).to.deep.equal(['m4', 'm1', 'm2', 'm3']);
    expect(rec).to.deep.equal(['input:reorder', 'change:reorder']);
  });

  it('an outside DOM change of the list mid-gesture cancels it ("external"); the gallery keeps its own tiles', async () => {
    const { el, rec } = mount(3);
    const ul = el.querySelector('.td-media-gallery__list');
    handle(lis(el)[0]).focus();
    await sendKeys({ press: 'Enter' });
    await sendKeys({ press: 'ArrowRight' });
    const intruder = document.createElement('li');
    ul.prepend(intruder);
    await wait();
    expect(!!el.querySelector('[data-td-sort-state]')).to.equal(false);
    expect(intruder.isConnected).to.equal(false, 'the gallery owns its list');
    expect(el.value).to.deep.equal(['m2', 'm1', 'm3']);
    expect(lis(el).length).to.equal(3);
    expect(hasActiveAbove(-1)).to.equal(false);
    expect(rec).to.deep.equal([]);
  });

  it('disabled: the handles are disabled, nothing lifts', async () => {
    const { el, rec } = mount(3, { attrs: ' disabled' });
    handle(lis(el)[0]).click();
    expect(lis(el)[0].hasAttribute('data-td-sort-state')).to.equal(false);
    expect(handle(lis(el)[0]).disabled).to.equal(true);
    expect(rec).to.deep.equal([]);
  });
});
