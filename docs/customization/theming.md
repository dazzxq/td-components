[Tài liệu](../README.md) › Tuỳ biến › Theming (token `--td-*`)

# Theming bằng token `--td-*`

Toàn bộ màu, cỡ chữ, bo góc, khoảng cách, chuyển động và chất liệu kính (Liquid Glass) của td-components đều đi qua
**CSS custom property** tên `--td-*` (gọi là *token*). Component không bao giờ "cứng" một giá trị màu: chúng chỉ đọc
`var(--td-…)`. Vì vậy muốn đổi giao diện cho một site, bạn **không sửa lõi**, chỉ ghi đè token trong CSS của site.

Trang này trả lời: token là gì, có những token công khai nào, ghi đè ở đâu cho chắc thắng, bật dark theme / tắt kính
thế nào, và kit tự xử lý các chế độ trợ năng của hệ điều hành ra sao.

> Trang liên quan: [styling.md](styling.md) (cascade layer, override class BEM, CSSOM per-instance) ·
> [hooks.md](hooks.md) (tuỳ biến bằng JS) · [../guides/accessibility.md](../guides/accessibility.md).

## Mục lục

- [Token hoạt động thế nào](#token-hoạt-động-thế-nào)
- [Ghi đè ở đâu: CSS không layer vs `@layer`](#ghi-đè-ở-đâu-css-không-layer-vs-layer)
- [Ba bẫy hay gặp khi ghi đè token](#ba-bẫy-hay-gặp-khi-ghi-đè-token)
- [Danh mục token công khai](#danh-mục-token-công-khai)
  - [Bố cục (width, gutter)](#bố-cục)
  - [Chữ (font, cỡ, line-height, weight)](#chữ)
  - [Khoảng cách](#khoảng-cách)
  - [Thang xám](#thang-xám)
  - [Bo góc](#bo-góc)
  - [Bóng đổ và hairline](#bóng-đổ-và-hairline)
  - [Z-index](#z-index)
  - [Chuyển động](#chuyển-động)
  - [Màu ngữ nghĩa](#màu-ngữ-nghĩa)
  - [Accent và focus](#accent-và-focus)
  - [Control (ô nhập, viền mềm)](#control-ô-nhập-viền-mềm)
  - [Button](#button)
  - [Checkbox / switch](#checkbox--switch)
  - [Lỗi form](#lỗi-form)
  - [Icon](#icon)
  - [Liquid Glass: vật liệu Regular](#liquid-glass-vật-liệu-regular)
  - [Liquid Glass: Clear, dim, tint](#liquid-glass-clear-dim-tint)
  - [Liquid Glass: tương tác, scrim, hình học, chuyển động](#liquid-glass-tương-tác-scrim-hình-học-chuyển-động)
- [Viền control mềm và override chuẩn WCAG nghiêm ngặt](#viền-control-mềm-và-override-chuẩn-wcag-nghiêm-ngặt)
- [Dark theme (opt-in)](#dark-theme-opt-in)
- [Tắt kính: `data-td-glass="off"`](#tắt-kính-data-td-glassoff)
- [Kit tự thích ứng với cài đặt trợ năng](#kit-tự-thích-ứng-với-cài-đặt-trợ-năng)
- [Tinh chỉnh kính cho hợp site](#tinh-chỉnh-kính-cho-hợp-site)
- [Ví dụ đầu-cuối: đổi màu thương hiệu (accent)](#ví-dụ-đầu-cuối-đổi-màu-thương-hiệu-accent)
- [Theme theo vùng](#theme-theo-vùng)
- [Token riêng của từng component](#token-riêng-của-từng-component)
- [Không bao giờ đụng vào token private](#không-bao-giờ-đụng-vào-token-private)

## Token hoạt động thế nào

`td.css` (file CSS duy nhất của kit) mở đầu bằng một câu khai báo thứ tự layer:

```css
@layer td.tokens, td.component, td.utilities;
```

- `td.tokens`: nơi khai báo giá trị mặc định của mọi token trên `:root` (file nguồn `src/styles/tokens.css`,
  `theme-dark.css` và khối `@layer td.tokens` đầu mỗi file `src/styles/components/*.css`).
- `td.component`: CSS của từng component (class BEM `.td-…`), chỉ đọc token.
- `td.utilities`: tiện ích nhỏ (hiện chỉ có `.td-sr-only`).

Một token tham chiếu token khác, ví dụ:

```css
--td-btn-primary-bg: var(--td-accent-fill);   /* --td-accent-fill: var(--td-accent) */
--td-field-border: var(--td-control-border-soft);
```

Nhờ vậy đổi **một** token gốc (như `--td-accent`) là mọi token "con" đi theo — với điều kiện bạn ghi đè ở đúng chỗ
(xem [Ba bẫy hay gặp](#ba-bẫy-hay-gặp-khi-ghi-đè-token)).

Có hai loại token:

| Loại | Tiền tố | Bạn được ghi đè? |
|---|---|---|
| Public | `--td-…` | Có, đây là "hợp đồng theme" |
| Private | `--_td-…` (có gạch dưới) | **Không**. Kit dùng chúng cho fallback trợ năng; xem [cuối trang](#không-bao-giờ-đụng-vào-token-private) |

## Ghi đè ở đâu: CSS không layer vs `@layer`

Luật cascade quan trọng nhất: **CSS không nằm trong `@layer` nào luôn thắng CSS nằm trong layer**, bất kể
specificity hay thứ tự file. Vì `td.css` đặt mọi thứ trong layer, bạn chỉ cần viết CSS "thường":

```css
/* site.css — KHÔNG bọc trong @layer */
:root {
  --td-accent: #b3261e;
  --td-font-sans: "Be Vietnam Pro", system-ui, sans-serif;
  --td-radius-lg: 10px;
}
```

Thứ tự `<link>` không quan trọng với cách này: `site.css` nạp trước hay sau `td.css` đều thắng.

Nếu site của bạn **bắt buộc** dùng `@layer` (ví dụ Tailwind v4 hay một design system có layer riêng), hãy nhớ: với
khai báo bình thường, **layer khai báo sau thắng layer khai báo trước**, và thứ tự được chốt ở lần đầu trình duyệt gặp
tên layer. Nếu layer của site được khai báo trước `td.css`, CSS của td sẽ thắng CSS của bạn. Cách chắc chắn: đặt câu
khai báo thứ tự ở đầu file CSS đầu tiên của trang (nạp **trước** `td.css`):

```css
/* file CSS đầu tiên của trang */
@layer td, site;            /* td (gồm td.tokens / td.component / td.utilities) đứng trước → layer "site" thắng */

@layer site {
  :root { --td-accent: #b3261e; }
}
```

Chi tiết về layer và cách override class: [styling.md](styling.md#thứ-tự-cascade-layer).

## Ba bẫy hay gặp khi ghi đè token

**1. Override "light" của bạn cũng áp dụng cho dark.** Dark theme của kit nằm trong `@layer td.tokens` với selector
`:root[data-td-theme="dark"]`. Rule không layer `:root { --td-color-bg: #fffaf0 }` của bạn thắng cả rule dark đó (layer
thắng specificity). Nếu site có dark theme, hãy khai báo riêng cho dark, hoặc giới hạn override light:

```css
:root:not([data-td-theme="dark"]) { --td-color-bg: #fffaf0; }
:root[data-td-theme="dark"]       { --td-color-bg: #14120f; }
```

**2. Token được tính tại nơi khai báo.** `--td-btn-primary-bg: var(--td-accent-fill)` (và `--td-accent-fill:
var(--td-accent)`) được khai báo trên `:root`, nên `var(--td-accent)` được "giải" tại `:root` rồi mới kế thừa xuống. Hệ
quả:

- Ghi đè `--td-accent` trên `:root` → nút primary, checkbox, slider, pagination, tint kính… đổi theo. Đúng ý.
- Ghi đè `--td-accent` trên **một vùng** (`.sidebar { --td-accent: red }`) → **không** làm nút primary trong vùng đó
  đổi, vì `--td-btn-primary-bg` đã được tính ở `:root`. Muốn đổi theo vùng, ghi đè thẳng token con
  (`.sidebar { --td-btn-primary-bg: red; --td-checkbox-color: red; }`). Xem [Theme theo vùng](#theme-theo-vùng).

**3. Modifier kích thước đặt token trên chính phần tử.** Từ 0.16.0 mọi token kích thước **mặc định** đều khai báo trên
`:root` (trước đó `--td-lb-*`, `--td-checkbox-box`, `--td-switch-w/-h/-thumb-d`, `--td-spinner-size`,
`--td-empty-state-pad/-gap` nằm trên phần tử và ghi đè ở `:root` không có tác dụng). Nhưng class cỡ (`--sm`, `--lg`,
`--compact`, `.td-table__cell--px-*`) vẫn cố ý đặt lại token trên phần tử, nên `:root { --td-checkbox-box: 30px }` chỉ
đổi checkbox cỡ mặc định; muốn đổi cỡ `sm` thì nhắm `.td-checkbox--sm`. Hai token **dẫn xuất** (`--td-switch-pad`,
`--td-lb-bar-h`) được tính trên phần tử từ các token kia, nên chúng tự đi theo. Danh sách ở
[Token riêng của từng component](#token-riêng-của-từng-component).

## Danh mục token công khai

Giá trị mặc định lấy từ `src/styles/tokens.css` (light). Cột "Dark" chỉ ghi khi `theme-dark.css` đổi giá trị; ô trống
= dark dùng lại giá trị light.

### Bố cục

| Token | Mặc định | Dùng cho |
|---|---|---|
| `--td-w-text` | `640px` | Độ rộng cột chữ (dành cho site; component không dùng) |
| `--td-w-wide` | `960px` | Khung rộng (dành cho site) |
| `--td-w-wider` | `1280px` | Khung rất rộng (dành cho site) |
| `--td-gutter` | `16px` | Lề hai bên (dành cho site) |
| `--td-gap` | `24px` | Khoảng cách khối (dành cho site) |

### Chữ

| Token | Mặc định |
|---|---|
| `--td-font-sans` | `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Inter, Roboto, "Helvetica Neue", Arial, sans-serif` |
| `--td-font-mono` | `ui-monospace, "SFMono-Regular", "JetBrains Mono", Menlo, Consolas, monospace` |
| `--td-text-xs` | `0.75rem` |
| `--td-text-sm` | `0.875rem` |
| `--td-text-base` | `1rem` |
| `--td-text-md` | `1.125rem` |
| `--td-text-lg` | `1.25rem` |
| `--td-text-xl` | `1.5rem` |
| `--td-text-2xl` | `2rem` |
| `--td-leading-tight` | `1.25` |
| `--td-leading-normal` | `1.5` |
| `--td-leading-relaxed` | `1.7` |
| `--td-fw-normal` | `400` |
| `--td-fw-medium` | `500` |
| `--td-fw-semibold` | `600` |
| `--td-fw-bold` | `700` |

Component tự đặt `font-family: var(--td-font-sans)` trên khối gốc của nó, nên font của site **không** tự lan vào kit.
Muốn kit dùng font của site: đổi `--td-font-sans` (xem [styling.md › Font](styling.md#font)).
Badge có token font riêng (0.19.0): `--td-badge-font-family` (mặc định `var(--td-font-sans)`) và
`--td-badge-stamp-font-family` (mặc định `var(--td-font-mono)` — con dấu `.td-badge--stamp` dùng font mono), xem
[badge.md](../components/badge.md#tuỳ-biến-giao-diện).

### Khoảng cách

| Token | Mặc định |
|---|---|
| `--td-space-2xs` | `0.25rem` |
| `--td-space-xs` | `0.5rem` |
| `--td-space-sm` | `0.75rem` |
| `--td-space-md` | `1rem` |
| `--td-space-lg` | `1.5rem` |
| `--td-space-xl` | `2.25rem` |

### Thang xám

| Token | Mặc định |
|---|---|
| `--td-gray-50` | `#f7f7f8` |
| `--td-gray-100` | `#f0f0f2` |
| `--td-gray-200` | `#e4e4e7` |
| `--td-gray-300` | `#d4d4d8` |
| `--td-gray-400` | `#a1a1aa` |
| `--td-gray-500` | `#8a8a93` |
| `--td-gray-600` | `#6b6b73` |
| `--td-gray-700` | `#45454b` |
| `--td-gray-800` | `#2c2c30` |
| `--td-gray-900` | `#1c1c1e` |
| `--td-gray-950` | `#111113` |

Thang xám **không** đổi trong dark; dark đổi các token ngữ nghĩa bên dưới.

### Bo góc

| Token | Mặc định | Ghi chú |
|---|---|---|
| `--td-radius-sm` | `4px` | |
| `--td-radius-md` | `8px` | Mặc định của `--td-control-radius`, `--td-tooltip-radius` |
| `--td-radius-lg` | `14px` | Mặc định của `--td-btn-radius` |
| `--td-radius-xl` | `20px` | |
| `--td-radius-full` | `9999px` | |

### Bóng đổ và hairline

| Token | Mặc định | Dark |
|---|---|---|
| `--td-shadow-1` | `0 1px 2px rgb(0 0 0 / 6%)` | |
| `--td-shadow-2` | `0 2px 8px rgb(0 0 0 / 8%)` | |
| `--td-shadow-3` | `0 8px 24px rgb(0 0 0 / 12%)` | |
| `--td-hairline` | `rgb(0 0 0 / 7%)` | `rgb(255 255 255 / 8%)` |

### Z-index

| Token | Mặc định | Lớp |
|---|---|---|
| `--td-z-dropdown` | `100` | **Dự trữ**: không component nào dùng (menu của td-dropdown dùng `--td-z-popover`); giữ vì là token public |
| `--td-z-sticky` | `200` | **Dự trữ**, dành cho site (header dính của site) |
| `--td-z-overlay` | `300` | **Dự trữ**, dành cho site |
| `--td-z-lightbox` | `350` | TdLightbox (dưới modal: confirm/menu mở được trên lightbox) |
| `--td-z-modal` | `400` | TdModal (kể cả picker của td-datetime-picker) |
| `--td-z-popover` | `450` | TdMenu, TdHovercard, menu của td-dropdown, popup gợi ý của td-chip-input |
| `--td-z-loading` | `480` | overlay loading chặn thao tác |
| `--td-z-toast` | `500` | toast |
| `--td-z-tooltip` | `510` | tooltip |

Các con số này phản chiếu hằng `LAYERS` trong `src/utils/layers.js` (JS dùng để quyết định lớp nào nhận phím Escape/Tab
và lớp nào bị `inert`). Đổi token chỉ đổi thứ tự **vẽ**, không đổi thứ tự **bàn phím**. Nếu site có thanh cố định cao
hơn 400, hãy **dịch cả bộ** `--td-z-*` lên cùng một khoảng (giữ nguyên thứ tự tương đối), đừng đổi riêng một token.

### Chuyển động

| Token | Mặc định |
|---|---|
| `--td-dur-fast` | `120ms` |
| `--td-dur-base` | `200ms` |
| `--td-dur-slow` | `320ms` |
| `--td-ease` | `cubic-bezier(0.4, 0, 0.2, 1)` |
| `--td-ease-out` | `cubic-bezier(0.22, 1, 0.36, 1)` |
| `--td-ease-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` |

Người dùng bật "giảm chuyển động" (`prefers-reduced-motion: reduce`) thì kit tự tắt hiệu ứng co giãn / nhún; xem
[Kit tự thích ứng](#kit-tự-thích-ứng-với-cài-đặt-trợ-năng).

### Màu ngữ nghĩa

Đây là "hợp đồng theme" chính. Component dùng các token này, không dùng thẳng thang xám.

| Token | Mặc định | Dark | Dùng cho |
|---|---|---|---|
| `--td-color-bg` | `#fbfbfa` | `#111113` | Nền trang (tham chiếu khi tính màu tương phản) |
| `--td-color-surface` | `#fff` | `#1c1c1e` | Bề mặt đặc (bảng, thẻ, fallback tương phản cao) |
| `--td-color-surface-muted` | `var(--td-gray-50)` | `#242427` | Bề mặt phụ, readonly |
| `--td-color-text` | `var(--td-gray-900)` | `#f5f5f7` | Chữ chính |
| `--td-color-text-muted` | `var(--td-gray-600)` | `#a1a1aa` | Chữ phụ |
| `--td-color-text-subtle` | `var(--td-gray-500)` | `#8a8a93` | Chữ rất nhạt |
| `--td-color-border` | `var(--td-gray-200)` | `#2c2c30` | Viền nhẹ |
| `--td-color-border-strong` | `var(--td-gray-300)` | `#45454b` | Viền đậm hơn |
| `--td-color-sheen` | `rgb(255 255 255 / 60%)` | `rgb(255 255 255 / 8%)` | Ánh sáng lướt của skeleton |
| `--td-color-hover` | `rgb(0 0 0 / 5%)` | `rgb(255 255 255 / 6%)` | Nền hover |
| `--td-color-hover-strong` | `rgb(0 0 0 / 8%)` | `rgb(255 255 255 / 10%)` | Nền hover đậm |
| `--td-color-overlay` | `rgb(10 10 12 / 45%)` | `rgb(0 0 0 / 60%)` | Scrim sau modal |
| `--td-color-skeleton` | `var(--td-gray-100)` | `#242427` | Khối skeleton |
| `--td-color-success` | `#15803d` | `#22c55e` | Chữ/biểu tượng trạng thái thành công |
| `--td-color-warning` | `#b45309` | `#f59e0b` | Cảnh báo |
| `--td-color-error` | `#b91c1c` | `#f87171` | Lỗi |
| `--td-color-info` | `#1d4ed8` | `#60a5fa` | Thông tin |
| `--td-color-on-status` | `#fff` | `#111113` | Chữ đặt trên nền màu trạng thái |

### Accent và focus

| Token | Mặc định | Dark | Dùng cho |
|---|---|---|---|
| `--td-accent` | `#2563eb` | `#3b82f6` | Màu thương hiệu: nút primary, checkbox, slider, pagination, tint kính, link hovercard, spinner loading |
| `--td-accent-contrast` | `#fff` | `#fff` | Chữ đặt trên accent |
| `--td-accent-fill` | `var(--td-accent)` | `color-mix(in srgb, var(--td-accent) 80%, #000)` (trình duyệt không có `color-mix()`: `#2563eb`) | Nền **đặc** mang chữ trắng: nút primary, trang hiện tại của pagination (0.16.0) |
| `--td-focus` | `#2563eb` | `#60a5fa` | Màu focus của ô nhập |
| `--td-focus-ring` | `0 0 0 3px rgb(37 99 235 / 35%)` | `0 0 0 3px rgb(96 165 250 / 45%)` | Vòng focus (`box-shadow`) dùng chung mọi control |

`--td-accent-fill` đi theo `--td-accent`: ở dark nó là accent tối đi 20% (mặc định `#3b82f6` → ≈ `#2f68c5`, chữ trắng
≈ 5.3:1), nên đổi **một** token `--td-accent` là nút primary và trang active đổi theo ở cả light lẫn dark. Muốn chỉnh
riêng màu nền đặc (ví dụ accent của bạn quá sáng để mang chữ trắng), ghi đè `--td-accent-fill`.

Đổi `--td-accent` mà không đổi `--td-focus` / `--td-focus-ring` thì vòng focus vẫn xanh dương. Thường nên đổi cả ba,
xem [ví dụ thương hiệu](#ví-dụ-đầu-cuối-đổi-màu-thương-hiệu-accent).

### Control (ô nhập, viền mềm)

| Token | Mặc định | Dark | Dùng cho |
|---|---|---|---|
| `--td-control-bg` | `#fff` | `#1c1c1e` | Nền ô nhập, nút không variant |
| `--td-control-fg` | `var(--td-gray-900)` | `#f5f5f7` | Chữ trong control |
| `--td-control-border` | `var(--td-gray-300)` | `#45454b` | Viền control chung (nút không variant) |
| `--td-control-radius` | `var(--td-radius-md)` | | Bo góc control |
| `--td-control-border-strong` | `var(--td-gray-500)` | `#8a8a93` | Viền đạt ≥ 3:1 trên nền trắng (3.42:1) |
| `--td-control-border-soft` | `#d1d1d6` | `#3a3a3c` | **Viền lúc nghỉ** của field, dropdown, datetime, chip-input, toggle, checkbox, viền nút secondary (~1.5:1, v0.14.1) |
| `--td-control-border-hover` | `#aeaeb2` | `#636366` | Viền khi hover, viền option đang active (~2.2:1, v0.14.2) |
| `--td-touch-min` | `44px` | | Vùng chạm tối thiểu trên màn hình cảm ứng |

Xem [Viền control mềm và override chuẩn WCAG nghiêm ngặt](#viền-control-mềm-và-override-chuẩn-wcag-nghiêm-ngặt).

### Button

Button là **kính có tint** (Liquid Glass, v0.14.0): màu variant được pha ở độ đục `-alpha`, thêm một lớp "phim"
(`-film`) để giữ tương phản chữ, sheen và viền sáng. Nút có thuộc tính `color` tuỳ biến thì luôn là nền đặc.

| Token | Mặc định | Dark |
|---|---|---|
| `--td-btn-radius` | `var(--td-radius-lg)` | |
| `--td-btn-primary-bg` | `var(--td-accent-fill)` | |
| `--td-btn-primary-fg` | `var(--td-accent-contrast)` | |
| `--td-btn-primary-tint` | `var(--td-btn-primary-bg)` | |
| `--td-btn-primary-alpha` | `94%` | |
| `--td-btn-primary-film` | `rgb(0 0 0 / 10%)` | |
| `--td-btn-secondary-bg` | `var(--td-gray-100)` | `#2c2c30` |
| `--td-btn-secondary-fg` | `var(--td-gray-900)` | `#f5f5f7` |
| `--td-btn-secondary-border` | `rgb(0 0 0 / 12%)` | `rgb(255 255 255 / 12%)` |
| `--td-btn-secondary-hover` | `var(--td-gray-200)` | `#3a3a3e` |
| `--td-btn-secondary-glass` | `rgb(255 255 255 / 80%)` | `rgb(40 40 44 / 84%)` |
| `--td-btn-secondary-edge` | `var(--td-control-border-soft)` | `rgb(255 255 255 / 14%)` |
| `--td-btn-success-tint` / `-alpha` / `-film` / `-fg` | `#15803d` / `94%` / `rgb(0 0 0 / 13%)` / `#fff` | |
| `--td-btn-danger-tint` / `-alpha` / `-film` / `-fg` | `#b91c1c` / `94%` / `rgb(0 0 0 / 6%)` / `#fff` | |
| `--td-btn-info-tint` / `-alpha` / `-film` / `-fg` | `#1d4ed8` / `94%` / `rgb(0 0 0 / 6%)` / `#fff` | |
| `--td-btn-warning-tint` / `-alpha` / `-film` / `-fg` | `#f59e0b` / `86%` / `rgb(255 255 255 / 10%)` / `#111113` | |
| `--td-btn-sheen` | `linear-gradient(135deg, rgb(255 255 255 / 12%) 0%, rgb(255 255 255 / 3%) 30%, transparent 55%)` | |
| `--td-btn-disabled-bg` | `#f4f4f5` | `#202024` |
| `--td-btn-disabled-fg` | `#a1a1aa` | `#6b6b73` |
| `--td-btn-disabled-border` | `#e4e4e7` | `rgb(255 255 255 / 6%)` |
| `--td-btn-lift` | `0 1px 2px rgb(0 0 0 / 8%), 0 3px 8px -4px rgb(0 0 0 / 14%)` | `0 1px 2px rgb(0 0 0 / 30%), 0 3px 8px -4px rgb(0 0 0 / 40%)` |
| `--td-btn-ghost-fg` | `var(--td-accent)` (#2563eb) | theo `--td-accent` dark (#3b82f6) |
| `--td-btn-ghost-hover-bg` | `var(--td-color-hover)` (`rgb(0 0 0 / 5%)`) | theo `--td-color-hover` dark (`rgb(255 255 255 / 6%)`) |

Ghi chú:

- Nút **ghost** (0.17.0, `variant="ghost"`) không có nền/kính/viền: chữ `--td-btn-ghost-fg` nằm thẳng trên nền trang,
  hover phủ `--td-btn-ghost-hover-bg`. Cổng tương phản đo chữ ghost ≥ 4.7:1 trên nền trắng (light) và đen (dark) —
  ghost không dành cho nền ảnh. Đổi `--td-btn-ghost-fg` sang màu khác thì tự kiểm tra tương phản trên nền trang của
  bạn. Hai token này tính ở `:root` (bẫy 2 ở trên): muốn đổi theo vùng, ghi đè thẳng `--td-btn-ghost-fg`.
- `--td-btn-primary-bg` đọc `--td-accent-fill`, nên ở dark nó là accent tối đi 20% (chữ trắng trên accent dark thô
  `#3b82f6` chỉ 3.68:1). Trước 0.16.0 dark gán cứng `#2563eb` và đổi `--td-accent` không đổi nút primary ở dark.
- `--td-btn-success-tint` / `-danger-tint` / `-info-tint` cố định (không theo `--td-color-*`) vì dark làm sáng
  `--td-color-*` cho mục đích **chữ**, không hợp làm nền nút.
- Kit có một gate đo tương phản thật (`npm run test:contrast`) cho mọi cặp giá trị mặc định. Gate này **không** chạy trên
  site của bạn: nếu bạn đổi `-tint` / `-alpha` / `-film`, tự kiểm tra chữ trên nút vẫn ≥ 4.5:1.

### Checkbox / switch

| Token | Mặc định | Dark | Dùng cho |
|---|---|---|---|
| `--td-checkbox-color` | `var(--td-accent)` | | Nền checkbox khi được chọn |
| `--td-checkbox-border` | `var(--td-control-border-soft)` | | Viền checkbox lúc nghỉ |
| `--td-switch-on` | `#16a34a` | | Nền toggle khi bật (3.3:1 trên trang trắng) |
| `--td-switch-off` | `var(--td-gray-100)` | `#2c2c30` | Nền toggle khi tắt |
| `--td-switch-edge` | `var(--td-control-border-soft)` | | Viền toggle |
| `--td-switch-thumb` | `#fff` | | Núm toggle |

Ngoài ra `--td-checkbox-radius` (mặc định `50%`, checkbox tròn) nằm trong `checkbox.css`, xem
[checkbox.md](../components/checkbox.md).

### Lỗi form

| Token | Mặc định | Dùng cho |
|---|---|---|
| `--td-field-error` | `var(--td-color-error)` | Màu dòng lỗi `.td-field-error` của mọi control (hợp đồng lỗi) |

### Icon

| Token | Mặc định |
|---|---|
| `--td-icon-s` | `1rem` |
| `--td-icon-m` | `1.25rem` |
| `--td-icon-l` | `1.5rem` |
| `--td-icon-stroke` | `2` |

### Liquid Glass: vật liệu Regular

Kính chỉ dùng cho **tầng điều khiển nổi** (menu, popover, toast, modal, tooltip, thanh công cụ) và button. Nó "hiện ra"
nhờ độ đục thấp + viền hai tông + sheen + hairline tối + bóng nâng, **không** nhờ tăng độ đục.

| Token | Mặc định (light) | Dark | Ý nghĩa |
|---|---|---|---|
| `--td-glass-bg` | `rgb(255 255 255 / 40%)` | `rgb(12 14 18 / 44%)` | Nền kính cho control ít chữ (icon, nhãn ngắn) |
| `--td-glass-bg-strong` | `rgb(255 255 255 / 52%)` | `rgb(8 10 14 / 60%)` | Nền kính có chữ (modal, menu, toast, tooltip) — chữ vẫn ≥ 4.5:1 cả trên nền đen |
| `--td-glass-fg` | `#111113` | `#f7f7f8` | Chữ trên kính |
| `--td-glass-edge` | `rgb(255 255 255 / 82%)` | `rgb(255 255 255 / 30%)` | Viền sáng **bên trong** mép trên |
| `--td-glass-side-edge` | `rgb(255 255 255 / 22%)` | `rgb(255 255 255 / 10%)` | Viền trong mép trái |
| `--td-glass-bottom` | `rgb(0 0 0 / 8%)` | `rgb(0 0 0 / 26%)` | Viền trong mép dưới (tối) |
| `--td-glass-border` | `rgb(255 255 255 / 46%)` | `rgb(255 255 255 / 18%)` | Đường viền **ngoài** (`border`) |
| `--td-glass-outline` | `rgb(0 0 0 / 8%)` | `rgb(0 0 0 / 32%)` | Hairline tối bên ngoài, giúp kính đọc được trên nền trắng |
| `--td-glass-sheen` | gradient 135° (24 % → 7 % → 0 → 8 % trắng) | gradient nhẹ hơn | Ánh sáng lướt trên bề mặt |
| `--td-glass-blur` | `blur(16px) saturate(145%) brightness(1.04)` | `blur(16px) saturate(135%) brightness(0.92)` | `backdrop-filter` |
| `--td-glass-blur-lg` | `blur(20px) saturate(145%) brightness(1.04)` | `blur(20px) saturate(135%) brightness(0.92)` | Bề mặt lớn (modal) |
| `--td-glass-shadow` | `0 10px 30px -10px rgb(0 0 0 / 34%), 0 2px 8px -3px rgb(0 0 0 / 16%)` | đậm hơn | Bóng nâng |
| `--td-glass-shadow-lg` | `0 24px 60px -18px rgb(0 0 0 / 38%), 0 6px 18px -8px rgb(0 0 0 / 18%)` | đậm hơn | Bóng bề mặt lớn |
| `--td-glass-solid` | `#f7f7f8` | `#17181c` | **Nền đặc thay thế** khi kính bị tắt / không hỗ trợ / giảm trong suốt |

Đừng đảo `--td-glass-edge` (viền trong) và `--td-glass-border` (viền ngoài).

### Liquid Glass: Clear, dim, tint

"Clear" là kính gần như trong suốt, **chỉ** dùng trên ảnh/video (thanh công cụ và bộ đếm của lightbox), luôn kèm một
lớp làm tối (dim).

| Token | Mặc định | Ý nghĩa |
|---|---|---|
| `--td-glass-clear-bg` | `rgb(255 255 255 / 6%)` | Nền Clear |
| `--td-glass-clear-edge` | `rgb(255 255 255 / 48%)` | Viền trong mép trên |
| `--td-glass-clear-border` | `rgb(255 255 255 / 28%)` | Viền ngoài |
| `--td-glass-clear-fg` | `#fff` | Chữ / icon trên Clear |
| `--td-glass-clear-shadow` | `0 8px 24px -8px rgb(0 0 0 / 50%)` | Bóng |
| `--td-glass-clear-solid` | `rgb(20 20 22 / 92%)` | Nền đặc thay thế của Clear |
| `--td-glass-clear-glyph-shadow` | `drop-shadow(0 1px 1.5px rgb(0 0 0 / 55%))` | Bóng riêng cho icon trên Clear |
| `--td-glass-dim` | `rgb(0 0 0 / 46%)` | Lớp tối sau icon đậm (3:1 trên ảnh trắng) |
| `--td-glass-dim-text` | `rgb(0 0 0 / 60%)` | Lớp tối sau **chữ** (4.79:1 trường hợp xấu nhất) |
| `--td-glass-tint` | `var(--td-accent)` | Màu của **một** hành động chính trên thanh nổi (`.td-glass-tint`) |
| `--td-glass-tint-alpha` | `90%` | Độ đục tint (82 % trượt AA trên nền trắng) |
| `--td-glass-tint-fg` | `var(--td-accent-contrast)` | Chữ trên tint |
| `--td-glass-tint-edge` | `rgb(255 255 255 / 30%)` | Viền sáng của tint |

### Liquid Glass: tương tác, scrim, hình học, chuyển động

| Token | Mặc định | Ý nghĩa |
|---|---|---|
| `--td-glass-glow` | `rgb(255 255 255 / 40%)` (dark `rgb(255 255 255 / 18%)`) | Quầng sáng khi hover button kính |
| `--td-glass-glow-size` | `140px` | Kích thước quầng sáng |
| `--td-glass-press-scale` | `0.97` | Tỉ lệ co khi nhấn |
| `--td-glass-lift-scale` | `1.15` | Tỉ lệ phóng núm toggle/slider khi kéo |
| `--td-glass-enter-scale` | `0.96` | Tỉ lệ bắt đầu khi nở ra |
| `--td-glass-scrim` | `var(--td-color-overlay)` | Scrim sau modal (không blur) |
| `--td-scroll-edge-size` | `40px` | Vùng mờ dưới thanh nổi |
| `--td-scroll-edge-hard-bg` | `var(--td-glass-bg-strong)` | Nền kiểu "hard" (header bảng ghim) |
| `--td-glass-dur` | `var(--td-dur-base)` | Thời lượng chuyển động kính |
| `--td-glass-ease` | `var(--td-ease-out)` | Easing |
| `--td-glass-ease-flex` | `var(--td-ease-spring)` | Easing "nhún" |
| `--td-glass-radius` | `20px` | Bo góc bề mặt kính (modal, menu) |
| `--td-glass-pad` | `6px` | Padding trong bề mặt kính |
| `--td-glass-radius-min` | `4px` | Bo góc tối thiểu phần tử con |
| `--td-glass-radius-inner` | `max(--td-glass-radius-min, --td-glass-radius − --td-glass-pad)` | Bo góc đồng tâm cho phần tử con (tự tính) |
| `--td-glass-capsule` | `9999px` | Bo tròn dạng viên thuốc |

## Viền control mềm và override chuẩn WCAG nghiêm ngặt

Từ v0.14.1 (theo yêu cầu của owner), viền **lúc nghỉ** của field, dropdown, datetime-picker, chip-input, toggle,
checkbox dùng `--td-control-border-soft` (`#d1d1d6`, kiểu Apple systemGray4, khoảng **1.5:1** so với nền trắng). Từ
v0.14.2, viền **khi hover** và viền của option đang active dùng `--td-control-border-hover` (`#aeaeb2`, khoảng 2.2:1).
Khi focus bằng bàn phím luôn có vòng `--td-focus-ring`.

Đây là **đánh đổi có chủ đích**: WCAG 2.2 tiêu chí 1.4.11 (Non-text Contrast) yêu cầu ranh giới của control đạt 3:1.
Viền mềm đẹp hơn nhưng không đạt mức đó. Site cần tuân thủ nghiêm (cơ quan nhà nước, khách hàng yêu cầu audit a11y) nên
map **cả hai** token về viền đậm:

```css
/* Chuẩn WCAG 1.4.11 nghiêm ngặt: viền control ≥ 3:1 ở mọi trạng thái */
:root {
  --td-control-border-soft: var(--td-control-border-strong);
  --td-control-border-hover: var(--td-control-border-strong);
}
```

- Chỉ cần một khối này: `--td-control-border-strong` tự có giá trị riêng cho dark (`#8a8a93`), và vì override nằm
  trên cùng phần tử `:root` nên dark cũng dùng đúng giá trị dark.
- Token con dùng viền mềm (như `--td-field-border`, `--td-checkbox-border`, `--td-switch-edge`,
  `--td-btn-secondary-edge`) đều đi theo, nên viền nút secondary cũng đậm lên.
- Ghi chú lịch sử: CHANGELOG 0.14.1 chỉ nhắc `--td-control-border-soft`; từ 0.14.2 phải map **cả hai** như trên.

## Dark theme (opt-in)

Dark **không bật tự động** theo hệ điều hành (site chỉ có giao diện sáng thì không bao giờ bị lật màu). Bật bằng một
attribute trên `<html>`:

```html
<html lang="vi" data-td-theme="dark">
```

- Selector là `:root[data-td-theme="dark"]`, nên attribute **phải** nằm trên `<html>`, không phải `<body>`.
- Kit đặt `color-scheme: dark` (thanh cuộn, ô nhập native tự tối theo).
- Dark chỉ **đổi token** (trong `@layer td.tokens`), không có CSS component riêng.
- Trạng thái: **thử nghiệm** — giá trị đã được tính tương phản trên giấy, chưa tinh chỉnh trên trang thật.

Muốn theo cài đặt hệ điều hành, site tự quyết (kit cố ý không làm):

```js
// theme-auto.js — nạp sớm trong <head> bằng <script type="module" src="…"> (không inline nếu CSP cấm)
const root = document.documentElement;
const mq = window.matchMedia('(prefers-color-scheme: dark)');
const apply = () => {
  if (mq.matches) root.setAttribute('data-td-theme', 'dark');
  else root.removeAttribute('data-td-theme');
};
apply();
mq.addEventListener('change', apply);
```

Tinh chỉnh riêng cho dark bằng rule không layer của site:

```css
:root[data-td-theme="dark"] {
  --td-color-bg: #0d0f12;
  --td-glass-solid: #16181d;
}
```

## Tắt kính: `data-td-glass="off"`

```html
<html lang="vi" data-td-glass="off">
```

Khi có attribute này, mọi bề mặt kính (`.td-glass-surface`, `.td-glass-tint`, `.td-glass-dim`) và mọi button kính
chuyển sang **nền đặc**: không blur, không sheen, nền lấy từ `--td-glass-solid` (Clear lấy `--td-glass-clear-solid`,
tint lấy `--td-glass-tint` đặc, dim biến mất).

Lý do cần attribute: Safari / iOS **chưa có** media query `prefers-reduced-transparency`, nên site nên có một tuỳ chọn
cho người dùng ("Giảm hiệu ứng trong suốt") và bật attribute này. Nó cũng hữu ích khi máy yếu (blur tốn GPU).

```js
// Ví dụ: công tắc trong trang cài đặt của site
document.documentElement.setAttribute('data-td-glass', 'off');   // tắt
document.documentElement.removeAttribute('data-td-glass');       // bật lại
```

Giá trị khác `"off"` không có tác dụng.

## Kit tự thích ứng với cài đặt trợ năng

Bạn không cần viết gì. Các fallback nằm trong `glass.css` và `tokens.css`, được áp **với `!important` trong layer đầu
tiên**, nên override token của site (kể cả có `!important`) **không thể** phá chúng.

| Điều kiện | Kính / button kính trở thành |
|---|---|
| Trình duyệt không hỗ trợ `backdrop-filter` | Nền đặc `--td-glass-solid`, không sheen (tránh chữ đè thẳng lên nội dung phía sau) |
| `prefers-reduced-transparency: reduce` (hiện chỉ Chromium) | Nền đặc, không blur, không sheen, icon Clear bỏ bóng |
| `html[data-td-glass="off"]` | Như dòng trên |
| `prefers-contrast: more` | Nền `--td-color-surface`, chữ `--td-color-text`, viền `currentcolor`, bỏ viền sáng, bỏ blur, bỏ gradient; Clear thành đen + viền trắng |
| `forced-colors: active` (Windows High Contrast) | Màu hệ thống `Canvas` / `CanvasText` / `ButtonFace` / `ButtonText`, không bóng, không filter |
| `prefers-reduced-motion: reduce` | Không co khi nhấn, núm không phóng to, không pop-in, không nhún; chuyển động chỉ còn crossfade 120ms; quầng hover giảm một nửa |

Vì fallback dùng `--td-glass-solid`, nếu site đổi nền kính (`--td-glass-bg`) sang tông giấy riêng thì **nhớ đổi cả**
`--td-glass-solid` cho khớp, không thì người dùng bật "giảm trong suốt" sẽ thấy một tông xám lạc lõng.

## Tinh chỉnh kính cho hợp site

Các núm nên chỉnh (và giới hạn nên giữ):

| Muốn | Chỉnh | Lưu ý |
|---|---|---|
| Kính ngả màu giấy của site | `--td-glass-bg`, `--td-glass-bg-strong`, `--td-glass-solid` | Giữ độ đục thấp; `-strong` phải đủ để chữ ≥ 4.5:1 trên nền tối nhất có thể nằm sau |
| Mờ hơn / ít mờ hơn | `--td-glass-blur`, `--td-glass-blur-lg` | Không vượt `20px` (luật hiệu năng R14) |
| Bóng nhẹ hơn | `--td-glass-shadow`, `--td-glass-shadow-lg`, `--td-btn-lift` | |
| Bo góc | `--td-glass-radius`, `--td-glass-pad` | `--td-glass-radius-inner` tự tính lại |
| Bỏ sheen | `--td-glass-sheen: none;` (và `--td-btn-sheen: none;`) | |
| Tắt kính hoàn toàn | `data-td-glass="off"` trên `<html>` | Tốt hơn là đặt độ đục 100 % |

```css
:root {
  --td-glass-bg: oklch(96% 0.014 80 / 0.44);
  --td-glass-bg-strong: oklch(96% 0.014 80 / 0.58);
  --td-glass-solid: #f3efe6;               /* nền đặc khi fallback: khớp giấy của site */
}
:root[data-td-theme="dark"] {
  --td-glass-solid: #1a1714;
}
```

Kính trên nền phẳng một màu chỉ trông như một hộp mờ (không có gì phía sau để "bẻ"); đó là đặc tính, không phải lỗi.

## Ví dụ đầu-cuối: đổi màu thương hiệu (accent)

Giả sử site dùng đỏ `#b3261e` làm màu chính.

**Bước 1 — token gốc (light).**

```css
/* site-theme.css — không layer */
:root {
  --td-accent: #b3261e;           /* nút primary, checkbox, slider, pagination, tint kính, link hovercard */
  --td-accent-contrast: #fff;     /* chữ trên nền đỏ: 6.5:1 */
  --td-focus: #b3261e;            /* viền focus ô nhập */
  --td-focus-ring: 0 0 0 3px rgb(179 38 30 / 35%);
}
```

**Bước 2 — dark theme (nếu site dùng dark).** Từ 0.16.0 bước 1 là đủ: `:root` không layer của bạn thắng cả giá trị
dark của kit, và nền nút primary + trang active (`--td-accent-fill`) ở dark tự lấy accent tối đi 20% (`#b3261e` →
≈ `#8f1e18`). Chỉ khai báo thêm khi muốn accent dark khác light, ví dụ đỏ sáng hơn để làm chữ/viền trên nền tối:

```css
:root[data-td-theme="dark"] {
  --td-accent: #f2665c;                      /* chữ/viền trên nền tối */
  --td-accent-fill: #b3261e;                 /* nền đặc mang chữ trắng: tự chọn thay vì 80% của #f2665c */
  --td-focus: #f2665c;
  --td-focus-ring: 0 0 0 3px rgb(242 102 92 / 45%);
}
```

Không đặt `--td-accent-fill` thì nền sẽ là 80% của `#f2665c` (≈ `#c2524a`, chữ trắng chỉ ≈ 4.6:1, sát ngưỡng) — với
accent sáng, nên tự chọn fill.

**Bước 3 — kiểm tra những thứ không đi theo accent** (quyết định có đổi không):

- `--td-switch-on` (toggle bật) mặc định xanh lá `#16a34a`, không theo accent.
- Nút `success` / `danger` / `info` / `warning` có tint riêng.
- Toast dùng màu trạng thái (`--td-toast-*-wash`), không dùng accent.

**Bước 4 — kiểm tra tương phản.** Kit chỉ gate giá trị mặc định. Với màu mới, kiểm tra bằng DevTools (hoặc
`contrastRatio()` trong [dom-utils](../components/utilities.md)): chữ trắng trên `--td-accent-fill` ≥ 4.5:1 (light và dark), accent
làm chữ/viền trên nền trang ≥ 3:1.

**Bước 5 — xem thử** trên các trang có nút primary, checkbox đã chọn, slider, pagination, toggle, và bật
`data-td-theme="dark"` nếu có.

## Theme theo vùng

Token là custom property nên kế thừa theo cây DOM: bạn có thể đổi theo vùng.

```css
.admin-sidebar {
  --td-glass-bg: rgb(0 0 0 / 40%);          /* đọc trực tiếp bởi .td-glass-surface → đổi ngay */
  --td-btn-primary-bg: #0f766e;            /* token CON: đổi được theo vùng */
  --td-checkbox-color: #0f766e;
}
```

Hai giới hạn:

1. Chỉ token được component **đọc trực tiếp** mới đổi theo vùng. Token được tính trên `:root` từ token khác (như
   `--td-btn-primary-bg: var(--td-accent-fill)`) thì phải ghi đè token con, không phải token gốc (bẫy số 2 ở trên).
2. Phần tử **được đưa ra `<body>`** (portal) không nằm trong vùng của bạn nên không nhận token vùng: menu của
   td-dropdown, popup gợi ý của td-chip-input, TdMenu, tooltip, hovercard, toast, modal, loading, lightbox. Muốn đổi
   riêng chúng, nhắm đúng phần tử đó (xem [styling.md › Nhắm một instance](styling.md#nhắm-một-instance-duy-nhất)).

## Token riêng của từng component

Mỗi component có thêm token với tiền tố riêng; bảng đầy đủ (mặc định, tác dụng, ví dụ) nằm ở mục **Tuỳ biến giao
diện** của trang component. Cột "Khai báo ở" cho biết ghi đè ở đâu mới có tác dụng.

| Component | Tiền tố token | Khai báo ở | Trang |
|---|---|---|---|
| td-button | `--td-btn-*` (bảng trên), `--td-btn-bg` / `--td-btn-fg` (per-instance, do JS đặt) | `:root` | [button.md](../components/button.md) |
| td-input-field (và nhãn/ghi chú của mọi field) | `--td-field-*` | `:root` | [input-field.md](../components/input-field.md) |
| td-checkbox | `--td-checkbox-radius`, `--td-checkbox-box` | `:root` (`--sm` / `--lg` đặt lại `-box` trên phần tử) | [checkbox.md](../components/checkbox.md) |
| td-toggle | `--td-switch-w`, `--td-switch-h`, `--td-switch-thumb-d` | `:root` (`--sm` / `--lg` đặt lại trên phần tử); `--td-switch-pad` dẫn xuất, tính trên `.td-switch` | [toggle.md](../components/toggle.md) |
| td-slider | `--td-slider-*` | `:root` (riêng `--td-slider-h` / `--td-slider-thumb` trên phần tử) | [slider.md](../components/slider.md) |
| td-dropdown | `--td-dropdown-*` | `:root` | [dropdown.md](../components/dropdown.md) |
| td-datetime-picker | `--td-dtp-*` | `:root` (có `@media (pointer: coarse)`) | [datetime-picker.md](../components/datetime-picker.md) |
| td-chip-input | `--td-chip-*` | `:root` | [chip-input.md](../components/chip-input.md) |
| TdFormValidation (summary) | `--td-form-summary-*` | `:root` | [form-validation.md](../components/form-validation.md) |
| TdModal | `--td-modal-*` | `:root` (per-instance `--td-modal-w` / `-h` / `-body-pad` / `-body-overflow` do JS đặt) | [modal.md](../components/modal.md) |
| TdToast | `--td-toast-*` | `:root` | [toast.md](../components/toast.md) |
| Tooltip | `--td-tooltip-*` | `:root` | [tooltip.md](../components/tooltip.md) |
| TdLoading / spinner | `--td-spinner-size` | `:root` (cỡ md; `--sm` / `--lg` đặt lại trên phần tử) | [loading.md](../components/loading.md) |
| | `--td-spinner-color`, `--td-spinner-track` | không khai báo (fallback trong CSS; JS đặt per-instance) | |
| TdMenu | `--td-menu-*` | `:root` | [menu.md](../components/menu.md) |
| TdHovercard | `--td-hovercard-*` | `:root` | [hovercard.md](../components/hovercard.md) |
| TdLightbox | `--td-lb-*` | `:root` (có `@media (pointer: coarse)` và safe-area); `--td-lb-bar-h` dẫn xuất, tính trên `.td-lightbox` | [lightbox.md](../components/lightbox.md) |
| td-table | `--td-table-*` | `:root` (riêng `--td-table-cell-px` bị modifier `.td-table__cell--px-*` đặt lại) | [table.md](../components/table.md) |
| td-tabs | `--td-tabs-*` | `:root` | [tabs.md](../components/tabs.md) |
| td-pagination | `--td-pagination-*` | `:root` (có `@media (pointer: coarse)`) | [pagination.md](../components/pagination.md) |
| td-empty-state | `--td-empty-state-*` | `:root` (`--sm` / `--lg` / `--compact` đặt lại `-pad` / `-gap` trên phần tử) | [empty-state.md](../components/empty-state.md) |
| Icon | `--td-icon-*` (bảng trên) | `:root` | [icons.md](../components/icons.md) |
| Badge (`.td-badge`) | `--td-badge-*` — gồm font `--td-badge-font-family` (mặc định `var(--td-font-sans)`) và `--td-badge-stamp-font-family` (mặc định `var(--td-font-mono)`, 0.19.0). Ghi đè `--td-badge-*-fg` / `-bg` thì site tự kiểm tương phản (gate chỉ đo mặc định) | `:root` | [badge.md](../components/badge.md) |

Ví dụ (từ 0.16.0 ghi đè trên `:root` là đủ; ghi trên class cũ vẫn chạy):

```css
:root { --td-lb-panel-w: 26rem; }
```

Lưu ý: rule không layer của bạn thắng **mọi** rule trong layer, kể cả rule có `@media` của kit (ví dụ `:root
{ --td-lb-btn: 36px }` thắng cả giá trị 44px trên màn cảm ứng). Nếu bạn chỉ muốn đổi trên desktop, tự bọc override trong
media query tương ứng.

## Không bao giờ đụng vào token private

Token có gạch dưới (`--_td-glass-fill`, `--_td-btn-sheen`, `--_td-glass-press`…) là **private**: kit gán chúng trong
các khối fallback trợ năng ở trên. Component đọc theo mẫu `var(--_td-glass-X, var(--td-glass-X))`: khi không có
fallback nào kích hoạt, biến private không tồn tại và token public được dùng.

- Ghi đè `--_td-*` có thể vô hiệu hoá chế độ giảm trong suốt / tương phản cao của người dùng.
- Tên private có thể đổi ở bất kỳ phiên bản nào mà không báo trước.
- Nếu bạn thấy cần chỉnh một thứ chỉ có dạng private, đó là thiếu sót của kit: ghi lại và đề xuất thêm token public.

## Xem thêm

- [styling.md](styling.md): cascade layer, hợp đồng class BEM, CSSOM per-instance, font.
- [hooks.md](hooks.md): tuỳ biến bằng JS (callback, option, nhãn).
- [../guides/accessibility.md](../guides/accessibility.md): các đánh đổi trợ năng có chủ đích.
- [../guides/csp.md](../guides/csp.md): vì sao kit không dùng `style="…"`.
