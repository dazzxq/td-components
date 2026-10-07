# Chuẩn cảm ứng — luật nội bộ (v0.36.2)

> **Bắt buộc cho mọi UI mới**, cùng với [minimal surfaces](liquid-glass.md). Quyết định: [ADR 0019](../decisions/0019-touch-standard.md).
> Hướng dẫn cho site: [guides/touch.md](../../guides/touch.md). Mỗi luật dưới đây có cách kiểm tự động (cột "Kiểm").

## Luật

| # | Luật | Kiểm |
|---|---|---|
| 1 | `:hover` **trang trí** chỉ nằm trong `@media (hover: hover) and (pointer: fine) { … }` (đúng chuỗi này; được lồng trong `@layer`, `@supports`, `@media (forced-colors: active)`). Luật trả lại kiểu cũ (`[aria-disabled]:hover`, `[data-selected]:hover`) đi theo vào cổng. | `checkHoverGate` (`scripts/css-touch.mjs`) trong `npm run check:css` |
| 2 | Không gộp `:hover` vào `:is()` / `:where()`: phần focus / trạng thái khác phải đứng ngoài cổng. | cùng lint |
| 3 | Trạng thái **mang thông tin** (selected, expanded, `aria-current`, lỗi, focus, disabled, đang kéo, `data-state`) không bao giờ phụ thuộc hover. Thứ cảm ứng cần thì hiện bằng `(hover: none), (pointer: coarse)` (vd. tick media-grid). | review + lane touch "hover không dính" |
| 4 | Mọi control tương tác (selector gốc của một luật `:hover` hoặc của `cursor: pointer`) có ít nhất một luật `<gốc>:is(:active, [data-td-pressed])` **ngoài** cổng hover. `:active` trong cổng là lỗi. | `checkPressed` trong `check:css`; `src/styles/css-touch.test.js` |
| 5 | Hình nhấn **chỉ đổi màu**: token pressed (bảng dưới), `transition-duration: 0s`; không scale / dịch / bóng mới. Phần tử có hình nhấn đặt `-webkit-tap-highlight-color: transparent`. `forced-colors`: `outline: 2px solid Highlight`. | review; contrast gate (`v0362:*`) |
| 6 | Selector gốc của mọi luật nhấn = `PRESS_TARGETS` trong `src/utils/press.js` (cùng thứ tự sắp xếp). Thêm control → thêm luật CSS → cập nhật `PRESS_TARGETS` (test báo diff). | `css-touch.test.js` |
| 7 | `ensurePressStates()` là cơ chế duy nhất đặt `data-td-pressed`; component không tự đặt. Overlay mở trước khi có element nào connect phải gọi nó (đã có: `openDialogLayer`, lightbox, toast). | `press.test.js`, lane touch |
| 8 | Ngưỡng kéo đọc từ `dragSlop(e.pointerType)` (`src/utils/gesture.js`): chuột 4 / bút 8 / chạm 10 px. Không đọc từ media query. | `gesture.test.js`, lane touch (sortable) |
| 9 | `touch-action` chỉ theo bảng dưới. `none` mới = sửa bảng + test + trang này. Không bao giờ trên `html` / `body`; không `manipulation` diện rộng; không viewport meta chặn zoom. | `src/styles/td-touch-action.test.js` |
| 10 | Tooltip không bật khi chạm (pointerenter touch và focus do cú chạm). Không đặt thông tin bắt buộc trong tooltip. | `td-v0362-tooltip-touch.browser-test.js`, responsive gate `tooltip-tap` |
| 11 | Dialog có ô gõ chữ mở qua `openDialogLayer({ viewport: { root, scroller } })`. Loại trừ phải có lý do trong `dialog-layer-viewport.test.js`. Con của gốc lớp phủ dùng `100%`, không `100dvh`. | `dialog-layer-viewport.test.js`, `td-v0362-dialog-keyboard.engines.browser-test.js` |
| 12 | Kit không gọi `focus()` / `scrollIntoView()` để né bàn phím; chỉ cuộn `scrollTop` của thân dialog. Không can thiệp khi pinch zoom (`visualViewport.scale ≠ 1`). | engines test bàn phím |
| 13 | Cử chỉ nhiều trạng thái (vuốt, kéo) có **một** trạng thái settle và **một** hàm dọn; điều hướng / đóng / mở mới trong lúc settle thắng và dọn sạch. | lane touch (race lightbox) |
| 14 | Reduced motion: không theo ngón, không lò xo / trượt; kết quả (chuyển ảnh, thả) vẫn y hệt. | lane touch |
| 15 | Không haptics, không chặn cuộn trang, không `preventDefault` trên listener toàn cục. | review; mọi listener của `press.js` là `passive` (test) |

## Token nhấn

Khai báo ở `tokens.css` / `theme-dark.css` (chung, nút), `action-button.css`, `lightbox.css`, `form-validation.css`, `chip-input.css`.

