import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';
import { TdInputField } from './td-input-field.js';
import './td-number-input.js';
import { trackFormDirty } from '../utils/form-dirty.js';

// v0.55.0 (plan docs/internal/plans/v0.55.0-affix-number.md QĐ 1–7, M1) — prefix / suffix (text, icon, page Element in
// [slot]) on <td-input-field> and <td-number-input>, one matrix for both, Chromium / Firefox / WebKit. DOM nodes are
// compared as booleans (`a === b`): a failing chai assertion carrying DOM nodes hangs the runner.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const wait = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const extra = [];
afterEach(() => { extra.splice(0).forEach((f) => f()); });
const WEBKIT = /AppleWebKit/.test(navigator.userAgent) && !/Chrome|Chromium|Firefox/.test(navigator.userAgent);

function mount(html, attrs = '') {
  const wrap = document.createElement('div');
  if (attrs) wrap.setAttribute('dir', attrs);
  wrap.innerHTML = html;
  document.body.appendChild(wrap);
  extra.push(() => wrap.remove());
  return wrap;
}
function captureWarn() {
  const warns = [];
  const orig = console.warn;
  console.warn = (...a) => warns.push(a.map(String).join(' '));
  extra.push(() => { console.warn = orig; });
  return warns;
}
const tokens = (el) => (el?.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);

const KINDS = [
  { tag: 'td-input-field', block: 'td-field', control: 'input.td-field__control', box: '.td-field__box' },
  { tag: 'td-number-input', block: 'td-number', control: 'input.td-number__control', box: '.td-number__box' },
];
const one = (k, attrs = '', inner = '', dir = '') => mount(`<${k.tag} id="a${Math.random().toString(36).slice(2, 8)}" label="Giá" ${attrs}>${inner}</${k.tag}>`, dir).querySelector(k.tag);
const ctl = (k, el) => el.querySelector(k.control);
const boxOf = (k, el) => el.querySelector(k.box);
const affix = (k, el, side) => el.querySelector(`${k.box} > .${k.block}__affix--${side}:not(.${k.block}__affix--slot)`);
const slotWrap = (k, el, side) => el.querySelector(`${k.box} > .${k.block}__affix--slot.${k.block}__affix--${side}`);

describe('v0.55.0 affix — td-input-field without affix renders exactly as v0.54 (byte-identical render())', () => {
  it('text / email + label, value, counter: render() unchanged', () => {
    const a = mount('<td-input-field id="x" label="L" value="v" type="email"></td-input-field>').querySelector('td-input-field');
    expect(a.render()).to.equal('<div class="td-field td-field--md"><label class="td-field__label" id="x-label" for="x-control">L</label>'
      + '<input type="text" class="td-field__control" id="x-control" value="v" inputmode="email">'
      + '<div class="td-field__footer"><div class="td-field__note" id="x-note" hidden></div></div></div>');
    const b = mount('<td-input-field id="y" value="ab" max-length="5" size="sm"></td-input-field>').querySelector('td-input-field');
    expect(b.render()).to.equal('<div class="td-field td-field--sm">'
      + '<input type="text" class="td-field__control" id="y-control" value="ab" maxlength="5">'
      + '<div class="td-field__footer"><div class="td-field__note" id="y-note" hidden></div>'
      + '<div class="td-field__counter" id="y-counter">2/5 ký tự</div></div></div>');
    expect(b.querySelector('.td-field__box')).to.equal(null);
    expect(b.querySelector('.td-field').classList.contains('td-field--affix')).to.equal(false);
  });

  it('td-number-input without icon / slot renders its 0.54 affix markup', () => {
    const el = mount('<td-number-input id="n" prefix="$" suffix="₫" unit-label="đồng"></td-number-input>').querySelector('td-number-input');
    expect(el.render().includes('<div class="td-number__box"><span class="td-number__affix td-number__affix--prefix" aria-hidden="true">$</span>'
      + '<input type="text" class="td-number__control" id="n-control" inputmode="numeric" autocomplete="off" spellcheck="false">'
      + '<span class="td-number__affix td-number__affix--suffix" aria-hidden="true">₫</span><span id="n-unit" hidden>đồng</span></div>'), el.render()).to.equal(true);
  });
});

