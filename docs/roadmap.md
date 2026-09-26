# Roadmap

Roadmap sống. Mỗi item một dòng, kèm trạng thái: `todo` · `doing` · `done` · `blocked`.
Khi xong: đánh `done`, ghi vào [CHANGELOG.md](../CHANGELOG.md), rồi xoá dòng ở lần release sau.
Nguồn gốc các item B/a11y: [history/2026-09-sync-dcms-dwp.md](history/2026-09-sync-dcms-dwp.md).

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
- `todo` Batch 2: input-field, slider, pagination, tabs (+ ARIA tablist/tab, bàn phím), empty-state
- `todo` Batch 3: tooltip (+ focus, role, `aria-describedby`), toast, dropdown (+ Home/End/Tab, `aria-activedescendant`), modal (+ `role=dialog`, `aria-modal`, `aria-labelledby`, trả focus, `onShow`, footer async) / modal-stack
- `todo` Batch 4: datetime-picker, table (+ sticky header, `cellPaddingClass`)

## Later — component mới (token-native)

- `todo` `td-menu` (từ dwp `menu.js`)
- `todo` `td-chip-input` (từ `dcms-chip-search-field.js`)
- `todo` `FormValidation` (từ `dcms-form-validation.js`, sau error contract)
- `todo` Release cuối của đợt migrate: bỏ peer Tailwind

## Later — backlog

- `todo` Dev deps: nâng `@web/test-runner` 1.x (bỏ `extract-zip` qua puppeteer) và Storybook 9 (bỏ `uuid` cũ) — breaking, chỉ ảnh hưởng tooling

- dark theme: tinh chỉnh giá trị (hiện chỉ tính toán, chưa render thử)
- toggle `commit()` / trạng thái pending (optimistic)
- button `run(asyncFn)`
- story cho datetime-picker
- `demo.html`: thêm section `<form>` thật
- GitHub CI
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

Xem [CHANGELOG.md](../CHANGELOG.md). Gần nhất: v0.4.0 (dcms ports + a11y + modal không đóng khi click backdrop).
