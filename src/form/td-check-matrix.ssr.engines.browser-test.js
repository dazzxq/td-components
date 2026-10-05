import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';
import { validateMatrix } from '../utils/check-matrix-model.js';
import { renderMatrix, MATRIX_LABELS } from '../utils/check-matrix-render.js';
// DOM nodes are compared as booleans (`a === b`): a failing chai assertion carrying DOM nodes hangs the runner.
// NO static import of the component: <td-check-matrix> is defined LATE (dynamic import below), after the no-JS checks.

// v0.47.0 (ADR 0012 + 0022, plan v0.47.0-check-matrix QĐ 28–29, M6) — td_check_matrix() / <td-check-matrix> hydrate,
// contract `check-matrix@1`, in Chromium, Firefox AND WebKit. The markup is EXACTLY what php/td.php prints for every case
// of test/ssr/check-matrix.fixtures.json (test/ssr/fixtures/check-matrix.html, kept fresh by
// test/php/td-ssr-check-matrix.test.js; the PHP test also proves it equals renderMatrix({ ssr }) byte for byte).
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });
document.addEventListener('submit', (e) => e.preventDefault(), true);

const FIXTURE = await (await fetch('/test/ssr/fixtures/check-matrix.html')).text();
const TPL = document.createElement('template');
TPL.innerHTML = FIXTURE;
const root = document.createElement('div');
root.innerHTML = FIXTURE;
document.body.appendChild(root);

