// v0.96.0 (plan v0.96.0-modal-wp §4.5, ADR 0042) — a declared external overlay (wp.media-like UI appended to <body>)
// opened over a blocking kit layer: not inert, Tab / Escape reach it, the td scrim does not close under it, focus comes
// back when it goes away. Nothing declared → the 0.95.0 behaviour (inert, trap, Escape consumed). Chromium + Firefox +
// WebKit; real keyboard (sendKeys) and mouse (sendMouse); waits on real signals.
import { expect } from '@esm-bundle/chai';
import { sendKeys, sendMouse, resetMouse } from '@web/test-runner-commands';
import { TdModal } from './td-modal.js';
import { TdDrawer } from './td-drawer.js';
import { registerExternalOverlay } from '../utils/external-overlay.js';

const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

// the fake external UI's own stylesheet (CSSOM, no style attribute): a small panel bottom-right + an optional full scrim
const sheet = new CSSStyleSheet();
sheet.replaceSync(`
  .fake-ext { position: fixed; inset-inline-end: 16px; inset-block-end: 16px; inline-size: 220px; block-size: 120px;
    z-index: 160000; background: #fff; }
  .fake-ext.is-low { z-index: 10; }
  .fake-ext.is-hidden { display: none; }
  .fake-ext-backdrop { position: fixed; inset: 0; z-index: 159999; background: rgb(0 0 0 / 30%); }
`);
document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];

const raf = () => new Promise((r) => requestAnimationFrame(r));
async function until(cond, n = 180) {
  for (let i = 0; i < n && !cond(); i++) await raf();
  return cond();
}
const mid = (el) => { const r = el.getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; };
const SCRIM = [6, 6]; // top-left corner: td scrim (the md dialog is centred, the fake panel sits bottom-right)
async function clickAt([x, y]) {
  await sendMouse({ type: 'move', position: [x, y] });
  await sendMouse({ type: 'down' });
  await sendMouse({ type: 'up' });
  await raf();
}

let offs = [];
let exts = [];

/** A fake external dialog (direct child of <body>) with its own Escape handler. */
function makeExt({ cls = '', attr = false } = {}) {
  const ext = document.createElement('div');
  ext.className = `fake-ext ${cls}`.trim();
  ext.setAttribute('role', 'dialog');
  ext.innerHTML = '<input class="ext-input" aria-label="ext"><input class="ext-input2" aria-label="ext 2"><button type="button" class="ext-btn">OK</button>';
  if (attr) ext.setAttribute('data-td-external-overlay', '');
  ext.escapes = 0;
  ext.addEventListener('keydown', (e) => { if (e.key === 'Escape') ext.escapes += 1; });
  document.body.appendChild(ext);
  exts.push(ext);
  return ext;
}
function makeBackdrop() {
  const b = document.createElement('div');
  b.className = 'fake-ext-backdrop';
  document.body.appendChild(b);
  exts.push(b);
  return b;
}

async function openModal(opts = {}) {
  let shown = false;
  const id = TdModal.show({
    title: 'Sửa', body: '<input class="td-in" aria-label="tên">', onShow: () => { shown = true; }, ...opts,
  });
  await until(() => shown);
  await raf();
  return id;
}
const isOpen = (id) => !!document.getElementById(id) && TdModal._isOpen(id);

afterEach(async () => {
  for (const off of offs) off();
  offs = [];
  for (const e of exts) e.remove();
  exts = [];
  const roots = [...document.querySelectorAll('body > .td-modal, body > .td-drawer-root')];
  TdModal.closeAll();
  for (const h of document.querySelectorAll('td-drawer')) if (h.open) h.close();
  await resetMouse();
  await until(() => roots.every((r) => !r.isConnected));
});

