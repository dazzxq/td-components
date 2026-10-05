import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';
import { TdDiff } from './td-diff.js';

// v0.46.0 (plan docs/internal/plans/v0.46.0-diff.md QĐ 11–15, M2) — <td-diff>: one DOM, table / inline by container
// width (CSS only), explicit table roles, kind labels as TEXT, masked cells, text-only (XSS), native <details>, one
// render per task for property assignments. Chromium, Firefox and WebKit (group `engines`).
// DOM nodes are compared as booleans (`a === b`): a failing chai assertion carrying DOM nodes hangs the runner.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const root = document.createElement('div');
document.body.appendChild(root);
const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
const frames = async (n = 2) => { for (let i = 0; i < n; i++) await raf(); };
const tick = () => new Promise((r) => setTimeout(r, 0));

const warns = [];
const origWarn = console.warn;
const origLabels = { ...TdDiff.labels };
beforeEach(() => {
  warns.length = 0;
  console.warn = (...a) => { warns.push(a.map(String).join(' ')); };
});
afterEach(() => {
  console.warn = origWarn;
  Object.assign(TdDiff.labels, origLabels);
  root.innerHTML = '';
});

const ITEMS = () => [
  { key: 'price', label: 'Giá bán', type: 'money', before: 12990000, after: 11990000 },
  { key: 'status', label: 'Trạng thái', type: 'enum', options: { pending: 'Chờ xử lý', done: 'Xong' }, before: 'pending', after: 'done' },
  { key: 'note', label: 'Ghi chú', after: 'Mới' },
  { key: 'old', label: 'Cũ', before: 'x' },
  { key: 'same', label: 'Giữ nguyên', before: 'a', after: 'a' },
  { key: 'password', label: 'Mật khẩu', masked: true },
];

async function mk(data = { items: ITEMS() }, attrs = '', width = 800) {
  const wrap = document.createElement('div');
  wrap.style.width = `${width}px`;
  wrap.innerHTML = `<td-diff ${attrs}></td-diff>`;
  root.appendChild(wrap);
  const el = wrap.querySelector('td-diff');
  Object.assign(el, data);
  await tick();
  await frames(1);
  return el;
}
const rows = (el, scope = ':scope > .td-diff__scroll') => [...el.querySelectorAll(`${scope} .td-diff__row`)];
const cellText = (row, side) => row.querySelector(`.td-diff__cell--${side} .td-diff__value`)?.textContent ?? null;

