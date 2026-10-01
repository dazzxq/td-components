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
| Từ phiên bản | 0.1.0 (token-native từ 0.9.0, kính tô màu theo loại 0.14.0 → nền trung tính + icon màu từ 0.20.0) |

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
TdToast.error('Phiên đăng nhập đã hết hạn', 0);       // 0 = không tự tắt; người dùng bấm X hoặc click vào toast
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
toast còn trong hàng đợi → bị bỏ (không bao giờ hiện); đã hiện → đóng như bấm nút X. Gọi lại `close()` không làm gì.

```js
const saving = TdToast.info('Đang đồng bộ…', 0);   // sticky
await sync();
saving.close();
TdToast.success('Đã đồng bộ');

TdToast.clear();   // bỏ mọi toast đang chờ và đóng mọi toast đang hiện (vd. khi chuyển trang trong SPA)
```

### Đổi nhãn nút X

```js
TdToast.labels.close = 'Close';   // aria-label của nút X, mặc định 'Đóng'; đặt một lần khi khởi động
```

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
| `handle.close()` | (0.16.0) Còn trong hàng đợi 50ms → gỡ khỏi hàng đợi; đang chờ lượt 80ms → huỷ lượt đó; đã hiện → đóng như nút X. Gọi lại → không làm gì. Với `message` rỗng handle vẫn có nhưng không làm gì. |
| `TdToast.clear()` | (0.16.0) Xoá hàng đợi, huỷ mọi lượt đang chờ, đóng mọi toast đang hiện. |
| `TdToast.labels` | (0.16.0) `{ close: 'Đóng' }` — `aria-label` của nút X, áp dụng cho toast tạo sau khi đổi. |
| `TdToast.MAX_VISIBLE` | `5`. Số toast hiện cùng lúc tối đa; vượt quá thì cái cũ nhất bị đóng. |
| `TdToast.container` | Phần tử `#td-toast-container` (hoặc `null` trước lần gọi đầu). Chỉ đọc. |
| `TdToast.ensureContainer()` | Tạo vùng chứa nếu chưa có / đã bị gỡ khỏi DOM. Thường không cần gọi tay. |
| `TdToast.getTheme(type)` | Trả `{ type, icon }` đã chuẩn hoá (loại lạ → `info`). |
| `TdToast.getToastZIndex()` | **Lỗi thời.** Trả z-index đã tính của vùng chứa (từ token `--td-z-toast`). |
| `TdToast.TOAST_Z_INDEX_BASE` | **Lỗi thời.** `500`, chỉ còn để tương thích; z-index thật đến từ token `--td-z-toast`. |

## Hành vi

- **Hẹn giờ tạm dừng** (WCAG 2.2.1) khi: con trỏ đang ở trên vùng toast, focus đang ở trong vùng toast, hoặc tab trình
  duyệt bị ẩn. Thời gian còn lại được giữ và chạy tiếp khi hết điều kiện. Toast đang tạm dừng có `[data-paused]`.
- **Đóng:** mọi toast (kể cả sticky) có nút X (`aria-label` = `TdToast.labels.close`, mặc định `"Đóng"`); click vào
  **bất kỳ đâu** trên toast cũng đóng nó. Code đóng bằng `handle.close()` / `TdToast.clear()`.
- **Hàng đợi:** lần gọi đầu được gom trong 50ms, sau đó mỗi toast hiện cách nhau 80ms. Vì vậy toast không xuất hiện
  "ngay trong cùng dòng code" — đừng truy vấn DOM toast ngay sau khi gọi `show()`.
- **Trên modal / loading:** vùng toast không bao giờ bị `inert` bởi [modal](modal.md) hay [loading](loading.md); nút X
  của toast nằm trong vòng Tab của modal. Toast giữ nguyên bề mặt của nó khi có modal đang mở (0.20.0).
- **Lớp:** `--td-z-toast` (500) — trên modal (400) và loading (480), dưới [tooltip](tooltip.md) (510).

## Tuỳ biến giao diện

