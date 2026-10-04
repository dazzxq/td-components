import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';
import './td-media-grid.js';

// v0.33.0 — td-media-grid select-mode="tick" + --td-media-grid-tick-inline (plan v0.33.0 decisions 15 / 39).
// Chromium + Firefox + WebKit. Waits on real signals (rAF-polled conditions), never fixed sleeps.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

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

function mount(n = 5, attrs = 'select-mode="tick"') {
  const items = Array.from({ length: n }, (_, i) => `<div data-td-media-item data-id="m${i + 1}">`
    + `<button type="button" data-td-media-open aria-label="Ảnh ${i + 1}"><img src="/test/fixtures/1.svg" alt="" width="1200" height="800"></button></div>`).join('');
  root.innerHTML = `<td-media-grid label="Lưới" ${attrs}>${items}</td-media-grid>`;
  return root.querySelector('td-media-grid');
}
const itemOf = (g, id) => g.querySelector(`[data-id="${id}"]`);
const openOf = (g, id) => itemOf(g, id).querySelector('[data-td-media-open]');
const tickOf = (g, id) => itemOf(g, id).querySelector('.td-media-grid__tick');
const click = (el, init = {}) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, button: 0, ...init }));
const record = (g, name) => {
  const ev = [];
  g.addEventListener(name, (e) => ev.push(e));
  return ev;
};

afterEach(() => { root.innerHTML = ''; });

describe('td-media-grid select-mode="tick"', () => {
  it('plain opener click ALWAYS activates — also while selecting; the selection is unchanged', () => {
    const g = mount();
    const act = record(g, 'activate');
    const chg = record(g, 'select-change');
    click(openOf(g, 'm1'));
    expect(act.length).to.equal(1);
    expect(g.selectedIds).to.deep.equal([]);
    click(tickOf(g, 'm2'));
    expect(g.selectedIds).to.deep.equal(['m2']);
    click(openOf(g, 'm3'));
    expect(act.length).to.equal(2, 'activate while selecting');
    expect(act[1].detail.id).to.equal('m3');
    expect(g.selectedIds).to.deep.equal(['m2']);
    expect(chg.length).to.equal(1);
  });

  it('Ctrl+click and Cmd(meta)+click flip without activate; Shift+click adds a range', () => {
    const g = mount();
    const act = record(g, 'activate');
    click(openOf(g, 'm1'), { ctrlKey: true });
    expect(g.selectedIds).to.deep.equal(['m1']);
    click(openOf(g, 'm2'), { metaKey: true });
    expect(g.selectedIds).to.deep.equal(['m1', 'm2']);
    click(openOf(g, 'm1'), { metaKey: true });
    expect(g.selectedIds).to.deep.equal(['m2']);
    click(openOf(g, 'm4'), { shiftKey: true }); // range from the anchor (m1, the last flipped item) — grid semantics
    expect(g.selectedIds).to.deep.equal(['m1', 'm2', 'm3', 'm4']);
    expect(act.length).to.equal(0);
  });

  it('a prevented Ctrl+click does not follow an <a> opener', () => {
    root.innerHTML = '<td-media-grid select-mode="tick"><div data-td-media-item data-id="a"><a href="#nowhere" data-td-media-open>'
      + '<img src="/test/fixtures/1.svg" alt="A"></a></div></td-media-grid>';
    const g = root.firstElementChild;
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ctrlKey: true });
    g.querySelector('a').dispatchEvent(ev);
    expect(ev.defaultPrevented).to.equal(true);
    expect(g.selectedIds).to.deep.equal(['a']);
  });

  it('Space flips, Enter activates (keyboard unchanged)', async () => {
    const g = mount();
    const act = record(g, 'activate');
    openOf(g, 'm2').focus();
    await sendKeys({ press: 'Space' });
    expect(g.selectedIds).to.deep.equal(['m2']);
    await sendKeys({ press: 'Enter' });
    expect(act.length).to.equal(1);
    expect(g.selectedIds).to.deep.equal(['m2']);
  });

  it('disabled: Ctrl+click does not select (it activates, like a plain click)', () => {
    const g = mount(3, 'select-mode="tick" disabled');
    const act = record(g, 'activate');
    click(openOf(g, 'm1'), { ctrlKey: true });
    expect(g.selectedIds).to.deep.equal([]);
    click(openOf(g, 'm1'));
    expect(act.length).to.equal(2);
  });

  it('default mode keeps the old behaviour (selecting → opener click flips; Ctrl+click with nothing selected activates)', () => {
    const g = mount(3, '');
    const act = record(g, 'activate');
    click(openOf(g, 'm1'), { ctrlKey: true });
    expect(act.length).to.equal(1);
    expect(g.selectedIds).to.deep.equal([]);
    click(tickOf(g, 'm1'));
    click(openOf(g, 'm2'));
    expect(g.selectedIds).to.deep.equal(['m1', 'm2']);
    expect(act.length).to.equal(1);
  });

  it('switching the attribute at runtime takes effect on the next click', () => {
    const g = mount(3, '');
    click(tickOf(g, 'm1'));
    g.setAttribute('select-mode', 'tick');
    const act = record(g, 'activate');
    click(openOf(g, 'm2'));
    expect(act.length).to.equal(1);
    g.removeAttribute('select-mode');
    click(openOf(g, 'm2'));
    expect(g.selectedIds).to.deep.equal(['m1', 'm2']);
  });
});

describe('td-media-grid --td-media-grid-tick-inline', () => {
  it('start (default): tick on the inline-start corner; end: inline-end corner (host [data-td-tick])', async () => {
    const g = mount(2);
    g.style.setProperty('width', '400px');
    const t = tickOf(g, 'm1');
    const it = itemOf(g, 'm1');
    const inset = () => ({ l: t.getBoundingClientRect().left - it.getBoundingClientRect().left,
      r: it.getBoundingClientRect().right - t.getBoundingClientRect().right });
    expect(g.hasAttribute('data-td-tick')).to.equal(false);
    expect(Math.abs(inset().l - 6)).to.be.below(1);
    g.style.setProperty('--td-media-grid-tick-inline', 'end');
    g.style.setProperty('width', '420px'); // a token flip comes with a breakpoint (resize) → the next read phase sees it
    await waitFor(() => g.getAttribute('data-td-tick') === 'end', 3000, 'data-td-tick=end');
    expect(Math.abs(inset().r - 6)).to.be.below(1);
    expect(inset().l).to.be.above(20);
  });

  it('a token set before connect is applied on the first render (no frame on the wrong corner)', () => {
    root.innerHTML = '<div class="pick"></div>';
    const host = root.firstElementChild;
    host.style.setProperty('--td-media-grid-tick-inline', 'end');
    host.innerHTML = '<td-media-grid><div data-td-media-item data-id="x"><button type="button" data-td-media-open>'
      + '<img src="/test/fixtures/1.svg" alt="x"></button></div></td-media-grid>';
    expect(host.firstElementChild.getAttribute('data-td-tick')).to.equal('end');
  });
});
