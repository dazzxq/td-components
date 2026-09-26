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

const attr = (name, v) => (v === undefined || v === null || v === '' ? '' : ` ${name}="${v}"`);
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
