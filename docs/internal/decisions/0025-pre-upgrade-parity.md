# ADR 0025 — Parity trước nâng cấp: `:not(:defined)` + `@media (scripting: enabled)`

Trạng thái: chấp nhận (2026-10-06). Nguồn: plan [v0.51.1-ssr-fouc](../plans/v0.51.1-ssr-fouc.md) (Codex plan-review
APPROVE vòng 3, quyết định release lead Q1–Q5). Bổ sung [ADR 0012](0012-ssr-hydration.md) QĐ 6 (lưới an toàn `:not(:defined)`).

## Bối cảnh

dsuite (staging, hard reload): `td_dropdown()` chế độ mặc định in `<td-dropdown>` + `<select>` trần; ~1 s người dùng thấy
select của trình duyệt rồi trang nhảy 18–21 px sang trigger. Audit đo mọi helper PHP (3 engine × 390 / 1280): cùng loại
nháy ở tree-select (WebKit bỏ qua `min-height` của select native; list multiple), chip-input element (list 4 dòng),
datetime-range (hai ô native hai dòng), scan-input / check-matrix (JS thêm dòng / thanh ở container hẹp), copy (chữ → nút).

ADR 0012 QĐ 6 chỉ cho "giữ chỗ, không giả lập". Nhưng một kiểu "trông như đã nâng cấp" có hai loại: (a) cũng là UI không-JS
tốt (select đơn tạo dáng như trigger), (b) hại người không-JS (list multiple co một dòng, dải trống chờ phần JS thêm). CSS
không biết module có tới hay không — trừ `@media (scripting)` (Media Queries 5): Chromium 120+, Firefox 113+, Safari 17+;
Playwright `javaScriptEnabled: false` → `scripting: none` ở cả ba engine (đo).

## Quyết định

1. **Trạng thái trước nâng cấp của mọi helper SSR phải có cùng hộp với trạng thái đóng đã nâng cấp** (host, control, nhãn
   ≤ 1 px; gate `test/engines/ssr-fouc.spec.mjs`, đo trước / sau trong **cùng lượt chạy**). Chỉ CSS trong `td.css`; markup
   PHP và contract hydrate `*@1` không đổi.
2. **Hai lớp luật.** Loại (a): không điều kiện, khoá vào `td-x:not(:defined)` (hoặc vỏ SSR có dấu). Loại (b): bọc
   `@media (scripting: enabled)`; người tắt JS giữ fallback native y như trước. Rủi ro chấp nhận: JS bật mà module hỏng →
   kẹt ở dáng trước nâng cấp — vẫn dùng được (list một dòng cuộn được, dải trống).
3. **Luật trước nâng cấp không bao giờ khớp host đã define** (`td-dropdown:not(:defined) > select`, không `td-dropdown >
   select`); riêng vỏ SSR có dấu (dropdown@1) giữ luật không điều kiện cho đường hoãn khi select đang focus.
4. **Chevron của select = hai `linear-gradient`** + `appearance: none` (gradient không phải tài nguyên ảnh — CSP `img-src`
   không đổi; WebKit chỉ tôn trọng hộp / bo của select không có dáng native). Forced colors: trả `appearance: auto`, bỏ
   gradient (mũi tên hệ thống). RTL: luật `:dir(rtl)` riêng. Thay quyết định "giữ mũi tên native" của v0.26.
5. **Cảm ứng (ADR 0019):** select trước nâng cấp ≥ 16 px trong `(pointer: coarse)`; chữ đổi 16 → 14 px khi nâng cấp được
   chấp nhận (hộp khớp).
6. **Ngoại lệ có chủ đích:** chip-input / multiselect element khi chip sau nâng cấp xuống dòng (lệch đúng bằng số dòng chip
   thêm — biết trước phải in chip = đổi contract); datetime-range mode `datetime` trong container hẹp; `td_copy` chỉ giữ
   chiều cao (giá trị phải luôn đọc được khi chưa có nút). Chữ ngày trong hộp datetime-range là định dạng của trình duyệt.

## Hệ quả

Mỗi helper / component mới có bước nâng cấp phải thêm ca vào `test/ssr/fouc.fixtures.json` (gate 3 engine, + dark, forced
colors, touch, RTL, `legacy+td`, không JS). `@media (scripting: …)` không phải breakpoint (lint ADR 0014 bỏ qua). Host
không layer (CSS site) vẫn thắng `@layer td.component` như mọi luật khác của kit.