| Token | Light | Dark | Dùng cho |
|---|---|---|---|
| `--td-color-pressed` | `rgb(0 0 0 / 12%)` | `rgb(255 255 255 / 14%)` | nút icon, tab, trang, card, scroll-top (lớp phủ `background-image`); v0.49.0: lựa chọn của `td-choice-group` (chữ phụ / ghi chú lấy màu chữ đầy đủ khi nhấn: chữ muted trên 12 % đen chỉ 4.0:1) và nút − / + của stepper |
| `--td-option-pressed-bg` | `var(--td-color-pressed)` | — | hàng option / menu / tree / bánh xe datetime |
| `--td-btn-primary-pressed` | `#52525b` | `#a1a1aa` | primary (đen sáng thêm một bậc; dark tối thêm) |
| `--td-btn-secondary-pressed` | `--td-gray-300` | `#45454b` | |
| `--td-btn-{success,danger,info}-pressed` | `#14532d` / `#991b1b` / `#1e40af` | như light | chữ trắng ≥ 8:1 |
| `--td-btn-warning-pressed` | `#cc6d05` | như light | chữ tối 4.86:1 (amber-700 chỉ 3.5) |
| `--td-btn-ghost-pressed` | `var(--td-color-pressed)` | — | ghost (chữ = `--td-btn-ghost-hover-fg`) |
| `--td-action-btn-standard-pressed-bg` | `var(--td-color-pressed)` | — | |
| `--td-action-btn-warning-pressed-bg` / `-fg` | `#fef3c7` / `#92400e` | `rgb(245 158 11 / 26%)` / như fg thường | không nền amber nào giữ `#b45309` ≥ 4.7, nên icon đậm thêm một bậc |
| `--td-action-btn-danger-pressed-bg` | `#fdd5d5` | `rgb(220 38 38 / 30%)` | |
| `--td-form-summary-pressed-bg` | `var(--td-color-pressed)` | `rgb(0 0 0 / 40%)` (0.42.1) | link trong khung tóm tắt lỗi — dark làm **tối** nền tint: không lớp trắng nào giữ chữ lỗi ≥ 4.7 (14 % = 3.30), đen 40 % = 6.34 |
| `--td-chip-remove-hover` (nhấn = hai lớp) | `var(--td-color-hover-strong)` | `rgb(255 255 255 / 13%)` (0.42.1, trước 16 %) | nút × của chip-input: chữ chip 4.88 khi nhấn (trước 4.22) |
| `--td-dropzone-bg-pressed` | `#f4f4f5` (+ viền `--td-dropzone-border-active`; gray-100 chỉ 4.64 với dòng phụ) | `#2c2c30` | vùng dropzone |
| `--td-toast-{success,error,warning,info}-pressed-bg` | `--td-btn-{success,danger,warning,info}-pressed` | như light | toast (chữ ≥ 4.7) |
| `--td-lb-btn-pressed` / `--td-lb-disc-bg-pressed` | `rgb(255 255 255 / 24%)` / `rgb(64 64 70 / 94%)` | — | nút / đĩa lightbox |

Nút `--custom` / alias `-tint`: nền tối 16 % (`color-mix`), trình duyệt không có `color-mix()` giữ nền hover / nghỉ.

## Ngoại lệ `active-exempt` đã duyệt (17)

`.td-field__control`, `.td-chip-input__box`, `.td-tree-select__control`, `.td-number__box`, 0.55.0: `.td-field__box` (hộp
tiền tố / hậu tố của `td-input-field` — ô nhập: focus ring là phản hồi; nút trong `[slot]` là của site)
· `td-dropdown > .td-dropdown__native` (0.51.1: cùng luật với `td-dropdown:not(:defined) > select`), `.td-multiselect__native`, `td-chip-input > .td-chip-input__native`,
`.td-tree-select__native` (select native, UA tự vẽ) · `.td-slider__input` (range native, thumb theo ngón) · 0.48.0: `.td-color__box` (ô nhập màu: focus ring là phản hồi), `.td-color-panel__hue` (range native sắc độ) ·
`.td-table .td-table__row` (hàng không kích hoạt được) · `.td-lightbox__grab` (tay nắm sheet, sheet theo ngón) ·
`.td-media-grid__item` + luật trả lại `[data-selected] … --mark` (opener / tick mang hình nhấn) · tay nắm
`.td-tree__toggle` của mục disabled (hàng mang hình nhấn). `hover-exempt`: **0**.

Không miễn (review vòng 1, ISSUE-1): **vùng `.td-dropzone__zone`** (chạm = mở chọn file) có hình nhấn
`--td-dropzone-bg-pressed` + viền accent, **trừ** khi dropzone `data-disabled` hoặc `data-state="dragover"`; **toast**
(chạm = đóng) có hình nhấn `--td-toast-{success,error,warning,info}-pressed-bg` (= nền nút ngữ nghĩa nhấn). Luật nhấn
được phép chặn bằng trạng thái của tổ tiên (`.td-dropzone:not([data-disabled]) .td-dropzone__zone:active`): lint chuẩn hoá
trạng thái ở mọi compound và coi luật có tổ tiên là phủ control.

