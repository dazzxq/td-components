[Tài liệu](../README.md) › [Components](README.md) › Scroll to top

# Nút lên đầu trang — `<td-scroll-top>`

Nút tròn nền đặc cố định ở góc dưới (phía cuối dòng — bên phải với trang trái-sang-phải), hiện ra khi trang đã cuộn quá
`threshold`, bấm là cuộn mượt về đầu trang và chuyển focus bàn phím về nội dung chính. Dùng cho trang dài (bài viết,
danh sách). Một trang chỉ nên có một nút.

| | |
|---|---|
| Import | `import '@dazzxq/td-components/scroll-top'` (class: `import { TdScrollTop } from '@dazzxq/td-components'`) |
| Loại | Custom element |
| Form-associated | không |
| Từ phiên bản | 0.17.0 |

## Ví dụ nhanh

```html
<main id="main">…nội dung dài…</main>
<td-scroll-top></td-scroll-top>

<script type="module">
  import '@dazzxq/td-components/scroll-top';
</script>
```

Đặt thẻ ở đâu trong `<body>` cũng được (nút là `position: fixed`, thẻ host không chiếm chỗ).

## Cách dùng

### 1. Ngưỡng hiện nút

```html
<td-scroll-top threshold="800"></td-scroll-top>
```

Nút hiện khi `window.scrollY > threshold` (px, mặc định `400`), ẩn lại khi về gần đầu. Kiểm tra theo `scroll` /
`resize` / `pageshow`, gộp một lần mỗi frame.

### 2. Focus sau khi lên đầu

Bấm nút: `window.scrollTo({ top: 0, behavior: 'smooth' })` (tức thì khi người dùng bật `prefers-reduced-motion`), rồi
focus chuyển tới:

1. phần tử khớp selector `target` (nếu có — không tìm thấy / selector sai → `console.warn` và dùng bước sau);
2. `#main`, rồi `main` / `[role="main"]`;
3. `<body>`.

Phần tử không tự nhận focus được thì được gắn tạm `tabindex="-1"` (gỡ khi nó mất focus). Focus dùng
`preventScroll`, không làm giật cuộn mượt.

```html
<td-scroll-top target="#article-title"></td-scroll-top>
```

### 3. Vị trí, kích thước, lớp chồng

```css
:root {
  --td-scroll-top-bottom: 5rem;  /* tránh thanh điều hướng dưới cùng của site */
  --td-scroll-top-end: 1rem;
  --td-scroll-top-size: 44px;
}
```

Khoảng cách luôn cộng thêm vùng an toàn (`env(safe-area-inset-bottom)` / `-right`) của iPhone có tai thỏ / thanh
home.

## Attribute

| Attribute | Kiểu | Mặc định | Mô tả |
|---|---|---|---|
| `threshold` | number | `400` | Khoảng cuộn (px) để nút hiện. Giá trị âm / không phải số → `400`. |
| `target` | string (CSS selector) | — | Phần tử nhận focus sau khi lên đầu (mặc định `#main` → `main` → `body`). |
| `label` | string | `TdScrollTop.labels.button` | Tên trợ năng (`aria-label`) của nút. |
| `color` | màu CSS | — | 0.62.0: màu nền nút của **riêng** thẻ này (hex, 16 tên cơ bản, `rgb()`; phải đục — alpha < 1, `hsl()`, tên khác → bỏ qua + 1 `console.warn`). Ghi qua CSSOM vào host (`--td-scroll-top-bg/-fg/-bg-hover/-pressed`), không `style="…"`. |
| `text-color` | màu CSS | tự chọn | 0.62.0: màu icon, chỉ khi có `color`. Không đặt → kit chọn đen / trắng theo tương phản (≥ 4.58:1 trên mọi nền). Đặt mà < 3:1 với `color` (hoặc không dùng được) → bỏ qua + warn, dùng màu tự chọn. |

Đổi `threshold` / `label` / `color` / `text-color` → cập nhật tại chỗ (không dựng lại nút).

## Property & method

| Property / method | Kiểu | Mô tả |
|---|---|---|
| `scrollToTop()` | method | Làm đúng việc của nút (cuộn + focus + event). |
| `update()` | method | Tính lại trạng thái hiện/ẩn theo vị trí cuộn hiện tại (tự chạy khi cuộn). |
| `TdScrollTop.labels` | static object | `{ button: 'Lên đầu trang' }` — `TdScrollTop.labels.button = 'Back to top'` (áp cho nút render sau đó). |

## Event

| Event | `detail` | Khi nào |
|---|---|---|
| `scroll-top` | `{ target }` (phần tử được focus) | Sau khi bấm nút / gọi `scrollToTop()`. |

## Tuỳ biến giao diện

