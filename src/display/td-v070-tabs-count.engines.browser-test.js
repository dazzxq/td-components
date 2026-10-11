import { expect } from '@esm-bundle/chai';
import { sendKeys, emulateMedia } from '@web/test-runner-commands';
import './td-tabs.js';
import { parseColor, contrast } from '../../test/tokens/color-parse.js';

// v0.70.0 (K9, plan docs/internal/plans/v0.70.0-tabs-counts.md) — the count pill of <td-tabs> in Chromium, Firefox AND WebKit:
// `count` / `tone` per tab, `setTabCount()` updating IN PLACE (same nodes, focus kept, no `tab-change`), the accessible name
// "Label, 12", the badge tone colours + contrast (light and dark), the one coalesced re-measure (overflow mode + indicator, also
// after a disconnect). Real signals only (document.fonts.ready, rAF). DOM nodes are compared as booleans (a failing chai
// assertion carrying DOM nodes hangs the runner).
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });
await document.fonts?.ready;

const raf = () => new Promise((r) => requestAnimationFrame(r));
async function settle(n = 3) { for (let i = 0; i < n; i++) await raf(); }
async function until(fn, ms = 3000, what = 'condition') {
  const t0 = performance.now();
  for (;;) {
    let v;
    try { v = fn(); } catch { v = false; }
    if (v) return v;
    if (performance.now() - t0 > ms) throw new Error(`timeout: ${what}`);
    await raf();
  }
}
const host = document.createElement('div');
document.body.appendChild(host);
afterEach(async () => {
  host.innerHTML = '';
  await emulateMedia({ forcedColors: 'none', reducedMotion: 'no-preference' });
});

const ORDERS = [
  { id: 'todo', label: 'Cần xử lý' }, { id: 'new', label: 'Mới' }, { id: 'confirmed', label: 'Đã xác nhận' },
  { id: 'packing', label: 'Đang đóng gói' }, { id: 'shipping', label: 'Đang giao' }, { id: 'done', label: 'Hoàn tất' },
  { id: 'cancelled', label: 'Đã hủy' }, { id: 'returned', label: 'Hàng hoàn về' }, { id: 'all', label: 'Tất cả' },
];
const clone = (tabs) => tabs.map((t) => ({ ...t }));

async function mount(tabs, { width = 900, attrs = {} } = {}) {
  const wrap = document.createElement('div');
  wrap.style.setProperty('width', `${width}px`);
  host.appendChild(wrap);
  const el = document.createElement('td-tabs');
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.tabs = tabs;
  wrap.appendChild(el);
  await settle();
  return { el, wrap };
}
const list = (el) => el.querySelector('.td-tabs');
const btns = (el) => [...el.querySelectorAll('.td-tabs__tab')];
const btn = (el, id) => btns(el).find((b) => b.dataset.tabId === id) || null;
const pill = (el, id) => btn(el, id)?.querySelector(':scope > .td-tabs__count') || null;
const pillText = (el, id) => {
  const p = pill(el, id);
  return p ? p.textContent.replace(/^, /, '') : null;
};
const indicatorFits = (el) => {
  const act = btn(el, el.getActiveTab());
  const w = parseFloat(list(el).style.getPropertyValue('--td-tabs-ind-w'));
  return Math.abs(w - act.getBoundingClientRect().width) < 0.6;
};
const probe = (varName, theme) => {
  const wrap = document.createElement('div');
  if (theme) wrap.setAttribute('data-td-theme', theme);
  const el = document.createElement('div');
  wrap.appendChild(el);
  host.appendChild(wrap);
  el.style.setProperty('color', `var(${varName})`);
  const c = getComputedStyle(el).color;
  wrap.remove();
  return c;
};

