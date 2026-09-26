import { TdLightbox } from './td-lightbox.js';

const IMGS = [1, 2, 3, 4].map((n) => ({ src: `/lightbox/${n}.svg`, caption: `Ảnh mẫu số ${n} — gradient cục bộ, không tải mạng` }));
const thumbs = () => IMGS.map((it, i) => `
  <figure data-td-lightbox-item style="margin:0">
    <img src="${it.src}" alt="Ảnh ${i + 1}" style="width:160px;border-radius:10px;display:block">
    <figcaption style="font:12px var(--td-font-sans);color:var(--td-color-text-muted)">${it.caption}</figcaption>
  </figure>`).join('');

export default { title: 'Feedback/Lightbox' };

/** Declarative: TdLightbox.bind() on a group of [data-td-lightbox-item]. */
export const Gallery = {
  render: () => {
    const root = document.createElement('div');
    root.innerHTML = `<div data-td-lightbox-group style="display:flex;gap:12px;flex-wrap:wrap">${thumbs()}</div>`;
    TdLightbox.bind(root);
    return root;
  },
};

/** Single image: `[data-td-lightbox]` trigger (value = URL; caption from the attribute). */
export const Single = {
  render: () => {
    const root = document.createElement('div');
    root.innerHTML = `<a href="/lightbox/3.svg" data-td-lightbox="/lightbox/3.svg" data-td-lightbox-caption="Một ảnh đơn">
      <img src="/lightbox/3.svg" alt="Ảnh đơn" style="width:220px;border-radius:12px;display:block"></a>`;
    TdLightbox.bind(root);
    return root;
  },
};

/** Caption shown in the side panel (≥ 900px) / bottom sheet (narrow). */
export const CaptionPanel = {
  render: () => {
    const root = document.createElement('div');
    root.innerHTML = `<div data-td-lightbox-group style="display:flex;gap:12px;flex-wrap:wrap">${thumbs()}</div>`;
    TdLightbox.bind(root, { panel: true });
    return root;
  },
};

/** Hooks: custom panel + toolbar button (registry icon) + history (Back closes). */
export const Hooks = {
  render: () => {
    const btn = document.createElement('button');
    btn.textContent = 'Mở với hook';
    btn.addEventListener('click', () => {
      TdLightbox.open(IMGS.map((it, i) => ({ ...it, data: { id: `photo-${i + 1}` } })), {
        history: true,
        panel: (ctx) => {
          const box = document.createElement('div');
          const h = document.createElement('strong');
          h.textContent = ctx.item.data.id;
          const p = document.createElement('p');
          p.textContent = `Ảnh ${ctx.index + 1} / ${ctx.count}`;
          box.append(h, p);
          return box;
        },
        toolbar: [{
          id: 'cover', label: 'Đặt làm ảnh bìa', icon: 'star',
          onClick: (ctx, b) => b.toggleAttribute('data-on'),
        }],
      });
    });
    return btn;
  },
};

/** Video: default native <video>; a site passes `video` to plug Plyr etc. */
export const Video = {
  render: () => {
    const btn = document.createElement('button');
    btn.textContent = 'Mở video (poster fallback khi không có nguồn)';
    btn.addEventListener('click', () => TdLightbox.open([
      { type: 'video', src: '/lightbox/missing.mp4', poster: '/lightbox/2.svg', caption: 'Video mẫu' },
      IMGS[0],
    ]));
    return btn;
  },
};
