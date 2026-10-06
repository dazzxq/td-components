# ADR 0023 — Nhóm radio không có form owner bên trong host form-associated

Trạng thái: chấp nhận (2026-10-06). Nguồn: plan [v0.49.0-choice-stepper](../plans/v0.49.0-choice-stepper.md) QĐ 4 +
spike M0 `test/engines/radio-unowned-group.spec.mjs` (Chromium / Firefox / WebKit, bàn phím thật qua Playwright).

## Bối cảnh

`<td-choice-group>` (v0.49) là "chọn một trong N". Host là phần tử form-associated (ADR 0003): **host** sở hữu giá trị
(`setFormValue`), validity, reset. Bên trong cần N control chọn được. Hai cách:

1. `<input type="radio">` native: Tab một điểm dừng, mũi tên đi + chọn, bỏ qua `disabled`, "n trên N" của trình đọc màn
   hình — **của trình duyệt**; markup không-JS (PHP) trùng markup sau hydrate. Nhưng radio có `name` + nằm trong `<form>`
   sẽ **tự vào FormData** (hai nguồn sự thật cạnh giá trị của host) và bị `form.reset()` đụng tới.
2. Radio không `name` / `role="radio"` tự viết: roving tabindex + mũi tên APG + `aria-setsize` / `aria-posinset` bằng JS.

## Quyết định

**Cách 1, với nhóm riêng không có form owner.** Sau hydrate mỗi radio mang:

- `name="td-choice-{uid}"` riêng của instance (nhóm native vẫn còn → bàn phím + nhóm của trình duyệt),
- `form=""` — thuộc tính `form` có mặt nhưng không trỏ tới id nào ⇒ theo spec **không có form owner**,
- `autocomplete="off"` — trình duyệt không khôi phục trạng thái checked khi back / forward (host tự khôi phục qua
  `formStateRestoreCallback`).

Hệ quả đã đo (spike M0, cả ba engine — 61 kiểm tra):

| Mục | Kết quả |
|---|---|
| (a) Tab một điểm dừng vào radio đang chọn; nhóm chưa chọn: Tab → radio đầu; mũi tên đi + chọn; bỏ qua `disabled`; Space chọn | ✓ cả ba (WebKit macOS: Tab chỉ qua ô chữ theo mặc định của Safari, Option+Tab tới mọi control — giống hệt nhóm radio có form) |
| Vòng lại ở hai đầu | Chromium / Firefox vòng; **WebKit không vòng — kể cả nhóm radio có form bình thường** (hành vi engine, không do `form=""`) ⇒ component tự vòng trong JS **chỉ ở hai đầu** (giữ nhóm native cho phần còn lại) |
| Shift+Tab vào nhóm chưa chọn | Chromium / Firefox → radio **đầu**; WebKit → radio cuối. Giữ hành vi native (APG gợi ý "cuối"; không viết lại roving chỉ vì chi tiết này) |
| (b) Không có trong `FormData`, không trong `form.elements`, `radio.form === null`; giá trị của host có | ✓ |
| (c) `<fieldset disabled>` tổ tiên khoá radio (fieldset áp theo cây, không theo form owner) | ✓ |
| (d) `form.reset()` không đụng radio (host `formResetCallback` lo) | ✓ |
| (e) Đổi `name` / thêm `form=""` tại chỗ trên radio đang checked + đang focus: giữ checked + focus, rời FormData, mũi tên chạy | ✓ |
| (f) Back / forward: radio không bao giờ lệch với trạng thái script của trang | ✓ (Playwright tải lại trang, không bfcache: radio về mặc định, không khôi phục lệch) |
| (g) `posinset` / `setsize` trong cây trợ năng | CDP `Accessibility.getFullAXTree` của Chromium **không** xuất hai thuộc tính này (kể cả nhóm có form hay `aria-setsize` tường minh) ⇒ không đo được bằng CDP. Radio của nhóm riêng có cùng bộ thuộc tính AX với nhóm có form (role radio, checked, focusable, tên từ label); nhóm được chứng minh bằng hành vi mũi tên (a) / (e) — cùng phạm vi nhóm radio mà trình duyệt dùng cho posinset / setsize |

Phương án dự phòng (roving tabindex + `aria-setsize` / `aria-posinset` bằng JS) **không** cần.

## Hệ quả

- Không-JS (PHP `td_choice_group`): radio có `name` thật + `required` ⇒ form chạy, bàn phím native. Hydrate: ElementInternals
  trước, rồi trên **cùng node** đổi `name` → nhóm riêng + `form=""` + `autocomplete="off"`, gỡ `required` (validity của host
  + `aria-required` trên `role="radiogroup"`).
- `required` mà mọi option `disabled` → hợp lệ (radio `disabled` bị loại khỏi constraint validation — khớp native).
- Thuộc tính `form` là tên **không** nằm trong allowlist SSR của control (`SSR_CONTROL_ATTRS`): component tự đặt nó sau khi
  nhận markup, markup server có `form` → không nhận (render an toàn).
- Kiểm hồi quy: `npm run test:engines` chạy spike này mỗi lần.