describe('v0.70.0 td-tabs count — markup and the data contract', () => {
  it('1. no `count` anywhere: no pill, and a tab is the 0.69 markup byte for byte', async () => {
    const { el } = await mount(clone(ORDERS));
    expect(el.querySelectorAll('.td-tabs__count').length).to.equal(0);
    const first = btns(el)[0];
    const expected = `<button type="button" role="tab" class="td-tabs__tab" id="${el.id}-tab-0" data-tab-id="todo" aria-selected="true" tabindex="0">`
      + '<span class="td-tabs__label" data-label="Cần xử lý">Cần xử lý</span></button>';
    expect(first.outerHTML).to.equal(expected);
  });

  it('2. count shapes: a number, 0, a string, and every "no count" value', async () => {
    const tabs = [
      { id: 'a', label: 'A', count: 12, tone: 'success' }, { id: 'b', label: 'B', count: 0 }, { id: 'c', label: 'C', count: '99+', tone: 'danger' },
      { id: 'd', label: 'D', count: null }, { id: 'e', label: 'E', count: undefined }, { id: 'f', label: 'F', count: '' },
      { id: 'g', label: 'G', count: '   ' }, { id: 'h', label: 'H', count: NaN }, { id: 'i', label: 'I', count: Infinity },
      { id: 'j', label: 'J', count: true }, { id: 'k', label: 'K', count: { n: 1 } }, { id: 'l', label: 'L', count: '1.234' },
    ];
    const { el } = await mount(tabs);
    expect(pillText(el, 'a')).to.equal('12');
    expect(pill(el, 'a').dataset.tone).to.equal('success');
    expect(pillText(el, 'b')).to.equal('0');
    expect(pill(el, 'b').dataset.tone, 'no tone → neutral').to.equal('neutral');
    expect(pillText(el, 'c')).to.equal('99+');
    expect(pillText(el, 'l')).to.equal('1.234');
    for (const id of ['d', 'e', 'f', 'g', 'h', 'i', 'j', 'k']) expect(pill(el, id), `${id}: no pill`).to.equal(null);
  });

  it('3. an unknown tone is neutral; a long string is displayed verbatim (never cut); a tone without a count draws nothing', async () => {
    const long = 'Hơn 12.345.678 đơn';
    const { el } = await mount([{ id: 'a', label: 'A', count: 3, tone: 'purple' }, { id: 'b', label: 'B', count: long, tone: 'info' },
      { id: 'c', label: 'C', tone: 'danger' }]);
    expect(pill(el, 'a').dataset.tone).to.equal('neutral');
    expect(pillText(el, 'b')).to.equal(long);
    expect(pill(el, 'c')).to.equal(null);
    // a tone given WITHOUT a count is dropped: the first count that arrives later (no tone passed) starts neutral, not 'danger'
    el.setTabCount('c', 5);
    expect(pill(el, 'c').dataset.tone).to.equal('neutral');
    el.setTabCount('b', null); // and the tone of a cleared pill is forgotten too
    el.setTabCount('b', 2);
    expect(pill(el, 'b').dataset.tone).to.equal('neutral');
    // an accessor-backed tab object is read once per field: count and tone cannot disagree
    let reads = 0;
    const flaky = { id: 'd', label: 'D', get count() { reads += 1; return reads === 1 ? 3 : ''; }, tone: 'warning' };
    el.tabs = [flaky];
    await settle();
    expect(reads, 'count read once').to.equal(1);
    expect(pillText(el, 'd')).to.equal('3');
    expect(pill(el, 'd').dataset.tone).to.equal('warning');
  });

  it('4. accessible name = "Label, 12" from the content (no aria-label, the pill is not aria-hidden); no count → just the label', async () => {
    const { el } = await mount([{ id: 'done', label: 'Hoàn tất', count: 12, tone: 'success' }, { id: 'all', label: 'Tất cả' }]);
    const b = btn(el, 'done');
    expect(b.textContent.replace(/\s+/g, ' ').trim()).to.equal('Hoàn tất, 12');
    expect(b.hasAttribute('aria-label')).to.equal(false);
    expect(pill(el, 'done').hasAttribute('aria-hidden')).to.equal(false);
    expect(btn(el, 'all').textContent.trim()).to.equal('Tất cả');
    if ('computedName' in b) expect(b.computedName).to.equal('Hoàn tất, 12'); // Chromium with the accessibility tree exposed
    // the separator is hidden by clipping (it must stay in the name): never display:none / visibility:hidden
    const sep = pill(el, 'done').querySelector('.td-tabs__count-sep');
    const cs = getComputedStyle(sep);
    expect(cs.display === 'none' || cs.visibility === 'hidden', 'the separator is not removed from the name').to.equal(false);
    const r = sep.getBoundingClientRect();
    expect(r.width <= 1.01 && r.height <= 1.01, 'the separator is 1px').to.equal(true);
  });

  it('5. XSS: a count that looks like HTML is text; a tone that looks like an attribute breaks nothing', async () => {
    const { el } = await mount([{ id: 'a', label: 'A', count: '<img src=x onerror="window.__tdXss=1">', tone: 'x" onmouseover="window.__tdXss=2' }]);
    expect(pillText(el, 'a')).to.equal('<img src=x onerror="window.__tdXss=1">');
    expect(el.querySelectorAll('img').length).to.equal(0);
    expect(pill(el, 'a').dataset.tone).to.equal('neutral');
    expect(pill(el, 'a').hasAttribute('onmouseover')).to.equal(false);
    expect(window.__tdXss).to.equal(undefined);
    el.setTabCount('a', '<b>9</b>', 'info');
    expect(pillText(el, 'a')).to.equal('<b>9</b>');
    expect(el.querySelectorAll('b').length).to.equal(0);
  });
});

