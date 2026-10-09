import { expect } from '@esm-bundle/chai';
import { setViewport, sendKeys } from '@web/test-runner-commands';
import { TdModal } from '../feedback/td-modal.js';
import './td-datetime-range.js';

// v0.63.0 (plan docs/internal/plans/v0.63.0-typed-dates.md M2 — B, D range, D2, D3, E) — `editable` on <td-datetime-range> in
// Chromium, Firefox AND WebKit: criterion 5 with the explicit `change` counter (0 → 1 → 1 → 2; required 0, 0, 1) by Enter AND
// blur, the order / max-days / min–max / format errors on the input they are about, `allow-open-end`, the host never sees the
// inputs' own `input` / `change`, the dialog opening at the typed range, touch (coarse → readonly, a tap opens), implicit
// form submission, setValue, SSR safe render. Booleans / strings in assertions only.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const raf = () => new Promise((r) => requestAnimationFrame(r));
const settle = async () => { await raf(); await raf(); };
const until = async (cond, n = 240) => { for (let i = 0; i < n && !cond(); i++) await raf(); return !!cond(); };
const vp = async (size) => {
  await setViewport(size);
  for (let i = 0; i < 120 && window.innerWidth !== size.width; i++) await raf();
  await raf();
};
const host = document.createElement('div');
host.style.cssText = 'width: 560px; padding: 40px;';
document.body.appendChild(host);
const panel = () => [...document.querySelectorAll('.td-dtr-panel')].find((p) => !p.closest('.td-modal[data-state="closing"]')) || null;
const active = () => document.activeElement;

let seq = 0;
function mount(attrs = 'mode="date" editable', wrap = (h) => h) {
  seq += 1;
  host.innerHTML = wrap(`<td-datetime-range id="er${seq}" name="r" label="Chụp" ${attrs}></td-datetime-range>`);
  const el = host.querySelector('td-datetime-range');
  const rec = { change: [], bare: 0, input: 0 };
  el.addEventListener('change', (e) => {
    if (e instanceof CustomEvent && e.detail) rec.change.push(e.detail);
    else rec.bare += 1;
  });
  el.addEventListener('input', () => { rec.input += 1; });
  const side = (k) => el.querySelector(`.td-dtr__input[data-side="${k}"]`);
  return { el, rec, start: side('start'), end: side('end'), trigger: el.querySelector('.td-dtr__trigger') };
}

/** Type into one input (select all + real keys), then commit with Enter or blur (Tab). */
async function typeCommit(input, text, how) {
  input.focus();
  input.select();
  if (text === '') await sendKeys({ press: 'Backspace' });
  else await sendKeys({ type: text });
  if (how === 'enter') await sendKeys({ press: 'Enter' });
  else {
    input.blur(); // a real blur (Tab from the start input would just move into the end input — also a blur)
  }
  await settle();
}
const note = (m) => {
  const n = m.el.querySelector('.td-field-error');
  return n ? n.textContent : null;
};
const inv = (input) => input.getAttribute('aria-invalid');

afterEach(async () => {
  TdModal.closeAll();
  host.innerHTML = '';
  await settle();
});
before(async () => { await vp({ width: 1024, height: 768 }); });

