import { expect } from '@esm-bundle/chai';
import { sendKeys, sendMouse, resetMouse } from '@web/test-runner-commands';
import { TdFilterChips } from './td-filter-chips.js';

// v0.39.0 (plan docs/internal/plans/v0.39.0-filters-range.md QĐ 11–15, M3) — <td-filter-chips>: text-only chips,
// uncontrolled by default (cancelable `filter-remove` / `filter-clear`), × as a link when the item has a safe `href`,
// focus after a removal (next → previous → "Xoá tất cả" → `empty-focus` → host), `role=status` announcements, one
// scrolling row under 480px of container width. Real mouse / keys in Chromium, Firefox and WebKit.
// DOM nodes are compared as booleans (`a === b`): a failing chai assertion carrying DOM nodes hangs the runner.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const root = document.createElement('div');
document.body.appendChild(root);
const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
const frames = async (n = 2) => { for (let i = 0; i < n; i++) await raf(); };
const tick = () => new Promise((r) => queueMicrotask(r));
const IS_WEBKIT = /AppleWebKit/.test(navigator.userAgent) && !/Chrome|Chromium|HeadlessChrome/.test(navigator.userAgent);

const warns = [];
const origWarn = console.warn;
beforeEach(() => {
  warns.length = 0;
  console.warn = (...a) => { warns.push(a.map(String).join(' ')); };
});
afterEach(async () => {
  console.warn = origWarn;
  await resetMouse();
  root.innerHTML = '';
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
});

const ITEMS = () => [
  { key: 'status', label: 'Trạng thái', value: 'Đang bán' },
  { key: 'q', label: 'Tìm', value: 'iphone' },
  { key: 'brand', label: 'Hãng', value: 'Apple' },
];

async function mk(items = ITEMS(), attrs = '', width = 900) {
  const wrap = document.createElement('div');
  wrap.style.width = `${width}px`;
  wrap.innerHTML = `<input id="search-q" aria-label="Tìm"><td-filter-chips ${attrs}></td-filter-chips>`;
  root.appendChild(wrap);
  const el = wrap.querySelector('td-filter-chips');
  el.items = items;
  await frames(1);
  return el;
}
const chips = (el) => [...el.querySelectorAll('.td-filter-chips__item')];
const x = (el, i) => chips(el)[i].querySelector('.td-filter-chips__remove');
const clearBtn = (el) => el.querySelector('.td-filter-chips__clear');
const status = (el) => el.querySelector('[role="status"]').textContent;
const record = (el, name, fn) => {
  const ev = [];
  el.addEventListener(name, (e) => { ev.push(e.detail); fn?.(e); });
  return ev;
};
const center = (n) => {
  const r = n.getBoundingClientRect();
  return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)];
};
async function click(n) {
  n.scrollIntoView({ block: 'nearest' });
  await raf();
  await sendMouse({ type: 'click', position: center(n) });
  await raf();
}
const settle = async () => { await tick(); await tick(); await raf(); };

