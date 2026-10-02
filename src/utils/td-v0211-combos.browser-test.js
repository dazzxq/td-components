import { expect } from '@esm-bundle/chai';
import { sendKeys, sendMouse } from '@web/test-runner-commands';
import {
  TdModal, TdMenu, TdHovercard, TdLightbox, TdLoading, TdModalStackManager, tdTooltip,
} from '../../index.js';
import { isScrollLocked } from './scroll-lock.js';
import { hasActiveAbove } from './layers.js';

// v0.21.1 — popups / modal / lightbox combinations (plan docs/internal/plans/v0.21.1-combination-fixes.md).
// Each bug of the audit has a test that failed before the fix; the combinations the audit found OK are kept as
// regression tests at the end.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const frames = (n = 2) => new Promise((r) => {
  const f = () => (--n <= 0 ? r() : requestAnimationFrame(f));
  requestAnimationFrame(f);
});
const center = (el) => {
  const r = el.getBoundingClientRect();
  return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)];
};
const topAt = (el) => document.elementFromPoint(...center(el));
const zOf = (el) => Number(getComputedStyle(el).zIndex) || 0;
const OPTS = [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }, { value: 'c', label: 'C' }];
const IMG = '/td-v0211-missing.png'; // same-origin URL (a 404 is fine: only the overlay matters)

function ddIn(html = '<td-dropdown name="x"></td-dropdown>') {
  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  return { wrap, dd: wrap.querySelector('td-dropdown') };
}

/** Escape reached the document (i.e. no layer consumed it). */
function watchDocEscape() {
  const rec = { seen: 0 };
  const on = (e) => { if (e.key === 'Escape') rec.seen++; };
  document.addEventListener('keydown', on);
  rec.stop = () => document.removeEventListener('keydown', on);
  return rec;
}

const extra = [];
afterEach(async () => {
  TdMenu.close();
  TdHovercard.close();
  TdLightbox.close();
  TdLoading.hide();
  TdModal.closeAll();
  document.querySelectorAll('td-dropdown').forEach((d) => d.close && d.close());
  if (tdTooltip.isVisible) tdTooltip.hide();
  TdModalStackManager.BASE_Z_INDEX = null;
  extra.splice(0).forEach((f) => f());
  await sendMouse({ type: 'move', position: [1, 1] });
  await wait(450);
});