describe('v0.96.0 external overlay over a td-modal', () => {
  it('1. nothing declared: the appended UI is inert (0.95.0 behaviour)', async () => {
    await openModal();
    const ext = makeExt();
    expect(await until(() => ext.hasAttribute('inert'))).to.equal(true);
  });

  it('2. registered selector: not inert, clickable, typeable', async () => {
    offs.push(registerExternalOverlay('.fake-ext'));
    await openModal();
    const ext = makeExt();
    await raf();
    await raf();
    expect(ext.hasAttribute('inert')).to.equal(false);
    const input = ext.querySelector('.ext-input');
    await clickAt(mid(input));
    expect(document.activeElement).to.equal(input);
    await sendKeys({ type: 'abc' });
    expect(input.value).to.equal('abc');
  });

  it('2b. already inert (not declared) → registerExternalOverlay() lifts inert at once', async () => {
    await openModal();
    const ext = makeExt();
    expect(await until(() => ext.hasAttribute('inert'))).to.equal(true);
    offs.push(registerExternalOverlay('.fake-ext'));
    expect(await until(() => !ext.hasAttribute('inert'))).to.equal(true);
  });

  it('2c / 9. the data-td-external-overlay attribute (set after insertion, or from the start) needs no JS', async () => {
    await openModal();
    const ext = makeExt();
    expect(await until(() => ext.hasAttribute('inert'))).to.equal(true);
    ext.setAttribute('data-td-external-overlay', '');
    expect(await until(() => !ext.hasAttribute('inert'))).to.equal(true);
    const ext2 = makeExt({ attr: true });
    await raf();
    await raf();
    expect(ext2.hasAttribute('inert')).to.equal(false);
  });

  it('3. Tab / Shift+Tab inside the external UI are not pulled back into the dialog', async () => {
    offs.push(registerExternalOverlay('.fake-ext'));
    const id = await openModal();
    const ext = makeExt();
    await raf();
    ext.querySelector('.ext-input').focus();
    // a second INPUT as the Tab stop: macOS WebKit does not put buttons in the Tab order (and a failed DOM-element
    // equality hangs the runner while it prints the diff, so compare with ===)
    await sendKeys({ press: 'Tab' });
    expect(document.activeElement === ext.querySelector('.ext-input2'), 'Tab stays in the external UI').to.equal(true);
    await sendKeys({ press: 'Shift+Tab' });
    expect(document.activeElement === ext.querySelector('.ext-input'), 'Shift+Tab stays in the external UI').to.equal(true);
    expect(isOpen(id)).to.equal(true);
  });

  it('4. Escape reaches the external UI once; the td dialog (escapeCloses) runs no guard and stays open', async () => {
    offs.push(registerExternalOverlay('.fake-ext'));
    let guards = 0;
    const id = await openModal({ escapeCloses: true, beforeClose: () => { guards += 1; return true; } });
    const ext = makeExt();
    await raf();
    ext.querySelector('.ext-input').focus();
    await sendKeys({ press: 'Escape' });
    await raf();
    expect(ext.escapes).to.equal(1);
    expect(guards).to.equal(0);
    expect(isOpen(id)).to.equal(true);
  });

  it('5. backdropCloses: a click on the external backdrop / on the td scrim under a visible external UI does not close', async () => {
    offs.push(registerExternalOverlay('.fake-ext, .fake-ext-backdrop'));
    const id = await openModal({ backdropCloses: true });
    makeExt();
    const back = makeBackdrop();
    await raf();
    await clickAt(SCRIM); // lands on the external backdrop
    expect(isOpen(id)).to.equal(true);
    back.remove();
    await raf();
    await clickAt(SCRIM); // lands on the td scrim, the small external panel still visible above
    expect(isOpen(id)).to.equal(true);
    for (const e of exts) e.remove();
    await raf();
    await clickAt(SCRIM); // nothing external any more: the opt-in scrim close works (no regression)
    expect(await until(() => !isOpen(id))).to.equal(true);
  });

  it('6. removing the external UI brings focus back to the last field of the dialog; then Escape is the kit\'s again', async () => {
    offs.push(registerExternalOverlay('.fake-ext'));
    let guards = 0;
    const id = await openModal({ escapeCloses: true, beforeClose: () => { guards += 1; return true; } });
    const field = document.getElementById(id).querySelector('.td-in');
    field.focus();
    const ext = makeExt();
    await raf();
    ext.querySelector('.ext-input').focus();
    ext.remove();
    expect(await until(() => document.activeElement === field)).to.equal(true);
    await sendKeys({ press: 'Escape' });
    expect(await until(() => !isOpen(id))).to.equal(true);
    expect(guards).to.equal(1);
  });

  it('7. hidden (display:none, DOM kept) → inert + kit keyboard again; shown again → inert lifted at once', async () => {
    offs.push(registerExternalOverlay('.fake-ext'));
    const id = await openModal({ escapeCloses: true, beforeClose: () => false });
    const ext = makeExt();
    await raf();
    expect(ext.hasAttribute('inert')).to.equal(false);
    ext.classList.add('is-hidden');
    expect(await until(() => ext.hasAttribute('inert'))).to.equal(true);
    const field = document.getElementById(id).querySelector('.td-in');
    field.focus();
    await sendKeys({ press: 'Tab' });
    expect(document.getElementById(id).contains(document.activeElement)).to.equal(true); // trapped
    ext.classList.remove('is-hidden');
    expect(await until(() => !ext.hasAttribute('inert'))).to.equal(true);
  });

  it('8. below the td layer, or hidden → stays inert (explicitly)', async () => {
    offs.push(registerExternalOverlay('.fake-ext'));
    await openModal();
    const low = makeExt({ cls: 'is-low' });
    const hidden = makeExt({ cls: 'is-hidden' });
    expect(await until(() => low.hasAttribute('inert') && hidden.hasAttribute('inert'))).to.equal(true);
    await raf();
    await raf();
    expect(low.hasAttribute('inert')).to.equal(true);
    expect(hidden.hasAttribute('inert')).to.equal(true);
  });

  it('10b. two stacked modals: the external UI above both is not inert, Escape is its own', async () => {
    offs.push(registerExternalOverlay('.fake-ext'));
    const a = await openModal({ escapeCloses: true });
    const b = await openModal({ escapeCloses: true });
    const ext = makeExt();
    await raf();
    await raf();
    expect(ext.hasAttribute('inert')).to.equal(false);
    ext.querySelector('.ext-input').focus();
    await sendKeys({ press: 'Escape' });
    await raf();
    expect(ext.escapes).to.equal(1);
    expect(isOpen(a) && isOpen(b)).to.equal(true);
  });

  it('11. present (hidden) before the modal opens, shown afterwards (wp.media) → inert lifted when shown', async () => {
    offs.push(registerExternalOverlay('.fake-ext'));
    const ext = makeExt({ cls: 'is-hidden' });
    await openModal();
    expect(await until(() => ext.hasAttribute('inert'))).to.equal(true);
    ext.classList.remove('is-hidden');
    expect(await until(() => !ext.hasAttribute('inert'))).to.equal(true);
    ext.querySelector('.ext-input').focus();
    expect(document.activeElement).to.equal(ext.querySelector('.ext-input'));
  });

  it('12. off() while yielding → inert again and Escape is the kit\'s', async () => {
    const off = registerExternalOverlay('.fake-ext');
    let guards = 0;
    const id = await openModal({ escapeCloses: true, beforeClose: () => { guards += 1; return true; } });
    const ext = makeExt();
    await raf();
    expect(ext.hasAttribute('inert')).to.equal(false);
    off();
    expect(await until(() => ext.hasAttribute('inert'))).to.equal(true);
    document.getElementById(id).querySelector('.td-in').focus();
    await sendKeys({ press: 'Escape' });
    expect(await until(() => !isOpen(id))).to.equal(true);
    expect(guards).to.equal(1);
    expect(ext.escapes).to.equal(0);
  });
});

