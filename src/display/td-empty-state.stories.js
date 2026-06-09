import './td-empty-state.js';

export default {
  title: 'Display/EmptyState',
  tags: ['autodocs'],
  argTypes: {
    title: { control: 'text' },
    message: { control: 'text' },
    size: { control: 'select', options: ['sm', 'md', 'lg'] },
    compact: { control: 'boolean' },
  },
};

export const Default = {
  render: (args) => `
    <td-empty-state
      title="${args.title || 'Không có dữ liệu'}"
      message="${args.message || 'Chưa có mục nào được tạo.'}"
      size="${args.size || 'md'}"
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
    <div class="flex flex-col gap-6">
      <div>
        <p class="text-sm text-gray-500 mb-2">Small</p>
        <td-empty-state size="sm" title="Không có dữ liệu" message="Size sm"></td-empty-state>
      </div>
      <div>
        <p class="text-sm text-gray-500 mb-2">Medium (default)</p>
        <td-empty-state size="md" title="Không có dữ liệu" message="Size md"></td-empty-state>
      </div>
      <div>
        <p class="text-sm text-gray-500 mb-2">Large</p>
        <td-empty-state size="lg" title="Không có dữ liệu" message="Size lg"></td-empty-state>
      </div>
    </div>
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
      ];
    }
  },
};

export const Compact = {
  render: () => `
    <div style="max-width: 400px;">
      <td-empty-state
        compact
        title="Không có kết quả"
        message="Thử thay đổi bộ lọc."
        size="sm"
      ></td-empty-state>
    </div>
  `,
};
