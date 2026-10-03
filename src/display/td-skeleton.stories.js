import '../styles/story-layout.css';

export default {
  title: 'Display/Skeleton (CSS)',
  tags: ['autodocs'],
};

/** CSS only (td.css): text lines, block, circle, rect. The markup is decorative (`aria-hidden`); the loading region
 *  carries `aria-busy="true"`. Reduced motion → no shimmer. */
export const Shapes = {
  render: () => `<div class="sb-stack" aria-busy="true">
    <span class="td-skeleton td-skeleton--text" aria-hidden="true"></span>
    <span class="td-skeleton td-skeleton--text td-skeleton--lines-3" aria-hidden="true"></span>
    <span class="td-skeleton" aria-hidden="true"></span>
    <span class="td-skeleton td-skeleton--circle" aria-hidden="true"></span>
    <span class="td-skeleton td-skeleton--rect" aria-hidden="true"></span></div>`,
};

/** A card placeholder: avatar + two text lines. */
export const Card = {
  render: () => `<div class="sb-row" aria-busy="true">
    <span class="td-skeleton td-skeleton--circle" aria-hidden="true"></span>
    <span class="td-skeleton td-skeleton--text td-skeleton--lines-2" aria-hidden="true"></span></div>`,
};
