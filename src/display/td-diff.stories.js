import './td-diff.js';
import '../styles/story-layout.css';

export default {
  title: 'Display/Diff',
  tags: ['autodocs'],
};

/** dsuite policy `fields`: values already redacted by the server; `masked` rows carry a server-masked string or none. */
const ITEMS = [
  { key: 'price', label: 'Giá bán', type: 'money', before: 12990000, after: 11990000 },
  { key: 'status', label: 'Trạng thái', type: 'enum', options: { selling: 'Đang bán', hidden: 'Ẩn' }, before: 'selling', after: 'hidden' },
  { key: 'sale_ends', label: 'Hết khuyến mãi', type: 'date', after: '2026-10-31' },
  { key: 'gift', label: 'Quà tặng', before: 'Ốp lưng' },
  { key: 'phone', label: 'SĐT khách', masked: true, before: '***678', after: '***901' },
  { key: 'api_key', label: 'API key', masked: true },
  { key: 'sku', label: 'SKU', before: 'IP15-128', after: 'IP15-128' },
];

const SNAP_BEFORE = { name: 'iPhone 15', roles: ['admin', 'editor'], lines: [{ sku: 'A1', qty: 1 }, { sku: 'B2', qty: 2 }], seo: { title: 'iPhone 15 chính hãng' } };
const SNAP_AFTER = { name: 'iPhone 15 128GB', roles: ['editor', 'viewer'], lines: [{ sku: 'A1', qty: 1 }, { sku: 'B2', qty: 3 }], seo: { title: 'iPhone 15 128GB chính hãng' } };
const FIELDS = [{ path: 'name', label: 'Tên' }, { path: 'roles', label: 'Quyền' }, { path: 'lines', label: 'Dòng hàng' },
  { path: ['lines', 0, 'qty'], label: 'SL dòng 1' }, { path: 'seo', label: 'SEO' }];

/** Table (≥ 480px of host): Trường · Trước · Sau; unchanged rows collapsed after the table. */
export const Table = {
  render: () => '<td-diff id="df-table" label="Thay đổi sản phẩm #1024"></td-diff>',
  play: ({ canvasElement }) => { canvasElement.querySelector('#df-table').items = ITEMS; },
};

/** Inline (host < 480px): each field is a block — "Trước → Sau". */
export const Inline = {
  render: () => '<div class="sb-narrow"><td-diff id="df-inline"></td-diff></div>',
  play: ({ canvasElement }) => { canvasElement.querySelector('#df-inline').items = ITEMS; },
};

/** Policy `keys` (credentials): only the names of the changed fields, `masked: true` → "[ĐÃ ẨN]" + "Đã che". */
export const MaskedKeys = {
  render: () => '<td-diff id="df-keys" unchanged="hide"></td-diff>',
  play: ({ canvasElement }) => {
    canvasElement.querySelector('#df-keys').items = [{ key: 'password', label: 'Mật khẩu', masked: true },
      { key: 'totp', label: '2FA', masked: true, before: '[ĐÃ ĐỔI]', after: '[ĐÃ ĐỔI]', kind: 'changed' }];
  },
};

/** Policy `snapshot`: nested objects flattened by typed path, scalar lists diffed as sets (+ / −). */
export const Snapshot = {
  render: () => '<td-diff id="df-snap"></td-diff>',
  play: ({ canvasElement }) => {
    const el = canvasElement.querySelector('#df-snap');
    el.fields = FIELDS;
    el.before = SNAP_BEFORE;
    el.after = SNAP_AFTER;
  },
};

/** Long values: 300-character preview + "Xem đầy đủ"; bidi characters shown as ⟨U+202E⟩. */
export const Long = {
  render: () => '<td-diff id="df-long"></td-diff>',
  play: ({ canvasElement }) => {
    canvasElement.querySelector('#df-long').items = [
      { key: 'desc', label: 'Mô tả', before: 'Mô tả cũ.', after: 'Điện thoại chính hãng, bảo hành 12 tháng. '.repeat(12) },
      { key: 'file', label: 'Tệp', before: 'hoa-don.pdf', after: 'hoa-don\u202Efdp.exe' },
    ];
  },
};

/** JSON view (opt-in `json`): normalised data, masked branches as "[ĐÃ ẨN]". */
export const Json = {
  render: () => '<td-diff id="df-json" json></td-diff>',
  play: ({ canvasElement }) => {
    const el = canvasElement.querySelector('#df-json');
    el.fields = [...FIELDS, { path: 'card', masked: true }];
    el.before = { ...SNAP_BEFORE, card: { pan: '4111…' } };
    el.after = SNAP_AFTER;
  },
};

/** No data / nothing changed: "Không có thay đổi." */
export const Empty = {
  render: () => '<td-diff></td-diff>',
};

/** Dark scope (`data-td-theme="dark"`): tints and kind colours re-resolve. */
export const Dark = {
  render: () => '<div class="sb-dark" data-td-theme="dark"><td-diff id="df-dark"></td-diff></div>',
  play: ({ canvasElement }) => { canvasElement.querySelector('#df-dark').items = ITEMS; },
};
