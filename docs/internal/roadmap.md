# Roadmap

Roadmap sống. Mỗi item một dòng, kèm trạng thái: `todo` · `doing` · `done` · `blocked`.
Khi xong: đánh `done`, ghi vào [CHANGELOG.md](../../CHANGELOG.md), rồi xoá dòng ở lần release sau.
Nguồn gốc các item B/a11y: [history/2026-09-sync-dcms-dwp.md](history/2026-09-sync-dcms-dwp.md).

## Đang làm — lộ trình dsuite (yêu cầu dienthoaihay, chốt với Codex 2026-10-03; xếp lại 2026-10-04 theo đồng thuận media picker, [ADR 0013](decisions/0013-media-picker-boundary.md))

- `done` v0.27.0: `td-otp-input`, `td-drawer`, `td-copy`, CSS skeleton
- `done` v0.28.0 ~14/10 (A0 tới 20/10): `td-chip-input` chọn nhiều (closed-set, `<select multiple>`, chọn tất cả đang hiện, `td_multiselect`) — xong P0
- `done` v0.29.0: `td-tree` + `td-tree-select`
- `done` v0.30.0 ~28/10: `td-number-input` + `td-repeater` (đặt `OrderedCollectionModel`) — đảo theo lịch dsuite (A2.3 cần ~26/10)
- `done` v0.31.0 ~04/11: `td-sortable` (dùng lại OrderedCollectionModel) + `td-masked-value` (A1 cần từ 12/11)
- `done` v0.32.0: `<td-media-picker>` / `TdMediaPicker.open()` (list / get / tìm / facet / chọn đơn + nhiều, upload kèm
  `uploadFields` + dedup, sửa metadata tường minh theo descriptor) + `<td-media-field>` (đơn, reference / usage) + PHP
  `td_media_field()` — [ADR 0013](decisions/0013-media-picker-boundary.md), plan
  [v0.32.0-media-picker](plans/v0.32.0-media-picker.md)
- ~~v0.32.1~~ **gộp vào v0.33.0** (owner 2026-10-04): xoá + trình bày usage chặn xoá (`DeleteResult` `blocked`) + tải bản
  gốc (`download`); acceptance *delete-blocked* + *download* chuyển sang chặn phát hành v0.33.0
