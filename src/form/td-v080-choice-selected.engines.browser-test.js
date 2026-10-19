import { expect } from '@esm-bundle/chai';
import { TdChoiceGroup } from './td-choice-group.js';

// v0.80.0 (plan docs/internal/plans/v0.80.0-choice-selected-floating-spacing.md) — selected option = accent tint + accent
// ring + corner tick, all overridable by tokens. Computed styles in Chromium, Firefox and WebKit.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const extra = [];
afterEach(() => extra.splice(0).forEach((f) => f()));
const OPTS = [
  { value: 'a', label: 'A' },
  { value: 'b', label: 'B', unavailable: true },
  { value: 'c', label: 'C', disabled: true },
  { value: 'd', label: 'D' },
];
function group(attrs = '', options = OPTS, hostStyle = '') {
  const wrap = document.createElement('div');
  wrap.innerHTML = `<td-choice-group ${attrs}></td-choice-group>`;
  document.body.appendChild(wrap);
  extra.push(() => wrap.remove());
  const el = wrap.querySelector('td-choice-group');
  // tokens are declared on `:root, [data-td-theme]` (ADR 0020): an ancestor scope re-resolves them from ITS --td-accent
  if (hostStyle) wrap.setAttribute('data-td-theme', 'light');
  if (hostStyle) hostStyle.split(';').filter(Boolean).forEach((d) => { const [k, v] = d.split(':'); wrap.style.setProperty(k.trim(), v.trim()); });
  el.options = options;
  return { el, wrap };
}
const face = (el, v) => el.querySelector(`input[value="${v}"] + .td-choice__face`);
const cs = (n, pseudo) => getComputedStyle(n, pseudo || null);
// resolve any CSS colour to rgb() through a probe element
function rgb(color, within) {
  const p = document.createElement('i');
  p.style.color = color;
  (within || document.body).appendChild(p);
  const v = getComputedStyle(p).color;
  p.remove();
  return v;
}
const hasTick = (n) => cs(n, '::after').display !== 'none' && cs(n, '::after').content !== 'none';

describe('v0.80.0 td-choice-group selected state', () => {
  it('checked face: tint background + accent ring; unselected face is plain', () => {
    const { el } = group('value="a"');
    const f = face(el, 'a');
    const accent = rgb('var(--td-accent)', el);
    expect(cs(f).borderTopColor).to.equal(accent);
    expect(cs(f).boxShadow).to.contain(accent);
    const tint = rgb('color-mix(in srgb, var(--td-accent) 10%, var(--td-choice-bg))', el);
    expect(cs(f).backgroundColor).to.equal(tint);
    expect(cs(face(el, 'd')).backgroundColor).to.equal(rgb('var(--td-choice-bg)', el));
    expect(cs(face(el, 'd')).borderTopColor).to.not.equal(accent);
  });

  it('changing --td-accent on an ancestor changes tint and ring', () => {
    const { el } = group('value="a"', OPTS, '--td-accent:#d00000');
    const f = face(el, 'a');
    expect(cs(f).borderTopColor).to.equal('rgb(208, 0, 0)');
    expect(cs(f).backgroundColor).to.equal(rgb('color-mix(in srgb, #d00000 10%, var(--td-choice-bg))', el));
    expect(cs(f, '::after').borderBottomColor).to.equal('rgb(208, 0, 0)');
  });

  it('token overrides win (selected, selected-bg, selected-fg)', () => {
    const { el } = group('value="a"', OPTS, '--td-choice-selected:#008000;--td-choice-selected-bg:#ffff00;--td-choice-selected-fg:#800080');
    const f = face(el, 'a');
    expect(cs(f).borderTopColor).to.equal('rgb(0, 128, 0)');
    expect(cs(f).backgroundColor).to.equal('rgb(255, 255, 0)');
    expect(cs(f).color).to.equal('rgb(128, 0, 128)');
  });

  it('tick: only on the checked option; none on disabled; unavailable+checked has tick and keeps its strike', () => {
    const { el } = group('value="a"');
    expect(hasTick(face(el, 'a'))).to.equal(true);
    expect(hasTick(face(el, 'd'))).to.equal(false);
    expect(hasTick(face(el, 'b'))).to.equal(false);
    el.value = 'b';
    expect(hasTick(face(el, 'b'))).to.equal(true);
    expect(hasTick(face(el, 'a'))).to.equal(false);
    const text = el.querySelector('.td-choice__option[data-unavailable] .td-choice__text');
    expect(cs(text).textDecorationLine).to.contain('line-through');
    // disabled: even when its value is the current one, no tick
    const d = group('value="c"');
    expect(face(d.el, 'c').previousElementSibling.disabled).to.equal(true);
    expect(hasTick(face(d.el, 'c'))).to.equal(false);
  });

  it('--td-choice-mark: none turns the tick off', () => {
    const { el } = group('value="a"', OPTS, '--td-choice-mark:none');
    expect(cs(face(el, 'a'), '::after').display).to.equal('none');
    expect(cs(face(el, 'a'), '::before').display).to.equal('none');
  });

  it('tick triangle sits in the end corner at --td-choice-mark-size', () => {
    const { el } = group('value="a"', OPTS, '--td-choice-mark-size:24px');
    const a = cs(face(el, 'a'), '::after');
    expect(a.borderBottomWidth).to.equal('24px');
    expect(a.position).to.equal('absolute');
  });

  it('swatch variant: selection ring uses the accent', () => {
    const { el } = group('variant="swatch" value="x"', [{ value: 'x', label: 'X', swatch: '#3b3b3d' }, { value: 'y', label: 'Y', swatch: '#f4f4f2' }]);
    const accent = rgb('var(--td-accent)', el);
    expect(cs(face(el, 'x')).boxShadow).to.contain(accent);
    expect(cs(face(el, 'y')).boxShadow).to.not.contain(accent);
    const { el: el2 } = group('variant="swatch" value="x"', [{ value: 'x', label: 'X', swatch: '#3b3b3d' }], '--td-accent:#d00000');
    expect(cs(face(el2, 'x')).boxShadow).to.contain('rgb(208, 0, 0)');
  });

  it('muted lines on the tint take the label ink (contrast ≥ 4.7); pressed still takes the control ink', () => {
    const opts = [{ value: 'a', label: 'A', hint: '1₫' }, { value: 'b', label: 'B', hint: '2₫', unavailable: true }, { value: 'd', label: 'D', hint: '3₫' }];
    const { el } = group('value="a"', opts);
    const label = rgb('var(--td-color-text-label)', el);
    expect(cs(face(el, 'a').querySelector('.td-choice__hint')).color).to.equal(label);
    expect(cs(face(el, 'a').querySelector('.td-choice__text')).color).to.equal(rgb('var(--td-choice-selected-fg)', el));
    expect(cs(face(el, 'd').querySelector('.td-choice__hint')).color).to.equal(rgb('var(--td-choice-hint-fg)', el));
    el.value = 'b';
    const fb = face(el, 'b');
    expect(cs(fb.querySelector('.td-choice__text')).color).to.equal(label);
    fb.closest('.td-choice__option').setAttribute('data-td-pressed', '');
    const ink = rgb('var(--td-control-fg)', el);
    expect(cs(fb.querySelector('.td-choice__text')).color).to.equal(ink);
    expect(cs(fb.querySelector('.td-choice__hint')).color).to.equal(ink);
  });
});
