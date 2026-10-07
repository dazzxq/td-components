# ADR 0028 — Affix chung cho ô nhập + `locale` của number chỉ suy dấu phân cách

Trạng thái: chấp nhận (2026-10-07). Nguồn: plan [v0.55.0-affix-number](../plans/v0.55.0-affix-number.md) (owner duyệt phạm vi;
Codex plan-review APPROVE vòng 2; quyết định release lead Q1–Q8 + bổ sung A / B). Liên quan:
[0003](0003-elementinternals-form-association.md), [0012](0012-ssr-hydration.md), [0019](0019-touch-standard.md),
[0025](0025-pre-upgrade-parity.md), [0027](0027-shared-helper-contract.md).

## Bối cảnh

dsuite cần đơn vị cạnh ô (`https://`, `mAh`, `đ`), icon (tìm kiếm, khoá) và nút của trang (hiện mật khẩu, xoá) trong
`td-input-field`; `td-number-input` có chữ affix từ 0.30 nhưng không icon / phần tử. Hai control vẽ "hộp trông như ô nhập"
khác nhau. Owner cũng hỏi "giữ đúng chữ số lẻ" và "nhóm theo locale" cho number — đọc code: phần lớn đã có từ 0.30 (`decimals`
là tối đa, không đệm / làm tròn; dấu phân cách là attribute), gap thật là tiện ích `locale`, phím thập phân của bàn phím ảo và
test IME.

## Quyết định

1. **Một API affix cho hai control:** `prefix` / `suffix` (chữ), `prefix-icon` / `suffix-icon` (tên registry), con trực tiếp
   `[slot="prefix"|"suffix"]` (Element của trang, **chuyển** — không clone, không chuỗi HTML; đọc ở lần render đầu). Mỗi bên tối
   đa một affix hiển thị: slot thắng chữ / icon (một cảnh báo); icon luôn ở mép ngoài. Affix không bao giờ là giá trị.
   `td-input-field` chỉ cho `text | search | email | url | tel | password | number` (khác → bỏ + cảnh báo). Code chung:
   `src/form/field-affix.js` (hàm DOM thuần) — không đưa vào `TdFormElement` (hai control dùng, luật minimal surfaces).
2. **DOM:** input-field có affix → `.td-field--affix` > `div.td-field__box` > [affix] control [affix] [unit]; không affix →
   `render()` **giống từng ký tự** 0.54. number giữ `span.td-number__affix--{side}` (contract `@1`), icon nằm trong span đó.
   Vỏ slot (`…__affix--slot`) do JS gắn sau mỗi bind, không bao giờ trong chuỗi `render()` → SSR không thấy node của trang.
3. **Trợ năng: đơn vị là mô tả, không phải tên.** Chữ / icon affix `aria-hidden`; đơn vị (`unit-label` → `suffix` → `prefix`)
   qua `span#{host}-unit[hidden]` **đầu** `aria-describedby`, ở lại khi có lỗi. Không chữ ẩn trong `<label>` (đổi tên, lệch
   WCAG 2.5.3, đọc hai lần). Slot: kit không đụng ngữ nghĩa.
4. **Một luật hộp CSS:** `:is(.td-number__box, .td-field__box)` trong `field.css` (luật number chuyển sang với **cùng độ ưu
   tiên**, baseline CSP number giống từng byte); token `--td-field-affix-fg` / `-gap` / `-icon`, token number alias chúng. Thuộc
   tính cắt chữ affix dài (`max-inline-size` / `overflow` / ellipsis) chỉ cho affix của input-field (baseline number chụp
   `max-width` / `overflow-y`). `.td-field__box` là `active-exempt` (focus ring là phản hồi).
5. **SSR `@1` chỉ thêm:** PHP `td_field` (`prefix`, `suffix`, `prefix_icon`, `suffix_icon`, `unit_label`) và `td_number_input`
   (`prefix_icon`, `suffix_icon`) in đúng hộp `render()` (icon kèm SVG inline, so theo attribute, vẽ lại cùng hộp); không dùng
   option → byte cũ. PHP không nhận affix giàu (Q4).
6. **`locale` chỉ suy dấu phân cách** — không bao giờ định dạng bằng `Intl` (làm tròn VND, đệm USD, không nhóm 4 chữ số ở `es`,
   lakh ở `en-IN`, chữ số Ả Rập). Bảng cố định chung JS / PHP (`NUMBER_LOCALES` / `Td::NUMBER_LOCALES`, tra cả thẻ, không phân
   biệt hoa thường, không rơi ngầm từ vùng về ngôn ngữ); JS ngoài bảng → Intl đã kiểm (dấu trong tập `.` `,` ` ` ``, cùng ngôn
   ngữ), không dùng được → mặc định + cảnh báo; PHP ngoài bảng → mặc định + `E_USER_WARNING`, in dấu tường minh lên host (không
   in `locale` — hydrate không phụ thuộc ICU). Tường minh > `locale` > mặc định, giải **theo cặp**; không `locale` = luật 0.54.
7. **Phím thập phân ảo:** `decimals > 0` + ô chưa có dấu thập phân → `.` hoặc `,` (kể cả dấu nhóm) = dấu thập phân của ô.
8. **Giá trị trước nâng cấp vẫn là số chuẩn** (không có `td__number_format` PHP — Q2); `decimals` giữ nghĩa tối đa (khoá bằng
   test; dữ liệu đã đệm từ DB là việc của site — Q3).
9. **Bổ sung (release lead A):** `--td-field-note-size` là cỡ chữ của mọi gợi ý (mặc định như cũ).

## Hệ quả

- input-field có thêm 5 attribute cấu trúc (đổi lúc chạy: render lại hộp, giữ focus + con trỏ + mốc `change`).
  `prefix` không có property phản chiếu (`Element.prototype.prefix` là property namespace của DOM — đặt bằng attribute, như
  number từ 0.30).
- Không `currency` (Q1), không tự bóc tiền tố khi dán (Q5), không MutationObserver cho slot muộn (Q6), không `'` cho `de-CH`
  (Q7), một luật mô tả cho cả hai control (Q8).
- Gate: ma trận affix 2 control × 3 engine, `affix-a11y` (CDP + DOM + không JS), SSR `affix` (nhận tại chỗ, hộp ≤ 1 px),
  bảng ca locale chung JS / PHP / Intl, IME Chromium CDP, CSP state mới, contrast `--td-field-affix-fg`, responsive / touch.
