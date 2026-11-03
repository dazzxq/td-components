import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';

// v0.95.0 (plan docs/internal/plans/v0.95.0-check-matrix.md §13.2, ADR 0040) — <td-check-matrix mode="override"> in
// Chromium, Firefox AND WebKit: three states per cell (inherit → grant → deny), real key presses (Space / Shift+Space
// = exactly ONE step and ONE `change` — no second click synthesised at keyup), + = - Delete Backspace 0, locked cells
// never change and are always sent, bulk cells (uniform → next, mixed → inherit, hidden → never), the reset button
// (grid = all, narrow = the visible column), form.reset() / restore, a mode change after data, disabled, the a11y
// DOM, the M0 budget; SSR contract `check-matrix@2` (server <select> form, never adopted in place: values chosen
// before the module loaded are kept, anything else renders from `data`). DOM nodes compared as booleans (a failing
// chai assertion carrying DOM nodes hangs the runner). Waits are rAF-polled. NO static import of the component: the
// SSR fixture is read before define.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });
document.addEventListener('submit', (e) => e.preventDefault(), true);

const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
async function waitFor(cond, what = 'condition', timeout = 5000) {
  const end = performance.now() + timeout;
  while (performance.now() < end) {
    if (cond()) return;
    await raf();
  }
  throw new Error(`timeout waiting for ${what}`);
}
const fd = (form) => [...new FormData(form)];
const PERF_SLACK = (globalThis.__TD_PERF_STRICT ? 1 : 20) * (/Chrome\//.test(navigator.userAgent) ? 1 : 4);

// --- SSR (before the module loads) ---
const FIXTURE = await (await fetch('/test/ssr/fixtures/check-matrix.html')).text();
const TPL = document.createElement('template');
TPL.innerHTML = FIXTURE;
const ssrHtml = (id) => TPL.content.querySelector(`form[data-case="${id}"] > td-check-matrix`).outerHTML;
const ssrRoot = document.createElement('div');
const OV_CASES = ['override-basic', 'override-locked', 'override-disabled', 'override-intkeys', 'override-broken'];
ssrRoot.innerHTML = OV_CASES.map((id) => TPL.content.querySelector(`form[data-case="${id}"]`).outerHTML).join('');
// hand-written mismatches of override-basic: never adopted, never a value read from the markup
const basicO = ssrHtml('override-basic');
const MM = {
  'om-nomode': basicO.replace(' mode="override"', ''),
  'om-v1': basicO.replace('data-td-ssr="check-matrix@2"', 'data-td-ssr="check-matrix@1"'),
  'om-option': basicO.replace('<option value="deny">', '<option value="owner">'),
  'om-formaction': basicO.replace('<button type="button" class="td-btn td-btn--ghost', '<button type="button" formaction="/evil" class="td-btn td-btn--ghost'),
};
ssrRoot.innerHTML += Object.entries(MM).map(([id, html]) => `<form data-case="${id}">${html.replaceAll('cm-ov', `cm-${id}`)}</form>`).join('');
document.body.appendChild(ssrRoot);
const sForm = (id) => ssrRoot.querySelector(`form[data-case="${id}"]`);
const sHost = (id) => sForm(id).querySelector('td-check-matrix');
const sCell = (id, r, c) => sHost(id).querySelector(`tr[data-r="${r}"]`).cells[2 + c];

const noJs = Object.fromEntries(OV_CASES.map((id) => [id, fd(sForm(id))]));
// before define: the user picks "deny" for Bán hàng × Xem tổng quan, and on a mismatch host too (must NOT be read)
const pick = (id, r, c, v) => {
  const sel = sCell(id, r, c).querySelector('select');
  sel.value = v;
  sel.dispatchEvent(new Event('change', { bubbles: true }));
  return sel;
};
pick('override-basic', 0, 1, 'deny');
pick('om-option', 0, 1, 'grant');
sCell('override-basic', 1, 0).querySelector('select').focus();

const warns = [];
const origWarn = console.warn;
console.warn = (...a) => warns.push(a.join(' '));
const { TdCheckMatrix } = await import('./td-check-matrix.js');
await customElements.whenDefined('td-check-matrix');
console.warn = origWarn;
const focusAfterDefine = document.activeElement;

// --- client-side fixtures ---
const extra = [];
afterEach(() => { extra.splice(0).forEach((f) => f()); });
const COLS = () => [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }, { key: 'c', label: 'C' }];
const ROWS = () => [
  { key: 'r0', label: 'R0' },
  { key: 'g1', label: 'G1', rows: [{ key: 'r1', label: 'R1' }, { key: 'r2', label: 'R2' }] },
];
const CELLS = () => ({ r0: { a: { inherited: true }, b: { inherited: false } }, r1: { b: { locked: true, note: 'khoá' } }, r2: { c: { na: true } } });
const VALUE = () => ({ b: { r1: 'deny' } });

