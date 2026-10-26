import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';
import { TdTabs } from './td-tabs.js';

// v0.83.0 (plan docs/internal/plans/v0.83.0-tabs-links.md) — td-tabs link mode in Chromium, Firefox AND WebKit: `href` →
// <nav> of <a class="td-tabs__tab">, the href gate, the current tab (explicit → URL → none; `match-hash` opt-in), popstate /
// hashchange, the cancelable `tab-click`, `<a>` children upgrade (incl. late definition), count + overflow, and the tablist
// mode unchanged. The URL is moved with history.replaceState inside the SAME document (search kept, never navigates away)
// and restored after every test. DOM nodes are compared as booleans (a failing chai assertion carrying DOM nodes hangs the
// runner).
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });
await document.fonts?.ready;

const ORIGINAL_URL = location.href;
const SEARCH = location.search; // kept on every replaceState: the runner's session id lives there
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
/** Move the URL in place (no navigation): `path` + the original search + `hash`. */
const go = (path, hash = '') => history.replaceState(null, '', `${path}${SEARCH}${hash}`);
const popstate = () => window.dispatchEvent(new PopStateEvent('popstate'));
const hashchange = () => window.dispatchEvent(new HashChangeEvent('hashchange'));

const host = document.createElement('div');
document.body.appendChild(host);
afterEach(() => {
  host.innerHTML = '';
  history.replaceState(null, '', ORIGINAL_URL);
});

async function mount(tabs, { width = 900, attrs = {} } = {}) {
  const wrap = document.createElement('div');
  wrap.style.setProperty('width', `${width}px`);
  host.appendChild(wrap);
  const el = document.createElement('td-tabs');
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.tabs = tabs;
  wrap.appendChild(el);
  await settle();
  return el;
}
const list = (el) => el.querySelector(':scope > .td-tabs');
const tabsOf = (el) => [...el.querySelectorAll('.td-tabs__tab')];
const tab = (el, id) => tabsOf(el).find((b) => b.dataset.tabId === id) || null;
const currentIds = (el) => tabsOf(el).filter((a) => a.getAttribute('aria-current') === 'page').map((a) => a.dataset.tabId);
const indicatorShown = (el) => getComputedStyle(el.querySelector('.td-tabs__indicator')).display !== 'none';
const indicatorOn = (el, id) => {
  const w = parseFloat(list(el).style.getPropertyValue('--td-tabs-ind-w'));
  return list(el).getAttribute('data-state') === 'ready' && Math.abs(w - tab(el, id).getBoundingClientRect().width) < 0.6;
};

const SETTINGS = [
  { id: 'telegram', label: 'Telegram', href: '/system/settings/telegram' },
  { id: 'sepay', label: 'SePay', href: '/system/settings/sepay' },
  { id: 'ghtk', label: 'GHTK', href: '/system/settings/ghtk' },
];
const SECTIONS = [
  { id: 'page', label: 'Trang', href: '/form' },
  { id: 'info', label: 'Thông tin', href: '#info' },
  { id: 'seo', label: 'SEO', href: '#seo' },
];