Từ 0.20.0 (minimal surfaces): nền **trung tính** 94 % (`--td-glass-bg-strong`) + `blur(12px)` + viền mảnh + một bóng
mềm; **chỉ icon** mang màu trạng thái (icon nên màu không bao giờ là tín hiệu duy nhất). Không còn lớp màu (wash) hay
viền đỏ cho toast lỗi. Tương phản chữ ≥ 4.7:1 và icon ≥ 3.2:1 được gate kiểm trên nền trắng, đen, caro và ảnh.

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
| `--td-toast-radius` | `22px` | Bo góc (toast một dòng cao 44px → thành hình viên thuốc). |
| `--td-toast-fg` | `var(--td-color-text)` | Màu chữ. |
| `--td-toast-close-fg` | `var(--td-toast-fg)` | Màu nút X. |
| `--td-toast-close-hover` | `var(--td-color-hover-strong)` | Nền nút X khi hover. |
| `--td-toast-glass-bg` | `var(--td-glass-bg-strong)` (`rgb(255 255 255 / 94%)`) | Nền trung tính của toast. |
| `--td-toast-info-icon` / `-success-icon` / `-warning-icon` / `-error-icon` | `var(--td-color-info)` / `-success` / `-warning` / `-error` | Màu icon trạng thái (theo màu ngữ nghĩa, dark tự sáng lên). |
| `--td-toast-*-wash`, `--td-toast-error-border` | `transparent` | **Deprecated 0.20.0**, không còn tác dụng. |
| `--td-toast-enter-shift` | `0.5rem` | Độ trượt khi hiện / ẩn. |

Ở dark theme (`<html data-td-theme="dark">`) kit tự đổi nền (qua `--td-glass-bg-strong`), `--td-toast-fg`,
`--td-toast-close-fg` và màu icon (qua `--td-color-*`) sang giá trị tối. Nếu bạn override màu, hãy override cho cả hai theme và tự kiểm tra tương phản.

```css
/* Toast gọn hơn, xa mép hơn */
:root {
  --td-toast-max-w: 22rem;
  --td-toast-inline-end: 1.5rem;
}
```

Chuyển động: hiện = mờ dần + trượt xuống; ẩn = mờ dần + trượt ngang. `prefers-reduced-motion: reduce` → chỉ đổi độ
mờ. Tắt blur (`<html data-td-glass="off">`, reduced transparency, tương phản cao) → nền đặc.

## Cấu trúc DOM & class

```html
<div id="td-toast-container" class="td-toasts">
  <div class="td-toast td-toast--success td-glass-surface td-glass-surface--strong"
       role="status" aria-live="polite" data-state="open">
    <span class="td-toast__icon" aria-hidden="true"><svg class="td-icon td-icon--m" data-icon="success" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M21.801 10A10 10 0 1 1 17 3.335"/><path d="m9 11 3 3L22 4"/></svg></span>
    <span class="td-toast__message">Đã lưu</span>
    <button type="button" class="td-toast__close" aria-label="Đóng"><svg class="td-icon td-icon--s" data-icon="close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>
  </div>
</div>
```

| Class / attribute | Ý nghĩa |
|---|---|
| `.td-toasts` (`#td-toast-container`) | Vùng chứa cố định, gắn vào `<body>` ở lần gọi đầu. `pointer-events: none` nên trang quanh nó vẫn click được. |
| `.td-toast--{success\|error\|warning\|info}` | Loại. |
| `[data-state="entering\|open\|closing"]` | Vòng đời; phần tử bị gỡ khoảng 200ms sau khi `closing`. |
| `[data-paused]` | Hẹn giờ đang tạm dừng. |
| `role="status"` + `aria-live="polite"` | Mọi loại trừ `error`. |
| `role="alert"` + `aria-live="assertive"` | Chỉ `error`. |

## Bàn phím & trợ năng

- Toast **không lấy focus** khi hiện — người dùng không bị gián đoạn.
- Trình đọc màn hình: `success` / `info` / `warning` được đọc lịch sự (không ngắt lời); chỉ `error` ngắt lời. Chữ được
  điền vào toast **một khung hình sau** khi toast được chèn, để vùng live region tồn tại trước khi nội dung đổi —
  nhờ vậy lời thông báo được đọc ổn định.
- Nút X focus được bằng Tab, bấm Enter / Space để đóng. Khi toast đang được focus bị đóng, focus chuyển tới nút X của
  toast kế tiếp; nếu là toast cuối cùng, focus về lại nơi nó đến trước khi vào vùng toast.
- Khi có modal mở, nút X của toast vẫn nằm trong vòng Tab của modal.
- Trên thiết bị cảm ứng nút X có vùng chạm tối thiểu `--td-touch-min`. Forced colors: icon và nút X dùng màu hệ thống.

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

- [Modal](modal.md) · [Loading](loading.md) · [Icons](icons.md) (icon trạng thái lấy từ registry)
- [Theming](../customization/theming.md) · [Styling](../customization/styling.md)
- [Lớp nổi & bàn phím](../concepts/how-it-works.md) · [Trợ năng](../guides/accessibility.md)
