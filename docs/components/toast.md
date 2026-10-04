[Tài liệu](../README.md) › [Components](README.md) › Toast

# Toast — `TdToast`

`TdToast` hiện thông báo ngắn ở góc màn hình rồi tự biến mất: "Đã lưu", "Không kết nối được", … Người dùng không cần
làm gì và vẫn thao tác được với trang.

Dùng toast cho phản hồi không bắt buộc đọc. Khi người dùng **phải** đọc / xác nhận (lỗi chặn luồng, thao tác nguy
hiểm) hãy dùng [modal](modal.md) (`TdModal.error`, `TdModal.confirm`). Lỗi gắn với một ô nhập nên hiện ngay tại ô đó
(xem [form validation](form-validation.md)), không phải toast.

| | |
|---|---|
| Import | `import { TdToast } from '@dazzxq/td-components/toast'` |
| Loại | API JS tĩnh (không phải custom element) |
| Form-associated | không |
| Từ phiên bản | 0.1.0 (token-native từ 0.9.0; nền trung tính + icon màu 0.20.0 → **viên thuốc pastel kiểu dcms, không icon từ 0.21.0**) |

Cần `td.css`. Không cần khởi tạo: vùng chứa toast được tạo ở lần gọi đầu tiên.

## Ví dụ nhanh

```js
import { TdToast } from '@dazzxq/td-components/toast';

TdToast.success('Đã lưu bài viết');
TdToast.error('Không lưu được, thử lại sau');
```

## Cách dùng

### Bốn loại

```js
TdToast.success('Đã gửi email');          // 4 giây
TdToast.info('Có 3 bình luận mới');       // 4 giây
TdToast.warning('Sắp hết dung lượng');    // 4 giây
TdToast.error('Mất kết nối');             // 5 giây (lỗi mặc định lâu hơn)
```

### Đổi thời gian hiển thị, hoặc toast "dính" (sticky)

```js
TdToast.success('Đã lưu', 2000);                      // 2 giây
TdToast.show('Đang đồng bộ ở nền…', 'info', 8000);    // show(message, type, duration)
TdToast.error('Phiên đăng nhập đã hết hạn', 0);       // 0 = không tự tắt; người dùng click vào toast (bàn phím: Tab tới nút Đóng)
```

### Sau một thao tác async

```js
try {
  await savePost();
  TdToast.success('Đã lưu');
} catch (err) {
  TdToast.error(`Lỗi: ${err.message}`);   // message là text, không lo chèn HTML
}
```

### Nhiều toast cùng lúc

Gọi liên tiếp nhiều lần là an toàn: toast được xếp hàng và hiện cách nhau 80ms (tránh giật), tối đa
`TdToast.MAX_VISIBLE` (mặc định `5`) cái cùng lúc; cái cũ nhất bị đẩy ra trước (FIFO).

```js
TdToast.MAX_VISIBLE = 3;   // đặt một lần khi khởi động site
```

### Đóng toast bằng code

Mọi lần gọi trả về một **handle** `{ close() }`. Handle đại diện cho **yêu cầu**, nên gọi `close()` lúc nào cũng được:
toast còn trong hàng đợi → bị bỏ (không bao giờ hiện); đã hiện → đóng như khi bấm vào toast. Gọi lại `close()` không làm gì.

```js
const saving = TdToast.info('Đang đồng bộ…', 0);   // sticky
await sync();
saving.close();
TdToast.success('Đã đồng bộ');

TdToast.clear();   // bỏ mọi toast đang chờ và đóng mọi toast đang hiện (vd. khi chuyển trang trong SPA)
```

### Đổi nhãn (nút Đóng + tiền tố loại cho trình đọc màn hình)

```js
// đặt một lần khi khởi động; áp dụng cho toast tạo sau đó
TdToast.labels.close = 'Close';   // aria-label của nút Đóng (ẩn, chỉ hiện khi Tab tới), mặc định 'Đóng'
TdToast.labels.types = {          // tiền tố đọc trước nội dung, chỉ dành cho trình đọc màn hình (0.21.0)
  success: 'Success:', error: 'Error:', warning: 'Warning:', info: 'Info:',
};
TdToast.labels.types.info = '';   // chuỗi rỗng = bỏ tiền tố cho loại đó; loại không khai báo → mặc định tiếng Việt
```

