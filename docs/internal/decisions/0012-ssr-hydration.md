# ADR 0012 — SSR contract + hydrate tại chỗ (hết "flash" lúc tải)

Trạng thái: chấp nhận (2026-10-03). Nguồn: đề xuất site 135 (owner yêu cầu sửa ở gốc kit); Codex think-about
(gpt-5.6-sol + high, 2 vòng, CONSENSUS; nguồn WHATWG HTML custom elements / forms / input / modulepreload, CSS
`:defined`, DOM replace-all, web.dev CLS).

## Bối cảnh

`TdBaseElement._doRender()` gán `innerHTML = render()` khi nâng cấp → trang PHP in `<td-button>Nhãn</td-button>` hiện chữ
trần tới khi module JS tải xong rồi nhảy thành nút (flash + layout shift). `td_alert()` không bị vì PHP in sẵn markup đã
style và JS nâng cấp tại chỗ.

## Quyết định

1. **SSR là lớp đúng đắn (bắt buộc):** helper PHP in host + **cấu trúc / BEM chuẩn** mà JS sẽ dùng, kèm dấu
   `data-td-ssr="<component>@<schema>"` (ví dụ `button@1`; phiên bản **cấu trúc của component**, không phải phiên bản
   gói — chỉ tăng khi giả định hydrate đổi). Thuộc tính chỉ dành cho chế độ không-JS được ghi rõ trong contract.
2. **Base lifecycle:** `TdBaseElement` có hook `canHydrate()` / `hydrateExisting()`. Lần kết nối đầu: dấu khớp + cấu trúc
   hợp lệ → **nhận markup tại chỗ** (không thay con), rồi bước gắn chung (listener, đồng bộ state) + `_applyStyles()`; nếu
   không → `render()` như cũ. Gắn lại (di chuyển node) → gắn lại listener, không render lại. Constructor không đọc con.
3. **Thứ tự ưu tiên state:** property gán sớm > state sống của control native (value / checked / selection / files) >
   attribute (làm giá trị mặc định / reset). Hydrate không phát `input` / `change`. Giữ đúng node đang focus.
4. **Form-associated (v0.26):** khởi tạo `ElementInternals` rồi mới gỡ `name` + ràng buộc trùng của control trong (FormData
   đúng một mục); reset về mặc định đã chụp; label ngoài trỏ control native được chuyển sang host. File input không bao
   giờ bị dựng lại.
5. **Lệch / thiếu markup:** control không state (button, empty-state) → render lại ngay; có state → chụp state (value,
   selection, checked, focus) rồi **render an toàn ngay** và khôi phục state + focus vào control mới; dropzone đã chọn
   file giữ native. *(Sửa 2026-10-03, v0.26 review: bản đầu hoãn tới blur khi control đang focus; ba vòng review liên tiếp
   tìm lỗi ở đường hoãn — control lạ còn sống, thuộc tính lệch, render hai lần — nên bỏ hoãn: ca hiếm "markup lệch + đang
   gõ đúng lúc nâng cấp" đổi node nhưng giữ giá trị / selection / focus. Markup hợp lệ vẫn nhận tại chỗ, giữ identity.)*
6. **Lưới an toàn:** CSS `:not(:defined)` hẹp theo từng host (display, kích thước giữ chỗ, hiện fallback) cho host in tay —
   không giả lập ngữ nghĩa.
7. **Nạp sớm (tối ưu, không thay SSR):** stylesheet → import map → `<link rel="modulepreload">` cho component có trên trang
   (`Td::modulePreloads([...])`) → entry module ngoài.
8. **Helper PHP:** chế độ element **tự bật** — `['element' => true|false]` từng lần gọi (ghi đè) và
   `Td::configure(..., ['ssr_elements' => true])` toàn cục (mặc định `false`, chỉ áp cho helper đã có contract trong bản
   đó). Mặc định native giữ tới bản lớn sau.
9. **ID:** id tự sinh bên trong không phải API; id gốc do người gọi đưa vào và id control suy ra từ nó (dùng cho `<label
   for>`) là contract trợ năng.
10. **Lộ trình:** v0.25 base + button / link + lưới CSS + modulepreload + badge icon; v0.26 input-field / toggle /
    checkbox; v0.27 dropdown shell / empty-state; sau đó datetime, dropzone.

## Hệ quả

Hai bộ render (PHP + JS) phải khớp → fixture dùng chung là bắt buộc. Trình duyệt hỗ trợ: 2 bản mới nhất Chrome / Edge,
Firefox, Safari (CI tự động 3 engine; password manager kiểm tay).
