[Tài liệu](../README.md) › [Components](README.md) › Badge

# Nhãn trạng thái — `.td-badge`

Nhãn nhỏ dạng viên thuốc cho trạng thái / số đếm / thẻ ("Mới", "Đã duyệt", "3"), kèm kiểu **con dấu** (`--stamp`:
chữ in hoa, viền đôi, nghiêng nhẹ — như `td-stamp` của 135). **Thuần CSS**: không JS, không custom element.
0.76.0: mặc định badge là **tinted** — nền pastel (~200), chữ đậm (~800), viền 1px trong suốt, bóng mềm hai lớp
(dark: nền ~900, chữ ~200). Thêm `.td-badge--glass` nếu muốn kính mờ (opt-in). Muốn lại kiểu màu đặc của 0.36–0.75:
xem [Muốn lại kiểu cũ](#muốn-lại-kiểu-màu-đặc-036075).

| | |
|---|---|
| Import | không có module — chỉ cần `td.css` |
| Loại | Khối CSS |
| PHP | [`td_badge()`](../guides/php-adapter.md#td_badge-và-td_alert) |
| Từ phiên bản | 0.18.0 (icon từ 0.25.0, màu đặc từ 0.36.0, tinted + `--glass` từ 0.76.0) |

## Ví dụ nhanh

```html
<span class="td-badge td-badge--success">Đã duyệt</span>
<span class="td-badge td-badge--danger td-badge--outline">Hết hạn</span>
<span class="td-badge td-badge--warning td-badge--stamp">Nháp</span>
<span class="td-badge td-badge--info td-badge--glass">Kính</span>  <!-- 0.76.0: opt-in -->
```

```php
<?= td_badge('Đã duyệt', ['variant' => 'success']) ?>
<?= td_badge('Nháp', ['variant' => 'warning', 'stamp' => true]) ?>
<?= td_badge('Kính', ['variant' => 'info', 'glass' => true]) ?>  <!-- 0.76.0 -->
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
| `.td-badge--glass` | (0.76.0) Opt-in kính mờ: nền = màu tint trộn 85 % alpha (`color-mix`) + `backdrop-filter: blur(12px) saturate(160%)`, mép sáng + highlight bên trong; chữ = `--td-badge-{v}-glass-fg`. **Không tác dụng khi đi cùng `--outline` / `--stamp`** (hai kiểu này thắng). Xem [Glass và fallback](#glass-và-fallback) |
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
| `--td-badge-{variant}-bg` | light: neutral `#e4e4e7`, accent `#cfe0fd` (tông nhạt của `--td-accent`, 22 % + trắng khi có `color-mix()`), success `#bbf7d0`, warning `#fed7aa`, danger `#fecaca`, info `#bfdbfe`; dark: ~900 (`#3f3f46`, `#1e3a8a`, `#14532d`, `#7c2d12`, `#7f1d1d`, `#1e3a8a`) | Nền (0.76.0: tinted) |
| `--td-badge-{variant}-fg` | light ~800: neutral `#3f3f46`, accent `#1e3f8f`, success `#166534`, warning `#9a3412`, danger `#991b1b`, info `#1e40af`; dark ~200 | Chữ trên nền của badge (neutral / accent: cả outline / stamp) |
| `--td-badge-{success,warning,danger,info}-ink` | `var(--td-color-success)` / `var(--td-color-warning)` / `var(--td-color-error)` / `#2563eb` (dark: `#86efac` / `#fcd34d` / `#fca5a5` / `#93c5fd`) | Chữ + viền của `--outline` / `--stamp` (nền trong suốt), ≥ 4.7:1 trên trang. Không đổi ở 0.76.0 |
| `--td-badge-{variant}-border` | `transparent` | 0.76.0: viền 1px vẫn chiếm chỗ nhưng trong suốt (trước 0.76.0 là hex tính sẵn của kiểu màu đặc) |
| `--td-badge-shadow` | `0 1px 2px rgb(0 0 0 / 10%), 0 2px 6px -1px rgb(0 0 0 / 10%)` (dark: 50 % / 45 %) | 0.76.0: bóng mềm hai lớp của badge có nền (outline / stamp không có) |
| `--td-badge-{variant}-glass-fg` | light: `#27272a`, `#172554`, `#14532d`, `#7c2d12`, `#7f1d1d`, `#1e3a8a`; dark: `#f4f4f5`, `#dbeafe`, `#dcfce7`, `#ffedd5`, `#fee2e2`, `#dbeafe` | 0.76.0: chữ của `--glass` (đậm hơn `-fg` vì nền mờ có thể sáng/tối hơn tint) |
| `--td-badge-glass-alpha` | `85%` | 0.76.0: độ đặc của nền glass |
| `--td-badge-glass-blur` | `12px` | 0.76.0: độ mờ `backdrop-filter` của glass |
| `--td-badge-glass-edge` · `--td-badge-glass-highlight` | `rgb(255 255 255 / 55%)` · `rgb(255 255 255 / 60%)` (dark: 16 % · 12 %) | 0.76.0: màu mép và highlight trong (inset) của glass |
| `--td-badge-stamp-rotate` | `-4deg` | Độ nghiêng con dấu — **`0deg` để tắt** |
| `--td-badge-stamp-border` | `3px` | Độ dày viền đôi |
| `--td-badge-stamp-radius` | `var(--td-radius-sm)` | Bo góc con dấu |

```css
:root { --td-badge-stamp-rotate: 0deg; }            /* con dấu thẳng */
.invoice .td-badge--stamp { --td-badge-stamp-rotate: -8deg; } /* nghiêng hơn trong một vùng */
:root { --td-badge-stamp-font-family: var(--td-font-sans); } /* con dấu dùng lại font sans như 0.18.0 */
```

Theme tối có bộ màu riêng (nền ~900, chữ ~200; mực outline / stamp sáng hơn). Chữ ≥ 4.7:1 trên nền của chính nó
**và** trên nền trang (outline / stamp) ở light + dark (gate `npm run test:contrast`); với glass, chữ được đo trên
tint đặc và trên tint trộn alpha trên nền đen / trắng. Badge không tương tác nên WCAG 1.4.11 không đòi viền 3:1 — chữ
mang thông tin.

### Glass và fallback

`--glass` chỉ bật khi trình duyệt có **cả** `backdrop-filter` và `color-mix()`. Mọi trường hợp sau đều rơi về **màu
tint đặc, không blur**: không hỗ trợ hai tính năng trên, `prefers-reduced-transparency: reduce`,
`:root[data-td-glass="off"]`, `prefers-contrast: more` (viền `currentColor`), `forced-colors: active` (viền
`CanvasText`). Lưu ý: WebKit chưa hỗ trợ `prefers-reduced-transparency` ở mọi bản — site cần tắt kính cho người dùng
đó thì đặt `data-td-glass="off"` trên `<html>`. Glass chỉ hợp khi **có nội dung đa sắc nằm sau** badge (ảnh, gradient);
trên nền phẳng nó trông gần như tint thường. Chi tiết quy ước: [Minimal surfaces](../internal/design/liquid-glass.md).

Badge trong media picker (`.td-media-picker__badges`) và dropzone `hint-style="badges"` dùng chung class nên tự đổi
theo.

### Muốn lại kiểu màu đặc (0.36–0.75)

```css
:root {
  --td-badge-shadow: 0 1px 2px rgb(0 0 0 / 12%);
  --td-badge-success-bg: var(--td-solid-success-bg); --td-badge-success-fg: var(--td-solid-success-fg);
  --td-badge-success-border: #0f5a2b;
  /* lặp lại cho warning (#ac6f08) / danger (#9a1b1b) / info (#1a45a5) với --td-solid-{v}-bg / -fg */
}
```

Muốn lại kiểu pastel không viền / bóng của 0.18–0.35: `--td-badge-shadow: none` và `--td-pastel-{v}-bg` / `-fg`.

> **Ghi đè màu thì tự kiểm tương phản.** Gate của kit chỉ đo **giá trị mặc định**. Khi site ghi đè
> `--td-badge-*-fg` / `--td-badge-*-bg` (ví dụ trỏ vào màu thương hiệu), site phải tự kiểm chữ ≥ 4.5:1 trên nền của
> badge **và** trên nền trang (outline / stamp nền trong suốt) — ví dụ một màu cảnh báo `--c-warn` 3.07:1 là không
> đạt. Đổi font (`--td-badge-font-family` / `--td-badge-stamp-font-family`) cũng nên xem lại độ đậm/cỡ chữ.

## Trợ năng

- Badge chỉ là chữ: màu **không** được là thông tin duy nhất — chữ phải tự nói ("Đã duyệt", không chỉ "●").
- Số đếm cần ngữ cảnh cho trình đọc màn hình: `<span class="td-badge">3<span class="td-sr-only"> tin mới</span></span>`
  hoặc `aria-label` trên phần tử cha.
- Forced colors: chữ + viền dùng `CanvasText`. Tăng tương phản (`prefers-contrast: more`): viền `currentColor`, không bóng; glass rơi về tint đặc (xem [Glass và fallback](#glass-và-fallback)).

## Bảo mật

Thuần CSS. `td_badge()` escape chữ; `class` chỉ nhận token class hợp lệ, `attrs` qua whitelist như mọi helper.
