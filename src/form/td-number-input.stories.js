import { escapeHtml } from '../utils/escape.js';
import './td-number-input.js';
import '../styles/story-layout.css';

export default {
  title: 'Form/Number input',
  tags: ['autodocs'],
  argTypes: {
    label: { control: 'text' },
    suffix: { control: 'text' },
    prefix: { control: 'text' },
    decimals: { control: { type: 'number', min: 0, max: 10 } },
    min: { control: 'text' },
    max: { control: 'text' },
    step: { control: 'text' },
    required: { control: 'boolean' },
    disabled: { control: 'boolean' },
    readonly: { control: 'boolean' },
    clamp: { control: 'boolean' },
  },
};

const esc = (v) => escapeHtml(String(v ?? ''));
const opt = (name, v) => (v != null && v !== '' ? ` ${name}="${esc(v)}"` : '');
const flag = (name, on) => (on ? ` ${name}` : '');

/** VND price: grouped while typing, the form submits the clean number (see the line below the field). */
export const Price = {
  render: (args) => `<form class="sb-stack" id="ni-form">
    <td-number-input name="price"${opt('label', args.label)}${opt('suffix', args.suffix)}${opt('prefix', args.prefix)}${opt('decimals', args.decimals)}${opt('min', args.min)}${opt('max', args.max)}${opt('step', args.step)}${flag('required', args.required)}${flag('disabled', args.disabled)}${flag('readonly', args.readonly)}${flag('clamp', args.clamp)} unit-label="đồng" value="12990000" helper-text="Dán được “12.990.000 ₫”, “12 990 000”…"></td-number-input>
    <p class="sb-note" id="ni-out">FormData: price = 12990000</p></form>`,
  args: { label: 'Giá bán', suffix: '₫', prefix: '', decimals: 0, min: '1000', max: '', step: '', required: true, disabled: false, readonly: false, clamp: false },
  play: ({ canvasElement }) => {
    const form = canvasElement.querySelector('#ni-form');
    const out = canvasElement.querySelector('#ni-out');
    form.querySelector('td-number-input').addEventListener('input', () => {
      out.textContent = `FormData: price = ${new FormData(form).get('price') || '(rỗng)'}`;
    });
  },
};

/** Percent with 2 decimals, a USD amount (group ",", decimal "."), a ± adjustment (min < 0 allows negatives). */
export const Variants = {
  render: () => `<div class="sb-stack">
    <td-number-input label="Tỉ lệ hoa hồng" suffix="%" decimals="2" min="0" max="100" value="12.5"></td-number-input>
    <td-number-input label="Giá (USD)" prefix="$" decimals="2" group-separator="," value="1234.5"></td-number-input>
    <td-number-input label="Điều chỉnh tồn kho" min="-100000" value="-250" helper-text="Số âm = xuất bớt"></td-number-input>
    <td-number-input label="Ngưỡng miễn phí vận chuyển" suffix="₫" step="1000" value="500000" size="sm"></td-number-input></div>`,
};

/** Out of range is REPORTED, never fixed silently (default); `clamp` opts into clamping on blur (announced). */
export const RangeAndClamp = {
  render: () => `<div class="sb-stack">
    <td-number-input label="Hoàn tiền (báo lỗi)" suffix="₫" max="10000000" value="15000000" validate-on="input"></td-number-input>
    <td-number-input label="Hoàn tiền (clamp khi rời ô)" suffix="₫" max="10000000" value="15000000" clamp></td-number-input>
    <td-number-input label="Giá vốn" suffix="₫" value="5000" error-text="Giá vốn cao hơn giá bán"></td-number-input>
    <td-number-input label="Khoá" suffix="₫" value="5000" disabled></td-number-input></div>`,
};

/** SSR (`number-input@1`): what td_number_input(…, ['element' => true]) prints — a native type=number (clean value) adopted in place. */
export const ServerRendered = {
  render: (args) => `<form class="sb-stack"><td-number-input data-td-ssr="number-input@1" id="ni-ssr" name="price" value="12990000" label="${esc(args.label)}" suffix="₫">
    <div class="td-field td-field--md td-number"><label class="td-field__label" id="ni-ssr-label" for="ni-ssr-control">${esc(args.label)}</label>
    <div class="td-number__box"><input type="number" class="td-number__control" id="ni-ssr-control" inputmode="numeric" autocomplete="off" spellcheck="false" name="price" value="12990000" min="0" step="1" aria-describedby="ni-ssr-unit"><span class="td-number__affix td-number__affix--suffix" aria-hidden="true">₫</span><span id="ni-ssr-unit" hidden>₫</span></div>
    <div class="td-field__footer" hidden><div class="td-field__note" id="ni-ssr-note" hidden></div></div><span class="td-sr-only" id="ni-ssr-status" role="status"></span></div></td-number-input></form>`,
  args: { label: 'Giá bán (SSR)' },
};

/** v0.49.0 `stepper`: − / + around the field (cart quantity) — out of the Tab order, aria-disabled at the bounds. */
export const Stepper = {
  render: () => `<form class="sb-stack" id="ni-stepper">
    <td-number-input name="qty" label="Số lượng" stepper min="1" max="5" value="1" clamp suffix="cái" unit-label="cái"></td-number-input>
    <td-number-input name="w" label="Khối lượng (kg)" stepper decimals="1" step="0.5" min="0" value="2.5"></td-number-input>
    <td-number-input name="locked" label="Khoá" stepper value="3" disabled></td-number-input>
    <p class="sb-note" id="ni-stepper-out">change: —</p></form>`,
  play: ({ canvasElement }) => {
    const out = canvasElement.querySelector('#ni-stepper-out');
    canvasElement.querySelector('#ni-stepper').addEventListener('change', (e) => { out.textContent = `change: ${e.detail?.value ?? ''}`; });
  },
};
