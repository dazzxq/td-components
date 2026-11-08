# Avatar `.td-avatar` (0.105.0)

Ảnh đại diện tròn, **thuần CSS** (không custom element, không JS bắt buộc). Có ảnh thì là `<img>`, chưa có ảnh thì là ô
tròn chứa chữ cái đầu của tên (hoặc một icon). Style trong `td.css` (`components/avatar.css`). Helper PHP `td_avatar()`
và JS `tdAvatar()` in sẵn markup.

## Markup

```html
<img class="td-avatar td-avatar--sm" src="/u/42.jpg" alt="" width="32" height="32" loading="lazy" decoding="async">
<span class="td-avatar td-avatar--empty" aria-hidden="true">A</span>
<span class="td-avatar td-avatar--lg td-avatar--empty" aria-hidden="true"><svg class="td-icon td-icon--l" …></svg></span>
```

| lớp | ý nghĩa |
|---|---|
| `.td-avatar` | gốc: tròn 40px, ảnh cắt `object-fit: cover`, vòng kép (khe + đường 1px) |
| `--xs` / `--sm` / `--lg` | 22 / 32 / 96px (cỡ `m` = gốc, không có lớp) |
| `--empty` | ô trống: nền + chữ cái đầu (hoặc `.td-icon`, tự chiếm 50%), căn giữa sẵn |

- Avatar là **trang trí**: tên người luôn in cạnh, nên `alt=""` và `aria-hidden="true"`. Avatar đứng một mình (không
  có tên cạnh) thì site tự viết markup có `alt` / `role="img" aria-label`.
- Cỡ luôn đúng token, kể cả khi site có reset `img { max-width: 100%; height: auto }` ngoài layer: `inline-size`,
  `block-size`, `max-inline-size` của `.td-avatar` là `!important` trong layer. Đổi cỡ thì **chỉ qua token**
  `--td-avatar-size`, không qua `width` / `max-width`.
- Ảnh lỗi: kit không tự đổi sang ô trống (CSP cấm `onerror` inline). Site cần thì tự bắt sự kiện `error`.

## Token

| token | mặc định | |
|---|---|---|
| `--td-avatar-size` | `40px` | cỡ; đổi một chỗ: `.comment .td-avatar { --td-avatar-size: 34px }` |
| `--td-avatar-size-xs` / `-sm` / `-lg` | `22px` / `32px` / `96px` | cỡ của các lớp |
| `--td-avatar-font-size` (+ `-xs` / `-sm` / `-lg`) | `1.375rem` / `11px` / `0.875rem` / `clamp(2.25rem, 4.5vw, 3.25rem)` | chữ ô trống |
| `--td-avatar-font-family` / `-font-weight` | `var(--td-font-sans)` / `800` | |
| `--td-avatar-bg` / `--td-avatar-fg` | `--td-color-fill` / `--td-color-text` | ô trống (đạt contrast sáng + tối) |
| `--td-avatar-ring-width` / `-ring-gap-width` | `1px` / `2px` (`--xs`: khe `1.5px`) | |
| `--td-avatar-ring-gap` / `-ring-color` | `--td-color-surface` / `--td-color-border` | khe = nền quanh avatar |
| `--td-avatar-ring` | *(không khai báo)* | ghi đè cả vòng: `none` bỏ vòng ở mọi cỡ |

Cỡ tuỳ biến thì đặt cả cỡ chữ: `.profile .td-avatar { --td-avatar-size: 72px; --td-avatar-font-size: 1.75rem }`.

## Helper

```php
<?= td_avatar($user['avatar_url'] ?? null, $user['display_name'], 'sm') ?>
```

```js
import { tdAvatar } from '@dazzxq/td-components/avatar';
row.prepend(tdAvatar(user.avatarUrl, user.name, 'sm'));
```

- `td_avatar(?string $src, string $name = '', string $size = 'm')` / `tdAvatar(src, name = '', size = 'm')`: đúng 3
  tham số, không mảng tuỳ chọn. Cỡ `xs | sm | m | lg`, lạ → `m`.
- `src` lọc như ảnh của card: `https:`, `http:` (PHP mọi trang; JS chỉ khi trang là http), URL tương đối; `javascript:`
  / `data:` / `mailto:` bị bỏ → ô trống.
- Chữ cái đầu: ký tự (grapheme) đầu tiên của tên sau khi bỏ khoảng trắng đầu, viết hoa; tên rỗng → `?`. Tiếng Việt
  đúng cả khi PHP thiếu `mbstring` / `intl` (bảng chữ có dấu riêng); chữ ngoài bảng (ví dụ `ñ`) khi đó giữ nguyên.
- Cần thêm (lớp riêng, icon trong ô trống) thì viết markup ở trên bằng tay.

## Chuyển sang từ site

- **135**: xoá khối `.td-avatar*` trong `public/assets/app/base.css` (kit có cùng tên lớp, cùng hình); bỏ các dòng
  `display: grid; place-items: center` thêm riêng (kit căn giữa sẵn). Màu và font theo token của 135:
  `--td-avatar-bg: var(--c-kraft); --td-avatar-ring-gap: var(--c-paper-2); --td-avatar-ring-color: var(--c-rule);
  --td-avatar-font-family: var(--f-display)`. `mb_strtoupper(mb_substr(...))` đổi thành `td_avatar()`.
- **dwp**: `:root { --td-avatar-ring: none }` (đa số avatar dwp không vòng); 32px = `td-avatar--sm`, 48 / 72px đặt
  `--td-avatar-size` + `--td-avatar-font-size`; hình người placeholder = `td_icon()` trong `span.td-avatar--empty`.
