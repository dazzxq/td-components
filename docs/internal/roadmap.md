# Roadmap

Roadmap sống. Mỗi item một dòng, kèm trạng thái: `todo` · `doing` · `done` · `blocked`.
Khi xong: đánh `done`, ghi vào [CHANGELOG.md](../../CHANGELOG.md), rồi xoá dòng ở lần release sau.
Nguồn gốc các item B/a11y: [history/2026-09-sync-dcms-dwp.md](history/2026-09-sync-dcms-dwp.md).

## Đang làm — lộ trình dsuite (yêu cầu dienthoaihay, chốt với Codex 2026-10-03)

- `done` v0.27.0: `td-otp-input`, `td-drawer`, `td-copy`, CSS skeleton
- `done` v0.28.0 ~14/10 (A0 tới 20/10): `td-chip-input` chọn nhiều (closed-set, `<select multiple>`, chọn tất cả đang hiện, `td_multiselect`) — xong P0
- `todo` v0.29.0: `td-tree` + `td-tree-select`
- `todo` v0.30.0 ~28/10: `td-number-input` + `td-repeater` (đặt `OrderedCollectionModel`) — đảo theo lịch dsuite (A2.3 cần ~26/10)
- `todo` v0.31.0 ~04/11: `td-sortable` (dùng lại OrderedCollectionModel) + `td-masked-value` (A1 cần từ 12/11)
- `todo` v0.32.0 ~11/11: `td-cropper` (toạ độ) + `td-scan-input` (A3 từ 26/11)
- `todo` v0.33.0 ~18/11: table chọn dòng + hook lọc ngoài + ẩn / hiện cột, `td-filter-chips`
- `todo` v0.34.0 ~25/11: datetime `range` + preset — xong P1
- `todo` v0.35–v0.38: typeToConfirm, `trackFormDirty`, `td-steps`, `td-timeline`, `td-diff`, `td-check-matrix`, `td-color-picker`
- `todo` B (sau B0 ~01/2027): choice-group, number stepper, rating chỉ đọc, carousel không autoplay

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
- dcms: notification, action-buttons, media-picker, post-*, richtext, draft-preview, banner, color-picker
- Bundle Plyr (chỉ adapter)
- Copy token CSS của dwp

## Done

Xem [CHANGELOG.md](../../CHANGELOG.md) và [nhật ký chạy qua đêm](history/2026-09-27-overnight.md). Gần nhất: v0.13.0.
