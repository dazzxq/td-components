import { expect } from '@esm-bundle/chai';
// DOM nodes are compared as booleans (`a === b`): chai serialising DOM nodes on failure hangs the runner.
import { TdMediaGallery } from './td-media-gallery.js';
import { TdMediaPicker } from '../feedback/td-media-picker.js';
import { createMockAdapter } from '../../test/fixtures/media-adapter.js';

// v0.43.0 Codex impl / security review round 1 (ISSUE-1, 2, 4, 5, 6, 7, 8) — regression tests, Chromium / Firefox /
// WebKit. Each test failed on the code before its fix.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const realOpen = TdMediaPicker.open;
let opens = [];
const stubOpen = (opts) => new Promise((resolve) => { opens.push({ opts, resolve }); });
const warns = [];
const realWarn = console.warn;
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 6; i++) await tick(); };
async function until(fn, ms = 4000, what = 'condition') {
  const t0 = performance.now();
  for (;;) {
    let v;
    try { v = fn(); } catch { v = false; }
    if (v) return v;
    if (performance.now() - t0 > ms) throw new Error(`timeout: ${what}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

const box = document.createElement('div');
box.style.width = '600px';
document.body.appendChild(box);
const J = (list) => JSON.stringify(list);
const three = J([{ id: 'm1', src: '/test/fixtures/1.svg', name: 'Ảnh 1' }, { id: 'm2', src: '/test/fixtures/2.svg', name: 'Ảnh 2' },
  { id: 'm3', src: '/test/fixtures/3.svg', name: 'Ảnh 3' }]);

function mk(attrs = {}, { adapter = null } = {}) {
  const form = document.createElement('form');
  const el = document.createElement('td-media-gallery');
  for (const [k, v] of Object.entries(attrs)) if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
  if (adapter) el.adapter = adapter;
  form.appendChild(el);
  box.appendChild(form);
  return { form, el };
}
const lis = (el) => [...el.querySelectorAll('.td-media-gallery__list > li')];
const fd = (form) => [...new FormData(form)].map(([k, v]) => [k, String(v)]);
const status = (el) => el.querySelector('.td-media-gallery__status').textContent;
const dialogRoots = () => [...document.body.querySelectorAll(':scope > .td-crop-dialog')];

beforeEach(() => {
  opens = [];
  warns.length = 0;
  TdMediaPicker.open = stubOpen;
  console.warn = (...a) => { warns.push(a.map(String).join(' ')); };
});
afterEach(async () => {
  TdMediaPicker.open = realOpen;
  console.warn = realWarn;
  box.replaceChildren();
  for (const b of document.body.querySelectorAll(':scope > .td-modal[data-state="open"] .td-modal__close')) b.click();
  await until(() => dialogRoots().length === 0, 4000, 'overlays gone');
});

describe('review round 1', () => {
  it('ISSUE-1: an update under an invalid name (ending in []) keeps the items; repairing the name shows + submits them', () => {
    const { el, form } = mk({ name: 'g[]', items: three });
    expect(fd(form)).to.deep.equal([]);
    el.value = ['m3', 'm1'];
    expect(el.value).to.deep.equal(['m3', 'm1']);
    el.setAttribute('name', 'g');
    expect(el.value).to.deep.equal(['m3', 'm1']);
    expect(lis(el).length).to.equal(2);
    expect(fd(form)).to.deep.equal([['g[]', 'm3'], ['g[]', 'm1']]);
  });

  it('ISSUE-2: an attribute change (full render) while the crop source is pending → aborted, the lock released', async () => {
    const man = createMockAdapter({ manual: true });
    const { el } = mk({ name: 'g', usage: true, croppable: true, items: three }, { adapter: man });
    lis(el)[0].querySelector('.td-media-gallery__crop-btn').click();
    expect(man.calls.get.length).to.equal(1);
    el.setAttribute('label', 'Đổi nhãn');
    expect(man.calls.get[0].signal.aborted).to.equal(true);
    man.calls.get[0].resolve();
    await settle();
    expect(dialogRoots().length).to.equal(0);
    el.querySelector('.td-media-gallery__add').click();
    expect(opens.length, 'the lock is free: the picker opens').to.equal(1);
  });

  it('ISSUE-2: an attribute change while the crop dialog is open → the dialog closes, the lock is released', async () => {
    const { el, form } = mk({ name: 'g', usage: true, croppable: true, items: three }, { adapter: createMockAdapter() });
    lis(el)[0].querySelector('.td-media-gallery__crop-btn').click();
    await until(() => dialogRoots().some((r) => r.getAttribute('data-state') === 'open'), 4000, 'dialog open');
    el.setAttribute('label', 'Ảnh mới'); // a structural attribute (v0.54.0: helper-text is now patched in place)
    await until(() => dialogRoots().length === 0, 4000, 'dialog closed');
    el.querySelector('.td-media-gallery__add').click();
    expect(opens.length).to.equal(1);
    expect(fd(form).filter(([k]) => k.endsWith('[crop]')).every(([, v]) => v === 'null')).to.equal(true);
  });

  it('ISSUE-4: an item with a name but no src is fetched once; resolved without a URL → never fetched again', async () => {
    const man = createMockAdapter({ manual: true });
    const { el } = mk({ name: 'g', items: J([{ id: 'm1', name: 'anh-1.jpg' }]) }, { adapter: man });
    expect(man.calls.get.length).to.equal(1);
    const a = JSON.parse(JSON.stringify(man.db.get('m1')));
    a.urls = {};
    man.calls.get[0].resolve(a);
    await settle();
    el.setAttribute('label', 'x'); // a full render pumps again
    await settle();
    expect(man.calls.get.length).to.equal(1);
  });

  it('ISSUE-5: Gỡ frees a lazy-get slot → the next missing preview starts (adapter ignoring the abort)', () => {
    const man = createMockAdapter({ manual: true });
    man.ignoreSignal = true;
    const { el } = mk({ name: 'g', items: J(['m1', 'm2', 'm3', 'm4', 'm5'].map((id) => ({ id }))) }, { adapter: man });
    expect(man.calls.get.map((r) => r.args[0])).to.deep.equal(['m1', 'm2', 'm3', 'm4']);
    lis(el)[0].querySelector('.td-media-gallery__remove').click();
    expect(man.calls.get.map((r) => r.args[0])).to.deep.equal(['m1', 'm2', 'm3', 'm4', 'm5']);
  });

  it('ISSUE-6: a failed lazy preview is announced (the safe user message, else "Không có ảnh xem trước")', async () => {
    const man = createMockAdapter({ manual: true });
    const { el } = mk({ name: 'g', items: J([{ id: 'm1' }, { id: 'm2' }]) }, { adapter: man });
    man.calls.get[0].reject(Object.assign(new Error('tok_1'), { code: 'forbidden', userMessage: 'Không có quyền xem ảnh' }));
    await until(() => status(el) === 'Không có quyền xem ảnh', 4000, 'userMessage');
    man.calls.get[1].reject(new Error('tok_2'));
    await until(() => status(el) === 'Không có ảnh xem trước', 4000, 'label');
    expect(warns.some((w) => w.includes('tok_'))).to.equal(false);
  });

  it('ISSUE-7: without a max attribute the count shows the effective max (100)', () => {
    const { el } = mk({ name: 'g', items: three });
    expect(el.querySelector('.td-media-gallery__count').textContent).to.equal('3/100 ảnh');
  });

  it('ISSUE-8: repeated full renders do not accumulate listeners / cleanups; tiles still work after them', () => {
    const { el, form } = mk({ name: 'g', usage: true, croppable: true, items: three });
    const n0 = el._cleanups.length;
    for (let i = 0; i < 20; i++) el.setAttribute('label', `Nhãn ${i}`);
    el.value = ['m1', 'm2', 'm3', 'm9'];
    expect(el._cleanups.length).to.equal(n0);
    let changes = 0;
    el.addEventListener('change', () => { changes++; });
    lis(el)[0].querySelector('.td-media-gallery__remove').click();
    expect(changes).to.equal(1);
    const alt = lis(el)[0].querySelector('.td-media-gallery__alt');
    alt.value = 'Hai';
    alt.dispatchEvent(new InputEvent('input', { bubbles: true }));
    expect(fd(form)[1]).to.deep.equal(['g[0][alt]', 'Hai']);
    el.querySelector('.td-media-gallery__add').click();
    expect(opens.length).to.equal(0); // no adapter: one warning, no duplicate handler side effects
    expect(warns.filter((w) => w.includes('no media adapter')).length).to.equal(1);
    expect(TdMediaGallery.MAX_ITEMS).to.equal(100);
  });
});