describe('v0.83.0 td-tabs links — markup, gate, name', () => {
  it('1. href → <nav> of <a class="td-tabs__tab" href>; no tab roles, no aria-selected, no tabindex', async () => {
    const el = await mount(SETTINGS);
    const nav = list(el);
    expect(nav.tagName).to.equal('NAV');
    expect(nav.className).to.equal('td-tabs td-tabs--md');
    expect(nav.hasAttribute('role')).to.equal(false);
    const as = tabsOf(el);
    expect(as.map((a) => a.tagName)).to.deep.equal(['A', 'A', 'A']);
    expect(as.map((a) => a.getAttribute('href'))).to.deep.equal(SETTINGS.map((t) => t.href));
    for (const a of as) {
      expect(a.hasAttribute('role')).to.equal(false);
      expect(a.hasAttribute('aria-selected')).to.equal(false);
      expect(a.hasAttribute('tabindex')).to.equal(false);
      expect(a.hasAttribute('id')).to.equal(false);
      expect(getComputedStyle(a).textDecorationLine).to.equal('none');
    }
  });

  it('2. nav name: default "Điều hướng phụ", host aria-label, host aria-labelledby (and live changes)', async () => {
    const el = await mount(SETTINGS);
    expect(list(el).getAttribute('aria-label')).to.equal('Điều hướng phụ');
    el.setAttribute('aria-label', 'Cài đặt');
    expect(list(el).getAttribute('aria-label')).to.equal('Cài đặt');
    el.setAttribute('aria-labelledby', 'some-heading');
    expect(list(el).getAttribute('aria-labelledby')).to.equal('some-heading');
    expect(list(el).hasAttribute('aria-label')).to.equal(false);
  });

  it('3. gate: javascript: / data: hrefs drop the tab (one warn); #x, /a, ?q=1, https:// kept as written', async () => {
    const warns = [];
    const orig = console.warn;
    console.warn = (...a) => warns.push(a.join(' '));
    let el;
    try {
      el = await mount([
        { id: 'js', label: 'JS', href: 'javascript:alert(1)' },
        { id: 'data', label: 'Data', href: 'data:text/html,x' },
        { id: 'hash', label: 'Hash', href: '  #x ' },
        { id: 'path', label: 'Path', href: '/a' },
        { id: 'query', label: 'Query', href: '?q=1' },
        { id: 'abs', label: 'Abs', href: 'https://example.com/a?b=1&c=2' },
        { id: 'none', label: 'No href' },
      ]);
    } finally {
      console.warn = orig;
    }
    expect(tabsOf(el).map((a) => a.dataset.tabId)).to.deep.equal(['hash', 'path', 'query', 'abs']);
    expect(tabsOf(el).map((a) => a.getAttribute('href'))).to.deep.equal(['#x', '/a', '?q=1', 'https://example.com/a?b=1&c=2']);
    expect(warns.length).to.equal(1);
    expect(warns[0]).to.contain('3');
  });

  it('4. only refused hrefs → tablist mode (no link, no warn)', async () => {
    const orig = console.warn;
    let warned = 0;
    console.warn = () => { warned++; };
    let el;
    try {
      el = await mount([{ id: 'a', label: 'A', href: 'javascript:void 0' }, { id: 'b', label: 'B' }]);
    } finally {
      console.warn = orig;
    }
    expect(warned).to.equal(0);
    expect(list(el).getAttribute('role')).to.equal('tablist');
    expect(tabsOf(el).every((b) => b.tagName === 'BUTTON')).to.equal(true);
  });

  it('5. no href anywhere → the tablist DOM of v0.82.0 (regression)', async () => {
    const el = await mount([{ id: 'a', label: 'A', panel: 'nope' }, { id: 'b', label: 'B' }]);
    const l = list(el);
    expect(l.tagName).to.equal('DIV');
    expect(l.getAttribute('role')).to.equal('tablist');
    expect(l.getAttribute('aria-label')).to.equal('Các thẻ');
    const [a, b] = tabsOf(el);
    expect(a.outerHTML).to.equal(`<button type="button" role="tab" class="td-tabs__tab" id="${el.id}-tab-0" data-tab-id="a" `
      + 'aria-selected="true" tabindex="0" aria-controls="nope"><span class="td-tabs__label" data-label="A">A</span></button>');
    expect(b.getAttribute('aria-selected')).to.equal('false');
    expect(b.hasAttribute('aria-current')).to.equal(false);
  });
});