describe('v0.96.0 external overlay over a td-drawer', () => {
  it('10. not inert, Escape is its own, a scrim click under it does not close the drawer', async () => {
    offs.push(registerExternalOverlay('.fake-ext'));
    const d = TdDrawer.open({ label: 'Panel', side: 'end', size: 'sm', bodyHtml: '<input class="d-in" aria-label="x">' });
    await until(() => !!document.querySelector('body > .td-drawer-root[data-state="open"]'));
    const ext = makeExt();
    await raf();
    await raf();
    expect(ext.hasAttribute('inert')).to.equal(false);
    ext.querySelector('.ext-input').focus();
    await sendKeys({ press: 'Escape' });
    await raf();
    expect(ext.escapes).to.equal(1);
    expect(d.element.open).to.equal(true);
    await clickAt(SCRIM); // the drawer's scrim (drawer on the end side)
    await raf();
    expect(d.element.open).to.equal(true);
    ext.remove();
    await raf();
    await clickAt(SCRIM);
    expect(await until(() => !d.element.open)).to.equal(true); // dismissible again (no regression)
  });
});

// v0.96.0 security-review hardening of the "is it really above and visible" decision (src/utils/external-overlay.js):
// fades, nested dialogs inside a persistent wrapper, a static box with a big z-index, individual transform properties and
// will-change as stacking contexts, a root that starts / stops matching the declared selector. Same setup as above.
const sheet2 = new CSSStyleSheet();
sheet2.replaceSync(`
  .fake-ext.is-fading { opacity: 0; transition: opacity 120ms linear; }
  .fake-static { position: static; z-index: 999999; inline-size: 220px; block-size: 40px; background: #fff; }
  .fake-static.is-positioned { position: relative; }
  .fake-wrap.is-moved { translate: 10px 0; }
  .fake-wrap.is-wc { will-change: clip-path; }
`);
document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet2];