describe('v0.21.1 bug 1 — a newer blocking layer below the popup covers it (F2)', () => {
  it('dropdown open in a modal: a modal opened by code closes it; focus + Escape belong to the new modal', async () => {
    const { wrap, dd } = ddIn('<td-dropdown name="x" searchable></td-dropdown>');
    TdModal.show({ title: 'Lower', body: wrap });
    dd.options = OPTS;
    await wait(400);
    dd.open();
    await frames();
    expect(dd._isOpen).to.equal(true);
    const inp = document.createElement('input');
    const upperId = TdModal.show({ title: 'Upper', body: inp });
    expect(dd._isOpen, 'covered → closed at once').to.equal(false);
    await wait(400);
    const upper = document.getElementById(upperId);
    expect(upper.contains(document.activeElement), 'focus in the new modal').to.equal(true);
    const doc = watchDocEscape();
    extra.push(doc.stop);
    await sendKeys({ press: 'Escape' });
    expect(TdModal._isOpen(upperId), 'upper modal consumed Escape (never closes on Escape)').to.equal(true);
    expect(doc.seen).to.equal(0);
    expect(dd.getValue(), 'nothing selected through the upper modal').to.equal(null);
  });

  it('TdMenu open in a modal: a modal opened by code closes it without focusing the (inert) anchor', async () => {
    const btn = document.createElement('button');
    btn.textContent = 'more';
    TdModal.show({ title: 'Lower', body: btn });
    await wait(400);
    btn.focus();
    let reason = null;
    TdMenu.open(btn, [{ label: 'A', onSelect() {} }], { onClose: (r) => { reason = r; } });
    await frames();
    const upperId = TdModal.show({ title: 'Upper', body: 'x' });
    expect(TdMenu.isOpen(), 'menu closed').to.equal(false);
    expect(reason).to.equal('covered');
    await wait(400);
    expect(document.getElementById(upperId).contains(document.activeElement)).to.equal(true);
  });

  it('chip-input suggestions in a modal close when a newer modal opens', async () => {
    const wrap = document.createElement('div');
    wrap.innerHTML = '<td-chip-input name="tags"></td-chip-input>';
    const ci = wrap.firstElementChild;
    TdModal.show({ title: 'M', body: wrap });
    await wait(400);
    ci.options = ['alpha', 'beta', 'gamma'];
    ci.querySelector('input').focus();
    await sendKeys({ type: 'a' });
    await wait(300);
    expect(ci._isOpen).to.equal(true);
    TdModal.show({ title: 'Upper', body: 'x' });
    expect(ci._isOpen).to.equal(false);
  });

  it('hover tooltip hides at once when a modal or the loading overlay opens by code (coverAlways)', async () => {
    tdTooltip.init();
    const b = document.createElement('button');
    b.textContent = 'hover me';
    b.setAttribute('data-tooltip', 'Gợi ý');
    document.body.appendChild(b);
    extra.push(() => b.remove());
    await frames();
    await sendMouse({ type: 'move', position: center(b) });
    await frames();
    expect(tdTooltip.isVisible, 'shown by hover').to.equal(true);
    TdModal.show({ title: 'M', body: 'x' });
    expect(tdTooltip.isVisible, 'hidden under the modal').to.equal(false);
    expect(tdTooltip._layer === null, 'registration released').to.equal(true);
    TdModal.closeAll();
    await wait(400);
    await sendMouse({ type: 'move', position: [1, 1] });
    await sendMouse({ type: 'move', position: center(b) });
    await frames();
    expect(tdTooltip.isVisible).to.equal(true);
    TdLoading.show();
    expect(tdTooltip.isVisible, 'hidden under the loading overlay (480)').to.equal(false);
  });

  it('loading (480, above the popover) over a modal with an open dropdown keeps the old behaviour', async () => {
    const { wrap, dd } = ddIn();
    TdModal.show({ title: 'M', body: wrap });
    dd.options = OPTS;
    await wait(400);
    dd.open();
    await frames();
    TdLoading.show();
    await wait(100);
    expect(dd._isOpen, 'still open (inert under the loading lease)').to.equal(true);
    expect(!!dd._menuElement.closest('[inert]')).to.equal(true);
    TdLoading.hide();
    await wait(100);
    expect(dd._isOpen).to.equal(true);
    expect(!!dd._menuElement.closest('[inert]')).to.equal(false);
  });
});

describe('v0.21.1 F2b — a closing modal takes its popups with it', () => {
  it('dropdown + TdMenu anchored in a modal close synchronously with closeById (before the exit transition)', async () => {
    const { wrap, dd } = ddIn('<td-dropdown name="x"></td-dropdown><button class="m">more</button>');
    const id = TdModal.show({ title: 'M', body: wrap });
    dd.options = OPTS;
    await wait(400);
    dd.open();
    await frames();
    expect(dd._isOpen).to.equal(true);
    TdModal.closeById(id);
    expect(dd._isOpen, 'dropdown closed with the modal').to.equal(false);
    expect(hasActiveAbove(0), 'no keyboard registration left').to.equal(false);

    const btn = document.createElement('button');
    const id2 = TdModal.show({ title: 'M2', body: btn });
    await wait(400);
    TdMenu.open(btn, [{ label: 'A', onSelect() {} }]);
    await frames();
    expect(TdMenu.isOpen()).to.equal(true);
    TdModal.closeById(id2);
    expect(TdMenu.isOpen(), 'menu closed with the modal').to.equal(false);
    expect(hasActiveAbove(0)).to.equal(false);
  });

  it('focus in the portaled search of a dropdown when its modal closes → back to the modal opener', async () => {
    const opener = document.createElement('button');
    opener.textContent = 'open';
    document.body.appendChild(opener);
    extra.push(() => opener.remove());
    opener.focus();
    const { wrap, dd } = ddIn('<td-dropdown name="x" searchable></td-dropdown>');
    const id = TdModal.show({ title: 'M', body: wrap });
    dd.options = OPTS;
    await wait(400);
    dd.open();
    await wait(200);
    const search = dd._menuElement.querySelector('.td-dropdown__search');
    search.focus();
    expect(document.activeElement === search).to.equal(true);
    TdModal.closeById(id);
    expect(document.activeElement === opener, 'focus back on the opener').to.equal(true);
  });
});

