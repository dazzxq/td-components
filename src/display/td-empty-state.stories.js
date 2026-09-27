import { escapeHtml } from '../utils/escape.js';
import './td-empty-state.js';
import '../styles/story-layout.css';

export default {
  title: 'Display/EmptyState',
  tags: ['autodocs'],
  argTypes: {
    title: { control: 'text' },
    message: { control: 'text' },
    size: { control: 'select', options: ['sm', 'md', 'lg'] },
    compact: { control: 'boolean' },
    icon: { control: 'text' },
    'heading-level': { control: 'select', options: [2, 3, 4, 5, 6] },
  },
};

export const Default = {
  render: (args) => `
    <td-empty-state
      title="${escapeHtml(String(args.title || 'Không có dữ liệu'))}"
      message="${escapeHtml(String(args.message || 'Chưa có mục nào được tạo.'))}"
      size="${escapeHtml(String(args.size || 'md'))}"
      ${args.icon ? `icon="${escapeHtml(String(args.icon))}"` : ''}
      ${args['heading-level'] ? `heading-level="${escapeHtml(String(args['heading-level']))}"` : ''}
      ${args.compact ? 'compact' : ''}
    ></td-empty-state>
  `,
  args: {
    title: 'Không có dữ liệu',
    message: 'Chưa có mục nào được tạo.',
    size: 'md',
    compact: false,
  },
};

export const AllSizes = {
  render: () => `
    <div class="sb-stack">
      <p class="sb-note">Small</p>
      <td-empty-state size="sm" title="Không có dữ liệu" message="Size sm"></td-empty-state>
      <p class="sb-note">Medium (default)</p>
      <td-empty-state size="md" title="Không có dữ liệu" message="Size md"></td-empty-state>
      <p class="sb-note">Large</p>
      <td-empty-state size="lg" title="Không có dữ liệu" message="Size lg"></td-empty-state>
    </div>
  `,
};

export const RegistryIcon = {
  render: () => `
    <td-empty-state icon="search" heading-level="2" title="Không có kết quả" message="Thử từ khoá khác."></td-empty-state>
    <p class="sb-note">icon = tên trong registry (unknown → inbox + console.warn). SVG tuỳ biến: property <code>iconNode</code>.</p>
  `,
};

export const WithActions = {
  render: () => `
    <td-empty-state
      title="Chưa có bài viết"
      message="Bạn chưa tạo bài viết nào. Bắt đầu tạo bài viết đầu tiên."
    ></td-empty-state>
  `,
  play: ({ canvasElement }) => {
    const el = canvasElement.querySelector('td-empty-state');
    if (el) {
      el.actions = [
        { label: 'Tạo mới', variant: 'primary', onClick: () => console.log('Create clicked') },
        { label: 'Nhập từ file', variant: 'secondary', onClick: () => console.log('Import clicked') },
        { label: 'Xoá bộ lọc', variant: 'danger', onClick: () => console.log('Clear clicked') },
      ];
    }
  },
};

export const Compact = {
  render: () => `
    <div class="sb-stack">
      <td-empty-state
        compact
        title="Không có kết quả"
        message="Thử thay đổi bộ lọc."
        size="sm"
      ></td-empty-state>
    </div>
  `,
};
