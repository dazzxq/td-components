[Tài liệu](../README.md) › [Components](README.md) › Scroll to top

# Nút lên đầu trang — `<td-scroll-top>`

Nút kính tròn cố định ở góc dưới (phía cuối dòng — bên phải với trang trái-sang-phải), hiện ra khi trang đã cuộn quá
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

Đổi `threshold` / `label` → cập nhật tại chỗ (không dựng lại nút).

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

Nút là **kính strong** (lớp điều khiển nổi — [luật Liquid Glass](../internal/design/liquid-glass.md)): công thức
`.td-glass-surface--strong`, nên mọi fallback (giảm trong suốt, `data-td-glass="off"`, tương phản cao, forced colors,
trình duyệt không có `backdrop-filter`) tự áp dụng. Token kính chung (`--td-glass-*`) đổi được như mọi bề mặt kính khác.

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

## Lưu ý & lỗi thường gặp

- **Nút không hiện**: trang cuộn trong một khung riêng (`overflow: auto` trên `div`) thay vì cửa sổ — component chỉ
  theo dõi cuộn của `window`.
- **Nút bị che / che thanh dưới của site**: chỉnh `--td-scroll-top-bottom`; muốn nổi trên lớp khác thì đổi
  `--td-scroll-top-z`, nhưng đừng vượt `--td-z-lightbox` (350).
- Có `<main>` nhưng không có id: vẫn được focus (bước 2).

## Xem thêm

- [Icons](icons.md) · [Theming](../customization/theming.md) · [Tooltip](tooltip.md) (lớp chồng)
