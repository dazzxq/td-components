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
- `todo` v0.50: rating + carousel — plan [v0.50.0-rating-carousel](plans/v0.50.0-rating-carousel.md)
- Ngày từ v0.33 trở đi: **rebaseline từ ngày v0.31 xong thực tế** (không nén test / acceptance để giữ lịch cũ ~11/11 –
  25/11)
- B (sau B0 ~01/2027): choice-group + number stepper làm sớm ở v0.49.0 (dsuite); rating chỉ đọc + carousel không autoplay → v0.50.0

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
- `todo` datetime, dropzone (ADR 0012 bước sau)

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

- `todo` Khúc xạ SVG (Chromium-only, opt-in thử nghiệm) — WebKit bug 245510
- `todo` Component còn lại từ dwp/135 chưa quyết: password meter, scroll-top, select-enhance, skeleton dùng chung, style `<select>` gốc, cup-loader

- `done` textarea `autoresize` bằng CSS `field-sizing` (v0.13.0)
- `todo` input-field: floating label (additive) — cần user duyệt giao diện

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
