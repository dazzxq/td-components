import { TdMenu } from './td-menu.js';
import { TdModal } from './td-modal.js';
import { TdLightbox } from './td-lightbox.js';
import { escapeHtml } from '../utils/escape.js';
import '../styles/story-layout.css';

export default {
  title: 'Feedback/Menu',
  tags: ['autodocs'],
  args: { label: 'Tùy chọn', hint: 'Chỉ quản trị viên' },
  argTypes: {
    label: { control: 'text', description: 'Nhãn nút mở menu (văn bản)' },
    hint: { control: 'text', description: 'Dòng phụ của mục bị khoá (văn bản)' },
  },
};

const out = (root, id) => root.querySelector(`#${id}`);
const say = (root, id, text) => { const o = out(root, id); if (o) o.textContent = text; };

/** "···" button from TdMenu.button() (icon-only → aria-label "Tùy chọn"); items built lazily at open. */
export const MoreButton = {
  name: 'Nút "···"',
  render: () => `<div class="sb-stack"><div class="sb-row" id="mn-more"></div>
    <p class="sb-note" id="mn-more-out">Bấm nút hoặc Tab tới rồi nhấn ↓ / ↑. Esc đóng; Tab đóng và đi tiếp.</p></div>`,
  play: ({ canvasElement }) => {
    const btn = TdMenu.button({
      getItems: () => [
        { label: 'Sao chép liên kết', icon: 'link', onSelect: () => say(canvasElement, 'mn-more-out', 'Đã sao chép.') },
        { label: 'Tải xuống', icon: 'download', onSelect: () => say(canvasElement, 'mn-more-out', 'Đang tải…') },
        { separator: true },
        { label: 'Báo cáo', danger: true, onSelect: () => say(canvasElement, 'mn-more-out', 'Đã gửi báo cáo.') },
      ],
    });
    out(canvasElement, 'mn-more').append(btn);
  },
};

/** A site's own button bound with TdMenu.bind(); danger item, disabled item with a hint, hint on an enabled item. */
export const DangerDisabledHint = {
  name: 'Nguy hiểm / khoá / gợi ý',
  render: (args) => `<div class="sb-stack">
    <button type="button" class="td-menu-btn" id="mn-dh"><span class="td-menu-btn__label">${escapeHtml(args.label)}</span></button>
    <p class="sb-note" id="mn-dh-out">Mục bị khoá vẫn nhận focus bằng phím mũi tên nhưng không kích hoạt được.</p></div>`,
  play: ({ canvasElement, args }) => {
    TdMenu.bind(out(canvasElement, 'mn-dh'), () => [
      { label: 'Tải ảnh gốc', hint: 'JPEG · 4,2 MB', onSelect: () => say(canvasElement, 'mn-dh-out', 'Tải ảnh gốc.') },
      { label: 'Chuyển vào kho lưu trữ', hint: String(args?.hint ?? ''), disabled: true },
      { separator: true },
      { label: 'Xoá bài viết', danger: true, onSelect: () => say(canvasElement, 'mn-dh-out', 'Đã xoá (giả lập).') },
    ], { align: 'start' });
  },
};

/** Radio group (closes on pick) + checkbox (stays open) — plain buttons with aria-checked, no nested controls. */
export const Checkable = {
  name: 'Chọn một / bật tắt',
  render: () => `<div class="sb-stack"><div class="sb-row" id="mn-chk"></div><p class="sb-note" id="mn-chk-out"></p></div>`,
  play: ({ canvasElement }) => {
    const items = [
      { label: 'Mới nhất', group: 'sort', checked: true },
      { label: 'Cũ nhất', group: 'sort', checked: false },
      { label: 'Nhiều tương tác', group: 'sort', checked: false },
      { separator: true },
      { label: 'Chỉ hiện bài có ảnh', type: 'checkbox', checked: false },
    ];
    for (const it of items) {
      if (!it.separator) it.onSelect = (ctx) => say(canvasElement, 'mn-chk-out', `${ctx.item.label}: ${ctx.checked ? 'bật' : 'tắt'}`);
    }
    out(canvasElement, 'mn-chk').append(TdMenu.button({ label: 'Sắp xếp', icon: 'sort', items }));
  },
};

/** Real links: middle-click / new tab work. Only http(s)/mailto/tel/relative; `javascript:` becomes a disabled item. */
export const Links = {
  name: 'Liên kết',
  render: () => `<div class="sb-row" id="mn-links"></div>`,
  play: ({ canvasElement }) => {
    out(canvasElement, 'mn-links').append(TdMenu.button({
      label: 'Liên kết',
      icon: 'external',
      items: [
        { label: 'Trang chủ', href: '#' },
        { label: 'Mở tài liệu (tab mới)', href: 'https://developer.mozilla.org/', newTab: true, icon: 'external' },
        { label: 'Gửi thư', href: 'mailto:hotro@example.com' },
        { label: 'Liên kết không an toàn', href: 'javascript:alert(1)' },
      ],
    }));
  },
};

/** Inside a TdModal: the menu is solid (no glass on glass); Escape closes only the menu; Tab stays in the dialog. */
export const InModal = {
  name: 'Trong modal',
  render: () => `<div class="sb-stack"><button type="button" class="td-btn td-btn--primary" id="mn-modal">
    <span class="td-btn__label">Mở modal</span></button></div>`,
  play: ({ canvasElement }) => {
    out(canvasElement, 'mn-modal').addEventListener('click', () => {
      const body = document.createElement('div');
      body.className = 'sb-row';
      const input = document.createElement('input');
      input.setAttribute('aria-label', 'Tiêu đề');
      const menuBtn = TdMenu.button({
        items: [{ label: 'Nhân bản' }, { label: 'Đổi tên' }, { separator: true }, { label: 'Xoá', danger: true }],
      });
      body.append(input, menuBtn);
      TdModal.show({ title: 'Sửa mục', body, actions: [{ label: 'Đóng' }] });
    });
  },
};

/** 135 recipe: a lightbox toolbar button opens a download menu (the anchor is owned by the lightbox). */
export const LightboxToolbar = {
  name: 'Từ thanh công cụ lightbox',
  render: () => `<div class="sb-stack"><button type="button" class="td-btn td-btn--secondary" id="mn-lb">
    <span class="td-btn__label">Mở lightbox</span></button></div>`,
  play: ({ canvasElement }) => {
    out(canvasElement, 'mn-lb').addEventListener('click', () => {
      TdLightbox.open([1, 2].map((n) => ({ src: `/lightbox/${n}.svg`, caption: `Ảnh ${n}` })), {
        toolbar: [{
          id: 'download-menu',
          label: 'Tải xuống',
          icon: 'download',
          onClick: (ctx, b) => TdMenu.open(b, [
            { label: 'Ảnh gốc', hint: 'Đầy đủ độ phân giải', href: ctx.item.src },
            { label: 'Bản nhỏ', hint: 'Tối đa 1280 px', href: ctx.item.src },
          ]),
        }],
      });
    });
  },
};
