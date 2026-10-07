import { expect } from '@esm-bundle/chai';
import { sendKeys, sendMouse, resetMouse } from '@web/test-runner-commands';
import './td-input-field.js';
import { trackFormDirty } from '../utils/form-dirty.js';

// v0.58.0 (plan docs/internal/plans/v0.58.0-floating-label.md QĐ 2–12 + M0 F1, M1) — `label-mode="floating"` on
// <td-input-field>, Chromium / Firefox / WebKit. The floated / resting state is pure CSS (`:placeholder-shown`, `:focus`,
// `:autofill`, `.td-field--always-float`): the tests read the label's computed transform with the transition switched off
// (`--td-dur-fast: 0s` on the mount). DOM nodes are compared as booleans (`a === b`): a failing chai assertion carrying
// DOM nodes hangs the runner.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const wait = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
const extra = [];
afterEach(async () => {
  extra.splice(0).forEach((f) => f());
  await resetMouse();
});

function mount(html, dir = '') {
  const wrap = document.createElement('div');
  wrap.style.setProperty('--td-dur-fast', '0s'); // no transition: the computed transform is the end state
  wrap.style.width = '360px';
  if (dir) wrap.setAttribute('dir', dir);
  wrap.innerHTML = html;
  document.body.prepend(wrap);
  extra.push(() => wrap.remove());
  return wrap;
}
let seq = 0;
const one = (attrs = '', inner = '', dir = '') => mount(`<td-input-field id="fl${++seq}" label="Họ tên" label-mode="floating" ${attrs}>${inner}</td-input-field>`, dir)
  .querySelector('td-input-field');
