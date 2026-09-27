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
