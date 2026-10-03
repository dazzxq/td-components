import { escapeHtml } from '../utils/escape.js';
import { createMockAdapter } from '../../test/fixtures/media-adapter.js';
import './td-media-field.js';
import '../styles/story-layout.css';

export default {
  title: 'Form/Media field',
  tags: ['autodocs'],
  argTypes: {
    label: { control: 'text' },
    prompt: { control: 'text' },
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

/**
 * A field + an event log. The adapter is assigned AFTER render (a property, never markup); nothing opens on render.
 * @param {string} attrs extra host attributes (already escaped)
 * @param {{ label?: string, prompt?: string, helperText?: string, errorText?: string, required?: boolean, disabled?: boolean }} args
 */
function field(attrs, args = {}) {
  const id = `mf-story-${++seq}`;
  const a = [
    'name="hero"',
    args.label ? `label="${esc(args.label)}"` : '',
    args.prompt ? `prompt="${esc(args.prompt)}"` : '',
    args.helperText ? `helper-text="${esc(args.helperText)}"` : '',
    args.errorText ? `error-text="${esc(args.errorText)}"` : '',
    args.required ? 'required' : '',
    args.disabled ? 'disabled' : '',
    attrs,
  ].filter(Boolean).join(' ');
  setTimeout(() => {
    const el = document.getElementById(id);
    const out = document.getElementById(`${id}-out`);
    if (!el) return;
    el.adapter = adapter;
    el.addEventListener('change', () => {
      if (out) out.textContent = `change → value = "${el.value}" · FormData: ${JSON.stringify([...new FormData(el.closest('form'))])}`;
    });
  }, 0);
  return `<form class="sb-stack" novalidate><td-media-field id="${id}" ${a}></td-media-field>
    <p class="sb-note" id="${id}-out">Chọn / đổi / gỡ để xem event change + FormData.</p></form>`;
}

/** Empty 3:2 frame: the ratio text shows on the empty frame; click opens the picker (single). */
export const Empty = {
  render: (args) => field('aspect-ratio="3/2"', args),
  args: { label: 'Ảnh đại diện', prompt: '', helperText: 'JPG, PNG — tối đa 5 MB', errorText: '', required: false, disabled: false },
};

/** Filled (server data: value + preview-src + preview-alt): Đổi ảnh re-opens with initialIds = [value]; Gỡ clears. */
export const Filled = {
  render: (args) => field('aspect-ratio="3/2" value="m1" preview-src="/lightbox/1.svg" preview-alt="anh-1.jpg"', args),
  args: { label: 'Ảnh bìa' },
};

/** preview-fit="contain": the whole image fits inside a 1:1 frame (logos). */
export const Contain = {
  render: (args) => field('aspect-ratio="1/1" preview-fit="contain" value="m2" preview-src="/lightbox/2.svg" preview-alt="logo.png"', args),
  args: { label: 'Logo' },
};

/** No aspect-ratio (dcms2 freeStyle): empty = --td-media-field-empty-h; filled = the image's natural ratio. */
export const NoRatio = {
  render: (args) => field('value="m3" preview-src="/lightbox/3.svg" preview-alt="anh-3.jpg"', args),
  args: { label: 'Ảnh tự do' },
};

/** Open Graph 1.91 → "1.91:1". */
export const OpenGraph = {
  render: (args) => field('aspect-ratio="1.91"', args),
  args: { label: 'Ảnh chia sẻ (OG)' },
};

/** Video = poster only + "Video" badge (no player in the field). */
export const Video = {
  render: (args) => field('aspect-ratio="16/9" accept-kind="video" kind="video" value="m4" preview-src="/lightbox/4.svg" preview-alt="video-4.mp4"', args),
  args: { label: 'Video giới thiệu' },
};

/** usage: submits hero[id] / hero[alt] / hero[crop] (crop kept byte-identical, null once the image changes). */
export const Usage = {
  render: (args) => field('usage aspect-ratio="3/2" value="m1" preview-src="/lightbox/1.svg" preview-alt="anh-1.jpg" alt="Ảnh mẫu 1"'
    + ` crop="${esc('{"v":1,"x":0.1,"y":0,"width":0.8,"height":1}')}"`, args),
  args: { label: 'Ảnh trong bài' },
};

/** disabled: buttons + alt disabled, nothing submitted. */
export const Disabled = {
  render: (args) => field('usage aspect-ratio="3/2" value="m2" preview-src="/lightbox/2.svg" preview-alt="anh-2.jpg"', args),
  args: { label: 'Bị khoá', disabled: true },
};

/** Error contract (`error-text` / setError) + required. */
export const WithError = {
  render: (args) => field('aspect-ratio="3/2"', args),
  args: { label: 'Ảnh bắt buộc', required: true, errorText: 'Vui lòng chọn ảnh.' },
};

/** SSR (`media-field@1`): the markup php/td.php td_media_field('hero', 'm1', [...usage...]) prints — adopted in place. */
export const ServerRendered = {
  render: (args) => {
    const label = esc(args.label);
    setTimeout(() => { const el = document.getElementById('mf-ssr'); if (el) el.adapter = adapter; }, 0);
    return `<form class="sb-stack" novalidate><td-media-field data-td-ssr="media-field@1" id="mf-ssr" class="td-media-field" name="hero" label="${label}" aspect-ratio="3/2" usage value="m1" preview-src="/lightbox/1.svg" preview-alt="anh-1.jpg">`
      + `<span class="td-media-field__label" id="mf-ssr-label">${label}</span>`
      + '<div class="td-media-field__frame" data-state="filled" data-kind="image"><svg class="td-media-field__sizer" viewBox="0 0 3 2" aria-hidden="true" focusable="false"></svg>'
      + '<button type="button" class="td-media-field__open" aria-haspopup="dialog" aria-labelledby="mf-ssr-label mf-ssr-state">'
      + '<img class="td-media-field__img" src="/lightbox/1.svg" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">'
      + '<span class="td-sr-only" id="mf-ssr-state">Đã chọn: anh-1.jpg</span></button></div>'
      + '<div class="td-media-field__actions"><button type="button" class="td-btn td-btn--secondary td-btn--sm td-media-field__replace" aria-haspopup="dialog">Đổi ảnh</button>'
      + '<button type="button" class="td-btn td-btn--ghost td-btn--sm td-media-field__remove">Gỡ</button></div>'
      + '<input type="hidden" class="td-media-field__value" name="hero[id]" value="m1">'
      + '<div class="td-field td-media-field__usage"><label class="td-field__label" for="mf-ssr-alt">Mô tả ảnh (alt)</label>'
      + '<input type="text" class="td-field__control td-media-field__alt" id="mf-ssr-alt" maxlength="500" name="hero[alt]"></div>'
      + '<input type="hidden" class="td-media-field__crop" name="hero[crop]" value="null"></td-media-field></form>';
  },
  args: { label: 'Ảnh (SSR)' },
};
