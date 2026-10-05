// v0.44.0 (plan v0.44.0-confirm-dirty §C, QĐ 18-24, M4) — trackFormDirty() in Chromium, Firefox AND WebKit: snapshot
// semantics, td controls, td-table (select-change only), repeater, File identity, synchronous beforeunload arming, no
// fake dirty on hydrate / code assignments, reset, submit, confirmDiscard + modal / drawer guards.
// Waits are signals (events / state), never fixed sleeps. DOM nodes compared as booleans.
import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';
import { trackFormDirty } from './form-validation.js';
import { TdModal } from '../feedback/td-modal.js';
import { TdDrawer } from '../feedback/td-drawer.js';
import '../form/td-input-field.js';
import '../form/td-dropdown.js';
import '../form/td-toggle.js';
import '../form/td-chip-input.js';
import '../form/td-number-input.js';
import '../form/td-repeater.js';
import '../display/td-table.js';

const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const frames = (n = 2) => new Promise((r) => { const f = (k) => (k ? requestAnimationFrame(() => f(k - 1)) : r()); f(n); });
const until = async (fn, ms = 5000) => {
  const t0 = performance.now();
  while (!fn()) { if (performance.now() - t0 > ms) throw new Error('timeout'); await frames(1); }
};
const unload = () => {
  const e = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(e);
  return e.defaultPrevented;
};

const cleanups = [];
function mount(html, id = 'f') {
  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  document.body.appendChild(wrap);
  cleanups.push(() => wrap.remove());
  return /** @type {HTMLFormElement} */ (wrap.querySelector(`form#${id}`) || wrap.querySelector('form'));
}
function track(form, opts) {
  const t = trackFormDirty(form, opts);
  const log = [];
  form.addEventListener('dirty-change', (e) => log.push(/** @type {CustomEvent} */ (e).detail.dirty));
  cleanups.push(() => t.destroy());
  return { t, log };
}
async function typeIn(el, text) {
  el.focus();
  // caret at the end in every engine (WebKit may select the whole value on a scripted focus)
  try { if (typeof el.setSelectionRange === 'function') el.setSelectionRange(el.value.length, el.value.length); } catch { /* number */ }
  await sendKeys({ type: text });
}

afterEach(async () => {
  TdModal.closeAll();
  for (const d of document.querySelectorAll('td-drawer')) { if (d.open) d._releaseNow?.(); }
  cleanups.splice(0).reverse().forEach((f) => f());
  await frames(2);
});

const NATIVE = `<form id="f">
  <input name="_token" value="t">
  <input name="title" value="A">
  <textarea name="body">B</textarea>
  <select name="tags" multiple><option value="x" selected>x</option><option value="y">y</option></select>
  <input type="checkbox" name="pub" value="1">
  <input type="radio" name="kind" value="a" checked><input type="radio" name="kind" value="b">
  <input type="file" name="img">
  <input name="q" value="">
  <button type="submit" name="go" value="1">Lưu</button>
</form>
<input name="outside" form="f" value="o">`;

