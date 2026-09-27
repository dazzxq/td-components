import { escapeHtml } from '../utils/escape.js';
import './td-table.js';
import '../styles/story-layout.css';

// Attribute helper: story control values are escaped before they enter the HTML string.
const attr = (name, v) => (v === undefined || v === null || v === '' || v === false ? '' : v === true ? ` ${name}` : ` ${name}="${escapeHtml(String(v))}"`);

const ROLES = ['Quản trị', 'Biên tập', 'Xem'];
const sampleData = Array.from({ length: 47 }, (_, i) => ({
  id: i + 1,
  name: `Người dùng ${i + 1}`,
  email: `user${i + 1}@example.com`,
  role: ROLES[i % 3],
  active: i % 4 !== 0,
}));

/** Status cell as a Node (preferred over an HTML string — row data never enters markup). */
const statusCell = (row) => {
  const span = document.createElement('span');
  span.textContent = row.active ? 'Hoạt động' : 'Ngừng';
  return span;
};

const sampleColumns = [
  { key: 'id', label: 'ID', sortable: true, width: '80px', widthType: 'fixed' },
  { key: 'name', label: 'Tên', sortable: true },
  { key: 'email', label: 'Email', sortable: true },
  { key: 'role', label: 'Vai trò' },
  { key: 'active', label: 'Trạng thái', render: statusCell },
];

export default {
  title: 'Display/Table',
  tags: ['autodocs'],
  argTypes: {
    'per-page': { control: 'number' },
    'active-color': { control: 'color' },
    zebra: { control: 'select', options: ['', 'false'] },
    loading: { control: 'boolean' },
    title: { control: 'text' },
    'heading-level': { control: 'select', options: [2, 3, 4, 5, 6] },
    'empty-title': { control: 'text' },
    'empty-text': { control: 'text' },
    'max-height': { control: 'text' },
  },
};

export const Default = {
  render: (args) => `<td-table${attr('per-page', args['per-page'])}${attr('active-color', args['active-color'])}`
    + `${attr('zebra', args.zebra)}${attr('loading', args.loading)}${attr('title', args.title)}`
    + `${attr('heading-level', args['heading-level'])}${attr('empty-title', args['empty-title'])}`
    + `${attr('empty-text', args['empty-text'])}${attr('max-height', args['max-height'])}></td-table>`,
  args: { 'per-page': 10, title: 'Danh sách người dùng' },
  play: async ({ canvasElement }) => {
    const el = canvasElement.querySelector('td-table');
    el.columns = sampleColumns;
    el.data = sampleData;
  },
};

export const NoTitle = {
  render: () => `<div class="sb-stack">
      <td-table aria-label="Người dùng"></td-table>
      <p class="sb-note">Không có title → bảng được đặt tên bằng aria-label của host (mặc định "Bảng dữ liệu").</p>
    </div>`,
  play: async ({ canvasElement }) => {
    const el = canvasElement.querySelector('td-table');
    el.columns = sampleColumns;
    el.data = sampleData.slice(0, 8);
  },
};

export const Loading = {
  render: () => '<td-table title="Danh sách người dùng" loading loading-rows="5"></td-table>',
  play: async ({ canvasElement }) => {
    canvasElement.querySelector('td-table').columns = sampleColumns;
  },
};

export const Empty = {
  render: () => '<td-table title="Đơn hàng" empty-title="Chưa có đơn hàng" empty-text="Đơn hàng mới sẽ xuất hiện ở đây."></td-table>',
  play: async ({ canvasElement }) => {
    const el = canvasElement.querySelector('td-table');
    el.columns = sampleColumns;
    el.data = [];
  },
};

export const NoZebra = {
  render: () => '<td-table title="Không kẻ sọc" zebra="false"></td-table>',
  play: async ({ canvasElement }) => {
    const el = canvasElement.querySelector('td-table');
    el.columns = sampleColumns;
    el.data = sampleData;
  },
};

