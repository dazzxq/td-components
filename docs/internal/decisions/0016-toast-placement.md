# ADR 0016 — Toast: 6 vị trí logic, một portal root, giữ token neo cũ như "stack legacy"

Trạng thái: chấp nhận (2026-10-05). Nguồn: plan [v0.36.0-polish](../plans/v0.36.0-polish.md) mục F, QĐ 28–40
(đồng thuận Claude × Codex qua `/codex-think-about`, trạng thái CONSENSUS); yêu cầu owner mục 8 ("toast chọn vị trí").

## Bối cảnh

Tới v0.35 toast chỉ có **một** chồng `#td-toast-container.td-toasts`, định vị bằng 6 token neo
`--td-toast-top/-bottom/-inline-start/-inline-end/-shift/-align` (mặc định trên-phải; 135 / dwp chuyển giữa-dưới bằng
token). Owner cần chọn vị trí **theo lần gọi** (ví dụ lỗi ở dưới, thông báo lưu ở trên) và **toàn cục bằng JS** (site PHP
không muốn viết CSS). Một chồng duy nhất không chứa được hai vị trí cùng lúc; token CSS thì không đổi được theo lần gọi.

Các phương án đã cân nhắc: (a) toạ độ / object `{top, left}` / offset theo lần gọi — API phình, khó RTL, khó test;
(b) mỗi vị trí một container riêng có `id` public — phá hợp đồng `#td-toast-container` (loading inert, layer, site
CSS); (c) giới hạn / clear / z-index theo vị trí — nhân trạng thái, FIFO khó đoán. Chọn: 6 tên logic, một root, trạng
thái toàn cục giữ nguyên.

## Quyết định

1. **Sáu tên logic** `top-start | top-center | top-end | bottom-start | bottom-center | bottom-end`
   (`TdToast.PLACEMENTS`, đóng băng). Không `left/right`, không alias vật lý, không toạ độ, không offset theo lần gọi,
   không `containerId` public, không giới hạn / clear / z-index theo vị trí.
2. **API**: `TdToast.configure({ placement })` (toàn cục; `null` = bỏ) + tham số thứ ba của `show` / `success` /
   `error` / `warning` / `info` = `number | { duration?, placement? }` (không tham số thứ tư; mọi call site cũ y nguyên).
   Giá trị sai → cảnh báo một lần / giá trị, rơi xuống bậc kế.
3. **Ưu tiên**: lần gọi > `configure()` > **token neo cũ** > mặc định `top-end`. "Token cũ" = computed 6 token neo trên
   `:root` lúc `show()` **khác giá trị ship** (`5rem`, `auto`, `auto`, `1rem`, `0%`, `flex-end`) ⇒ toast không có placement
   vào **stack legacy** (định vị + thứ tự append y hệt v0.35). Trùng giá trị ship ⇒ stack tên `top-end` (cùng chỗ) — không
   bao giờ có hai stack chồng nhau ở góc phải.
4. **Snapshot**: placement resolve đồng bộ trong `show()` (trước hàng đợi 50 ms), lưu trên request; `configure()` sau đó
   không dời toast đang chờ / đang hiện.
5. **DOM**: một portal root `#td-toast-container.td-toast-root` (fixed, `inset: 0`, `pointer-events: none`,
   `z-index: var(--td-z-toast)`) > hai lane `.td-toast-lane[data-edge="top|bottom"]` > stack lười
   `.td-toasts[data-placement]` + stack legacy `.td-toasts` (con trực tiếp của root). `.td-toasts` vẫn là stack (CSS site
   nhắm `.td-toasts` vẫn trúng); id root giữ. Một custom property CSSOM `--_td-toast-seq` trên mỗi toast (thứ tự lane xs).
6. **Toàn cục giữ nguyên**: `MAX_VISIBLE` cho cả hệ thống, FIFO theo số thứ tự toàn cục, `clear()`, **một** đăng ký layer
   (root, `includeInTrap`), pause (hover / focus ở bất kỳ stack → dừng tất cả), trả focus theo thứ tự toàn cục.
7. **Thứ tự**: mới nhất sát mép — stack `top-*` `prepend`, `bottom-*` `append`; stack legacy giữ `append`.
8. **Chuyển động** theo mép của stack (`*-start` / `*-end` trượt ngang, `top-center` / `bottom-center` trượt dọc), RTL đảo
   trục inline (luật `:dir(rtl)` riêng), reduced motion → chỉ fade; toast bị đẩy ra thoát theo hướng stack của nó.
   Cơ chế: stack đặt custom property kế thừa `--_td-toast-from`; toast đọc nó (fallback = trượt từ inline end như cũ).
9. **< 480**: mỗi mép một lane rộng hết (fixed), stack bên trong `display: contents`, toast xếp `order: --_td-toast-seq`
   (lane trên `column-reverse` → mới nhất trên cùng), chuyển động dọc. **`short` (≤ 500 cao)**: chỉ 2 toast mới nhất toàn
   cục hiện — JS đánh `data-td-toast-older`, thay `:nth-last-child` (sai khi nhiều stack).
10. **Safe-area / offset**: token mới `--td-toast-offset-top` (`5rem`), `-bottom` (`1rem`), `-inline` (`1rem`), mép block
    `max(offset, inset + 8px)`, mép inline cộng inset bên đó, `*-center` = `left/right: gutter + inset` + `align-items:
    center` (không `translateX(-50%)`).
11. **A11y**: không live region mới; mỗi toast giữ `role` + chèn chữ trễ một frame. PHP / SSR: không (API client tĩnh).

## Hệ quả

- (+) Site chọn vị trí theo lần gọi hoặc một dòng `configure()`; site đang dùng token neo chạy y nguyên (stack legacy).
- (+) Hàm thuần `src/feedback/toast-placement.js` (`resolvePlacement`, `olderSet`, `toastOptions`) test bằng node.
- (−) **Breaking DOM**: toast không còn là con trực tiếp của `#td-toast-container` (root > lane > stack > toast); root
  không còn class `.td-toasts`. Ghi `upgrading/class-map.md` + `breaking-changes.md`.
- (−) **Đổi hình** site mặc định: toast mới nằm **trên cùng** của chồng trên-phải (trước: dưới cùng).
- Non-goal: toạ độ / offset theo lần gọi, giới hạn theo vị trí, né drawer / FAB, bỏ `aria-live` thừa của toast lỗi
  (audit riêng).