function mount(attrs = 'name="p" mode="override" label="Quyền" layout="grid"', data = { columns: COLS(), rows: ROWS(), cells: CELLS(), value: VALUE() }, wrap = '') {
  const box = document.createElement('div');
  box.innerHTML = `<form ${wrap}><input id="before" aria-label="trước"><td-check-matrix ${attrs}></td-check-matrix><input id="after" aria-label="sau"></form>`;
  document.body.appendChild(box);
  extra.push(() => box.remove());
  const el = box.querySelector('td-check-matrix');
  if (data) el.setData(data);
  return el;
}
const formOf = (el) => el.closest('form');
const cellOf = (el, r, c) => el.querySelector(`tr[data-r="${r}"]`).cells[2 + c];
const triOf = (el, r, c) => cellOf(el, r, c).querySelector('.td-check-matrix__tri');
const stateOf = (el, r, c) => cellOf(el, r, c).getAttribute('data-state');
const bulkOf = (el, sel) => el.querySelector(`.td-check-matrix__bulk${sel}`);
const events = (el) => {
  const ev = [];
  el.addEventListener('change', (e) => { if (e instanceof CustomEvent) ev.push(e.detail); });
  return ev;
};
const entriesOf = (el) => fd(formOf(el)).filter(([k]) => k.startsWith('p['));
async function press(key) {
  await sendKeys({ press: key });
  await raf();
}

