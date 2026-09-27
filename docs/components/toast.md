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
| Từ phiên bản | 0.1.0 (token-native từ 0.9.0, kính tô màu theo loại từ 0.14.0) |

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
| `TdToast.show(message, type = 'info', duration = 4000)` | Hiện toast. `message`: text (giá trị rỗng / falsy như `''`, `null`, `0` → không hiện gì). `type`: `'success' \| 'error' \| 'warning' \| 'info'` (giá trị lạ → `info`). `duration`: mili-giây; `0` hoặc âm = sticky. Trả về `undefined`. |
| `TdToast.success(message, duration = 4000)` | Rút gọn cho `show(message, 'success', duration)`. |
| `TdToast.error(message, duration = 5000)` | Rút gọn cho `show(message, 'error', duration)`. |
| `TdToast.warning(message, duration = 4000)` | Rút gọn cho `show(message, 'warning', duration)`. |
| `TdToast.info(message, duration = 4000)` | Rút gọn cho `show(message, 'info', duration)`. |
| `TdToast.MAX_VISIBLE` | `5`. Số toast hiện cùng lúc tối đa; vượt quá thì cái cũ nhất bị đóng. |
| `TdToast.container` | Phần tử `#td-toast-container` (hoặc `null` trước lần gọi đầu). Chỉ đọc. |
| `TdToast.ensureContainer()` | Tạo vùng chứa nếu chưa có / đã bị gỡ khỏi DOM. Thường không cần gọi tay. |
| `TdToast.getTheme(type)` | Trả `{ type, icon }` đã chuẩn hoá (loại lạ → `info`). |
| `TdToast.getToastZIndex()` | **Lỗi thời.** Trả z-index đã tính của vùng chứa (từ token `--td-z-toast`). |
| `TdToast.TOAST_Z_INDEX_BASE` | **Lỗi thời.** `500`, chỉ còn để tương thích; z-index thật đến từ token `--td-z-toast`. |

Toast không có API để đóng một toast cụ thể hay xoá tất cả bằng code: toast tự tắt theo `duration`, hoặc người dùng
đóng.

## Hành vi

- **Hẹn giờ tạm dừng** (WCAG 2.2.1) khi: con trỏ đang ở trên vùng toast, focus đang ở trong vùng toast, hoặc tab trình
  duyệt bị ẩn. Thời gian còn lại được giữ và chạy tiếp khi hết điều kiện. Toast đang tạm dừng có `[data-paused]`.
- **Đóng:** mọi toast (kể cả sticky) có nút X (`aria-label="Đóng"`); click vào **bất kỳ đâu** trên toast cũng đóng nó.
- **Hàng đợi:** lần gọi đầu được gom trong 50ms, sau đó mỗi toast hiện cách nhau 80ms. Vì vậy toast không xuất hiện
  "ngay trong cùng dòng code" — đừng truy vấn DOM toast ngay sau khi gọi `show()`.
- **Trên modal / loading:** vùng toast không bao giờ bị `inert` bởi [modal](modal.md) hay [loading](loading.md); nút X
  của toast nằm trong vòng Tab của modal. Khi có modal đang mở, toast chuyển nền đặc (không "kính trên kính").
- **Lớp:** `--td-z-toast` (500) — trên modal (400) và loading (480), dưới [tooltip](tooltip.md) (510).

## Tuỳ biến giao diện

Kính **tô màu theo loại**: nền kính trung tính (66% trắng ở giao diện sáng, 70% tối ở dark) cộng một lớp màu mỏng theo
loại, cùng icon trạng thái (màu không bao giờ là tín hiệu duy nhất). Tương phản chữ ≥ 4.5:1 và icon ≥ 3:1 đã được kiểm
tra trên nền trắng lẫn đen.

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
| `--td-toast-glass-bg` | `rgb(255 255 255 / 66%)` | Nền kính trung tính của toast. |
| `--td-toast-success-wash` / `-info-wash` | `rgb(21 128 61 / 22%)` / `rgb(29 78 216 / 22%)` | Lớp màu theo loại. |
| `--td-toast-warning-wash` / `-error-wash` | `rgb(180 83 9 / 26%)` / `rgb(185 28 28 / 26%)` | Lớp màu theo loại. |
| `--td-toast-info-icon` / `-success-icon` / `-warning-icon` / `-error-icon` | `#172f73` / `#0f3d21` / `#5a2a0a` / `#5c1515` | Màu icon trạng thái. |
| `--td-toast-error-border` | `color-mix(in srgb, var(--td-color-error) 45%, transparent)` | Viền của toast lỗi. |
| `--td-toast-enter-shift` | `0.5rem` | Độ trượt khi hiện / ẩn. |

Ở dark theme (`<html data-td-theme="dark">`) kit tự đổi `--td-toast-glass-bg`, `--td-toast-fg`, `--td-toast-close-fg`,
màu icon và các `*-wash` sang giá trị tối. Nếu bạn override màu, hãy override cho cả hai theme và tự kiểm tra tương phản.

```css
/* Toast gọn hơn, xa mép hơn */
:root {
  --td-toast-max-w: 22rem;
  --td-toast-inline-end: 1.5rem;
}
```

Chuyển động: hiện = mờ dần + trượt xuống; ẩn = mờ dần + trượt ngang. `prefers-reduced-motion: reduce` → chỉ đổi độ
mờ. Tắt kính (`<html data-td-glass="off">`, reduced transparency, tương phản cao) → nền đặc.

## Cấu trúc DOM & class

```html
<div id="td-toast-container" class="td-toasts">
  <div class="td-toast td-toast--success td-glass-surface td-glass-surface--strong"
       role="status" aria-live="polite" data-state="open">
    <span class="td-toast__icon" aria-hidden="true"><svg class="td-icon …" data-icon="success"></svg></span>
    <span class="td-toast__message">Đã lưu</span>
    <button type="button" class="td-toast__close" aria-label="Đóng"><svg … data-icon="close"></svg></button>
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
- **Nhãn "Đóng" của nút X hiện chưa cấu hình được** (không có `TdToast.labels`). Site không dùng tiếng Việt cần biết
  điều này.
- **Toast bị header cố định che:** nâng `--td-toast-top`, hoặc nếu header có z-index lớn hơn 500 thì nâng cả bộ token
  `--td-z-*`. `TOAST_Z_INDEX_BASE` không còn tác dụng.
- Đừng xoá `#td-toast-container` bằng tay; nếu nó bị gỡ, lần gọi sau kit tự tạo lại.

## Xem thêm

- [Modal](modal.md) · [Loading](loading.md) · [Icons](icons.md) (icon trạng thái lấy từ registry)
- [Theming](../customization/theming.md) · [Styling](../customization/styling.md)
- [Lớp nổi & bàn phím](../concepts/how-it-works.md) · [Trợ năng](../guides/accessibility.md)
