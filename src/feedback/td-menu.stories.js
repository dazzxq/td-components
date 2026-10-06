import { TdMenu } from './td-menu.js';
import { TdModal } from './td-modal.js';
import { TdLightbox } from './td-lightbox.js';
import { escapeHtml } from '../utils/escape.js';
import '../form/td-choice-group.js';
import '../form/td-input-field.js';
import '../form/td-button.js';
import '../styles/story-layout.css';

export default {
  title: 'Feedback/Menu',
  tags: ['autodocs'],
  args: { label: 'Tùy chọn', hint: 'Chỉ quản trị viên' },
  argTypes: {
    label: { control: 'text', description: 'Nhãn nút mở menu (văn bản)' },
    hint: { control: 'text', description: 'Dòng phụ của mục bị khoá (văn bản)' },
  },
};

const out = (root, id) => root.querySelector(`#${id}`);
const say = (root, id, text) => { const o = out(root, id); if (o) o.textContent = text; };

/** "···" button from TdMenu.button() (icon-only → aria-label "Tùy chọn"); items built lazily at open. */
export const MoreButton = {
  name: 'Nút "···"',
  render: () => `<div class="sb-stack"><div class="sb-row" id="mn-more"></div>
    <p class="sb-note" id="mn-more-out">Bấm nút hoặc Tab tới rồi nhấn ↓ / ↑. Esc đóng; Tab đóng và đi tiếp.</p></div>`,
  play: ({ canvasElement }) => {
    const btn = TdMenu.button({
      getItems: () => [
        { label: 'Sao chép liên kết', icon: 'link', onSelect: () => say(canvasElement, 'mn-more-out', 'Đã sao chép.') },
        { label: 'Tải xuống', icon: 'download', onSelect: () => say(canvasElement, 'mn-more-out', 'Đang tải…') },
        { separator: true },
        { label: 'Báo cáo', danger: true, onSelect: () => say(canvasElement, 'mn-more-out', 'Đã gửi báo cáo.') },
      ],
    });
    out(canvasElement, 'mn-more').append(btn);
  },
};

/** A site's own button bound with TdMenu.bind(); danger item, disabled item with a hint, hint on an enabled item. */
export const DangerDisabledHint = {
  name: 'Nguy hiểm / khoá / gợi ý',
  render: (args) => `<div class="sb-stack">
    <button type="button" class="td-menu-btn" id="mn-dh"><span class="td-menu-btn__label">${escapeHtml(args.label)}</span></button>
    <p class="sb-note" id="mn-dh-out">Mục bị khoá vẫn nhận focus bằng phím mũi tên nhưng không kích hoạt được.</p></div>`,
  play: ({ canvasElement, args }) => {
    TdMenu.bind(out(canvasElement, 'mn-dh'), () => [
      { label: 'Tải ảnh gốc', hint: 'JPEG · 4,2 MB', onSelect: () => say(canvasElement, 'mn-dh-out', 'Tải ảnh gốc.') },
      { label: 'Chuyển vào kho lưu trữ', hint: String(args?.hint ?? ''), disabled: true },
      { separator: true },
      { label: 'Xoá bài viết', danger: true, onSelect: () => say(canvasElement, 'mn-dh-out', 'Đã xoá (giả lập).') },
    ], { align: 'start' });
  },
};

/** Radio group (closes on pick) + checkbox (stays open) — plain buttons with aria-checked, no nested controls. */
export const Checkable = {
  name: 'Chọn một / bật tắt',
  render: () => `<div class="sb-stack"><div class="sb-row" id="mn-chk"></div><p class="sb-note" id="mn-chk-out"></p></div>`,
  play: ({ canvasElement }) => {
    const items = [
      { label: 'Mới nhất', group: 'sort', checked: true },
      { label: 'Cũ nhất', group: 'sort', checked: false },
      { label: 'Nhiều tương tác', group: 'sort', checked: false },
      { separator: true },
      { label: 'Chỉ hiện bài có ảnh', type: 'checkbox', checked: false },
    ];
    for (const it of items) {
      if (!it.separator) it.onSelect = (ctx) => say(canvasElement, 'mn-chk-out', `${ctx.item.label}: ${ctx.checked ? 'bật' : 'tắt'}`);
    }
    out(canvasElement, 'mn-chk').append(TdMenu.button({ label: 'Sắp xếp', icon: 'sort', items }));
  },
};

