/**
 * Responsive fixture (v0.34.0, plan M5/M6): every non-media component in the situations the audit found hard —
 * long labels, two equal columns at 360 px, a 280 px column, 8 tabs, 2000-item pagination, a 9-column order table.
 * Used by the responsive gate (test/responsive/responsive.spec.mjs) and by demo.html ("Responsive" section).
 * Layout: test/fixtures/responsive-page.css. Exposes `openers` for the overlay scenarios.
 *
 * M0 (after v0.33): media picker (mock adapter, no network), media grid (default + justified + sortable gallery) and
 * dropzone are included. v0.35.0: td-cropper (inline: full width + the 280 px column), the crop dialog and the picker crop
 * step (openers `cropDialog` / `pickerCrop`). v0.36.1: `#rsp-table-density` (5 short columns, card density budget). v0.37.0: it is `selectable` (row 2 selected).
 * v0.38.0: td-scan-input (single + multiple with 30 rows, beep; one in the 280 px column).
 * v0.46.0: section `diff` — `#rsp-diff` (td-diff, view auto: inline under 480px of host, long value + JSON view) and
 *   `#rsp-diff-table` (view="table": scrolls inside its box on a narrow page).
 * v0.39.0: section `filters` — a filter bar (search + dropdown) → `#rsp-chips` (td-filter-chips) → `#rsp-table-filters`
 * (server-mode controlled, column-menu, the "Số điện thoại" column hidden).
 * v0.40.0: td-datetime-range (form grid + 280 px column via controls(); a 160 px datetime host; opener `#g-dtr`).
 * v0.45.0: section `steps-timeline` — td-steps (6 steps horizontal, vertical, clickable in a 280 px column) and
 * td-timeline (40 items, details open, fixed `now`; again in the 280 px column).
 * v0.48.0: td-color-picker (form grid + 280 px column via controls(); opener `#g-color`).
 */
import '../../src/form/td-button.js';
import '../../src/form/td-action-button.js'; // v0.36.0
import '../../src/form/td-input-field.js';
import '../../src/form/td-dropdown.js';
import '../../src/form/td-datetime-picker.js';
import '../../src/form/td-chip-input.js';
import '../../src/form/td-tree.js';
import '../../src/form/td-tree-select.js';
import '../../src/form/td-number-input.js';
import '../../src/form/td-otp-input.js';
import '../../src/form/td-toggle.js';
import '../../src/form/td-checkbox.js';
import '../../src/form/td-slider.js';
import '../../src/form/td-password-meter.js';
import '../../src/form/td-repeater.js';
import '../../src/display/td-tabs.js';
import '../../src/display/td-pagination.js';
import '../../src/display/td-table.js';
import '../../src/display/td-empty-state.js';
import '../../src/display/td-copy.js';
import '../../src/display/td-masked-value.js';
import '../../src/display/td-sortable.js';
import '../../src/display/td-filter-chips.js'; // v0.39.0
import '../../src/display/td-diff.js'; // v0.46.0
import '../../src/feedback/td-alert.js';
import '../../src/feedback/td-progress.js';
import '../../src/feedback/td-tooltip.js';
import '../../src/feedback/td-drawer.js';
import { TdMenu } from '../../src/feedback/td-menu.js';
import { TdHovercard } from '../../src/feedback/td-hovercard.js';
import { TdToast } from '../../src/feedback/td-toast.js';
import { TdModal } from '../../src/feedback/td-modal.js';
import { TdLoading } from '../../src/feedback/td-loading.js';
import { TdLightbox } from '../../src/feedback/td-lightbox.js';
import '../../src/form/td-dropzone.js';
import '../../src/display/td-media-grid.js';
import { TdMediaPicker } from '../../src/feedback/td-media-picker.js';
import { TdCropper } from '../../src/form/td-cropper.js';
import '../../src/form/td-media-field.js';
import '../../src/form/td-scan-input.js'; // v0.38.0
import '../../src/form/td-color-picker.js'; // v0.48.0
import '../../src/form/td-datetime-range.js'; // v0.40.0
import '../../src/form/td-media-gallery.js'; // v0.43.0
import '../../src/display/td-steps.js'; // v0.45.0
import '../../src/display/td-timeline.js'; // v0.45.0
import '../../src/form/td-check-matrix.js'; // v0.47.0
import '../../src/form/td-choice-group.js'; // v0.49.0
import { createMockAdapter } from './media-adapter.js';

const LONG = 'Lưu và xuất bản bài viết lên trang chủ ngay bây giờ';
const TABS = ['Tất cả đơn hàng', 'Chờ xác nhận', 'Đang giao hàng', 'Đã giao thành công', 'Đã huỷ bởi khách', 'Hoàn tiền', 'Khiếu nại', 'Lưu trữ'];

