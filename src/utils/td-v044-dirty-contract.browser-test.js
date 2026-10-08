// v0.44.0 (plan v0.44.0-confirm-dirty QĐ 20a) — CONTRACT: every td custom element that is form-associated
// (`formAssociated === true`, registered, exported from index.js) has a fixture here in which a REAL user action
// (click / sendKeys / file pick) changes its value and trackFormDirty() sees it (`isDirty() === true`), or an entry in
// EXEMPT with the reason. A new form-associated component whose change event the tracker does not observe turns this red.
// Plan M4 step 0 (re-run after v0.43 merged): td-media-gallery emits bubbling input + change (detail.reason add / remove /
// reorder / alt / crop — v0.51.0: + caption) for every user change and none for value= / setSelection() — covered by the
// default events (the tracker listens in capture on `document` and compares FormData; nothing to change in it).
import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';
import * as kit from '../../index.js';

const { trackFormDirty } = kit;
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
const openModal = () => [...document.querySelectorAll('.td-modal')].find((m) => m.getAttribute('data-state') !== 'closing') || null;
const footerBtn = (label) => [...openModal().querySelectorAll('.td-modal__footer .td-btn')].find((b) => b.textContent.trim() === label);
async function typeIn(el, text) {
  el.focus();
  try { el.setSelectionRange(el.value.length, el.value.length); } catch { /* ignore */ }
  await sendKeys({ type: text });
}

/** tag → user action on a mounted element inside <form> (resolves once the action is done). */
const FIXTURES = {
  'td-input-field': { html: '<td-input-field name="x" label="X" value="a"></td-input-field>', act: (el) => typeIn(el.querySelector('input'), 'b') },
  'td-number-input': { html: '<td-number-input name="x" label="X" value="1"></td-number-input>', act: (el) => typeIn(el.querySelector('input'), '2') },
  'td-media-field': { html: '<td-media-field name="x" label="X" usage value="7" preview-src="/x.png"></td-media-field>', act: (el) => typeIn(el.querySelector('input.td-field__control, input[type="text"]'), 'alt') },
  'td-checkbox': { html: '<td-checkbox name="x" value="1" label="X"></td-checkbox>', act: (el) => el.querySelector('input').click() },
  'td-toggle': { html: '<td-toggle name="x" label="X"></td-toggle>', act: (el) => el.querySelector('input').click() },
  'td-slider': { html: '<td-slider name="x" label="X" min="0" max="10" value="5"></td-slider>', act: async (el) => { el.querySelector('input').focus(); await sendKeys({ press: 'ArrowRight' }); } },
  'td-otp-input': { html: '<td-otp-input name="x" label="X" length="4"></td-otp-input>', act: (el) => typeIn(el.querySelector('input'), '12') },
  'td-scan-input': { html: '<td-scan-input name="x" label="X" key-interval="100"></td-scan-input>', act: async (el) => { await typeIn(el.querySelector('input'), 'AB12'); await sendKeys({ press: 'Enter' }); } },
  'td-dropdown': {
    html: '<td-dropdown name="x" label="X"></td-dropdown>',
    setup: (el) => { el.options = [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]; },
    act: async (el) => {
      el.querySelector('.td-dropdown__trigger').click();
      await until(() => document.querySelector(`#${el.id}-listbox [data-value="b"]`));
      document.querySelector(`#${el.id}-listbox [data-value="b"]`).click();
    },
  },
  'td-chip-input': { html: '<td-chip-input name="x" label="X" allow-create></td-chip-input>', act: async (el) => { await typeIn(el.querySelector('input'), 'mới'); await sendKeys({ press: 'Enter' }); } },
  'td-tree': {
    html: '<td-tree name="x" label="X" selection="single"></td-tree>',
    setup: (el) => { el.data = [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]; },
    act: async (el) => { await until(() => el.querySelectorAll('[role="treeitem"]').length === 2); el.querySelectorAll('[role="treeitem"] .td-tree__row')[1].click(); },
  },
  'td-tree-select': {
    html: '<td-tree-select name="x" label="X" searchable="false"></td-tree-select>',
    setup: (el) => { el.data = [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]; },
    act: async (el) => {
      el.querySelector('.td-tree-select__trigger').click();
      const item = () => [...document.querySelectorAll('[role="treeitem"]')].find((n) => n.textContent.trim() === 'B' && !el.contains(n));
      await until(() => item());
      item().querySelector('.td-tree__row').click();
    },
  },
  'td-datetime-picker': {
    html: '<td-datetime-picker name="x" label="X" value="15/06/2026 - 10:30"></td-datetime-picker>',
    act: async (el) => {
      // v0.60.0: the calendar popover (800 px viewport): hour wheel → "Chọn" in its own action row
      const pop = () => [...document.querySelectorAll('.td-dtp-pop')].find((p) => !p.closest('.td-modal[data-state="closing"]'));
      el.querySelector('.td-dtp__trigger').click();
      await until(() => pop() && pop().querySelector('.td-dtp-wheel__list[data-part="hour"]'));
      pop().querySelector('.td-dtp-wheel__list[data-part="hour"]').focus();
      await sendKeys({ press: 'ArrowDown' });
      pop().querySelector('[data-action="confirm"]').click();
      await until(() => !pop());
    },
  },
  'td-datetime-range': {
    html: '<td-datetime-range name="x" label="X"></td-datetime-range>',
    act: async (el) => {
      el.querySelector('.td-dtr__trigger').click();
      await until(() => openModal() && openModal().querySelector('.td-dtr-panel__preset[data-id="today"]'));
      openModal().querySelector('.td-dtr-panel__preset[data-id="today"]').click();
      footerBtn('Chọn').click();
      await until(() => !openModal());
    },
  },
  'td-dropzone': {
    html: '<td-dropzone name="x" label="X"></td-dropzone>',
    act: (el) => {
      const input = /** @type {HTMLInputElement} */ (el.querySelector('input[type="file"]'));
      const dt = new DataTransfer();
      dt.items.add(new File(['x'], 'a.txt', { type: 'text/plain' }));
      input.files = dt.files; // what the file chooser does, then `change`
      input.dispatchEvent(new Event('change', { bubbles: true }));
    },
  },
  'td-media-gallery': {
    html: `<td-media-gallery name="x" label="X" usage items='${JSON.stringify([{ id: 'm1', src: '/test/fixtures/1.svg', name: 'Ảnh 1' }, { id: 'm2', src: '/test/fixtures/2.svg', name: 'Ảnh 2' }])}'></td-media-gallery>`,
    act: (el) => el.querySelectorAll('.td-media-gallery__list > li .td-media-gallery__remove')[1].click(),
  },
  // v0.47.0: td-check-matrix — a user tick fires a bubbling `change` (detail.trigger) on the host (+ the native input /
  // change of the inner checkbox, seen in capture); value= / setValue() / setData() fire nothing (test below).
  'td-check-matrix': {
    html: '<td-check-matrix name="x" label="X"></td-check-matrix>',
    setup: (el) => el.setData({ columns: [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }], rows: [{ key: 'r1', label: 'R1' }, { key: 'r2', label: 'R2' }], value: { a: ['r1'] } }),
    act: async (el) => {
      await until(() => el.querySelector('tr[data-r="1"] .td-check-matrix__cell input'));
      el.querySelector('tr[data-r="1"] .td-check-matrix__cell input').click();
    },
  },
  // v0.48.0: td-color-picker — typing a colour fires the host `input` { value } (native input / change of the inner text
  // field stop at the host); value= / setValue() fire nothing (test below); a preset pick is covered below too.
  'td-color-picker': {
    html: '<td-color-picker name="x" label="X" value="#1d4ed8"></td-color-picker>',
    act: async (el) => {
      const input = el.querySelector('input.td-color__input');
      input.focus();
      input.select();
      await sendKeys({ type: '#ff0000' });
    },
  },
  'td-table': {
    html: '<td-table name="x" selectable row-key="id"></td-table>',
    setup: (el) => { el.columns = [{ key: 'n', label: 'N' }]; el.data = [{ id: 1, n: 'A' }, { id: 2, n: 'B' }]; },
    act: async (el) => {
      await until(() => el.querySelector('.td-table__body .td-table__select'));
      el.querySelector('.td-table__body .td-table__select').click();
    },
  },
  // v0.49.0: td-choice-group — a click on an option (native radio in a private group, ADR 0023) → the host's input + change
  'td-choice-group': {
    html: '<td-choice-group name="x" label="X" value="a"></td-choice-group>',
    setup: (el) => { el.options = [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]; },
    act: (el) => el.querySelectorAll('input.td-choice__input')[1].click(),
  },
};

