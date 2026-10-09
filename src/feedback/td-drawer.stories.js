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

/**
 * v0.44.0 `beforeClose` + `trackFormDirty().confirmDiscard()`: Escape, a backdrop click and the × ask before losing unsaved
 * input — with the KIT's danger `TdModal.confirm` ("Bỏ thay đổi?"), stacked above the drawer; "Ở lại" returns the focus to the
 * field. Never the browser's `window.confirm`. Leaving the PAGE (reload, closing the tab) is the browser's own
 * `beforeunload` prompt — it cannot be replaced (docs/components/form-validation.md § Rời trang).
 */
export const UnsavedGuard = {
  render: () => `<div class="sb-stack">${trigger('dr-guard-open', 'Sửa hồ sơ')}
    <td-drawer id="dr-guard" title="Hồ sơ">
      <form id="dr-form" novalidate>
        <label class="td-field__label" for="dr-name">Tên</label><input id="dr-name" name="name" class="td-field__control" value="An">
      </form>
      <p class="sb-note">Sửa tên rồi bấm × / Esc / nền — drawer hỏi lại bằng hộp thoại của kit trước khi đóng.</p>
    </td-drawer></div>`,
  play: async ({ canvasElement }) => {
    const { trackFormDirty } = await import('../utils/form-dirty.js'); // loaded in the browser only (check:stories has no DOM)
    const drawer = canvasElement.querySelector('#dr-guard');
    const form = canvasElement.querySelector('#dr-form');
    const tracker = trackFormDirty(form);
    drawer.beforeClose = () => tracker.confirmDiscard();
    canvasElement.querySelector('#dr-guard-open').addEventListener('click', () => drawer.show());
  },
};
