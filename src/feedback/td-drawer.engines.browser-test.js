import { expect } from '@esm-bundle/chai';
import { sendKeys, setViewport, emulateMedia } from '@web/test-runner-commands';

// v0.27.0 (plan v0.27.0-dsuite-p0a §C) — <td-drawer> / TdDrawer.open in Chromium, Firefox AND WebKit (group `engines`).
// DOM nodes are compared as booleans (`a === b`): a failing chai assertion carrying DOM nodes hangs the runner.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

// No-JS contract: before the module is defined, a declarative drawer shows its content in place (CSS only).
const pre = document.createElement('div');
pre.innerHTML = '<td-drawer title="Bộ lọc"><p class="pre-content">Nội dung không JS</p></td-drawer>';
document.body.appendChild(pre);
const preVisible = {
  display: getComputedStyle(pre.querySelector('td-drawer')).display,
  height: pre.querySelector('.pre-content').getBoundingClientRect().height,
};
pre.remove();

const { TdDrawer } = await import('./td-drawer.js');
const { TdModal } = await import('./td-modal.js');
const { TdLightbox } = await import('./td-lightbox.js');
await import('../form/td-dropdown.js');
const { isScrollLocked } = await import('../utils/scroll-lock.js');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const frames = (n = 2) => new Promise((r) => {
  const f = () => (--n <= 0 ? r() : requestAnimationFrame(f));
  requestAnimationFrame(f);
});
const roots = () => [...document.body.querySelectorAll(':scope > .td-drawer-root')];
const openRoot = () => roots().find((r) => r.getAttribute('data-state') !== 'closing') || null;
const nextEvent = (el, name) => new Promise((r) => el.addEventListener(name, r, { once: true }));
const IMG = '/td-v027-missing.png';

const extra = [];
function mount(html) {
  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  document.body.appendChild(wrap);
  extra.push(() => wrap.remove());
  return wrap;
}

afterEach(async () => {
  TdLightbox.close();
  TdModal.closeAll();
  document.querySelectorAll('td-drawer').forEach((d) => { if (d.open) d._releaseNow?.(); });
  extra.splice(0).forEach((f) => f());
  await setViewport({ width: 800, height: 600 });
  await emulateMedia({ reducedMotion: 'no-preference' });
  await wait(350);
});

describe('td-drawer — no JS (v0.27.0 §C)', () => {
  it('an undefined declarative drawer shows its content in place', () => {
    expect(preVisible.display).to.not.equal('none');
    expect(preVisible.height > 0, 'content laid out').to.equal(true);
  });
});