describe('v0.21.1 bug 2 — lightbox opened from a modal (F4)', () => {
  it('(a) sits on top, is usable, keyboard works; closing it gives the modal back', async () => {
    const b = document.createElement('button');
    b.textContent = 'xem ảnh';
    const id = TdModal.show({ title: 'Gallery', body: b });
    await wait(400);
    b.focus();
    TdLightbox.open([IMG, IMG, IMG]);
    await wait(500);
    const ov = document.querySelector('.td-lightbox');
    expect(ov.hasAttribute('inert'), 'lightbox not inert').to.equal(false);
    expect(ov.contains(topAt(ov)), 'lightbox paints over the modal').to.equal(true);
    expect(ov.contains(document.activeElement), 'focus in the lightbox').to.equal(true);
    const counter = ov.querySelector('.td-lightbox__counter');
    const before = counter.textContent;
    await sendKeys({ press: 'ArrowRight' });
    await frames();
    expect(counter.textContent, 'arrow keys navigate').to.not.equal(before);
    await sendKeys({ press: 'Escape' });
    await wait(400);
    expect(!!document.querySelector('.td-lightbox[data-state="open"]')).to.equal(false);
    const root = document.getElementById(id);
    expect(root.hasAttribute('inert')).to.equal(false);
    expect(document.activeElement === b, 'focus back on the button in the modal').to.equal(true);
    expect(isScrollLocked()).to.equal(true);
    TdModal.closeById(id);
    await wait(400);
    expect(isScrollLocked()).to.equal(false);
    expect([...document.body.children].filter((c) => c.hasAttribute('inert')).length).to.equal(0);
  });

  it('(b) a modal opened from that lightbox is on top of it', async () => {
    const b = document.createElement('button');
    TdModal.show({ title: 'Gallery', body: b });
    await wait(400);
    b.focus();
    TdLightbox.open([IMG, IMG]);
    await wait(400);
    const ov = document.querySelector('.td-lightbox');
    const id = TdModal.show({ title: 'Over lightbox', body: '<input>' });
    await wait(400);
    const dialog = document.getElementById(id).querySelector('.td-modal__dialog');
    expect(dialog.contains(topAt(dialog)), 'new modal paints over the lightbox').to.equal(true);
    expect(ov.hasAttribute('inert'), 'lightbox inert under it').to.equal(true);
    expect(dialog.contains(document.activeElement)).to.equal(true);
  });

  it('(c) loading opened first, then a modal: loading stays on top and keeps focus / keyboard', async () => {
    TdLoading.show();
    await wait(100);
    const load = TdLoading.element;
    const id = TdModal.show({ title: 'M', body: '<input>' });
    await wait(400);
    const root = document.getElementById(id);
    expect(zOf(load) > zOf(root)).to.equal(true);
    expect(load.contains(topAt(root.querySelector('.td-modal__dialog')))).to.equal(true);
    expect(load.contains(document.activeElement)).to.equal(true);
    await sendKeys({ press: 'Tab' });
    expect(load.contains(document.activeElement), 'Tab held by the loading overlay').to.equal(true);
  });

  it('(d) a site that shifts the --td-z-* scale keeps the visual order (lightbox over modal, popover over both)', async () => {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(':root{--td-z-lightbox:1350;--td-z-modal:1400;--td-z-popover:1450;--td-z-loading:1480;}');
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    extra.push(() => { document.adoptedStyleSheets = document.adoptedStyleSheets.filter((s) => s !== sheet); });
    const b = document.createElement('button');
    const id = TdModal.show({ title: 'Gallery', body: b });
    await wait(400);
    b.focus();
    TdLightbox.open([IMG]);
    await wait(400);
    const ov = document.querySelector('.td-lightbox');
    expect(zOf(ov) > zOf(document.getElementById(id))).to.equal(true);
    expect(zOf(ov) < 1450).to.equal(true);
    expect(ov.contains(topAt(ov))).to.equal(true);
  });

  it('(e) BASE_Z_INDEX: removing a lower modal keeps the promoted modal above the lightbox', async () => {
    TdModalStackManager.BASE_Z_INDEX = 1000;
    const x = document.createElement('button');
    const idX = TdModal.show({ title: 'X', body: x });
    await wait(300);
    x.focus();
    TdLightbox.open([IMG]);
    await wait(400);
    const ov = document.querySelector('.td-lightbox');
    const idB = TdModal.show({ title: 'B', body: '<input>' });
    await wait(400);
    const rootB = document.getElementById(idB);
    expect(zOf(ov) > zOf(document.getElementById(idX))).to.equal(true);
    expect(zOf(rootB) > zOf(ov)).to.equal(true);
    TdModal.closeById(idX);
    await wait(50);
    expect(zOf(rootB) > zOf(ov), 'still above the lightbox after _sync()').to.equal(true);
    const dialog = rootB.querySelector('.td-modal__dialog');
    expect(dialog.contains(topAt(dialog))).to.equal(true);
  });
});