Mặc định: `success` → `"Thành công:"`, `error` → `"Lỗi:"`, `warning` → `"Cảnh báo:"`, `info` → `"Thông tin:"`.
Vì toast không còn icon, tiền tố này (cùng `role="alert"` cho lỗi) là thứ giúp người không nhìn được màu biết loại
thông báo — đừng tắt nó nếu không có cách báo loại khác.

### Đổi vị trí (chỉ bằng token CSS)

Mặc định toast ở góc **trên bên phải**. Ví dụ đưa xuống **giữa phía dưới** (kiểu 135 / dwp):

```css
:root {
  --td-toast-top: auto;
  --td-toast-bottom: 1.5rem;
  --td-toast-inline-end: auto;
  --td-toast-inline-start: 50%;
  --td-toast-shift: -50%;
  --td-toast-align: center;
}
```

## Property & method

| Chữ ký | Mô tả |
|---|---|
| `TdToast.show(message, type = 'info', duration = 4000)` | Hiện toast. `message`: text (giá trị rỗng / falsy như `''`, `null`, `0` → không hiện gì). `type`: `'success' \| 'error' \| 'warning' \| 'info'` (giá trị lạ → `info`). `duration`: mili-giây; `0` hoặc âm = sticky. Trả về handle `{ close() }` (từ 0.16.0; trước đó `undefined`). |
| `TdToast.success(message, duration = 4000)` | Rút gọn cho `show(message, 'success', duration)`; trả handle. |
| `TdToast.error(message, duration = 5000)` | Rút gọn cho `show(message, 'error', duration)`; trả handle. |
| `TdToast.warning(message, duration = 4000)` | Rút gọn cho `show(message, 'warning', duration)`; trả handle. |
| `TdToast.info(message, duration = 4000)` | Rút gọn cho `show(message, 'info', duration)`; trả handle. |
| `handle.close()` | (0.16.0) Còn trong hàng đợi 50ms → gỡ khỏi hàng đợi; đang chờ lượt 80ms → huỷ lượt đó; đã hiện → đóng như khi bấm vào toast. Gọi lại → không làm gì. Với `message` rỗng handle vẫn có nhưng không làm gì. |
| `TdToast.clear()` | (0.16.0) Xoá hàng đợi, huỷ mọi lượt đang chờ, đóng mọi toast đang hiện. |
| `TdToast.labels` | (0.16.0) `{ close: 'Đóng', types: { success, error, warning, info } }` — `close`: `aria-label` của nút Đóng; `types` (0.21.0): tiền tố loại cho trình đọc màn hình (`''` = bỏ). Áp dụng cho toast tạo sau khi đổi. |
| `TdToast.MAX_VISIBLE` | `5`. Số toast hiện cùng lúc tối đa; vượt quá thì cái cũ nhất bị đóng. |
| `TdToast.container` | Phần tử `#td-toast-container` (hoặc `null` trước lần gọi đầu). Chỉ đọc. |
| `TdToast.ensureContainer()` | Tạo vùng chứa nếu chưa có / đã bị gỡ khỏi DOM. Thường không cần gọi tay. |
| `TdToast.getTheme(type)` | Trả `{ type, icon }` đã chuẩn hoá (loại lạ → `info`). Từ 0.21.0 `icon` chỉ còn để tương thích (toast không vẽ icon). |
| `TdToast.getToastZIndex()` | **Lỗi thời.** Trả z-index đã tính của vùng chứa (từ token `--td-z-toast`). |
| `TdToast.TOAST_Z_INDEX_BASE` | **Lỗi thời.** `500`, chỉ còn để tương thích; z-index thật đến từ token `--td-z-toast`. |

## Hành vi

- **Hẹn giờ tạm dừng** (WCAG 2.2.1) khi: con trỏ đang ở trên vùng toast, focus đang ở trong vùng toast, hoặc tab trình
  duyệt bị ẩn. Thời gian còn lại được giữ và chạy tiếp khi hết điều kiện. Toast đang tạm dừng có `[data-paused]`.