describe('td-diff — render (QĐ 11–15)', () => {
  it('renders items: explicit roles, kind labels as text, formatted values, masked label in both cells', async () => {
    const el = await mk();
    const table = el.querySelector(':scope > .td-diff__scroll > table');
    expect(table.getAttribute('role')).to.equal('table');
    expect(table.getAttribute('aria-label')).to.equal('So sánh thay đổi');
    expect([...table.querySelectorAll('thead th')].map((t) => [t.getAttribute('role'), t.textContent])).to.deep.equal([
      ['columnheader', 'Trường'], ['columnheader', 'Trước'], ['columnheader', 'Sau']]);
    const rs = rows(el);
    expect(rs.map((r) => r.dataset.kind)).to.deep.equal(['changed', 'changed', 'added', 'removed', 'changed']);
    for (const r of rs) {
      expect(r.getAttribute('role')).to.equal('row');
      expect(r.querySelector('th').getAttribute('role')).to.equal('rowheader');
      expect([...r.querySelectorAll('td')].every((c) => c.getAttribute('role') === 'cell')).to.equal(true);
      expect(r.querySelector('.td-diff__kind').textContent).to.equal({ changed: 'Đổi', added: 'Thêm', removed: 'Xoá' }[r.dataset.kind]);
    }
    expect([cellText(rs[0], 'before'), cellText(rs[0], 'after')]).to.deep.equal(['12.990.000 ₫', '11.990.000 ₫']);
    expect([cellText(rs[1], 'before'), cellText(rs[1], 'after')]).to.deep.equal(['Chờ xử lý', 'Xong']);
    expect(rs[2].querySelector('.td-diff__cell--before .td-sr-only').textContent).to.equal('trống');
    expect([cellText(rs[4], 'before'), cellText(rs[4], 'after')]).to.deep.equal(['[ĐÃ ẨN]', '[ĐÃ ẨN]']);
    expect(rs[4].querySelector('.td-diff__badge').textContent).to.equal('Đã che');
    // unchanged rows collapse into <details> after the table (default unchanged="collapse")
    const un = el.querySelector(':scope > details.td-diff__unchanged');
    expect(un.querySelector('summary').textContent).to.equal('1 trường không đổi');
    expect(rows(el, ':scope > .td-diff__unchanged').map((r) => r.dataset.kind)).to.deep.equal(['unchanged']);
    expect(rows(el, ':scope > .td-diff__unchanged')[0].querySelector('.td-diff__kind')).to.equal(null);
    expect(el.counts).to.deep.equal({ added: 1, removed: 1, changed: 3, unchanged: 1, hidden: 0, truncated: false });
  });

  it('snapshots: before + after assigned in one task → ONE render; fields give labels; lists show + / − with hidden words', async () => {
    const wrap = document.createElement('div');
    wrap.innerHTML = '<td-diff></td-diff>';
    root.appendChild(wrap);
    const el = wrap.querySelector('td-diff');
    await tick();
    const records = [];
    const mo = new MutationObserver((r) => records.push(...r.filter((x) => x.target === el)));
    mo.observe(el, { childList: true });
    el.fields = [{ path: 'roles', label: 'Quyền' }];
    el.before = { roles: ['admin', 'editor'], name: 'A' };
    el.after = { roles: ['editor', 'viewer'], name: 'B' };
    await tick();
    mo.disconnect();
    expect(records.length).to.equal(1);
    const r = rows(el)[0];
    expect(r.querySelector('.td-diff__label').textContent).to.equal('Quyền');
    const after = [...r.querySelectorAll('.td-diff__cell--after li')];
    expect(after.map((li) => li.dataset.mark || '')).to.deep.equal(['', 'add']);
    expect(after[1].textContent).to.equal('+thêm viewer');
    expect(after[1].querySelector('.td-diff__mark').getAttribute('aria-hidden')).to.equal('true');
    const before = [...r.querySelectorAll('.td-diff__cell--before li')];
    expect(before.map((li) => li.dataset.mark || '')).to.deep.equal(['del', '']);
    expect(before[0].textContent).to.equal('−bỏ admin');
  });

  it('items + before/after → items win, ONE warning; invalid kind → one warning (no value in it)', async () => {
    const el = await mk({ items: [{ key: 'a', before: 'x', after: 'secret-y', kind: 'weird' }], before: { b: 1 } });
    expect(rows(el).length).to.equal(1);
    el.items = [{ key: 'a', before: 'x', after: 'z', kind: 'weird' }];
    await tick();
    expect(warns.filter((w) => w.includes('items')).length).to.equal(1);
    expect(warns.filter((w) => w.includes('kind')).length).to.equal(1);
    expect(warns.some((w) => w.includes('secret'))).to.equal(false);
  });

  it('empty: no data → "Không có thay đổi."; only unchanged rows → empty text + the collapsed block', async () => {
    const el = await mk({});
    expect(el.firstElementChild.matches('p.td-diff__empty')).to.equal(true);
    expect(el.textContent).to.equal('Không có thay đổi.');
    el.items = [{ key: 'a', before: 1, after: 1 }];
    await tick();
    expect(el.firstElementChild.matches('p.td-diff__empty')).to.equal(true);
    expect(!!el.querySelector(':scope > details.td-diff__unchanged')).to.equal(true);
  });

  it('unchanged="show" keeps rows in place, "hide" drops them; json attribute adds the JSON view', async () => {
    const el = await mk({ items: ITEMS() }, 'unchanged="show"');
    expect(rows(el).map((r) => r.dataset.kind)).to.include('unchanged');
    expect(el.querySelector('.td-diff__unchanged')).to.equal(null);
    el.setAttribute('unchanged', 'hide');
    expect(rows(el).map((r) => r.dataset.kind)).to.not.include('unchanged');
    expect(el.querySelector('.td-diff__unchanged')).to.equal(null);
    el.toggleAttribute('json', true);
    const pres = [...el.querySelectorAll(':scope > details.td-diff__json pre.td-diff__pre')];
    expect(pres.map((p) => [p.getAttribute('tabindex'), p.getAttribute('aria-label')])).to.deep.equal([['0', 'JSON trước'], ['0', 'JSON sau']]);
    expect(pres[1].textContent).to.contain('"password": "[ĐÃ ẨN]"');
    expect(pres[1].textContent).to.contain('"price": 11990000');
    el.setAttribute('label', 'Thay đổi đơn #12');
    expect(el.querySelector(':scope > .td-diff__scroll > table').getAttribute('aria-label')).to.equal('Thay đổi đơn #12');
  });

  it('bidi / zero-width characters are shown as ⟨U+…⟩ (muted spans), values are isolated (dir=auto)', async () => {
    const el = await mk({ items: [{ key: 'file', before: 'invoice\u202Efdp.exe', after: 'a\u200Bb' }] });
    const r = rows(el)[0];
    expect(r.querySelector('.td-diff__cell--before .td-diff__value').textContent).to.equal('invoice⟨U+202E⟩fdp.exe');
    expect(r.querySelector('.td-diff__cell--before .td-diff__ctl').textContent).to.equal('⟨U+202E⟩');
    expect(r.querySelector('.td-diff__cell--before .td-diff__value').getAttribute('dir')).to.equal('auto');
    expect(getComputedStyle(r.querySelector('.td-diff__value')).unicodeBidi).to.equal('isolate');
    expect(el.textContent.includes('\u202E')).to.equal(false);
  });

  it('long values: 300-code-point preview + native <details> "Xem đầy đủ (n ký tự)"', async () => {
    const long = 'ab'.repeat(400);
    const el = await mk({ items: [{ key: 'desc', before: 'x', after: long }] });
    const cell = rows(el)[0].querySelector('.td-diff__cell--after');
    expect(cell.querySelector(':scope > .td-diff__value').textContent).to.equal(`${long.slice(0, 300)}…`);
    const more = cell.querySelector(':scope > details.td-diff__more');
    expect(more.querySelector('summary').textContent).to.equal('Xem đầy đủ (800 ký tự)');
    expect(more.querySelector('.td-diff__value--full').textContent).to.equal(long);
  });
});

