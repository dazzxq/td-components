import { expect } from '@esm-bundle/chai';
import './td-toggle.js';
import './td-checkbox.js';
import './td-hint.js';
import '../display/td-table.js';

// v0.59.1 (plan docs/internal/plans/v0.59.1-label-position.md) — `label-position="start"` on td-toggle / td-checkbox: the
// label sits on the inline-start side of the control (CSS `order` only: DOM order, name, focus order and the SSR skeleton
// are untouched), default / `end` / anything else = the layout of v0.59.0. Chromium, Firefox AND WebKit. DOM nodes are
// compared as booleans (a failing chai assertion carrying DOM nodes hangs the runner).
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const frames = (n = 2) => new Promise((r) => { const f = (i) => (i ? requestAnimationFrame(() => f(i - 1)) : r()); f(n); });
const cleanup = [];
afterEach(() => cleanup.splice(0).forEach((f) => f()));
function mount(html, dir = 'ltr') {
  const wrap = document.createElement('div');
  wrap.setAttribute('dir', dir);
  wrap.innerHTML = html;
  document.body.appendChild(wrap);
  cleanup.push(() => wrap.remove());
  return wrap;
}
const KINDS = [
  { tag: 'td-toggle', block: 'td-switch', ctl: '.td-switch__track', label: '.td-switch__label' },
  { tag: 'td-checkbox', block: 'td-checkbox', ctl: '.td-checkbox__mark', label: '.td-checkbox__label' },
];
const kindOf = (el) => KINDS.find((k) => el.matches(`${k.tag}, .${k.block}`));
const rect = (el, sel) => el.querySelector(sel).getBoundingClientRect();
const ctlRect = (el) => rect(el, kindOf(el).ctl);
const labelRect = (el) => rect(el, kindOf(el).label);
const mid = (r) => (r.top + r.bottom) / 2;
const input = (el) => el.querySelector('input');
/** 'start' = the label is on the inline-start side of the control, 'end' = after it (physical side from `dir`) */
function side(el, dir = 'ltr') {
  const c = ctlRect(el);
  const l = labelRect(el);
  const labelFirst = dir === 'rtl' ? l.left >= c.right - 0.5 : l.right <= c.left + 0.5;
  const labelLast = dir === 'rtl' ? l.right <= c.left + 0.5 : l.left >= c.right - 0.5;
  return labelFirst ? 'start' : (labelLast ? 'end' : 'overlap');
}
/** the free space between label and control */
function gap(el) {
  const c = ctlRect(el);
  const l = labelRect(el);
  return Math.max(c.left - l.right, l.left - c.right);
}
const near = (a, b, tol = 0.6) => Math.abs(a - b) <= tol;

