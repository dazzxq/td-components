import { escapeHtml } from '../utils/escape.js';
import { createMockAdapter } from '../../test/fixtures/media-adapter.js';
import './td-media-gallery.js';
import '../styles/story-layout.css';

export default {
  title: 'Form/Media gallery',
  tags: ['autodocs'],
  argTypes: {
    label: { control: 'text' },
    helperText: { control: 'text' },
    errorText: { control: 'text' },
    required: { control: 'boolean' },
    disabled: { control: 'boolean' },
  },
};

const esc = (v) => escapeHtml(String(v ?? ''));
// One mock adapter (no network): images from /lightbox/{1..4}.svg (Storybook static dir).
const adapter = createMockAdapter({ base: '/lightbox/', latency: 250 });
let seq = 0;
const ITEMS = [1, 2, 3, 4, 5].map((i) => ({ id: `m${i}`, src: `/lightbox/${((i - 1) % 4) + 1}.svg`, name: `anh-${i}.jpg` }));

/**
 * A gallery + an event log. The adapter is assigned AFTER render (a property, never markup); `items` is JSON in the
 * attribute (escaped).
 * @param {string} attrs extra host attributes (already escaped)
 * @param {object[]} items
 * @param {{ label?: string, helperText?: string, errorText?: string, required?: boolean, disabled?: boolean }} args
 */
function gallery(attrs, items, args = {}) {
  const id = `mg-story-${++seq}`;
  const a = [
    'name="gallery"',
    args.label ? `label="${esc(args.label)}"` : '',
    args.helperText ? `helper-text="${esc(args.helperText)}"` : '',
    args.errorText ? `error-text="${esc(args.errorText)}"` : '',
    args.required ? 'required' : '',
    args.disabled ? 'disabled' : '',
    items.length ? `items="${esc(JSON.stringify(items))}"` : '',
    attrs,
  ].filter(Boolean).join(' ');
  setTimeout(() => {
    const el = document.getElementById(id);
    const out = document.getElementById(`${id}-out`);
    if (!el) return;
    el.adapter = adapter;
    el.addEventListener('change', (e) => {
      if (out) out.textContent = `change (${e.detail.reason}) → value = ${JSON.stringify(el.value)} · FormData: ${JSON.stringify([...new FormData(el.closest('form'))])}`;
    });
  }, 0);
  return `<form class="sb-stack" novalidate><td-media-gallery id="${id}" ${a}></td-media-gallery>
    <p class="sb-note" id="${id}-out">Thêm / gỡ / kéo để sắp lại để xem event change + FormData.</p></form>`;
}

/** Empty: the big "Chọn ảnh" frame; the picker opens in multiple mode (room left = max). */
export const Empty = {
  render: (args) => gallery('max="8" aspect-ratio="4/3"', [], args),
  args: { label: 'Ảnh sản phẩm', helperText: 'Tối đa 8 ảnh, ảnh đầu là ảnh bìa', errorText: '', required: false, disabled: false },
};

/** Reference shape (name[]=id): drag the handle, tap-to-move or Space + arrows to reorder. */
export const Reorder = {
  render: (args) => gallery('max="8" cover', ITEMS, args),
  args: { label: 'Ảnh bài viết' },
};

/** Usage shape (name[i][id|alt|crop|focal]): alt per image, "Cắt" per image (crop / focal coordinates only). */
export const UsageCrop = {
  render: (args) => gallery('usage croppable focal-point cover crop-ratio="1:1" max="6"', ITEMS.slice(0, 3), args),
  args: { label: 'Gallery sản phẩm' },
};

/** v0.51.0: caption per image (one line: a pasted line break becomes a space) — name[i][caption] after [alt]. */
export const CaptionLine = {
  render: (args) => gallery('usage caption max="6"', ITEMS.slice(0, 3).map((x, i) => (i === 0 ? { ...x, alt: 'Áo thun trắng', caption: 'Mặt trước' } : x)), args),
  args: { label: 'Gallery có chú thích' },
};

/** v0.51.0: multi-line caption (textarea, line breaks kept). */
export const CaptionMultiline = {
  render: (args) => gallery('usage caption="multiline" max="6"', ITEMS.slice(0, 3).map((x, i) => (i === 0 ? { ...x, caption: 'Dòng 1\nDòng 2' } : x)), args),
  args: { label: 'Chú thích nhiều dòng' },
};

/** v0.51.0: soft limits (dsuite: alt ≤ 255, caption ≤ 500 — small here): counter from 80 %, inline error, submit blocked, never cut. */
export const CaptionLimits = {
  render: (args) => gallery('usage caption alt-maxlength="20" caption-maxlength="24" max="6"', ITEMS.slice(0, 3).map((x, i) => [
    { ...x, alt: 'Áo thun trắng cổ tròn', caption: 'Mặt trước, nền trắng' },
    { ...x, alt: 'Áo', caption: 'Chú thích này dài quá giới hạn của ô' },
    x][i]), args),
  args: { label: 'Giới hạn độ dài' },
};

/** Full: Add hidden, the count says "Đã đủ". */
export const Full = {
  render: (args) => gallery('max="5"', ITEMS, args),
  args: { label: 'Đủ ảnh' },
};

/** Server printed more than max: every image kept + shown, nothing submitted until Gỡ brings it back to max. */
export const Overflow = {
  render: (args) => gallery('max="3"', ITEMS, args),
  args: { label: 'Vượt giới hạn' },
};

/** Broken items (duplicate ids): fail closed — nothing submitted, the server keeps its data. */
export const Broken = {
  render: (args) => gallery('', [{ id: 'm1' }, { id: 'm1' }], args),
  args: { label: 'Dữ liệu hỏng' },
};
