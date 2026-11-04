// v0.96.0 (dwp K10) — lightbox toggle toolbar buttons: `pressed(ctx)` (kit-owned aria-pressed, per slide), `pressedIcon`,
// `busy` (default = has `pressed`: an onClick thenable → aria-busy + aria-disabled until it settles, the button-busy contract
// without a spinner), handle.refreshToolbar(), the "Thêm" menu (< 480 px) as a plain item with a hint.
// Plan: docs/internal/plans/v0.96.0-lightbox-toggle.md §7. Chromium + Firefox + WebKit, no real mouse. DOM nodes are compared
// as booleans (a failing chai assertion carrying DOM nodes hangs the runner).
import { expect } from '@esm-bundle/chai';
import { setViewport, sendKeys } from '@web/test-runner-commands';
import { TdLightbox } from './td-lightbox.js';
import { registerIcons } from '../icons/td-icon.js';

const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

// the site registers its filled star (no core `star-filled`, owner Q1)
registerIcons({ 'v096-star-filled': { viewBox: '0 0 24 24', paint: 'fill', nodes: [['path', { d: 'M12 2l3 7h7l-5.5 4.5 2 7.5L12 17l-6.5 4 2-7.5L2 9h7z' }]] } });

const IMGS = ['/test/fixtures/1.svg', '/test/fixtures/2.svg', '/test/fixtures/3.svg'];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const overlay = () => document.querySelector('.td-lightbox');
const btn = (id) => overlay().querySelector(`[data-extra="${id}"]`);
const menu = () => document.querySelector('.td-menu[data-state="open"]');
async function until(cond, n = 150) { for (let i = 0; i < n && !cond(); i++) await wait(10); return !!cond(); }
/** a promise with its resolve / reject outside */
function deferred() {
  let resolve; let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
/** console.warn / console.error spies (restored in afterEach) */
const logs = { warn: [], error: [] };
const orig = { warn: console.warn, error: console.error };
beforeEach(() => {
  logs.warn = []; logs.error = [];
  console.warn = (...a) => { logs.warn.push(a); };
  console.error = (...a) => { logs.error.push(a); };
});
afterEach(async () => {
  console.warn = orig.warn; console.error = orig.error;
  TdLightbox.close();
  await wait(30);
});
const toolbarWarns = () => logs.warn.filter((a) => typeof a[0] === 'string' && a[0].startsWith('td-lightbox toolbar'));

/** `pressed` reads a mutable "cover" index; onClick sets it (async when `later`). */
function coverSpec(state, extra = {}) {
  return {
    id: 'cover',
    label: 'Đặt làm ảnh bìa',
    icon: 'star',
    pressed: (ctx) => ctx.index === state.cover,
    onClick: (ctx) => { state.clicks.push(ctx.index); state.cover = ctx.index; },
    ...extra,
  };
}

describe('v0.96.0 lightbox toggle — pressed', () => {
  it('true / false / throw / a truthy non-boolean → aria-pressed true / false / false (+1 warn) / false', () => {
    TdLightbox.open(IMGS, { toolbar: [
      { id: 'a', label: 'A', icon: 'star', pressed: () => true, onClick() {} },
      { id: 'b', label: 'B', icon: 'star', pressed: () => false, onClick() {} },
      { id: 'c', label: 'C', icon: 'star', pressed: () => { throw new Error('x'); }, onClick() {} },
      { id: 'd', label: 'D', icon: 'star', pressed: () => 1, onClick() {} },
      { id: 'e', label: 'E', icon: 'star', onClick() {} },
    ] });
    expect(btn('a').getAttribute('aria-pressed')).to.equal('true');
    expect(btn('b').getAttribute('aria-pressed')).to.equal('false');
    expect(btn('c').getAttribute('aria-pressed')).to.equal('false');
    expect(btn('d').getAttribute('aria-pressed')).to.equal('false');
    expect(btn('e').hasAttribute('aria-pressed'), 'no pressed → the kit never touches aria-pressed').to.equal(false);
    TdLightbox.open(IMGS, { toolbar: [{ id: 'c', label: 'C', icon: 'star', pressed: () => { throw new Error('y'); }, onClick() {} }] }).next();
    expect(toolbarWarns().length, 'one warn per id + kind per open').to.equal(2);
  });

  it('per slide, right on the first paint of an open at a middle index; visible() false → pressed not called', () => {
    const state = { cover: 1, clicks: [] };
    const calls = [];
    const lb = TdLightbox.open(IMGS, { index: 1, toolbar: [coverSpec(state, {
      pressed: (ctx) => { calls.push(ctx.index); return ctx.index === state.cover; },
      visible: (ctx) => ctx.index !== 2,
    })] });
    expect(btn('cover').getAttribute('aria-pressed')).to.equal('true');
    lb.prev();
    expect(btn('cover').getAttribute('aria-pressed')).to.equal('false');
    lb.goTo(2);
    expect(btn('cover').hidden).to.equal(true);
    expect(calls.includes(2), 'pressed not called on a hidden slide').to.equal(false);
  });

  it('a synchronous onClick re-reads pressed; a throwing one logs console.error and still re-reads; the viewer survives', () => {
    const state = { cover: -1, clicks: [] };
    const lb = TdLightbox.open(IMGS, { toolbar: [coverSpec(state)] });
    btn('cover').click();
    expect(btn('cover').getAttribute('aria-pressed')).to.equal('true');
    expect(btn('cover').hasAttribute('aria-busy'), 'sync → never busy').to.equal(false);
    lb.removeToolbarButton('cover');
    lb.addToolbarButton(coverSpec(state, { onClick: () => { state.cover = 9; throw new Error('boom'); } }));
    btn('cover').click();
    expect(logs.error.length).to.equal(1);
    expect(btn('cover').getAttribute('aria-pressed')).to.equal('false');
    lb.next();
    expect(TdLightbox.isOpen).to.equal(true);
  });
});

describe('v0.96.0 lightbox toggle — busy', () => {
  it('a promise → busy (aria-busy + aria-disabled, not disabled, focus kept, clicks / Enter / Space swallowed); resolve → released + re-read', async () => {
    const state = { cover: -1, clicks: [] };
    const d = deferred();
    TdLightbox.open(IMGS, { toolbar: [coverSpec(state, { onClick: (ctx) => { state.clicks.push(ctx.index); return d.promise.then(() => { state.cover = ctx.index; }); } })] });
    await wait(60);
    const b = btn('cover');
    let site = 0;
    b.addEventListener('click', () => { site += 1; });
    b.focus();
    b.click();
    expect(b.getAttribute('aria-busy')).to.equal('true');
    expect(b.getAttribute('aria-disabled')).to.equal('true');
    expect(b.disabled).to.equal(false);
    expect(site, 'the first click reaches the site listener').to.equal(1);
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
    b.dispatchEvent(ev);
    expect(ev.defaultPrevented, 'swallowed').to.equal(true);
    await sendKeys({ press: 'Enter' });
    await sendKeys({ press: 'Space' });
    expect(state.clicks.length, 'onClick once').to.equal(1);
    expect(site, 'site listener not reached while busy').to.equal(1);
    expect(document.activeElement === b, 'focus kept').to.equal(true);
    // opacity has a short transition (--td-lb-dur-fast) → wait for the settled value
    expect(await until(() => getComputedStyle(b).opacity === '0.5'), `dimmed (${getComputedStyle(b).opacity})`).to.equal(true);
    d.resolve();
    expect(await until(() => !b.hasAttribute('aria-busy'))).to.equal(true);
    expect(b.hasAttribute('aria-disabled')).to.equal(false);
    expect(b.getAttribute('aria-pressed')).to.equal('true');
    expect(getComputedStyle(b).color).to.equal('rgb(255, 214, 10)');
  });

  it('reject → released, fail closed, ONE warn even when rejected twice in a row', async () => {
    const state = { cover: -1, clicks: [] };
    TdLightbox.open(IMGS, { toolbar: [coverSpec(state, { onClick: () => Promise.reject(new Error('no')) })] });
    btn('cover').click();
    expect(await until(() => !btn('cover').hasAttribute('aria-busy'))).to.equal(true);
    btn('cover').click();
    expect(await until(() => !btn('cover').hasAttribute('aria-busy'))).to.equal(true);
    await wait(10);
    expect(toolbarWarns().length).to.equal(1);
    expect(btn('cover').getAttribute('aria-pressed')).to.equal('false');
  });

  it('busy belongs to the button: swipe to B while pending → still busy; settle → pressed(ctx of B); onClick got A', async () => {
    const state = { cover: -1, clicks: [] };
    const d = deferred();
    const seen = [];
    const lb = TdLightbox.open(IMGS, { toolbar: [coverSpec(state, {
      pressed: (ctx) => { seen.push(ctx.index); return ctx.index === state.cover; },
      onClick: (ctx) => { state.clicks.push(ctx.index); return d.promise.then(() => { state.cover = ctx.index; }); },
    })] });
    btn('cover').click();
    lb.next();
    expect(btn('cover').getAttribute('aria-busy'), 'still busy on B').to.equal('true');
    btn('cover').click();
    expect(state.clicks.join(), 'onClick ran once, with A').to.equal('0');
    seen.length = 0;
    d.resolve();
    expect(await until(() => !btn('cover').hasAttribute('aria-busy'))).to.equal(true);
    expect(seen.join(), 're-read for the CURRENT slide').to.equal('1');
    expect(btn('cover').getAttribute('aria-pressed')).to.equal('false');
    lb.prev();
    expect(btn('cover').getAttribute('aria-pressed')).to.equal('true');
  });

  it('close / a new open / removeToolbarButton / replacing the id while pending → a late settle touches nothing', async () => {
    for (const how of ['close', 'reopen', 'remove', 'replace']) {
      const d = deferred();
      const state = { cover: -1, clicks: [] };
      const lb = TdLightbox.open(IMGS, { toolbar: [coverSpec(state, { onClick: () => d.promise })] });
      const old = btn('cover');
      old.click();
      expect(old.getAttribute('aria-busy')).to.equal('true');
      let fresh = null;
      if (how === 'close') lb.close();
      if (how === 'reopen') TdLightbox.open(IMGS, { toolbar: [coverSpec({ cover: 0, clicks: [] })] });
      if (how === 'remove') lb.removeToolbarButton('cover');
      if (how === 'replace') lb.addToolbarButton(coverSpec({ cover: 0, clicks: [] }));
      if (how === 'reopen' || how === 'replace') fresh = btn('cover');
      d.resolve();
      await wait(20);
      if (fresh) {
        expect(fresh.hasAttribute('aria-busy'), `${how}: the new button is not busy`).to.equal(false);
        expect(fresh.getAttribute('aria-pressed'), `${how}: untouched`).to.equal('true');
      }
      expect(logs.error.length + toolbarWarns().length, how).to.equal(0);
      TdLightbox.close();
      await wait(20);
    }
  });

  it('hostile thenables: then throws, a throwing then getter, resolve-then-reject / a callback called twice → one settle', async () => {
    const thenables = [
      { then() { throw new Error('t'); } },
      Object.defineProperty({}, 'then', { get() { throw new Error('g'); } }),
      { then(ok, fail) { ok(); fail(new Error('late')); ok(); } },
    ];
    for (const r of thenables) {
      const state = { cover: -1, clicks: [] };
      TdLightbox.open(IMGS, { toolbar: [coverSpec(state, { onClick: () => r })] });
      btn('cover').click();
      expect(await until(() => !btn('cover').hasAttribute('aria-busy'))).to.equal(true);
      expect(TdLightbox.isOpen).to.equal(true);
    }
    expect(toolbarWarns().length, 'then throws + getter throws (each in its own open), resolve-first is ok').to.equal(2);
  });

  it('pressed + busy: false + a rejecting promise → no busy UI, no unhandled rejection, one warn; a 0.95.0 spec is not observed', async () => {
    const unhandled = [];
    const onUnhandled = (e) => { unhandled.push(e.reason); e.preventDefault(); };
    window.addEventListener('unhandledrejection', onUnhandled);
    try {
      const state = { cover: -1, clicks: [] };
      TdLightbox.open(IMGS, { toolbar: [coverSpec(state, { busy: false, onClick: () => Promise.reject(new Error('r')) })] });
      btn('cover').click();
      expect(btn('cover').hasAttribute('aria-busy')).to.equal(false);
      await wait(30);
      expect(toolbarWarns().length).to.equal(1);
      expect(unhandled.length).to.equal(0);
      // a plain button without `pressed` (0.95.0): the promise is dropped as before → the site's unhandled rejection
      TdLightbox.open(IMGS, { toolbar: [{ id: 'old', label: 'Old', icon: 'star', onClick: () => Promise.reject(new Error('old')) }] });
      btn('old').click();
      expect(btn('old').hasAttribute('aria-busy')).to.equal(false);
      await wait(30);
      expect(unhandled.length, 'not observed').to.equal(1);
      expect(toolbarWarns().length).to.equal(1);
    } finally {
      window.removeEventListener('unhandledrejection', onUnhandled);
    }
  });

  it('busy, then a slide where visible() is false → settle does not call pressed; both busy and busy: false', async () => {
    for (const busy of [undefined, false]) {
      const d = deferred();
      const state = { cover: -1, clicks: [] };
      const seen = [];
      const lb = TdLightbox.open(IMGS, { toolbar: [coverSpec(state, {
        ...(busy === false ? { busy: false } : {}),
        visible: (ctx) => ctx.index !== 1,
        pressed: (ctx) => { seen.push(ctx.index); return ctx.index === state.cover; },
        onClick: (ctx) => d.promise.then(() => { state.cover = ctx.index; }),
      })] });
      btn('cover').click();
      lb.next();
      seen.length = 0;
      d.resolve();
      await wait(20);
      expect(seen.length, `busy ${busy}: pressed not called while hidden`).to.equal(0);
      expect(btn('cover').hasAttribute('aria-busy')).to.equal(false);
      lb.prev();
      expect(btn('cover').getAttribute('aria-pressed')).to.equal('true');
      TdLightbox.close();
      await wait(20);
    }
  });

  it('replacing a button with the same id and failing again does not warn twice (dedupe per open)', async () => {
    const lb = TdLightbox.open(IMGS, { toolbar: [coverSpec({ cover: -1, clicks: [] }, { onClick: () => Promise.reject(new Error('1')) })] });
    btn('cover').click();
    await until(() => !btn('cover').hasAttribute('aria-busy'));
    lb.addToolbarButton(coverSpec({ cover: -1, clicks: [] }, { onClick: () => Promise.reject(new Error('2')) }));
    btn('cover').click();
    await until(() => !btn('cover').hasAttribute('aria-busy'));
    await wait(10);
    expect(toolbarWarns().length).to.equal(1);
  });

  it('a button without pressed: data-on still painted, a promise is not busy; busy: true opts in', async () => {
    const d = deferred();
    TdLightbox.open(IMGS, { toolbar: [
      { id: 'plain', label: 'P', icon: 'star', onClick: (ctx, b) => { b.toggleAttribute('data-on'); return d.promise; } },
      { id: 'opt', label: 'O', icon: 'star', busy: true, onClick: () => d.promise },
    ] });
    btn('plain').click();
    expect(btn('plain').hasAttribute('aria-busy')).to.equal(false);
    expect(btn('plain').hasAttribute('aria-pressed')).to.equal(false);
    expect(getComputedStyle(btn('plain')).color).to.equal('rgb(255, 214, 10)');
    btn('opt').click();
    expect(btn('opt').getAttribute('aria-busy')).to.equal('true');
    d.resolve();
    expect(await until(() => !btn('opt').hasAttribute('aria-busy'))).to.equal(true);
    expect(btn('opt').hasAttribute('aria-pressed')).to.equal(false);
  });
});

describe('v0.96.0 lightbox toggle — pressedIcon + refreshToolbar', () => {
  it('svg[data-icon] follows the state; an unknown name keeps the icon; refreshToolbar() re-reads', () => {
    const state = { cover: 0, clicks: [] };
    const lb = TdLightbox.open(IMGS, { toolbar: [
      coverSpec(state, { pressedIcon: 'v096-star-filled' }),
      { ...coverSpec(state, { pressedIcon: 'v096-no-such-icon' }), id: 'typo' },
    ] });
    const name = (id) => btn(id).querySelector('svg').getAttribute('data-icon');
    expect(name('cover')).to.equal('v096-star-filled');
    expect(name('typo')).to.equal('star');
    lb.next();
    expect(name('cover')).to.equal('star');
    state.cover = 1;
    expect(btn('cover').getAttribute('aria-pressed'), 'not yet').to.equal('false');
    lb.refreshToolbar();
    expect(btn('cover').getAttribute('aria-pressed')).to.equal('true');
    expect(name('cover')).to.equal('v096-star-filled');
    expect(btn('cover').querySelectorAll('svg').length).to.equal(1);
  });
});

describe('v0.96.0 lightbox toggle — "Thêm" menu (< 480 px)', () => {
  after(async () => { await setViewport({ width: 800, height: 600 }); });

  async function openMenu() {
    const more = overlay().querySelector('[data-action="more"]');
    more.focus();
    await sendKeys({ press: 'Enter' });
    expect(await until(() => !!menu()), 'menu open').to.equal(true);
    return [...menu().querySelectorAll('.td-menu__item')].find((i) => i.textContent.includes('Đặt làm ảnh bìa'));
  }

  it('a plain menuitem with the state hint; busy → aria-disabled + busy hint; select → closes + onClick once', async () => {
    await setViewport({ width: 360, height: 780 });
    const state = { cover: 0, clicks: [] };
    const d = deferred();
    TdLightbox.open(IMGS, { toolbar: [coverSpec(state, { pressedIcon: 'v096-star-filled',
      onClick: (ctx) => { state.clicks.push(ctx.index); return d.promise; } })] });
    await wait(150);
    let item = await openMenu();
    expect(!!item).to.equal(true);
    expect(item.getAttribute('role')).to.equal('menuitem');
    expect(item.querySelector('.td-menu__hint')?.textContent).to.equal('Đang bật');
    expect(item.querySelector('svg')?.getAttribute('data-icon')).to.equal('v096-star-filled');
    item.click();
    expect(await until(() => !menu()), 'closed').to.equal(true);
    expect(state.clicks.length).to.equal(1);
    expect(btn('cover').getAttribute('aria-busy')).to.equal('true');
    item = await openMenu();
    expect(item.getAttribute('aria-disabled')).to.equal('true');
    expect(item.querySelector('.td-menu__hint')?.textContent).to.equal('Đang xử lý…');
    item.click();
    expect(state.clicks.length, 'busy item does nothing').to.equal(1);
    await sendKeys({ press: 'Escape' });
    await until(() => !menu());
    d.resolve();
    expect(await until(() => !btn('cover').hasAttribute('aria-busy'))).to.equal(true);
  });

  it('busy between opening the menu and selecting → onClick does not run again', async () => {
    await setViewport({ width: 360, height: 780 });
    const state = { cover: -1, clicks: [] };
    const d = deferred();
    TdLightbox.open(IMGS, { toolbar: [coverSpec(state, { onClick: (ctx) => { state.clicks.push(ctx.index); return d.promise; } })] });
    await wait(150);
    const item = await openMenu();
    expect(item.hasAttribute('aria-disabled')).to.equal(false);
    btn('cover').click(); // became busy from elsewhere while the menu is open
    expect(state.clicks.length).to.equal(1);
    item.click();
    await until(() => !menu());
    expect(state.clicks.length).to.equal(1);
    d.resolve();
  });
});