describe('v0.63.0 editable range — markup (plan B)', () => {
  it('two inputs (data-side) + separator + icon button; hidden side names; no name; trigger id kept', async () => {
    const m = mount('mode="date" editable required="start" start="20/03/1994"');
    await settle();
    const box = m.el.querySelector('.td-dtr');
    expect(box.classList.contains('td-dtr--editable')).to.equal(true);
    for (const [k, input] of [['start', m.start], ['end', m.end]]) {
      expect(input.getAttribute('type')).to.equal('text');
      expect(input.id).to.equal(`${m.el.id}-${k}-input`);
      expect(input.hasAttribute('name')).to.equal(false);
      expect(input.hasAttribute('role')).to.equal(false);
      expect(input.getAttribute('autocomplete')).to.equal('off');
      expect(input.getAttribute('placeholder')).to.equal('dd/mm/yyyy');
      expect(input.getAttribute('aria-labelledby')).to.equal(`${m.el.id}-label ${m.el.id}-${k}-name`);
    }
    expect(document.getElementById(`${m.el.id}-start-name`).textContent).to.equal('Từ ngày');
    expect(document.getElementById(`${m.el.id}-end-name`).textContent).to.equal('Đến ngày');
    expect(m.start.getAttribute('aria-required')).to.equal('true');
    expect(m.end.getAttribute('aria-required')).to.equal(null);
    expect(m.start.value).to.equal('20/03/1994');
    expect(m.end.value).to.equal('');
    expect(m.el.querySelector('.td-dtr__sep').getAttribute('aria-hidden')).to.equal('true');
    expect(m.trigger.id).to.equal(`${m.el.id}-trigger`);
    expect(m.trigger.classList.contains('td-dtr__trigger--icon')).to.equal(true);
    expect(m.trigger.getAttribute('aria-label')).to.equal('Mở lịch');
    expect(m.trigger.hasAttribute('role')).to.equal(false);
    expect(m.el.querySelector('.td-dtr__value')).to.equal(null);
  });

  it('allow-open-end: the end placeholder reads "Không hạn"; datetime placeholders + names', async () => {
    const m = mount('mode="date" editable allow-open-end');
    await settle();
    expect(m.end.getAttribute('placeholder')).to.equal('Không hạn');
    m.el.removeAttribute('allow-open-end');
    expect(m.end.getAttribute('placeholder')).to.equal('dd/mm/yyyy');
    const d = mount('mode="datetime" editable');
    await settle();
    expect(d.start.getAttribute('placeholder')).to.equal('dd/mm/yyyy - hh:mm');
    expect(document.getElementById(`${d.el.id}-start-name`).textContent).to.equal('Từ');
  });

  it('without editable the 0.62 trigger is untouched', async () => {
    const m = mount('mode="date" start="20/03/1994"');
    await settle();
    expect(m.start).to.equal(null);
    expect(m.trigger.getAttribute('role')).to.equal('combobox');
    expect(m.el.querySelector('.td-dtr__value').textContent).to.equal('Từ 20/03/1994');
  });
});