const tree = () => [
  { value: 'phone', label: 'Điện thoại', expanded: true, children: [
    { value: 'apple', label: 'Apple', children: [{ value: 'ip15', label: 'iPhone 15' }, { value: 'ip16', label: 'iPhone 16 Pro Max 256GB' }] },
    { value: 'samsung', label: 'Samsung Galaxy' },
  ] },
  { value: 'laptop', label: 'Laptop', children: [{ value: 'dell', label: 'Dell' }, { value: 'mac', label: 'MacBook Pro' }] },
  { value: 'acc', label: 'Phụ kiện' },
];

const controls = (p) => `
  <td-input-field label="Họ và tên khách hàng" placeholder="Nhập họ tên đầy đủ…" required></td-input-field>
  <td-dropdown id="${p}-dd" label="Chuyên mục" placeholder="— Chọn chuyên mục sản phẩm —" searchable></td-dropdown>
  <td-datetime-picker id="${p}-dtp" label="Thời điểm đăng" placeholder="dd/mm/yyyy - hh:mm"></td-datetime-picker>
  <td-datetime-range id="${p}-dtr" name="${p}-range" label="Khoảng ngày" mode="datetime" minute-step="15" start="29/09/2026 - 00:00" end="05/10/2026 - 23:45"></td-datetime-range>
  <td-chip-input id="${p}-chips" label="Vai trò" placeholder="Lọc vai trò…" selection-only select-all></td-chip-input>
  <td-tree-select id="${p}-ts" label="Danh mục" multiple allow-clear value='["ip16","mac"]'></td-tree-select>
  <td-number-input label="Giá bán" suffix="₫" value="32990000"></td-number-input>
  <td-otp-input label="Mã xác thực"></td-otp-input>
  <td-tree id="${p}-tree" label="Quyền" selection="multiple" searchable></td-tree>
  <td-color-picker id="${p}-color" name="${p}-color" label="Màu thương hiệu" value="#1d4ed8" contrast></td-color-picker>`;

const ORDERS = Array.from({ length: 12 }, (_, i) => ({
  code: `DH${10240 + i}`,
  customer: ['Nguyễn Văn An', 'Trần Thị Bích Ngọc', 'Lê Hoàng'][i % 3],
  phone: `0912 345 6${10 + i}`,
  product: 'iPhone 16 Pro Max 256GB Titan Sa Mạc + ốp lưng',
  qty: 1 + (i % 3),
  total: `${(32990000 + i * 1000).toLocaleString('vi-VN')} ₫`,
  status: ['Chờ xác nhận', 'Đang giao', 'Đã giao'][i % 3],
  created: `0${1 + (i % 9)}/10/2026 14:3${i % 10}`,
}));

/** Order-table columns: card roles + row actions (v0.34.0). */
export const orderColumns = () => [
  { key: 'code', label: 'Mã đơn', sortable: true, card: 'primary' },
  { key: 'customer', label: 'Khách hàng', sortable: true },
  { key: 'phone', label: 'Số điện thoại' },
  { key: 'product', label: 'Sản phẩm', ellipsis: true, maxWidth: '220px' },
  { key: 'qty', label: 'SL', align: 'right' },
  { key: 'total', label: 'Tổng tiền', align: 'right', sortable: true },
  { key: 'status', label: 'Trạng thái', card: 'meta' },
  { key: 'created', label: 'Ngày tạo', sortable: true, card: 'meta' },
  { key: 'act', label: 'Thao tác', actions: [
    { id: 'edit', label: 'Sửa' },
    { id: 'print', label: 'In hoá đơn' },
    { id: 'delete', label: 'Xoá', variant: 'danger' },
  ] },
];

const POSTS = [
  ['Hướng dẫn Web Components', 'Duyệt', 'published', 1250], ['Tailwind CSS Tips & Tricks', 'Duyệt', 'published', 890],
  ['JavaScript ES2025 Features', 'Minh', 'draft', 0], ['Laravel 12 Migration Guide', 'Hùng', 'published', 2100],
  ['Building a CMS from Scratch', 'Duyệt', 'archived', 3400], ['Storybook for Web Components', 'Linh', 'draft', 0],
  ['Docker Compose Best Practices', 'Minh', 'published', 670], ['Git Workflow cho team nhỏ', 'Duyệt', 'published', 1580],
].map(([title, author, status, views], i) => ({ id: i + 1, title, author, status, views }));
const STATUS = { published: ['Đã đăng', 'td-badge--success'], draft: ['Nháp', 'td-badge--neutral'], archived: ['Lưu trữ', 'td-badge--warning'] };

/**
 * v0.36.1 (plan QĐ 10): the demo's 5 short columns — `id` first WITHOUT a card role, `title` explicit primary (→ the id
 * becomes the `lead`), a badge render column and a right-aligned number. Card density budget fixture.
 */
