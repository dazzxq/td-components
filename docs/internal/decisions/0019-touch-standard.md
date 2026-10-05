# ADR 0019 — Chuẩn hành vi cảm ứng toàn kit

Trạng thái: chấp nhận (2026-10-05). Nguồn: plan [v0.36.2-touch](../plans/v0.36.2-touch.md) (Codex plan-review APPROVE
vòng 3), đồng thuận Claude × Codex `/codex-think-about` (luật 1–15); yêu cầu owner 2026-10-05 ("ngoài responsive chuẩn ra
thì còn phải hỗ trợ behaviors touch chuẩn nhất có thể cho toàn bộ components"). Số 0018 đã giữ chỗ cho chọn dòng bảng
(v0.37). Luật chi tiết (kiểm được): [design/touch.md](../design/touch.md).

## Bối cảnh

Tới v0.36.1 kit đã đúng kích thước trên điện thoại (ADR 0014: vùng chạm ≥ 44, sheet, card) nhưng hành vi chạm thì chưa:

- 73 selector `:hover` trong 29 file CSS, chỉ 4 nằm sau `(hover: hover) and (pointer: fine)` → trên điện thoại hiệu ứng
  hover "dính" sau khi chạm (nền đổi màu cho tới khi chạm chỗ khác).
- Không có `:active` nào → chạm vào nút không có phản hồi thị giác; iOS WebKit còn chỉ áp `:active` khi trang có listener
  `touchstart`.
- `td-tooltip` hiện khi chạm (cả qua focus mà cú chạm sinh ra trên Chromium / Android) → nhãn che nội dung, chạm hai lần.
- Ngưỡng kéo 4 px cho mọi loại con trỏ ở sortable → ngón tay run cũng thành kéo.
- Lớp phủ toàn màn hình dùng `100dvh`; trên iOS / Android Chrome ≥ 108 bàn phím ảo **không** thu nhỏ layout viewport nên
  che footer và ô đang nhập.
- Lightbox chuyển ảnh khi nhả tay > 50 px, khung không theo ngón.

## Quyết định

1. **Hover chỉ cho con trỏ mịn.** Mọi `:hover` nằm trong `@media (hover: hover) and (pointer: fine)` (đúng chuỗi). Trạng
   thái mang thông tin (selected, expanded, current, lỗi, focus, disabled, đang kéo) không bao giờ phụ thuộc hover.
   Lint `checkHoverGate` trong `npm run check:css`; ngoại lệ `/* hover-exempt: <lý do> */` (0 mục).
2. **Trạng thái nhấn dùng chung**: mọi control tương tác có luật `:is(:active, [data-td-pressed])` **ngoài** cổng hover —
   chỉ đổi màu (token `--td-color-pressed`, `--td-option-pressed-bg`, `--td-btn-{v}-pressed`, `--td-btn-ghost-pressed`,
   `--td-action-btn-{tone}-pressed-bg`), không scale / dịch (ADR 0011 luật 4), `transition-duration: 0s` khi vào,
   `-webkit-tap-highlight-color: transparent`, forced colours = viền `Highlight`. Lint `checkPressed` suy tập control từ
   các luật `:hover` + `cursor: pointer`; ngoại lệ `/* active-exempt: <lý do> */` (14 mục đã duyệt sau review vòng 1 — vùng dropzone và toast có hình nhấn; danh sách ở
   design/touch.md). Contrast gate đo cặp chữ / nền nhấn.
3. **Không dựa vào quirk iOS**: `src/utils/press.js` `ensurePressStates()` gắn một bộ listener **passive** trên `document`
   (lười: lần connect đầu của `TdBaseElement`, `openDialogLayer()`, mở lightbox, container toast) và đặt `data-td-pressed`
   lên control gần nhất (`PRESS_TARGETS`, đồng bộ với CSS bằng test) cho `touch` / `pen`; gỡ khi nhả / huỷ /
   `lostpointercapture` / di quá `dragSlop` / `blur` / `visibilitychange`. Thêm một `touchstart` rỗng passive cho `:active`
   gốc. Không `preventDefault`, không chặn cuộn.
4. **Tooltip không bật khi chạm**: bỏ qua `pointerenter` touch và `focusin` trên cùng trigger trong 1 s sau một
   `pointerdown` touch. Bàn phím, chuột, bút, focus bằng code không đổi. Tooltip chỉ là thông tin phụ.
5. **Ngưỡng kéo theo loại con trỏ** (`src/utils/gesture.js`, đọc từ **sự kiện** — máy lai đúng từng input): chuột 4, bút 8,
   chạm 10 px. Sortable / repeater / media-grid dùng nó; lightbox giữ `MOVE_SLOP 8`, cropper giữ `TAP_PX 4`.
6. **Bảng `touch-action` chuẩn**, khoá bằng test: `none` chỉ ở mặt cropper, input slider, tay nắm sortable, stage + cột
   nav lightbox; filmstrip `pan-x`; nút rail lightbox `manipulation`; không gì trên `html` / `body`; không chặn zoom trang.
7. **Dialog né bàn phím ảo**: `src/utils/keyboard-viewport.js` (dựng trên `viewportBox()` của `floating.js`) — khi có
   bàn phím, gốc lớp phủ (`.td-modal`, `.td-drawer-root`) nhận `--td-vv-top` / `--td-vv-height` (CSSOM) nên dialog, sheet,
   picker, drawer và footer nằm trên bàn phím; thân cuộn của dialog cuộn tới khung `.td-field` đang focus (gồm lỗi). Không
   `focus()`, không `scrollIntoView()`, không can thiệp khi đang pinch zoom. `openDialogLayer({ viewport })`: mọi caller
   truyền, trừ `crop-dialog` (không có ô gõ chữ) — test kiểm danh sách.
8. **Lightbox vuốt theo ngón**: khoá trục, khung media dịch theo ngón, chốt khi > 25 % bề rộng cột nhìn thấy hoặc flick
   (> 0.3 px/ms), không chốt thì lò xo về; một ảnh = dây chun; reduced motion = không theo ngón, đổi ngay. Một trạng thái
   settle duy nhất, mọi lối thoát qua `clearSwipe()`; điều hướng bằng nút / phím / API trong lúc settle thắng.
9. **Lane test touch** (`npm run test:touch`, nằm trong `npm test`): Chromium 390×844 `hasTouch` + CDP
   `Input.dispatchTouchEvent` (cử chỉ thật, timestamp tường minh), WebKit `iPhone 13` smoke. Firefox không có trong lane.
   Event pointer tổng hợp chỉ dùng cho state machine. Checklist iPhone thật mỗi bản đụng touch
   ([release-touch-checklist.md](../release-touch-checklist.md)).

## Hệ quả

- Thiết bị có con trỏ chính là cảm ứng (kể cả iPad có trackpad) không còn kiểu hover nào — đánh đổi có chủ đích.
- Site có `:active` riêng: luật kit nằm trong `@layer td.component`, luật không layer của site vẫn thắng.
- Thêm thuộc tính `enterkeyhint` cho `td-number-input`; token `--td-*-pressed`; `--td-vv-*` là biến nội bộ (không phải API).
- Ngoài phạm vi (backlog): vuốt để đóng toast / drawer / sheet, nhấn giữ (sortable, nhãn tooltip), cách thay thế không
  kéo cho cropper (owner chốt: cắt ảnh là thao tác kéo thiết yếu, WCAG 2.5.7), xem trước ảnh bên cạnh khi vuốt, roving
  tabindex filmstrip, đổi `touch-action` slider, `touch-action: manipulation` diện rộng, haptics.
