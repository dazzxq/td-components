import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';
import './td-table.js';

// v0.36.1 (plan docs/internal/plans/v0.36.1-table-card-density.md QĐ 1–9) — td-table card density: the `lead` role and
// its inference, secondary pairs by the real free space (no 480 container query), meta + actions on one footer line,
// icon-only action buttons in card mode, a one-row scrolling sort bar. Pairs revised in implementation: sized by
// content (no 50 % basis / 2-per-line cap) to meet the plan's height budgets. Chromium, Firefox AND WebKit; wrappers sized
// with CSSOM and real signals (rAF), never sleeps. Mouse pointer here (coarse sizes: stylesheet rules + the
// responsive gate).
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });
if (document.fonts && document.fonts.ready) await document.fonts.ready;

const frames = (n = 2) => new Promise((r) => { const step = (k) => (k ? requestAnimationFrame(() => step(k - 1)) : r()); step(n); });
async function until(fn, max = 120) {
  for (let i = 0; i < max; i++) {
    if (fn()) return true;
    await frames(1);
  }
  return !!fn();
}

const extra = [];
afterEach(() => {
  extra.splice(0).reverse().forEach((f) => f());
});

async function mk(width, columns, data, attrs = '') {
  const wrap = document.createElement('div');
  wrap.style.width = `${width}px`;
  wrap.innerHTML = `<td-table ${attrs}></td-table>`;
  document.body.appendChild(wrap);
  extra.push(() => wrap.remove());
  const el = wrap.firstElementChild;
  el.columns = columns;
  el.data = data;
  await frames(2);
  return { wrap, el };
}

const rows = (el) => [...el.querySelectorAll('.td-table__body > .td-table__row')];
const isCard = (el) => getComputedStyle(el.querySelector('.td-table__body > tr')).display !== 'table-row';
const visible = (n) => {
  const cs = getComputedStyle(n);
  const r = n.getBoundingClientRect();
  return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 1 && r.height > 1;
};
const role = (el, ci) => el.querySelector(`.td-table__body > tr > [data-col="${ci}"]`).getAttribute('data-card');
const thRole = (el, ci) => el.querySelector(`.td-table__th[data-col="${ci}"]`).getAttribute('data-card');
/** Content box of a card (inside border + padding). */
function inner(tr) {
  const r = tr.getBoundingClientRect();
  const cs = getComputedStyle(tr);
  return { left: r.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft),
    right: r.right - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingRight) };
}
/** Boxes share a line when they overlap vertically by more than 2px. */
const sameLine = (a, b) => Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2;

const POSTS = [
  { id: 1, title: 'Hướng dẫn Web Components', author: 'Duyệt', views: 1250, date: '01/10/2026', status: 'Đã đăng' },
  { id: 2, title: 'Tailwind CSS Tips & Tricks', author: 'Minh', views: 890, date: '02/10/2026', status: 'Nháp' },
];
const ACT = [{ id: 'edit', label: 'Sửa', icon: 'pencil' }, { id: 'del', label: 'Xoá', icon: 'trash', variant: 'danger' }];
const COLS = [
  { key: 'id', label: 'ID', sortable: true, width: '60px' },
  { key: 'title', label: 'Tiêu đề', sortable: true, card: 'primary' },
  { key: 'author', label: 'Tác giả' },
  { key: 'views', label: 'Lượt xem', align: 'right' },
  { key: 'date', label: 'Ngày', card: 'meta' },
  { key: 'status', label: 'Trạng thái', card: 'meta' },
  { key: 'act', label: 'Thao tác', actions: ACT },
];