describe('v0.95.0 td-check-matrix mode="override" (3 engines)', () => {
  it('click cycles inherit → grant → deny → inherit: one `change` each with `changes` + FormData after every step', async () => {
    const el = mount();
    await raf();
    const ev = events(el);
    expect(entriesOf(el)).to.deep.equal([['p[a]', ''], ['p[b]', ''], ['p[c]', ''],
      ['p[a][r0]', 'inherit'], ['p[b][r0]', 'inherit'], ['p[c][r0]', 'inherit'],
      ['p[a][r1]', 'inherit'], ['p[b][r1]', 'deny'], ['p[c][r1]', 'inherit'],
      ['p[a][r2]', 'inherit'], ['p[b][r2]', 'inherit'], ['p[_v]', '2']]);
    const seen = [];
    for (let k = 0; k < 3; k++) {
      triOf(el, 0, 0).click();
      seen.push([stateOf(el, 0, 0), entriesOf(el)[3][1]]);
    }
    expect(seen).to.deep.equal([['grant', 'grant'], ['deny', 'deny'], ['inherit', 'inherit']]);
    expect(ev).to.deep.equal([
      { changes: [['r0', 'a', 'inherit', 'grant']], trigger: 'cell' },
      { changes: [['r0', 'a', 'grant', 'deny']], trigger: 'cell' },
      { changes: [['r0', 'a', 'deny', 'inherit']], trigger: 'cell' },
    ]);
    expect(el.getValue()).to.deep.equal({ a: {}, b: { r1: 'deny' }, c: {} });
  });

  it('Space = ONE step + ONE change (no second click at keyup); Shift+Space backwards; + = - Delete Backspace 0', async () => {
    const el = mount();
    await raf();
    const ev = events(el);
    triOf(el, 0, 0).focus();
    await press('Space');
    expect(stateOf(el, 0, 0)).to.equal('grant');
    expect(ev.length).to.equal(1, 'Space: one change');
    await press('Space');
    expect(stateOf(el, 0, 0)).to.equal('deny');
    expect(ev.length).to.equal(2);
    await press('Shift+Space');
    expect(stateOf(el, 0, 0)).to.equal('grant', 'Shift+Space: one step back');
    expect(ev.length).to.equal(3, 'Shift+Space: one change');
    await press('Shift+Space');
    expect(stateOf(el, 0, 0)).to.equal('inherit');
    const steps = [];
    for (const [key, want] of [['+', 'grant'], ['-', 'deny'], ['Delete', 'inherit'], ['=', 'grant'], ['Backspace', 'inherit'], ['-', 'deny'], ['0', 'inherit']]) {
      await press(key);
      steps.push([key, stateOf(el, 0, 0) === want]);
    }
    expect(steps.every(([, ok]) => ok), JSON.stringify(steps)).to.equal(true);
    expect(ev.length).to.equal(4 + 7);
    expect(ev.every((d) => d.trigger === 'cell' && d.changes.length === 1)).to.equal(true);
    await press('0');
    expect(ev.length).to.equal(11, 'setting the same state: no event');
    expect(document.activeElement === triOf(el, 0, 0)).to.equal(true);
  });

  it('a locked cell never changes (click, keys, bulk, reset, narrow) and is always sent once', async () => {
    const el = mount();
    await raf();
    const ev = events(el);
    const locked = triOf(el, 1, 1);
    expect(locked.disabled).to.equal(true);
    locked.click();
    cellOf(el, 1, 1).click();
    expect(stateOf(el, 1, 1)).to.equal('deny');
    bulkOf(el, '[data-kind="all"]').querySelector('button').click();
    bulkOf(el, '[data-kind="column"][data-c="1"]').querySelector('button').click();
    el.querySelector('.td-check-matrix__reset').click();
    expect(stateOf(el, 1, 1)).to.equal('deny');
    expect(ev.every((d) => d.changes.every(([r, c]) => !(r === 'r1' && c === 'b')))).to.equal(true);
    expect(entriesOf(el).filter(([k]) => k === 'p[b][r1]')).to.deep.equal([['p[b][r1]', 'deny']]);
    el.setAttribute('layout', 'column');
    await raf();
    el.querySelector('.td-check-matrix__colpick').value = '1';
    el.querySelector('.td-check-matrix__colpick').dispatchEvent(new Event('change', { bubbles: true }));
    await raf();
    el.querySelector('.td-check-matrix__bar .td-check-matrix__bulk button').click();
    el.querySelector('.td-check-matrix__reset').click();
    expect(stateOf(el, 1, 1)).to.equal('deny');
  });

  it('bulk: uniform → next, mixed → inherit, shown state + "Lẫn lộn", disabled when no free cell; one change per action', async () => {
    const el = mount('name="p" mode="override" label="Q" layout="grid"', { columns: [{ key: 'a', label: 'A' }, { key: 'b', label: 'B', locked: true }],
      rows: [{ key: 'r0', label: 'R0' }, { key: 'r1', label: 'R1' }], value: { b: { r0: 'grant' } } });
    await raf();
    const ev = events(el);
    const colA = bulkOf(el, '[data-kind="column"][data-c="0"]');
    const colB = bulkOf(el, '[data-kind="column"][data-c="1"]');
    const all = bulkOf(el, '[data-kind="all"]');
    expect([colA.getAttribute('data-state'), colB.getAttribute('data-state'), all.getAttribute('data-state')]).to.deep.equal(['inherit', 'mixed', 'mixed']);
    expect(colB.querySelector('button').disabled).to.equal(true, 'a set without a free cell');
    expect(all.querySelector('.td-sr-only[id$="s"]').textContent).to.equal('Lẫn lộn');
    colA.querySelector('button').click(); // uniform inherit → grant
    expect([stateOf(el, 0, 0), stateOf(el, 1, 0)]).to.deep.equal(['grant', 'grant']);
    expect(ev.at(-1)).to.deep.equal({ changes: [['r0', 'a', 'inherit', 'grant'], ['r1', 'a', 'inherit', 'grant']], trigger: 'column' });
    triOf(el, 0, 0).click(); // grant → deny: column a mixed
    expect(colA.getAttribute('data-state')).to.equal('mixed');
    colA.querySelector('button').click(); // mixed → inherit
    expect([stateOf(el, 0, 0), stateOf(el, 1, 0)]).to.deep.equal(['inherit', 'inherit']);
    expect(ev.at(-1).trigger).to.equal('column');
    all.querySelector('button').click(); // free cells all inherit (locked grant ignored) → grant
    expect([stateOf(el, 0, 0), stateOf(el, 1, 0), stateOf(el, 0, 1)]).to.deep.equal(['grant', 'grant', 'grant']);
    expect(ev.at(-1).trigger).to.equal('all');
    expect(ev.length).to.equal(4);
  });

  it('a hidden bulk (narrow mode) never changes anything', async () => {
    const el = mount('name="p" mode="override" label="Q" layout="column"');
    await raf();
    const ev = events(el);
    const row = bulkOf(el, '[data-kind="row"]');
    expect(row.getClientRects().length).to.equal(0, 'the row bulk is hidden in the narrow mode');
    row.querySelector('button').click();
    bulkOf(el, '[data-kind="all"]').querySelector('button').click();
    expect(ev).to.deep.equal([]);
  });

  it('reset: grid = every free cell, narrow = the picked column; disabled at the right time; live region', async () => {
    const el = mount('name="p" mode="override" label="Q" layout="grid"', { columns: COLS(), rows: ROWS(), cells: CELLS(),
      value: { a: { r0: 'grant' }, c: { r1: 'deny' } } });
    await raf();
    const ev = events(el);
    const reset = el.querySelector('.td-check-matrix__reset');
    expect([reset.disabled, reset.textContent]).to.deep.equal([false, 'Đặt lại về kế thừa']);
    reset.click();
    expect(ev.at(-1)).to.deep.equal({ changes: [['r0', 'a', 'grant', 'inherit'], ['r1', 'c', 'deny', 'inherit']], trigger: 'inherit' });
    expect(el.querySelector('[role="status"]').textContent).to.equal('Đã đổi 2 ô');
    expect(reset.disabled).to.equal(true, 'nothing left to reset');
    triOf(el, 0, 0).click();
    triOf(el, 0, 2).click();
    expect(reset.disabled).to.equal(false);
    el.setAttribute('layout', 'column');
    await waitFor(() => el.querySelector('.td-check-matrix__colpick').getClientRects().length > 0, 'narrow bar');
    expect(reset.textContent).to.equal('Đặt lại cột A');
    reset.click();
    expect([stateOf(el, 0, 0), stateOf(el, 0, 2)]).to.deep.equal(['inherit', 'grant'], 'only the visible column');
    expect(reset.disabled).to.equal(true, 'column A has nothing left');
  });

  it('form.reset() → the defaults, trigger reset; restore state v:2 (v:1 refused)', async () => {
    const el = mount();
    await raf();
    const ev = events(el);
    triOf(el, 0, 0).click();
    triOf(el, 2, 0).click();
    expect(el.changedCount).to.equal(2);
    formOf(el).reset();
    await waitFor(() => ev.length === 3, 'reset event');
    expect(ev.at(-1).trigger).to.equal('reset');
    expect(el.changedCount).to.equal(0);
    expect(stateOf(el, 0, 0)).to.equal('inherit');
    el.formStateRestoreCallback(JSON.stringify({ v: 2, value: { a: { r0: 'deny' }, b: { r1: 'deny' } } }), 'restore');
    expect(stateOf(el, 0, 0)).to.equal('deny');
    expect(el.changedCount).to.equal(1);
    el.formStateRestoreCallback(JSON.stringify({ v: 1, value: { a: ['r0'] } }), 'restore');
    expect(stateOf(el, 0, 0)).to.equal('deny', 'a check-mode state is ignored');
  });

  it('changing `mode` after data → empty, nothing submitted, one warning; setData again works', async () => {
    const el = mount();
    await raf();
    const w = [];
    const orig = console.warn;
    console.warn = (...a) => w.push(a.join(' '));
    try {
      el.setAttribute('mode', 'check');
      await raf();
    } finally {
      console.warn = orig;
    }
    expect(entriesOf(el)).to.deep.equal([]);
    expect(el.querySelector('table')).to.equal(null);
    expect(w.filter((s) => s.includes('mode changed')).length).to.equal(1);
    el.setData({ columns: COLS(), rows: ROWS(), value: { a: ['r0'] } });
    await raf();
    expect(entriesOf(el).at(-1)).to.deep.equal(['p[_v]', '1']);
    expect(el.querySelectorAll('.td-check-matrix__tri').length).to.equal(0);
  });

  it('disabled / <fieldset disabled>: nothing submitted, every button disabled', async () => {
    const el = mount('name="p" mode="override" label="Q" layout="grid" disabled');
    await raf();
    expect(entriesOf(el)).to.deep.equal([]);
    expect([...el.querySelectorAll('.td-check-matrix__tri, .td-check-matrix__reset')].every((b) => b.disabled)).to.equal(true);
    const box = document.createElement('div');
    box.innerHTML = '<form><fieldset disabled><td-check-matrix name="p" mode="override" label="Q"></td-check-matrix></fieldset></form>';
    document.body.appendChild(box);
    extra.push(() => box.remove());
    const f = box.querySelector('td-check-matrix');
    f.setData({ columns: COLS(), rows: ROWS() });
    await raf();
    expect(fd(box.querySelector('form'))).to.deep.equal([]);
    expect([...f.querySelectorAll('.td-check-matrix__tri')].every((b) => b.disabled)).to.equal(true);
  });

  it('a11y DOM: name from 3 ids, one keys node, the note joins aria-describedby, labels / notes are text only', async () => {
    const el = mount('id="ax" name="p" mode="override" label="Q" layout="grid"', { columns: [{ key: 'k', label: 'Cột' }],
      rows: [{ key: 'r0', label: 'Xem' }, { key: 'r1', label: '"><img src=x onerror=alert(1)>' }], cells: { r1: { k: { locked: true, note: '<b>Lý do</b>' } } } });
    await raf();
    expect(el.querySelectorAll('img').length).to.equal(0);
    const btn = triOf(el, 0, 0);
    const ids = btn.getAttribute('aria-labelledby').split(' ');
    expect(ids).to.deep.equal(['ax-r0', 'ax-c0', 'ax-s0']);
    expect(ids.map((id) => document.getElementById(id).textContent.trim())).to.deep.equal(['Xem', 'Cột', 'Kế thừa']);
    expect(el.querySelectorAll('[id="ax-keys"]').length).to.equal(1);
    expect(btn.getAttribute('aria-describedby')).to.equal('ax-keys');
    const lockedBtn = triOf(el, 1, 0);
    expect(lockedBtn.getAttribute('aria-describedby').split(' ')[0]).to.equal('ax-keys');
    const nid = lockedBtn.getAttribute('aria-describedby').split(' ')[1];
    expect(document.getElementById(nid).textContent).to.equal('<b>Lý do</b>');
    expect([...el.querySelectorAll('[id]')].every((n) => /^ax-[a-z0-9-]+$/.test(n.id))).to.equal(true);
    expect(el.querySelectorAll('b').length).to.equal(0);
    expect(entriesOf(el)[0]).to.deep.equal(['p[k]', '']);
  });

  it(`M0: 500 × 20 override grid renders + one click within budget (1500 ms × ${PERF_SLACK} slack)`, async () => {
    const columns = Array.from({ length: 20 }, (_, i) => ({ key: `c${i}`, label: `Cột ${i}` }));
    const rows = Array.from({ length: 25 }, (_, g) => ({ key: `g${g}`, label: `Nhóm ${g}`, rows: Array.from({ length: 20 }, (_, k) => ({ key: `r${g}.${k}`, label: `Quyền ${k}` })) }));
    const t0 = performance.now();
    const el = mount('name="p" mode="override" label="Q" layout="grid" max-height="20rem"', { columns, rows });
    await raf();
    triOf(el, 3, 3).click();
    const dt = performance.now() - t0;
    expect(stateOf(el, 3, 3)).to.equal('grant');
    expect(dt).to.be.below(1500 * PERF_SLACK);
  });
});