function captureWarn() {
  const warns = [];
  const orig = console.warn;
  console.warn = (...a) => warns.push(a.map(String).join(' '));
  extra.push(() => { console.warn = orig; });
  return warns;
}
const rootOf = (el) => el.querySelector(':scope > .td-field');
const ctl = (el) => el.querySelector('.td-field__control');
const labelOf = (el) => el.querySelector(':scope > .td-field > .td-field__label');
const floated = (el) => getComputedStyle(labelOf(el)).transform !== 'none';
const scaleOf = (el) => {
  const t = getComputedStyle(labelOf(el)).transform;
  const m = /^matrix\(([^,]+),/.exec(t);
  return m ? Number(m[1]) : 1;
};
const tokens = (el) => (el?.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);

const ALL_TYPES = ['text', 'search', 'email', 'url', 'tel', 'password', 'number', 'date', 'month', 'datetime-local', 'time', 'textarea'];
const AFFIX_TYPES = ['text', 'search', 'email', 'url', 'tel', 'password', 'number'];
const DATE_TYPES = ['date', 'month', 'datetime-local', 'time'];
const SIZES = ['sm', 'md', 'lg'];

describe('v0.58.0 floating — top mode unchanged (byte-identical render())', () => {
  it('no label-mode / top / unknown value → the v0.57.1 string', () => {
    const want = '<div class="td-field td-field--md"><label class="td-field__label" id="x-label" for="x-control">L</label>'
      + '<input type="text" class="td-field__control" id="x-control" value="v" inputmode="email">'
      + '<div class="td-field__footer"><div class="td-field__note" id="x-note" hidden></div></div></div>';
    for (const mode of [null, 'top', 'Floating', 'outlined', '']) {
      const attr = mode == null ? '' : ` label-mode="${mode}"`;
      const w = mount(`<td-input-field id="x" label="L" value="v" type="email"${attr}></td-input-field>`);
      const el = w.querySelector('td-input-field');
      expect(el.render(), String(mode)).to.equal(want);
      expect(ctl(el).hasAttribute('placeholder'), `${mode}: no placeholder`).to.equal(false);
      w.remove();
    }
  });

  it('labelMode property reflects the attribute', () => {
    const el = one();
    expect(el.labelMode).to.equal('floating');
    el.labelMode = 'top';
    expect(el.getAttribute('label-mode')).to.equal('top');
    expect(rootOf(el).classList.contains('td-field--floating')).to.equal(false);
    el.labelMode = 'floating';
    expect(rootOf(el).classList.contains('td-field--floating')).to.equal(true);
  });
});

describe('v0.58.0 floating — DOM matrix (Codex plan r1 #2)', () => {
  for (const type of ALL_TYPES) {
    for (const size of SIZES) {
      it(`(a) ${type} / ${size} without affix: control (or box) BEFORE the real <label for>, root classes`, () => {
        const el = one(`type="${type}" size="${size}"`);
        const root = rootOf(el);
        const kids = [...root.children];
        const c = ctl(el);
        const l = labelOf(el);
        expect(kids[0] === c, 'control first').to.equal(true);
        expect(kids[1] === l, 'label second').to.equal(true);
        expect(kids[2].classList.contains('td-field__footer')).to.equal(true);
        expect(l.localName).to.equal('label');
        expect(l.getAttribute('for')).to.equal(c.id);
        expect(l.id).to.equal(`${el.id}-label`);
        expect(l.hasAttribute('aria-hidden')).to.equal(false);
        expect(root.classList.contains('td-field--floating')).to.equal(true);
        expect(root.classList.contains(`td-field--${size}`)).to.equal(true);
        expect(root.classList.contains('td-field--always-float'), 'always-float iff date-family').to.equal(DATE_TYPES.includes(type));
        // M0 → F1: no real placeholder → the label text, always hidden (td-field--ph-label)
        expect(c.getAttribute('placeholder')).to.equal('Họ tên');
        expect(root.classList.contains('td-field--ph-label')).to.equal(true);
        expect(root.querySelectorAll('.td-field__label').length).to.equal(1);
      });
    }
  }

  for (const type of AFFIX_TYPES) {
    for (const [name, attrs, inner] of [
      ['prefix text', 'prefix="https://"', ''],
      ['suffix text', 'suffix="mAh"', ''],
      ['prefix icon', 'prefix-icon="search"', ''],
      ['suffix slot', '', '<button type="button" slot="suffix">Xoá</button>'],
    ]) {
      it(`(b) ${type} + ${name}: box first, label after the box, always floated`, async () => {
        const el = one(`type="${type}" ${attrs}`, inner);
        await frame();
        const root = rootOf(el);
        const box = root.querySelector(':scope > .td-field__box');
        expect(!!box, 'box').to.equal(true);
        expect(root.children[0] === box).to.equal(true);
        expect(root.children[1] === labelOf(el)).to.equal(true);
        expect(root.classList.contains('td-field--affix')).to.equal(true);
        expect(root.classList.contains('td-field--always-float')).to.equal(true);
        expect(floated(el), 'floated while empty').to.equal(true);
      });
    }
  }

  for (const type of [...DATE_TYPES, 'textarea']) {
    it(`(c) ${type} + prefix: affix ignored with ONE warning (v0.55 behaviour), floating DOM without a box`, () => {
      const warns = captureWarn();
      const el = one(`type="${type}" prefix="x"`);
      el.setAttribute('size', 'lg'); // re-render: no second warning
      const root = rootOf(el);
      expect(root.querySelector('.td-field__box')).to.equal(null);
      expect(root.classList.contains('td-field--affix')).to.equal(false);
      expect(root.classList.contains('td-field--floating')).to.equal(true);
      expect(root.classList.contains('td-field--always-float')).to.equal(DATE_TYPES.includes(type));
      expect(warns.filter((w) => w.includes('not supported')).length).to.equal(1);
    });
  }

  it('(d) no label → top (no class, no placeholder); contenteditable → top + one warning', () => {
    const el = mount('<td-input-field id="nl" label-mode="floating" aria-label="Tìm"></td-input-field>').querySelector('td-input-field');
    expect(rootOf(el).classList.contains('td-field--floating')).to.equal(false);
    expect(ctl(el).hasAttribute('placeholder')).to.equal(false);
    const warns = captureWarn();
    const ce = mount('<td-input-field id="ce" label="Ghi chú" label-mode="floating" type="contenteditable"></td-input-field>').querySelector('td-input-field');
    ce.setAttribute('size', 'sm');
    expect(rootOf(ce).classList.contains('td-field--floating')).to.equal(false);
    expect(rootOf(ce).firstElementChild.localName).to.equal('label');
    expect(warns.filter((w) => w.includes('label-mode')).length).to.equal(1);
  });
});

describe('v0.58.0 floating — state from every value source (pure CSS)', () => {
  it('empty → resting; focus → floated; blur empty → resting', async () => {
    const el = one();
    expect(floated(el)).to.equal(false);
    ctl(el).focus();
    expect(floated(el)).to.equal(true);
    ctl(el).blur();
    expect(floated(el)).to.equal(false);
  });

  it('typed then blurred → floated; scale = --td-field-float-scale (0.857)', async () => {
    const el = one();
    ctl(el).focus();
    await sendKeys({ type: 'An' });
    ctl(el).blur();
    expect(floated(el)).to.equal(true);
    expect(Math.abs(scaleOf(el) - 0.857) < 0.001, String(scaleOf(el))).to.equal(true);
  });

  it('value attribute (SSR value) → floated at once', () => {
    const el = one('value="Bình"');
    expect(floated(el)).to.equal(true);
  });

  it('setValue / value property / control.value (no event) → floated; setValue("") → resting', () => {
    const el = one();
    el.setValue('x');
    expect(floated(el)).to.equal(true);
    el.setValue('');
    expect(floated(el)).to.equal(false);
    el.value = 'y';
    expect(floated(el)).to.equal(true);
    el.value = '';
    ctl(el).value = 'z'; // a script writing the control directly
    expect(floated(el)).to.equal(true);
  });

  it('form.reset() → back to the default (empty → resting, value attr → floated)', async () => {
    const w = mount('<form><td-input-field id="r1" name="a" label="A" label-mode="floating"></td-input-field>'
      + '<td-input-field id="r2" name="b" label="B" label-mode="floating" value="v"></td-input-field></form>');
    const [a, b] = w.querySelectorAll('td-input-field');
    a.setValue('typed');
    b.setValue('');
    expect(floated(a)).to.equal(true);
    expect(floated(b)).to.equal(false);
    w.querySelector('form').reset();
    await wait(10);
    expect(floated(a)).to.equal(false);
    expect(floated(b)).to.equal(true);
  });

  it('autofill rules exist and are valid in this engine (:autofill / :-webkit-autofill + label)', () => {
    const rules = [];
    const walk = (list) => {
      for (const r of list) {
        if (r.cssRules) walk(r.cssRules);
        if (r.selectorText && /autofill/.test(r.selectorText) && r.selectorText.includes('td-field--floating')) rules.push(r.selectorText);
      }
    };
    walk(link.sheet.cssRules);
    expect(rules.some((s) => s.includes(':autofill')), rules.join(' | ')).to.equal(true);
    expect(rules.some((s) => s.includes(':-webkit-autofill')), rules.join(' | ')).to.equal(true);
  });

  it('date-family: always floated (native UI shows dd/mm/yyyy)', () => {
    for (const t of DATE_TYPES) expect(floated(one(`type="${t}"`)), t).to.equal(true);
  });
});

describe('v0.58.0 floating — placeholder (QĐ 4 + M0 F1)', () => {
  const phOpacity = (el) => getComputedStyle(ctl(el), '::placeholder').opacity;
  it('real placeholder: on the control, hidden while resting, shown on focus; no ph-label class', () => {
    const el = one('placeholder="vd: An"');
    expect(ctl(el).getAttribute('placeholder')).to.equal('vd: An');
    expect(rootOf(el).classList.contains('td-field--ph-label')).to.equal(false);
    expect(phOpacity(el)).to.equal('0');
    ctl(el).focus();
    expect(phOpacity(el)).to.equal('1');
  });

  it('no real placeholder: placeholder = label text, ALWAYS hidden (also focused)', () => {
    const el = one();
    ctl(el).focus();
    expect(phOpacity(el)).to.equal('0');
  });

  it('placeholder added / removed at runtime: in place (same control), class follows', () => {
    const el = one();
    const c = ctl(el);
    el.setAttribute('placeholder', 'vd');
    expect(ctl(el) === c, 'same node').to.equal(true);
    expect(c.getAttribute('placeholder')).to.equal('vd');
    expect(rootOf(el).classList.contains('td-field--ph-label')).to.equal(false);
    el.removeAttribute('placeholder');
    expect(c.getAttribute('placeholder')).to.equal('Họ tên');
    expect(rootOf(el).classList.contains('td-field--ph-label')).to.equal(true);
  });

  it('always-float (affix): the real placeholder shows while empty', () => {
    const el = one('prefix="$" placeholder="0"');
    expect(phOpacity(el)).to.equal('1');
  });
});

describe('v0.58.0 floating — runtime switch, property, a11y wiring', () => {
  it('top ↔ floating keeps focus, caret, value and the focus baseline (one change on blur)', async () => {
    const el = mount('<td-input-field id="sw" label="Tên" value="abc"></td-input-field>').querySelector('td-input-field');
    const changes = [];
    el.addEventListener('change', (e) => changes.push(e.detail.value));
    ctl(el).focus();
    ctl(el).setSelectionRange(1, 1);
    el.setAttribute('label-mode', 'floating');
    expect(document.activeElement === ctl(el), 'focus kept').to.equal(true);
    expect(ctl(el).selectionStart).to.equal(1);
    expect(rootOf(el).classList.contains('td-field--floating')).to.equal(true);
    el.labelMode = 'top';
    expect(document.activeElement === ctl(el)).to.equal(true);
    ctl(el).blur();
    expect(changes).to.deep.equal([]);
  });

  it('required star in the label; describedby identical to top mode (helper, counter, error)', () => {
    const attrs = 'required helper-text="Gợi ý" max-length="10"';
    const top = mount(`<td-input-field id="dt" label="A" ${attrs}></td-input-field>`).querySelector('td-input-field');
    const fl = mount(`<td-input-field id="df" label="A" label-mode="floating" ${attrs}></td-input-field>`).querySelector('td-input-field');
    expect(!!labelOf(fl).querySelector('.td-field__required')).to.equal(true);
    expect(tokens(ctl(fl)).map((t) => t.replace('df', 'X'))).to.deep.equal(tokens(ctl(top)).map((t) => t.replace('dt', 'X')));
    top.setError('Sai');
    fl.setError('Sai');
    expect(tokens(ctl(fl)).map((t) => t.replace('df', 'X'))).to.deep.equal(tokens(ctl(top)).map((t) => t.replace('dt', 'X')));
    // QĐ / Q5: the label does not turn red on error
    expect(getComputedStyle(labelOf(fl)).color).to.not.equal(getComputedStyle(fl.querySelector('.td-field-error')).color);
  });

  it('FormData unchanged (placeholder is not a value); trackFormDirty stays clean on focus / blur', () => {
    const w = mount('<form><td-input-field name="n" label="N" label-mode="floating"></td-input-field></form>');
    const form = w.querySelector('form');
    const tracker = trackFormDirty(form);
    const el = w.querySelector('td-input-field');
    ctl(el).focus();
    ctl(el).blur();
    expect(new FormData(form).get('n')).to.equal('');
    expect(tracker.isDirty()).to.equal(false);
    tracker.destroy?.();
  });
});

describe('v0.58.0 floating — geometry + hit box (QĐ 6, 6b, 6c — Codex plan r1 #3, r2 #5)', () => {
  const rect = (n) => n.getBoundingClientRect();
  /** top of the value line: control (or box) top + border-top + padding-top */
  function valueLine(el) {
    const box = el.querySelector('.td-field__box') || ctl(el);
    const cs = getComputedStyle(box);
    const r = rect(box);
    const top = r.top + parseFloat(cs.borderTopWidth) + parseFloat(cs.paddingTop);
    const bottom = r.bottom - parseFloat(cs.borderBottomWidth) - parseFloat(cs.paddingBottom);
    const left = r.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft);
    const right = r.right - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingRight);
    return { top, bottom, left, right };
  }
  const CASES = [
    ...SIZES.map((s) => [`input ${s}`, `size="${s}" value="Nguyễn Văn An"`, '']),
    ['textarea md', 'type="textarea" value="Dòng một"', ''],
    ['textarea lg', 'type="textarea" size="lg" value="Dòng một"', ''],
    ['prefix', 'prefix="https://" value="example.vn"', ''],
    ['rtl', 'value="سلام"', 'rtl'],
  ];
  for (const [name, attrs, dir] of CASES) {
    it(`${name}: the raised label's hit box ends above the value line; value-line points hit the control`, async () => {
      const el = one(attrs, '', dir);
      await frame();
      expect(floated(el), 'floated').to.equal(true);
      const lr = rect(labelOf(el));
      const v = valueLine(el);
      expect(lr.bottom <= v.top - 1 + 0.5, `label bottom ${lr.bottom} vs value top ${v.top}`).to.equal(true);
      const textarea = attrs.includes('textarea');
      const lineH = parseFloat(getComputedStyle(ctl(el)).lineHeight) || 21;
      const ys = textarea ? [v.top + 1, v.top + lineH / 2, v.top + lineH - 1] : [v.top + 1, (v.top + v.bottom) / 2, v.bottom - 1];
      const ctlRect = rect(ctl(el));
      const left = Math.max(v.left, ctlRect.left);
      const right = Math.min(v.right, ctlRect.right);
      for (const y of ys) {
        for (const f of [0.1, 0.5, 0.9]) {
          const x = left + (right - left) * f;
          const hit = document.elementFromPoint(x, y);
          expect(hit === ctl(el), `${name}: (${Math.round(x)}, ${Math.round(y)}) → ${hit?.className}`).to.equal(true);
        }
      }
      const c = { x: lr.left + lr.width / 2, y: lr.top + lr.height / 2 };
      expect(document.elementFromPoint(c.x, c.y) === labelOf(el), 'label centre hits the label').to.equal(true);
    });
  }

  it('resting label: one line, centred in the field; its centre hits the label', async () => {
    const el = one('size="md"');
    await frame();
    const lr = rect(labelOf(el));
    const cr = rect(ctl(el));
    expect(Math.abs(lr.height - 21) <= 1, `height ${lr.height}`).to.equal(true);
    expect(Math.abs((lr.top + lr.bottom) / 2 - (cr.top + cr.bottom) / 2) <= 1.5, 'centred').to.equal(true);
    expect(Math.abs(cr.height - 56) <= 0.5, `field ${cr.height}`).to.equal(true);
    expect(document.elementFromPoint(lr.left + lr.width / 2, lr.top + lr.height / 2) === labelOf(el)).to.equal(true);
  });

  it('sizes: field heights 48 / 56 / 64, raised label text = 12 / 12 / 13.7 px', async () => {
    for (const [s, h, px] of [['sm', 48, 12], ['md', 56, 12], ['lg', 64, 13.712]]) {
      const el = one(`size="${s}" value="v"`);
      await frame();
      expect(Math.abs(rect(ctl(el)).height - h) <= 0.5, `${s} height`).to.equal(true);
      const fs = parseFloat(getComputedStyle(labelOf(el)).fontSize) * scaleOf(el);
      expect(Math.abs(fs - px) < 0.05, `${s}: ${fs}`).to.equal(true);
    }
  });

  it('RTL: the label sits on the inline-start (right) edge and scales from it', async () => {
    const el = one('', '', 'rtl');
    await frame();
    const lr = rect(labelOf(el));
    const cr = rect(ctl(el));
    expect(cr.right - lr.right >= 14 && cr.right - lr.right <= 17, `rest gap ${cr.right - lr.right}`).to.equal(true);
    ctl(el).focus();
    const fr = rect(labelOf(el));
    expect(Math.abs(fr.right - lr.right) <= 1, 'origin right').to.equal(true);
  });

  it('long label: one line with an ellipsis, never wider than the field', async () => {
    const el = one('label="Địa chỉ nhận hàng đầy đủ gồm số nhà, tên đường, phường, quận và thành phố"');
    await frame();
    const l = labelOf(el);
    expect(getComputedStyle(l).textOverflow).to.equal('ellipsis');
    expect(l.scrollWidth > l.clientWidth).to.equal(true);
    expect(rect(l).right <= rect(ctl(el)).right).to.equal(true);
    ctl(el).focus();
    expect(rect(l).right <= rect(ctl(el)).right + 0.5).to.equal(true);
  });

  it('textarea: resting label near the top; the raised label has a solid backing (text scrolls under it)', async () => {
    const el = one('type="textarea"');
    await frame();
    const lr = rect(labelOf(el));
    const cr = rect(ctl(el));
    expect(lr.top - cr.top >= 12 && lr.top - cr.top <= 20, `rest top ${lr.top - cr.top}`).to.equal(true);
    expect(getComputedStyle(labelOf(el)).backgroundColor).to.match(/rgba\(0, 0, 0, 0\)|transparent/);
    ctl(el).focus();
    expect(getComputedStyle(labelOf(el)).backgroundColor).to.equal(getComputedStyle(ctl(el)).backgroundColor);
  });

  it('click on the resting label and on the raised label focuses the control (native label activation)', async () => {
    const el = one();
    await frame();
    let r = rect(labelOf(el));
    await sendMouse({ type: 'click', position: [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)] });
    expect(document.activeElement === ctl(el), 'resting').to.equal(true);
    ctl(el).value = 'abcdef';
    ctl(el).blur();
    await frame();
    r = rect(labelOf(el));
    await sendMouse({ type: 'click', position: [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)] });
    expect(document.activeElement === ctl(el), 'raised').to.equal(true);
  });

  it('click on the value text places the caret there (the label does not cover it)', async () => {
    const el = one('value="abcdefghij"');
    await frame();
    const v = valueLine(el);
    await sendMouse({ type: 'click', position: [Math.round(v.left + 3), Math.round((v.top + v.bottom) / 2)] });
    expect(document.activeElement === ctl(el)).to.equal(true);
    expect(ctl(el).selectionStart < 10, String(ctl(el).selectionStart)).to.equal(true);
  });

  it('click on the label of a prefixed field focuses the control; disabled never focuses; no text selection', async () => {
    const el = one('prefix="$" value="5"');
    await frame();
    const r = rect(labelOf(el));
    await sendMouse({ type: 'click', position: [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)] });
    expect(document.activeElement === ctl(el)).to.equal(true);
    const cs = getComputedStyle(labelOf(el));
    expect(cs.userSelect || cs.webkitUserSelect).to.equal('none');
    ctl(el).blur();
    const d = one('disabled');
    await frame();
    const dr = rect(labelOf(d));
    await sendMouse({ type: 'click', position: [Math.round(dr.left + dr.width / 2), Math.round(dr.top + dr.height / 2)] });
    expect(document.activeElement === ctl(d)).to.equal(false);
  });
});

describe('v0.58.0 floating — colours (QĐ 9)', () => {
  it('resting / raised: --td-field-float-label; focused: --td-field-float-label-focus (accent); disabled: fg-disabled', () => {
    const el = one();
    const probe = document.createElement('span');
    rootOf(el).appendChild(probe);
    const colorOf = (v) => { probe.style.color = `var(${v})`; return getComputedStyle(probe).color; };
    expect(getComputedStyle(labelOf(el)).color).to.equal(colorOf('--td-field-float-label'));
    ctl(el).focus();
    expect(getComputedStyle(labelOf(el)).color).to.equal(colorOf('--td-field-float-label-focus'));
    expect(colorOf('--td-field-float-label-focus')).to.equal(colorOf('--td-accent'));
    ctl(el).blur();
    el.setAttribute('disabled', '');
    expect(getComputedStyle(labelOf(el)).color).to.equal(colorOf('--td-field-fg-disabled'));
    probe.remove();
  });
});
