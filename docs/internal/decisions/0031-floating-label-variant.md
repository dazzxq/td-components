# ADR 0031 — Nhãn nổi là variant CSS thuần của `td-input-field`

Trạng thái: chấp nhận (2026-10-08). Nguồn: plan [v0.58.0-floating-label](../plans/v0.58.0-floating-label.md) (owner chốt:
variant, dùng lại thiết kế dwp; quyết định release lead Q1–Q7; Codex plan-review APPROVE vòng 3). Liên quan:
[0011](0011-minimal-surfaces.md), [0012](0012-ssr-hydration.md), [0019](0019-touch-standard.md),
[0025](0025-pre-upgrade-parity.md), [0027](0027-shared-helper-contract.md), [0028](0028-field-affix-number-locale.md).

## Bối cảnh

Owner muốn nhãn nổi (nhãn nằm trong ô, nổi lên khi focus / có giá trị) cho mọi site, **là variant** của `td-input-field`
chứ không phải component mới, và dùng lại thiết kế dwp đã chạy (`label_mode=floating`: CSS thuần `:placeholder-shown` +
`placeholder=" "` + sibling `control + label`). dwp thiếu nhiều thứ kit bắt buộc: affix, autofill, RTL, màu chữ đạt tương
phản, nhãn dài, cỡ, SSR parity, forced colors, reduced motion.

## Quyết định

1. **API:** attribute `label-mode` = `top` (mặc định) | `floating` (property `labelMode`), PHP `td_field` option `label_mode`.
   Có hiệu lực khi có `label` và type ≠ `contenteditable` (không → nhãn trên, contenteditable + một cảnh báo). Không dùng →
   `render()` / PHP **giống từng byte**; contract giữ `input-field@1` (chỉ thêm).
2. **DOM:** control (hoặc hộp affix `.td-field__box`) đứng **trước** `<label for>` thật; gốc thêm `td-field--floating`
   [+ `td-field--always-float`] [+ `td-field--ph-label`] **sau** mọi class cũ. Không phần tử mới, không chữ nhãn nhân đôi,
   không `aria-hidden`.
3. **Trạng thái là CSS thuần** (không JS, giống hệt trước / sau nâng cấp — ADR 0025 đạt theo cấu trúc): nhãn nổi khi
   `:focus` / `:focus-within` (hộp), `:not(:placeholder-shown)` (giá trị **sống**: gõ, SSR, `setValue`, khôi phục form,
   reset), `:autofill` và `:-webkit-autofill` (mỗi điều kiện một luật), hoặc luôn nổi (`date` / `month` / `datetime-local` /
   `time`; có affix — nhãn nghỉ sẽ chồng tiền tố / hậu tố, CSS không đo được bề rộng). Thiếu placeholder (markup hỏng) ⇒
   luôn nổi, không bao giờ chồng chữ.
4. **Placeholder (spike a11y M0 → nhánh F1):** `placeholder=" "` của dwp bị lộ thành placeholder riêng trong mô hình ARIA ở cả
   3 engine (khác ô kiểu thường) ⇒ kit đặt **chữ nhãn** làm placeholder khi không có placeholder thật (trùng tên truy cập ⇒
   không lộ thêm gì; cây trợ năng giống hệt kiểu thường — gate `floating-a11y`), luôn ẩn bằng `opacity: 0`
   (`td-field--ph-label`). Placeholder thật giữ, chỉ hiện khi nhãn đã nổi (focus); ẩn bằng `opacity` vì forced colors ép `color`.
5. **Hình học (port dwp md, suy ra sm / lg):** cao 48 / 56 / 64 px (token `--td-field-float-h-*`), nhãn nổi
   `scale(0.857)` = 12 px (dwp 0.78 = 10.9 px < chữ nhỏ nhất của kit). Nhãn **luôn một dòng** (`line-height` 1.5,
   `nowrap`, ellipsis), căn giữa khi nghỉ bằng `inset-block-start`, nổi **chỉ** bằng `transform` ⇒ hộp sau transform (= vùng
   bấm) nằm trọn trong dải padding-trên, không bao giờ phủ dòng giá trị (dwp: nhãn cao bằng ô, vùng bấm phủ giá trị).
6. **Nhãn giữ pointer events** (dwp: `none`): bấm / chạm nhãn = kích hoạt `<label for>` native (focus control; iOS mở bàn phím).
   Nhãn nghỉ chỉ phủ ô **rỗng**; nhãn nổi không phủ chữ giá trị (QĐ 5) ⇒ không mất chỗ đặt con trỏ.
7. **Màu:** nghỉ / nổi = `--td-field-float-label` (= placeholder), focus = `--td-field-float-label-focus` (= `--td-accent`, chữ
   ≥ 4.7:1 — màu viền focus của dwp chỉ ≥ 3:1). Hai alias token hợp đồng ⇒ palette `td-theme` không đổi (algorithm 4).
8. **Minimal surfaces luật 4:** nhãn thu nhỏ + dịch là **transform chức năng** (trạng thái "đã có giá trị"), ghi vào danh sách
   ngoại lệ; reduced motion tắt transition. Không hover, không luật nhấn (nhãn không phải control).
9. **Phạm vi:** chỉ `td-input-field` (12 type, kể cả textarea — nhãn nổi có nền ô để chữ cuộn không chạy dưới nhãn).
   `td-number-input`, `td-dropdown` và control có trigger để bản sau (không có `:placeholder-shown`).

## Hệ quả

- Site bật floating: ô cao hơn; CSS / script dựa vào thứ tự `label` → control không khớp ô floating (ghi class-map, docs).
- Chế độ con trỏ ảo đọc nhãn sau ô (như Bootstrap `.form-floating`); tên / mô tả không đổi.
- Hình học bằng px như dwp và như chiều cao field của kit: chữ hệ thống rất lớn làm ô cao lên (giá trị không bị cắt) nhưng
  nhãn nổi giữ khoảng cách px — cùng giới hạn với kiểu thường.
- Gate mới: `td-v058-floating.engines` / `.ssr.engines` (3 engine, hit box bằng `elementFromPoint`), `floating-a11y`,
  13 state CSP, 5 ca FOUC, cặp tương phản, responsive (cột hẹp, chữ lớn), touch (chạm nhãn), form-dirty.