describe('v0.83.0 td-tabs links — the current tab from the URL', () => {
  it('6. pathname match; one trailing slash ignored; search ignored', async () => {
    go('/system/settings/sepay');
    let el = await mount(SETTINGS);
    expect(currentIds(el)).to.deep.equal(['sepay']);
    expect(el.getActiveTab()).to.equal('sepay');
    expect(indicatorOn(el, 'sepay')).to.equal(true);
    host.innerHTML = '';
    go('/system/settings/ghtk/');
    el = await mount(SETTINGS);
    expect(currentIds(el)).to.deep.equal(['ghtk']);
    host.innerHTML = '';
    go('/system/settings/telegram');
    el = await mount([{ id: 'q', label: 'Q', href: '/system/settings/telegram?tab=2' }]);
    expect(currentIds(el)).to.deep.equal(['q']);
  });

  it('7. no match (also no prefix match) → no aria-current, no data-state, the indicator hidden', async () => {
    go('/system/settings/sepay/webhooks');
    const el = await mount(SETTINGS);
    expect(currentIds(el)).to.deep.equal([]);
    expect(el.getActiveTab()).to.equal(null);
    expect(list(el).hasAttribute('data-state')).to.equal(false);
    expect(indicatorShown(el)).to.equal(false);
  });

  it('8. several matches → the first one', async () => {
    go('/x');
    const el = await mount([{ id: 'a', label: 'A', href: '/y' }, { id: 'b', label: 'B', href: '/x' }, { id: 'c', label: 'C', href: '/x/' }]);
    expect(currentIds(el)).to.deep.equal(['b']);
  });

  it('9. popstate re-matches silently (no tab-change)', async () => {
    go('/system/settings/telegram');
    const el = await mount(SETTINGS);
    let fired = 0;
    el.addEventListener('tab-change', () => fired++);
    go('/system/settings/ghtk');
    popstate();
    expect(currentIds(el)).to.deep.equal(['ghtk']);
    await settle();
    expect(indicatorOn(el, 'ghtk')).to.equal(true);
    go('/elsewhere');
    popstate();
    expect(currentIds(el)).to.deep.equal([]);
    expect(indicatorShown(el)).to.equal(false);
    expect(fired).to.equal(0);
  });
});

describe('v0.83.0 td-tabs links — hash (match-hash)', () => {
  it('10. default off: a #x href never matches, even with location.hash === "#x"; the path link is the current one', async () => {
    go('/form', '#info');
    const el = await mount(SECTIONS);
    expect(currentIds(el)).to.deep.equal(['page']);
    hashchange();
    expect(currentIds(el)).to.deep.equal(['page']);
  });

  it('11. match-hash: exact hash wins over the path link; a wrong / no hash falls back to the path link', async () => {
    go('/form', '#seo');
    const el = await mount(SECTIONS, { attrs: { 'match-hash': '' } });
    expect(currentIds(el)).to.deep.equal(['seo']);
    go('/form', '#other');
    hashchange();
    expect(currentIds(el)).to.deep.equal(['page']);
    go('/form');
    hashchange();
    expect(currentIds(el)).to.deep.equal(['page']);
  });

  it('12. hashchange changes the current tab silently (a real location.hash change)', async () => {
    go('/form');
    const el = await mount(SECTIONS, { attrs: { 'match-hash': '' } });
    let fired = 0;
    el.addEventListener('tab-change', () => fired++);
    location.hash = '#info';
    await until(() => currentIds(el)[0] === 'info', 3000, 'hashchange → info');
    await settle();
    expect(indicatorOn(el, 'info')).to.equal(true);
    expect(fired).to.equal(0);
  });

  it('13. match-hash added / removed after connect → aria-current + indicator change at once (and the listener follows)', async () => {
    go('/form', '#info');
    const el = await mount(SECTIONS);
    expect(currentIds(el)).to.deep.equal(['page']);
    el.setAttribute('match-hash', '');
    expect(currentIds(el)).to.deep.equal(['info']);
    await settle();
    expect(indicatorOn(el, 'info')).to.equal(true);
    go('/form', '#seo');
    hashchange();
    expect(currentIds(el)).to.deep.equal(['seo']);
    el.matchHash = false; // boolean property
    expect(el.hasAttribute('match-hash')).to.equal(false);
    expect(currentIds(el)).to.deep.equal(['page']);
    go('/form', '#info');
    hashchange(); // no hashchange listener any more — and a #x link cannot match anyway
    expect(currentIds(el)).to.deep.equal(['page']);
  });

  it('14. link tabs assigned after connect (from tablist) still listen (popstate + hashchange)', async () => {
    go('/form', '#info');
    const el = await mount([{ id: 'a', label: 'A' }], { attrs: { 'match-hash': '' } });
    expect(list(el).getAttribute('role')).to.equal('tablist');
    el.tabs = SECTIONS;
    expect(list(el).tagName).to.equal('NAV');
    expect(currentIds(el)).to.deep.equal(['info']);
    go('/form', '#seo');
    hashchange();
    expect(currentIds(el)).to.deep.equal(['seo']);
    go('/nowhere');
    popstate();
    expect(currentIds(el)).to.deep.equal([]);
  });
});

