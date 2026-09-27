[Tài liệu](../README.md) › [Components](README.md) › Loading

# Loading — `TdLoading` + `TdLoadingSpinner`

Module loading có hai phần:

- **`TdLoading`**: lớp phủ **toàn màn hình, chặn thao tác** (scrim + thẻ kính có spinner và dòng chữ) khi cả trang phải
  chờ một việc xong (lưu, chuyển bước, tải lại dữ liệu).
- **`TdLoadingSpinner`**: tạo một spinner **inline** nhỏ đặt ở bất kỳ đâu (trong ô bảng, cạnh chữ, trong khung đang
  tải).

Đừng dùng overlay cho việc chỉ ảnh hưởng một phần trang — dùng spinner inline hoặc trạng thái `loading` của
[button](button.md). Trong một [modal](modal.md), nút footer async đã tự có spinner; không cần overlay.

| | |
|---|---|
| Import | `import { TdLoading, TdLoadingSpinner } from '@dazzxq/td-components/loading'` |
| Loại | API JS tĩnh |
| Form-associated | không |
| Từ phiên bản | 0.1.0 (token-native, focus/inert, `wrap()` đếm tham chiếu từ 0.7.0) |

Cần `td.css` (`loading.css` + `spinner.css`). Overlay được tạo ở lần gọi đầu; không cần khởi tạo.

## Ví dụ nhanh

```js
import { TdLoading } from '@dazzxq/td-components/loading';

TdLoading.show('Đang lưu...');
try {
  await savePost();
} finally {
  TdLoading.hide();
}
```

## Cách dùng

### `wrap()` — cách an toàn nhất

`wrap(asyncFn, message)` hiện overlay, chạy hàm, và **luôn** ẩn overlay khi hàm xong (kể cả khi lỗi). Giá trị trả về
và lỗi được chuyển nguyên cho bạn.

```js
const post = await TdLoading.wrap(() => fetch('/api/post/1').then((r) => r.json()), 'Đang tải bài viết...');
```

Nhiều `wrap()` chạy song song được **đếm tham chiếu**: overlay chỉ tắt khi cái **cuối cùng** xong.

```js
await Promise.all([
  TdLoading.wrap(() => loadUsers()),
  TdLoading.wrap(() => loadStats()),
]); // overlay ở lại tới khi cả hai xong
```

### Đổi chữ giữa chừng

Gọi `show()` lần nữa khi overlay đang hiện chỉ đổi chữ (và khởi động lại hẹn giờ an toàn), không tạo overlay thứ hai.

```js
TdLoading.show('Đang tải ảnh lên...');
await upload();
TdLoading.show('Đang xử lý ảnh...');
await process();
TdLoading.hide();
```

### Việc chạy lâu: chỉnh hoặc tắt hẹn giờ an toàn

Mặc định overlay **tự ẩn sau 30 giây** (và ghi `console.warn`) để một lỗi quên `hide()` không khoá trang vĩnh viễn.

```js
TdLoading.show({ message: 'Đang xuất báo cáo...', maxDuration: 120000 }); // 2 phút
TdLoading.show({ message: 'Đang đồng bộ...', maxDuration: false });       // tắt hẹn giờ (nhớ tự hide!)
```

### Spinner inline

```js
import { TdLoadingSpinner } from '@dazzxq/td-components/loading';

const cell = document.querySelector('#stats');
cell.replaceChildren(TdLoadingSpinner.create({ size: 'sm', label: 'Đang tải thống kê' }));
```

Có `label` → spinner là `role="status"` và được đọc lên; không có `label` → spinner chỉ để trang trí (`aria-hidden`),
khi đó bạn nên có chữ hiển thị bên cạnh.

### Spinner render sẵn phía server (không cần JS)

Spinner chỉ là CSS, nên PHP có thể in thẳng markup:

```php
<span class="td-spinner td-spinner--sm" aria-hidden="true">
  <svg class="td-spinner__svg" viewBox="0 0 50 50" aria-hidden="true" focusable="false">
    <circle class="td-spinner__track" cx="25" cy="25" r="20"></circle>
    <circle class="td-spinner__arc" cx="25" cy="25" r="20"></circle>
  </svg>
</span>
<span>Đang tải...</span>
```

## Property & method

### `TdLoading`