for (const k of KINDS) {
  describe(`v0.55.0 affix — ${k.tag}`, () => {
    for (const side of ['prefix', 'suffix']) {
      it(`${side} text: decorative span in the box (aria-hidden), the control in the same box, never part of the value`, async () => {
        const form = mount(`<form><${k.tag} name="v" label="Giá" ${side}="https://" value="12"></${k.tag}></form>`).querySelector('form');
        const el = form.querySelector(k.tag);
        const a = affix(k, el, side);
        expect(!!a, 'affix span').to.equal(true);
        expect(a.getAttribute('aria-hidden')).to.equal('true');
        expect(a.textContent).to.equal('https://');
        expect(a.hidden).to.equal(false);
        expect(ctl(k, el).parentElement === boxOf(k, el), 'control in the box').to.equal(true);
        if (k.tag === 'td-input-field') expect(el.querySelector('.td-field').classList.contains('td-field--affix')).to.equal(true);
        const order = [...boxOf(k, el).children].filter((c) => !c.hidden);
        const ci = order.indexOf(ctl(k, el));
        expect(order.indexOf(a) < ci === (side === 'prefix'), 'DOM side').to.equal(true);
        expect(new FormData(form).get('v')).to.equal('12');
        expect([...new FormData(form).keys()]).to.deep.equal(['v']);
      });

      it(`${side} icon: an icon slot inside the affix span (icon on the outer edge), drawn on bind`, async () => {
        const el = one(k, `${side}-icon="search" ${side}="mAh"`);
        const a = affix(k, el, side);
        const icon = a.querySelector(`:scope > .${k.block}__affix-icon[data-td-icon="search"]`);
        expect(!!icon, 'icon slot').to.equal(true);
        expect(icon.getAttribute('data-td-icon-class')).to.equal(`${k.block}__affix-svg`);
        expect(!!icon.querySelector(`svg.${k.block}__affix-svg`), 'svg filled').to.equal(true);
        if (side === 'prefix') expect(a.firstChild === icon, 'icon first in a prefix').to.equal(true);
        else expect(a.lastChild === icon, 'icon last in a suffix').to.equal(true);
        expect(a.textContent).to.equal('mAh');
        const only = one(k, `${side}-icon="lock"`);
        expect(!!affix(k, only, side)?.querySelector('[data-td-icon="lock"] svg'), 'icon-only affix').to.equal(true);
      });

      it(`${side} slot: the page node is moved (same node, not aria-hidden), survives re-renders, wins over the text`, async () => {
        const warns = captureWarn();
        const wrap = mount(`<${k.tag} id="s-${k.block}-${side}" label="Giá" ${side}="đ"><button type="button" slot="${side}" class="pg">Hiện</button></${k.tag}>`);
        const el = wrap.querySelector(k.tag);
        const btn = wrap.querySelector('button.pg');
        const sw = slotWrap(k, el, side);
        expect(!!sw, 'slot wrapper').to.equal(true);
        expect(btn.parentElement === sw, 'the same node in the wrapper').to.equal(true);
        expect(sw.hasAttribute('aria-hidden')).to.equal(false);
        expect(affix(k, el, side).hidden, 'the text of that side is hidden').to.equal(true);
        expect(warns.filter((w) => /slot/.test(w)).length, 'one warning (slot + text)').to.equal(1);
        for (const [n, v] of [['label', 'Giá mới'], ['size', 'lg'], ['label', 'Giá 3']]) {
          el.setAttribute(n, v);
          await wait();
          expect(btn.isConnected && btn.parentElement === slotWrap(k, el, side), `kept after ${n}`).to.equal(true);
        }
        const ci = [...boxOf(k, el).children].indexOf(ctl(k, el));
        const si = [...boxOf(k, el).children].indexOf(slotWrap(k, el, side));
        expect(si < ci === (side === 'prefix'), 'slot on its side of the control').to.equal(true);
      });
    }

    it('a press on the box / the affix focuses the control; a press on a slot button does not (no focus theft)', async () => {
      const el = one(k, 'prefix="$"', '<button type="button" slot="suffix" class="pg">×</button>');
      const c = ctl(k, el);
      const md = (t) => { const ev = new MouseEvent('mousedown', { bubbles: true, cancelable: true }); t.dispatchEvent(ev); return ev; };
      let ev = md(affix(k, el, 'prefix'));
      expect(ev.defaultPrevented).to.equal(true);
      expect(document.activeElement === c, 'control focused').to.equal(true);
      c.blur();
      ev = md(boxOf(k, el));
      expect(document.activeElement === c, 'box press').to.equal(true);
      c.blur();
      const btn = el.querySelector('button.pg');
      ev = md(btn);
      expect(ev.defaultPrevented, 'slot button press not cancelled').to.equal(false);
      expect(document.activeElement === c, 'control NOT focused by the slot button').to.equal(false);
    });

    it('Tab: control → the suffix slot button (DOM order; real Tab where the engine tabs to buttons)', async () => {
      const el = one(k, '', '<button type="button" slot="suffix" class="pg">×</button>');
      const c = ctl(k, el);
      const btn = el.querySelector('button.pg');
      expect(!!(c.compareDocumentPosition(btn) & Node.DOCUMENT_POSITION_FOLLOWING), 'button after the control').to.equal(true);
      if (WEBKIT) return; // WebKit skips buttons on Tab unless the OS "keyboard navigation" setting is on
      c.focus();
      await sendKeys({ press: 'Tab' });
      expect(document.activeElement === btn, 'Tab reaches the slot button').to.equal(true);
    });

    it('description: [page id] [unit] [hint] [counter] [error]; the unit stays with an error; unit-label wins; suffix > prefix', async () => {
      const el = one(k, `prefix="$" suffix="₫" unit-label="đồng" helper-text="Đã gồm VAT"${k.tag === 'td-input-field' ? ' max-length="20"' : ''}`);
      const c = ctl(k, el);
      const id = el.id;
      const unit = document.getElementById(`${id}-unit`);
      expect(!!unit && unit.hidden && unit.textContent === 'đồng', 'unit span').to.equal(true);
      c.setAttribute('aria-describedby', `page-x ${tokens(c).join(' ')}`);
      el.setHelper('Đã gồm VAT');
      const counter = k.tag === 'td-input-field' ? [`${id}-counter`] : [];
      expect(tokens(c)).to.deep.equal(['page-x', `${id}-unit`, `${id}-note`, ...counter]);
      el.setError('Sai');
      expect(tokens(c)).to.deep.equal(['page-x', `${id}-unit`, ...counter, `${id}-error`]);
      el.setError('');
      const s = one(k, 'prefix="https://" suffix=".vn"');
      expect(document.getElementById(`${s.id}-unit`).textContent, 'suffix wins over prefix').to.equal('.vn');
      const p = one(k, 'prefix="https://"');
      expect(document.getElementById(`${p.id}-unit`).textContent).to.equal('https://');
      expect(tokens(ctl(k, p))[0]).to.equal(`${p.id}-unit`);
    });

    it('changing prefix / suffix / icons / unit-label at run time keeps the focus, the caret and the value (no change event)', async () => {
      const el = one(k, 'suffix="a" value="1234"');
      const c = ctl(k, el);
      const changes = [];
      el.addEventListener('change', () => changes.push(1));
      c.focus();
      c.setSelectionRange(1, 1);
      await sendKeys({ type: '9' });
      const shown = c.value;
      const caret = c.selectionStart;
      for (const [n, v] of [['prefix', '$'], ['suffix', 'b'], ['prefix-icon', 'search'], ['suffix-icon', 'lock'], ['unit-label', 'x']]) {
        el.setAttribute(n, v);
        await wait();
        const now = ctl(k, el);
        expect(document.activeElement === now, `focus kept after ${n}`).to.equal(true);
        expect(now.value).to.equal(shown);
        expect(now.selectionStart).to.equal(caret);
      }
      expect(changes.length, 'no change while focused').to.equal(0);
      ctl(k, el).blur();
      expect(changes.length, 'one change on blur (vs the value at focus)').to.equal(1);
    });

    it('RTL: the prefix sits on the right edge, nothing overlaps the control', async () => {
      const el = one(k, 'prefix="https://" suffix="mAh" style-probe', '', 'rtl');
      await wait(20);
      const c = ctl(k, el).getBoundingClientRect();
      const p = affix(k, el, 'prefix').getBoundingClientRect();
      const s = affix(k, el, 'suffix').getBoundingClientRect();
      expect(p.left >= c.right - 0.5, `prefix right of the control (${p.left} ≥ ${c.right})`).to.equal(true);
      expect(s.right <= c.left + 0.5, `suffix left of the control (${s.right} ≤ ${c.left})`).to.equal(true);
    });

    it('trackFormDirty: affix / slot changes are never dirty; typing is', async () => {
      const form = mount(`<form><${k.tag} name="v" label="Giá" value="1"><button type="button" slot="suffix">×</button></${k.tag}></form>`).querySelector('form');
      const el = form.querySelector(k.tag);
      const t = trackFormDirty(form);
      extra.push(() => t.destroy?.());
      el.setAttribute('prefix', '$');
      el.setAttribute('suffix-icon', 'search');
      await wait();
      expect(t.isDirty()).to.equal(false);
      const c = ctl(k, el);
      c.focus();
      c.setSelectionRange(c.value.length, c.value.length);
      await sendKeys({ type: '2' });
      await wait();
      expect(t.isDirty()).to.equal(true);
    });
  });
}

