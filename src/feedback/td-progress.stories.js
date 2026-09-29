import { escapeHtml } from '../utils/escape.js';
import '../styles/story-layout.css';
import './td-progress.js';

export default {
  title: 'Feedback/Progress',
  tags: ['autodocs'],
  argTypes: {
    value: { control: { type: 'number', min: 0, max: 100 } },
    max: { control: 'number' },
    label: { control: 'text' },
    variant: { control: 'select', options: ['primary', 'success', 'danger', 'warning'] },
    size: { control: 'select', options: ['sm', 'md'] },
  },
  args: { value: 40, max: 100, label: 'Đang tải lên', variant: 'primary', size: 'md' },
};

const attr = (name, v) => (v === '' || v == null ? '' : ` ${name}="${escapeHtml(String(v))}"`);

/** Determinate bar: role="progressbar" + aria-valuenow / aria-valuetext "N%" on the host; width via CSSOM. */
export const Default = {
  render: (args) => `<td-progress${attr('value', args.value)}${attr('max', args.max)}${attr('label', args.label)}`
    + `${attr('variant', args.variant)}${attr('size', args.size)}></td-progress>`,
};

/** No `value` → indeterminate (sliding bar; static under prefers-reduced-motion). */
export const Indeterminate = {
  render: (args) => `<td-progress${attr('label', args.label)}${attr('variant', args.variant)}${attr('size', args.size)}></td-progress>`,
};

/** Variants × sizes. */
export const Variants = {
  render: () => ['primary', 'success', 'danger', 'warning'].map((v, i) => `
    <p class="sb-note">${v}</p>
    <td-progress value="${25 * (i + 1)}" variant="${v}" label="${v}"></td-progress>
    <td-progress value="${25 * (i + 1)}" variant="${v}" size="sm" label="${v} sm"></td-progress>`).join(''),
};

/** Live value (updates in place, the width transitions). */
export const Animated = {
  render: () => {
    const wrap = document.createElement('div');
    const p = document.createElement('td-progress');
    p.setAttribute('label', 'Tiến độ');
    p.setAttribute('value', '0');
    wrap.appendChild(p);
    let v = 0;
    const id = setInterval(() => {
      if (!p.isConnected) { clearInterval(id); return; }
      v = (v + 10) % 110;
      p.setAttribute('value', String(v));
    }, 600);
    return wrap;
  },
};
