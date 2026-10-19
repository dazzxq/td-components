import { expect } from '@esm-bundle/chai';
import './td-input-field.js';

// v0.80.0 (plan docs/internal/plans/v0.80.0-choice-selected-floating-spacing.md items 5-6) — floating label breathing
// room + text affix not cut. Chromium / Firefox / WebKit. DOM nodes are compared as booleans (a failing chai assertion
// carrying DOM nodes hangs the runner).
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
const extra = [];
afterEach(() => extra.splice(0).forEach((f) => f()));

let seq = 0;
function one(attrs, width = 360) {
  const wrap = document.createElement('div');
  wrap.style.setProperty('--td-dur-fast', '0s'); // no transition: the geometry is the end state
  wrap.style.width = `${width}px`;
  wrap.innerHTML = `<td-input-field id="fs${++seq}" label="Họ tên" label-mode="floating" ${attrs}></td-input-field>`;
  document.body.prepend(wrap);
  extra.push(() => wrap.remove());
  return wrap.querySelector('td-input-field');
}
const ctl = (el) => el.querySelector('.td-field__control');
const labelOf = (el) => el.querySelector('.td-field__label');
const outer = (el) => el.querySelector('.td-field__box') || ctl(el);

/** the raised label's glyph band: the text content area of the (scaled) label, from a Range (not the line box) */
function labelText(el) {
  const range = document.createRange();
  range.selectNodeContents(labelOf(el));
  return range.getBoundingClientRect();
}
/**
 * top of the value's TEXT: the control's content box top (+ centring for a single-line input), minus the half-leading
 * of a ~1.2em text area (the label's own text area is 1.22em, see labelText)
 */
function valueTextTop(el) {
  const c = ctl(el);
  const cs = getComputedStyle(c);
  const r = c.getBoundingClientRect();
  const fs = parseFloat(cs.fontSize);
  const lineH = parseFloat(cs.lineHeight);
  const top = r.top + parseFloat(cs.borderTopWidth) + parseFloat(cs.paddingTop);
  const contentH = r.height - parseFloat(cs.borderTopWidth) - parseFloat(cs.borderBottomWidth) - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  const room = c.tagName === 'TEXTAREA' ? lineH : contentH;
  return top + (room - fs * 1.2) / 2;
}
function measure(el) {
  const box = outer(el).getBoundingClientRect();
  const cs = getComputedStyle(outer(el));
  const inner = box.top + parseFloat(cs.borderTopWidth);
  const lr = labelOf(el).getBoundingClientRect();
  const lt = labelText(el);
  return {
    lineGap: lr.top - inner, // scaled label line box → inner top edge
    glyphGap: lt.top - inner, // scaled label text area → inner top edge
    textBottom: lt.bottom,
    valueTop: valueTextTop(el),
    height: box.height,
  };
}

const TARGET = { sm: 7, md: 8, lg: 9 };
const FIELDS = [
  ['input', (s) => `size="${s}" value="Nguyễn Văn An"`],
  ['prefix', (s) => `size="${s}" prefix="https://" value="example.vn"`],
  ['textarea', (s) => `type="textarea" size="${s}" value="Dòng một"`],
];

describe('v0.80.0 floating — the raised label has breathing room', () => {
  for (const s of ['sm', 'md', 'lg']) {
    for (const [name, attrs] of FIELDS) {
      it(`${name} ${s}: label text ≥ ${TARGET[s] - 1}px under the top edge; ≥ 2px above the value`, async () => {
        const el = one(attrs(s));
        await frame();
        const m = measure(el);
        expect(m.glyphGap >= TARGET[s] - 1, `${name} ${s} gap ${m.glyphGap}`).to.equal(true);
        expect(m.textBottom + 2 <= m.valueTop + 0.5, `${name} ${s}: label bottom ${m.textBottom} vs value ${m.valueTop}`).to.equal(true);
      });
    }
  }
});

describe('v0.80.0 floating + affix — a short text prefix is not cut', () => {
  for (const s of ['sm', 'md', 'lg']) {
    it(`${s}: "https://" at 360px keeps its natural width; the control keeps room`, async () => {
      const el = one(`size="${s}" prefix="https://" value="example.vn"`);
      await frame();
      const aff = el.querySelector('.td-field__affix--prefix');
      expect(aff.scrollWidth <= aff.clientWidth, `scroll ${aff.scrollWidth} > client ${aff.clientWidth}`).to.equal(true);
      expect(ctl(el).getBoundingClientRect().width > 100).to.equal(true);
    });
  }
  it('a narrow field (160px) with a long prefix still cuts it; the control stays > 0', async () => {
    const el = one('prefix="https://www.example-long-domain.com/" value="x"', 160);
    await frame();
    const aff = el.querySelector('.td-field__affix--prefix');
    expect(aff.scrollWidth > aff.clientWidth, 'cut').to.equal(true);
    expect(ctl(el).getBoundingClientRect().width > 0, 'control width').to.equal(true);
  });
});