/** Real links: middle-click / new tab work. Only http(s)/relative; anything else (e.g. `javascript:`) becomes a disabled item. */
export const Links = {
  name: 'Liên kết',
  render: () => `<div class="sb-row" id="mn-links"></div>`,
  play: ({ canvasElement }) => {
    out(canvasElement, 'mn-links').append(TdMenu.button({
      label: 'Liên kết',
      icon: 'external',
      items: [
        { label: 'Trang chủ', href: '#' },
        { label: 'Mở tài liệu (tab mới)', href: 'https://developer.mozilla.org/', newTab: true, icon: 'external' },
        { label: 'Gửi thư hỗ trợ', icon: 'link', onSelect: () => { window.location.href = 'mailto:hotro@example.com'; } },
        { label: 'Liên kết không an toàn', href: 'javascript:alert(1)' },
      ],
    }));
  },
};

/**
 * Option registry (G9): the core defines "post-actions"; a "plugin" registers an extra option (its own group) without
 * touching the core. Triggers are declarative (`data-td-menu` + `data-td-menu-*` context), wired by TdMenu.bindAll().
 */
let pluginUnregister = null; // module scope: a story re-render must not register the plugin twice
export const Registry = {
  name: 'Đăng ký tuỳ chọn (plugin)',
  render: () => `<div class="sb-stack" id="mn-reg">
    <div class="sb-row">
      <button type="button" class="td-menu-btn" data-td-menu="sb-post-actions" data-td-menu-post-id="101" data-td-menu-owner="toi">
        <span class="td-menu-btn__label">Bài 101 (của tôi)</span></button>
      <button type="button" class="td-menu-btn" data-td-menu="sb-post-actions" data-td-menu-post-id="202" data-td-menu-owner="khac">
        <span class="td-menu-btn__label">Bài 202 (người khác)</span></button>
    </div>
    <label class="sb-row"><input type="checkbox" id="mn-reg-plugin" checked> Bật plugin "Lưu để đọc sau"</label>
    <p class="sb-note" id="mn-reg-out">"Sửa" / "Xoá" chỉ hiện với bài của tôi (when). Plugin thêm một mục ở nhóm riêng.</p></div>`,
  play: ({ canvasElement }) => {
    const root = out(canvasElement, 'mn-reg');
    const log = (text) => say(canvasElement, 'mn-reg-out', text);
    const mine = (ctx) => ctx.owner === 'toi';
    // core (e.g. the post module)
    TdMenu.define('sb-post-actions', [
      { label: 'Sao chép liên kết', icon: 'link', onSelect: (ctx) => log(`Đã chép liên kết bài ${ctx.postId}.`) },
      { label: 'Sửa', when: mine, onSelect: (ctx) => log(`Sửa bài ${ctx.postId}.`) },
      { separator: true },
      { label: 'Xoá', danger: true, when: mine, onSelect: (ctx) => log(`Xoá bài ${ctx.postId} (giả lập).`) },
    ]);
    // plugin (another module / the site)
    const plug = (on) => {
      pluginUnregister?.();
      pluginUnregister = on
        ? TdMenu.register('sb-post-actions', {
          label: 'Lưu để đọc sau', icon: 'star', onSelect: (ctx) => log(`Đã lưu bài ${ctx.postId}.`),
        }, { group: 'reading-list' })
        : null;
    };
    plug(true);
    out(canvasElement, 'mn-reg-plugin').addEventListener('change', (e) => plug(e.target.checked));
    TdMenu.bindAll(root);
  },
};

/** Inside a TdModal: Escape closes only the menu; Tab stays in the dialog. */
export const InModal = {
  name: 'Trong modal',
  render: () => `<div class="sb-stack"><button type="button" class="td-btn td-btn--primary" id="mn-modal">
    <span class="td-btn__label">Mở modal</span></button></div>`,
  play: ({ canvasElement }) => {
    out(canvasElement, 'mn-modal').addEventListener('click', () => {
      const body = document.createElement('div');
      body.className = 'sb-row';
      const input = document.createElement('input');
      input.setAttribute('aria-label', 'Tiêu đề');
      const menuBtn = TdMenu.button({
        items: [{ label: 'Nhân bản' }, { label: 'Đổi tên' }, { separator: true }, { label: 'Xoá', danger: true }],
      });
      body.append(input, menuBtn);
      TdModal.show({ title: 'Sửa mục', body, actions: [{ label: 'Đóng' }] });
    });
  },
};

