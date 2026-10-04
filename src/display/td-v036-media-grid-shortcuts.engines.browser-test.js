import { expect } from '@esm-bundle/chai';
import { sendKeys, sendMouse, resetMouse } from '@web/test-runner-commands';
import './td-media-grid.js';

// v0.36.0 M2 (plan QĐ 6–7) — selection shortcuts (QĐ 7a: no text selection on Shift+click — measured: no engine
// selects text with button / link openers, so no guard code was added; these tests keep it that way) with REAL input (sendKeys down/up + sendMouse), Chromium + Firefox +
// WebKit. Platform modifier: Meta on macOS (Ctrl+click is the context menu there), Control elsewhere.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const MOD = /Mac/i.test(navigator.platform || navigator.userAgent) ? 'Meta' : 'Control';
const root = document.createElement('div');
document.body.appendChild(root);
const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
async function waitFor(cond, timeout = 3000, what = 'condition') {
  const end = performance.now() + timeout;
  while (performance.now() < end) {
    if (cond()) return;
    await raf();
  }
  throw new Error(`timeout waiting for ${what}`);
}

function mount(n = 6, attrs = 'select-mode="tick"', tag = 'button') {
  const items = Array.from({ length: n }, (_, i) => {
    const open = tag === 'a'
      ? `<a href="#m${i + 1}" data-td-media-open aria-label="Ảnh ${i + 1}">`
      : `<button type="button" data-td-media-open aria-label="Ảnh ${i + 1}">`;
    return `<div data-td-media-item data-id="m${i + 1}">${open}<img src="/test/fixtures/1.svg" alt="" width="120" height="80">`
      + `<span class="name">Tên ảnh ${i + 1}</span></${tag}></div>`;
  }).join('');
  root.innerHTML = `<p class="lead">Chọn ảnh trong thư viện bên dưới</p><td-media-grid label="Lưới" ${attrs}>${items}</td-media-grid>`;
  return root.querySelector('td-media-grid');
}
const openOf = (g, id) => g.querySelector(`[data-id="${id}"] [data-td-media-open]`);
const center = (el) => {
  const r = el.getBoundingClientRect();
  return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)];
};
async function clickWith(el, key) {
  el.scrollIntoView({ block: 'nearest' });
  await raf();
  if (key) await sendKeys({ down: key });
  try {
    await sendMouse({ type: 'click', position: center(el) });
  } finally {
    if (key) await sendKeys({ up: key });
  }
  await raf();
}
const record = (g, name) => {
  const ev = [];
  g.addEventListener(name, (e) => ev.push(e));
  return ev;
};

afterEach(async () => {
  await resetMouse();
  root.innerHTML = '';
  window.getSelection()?.removeAllRanges();
});

describe('v0.36.0 td-media-grid shortcuts (real input)', () => {
  it(`tick mode: ${MOD}+click toggles one (no activate), Shift+click adds the range from the anchor, no text selection`, async () => {
    const g = mount();
    await waitFor(() => g.querySelectorAll('.td-media-grid__tick').length === 6, 3000, 'ticks');
    const act = record(g, 'activate');
    await clickWith(openOf(g, 'm2'), MOD);
    expect(g.selectedIds).to.deep.equal(['m2']);
    expect(act.length).to.equal(0);
    // a caret in the text above, then Shift+click: without the fix the browser extends a TEXT selection over the cards
    await clickWith(root.querySelector('.lead'));
    await clickWith(openOf(g, 'm5'), 'Shift');
    expect(g.selectedIds).to.deep.equal(['m2', 'm3', 'm4', 'm5']);
    expect(String(window.getSelection()), 'no text selection after Shift+click').to.equal('');
    await clickWith(openOf(g, 'm3'), MOD);
    expect(g.selectedIds).to.deep.equal(['m2', 'm4', 'm5']);
    await clickWith(openOf(g, 'm6'));
    expect(act.length, 'plain click activates').to.equal(1);
    expect(g.selectedIds).to.deep.equal(['m2', 'm4', 'm5']);
  });

  it('link openers (tick mode): Shift+click extends the selection, never a text selection', async () => {
    const g = mount(5, 'select-mode="tick"', 'a');
    await waitFor(() => g.querySelectorAll('.td-media-grid__tick').length === 5, 3000, 'ticks');
    await clickWith(openOf(g, 'm1'), MOD);
    await clickWith(root.querySelector('.lead'));
    await clickWith(openOf(g, 'm4'), 'Shift');
    expect(g.selectedIds).to.deep.equal(['m1', 'm2', 'm3', 'm4']);
    expect(String(window.getSelection())).to.equal('');
  });

  it('Shift+click without an anchor = a single flip; the range stops at max (+ select-limit)', async () => {
    const g = mount(6, 'select-mode="tick" max="3"');
    await waitFor(() => g.querySelectorAll('.td-media-grid__tick').length === 6, 3000, 'ticks');
    const lim = record(g, 'select-limit');
    await clickWith(openOf(g, 'm4'), 'Shift');
    expect(g.selectedIds).to.deep.equal(['m4']);
    await clickWith(openOf(g, 'm1'), 'Shift');
    expect(g.selectedIds.length).to.equal(3);
    expect(lim.length).to.equal(1);
  });

  it('keyboard: Space toggles, Shift+Space adds the range', async () => {
    const g = mount();
    await waitFor(() => g.querySelectorAll('.td-media-grid__tick').length === 6, 3000, 'ticks');
    openOf(g, 'm1').focus();
    await sendKeys({ press: 'Space' });
    expect(g.selectedIds).to.deep.equal(['m1']);
    openOf(g, 'm3').focus();
    await sendKeys({ press: 'Shift+Space' });
    expect(g.selectedIds).to.deep.equal(['m1', 'm2', 'm3']);
  });

  it(`default mode: ${MOD}+click on a <button> opener starts a selection`, async () => {
    const g = mount(4, '');
    await waitFor(() => g.querySelectorAll('.td-media-grid__tick').length === 4, 3000, 'ticks');
    const act = record(g, 'activate');
    await clickWith(openOf(g, 'm2'), MOD);
    expect(g.selectedIds).to.deep.equal(['m2']);
    expect(act.length).to.equal(0);
  });

  it(`default mode: ${MOD}+click on an <a href> opener is left to the browser (not prevented, no flip)`, async () => {
    const g = mount(3, '', 'a');
    await waitFor(() => g.querySelectorAll('.td-media-grid__tick').length === 3, 3000, 'ticks');
    let prevented = null;
    // observe the default state after the grid's capture listener (bubble phase on window), then stop navigation
    const spy = (e) => { prevented = e.defaultPrevented; e.preventDefault(); };
    window.addEventListener('click', spy);
    try {
      // synthetic (a REAL Ctrl/Cmd+click on a link would open a new tab / window in the test browser)
      openOf(g, 'm2').dispatchEvent(new MouseEvent('click', {
        bubbles: true, cancelable: true, composed: true, button: 0, ctrlKey: MOD === 'Control', metaKey: MOD === 'Meta',
      }));
    } finally {
      window.removeEventListener('click', spy);
    }
    expect(prevented).to.equal(false);
    expect(g.selectedIds).to.deep.equal([]);
  });
});