describe('v0.55.0 affix — td-input-field types (QĐ 1)', () => {
  for (const type of ['text', 'search', 'email', 'url', 'tel', 'password', 'number']) {
    it(`${type}: affix rendered`, () => {
      const el = mount(`<td-input-field type="${type}" prefix="@"></td-input-field>`).querySelector('td-input-field');
      expect(!!el.querySelector('.td-field__box > .td-field__affix--prefix')).to.equal(true);
    });
  }
  for (const type of ['textarea', 'contenteditable', 'date', 'month', 'datetime-local', 'time']) {
    it(`${type}: affix dropped + one warning, the 0.54 markup`, () => {
      const warns = captureWarn();
      const el = mount(`<td-input-field id="u-${type}" type="${type}" prefix="@" suffix-icon="search"></td-input-field>`).querySelector('td-input-field');
      expect(el.querySelector('.td-field__box')).to.equal(null);
      expect(el.querySelector('.td-field').classList.contains('td-field--affix')).to.equal(false);
      expect(warns.filter((w) => /affix|prefix|suffix/.test(w)).length).to.equal(1);
      el.setAttribute('label', 'x');
      expect(warns.filter((w) => /affix|prefix|suffix/.test(w)).length, 'warned once').to.equal(1);
    });
  }

  it('a [slot] child added AFTER the first render is not adopted (documented) and warns once on the next render', () => {
    const warns = captureWarn();
    const el = mount('<td-input-field label="A"></td-input-field>').querySelector('td-input-field');
    const late = document.createElement('button');
    late.setAttribute('slot', 'suffix');
    el.appendChild(late);
    el.setAttribute('label', 'B');
    expect(el.querySelector('.td-field__box')).to.equal(null);
    expect(warns.filter((w) => /slot/.test(w)).length).to.equal(1);
    expect(TdInputField.observedAttributes.includes('prefix-icon')).to.equal(true);
  });
});

