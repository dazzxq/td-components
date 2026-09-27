import { expect } from '@esm-bundle/chai';
import { sendKeys, emulateMedia } from '@web/test-runner-commands';
import { TdTable } from './td-table.js';
import { TdButton } from '../form/td-button.js';

// Batch 4 — td-table token-native (plan docs/plans/v0.10.0-batch4.md step 2: D11–D22). td.css only.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const host = document.createElement('div');
document.body.appendChild(host);
const mount = (html, parent = host) => { parent.insertAdjacentHTML('beforeend', html.trim()); return parent.lastElementChild; };
const frames = (n = 2) => new Promise((r) => { const step = (k) => (k ? requestAnimationFrame(() => step(k - 1)) : r()); step(n); });
/** never hand DOM elements to chai deep asserts (it hangs inspecting them) */
const same = (a, b) => a === b;

const COLS = [
  { key: 'id', label: 'ID', sortable: true },
  { key: 'name', label: 'Tên', sortable: true },
  { key: 'role', label: 'Vai trò' },
];
const ROWS = Array.from({ length: 23 }, (_, i) => ({ id: i + 1, name: `Người ${i + 1}`, role: i % 2 ? 'Editor' : 'Admin' }));

function table(attrs = '', { columns = COLS, data = ROWS, parent = host } = {}) {
  const el = mount(`<td-table ${attrs}></td-table>`, parent);
  el.columns = columns.map((c) => ({ ...c }));
  if (data) el.data = data.map((r) => ({ ...r }));
  return el;
}
const ths = (el) => [...el.querySelectorAll('.td-table__th')];
const rows = (el) => [...el.querySelectorAll('.td-table__body > .td-table__row')];
const col = (el, ci) => rows(el).map((tr) => tr.children[ci].textContent);
const sortBtn = (el, ci) => el.querySelector(`.td-table__sort[data-sort-col="${ci}"]`);
const pagTop = (el) => el.querySelector('.td-table__header td-pagination');
const pagBottom = (el) => el.querySelector('.td-table__footer td-pagination');

let warnings = [];
const origWarn = console.warn;
beforeEach(() => {
  warnings = [];
  console.warn = (...a) => { warnings.push(a.join(' ')); };
});
afterEach(async () => {
  console.warn = origWarn;
  host.innerHTML = '';
  document.documentElement.removeAttribute('data-td-theme');
  await emulateMedia({ reducedMotion: 'no-preference' });
});

