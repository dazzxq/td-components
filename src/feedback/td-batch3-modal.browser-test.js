import { expect } from '@esm-bundle/chai';
import { sendKeys, emulateMedia, setViewport } from '@web/test-runner-commands';
import { TdModal } from './td-modal.js';
import { TdModalStackManager } from './td-modal-stack.js';
import { TdLoading } from './td-loading.js';
import { TdLightbox } from './td-lightbox.js';
import { TdButton } from '../form/td-button.js';
import { isScrollLocked } from '../utils/scroll-lock.js';

const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const host = document.createElement('div');
document.body.appendChild(host);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const frames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
const opened = async () => { await frames(); await frames(); };
const roots = () => [...document.body.querySelectorAll(':scope > .td-modal:not([data-state="closing"])')];
const top = () => roots()[roots().length - 1];
const dialogOf = (r) => r.querySelector('.td-modal__dialog');
/** Element assertions without chai inspecting DOM nodes (which can hang the runner). */
function same(a, b, msg = '') {
  const d = (x) => (x instanceof Element ? `<${x.tagName.toLowerCase()} class="${x.className}">` : String(x));
  expect(a === b, `${msg} expected ${d(b)} got ${d(a)}`).to.equal(true);
}
const inside = (el) => !!el && el.contains(document.activeElement);

afterEach(async () => {
  TdLoading.hide();
  TdLightbox.close();
  TdModal.closeAll();
  TdModalStackManager.BASE_Z_INDEX = null;
  for (const r of document.querySelectorAll('.td-modal')) r.remove();
  host.innerHTML = '';
  document.documentElement.removeAttribute('data-td-theme');
  document.documentElement.removeAttribute('data-td-glass');
  await emulateMedia({ reducedMotion: 'no-preference', forcedColors: 'none' });
  await setViewport({ width: 800, height: 600 });
});

/* ---------- contract fixture ---------- */
const KEEP = ['type', 'role', 'aria-hidden', 'hidden', 'data-td-icon', 'data-icon', 'data-td-icon-size', 'tabindex',
  'aria-modal', 'aria-labelledby', 'aria-describedby', 'aria-label', 'data-state', 'data-covered', 'id'];
function shape(el, id) {
  const norm = (v) => (id ? v.split(id).join('{id}') : v);
  const attrs = KEEP.filter((a) => el.hasAttribute(a)).map((a) => `${a}=${norm(el.getAttribute(a))}`);
  const cls = [...el.classList].sort().join('.');
  const kids = el.localName === 'svg' && el.getAttribute('data-icon') ? [] : [...el.children].map((k) => shape(k, id));
  return { tag: el.localName, cls, attrs, kids };
}

describe('batch 3 — td-modal contract', () => {
  it('matches test/contracts/modal.html (show, confirm, success, closable:false)', async () => {
    const html = await (await fetch('/test/contracts/modal.html')).text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    for (const t of doc.querySelectorAll('template')) {
      new Function('TdModal', t.getAttribute('data-setup'))(TdModal);
      await opened();
      const root = top();
      expect(JSON.stringify(shape(root, root.id))).to.equal(JSON.stringify(shape(t.content.firstElementChild, null)));
      TdModal.closeAll();
    }
  });

  it('no Tailwind / legacy classes, no inline style attribute markup', async () => {
    TdModal.show({ title: 'x', body: '<p>b</p>', width: '30rem' });
    await opened();
    const root = top();
    expect(root.querySelector('[class*="fixed"], [class*="bg-"], .td-modal-content, .td-modal-backdrop')).to.equal(null);
    expect(root.classList.contains('hidden')).to.equal(false);
    // only CSSOM custom properties on the dialog
    const d = dialogOf(root);
    expect([...d.style].every((p) => p.startsWith('--td-modal-'))).to.equal(true);
    expect(root.getAttribute('style')).to.equal(null);
  });

  it('showHeader:false names the dialog with aria-label; title stays text', async () => {
    const id = TdModal.show({ title: '<img src=x onerror=alert(1)>', showHeader: false });
    const d = dialogOf(document.getElementById(id));
    expect(d.hasAttribute('aria-labelledby')).to.equal(false);
    expect(d.getAttribute('aria-label')).to.equal('<img src=x onerror=alert(1)>');
    expect(document.getElementById(id).querySelector('.td-modal__header').hidden).to.equal(true);
    expect(document.getElementById(id).querySelector('img')).to.equal(null);
  });

  it('message is text, messageHtml is the trusted hatch', async () => {
    TdModal.info({ message: '<b>x</b>' });
    expect(top().querySelector('.td-modal__text b')).to.equal(null);
    expect(top().querySelector('.td-modal__text').textContent).to.equal('<b>x</b>');
    TdModal.closeAll();
    TdModal.error({ messageHtml: '<b>y</b>' });
    expect(top().querySelector('.td-modal__text b').textContent).to.equal('y');
    expect(dialogOf(top()).getAttribute('role')).to.equal('alertdialog');
  });
});

