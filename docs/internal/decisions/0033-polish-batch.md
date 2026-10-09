# ADR 0033 — Lô polish 0.62.0: alert không vạch (ô icon), media-picker cùng chuyển động với modal

Trạng thái: **chấp nhận** — 2026-10-09 (v0.62.0). Plan [v0.62.0-polish](../plans/v0.62.0-polish.md); mock alert
`../plans/assets/v0.62-alert-mock.html` (owner duyệt nguyên trạng).
Liên quan: [ADR 0011](0011-minimal-surfaces.md) (minimal surfaces), [0019](0019-touch-standard.md), [0020](0020-theme-scope-portal.md),
[0006](0006-modal-no-backdrop-close.md).

## 1. `td-alert`: bỏ vạch cạnh, thay bằng ô icon

- **Bối cảnh.** 0.36.0 (plan QĐ 26) nhận diện alert bằng vạch `border-inline-start` 4px. Owner không muốn vạch cạnh; đây cũng là mẫu
  "side-stripe card" mà checklist Hallmark xếp vào dấu hiệu AI.
- **Quyết định.** Giữ nền nhạt đặc (thân chứa chữ, liên kết, nút `.td-btn`), viền 1px **bốn cạnh**, thêm **ô icon** vuông bo
  (`--td-alert-icon-box` 1.75rem, `--td-radius-md`) tô bằng `color-mix(icon 8 %, nền)` (`--td-alert-{v}-tile`). Markup byte-identical.
- **Vì sao không đặc cả khối** (đã loại ở 0.36.0): phải đổi màu mọi control con. **Vì sao không icon trần**: gần như bản 0.18–0.35.
  **Vì sao ô vuông bo, không tròn**: icon của registry đã là hình tròn có glyph.
- **Hệ quả.** Không token mới vào hợp đồng theme (ô chỉ dẫn xuất từ `-icon` / `-bg` đã đăng ký trong palette generator) → không
  bump `THEME_TOKENS_VERSION` / `ALGORITHM_VERSION`. Fuzz 5000 palette (kiểm 20 000: tối thiểu 3.32): icon trên ô ≥ 3.2:1 (12 % chỉ đạt 3.13 — Codex impl r1) (`src/theme/alert-tile.test.js`).
  Token `--td-alert-{v}-accent`, `--td-alert-accent-width` giữ khai báo, **không còn tác dụng** (deprecated). Ranh giới ngoài của
  khối (≈ 1.04–1.9:1 với trang trắng) là trang trí; nghĩa nằm ở icon, tiêu đề, nội dung. Alert cao thêm ~5px một dòng.

## 2. `td-media-picker`: chuyển động như modal

- **Bối cảnh.** Picker đã dùng DOM, fade, scrim và khối reduced-motion của modal; chỉ khác ở chỗ `modal.css` đặt
  `--td-modal-enter-from: none` cho hộp thoại toàn viewport, nên picker chỉ fade.
- **Quyết định (release lead, theo yêu cầu "giống modal").** ≥ 720px: `scale(0.95) → none` lò xo (token modal); < 720px: trượt từ
  dưới lên với `--td-modal-sheet-ease`. Chỉ đặt custom property trên `.td-media-picker__dialog`; không keyframe, không transition
  riêng; reduced motion vẫn do `modal.css`. Tắt bằng `--td-media-picker-enter-from: none` / `--td-media-picker-sheet-from: none`.
- **Hệ quả.** Mở rộng ngoại lệ của luật 4 minimal surfaces (scale chỉ cho modal) sang "hộp thoại kế thừa td-modal".
  Cần kiểm chứng trên trình duyệt: overshoot của lò xo trên bề mặt toàn viewport, và công việc đồng bộ ngay sau mở có ăn khung hình không.
