# 0006. td-modal không đóng khi click backdrop

- **Status:** Accepted
- **Date:** 2026-06-10 (v0.4.0)

## Context

Modal thường chứa form/thao tác dở. Click nhầm ra ngoài làm mất dữ liệu. Thêm nữa `confirm()` từng treo Promise khi
đóng bằng X/backdrop.

## Decision

- Bỏ đóng khi click backdrop; không đóng bằng ESC (vốn chưa bao giờ có).
- Chỉ đóng qua nút X, nút footer, hoặc `closeById`/`closeAll`. `closable: false` chỉ ẩn nút X.
- Dialog promise (settled-flag, port từ dcms): resolve đúng một lần; callback throw không làm treo.

## Consequences

- Thay đổi hành vi có chủ đích (ghi CHANGELOG 0.4.0).
- Khác với `td-lightbox` ([0009](0009-td-lightbox-hooks.md)): lightbox là trình xem ảnh, không có gì để mất, nên backdrop click **đóng**.

## Addendum (2026-09-27, v0.10.0) — `escapeCloses`

- Option mới `TdModal.show({ escapeCloses: true })` (mặc định `false`): ESC đóng dialog, trừ khi đang có action async
  (busy). ESC vẫn luôn bị modal "nuốt" (không lọt xuống lightbox/layer dưới).
- **Chỉ dùng cho dialog mà đóng không mất dữ liệu người dùng** — ví dụ `td-datetime-picker` (giữ bản nháp riêng; giá
  trị đã chọn không đổi khi huỷ). APG Date Picker Dialog yêu cầu ESC đóng. Modal chứa form vẫn giữ mặc định.
- Backdrop click vẫn không đóng (kể cả với `escapeCloses`).
