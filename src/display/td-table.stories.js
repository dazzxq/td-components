import { escapeHtml } from '../utils/escape.js';
import './td-table.js';
import '../form/td-toggle.js';
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

// --- v0.36.1 card density: `lead` role, content-sized pairs, meta + icon actions on one line, one-row sort bar ---

const posts = [
  ['Hướng dẫn Web Components', 'Duyệt', 1250], ['Tailwind CSS Tips & Tricks', 'Duyệt', 890],
  ['JavaScript ES2025 Features', 'Minh', 0], ['Laravel 12 Migration Guide', 'Hùng', 2100],
  ['Storybook for Web Components', 'Linh', 0], ['Git Workflow cho team nhỏ', 'Duyệt', 1580],
].map(([title, author, views], i) => ({ id: i + 1, title, author, views, date: `0${i + 1}/10/2026` }));

export const CompactCards = {
  name: 'Card gọn (khung 360px)',
  render: () => `<div>
      <div class="sb-table-frame"><td-table title="Bài viết" per-page="5"></td-table></div>
      <p class="sb-note">0.36.1: cột ID đầu không khai báo card, cột Tiêu đề card: 'primary' → ID thành lead (nhỏ, nhạt, trước tiêu đề). Cặp nhãn: giá trị xếp theo độ dài; ngày (meta) và thao tác chung một dòng; action có icon chỉ hiện icon ở card (tên đọc giữ "Sửa" / "Xoá"); thanh sắp xếp một hàng, cuộn ngang.</p>
    </div>`,
  play: async ({ canvasElement }) => {
    const el = canvasElement.querySelector('td-table');
    el.parentElement.style.inlineSize = '360px';
    el.columns = [
      { key: 'id', label: 'ID', sortable: true },
      { key: 'title', label: 'Tiêu đề', sortable: true, card: 'primary' },
      { key: 'author', label: 'Tác giả', sortable: true },
      { key: 'views', label: 'Lượt xem', align: 'right', sortable: true },
      { key: 'date', label: 'Ngày', card: 'meta', sortable: true },
      { key: 'act', label: 'Thao tác', actions: [{ id: 'edit', label: 'Sửa', icon: 'pencil' }, { id: 'del', label: 'Xoá', icon: 'trash', variant: 'danger' }] },
    ];
    el.data = posts;
  },
};

// --- v0.37.0 row selection (selectable + rowKey; plan v0.37.0-table-row-selection, ADR 0018) ---

const fillPosts = (canvasElement, mode, width) => {
  const el = canvasElement.querySelector('td-table');
  if (width) el.parentElement.style.inlineSize = width;
  el.rowSelectable = (r) => r.id !== 4; // one locked row
  el.columns = [
    { key: 'id', label: 'ID', sortable: true },
    { key: 'title', label: 'Tiêu đề', sortable: true, card: 'primary' },
    { key: 'author', label: 'Tác giả', sortable: true },
    { key: 'views', label: 'Lượt xem', align: 'right' },
  ];
  el.data = posts;
  el.selectedKeys = mode === 'single' ? [2] : [2, 3];
  const out = canvasElement.querySelector('.sb-note output');
  el.addEventListener('select-change', (e) => { out.textContent = `select-change: keys [${e.detail.keys.join(', ')}], trigger ${e.detail.trigger}`; });
};

export const Selection = {
  name: 'Chọn dòng (nhiều)',
  render: () => `<div>
      <td-table title="Bài viết" selectable row-key="id" per-page="5" max-selected="4"></td-table>
      <p class="sb-note">selectable + row-key="id": ô đầu header chọn cả trang (ba trạng thái), Shift+click / Shift+Space chọn dải theo thứ tự đang hiện, dòng 4 bị khoá (rowSelectable), tối đa 4 dòng (max-selected). Lựa chọn giữ qua trang / sort. <output></output></p>
    </div>`,
  play: async ({ canvasElement }) => fillPosts(canvasElement, 'multiple'),
};

export const SelectionSingle = {
  name: 'Chọn dòng (một)',
  render: () => `<div>
      <td-table title="Chọn một bài" selectable="single" row-key="id" per-page="5"></td-table>
      <p class="sb-note">selectable="single": checkbox độc quyền — chọn dòng khác tự bỏ dòng cũ (một select-change có cả added lẫn removed), bấm lại dòng đang chọn = bỏ chọn. Không có ô chọn cả trang. <output></output></p>
    </div>`,
  play: async ({ canvasElement }) => fillPosts(canvasElement, 'single'),
};

