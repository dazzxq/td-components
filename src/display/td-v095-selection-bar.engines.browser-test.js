import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';
import { TdSelectionBar } from './td-selection-bar.js';
import './td-media-grid.js';
import { fillIconSlots } from '../icons/td-icon.js';

// v0.95.0 (plan docs/internal/plans/v0.95.0-selection-bar.md §5 / §11.2) — <td-selection-bar>: group / for, count,
// empty, selection-change, × / Esc, selection-action + auto-clear (§5.7) and preventDefault(), lock, site-disabled
// buttons, compact + overflow + "…", --td-selection-bar-offset, live region, XSS. Chromium + Firefox + WebKit.
// Synthetic clicks (not in POINTER_FILES); keys through sendKeys; waits on rAF-polled conditions.
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
const ACTIONS = `<button type="button" data-td-action="download" data-td-action-icon="download">Tải về</button>
  <button type="button" data-td-action="tag" data-td-action-icon="tag">Gắn thẻ</button>
  <button type="button" data-td-action="album" data-td-action-icon="folder-plus">Thêm vào album</button>
  <button type="button" data-td-action="delete" data-td-action-icon="trash" data-td-tone="danger">Xoá</button>`;

async function mount({ grids = ['a', 'b'], bar = 'group="lib"', actions = ACTIONS, gridAttrs } = {}) {
  root.innerHTML = grids.map((id) => gridHtml(id, gridAttrs)).join('') + `<td-selection-bar ${bar}>${actions}</td-selection-bar>`;
  const els = [...root.querySelectorAll('td-media-grid')];
  const b = root.querySelector('td-selection-bar');
  await waitFor(() => b.grids.length === els.length, 2000, 'bar attached');
  return { grids: els, bar: b };
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
const panelOf = (bar) => bar.querySelector('.td-selection-bar__panel');
const clearOf = (bar) => bar.querySelector('.td-selection-bar__clear');
const moreOf = (bar) => bar.querySelector('.td-selection-bar__more');
const countOf = (bar) => bar.querySelector('.td-selection-bar__count');
const liveOf = (bar) => bar.querySelector(':scope > span.td-sr-only[aria-live]');
const action = (bar, name) => bar.querySelector(`[data-td-action="${name}"]`);
const offset = () => document.documentElement.style.getPropertyValue('--td-selection-bar-offset');
const select = (g, ...ids) => ids.forEach((id) => click(tickOf(g, id)));

afterEach(async () => {
  root.innerHTML = '';
  root.style.removeProperty('max-inline-size');
  document.querySelectorAll('.td-menu').forEach((m) => m.remove());
  await settle();
});

describe('td-selection-bar — markup + count', () => {
  it('upgrades: panel (group, label) → × + count + tray (actions, "…" last), live region last; empty = hidden', async () => {
    const { bar } = await mount();
    expect(bar.classList.contains('td-selection-bar')).to.equal(true);
    const panel = panelOf(bar);
    expect(panel.getAttribute('role')).to.equal('group');
    expect(panel.getAttribute('aria-label')).to.equal(TdSelectionBar.labels.region);
    expect(clearOf(bar).getAttribute('aria-label')).to.equal('Bỏ chọn tất cả');
    const tray = bar.querySelector('.td-selection-bar__actions');
    expect([...tray.children].map((el) => el.getAttribute('data-td-action') || el.className))
      .to.deep.equal(['download', 'tag', 'album', 'delete', 'td-btn td-btn--ghost td-selection-bar__more']);
    const del = action(bar, 'delete');
    expect(del.classList.contains('td-selection-bar__action--danger')).to.equal(true);
    expect(del.getAttribute('aria-label')).to.equal('Xoá');
    expect(del.querySelector('.td-selection-bar__icon svg')).to.not.equal(null);
    expect(bar.lastElementChild).to.equal(liveOf(bar));
    expect(bar.hasAttribute('data-empty')).to.equal(true);
    expect(getComputedStyle(panel).display).to.equal('none');
    expect(bar.count).to.equal(0);
  });

  it('label attribute names the panel', async () => {
    const { bar } = await mount({ bar: 'group="lib" label="Ảnh đã chọn"' });
    expect(panelOf(bar).getAttribute('aria-label')).to.equal('Ảnh đã chọn');
    bar.setAttribute('label', 'Khác');
    expect(panelOf(bar).getAttribute('aria-label')).to.equal('Khác');
  });

  it('shows the group TOTAL; selection-change once per batch; selectedIds / getSelected()', async () => {
    const { grids: [a, b], bar } = await mount();
    const ev = record(bar, 'selection-change');
    select(a, 'a1');
    click(openOf(b, 'b2'), { shiftKey: true }); // a1 → b2: 5
    // both clicks run in one task → one microtask batch → ONE event carrying the final total (plan §4.6)
    await waitFor(() => ev.length >= 1, 2000, 'selection-change');
    await settle();
    expect(ev.length).to.equal(1);
    expect(ev[0].detail).to.deep.equal({ count: 5, ids: ['a1', 'a2', 'a3', 'b1', 'b2'] });
    expect(bar.count).to.equal(5);
    expect(bar.getSelected()).to.deep.equal(['a1', 'a2', 'a3', 'b1', 'b2']);
    expect(countOf(bar).textContent).to.equal('Đã chọn 5');
    expect(bar.hasAttribute('data-empty')).to.equal(false);
    expect(getComputedStyle(panelOf(bar)).display).to.equal('flex');
    await waitFor(() => liveOf(bar).textContent === 'Đã chọn 5', 2000, 'announcement');
  });

  it('`for="a b"` (grids connected AFTER the bar) counts those grids only', async () => {
    root.innerHTML = '<td-selection-bar for="fa fb">' + ACTIONS + '</td-selection-bar>';
    const bar = root.querySelector('td-selection-bar');
    await settle();
    bar.insertAdjacentHTML('beforebegin', gridHtml('fa', '') + gridHtml('fb', '') + gridHtml('fc', ''));
    const [fa, fb, fc] = root.querySelectorAll('td-media-grid');
    await waitFor(() => bar.grids.length === 2, 2000, 'for grids');
    select(fa, 'fa1');
    select(fc, 'fc1');
    click(openOf(fb, 'fb2'), { shiftKey: true });
    await settle();
    expect(bar.count).to.equal(5);
    expect(fc.selectedIds).to.deep.equal(['fc1']);
  });

  it('a bar connected before td-media-grid is defined: no error, hidden, then counts', async () => {
    // td-media-grid is already defined in this page: an unknown group name stands for "nothing there yet"
    root.innerHTML = '<td-selection-bar group="late">' + ACTIONS + '</td-selection-bar>';
    const bar = root.querySelector('td-selection-bar');
    await settle();
    expect(bar.hasAttribute('data-empty')).to.equal(true);
    bar.insertAdjacentHTML('beforebegin', gridHtml('l', 'selection-group="late"'));
    const l = root.querySelector('td-media-grid');
    select(l, 'l1');
    await waitFor(() => bar.count === 1, 2000, 'late grid counted');
  });

  it('two bars on one group: one announcement', async () => {
    const { grids: [a] } = await mount();
    const second = document.createElement('td-selection-bar');
    second.setAttribute('group', 'lib');
    root.appendChild(second);
    await waitFor(() => second.grids.length === 2, 2000, 'second bar');
    const first = root.querySelector('td-selection-bar');
    select(a, 'a1');
    await waitFor(() => liveOf(first).textContent || liveOf(second).textContent, 2000, 'announced');
    await settle();
    expect([liveOf(first).textContent, liveOf(second).textContent].filter(Boolean)).to.deep.equal(['Đã chọn 1']);
    expect(liveOf(a).textContent).to.equal('');
  });

  it('a second copy of the module (another bundle) changes nothing: one definition, one offset writer', async () => {
    const mod = await import('./td-selection-bar.js?second-bundle');
    expect(customElements.get('td-selection-bar')).to.equal(TdSelectionBar);
    expect(mod.TdSelectionBar).to.not.equal(undefined);
    const { grids: [a], bar } = await mount();
    select(a, 'a1');
    await waitFor(() => bar.count === 1 && parseFloat(offset()) > 0, 2000, 'offset');
  });
});

describe('td-selection-bar — clear', () => {
  it('× clears every grid (each select-change), selection-change { count: 0 } once, "Đã bỏ chọn tất cả", focus → anchor opener', async () => {
    const { grids: [a, b], bar } = await mount();
    select(a, 'a2');
    select(b, 'b1');
    await settle();
    const ev = record(bar, 'selection-change');
    const sa = record(a, 'select-change');
    const sb = record(b, 'select-change');
    clearOf(bar).focus();
    click(clearOf(bar));
    await settle();
    expect(ev.map((e) => e.detail.count)).to.deep.equal([0]);
    expect([sa.length, sb.length]).to.deep.equal([1, 1]);
    expect(bar.hasAttribute('data-empty')).to.equal(true);
    expect(liveOf(bar).textContent).to.equal('Đã bỏ chọn tất cả');
    expect(document.activeElement).to.equal(openOf(b, 'b1'));
  });

  it('Esc with focus in the bar clears and moves focus back to a grid', async () => {
    const { grids: [a], bar } = await mount();
    select(a, 'a3');
    await settle();
    action(bar, 'tag').focus();
    await sendKeys({ press: 'Escape' });
    await settle();
    expect(bar.count).to.equal(0);
    expect(document.activeElement).to.equal(openOf(a, 'a3'));
  });

  it('× and Esc skip a disabled grid; the bar stays with what is left', async () => {
    const { grids: [a, b], bar } = await mount();
    select(a, 'a1');
    select(b, 'b1', 'b2');
    b.setAttribute('disabled', '');
    click(clearOf(bar));
    await settle();
    expect(a.selectedIds).to.deep.equal([]);
    expect(b.selectedIds).to.deep.equal(['b1', 'b2']);
    expect(countOf(bar).textContent).to.equal('Đã chọn 2');
    expect(bar.hasAttribute('data-empty')).to.equal(false);
  });

  it('bar.clear() without emit: no selection-change; clear({ emit: true }) emits', async () => {
    const { grids: [a], bar } = await mount();
    select(a, 'a1');
    await settle();
    const ev = record(bar, 'selection-change');
    bar.clear();
    await settle();
    expect(ev.length).to.equal(0);
    expect(bar.count).to.equal(0);
    select(a, 'a1');
    await settle();
    bar.clear({ emit: true });
    await settle();
    expect(ev.map((e) => e.detail.count)).to.deep.equal([1, 0]);
  });
});

describe('td-selection-bar — selection-action + auto-clear (§5.7)', () => {
  it('site click listener runs once, BEFORE the event, sees the selection; detail; then everything is cleared', async () => {
    const { grids: [a, b], bar } = await mount();
    select(a, 'a1');
    select(b, 'b3');
    await settle();
    const order = [];
    const btn = action(bar, 'tag');
    btn.addEventListener('click', () => order.push(`click:${bar.count}`));
    const acts = record(bar, 'selection-action');
    bar.addEventListener('selection-action', () => order.push(`action:${bar.count}`));
    const changes = record(bar, 'selection-change');
    const sa = record(a, 'select-change');
    btn.focus();
    click(btn);
    await settle();
    expect(order).to.deep.equal(['click:2', 'action:2']);
    expect(acts.length).to.equal(1);
    expect(acts[0].cancelable).to.equal(true);
    expect(acts[0].detail.action).to.equal('tag');
    expect(acts[0].detail.ids).to.deep.equal(['a1', 'b3']);
    expect(acts[0].detail.count).to.equal(2);
    expect(acts[0].detail.button).to.equal(btn);
    expect(bar.count).to.equal(0);
    expect(changes.map((e) => e.detail.count)).to.deep.equal([0]);
    expect(sa.length).to.equal(1);
    expect(liveOf(bar).textContent).to.equal('Đã bỏ chọn tất cả');
    expect(bar.hasAttribute('data-empty')).to.equal(true);
    expect(acts[0].detail.ids).to.deep.equal(['a1', 'b3'], 'detail.ids kept after the clear');
    expect(document.activeElement).to.equal(openOf(b, 'b3'));
  });

  it('preventDefault() keeps selection + bar + focus; bar.clear({ emit: true }) later clears', async () => {
    const { grids: [a], bar } = await mount();
    select(a, 'a1', 'a2');
    await settle();
    bar.addEventListener('selection-action', (e) => e.preventDefault(), { once: true });
    const btn = action(bar, 'download');
    btn.focus();
    click(btn);
    await settle();
    expect(bar.count).to.equal(2);
    expect(bar.hasAttribute('data-empty')).to.equal(false);
    expect(document.activeElement).to.equal(btn);
    bar.clear({ emit: true });
    await settle();
    expect(bar.count).to.equal(0);
  });

  it('preventDefault() on the CLICK (not on selection-action) still clears', async () => {
    const { grids: [a], bar } = await mount();
    select(a, 'a1');
    await settle();
    action(bar, 'download').addEventListener('click', (e) => e.preventDefault());
    click(action(bar, 'download'));
    await settle();
    expect(bar.count).to.equal(0);
  });

  it('a disabled grid keeps its selection after an action: "Đã chọn n", bar stays', async () => {
    const { grids: [a, b], bar } = await mount();
    select(a, 'a1');
    select(b, 'b1', 'b2');
    b.setAttribute('disabled', '');
    await settle();
    const ev = record(bar, 'selection-change');
    click(action(bar, 'tag'));
    await settle();
    expect(a.selectedIds).to.deep.equal([]);
    expect(b.selectedIds).to.deep.equal(['b1', 'b2']);
    expect(ev.map((e) => e.detail.count)).to.deep.equal([2]);
    expect(liveOf(bar).textContent).to.equal('Đã chọn 2');
    expect(bar.hasAttribute('data-empty')).to.equal(false);
  });

  for (const mode of ['group', 'for']) {
    const barAttr = mode === 'group' ? 'group="lib"' : 'for="a b"';
    const gridAttrs = mode === 'group' ? 'selection-group="lib"' : '';

    it(`[${mode}] a listener that REMOVES the bar: the old grids are still cleared, focus → a grid`, async () => {
      const { grids: [a, b], bar } = await mount({ bar: barAttr, gridAttrs });
      select(a, 'a1');
      select(b, 'b1');
      await settle();
      bar.addEventListener('selection-action', () => bar.remove());
      const btn = action(bar, 'tag');
      btn.focus();
      click(btn);
      await settle();
      expect(a.selectedIds).to.deep.equal([]);
      expect(b.selectedIds).to.deep.equal([]);
      expect(document.activeElement).to.not.equal(document.body);
      expect([a, b].some((g) => g.contains(document.activeElement))).to.equal(true);
    });

    it(`[${mode}] a listener that switches the bar to another group: the OLD group is cleared`, async () => {
      root.innerHTML = gridHtml('o', 'selection-group="other"');
      const o = root.querySelector('td-media-grid');
      const { grids: [a, b], bar } = await (async () => {
        const holder = document.createElement('div');
        holder.innerHTML = gridHtml('a', gridAttrs) + gridHtml('b', gridAttrs) + `<td-selection-bar ${barAttr}>${ACTIONS}</td-selection-bar>`;
        root.append(...holder.childNodes);
        const br = root.querySelector('td-selection-bar');
        await waitFor(() => br.grids.length === 2, 2000, 'bar attached');
        return { grids: [root.querySelector('#a'), root.querySelector('#b')], bar: br };
      })();
      select(a, 'a1');
      select(o, 'o1');
      await settle();
      bar.addEventListener('selection-action', () => {
        if (mode === 'group') bar.setAttribute('group', 'other');
        else bar.setAttribute('for', 'o');
      });
      click(action(bar, 'tag'));
      await settle();
      expect(a.selectedIds).to.deep.equal([]);
      expect(b.selectedIds).to.deep.equal([]);
      expect(o.selectedIds).to.deep.equal(['o1']);
    });
  }

  it('a listener that removes grid a: b is still cleared, no error', async () => {
    const { grids: [a, b], bar } = await mount();
    select(a, 'a1');
    select(b, 'b1');
    await settle();
    bar.addEventListener('selection-action', () => a.remove());
    click(action(bar, 'tag'));
    await settle();
    expect(b.selectedIds).to.deep.equal([]);
  });

  it('a listener that throws: the selection is still cleared', async () => {
    const { grids: [a], bar } = await mount();
    select(a, 'a1');
    await settle();
    const onerror = window.onerror;
    window.onerror = () => true; // the dispatch reports the listener error; the test must not fail on it
    try {
      bar.addEventListener('selection-action', () => { throw new Error('site bug'); });
      click(action(bar, 'tag'));
      await settle();
    } finally {
      window.onerror = onerror;
    }
    expect(bar.count).to.equal(0);
  });
});

describe('td-selection-bar — lock + site-disabled buttons', () => {
  it('disabled bar: every control aria-disabled, nothing acts; unlock restores only what the bar set', async () => {
    const actions = ACTIONS + '<button type="button" data-td-action="own" aria-disabled="true">Riêng</button>';
    const { grids: [a], bar } = await mount({ actions });
    select(a, 'a1');
    await settle();
    bar.setAttribute('disabled', '');
    expect(bar.hasAttribute('data-disabled')).to.equal(true);
    for (const el of [clearOf(bar), moreOf(bar), action(bar, 'tag'), action(bar, 'own')]) {
      expect(el.getAttribute('aria-disabled')).to.equal('true');
    }
    const acts = record(bar, 'selection-action');
    const siteClicks = [];
    action(bar, 'tag').addEventListener('click', () => siteClicks.push(1));
    click(action(bar, 'tag'));
    click(clearOf(bar));
    await settle();
    expect(acts.length).to.equal(0);
    expect(siteClicks.length).to.equal(0);
    expect(bar.count).to.equal(1);
    bar.removeAttribute('disabled');
    expect(action(bar, 'tag').hasAttribute('aria-disabled')).to.equal(false);
    expect(clearOf(bar).hasAttribute('aria-disabled')).to.equal(false);
    expect(action(bar, 'own').getAttribute('aria-disabled')).to.equal('true');
  });

  it('locked when EVERY grid is disabled, not when some are', async () => {
    const { grids: [a, b], bar } = await mount();
    select(a, 'a1');
    a.setAttribute('disabled', '');
    await settle();
    expect(bar.hasAttribute('data-disabled')).to.equal(false);
    b.setAttribute('disabled', '');
    await waitFor(() => bar.hasAttribute('data-disabled'), 2000, 'locked');
    b.removeAttribute('disabled');
    await waitFor(() => !bar.hasAttribute('data-disabled'), 2000, 'unlocked');
  });

  it('a site button with aria-disabled="true" / disabled does not act', async () => {
    const actions = '<button type="button" data-td-action="x" aria-disabled="true">X</button><button type="button" data-td-action="y" disabled>Y</button>';
    const { grids: [a], bar } = await mount({ actions });
    select(a, 'a1');
    await settle();
    const acts = record(bar, 'selection-action');
    click(action(bar, 'x'));
    action(bar, 'y').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await settle();
    expect(acts.length).to.equal(0);
    expect(bar.count).to.equal(1);
  });

  it('a site `hidden` button is neither in the tray layout nor in the "…" menu', async () => {
    const actions = ACTIONS + '<button type="button" data-td-action="secret" hidden>Ẩn</button>';
    root.style.maxInlineSize = '320px';
    const { grids: [a], bar } = await mount({ actions });
    select(a, 'a1');
    await waitFor(() => !moreOf(bar).hidden, 2000, 'overflow');
    expect(action(bar, 'secret').hasAttribute('data-td-overflow')).to.equal(false);
    click(moreOf(bar));
    await waitFor(() => document.querySelector('.td-menu'), 2000, 'menu');
    const labels = [...document.querySelectorAll('.td-menu .td-menu__item')].map((el) => el.textContent.trim());
    expect(labels).to.not.include('Ẩn');
  });
});

describe('td-selection-bar — narrow: compact + overflow + "…"', () => {
  it('icon-only below 36rem, overflow from the END into "…", the menu item acts and clears', async () => {
    root.style.maxInlineSize = '320px';
    const { grids: [a], bar } = await mount();
    select(a, 'a1', 'a2');
    await waitFor(() => bar.hasAttribute('data-compact') && !moreOf(bar).hidden, 2000, 'compact + overflow');
    const over = [...bar.querySelectorAll('[data-td-action]')].filter((b) => b.hasAttribute('data-td-overflow'));
    expect(over.length).to.be.greaterThan(0);
    expect(over[over.length - 1].getAttribute('data-td-action')).to.equal('delete');
    const label = action(bar, 'download').querySelector('.td-selection-bar__label');
    expect(getComputedStyle(label).position).to.equal('absolute'); // sr-only, still named
    expect(action(bar, 'download').getAttribute('aria-label')).to.equal('Tải về');
    const tray = bar.querySelector('.td-selection-bar__actions');
    expect(tray.scrollWidth).to.be.at.most(tray.clientWidth + 1);
    const acts = record(bar, 'selection-action');
    moreOf(bar).focus();
    click(moreOf(bar));
    await waitFor(() => document.querySelector('.td-menu'), 2000, 'menu');
    const del = [...document.querySelectorAll('.td-menu .td-menu__item')].find((el) => el.textContent.includes('Xoá'));
    expect(del.classList.contains('td-menu__item--danger')).to.equal(true);
    click(del);
    await settle();
    expect(acts.map((e) => e.detail.action)).to.deep.equal(['delete']);
    expect(acts[0].detail.ids).to.deep.equal(['a1', 'a2']);
    expect(bar.count).to.equal(0);
    expect(document.activeElement).to.not.equal(moreOf(bar));
    expect(document.activeElement).to.not.equal(document.body);
  });

  it('menu items of locked site buttons are disabled and inert', async () => {
    root.style.maxInlineSize = '320px';
    const actions = ACTIONS.replace('data-td-tone="danger"', 'data-td-tone="danger" aria-disabled="true"');
    const { grids: [a], bar } = await mount({ actions });
    select(a, 'a1');
    await waitFor(() => action(bar, 'delete').hasAttribute('data-td-overflow'), 2000, 'delete overflowed');
    const acts = record(bar, 'selection-action');
    click(moreOf(bar));
    await waitFor(() => document.querySelector('.td-menu'), 2000, 'menu');
    const del = [...document.querySelectorAll('.td-menu .td-menu__item')].find((el) => el.textContent.includes('Xoá'));
    expect(del.getAttribute('aria-disabled')).to.equal('true');
    click(del);
    await settle();
    expect(acts.length).to.equal(0);
    expect(bar.count).to.equal(1);
  });

  it('widening again brings overflowed buttons back; resizing back and forth settles; never painted while measuring', async () => {
    root.style.maxInlineSize = '320px';
    const { grids: [a], bar } = await mount();
    select(a, 'a1');
    await waitFor(() => !moreOf(bar).hidden, 2000, 'overflow');
    root.style.maxInlineSize = '1200px';
    await waitFor(() => moreOf(bar).hidden && !bar.hasAttribute('data-compact'), 2000, 'all back');
    expect(bar.querySelectorAll('[data-td-overflow]').length).to.equal(0);
    for (let i = 0; i < 4; i++) {
      root.style.maxInlineSize = i % 2 ? '1200px' : '320px';
      await settle();
      expect(bar.hasAttribute('data-td-measuring')).to.equal(false);
    }
    await settle();
    const before = [...bar.querySelectorAll('[data-td-action]')].map((b) => b.hasAttribute('data-td-overflow'));
    await settle();
    await settle();
    expect([...bar.querySelectorAll('[data-td-action]')].map((b) => b.hasAttribute('data-td-overflow'))).to.deep.equal(before);
  });

  it('changing a button text / hidden while it overflows re-measures', async () => {
    root.style.maxInlineSize = '320px';
    const { grids: [a], bar } = await mount();
    select(a, 'a1');
    await waitFor(() => !moreOf(bar).hidden, 2000, 'overflow');
    for (const name of ['tag', 'album', 'delete']) action(bar, name).hidden = true;
    await waitFor(() => moreOf(bar).hidden, 2000, 'no overflow left');
    action(bar, 'download').querySelector('.td-selection-bar__label').textContent = 'Tải xuống';
    await settle();
    expect(action(bar, 'download').getAttribute('aria-label')).to.equal('Tải xuống');
  });
});

describe('td-selection-bar — offset, icons, XSS', () => {
  it('--td-selection-bar-offset on <html>: bar height while visible, 0px when empty, removed when the last bar leaves', async () => {
    const before = document.documentElement.getAttribute('style');
    const { grids: [a], bar } = await mount();
    select(a, 'a1');
    await waitFor(() => parseFloat(offset()) > 0, 2000, 'offset up');
    expect(Math.abs(parseFloat(offset()) - bar.getBoundingClientRect().height)).to.be.at.most(1);
    bar.clear();
    await waitFor(() => offset() === '0px', 2000, 'offset 0');
    bar.remove();
    await waitFor(() => offset() === '', 2000, 'offset removed');
    expect(document.documentElement.getAttribute('style') || null).to.equal(before || null);
  });

  it('fillIconSlots(document) after upgrade keeps the action labels', async () => {
    const { bar } = await mount();
    fillIconSlots(document);
    expect(action(bar, 'tag').textContent.trim()).to.equal('Gắn thẻ');
    expect(action(bar, 'tag').querySelector('.td-selection-bar__icon svg')).to.not.equal(null);
  });

  it('labels, button text and data-td-action are text, never markup', async () => {
    const evil = '<img src=x onerror="window.__sbXss=1">$&$1';
    const holder = document.createElement('div');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('data-td-action', evil);
    btn.textContent = evil;
    holder.appendChild(btn);
    const { grids: [a], bar } = await mount({ bar: 'group="lib"', actions: '' });
    bar.setAttribute('label', evil);
    bar.appendChild(btn);
    const orig = TdSelectionBar.labels.count;
    TdSelectionBar.labels.count = `${evil} {n}`;
    try {
      select(a, 'a1');
      await settle();
      expect(bar.querySelector('img')).to.equal(null);
      expect(panelOf(bar).getAttribute('aria-label')).to.equal(evil);
      expect(btn.getAttribute('aria-label')).to.equal(evil);
      expect(countOf(bar).textContent).to.equal(`${evil} 1`);
      const acts = record(bar, 'selection-action');
      click(btn);
      expect(acts[0].detail.action).to.equal(evil);
      await settle();
      expect(window.__sbXss).to.equal(undefined);
    } finally {
      TdSelectionBar.labels.count = orig;
    }
  });

  it('danger: red label at rest, its own pressed fill', async () => {
    const { grids: [a], bar } = await mount();
    select(a, 'a1');
    await settle();
    const del = action(bar, 'delete');
    const tag = action(bar, 'tag');
    expect(getComputedStyle(del).color).to.not.equal(getComputedStyle(tag).color);
    const rest = getComputedStyle(del).backgroundColor;
    del.setAttribute('data-td-pressed', '');
    expect(getComputedStyle(del).backgroundColor).to.not.equal(rest);
    del.removeAttribute('data-td-pressed');
  });

  it('data-td-tone changed after upgrade re-syncs the danger modifier (both ways)', async () => {
    const { bar } = await mount();
    const tag = action(bar, 'tag');
    const del = action(bar, 'delete');
    expect(tag.classList.contains('td-selection-bar__action--danger')).to.equal(false);
    tag.setAttribute('data-td-tone', 'danger');
    await waitFor(() => tag.classList.contains('td-selection-bar__action--danger'), 2000, 'tag → danger');
    del.removeAttribute('data-td-tone');
    await waitFor(() => !del.classList.contains('td-selection-bar__action--danger'), 2000, 'delete → plain');
  });
});
