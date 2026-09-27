import { expect } from '@esm-bundle/chai';
import { sendKeys, sendMouse, resetMouse, setViewport, emulateMedia } from '@web/test-runner-commands';
import { TdDropdown } from './td-dropdown.js';
import { TdButton } from './td-button.js';
import { LAYERS, register, trapTab } from '../utils/layers.js';

/** v0.14.1/0.14.2: resting control borders are soft (--td-control-border-soft, visible ≥ 1.3:1); hover uses the
 *  softer step --td-control-border-hover (≥ 1.8:1, darker than rest); focus keeps the ring; strict sites map both to
 *  --td-control-border-strong (≥ 3:1). Resolves a token to a computed colour. */
function tokenColor(name) {
  const p = document.createElement('span');
  p.style.setProperty('color', `var(${name})`);
  document.body.appendChild(p);
  const c = getComputedStyle(p).color;
  p.remove();
  return c;
}

// Batch 3 — td-dropdown token-native (plan docs/plans/v0.9.0-batch3.md step 4: D17/D18/D19). td.css only.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

document.addEventListener('submit', (e) => e.preventDefault(), true);
const host = document.createElement('div');
document.body.appendChild(host);
const mount = (html, parent = host) => { parent.insertAdjacentHTML('beforeend', html.trim()); return parent.lastElementChild; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
/** never hand DOM elements to chai deep asserts (it hangs inspecting them) */
const same = (a, b) => a === b;
const CITIES = [
  { value: 'hn', label: 'Hà Nội' },
  { value: 'sg', label: 'Sài Gòn' },
  { value: 'dn', label: 'Đà Nẵng' },
  { value: 'hp', label: 'Hải Phòng' },
];
function dd(attrs = '', parent = host) {
  const el = mount(`<td-dropdown ${attrs}></td-dropdown>`, parent);
  el.options = CITIES.map((c) => ({ ...c }));
  return el;
}
const trig = (el) => el.querySelector('.td-dropdown__trigger');
const opts = (el) => [...el._menuElement.querySelectorAll('[role="option"]')];
const activeOpt = (el) => el._menuElement.querySelector('[data-active]');

let cleanup = [];
afterEach(async () => {
  cleanup.forEach((f) => f());
  cleanup = [];
  host.innerHTML = '';
  document.querySelectorAll('body > .test-modal').forEach((m) => m.remove());
  document.documentElement.removeAttribute('data-td-theme');
  await resetMouse();
  await emulateMedia({ reducedMotion: 'no-preference' });
});

/* WCAG contrast from computed colours */
function rgb(str) {
  const m = /rgba?\(([^)]+)\)/.exec(str);
  const n = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  return { r: n[0], g: n[1], b: n[2], a: n.length > 3 ? n[3] : 1 };
}
const ratio = (a, b) => {
  const [x, y] = [TdButton._luminance(rgb(a)), TdButton._luminance(rgb(b))].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const KEEP = ['type', 'role', 'aria-hidden', 'hidden', 'data-td-icon', 'data-icon', 'aria-selected', 'aria-controls',
  'aria-labelledby', 'aria-describedby', 'aria-errormessage', 'aria-invalid', 'aria-required', 'aria-label',
  'data-state', 'for', 'id', 'tabindex', 'aria-expanded', 'aria-haspopup', 'aria-autocomplete', 'data-placement',
  'data-value', 'data-index', 'data-active', 'data-placeholder'];
function shape(el) {
  const attrs = KEEP.filter((a) => el.hasAttribute(a)).map((a) => `${a}=${el.getAttribute(a)}`);
  const cls = [...el.classList].sort().join('.');
  const kids = el.localName === 'svg' && el.getAttribute('data-icon') ? [] : [...el.children].map(shape);
  return { tag: el.localName, cls, attrs, kids };
}

describe('batch 3 — td-dropdown structure', () => {
  it('matches the golden contract (host tree + open portal menu)', async () => {
    const html = await (await fetch('/test/contracts/dropdown.html')).text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const ts = [...doc.querySelectorAll('template')];
    expect(ts.length).to.equal(2);
    for (const t of ts) {
      host.innerHTML = t.getAttribute('data-markup');
      const el = host.firstElementChild;
      new Function('el', t.getAttribute('data-setup'))(el);
      const got = t.hasAttribute('data-portal') ? el._menuElement : el.firstElementChild;
      expect(JSON.stringify(shape(got))).to.equal(JSON.stringify(shape(t.content.firstElementChild)));
      el.close();
    }
  });

  it('select-only combobox: roles, aria-controls → portaled listbox, non-focusable options, no Tailwind', () => {
    const el = dd('id="d1" value="hn"');
    const t = trig(el);
    expect(t.getAttribute('role')).to.equal('combobox');
    expect(t.getAttribute('aria-haspopup')).to.equal('listbox');
    expect(t.getAttribute('aria-expanded')).to.equal('false');
    const list = document.getElementById(t.getAttribute('aria-controls'));
    expect(same(list, el._menuElement.querySelector('[role="listbox"]'))).to.equal(true);
    expect(el._menuElement.parentNode === document.body).to.equal(true);
    expect(el._menuElement.hidden).to.equal(true);
    el.open();
    expect(t.getAttribute('aria-expanded')).to.equal('true');
    expect(el._menuElement.hidden).to.equal(false);
    expect(el._menuElement.getAttribute('data-state')).to.equal('open');
    const all = opts(el);
    expect(all.length).to.equal(5); // clear + 4
    all.forEach((o) => {
      expect(o.localName).to.equal('div');
      expect(o.hasAttribute('tabindex')).to.equal(false);
      expect(o.id).to.match(/^d1-opt-/);
    });
    expect(all[0].classList.contains('td-dropdown__option--clear')).to.equal(true);
    // no Tailwind / legacy classes anywhere
    const classes = [el, el._menuElement].flatMap((r) => [...r.querySelectorAll('[class]')].flatMap((n) => [...n.classList]));
    classes.forEach((c) => expect(/^(td-|sb-)/.test(c), c).to.equal(true));
    expect(el.querySelector('[style]')).to.equal(null);
  });

  it('menu = strong glass popover at the popover z layer, fixed, radius token', () => {
    const el = dd();
    el.open();
    const cs = getComputedStyle(el._menuElement);
    expect(cs.position).to.equal('fixed');
    expect(cs.zIndex).to.equal('450');
    expect(el._menuElement.classList.contains('td-glass-surface--strong')).to.equal(true);
    expect(cs.borderTopLeftRadius).to.equal('20px');
    expect(el._menuElement.getAttribute('data-placement')).to.equal('bottom');
  });

  it('closed menu is display:none via [hidden] (no Tailwind needed)', () => {
    const el = dd();
    expect(getComputedStyle(el._menuElement).display).to.equal('none');
  });
});

describe('batch 3 — td-dropdown keyboard (D17)', () => {
  it('ArrowDown on the trigger opens with the first option active; activedescendant on the trigger', async () => {
    const el = dd('searchable="false"');
    trig(el).focus();
    await sendKeys({ press: 'ArrowDown' });
    expect(el._isOpen).to.equal(true);
    const first = opts(el)[0];
    expect(first.hasAttribute('data-active')).to.equal(true);
    expect(trig(el).getAttribute('aria-activedescendant')).to.equal(first.id);
    await sendKeys({ press: 'ArrowDown' });
    expect(trig(el).getAttribute('aria-activedescendant')).to.equal(opts(el)[1].id);
    await sendKeys({ press: 'ArrowUp' });
    await sendKeys({ press: 'ArrowUp' }); // wraps to the last
    expect(trig(el).getAttribute('aria-activedescendant')).to.equal(opts(el)[3].id);
    await sendKeys({ press: 'Home' });
    expect(activeOpt(el).id).to.equal(opts(el)[0].id);
    await sendKeys({ press: 'End' });
    expect(activeOpt(el).id).to.equal(opts(el)[3].id);
    expect(same(document.activeElement, trig(el))).to.equal(true); // options never take focus
  });

  it('PageDown/PageUp move by max-height', async () => {
    const el = mount('<td-dropdown searchable="false" max-height="2"></td-dropdown>');
    el.options = Array.from({ length: 10 }, (_, i) => ({ value: String(i), label: `Mục ${i}` }));
    trig(el).focus();
    await sendKeys({ press: 'ArrowDown' });
    await sendKeys({ press: 'PageDown' });
    expect(activeOpt(el).getAttribute('data-index')).to.equal('2');
    await sendKeys({ press: 'PageUp' });
    expect(activeOpt(el).getAttribute('data-index')).to.equal('0');
  });

  it('Enter selects the active option: one change event, closed, focus on the trigger', async () => {
    const el = dd('searchable="false"');
    const events = [];
    el.addEventListener('change', (e) => events.push(e.detail.value));
    trig(el).focus();
    await sendKeys({ press: 'ArrowDown' });
    await sendKeys({ press: 'ArrowDown' });
    await sendKeys({ press: 'Enter' });
    expect(events).to.deep.equal(['sg']);
    expect(el._isOpen).to.equal(false);
    expect(trig(el).hasAttribute('aria-activedescendant')).to.equal(false);
    expect(same(document.activeElement, trig(el))).to.equal(true);
    expect(el.querySelector('.td-dropdown__value').textContent).to.equal('Sài Gòn');
  });

  it('Space opens (no double toggle) and selects the active option', async () => {
    const el = dd('searchable="false" value="dn"');
    const events = [];
    el.addEventListener('change', (e) => events.push(e.detail.value));
    trig(el).focus();
    await sendKeys({ press: 'Space' });
    expect(el._isOpen).to.equal(true);
    expect(activeOpt(el).getAttribute('data-value')).to.equal('dn'); // selected is active on open
    await sendKeys({ press: 'ArrowDown' });
    await sendKeys({ press: 'Space' });
    expect(el._isOpen).to.equal(false);
    expect(events).to.deep.equal(['hp']);
    // a mouse click still toggles afterwards
    trig(el).click();
    expect(el._isOpen).to.equal(true);
    el.close();
  });

  it('Enter on a closed trigger opens once (the native activation click is ignored)', async () => {
    const el = dd('searchable="false"');
    trig(el).focus();
    await sendKeys({ press: 'Enter' });
    expect(el._isOpen).to.equal(true);
    await sendKeys({ press: 'Enter' }); // selects the first (active) option
    expect(el._isOpen).to.equal(false);
    expect(el.getValue()).to.equal('hn');
  });

  it('clear option is reachable by arrows and clears with one change event', async () => {
    const el = dd('searchable="false" value="hn"');
    const events = [];
    el.addEventListener('change', (e) => events.push(e.detail.value));
    trig(el).focus();
    await sendKeys({ press: 'ArrowDown' }); // opens on the selected option
    expect(activeOpt(el).getAttribute('data-value')).to.equal('hn');
    await sendKeys({ press: 'ArrowUp' });
    expect(activeOpt(el).classList.contains('td-dropdown__option--clear')).to.equal(true);
    expect(trig(el).getAttribute('aria-activedescendant')).to.equal(activeOpt(el).id);
    await sendKeys({ press: 'Enter' });
    expect(events).to.deep.equal([null]);
    expect(el.getValue()).to.equal(null);
    expect(el.querySelector('.td-dropdown__value').hasAttribute('data-placeholder')).to.equal(true);
  });

  it('type-ahead on the trigger (diacritic-insensitive, cycles on repeat)', async () => {
    const el = dd('searchable="false"');
    trig(el).focus();
    await sendKeys({ press: 'h' });
    expect(el._isOpen).to.equal(true);
    expect(activeOpt(el).getAttribute('data-value')).to.equal('hn');
    await sendKeys({ press: 'h' });
    expect(activeOpt(el).getAttribute('data-value')).to.equal('hp');
    await wait(600);
    await sendKeys({ type: 'da' });
    expect(activeOpt(el).getAttribute('data-value')).to.equal('dn');
  });

  it('searchable: search autofocus (≥ 768 px) carries aria-activedescendant; Enter from search selects', async () => {
    const el = dd();
    const events = [];
    el.addEventListener('change', (e) => events.push(e.detail.value));
    trig(el).focus();
    await sendKeys({ press: 'ArrowDown' });
    await wait(150);
    const search = el._menuElement.querySelector('.td-dropdown__search');
    expect(same(document.activeElement, search)).to.equal(true);
    expect(search.getAttribute('aria-activedescendant')).to.equal(activeOpt(el).id);
    expect(trig(el).hasAttribute('aria-activedescendant')).to.equal(false);
    await sendKeys({ type: 'sài' });
    expect(opts(el).length).to.equal(1);
    expect(search.getAttribute('aria-activedescendant')).to.equal(opts(el)[0].id);
    await sendKeys({ press: 'Home' }); // caret, not the list
    expect(search.selectionStart).to.equal(0);
    await sendKeys({ press: 'Enter' });
    expect(events).to.deep.equal(['sg']);
    expect(same(document.activeElement, trig(el))).to.equal(true);
    expect(search.value).to.equal('');
  });

  it('no match → status message outside the listbox', async () => {
    const el = dd();
    el.open();
    await wait(150);
    await sendKeys({ type: 'zzz' });
    const empty = el._menuElement.querySelector('.td-dropdown__empty');
    expect(empty.getAttribute('role')).to.equal('status');
    expect(empty.textContent).to.equal('Không tìm thấy kết quả');
    expect(empty.closest('[role="listbox"]')).to.equal(null);
    el.close();
    expect(empty.textContent).to.equal('');
  });

  it('search autofocus is skipped below 768 px', async () => {
    await setViewport({ width: 500, height: 700 });
    try {
      const el = dd();
      trig(el).focus();
      await sendKeys({ press: 'ArrowDown' });
      await wait(150);
      expect(same(document.activeElement, trig(el))).to.equal(true);
      expect(trig(el).getAttribute('aria-activedescendant')).to.equal(activeOpt(el).id);
      el.close();
    } finally {
      await setViewport({ width: 800, height: 600 });
    }
  });

  it('mouse: hover sets the active option; a click selects once and keeps focus on the trigger', async () => {
    const el = dd('searchable="false"');
    const events = [];
    el.addEventListener('change', (e) => events.push(e.detail.value));
    trig(el).focus();
    el.open();
    const target = opts(el)[2];
    const r = target.getBoundingClientRect();
    await sendMouse({ type: 'move', position: [Math.round(r.left + 10), Math.round(r.top + r.height / 2)] });
    expect(target.hasAttribute('data-active')).to.equal(true);
    await sendMouse({ type: 'click', position: [Math.round(r.left + 10), Math.round(r.top + r.height / 2)] });
    expect(events).to.deep.equal(['dn']);
    expect(same(document.activeElement, trig(el))).to.equal(true);
  });

  it('pointerdown outside closes', async () => {
    const el = dd('searchable="false"');
    const outside = mount('<button type="button">ngoài</button>');
    el.open();
    const r = outside.getBoundingClientRect();
    await sendMouse({ type: 'click', position: [Math.round(r.left + 5), Math.round(r.top + 5)] });
    expect(el._isOpen).to.equal(false);
  });
});

describe('batch 3 — td-dropdown layers (Escape/Tab via register, D19)', () => {
  it('Escape closes only the menu (a lower boundary never sees it) and focuses the trigger', async () => {
    const below = mount('<div class="test-modal"><button type="button">x</button></div>', document.body);
    let lowerEscape = 0;
    const reg = register({ layer: LAYERS.lightbox, element: below, onEscape: () => { lowerEscape++; } });
    cleanup.push(() => reg.release());
    const el = dd();
    // lightbox lease inerts the host container — put the dropdown inside the lower layer's element
    below.appendChild(el);
    trig(el).focus();
    await sendKeys({ press: 'ArrowDown' });
    await wait(150);
    let docSaw = false;
    const onDoc = (e) => { if (e.key === 'Escape') docSaw = true; };
    document.addEventListener('keydown', onDoc);
    cleanup.push(() => document.removeEventListener('keydown', onDoc));
    await sendKeys({ press: 'Escape' });
    expect(el._isOpen).to.equal(false);
    expect(lowerEscape).to.equal(0);
    expect(docSaw).to.equal(false); // consumed
    expect(same(document.activeElement, trig(el))).to.equal(true);
    await sendKeys({ press: 'Escape' }); // menu gone → the lower layer gets it now
    expect(lowerEscape).to.equal(1);
  });

  it('inside a blocking modal registration the menu stays interactive (floating exemption)', async () => {
    const modal = mount('<div class="test-modal"><button type="button" id="m-first">Đầu</button></div>', document.body);
    const el = dd('searchable="false"', modal);
    const reg = register({ layer: LAYERS.modal, element: modal, blocking: true, onTab: (e) => trapTab(e, modal, LAYERS.modal) });
    cleanup.push(() => reg.release());
    await wait(0); // MutationObserver-free: the lease syncs synchronously
    expect(host.hasAttribute('inert')).to.equal(true);
    expect(el._menuElement.hasAttribute('inert')).to.equal(true); // closed menu: a plain body child
    el.open();
    expect(el._menuElement.hasAttribute('inert')).to.equal(false);
    const r = opts(el)[1].getBoundingClientRect();
    await sendMouse({ type: 'click', position: [Math.round(r.left + 10), Math.round(r.top + r.height / 2)] });
    expect(el.getValue()).to.equal('sg');
    expect(el._menuElement.hasAttribute('inert')).to.equal(true); // released on close
  });

  it('Tab from the search input over a modal returns to the trigger; the modal trap still wraps', async () => {
    const modal = mount('<div class="test-modal"><button type="button" id="m-first">Đầu</button></div>', document.body);
    const el = dd('', modal);
    const first = modal.querySelector('#m-first');
    const reg = register({ layer: LAYERS.modal, element: modal, blocking: true, onTab: (e) => trapTab(e, modal, LAYERS.modal) });
    cleanup.push(() => reg.release());
    trig(el).focus();
    await sendKeys({ press: 'ArrowDown' });
    await wait(150);
    expect(same(document.activeElement, el._menuElement.querySelector('.td-dropdown__search'))).to.equal(true);
    await sendKeys({ press: 'Tab' });
    expect(el._isOpen).to.equal(false);
    expect(same(document.activeElement, trig(el))).to.equal(true);
    expect(el.getValue()).to.equal(null); // never selects on Tab
    await sendKeys({ press: 'Tab' }); // trigger is the last focusable → trap wraps
    expect(same(document.activeElement, first)).to.equal(true);
  });

  it('Tab with focus on the trigger closes and passes the key to the modal trap', async () => {
    const modal = mount('<div class="test-modal"><button type="button" id="m-first">Đầu</button></div>', document.body);
    const el = dd('searchable="false"', modal);
    const first = modal.querySelector('#m-first');
    const reg = register({ layer: LAYERS.modal, element: modal, blocking: true, onTab: (e) => trapTab(e, modal, LAYERS.modal) });
    cleanup.push(() => reg.release());
    trig(el).focus();
    await sendKeys({ press: 'ArrowDown' });
    expect(el._isOpen).to.equal(true);
    await sendKeys({ press: 'Tab' });
    expect(el._isOpen).to.equal(false);
    expect(same(document.activeElement, first)).to.equal(true);
  });

  it('Tab on the trigger without a modal moves focus naturally', async () => {
    const el = dd('searchable="false"');
    const next = mount('<button type="button">sau</button>');
    trig(el).focus();
    await sendKeys({ press: 'ArrowDown' });
    await sendKeys({ press: 'Tab' });
    expect(el._isOpen).to.equal(false);
    expect(same(document.activeElement, next)).to.equal(true);
  });

  it('release on disconnect (no stale registration keeps eating Escape)', async () => {
    const el = dd('searchable="false"');
    el.open();
    el.remove();
    let saw = false;
    const onDoc = (e) => { if (e.key === 'Escape') saw = true; };
    document.addEventListener('keydown', onDoc);
    cleanup.push(() => document.removeEventListener('keydown', onDoc));
    await sendKeys({ press: 'Escape' });
    expect(saw).to.equal(true);
  });
});

describe('batch 3 — td-dropdown naming + error contract (D18)', () => {
  it('label attribute names the combobox (label[for]) and the listbox', () => {
    const el = dd('id="dl" label="Thành phố" required');
    const t = trig(el);
    expect(t.labels.length).to.equal(1);
    expect(t.labels[0].id).to.equal('dl-label');
    expect(t.hasAttribute('aria-label')).to.equal(false);
    expect(t.getAttribute('aria-required')).to.equal('true');
    expect(el.querySelector('.td-field__required')).to.not.equal(null);
    expect(el._menuElement.querySelector('[role="listbox"]').getAttribute('aria-labelledby')).to.equal('dl-label');
  });

  it('host aria-label → trigger aria-label (in place); external <label for=host> → aria-labelledby', () => {
    const el = dd('aria-label="Chọn tỉnh"');
    expect(trig(el).getAttribute('aria-label')).to.equal('Chọn tỉnh');
    const t = trig(el);
    el.setAttribute('aria-label', 'Tỉnh thành');
    expect(same(trig(el), t)).to.equal(true);
    expect(t.getAttribute('aria-label')).to.equal('Tỉnh thành');
    expect(el._menuElement.querySelector('[role="listbox"]').getAttribute('aria-label')).to.equal('Tỉnh thành');

    const wrap = mount('<div><label for="ext-dd">Quận</label><td-dropdown id="ext-dd"></td-dropdown></div>');
    const d2 = wrap.querySelector('td-dropdown');
    const lab = wrap.querySelector('label');
    expect(trig(d2).getAttribute('aria-labelledby')).to.equal(lab.id);
  });

  it('error-text attribute / setError / clearError / reset; survives a re-render', () => {
    const form = mount('<form><td-dropdown id="de" name="c" error-text="Bắt buộc"></td-dropdown></form>');
    const el = form.querySelector('td-dropdown');
    el.options = CITIES;
    const t = trig(el);
    expect(t.getAttribute('aria-invalid')).to.equal('true');
    expect(t.getAttribute('aria-errormessage')).to.equal('de-error');
    expect(t.getAttribute('aria-describedby')).to.equal('de-error');
    const note = el.querySelector('.td-field-error');
    expect(note.textContent).to.equal('Bắt buộc');
    expect(same(note.previousElementSibling, el.querySelector('.td-dropdown'))).to.equal(true);
    el.setError('Lỗi khác');
    expect(el.querySelector('.td-field-error').textContent).to.equal('Lỗi khác');
    el.setAttribute('label', 'Thành phố'); // re-render
    expect(el.querySelector('.td-field-error').textContent).to.equal('Lỗi khác');
    expect(trig(el).getAttribute('aria-invalid')).to.equal('true');
    el.clearError();
    expect(el.querySelector('.td-field-error')).to.equal(null);
    expect(trig(el).hasAttribute('aria-invalid')).to.equal(false);
    el.setError('Lại lỗi');
    form.reset();
    expect(el.querySelector('.td-field-error')).to.equal(null);
    expect(el.errorMessage).to.equal('');
  });

  it('in-place attribute changes keep focus on the trigger', () => {
    const el = dd('searchable="false"');
    const t = trig(el);
    t.focus();
    el.setAttribute('placeholder', 'Chọn đi');
    el.setAttribute('required', '');
    el.setAttribute('error-text', 'Sai');
    el.setAttribute('value', 'hp');
    el.setAttribute('disabled', '');
    el.removeAttribute('disabled');
    expect(same(trig(el), t)).to.equal(true);
    expect(t.getAttribute('aria-required')).to.equal('true');
    expect(el.querySelector('.td-dropdown__value').textContent).to.equal('Hải Phòng');
  });

  it('disabled: open() is a no-op; disabling while open closes; fieldset disabled in place', () => {
    const el = dd('searchable="false" disabled');
    el.open();
    expect(el._isOpen).to.equal(false);
    el.removeAttribute('disabled');
    el.open();
    el.setAttribute('disabled', '');
    expect(el._isOpen).to.equal(false);
    expect(trig(el).disabled).to.equal(true);
    const fs = mount('<fieldset><td-dropdown></td-dropdown></fieldset>');
    const d2 = fs.querySelector('td-dropdown');
    const t2 = trig(d2);
    fs.disabled = true;
    expect(d2._effectiveDisabled).to.equal(true);
    expect(same(trig(d2), t2)).to.equal(true);
    expect(t2.disabled).to.equal(true);
  });
});

describe('batch 3 — td-dropdown visuals', () => {
  it('keyboard focus shows the focus ring; placeholder + border meet contrast (light + dark)', async () => {
    const el = dd('searchable="false"');
    mount('<button type="button" id="before">b</button>');
    host.insertBefore(host.lastElementChild, el);
    host.querySelector('#before').focus();
    await sendKeys({ press: 'Tab' });
    expect(same(document.activeElement, trig(el))).to.equal(true);
    expect(getComputedStyle(trig(el)).boxShadow).to.not.equal('none');
    for (const theme of ['light', 'dark']) {
      if (theme === 'dark') document.documentElement.setAttribute('data-td-theme', 'dark');
      const idle = mount('<td-dropdown></td-dropdown>'); // fresh: no colour transition in flight
      const b = getComputedStyle(trig(idle));
      const ph = getComputedStyle(idle.querySelector('.td-dropdown__value'));
      expect(ratio(ph.color, b.backgroundColor), `${theme} placeholder`).to.be.at.least(4.5);
      expect(ratio(b.borderTopColor, b.backgroundColor), `${theme} border (soft)`).to.be.at.least(1.3);
      expect(ratio(tokenColor('--td-field-border-hover'), b.backgroundColor), `${theme} hover border`).to.be.at.least(1.8);
    }
  });

  it('reduced motion: menu fades without scale', async () => {
    await emulateMedia({ reducedMotion: 'reduce' });
    const el = dd();
    el.open();
    expect(getComputedStyle(el._menuElement).transitionProperty).to.equal('opacity');
    el.close();
  });
});

describe('batch 3 — td-dropdown 0.4.1 regressions (new DOM)', () => {
  function tall(n = 30) {
    const el = mount('<td-dropdown searchable="false" max-height="20"></td-dropdown>');
    el.options = Array.from({ length: n }, (_, i) => ({ value: String(i), label: `Mục ${i}` }));
    return el;
  }

  it('B5: never overlaps the trigger and fits inside the viewport', () => {
    const el = tall();
    host.style.paddingTop = `${Math.round(window.innerHeight / 2) - 20}px`;
    el.open();
    const btn = trig(el).getBoundingClientRect();
    const m = el._menuElement.getBoundingClientRect();
    expect(m.top < btn.bottom && m.bottom > btn.top).to.equal(false);
    expect(m.top).to.be.at.least(0);
    expect(m.bottom).to.be.at.most(window.innerHeight);
    el.close();
    host.style.paddingTop = '';
  });

  it('B5: closing with focus in the search input returns focus to the trigger', async () => {
    const el = dd();
    el.open();
    await wait(150);
    expect(same(document.activeElement, el._menuElement.querySelector('.td-dropdown__search'))).to.equal(true);
    el.close();
    expect(same(document.activeElement, trig(el))).to.equal(true);
  });

  it('B5: cancels the pending search-focus timer on close', async () => {
    const el = dd();
    el.open();
    el.close();
    await wait(150);
    expect(same(document.activeElement, el._menuElement.querySelector('.td-dropdown__search'))).to.equal(false);
  });

  it('B5: caps the menu width to the viewport', () => {
    const el = dd('searchable="false"');
    trig(el).style.width = `${window.innerWidth + 400}px`;
    el.open();
    const w = parseFloat(el._menuElement.style.width);
    const left = parseFloat(el._menuElement.style.left);
    expect(w).to.be.at.most(window.innerWidth);
    expect(left).to.be.at.least(0);
    expect(left + w).to.be.at.most(window.innerWidth);
    el.close();
  });

  it('batch2-review: works again after a DOM move (menu re-portaled, [hidden] toggles)', () => {
    const el = dd();
    el.open();
    const other = mount('<div></div>');
    other.appendChild(el);
    expect(!!el._menuElement && document.body.contains(el._menuElement)).to.equal(true);
    el.open();
    expect(el._menuElement.hidden).to.equal(false);
    el.close();
    expect(el._menuElement.hidden).to.equal(true);
  });

  it('close-others: opening one closes another', () => {
    const a = dd('searchable="false"');
    const b = dd('searchable="false"');
    a.open();
    b.open();
    expect(a._isOpen).to.equal(false);
    expect(b._isOpen).to.equal(true);
    b.close();
    expect(TdDropdown._openDropdowns.includes(a)).to.equal(true);
  });
});