/* ---------- focus ---------- */
describe('batch 3 — td-modal initial focus (ISSUE-2)', () => {
  it('first body field by default; focus is inside the dialog synchronously', async () => {
    const id = TdModal.show({ title: 'f', body: '<p>t</p><input id="f1"><input id="f2">' });
    expect(inside(dialogOf(document.getElementById(id)))).to.equal(true);
    await opened();
    same(document.activeElement, document.getElementById('f1'));
  });

  it('autoFocus:false focuses the dialog itself', async () => {
    const id = TdModal.show({ title: 'f', body: '<input id="f1">', autoFocus: false });
    await opened();
    same(document.activeElement, dialogOf(document.getElementById(id)));
  });

  it('focusTarget honoured only when connected and inside the dialog', async () => {
    const outside = document.createElement('button');
    host.appendChild(outside);
    TdModal.show({ title: 'f', body: '<input id="f1">', focusTarget: outside });
    await opened();
    same(document.activeElement, document.getElementById('f1'), 'outside target ignored');
    TdModal.closeAll();
    const body = document.createElement('div');
    body.innerHTML = '<input id="g1"><button id="g2" type="button">b</button>';
    TdModal.show({ title: 'f', body, focusTarget: body.querySelector('#g2') });
    await opened();
    same(document.activeElement, document.getElementById('g2'));
    TdModal.closeAll();
    const detached = document.createElement('button');
    TdModal.show({ title: 'f', body: '<input id="h1">', focusTarget: detached });
    await opened();
    same(document.activeElement, document.getElementById('h1'), 'detached target ignored');
  });

  it('first focusable other than the X, else the dialog (closable:false, no focusables)', async () => {
    TdModal.success({ message: 'ok' });
    await opened();
    expect(document.activeElement.classList.contains('td-btn')).to.equal(true);
    TdModal.closeAll();
    const id = TdModal.show({ title: 'f', body: '<p>only text</p>', closable: false });
    await opened();
    same(document.activeElement, dialogOf(document.getElementById(id)));
  });

  it('confirm focuses the cancel button', async () => {
    TdModal.confirm({ message: 'm' });
    await opened();
    expect(document.activeElement.textContent).to.equal('Hủy');
  });
});

