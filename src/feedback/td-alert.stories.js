import { escapeHtml } from '../utils/escape.js';
import './td-alert.js';
import '../styles/story-layout.css';

export default {
  title: 'Feedback/Alert',
  tags: ['autodocs'],
  argTypes: {
    variant: { control: 'select', options: ['info', 'success', 'warning', 'danger'] },
    heading: { control: 'text' },
    message: { control: 'text' },
    dismissible: { control: 'boolean' },
  },
};

const esc = (v) => escapeHtml(String(v ?? ''));

/** Authored content: the child text becomes `.td-alert__message`; `dismissible` adds the close button (JS). */
export const Default = {
  render: (args) => `
    <td-alert variant="${esc(args.variant)}"${args.heading ? ` heading="${esc(args.heading)}"` : ''}${args.dismissible ? ' dismissible' : ''}>${esc(args.message)}</td-alert>`,
  args: { variant: 'info', heading: 'Lưu ý', message: 'Phiên đăng nhập sẽ hết hạn sau 5 phút.', dismissible: true },
};

/** The four variants (danger → role="alert", the others role="status"). */
export const Variants = {
  render: () => `
    <div class="sb-stack">
      <td-alert variant="info" heading="Thông tin">Đã gửi yêu cầu, bạn sẽ nhận email xác nhận.</td-alert>
      <td-alert variant="success" heading="Thành công" dismissible>Đã lưu thay đổi.</td-alert>
      <td-alert variant="warning">Ảnh lớn hơn 5 MB sẽ bị nén trước khi tải lên.</td-alert>
      <td-alert variant="danger" heading="Không lưu được" dismissible>Mất kết nối máy chủ, thử lại sau.</td-alert>
    </div>`,
};

/** SSR: the markup PHP td_alert() prints (full styled block inside the host) — the element upgrades it in place. */
export const ServerRendered = {
  render: (args) => `
    <td-alert variant="success" dismissible heading="${esc(args.heading)}"><div class="td-alert td-alert--success" role="status"><span class="td-alert__icon" aria-hidden="true"></span><div class="td-alert__body"><p class="td-alert__heading">${esc(args.heading)}</p><div class="td-alert__message">${esc(args.message)}</div></div></div></td-alert>`,
  args: { heading: 'Flash', message: 'Markup từ server, JS chỉ gắn nút đóng.' },
};

/** CSS-only `.td-alert` block (no custom element, never dismissible). */
export const CssOnly = {
  render: (args) => `
    <div class="td-alert td-alert--warning" role="status"><div class="td-alert__body"><div class="td-alert__message">${esc(args.message)}</div></div></div>`,
  args: { message: 'Khối .td-alert thuần CSS.' },
};