describe('v0.39.0 td-filter-chips — markup + semantics (QĐ 11, 14)', () => {
  it('group named "Bộ lọc đang áp dụng" > list > one chip per item: "label: value" text + × named "Bỏ lọc label: value"', async () => {
    const el = await mk();
    const g = el.querySelector('.td-filter-chips');
    expect(g.getAttribute('role')).to.equal('group');
    expect(g.getAttribute('aria-label')).to.equal('Bộ lọc đang áp dụng');
    expect(g.querySelector(':scope > ul.td-filter-chips__list').getAttribute('role')).to.equal('list');
    expect(chips(el).map((li) => li.textContent)).to.deep.equal(['Trạng thái: Đang bán', 'Tìm: iphone', 'Hãng: Apple']);
    expect(x(el, 1).localName).to.equal('button');
    expect(x(el, 1).getAttribute('type')).to.equal('button');
    expect(x(el, 1).getAttribute('aria-label')).to.equal('Bỏ lọc Tìm: iphone');
    expect(x(el, 1).querySelector('svg')).to.not.equal(null);
    expect(clearBtn(el).textContent).to.equal('Xoá tất cả');
    expect(el.querySelector(':scope > p[role="status"]')).to.not.equal(null);
    expect(el.hidden).to.equal(false);
    expect(el.items.map((i) => i.id)).to.deep.equal(['status', 'q', 'brand']);
    el.setAttribute('label', 'Đang lọc');
    expect(el.querySelector('.td-filter-chips').getAttribute('aria-label')).to.equal('Đang lọc');
  });

  it('"Xoá tất cả" only with ≥ 2 removable chips; removable: false → no ×; items = silent', async () => {
    const el = await mk([{ key: 'kho', label: 'Kho', value: 'HN', removable: false }, { key: 'q', label: 'Tìm', value: 'a' }]);
    const ev = record(el, 'filter-remove');
    expect(x(el, 0)).to.equal(null);
    expect(clearBtn(el)).to.equal(null);
    el.items = [...el.items, { key: 'b', value: 'x' }];
    expect(clearBtn(el)).to.not.equal(null);
    expect(ev).to.deep.equal([]);
    el.items = [];
    await raf();
    expect(el.hidden).to.equal(true);
  });

  it('XSS: label / value are text; href javascript: → no link; duplicate id → suffix + one warning', async () => {
    const el = await mk([
      { key: 'q', label: '<img src=x onerror="window.__pwnL=1">', value: '<img src=x onerror="window.__pwnV=1">', href: 'javascript:window.__pwnH=1' },
      { id: 'q', key: 'q2', value: '1' },
    ]);
    await frames(2);
    expect(el.querySelector('img')).to.equal(null);
    expect(window.__pwnL || window.__pwnV || window.__pwnH).to.equal(undefined);
    expect(chips(el)[0].querySelector('.td-filter-chips__value').textContent).to.equal('<img src=x onerror="window.__pwnV=1">');
    expect(x(el, 0).localName).to.equal('button');
    expect(el.querySelector('a')).to.equal(null);
    expect(el.items.map((i) => i.id)).to.deep.equal(['q', 'q-2']);
    expect(warns.filter((w) => /id/.test(w)).length).to.equal(1);
  });

  it('a dropped item (array value) → one warning; the others render', async () => {
    const el = await mk([{ key: 'tag', value: ['a', 'b'] }, { key: 'q', value: 'x' }]);
    expect(chips(el).length).to.equal(1);
    expect(warns.filter((w) => /dropped/.test(w)).length).to.equal(1);
  });
});