describe('v0.59.1 label-position — geometry', () => {
  for (const k of KINDS) {
    for (const dir of ['ltr', 'rtl']) {
      it(`${k.tag} ${dir}: start puts the label on the inline-start side, same gap / box / vertical centre, every size`, async () => {
        const sizes = ['sm', 'md', 'lg'];
        const w = mount(sizes.map((s) => `<p><${k.tag} class="a" size="${s}" label="Hiển thị"></${k.tag}></p>`
          + `<p><${k.tag} class="b" size="${s}" label="Hiển thị" label-position="start"></${k.tag}></p>`).join(''), dir);
        await frames();
        const a = [...w.querySelectorAll('.a')];
        const b = [...w.querySelectorAll('.b')];
        sizes.forEach((s, i) => {
          const L = `${k.tag} ${s} ${dir}`;
          expect(side(a[i], dir), `${L}: default`).to.equal('end');
          expect(side(b[i], dir), `${L}: start`).to.equal('start');
          expect(near(gap(a[i]), gap(b[i]), 0.5), `${L}: gap ${gap(b[i])} vs ${gap(a[i])}`).to.equal(true);
          expect(gap(b[i]) > 2, `${L}: a real gap (${gap(b[i])})`).to.equal(true);
          const ra = a[i].getBoundingClientRect();
          const rb = b[i].getBoundingClientRect();
          // The hit box (the <label>) is the exact one. td-toggle: host box = switch box (inline-flex, v0.53.2) → the host
          // is compared too. td-checkbox: the host is an inline-block LINE box (pre-existing; v0.53.2 left it), whose
          // height follows the baseline of the first item of the row — Firefox lg: 26.4 px with the mark first, 25 px
          // with the label text first — so only its width is compared.
          const ia = rect(a[i], `.${k.block}`);
          const ib = rect(b[i], `.${k.block}`);
          expect(near(ia.width, ib.width, 0.5) && near(ia.height, ib.height, 0.1), `${L}: hit box ${ib.width}×${ib.height} vs ${ia.width}×${ia.height}`).to.equal(true);
          expect(near(ra.width, rb.width, 0.5), `${L}: host width ${rb.width} vs ${ra.width}`).to.equal(true);
          if (k.tag === 'td-toggle') expect(near(ra.height, rb.height, 0.5), `${L}: host height ${rb.height} vs ${ra.height}`).to.equal(true);
          expect(near(mid(ctlRect(b[i])), mid(labelRect(b[i])), 1), `${L}: label centred on the control`).to.equal(true);
          expect(near(mid(ctlRect(b[i])) - ib.top, mid(ctlRect(a[i])) - ia.top, 0.5), `${L}: control at the same height in the hit box`).to.equal(true);
          // the control sits on the inline-end edge of the hit box, the label on its inline-start edge
          const box = rect(b[i], `.${k.block}`);
          const c = ctlRect(b[i]);
          const l = labelRect(b[i]);
          expect(dir === 'rtl' ? near(c.left, box.left) && near(l.right, box.right) : near(c.right, box.right) && near(l.left, box.left),
            `${L}: edges`).to.equal(true);
        });
      });
    }

    it(`${k.tag}: "end", an unknown value, a wrong case and an empty value keep the default layout`, async () => {
      const values = ['end', 'left', 'START', '', ' start'];
      const w = mount(`<p><${k.tag} label="Hiển thị"></${k.tag}></p>`
        + values.map((v) => `<p><${k.tag} label="Hiển thị" label-position="${v}"></${k.tag}></p>`).join(''));
      await frames();
      const [ref, ...els] = [...w.querySelectorAll(k.tag)];
      const r0 = ref.getBoundingClientRect();
      els.forEach((el, i) => {
        expect(side(el), `"${values[i]}"`).to.equal('end');
        const r = el.getBoundingClientRect();
        expect(near(r.width, r0.width, 0.1) && near(r.height, r0.height, 0.1), `"${values[i]}": same box`).to.equal(true);
        expect(el.labelPosition, `"${values[i]}": property`).to.equal('end');
      });
    });

    it(`${k.tag}: no label → the attribute changes nothing`, async () => {
      const w = mount(`<p><${k.tag} aria-label="Hiển thị"></${k.tag}></p><p><${k.tag} aria-label="Hiển thị" label-position="start"></${k.tag}></p>`);
      await frames();
      const [a, b] = [...w.querySelectorAll(k.tag)];
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      expect(near(ra.width, rb.width, 0.1) && near(ra.height, rb.height, 0.1)).to.equal(true);
      expect(near(ctlRect(a).left - ra.left, ctlRect(b).left - rb.left, 0.1), 'control at the same place').to.equal(true);
      expect(input(b).getAttribute('aria-label')).to.equal('Hiển thị');
    });

    it(`${k.tag}: a long label wraps next to the control, the control stays on the inline-end edge`, async () => {
      const w = mount(`<div style="width:220px"><${k.tag} label="Hiển thị mục này trên trang chủ và trong kết quả tìm kiếm của khách" label-position="start"></${k.tag}></div>`);
      await frames();
      const el = w.querySelector(k.tag);
      const box = el.parentElement.getBoundingClientRect();
      const l = labelRect(el);
      const c = ctlRect(el);
      expect(side(el)).to.equal('start');
      expect(l.height > 30, `label wraps (${l.height})`).to.equal(true);
      expect(c.right <= box.right + 0.5 && l.left >= box.left - 0.5, `inside the 220 px box (control right ${c.right}, box ${box.right})`).to.equal(true);
      expect(near(mid(c), mid(l), 1), 'control centred on the label block').to.equal(true);
    });
  }
});

