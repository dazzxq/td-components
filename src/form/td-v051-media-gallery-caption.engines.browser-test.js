import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';
// DOM nodes are compared as booleans (`a === b`): chai serialising DOM nodes on failure hangs the runner.
import { TdMediaGallery } from './td-media-gallery.js';
import { TdMediaPicker } from '../feedback/td-media-picker.js';
import { createMockAdapter } from '../../test/fixtures/media-adapter.js';
import { encodeGalleryState } from '../utils/media-field-model.js';

// v0.51.0 (plan docs/internal/plans/v0.51.0-gallery-caption.md M3 + M4, QĐ 1-17) — the per-item caption (line /
// multiline) and the soft length limits of <td-media-gallery>, in Chromium, Firefox and WebKit (group `engines`):
// render + FormData, events (reason 'caption'), API (value / setSelection / selection / picker), reset / restore (the
// state bytes with the feature off / on, a cleared caption never comes back), runtime mode switches (the raw caption
// keeps its newlines), XSS; counter from 80 %, limit / over, inline error + aria, customError, never cut, runtime
// enable / disable of the limits, live-region announcements.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const realOpen = TdMediaPicker.open;
let opens = [];
const stubOpen = (opts) => new Promise((resolve, reject) => { opens.push({ opts, resolve, reject }); });
const warns = [];
const realWarn = console.warn;
const ad = createMockAdapter();
const tick = () => new Promise((r) => setTimeout(r, 0));
const frames = (n = 2) => new Promise((r) => { const f = (k) => (k ? requestAnimationFrame(() => f(k - 1)) : r()); f(n); });
const until = async (fn, ms = 5000) => {
  const t0 = performance.now();
  while (!fn()) { if (performance.now() - t0 > ms) throw new Error('timeout'); await frames(1); }
};

const box = document.createElement('div');
box.style.width = '640px'; // test page only
document.body.appendChild(box);

const J = (list) => JSON.stringify(list);
const ITEMS = J([
  { id: 'm1', src: '/test/fixtures/1.svg', name: 'Ảnh 1', alt: 'Một', caption: 'Dòng 1\nDòng 2' },
  { id: 'm2', src: '/test/fixtures/2.svg', name: 'Ảnh 2' },
]);

let seq = 0;
function mk(attrs = {}, { adapter = ad } = {}) {
  const form = document.createElement('form');
  const el = document.createElement('td-media-gallery');
  el.id = `cg${seq += 1}`;
  for (const [k, v] of Object.entries(attrs)) if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
  if (adapter) el.adapter = adapter;
  form.appendChild(el);
  box.appendChild(form);
  const c = { input: 0, change: 0, details: [], native: 0 };
  el.addEventListener('input', (e) => { c.input++; c.details.push(e.detail); });
  el.addEventListener('change', (e) => { c.change++; c.details.push(e.detail); });
  form.addEventListener('input', (e) => { if (e.target !== el) c.native++; });
  form.addEventListener('change', (e) => { if (e.target !== el) c.native++; });
  return { form, el, c };
}
const q = (el, s) => el.querySelector(s);
const qa = (el, s) => [...el.querySelectorAll(s)];
const lis = (el) => qa(el, '.td-media-gallery__list > li');
const cap = (li) => li.querySelector('.td-media-gallery__caption');
const alt = (li) => li.querySelector('.td-media-gallery__alt');
const part = (li, f, k) => li.querySelector(`.td-media-gallery__${f}-field ~ .td-media-gallery__${k}[id$="-${f}-${k === 'counter' ? 'count' : 'error'}"]`);
const fd = (form) => [...new FormData(form)].map(([k, v]) => [k, String(v)]);
const status = (el) => q(el, '.td-media-gallery__status').textContent;
async function typeIn(ctl, text) {
  ctl.focus();
  try { ctl.setSelectionRange(ctl.value.length, ctl.value.length); } catch { /* ignore */ }
  await sendKeys({ type: text });
}
async function clear(ctl) {
  ctl.focus();
  ctl.select();
  await sendKeys({ press: 'Backspace' });
}
/** the restore states the gallery hands to ElementInternals */
function spyState(el) {
  const s = { last: undefined };
  const i = el._internals;
  const orig = i.setFormValue.bind(i);
  i.setFormValue = (v, st) => { s.last = st; orig(v, st); };
  return s;
}