describe('v0.21.1 bug 3 — TdMenu follows its anchor out of the DOM (F1)', () => {
  it('anchor in a modal closed by code → menu closed, isOpen() false, Escape not held', async () => {
    const btn = document.createElement('button');
    btn.textContent = 'more';
    const id = TdModal.show({ title: 'M', body: btn });
    await wait(400);
    btn.focus();
    TdMenu.open(btn, [{ label: 'A', onSelect() {} }]);
    await frames();
    TdModal.closeById(id);
    await wait(500);
    expect(TdMenu.isOpen()).to.equal(false);
    expect(!document.querySelector('.td-menu')).to.equal(true);
    expect(hasActiveAbove(0)).to.equal(false);
  });

  it('anchor removed from the page (no scroll / resize) → menu closes', async () => {
    const btn = document.createElement('button');
    btn.textContent = 'more';
    document.body.appendChild(btn);
    let reason = null;
    TdMenu.open(btn, [{ label: 'A', onSelect() {} }], { onClose: (r) => { reason = r; } });
    await frames();
    btn.remove();
    await frames();
    expect(TdMenu.isOpen()).to.equal(false);
    expect(reason).to.equal('hidden');
    expect(!!document.activeElement).to.equal(true);
  });
});

describe('v0.21.1 bug 4 — TdMenu opened from a hovercard (F3)', () => {
  it('the card stays open while its child menu is used; selecting keeps focus off <body>', async () => {
    const trig = document.createElement('a');
    trig.href = '#';
    trig.textContent = 'user';
    document.body.appendChild(trig);
    let selected = null;
    const unbind = TdHovercard.bind(trig, {
      content: () => {
        const btn = document.createElement('button');
        btn.textContent = 'more';
        btn.className = 'hc-more';
        btn.addEventListener('click', () => TdMenu.open(btn, [{ label: 'Sửa', onSelect: () => { selected = 'edit'; } }]));
        return btn;
      },
    });
    extra.push(() => { unbind(); trig.remove(); });
    await sendMouse({ type: 'move', position: center(trig) });
    await wait(600);
    const more = document.querySelector('.hc-more');
    expect(!!more, 'hovercard open').to.equal(true);
    await sendMouse({ type: 'move', position: center(more) });
    await sendMouse({ type: 'click', position: center(more) });
    await wait(50);
    const item = document.querySelector('.td-menu [role="menuitem"]');
    expect(!!item, 'menu open').to.equal(true);
    await sendMouse({ type: 'move', position: center(item) });
    await wait(600);
    expect(more.isConnected, 'card kept open (anchor still there)').to.equal(true);
    expect(TdMenu.isOpen()).to.equal(true);
    await sendMouse({ type: 'click', position: center(item) });
    await wait(50);
    expect(selected).to.equal('edit');
    expect(document.activeElement !== document.body, 'not on body').to.equal(true);
    expect(document.activeElement === more).to.equal(true);
  });

  it('closing the card closes its child menu first', async () => {
    const trig = document.createElement('a');
    trig.href = '#';
    trig.textContent = 'user';
    document.body.appendChild(trig);
    const unbind = TdHovercard.bind(trig, {
      content: () => { const b = document.createElement('button'); b.className = 'hc-more'; b.textContent = 'more'; return b; },
    });
    extra.push(() => { unbind(); trig.remove(); });
    trig.focus();
    await sendKeys({ press: 'Shift' });
    await sendMouse({ type: 'move', position: center(trig) });
    await wait(600);
    const more = document.querySelector('.hc-more');
    expect(!!more).to.equal(true);
    TdMenu.open(more, [{ label: 'A', onSelect() {} }]);
    await frames();
    TdHovercard.close();
    expect(TdMenu.isOpen()).to.equal(false);
    expect(hasActiveAbove(0)).to.equal(false);
  });
});