describe('v0.83.0 td-tabs links — the explicit current tab', () => {
  it('15. active-tab wins over the URL; removing it matches the URL again (silently)', async () => {
    go('/system/settings/telegram');
    const el = await mount(SETTINGS, { attrs: { 'active-tab': 'ghtk' } });
    let fired = 0;
    el.addEventListener('tab-change', () => fired++);
    expect(currentIds(el)).to.deep.equal(['ghtk']);
    el.setAttribute('active-tab', 'sepay');
    expect(currentIds(el)).to.deep.equal(['sepay']);
    el.removeAttribute('active-tab');
    expect(currentIds(el)).to.deep.equal(['telegram']);
    expect(fired).to.equal(0);
  });

  it('16. setActiveTab(id) fires tab-change + onChange and survives popstate / hashchange; unknown id is ignored', async () => {
    go('/form', '#info');
    const el = await mount(SECTIONS, { attrs: { 'match-hash': '' } });
    const events = [];
    const calls = [];
    el.addEventListener('tab-change', (e) => events.push(e.detail.tabId));
    el.onChange = (id) => calls.push(id);
    el.setActiveTab('seo');
    expect(currentIds(el)).to.deep.equal(['seo']);
    expect(events).to.deep.equal(['seo']);
    expect(calls).to.deep.equal(['seo']);
    go('/form', '#info');
    hashchange();
    popstate();
    expect(currentIds(el)).to.deep.equal(['seo']);
    el.setActiveTab('nope');
    expect(currentIds(el)).to.deep.equal(['seo']);
    el.setActiveTab('seo'); // no change → no event
    expect(events).to.deep.equal(['seo']);
  });

  it('17. setActiveTab(null) and syncFromLocation() go back to the URL (silently)', async () => {
    go('/system/settings/telegram');
    const el = await mount(SETTINGS);
    let fired = 0;
    el.setActiveTab('ghtk');
    el.addEventListener('tab-change', () => fired++);
    el.setActiveTab(null);
    expect(currentIds(el)).to.deep.equal(['telegram']);
    el.setActiveTab('sepay');
    expect(fired).to.equal(1);
    go('/system/settings/ghtk'); // a SPA pushState fires nothing…
    el.syncFromLocation(); // …the site re-syncs
    expect(currentIds(el)).to.deep.equal(['ghtk']);
    expect(fired).to.equal(1);
    go('/system/settings/sepay');
    popstate(); // no explicit tab any more → follows the URL
    expect(currentIds(el)).to.deep.equal(['sepay']);
  });

  it('18. assigning tabs keeps the explicit id when it still exists, forgets it otherwise', async () => {
    go('/system/settings/telegram');
    const el = await mount(SETTINGS);
    el.setActiveTab('ghtk');
    el.tabs = SETTINGS.map((t) => ({ ...t }));
    expect(currentIds(el)).to.deep.equal(['ghtk']);
    el.tabs = SETTINGS.filter((t) => t.id !== 'ghtk');
    expect(currentIds(el)).to.deep.equal(['telegram']);
    el.tabs = SETTINGS.map((t) => ({ ...t })); // ghtk is back but the explicit choice was forgotten
    expect(currentIds(el)).to.deep.equal(['telegram']);
  });
});