/* WCAG contrast from computed colours */
function rgb(str) {
  const m = /rgba?\(([^)]+)\)/.exec(str);
  const n = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  return { r: n[0], g: n[1], b: n[2], a: n.length > 3 ? n[3] : 1 };
}
const ratio = (a, b) => {
  const [x, y] = [TdButton._luminance(rgb(a)), TdButton._luminance(rgb(b))].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const KEEP = ['type', 'role', 'aria-hidden', 'hidden', 'id', 'scope', 'colspan', 'aria-label', 'aria-labelledby',
  'aria-sort', 'aria-busy', 'data-state', 'data-col', 'data-col-key', 'data-sort-col', 'data-row-idx',
  'data-sort-icon', 'tabindex', 'quiet', 'heading-level', 'title', 'message', 'compact', 'size'];
const OPAQUE = new Set(['td-pagination', 'td-empty-state']);
function shape(el) {
  const attrs = KEEP.filter((a) => el.hasAttribute(a)).map((a) => `${a}=${el.getAttribute(a)}`);
  const cls = [...el.classList].sort().join('.');
  const leaf = OPAQUE.has(el.localName) || el.classList.contains('td-table__sort-icon');
  const kids = leaf ? [] : [...el.children].map(shape);
  const text = el.children.length === 0 && !leaf ? el.textContent.trim() : '';
  return { tag: el.localName, cls, attrs, text, kids };
}
const allClasses = (el) => [...el.querySelectorAll('[class]')].flatMap((n) => [...n.classList]);

describe('batch 4 — td-table structure (D11)', () => {
  it('matches the golden contract (data + sortable, empty, loading)', async () => {
    const html = await (await fetch('/test/contracts/table.html')).text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const ts = [...doc.querySelectorAll('template')];
    expect(ts.length).to.equal(3);
    for (const t of ts) {
      host.innerHTML = t.getAttribute('data-markup');
      const el = host.firstElementChild;
      new Function('el', t.getAttribute('data-setup'))(el);
      expect(JSON.stringify(shape(el.firstElementChild))).to.equal(JSON.stringify(shape(t.content.firstElementChild)));
      host.innerHTML = '';
    }
  });

  it('renders only td-* classes (no Tailwind), no adopted sheet, scope=col + column hooks on every cell', () => {
    const el = table('title="T"', { columns: [...COLS, { key: 'x', label: 'X', ellipsis: true, width: '80px' }] });
    const classes = allClasses(el);
    classes.forEach((c) => expect(/^td-/.test(c), c).to.equal(true));
    expect(document.adoptedStyleSheets.length).to.equal(0);
    ths(el).forEach((th, i) => {
      expect(th.getAttribute('scope')).to.equal('col');
      expect(th.getAttribute('data-col')).to.equal(String(i));
    });
    expect(ths(el).map((t) => t.getAttribute('data-col-key')).join()).to.equal('id,name,role,x');
    rows(el)[0].querySelectorAll('td').forEach((td, i) => {
      expect(td.getAttribute('data-col')).to.equal(String(i));
      expect(td.getAttribute('data-col-key')).to.equal(['id', 'name', 'role', 'x'][i]);
    });
  });

  it('is a solid content-layer card with td.css only (no glass, no backdrop filter)', () => {
    const el = table();
    const card = el.querySelector('.td-table');
    const cs = getComputedStyle(card);
    expect(rgb(cs.backgroundColor).a).to.equal(1);
    expect(cs.backdropFilter === 'none' || cs.backdropFilter === '').to.equal(true);
    expect(card.className).to.not.match(/glass/);
    expect(getComputedStyle(el.querySelector('.td-table__table')).borderCollapse).to.equal('separate');
    expect(getComputedStyle(ths(el)[0]).paddingLeft).to.equal('24px');
  });

  it('header text ≥ 4.5:1 and the unsorted sort icon ≥ 3:1, light and dark', () => {
    for (const theme of [null, 'dark']) {
      if (theme) document.documentElement.setAttribute('data-td-theme', theme);
      const el = table();
      const th = ths(el)[2];
      const bg = getComputedStyle(th).backgroundColor;
      expect(ratio(getComputedStyle(th).color, bg), `head ${theme}`).to.be.at.least(4.5);
      const icon = el.querySelector('.td-table__sort-icon');
      expect(ratio(getComputedStyle(icon).color, bg), `icon ${theme}`).to.be.at.least(3);
      const cell = rows(el)[0].children[0];
      expect(ratio(getComputedStyle(cell).color, getComputedStyle(el.querySelector('.td-table')).backgroundColor)).to.be.at.least(4.5);
      host.innerHTML = '';
    }
  });
});

describe('batch 4 — td-table naming (D18, review ISSUE-4)', () => {
  it('title → heading (heading-level) + table aria-labelledby; the title attribute is escaped', () => {
    const el = table('id="t1" title="<b>Người dùng</b>" heading-level="2"');
    const h = el.querySelector('.td-table__title');
    expect(h.localName).to.equal('h2');
    expect(h.id).to.equal('t1-title');
    expect(h.textContent).to.equal('<b>Người dùng</b>');
    expect(h.querySelector('b')).to.equal(null);
    const t = el.querySelector('table');
    expect(t.getAttribute('aria-labelledby')).to.equal('t1-title');
    expect(t.hasAttribute('aria-label')).to.equal(false);
  });

  it('heading-level out of range → h3', () => {
    const el = table('title="A" heading-level="9"');
    expect(el.querySelector('.td-table__title').localName).to.equal('h3');
  });

  it('no title → host aria-label names the table (updated in place)', () => {
    const el = table('aria-label="Danh sách đơn"');
    const t = el.querySelector('table');
    expect(t.getAttribute('aria-label')).to.equal('Danh sách đơn');
    expect(t.hasAttribute('aria-labelledby')).to.equal(false);
    el.setAttribute('aria-label', 'Khác');
    expect(same(el.querySelector('table'), t)).to.equal(true);
    expect(t.getAttribute('aria-label')).to.equal('Khác');
  });

  it('no title and no aria-label → table AND overflow region are named "Bảng dữ liệu" (TdTable.labels.table)', async () => {
    const box = mount('<div class="t-narrow"></div>');
    box.style.width = '200px';
    const el = table('', { parent: box, columns: [...COLS, { key: 'role', label: 'Một cột rất rất rất dài để tràn ngang' }] });
    await frames(3);
    const t = el.querySelector('table');
    expect(t.getAttribute('aria-label')).to.equal('Bảng dữ liệu');
    expect(TdTable.labels.table).to.equal('Bảng dữ liệu');
    const s = el.querySelector('.td-table__scroll');
    expect(s.getAttribute('role')).to.equal('region');
    expect(s.getAttribute('tabindex')).to.equal('0');
    expect(s.getAttribute('aria-label')).to.equal('Bảng dữ liệu');
  });
});

describe('batch 4 — td-table overflow region (D16)', () => {
  it('focusable + named only while overflowing (ResizeObserver), title name via aria-labelledby', async () => {
    const box = mount('<div></div>');
    box.style.width = '1200px';
    const el = table('id="ov" title="Bảng rộng"', { parent: box });
    await frames(3);
    const s = el.querySelector('.td-table__scroll');
    expect(s.hasAttribute('tabindex')).to.equal(false);
    expect(s.hasAttribute('role')).to.equal(false);
    box.style.width = '120px';
    await frames(3);
    expect(s.getAttribute('tabindex')).to.equal('0');
    expect(s.getAttribute('role')).to.equal('region');
    expect(s.getAttribute('aria-labelledby')).to.equal('ov-title');
    box.style.width = '1200px';
    await frames(3);
    expect(s.hasAttribute('tabindex')).to.equal(false);
    expect(s.hasAttribute('aria-labelledby')).to.equal(false);
  });

  it('the observer is disconnected on removal', () => {
    const el = table();
    expect(el._ro).to.not.equal(null);
    el.remove();
    expect(el._ro).to.equal(null);
  });
});

describe('batch 4 — td-table sorting (D12)', () => {
  it('3-state cycle: aria-sort on the active th only, icons up/down/sort, rows sorted, page → 1', async () => {
    const el = table('per-page="5"');
    el.setPage(3);
    const [thId, thName] = ths(el);
    sortBtn(el, 1).click();
    expect(thName.getAttribute('aria-sort')).to.equal('ascending');
    expect(thId.hasAttribute('aria-sort')).to.equal(false);
    expect(ths(el)[2].hasAttribute('aria-sort')).to.equal(false);
    expect(thName.querySelector('.td-table__sort-icon').getAttribute('data-sort-icon')).to.equal('up');
    expect(thName.querySelector('.td-table__sort-icon svg').getAttribute('data-icon')).to.equal('up');
    expect(thName.querySelector('.td-table__sort-icon').getAttribute('aria-hidden')).to.equal('true');
    expect(el.getState().page).to.equal(1);
    sortBtn(el, 1).click();
    expect(thName.getAttribute('aria-sort')).to.equal('descending');
    expect(thName.querySelector('.td-table__sort-icon svg').getAttribute('data-icon')).to.equal('down');
    expect(col(el, 0)[0]).to.equal('23'); // numeric collation: "Người 23" > "Người 9", descending
    sortBtn(el, 1).click();
    expect(thName.hasAttribute('aria-sort')).to.equal(false);
    expect(thName.querySelector('.td-table__sort-icon').getAttribute('data-sort-icon')).to.equal('sort');
    expect(col(el, 0).join()).to.equal('1,2,3,4,5');
    // switching column moves aria-sort
    sortBtn(el, 0).click();
    sortBtn(el, 1).click();
    expect(thId.hasAttribute('aria-sort')).to.equal(false);
    expect(thName.getAttribute('aria-sort')).to.equal('ascending');
  });

  it('keyboard: focus stays on the activated sort button; thead is not rebuilt', async () => {
    const el = table();
    const btn = sortBtn(el, 0);
    const thead = el.querySelector('thead');
    btn.focus();
    await sendKeys({ press: 'Enter' });
    await sendKeys({ press: 'Enter' });
    expect(same(document.activeElement, btn)).to.equal(true);
    expect(same(el.querySelector('thead'), thead)).to.equal(true);
    expect(ths(el)[0].getAttribute('aria-sort')).to.equal('descending');
    expect(col(el, 0)[0]).to.equal('23');
  });

  it('Intl.Collator vi numeric: accents next to base letters, "item 9" before "item 10", numbers numeric, nulls first', () => {
    const data = [{ n: 'item 10' }, { n: 'Bảo' }, { n: 'item 9' }, { n: 'Anh' }, { n: null }, { n: 'Ánh' }, { n: 'bao' }];
    const el = table('', { columns: [{ key: 'n', label: 'N', sortable: true }], data });
    sortBtn(el, 0).click();
    const got = col(el, 0);
    expect(got[0]).to.equal('');
    expect(got.indexOf('item 9')).to.be.below(got.indexOf('item 10'));
    expect(Math.abs(got.indexOf('Anh') - got.indexOf('Ánh'))).to.equal(1);
    expect(got.indexOf('Ánh')).to.be.below(got.indexOf('Bảo'));
    sortBtn(el, 0).click();
    expect(col(el, 0).at(-1)).to.equal('');
    const nums = table('', { columns: [{ key: 'v', label: 'V', sortable: true }], data: [{ v: 10 }, { v: 9 }, { v: 100 }] });
    sortBtn(nums, 0).click();
    expect(col(nums, 0).join()).to.equal('9,10,100');
  });

  it('additive sort-change event {key, direction}; onSort only in server mode (no client sort there)', () => {
    const el = table();
    const events = [];
    el.addEventListener('sort-change', (e) => events.push(e.detail));
    let called = 0;
    el.onSort = () => { called++; };
    sortBtn(el, 1).click();
    expect(JSON.stringify(events)).to.equal(JSON.stringify([{ key: 'name', direction: 'asc' }]));
    expect(called).to.equal(0);

    const srv = table('server-mode total-items="23"', { data: ROWS.slice(0, 10) });
    const order = [];
    srv.addEventListener('sort-change', () => order.push('event'));
    srv.onSort = (d) => order.push(`onSort:${d.key}:${d.direction}`);
    sortBtn(srv, 1).click();
    sortBtn(srv, 1).click();
    sortBtn(srv, 1).click();
    expect(order.join()).to.equal('event,onSort:name:asc,event,onSort:name:desc,event,onSort:null:null');
    expect(col(srv, 0).slice(0, 3).join()).to.equal('1,2,3'); // server rows are never re-sorted client-side
  });

  it('numeric key 0 shows as active (2.8.5) and getState().sort.key is the original key', () => {
    const el = table('', { columns: [{ key: 0, label: 'Zero', sortable: true }], data: [[3], [1], [2]] });
    sortBtn(el, 0).click();
    expect(ths(el)[0].getAttribute('aria-sort')).to.equal('ascending');
    expect(col(el, 0).join()).to.equal('1,2,3');
    const s = el.getState().sort;
    expect(s.key === 0).to.equal(true);
    expect(s.direction).to.equal('asc');
  });

  it('a sort button of a nested table inside a render cell does not sort the outer table', () => {
    let inner;
    const el = table('', {
      columns: [{ key: 'id', label: 'ID', sortable: true }, {
        key: 'n',
        label: 'Nested',
        render: () => {
          inner = document.createElement('td-table');
          inner.columns = [{ key: 'q', label: 'Q', sortable: true }];
          inner.data = [{ q: 2 }, { q: 1 }];
          return inner;
        },
      }],
      data: [{ id: 1 }],
    });
    inner.querySelector('.td-table__sort').click();
    expect(ths(el)[0].hasAttribute('aria-sort')).to.equal(false);
    expect(inner.querySelector('.td-table__th').getAttribute('aria-sort')).to.equal('ascending');
  });
});

describe('batch 4 — td-table paging (D11, D17, D22)', () => {
  it('paginations persist; top is quiet, bottom is the only live region; the info node is reused', async () => {
    const el = table('per-page="5"');
    const top = pagTop(el);
    const bottom = pagBottom(el);
    expect(top.hasAttribute('quiet')).to.equal(true);
    expect(top.querySelector('.td-pagination__info').hasAttribute('aria-live')).to.equal(false);
    const info = bottom.querySelector('.td-pagination__info');
    expect(info.getAttribute('aria-live')).to.equal('polite');
    expect(el.querySelectorAll('[aria-live]').length).to.equal(1);
    bottom.querySelector('.td-pagination__page[data-page="2"]').click();
    expect(same(pagTop(el), top)).to.equal(true);
    expect(same(pagBottom(el), bottom)).to.equal(true);
    expect(same(bottom.querySelector('.td-pagination__info'), info)).to.equal(true);
    expect(info.textContent).to.equal('Hiển thị 6-10 / 23 mục');
    expect(top.getAttribute('current-page')).to.equal('2');
    expect(col(el, 0)[0]).to.equal('6');
  });

  it('keyboard: focus stays on the page button after a page change (bottom and top)', async () => {
    const el = table('per-page="5"');
    const b2 = pagBottom(el).querySelector('.td-pagination__page[data-page="2"]');
    b2.focus();
    await sendKeys({ press: 'Enter' });
    let a = document.activeElement;
    expect(pagBottom(el).contains(a)).to.equal(true);
    expect(a.getAttribute('data-page')).to.equal('2');
    const t3 = pagTop(el).querySelector('.td-pagination__page[data-page="3"]');
    t3.focus();
    await sendKeys({ press: 'Enter' });
    a = document.activeElement;
    expect(pagTop(el).contains(a)).to.equal(true);
    expect(a.getAttribute('data-page')).to.equal('3');
    expect(col(el, 0)[0]).to.equal('11');
    // next button keeps focus too
    pagTop(el).querySelector('[data-nav="next"]').focus();
    await sendKeys({ press: 'Enter' });
    expect(document.activeElement.getAttribute('data-nav')).to.equal('next');
    expect(el.getState().page).to.equal(4);
  });

  it('client: per-page increase clamps the page (2.8.3) — rows, not the empty state', () => {
    const el = table('per-page="5"');
    el.setPage(5);
    expect(col(el, 0)[0]).to.equal('21');
    el.setAttribute('per-page', '50');
    expect(el.getState().page).to.equal(1);
    expect(rows(el).length).to.equal(23);
    expect(el.querySelector('.td-table__empty')).to.equal(null);
    el.data = ROWS.slice(0, 3);
    el.setPage(99);
    expect(el.getState().page).to.equal(1);
  });

  it('client: data resets to page 1; server mode keeps the page on data (2.8.2)', () => {
    const el = table('per-page="5"');
    el.setPage(3);
    el.data = ROWS.slice();
    expect(el.getState().page).to.equal(1);

    const srv = table('server-mode total-items="23" per-page="5"', { data: ROWS.slice(0, 5) });
    const pages = [];
    srv.onPageChange = (p) => pages.push(p);
    pagBottom(srv).querySelector('.td-pagination__page[data-page="3"]').click();
    expect(pages.join()).to.equal('3');
    expect(pagTop(srv).getAttribute('current-page')).to.equal('3');
    srv.data = ROWS.slice(10, 15);
    expect(srv.getState().page).to.equal(3);
    expect(pagBottom(srv).getAttribute('current-page')).to.equal('3');
    expect(pagTop(srv).getAttribute('current-page')).to.equal('3');
    expect(col(srv, 0)[0]).to.equal('11');
    srv.setData(ROWS.slice(0, 5));
    expect(srv.getState().page).to.equal(3);
  });

  it('server mode without total-items (2.8.9): rows render, both paginations hidden, one console warning', () => {
    const el = table('server-mode', { data: ROWS.slice(0, 5) });
    expect(rows(el).length).to.equal(5);
    expect(el.querySelector('.td-table__header .td-table__pagination').hidden).to.equal(true);
    expect(el.querySelector('.td-table__footer').hidden).to.equal(true);
    expect(getComputedStyle(el.querySelector('.td-table__footer')).display).to.equal('none');
    el.data = ROWS.slice(5, 10);
    el.setAttribute('per-page', '5');
    expect(warnings.filter((w) => /total-items/.test(w)).length).to.equal(1);
    el.setAttribute('total-items', '23');
    expect(el.querySelector('.td-table__footer').hidden).to.equal(false);
    expect(pagBottom(el).getAttribute('total-items')).to.equal('23');
  });

  it('server mode: focus returns to the page button after a loading cycle hid the paginations', async () => {
    const el = table('server-mode total-items="23" per-page="5"', { data: ROWS.slice(0, 5) });
    el.onPageChange = () => el.setLoading(true);
    const b2 = pagBottom(el).querySelector('.td-pagination__page[data-page="2"]');
    b2.focus();
    await sendKeys({ press: 'Enter' });
    expect(el.querySelector('.td-table__footer').hidden).to.equal(true);
    el.data = ROWS.slice(5, 10);
    el.setLoading(false);
    const a = document.activeElement;
    expect(pagBottom(el).contains(a)).to.equal(true);
    expect(a.getAttribute('aria-current')).to.equal('page');
    expect(a.getAttribute('data-page')).to.equal('2');
  });

  it('active-color is forwarded (safeColor) to both paginations, invalid removed', () => {
    const el = table('active-color="#3b82f6" per-page="5"');
    expect(pagTop(el).getAttribute('active-color')).to.equal('#3b82f6');
    expect(pagBottom(el).getAttribute('active-color')).to.equal('#3b82f6');
    el.setAttribute('active-color', 'red;}body{display:none');
    expect(pagTop(el).hasAttribute('active-color')).to.equal(false);
  });

  it('update(): non-array data/columns ignored without throwing (2.8.6); data + page apply in order', () => {
    const el = table('per-page="5"');
    expect(() => el.update({ data: {} })).to.not.throw();
    expect(() => el.update({ columns: 'x' })).to.not.throw();
    expect(() => el.update(null)).to.not.throw();
    expect(rows(el).length).to.equal(5);
    el.update({ data: ROWS.slice(), page: 3 });
    expect(el.getState().page).to.equal(3);
    expect(col(el, 0)[0]).to.equal('11');
  });

  it('reconnect (move the element) keeps sort + paging working', () => {
    const el = table('per-page="5"');
    const other = mount('<div></div>');
    other.appendChild(el);
    sortBtn(el, 0).click();
    sortBtn(el, 0).click();
    expect(col(el, 0)[0]).to.equal('23');
    pagBottom(el).querySelector('.td-pagination__page[data-page="2"]').click();
    expect(col(el, 0)[0]).to.equal('18');
    expect(el._ro).to.not.equal(null);
  });
});

describe('batch 4 — td-table columns + render hatch (D20, 2.8.4)', () => {
  it('render(row, rowIdxInPage): Node appended, string = trusted HTML, other → text; resolved by index', () => {
    const calls = [];
    const el = table('per-page="2"', {
      columns: [
        { key: 'id', label: 'ID' },
        { label: 'Không key', render: (row) => `<em>${row.id}</em>` },
        { key: 'a', label: 'A1', render: (row, i) => { calls.push(i); const b = document.createElement('button'); b.textContent = `x${row.id}`; return b; } },
        { key: 'a', label: 'A2', render: (row) => row.id * 10 },
        { key: 'a', label: 'A3', render: () => null },
      ],
      data: [{ id: 1 }, { id: 2 }, { id: 3 }],
    });
    el.setPage(2);
    const tr = rows(el)[0];
    expect(tr.children[1].querySelector('em').textContent).to.equal('3');
    expect(tr.children[2].querySelector('button').textContent).to.equal('x3');
    expect(tr.children[3].textContent).to.equal('30');
    expect(tr.children[4].textContent).to.equal('');
    expect(calls.at(-1)).to.equal(0); // index within the page
    expect(tr.children[1].getAttribute('data-col-key')).to.equal('');
  });

  it('plain values are always escaped; labels/keys too (XSS)', () => {
    window.__xss = false;
    const pay = '<img src=x onerror="window.__xss=true">';
    const el = table(`title='${pay.replace(/'/g, '')}' empty-title='${pay}'`, {
      columns: [{ key: pay, label: pay, sortable: true }, { key: 'v', label: 'V', ellipsis: true }],
      data: [{ [pay]: pay, v: pay }],
    });
    expect(el.querySelector('img')).to.equal(null);
    expect(rows(el)[0].children[0].textContent).to.equal(pay);
    expect(ths(el)[0].getAttribute('data-col-key')).to.equal(pay);
    el.data = [];
    el.setAttribute('empty-text', pay);
    expect(el.querySelector('img')).to.equal(null);
    expect(window.__xss).to.equal(false);
  });

  it('CSSOM column styles kept: fixed width → width/min/max, flexible min/max, align whitelist, bad values dropped', () => {
    const el = table('', {
      columns: [
        { key: 'id', label: 'ID', width: '80px', widthType: 'fixed', align: 'right' },
        { key: 'name', label: 'Tên', minWidth: '120px', maxWidth: '20rem', align: 'center' },
        { key: 'role', label: 'Vai trò', width: '1px;background:red', widthType: 'fixed', minWidth: 'calc(1px)', align: 'evil' },
      ],
    });
    const [th0, th1, th2] = ths(el);
    const td0 = rows(el)[0].children[0];
    for (const c of [th0, td0]) {
      expect(c.style.width).to.equal('80px');
      expect(c.style.minWidth).to.equal('80px');
      expect(c.style.maxWidth).to.equal('80px');
      expect(c.style.textAlign).to.equal('right');
    }
    expect(th1.style.width).to.equal('auto');
    expect(th1.style.minWidth).to.equal('120px');
    expect(th1.style.maxWidth).to.equal('20rem');
    expect(th1.style.textAlign).to.equal('center');
    expect(th2.style.width).to.equal('auto');
    expect(th2.style.minWidth).to.equal('');
    expect(th2.style.textAlign).to.equal('');
    expect(th2.style.background).to.equal('');
    expect(el._getColumnWidthStyles({ width: '10%', widthType: 'fixed', align: 'justify' })['text-align']).to.equal('justify');
    // new page rows get the styles too
    el.data = ROWS.slice(0, 3);
    expect(rows(el)[2].children[0].style.width).to.equal('80px');
  });

  it('ellipsis (D21): truncate wrapper + title = text, table-layout fixed, text-overflow ellipsis', () => {
    const long = 'Một đoạn văn bản rất dài '.repeat(10);
    const el = table('', {
      columns: [{ key: 'id', label: 'ID' }, { key: 't', label: 'Mô tả', ellipsis: true },
        { key: 'r', label: 'R', ellipsis: true, render: (row) => `<a href="#x">${row.id}</a>` },
        { key: 'r', label: 'R2', ellipsis: true, render: () => '<span title="riêng">y</span>' }],
      data: [{ id: 1, t: long }],
    });
    expect(el.querySelector('.td-table').classList.contains('td-table--fixed')).to.equal(true);
    expect(getComputedStyle(el.querySelector('table')).tableLayout).to.equal('fixed');
    const cells = rows(el)[0].children;
    expect(cells[1].classList.contains('td-table__cell--ellipsis')).to.equal(true);
    const tr = cells[1].querySelector('.td-table__truncate');
    expect(tr.getAttribute('title')).to.equal(long);
    expect(getComputedStyle(tr).textOverflow).to.equal('ellipsis');
    expect(getComputedStyle(tr).whiteSpace).to.equal('nowrap');
    expect(cells[2].querySelector('.td-table__truncate').title).to.equal('1');
    expect(cells[3].querySelector('.td-table__truncate').hasAttribute('title')).to.equal(false);
    const auto = table('', { columns: COLS });
    expect(getComputedStyle(auto.querySelector('table')).tableLayout).to.equal('auto');
    const withWidth = table('', { columns: [{ key: 'id', label: 'ID', width: '60px', widthType: 'fixed' }] });
    expect(getComputedStyle(withWidth.querySelector('table')).tableLayout).to.equal('fixed');
  });
});

describe('batch 4 — td-table cellPaddingClass (D15, review ISSUE-1)', () => {
  it('px-2 → td-table__cell--px-2 on th, td and skeleton cells; the px-* string is never a class', () => {
    const el = table();
    el.cellPaddingClass = 'px-2';
    expect(el.cellPaddingClass).to.equal('px-2');
    for (const c of [...ths(el), ...rows(el)[0].children]) {
      expect(c.classList.contains('td-table__cell--px-2')).to.equal(true);
      expect(getComputedStyle(c).paddingLeft).to.equal('8px');
      expect(getComputedStyle(c).paddingRight).to.equal('8px');
    }
    el.setLoading(true);
    const sk = el.querySelector('.td-table__row--skeleton > td');
    expect(sk.classList.contains('td-table__cell--px-2')).to.equal(true);
    for (const n of ['0', '1', '3', '4', '5', '6']) {
      el.cellPaddingClass = `px-${n}`;
      expect(ths(el)[0].classList.contains(`td-table__cell--px-${n}`)).to.equal(true);
    }
    expect(getComputedStyle(ths(el)[0]).paddingLeft).to.equal('24px');
    el.cellPaddingClass = 'px-0';
    expect(getComputedStyle(ths(el)[0]).paddingLeft).to.equal('0px');
    allClasses(el).forEach((c) => expect(/^px-/.test(c), c).to.equal(false));
    expect(warnings.length).to.equal(0);
  });

  it('unknown values are ignored with one warning; never emitted as classes', () => {
    const el = table();
    el.cellPaddingClass = 'px-8';
    el.cellPaddingClass = 'px-8';
    el.cellPaddingClass = 'p-4 bg-red-500';
    expect(el.cellPaddingClass).to.equal('');
    expect(warnings.length).to.equal(2); // one per distinct unknown value
    expect(warnings.filter((w) => w.includes('px-8')).length).to.equal(1);
    allClasses(el).forEach((c) => expect(/^(px-|p-|bg-)/.test(c), c).to.equal(false));
    expect(getComputedStyle(ths(el)[0]).paddingLeft).to.equal('24px');
  });
});

describe('batch 4 — td-table sticky header (D14)', () => {
  it('max-height → wrapper scrolls, th sticky with an opaque fill and local z-index 1 (light + dark)', () => {
    for (const theme of [null, 'dark']) {
      if (theme) document.documentElement.setAttribute('data-td-theme', theme);
      const el = table('max-height="160px" per-page="20"');
      const root = el.querySelector('.td-table');
      expect(root.classList.contains('td-table--scroll-y')).to.equal(true);
      expect(root.style.getPropertyValue('--td-table-max-h')).to.equal('160px');
      const s = el.querySelector('.td-table__scroll');
      expect(getComputedStyle(s).maxHeight).to.equal('160px');
      expect(getComputedStyle(s).overflowY).to.equal('auto');
      const th = ths(el)[0];
      const cs = getComputedStyle(th);
      expect(cs.position).to.equal('sticky');
      expect(cs.top).to.equal('0px');
      expect(cs.zIndex).to.equal('1');
      expect(rgb(cs.backgroundColor).a).to.equal(1);
      s.scrollTop = 200;
      expect(Math.round(th.getBoundingClientRect().top)).to.equal(Math.round(s.getBoundingClientRect().top));
      host.innerHTML = '';
    }
  });

  it('CSS payloads in max-height are ignored (no class, no custom property) + one warning', () => {
    for (const bad of ['1px;background:red', 'url(x)', 'var(--x)', 'banana']) {
      const el = table(`max-height="${bad}"`);
      const root = el.querySelector('.td-table');
      expect(root.classList.contains('td-table--scroll-y'), bad).to.equal(false);
      expect(root.style.getPropertyValue('--td-table-max-h')).to.equal('');
      expect(getComputedStyle(ths(el)[0]).position).to.equal('static');
    }
    expect(warnings.length).to.equal(4);
  });

  it('no max-height → no sticky', () => {
    const el = table();
    expect(getComputedStyle(ths(el)[0]).position).to.equal('static');
  });
});

describe('batch 4 — td-table zebra tri-state (2.8.1)', () => {
  it('default on; zebra="false"|"0"|"off" turns it off; el.zebra = false/true', () => {
    const el = table();
    const even = () => getComputedStyle(rows(el)[1]).backgroundColor;
    expect(el.querySelector('.td-table').classList.contains('td-table--zebra')).to.equal(true);
    expect(rgb(even()).a).to.be.above(0);
    for (const v of ['false', '0', 'off', 'OFF']) {
      el.setAttribute('zebra', v);
      expect(el.querySelector('.td-table').classList.contains('td-table--zebra'), v).to.equal(false);
      expect(el.zebra).to.equal(false);
    }
    expect(even()).to.equal('rgba(0, 0, 0, 0)');
    el.setAttribute('zebra', '');
    expect(el.zebra).to.equal(true);
    el.zebra = false;
    expect(el.getAttribute('zebra')).to.equal('false');
    el.zebra = true;
    expect(el.hasAttribute('zebra')).to.equal(false);
    expect(el.querySelector('.td-table').classList.contains('td-table--zebra')).to.equal(true);
  });
});

describe('batch 4 — td-table loading (D19)', () => {
  it('aria-busy on the table, one role=status with text, skeleton aria-hidden, title kept, paginations hidden', () => {
    const el = table('title="Người dùng" loading loading-rows="3"');
    const root = el.querySelector('.td-table');
    expect(root.getAttribute('data-state')).to.equal('loading');
    expect(el.querySelector('table').getAttribute('aria-busy')).to.equal('true');
    const status = el.querySelectorAll('[role="status"]');
    expect(status.length).to.equal(1);
    expect(status[0].textContent).to.equal('Đang tải dữ liệu…');
    const sk = el.querySelectorAll('.td-table__row--skeleton');
    expect(sk.length).to.equal(3);
    sk.forEach((r) => expect(r.getAttribute('aria-hidden')).to.equal('true'));
    expect(el.querySelector('.td-table__title').textContent).to.equal('Người dùng');
    expect(el.querySelector('.td-table__header').hidden).to.equal(false);
    expect(el.querySelector('.td-table__header .td-table__pagination').hidden).to.equal(true);
    expect(el.querySelector('.td-table__footer').hidden).to.equal(true);
    const statusNode = status[0];
    el.setLoading(false);
    expect(same(el.querySelector('[role="status"]'), statusNode)).to.equal(true);
    expect(statusNode.textContent).to.equal('');
    expect(el.querySelector('table').hasAttribute('aria-busy')).to.equal(false);
    expect(root.getAttribute('data-state')).to.equal('ready');
    expect(el.querySelector('.td-table__footer').hidden).to.equal(false);
  });

  it('deterministic skeleton widths (no random output, no inline widths)', () => {
    const widths = () => {
      const el = table('loading loading-rows="4"', { data: null });
      const w = [...el.querySelectorAll('.td-table__skeleton')].map((s) => getComputedStyle(s).width);
      el.querySelectorAll('.td-table__skeleton').forEach((s) => expect(s.hasAttribute('style')).to.equal(false));
      el.remove();
      return w.join();
    };
    const a = widths();
    expect(a).to.equal(widths());
    expect(new Set(a.split(',')).size).to.be.above(1);
  });

  it('shimmer runs, and stops under prefers-reduced-motion', async () => {
    const el = table('loading');
    const sk = el.querySelector('.td-table__skeleton');
    expect(getComputedStyle(sk, '::after').animationName).to.equal('td-table-shimmer');
    await emulateMedia({ reducedMotion: 'reduce' });
    expect(getComputedStyle(sk, '::after').animationName).to.equal('none');
  });

  it('loading keeps thead (focus on a sort button survives a loading toggle)', () => {
    const el = table();
    const btn = sortBtn(el, 0);
    btn.focus();
    el.setLoading(true);
    el.setLoading(false);
    expect(same(document.activeElement, btn)).to.equal(true);
  });
});

describe('batch 4 — td-table empty state (D18)', () => {
  it('defaults: title "Không có dữ liệu", message "Chưa có dữ liệu để hiển thị." (no duplicate), h3 without title', () => {
    const el = table('', { data: [] });
    expect(el.querySelector('.td-table').getAttribute('data-state')).to.equal('empty');
    const es = el.querySelector('.td-table__empty td-empty-state');
    expect(es.hasAttribute('compact')).to.equal(true);
    expect(es.getAttribute('size')).to.equal('sm');
    expect(es.querySelector('.td-empty-state__title').localName).to.equal('h3');
    expect(es.querySelector('.td-empty-state__title').textContent).to.equal('Không có dữ liệu');
    expect(es.querySelector('.td-empty-state__message').textContent).to.equal('Chưa có dữ liệu để hiển thị.');
    expect(el.querySelector('.td-table__empty').getAttribute('colspan')).to.equal('3');
    expect(el.querySelector('.td-table__header').hidden).to.equal(true);
    expect(el.querySelector('.td-table__footer').hidden).to.equal(true);
    // no card-in-card
    expect(getComputedStyle(es.querySelector('.td-empty-state')).borderTopStyle).to.equal('none');
  });

  it('empty-title / empty-text custom; heading level = title level + 1 (in place)', () => {
    const el = table('title="Đơn" heading-level="4" empty-title="Trống" empty-text="Thêm đơn đầu tiên."', { data: [] });
    const es = () => el.querySelector('.td-table__empty td-empty-state');
    expect(es().querySelector('.td-empty-state__title').localName).to.equal('h5');
    expect(es().querySelector('.td-empty-state__title').textContent).to.equal('Trống');
    expect(es().querySelector('.td-empty-state__message').textContent).to.equal('Thêm đơn đầu tiên.');
    el.setAttribute('empty-text', 'Khác');
    expect(es().querySelector('.td-empty-state__message').textContent).to.equal('Khác');
  });
});