describe('v0.55.0 (release lead A) — --td-field-note-size drives every helper note', () => {
  it('default: the footer note, the block note and <td-hint> keep --td-text-xs (= the footer size)', async () => {
    const wrap = mount('<td-input-field label="A" helper-text="Gợi ý"></td-input-field>'
      + '<td-dropdown label="B" helper-text="Gợi ý"></td-dropdown>'
      + '<label for="x">X</label><input id="x"><td-hint for="x">Gợi ý <b>giàu</b></td-hint>');
    await import('./td-dropdown.js');
    await import('./td-hint.js');
    await wait(20);
    const xs = getComputedStyle(document.documentElement).getPropertyValue('--td-text-xs').trim();
    const px = (el) => getComputedStyle(el).fontSize;
    const probe = document.createElement('div');
    probe.style.setProperty('font-size', xs);
    wrap.appendChild(probe);
    const want = px(probe);
    expect(px(wrap.querySelector('td-input-field .td-field__note'))).to.equal(want);
    expect(px(wrap.querySelector('td-input-field .td-field__footer'))).to.equal(want);
    expect(px(wrap.querySelector('td-dropdown .td-field__note'))).to.equal(want);
    expect(px(wrap.querySelector('td-hint'))).to.equal(want);
  });

  it('a site value (0.875rem) reaches every note and the error (v0.57.1) but NOT the counter; 360 px: the counter keeps its column, nothing overflows', async () => {
    const wrap = mount('<div class="np"><td-input-field label="Mô tả" max-length="120" value="abc" '
      + 'helper-text="Một gợi ý khá dài để xuống dòng trong cột ghi chú khi chữ gợi ý to 14 px trên màn hình hẹp 360"></td-input-field>'
      + '<td-number-input label="Giá" helper-text="Đã gồm VAT" error-text="Sai"></td-number-input></div>');
    const np = wrap.querySelector('.np');
    np.style.setProperty('width', '360px');
    np.style.setProperty('--td-field-note-size', '0.875rem');
    await wait(20);
    const f = np.querySelector('td-input-field');
    const note = f.querySelector('.td-field__note');
    const counter = f.querySelector('.td-field__counter');
    const footer = f.querySelector('.td-field__footer');
    expect(getComputedStyle(note).fontSize).to.equal('14px');
    expect(getComputedStyle(counter).fontSize, 'counter keeps the footer size').to.not.equal('14px');
    const n = note.getBoundingClientRect();
    const c = counter.getBoundingClientRect();
    expect(Math.abs(n.top - c.top) <= 1, 'same first row').to.equal(true);
    expect(n.right <= c.left + 0.5, `note left of the counter (${n.right} ≤ ${c.left})`).to.equal(true);
    expect(n.height > c.height, 'the note wraps in its own column').to.equal(true);
    expect(footer.scrollWidth <= footer.clientWidth + 1, 'no horizontal overflow').to.equal(true);
    const err = np.querySelector('td-number-input .td-field-error');
    // v0.57.1: the error follows the note size (--td-field-error-size unset → --td-field-note-size)
    expect(getComputedStyle(err).fontSize, 'the error follows the note size').to.equal('14px');
  });
});

