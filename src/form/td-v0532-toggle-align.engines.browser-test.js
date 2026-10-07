import { expect } from '@esm-bundle/chai';
import './td-toggle.js';
import './td-checkbox.js';
import '../display/td-table.js';

// v0.53.2 (dsuite bug, owner screenshot) — a <td-toggle> next to text sat ~2.5 px (flex row) / ~6.5 px (inline line) ABOVE
// the text: the host was `inline-block` around the inline-flex switch, so the host box = a line box with descender space
// under the switch (md: host 29 px for a 24 px switch) and its baseline = the track bottom. Fixed: host `inline-flex` +
// `vertical-align: middle` → host box = switch box. Chromium / Firefox / WebKit. The checkbox (host 24 px = its control box,
// centred in flex rows) is asserted too as the audit's control case.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });

const frames = (n = 2) => new Promise((r) => { const f = (i) => (i ? requestAnimationFrame(() => f(i - 1)) : r()); f(n); });
const cleanup = [];
afterEach(() => cleanup.splice(0).forEach((f) => f()));
function mount(html) {
  const wrap = document.createElement('div');
  wrap.className = 'td-test-align';
  wrap.innerHTML = html;
  document.body.appendChild(wrap);
  cleanup.push(() => wrap.remove());
  return wrap;
}
const mid = (r) => (r.top + r.bottom) / 2;
const TEXT = 'font: 14px/1.5 system-ui, sans-serif';

const TOGGLES = [];
for (const size of ['sm', 'md', 'lg']) {
  TOGGLES.push([`toggle ${size}, no label`, `<td-toggle controlled aria-label="Đang dùng" size="${size}"></td-toggle>`]);
  TOGGLES.push([`toggle ${size}, label`, `<td-toggle label="Bật" size="${size}"></td-toggle>`]);
}

describe('v0.53.2 toggle — vertical alignment next to text', () => {
  it('inline-flex row (align-items: center): the track centre within 1 px of the text centre; host box = switch box', async () => {
    const w = mount(TOGGLES.map(([, h], i) => `<div class="row" data-i="${i}" style="display:inline-flex;align-items:center;gap:8px;${TEXT}">${h}<span class="t">Đang dùng</span></div><br>`).join(''));
    await frames();
    for (const row of w.querySelectorAll('.row')) {
      const [name] = TOGGLES[row.dataset.i];
      const host = row.querySelector('td-toggle');
      const d = mid(host.querySelector('.td-switch__track').getBoundingClientRect()) - mid(row.querySelector('.t').getBoundingClientRect());
      expect(Math.abs(d) <= 1, `${name}: track centre ${d.toFixed(2)} px from the text centre`).to.equal(true);
      const hb = host.getBoundingClientRect().height;
      const sb = host.querySelector('.td-switch').getBoundingClientRect().height;
      expect(Math.abs(hb - sb) <= 0.5, `${name}: host ${hb} vs switch ${sb}`).to.equal(true);
    }
  });

  it('plain inline text line: host box = switch box (no descender space), the track centred on the text', async () => {
    const w = mount(TOGGLES.map(([, h], i) => `<p class="line" data-i="${i}" style="${TEXT};margin:4px">Trạng thái: ${h} <span class="t">Đang dùng</span></p>`).join(''));
    await frames();
    for (const p of w.querySelectorAll('.line')) {
      const [name] = TOGGLES[p.dataset.i];
      const host = p.querySelector('td-toggle');
      const hb = host.getBoundingClientRect().height;
      const sb = host.querySelector('.td-switch').getBoundingClientRect().height;
      expect(Math.abs(hb - sb) <= 0.5, `${name}: host ${hb} vs switch ${sb}`).to.equal(true);
      const d = mid(host.querySelector('.td-switch__track').getBoundingClientRect()) - mid(p.querySelector('.t').getBoundingClientRect());
      expect(Math.abs(d) <= 2.5, `${name}: track centre ${d.toFixed(2)} px from the text centre (was −4.5…−8.7)`).to.equal(true);
    }
  });

  for (const [layout, width] of [['table', 900], ['card', 360]]) {
    it(`td-table cell (${layout} layout): toggle + "Đang dùng" in an inline-flex cell — centred within 1 px`, async () => {
      const w = mount(`<div style="width:${width}px;${TEXT}"><td-table></td-table></div>`);
      const t = w.querySelector('td-table');
      t.columns = [
        { key: 'name', label: 'Tên' },
        { key: 'status', label: 'Trạng thái', render: (row) => {
          const d = document.createElement('div');
          d.className = 'cell-row';
          d.innerHTML = `<td-toggle controlled aria-label="Trạng thái ${row.name}"${row.on ? ' checked' : ''}></td-toggle><span class="t">${row.on ? 'Đang dùng' : 'Đã tắt'}</span>`;
          return d;
        } },
      ];
      t.data = [{ name: 'Gói A', on: true }, { name: 'Gói B', on: false }];
      const style = document.createElement('style'); // test-only (no CSP in the test page): the site's cell row
      style.textContent = '.cell-row { display: inline-flex; align-items: center; gap: 8px; }';
      document.head.appendChild(style);
      cleanup.push(() => style.remove());
      await frames(3);
      const rows = [...w.querySelectorAll('.cell-row')];
      expect(rows.length).to.equal(2);
      for (const r of rows) {
        const d = mid(r.querySelector('.td-switch__track').getBoundingClientRect()) - mid(r.querySelector('.t').getBoundingClientRect());
        expect(Math.abs(d) <= 1, `${layout}: track centre ${d.toFixed(2)} px from the text centre`).to.equal(true);
      }
    });
  }

  it('checkbox (audit control case, unchanged): host box = control box, centred in an inline-flex row', async () => {
    const w = mount(['<td-checkbox aria-label="Chọn"></td-checkbox>', '<td-checkbox label="Chọn"></td-checkbox>'].map((h) => `<div class="row" style="display:inline-flex;align-items:center;gap:8px;${TEXT}">${h}<span class="t">Đang dùng</span></div><br>`).join(''));
    await frames();
    for (const row of w.querySelectorAll('.row')) {
      const host = row.querySelector('td-checkbox');
      const d = mid(host.querySelector('.td-checkbox__mark').getBoundingClientRect()) - mid(row.querySelector('.t').getBoundingClientRect());
      expect(Math.abs(d) <= 1, `checkbox: ${d.toFixed(2)}`).to.equal(true);
      expect(Math.abs(host.getBoundingClientRect().height - host.querySelector('.td-checkbox').getBoundingClientRect().height) <= 0.5).to.equal(true);
    }
  });
});

describe('v0.53.2 the standalone switch (PHP td_toggle native mode: a bare label.td-switch)', () => {
  it('on a plain inline text line it centres like the host (vertical-align: middle), not on the track bottom', async () => {
    const sw = '<label class="td-switch td-switch--md"><input type="checkbox" role="switch" class="td-switch__input" aria-label="X">'
      + '<span class="td-switch__track" aria-hidden="true"><span class="td-switch__thumb"></span></span></label>';
    const w = mount(`<p class="line" style="${TEXT};margin:4px">Trạng thái: ${sw} <span class="t">Đang dùng</span></p>`);
    await frames();
    const d = mid(w.querySelector('.td-switch__track').getBoundingClientRect()) - mid(w.querySelector('.t').getBoundingClientRect());
    expect(Math.abs(d) <= 2.5, `native switch: ${d.toFixed(2)} px`).to.equal(true);
  });
});
