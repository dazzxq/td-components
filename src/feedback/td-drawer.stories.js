import { escapeHtml } from '../utils/escape.js';
import './td-drawer.js';
import '../styles/story-layout.css';

export default {
  title: 'Feedback/Drawer',
  tags: ['autodocs'],
  argTypes: {
    title: { control: 'text' },
    side: { control: 'select', options: ['end', 'start'] },
    size: { control: 'select', options: ['sm', 'md', 'lg', 'xl'] },
  },
};

const esc = (v) => escapeHtml(String(v ?? ''));
const trigger = (id, label, variant = 'primary') => `<button type="button" class="td-btn td-btn--${variant}" id="${id}">
  <span class="td-btn__label">${esc(label)}</span></button>`;

/** Declarative: the children move into the panel on open (same nodes) and come back on close. */
export const Declarative = {
  render: (args) => `<div class="sb-stack">${trigger('dr-open', 'Mở bộ lọc')}
    <td-drawer id="dr-filters" title="${esc(args.title)}" side="${esc(args.side)}" size="${esc(args.size)}">
      <label class="td-field__label" for="dr-q">Từ khoá</label><input id="dr-q" class="td-field__control">
      <p class="sb-note">Escape, bấm nền hoặc nút × để đóng.</p>
      <div slot="footer"><button type="button" class="td-btn td-btn--primary" id="dr-apply"><span class="td-btn__label">Áp dụng</span></button></div>
    </td-drawer><p class="sb-note" id="dr-out"></p></div>`,
  args: { title: 'Bộ lọc', side: 'end', size: 'md' },
  play: ({ canvasElement }) => {
    const drawer = canvasElement.querySelector('#dr-filters');
    const out = canvasElement.querySelector('#dr-out');
    canvasElement.querySelector('#dr-open').addEventListener('click', () => drawer.show());
    canvasElement.querySelector('#dr-apply').addEventListener('click', () => drawer.close('button'));
    drawer.addEventListener('close', (e) => { out.textContent = `Đã đóng (${e.detail.reason}).`; });
  },
};

/** JS API: TdDrawer.open({ title, body, footer, side }) → { element, close, closed }. */
export const JsApi = {
  render: () => `<div class="sb-stack">${trigger('dr-js-end', 'Mở từ phải (end)')}${trigger('dr-js-start', 'Mở từ trái (start)', 'secondary')}
    <p class="sb-note" id="dr-js-out"></p></div>`,
  play: ({ canvasElement }) => {
    const out = canvasElement.querySelector('#dr-js-out');
    const open = (side) => {
      const body = document.createElement('p');
      body.textContent = `Panel trượt từ cạnh ${side === 'start' ? 'đầu' : 'cuối'} (RTL tự lật).`;
      const h = customElements.get('td-drawer').open({ title: 'Sửa nhanh', body, side, size: 'sm' });
      h.closed.then((reason) => { out.textContent = `closed: ${reason}`; });
    };
    canvasElement.querySelector('#dr-js-end').addEventListener('click', () => open('end'));
    canvasElement.querySelector('#dr-js-start').addEventListener('click', () => open('start'));
  },
};

/** dismissible="false" + before-close: Escape / backdrop do nothing; the × asks before losing unsaved input. */
export const UnsavedGuard = {
  render: () => `<div class="sb-stack">${trigger('dr-guard-open', 'Sửa hồ sơ')}
    <td-drawer id="dr-guard" title="Hồ sơ" dismissible="false">
      <label class="td-field__label" for="dr-name">Tên</label><input id="dr-name" class="td-field__control" value="An">
      <p class="sb-note">Sửa tên rồi bấm × — drawer hỏi lại trước khi đóng.</p>
    </td-drawer></div>`,
  play: ({ canvasElement }) => {
    const drawer = canvasElement.querySelector('#dr-guard');
    const input = canvasElement.querySelector('#dr-name');
    canvasElement.querySelector('#dr-guard-open').addEventListener('click', () => drawer.show());
    drawer.addEventListener('before-close', (e) => {
      // eslint-disable-next-line no-alert
      if (input.value !== input.defaultValue && !window.confirm('Bỏ thay đổi chưa lưu?')) e.preventDefault();
    });
  },
};
