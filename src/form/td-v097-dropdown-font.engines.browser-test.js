import { expect } from '@esm-bundle/chai';
import './td-dropdown.js';

// v0.97.0 (plan docs/internal/plans/v0.97.0-scroll-progress-dropdown-font.md §B) — td-dropdown option `font`: the row
// label and the trigger value get the font-family through CSSOM; invalid values are ignored; <select data-font>
// upgrade; search ignores the font; a renderOption Node inherits it; A → B → clear; options replaced. 3 engines.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const host = document.createElement('div');
document.body.appendChild(host);
const mount = (html) => { host.insertAdjacentHTML('beforeend', html.trim()); return host.lastElementChild; };
const raf = () => new Promise((r) => requestAnimationFrame(r));
async function settle(n = 3) { for (let i = 0; i < n; i++) await raf(); }
afterEach(async () => {
  host.innerHTML = '';
  await settle();
});

const OPTS = [
  { value: 'g', label: 'Georgia', font: 'Georgia, serif' },
  { value: 'm', label: 'Mono', font: '"Courier New", monospace' },
  { value: 'p', label: 'Plain' },
  { value: 'x', label: 'Bad', font: 'inherit' },
  { value: 'y', label: 'Bad2', font: 'Arial; color: red' },
];
const value = (el) => el.querySelector('.td-dropdown__value');
const fam = (node) => getComputedStyle(node).fontFamily.toLowerCase();
async function open(el) {
  el.querySelector('.td-dropdown__trigger').click();
  await settle();
  return el._menuElement;
}
const rowLabel = (menu, v) => menu.querySelector(`.td-dropdown__option[data-value="${v}"] .td-dropdown__option-label`);

describe('v0.97.0 td-dropdown option font', () => {
  it('row labels: valid fonts applied, invalid / absent ones inherit the menu font', async () => {
    const el = mount('<td-dropdown></td-dropdown>');
    el.options = OPTS;
    const menu = await open(el);
    const base = fam(menu);
    expect(fam(rowLabel(menu, 'g'))).to.contain('georgia');
    expect(fam(rowLabel(menu, 'm'))).to.contain('courier new');
    expect(fam(rowLabel(menu, 'p'))).to.equal(base);
    expect(fam(rowLabel(menu, 'x'))).to.equal(base);
    expect(fam(rowLabel(menu, 'y'))).to.equal(base);
    expect(rowLabel(menu, 'y').style.color).to.equal('');
  });

  it('trigger: A → B → clear follows the selection; options replaced with the value kept keeps the font', async () => {
    const el = mount('<td-dropdown allow-clear></td-dropdown>');
    el.options = OPTS;
    const base = fam(value(el));
    el.value = 'g';
    await settle();
    expect(fam(value(el))).to.contain('georgia');
    el.value = 'm';
    await settle();
    expect(fam(value(el))).to.contain('courier new');
    el.value = '';
    await settle();
    expect(fam(value(el))).to.equal(base);
    el.value = 'g';
    el.options = OPTS.slice();
    await settle();
    expect(fam(value(el))).to.contain('georgia');
    el.value = 'p';
    await settle();
    expect(value(el).style.fontFamily).to.equal('');
  });

  it('<select data-font> upgrade (SSR) → same result', async () => {
    const el = mount('<td-dropdown><select name="f"><option value="g" selected data-font="Georgia, serif">Georgia</option>'
      + '<option value="p">Plain</option></select></td-dropdown>');
    await settle();
    expect(fam(value(el))).to.contain('georgia');
    const menu = await open(el);
    expect(fam(rowLabel(menu, 'g'))).to.contain('georgia');
  });

  it('search uses the label only (a font name is not searched)', async () => {
    const el = mount('<td-dropdown></td-dropdown>');
    el.options = OPTS;
    const menu = await open(el);
    const input = menu.querySelector('input') || el.querySelector('input');
    input.value = 'courier';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    expect(menu.querySelectorAll('.td-dropdown__option[data-value]').length).to.equal(0);
  });

  it('a renderOption Node inherits the font', async () => {
    const el = mount('<td-dropdown></td-dropdown>');
    el.renderOption = (item) => { const s = document.createElement('span'); s.className = 'ro'; s.textContent = item.label; return s; };
    el.options = OPTS;
    const menu = await open(el);
    expect(fam(menu.querySelector('.td-dropdown__option[data-value="g"] .ro'))).to.contain('georgia');
  });

  it('several invalid fonts → exactly one warning per element', async () => {
    const warn = console.warn;
    const msgs = [];
    console.warn = (m) => msgs.push(String(m));
    try {
      const el = mount('<td-dropdown></td-dropdown>');
      el.options = OPTS;
      await open(el);
      el.value = 'x';
      await settle();
      expect(msgs.filter((m) => m.includes('option font')).length).to.equal(1);
    } finally { console.warn = warn; }
  });
});
