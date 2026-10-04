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
    layout: { control: 'select', options: ['', 'auto', 'table', 'cards'] },
    'card-below': { control: 'select', options: ['', 'sm', 'md', 'lg'] },
  },
};

export const Default = {
  render: (args) => `<td-table${attr('per-page', args['per-page'])}${attr('active-color', args['active-color'])}`
    + `${attr('zebra', args.zebra)}${attr('loading', args.loading)}${attr('title', args.title)}`
    + `${attr('heading-level', args['heading-level'])}${attr('empty-title', args['empty-title'])}`
    + `${attr('empty-text', args['empty-text'])}${attr('max-height', args['max-height'])}`
    + `${attr('layout', args.layout)}${attr('card-below', args['card-below'])}></td-table>`,
  args: { 'per-page': 10, title: 'Danh sách người dùng' },
  play: async ({ canvasElement }) => {
    const el = canvasElement.querySelector('td-table');
    el.columns = sampleColumns;
    el.data = sampleData;
  },
};

export const NoTitle = {
  render: () => `<div>
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
  render: () => `<div>
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
  render: () => `<div>
      <td-table title="Cắt chữ dài"></td-table>
      <p class="sb-note">Từ 0.34.0: ellipsis cắt nội dung ở maxWidth / --td-table-ellipsis-max (18rem), bảng giữ table-layout auto (fixed chỉ khi mọi cột widthType: 'fixed'). Nội dung đầy đủ trong title.</p>
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
  render: () => `<div>
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
  render: () => `<div>
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
  render: () => `<div>
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

// --- v0.34.0 responsive: card mode (pure CSS, container query on the host) ---

const ORDER_STATUS = ['Chờ xác nhận', 'Đang giao', 'Đã giao'];
const orders = Array.from({ length: 24 }, (_, i) => ({
  code: `DH${10240 + i}`,
  customer: ['Nguyễn Văn An', 'Trần Thị Bích Ngọc', 'Lê Hoàng'][i % 3],
  phone: `0912 345 6${10 + i}`,
  product: 'iPhone 16 Pro Max 256GB Titan Sa Mạc',
  total: `${(32990000 + i * 1000).toLocaleString('vi-VN')} ₫`,
  status: ORDER_STATUS[i % 3],
  created: `0${1 + (i % 9)}/10/2026`,
}));

/** Order columns with card roles + row actions (3 actions → "Thao tác" menu on a card, inline in a table). */
const orderColumns = () => [
  { key: 'code', label: 'Mã đơn', sortable: true },
  { key: 'customer', label: 'Khách hàng', sortable: true },
  { key: 'phone', label: 'Số điện thoại' },
  { key: 'product', label: 'Sản phẩm', ellipsis: true, maxWidth: '220px' },
  { key: 'total', label: 'Tổng tiền', align: 'right', sortable: true },
  { key: 'status', label: 'Trạng thái', card: 'meta' },
  { key: 'created', label: 'Ngày tạo', card: 'meta' },
  {
    key: 'act',
    label: 'Thao tác',
    actions: [
      { id: 'edit', label: 'Sửa', icon: 'pencil' },
      { id: 'print', label: 'In hoá đơn' },
      { id: 'delete', label: 'Xoá', variant: 'danger', disabled: (row) => row.status === 'Đã giao' },
    ],
  },
];

const fillOrders = (canvasElement, { width } = {}) => {
  const el = canvasElement.querySelector('td-table');
  // the frame width is set with CSSOM (CSP strict: no style attribute in markup)
  if (width) el.parentElement.style.inlineSize = width;
  el.columns = orderColumns();
  el.data = orders;
  el.addEventListener('row-action', (e) => console.log('row-action', e.detail.id, e.detail.row.code, e.detail.rowIndex));
};

export const Card = {
  render: () => `<div>
      <td-table title="Đơn hàng (luôn dạng card)" layout="cards" per-page="5"></td-table>
      <p class="sb-note">layout="cards": mỗi hàng là một card — cột đầu (primary) đậm, các cột còn lại "nhãn: giá trị", cột card: 'meta' gộp một dòng " · ", cột actions ở chân card (> 2 thao tác → nút "Thao tác" mở menu). Thanh sắp xếp thay cho hàng tiêu đề.</p>
    </div>`,
  play: async ({ canvasElement }) => fillOrders(canvasElement),
};

export const AutoNarrow = {
  name: 'Auto (khung 360px)',
  render: () => `<div>
      <div class="sb-table-frame"><td-table title="Đơn hàng" per-page="5"></td-table></div>
      <p class="sb-note">layout mặc định (auto): host là container — khung 360px &lt; 720 (card-below="md") → card. Kéo rộng khung hoặc mở story Default để thấy dạng bảng; cùng DOM, không render lại.</p>
    </div>`,
  play: async ({ canvasElement }) => fillOrders(canvasElement, { width: '360px' }),
};

export const ForcedTable = {
  name: 'Forced table (khung 360px)',
  render: () => `<div>
      <div class="sb-table-frame"><td-table title="Đơn hàng (luôn dạng bảng)" layout="table" per-page="5"></td-table></div>
      <p class="sb-note">layout="table": giữ dạng bảng ở mọi độ rộng — cuộn ngang bên trong (vùng cuộn focus được, bóng mép báo còn nội dung), số tiền căn phải không xuống dòng.</p>
    </div>`,
  play: async ({ canvasElement }) => fillOrders(canvasElement, { width: '360px' }),
};