describe('v0.21.1 bug 5 — trigger hidden without scroll / resize (F1 ResizeObserver)', () => {
  it('dropdown in a td-tabs panel that gets switched → closes', async () => {
    const host = document.createElement('div');
    host.innerHTML = '<td-tabs></td-tabs><section id="v-p1"><td-dropdown name="d"></td-dropdown></section><section id="v-p2">two</section>';
    document.body.appendChild(host);
    extra.push(() => host.remove());
    const tabs = host.querySelector('td-tabs');
    tabs.tabs = [{ id: 't1', label: 'One', panel: 'v-p1' }, { id: 't2', label: 'Two', panel: 'v-p2' }];
    const dd = host.querySelector('td-dropdown');
    dd.options = OPTS;
    await frames();
    dd.open();
    await frames();
    expect(dd._isOpen).to.equal(true);
    tabs.setActiveTab('t2');
    await wait(100);
    expect(dd._isOpen).to.equal(false);
  });

  it('TdMenu / tooltip whose trigger gets display:none close', async () => {
    tdTooltip.init();
    const box = document.createElement('div');
    box.innerHTML = '<button class="a">menu</button><button class="t" data-tooltip="Gợi ý">tip</button>';
    document.body.appendChild(box);
    extra.push(() => box.remove());
    const a = box.querySelector('.a');
    TdMenu.open(a, [{ label: 'A', onSelect() {} }]);
    tdTooltip.show(box.querySelector('.t'));
    await frames();
    expect(TdMenu.isOpen()).to.equal(true);
    expect(tdTooltip.isVisible).to.equal(true);
    box.hidden = true;
    await wait(100);
    expect(TdMenu.isOpen()).to.equal(false);
    expect(tdTooltip.isVisible).to.equal(false);
  });
});