export const SelectionCards = {
  name: 'Chọn dòng (card, khung 360px)',
  render: () => `<div>
      <div class="sb-table-frame"><td-table title="Bài viết" selectable row-key="id" per-page="5"></td-table></div>
      <p class="sb-note">Card: ô chọn đứng đầu dòng [chọn][lead][tiêu đề]; "Chọn tất cả trên trang" là chip đầu của thanh sắp xếp; card đã chọn viền accent. <output></output></p>
    </div>`,
  play: async ({ canvasElement }) => fillPosts(canvasElement, 'multiple', '360px'),
};

// --- v0.57.0 tree table (plan v0.57.0-tree-table) ---

const CATEGORIES = () => [
  { id: 1, name: 'Thời trang', slug: 'thoi-trang', products: 128, active: true, children: [
    { id: 2, name: 'Áo', slug: 'ao', products: 64, active: true, children: [
      { id: 3, name: 'Áo thun', slug: 'ao-thun', products: 40, active: true },
      { id: 4, name: 'Áo khoác', slug: 'ao-khoac', products: 24, active: false },
    ] },
    { id: 5, name: 'Quần', slug: 'quan', products: 64, active: true, children: [{ id: 6, name: 'Jeans', slug: 'jeans', products: 30, active: true }] },
  ] },
  { id: 7, name: 'Điện tử', slug: 'dien-tu', products: 52, active: true, children: [
    { id: 8, name: 'Điện thoại', slug: 'dien-thoai', products: 31, active: true },
    { id: 9, name: 'Laptop', slug: 'laptop', products: 21, active: false },
  ] },
  { id: 10, name: 'Phụ kiện', slug: 'phu-kien', products: 0, active: false },
];

const treeLog = (canvasElement, el) => {
  const out = canvasElement.querySelector('.sb-note output');
  for (const name of ['expanded-change', 'row-action', 'select-change', 'load-error']) {
    el.addEventListener(name, (e) => {
      const d = e.detail;
      out.textContent = `${name}: ${name === 'select-change' ? `[${d.keys.join(', ')}]` : `key ${d.key ?? d.row?.id}${'expanded' in d ? ` → ${d.expanded}` : ''}${d.id ? ` (${d.id})` : ''}`}`;
    });
  }
};

export const Tree = {
  name: 'Bảng cây (dữ liệu lồng)',
  render: () => `<div>
      <td-table title="Danh mục" tree row-key="id" selectable></td-table>
      <p class="sb-note">tree + row-key: mảng con ở <code>children</code>. Tab vào bảng (một điểm Tab), ↓ ↑ Home End, → mở / tới con đầu, ← đóng / về cha, * mở anh em, Space chọn; Tab từ một dòng đi qua control của dòng đó. Sort trong từng nhóm anh em, phân trang theo gốc. <output></output></p>
    </div>`,
  play: async ({ canvasElement }) => {
    const el = canvasElement.querySelector('td-table');
    treeLog(canvasElement, el);
    el.columns = [
      { key: 'name', label: 'Tên', sortable: true },
      { key: 'slug', label: 'Đường dẫn' },
      { key: 'products', label: 'Sản phẩm', align: 'right', sortable: true },
    ];
    el.data = CATEGORIES();
    el.expandedKeys = [1];
  },
};

export const TreeFlat = {
  name: 'Bảng cây (dữ liệu phẳng parent-key)',
  render: () => `<div>
      <td-table title="Phòng ban" tree row-key="id" parent-key="parentId" tree-column="name"></td-table>
      <p class="sb-note">parent-key="parentId": data là danh sách phẳng, cha = dòng có khoá đó (null / '' = gốc; mồ côi / vòng lặp → gốc + cảnh báo). tree-column chọn cột thụt lề. <output></output></p>
    </div>`,
  play: async ({ canvasElement }) => {
    const el = canvasElement.querySelector('td-table');
    treeLog(canvasElement, el);
    el.columns = [{ key: 'code', label: 'Mã' }, { key: 'name', label: 'Phòng ban', card: 'primary' }, { key: 'head', label: 'Trưởng phòng' }];
    el.data = [
      { id: 'BGD', code: 'BGD', name: 'Ban giám đốc', head: 'An', parentId: null },
      { id: 'KD', code: 'KD', name: 'Kinh doanh', head: 'Bình', parentId: 'BGD' },
      { id: 'KT', code: 'KT', name: 'Kỹ thuật', head: 'Chi', parentId: 'BGD' },
      { id: 'KD1', code: 'KD1', name: 'Kinh doanh miền Bắc', head: 'Dũng', parentId: 'KD' },
      { id: 'KD2', code: 'KD2', name: 'Kinh doanh miền Nam', head: 'Em', parentId: 'KD' },
      { id: 'FE', code: 'FE', name: 'Frontend', head: 'Giang', parentId: 'KT' },
    ];
    el.expandAll();
  },
};

