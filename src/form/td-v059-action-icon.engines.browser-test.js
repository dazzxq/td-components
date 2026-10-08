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
    expect(count('td-action-button: unknown icon "khong-co-v059a" — using the preset icon "pencil"')).to.equal(1);
    expect(warns.some((w) => w.includes('unknown action'))).to.equal(false);
  });

  it('unknown host icon, no preset (icon + label given) → nothing rendered, the icon warning (not "unknown action")', () => {
    const a = mount('<td-action-button action="gia-v059" icon="khong-co-v059b" label="Sửa giá"></td-action-button>');
    expect(a.children.length).to.equal(0);
    expect(count('td-action-button: unknown icon "khong-co-v059b" — nothing rendered')).to.equal(1);
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
      expect(count('td-action-button: preset "v059-broken" has an unknown icon "khong-co-v059c"')).to.equal(1);
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