describe('batch 3 — td-modal trap + Escape (layer registry)', () => {
  it('Tab wraps inside the dialog and pulls focus back from anywhere', async () => {
    const id = TdModal.show({ title: 'f', body: '<input id="a1"><input id="a2">', actions: [{ label: 'OK' }] });
    await opened();
    const d = dialogOf(document.getElementById(id));
    const ok = d.querySelector('.td-modal__footer button');
    ok.focus();
    await sendKeys({ press: 'Tab' });
    same(document.activeElement, d.querySelector('.td-modal__close'), 'wraps last → first (X)');
    await sendKeys({ press: 'Shift+Tab' });
    same(document.activeElement, ok, 'wraps first → last');
    document.activeElement.blur(); // focus on <body> (e.g. after a scrim click)
    await sendKeys({ press: 'Tab' });
    expect(inside(d)).to.equal(true);
  });

  it('background is inert while open and released on close; one scroll lease', async () => {
    const btn = document.createElement('button');
    host.appendChild(btn);
    const id = TdModal.show({ title: 'x' });
    expect(host.hasAttribute('inert')).to.equal(true);
    expect(document.getElementById(id).hasAttribute('inert')).to.equal(false);
    expect(isScrollLocked()).to.equal(true);
    TdModal.closeById(id);
    expect(host.hasAttribute('inert')).to.equal(false);
    expect(isScrollLocked()).to.equal(false);
  });

  it('Escape never closes and does not reach a lightbox below', async () => {
    TdLightbox.open(['/test/fixtures/1.svg']);
    const id = TdModal.show({ title: 'on top', body: '<input>' });
    await opened();
    await sendKeys({ press: 'Escape' });
    await wait(30);
    expect(TdModal._isOpen(id)).to.equal(true);
    expect(TdLightbox.isOpen).to.equal(true);
    expect(document.querySelector('.td-lightbox').hasAttribute('inert')).to.equal(true);
    TdModal.closeById(id);
    await sendKeys({ press: 'Escape' });
    expect(TdLightbox.isOpen).to.equal(false); // the lightbox owns Escape again
  });

  it('loading over a modal holds focus and makes the modal inert (token z above)', async () => {
    const id = TdModal.show({ title: 'x', body: '<input id="m1">' });
    await opened();
    TdLoading.show('Đang lưu');
    const root = document.getElementById(id);
    expect(root.hasAttribute('inert')).to.equal(true);
    expect(document.activeElement.classList.contains('td-loading__card')).to.equal(true);
    await sendKeys({ press: 'Tab' });
    expect(TdLoading.element.contains(document.activeElement)).to.equal(true);
    expect(Number(getComputedStyle(TdLoading.element).zIndex)).to.be.greaterThan(Number(getComputedStyle(root).zIndex));
    TdLoading.hide();
    expect(root.hasAttribute('inert')).to.equal(false);
    same(document.activeElement, document.getElementById('m1'), 'loading restores focus into the modal');
  });
});

describe('batch 3 — td-modal focus restore (D10)', () => {
  it('restores the opener on close (before onClose)', async () => {
    const opener = document.createElement('button');
    host.appendChild(opener);
    opener.focus();
    let focusedAtClose = null;
    const id = TdModal.show({ title: 'x', body: '<input>', onClose: () => { focusedAtClose = document.activeElement; } });
    await opened();
    document.getElementById(id).querySelector('.td-modal__close').click();
    same(document.activeElement, opener);
    same(focusedAtClose, opener, 'restored before onClose');
  });

  it('closing a lower modal does not move focus; closing the top falls back through closed openers', async () => {
    const opener = document.createElement('button');
    host.appendChild(opener);
    opener.focus();
    const a = TdModal.show({ title: 'A', body: '<button id="inA" type="button">in A</button>' });
    await opened();
    same(document.activeElement, document.getElementById('inA'));
    const b = TdModal.show({ title: 'B', body: '<input id="inB">' });
    await opened();
    same(document.activeElement, document.getElementById('inB'));
    TdModal.closeById(a); // lower
    same(document.activeElement, document.getElementById('inB'), 'focus stays in the top dialog');
    TdModal.closeById(b);
    same(document.activeElement, opener, 'B opener (in A) is gone → A opener');
  });

  it('closeAll restores the bottom-most opener', async () => {
    const opener = document.createElement('button');
    host.appendChild(opener);
    opener.focus();
    TdModal.show({ title: 'A', body: '<button type="button">a</button>' });
    await opened();
    TdModal.show({ title: 'B', body: '<button type="button">b</button>' });
    await opened();
    TdModal.closeAll();
    same(document.activeElement, opener);
    expect(TdModalStackManager.stack.length).to.equal(0);
  });
});

