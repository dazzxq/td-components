import { escapeHtml } from '../utils/escape.js';
import './td-choice-group.js';
import './td-number-input.js'; // VariantRecipe uses <td-number-input stepper>
import '../styles/story-layout.css';

export default {
  title: 'Form/Choice group',
  tags: ['autodocs'],
  argTypes: {
    label: { control: 'text' },
    variant: { control: 'select', options: ['button', 'swatch'] },
    required: { control: 'boolean' },
    disabled: { control: 'boolean' },
  },
};

const esc = (v) => escapeHtml(String(v ?? ''));
const flag = (name, on) => (on ? ` ${name}` : '');
const CAP = [
  { value: '128', label: '128GB', hint: '21.990.000₫' },
  { value: '256', label: '256GB', hint: '24.990.000₫', unavailable: true },
  { value: '512', label: '512GB', hint: '29.990.000₫' },
  { value: '1tb', label: '1TB', disabled: true },
];
const COLORS = [
  { value: 'titan-den', label: 'Titan đen', swatch: '#3b3b3d' },
  { value: 'titan-trang', label: 'Titan trắng', swatch: '#f4f4f2' },
  { value: 'titan-sa-mac', label: 'Titan sa mạc', swatch: '#bfa07e', unavailable: true, unavailableLabel: 'Sắp về' },
  { value: 'titan-xanh', label: 'Titan xanh', swatch: '#1e3a5f' },
  { value: 'hong', label: 'Hồng', swatch: '#f9a8d4', disabled: true },
];
const IMAGES = [
  { value: 'a', label: 'Ảnh mẫu 1', image: '/test/fixtures/1.svg' },
  { value: 'b', label: 'Ảnh mẫu 2', image: '/test/fixtures/2.svg', unavailable: true },
  { value: 'c', label: 'Ảnh mẫu 3', image: '/test/fixtures/3.svg' },
];
/** Set `options` on every host in the story (array data = JS property). */
const fill = (root, map) => { for (const [sel, opts] of Object.entries(map)) root.querySelector(sel).options = opts; };

/** Capacity with prices (hint), one out of stock (selectable, struck through), one combination that does not exist. */
export const Capacity = {
  render: (args) => `<form class="sb-stack" id="cg-form"><td-choice-group id="cg-cap" name="capacity" label="${esc(args.label)}" variant="${esc(args.variant)}" value="128"${flag('required', args.required)}${flag('disabled', args.disabled)}></td-choice-group>
    <p class="sb-note" id="cg-out">FormData: capacity = 128</p></form>`,
  args: { label: 'Dung lượng', variant: 'button', required: true, disabled: false },
  play: ({ canvasElement }) => {
    fill(canvasElement, { '#cg-cap': CAP });
    const form = canvasElement.querySelector('#cg-form');
    const out = canvasElement.querySelector('#cg-out');
    form.addEventListener('change', () => { out.textContent = `FormData: capacity = ${new FormData(form).get('capacity') ?? '(không có mục)'}`; });
  },
};

/** Colour swatches (SVG fill — CSP-safe, works without JS) with the current choice in the label line. */
export const Swatches = {
  render: () => '<div class="sb-stack"><td-choice-group id="cg-color" name="color" label="Màu sắc" variant="swatch" value="titan-den"></td-choice-group></div>',
  play: ({ canvasElement }) => fill(canvasElement, { '#cg-color': COLORS }),
};

/** Image swatches (`<img>`, lazy) — the site's CSP img-src must allow the CDN. */
export const ImageSwatches = {
  render: () => '<div class="sb-stack"><td-choice-group id="cg-img" name="pattern" label="Hoạ tiết" variant="swatch" value="a"></td-choice-group></div>',
  play: ({ canvasElement }) => fill(canvasElement, { '#cg-img': IMAGES }),
};

/** Buttons with a colour dot, an error (required), disabled group, dark theme. */
export const States = {
  render: () => `<div class="sb-stack">
    <td-choice-group id="cg-dot" name="c2" label="Màu (nút có chấm màu)" value="titan-xanh"></td-choice-group>
    <td-choice-group id="cg-err" name="c3" label="Phiên bản" required error-text="Vui lòng chọn một mục"></td-choice-group>
    <td-choice-group id="cg-off" name="c4" label="Khoá cả nhóm" value="128" disabled></td-choice-group>
    <div data-td-theme="dark" class="sb-dark"><td-choice-group id="cg-dark" name="c5" label="Tối" value="256"></td-choice-group></div></div>`,
  play: ({ canvasElement }) => fill(canvasElement, {
    '#cg-dot': COLORS.slice(0, 4), '#cg-err': [{ value: 'std', label: 'Tiêu chuẩn' }, { value: 'pro', label: 'Pro' }], '#cg-off': CAP, '#cg-dark': CAP,
  }),
};