describe('v0.59.1 label-position — DOM, name, hit area', () => {
  for (const k of KINDS) {
    it(`${k.tag}: DOM order, classes and the accessible name are those of the default (CSS-only reordering)`, async () => {
      const w = mount(`<${k.tag} label="Hiển thị"></${k.tag}><${k.tag} label="Hiển thị" label-position="start"></${k.tag}>`);
      await frames();
      const [a, b] = [...w.querySelectorAll(k.tag)];
      const shape = (el) => [...el.querySelector('label').children].map((c) => `${c.localName}.${c.className}`).join(' > ');
      expect(shape(b)).to.equal(shape(a));
      expect(b.querySelector('label').className).to.equal(a.querySelector('label').className);
      expect(b.querySelector('label').firstElementChild === input(b), 'the input is still the first child').to.equal(true);
      expect(input(b).labels.length === 1 && input(b).labels[0] === b.querySelector('label'), 'the wrapping label names it').to.equal(true);
      expect(input(b).labels[0].textContent.trim()).to.equal('Hiển thị');
    });

    it(`${k.tag}: label + gap + control are ONE hit area; a click on the label toggles (one change)`, async () => {
      const w = mount(`<p style="margin:8px"><${k.tag} label="Hiển thị" label-position="start"></${k.tag}></p>`);
      await frames();
      const el = w.querySelector(k.tag);
      const root = el.querySelector('label');
      const l = labelRect(el);
      const c = ctlRect(el);
      const y = mid(root.getBoundingClientRect());
      for (const [name, x] of [['label', (l.left + l.right) / 2], ['gap', (l.right + c.left) / 2], ['control', (c.left + c.right) / 2]]) {
        const hit = document.elementFromPoint(x, y);
        expect(!!hit && hit.closest('label') === root, `${name}: inside the label`).to.equal(true);
      }
      const seen = [];
      el.addEventListener('change', (e) => seen.push(e.detail.checked));
      el.querySelector(k.label).click();
      expect(el.checked, 'label click turns it on').to.equal(true);
      el.querySelector(k.ctl).click();
      expect(el.checked, 'control click turns it off').to.equal(false);
      expect(seen).to.deep.equal([true, false]);
    });
  }
});

describe('v0.59.1 label-position — property + runtime change', () => {
  for (const k of KINDS) {
    it(`${k.tag}: labelPosition reflects (start ↔ attribute, anything else → no attribute, getter start | end)`, async () => {
      const el = mount(`<${k.tag} label="Hiển thị"></${k.tag}>`).firstElementChild;
      await frames();
      expect(el.labelPosition).to.equal('end');
      el.labelPosition = 'start';
      expect(el.getAttribute('label-position')).to.equal('start');
      expect(el.labelPosition).to.equal('start');
      el.labelPosition = 'end';
      expect(el.hasAttribute('label-position')).to.equal(false);
      el.labelPosition = 'start';
      for (const bad of ['left', 'START', '', null, undefined, 1, true]) {
        el.labelPosition = bad;
        expect(el.hasAttribute('label-position'), `${String(bad)} → default`).to.equal(false);
        expect(el.labelPosition).to.equal('end');
        el.labelPosition = 'start';
      }
      el.setAttribute('label-position', 'left');
      expect(el.labelPosition, 'an invalid attribute reads end').to.equal('end');
    });

    it(`${k.tag}: a runtime change moves the label in place — same nodes, focus kept, no change event`, async () => {
      const el = mount(`<${k.tag} label="Hiển thị" checked></${k.tag}>`).firstElementChild;
      await frames();
      const root = el.querySelector('label');
      const field = input(el);
      const seen = [];
      el.addEventListener('change', () => seen.push(1));
      field.focus();
      expect(document.activeElement === field).to.equal(true);
      expect(side(el)).to.equal('end');
      el.setAttribute('label-position', 'start');
      await frames();
      expect(side(el), 'attribute → start').to.equal('start');
      expect(el.querySelector('label') === root && input(el) === field, 'same label + input nodes').to.equal(true);
      expect(document.activeElement === field, 'focus kept').to.equal(true);
      el.labelPosition = 'end';
      await frames();
      expect(side(el), 'property → end').to.equal('end');
      el.labelPosition = 'start';
      await frames();
      expect(side(el), 'property → start').to.equal('start');
      el.removeAttribute('label-position');
      await frames();
      expect(side(el), 'removed → end').to.equal('end');
      expect(input(el) === field && document.activeElement === field && el.checked === true, 'still the same focused, checked input').to.equal(true);
      expect(seen.length).to.equal(0);
    });

    it(`${k.tag}: a later re-render (label / size change) keeps the position`, async () => {
      const el = mount(`<${k.tag} label="Hiển thị" label-position="start"></${k.tag}>`).firstElementChild;
      await frames();
      el.setAttribute('label', 'Hiển thị trên trang chủ');
      el.setAttribute('size', 'lg');
      await frames();
      expect(side(el)).to.equal('start');
      expect(el.querySelector(k.label).textContent).to.equal('Hiển thị trên trang chủ');
    });
  }
});