/* ---------- stack / state ---------- */
describe('batch 3 — td-modal stack + states', () => {
  it('stacked: lower dialog [data-covered], solid and inert; top keeps glass', async () => {
    const a = TdModal.show({ title: 'A' });
    const b = TdModal.show({ title: 'B' });
    await opened();
    const ra = document.getElementById(a);
    const rb = document.getElementById(b);
    expect(ra.hasAttribute('data-covered')).to.equal(true);
    expect(rb.hasAttribute('data-covered')).to.equal(false);
    expect(ra.hasAttribute('inert')).to.equal(true);
    const csA = getComputedStyle(dialogOf(ra));
    const csB = getComputedStyle(dialogOf(rb));
    expect(csA.backdropFilter).to.equal('none');
    expect(csA.backgroundColor).to.equal('rgb(251, 251, 252)'); // --td-glass-solid
    expect(csB.backdropFilter).to.not.equal('none');
    TdModal.closeById(b);
    expect(ra.hasAttribute('data-covered')).to.equal(false);
    expect(ra.hasAttribute('inert')).to.equal(false);
  });

  it('z-index = --td-z-modal for all; BASE_Z_INDEX opt-in writes inline z + warns', async () => {
    const a = TdModal.show({ title: 'A' });
    expect(getComputedStyle(document.getElementById(a)).zIndex).to.equal('400');
    expect(document.getElementById(a).style.zIndex).to.equal('');
    TdModal.closeAll();
    const warn = console.warn;
    const msgs = [];
    console.warn = (m) => msgs.push(String(m));
    try {
      TdModalStackManager.BASE_Z_INDEX = 100000;
      TdModalStackManager._warnedZ = false;
      const b = TdModal.show({ title: 'B' });
      const c = TdModal.show({ title: 'C' });
      expect(document.getElementById(b).style.zIndex).to.equal('100000');
      expect(document.getElementById(c).style.zIndex).to.equal('100100');
      expect(msgs.filter((m) => m.includes('BASE_Z_INDEX')).length).to.equal(1);
    } finally {
      console.warn = warn;
    }
  });

  it('data-state opening → open → closing → removed; same-frame close skips onShow', async () => {
    let shows = 0;
    const id = TdModal.show({ title: 'x', onShow: () => { shows += 1; } });
    const root = document.getElementById(id);
    expect(root.getAttribute('data-state')).to.equal('opening');
    TdModal.closeById(id);
    expect(root.getAttribute('data-state')).to.equal('closing');
    await opened();
    expect(shows).to.equal(0);
    await wait(260);
    expect(root.isConnected).to.equal(false);
  });

  it('onShow(root, payload) once after data-state=open; a throwing hook does not break open', async () => {
    const calls = [];
    const id = TdModal.show({ title: 'x', onShowPayload: { n: 1 }, onShow: (r, p) => calls.push([r.getAttribute('data-state'), r.id, p.n]) });
    await opened();
    expect(calls).to.deep.equal([['open', id, 1]]);
    const warn = console.warn;
    console.warn = () => {};
    try {
      const id2 = TdModal.show({ title: 'y', onShow: () => { throw new Error('boom'); } });
      await opened();
      expect(document.getElementById(id2).getAttribute('data-state')).to.equal('open');
    } finally { console.warn = warn; }
  });

  it('width/height/bodyPadding validated via CSS.supports (D22); bodyOverflow allowlist', async () => {
    const warn = console.warn;
    const msgs = [];
    console.warn = (m) => msgs.push(String(m));
    try {
      let d = dialogOf(document.getElementById(TdModal.show({ title: 'a', width: 'min(40rem, 90vw)', height: '50dvh', bodyPadding: 0, bodyOverflow: 'hidden' })));
      expect(d.style.getPropertyValue('--td-modal-w')).to.equal('min(40rem, 90vw)');
      expect(d.style.getPropertyValue('--td-modal-h')).to.equal('50dvh');
      expect(d.style.getPropertyValue('--td-modal-body-pad')).to.equal('0');
      expect(getComputedStyle(d.querySelector('.td-modal__body')).overflowY).to.equal('hidden');
      d = dialogOf(document.getElementById(TdModal.show({ title: 'b', width: 'url(x)', height: 'red', bodyPadding: 'var(--x)', bodyOverflow: 'evil' })));
      expect([...d.style].length).to.equal(0);
      expect(msgs.length).to.equal(4);
    } finally { console.warn = warn; }
  });

  it('only the body scrolls (D21): long content keeps header/footer pinned', async () => {
    const id = TdModal.show({ title: 'x', body: `<div class="tall"></div>${'<p>dòng</p>'.repeat(200)}`, actions: [{ label: 'OK' }] });
    await opened();
    const root = document.getElementById(id);
    const d = dialogOf(root).getBoundingClientRect();
    const body = root.querySelector('.td-modal__body');
    expect(d.height).to.be.at.most(window.innerHeight);
    expect(body.scrollHeight).to.be.greaterThan(body.clientHeight);
    expect(root.querySelector('.td-modal__footer').getBoundingClientRect().bottom).to.be.at.most(d.bottom + 0.5);
  });

  it('closable:false hides the X via [hidden] (display none without Tailwind)', async () => {
    const id = TdModal.show({ title: 'x', closable: false });
    const x = document.getElementById(id).querySelector('.td-modal__close');
    expect(x.hidden).to.equal(true);
    expect(getComputedStyle(x).display).to.equal('none');
  });

  it('reduced motion: no transform on the dialog', async () => {
    await emulateMedia({ reducedMotion: 'reduce' });
    const id = TdModal.show({ title: 'x' });
    await opened();
    expect(getComputedStyle(dialogOf(document.getElementById(id))).transform).to.equal('none');
  });

  it('glass off → solid dialog', async () => {
    document.documentElement.setAttribute('data-td-glass', 'off');
    const id = TdModal.show({ title: 'x' });
    await opened();
    const cs = getComputedStyle(dialogOf(document.getElementById(id)));
    expect(cs.backdropFilter).to.equal('none');
    expect(cs.backgroundColor).to.equal('rgb(251, 251, 252)');
  });
});

