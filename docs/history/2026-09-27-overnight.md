# Nhật ký chạy qua đêm — 2026-09-27

Mục tiêu user giao: "làm hết các task" theo roadmap. Quy tắc: mỗi release một branch → Codex plan-review →
code → Codex impl-review (+ security-review khi đụng input người dùng) → merge + tag trên máy. **Không push.**
Quyết định thiết kế mơ hồ → debate Codex (`/codex-think-about` hoặc bảng Decisions trong plan-review).

## Đã xong (merge vào `main`, có tag)

| Tag | Nội dung | Codex |
|---|---|---|
| `v0.4.1` | 7 bug (toast treo tab, focus-trap modal rò, scroll lock phá `sticky`, input-field mất helper, dropdown đè/định vị, role toast, Storybook build hỏng) + chuyển `.planning` (GSD) → `docs/` hub-and-spoke | impl APPROVE (3 vòng) |
| `v0.5.0` | Nền tảng `td.css`: token `--td-*`, layer, Liquid Glass recipes + fallback a11y không phá được, dark opt-in, gate CSP 3 engine × `'self'`/nonce-only | plan APPROVE (3), impl APPROVE (2) |
| `v0.6.0` | `td-lightbox` (port sạch lõi dwp, hook `download/video/history/panel/toolbar/isAllowedUrl`) + **icon registry** (Lucide, `tdIcon`, `<td-icon>`, ADR 0010 — ý tưởng của user) | plan (3), think-about icon (đồng thuận), impl (3), security (3) |
| `v0.7.0` | Batch 1 token-native: button, checkbox, toggle (switch native), loading + error contract, accessible name, spinner dùng chung, inert lease dùng chung | plan (3), impl (5), security (2) |
| `v0.8.0` | Batch 2 token-native: input-field, slider, pagination, tabs (APG, manual activation), empty-state (đóng lỗ SVG thô) — 4 agent song song trong worktree riêng, tích hợp + sửa 2 lỗi base (label ngoài, di chuyển DOM) | plan (3), impl (3), security (3) |
| `v0.9.0` | Batch 3 lớp nổi: modal/modal-stack, toast, tooltip, dropdown (combobox APG) + `utils/layers.js` (một bộ điều phối Escape/Tab, inert lease có floating, trả focus qua hand-off) — 4 agent song song | plan (4), impl (4), security (3) |
| `v0.10.0` | Batch 4 (component legacy cuối): datetime-picker (combobox + dialog, bánh xe dạng listbox dùng bàn phím, `min`/`max`, parser dùng chung trong `utils/datetime.js`), table (cập nhật tại chỗ giữ focus, sort chuẩn APG, sticky header, `cellPaddingClass`) — **mọi component đã token-native**, `adopt-styles` đã xoá | plan (3), impl (3), security (1, 0 lỗi) |

## Phát hiện đáng chú ý

- Nhiều lỗi a11y thật đã sửa: checkbox mất focus + 2 event `change`, switch không có tên truy cập, button glass
  2.0–3.2:1 (không đạt AA), loading không chặn bàn phím, dialog lightbox không nhận focus (transition `visibility`).
- `adoptedStyleSheets` + CSSOM chạy được dưới CSP nonce-only ở Chromium, Firefox 151, WebKit (Safari 26.4) — đã đo.
- Harness CSP profile kết hợp (Tailwind + td.css) bắt được lỗi thật: component thừa kế `line-height`/`box-sizing`
  của trang → component nay tự khai báo.
- Dev deps: Storybook nâng 8.6.18 (GHSA WebSocket hijack). Còn `extract-zip`/`uuid` (chỉ tooling, cần nâng major) →
  roadmap backlog.

- Batch 3: Codex impl-review bắt 12 lỗi thật (focus trap bỏ sót `<summary>`, phím IME bị hiểu thành lệnh, màu tooltip
  trong suốt, modal đang đóng bị "sống lại", focus trả vào modal đã đóng khi loading tắt, lightbox giành focus của
  modal phía trên…) — tất cả đã sửa + có test hồi quy.

- Batch 4: Codex bắt 10 lỗi (getter trả giá trị ngoài min/max, cận một phía tạo khoảng năm bất khả, số âm, mất
  focus khi đổi label lúc đang mở, ID trùng khi mở lại nhanh…) — đã sửa + test. Lúc tích hợp còn tìm ra 3 lỗi CSS dùng
  chung có sẵn từ trước (spinner rảnh hiện trong nút modal, note lỗi dùng font host, viền bảng phụ thuộc Tailwind).

## Cần user xem / quyết

- **Tên release:** batch 4 đang là `v0.10.0`. Nếu muốn đánh dấu "migrate xong" là `v1.0.0` thì đổi tag; không thì
  release kế (bỏ peer Tailwind, dọn `td-sample`/`demo.html`/docs) sẽ là 1.0.0.
- Picker giờ đóng bằng Esc — ngoại lệ có chủ đích của ADR 0006 (addendum, `escapeCloses`), chỉ picker dùng.

- Giao diện mới (Storybook: Foundations/Glass, Foundations/Icons, Feedback/Lightbox, Form/Button|Checkbox|Toggle,
  Feedback/Loading, Form/InputField|Slider, Display/Pagination|Tabs|EmptyState, Feedback/Modal|Toast|Tooltip,
  Form/Dropdown).
- Batch 3 lệch nhẹ so với inventory (Codex đã chấp nhận): mọi toast đều có nút "Đóng" (không chỉ sticky), hover/focus
  tạm dừng cả chồng toast; tooltip chỉ mở khi focus bằng bàn phím (`:focus-visible`), không mở khi click. Màu/bo góc là token — đổi dễ nếu không ưng (`--td-btn-radius`, `--td-accent`, `--td-switch-on`).
- Push lên GitHub khi đã kiểm tra (`git push --follow-tags`).
- 135/dwp chưa đụng tới; hướng dẫn tích hợp trong `docs/roadmap.md` mục External.

(Các batch tiếp theo được ghi thêm bên dưới khi xong.)