describe('v0.36.1 td-table — card role inference (QĐ 1–2)', () => {
  it('nothing declared → first column primary (v0.34 unchanged)', async () => {
    const { el } = await mk(360, [{ key: 'id', label: 'ID' }, { key: 'title', label: 'Tiêu đề' }], POSTS);
    expect([role(el, 0), role(el, 1)]).to.deep.equal(['primary', 'secondary']);
  });

  it('explicit primary on another column → the undeclared first column is lead (th + td + skeleton)', async () => {
    const { el } = await mk(360, COLS, POSTS);
    expect([role(el, 0), role(el, 1), role(el, 2), role(el, 6)]).to.deep.equal(['lead', 'primary', 'secondary', 'actions']);
    expect(thRole(el, 0)).to.equal('lead');
    el.setLoading(true);
    await frames(1);
    expect(el.querySelector('.td-table__row--skeleton > [data-col="0"]').getAttribute('data-card')).to.equal('lead');
  });

  it('first column declared secondary → stays secondary; card: "lead" on column 3 → on the first line before primary', async () => {
    const a = await mk(360, [{ key: 'id', label: 'ID', card: 'secondary' }, { key: 'title', label: 'Tiêu đề', card: 'primary' }], POSTS);
    expect(role(a.el, 0)).to.equal('secondary');
    const { el } = await mk(360, [{ key: 'title', label: 'Tiêu đề' }, { key: 'author', label: 'Tác giả' }, { key: 'id', label: 'ID', card: 'lead' }], POSTS);
    expect([role(el, 0), role(el, 2)]).to.deep.equal(['primary', 'lead']);
    const tr = rows(el)[0];
    const lead = tr.querySelector('[data-card="lead"]').getBoundingClientRect();
    const primary = tr.querySelector('[data-card="primary"]').getBoundingClientRect();
    expect(sameLine(lead, primary), 'lead on the primary line').to.equal(true);
    expect(lead.right <= primary.left + 1, 'lead before primary').to.equal(true);
  });
});

describe('v0.36.1 td-table — card geometry (QĐ 3–7)', () => {
  it('360: lead + primary share the first line, lead has no visible label, muted xs tabular', async () => {
    const { el } = await mk(360, COLS, POSTS);
    expect(isCard(el)).to.equal(true);
    const tr = rows(el)[0];
    const leadTd = tr.querySelector('[data-card="lead"]');
    const lead = leadTd.getBoundingClientRect();
    const primary = tr.querySelector('[data-card="primary"]').getBoundingClientRect();
    expect(sameLine(lead, primary)).to.equal(true);
    expect(lead.right <= primary.left + 1).to.equal(true);
    expect(Math.abs(lead.left - inner(tr).left) < 1, 'lead starts the card').to.equal(true);
    expect(visible(leadTd.querySelector('.td-table__cell-label'))).to.equal(false);
    const cs = getComputedStyle(leadTd);
    expect(cs.fontSize).to.equal('12px');
    expect(cs.fontVariantNumeric).to.contain('tabular-nums');
    expect(Number(cs.fontWeight)).to.be.below(600);
  });

  it('a 3-line primary does not push the lead down or off the first line', async () => {
    const long = [{ ...POSTS[0], title: 'Một tiêu đề rất dài cho bài viết này để chắc chắn xuống dòng nhiều lần trong card hẹp' }];
    const { el } = await mk(360, COLS, long);
    const tr = rows(el)[0];
    const lead = tr.querySelector('[data-card="lead"]').getBoundingClientRect();
    const pTd = tr.querySelector('[data-card="primary"]');
    const primary = pTd.getBoundingClientRect();
    const lineH = parseFloat(getComputedStyle(pTd).lineHeight);
    expect(primary.height > lineH * 2.5, `primary wraps (${primary.height})`).to.equal(true);
    expect(lead.top < primary.top + lineH, 'lead stays on the first line').to.equal(true);
    expect(lead.right <= primary.left + 1).to.equal(true);
  });

  it('meta + actions share the footer line; actions end at the content edge', async () => {
    const { el } = await mk(360, COLS, POSTS);
    const tr = rows(el)[0];
    const meta = tr.querySelector('[data-card="meta"]').getBoundingClientRect();
    const act = tr.querySelector('[data-card="actions"]').getBoundingClientRect();
    expect(sameLine(meta, act), 'meta and actions on one line').to.equal(true);
    expect(Math.abs(act.right - inner(tr).right) <= 1, `actions end ${act.right} vs ${inner(tr).right}`).to.equal(true);
  });

  it('narrow (220): actions wrap under the meta line, still aligned to the end', async () => {
    const { el } = await mk(220, COLS, POSTS);
    const tr = rows(el)[0];
    const metas = [...tr.querySelectorAll('[data-card="meta"]')].map((m) => m.getBoundingClientRect());
    const act = tr.querySelector('[data-card="actions"]').getBoundingClientRect();
    expect(act.top >= Math.max(...metas.map((m) => m.bottom)) - 1, 'actions below the meta line').to.equal(true);
    expect(Math.abs(act.right - inner(tr).right) <= 1).to.equal(true);
  });

  it('no meta → actions on their own line after the secondaries, at the end', async () => {
    const { el } = await mk(360, COLS.filter((c) => c.card !== 'meta'), POSTS);
    const tr = rows(el)[0];
    const secs = [...tr.querySelectorAll('[data-card="secondary"]')].map((s) => s.getBoundingClientRect());
    const act = tr.querySelector('[data-card="actions"]').getBoundingClientRect();
    expect(act.top >= Math.max(...secs.map((s) => s.bottom)) - 1).to.equal(true);
    expect(Math.abs(act.right - inner(tr).right) <= 1).to.equal(true);
  });

  it('secondary pairs pack by content: short pairs share a line, a pair longer than the line takes it whole', async () => {
    const two = await mk(360, COLS, POSTS);
    const [a, b] = [...rows(two.el)[0].querySelectorAll('[data-card="secondary"]')].map((c) => c.getBoundingClientRect());
    expect(sameLine(a, b), 'two short pairs share a line at 360').to.equal(true);
    const long = [{ ...POSTS[0], author: 'Nguyễn Thị Phương Thảo Nguyễn Thị Phương Thảo' }];
    const one = await mk(260, COLS, long);
    const tr = rows(one.el)[0];
    const [c, d] = [...tr.querySelectorAll('[data-card="secondary"]')].map((x) => x.getBoundingClientRect());
    expect(d.top >= c.bottom - 1, 'a long pair is alone on its line').to.equal(true);
    const box = inner(tr);
    expect(Math.abs(c.width - (box.right - box.left)) <= 1, 'full width').to.equal(true);
  });

  it('an ellipsis value stays on its label line in card mode', async () => {
    const cols = [COLS[0], COLS[1], { key: 'note', label: 'Ghi chú', ellipsis: true }];
    const { el } = await mk(360, cols, [{ ...POSTS[0], note: 'Một ghi chú rất dài '.repeat(10) }]);
    const td = rows(el)[0].querySelector('[data-col="2"]');
    const lab = td.querySelector('.td-table__cell-label').getBoundingClientRect();
    const val = td.querySelector('.td-table__truncate').getBoundingClientRect();
    expect(sameLine(lab, val)).to.equal(true);
    expect(val.right <= td.getBoundingClientRect().right + 1).to.equal(true);
  });

  it('the cell padding is the --td-table-card-cell-py token (2px)', async () => {
    const { el } = await mk(360, COLS, POSTS);
    expect(getComputedStyle(rows(el)[0].querySelector('[data-card="secondary"]')).paddingTop).to.equal('2px');
  });
});

