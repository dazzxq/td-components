import { escapeHtml } from '../utils/escape.js';
import '../styles/story-layout.css';
import './td-dropzone.js';

export default {
  title: 'Form/Dropzone',
  tags: ['autodocs'],
  argTypes: {
    label: { control: 'text' },
    accept: { control: 'text' },
    'max-size': { control: 'text' },
    'max-files': { control: 'number' },
    multiple: { control: 'boolean' },
    preview: { control: 'boolean' },
    required: { control: 'boolean' },
    disabled: { control: 'boolean' },
  },
  args: {
    label: 'Tệp đính kèm',
    accept: '.pdf,image/*',
    'max-size': '5MB',
    'max-files': 3,
    multiple: true,
    preview: true,
    required: false,
    disabled: false,
  },
};

const attr = (name, v) => (v === '' || v == null ? '' : ` ${name}="${escapeHtml(String(v))}"`);
const bool = (name, v) => (v === true ? ` ${name}` : '');

/** Drag files onto the zone or use "Chọn file"; rejected files are listed with the reason. */
export const Default = {
  render: (args) => `<td-dropzone name="attachments[]"${attr('label', args.label)}${attr('accept', args.accept)}`
    + `${attr('max-size', args['max-size'])}${attr('max-files', args['max-files'])}${bool('multiple', args.multiple)}`
    + `${bool('preview', args.preview)}${bool('required', args.required)}${bool('disabled', args.disabled)}></td-dropzone>`,
};

/** In a form: submit lists the FormData entries (files are sent under `name`); reset clears the list. */
export const InForm = {
  render: () => {
    const form = document.createElement('form');
    const dz = document.createElement('td-dropzone');
    dz.setAttribute('name', 'docs[]');
    dz.setAttribute('label', 'Hồ sơ');
    dz.setAttribute('multiple', '');
    dz.setAttribute('required', '');
    const row = document.createElement('div');
    row.className = 'sb-row';
    for (const [type, text] of [['submit', 'Gửi'], ['reset', 'Làm lại']]) {
      const b = document.createElement('button');
      b.type = type;
      b.className = `td-btn td-btn--${type === 'submit' ? 'primary' : 'secondary'}`;
      b.textContent = text;
      row.appendChild(b);
    }
    const out = document.createElement('p');
    out.className = 'sb-note';
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      out.textContent = [...new FormData(form).entries()].map(([k, v]) => `${k}: ${v.name ?? v}`).join(', ') || '(trống)';
    });
    form.append(dz, row, out);
    return form;
  },
};

/** Upload hook (simulated): per-file <td-progress>; removing a file aborts its upload; "fail" in the name → error. */
export const UploadHook = {
  render: () => {
    const dz = document.createElement('td-dropzone');
    dz.setAttribute('label', 'Tải lên ngay');
    dz.setAttribute('multiple', '');
    dz.setAttribute('preview', '');
    dz.upload = (file, { onProgress, signal }) => new Promise((resolve, reject) => {
      let p = 0;
      const id = setInterval(() => {
        p += 10;
        onProgress(p);
        if (p >= 100) {
          clearInterval(id);
          if (/fail/i.test(file.name)) reject(new Error('demo'));
          else resolve({ ok: true });
        }
      }, 250);
      signal.addEventListener('abort', () => { clearInterval(id); reject(signal.reason); });
    });
    return dz;
  },
};

/**
 * v0.33.0 presentation API (dcms2 look): `prompt-title` + `prompt-text` → stacked zone (64 px icon → title → muted
 * sub-line; the whole zone opens the picker, "Chọn file" stays for the keyboard); `hint-style="badges"` → one
 * `td-badge` per hint part. Text only — no markup is accepted.
 */
export const StackedBadges = {
  render: () => `<td-dropzone name="media[]" multiple accept="image/jpeg,image/png,image/gif,image/webp"`
    + ' accept-label="JPG, JPEG, PNG, GIF, WEBP" max-size="20MB"'
    + ' prompt-title="Kéo thả file vào đây" prompt-text="hoặc bấm để chọn file" hint-style="badges"></td-dropzone>',
};