describe('td-drawer — declarative lifecycle', () => {
  it('open attribute: body-child root, children MOVED (identity kept), dialog semantics, title names it', async () => {
    const wrap = mount(`<button class="opener">Mở</button>
      <td-drawer id="dr1" title="Bộ lọc"><div slot="header" class="hx">Phụ</div><p class="c1">Một</p>chữ<input class="c2"><div slot="footer"><button class="f1">Lưu</button></div></td-drawer>`);
    const host = wrap.querySelector('td-drawer');
    const c1 = host.querySelector('.c1');
    const c2 = host.querySelector('.c2');
    const before = [...host.childNodes];
    wrap.querySelector('.opener').focus();
    const opened = nextEvent(host, 'open');
    host.setAttribute('open', '');
    expect(host.open).to.equal(true);
    const root = openRoot();
    expect(!!root && root.parentNode === document.body).to.equal(true);
    const panel = root.querySelector('.td-drawer__panel');
    expect(panel.getAttribute('role')).to.equal('dialog');
    expect(panel.getAttribute('aria-modal')).to.equal('true');
    const title = root.querySelector('h2.td-drawer__title');
    expect(title.textContent).to.equal('Bộ lọc');
    expect(panel.getAttribute('aria-labelledby')).to.equal(title.id);
    expect(root.querySelector('.td-drawer__body').contains(c1)).to.equal(true);
    expect(root.querySelector('.td-drawer__body').contains(c2)).to.equal(true);
    expect(root.querySelector('.td-drawer__header').contains(root.querySelector('.hx'))).to.equal(true);
    expect(root.querySelector('.td-drawer__footer').contains(root.querySelector('.f1'))).to.equal(true);
    expect(host.childNodes.length).to.equal(0);
    await opened;
    expect(panel.contains(document.activeElement), 'focus set before `open`').to.equal(true);
    expect(document.activeElement === c2, 'first field focused').to.equal(true);
    // close: before-close → transition → nodes back → close
    const log = [];
    host.addEventListener('before-close', (e) => log.push(['before-close', e.detail.reason, e.cancelable]));
    const closed = new Promise((r) => host.addEventListener('close', (e) => {
      log.push(['close', e.detail.reason, root.isConnected, host.childNodes.length]);
      r();
    }, { once: true }));
    root.querySelector('.td-drawer__close').click();
    expect(host.hasAttribute('open')).to.equal(false);
    expect(log).to.deep.equal([['before-close', 'button', true]]);
    await closed;
    expect(log[1]).to.deep.equal(['close', 'button', false, before.length]);
    expect([...host.childNodes].every((n, i) => n === before[i]), 'same nodes, same order').to.equal(true);
    expect(roots().length).to.equal(0);
    expect(document.activeElement === wrap.querySelector('.opener'), 'focus back on the opener').to.equal(true);
  });

  it('show() / close() are idempotent; open property and attribute reflect both ways', async () => {
    const wrap = mount('<td-drawer label="Thông tin"><p>x</p></td-drawer>');
    const host = wrap.querySelector('td-drawer');
    let opens = 0;
    let closes = 0;
    host.addEventListener('open', () => { opens++; });
    host.addEventListener('close', () => { closes++; });
    host.show();
    host.show();
    expect(roots().length).to.equal(1);
    expect(host.hasAttribute('open')).to.equal(true);
    await wait(450); // `open` fires after the entrance transition (review round 1 IMPL-1)
    host.open = false;
    expect(host.hasAttribute('open')).to.equal(false);
    host.close();
    await wait(400);
    expect(opens).to.equal(1);
    expect(closes).to.equal(1);
    host.close(); // already closed → nothing
    await wait(50);
    expect(closes).to.equal(1);
    host.open = true;
    expect(host.hasAttribute('open')).to.equal(true);
    expect(roots().length).to.equal(1);
    const r = await host.close();
    expect(r).to.equal('programmatic');
  });

  it('dismissible (default): Escape and a backdrop click close with their reason', async () => {
    const wrap = mount('<td-drawer label="A"><input></td-drawer>');
    const host = wrap.querySelector('td-drawer');
    const reasons = [];
    host.addEventListener('close', (e) => reasons.push(e.detail.reason));
    host.show();
    await wait(100);
    await sendKeys({ press: 'Escape' });
    await wait(400);
    host.show();
    await wait(100);
    openRoot().querySelector('.td-drawer__backdrop').click();
    await wait(400);
    expect(reasons).to.deep.equal(['escape', 'backdrop']);
  });

  it('dismissible="false": Escape and backdrop do nothing; the × button and close() still work', async () => {
    const wrap = mount('<td-drawer label="A" dismissible="false"><input></td-drawer>');
    const host = wrap.querySelector('td-drawer');
    let reached = 0;
    const onDoc = (e) => { if (e.key === 'Escape') reached++; };
    document.addEventListener('keydown', onDoc);
    extra.push(() => document.removeEventListener('keydown', onDoc));
    host.show();
    await wait(100);
    await sendKeys({ press: 'Escape' });
    openRoot().querySelector('.td-drawer__backdrop').click();
    await wait(300);
    expect(host.open).to.equal(true);
    expect(reached, 'Escape consumed by the drawer layer').to.equal(0);
    openRoot().querySelector('.td-drawer__close').click();
    await wait(400);
    expect(host.open).to.equal(false);
  });

  it('before-close is cancelable on every path (unsaved form); open stays reflected', async () => {
    const wrap = mount('<td-drawer label="A"><input></td-drawer>');
    const host = wrap.querySelector('td-drawer');
    const seen = [];
    host.addEventListener('before-close', (e) => { seen.push(e.detail.reason); e.preventDefault(); });
    let closes = 0;
    host.addEventListener('close', () => { closes++; });
    host.show();
    await wait(100);
    await sendKeys({ press: 'Escape' });
    openRoot().querySelector('.td-drawer__backdrop').click();
    openRoot().querySelector('.td-drawer__close').click();
    const r = await host.close();
    host.removeAttribute('open');
    await wait(300);
    expect(seen).to.deep.equal(['escape', 'backdrop', 'button', 'programmatic', 'programmatic']);
    expect(r).to.equal(null);
    expect(closes).to.equal(0);
    expect(host.open).to.equal(true);
    expect(host.hasAttribute('open')).to.equal(true);
    expect(roots().length).to.equal(1);
  });

  it('focus trap (Tab / Shift+Tab wrap inside), page inert, scroll locked while open', async () => {
    const wrap = mount('<button class="out">ngoài</button><td-drawer label="A"><input class="i1"><input class="i2"></td-drawer>');
    const host = wrap.querySelector('td-drawer');
    host.show();
    await wait(150);
    const root = openRoot();
    const i2 = root.querySelector('.i2');
    expect(wrap.closest('[inert]') !== null, 'page inert').to.equal(true);
    expect(isScrollLocked()).to.equal(true);
    i2.focus();
    await sendKeys({ press: 'Tab' });
    expect(root.contains(document.activeElement), 'Tab stays inside').to.equal(true);
    expect(document.activeElement === root.querySelector('.td-drawer__close'), 'wraps to the first').to.equal(true);
    await sendKeys({ press: 'Shift+Tab' });
    expect(document.activeElement === i2, 'Shift+Tab wraps to the last').to.equal(true);
    await host.close();
    expect(isScrollLocked()).to.equal(false);
    expect(wrap.closest('[inert]') === null, 'page usable again').to.equal(true);
  });

  it('Escape with a child popup open closes the popup only', async () => {
    const wrap = mount('<td-drawer label="A"><td-dropdown name="d"></td-dropdown></td-drawer>');
    const host = wrap.querySelector('td-drawer');
    const dd = host.querySelector('td-dropdown');
    dd.options = [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }];
    host.show();
    await wait(150);
    dd.querySelector('.td-dropdown__trigger').click();
    await wait(150);
    expect(dd.isOpen ?? !!document.querySelector('.td-dropdown__menu[data-state="open"]')).to.equal(true);
    await sendKeys({ press: 'Escape' });
    await wait(100);
    expect(host.open, 'drawer still open').to.equal(true);
    expect(!!document.querySelector('.td-dropdown__menu[data-state="open"]'), 'popup closed').to.equal(false);
  });
});

