import { escapeHtml } from '../utils/escape.js';
import './td-dropdown.js';
import '../styles/story-layout.css';

const CITIES = [
  { value: 'hn', label: 'Hà Nội' },
  { value: 'sg', label: 'TP. Hồ Chí Minh' },
  { value: 'dn', label: 'Đà Nẵng' },
  { value: 'hp', label: 'Hải Phòng' },
  { value: 'ct', label: 'Cần Thơ' },
  { value: 'hue', label: 'Huế' },
];

const attr = (name, v) => (v === undefined || v === null || v === '' ? '' : ` ${name}="${escapeHtml(String(v))}"`);
const flag = (name, v) => (v ? ` ${name}` : '');

let seq = 0;
/** Options are a JS property: set them once the story markup is in the DOM. */
function withOptions(id, options, extra) {
  setTimeout(() => {
    const el = document.getElementById(id);
    if (!el) return;
    el.options = options;
    if (extra) extra(el);
  }, 0);
}

export default {
  title: 'Form/Dropdown',
  tags: ['autodocs'],
  argTypes: {
    label: { control: 'text' },
    placeholder: { control: 'text' },
    searchable: { control: 'boolean' },
    'allow-clear': { control: 'boolean' },
    'max-height': { control: 'number' },
    required: { control: 'boolean' },
    disabled: { control: 'boolean' },
    'error-text': { control: 'text' },
  },
};

export const Default = {
  render: (args) => {
    const id = `dd-${++seq}`;
    withOptions(id, CITIES);
    return `<div class="sb-stack"><td-dropdown id="${id}"${attr('label', args.label)}${attr('placeholder', args.placeholder)}`
      + `${args.searchable === false ? ' searchable="false"' : ''}${args['allow-clear'] === false ? ' allow-clear="false"' : ''}`
      + `${attr('max-height', args['max-height'])}${flag('required', args.required)}${flag('disabled', args.disabled)}`
      + `${attr('error-text', args['error-text'])}></td-dropdown>`
      + '<p class="sb-note">Bàn phím: ↓/↑/Enter/Space mở, ↑↓ Home End PageUp PageDown, gõ chữ để nhảy, Enter chọn, Esc đóng, Tab rời.</p></div>';
  },
  args: { label: 'Thành phố', placeholder: 'Chọn thành phố', searchable: true, 'allow-clear': true, 'max-height': 5, required: false, disabled: false, 'error-text': '' },
};

export const WithoutSearch = {
  render: () => {
    withOptions('dd-nosearch', CITIES);
    return '<div class="sb-stack"><td-dropdown id="dd-nosearch" label="Thành phố" searchable="false"></td-dropdown></div>';
  },
};

export const LongList = {
  render: () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ value: String(i + 1), label: `Mục ${i + 1} — ${['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon'][i % 5]}` }));
    withOptions('dd-long', many);
    return '<div class="sb-stack"><td-dropdown id="dd-long" label="Danh mục" max-height="6"></td-dropdown></div>';
  },
};

export const Preselected = {
  render: () => {
    withOptions('dd-pre', CITIES);
    return '<div class="sb-stack"><td-dropdown id="dd-pre" label="Thành phố" value="dn"></td-dropdown>'
      + '<p class="sb-note">Có giá trị → tuỳ chọn "Không chọn" đứng đầu danh sách (điều hướng bằng phím mũi tên được).</p></div>';
  },
};

export const RequiredWithError = {
  render: () => {
    withOptions('dd-err', CITIES);
    return '<div class="sb-stack"><td-dropdown id="dd-err" label="Thành phố" required error-text="Vui lòng chọn thành phố"></td-dropdown></div>';
  },
};

export const Disabled = {
  render: () => {
    withOptions('dd-dis', CITIES);
    return '<div class="sb-stack"><td-dropdown id="dd-dis" label="Thành phố" value="hn" disabled></td-dropdown></div>';
  },
};

export const ExternalLabel = {
  render: () => {
    withOptions('dd-ext', CITIES);
    withOptions('dd-aria', CITIES);
    return '<div class="sb-stack"><label for="dd-ext">Nhãn bên ngoài</label><td-dropdown id="dd-ext"></td-dropdown>'
      + '<td-dropdown id="dd-aria" aria-label="Chỉ có aria-label"></td-dropdown></div>';
  },
};

const COLORS = [
  { value: 'den', label: 'Titan đen', swatch: '#3b3b3d' },
  { value: 'trang', label: 'Titan trắng', swatch: '#f4f4f2' },
  { value: 'sa', label: 'Titan sa mạc', swatch: 'rgb(191, 160, 126)' },
  { value: 'xanh', label: 'Xanh dương', swatch: '#1d4ed8' },
  { value: 'khac', label: 'Màu khác (không chấm)' },
];

export const MauSanPham = {
  name: 'Màu sản phẩm',
  render: () => {
    withOptions('dd-color', COLORS);
    return '<div class="sb-stack"><td-dropdown id="dd-color" label="Màu sắc" value="sa" searchable="false"></td-dropdown>'
      + '<p class="sb-note">Option có <code>swatch</code> (màu CSS) hiện chấm tròn trước nhãn, cả trên trigger. Nhãn phải nói tên màu.</p></div>';
  },
};

const WAREHOUSES = [
  { value: 'hn', label: 'Kho Hà Nội', icon: 'archive', iconTone: 'accent', description: 'Cầu Giấy', status: { tone: 'success', text: 'Đang mở' }, meta: '128 SP', keywords: ['main', 'kho chinh'], group: 'kho' },
  { value: 'hcm', label: 'Kho Sài Gòn', icon: 'archive', description: 'Quận 7', status: { tone: 'warning', text: 'Sắp đầy' }, meta: '96 SP', keywords: 'saigon', group: 'kho' },
  { value: 'dn', label: 'Kho Đà Nẵng', icon: 'lock', iconTone: 'danger', description: 'Tạm ngưng nhập', status: { tone: 'danger', text: 'Đóng' }, disabled: true, group: 'kho' },
  { value: 'lang', label: 'Cửa hàng Láng', icon: 'inbox', iconTone: 'info', description: '1 Láng Hạ', meta: '24 SP', group: 'shop' },
  { value: 'online', label: 'Bán online', icon: 'star', iconTone: 'success', group: 'shop' },
  { value: 'khac', label: 'Khác' },
];

export const DongGiauThongTin = {
  name: 'Dòng giàu thông tin + nhóm',
  render: () => {
    withOptions('dd-rich', WAREHOUSES, (el) => { el.groups = [{ key: 'kho', label: 'Kho hàng' }, { key: 'shop', label: 'Cửa hàng' }]; });
    return '<div class="sb-stack"><td-dropdown id="dd-rich" label="Nơi xuất" value="hn" max-height="5"></td-dropdown>'
      + '<p class="sb-note">Option có <code>icon</code> / <code>iconTone</code>, <code>description</code>, <code>status</code>, '
      + '<code>meta</code> thành dòng hai tầng; <code>group</code> + <code>groups</code> gom nhóm có tiêu đề. Ô tìm kiếm khớp cả '
      + 'mô tả và <code>keywords</code> (thử "saigon"); trình đọc màn hình nghe số kết quả.</p></div>';
  },
};
