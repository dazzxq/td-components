[Tài liệu](../README.md) › [Components](README.md) › Badge

# Nhãn trạng thái — `.td-badge`

Nhãn nhỏ dạng viên thuốc cho trạng thái / số đếm / thẻ ("Mới", "Đã duyệt", "3"), kèm kiểu **con dấu** (`--stamp`:
chữ in hoa, viền đôi, nghiêng nhẹ — như `td-stamp` của 135). **Thuần CSS**: không JS, không custom element.
0.36.0: success / warning / danger / info là **màu đặc** (chữ trắng; warning chữ tối) và mọi badge có nền có **viền
mảnh + bóng nhẹ**, nên badge đặt trên nền **trùng màu** vẫn thấy mép.

| | |
|---|---|
| Import | không có module — chỉ cần `td.css` |
| Loại | Khối CSS |
| PHP | [`td_badge()`](../guides/php-adapter.md#td_badge-và-td_alert) |
| Từ phiên bản | 0.18.0 (icon từ 0.25.0, màu đặc + viền + bóng từ 0.36.0) |

## Ví dụ nhanh

```html
<span class="td-badge td-badge--success">Đã duyệt</span>
<span class="td-badge td-badge--danger td-badge--outline">Hết hạn</span>
<span class="td-badge td-badge--warning td-badge--stamp">Nháp</span>
```

```php
<?= td_badge('Đã duyệt', ['variant' => 'success']) ?>
<?= td_badge('Nháp', ['variant' => 'warning', 'stamp' => true]) ?>
<?= td_badge('Đã duyệt', ['variant' => 'success', 'icon' => 'check']) ?>  <!-- 0.25.0: có icon -->
```

### Badge có icon (0.25.0)

```html
<span class="td-badge td-badge--success">
  <span class="td-badge__icon" aria-hidden="true"><svg class="td-icon td-icon--s" data-icon="check" …>…</svg></span>
  <span class="td-badge__label">Đã duyệt</span>
</span>
```

- PHP: option `icon` của [`td_badge()`](../guides/php-adapter.md#td_badge-và-td_alert) nhận tên icon registry — core,
  alias (`x` → `close`) hoặc icon site `site-*` đã `Td::registerIcons()`. **Tên lạ → bỏ icon, giữ nhãn** (không có
  span icon rỗng; markup y như không truyền `icon`).
- HTML tay: tự in `span.td-badge__icon` (SVG từ `td_icon($name, 's')` hoặc `tdIcon(name, { size: 's' })` trong JS)
  trước `span.td-badge__label`. Badge vẫn **thuần CSS**, không có module JS.
- Icon chỉ trang trí (`aria-hidden="true"`) — nghĩa phải nằm ở nhãn. Cỡ `1em` (theo `--td-badge-font-size`),
  `flex: none`, màu = màu chữ (`currentColor`); gate tương phản đo icon ≥ 3.2:1 trên nền mọi variant.

## Class

| Class | Tác dụng |
|---|---|
| `.td-badge` | Khối gốc (mặc định = `neutral`) |
| `.td-badge--neutral` · `--accent` · `--success` · `--warning` · `--danger` · `--info` | Màu. `accent` theo `--td-accent` của site (cần `color-mix()`, không có thì dùng màu của `info`). |
| `.td-badge--outline` | Nền trong suốt, viền 1px cùng màu chữ, không bóng; chữ = mực trên trang `--td-badge-{v}-ink` (0.36.0) |
| `.td-badge--stamp` | Con dấu: chữ in hoa đậm, giãn chữ, viền đôi, nền trong suốt, không bóng, nghiêng `--td-badge-stamp-rotate`; chữ = `--td-badge-{v}-ink` |
| `.td-badge__icon` | (0.25.0) Ô icon trang trí trước nhãn: `1em × 1em`, `flex: none`; SVG `.td-icon` bên trong cũng `1em` |
| `.td-badge__label` | (0.25.0) Nhãn khi badge có icon (không icon thì chữ nằm thẳng trong `.td-badge`) |

`--outline` và `--stamp` dùng được với mọi màu. Badge có sẵn `vertical-align: middle` và `white-space: nowrap` để
đặt cạnh chữ / trong ô bảng.

## Tuỳ biến giao diện

| Token | Mặc định | Tác dụng |
|---|---|---|
| `--td-badge-radius` | `var(--td-radius-full)` | Bo góc (viên thuốc) |
| `--td-badge-font-family` | `var(--td-font-sans)` | Font của badge (0.19.0) |
| `--td-badge-stamp-font-family` | `var(--td-font-mono)` | Font của con dấu `--stamp` (0.19.0; trước đó dùng font sans) |
| `--td-badge-font-size` | `var(--td-text-xs)` | Cỡ chữ |
| `--td-badge-{variant}-bg` | neutral `var(--td-gray-100)`, accent tông nhạt của accent; success / warning / danger / info `var(--td-solid-{v}-bg)` (0.36.0) | Nền (kiểu thường) |
| `--td-badge-{variant}-fg` | neutral `#3f3f46`, accent tông đậm; ngữ nghĩa `var(--td-solid-{v}-fg)` (trắng, warning `#18181b`) | Chữ trên nền của badge (neutral / accent: cả outline / stamp) |
| `--td-badge-{success,warning,danger,info}-ink` | `#15803d` / `#b45309` / `#b91c1c` / `#2563eb` (dark: `#86efac` / `#fcd34d` / `#fca5a5` / `#93c5fd`) | 0.36.0: chữ + viền của `--outline` / `--stamp` (nền trong suốt — chữ trắng của nền đặc sẽ mất), ≥ 4.7:1 trên trang |
| `--td-badge-{variant}-border` | neutral `#ababac`, accent `#99a4b2`, success `#0f5a2b`, danger `#9a1b1b`, warning `#ac6f08`, info `#1a45a5` | 0.36.0: viền 1px của badge có nền = nền trộn 30 % đen, **hex tính sẵn** (không cần `color-mix()`, chạy từ Chrome 102). ≥ 1.6:1 với nền của chính nó, trắng và `#f4f4f5` |
| `--td-badge-shadow` | `0 1px 2px rgb(0 0 0 / 12%)` | 0.36.0: bóng nhẹ của badge có nền (outline / stamp không có) |
| `--td-badge-stamp-rotate` | `-4deg` | Độ nghiêng con dấu — **`0deg` để tắt** |
| `--td-badge-stamp-border` | `3px` | Độ dày viền đôi |
| `--td-badge-stamp-radius` | `var(--td-radius-sm)` | Bo góc con dấu |

```css
:root { --td-badge-stamp-rotate: 0deg; }            /* con dấu thẳng */
.invoice .td-badge--stamp { --td-badge-stamp-rotate: -8deg; } /* nghiêng hơn trong một vùng */
:root { --td-badge-stamp-font-family: var(--td-font-sans); } /* con dấu dùng lại font sans như 0.18.0 */
```

Theme tối có bộ màu riêng (nền đặc ngữ nghĩa giữ nguyên, mực outline / stamp sáng hơn). Chữ ≥ 4.7:1 trên nền của chính
nó **và** trên nền trang (outline / stamp) ở light + dark; viền ≥ 1.6:1 (gate `npm run test:contrast`). Badge không
tương tác nên WCAG 1.4.11 không đòi viền 3:1 — chữ mang thông tin; viền chỉ để badge không "tan" vào nền trùng màu.
Badge thuộc tầng nội dung → nền đặc, không kính. `prefers-contrast: more`: viền `currentColor`, bỏ bóng.

Badge trong media picker (`.td-media-picker__badges`) và dropzone `hint-style="badges"` dùng chung class nên tự đổi
theo. Muốn badge mềm như 0.18–0.35 (nền pastel, không viền / bóng):

```css
:root {
  --td-badge-shadow: none;
  --td-badge-success-bg: var(--td-pastel-success-bg); --td-badge-success-fg: var(--td-pastel-success-fg);
  --td-badge-success-border: transparent; /* lặp lại cho warning / danger / info; neutral / accent: -border transparent */
}
```

> **Ghi đè màu thì tự kiểm tương phản.** Gate của kit chỉ đo **giá trị mặc định**. Khi site ghi đè
> `--td-badge-*-fg` / `--td-badge-*-bg` (ví dụ trỏ vào màu thương hiệu), site phải tự kiểm chữ ≥ 4.5:1 trên nền của
> badge **và** trên nền trang (outline / stamp nền trong suốt) — ví dụ một màu cảnh báo `--c-warn` 3.07:1 là không
> đạt. Đổi font (`--td-badge-font-family` / `--td-badge-stamp-font-family`) cũng nên xem lại độ đậm/cỡ chữ.

## Trợ năng

- Badge chỉ là chữ: màu **không** được là thông tin duy nhất — chữ phải tự nói ("Đã duyệt", không chỉ "●").
- Số đếm cần ngữ cảnh cho trình đọc màn hình: `<span class="td-badge">3<span class="td-sr-only"> tin mới</span></span>`
  hoặc `aria-label` trên phần tử cha.
- Forced colors: chữ + viền dùng `CanvasText`. Tăng tương phản (`prefers-contrast: more`): viền `currentColor`, không bóng.

## Bảo mật

Thuần CSS. `td_badge()` escape chữ; `class` chỉ nhận token class hợp lệ, `attrs` qua whitelist như mọi helper.
