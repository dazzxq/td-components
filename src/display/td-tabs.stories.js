import { escapeHtml } from '../utils/escape.js';
import './td-tabs.js';
import '../styles/story-layout.css';

export default {
  title: 'Display/Tabs',
  tags: ['autodocs'],
  argTypes: {
    size: { control: 'select', options: ['sm', 'md'] },
    'active-tab': { control: 'text' },
    activation: { control: 'select', options: ['manual', 'auto'] },
  },
};

const THREE = [
  { id: 'tab1', label: 'Thẻ 1' },
  { id: 'tab2', label: 'Thẻ 2' },
  { id: 'tab3', label: 'Thẻ 3' },
];

export const Default = {
  render: (args) => `
    <div class="sb-stack">
      <td-tabs
        size="${escapeHtml(String(args.size || 'md'))}"
        activation="${escapeHtml(String(args.activation || 'manual'))}"
        ${args['active-tab'] ? `active-tab="${escapeHtml(String(args['active-tab']))}"` : ''}
      ></td-tabs>
      <p class="sb-note">← → / Home / End di chuyển focus; Enter / Space chọn (activation="auto": mũi tên chọn luôn).</p>
    </div>
  `,
  args: { size: 'md', activation: 'manual' },
  play: async ({ canvasElement }) => {
    const el = canvasElement.querySelector('td-tabs');
    el.tabs = THREE;
    el.onChange = (id) => console.log('Tab:', id);
  },
};

export const WithIcons = {
  render: (args) => `<td-tabs size="${escapeHtml(String(args.size || 'md'))}" aria-label="Nguồn ảnh"></td-tabs>`,
  args: { size: 'md' },
  play: async ({ canvasElement }) => {
    const el = canvasElement.querySelector('td-tabs');
    el.tabs = [
      { id: 'file', label: 'Tải tệp lên', icon: 'upload' },
      { id: 'url', label: 'Từ URL', icon: 'link' },
      { id: 'library', label: 'Thư viện', icon: 'image' },
    ];
  },
};

export const WithPanels = {
  render: () => `
    <div class="sb-stack">
      <td-tabs id="story-tabs" aria-label="Cài đặt"></td-tabs>
      <div id="story-panel-a">Nội dung tài khoản (panel không có phần tử focus được → tabindex="0").</div>
      <div id="story-panel-b"><button type="button">Nút trong panel</button></div>
      <p class="sb-note">tab.panel = id → aria-controls; td-tabs quản lý role="tabpanel", aria-labelledby, hidden.</p>
    </div>
  `,
  play: async ({ canvasElement }) => {
    const el = canvasElement.querySelector('td-tabs');
    el.tabs = [
      { id: 'a', label: 'Tài khoản', panel: 'story-panel-a' },
      { id: 'b', label: 'Thanh toán', panel: 'story-panel-b' },
    ];
  },
};

export const SmallSize = {
  render: () => `<td-tabs size="sm"></td-tabs>`,
  play: async ({ canvasElement }) => {
    canvasElement.querySelector('td-tabs').tabs = THREE;
  },
};

export const TwoTabs = {
  render: () => `<td-tabs size="md"></td-tabs>`,
  play: async ({ canvasElement }) => {
    canvasElement.querySelector('td-tabs').tabs = [
      { id: 'edit', label: 'Sửa' },
      { id: 'preview', label: 'Xem trước' },
    ];
  },
};

/** v0.34.0: a fixed-width frame (CSSOM, no inline style markup) to show the container behaviour. */
const frame = (canvasElement, width) => {
  canvasElement.querySelector('[data-sb-frame]')?.style.setProperty('width', `min(100%, ${width}px)`);
};

export const ManyTabsOverflow = {
  name: 'Many tabs (overflow)',
  render: () => `
    <div data-sb-frame>
      <td-tabs aria-label="Sản phẩm"></td-tabs>
    </div>
    <p class="sb-note">8 thẻ nhãn dài trong khung 360px: không đủ ô bằng nhau → hàng thẻ cuộn ngang (mép mờ, thẻ đang chọn
      luôn cuộn vào tầm nhìn). Nhãn không bao giờ bị cắt. Khung rộng hơn → trở lại ô bằng nhau.</p>
  `,
  play: async ({ canvasElement }) => {
    frame(canvasElement, 360);
    const el = canvasElement.querySelector('td-tabs');
    el.tabs = [
      'Thông tin chung', 'Thuộc tính và biến thể', 'Hình ảnh', 'Giá bán và khuyến mãi',
      'Tồn kho theo chi nhánh', 'Vận chuyển', 'Tối ưu tìm kiếm', 'Lịch sử thay đổi',
    ].map((label, i) => ({ id: `t${i}`, label }));
    el.setAttribute('active-tab', 't5');
  },
};