const realDelay = TdMediaGallery.LIMIT_ANNOUNCE_DELAY;
const PERF_SLACK = 20; // ×20 under load (TD_PERF_STRICT is a node-side switch)
beforeEach(() => {
  opens = [];
  warns.length = 0;
  TdMediaPicker.open = stubOpen;
  TdMediaGallery.LIMIT_ANNOUNCE_DELAY = 40;
  console.warn = (...a) => { warns.push(a.map(String).join(' ')); };
});
afterEach(() => {
  TdMediaPicker.open = realOpen;
  TdMediaGallery.LIMIT_ANNOUNCE_DELAY = realDelay;
  console.warn = realWarn;
  box.replaceChildren();
});

describe('td-media-gallery caption — render + FormData (QĐ 1-4)', () => {
  it('line: input after the alt label, projected value, [caption] right after [alt]', () => {
    const { el, form } = mk({ name: 'g', usage: true, caption: true, items: ITEMS });
    const li = lis(el)[0];
    const c = cap(li);
    expect(c.localName).to.equal('input');
    expect(c.type).to.equal('text');
    expect(c.className).to.equal('td-field__control td-media-gallery__caption');
    expect(c.maxLength).to.equal(1000);
    expect(c.placeholder).to.equal('Chú thích');
    expect(c.value).to.equal('Dòng 1 Dòng 2');
    expect(c.closest('label').className).to.equal('td-media-gallery__caption-field');
    expect(c.closest('label').previousElementSibling.className).to.equal('td-media-gallery__alt-field');
    expect(q(c.closest('label'), '.td-sr-only').textContent).to.equal('Chú thích ảnh 1');
    expect(fd(form)).to.deep.equal([
      ['g[0][id]', 'm1'], ['g[0][alt]', 'Một'], ['g[0][caption]', 'Dòng 1 Dòng 2'], ['g[0][crop]', 'null'],
      ['g[1][id]', 'm2'], ['g[1][alt]', ''], ['g[1][caption]', ''], ['g[1][crop]', 'null']]);
    expect(el.selection[0].usage.caption).to.equal('Dòng 1 Dòng 2');
    expect(warns).to.deep.equal([]);
    for (const v of ['', 'line']) {
      const r = mk({ name: 'g', usage: true, caption: v, items: ITEMS });
      expect(cap(lis(r.el)[0]).localName).to.equal('input');
    }
  });

  it('multiline: textarea rows=2, the raw newlines; reference / off → no caption anywhere', () => {
    const { el, form } = mk({ name: 'g', usage: true, caption: 'multiline', items: ITEMS });
    const c = cap(lis(el)[0]);
    expect(c.localName).to.equal('textarea');
    expect(c.rows).to.equal(2);
    expect(c.maxLength).to.equal(1000);
    expect(c.value).to.equal('Dòng 1\nDòng 2');
    expect(fd(form)[2]).to.deep.equal(['g[0][caption]', 'Dòng 1\nDòng 2']);
    const off = mk({ name: 'o', usage: true, items: ITEMS });
    expect(qa(off.el, '.td-media-gallery__caption, .td-media-gallery__caption-field').length).to.equal(0);
    expect(fd(off.form).some(([k]) => k.endsWith('[caption]'))).to.equal(false);
    expect('caption' in off.el.selection[0].usage).to.equal(false);
    expect(warns).to.deep.equal([]);
  });

  it('caption without usage → ONE warning, ignored; an unknown mode → line + ONE warning (never the value)', () => {
    const ref = mk({ name: 'r', caption: true, items: ITEMS });
    expect(qa(ref.el, '.td-media-gallery__caption').length).to.equal(0);
    expect(fd(ref.form)).to.deep.equal([['r[]', 'm1'], ['r[]', 'm2']]);
    expect(warns.filter((w) => /caption/.test(w)).length).to.equal(1);
    warns.length = 0;
    const rich = mk({ name: 'x', usage: true, caption: 'SECRET-mode', items: ITEMS });
    expect(cap(lis(rich.el)[0]).localName).to.equal('input');
    expect(warns.length).to.equal(1);
    expect(warns[0].includes('SECRET')).to.equal(false);
  });

  it('XSS: a caption is text only (line, multiline, the sr label)', () => {
    const evil = '<img src=x onerror="window.__capPwned=1"></textarea><script>window.__capPwned=1</script>';
    for (const mode of ['line', 'multiline']) {
      const { el } = mk({ name: 'g', usage: true, caption: mode, items: J([{ id: 'm1', caption: evil }]) });
      expect(qa(el, 'img[onerror], script').length).to.equal(0);
      expect(cap(lis(el)[0]).value).to.equal(evil);
    }
    expect(window.__capPwned).to.equal(undefined);
  });
});