describe('v0.36.1 td-table — icon-only actions in card mode (QĐ 7)', () => {
  it('card: icon buttons 32 × 32, label visually hidden but in the DOM (name unchanged); table: label back', async () => {
    const { wrap, el } = await mk(360, COLS, POSTS);
    const btns = [...rows(el)[0].querySelectorAll('.td-table__action')];
    expect(btns.every((b) => b.classList.contains('td-table__action--icon'))).to.equal(true);
    for (const b of btns) {
      const r = b.getBoundingClientRect();
      expect(Math.abs(r.width - 32) <= 0.5 && Math.abs(r.height - 32) <= 0.5, `${r.width}×${r.height}`).to.equal(true);
      const label = b.querySelector('.td-table__action-label');
      expect(label.getBoundingClientRect().width <= 1, 'label visually hidden').to.equal(true);
      expect(getComputedStyle(label).display).to.not.equal('none');
      expect(visible(b.querySelector('svg'))).to.equal(true);
    }
    expect(btns.map((b) => b.textContent.trim())).to.deep.equal(['Sửa', 'Xoá']);
    expect(btns.some((b) => b.hasAttribute('aria-label'))).to.equal(false);
    wrap.style.width = '900px';
    expect(await until(() => !isCard(el))).to.equal(true);
    for (const b of btns) expect(b.querySelector('.td-table__action-label').getBoundingClientRect().width).to.be.above(10);
  });

  it('an action without a valid icon keeps its visible text in card mode', async () => {
    const cols = [COLS[0], COLS[1], { key: 'act', label: 'Thao tác', actions: [{ id: 'a', label: 'Duyệt bài' }, { id: 'b', label: 'Ẩn', icon: 'no-such-icon' }] }];
    const { el } = await mk(360, cols, POSTS);
    const btns = [...rows(el)[0].querySelectorAll('.td-table__action')];
    expect(btns.some((b) => b.classList.contains('td-table__action--icon'))).to.equal(false);
    for (const b of btns) expect(b.querySelector('.td-table__action-label').getBoundingClientRect().width).to.be.above(10);
  });

  it('> 2 actions: the "Thao tác" menu button is icon-only in card mode, keeps its text name', async () => {
    const cols = [COLS[0], COLS[1], { key: 'act', label: 'Thao tác', actions: [...ACT, { id: 'p', label: 'In' }] }];
    const { el } = await mk(360, cols, POSTS);
    const menu = rows(el)[0].querySelector('.td-table__actions-menu');
    expect(menu.classList.contains('td-table__action--icon')).to.equal(true);
    const r = menu.getBoundingClientRect();
    expect(Math.abs(r.width - 32) <= 0.5 && Math.abs(r.height - 32) <= 0.5).to.equal(true);
    expect(menu.textContent.trim()).to.equal('Thao tác');
  });

  it('coarse pointer: stylesheet sizes icon buttons to the touch minimum and the action gap to 8px', () => {
    const sheet = [...document.styleSheets].find((s) => s.href && s.href.endsWith('/td.css'));
    const found = { size: false, gap: false, lead: false };
    const walk = (list, coarse) => {
      for (const r of list) {
        const isCoarse = coarse || (r.media && /pointer:\s*coarse/.test(r.media.mediaText));
        if (r.cssRules) walk(r.cssRules, isCoarse);
        if (!isCoarse || !r.style) continue;
        if (/--_td-table-action-size/.test(r.cssText) && /td-touch-min/.test(r.cssText)) found.size = true;
        if (/--_td-table-action-gap/.test(r.cssText)) found.gap = true;
        if (/--_td-table-lead-size/.test(r.cssText) && /td-text-sm/.test(r.cssText)) found.lead = true;
      }
    };
    walk(sheet.cssRules, false);
    expect(found).to.deep.equal({ size: true, gap: true, lead: true });
  });
});