- **Đóng (kiểu dcms, 0.21.0):** click vào **bất kỳ đâu** trên toast là đóng; không có nút X hiển thị. Nút Đóng
  (`aria-label` = `TdToast.labels.close`, mặc định `"Đóng"`) vẫn nằm trong DOM của mọi toast (kể cả sticky) nhưng
  ẩn bằng mắt cho tới khi được focus **bằng bàn phím** (`:focus-visible`) — nên toast sticky vẫn đóng được bằng Tab +
  Enter. Code đóng bằng `handle.close()` / `TdToast.clear()`.
- **Thời lượng:** `error` 5 giây, các loại khác 4 giây; `duration ≤ 0` → không tự tắt.
- **Hàng đợi:** lần gọi đầu được gom trong 50ms, sau đó mỗi toast hiện cách nhau 80ms. Vì vậy toast không xuất hiện
  "ngay trong cùng dòng code" — đừng truy vấn DOM toast ngay sau khi gọi `show()`.
- **Trên modal / loading:** vùng toast không bao giờ bị `inert` bởi [modal](modal.md) hay [loading](loading.md); nút
  Đóng của toast nằm trong vòng Tab của modal. Toast giữ nguyên bề mặt của nó khi có modal đang mở.
- **Lớp:** `--td-z-toast` (500) — trên modal (400) và loading (480), dưới [tooltip](tooltip.md) (510).

### Responsive (0.34.0)

- Điện thoại (< 480px): chồng toast thành **một cột rộng hết** (trừ lề `--td-gutter`), toast cùng bề rộng, bỏ qua
  `--td-toast-inline-*` / `--td-toast-align`.
- Màn hình thấp (≤ 500px — điện thoại xoay ngang): chỉ **hai toast mới nhất** hiện (toast cũ vẫn trong DOM, đã được đọc).
- Vùng an toàn (tai thỏ, thanh home): `top: max(--td-toast-top, safe-area-inset-top + 8px)` (tương tự `bottom`) — đặt
  token `0px` vẫn cách mép ≥ 8px; token `auto` thì giữ `auto`. Ở **mọi** độ rộng, cạnh neo (`--td-toast-inline-start` /
  `-end`) cộng thêm `safe-area-inset-left` / `-right` (RTL đảo), `max-width` trừ cả hai.

## Tuỳ biến giao diện

Từ 0.21.0 toast theo kiểu **dcms**: viên thuốc gọn (bo 12px, padding 12×16, chữ 14px), **nền pastel theo loại + chữ
đậm cùng tông + viền mảnh cùng tông**, một bóng mềm (`--td-glass-shadow`), **đặc — không blur**, không icon, không
nút đóng hiển thị. Khác dcms một điểm có chủ ý: dcms dùng nền màu đậm + chữ trắng, td dùng pastel cho hợp bộ màu
chung — muốn giống hẳn dcms chỉ cần đổi token (ví dụ bên dưới). Tương phản chữ ≥ 4.7:1 được gate kiểm ở cả hai theme.

Màu mỗi loại đọc token pastel dùng chung của kit (`--td-pastel-{success,danger,warning,info}-{bg,fg,border}`, xem
[theming](../customization/theming.md)), nên đổi pastel ở một chỗ là nút ngữ nghĩa và toast cùng đổi. Muốn chỉ đổi
toast thì đặt token `--td-toast-*` bên dưới.

