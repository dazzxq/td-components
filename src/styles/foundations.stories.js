import './foundations.stories.css';
import '../icons/td-icon-element.js';
import '../form/td-button.js';

/**
 * Foundations — surface recipes from td.css (v0.20.0 minimal surfaces, docs/internal/design/liquid-glass.md):
 * background + one thin border + one soft shadow, blur(12px) only on small popups; buttons solid.
 * Controls: `glass` toggles <html data-td-glass="off"> (the manual reduce-transparency switch);
 * `theme` toggles <html data-td-theme="dark"> (dark is opt-in only).
 */
export default {
  title: 'Foundations/Surfaces',
  argTypes: {
    glass: { control: 'inline-radio', options: ['on', 'off'] },
    theme: { control: 'inline-radio', options: ['light', 'dark'] },
  },
  args: { glass: 'on', theme: 'light' },
  decorators: [
    (story, ctx) => {
      const root = document.documentElement;
      if (ctx.args.glass === 'off') root.setAttribute('data-td-glass', 'off');
      else root.removeAttribute('data-td-glass');
      if (ctx.args.theme === 'dark') root.setAttribute('data-td-theme', 'dark');
      else root.removeAttribute('data-td-theme');
      return story();
    },
  ],
};

const LOREM = `
  <p>Minimal surfaces: mỗi bề mặt nổi chỉ gồm nền, một viền mảnh và một bóng mềm. Chỉ popup nhỏ (menu,
  dropdown, gợi ý, hovercard, toast) có thêm blur 12px trên nền 94%. Modal, tooltip, thẻ loading và nút
  cuộn lên đầu là nền đặc. Nút luôn là màu đặc.</p>
  <p>Khi bật Reduce Transparency, Increase Contrast hoặc trình duyệt không có backdrop-filter, bề mặt
  chuyển sang nền đặc qua token riêng tư — site không thể vô tình tắt các fallback này.</p>`;

export const Regular = {
  render: () => `
    <div class="fd-stage fd-text">
      ${LOREM}${LOREM}
      <div class="fd-float fd-float--bottom">
        <div class="fd-group td-glass-surface">
          <button class="fd-btn" type="button" aria-label="Quay lại"><td-icon name="back"></td-icon></button>
          <button class="fd-btn" type="button">Chia sẻ</button>
        </div>
        <!-- .td-glass-tint = a solid capsule next to the bar. -->
        <button class="td-glass-tint" type="button">Lưu</button>
      </div>
    </div>`,
};

export const StrongLarge = {
  name: 'Strong + Large (text surface)',
  render: () => `
    <div class="fd-stage fd-text">
      ${LOREM}
      <div class="fd-card td-glass-surface td-glass-surface--strong td-glass-surface--lg" role="dialog" aria-label="Ví dụ">
        <strong>Bề mặt nhiều chữ</strong>
        <p>Popup nhỏ dùng Strong (94% + blur 12px); Large chỉ đổi sang bóng sâu hơn.</p>
      </div>
    </div>`,
};

export const ClearOverMedia = {
  name: 'Clear over media (lightbox bar)',
  render: () => `
    <div class="fd-stage fd-stage--photo">
      <div class="fd-float fd-float--top td-glass-surface td-glass-surface--clear">
        <button class="fd-btn" type="button" aria-label="Đóng"><td-icon name="close"></td-icon></button>
        <button class="fd-btn" type="button" aria-label="Phóng to"><td-icon name="fullscreen"></td-icon></button>
        <button class="fd-btn" type="button" aria-label="Tải xuống"><td-icon name="download"></td-icon></button>
      </div>
    </div>`,
};

export const ClearWithText = {
  name: 'Clear + text label',
  render: () => `
    <div class="fd-stage fd-stage--photo">
      <div class="fd-float fd-float--bottom td-glass-surface td-glass-surface--clear">
        <span class="fd-btn">3 / 12 · Đà Lạt, 2024</span>
      </div>
    </div>`,
};

/**
 * v0.20.0 minimal surfaces over a busy, colourful backdrop: solid buttons, a blurred menu panel, neutral toasts
 * (the semantic colour is on the icon in the real component).
 */
export const Showcase = {
  render: () => {
    const wrap = document.createElement('div');
    wrap.className = 'fd-show fd-stage--photo';
    const col = (title) => {
      const c = document.createElement('div');
      c.className = 'fd-show__col';
      const h = document.createElement('p');
      h.className = 'fd-show__title';
      h.textContent = title;
      c.appendChild(h);
      wrap.appendChild(c);
      return c;
    };
    const buttons = col('Button đặc');
    for (const [v, label] of [['primary', 'Lưu'], ['secondary', 'Huỷ'], ['success', 'Xuất bản'], ['danger', 'Xoá'], ['info', 'Chi tiết'], ['warning', 'Cảnh báo']]) {
      const b = document.createElement('td-button');
      b.setAttribute('variant', v);
      b.textContent = label;
      buttons.appendChild(b);
    }
    const menuCol = col('Menu / popover');
    const menu = document.createElement('div');
    menu.className = 'fd-show__menu td-glass-surface td-glass-surface--strong';
    for (const t of ['Sửa bài viết', 'Chia sẻ', 'Lưu để đọc sau', 'Xoá']) {
      const it = document.createElement('div');
      it.className = 'fd-show__item';
      it.textContent = t;
      menu.appendChild(it);
    }
    menuCol.appendChild(menu);
    const toastCol = col('Toast (nền trung tính)');
    for (const [t, msg] of [['success', 'Đã lưu thay đổi'], ['info', 'Có 3 bình luận mới'], ['warning', 'Bản nháp chưa lưu'], ['error', 'Không kết nối được máy chủ']]) {
      const el = document.createElement('div');
      el.className = `td-toast td-toast--${t} td-glass-surface td-glass-surface--strong fd-show__toast`;
      el.setAttribute('data-state', 'open');
      const m = document.createElement('span');
      m.className = 'td-toast__message';
      m.textContent = msg;
      el.appendChild(m);
      toastCol.appendChild(el);
    }
    return wrap;
  },
};
