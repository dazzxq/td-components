import './td-carousel.js';
import './td-rating.js';
import '../styles/story-layout.css';

export default {
  title: 'Display/Carousel',
  tags: ['autodocs'],
};

const card = (i) => `<a class="sb-card" href="#p${i}"><strong>Sản phẩm ${i}</strong>
  <td-rating value="${(3.5 + (i % 4) * 0.4).toFixed(1)}" count="${i * 13}" size="s"></td-rating></a>`;
const slides = (n) => Array.from({ length: n }, (_, i) => `<div>${card(i + 1)}</div>`).join('');

/** 2 per view (attribute): native scroll-snap strip + prev / next + page dots; no autoplay, ever. */
export const Default = {
  render: () => `<td-carousel label="Sản phẩm nổi bật" per-view="2">${slides(8)}</td-carousel>`,
};

/** Responsive by tokens (site CSS): 1 → 2 (≥ 480) → 4 (≥ 1024) per view, a 12 % peek on narrow screens. */
export const Responsive = {
  render: () => `<td-carousel class="sb-carousel-responsive" label="Sản phẩm liên quan">${slides(12)}</td-carousel>`,
};

/** Fixed slide width (`--td-carousel-slide-size`), one slide per step. */
export const SlideSize = {
  render: () => `<td-carousel class="sb-carousel-fixed" label="Phụ kiện" step="slide">${slides(10)}</td-carousel>`,
};

/** Many pages: dots="auto" falls back to the counter when more than two rows of dots would be needed. */
export const ManyPages = {
  render: () => `<td-carousel label="Tất cả" per-view="1">${slides(20)}</td-carousel>`,
};

/** Right-to-left. */
export const Rtl = {
  render: () => `<div dir="rtl"><td-carousel label="Sản phẩm" per-view="2">${slides(6)}</td-carousel></div>`,
};