for (const how of ['enter', 'blur']) {
  describe(`v0.63.0 editable range — criterion 5 by ${how} (plan D range, D2, D3)`, () => {
    it('not required: 0 → 1 { start, end: "" } → order error on Đến, still 1 → fixed, 2', async () => {
      const m = mount('mode="date" editable start="" end=""');
      await settle();
      expect(m.rec.change.length).to.equal(0);
      await typeCommit(m.start, '20/03/1994', how);
      expect(m.rec.change).to.deep.equal([{ value: { start: '20/03/1994', end: '' }, dbValue: { start: '1994-03-20', end: '' }, preset: null }]);
      await typeCommit(m.end, '10/03/1994', how);
      expect(m.rec.change.length).to.equal(1);
      expect(note(m)).to.equal('Ngày bắt đầu phải trước hoặc bằng ngày kết thúc');
      expect(inv(m.end)).to.equal('true');
      expect(inv(m.start)).to.equal(null);
      expect(m.end.getAttribute('aria-errormessage')).to.equal(`${m.el.id}-error`);
      expect(m.el.checkValidity()).to.equal(false);
      expect(m.el.getAttribute('end')).to.equal('10/03/1994'); // written, not refused
      await typeCommit(m.end, '25031994', how);
      expect(m.end.value).to.equal('25/03/1994');
      expect(m.rec.change.length).to.equal(2);
      expect(m.rec.change[1]).to.deep.equal({ value: { start: '20/03/1994', end: '25/03/1994' }, dbValue: { start: '1994-03-20', end: '1994-03-25' }, preset: null });
      expect(note(m)).to.equal(null);
      expect(inv(m.end)).to.equal(null);
      expect(m.rec.input).to.equal(0);
      expect(m.rec.bare).to.equal(0);
    });

    it('required (both): 0, 0, 1', async () => {
      const m = mount('mode="date" editable required start="" end=""');
      await settle();
      await typeCommit(m.start, '20/03/1994', how);
      expect(m.rec.change.length).to.equal(0);
      expect(m.el.validity.valueMissing).to.equal(true);
      expect(note(m)).to.equal(null); // the end was never typed: no error shown for it yet
      await typeCommit(m.end, '10/03/1994', how);
      expect(m.rec.change.length).to.equal(0);
      expect(note(m)).to.equal('Ngày bắt đầu phải trước hoặc bằng ngày kết thúc');
      await typeCommit(m.end, '25/03/1994', how);
      expect(m.rec.change).to.deep.equal([{ value: { start: '20/03/1994', end: '25/03/1994' }, dbValue: { start: '1994-03-20', end: '1994-03-25' }, preset: null }]);
      // emptying a required side: its required message, 0 change
      await typeCommit(m.start, '', how);
      expect(note(m)).to.equal('Vui lòng chọn ngày bắt đầu');
      expect(inv(m.start)).to.equal('true');
      expect(m.rec.change.length).to.equal(1);
      expect(m.rec.input + m.rec.bare).to.equal(0);
    });

    it('allow-open-end + required: Từ alone is valid (1 change), Đến emptied again → 1 more', async () => {
      const m = mount('mode="date" editable required allow-open-end');
      await settle();
      await typeCommit(m.start, '20/03/1994', how);
      expect(m.rec.change).to.deep.equal([{ value: { start: '20/03/1994', end: '' }, dbValue: { start: '1994-03-20', end: '' }, preset: null }]);
      await typeCommit(m.end, '30/03/1994', how);
      expect(m.rec.change.length).to.equal(2);
      await typeCommit(m.end, '', how);
      expect(m.rec.change.length).to.equal(3);
      expect(m.rec.change[2].value).to.deep.equal({ start: '20/03/1994', end: '' });
      expect(note(m)).to.equal(null);
    });

    it('max-days 10: a longer range → the span error on the side just committed, 0 change; shortened → 1', async () => {
      const m = mount('mode="date" editable max-days="10" start="01/03/1994"');
      await settle();
      await typeCommit(m.end, '20/03/1994', how);
      expect(note(m)).to.equal('Khoảng tối đa 10 ngày');
      expect(inv(m.end)).to.equal('true');
      expect(m.rec.change.length).to.equal(0);
      // the error follows the side just committed: moving the start keeps the pair invalid → now on Từ
      await typeCommit(m.start, '02/03/1994', how);
      expect(note(m)).to.equal('Khoảng tối đa 10 ngày');
      expect(inv(m.start)).to.equal('true');
      expect(inv(m.end)).to.equal(null);
      await typeCommit(m.start, '15/03/1994', how);
      expect(note(m)).to.equal(null);
      expect(m.rec.change).to.deep.equal([{ value: { start: '15/03/1994', end: '20/03/1994' }, dbValue: { start: '1994-03-15', end: '1994-03-20' }, preset: null }]);
    });

    it('format / impossible / min–max errors on their own input, 0 change; the other side keeps its own error', async () => {
      const m = mount('mode="date" editable min="01/01/1990" max="31/12/1999"');
      await settle();
      await typeCommit(m.start, '15/3/94', how);
      expect(note(m)).to.equal('Định dạng ngày không hợp lệ');
      expect(inv(m.start)).to.equal('true');
      expect(m.el.validity.badInput).to.equal(true);
      await typeCommit(m.end, '01/01/2000', how);
      expect(note(m)).to.equal('Không được sau 31/12/1999');
      expect(inv(m.end)).to.equal('true');
      expect(inv(m.start)).to.equal(null);
      await typeCommit(m.end, '31/02/1995', how);
      expect(note(m)).to.equal('Ngày không hợp lệ');
      await typeCommit(m.end, '28/02/1995', how);
      expect(note(m)).to.equal('Định dạng ngày không hợp lệ'); // back to the start's own error
      expect(inv(m.start)).to.equal('true');
      expect(inv(m.end)).to.equal(null);
      expect(m.rec.change.length).to.equal(0);
      await typeCommit(m.start, '1995-02-01', how);
      expect(note(m)).to.equal(null);
      expect(m.rec.change).to.deep.equal([{ value: { start: '01/02/1995', end: '28/02/1995' }, dbValue: { start: '1995-02-01', end: '1995-02-28' }, preset: null }]);
    });

    it('a site error wins over the typed error', async () => {
      const m = mount('mode="date" editable error-text="Lỗi của site" start="20/03/1994"');
      await settle();
      await typeCommit(m.end, '10/03/1994', how);
      expect(note(m)).to.equal('Lỗi của site');
      m.el.removeAttribute('error-text');
      expect(note(m)).to.equal('Ngày bắt đầu phải trước hoặc bằng ngày kết thúc');
      expect(inv(m.end)).to.equal('true');
    });

    it('the same range again (normalised text) → 0 change; datetime without a time → incomplete', async () => {
      const m = mount('mode="date" editable start="20/03/1994"');
      await settle();
      await typeCommit(m.start, '20031994', how);
      expect(m.start.value).to.equal('20/03/1994');
      expect(m.rec.change.length).to.equal(0);
      const d = mount('mode="datetime" editable');
      await settle();
      await typeCommit(d.start, '20/03/1994', how);
      expect(note(d)).to.equal('Vui lòng nhập đầy đủ ngày, tháng, năm');
      await typeCommit(d.start, '20/03/1994 08:30', how);
      expect(d.rec.change).to.deep.equal([{ value: { start: '20/03/1994 - 08:30', end: '' }, dbValue: { start: '1994-03-20 08:30:00', end: '' }, preset: null }]);
    });
  });
}