- `done` v0.33.0: picker **giống dcms2** (full viewport, control kit, phân trang số, card 3:2, chi tiết inline, dialog tải
  lên + **tải từ URL** — `adapter.uploadFromUrl` tuỳ chọn) + xoá / tải gốc / copy (từ v0.32.1) + `td-media-grid`
  `layout="justified"` (thuật toán dwp) + sửa ô lưới — plan
  [v0.33.0-media-picker-dcms-parity](plans/v0.33.0-media-picker-dcms-parity.md), kiểm kê
  [research/dcms2-media-picker-inventory](research/dcms2-media-picker-inventory.md); hợp đồng adapter chỉ **thêm** ([bổ sung
  ADR 0013](decisions/0013-media-picker-boundary.md#bổ-sung-v033)); ảnh chụp so sánh `npm run test:visual` (chỉ CI Ubuntu)
- `done` v0.34.0: responsive chuẩn toàn kit (xs < 480 · sm 480–719 · md 720–1023 · lg · xl; `short` ≤ 500 cao) + `td-table`
  dạng card + gate responsive 3 engine — [ADR 0014](decisions/0014-breakpoints-container-queries.md), plan
  [v0.34.0-responsive](plans/v0.34.0-responsive.md) (audit đo 2026-10-04; M0 đối chiếu v0.33)
- `done` v0.35.0: `td-cropper` (toạ độ) + tích hợp crop vào picker / field (chỉ thêm UI; FormData `name[crop]` giữ nguyên)
  — lùi từ v0.33 (báo dsuite)
- `done` v0.36.0: polish theo owner — tick chung (ADR 0017), phím tắt chọn, màu ngữ nghĩa đặc, toast 6 vị trí (ADR 0016),
  OTP `length` / `charset`, `td-action-button`, picker / modal gọn di động, lightbox điện thoại (thanh đáy), hàng option
  kiểu dcms2 — plan [v0.36.0-polish](plans/v0.36.0-polish.md)
- `done` v0.36.1: `td-table` card gọn (QĐ 62) — vai trò `lead`, cặp theo nội dung, action chỉ icon, thanh sắp xếp một hàng — plan
  [v0.36.1-table-card-density](plans/v0.36.1-table-card-density.md)
- `done` v0.36.2: chuẩn touch toàn kit (hover chỉ con trỏ mịn, hình nhấn, tooltip không bật khi chạm, ngưỡng kéo theo
  loại con trỏ, lớp phủ co theo bàn phím ảo, lightbox vuốt theo ngón, lane `test:touch`) — plan
  [v0.36.2-touch](plans/v0.36.2-touch.md), [ADR 0019](decisions/0019-touch-standard.md)
- `done` v0.37.0: `td-table` chọn dòng ([ADR 0018](decisions/0018-table-row-selection.md)) — plan
  [v0.37.0-table-row-selection](plans/v0.37.0-table-row-selection.md)
- `done` v0.38.0: `td-scan-input` (A3) — plan [v0.38.0-scan-input](plans/v0.38.0-scan-input.md)
- `done` v0.39.0: hook lọc ngoài + ẩn / hiện cột + `td-filter-chips` — plan [v0.39.0-filters-range](plans/v0.39.0-filters-range.md)
- `done` v0.40.0: `<td-datetime-range>` + preset — xong P1 — plan [v0.39.0-filters-range](plans/v0.39.0-filters-range.md) (phần v0.40)
- `done` v0.41.0: theming R1 — light / dark / `auto` chính thức, nối token ngữ nghĩa, dark tinh chỉnh, gate toàn trang — plan
  [v0.41.0-theming](plans/v0.41.0-theming.md)
- `done` v0.42.0: theming R2 — `palette.js` + CLI `td-theme` + trang builder + theme theo vùng + cầu portal ([ADR 0020](decisions/0020-theme-scope-portal.md))
- `done` v0.42.1: vá tương phản dark (link khung lỗi form khi nhấn, nút × chip khi nhấn)
- `done` v0.43.0: `<td-media-gallery>` (field gallery / nhiều ảnh, [ADR 0021](decisions/0021-media-gallery-form-shape.md)) — plan [v0.43.0-media-gallery](plans/v0.43.0-media-gallery.md)
- `done` v0.44.0: `TdModal.confirm({ typeToConfirm })` + `trackFormDirty()` + chặn đóng modal / drawer (`beforeClose`) — plan [v0.44.0-confirm-dirty](plans/v0.44.0-confirm-dirty.md)
- `done` v0.45.0: `<td-steps>` + `<td-timeline>` — plan [v0.45.0-steps-timeline](plans/v0.45.0-steps-timeline.md)
- `done` v0.46.0: `<td-diff>` (audit log trước / sau) — plan [v0.46.0-diff](plans/v0.46.0-diff.md)
- `done` v0.47.0: `<td-check-matrix>` (lưới quyền × vai trò, [ADR 0022](decisions/0022-check-matrix-grid-form-shape.md)) — plan [v0.47.0-check-matrix](plans/v0.47.0-check-matrix.md)
- `done` v0.48.0: `<td-color-picker>` — plan [v0.48.0-color-picker](plans/v0.48.0-color-picker.md)
- `done` v0.49.0: `<td-choice-group>` + `<td-number-input stepper>` ([ADR 0023](decisions/0023-unowned-radio-group.md)) — plan [v0.49.0-choice-stepper](plans/v0.49.0-choice-stepper.md)
- `done` v0.50.0: `<td-rating>` + `<td-carousel>` ([ADR 0024](decisions/0024-carousel-native-scroll.md)) — plan [v0.50.0-rating-carousel](plans/v0.50.0-rating-carousel.md); hết hàng đợi yêu cầu dsuite
- `done` v0.51.0: `<td-media-gallery>` chú thích từng ảnh + `alt-maxlength` / `caption-maxlength` (dsuite A2.10) — plan [v0.51.0-gallery-caption](plans/v0.51.0-gallery-caption.md)
- `done` v0.51.1: vá nháy control native trước khi JS nạp (SSR pre-upgrade, CSS-only, [ADR 0025](decisions/0025-pre-upgrade-parity.md)) — plan [v0.51.1-ssr-fouc](plans/v0.51.1-ssr-fouc.md)
- `done` v0.52.0: `<td-toggle>` `tone` / `locked` (2FA) + `<td-choice-group variant="segmented">` — plan [v0.52.0-toggle-tone-segmented](plans/v0.52.0-toggle-tone-segmented.md)
- `done` v0.53.0: `TdMenu` item `type: 'custom'` (menu panel, [ADR 0026](decisions/0026-menu-panel-custom-rows.md)) — plan [v0.53.0-menu-custom-item](plans/v0.53.0-menu-custom-item.md)
- `done` v0.53.1: segmented trong container hẹp (bố cục cả thanh, `stretch`, cuộn trong thanh) — plan [v0.53.1-segmented-layout](plans/v0.53.1-segmented-layout.md)
- `done` v0.53.2: vá căn dọc `td-toggle` cạnh chữ + sheet lightbox trên điện thoại che thanh ‹ đếm ›
- `done` v0.54.0: `helper-text` cho mọi form control + `<td-hint>` + toggle `on-text` / `off-text` ([ADR 0027](decisions/0027-shared-helper-contract.md)) — plan [v0.54.0-hint](plans/v0.54.0-hint.md)
- `done` v0.54.1: vá property gán trước khi nâng cấp (template clone / createElement trước define) — plan [v0.54.1-preupgrade-props](plans/v0.54.1-preupgrade-props.md)
- `done` v0.55.0: `prefix` / `suffix` input-field + number-input, `locale` số, `--td-field-note-size` ([ADR 0028](decisions/0028-field-affix-number-locale.md)) — plan [v0.55.0-affix-number](plans/v0.55.0-affix-number.md)
- `done` v0.56.0: `td-repeater` `value` / `disabled` / `readonly`, 6 icon + 3 preset nút thao tác, PHP `td_date()` ([ADR 0029](decisions/0029-repeater-field-values-and-lock.md)) — plan [v0.56.0-repeater-icons-date](plans/v0.56.0-repeater-icons-date.md)
- `done` v0.57.0: bảng cây `<td-table tree>` + `moveRow` / `canDrop` / `max-depth` ([ADR 0030](decisions/0030-tree-table-treegrid.md)) — plan [v0.57.0-tree-table](plans/v0.57.0-tree-table.md)
- `done` v0.57.1: `--td-field-error-size` + `TdModal` focus ban đầu theo `[autofocus]` (dsuite)
- `done` v0.57.2: câu đếm phân trang bảng cây "Hiển thị 1-3 / 3 nhóm · 6 dòng" + hook `formatPageInfo` (`td-table`) / `formatInfo` (`td-pagination`), `total-rows`, docs hợp đồng trang ở chế độ server (dsuite)
- `done` v0.58.0: floating label — biến thể `label-mode="floating"` của `td-input-field` (port thiết kế dwp `label_mode`) — plan [v0.58.0-floating-label](plans/v0.58.0-floating-label.md)
- `todo` kiểm tay VoiceOver / NVDA: toggle `locked` (0.52) + menu panel (0.53) — owner: phát hành trước, kiểm sau
- Ngày từ v0.33 trở đi: **rebaseline từ ngày v0.31 xong thực tế** (không nén test / acceptance để giữ lịch cũ ~11/11 –
  25/11)
- B (sau B0 ~01/2027): choice-group + number stepper làm sớm ở v0.49.0 (dsuite); rating chỉ đọc + carousel không autoplay làm ở v0.50.0
- `done` v0.59.0: dsuite — `hide-single-page`, `TdModal` message Node / mảng, number `signed`, cảnh báo icon lạ + icon `price`, datetime `clearable` / range `allow-open-end` — plan [v0.59.0-dsuite-small](plans/v0.59.0-dsuite-small.md)
- `done` v0.59.1: `label-position="start"` cho `td-toggle` / `td-checkbox` (dsuite) — plan [v0.59.1-label-position](plans/v0.59.1-label-position.md)
- `done` v0.59.2: vá khoảng cách hàng chip sắp xếp ở dạng thẻ khi `hide-single-page` ẩn thanh trên (135)
- `done` v0.60.0: date picker dạng lịch — thiết kế lại hộp chọn của `td-datetime-picker` tại chỗ (đồng thuận Claude × Codex 2026-10-09) — plan [v0.60.0-calendar-picker](plans/v0.60.0-calendar-picker.md)
- `done` v0.61.0: `td-datetime-range` dùng lịch mới (chọn Từ → Đến trên lưới) + hộp `datetime` hai bước ngày → giờ cho picker và range — plan [v0.61.0-range-calendar](plans/v0.61.0-range-calendar.md)
- `done` v0.62.0: đợt chỉnh giao diện — alert bỏ vạch trái (Hallmark), guard drawer dùng TdModal.confirm, hovercard skeleton, media-picker mở như modal, API màu scroll-top — plan [v0.62.0-polish](plans/v0.62.0-polish.md)
- `done` v0.62.1: vá phím mũi tên trong lịch popover — cú cuộn hiện ô bị việc đặt lại vị trí popover kéo ngược (flake CI `calendar-a11y` WebKit)
- `done` v0.63.0: gõ ngày bằng tay (`editable`) cho `td-datetime-picker` / `td-datetime-range` — yêu cầu 135 — plan [v0.63.0-typed-dates](plans/v0.63.0-typed-dates.md)
- `done` v0.63.1: mặt nạ khi gõ cho `editable` (11122026 → 11/12/2026 ngay lúc gõ) — owner
- `done` v0.63.2: vá `editable` — chuỗi chèn một lần (`fill()`, đọc chính tả) xử lý như dán, không bị chặn
- `done` v0.63.3: vá giao diện `editable` range — hai ô rộng theo chữ, dấu "–" cách đều hai ngày (báo cáo 135)
- `done` v0.64.0: bản minify `dist/` (mirror gốc package, source map) + `module-graph.json` → `modulePreloads` in cả chuỗi + PHP `assets` (`source` mặc định / `dist`) — đề nghị dsuite, plan [v0.64.0-dist](plans/v0.64.0-dist.md), [ADR 0034](decisions/0034-minified-dist.md)
- `done` v0.65.0: adapter PHP mặc định `assets` = `dist` (owner: đã có site dùng kit); thiếu `dist/` → `configure()` báo lỗi ngay
- `done` v0.66.0: bộ sưu tập (album) trong `td-media-picker` (K8, dsuite) — `adapter.collections`, `collectionId`, `initialCollection`, event `collection-change`, Esc = Quay lại trong album; opt-in, giống từng byte 0.65 khi không dùng — plan [v0.66.0-media-collections](plans/v0.66.0-media-collections.md), [ADR 0013 › Bổ sung v0.66](decisions/0013-media-picker-boundary.md#bổ-sung-v066-k8)
- `done` v0.67.0: `td-media-picker` `autoSelectFirst` (opt-in): chọn sẵn ảnh đầu khi mở — owner; plan [v0.67.0-auto-select-first](plans/v0.67.0-auto-select-first.md); ngoại lệ so với QĐ 69 (ADR 0013 § Bổ sung v0.67)
- `done` v0.68.0: `td-media-picker` `autoSelectFirst` **bật mặc định** (owner, 2026-10-12) — chỉ `false` mới tắt; plan [v0.68.0-auto-select-default-on](plans/v0.68.0-auto-select-default-on.md); ADR 0013 § Bổ sung v0.68
- `done` v0.69.0: Button biến thể `plain` (nút chữ không padding, không viền, không gạch chân) cho hành động trong dòng chữ — owner, từ ảnh chụp dsuite; plan [v0.69.0-button-plain](plans/v0.69.0-button-plain.md)
- `done` v0.70.0: `td-tabs` số đếm có màu cạnh nhãn (`count`, `tone`, `setTabCount` cập nhật tại chỗ) — yêu cầu K9 của dsuite; plan [v0.70.0-tabs-counts](plans/v0.70.0-tabs-counts.md); [ADR 0035](decisions/0035-tabs-count-pill.md)
- `done` v0.71.0: `td-media-field` token `--td-media-field-frame-w` (bề rộng riêng của khung ảnh; nhãn / nút / lỗi giữ bề rộng ô) + `td-table` cuộn ngang canh thông báo rỗng theo vùng nhìn thấy (sticky + `100cqi`) + test `td-drawer` bớt flake — yêu cầu K10 / K11 của dsuite; plan [v0.71.0-field-frame-table-empty](plans/v0.71.0-field-frame-table-empty.md)
- `done` v0.72.0: `td-media-picker` `autoSelectFirst` mặc định **theo chế độ** — bật cho picker một ảnh, tắt cho `multiple` (album, gallery); giá trị tường minh vẫn thắng — owner "ko nhé" (2026-10-12); plan [v0.72.0-auto-select-single-only](plans/v0.72.0-auto-select-single-only.md); ADR 0013 § Bổ sung v0.72
- `done` v0.73.0 (M1, chờ Codex impl-review): `td-cropper` kiểu `mode="pan"` — khung cố định, kéo / phóng **ảnh** bên dưới (avatar); `shape="circle"` (chỉ vẽ, chỉ ở pan + 1:1), thanh trượt zoom dùng lại `td-slider`, trần hiển thị 8×, token `--td-cropper-pan-inset`; kiểu `box` không đổi. M2 (hộp thoại / media field / gallery / picker / PHP) làm ở v0.75.0 (dời sang 0.75.0 vì 0.74.0 dành cho picker) — owner, 2026-10-14; plan [v0.73.0-cropper-pan-mode](plans/v0.73.0-cropper-pan-mode.md); [ADR 0036](decisions/0036-cropper-pan-mode.md)
- `done` v0.74.0 (chờ Codex impl-review): `td-media-picker` — hai khu "Album" / "Ảnh" ở cấp ngoài (tiêu đề cùng kiểu + số đếm, đường kẻ), bìa album `contain`, thẻ album kiểu "chồng ảnh một lớp" (phương án B); nhãn `collectionsMore`, `itemsHeading`; không đổi API JS — yêu cầu dsuite, owner duyệt 2026-10-15; plan [v0.74.0-media-picker-album-sections](plans/v0.74.0-media-picker-album-sections.md). Cropper M2 dời sang v0.75.0
- `done` v0.75.0 (M2, chờ Codex impl-review + security-review): cropper `pan` đi qua mọi nơi nhúng — `TdCropper.openDialog({ mode, shape })`, `td-media-field` / `td-media-gallery` `crop-mode` / `crop-shape`, picker `crop.mode` / `crop.shape`, PHP `crop_mode` / `crop_shape`; `parseCropMode` / `parseCropShape` (văn phạm của attribute `td-cropper`), vắng tham số = DOM 0.74.0; không CSS / token / state CSP mới; plan [v0.73.0-cropper-pan-mode](plans/v0.73.0-cropper-pan-mode.md); [ADR 0036](decisions/0036-cropper-pan-mode.md)
- `done` v0.76.0: `td-badge` đổi kiểu mặc định sang tinted (nền ~200 / chữ ~800, tối ~900 / ~200, viền trong suốt, bóng hai lớp) + biến thể kính `--glass` opt-in (PHP `glass`), dự phòng đặc qua `data-td-glass="off"` / reduced-transparency / contrast / forced-colors; bộ sinh theme `ALGORITHM_VERSION` 5; chọn từ preview C + D của owner ([plan](plans/v0.76.0-badge-tinted-glass.md))
- `done` v0.77.0: `td-media-field` xem trước luôn vuông 1:1, ảnh `contain` (mặc định cho cả kit), cạnh = min(`--td-media-field-frame-w`, host, `--td-media-field-max-h`); crop hiện vùng đã cắt trong ô vuông (`span.td-media-field__view`); tắt bằng `preview-shape="ratio"` (PHP `preview_shape`); yêu cầu dsuite, owner duyệt 2026-10-16 ([plan](plans/v0.77.0-media-field-square.md))
- `done` v0.78.0: `TdModal.show({ backdropCloses })` — bấm nền mờ đóng dialog (opt-in, mặc định tắt; bắt đầu + kết thúc trên nền, chỉ dialog trên cùng, qua `busy` / `beforeClose` với `reason: 'backdrop'`) — yêu cầu dwp (port sang td), 2026-10-17; plan [v0.78.0-modal-backdrop-closes](plans/v0.78.0-modal-backdrop-closes.md)
- `done` v0.96.0 (05/11, ADR 0042): `registerExternalOverlay` — `td-modal` / `td-drawer` nhả focus-trap / `inert` cho UI ngoài mở chồng (wp.media); modal / drawer `surface: 'glass'` opt-in; `compat/td-wp-admin.css` ([plan](plans/v0.96.0-modal-wp.md))
- `done` v0.79.0 (yêu cầu dsuite, owner duyệt 2026-10-17): `td-media-field` kiểu placeholder dcms2 — bỏ nút Đổi ảnh / Gỡ, bấm ô để đổi, X đỏ góc khi hover / focus (luôn hiện trên cảm ứng), nút cắt cạnh X khi `croppable`, khung nét đứt + chữ tỉ lệ dưới khung + icon tròn khi trống; kèm K-A5-4: token bo góc khung `--td-media-field-frame-radius` + attribute `hide-label` / `hide-hints` (PHP `hide_label` / `hide_hints`; nhãn vẫn đọc được); DOM `media-field@2`; plan [v0.79.0](plans/v0.79.0-media-field-placeholder.md)
- `done` v0.79.1 (owner 2026-10-18 "làm giống như bên dcms2 đi"): `td-media-field` khung nét đứt cả khi có ảnh, khung rỗng chỉ có icon (chữ gợi ý hiện khi đặt `prompt`); chỉ CSS; plan [v0.79.1](plans/v0.79.1-media-field-dcms2-exact.md)
- `done` v0.79.2 (yêu cầu dsuite K-A5-5): `td-media-field` `hide-alt` (PHP `hide_alt`) — ẩn ô alt của `usage`, vẫn gửi `name[alt]`; chỉ CSS; plan [v0.79.2](plans/v0.79.2-media-field-hide-alt.md)
- `done` v0.80.0: `td-choice-group` đang chọn nổi bật (tint + vòng accent + tick góc, opt-out `--td-choice-mark`); floating label của `td-input-field` thêm khoảng thở; affix chữ ngắn không bị cắt; chỉ CSS; plan [v0.80.0](plans/v0.80.0-choice-selected-floating-spacing.md)
- `done` v0.81.0 (owner 2026-10-20): `td-media-gallery` lưới gọn kiểu dcms2 — kéo cả ô bằng chuột, X đỏ, ô "+" cuối lưới, công cụ hiện khi hover, mô tả thu gọn, nút Đặt làm ảnh bìa (dsuite K3); marker `media-gallery@2`; plan [v0.81.0](plans/v0.81.0-media-gallery-dcms2-grid.md)
- `done` v0.82.0 (dsuite-40, 2026-10-25): `swatch` cho option `td-dropdown` (menu + trigger) và `td-chip-input` (dòng gợi ý + chip) — chấm 12px, cổng `safeColor` như `td-choice-group`, màu qua `fill` của SVG, `data-swatch` trên `<option>` (JS + PHP); plan [v0.82.0](plans/v0.82.0-option-swatch.md)
- `done` v0.83.0 (dsuite-40, 2026-10-26): `td-tabs` chế độ link — item có `href` → `<nav>` + `<a class="td-tabs__tab">`, `aria-current="page"` (tường minh `active-tab` / `setActiveTab`, hoặc khớp URL; hash opt-in `match-hash`), `tab-click` huỷ được + `syncFromLocation()` cho SPA, nâng cấp `<a>` con; plan [v0.83.0](plans/v0.83.0-tabs-links.md)
- `done` v0.84.0 (dsuite-40, 2026-10-27; plan [v0.84.0](plans/v0.84.0-dropdown-rich.md)): `td-dropdown` dòng giàu thông tin (R1 icon / iconTone / description / status / meta, đo chiều cao thật), nhóm có tiêu đề (R2 `group` + `groups`, `<optgroup>`), tìm theo label + description + keywords + số kết quả (R4), a11y nhóm + aria-describedby (R6) — yêu cầu [research/dsuite-request-dropdown-rich-2026-10-27.md](research/dsuite-request-dropdown-rich-2026-10-27.md)
- `done` v0.85.0: `td-dropdown` `mode="action"` (R3: sự kiện `pick` / `onPick`, không giữ giá trị / không ghi form, `trigger-icon` mặc định `plus`, `trigger-meta`, `keep-open`, live region "Đã chọn …" qua `labels.picked`; [plan](plans/v0.85.0-dropdown-action.md)). Gán `options` khi đang mở giữ chữ tìm + dòng active: mới ở mode action (`_refreshOpen()`), v0.86.0 mở rộng cho mode select
- `done` v0.86.0: `td-dropdown` `load` / `reload()` bất đồng bộ + đang tải / lỗi / Thử lại, gán `options` khi đang mở giữ chữ tìm + dòng active + cuộn ở cả mode select, danh sách > 200 dòng `content-visibility` (2000 option mở < 100 ms, gõ < 50 ms) (R5; [plan](plans/v0.86.0-dropdown-load.md)). P3 làm ở v0.87.0
- `done` v0.87.0: P3 của dsuite — `td-choice-group variant="tiles"` (R7, lưới ô vuông icon trên nhãn dưới), `td-chip-input selection-only` + `create-label` (R8, dòng tạo ghim đáy → event `create` `{ query }`), `td-dropdown renderOption` ([plan](plans/v0.87.0-p3-tiles-chip-create-render-option.md)). Adapter PHP chưa có `tiles`
- `done` v0.89.0: `td-media-picker` trạng thái rỗng mới: căn giữa 2 pane, biến thể lọc (Xoá bộ lọc) / thư viện trống (Tải ảnh lên), nhãn mới + giữ ghi đè `empty`/`emptyHint` ([plan](plans/v0.89.0-media-picker-empty.md))
- `done` v0.90.0 (2026-11-01): resize / tối ưu ảnh ở trình duyệt trước khi upload — `td-dropzone` property `imageResize` + media picker `upload.imageResize` (opt-in, kit không đặt trần): trần byte / điểm ảnh / cạnh, JPEG resize + hạ quality, PNG 8-bit giữ alpha, metadata `keep` / `keep-no-gps` / `copyright` / `none` (byte-level), hàng đợi FIFO một slot, dòng `queued` / `optimizing`, nút "Thử lại", `optimization` cho hook / adapter, hook `processor`; hướng dẫn [image-upload-limits](../guides/image-upload-limits.md); [plan](plans/v0.90.0-image-resize.md); [ADR 0037](decisions/0037-client-image-resize.md)
- `done` v0.91.0 (02/11, ADR 0038): (1) `scroll-lock` tô dải gutter thanh cuộn bằng màu scrim khi overlay mở (dsuite báo, 01/11); (2) `td-rich-text` chèn link bằng `td-modal`: URL + văn bản hiển thị, checkbox mở tab mới theo từng link (`link-target` thành mặc định), checkbox `noreferrer` theo từng link (mặc định tắt); hợp đồng policy client + PHP đổi theo.
- `done` v0.92.0 (02/11, dsuite): `td-tabs layout="equal|fit"` (fit: tab rộng theo chữ, trough ôm sát, tràn đo trên host, token `--td-tabs-tab-px`) + fix helper PHP in `name` lên host (`td_dropdown`, `td_tree_select`, `td_multiselect` element mode).
- `done` v0.93.1 (02/11): ảnh xem trước thả file vào lưới picker = ô vuông kiểu cover (đọc kích thước từ đầu file, một lần giải mã ≤ 320, PNG/WebP có EXIF xoay hoặc không rõ → icon) ([plan](plans/v0.93.1-preview-cover.md))
- `done` v0.94.0 (03/11, yêu cầu dcms2 02–03/11, ADR 0039): registry 75 → 188 icon (+104 Lucide, +9 hình owner tự vẽ `source: "td"`), dữ liệu tìm kiếm VI + EN cho cả 188 icon (tách khỏi registry, nạp lười), `registerIconSearchData`, `<td-icon-picker>` (JS + PHP `td_icon_picker` / `td_icon_value`, nhóm Gợi ý, `icons` giới hạn tập) ([plan](plans/v0.94.0-icons-picker.md))
- `done` v0.96.0 (05/11, lô [v0.96.0-batch.md](plans/v0.96.0-batch.md); yêu cầu dwp K11 / K12, ADR 0044): `<td-page-actions>` (nút phụ tự vào "…" khi chật, nút chính giữ chữ, dưới 480px gom hết, mục menu là bản sao an toàn) + `td-selection-bar` `fold="count"`, nút `primary`, `surface="glass"` ([plan](plans/v0.96.0-action-fold.md)); `setButtonBusy` / `runWithButton` cho `.td-btn` thường (ADR 0043, [plan](plans/v0.96.0-busy-button.md))
- `done` v0.96.1 (yêu cầu dsuite 04/11, plan Codex APPROVE r4): `td-icon-picker` nhãn VI trên ô (`trigger-text="label"`), nhóm + lọc nhóm (`groups`), mục "Không icon" (`none-option`, `none-value`), nạp lười qua `loadSearchData` ([plan](plans/v0.96.0-icon-picker.md))
- `done` v0.96.2 (báo lỗi dwp 05/11): `td-selection-bar fold="count"` thanh hẹp: khay không đè số đếm (chữ số đếm rời màn hình, giữ số; rồi nhãn primary "…")
- `done` v0.96.3 (yêu cầu dsuite 05/11): date range picker làm đẹp: dải liền, chỉ bo đầu/cuối, ô đều có khe, không cắt mép, ngày ngoài tháng nhất quán
- `done` v0.97.0 (owner 05/11, mang từ dwp): `<td-scroll-top progress-target>` vòng tiến độ đọc (dấu tích 3 giây, `reading-progress-complete`, `update()` cho SPA) + `<td-dropdown>` option `font` (xem trước phông, SSR `data-font`, PHP `font`). Ảnh trong option đã có từ v0.95.0. Thiết kế: Codex think-about đồng thuận; plan [v0.97.0](plans/v0.97.0-scroll-progress-dropdown-font.md)
- `done` v0.98.0 (dsuite 07/11): `TdModal.confirm({ initialFocus: 'cancel' | 'confirm' })`, mặc định `cancel`, `typeToConfirm` luôn thắng, chặn phím mở lọt sang nút xác nhận. Plan [v0.98.0](plans/v0.98.0-confirm-initial-focus.md)
- `done` v0.99.0 (dsuite 07/11): `<td-tabs>` khoá từng thẻ (`disabled` / `disabledReason`, `tab-blocked`, token `--td-tabs-fg-disabled`) + khoá cuộn tô dải `scrollbar-gutter: stable` của site (trang ngắn) và hết hai dải chồng nhau (trang dài). Plan [v0.99.0](plans/v0.99.0-tabs-disabled.md)
- `done` v0.102.0 (dcms2 08/11): modal `fullViewport` chuyển động như modal thường (scale 0.95 + fade từ 720px, trượt sheet dưới 720px, reduced motion chỉ fade); option `motion: 'fade'` (`td-modal--fade`) cho từng modal; media picker / cropper không đổi
- `todo` v0.104.0 (owner 08/11): icon helper hỗ trợ cả 2 kiểu outline + filled (`tdIcon` / `<td-icon>` / slot / `td_icon` PHP). Filled = kit TỰ TÔ từ hình Lucide (không dùng FA / Phosphor), chỉ cho icon app đang dùng (15: chart-simple, eye, clock, circle-check, circle-pause, save, corner-right-down, trash, home, flame, calendar-days, phone, phone-off, user-plus, user-minus; 4 cái chưa có cả bản nét: chart-simple, circle-check, calendar-days, phone-off); icon chưa có filled thì rơi về outline. Trang duyệt hình: scratchpad `filled-preview/gen.py` → `index.html` (mask knock-out, không giả định màu nền). OWNER ĐÃ DUYỆT HÌNH 08/11 (không thêm FA). Plan: [v0.104.0-filled-icons](plans/v0.104.0-filled-icons.md).
- `done` v0.103.0 (dcms2 owner 08/11): chuẩn hoá icon, +30 icon chung Lucide 1.70.0 (kit 222); bảng map dsuite / dcms2 trong `docs/internal/plans/v0.103.0-icon-standardization.md`; glyph tô đặc FA giữ ở app. Sau: đề xuất biến thể tô đặc cho kit nếu rẻ (bản riêng)
- `done` v0.101.0 (dcms2 08/11): 4 icon phím bổ trợ `key-command` / `key-control` / `key-shift` / `key-option` (Lucide 1.70.0; alias `command`, `option`, `arrow-big-up`)
- `done` v0.100.0 (08/11, lô dọn việc tồn): dropzone SSR `td_dropzone` (contract `dropzone@1`, nhận file đã chọn trước khi nâng cấp), test "Bây giờ" ngoài min–max (đã đúng sẵn), fixture responsive WebKit macOS 393px, dev deps (wtr 1.0, playwright giữ 1.60 (wtr-playwright 1.0 ghim), esbuild 0.28, tailwind cli 4.3.5, prosemirror patch, audit fix). Plan [v0.100.0](plans/v0.100.0-batch.md)
- `done` v0.95.0 (04/11, lô song song [v0.95.0-batch.md](plans/v0.95.0-batch.md); yêu cầu dcms2 03/11, ADR 0040): `td-check-matrix` `mode="override"` — ô **3 trạng thái** kế thừa → cấp → từ chối (chạm xoay vòng), cờ `inherited`, ô khoá, ô hàng loạt, nút "Đặt lại về kế thừa"; FormData `_v=2`; PHP `td_check_matrix` `mode` + hợp đồng SSR `check-matrix@2` ([plan](plans/v0.95.0-check-matrix.md))
- `done` v0.95.0 (04/11; yêu cầu dsuite 03/11, ADR 0041): `td-media-picker` thả hàng loạt — upload nền (đóng / gỡ picker không huỷ, mở lại cùng adapter + `context` thấy thẻ), dải lỗi từ 2 thẻ ("Thử lại tất cả" / "Gỡ tất cả lỗi"), `exact-reused` → chip "Đã có trong thư viện" + thẻ ghim, trần 100 file / 256 MiB mỗi adapter, pool 3 upload toàn trang, `TdMediaPicker.uploads` / `cancelUploads()`, `UploadQueue.release()` ([plan](plans/v0.95.0-media-picker-bulk.md))
- `done` v0.95.0 (04/11; yêu cầu dwp 03/11, K5 + K8): `<td-selection-bar>` (`group` / `for`, đếm tổng, ×, nút thao tác + danger, "…" khi hẹp, dính đáy + safe-area, `--td-selection-bar-offset`, tự bỏ chọn sau thao tác trừ khi `preventDefault()`) + `td-media-grid` `selection-group` (Shift dải xuyên lưới, Esc) + event `item-remove` ([plan](plans/v0.95.0-selection-bar.md))
- `done` v0.96.0 (05/11, lô [v0.96.0-batch.md](plans/v0.96.0-batch.md)) K10: `td-lightbox` nút bật/tắt `pressed` / `pressedIcon` / `busy`, mờ tới khi lưu xong, `refreshToolbar()` ([plan](plans/v0.96.0-lightbox-toggle.md))
- `done` v0.95.0 (04/11; yêu cầu dwp 03/11, K6 / K7 / K9 + lightbox): `td-dropdown` option `image` (+ PHP `td_dropdown` `image`), `TdModal.setActionDisabled()`, `td-lightbox` `preload: { ahead, behind, allowCrossOrigin }` (huỷ preload cũ, Save-Data) ([plan](plans/v0.95.0-small-kit.md)); `.td-card` thuần CSS + PHP `td_card()` (mặc định không khung, `--surface`, cả card là link) ([plan](plans/v0.95.0-card.md))
- `done` v0.93.0 (02/11): `td-media-picker` thả file thẳng vào lưới picker đang mở (card giữ chỗ ảnh xám + tiến trình, xong thành card thường và được chọn; có bất kỳ `uploadFields` thì mở dialog giữ file, tải khi bấm nút; tối đa 3 file song song trong picker; `UploadQueue` tách khỏi td-dropzone) ([plan](plans/v0.93.0-media-picker-grid-drop.md))
- `done` v0.88.1: `td-color-picker` ẩn popup trong lúc hút màu bằng EyeDropper (dsuite báo popup che ảnh)
- `done` v0.88.0: `td-rich-text` preset comment (ProseMirror vendored, policy JSON + PHP Symfony loader + fixture chung, CI php84-symfony) cho dsuite ([plan](plans/v0.88.0-rich-text.md)). Sau: preset `basic` (list), heading/quote khi có nhu cầu
- `done` v0.96.0: `td-dropdown` / `td-chip-input` đo chiều cao dòng thật (bỏ `OPTION_PX` = 40), `max-height=5` thấy đủ 5 dòng trên cảm ứng
- `done` v0.100.0: v0.61 "Bây giờ" khi hôm nay ngoài min–max (picker + cả hai đầu range) — thêm test 3 engine (`td-v0100-now-out-of-range.engines.browser-test.js`); hành vi đã đúng sẵn (nháp nhận giờ thật, lỗi hiện ngay, "Chọn" bị từ chối, không `change`), không phải sửa component

## Chờ nhu cầu (owner 2026-10-08: chỉ làm khi có site cần)

- Test WebKit `:focus-visible` nút đóng toast (v0.21 P4) hỏng cả trên main; test tương phản scan-input lúc qua lúc hỏng — sửa khi làm đỏ CI
- Kéo thả đổi cha / thứ tự cho bảng cây (`reorderable`, event `move`, `rowDraggable` — tên đã giữ chỗ trong plan v0.57.0); hiện dùng `moveRow` từ nút / menu
- RTL — phím ← ở hai đầu `td-choice-group` quay vòng ngược chiều radio native (có từ v0.49); chưa site nào viết từ phải sang trái
- Nhãn nổi cho `td-number-input` / `td-dropdown` / control khác (v0.58.0 chỉ `td-input-field`); kiểm tay VoiceOver / NVDA nhãn nổi
- dsuite 2026-10-08 (owner không làm): chuyển `data-*` của toggle xuống input trong (host là control); `td-dropdown` `locked`; component gập / mở (dùng `<details>` gốc); `choice-group` chỉ đọc; thanh hành động nổi kiểu kính (`aehh-mobile-nav`)
- Toggle có `on-text` + nhãn dài xuống dòng: công tắc không căn giữa khối chữ (có sẵn, phát hiện ở v0.59.1); bố cục "nhãn sát trái — công tắc sát phải cả hàng" là việc của site
- Đổi theme lúc chạy (`TdTheme.apply`, theming R3) — light / dark / auto + bộ sinh màu + theme theo vùng đã xong ở v0.41 / v0.42
- component dwp/135 chưa quyết; Trusted Types; khúc xạ SVG; Storybook 9+ (wtr 1.0 xong v0.100.0) (xem mục Later bên dưới)

## Done — v0.4.1 bugfix (2026-09-27, xem CHANGELOG)

- `done` **B1** toast: vòng lặp FIFO vô hạn (`td-toast.js:204`: `_removeToast` chỉ xoá khỏi `_activeToasts` sau 180ms nên `while` không bao giờ thoát)
- `done` **B2** modal: guard liveness cho rAF (modal đã đóng trước frame) + rò rỉ focus-trap
- `done` **B3** modal-stack: scroll lock khôi phục trạng thái trước đó, không ghi đè `body.style.overflow = ''`
- `done` **B4** input-field: `setError('')` khôi phục helper text; viền lỗi không mất khi focus/blur
- `done` **B5** dropdown: placement không đè lên trigger, cap `max-height`, huỷ timer focus ô search, trả focus khi đóng, đóng khi trigger bị ẩn
- `done` **B6** toast: `role=status` (trừ error giữ assertive/alert)
- `done` **B7** storybook build hỏng do top-level `await` ở `td-toast.js:41`

## Done — v0.5.0 foundation ([ADR 0008](decisions/0008-drop-tailwind-token-css.md))

- `done` Token `--td-*` (khởi đầu từ `td-tokens.css` của 135 + [glass tokens](design/glass-tokens.css))
- `done` `glass.css` theo [liquid-glass.md](design/liquid-glass.md), fallback trên `.td-glass-surface`
- `done` Layer prelude `@layer td.tokens, td.component, td.utilities`
- `done` Build `td.css` (script node concat theo manifest) + CI rebuild-and-diff
- `done` CSP harness dual-profile (legacy Tailwind + token-native) + gate nonce-only (Chromium/Firefox/WebKit)
- `done` Fixture tham chiếu glass Regular & Clear
- `done` Scroll-lock overlay dùng chung (ref-count) — `src/utils/scroll-lock.js`, ship trong 0.4.1
- `done` Fixture markup contract (golden HTML): bắt đầu với td-lightbox
- `done` Bảng mapping class cũ → mới

## Done — td-lightbox pilot (v0.6.0) ([ADR 0009](decisions/0009-td-lightbox-hooks.md))

- `done` `td-lightbox` token-native đầu tiên (v0.6.0). Chạy thật trên 135 → mục External
- `done` Icon registry (ADR 0010) + `<td-icon>`
- `done` Fixture markup contract đầu tiên: `test/contracts/lightbox.html`

## Now — migrate component cũ theo batch (mỗi component: token CSS + BEM + a11y + icon registry)

Mỗi batch làm luôn a11y và error-contract trong cùng slice. Error contract ở `TdFormElement`:
`setError` + `aria-invalid` + `aria-errormessage`.

- `done` Batch 1: button, checkbox, toggle, loading (v0.7.0; + error contract, `TdCheckableElement`, spinner)
- `done` Batch 2: input-field, slider, pagination, tabs (+ ARIA, bàn phím), empty-state (v0.8.0)
- `done` Batch 3 (lớp nổi): tooltip, toast, dropdown (combobox APG), modal / modal-stack + `layers.js` (một bộ điều phối Escape/Tab, inert lease có floating) (v0.9.0)
- `done` Batch 4: datetime-picker (combobox + dialog, wheel listbox, `min`/`max`), table (in-place, sort APG, sticky header, `cellPaddingClass`) (v0.10.0) — mọi component đã token-native; `adopt-styles` đã xoá

## Later — component mới (token-native)

- `done` `TdMenu` (từ dwp `menu.js` / `ui-menu-button.js`, APG menu button) (v0.12.0)
- `done` `td-chip-input` (từ `dcms-chip-search-field.js`, combobox APG + search provider có abort) (v0.12.0)
- `done` `TdFormValidation` (từ `dcms-form-validation.js`; constraint gốc + `rules` + lỗi server) (v0.12.0)
- `done` Release cuối của đợt migrate: bỏ peer Tailwind (v0.11.0; `td-sample` token-native, Storybook/demo không Tailwind, guard test)

## Done — v0.15.0 lightbox đủ logic dwp

- `done` `setPanel/refreshPanel/addToolbarButton` khi đang mở, `itemEl/groupEl`, `bind` `attrPrefix`+`filter`, sửa vuốt sheet

## Done — v0.14.4 wheel band + demo lightbox

- `done` Dải chọn của bánh xe datetime-picker có đủ viền 4 phía (tông nhạt); demo có mục Lightbox

## Done — v0.14.3 nút sáng hơn

- `done` Secondary trắng + viền rõ (sửa lỗi specificity khiến nó xám), nút màu tươi hơn, bóng nhẹ hơn, disabled xám mờ rõ

## Done — v0.14.2 viền hover nhạt

- `done` Viền khi hover (input, dropdown, toggle, checkbox) và viền option đang chọn trong dropdown dùng `--td-control-border-hover`

## Done — v0.14.1 viền nhạt

- `done` Viền input / dropdown / toggle / checkbox nhạt lúc nghỉ (`--td-control-border-soft`), đậm khi hover

## Done — v0.14.0 Liquid Glass thật

- `done` Viết lại luật Liquid Glass (v2, Codex think-about), token mới, button kính, checkbox tròn, toast tint màu,
  tooltip kiểu dwp có mũi tên, menu đăng ký option (`define/register/bindAll`), `TdHovercard`, gate tương phản render thật
- `done` Hardening sau security review: `TdHovercard.sanitize` + `TrustedHTML`, fetch giới hạn (LRU 50, 256 KB, 10 s,
  `no-store`, huỷ khi đóng), `clearCache()` bắt buộc khi đổi phiên đăng nhập

## Done — v0.25.0 SSR hydrate (bước 1)

- `done` ADR 0012; base hydrate; `td-button` / link element mode; lưới CSS `:not(:defined)`; `Td::modulePreloads`; `td_badge`
  icon
- `done` v0.26.0 input-field / toggle / checkbox (form-associated) + dropdown shell + `td_empty` / empty-state
- `done` datetime (`td_datetime_picker` / `td_datetime_range`) · `done` v0.100.0 dropzone SSR (`td_dropzone`, `dropzone@1`)

## Done — v0.24.0 lightbox điều hướng hai bên

- `done` Vùng bấm hai bên (15%), tải sẵn ảnh kề, màn lỗi ảnh, filmstrip tuỳ chọn, trượt khi chuyển

## Done — v0.23.0 lưới ảnh chọn được

- `done` `<td-media-grid>`: nâng cấp markup site, tick, chế độ chọn, Shift dải, Space / Enter / Esc, `select-change` /
  `activate` (đề xuất 135)

## Done — v0.22.1 modal mượt hơn

- `done` Chuyển động modal theo dcms, khoá cuộn giữ chỗ thanh cuộn (hết nhảy trang)

## Done — v0.22.0 dropdown "Thêm mới"

- `done` `create-label` + sự kiện `create { query }` + PHP `create_label` (đề xuất 135)

## Done — v0.21.1 sửa lỗi kết hợp component

- `done` Popup theo vòng đời + lớp của trigger (cuộn khuất trong khung, ẩn, gỡ, bị modal sau phủ, hovercard → menu con,
  hiệu ứng vào của modal), lightbox mở từ modal nằm trên, chuyển Escape đúng popup

## Done — v0.21.0 pastel + toast dcms + modal animation

- `done` Pastel cho nút ngữ nghĩa / toast / badge, primary + tooltip đen, shadow hai lớp, toast kiểu dcms, modal
  ease-in-out, wheel datetime cuộn khi mở, tooltip căn chữ, viền focus ô nhập nhạt

## Done — v0.20.0 Minimal surfaces

- `done` Bỏ Liquid Glass giả bằng CSS: nút / modal / tooltip đặc, popup nhỏ 94% + blur 12px, một shadow mềm; token kính
  cũ deprecated (alias `-tint` → `-bg`), ADR 0011

## Done — v0.19.0 đề xuất đợt 3 từ 135

- `done` td-button chuyển ARIA trạng thái xuống, dropzone lý do lỗi + trạng thái chờ + `accept-label`, token font badge
  (stamp mono), datetime-picker `setDBValue('')` xoá + mặc định mở tại hôm nay

## Done — v0.18.0 đề xuất đợt 2 từ 135

- `done` td-button submitter name/value, input month/datetime-local/time, datetime-picker mode + open-at, progress,
  dropzone, alert, badge/stamp, alias icon JS/PHP, td_link bare, searchable chuỗi, PHP ≥ 8.0 + CI php80

## Done — v0.17.0 đề xuất từ tích hợp 135

- `done` Adapter PHP chính thức, input-field autocomplete…, ghost/link button, dropdown nâng cấp `<select>`, menu/lightbox
  tải nhiều biến thể, password meter, scroll-top, 7 icon CMS, docs drift

## Done — v0.16.0 sửa backlog phát hiện khi viết docs

- `done` A1–A7 (property gán sớm, input-field value/pattern/minlength, messages, checkable restore, slider, biến CSS của site),
  B1–B8 (dropdown, tabs/table try/catch, labels pagination/empty-state), C1–C5 (toast close/clear + labels, loading,
  modal labels + confirm, form-validation reset), D1–D5 (datetime, `--td-accent-fill`, z-index, đóng gói, token `:root`)
- `todo` (owner hoãn) Trusted Types cho toàn kit — component render bằng chuỗi innerHTML

## Later — backlog

- `done` (bỏ, owner 05/11: trái minimal surfaces ADR 0011) Khúc xạ SVG (Chromium-only, opt-in thử nghiệm)
- `done` (Codex think-about 05/11, đồng thuận) Component còn lại từ dwp/135: select-enhance, style `<select>` gốc, reading-progress scroll-top, share → **giữ ở site**; cup-loader → **bỏ** (nhận diện AETV); skeleton / password meter / scroll-top → **kit đã có** (dwp tự chuyển khi sửa template). Duy nhất đáng mang: **avatar CSS-only** (`.td-avatar`, `--empty`, token `--td-avatar-size/-bg/-ring`), `todo` v0.105.0 OWNER OK 08/11 (plan [v0.104.0-filled-icons](plans/v0.104.0-filled-icons.md) §v0.105.0): báo 135 + dwp chuyển cùng bản (135 đang tự định nghĩa `.td-avatar` trong base.css → trùng tên)

- `done` textarea `autoresize` bằng CSS `field-sizing` (v0.13.0)
- `todo` (owner 05/11: chưa làm, chờ site xin) input-field: floating label (additive) — cần user duyệt giao diện

- `done` (huỷ) K4 dwp: subset `td.css`: owner 05/11 không làm; dwp tự build từ `src/styles/` + `manifest.json`, kit giữ hợp đồng nguồn CSS ([conventions](conventions.md#release))
- `todo` Dev deps: nâng `@web/test-runner` 1.x (bỏ `extract-zip` qua puppeteer) và Storybook 9 (bỏ `uuid` cũ) — breaking, chỉ ảnh hưởng tooling

- dark theme: tinh chỉnh giá trị (hiện chỉ tính toán, chưa render thử)
- `done` toggle `commit()` / trạng thái pending (optimistic) (v0.13.0)
- `done` button `run(asyncFn)` (v0.13.0)
- `done` story cho datetime-picker (v0.10.0)
- `done` `demo.html`: section `<form>` thật (v0.13.0)
- `done` GitHub CI — `.github/workflows/test.yml` (v0.13.0; **chưa chạy thử trên GitHub** vì chưa push)
- InputField helper `getById`
- table: kéo thả sắp xếp hàng
- datetime: picker dạng lưới lịch
- module `td-refract` tuỳ chọn (chỉ Chromium, opt-in)
- preset Tailwind tuỳ chọn, chỉ khi có site Tailwind yêu cầu

## External (repo khác)

- s3 dashboard: re-vendor bản CSP-hardened (xem [history](history/README.md#v03--csp-strict-2026-06-10))
- dwp: migrate sang td **sau v1.0** (token + button trước, `dwp-admin-compat.css`, adapter lightbox)
- 135: adapter PHP (`td_ui_*`) xuất BEM của td
- 135: sửa token: glass bg alpha 0.72/0.86 (đúng theo comment của chính nó), override `--td-glass-solid: var(--c-paper-2)` (không cần `data-td-theme="light"` nữa: dark của td chỉ bật khi site tự đặt `data-td-theme="dark"`)
- 135: thay `public/assets/js/ui/lightbox.js` + `td-lightbox.css` bằng `td.css` + `TdLightbox.bind()` (markup `data-td-lightbox*`, xem `test/contracts/lightbox.html`); icon qua `icons.json`

## Không làm

- `td-breadcrumb`
- dcms: notification, action-buttons, post-*, richtext, draft-preview, banner, color-picker (port module dcms2). *Media
  picker không còn ở đây*: `td-media-picker` là bản viết sạch theo hợp đồng adapter, không port dcms2 — xem
  [ADR 0013](decisions/0013-media-picker-boundary.md) (ADR 0007 giữ nguyên: dcms2 độc lập, shim nếu cần nằm ở dcms2)
- Bundle Plyr (chỉ adapter)
- Copy token CSS của dwp

## Done

Xem [CHANGELOG.md](../../CHANGELOG.md) và [nhật ký chạy qua đêm](history/2026-09-27-overnight.md). Gần nhất: v0.13.0.
