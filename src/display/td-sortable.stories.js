import { escapeHtml } from '../utils/escape.js';
import './td-sortable.js';
import './td-media-grid.js';
import '../form/td-input-field.js';
import '../styles/story-layout.css';

export default {
  title: 'Display/Sortable',
  tags: ['autodocs'],
  argTypes: {
    label: { control: 'text' },
    disabled: { control: 'boolean' },
  },
};

const esc = (v) => escapeHtml(String(v ?? ''));

/** Shows the last `order-change` (the app would POST `order` and call `setOrder(previous)` on a server error). */
const showOrder = (canvasElement) => {
  const out = canvasElement.querySelector('.sb-rep-pre');
  canvasElement.addEventListener('order-change', (e) => {
    out.textContent = `order-change (${e.detail.source}): ${JSON.stringify(e.detail.order)}\nprevious: ${JSON.stringify(e.detail.previous)}`;
  });
};

/** Home page sections: drag a handle, or focus it → Space / Enter lifts, arrows move, Space / Enter drops, Escape cancels. */
export const HomeSections = {
  render: (args) => `<div class="sb-stack">
    <td-sortable label="${esc(args.label)}"${args.disabled ? ' disabled' : ''} class="sb-sort-list">
      <div data-td-sort-item data-id="hero" data-td-sort-label="Banner đầu trang" class="sb-sort-item">Banner đầu trang</div>
      <div data-td-sort-item data-id="flash" data-td-sort-label="Flash sale" class="sb-sort-item">Flash sale</div>
      <div data-td-sort-item data-id="new" data-td-sort-label="Hàng mới về" class="sb-sort-item">Hàng mới về</div>
      <div data-td-sort-item data-id="brands" data-td-sort-label="Thương hiệu" class="sb-sort-item">Thương hiệu</div>
      <div data-td-sort-item data-id="news" data-td-sort-label="Tin tức" class="sb-sort-item">Tin tức</div>
    </td-sortable>
    <pre class="sb-rep-pre">(chưa có order-change)</pre></div>`,
  args: { label: 'Section trang chủ', disabled: false },
  play: ({ canvasElement }) => showOrder(canvasElement),
};

/**
 * Gallery recipe — ONLY the documented markup, no story CSS: `<td-media-grid><td-sortable role="none">`; td.css makes
 * the sortable the grid with the media-grid column / gap tokens. Space on a photo selects (media-grid), on the handle
 * lifts (sortable); ↑ / ↓ while lifted move by one row.
 */
export const Gallery = {
  render: (args) => `<div class="sb-stack"><td-media-grid label="Ảnh sản phẩm">
    <td-sortable role="none" label="${esc(args.label)}">
      ${[1, 2, 3, 4, 5, 6].map((i) => `<div data-td-media-item data-td-sort-item data-id="p${i}"><button type="button" data-td-media-open aria-label="Ảnh ${i}">Ảnh ${i}</button></div>`).join('')}
    </td-sortable></td-media-grid>
    <pre class="sb-rep-pre">(chưa có order-change)</pre></div>`,
  args: { label: 'Thứ tự ảnh' },
  play: ({ canvasElement }) => showOrder(canvasElement),
};

/**
 * Items with fields + an app-printed handle (`<button data-td-sort-handle>`, invisible until the element is defined —
 * same box, no layout shift). Typing / arrows inside a field never lift or move.
 */
export const AttributesWithFields = {
  render: (args) => `<div class="sb-stack">
    <td-sortable label="${esc(args.label)}" class="sb-sort-list">
      ${[['ram', 'RAM', '8 GB'], ['rom', 'Bộ nhớ', '256 GB'], ['pin', 'Pin', '5000 mAh']].map(([id, name, v]) => `<div data-td-sort-item data-id="${id}" data-td-sort-label="${name}" class="sb-sort-item">
        <button type="button" data-td-sort-handle></button>
        <td-input-field label="${name}" value="${v}"></td-input-field></div>`).join('')}
    </td-sortable>
    <pre class="sb-rep-pre">(chưa có order-change)</pre></div>`,
  args: { label: 'Thuộc tính' },
  play: ({ canvasElement }) => showOrder(canvasElement),
};

/** `disabled`: handles stay focusable but `aria-disabled`; missing / duplicate data-id does the same (one warning). */
export const Disabled = {
  render: (args) => `<td-sortable label="${esc(args.label)}" disabled class="sb-sort-list">
    <div data-td-sort-item data-id="a" class="sb-sort-item">Preset A</div>
    <div data-td-sort-item data-id="b" class="sb-sort-item">Preset B</div></td-sortable>`,
  args: { label: 'Preset' },
};