describe('td-drawer — accessible name', () => {
  it('label → aria-label; aria-labelledby kept; nothing → one console.warn + labels.drawer', async () => {
    const wrap = mount(`<td-drawer class="a" label="Sửa nhanh"><p>a</p></td-drawer>
      <span id="ext-name">Tên ngoài</span><td-drawer class="b" aria-labelledby="ext-name"><p>b</p></td-drawer>
      <td-drawer class="c"><p>c</p></td-drawer><td-drawer class="d"><p>d</p></td-drawer>`);
    const warns = [];
    const orig = console.warn;
    console.warn = (...a) => warns.push(a.join(' '));
    extra.push(() => { console.warn = orig; });
    const panelOf = async (cls) => {
      const h = wrap.querySelector(`td-drawer.${cls}`);
      h.show();
      const p = openRoot().querySelector('.td-drawer__panel');
      const out = { label: p.getAttribute('aria-label'), by: p.getAttribute('aria-labelledby') };
      await h.close();
      return out;
    };
    expect(await panelOf('a')).to.deep.equal({ label: 'Sửa nhanh', by: null });
    expect(await panelOf('b')).to.deep.equal({ label: null, by: 'ext-name' });
    expect(await panelOf('c')).to.deep.equal({ label: TdDrawer.labels.drawer, by: null });
    expect(await panelOf('d')).to.deep.equal({ label: 'Bảng điều khiển', by: null });
    expect(warns.filter((w) => /td-drawer/i.test(w)).length, 'warned once').to.equal(1);
  });
});

