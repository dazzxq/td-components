import { expect } from '@esm-bundle/chai';
import './td-table.js';

// v0.57.0 (plan docs/internal/plans/v0.57.0-tree-table.md M1 "Perf", acceptance 5, risk R5) — Chromium. The budget is
// 3 × the M0 baseline measured IN THE SAME RUN (1000 flat rows × 5 columns through the v0.54 render path), scaled by
// the number of rows rendered, with a 40 ms floor (timer noise). The machine-independent check is the number of
// `render` calls when one branch opens: exactly the number of NEW cells (incremental, QĐ 12). Numbers are logged.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
const COLS = [
  { key: 'name', label: 'Tên', sortable: true },
  { key: 'code', label: 'Mã' },
  { key: 'qty', label: 'SL', align: 'right' },
  { key: 'note', label: 'Ghi chú', ellipsis: true },
  { key: 'state', label: 'Trạng thái' },
];
const rowOf = (id) => ({ id, name: `Mục ${id}`, code: `M${id}`, qty: id % 97, note: `Ghi chú ${id}`, state: id % 2 ? 'Bật' : 'Tắt' });

function mount(attrs) {
  const wrap = document.createElement('div');
  wrap.style.width = '1000px';
  wrap.innerHTML = `<td-table ${attrs}></td-table>`;
  document.body.appendChild(wrap);
  return { wrap, el: wrap.firstElementChild };
}
const time = (fn) => {
  const t0 = performance.now();
  fn();
  return performance.now() - t0;
};
/** Median of 3 runs. */
const median = (fns) => fns.map(time).sort((a, b) => a - b)[1];

let base = 0;
const budget = (rows) => Math.max(40, 3 * base * (rows / 1000));
const log = [];
after(() => console.log(`v0.57 perf (ms): ${log.join(' · ')}`));

describe('v0.57.0 td-table tree — perf (Chromium)', function () {
  this.timeout(60000);

  before(async () => {
    const t = [];
    for (let i = 0; i < 3; i++) {
      const { wrap, el } = mount('per-page="1000" row-key="id"');
      el.columns = COLS;
      await raf();
      const data = Array.from({ length: 1000 }, (_, k) => rowOf(k));
      t.push(time(() => { el.data = data; }));
      wrap.remove();
    }
    base = t.sort((a, b) => a - b)[1];
    log.push(`M0 baseline flat 1000×5 = ${base.toFixed(1)}`);
  });

  it('first render: 1000 roots × 5 columns', async () => {
    const fns = [];
    const wraps = [];
    for (let i = 0; i < 3; i++) {
      const { wrap, el } = mount('tree per-page="1000" row-key="id"');
      el.columns = COLS;
      wraps.push(wrap);
      const data = Array.from({ length: 1000 }, (_, k) => ({ ...rowOf(k), children: [rowOf(10000 + k)] }));
      fns.push(() => { el.data = data; });
    }
    await raf();
    const t = median(fns);
    wraps.forEach((w) => w.remove());
    log.push(`tree 1000 roots = ${t.toFixed(1)}`);
    expect(t).to.be.below(budget(1000));
  });

  it('expandAll: 200 roots × 10 children (2200 rows)', async () => {
    const { wrap, el } = mount('tree per-page="1000" row-key="id"');
    el.columns = COLS;
    el.data = Array.from({ length: 200 }, (_, k) => ({ ...rowOf(k), children: Array.from({ length: 10 }, (_, j) => rowOf(1000 + k * 10 + j)) }));
    await raf();
    const t = time(() => el.expandAll());
    expect(el.querySelectorAll('.td-table__body > tr').length).to.equal(2200);
    wrap.remove();
    log.push(`expandAll 2200 = ${t.toFixed(1)}`);
    expect(t).to.be.below(budget(2200));
  });

  it('open one branch of 500 children in a 1000-root page; close it; ↓ 100 steps — render calls = new cells only', async () => {
    let renders = 0;
    const cols = [...COLS.slice(0, 4), { key: 'state', label: 'Trạng thái', render: (r) => { renders += 1; return r.state; } }];
    const { wrap, el } = mount('tree per-page="1000" row-key="id"');
    el.columns = cols;
    const data = Array.from({ length: 1000 }, (_, k) => rowOf(k));
    data[500] = { ...rowOf(500), children: Array.from({ length: 500 }, (_, j) => rowOf(5000 + j)) };
    el.data = data;
    await raf();
    const keep = el.querySelectorAll('.td-table__body > tr')[999];
    renders = 0;
    const tOpen = time(() => el.expand(500));
    expect(renders, 'render called once per NEW row (one render column)').to.equal(500);
    expect(el.querySelectorAll('.td-table__body > tr')[1499] === keep, 'old rows kept').to.equal(true);
    renders = 0;
    const tClose = time(() => el.collapse(500));
    expect(renders).to.equal(0);
    const first = el.querySelector('.td-table__body > tr');
    first.focus();
    const tKeys = time(() => {
      for (let i = 0; i < 100; i++) {
        document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
      }
    });
    expect(document.activeElement === el.querySelectorAll('.td-table__body > tr')[100]).to.equal(true);
    wrap.remove();
    log.push(`open 500 = ${tOpen.toFixed(1)} · close 500 = ${tClose.toFixed(1)} · ↓×100 = ${tKeys.toFixed(1)}`);
    expect(tOpen).to.be.below(budget(1500));
    expect(tClose).to.be.below(budget(1000));
    expect(tKeys).to.be.below(budget(1000));
  });
});
