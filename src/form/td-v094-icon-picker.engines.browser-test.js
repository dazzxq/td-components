// v0.94.0 (plan docs/internal/plans/v0.94.0-icons-picker.md §9.2) — <td-icon-picker> in Chromium, Firefox AND WebKit:
// 1 form value, 2 open / close, 3 grid keyboard, 4 pick / clear events, 5 search, 6 lazy metadata load, 7 site icons +
// registerIconSearchData, 8 suggestions, 9 XSS, 10 scale (600 site icons, node identity), 11 touch, 12 theme bridge.
// Booleans / strings in assertions (DOM nodes hang the runner).
import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';
import { registerIcons, listIcons } from '../icons/td-icon.js';
import { TdIconPicker, registerIconSearchData } from './td-icon-picker.js';

const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const host = document.createElement('div');
document.body.appendChild(host);
const raf = () => new Promise((r) => requestAnimationFrame(r));
const tick = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (cond, n = 300) => { for (let i = 0; i < n && !cond(); i++) await raf(); return cond(); };
const panel = () => document.querySelector('body > .td-icon-picker-panel');
const part = (p) => panel()?.querySelector(`.td-icon-picker-panel__${p}`);
const active = () => document.activeElement;
const activeIcon = () => active()?.getAttribute?.('data-icon') ?? null;
const grid = (g) => panel()?.querySelector(`[data-group="${g}"] > .td-icon-picker-panel__grid`);
const cellsOf = (g) => [...(grid(g)?.querySelectorAll('.td-icon-picker-panel__cell') || [])];
const namesOf = (g) => cellsOf(g).map((c) => c.getAttribute('data-icon'));
const cell = (g, name) => grid(g)?.querySelector(`.td-icon-picker-panel__cell[data-icon="${name}"]`);

const KIT_LOADER = TdIconPicker.loadSearchData;
/** a counting loader around the kit's (or `impl`) */
function spyLoader(impl = KIT_LOADER) {
  const spy = { calls: 0 };
  TdIconPicker.loadSearchData = () => { spy.calls += 1; return impl(); };
  return spy;
}

/** mount `<td-icon-picker>` (in a form), record host events + leaked native events */
function mount(attrs = 'label="Icon mục"', { form = true } = {}) {
  host.innerHTML = form
    ? `<form id="f"><td-icon-picker name="ic" ${attrs}></td-icon-picker><button type="submit">Lưu</button></form>`
    : `<td-icon-picker name="ic" ${attrs}></td-icon-picker>`;
  const el = host.querySelector('td-icon-picker');
  const log = { input: [], change: [], native: 0 };
  el.addEventListener('input', (e) => { if (e instanceof CustomEvent) log.input.push(e.detail.value); else log.native += 1; });
  el.addEventListener('change', (e) => { if (e instanceof CustomEvent) log.change.push(e.detail.value); else log.native += 1; });
  return { el, log, trigger: el.querySelector('.td-icon-picker__trigger'), clear: el.querySelector('.td-icon-picker__clear'), form: host.querySelector('form') };
}

const fd = (form) => new FormData(form).getAll('ic');

async function openWith(el) {
  el.open();
  await until(() => !!panel());
  await raf();
}

async function search(text) {
  const input = part('input');
  input.focus();
  input.value = '';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  if (text) await sendKeys({ type: text });
  await raf();
}

beforeEach(() => { TdIconPicker.loadSearchData = KIT_LOADER; });

afterEach(() => {
  for (const el of document.querySelectorAll('td-icon-picker')) el.close?.({ focus: false });
  host.innerHTML = '';
  for (const p of document.querySelectorAll('.td-icon-picker-panel')) p.remove();
  TdIconPicker.loadSearchData = KIT_LOADER;
});