describe('v0.39.0 td-filter-chips — removing (QĐ 12, 14)', () => {
  it('× by mouse: cancelable filter-remove { item, items } → chip removed (uncontrolled), announced', async () => {
    const el = await mk();
    const ev = record(el, 'filter-remove', (e) => expect(e.cancelable).to.equal(true));
    await click(x(el, 1));
    expect(ev.length).to.equal(1);
    expect(ev[0].item).to.deep.equal({ id: 'q', key: 'q', label: 'Tìm', value: 'iphone', removable: true });
    expect(ev[0].items.map((i) => i.id)).to.deep.equal(['status', 'brand']);
    expect(chips(el).map((li) => li.getAttribute('data-id'))).to.deep.equal(['status', 'brand']);
    expect(el.items.map((i) => i.id)).to.deep.equal(['status', 'brand']);
    await settle();
    expect(status(el)).to.equal('Đã bỏ lọc Tìm: iphone');
  });

  it('Enter / Space on ×: focus → next ×, then previous ×; the last one → empty-focus', async () => {
    const el = await mk(ITEMS(), 'empty-focus="search-q"');
    x(el, 1).focus();
    await sendKeys({ press: 'Enter' }); // remove "Tìm" → focus "Hãng" (next)
    expect(chips(el).length).to.equal(2);
    expect(document.activeElement === x(el, 1), 'next ×').to.equal(true);
    await sendKeys({ press: 'Space' }); // remove "Hãng" (last) → focus "Trạng thái" (previous)
    expect(chips(el).length).to.equal(1);
    expect(document.activeElement === x(el, 0), 'previous ×').to.equal(true);
    expect(clearBtn(el)).to.equal(null);
    await sendKeys({ press: 'Enter' }); // the only one → #search-q
    expect(chips(el).length).to.equal(0);
    expect(document.activeElement === document.getElementById('search-q'), 'empty-focus').to.equal(true);
    await raf();
    expect(el.hidden).to.equal(true);
  });

  it('no empty-focus: the host takes focus (tabindex -1) and stays visible until focus leaves', async () => {
    const el = await mk([{ key: 'q', label: 'Tìm', value: 'a' }]);
    x(el, 0).focus();
    await sendKeys({ press: 'Enter' });
    expect(document.activeElement === el, 'host focused').to.equal(true);
    expect(el.getAttribute('tabindex')).to.equal('-1');
    expect(el.hidden).to.equal(false);
    document.getElementById('search-q').focus();
    await raf();
    expect(el.hidden).to.equal(true);
    expect(el.hasAttribute('tabindex')).to.equal(false);
  });

  it('preventDefault → the chip stays, nothing announced', async () => {
    const el = await mk();
    record(el, 'filter-remove', (e) => e.preventDefault());
    x(el, 0).focus();
    await sendKeys({ press: 'Enter' });
    expect(chips(el).length).to.equal(3);
    await settle();
    expect(status(el)).to.equal('');
  });

  it('"Xoá tất cả": cancelable filter-clear { items, removed } → removable chips gone, fixed chip stays, focus → empty-focus', async () => {
    const el = await mk([{ key: 'kho', label: 'Kho', value: 'HN', removable: false }, ...ITEMS()], 'empty-focus="search-q"');
    const ev = record(el, 'filter-clear', (e) => expect(e.cancelable).to.equal(true));
    clearBtn(el).focus();
    await sendKeys({ press: 'Enter' });
    expect(ev.length).to.equal(1);
    expect(ev[0].items.map((i) => i.id)).to.deep.equal(['kho']);
    expect(ev[0].removed.map((i) => i.id)).to.deep.equal(['status', 'q', 'brand']);
    expect(chips(el).map((li) => li.getAttribute('data-id'))).to.deep.equal(['kho']);
    expect(clearBtn(el)).to.equal(null);
    expect(document.activeElement === document.getElementById('search-q')).to.equal(true);
    await settle();
    expect(status(el)).to.equal('Đã xoá tất cả bộ lọc');
    expect(el.hidden).to.equal(false); // the fixed chip is still shown
  });

  it('"Xoá tất cả" prevented → nothing changes', async () => {
    const el = await mk();
    record(el, 'filter-clear', (e) => e.preventDefault());
    await click(clearBtn(el));
    expect(chips(el).length).to.equal(3);
  });
});

describe('v0.39.0 td-filter-chips — links (QĐ 13)', () => {
  it('href → × is a link; not prevented → the browser follows it (the server computed the URL)', async () => {
    const el = await mk([{ key: 'q', label: 'Tìm', value: 'a', href: '#bo-loc-q' }, { key: 'b', value: '1', href: '#b' }], 'clear-href="#clear"');
    const ev = record(el, 'filter-remove');
    const a = x(el, 0);
    expect(a.localName).to.equal('a');
    expect(a.getAttribute('href')).to.equal('#bo-loc-q');
    expect(clearBtn(el).localName).to.equal('a');
    expect(clearBtn(el).getAttribute('href')).to.equal('#clear');
    await click(a);
    expect(ev.length).to.equal(1);
    expect(location.hash).to.equal('#bo-loc-q');
  });

  it('href + preventDefault → no navigation, chip kept', async () => {
    const el = await mk([{ key: 'q', label: 'Tìm', value: 'a', href: '#nav-q' }]);
    record(el, 'filter-remove', (e) => e.preventDefault());
    x(el, 0).focus();
    await sendKeys({ press: 'Enter' });
    expect(location.hash).to.equal('');
    expect(chips(el).length).to.equal(1);
  });

  it('unsafe clear-href → a button', async () => {
    const el = await mk(ITEMS(), 'clear-href="javascript:alert(1)"');
    expect(clearBtn(el).localName).to.equal('button');
  });
});