describe('trackFormDirty (v0.44.0) — snapshot semantics', () => {
  it('clean at first; typing → dirty-change true; typing back → false; ignore never dirties', async () => {
    const form = mount(NATIVE);
    const { t, log } = track(form, { ignore: ['_token', 'q'] });
    expect(t.isDirty()).to.equal(false);
    const title = form.elements.namedItem('title');
    title.select();
    await typeIn(title, 'Z');
    await until(() => log.length === 1);
    expect(log).to.deep.equal([true]);
    expect(t.isDirty()).to.equal(true);
    title.select();
    await sendKeys({ type: 'A' });
    await until(() => log.length === 2);
    expect(log).to.deep.equal([true, false]);
    await typeIn(form.elements.namedItem('q'), 'tìm');
    await frames(2);
    expect(t.isDirty()).to.equal(false);
    expect(log.length).to.equal(2);
  });

  it('checkbox / radio / select multiple / textarea / a form="f" control outside the form', async () => {
    const form = mount(NATIVE);
    const { t } = track(form);
    form.querySelector('[name="pub"]').click();
    expect(t.isDirty()).to.equal(true);
    form.querySelector('[name="pub"]').click();
    expect(t.isDirty()).to.equal(false);
    form.querySelector('[name="kind"][value="b"]').click();
    expect(t.isDirty()).to.equal(true);
    form.querySelector('[name="kind"][value="a"]').click();
    expect(t.isDirty()).to.equal(false);
    const outside = document.querySelector('input[name="outside"]');
    await typeIn(outside, '!');
    await until(() => t.isDirty());
    t.markClean();
    const sel = /** @type {HTMLSelectElement} */ (form.querySelector('select'));
    sel.options[1].selected = true;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    expect(t.isDirty()).to.equal(true);
  });

  it('values set from code never dirty; markDirty → dirty; markClean → clean with a new baseline', async () => {
    const form = mount(NATIVE);
    const { t, log } = track(form);
    form.elements.namedItem('title').value = 'code';
    expect(t.check()).to.equal(false);
    t.markDirty();
    expect(t.isDirty()).to.equal(true);
    expect(log).to.deep.equal([true]);
    t.markClean();
    expect(t.isDirty()).to.equal(false);
    expect(log).to.deep.equal([true, false]);
    await typeIn(form.elements.namedItem('body'), 'x');
    await until(() => t.isDirty());
    form.elements.namedItem('body').value = 'B'; // back to the default — but the baseline is 'code'/'B' after markClean
    expect(t.isDirty()).to.equal(false);
  });

  it('form.reset() after markClean with values ≠ defaults → dirty (reset = a change)', async () => {
    const form = mount(NATIVE);
    const { t, log } = track(form);
    form.elements.namedItem('title').value = 'Đã lưu';
    t.markClean();
    form.reset();
    await until(() => log.includes(true));
    expect(t.isDirty()).to.equal(true);
  });

  it('a second trackFormDirty on the same form returns the same tracker (+ warn when options are given)', () => {
    const form = mount(NATIVE);
    const { t } = track(form);
    const warn = console.warn;
    const warns = [];
    console.warn = (...a) => warns.push(a);
    try {
      expect(trackFormDirty(form) === t).to.equal(true);
      expect(warns.length).to.equal(0);
      expect(trackFormDirty(form, { ignore: ['x'] }) === t).to.equal(true);
      expect(warns.length).to.equal(1);
    } finally { console.warn = warn; }
    expect(() => trackFormDirty(document.createElement('div'))).to.throw(TypeError);
  });
});