/* ---------- async actions (D6) ---------- */
describe('batch 3 — td-modal async actions + thenable onConfirm', () => {
  it('pending → aria-busy + others disabled; resolve false keeps open; resolve closes with value', async () => {
    let release;
    let closedWith;
    const id = TdModal.show({
      title: 'x',
      onClose: (v) => { closedWith = v; },
      actions: [{ label: 'Hủy', value: 'no' }, { label: 'Lưu', variant: 'primary', value: 'yes', onClick: () => new Promise((r) => { release = r; }) }],
    });
    const root = document.getElementById(id);
    const [cancel, save] = root.querySelectorAll('.td-modal__footer .td-btn');
    save.click();
    expect(save.getAttribute('aria-busy')).to.equal('true');
    expect(cancel.disabled).to.equal(true);
    expect(root.querySelector('.td-modal__close').disabled).to.equal(true);
    root.querySelector('.td-modal__close').click();
    expect(TdModal._isOpen(id)).to.equal(true);
    release(false);
    await wait(0);
    expect(TdModal._isOpen(id)).to.equal(true);
    expect(save.hasAttribute('aria-busy')).to.equal(false);
    expect(cancel.disabled).to.equal(false);
    save.click();
    release(undefined);
    await wait(0);
    expect(TdModal._isOpen(id)).to.equal(false);
    expect(closedWith).to.equal('yes');
  });

  it('rejection keeps open and re-enables; sync false keeps open; plain action closes', async () => {
    const warn = console.warn;
    console.warn = () => {};
    try {
      const id = TdModal.show({
        title: 'x',
        actions: [{ label: 'A', onClick: () => Promise.reject(new Error('x')) }, { label: 'B', onClick: () => false }, { label: 'C' }],
      });
      const [a, b, c] = document.getElementById(id).querySelectorAll('.td-modal__footer .td-btn');
      a.click();
      await wait(0);
      expect(TdModal._isOpen(id)).to.equal(true);
      expect(a.hasAttribute('aria-busy')).to.equal(false);
      b.click();
      expect(TdModal._isOpen(id)).to.equal(true);
      c.click();
      expect(TdModal._isOpen(id)).to.equal(false);
    } finally { console.warn = warn; }
  });

  it('confirm: thenable onConfirm keeps the dialog busy until it settles', async () => {
    let release;
    let done = false;
    const p = TdModal.confirm({ onConfirm: () => new Promise((r) => { release = r; }) }).then((v) => { done = true; return v; });
    const root = top();
    const [cancel, ok] = root.querySelectorAll('.td-modal__footer .td-btn');
    ok.click();
    await wait(0);
    expect(done).to.equal(false);
    expect(ok.getAttribute('aria-busy')).to.equal('true');
    expect(cancel.disabled).to.equal(true);
    release(false); // keeps open
    await wait(0);
    expect(done).to.equal(false);
    expect(ok.hasAttribute('aria-busy')).to.equal(false);
    ok.click();
    release(true);
    expect(await p).to.equal(true);
    expect(root.getAttribute('data-state')).to.equal('closing');
  });
});

