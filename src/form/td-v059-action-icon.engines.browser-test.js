import { expect } from '@esm-bundle/chai';
import { TdActionButton } from './td-action-button.js';
import { hasIcon, resolveIconName, tdIcon } from '../icons/td-icon.js';

// v0.59.0 (plan v0.59.0-dsuite-small §D, QĐ D1 / D3) — td-action-button names the REAL cause of a missing icon, once per
// name (no throw): an unknown host `icon` with a preset icon (used instead), an unknown host `icon` without one (nothing
// rendered), a preset pointing at an unknown icon. The v0.36 "unknown action" warning is kept for a missing preset
// without icon + label. Core icon `price` (Lucide banknote, alias `banknote`); "tag" = the existing `brand` alias.
// Chromium, Firefox AND WebKit.
const extra = [];
const warns = [];
const origWarn = console.warn;
beforeEach(() => {
  warns.length = 0;
  console.warn = (...a) => { warns.push(a.map(String).join(' ')); };
});
afterEach(() => {
  console.warn = origWarn;
  extra.splice(0).forEach((f) => f());
});
function mount(html) {
  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  document.body.appendChild(wrap);
  extra.push(() => wrap.remove());
  return wrap.firstElementChild;
}
const icon = (el) => el.querySelector('.td-btn__icon')?.getAttribute('data-td-icon') ?? null;
const count = (s) => warns.filter((w) => w === s).length;

describe('v0.59.0 td-action-button — icon warnings', () => {
  it('unknown host icon + preset icon → the preset icon, ONE warning naming both (across hosts / re-renders)', () => {
    const a = mount('<td-action-button action="edit" icon="khong-co-v059a"></td-action-button>');
    mount('<td-action-button action="edit" icon="khong-co-v059a"></td-action-button>');
    a.setAttribute('size', 'sm');
    expect(icon(a)).to.equal('pencil');
    expect(count('td-action-button: unknown icon "khong-co-v059a" (14 UTF-16 units) — using the preset icon "pencil"')).to.equal(1);
    expect(warns.some((w) => w.includes('unknown action'))).to.equal(false);
  });

  it('unknown host icon, no preset (icon + label given) → nothing rendered, the icon warning (not "unknown action")', () => {
    const a = mount('<td-action-button action="gia-v059" icon="khong-co-v059b" label="Sửa giá"></td-action-button>');
    expect(a.children.length).to.equal(0);
    expect(count('td-action-button: unknown icon "khong-co-v059b" (14 UTF-16 units) — nothing rendered')).to.equal(1);
    expect(warns.some((w) => w.includes('unknown action'))).to.equal(false);
    a.setAttribute('icon', 'price');
    expect(icon(a)).to.equal('price');
  });

  it('a preset edited to an unknown icon → its own warning, once', () => {
    TdActionButton.presets['v059-broken'] = { icon: 'khong-co-v059c', label: 'Hỏng', tone: 'standard' };
    try {
      const a = mount('<td-action-button action="v059-broken"></td-action-button>');
      mount('<td-action-button action="v059-broken"></td-action-button>');
      expect(a.children.length).to.equal(0);
      expect(count('td-action-button: preset "v059-broken" has an unknown icon "khong-co-v059c" (14 UTF-16 units)')).to.equal(1);
    } finally { delete TdActionButton.presets['v059-broken']; }
  });

  it('unknown action without icon + label keeps the v0.36 warning (exact text)', () => {
    mount('<td-action-button action="khong-ton-tai-v059"></td-action-button>');
    expect(count('td-action-button: unknown action "khong-ton-tai-v059" (no preset; give icon + label)')).to.equal(1);
  });

  it('valid icons never warn', () => {
    mount('<td-action-button action="edit" icon="price"></td-action-button>');
    mount('<td-action-button action="edit" icon="tag"></td-action-button>');
    expect(warns.length).to.equal(0);
  });
});

describe('v0.59.0 td-action-button — warnings are log-safe (Codex security r1, CWE-117)', () => {
  const cases = [
    ['newline', 'a\nforged: line', '"a\\u000aforged: line" (14 UTF-16 units)'],
    ['U+2028 / U+2029', 'b\u2028c\u2029d', '"b\\u2028c\\u2029d" (5 UTF-16 units)'],
    ['quote', 'q"x', '"q\\"x" (3 UTF-16 units)'],
    ['backslash', 'b\\x', '"b\\\\x" (3 UTF-16 units)'],
    ['non-ASCII', 'giá-đỏ', '"giá-đỏ" (6 UTF-16 units)'],
    ['DEL + C1', 'z\u007f\u0085', '"z\\u007f\\u0085" (3 UTF-16 units)'],
    ['bidi controls', 'r\u202eg\u2066h\u200f\u061c', '"r\\u202eg\\u2066h\\u200f\\u061c" (7 UTF-16 units)'],
    ['astral', 'x\u{1F600}', '"x\u{1F600}" (3 UTF-16 units)'],
  ];
  for (const [what, name, shown] of cases) {
    it(`${what}: one warning, escaped`, () => {
      const el = document.createElement('td-action-button');
      el.setAttribute('action', 'edit');
      el.setAttribute('icon', name);
      document.body.appendChild(el);
      extra.push(() => el.remove());
      const again = el.cloneNode();
      document.body.appendChild(again);
      extra.push(() => again.remove());
      const mine = warns.filter((w) => w.startsWith('td-action-button: unknown icon '));
      expect(mine).to.deep.equal([`td-action-button: unknown icon ${shown} — using the preset icon "pencil"`]);
      expect(/[\n\r\u2028\u2029\u007f\u0085\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/.test(mine[0])).to.equal(false);
    });
  }

  it('a > 64-character name is cut to 64 + its length; the dedup key is the bounded message', () => {
    const long = `${'x'.repeat(70)}-v059`;
    for (let i = 0; i < 2; i += 1) {
      const el = document.createElement('td-action-button');
      el.setAttribute('action', 'edit');
      el.setAttribute('icon', long);
      document.body.appendChild(el);
      extra.push(() => el.remove());
    }
    const mine = warns.filter((w) => w.startsWith('td-action-button: unknown icon '));
    expect(mine).to.deep.equal([`td-action-button: unknown icon "${'x'.repeat(64)}" (75 UTF-16 units) — using the preset icon "pencil"`]);
  });
});

describe('v0.59.0 core icon `price`', () => {
  it('price is a core icon (Lucide banknote geometry), `banknote` its alias; `tag` stays the alias of brand', () => {
    expect(hasIcon('price')).to.equal(true);
    expect(resolveIconName('banknote')).to.equal('price');
    expect(resolveIconName('tag')).to.equal('brand');
    const svg = tdIcon('price');
    expect(svg.getAttribute('data-icon')).to.equal('price');
    expect([...svg.children].map((n) => n.localName)).to.deep.equal(['rect', 'circle', 'path']);
    const rect = svg.querySelector('rect');
    expect(['width', 'height', 'x', 'y', 'rx'].map((a) => rect.getAttribute(a))).to.deep.equal(['20', '12', '2', '6', '2']);
    expect(svg.querySelector('path').getAttribute('d')).to.equal('M6 12h.01M18 12h.01');
  });

  it('td-action-button icon="price" / "banknote" render the price icon', () => {
    const a = mount('<td-action-button action="edit" icon="price" label="Sửa giá"></td-action-button>');
    const b = mount('<td-action-button action="edit" icon="banknote"></td-action-button>');
    expect(icon(a)).to.equal('price');
    expect(icon(b)).to.equal('banknote');
    expect(b.querySelector('svg')?.getAttribute('data-icon')).to.equal('price');
  });
});
