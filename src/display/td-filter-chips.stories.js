import './td-filter-chips.js';
import '../styles/story-layout.css';

export default {
  title: 'Display/Filter chips',
  tags: ['autodocs'],
};

const ITEMS = [
  { key: 'kho', label: 'Kho', value: 'Hà Nội', removable: false },
  { key: 'status', label: 'Trạng thái', value: 'Đang bán' },
  { id: 'tag-new', key: 'tag', label: 'Nhãn', value: 'Mới' },
  { id: 'tag-used', key: 'tag', label: 'Nhãn', value: 'Cũ' },
  { key: 'q', label: 'Tìm', value: 'iphone 15 pro max 256GB chính hãng VN/A' },
];

/** Uncontrolled: × / "Xoá tất cả" remove chips (cancelable `filter-remove` / `filter-clear`); "Kho" is fixed. */
export const Default = {
  render: () => `<div class="sb-stack"><input id="fc-q" class="td-field__control" aria-label="Tìm" placeholder="Tìm…">
    <td-filter-chips id="fc-default" empty-focus="fc-q"></td-filter-chips><span class="sb-note" id="fc-out"></span></div>`,
  play: ({ canvasElement }) => {
    const el = canvasElement.querySelector('#fc-default');
    const out = canvasElement.querySelector('#fc-out');
    el.items = ITEMS;
    el.addEventListener('filter-remove', (e) => { out.textContent = `filter-remove: ${e.detail.item.id}`; });
    el.addEventListener('filter-clear', (e) => { out.textContent = `filter-clear: ${e.detail.removed.length}`; });
  },
};

/** 320px container: one scrolling row, "Xoá tất cả" pinned after it. */
export const Narrow = {
  render: () => '<div class="sb-narrow"><td-filter-chips id="fc-narrow"></td-filter-chips></div>',
  play: ({ canvasElement }) => {
    canvasElement.querySelector('#fc-narrow').items = ITEMS;
  },
};

/** Links (PHP / no JS): each × goes to the URL without that filter, computed by the server. */
export const Links = {
  render: () => '<td-filter-chips id="fc-links" clear-href="?"></td-filter-chips>',
  play: ({ canvasElement }) => {
    canvasElement.querySelector('#fc-links').items = [
      { key: 'status', label: 'Trạng thái', value: 'Đang bán', href: '?q=iphone' },
      { key: 'q', label: 'Tìm', value: 'iphone', href: '?status=selling' },
    ];
  },
};
