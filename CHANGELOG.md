# Changelog

All notable changes to **td-components** are documented here.

## 0.43.0

**`<td-media-gallery>` — trường nhiều ảnh** (roadmap "field gallery"; plan `docs/internal/plans/v0.43.0-media-gallery.md`,
Codex plan-review APPROVE 3 vòng; [ADR 0021](docs/internal/decisions/0021-media-gallery-form-shape.md)). Không có thay đổi
phá vỡ.

### Added

- `<td-media-gallery>` (`./media-gallery`, `TdMediaGallery`): lưới ảnh có thứ tự — thêm bằng media picker chọn nhiều
  (chỉ thêm, bỏ qua ảnh đã có, giới hạn theo `max`), gỡ từng ảnh, sắp xếp lại bằng kéo / chạm để nhấc / bàn phím; alt,
  vùng cắt và điểm trọng tâm theo từng ảnh (hộp cắt sẵn có, chỉ toạ độ); ảnh đầu là ảnh bìa (badge tuỳ chọn `cover`);
  `required` / `min` / `max` (trần cứng 100); 2 cột trên điện thoại.
- Form: `name[]=id` (mặc định) hoặc `name[i][id|alt|crop|focal]` (chế độ `usage`); gallery rỗng gửi `name=`; dữ liệu
  lỗi hoặc vượt `max` **không gửi gì** (server giữ nguyên, không bao giờ thành "xoá hết").
- PHP `td_media_gallery()` + SSR `media-gallery@1` (id `int` được chuẩn hoá thành chuỗi; một đường kiểm tra chung với JS).
- Hướng dẫn vendor PHP: thư mục `bin/` (CLI `td-theme`), chạy bằng `node <vendor>/bin/td-theme.mjs`, sinh lại file theme
  khi `ALGORITHM_VERSION` đổi.

### Fixed

- PHP `td_media_field()` / `td_media_gallery()`: `preview_src` / `src` có UTF-8 hỏng hoặc dài hơn 8192 byte bị bỏ (không
  có ảnh) thay vì in ra; `td_media_gallery()` không bao giờ ném `JsonException` (UTF-8 hỏng → bỏ trường, mã hoá lỗi →
  fail closed) và giới hạn mọi chuỗi trước khi mã hoá (tên hiển thị tối đa 512 ký tự, như JS).

## 0.42.1

**Vá tương phản dark** (theme dark có sẵn; light không đổi). Chi tiết: `docs/upgrading/breaking-changes.md#0421`.

### Fixed

- Link trong khung tóm tắt lỗi form khi **nhấn** ở dark: 3.30 → 6.34:1 — token mới `--td-form-summary-pressed-bg` (dark
  làm tối nền khi nhấn; light = `var(--td-color-pressed)` như cũ).
- Nút × xoá chip (`td-chip-input`) khi **nhấn** ở dark: 4.22 → 4.88:1 (`--td-chip-remove-hover` dark 16 % → 13 %).
- Bộ sinh màu: `ALGORITHM_VERSION` 1 → 2 — file sinh mới có thêm `--td-form-summary-pressed-bg` theo palette; mọi giá
  trị khác giữ nguyên từng byte, file sinh bằng bản 1 vẫn hiển thị đúng.

## 0.42.0

**Bộ sinh màu tự cân tương phản + theme theo vùng** (theming R2; plan `docs/internal/plans/v0.41.0-theming.md` phần R2;
[ADR 0020](docs/internal/decisions/0020-theme-scope-portal.md)). Không đặt `data-td-theme` hoặc chỉ đặt trên `<html>`:
mọi token giữ giá trị như 0.41 (golden light + dark không đổi). Chi tiết nâng cấp: `docs/upgrading/breaking-changes.md#0420`.

### Added

- **Bộ sinh màu** `@dazzxq/td-components/theme` (`generatePalette`, `toCss`…): từ `bg` + `accent` (tuỳ chọn `surface`,
  `raisedSurface`, `controlSurface`, màu trạng thái) sinh ~86 token theme + 36 token component phụ thuộc sáng / tối (hover,
  nhấn, tạo mới, dòng chọn… — theme tối dưới tên riêng không phụ thuộc rule dark của kit), chữ / viền / focus / accent / trạng thái tự đạt
  WCAG AA; nền rơi vào "vùng chết" giữ nguyên màu site, chọn chữ đen / trắng tốt nhất và báo
  `TD_THEME_CONTRAST_UNSATISFIABLE` (không bao giờ tự đổi nền). Tất định: cùng seed → cùng CSS từng byte.
- **CLI** `npx td-theme --bg '#ece5d8' --accent '#b3261e' > site-theme.css`: CSS tĩnh bọc `@layer td.tokens` ra stdout,
  chẩn đoán ra stderr (`--diagnostics=json`), exit 1 khi trượt AA bắt buộc (trừ `--allow-aa-failure`), 2 input sai, 3 lỗi
  nội bộ; `--preset light|dark` in lại theme có sẵn. Site PHP chỉ cần `<link>` file sinh ra — không cần Node lúc chạy.
- **Trang chọn màu không cần Node**: `src/theme/builder/theme-builder.html` (mở qua web server tĩnh bất kỳ, không
  `file://`), xem trước component, bảng tỉ lệ WCAG, copy / tải CSS; trượt AA phải tick "Xuất dù trượt AA".
- **Theme theo vùng**: `data-td-theme="dark|light|auto|<tên>"` trên bất kỳ phần tử nào; popup / modal / toast mở từ trong
  vùng đi theo theme của vùng (cầu portal; overlay gọi bằng code nhận `themeRoot`).
- Gate: fuzz 10 000 seed, so khớp từng byte giữa module / CLI / builder trên 3 engine, first paint với CSS sinh sẵn khi tắt JS,
  gate toàn trang thêm bảng màu do generator sinh (be, navy ở khe trang và dạng theme có tên) + cặp
  tương phản trạng thái hover / nhấn / tạo mới / dòng chọn.

### Changed

- Token **màu** khai báo lại trên `[data-td-theme]`: override màu không layer trên `:root` của site không còn chảy vào bên
  trong vùng có attribute (chỉ ảnh hưởng site **chủ động** dùng vùng); token hình học vẫn chỉ trên `:root`.
- Gom 4 hàm tính tương phản trùng lặp vào một lõi màu chung (`src/theme/color.js`), không đổi kết quả.

## 0.41.0

**Theme chính thức: light / dark / auto** (theming R1; owner: "hỗ trợ cả dark mode và light mode" + màu nền tuỳ biến;
đồng thuận Codex think-about; plan `docs/internal/plans/v0.41.0-theming.md`, Codex plan-review APPROVE 2 vòng). Không
đặt `data-td-theme` → light **giữ y nguyên từng pixel** như 0.40 (golden test khoá), trừ hai thay đổi đã duyệt: vòng focus
bàn phím ≥ 3:1 và viền checkbox chọn dòng của bảng. Chi tiết nâng cấp:
`docs/upgrading/breaking-changes.md#0410`; hướng dẫn `docs/customization/theming.md`.

### Added

- `data-td-theme="light|dark|auto"`: `auto` theo `prefers-color-scheme` bằng CSS thuần (sinh lúc build từ khối dark — không
  JS, không chớp trắng); `color-scheme` theo từng chế độ tường minh.
- Hợp đồng token theme (`src/theme/tokens.js`): `--td-color-surface-raised`, `--td-color-text-label`, `--td-color-fill`,
  `--td-color-fill-strong`, `--td-color-on-fill`; ô nhập / popup / glass đọc `surface-raised` (mặc định = surface). Site
  nền be: đặt `--td-color-bg` + `--td-color-surface` (công thức trong theming.md). Bộ sinh màu tự động là v0.42.
- Gate mới: golden token (light + dark khoá), quét chữ / viền control / focus / "đảo trắng" toàn trang với 4 bảng màu
  (light, dark, be, navy) × 3 engine; test first-paint không JS cho `auto`. Demo có chọn theme.

### Changed

- **Dark** (opt-in) tinh chỉnh: viền ô nhập / checkbox / switch ≥ 3:1 (`--td-control-border-soft` `#76767c`), chữ phụ
  `#acacb4`, accent `#4b8df8`, tooltip nền xám `#3a3a3e` + viền sáng, `--td-shadow-1..3` và viền / bóng popup rõ hơn.
- Component đọc token ngữ nghĩa: site đã đổi `--td-color-surface` / `-text` / `-text-muted` / màu trạng thái sẽ thấy ô
  nhập, modal, placeholder, mực badge đi theo.
- **Vòng focus bàn phím** (`--td-focus-ring`, light + dark, owner duyệt): vòng đặc 2px màu `--td-focus` sau khe 1px màu
  `--td-color-surface` (cùng bề dày 3px) thay vòng mờ 35 % / 45 % (≈ 1.7:1) → ≥ 3:1 với nền ngoài và nền control; gate
  toàn trang đo vòng thật sau khi Tab. Khôi phục: `:root { --td-focus-ring: 0 0 0 3px rgb(37 99 235 / 35%); }`.

### Fixed

- Checkbox chọn dòng của `td-table` dùng viền checkbox chung (light 1.27 → 1.52:1 như mọi checkbox; dark ≥ 3:1) — lỗi từ
  0.37.
- Test vuốt lightbox chuyển ảnh theo quãng đường (không còn phụ thuộc tốc độ sự kiện giả lập).

## 0.40.0

**`<td-datetime-range>` — chọn khoảng ngày / giờ + preset** (plan `docs/internal/plans/v0.39.0-filters-range.md` phần
v0.40, Codex plan-review APPROVE 3 vòng). Trang: `docs/components/datetime-range.md`. Không có thay đổi phá vỡ. Xong P1.

### Added

- `<td-datetime-range>` (`./datetime-range`, `TdDatetimeRange`): một trigger "Từ – Đến", hộp thoại hai phía (dưới 720px là
  sheet, chuyển "Từ | Đến"), preset ("Hôm nay", "7 ngày qua", "Tháng này"… hoặc của site), kiểm thứ tự Từ ≤ Đến, giá trị
  `{ start, end }`, form-associated (`name[start]` / `name[end]`), `required` theo từng phía, khôi phục trạng thái form
  (JSON v1, giới hạn độ dài). Gợi ý ghép với bộ lọc `<td-table>` + `<td-filter-chips>` (v0.39) trong docs.
- PHP `td_datetime_range()` + SSR `datetime-range@1` (cổng hydrate riêng, kiểm cấu trúc chặt; ngày kiểm `checkdate`).
- Nội bộ: phần nhập ngày của `<td-datetime-picker>` tách thành `datetime-panel.js` (picker không đổi hành vi).

## 0.39.0

**Bộ lọc ngoài, ẩn / hiện cột, chip bộ lọc** (plan `docs/internal/plans/v0.39.0-filters-range.md` phần v0.39, Codex
plan-review APPROVE 3 vòng). Chi tiết nâng cấp: `docs/upgrading/breaking-changes.md#0390`.

### Added

- `<td-table>`: event `request-change` (lọc / sắp xếp / trang / per-page từ một chỗ), chế độ `controlled` + `setState()`
  (app giữ trạng thái, đồng bộ URL; `requestId` bỏ phản hồi muộn), `setFilters()`; `getState()` thêm `filters`,
  `totalItems`, `requestId` (table.md mục 11).
- Ẩn / hiện cột: `hideable` / `hidden` trong `columns`, `hiddenColumns`, event `columns-change`, nút menu "Cột"
  (`column-menu`), `min-visible`; cột chọn dòng không bao giờ bị ẩn (table.md mục 12).
- `<td-filter-chips>` (`./filter-chips`, `TdFilterChips`): chip bộ lọc đang áp, × bỏ từng lọc, "Xoá tất cả"; link × chạy
  không cần JS; < 480px một hàng cuộn ngang. PHP `td_filter_chips()` + SSR `filter-chips@1`.
- TdMenu `ctx.setDisabled(id, disabled, hint?)`; icon `columns`.

### Changed

- `hidden: true` trong định nghĩa cột giờ thật sự ẩn cột (trước không có tác dụng).
- `onPageChange` (server mode) chạy khi lượt bấm đổi trang kết thúc (sau `page-change` và `request-change`).

### Security

