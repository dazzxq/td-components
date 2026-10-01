import { escapeHtml } from '../utils/escape.js';
import './td-slider.js';
import '../styles/story-layout.css';

const attr = (name, v) => (v === undefined || v === null || v === '' ? '' : ` ${name}="${escapeHtml(String(v))}"`);
const flag = (name, v) => (v ? ` ${name}` : '');

export default {
  title: 'Form/Slider',
  tags: ['autodocs'],
  argTypes: {
    min: { control: 'number' },
    max: { control: 'number' },
    value: { control: 'number' },
    step: { control: 'number' },
    size: { control: { type: 'select' }, options: ['sm', 'md', 'lg'] },
    color: { control: 'color' },
    'track-color': { control: 'color' },
    label: { control: 'text' },
    'show-label': { control: 'boolean' },
    'label-position': { control: { type: 'select' }, options: ['top', 'bottom'] },
    'show-step-labels': { control: 'boolean' },
    'show-step-marks': { control: 'boolean' },
    'error-text': { control: 'text' },
    disabled: { control: 'boolean' },
  },
};

export const Default = {
  render: (args) => `<td-slider${attr('min', args.min)}${attr('max', args.max)}${attr('value', args.value)}${attr('step', args.step)}${attr('size', args.size)}${attr('color', args.color)}${attr('track-color', args['track-color'])}${attr('label', args.label)}${flag('show-label', args['show-label'])}${attr('label-position', args['label-position'])}${flag('show-step-labels', args['show-step-labels'])}${flag('show-step-marks', args['show-step-marks'])}${attr('error-text', args['error-text'])}${flag('disabled', args.disabled)}></td-slider>`,
  args: {
    min: 0,
    max: 100,
    value: 50,
    step: 1,
    size: 'md',
    label: 'Âm lượng',
    'show-label': true,
    'label-position': 'top',
    'show-step-labels': true,
    'show-step-marks': false,
    disabled: false,
  },
};

export const Sizes = {
  render: () => `
    <div class="sb-stack">
      <td-slider size="sm" label="Nhỏ (200 px)" value="30"></td-slider>
      <td-slider size="md" label="Vừa (300 px)" value="50"></td-slider>
      <td-slider size="lg" label="Lớn (400 px)" value="70"></td-slider>
    </div>
    <p class="sb-note">Width token <code>--td-slider-w</code>, never wider than its container (max-width: 100%).</p>`,
};

export const CustomColor = {
  render: () => `
    <div class="sb-stack">
      <td-slider label="Tiến độ" value="75" color="#16a34a" show-label></td-slider>
      <td-slider label="Nhiệt độ" value="40" color="rgb(185 28 28)" track-color="#fde68a"></td-slider>
    </div>`,
};

export const WithStepMarks = {
  ...Default,
  args: { ...Default.args, min: 0, max: 10, step: 2, value: 4, label: 'Đánh giá', 'show-step-marks': true },
};

export const DecimalSteps = {
  ...Default,
  args: { ...Default.args, min: 0, max: 1, step: 0.1, value: 0.3, label: 'Độ mờ', 'show-step-marks': true },
};

export const LabelBottom = {
  ...Default,
  args: { ...Default.args, 'label-position': 'bottom', label: 'Giá trị ở dưới', value: 60 },
};

export const Disabled = {
  ...Default,
  args: { ...Default.args, disabled: true, label: 'Đã khoá', value: 40 },
};

export const WithError = {
  ...Default,
  args: { ...Default.args, label: 'Ngưỡng', value: 90, 'error-text': 'Giá trị vượt ngưỡng cho phép' },
};

export const Naming = {
  render: () => `
    <div class="sb-stack">
      <td-slider label="Nhãn bên trong" value="20"></td-slider>
      <td-slider aria-label="Chỉ có aria-label" value="40"></td-slider>
      <label for="sb-slider-ext">Nhãn bên ngoài (label for)</label>
      <td-slider id="sb-slider-ext" value="60"></td-slider>
    </div>`,
};

export const KeyboardAndDrag = {
  render: () => `
    <td-slider label="Thử bàn phím / kéo" value="50" show-label></td-slider>
    <p class="sb-note">Tab to focus (ring on the thumb) · ←/→ step · Home/End · drag: the solid knob just follows the
      pointer (v0.20.0: no lens, no lift). One <code>input</code> and one <code>change</code> per interaction.</p>`,
};