describe('v0.21.1 bug 6 — popups opened during a modal entry transition end up aligned (F1 transitionend)', () => {
  it('dropdown opened in onShow: 8 px under the trigger, same width, after the entry transition', async () => {
    const { wrap, dd } = ddIn();
    dd.options = [{ value: 'a', label: 'A' }];
    TdModal.show({ title: 'M', body: wrap, onShow: () => dd.open() });
    await wait(700);
    expect(dd._isOpen).to.equal(true);
    const t = dd.querySelector('.td-dropdown__trigger').getBoundingClientRect();
    const m = dd._menuElement.getBoundingClientRect();
    expect(Math.abs(m.top - t.bottom - 8), 'gap').to.be.below(2);
    expect(Math.abs(m.left - t.left), 'left').to.be.below(2);
    expect(Math.abs(m.width - t.width), 'width').to.be.below(2);
  });

  it('tooltip on the initial focus of a modal is centred on its trigger after the transition', async () => {
    tdTooltip.init();
    const b = document.createElement('button');
    b.textContent = 'save';
    b.setAttribute('data-tooltip', 'Lưu thay đổi');
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    extra.push(() => opener.remove());
    opener.focus();
    await sendKeys({ press: 'Shift' });
    TdModal.show({ title: 'M', body: b, focusTarget: b });
    await wait(700);
    expect(document.activeElement === b).to.equal(true);
    const tip = document.getElementById('td-tooltip');
    expect(tip.hidden).to.equal(false);
    const r = b.getBoundingClientRect();
    const tr = tip.getBoundingClientRect();
    expect(Math.abs((r.left + r.right) / 2 - (tr.left + tr.right) / 2)).to.be.below(2);
    expect(r.top - tr.bottom).to.be.within(0, 16);
  });
});

describe('v0.21.1 Escape hand-off — a hover tooltip never takes the popup’s Escape', () => {
  async function hoverTip() {
    tdTooltip.init();
    const b = document.createElement('button');
    b.textContent = 'tip';
    b.setAttribute('data-tooltip', 'Gợi ý');
    b.className = 'esc-tip';
    document.body.appendChild(b);
    extra.push(() => b.remove());
    await frames();
    return b;
  }

  // The pointer rests on a tooltip trigger while a popup is opened from the keyboard (the tooltip is older than the
  // popup and its trigger has no focus): the popup owns Escape. Before v0.21.1 the tooltip (510) took it.
  it('hover tooltip, then a dropdown opened: Escape closes the dropdown, the next Escape the tooltip', async () => {
    const tip = await hoverTip();
    const { wrap, dd } = ddIn();
    document.body.appendChild(wrap);
    extra.push(() => wrap.remove());
    dd.options = OPTS;
    await frames();
    await sendMouse({ type: 'move', position: center(tip) });
    await frames();
    expect(tdTooltip.isVisible).to.equal(true);
    const trig = dd.querySelector('.td-dropdown__trigger');
    trig.focus();
    await sendKeys({ press: 'ArrowDown' });
    await frames();
    expect(dd._isOpen).to.equal(true);
    expect(tdTooltip.isVisible).to.equal(true);
    await sendKeys({ press: 'Escape' });
    expect(dd._isOpen, 'first Escape → the dropdown').to.equal(false);
    expect(tdTooltip.isVisible).to.equal(true);
    await sendKeys({ press: 'Escape' });
    expect(tdTooltip.isVisible, 'second Escape → the tooltip').to.equal(false);
  });

  it('hover tooltip, then a TdMenu opened: Escape closes the menu first', async () => {
    const tip = await hoverTip();
    const btn = document.createElement('button');
    btn.textContent = 'more';
    document.body.appendChild(btn);
    extra.push(() => btn.remove());
    await sendMouse({ type: 'move', position: center(tip) });
    await frames();
    expect(tdTooltip.isVisible).to.equal(true);
    btn.focus();
    TdMenu.open(btn, [{ label: 'A', onSelect() {} }]);
    await frames();
    expect(tdTooltip.isVisible).to.equal(true);
    await sendKeys({ press: 'Escape' });
    expect(TdMenu.isOpen(), 'first Escape → the menu').to.equal(false);
    expect(document.activeElement === btn).to.equal(true);
    await sendKeys({ press: 'Escape' });
    expect(tdTooltip.isVisible).to.equal(false);
  });

  it('tooltip on the focused trigger still takes Escape first (WCAG 1.4.13, unchanged)', async () => {
    tdTooltip.init();
    const b = document.createElement('button');
    b.textContent = 'tip';
    b.setAttribute('data-tooltip', 'Gợi ý');
    document.body.appendChild(b);
    extra.push(() => b.remove());
    b.focus();
    await frames();
    expect(tdTooltip.isVisible).to.equal(true);
    const doc = watchDocEscape();
    extra.push(doc.stop);
    await sendKeys({ press: 'Escape' });
    expect(tdTooltip.isVisible).to.equal(false);
    expect(doc.seen).to.equal(0);
  });
});

