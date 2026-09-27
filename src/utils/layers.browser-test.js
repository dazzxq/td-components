import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';
import { LAYERS, register, hasActiveAbove, trapContainers, trapTab } from './layers.js';
import { registerFloating, hasFloatingAbove, acquireInert } from './inert-lock.js';
import { placeFloating, isReferenceHidden } from './floating.js';

const page = document.createElement('main');
page.innerHTML = '<button id="pg">page</button>';
document.body.appendChild(page);

function portal(html = '<button>in</button>') {
  const el = document.createElement('div');
  el.innerHTML = html;
  document.body.appendChild(el);
  return el;
}
const same = (a, b) => expect(a === b, 'same element').to.equal(true);

let cleanup = [];
afterEach(() => {
  cleanup.forEach((f) => f());
  cleanup = [];
  document.querySelectorAll('body > div').forEach((d) => d.remove());
});

describe('layers: inert exemption (floating registrations)', () => {
  it('menu registered as floating above a modal lease stays interactive; page is inert', () => {
    const modal = portal();
    const menu = portal();
    const m = register({ layer: LAYERS.modal, element: modal, blocking: true });
    const f = register({ layer: LAYERS.popover, element: menu, keyboard: 'boundary' });
    cleanup.push(() => { f.release(); m.release(); });
    expect(page.hasAttribute('inert')).to.equal(true);
    expect(modal.hasAttribute('inert')).to.equal(false);
    expect(menu.hasAttribute('inert')).to.equal(false);
  });

  it('a floating registration alone never inerts anything', () => {
    const menu = portal();
    const release = registerFloating(menu, LAYERS.popover);
    cleanup.push(release);
    expect(page.hasAttribute('inert')).to.equal(false);
    expect(hasFloatingAbove(LAYERS.modal)).to.equal(true);
    expect(hasFloatingAbove(LAYERS.popover)).to.equal(false);
  });

  it('a blocking lease ABOVE a floating one still inerts it', () => {
    const menu = portal();
    const overlay = portal();
    const rf = registerFloating(menu, LAYERS.popover);
    const rb = acquireInert([overlay], LAYERS.loading);
    cleanup.push(rf, rb);
    expect(menu.hasAttribute('inert')).to.equal(true);
    expect(overlay.hasAttribute('inert')).to.equal(false);
  });

  it('release in any order restores everything', () => {
    const modal = portal();
    const menu = portal();
    const toast = portal();
    const a = register({ layer: LAYERS.modal, element: modal, blocking: true });
    const b = register({ layer: LAYERS.popover, element: menu });
    const c = register({ layer: LAYERS.toast, element: toast, keyboard: 'none', includeInTrap: true });
    a.release();
    expect(page.hasAttribute('inert')).to.equal(false);
    c.release();
    b.release();
    b.release(); // idempotent
    [page, modal, menu, toast].forEach((el) => expect(el.hasAttribute('inert')).to.equal(false));
    expect(hasActiveAbove(0)).to.equal(false);
  });
});