describe('v0.39.0 td-filter-chips — overflow (QĐ 15)', () => {
  const MANY = () => Array.from({ length: 9 }, (_, i) => ({ id: `t${i}`, key: 'tag', label: 'Nhãn', value: `Giá trị số ${i + 1}` }));

  it('≥ 480px: chips wrap (no horizontal scroll)', async () => {
    const el = await mk(MANY(), '', 600);
    const list = el.querySelector('.td-filter-chips__list');
    expect(getComputedStyle(list).flexWrap).to.equal('wrap');
    expect(list.scrollWidth).to.be.at.most(list.clientWidth + 1);
  });

  it('< 480px (360): one scrolling row, "Xoá tất cả" pinned visible, edge marks follow the scroll, page not widened', async () => {
    const el = await mk(MANY(), '', 360);
    await frames(2);
    const list = el.querySelector('.td-filter-chips__list');
    expect(getComputedStyle(list).flexWrap).to.equal('nowrap');
    expect(getComputedStyle(list).overflowX).to.equal('auto');
    expect(list.scrollWidth).to.be.greaterThan(list.clientWidth);
    const host = el.getBoundingClientRect();
    const c = clearBtn(el).getBoundingClientRect();
    expect(c.right).to.be.at.most(host.right + 0.5);
    expect(c.left).to.be.at.least(host.left - 0.5);
    expect(chips(el).every((li) => li.getBoundingClientRect().height < 40)).to.equal(true); // one line each
    expect(list.hasAttribute('data-scroll-end')).to.equal(true);
    expect(list.hasAttribute('data-scroll-start')).to.equal(false);
    list.scrollLeft = list.scrollWidth;
    await frames(2);
    expect(list.hasAttribute('data-scroll-start')).to.equal(true);
    expect(list.hasAttribute('data-scroll-end')).to.equal(false);
    expect(document.documentElement.scrollWidth).to.be.at.most(window.innerWidth);
  });

  it('a long value is cut with … at 16rem and keeps the full text in title', async () => {
    const long = 'Một giá trị bộ lọc rất dài '.repeat(6).trim();
    const el = await mk([{ key: 'q', label: 'Tìm', value: long }], '', 900);
    const v = el.querySelector('.td-filter-chips__value');
    expect(v.getAttribute('title')).to.equal(long);
    expect(v.getBoundingClientRect().width).to.be.at.most(16 * 16 + 1);
    expect(getComputedStyle(v).textOverflow).to.equal('ellipsis');
  });
});

describe('v0.39.0 td-filter-chips — API', () => {
  it('items set before connect win; labels are site-overridable', async () => {
    const saved = { ...TdFilterChips.labels };
    try {
      TdFilterChips.labels.remove = 'Remove {label} = {value}';
      const el = document.createElement('td-filter-chips');
      el.items = [{ key: 'q', label: 'Q', value: 'v' }];
      root.appendChild(el);
      expect(x(el, 0).getAttribute('aria-label')).to.equal('Remove Q = v');
    } finally {
      Object.assign(TdFilterChips.labels, saved);
    }
  });

  it('mouse in WebKit does not focus buttons: removal by mouse still keeps focus off <body> only when it was inside', async () => {
    const el = await mk();
    await click(x(el, 0));
    if (!IS_WEBKIT) expect(el.contains(document.activeElement)).to.equal(true);
    expect(chips(el).length).to.equal(2);
  });
});
