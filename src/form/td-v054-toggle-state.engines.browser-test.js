import { expect } from '@esm-bundle/chai';
import { TdToggle } from './td-toggle.js';
import './td-checkbox.js';
import './td-hint.js';

// v0.54.0 (plan docs/internal/plans/v0.54.0-hint.md QĐ 8, 10, Codex plan-review r2 #11–13) — td-toggle `on-text` /
// `off-text` (visible state text switched by CSS from :checked, the current one in the description, never the name) and
// the checkable layout (hint + error under the label, baseline kept) in Chromium, Firefox AND WebKit.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { await tick(); await tick(); };
const cleanup = [];
afterEach(() => {
  cleanup.splice(0).forEach((f) => f());
  document.documentElement.removeAttribute('dir');
});
function mount(html, wrapTag = 'div') {
  const d = document.createElement(wrapTag);
  d.innerHTML = html;
  document.body.appendChild(d);
  cleanup.push(() => d.remove());
  return d;
}
const input = (el) => el.querySelector('input');
const desc = (el) => (input(el).getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
const descText = (el) => desc(el).map((x) => document.getElementById(x)?.textContent ?? `#${x}?`).join(' | ');
const vis = (node) => !!node && getComputedStyle(node).visibility !== 'hidden' && getComputedStyle(node).display !== 'none';
const on = (el) => el.querySelector('.td-switch__state-on');
const off = (el) => el.querySelector('.td-switch__state-off');
const stateBox = (el) => el.querySelector('.td-switch__state');
/** the accessible name a label-wrapped input gets (DOM level, every engine): the label text minus aria-hidden subtrees */
function nameOf(el) {
  const l = input(el).labels[0];
  const c = l.cloneNode(true);
  for (const h of c.querySelectorAll('[aria-hidden="true"]')) h.remove();
  return c.textContent.replace(/\s+/g, ' ').trim();
}

describe('v0.54.0 td-toggle on-text / off-text (QĐ 10)', () => {
  it('DOM: inside the label after the label text, aria-hidden wrapper, ids from the host; the name never contains it', async () => {
    const el = mount('<td-toggle id="t1" label="Lưu trữ" on-text="Đang dùng" off-text="Đã lưu trữ"></td-toggle>').firstElementChild;
    await settle();
    const box = stateBox(el);
    expect(!!box && box.parentElement === el.querySelector('label.td-switch'), 'in the label').to.equal(true);
    expect(box.previousElementSibling?.classList.contains('td-switch__label')).to.equal(true);
    expect(box.getAttribute('aria-hidden')).to.equal('true');
    expect(on(el).id).to.equal('t1-on');
    expect(off(el).id).to.equal('t1-off');
    expect(nameOf(el)).to.equal('Lưu trữ');
  });

  it('off: the off text visible, its id in the description; on: the other one — CSS from :checked', async () => {
    const el = mount('<td-toggle id="t2" label="Lưu trữ" on-text="Đang dùng" off-text="Đã lưu trữ"></td-toggle>').firstElementChild;
    await settle();
    expect(vis(off(el)) && !vis(on(el))).to.equal(true);
    expect(desc(el)).to.deep.equal(['t2-off']);
    input(el).click();
    await settle();
    expect(el.checked).to.equal(true);
    expect(vis(on(el)) && !vis(off(el))).to.equal(true);
    expect(desc(el)).to.deep.equal(['t2-on']);
    el.checked = false; // from code
    await settle();
    expect(desc(el)).to.deep.equal(['t2-off']);
    expect(vis(off(el))).to.equal(true);
  });

  it('the width does not jump when it flips (both texts share one grid cell)', async () => {
    const el = mount('<td-toggle label="A" on-text="Đang dùng hằng ngày" off-text="Tắt"></td-toggle>').firstElementChild;
    await settle();
    const w1 = el.getBoundingClientRect().width;
    el.checked = true;
    await settle();
    expect(Math.abs(el.getBoundingClientRect().width - w1)).to.be.below(0.5);
  });

  it('controlled, pending commit() and its revert keep exactly one state id matching input.checked', async () => {
    const el = mount('<td-toggle id="t3" controlled label="A" on-text="Bật" off-text="Tắt"></td-toggle>').firstElementChild;
    await settle();
    let release;
    const gate = new Promise((r) => { release = r; });
    el.addEventListener('change', (e) => { el.commit(async () => { await gate; return false; }, e.detail.checked); });
    const failed = new Promise((r) => el.addEventListener('commit-error', r, { once: true }));
    input(el).click();
    await settle();
    expect(input(el).checked, 'optimistic: on while pending').to.equal(true);
    expect(desc(el)).to.deep.equal(['t3-on']);
    expect(vis(on(el))).to.equal(true);
    release();
    await failed;
    await settle();
    expect(input(el).checked).to.equal(false);
    expect(desc(el)).to.deep.equal(['t3-off']);
    expect(vis(off(el))).to.equal(true);
  });

  it('form reset → the state id follows the reset state', async () => {
    const f = mount('<form><td-toggle id="t4" name="t" label="A" on-text="Bật" off-text="Tắt"></td-toggle></form>').firstElementChild;
    const el = f.firstElementChild;
    await settle();
    input(el).click();
    await settle();
    expect(desc(el)).to.deep.equal(['t4-on']);
    f.reset();
    await settle();
    expect(desc(el)).to.deep.equal(['t4-off']);
  });

  it('only on-text → nothing shown / described while off', async () => {
    const el = mount('<td-toggle id="t5" label="A" on-text="Bật"></td-toggle>').firstElementChild;
    await settle();
    expect(off(el)).to.equal(null);
    expect(desc(el)).to.deep.equal([]);
    el.checked = true;
    await settle();
    expect(desc(el)).to.deep.equal(['t5-on']);
  });

  it('on-text drops the tone default status text; an explicit status-text is kept (no double reading by default)', async () => {
    const el = mount('<td-toggle id="t6" label="2FA" tone="success" checked on-text="Đang bật"></td-toggle>').firstElementChild;
    await settle();
    expect(descText(el)).to.equal('Đang bật');
    el.setAttribute('status-text', 'Đã xác minh qua ứng dụng');
    await settle();
    expect(descText(el)).to.equal('Đang bật | Đã xác minh qua ứng dụng');
  });

  it('order: state, status, lock, hint, error', async () => {
    const el = mount('<td-toggle id="t7" label="A" checked status-text="S" locked locked-reason="R" on-text="Bật" helper-text="H"></td-toggle>').firstElementChild;
    await settle();
    expect(desc(el)).to.deep.equal(['t7-on', 't7-status', 't7-lock', 't7-note']);
  });

  it('on-text / off-text change at runtime: patched in place (same input node), structure = render()', async () => {
    const el = mount('<td-toggle id="t8" label="A"></td-toggle>').firstElementChild;
    await settle();
    const node = input(el);
    el.setAttribute('on-text', 'Bật');
    el.setAttribute('off-text', 'Tắt');
    await settle();
    expect(input(el) === node, 'same input').to.equal(true);
    expect(off(el)?.textContent).to.equal('Tắt');
    el.setAttribute('off-text', 'Đã tắt');
    expect(off(el).textContent).to.equal('Đã tắt');
    el.removeAttribute('on-text');
    el.removeAttribute('off-text');
    await settle();
    expect(stateBox(el)).to.equal(null);
    expect(desc(el)).to.deep.equal([]);
  });

  it('text over 200 code points is cut', async () => {
    const el = mount(`<td-toggle id="t9" label="A" off-text="${'x'.repeat(250)}"></td-toggle>`).firstElementChild;
    await settle();
    expect(off(el).textContent.length).to.equal(200);
    expect(TdToggle.observedAttributes).to.include.members(['on-text', 'off-text']);
  });

  it('in a table cell: no label, state text next to the switch, one row', async () => {
    const t = mount('<table><tr><td>Hàng</td><td><td-toggle aria-label="Dùng" on-text="Đang dùng" off-text="Đã lưu trữ"></td-toggle></td></tr></table>');
    await settle();
    const el = t.querySelector('td-toggle');
    const tr = el.querySelector('.td-switch__track').getBoundingClientRect();
    const st = stateBox(el).getBoundingClientRect();
    expect(st.left).to.be.at.least(tr.right - 0.5);
    expect(Math.abs((st.top + st.bottom) / 2 - (tr.top + tr.bottom) / 2)).to.be.below(4);
  });
});

describe('v0.54.0 checkable layout: hint / error under the label, baseline kept (QĐ 8)', () => {
  const kinds = [
    { tag: 'td-toggle', label: '.td-switch__label', ctl: '.td-switch__track' },
    { tag: 'td-checkbox', label: '.td-checkbox__label', ctl: '.td-checkbox__mark' },
  ];
  for (const k of kinds) {
    for (const size of ['sm', 'md', 'lg']) {
      for (const dir of ['ltr', 'rtl']) {
        it(`${k.tag} ${size} ${dir}: note and error start under the label text`, async () => {
          if (dir === 'rtl') document.documentElement.setAttribute('dir', 'rtl');
          const el = mount(`<${k.tag} size="${size}" label="Nhãn khá dài" helper-text="Gợi ý dưới nhãn"></${k.tag}>`).firstElementChild;
          await settle();
          const lab = el.querySelector(k.label).getBoundingClientRect();
          const note = el.querySelector('.td-field__note').getBoundingClientRect();
          const edge = (r) => (dir === 'rtl' ? r.right : r.left);
          expect(Math.abs(edge(note) - edge(lab)), 'note under the label').to.be.below(0.6);
          el.setError('Lỗi');
          await settle();
          const err = el.querySelector('.td-field-error').getBoundingClientRect();
          expect(Math.abs(edge(err) - edge(lab)), 'error under the label').to.be.below(0.6);
        });
      }
    }

    // after v0.53.2 (toggle host inline-flex + vertical-align: middle): with a hint / error the CONTROL ROW keeps the
    // position it has without one: level with a twin without a hint (< 1 px) and, like v0.53.2's inline-line case, within
    // 2.5 px of the text span centre (`middle` = baseline + ½ex, not the span box centre), every size, label or not, hint
    // or error (plan "Lệch" #11)
    for (const size of ['sm', 'md', 'lg']) {
      for (const extra of ['helper-text="Gợi ý dưới nhãn"', 'error-text="Lỗi"', 'helper-text="Gợi ý" label="Nhãn"']) {
        it(`${k.tag} ${size} ${extra}: inline in text, the control row stays level with the text (and with a twin without a hint)`, async () => {
          const d = mount(`<p style="font: 14px/1.5 system-ui, sans-serif">Trước <${k.tag} size="${size}" aria-label="A"></${k.tag}> <span class="t">giữa</span> <${k.tag} size="${size}" aria-label="B" ${extra}></${k.tag}> sau</p>`);
          await settle();
          const [a, b] = d.querySelectorAll(k.tag);
          const mid = (r) => (r.top + r.bottom) / 2;
          const ca = mid(a.querySelector(k.ctl).getBoundingClientRect());
          const cb = mid(b.querySelector(k.ctl).getBoundingClientRect());
          const ct = mid(d.querySelector('.t').getBoundingClientRect());
          expect(Math.abs(ca - cb), `twin rows ${ca} vs ${cb}`).to.be.below(1);
          if (k.tag === 'td-toggle') expect(Math.abs(cb - ct), `track centre ${cb} vs text ${ct}`).to.be.at.most(2.5);
        });
      }
    }

    it(`${k.tag}: a site-hidden <td-hint> child changes nothing in the host box (Codex r2 #11)`, async () => {
      const d = mount(`<${k.tag} label="Một"></${k.tag}><${k.tag} label="Một"><td-hint hidden>Ẩn</td-hint></${k.tag}>`);
      await settle();
      const [a, b] = d.querySelectorAll(k.tag);
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      expect(Math.abs(ra.height - rb.height)).to.be.below(0.5);
      expect(Math.abs(ra.width - rb.width)).to.be.below(0.5);
      expect(getComputedStyle(b).display).to.equal(getComputedStyle(a).display);
      b.querySelector('td-hint').hidden = false;
      await settle();
      expect(b.getBoundingClientRect().height).to.be.above(ra.height + 4);
    });

    it(`${k.tag} without a label (table cell): the note sits under the control`, async () => {
      const d = mount(`<${k.tag} aria-label="X" helper-text="Gợi ý"></${k.tag}>`);
      await settle();
      const el = d.firstElementChild;
      const c = el.querySelector(k.ctl).getBoundingClientRect();
      const note = el.querySelector('.td-field__note').getBoundingClientRect();
      expect(Math.abs(note.left - c.left)).to.be.below(0.6);
    });
  }
});

// dsuite (2026-10-07, measured): "Trạng thái: [toggle] Đang dùng" — with v0.53.2's `vertical-align: middle` the switch is
// centred on the x-height and the state text sits ~1.7 px below the label's baseline. With on-text / off-text the host's
// baseline IS the state text's: it shares the exact baseline with the surrounding text (±0.5 px), the track stays centred
// on the text (±2.5 px). Without on/off text nothing changes (td-v0532-toggle-align stays green unchanged).
describe('v0.54.0 on-text / off-text share the baseline of the surrounding text (dsuite)', () => {
  const TEXT = 'font: 14px/1.5 system-ui, sans-serif';
  const PROBE = '<span class="bp" style="display:inline-block;width:0;height:0"></span>'; // test-only: bottom = baseline
  const mid = (r) => (r.top + r.bottom) / 2;
  /** the baseline of the visible state text (a zero-size inline-block probe inside it) */
  function stateBaseline(t) {
    const s = t.querySelector(t.checked ? '.td-switch__state-on' : '.td-switch__state-off');
    if (!s.querySelector('.bp')) s.insertAdjacentHTML('beforeend', PROBE);
    return s.querySelector('.bp').getBoundingClientRect().bottom;
  }
  function check(where, label, t) {
    const lb = label.querySelector('.bp').getBoundingClientRect().bottom;
    const sb = stateBaseline(t);
    expect(Math.abs(sb - lb) <= 0.5, `${where}: state baseline ${sb} vs label baseline ${lb}`).to.equal(true);
    const tr = mid(t.querySelector('.td-switch__track').getBoundingClientRect());
    const tx = mid(label.getBoundingClientRect());
    expect(Math.abs(tr - tx) <= 2.5, `${where}: track centre ${tr} vs text centre ${tx}`).to.equal(true);
  }
  const TOGGLES = [];
  for (const size of ['sm', 'md', 'lg']) {
    for (const checked of ['', ' checked']) {
      TOGGLES.push(`<td-toggle size="${size}" aria-label="Dùng"${checked} on-text="Đang dùng" off-text="Đã lưu trữ"></td-toggle>`);
      TOGGLES.push(`<td-toggle size="${size}" label="Gói A"${checked} on-text="Đang dùng" off-text="Đã lưu trữ"></td-toggle>`);
    }
  }

  it('a plain inline text line: "Trạng thái: [toggle on-text]"', async () => {
    const d = mount(TOGGLES.map((h) => `<p style="${TEXT};margin:6px"><span class="lab">Trạng thái:${PROBE}</span> ${h}</p>`).join(''));
    await settle();
    for (const p of d.querySelectorAll('p')) check(`inline ${p.querySelector('td-toggle').outerHTML.slice(0, 60)}`, p.querySelector('.lab'), p.querySelector('td-toggle'));
  });

  it('an inline-flex row with align-items: baseline', async () => {
    const d = mount(TOGGLES.map((h) => `<div style="display:inline-flex;align-items:baseline;gap:8px;${TEXT};margin:6px"><span class="lab">Trạng thái:${PROBE}</span>${h}</div><br>`).join(''));
    await settle();
    for (const r of d.querySelectorAll('div')) check(`flex-baseline ${r.querySelector('td-toggle').getAttribute('size')}`, r.querySelector('.lab'), r.querySelector('td-toggle'));
  });

  for (const [layout, width] of [['table', 900], ['card', 360]]) {
    it(`td-table cell (${layout} layout): "Trạng thái: [toggle on-text]" in a cell`, async () => {
      await import('../display/td-table.js');
      const d = mount(`<div style="width:${width}px;${TEXT}"><td-table></td-table></div>`);
      const t = d.querySelector('td-table');
      t.columns = [
        { key: 'name', label: 'Tên' },
        { key: 'status', label: 'Trạng thái', render: (row) => {
          const c = document.createElement('span');
          c.innerHTML = `<span class="lab">Trạng thái:${PROBE}</span> <td-toggle aria-label="Dùng ${row.name}"${row.on ? ' checked' : ''} on-text="Đang dùng" off-text="Đã lưu trữ"></td-toggle>`;
          return c;
        } },
      ];
      t.data = [{ name: 'Gói A', on: true }, { name: 'Gói B', on: false }];
      await settle();
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const labs = [...d.querySelectorAll('.lab')];
      expect(labs.length).to.equal(2);
      for (const lab of labs) check(`${layout}`, lab, lab.parentElement.querySelector('td-toggle'));
    });
  }

  it('without on/off text the v0.53.2 rule is untouched (vertical-align: middle, the label centred)', async () => {
    const d = mount('<p><td-toggle label="X"></td-toggle></p>');
    await settle();
    const t = d.querySelector('td-toggle');
    expect(getComputedStyle(t).verticalAlign).to.equal('middle');
    expect(getComputedStyle(t.querySelector('.td-switch__label')).alignSelf).to.equal('auto');
  });

  it('with on/off text the label and the state text stay level with each other and centred on the track (±2.5 px)', async () => {
    const d = mount(['sm', 'md', 'lg'].map((s) => `<p><td-toggle size="${s}" label="Gói A" on-text="Đang dùng" off-text="Đã lưu"></td-toggle></p>`).join(''));
    await settle();
    for (const t of d.querySelectorAll('td-toggle')) {
      const lab = t.querySelector('.td-switch__label').getBoundingClientRect();
      const st = t.querySelector('.td-switch__state').getBoundingClientRect();
      const tr = t.querySelector('.td-switch__track').getBoundingClientRect();
      expect(Math.abs(lab.top - st.top) < 0.5, `label ${lab.top} vs state ${st.top}`).to.equal(true);
      expect(Math.abs(mid(lab) - mid(tr)) <= 2.5, `label centre ${mid(lab)} vs track ${mid(tr)}`).to.equal(true);
    }
  });
});
