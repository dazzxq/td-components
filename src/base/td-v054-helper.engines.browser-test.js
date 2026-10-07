import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';
import '../form/td-input-field.js';
import '../form/td-number-input.js';
import '../form/td-choice-group.js';
import '../form/td-media-field.js';
import '../form/td-media-gallery.js';
import '../form/td-dropdown.js';
import '../form/td-chip-input.js';
import '../form/td-tree-select.js';
import '../form/td-datetime-picker.js';
import '../form/td-datetime-range.js';
import '../form/td-color-picker.js';
import '../form/td-slider.js';
import '../form/td-otp-input.js';
import '../form/td-scan-input.js';
import '../form/td-check-matrix.js';
import '../form/td-dropzone.js';
import '../form/td-tree.js';
import '../form/td-checkbox.js';
import '../form/td-toggle.js';
import '../form/td-hint.js';
import { trackFormDirty } from '../utils/form-dirty.js';

// v0.54.0 (plan docs/internal/plans/v0.54.0-hint.md QĐ 1–4, M1) — ONE helper contract on every form control, in
// Chromium, Firefox AND WebKit. Two table matrices (Codex plan-review r1 #5): the helper behaviour on all 19 controls;
// the error-hides-the-hint rule on the 18 with an error contract (td-check-matrix has none). DOM nodes are compared as
// booleans / strings (a failing chai assertion carrying DOM nodes hangs the runner).
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/td.css';
document.head.appendChild(link);
await new Promise((r) => { link.onload = r; link.onerror = r; });
document.addEventListener('submit', (e) => e.preventDefault(), true);

const tick = () => new Promise((r) => setTimeout(r, 0));
const cleanup = [];
afterEach(() => cleanup.splice(0).forEach((f) => f()));

const MATRIX = () => ({
  columns: [{ key: 'a', label: 'Vai trò A' }, { key: 'b', label: 'Vai trò B' }],
  rows: [{ key: 'r1', label: 'Xem' }, { key: 'r2', label: 'Sửa' }],
});

/**
 * One row per control: tag, extra attributes, setup after connect, the hint id suffix (media keep their `-help` span —
 * QĐ 2), whether the control renders the note itself (the 5 migrated controls), a structural attribute that re-renders.
 */
const CONTROLS = [
  { tag: 'td-input-field', attrs: 'label="Họ tên"', rendered: true, restruct: ['type', 'email'] },
  { tag: 'td-number-input', attrs: 'label="Số lượng"', rendered: true, restruct: ['size', 'lg'] },
  { tag: 'td-choice-group', attrs: 'label="Dung lượng"', rendered: true, restruct: ['variant', 'swatch'],
    setup: (el) => { el.options = [{ value: '1', label: 'Một' }, { value: '2', label: 'Hai' }]; } },
  { tag: 'td-media-field', attrs: 'label="Ảnh"', suffix: 'help', rendered: true, restruct: ['aspect-ratio', '1/1'] },
  { tag: 'td-media-gallery', attrs: 'label="Ảnh sản phẩm"', suffix: 'help', rendered: true, restruct: ['label', 'Thư viện'] },
  { tag: 'td-dropdown', attrs: 'label="Thành phố"', restruct: ['label', 'Tỉnh'],
    setup: (el) => { el.options = [{ value: 'hn', label: 'Hà Nội' }, { value: 'sg', label: 'Sài Gòn' }]; } },
  { tag: 'td-chip-input', attrs: 'label="Thẻ"', restruct: ['label', 'Nhãn'] },
  { tag: 'td-tree-select', attrs: 'label="Danh mục"', restruct: ['label', 'Nhóm'],
    setup: (el) => { el.data = [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]; } },
  { tag: 'td-datetime-picker', attrs: 'label="Thời gian"', restruct: ['label', 'Lúc'] },
  { tag: 'td-datetime-range', attrs: 'label="Khoảng"', restruct: ['mode', 'datetime'] },
  { tag: 'td-color-picker', attrs: 'label="Màu"', restruct: ['label', 'Sắc'] },
  { tag: 'td-slider', attrs: 'label="Âm lượng"', restruct: ['label', 'Độ to'] },
  { tag: 'td-otp-input', attrs: 'label="Mã"', restruct: ['length', '4'] },
  { tag: 'td-scan-input', attrs: 'label="Mã vạch"', restruct: ['multiple', ''] },
  { tag: 'td-check-matrix', attrs: 'label="Quyền"', noError: true, restruct: ['label', 'Phân quyền'],
    setup: (el) => { el.setData(MATRIX()); } },
  { tag: 'td-dropzone', attrs: 'label="Tệp"', restruct: ['label', 'Tài liệu'] },
  { tag: 'td-tree', attrs: 'label="Chuyên mục"', restruct: ['label', 'Mục'],
    setup: (el) => { el.data = [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]; } },
  { tag: 'td-checkbox', attrs: 'label="Đồng ý"', restruct: ['size', 'lg'] },
  { tag: 'td-toggle', attrs: 'label="Thông báo"', restruct: ['size', 'lg'] },
];
const ERROR_CONTROLS = CONTROLS.filter((c) => !c.noError);