describe('td-diff — layout (QĐ 11, ADR 0014)', () => {
  it('table ≥ 480px of host, inline below; view forces; resizing never re-renders (same nodes)', async () => {
    const el = await mk({ items: ITEMS() }, '', 600);
    const table = el.querySelector('table');
    const firstRow = rows(el)[0];
    expect(getComputedStyle(table).display).to.equal('table');
    expect(getComputedStyle(el.querySelector('.td-diff__side')).display).to.equal('none');
    el.parentElement.style.width = '360px';
    await frames(2);
    expect(getComputedStyle(table).display).to.equal('block');
    expect(getComputedStyle(el.querySelector('thead')).display).to.equal('none');
    expect(getComputedStyle(firstRow.querySelector('.td-diff__side')).display).to.not.equal('none');
    // added: before cell hidden; removed: after cell hidden (still in the DOM)
    const added = rows(el).find((r) => r.dataset.kind === 'added');
    expect(getComputedStyle(added.querySelector('.td-diff__cell--before')).display).to.equal('none');
    expect(table === el.querySelector('table') && firstRow === rows(el)[0]).to.equal(true);
    el.setAttribute('view', 'table');
    await frames(1);
    expect(getComputedStyle(table).display).to.equal('table');
    expect(table === el.querySelector('table')).to.equal(true);
    expect(el.scrollWidth <= el.clientWidth + 1).to.equal(true); // the page never scrolls: the inner box does
    el.parentElement.style.width = '800px';
    el.setAttribute('view', 'inline');
    await frames(1);
    expect(getComputedStyle(table).display).to.equal('block');
    // roles stay on every element in both layouts
    expect(rows(el).every((r) => r.getAttribute('role') === 'row')).to.equal(true);
    if ('computedRole' in Element.prototype) {
      expect(table.computedRole).to.equal('table');
      expect(firstRow.computedRole).to.equal('row');
    }
  });
});

