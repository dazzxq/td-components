# ADR 0027 — Hợp đồng gợi ý chung (`helper-text`) + `<td-hint>`

Trạng thái: chấp nhận (2026-10-07). Nguồn: plan [v0.54.0-hint](../plans/v0.54.0-hint.md) (owner duyệt phạm vi; Codex
plan-review APPROVE vòng 3; quyết định release lead Q1–Q6).

## Bối cảnh

Đến 0.53, 5 / 19 form control có `helper-text`, mỗi cái một bản chép (hai hình DOM, không cùng API: chỉ 3 có
`setHelper()`), và **tất cả hiện gợi ý cùng lỗi** (input-field D17). dsuite thiếu gợi ý ở dropdown / toggle; site cần gợi ý
có link cho cả control của kit lẫn control tự làm. PHP đặt tên không đều (`hint` vs `helper_text`).

## Quyết định

1. **`TdFormElement` sở hữu gợi ý** cho mọi lớp con: `helper-text` (quan sát ở base, cập nhật tại chỗ), `setHelper()`,
   `helperMessage`, ghi chú `div.td-field__note#{host}-note` gắn lại sau **mọi** bind (override `_bindStep`). Hook:
   `_helperNoteSpec()` (media giữ `span.__help#{id}-help` — contract `@1`), `_helperSlot()` (chỗ gắn tường minh, dùng chung
   cho chữ và `<td-hint>` con), `_helperChanged()`, `_helperDescribedByIds()`. Lớp con có `attributeChangedCallback` riêng
   gọi `_helperAttr()` đầu tiên.
2. **Có lỗi thì gợi ý ẩn** (mắt + `aria-describedby`) trên mọi control có error contract — thay D17. Đổi hành vi có chủ
   đích; không cờ giữ gợi ý.
3. **Một phần tử sở hữu id gợi ý**: `<td-hint>` con thắng chữ, nhận id của ghi chú (ghi chú nhả id); mô tả đọc id từ phần
   tử đang dùng.
4. **`<td-hint>`**: một tag, hai vị trí — con của control kit (gợi ý giàu) hoặc đứng riêng với `for` (control của site; một
   `MutationObserver` mỗi tree root sống khi còn `<td-hint for>`; nhớ `{ target, token }` để gỡ đúng token). Không render,
   không chuỗi HTML; kiểu theo tên thẻ (không nháy). Không theo lỗi của control lạ.
5. **`_syncDescribedBy()` theo đích di động**: đích ARIA đổi trong host (ô roving của check-matrix) → id của component rời
   đích cũ, id của trang ở lại.
6. **PHP `helper_text`** cho mọi helper form (byte cũ khi không dùng; `hint` là alias), `td_hint($for, $content)`;
   chữ trạng thái `on_text` / `off_text` của toggle không bao giờ nối vào mô tả khi không JS.

## Hệ quả

Mọi control mới nhận gợi ý miễn phí; một luật lỗi / gợi ý cho cả kit (breaking-changes 0.54.0). Gate: ma trận 19 / 18
control × 3 engine, `hint-a11y` (CDP + DOM + không JS), fixture SSR `hint`, byte baseline 0.53.1.