/** Product page recipe: capacity × colour → the app resolves the variant (price, stock, hidden variant_id, cart button). */
export const VariantRecipe = {
  render: () => `<form class="sb-stack" id="cg-buy">
    <td-choice-group id="cg-v-cap" name="capacity" label="Dung lượng" value="128" required></td-choice-group>
    <td-choice-group id="cg-v-color" name="color" label="Màu sắc" variant="swatch" value="titan-den" required></td-choice-group>
    <input type="hidden" name="variant_id">
    <td-number-input name="qty" label="Số lượng" stepper min="1" max="5" value="1" clamp></td-number-input>
    <p class="sb-note" id="cg-v-out"></p></form>`,
  play: ({ canvasElement }) => {
    const variants = [];
    for (const c of ['128', '256', '512']) for (const k of ['titan-den', 'titan-trang', 'titan-sa-mac']) {
      if (c === '512' && k === 'titan-trang') continue; // a combination that does not exist
      variants.push({ id: `${c}-${k}`, capacity: c, color: k, stock: c === '256' && k === 'titan-sa-mac' ? 0 : 3 });
    }
    const cap = canvasElement.querySelector('#cg-v-cap');
    const color = canvasElement.querySelector('#cg-v-color');
    const out = canvasElement.querySelector('#cg-v-out');
    cap.options = CAP.slice(0, 3).map(({ value, label, hint }) => ({ value, label, hint }));
    const find = (c, k) => variants.find((v) => v.capacity === c && v.color === k);
    const sync = () => {
      color.options = COLORS.slice(0, 3).map(({ value, label, swatch }) => {
        const v = find(cap.value, value);
        return { value, label, swatch, disabled: !v, unavailable: !!v && v.stock === 0 };
      });
      const v = find(cap.value, color.value);
      canvasElement.querySelector('[name=variant_id]').value = v ? v.id : '';
      out.textContent = v ? `variant_id = ${v.id}${v.stock ? '' : ' (hết hàng)'}` : 'Tổ hợp không có';
    };
    cap.addEventListener('change', sync);
    color.addEventListener('change', sync);
    sync();
  },
};

const THEME = [{ value: 'auto', label: 'Tự động', icon: 'monitor' }, { value: 'light', label: 'Sáng', icon: 'sun' },
  { value: 'dark', label: 'Tối', icon: 'moon' }];

/** v0.52.0 `variant="segmented"`: icon + label pills, equal segments, sizes, icon-only (labels stay the names). */
export const Segmented = {
  render: () => `<div class="sb-stack">
    <td-choice-group id="cg-seg-md" aria-label="Giao diện" variant="segmented" value="auto"></td-choice-group>
    <td-choice-group id="cg-seg-sm" aria-label="Giao diện" variant="segmented" size="sm" icon-only value="dark"></td-choice-group>
    <td-choice-group id="cg-seg-lg" label="Chế độ xem" variant="segmented" size="lg" value="list"></td-choice-group>
  </div>`,
  play: ({ canvasElement }) => {
    canvasElement.querySelector('#cg-seg-md').options = THEME;
    canvasElement.querySelector('#cg-seg-sm').options = THEME;
    canvasElement.querySelector('#cg-seg-lg').options = [{ value: 'list', label: 'Danh sách', icon: 'menu' },
      { value: 'grid', label: 'Lưới ảnh', icon: 'image' }, { value: 'cols', label: 'So sánh', icon: 'columns', disabled: true }];
  },
};

/** v0.52.0 recipe: a theme switcher driving `data-td-theme` on <html> (+ the cookie the server reads). */
export const ThemeSwitcher = {
  render: () => `<td-choice-group id="cg-theme" aria-label="Giao diện" variant="segmented" size="sm" value="auto"></td-choice-group>`,
  play: ({ canvasElement }) => {
    const el = canvasElement.querySelector('#cg-theme');
    el.options = THEME;
    el.value = document.documentElement.getAttribute('data-td-theme') || 'auto';
    el.addEventListener('change', (e) => {
      document.documentElement.setAttribute('data-td-theme', e.detail.value);
      document.cookie = `td_theme=${e.detail.value}; path=/; max-age=31536000; SameSite=Lax`;
    });
  },
};
