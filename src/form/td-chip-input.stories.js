import { escapeHtml } from '../utils/escape.js';
import './td-chip-input.js';
import { TdModal } from '../feedback/td-modal.js';
import '../styles/story-layout.css';

const TAGS = [
  { value: 'php', label: 'PHP' },
  { value: 'laravel', label: 'Laravel', description: 'Framework PHP' },
  { value: 'js', label: 'JavaScript' },
  { value: 'ts', label: 'TypeScript' },
  { value: 'vue', label: 'Vue' },
  { value: 'css', label: 'CSS' },
  { value: 'wp', label: 'WordPress' },
  { value: 'vn', label: 'Tiếng Việt' },
];

const AUTHORS = [
  { value: 'a1', label: 'Nguyễn Văn An', description: 'Biên tập viên' },
  { value: 'a2', label: 'Trần Thị Bình', description: 'Phóng viên' },
  { value: 'a3', label: 'Lê Hoàng Cường', description: 'Cộng tác viên' },
  { value: 'a4', label: 'Phạm Thu Dung', description: 'Phóng viên ảnh' },
  { value: 'a5', label: 'Đỗ Minh Đức', description: 'Biên tập viên' },
];

const attr = (name, v) => (v === undefined || v === null || v === '' ? '' : ` ${name}="${escapeHtml(String(v))}"`);
const flag = (name, v) => (v ? ` ${name}` : '');
const fold = (s) => String(s).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/đ/g, 'd');

let seq = 0;
/** Properties (options, search, create…) are JS: set them once the story markup is in the DOM. */
function withProps(id, fn) {
  setTimeout(() => {
    const el = document.getElementById(id);
    if (el) fn(el);
  }, 0);
}

/**
 * Fake async provider: ~600 ms latency, honours the AbortSignal (like fetch), and fails on the query "lỗi" so the
 * error state can be tried.
 */
function fakeAuthorSearch(query, { signal }) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      if (fold(query).includes('loi')) {
        reject(new Error('Máy chủ lỗi (giả lập)'));
        return;
      }
      const q = fold(query);
      resolve(AUTHORS.filter((a) => fold(a.label).includes(q)));
    }, 600);
    signal.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new DOMException('Đã huỷ', 'AbortError'));
    });
  });
}

export default {
  title: 'Form/Chip Input',
  tags: ['autodocs'],
  argTypes: {
    label: { control: 'text' },
    placeholder: { control: 'text' },
    'allow-create': { control: 'boolean' },
    'show-on-focus': { control: 'boolean' },
    'max-items': { control: 'number' },
    'min-chars': { control: 'number' },
    required: { control: 'boolean' },
    disabled: { control: 'boolean' },
    'error-text': { control: 'text' },
  },
};

export const Tags = {
  render: (args) => {
    const id = `ci-${++seq}`;
    withProps(id, (el) => { el.options = TAGS; });
    return `<div class="sb-stack"><td-chip-input id="${id}" name="tags[]"${attr('label', args.label)}`
      + `${attr('placeholder', args.placeholder)}${flag('allow-create', args['allow-create'])}`
      + `${flag('show-on-focus', args['show-on-focus'])}${attr('max-items', args['max-items'])}${attr('min-chars', args['min-chars'])}`
      + `${flag('required', args.required)}${flag('disabled', args.disabled)}${attr('error-text', args['error-text'])}`
      + ' value=\'["php","laravel"]\'></td-chip-input>'
      + '<p class="sb-note">Gõ để lọc (không dấu cũng được), ↓/↑ chọn, Enter thêm, Esc đóng / xoá chữ. '
      + 'Backspace hoặc ← ở đầu ô → vào các thẻ; ←/→/Home/End di chuyển, Delete xoá.</p></div>';
  },
  args: {
    label: 'Từ khóa', placeholder: 'Nhập từ khóa…', 'allow-create': true, 'show-on-focus': false, 'max-items': '',
    'min-chars': 1, required: false, disabled: false, 'error-text': '',
  },
};