describe('TdDrawer.open (JS API)', () => {
  it('builds the drawer, handle.closed resolves with the reason after the transition, host removed', async () => {
    const body = document.createElement('div');
    body.className = 'js-body';
    body.innerHTML = '<input class="js-in">';
    const foot = document.createElement('button');
    foot.textContent = 'OK';
    let onClose = null;
    const h = TdDrawer.open({ title: 'Sửa nhanh', body, footer: [foot], side: 'start', size: 'lg', onClose: (r) => { onClose = r; } });
    expect(h.element.localName).to.equal('td-drawer');
    const root = openRoot();
    expect(root.classList.contains('td-drawer-root--start')).to.equal(true);
    expect(root.classList.contains('td-drawer-root--lg')).to.equal(true);
    expect(root.querySelector('.td-drawer__body').contains(body)).to.equal(true);
    expect(root.querySelector('.td-drawer__footer').contains(foot)).to.equal(true);
    expect(root.querySelector('.td-drawer__panel').getAttribute('aria-labelledby')).to.equal(root.querySelector('.td-drawer__title').id);
    await wait(100);
    let done = false;
    h.closed.then(() => { done = true; });
    h.close();
    await frames(1);
    expect(done).to.equal(false);
    expect(await h.closed).to.equal('programmatic');
    expect(onClose).to.equal('programmatic');
    expect(root.isConnected).to.equal(false);
    expect(h.element.isConnected).to.equal(false);
  });

  it('a label-less JS drawer without title gets label → aria-label; dismissible:false honoured', async () => {
    const h = TdDrawer.open({ label: 'Panel', body: 'chữ thường', dismissible: false });
    await wait(100);
    await sendKeys({ press: 'Escape' });
    await wait(100);
    const panel = openRoot().querySelector('.td-drawer__panel');
    expect(panel.getAttribute('aria-label')).to.equal('Panel');
    expect(h.element.open).to.equal(true);
    h.close('button');
    expect(await h.closed).to.equal('button');
  });

  // Review round 1 SEC-1 (CWE-79): a plain string is TEXT — never parsed; `bodyHtml` / `footerHtml` are the explicit
  // trusted-HTML hatches (developer markup only).
  it('body / footer / title strings render as text: no element is created from <img onerror>, <script>, onclick', async () => {
    window.__drawerXss = 0;
    const evil = '<img src=x onerror="window.__drawerXss=1"><script>window.__drawerXss=2</script><b onclick="window.__drawerXss=3">b</b>';
    const h = TdDrawer.open({ title: evil, body: evil, footer: evil });
    const root = openRoot();
    const body = root.querySelector('.td-drawer__body');
    const footer = root.querySelector('.td-drawer__footer');
    expect(body.textContent).to.equal(evil);
    expect(footer.textContent).to.equal(evil);
    expect(root.querySelector('.td-drawer__title').textContent).to.equal(evil);
    expect(root.querySelectorAll('img, script, b, [onclick], [onerror]').length).to.equal(0);
    await wait(100);
    expect(window.__drawerXss).to.equal(0);
    h.close();
    await h.closed;
  });

  it('bodyHtml / footerHtml render trusted developer markup', async () => {
    const h = TdDrawer.open({ label: 'H', bodyHtml: '<p class="trusted">Nội <b>đậm</b></p>', footerHtml: '<button type="button" class="ft">OK</button>' });
    const root = openRoot();
    expect(!!root.querySelector('.td-drawer__body p.trusted b')).to.equal(true);
    expect(!!root.querySelector('.td-drawer__footer button.ft')).to.equal(true);
    expect(root.querySelector('.td-drawer__footer').hidden).to.equal(false);
    h.close();
    await h.closed;
  });
});

