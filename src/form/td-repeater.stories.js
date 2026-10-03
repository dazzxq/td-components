import { escapeHtml } from '../utils/escape.js';
import './td-repeater.js';
import './td-input-field.js';
import { TdModal } from '../feedback/td-modal.js';
import '../styles/story-layout.css';

export default {
  title: 'Form/Repeater',
  tags: ['autodocs'],
  argTypes: {
    label: { control: 'text' },
    addLabel: { control: 'text' },
    minRows: { control: 'number' },
    maxRows: { control: 'number' },
  },
};

const esc = (v) => escapeHtml(String(v ?? ''));
const num = (v) => (Number.isInteger(Number(v)) && Number(v) >= 0 ? String(Number(v)) : '');

/** The app's renaming recipe (docs/components/repeater.md): `data-name` with `{i}`, renamed on every rows-change. */
const rename = (rows) => rows.forEach((row, i) => row.querySelectorAll('[data-name]')
  .forEach((el) => el.setAttribute('name', el.dataset.name.replaceAll('{i}', String(i)))));

/** "Hộp gồm": one field per row, server rows already named, add / remove / move with real buttons. */
export const BoxContents = {
  render: (args) => `<div class="sb-stack">
    <td-repeater label="${esc(args.label)}" add-label="${esc(args.addLabel)}"${num(args.minRows) ? ` min-rows="${num(args.minRows)}"` : ''}${num(args.maxRows) ? ` max-rows="${num(args.maxRows)}"` : ''}>
      <template><div data-td-row class="sb-rep-row"><td-input-field data-name="box[{i}]" aria-label="Phụ kiện" placeholder="Tên phụ kiện"></td-input-field></div></template>
      <div data-td-row class="sb-rep-row"><td-input-field name="box[0]" data-name="box[{i}]" aria-label="Phụ kiện" value="Sạc 20W"></td-input-field></div>
      <div data-td-row class="sb-rep-row"><td-input-field name="box[1]" data-name="box[{i}]" aria-label="Phụ kiện" value="Cáp USB-C"></td-input-field></div>
    </td-repeater></div>`,
  args: { label: 'Hộp gồm', addLabel: 'Thêm phụ kiện', minRows: 1, maxRows: 8 },
  play: ({ canvasElement }) => {
    const rep = canvasElement.querySelector('td-repeater');
    rep.addEventListener('rows-change', (e) => rename(e.detail.rows));
    rename(rep.rows);
  },
};

/** FAQ: two fields per row; × asks for confirmation (cancelable `before-remove` + TdModal.confirm, then removeRow()). */
export const FaqWithConfirm = {
  render: (args) => `<div class="sb-stack">
    <td-repeater label="${esc(args.label)}" add-label="Thêm câu hỏi" max-rows="10">
      <template><div data-td-row class="sb-rep-row">
        <td-input-field data-name="faq[{i}][q]" label="Câu hỏi"></td-input-field>
        <td-input-field type="textarea" rows="2" data-name="faq[{i}][a]" label="Trả lời"></td-input-field>
      </div></template>
      <div data-td-row class="sb-rep-row">
        <td-input-field name="faq[0][q]" data-name="faq[{i}][q]" label="Câu hỏi" value="Bảo hành bao lâu?"></td-input-field>
        <td-input-field type="textarea" rows="2" name="faq[0][a]" data-name="faq[{i}][a]" label="Trả lời" value="12 tháng chính hãng."></td-input-field>
      </div>
    </td-repeater></div>`,
  args: { label: 'Câu hỏi thường gặp' },
  play: ({ canvasElement }) => {
    const rep = canvasElement.querySelector('td-repeater');
    rep.addEventListener('rows-change', (e) => rename(e.detail.rows));
    rename(rep.rows);
    rep.addEventListener('before-remove', async (e) => {
      e.preventDefault();
      const ok = await TdModal.confirm({ message: `Xoá câu hỏi ${e.detail.index + 1}?`, confirmVariant: 'danger' });
      if (ok) rep.removeRow(e.detail.row);
    });
  },
};

/** Limits: at least 2 rows (filled from the template), at most 3 — boundary buttons stay focusable (aria-disabled). */
export const Limits = {
  render: () => `<div class="sb-stack">
    <td-repeater label="Kênh liên hệ (2–3)" min-rows="2" max-rows="3">
      <template><div data-td-row class="sb-rep-row"><td-input-field data-name="contact[{i}]" aria-label="Kênh" placeholder="Zalo, hotline…"></td-input-field></div></template>
    </td-repeater></div>`,
};

/** In a `<form>`: submit shows the FormData — names are re-indexed after every add / remove / move. */
export const InAFormWithRenaming = {
  render: () => `<form class="sb-stack" id="rep-form">
    <td-repeater label="Quyền lợi gói bảo hành" min-rows="1">
      <template><div data-td-row class="sb-rep-row"><input class="td-field__control" data-name="perks[{i}][name]" aria-label="Quyền lợi"></div></template>
      <div data-td-row class="sb-rep-row"><input class="td-field__control" name="perks[0][name]" data-name="perks[{i}][name]" aria-label="Quyền lợi" value="1 đổi 1 trong 30 ngày"></div>
    </td-repeater>
    <button type="submit" class="td-btn td-btn--primary td-btn--sm">Gửi</button>
    <pre class="sb-rep-pre" id="rep-out">FormData: —</pre></form>`,
  play: ({ canvasElement }) => {
    const form = canvasElement.querySelector('#rep-form');
    const rep = form.querySelector('td-repeater');
    rep.addEventListener('rows-change', (e) => rename(e.detail.rows));
    rename(rep.rows);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      canvasElement.querySelector('#rep-out').textContent = [...new FormData(form).entries()].map(([k, v]) => `${k} = ${v}`).join('\n') || '(trống)';
    });
  },
};