describe('v0.63.0 editable range — never leaks, Escape, dialog', () => {
  it('typing fires no input / change on the host', async () => {
    const m = mount();
    await settle();
    m.start.focus();
    await sendKeys({ type: '20/03' });
    m.end.focus();
    await sendKeys({ type: '2' });
    expect(m.rec.input).to.equal(0);
    expect(m.rec.bare).to.equal(0);
  });

  it('Escape puts the committed text back (no event)', async () => {
    const m = mount('mode="date" editable start="20/03/1994"');
    await settle();
    m.start.focus();
    m.start.select();
    await sendKeys({ type: '01/01/2001' });
    await sendKeys({ press: 'Escape' });
    expect(m.start.value).to.equal('20/03/1994');
    m.start.blur();
    await settle();
    expect(m.rec.change.length).to.equal(0);
  });

  it('the icon button commits, then the dialog opens on the typed range; "Chọn" writes it back to the inputs, the typed error goes', async () => {
    const m = mount('mode="date" editable');
    await settle();
    await typeCommit(m.start, '25/03/1994', 'blur');
    m.end.focus();
    await sendKeys({ type: '10/03/1994' });
    m.trigger.click();
    expect(await until(() => !!panel())).to.equal(true);
    await settle();
    expect(note(m)).to.equal('Ngày bắt đầu phải trước hoặc bằng ngày kết thúc');
    const tabs = [...panel().querySelectorAll('.td-dtr-panel__tab-value')].map((t) => t.textContent);
    expect(tabs).to.deep.equal(['25/03/1994', '10/03/1994']);
    expect(!!panel().querySelector('[data-date="1994-03-25"]')).to.equal(true);
    // fix it in the dialog: the end → 28/03, "Chọn"
    panel().querySelector('.td-dtr-panel__tab[data-side="end"]').click();
    await settle();
    panel().querySelector('[data-date="1994-03-28"]').click();
    await settle();
    document.querySelector('.td-modal [data-action="confirm"]').click();
    expect(await until(() => !panel())).to.equal(true);
    expect(m.end.value).to.equal('28/03/1994');
    expect(note(m)).to.equal(null);
    expect(inv(m.end)).to.equal(null);
    expect(m.rec.change.length).to.equal(2);
    expect(m.rec.change[1].value).to.deep.equal({ start: '25/03/1994', end: '28/03/1994' });
  });

  it('ArrowDown in an input opens the dialog; closing gives the focus back to that input', async () => {
    const m = mount('mode="date" editable start="20/03/1994"');
    await settle();
    m.end.focus();
    await sendKeys({ press: 'ArrowDown' });
    expect(await until(() => !!panel())).to.equal(true);
    await settle();
    await sendKeys({ press: 'Escape' });
    expect(await until(() => !panel())).to.equal(true);
    await settle();
    expect(active() === m.end).to.equal(true);
  });
});

describe('v0.63.0 editable range — touch (plan E)', () => {
  let real;
  beforeEach(() => {
    real = window.matchMedia;
    window.matchMedia = (q) => (q === '(hover: none) and (pointer: coarse)'
      ? { matches: true, media: q, addEventListener() {}, removeEventListener() {} }
      : real.call(window, q));
  });
  afterEach(() => { window.matchMedia = real; });

  it('coarse: both inputs readonly + inputmode=none; a tap opens the dialog', async () => {
    const m = mount('mode="date" editable start="20/03/1994"');
    await settle();
    for (const input of [m.start, m.end]) {
      expect(input.readOnly).to.equal(true);
      expect(input.getAttribute('inputmode')).to.equal('none');
    }
    m.end.focus();
    m.end.click();
    expect(await until(() => !!panel())).to.equal(true);
    expect(m.rec.change.length).to.equal(0);
  });
});