| Chữ ký | Mô tả |
|---|---|
| `TdLoading.show(message?)` | `message` là chuỗi: hiển thị **nguyên văn** (`''` → không có chữ). Mặc định `'Đang tải...'`. |
| `TdLoading.show({ message?, maxDuration? })` | `message` rỗng / thiếu → `'Đang tải...'`. `maxDuration`: mili-giây trước khi tự ẩn, mặc định `30000`; `false` hoặc `0` → không tự ẩn. |
| `TdLoading.hide()` | Ẩn overlay ngay, **và** huỷ mọi bộ đếm `wrap()` đang chờ (các `wrap()` đó xong sau này sẽ không đụng tới overlay nữa). Gọi khi overlay không hiện → không làm gì. |
| `TdLoading.wrap(asyncFn, message = 'Đang tải...')` | `Promise<T>` — chạy `asyncFn()` dưới overlay; resolve / reject đúng như `asyncFn`. Overlay tắt khi `wrap()` cuối cùng xong. |
| `TdLoading.init()` | Tạo phần tử overlay (tự gọi trong `show()`). |
| `TdLoading.element` | Phần tử `#td-loading` hoặc `null`. Chỉ đọc. |

`show()` **không** đếm tham chiếu: gọi `show()` 3 lần thì chỉ cần 1 `hide()` để tắt. Chỉ `wrap()` mới đếm.

### `TdLoadingSpinner`

`TdLoadingSpinner.create(options?) → HTMLSpanElement`

| Tuỳ chọn | Kiểu | Mặc định | Mô tả |
|---|---|---|---|
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | `sm` = 1.25rem, `md` = 2rem, `lg` = 3rem. Giá trị lạ → `md`. |
| `color` | màu CSS | màu chữ hiện tại (`currentColor`) | Màu cung quay. Qua bộ lọc `safeColor`; không hợp lệ → bỏ qua. |
| `trackColor` | màu CSS | 18% của màu chính | Màu vòng nền (đặc hoàn toàn khi được đặt). Qua `safeColor`. |
| `className` | `string` | `''` | Class thêm vào (cách nhau bởi khoảng trắng). |
| `label` | `string` | `''` | Có → `role="status"` + `aria-label`; không → `aria-hidden="true"`. |

## Hành vi của overlay

Trong lúc overlay hiện:

- **Focus** chuyển vào thẻ loading; khi ẩn, focus được trả về phần tử đang có focus trước đó. Nếu phần tử đó đã biến
  mất (ví dụ nằm trong một modal bị đóng trong lúc chờ), focus đi theo "đường chuyển giao" tới opener của modal đó, hoặc
  dialog đang ở trên cùng.
- **Trang bên dưới bị `inert`** (không click, không focus, trình đọc màn hình bỏ qua), kể cả modal và lightbox đang mở.
  Toast vẫn hiện và vẫn đóng được.
- **Tab** bị giữ trong thẻ loading; **Escape** bị nuốt (không đóng gì — kể cả modal bên dưới).
- **Cuộn trang bị khoá** (khoá chia sẻ với modal / lightbox; trang chỉ mở khoá khi mọi lớp đã đóng).
- Mọi đường thoát — `hide()`, hết `maxDuration`, `wrap()` cuối cùng xong — đi qua **một** hàm dọn dẹp duy nhất nên
  inert, khoá cuộn và focus được khôi phục đúng một lần.

Lớp: `--td-z-loading` (480) — trên [modal](modal.md) (400), dưới [toast](toast.md) (500) và [tooltip](tooltip.md) (510).

## Tuỳ biến giao diện

Overlay không có token riêng; nó dùng token chung:

| Token | Tác dụng |
|---|---|
| `--td-glass-scrim` | Màu lớp phủ (không làm mờ nền). |
| `--td-accent` | Màu spinner trong overlay. |
| `--td-color-text` | Màu chữ thông báo. |
| `--td-z-loading` | Z-index (mặc định `480`). |
| `--td-glass-*` | Kính của thẻ. |

Token của spinner:

| Token | Mặc định | Tác dụng |
|---|---|---|
| `--td-spinner-color` | `currentColor` | Màu cung quay (ghi theo từng spinner khi dùng `color`). |
| `--td-spinner-track` | màu chính, độ mờ 0.18 | Màu vòng nền (ghi khi dùng `trackColor`, kèm `[data-track]`). |
| `--td-spinner-size` | md `2rem` (sm `1.25rem`, lg `3rem`) | Kích thước. Cỡ md khai báo trên `:root` (từ 0.16.0), nên `:root { --td-spinner-size: 1.5rem; }` đổi mọi spinner cỡ md; `.td-spinner--sm` / `--lg` đặt lại biến trên phần tử (overlay TdLoading dùng `--lg`). |

