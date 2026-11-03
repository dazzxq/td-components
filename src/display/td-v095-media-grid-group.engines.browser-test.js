import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';
import './td-media-grid.js';
import './td-selection-bar.js';
import { TdMenu } from '../feedback/td-menu.js';

// v0.95.0 (plan docs/internal/plans/v0.95.0-selection-bar.md §4 / §6 / §11.2) — td-media-grid selection group
// (`selection-group`, a bar's `for`) and the K8 `item-remove` event. Chromium + Firefox + WebKit. Synthetic clicks
// (no real mouse → not in POINTER_FILES); keys through sendKeys. Waits on rAF-polled conditions, never fixed sleeps.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const root = document.createElement('div');
document.body.appendChild(root);

const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
const settle = async () => { await Promise.resolve(); await raf(); await raf(); };
async function waitFor(cond, timeout = 3000, what = 'condition') {
  const end = performance.now() + timeout;
  while (performance.now() < end) {
    if (cond()) return;
    await raf();
  }
  throw new Error(`timeout waiting for ${what}`);
}

const items = (prefix, n) => Array.from({ length: n }, (_, i) => `<div data-td-media-item data-id="${prefix}${i + 1}">`
  + `<button type="button" data-td-media-open aria-label="${prefix} ${i + 1}"><img src="/test/fixtures/1.svg" alt="" width="120" height="90"></button></div>`).join('');
const gridHtml = (id, attrs = 'selection-group="lib"', n = 3) => `<td-media-grid id="${id}" label="${id}" ${attrs}>${items(id, n)}</td-media-grid>`;
function mountGroup(n = 3, attrs = 'selection-group="lib"') {
  root.innerHTML = ['a', 'b', 'c', 'd', 'e'].slice(0, n).map((id) => gridHtml(id, attrs)).join('');
  return [...root.querySelectorAll('td-media-grid')];
}
const itemOf = (g, id) => g.querySelector(`[data-id="${id}"]`);
const openOf = (g, id) => itemOf(g, id).querySelector('[data-td-media-open]');
const tickOf = (g, id) => itemOf(g, id).querySelector('.td-media-grid__tick');
const click = (el, init = {}) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, button: 0, ...init }));
const record = (el, name) => {
  const ev = [];
  el.addEventListener(name, (e) => ev.push(e));
  return ev;
};
const liveOf = (g) => [...g.children].find((el) => el.matches('span.td-sr-only[aria-live]'));
const group = (name = 'lib') => customElements.get('td-media-grid')._selectionGroup({ name, root: document });

afterEach(async () => {
  root.innerHTML = '';
  await settle();
});

describe('td-media-grid without a group (unchanged)', () => {
  it('own selection, own Escape, own "Đã chọn n"', async () => {
    root.innerHTML = gridHtml('s', '');
    const g = root.firstElementChild;
    const chg = record(g, 'select-change');
    click(tickOf(g, 's1'));
    click(openOf(g, 's3'), { shiftKey: true });
    expect(g.selectedIds).to.deep.equal(['s1', 's2', 's3']);
    expect(chg.length).to.equal(2);
    await waitFor(() => liveOf(g).textContent === 'Đã chọn 3', 2000, 'grid announcement');
    await sendKeys({ press: 'Escape' });
    expect(g.selectedIds).to.deep.equal([]);
    expect(g.hasAttribute('data-selecting')).to.equal(false);
  });
});