export const LongLabelAmongShort = {
  name: 'Long label among short',
  render: () => `
    <div data-sb-frame>
      <td-tabs aria-label="Chính sách"></td-tabs>
    </div>
    <p class="sb-note">Tổng bề rộng vừa khung, nhưng ô bằng nhau không chứa nổi nhãn dài nhất → chế độ cuộn
      (thay vì cắt nhãn dài thành "Chính s…").</p>
  `,
  play: async ({ canvasElement }) => {
    frame(canvasElement, 640);
    canvasElement.querySelector('td-tabs').tabs = [
      { id: 'x', label: 'Chính sách bảo hành và đổi trả 30 ngày' },
      ...['A', 'B', 'C', 'D', 'E'].map((label) => ({ id: label, label })),
    ];
  },
};

export const WithCounts = {
  name: 'With counts (0.70.0)',
  render: (args) => `
    <div class="sb-stack">
      <td-tabs size="${escapeHtml(String(args.size || 'md'))}" aria-label="Trạng thái đơn hàng"></td-tabs>
      <p class="sb-note">Mỗi thẻ có thể kèm số đếm có màu (tone như badge). "Tải số đếm" mô phỏng số đến muộn sau khi tải dữ liệu:
        <code>setTabCount(id, count, tone?)</code> cập nhật tại chỗ (focus và thẻ đang chọn giữ nguyên); <code>null</code> xoá viên thuốc.</p>
      <button type="button" class="td-btn td-btn--secondary td-btn--sm" data-sb-load>Tải số đếm</button>
      <button type="button" class="td-btn td-btn--secondary td-btn--sm" data-sb-clear>Xoá số đếm</button>
    </div>
  `,
  args: { size: 'md' },
  play: async ({ canvasElement }) => {
    const el = canvasElement.querySelector('td-tabs');
    el.tabs = [
      { id: 'todo', label: 'Cần xử lý' }, { id: 'new', label: 'Mới' }, { id: 'confirmed', label: 'Đã xác nhận' },
      { id: 'shipping', label: 'Đang giao' }, { id: 'done', label: 'Hoàn tất' }, { id: 'cancelled', label: 'Đã hủy' }, { id: 'all', label: 'Tất cả' },
    ];
    const tones = { todo: 'danger', new: 'info', confirmed: 'info', shipping: 'warning', done: 'success', cancelled: 'neutral', all: 'neutral' };
    const counts = { todo: 4, new: 12, confirmed: 7, shipping: 3, done: 1284, cancelled: 0, all: 1310 };
    canvasElement.querySelector('[data-sb-load]').addEventListener('click', () => {
      for (const [id, n] of Object.entries(counts)) el.setTabCount(id, n, tones[id]);
    });
    canvasElement.querySelector('[data-sb-clear]').addEventListener('click', () => {
      for (const id of Object.keys(counts)) el.setTabCount(id, null);
    });
  },
};

export const PageNavigation = {
  name: 'Điều hướng trang (0.83.0)',
  render: (args) => `
    <div class="sb-stack">
      <td-tabs size="${escapeHtml(String(args.size || 'md'))}" aria-label="Cài đặt hệ thống" data-sb-paths>
        <a href="/system/settings/telegram" data-tab-id="telegram">Telegram</a>
        <a href="/system/settings/sepay" data-tab-id="sepay" aria-current="page" data-count="2" data-tone="warning">SePay</a>
        <a href="/system/settings/ghtk" data-tab-id="ghtk">GHTK</a>
      </td-tabs>
      <p class="sb-note">Link theo đường dẫn: <code>&lt;a&gt;</code> con do server in sẵn (Blade / PHP) được nâng cấp thành
        <code>&lt;nav&gt;</code> + <code>aria-current="page"</code>. Ở đây <code>tab-click</code> bị huỷ (mô phỏng SPA, Storybook
        không rời trang) rồi <code>setActiveTab(id)</code>; Ctrl / ⌘ / Shift-click và chuột giữa vẫn là link thật.</p>
      <td-tabs size="${escapeHtml(String(args.size || 'md'))}" aria-label="Các mục của biểu mẫu" match-hash data-sb-hash></td-tabs>
      <p class="sb-note">Link <code>#section</code> + <code>match-hash</code>: thẻ hiện tại theo <code>location.hash</code>
        (đổi qua <code>hashchange</code>, không cần JS của site).</p>
    </div>
  `,
  args: { size: 'md' },
  play: async ({ canvasElement }) => {
    const paths = canvasElement.querySelector('[data-sb-paths]');
    paths.addEventListener('tab-click', (e) => {
      const click = e.detail.event;
      if (click.button !== 0 || click.ctrlKey || click.metaKey || click.shiftKey || click.altKey) return;
      e.preventDefault();
      paths.setActiveTab(e.detail.tabId);
    });
    const hash = canvasElement.querySelector('[data-sb-hash]');
    hash.tabs = [
      { id: 'info', label: 'Thông tin chung', href: '#info' },
      { id: 'media', label: 'Hình ảnh', href: '#media', icon: 'image' },
      { id: 'seo', label: 'SEO', href: '#seo' },
    ];
  },
};