describe('v0.55.0 affix — robustness', () => {
  for (const tag of ['td-input-field', 'td-number-input']) {
    it(`${tag}: a focused slot button keeps the focus through a structural re-render`, async () => {
      const wrap = mount(`<${tag} label="A"><button type="button" slot="suffix" class="pg">×</button></${tag}>`);
      const el = wrap.querySelector(tag);
      const btn = wrap.querySelector('button.pg');
      btn.focus();
      el.setAttribute('label', 'B');
      el.setAttribute('size', 'lg');
      await wait();
      expect(btn.isConnected && document.activeElement === btn, 'focus kept on the slot button').to.equal(true);
    });
  }

  it('two very long affixes in a 200 px column shrink with an ellipsis; the box never overflows, the control keeps ≥ 4ch', async () => {
    const wrap = mount('<div class="lc"><td-input-field label="X" prefix="https://www.mot-ten-mien-rat-rat-dai.example/" '
      + 'suffix="/mot-duong-dan-cung-rat-dai/index.html" value="a"></td-input-field></div>');
    wrap.querySelector('.lc').style.setProperty('width', '200px');
    await wait(20);
    const el = wrap.querySelector('td-input-field');
    const host = el.getBoundingClientRect();
    const box = el.querySelector('.td-field__box').getBoundingClientRect();
    const ctl = el.querySelector('.td-field__control');
    expect(box.right <= host.right + 0.5, `box ${box.right} ≤ host ${host.right}`).to.equal(true);
    expect(ctl.getBoundingClientRect().width >= parseFloat(getComputedStyle(ctl).minWidth) - 0.5, 'control ≥ 4ch').to.equal(true);
    for (const side of ['prefix', 'suffix']) {
      const a = el.querySelector(`.td-field__affix--${side}`);
      expect(a.scrollWidth > a.clientWidth, `${side} cut`).to.equal(true);
    }
  });
});