describe('v0.21.1 regressions — combinations the audit found OK', () => {
  it('modal in modal: scroll lock + inert restore', async () => {
    const id1 = TdModal.show({ title: 'A', body: 'a' });
    const id2 = TdModal.show({ title: 'B', body: 'b' });
    await wait(300);
    TdModal.closeById(id2);
    await wait(400);
    const m1 = document.getElementById(id1);
    expect(isScrollLocked()).to.equal(true);
    expect(m1.hasAttribute('inert')).to.equal(false);
    TdModal.closeById(id1);
    await wait(400);
    expect(isScrollLocked()).to.equal(false);
    expect([...document.body.children].filter((c) => c.hasAttribute('inert')).length).to.equal(0);
  });

  it('modal opened over the lightbox, then closed', async () => {
    TdLightbox.open([IMG, IMG]);
    await wait(400);
    const ov = document.querySelector('.td-lightbox');
    const id = TdModal.show({ title: 'over lb', body: 'x' });
    await wait(300);
    expect(ov.hasAttribute('inert')).to.equal(true);
    const dialog = document.getElementById(id).querySelector('.td-modal__dialog');
    expect(dialog.contains(topAt(dialog))).to.equal(true);
    await sendKeys({ press: 'Escape' });
    await wait(100);
    expect(!!document.querySelector('.td-lightbox[data-state="open"]'), 'Escape never reaches the lightbox').to.equal(true);
    TdModal.closeById(id);
    await wait(400);
    expect(ov.hasAttribute('inert')).to.equal(false);
    expect(isScrollLocked()).to.equal(true);
    TdLightbox.close();
    await wait(400);
    expect(isScrollLocked()).to.equal(false);
  });

  it('dropdown in a modal: Escape closes only the dropdown, focus back on the trigger', async () => {
    const { wrap, dd } = ddIn();
    const id = TdModal.show({ title: 'M', body: wrap });
    dd.options = OPTS;
    await wait(400);
    const trig = dd.querySelector('.td-dropdown__trigger');
    trig.focus();
    await sendKeys({ press: 'ArrowDown' });
    await frames();
    await sendKeys({ press: 'Escape' });
    await frames();
    expect(dd._isOpen).to.equal(false);
    expect(TdModal._isOpen(id)).to.equal(true);
    expect(document.activeElement === trig).to.equal(true);
  });

  it('datetime-picker in a form modal: Escape closes only the picker, focus back on its trigger', async () => {
    const form = document.createElement('form');
    form.innerHTML = '<td-datetime-picker name="when" mode="date"></td-datetime-picker><button>go</button>';
    const id = TdModal.show({ title: 'Form', body: form });
    await wait(400);
    const trig = form.querySelector('.td-dtp__trigger');
    await sendMouse({ type: 'click', position: center(trig) });
    await wait(600);
    expect(TdModalStackManager.stack.length).to.equal(2);
    await sendKeys({ press: 'Escape' });
    await wait(400);
    expect(TdModalStackManager.stack.length).to.equal(1);
    expect(TdModal._isOpen(id)).to.equal(true);
    expect(document.activeElement === trig).to.equal(true);
  });
});