```css
/* Spinner trong overlay dùng màu thương hiệu riêng */
.td-loading__spinner { color: #7c3aed; }

/* Spinner cỡ tuỳ ý */
.my-spinner.td-spinner { --td-spinner-size: 1rem; }
```

```js
// Đổi màu một spinner cụ thể bằng CSSOM (an toàn với CSP)
spinner.style.setProperty('--td-spinner-color', '#16a34a');
```

`prefers-reduced-motion: reduce` → spinner ngừng quay (cung đứng yên, vẫn thể hiện "đang bận"); overlay không có hiệu
ứng mờ. Forced colors → spinner dùng `CanvasText`.

## Cấu trúc DOM & class

Overlay (một phần tử duy nhất, gắn vào `<body>`):

```html
<div id="td-loading" class="td-loading" role="status" aria-live="polite" aria-busy="true" data-state="open">
  <div class="td-loading__card td-glass-surface td-glass-surface--strong" tabindex="-1">
    <span class="td-loading__spinner td-spinner td-spinner--lg" aria-hidden="true"><svg class="td-spinner__svg">…</svg></span>
    <p id="td-loading-message" class="td-loading__message">Đang tải...</p>
  </div>
</div>
```

| Class / attribute | Ý nghĩa |
|---|---|
| `[hidden]` | Overlay đang ẩn. |
| `[data-state="open"]` | Đã hiện xong (độ mờ 1). |
| `[aria-busy="true"]` | Có trong lúc hiện. |

Spinner:

| Class / attribute | Ý nghĩa |
|---|---|
| `.td-spinner`, `.td-spinner--{sm\|md\|lg}` | Khung spinner và kích thước. |
| `.td-spinner__svg`, `.td-spinner__track`, `.td-spinner__arc` | SVG, vòng nền, cung quay. |
| `[data-track]` | Có màu vòng nền tuỳ chỉnh (vòng nền đặc hoàn toàn). |
| `[hidden]` | Ẩn spinner (dùng cho spinner nút đang rảnh). |

## Bàn phím & trợ năng

- Overlay là `role="status"` + `aria-live="polite"`: trình đọc màn hình đọc dòng chữ thông báo.
- Focus được giữ trong overlay; Escape không làm gì; không có nút huỷ — việc "huỷ" (nếu có) là của code của bạn.
- Người dùng bàn phím không thể lỡ tay thao tác trang bên dưới trong lúc chờ (trang bị `inert`).
- Spinner inline: luôn cho người dùng biết đang tải gì, bằng `label` hoặc chữ hiển thị bên cạnh.

## Bảo mật

Chữ thông báo của overlay và `label` của spinner được render dạng **text** — đưa dữ liệu người dùng vào là an toàn.
`color` / `trackColor` đi qua bộ lọc `safeColor` (chỉ hex, `rgb/rgba/hsl/hsla` với tham số số, hoặc tên màu), ghi bằng
CSSOM — không dùng `style="…"`, chạy được dưới CSP nghiêm ngặt.

## Lưu ý & lỗi thường gặp

- **Luôn tắt overlay trong `finally`** (hoặc dùng `wrap()`). Nếu quên, trang bị khoá tới khi hết `maxDuration` (30s).
- **`wrap()` luôn dùng hẹn giờ an toàn mặc định 30 giây**; việc chạy lâu hơn sẽ bị tắt overlay giữa chừng (Promise của
  `wrap()` vẫn chạy tiếp bình thường). Với việc dài, dùng `show({ message, maxDuration })` + `hide()` trong `finally`.
- **`hide()` tắt cả các `wrap()` đang chạy.** Nếu một phần code gọi `hide()` trong khi phần khác đang `wrap()`, overlay
  tắt ngay.
- **`show('')` và `show({ message: '' })` khác nhau:** chuỗi rỗng trực tiếp → không có chữ; object với `message` rỗng →
  chữ mặc định `'Đang tải...'`.
- **Chữ mặc định `'Đang tải...'` chưa cấu hình toàn cục được** (không có `TdLoading.labels`); site dùng ngôn ngữ khác nên
  luôn truyền `message`.
- Overlay nằm **trên** modal: mở loading khi đang có modal là hợp lệ (modal bị `inert` trong lúc chờ, focus trả lại
  đúng chỗ khi xong).

## Xem thêm

- [Button](button.md) (trạng thái loading của nút) · [Modal](modal.md) (nút footer async) · [Toast](toast.md)
- [Lớp nổi, inert và focus](../concepts/how-it-works.md)
- [Theming](../customization/theming.md) · [Trợ năng](../guides/accessibility.md)