describe('td-media-grid selection-group', () => {
  it('Shift + click ranges across grids in DOM order; each grid fires its own select-change', () => {
    const [a, b, c] = mountGroup();
    const ev = [a, b, c].map((g) => record(g, 'select-change'));
    click(tickOf(a, 'a2'));
    click(openOf(c, 'c2'), { shiftKey: true });
    expect(a.selectedIds).to.deep.equal(['a2', 'a3']);
    expect(b.selectedIds).to.deep.equal(['b1', 'b2', 'b3']);
    expect(c.selectedIds).to.deep.equal(['c1', 'c2']);
    expect(ev.map((e) => e.length)).to.deep.equal([2, 1, 1]);
    expect(ev[1][0].detail.added).to.deep.equal(['b1', 'b2', 'b3']);
    // backwards from the same anchor (a2): adds only
    click(tickOf(a, 'a1'), { shiftKey: true });
    expect(a.selectedIds).to.deep.equal(['a1', 'a2', 'a3']);
  });

  it('Shift + Space on a focused opener ranges across grids', async () => {
    const [a, b] = mountGroup(2);
    click(tickOf(b, 'b3'));
    openOf(a, 'a2').focus();
    await sendKeys({ press: 'Shift+Space' });
    expect(a.selectedIds).to.deep.equal(['a2', 'a3']);
    expect(b.selectedIds).to.deep.equal(['b1', 'b2', 'b3']);
  });

  it('each grid stops at its own max and the range goes on (Q4); select-limit on that grid', () => {
    root.innerHTML = gridHtml('a', 'selection-group="lib" max="1"') + gridHtml('b');
    const [a, b] = root.querySelectorAll('td-media-grid');
    const lim = record(a, 'select-limit');
    click(tickOf(a, 'a1'));
    click(openOf(b, 'b2'), { shiftKey: true });
    expect(a.selectedIds).to.deep.equal(['a1']);
    expect(b.selectedIds).to.deep.equal(['b1', 'b2']);
    // a1 → b2 crosses a2, a3 while a is at its max → a fires select-limit (rangeAcross / legacy range), the range goes on in b
    expect(lim.length).to.equal(1, 'a2, a3 lie in the range and a is full');
    click(tickOf(b, 'b3'));
    click(openOf(a, 'a2'), { shiftKey: true }); // anchor b3 → a2: a is full again
    expect(lim.length).to.equal(2);
    expect(a.selectedIds).to.deep.equal(['a1']);
  });

  it('a plain opener click in grid B (nothing selected there) flips while A selects — no activate (Q1)', () => {
    const [a, b] = mountGroup(2);
    const act = record(b, 'activate');
    click(tickOf(a, 'a1'));
    expect(a.hasAttribute('data-selecting')).to.equal(true);
    expect(b.hasAttribute('data-selecting')).to.equal(true, 'every member shows the ticks');
    click(openOf(b, 'b2'));
    expect(b.selectedIds).to.deep.equal(['b2']);
    expect(act.length).to.equal(0);
    // clear everything → plain click activates again
    a.clear();
    b.clear();
    expect(b.hasAttribute('data-selecting')).to.equal(false);
    click(openOf(b, 'b1'));
    expect(act.length).to.equal(1);
  });

  it('select-mode="tick" in a group: an opener click still activates', () => {
    const [a, b] = mountGroup(2, 'selection-group="lib" select-mode="tick"');
    const act = record(b, 'activate');
    click(tickOf(a, 'a1'));
    click(openOf(b, 'b1'));
    expect(act.length).to.equal(1);
    expect(b.selectedIds).to.deep.equal([]);
  });

  it('Escape clears every member except a disabled one (Q5)', async () => {
    const [a, b, c] = mountGroup();
    click(tickOf(a, 'a1'));
    click(tickOf(b, 'b1'));
    click(tickOf(c, 'c1'));
    b.setAttribute('disabled', '');
    await sendKeys({ press: 'Escape' });
    expect(a.selectedIds).to.deep.equal([]);
    expect(c.selectedIds).to.deep.equal([]);
    expect(b.selectedIds).to.deep.equal(['b1']);
    expect(a.hasAttribute('data-selecting')).to.equal(true, 'the group still has a selection (b)');
  });

  it('Escape with a menu open closes the menu first', async () => {
    const [a] = mountGroup(2);
    click(tickOf(a, 'a1'));
    const anchor = document.createElement('button');
    anchor.textContent = 'menu';
    root.appendChild(anchor);
    TdMenu.open(anchor, [{ label: 'X', onClick() {} }]);
    await waitFor(() => document.querySelector('.td-menu'), 2000, 'menu');
    await sendKeys({ press: 'Escape' });
    await waitFor(() => !document.querySelector('.td-menu'), 2000, 'menu closed');
    expect(a.selectedIds).to.deep.equal(['a1']);
    await sendKeys({ press: 'Escape' });
    expect(a.selectedIds).to.deep.equal([]);
  });

  it('a grid appended while selecting joins: [data-selecting], selection kept, Shift from the old anchor reaches it', async () => {
    const [a] = mountGroup(1);
    click(tickOf(a, 'a2'));
    const holder = document.createElement('div');
    holder.innerHTML = gridHtml('n');
    const n = holder.firstElementChild;
    root.appendChild(n);
    expect(n.hasAttribute('data-selecting')).to.equal(true);
    expect(a.selectedIds).to.deep.equal(['a2']);
    click(openOf(n, 'n2'), { shiftKey: true });
    expect(a.selectedIds).to.deep.equal(['a2', 'a3']);
    expect(n.selectedIds).to.deep.equal(['n1', 'n2']);
  });

  it('a grid with a selection removed from the DOM: the total drops, its anchor is gone', async () => {
    const [a, b] = mountGroup(2);
    const h = group();
    try {
      click(tickOf(a, 'a1'));
      click(tickOf(b, 'b2')); // anchor = b2
      expect(h.count).to.equal(2);
      b.remove();
      expect(h.count).to.equal(1);
      expect(h.grids).to.deep.equal([a]);
      click(openOf(a, 'a3'), { shiftKey: true }); // no anchor in the group any more → single flip
      expect(a.selectedIds).to.deep.equal(['a1', 'a3']);
    } finally {
      h.release();
    }
  });

  it('the anchor item removed from its grid: the group anchor is gone, a later item with the same id is not the anchor (Codex impl r1 #1)', async () => {
    const [a, b] = mountGroup(2);
    const h = group();
    try {
      click(tickOf(a, 'a1'));
      click(tickOf(b, 'b2')); // anchor = b2
      itemOf(b, 'b2').remove();
      await settle();
      const holder = document.createElement('div');
      holder.innerHTML = items('b', 2);
      b.appendChild(holder.lastElementChild); // a new b2
      await settle();
      click(openOf(a, 'a3'), { shiftKey: true }); // no anchor → single flip, no range from the new b2
      expect(a.selectedIds).to.deep.equal(['a1', 'a3']);
      expect(b.selectedIds).to.deep.equal([]);
    } finally {
      h.release();
    }
  });

  it('a grid moved inside the page (same task) stays in the group, no selection-change on the bar', async () => {
    root.innerHTML = gridHtml('a') + gridHtml('b') + '<td-selection-bar group="lib"><button type="button" data-td-action="x">X</button></td-selection-bar>';
    const [a, b] = root.querySelectorAll('td-media-grid');
    const bar = root.querySelector('td-selection-bar');
    await waitFor(() => bar.grids.length === 2, 2000, 'bar attached');
    click(tickOf(b, 'b1'));
    await settle();
    const ev = record(bar, 'selection-change');
    root.insertBefore(b, a);
    await settle();
    expect(ev.length).to.equal(0);
    expect(bar.grids.map((g) => g.id).join()).to.equal('b,a'); // DOM order (ids: DOM nodes in a chai diff hang the runner)
    expect(bar.count).to.equal(1);
  });

  it('selection-group changed in place: leaves the old group, keeps its selection', () => {
    const [a, b] = mountGroup(2);
    const h = group();
    try {
      click(tickOf(a, 'a1'));
      click(tickOf(b, 'b1'));
      b.setAttribute('selection-group', 'other');
      expect(h.grids).to.deep.equal([a]);
      expect(b.selectedIds).to.deep.equal(['b1']);
      expect(b.selectionGroup).to.equal('other');
      a.clear();
      expect(a.hasAttribute('data-selecting')).to.equal(false);
      expect(b.hasAttribute('data-selecting')).to.equal(true);
      b.removeAttribute('selection-group'); // no group: own semantics again
      expect(b.hasAttribute('data-selecting')).to.equal(true);
    } finally {
      h.release();
    }
  });

  it('announcement: one sentence with the TOTAL per action, by the grid changed last; the others stay silent', async () => {
    const [a, b] = mountGroup(2);
    click(tickOf(a, 'a1'));
    await waitFor(() => liveOf(a).textContent === 'Đã chọn 1', 2000, 'first total');
    click(openOf(b, 'b3'), { shiftKey: true }); // a1 → b3: a2 a3 b1 b2 b3
    await waitFor(() => liveOf(b).textContent === 'Đã chọn 6', 2000, 'total read by b');
    expect(liveOf(a).textContent).to.equal('Đã chọn 1', 'a does not read its own count');
  });

  it('with a bar: the grids do not announce, the bar reads the total', async () => {
    root.innerHTML = gridHtml('a') + '<td-selection-bar group="lib"><button type="button" data-td-action="x">X</button></td-selection-bar>';
    const a = root.querySelector('td-media-grid');
    const bar = root.querySelector('td-selection-bar');
    await waitFor(() => bar.grids.length === 1, 2000, 'bar attached');
    click(tickOf(a, 'a1'));
    const barLive = bar.querySelector(':scope > span.td-sr-only[aria-live]');
    await waitFor(() => barLive.textContent === 'Đã chọn 1', 2000, 'bar announcement');
    expect(liveOf(a).textContent).to.equal('');
  });

  it('a grid in the `for` of two bars belongs to the bar registered first; the other warns once and takes it over later', async () => {
    root.innerHTML = gridHtml('a', '') + gridHtml('b', '');
    const [a, b] = root.querySelectorAll('td-media-grid');
    const warns = [];
    const orig = console.warn;
    console.warn = (...args) => { warns.push(args.join(' ')); };
    try {
      const one = document.createElement('td-selection-bar');
      one.setAttribute('for', 'a b');
      root.appendChild(one);
      await waitFor(() => one.grids.length === 2, 2000, 'bar one');
      const two = document.createElement('td-selection-bar');
      two.setAttribute('for', 'b');
      root.appendChild(two);
      await settle();
      expect(two.grids).to.deep.equal([]);
      expect(warns.filter((w) => w.includes('td-selection-bar')).length).to.equal(1);
      click(tickOf(b, 'b1'));
      expect(one.count).to.equal(1);
      expect(two.count).to.equal(0);
      one.remove();
      await settle();
      expect(two.grids).to.deep.equal([b]);
      expect(two.count).to.equal(1);
      expect(a.hasAttribute('data-selecting')).to.equal(false);
    } finally {
      console.warn = orig;
    }
  });
});