describe('1. form value', () => {
  it('name + value → FormData; alias x → close; disabled not sent; readonly sent and never opens', async () => {
    let m = mount('label="Icon" value="trash"');
    expect(fd(m.form)).to.deep.equal(['trash']);
    expect(m.el.value).to.equal('trash');
    m = mount('label="Icon" value="x"');
    expect(m.el.value).to.equal('close');
    expect(fd(m.form)).to.deep.equal(['close']);
    expect(m.el.querySelector('.td-icon-picker__text').textContent).to.equal('close');
    m = mount('label="Icon" value="home" disabled');
    expect(fd(m.form)).to.deep.equal([]);
    expect(m.trigger.disabled).to.equal(true);
    m = mount('label="Icon" value="home" readonly');
    expect(fd(m.form)).to.deep.equal(['home']);
    expect(m.trigger.disabled).to.equal(true);
    m.el.open();
    await raf();
    expect(!!panel()).to.equal(false);
    expect(m.clear.hidden).to.equal(true);
  });

  it('required empty → valueMissing + messages.valueMissing; picking makes it valid', async () => {
    const m = mount('label="Icon" required');
    expect(m.el.checkValidity()).to.equal(false);
    expect(m.el.validity.valueMissing).to.equal(true);
    expect(m.el.validationMessage).to.equal('Vui lòng chọn icon');
    m.el.value = 'home';
    expect(m.el.checkValidity()).to.equal(true);
    expect(m.clear.hidden).to.equal(true); // required: no clear button
  });

  it('form.reset() → the default value; a malformed value → empty', async () => {
    const m = mount('label="Icon" value="home"');
    await openWith(m.el);
    cell('all', 'trash').click();
    expect(fd(m.form)).to.deep.equal(['trash']);
    m.form.reset();
    await raf();
    expect(m.el.value).to.equal('home');
    expect(fd(m.form)).to.deep.equal(['home']);
    const bad = mount('label="Icon" value="<b>"');
    expect(bad.el.value).to.equal('');
    expect(fd(bad.form)).to.deep.equal(['']);
  });
});

describe('2. open / close', () => {
  it('click, Enter, ArrowDown open; Escape closes, focus on the trigger, value kept', async () => {
    const m = mount('label="Icon" value="home"');
    m.trigger.click();
    await until(() => !!panel());
    expect(m.trigger.getAttribute('aria-expanded')).to.equal('true');
    expect(m.trigger.getAttribute('aria-controls')).to.equal(panel().id);
    expect(active() === part('input')).to.equal(true);
    await sendKeys({ press: 'Escape' });
    expect(!!panel()).to.equal(false);
    expect(active() === m.trigger).to.equal(true);
    expect(m.el.value).to.equal('home');
    expect(m.trigger.getAttribute('aria-expanded')).to.equal('false');
    await sendKeys({ press: 'Enter' });
    await until(() => !!panel());
    expect(!!panel()).to.equal(true);
    await sendKeys({ press: 'Escape' });
    await sendKeys({ press: 'ArrowDown' });
    await until(() => !!panel());
    expect(!!panel()).to.equal(true);
    await sendKeys({ press: 'Escape' });
    expect(m.log.change.length).to.equal(0);
  });

  it('a click outside closes; the trigger scrolled out of view closes', async () => {
    const m = mount('label="Icon"');
    await openWith(m.el);
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(!!panel()).to.equal(false);
    host.innerHTML = '<div id="sc" style="height:120px;overflow:auto"><div style="height:40px"></div><td-icon-picker label="Icon"></td-icon-picker><div style="height:2000px"></div></div>';
    const el = host.querySelector('td-icon-picker');
    await openWith(el);
    host.querySelector('#sc').scrollTop = 1500;
    host.querySelector('#sc').dispatchEvent(new Event('scroll'));
    expect(await until(() => !panel())).to.equal(true);
  });

  it('disabled / readonly set while open → closes', async () => {
    const m = mount('label="Icon"');
    await openWith(m.el);
    m.el.setAttribute('readonly', '');
    await raf();
    expect(!!panel()).to.equal(false);
    m.el.removeAttribute('readonly');
    await openWith(m.el);
    m.el.disabled = true;
    await raf();
    expect(!!panel()).to.equal(false);
  });
});