describe('trackFormDirty — td controls', () => {
  it('td-input-field / td-number-input typing, td-toggle click, td-dropdown pick, td-chip-input add → dirty; back → clean', async () => {
    const form = mount(`<form id="f">
      <td-input-field name="name" label="Tên" value="An"></td-input-field>
      <td-number-input name="qty" label="SL" value="1"></td-number-input>
      <td-toggle name="on" label="Bật"></td-toggle>
      <td-dropdown name="city" label="TP"></td-dropdown>
      <td-chip-input name="tags" label="Thẻ" allow-create></td-chip-input></form>`);
    const dd = /** @type {any} */ (form.querySelector('td-dropdown'));
    dd.options = [{ value: 'hn', label: 'Hà Nội' }, { value: 'hcm', label: 'TP HCM' }];
    await frames(2);
    const { t } = track(form);
    const inner = form.querySelector('td-input-field input');
    await typeIn(inner, 'h');
    await until(() => t.isDirty());
    await sendKeys({ press: 'Backspace' });
    await until(() => !t.isDirty());

    await typeIn(form.querySelector('td-number-input input'), '2');
    await until(() => t.isDirty());
    await sendKeys({ press: 'Backspace' });
    await until(() => !t.isDirty());

    form.querySelector('td-toggle input').click();
    await until(() => t.isDirty());
    form.querySelector('td-toggle input').click();
    await until(() => !t.isDirty());

    form.querySelector('td-dropdown .td-dropdown__trigger').click();
    const opt = await (async () => { await until(() => document.querySelector(`#${dd.id}-listbox [data-value="hcm"]`)); return document.querySelector(`#${dd.id}-listbox [data-value="hcm"]`); })();
    opt.click();
    await until(() => t.isDirty());
    t.markClean();

    const chipInput = form.querySelector('td-chip-input input');
    await typeIn(chipInput, 'mới');
    await sendKeys({ press: 'Enter' });
    await until(() => t.isDirty());
  });

  it('td-table: a user tick → select-change → dirty; untick → clean; selectedKeys from code → not dirty', async () => {
    const form = mount('<form id="f"><td-table selectable row-key="id" name="ids"></td-table></form>');
    const table = /** @type {any} */ (form.querySelector('td-table'));
    table.columns = [{ key: 'name', label: 'Tên' }];
    table.data = [{ id: 1, name: 'An' }, { id: 2, name: 'Bình' }];
    await frames(2);
    const { t, log } = track(form);
    const box = () => form.querySelector('.td-table__body .td-table__select');
    box().click();
    await until(() => log.length === 1);
    expect(log).to.deep.equal([true]);
    expect(unload()).to.equal(true);
    box().click();
    await until(() => log.length === 2);
    expect(t.isDirty()).to.equal(false);
    t.markClean();
    table.selectedKeys = [2]; // select-change trigger 'api' (if any) never counts as a user change
    await frames(2);
    expect(new FormData(form).getAll('ids').length).to.equal(1);
    expect(t.check()).to.equal(false);
  });

  it('td-repeater: adding a row → dirty; removing it → clean', async () => {
    const form = mount(`<form id="f"><td-repeater label="Dòng"><template><div data-td-row><input name="items[]" value="x"></div></template>
      <div data-td-row><input name="items[]" value="a"></div></td-repeater></form>`);
    await frames(2);
    const { t } = track(form);
    form.querySelector('.td-repeater__add').click();
    await until(() => t.isDirty());
    const rows = form.querySelectorAll('.td-repeater__row');
    rows[rows.length - 1].querySelector('.td-repeater__btn--remove').click();
    await until(() => !t.isDirty());
  });

  it('a custom element defined AFTER trackFormDirty (hydrate) is no fake dirty — also after the user starts editing', async () => {
    const tag = `td-v044-late-${Math.random().toString(36).slice(2, 8)}`;
    const form = mount(`<form id="f"><input name="a" value="1"><${tag} name="late"></${tag}></form>`);
    const { t } = track(form);
    customElements.define(tag, class extends HTMLElement {
      static formAssociated = true;
      constructor() { super(); this.i = this.attachInternals(); }
      connectedCallback() { this.i.setFormValue('hydrated'); }
    });
    expect(new FormData(form).get('late')).to.equal('hydrated');
    expect(t.isDirty()).to.equal(false);
    const a = form.querySelector('input[name="a"]');
    await typeIn(a, '2');
    await until(() => t.isDirty());
    await sendKeys({ press: 'Backspace' });
    await until(() => !t.isDirty()); // the baseline was re-taken when the user reached the form
  });
});