describe('v0.59.1 label-position — helper / hint / error under the label', () => {
  const NOTES = [
    ['helper-text', (t) => `<${t} label="Nhận email" label-position="start" helper-text="Tối đa một email mỗi tuần"></${t}>`, '.td-field__note'],
    ['<td-hint> child', (t) => `<${t} label="Nhận email" label-position="start"><td-hint>Tối đa một email mỗi tuần</td-hint></${t}>`, 'td-hint'],
    ['error-text', (t) => `<${t} label="Nhận email" label-position="start" error-text="Không lưu được"></${t}>`, '.td-field-error'],
  ];
  for (const k of KINDS) {
    for (const dir of ['ltr', 'rtl']) {
      it(`${k.tag} ${dir}: the note starts on the label's start edge (no control-width indent), every size`, async () => {
        const sizes = ['sm', 'md', 'lg'];
        const w = mount(sizes.map((s) => NOTES.map(([, html]) => `<p>${html(k.tag).replace(' label=', ` size="${s}" label=`)}</p>`).join('')).join(''), dir);
        await frames(3);
        const els = [...w.querySelectorAll(k.tag)];
        expect(els.length).to.equal(9);
        els.forEach((el, i) => {
          const [name, , sel] = NOTES[i % 3];
          const L = `${k.tag} ${sizes[Math.floor(i / 3)]} ${name} ${dir}`;
          const note = el.querySelector(`:scope > ${sel}`);
          expect(!!note, `${L}: note present`).to.equal(true);
          const n = note.getBoundingClientRect();
          const l = labelRect(el);
          expect(n.height > 0, `${L}: note visible`).to.equal(true);
          expect(side(el, dir), L).to.equal('start');
          expect(dir === 'rtl' ? near(n.right, l.right) : near(n.left, l.left), `${L}: note ${dir === 'rtl' ? n.right : n.left} vs label ${dir === 'rtl' ? l.right : l.left}`).to.equal(true);
          expect(n.top >= l.bottom - 0.5, `${L}: under the label row`).to.equal(true);
        });
      });
    }

    it(`${k.tag}: the default position keeps the v0.54 indent (note under the label text, after the control)`, async () => {
      const w = mount(`<p><${k.tag} label="Nhận email" helper-text="Tối đa một email mỗi tuần"></${k.tag}></p>`
        + `<p><${k.tag} label="Nhận email" label-position="end" error-text="Không lưu được"></${k.tag}></p>`);
      await frames(3);
      for (const el of w.querySelectorAll(k.tag)) {
        const n = el.querySelector(':scope > .td-field__note:not([hidden]), :scope > .td-field-error').getBoundingClientRect();
        expect(near(n.left, labelRect(el).left), `note ${n.left} vs label ${labelRect(el).left}`).to.equal(true);
        expect(n.left > ctlRect(el).right, 'indented past the control').to.equal(true);
      }
    });
  }
});