describe('3. grid keyboard', () => {
  it('arrows / Home / End / Ctrl+Home / Ctrl+End / PageDown, short last row, ↑ to the search box, ↓ from it', async () => {
    const icons = 'home user settings trash search star close check plus minus';
    const m = mount(`label="Icon" icons="${icons}"`);
    await openWith(m.el);
    const rows = [...grid('all').children];
    const cols = rows[0].children.length;
    expect(cols >= 4).to.equal(true);
    const names = namesOf('all');
    expect(names.length).to.equal(10);
    // one tab stop per grid
    expect(cellsOf('all').filter((c) => c.tabIndex === 0).length).to.equal(1);
    await sendKeys({ press: 'ArrowDown' }); // from the search box
    expect(activeIcon()).to.equal(names[0]);
    await sendKeys({ press: 'ArrowLeft' });
    expect(activeIcon()).to.equal(names[0]); // row start: stays
    await sendKeys({ press: 'ArrowRight' });
    expect(activeIcon()).to.equal(names[1]);
    await sendKeys({ press: 'End' });
    expect(activeIcon()).to.equal(names[cols - 1]);
    await sendKeys({ press: 'ArrowRight' });
    expect(activeIcon()).to.equal(names[cols - 1]); // row end: stays
    await sendKeys({ press: 'Home' });
    expect(activeIcon()).to.equal(names[0]);
    // ↓ in the last column onto a short last row → its last cell
    await sendKeys({ press: 'End' });
    const lastRow = rows[rows.length - 1];
    for (let i = 0; i < rows.length - 1; i++) await sendKeys({ press: 'ArrowDown' });
    if (lastRow.children.length < cols) expect(activeIcon()).to.equal(names[names.length - 1]);
    await sendKeys({ press: 'Control+Home' });
    expect(activeIcon()).to.equal(names[0]);
    await sendKeys({ press: 'Control+End' });
    expect(activeIcon()).to.equal(names[names.length - 1]);
    expect(cellsOf('all').filter((c) => c.tabIndex === 0).length).to.equal(1);
    await sendKeys({ press: 'Control+Home' });
    await sendKeys({ press: 'PageDown' });
    expect(activeIcon() !== names[0]).to.equal(true);
    await sendKeys({ press: 'Control+Home' });
    await sendKeys({ press: 'ArrowUp' });
    expect(active() === part('input')).to.equal(true);
  });

  it('↑ / ↓ cross between the "Gợi ý" grid and the all grid; Tab cycles input → grids → input', async () => {
    const m = mount('label="Icon" suggestions="star user" icons="home user settings trash search"');
    await openWith(m.el);
    await sendKeys({ press: 'ArrowDown' });
    expect(activeIcon()).to.equal('star');
    expect(active().closest('[data-group]').getAttribute('data-group')).to.equal('suggested');
    await sendKeys({ press: 'ArrowDown' });
    expect(active().closest('[data-group]').getAttribute('data-group')).to.equal('all');
    await sendKeys({ press: 'ArrowUp' });
    expect(active().closest('[data-group]').getAttribute('data-group')).to.equal('suggested');
    part('input').focus();
    await sendKeys({ press: 'Tab' });
    expect(active().closest('[data-group]')?.getAttribute('data-group')).to.equal('suggested');
    await sendKeys({ press: 'Tab' });
    expect(active().closest('[data-group]')?.getAttribute('data-group')).to.equal('all');
    await sendKeys({ press: 'Tab' });
    expect(active() === part('input')).to.equal(true);
    await sendKeys({ press: 'Shift+Tab' });
    expect(active().closest('[data-group]')?.getAttribute('data-group')).to.equal('all');
    expect(!!panel()).to.equal(true);
  });
});