describe('trackFormDirty — files (QĐ 19, identity)', () => {
  it('FormData keeps the File identity; a different file with the same metadata is a change', async () => {
    const form = mount(NATIVE);
    const input = /** @type {HTMLInputElement} */ (form.querySelector('input[type="file"]'));
    const pick = (file) => {
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const { t } = track(form);
    const a = new File(['aaaa'], 'a.png', { type: 'image/png', lastModified: 1000 });
    const b = new File(['bbbb'], 'a.png', { type: 'image/png', lastModified: 1000 });
    pick(a);
    expect(new FormData(form).get('img') === input.files[0]).to.equal(true); // the probe (plan M4)
    expect(t.isDirty()).to.equal(true);
    t.markClean();
    expect(t.isDirty()).to.equal(false);
    pick(b);
    expect(t.isDirty()).to.equal(true);
  });
});

describe('trackFormDirty — beforeunload (QĐ 23-24)', () => {
  it('no listener before an interaction; the first user event arms it in the SAME task; revert in the same task → not blocked; clean after a frame → disarmed', async () => {
    const added = [];
    const removed = [];
    const add = window.addEventListener;
    const rem = window.removeEventListener;
    window.addEventListener = function (type, ...r) { if (type === 'beforeunload') added.push(type); return add.call(this, type, ...r); };
    window.removeEventListener = function (type, ...r) { if (type === 'beforeunload') removed.push(type); return rem.call(this, type, ...r); };
    try {
      const form = mount(NATIVE);
      const { t } = track(form);
      expect(added.length).to.equal(0);
      const title = form.elements.namedItem('title');
      title.value = 'X';
      title.dispatchEvent(new Event('input', { bubbles: true }));
      expect(added.length).to.equal(1);
      expect(unload()).to.equal(true); // before any frame
      title.value = 'A';
      title.dispatchEvent(new Event('input', { bubbles: true }));
      expect(unload()).to.equal(false); // fresh computation
      await frames(2);
      expect(removed.length).to.equal(1);
      expect(t.isDirty()).to.equal(false);
    } finally {
      window.addEventListener = add;
      window.removeEventListener = rem;
    }
  });

  it('a removed form never blocks; destroy() removes everything; beforeUnload:false never arms', async () => {
    let form = mount(NATIVE);
    let { t } = track(form);
    t.markDirty();
    expect(unload()).to.equal(true);
    form.remove();
    expect(unload()).to.equal(false);
    t.destroy();
    form = mount(NATIVE, 'f');
    ({ t } = track(form, { beforeUnload: false }));
    t.markDirty();
    expect(t.isDirty()).to.equal(true);
    expect(unload()).to.equal(false);
  });

  it('a submit prevented by the app (or attach() on an invalid form) still blocks', async () => {
    const form = mount(NATIVE);
    const { t } = track(form);
    t.markDirty();
    form.addEventListener('submit', (e) => e.preventDefault());
    form.requestSubmit();
    expect(unload()).to.equal(true);
  });

  it('submit flag: an un-prevented submit event → not blocked until the next edit', async () => {
    const form = mount(NATIVE);
    const { t } = track(form);
    t.markDirty();
    // Firefox submits a form on a synthetic submit event: send it into a sink iframe so the test page stays
    const sink = document.createElement('iframe');
    sink.name = 'td-v044-sink';
    sink.hidden = true;
    document.body.appendChild(sink);
    cleanups.push(() => sink.remove());
    form.target = sink.name;
    form.action = 'about:blank';
    form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
    expect(unload()).to.equal(false);
    const title = form.elements.namedItem('title');
    title.dispatchEvent(new Event('input', { bubbles: true }));
    expect(unload()).to.equal(true);
  });
});

describe('trackFormDirty — confirmDiscard + guards (QĐ 21-22, QĐ 14)', () => {
  it('opts.confirm: clean → true without asking; dirty → asked, its answer returned', async () => {
    const form = mount(NATIVE);
    const { t } = track(form);
    let asked = 0;
    expect(await t.confirmDiscard({ confirm: () => { asked++; return true; } })).to.equal(true);
    expect(asked).to.equal(0);
    t.markDirty();
    expect(await t.confirmDiscard({ confirm: (o) => { asked++; return o.confirmVariant === 'danger' && o.themeRoot === form ? false : true; } })).to.equal(false);
    expect(asked).to.equal(1);
    expect(await t.confirmDiscard({ confirm: async () => true })).to.equal(true);
    expect(t.isDirty()).to.equal(true); // confirmDiscard never marks clean
  });

  it('default dialog: lazy TdModal danger confirm with the discard labels; "Ở lại" → false', async () => {
    const form = mount(NATIVE);
    const { t } = track(form);
    t.markDirty();
    const p = t.confirmDiscard();
    await until(() => document.querySelector('.td-modal [role="alertdialog"]'));
    const root = [...document.querySelectorAll('.td-modal')].pop();
    expect(root.querySelector('.td-modal__title').textContent).to.equal('Thay đổi chưa lưu');
    const [stay, discard] = root.querySelectorAll('.td-modal__footer button');
    expect(stay.textContent).to.equal('Ở lại');
    expect(discard.textContent).to.equal('Bỏ thay đổi');
    expect(discard.classList.contains('td-btn--danger')).to.equal(true);
    stay.click();
    expect(await p).to.equal(false);
  });

  it('modal beforeClose = confirmDiscard: X on a dirty table form asks; Lưu + markClean closes without asking; forgetting markClean asks (by design)', async () => {
    const form = document.createElement('form');
    form.innerHTML = '<td-table selectable row-key="id" name="ids"></td-table>';
    const table = /** @type {any} */ (form.querySelector('td-table'));
    const { t } = track(form);
    let asked = 0;
    const discard = () => t.confirmDiscard({ confirm: () => { asked++; return false; } });
    const id = TdModal.show({ title: 'Sửa', size: 'xl', body: form, beforeClose: discard, actions: [
      { label: 'Lưu', variant: 'primary', value: 'save', onClick: () => { t.markClean(); } },
    ] });
    table.columns = [{ key: 'name', label: 'Tên' }];
    table.data = [{ id: 1, name: 'An' }];
    await until(() => form.querySelector('.td-table__select:not(.td-table__select-all)'));
    form.querySelector('.td-table__select:not(.td-table__select-all)').click();
    await until(() => t.isDirty());
    const root = document.getElementById(id);
    root.querySelector('.td-modal__close').click();
    await until(() => asked === 1);
    await TdModal.requestClose(id); // the X's pending guard has settled (same Promise) — refused again, still open
    expect(asked).to.equal(1);
    expect(root.getAttribute('data-state')).to.not.equal('closing');
    root.querySelector('.td-modal__footer button').click(); // Lưu → markClean → the guard lets it close
    await until(() => !document.getElementById(id) || document.getElementById(id).getAttribute('data-state') === 'closing');
    expect(asked).to.equal(1);

    const form2 = document.createElement('form');
    form2.innerHTML = '<input name="a">';
    const { t: t2 } = track(form2);
    let asked2 = 0;
    const id2 = TdModal.show({ title: 'Sửa', body: form2, beforeClose: () => t2.confirmDiscard({ confirm: () => { asked2++; return false; } }),
      actions: [{ label: 'Lưu', value: 'save' }] }); // forgets markClean
    t2.markDirty();
    document.getElementById(id2).querySelector('.td-modal__footer button').click();
    await until(() => asked2 === 1);
    expect(document.getElementById(id2).getAttribute('data-state')).to.not.equal('closing');
  });

  it('drawer beforeClose = confirmDiscard: Escape on a dirty form asks and stays', async () => {
    const form = document.createElement('form');
    form.innerHTML = '<input name="a">';
    const { t } = track(form);
    let asked = 0;
    const h = TdDrawer.open({ title: 'Sửa', body: form, beforeClose: () => t.confirmDiscard({ confirm: () => { asked++; return false; } }) });
    await until(() => document.querySelector('.td-drawer-root[data-state="open"]'));
    await typeIn(form.querySelector('input'), 'x');
    await until(() => t.isDirty());
    await sendKeys({ press: 'Escape' });
    await until(() => asked === 1);
    expect(h.element.open).to.equal(true);
    t.markClean();
    await sendKeys({ press: 'Escape' });
    expect(await h.closed).to.equal('escape');
  });

  it('isDirty() of a 500-field form costs about one FormData read (relative, no wall-clock budget)', () => {
    const form = mount(`<form id="f">${Array.from({ length: 500 }, (_, i) => `<input name="n${i}" value="${i}">`).join('')}</form>`);
    const { t } = track(form);
    form.querySelector('input').dispatchEvent(new Event('input', { bubbles: true }));
    const median = (fn) => {
      const times = [];
      for (let i = 0; i < 15; i++) { const t0 = performance.now(); fn(); times.push(performance.now() - t0); }
      return times.sort((x, y) => x - y)[7];
    };
    const base = median(() => [...new FormData(form)]);
    const dirty = median(() => t.isDirty());
    // a snapshot + an ordered compare: a small multiple of the FormData read itself, whatever the machine load
    expect(dirty).to.be.below(Math.max(base * 6, 1));
  });
});