describe('v0.63.0 editable range — form, programmatic, SSR', () => {
  it('Enter submits the form with the typed side; an invalid range blocks the submit', async () => {
    const m = mount('mode="date" editable', (h) => `<form>${h}<button type="submit">Lọc</button></form>`);
    await settle();
    const form = host.querySelector('form');
    const sent = [];
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      sent.push(`${fd.get('r[start]')}|${fd.get('r[end]')}`);
    });
    form.addEventListener('invalid', (e) => e.preventDefault(), true);
    await typeCommit(m.start, '20/03/1994', 'enter');
    expect(sent).to.deep.equal(['1994-03-20|']);
    await typeCommit(m.end, '10/03/1994', 'enter');
    expect(sent.length).to.equal(1);
    await typeCommit(m.end, '30/03/1994', 'enter');
    expect(sent).to.deep.equal(['1994-03-20|', '1994-03-20|1994-03-30']);
  });

  it('setValue / an outside `end` change: the inputs follow (also while focused), no change, the typed error goes', async () => {
    const m = mount('mode="date" editable start="20/03/1994"');
    await settle();
    await typeCommit(m.end, '10/03/1994', 'blur');
    expect(note(m)).to.equal('Ngày bắt đầu phải trước hoặc bằng ngày kết thúc');
    m.end.focus();
    m.el.setAttribute('end', '30/03/1994');
    expect(m.end.value).to.equal('30/03/1994');
    expect(note(m)).to.equal(null);
    m.el.setValue({ start: '01/01/1995', end: '' });
    expect(m.start.value).to.equal('01/01/1995');
    expect(m.end.value).to.equal('');
    m.end.blur();
    await settle();
    expect(m.rec.change.length).to.equal(0);
  });

  it('editable toggled at run time keeps the values and the focus side; disabled follows', async () => {
    const m = mount('mode="date" start="20/03/1994"');
    await settle();
    m.el.setAttribute('editable', '');
    const end = m.el.querySelector('.td-dtr__input[data-side="end"]');
    end.focus();
    m.el.setAttribute('label', 'Khác');
    expect(active() === m.el.querySelector('.td-dtr__input[data-side="end"]')).to.equal(true);
    expect(m.el.querySelector('.td-dtr__input[data-side="start"]').value).to.equal('20/03/1994');
    m.el.setAttribute('disabled', '');
    expect(m.el.querySelector('.td-dtr__input[data-side="start"]').disabled).to.equal(true);
    m.el.removeAttribute('editable');
    expect(m.el.querySelector('.td-dtr__input')).to.equal(null);
    expect(m.el.querySelector('.td-dtr__value').textContent).to.equal('Từ 20/03/1994');
  });

  it('SSR (php td_datetime_range + editable): markup not adopted, safe render, the live native values kept', async () => {
    seq += 1;
    const id = `ssr${seq}`;
    const php = (eid, editable) => `<td-datetime-range data-td-ssr="datetime-range@1" id="${eid}" name="r" mode="date" start="20/03/1994" label="Chụp"${editable ? ' editable' : ''}>`
      + `<div class="td-dtr" data-state="closed"><span class="td-field__label td-dtr__label" id="${eid}-label">Chụp</span>`
      + `<div class="td-dtr__natives" role="group" aria-labelledby="${eid}-label"><label class="td-dtr__native-label" for="${eid}-start">Từ</label>`
      + `<input class="td-dtr__native" type="date" id="${eid}-start" data-part="start" name="r[start]" value="1994-03-20">`
      + `<label class="td-dtr__native-label" for="${eid}-end">Đến</label><input class="td-dtr__native" type="date" id="${eid}-end" data-part="end" name="r[end]"></div>`
      + `<button type="button" class="td-dtr__trigger" id="${eid}-trigger" role="combobox" aria-haspopup="dialog" aria-expanded="false" aria-labelledby="${eid}-label">`
      + '<span class="td-dtr__value">Từ 20/03/1994</span><span class="td-dtr__icon" data-td-icon="calendar" aria-hidden="true"></span></button></div></td-datetime-range>';
    const insert = (html) => {
      const form = document.createElement('form');
      form.innerHTML = html;
      form.querySelector('input[data-part="end"]').value = '1994-03-30';
      const trigger = form.querySelector('.td-dtr__trigger');
      host.appendChild(form);
      return { form, el: form.querySelector('td-datetime-range'), trigger };
    };
    const a = insert(php(`${id}a`, false));
    await settle();
    expect(a.el.querySelector('.td-dtr__trigger') === a.trigger).to.equal(true); // control: adopted
    const b = insert(php(`${id}b`, true));
    await settle();
    expect(b.el.querySelector('.td-dtr__trigger') === b.trigger).to.equal(false);
    expect(b.el.querySelector('.td-dtr__natives')).to.equal(null);
    expect(b.el.querySelector('.td-dtr__input[data-side="start"]').value).to.equal('20/03/1994');
    expect(b.el.querySelector('.td-dtr__input[data-side="end"]').value).to.equal('30/03/1994');
    const fd = new FormData(b.form);
    expect(`${fd.getAll('r[start]')}|${fd.getAll('r[end]')}`).to.equal('1994-03-20|1994-03-30');
  });
});
