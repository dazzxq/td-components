import './td-rating.js';
import '../styles/story-layout.css';

export default {
  title: 'Display/Rating',
  tags: ['autodocs'],
};

/** Read-only average: half stars by default, the exact value is read out ("4,3 trên 5 sao"). */
export const Default = {
  render: () => `<div class="sb-stack">
    <td-rating value="4.3" count="1234"></td-rating>
    <td-rating value="4.5" count="87" show-value></td-rating>
    <td-rating value="3.37" precision="exact" show-value></td-rating>
    <td-rating value="0" count="0"></td-rating>
    <td-rating></td-rating>
  </div>`,
};

/** Sizes s / m / l and a 10-star scale. */
export const Sizes = {
  render: () => `<div class="sb-stack">
    <td-rating value="4.5" size="s" count="12"></td-rating>
    <td-rating value="4.5" count="12"></td-rating>
    <td-rating value="4.5" size="l" count="12" show-value></td-rating>
    <td-rating value="7.5" max="10"></td-rating>
  </div>`,
};

/** Right-to-left: the fill starts at the right edge. */
export const Rtl = {
  render: () => '<div dir="rtl"><td-rating value="2.5" show-value></td-rating></div>',
};