describe('td-media-gallery caption — events, API, picker (QĐ 5, 14)', () => {
  it('typing: input (reason caption) per key, change on blur, no native event leaves the host; Enter → \\n (multiline)', async () => {
    const { el, form, c } = mk({ name: 'g', usage: true, caption: 'multiline', items: ITEMS });
    const ctl = cap(lis(el)[1]);
    await typeIn(ctl, 'ab');
    await sendKeys({ press: 'Enter' });
    await sendKeys({ type: 'c' });
    expect(c.input).to.equal(4);
    expect(c.details.every((d) => d.reason === 'caption')).to.equal(true);
    expect(c.native).to.equal(0);
    expect(fd(form)[6]).to.deep.equal(['g[1][caption]', 'ab\nc']);
    ctl.blur();
    await tick();
    expect(c.change).to.equal(1);
    expect(c.details.at(-1).reason).to.equal('caption');
    expect(el.selection[1].usage.caption).to.equal('ab\nc');
  });

  it('value = keeps the captions of kept ids (they follow the item); setSelection / picker read usage.caption', async () => {
    const { el, form } = mk({ name: 'g', usage: true, caption: 'line', items: ITEMS });
    el.value = ['m2', 'm1'];
    expect(cap(lis(el)[1]).value).to.equal('Dòng 1 Dòng 2');
    expect(fd(form).filter(([k]) => k.endsWith('[caption]'))).to.deep.equal([['g[0][caption]', ''], ['g[1][caption]', 'Dòng 1 Dòng 2']]);
    el.setSelection([{ assetId: 'a1', asset: null, usage: { altText: 'A', caption: 'x\r\ny\u0000' } }, { assetId: 'a2', asset: null, usage: { altText: '' } }]);
    expect(el.selection.map((s) => s.usage.caption)).to.deep.equal(['x y', '']);
    el.setAttribute('caption', 'multiline');
    expect(el.selection[0].usage.caption).to.equal('x\ny');
    el.setAttribute('max', '5');
    q(el, '.td-media-gallery__add').click();
    const id = [...ad.db.keys()][0];
    opens[0].resolve({ status: 'selected', selection: [{ assetId: id, asset: JSON.parse(JSON.stringify(ad.db.get(id))), usage: { altText: '', caption: 'Từ\r\npicker' } }] });
    await until(() => lis(el).length === 3);
    expect(cap(lis(el)[2]).value).to.equal('Từ\npicker');
  });

  it('runtime mode switch keeps the RAW caption: untouched line "a\\nb" → multiline shows "a\\nb"; typed text wins', async () => {
    const { el } = mk({ name: 'g', usage: true, caption: true, items: J([{ id: 'm1', caption: 'a\nb' }, { id: 'm2', caption: 'c\nd' }]) });
    expect(cap(lis(el)[0]).value).to.equal('a b');
    await typeIn(cap(lis(el)[1]), '!');
    el.setAttribute('caption', 'multiline');
    expect(cap(lis(el)[0]).value).to.equal('a\nb');
    expect(cap(lis(el)[1]).value).to.equal('c d!');
    el.removeAttribute('caption');
    expect(qa(el, '.td-media-gallery__caption').length).to.equal(0);
    el.setAttribute('caption', 'multiline');
    expect(cap(lis(el)[0]).value).to.equal('a\nb', 'off → on: the state kept the caption');
  });

  it('form.reset() → the captions of the items attribute (no event)', async () => {
    const { el, form, c } = mk({ name: 'g', usage: true, caption: true, items: ITEMS });
    await typeIn(cap(lis(el)[0]), 'xyz');
    const n = c.input;
    form.reset();
    await tick();
    expect(cap(lis(el)[0]).value).to.equal('Dòng 1 Dòng 2');
    expect(c.input).to.equal(n);
  });
});