- `href` / `clear-href` của chip: link "bỏ lọc" không bao giờ rời site — JS chỉ nhận http(s) cùng origin (tương đối,
  `?query`, `#hash`), PHP chỉ URL tương đối; chặn `//host`, `\`, `javascript:`, `data:`, `blob:`…; tối đa 200 chip, xử lý
  có trần (review SEC-1 / SEC-2); chip chỉ dựng bằng text, cắt độ dài, bỏ ký tự điều khiển. Ẩn cột là hiển thị, không
  phải phân quyền (server không gửi cột người dùng không được xem).

## 0.38.0

**`<td-scan-input>` — ô quét mã vạch** (dsuite A3; plan `docs/internal/plans/v0.38.0-scan-input.md`, Codex plan-review
APPROVE 3 vòng). Trang: `docs/components/scan-input.md`. Không có thay đổi phá vỡ.

### Added

- `<td-scan-input>` (`./scan-input`, `TdScanInput`): nhận diện lần quét từ máy quét kiểu bàn phím (nhịp gõ nhanh +
  Enter / Tab) khác người gõ tay; chuẩn hoá (bỏ ký tự điều khiển, cắt 128 ký tự), chống quét trùng, `validate(value,
  { signal })` bất đồng bộ có hàng đợi theo thứ tự (tối đa 16, bỏ kết quả muộn), âm báo tuỳ chọn (Web Audio, nút tắt
  tiếng); chế độ **một mã** và **nhiều mã** (`multiple`, danh sách có xoá từng dòng, `max`), form-associated (`name[]` →
  một mục mỗi mã hợp lệ).
- PHP `td_scan_input()` + SSR `scan-input@1` (kiểm cấu trúc chặt khi adopt).
- Icon `scan`, `volume`, `volume-off`; lane `test:engines` chạy mọi `test/engines/*.spec.mjs`.

## 0.37.0

**`<td-table>` chọn dòng** (plan `docs/internal/plans/v0.37.0-table-row-selection.md`, Codex plan-review APPROVE 2 vòng;
[ADR 0018](docs/internal/decisions/0018-table-row-selection.md)). Chi tiết nâng cấp:
`docs/upgrading/breaking-changes.md#0370`.

### Added

- `selectable="multiple|single"` + `rowKey`: mỗi dòng một `button[role=checkbox]` dùng tick chung `.td-check`; ô chọn tất
  cả (trang này, ba trạng thái); Shift chọn dải; `max-selected` (chỉ chặn thao tác người dùng); lựa chọn giữ qua trang /
  sắp xếp / đổi dữ liệu; `rowSelectable` khoá từng dòng.
- API `selectedKeys` / `selectedRows` / `select()` / `deselect()` / `clearSelection()` (im lặng trừ `{ emit: true }`),
  event `select-change` (`keys`, `added`, `removed`, `trigger`) và `select-limit`.
- Tham gia form: có `name` → mỗi khoá đã chọn là một mục FormData (`String(key)`, kể cả khoá ở trang khác).
- Dạng card: chip "chọn tất cả trang này" đầu thanh sắp xếp, card đã chọn viền accent; ô chọn 44px trên cảm ứng.
- Công thức thanh thao tác hàng loạt + "chọn tất cả N kết quả" trong docs; ví dụ PHP nhận form có CSRF, giới hạn id, xoá
  trong một truy vấn có điều kiện chủ sở hữu.

### Changed

- `<td-table disabled>` giờ khoá cả bảng như một control form (trình duyệt chặn click bên trong). Chỉ muốn khoá việc
  chọn: `rowSelectable = () => false`.

### Security

- Khoá dòng chỉ đọc từ thuộc tính riêng / prototype của lớp (không bao giờ từ `Object.prototype`); getter ném lỗi → dòng
  không chọn được. Khoá trùng (sau `String(key)`, kể cả `1` và `"1"`) trên toàn dữ liệu client → chỉ dòng đầu chọn được.

## 0.36.2

**Chuẩn cảm ứng toàn kit** (owner: "hỗ trợ behaviors touch chuẩn nhất có thể cho toàn bộ components"; đồng thuận Codex
think-about; plan `docs/internal/plans/v0.36.2-touch.md`, Codex plan-review APPROVE 3 vòng;
[ADR 0019](docs/internal/decisions/0019-touch-standard.md), hướng dẫn `docs/guides/touch.md`). Chi tiết nâng cấp:
`docs/upgrading/breaking-changes.md#0362`.

### Added

- **Hình nhấn** trên mọi control tương tác (`:active` + `[data-td-pressed]` qua Pointer Events — có cả trên iPhone), token
  `--td-*-pressed` (contrast gate kiểm cả cặp nhấn).
- `<td-number-input enterkeyhint>`.
- Lane test cảm ứng `npm run test:touch` (Chromium touch + CDP vuốt / pinch, WebKit iPhone smoke) trong `npm test`;
  lint CSS: `:hover` phải nằm trong `(hover: hover) and (pointer: fine)`, control tương tác phải có hình nhấn.
- Checklist iPhone thật `docs/internal/release-touch-checklist.md` + khu "Cảm ứng" trong demo.

### Changed

- Hover chỉ còn trên con trỏ mịn (hết hover dính sau khi chạm).
- Tooltip không bật khi chạm (kể cả focus do chạm); bàn phím / chuột / bút không đổi.
- Ngưỡng kéo theo loại con trỏ ở sortable / repeater / media-grid: chạm 10px, bút 8px, chuột 4px.
- Modal / drawer / media picker (kể cả dialog tải lên, sheet bộ lọc) co theo bàn phím ảo: ô đang nhập + dòng lỗi + footer
  luôn thấy được, không cuộn trang, không đổi focus.
- Lightbox: ảnh đi theo ngón khi vuốt ngang, chuyển khi qua 1/4 bề rộng hoặc vuốt nhanh, không thì bật về; một ảnh = dây
  chun; reduced motion đổi ngay.

## 0.36.1

**`<td-table>` dạng card gọn hơn** (plan `docs/internal/plans/v0.36.1-table-card-density.md`, Codex plan-review APPROVE 2
vòng; QĐ 62 của 0.36.0). Đo ở 360 / 393 / 768: card 5 cột 220 → 115px, card 9 cột 294 → 174px (chuột) / 208px (cảm
ứng), thanh sắp xếp 2–3 hàng → 1 hàng. Chi tiết nâng cấp: `docs/upgrading/breaking-changes.md#0361`.

### Added

- Vai trò card **`lead`** (`card: 'lead'`): ID nhỏ, màu nhạt, đứng trước tiêu đề; cột đầu không khai báo `card` tự thành
  `lead` khi có cột khác `card: 'primary'`.
- Class `td-table__action--icon`: action có `icon` hợp lệ (và nút "Thao tác") chỉ hiện icon ở card.
- Token `--td-table-card-pair-min`, `--td-table-card-cell-py`.

### Changed

- Cặp `secondary` xếp theo nội dung (cặp ngắn chung dòng), bỏ mốc 480px; giá trị bị cắt (ellipsis) ở cùng dòng với nhãn.
- Thao tác nằm cuối dòng meta; thanh sắp xếp một hàng cuộn ngang.
- Khoảng cách card gọn hơn (`--td-table-card-gap` / `-px` / `-py` lùi một bậc); tiêu đề primary `line-height` 1.25.

## 0.36.0

**Polish theo owner** — tick chung, phím tắt chọn, màu ngữ nghĩa đặc, toast 6 vị trí, OTP tuỳ độ dài / ký tự, nút thao
tác, picker / modal gọn trên di động, lightbox điện thoại, hàng option kiểu dcms2 (plan
`docs/internal/plans/v0.36.0-polish.md`, Codex plan-review APPROVE 3 vòng; [ADR 0016](docs/internal/decisions/0016-toast-placement.md),
[ADR 0017](docs/internal/decisions/0017-shared-check-mark.md)). Chi tiết nâng cấp: `docs/upgrading/breaking-changes.md#0360`.

### Added

- **`<td-action-button>`** (`./action-button`) — 23 preset kiểu dcms2 ActionButtons (sửa, xoá, xem, sao chép…), icon +
  nhãn + tooltip, PHP `td_action_button()` + SSR.
- **Toast vị trí**: `TdToast.configure({ placement })` + tham số thứ ba `{ duration?, placement? }`; 6 vị trí logic
  (`top-start|center|end`, `bottom-start|center|end`), mới nhất sát mép.
- **OTP**: `length` 1–10 (mặc định 6), `charset` (`numeric` | `alphanumeric` | `alpha`, kiểu Steam), `case`; PHP cùng
  option.
- **`td-checkbox indeterminate`**; ô tick chung `.td-check` (ADR 0017) cho media grid / picker / tree / multiselect / menu.
- **Phím tắt chọn**: Ctrl/Cmd+click bật/tắt một mục, Shift+click chọn dải trong `td-media-grid` / picker.
- **Media picker**: sheet "Bộ lọc" < 1024px, tự xem trước (≥ 720px: mục đang xem → mục đã chọn đầu tiên → mục đầu; không
  tự chọn; kết quả rỗng → panel trống, 720–1023px cột chi tiết thu lại), dialog tải lên là sheet < 720px, chip footer
  "{n} đã chọn ×" thay "Đã chọn …" + "Bỏ chọn tất cả", < 720px "Quay lại" là mũi tên trên header và tối đa 3 nút trong
  pane chi tiết (còn lại vào "Thêm").
- **Lightbox điện thoại**: thanh đáy "‹ 3 / 12 ›" < 480px, đĩa 48px hai bên ảnh trên cảm ứng ≥ 480px, menu "Thêm" cho nút
  phụ, option `pinned` cho nút riêng.
- `td-copy for=` đọc được `<td-input-field>`.
- Hướng dẫn `docs/guides/media-renditions.md`: phục vụ ảnh cắt từ ảnh gốc + **chống lạm dụng** (URL ký HMAC, allowlist
  bề rộng / định dạng, làm tròn toạ độ, cache, giới hạn tần suất) — việc của site.

### Changed

- Nút / badge ngữ nghĩa **màu đặc** (warning chữ tối); badge viền 1px + bóng; alert vạch màu đặc ở mép đầu dòng.
- **Toast DOM**: root > lane > chồng (xem breaking changes); màu đặc.
- Tab và phân trang giữ bề rộng chữ đậm (không còn xê dịch khi đổi tab / trang).
- Hàng option trong dropdown / multiselect / tree-select / menu **tràn mép** như dcms2 (không bo, vạch nhấn khi active
  bằng bàn phím); token `--td-option-*`.
- Modal < 720px: header ≤ 56px, footer ≤ 64px; datetime sheet < 720px gọn (3 dòng bánh xe); drawer < 480px chừa dải trang.
- Lượt UX di động: lưới media 2 cột trên điện thoại, nhãn ≥ 14px, khoảng cách chạm ≥ 8px, repeater gọn.
- `td-cropper`: lăn trackpad được giảm chấn.
- Lightbox: bấm chuột ra ngoài menu tải về / "Thêm" chỉ đóng menu (không zoom); vuốt RTL đúng chiều; bỏ qua vuốt bắt đầu
  sát mép; sheet panel chỉ kéo từ thanh nắm.

### Fixed

- Ô OTP bị ép méo trên điện thoại.
- Lightbox mở lại loé ảnh của lần xem trước.
- Ảnh thumbnail lightbox, ảnh media field, toast root, nhóm nút thao tác tự đặt `max-width` / `line-height` — reset CSS của
  trang chủ không còn làm lệch.

## 0.35.0

**Cắt ảnh — chỉ toạ độ** (dsuite #13; plan `docs/internal/plans/v0.35.0-cropper.md`, Codex plan-review APPROVE 3 vòng;
[ADR 0015](docs/internal/decisions/0015-td-cropper.md); ADR 0013 mục "Bổ sung v0.35").

### Added

- **`<td-cropper>`** — khung cắt trên ảnh, **chỉ trả toạ độ** (không bao giờ tạo canvas / blob / file mới, không
  `fetch`, không upload — có test chặn): `src` (qua allowlist URL), `natural-width` / `natural-height`, `aspect-ratio`
  (khoá tỉ lệ, hoặc tự do với preset 1:1, 4:3, 3:2, 16:9, 1.91:1), `crop`, `focal-point` + `focal`. Kéo / đổi cỡ bằng chuột, cảm ứng, bút; zoom =
  đổi cỡ khung quanh tâm / con trỏ / giữa hai ngón; **bàn phím** (mũi tên 1%, Shift 10%, `+` / `-`, Tab qua khung → 4 góc →
  điểm trọng tâm) + thông báo cho trình đọc màn hình; vùng chạm ≥ 44px trên cảm ứng. Sự kiện `crop-input`, `crop-change`
  (`normalized` 0..1 + `pixels` theo ảnh gốc khi biết kích thước + `aspectRatio`), `focal-change`, `image-ready`,
  `image-error`. Export `@dazzxq/td-components/cropper`.
- **Media picker — bước cắt:** `crop: { enabled, aspectRatio, allowFocalPoint }` → chọn một ảnh rồi "Chèn" mở bước cắt ("Quay
  lại" / "Chèn"); kết quả vào `SelectedMedia.usage.crop` / `focalPoint` (picker không sửa trang gọi). Chọn nhiều → bỏ
  crop + cảnh báo một lần.
- **`<td-media-field croppable>`** (chế độ `usage`): nút "Cắt ảnh", `crop-ratio` (mặc định theo `aspect-ratio`), xem
  trước đúng vùng đã cắt. `focal-point` bật thêm mục form **`name[focal]`** = `{"v":1,"x","y"}` hoặc `null` (không bật →
  vẫn đúng 3 mục như 0.34). Cắt cần ảnh **nguyên chưa cắt**: có adapter thì lấy `urls.preview` + kích thước gốc qua
  `get()`; trang PHP / HTML phải in `preview-src` là ảnh gốc. Field không `croppable` giữ nguyên hành vi 0.34 (kể cả khi
  site bật crop trong defaults).
- PHP `td_media_field`: option `croppable`, `crop_ratio`, `focal_point`, `focal`; phần in `crop` không đổi.

### Changed

- Picker: `crop: { enabled: true }` (0.32–0.34 chỉ cảnh báo, `usage.crop` luôn `null`) giờ **mở bước cắt** khi chọn một
  ảnh; `urls.preview` của adapter phải là ảnh nguyên chưa cắt (lệch tỉ lệ so với `width/height` → bước cắt báo lỗi, "Chèn"
  khoá). Tỉ lệ cắt công khai (`crop.aspectRatio`, `crop-ratio`, PHP `crop_ratio`, `<td-cropper aspect-ratio>`) trong
  **[0.01, 100]** — ngoài khoảng bị từ chối + một cảnh báo, cắt tự do.
- `<td-media-field>` getter `selection`: `usage.focalPoint` là giá trị thật khi có `focal-point` (0.34 luôn `null`).
  Không có thay đổi phá vỡ: field không `croppable` / `focal-point` gửi form đúng từng byte như 0.34.

## 0.34.0

**Responsive chuẩn toàn kit** — điện thoại → máy gập → tablet dọc (iPad mini) → desktop (owner + yêu cầu dsuite; audit đo ở
360/393/430/600/700/744/768/884/1024/1280/1440 + ngang 844×390, chuột và cảm ứng; plan
`docs/internal/plans/v0.34.0-responsive.md`, Codex plan-review APPROVE 3 vòng; quy ước:
[ADR 0014](docs/internal/decisions/0014-breakpoints-container-queries.md)).

### Added

- **Breakpoint chung** `xs < 480 · sm 480–719 · md 720–1023 · lg 1024–1279 · xl ≥ 1280` + `short` (cao ≤ 500):
  `@dazzxq/td-components/breakpoints` (`BREAKPOINTS`, `SHORT_MAX`, `mqBelow()`, `matchesBelow()`, `isCoarsePointer()`, `isShort()`); `check:css` chặn mọi số breakpoint khác.
  Ranh giới sm/md đặt ở **720** (không phải 768) để iPad mini dọc (744) vào nhóm tablet. Component nằm trong nội dung trang
  phản ứng theo **bề rộng của chính nó** (container query) — đúng cả khi đặt trong cột hẹp trên desktop; trình duyệt chưa
  có container query (Chrome 102–104) dùng bản dự phòng theo viewport do build tự sinh.
- **`<td-table>` dạng card** khi bảng hẹp (< 720px, `card-below="sm|md|lg"`, `layout="table|cards"`): cột có vai trò
  `card: 'primary' | 'secondary' | 'meta' | 'actions'`, thao tác dòng `actions` + sự kiện `row-action` (> 2 thao tác gom vào
  menu), sắp xếp thành thanh sort, giữ phân trang / loading / server mode, vẫn đúng ngữ nghĩa bảng cho trình đọc màn hình.
- Gate **`npm run test:responsive`** (3 trình duyệt, trong `npm test` + CI): tràn trang, phần tử không với tới, vùng chạm,
  overlay trong màn hình, chữ đè, tab bị cắt, ARIA của bảng card; ảnh chụp 8 khổ là artifact CI.

### Changed / Fixed

- **Vùng chạm ≥ 44px** trên màn cảm ứng cho mọi control (tree, tree-select, tick media-grid / sortable, tay nắm lightbox…);
  chuột ≥ 24px.
- **Pagination** không còn tràn ra mép trái trên điện thoại (nút "trang trước" từng ở x = −135); dạng gọn khi hẹp
  (< 480: đầu / hiện tại / cuối), dạng trạng thái `‹ 57 / 200 ›` khi khung < 360 (`TdPagination.labels.status`).
- Khung hẹp (container): repeater đưa cụm nút xuống hàng riêng (< 480); empty-state / alert xếp nút dọc toàn bề rộng
  (< 480; alert nhận thêm khối tuỳ chọn `div.td-alert__actions`); dropzone ẩn câu hướng dẫn, nút chọn file toàn bề rộng
  (< 360); media-field xếp Đổi / Gỡ dọc (< 360).
- Dropdown / tree-select / datetime: giá trị bị cắt `…` có `title` chứa giá trị đầy đủ.
- **Tabs** không bao giờ cắt nhãn: tab dài hơn ô chia đều → hàng tab cuộn ngang.
- Nút có nhãn dài xuống dòng thay vì đẩy rộng trang; field co theo cột lưới.
- Modal thường thành sheet khi < 720px (trước ≤ 640); drawer toàn màn hình < 480, tôn trọng tai thỏ; lightbox theo 720 /
  1024; toast toàn bề rộng trên điện thoại, chừa tai thỏ (trên ≥ safe-area + 8px, hai bên ở mọi bề rộng), ngang màn chỉ 2 toast
  mới nhất; datetime 3 hàng khi ngang màn; lightbox màn thấp (≤ 500px) ẩn filmstrip, thanh công cụ gọn (nút giữ cỡ).
- Media picker: luôn toàn màn hình; bố cục trong đổi ở 720 (trước 768); iPad dọc giữ 2 cột lưới; chế độ gọn khi màn ngang.
- Popup (dropdown, tree-select, datetime…) bám **visual viewport** — bàn phím ảo không che danh sách; trên thiết bị cảm
  ứng không tự focus ô tìm (trước iPad bật bàn phím đè lên danh sách).
- `td-table`: cột `ellipsis` không còn ép cả bảng sang layout cố định (cột chia đều).
- `td-media-grid` justified: chiều cao dòng theo **bề rộng lưới** (`--td-media-grid-row-ratio`, `-md`, `-sm`).

## 0.33.0

**Media picker giống dcms2** + phần nợ v0.32.1 (xoá / tải bản gốc) + **lưới justified** cho `td-media-grid` (học từ lưới
album photos.aetv.vn của dwp). Plan `docs/internal/plans/v0.33.0-media-picker-dcms-parity.md` (Codex plan-review APPROVE
3 vòng); kiểm kê dcms2: `docs/internal/research/dcms2-media-picker-inventory.md`.

### Changed

- **`<td-media-picker>` dựng lại theo dcms2:** mở **toàn màn hình** ở mọi khổ; thanh công cụ một hàng (Tải lên · tìm ·
  sắp xếp · "Chỉ của tôi" · facet gọn · "Hiển thị a–b / n" + ‹ ›); card ảnh 3:2 (tên + dung lượng • ngày, viền xanh khi
  đang xem, xanh lá khi đã chọn, ô tick góc trên-phải); panel chi tiết 400px sửa alt / caption tại chỗ + hàng nút; footer
  "Đóng" / "Chèn (n)"; mobile: chi tiết thay lưới, có "Quay lại". Mọi control là component kit (`td-input-field`,
  `td-button`, `td-dropdown`, `td-toggle`, `td-chip-input`, `td-pagination`, `td-tabs`, `td-dropzone`…). Không chép các
  lỗi UX của dcms2: tự chọn ảnh đầu, Enter toàn trang = chèn, tự lưu, lỗi thô của server, không đóng được bằng Esc.
- Phân trang: mặc định theo cursor (‹ › một request mỗi lần, chỉ sang trang khi thành công); `pagination: 'pages'` dùng
  `td-pagination` số trang.
- `td-media-grid` tự đặt kích thước ảnh (CSSOM) — CSS của site không còn làm ảnh thừa / thiếu chiều; giá trị inline cũ
  của site được trả lại khi gỡ.

### Added

- **Dialog tải lên** hai tab **Tệp** / **Từ URL**. Tab URL chỉ hiện khi adapter có **`uploadFromUrl(url, { fields,
  context, signal, onProgress })`** (tuỳ chọn, cùng hợp đồng kết quả với `upload`). Kiểm URL ở trình duyệt chỉ để tiện
  (http/https, ≤ 2048 ký tự, không user/pass) — **server phải tự chặn SSRF**, giới hạn dung lượng / loại tệp.
- **Xoá** (`adapter.delete`, bật bằng capability): hỏi xác nhận; **server quyết định** xoá được hay không — bị chặn thì
  picker chỉ **hiện danh sách nơi đang dùng do server trả về** (kit không tự kiểm tra). **Tải bản gốc**
  (`adapter.download`: URL qua allowlist hoặc Blob — chỉ tải xuống, thu hồi object URL). **Copy link** (capability
  `copyLink`, mặc định tắt). Xoá / tải về mặc định tắt — site v0.32 không tự dưng có nút mới.
- **`<td-media-grid layout="justified">`** — mỗi dòng cùng chiều cao, ảnh giữ tỉ lệ, dòng lấp đủ bề rộng (không bao giờ
  tràn), dòng cuối thiếu giữ chiều cao; tự xếp lại khi đổi kích thước / thêm ảnh / ảnh tải xong; chạy được với
  `<td-sortable>` bọc trong (gallery kéo thả). `select-mode="tick"`.
- `td-dropzone`: `prompt-title`, `prompt-text`, `hint-style="badges"` (badge `td-badge`). `td-modal` toàn màn hình chừa
  vùng an toàn (tai thỏ / thanh home).
- Adapter chỉ **thêm** phần tuỳ chọn — adapter v0.32 chạy nguyên không cần sửa.

## 0.32.0

**Media picker** dùng chung cho dcms2 / 135 / dwp / dsuite (yêu cầu dsuite, contract adapter của dsuite research/17; owner:
port ý tưởng `MediaPickerPlaceholder` của dcms2; phạm vi chốt qua Claude × Codex think-about; plan
`docs/internal/plans/v0.32.0-media-picker.md`, Codex plan-review APPROVE 3 vòng; ranh giới:
[ADR 0013](docs/internal/decisions/0013-media-picker-boundary.md)).

### Added

- **`<td-media-picker>` / `TdMediaPicker.open(options)`** — hộp chọn media: lưới + xem chi tiết (≤ 640px: bottom sheet),
  tìm kiếm, facet, chọn một / nhiều (`maxItems`, giữ lựa chọn khi tải thêm / lọc), upload (tiến trình, huỷ, ảnh trùng →
  dùng lại), sửa metadata **lưu tường minh** (lỗi từng field từ server hiện đúng chỗ). Trả `{ status: 'selected',
  selection: SelectedMedia[] }` hoặc `{ status: 'cancelled', reason }`; **không** sửa trang gọi, không tạo usage. Kit chỉ
  gọi **adapter** của site (`list` / `get` / `facets?` / `upload?` / `update?`, mọi lời gọi có `AbortSignal`, kết quả cũ bị
  bỏ) — không endpoint, không tên quyền, không biết envelope API. Có thay đổi chưa lưu / upload đang chạy → hỏi trước khi
  đóng. Dữ liệu adapter chỉ render dạng text, URL qua allowlist, có giới hạn kích thước.
- **`TdMediaPicker.configureDefaults({ adapter, capabilities, assetFields, uploadFields, messages, … })`** — khai báo một
  lần lúc khởi động site; `open({ adapter })` / `field.adapter` / `field.pickerOptions` ghi đè.
- **`<td-media-field>`** (chọn một) — ô form thật thay cho "placeholder" của dcms2: khung theo `aspect-ratio`, nút mở
  picker + Đổi / Gỡ, xem trước; **giá trị là `assetId`** (không bao giờ URL). Mặc định gửi `name=id`; `usage` → gửi
  `name[id]`, `name[alt]`, `name[crop]`. `required`, reset, khôi phục trạng thái form (chỉ id / alt / crop — ảnh xem trước
  lấy lại qua `adapter.get()` theo phiên hiện tại). Video = chọn qua ảnh poster.
- **PHP `td_media_field($name, $assetId, $o)`** — in sẵn field kèm ảnh xem trước (`preview-src`) để trang PHP không nháy và
  không phải gọi API; không JS vẫn gửi đúng giá trị.
- Icon `video`, `file`, `filter`. Export `@dazzxq/td-components/media-picker`, `/media-field`.

### Ghi chú

- Chưa có trong bản này: xoá / tải bản gốc (v0.32.1), crop (v0.33), field nhiều ảnh (gallery), kéo thả / dán file vào field.
- `preview-src` chỉ để hiển thị, không gửi đi; link `http:` chỉ được nhận trên trang `http:`.

## 0.31.0

dsuite P1 lô 3 — **sắp xếp + che giá trị nhạy cảm** (yêu cầu dienthoaihay.vn #8, #10; plan
`docs/internal/plans/v0.31.0-sortable-masked.md`, Codex plan-review APPROVE 3 vòng).

### Added

- **`<td-sortable>`** — sắp xếp lại danh sách / lưới bằng **kéo thả** (chuột, cảm ứng, bút — chỉ từ nút tay nắm `grip`, không
  giành click của field bên trong) **và bàn phím** (Enter / Space nhấc, mũi tên di chuyển — lưới ↑↓ nhảy cả hàng, Home /
  End, Escape huỷ, Tab / rời tay nắm thả tại chỗ); chạm tay nắm A rồi tay nắm C cũng chuyển được (WCAG 2.5.7); trình đọc
  màn hình nghe "vị trí x trên y" (không đọc nội dung mục); tự cuộn gần mép; giảm chuyển động khi
  `prefers-reduced-motion`. Mỗi mục cần `data-id` duy nhất — thiếu / trùng thì tắt sắp xếp thay vì gửi thứ tự thiếu. Sự
  kiện **`order-change`** `{ order, previous, id, from, to, source }` chỉ khi thả; `setOrder()` qua API không phát (app
  hoàn tác được mà không lưu lại). Dùng được trong `<td-media-grid>` (gallery) không cần CSS riêng.
- **`<td-repeater sortable>`** — opt-in kéo thả / bàn phím cho dòng repeater (mỗi bước phát `rows-change` `reason: 'move'`,
  nút ↑ ↓ vẫn giữ). Không có `sortable` → hành vi v0.30 không đổi.
- **`<td-masked-value>`** — hiện giá trị che (`masked`, chuỗi do server che sẵn) + nút "Hiện"; bấm → gọi **`reveal()`** do app
  truyền (app lo quyền / 2FA / audit), hiện giá trị thật rồi **tự che lại** sau `duration` giây, khi tab ẩn, khi rời trang
  (`pagehide` — không vào bfcache), khi gỡ khỏi trang. Giá trị thật **không** nằm trong attribute, sự kiện, thông báo hay
  console; lỗi chỉ báo `{ kind }` do kit đặt. Bấm lại khi đang chờ bị bỏ qua (mỗi lần gọi là một sự kiện audit).
  `copyable` dùng `<td-copy sensitive>`. Sự kiện `revealed`, `remasked`, `reveal-error`.
- **PHP `td_masked_value($masked, $o)`** — chỉ nhận chuỗi đã che (không có tham số giá trị thật), element mode
  `masked-value@1`.
- Icon `grip`. Export `@dazzxq/td-components/sortable`, `/masked-value`.

### Changed

- `TdRepeater.labels.moved` → "Đã chuyển tới vị trí {n} trên {count}." (trước: "{n} / {count}").

## 0.30.0

dsuite P1 lô 2 — **dòng động + ô số / tiền** (yêu cầu dienthoaihay.vn #14, #11; plan
`docs/internal/plans/v0.30.0-number-repeater.md`, Codex plan-review APPROVE 3 vòng).

### Added

- **`<td-repeater>`** — danh sách dòng động: nâng cấp tại chỗ các dòng app in sẵn, thêm dòng từ `<template>`, xoá, lên /
  xuống (nút ở biên `aria-disabled`, nút vừa bấm giữ focus), `min-rows` / `max-rows`, `add-label`; id trong dòng nhân bản
  có hậu tố riêng (`for` / `aria-*` / `field-id` cập nhật theo); sự kiện **`before-remove`** huỷ được (hỏi xác nhận) và
  **`rows-change`** đồng bộ sau **mọi** thay đổi (người dùng, API, app sửa DOM trực tiếp). **Kit không đổi `name`** các
  field trong dòng — app đặt lại index trong `rows-change` (docs có công thức `rename()` dùng `data-name`).
- **`<td-number-input>`** — ô số / tiền: hiển thị nhóm nghìn (`12.990.000`), giá trị gửi form là chuỗi số sạch
  (`12990000`), rỗng gửi `""` (không bao giờ `0`); tính chính xác bằng `BigInt` tới 30 chữ số; `decimals`, `prefix` /
  `suffix` (₫, %), `unit-label`, `min` / `max` / `step` (↑ ↓ PageUp PageDown), vượt ngưỡng = lỗi validation (`clamp`
  opt-in); dán `1.234.567` / `1,234,567` / `12 990 000 ₫` theo bảng quy tắc, chuỗi mơ hồ bị từ chối (không đoán, không
  cắt); giữ vị trí con trỏ khi định dạng lại. Không có `min` → không nhận số âm.
- **PHP `td_number_input($name, $value, $o)`** — mặc định `<input type="number">` native (chạy không JS, gửi giá trị
  sạch, ngầm `min="0"`); element mode `number-input@1` hydrate tại chỗ, không xô lệch.
- Export `@dazzxq/td-components/repeater`, `/number-input`.

### Fixed

- `<td-otp-input>` đặt trong một hàng flex (ví dụ `display: flex` của site) bị co còn ~150px — hộp 6 ô giờ giữ đủ chiều
  rộng và vẫn co lại khi khung hẹp hơn.

### Ghi chú

- `<td-repeater>`: `min-rows` tối đa 200 (lớn hơn bị bỏ qua kèm cảnh báo — chống treo trang khi cấu hình sai).
- PHP `td_number_input`: `$value` / `min` / `max` / `step` chỉ nhận chuỗi hoặc số nguyên (số thực như `12.5` bị từ chối,
  không bị ép kiểu thành `12`); cảnh báo không in lại giá trị thô.
- `prefix` là property DOM có sẵn — đặt bằng attribute, không qua `el.prefix`.
- Trước khi JS nạp, ô element mode hiện giá trị sạch (`12990000`); JS nạp xong mới nhóm nghìn, con trỏ có thể về cuối.

## 0.29.0

dsuite P1 lô 1 — **cây phân cấp** (yêu cầu dienthoaihay.vn #9; plan `docs/internal/plans/v0.29.0-tree.md`, Codex
plan-review APPROVE 3 vòng). Viết mới (dcms2 / dwp không có cây thật).

### Added

- **`<td-tree>`** — cây mở / đóng theo mẫu WAI-ARIA tree (roving tabindex; ↑ ↓ ← → Home End, `*`, gõ chữ để nhảy);
  `selection="none | single | multiple"`, `cascade` (opt-in: checkbox ba trạng thái, form chỉ gửi **lá**); mục khoá
  (`disabled` kế thừa xuống cả nhánh — chống chọn con làm cha); `loadChildren(node, { signal })` tải nhánh khi mở
  (request mới nhất thắng); `searchable` lọc tại chỗ (hiện mục khớp + tổ tiên); form-associated (`name` nguyên văn, một
  mục `FormData` mỗi giá trị, `required`). Dữ liệu `{ value, label, children?, disabled?, description?, hasChildren? }` (`hasChildren` không có `children` = nhánh tải sau), chỉ
  render text; tối đa 16 cấp, quá 5.000 nút thì cảnh báo (chỉ nhánh đang mở nằm trong DOM).
- **`<td-tree-select>`** — chọn nút trong cây qua popup: chọn một = combobox (focus ở ô, `aria-activedescendant`), chọn
  nhiều = nút mở popup có ô tìm + cây `aria-multiselectable` (ô hiện tóm tắt "A, B +3"); `allow-clear`, `cascade`,
  `loadChildren`, giá trị chưa tải giữ tới khi nhánh tải (`value-label` / `value-labels`); nâng cấp `<select>` con trực
  tiếp; chồng đúng với modal / drawer.
- **PHP `td_tree_select($name, $tree, $selected, $o)`** — mặc định `<select>` native thụt lề theo cấp (chạy không JS);
  element mode `tree-select@1` hydrate tại chỗ, không xô lệch.
- Export `@dazzxq/td-components/tree`, `/tree-select`.

### Ghi chú

- Mục **khoá đang được chọn vẫn được gửi** trong form (khác `<option disabled>`): chọn một thì không đổi / xoá được, chọn
  nhiều thì "xoá" chỉ bỏ mục không khoá. Server vẫn phải tự kiểm tra quyền.
- Không có JS, `<select>` chọn một có placeholder gửi `name=` rỗng; sau nâng cấp ô rỗng không gửi mục nào.
- Không JS, chọn nhiều có mục khoá: cùng tập giá trị, mục khoá gửi sau (sau nâng cấp: theo thứ tự cây).
- Phím `*` chỉ mở các nhánh anh em **đã tải** (như `expandAll()`); nhánh lazy chưa tải không bị tải hàng loạt.

## 0.28.0

dsuite P0 lô 2 — **chọn nhiều** (yêu cầu dienthoaihay.vn #3; plan `docs/internal/plans/v0.28.0-multiselect.md`, Codex
plan-review APPROVE 3 vòng). Nâng cấp `<td-chip-input>` thay vì thêm `multiple` vào `<td-dropdown>`. Hết P0 của dsuite.

### Added

- **`<td-chip-input selection-only>`** — chỉ chọn từ `options` / kết quả `search()`, chữ gõ chỉ để lọc (không bao giờ
  thành chip). Listbox `aria-multiselectable`, mục đã chọn vẫn hiện kèm ✓; Enter / click lật chọn, popup giữ mở
  (`close-on-select` để đổi); mục khoá (`disabled`, nhóm `disabled`, hoặc chưa chọn khi đủ `max-items`) không chọn được
  bằng mọi đường, mục đã chọn luôn bỏ chọn được; thông báo "Đã đạt tối đa N mục".
- **`select-all`** — dòng "Chọn tất cả (N)" / "Bỏ chọn tất cả (N)" cho các mục **đang hiện** (sau lọc), dừng ở `max-items`;
  không bao giờ chọn mục chưa tải (chọn toàn bộ phía server là việc của app).
- **Nhóm một cấp** `{ label, disabled?, options: [...] }` (như `<optgroup>`), chỉ trong `selection-only`.
- **Nâng cấp `<select multiple>`** con trực tiếp (progressive enhancement như dropdown 0.17): option / optgroup / disabled /
  lựa chọn sống / `name` / `required` / `<label for>` ngoài; select đang focus → chờ rời ô rồi nâng cấp. Ngầm bật
  `selection-only`.
- **Form**: `name` giữ nguyên văn (`roles[]`), `FormData` một mục mỗi giá trị theo thứ tự chọn, `required` → `valueMissing`,
  reset về lựa chọn mặc định.
- **PHP `td_multiselect($name, $options, $selected, $o)`** — mặc định `<select multiple>` native (chạy không JS); element
  mode (`'element' => true` / `ssr_elements`) in `<td-chip-input data-td-ssr="chip-input@1" selection-only>` bọc select.

### Ghi chú

- Mục `disabled` (hoặc trong `<optgroup disabled>`) có `selected` sẵn trong `<select multiple>` **được giữ** trong lựa
  chọn và mặc định reset khi nâng cấp (khoá: không thêm lại được, nhưng bỏ chọn được). Khác select native: sau nâng cấp
  giá trị đó được gửi cùng form.
- Element mode giảm xô lệch layout (select có chiều cao tối thiểu bằng khung chip) nhưng không triệt tiêu hẳn — số chip
  quyết định chiều cao sau nâng cấp.

## 0.27.0

dsuite P0 lô 1 (yêu cầu dienthoaihay.vn; lộ trình chốt với Codex; plan `docs/internal/plans/v0.27.0-dsuite-p0a.md`,
plan-review APPROVE 4 vòng).

### Added

- **`<td-otp-input>`** — mã 6 số: **một** ô native (`autocomplete="one-time-code"`, dán / autofill / password manager, chạy
  không JS) hiển thị thành 6 ô; lọc chữ số (cả full-width); sự kiện `complete` **một lần** khi đủ 6 số (không tự submit —
  app quyết định); form-associated, lỗi, `required`. PHP `td_otp_input()` (native mặc định, element mode `otp-input@1`).
- **`<td-drawer>` / `TdDrawer.open()`** — panel trượt trái / phải (RTL), kích thước, ≤ 640px toàn màn hình; focus trap, trả
  focus, inert, khoá cuộn, Escape / bấm nền (`dismissible`), sự kiện **`before-close`** chặn được (form chưa lưu), `open`
  / `close` sau khi hiệu ứng xong; chồng đúng với modal / lightbox. `body` / `footer` dạng chuỗi là **văn bản** (HTML tin
  cậy chỉ qua `bodyHtml` / `footerHtml`). Không JS: nội dung hiện tại chỗ.
- **`<td-copy>`** — nút icon (kiểu action button dcms2): copy → icon ✓ vài giây rồi tự trả về; fallback chọn văn bản khi
  clipboard bị chặn; `for="id"` hoặc `<code class="td-copy__source">`; `sensitive` không đưa giá trị vào sự kiện. PHP
  `td_copy()`.
- **CSS skeleton** `.td-skeleton` (`--text`, `--circle`, `--rect`) + token `--td-skeleton-*`; skeleton của `td-table` dùng
  chung token.

### Changed

- `TdModal` dùng controller lớp hộp thoại chung (`dialog-layer.js`) với drawer — hành vi modal không đổi (toàn bộ test cũ
  giữ nguyên).

## 0.26.1

### Fixed

- `<td-password-meter for="…">` trỏ vào **id của ô** bên trong một `<td-input-field>` (`field-id`, ví dụ ô mật khẩu in bằng
  PHP element mode 0.26.0) giờ cập nhật khi gõ — đồng hồ lấy chính `<td-input-field>` chứa ô đó làm nguồn (trước: không
  bao giờ đổi vì field phát `input` từ host). `for` trỏ id host vẫn chạy như cũ. (Báo lỗi từ site 135.)

## 0.26.0

**Hết "flash" lúc tải — bước 2 + 3:** `<td-input-field>`, `<td-toggle>`, `<td-checkbox>`, vỏ `<td-dropdown>` và
`td_empty()` / `<td-empty-state>` in sẵn từ PHP và hydrate tại chỗ (ADR 0012; plan `v0.26.0-ssr-form.md` + 
`v0.26.0-ssr-dropdown-empty.md`, Codex plan-review APPROVE).

### Added

- **PHP element mode** cho `td_field()`, `td_toggle()`, `td_checkbox()` (`['element' => true]` hoặc cờ toàn site
  `ssr_elements`): in host + ô native đã có style (`data-td-ssr` `input-field@1` / `toggle@1` / `checkbox@1`). Chưa có JS
  vẫn nhập, submit, validation native, password manager / autofill. `id` người gọi = id của ô native (`<label for>` ngoài
  vẫn đúng); host có id riêng (`{id}-host` hoặc tự sinh).
- **Hydrate form-associated:** JS nhận ô tại chỗ — giữ chữ đã gõ / autofill / trạng thái tích trước khi JS nạp, giữ
  focus + vị trí con trỏ, không phát `input` / `change`; dữ liệu form đúng **một** mục mỗi tên; `reset` về mặc định
  native; label ngoài chuyển sang host. Markup lệch / bị sửa / thuộc tính form khác host → dựng lại an toàn ngay, giữ chữ đã gõ,
  vị trí con trỏ, trạng thái tích và focus.
- Base: ghi nhận property gán sớm (`_earlyProps`, ưu tiên hơn state native).
- **Dropdown không xô lệch:** `td_dropdown(…, ['element' => true])` in `<select class="td-dropdown__native">` có **đúng hộp**
  của nút chọn (giữ mũi tên native) → JS thay bằng nút chọn không nhảy layout; `<select>` đang focus lúc JS nạp → chờ rời
  ô rồi nâng cấp đúng một lần với lựa chọn lúc đó.
- **`td_empty($title, $message, $o)`** mới: in sẵn `<td-empty-state>` đầy đủ (icon registry / `site-*`, không có hoặc lạ →
  `inbox`; `size`, `compact`, `heading`, `actions` → nút link element mode); `<td-empty-state>` nhận markup tại chỗ, giữ
  actions của server tới khi site gán `actions` bằng JS.
- `Td::icon()` nhận cỡ số nguyên 8–128px.

### Fixed

- `<td-empty-state>`: `actions` / `iconNode` gán trước khi component nạp trước đây bị bỏ qua — giờ có tác dụng.
- `<td-checkbox>` / `<td-toggle>`: sau `form.reset()` ô bên trong hiện đúng trạng thái tích của host (trước: host vẫn
  tích + vẫn gửi nhưng ô hiện bỏ tích).

### Changed

- `<td-empty-state>` gắn lại (di chuyển) giữ nguyên node thay vì render lại.
- Site **đã bật `ssr_elements` từ 0.25** giờ cũng nhận element mode cho `td_field` / `td_toggle` / `td_checkbox` / `td_dropdown` (đúng
  ADR: cờ toàn site áp cho mọi helper đã có contract). Trong element mode: `td_toggle` / `td_checkbox` đưa `class` /
  `attrs` lên host (native: lên `<label>`), `input_attrs` vẫn xuống ô.

## 0.25.0

**Hết "flash" lúc tải trang SSR** — bước 1: nền tảng hydrate tại chỗ + `<td-button>` / link (đề xuất site 135; ADR 0012,
Codex think-about CONSENSUS; plan `docs/internal/plans/v0.25.0-ssr-button.md`, plan-review APPROVE 3 vòng).

### Added

- **PHP element mode (opt-in, mặc định vẫn native):** `td_button($label, ['element' => true])` /
  `td_link(…, ['element' => true])` hoặc bật toàn site `Td::configure($base, $dir, ['ssr_elements' => true])` → in
  `<td-button data-td-ssr="button@1" …>` **kèm sẵn** `<button class="td-btn …">` / `<a class="td-btn …">` đã có style. Trang
  hiện nút đúng ngay khung hình đầu, chạy được khi chưa có JS; JS nạp xong **nhận tại chỗ** (không dựng lại: không nhảy
  layout, giữ focus, giữ dữ liệu form / submitter).
- Nền tảng `TdBaseElement`: hook `canHydrate()` / `hydrateExisting()`, `static hydratable`, dấu `data-td-ssr` theo schema
  của từng component; component hydratable gắn lại (di chuyển node) không render lại.
- `Td::modulePreloads(['button', …], $nonce?)` → `<link rel="modulepreload">` đúng phiên bản (tối ưu nạp; thứ tự khuyên dùng:
  stylesheet → import map → modulepreload → entry module).
- `td_badge($label, ['icon' => 'tên'])` — icon trong badge (registry kể cả `site-*`; tên lạ → bỏ icon).
- CSS lưới an toàn: host `<td-button>`, `<td-input-field>`, `<td-dropdown>`, `<td-toggle>`, `<td-checkbox>` in tay (không
  có dấu SSR) được giữ chỗ chiều cao trước khi JS nạp.

### Changed

- `<td-button>` gắn lại vào DOM (di chuyển) giữ nguyên node bên trong thay vì render lại.

## 0.24.0

Lightbox: điều hướng bằng chuột ở hai bên ảnh + tải sẵn ảnh kề + màn báo lỗi + filmstrip tuỳ chọn + trượt khi chuyển
(plan `docs/internal/plans/v0.24.0-lightbox-nav.md`; thiết kế: Codex think-about nghiên cứu iCloud / Google Photos /
PhotoSwipe / Fancybox… CONSENSUS; plan-review APPROVE 3 vòng).

### Added

- **Vùng bấm hai bên** (máy dùng chuột): nút trước / sau chuyển ra hai dải `clamp(64px, 15%, 240px)` hai bên cột ảnh,
  gần trọn chiều cao, đĩa mũi tên 48px luôn hiện — bấm chỗ nào trong dải cũng chuyển ảnh; bấm giữa ảnh vẫn phóng to.
  Đang phóng to → chỉ còn đĩa; video → đĩa nhỏ hoặc về toolbar khi chật; cảm ứng / bút → không dải (vẫn vuốt, nút ở
  toolbar); RTL; counter đọc "2 / 5" cho trình đọc màn hình. Vẫn một nút trước / một nút sau (không trùng).
- **Tải sẵn ảnh kề** (trước + sau) sau khi ảnh hiện tại tải xong — option `preload: 'same-origin'` (mặc định: chỉ ảnh cùng
  origin với trang, không gửi Referer) | `'all'` (site có CDN tin cậy) | `false`; bỏ qua khi bật tiết kiệm dữ liệu.
- **Màn báo lỗi ảnh:** "Không tải được ảnh" + **Thử lại** + **Ảnh sau** (`labels.loadError`, `labels.retry`).
- **Filmstrip tuỳ chọn:** `filmstrip: true | 'auto' (≥ 8 mục) | false` (mặc định tắt); trường mới `item.thumb` (qua
  `isAllowedUrl`); `labels.thumb(n)`; video không ảnh → ô giữ chỗ.
- **Trượt khi chuyển ảnh** 160ms theo hướng, chỉ chạy khi ảnh mới đã sẵn sàng; tắt khi giảm chuyển động.
- Token `--td-lb-*` mới (dải, đĩa, thumb, filmstrip, trượt).

### Changed

- Trên máy dùng chuột, nút trước / sau **không còn nằm trong toolbar** (ra hai bên). Bấm nền để đóng chỉ khi cú bấm cũng
  bắt đầu trên nền (bấm ảnh rồi kéo ra không còn đóng nhầm). Overlay đặt `line-height` riêng; toolbar / counter khai báo
  `box-sizing` tường minh (hiển thị giống nhau dù site có reset hay không).
- URL của item (`src`, `poster`, `thumb`) được **chuẩn hoá thành URL tuyệt đối** theo `document.baseURI` rồi mới kiểm
  `isAllowedUrl` (và giá trị lưu / trả ra — `ctx.item`, `detail`, `href` tải xuống — là URL tuyệt đối đó). Trước đây có thể
  lệch khi trang có `<base href>`.

## 0.23.0

Component mới `<td-media-grid>` — lưới ảnh / media chọn được (đề xuất của site 135, kiểu dwp photos; plan
`docs/internal/plans/v0.23.0-media-grid.md`, Codex plan-review APPROVE 2 vòng).

### Added

- `<td-media-grid>` nâng cấp **markup của site** (item `data-td-media-item` + `data-id`, phần tử mở
  `[data-td-media-open]` là `<button>` hoặc `<a>`): chèn nút tick (`aria-pressed`, `tabindex=-1`), không render lại ô;
  item thêm / gỡ sau vẫn được nhận.
- Tick ẩn → hiện khi rê chuột, khi focus vào ô, khi đang chọn; cảm ứng mờ 0.55 (vùng chạm 44px). Đã chọn: ảnh thu
  88% trên nền surface, tick đặc (theo màu nút primary, tự đảo ở dark).
- Hành vi: chưa chọn → bấm ảnh = `activate`, bấm tick = chọn; đang chọn → bấm = lật (lightbox / link không mở); Shift =
  chọn dải (chỉ thêm, giữ điểm neo); Space = lật, Enter = `activate`, Esc = bỏ hết (khi không có modal / menu / dropdown
  mở); `max` + sự kiện `select-limit`; `disabled`.
- API: `selectedIds`, `select()`, `deselect()`, `toggle()`, `selectAll()`, `clear()`, `items`; sự kiện `select-change`
  (`ids`, `added`, `removed`), `activate` (cancelable), `select-limit`; hook `onSelectChange`; `TdMediaGrid.labels`.
- Export `@dazzxq/td-components/media-grid`; token `--td-media-grid-*`.

### Fixed

- Docs cài đặt: import map viết tay thiếu `dropzone`, `progress`, `alert` (có từ 0.18) — đã bổ sung cùng `media-grid`.

## 0.22.1

### Fixed

- **Mở / đóng modal không còn làm trang nhảy ngang.** Khoá cuộn (`scroll-lock`) giữ chỗ thanh cuộn: `scrollbar-gutter:
  stable` trên `<html>`, nếu không giữ được (trình duyệt cũ, site tự style thanh cuộn) thì bù `padding-inline-end` +
  biến `--td-scroll-lock-gap` cho modal. Giá trị inline cũ của site được trả lại nguyên vẹn. Trước đây trên Windows / macOS
  "luôn hiện thanh cuộn", trang và modal nhảy ~15px giữa hiệu ứng → cảm giác giật.

### Changed

- **Chuyển động modal theo dcms:** mở = phóng từ `scale(0.95)` 300ms có nảy nhẹ (`cubic-bezier(0.34, 1.56, 0.64, 1)`) +
  hiện mờ 200ms, nền tối 120ms; đóng = 200ms / mờ 150ms. Token mới `--td-modal-enter-ease`, `--td-modal-fade-dur`,
  `--td-modal-fade-ease`, `--td-modal-exit-fade-dur`, `--td-modal-sheet-ease`; `--td-modal-enter-dur` giờ là thời lượng
  transform (300ms), `--td-modal-ease` là đường cong fade. Sheet điện thoại vẫn trượt lên (không nảy). Reduced motion
  không đổi.

## 0.22.0

`<td-dropdown>` dòng hành động "＋ Thêm … mới…" ở đáy menu (đề xuất của site 135; plan
`docs/internal/plans/v0.22.0-dropdown-create.md`, Codex plan-review APPROVE 3 vòng).

### Added

- `<td-dropdown create-label="Thêm film mới">` (property `createLabel`): một dòng hành động **cố định ở đáy** menu,
  ngoài danh sách cuộn, không bị lọc khi tìm (đang gõ → `Thêm “{chữ đang gõ}”`, `TdDropdown.labels.createWithQuery`).
  Bấm / Enter → menu đóng, focus về trigger, gọi `onCreate(query)` rồi phát sự kiện `create` (`detail: { query }` — chữ
  đang gõ, chỉ trim hai đầu). Không bao giờ là giá trị: không đổi lựa chọn, không `change`, không vào form, không ảnh
  hưởng `required`. Site mở modal của nó, lưu, rồi `options = [...]` + `setValue(id)`.
- PHP: `td_dropdown(…, ['create_label' => '…'])`.
- Token `--td-dropdown-create-fg`.

### Changed

- DOM menu dropdown: thông báo "Không có kết quả" nằm **trước** listbox; listbox chứa `.td-dropdown__scroller` (vùng
  cuộn) — code / CSS site bám vào `.td-dropdown__options` như vùng cuộn cần chuyển sang `.td-dropdown__scroller`.

## 0.21.1

Sửa lỗi khi kết hợp component (popup / modal / lightbox) — plan `docs/internal/plans/v0.21.1-combination-fixes.md`
(Codex plan-review APPROVE 3 vòng; audit bằng probe test).

### Fixed

- Dropdown / chip-input / menu / tooltip / hovercard trong khung cuộn (thân modal cuộn, bảng…) **đóng khi trigger bị cuộn
  khuất** khỏi khung, không còn nổi đè lên header / footer của modal.
- Popup đang mở bị **modal mở sau phủ lên** (mở bằng code: timer, confirm async, hết phiên) → popup đóng, không còn bấm
  được xuyên qua modal mới; focus vào modal mới; Escape thuộc modal mới. Tooltip đang hiện do hover ẩn khi bất kỳ lớp
  chặn nào mở.
- Modal / lightbox **đóng** → popup con (anchor nằm trong) đóng ngay, focus về opener (không rơi về `<body>`).
- **Lightbox mở từ trong modal** nằm trên modal, dùng được (trước: nằm dưới, bị inert). Thứ tự chồng modal / lightbox theo
  thứ tự mở, z-index thị giác theo token `--td-z-*` site đặt (và `TdModalStackManager.BASE_Z_INDEX`).
- TdMenu **còn mở khi anchor bị gỡ / ẩn** → đóng; chọn mục không trả focus về anchor đã mất.
- Menu mở từ nút **trong hovercard** không làm hovercard đóng / mất focus; hovercard đóng thì đóng menu con trước.
- Popup **đóng khi trigger bị ẩn** không qua cuộn (đổi tab, accordion, `display:none`).
- Popup mở lúc modal đang chạy hiệu ứng vào **không còn lệch chỗ** (đặt lại vị trí khi transition kết thúc).
- Tooltip hiện do hover **không cướp Escape** của dropdown / menu đang mở.

### Changed

- `TdMenu` `onClose(reason)` có thêm giá trị `'covered'` (bị lớp chặn mở sau phủ).

## 0.21.0

Màu pastel, primary + tooltip đen, shadow rõ hơn, toast kiểu dcms, modal có animation, wheel datetime cuộn khi mở,
tooltip căn chữ, viền focus ô nhập nhạt hơn (plan `docs/internal/plans/v0.21.0-pastel-toast-modal.md`, Codex plan-review
APPROVE 3 vòng).

### Changed (đổi giao diện)

- Nút `success` / `danger` / `warning` / `info`: **pastel** (nền nhạt + chữ đậm cùng tông + viền), hover đậm hơn một nấc.
  Token mới `--td-pastel-{success,danger,warning,info}-bg/-border/-fg` (dark: bản trầm, đặc); badge mềm dùng chung.
- Nút **primary mặc định đen** (`#18181b`, hover `#3f3f46`; dark đảo trắng). Về màu accent:
  `--td-btn-primary-bg: var(--td-accent-fill)` + `--td-btn-primary-fg: var(--td-accent-contrast)` +
  `--td-btn-primary-hover: color-mix(in srgb, var(--td-accent-fill) 92%, #000)`.
- **Tooltip mặc định đen** chữ trắng (cả dark, thêm viền mảnh).
- **Shadow rõ hơn**: `--td-glass-shadow` / `-shadow-lg` / `--td-btn-lift` thành hai lớp (tiếp xúc + toả), alpha cao hơn.
- **Toast kiểu dcms**: viên gọn, **đặc pastel theo loại**, không blur, không icon, nút đóng chỉ hiện khi focus bằng bàn
  phím; bấm để đóng; trượt vào từ phải. Trình đọc màn hình nghe tiền tố loại (`TdToast.labels.types`).
- **Modal** mở ease-in-out 260ms (nhích lên + phóng nhẹ từ 0.98), đóng 180ms; token `--td-modal-enter-dur`,
  `-exit-dur`, `-ease`, `-exit-ease`, `-scrim-dur`, `-scrim-ease`, `-enter-from` (`none` = chỉ fade). Reduced motion →
  chỉ fade.
- **Ô nhập focus nhạt hơn** (như dcms): viền accent nhạt + vòng 12% (`--td-field-focus`, `--td-field-focus-ring`), áp
  cho input, dropdown, chip-input, datetime.

### Added

- `<td-datetime-picker>`: khi mở, wheel giờ / phút cuộn mượt từ đầu tới giá trị (như dcms); lựa chọn không đổi giữa
  chừng; thao tác của người dùng huỷ cuộn; reduced motion → căn tức thì.
- Tooltip `data-tooltip-align="start|center|end"`; mặc định chữ xuống dòng **căn giữa** (`--td-tooltip-text-align`).
- Token `--td-btn-{v}-border`, `--td-btn-{v}-hover`, `--td-btn-primary-hover`, `--td-btn-primary-border`.

### Fixed

- Datetime: bấm phím mũi tên khi wheel đang cuộn không còn chọn nhầm giá trị chỗ cuộn bị cắt.
- Modal (reduced motion): khi đóng, chờ hết lần mờ dần 120ms rồi mới gỡ khỏi DOM (trước gỡ ngay).
- Toast: gỡ khỏi DOM sau khi chuyển động ẩn thực tế chạy xong (đọc computed style, tối thiểu 200ms), nên
  `--td-toast-exit-dur` dài hơn không còn bị cắt.
- Datetime: ô số trong panel ngày dùng vòng focus nhạt `--td-field-focus-ring` như các ô nhập khác.

## 0.20.0

**Minimal surfaces** — bỏ hiệu ứng Liquid Glass giả bằng CSS, chỉ giữ nền + một viền mảnh + một shadow mềm (+ blur 12px
cho popup nhỏ), tham khảo dcms (plan `docs/internal/plans/v0.20.0-minimal-surfaces.md`, Codex think-about CONSENSUS,
plan-review APPROVE 2 vòng; ADR 0011). Markup, class công khai và API JS **không đổi**.

### Changed (đổi giao diện lớn)

- Nút mọi variant (kể cả `.td-btn--custom`): **màu đặc**, một shadow `--td-btn-lift`, hover = nền đậm hơn; bỏ blur,
  film, sheen, rim, hairline, glow và hiệu ứng lún khi bấm. Primary vẫn theo `--td-accent`.
- Modal, loading, tooltip, scroll-top: nền **đặc**, không blur. Menu, dropdown, gợi ý chip-input, hovercard, toast: nền
  94% + `blur(12px)`. Lightbox toolbar / counter: tối 88% + blur; panel đặc; bỏ lớp dim cục bộ và bóng icon.
- Toast: nền trung tính, màu trạng thái chỉ ở icon (bỏ wash + viền đỏ của error).
- Bỏ mọi scale trang trí (pop-in của popup, lift của switch / slider, press của scroll-top); popup chỉ fade.
- Giá trị token mới: `--td-glass-bg` 90% / `-bg-strong` 94%, `-solid` `#fff`, `-border` `rgb(0 0 0 / 7%)`, `-blur` =
  `-blur-lg` = `blur(12px)`, shadow mềm hơn; dark tương ứng.
- `prefers-contrast: more`: bỏ cả shadow; nút có nền thêm viền `currentcolor`.

### Added

- `--td-btn-{success,danger,info,warning}-bg`.

### Deprecated (vẫn khai báo, không còn tác dụng; xoá ở bản lớn sau)

- `--td-glass-edge`, `-side-edge`, `-bottom`, `-outline`, `-sheen`, `-dim`, `-dim-text`, `-clear-edge`,
  `-clear-glyph-shadow`, `-tint*`, `-glow`, `-glow-size`, `-press-scale`, `-lift-scale`, `-enter-scale`;
  `--td-btn-*-alpha`, `--td-btn-*-film`, `--td-btn-sheen`, `--td-btn-secondary-glass`, `--td-btn-secondary-edge`;
  `--td-toast-*-wash`, `--td-toast-error-border`.
- `--td-btn-{primary,success,danger,info,warning}-tint`: **alias** một chu kỳ — site đặt thì vẫn là màu nền nút; dùng
  `-bg` thay.

## 0.19.0

Đề xuất đợt 3 của site 135 sau khi áp v0.18.0 (plan `docs/internal/plans/v0.19.0-135-feedback-3.md`, Codex plan-review
APPROVE 2 vòng).

### Added

- `<td-button>`: `aria-pressed` (`true|false|mixed`), `aria-expanded` (`true|false`), `aria-haspopup`
  (`true|false|menu|listbox|tree|grid|dialog`) và `aria-controls` trên host được chuyển xuống `<button>` / `<a>` bên trong,
  cập nhật tại chỗ (không render lại); giá trị ngoài danh sách bị bỏ + `console.warn` một lần.
- `<td-dropzone>`: hook `upload` reject với giá trị có `message` chuỗi không rỗng (ví dụ `Error`) → dòng file hiện lý do (text thuần, tối đa 200 ký tự);
  không có → `labels.uploadError`; huỷ không hiện lỗi. File chưa nhận `onProgress` lần nào → thanh indeterminate +
  `labels.uploadWaiting` ("Đang chờ…").
- `<td-dropzone accept-label="…">`: nhãn định dạng thân thiện thay chuỗi `accept`; `accept-label=""` ẩn riêng phần định
  dạng. Lọc file vẫn theo `accept`.
- Token `--td-badge-font-family` và `--td-badge-stamp-font-family`.
- `<td-datetime-picker>` `setDBValue('' | null | undefined)` xoá giá trị (như `setValue(null)`).

### Changed

- `<td-datetime-picker>` không có `open-at` → luôn mở tại **hôm nay** (kẹp vào `[min, max]`); bỏ quy tắc 0.18.0 "năm của
  `min` < 2000 → mở tại `min`". Muốn mở ở đầu khoảng: `open-at="min"`.
- Badge `stamp` mặc định dùng font mono (`--td-font-mono`); trả về sans: `--td-badge-stamp-font-family: var(--td-font-sans)`.
- `<td-dropzone>`: file mới thêm không còn `aria-valuenow="0"` (đang chờ = indeterminate); `reject(new Error('500'))` giờ
  hiện "500" thay nhãn chung.

## 0.18.0

Đề xuất đợt 2 của site 135 sau khi áp v0.17.0 (plan `docs/internal/plans/v0.18.0-135-feedback-2.md`, Codex plan-review
APPROVE 4 vòng).

### Added

- `<td-button name value>`: `name`/`value` chuyển xuống `<button>` bên trong → là submitter thật (FormData có cặp).
- `<td-input-field>` type `month`, `datetime-local`, `time` (giá trị = `.value` native, giữ giây/phần lẻ).
- `<td-datetime-picker mode="datetime|date|month|year">` (định dạng hiển thị / db / iso theo mode; datetime giữ
  nguyên `yyyy-mm-ddThh:mm:00`) và `open-at="today|min|max|<ngày>"`; mặc định mở tại `min` khi năm của `min` < 2000;
  `min`/`max` nhận cả `mm/yyyy`, `yyyy-mm`, `yyyy`.
- Component mới: `<td-progress>` (thanh tiến độ, indeterminate), `<td-dropzone>` (kéo-thả upload, form-associated,
  lọc accept/size/count, hook `upload` có tiến độ + huỷ, preview ảnh), `<td-alert>` (thông báo tĩnh, SSR không cần JS,
  nút đóng khi JS nạp) và CSS `.td-badge` (soft / outline / stamp).
- PHP: `td_badge()`, `td_alert()`, `td_link(…, ['bare' => true])` (link thường, không kiểu nút), `Td::iconAliases()`.
- Alias icon dùng chung JS/PHP (`icons.json` → `aliases`): `external-link`, `x`, `chevron-*`, `ellipsis`, `expand`,
  `pen`; `resolveIconName()`; `td-button` cảnh báo (một lần) tên icon kiểu registry không tồn tại.
- CI: job `php80` chạy lint + test adapter PHP trên PHP 8.0.

### Changed

- `php/td.php` yêu cầu PHP ≥ 8.0 (trước ghi 8.1). `td_dropdown` `searchable`: chuỗi `'false'`/`'0'`/`'off'`/`'no'`/`''`
  giờ tắt tìm kiếm (trước bị coi là bật); `null`/vắng = tự động như cũ.
- `hasIcon()` / `tdIcon()` hiểu alias (`hasIcon('pen')` → `true`).
- `<td-datetime-picker>` attribute `value` / `setValue()` nhận thêm ISO của mode (`2026-06-15T10:30`) — trước bị báo
  `badInput`.

## 0.17.0

Đề xuất của site 135 sau khi chuyển sang v0.16.0 (plan `docs/internal/plans/v0.17.0-135-feedback.md`, Codex plan-review
APPROVE 3 vòng).

### Added

- **Adapter PHP chính thức** `php/td.php` (ship trong gói): `TdComponents\Td::configure/importMap/registerIcons`,
  `td_import_map`, `td_import_map_tag`, `td_stylesheet_tag`, `td_icon`, `td_button` (cả ghost + `href`), `td_link`,
  `td_field`, `td_dropdown`, `td_toggle`, `td_checkbox` — tên/option tương thích adapter 135. Button/field/checkbox/toggle
  in control native (không cần JS); `td_dropdown` in `<td-dropdown><select>` được nâng cấp. Hướng dẫn:
  `docs/guides/php-adapter.md`.
- `td-input-field`: `autocomplete`, `inputmode`, `enterkeyhint`, `autocapitalize`, `spellcheck`, `autofocus` truyền xuống
  control (password manager hoạt động).
- `td-button`: `variant="ghost"` (không nền/kính, chữ accent, hover đậm hơn giữ ≥ 4.5:1 — theo `--td-accent` của site) và
  `href` → nút dạng link `<a class="td-btn">` (URL whitelist, `target`, `download`, trạng thái disabled/loading riêng).
- `td-dropdown`: nâng cấp tại chỗ `<select>` con (progressive enhancement — không JS vẫn submit; option `value=""` đầu
  tiên là placeholder); option/optgroup `disabled`.
- `TdMenu`: mục tải xuống (`download: true | 'tên-file'`) và option `isAllowedUrl`. `TdLightbox`: `downloads(item, ctx)`
  → nhiều biến thể tải qua menu.
- Component mới: `<td-password-meter>` (chấm điểm cục bộ, hook `score`, checklist, không lộ mật khẩu) và
  `<td-scroll-top>`.
- Icon: `trash`, `pencil`, `copy`, `log-out`, `menu`, `rotate-cw`, `zoom-out`.
- Barrel `index.js` export thêm `tdIcon`, `registerIcons`, `hasIcon`, `listIcons`, `fillIconSlots`, các hàm `dom-utils`,
  `TdPasswordMeter`, `TdScrollTop`.

### Changed (đổi hành vi)

- `td-dropdown.value` (property) trả giá trị **đang chọn** (= `getValue()`), gán = `setValue()`; trước là attribute
  ban đầu.
- `<td-dropdown>` có `<select>` con giờ được nâng cấp (select bị gỡ, component submit thay) — trước đây select bị bỏ
  qua.

### Docs

- Bỏ stamp phiên bản rải rác; dropdown là chọn một; `TdModal.open` → `show`; markup SSR chính thức = adapter PHP (fixture
  `test/contracts/*.html` chỉ là fixture test); ví dụ SVG dùng được; MIME `text/javascript` cho `.mjs`.

## 0.16.0

Sửa toàn bộ backlog phát hiện khi viết docs 0.15.1 (plan `docs/internal/plans/v0.16.0-backlog.md`, Codex plan-review
APPROVE 3 vòng). Trusted Types cho toàn kit vẫn ở backlog (owner đồng ý).

### Changed (đổi hành vi — xem `docs/upgrading/breaking-changes.md` 0.16.0)

- `td-input-field.value` trả giá trị **đang nhập** (trước: attribute ban đầu); gán `.value` = `setValue()`.
- `td-slider`: bỏ `required` (không có nghĩa với range, như native); `setValue()` snap theo `step`; không có `value`
  → giá trị = `min` (hết lỗi underflow giả).
- `td-dropdown`: gán lại `options` giữ lựa chọn hiện tại nếu còn trong danh sách mới (không kéo về attribute `value`);
  lựa chọn không còn trong danh sách bị bỏ (cả `updateData()`) — không còn submit giá trị ma; `onSelect` **và**
  `onChange` cùng chạy (onSelect trước).
- `TdModal.confirm`: `onConfirm` đồng bộ trả `false` hoặc throw → **giữ** hộp thoại mở (như `actions`).
- `TdDateTime.toAbsolute` chỉ thay các cụm chữ gồm toàn token (không thay trong từ; `[…]` là chữ nguyên văn);
  timestamp `0` hợp lệ; `toRelative` với tương lai → `Trong N phút|giờ|…` (dưới 1 phút = lệch đồng hồ → `Vừa xong`).
- Token mặc định chuyển lên `:root` (lightbox `--td-lb-*`, `--td-checkbox-box`, kích thước switch mặc định,
  `--td-spinner-size`, `--td-empty-state-pad/-gap`, `--td-pagination-item-size`): override `:root` của site giờ có tác
  dụng (kể cả trên màn cảm ứng, nơi kit trước đây ép 44px).
- Dark theme: nút primary + trang active của pagination theo `--td-accent` qua token mới `--td-accent-fill`
  (dark = accent pha 20 % đen, fallback #2563eb) — trước gán cứng #2563eb.

### Added

- Property gán trước khi element được gắn vào trang / trước `customElements.define` không còn bị mất (mọi component
  dựa trên `TdBaseElement`; dropdown nhận cả `options`/`onChange`/`onSelect` gán sớm); chỉ render một lần.
- `td-input-field`: `pattern`, `minlength` trong validity.
- Nhãn / thông báo dịch được: `TdInputField.messages`, `TdSlider.messages`, `TdCheckbox.messages`, `TdToggle.messages`,
  `TdDropdown.labels`, `TdPagination.labels`, `TdEmptyState.labels`, `TdToast.labels`, `TdLoading.labels`, `TdModal.labels`
  (thêm tiêu đề/nội dung mặc định).
- `TdToast.show/success/…` trả handle `{ close() }` (huỷ cả khi còn trong hàng đợi); `TdToast.clear()`.
- `TdLoading.wrap(fn, { message, maxDuration })`.
- `TdBaseElement._setOwnedStyle()` — component chỉ gỡ biến CSS inline do chính nó đặt.
- `TdIconElement` trong barrel `index.js`.

### Fixed

- checkbox/toggle khôi phục `checked` khi trình duyệt restore form.
- Biến CSS inline site đặt trên button/checkbox/toggle/slider/pagination không còn bị xoá khi re-render.
- dropdown tìm kiếm không phân biệt dấu (`fold`).
- Callback lỗi không còn chặn event sau: dropdown onSelect/onChange, tabs onChange, table render/onSort/onPageChange,
  TdFormValidation onValid (bọc try/catch + `console.error`; ô table lỗi → rỗng).
- TdFormValidation: reset form xoá summary/note/`aria-invalid` và tắt kiểm tra trực tiếp.
- Comment z-index (dropdown thực tế ở tầng popover 450); `--td-z-dropdown/-sticky/-overlay` ghi rõ "dự trữ".

### Packaging

- `files` không còn ship test/stories; `sideEffects` liệt kê module đăng ký element + CSS; `engines.node >= 20`;
  `exports["./package.json"]`; `vite` là devDependency tường minh (đã có trong lockfile); `./icons` không còn export
  `_validateIconDefinition`.

## 0.15.1

### Docs — viết lại từ đầu dạng hub-spoke (owner request)

- `docs/README.md` là hub; spoke: `getting-started/` (yêu cầu, cài đặt Vite · PHP + import map · WordPress, bắt đầu
  nhanh), `concepts/how-it-works.md`, `components/` (mỗi component một trang theo cùng khuôn: ví dụ, attribute,
  property/method, event, hook, token, DOM contract, bàn phím/a11y, bảo mật, lưu ý), `customization/` (theming, styling,
  danh mục hook, mở rộng), `guides/` (form, a11y, bảo mật, CSP, WordPress & PHP), `upgrading/` (quy trình, thay đổi phá
  vỡ theo phiên bản 0.4 → 0.15, bảng đổi class). Mọi API trong docs được đối chiếu với source.
- Tài liệu nội bộ (ADR, plan, luật Liquid Glass, kiến trúc, quy ước, roadmap, mô hình bảo mật, lịch sử) chuyển vào
  `docs/internal/` (không viết lại; chỉ chỉnh vài chỗ đã lệch với code — xem "Fixed" — và roadmap thêm backlog như quy
  trình yêu cầu); mọi tham chiếu trong repo đã trỏ lại. `docs/components.md` và
  `docs/migration/class-map.md` cũ được thay bằng `docs/components/*.md` và `docs/upgrading/class-map.md`.
- README gốc rút gọn, trỏ vào hub. Các lỗi/khoảng trống phát hiện khi viết docs ghi ở `docs/internal/roadmap.md` (Next).

### Fixed

- Lightbox: trigger video dùng prefix `td` (đơn lẻ hoặc trong group) vẫn hiện con trỏ `zoom-in` — một rule cũ đứng sau
  đè lên rule `pointer` của 0.15.0. Test phủ thêm trigger trong group và trigger đơn.
- Comment/tài liệu nội bộ lỗi thời: token nút ("SOLID, never glass"), luật G3 (giá trị 0.14.3), ADR 0009 (chữ ký
  `bind`/`download`/`isAllowedUrl`), comment focus của hovercard, mô hình bảo mật (chính sách URL), architecture
  (render lại khi gắn lại).

## 0.15.0

**TdLightbox — dwp parity.** A read-only comparison with the current dwp lightbox showed every dwp change predates the
port (two-column panel, bottom sheet, grab, swipes were already there); the gaps were API. Plan
`docs/internal/plans/v0.15.0-lightbox-parity.md` (Codex plan-review APPROVE, 2 rounds).

### Added

- Handle while open: `setPanel(false | true | renderer)` (switch panel mode / content without reopening — dwp
  `setViewerMode` + `setSidePanel`), `refreshPanel()`, `addToolbarButton(spec)` → `remove()` (same id replaces — dwp
  `addToolbarButton`), `removeToolbarButton(id)`.
- `itemEl` / `groupEl` in ctx (panel, toolbar, download) and in `td-lightbox-open|change|close` details;
  `open(items, { groupEl })`.
- `bind(root, { attrPrefix: 'dwp' })` reads `data-dwp-lightbox-*` markup (whitelisted prefix); `filter(el, event)`
  skips clicks (dwp `ownedByVideoModule`).
- Trigger cursors: zoom-in for image triggers, pointer for video triggers (`td` + `dwp` prefixes).
- Demo: the panel-mode lightbox has a toolbar button that toggles the info panel while open.

### Fixed

- Mobile bottom-sheet swipe used Pointer Events on a scrollable panel, so the browser's pan cancelled it
  (`pointercancel`) — now touch events like dwp; a panel that goes away closes the sheet and drops a swipe in progress.

## 0.14.4

### Fixed (visual)

- **datetime-picker wheel band:** the selection band had only top/bottom borders (`border-block`), so its rounded ends
  looked clipped ("missing side borders") — now a full 1px border, in the soft `--td-control-border-hover` tone
  (`--td-dtp-band-border`) like the other control edges; the band fill and the bold selected value still mark it.

### Added

- `demo.html`: a **Lightbox** section (`TdLightbox.bind()` gallery with captions + a panel-mode button) — the component
  shipped in 0.6.0 but was missing from the demo.

## 0.14.3

### Changed (visual) — "brighter, less grey" (owner feedback on the demo)

- **Secondary button = white glass with a visible border:** `--td-btn-secondary-glass` (80 % white; dark 84 %) +
  `--td-control-border-soft` edge; the 4 % grey film (`--td-glass-secondary-film`, removed) and the dark hairline are
  gone. **Bug fix:** `.td-btn:not(.td-btn--custom)` out-ranked `.td-btn--secondary`, so the secondary glass fill never
  applied and the button rendered opaque grey (#f0f0f2) — now `.td-btn--secondary:not(.td-btn--custom)`.
- **Coloured buttons brighter:** tint alpha 90 → 94 %, darkening film 16–18 % → 6–13 % (still ≥ 4.7:1 over every
  backdrop in the contrast gate).
- **Lighter lift shadow** (`--td-btn-lift`), rest and hover.
- **Disabled reads as greyed out:** #f4f4f5 fill, #a1a1aa label, #e4e4e7 border (dark #202024 / #6b6b73) — it used to
  be almost the same grey as the old secondary. The contrast gate now requires ≥ 2.2:1 for disabled labels AND icons
  (WCAG 1.4.3 / 1.4.11 exempt inactive controls) instead of 4.7 / 3.2:1, and renders icon buttons (rest + disabled). 12 CSP baselines recaptured (buttons, empty-state actions, picker footer).

## 0.14.2

### Changed (visual)

- **Softer hover borders** (owner request): hovering a field / dropdown / datetime / chip-input, an unchecked checkbox or
  an off toggle, and the active option outline in dropdown / chip-input suggestions now use
  `--td-control-border-hover` (#aeaeb2 light / #636366 dark, Apple systemGray2) instead of gray-500 / gray-600. The
  option's highlight fill is unchanged. Strict-contrast sites: map `--td-control-border-soft` and
  `--td-control-border-hover` to `var(--td-control-border-strong)`. 1 CSP baseline recaptured.

## 0.14.1

### Changed (visual)

- **Softer control borders** (owner request): input-field, textarea, dropdown (trigger + search), datetime-picker,
  chip-input, toggle and checkbox rest on `--td-control-border-soft` (#d1d1d6 light / #3a3a3c dark, Apple systemGray4)
  instead of gray-500; hover darkens to `--td-control-border-strong`, keyboard focus keeps the focus ring.
  Trade-off: the resting border is ~1.5:1 (below WCAG 1.4.11's 3:1); sites that need strict 3:1 at rest set
  `--td-control-border-soft: var(--td-control-border-strong)`. Tests now assert a visible soft border (≥ 1.3:1) and a
  ≥ 3:1 hover border; 23 CSP baselines recaptured.

## 0.14.0

**Real Liquid Glass.** The owner found the kit "not liquid glass at all"; the rules were re-derived in a Codex
think-about debate (Apple sources: WWDC25 219/323/356, HIG Materials/Color, SwiftUI Glass APIs) and every value is now
accepted by a rendered contrast gate. Plan: `docs/internal/plans/v0.14.0-liquid-glass.md` (Codex plan-review APPROVE, 3 rounds);
rules: `docs/internal/design/liquid-glass.md` v2.

### Changed (visual / behaviour)

- **Glass material:** 40 % / 52 % light (44 % / 60 % dark) instead of 72 % / 86 %, blur 16px + saturate + brightness,
  135° sheen, two-tone rim, dark outer hairline, deeper lift; Clear 6 % + dim 46 %.
- **Buttons are glass:** prominent variants = tinted glass (90 % tint + contrast film), secondary = neutral glass;
  warning is now bright amber with dark text; disabled uses opaque state colours instead of `opacity: .55`; buttons in
  tables / dense areas / glass surfaces keep the look without their own blur.
- **Button hover = outer glow** (the fill behind the label never changes), press uses `--td-glass-press-scale`; a
  custom `color` is always applied opaque (translucent colours composited over white first).
- **Checkbox is round** by default (`--td-checkbox-radius`).
- **Toasts are tinted glass** (per-type wash, deeper icons; dark variants lighter).
- **Frontmost glass wins:** a dropdown / menu / suggestions / tooltip / hovercard over an open modal keeps its glass and
  the covered dialog goes solid (was: the popover went solid).
- **Tooltip = dwp look & behaviour:** arrow, 14px text, shows on touch and on any focus, hides on scroll / resize / tap
  elsewhere, opacity fade; aliases `data-dwp-tooltip`, `data-tooltip-pos`, `data-dwp-tooltip-pos`.
- Modal close X and toast close use the glass foreground (muted greys failed 3:1 on translucent glass).
- Hovercard opens at once only on keyboard focus (`:focus-visible`); a mouse click goes through the hover intent.
  `tabindex="-1"` triggers are made Tab-reachable while bound. Overlapping `bind()` / `bindAll()` owners (menu and
  hovercard) share one attribute snapshot, restored only when the last owner releases the trigger.

### Added

- **Menu option registry:** `TdMenu.define()`, `TdMenu.register()` (plugins add options with `order` / `group`),
  `when(ctx)`, `TdMenu.open(anchor, 'name')`, `TdMenu.has()`, declarative `data-td-menu="name"` + `data-td-menu-*`
  context via `TdMenu.bindAll(root)`; `onSelect` / builders receive ctx.
- **`TdHovercard`** (`./hovercard`): glass hover/focus card with Node, `<template>` or same-origin URL content (string =
  trusted HTML), loading / error states, render-token guard, keyboard contract that works inside a modal.
  Security review: optional `TdHovercard.sanitize` hook (+ `TrustedHTML` accepted) for fragments with user content;
  URL fetches bounded (LRU 50 without `#hash`, 256 KB streamed cap, 10 s timeout, one in flight, aborted on close,
  `TdHovercard.clearCache()`, which also closes the card; `Cache-Control: no-store` honoured; `cache: false` /
  `data-td-hovercard-cache="false"`); Trusted Types safe (DOM-built spinner, innerHTML failures → error state).
- **Rendered contrast gate** `npm run test:contrast` (buttons × states, toasts; light/dark; black/white/checker/photo;
  Chromium/Firefox/WebKit; minimum contrast; opacity assertion) — part of `npm test`.
- Foundations/Glass › Showcase story and a Liquid Glass section in `demo.html`; CSP states for hovercard and the
  clamped tooltip arrow; all CSP baselines recaptured.

## 0.13.0

Backlog quick wins (all additive, opt-in). Plan: `docs/internal/plans/v0.13.0-backlog.md` (Codex plan-review APPROVE, 2 rounds).

### Added

- `TdButton.run(asyncFn)`: busy (`loading`) while the action runs, cleared in `finally`; re-entrant calls share the
  in-flight promise (no double submit).
- `td-toggle` `commit(asyncFn, next?)`: optimistic persistence with a pending state (`aria-busy`,
  `.td-switch[data-pending]`, activation ignored); resolved `false` / rejection reverts and fires `commit-error`.
- `td-input-field` `autoresize` (textarea): grows with its content via CSS `field-sizing`, `rows` stays the minimum
  (`--td-field-rows`, CSSOM), capped by `--td-field-autoresize-max`, then scrolls.
- `demo.html`: a real form (validation gates `run()`, `commit()` toggle, FormData printed as text).
- GitHub CI workflow `.github/workflows/test.yml` (**not run on GitHub yet** — nothing is pushed during the overnight
  run).
- CSP states `td-toggle.pending`, `td-input-field.textarea-autoresize`; stories for the three APIs.

## 0.12.0

**New components** (token-native, Vietnamese defaults): `TdMenu`, `<td-chip-input>`, `TdFormValidation`. Plan:
`docs/internal/plans/v0.12.0-new-components.md` (Codex plan-review APPROVE, 2 rounds; inventory + decisions D1–D25 in
`v0.12.0-new-components-inventory.md`). Built by three agents in isolated worktrees on a shared base, integrated here.

### Added

- **`TdMenu`** (`./menu`): APG menu button as a static helper (`open`, `close`, `isOpen`, `bind`, `button`) —
  strong-glass popover at `--td-z-popover`, roving focus, type-ahead, checkable items (`menuitemcheckbox` /
  `menuitemradio`), `hint` on any item, `href` whitelist https (http only on an http page; others render disabled), `iconNode` SVG only, caller items
  never mutated (`ctx.checked`), focus back to the
  trigger after a selection. Differences from dwp/135: no outside-press swallowing, no custom-node / secondary-action
  items, scrolling no longer closes the menu.
- **`<td-chip-input>`** (`./chip-input`): editable combobox (APG) collecting chips; local `options` or async
  `search(query, { signal })` (debounce, abort + stale-response guard), `show-on-focus`, `allow-create` + `create()`,
  `max-items`, roving chip keyboard, one status region, FormData value (one entry per item), error contract,
  `search-error` event, `renderOption` / `renderChip` (Node or text).
- **`TdFormValidation`** (`./form-validation`): `validate` / `apply` / `clear` / `attach`; native constraints + JS
  `rules`; server errors scoped to the root (fieldMap, name, dotted → bracket, `[data-field]` wrapper → real control);
  a throwing rule fails closed; focus the first invalid control; optional `role=alert` summary; live revalidation after the first failed submit.
- Shared: `utils/typeahead.js` (`fold`, `nextTypeaheadIndex`; td-dropdown uses it), `placeFloating` `align` option,
  `npm run check:stories` + `src/stories-dom.browser-test.js` (story XSS gate: node for string stories, real browser for
  every story; in `npm test`), `npm run test:engines` (menu Tab in Chromium, Firefox,
  WebKit; in `npm test`), index.js exports, CSP states (menu 6, chip-input 6, form-validation 2), token gate popover
  glass fallbacks.

### Changed

- Constraint messages of td-checkbox, td-toggle and td-slider are Vietnamese (were English).
- `.gitignore` ignores a `node_modules` symlink too.

## 0.11.0

**Tailwind is no longer needed.** Every component has been token-native since 0.10.0; this release removes what was
left. A site needs only `td.css` (plus a bundler for the ES modules). Plan: `docs/internal/plans/v0.11.0-drop-tailwind.md`
(Codex plan-review APPROVE, 2 rounds). ADR 0008 is done; ADR 0002 stays superseded.

### Breaking

- The `tailwindcss` **peer dependency is removed**. Tailwind hosts keep working (td.css is layered and components own
  their font/line-height/box-sizing/borders — the `legacy+td` CSP profile checks it); non-Tailwind hosts no longer get a
  peer warning.
- `td-sample` (export `./sample`) renders `.td-sample` BEM markup with a `.td-btn` button instead of Tailwind classes
  (same attributes and `count-change` event).

### Changed

- Storybook and `demo.html` run on `td.css` only (Tailwind CDN, `src/styles/tailwind.css`, `postcss.config.js` and the
  `@tailwindcss/postcss` devDependency removed; `@tailwindcss/cli` stays for the CSP host-interference fixture).
- Docs: README setup is `td.css` only; components/architecture/conventions/vision/CLAUDE.md updated.

### Added

- Guard test `src/styles/no-tailwind.test.js`: fails when a non-`td-*` class token appears in component markup or a
  module imports Tailwind. `td-sample` browser suite (td.css only).

## 0.10.0

Migration **batch 4 — the last legacy components**: `td-datetime-picker` and `td-table` are now **token-native**
(td.css only). Every component is now token-native; the Tailwind peer dependency is dropped in 1.0.0. Plan:
`docs/internal/plans/v0.10.0-batch4.md` (Codex plan-review APPROVE, 3 rounds; inventory + decisions D1–D25 in
`v0.10.0-batch4-inventory.md`). Built by two agents in isolated worktrees on a shared base, integrated here.

### Breaking (internal DOM / classes)

- Internal classes renamed to BEM — `docs/upgrading/class-map.md` (`.td-dtp-wheel-*` → `.td-dtp-wheel__*`, the modal
  body → `.td-dtp-panel__*`; `.td-table-*` → `.td-table__*`). Both components require `td.css`.
- `src/utils/adopt-styles.js` removed (no component uses CSS-in-JS any more; it was never a package export).

### Behaviour changes

- **Datetime-picker:** the trigger is a `button[role=combobox][aria-haspopup=dialog]` (was a readonly input) and is
  updated in place (focus kept); keyboard-operable end to end; Escape closes the dialog (TdModal `escapeCloses`, ADR
  0006 addendum) and discards the edit, as do X and "Đóng"; hour/minute are validated (no more 25:99);
  `getValue()`/`getDBValue()` return `''` when empty, invalid or outside `min`/`max` (was "now"); minutes snap down to `minute-step` when the
  dialog opens; `setDBValue()` ignores garbage and accepts ISO-local; an invalid value submits its raw text.
- **Table:** sorting/paging/data/loading update the table in place (focus stays on the sort button or page control;
  one announcement per page change — the top pagination is `quiet`); `zebra="false"` works (was always on); server mode
  keeps the page when `data` changes (was reset to 1) and requires `total-items` (paginations hidden + warning
  otherwise); the page is clamped; `render` is resolved by column index and gets `(row, rowIdxInPage)`, a Node is
  accepted; `update()` ignores non-array `data`/`columns`; default `empty-text` is "Chưa có dữ liệu để hiển thị.";
  deterministic skeleton, title visible while loading; `th[scope=col]`.

### Added

- Picker: `min` / `max` (date-only bounds expand to 00:00 / 23:59), `error-text` + `setError()`/`clearError()`,
  `aria-label` forwarding, site-overridable `labels` / `messages`; pure parse/format helpers in `utils/datetime.js`
  (`parseDisplay`, `parseDb`, `parseIsoLocal`, `format*`, `isValidParts`, `parseBound`) with node tests.
- Table: `max-height` (sticky header), `cellPaddingClass` (`px-0`…`px-6` → `td-table__cell--px-N`), column `ellipsis`
  (+ auto fixed layout), `empty-title`, `heading-level`, `aria-label` / "Bảng dữ liệu" naming, `sort-change` event,
  `data-col` / `data-col-key` hooks, focusable named scroll region while overflowing.
- TdModal `escapeCloses` option; td-pagination `quiet`; icon `sort`; token `--td-color-sheen`.
- Tests: batch-4 suites (picker 44, table 41, shared), contract fixtures, CSP states (picker 7, table 9 — `_meta.mixed`
  is now empty), token gate sticky-header opacity (light + dark) in 3 engines.

### Fixed

- Idle spinners inside buttons were visible (`.td-spinner { display }` defeated `[hidden]`) — every TdModal action
  button showed a ring.
- `.td-field-error` inherited the host font (serif on unstyled pages).
- Table border colour no longer depends on the host reset (UA `table { border-color: gray }` vs Tailwind preflight).

### Security

- Storybook stories escape every control value (all stories, see 0.9.0 security review); the table stories build row
  content as Nodes. `render` string output stays a documented trusted-HTML hatch.

## 0.9.0

Migration **batch 3 — the floating layer**: `TdModal` / `TdModalStackManager`, `TdToast`, `TdTooltip`, `td-dropdown`
are now **token-native** (td.css only) and Liquid Glass. Plan: `docs/internal/plans/v0.9.0-batch3.md` (Codex plan-review
APPROVE, 4 rounds; inventory + decisions D1–D24 in `v0.9.0-batch3-inventory.md`). Built by four agents in isolated
worktrees on a shared base (`utils/layers.js`, `utils/floating.js`), integrated here.

### Breaking (internal DOM / classes / stacking)

- Internal classes renamed to BEM — `docs/upgrading/class-map.md` (`.td-modal-*` → `.td-modal__*`, `.toast-item` →
  `.td-toast`, `.td-tooltip-content` → `.td-tooltip__content` (arrow removed), `.td-dropdown-*` → `.td-dropdown__*`).
  These components require `td.css`.
- **z-index from tokens:** modal `--td-z-modal` 400, dropdown menu `--td-z-popover` 450 (was 10010), toast
  `--td-z-toast` 500 (was 99999), tooltip `--td-z-tooltip` 510 (new token). Sites with fixed chrome above these
  override the whole `--td-z-*` set. `TdModalStackManager.BASE_Z_INDEX` (`@dazzxq/td-components/modal-stack`) is now an opt-in override (default `null`, warns);
  `TOAST_Z_INDEX_BASE` is 500 and `getToastZIndex()` returns the token value (both deprecated).
- `TdToast.getTheme(type)` returns `{ type, icon }` (was Tailwind classes + SVG markup).

### Behaviour changes

- **One keyboard owner for overlays** (`utils/layers.js`): Escape goes only to the top layer (a menu or tooltip closes
  itself; a modal swallows it, so it never reaches a lightbox below); Tab is trapped by the top blocking layer.
  Lightbox and loading moved onto it; the loading overlay now holds Tab focus.
- **Modal:** `role=dialog` + `aria-modal` + `aria-labelledby` (promise dialogs `alertdialog`), X named "Đóng"; focus
  always moves into the dialog on open (`autoFocus:false` now focuses the dialog itself instead of nothing;
  `focusTarget` only if inside it) and is restored to the opener **before** `onClose`; the page behind is `inert`;
  only the body scrolls (old 60/70 vh cap removed); covered stacked dialogs go solid; a promise-returning `onConfirm`
  keeps the dialog open until it settles; a sync `onConfirm` runs before the promise resolves; `onClose(value)` gets the
  footer action's value. Still never closes on ESC/backdrop (ADR 0006); bottom sheet below 640 px kept.
- **Toast:** strong glass + status icon (no coloured fills); every toast has a close button (sticky too); timers
  pause on hover/focus and while the page is hidden; the message text appears one frame after insertion (announced);
  reachable by keyboard while a modal is open.
- **Tooltip:** `role=tooltip` + `aria-describedby` while shown; opens on keyboard focus; never on touch; no 30 s
  auto-hide; hoverable (100 ms grace); Escape dismisses; scroll repositions instead of hiding; long text wraps;
  `title` handling per D15 (see components.md); `data-tooltip-text-color` requires `data-tooltip-color`;
  `disconnect()` fully tears down.
- **Dropdown:** APG select-only combobox — trigger `role=combobox`, options are no longer Tab stops
  (`aria-activedescendant`), clear option in the arrow order, type-ahead; Tab closes the menu; outside click closes on
  `pointerdown`; exactly one `change` per selection; `open()` does nothing while disabled.

### Added

- `utils/layers.js` (`LAYERS`, `register`, `hasActiveAbove`, `trapContainers`, `focusablesIn`, `trapTab`),
  `utils/floating.js` (`placeFloating`, `isReferenceHidden`), `inert-lock` `registerFloating` / `hasFloatingAbove`.
- Modal `actions` (async footer buttons), `onShow(root, payload)` + `onShowPayload`, `messageHtml`, `TdModal.labels`.
- Dropdown `label` attribute and error contract (`error-text`, `setError`, `clearError`), `aria-required`.
- Toast placement tokens `--td-toast-top/-bottom/-inline-start/-inline-end/-align`.
- Tests: layer + integration suites (loading over modal, menu in stacked modals, Escape routing, toast reachable over a
  modal, tooltip over toast), per-component batch-3 suites, contract fixtures for all four, CSP matrix +20 states
  (td-datetime-picker moved to `_meta.mixed`), token gate floating-glass fallbacks (glass off / forced colours / solid
  over a modal) in 3 engines.

### Fixed

- CSP smoke tests for td-tooltip and td-modal-stack exercised nothing (dead event / instance methods on a static
  class); the tooltip is now in the matrix and the stack smoke drives its static API.
- Dropdown menu and tooltip usable inside a modal (floating registrations are exempt from the modal's inert lease).

### Security

- Trusted-HTML hatches documented: modal `body` (string form) and `messageHtml`; `message` and toast text are text only.
- Modal `width`/`height`/`bodyPadding` validated with `CSS.supports` (no `url()`/`var()`) before use.

## 0.8.0

Migration **batch 2**: `td-input-field`, `td-slider`, `td-pagination`, `td-tabs`, `td-empty-state` are now
**token-native** (td.css only). Plan: `docs/internal/plans/v0.8.0-batch2.md` (Codex plan-review APPROVE, 3 rounds; inventory +
decisions D1–D19 in `v0.8.0-batch2-inventory.md`). Built in parallel by four agents in isolated worktrees, integrated here.

### Breaking (internal DOM / classes)

- Internal classes renamed to BEM — `docs/upgrading/class-map.md` (`.td-input*` → `.td-field*`, `.td-slider-*` →
  `.td-slider__*`, `.td-pagination-*` → `.td-pagination__*`, `.td-tab-btn` → `.td-tabs__tab`, `.td-empty-*` →
  `.td-empty-state__*`). These components require `td.css`.

### Behaviour changes

- **One event per kind** for input-field and slider (native `input`/`change` no longer bubble); input-field `change`
  only when the value changed since focus.
- **Tabs keyboard:** APG roles, roving tabindex, ← → Home End move focus, **Enter/Space select** (manual activation);
  `activation="auto"` makes arrows select. Default tablist name "Các thẻ".
- **Pagination:** page numbers are buttons (`aria-current`), focus kept across page changes, `max-pages` is now the
  window of consecutive pages (was only a threshold — bug), current page is a solid accent pill (was red text,
  3.76:1), `current-page` clamped. td-table no longer forces `#ef4444` and names its two paginations.
- **Input-field:** error AND helper show together; form reset clears the error; attribute changes update in place
  (focus + caret kept); the counter at the limit no longer turns the border red; the label is always associated
  (`field-id` verbatim, else `{host-id}-control`).
- **Slider:** default colour is the accent token; `color` accepts any safe CSS colour; `track-color` is applied
  (it was ignored); step marks only when ≤ 50; `role=slider`/`aria-value*` duplicates removed (native range).
- **Empty-state:** raw `<svg>` string `icon` deprecated and validated (see Security); unknown icon names warn and fall
  back to `inbox`; `actions` render `.td-btn` buttons and no longer stack listeners.

### Added

- `aria-required`, `aria-describedby` (helper, counter, error), host `aria-label` forwarding and external
  `<label for>` naming for every form control (shared `_applyAccessibleName` in `TdFormElement`); the error id is also
  in `aria-describedby` for checkbox/switch (AT support for `aria-errormessage` is patchy).
- `TdFormElement`: `_mountErrorNote`, `_describedByIds`, `_syncDescribedBy` hooks; slider + input-field on the error
  contract.
- td-tabs `tab.panel` (managed tabpanel with attribute restore), `activation`, `aria-label`; td-pagination `aria-label`;
  td-empty-state `iconNode`, `heading-level`; td-slider `--td-slider-w`, `aria-valuetext`, knob glass lift while
  dragging; icons `upload`, `link`, `image`; `svgStringToDefinition` / `renderIconDefinition`.
- CSP harness: `_meta.mixed` (td-table: Tailwind + td.css), td-only page body reset (`fixture/harness.css`), 44 new
  token-native baselines; contract fixtures for all five; per-component batch-2 browser suites.

### Fixed

- **External `<label for="host-id">` click** now focuses the inner control (and toggles checkbox/switch) — the base
  class documented it but never did it.
- **Moving an element in the DOM** kept it rendered but dead (listeners were removed on disconnect and never re-bound);
  it now re-renders on reconnect.
- Tabs indicator re-measured on resize (ResizeObserver); the `tabs` setter re-validates the active tab.

### Security

- td-empty-state raw-SVG hatch closed: strings are parsed as `image/svg+xml` and rebuilt from the icon geometry
  allowlist (root attributes allowlisted too); anything else is rejected.
- `renderIconDefinition()` validates its input (it is exported); SVG strings are bounded (32 KB, no DTD, ≤ 64 shapes,
  attribute values ≤ 8 000 chars); td-pagination `max-pages` clamped to 25 (bounded DOM for API/CMS-bound values).

## 0.7.0

Migration **batch 1**: `td-button`, `td-checkbox`, `td-toggle`, `TdLoading` are now **token-native** (td.css only,
no Tailwind, no adopted stylesheets). Plan: `docs/internal/plans/v0.7.0-batch1.md` (Codex plan-review APPROVE, decisions D1–D10).

### Breaking (internal DOM / classes)

- Internal classes renamed to BEM — see `docs/upgrading/class-map.md`. Public tags, attributes, properties, methods
  and events are unchanged except the behaviour changes below.
- These four components **require `td.css`** (`import '@dazzxq/td-components/td.css'` or `<link>`).
- `td-checkbox` host custom property `--td-cb-color` → `--td-checkbox-color`.

### Behaviour changes

- **One `change` event** for `td-checkbox` / `td-toggle` (the inner input's native `change`/`input` no longer bubble
  alongside the CustomEvent).
- **`td-toggle`** is a native `<input type="checkbox" role="switch">` (accessible name, native Space/disabled/focus);
  **Enter no longer toggles** (APG switch pattern).
- **`td-button` loading** keeps focus: `aria-busy` + `aria-disabled` + swallowed clicks instead of native `disabled`
  and a re-render. `disabled`/`loading`/`label` update in place.
- **`td-button` look**: solid fills (glass removed — liquid-glass R1/R7); status variants use the semantic colour
  tokens (all ≥ 4.5:1; the old glass variants were 2.0–3.2:1). Radius token `--td-btn-radius` (14 px; capsule on
  touch). `icon` takes a registry name; other values are a deprecated legacy class list.
- **`td-checkbox` default colour** is the accent token (was `#2196F3`); **`td-toggle` default on-colour** `#16a34a`
  (was `#4ADE80`, 1.7:1) with a 3:1 off-track edge (WCAG 1.4.11).
- **`TdLoading.wrap()` is ref-counted**; the overlay is `role="status"`, holds focus, makes the page `inert`
  (toasts excluded) and locks scroll, restoring all of it exactly once. `z-index` token `--td-z-loading: 480`
  (was 99999: now below toasts).

### Added

- **Error contract** in `TdFormElement` (opt-in; on for checkbox + switch): `setError(msg)`, `clearError()`,
  `errorMessage`, `error-text` attribute → `aria-invalid` + `aria-errormessage` + `.td-field-error` note; cleared on reset.
- **Accessible-name precedence** for checkbox/switch: `label` → host `aria-label` → external `<label for>` via
  `aria-labelledby`. Hit areas ≥ 24 px (44 px on touch).
- **Shared inert lease** `src/utils/inert-lock.js` (security review): TdLoading and td-lightbox no longer make the
  page inert independently — overlapping overlays stack by layer, `inert` is removed only when no overlay needs it,
  body children appended while blocked are covered, the site's own `inert` is never touched.
- `TdCheckableElement` base; `fillIconSlots()` in `@dazzxq/td-components/icons`; shared `.td-spinner`;
  tokens `--td-btn-*`, `--td-checkbox-*`, `--td-switch-*`, `--td-control-border-strong`, `--td-field-error`,
  `--td-z-loading`; `TdLoadingSpinner.create({ label })`; `td-button` forwards `aria-label`; button auto text colour
  by WCAG contrast for any CSS colour (browser-resolved; alpha composited over white).
- CSP harness: token-native profile (`_meta.tokenNative`; td.css-only baselines, 28 states; the `legacy+td` run proves
  host Tailwind cannot alter them); golden markup contracts `test/contracts/{button,checkbox,switch,loading}.html`;
  batch-1 browser suite (contrast, focus, events, naming, error contract, hit targets, loading lifecycle).

### Removed

- `*-csp-fallback.browser-test.js` for checkbox/toggle/loading (they tested the adopted-sheet fallback ADR 0008 removes).

## 0.6.0

First **token-native** component and the shared icon registry. Plan: `docs/internal/plans/v0.6.0-lightbox.md`
(Codex plan-review APPROVE). No change to existing components.

### Security

- Dev tooling: Storybook 8.6.14 → **8.6.18** (GHSA-mjf5-7g4m-gx5w WebSocket hijacking; GHSA-8452-54wp-rmv6
  `.env` leak into builds) + `npm audit fix` (non-breaking). Remaining advisories are dev-only transitive deps
  that need breaking majors (`extract-zip` via `@web/test-runner`'s puppeteer browsers — unused, tests use the
  Playwright launcher; `uuid` via Storybook addons) — tracked in the roadmap. The published package has no runtime
  dependencies.

### Added

- **`TdLightbox`** (`@dazzxq/td-components/lightbox`, [ADR 0009](docs/internal/decisions/0009-td-lightbox-hooks.md)) —
  clean-room port of the dwp lightbox core, styled by `td.css` (Clear glass chrome + local dim, solid panel):
  - `open(items, options)` → handle, `bind(root, options)` → unbind, events `td-lightbox-open|change|close`;
    no side effects on import, no window globals, no inline styles.
  - Hooks: `isAllowedUrl` (default `https:`, `http:` only on an `http:` page — no cleartext downgrade), `download`, `video` (default native `<video>`; failure-isolated,
    abortable), `history` (off by default; `true` or an adapter with a defined push/back/pop contract incl.
    async-push races), `panel` (caption or custom element; 2-column / bottom sheet), `toolbar` (registry icons),
    `labels` (Vietnamese defaults), `closeOnBackdrop`, `isForeignLayerOpen`.
  - Pointer Events gestures (pinch, pan, double-tap / click zoom, swipe navigate / close / sheet), keyboard
    (Esc, arrows, F, Tab trap that always holds), fullscreen, preload + spinner, render-token stale guards.
  - Fixes vs the dwp original: restores only the `inert` it set, shares the ref-counted scroll lock with the
    modal stack, no selector built from toolbar ids, no `innerHTML` icons, gallery index by element (not src).
- **Icon registry** (`@dazzxq/td-components/icons`, [ADR 0010](docs/internal/decisions/0010-icon-registry.md)) —
  `tdIcon(name, { size, label, class })`, `registerIcons()` (allowlisted data only), `hasIcon`, `listIcons`,
  opt-in `<td-icon>` (`./icon-element`); 24 core icons (Lucide geometry, td names) authored in
  `src/icons/icons.json` (also exported for PHP) → generated `registry.js` (`build:icons` / `check:icons`);
  size tokens `--td-icon-s|m|l`, `--td-icon-stroke`; `THIRD_PARTY_NOTICES.md`.
- Tests: lightbox browser suite (42), icon suite, lightbox page in the token CSP gate (3 engines × self /
  nonce-only: zero violations, zoom, close); markup contract fixture `test/contracts/lightbox.html`.
- Storybook: **Feedback/Lightbox** (gallery, caption panel, hooks, video), **Foundations/Icons**; Foundations/Glass
  stories use registry icons instead of text glyphs.

## 0.5.0

Foundation for the token-driven kit ([ADR 0008](docs/internal/decisions/0008-drop-tailwind-token-css.md),
plan: `docs/internal/plans/v0.5.0-foundation.md`). **No existing component changes appearance**: the legacy
Tailwind components are untouched and the new stylesheet is reset-free (proven by a combined parity run).

### Added

- **`td.css`** (package export `@dazzxq/td-components/td.css`) — one canonical, self-contained stylesheet
  built from `src/styles/` (`npm run build:css`; `npm run check:css` fails when stale):
  - layer order `@layer td.tokens, td.component, td.utilities` declared once;
  - public `--td-*` tokens (type, spacing, neutrals, radius, shadow, z-index, motion, semantic colours,
    accent, controls) and the Liquid Glass token set (Regular, Clear, dim, tint, interaction, geometry);
  - opt-in dark theme via `<html data-td-theme="dark">` (never automatic; experimental values);
  - Liquid Glass recipes `.td-glass-surface` (`--strong`, `--lg`, `--clear`), `.td-glass-dim(--text)`,
    `.td-glass-tint`, with accessibility fallbacks that sites cannot defeat by overriding public tokens:
    no `backdrop-filter`, `prefers-reduced-transparency`, `<html data-td-glass="off">` (manual switch for
    Safari/iOS), `prefers-contrast: more`, `forced-colors` (system colours), `prefers-reduced-motion`;
  - `.td-sr-only`.
- **Token gate** `npm run test:tokens` — Chromium, Firefox and WebKit × CSP `style-src 'self'` and
  nonce-only (`style-src 'nonce-…'; style-src-attr 'none'`): zero violations, token resolution, subtree
  theming, every fallback on every recipe, no automatic dark flip. Uses the newest cached Firefox/WebKit
  when the pinned revision is not installed (`TD_FIREFOX_PATH` / `TD_WEBKIT_PATH` override).
- **Combined legacy parity** `npm run test:csp:combined` — the legacy CSP harness with `td.css` linked after
  the Tailwind fixture must match the same 73 baselines.
- Storybook: `td.css` loaded globally; new **Foundations/Glass** stories (Regular, Strong + Large,
  Clear over media, Clear + text) with `glass` on/off and `theme` light/dark controls.
- Docs: CSS authoring + site override guide (`docs/internal/architecture.md`), class-map skeleton
  (`docs/upgrading/class-map.md`).

### Verified

- Under nonce-only CSP, CSSOM style writes **and** constructable stylesheets (`adoptedStyleSheets`) are
  applied in all three engines → legacy `adoptStyles` components also work under nonce-only CSP.

## 0.4.1

Bugfix release on the current (Tailwind) architecture. Sources: dcms2 + dwp fixes since 2026-06
(see `docs/internal/history/2026-09-sync-dcms-dwp.md`). No API removals.

### Fixed

- **`TdToast` froze the tab on the 6th simultaneous toast.** The FIFO cap looped on
  `_activeToasts.length`, but a toast only left that list after its 180ms exit animation, so the
  `while` never terminated. Toasts now leave the list synchronously (`shift()` + removal before the
  animation).
- **`TdToast` roles** — every toast was `role="alert"` while also declaring `aria-live="polite"`.
  Now `role="status"` (polite) for success/info/warning and `role="alert"` only for errors.
- **Storybook build (and older-target consumer builds) broke** on the top-level
  `await import('./td-modal-stack.js')` in `td-toast.js`. Replaced with a static import.
- **`TdModal` closed in the same frame it opened leaked its focus trap.** The entrance rAFs and the
  50ms auto-focus timer now re-check that the modal is still open, so a modal closed immediately is
  never un-hidden, never traps Tab, and never steals focus. `TdModal.closeAll()` now also removes
  every focus-trap listener (it previously left them attached).
- **Modal scroll lock clobbered the host page.** `TdModalStackManager` wrote
  `document.body.style.overflow = 'hidden'` / `''`, erasing any overflow the page had set and
  turning `<body>` into a scroll container (breaks `position: sticky`). It now uses a shared,
  ref-counted lock on `<html>` (`src/utils/scroll-lock.js`) that restores the page's previous inline
  value exactly. Other overlays can take their own lease (`lockScroll()` → release fn).
- **`td-input-field` `setError('')` erased the helper text**, and focus/blur reset the border from
  the `error-text` *attribute*, dropping a runtime `setError()` border. Error and helper are now
  separate states: the note shows the error if any, otherwise the helper; the red border survives
  focus/blur and the counter; the inner control gets `aria-invalid="true"` while in error. A new
  `error-text` / `helper-text` attribute value replaces an earlier runtime override.
- **`td-dropdown` placement and focus.**
  - The menu no longer clamps `top` to 8px (which covered the trigger / fixed headers): it opens on
    the side with more room and caps the options list height to fit the viewport.
  - Clamped horizontally into the viewport.
  - Closes once the trigger is effectively hidden (within 8px of the viewport edge or not rendered),
    not only when fully off-screen.
  - The delayed search-box focus timer is cancelled on close / disconnect / destroy.
  - Closing while focus is inside the menu returns focus to the trigger.

### Added

- `src/utils/scroll-lock.js` — `lockScroll()` / `isScrollLocked()` (internal utility, used by the
  modal stack; will be shared with `td-lightbox`).
- Browser regression suite `src/feedback/td-regressions-v041.browser-test.js` (B1–B6).

## 0.4.0

Logic / behavioral / a11y improvements ported from the dcms-components comparison. No public
attribute/property/event renames and no rendered visual change; CSP parity gate stays at 73/73.
One **deliberate behavioral change**: `td-modal` no longer dismisses on backdrop-click (see Changed).

### Fixed

- **`td-dropdown`** — `searchable` and `allow-clear` can finally be turned **off**. Their
  internal checks (`_isSearchable()` / `_isAllowClear()`) were written `!hasAttr || hasAttr`,
  which always returned `true`, so the search box and clear option could never be disabled.
  They now default **ON** and turn off only when explicitly set to a falsy value
  (`searchable="false"` / `"0"` / `"off"`, likewise `allow-clear`); a bare/absent attribute
  stays ON. Both the **attribute** and the **JS property** disable them — `el.searchable = false`
  / `el.allowClear = false` write `="false"` (not `removeAttribute`, which the base mapping did,
  leaving the flag stuck ON), and the property getter returns a real boolean.
- **`td-modal.confirm()` promise hang** — dismissing a `confirm()` (X button or `closeAll()`)
  left its Promise **unresolved forever** (no `onClose` handler). Ported dcms's settled-flag +
  resolve-first pattern: every close path now resolves **exactly once** (confirm → `true`;
  cancel / X / `closeAll` → `false`), and a throwing user callback (`onConfirm`/`onCancel`) can
  no longer hang the Promise. `success`/`error`/`info` got the same treatment (OK → `true`,
  dismiss → `false`).

### Changed

- **`td-modal` no longer closes on backdrop-click** (the click-to-dismiss handler was removed),
  and it never closed on ESC — **deliberate**, to prevent **accidental dismissal**. A modal is
  dismissed only via the **X button**, a **footer button**, or programmatically
  (`closeById`/`closeAll`). `closable:false` now solely **hides the X** (force-action modal). The
  Tab focus-trap is unchanged.

### Added

- **`td-input-field` `type="date"`** — now renders a native `<input type="date">` (calendar
  picker) instead of degrading to `text`. Native `min`/`max` are forwarded to the inner control
  for `date`, and the host independently recomputes range/type validity via its probe so
  constraint validation stays correct. Form-association is unchanged (the host still owns
  submission/validity).
- **`td-toggle` a11y** — the switch now exposes `role="switch"` with `aria-checked` kept in sync
  on every state change, plus `aria-disabled`, keyboard focusability (`tabindex`), and Space/Enter
  operability. No visual change.
- **`src/utils/dom-utils.js` toolbox** (new subpath export `@dazzxq/td-components/dom-utils`) —
  pure, framework-free helpers ported from `dcms-utils.js`: `slugify` (Vietnamese-aware),
  `formatFileSize`, `formatNumber`, `debounce`, `throttle`, `getAccessibleTextColor`,
  `contrastRatio`, plus `parseColorToRgb`/`relativeLuminance`. No component is forced to use it;
  it is an opt-in toolbox. App/Laravel-coupled helpers (CSRF, API-response, image-resize URL)
  were intentionally excluded.

## 0.3.1

`td-button` now supports a `type` attribute (`button`|`submit`|`reset`, default `button`, whitelisted) so it can submit/reset a form (light-DOM inner `<button>`). Backward compatible.

## 0.3.0

**CSP-strict compatible** — no declarative inline styles, no injected `<style>`; styling is
applied via CSSOM (`element.style`) and **constructable stylesheets** (`adoptedStyleSheets`).
The library now renders correctly under a strict `Content-Security-Policy: default-src 'self'`
with **no `style-src 'unsafe-inline'`**. A non-vacuous parity gate (`npm run test:csp`) proves,
under that enforced header, zero CSP violations **and** pixel-identical computed styles vs a
pre-refactor baseline across every component's full state matrix (73 states).

### ⚠️ Compatibility notes (compatibility-impacting minor)

1. **Requires `adoptedStyleSheets`** — Chromium 73+, Safari 16.4+, Firefox 101+. On an older
   browser (or SSR) the constructable-stylesheet helper degrades gracefully: components still
   render structurally (Tailwind utility classes + CSSOM scalars apply); only the
   selector/pseudo-class/`@keyframes` embellishments (hover, checked, spinner animation) are
   absent. No CSS-file fallback (the library ships no CSS by design).
2. **The DOM no longer carries the old inline `style` attributes.** Per-element styling is now
   set imperatively via CSSOM, and shared selector/state/keyframe rules live in an adopted
   stylesheet. Any consumer/integration/test that inspected those inline `style="…"` attributes
   (or an injected `<style>` element) will observe the change. Public attributes, properties,
   events, and rendered visual output are unchanged.
3. **Trusted raw-HTML escape hatches remain the consumer's CSP responsibility** (unchanged from
   0.2.0): `TdModal.show({ body })`, `td-table` column `render(row)`, and `td-empty-state`'s raw
   `<svg>` icon inject consumer HTML verbatim — if you pass `style="…"`/`<style>` through them, a
   strict CSP will block it. This release hardens only **library-authored** render output.

### Changed

- Every component's styling moved off declarative inline `style=`/injected `<style>`:
  per-instance scalars → CSSOM (`utils/css-safe.js` gains `applyStyles(el, map)`); selector,
  pseudo-class, `::before`/`::after`, state-combinator, `@keyframes`, and `@media` rules → a
  single per-component constructable stylesheet adopted once via the new
  **`utils/adopt-styles.js`** (`adoptStyles(css, key)` — feature-detected, lazy, idempotent,
  never throws in node/SSR). Per-instance dynamic values inside selector rules use CSS custom
  properties set via CSSOM. SVG inline styles → SVG presentation attributes.
- `TdBaseElement` calls an optional `_applyStyles()` hook after `afterRender()` on every render
  (initial + observed-attribute re-render), so state-dependent scalars stay correct.

### Added

- `npm run test:csp` — a standalone Playwright CSP parity gate (strict-CSP render + zero
  violations + computed-style parity + animation liveness), wired into `npm test`. Added
  explicit pinned devDeps `playwright-core` and `@tailwindcss/cli` + a deterministic Tailwind
  fixture used as the parity oracle.

## 0.2.0

The form-controls release: every form control is now a real **form-associated custom
element** (via `ElementInternals`), and a context-based XSS model hardens the whole library.

### ⚠️ Breaking changes

1. **`td-toggle` is now UNCONTROLLED by default.** Clicking it self-toggles like a native
   checkbox (and still emits `change`). To restore the old emit-only behavior (where you
   flip `checked` yourself), add the new boolean attribute **`controlled`**:
   ```html
   <td-toggle controlled></td-toggle>
   ```
2. **`td-input-field`'s inner native control no longer carries a `name`.** Submission now
   goes through the host element's `name`. If you relied on the inner `<input name>` (e.g.
   reading it from `FormData` under a different name, or styling `input[name=…]`), use the
   host's `name` instead. No change needed for normal `<form>` usage.

> **Not changed:** `tailwindcss` remains a **required** peer dependency (`>=4.0.0`). The
> baseline still expects Tailwind v4 on the host — see the README for the `@source` setup.

### Added

- **Form association for all form controls** (`td-input-field`, `td-checkbox`, `td-toggle`,
  `td-slider`, `td-dropdown`, `td-datetime-picker`): each submits in a host `<form>`
  (`FormData`/POST), supports `name`/`required`, participates in constraint validation,
  resets with the form, and is excluded by an ancestor `<fieldset disabled>`. Autofill/
  bfcache **state restore** is implemented for `td-input-field`, `td-dropdown`, and
  `td-datetime-picker`. New base class **`TdFormElement`** (exported;
  `@dazzxq/td-components/form-element`).
- `td-datetime-picker`: submits **ISO 8601** by default; `form-value-format="display"|"db"`
  to change the submitted shape.
- `td-input-field`: `min`/`max`/`step` (number), host-computed `typeMismatch`/range/step/
  `tooLong`/`valueMissing` validity.
- CSS-context sanitizers (`src/utils/css-safe.js`): `safeColor`, `safeHexColor`,
  `safeCssDimension`, `clampNumber`; `TdBaseElement.safeColor()`.
- Real-browser test suite (`@web/test-runner` + Playwright) for form behavior and XSS.
- Docs: a full [component catalog](docs/components/README.md) with a security model / context table.

### Security

- Closed the **`color` → CSS injection / attribute-breakout** vector: all color attributes
  (`color`/`track-color`/`active-color`/`text-color`) across checkbox, toggle, slider,
  button, pagination, and table are validated before entering a `<style>` rule or
  `style=""` attribute.
- **`TdToast` messages are now HTML-escaped** (previously interpolated raw into `innerHTML`).
- `td-table` column keys are escaped in `data-*` attributes; widths are CSS-sanitized and
  `align` is whitelisted; `td-input-field` `max-length` is coerced to a safe integer.
- `TdLoadingSpinner` colors are sanitized before entering the SVG.
- Trusted raw-HTML escape hatches are documented as explicit opt-ins (`TdModal` body,
  `td-table` column `render(row)`, `td-empty-state` raw `<svg>` icon).

## 0.1.0

- Initial release: ~16 vanilla Web Components (no Shadow DOM) on `TdBaseElement`, styled
  with host Tailwind v4. Form/feedback/display families with Storybook.
