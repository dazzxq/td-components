# History

Tóm tắt từng milestone. Chi tiết thay đổi: [CHANGELOG.md](../../CHANGELOG.md). Kế hoạch gốc (GSD `.planning/`)
đã bỏ ngày 2026-09-27; xem lại bằng `git log -- .planning` nếu cần.

## v0.1 — Port DCMS (2026-03-31 → 2026-04-04, phase 1–5)

1. **Foundation**: `TdBaseElement` (lifecycle, cleanup tự động, sync attribute/property, `emit`, `escapeHtml`),
   subpath export, Storybook 8.6 (story bằng chuỗi HTML), test `node --test` + DOM shim.
2. **Form controls**: toggle, button, checkbox, input-field, slider, dropdown (portal ra body, ports các `[Fix #N]`
   của dcms), `TdDateTime`.
3. **Feedback & overlay**: modal + modal-stack (z-index, focus trap, Promise API), toast (queue so le), loading, tooltip (singleton).
4. **Display**: table (sort, phân trang, skeleton), tabs, pagination, empty-state; story cho mọi component.
5. **Tailwind v3 → v4**: đổi class bị đổi tên (`shadow-sm→shadow-xs`, `rounded→rounded-sm`, `border` kèm màu),
   xoá config v3, peer `tailwindcss >= 4`, README hướng dẫn `@source`.

Quick task 2026-04-04: sửa 12 lỗi UI từ feedback (animation toggle, con trỏ disabled, mũi tên tooltip, spam toast,
dấu tiếng Việt "mục", indicator tabs…); bỏ `TdModal.loading()`.

## v0.2 — Universal forms (2026-06-09)

Mọi form control thành form-associated custom element qua `ElementInternals` (`TdFormElement`,
[ADR 0003](../decisions/0003-elementinternals-form-association.md)). Mô hình XSS theo ngữ cảnh (`css-safe.js`),
đóng lỗ `color` → CSS injection, escape message toast. Breaking: toggle mặc định uncontrolled
([ADR 0004](../decisions/0004-toggle-uncontrolled-default.md)), input bên trong không còn `name`.
Kế hoạch gốc từng định giảm Tailwind thành optional; thực tế vẫn giữ peer bắt buộc.

## v0.3 — CSP strict (2026-06-10)

Động lực: dashboard s3 chạy `default-src 'self'`. Gỡ toàn bộ `style="…"` và `<style>` chèn bằng JS; style qua CSSOM +
constructable stylesheet ([ADR 0005](../decisions/0005-csp-strict-cssom-adopted-sheets.md)). Gate `test:csp`
không rỗng: fixture Tailwind pin version + sentinel, parity computed style 70 state, animation liveness.
Việc còn lại ở repo s3: re-vendor bản hardened, audit raw-HTML hatch. v0.3.1: `td-button type=submit|reset`.

## v0.4 — dcms ports + a11y (2026-06-10)

Từ [báo cáo so sánh dcms](dcms-comparison.md): modal settled-flag (hết treo Promise `confirm()`), dropdown
`searchable`/`allow-clear` tắt được, input `type=date`, toggle `role=switch`, `dom-utils`. Modal không đóng khi click
backdrop ([ADR 0006](../decisions/0006-modal-no-backdrop-close.md)).

## 2026-09 — Sync dcms/dwp + quyết định token CSS

Quét dcms2 và dwp để tìm fix đáng port: [2026-09-sync-dcms-dwp.md](2026-09-sync-dcms-dwp.md). Kết quả thành
v0.4.1 (bugfix) và hướng v0.5 ([ADR 0008](../decisions/0008-drop-tailwind-token-css.md),
[ADR 0009](../decisions/0009-td-lightbox-hooks.md)). Bỏ GSD, chuyển tài liệu sang `docs/`.
