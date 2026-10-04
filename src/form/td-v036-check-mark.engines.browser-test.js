import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';
import './td-checkbox.js';
import './td-tree.js';
import './td-chip-input.js';
import '../display/td-media-grid.js';
import { TdMenu } from '../feedback/td-menu.js';

// v0.36.0 M1 (plan QĐ 1–5, ADR 0017) — every "tick to select" is the td-checkbox mark: same box, fill, radius, ✓,
// mixed bar; td-checkbox gains `indeterminate`. Chromium + Firefox + WebKit; waits on real signals (rAF-polled).
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const root = document.createElement('div');
document.body.appendChild(root);
const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
async function waitFor(cond, timeout = 3000, what = 'condition') {
  const end = performance.now() + timeout;
  while (performance.now() < end) {
    if (cond()) return;
    await raf();
  }
  throw new Error(`timeout waiting for ${what}`);
}
/** transitions settle: the mark fades its fill / glyph */
async function settle() {
  await raf();
  await waitFor(() => document.getAnimations().every((a) => a.playState !== 'running'), 3000, 'animations');
}
const look = (el) => {
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return {
    w: Math.round(r.width), h: Math.round(r.height), bg: cs.backgroundColor, border: cs.borderTopColor,
    bw: cs.borderTopWidth, radius: cs.borderTopLeftRadius, bar: getComputedStyle(el, '::after').opacity,
  };
};
const glyph = (el) => getComputedStyle(el.querySelector('svg')).opacity;

async function refCheckbox(size, state) {
  const host = document.createElement('td-checkbox');
  host.setAttribute('size', size);
  host.setAttribute('aria-label', 'ref');
  if (state === 'on') host.setAttribute('checked', '');
  if (state === 'mixed') host.setAttribute('indeterminate', '');
  root.appendChild(host);
  await waitFor(() => host.querySelector('.td-checkbox__mark'), 3000, 'ref render');
  await settle();
  return host.querySelector('.td-checkbox__mark');
}

afterEach(() => { TdMenu.close(); root.innerHTML = ''; });

describe('v0.36.0 shared tick mark', () => {
  it('td-tree (multiple): off / on / mixed marks look exactly like td-checkbox sm', async () => {
    const t = document.createElement('td-tree');
    t.setAttribute('selection', 'multiple');
    t.setAttribute('cascade', '');
    t.setAttribute('label', 'Cây');
    t.data = [{ value: 'p', label: 'Cha', children: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] },
      { value: 'q', label: 'Khác' }];
    t.value = ['a'];
    root.appendChild(t);
    await waitFor(() => t.querySelectorAll('.td-tree__check').length >= 2, 3000, 'tree');
    t.expandAll?.();
    await settle();
    const mark = (v) => t.querySelector(`[data-value="${v}"] > .td-tree__row > .td-check`)
      || [...t.querySelectorAll('.td-tree__item')].find((li) => li.textContent.startsWith(v === 'p' ? 'Cha' : 'Khác'))
        ?.querySelector(':scope > .td-tree__row > .td-check');
    const parent = mark('p');
    const other = mark('q');
    expect(parent.getAttribute('aria-hidden')).to.equal('true');
    expect(parent.closest('[aria-checked]').getAttribute('aria-checked')).to.equal('mixed');
    const refMixed = look(await refCheckbox('sm', 'mixed'));
    const refOff = look(await refCheckbox('sm', 'off'));
    expect(look(parent)).to.deep.equal(refMixed);
    expect(look(other)).to.deep.equal(refOff);
    expect(glyph(parent)).to.equal('0');
  });

  it('td-chip-input selection-only: options carry the sm mark (always visible); select-all shows mixed when partial', async () => {
    const c = document.createElement('td-chip-input');
    c.setAttribute('selection-only', '');
    c.setAttribute('select-all', '');
    c.setAttribute('label', 'Vai trò');
    c.options = [{ value: 'a', label: 'An' }, { value: 'b', label: 'Bình' }, { value: 'c', label: 'Chi' }];
    c.value = ['a'];
    root.appendChild(c);
    await waitFor(() => c.querySelector('input'), 3000, 'chip render');
    c.open();
    await waitFor(() => document.querySelector('.td-chip-input__option .td-check'), 3000, 'options');
    await settle();
    const opts = [...document.querySelectorAll('.td-chip-input__option')];
    const all = opts.find((o) => o.classList.contains('td-chip-input__option--all'));
    const sel = opts.find((o) => o.getAttribute('aria-selected') === 'true' && o !== all);
    const off = opts.find((o) => o.getAttribute('aria-selected') === 'false' && o !== all);
    expect(all.hasAttribute('data-td-check-mixed')).to.equal(true);
    const on = look(sel.querySelector('.td-check'));
    const refOn = look(await refCheckbox('sm', 'on'));
    expect(on).to.deep.equal(refOn);
    expect(look(off.querySelector('.td-check'))).to.deep.equal(look(await refCheckbox('sm', 'off')));
    expect(look(all.querySelector('.td-check'))).to.deep.equal(look(await refCheckbox('sm', 'mixed')));
    c.close?.();
  });

  it('td-menu: menuitemcheckbox = sm mark; menuitemradio keeps the ✓ (radio semantics)', async () => {
    const b = document.createElement('button');
    b.textContent = 'Menu';
    root.appendChild(b);
    TdMenu.open(b, [{ label: 'Tối', type: 'checkbox', checked: true }, { label: 'Mới', group: 's', checked: true }]);
    await waitFor(() => document.querySelector('.td-menu__item'), 3000, 'menu');
    await settle();
    const [cb, radio] = document.querySelectorAll('.td-menu__item');
    expect(look(cb.querySelector('.td-check'))).to.deep.equal(look(await refCheckbox('sm', 'on')));
    expect(radio.querySelector('.td-check')).to.equal(null);
    expect(radio.querySelector('.td-menu__check svg')).to.not.equal(null);
  });

  it('td-media-grid: the tick button wraps the mark; selected = td-checkbox on (lg, 24px), aria-pressed kept', async () => {
    root.innerHTML = '<td-media-grid label="L">'
      + ['m1', 'm2'].map((id) => `<div data-td-media-item data-id="${id}"><button type="button" data-td-media-open aria-label="${id}">`
        + '<img src="/test/fixtures/1.svg" alt="" width="120" height="80"></button></div>').join('')
      + '</td-media-grid>';
    const g = root.querySelector('td-media-grid');
    await waitFor(() => g.querySelectorAll('.td-media-grid__tick .td-check').length === 2, 3000, 'ticks');
    g.select(['m1']);
    await settle();
    const t1 = g.querySelector('[data-id="m1"] .td-media-grid__tick');
    expect(t1.getAttribute('aria-pressed')).to.equal('true');
    expect(getComputedStyle(t1).backgroundColor).to.equal('rgba(0, 0, 0, 0)');
    const mark = look(t1.querySelector('.td-check'));
    const ref = look(await refCheckbox('lg', 'on'));
    expect(mark).to.deep.equal(ref);
    expect(getComputedStyle(t1.querySelector('.td-check')).boxShadow).to.match(/rgba\(0, 0, 0, 0\.45\)/); // on-media hairline
  });

  it('no nested <td-checkbox>, no extra FormData entries from marks', async () => {
    root.innerHTML = '<form><td-chip-input name="r" selection-only label="R"></td-chip-input></form>';
    const c = root.querySelector('td-chip-input');
    c.options = [{ value: 'a', label: 'An' }];
    c.value = ['a'];
    await waitFor(() => c.querySelector('input'), 3000, 'chip');
    c.open();
    await waitFor(() => document.querySelector('.td-chip-input__option .td-check'), 3000, 'options');
    expect(document.querySelector('.td-chip-input__options td-checkbox, .td-menu td-checkbox, td-media-grid td-checkbox')).to.equal(null);
    expect([...new FormData(root.querySelector('form')).keys()]).to.deep.equal(['r']);
  });
});