| Token | Mặc định | Tác dụng |
|---|---|---|
| `--td-scroll-top-size` | `48px` | Đường kính nút (giữ ≥ `--td-touch-min` 44px) |
| `--td-scroll-top-bottom` | `1.5rem` | Cách mép dưới (+ safe area) |
| `--td-scroll-top-end` | `1.5rem` | Cách mép cuối dòng (+ safe area) |
| `--td-scroll-top-z` | `var(--td-z-sticky)` (200) | Lớp chồng — **dưới** lightbox (350), modal (400), popover (450), toast |
| `--td-scroll-top-offset` | `10px` | Quãng trượt khi hiện/ẩn |
| `--td-scroll-top-bg` | `var(--td-glass-solid)` | 0.62.0: nền nút (đặc) |
| `--td-scroll-top-fg` | `var(--td-glass-fg)` | 0.62.0: màu icon |
| `--td-scroll-top-bg-hover` | *(không khai báo)* | 0.62.0: nền khi rê chuột (chỉ chuột thật). Không đặt → trộn 8 % từ nền về phía màu icon (tính tại nút nên theo `--td-scroll-top-bg` đặt ở bất kỳ tổ tiên nào). Muốn tắt hover: `--td-scroll-top-bg-hover: var(--td-scroll-top-bg)` |
| `--td-scroll-top-border` | `var(--td-glass-border)` | 0.62.0: viền 1px |
| `--td-scroll-top-shadow` | `var(--td-glass-shadow)` | 0.62.0: một bóng |
| `--td-scroll-top-pressed` | `var(--td-color-pressed)` | 0.62.0: lớp phủ khi nhấn (chạm / giữ chuột) |

Nút là bề mặt **đặc** (0.20.0 — [minimal surfaces](../internal/design/liquid-glass.md)): `--td-glass-solid` + viền
mảnh `--td-glass-border` + một bóng mềm `--td-glass-shadow`, không blur, không thu nhỏ khi bấm. Vẫn mang class
`.td-glass-surface--strong` nên fallback tương phản cao / forced colors tự áp dụng; token bề mặt chung (`--td-glass-*`)
đổi được như mọi bề mặt khác.

### 4. Màu riêng (0.62.0)

```html
<!-- một thẻ: nền xanh đậm, icon tự chọn (trắng) -->
<td-scroll-top color="#1e40af"></td-scroll-top>

<!-- icon chọn tay (vẫn phải ≥ 3:1 với nền) -->
<td-scroll-top color="#1e40af" text-color="#fde68a"></td-scroll-top>
```

```css
/* cả site, theo token (cũng áp được trong một vùng theme tối) */
:root {
  --td-scroll-top-bg: var(--td-accent-fill);
  --td-scroll-top-fg: var(--td-accent-contrast);
  --td-scroll-top-border: transparent;
}
```

**Hướng dẫn tương phản.** Icon là thành phần không phải chữ: cần **≥ 3:1** với nền nút (kit đo ≥ 3.2:1); màu icon tự chọn
luôn ≥ 4.58:1. Hover (trộn 8 % về phía icon) và nhấn (lớp phủ đen / trắng 14 % ngược cực với icon) được thiết kế để không
làm tụt tương phản icon dưới 3.2:1. Nút nổi trên nền trang **không biết trước**: nền nút nhạt gần màu trang cần giữ viền /
bóng mặc định (đừng đặt `--td-scroll-top-border: transparent` và `--td-scroll-top-shadow: none` cùng lúc), nền nút đậm
thường đủ tách trên trang sáng. Chế độ **tương phản cao** (`prefers-contrast: more`), **forced colors** và
`<html data-td-glass="off">` bỏ qua màu tuỳ chỉnh (nút về bề mặt chuẩn của trình duyệt) — cố ý, cùng cơ chế với tooltip tuỳ màu.
Màu lấy từ dữ liệu người dùng vẫn an toàn: giá trị đi qua `safeColor()` + `parseColor()` và chỉ ghi bằng CSSOM.

## Cấu trúc DOM & class

```html
<td-scroll-top>
  <button type="button" class="td-scroll-top td-glass-surface td-glass-surface--strong"
          aria-label="Lên đầu trang" data-visible="false|true">
    <span class="td-scroll-top__icon" data-td-icon="up" aria-hidden="true"><!-- tdIcon('up') --></span>
  </button>
</td-scroll-top>
```

`data-visible="false"` → `opacity: 0` + `visibility: hidden` (ra khỏi thứ tự Tab và cây trợ năng).

## Bàn phím & trợ năng

- `<button>` native: Tab, Enter/Space. Khi ẩn thì không nhận focus.
- Tên từ `aria-label` (icon là trang trí). Focus ring `--td-focus-ring` khi `:focus-visible`.
- Sau khi lên đầu, focus về nội dung chính → phím Tab kế tiếp đi từ đầu trang, không bị kẹt ở cuối.
- `prefers-reduced-motion`: cuộn tức thì, tắt hiệu ứng trượt/mờ.

## Bảo mật

- `label` được escape; `target` chỉ dùng cho `document.querySelector` trong `try/catch` (selector sai → bỏ qua).

## Cảm ứng

- Nút có hình nhấn (lớp phủ `--td-color-pressed`); không chuyển động thêm khi nhấn.

Chuẩn chung: [Cảm ứng](../guides/touch.md).

## Lưu ý & lỗi thường gặp

- **Nút không hiện**: trang cuộn trong một khung riêng (`overflow: auto` trên `div`) thay vì cửa sổ — component chỉ
  theo dõi cuộn của `window`.
- **Nút bị che / che thanh dưới của site**: chỉnh `--td-scroll-top-bottom`; muốn nổi trên lớp khác thì đổi
  `--td-scroll-top-z`, nhưng đừng vượt `--td-z-lightbox` (350).
- Có `<main>` nhưng không có id: vẫn được focus (bước 2).

## Xem thêm

- [Icons](icons.md) · [Theming](../customization/theming.md) · [Tooltip](tooltip.md) (lớp chồng)