export const densityColumns = () => [
  { key: 'id', label: 'ID', sortable: true, width: '60px' },
  { key: 'title', label: 'Tiêu đề', sortable: true, card: 'primary' },
  { key: 'author', label: 'Tác giả', sortable: true },
  { key: 'status', label: 'Trạng thái', render: (row) => {
    const [text, cls] = STATUS[row.status] || [String(row.status), ''];
    const badge = document.createElement('span');
    badge.className = `td-badge ${cls}`;
    badge.textContent = text;
    return badge;
  } },
  { key: 'views', label: 'Lượt xem', sortable: true, align: 'right' },
];

/**
 * Build the fixture inside `root`.
 * @param {HTMLElement} root
 * @returns {{ openers: Record<string, () => void> }}
 */
export function mountResponsiveFixture(root) {
  root.classList.add('rsp-page');
  root.innerHTML = `
  <section class="rsp-section" data-section="buttons"><h2>Nút</h2>
    <div class="rsp-row">
      <td-button variant="primary">${LONG}</td-button>
      <td-button variant="secondary">Huỷ</td-button>
      <td-button variant="danger" id="rsp-menu-btn" icon="more">Thao tác</td-button>
      <td-button variant="secondary" id="rsp-hovercard">Hồ sơ tác giả</td-button>
      <button type="button" class="td-btn td-btn--secondary" id="rsp-tooltip" data-tooltip="Tooltip dài hơn một chút để thử xuống dòng khi màn hình hẹp"><span class="td-btn__label">Tooltip</span></button>
    </div>
  </section>
  <section class="rsp-section" data-section="action-buttons"><h2>Nút thao tác</h2>
    <div class="td-action-group" id="rsp-action-group">
      <td-action-button action="view" size="sm"></td-action-button>
      <td-action-button action="edit"></td-action-button>
      <td-action-button action="versions" size="lg"></td-action-button>
      <td-action-button action="remove"></td-action-button>
      <td-action-button action="delete"></td-action-button>
      <td-action-button action="open" href="#rsp-action-group"></td-action-button>
    </div>
  </section>
  <section class="rsp-section" data-section="form-grid"><h2>Form hai cột</h2>
    <div class="rsp-grid2">${controls('g')}</div>
  </section>
  <section class="rsp-section" data-section="narrow"><h2>Cột hẹp 280px</h2>
    <div class="rsp-narrow">${controls('n')}
      <td-pagination total-items="2000" items-per-page="10" current-page="57"></td-pagination>
      <td-tabs id="rsp-tabs-narrow"></td-tabs>
      <td-table id="rsp-table-narrow" title="Đơn hàng"></td-table>
      <td-scan-input id="rsp-scan-narrow" label="IMEI" beep multiple name="imei[]"></td-scan-input>
      <div class="rsp-160"><td-datetime-range id="rsp-dtr-160" name="r160" label="Khoảng" start="29/09/2026" end="05/10/2026"></td-datetime-range></div>
      <td-choice-group id="rsp-choice-narrow" name="cap-n" label="Dung lượng" value="256"></td-choice-group>
      <div class="rsp-160"><td-number-input id="rsp-stepper-160" name="qty160" label="Số lượng" stepper min="1" max="10" value="2" clamp></td-number-input></div>
      <td-cropper id="rsp-cropper-narrow" src="/test/fixtures/panorama.svg" natural-width="1800" natural-height="600" aspect-ratio="1.91" alt="Ảnh OG"></td-cropper>
    </div>
  </section>
  <section class="rsp-section" data-section="cropper"><h2>Cắt ảnh</h2>
    <td-cropper id="rsp-cropper" src="/test/fixtures/photo.svg" natural-width="1200" natural-height="800" alt="Ảnh phong cảnh" focal-point focal='{"v":1,"x":0.3,"y":0.4}'></td-cropper>
    <td-media-field name="og" label="Ảnh chia sẻ (OG)" usage croppable focal-point aspect-ratio="1.91" value="m1" preview-src="/test/fixtures/1.svg" crop='{"v":1,"x":0,"y":0.1,"width":1,"height":0.785}'></td-media-field>
  </section>
  <section class="rsp-section" data-section="media-gallery"><h2>Gallery ảnh</h2>
    <td-media-gallery id="rsp-gallery" name="gallery" label="Ảnh sản phẩm" usage croppable cover max="10" aspect-ratio="4/3" items='[{"id": "m1", "src": "/test/fixtures/1.svg", "name": "Ảnh 1", "alt": "Áo thun trắng cổ tròn"}, {"id": "m2", "src": "/test/fixtures/2.svg", "name": "Ảnh 2", "alt": ""}, {"id": "m3", "src": "/test/fixtures/3.svg", "name": "Ảnh 3", "alt": ""}, {"id": "m4", "src": "/test/fixtures/4.svg", "name": "Ảnh 4", "alt": ""}, {"id": "m5", "src": "/test/fixtures/1.svg", "name": "Ảnh 5", "alt": ""}, {"id": "m6", "src": "/test/fixtures/2.svg", "name": "Ảnh 6", "alt": ""}, {"id": "m7", "src": "/test/fixtures/3.svg", "name": "Ảnh 7", "alt": ""}]'></td-media-gallery>
    <div class="rsp-narrow"><td-media-gallery id="rsp-gallery-narrow" name="g2" label="Ảnh (cột hẹp)" usage items='[{"id": "m1", "src": "/test/fixtures/1.svg", "name": "Ảnh 1", "alt": "Áo thun trắng cổ tròn"}, {"id": "m2", "src": "/test/fixtures/2.svg", "name": "Ảnh 2", "alt": ""}, {"id": "m3", "src": "/test/fixtures/3.svg", "name": "Ảnh 3", "alt": ""}, {"id": "m4", "src": "/test/fixtures/4.svg", "name": "Ảnh 4", "alt": ""}, {"id": "m5", "src": "/test/fixtures/1.svg", "name": "Ảnh 5", "alt": ""}, {"id": "m6", "src": "/test/fixtures/2.svg", "name": "Ảnh 6", "alt": ""}, {"id": "m7", "src": "/test/fixtures/3.svg", "name": "Ảnh 7", "alt": ""}]'></td-media-gallery></div>
  </section>
  <section class="rsp-section" data-section="choice"><h2>Lựa chọn (v0.49)</h2>
    <td-choice-group id="rsp-choice" name="cap" label="Dung lượng" value="256"></td-choice-group>
    <td-choice-group id="rsp-choice-long" name="pkg" label="Gói bảo hành"></td-choice-group>
    <td-choice-group id="rsp-choice-swatch" name="color" label="Màu sắc" variant="swatch" value="den"></td-choice-group>
    <td-number-input id="rsp-stepper" name="qty" label="Số lượng" stepper min="1" max="5" value="1" clamp></td-number-input>
  </section>
  <section class="rsp-section" data-section="scan-input"><h2>Quét mã</h2>
    <td-scan-input id="rsp-scan" label="Mã đơn hàng" placeholder="Quét mã vạch trên phiếu xuất kho" beep></td-scan-input>
    <td-scan-input id="rsp-scan-multi" label="IMEI nhập kho" multiple beep name="imei[]" max="50"></td-scan-input>
  </section>
  <section class="rsp-section" data-section="check-matrix"><h2>Ma trận quyền</h2>
    <td-check-matrix id="rsp-matrix" name="perms" label="Quyền theo vai trò" max-height="24rem"></td-check-matrix>
  </section>
  <section class="rsp-section" data-section="tabs"><h2>Tab</h2>
    <td-tabs id="rsp-tabs"></td-tabs>
    <td-tabs id="rsp-tabs-mixed" size="sm"></td-tabs>
  </section>
  <section class="rsp-section" data-section="pagination"><h2>Phân trang</h2>
    <td-pagination total-items="2000" items-per-page="10" current-page="57"></td-pagination>
    <td-pagination total-items="150" items-per-page="10" current-page="3"></td-pagination>
  </section>
  <section class="rsp-section" data-section="table"><h2>Bảng</h2>
    <td-table id="rsp-table-density" title="Bài viết" selectable row-key="id"></td-table>
    <td-table id="rsp-table" title="Đơn hàng"></td-table>
    <td-table id="rsp-table-scroll" title="Đơn hàng (luôn dạng bảng)" layout="table"></td-table>
  </section>
  <section class="rsp-section" data-section="content"><h2>Nội dung</h2>
    <td-alert variant="danger" heading="Lỗi máy chủ" dismissible>Không lưu được bài viết vì máy chủ thanh toán không phản hồi, vui lòng thử lại sau.</td-alert>
    <td-empty-state id="rsp-empty" title="Chưa có đơn hàng nào" message="Đơn hàng mới sẽ xuất hiện ở đây khi khách đặt mua."></td-empty-state>
    <form><td-repeater label="Hộp gồm" min-rows="1" max-rows="6" add-label="Thêm phụ kiện" sortable>
      <template><div data-td-row class="rsp-row">
        <td-input-field data-name="box[{i}][name]" aria-label="Phụ kiện" placeholder="Tên phụ kiện"></td-input-field>
        <td-number-input data-name="box[{i}][qty]" aria-label="Số lượng" value="1" min="1" max="99"></td-number-input>
      </div></template>
      <div data-td-row class="rsp-row">
        <td-input-field name="box[0][name]" data-name="box[{i}][name]" aria-label="Phụ kiện" value="Sạc nhanh 20W chính hãng"></td-input-field>
        <td-number-input name="box[0][qty]" data-name="box[{i}][qty]" aria-label="Số lượng" value="1" min="1" max="99"></td-number-input>
      </div>
    </td-repeater></form>
    <div class="rsp-row">
      <td-toggle label="Công khai"></td-toggle>
      <td-checkbox label="Tôi đồng ý với điều khoản sử dụng"></td-checkbox>
      <td-copy value="pk_live_51HdemoKey" label="Copy khoá API"></td-copy>
      <td-masked-value label="SĐT khách" masked="09xx xxx 123"></td-masked-value>
    </div>
    <td-slider label="Âm lượng" min="0" max="100" value="60"></td-slider>
    <td-progress value="40" label="Đang tải lên"></td-progress>
    <td-sortable label="Thứ tự section">
      <div data-td-sort-item data-id="a" data-td-sort-label="Banner đầu trang" class="rsp-sort-item">Banner đầu trang</div>
      <div data-td-sort-item data-id="b" data-td-sort-label="Flash sale" class="rsp-sort-item">Flash sale</div>
      <div data-td-sort-item data-id="c" data-td-sort-label="Tin tức" class="rsp-sort-item">Tin tức</div>
    </td-sortable>
    <td-dropzone label="Tệp đính kèm cho đơn hàng" accept=".pdf,image/*" accept-label="PDF hoặc ảnh" multiple max-size="5MB" max-files="3" preview></td-dropzone>
    <td-media-grid id="rsp-grid" label="Ảnh sản phẩm" max="3">${[1, 2, 3, 4, 1, 2].map((n, i) => `<div data-td-media-item data-id="g${i}"><a href="/test/fixtures/${n}.svg" data-td-media-open aria-label="Ảnh ${i + 1}"><img src="/test/fixtures/${n}.svg" alt="" class="rsp-thumb"></a></div>`).join('')}</td-media-grid>
    <td-media-grid id="rsp-grid-sort" label="Thứ tự ảnh"><td-sortable role="none" label="Thứ tự ảnh">${[1, 2, 3, 4].map((n, i) => `<div data-td-media-item data-td-sort-item data-id="s${i}"><button type="button" data-td-media-open aria-label="Ảnh ${i + 1}"><img src="/test/fixtures/${n}.svg" alt="" class="rsp-thumb"></button></div>`).join('')}</td-sortable></td-media-grid>
    <td-media-grid id="rsp-grid-justified" label="Album" layout="justified" select-mode="tick">${[['1', 1200, 800], ['portrait', 800, 1200], ['panorama', 1800, 600], ['square', 1000, 1000], ['photo', 1200, 800], ['portrait', 800, 1200], ['1', 1200, 800], ['square', 1000, 1000]].map(([n, w, h], i) => `<div data-td-media-item data-id="j${i}"><a href="/test/fixtures/${n}.svg" data-td-media-open aria-label="Ảnh ${i + 1}"><img src="/test/fixtures/${n}.svg" alt="" width="${w}" height="${h}"></a></div>`).join('')}</td-media-grid>
    <div class="rsp-row" id="rsp-gallery" data-td-lightbox-group>
      <figure data-td-lightbox-item data-td-lightbox-src="/test/fixtures/1.svg"><img src="/test/fixtures/1.svg" alt="Ảnh 1" class="rsp-thumb"></figure>
      <figure data-td-lightbox-item data-td-lightbox-src="/test/fixtures/2.svg"><img src="/test/fixtures/2.svg" alt="Ảnh 2" class="rsp-thumb"></figure>
    </div>
  </section>
  <section class="rsp-section" data-section="filters"><h2>Danh sách có bộ lọc</h2>
    <form class="rsp-row" id="rsp-filter-form" role="search">
      <td-input-field id="rsp-filter-q" label="Tìm đơn" placeholder="Mã đơn, tên khách…" value="iphone"></td-input-field>
      <td-dropdown id="rsp-filter-status" label="Trạng thái"></td-dropdown>
    </form>
    <td-filter-chips id="rsp-chips" empty-focus="rsp-filter-q"></td-filter-chips>
    <td-table id="rsp-table-filters" title="Đơn hàng" server-mode controlled column-menu total-items="120" per-page="5"></td-table>
  </section>
  <section class="rsp-section" data-section="steps-timeline"><h2>Tiến trình + lịch sử</h2>
    <td-steps id="rsp-steps" current="3" navigation="back"></td-steps>
    <td-steps id="rsp-steps-v" orientation="vertical" current="2"></td-steps>
    <td-timeline id="rsp-timeline" time-zone="Asia/Ho_Chi_Minh" has-more more-href="#rsp-timeline"></td-timeline>
    <div class="rsp-narrow">
      <td-steps id="rsp-steps-narrow" current="4" navigation="back"></td-steps>
      <td-timeline id="rsp-timeline-narrow" time-zone="Asia/Ho_Chi_Minh"></td-timeline>
    </div>
  <section class="rsp-section" data-section="diff"><h2>Lịch sử thay đổi</h2>
    <td-diff id="rsp-diff" json label="Thay đổi đơn DH10240"></td-diff>
    <td-diff id="rsp-diff-table" view="table" unchanged="show"></td-diff>
  </section>`;

  const options = [
    { value: 'news', label: 'Tin tức công nghệ' }, { value: 'review', label: 'Đánh giá sản phẩm chi tiết' },
    { value: 'guide', label: 'Hướng dẫn sử dụng' }, { value: 'deal', label: 'Khuyến mãi' }, { value: 'video', label: 'Video' },
  ];
  const roles = [
    { value: 'admin', label: 'Quản trị', description: 'Toàn quyền' }, { value: 'editor', label: 'Biên tập viên' },
    { value: 'author', label: 'Tác giả' }, { value: 'guest', label: 'Khách mời' },
  ];
  for (const p of ['g', 'n']) {
    root.querySelector(`#${p}-dd`).options = options;
    root.querySelector(`#${p}-chips`).options = roles;
    root.querySelector(`#${p}-ts`).data = tree();
    root.querySelector(`#${p}-tree`).data = tree();
  }
  const tabs = TABS.map((label, i) => ({ id: `t${i}`, label }));
  root.querySelector('#rsp-tabs').tabs = tabs;
  root.querySelector('#rsp-tabs-narrow').tabs = tabs.slice(0, 4);
  root.querySelector('#rsp-tabs-mixed').tabs = [{ id: 'a', label: 'Tất cả đơn hàng đang chờ xác nhận thanh toán' }, ...['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((l) => ({ id: l, label: l }))];
  for (const id of ['rsp-table', 'rsp-table-scroll', 'rsp-table-narrow']) {
    const t = root.querySelector(`#${id}`);
    t.columns = orderColumns();
    t.data = ORDERS.map((o) => ({ ...o }));
  }
  const posts = root.querySelector('#rsp-table-density');
  posts.columns = densityColumns();
  posts.data = POSTS.map((o) => ({ ...o }));
  posts.selectedKeys = [2]; // v0.37.0: one selected card (accent border) in every screenshot
  // v0.49.0: capacity buttons (hint = price), 8 long-label options, colour swatches
  const caps = [{ value: '128', label: '128GB', hint: '21.990.000₫' }, { value: '256', label: '256GB', hint: '24.990.000₫' },
    { value: '512', label: '512GB', hint: '29.990.000₫', unavailable: true }, { value: '1tb', label: '1TB', disabled: true }];
  root.querySelector('#rsp-choice').options = caps;
  root.querySelector('#rsp-choice-narrow').options = caps;
  root.querySelector('#rsp-choice-long').options = ['Bảo hành chính hãng 12 tháng tại tất cả trung tâm', 'Bảo hành mở rộng 24 tháng kèm đổi mới 30 ngày',
    'Bảo hành rơi vỡ vào nước 12 tháng', 'Không mua thêm bảo hành', 'Gói VIP 1 đổi 1 trong 365 ngày toàn quốc', 'Gói doanh nghiệp',
    'Bảo hành pin 18 tháng', 'Bảo hành màn hình trọn đời máy'].map((label, i) => ({ value: `g${i}`, label, unavailable: i === 2 }));
  root.querySelector('#rsp-choice-swatch').options = [{ value: 'den', label: 'Titan đen', swatch: '#3b3b3d' },
    { value: 'trang', label: 'Titan trắng', swatch: '#f4f4f2' }, { value: 'sa', label: 'Titan sa mạc', image: '/test/fixtures/1.svg', unavailable: true },
    { value: 'xanh', label: 'Titan xanh', swatch: '#1e3a5f' }, { value: 'x', label: 'Hồng', swatch: '#f9a8d4', disabled: true }];
  // v0.38.0: 30 scanned IMEI rows (+ one invalid) in the multiple scan input; 3 in the narrow column
  const imeis = Array.from({ length: 30 }, (_, i) => `35693803564${String(3800 + i).padStart(4, '0')}`);
  root.querySelector('#rsp-scan-multi').values = imeis;
  root.querySelector('#rsp-scan-narrow').values = imeis.slice(0, 3);
  // v0.47.0: permissions × 12 roles, 40 rows in 4 groups (one collapsed), locks, n/a, notes (auto: one column < 720)
  const matrixRoles = ['Chủ cửa hàng', 'Quản lý chi nhánh', 'Bán hàng', 'Kho', 'Kế toán', 'Marketing', 'CSKH', 'Giao hàng', 'Thu ngân',
    'Kiểm toán', 'Đối tác', 'Cộng tác viên'];
  const mods = ['Sản phẩm', 'Đơn hàng', 'Khách hàng', 'Báo cáo doanh thu theo kênh bán hàng'];
  root.querySelector('#rsp-matrix').setData({
    columns: matrixRoles.map((label, i) => ({ key: `role${i}`, label, locked: i === 11 })),
    rows: mods.map((label, g) => ({ key: `m${g}`, label, collapsed: g === 2,
      rows: Array.from({ length: 10 }, (_, k) => ({ key: `m${g}.p${k}`, label: `${label}: quyền thao tác số ${k + 1}` })) })),
    cells: { 'm0.p0': { role0: { locked: true, note: 'Không tự sửa role của mình' }, role2: { na: true } } },
    value: { role0: ['m0.p0', 'm0.p1', 'm1.p3'], role1: ['m0.p2'] },
  });
  // v0.39.0: filter bar → chips → controlled server table (column menu, one hidden column)
  root.querySelector('#rsp-filter-status').options = [{ value: '', label: 'Tất cả' }, { value: 'new', label: 'Chờ xác nhận' }, { value: 'ship', label: 'Đang giao' }];
  root.querySelector('#rsp-chips').items = [
    { key: 'shop', label: 'Kho', value: 'Hà Nội', removable: false },
    { key: 'q', label: 'Tìm', value: 'iphone' },
    { key: 'status', label: 'Trạng thái', value: 'Chờ xác nhận' },
    { id: 'tag-1', key: 'tag', label: 'Nhãn', value: 'Khách quen' },
    { id: 'tag-2', key: 'tag', label: 'Nhãn', value: 'Đơn trả góp 0 % kỳ hạn 12 tháng' },
  ];
  const ft = root.querySelector('#rsp-table-filters');
  ft.hiddenColumns = ['phone'];
  ft.columns = orderColumns();
  ft.setState({ page: 1, filters: { q: 'iphone', status: 'new' }, data: ORDERS.slice(0, 5).map((o) => ({ ...o })) });
  // v0.45.0: steps (6, one error with a long description) + timeline (40 items over 10 days, fixed now, details open)
  const STEPS = [{ label: 'Tải tệp lên' }, { label: 'Kiểm tra dữ liệu', state: 'error', description: 'Dòng 12: thiếu IMEI, dòng 40: trùng mã' },
    { label: 'Ghép sản phẩm theo mã nội bộ' }, { label: 'Xem trước' }, { label: 'Nhập kho' }, { label: 'Hoàn tất' }];
  for (const id of ['rsp-steps', 'rsp-steps-v', 'rsp-steps-narrow']) root.querySelector(`#${id}`).steps = STEPS;
  const tlNow = new Date('2026-10-05T03:00:00Z');
  const events = Array.from({ length: 40 }, (_, i) => ({ id: `e${i}`, time: new Date(tlNow.getTime() - i * 6 * 3600e3).toISOString(),
    title: i % 5 === 0 ? 'Đổi trạng thái đơn: Chờ xác nhận → Đang giao cho đơn vị vận chuyển' : `Cập nhật đơn hàng #DH-${1000 + i}`,
    actor: i % 3 === 0 ? { name: 'Nguyễn Văn An', href: '#rsp-timeline' } : 'Hệ thống', meta: i % 4 === 0 ? 'Kho Hà Nội · IP 113.161.0.1' : undefined,
    icon: ['pencil', 'send', 'success', 'warning'][i % 4], tone: ['neutral', 'info', 'success', 'warning'][i % 4],
    details: i % 7 === 0 ? 'Trước: 12 Hàng Bài, Hoàn Kiếm\nSau: 45 Lý Thường Kiệt, Hoàn Kiếm, Hà Nội' : undefined, expanded: i === 0 }));
  for (const id of ['rsp-timeline', 'rsp-timeline-narrow']) {
    const t = root.querySelector(`#${id}`);
    t.now = tlNow;
    t.items = id === 'rsp-timeline' ? events : events.slice(0, 8);
  }
  // v0.46.0: an audit diff (dsuite policy `fields`) + a forced table
  const diffItems = [
    { key: 'total', label: 'Tổng tiền', type: 'money', before: 32990000, after: 31490000 },
    { key: 'status', label: 'Trạng thái', type: 'enum', options: { new: 'Chờ xác nhận', ship: 'Đang giao' }, before: 'new', after: 'ship' },
    { key: 'note', label: 'Ghi chú giao hàng', before: 'Gọi trước khi giao', after: 'Giao giờ hành chính, gọi trước 30 phút. '.repeat(10) },
    { key: 'tags', label: 'Nhãn', before: ['khách quen'], after: ['khách quen', 'trả góp 0 %'] },
    { key: 'phone', label: 'SĐT khách', masked: true, before: '***678', after: '***901' },
    { key: 'id', label: 'Mã đơn', before: 'DH10240', after: 'DH10240' },
  ];
  root.querySelector('#rsp-diff').items = diffItems;
  root.querySelector('#rsp-diff-table').items = diffItems;
  root.querySelector('#rsp-empty').actions = [{ label: 'Tạo đơn hàng mới', variant: 'primary' }, { label: 'Nhập từ tệp Excel', variant: 'secondary' }];

  TdMenu.define('rsp-menu', [
    { label: 'Sửa bài viết', icon: 'plus' }, { label: 'Chia sẻ' }, { separator: true }, { label: 'Xoá', danger: true },
  ]);
  TdMenu.bind(root.querySelector('#rsp-menu-btn button'), 'rsp-menu');
  TdHovercard.bind(root.querySelector('#rsp-hovercard'), {
    label: 'Hồ sơ tác giả',
    content: () => {
      const box = document.createElement('div');
      box.textContent = 'Nguyễn Văn An — Biên tập viên · 128 bài viết';
      return box;
    },
  });
  TdLightbox.bind(root.querySelector('#rsp-gallery'));

  const drawer = document.createElement('td-drawer');
  drawer.setAttribute('title', 'Bộ lọc đơn hàng');
  drawer.innerHTML = '<td-input-field label="Từ khoá" placeholder="Mã đơn, tên khách…"></td-input-field><td-checkbox label="Chỉ đơn chưa giao"></td-checkbox>'
    + '<div slot="footer"><button type="button" class="td-btn td-btn--primary"><span class="td-btn__label">Áp dụng</span></button></div>';
  root.append(drawer);

  const openers = {
    toast: () => {
      TdToast.error('Không thể kết nối tới máy chủ thanh toán. Vui lòng thử lại sau ít phút hoặc liên hệ hỗ trợ.', 0);
      TdToast.success('Đã lưu', 0);
      TdToast.warning('Dữ liệu chưa lưu, rời trang sẽ mất thay đổi!', 0);
    },
    modalConfirm: () => { TdModal.confirm({ title: 'Xác nhận xoá đơn hàng', message: 'Bạn có chắc muốn xoá đơn hàng DH10240 không? Thao tác không hoàn tác.' }); },
    modalLong: () => {
      TdModal.show({
        title: 'Chỉnh sửa sản phẩm iPhone 16 Pro Max 256GB',
        size: 'xl',
        body: `<p>${'Nội dung dài để kiểm tra cuộn trong thân modal. '.repeat(60)}</p>`,
        actions: [{ label: 'Huỷ', variant: 'secondary' }, { label: 'Lưu thay đổi', variant: 'primary' }, { label: 'Lưu và xuất bản', variant: 'success' }],
      });
    },
    drawer: () => drawer.show(),
    lightbox: () => TdLightbox.open([1, 2, 3].map((n) => ({ src: `/test/fixtures/${n}.svg`, caption: `Ảnh mẫu ${n}` }))),
    lightboxPanel: () => TdLightbox.open([1, 2].map((n) => ({ src: `/test/fixtures/${n}.svg`, caption: `Ảnh mẫu ${n} có chú thích dài` })), {
      panel: (ctx) => { const p = document.createElement('p'); p.textContent = ctx.item.caption; return p; },
      // v0.36.0 (QĐ 59): a pinned panel toggle + one more extra → below 480 the extra goes into the "Thêm" menu
      toolbar: [{ id: 'info', label: 'Thông tin', icon: 'info', pinned: true, onClick: () => {} },
        { id: 'share', label: 'Chia sẻ', icon: 'link', onClick: () => {} }],
    }),
    loading: () => TdLoading.show('Đang xử lý đơn hàng, vui lòng chờ...'),
    cropDialog: () => TdCropper.openDialog({ src: '/test/fixtures/photo.svg', alt: 'Ảnh phong cảnh', naturalWidth: 1200,
      naturalHeight: 800, aspectRatio: 1.91, allowFocalPoint: true, focalPoint: { x: 0.5, y: 0.5 } }),
    pickerCrop: () => TdMediaPicker.open({ adapter: createMockAdapter({ latency: 0 }), selection: { mode: 'single', kinds: ['image'] },
      crop: { enabled: true, aspectRatio: 1.91, allowFocalPoint: true } }),
    picker: (multiple = false, pages = false) => {
      const adapter = createMockAdapter({ latency: 0, ...(pages ? { pagination: 'pages' } : {}) });
      return TdMediaPicker.open({ adapter, ...(pages ? { pagination: 'pages' } : {}),
        selection: multiple ? { mode: 'multiple', maxItems: 5 } : { mode: 'single' } });
    },
    // v0.44.0: type-to-confirm with a 60-character phrase without spaces (must wrap, never overflow)
    modalTypeConfirm: () => { TdModal.confirm({ title: 'Xoá vĩnh viễn đơn hàng', message: 'Không thể hoàn tác.', confirmVariant: 'danger',
      typeToConfirm: 'XOA-VINH-VIEN-DON-HANG-DH10240-VA-TOAN-BO-LICH-SU-THANH-TOAN' }); },
  };
  return { openers };
}