let n = 0;
async function mount(c, extra = '', inner = '') {
  const form = document.createElement('form');
  const id = `h${++n}`;
  form.innerHTML = `<${c.tag} id="${id}" name="f${n}" ${c.attrs} ${extra}>${inner}</${c.tag}>`;
  document.body.appendChild(form);
  cleanup.push(() => form.remove());
  const el = form.firstElementChild;
  c.setup?.(el);
  await tick();
  await tick();
  return el;
}
const suffix = (c) => c.suffix || 'note';
/** the kit text note of `el` (by its id), or null */
const noteOf = (el, c) => el.querySelector(`[id="${el.id}-${suffix(c)}"]`);
const target = (el) => el._ariaTarget();
const described = (el) => (target(el)?.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
/** the accessible description by id resolution (every engine): the text of each referenced element, joined */
const descText = (el) => described(el).map((x) => el.ownerDocument.getElementById(x)?.textContent.trim() ?? `#${x}?`).join(' | ');
const shown = (node) => !!node && !node.hidden && !node.hasAttribute('data-td-suppressed') && getComputedStyle(node).display !== 'none';
/** every id inside the host is unique (Codex r1 #1) */
function idsUnique(el) {
  const ids = [...el.querySelectorAll('[id]')].map((x) => x.id);
  return ids.length === new Set(ids).size;
}

describe('v0.54.0 helper-text — all 19 form controls (QĐ 1, 2)', () => {
  for (const c of CONTROLS) {
    describe(c.tag, () => {
      it('helper-text → a note with the host-derived id, its text, in the control\'s aria-describedby', async () => {
        const el = await mount(c, 'helper-text="Gợi ý một"');
        const note = noteOf(el, c);
        expect(!!note, 'note exists').to.equal(true);
        expect(note.textContent).to.equal('Gợi ý một');
        expect(shown(note), 'note shown').to.equal(true);
        expect(described(el)).to.include(`${el.id}-${suffix(c)}`);
        expect(described(el).filter((x) => x === `${el.id}-${suffix(c)}`).length).to.equal(1);
        expect(el.helperMessage).to.equal('Gợi ý một');
        expect(el.helperText).to.equal('Gợi ý một');
        expect(idsUnique(el)).to.equal(true);
        if (!c.rendered) {
          expect(note.localName).to.equal('div');
          expect(note.className).to.equal('td-field__note');
        }
      });

      it('no helper-text → no visible note and no hint id in the description', async () => {
        const el = await mount(c);
        expect(shown(noteOf(el, c))).to.equal(false);
        expect(described(el)).to.not.include(`${el.id}-${suffix(c)}`);
        expect(el.helperMessage).to.equal('');
      });

      it('page-owned aria-describedby ids are kept, never duplicated', async () => {
        const el = await mount(c, 'helper-text="Gợi ý"');
        const t = target(el);
        t.setAttribute('aria-describedby', `${t.getAttribute('aria-describedby') || ''} page-desc`.trim());
        el.setHelper('Mới');
        expect(described(el)).to.include('page-desc');
        expect(described(el).filter((x) => x === `${el.id}-${suffix(c)}`).length).to.equal(1);
      });

      it('helperText property / setHelper(): in place, the last one set wins; setHelper(\'\') hides', async () => {
        const el = await mount(c, 'helper-text="A"');
        el.setHelper('B');
        expect(noteOf(el, c).textContent).to.equal('B');
        expect(el.helperMessage).to.equal('B');
        el.helperText = 'C';
        expect(noteOf(el, c).textContent).to.equal('C');
        el.setHelper('');
        expect(shown(noteOf(el, c))).to.equal(false);
        expect(described(el)).to.not.include(`${el.id}-${suffix(c)}`);
        el.removeAttribute('helper-text');
        el.setAttribute('helper-text', 'D');
        expect(shown(noteOf(el, c))).to.equal(true);
        expect(noteOf(el, c).textContent).to.equal('D');
      });

      it('helper-text change keeps the focused control focused (no re-render)', async () => {
        const el = await mount(c, 'helper-text="A"');
        const t = el._focusTarget();
        if (!t || typeof t.focus !== 'function') return;
        t.focus();
        const before = el.ownerDocument.activeElement;
        el.setAttribute('helper-text', 'B');
        expect(el.ownerDocument.activeElement === before, 'same focused node').to.equal(true);
        expect(noteOf(el, c).textContent).to.equal('B');
      });

      it('a structural re-render keeps the note and the description', async () => {
        const el = await mount(c, 'helper-text="Giữ lại"');
        el.setAttribute(c.restruct[0], c.restruct[1]);
        await tick();
        await tick();
        const note = noteOf(el, c);
        expect(!!note && note.textContent === 'Giữ lại', 'note after re-render').to.equal(true);
        expect(shown(note)).to.equal(true);
        expect(described(el)).to.include(`${el.id}-${suffix(c)}`);
        expect(idsUnique(el)).to.equal(true);
      });

      it('a child <td-hint> (rich content) takes the hint slot, wins over helper-text, ids stay unique', async () => {
        const el = await mount(c, 'helper-text="Chữ thường"', '<td-hint>Xem <a href="#q">quy định</a> và <code>A-1</code></td-hint>');
        const hint = el.querySelector('td-hint');
        expect(!!hint, 'hint kept').to.equal(true);
        expect(hint.querySelector('a')?.getAttribute('href')).to.equal('#q');
        expect(hint.id).to.equal(`${el.id}-${suffix(c)}`);
        expect(idsUnique(el), 'unique ids').to.equal(true);
        expect(descText(el)).to.include('Xem quy định và A-1');
        expect(descText(el)).to.not.include('Chữ thường');
        expect(shown(hint)).to.equal(true);
        // it sits exactly where the text note sits (Codex r1 #4): same parent as the (dormant) text note / the error host
        const slot = el._helperSlot();
        expect(hint.parentElement === slot.parent, 'hint in the helper slot').to.equal(true);
        // it survives a structural re-render, same node
        el.setAttribute(c.restruct[0], c.restruct[1]);
        await tick();
        await tick();
        expect(el.querySelector('td-hint') === hint, 'same node after re-render').to.equal(true);
        expect(idsUnique(el)).to.equal(true);
        expect(descText(el)).to.include('Xem quy định');
      });

      it('a child <td-hint> keeps the site id; removing it brings the text note back with its id', async () => {
        const el = await mount(c, 'helper-text="Chữ thường"', '<td-hint id="site-hint">Giàu</td-hint>');
        const hint = el.querySelector('td-hint');
        expect(hint.id).to.equal('site-hint');
        expect(described(el)).to.include('site-hint');
        expect(described(el)).to.not.include(`${el.id}-${suffix(c)}`);
        expect(idsUnique(el)).to.equal(true);
        hint.remove();
        await tick();
        el.setHelper('Chữ thường');
        const note = noteOf(el, c);
        expect(!!note && shown(note) && note.textContent === 'Chữ thường', 'text note back').to.equal(true);
        expect(described(el)).to.include(`${el.id}-${suffix(c)}`);
        expect(described(el)).to.not.include('site-hint');
      });

      it('changing the hint does not make a tracked form dirty', async () => {
        const el = await mount(c, 'helper-text="A"');
        const t = trackFormDirty(el.form, { beforeUnload: false });
        cleanup.push(() => t.destroy());
        el.setHelper('B');
        el.setAttribute('helper-text', 'C');
        await tick();
        expect(t.isDirty()).to.equal(false);
      });
    });
  }
});

describe('v0.54.0 error hides the hint — the 18 controls with an error contract (QĐ 3)', () => {
  for (const c of ERROR_CONTROLS) {
    describe(c.tag, () => {
      it('setError → hint hidden + out of the description, error in; clearError → back', async () => {
        const el = await mount(c, 'helper-text="Gợi ý"');
        el.setError('Sai rồi');
        const note = noteOf(el, c);
        expect(shown(note), 'hidden while the error shows').to.equal(false);
        expect(described(el)).to.not.include(`${el.id}-${suffix(c)}`);
        expect(described(el)).to.include(`${el.id}-error`);
        el.clearError();
        expect(shown(noteOf(el, c)), 'back').to.equal(true);
        expect(described(el)).to.include(`${el.id}-${suffix(c)}`);
        expect(described(el)).to.not.include(`${el.id}-error`);
      });

      it('error-text attribute → the same rule; form.reset() clears the error → the hint comes back', async () => {
        const el = await mount(c, 'helper-text="Gợi ý" error-text="Lỗi"');
        expect(shown(noteOf(el, c))).to.equal(false);
        expect(described(el)).to.not.include(`${el.id}-${suffix(c)}`);
        el.form.reset();
        await tick();
        expect(shown(noteOf(el, c))).to.equal(true);
        expect(described(el)).to.include(`${el.id}-${suffix(c)}`);
      });

      it('a child <td-hint> follows the rule with data-td-suppressed (never the site\'s hidden)', async () => {
        const el = await mount(c, '', '<td-hint>Giàu</td-hint>');
        const hint = el.querySelector('td-hint');
        el.setError('Sai');
        expect(hint.hasAttribute('data-td-suppressed')).to.equal(true);
        expect(hint.hidden).to.equal(false);
        expect(shown(hint)).to.equal(false);
        expect(described(el)).to.not.include(hint.id);
        el.clearError();
        expect(hint.hasAttribute('data-td-suppressed')).to.equal(false);
        expect(described(el)).to.include(hint.id);
      });
    });
  }
});

describe('v0.54.0 td-check-matrix: the hint id follows the active cell (QĐ 3b)', () => {
  it('arrows / Home / End move the owned id from the old cell to the new one; other ids of the old cell stay', async () => {
    const c = CONTROLS.find((x) => x.tag === 'td-check-matrix');
    const el = await mount(c, 'helper-text="Tick để cấp quyền"');
    const id = `${el.id}-note`;
    const first = el._ariaTarget();
    expect((first.getAttribute('aria-describedby') || '').split(' ')).to.include(id);
    first.setAttribute('aria-describedby', `${first.getAttribute('aria-describedby')} page-x`);
    el.setHelper('Tick để cấp quyền'); // re-sync (page id now part of the first cell)
    first.focus();
    let moves = 0;
    for (const key of ['ArrowRight', 'ArrowDown', 'End', 'Home']) {
      const before = el._ariaTarget();
      await sendKeys({ press: key });
      await tick();
      const after = el._ariaTarget();
      if (after === before) continue;
      moves += 1;
      const b = (before.getAttribute('aria-describedby') || '').split(/\s+/);
      const a = (after.getAttribute('aria-describedby') || '').split(/\s+/);
      expect(b.includes(id), `${key}: old cell lost the hint id`).to.equal(false);
      expect(a.includes(id), `${key}: new cell has it`).to.equal(true);
    }
    expect(moves, 'the keys moved the active cell').to.be.at.least(3);
    expect((first.getAttribute('aria-describedby') || '').split(/\s+/)).to.include('page-x');
    expect(el.querySelectorAll(`[aria-describedby~="${id}"]`).length).to.equal(1);
  });

  it('a click moves it too; the hint is always shown (no error contract)', async () => {
    const c = CONTROLS.find((x) => x.tag === 'td-check-matrix');
    const el = await mount(c, 'helper-text="Gợi ý"');
    const cells = [...el.querySelectorAll('[tabindex]')].filter((x) => x.closest('tbody'));
    const last = cells[cells.length - 1];
    last.click();
    await tick();
    expect(el.querySelectorAll(`[aria-describedby~="${el.id}-note"]`).length).to.equal(1);
    expect((el._ariaTarget().getAttribute('aria-describedby') || '').split(/\s+/)).to.include(`${el.id}-note`);
    expect(shown(noteOf(el, c))).to.equal(true);
  });
});