// Codex security r1 SEC-01 — SSR markup is modifiable before the module loads (security-model.md): slot children on a
// server-rendered host (`data-td-ssr`) are never adopted (PHP never prints them, Q4) — they fail the hydration gate and are
// dropped by the safe render; a mutated / foreign slot wrapper never survives a re-connect. FormData = the field only.
/** what php/td.php element mode prints for a minimal host: render() + the no-JS name (+ number value) on the control */
function ssrMarkup(tag, id, name, value, extraChild = '') {
  const proto = document.createElement(tag); // defined: constructed, never connected
  proto.id = id;
  proto.setAttribute('name', name);
  proto.setAttribute('value', value);
  const add = tag === 'td-number-input' ? ` name="${name}" value="${value}"` : ` name="${name}"`;
  const inner = proto.render().replace(/(<input [^>]*class="td-(?:field|number)__control"[^>]*?)>/, `$1${add}>`);
  return `<${tag} data-td-ssr="${tag.slice(3)}@1" id="${id}" name="${name}" value="${value}">${extraChild}${inner}</${tag}>`;
}
const entries = (form) => [...new FormData(form)].map(([k, v]) => [k, String(v)]);

for (const k of KINDS) {
  describe(`v0.55.0 SEC-01 — ${k.tag}: slot children never bypass the SSR gate`, () => {
    let n = 0;
    const sid = () => `sec-${k.block}-${++n}`;

    it('control: the same SSR markup WITHOUT slot children is adopted in place', () => {
      const id = sid();
      const form = mount(`<form>${ssrMarkup(k.tag, id, 'f', '5')}</form>`).querySelector('form');
      const el = form.querySelector(k.tag);
      expect(el._hydrated === true, 'hydrated').to.equal(true);
      expect(entries(form)).to.deep.equal([['f', '5']]);
    });

    const INJECTED = [
      ['a hidden input', '<input slot="prefix" type="hidden" name="role" value="admin">'],
      ['a submit button with formaction', '<button slot="suffix" type="submit" name="go" value="1" formaction="/evil">x</button>'],
      ['a slot child with unexpected attributes / elements', '<span slot="prefix" style="color:red" data-x="1"><textarea name="z">t</textarea><select name="s"><option selected>o</option></select></span>'],
    ];
    for (const [what, child] of INJECTED) {
      it(`SSR host + ${what} in a [slot] → not adopted, dropped; FormData = the field only`, async () => {
        const warns = captureWarn();
        const id = sid();
        const form = mount(`<form>${ssrMarkup(k.tag, id, 'f', '5', child)}</form>`).querySelector('form');
        const el = form.querySelector(k.tag);
        await wait();
        expect(el._hydrated === true, 'never adopted with a slot child').to.equal(false);
        expect(entries(form)).to.deep.equal([['f', '5']]);
        expect(form.querySelectorAll('[slot], [formaction], textarea, select, input[type="hidden"]').length, 'injected nodes dropped').to.equal(0);
        expect(!!el.querySelector(`.${k.block}__affix--slot`), 'no slot wrapper').to.equal(false);
        expect(warns.filter((w) => /server-rendered/.test(w)).length).to.equal(1);
      });
    }

    it('non-SSR host: a slot wrapper mutated (extra attribute + a foreign input) before disconnect + reconnect → a fresh wrapper with the page node only', async () => {
      const form = mount(`<form><${k.tag} name="v" value="1"><button type="button" slot="suffix" class="pg">×</button></${k.tag}></form>`).querySelector('form');
      const el = form.querySelector(k.tag);
      const btn = form.querySelector('button.pg');
      const w = slotWrap(k, el, 'suffix');
      w.setAttribute('data-x', '1');
      const evil = Object.assign(document.createElement('input'), { type: 'hidden', name: 'evil', value: '1' });
      w.appendChild(evil);
      el.remove();
      form.append(el);
      await wait();
      const now = slotWrap(k, el, 'suffix');
      expect(!!now && now !== w && !now.hasAttribute('data-x'), 'fresh wrapper').to.equal(true);
      expect(btn.parentElement === now, 'the page node kept').to.equal(true);
      expect(evil.isConnected, 'the foreign node dropped').to.equal(false);
      expect(entries(form)).to.deep.equal([['v', '1']]);
    });

    it('non-SSR host: the page node swapped for a foreign one inside the wrapper → dropped on re-connect', async () => {
      const form = mount(`<form><${k.tag} name="v" value="1"><button type="button" slot="prefix" class="pg">?</button></${k.tag}></form>`).querySelector('form');
      const el = form.querySelector(k.tag);
      const btn = form.querySelector('button.pg');
      const evil = Object.assign(document.createElement('button'), { type: 'submit', name: 'evil', value: '1' });
      evil.setAttribute('formaction', '/evil');
      btn.replaceWith(evil);
      el.remove();
      form.append(el);
      await wait();
      expect(evil.isConnected).to.equal(false);
      expect(btn.parentElement === slotWrap(k, el, 'prefix')).to.equal(true);
      expect(form.querySelectorAll('[formaction]').length).to.equal(0);
      expect(entries(form)).to.deep.equal([['v', '1']]);
    });

    it('hydrated host: a foreign slot-like wrapper added to the box before disconnect + reconnect → safe re-render, dropped', async () => {
      const id = sid();
      const form = mount(`<form>${ssrMarkup(k.tag, id, 'f', '5')}</form>`).querySelector('form');
      const el = form.querySelector(k.tag);
      expect(el._hydrated === true).to.equal(true);
      const fake = document.createElement('span');
      fake.className = `${k.block}__affix ${k.block}__affix--suffix ${k.block}__affix--slot`;
      fake.innerHTML = '<input type="hidden" name="role" value="admin">';
      ctl(k, el).after(fake);
      el.remove();
      form.append(el);
      await wait();
      expect(fake.isConnected, 'the foreign wrapper never survives the re-connect').to.equal(false);
      expect(entries(form)).to.deep.equal([['f', '5']]);
    });
  });
}