describe('v0.95.0 td-check-matrix — SSR check-matrix@2', () => {
  it('no JS: one <select> per cell, the exact FormData of the contract; locked = hidden input; disabled / broken send nothing', () => {
    expect(noJs['override-basic']).to.deep.equal([['perms[owner]', ''], ['perms[sales]', ''], ['perms[ship]', ''],
      ['perms[owner][dash.view]', 'grant'], ['perms[sales][dash.view]', 'inherit'], ['perms[ship][dash.view]', 'inherit'],
      ['perms[owner][cat.view]', 'inherit'], ['perms[sales][cat.view]', 'grant'], ['perms[ship][cat.view]', 'inherit'],
      ['perms[owner][cat.edit]', 'deny'], ['perms[sales][cat.edit]', 'inherit'],
      ['perms[owner][ord.list]', 'inherit'], ['perms[sales][ord.list]', 'inherit'], ['perms[ship][ord.list]', 'inherit'],
      ['perms[_v]', '2']]);
    expect(noJs['override-locked']).to.deep.equal([['perms[a]', ''], ['perms[b]', ''], ['perms[a][r1]', 'inherit'], ['perms[b][r1]', 'deny'],
      ['perms[a][r2]', 'grant'], ['perms[b][r2]', 'inherit'], ['perms[_v]', '2']]);
    expect(noJs['override-intkeys']).to.deep.equal([['role[perms][3]', ''], ['role[perms][x]', ''], ['role[perms][3][0]', 'deny'],
      ['role[perms][x][0]', 'inherit'], ['role[perms][3][12]', 'grant'], ['role[perms][x][12]', 'inherit'], ['role[perms][_v]', '2']]);
    expect(noJs['override-disabled']).to.deep.equal([]);
    expect(noJs['override-broken']).to.deep.equal([]);
  });

  it('@2 + matching markup: rendered again (buttons, no select left), the value picked before JS kept, focus back, no warning', () => {
    const el = sHost('override-basic');
    expect(el.hasAttribute('data-td-ssr')).to.equal(false);
    expect(el.querySelectorAll('select.td-check-matrix__select, input[name], input[type="hidden"]').length).to.equal(0);
    expect(el.querySelectorAll('.td-check-matrix__tri').length > 0).to.equal(true);
    expect(sCell('override-basic', 0, 1).getAttribute('data-state')).to.equal('deny', 'picked before define');
    expect(el.changedCount).to.equal(1);
    const sent = fd(sForm('override-basic'));
    expect(sent.find(([k]) => k === 'perms[sales][dash.view]')).to.deep.equal(['perms[sales][dash.view]', 'deny']);
    expect(sent.length).to.equal(noJs['override-basic'].length, 'never a duplicate entry');
    expect(focusAfterDefine === sCell('override-basic', 1, 0).querySelector('.td-check-matrix__tri')).to.equal(true);
    expect(warns.filter((w) => w.includes('cm-ov') || w.includes('override-basic')).length).to.equal(0);
    expect(TdCheckMatrix.SSR_SCHEMA_OVERRIDE).to.equal(2);
  });

  it('locked / intkeys / disabled hosts: same FormData after upgrade; broken stays broken', () => {
    expect(fd(sForm('override-locked'))).to.deep.equal(noJs['override-locked']);
    expect(fd(sForm('override-intkeys'))).to.deep.equal(noJs['override-intkeys']);
    expect(fd(sForm('override-disabled'))).to.deep.equal([]);
    expect(sHost('override-broken').querySelector('[data-state="broken"]') !== null).to.equal(true);
    expect(fd(sForm('override-broken'))).to.deep.equal([]);
  });

  it('mismatch (mode missing / @1 / an unknown option / formaction) → render from `data`, no value from the markup', () => {
    for (const id of Object.keys(MM)) {
      const el = sHost(id);
      expect(el.querySelectorAll('select.td-check-matrix__select, input[name], [formaction]').length, id).to.equal(0);
      if (id === 'om-nomode' || id === 'om-v1') continue; // check mode / wrong version: the data does not fit the mode
      const cell = el.querySelector('tr[data-r="0"]').cells[3];
      expect(cell.getAttribute('data-state'), id).to.equal('inherit', 'the select picked before JS is never read');
      expect(el.changedCount, id).to.equal(0);
    }
  });
});