describe('v0.70.0 td-tabs count — setTabCount updates in place', () => {
  it('6. creates, retexts, retones and clears a pill; the tablist and the buttons stay the very same nodes', async () => {
    const { el } = await mount(clone(ORDERS));
    const l = list(el);
    const before = btns(el);
    expect(el.setTabCount('done', 12, 'success')).to.equal(true);
    expect(pillText(el, 'done')).to.equal('12');
    expect(pill(el, 'done').dataset.tone).to.equal('success');
    const p1 = pill(el, 'done');
    el.setTabCount('done', 13); // tone omitted → kept
    expect(pillText(el, 'done')).to.equal('13');
    expect(pill(el, 'done').dataset.tone, 'an omitted tone keeps the current one').to.equal('success');
    expect(pill(el, 'done') === p1, 'the pill node is reused').to.equal(true);
    el.setTabCount('done', 13, 'neutral');
    expect(pill(el, 'done').dataset.tone, "'neutral' resets it").to.equal('neutral');
    el.setTabCount('done', 0, 'warning');
    expect(pillText(el, 'done'), '0 is a count').to.equal('0');
    el.setTabCount('done', null); // the async "unknown" state
    expect(pill(el, 'done'), 'null clears the pill').to.equal(null);
    el.setTabCount('done', 5); // back again: the old tone was forgotten
    expect(pill(el, 'done').dataset.tone).to.equal('neutral');
    el.setTabCount('done', '');
    expect(pill(el, 'done')).to.equal(null);
    el.setTabCount('done', undefined);
    expect(pill(el, 'done')).to.equal(null);
    expect(list(el) === l, 'the same tablist node').to.equal(true);
    expect(btns(el).every((b, i) => b === before[i]), 'the same button nodes').to.equal(true);
  });

  it('7. an unknown id returns false and changes nothing; the other tabs are untouched', async () => {
    const { el } = await mount([{ id: 'a', label: 'A', count: 1 }, { id: 'b', label: 'B' }]);
    const html = el.innerHTML;
    expect(el.setTabCount('nope', 5)).to.equal(false);
    expect(el.setTabCount(null, 5)).to.equal(false);
    expect(el.setTabCount(undefined, 5)).to.equal(false);
    expect(el.innerHTML).to.equal(html);
    el.setTabCount('b', 2);
    expect(pillText(el, 'a')).to.equal('1');
  });

  it('8. focus, the selected tab and the roving tabindex survive an update; no tab-change is fired', async () => {
    const { el } = await mount(clone(ORDERS));
    const events = [];
    el.addEventListener('tab-change', (e) => events.push(e.detail.tabId));
    btn(el, 'todo').focus();
    await sendKeys({ press: 'ArrowRight' });
    await sendKeys({ press: 'ArrowRight' });
    const focused = btn(el, 'confirmed');
    expect(document.activeElement === focused, 'focus moved to a NON-selected tab').to.equal(true);
    expect(el.getActiveTab()).to.equal('todo');
    el.setTabCount('done', 7, 'info'); // another tab
    el.setTabCount('confirmed', 4, 'warning'); // the focused one
    el.setTabCount('todo', 9, 'danger'); // the selected one
    await settle();
    expect(document.activeElement === focused, 'focus is still on the same button').to.equal(true);
    expect(el.getActiveTab()).to.equal('todo');
    expect(btn(el, 'todo').getAttribute('aria-selected')).to.equal('true');
    expect(btn(el, 'confirmed').getAttribute('tabindex')).to.equal('0');
    expect(btn(el, 'todo').getAttribute('tabindex')).to.equal('-1');
    expect(events.length, 'no tab-change').to.equal(0);
  });

  it('9. keyboard still works with pills: arrows, Home, End, Enter', async () => {
    const { el } = await mount(clone(ORDERS).map((t, i) => ({ ...t, count: i, tone: 'info' })));
    const events = [];
    el.addEventListener('tab-change', (e) => events.push(e.detail.tabId));
    btn(el, 'todo').focus();
    await sendKeys({ press: 'End' });
    expect(document.activeElement === btn(el, 'all')).to.equal(true);
    await sendKeys({ press: 'Home' });
    await sendKeys({ press: 'ArrowRight' });
    expect(document.activeElement === btn(el, 'new')).to.equal(true);
    await sendKeys({ press: 'Enter' });
    expect(events).to.deep.equal(['new']);
    expect(el.getActiveTab()).to.equal('new');
    expect(indicatorFits(el), 'the indicator follows the tab with a pill').to.equal(true);
  });

  it('10. assigning `tabs` rebuilds with the new counts (they win over setTabCount); the getter returns the assigned array', async () => {
    const { el } = await mount([{ id: 'a', label: 'A', count: 1 }, { id: 'b', label: 'B' }]);
    el.setTabCount('b', 7, 'danger');
    const next = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B', count: 2, tone: 'info' }];
    el.tabs = next;
    await settle();
    expect(pill(el, 'a')).to.equal(null);
    expect(pillText(el, 'b')).to.equal('2');
    expect(pill(el, 'b').dataset.tone).to.equal('info');
    expect(el.tabs === next, 'the getter returns what was assigned').to.equal(true);
    expect('count' in next[0], 'setTabCount never writes into the caller array').to.equal(false);
  });

  it('11. a count set BEFORE the element renders is drawn by the first render', async () => {
    const el = document.createElement('td-tabs');
    el.tabs = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }];
    expect(el.setTabCount('b', 3, 'warning')).to.equal(true);
    const wrap = document.createElement('div');
    wrap.appendChild(el);
    host.appendChild(wrap);
    await settle();
    expect(pillText(el, 'b')).to.equal('3');
    expect(pill(el, 'b').dataset.tone).to.equal('warning');
  });
});

