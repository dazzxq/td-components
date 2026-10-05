import { escapeHtml } from '../utils/escape.js';
import './td-check-matrix.js';
import '../styles/story-layout.css';

// v0.47.0 — <td-check-matrix> (plan docs/internal/plans/v0.47.0-check-matrix.md M7): permissions × roles 40 × 10,
// notifications × 3 channels, locks / n/a / notes, the narrow one-column mode.

const ROLES = ['Chủ cửa hàng', 'Quản lý chi nhánh', 'Bán hàng', 'Kho', 'Kế toán', 'Marketing', 'CSKH', 'Giao hàng', 'Thu ngân', 'Kiểm toán'];
const MODULES = [
  ['catalog', 'Sản phẩm', ['Xem', 'Tạo', 'Sửa', 'Xoá', 'Nhập Excel', 'Xuất Excel', 'Sửa giá', 'Ẩn / hiện', 'Quản lý danh mục', 'Quản lý thương hiệu']],
  ['orders', 'Đơn hàng', ['Xem', 'Tạo', 'Sửa', 'Huỷ', 'Hoàn tiền', 'In phiếu', 'Đổi trạng thái', 'Gán giao hàng', 'Ghi chú nội bộ', 'Xuất báo cáo']],
  ['customers', 'Khách hàng', ['Xem', 'Tạo', 'Sửa', 'Xoá', 'Xem số điện thoại', 'Gộp hồ sơ', 'Gửi tin nhắn', 'Điểm thưởng', 'Nhóm khách', 'Xuất danh sách']],
  ['system', 'Hệ thống', ['Xem nhật ký', 'Cài đặt chung', 'Phương thức thanh toán', 'Vận chuyển', 'Thuế', 'Người dùng', 'Vai trò', 'Khoá IP', 'Sao lưu', 'API']],
];
const permData = () => ({
  columns: ROLES.map((label, i) => ({ key: `role${i}`, label, ...(i === 0 ? { description: 'Toàn quyền', locked: true } : {}) })),
  rows: MODULES.map(([key, label, perms], g) => ({ key, label, collapsed: g === 3,
    rows: perms.map((p, k) => ({ key: `${key}.p${k}`, label: p })) })),
  cells: {
    'orders.p4': { role2: { locked: true, note: 'Bán hàng không được hoàn tiền (chính sách công ty)' } },
    'system.p6': { role1: { locked: true, note: 'Không tự sửa vai trò của mình' } },
    'catalog.p6': { role3: { na: true, note: 'Kho không quản lý giá' } },
  },
  value: {
    role0: MODULES.flatMap(([key, , perms]) => perms.map((_, k) => `${key}.p${k}`)),
    role1: ['catalog.p0', 'catalog.p1', 'catalog.p2', 'orders.p0', 'orders.p1', 'orders.p2', 'orders.p4', 'customers.p0'],
    role2: ['catalog.p0', 'orders.p0', 'orders.p1', 'customers.p0', 'customers.p1'],
    role3: ['catalog.p0', 'orders.p0', 'orders.p7'],
  },
});

const esc = (v) => escapeHtml(String(v ?? ''));
let seq = 0;
/** Data is JS: set it once the story markup is in the DOM. */
function withProps(id, fn) {
  setTimeout(() => {
    const el = document.getElementById(id);
    if (el) fn(el);
  }, 0);
}
/** Show the latest change under the grid. */
function logEvents(el, out) {
  el.addEventListener('change', (e) => {
    if (!(e instanceof CustomEvent)) return;
    out.textContent = `change (${e.detail.trigger}): +${e.detail.added.length} −${e.detail.removed.length} · đã đổi ${el.changedCount} ô`;
  });
  el.addEventListener('expanded-change', (e) => { out.textContent = `expanded-change: ${JSON.stringify(e.detail)}`; });
}

export default {
  title: 'Form/Check matrix',
  tags: ['autodocs'],
  argTypes: {
    label: { control: 'text' },
    layout: { control: 'select', options: ['auto', 'grid', 'column'] },
    disabled: { control: 'boolean' },
  },
};

/** Permissions × roles (40 × 10): groups (one collapsed), a locked column, locked / n/a cells with notes, bulk ticks. */
export const PermissionsByRole = {
  render: (args) => {
    const id = `cm-${++seq}`;
    withProps(id, (el) => {
      el.setData(permData());
      logEvents(el, document.getElementById(`${id}-out`));
    });
    return `<form class="sb-stack"><td-check-matrix id="${id}" name="perms" label="${esc(args.label)}" layout="${esc(args.layout)}"`
      + `${args.disabled ? ' disabled' : ''}></td-check-matrix><p class="sb-note" id="${id}-out">Sự kiện: —</p></form>`;
  },
  args: { label: 'Quyền theo vai trò', layout: 'auto', disabled: false },
};

/** Notifications × 3 channels: few columns → `layout="grid"` keeps the full grid even on a phone. */
export const NotificationChannels = {
  render: (args) => {
    const id = `cm-${++seq}`;
    withProps(id, (el) => {
      el.setData({
        columns: [{ key: 'email', label: 'Email' }, { key: 'sms', label: 'SMS' }, { key: 'app', label: 'Ứng dụng' }],
        rows: [
          { key: 'order.new', label: 'Đơn hàng mới' }, { key: 'order.paid', label: 'Đã thanh toán' },
          { key: 'order.cancel', label: 'Đơn bị huỷ', description: 'Gửi cho người phụ trách đơn' },
          { key: 'stock.low', label: 'Sắp hết hàng' }, { key: 'security', label: 'Đăng nhập lạ', locked: true },
        ],
        cells: { 'stock.low': { sms: { na: true, note: 'Chưa hỗ trợ SMS cho kho' } } },
        value: { email: ['order.new', 'order.cancel', 'security'], app: ['order.new', 'order.paid', 'stock.low', 'security'] },
      });
      logEvents(el, document.getElementById(`${id}-out`));
    });
    return `<form class="sb-stack"><td-check-matrix id="${id}" name="notify" label="${esc(args.label)}" layout="grid" max-height="none"`
      + `${args.disabled ? ' disabled' : ''}></td-check-matrix><p class="sb-note" id="${id}-out">Sự kiện: —</p></form>`;
  },
  args: { label: 'Kênh thông báo', layout: 'grid', disabled: false },
};

/** The phone view: one column at a time (`layout="column"`), the column picker + "select the whole column". */
export const OneColumnAtATime = {
  render: (args) => {
    const id = `cm-${++seq}`;
    withProps(id, (el) => {
      el.setData(permData());
      logEvents(el, document.getElementById(`${id}-out`));
    });
    return `<form class="sb-stack sb-narrow"><td-check-matrix id="${id}" name="perms" label="${esc(args.label)}" layout="column"`
      + `${args.disabled ? ' disabled' : ''}></td-check-matrix><p class="sb-note" id="${id}-out">Sự kiện: —</p></form>`;
  },
  args: { label: 'Quyền (điện thoại)', layout: 'column', disabled: false },
};

/** Fail closed: invalid data (two rows with the same key) → error state, nothing submitted, never "clear all". */
export const Broken = {
  render: (args) => {
    const id = `cm-${++seq}`;
    withProps(id, (el) => el.setData({ columns: [{ key: 'a', label: 'A' }], rows: [{ key: 'r' }, { key: 'r' }] }));
    return `<td-check-matrix id="${id}" name="perms" label="${esc(args.label)}"></td-check-matrix>`;
  },
  args: { label: 'Dữ liệu hỏng' },
};