describe('4. pick / clear events', () => {
  it('click a cell → one input + one change with the value, closes, focus on the trigger; same cell → no event', async () => {
    const m = mount('label="Icon"');
    await openWith(m.el);
    cell('all', 'trash').click();
    expect(m.log.input).to.deep.equal(['trash']);
    expect(m.log.change).to.deep.equal(['trash']);
    expect(!!panel()).to.equal(false);
    expect(active() === m.trigger).to.equal(true);
    expect(m.el.querySelector('.td-icon-picker__glyph svg')?.getAttribute('data-icon')).to.equal('trash');
    await openWith(m.el);
    expect(cell('all', 'trash').getAttribute('aria-selected')).to.equal('true');
    expect(cell('all', 'trash').tabIndex).to.equal(0);
    cell('all', 'trash').click();
    expect(m.log.change).to.deep.equal(['trash']);
    expect(!!panel()).to.equal(false);
    expect(m.log.native).to.equal(0);
  });

  it('Enter / Space on a cell picks; clear → "" + events; setValue / value → no event', async () => {
    const m = mount('label="Icon" icons="home user trash"');
    await openWith(m.el);
    await sendKeys({ press: 'ArrowDown' });
    await sendKeys({ press: 'ArrowRight' });
    const name = activeIcon();
    await sendKeys({ press: 'Enter' });
    expect(m.log.change).to.deep.equal([name]);
    expect(m.clear.hidden).to.equal(false);
    m.clear.click();
    expect(m.el.value).to.equal('');
    expect(m.log.input).to.deep.equal([name, '']);
    expect(m.log.change).to.deep.equal([name, '']);
    expect(active() === m.trigger).to.equal(true);
    m.el.setValue('home');
    m.el.value = 'user';
    expect(m.log.change.length).to.equal(2);
    await openWith(m.el);
    await sendKeys({ press: 'ArrowDown' }); // the roving cell = the selected one (user, last of home trash user)
    expect(activeIcon()).to.equal('user');
    await sendKeys({ press: 'Home' });
    await sendKeys({ press: 'Space' });
    expect(m.log.change).to.deep.equal([name, '', 'home']);
  });
});

describe('5. search', () => {
  it('"thung rac" → trash first; Enter picks it; no result → empty note; suggestions hidden while searching; status counts', async () => {
    const m = mount('label="Icon" suggestions="home user"');
    await openWith(m.el);
    await until(() => part('status').textContent === '');
    expect(grid('suggested').closest('section').hidden).to.equal(false);
    await search('thung rac');
    expect(namesOf('all')[0]).to.equal('trash');
    expect(grid('suggested').closest('section').hidden).to.equal(true);
    expect(panel().querySelector('[data-group="all"] .td-icon-picker-panel__heading').textContent).to.equal('Kết quả');
    await tick(350);
    expect(part('status').textContent).to.equal(`${namesOf('all').length} icon`);
    await search('zzzzqqq');
    expect(part('empty').hidden).to.equal(false);
    await search('');
    expect(grid('suggested').closest('section').hidden).to.equal(false);
    expect(part('empty').hidden).to.equal(true);
    await search('thung rac');
    await sendKeys({ press: 'Enter' });
    expect(m.el.value).to.equal('trash');
    expect(m.log.change).to.deep.equal(['trash']);
    expect(m.log.native).to.equal(0);
    expect(!!panel()).to.equal(false);
  });
});