describe('v0.83.0 td-tabs links — click and keyboard', () => {
  it('19. tab-click is bubbles + composed + cancelable with { tabId, href, event }; not cancelled → the click is native', async () => {
    go('/form');
    const el = await mount(SECTIONS);
    let got = null;
    let clickPrevented = null;
    host.addEventListener('tab-click', (e) => { got = e; }, { once: true });
    document.addEventListener('click', (e) => { clickPrevented = e.defaultPrevented; }, { once: true });
    tab(el, 'info').click();
    expect(got !== null).to.equal(true);
    expect([got.bubbles, got.composed, got.cancelable]).to.deep.equal([true, true, true]);
    expect(got.detail.tabId).to.equal('info');
    expect(got.detail.href).to.equal('#info');
    expect(got.detail.event instanceof MouseEvent).to.equal(true);
    expect(clickPrevented).to.equal(false);
    await until(() => location.hash === '#info', 3000, 'native hash navigation'); // same document (Firefox: async)
  });

  it('20. a cancelled tab-click prevents the click; the current tab does not change on click', async () => {
    go('/form');
    const el = await mount(SECTIONS, { attrs: { 'match-hash': '' } });
    let clickPrevented = null;
    el.addEventListener('tab-click', (e) => e.preventDefault(), { once: true });
    document.addEventListener('click', (e) => { clickPrevented = e.defaultPrevented; }, { once: true });
    tab(el, 'seo').click();
    expect(clickPrevented).to.equal(true);
    await settle();
    expect(location.hash).to.equal('');
    expect(currentIds(el)).to.deep.equal(['page']);
  });

  it('21. arrows / Home / End do nothing: focus stays on the link (plain Tab stops)', async () => {
    go('/form');
    const el = await mount(SECTIONS);
    tab(el, 'page').focus();
    await sendKeys({ press: 'ArrowRight' });
    expect(document.activeElement === tab(el, 'page')).to.equal(true);
    await sendKeys({ press: 'End' });
    expect(document.activeElement === tab(el, 'page')).to.equal(true);
    expect(currentIds(el)).to.deep.equal(['page']);
  });
});