describe('layers: keyboard dispatcher', () => {
  it('Escape goes to the highest boundary only and is consumed there', async () => {
    const calls = [];
    const low = register({ layer: LAYERS.lightbox, element: portal(), onEscape: () => { calls.push('lb'); } });
    const high = register({ layer: LAYERS.modal, element: portal(), onEscape: () => { calls.push('modal'); } });
    let reachedDoc = false;
    const onDoc = () => { reachedDoc = true; };
    document.addEventListener('keydown', onDoc);
    cleanup.push(() => { low.release(); high.release(); document.removeEventListener('keydown', onDoc); });
    await sendKeys({ press: 'Escape' });
    expect(calls).to.deep.equal(['modal']);
    expect(reachedDoc).to.equal(false);
    expect(high.isTop()).to.equal(true);
    expect(low.isTop()).to.equal(false);
  });

  it("'none' registrations (toast) are skipped; onEscape returning false leaves the event alone", async () => {
    const calls = [];
    const lb = register({ layer: LAYERS.lightbox, element: portal(), onEscape: () => { calls.push('lb'); return false; } });
    const toast = register({ layer: LAYERS.toast, element: portal(), keyboard: 'none', onEscape: () => calls.push('toast') });
    let reachedDoc = false;
    const onDoc = () => { reachedDoc = true; };
    document.addEventListener('keydown', onDoc);
    cleanup.push(() => { lb.release(); toast.release(); document.removeEventListener('keydown', onDoc); });
    await sendKeys({ press: 'Escape' });
    expect(calls).to.deep.equal(['lb']);
    expect(reachedDoc).to.equal(true);
  });

  it("Tab: 'pass' hands the key to the next lower boundary", async () => {
    const calls = [];
    const modal = register({ layer: LAYERS.modal, element: portal(), onTab: (e) => { calls.push('modal'); e.preventDefault(); return 'handled'; } });
    const menu = register({ layer: LAYERS.popover, element: portal(), onTab: () => { calls.push('menu'); return 'pass'; } });
    const tip = register({ layer: LAYERS.tooltip, element: portal() }); // boundary without onTab: skipped for Tab
    cleanup.push(() => { tip.release(); menu.release(); modal.release(); });
    await sendKeys({ press: 'Tab' });
    expect(calls).to.deep.equal(['menu', 'modal']);
  });

  it('listener is removed when nothing is registered', async () => {
    let calls = 0;
    const r = register({ layer: LAYERS.modal, element: portal(), onEscape: () => { calls++; } });
    r.release();
    await sendKeys({ press: 'Escape' });
    expect(calls).to.equal(0);
  });
});

describe('layers: trapTab', () => {
  it('cycles through the dialog plus includeInTrap containers (toast reachable over a modal)', async () => {
    const dialog = portal('<button id="d1">1</button><button id="d2">2</button>');
    dialog.tabIndex = -1;
    const toast = portal('<button id="t1">close</button>');
    const m = register({ layer: LAYERS.modal, element: dialog, blocking: true, onTab: (e) => trapTab(e, dialog, LAYERS.modal) });
    const t = register({ layer: LAYERS.toast, element: toast, keyboard: 'none', includeInTrap: true });
    cleanup.push(() => { t.release(); m.release(); });
    same(trapContainers(LAYERS.modal)[0], toast);
    document.getElementById('d1').focus();
    await sendKeys({ press: 'Tab' });
    expect(document.activeElement.id).to.equal('d2');
    await sendKeys({ press: 'Tab' });
    expect(document.activeElement.id).to.equal('t1');
    await sendKeys({ press: 'Tab' });
    expect(document.activeElement.id).to.equal('d1');
    await sendKeys({ press: 'Shift+Tab' });
    expect(document.activeElement.id).to.equal('t1');
  });

  it('pulls focus back from outside; an empty dialog focuses itself', async () => {
    const dialog = portal('');
    dialog.tabIndex = -1;
    const m = register({ layer: LAYERS.modal, element: dialog, blocking: true, onTab: (e) => trapTab(e, dialog, LAYERS.modal) });
    cleanup.push(() => m.release());
    document.body.focus();
    await sendKeys({ press: 'Tab' });
    same(document.activeElement, dialog);
  });
});

