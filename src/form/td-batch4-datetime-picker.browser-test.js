import { expect } from '@esm-bundle/chai';
import { sendKeys, emulateMedia } from '@web/test-runner-commands';
import { TdDatetimePicker } from './td-datetime-picker.js';
import { TdModal } from '../feedback/td-modal.js';

// Batch 4 — td-datetime-picker token-native (plan docs/internal/plans/v0.10.0-batch4.md item 1: D1–D10). td.css only.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const host = document.createElement('div');
document.body.appendChild(host);
const mount = (html, parent = host) => { parent.insertAdjacentHTML('beforeend', html.trim()); return parent.lastElementChild; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
/** TdModal picks the initial focus + runs onShow on the second frame */
const settle = async () => { await frame(); await frame(); await frame(); };
/** never hand DOM elements to chai deep asserts (it hangs inspecting them) */
const same = (a, b) => a === b;
const once = (target, type, ms = 1500) => new Promise((resolve) => {
  const t = setTimeout(() => resolve(false), ms);
  target.addEventListener(type, () => { clearTimeout(t); resolve(true); }, { once: true });
});

const pick = (attrs = '', parent = host) => mount(`<td-datetime-picker ${attrs}></td-datetime-picker>`, parent);
const trig = (el) => el.querySelector('.td-dtp__trigger');
const openModal = () => [...document.querySelectorAll('.td-modal')].find((m) => m.getAttribute('data-state') !== 'closing') || null;
const panel = () => { const m = openModal(); return m ? m.querySelector('.td-dtp-panel') : null; };
const field = (part) => panel().querySelector(`.td-dtp-panel__input[data-part="${part}"]`);
const wheel = (part) => panel().querySelector(`.td-dtp-wheel__list[data-part="${part}"]`);
const selected = (list) => list.querySelector('[aria-selected="true"]');
const selectedValue = (list) => Number(selected(list).getAttribute('data-value'));
const button = (label) => [...openModal().querySelectorAll('.td-modal__footer .td-btn')].find((b) => b.textContent.trim() === label);
const errorLine = () => panel().querySelector('.td-dtp-panel__error');
async function open(el) {
  trig(el).click();
  await settle();
  return panel();
}
/** type into a panel number field (clears it first) */
async function typeInto(input, text) {
  input.focus();
  input.value = '';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await sendKeys({ type: text });
}

afterEach(async () => {
  TdModal.closeAll();
  host.innerHTML = '';
  document.querySelectorAll('body > .td-modal').forEach((m) => m.remove());
  TdDatetimePicker.labels.title = 'Chọn ngày giờ';
  await emulateMedia({ reducedMotion: 'no-preference' });
  await wait(0);
});

const KEEP = ['type', 'role', 'aria-hidden', 'hidden', 'data-td-icon', 'data-icon', 'aria-selected', 'aria-controls',
  'aria-labelledby', 'aria-describedby', 'aria-errormessage', 'aria-invalid', 'aria-required', 'aria-label',
  'aria-haspopup', 'aria-expanded', 'aria-activedescendant', 'data-state', 'data-placeholder', 'data-value',
  'data-part', 'for', 'id', 'tabindex', 'min', 'max', 'inputmode'];
function shape(el) {
  // panel ids carry a per-open sequence ({host}-dtp{n}-…, review ISSUE-7): compare them without it
  const attrs = KEEP.filter((a) => el.hasAttribute(a)).map((a) => `${a}=${el.getAttribute(a).replace(/-dtp\d+(?=-)/g, '-dtp')}`);
  const cls = [...el.classList].sort().join('.');
  const kids = el.localName === 'svg' && el.getAttribute('data-icon') ? [] : [...el.children].map(shape);
  return { tag: el.localName, cls, attrs, kids };
}

describe('batch 4 — td-datetime-picker structure', () => {
  it('matches the golden contract (host trees + open panel)', async () => {
    const html = await (await fetch('/test/contracts/datetime-picker.html')).text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const ts = [...doc.querySelectorAll('template')];
    expect(ts.length).to.equal(4);
    for (const t of ts) {
      host.innerHTML = t.getAttribute('data-markup');
      const el = host.firstElementChild;
      if (t.hasAttribute('data-setup')) new Function('el', t.getAttribute('data-setup'))(el);
      let got = el.firstElementChild;
      if (t.hasAttribute('data-portal')) {
        await open(el);
        got = panel();
      }
      expect(JSON.stringify(shape(got)), t.getAttribute('data-markup')).to.equal(JSON.stringify(shape(t.content.firstElementChild)));
      TdModal.closeAll();
      host.innerHTML = '';
    }
  });

  it('trigger = button[role=combobox][aria-haspopup=dialog], field look, no Tailwind, no inline styles, no adopted sheet', async () => {
    const el = pick('id="s1" label="Hẹn giờ" value="15/06/2026 - 10:30"');
    const t = trig(el);
    expect(t.localName).to.equal('button');
    expect(t.type).to.equal('button');
    expect(t.getAttribute('role')).to.equal('combobox');
    expect(t.getAttribute('aria-haspopup')).to.equal('dialog');
    expect(t.getAttribute('aria-expanded')).to.equal('false');
    expect(t.querySelector('.td-dtp__icon svg')).to.not.equal(null);
    const cs = getComputedStyle(t);
    expect(cs.height).to.equal('40px');
    expect(cs.borderTopLeftRadius).to.equal('12px');
    await open(el);
    const roots = [el, openModal()];
    const classes = roots.flatMap((r) => [...r.querySelectorAll('[class]')].flatMap((n) => [...n.classList]));
    classes.forEach((c) => expect(/^td-/.test(c), c).to.equal(true));
    expect(el.querySelector('[style]')).to.equal(null);
    expect(panel().querySelector('[style]')).to.equal(null);
    expect(document.adoptedStyleSheets.length).to.equal(0);
    // the wheel is laid out by td.css alone (was Tailwind-only: cross-cutting finding 1)
    const list = wheel('hour');
    expect(getComputedStyle(list).overflowY).to.equal('auto');
    expect(getComputedStyle(list).scrollSnapType).to.contain('mandatory');
    expect(list.clientHeight).to.equal(200);
  });

  it('naming: internal label → <label for>; host aria-label; external <label for=host>', async () => {
    const a = pick('id="n1" label="Ngày hẹn"');
    expect(trig(a).labels.length).to.equal(1);
    expect(trig(a).labels[0].textContent).to.equal('Ngày hẹn');
    expect(trig(a).hasAttribute('aria-label')).to.equal(false);

    const b = pick('id="n2" aria-label="Thời điểm"');
    expect(trig(b).getAttribute('aria-label')).to.equal('Thời điểm');
    const tb = trig(b);
    b.setAttribute('aria-label', 'Mốc');
    expect(same(trig(b), tb)).to.equal(true);
    expect(trig(b).getAttribute('aria-label')).to.equal('Mốc');

    const wrap = mount('<div><label for="n3">Bắt đầu</label><td-datetime-picker id="n3"></td-datetime-picker></div>');
    const c = wrap.querySelector('td-datetime-picker');
    const lbl = wrap.querySelector('label');
    expect(trig(c).getAttribute('aria-labelledby')).to.equal(lbl.id);
  });

  it('required: aria-required + decorative asterisk, in place', () => {
    const el = pick('id="r1" label="Hạn"');
    const t = trig(el);
    el.setAttribute('required', '');
    expect(same(trig(el), t)).to.equal(true);
    expect(t.getAttribute('aria-required')).to.equal('true');
    expect(el.querySelector('.td-field__required').getAttribute('aria-hidden')).to.equal('true');
    el.removeAttribute('required');
    expect(t.hasAttribute('aria-required')).to.equal(false);
    expect(el.querySelector('.td-field__required')).to.equal(null);
  });

  it('placeholder: data-placeholder + default text; value shown normalised', () => {
    const el = pick('id="ph1"');
    const v = el.querySelector('.td-dtp__value');
    expect(v.hasAttribute('data-placeholder')).to.equal(true);
    expect(v.textContent).to.equal('dd/mm/yyyy - hh:mm');
    el.setAttribute('placeholder', 'Chọn thời điểm');
    expect(v.textContent).to.equal('Chọn thời điểm');
    el.setAttribute('value', '5/6/2026 - 9:05');
    expect(v.hasAttribute('data-placeholder')).to.equal(false);
    expect(v.textContent).to.equal('05/06/2026 - 09:05');
  });
});

describe('batch 4 — td-datetime-picker keyboard open / commit / cancel', () => {
  for (const key of ['Enter', ' ', 'ArrowDown', 'Alt+ArrowDown']) {
    it(`"${key}" on the trigger opens the dialog (focus → day field, aria-expanded, aria-controls)`, async () => {
      const el = pick('id="k1" value="15/06/2026 - 10:30"');
      trig(el).focus();
      await sendKeys({ press: key === ' ' ? 'Space' : key });
      await settle();
      const m = openModal();
      expect(m).to.not.equal(null);
      expect(trig(el).getAttribute('aria-expanded')).to.equal('true');
      expect(trig(el).getAttribute('aria-controls')).to.equal(m.id);
      expect(el.querySelector('.td-dtp').getAttribute('data-state')).to.equal('open');
      expect(same(document.activeElement, field('day'))).to.equal(true);
      expect(m.querySelector('.td-modal__title').textContent).to.equal('Chọn ngày giờ');
    });
  }

  it('Enter on the trigger inside a <form> opens, never submits', async () => {
    const form = mount('<form><td-datetime-picker name="dt"></td-datetime-picker></form>');
    let submitted = 0;
    form.addEventListener('submit', (e) => { e.preventDefault(); submitted++; });
    trig(form.querySelector('td-datetime-picker')).focus();
    await sendKeys({ press: 'Enter' });
    await settle();
    expect(openModal()).to.not.equal(null);
    expect(submitted).to.equal(0);
  });

  it('"Chọn" commits the pending state: one change, value + FormData, focus back on the SAME trigger (bug 1.8.1)', async () => {
    const form = mount('<form><td-datetime-picker id="c1" name="dt" value="15/06/2026 - 10:30"></td-datetime-picker></form>');
    const el = form.querySelector('td-datetime-picker');
    const t = trig(el);
    const events = [];
    el.addEventListener('change', (e) => events.push(e.detail));
    t.focus();
    await sendKeys({ press: 'Enter' });
    await settle();
    await typeInto(field('day'), '20');
    wheel('hour').focus();
    await sendKeys({ press: 'ArrowDown' });
    expect(el.getAttribute('value')).to.equal('15/06/2026 - 10:30'); // pending only
    button('Chọn').click();
    await settle();
    expect(openModal()).to.equal(null);
    expect(events.length).to.equal(1);
    expect(events[0].value).to.equal('20/06/2026 - 11:30');
    expect(events[0].dbValue).to.equal('2026-06-20 11:30:00');
    expect(el.getAttribute('value')).to.equal('20/06/2026 - 11:30');
    expect(el.getValue()).to.equal('20/06/2026 - 11:30');
    expect(new FormData(form).get('dt')).to.equal('2026-06-20T11:30:00');
    expect(same(trig(el), t)).to.equal(true);
    expect(same(document.activeElement, t)).to.equal(true);
    expect(t.getAttribute('aria-expanded')).to.equal('false');
    expect(t.hasAttribute('aria-controls')).to.equal(false);
    expect(el.querySelector('.td-dtp__value').textContent).to.equal('20/06/2026 - 11:30');
  });

  it('keyboard-only commit: Tab to "Chọn" + Enter', async () => {
    const el = pick('id="c2" value="15/06/2026 - 10:30"');
    let n = 0;
    el.addEventListener('change', () => n++);
    trig(el).focus();
    await sendKeys({ press: 'Enter' });
    await settle();
    button('Chọn').focus();
    await sendKeys({ press: 'Enter' });
    await settle();
    expect(n).to.equal(1);
    expect(same(document.activeElement, trig(el))).to.equal(true);
  });

  for (const how of ['Escape', 'Đóng', 'X']) {
    it(`${how} discards the pending state, no change, focus back on the trigger`, async () => {
      const el = pick('id="x1" value="15/06/2026 - 10:30"');
      let n = 0;
      el.addEventListener('change', () => n++);
      trig(el).focus();
      await sendKeys({ press: 'Enter' });
      await settle();
      await typeInto(field('day'), '3');
      wheel('hour').focus();
      await sendKeys({ press: 'End' });
      if (how === 'Escape') await sendKeys({ press: 'Escape' });
      else if (how === 'Đóng') button('Đóng').click();
      else openModal().querySelector('.td-modal__close').click();
      await settle();
      expect(openModal()).to.equal(null);
      expect(n).to.equal(0);
      expect(el.getAttribute('value')).to.equal('15/06/2026 - 10:30');
      expect(same(document.activeElement, trig(el))).to.equal(true);
      expect(trig(el).getAttribute('aria-expanded')).to.equal('false');
      // reopening starts from the committed value again
      await open(el);
      expect(field('day').value).to.equal('15');
      expect(selectedValue(wheel('hour'))).to.equal(10);
    });
  }

  it('"Bây giờ" sets the pending state to now (minute snapped DOWN), keeps the dialog open', async () => {
    const el = pick('id="now1" minute-step="15" value="01/01/2001 - 00:00"');
    await open(el);
    const before = new Date();
    button('Bây giờ').click();
    expect(openModal()).to.not.equal(null);
    expect(Number(field('year').value)).to.equal(before.getFullYear());
    expect(Number(field('month').value)).to.equal(before.getMonth() + 1);
    expect(Number(field('day').value)).to.equal(before.getDate());
    expect(selectedValue(wheel('hour'))).to.equal(before.getHours());
    expect(selectedValue(wheel('minute'))).to.equal(Math.floor(before.getMinutes() / 15) * 15);
    expect(errorLine().hidden).to.equal(true);
  });

  it('a label change while open closes it and keeps focus on the (new) trigger', async () => {
    const el = pick('id="lb1" label="A"');
    trig(el).focus();
    el.setAttribute('label', 'B');
    expect(same(document.activeElement, trig(el))).to.equal(true);
    expect(el.querySelector('.td-field__label').textContent).to.equal('B');
  });
});

describe('batch 4 — td-datetime-picker date fields (D9, bug 1.8.4)', () => {
  it('labelled number fields with inputmode=numeric and min/max', async () => {
    const el = pick('id="f1" value="15/06/2026 - 10:30"');
    await open(el);
    for (const [part, label, lo, hi, v] of [['day', 'Ngày', '1', '31', '15'], ['month', 'Tháng', '1', '12', '6'], ['year', 'Năm', '2000', '2099', '2026']]) {
      const f = field(part);
      expect(f.type).to.equal('number');
      expect(f.getAttribute('inputmode')).to.equal('numeric');
      expect(f.labels[0].textContent).to.equal(label);
      expect(f.min).to.equal(lo);
      expect(f.max).to.equal(hi);
      expect(f.value).to.equal(v);
    }
    expect(panel().querySelector('fieldset > legend').textContent).to.equal('Ngày');
  });

  it('typing a year is not clamped while typing; clamp happens on change', async () => {
    const el = pick('id="f2" value="15/06/2026 - 10:30"');
    await open(el);
    const y = field('year');
    await typeInto(y, '2');
    expect(y.value).to.equal('2'); // not 2000
    expect(y.getAttribute('aria-invalid')).to.equal('true');
    expect(errorLine().hidden).to.equal(false);
    expect(errorLine().textContent).to.equal('Năm phải từ 2000 đến 2099');
    await sendKeys({ type: '027' });
    expect(y.value).to.equal('2027');
    expect(y.hasAttribute('aria-invalid')).to.equal(false);
    expect(errorLine().hidden).to.equal(true);
    await typeInto(y, '3000');
    await sendKeys({ press: 'Tab' }); // change → clamp
    expect(y.value).to.equal('2099');
    const d = field('day');
    await typeInto(d, '0');
    expect(d.value).to.equal('0'); // "05" can be typed
    await sendKeys({ type: '5' });
    expect(d.value).to.equal('05');
    expect(d.hasAttribute('aria-invalid')).to.equal(false);
  });

  it('31/02 → error + aria-invalid on the day field + describedby; "Chọn" keeps the dialog open and focuses it', async () => {
    const el = pick('id="f3" value="15/06/2026 - 10:30"');
    let n = 0;
    el.addEventListener('change', () => n++);
    await open(el);
    await typeInto(field('day'), '31');
    await typeInto(field('month'), '2');
    const err = errorLine();
    expect(err.getAttribute('role')).to.equal('alert');
    expect(err.hidden).to.equal(false);
    expect(err.textContent).to.equal('Ngày không hợp lệ');
    expect(field('day').getAttribute('aria-invalid')).to.equal('true');
    expect(field('day').getAttribute('aria-describedby')).to.equal(err.id);
    button('Chọn').click();
    await settle();
    expect(openModal()).to.not.equal(null);
    expect(n).to.equal(0);
    expect(same(document.activeElement, field('day'))).to.equal(true);
    await typeInto(field('day'), '28');
    expect(err.hidden).to.equal(true);
    expect(field('day').hasAttribute('aria-describedby')).to.equal(false);
    button('Chọn').click();
    expect(n).to.equal(1);
    expect(el.getAttribute('value')).to.equal('28/02/2026 - 10:30');
  });

  it('an empty field → "Vui lòng nhập đầy đủ…" on that field', async () => {
    const el = pick('id="f4" value="15/06/2026 - 10:30"');
    await open(el);
    await typeInto(field('month'), '');
    expect(errorLine().textContent).to.equal('Vui lòng nhập đầy đủ ngày, tháng, năm');
    expect(field('month').getAttribute('aria-invalid')).to.equal('true');
  });
});

describe('batch 4 — td-datetime-picker wheels (listbox model)', () => {
  it('one tab stop per wheel: named listbox, non-focusable options, activedescendant = the selected option', async () => {
    const el = pick('id="w1" value="15/06/2026 - 10:30"');
    await open(el);
    for (const [part, name, count, value] of [['hour', 'Giờ', 24, 10], ['minute', 'Phút', 60, 30]]) {
      const list = wheel(part);
      expect(list.getAttribute('role')).to.equal('listbox');
      expect(list.getAttribute('tabindex')).to.equal('0');
      expect(list.getAttribute('aria-label')).to.equal(name);
      const options = [...list.children];
      expect(options.length).to.equal(count);
      options.forEach((o) => {
        expect(o.getAttribute('role')).to.equal('option');
        expect(o.hasAttribute('tabindex')).to.equal(false);
      });
      expect(list.querySelectorAll('[aria-selected="true"]').length).to.equal(1);
      expect(list.getAttribute('aria-activedescendant')).to.equal(selected(list).id);
      expect(selectedValue(list)).to.equal(value);
    }
    expect(panel().querySelector('.td-dtp-wheel__sep').getAttribute('aria-hidden')).to.equal('true');
    const group = panel().querySelector('[role="group"]');
    expect(document.getElementById(group.getAttribute('aria-labelledby')).textContent).to.equal('Giờ');
    // Tab order: day → month → year → hour → minute
    field('year').focus();
    await sendKeys({ press: 'Tab' });
    expect(same(document.activeElement, wheel('hour'))).to.equal(true);
    await sendKeys({ press: 'Tab' });
    expect(same(document.activeElement, wheel('minute'))).to.equal(true);
  });

  it('↑ ↓ Home End PageUp PageDown move selection + activedescendant together (no wrap)', async () => {
    const el = pick('id="w2" value="15/06/2026 - 10:30"');
    await open(el);
    const h = wheel('hour');
    h.focus();
    const check = (v) => {
      expect(selectedValue(h)).to.equal(v);
      expect(h.querySelectorAll('[aria-selected="true"]').length).to.equal(1);
      expect(h.getAttribute('aria-activedescendant')).to.equal(selected(h).id);
      expect(panel().querySelector('.td-dtp-panel__preview').textContent).to.equal(`15/06/2026 - ${String(v).padStart(2, '0')}:30`);
    };
    await sendKeys({ press: 'ArrowDown' }); check(11);
    await sendKeys({ press: 'ArrowUp' }); check(10);
    await sendKeys({ press: 'PageDown' }); check(16);
    await sendKeys({ press: 'PageUp' }); check(10);
    await sendKeys({ press: 'End' }); check(23);
    await sendKeys({ press: 'ArrowDown' }); check(23);
    await sendKeys({ press: 'Home' }); check(0);
    await sendKeys({ press: 'ArrowUp' }); check(0);
    expect(same(document.activeElement, h)).to.equal(true);
  });

  it('minute wheel follows minute-step; PageDown = 15 minutes', async () => {
    const el = pick('id="w3" minute-step="5" value="15/06/2026 - 10:30"');
    await open(el);
    const m = wheel('minute');
    expect(m.children.length).to.equal(12);
    m.focus();
    await sendKeys({ press: 'PageDown' });
    expect(selectedValue(m)).to.equal(45);
    await sendKeys({ press: 'ArrowDown' });
    expect(selectedValue(m)).to.equal(50);
  });

  it('click selects an option', async () => {
    const el = pick('id="w4" value="15/06/2026 - 10:30"');
    await open(el);
    const h = wheel('hour');
    h.querySelector('[data-value="7"]').click();
    expect(selectedValue(h)).to.equal(7);
    expect(h.getAttribute('aria-activedescendant')).to.equal(h.querySelector('[data-value="7"]').id);
  });

  it('the selected option is centred in the band; scrolling selects the option that settles there', async () => {
    const el = pick('id="w5" value="15/06/2026 - 10:30"');
    await open(el);
    await wait(50);
    const h = wheel('hour');
    const centreOf = (o) => o.offsetTop + o.offsetHeight / 2 - h.scrollTop;
    expect(Math.abs(centreOf(selected(h)) - h.clientHeight / 2)).to.be.below(2);
    const target = h.querySelector('[data-value="14"]');
    const ended = once(h, 'scrollend');
    h.scrollTop = target.offsetTop - (h.clientHeight - target.offsetHeight) / 2;
    expect(await ended).to.equal(true);
    await wait(20);
    expect(selectedValue(h)).to.equal(14);
    expect(h.getAttribute('aria-activedescendant')).to.equal(target.id);
  });

  it('reduced motion: scroll-behavior auto and keyboard moves jump instantly', async () => {
    await emulateMedia({ reducedMotion: 'reduce' });
    const el = pick('id="w6" value="15/06/2026 - 10:30"');
    await open(el);
    const h = wheel('hour');
    expect(getComputedStyle(h).scrollBehavior).to.equal('auto');
    h.focus();
    await sendKeys({ press: 'End' });
    const last = selected(h);
    // instant: already centred synchronously after the key
    expect(Math.abs(last.offsetTop + last.offsetHeight / 2 - h.scrollTop - h.clientHeight / 2)).to.be.below(2);
    expect(getComputedStyle(selected(h)).transform).to.equal('none'); // no scale()
  });

  it('D7: minute-step=5 with 10:02 → wheel AND committed value are 10:00 (bug 1.8.5); 10:58 → 10:55 (no carry)', async () => {
    const el = pick('id="w7" minute-step="5" value="15/06/2026 - 10:02"');
    await open(el);
    expect(selectedValue(wheel('minute'))).to.equal(0);
    expect(panel().querySelector('.td-dtp-panel__preview').textContent).to.equal('15/06/2026 - 10:00');
    button('Chọn').click();
    expect(el.getAttribute('value')).to.equal('15/06/2026 - 10:00');
    await settle();
    el.setAttribute('value', '15/06/2026 - 10:58');
    await open(el);
    expect(selectedValue(wheel('hour'))).to.equal(10);
    expect(selectedValue(wheel('minute'))).to.equal(55);
  });

  it('a scroll settling after the dialog closed never mutates the value (bug 1.8.6)', async () => {
    const el = pick('id="w8" value="15/06/2026 - 10:30"');
    await open(el);
    const h = wheel('hour');
    button('Chọn').click();
    h.scrollTop = 0;
    h.dispatchEvent(new Event('scrollend'));
    h.dispatchEvent(new Event('scroll'));
    await wait(250);
    expect(el.getValue()).to.equal('15/06/2026 - 10:30');
    expect(el.getAttribute('value')).to.equal('15/06/2026 - 10:30');
  });
});

describe('batch 4 — td-datetime-picker values + validity', () => {
  it('getValue()/getDBValue() → "" when empty or malformed (D8, bug 1.8.3)', () => {
    const el = pick();
    expect(el.getValue()).to.equal('');
    expect(el.getDBValue()).to.equal('');
    el.setValue('garbage');
    expect(el.getValue()).to.equal('');
    expect(el.getDBValue()).to.equal('');
    expect(el.querySelector('.td-dtp__value').textContent).to.equal('garbage');
    el.setValue('15/06/2026 - 10:30');
    expect(el.getValue()).to.equal('15/06/2026 - 10:30');
    expect(el.getDBValue()).to.equal('2026-06-15 10:30:00');
  });

  it('hour/minute are validated: 25:99 → badInput, raw string submitted (bug 1.8.2)', () => {
    const form = mount('<form><td-datetime-picker name="dt" value="15/06/2026 - 25:99"></td-datetime-picker></form>');
    const el = form.querySelector('td-datetime-picker');
    expect(el.validity.badInput).to.equal(true);
    expect(el.validationMessage).to.equal('Giờ phải từ 0 đến 23');
    expect(el.getValue()).to.equal('');
    expect(new FormData(form).get('dt')).to.equal('15/06/2026 - 25:99');
    el.setValue('15/06/2026 - 10:60');
    expect(el.validationMessage).to.equal('Phút phải từ 0 đến 59');
  });

  it('setDBValue parses explicitly (no Date string parsing); garbage is ignored (bug 1.8.7)', () => {
    const el = pick('value="01/01/2026 - 00:00"');
    el.setDBValue('2026-06-15 10:30:00');
    expect(el.getAttribute('value')).to.equal('15/06/2026 - 10:30');
    el.setDBValue('2026-07-01T08:05:00');
    expect(el.getAttribute('value')).to.equal('01/07/2026 - 08:05');
    for (const junk of ['garbage', '2026-02-30 10:00:00', '2026-06-15 24:00:00']) {
      el.setDBValue(junk);
      expect(el.getAttribute('value')).to.equal('01/07/2026 - 08:05');
    }
    // v0.19.0 G5: '' / null / undefined clear (like setValue(null)) instead of being ignored
    el.setDBValue('');
    expect(el.getAttribute('value')).to.equal(null);
  });

  it('vi validity messages: valueMissing, badInput format / date / default year range', () => {
    const el = pick('required');
    expect(el.validity.valueMissing).to.equal(true);
    expect(el.validationMessage).to.equal('Vui lòng chọn ngày giờ');
    el.setValue('abc');
    expect(el.validity.badInput).to.equal(true);
    expect(el.validationMessage).to.equal('Định dạng ngày giờ không hợp lệ');
    el.setValue('29/02/2026 - 10:00');
    expect(el.validationMessage).to.equal('Ngày không hợp lệ');
    el.setValue('29/02/2024 - 10:00');
    expect(el.checkValidity()).to.equal(true);
    el.setValue('01/01/1999 - 10:00');
    expect(el.validity.badInput).to.equal(true);
    expect(el.validationMessage).to.equal('Năm phải từ 2000 đến 2099');
  });

  it('form-value-format switches in place (display / db / iso)', () => {
    const form = mount('<form><td-datetime-picker name="dt" value="5/6/2026 - 9:05"></td-datetime-picker></form>');
    const el = form.querySelector('td-datetime-picker');
    expect(new FormData(form).get('dt')).to.equal('2026-06-05T09:05:00');
    el.setAttribute('form-value-format', 'display');
    expect(new FormData(form).get('dt')).to.equal('05/06/2026 - 09:05');
    el.setAttribute('form-value-format', 'db');
    expect(new FormData(form).get('dt')).to.equal('2026-06-05 09:05:00');
  });

  it('min/max (D5): explicit times are exact; rangeUnderflow/rangeOverflow with vi messages', () => {
    const el = pick('min="15/06/2026 - 10:30" max="2026-06-20T18:00" value="15/06/2026 - 10:30"');
    expect(el.checkValidity()).to.equal(true);
    el.setValue('15/06/2026 - 10:29');
    expect(el.validity.rangeUnderflow).to.equal(true);
    expect(el.validationMessage).to.equal('Không được trước 15/06/2026 - 10:30');
    expect(el.getValue()).to.equal(''); // out of min/max is invalid: getters return '' (D8, review ISSUE-1)
    el.setValue('20/06/2026 - 18:00');
    expect(el.checkValidity()).to.equal(true);
    el.setValue('20/06/2026 - 18:01');
    expect(el.validity.rangeOverflow).to.equal(true);
    expect(el.validationMessage).to.equal('Không được sau 20/06/2026 - 18:00');
  });

  it('min/max (D5): a date-only bound expands to 00:00 (min) / 23:59 (max)', () => {
    const el = pick('min="2026-06-15" max="20/06/2026" value="15/06/2026 - 00:00"');
    expect(el.checkValidity()).to.equal(true);
    el.setValue('14/06/2026 - 23:59');
    expect(el.validity.rangeUnderflow).to.equal(true);
    expect(el.validationMessage).to.equal('Không được trước 15/06/2026 - 00:00');
    el.setValue('20/06/2026 - 23:59');
    expect(el.checkValidity()).to.equal(true);
    el.setValue('21/06/2026 - 00:00');
    expect(el.validity.rangeOverflow).to.equal(true);
    expect(el.validationMessage).to.equal('Không được sau 20/06/2026 - 23:59');
    // min/max update in place
    el.setAttribute('max', '2026-06-21');
    expect(el.checkValidity()).to.equal(true);
    // explicit bounds replace the default year range
    el.setAttribute('min', '1990-01-01');
    el.setValue('01/01/1995 - 08:00');
    expect(el.checkValidity()).to.equal(true);
  });

  it('min/max in the dialog: year field range derived, "Chọn" refuses an out-of-range value', async () => {
    const el = pick('id="mm1" min="2026-06-15" max="2027-12-31" value="15/06/2026 - 10:30"');
    let n = 0;
    el.addEventListener('change', () => n++);
    await open(el);
    expect(field('year').min).to.equal('2026');
    expect(field('year').max).to.equal('2027');
    await typeInto(field('day'), '14');
    expect(errorLine().textContent).to.equal('Không được trước 15/06/2026 - 00:00');
    button('Chọn').click();
    await settle();
    expect(openModal()).to.not.equal(null);
    expect(n).to.equal(0);
  });

  it('reset restores the default value; restore state = display string', () => {
    const form = mount('<form><td-datetime-picker name="dt" value="15/06/2026 - 10:30"></td-datetime-picker></form>');
    const el = form.querySelector('td-datetime-picker');
    el.setValue('');
    expect(new FormData(form).get('dt')).to.equal(null);
    form.reset();
    expect(el.getAttribute('value')).to.equal('15/06/2026 - 10:30');
    el.formStateRestoreCallback('01/02/2027 - 03:04', 'restore');
    expect(el.getValue()).to.equal('01/02/2027 - 03:04');
  });
});

describe('batch 4 — td-datetime-picker in place + error contract + lifecycle', () => {
  it('value / placeholder / error-text / required / min / max / minute-step / form-value-format / aria-label keep the trigger and focus', () => {
    const el = pick('id="ip1" label="Hẹn" value="15/06/2026 - 10:30"');
    const t = trig(el);
    t.focus();
    const changes = [['value', '16/06/2026 - 11:00'], ['placeholder', 'x'], ['error-text', 'Sai'], ['required', ''],
      ['min', '2026-01-01'], ['max', '2026-12-31'], ['minute-step', '5'], ['form-value-format', 'db'], ['aria-label', 'y'],
      ['name', 'n']];
    for (const [a, v] of changes) {
      el.setAttribute(a, v);
      expect(same(trig(el), t), a).to.equal(true);
      expect(same(document.activeElement, t), a).to.equal(true);
    }
    el.setValue('');
    el.setDBValue('2026-06-15 10:30:00');
    expect(same(trig(el), t)).to.equal(true);
    expect(same(document.activeElement, t)).to.equal(true);
  });

  it('error contract: setError / error-text → aria-invalid + aria-errormessage + note; cleared by clearError and reset', () => {
    const form = mount('<form><td-datetime-picker id="e1" name="dt" value="15/06/2026 - 10:30"></td-datetime-picker></form>');
    const el = form.querySelector('td-datetime-picker');
    const t = trig(el);
    el.setError('Chọn ngày khác');
    const note = el.querySelector('.td-field-error');
    expect(note.id).to.equal('e1-error');
    expect(note.textContent).to.equal('Chọn ngày khác');
    expect(t.getAttribute('aria-invalid')).to.equal('true');
    expect(t.getAttribute('aria-errormessage')).to.equal('e1-error');
    expect(t.getAttribute('aria-describedby')).to.contain('e1-error');
    expect(getComputedStyle(t).borderTopColor).to.equal(getComputedStyle(note).color);
    el.setValue('16/06/2026 - 10:30'); // survives value changes
    expect(t.getAttribute('aria-invalid')).to.equal('true');
    el.clearError();
    expect(el.querySelector('.td-field-error')).to.equal(null);
    expect(t.hasAttribute('aria-invalid')).to.equal(false);
    el.setAttribute('error-text', 'Bắt buộc');
    expect(el.errorMessage).to.equal('Bắt buộc');
    expect(el.querySelector('.td-field-error').textContent).to.equal('Bắt buộc');
    form.reset();
    expect(el.querySelector('.td-field-error')).to.equal(null);
    expect(el.errorMessage).to.equal('');
  });

  it('disabled: trigger disabled, no open; disabling while open closes; <fieldset disabled> in place', async () => {
    const el = pick('id="d1" disabled');
    expect(trig(el).disabled).to.equal(true);
    trig(el).click();
    await settle();
    expect(openModal()).to.equal(null);
    el.removeAttribute('disabled');
    await open(el);
    expect(openModal()).to.not.equal(null);
    el.setAttribute('disabled', '');
    await settle();
    expect(openModal()).to.equal(null);
    expect(trig(el).getAttribute('aria-expanded')).to.equal('false');

    const fs = mount('<form><fieldset><td-datetime-picker id="d2"></td-datetime-picker></fieldset></form>').querySelector('fieldset');
    const p2 = fs.querySelector('td-datetime-picker');
    const t2 = trig(p2);
    fs.disabled = true;
    await wait(0);
    expect(same(trig(p2), t2)).to.equal(true);
    expect(t2.disabled).to.equal(true);
    fs.disabled = false;
    await wait(0);
    expect(t2.disabled).to.equal(false);
  });

  it('removing the host while open closes the dialog (bug 1.8.8); a move re-binds', async () => {
    const el = pick('id="dc1" value="15/06/2026 - 10:30"');
    await open(el);
    el.remove();
    await settle();
    expect(openModal()).to.equal(null);
    host.appendChild(el);
    await open(el);
    expect(openModal()).to.not.equal(null);
  });

  it('XSS: label / placeholder / value / labels.* render as text', async () => {
    const x = '<img src=x onerror="window.__dtpXss=1">';
    const el = pick('id="xss1"');
    el.setAttribute('label', x);
    el.setAttribute('placeholder', x);
    expect(el.querySelector('img')).to.equal(null);
    expect(el.querySelector('.td-field__label').textContent).to.equal(x);
    expect(el.querySelector('.td-dtp__value').textContent).to.equal(x);
    el.setAttribute('value', x);
    expect(el.querySelector('.td-dtp__value').textContent).to.equal(x);
    TdDatetimePicker.labels.title = x;
    await open(el);
    expect(openModal().querySelector('img')).to.equal(null);
    expect(openModal().querySelector('.td-modal__title').textContent).to.equal(x);
    expect(window.__dtpXss).to.equal(undefined);
  });

  it('dark theme: option text ≥ 4.5:1-ish token colour differs from the selected colour; band visible', async () => {
    document.documentElement.setAttribute('data-td-theme', 'dark');
    try {
      const el = pick('id="dk1" value="15/06/2026 - 10:30"');
      await open(el);
      const h = wheel('hour');
      const off = getComputedStyle(h.querySelector('[aria-selected="false"]')).color;
      const on = getComputedStyle(selected(h)).color;
      expect(off).to.not.equal(on);
      expect(getComputedStyle(h.parentElement, '::before').content).to.equal('""');
    } finally {
      document.documentElement.removeAttribute('data-td-theme');
    }
  });
});