describe('td-media-gallery caption — restore state (QĐ 15, Codex plan-review r1 #3 / r2)', () => {
  const v050 = (items) => encodeGalleryState(items.map((x) => ({ id: x.id, alt: x.alt ?? '', cropRaw: null, focalRaw: null })));

  it('feature off: the state bytes of v0.50 even with captions in items; on: EVERY item carries the raw caption', () => {
    const list = [{ id: 'm1', alt: 'Một', caption: 'a\nb' }, { id: 'm2' }];
    const off = mk({ name: 'g', usage: true }); const so = spyState(off.el); off.el.setAttribute('items', J(list));
    expect(so.last).to.equal(v050(list));
    for (const mode of ['line', 'multiline']) {
      const on = mk({ name: 'g', usage: true, caption: mode }); const s = spyState(on.el); on.el.setAttribute('items', J(list));
      expect(JSON.parse(s.last).items.map((x) => x.caption)).to.deep.equal(['a\nb', ''], mode);
    }
  });

  it('typed then caption turned off: no caption key in the state, no [caption] in FormData (the server keeps)', async () => {
    const { el, form } = mk({ name: 'g', usage: true, caption: true, items: ITEMS });
    const s = spyState(el);
    await typeIn(cap(lis(el)[1]), 'mới');
    expect(JSON.parse(s.last).items[1].caption).to.equal('mới');
    el.removeAttribute('caption');
    expect(s.last).to.equal(v050([{ id: 'm1', alt: 'Một' }, { id: 'm2' }]));
    expect(fd(form).some(([k]) => k.endsWith('[caption]'))).to.equal(false);
  });

  for (const mode of ['line', 'multiline']) {
    it(`${mode}: clear → serialize → restore keeps it CLEARED (never revived from the same id); an old state falls back`, async () => {
      const items = J([{ id: 'm1', caption: mode === 'line' ? 'Áo' : 'a\nb' }, { id: 'm2', caption: 'Hai' }]);
      const a = mk({ name: 'g', usage: true, caption: mode, items });
      const s = spyState(a.el);
      await clear(cap(lis(a.el)[0]));
      expect(JSON.parse(s.last).items[0]).to.have.property('caption', '');
      const b = mk({ name: 'g', usage: true, caption: mode, items });
      b.el.formStateRestoreCallback(s.last, 'restore');
      expect(cap(lis(b.el)[0]).value).to.equal('');
      expect(fd(b.form)[2]).to.deep.equal(['g[0][caption]', '']);
      const c = mk({ name: 'g', usage: true, caption: mode, items });
      c.el.formStateRestoreCallback(JSON.stringify({ v: 1, items: [{ id: 'm2', alt: 'x', crop: null, focal: null }, { id: 'm1', alt: '', crop: null, focal: null }] }), 'restore');
      expect(c.el.selection.map((x) => x.usage.caption)).to.deep.equal(['Hai', mode === 'line' ? 'Áo' : 'a\nb']);
    });
  }
});

