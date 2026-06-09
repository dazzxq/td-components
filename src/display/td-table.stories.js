import './td-table.js';

const sampleColumns = [
  { key: 'id', label: 'ID', sortable: true, width: '80px', widthType: 'fixed' },
  { key: 'name', label: 'Tên', sortable: true },
  { key: 'email', label: 'Email', sortable: true },
  { key: 'role', label: 'Vai trò' },
  { key: 'status', label: 'Trạng thái', render: (row) => `<span class="px-2 py-1 rounded-full text-xs font-medium ${row.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}">${row.status}</span>` },
];

const sampleData = Array.from({ length: 47 }, (_, i) => ({
  id: i + 1,
  name: `Người dùng ${i + 1}`,
  email: `user${i + 1}@example.com`,
  role: i % 3 === 0 ? 'Admin' : i % 3 === 1 ? 'Editor' : 'Viewer',
  status: i % 4 === 0 ? 'inactive' : 'active',
}));

export default {
  title: 'Display/Table',
  tags: ['autodocs'],
  argTypes: {
    'per-page': { control: 'number' },
    'active-color': { control: 'color' },
    zebra: { control: 'boolean' },
    loading: { control: 'boolean' },
    title: { control: 'text' },
    'empty-text': { control: 'text' },
  },
};

export const Default = {
  render: () => `<td-table zebra></td-table>`,
  play: async ({ canvasElement }) => {
    const el = canvasElement.querySelector('td-table');
    el.columns = sampleColumns;
    el.data = sampleData;
  },
};

export const Loading = {
  render: () => `<td-table loading loading-rows="5" zebra></td-table>`,
  play: async ({ canvasElement }) => {
    const el = canvasElement.querySelector('td-table');
    el.columns = sampleColumns;
  },
};

export const Empty = {
  render: () => `<td-table zebra empty-text="Không có dữ liệu để hiển thị"></td-table>`,
  play: async ({ canvasElement }) => {
    const el = canvasElement.querySelector('td-table');
    el.columns = sampleColumns;
    el.data = [];
  },
};

export const WithTitle = {
  render: () => `<td-table zebra title="Danh sách người dùng"></td-table>`,
  play: async ({ canvasElement }) => {
    const el = canvasElement.querySelector('td-table');
    el.columns = sampleColumns;
    el.data = sampleData;
  },
};

export const CustomColor = {
  render: () => `<td-table zebra active-color="#3b82f6"></td-table>`,
  play: async ({ canvasElement }) => {
    const el = canvasElement.querySelector('td-table');
    el.columns = sampleColumns;
    el.data = sampleData;
  },
};

export const CustomRender = {
  render: () => `<td-table zebra title="Custom Render Demo"></td-table>`,
  play: async ({ canvasElement }) => {
    const el = canvasElement.querySelector('td-table');
    el.columns = [
      { key: 'id', label: 'ID', sortable: true, width: '60px', widthType: 'fixed' },
      { key: 'name', label: 'Tên', sortable: true },
      { key: 'status', label: 'Trạng thái', render: (row) => `<span class="px-2 py-1 rounded-full text-xs font-medium ${row.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">${row.status === 'active' ? 'Hoạt động' : 'Ngừng'}</span>` },
      { key: 'actions', label: 'Thao tác', align: 'right', render: (row) => `<button class="px-3 py-1 text-xs rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors">Chi tiết</button>` },
    ];
    el.data = sampleData.slice(0, 15);
  },
};
