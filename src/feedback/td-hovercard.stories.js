import { TdHovercard } from './td-hovercard.js';
import { escapeHtml } from '../utils/escape.js';
import '../styles/story-layout.css';

export default {
  title: 'Feedback/Hovercard',
  tags: ['autodocs'],
  args: { label: 'Nguyễn Thị Lan', hint: 'Biên tập viên · Hà Nội' },
  argTypes: {
    label: { control: 'text', description: 'Chữ trên trigger — cũng là tên truy cập của thẻ khi không có nhãn riêng (văn bản)' },
    hint: { control: 'text', description: 'Dòng mô tả trong thẻ (văn bản, dựng bằng DOM)' },
  },
};

const out = (root, id) => root.querySelector(`#${id}`);
const NOTE = 'Rê chuột lên tên (350 ms) hoặc Tab tới. Tab đi vào thẻ, Tab ở liên kết cuối thì đóng và đi tiếp; Esc đóng.';

/** Profile card built with DOM APIs only: every value is text. */
function profileNode(name, hint) {
  const wrap = document.createElement('div');
  wrap.className = 'sb-stack';
  const strong = document.createElement('strong');
  strong.textContent = name;
  const p = document.createElement('span');
  p.textContent = hint;
  const row = document.createElement('div');
  row.className = 'sb-row';
  for (const [text, href] of [['Xem hồ sơ', '#ho-so'], ['Nhắn tin', '#nhan-tin']]) {
    const a = document.createElement('a');
    a.href = href;
    a.textContent = text;
    row.append(a);
  }
  wrap.append(strong, p, row);
  return wrap;
}

/** (a) JS hook: content(trigger) returns a Node (preferred over an HTML string). */
export const NodeContent = {
  name: 'Nội dung là Node',
  render: (args) => `<div class="sb-stack">
    <p>Bài viết của <a href="#tac-gia" id="hc-node">${escapeHtml(args.label)}</a> đăng lúc 9:00.</p>
    <p class="sb-note">${escapeHtml(NOTE)}</p></div>`,
  play: ({ canvasElement, args }) => {
    const t = out(canvasElement, 'hc-node');
    TdHovercard.bind(t, { content: () => profileNode(String(args?.label ?? ''), String(args?.hint ?? '')) });
  },
};

/** (b) Declarative <template> (SSR-friendly): the server renders + escapes it; bindAll() clones it on open. */
export const TemplateContent = {
  name: 'Nội dung từ <template>',
  render: (args) => `<div class="sb-stack" id="hc-tpl-root">
    <p>Người duyệt: <a href="#nguoi-duyet" data-td-hovercard-template="hc-tpl-user"
      data-td-hovercard-label="Hồ sơ ${escapeHtml(args.label)}">${escapeHtml(args.label)}</a></p>
    <template id="hc-tpl-user"><strong>${escapeHtml(args.label)}</strong>
      <p>${escapeHtml(args.hint)}</p><a href="#tat-ca">Tất cả bài đã duyệt</a></template>
    <p class="sb-note">Trigger khai báo bằng <code>data-td-hovercard-template</code>; gọi <code>TdHovercard.bindAll(root)</code> một lần.</p></div>`,
  play: ({ canvasElement }) => {
    TdHovercard.bindAll(out(canvasElement, 'hc-tpl-root'));
  },
};

// (c) URL fragment. The story never touches the network: requests under STUB_PATH are answered locally.
const STUB_PATH = '/__td-story/hovercard/';
let stubbed = false;
function installStub() {
  if (stubbed || typeof window === 'undefined' || typeof window.fetch !== 'function') return;
  stubbed = true;
  const real = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    if (!url.pathname.startsWith(STUB_PATH)) return real(input, init);
    const id = url.pathname.slice(STUB_PATH.length);
    return new Promise((resolve) => {
      setTimeout(() => {
        if (id === 'loi') {
          resolve(new Response('{}', { status: 500, headers: { 'content-type': 'application/json' } }));
          return;
        }
        // A same-origin endpoint returns server-escaped markup: { "html": "…" } (dwp contract).
        const html = '<strong>Trần Minh</strong><p>Phóng viên ảnh · 128 bài</p><a href="#minh">Xem hồ sơ</a>';
        resolve(new Response(JSON.stringify({ html }), { headers: { 'content-type': 'application/json' } }));
      }, 600);
    });
  };
}

export const UrlContent = {
  name: 'Nội dung tải từ URL',
  render: () => `<div class="sb-stack" id="hc-url-root">
    <p><a href="#minh" data-td-hovercard="${STUB_PATH}minh">Trần Minh</a> (tải lần đầu có trạng thái “Đang tải…”, sau đó lấy từ cache)</p>
    <p><a href="#loi" data-td-hovercard="${STUB_PATH}loi">Liên kết lỗi</a> (máy chủ trả 500 → trạng thái lỗi)</p>
    <p class="sb-note">Chỉ URL cùng origin (JSON <code>{ html }</code> hoặc text/html). Chuỗi HTML là nội dung TIN CẬY — máy chủ phải escape.</p></div>`,
  play: ({ canvasElement }) => {
    installStub();
    TdHovercard.bindAll(out(canvasElement, 'hc-url-root'));
  },
};