describe('v0.36.0 td-checkbox indeterminate', () => {
  async function mk(attrs = '') {
    root.innerHTML = `<form><td-checkbox name="all" label="Tất cả" ${attrs}></td-checkbox></form>`;
    const el = root.querySelector('td-checkbox');
    await waitFor(() => el.querySelector('input'), 3000, 'render');
    return el;
  }

  it('attribute ↔ property ↔ native input; the mark shows the bar; a11y = mixed', async () => {
    const el = await mk('indeterminate');
    const input = el.querySelector('input');
    expect(el.indeterminate).to.equal(true);
    expect(input.indeterminate).to.equal(true);
    expect(input.matches(':indeterminate')).to.equal(true);
    await settle();
    expect(getComputedStyle(el.querySelector('.td-checkbox__mark'), '::after').opacity).to.equal('1');
    el.indeterminate = false;
    expect(el.hasAttribute('indeterminate')).to.equal(false);
    expect(input.indeterminate).to.equal(false);
    el.setAttribute('indeterminate', '');
    expect(input.indeterminate).to.equal(true);
  });

  it('user toggle clears it: exactly ONE change, host attribute gone; focus kept on in-place updates', async () => {
    const el = await mk('indeterminate');
    const input = el.querySelector('input');
    const changes = [];
    el.addEventListener('change', (e) => changes.push(e.detail));
    input.focus();
    await sendKeys({ press: 'Space' });
    await waitFor(() => changes.length === 1, 2000, 'change');
    await raf();
    expect(changes).to.deep.equal([{ checked: true }]);
    expect(el.hasAttribute('indeterminate')).to.equal(false);
    expect(input.indeterminate).to.equal(false);
    el.indeterminate = true; // in place
    expect(document.activeElement).to.equal(input);
    expect(el.querySelector('input')).to.equal(input);
    expect(changes.length).to.equal(1);
  });

  it('code: checked change keeps it; re-render keeps it; re-connect keeps it; reset keeps it; FormData unchanged', async () => {
    const el = await mk('indeterminate');
    el.checked = true;
    expect(el.querySelector('input').indeterminate).to.equal(true);
    el.setAttribute('size', 'lg'); // structural → render again
    await waitFor(() => el.querySelector('.td-checkbox--lg'), 2000, 're-render');
    expect(el.querySelector('input').indeterminate).to.equal(true);
    const form = root.querySelector('form');
    form.remove();
    document.body.appendChild(form);
    await raf();
    expect(el.querySelector('input').indeterminate).to.equal(true);
    expect([...new FormData(form).entries()]).to.deep.equal([['all', 'on']]);
    form.reset();
    await raf();
    expect(el.hasAttribute('indeterminate')).to.equal(true);
    expect(el.querySelector('input').indeterminate).to.equal(true);
    form.remove();
  });

  it('SSR checkbox@1 + indeterminate on the host → adopted in place, then mixed', async () => {
    const fixture = await (await fetch('/test/ssr/fixtures/form.html')).text();
    const tpl = document.createElement('template');
    tpl.innerHTML = fixture;
    const host = tpl.content.querySelector('[data-case="c-basic"] td-checkbox').cloneNode(true);
    host.setAttribute('indeterminate', '');
    const input = host.querySelector('input');
    root.appendChild(host);
    await waitFor(() => !host.hasAttribute('data-td-ssr'), 3000, 'hydrate');
    expect(host.querySelector('input')).to.equal(input, 'same node');
    expect(input.indeterminate).to.equal(true);
  });
});