describe('v0.59.1 label-position — td-toggle state text, tone, locked; td-checkbox indeterminate', () => {
  for (const dir of ['ltr', 'rtl']) {
    it(`toggle ${dir}: label — track — state text (the state text stays on the outer side of the track)`, async () => {
      const w = mount(['sm', 'md', 'lg'].map((s) => `<p><td-toggle size="${s}" label="Hiển thị" label-position="start" on-text="Đang bật" off-text="Đang tắt"></td-toggle></p>`).join(''), dir);
      await frames();
      for (const el of w.querySelectorAll('td-toggle')) {
        const l = labelRect(el);
        const c = ctlRect(el);
        const s = rect(el, '.td-switch__state');
        const order = dir === 'rtl' ? (l.left >= c.right - 0.5 && c.left >= s.right - 0.5) : (l.right <= c.left + 0.5 && c.right <= s.left + 0.5);
        expect(order, `${el.getAttribute('size')}: label ${l.left}–${l.right}, track ${c.left}–${c.right}, state ${s.left}–${s.right}`).to.equal(true);
        const g1 = dir === 'rtl' ? l.left - c.right : c.left - l.right;
        const g2 = dir === 'rtl' ? c.left - s.right : s.left - c.right;
        expect(near(g1, g2, 0.5) && g1 > 2, `same gap on both sides of the track (${g1} / ${g2})`).to.equal(true);
        // v0.54: label and state text share one baseline (same font → same box top), the track centred on them
        expect(near(l.top, s.top, 0.5) && near(l.bottom, s.bottom, 0.5), 'label and state text on one line').to.equal(true);
        expect(near(mid(c), mid(l), 1.5), `track centred on the text (${mid(c) - mid(l)})`).to.equal(true);
        // flipping never moves anything (both texts share one cell)
        const before = [l.left, c.left, s.left, s.width];
        el.checked = true;
        const after = [labelRect(el).left, ctlRect(el).left, rect(el, '.td-switch__state').left, rect(el, '.td-switch__state').width];
        expect(after.every((v, i) => near(v, before[i], 0.1)), 'no jump on flip').to.equal(true);
        el.checked = false;
      }
    });
  }

  it('toggle: the default position keeps label — state text after the track (v0.54 unchanged)', async () => {
    const el = mount('<td-toggle label="Hiển thị" on-text="Đang bật" off-text="Đang tắt"></td-toggle>').firstElementChild;
    await frames();
    const l = labelRect(el);
    const c = ctlRect(el);
    const s = rect(el, '.td-switch__state');
    expect(c.right <= l.left + 0.5 && l.right <= s.left + 0.5).to.equal(true);
  });

  it('toggle: state text with a helper note — the note on the label start edge, the description wiring intact', async () => {
    const el = mount('<td-toggle id="lp-st" label="Hiển thị" label-position="start" on-text="Đang bật" off-text="Đang tắt" helper-text="Ẩn khỏi danh sách"></td-toggle>').firstElementChild;
    await frames(3);
    const n = el.querySelector(':scope > .td-field__note').getBoundingClientRect();
    expect(near(n.left, labelRect(el).left)).to.equal(true);
    expect(input(el).getAttribute('aria-describedby')).to.equal('lp-st-off lp-st-note');
  });

  it('toggle: tone / status-text / locked keep their parts and descriptions; the label still leads', async () => {
    const el = mount('<td-toggle id="lp-tl" label="Bắt buộc 2FA" label-position="start" tone="warning" status-text="Chờ quét QR" checked locked locked-reason="Chính sách"></td-toggle>').firstElementChild;
    await frames();
    expect(side(el)).to.equal('start');
    expect(input(el).getAttribute('aria-describedby')).to.equal('lp-tl-status lp-tl-lock');
    expect(input(el).getAttribute('aria-readonly')).to.equal('true');
    expect(el.querySelector(':scope > .td-switch__status').textContent).to.equal('Chờ quét QR');
    expect(!!el.querySelector('.td-switch__icon--lock svg'), 'lock icon').to.equal(true);
    // the sr-only description spans add no box: the host is still exactly the switch
    expect(near(el.getBoundingClientRect().width, rect(el, '.td-switch').width, 0.5)).to.equal(true);
    el.querySelector('.td-switch__label').click();
    await frames();
    expect(el.checked, 'locked: a label click changes nothing').to.equal(true);
  });

  it('checkbox: indeterminate keeps the mixed state and the bar; the label still leads; a label click clears it', async () => {
    const el = mount('<td-checkbox label="Chọn tất cả" label-position="start" indeterminate></td-checkbox>').firstElementChild;
    await frames();
    expect(input(el).indeterminate).to.equal(true);
    expect(side(el)).to.equal('start');
    el.querySelector('.td-checkbox__label').click();
    expect(el.checked && !el.indeterminate && !input(el).indeterminate).to.equal(true);
  });
});

