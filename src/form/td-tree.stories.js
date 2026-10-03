import { escapeHtml } from '../utils/escape.js';
import './td-tree.js';
import '../styles/story-layout.css';

const CATS = () => [
  { value: 'phone', label: 'Điện thoại', expanded: true, children: [
    { value: 'apple', label: 'Apple', children: [{ value: 'ip15', label: 'iPhone 15' }, { value: 'ip16', label: 'iPhone 16' }] },
    { value: 'samsung', label: 'Samsung', description: '12 sản phẩm', children: [{ value: 's24', label: 'Galaxy S24' }, { value: 'zflip', label: 'Galaxy Z Flip' }] },
  ] },
  { value: 'laptop', label: 'Laptop', children: [{ value: 'dell', label: 'Dell' }, { value: 'mac', label: 'MacBook' }] },
  { value: 'tablet', label: 'Máy tính bảng' },
  { value: 'acc', label: 'Phụ kiện', children: [{ value: 'case', label: 'Ốp lưng' }, { value: 'cable', label: 'Cáp sạc' }] },
];
const PERMS = () => [
  { value: 'post', label: 'Bài viết', expanded: true, children: [
    { value: 'post.read', label: 'Xem' }, { value: 'post.write', label: 'Sửa' }, { value: 'post.delete', label: 'Xoá', description: 'Chỉ quản trị cấp' },
  ] },
  { value: 'user', label: 'Người dùng', expanded: true, children: [
    { value: 'user.read', label: 'Xem' }, { value: 'user.ban', label: 'Khoá tài khoản', disabled: true },
  ] },
  { value: 'system', label: 'Hệ thống (khoá)', disabled: true, children: [{ value: 'system.config', label: 'Cấu hình' }] },
];

const esc = (v) => escapeHtml(String(v ?? ''));
let seq = 0;
/** Properties (data, loadChildren) are JS: set them once the story markup is in the DOM. */
function withProps(id, fn) {
  setTimeout(() => {
    const el = document.getElementById(id);
    if (el) fn(el);
  }, 0);
}
/** Show the latest event detail under the tree. */
function logEvents(el, out, names) {
  for (const n of names) el.addEventListener(n, (e) => { out.textContent = `${n}: ${JSON.stringify(e.detail.value ?? e.detail)}`; });
}

export default {
  title: 'Form/Tree',
  tags: ['autodocs'],
  argTypes: {
    label: { control: 'text' },
    searchable: { control: 'boolean' },
    disabled: { control: 'boolean' },
  },
};

/** selection="none": a navigation tree — Enter / click fires `activate`; ←→ open / close, ↑↓ Home End, type-ahead, `*`. */
export const Navigation = {
  render: (args) => {
    const id = `tree-${++seq}`;
    withProps(id, (el) => {
      el.data = CATS();
      logEvents(el, document.getElementById(`${id}-out`), ['activate', 'expanded-change']);
    });
    return `<div class="sb-stack"><td-tree id="${id}" label="${esc(args.label)}"${args.searchable ? ' searchable' : ''}${args.disabled ? ' disabled' : ''}></td-tree>`
      + `<p class="sb-note" id="${id}-out">Sự kiện: —</p></div>`;
  },
  args: { label: 'Danh mục sản phẩm', searchable: false, disabled: false },
};

/** selection="single": browsing never selects — Enter / Space / click do; the selected node's ancestors open on render. */
export const Single = {
  render: (args) => {
    const id = `tree-${++seq}`;
    withProps(id, (el) => {
      el.data = CATS();
      logEvents(el, document.getElementById(`${id}-out`), ['change']);
    });
    return `<form class="sb-stack"><td-tree id="${id}" name="category" selection="single" value="s24" label="${esc(args.label)}"${args.searchable ? ' searchable' : ''}></td-tree>`
      + `<p class="sb-note" id="${id}-out">change: —</p></form>`;
  },
  args: { label: 'Chuyên mục', searchable: true },
};

/** selection="multiple" (independent, the default): each node its own check — like a post's categories. */
export const Multiple = {
  render: (args) => {
    const id = `tree-${++seq}`;
    withProps(id, (el) => {
      el.data = CATS();
      logEvents(el, document.getElementById(`${id}-out`), ['change']);
    });
    return `<form class="sb-stack"><td-tree id="${id}" name="categories[]" selection="multiple" value='["phone","dell"]' label="${esc(args.label)}"></td-tree>`
      + `<p class="sb-note" id="${id}-out">Mỗi mục đã check là một giá trị FormData (categories[]).</p></form>`;
  },
  args: { label: 'Chuyên mục bài viết' },
};

/** multiple + cascade: tri-state from the leaves, value = checked leaves; locked nodes (and branches) stay as they are. */
export const CascadeLocked = {
  render: (args) => {
    const id = `tree-${++seq}`;
    withProps(id, (el) => {
      el.data = PERMS();
      el.value = ['post.read', 'user.ban', 'system.config'];
      logEvents(el, document.getElementById(`${id}-out`), ['change']);
    });
    return `<form class="sb-stack"><td-tree id="${id}" name="perms[]" selection="multiple" cascade label="${esc(args.label)}"></td-tree>`
      + `<p class="sb-note" id="${id}-out">"Khoá tài khoản" và "Cấu hình" khoá: vẫn được gửi, không đổi được — server vẫn phải tự kiểm quyền.</p></form>`;
  },
  args: { label: 'Quyền' },
};

/** Lazy branches: loadChildren(node, { signal }) ~700 ms; "Lỗi" fails (open again = retry), "Trống" returns []. */
export const Lazy = {
  render: (args) => {
    const id = `tree-${++seq}`;
    withProps(id, (el) => {
      el.loadChildren = (node, { signal }) => new Promise((resolve, reject) => {
        const t = setTimeout(() => {
          if (node.value === 'err') reject(new Error('Máy chủ lỗi (giả lập)'));
          else if (node.value === 'empty') resolve([]);
          else resolve([1, 2, 3].map((i) => ({ value: `${node.value}.${i}`, label: `${node.label} ${i}`, hasChildren: i === 1 })));
        }, 700);
        signal.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('Đã huỷ', 'AbortError')); });
      });
      el.data = [
        { value: 'north', label: 'Miền Bắc', hasChildren: true },
        { value: 'south', label: 'Miền Nam', hasChildren: true },
        { value: 'err', label: 'Lỗi', hasChildren: true },
        { value: 'empty', label: 'Trống', hasChildren: true },
      ];
      logEvents(el, document.getElementById(`${id}-out`), ['expanded-change', 'load-error']);
    });
    return `<div class="sb-stack"><td-tree id="${id}" label="${esc(args.label)}" selection="multiple"></td-tree>`
      + `<p class="sb-note" id="${id}-out">Sự kiện: —</p></div>`;
  },
  args: { label: 'Khu vực' },
};

/** Filtering (searchable): matches + their ancestors, diacritic-insensitive; clearing restores the open state. */
export const Search = {
  render: (args) => {
    const id = `tree-${++seq}`;
    withProps(id, (el) => { el.data = CATS(); });
    return `<div class="sb-stack"><td-tree id="${id}" searchable selection="single" label="${esc(args.label)}"></td-tree>`
      + '<p class="sb-note">Gõ "galaxy" hoặc "may tinh" (không dấu); ↓ từ ô tìm vào cây.</p></div>';
  },
  args: { label: 'Tìm danh mục' },
};