describe('td-diff — text only (XSS, security-model)', () => {
  it('payloads in key / label / value / enum options / fields / labels stay text: no new element, no on* / style', async () => {
    const P = '<img src=x onerror="window.__pwned=1">';
    const Q = '"><svg onload="window.__pwned=1">';
    TdDiff.labels.added = P;
    const el = await mk({ items: [
      { key: P, after: Q }, { key: 'k', label: Q, type: 'enum', options: { v: P }, before: 'v', after: Q },
      { key: 'l', before: [P], after: [Q] }, { key: 'o', after: { [P]: { [Q]: 1 } } },
    ] }, 'json');
    el.toggleAttribute('json', true);
    const snap = await mk({ before: { [P]: Q }, after: { [P]: P, x: { [Q]: [P, { y: Q }] } }, fields: [{ path: P, label: Q }] }, 'json');
    await frames(1);
    for (const host of [el, snap]) {
      expect(host.querySelector('img, svg, script, iframe')).to.equal(null);
      for (const n of host.querySelectorAll('*')) {
        expect(n.getAttributeNames().some((a) => a.startsWith('on') || a === 'style')).to.equal(false);
      }
      expect(host.textContent).to.contain('<img src=x');
    }
    expect(window.__pwned).to.equal(undefined);
  });

  it('masked item: a non-string secret never reaches the DOM, attributes, counts or the console', async () => {
    const SECRET = 4111111111111111;
    const el = await mk({ items: [{ key: 'card', masked: true, before: SECRET, after: { pan: 'PAN-SECRET' } },
      { key: 'phone', masked: true, before: '***678', after: '***901' }] }, 'json');
    const html = el.outerHTML;
    expect(html.includes(String(SECRET))).to.equal(false);
    expect(html.includes('4.111')).to.equal(false);
    expect(html.includes('PAN-SECRET')).to.equal(false);
    expect(JSON.stringify(el.counts).includes('4111')).to.equal(false);
    expect(warns.join(' ').includes('4111')).to.equal(false);
    // server-masked strings are shown verbatim (dsuite clarification 2026-10-06)
    const phone = rows(el)[1];
    expect([cellText(phone, 'before'), cellText(phone, 'after')]).to.deep.equal(['***678', '***901']);
  });
});

describe('td-diff — keyboard (QĐ 14)', () => {
  it('<summary> opens with Enter / Space; <pre> is focusable', async () => {
    const el = await mk({ items: [{ key: 'a', before: 1, after: 1 }, { key: 'b', before: 1, after: 2 }] }, 'json');
    const un = el.querySelector('.td-diff__unchanged');
    un.querySelector('summary').focus();
    await sendKeys({ press: 'Enter' });
    await frames(1);
    expect(un.open).to.equal(true);
    const js = el.querySelector('.td-diff__json');
    js.querySelector('summary').focus();
    await sendKeys({ press: ' ' });
    await frames(1);
    expect(js.open).to.equal(true);
    const pre = js.querySelector('pre');
    pre.focus();
    expect(document.activeElement === pre).to.equal(true);
  });
});
