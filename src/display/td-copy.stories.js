import { escapeHtml } from '../utils/escape.js';
import './td-copy.js';
import '../styles/story-layout.css';

export default {
  title: 'Display/Copy',
  tags: ['autodocs'],
  argTypes: {
    label: { control: 'text' },
    value: { control: 'text' },
    size: { control: 'select', options: ['md', 'sm'] },
  },
};

const esc = (v) => escapeHtml(String(v ?? ''));

/** One icon button: copy → check for 2 s, "Đã copy" announced. The value comes from the server-written <code>. */
export const Default = {
  render: (args) => `<div class="sb-row">
    <span>Mã khôi phục: <strong>${esc(args.value)}</strong></span>
    <td-copy label="${esc(args.label)}" size="${esc(args.size)}"><code class="td-copy__source">${esc(args.value)}</code></td-copy>
    <span class="sb-note" id="cp-out"></span></div>`,
  args: { label: 'Copy mã khôi phục', value: 'ABCD-1234-EFGH', size: 'md' },
  play: ({ canvasElement }) => {
    const out = canvasElement.querySelector('#cp-out');
    canvasElement.addEventListener('copy-success', () => { out.textContent = 'copy-success'; });
    canvasElement.addEventListener('copy-error', () => { out.textContent = 'copy-error (đã chọn sẵn để Ctrl/⌘+C)'; });
  },
};

/** `for="id"`: copy the value of a field / the text of an element on the page. */
export const ForElement = {
  render: () => `<div class="sb-stack">
    <div class="sb-row"><input id="cp-req" class="td-field__control" value="req_01HZX9K2" readonly><td-copy for="cp-req" label="Copy request ID"></td-copy></div>
    <div class="sb-row"><span id="cp-evt">evt_7f3a91</span><td-copy for="cp-evt" size="sm" label="Copy event ID"></td-copy></div></div>`,
};

/** Clipboard refused (simulated for this story only): the value is selected in a read-only field + manual hint. */
export const ClipboardError = {
  render: (args) => `<div class="sb-row" id="cp-err-wrap"><td-copy label="Copy" value="${esc(args.value)}"></td-copy>
    <span class="sb-note">Bấm để xem đường dự phòng khi trình duyệt từ chối clipboard.</span></div>`,
  args: { value: 'MANUAL-COPY-42' },
  play: ({ canvasElement }) => {
    const wrap = canvasElement.querySelector('#cp-err-wrap');
    let saved = null;
    wrap.addEventListener('click', () => {
      saved = Object.getOwnPropertyDescriptor(navigator, 'clipboard') || null;
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true, value: { writeText: () => Promise.reject(new DOMException('denied', 'NotAllowedError')) },
      });
    }, true);
    wrap.addEventListener('click', () => {
      if (saved) Object.defineProperty(navigator, 'clipboard', saved);
      else delete navigator.clipboard;
    });
  },
};

/** SSR (`copy@1`): the markup php/td.php td_copy() prints — without JS the <code> shows, with JS the button. */
export const ServerRendered = {
  render: (args) => `<td-copy data-td-ssr="copy@1" label="${esc(args.label)}" size="md"><code class="td-copy__source">${esc(args.value)}</code><button type="button" class="td-copy td-copy--md" aria-label="${esc(args.label)}" data-tooltip="${esc(args.label)}"><span class="td-copy__icon" data-td-icon="copy" aria-hidden="true"></span></button><span class="td-copy__status" role="status"></span></td-copy>`,
  args: { label: 'Copy', value: 'SSR-VALUE-1' },
};