describe('6. lazy metadata load', () => {
  it('called on the first open only, ONCE for two instances; name search works before it lands', async () => {
    let release;
    const gate = new Promise((r) => { release = r; });
    const spy = spyLoader(() => gate.then(() => KIT_LOADER()));
    host.innerHTML = '<td-icon-picker label="A"></td-icon-picker><td-icon-picker label="B"></td-icon-picker>';
    const [a, b] = host.querySelectorAll('td-icon-picker');
    await raf();
    expect(spy.calls).to.equal(0);
    await openWith(a);
    expect(spy.calls).to.equal(1);
    expect(part('status').textContent).to.equal('Đang tải từ khoá tìm kiếm…');
    await search('trash');
    expect(namesOf('all')[0]).to.equal('trash');
    await search('thung rac');
    expect(namesOf('all').includes('trash')).to.equal(false);
    a.close();
    await openWith(b);
    expect(spy.calls).to.equal(1);
    release();
    await until(() => part('status')?.textContent !== 'Đang tải từ khoá tìm kiếm…');
    await search('thung rac');
    expect(namesOf('all')[0]).to.equal('trash');
    expect(cell('all', 'trash').getAttribute('aria-label')).to.not.equal('trash');
  });

  it('the hook throws → error status + Thử lại; retry calls it again; success → keyword search', async () => {
    let fail = true;
    const spy = spyLoader(() => (fail ? Promise.reject(new Error('offline')) : KIT_LOADER()));
    const m = mount('label="Icon"');
    await openWith(m.el);
    expect(await until(() => part('retry') && !part('retry').hidden)).to.equal(true);
    expect(part('status').textContent).to.equal('Không tải được từ khoá — đang tìm theo tên');
    await search('home');
    expect(namesOf('all')[0]).to.equal('home');
    fail = false;
    part('retry').click();
    expect(spy.calls).to.equal(2);
    expect(await until(() => part('retry').hidden)).to.equal(true);
    await search('thung rac');
    expect(namesOf('all')[0]).to.equal('trash');
  });

  it('the hook RESOLVES invalid data (validation throws) → error status + Thử lại; retry calls it again', async () => {
    let bad = true;
    const spy = spyLoader(() => Promise.resolve(bad ? 'not an object' : KIT_LOADER()));
    const m = mount('label="Icon"');
    await openWith(m.el);
    expect(await until(() => part('retry') && !part('retry').hidden)).to.equal(true);
    expect(spy.calls).to.equal(1);
    bad = false;
    part('retry').click();
    expect(spy.calls).to.equal(2);
    expect(await until(() => part('retry').hidden)).to.equal(true);
    await search('thung rac');
    expect(namesOf('all')[0]).to.equal('trash');
  });

  it('security: a loaded object with a huge key set is cut at 2000 entries, fast', async () => {
    const huge = {};
    for (let i = 0; i < 200000; i++) huge[`site-huge-${i}`] = { label: 'X', keywords: { en: ['x'], vi: ['x'] } };
    const warn = console.warn;
    const warns = [];
    console.warn = (msg) => warns.push(String(msg));
    try {
      spyLoader(() => Promise.resolve(huge));
      const m = mount('label="Icon"');
      const t0 = performance.now();
      await openWith(m.el);
      await until(() => part('status')?.textContent === '');
      expect(performance.now() - t0 < 3000).to.equal(true);
      expect(warns.some((w) => /more than 2000 entries/.test(w))).to.equal(true);
    } finally {
      console.warn = warn;
    }
  });

  it('a load landing after close touches nothing (no error); the default loader imports the generated data', async () => {
    let release;
    const gate = new Promise((r) => { release = r; });
    spyLoader(() => gate.then(() => KIT_LOADER()));
    const m = mount('label="Icon"');
    await openWith(m.el);
    const old = panel();
    m.el.close();
    release();
    await tick(20);
    expect(old.isConnected).to.equal(false);
    expect(old.querySelector('.td-icon-picker-panel__status').textContent).to.equal('Đang tải từ khoá tìm kiếm…');
    // the real default loader (a fresh identity → reloaded)
    TdIconPicker.loadSearchData = () => import('../icons/icons-search.js').then((x) => x.default);
    await openWith(m.el);
    await until(() => part('status').textContent === '');
    await search('thung rac');
    expect(namesOf('all')[0]).to.equal('trash');
  });
});