/**
 * Hit area of `btn`: its box, and elementFromPoint at the centre and 2px inside each edge resolves to `btn` (or inside it).
 * @returns {{ w: number, h: number, misses: string[] }}
 */
function hitArea(btn) {
  const r = btn.getBoundingClientRect();
  const pts = { centre: [r.left + r.width / 2, r.top + r.height / 2], left: [r.left + 2, r.top + r.height / 2],
    right: [r.right - 2, r.top + r.height / 2], top: [r.left + r.width / 2, r.top + 2], bottom: [r.left + r.width / 2, r.bottom - 2] };
  const misses = Object.entries(pts).filter(([, [x, y]]) => {
    const hit = document.elementFromPoint(x, y);
    return !hit || !(hit === btn || btn.contains(hit));
  }).map(([k]) => k);
  return { w: r.width, h: r.height, misses };
}

// ISSUE-3 (Codex impl-review): coarse-pointer runtime fixture. web-test-runner cannot emulate `pointer: coarse` (its
// emulateMedia has no pointer feature), so the values of td.css's OWN `@media (pointer: coarse)` rule for `.td-table`
// are read from the stylesheet and applied to the table root via CSSOM (same values, same cascade target); when the
// engine really is coarse the media rule applies by itself. The real-device version (Playwright hasTouch / isMobile,
// Chromium + WebKit) is in test/responsive/responsive.spec.mjs ("td-table icon actions (coarse)").
describe('v0.36.1 td-table — coarse pointer: two icon actions (ISSUE-3)', () => {
  /** custom properties the td.css `@media (pointer: coarse)` rule sets on `.td-table` */
  function coarseTableVars() {
    const sheet = [...document.styleSheets].find((x) => x.href && x.href.endsWith('/td.css'));
    const out = {};
    const walk = (list, coarse) => {
      for (const r of list) {
        const isCoarse = coarse || (r.media && /pointer:\s*coarse/.test(r.media.mediaText));
        if (r.cssRules) walk(r.cssRules, isCoarse);
        if (isCoarse && r.selectorText === '.td-table' && r.style) {
          for (const prop of r.style) if (prop.startsWith('--_td-table-')) out[prop] = r.style.getPropertyValue(prop).trim();
        }
      }
    };
    walk(sheet.cssRules, false);
    return out;
  }

  it('each visible icon action has a ≥ 44 × 44 hit area (elementFromPoint centre + edges), ≥ 8px apart', async () => {
    const vars = coarseTableVars();
    expect(Object.keys(vars).sort()).to.deep.equal(['--_td-table-action-gap', '--_td-table-action-size', '--_td-table-lead-size']);
    const { el } = await mk(360, COLS, POSTS);
    const root = el.querySelector('.td-table');
    if (!matchMedia('(pointer: coarse)').matches) for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
    await frames(2);
    const btns = [...rows(el)[0].querySelectorAll('.td-table__action--icon')].filter(visible);
    expect(btns).to.have.length(2);
    btns[0].scrollIntoView({ block: 'center' });
    await frames(2);
    const areas = btns.map(hitArea);
    areas.forEach((a, i) => {
      expect(a.w >= 43.5 && a.h >= 43.5, `action ${i} ${a.w}×${a.h}`).to.equal(true);
      expect(a.misses, `action ${i} edge probes`).to.deep.equal([]);
    });
    const [a, b] = btns.map((x) => x.getBoundingClientRect());
    const gap = Math.max(b.left - a.right, a.left - b.right);
    expect(gap >= 7.5, `separation ${gap}px`).to.equal(true);
    expect(btns.map((x) => x.textContent.trim())).to.deep.equal(['Sửa', 'Xoá']);
  });
});

