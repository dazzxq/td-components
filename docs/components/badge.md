[Tài liệu](../README.md) › [Components](README.md) › Badge

# Nhãn trạng thái — `.td-badge`

Nhãn nhỏ dạng viên thuốc cho trạng thái / số đếm / thẻ ("Mới", "Đã duyệt", "3"), kèm kiểu **con dấu** (`--stamp`:
chữ in hoa, viền đôi, nghiêng nhẹ — như `td-stamp` của 135). **Thuần CSS**: không JS, không custom element.

| | |
|---|---|
| Import | không có module — chỉ cần `td.css` |
| Loại | Khối CSS |
| PHP | [`td_badge()`](../guides/php-adapter.md#td_badge-và-td_alert) |
| Từ phiên bản | 0.18.0 |

## Ví dụ nhanh

```html
<span class="td-badge td-badge--success">Đã duyệt</span>
<span class="td-badge td-badge--danger td-badge--outline">Hết hạn</span>
<span class="td-badge td-badge--warning td-badge--stamp">Nháp</span>
```

```php
<?= td_badge('Đã duyệt', ['variant' => 'success']) ?>
<?= td_badge('Nháp', ['variant' => 'warning', 'stamp' => true]) ?>
```

## Class

| Class | Tác dụng |
|---|---|
| `.td-badge` | Khối gốc (mặc định = `neutral`) |
| `.td-badge--neutral` · `--accent` · `--success` · `--warning` · `--danger` · `--info` | Màu. `accent` theo `--td-accent` của site (cần `color-mix()`, không có thì dùng màu của `info`). |
| `.td-badge--outline` | Nền trong suốt, viền 1px cùng màu chữ |
| `.td-badge--stamp` | Con dấu: chữ in hoa đậm, giãn chữ, viền đôi, nền trong suốt, nghiêng `--td-badge-stamp-rotate` |

`--outline` và `--stamp` dùng được với mọi màu. Badge có sẵn `vertical-align: middle` và `white-space: nowrap` để
đặt cạnh chữ / trong ô bảng.

## Tuỳ biến giao diện

| Token | Mặc định | Tác dụng |
|---|---|---|
| `--td-badge-radius` | `var(--td-radius-full)` | Bo góc (viên thuốc) |
| `--td-badge-font-size` | `var(--td-text-xs)` | Cỡ chữ |
| `--td-badge-{variant}-bg` | tông nhạt của màu | Nền (kiểu thường) |
| `--td-badge-{variant}-fg` | tông đậm của màu | Chữ + viền (outline / stamp) |
| `--td-badge-stamp-rotate` | `-4deg` | Độ nghiêng con dấu — **`0deg` để tắt** |
| `--td-badge-stamp-border` | `3px` | Độ dày viền đôi |
| `--td-badge-stamp-radius` | `var(--td-radius-sm)` | Bo góc con dấu |

```css
:root { --td-badge-stamp-rotate: 0deg; }            /* con dấu thẳng */
.invoice .td-badge--stamp { --td-badge-stamp-rotate: -8deg; } /* nghiêng hơn trong một vùng */
```

Theme tối có bộ màu riêng. Chữ ≥ 4.7:1 trên nền của chính nó **và** trên nền trang (outline / stamp) ở light + dark
(gate `npm run test:contrast`). Badge thuộc tầng nội dung → nền đặc, không kính.

## Trợ năng

- Badge chỉ là chữ: màu **không** được là thông tin duy nhất — chữ phải tự nói ("Đã duyệt", không chỉ "●").
- Số đếm cần ngữ cảnh cho trình đọc màn hình: `<span class="td-badge">3<span class="td-sr-only"> tin mới</span></span>`
  hoặc `aria-label` trên phần tử cha.
- Forced colors: chữ + viền dùng `CanvasText`.

## Bảo mật

Thuần CSS. `td_badge()` escape chữ; `class` chỉ nhận token class hợp lệ, `attrs` qua whitelist như mọi helper.
