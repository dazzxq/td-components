import '../styles/story-layout.css';
import './td-tooltip.js';

export default {
  title: 'Feedback/Tooltip',
  tags: ['autodocs'],
};

/** Strong glass chip, no arrow. Shows on hover (mouse/pen) and keyboard focus; Escape hides it; hoverable. */
export const Default = {
  render: () => `
    <div class="sb-stack">
      <button type="button" class="td-btn td-btn--primary" data-tooltip="Lưu các thay đổi của tài liệu">Lưu</button>
      <p class="sb-note">Di chuột hoặc Tab tới nút. Esc để ẩn; có thể di chuột lên tooltip.</p>
    </div>
  `,
};

export const Positions = {
  render: () => `
    <div class="sb-row">
      <button type="button" class="td-btn td-btn--secondary" data-tooltip="Tooltip phía trên" data-tooltip-position="top">Trên</button>
      <button type="button" class="td-btn td-btn--secondary" data-tooltip="Tooltip phía dưới" data-tooltip-position="bottom">Dưới</button>
      <button type="button" class="td-btn td-btn--secondary" data-tooltip="Tooltip bên trái" data-tooltip-position="left">Trái</button>
      <button type="button" class="td-btn td-btn--secondary" data-tooltip="Tooltip bên phải" data-tooltip-position="right">Phải</button>
    </div>
  `,
};

/** Solid chips; text colour picked by WCAG contrast unless data-tooltip-text-color is given. */
export const CustomColor = {
  render: () => `
    <div class="sb-row">
      <button type="button" class="td-btn td-btn--secondary" data-tooltip="Màu tím" data-tooltip-color="#6d28d9">Tím</button>
      <button type="button" class="td-btn td-btn--secondary" data-tooltip="Màu vàng (chữ tối tự động)" data-tooltip-color="#fde047">Vàng</button>
      <button type="button" class="td-btn td-btn--secondary" data-tooltip="Màu chữ tuỳ chỉnh" data-tooltip-color="#111827" data-tooltip-text-color="#fde047">Tuỳ chỉnh</button>
    </div>
  `,
};

/** Naming policy: title → aria-label when it is the only name; unnamed icon buttons get data-tooltip as aria-label. */
export const IconButtons = {
  render: () => `
    <div class="sb-stack">
      <div class="sb-row">
        <button type="button" class="td-btn td-btn--secondary" title="Tải xuống" data-tooltip="Tải tệp về máy">
          <span aria-hidden="true">⤓</span>
        </button>
        <button type="button" class="td-btn td-btn--secondary" data-tooltip="Tìm kiếm">
          <span aria-hidden="true">⌕</span>
        </button>
      </div>
      <p class="sb-note">Nút đầu: title "Tải xuống" thành tên, tooltip là mô tả. Nút sau: không có tên → tooltip thành aria-label (cảnh báo trong console).</p>
    </div>
  `,
};

export const LongText = {
  render: () => `
    <button type="button" class="td-btn td-btn--secondary"
            data-tooltip="Một chú thích dài sẽ tự xuống dòng ở độ rộng tối đa 18rem và không bao giờ tràn khỏi màn hình nhỏ.">
      Chú thích dài
    </button>
  `,
};

export const OnLinks = {
  render: () => `
    <p class="sb-note">
      Di chuột lên <a href="#" data-tooltip="Tooltip trên liên kết">liên kết này</a>
      hoặc <a href="#" data-tooltip="Tooltip phía dưới" data-tooltip-position="bottom">liên kết này</a>.
    </p>
  `,
};

export const DarkTheme = {
  render: () => `
    <div class="sb-stack">
      <button type="button" class="td-btn td-btn--secondary" data-tooltip="Tooltip ở giao diện tối">Tối</button>
      <p class="sb-note">Bật &lt;html data-td-theme="dark"&gt; để xem chip kính tối.</p>
    </div>
  `,
};