describe('floating: placeFloating / isReferenceHidden', () => {
  function setup(top) {
    const trigger = portal('');
    trigger.style.setProperty('position', 'fixed');
    trigger.style.setProperty('top', `${top}px`);
    trigger.style.setProperty('left', '20px');
    trigger.style.setProperty('width', '120px');
    trigger.style.setProperty('height', '30px');
    const panel = portal('<p>head</p><ul class="l"><li>a</li><li>b</li></ul>');
    panel.style.setProperty('position', 'fixed');
    return { trigger, panel, list: panel.querySelector('.l') };
  }

  it('opens below when it fits, width matched, never overlapping the trigger', () => {
    const { trigger, panel } = setup(20);
    const r = placeFloating(trigger, panel, { width: 'match' });
    expect(r.side).to.equal('bottom');
    expect(panel.getBoundingClientRect().width).to.equal(120);
    expect(panel.getBoundingClientRect().top).to.be.at.least(trigger.getBoundingClientRect().bottom);
  });

  it('flips above near the bottom edge and caps the list when neither side fits', () => {
    const { trigger, panel, list } = setup(window.innerHeight - 40);
    expect(placeFloating(trigger, panel, { width: 'match', list }).side).to.equal('top');
    expect(panel.getBoundingClientRect().bottom).to.be.at.most(trigger.getBoundingClientRect().top);
    list.style.setProperty('height', `${window.innerHeight * 2}px`);
    list.style.setProperty('overflow', 'auto');
    placeFloating(trigger, panel, { width: 'match', list });
    expect(panel.getBoundingClientRect().top).to.be.at.least(0);
  });

  it("side:'top' is preferred when it fits; width:'auto' centres and clamps into the viewport", () => {
    const { trigger, panel } = setup(200);
    const r = placeFloating(trigger, panel, { side: 'top', width: 'auto' });
    expect(r.side).to.equal('top');
    expect(r.left).to.be.at.least(0);
  });

  it('isReferenceHidden', () => {
    expect(isReferenceHidden({ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 })).to.equal(true);
    expect(isReferenceHidden({ top: -100, bottom: -50, left: 10, right: 50, width: 40, height: 50 })).to.equal(true);
    expect(isReferenceHidden({ top: 50, bottom: 80, left: 10, right: 50, width: 40, height: 30 })).to.equal(false);
  });
});

describe('review round 1 (v0.9.0 impl)', () => {
  it('focusablesIn: native summary/iframe count; tabindex < 0 and disabled do not', async () => {
    const { focusablesIn } = await import('./layers.js');
    const root = portal('<details><summary id="s">x</summary></details><iframe id="f"></iframe>'
      + '<span id="m2" tabindex="-2">x</span><span id="z" tabindex="0">x</span><button id="d" disabled>x</button>');
    const ids = focusablesIn(root).map((el) => el.id);
    expect(ids).to.deep.equal(['s', 'f', 'z']);
  });

  it('Escape during IME composition is not routed', () => {
    let calls = 0;
    const r = register({ layer: LAYERS.modal, element: portal(), onEscape: () => { calls++; } });
    cleanup.push(() => r.release());
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', isComposing: true, bubbles: true }));
    expect(calls).to.equal(0);
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(calls).to.equal(1);
  });
});

describe('placeFloating align (v0.12.0 step 0)', () => {
  function pair() {
    const trigger = portal('');
    for (const [k, v] of [['position', 'fixed'], ['top', '100px'], ['left', '300px'], ['width', '120px'], ['height', '30px']]) trigger.style.setProperty(k, v);
    const panel = portal('<p>menu panel wider than trigger</p>');
    for (const [k, v] of [['position', 'fixed'], ['width', '240px']]) panel.style.setProperty(k, v);
    return { trigger, panel };
  }
  it("align 'end' lines up right edges, 'start' left edges, default centres", () => {
    let { trigger, panel } = pair();
    placeFloating(trigger, panel, { width: 'auto', align: 'end' });
    expect(Math.round(panel.getBoundingClientRect().right)).to.equal(Math.round(trigger.getBoundingClientRect().right));
    placeFloating(trigger, panel, { width: 'auto', align: 'start' });
    expect(Math.round(panel.getBoundingClientRect().left)).to.equal(300);
    placeFloating(trigger, panel, { width: 'auto' });
    expect(Math.round(panel.getBoundingClientRect().left)).to.equal(300 + 60 - 120);
  });
});