/** 135 recipe: a lightbox toolbar button opens a download menu (the anchor is owned by the lightbox). */
export const LightboxToolbar = {
  name: 'Từ thanh công cụ lightbox',
  render: () => `<div class="sb-stack"><button type="button" class="td-btn td-btn--secondary" id="mn-lb">
    <span class="td-btn__label">Mở lightbox</span></button></div>`,
  play: ({ canvasElement }) => {
    out(canvasElement, 'mn-lb').addEventListener('click', () => {
      TdLightbox.open([1, 2].map((n) => ({ src: `/lightbox/${n}.svg`, caption: `Ảnh ${n}` })), {
        toolbar: [{
          id: 'download-menu',
          label: 'Tải xuống',
          icon: 'download',
          onClick: (ctx, b) => TdMenu.open(b, [
            { label: 'Ảnh gốc', hint: 'Đầy đủ độ phân giải', href: ctx.item.src },
            { label: 'Bản nhỏ', hint: 'Tối đa 1280 px', href: ctx.item.src },
          ]),
        }],
      });
    });
  },
};

const THEMES = [{ value: 'auto', label: 'Tự động', icon: 'monitor' }, { value: 'light', label: 'Sáng', icon: 'sun' },
  { value: 'dark', label: 'Tối', icon: 'moon' }];

/**
 * v0.53.0 (ADR 0026): an account menu with custom rows — a static header, the theme switcher (td-choice-group
 * segmented: ← → switch at once, the menu stays open), sign out. The theme applies to this story's preview only.
 */
export const AccountMenu = {
  name: 'Menu tài khoản (mục tuỳ biến)',
  render: () => `<div class="sb-stack"><button type="button" class="td-btn td-btn--secondary" id="mn-acc">
    <span class="td-btn__label">Nguyễn Văn An</span></button>
    <p class="sb-note" id="mn-acc-out">↓ tới "Giao diện", ← → đổi theme ngay; Tab đi qua mọi điểm dừng; Esc đóng.</p></div>`,
  play: ({ canvasElement }) => {
    const root = canvasElement.closest('[data-td-theme]') || document.documentElement;
    const current = () => (THEMES.some((t) => t.value === root.getAttribute('data-td-theme')) ? root.getAttribute('data-td-theme') : 'auto');
    TdMenu.bind(out(canvasElement, 'mn-acc'), () => [
      { type: 'custom', id: 'who', render: () => {
        const d = document.createElement('div');
        d.className = 'sb-note';
        d.textContent = 'an.nguyen@example.com';
        return d;
      } },
      { separator: true },
      { label: 'Hồ sơ', onSelect: () => say(canvasElement, 'mn-acc-out', 'Mở hồ sơ.') },
      { separator: true },
      { type: 'custom', id: 'theme', label: 'Giao diện', render: ({ signal }) => {
        const g = document.createElement('td-choice-group');
        g.setAttribute('variant', 'segmented');
        g.setAttribute('size', 'sm');
        g.setAttribute('value', current());
        g.options = THEMES;
        g.addEventListener('change', (e) => {
          root.setAttribute('data-td-theme', e.detail.value);
          say(canvasElement, 'mn-acc-out', `Giao diện: ${e.detail.option.label}.`);
        }, { signal });
        return g;
      } },
      { separator: true },
      { label: 'Đăng xuất', icon: 'log-out', danger: true, onSelect: () => say(canvasElement, 'mn-acc-out', 'Đã đăng xuất (giả lập).') },
    ], { label: 'Tài khoản', align: 'start' });
  },
};

/** v0.53.0: a small form in a custom row, cloned from a <template> (no HTML strings); Lưu closes via ctx.close(). */
export const QuickForm = {
  name: 'Form nhỏ trong menu',
  render: () => `<div class="sb-stack"><button type="button" class="td-btn td-btn--secondary" id="mn-form">
    <span class="td-btn__label">Ghi chú nhanh</span></button>
    <template id="mn-form-tpl"><form class="sb-stack"><td-input-field label="Ghi chú" name="note"></td-input-field>
      <td-button type="submit" variant="primary" size="sm">Lưu</td-button></form></template>
    <p class="sb-note" id="mn-form-out"></p></div>`,
  play: ({ canvasElement }) => {
    const tpl = out(canvasElement, 'mn-form-tpl');
    TdMenu.bind(out(canvasElement, 'mn-form'), () => [
      { type: 'custom', label: 'Ghi chú cho đơn DH10240', render: ({ close, signal }) => {
        const form = document.importNode(tpl.content, true).firstElementChild;
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          say(canvasElement, 'mn-form-out', `Đã lưu: ${new FormData(form).get('note') || '(trống)'}`);
          close();
        }, { signal });
        return form;
      } },
      { separator: true },
      { label: 'Xem lịch sử ghi chú' },
    ], { align: 'start' });
  },
};