/** form-associated elements that need no fixture (reason required). */
const EXEMPT = {};

/** every registered, form-associated custom element exported by index.js */
function inventory() {
  const tags = [];
  for (const v of Object.values(kit)) {
    if (typeof v !== 'function' || v.formAssociated !== true) continue;
    const tag = customElements.getName ? customElements.getName(v) : null;
    if (tag) tags.push(tag);
  }
  return [...new Set(tags)].sort();
}

afterEach(async () => {
  kit.TdModal.closeAll();
  document.querySelectorAll('form.v044-contract').forEach((f) => f.remove());
  await frames(2);
});

describe('trackFormDirty contract — every form-associated td element (v0.44.0 QĐ 20a)', () => {
  it('inventory: each form-associated element has a fixture or an exemption (and no stale entry)', () => {
    const tags = inventory();
    expect(tags.length).to.be.at.least(17);
    const missing = tags.filter((t) => !FIXTURES[t] && !EXEMPT[t]);
    expect(missing, 'form-associated without a dirty fixture').to.deep.equal([]);
    const stale = [...Object.keys(FIXTURES), ...Object.keys(EXEMPT)].filter((t) => !tags.includes(t));
    expect(stale, 'fixtures for elements that are not form-associated').to.deep.equal([]);
  });

  for (const [tag, fx] of Object.entries(FIXTURES)) {
    it(`${tag}: a user change → isDirty() === true (and dirty-change)`, async () => {
      const form = document.createElement('form');
      form.className = 'v044-contract';
      form.innerHTML = fx.html;
      document.body.appendChild(form);
      const el = /** @type {any} */ (form.firstElementChild);
      if (fx.setup) fx.setup(el);
      await frames(3);
      const before = JSON.stringify([...new FormData(form)].map(([k, v]) => [k, typeof v === 'string' ? v : v.name]));
      const tracker = trackFormDirty(form);
      let flipped = false;
      form.addEventListener('dirty-change', (e) => { if (/** @type {CustomEvent} */ (e).detail.dirty) flipped = true; });
      try {
        expect(tracker.isDirty()).to.equal(false);
        await fx.act(el);
        await until(() => flipped, 4000).catch(() => {});
        const after = JSON.stringify([...new FormData(form)].map(([k, v]) => [k, typeof v === 'string' ? v : v.name]));
        expect(after, 'the action changed FormData').to.not.equal(before);
        expect(tracker.isDirty()).to.equal(true);
        expect(flipped).to.equal(true);
      } finally { tracker.destroy(); }
    });
  }

  it('td-color-picker: a preset picked in the popup → dirty; value= / setValue() from code → NOT dirty', async () => {
    const mount = () => {
      const form = document.createElement('form');
      form.className = 'v044-contract';
      form.innerHTML = FIXTURES['td-color-picker'].html;
      document.body.appendChild(form);
      return { form, el: /** @type {any} */ (form.firstElementChild) };
    };
    const a = mount();
    await frames(3);
    let tracker = trackFormDirty(a.form);
    try {
      a.el.querySelector('.td-color__trigger').click();
      document.querySelector('body > .td-color-panel .td-color-panel__preset[data-value="#ef4444"]').click();
      expect(a.el.value).to.equal('#ef4444');
      await until(() => tracker.isDirty(), 4000).catch(() => {});
      expect(tracker.isDirty()).to.equal(true);
    } finally { tracker.destroy(); }
    const b = mount();
    await frames(3);
    tracker = trackFormDirty(b.form);
    try {
      const before = JSON.stringify([...new FormData(b.form)]);
      b.el.value = '#00ff00';
      b.el.setValue('#123456');
      await frames(3);
      expect(JSON.stringify([...new FormData(b.form)])).to.not.equal(before, 'the code did change FormData');
      expect(tracker.isDirty()).to.equal(false);
    } finally { tracker.destroy(); }
  });

  // v0.51.0 (plan v0.51.0-gallery-caption QĐ 6, M3): a typed caption (line AND multiline) makes the form dirty, typing
  // it back clean; value= / setSelection() carrying captions from code never does.
  for (const mode of ['line', 'multiline']) {
    it(`td-media-gallery caption (${mode}): typing → dirty, back to the original → clean, from code → not dirty`, async () => {
      const form = document.createElement('form');
      form.className = 'v044-contract';
      form.innerHTML = `<td-media-gallery name="x" label="X" usage caption="${mode}" items='${JSON.stringify([{ id: 'm1', caption: 'ab' }, { id: 'm2' }])}'></td-media-gallery>`;
      document.body.appendChild(form);
      const el = /** @type {any} */ (form.firstElementChild);
      await frames(3);
      const tracker = trackFormDirty(form);
      try {
        const ctl = el.querySelector('.td-media-gallery__caption');
        await typeIn(ctl, 'c');
        await frames(3);
        expect(tracker.isDirty()).to.equal(true);
        expect([...new FormData(form)].find(([k]) => k === 'x[0][caption]')[1]).to.equal('abc');
        ctl.focus();
        await sendKeys({ press: 'Backspace' });
        await frames(3);
        expect(tracker.isDirty()).to.equal(false, 'typed back to the original');
        tracker.markClean();
        el.setSelection([{ assetId: 'm1', asset: null, usage: { altText: '', caption: 'từ code' } }]);
        el.value = ['m1'];
        await frames(3);
        expect([...new FormData(form)].find(([k]) => k === 'x[0][caption]')[1]).to.equal('từ code');
        expect(tracker.isDirty()).to.equal(false);
      } finally { tracker.destroy(); form.remove(); }
    });
  }

  it('td-check-matrix: value= / setValue() from code is NOT a user change → isDirty() === false', async () => {
    const form = document.createElement('form');
    form.className = 'v044-contract';
    form.innerHTML = FIXTURES['td-check-matrix'].html;
    document.body.appendChild(form);
    const el = /** @type {any} */ (form.firstElementChild);
    FIXTURES['td-check-matrix'].setup(el);
    await frames(3);
    const tracker = trackFormDirty(form);
    try {
      const before = JSON.stringify([...new FormData(form)]);
      el.value = { b: ['r1', 'r2'] };
      el.setValue({ a: ['r2'], b: ['r1'] });
      await frames(3);
      expect(JSON.stringify([...new FormData(form)])).to.not.equal(before, 'the code did change FormData');
      expect(tracker.isDirty()).to.equal(false);
    } finally { tracker.destroy(); }
  });
});
