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
