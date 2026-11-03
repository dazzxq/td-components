[Tài liệu](../README.md) › [Components](README.md) › Card

# Card ảnh bìa — `.td-card`

Card có ảnh bìa, tiêu đề, một dòng meta ("42 ảnh · 12/02/2026") và badge tuỳ chọn; **cả card là một link**. Dùng cho
lưới album / bộ sưu tập. **Thuần CSS**: không JS, không custom element, không bước nâng cấp — HTML tay, PHP
[`td_card()`](#php-td_card) và JS của site in **cùng một cây markup**.

| | |
|---|---|
| Import | không có module — chỉ cần `td.css` |
| Loại | Khối CSS |
| PHP | `td_card()` |
| Từ phiên bản | 0.95.0 |

## Ví dụ nhanh

```html
<a class="td-card" href="/album/tet-2026">
  <span class="td-card__media">
    <img src="/media/tet-640.jpg" alt="" loading="lazy" decoding="async" width="640" height="480">
  </span>
  <span class="td-card__body">
    <span class="td-card__title">Tết 2026</span>
    <span class="td-card__badges"><span class="td-badge td-badge--danger">Live</span></span>
    <span class="td-card__meta"><span>42 ảnh</span> <span class="td-card__sep" aria-hidden="true">·</span> <time datetime="2026-02-12">12/02/2026</time></span>
  </span>
</a>
```

```php
<?= td_card('Tết 2026', [
  'href'   => '/album/tet-2026',
  'image'  => ['src' => '/media/tet-640.jpg', 'width' => 640, 'height' => 480],
  'badges' => [['Live', ['variant' => 'danger']]],
  'meta'   => ['42 ảnh', ['text' => '12/02/2026', 'datetime' => '2026-02-12']],
  'heading' => 3,
]) ?>
```

Giữ **khoảng trắng giữa các phần tử con** như trên (PHP in một khoảng trắng): tên truy cập của link là
"Tết 2026 Live 42 ảnh 12/02/2026", không dính chữ.

## Hai kiểu

- **Bare (mặc định)**: ảnh bo góc + chữ bên dưới, không hộp. Rê chuột = viền ô ảnh đậm hơn.
- **`.td-card--surface`**: hộp có nền + viền + bóng; rê chuột = nền đặc `--td-card-hover-bg`.

Không có phóng to / nhấc / bóng mới khi rê hay nhấn (luật 4 của [Minimal surfaces](../internal/design/liquid-glass.md)).
Nhấn = lớp `--td-color-pressed` phủ ô ảnh (chạm và chuột).

## Class

| Class | Tác dụng |
|---|---|
| `.td-card` | Gốc. `<a class="td-card" href>` = card link; `<div>` / `<article>` / `li > a` đều được |
| `.td-card__media` | Ô ảnh theo `--td-card-ratio`, nền + viền + bo góc. Con: `img`, `picture > img`, `.td-card__placeholder` |
| `.td-card__placeholder` | Ô giữ chỗ khi không có ảnh (icon trang trí giữa ô, `aria-hidden="true"`) |
| `.td-card__body` | Cột chữ dưới ảnh |
| `.td-card__title` | Tiêu đề, kẹp `--td-card-title-lines` dòng; có thể là `<h3 class="td-card__title">` |
| `.td-card__meta` | Một dòng meta (cắt `…` khi dài); `.td-card__sep` là dấu ngăn, `aria-hidden="true"` |
| `.td-card__badges` | Hàng `.td-badge` đè góc trên-đầu ô ảnh; **đặt sau tiêu đề trong DOM** |
| `.td-card--surface` | Biến thể hộp |
| `.td-card--ratio-1x1` · `-4x3` · `-3x2` · `-16x9` · `-3x4` | Tỉ lệ ảnh (mặc định `4 / 3`) |
| `.td-card-grid` | (tuỳ chọn) lưới `auto-fill` rộng tối thiểu `--td-card-grid-min` |

Ảnh đặt `position: absolute; inset: 0; max-inline-size: none; object-fit: var(--td-card-fit)`: reset `img { max-width:
100%; height: auto }` của host không làm lệch ô ảnh. Ô ảnh có `aspect-ratio` nên không dịch chuyển bố cục (CLS) dù
thiếu `width` / `height`.

## Token

| Token | Mặc định | Tác dụng |
|---|---|---|
| `--td-card-ratio` | `4 / 3` | Tỉ lệ ô ảnh (cũng đặt được bằng class `--ratio-*`) |
| `--td-card-fit` | `cover` | `contain` cho ảnh không được cắt |
| `--td-card-radius` | `var(--td-radius-md)` | Bo góc ô ảnh (bare) / hộp (`--surface`); vòng focus theo |
| `--td-card-body-pad` | `0.375rem 0.25rem` | Padding phần chữ (bare); `--surface` dùng `--td-space-sm` |
| `--td-card-title-size` · `-weight` · `-lines` | `var(--td-text-sm)` · `500` · `2` | Tiêu đề |
| `--td-card-meta-size` | `var(--td-text-xs)` | Meta |
| `--td-card-badge-inset` | `var(--td-space-xs)` | Khoảng cách badge tới góc ảnh |
| `--td-card-placeholder-icon` | `2rem` | Cỡ icon giữ chỗ |
| `--td-card-grid-min` · `--td-card-grid-gap` | `200px` · `var(--td-space-md)` | Chỉ `.td-card-grid` |
| `--td-card-title-fg` · `--td-card-meta-fg` | `--td-color-text` · `--td-color-text-muted` | Màu chữ |
| `--td-card-media-bg` · `--td-card-media-border` | `--td-color-surface-muted` · `--td-color-border` | Nền / viền ô ảnh (nền cũng hiện ra khi ảnh lỗi) |
| `--td-card-placeholder-fg` | `--td-color-text-muted` | Icon giữ chỗ |
| `--td-card-hover-border` | `--td-color-border-strong` | Bare: viền ô ảnh khi rê / nhấn |
| `--td-card-bg` · `--td-card-border` · `--td-card-shadow` | `--td-color-surface` · `--td-color-border` · bóng hai lớp | `--surface` |
| `--td-card-hover-bg` | `--td-color-surface-muted` | `--surface` khi rê |

Theme tối đi qua token nền tảng `--td-color-*` (chỉ bóng có giá trị riêng). Site đổi màu chữ / nền phải tự kiểm tương
phản: gate của kit chỉ đo giá trị mặc định.

## Không có ảnh

```html
<span class="td-card__media"><span class="td-card__placeholder" aria-hidden="true"><svg class="td-icon td-icon--l" …></svg></span></span>
```

PHP: không truyền `image` (hoặc `src` bị từ chối) → ô giữ chỗ với icon `image`; đổi icon bằng `placeholder_icon` (vd.
`images`). Cỡ icon theo `--td-card-placeholder-icon`, chạy cả với `td-icon--l` có sẵn.

## `<picture>`

```html
<span class="td-card__media"><picture><source type="image/avif" srcset="…"><img src="…" alt=""></picture></span>
```

Chỉ qua markup tay; PHP chỉ in `<img>` (+ `srcset` / `sizes`).

## Card tĩnh (không link)

Cùng class trên `<div>` / `<article>`: không con trỏ tay, không hover, không hình nhấn. Mọi luật tương tác chỉ khớp
`a.td-card`. PHP: thiếu `href` hoặc `href` bị từ chối → card tĩnh (không có link chết).

## Lưới

Kích thước theo **ô chứa**, không theo viewport (card không có `@media (width…)`, không tự đặt `container-type`).

- Site có lưới `@container` riêng (vd. dwp) chỉ cần đặt card vào ô lưới.
- Chưa có lưới: bọc bằng `<div class="td-card-grid">…</div>` (hai token `--td-card-grid-min` / `--td-card-grid-gap`).

## Skeleton khi đang tải

```html
<div class="td-skeleton td-skeleton--rect"></div>   <!-- với --td-skeleton-ratio: var(--td-card-ratio) -->
```

Đặt `--td-skeleton-ratio: var(--td-card-ratio)` trong CSS của site để ô chờ cùng tỉ lệ với card.

## PHP `td_card()`

`td_card(string $title, array $o = []): string` (in `a.td-card` hoặc `div.td-card`).

| Option | Hành vi |
|---|---|
| `href` | `Td::safeUrl()` rồi từ chối `mailto:` / `tel:`; hợp lệ → `<a>`, không thì card tĩnh |
| `target` | Chỉ khi có link; `_blank` → `rel="noopener noreferrer"` |
| `image` | chuỗi `src` hoặc `['src', 'srcset', 'sizes', 'alt', 'width', 'height']`. `src` và mọi URL `srcset` qua bộ lọc URL ảnh (https / http / tương đối); **một ứng viên `srcset` hỏng → bỏ cả `srcset`**; `width` / `height` số nguyên 1–10000; `alt` mặc định `''` |
| `eager` | `true` → bỏ `loading="lazy"` (ảnh đầu màn hình) |
| `placeholder_icon` | tên icon registry (mặc định `image`) |
| `meta` | chuỗi hoặc danh sách `string` / `['text', 'datetime']` (`datetime` ISO 8601 rút gọn → `<time>`) |
| `badges` | danh sách `string` / `[text, td_badge options]` |
| `heading` | 2–6 → tiêu đề là `<hN>` |
| `ratio` | `1x1` · `4x3` · `3x2` · `16x9` · `3x4` |
| `surface` | `true` → `.td-card--surface` |
| `id`, `class`, `attrs` | như `td_badge`; `role`, `tabindex`, `aria-label`, `aria-labelledby`, `data-td-*` bị bỏ khỏi `attrs` |

## Trợ năng

- Tên truy cập của link là **toàn bộ nội dung** theo thứ tự DOM (tiêu đề, badge, meta); ảnh `alt=""` vì tiêu đề đã gọi
  tên card, dấu ngăn `aria-hidden`. Không ghi đè bằng `aria-label` / `aria-labelledby`.
- **Không đặt phần tử tương tác lồng trong card** (nút "⋯", tick chọn, link con): HTML không cho phép và tên truy cập sẽ
  lẫn. Cần control con thì dùng mẫu "stretched link" (bản sau).
- Tiêu đề bị kẹp vẫn đủ chữ trong DOM; người nhìn mất phần cuối — nên giữ tiêu đề ngắn.
- Dùng `heading` để trình đọc màn hình duyệt theo heading trong trang album.
- Focus bàn phím: vòng focus quanh **cả** card. `prefers-contrast: more` → viền `currentColor`, không bóng;
  `forced-colors` → viền `CanvasText`, focus / nhấn `Highlight`.

## Cảm ứng

Hover chỉ bật trong `(hover: hover) and (pointer: fine)`; nhấn có hình dạng riêng (lớp phủ trên ô ảnh), không
`touch-action` mới. Hạn chế: trên iPhone, hình nhấn cần trang có ít nhất một phần tử kit đã nạp (module kit đặt trình
nghe nhấn); trang **chỉ** có card thì không có hình nhấn — điều hướng vẫn đúng.

## Bảo mật

Thuần CSS: không `style="…"`, không `<style>`, không `url()`. Tỉ lệ per-card chỉ qua class trong allowlist. PHP escape
mọi chữ; `href` chặn `javascript:` / `data:` / `vbscript:` và `mailto:` / `tel:`; `attrs` qua allowlist.

## Vì sao gốc là `<a>`

`<a>` có nội dung trong suốt nên chứa được khối; trình duyệt lo focus, Enter, giữa-click, Ctrl/⌘-click, kéo link, menu
chuột phải, `:visited` và chạy không cần JS. Gắn `href` lên phần tử khác phải giả lập `role="link"`, `tabindex`, phím
và `window.open` bằng JS, cả PHP lẫn JS phải giữ cùng một bản giả lập. Gốc là `<a>` còn tránh phải có custom element
(không FOUC, không hợp đồng hydrate).
