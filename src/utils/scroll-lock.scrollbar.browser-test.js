import { expect } from '@esm-bundle/chai';
import { lockScroll, isScrollLocked } from './scroll-lock.js';
import { TdModal } from '../feedback/td-modal.js';

// v0.22.1: the lock keeps the classic scrollbar's space (scrollbar-gutter: stable, else padding-inline-end) so the
// page and the centred modal do not jump sideways while an overlay opens/closes (Windows, macOS "always show").
// The test page forces a classic 15 px scrollbar (headless Chromium hides native ones) and overflowing content.

const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const root = document.documentElement;

const sheet = document.createElement('style');
sheet.textContent = 'html::-webkit-scrollbar{width:15px;height:15px;background:#ddd}'
  + 'html::-webkit-scrollbar-thumb{background:#888}'
  + '.sl-tall{height:300vh}'
  + '.sl-centre{width:100px;height:20px;margin:0 auto}'
  + '.sl-fixed{position:fixed;inset:0 var(--td-scroll-lock-gap,0px) auto 0;display:flex;justify-content:center;pointer-events:none}'
  + '.sl-fixed>span{width:100px;height:20px}';
document.head.appendChild(sheet);
const tall = document.createElement('div');
tall.className = 'sl-tall';
tall.innerHTML = '<div class="sl-centre"></div>';
document.body.appendChild(tall);
const fixed = document.createElement('div');
fixed.className = 'sl-fixed';
fixed.innerHTML = '<span></span>';
document.body.appendChild(fixed);

const centreLeft = () => tall.firstElementChild.getBoundingClientRect().left;
const fixedLeft = () => fixed.firstElementChild.getBoundingClientRect().left;
const gutter = () => window.innerWidth - root.clientWidth;

// every lease taken here is released after each test, even when an assertion threw mid-test (no leak into the next)
const leases = [];
const lock = () => { const r = lockScroll(); leases.push(r); return r; };

function resetInline() {
  while (leases.length) leases.pop()();
  root.style.removeProperty('overflow');
  root.style.removeProperty('scrollbar-gutter');
  root.style.removeProperty('padding-inline-end');
  root.style.removeProperty('--td-scroll-lock-gap');
}

describe('scroll lock keeps the scrollbar gutter (v0.22.1)', () => {
  afterEach(() => {
    TdModal.closeAll();
    resetInline();
  });

  it('test page really has a classic scrollbar (precondition)', () => {
    expect(gutter()).to.be.greaterThan(0);
  });

  it('content (in flow and fixed) does not move while locked; inline styles restored after unlock', () => {
    const left = centreLeft();
    const fLeft = fixedLeft();
    const release = lock();
    expect(isScrollLocked()).to.equal(true);
    expect(centreLeft()).to.equal(left);
    expect(fixedLeft()).to.equal(fLeft);
    release();
    expect(root.getAttribute('style') || '').to.equal('');
    expect(centreLeft()).to.equal(left);
  });

  it('restores a site\'s own inline scrollbar-gutter / padding / overflow exactly', () => {
    root.style.setProperty('scrollbar-gutter', 'auto');
    root.style.setProperty('padding-inline-end', '3px', 'important');
    root.style.overflow = 'clip visible';
    const before = root.getAttribute('style');
    const release = lock();
    release();
    expect(root.getAttribute('style')).to.equal(before);
  });

  it('restores a site\'s inline `overflow: … !important` with its priority (v0.22.1 review)', () => {
    root.style.setProperty('overflow', 'auto', 'important');
    const release = lock();
    expect(root.style.getPropertyValue('overflow')).to.equal('hidden');
    release();
    expect(root.style.getPropertyValue('overflow')).to.equal('auto');
    expect(root.style.getPropertyPriority('overflow')).to.equal('important');
  });

  it('padding fallback (no scrollbar-gutter support): same width, previous padding restored', () => {
    const supports = CSS.supports;
    CSS.supports = (...a) => (a[0] === 'scrollbar-gutter' || /^\s*\(?\s*scrollbar-gutter/.test(String(a[0]))
      ? false : supports.apply(CSS, a));
    try {
      root.style.paddingInlineEnd = '5px';
      const left = centreLeft();
      const release = lock();
      expect(root.style.scrollbarGutter).to.equal('');
      expect(centreLeft()).to.equal(left);
      release();
      expect(root.style.paddingInlineEnd).to.equal('5px');
    } finally {
      CSS.supports = supports;
    }
  });

  it('no scrollbar → nothing reserved (no gutter added to a page that did not scroll)', () => {
    tall.classList.remove('sl-tall');
    try {
      expect(gutter()).to.equal(0);
      const release = lock();
      expect(root.style.scrollbarGutter).to.equal('');
      expect(root.style.paddingInlineEnd).to.equal('');
      release();
    } finally {
      tall.classList.add('sl-tall');
    }
  });

  it('nested leases: the gutter stays until the last lease is released', () => {
    const left = centreLeft();
    const a = lock();
    const b = lock();
    a();
    expect(centreLeft()).to.equal(left);
    b();
    expect(isScrollLocked()).to.equal(false);
    expect(root.getAttribute('style') || '').to.equal('');
  });

  it('a real modal: the page and the dialog do not shift during open → close', async () => {
    const left = centreLeft();
    const id = TdModal.show({ title: 'x', body: 'y' });
    const dlg = document.getElementById(id).querySelector('.td-modal__dialog');
    expect(centreLeft()).to.equal(left);
    await wait(400);
    const dLeft = dlg.getBoundingClientRect().left;
    TdModal.closeById(id); // lease released at the start of the exit transition
    expect(centreLeft()).to.equal(left);
    expect(dlg.getBoundingClientRect().left).to.be.closeTo(dLeft, 0.5); // exit transition has not progressed yet
  });
});
