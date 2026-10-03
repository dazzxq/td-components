import { escapeHtml } from '../utils/escape.js';
import './td-tree-select.js';
import { TdModal } from '../feedback/td-modal.js';
import '../styles/story-layout.css';

const CATS = () => [
  { value: 'phone', label: 'Điện thoại', children: [
    { value: 'apple', label: 'Apple', children: [{ value: 'ip15', label: 'iPhone 15' }, { value: 'ip16', label: 'iPhone 16' }] },
    { value: 'samsung', label: 'Samsung', children: [{ value: 's24', label: 'Galaxy S24' }] },
  ] },
  { value: 'laptop', label: 'Laptop', children: [{ value: 'dell', label: 'Dell' }, { value: 'mac', label: 'MacBook' }] },
  { value: 'acc', label: 'Phụ kiện', children: [{ value: 'case', label: 'Ốp lưng' }, { value: 'cable', label: 'Cáp sạc' }] },
];

const esc = (v) => escapeHtml(String(v ?? ''));
const attr = (name, v) => (v === undefined || v === null || v === '' ? '' : ` ${name}="${esc(v)}"`);
let seq = 0;
function withProps(id, fn) {
  setTimeout(() => {
    const el = document.getElementById(id);
    if (el) fn(el);
  }, 0);
}

export default {
  title: 'Form/Tree select',
  tags: ['autodocs'],
  argTypes: {
    label: { control: 'text' },
    placeholder: { control: 'text' },
    searchable: { control: 'boolean' },
    disabled: { control: 'boolean' },
    required: { control: 'boolean' },
  },
};

/** Single = combobox + tree popup: type to filter in place; ↓ opens, ←→ open / close a branch (empty box), Enter picks. */
export const SinglePath = {
  render: (args) => {
    const id = `ts-${++seq}`;
    withProps(id, (el) => {
      el.data = CATS();
      el.addEventListener('change', (e) => { document.getElementById(`${id}-out`).textContent = `change: ${e.detail.value}`; });
    });
    return `<form class="sb-stack"><td-tree-select id="${id}" name="parent" display="path" allow-clear value="ip16"`
      + `${attr('label', args.label)}${attr('placeholder', args.placeholder)}${args.searchable ? '' : ' searchable="false"'}`
      + `${args.disabled ? ' disabled' : ''}${args.required ? ' required' : ''}></td-tree-select>`
      + `<p class="sb-note" id="${id}-out">display="path": hiện đường dẫn đầy đủ của mục đã chọn.</p></form>`;
  },
  args: { label: 'Danh mục cha', placeholder: '— Không có (gốc) —', searchable: true, disabled: false, required: false },
};

/** Multiple = disclosure: the popup holds a search box + a tree with checks; Space / Enter toggle, the popup stays open. */
export const Multiple = {
  render: (args) => {
    const id = `ts-${++seq}`;
    withProps(id, (el) => { el.data = CATS(); });
    return `<form class="sb-stack"><td-tree-select id="${id}" name="categories[]" multiple allow-clear value='["ip15","dell","case"]'`
      + `${attr('label', args.label)}${attr('placeholder', args.placeholder)}></td-tree-select>`
      + '<p class="sb-note">Tóm tắt "A, B +n"; cần chip gỡ được thì dùng td-chip-input.</p></form>';
  },
  args: { label: 'Chuyên mục bài viết', placeholder: 'Chọn chuyên mục' },
};

/** Inside a modal: the popup floats above the dialog (LAYERS.popover); Escape closes the popup first. */
export const InAModal = {
  render: () => {
    const id = `ts-open-${++seq}`;
    withProps(id, (btn) => {
      btn.addEventListener('click', () => {
        const el = document.createElement('td-tree-select');
        el.setAttribute('label', 'Danh mục cha');
        el.setAttribute('display', 'path');
        el.data = CATS();
        TdModal.show({ title: 'Sửa danh mục', body: el, actions: [{ label: 'Lưu', variant: 'primary' }] });
      });
    });
    return `<div class="sb-stack"><button type="button" id="${id}">Mở hộp thoại</button></div>`;
  },
};

/** SSR (`tree-select@1`): the markup php/td.php td_tree_select(…, ['element' => true]) prints — the native select has the
 * exact control box, the upgrade moves nothing; without JS it submits natively. */
export const ServerRendered = {
  render: (args) => `<form class="sb-stack"><td-tree-select data-td-ssr="tree-select@1" id="ts-ssr" label="${esc(args.label)}" placeholder="— Gốc —" allow-clear value-label="Apple">`
    + `<label class="td-field__label" for="ts-ssr-select">${esc(args.label)}</label>`
    + '<select class="td-tree-select__native" id="ts-ssr-select" name="parent"><option value="">— Gốc —</option>'
    + '<option value="phone" data-level="0" data-label="Điện thoại">Điện thoại</option>'
    + '<option value="apple" data-level="1" data-label="Apple" selected>  Apple</option>'
    + '<option value="samsung" data-level="1" data-label="Samsung" data-locked disabled>  Samsung</option>'
    + '<option value="acc" data-level="0" data-label="Phụ kiện">Phụ kiện</option></select></td-tree-select></form>',
  args: { label: 'Danh mục cha' },
};