describe('7. site icons + registerIconSearchData', () => {
  it('registered after a first open → present (and searchable by name) at the next open; metadata → keyword search', async () => {
    const m = mount('label="Icon"');
    await openWith(m.el);
    await search('home');
    m.el.close();
    registerIcons({ 'site-v094-kho': { nodes: [['path', { d: 'M3 21V8l9-5 9 5v13' }]] } });
    await openWith(m.el);
    expect(!!cell('all', 'site-v094-kho')).to.equal(true);
    await search('v094 kho');
    expect(namesOf('all')[0]).to.equal('site-v094-kho');
    m.el.close();
    registerIconSearchData({ 'site-v094-kho': { label: 'Kho hàng', keywords: { en: ['warehouse'], vi: ['nhà kho'] } } });
    await openWith(m.el);
    await search('warehouse');
    expect(namesOf('all')[0]).to.equal('site-v094-kho');
    expect(cell('all', 'site-v094-kho').getAttribute('aria-label')).to.equal('Kho hàng');
    expect(() => registerIconSearchData({ trash: { label: 'X', keywords: { en: ['x'], vi: ['x'] } } })).to.throw(/core icon/);
    expect(() => registerIconSearchData({ 'site-v094-kho': { label: 'X', keywords: { en: ['x'], vi: ['x'] } } })).to.throw(/already/);
    expect(() => registerIconSearchData({ 'site-v094-ok': { label: 'X', keywords: { en: ['x'], vi: ['x'] } }, 'site-v094-bad': { label: '' } })).to.throw();
    expect(() => registerIconSearchData({ 'site-v094-ok': { label: 'X', keywords: { en: ['x'], vi: ['x'] } } })).to.not.throw(); // nothing of the refused batch was kept
  });

  it('an alias shadowed by a site name is no longer indexed as the alias', async () => {
    // `chevron-down` is a kit alias of `down`; a site icon with that name wins (registry resolve rule)
    if (!listIcons().includes('chevron-down')) registerIcons({ 'chevron-down': { nodes: [['path', { d: 'M4 4h16' }]] } });
    const m = mount('label="Icon"');
    await openWith(m.el);
    await search('chevron-down');
    expect(namesOf('all')[0]).to.equal('chevron-down');
  });

  it('a value of a site icon not registered yet → data-state="unknown", form value kept; registered → shown at the next render', async () => {
    const m = mount('label="Icon" value="site-v094-later"');
    const text = m.el.querySelector('.td-icon-picker__text');
    expect(text.getAttribute('data-state')).to.equal('unknown');
    expect(text.textContent).to.equal('site-v094-later');
    expect(fd(m.form)).to.deep.equal(['site-v094-later']);
    registerIcons({ 'site-v094-later': { nodes: [['path', { d: 'M4 4h16' }]] } });
    await openWith(m.el);
    expect(text.getAttribute('data-state')).to.equal('value');
    expect(cell('all', 'site-v094-later').getAttribute('aria-selected')).to.equal('true');
  });
});

describe('7b. registerIconSearchData limits', () => {
  it('a huge key set throws "at most 2000" (walk stops early); a multi-MB label throws', () => {
    const huge = {};
    for (let i = 0; i < 200000; i++) huge[`site-big-${i}`] = { label: 'X', keywords: { en: ['x'], vi: ['x'] } };
    const t0 = performance.now();
    let msg = '';
    try { registerIconSearchData(huge); } catch (e) { msg = e.message; }
    expect(/at most 2000 entries/.test(msg)).to.equal(true);
    let msg2 = '';
    try { registerIconSearchData({ 'site-big-label': { label: 'a'.repeat(4 * 1024 * 1024), keywords: { en: ['x'], vi: ['x'] } } }); } catch (e) { msg2 = e.message; }
    expect(/1–48 characters/.test(msg2)).to.equal(true);
    expect(performance.now() - t0 < 2000).to.equal(true);
  });
});