| Token | Mặc định (sáng) | Tác dụng |
|---|---|---|
| `--td-toast-top` | `5rem` | Khoảng cách từ đỉnh màn hình (`auto` để bỏ). |
| `--td-toast-bottom` | `auto` | Khoảng cách từ đáy màn hình. |
| `--td-toast-inline-end` | `1rem` | Khoảng cách từ mép phải (theo chiều viết). |
| `--td-toast-inline-start` | `auto` | Khoảng cách từ mép trái. |
| `--td-toast-shift` | `0%` | Dịch ngang vùng toast (`-50%` để căn giữa cùng `inline-start: 50%`). |
| `--td-toast-align` | `flex-end` | Căn các toast trong cột (`flex-start`, `center`, `flex-end`). |
| `--td-toast-gap` | `var(--td-space-xs)` | Khoảng cách giữa các toast. |
| `--td-toast-max-w` | `28rem` | Bề rộng tối đa một toast. |
| `--td-toast-radius` | `12px` | Bo góc (0.20.0: `22px`). |
| `--td-toast-pad-y` / `--td-toast-pad-x` | `0.75rem` / `1rem` | Padding dọc / ngang. |
| `--td-toast-font-size` | `var(--td-text-sm)` (14px) | Cỡ chữ. |
| `--td-toast-shadow` | `var(--td-glass-shadow)` | Bóng (tương phản cao / forced colors → không bóng). |
| `--td-toast-success-bg` / `-fg` / `-border` | `var(--td-pastel-success-bg/-fg/-border)` (`#dcfce7` / `#14532d` / `#bbf7d0`) | Màu toast thành công. |
| `--td-toast-error-bg` / `-fg` / `-border` | `var(--td-pastel-danger-…)` (`#fee2e2` / `#7f1d1d` / `#fecaca`) | Màu toast lỗi. |
| `--td-toast-warning-bg` / `-fg` / `-border` | `var(--td-pastel-warning-…)` (`#fef3c7` / `#78350f` / `#fde68a`) | Màu toast cảnh báo. |
| `--td-toast-info-bg` / `-fg` / `-border` | `var(--td-pastel-info-…)` (`#dbeafe` / `#1e3a8a` / `#bfdbfe`) | Màu toast thông tin (cũng là loại lạ). |
| `--td-toast-close-hover` | `rgb(0 0 0 / 8%)` | Nền nút Đóng khi hover (lúc nó đang hiện). |
| `--td-toast-enter-shift` | `1rem` | Độ trượt ngang khi hiện / ẩn. |
| `--td-toast-enter-dur` / `--td-toast-exit-dur` | `200ms` / `180ms` | Thời lượng hiện / ẩn. Đặt `-exit-dur` dài hơn thì kit chờ hết chuyển động ẩn (đọc từ computed style) rồi mới gỡ toast. |
| `--td-toast-fg`, `--td-toast-close-fg`, `--td-toast-glass-bg`, `--td-toast-{type}-icon`, `--td-toast-*-wash` | — | **Deprecated** (nền trung tính + icon của 0.20.0), vẫn khai báo nhưng không còn tác dụng. |

Lưu ý: `--td-toast-error-border` từng bị đánh dấu deprecated ở 0.20.0; từ 0.21.0 nó **có tác dụng trở lại** (viền
toast lỗi, mặc định pastel). Site nào còn đặt `--td-toast-error-border` từ thời 0.19 nên xem lại.

Ở dark theme (`<html data-td-theme="dark">`) màu pastel tự đổi sang bản tối (nền là màu trạng thái trộn sẵn trên nền
tối — vẫn **đặc**, chữ sáng). Nếu bạn override màu, hãy override cho cả hai theme và tự kiểm tra tương phản.

```css
/* Giống hẳn dcms: nền đậm, chữ trắng */
:root {
  --td-toast-success-bg: #22c55e; --td-toast-success-fg: #fff; --td-toast-success-border: transparent;
  --td-toast-error-bg: #ef4444;   --td-toast-error-fg: #fff;   --td-toast-error-border: transparent;
}
```

Chuyển động: hiện = mờ dần + trượt từ phải vào (`translateX(1rem) → 0`, 200ms ease-out); ẩn = ngược lại trong 180ms.
`prefers-reduced-motion: reduce` → chỉ đổi độ mờ. Tương phản cao (`prefers-contrast: more`) → viền theo màu chữ, bỏ
bóng; forced colors → `Canvas` / `CanvasText`, viền thật. `data-td-glass="off"` không còn ảnh hưởng toast (vốn đã đặc).

## Cấu trúc DOM & class

Đổi từ 0.21.0: **bỏ** `span.td-toast__icon` và hai class `td-glass-surface td-glass-surface--strong`; **thêm**
`span.td-toast__type.td-sr-only` (tiền tố loại cho trình đọc màn hình). Site nào query `.td-toast__icon` cần bỏ.

```html
<div id="td-toast-container" class="td-toasts">
  <div class="td-toast td-toast--success" role="status" aria-live="polite" data-state="open">
    <span class="td-toast__type td-sr-only">Thành công: </span>
    <span class="td-toast__message">Đã lưu</span>
    <button type="button" class="td-toast__close" aria-label="Đóng"><svg class="td-icon td-icon--s" data-icon="close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>
  </div>
</div>
```

