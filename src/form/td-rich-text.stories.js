import { escapeHtml } from '../utils/escape.js';
import './td-rich-text.js';
import '../styles/story-layout.css';

export default {
  title: 'Form/Rich text',
  tags: ['autodocs'],
  argTypes: {
    label: { control: 'text' },
    placeholder: { control: 'text' },
    helperText: { control: 'text' },
    errorText: { control: 'text' },
    features: { control: 'text' },
  },
};

const esc = (v) => escapeHtml(String(v ?? ''));
const opt = (name, v) => (v ? ` ${name}="${esc(v)}"` : '');

/** Preset `comment`: bold, italic, underline, strike, link. Ctrl/⌘ + B / I / U, Ctrl/⌘ + Shift + X, Ctrl/⌘ + K. */
export const Default = {
  render: (args) => `<form class="sb-stack" novalidate>
    <td-rich-text name="comment" label="${esc(args.label)}"${opt('placeholder', args.placeholder)}${opt('helper-text', args.helperText)}${opt('error-text', args.errorText)}${opt('features', args.features)}></td-rich-text>
    <p class="sb-note" id="rt-out">HTML: —</p></form>`,
  args: { label: 'Bình luận', placeholder: 'Viết bình luận…', helperText: 'Shift + Enter để xuống dòng trong đoạn.', errorText: '', features: '' },
  play: ({ canvasElement }) => {
    const out = canvasElement.querySelector('#rt-out');
    canvasElement.querySelector('td-rich-text').addEventListener('input', (e) => {
      out.textContent = `HTML: ${e.detail.value || '(rỗng)'}`;
    });
  },
};

/** Initial value: sanitized on the way in (the script, the onerror and the javascript: link are gone; rel is forced). */
export const WithValue = {
  render: (args) => `<td-rich-text label="${esc(args.label)}" value="${esc(args.value)}"></td-rich-text>`,
  args: {
    label: 'Ghi chú',
    value: '<p><strong>Đậm</strong>, <em>nghiêng</em>, <u>gạch chân</u>, <s>gạch ngang</s> và <a href="https://example.com" target="_top">liên kết</a>.</p>'
      + '<p>Dòng một<br>dòng hai <a href="javascript:steal()">link độc</a><img src="x" onerror="steal()"><script>steal()</script></p>',
  },
};

/** `required` + `maxlength` (code points of the visible text) — the form blocks submit until the value is valid. */
export const RequiredMaxlength = {
  render: (args) => `<form class="sb-stack">
    <td-rich-text name="reply" label="${esc(args.label)}" required maxlength="${esc(args.maxlength)}" helper-text="Tối đa ${esc(args.maxlength)} ký tự."></td-rich-text>
    <div><button type="submit" class="td-btn td-btn--primary td-btn--md">Gửi</button></div></form>`,
  args: { label: 'Trả lời', maxlength: 40 },
};

/** Locked states: readonly (selectable, focusable, toolbar off) and disabled (not focusable, not submitted). */
export const DisabledReadonly = {
  render: () => `<div class="sb-stack">
    <td-rich-text label="Chỉ đọc" readonly value="&lt;p&gt;Nội dung &lt;strong&gt;chỉ đọc&lt;/strong&gt;.&lt;/p&gt;"></td-rich-text>
    <td-rich-text label="Bị khoá" disabled value="&lt;p&gt;Không sửa được.&lt;/p&gt;"></td-rich-text></div>`,
};

/** `link-target="_blank"`: every link gets target="_blank" + rel="nofollow noopener"; `allow-http` accepts http: links. */
export const LinkTargetBlank = {
  render: (args) => `<td-rich-text label="${esc(args.label)}" link-target="_blank"${args.allowHttp ? ' allow-http' : ''} features="bold link"
    value="&lt;p&gt;Xem &lt;a href=&quot;https://example.com&quot;&gt;tài liệu&lt;/a&gt;.&lt;/p&gt;"></td-rich-text>`,
  args: { label: 'Liên kết mở tab mới', allowHttp: false },
};