describe('8. suggestions', () => {
  it('attribute + property (property wins), unknown dropped, ≤ 24, both cells aria-selected', async () => {
    const m = mount('label="Icon" value="home" suggestions="home user nope x"');
    expect(m.el.suggestions).to.deep.equal(['home', 'user', 'close']);
    m.el.suggestions = ['star', 'home', 'bogus', 'star'];
    expect(m.el.suggestions).to.deep.equal(['star', 'home']);
    const all = listIcons().filter((n) => /^[a-z]/.test(n)).slice(0, 30);
    m.el.suggestions = all;
    expect(m.el.suggestions.length).to.equal(24);
    m.el.suggestions = ['star', 'home'];
    await openWith(m.el);
    expect(namesOf('suggested')).to.deep.equal(['star', 'home']);
    expect(cell('suggested', 'home').getAttribute('aria-selected')).to.equal('true');
    expect(cell('all', 'home').getAttribute('aria-selected')).to.equal('true');
    expect(cell('suggested', 'home') !== cell('all', 'home')).to.equal(true);
    m.el.suggestions = null; // back to the attribute
    expect(m.el.suggestions).to.deep.equal(['home', 'user', 'close']);
  });

  it('icons limits the grid (suggestions outside the set still show; the value outside the set is kept)', async () => {
    const m = mount('label="Icon" value="star" icons="home user trash" suggestions="search"');
    await openWith(m.el);
    expect(namesOf('all')).to.deep.equal(['home', 'trash', 'user']);
    expect(namesOf('suggested')).to.deep.equal(['search']);
    expect(m.el.value).to.equal('star');
  });
});

describe('9. XSS', () => {
  it('site label / keywords with markup show verbatim (caption / aria-label), never as elements', async () => {
    const evil = '<img src=x onerror=window.__xss=1>';
    registerIcons({ 'site-v094-xss': { nodes: [['path', { d: 'M4 4h16' }]] } });
    registerIconSearchData({ 'site-v094-xss': { label: evil.slice(0, 48), keywords: { en: ['xss'], vi: ['xss'] } } });
    const m = mount(`label="${'&lt;b&gt;x&lt;/b&gt;'}" placeholder="&lt;i&gt;p&lt;/i&gt;"`);
    expect(m.el.querySelector('.td-icon-picker__label').textContent).to.equal('<b>x</b>');
    expect(m.el.querySelector('.td-icon-picker__text').textContent).to.equal('<i>p</i>');
    await openWith(m.el);
    const c = cell('all', 'site-v094-xss');
    expect(c.getAttribute('aria-label')).to.equal(evil.slice(0, 48));
    c.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }));
    expect(part('caption').textContent.startsWith('<img')).to.equal(true);
    expect(panel().querySelector('img')).to.equal(null);
    expect(m.el.querySelector('img, b, i')).to.equal(null);
    expect(window.__xss).to.equal(undefined);
  });
});

describe('10. scale', () => {
  it('600 more site icons → open, all cells, filter right; filtering moves the same cell nodes (no new SVG)', async () => {
    const defs = {};
    for (let i = 0; i < 600; i++) defs[`site-v094-bulk-${i}`] = { nodes: [['path', { d: 'M4 4h16' }]] };
    registerIcons(defs);
    const m = mount('label="Icon"');
    await openWith(m.el);
    expect(cellsOf('all').length).to.equal(listIcons().length);
    const before = cell('all', 'site-v094-bulk-7');
    const svg = before.firstElementChild;
    await search('bulk 7');
    expect(namesOf('all').includes('site-v094-bulk-7')).to.equal(true);
    expect(namesOf('all').every((n) => n.includes('7'))).to.equal(true);
    expect(cell('all', 'site-v094-bulk-7') === before).to.equal(true);
    expect(before.firstElementChild === svg).to.equal(true);
    await search('');
    expect(cell('all', 'site-v094-bulk-7') === before).to.equal(true);
  });
});