describe('v0.70.0 td-tabs count — layout, overflow, indicator', () => {
  for (const size of ['md', 'sm']) {
    it(`12. (${size}) the pill sits on the label's row, nothing wraps, the tab does not grow, digits are tabular`, async () => {
      const plain = await mount([{ id: 'a', label: 'Hoàn tất' }, { id: 'b', label: 'Đã hủy' }], { attrs: { size } });
      const hPlain = btn(plain.el, 'a').getBoundingClientRect().height;
      host.innerHTML = '';
      const { el } = await mount([{ id: 'a', label: 'Hoàn tất', count: 1234 }, { id: 'b', label: 'Đã hủy', count: 5 }], { attrs: { size } });
      const b = btn(el, 'a');
      const p = pill(el, 'a');
      const lab = b.querySelector('.td-tabs__label').getBoundingClientRect();
      const pr = p.getBoundingClientRect();
      expect(Math.abs((pr.top + pr.bottom) / 2 - (lab.top + lab.bottom) / 2), 'same row (centres)').to.be.below(2);
      expect(pr.left >= lab.right - 0.5, 'after the label').to.equal(true);
      expect(Math.abs(b.getBoundingClientRect().height - hPlain), 'the tab height is unchanged').to.be.below(1.01);
      const cs = getComputedStyle(p);
      expect(cs.whiteSpace).to.equal('nowrap');
      expect(cs.fontVariantNumeric).to.contain('tabular-nums');
      expect(cs.flexShrink).to.equal('0');
      expect(pr.height).to.be.below(24);
    });
  }

  it('13. a long count widens its tab and switches the row to the scroll mode; clearing it brings the equal slots back', async () => {
    const { el } = await mount([{ id: 'a', label: 'Mới' }, { id: 'b', label: 'Đã hủy' }, { id: 'c', label: 'Tất cả' }], { width: 300 });
    expect(list(el).hasAttribute('data-overflow')).to.equal(false);
    el.setTabCount('b', '1.234.567.890 đơn hàng đang chờ', 'danger');
    await until(() => list(el).hasAttribute('data-overflow'), 3000, 'overflow mode after a long count');
    await settle();
    expect(indicatorFits(el)).to.equal(true);
    el.setTabCount('b', null);
    await until(() => !list(el).hasAttribute('data-overflow'), 3000, 'equal slots again');
  });

  it('14. several setTabCount calls in one tick end in the right state with ONE re-measure (counts of the 9 order tabs)', async () => {
    const { el } = await mount(clone(ORDERS), { width: 1100 });
    let measures = 0;
    // _measure() adds then removes `data-measuring` in ONE task: the records tell them apart (an add has no old value)
    const mo = new MutationObserver((records) => {
      for (const r of records) if (r.oldValue === null) measures += 1;
    });
    mo.observe(list(el), { attributes: true, attributeOldValue: true, attributeFilter: ['data-measuring'] });
    const tones = ['danger', 'info', 'info', 'warning', 'info', 'success', 'neutral', 'danger', 'neutral'];
    ORDERS.forEach((t, i) => el.setTabCount(t.id, (i + 1) * 11, tones[i]));
    await settle(4);
    mo.disconnect();
    expect(measures, 'one coalesced measure pass').to.equal(1);
    ORDERS.forEach((t, i) => {
      expect(pillText(el, t.id)).to.equal(String((i + 1) * 11));
      expect(pill(el, t.id).dataset.tone).to.equal(tones[i]);
    });
    expect(indicatorFits(el)).to.equal(true);
  });

  it('15. a count set right after setActiveTab (indicator frame pending) leaves the indicator on the new tab', async () => {
    const { el } = await mount([{ id: 'a', label: 'Mới' }, { id: 'b', label: 'Đang giao' }, { id: 'c', label: 'Tất cả' }]);
    el.setActiveTab('b');
    el.setTabCount('b', '1.234.567', 'info');
    el.setTabCount('a', 3);
    await settle(4);
    expect(el.getActiveTab()).to.equal('b');
    expect(indicatorFits(el), 'the indicator is as wide as the (now wider) active tab').to.equal(true);
    const lr = list(el).getBoundingClientRect();
    const br = btn(el, 'b').getBoundingClientRect();
    const x = parseFloat(list(el).style.getPropertyValue('--td-tabs-ind-x'));
    expect(Math.abs(x - (br.left - lr.left - list(el).clientLeft + list(el).scrollLeft))).to.be.below(0.6);
  });

  it('16. a count set while the element is DISCONNECTED is measured on reconnect (overflow mode + indicator)', async () => {
    const { el, wrap } = await mount([{ id: 'a', label: 'Mới' }, { id: 'b', label: 'Đã hủy' }, { id: 'c', label: 'Tất cả' }], { width: 300 });
    expect(list(el).hasAttribute('data-overflow')).to.equal(false);
    el.remove();
    expect(el.setTabCount('b', '1.234.567.890 đơn hàng đang chờ xử lý', 'warning')).to.equal(true);
    await settle(2);
    wrap.appendChild(el);
    await until(() => list(el).hasAttribute('data-overflow'), 3000, 'overflow after reconnect');
    await settle();
    expect(indicatorFits(el)).to.equal(true);
  });

  it('17. removed while the coalesced re-measure was pending, then re-attached: still measured', async () => {
    const { el, wrap } = await mount([{ id: 'a', label: 'Mới' }, { id: 'b', label: 'Đã hủy' }, { id: 'c', label: 'Tất cả' }], { width: 300 });
    el.setTabCount('b', '1.234.567.890 đơn hàng đang chờ xử lý', 'warning'); // a frame is pending now
    el.remove(); // cancelled, but the debt is kept
    wrap.appendChild(el);
    await until(() => list(el).hasAttribute('data-overflow'), 3000, 'overflow after the re-attach');
    await settle();
    expect(indicatorFits(el)).to.equal(true);
  });
});