describe('v0.59.1 label-position — next to text, table cell, card', () => {
  it('toggle in a flex row and on an inline text line: the track stays centred on the text (v0.53.2), every size', async () => {
    const sizes = ['sm', 'md', 'lg'];
    const text = 'font: 14px/1.5 system-ui, sans-serif';
    const w = mount(sizes.map((s) => `<div class="row" style="display:inline-flex;align-items:center;gap:8px;${text}"><span class="t">Đang dùng</span><td-toggle size="${s}" label="Hiển thị" label-position="start"></td-toggle></div><br>`
      + `<p class="line" style="${text};margin:4px">Trạng thái: <span class="t">Đang dùng</span> <td-toggle size="${s}" label="Hiển thị" label-position="start"></td-toggle></p>`).join(''));
    await frames();
    for (const row of w.querySelectorAll('.row, .line')) {
      const el = row.querySelector('td-toggle');
      const d = mid(ctlRect(el)) - mid(row.querySelector('.t').getBoundingClientRect());
      const tol = row.classList.contains('row') ? 1 : 2.5;
      expect(Math.abs(d) <= tol, `${row.className} ${el.getAttribute('size')}: track ${d.toFixed(2)} px from the text centre`).to.equal(true);
      expect(near(el.getBoundingClientRect().height, rect(el, '.td-switch').height, 0.5), 'host box = switch box').to.equal(true);
    }
  });

  it('toggle with a note on an inline text line: the label shares the baseline of the surrounding text, the track centred on it', async () => {
    // same font as the kit label (14 px = --td-text-sm) → equal baselines ⇔ equal text-box centres
    const w = mount(['sm', 'md'].map((s) => `<p class="line" style="font-family:var(--td-font-sans);font-size:14px;line-height:1.5;margin:4px">Trạng thái: <span class="t">Đang dùng</span> `
      + `<td-toggle size="${s}" label="Hiển thị" label-position="start" helper-text="Ẩn khỏi danh sách"></td-toggle></p>`).join(''));
    await frames(3);
    for (const p of w.querySelectorAll('.line')) {
      const el = p.querySelector('td-toggle');
      const t = mid(p.querySelector('.t').getBoundingClientRect());
      const dl = mid(labelRect(el)) - t;
      const dc = mid(ctlRect(el)) - t;
      expect(Math.abs(dl) <= 1, `${el.getAttribute('size')}: label ${dl.toFixed(2)} px from the text centre`).to.equal(true);
      expect(Math.abs(dc) <= 2, `${el.getAttribute('size')}: track ${dc.toFixed(2)} px from the text centre`).to.equal(true);
    }
  });

  for (const [layout, width] of [['table', 900], ['card', 360]]) {
    it(`td-table cell (${layout} layout): toggle + checkbox with the label first, centred, inside the cell`, async () => {
      const w = mount(`<div style="width:${width}px"><td-table></td-table></div>`);
      const t = w.querySelector('td-table');
      t.columns = [
        { key: 'name', label: 'Tên' },
        { key: 'show', label: 'Hiển thị', render: (row) => {
          const d = document.createElement('div');
          d.innerHTML = `<td-toggle label="Hiển thị" label-position="start"${row.on ? ' checked' : ''}></td-toggle> <td-checkbox label="Nổi bật" label-position="start"></td-checkbox>`;
          return d;
        } },
      ];
      t.data = [{ name: 'Gói A', on: true }, { name: 'Gói B', on: false }];
      if (layout === 'card') t.setAttribute('layout', 'cards');
      await frames(4);
      const els = [...t.querySelectorAll('td-toggle, td-checkbox')];
      expect(els.length).to.equal(4);
      const box = t.getBoundingClientRect();
      for (const el of els) {
        expect(side(el), el.localName).to.equal('start');
        expect(near(mid(ctlRect(el)), mid(labelRect(el)), 1), `${el.localName}: centred`).to.equal(true);
        const r = el.getBoundingClientRect();
        expect(r.left >= box.left - 0.5 && r.right <= box.right + 0.5, `${el.localName}: inside the table`).to.equal(true);
      }
    });
  }
});

