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
      title="${args.title || 'Khong co du lieu'}"
      message="${args.message || 'Chua co muc nao duoc tao.'}"
      size="${args.size || 'md'}"
      ${args.compact ? 'compact' : ''}
    ></td-empty-state>
  `,
  args: {
    title: 'Khong co du lieu',
    message: 'Chua co muc nao duoc tao.',
    size: 'md',
    compact: false,
  },
};

export const AllSizes = {
  render: () => `
    <div class="flex flex-col gap-6">
      <div>
        <p class="text-sm text-gray-500 mb-2">Small</p>
        <td-empty-state size="sm" title="Khong co du lieu" message="Size sm"></td-empty-state>
      </div>
      <div>
        <p class="text-sm text-gray-500 mb-2">Medium (default)</p>
        <td-empty-state size="md" title="Khong co du lieu" message="Size md"></td-empty-state>
      </div>
      <div>
        <p class="text-sm text-gray-500 mb-2">Large</p>
        <td-empty-state size="lg" title="Khong co du lieu" message="Size lg"></td-empty-state>
      </div>
    </div>
  `,
};

export const WithActions = {
  render: () => `
    <td-empty-state
      title="Chua co bai viet"
      message="Ban chua tao bai viet nao. Bat dau tao bai viet dau tien."
    ></td-empty-state>
  `,
  play: ({ canvasElement }) => {
    const el = canvasElement.querySelector('td-empty-state');
    if (el) {
      el.actions = [
        { label: 'Tao moi', variant: 'primary', onClick: () => console.log('Create clicked') },
        { label: 'Nhap tu file', variant: 'secondary', onClick: () => console.log('Import clicked') },
      ];
    }
  },
};

export const Compact = {
  render: () => `
    <div style="max-width: 400px;">
      <td-empty-state
        compact
        title="Khong co ket qua"
        message="Thu thay doi bo loc."
        size="sm"
      ></td-empty-state>
    </div>
  `,
};
