// v0.96.1 (plan docs/internal/plans/v0.96.0-icon-picker.md §10) — <td-icon-picker> opt-ins in Chromium, Firefox AND WebKit:
// 1 defaults unchanged, 2 trigger-text="label", 3 none-option / none-value, 4 groups, 5 filter row, 6 lazy load, 7 XSS.
// Booleans / strings in assertions (DOM nodes hang the runner). NOT run by the sub-agent that wrote it (gate = main session).
import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';
import { registerIcons, listIcons, hasIcon } from '../icons/td-icon.js';
import { TdIconPicker } from './td-icon-picker.js';

const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const host = document.createElement('div');
document.body.appendChild(host);
const raf = () => new Promise((r) => requestAnimationFrame(r));
const until = async (cond, n = 300) => { for (let i = 0; i < n && !cond(); i++) await raf(); return cond(); };
const panel = () => document.querySelector('body > .td-icon-picker-panel');
const part = (p) => panel()?.querySelector(`.td-icon-picker-panel__${p}`);
const sectionKeys = () => [...(panel()?.querySelectorAll('.td-icon-picker-panel__group') || [])].map((s) => s.getAttribute('data-group') + (s.getAttribute('data-key') ? `:${s.getAttribute('data-key')}` : ''));
const cellsIn = (sel) => [...(panel()?.querySelectorAll(`${sel} .td-icon-picker-panel__cell`) || [])];
const names = (sel) => cellsIn(sel).map((c) => c.getAttribute('data-icon'));
const trigger = (el) => el.querySelector('.td-icon-picker__trigger');
const triggerText = (el) => el.querySelector('.td-icon-picker__text').textContent;
const filters = () => [...(panel()?.querySelectorAll('.td-icon-picker-panel__filter') || [])];

const KIT_LOADER = TdIconPicker.loadSearchData;
const warns = [];
const realWarn = console.warn;
console.warn = (...a) => { warns.push(a.join(' ')); };

async function mount(attrs = 'label="Icon mục"', props = {}) {
  host.innerHTML = `<form id="f"><td-icon-picker name="ic" ${attrs}></td-icon-picker></form>`;
  const el = host.querySelector('td-icon-picker');
  Object.assign(el, props);
  const log = { input: [], change: [] };
  el.addEventListener('input', (e) => log.input.push(e.detail.value));
  el.addEventListener('change', (e) => log.change.push(e.detail.value));
  await raf();
  return { el, log };
}
async function open(el) {
  trigger(el).click();
  await until(() => !!panel() && panel().getAttribute('data-state') === 'open');
  await until(() => !part('status')?.textContent);
}

const GROUPS = [
  { key: 'actions', label: 'Thao tác', icons: ['trash', 'search', 'check'] },
  { key: 'places', label: 'Điều hướng', icons: ['home', 'settings', 'trash'] },
];