describe('v0.70.0 td-tabs count — colours, contrast, forced colours', () => {
  const TONES = ['neutral', 'info', 'success', 'warning', 'danger'];
  for (const theme of ['light', 'dark']) {
    it(`18. (${theme}) each tone paints its td-badge pair; label on fill ≥ 4.5:1; the pill keeps its colours when the tab is selected`, async () => {
      const wrap = document.createElement('div');
      wrap.setAttribute('data-td-theme', theme);
      host.appendChild(wrap);
      const el = document.createElement('td-tabs');
      el.tabs = TONES.map((tone) => ({ id: tone, label: tone, count: 8, tone }));
      wrap.appendChild(el);
      await settle();
      for (const tone of TONES) {
        const p = pill(el, tone);
        const cs = getComputedStyle(p);
        const wantBg = probe(`--td-badge-${tone}-bg`, theme);
        const wantFg = probe(`--td-badge-${tone}-fg`, theme);
        expect(cs.backgroundColor, `${theme} ${tone} fill`).to.equal(wantBg);
        expect(cs.color, `${theme} ${tone} label`).to.equal(wantFg);
        expect(contrast(parseColor(cs.color), parseColor(cs.backgroundColor)), `${theme} ${tone} contrast`).to.be.at.least(4.5);
      }
      const before = getComputedStyle(pill(el, 'info')).backgroundColor;
      el.setActiveTab('info');
      await settle();
      expect(getComputedStyle(pill(el, 'info')).backgroundColor, 'selected tab: same fill').to.equal(before);
    });
  }

  it('19. forced colours: the pill keeps a visible edge', async () => {
    await emulateMedia({ forcedColors: 'active' });
    const { el } = await mount([{ id: 'a', label: 'A', count: 3, tone: 'success' }]);
    const cs = getComputedStyle(pill(el, 'a'));
    expect(parseFloat(cs.borderTopWidth)).to.be.at.least(1);
    expect(cs.borderTopStyle).to.equal('solid');
  });
});