/* ---------- layout / contrast ---------- */
describe('batch 3 — td-modal layout + contrast', () => {
  it('bottom sheet below 640 px; centred above', async () => {
    await setViewport({ width: 480, height: 800 });
    let id = TdModal.show({ title: 'sheet', size: 'lg' });
    await opened();
    await wait(400);
    let r = dialogOf(document.getElementById(id)).getBoundingClientRect();
    expect(Math.round(r.width)).to.equal(480);
    expect(Math.round(r.bottom)).to.equal(800);
    expect(getComputedStyle(dialogOf(document.getElementById(id))).borderBottomLeftRadius).to.equal('0px');
    TdModal.closeAll();
    await setViewport({ width: 1000, height: 800 });
    id = TdModal.show({ title: 'centre', size: 'sm' });
    await opened();
    await wait(400);
    r = dialogOf(document.getElementById(id)).getBoundingClientRect();
    expect(Math.round(r.width)).to.equal(384); // 24rem
    expect(Math.abs((r.top + r.bottom) / 2 - 400)).to.be.below(2);
  });

  function rgba(str) {
    const m = /rgba?\(([^)]+)\)/.exec(str);
    const n = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return { r: n[0], g: n[1], b: n[2], a: n.length > 3 ? n[3] : 1 };
  }
  const over = (t, u) => ({ r: t.r * t.a + u.r * (1 - t.a), g: t.g * t.a + u.g * (1 - t.a), b: t.b * t.a + u.b * (1 - t.a), a: 1 });
  const ratio = (a, b) => {
    const [x, y] = [TdButton._luminance(a), TdButton._luminance(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  for (const theme of ['light', 'dark']) {
    it(`title, text and X meet contrast on the glass dialog (${theme}, worst-case page under the scrim)`, async () => {
      if (theme === 'dark') document.documentElement.setAttribute('data-td-theme', 'dark');
      const id = TdModal.show({ title: 'Tiêu đề' });
      TdModal.info({ message: 'Nội dung' });
      await opened();
      await wait(300);
      const root = top();
      const d = dialogOf(root);
      const scrim = rgba(getComputedStyle(root.querySelector('.td-modal__backdrop')).backgroundColor);
      const glass = rgba(getComputedStyle(d).backgroundColor);
      for (const page of [{ r: 255, g: 255, b: 255, a: 1 }, { r: 0, g: 0, b: 0, a: 1 }]) {
        const bg = over(glass, over(scrim, page));
        expect(ratio(rgba(getComputedStyle(d.querySelector('.td-modal__title')).color), bg)).to.be.at.least(4.5);
        expect(ratio(rgba(getComputedStyle(d.querySelector('.td-modal__text')).color), bg)).to.be.at.least(4.5);
        expect(ratio(rgba(getComputedStyle(d.querySelector('.td-modal__close')).color), bg)).to.be.at.least(3);
      }
      expect(id).to.be.a('string');
    });
  }
});