describe('td-drawer — hatch precedence (review round 2)', () => {
  it("an explicit body: '' (and footer: '') suppresses bodyHtml / footerHtml", async () => {
    const h = TdDrawer.open({ label: 'E', body: '', bodyHtml: '<b class="unexpected">x</b>', footer: '', footerHtml: '<b class="unexpected-f">y</b>' });
    const root = openRoot();
    expect(root.querySelectorAll('b.unexpected, b.unexpected-f').length).to.equal(0);
    expect(root.querySelector('.td-drawer__body').textContent).to.equal('');
    h.close();
    await h.closed;
  });

  it('an inherited bodyHtml / footerHtml (prototype) is ignored; a non-string hatch value is ignored', async () => {
    const proto = { bodyHtml: '<b class="inherited">x</b>', footerHtml: '<b class="inherited-f">y</b>' };
    const opts = Object.create(proto);
    opts.label = 'P';
    const h = TdDrawer.open(opts);
    let root = openRoot();
    expect(root.querySelectorAll('b.inherited, b.inherited-f').length).to.equal(0);
    h.close();
    await h.closed;
    const h2 = TdDrawer.open({ label: 'Q', bodyHtml: { toString: () => '<b class="obj">x</b>' } });
    root = openRoot();
    expect(root.querySelectorAll('b.obj').length).to.equal(0);
    h2.close();
    await h2.closed;
  });
});

describe('td-drawer — genuine TrustedHTML only (review round 3)', () => {
  it('a policy-created TrustedHTML renders; a forged TrustedHTML-prototype object is ignored', async () => {
    if (!globalThis.trustedTypes || typeof globalThis.TrustedHTML !== 'function') return; // engine without Trusted Types
    const policy = trustedTypes.createPolicy(`td-drawer-test-${Math.random().toString(36).slice(2)}`, { createHTML: (s) => s });
    const h = TdDrawer.open({ label: 'T', bodyHtml: policy.createHTML('<b class="genuine">ok</b>') });
    let root = openRoot();
    expect(!!root.querySelector('b.genuine')).to.equal(true);
    h.close();
    await h.closed;
    const forged = Object.create(TrustedHTML.prototype);
    forged.toString = () => '<b class="forged">x</b>';
    const h2 = TdDrawer.open({ label: 'F', bodyHtml: forged });
    root = openRoot();
    expect(root.querySelectorAll('b.forged').length).to.equal(0);
    h2.close();
    await h2.closed;
  });
});

describe('td-drawer — `open` after the entrance transition (review round 1 IMPL-1)', () => {
  it('not fired during the transition; fired once after it, with the open state and focus already set', async () => {
    const wrap = mount('<td-drawer label="T"><input class="ti"></td-drawer>');
    const host = wrap.querySelector('td-drawer');
    const seen = [];
    host.addEventListener('open', () => seen.push({
      state: openRoot().getAttribute('data-state'), focus: openRoot().contains(document.activeElement),
    }));
    host.show();
    await wait(120); // two frames passed (open state + focus set), the 280 ms slide still running
    expect(openRoot().getAttribute('data-state')).to.equal('open');
    expect(seen.length, 'not during the transition').to.equal(0);
    await wait(500);
    expect(seen).to.deep.equal([{ state: 'open', focus: true }]);
    await host.close();
  });

  it('a close during the entrance transition: `open` never fires', async () => {
    const wrap = mount('<td-drawer label="T"><p>x</p></td-drawer>');
    const host = wrap.querySelector('td-drawer');
    let opens = 0;
    host.addEventListener('open', () => { opens++; });
    host.show();
    await wait(80);
    await host.close();
    await wait(500);
    expect(opens).to.equal(0);
  });

  it('reduced motion: fires after the short fade', async () => {
    await emulateMedia({ reducedMotion: 'reduce' });
    const wrap = mount('<td-drawer label="T"><p>x</p></td-drawer>');
    const host = wrap.querySelector('td-drawer');
    const t0 = performance.now();
    const opened = new Promise((r) => host.addEventListener('open', () => r(performance.now() - t0), { once: true }));
    host.show();
    const dt = await opened;
    expect(dt < 400, `${dt} ms`).to.equal(true);
    await host.close();
  });
});