describe('td-media-gallery limits — counter, error, validity (QĐ 8-12)', () => {
  const LIM = J([
    { id: 'm1', alt: '1234567', caption: 'abc' }, { id: 'm2', alt: '12345678', caption: 'abcd' },
    { id: 'm3', alt: '　 0123456789 ', caption: 'abcde' }, { id: 'm4', alt: '0123456789A', caption: 'abcdef' },
  ]);

  it('from 80 %: shown / limit / over; error + aria on the control; customError on the first over item; never cut', () => {
    const { el, form } = mk({ name: 'l', usage: true, caption: true, 'alt-maxlength': '10', 'caption-maxlength': '5', items: LIM });
    const L = lis(el);
    const cnt = (li, f) => part(li, f, 'counter');
    const err = (li, f) => part(li, f, 'error');
    expect([cnt(L[0], 'alt').hidden, cnt(L[0], 'alt').textContent]).to.deep.equal([true, '7/10']);
    expect([cnt(L[1], 'alt').hidden, cnt(L[1], 'alt').textContent, cnt(L[1], 'alt').dataset.state]).to.deep.equal([false, '8/10', undefined]);
    expect([cnt(L[2], 'alt').textContent, cnt(L[2], 'alt').dataset.state]).to.deep.equal(['10/10', 'limit']);
    expect([cnt(L[3], 'alt').textContent, cnt(L[3], 'alt').dataset.state, err(L[3], 'alt').hidden]).to.deep.equal(['11/10', 'over', false]);
    expect(err(L[3], 'alt').textContent).to.equal('Mô tả (alt) tối đa 10 ký tự.');
    expect(alt(L[0]).hasAttribute('aria-describedby') || alt(L[0]).hasAttribute('aria-invalid')).to.equal(false);
    expect(alt(L[1]).getAttribute('aria-describedby')).to.equal(cnt(L[1], 'alt').id);
    expect(alt(L[3]).getAttribute('aria-describedby')).to.equal(`${cnt(L[3], 'alt').id} ${err(L[3], 'alt').id}`);
    expect(alt(L[3]).getAttribute('aria-invalid')).to.equal('true');
    expect(cap(L[3]).getAttribute('aria-invalid')).to.equal('true');
    expect(err(L[3], 'caption').textContent).to.equal('Chú thích tối đa 5 ký tự.');
    expect(el.checkValidity()).to.equal(false);
    expect(el.validity.customError).to.equal(true);
    expect(el.validationMessage).to.equal('Ảnh 4: Mô tả (alt) tối đa 10 ký tự.');
    expect(fd(form).filter(([k]) => k === 'l[3][alt]' || k === 'l[3][caption]')).to.deep.equal([['l[3][alt]', '0123456789A'], ['l[3][caption]', 'abcdef']]);
    const ids = qa(el, '[id]').map((n) => n.id);
    expect(new Set(ids).size).to.equal(ids.length);
  });

  it('typing over / back under; requestSubmit blocked; novalidate still sends the full text; ids follow a reorder', async () => {
    const { el, form } = mk({ name: 'l', usage: true, caption: 'multiline', 'caption-maxlength': '5', items: J([{ id: 'm1', caption: 'abc' }, { id: 'm2' }]) });
    let submits = 0;
    form.addEventListener('submit', (e) => { e.preventDefault(); submits++; });
    const ctl = cap(lis(el)[0]);
    await typeIn(ctl, 'def');
    expect(ctl.getAttribute('aria-invalid')).to.equal('true');
    expect(el.validationMessage).to.equal('Ảnh 1: Chú thích tối đa 5 ký tự.');
    form.requestSubmit();
    await tick();
    expect(submits).to.equal(0);
    expect(fd(form)[2]).to.deep.equal(['l[0][caption]', 'abcdef']);
    form.noValidate = true;
    form.requestSubmit();
    await tick();
    expect(submits).to.equal(1);
    form.noValidate = false;
    el.value = ['m2', 'm1'];
    const li = lis(el)[1];
    expect(part(li, 'caption', 'counter').id).to.equal(`${el.id}-1-caption-count`);
    expect(cap(li).getAttribute('aria-describedby')).to.equal(`${el.id}-1-caption-count ${el.id}-1-caption-error`);
    expect(el.validationMessage).to.equal('Ảnh 2: Chú thích tối đa 5 ký tự.');
    const c2 = cap(li);
    c2.focus();
    c2.setSelectionRange(c2.value.length, c2.value.length);
    await sendKeys({ press: 'Backspace' });
    expect(cap(li).hasAttribute('aria-invalid')).to.equal(false);
    expect(el.checkValidity()).to.equal(true);
  });

  it('priority: rangeUnderflow before the length error; disabled → no validity', () => {
    const { el } = mk({ name: 'l', usage: true, min: '3', 'alt-maxlength': '2', items: J([{ id: 'm1', alt: 'xyz' }]) });
    expect(el.validity.rangeUnderflow).to.equal(true);
    expect(el.validity.customError).to.equal(false);
    el.setAttribute('min', '0');
    expect(el.validity.customError).to.equal(true);
    el.setAttribute('disabled', '');
    expect(el.checkValidity()).to.equal(true);
  });

  it('runtime: off → on / on → off render (bytes = a gallery never limited); number → number keeps tiles + focus', async () => {
    for (const [attr, field] of [['alt-maxlength', 'alt'], ['caption-maxlength', 'caption']]) {
      const items = J([{ id: 'm1', alt: 'abcdefgh', caption: 'abcdefgh' }]);
      const { el } = mk({ name: 'g', usage: true, caption: true, items });
      const fresh = el.innerHTML;
      const li0 = lis(el)[0];
      el.setAttribute(attr, '10');
      expect(lis(el)[0] === li0, `${attr} off → on re-renders`).to.equal(false);
      expect(part(lis(el)[0], field, 'counter').textContent).to.equal('8/10');
      const li1 = lis(el)[0];
      const ctl = field === 'alt' ? alt(li1) : cap(li1);
      ctl.focus();
      el.setAttribute(attr, '7');
      expect(lis(el)[0] === li1, `${attr} number → number keeps the tile`).to.equal(true);
      expect(document.activeElement === ctl).to.equal(true);
      expect(part(li1, field, 'counter').dataset.state).to.equal('over');
      expect(el.validity.customError).to.equal(true);
      el.setAttribute(attr, '0');
      expect(qa(el, '.td-media-gallery__counter, .td-media-gallery__error').length).to.equal(0);
      expect(el.validity.customError).to.equal(false);
      expect(el.innerHTML, `${attr} on → off = the never-limited bytes`).to.equal(fresh);
      const li2 = lis(el)[0];
      const n = warns.length;
      el.setAttribute(attr, 'abc');
      expect(lis(el)[0] === li2, `${attr} invalid → invalid: no DOM change`).to.equal(true);
      expect(warns.length).to.equal(n + 1);
      el.setAttribute(attr, '9');
      el.removeAttribute(attr);
      expect(el.innerHTML).to.equal(fresh);
    }
    const { el } = mk({ name: 'g', usage: true, caption: true, 'caption-maxlength': '5', items: J([{ id: 'm1', caption: 'abcdef' }]) });
    el.removeAttribute('caption');
    expect(qa(el, '.td-media-gallery__counter').length).to.equal(0);
    expect(el.validity.customError).to.equal(false);
  });

  it('strict attribute values: invalid → off + ONE warning (not the value); prerequisites (usage / caption)', () => {
    for (const v of ['0', '0255', ' 5', '+5', '5.0', '1e2', 'abc', '501']) {
      warns.length = 0;
      const { el } = mk({ name: 'g', usage: true, 'alt-maxlength': v, items: J([{ id: 'm1', alt: 'x' }]) });
      expect(qa(el, '.td-media-gallery__counter').length, v).to.equal(0);
      expect(warns.length, v).to.equal(1);
      if (['abc', '0255', '1e2', '+5', '5.0', '501'].includes(v)) expect(warns[0].includes(v), v).to.equal(false);
    }
    warns.length = 0;
    mk({ name: 'g', 'alt-maxlength': '5', items: J([{ id: 'm1' }]) });
    mk({ name: 'g', usage: true, 'caption-maxlength': '5', items: J([{ id: 'm1' }]) });
    expect(warns.length).to.equal(2);
  });

  it('live region: one polite announcement after the pause, only from 80 %, not repeated, cancelled on blur', async () => {
    const { el } = mk({ name: 'g', usage: true, caption: true, 'caption-maxlength': '5', items: J([{ id: 'm1' }]) });
    const ctl = cap(lis(el)[0]);
    await typeIn(ctl, 'ab');
    await new Promise((r) => setTimeout(r, 200));
    expect(status(el)).to.equal('', 'below 80 %');
    await typeIn(ctl, 'cd');
    await until(() => status(el) !== '');
    expect(status(el)).to.equal('Chú thích ảnh 1: còn 1 ký tự.');
    q(el, '.td-media-gallery__status').textContent = '';
    // the same count again (an input event with the same text — deterministic, no timing between two key presses)
    ctl.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 200));
    expect(status(el)).to.equal('', 'same sentence → not repeated');
    // set the whole over-limit text with ONE input event: typing 'e' then 'f' lets the announce timer fire in between on a
    // loaded runner ("còn 0 ký tự" — a correct announcement of the intermediate value, but not the one under test)
    ctl.value = `${ctl.value}ef`;
    ctl.dispatchEvent(new Event('input', { bubbles: true }));
    await until(() => status(el) !== '');
    expect(status(el)).to.equal('Chú thích ảnh 1: vượt 1 ký tự.');
    q(el, '.td-media-gallery__status').textContent = '';
    TdMediaGallery.LIMIT_ANNOUNCE_DELAY = 60000; // a pending timer for sure (no race with the key round-trip under load)
    await typeIn(ctl, 'g');
    expect(el._limitTimer !== 0, 'a pending announcement').to.equal(true);
    ctl.blur();
    expect(el._limitTimer, 'blur cancels').to.equal(0);
    expect(status(el)).to.equal('');
  });

  it('server data already over the limit shows the error at render; trim: ECMAScript whitespace not counted', () => {
    const { el } = mk({ name: 'g', usage: true, 'alt-maxlength': '3', items: J([{ id: 'm1', alt: '　 abcd﻿' }, { id: 'm2', alt: ' \t abc \n' }]) });
    expect(part(lis(el)[0], 'alt', 'counter').textContent).to.equal('4/3');
    expect(alt(lis(el)[0]).getAttribute('aria-invalid')).to.equal('true');
    expect(part(lis(el)[1], 'alt', 'counter').textContent).to.equal('3/3');
  });
});