export const StickyHeader = {
  render: () => `<div class="sb-stack">
      <td-table title="Tiêu đề cố định" max-height="320px" per-page="30"></td-table>
      <p class="sb-note">max-height → bảng cuộn bên trong, hàng tiêu đề dính trên cùng (nền đặc).</p>
    </div>`,
  play: async ({ canvasElement }) => {
    const el = canvasElement.querySelector('td-table');
    el.columns = sampleColumns;
    el.data = sampleData;
  },
};

export const EllipsisAndWidths = {
  render: () => `<div class="sb-stack">
      <td-table title="Cắt chữ dài"></td-table>
      <p class="sb-note">Cột có width hoặc ellipsis → table-layout: fixed; ô ellipsis giữ một dòng, nội dung đầy đủ trong title.</p>
    </div>`,
  play: async ({ canvasElement }) => {
    const el = canvasElement.querySelector('td-table');
    el.columns = [
      { key: 'id', label: 'ID', width: '64px', widthType: 'fixed', align: 'right' },
      { key: 'name', label: 'Tên', width: '160px', widthType: 'fixed' },
      { key: 'note', label: 'Ghi chú', ellipsis: true },
    ];
    el.data = sampleData.slice(0, 6).map((r) => ({ ...r, note: `Ghi chú rất dài cho ${r.name}: `.repeat(6) }));
  },
};

export const CellPadding = {
  render: () => `<div class="sb-stack">
      <td-table title="Ô gọn (px-2)"></td-table>
      <p class="sb-note">cellPaddingClass nhận px-0 … px-6 → td-table__cell--px-{n} (không cần Tailwind).</p>
    </div>`,
  play: async ({ canvasElement }) => {
    const el = canvasElement.querySelector('td-table');
    el.cellPaddingClass = 'px-2';
    el.columns = sampleColumns;
    el.data = sampleData.slice(0, 8);
  },
};

export const CustomColor = {
  render: () => '<td-table title="Màu trang hiện tại" active-color="#0f766e"></td-table>',
  play: async ({ canvasElement }) => {
    const el = canvasElement.querySelector('td-table');
    el.columns = sampleColumns;
    el.data = sampleData;
  },
};

export const CustomRender = {
  render: () => `<div class="sb-stack">
      <td-table title="Ô tuỳ biến"></td-table>
      <p class="sb-note">render(row, rowIdxInPage) trả về Node (khuyến nghị). Chuỗi HTML là cửa sau tin cậy — không chèn dữ liệu hàng vào chuỗi.</p>
    </div>`,
  play: async ({ canvasElement }) => {
    const el = canvasElement.querySelector('td-table');
    el.columns = [
      { key: 'id', label: 'ID', sortable: true, width: '64px', widthType: 'fixed' },
      { key: 'name', label: 'Tên', sortable: true },
      { key: 'active', label: 'Trạng thái', render: statusCell },
      {
        key: 'actions',
        label: 'Thao tác',
        align: 'right',
        render: (row) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'td-btn td-btn--secondary td-btn--sm';
          btn.textContent = 'Chi tiết';
          btn.setAttribute('aria-label', `Chi tiết ${row.name}`);
          return btn;
        },
      },
    ];
    el.data = sampleData.slice(0, 15);
  },
};

export const ServerMode = {
  render: () => `<div class="sb-stack">
      <td-table title="Chế độ server" server-mode total-items="47" per-page="10"></td-table>
      <p class="sb-note">onPageChange(page) → setLoading(true) → tải trang → data = rows (trang được giữ) → setLoading(false). total-items là bắt buộc.</p>
    </div>`,
  play: async ({ canvasElement }) => {
    const el = canvasElement.querySelector('td-table');
    el.columns = sampleColumns;
    const load = (page) => {
      el.setLoading(true);
      setTimeout(() => {
        el.data = sampleData.slice((page - 1) * 10, page * 10);
        el.setLoading(false);
      }, 600);
    };
    el.onPageChange = load;
    el.addEventListener('sort-change', (e) => console.log('sort-change', e.detail));
    load(1);
  },
};
