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

## Addendum (2026-10-06, v0.44.0) — `beforeClose` + `requestClose()` (plan v0.44.0-confirm-dirty QĐ 12-15)

- Hai loại đường đóng: **người dùng xin đóng** (nút X, action có đóng, Escape khi `escapeCloses`,
  `TdModal.requestClose(id, value?)`) chạy guard bất đồng bộ `show({ beforeClose })` trước; **app ra lệnh đóng**
  (`close()` / `closeById()` / `closeAll()`) bỏ qua guard — cùng mô hình `HTMLDialogElement.requestClose()` vs `close()`.
  Đăng xuất / đổi route không bao giờ bị treo bởi một guard.
- Guard chạy cho **mọi** action đóng, kể cả "Lưu": sau khi lưu thành công app phải `tracker.markClean()` trước khi
  `onClick` trả về, nếu không sẽ bị hỏi "Bỏ thay đổi?". Đây là hành vi có chủ đích (nút "Hủy" là action — đúng chỗ cần
  chặn nhất); quên `markClean` lộ ngay khi dev.
- Guard `false` / throw / reject → ở lại (an toàn cho dữ liệu). Đang chờ: lần xin đóng thêm dùng chung, action không
  chạy, không spinner; đóng bằng code trong lúc chờ → kết quả bị bỏ. Hộp thoại Promise không nhận guard.
- Backdrop vẫn không bao giờ đóng; Escape vẫn chỉ với `escapeCloses`. `<td-drawer>` có cùng mô hình (property
  `beforeClose` + `requestClose()`, chạy trước event `before-close` v0.27 vốn giữ nguyên).