const formOf = (id, scope = root) => scope.querySelector(`form[data-case="${id}"]`);
const hostOf = (id, scope = root) => formOf(id, scope).querySelector('td-check-matrix');
const hostHtml = (id) => TPL.content.querySelector(`form[data-case="${id}"] > td-check-matrix`).outerHTML;
const fd = (form) => [...new FormData(form)];
const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
async function waitFor(cond, what = 'condition', timeout = 5000) {
  const end = performance.now() + timeout;
  while (performance.now() < end) {
    if (cond()) return;
    await raf();
  }
  throw new Error(`timeout waiting for ${what}`);
}
// budgets are asserted with slack (shared / loaded machines, CI): ×20 unless the page sets window.__TD_PERF_STRICT
const PERF_SLACK = (globalThis.__TD_PERF_STRICT ? 1 : 20) * (/Chrome\//.test(navigator.userAgent) ? 1 : 4);

// Hand-written mismatches of the basic case (must render from `data`, never adopt, never read a tick from the markup).
const basic = hostHtml('basic');
const MARKER = '<input type="hidden" name="perms[owner]" value="">';
const VIEW_SALES = 'name="perms[sales][]" value="cat.view"';
const MM = {
  'mm-marker': basic.replace(MARKER, ''),
  'mm-formaction': basic.replace(VIEW_SALES, `${VIEW_SALES} formaction="/evil"`),
  'mm-column': basic.replace(VIEW_SALES, 'name="perms[owner][]" value="cat.view"'),
  'mm-hidden': basic.replace('</td-check-matrix>', '<input type="hidden" name="perms[owner][]" value="cat.edit"></td-check-matrix>'),
  'mm-data': basic.replace(/ data="[^"]*"/, ' data="{&quot;v&quot;:1"'),
  'mm-label': basic.replace('>Xem sản phẩm</span>', '>Xem SP (sửa tay)</span>'),
  'mm-tbody-id': basic.replace('id="cm-basic-g0" ', ''),
  'mm-controls': basic.replace('aria-controls="cm-basic-g1"', 'aria-controls="cm-basic-g0"'),
  'mm-data-g': basic.replace('data-g="1"', 'data-g="0"'),
  'mm-onclick': basic.replace('<button type="button"', '<button type="button" onclick="window.__pwned=1"'),
  'mm-slot': basic.replace(/(data-td-icon="next" data-td-icon-size="s" aria-hidden="true">)<svg/, '$1<input name="perms[owner][]" value="cat.edit"><svg'),
};
const mismatch = document.createElement('div');
mismatch.innerHTML = Object.entries(MM).map(([id, html]) => `<form data-case="${id}">${html.replaceAll('cm-basic', `cm-${id}`)}</form>`).join('');
document.body.appendChild(mismatch);
// a duplicate id elsewhere in a host (two tbody with the same id)
const dup = document.createElement('div');
dup.innerHTML = `<form data-case="mm-dup">${basic.replaceAll('cm-basic', 'cm-dup').replace('id="cm-dup-g1"', 'id="cm-dup-g0"')}</form>`;
document.body.appendChild(dup);

// --- before the module loads (no JS) ---
const EXPECT_BASIC = [['perms[owner]', ''], ['perms[sales]', ''], ['perms[ship]', ''], ['perms[owner][]', 'dash.view'],
  ['perms[sales][]', 'cat.view'], ['perms[owner][]', 'cat.del'], ['perms[_v]', '1']];
const noJs = {
  basic: fd(formOf('basic')),
  nolabel: fd(formOf('nolabel')),
  disabled: fd(formOf('disabled')),
  broken: fd(formOf('broken')),
  collapsedShown: hostOf('basic').querySelector('tr[data-r="4"]').getClientRects().length > 0,
  bulkHidden: getComputedStyle(hostOf('basic').querySelector('[data-kind="all"] .td-check')).visibility,
};
const nodes = { table: hostOf('basic').querySelector('table'), input: hostOf('basic').querySelector('tr[data-r="2"]').cells[2].querySelector('input') };
// the user ticked cat.edit × owner before the module loaded; and typed focus into a refused host
nodes.input.checked = true;
mismatch.querySelector('form[data-case="mm-column"] tr[data-r="2"]').cells[3].querySelector('input').checked = true;
const refusedFocus = mismatch.querySelector('form[data-case="mm-label"] tr[data-r="1"]').cells[3].querySelector('input');
refusedFocus.focus();

const warns = [];
const origWarn = console.warn;
console.warn = (...a) => warns.push(a.join(' '));
const { TdCheckMatrix } = await import('./td-check-matrix.js');
await customElements.whenDefined('td-check-matrix');
console.warn = origWarn;
const focusAfterDefine = document.activeElement;

describe('v0.47.0 td-check-matrix — SSR hydrate (M6)', () => {
  it('no JS: the server form submits the exact FormData of the contract; collapsed groups stay open; bulk marks hidden', () => {
    expect(noJs.basic).to.deep.equal(EXPECT_BASIC);
    // row-major: x (column 2, locked-ticked → its hidden twin), then y (column 1)
    expect(noJs.nolabel).to.deep.equal([['role[perms][1]', ''], ['role[perms][2]', ''], ['role[perms][2][]', 'x'], ['role[perms][1][]', 'y'], ['role[perms][_v]', '1']]);
    expect(noJs.disabled).to.deep.equal([]);
    expect(noJs.broken).to.deep.equal([]);
    expect(noJs.collapsedShown).to.equal(true);
    expect(noJs.bulkHidden).to.equal('hidden');
  });

  it('adopted IN PLACE: same nodes, the no-JS form is gone, FormData identical (+ the tick made before define)', () => {
    const el = hostOf('basic');
    expect(el.querySelector('table') === nodes.table).to.equal(true);
    expect(el.querySelector('tr[data-r="2"]').cells[2].querySelector('input') === nodes.input).to.equal(true);
    expect(el.hasAttribute('data-td-ssr')).to.equal(false);
    expect(el.querySelectorAll('input[name], input[type="hidden"]').length).to.equal(0);
    // row-major: dash.view(owner), cat.view(sales), cat.edit(owner), cat.del(owner)
    expect(fd(formOf('basic'))).to.deep.equal([...EXPECT_BASIC.slice(0, 5), ['perms[owner][]', 'cat.edit'], ...EXPECT_BASIC.slice(5)]);
    expect(el.changedCount).to.equal(1);
    expect(el.querySelector('tr[data-r="2"]').cells[2].hasAttribute('data-changed')).to.equal(true);
    expect(el.querySelector('[data-kind="column"][data-c="0"] input').disabled).to.equal(false, 'bulk enabled');
    expect(el.querySelector('tr[data-r="4"]').getClientRects().length).to.equal(0, 'collapsed group hidden after define');
    expect(fd(formOf('nolabel'))).to.deep.equal(noJs.nolabel);
    expect(fd(formOf('disabled'))).to.deep.equal([]);
    expect(TdCheckMatrix.SSR_SCHEMA).to.equal(1);
  });

  it('group buttons after hydrate: enabled, roving tabindex, aria-expanded from data; Enter / Space / click toggle in place', async () => {
    const el = hostOf('basic');
    const btns = [...el.querySelectorAll('.td-check-matrix__group-toggle')];
    expect(btns.map((b) => [b.disabled, b.hidden, b.getAttribute('aria-expanded')])).to.deep.equal([[false, false, 'true'], [false, false, 'false']]);
    expect(btns.every((b) => ['-1', '0'].includes(b.getAttribute('tabindex')))).to.equal(true);
    expect(el.querySelectorAll('table [tabindex="0"]').length).to.equal(1);
    const ev = [];
    el.addEventListener('expanded-change', (e) => ev.push(e.detail));
    el.querySelector('tr[data-r="1"]').cells[2].querySelector('input').focus();
    await sendKeys({ press: 'ArrowUp' });
    await sendKeys({ press: 'ArrowLeft' });
    expect(document.activeElement === btns[0]).to.equal(true);
    await sendKeys({ press: 'Enter' });
    expect(btns[0].getAttribute('aria-expanded')).to.equal('false');
    expect(el.querySelector('tr[data-r="1"]').getClientRects().length).to.equal(0);
    expect(document.activeElement === btns[0]).to.equal(true, 'focus stays on the same node');
    await sendKeys({ press: 'Space' });
    expect(btns[0].getAttribute('aria-expanded')).to.equal('true');
    btns[1].click();
    expect(btns[1].getAttribute('aria-expanded')).to.equal('true');
    expect(ev).to.deep.equal([{ group: 'cat', expanded: false }, { group: 'cat', expanded: true }, { group: 'ord', expanded: true }]);
    expect(el.querySelectorAll('table [tabindex="0"]').length).to.equal(1);
    expect(fd(formOf('basic')).length).to.equal(8, 'groups never change FormData');
  });

  it('every mismatch → safe render from `data`: no tick, value, id or control taken from the markup; one warning each', () => {
    for (const id of Object.keys(MM)) {
      const el = hostOf(id, mismatch);
      const form = formOf(id, mismatch);
      if (id === 'mm-data') {
        expect(el.querySelector('[data-state="broken"]') !== null, id).to.equal(true);
        expect(fd(form), id).to.deep.equal([]);
        continue;
      }
      expect(el.querySelectorAll('input[name], input[type="hidden"], [onclick], [formaction]').length, id).to.equal(0);
      expect(fd(form).map(([k, v]) => `${k}=${v}`).join('&'), id).to.equal(EXPECT_BASIC.map((p) => p.join('=')).join('&'));
      expect(el.querySelectorAll('.td-check-matrix__chevron input').length, id).to.equal(0);
    }
    expect(window.__pwned).to.equal(undefined);
    const el = hostOf('mm-dup', dup);
    expect(fd(formOf('mm-dup', dup)).length).to.equal(7);
    expect([...el.querySelectorAll('tbody[id]')].map((t) => t.id)).to.deep.equal(['cm-dup-g0', 'cm-dup-g1']);
    expect(warns.filter((w) => w.includes('does not match')).length >= Object.keys(MM).length - 1).to.equal(true);
  });

  it('a refused host that held the focus → the focus goes back to the matching cell', () => {
    const el = hostOf('mm-label', mismatch);
    const cell = el.querySelector('tr[data-r="1"]').cells[3];
    expect(refusedFocus.isConnected).to.equal(false, 'the refused markup was replaced');
    expect(focusAfterDefine === cell.querySelector('input')).to.equal(true);
  });

  it('the server fail-closed host stays broken (no data → nothing submitted, no control)', () => {
    const el = hostOf('broken');
    expect(el.querySelector('[data-state="broken"]') !== null).to.equal(true);
    expect(el.querySelectorAll('input').length).to.equal(0);
    expect(fd(formOf('broken'))).to.deep.equal([]);
  });

  it('moving the node re-binds in place (no re-render, no named input back); tampering while detached → re-render', async () => {
    const el = hostOf('nolabel');
    const table = el.querySelector('table');
    const other = document.createElement('form');
    document.body.appendChild(other);
    other.appendChild(el);
    expect(el.querySelector('table') === table).to.equal(true);
    expect(fd(other)).to.deep.equal(noJs.nolabel);
    const ev = [];
    el.addEventListener('change', (e) => ev.push(e.detail.trigger));
    el.querySelector('tr[data-r="0"]').cells[2].querySelector('input').click();
    expect(ev).to.deep.equal(['cell']);
    el.remove();
    el.querySelector('td.td-check-matrix__cell input').setAttribute('name', 'role[perms][1][]');
    other.appendChild(el);
    expect(el.querySelector('table') === table).to.equal(false, 're-rendered');
    expect(el.querySelectorAll('input[name]').length).to.equal(0);
    other.remove();
  });

  it(`hydrate of a 200 × 12 server grid within budget (100 ms × ${PERF_SLACK} slack) and adopted in place`, async () => {
    const columns = Array.from({ length: 12 }, (_, i) => ({ key: `c${i}`, label: `Vai trò ${i}` }));
    const rows = Array.from({ length: 20 }, (_, g) => ({ key: `g${g}`, label: `Nhóm ${g}`, rows: Array.from({ length: 10 }, (__, k) => ({ key: `p${g}.${k}`, label: `Quyền ${g}.${k}` })) }));
    const value = { c0: rows.flatMap((g) => g.rows.map((r) => r.key)).filter((_, i) => i % 3 === 0) };
    const model = validateMatrix({ columns, rows, value }).model;
    const inner = renderMatrix({ model, def: model.value, collapsed: model.groups.map(() => false), id: 'cm-big', label: 'Lớn', labels: MATRIX_LABELS,
      layout: 'auto', disabled: false, ssr: { name: 'big' } });
    const json = JSON.stringify({ v: 1, columns, rows, cells: {}, value }).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    const form = document.createElement('form');
    // the SSR host is created while the element is already defined: parse it in an inert template first, then insert
    const tpl = document.createElement('template');
    tpl.innerHTML = `<td-check-matrix data-td-ssr="check-matrix@1" id="cm-big" name="big" label="Lớn" data="${json}">${inner}</td-check-matrix>`;
    const host = tpl.content.firstElementChild;
    const t0 = performance.now();
    form.appendChild(document.importNode(host, true));
    document.body.appendChild(form);
    const ms = performance.now() - t0;
    const el = form.firstElementChild;
    expect(el.querySelector('tr[data-r="199"]') !== null).to.equal(true);
    expect(el.querySelectorAll('input[name]').length).to.equal(0);
    expect(fd(form).length).to.equal(12 + 67 + 1);
    expect(ms < 100 * PERF_SLACK, `${ms.toFixed(1)} ms`).to.equal(true);
    form.remove();
  });

  it('review r1 #3: a value set on a DEFINED but detached SSR host before its first connection wins over the live ticks', async () => {
    const box = document.createElement('div');
    box.innerHTML = `<form>${basic.replaceAll('cm-basic', 'cm-held')}</form>`;
    const host = box.querySelector('td-check-matrix');
    expect(host instanceof TdCheckMatrix).to.equal(true, 'upgraded while detached');
    host.querySelector('tr[data-r="2"]').cells[2].querySelector('input').checked = true; // a live tick (cat.edit × owner)
    host.value = { ship: ['dash.view'] };
    await raf(); // the queued value is flushed while still detached (no data read yet)
    document.body.appendChild(box);
    const form = box.firstElementChild;
    expect(host.querySelector('table') === box.querySelector('table')).to.equal(true);
    expect(host.value).to.deep.equal({ owner: [], sales: [], ship: ['dash.view'] });
    expect(fd(form).filter(([k]) => k.endsWith('[]'))).to.deep.equal([['perms[ship][]', 'dash.view']]);
    expect(host.querySelectorAll('input[name]').length).to.equal(0, 'adopted in place, no-JS form gone');
    form.reset();
    await raf();
    expect(fd(form).filter(([k]) => k.endsWith('[]'))).to.deep.equal(EXPECT_BASIC.filter(([k]) => k.endsWith('[]')), 'defaults = the data attribute');
    box.remove();
  });
});
