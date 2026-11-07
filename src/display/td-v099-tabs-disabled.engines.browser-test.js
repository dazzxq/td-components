import { expect } from '@esm-bundle/chai';
import { sendKeys, emulateMedia } from '@web/test-runner-commands';
import { TdTabs } from './td-tabs.js';
import { parseColor, contrast } from '../../test/tokens/color-parse.js';

// v0.99.0 (plan docs/internal/plans/v0.99.0-tabs-disabled.md, tests 1-9) — per-tab `disabled` / `disabledReason` on td-tabs in
// Chromium, Firefox AND WebKit: aria-disabled markup, the `tab-blocked` event, keyboard (real keys), the select API, runtime toggle,
// link mode (no href, re-match), colours in both themes, forced colours. The URL moves with history.replaceState in the SAME
// document and is restored after every test. DOM nodes are compared as booleans/strings (a failing chai assertion carrying DOM nodes
// hangs the runner).
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });
await document.fonts?.ready;

const ORIGINAL_URL = location.href;
const SEARCH = location.search;
const raf = () => new Promise((r) => requestAnimationFrame(r));
async function settle(n = 3) { for (let i = 0; i < n; i++) await raf(); }
const go = (path, hash = '') => history.replaceState(null, '', `${path}${SEARCH}${hash}`);
const popstate = () => window.dispatchEvent(new PopStateEvent('popstate'));
const hashchange = () => window.dispatchEvent(new HashChangeEvent('hashchange'));

const host = document.createElement('div');
document.body.appendChild(host);
afterEach(async () => {
  host.innerHTML = '';
  history.replaceState(null, '', ORIGINAL_URL);
  await emulateMedia({ forcedColors: 'none', reducedMotion: 'no-preference' });
});

const TABS = [
  { id: 'info', label: 'Thông tin' },
  { id: 'price', label: 'Giá', disabled: true, disabledReason: '  Lưu sản phẩm trước  ' },
  { id: 'seo', label: 'SEO', disabled: true },
  { id: 'media', label: 'Ảnh' },
];
const clone = (tabs) => tabs.map((t) => ({ ...t }));