export const AsyncAuthors = {
  render: () => {
    const id = `ci-${++seq}`;
    withProps(id, (el) => {
      el.search = fakeAuthorSearch;
      // Server-side create (giả lập): returns the stored item, or null to decline.
      el.create = (text) => new Promise((resolve) => {
        setTimeout(() => resolve(text.length < 3 ? null : { value: `new-${Date.now()}`, label: text, description: 'Tác giả mới' }), 400);
      });
      el.renderOption = (item) => {
        const wrap = document.createElement('span');
        const name = document.createElement('span');
        name.textContent = item.label;
        const role = document.createElement('small');
        role.className = 'td-chip-input__option-desc';
        role.textContent = item.description || '';
        wrap.append(name, document.createTextNode(' · '), role);
        return wrap;
      };
      el.addEventListener('search-error', (e) => {
        const note = document.getElementById(`${id}-log`);
        if (note) note.textContent = `search-error: ${e.detail.error.message}`;
      });
    });
    return `<div class="sb-stack"><td-chip-input id="${id}" name="authors[]" label="Tác giả" placeholder="Tìm tác giả…"`
      + ' allow-create show-on-focus search-delay="300"></td-chip-input>'
      + `<p class="sb-note" id="${id}-log">Tìm kiếm giả lập trễ 600 ms (gõ "lỗi" để thử trạng thái lỗi). `
      + 'Phản hồi cũ bị bỏ qua (AbortController + số thứ tự).</p></div>';
  },
};

export const MaxItems = {
  render: () => {
    const id = `ci-${++seq}`;
    withProps(id, (el) => { el.options = TAGS; });
    return `<div class="sb-stack"><td-chip-input id="${id}" label="Tối đa 3 thẻ" max-items="3"`
      + ' value=\'["php","js"]\'></td-chip-input>'
      + '<p class="sb-note">Đạt giới hạn: ô vẫn focus được, không mở gợi ý, trình đọc màn hình được thông báo.</p></div>';
  },
};

export const WithError = {
  render: () => {
    const id = `ci-${++seq}`;
    withProps(id, (el) => { el.options = TAGS; });
    return `<div class="sb-stack"><td-chip-input id="${id}" label="Từ khóa" required`
      + ' error-text="Vui lòng thêm ít nhất một từ khóa"></td-chip-input></div>';
  },
};

export const Disabled = {
  render: () => {
    const id = `ci-${++seq}`;
    withProps(id, (el) => { el.options = TAGS; });
    return `<div class="sb-stack"><td-chip-input id="${id}" label="Từ khóa" disabled value='["php","vue"]'></td-chip-input></div>`;
  },
};

export const InAForm = {
  render: () => {
    const id = `ci-${++seq}`;
    withProps(id, (el) => {
      el.options = TAGS;
      const form = el.closest('form');
      const out = document.getElementById(`${id}-out`);
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!form.reportValidity()) return;
        out.textContent = `tags[] = ${JSON.stringify(new FormData(form).getAll('tags[]'))}`;
      });
    });
    return `<form class="sb-stack"><td-chip-input id="${id}" name="tags[]" label="Từ khóa" required allow-create`
      + ' value=\'["css"]\'></td-chip-input>'
      + '<div class="sb-row"><button type="submit">Gửi</button><button type="reset">Đặt lại</button></div>'
      + `<p class="sb-note" id="${id}-out">Mỗi mục là một giá trị FormData dưới cùng tên (PHP: tags[]).</p></form>`;
  },
};

export const InAModal = {
  render: () => {
    const id = `ci-open-${++seq}`;
    withProps(id, (btn) => {
      btn.addEventListener('click', () => {
        const el = document.createElement('td-chip-input');
        el.setAttribute('label', 'Từ khóa');
        el.setAttribute('allow-create', '');
        el.options = TAGS;
        TdModal.show({ title: 'Gắn thẻ bài viết', body: el, actions: [{ label: 'Xong', variant: 'primary' }] });
      });
    });
    return `<div class="sb-stack"><button type="button" id="${id}">Mở hộp thoại</button>`
      + '<p class="sb-note">Gợi ý nổi trên hộp thoại (LAYERS.popover, nền đặc — không kính chồng kính); '
      + 'Esc chỉ đóng gợi ý trước.</p></div>';
  },
};