/** a plain wrapper appended to <body> (z-index auto, like wp.media's) around a fixed dialog */
function makeWrap({ cls = '', nested = true } = {}) {
  const wrap = document.createElement('div');
  wrap.className = `fake-wrap ${cls}`.trim();
  document.body.appendChild(wrap);
  exts.push(wrap);
  const w = { wrap, dlg: null, escapes: 0 };
  w.addDialog = () => {
    const dlg = document.createElement('div');
    dlg.className = 'fake-ext';
    dlg.setAttribute('role', 'dialog');
    dlg.innerHTML = '<input class="ext-input" aria-label="ext"><button type="button" class="ext-btn">OK</button>';
    dlg.addEventListener('keydown', (e) => { if (e.key === 'Escape') w.escapes += 1; });
    wrap.appendChild(dlg);
    w.dlg = dlg;
    return dlg;
  };
  if (nested) w.addDialog();
  return w;
}
const inert = (el) => el.hasAttribute('inert');
/** stays true for `n` frames (a "still inert" claim must hold over time, not just at one instant) */
async function holds(cond, n = 12) {
  for (let i = 0; i < n; i++) {
    if (!cond()) return false;
    await raf();
  }
  return true;
}

describe('v0.96.0 external overlay — visibility and stacking edge cases', () => {
  it('a. a wrapper that fades to opacity 0 while focus is inside: inert at the end of the fade, the kit gets Escape back', async () => {
    offs.push(registerExternalOverlay('.fake-ext'));
    let guards = 0;
    const id = await openModal({ escapeCloses: true, beforeClose: () => { guards += 1; return true; } });
    const ext = makeExt();
    await raf();
    await raf();
    expect(inert(ext)).to.equal(false);
    ext.querySelector('.ext-input').focus();
    expect(document.activeElement).to.equal(ext.querySelector('.ext-input'));
    ext.classList.add('is-fading');
    expect(await until(() => inert(ext), 400)).to.equal(true); // transitionend (no DOM mutation) re-syncs
    expect(parseFloat(getComputedStyle(ext).opacity)).to.equal(0);
    expect(ext.contains(document.activeElement)).to.equal(false);
    document.getElementById(id).querySelector('.td-in').focus();
    await sendKeys({ press: 'Escape' });
    expect(await until(() => !isOpen(id))).to.equal(true);
    expect(guards).to.equal(1);
    expect(ext.escapes).to.equal(0);
  });

  it('a2. fading back in lifts the inert again', async () => {
    offs.push(registerExternalOverlay('.fake-ext'));
    await openModal();
    const ext = makeExt();
    await raf();
    ext.classList.add('is-fading');
    expect(await until(() => inert(ext), 400)).to.equal(true);
    ext.classList.remove('is-fading');
    expect(await until(() => !inert(ext), 400)).to.equal(true);
  });

  it('b. a persistent wrapper whose nested dialog is inserted then removed: lifted while it is there, inert again after', async () => {
    offs.push(registerExternalOverlay('.fake-wrap'));
    const id = await openModal({ escapeCloses: true });
    const w = makeWrap({ nested: false }); // empty wrapper: ranks 0 → below the modal
    expect(await until(() => inert(w.wrap))).to.equal(true);
    const dlg = w.addDialog(); // inserted INSIDE the already-declared root: the subtree watch resyncs
    expect(await until(() => !inert(w.wrap))).to.equal(true);
    dlg.querySelector('.ext-input').focus();
    await sendKeys({ press: 'Escape' });
    await raf();
    expect(w.escapes).to.equal(1);
    expect(isOpen(id)).to.equal(true);
    const [x, y] = mid(dlg.querySelector('.ext-input'));
    expect(document.elementFromPoint(x, y)).to.equal(dlg.querySelector('.ext-input')); // really painted above
    dlg.remove(); // removed again: the wrapper stays but covers nothing
    expect(await until(() => inert(w.wrap))).to.equal(true);
    w.addDialog(); // and again
    expect(await until(() => !inert(w.wrap))).to.equal(true);
  });

  it('c. a static (non-positioned) element with a huge z-index does NOT count as covering; positioned it does', async () => {
    offs.push(registerExternalOverlay('.fake-static'));
    await openModal();
    const el = document.createElement('div');
    el.className = 'fake-static';
    el.textContent = 'static';
    document.body.appendChild(el);
    exts.push(el);
    expect(getComputedStyle(el).position).to.equal('static');
    expect(await until(() => inert(el))).to.equal(true);
    expect(await holds(() => inert(el))).to.equal(true);
    el.classList.add('is-positioned'); // same z-index, now it takes part in stacking
    expect(await until(() => !inert(el))).to.equal(true);
    el.classList.remove('is-positioned');
    expect(await until(() => inert(el))).to.equal(true);
  });

  it('d. a wrapper moved with the CSS `translate` property is a stacking context: below the modal; back without it', async () => {
    offs.push(registerExternalOverlay('.fake-wrap'));
    await openModal();
    const w = makeWrap();
    await raf();
    await raf();
    expect(inert(w.wrap)).to.equal(false);
    w.wrap.classList.add('is-moved');
    expect(getComputedStyle(w.wrap).translate).to.not.equal('none');
    expect(await until(() => inert(w.wrap))).to.equal(true);
    expect(await holds(() => inert(w.wrap))).to.equal(true);
    w.wrap.classList.remove('is-moved');
    expect(await until(() => !inert(w.wrap))).to.equal(true);
  });

  it('e. a wrapper with will-change: clip-path is a stacking context (fail closed): below the modal; back without it', async () => {
    offs.push(registerExternalOverlay('.fake-wrap'));
    await openModal();
    const w = makeWrap();
    await raf();
    await raf();
    expect(inert(w.wrap)).to.equal(false);
    w.wrap.classList.add('is-wc');
    expect(getComputedStyle(w.wrap).willChange).to.equal('clip-path');
    expect(await until(() => inert(w.wrap))).to.equal(true);
    expect(await holds(() => inert(w.wrap))).to.equal(true);
    w.wrap.classList.remove('is-wc');
    expect(await until(() => !inert(w.wrap))).to.equal(true);
  });

  it('f. an existing wrapper that later gains the registered selector class becomes external at once', async () => {
    offs.push(registerExternalOverlay('.is-declared'));
    await openModal();
    const ext = makeExt(); // class fake-ext (positioned, above) but NOT the registered selector
    expect(await until(() => inert(ext))).to.equal(true);
    expect(await holds(() => inert(ext))).to.equal(true);
    ext.classList.add('is-declared');
    expect(await until(() => !inert(ext))).to.equal(true);
    ext.querySelector('.ext-input').focus();
    expect(document.activeElement).to.equal(ext.querySelector('.ext-input'));
  });

  it('g. removing the class / attribute that made a body child match, while the modal is open: inert again at once', async () => {
    offs.push(registerExternalOverlay('.is-declared'));
    let guards = 0;
    const id = await openModal({ escapeCloses: true, beforeClose: () => { guards += 1; return true; } });
    const byClass = makeExt({ cls: 'is-declared' });
    const byAttr = makeExt({ attr: true });
    await raf();
    await raf();
    expect(inert(byClass)).to.equal(false);
    expect(inert(byAttr)).to.equal(false);
    byClass.classList.remove('is-declared');
    expect(await until(() => inert(byClass), 30)).to.equal(true);
    expect(inert(byAttr)).to.equal(false); // the other one still declared
    byAttr.removeAttribute('data-td-external-overlay');
    expect(await until(() => inert(byAttr), 30)).to.equal(true);
    // nothing external any more: the kit owns Escape again
    document.getElementById(id).querySelector('.td-in').focus();
    await sendKeys({ press: 'Escape' });
    expect(await until(() => !isOpen(id))).to.equal(true);
    expect(guards).to.equal(1);
    expect(byClass.escapes + byAttr.escapes).to.equal(0);
  });
});