async function mount(tabs, { width = 900, attrs = {}, theme } = {}) {
  const wrap = document.createElement('div');
  if (theme) wrap.setAttribute('data-td-theme', theme);
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
const pill = (el, id) => tab(el, id)?.querySelector(':scope > .td-tabs__count') || null;
const selectedIds = (el) => tabsOf(el).filter((b) => b.getAttribute('aria-selected') === 'true').map((b) => b.dataset.tabId);
const currentIds = (el) => tabsOf(el).filter((a) => a.getAttribute('aria-current') === 'page').map((a) => a.dataset.tabId);
const focusedId = () => document.activeElement?.dataset?.tabId || null;
const probe = (value, theme) => {
  const wrap = document.createElement('div');
  if (theme) wrap.setAttribute('data-td-theme', theme);
  const el = document.createElement('div');
  wrap.appendChild(el);
  host.appendChild(wrap);
  el.style.setProperty('color', value);
  const c = getComputedStyle(el).color;
  wrap.remove();
  return c;
};
/** Collects `tab-change` / `tab-blocked` / `tab-click` of one element. */
function spy(el) {
  const log = { change: [], blocked: [], click: [], cancelable: [] };
  el.addEventListener('tab-change', (e) => log.change.push(e.detail.tabId));
  el.addEventListener('tab-blocked', (e) => { log.blocked.push({ ...e.detail }); log.cancelable.push(e.cancelable); });
  el.addEventListener('tab-click', (e) => log.click.push(e.detail.tabId));
  return log;
}

describe('v0.99.0 td-tabs disabled — markup (test 1)', () => {
  it('1a. tablist: aria-disabled="true", never native disabled, title = trimmed reason, not selected; enabled tabs are untouched', async () => {
    const el = await mount(clone(TABS));
    const price = tab(el, 'price');
    expect(price.getAttribute('aria-disabled')).to.equal('true');
    expect(price.hasAttribute('disabled')).to.equal(false);
    expect(price.getAttribute('aria-selected')).to.equal('false');
    expect(price.getAttribute('title')).to.equal('Lưu sản phẩm trước');
    expect(tab(el, 'seo').hasAttribute('title')).to.equal(false); // no reason → no title
    expect(tab(el, 'info').hasAttribute('aria-disabled')).to.equal(false);
    expect(tab(el, 'info').hasAttribute('title')).to.equal(false);
    expect(selectedIds(el)).to.deep.equal(['info']);
  });

  it('1b. only `=== true` locks; the reason is text (escaped) and cut at 200 chars; a reason without disabled is dropped', async () => {
    const el = await mount([
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B', disabled: 'true' }, { id: 'c', label: 'C', disabled: 1 }, { id: 'd', label: 'D', disabled: 'false' },
      { id: 'e', label: 'E', disabled: true, disabledReason: '<img src=x onerror=alert(1)>' + 'x'.repeat(300) },
      { id: 'f', label: 'F', disabledReason: 'ignored' },
    ]);
    for (const id of ['a', 'b', 'c', 'd', 'f']) expect(tab(el, id).hasAttribute('aria-disabled'), id).to.equal(false);
    expect(tab(el, 'f').hasAttribute('title')).to.equal(false);
    const title = tab(el, 'e').getAttribute('title');
    expect(title.length).to.equal(200);
    expect(title.startsWith('<img src=x')).to.equal(true);
    expect(el.querySelectorAll('img').length).to.equal(0);
  });

  it('1c. link mode: a locked tab is an <a> with no href, role="link", tabindex="0", aria-disabled="true"', async () => {
    const el = await mount([
      { id: 'a', label: 'A', href: '/form#a' },
      { id: 'b', label: 'B', href: '/form#b', disabled: true, disabledReason: 'Chưa có dữ liệu' },
    ]);
    const b = tab(el, 'b');
    expect(b.tagName).to.equal('A');
    expect(b.hasAttribute('href')).to.equal(false);
    expect(b.getAttribute('role')).to.equal('link');
    expect(b.getAttribute('tabindex')).to.equal('0');
    expect(b.getAttribute('aria-disabled')).to.equal('true');
    expect(b.getAttribute('title')).to.equal('Chưa có dữ liệu');
    expect(tab(el, 'a').getAttribute('href')).to.equal('/form#a');
    expect(tab(el, 'a').hasAttribute('role')).to.equal(false);
  });
});

describe('v0.99.0 td-tabs disabled — click and keyboard (tests 2-3)', () => {
  it('2. click on a locked tab: no selection, no tab-change, no onChange, tab-blocked once { tabId, reason }, not cancelable, bubbles', async () => {
    const el = await mount(clone(TABS));
    const log = spy(el);
    let onChange = 0;
    el.onChange = () => onChange++;
    let bubbled = 0;
    host.addEventListener('tab-blocked', () => bubbled++);
    tab(el, 'price').click();
    tab(el, 'seo').click();
    await settle();
    expect(selectedIds(el)).to.deep.equal(['info']);
    expect(log.change.length).to.equal(0);
    expect(onChange).to.equal(0);
    expect(log.blocked).to.deep.equal([{ tabId: 'price', reason: 'Lưu sản phẩm trước' }, { tabId: 'seo', reason: '' }]);
    expect(log.cancelable).to.deep.equal([false, false]);
    expect(bubbled).to.equal(2);
    tab(el, 'media').click(); // an enabled tab still works
    expect(selectedIds(el)).to.deep.equal(['media']);
    expect(log.change).to.deep.equal(['media']);
  });

  it('3a. manual: arrows reach the locked tab (focus only); Enter and Space are no-ops plus tab-blocked', async () => {
    const el = await mount(clone(TABS));
    const log = spy(el);
    tab(el, 'info').focus();
    await sendKeys({ press: 'ArrowRight' });
    expect(focusedId()).to.equal('price');
    expect(selectedIds(el)).to.deep.equal(['info']);
    expect(log.blocked.length).to.equal(0); // landing is not an activation
    await sendKeys({ press: 'Enter' });
    await sendKeys({ press: 'Space' });
    expect(log.blocked.map((b) => b.tabId)).to.deep.equal(['price', 'price']);
    expect(log.change.length).to.equal(0);
    expect(selectedIds(el)).to.deep.equal(['info']);
    await sendKeys({ press: 'ArrowRight' }); // seo (locked) then media
    await sendKeys({ press: 'ArrowRight' });
    expect(focusedId()).to.equal('media');
    await sendKeys({ press: 'Enter' });
    expect(selectedIds(el)).to.deep.equal(['media']);
    expect(log.change).to.deep.equal(['media']);
  });

  it('3b. activation="auto": an arrow onto a locked tab focuses it only (no selection, no event); the next enabled one selects', async () => {
    const el = await mount(clone(TABS), { attrs: { activation: 'auto' } });
    const log = spy(el);
    tab(el, 'info').focus();
    await sendKeys({ press: 'ArrowRight' });
    expect(focusedId()).to.equal('price');
    expect(selectedIds(el)).to.deep.equal(['info']);
    expect(log.change.length + log.blocked.length).to.equal(0);
    await sendKeys({ press: 'End' });
    expect(focusedId()).to.equal('media');
    expect(selectedIds(el)).to.deep.equal(['media']);
    expect(log.change).to.deep.equal(['media']);
    expect(log.blocked.length).to.equal(0);
  });
});

describe('v0.99.0 td-tabs disabled — select API and fallbacks (tests 4-5)', () => {
  it('4a. setActiveTab / active-tab with a locked id is ignored (silently); getActiveTab unchanged', async () => {
    const el = await mount(clone(TABS));
    const log = spy(el);
    el.setActiveTab('price');
    el.setAttribute('active-tab', 'seo');
    await settle();
    expect(el.getActiveTab()).to.equal('info');
    expect(selectedIds(el)).to.deep.equal(['info']);
    expect(log.change.length + log.blocked.length).to.equal(0);
    el.setActiveTab('media');
    expect(el.getActiveTab()).to.equal('media');
  });

  it('4b. first render: a locked `active-tab` → the first ENABLED tab; the first tab locked → the next enabled one', async () => {
    const el = await mount(clone(TABS), { attrs: { 'active-tab': 'price' } });
    expect(selectedIds(el)).to.deep.equal(['info']);
    const el2 = await mount([{ id: 'a', label: 'A', disabled: true }, { id: 'b', label: 'B' }]);
    expect(selectedIds(el2)).to.deep.equal(['b']);
    expect(el2.getActiveTab()).to.equal('b');
  });

  it('4c. all locked: none selected, panels hidden, the first tab is still a Tab stop and the arrows work', async () => {
    const p1 = document.createElement('div');
    p1.id = 'p99-1';
    const p2 = document.createElement('div');
    p2.id = 'p99-2';
    host.append(p1, p2);
    const el = await mount([
      { id: 'a', label: 'A', disabled: true, panel: 'p99-1' }, { id: 'b', label: 'B', disabled: true, panel: 'p99-2' },
    ]);
    expect(selectedIds(el)).to.deep.equal([]);
    expect(el.getActiveTab()).to.equal(null);
    expect(p1.hasAttribute('hidden') && p2.hasAttribute('hidden')).to.equal(true);
    expect(tabsOf(el).filter((b) => b.getAttribute('tabindex') === '0').length).to.equal(1);
    tab(el, 'a').focus();
    await sendKeys({ press: 'ArrowRight' });
    expect(focusedId()).to.equal('b');
    host.removeChild(p1);
    host.removeChild(p2);
  });

  it('5. runtime toggle: the active tab becomes locked → silent move to the first enabled; re-enabled → selectable again', async () => {
    const el = await mount(clone(TABS));
    el.setActiveTab('media');
    const log = spy(el);
    const next = clone(TABS);
    next[3].disabled = true;
    el.tabs = next;
    await settle();
    expect(el.getActiveTab()).to.equal('info');
    expect(selectedIds(el)).to.deep.equal(['info']);
    expect(tab(el, 'media').getAttribute('aria-disabled')).to.equal('true');
    expect(log.change.length).to.equal(0);
    el.setActiveTab('media');
    expect(el.getActiveTab()).to.equal('info');
    const again = clone(TABS);
    again[1].disabled = false;
    el.tabs = again;
    await settle();
    expect(tab(el, 'price').hasAttribute('aria-disabled')).to.equal(false);
    expect(tab(el, 'price').hasAttribute('title')).to.equal(false);
    el.setActiveTab('price');
    expect(selectedIds(el)).to.deep.equal(['price']);
    expect(log.change).to.deep.equal(['price']);
  });
});

describe('v0.99.0 td-tabs disabled — link mode (tests 6, 9)', () => {
  const LINKS = [
    { id: 'a', label: 'A', href: '/form#a' },
    { id: 'b', label: 'B', href: '/form#b', disabled: true, disabledReason: 'Khoá' },
    { id: 'c', label: 'C', href: '/form#c' },
  ];

  it('6a. click on a locked link: prevented, no tab-click, tab-blocked once; Enter and Space report too', async () => {
    go('/form', '#a');
    const el = await mount(clone(LINKS), { attrs: { 'match-hash': '' } });
    const log = spy(el);
    const b = tab(el, 'b');
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
    b.dispatchEvent(ev);
    expect(ev.defaultPrevented).to.equal(true);
    expect(log.click.length).to.equal(0);
    expect(log.blocked).to.deep.equal([{ tabId: 'b', reason: 'Khoá' }]);
    b.focus();
    await sendKeys({ press: 'Enter' });
    await sendKeys({ press: 'Space' });
    expect(log.blocked.length).to.equal(3);
    expect(log.change.length).to.equal(0);
    expect(currentIds(el)).to.deep.equal(['a']);
    expect(location.hash).to.equal('#a');
  });

  it('6b. an enabled link still fires tab-click and is not blocked', async () => {
    const el = await mount(clone(LINKS));
    const log = spy(el);
    tab(el, 'c').addEventListener('click', (e) => e.preventDefault()); // do not navigate the runner page
    tab(el, 'c').click();
    expect(log.click).to.deep.equal(['c']);
    expect(log.blocked.length).to.equal(0);
  });

  it('6c. match-hash / pathname never make a locked link current; setActiveTab / active-tab on it is ignored', async () => {
    go('/form', '#b');
    const el = await mount(clone(LINKS), { attrs: { 'match-hash': '' } });
    expect(currentIds(el)).to.deep.equal([]);
    el.setActiveTab('b');
    el.setAttribute('active-tab', 'b');
    expect(currentIds(el)).to.deep.equal([]);
    const el2 = await mount([{ id: 'p', label: 'P', href: '/form', disabled: true }, { id: 'q', label: 'Q', href: '/other' }]);
    go('/form');
    el2.syncFromLocation();
    expect(currentIds(el2)).to.deep.equal([]);
  });

  it('6d. server markup: aria-disabled="true", data-disabled and data-disabled-reason are read; the rendered link has no href', async () => {
    const wrap = document.createElement('div');
    host.appendChild(wrap);
    wrap.innerHTML = '<td-tabs aria-label="Cài đặt">'
      + '<a href="/s/a" data-tab-id="a">A</a>'
      + '<a href="/s/b" data-tab-id="b" aria-disabled="true">B</a>'
      + '<a href="/s/c" data-tab-id="c" data-disabled data-disabled-reason="Cần lưu trước">C</a>'
      + '<a href="/s/d" data-tab-id="d" aria-disabled="false">D</a></td-tabs>';
    await settle();
    const el = wrap.querySelector('td-tabs');
    expect(tab(el, 'a').getAttribute('href')).to.equal('/s/a');
    expect(tab(el, 'b').getAttribute('aria-disabled')).to.equal('true');
    expect(tab(el, 'b').hasAttribute('href')).to.equal(false);
    expect(tab(el, 'c').hasAttribute('href')).to.equal(false);
    expect(tab(el, 'c').getAttribute('title')).to.equal('Cần lưu trước');
    expect(tab(el, 'd').hasAttribute('aria-disabled')).to.equal(false);
    expect(tab(el, 'd').getAttribute('href')).to.equal('/s/d');
  });

  it('9. re-match: current A, then the hash moves to the locked B → A stays; first load on a locked match → no current', async () => {
    go('/form', '#a');
    const el = await mount(clone(LINKS), { attrs: { 'match-hash': '' } });
    expect(currentIds(el)).to.deep.equal(['a']);
    go('/form', '#b');
    hashchange();
    popstate();
    el.syncFromLocation(); // forgets only the explicit id; the previous enabled current still wins over the locked match
    expect(currentIds(el)).to.deep.equal(['a']);
    expect(el.getActiveTab()).to.equal('a');
    go('/form', '#c');
    hashchange();
    expect(currentIds(el)).to.deep.equal(['c']);

    go('/form', '#b');
    const first = await mount(clone(LINKS), { attrs: { 'match-hash': '' } });
    expect(currentIds(first)).to.deep.equal([]);
    expect(first.getActiveTab()).to.equal(null);
    expect(list(first).hasAttribute('data-state')).to.equal(false);
  });
});

// --td-tabs-fg-disabled (tabs.css) is scoped to td-tabs: probe its definition, resolved in the theme
const DISABLED_FG = 'color-mix(in srgb, var(--td-btn-disabled-fg) 60%, var(--td-color-text-muted))';

describe('v0.99.0 td-tabs disabled — rendering (tests 7-8)', () => {
  const RICH = [
    { id: 'a', label: 'Thông tin', icon: 'lock', count: 3, tone: 'success' },
    { id: 'b', label: 'Giá', icon: 'lock', count: 7, tone: 'danger', disabled: true, disabledReason: 'Lưu trước' },
    { id: 'c', label: 'Ảnh', count: 2 },
  ];

  it('7a. icon + count + locked: label, icon and pill text are the disabled colour; the pill is neutral whatever its tone', async () => {
    const el = await mount(clone(RICH));
    const b = tab(el, 'b');
    const want = probe(DISABLED_FG);
    expect(getComputedStyle(b).color).to.equal(want);
    expect(getComputedStyle(b.querySelector('.td-tabs__label')).color).to.equal(want);
    expect(b.querySelector('.td-tabs__icon') !== null).to.equal(true);
    expect(getComputedStyle(b.querySelector('.td-tabs__icon')).color).to.equal(want);
    const cs = getComputedStyle(pill(el, 'b'));
    expect(cs.color).to.equal(want);
    expect(cs.backgroundColor).to.equal(probe('var(--td-badge-neutral-bg)'));
    expect(getComputedStyle(b).cursor).to.equal('not-allowed');
    // the same pill on an enabled tab keeps its tone
    expect(getComputedStyle(pill(el, 'a')).color).to.equal(probe('var(--td-badge-success-fg)'));
  });

  it('7b. overflow mode: a locked tab is measured like any other (row scrolls, indicator sits on the enabled current)', async () => {
    const many = [];
    for (let i = 0; i < 10; i++) many.push({ id: `t${i}`, label: `Thẻ số ${i} dài`, disabled: i % 2 === 1, count: i });
    const el = await mount(many, { width: 320 });
    expect(list(el).hasAttribute('data-overflow')).to.equal(true);
    expect(tab(el, 't1').getBoundingClientRect().width).to.be.greaterThan(0);
    expect(selectedIds(el)).to.deep.equal(['t0']);
    expect(list(el).getAttribute('data-state')).to.equal('ready');
  });

  it('7c. no hover / pressed look on a locked tab (colour and background stay)', async () => {
    const el = await mount(clone(TABS));
    const b = tab(el, 'price');
    const color = getComputedStyle(b).color;
    b.setAttribute('data-td-pressed', '');
    expect(getComputedStyle(b).color).to.equal(color);
    expect(getComputedStyle(b).backgroundColor).to.equal('rgba(0, 0, 0, 0)');
    b.removeAttribute('data-td-pressed');
  });

  for (const theme of ['light', 'dark']) {
    it(`8a. (${theme}) the locked label and pill text are --td-tabs-fg-disabled of that theme and differ from an enabled tab`, async () => {
      const el = await mount([
        { id: 'a', label: 'A', count: 4 }, { id: 'b', label: 'B', count: 4, tone: 'info', disabled: true },
      ], { theme });
      const want = probe(DISABLED_FG, theme);
      expect(getComputedStyle(tab(el, 'b')).color).to.equal(want);
      expect(getComputedStyle(pill(el, 'b')).color).to.equal(want);
      expect(getComputedStyle(pill(el, 'b')).backgroundColor).to.equal(probe('var(--td-badge-neutral-bg)', theme));
      expect(getComputedStyle(tab(el, 'a')).color).to.not.equal(want);
      // not skipped by the contrast gate: the pill text keeps the disabled floor against its own fill
      const bg = parseColor(getComputedStyle(pill(el, 'b')).backgroundColor);
      expect(bg !== null).to.equal(true);
      expect(contrast(parseColor(want), bg)).to.be.at.least(1.5);
    });
  }

  it('8b. forced colours: label, icon and pill are GrayText, no pressed outline (skipped where the engine cannot emulate it)', async () => {
    await emulateMedia({ forcedColors: 'active' });
    if (!matchMedia('(forced-colors: active)').matches) {
      // this engine has no forced-colors emulation: nothing to assert (documented skip)
      return;
    }
    const el = await mount(clone(RICH));
    const b = tab(el, 'b');
    const gray = probe('GrayText');
    expect(getComputedStyle(b).color).to.equal(gray);
    expect(getComputedStyle(pill(el, 'b')).color).to.equal(gray);
    b.setAttribute('data-td-pressed', '');
    expect(getComputedStyle(b).outlineStyle).to.not.equal('solid');
    b.removeAttribute('data-td-pressed');
  });
});

describe('v0.99.0 td-tabs disabled — backward compatible', () => {
  it('tabs without `disabled` render byte for byte as before (no aria-disabled, title or role)', async () => {
    const el = await mount([{ id: 'x', label: 'X' }, { id: 'y', label: 'Y' }]);
    expect(tab(el, 'x').outerHTML).to.equal(
      `<button type="button" role="tab" class="td-tabs__tab" id="${el.id}-tab-0" data-tab-id="x" aria-selected="true" tabindex="0">`
      + '<span class="td-tabs__label" data-label="X">X</span></button>',
    );
    expect(TdTabs !== undefined).to.equal(true);
  });
});
