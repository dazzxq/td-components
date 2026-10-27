import { expect } from '@esm-bundle/chai';
import env from '/__td-env.js';
import { TdDropdown } from './td-dropdown.js';

// v0.86.0 (plan docs/internal/plans/v0.86.0-dropdown-load.md, goal 7) — td-dropdown with 2000 rich options in 5 groups:
// open() until the next frame, and 5 typing filters (each until the next frame, median). Chromium only (a plain
// `.browser-test.js`, not `.engines.`): timings are only meaningful on the dev machine / CI Chromium. The default
// thresholds are wide (CI noise); TD_PERF_STRICT=1 (served through /__td-env.js, see web-test-runner.config.js) applies
// the acceptance thresholds: open < 100 ms, median filter < 50 ms. The numbers are printed.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });
await document.fonts?.ready;

const STRICT = env.strictPerf === true;
const OPEN_MAX = STRICT ? 100 : 250;
const FILTER_MAX = STRICT ? 50 : 150;

const host = document.createElement('div');
document.body.appendChild(host);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const raf = () => new Promise((r) => requestAnimationFrame(r));
afterEach(async () => {
  for (const d of host.querySelectorAll('td-dropdown')) if (d._isOpen) d.close();
  host.innerHTML = '';
  await wait(10);
});

const GROUPS = [0, 1, 2, 3, 4].map((i) => ({ key: `g${i}`, label: `Nhóm ${i}` }));
const rich = (n) => Array.from({ length: n }, (_, i) => ({
  value: `v${i}`,
  label: `Khách hàng số ${i}`,
  icon: 'user',
  description: `Mô tả dòng ${i}`,
  meta: String(i),
  status: { tone: 'success', text: 'x' },
  group: `g${i % 5}`,
}));
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

describe('v0.86.0 td-dropdown perf — 2000 rich options, 5 groups', () => {
  // the target is Chromium (dsuite's office machines); other engines are only checked for correctness elsewhere
  const CHROMIUM = /Chrome\//.test(navigator.userAgent);
  (CHROMIUM ? it : it.skip)(`open < ${OPEN_MAX} ms, median of 5 filters < ${FILTER_MAX} ms${STRICT ? ' (STRICT)' : ''}`, async () => {
    host.insertAdjacentHTML('beforeend', '<td-dropdown aria-label="Khách hàng" max-height="8"></td-dropdown>');
    const el = host.lastElementChild;
    el.groups = GROUPS;
    el.options = rich(2000);
    await raf();
    await raf();
    // warm-up: first open compiles styles / icons; the acceptance number is the second, steady open of a fresh menu
    const opens = [];
    for (let i = 0; i < 3; i++) {
      const t0 = performance.now();
      el.open();
      await raf();
      opens.push(performance.now() - t0);
      el.close();
      await raf();
    }
    const first = opens[0];
    const openMs = median(opens);
    el.open();
    await raf();
    const search = el._menuElement.querySelector('.td-dropdown__search');
    const times = [];
    for (const q of ['k', 'kh', 'khach', 'khach hang so 1', 'so 19']) {
      const t0 = performance.now();
      search.value = q;
      search.dispatchEvent(new Event('input', { bubbles: true }));
      await raf();
      times.push(performance.now() - t0);
    }
    const filterMs = median(times);
    console.log(`td-dropdown perf (2000 rich rows, 5 groups${STRICT ? ', STRICT' : ''}): open first ${first.toFixed(1)} ms, `
      + `open median-of-3 ${openMs.toFixed(1)} ms [${opens.map((x) => x.toFixed(1)).join(', ')}], `
      + `filters [${times.map((x) => x.toFixed(1)).join(', ')}] ms, median ${filterMs.toFixed(1)} ms`);
    expect(openMs, 'open (median of 3)').to.be.below(OPEN_MAX);
    expect(first, 'first open').to.be.below(OPEN_MAX);
    expect(filterMs, 'median filter').to.be.below(FILTER_MAX);
    expect(TdDropdown.labels.loading.length > 0).to.equal(true);
  });
});
