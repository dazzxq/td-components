// v0.44.0 (plan v0.44.0-confirm-dirty QĐ 20a) — CONTRACT: every td custom element that is form-associated
// (`formAssociated === true`, registered, exported from index.js) has a fixture here in which a REAL user action
// (click / sendKeys / file pick) changes its value and trackFormDirty() sees it (`isDirty() === true`), or an entry in
// EXEMPT with the reason. A new form-associated component whose change event the tracker does not observe turns this red.
// Plan M4 step 0 (re-run after v0.43 merged): td-media-gallery emits bubbling input + change (detail.reason add / remove /
// reorder / alt / crop) for every user change and none for value= / setSelection() — covered by the default events.
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
      el.querySelector('.td-dtp__trigger').click();
      await until(() => openModal() && openModal().querySelector('.td-dtp-wheel__list[data-part="hour"]'));
      openModal().querySelector('.td-dtp-wheel__list[data-part="hour"]').focus();
      await sendKeys({ press: 'ArrowDown' });
      footerBtn('Chọn').click();
      await until(() => !openModal());
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
  'td-table': {
    html: '<td-table name="x" selectable row-key="id"></td-table>',
    setup: (el) => { el.columns = [{ key: 'n', label: 'N' }]; el.data = [{ id: 1, n: 'A' }, { id: 2, n: 'B' }]; },
    act: async (el) => {
      await until(() => el.querySelector('.td-table__body .td-table__select'));
      el.querySelector('.td-table__body .td-table__select').click();
    },
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
});
