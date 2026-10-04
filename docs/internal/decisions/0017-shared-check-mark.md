# ADR 0017 — Ô tick chung: một phần hình `.td-check` = hình của `td-checkbox` cho mọi "tick để chọn"

Trạng thái: chấp nhận (2026-10-05). Nguồn: plan [v0.36.0-polish](../plans/v0.36.0-polish.md) mục A, QĐ 1–5; yêu cầu
owner mục 1 ("mọi tick để chọn giống hệt `td-checkbox`").

## Bối cảnh

Tới v0.35 kit có năm hình "tick" khác nhau: `td-checkbox` (hộp tròn, ✓ trắng trên `--td-checkbox-color`); tick của
`td-media-grid` (nút tròn nền đen 35 %, ✓ chỉ hiện khi chọn, token `--td-media-grid-tick-*`); tick của media picker (vuông
20 px, `--td-media-picker-card-checked`); `td-tree` chọn nhiều (hộp vuông 4 px, hai span ✓ / –); `td-chip-input`
`selection-only` và mục checkbox của `td-menu` (✓ trần, ẩn khi chưa chọn). Cùng một ý nghĩa "mục này được chọn" mà năm
cách vẽ, năm bộ token; site đổi màu checkbox thì các tick khác không theo.

Phương án bị loại: **lồng `<td-checkbox>`** vào tile / hàng / mục menu — control tương tác lồng trong control tương tác
(button, `role=option`, `menuitemcheckbox`), `td-checkbox` là form-associated (rò mục thừa vào FormData của form chứa
chip-input / tree), hai nguồn trạng thái (ARIA của phần tử chứa và `checked` của checkbox) phải đồng bộ tay.

## Quyết định

1. **Một phần hình duy nhất** `span.td-check` (CSS `src/styles/components/check.css`, đứng **trước** `checkbox.css` trong
   `manifest.json`): hộp + ✓ (icon registry `check`) + vạch lưng chừng vẽ bằng `::after` (không thêm node, CSP an toàn),
   màu bật `--td-checkbox-color`, viền nghỉ `--td-checkbox-border`, bo `--td-checkbox-radius` (tròn mặc định), cỡ
   `.td-check--sm|--md|--lg` = 1rem / 1.25rem / 1.5rem (ba cỡ của `td-checkbox`; consumer có thể đặt
   `--_td-check-size` riêng, ví dụ media grid theo `--td-media-grid-tick-size`), disabled 50 %, forced-colors,
   reduced-motion. `.td-check--on-media` thêm vành tối mảnh cho ô nằm trên ảnh.
2. **`td-checkbox` không đổi markup**: CSS chung viết `:is(.td-check, .td-checkbox__mark)` — DOM contract, class map, SSR
   `checkbox@1`, golden PHP giữ từng byte; `checkbox.css` chỉ còn layout + input ẩn + nhãn.
3. **Helper nội bộ** `src/utils/check-mark.js` (không subpath): `checkMarkHTML(size, { onMedia })` (chuỗi, icon qua
   `data-td-icon`) và `createCheckMark(size, { onMedia })` (DOM API). Mark **luôn `aria-hidden="true"`** — ngữ nghĩa nằm
   ở phần tử chứa. **Không bao giờ lồng `<td-checkbox>`**.
4. **Trạng thái đọc từ ARIA / trạng thái native đã có** (không thêm thuộc tính trạng thái trùng), mark là con trực tiếp:
   bật = `.td-checkbox__input:checked ~ .td-checkbox__mark`, `:is([aria-pressed="true"], [aria-checked="true"],
   [aria-selected="true"]) > .td-check`, `.td-tree__item[aria-checked="true"] > .td-tree__row > .td-check`; lưng chừng =
   `:indeterminate`, `[aria-checked="mixed"] > .td-check`, nhánh tree tương ứng, và `[data-td-check-mixed] > .td-check`
   (hàng "Chọn tất cả" của chip-input: `aria-selected` chỉ có true / false nên trạng thái một phần cần một cờ hiển thị);
   khoá = `:is([aria-disabled="true"], :disabled) > .td-check`. Lưng chừng đứng sau "bật" trong file → thắng.
   **Danh sách selector nằm một chỗ** (`check.css`); consumer mới thêm selector của mình vào đó
   ([conventions](../conventions.md#ô-tick-chung-td-check)).
5. **`td-checkbox` có `indeterminate`** (thuộc tính boolean + property phản chiếu, chỉ `TdCheckbox`, không
   `TdCheckableElement`): áp xuống `input.indeterminate` sau mọi render / adopt SSR / gắn lại / reset; người dùng bấm → gỡ
   thuộc tính rồi phát đúng một `change`; đặt bằng code không event; đổi `checked` bằng code không xoá; không thuộc
   FormData.
6. **Áp dụng v0.36**: tick `td-media-grid` (nút trong suốt giữ `aria-pressed`, `tabindex=-1`, vùng chạm `::before`, chứa
   `.td-check--lg.td-check--on-media`; picker 20 px qua `--td-media-grid-tick-size`); `td-tree` chọn nhiều (`--sm`);
   `td-chip-input` `selection-only` (`--sm`, **luôn hiện** — hộp rỗng khi chưa chọn; "Chọn tất cả" lưng chừng khi chọn một
   phần); `td-menu` `menuitemcheckbox` (`--sm`, luôn hiện). **Giữ ✓** cho `menuitemradio` và `td-dropdown` chọn một (ngữ
   nghĩa radio, không phải hộp).
7. **Tương lai**: chọn dòng `td-table` (v0.37) dùng cùng `.td-check` (ô header = lưng chừng) — không component nào được
   vẽ ô tick riêng nữa.

## Hệ quả

- (+) Một bộ token (`--td-checkbox-*`) đổi hình mọi ô tick; hình khớp từng px giữa checkbox và tick (test engines so hộp,
  nền, bo, viền ở off / on / mixed / disabled).
- (+) Không control lồng nhau, không rò FormData, một nguồn trạng thái (ARIA của phần tử chứa).
- (−) **Đổi hình** (breaking-changes 0.36.0): token `--td-media-grid-tick-{bg,border,ring,on-bg,on-fg}` chỉ còn tác dụng
  với tick **của site** (`[data-td-media-tick]`); `--td-media-picker-card-checked` không còn tô tick (viền card giữ);
  `--td-tree-check-radius` deprecated (alias `--td-checkbox-radius`, không tác dụng) — tree hết vuông; menu checkbox
  luôn hiện hộp.
- (−) Selector trạng thái phụ thuộc mark là **con trực tiếp** của phần tử mang ARIA (hoặc cấu trúc tree đã liệt kê) — đặt
  mark sâu hơn thì phải thêm selector vào `check.css`.
