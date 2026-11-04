# ADR 0043 — Busy helper: một hàm trạng thái dùng chung, không `disabled` gốc

Trạng thái: **chấp nhận** — 2026-11-04 (v0.96.0). Plan [v0.96.0-busy-button](../plans/v0.96.0-busy-button.md).
Liên quan: [Button](../../components/button.md#nút-td-btn-thường-setbuttonbusy--runwithbutton-0960),
[security-model §6t](../security-model.md).

## Bối cảnh

Chỉ `<td-button>` có trạng thái bận (`loading`, `run()`). Nút in bằng PHP `td_button()` / `td_link()` hoặc viết tay
(`button.td-btn`, `a.td-btn`) thì site tự chế: thường đặt `disabled` gốc (mất focus, nút gửi mất `name=value` trong
`FormData`) hoặc quên chặn Enter / implicit submission. Thêm nữa, kiểu bận cũ ẩn nhãn bằng `visibility: hidden` nên nút bận
**mất tên truy cập** với trình đọc màn hình.

## Quyết định

1. **Đúng hai hàm công khai** `setButtonBusy(target, busy)` và `runWithButton(target, fn)` (subpath
   `@dazzxq/td-components/button-busy` + barrel). `target` ∈ {`button.td-btn`, `a.td-btn`, host `<td-button>` /
   `<td-action-button>`}; control bên trong host quy về host; kiểu khác → `TypeError`.
2. **Bận = `aria-busy="true"` + `aria-disabled="true"`, không bao giờ `disabled` gốc**: giữ focus, giữ thứ tự Tab, nút gửi
   vẫn là submitter (`new FormData(form, submitter)` có `name=value`).
3. **Link**: `tabindex` đặt **trước** khi bỏ `href`, `role="link"`; hết bận trả `href` **trước** khi gỡ `tabindex`. Ảnh chụp
   attribute của site trong `WeakMap`, trả lại nguyên văn.
4. **Một listener `click` capture mỗi document** (`WeakSet<Document>`), cài lười ở lần vào bận đầu tiên (cả đường
   `<td-button loading>`), không bao giờ gỡ; tìm nút bận trên `composedPath()` nên click vào icon / SVG con, Enter / Space và
   implicit submission đều bị nuốt. Listener per-control cũ của `td-button` cho `loading` bỏ đi.
5. **Spinner** dùng `.td-btn__spinner` sẵn có; markup viết tay thiếu thì tạo **một lần** bằng `createElement` /
   `createElementNS` (chữ trần được gói vào `.td-btn__label`).
6. **Nhãn / icon mờ bằng `opacity: 0`** thay `visibility: hidden` (luật `.td-btn[aria-busy="true"] > :not(.td-btn__spinner)`):
   giữ bố cục, giữ tên truy cập.
7. **`runWithButton`**: bận trước khi `fn` chạy (sau một microtask), promise đang bay trong `WeakMap` (gọi lại → cùng
   promise), `finally` luôn gỡ; host có `run()` thì chuyển cho nó.
8. **Một nguồn sự thật**: hàm nội bộ `syncButtonState()` dùng chung cho hai hàm trên **và** `td-button._syncState()`.

## Hệ quả

- Nút bận nhìn giống trước (spinner giữa nút, bố cục giữ) nhưng nhãn còn trong cây truy cập; baseline CSP của
  `td-button.loading` đổi (`opacity` / `visibility`).
- Guard document chỉ có từ lần bận đầu của document; listener capture trên `window` (hoặc đăng ký trước trên `document`) vẫn
  chạy trước; `form.submit()` / `requestSubmit()` bằng code không qua nút — ghi trong docs.
- Bận không thay idempotency phía server (nhiều tab, retry mạng, bfcache).
- Toolbar lightbox **phản chiếu** hợp đồng bận này trên `.td-lightbox__btn` (không spinner), không gọi helper.

Phương án bác: (1) bắt buộc `<td-button>` (site PHP / markup viết tay không đổi được); (2) attribute khai báo
`data-td-busy-on` + quét trang tự gắn bận cho submit (ma thuật ngầm, sai với form trả file / `target="_blank"`, phải quét lại
khi DOM đổi); (3) `disabled` gốc (mất focus và `name=value`); (4) live region mỗi nút (thông báo kết quả là việc của site);
(5) option PHP (bận là trạng thái lúc chạy, không phải lúc in). Spinner `::after` không cần markup là mục roadmap riêng.