describe('v0.59.1 label-position — PHP markup (SSR contract @1, additive)', () => {
  const ICONS = '<span class="td-switch__icon td-switch__icon--off" data-td-icon="close"></span><span class="td-switch__icon td-switch__icon--on" data-td-icon="check"></span>';
  const SSR = {
    'td-toggle': '<td-toggle data-td-ssr="toggle@1" id="lp-s1-host" name="show" checked label="Hiển thị" size="md" label-position="start">'
      + '<label class="td-switch td-switch--md"><input type="checkbox" role="switch" class="td-switch__input" id="lp-s1" name="show" checked>'
      + `<span class="td-switch__track" aria-hidden="true"><span class="td-switch__thumb">${ICONS}</span></span>`
      + '<span class="td-switch__label">Hiển thị</span></label></td-toggle>',
    'td-checkbox': '<td-checkbox data-td-ssr="checkbox@1" id="lp-s2-host" name="agree" checked label="Đồng ý" size="md" label-position="start">'
      + '<label class="td-checkbox td-checkbox--md"><input type="checkbox" class="td-checkbox__input" id="lp-s2" name="agree" checked>'
      + '<span class="td-checkbox__mark" aria-hidden="true"><span class="td-checkbox__icon" data-td-icon="check" data-td-icon-class="td-checkbox__svg"></span></span>'
      + '<span class="td-checkbox__label">Đồng ý</span></label></td-checkbox>',
  };
  for (const k of KINDS) {
    it(`${k.tag}: element-mode markup with label-position="start" is adopted in place (same input node), label first`, async () => {
      const tpl = document.createElement('template');
      tpl.innerHTML = `<form>${SSR[k.tag]}</form>`;
      const frag = tpl.content.cloneNode(true);
      const el = frag.querySelector(k.tag);
      const field = el.querySelector('input');
      const root = el.querySelector('label');
      expect(el instanceof customElements.get(k.tag), 'inert: not upgraded yet').to.equal(false);
      const w = mount('');
      w.append(frag);
      await frames();
      expect(el instanceof customElements.get(k.tag)).to.equal(true);
      expect(input(el) === field && el.querySelector('label') === root, 'hydrated in place (no re-render)').to.equal(true);
      expect(el.getAttribute('label-position')).to.equal('start');
      expect(el.labelPosition).to.equal('start');
      expect(el.checked).to.equal(true);
      expect(side(el)).to.equal('start');
      expect([...new FormData(w.querySelector('form')).keys()].length, 'one form entry').to.equal(1);
    });

    it(`native markup: .${k.block}--label-start puts the label first (no element, no JS) — LTR and RTL`, async () => {
      const part = k.tag === 'td-toggle'
        ? '<input type="checkbox" role="switch" class="td-switch__input" name="n"><span class="td-switch__track" aria-hidden="true"><span class="td-switch__thumb"></span></span>'
        : '<input type="checkbox" class="td-checkbox__input" name="n"><span class="td-checkbox__mark" aria-hidden="true"></span>';
      const html = (mod) => `<p><label class="${k.block} ${k.block}--md${mod}">${part}<span class="${k.block}__label">Hiển thị</span></label></p>`;
      for (const dir of ['ltr', 'rtl']) {
        const w = mount(html('') + html(` ${k.block}--label-start`), dir);
        await frames();
        const [a, b] = [...w.querySelectorAll('label')];
        expect(side(a, dir), `${dir}: no modifier`).to.equal('end');
        expect(side(b, dir), `${dir}: modifier`).to.equal('start');
        expect(near(gap(a), gap(b), 0.5), `${dir}: same gap`).to.equal(true);
        expect(near(a.getBoundingClientRect().width, b.getBoundingClientRect().width, 0.5), `${dir}: same box`).to.equal(true);
        b.querySelector(`.${k.block}__label`).click();
        expect(b.querySelector('input').checked, `${dir}: the label toggles the native input`).to.equal(true);
        w.remove();
      }
    });
  }
});