describe('td-drawer — stacking with modal / lightbox (dải v0.21.1)', () => {
  it('drawer → modal: modal on top; Escape stays in the modal; closing it gives focus back inside the drawer', async () => {
    const wrap = mount('<td-drawer label="A"><button class="open-modal">Mở modal</button></td-drawer>');
    const host = wrap.querySelector('td-drawer');
    host.show();
    await wait(150);
    const btn = openRoot().querySelector('.open-modal');
    btn.focus();
    const id = TdModal.show({ title: 'Trên', body: '<input>' });
    await wait(150);
    const modal = document.getElementById(id);
    expect(openRoot().hasAttribute('inert'), 'drawer inert under the modal').to.equal(true);
    expect(modal.compareDocumentPosition(openRoot()) & Node.DOCUMENT_POSITION_PRECEDING, 'modal after drawer').to.not.equal(0);
    await sendKeys({ press: 'Escape' });
    await wait(50);
    expect(host.open, 'Escape did not reach the drawer').to.equal(true);
    TdModal.closeById(id);
    await wait(50);
    expect(document.activeElement === btn, 'focus back on the opener in the drawer').to.equal(true);
    expect(openRoot().hasAttribute('inert')).to.equal(false);
    await host.close();
  });

  it('modal → drawer: drawer on top; closing it gives focus back inside the modal', async () => {
    const b = document.createElement('button');
    b.textContent = 'Mở drawer';
    const id = TdModal.show({ title: 'Dưới', body: b });
    await wait(150);
    b.focus();
    const wrap = mount('<td-drawer label="A"><input></td-drawer>');
    const host = wrap.querySelector('td-drawer');
    // wait for `open` (fires after the entrance transition), not a fixed delay: on a loaded CI WebKit the panel
    // could still be sliding in at 150ms, so elementFromPoint missed it
    const opened = new Promise((r) => host.addEventListener('open', r, { once: true }));
    host.show();
    await opened;
    expect(document.getElementById(id).hasAttribute('inert'), 'modal inert under the drawer').to.equal(true);
    const panel = openRoot().querySelector('.td-drawer__panel');
    const r = panel.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    expect(panel.contains(top), 'drawer paints over the modal').to.equal(true);
    await sendKeys({ press: 'Escape' });
    await wait(400);
    expect(host.open).to.equal(false);
    expect(document.activeElement === b, 'focus back in the modal').to.equal(true);
    expect(isScrollLocked()).to.equal(true);
    TdModal.closeById(id);
    await wait(400);
    expect(isScrollLocked()).to.equal(false);
  });

  it('drawer → lightbox: lightbox on top; Escape closes the lightbox only, focus back in the drawer', async () => {
    const wrap = mount('<td-drawer label="A"><button class="see">Xem ảnh</button></td-drawer>');
    const host = wrap.querySelector('td-drawer');
    host.show();
    await wait(150);
    const see = openRoot().querySelector('.see');
    see.focus();
    TdLightbox.open([IMG, IMG]);
    await wait(400);
    const ov = document.querySelector('.td-lightbox');
    const r = ov.getBoundingClientRect();
    expect(ov.contains(document.elementFromPoint(r.left + 10, r.top + r.height / 2)), 'lightbox paints over the drawer').to.equal(true);
    await sendKeys({ press: 'Escape' });
    await wait(400);
    expect(host.open).to.equal(true);
    expect(document.activeElement === see, 'focus back on the button in the drawer').to.equal(true);
  });

  it('lightbox → drawer: drawer on top of the lightbox; closing the LOWER layer first keeps the drawer usable', async () => {
    TdLightbox.open([IMG]);
    await wait(300);
    const wrap = mount('<td-drawer label="A"><input class="x"></td-drawer>');
    const host = wrap.querySelector('td-drawer');
    const opened = new Promise((r) => host.addEventListener('open', r, { once: true })); // after the transition
    host.show();
    await opened;
    const panel = openRoot().querySelector('.td-drawer__panel');
    const r = panel.getBoundingClientRect();
    expect(panel.contains(document.elementFromPoint(r.left + r.width / 2, r.top + 20))).to.equal(true);
    TdLightbox.close();
    await wait(300);
    expect(openRoot().hasAttribute('inert')).to.equal(false);
    expect(host.open).to.equal(true);
    await host.close();
  });
});