describe('11. touch', () => {
  let real;
  beforeEach(() => {
    real = window.matchMedia;
    window.matchMedia = (q) => {
      if (q !== '(hover: none) and (pointer: coarse)') return real.call(window, q);
      return { matches: true, media: q, addEventListener() {}, removeEventListener() {} };
    };
  });
  afterEach(() => { window.matchMedia = real; });

  it('coarse pointer: open focuses the selected cell (not the search box)', async () => {
    const m = mount('label="Icon" value="trash"');
    await openWith(m.el);
    expect(activeIcon()).to.equal('trash');
    expect(active() === part('input')).to.equal(false);
  });

  it('coarse pointer: the selected cell in ANY grid wins (value outside the suggestions → the all grid); no value → first grid roving cell', async () => {
    const m = mount('label="Icon" value="trash" suggestions="home user"');
    await openWith(m.el);
    expect(activeIcon()).to.equal('trash');
    expect(grid('all').contains(active())).to.equal(true);
    m.el.close({ focus: false });
    const m2 = mount('label="Icon" suggestions="home user"');
    await openWith(m2.el);
    expect(activeIcon()).to.equal('home');
    expect(grid('suggested').contains(active())).to.equal(true);
  });

  it('cells are ≥ 44px under (pointer: coarse) (the CSS token rule; WTR cannot emulate the media query)', () => {
    const rules = [];
    const walk = (list) => { for (const r of list) { if (r.cssRules) walk(r.cssRules); if (r.media && /pointer:\s*coarse/.test(r.media.mediaText)) rules.push(r.cssText); } };
    for (const s of document.styleSheets) { try { walk(s.cssRules); } catch { /* cross-origin */ } }
    expect(rules.some((t) => /--td-icon-picker-cell:\s*max\(2\.75rem/.test(t))).to.equal(true);
  });
});

describe('11b. headings + caption', () => {
  it('group headings are role="heading" aria-level="3", naming their grid', async () => {
    const m = mount('label="Icon" suggestions="home"');
    await openWith(m.el);
    const hs = [...panel().querySelectorAll('.td-icon-picker-panel__heading')];
    expect(hs.map((h) => [h.getAttribute('role'), h.getAttribute('aria-level')])).to.deep.equal([['heading', '3'], ['heading', '3']]);
    expect(grid('suggested').getAttribute('aria-labelledby')).to.equal(hs[0].id);
  });

  it('the pointer leaving a cell for a non-cell (inside the body) → caption back to the selected icon', async () => {
    const m = mount('label="Icon" value="trash"');
    await openWith(m.el);
    const base = part('caption').textContent;
    expect(base.includes('trash')).to.equal(true);
    const home = cell('all', 'home');
    const pe = (type, target, related) => target.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType: 'mouse', relatedTarget: related }));
    pe('pointerover', home, grid('all'));
    expect(part('caption').textContent.includes('home')).to.equal(true);
    // into the cell's own child: unchanged
    const child = home.firstElementChild;
    if (child) {
      pe('pointerout', home, child);
      expect(part('caption').textContent.includes('home')).to.equal(true);
    }
    // to the grid gap (a non-cell): back to the selected icon
    pe('pointerout', home, grid('all'));
    expect(part('caption').textContent).to.equal(base);
  });
});

describe('12. theme', () => {
  it('opened from a data-td-theme="dark" region: the popup carries the region theme (bridgeTheme)', async () => {
    host.innerHTML = '<section data-td-theme="dark"><td-icon-picker label="Icon"></td-icon-picker></section>';
    const el = host.querySelector('td-icon-picker');
    await openWith(el);
    expect(panel().getAttribute('data-td-theme')).to.equal('dark');
    el.close();
    expect(!!panel()).to.equal(false);
  });
});
