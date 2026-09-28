import { escapeHtml } from '../utils/escape.js';
import '../styles/story-layout.css';
import './td-input-field.js';
import './td-password-meter.js';

export default {
  title: 'Form/PasswordMeter',
  tags: ['autodocs'],
  argTypes: {
    label: { control: 'text' },
    checklist: { control: 'text' },
    'min-length': { control: 'number' },
  },
  args: { label: 'Mật khẩu mới', checklist: 'all', 'min-length': 8 },
};

/** `for` → a `<td-input-field type="password">`; type to see the level + checklist update. */
export const WithInputField = {
  render: (args) => `
    <div class="sb-stack">
      <td-input-field id="pwm-demo" type="password" autocomplete="new-password"
        label="${escapeHtml(String(args.label ?? ''))}"></td-input-field>
      <td-password-meter for="pwm-demo" checklist="${escapeHtml(String(args.checklist ?? ''))}"
        min-length="${escapeHtml(String(args['min-length'] ?? ''))}"></td-password-meter>
    </div>`,
};

/** Wrapping a native `<input>` (SSR-friendly: the input works without JS). Bar + status only. */
export const WrappedNativeInput = {
  render: () => `
    <label class="sb-note" for="pwm-native">Mật khẩu</label>
    <td-password-meter>
      <input id="pwm-native" class="td-field__control" type="password" autocomplete="new-password">
    </td-password-meter>`,
};

/** Levels 0–4 (score hook forced per row). */
export const Levels = {
  render: () => {
    const wrap = document.createElement('div');
    wrap.className = 'sb-stack';
    [0, 1, 2, 3, 4].forEach((n) => {
      const meter = document.createElement('td-password-meter');
      meter.score = () => n;
      const input = document.createElement('input');
      input.type = 'password';
      input.value = 'demo-value';
      input.className = 'td-field__control';
      input.setAttribute('aria-label', `Mức ${n}`);
      meter.appendChild(input);
      wrap.appendChild(meter);
    });
    return wrap;
  },
};