describe('v0.36.1 td-table — one-row sort bar (QĐ 8)', () => {
  const SORT6 = ['code', 'customer', 'phone', 'total', 'date', 'status'].map((key, i) => ({ key, label: `Cột sắp xếp ${i + 1}`, sortable: true }));
  const DATA = Array.from({ length: 3 }, (_, i) => ({ code: `DH${i}`, customer: `Khách ${3 - i}`, phone: '0900', total: i, date: '01/10', status: 'x' }));

  it('6 sortable columns at 360 → one row that scrolls; focusing the last chip scrolls it in; Enter sorts, focus kept', async () => {
    const { el } = await mk(360, SORT6, DATA);
    const bar = el.querySelector('.td-table__head > tr');
    const chips = [...bar.querySelectorAll('.td-table__th--sortable')];
    expect(new Set(chips.map((c) => Math.round(c.getBoundingClientRect().top))).size, 'one row').to.equal(1);
    expect(bar.scrollWidth > bar.clientWidth, 'bar scrolls').to.equal(true);
    expect(getComputedStyle(bar).flexWrap).to.equal('nowrap');
    expect(bar.getBoundingClientRect().height).to.be.at.most(44.5);
    const last = chips[chips.length - 1].querySelector('.td-table__sort');
    chips[0].querySelector('.td-table__sort').focus();
    for (let i = 0; i < 10 && document.activeElement !== last; i++) await sendKeys({ press: 'Tab' });
    if (document.activeElement !== last) last.focus(); // engines whose Tab skips buttons (WebKit default): focus() scrolls too
    expect(document.activeElement === last).to.equal(true);
    expect(await until(() => {
      const b = bar.getBoundingClientRect();
      const r = last.getBoundingClientRect();
      return r.left >= b.left - 1 && r.right <= b.right + 1;
    })).to.equal(true);
    await sendKeys({ press: 'Enter' });
    expect(last.closest('th').getAttribute('aria-sort')).to.equal('ascending');
    expect(document.activeElement === last).to.equal(true);
  });

  it('resize 900 → 360 → 900 keeps the same row nodes (no re-render)', async () => {
    const { wrap, el } = await mk(900, COLS, POSTS);
    const before = rows(el);
    wrap.style.width = '360px';
    expect(await until(() => isCard(el))).to.equal(true);
    expect(rows(el).every((r, i) => r === before[i])).to.equal(true);
    wrap.style.width = '900px';
    expect(await until(() => !isCard(el))).to.equal(true);
    expect(rows(el).every((r, i) => r === before[i])).to.equal(true);
    expect(el.querySelectorAll('[style]').length === el.querySelectorAll('[data-col][style]').length).to.equal(true);
  });
});