describe('v0.96.1 <td-icon-picker> opt-ins', () => {
  beforeEach(() => {
    TdIconPicker.loadSearchData = KIT_LOADER;
    TdIconPicker.groups = null;
    warns.length = 0;
  });
  afterEach(() => {
    host.innerHTML = '';
    for (const p of document.querySelectorAll('body > .td-icon-picker-panel')) p.remove();
  });
  after(() => { console.warn = realWarn; });

  it('1 defaults: two sections, no filter row, no none cell', async () => {
    const { el } = await mount();
    await open(el);
    expect(sectionKeys().join('|')).to.equal('suggested|all');
    expect(filters().length).to.equal(0);
    expect(panel().querySelector('[data-group="none"]') === null).to.equal(true);
  });

  it('2 trigger-text=label: core icon shows its VI label, JS-only value shows the name until the first open', async () => {
    // Module state is shared by the whole file (test 1 already loaded the kit metadata, D2: "or another page already
    // loaded" → a core icon shows its label at once). So the "name until the first open" half uses a site icon whose
    // metadata ONLY this test's loader returns: it cannot be known before that loader runs.
    registerIcons({ 'site-v096-lbl': { nodes: [['path', { d: 'M3 3h18v18H3z' }]] } });
    let calls = 0;
    TdIconPicker.loadSearchData = async () => {
      calls += 1;
      const kit = await KIT_LOADER();
      return { ...kit, 'site-v096-lbl': { label: 'Nhãn lười', keywords: { en: ['lazy label'], vi: ['nhãn lười'] } } };
    };
    const { el } = await mount('label="Icon" value="site-v096-lbl" trigger-text="label"');
    expect(calls).to.equal(0);
    expect(triggerText(el)).to.equal('site-v096-lbl');
    await open(el);
    expect(await until(() => triggerText(el) === 'Nhãn lười')).to.equal(true);
    expect(calls > 0).to.equal(true);
    // metadata loaded → a core icon mounted now shows its VI label without another load
    const before = calls;
    const c = await mount('label="Icon" value="trash" trigger-text="label"');
    expect(triggerText(c.el)).to.equal('Thùng rác');
    expect(calls).to.equal(before);
    // only the exact value "label" turns label mode on (PHP parity): anything else shows the canonical name
    const u = await mount('label="Icon" value="trash" trigger-text="Label"');
    expect(triggerText(u.el)).to.equal('trash');
    // an explicit value-label wins until the value changes
    const b = await mount('label="Icon" value="trash" trigger-text="label" value-label="Bỏ vào thùng"');
    expect(triggerText(b.el)).to.equal('Bỏ vào thùng');
    b.el.value = 'home';
    await raf();
    expect(triggerText(b.el)).to.equal('Trang chủ');
  });

  it('3 none-option: first cell, picks "", hidden when required or searching', async () => {
    const { el, log } = await mount('label="Icon" value="trash" none-option');
    await open(el);
    expect(sectionKeys()[0]).to.equal('none');
    const none = cellsIn('[data-group="none"]')[0];
    expect(none !== undefined).to.equal(true);
    none.click();
    await until(() => el.value === '');
    expect(el.value).to.equal('');
    expect(log.input.length).to.equal(1);
    expect(log.change.length).to.equal(1);
    // searching hides it
    await open(el);
    const input = part('input');
    input.value = 'home';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await raf();
    expect(cellsIn('[data-group="none"]').filter((c) => !c.closest('[hidden]')).length).to.equal(0);
    // required hides it
    const r = await mount('label="Icon" required none-option');
    await open(r.el);
    expect(cellsIn('[data-group="none"]').length).to.equal(0);
  });

  it('3b none-value: stores the word, shows ban + "Không icon", submits it; a bad / registered word is ignored', async () => {
    const { el, log } = await mount('label="Icon" none-option none-value="none"');
    await open(el);
    cellsIn('[data-group="none"]')[0].click();
    await until(() => el.value === 'none');
    expect(el.value).to.equal('none');
    expect(log.change.length).to.equal(1);
    expect(el.querySelector('.td-icon-picker__text').getAttribute('data-state')).to.equal('none');
    expect(triggerText(el)).to.equal(TdIconPicker.labels.none);
    expect(new FormData(host.querySelector('form')).get('ic')).to.equal('none');
    const bad = await mount('label="Icon" none-option none-value="Bad!"');
    await open(bad.el);
    cellsIn('[data-group="none"]')[0].click();
    await until(() => bad.el.value === '');
    expect(bad.el.value).to.equal('');
    expect(warns.some((w) => /none-value/.test(w))).to.equal(true);
    warns.length = 0;
    const dup = await mount('label="Icon" none-option none-value="trash"');
    expect(dup.el.noneValue === undefined || dup.el.noneValue === '' || dup.el.value === '').to.equal(true);
  });

  it('4 groups: sections in order, a multi-group icon is in both, the rest go to "Khác", instance beats static', async () => {
    TdIconPicker.groups = [{ key: 'static', label: 'Tĩnh', icons: ['star'] }];
    const { el } = await mount('label="Icon"', { groups: GROUPS });
    await open(el);
    const keys = sectionKeys();
    expect(keys.indexOf('group:actions') < keys.indexOf('group:places')).to.equal(true);
    expect(keys.includes('group:static')).to.equal(false);
    expect(names('[data-key="actions"]').includes('trash')).to.equal(true);
    expect(names('[data-key="places"]').includes('trash')).to.equal(true);
    expect(panel().querySelector('[data-ungrouped]') !== null).to.equal(true);
    // null → the static again: the open popup refills at once (setter), and so does the next open
    el.groups = null;
    await raf();
    expect(sectionKeys().includes('group:static')).to.equal(true);
    expect(sectionKeys().includes('group:actions')).to.equal(false);
    el.close(); // the trigger toggles: a click on an open picker would close it
    await open(el);
    expect(sectionKeys().includes('group:static')).to.equal(true);
  });

  it('4b invalid groups: one warning, flat grid', async () => {
    const { el } = await mount('label="Icon"', { groups: [{ key: 'Bad Key', label: 'x', icons: [] }] });
    await open(el);
    expect(warns.filter((w) => /groups/.test(w)).length).to.equal(1);
    expect(filters().length).to.equal(0);
  });

  it('5 filter row: appears with 2+ groups, narrows to one section, roving arrows, search resets to "Tất cả"', async () => {
    const { el } = await mount('label="Icon"', { groups: GROUPS });
    await open(el);
    const bar = filters();
    // Tất cả + 2 groups + "Khác" (the rest of the registered icons is a shown group too, D6 / D8)
    expect(bar.length).to.equal(4);
    expect(bar[3].textContent).to.equal(TdIconPicker.labels.ungrouped);
    expect(bar.filter((b) => b.tabIndex === 0).length).to.equal(1);
    bar[1].click();
    await raf();
    expect(bar[1].getAttribute('aria-pressed')).to.equal('true');
    expect(panel().querySelectorAll('.td-icon-picker-panel__group:not([hidden])').length).to.equal(1);
    bar[1].focus();
    await sendKeys({ press: 'ArrowRight' });
    expect(document.activeElement === bar[2]).to.equal(true);
    await sendKeys({ press: 'Home' });
    expect(document.activeElement === bar[0]).to.equal(true);
    // a narrow row scrolls sideways: End brings the last button into the row's view
    const row = bar[0].parentElement;
    const narrow = new CSSStyleSheet();
    narrow.replaceSync('.td-v096-narrow-row { max-inline-size: 120px !important; }');
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, narrow];
    row.classList.add('td-v096-narrow-row');
    await raf();
    await sendKeys({ press: 'End' });
    const last = bar[bar.length - 1].getBoundingClientRect();
    const rb = row.getBoundingClientRect();
    expect(document.activeElement === bar[bar.length - 1]).to.equal(true);
    expect(last.left >= rb.left - 1 && last.right <= rb.right + 1, `last ${last.left}-${last.right} in ${rb.left}-${rb.right}`).to.equal(true);
    row.classList.remove('td-v096-narrow-row');
    document.adoptedStyleSheets = document.adoptedStyleSheets.filter((x) => x !== narrow);
    await sendKeys({ press: 'Home' });
    const input = part('input');
    input.value = 'home';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await raf();
    expect(filters()[0].getAttribute('aria-pressed')).to.equal('true');
  });

  it('6 lazy load: the loader registers site icons + groups; wrong entries are dropped with one warning; names given before load survive', async () => {
    // §1 (d) / §10.6: the site metadata comes back FROM the loader (checked entry by entry, a wrong entry is dropped), not
    // through registerIconSearchData (all-or-nothing: one wrong entry throws the whole batch and fails the load)
    const site = ['site-v096-a', 'site-v096-b', 'site-v096-c'];
    TdIconPicker.loadSearchData = async () => {
      const kit = await KIT_LOADER();
      registerIcons(Object.fromEntries(site.map((n) => [n, { nodes: [['path', { d: 'M3 3h18v18H3z' }]] }])));
      TdIconPicker.groups = [{ key: 'site', label: 'Site', icons: site }];
      return {
        ...kit,
        'site-v096-a': { label: 'Kho A', keywords: { en: ['warehouse a'], vi: ['kho a'] } },
        'site-v096-b': { label: '', keywords: { en: [], vi: [] } }, // wrong entry
        'site-v096-c': { label: 'Kho C', keywords: { en: ['x', 'X'], vi: ['kho c'] } }, // wrong entry (duplicate keyword)
      };
    };
    expect(listIcons().includes('site-v096-a')).to.equal(false);
    const { el } = await mount(`label="Icon" value="site-v096-a" suggestions="site-v096-a home" icons="site-v096-a site-v096-b home"`);
    expect(warns.length).to.equal(0); // no early "not registered" warning
    expect(el.querySelector('.td-icon-picker__text').getAttribute('data-state')).to.equal('unknown');
    await open(el);
    expect(listIcons().includes('site-v096-a')).to.equal(true);
    expect(names('[data-group="suggested"]').includes('site-v096-a')).to.equal(true);
    expect(names('[data-key="site"]').join(' ')).to.equal('site-v096-a site-v096-b');
    expect(await until(() => el.querySelector('.td-icon-picker__text').getAttribute('data-state') === 'value')).to.equal(true);
    expect(part('retry').hidden).to.equal(true); // the load succeeded
    expect(warns.filter((w) => /dropped/.test(w)).length).to.equal(1);
    expect(warns.filter((w) => /not a registered|could not be loaded/.test(w)).length).to.equal(0);
    // the good site entry is searchable by its label
    const input = part('input');
    input.value = 'kho a';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(await until(() => names('[data-group="all"]')[0] === 'site-v096-a')).to.equal(true);
  });

  it('6b lazy load: a loader that rejects shows "Thử lại"; the retry loads (icons registered once, value painted)', async () => {
    let calls = 0;
    TdIconPicker.loadSearchData = async () => {
      calls += 1;
      if (!hasIcon('site-v096-r')) registerIcons({ 'site-v096-r': { nodes: [['path', { d: 'M3 3h18v18H3z' }]] } });
      if (calls === 1) throw new Error('offline');
      const kit = await KIT_LOADER();
      return { ...kit, 'site-v096-r': { label: 'Thử lại site', keywords: { en: ['retry site'], vi: ['thử lại site'] } } };
    };
    const { el } = await mount('label="Icon" value="site-v096-r" trigger-text="label"');
    trigger(el).click();
    expect(await until(() => part('retry') && !part('retry').hidden)).to.equal(true);
    expect(calls).to.equal(1);
    expect(warns.filter((w) => /could not be loaded/.test(w)).length).to.equal(1);
    // the icon registered before the failure is painted already (name mode text: the label is not loaded)
    expect(el.querySelector('.td-icon-picker__text').getAttribute('data-state')).to.equal('value');
    part('retry').click();
    expect(await until(() => part('retry').hidden && triggerText(el) === 'Thử lại site')).to.equal(true);
    expect(calls).to.equal(2);
  });

  it('6c lazy load: groups that arrive with the load keep the focus on the same icon', async () => {
    let release;
    const gate = new Promise((r) => { release = r; });
    TdIconPicker.loadSearchData = async () => {
      const kit = await KIT_LOADER();
      await gate;
      TdIconPicker.groups = GROUPS;
      return kit;
    };
    const { el } = await mount('label="Icon"');
    trigger(el).click();
    expect(await until(() => cellsIn('[data-group="all"]').some((c) => c.getAttribute('data-icon') === 'home'))).to.equal(true);
    cellsIn('[data-group="all"]').find((c) => c.getAttribute('data-icon') === 'home').focus();
    release();
    expect(await until(() => sectionKeys().includes('group:places'))).to.equal(true);
    await raf();
    expect(document.activeElement?.getAttribute('data-icon')).to.equal('home');
    expect(document.activeElement?.closest('.td-icon-picker-panel__group')?.getAttribute('data-key')).to.equal('places');
  });

  it('7 XSS: group labels and value-label render as text', async () => {
    const evil = '<img src=x onerror="window.__pwn096=1">';
    const { el } = await mount(`label="Icon" value="trash" trigger-text="label" value-label="${evil.replace(/"/g, '&quot;')}"`, {
      groups: [{ key: 'a', label: evil, icons: ['trash'] }, { key: 'b', label: 'B', icons: ['home'] }],
    });
    await open(el);
    expect(triggerText(el)).to.equal(evil);
    expect(filters()[1].textContent).to.equal(evil);
    expect(panel().querySelector('img') === null).to.equal(true);
    expect(window.__pwn096 === undefined).to.equal(true);
  });
});
