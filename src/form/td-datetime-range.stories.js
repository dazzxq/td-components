import { escapeHtml } from '../utils/escape.js';
import './td-datetime-range.js';
import '../styles/story-layout.css';

export default {
  title: 'Form/Datetime range',
  tags: ['autodocs'],
  argTypes: {
    label: { control: 'text' },
    mode: { control: 'select', options: ['date', 'datetime'] },
    start: { control: 'text' },
    end: { control: 'text' },
    required: { control: 'select', options: ['', 'both', 'start', 'end'] },
    disabled: { control: 'boolean' },
  },
  args: { label: 'Khoảng ngày', mode: 'date', start: '', end: '', required: '', disabled: false },
};

const esc = (v) => escapeHtml(String(v ?? ''));

/** Filter of an audit log (date + presets). */
export const Default = {
  render: (a) => `<div class="sb-stack">
    <td-datetime-range name="range" label="${esc(a.label)}" mode="${esc(a.mode)}"${a.start ? ` start="${esc(a.start)}"` : ''}${a.end ? ` end="${esc(a.end)}"` : ''}${a.required ? ` required="${esc(a.required)}"` : ''}${a.disabled ? ' disabled' : ''}></td-datetime-range>
  </div>`,
};

/** Promotion window: date + time, 15-minute wheel. */
export const DatetimeStep15 = {
  args: { label: 'Khung giờ khuyến mãi', mode: 'datetime', start: '01/10/2026 - 08:00', end: '05/10/2026 - 22:00' },
  render: (a) => `<div class="sb-stack">
    <td-datetime-range name="promo" label="${esc(a.label)}" mode="datetime" minute-step="15" start="${esc(a.start)}" end="${esc(a.end)}"></td-datetime-range>
  </div>`,
};

/** Report limited to 92 days; dcms2 field names. */
export const MaxDays = {
  args: { label: 'Báo cáo (tối đa 92 ngày)' },
  render: (a) => `<div class="sb-stack">
    <td-datetime-range start-name="date_from" end-name="date_to" name="report" label="${esc(a.label)}" max-days="92" required></td-datetime-range>
  </div>`,
};