describe('td-media-gallery caption — raw read budget (Codex review r1 SEC-01)', () => {
  const huge = `${'\u0000'.repeat(3999)}${'§'.repeat(30 * 1024 * 1024)}`; // 30 M code units after 3999 controls
  const timed = (fn) => { const t0 = performance.now(); fn(); return performance.now() - t0; };

  it('setSelection() with a 30 MB caption: bounded time, the bounded rule ("§")', () => {
    const { el, form } = mk({ name: 'g', usage: true, caption: 'multiline' });
    const ms = timed(() => el.setSelection([{ assetId: 'a1', asset: null, usage: { altText: '', caption: huge } }]));
    expect(ms < 50 * PERF_SLACK, `${ms} ms`).to.equal(true);
    expect(el.selection[0].usage.caption).to.equal('§');
    expect(fd(form)[2]).to.deep.equal(['g[0][caption]', '§']);
  });

  it('the picker with a 30 MB caption: bounded time, the bounded rule', async () => {
    const { el } = mk({ name: 'g', usage: true, caption: true, max: '5' });
    q(el, '.td-media-gallery__add').click();
    const id = [...ad.db.keys()][0];
    const t0 = performance.now();
    opens[0].resolve({ status: 'selected', selection: [{ assetId: id, asset: JSON.parse(JSON.stringify(ad.db.get(id))), usage: { altText: '', caption: huge } }] });
    await until(() => lis(el).length === 1);
    expect(performance.now() - t0 < 200 * PERF_SLACK).to.equal(true);
    expect(cap(lis(el)[0]).value).to.equal('§');
  });

  it('items attribute: over 256 KiB fails closed before any parse; within it, a long caption is cut by the rule', () => {
    const a = mk({ name: 'g', usage: true, caption: true });
    const big = JSON.stringify([{ id: 'm1', caption: huge.slice(0, 1024 * 1024) }]);
    const ms = timed(() => a.el.setAttribute('items', big));
    expect(ms < 50 * PERF_SLACK, `${ms} ms`).to.equal(true);
    expect(fd(a.form)).to.deep.equal([], 'fail closed');
    const b = mk({ name: 'g', usage: true, caption: true, items: JSON.stringify([{ id: 'm1', caption: 'é'.repeat(5000) }]) });
    expect(cap(lis(b.el)[0]).value).to.equal('é'.repeat(1000));
  });
});