| Class / attribute | Ý nghĩa |
|---|---|
| `.td-toasts` (`#td-toast-container`) | Vùng chứa cố định, gắn vào `<body>` ở lần gọi đầu. `pointer-events: none` nên trang quanh nó vẫn click được. |
| `.td-toast--{success\|error\|warning\|info}` | Loại (quyết định màu pastel). |
| `.td-toast__type.td-sr-only` | Tiền tố loại (`TdToast.labels.types`), chỉ trình đọc màn hình thấy; điền cùng lúc với nội dung. |
| `.td-toast__message` | Nội dung (text). |
| `.td-toast__close` | Nút Đóng: trong DOM, focus được, chỉ hiện khi `:focus-visible`. |
| `[data-state="entering\|open\|closing"]` | Vòng đời; phần tử bị gỡ sau khi chuyển động ẩn của `closing` chạy xong (tối thiểu 200ms; dài hơn nếu `--td-toast-exit-dur` dài hơn). |
| `[data-paused]` | Hẹn giờ đang tạm dừng. |
| `role="status"` + `aria-live="polite"` | Mọi loại trừ `error`. |
| `role="alert"` + `aria-live="assertive"` | Chỉ `error`. |

## Bàn phím & trợ năng

- Toast **không lấy focus** khi hiện — người dùng không bị gián đoạn.
- Trình đọc màn hình: `success` / `info` / `warning` được đọc lịch sự (không ngắt lời); chỉ `error` ngắt lời. Mỗi toast
  được đọc kèm tiền tố loại ("Thành công: Đã lưu") — màu không bao giờ là tín hiệu duy nhất. Chữ (tiền tố + nội dung)
  được điền vào toast **một khung hình sau** khi toast được chèn, để vùng live region tồn tại trước khi nội dung đổi —
  nhờ vậy lời thông báo được đọc ổn định.
- Nút Đóng focus được bằng Tab (khi đó nó hiện ra, có vòng focus), bấm Enter / Space để đóng. Khi toast đang được focus
  bị đóng, focus chuyển tới nút Đóng của toast kế tiếp; nếu là toast cuối cùng, focus về lại nơi nó đến trước khi vào
  vùng toast. Chuột / chạm: bấm vào toast.
- Khi có modal mở, nút Đóng của toast vẫn nằm trong vòng Tab của modal.
- Trên thiết bị cảm ứng nút Đóng (khi hiện) có vùng chạm tối thiểu `--td-touch-min`. Forced colors: toast và nút Đóng
  dùng màu hệ thống.

## Bảo mật

`message` **luôn** được render dạng text (`textContent`), không bao giờ là HTML — đưa trực tiếp thông báo lỗi từ server
hay dữ liệu người dùng vào là an toàn. Hệ quả: không thể in đậm / chèn link trong toast. Cần nội dung có định dạng thì
dùng [modal](modal.md).

## Lưu ý & lỗi thường gặp

- **Toast không hiện:** kiểm tra `message` có rỗng không (`''`, `null`, `undefined`, `0` đều bị bỏ qua) và `td.css` đã
  được nạp chưa.
- **Đừng dùng toast cho lỗi bắt buộc xử lý.** Toast có thể biến mất trước khi người dùng đọc; lỗi quan trọng nên dùng
  `TdModal.error` hoặc hiện tại chỗ.
- **Toast bị header cố định che:** nâng `--td-toast-top`, hoặc nếu header có z-index lớn hơn 500 thì nâng cả bộ token
  `--td-z-*`. `TOAST_Z_INDEX_BASE` không còn tác dụng.
- Đừng xoá `#td-toast-container` bằng tay; nếu nó bị gỡ, lần gọi sau kit tự tạo lại.

## Xem thêm

- [Modal](modal.md) · [Loading](loading.md) · [Icons](icons.md)
- [Theming](../customization/theming.md) · [Styling](../customization/styling.md)
- [Lớp nổi & bàn phím](../concepts/how-it-works.md) · [Trợ năng](../guides/accessibility.md)
