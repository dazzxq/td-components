import { escapeHtml } from './escape.js';
import '../styles/story-layout.css';
import '../form/td-input-field.js';
import '../form/td-checkbox.js';
import '../form/td-dropdown.js';
import '../form/td-datetime-picker.js';
import '../form/td-button.js';

// TdFormValidation / TdModal load lazily inside the post-render hook (they need a DOM; the story XSS check renders
// the HTML strings in Node, where `setTimeout` is a no-op).
const CATEGORIES = [
  { value: 'news', label: 'Tin tức' },
  { value: 'review', label: 'Đánh giá' },
  { value: 'guide', label: 'Hướng dẫn' },
];
const RULES = {
  slug: (v) => (!v || /^[a-z0-9-]+$/.test(v) ? '' : 'Chỉ dùng chữ thường không dấu, số và dấu -'),
};
const SERVER_ERRORS = {
  slug: ['Slug này đã được dùng cho một bài khác'],
  'meta.email': 'Email liên hệ không tồn tại',
  general: 'Máy chủ đang bận, vui lòng thử lại sau',
};

let seq = 0;
const after = (fn) => setTimeout(fn, 0);

function formMarkup(id, args) {
  return `<form id="${id}" class="sb-stack">
    <td-input-field name="title" label="${escapeHtml(String(args.titleLabel ?? ''))}" required max-length="80"></td-input-field>
    <td-input-field name="slug" label="Slug" helper-text="Ví dụ: bai-viet-moi"></td-input-field>
    <td-dropdown name="category" label="Chuyên mục" required></td-dropdown>
    <td-datetime-picker name="publish_at" label="Thời điểm đăng" required></td-datetime-picker>
    <label for="${id}-email">Email liên hệ (ô gốc)</label>
    <input id="${id}-email" name="meta[email]" type="email" required>
    <label>Số trang (1–20) <input name="pages" type="number" min="1" max="20" value="30"></label>
    <td-checkbox name="agree" label="Tôi đồng ý với điều khoản" required></td-checkbox>
    <div class="sb-row">
      <td-button type="submit" variant="primary" label="${escapeHtml(String(args.submitLabel ?? ''))}"></td-button>
      <td-button type="button" variant="secondary" data-act="server" label="Giả lập lỗi máy chủ"></td-button>
      <td-button type="button" variant="secondary" data-act="clear" label="Xóa lỗi"></td-button>
    </div>
    <p class="sb-note" data-out></p>
  </form>`;
}

const SUMMARY = { auto: 'auto', true: true, false: false };

export default {
  title: 'Utils/FormValidation',
  tags: ['autodocs'],
  argTypes: {
    titleLabel: { control: 'text' },
    submitLabel: { control: 'text' },
    summary: { control: 'select', options: ['auto', 'true', 'false'] },
  },
  args: { titleLabel: 'Tiêu đề', submitLabel: 'Lưu bài', summary: 'auto' },
};

/**
 * A real `<form>`: `attach()` validates on submit (native attributes + a JS `slug` rule), focuses the first invalid
 * field, shows the summary, then revalidates live. "Giả lập lỗi máy chủ" applies a Laravel-style error map.
 */
export const Form = {
  render: (args) => {
    const id = `fv-form-${++seq}`;
    const summary = SUMMARY[String(args.summary)] ?? 'auto';
    after(async () => {
      const form = document.getElementById(id);
      if (!form) return;
      const { TdFormValidation } = await import('./form-validation.js');
      form.querySelector('td-dropdown').options = CATEGORIES;
      const out = form.querySelector('[data-out]');
      TdFormValidation.attach(form, {
        rules: RULES,
        summary,
        onValid: () => { out.textContent = 'Hợp lệ — dữ liệu sẽ được gửi.'; },
      });
      form.addEventListener('click', (e) => {
        const act = e.target instanceof Element ? e.target.closest('[data-act]') : null;
        if (!act) return;
        if (act.dataset.act === 'server') {
          const r = TdFormValidation.apply(form, SERVER_ERRORS, { summary });
          out.textContent = `Đã gắn ${r.applied.length} lỗi vào trường, ${r.unmapped.length} lỗi chung.`;
        } else {
          TdFormValidation.clear(form);
          out.textContent = '';
        }
      });
    });
    return formMarkup(id, args);
  },
};

/** TdModal async action recipe (D22): validate → save → on 422 apply the server errors and keep the dialog open. */
export const ModalAsyncSave = {
  render: (args) => {
    const id = `fv-modal-${++seq}`;
    after(() => {
      const btn = document.getElementById(id);
      if (!btn) return;
      btn.addEventListener('click', async () => {
        const [{ TdFormValidation }, { TdModal }] = await Promise.all([
          import('./form-validation.js'), import('../feedback/td-modal.js'),
        ]);
        const body = document.createElement('div');
        body.className = 'sb-stack';
        const title = document.createElement('td-input-field');
        title.setAttribute('name', 'title');
        title.setAttribute('label', String(args.titleLabel ?? ''));
        title.setAttribute('required', '');
        const slug = document.createElement('td-input-field');
        slug.setAttribute('name', 'slug');
        slug.setAttribute('label', 'Slug');
        slug.setAttribute('value', 'bai-da-co');
        body.append(title, slug);
        TdModal.show({
          title: 'Sửa bài viết',
          body,
          actions: [
            { label: 'Hủy', value: false },
            {
              label: String(args.submitLabel ?? ''),
              variant: 'primary',
              value: true,
              onClick: async () => {
                if (!TdFormValidation.validate(body, { rules: RULES }).valid) return false;
                try {
                  await new Promise((resolve, reject) => setTimeout(() => reject({ errors: SERVER_ERRORS }), 600));
                } catch (e) {
                  TdFormValidation.apply(body, e.errors);
                  return false; // keep the dialog open; the button is no longer busy
                }
                return true;
              },
            },
          ],
        });
      });
    });
    return `<div class="sb-stack"><td-button id="${id}" variant="primary" label="Mở hộp thoại"></td-button>
      <p class="sb-note">Nhập tiêu đề rồi bấm lưu: máy chủ giả lập trả lỗi 422 → lỗi hiện đúng trường, hộp thoại vẫn mở.</p></div>`;
  },
};
