# 0007. td là thư viện chuẩn; dcms2 đứng độc lập

- **Status:** Accepted
- **Date:** 2026-06-10 (cập nhật 2026-09-27)

## Context

td là fork của dcms. So sánh 2026-06-10 ([history/dcms-comparison.md](../history/dcms-comparison.md)) cho thấy mỗi
bên có bug mà bên kia đã sửa. Báo cáo đề xuất hội tụ dần hai repo.

## Decision

- td là thư viện primitive chuẩn và là **SSOT cho mọi site** (dwp, 135, site mới).
- **dcms2 đứng độc lập, không sync hai chiều.** td chỉ port logic/ý tưởng từ dcms (và dwp) khi có giá trị,
  viết lại theo kiến trúc td, ghi nguồn (commit) trong CHANGELOG/history.
- Không port phần CMS-riêng (richtext, media-picker, post-*, notification, action-buttons, draft-preview, banner, color-picker).

## Consequences

- Không có nghĩa vụ đẩy fix ngược về dcms.
- Mỗi đợt định kỳ quét dcms/dwp để lấy fix đáng giá (vd. [2026-09-sync-dcms-dwp.md](../history/2026-09-sync-dcms-dwp.md)).
- Khuyến nghị "hội tụ dcms về td" ở §6 báo cáo so sánh không còn hiệu lực.

## Bổ sung (v0.48.0)

- `color-picker` **không còn** là phần CMS-riêng: dsuite (`05-FOUNDATION` §4) dùng nó cho mọi form setting kiểu màu, và
  135 / dwp cần cùng control. td có `<td-color-picker>` + PHP `td_color_picker()` / `td_color_value()` (plan
  [v0.48.0-color-picker](../plans/v0.48.0-color-picker.md)), **viết lại** theo kiến trúc td — port ý tưởng của
  `dcms-color-picker` / `dcms-color-panel` (16 preset mặc định, `custom: false`, "Xoá màu"), **không** port code
  (`style.*` trực tiếp, class Tailwind, icon Font Awesome, `<input type="color">` native trong popup không mang sang).
  Giá trị chuẩn là `#rrggbb` **chữ thường** (dcms: hoa) — dsuite là hệ mới, không migrate dữ liệu dcms.