// Codex impl r2: a <td-hint slot="prefix|suffix"> on an SSR host is a slot child, not a hint — it never bypasses the gate
for (const k of KINDS) {
  describe(`v0.55.0 Codex impl r2 — ${k.tag}: a slotted <td-hint> on an SSR host goes through the gate`, () => {
    let n = 0;
    const sid = () => `hint-${k.block}-${++n}`;
    const CHILDREN = [
      ['a nested hidden input', '<td-hint slot="prefix">Gợi ý <input type="hidden" name="role" value="admin"></td-hint>'],
      ['a nested submit button with formaction', '<td-hint slot="suffix"><button type="submit" name="go" value="1" formaction="/evil">x</button></td-hint>'],
    ];
    for (const [what, child] of CHILDREN) {
      it(`slotted <td-hint> with ${what} → not adopted, dropped; FormData = the field only`, async () => {
        captureWarn();
        const form = mount(`<form>${ssrMarkup(k.tag, sid(), 'f', '5', child)}</form>`).querySelector('form');
        const el = form.querySelector(k.tag);
        await wait();
        expect(el._hydrated === true, 'never adopted').to.equal(false);
        expect(entries(form)).to.deep.equal([['f', '5']]);
        expect(form.querySelectorAll('td-hint, [formaction], input[type="hidden"]').length, 'dropped').to.equal(0);
      });
    }

    it('non-SSR host: a normal <td-hint> child is still the control\'s hint (v0.54)', async () => {
      const form = mount(`<form><${k.tag} name="v" value="1" suffix="đ"><td-hint>Xem <a href="#p">bảng phí</a></td-hint></${k.tag}></form>`).querySelector('form');
      const el = form.querySelector(k.tag);
      await wait();
      const hint = el.querySelector('td-hint');
      expect(!!hint && !!hint.closest('.td-field__footer'), 'mounted in the footer').to.equal(true);
      expect(tokens(ctl(k, el)).includes(hint.id), 'in the description').to.equal(true);
      expect(entries(form)).to.deep.equal([['v', '1']]);
    });
  });
}