## Bảng `touch-action`

| Selector | Giá trị | Lý do |
|---|---|---|
| `.td-cropper__stage` | `none` | kéo / pinch khung cắt trực tiếp (WCAG 2.5.7 "essential"; bàn phím thay thế) |
| `.td-slider__input` | `none` | range native: chạm để chọn + kéo thumb. Vuốt dọc bắt đầu trên slider **không** cuộn trang |
| `.td-sortable__handle`, `td-sortable button[data-td-sort-handle]`, `td-repeater button[data-td-sort-handle]` | `none` | chỉ tay nắm; thân item cuộn bình thường |
| `.td-lightbox__stage`, `.td-lightbox__nav > .td-lightbox__btn` | `none` | pinch / pan / vuốt bằng Pointer Events |
| `.td-lightbox[data-nav="rail"] .td-lightbox__rail > .td-lightbox__btn` | `manipulation` | nút thanh đáy (v0.36.0) |
| `.td-lightbox__filmstrip` | `pan-x` | dải thumb cuộn ngang native |
| `.td-color-panel__area` (0.48.0) | `none` | kéo 2 chiều trực tiếp (bão hoà × độ sáng; WCAG 2.5.7: bàn phím, ô chữ, preset là lối thay thế). Chỉ vùng 10rem × 17.5rem; phần còn lại của popup cuộn bình thường |
| `.td-color-panel__hue` (0.48.0) | `none` | range native như `.td-slider__input` |
| `.td-number__step` | `manipulation` | nút − / + của `td-number-input stepper` (v0.49.0): bấm liên tục là thao tác chính — không phóng to khi chạm nhanh hai lần trên iOS |

**Không có dòng cho `td-carousel` (v0.50.0, ADR 0024)** — có chủ đích: viewport của carousel giữ `touch-action: auto`
(cuộn native + scroll-snap; vuốt dọc bắt đầu trên dải cuộn trang). Không listener pointer / touch / wheel; nút `.td-carousel__btn`
và chấm `.td-carousel__dot` có luật nhấn (`--td-btn-secondary-pressed` / `--td-color-pressed`) và nằm trong `PRESS_TARGETS`.
Lane touch: vuốt ngang cuộn dải, vuốt dọc cuộn trang, chạm "tiếp" đi đúng một trang, hình nhấn nút / chấm.

## Ngưỡng và cử chỉ

- `DRAG_SLOP` chuột 4 / bút 8 / chạm 10 px; `axisLock` đường chéo 45° → `y` (cuộn trang thắng).
- Lightbox: `MOVE_SLOP 8` (khoá trục), vuốt chốt > 25 % bề rộng cột nhìn thấy (`viewRect()`) hoặc flick > 0.3 px/ms
  (mẫu 100 ms cuối) qua slop và cùng chiều; dây chun lực cản 0.35, trần 20 % bề rộng; trượt ra `--td-lb-dur-fast`, lò xo
  `--td-lb-dur` + `--td-lb-spring`; hẹn giờ cố định = thời lượng + 50 ms. Bắt đầu trong 24 px mép = của trình duyệt.
- Cropper `TAP_PX 4`; sortable / repeater / media-grid `dragSlop()`.
- `press.js` gỡ `data-td-pressed` khi ngón di quá `dragSlop()` (6 px giữ, 12 px gỡ với touch).

## Bàn phím ảo

`keyboardBox()` (null khi không có `visualViewport`, khi `|scale − 1| > 0.01`, khi vv phủ đủ layout viewport ±1 px — kể cả
site đặt `interactive-widget=resizes-content`) → `--td-vv-top` / `--td-vv-height` trên gốc (ghi trong rAF, khi đổi ≥ 1 px);
`revealDelta()` cuộn thân dialog tới khung `.td-field` (nhãn + gợi ý + lỗi; cao quá thì chính control, ưu tiên mép trên).
Caller: `td-modal` (`.td-modal__body`), `td-drawer` (`.td-drawer__body`), media picker / upload / filters
(`nearestScroller(root)`). Loại trừ: `crop-dialog` (không có ô gõ chữ).

## Kiểm thử

| Lệnh | Gì |
|---|---|
| `npm run check:css` | lint hover + nhấn |
| `node --test src/styles/css-touch.test.js src/styles/td-touch-action.test.js src/utils/{gesture,press,keyboard-viewport}.test.js src/feedback/dialog-layer-viewport.test.js` | luật thuần |
| `npm run test:contrast` | cặp chữ / nền nhấn (`v0362:*`) |
| `npm run test:touch` | Chromium 390×844 + CDP, WebKit iPhone 13 (≈ 30 s) |
| [release-touch-checklist.md](../release-touch-checklist.md) | iPhone thật, ~10 phút mỗi bản đụng touch |