export const TreeLazy = {
  name: 'Bảng cây (tải con chậm)',
  render: () => `<div>
      <td-table title="Thư mục" tree row-key="id"></td-table>
      <p class="sb-note">hasChildren: true + loadChildren(row, { signal }): "Đang tải…" chỉ hiện sau 400 ms; "Lỗi mạng" luôn lỗi → dòng "Không tải được" + Thử lại (↓ tới dòng lỗi, Tab tới nút); "Rỗng" trả [] → thành lá. <output></output></p>
    </div>`,
  play: async ({ canvasElement }) => {
    const el = canvasElement.querySelector('td-table');
    treeLog(canvasElement, el);
    let n = 100;
    el.loadChildren = (row, { signal }) => new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        if (row.fail) reject(new Error('mạng'));
        else if (row.empty) resolve([]);
        else resolve([1, 2, 3].map((i) => ({ id: ++n, name: `${row.name} / mục ${i}`, size: `${i * 12} KB`, hasChildren: i === 1 })));
      }, row.fast ? 150 : 1200);
      signal.addEventListener('abort', () => { clearTimeout(t); reject(signal.reason); });
    });
    el.columns = [{ key: 'name', label: 'Tên' }, { key: 'size', label: 'Dung lượng', align: 'right' }];
    el.data = [
      { id: 1, name: 'Tài liệu (chậm)', size: '—', hasChildren: true },
      { id: 2, name: 'Ảnh (nhanh)', size: '—', hasChildren: true, fast: true },
      { id: 3, name: 'Lỗi mạng', size: '—', hasChildren: true, fail: true },
      { id: 4, name: 'Rỗng', size: '—', hasChildren: true, empty: true },
    ];
  },
};

export const TreeCategories = {
  name: 'Bảng cây — Danh mục (dsuite: thao tác + toggle trạng thái)',
  render: () => `<div>
      <div class="sb-table-frame"><td-table title="Danh mục sản phẩm" tree row-key="id" selectable max-depth="3"></td-table></div>
      <p class="sb-note">Ca dsuite: cột "Thao tác" + toggle trạng thái mỗi dòng ở mọi cấp, chọn nhiều, sort. "Lên đầu" = moveRow(id, null, 0); "Chuyển vào Điện tử" = moveRow(id, 7, MAX) — bị từ chối (false) khi vượt max-depth="3" hoặc canDrop (không chuyển vào "Phụ kiện" đã ẩn). Bấm toggle không mở / đóng dòng. Thu hẹp khung để thấy card (thụt tối đa 3 cấp). <output></output></p>
    </div>`,
  play: async ({ canvasElement }) => {
    const el = canvasElement.querySelector('td-table');
    treeLog(canvasElement, el);
    const out = canvasElement.querySelector('.sb-note output');
    el.canDrop = ({ parentRow }) => !parentRow || parentRow.active;
    el.columns = [
      { key: 'name', label: 'Tên', sortable: true },
      { key: 'products', label: 'Sản phẩm', align: 'right', sortable: true, card: 'meta' },
      { key: 'active', label: 'Hiển thị', render: (row) => {
        const t = document.createElement('td-toggle');
        t.setAttribute('label', `Hiển thị ${row.name}`);
        t.setAttribute('size', 'sm');
        if (row.active) t.setAttribute('checked', '');
        return t;
      } },
      { key: 'act', label: 'Thao tác', actions: [
        { id: 'edit', label: 'Sửa', icon: 'pencil' },
        { id: 'top', label: 'Lên đầu' },
        { id: 'into', label: 'Chuyển vào Điện tử' },
        { id: 'del', label: 'Xoá', icon: 'trash', variant: 'danger', disabled: (r) => r.products > 0 },
      ] },
    ];
    el.addEventListener('row-action', (e) => {
      const { id, row } = e.detail;
      if (id === 'top') out.textContent = `moveRow(${row.id}, null, 0) → ${el.moveRow(row.id, null, 0)}`;
      if (id === 'into') out.textContent = `moveRow(${row.id}, 7, MAX) → ${el.moveRow(row.id, 7, Number.MAX_SAFE_INTEGER)}`;
    });
    el.data = CATEGORIES();
    el.expandedKeys = [1, 2];
  },
};