describe('td-media-grid item-remove (K8)', () => {
  const rows = () => `<td-media-grid id="g" label="g">
    <div class="row" data-row="1">${items('r1-', 2)}</div>
    <div class="row" data-row="2">${items('r2-', 2)}</div>
    <div class="row" data-row="3">${items('r3-', 2)}</div>
  </td-media-grid>`;

  it('one item removed → one event with its id, item and container', async () => {
    root.innerHTML = rows();
    const g = root.firstElementChild;
    const ev = record(g, 'item-remove');
    const it = itemOf(g, 'r2-1');
    it.remove();
    await waitFor(() => ev.length === 1, 2000, 'item-remove');
    expect(ev[0].detail.ids).to.deep.equal(['r2-1']);
    expect(ev[0].detail.items).to.deep.equal([it]);
    expect(ev[0].detail.containers).to.deep.equal([g.querySelector('[data-row="2"]')]);
    expect(ev[0].bubbles).to.equal(true);
    await settle();
    expect(ev.length).to.equal(1);
  });

  it('a whole row removed → its items, container = the grid; two rows → one event, DOM order', async () => {
    root.innerHTML = rows();
    const g = root.firstElementChild;
    const ev = record(g, 'item-remove');
    g.querySelector('[data-row="3"]').remove();
    g.querySelector('[data-row="1"]').remove();
    await waitFor(() => ev.length === 1, 2000, 'item-remove');
    expect(ev[0].detail.ids).to.deep.equal(['r1-1', 'r1-2', 'r3-1', 'r3-2']);
    expect(ev[0].detail.containers).to.deep.equal([g]);
  });

  it('innerHTML replaced → one event with every old id', async () => {
    root.innerHTML = rows();
    const g = root.firstElementChild;
    const ev = record(g, 'item-remove');
    g.innerHTML = items('new', 2);
    await waitFor(() => ev.length === 1, 2000, 'item-remove');
    expect(ev[0].detail.ids).to.deep.equal(['r1-1', 'r1-2', 'r2-1', 'r2-2', 'r3-1', 'r3-2']);
    expect(ev[0].detail.containers).to.deep.equal([g]);
    await settle();
    expect(ev.length).to.equal(1);
  });

  it('data-id changed then removed in the same batch → the OLD id', async () => {
    root.innerHTML = rows();
    const g = root.firstElementChild;
    const ev = record(g, 'item-remove');
    const it = itemOf(g, 'r1-2');
    it.setAttribute('data-id', 'renamed');
    it.remove();
    await waitFor(() => ev.length === 1, 2000, 'item-remove');
    expect(ev[0].detail.ids).to.deep.equal(['r1-2']);
  });

  it('an item + a non-item removed from another row: containers = the item row only', async () => {
    root.innerHTML = rows();
    const g = root.firstElementChild;
    const extra = document.createElement('span');
    g.querySelector('[data-row="3"]').appendChild(extra);
    await settle();
    const ev = record(g, 'item-remove');
    itemOf(g, 'r1-1').remove();
    extra.remove();
    await waitFor(() => ev.length === 1, 2000, 'item-remove');
    expect(ev[0].detail.containers).to.deep.equal([g.querySelector('[data-row="1"]')]);
  });

  it('no event: an item moved between rows in the same task, a data-id change, a reconnect', async () => {
    root.innerHTML = rows();
    const g = root.firstElementChild;
    const ev = record(g, 'item-remove');
    g.querySelector('[data-row="2"]').appendChild(itemOf(g, 'r1-1'));
    await settle();
    itemOf(g, 'r2-2').setAttribute('data-id', 'other');
    await settle();
    g.remove();
    root.appendChild(g);
    await settle();
    expect(ev.length).to.equal(0);
  });

  it('fires after select-change (grid.selectedIds already reconciled)', async () => {
    root.innerHTML = rows();
    const g = root.firstElementChild;
    click(tickOf(g, 'r1-1'));
    click(tickOf(g, 'r2-1'));
    const order = [];
    let seen = null;
    g.addEventListener('select-change', () => order.push('select-change'));
    g.addEventListener('item-remove', () => { order.push('item-remove'); seen = g.selectedIds; });
    itemOf(g, 'r1-1').remove();
    await waitFor(() => order.length === 2, 2000, 'both events');
    expect(order).to.deep.equal(['select-change', 'item-remove']);
    expect(seen).to.deep.equal(['r2-1']);
  });

  it('layout="justified" fires too', async () => {
    root.innerHTML = `<td-media-grid layout="justified" label="j">${items('j', 3)}</td-media-grid>`;
    const g = root.firstElementChild;
    const ev = record(g, 'item-remove');
    itemOf(g, 'j2').remove();
    await waitFor(() => ev.length === 1, 2000, 'item-remove');
    expect(ev[0].detail.ids).to.deep.equal(['j2']);
    expect(ev[0].detail.containers).to.deep.equal([g]);
  });
});