describe('v0.83.0 td-tabs links — <a> children upgrade', () => {
  it('22. server-rendered <a> children → tabs (id / label / href / count / tone / icon), aria-current → active-tab', async () => {
    go('/somewhere-else');
    const wrap = document.createElement('div');
    wrap.style.setProperty('width', '900px');
    host.appendChild(wrap);
    wrap.innerHTML = '<td-tabs aria-label="Cài đặt">'
      + '<a href="/s/telegram" data-tab-id="telegram" data-icon="link"> Telegram </a>'
      + '<a href="/s/sepay" aria-current="page" data-count="3" data-tone="danger">SePay</a>'
      + '<a href="javascript:alert(1)">Bad</a>'
      + '<span>not a link</span>'
      + '</td-tabs>';
    await settle();
    const el = wrap.firstElementChild;
    expect(list(el).tagName).to.equal('NAV');
    expect(tabsOf(el).map((a) => a.dataset.tabId)).to.deep.equal(['telegram', '1']);
    expect(tabsOf(el).map((a) => a.getAttribute('href'))).to.deep.equal(['/s/telegram', '/s/sepay']);
    expect(tabsOf(el).map((a) => a.querySelector('.td-tabs__label').textContent)).to.deep.equal(['Telegram', 'SePay']);
    expect(tab(el, 'telegram').querySelector('.td-tabs__icon svg') !== null).to.equal(true);
    const pill = tab(el, '1').querySelector('.td-tabs__count');
    expect(pill.getAttribute('data-tone')).to.equal('danger');
    expect(pill.textContent).to.equal(', 3');
    expect(el.getAttribute('active-tab')).to.equal('1');
    expect(currentIds(el)).to.deep.equal(['1']);
    expect(el.querySelectorAll(':scope > a, :scope > span').length).to.equal(0);
    expect(list(el).getAttribute('aria-label')).to.equal('Cài đặt');
  });

  it('23. the host active-tab beats a child aria-current; tabs assigned later win over the children', async () => {
    const wrap = document.createElement('div');
    host.appendChild(wrap);
    wrap.innerHTML = '<td-tabs active-tab="a"><a href="#a" data-tab-id="a">A</a><a href="#b" data-tab-id="b" aria-current="page">B</a></td-tabs>';
    await settle();
    const el = wrap.firstElementChild;
    expect(currentIds(el)).to.deep.equal(['a']);
    el.tabs = [{ id: 'x', label: 'X', href: '#x' }];
    expect(tabsOf(el).map((a) => a.dataset.tabId)).to.deep.equal(['x']);
  });

  it('24. late definition: tabs assigned on the NOT-yet-upgraded element (with <a> children) win; the children are not read', async () => {
    const tag = 'td-tabs-v083-late';
    const el = document.createElement(tag);
    el.innerHTML = '<a href="#child" data-tab-id="child">Child</a>';
    el.tabs = [{ id: 'prop', label: 'Prop', href: '#prop' }];
    host.appendChild(el);
    customElements.define(tag, class extends TdTabs {});
    await settle();
    expect(el instanceof TdTabs).to.equal(true);
    expect(tabsOf(el).map((a) => a.dataset.tabId)).to.deep.equal(['prop']);
    expect(el.querySelector('a[data-tab-id="child"]') === null).to.equal(true);
  });
  it('24b. pre-upgrade activeTab / matchHash properties (late definition) decide the FIRST render', async () => {
    go('/system/settings/telegram', '#gia');
    const tag = 'td-tabs-v083-late-props';
    const el = document.createElement(tag);
    el.tabs = [
      { id: 'tg', label: 'Telegram', href: '/system/settings/telegram' },
      { id: 'sp', label: 'SePay', href: '/system/settings/sepay' },
    ];
    el.activeTab = 'sp';
    host.appendChild(el);
    customElements.define(tag, class extends TdTabs {});
    await settle();
    expect(currentIds(el)).to.deep.equal(['sp']);
    const tag2 = 'td-tabs-v083-late-hash';
    const el2 = document.createElement(tag2);
    el2.tabs = [
      { id: 'info', label: 'Thông tin', href: '/system/settings/telegram' },
      { id: 'gia', label: 'Giá', href: '#gia' },
    ];
    el2.matchHash = true;
    host.appendChild(el2);
    customElements.define(tag2, class extends TdTabs {});
    await settle();
    expect(currentIds(el2)).to.deep.equal(['gia']);
  });

  it('24c. syncFromLocation() is a no-op in tablist mode (the selected tab stays)', async () => {
    const el = await mount([{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], { attrs: { 'active-tab': 'b' } });
    el.syncFromLocation();
    expect(el.getActiveTab()).to.equal('b');
    expect(tab(el, 'b').getAttribute('aria-selected')).to.equal('true');
  });
});

describe('v0.83.0 td-tabs links — count, overflow, panels', () => {
  it('25. count pill + overflow scroll still work in link mode (narrow); setTabCount updates in place', async () => {
    const long = ['Thông tin chung', 'Ảnh sản phẩm', 'Giá và tồn kho', 'Thuộc tính', 'Vận chuyển', 'Tối ưu SEO', 'Lịch sử']
      .map((label, i) => ({ id: `s${i}`, label, href: `#s${i}`, count: i === 1 ? 12 : undefined }));
    const el = await mount(long, { width: 320, attrs: { 'active-tab': 's6' } });
    await until(() => list(el).hasAttribute('data-overflow'), 3000, 'overflow mode');
    expect(tab(el, 's1').querySelector('.td-tabs__count').textContent).to.equal(', 12');
    await until(() => indicatorOn(el, 's6'), 3000, 'indicator on the current link');
    const lr = list(el).getBoundingClientRect();
    const ar = tab(el, 's6').getBoundingClientRect();
    expect(ar.right <= lr.right + 1).to.equal(true); // scrolled into the trough
    const node = tab(el, 's1');
    expect(el.setTabCount('s1', 99, 'info')).to.equal(true);
    expect(tab(el, 's1') === node).to.equal(true);
    expect(node.querySelector('.td-tabs__count').getAttribute('data-tone')).to.equal('info');
  });

  it('26. panel is ignored in link mode; a panel managed in tablist mode is given back', async () => {
    const panel = document.createElement('section');
    panel.id = 'v083-panel';
    host.appendChild(panel);
    const el = await mount([{ id: 'a', label: 'A', panel: 'v083-panel' }, { id: 'b', label: 'B' }]);
    expect(panel.getAttribute('role')).to.equal('tabpanel');
    el.tabs = [{ id: 'a', label: 'A', href: '#a', panel: 'v083-panel' }];
    expect(tab(el, 'a').hasAttribute('aria-controls')).to.equal(false);
    expect(panel.hasAttribute('role')).to.equal(false);
    expect(panel.hasAttribute('hidden')).to.equal(false);
    expect(panel.hasAttribute('aria-labelledby')).to.equal(false);
  });

  it('27. detached: listeners removed; reconnect re-matches the URL', async () => {
    go('/system/settings/telegram');
    const el = await mount(SETTINGS);
    const parent = el.parentElement;
    el.remove();
    go('/system/settings/sepay');
    popstate();
    expect(currentIds(el)).to.deep.equal(['telegram']);
    parent.appendChild(el);
    expect(currentIds(el)).to.deep.equal(['sepay']);
  });
});