describe('td-drawer — layout', () => {
  it('side end (default) sits at the inline end; RTL flips it; side start at the inline start', async () => {
    const wrap = mount('<td-drawer class="e" label="E"><p>e</p></td-drawer><div dir="rtl"><td-drawer class="r" label="R"><p>r</p></td-drawer></div>');
    const at = async (cls) => {
      const h = wrap.querySelector(`td-drawer.${cls}`);
      const opened = nextEvent(h, 'open'); // after the slide-in transition, not a fixed sleep
      h.show();
      await opened;
      const rect = openRoot().querySelector('.td-drawer__panel').getBoundingClientRect();
      await h.close();
      return rect;
    };
    const e = await at('e');
    expect(Math.round(e.right)).to.equal(document.documentElement.clientWidth);
    const r = await at('r');
    expect(Math.round(r.left)).to.equal(0);
    const h = TdDrawer.open({ label: 'S', side: 'start', body: 'x' });
    await nextEvent(h.element, 'open');
    expect(Math.round(openRoot().querySelector('.td-drawer__panel').getBoundingClientRect().left)).to.equal(0);
    h.close();
    await h.closed;
  });

  it('sizes sm < md < lg < xl; --td-drawer-w overrides; ≤ 640px fills the screen', async () => {
    const widths = {};
    for (const size of ['sm', 'md', 'lg', 'xl']) {
      const h = TdDrawer.open({ label: size, size, body: 'x' });
      widths[size] = openRoot().querySelector('.td-drawer__panel').getBoundingClientRect().width;
      h.close();
      await h.closed;
    }
    await setViewport({ width: 1400, height: 800 });
    const big = {};
    for (const size of ['sm', 'md', 'lg', 'xl']) {
      const h = TdDrawer.open({ label: size, size, body: 'x' });
      big[size] = openRoot().querySelector('.td-drawer__panel').getBoundingClientRect().width;
      h.close();
      await h.closed;
    }
    expect(big.sm < big.md && big.md < big.lg && big.lg < big.xl, JSON.stringify(big)).to.equal(true);
    const wrap = mount('<td-drawer label="W"><p>w</p></td-drawer>');
    const host = wrap.querySelector('td-drawer');
    host.style.setProperty('--td-drawer-w', '333px');
    host.show();
    expect(Math.round(openRoot().querySelector('.td-drawer__panel').getBoundingClientRect().width)).to.equal(333);
    await host.close();
    await setViewport({ width: 500, height: 700 });
    const h = TdDrawer.open({ label: 'm', size: 'sm', body: 'x' });
    await nextEvent(h.element, 'open');
    const rect = openRoot().querySelector('.td-drawer__panel').getBoundingClientRect();
    expect(Math.round(rect.width)).to.equal(document.documentElement.clientWidth);
    expect(Math.round(rect.height)).to.equal(window.innerHeight);
    h.close();
    await h.closed;
    expect(widths.sm > 0).to.equal(true);
  });

  it('reduced motion: the panel only fades (no slide)', async () => {
    await emulateMedia({ reducedMotion: 'reduce' });
    const h = TdDrawer.open({ label: 'R', body: 'x' });
    const panel = openRoot().querySelector('.td-drawer__panel');
    const cs = getComputedStyle(panel);
    expect(cs.transform === 'none' || cs.transform === '').to.equal(true);
    expect(/transform/.test(cs.transitionProperty)).to.equal(false);
    h.close();
    await h.closed;
  });

  it('the panel is a minimal solid surface (opaque, no blur, a shadow)', async () => {
    const h = TdDrawer.open({ label: 'S', body: 'x' });
    await wait(350);
    const cs = getComputedStyle(openRoot().querySelector('.td-drawer__panel'));
    const bf = cs.getPropertyValue('backdrop-filter') || cs.getPropertyValue('-webkit-backdrop-filter') || 'none';
    expect(bf === 'none' || bf === '').to.equal(true);
    const a = (cs.backgroundColor.match(/[\d.]+/g) || []).map(Number);
    expect(a.length === 3 || a[3] === 1, cs.backgroundColor).to.equal(true);
    expect(cs.boxShadow).to.not.equal('none');
    h.close();
    await h.closed;
  });
});
