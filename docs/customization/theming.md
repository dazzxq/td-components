[Tài liệu](../README.md) › Tuỳ biến › Theming (token `--td-*`)

# Theming bằng token `--td-*`

Toàn bộ màu, cỡ chữ, bo góc, khoảng cách, chuyển động và bề mặt nổi (minimal surfaces, từ 0.20.0) của td-components đều đi qua
**CSS custom property** tên `--td-*` (gọi là *token*). Component không bao giờ "cứng" một giá trị màu: chúng chỉ đọc
`var(--td-…)`. Vì vậy muốn đổi giao diện cho một site, bạn **không sửa lõi**, chỉ ghi đè token trong CSS của site.

Trang này trả lời: token là gì, có những token công khai nào, ghi đè ở đâu cho chắc thắng, bật dark theme / tắt kính
thế nào, và kit tự xử lý các chế độ trợ năng của hệ điều hành ra sao.

> **0.20.0 — minimal surfaces:** bỏ hiệu ứng Liquid Glass giả lập (sheen, rim, film, glow, scale). Mỗi bề mặt chỉ còn
> nền + một viền mảnh + một shadow mềm; blur 12px chỉ cho popup nhỏ; nút là màu đặc. Tên token `--td-glass-*` giữ
> nguyên; token không còn tác dụng được đánh dấu **deprecated** bên dưới (vẫn khai báo, xoá ở bản lớn sau).

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
  - [Màu pastel (0.21.0)](#màu-pastel-0210)
  - [Accent và focus](#accent-và-focus)
  - [Control (ô nhập, viền mềm)](#control-ô-nhập-viền-mềm)
  - [Button](#button)
  - [Checkbox / switch](#checkbox--switch)
  - [Lỗi form](#lỗi-form)
  - [Icon](#icon)
  - [Skeleton (0.27.0)](#skeleton)
  - [Bề mặt nổi (`--td-glass-*`)](#bề-mặt-nổi---td-glass-)
  - [Thanh lightbox (`--td-glass-clear-*`)](#thanh-lightbox---td-glass-clear-)
  - [Scrim, hình học, chuyển động](#scrim-hình-học-chuyển-động)
  - [Token deprecated (0.20.0)](#token-deprecated-0200)
- [Viền control mềm và override chuẩn WCAG nghiêm ngặt](#viền-control-mềm-và-override-chuẩn-wcag-nghiêm-ngặt)
- [Dark theme (opt-in)](#dark-theme-opt-in)
- [Tắt kính: `data-td-glass="off"`](#tắt-kính-data-td-glassoff)
- [Kit tự thích ứng với cài đặt trợ năng](#kit-tự-thích-ứng-với-cài-đặt-trợ-năng)
- [Tinh chỉnh bề mặt cho hợp site](#tinh-chỉnh-bề-mặt-cho-hợp-site)
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
--td-checkbox-color: var(--td-accent);
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

**2. Token được tính tại nơi khai báo.** `--td-checkbox-color: var(--td-accent)` (cũng như `--td-btn-ghost-fg`,
`--td-accent-fill`) được khai báo trên `:root`, nên `var(--td-accent)` được "giải" tại `:root` rồi mới kế thừa xuống.
Hệ quả:

- Ghi đè `--td-accent` trên `:root` → checkbox, slider, pagination, nút ghost, viền focus ô nhập… đổi theo. Đúng ý.
  Nút primary và `.td-glass-tint` thì **không** đổi: từ 0.21.0 chúng mặc định **đen** (`--td-btn-primary-bg: #18181b`),
  chỉ theo accent khi site map lại (xem [Button](#button)).
- Ghi đè `--td-accent` trên **một vùng** (`.sidebar { --td-accent: red }`) → **không** làm checkbox trong vùng đó
  đổi, vì `--td-checkbox-color` đã được tính ở `:root`. Muốn đổi theo vùng, ghi đè thẳng token con
  (`.sidebar { --td-checkbox-color: red; --td-btn-ghost-fg: red; }`). Xem [Theme theo vùng](#theme-theo-vùng).

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
| `--td-color-sheen` | `rgb(255 255 255 / 60%)` | `rgb(255 255 255 / 8%)` | Ánh sáng lướt của skeleton (qua `--td-skeleton-shine`) |
| `--td-color-hover` | `rgb(0 0 0 / 5%)` | `rgb(255 255 255 / 6%)` | Nền hover |
| `--td-color-hover-strong` | `rgb(0 0 0 / 8%)` | `rgb(255 255 255 / 10%)` | Nền hover đậm |
| `--td-color-overlay` | `rgb(10 10 12 / 45%)` | `rgb(0 0 0 / 60%)` | Scrim sau modal |
| `--td-color-skeleton` | `var(--td-gray-100)` | `#242427` | Khối skeleton (qua `--td-skeleton-bg`) |
| `--td-color-success` | `#15803d` | `#22c55e` | Chữ/biểu tượng trạng thái thành công |
| `--td-color-warning` | `#b45309` | `#f59e0b` | Cảnh báo |
| `--td-color-error` | `#b91c1c` | `#f87171` | Lỗi |
| `--td-color-info` | `#1d4ed8` | `#60a5fa` | Thông tin |
| `--td-color-on-status` | `#fff` | `#111113` | Chữ đặt trên nền màu trạng thái |

### Màu pastel (0.21.0)

Bộ màu ngữ nghĩa **dịu** dùng chung cho nút success / danger / warning / info, badge mềm và toast: nền nhạt (~100), viền
(~200) và chữ đậm cùng tông (~800/900). Theme tối: màu ngữ nghĩa ~18 % trộn sẵn trên nền tối `#111113` (giá trị **đặc**,
không trong suốt), viền ~30 %, chữ bậc ~200. Chữ đạt ≥ 4.7:1 trên cả nền và viền (cổng tương phản đo).

| Token | Light (`-bg` / `-border` / `-fg`) | Dark (`-bg` / `-border` / `-fg`) |
|---|---|---|
| `--td-pastel-success-*` | `#dcfce7` / `#bbf7d0` / `#14532d` | `#143121` / `#16472a` / `#bbf7d0` |
| `--td-pastel-danger-*` | `#fee2e2` / `#fecaca` / `#7f1d1d` | `#391a1c` / `#542022` / `#fecaca` |
| `--td-pastel-warning-*` | `#fef3c7` / `#fde68a` / `#78350f` | `#3a2a12` / `#553b11` / `#fde68a` |
| `--td-pastel-info-*` | `#dbeafe` / `#bfdbfe` / `#1e3a8a` | `#19253c` / `#1e3357` / `#bfdbfe` |

Đổi một bộ pastel (ví dụ `--td-pastel-danger-bg`) là nút, badge và toast cùng loại đổi theo. Muốn chỉ đổi nút, đặt
`--td-btn-{v}-bg/-fg/-border/-hover` (xem [Button](#button)).

### Accent và focus

| Token | Mặc định | Dark | Dùng cho |
|---|---|---|---|
| `--td-accent` | `#2563eb` | `#3b82f6` | Màu thương hiệu: checkbox, slider, pagination, nút ghost, viền focus ô nhập, link hovercard, spinner loading (từ 0.21.0 nút primary + `.td-glass-tint` là **đen**, không theo accent) |
| `--td-accent-contrast` | `#fff` | `#fff` | Chữ đặt trên accent |
| `--td-accent-fill` | `var(--td-accent)` | `color-mix(in srgb, var(--td-accent) 80%, #000)` (trình duyệt không có `color-mix()`: `#2563eb`) | Nền **đặc** mang chữ trắng: trang hiện tại của pagination (0.16.0); nút primary khi site map `--td-btn-primary-bg` về nó |
| `--td-focus` | `#2563eb` | `#60a5fa` | Màu focus đậm (trước 0.21.0 là viền focus ô nhập; nay ô nhập dùng `--td-field-focus` nhạt hơn, xem [input-field](../components/input-field.md#tuỳ-biến-giao-diện)) |
| `--td-focus-ring` | `0 0 0 3px rgb(37 99 235 / 35%)` | `0 0 0 3px rgb(96 165 250 / 45%)` | Vòng focus (`box-shadow`) dùng chung mọi control |

`--td-accent-fill` đi theo `--td-accent`: ở dark nó là accent tối đi 20% (mặc định `#3b82f6` → ≈ `#2f68c5`, chữ trắng
≈ 5.3:1), nên đổi **một** token `--td-accent` là trang active (và nút primary nếu bạn map nó về accent) đổi theo ở cả
light lẫn dark. Muốn chỉnh riêng màu nền đặc (ví dụ accent của bạn quá sáng để mang chữ trắng), ghi đè
`--td-accent-fill`.

**Focus ô nhập (0.21.0):** `--td-field-focus` = `color-mix(in srgb, var(--td-accent) 85%, #fff)` (viền nhạt, vẫn
≥ 3:1) và `--td-field-focus-ring` = quầng 3px accent 12 % (dark 22 %) — tự theo `--td-accent`. Áp cho ô nhập, nút mở
dropdown, ô tìm dropdown, chip-input. Nút / checkbox / switch vẫn dùng `--td-focus-ring`.

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
| `--td-control-border-soft` | `#d1d1d6` | `#3a3a3c` | **Viền lúc nghỉ** của field, dropdown, datetime, chip-input, toggle, checkbox (~1.5:1, v0.14.1) |
| `--td-control-border-hover` | `#aeaeb2` | `#636366` | Viền khi hover, viền option đang active (~2.2:1, v0.14.2) |
| `--td-touch-min` | `44px` | | Vùng chạm tối thiểu trên màn hình cảm ứng |

Xem [Viền control mềm và override chuẩn WCAG nghiêm ngặt](#viền-control-mềm-và-override-chuẩn-wcag-nghiêm-ngặt).

### Button

Button là **màu đặc** (0.20.0): nền `--td-btn-{variant}-bg` + **một** shadow `--td-btn-lift`, không blur / film /
sheen / viền sáng / glow / co khi nhấn. 0.21.0: **primary đen** (dark: đảo sáng), success / danger / warning / info
**pastel** (nền + chữ đậm cùng tông + viền `-border`, trỏ vào [bộ pastel](#màu-pastel-0210)). Hover = nền đặc đọc
`--td-btn-{v}-hover`; nút có thuộc tính `color` và alias `-tint` pha 8 % đen bằng `color-mix()` (trình duyệt không có
`color-mix()` giữ nguyên nền). **Đổi `-bg` thì đặt kèm `-hover`** (kit không suy hover từ `-bg` của site). Ghost và
disabled không có shadow.

| Token | Mặc định | Dark |
|---|---|---|
| `--td-btn-radius` | `var(--td-radius-lg)` | |
| `--td-btn-primary-bg` | `#18181b` | `#f4f4f5` |
| `--td-btn-primary-fg` | `#fff` | `#18181b` |
| `--td-btn-primary-hover` | `#3f3f46` | `#d4d4d8` |
| `--td-btn-primary-border` | `transparent` | |
| `--td-btn-secondary-bg` | `var(--td-gray-100)` | `#2c2c30` |
| `--td-btn-secondary-fg` | `var(--td-gray-900)` | `#f5f5f7` |
| `--td-btn-secondary-border` | `rgb(0 0 0 / 12%)` | `rgb(255 255 255 / 12%)` |
| `--td-btn-secondary-hover` | `var(--td-gray-200)` | `#3a3a3e` |
| `--td-btn-{success,danger,info,warning}-bg` | `var(--td-pastel-{v}-bg)` | theo pastel dark |
| `--td-btn-{success,danger,info,warning}-fg` | `var(--td-pastel-{v}-fg)` | theo pastel dark |
| `--td-btn-{success,danger,info,warning}-border` | `var(--td-pastel-{v}-border)` | theo pastel dark |
| `--td-btn-{success,danger,info,warning}-hover` | `var(--td-pastel-{v}-border)` (bậc ~200) | theo pastel dark |
| `--td-btn-disabled-bg` | `#f4f4f5` | `#202024` |
| `--td-btn-disabled-fg` | `#a1a1aa` | `#6b6b73` |
| `--td-btn-disabled-border` | `#e4e4e7` | `rgb(255 255 255 / 6%)` |
| `--td-btn-lift` | `0 1px 3px rgb(0 0 0 / 10%), 0 4px 10px -2px rgb(0 0 0 / 12%)` (0.21.0) | `0 1px 3px rgb(0 0 0 / 20%), 0 4px 10px -2px rgb(0 0 0 / 24%)` |
| `--td-btn-ghost-fg` | `var(--td-accent)` (#2563eb) | theo `--td-accent` dark (#3b82f6) |
| `--td-btn-ghost-hover-bg` | `var(--td-color-hover)` (`rgb(0 0 0 / 5%)`) | theo `--td-color-hover` dark (`rgb(255 255 255 / 6%)`) |

Ghi chú:

- **Alias tương thích (một chu kỳ, 0.20.0):** `--td-btn-{primary,success,danger,info,warning}-tint` — site nào còn đặt
  (ví dụ `--td-btn-danger-tint`) thì màu đó vẫn thành **nền đặc và viền** của nút, hover đậm 8 %. Chữ vẫn là
  `--td-btn-{v}-fg` (0.21.0: chữ đậm cho nền pastel) — tint màu đậm thì đặt kèm `--td-btn-{v}-fg: #fff`. Kit không còn
  khai báo các token `-tint`; hãy chuyển sang `--td-btn-{v}-bg` + `-hover`.
- Nút **ghost** (0.17.0, `variant="ghost"`) không có nền / viền / shadow: chữ `--td-btn-ghost-fg` nằm thẳng trên nền
  trang, hover phủ `--td-btn-ghost-hover-bg`. Cổng tương phản đo chữ ghost ≥ 4.7:1 trên nền trắng (light) và đen
  (dark) — ghost không dành cho nền ảnh. Đổi `--td-btn-ghost-fg` sang màu khác thì tự kiểm tra tương phản trên nền
  trang của bạn. Hai token này tính ở `:root` (bẫy 2 ở trên): muốn đổi theo vùng, ghi đè thẳng `--td-btn-ghost-fg`.
- **Primary về accent** (như trước 0.21.0): một khối `:root` không layer, đủ cho cả hai theme (`--td-accent-fill` tự
  tối đi 20 % ở dark):

  ```css
  :root {
    --td-btn-primary-bg: var(--td-accent-fill);
    --td-btn-primary-fg: var(--td-accent-contrast);
    --td-btn-primary-hover: color-mix(in srgb, var(--td-accent-fill) 92%, #000);
  }
  ```
- Nền nút ngữ nghĩa theo bộ pastel (không theo `--td-color-*`) vì dark làm sáng `--td-color-*` cho mục đích **chữ**,
  không hợp làm nền nút.
- Kit có một gate đo tương phản thật (`npm run test:contrast`) cho mọi cặp giá trị mặc định. Gate này **không** chạy trên
  site của bạn: nếu bạn đổi `-bg` / `-fg`, tự kiểm tra chữ trên nút vẫn ≥ 4.5:1.

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

### Skeleton

Từ 0.27.0, khai báo trong `skeleton.css`. Dùng cho class `.td-skeleton` ([Loading › Skeleton](../components/loading.md#skeleton-khối-giữ-chỗ-thuần-css))
và hàng đang tải của td-table (`--td-table-skeleton` / `--td-table-sheen` trỏ vào hai token màu đầu). Dark không đổi
token nào ở đây: màu tự theo `--td-color-skeleton` / `--td-color-sheen`.

| Token | Mặc định | Dùng cho |
|---|---|---|
| `--td-skeleton-bg` | `var(--td-color-skeleton)` | Màu khối |
| `--td-skeleton-shine` | `var(--td-color-sheen)` | Vệt sáng lướt |
| `--td-skeleton-radius` | `var(--td-radius-sm)` | Bo góc khối / dòng (cả ô skeleton của td-table) |
| `--td-skeleton-dur` | `1.3s` | Chu kỳ lướt (cả td-table) |
| `--td-skeleton-h` | `1rem` | Chiều cao `.td-skeleton` trơn |
| `--td-skeleton-line` | `0.875rem` | Chiều cao một dòng `--text` |
| `--td-skeleton-gap` | `0.5rem` | Khoảng cách giữa các dòng |
| `--td-skeleton-size` | `2.5rem` | Đường kính `--circle` |
| `--td-skeleton-ratio` | `16 / 9` | Tỉ lệ khung `--rect` |
| `--td-skeleton-lines` | `1` | Số dòng `--text`; đặt trên **phần tử** (`.td-skeleton` đặt lại giá trị này, `--lines-2` / `--lines-3` = `2` / `3`), ghi đè ở `:root` không có tác dụng |

### Bề mặt nổi (`--td-glass-*`)

Mỗi bề mặt nổi = **nền + một viền mảnh + một shadow mềm**. Popup nhỏ (menu, dropdown, gợi ý chip-input, hovercard)
dùng nền 94 % + `blur(12px)`; modal, thẻ loading và nút scroll-top là **đặc** (`--td-glass-solid`, không blur);
tooltip đặc **màu đen** (`--td-tooltip-bg`, 0.21.0 — xem [tooltip](../components/tooltip.md#tuỳ-biến-giao-diện)).
Toast (0.21.0) là viên **đặc pastel** theo loại (`--td-toast-{type}-bg/-fg/-border`, trỏ vào [bộ pastel](#màu-pastel-0210)),
không blur, không icon hiển thị — xem [toast](../components/toast.md).

| Token | Mặc định (light) | Dark | Ý nghĩa |
|---|---|---|---|
| `--td-glass-bg` | `rgb(255 255 255 / 90%)` | `rgb(28 28 30 / 90%)` | Nền mặc định của `.td-glass-surface` |
| `--td-glass-bg-strong` | `rgb(255 255 255 / 94%)` | `rgb(28 28 30 / 94%)` | Nền popup nhỏ (có blur) |
| `--td-glass-solid` | `#fff` | `#1c1c1e` | Nền **đặc** (modal, loading, scroll-top) và nền thay thế khi blur bị tắt / không hỗ trợ / giảm trong suốt |
| `--td-glass-fg` | `#18181b` | `#f5f5f7` | Chữ trên bề mặt |
| `--td-glass-border` | `rgb(0 0 0 / 7%)` | `rgb(255 255 255 / 10%)` | Viền mảnh (`border`) |
| `--td-glass-blur` | `blur(12px)` | | `backdrop-filter` của popup nhỏ |
| `--td-glass-blur-lg` | `blur(12px)` | | Giữ cho tương thích (không còn bề mặt nào blur dày hơn) |
| `--td-glass-shadow` | `0 2px 6px rgb(0 0 0 / 6%), 0 8px 24px rgb(0 0 0 / 12%)` | `0 2px 6px rgb(0 0 0 / 12%), 0 8px 24px rgb(0 0 0 / 24%)` | Shadow mềm (0.21.0: rõ hơn — lớp tiếp xúc + lớp toả) |
| `--td-glass-shadow-lg` | `0 4px 12px rgb(0 0 0 / 8%), 0 20px 48px rgb(0 0 0 / 18%)` | `0 4px 12px rgb(0 0 0 / 16%), 0 20px 48px rgb(0 0 0 / 36%)` | Shadow của modal (`.td-glass-surface--lg`) |

### Thanh lightbox (`--td-glass-clear-*`)

Thanh công cụ và bộ đếm của lightbox (`.td-glass-surface--clear`) luôn tối, không theo theme (nền là ảnh). Không còn
lớp dim cục bộ hay bóng riêng cho icon.

| Token | Mặc định | Ý nghĩa |
|---|---|---|
| `--td-glass-clear-bg` | `rgb(20 20 22 / 88%)` | Nền thanh (kèm `blur(12px)`) |
| `--td-glass-clear-solid` | `#141416` | Nền đặc: panel / sheet thông tin và fallback |
| `--td-glass-clear-fg` | `#fff` | Chữ / icon |
| `--td-glass-clear-border` | `rgb(255 255 255 / 12%)` | Viền mảnh |
| `--td-glass-clear-shadow` | `0 4px 16px rgb(0 0 0 / 24%)` | Shadow |

### Scrim, hình học, chuyển động

| Token | Mặc định | Ý nghĩa |
|---|---|---|
| `--td-glass-scrim` | `var(--td-color-overlay)` | Scrim sau modal / loading (không blur) |
| `--td-scroll-edge-size` | `40px` | Vùng mờ dưới thanh nổi |
| `--td-scroll-edge-hard-bg` | `var(--td-glass-bg-strong)` | Nền kiểu "hard" (header bảng ghim) |
| `--td-glass-dur` | `var(--td-dur-base)` | Thời lượng fade của popup |
| `--td-glass-ease` | `var(--td-ease-out)` | Easing |
| `--td-glass-ease-flex` | `var(--td-ease-spring)` | Easing "nhún" (trượt núm toggle, sheet modal) |
| `--td-glass-radius` | `20px` | Bo góc bề mặt nổi (modal, menu) |
| `--td-glass-pad` | `6px` | Padding trong bề mặt nổi |
| `--td-glass-radius-min` | `4px` | Bo góc tối thiểu phần tử con |
| `--td-glass-radius-inner` | `max(--td-glass-radius-min, --td-glass-radius − --td-glass-pad)` | Bo góc đồng tâm cho phần tử con (tự tính) |
| `--td-glass-capsule` | `9999px` | Bo tròn dạng viên thuốc |

### Token deprecated (0.20.0)

Vẫn được khai báo (đặt không lỗi) nhưng **không còn tác dụng**; sẽ xoá ở bản lớn sau. Thay bằng:

| Token deprecated | Thay bằng |
|---|---|
| `--td-glass-edge`, `-side-edge`, `-bottom`, `-outline`, `-sheen`, `-clear-edge`, `-clear-glyph-shadow` | — (bỏ rim, hairline, sheen, bóng icon) |
| `--td-glass-dim`, `-dim-text` (class `.td-glass-dim(--text)` giữ tên, không vẽ gì) | — (thanh lightbox đã tối sẵn) |
| `--td-glass-tint`, `-tint-alpha`, `-tint-fg`, `-tint-edge` | `.td-glass-tint` là nút đặc theo `--td-btn-primary-bg` / `-fg` |
| `--td-glass-glow`, `-glow-size`, `-press-scale`, `-lift-scale`, `-enter-scale` | — (không glow, không scale trang trí) |
| `--td-btn-{v}-alpha`, `--td-btn-{v}-film`, `--td-btn-sheen` | — (nút đặc) |
| `--td-btn-secondary-glass` | `--td-btn-secondary-bg` |
| `--td-btn-secondary-edge` | `--td-btn-secondary-border` |
| `--td-btn-{v}-tint` (không còn khai báo; **alias một chu kỳ**) | `--td-btn-{v}-bg` |
| `--td-toast-{success,info,warning,error}-wash` (0.20.0); `--td-toast-fg`, `-close-fg`, `-glass-bg`, `--td-toast-{type}-icon` (0.21.0) | `--td-toast-{type}-bg` / `-fg` / `-border` (toast đặc pastel, không icon) |

`--td-toast-error-border` từng nằm trong danh sách deprecated của 0.20.0; từ 0.21.0 nó **có tác dụng trở lại** (viền
toast lỗi, mặc định `--td-pastel-danger-border`).

## Viền control mềm và override chuẩn WCAG nghiêm ngặt

Từ v0.14.1 (theo yêu cầu của owner), viền **lúc nghỉ** của field, dropdown, datetime-picker, chip-input, toggle,
checkbox dùng `--td-control-border-soft` (`#d1d1d6`, kiểu Apple systemGray4, khoảng **1.5:1** so với nền trắng). Từ
v0.14.2, viền **khi hover** và viền của option đang active dùng `--td-control-border-hover` (`#aeaeb2`, khoảng 2.2:1).
Khi focus bằng bàn phím luôn có vòng focus (ô nhập / dropdown / chip-input: `--td-field-focus-ring` nhạt + viền
`--td-field-focus` ≥ 3:1 từ 0.21.0; checkbox / toggle: `--td-focus-ring`).

Đây là **đánh đổi có chủ đích**: WCAG 2.2 tiêu chí 1.4.11 (Non-text Contrast) yêu cầu ranh giới của control đạt 3:1.
Viền mềm đẹp hơn nhưng không đạt mức đó. Site cần tuân thủ nghiêm (cơ quan nhà nước, khách hàng yêu cầu audit a11y) nên
map **cả hai** token về viền đậm:

```css
/* Chuẩn WCAG 1.4.11 nghiêm ngặt: viền control ≥ 3:1 ở mọi trạng thái */
:root {
  --td-control-border-soft: var(--td-control-border-strong);
  --td-control-border-hover: var(--td-control-border-strong);
  --td-btn-secondary-border: var(--td-control-border-strong); /* nút secondary: token riêng (0.20.0) */
}
```

- Chỉ cần một khối này cho **cả hai theme**: `--td-control-border-strong` tự có giá trị riêng cho dark (`#8a8a93`),
  và vì override nằm trên cùng phần tử `:root` (không layer, thắng cả giá trị dark của kit) nên dark cũng dùng đúng
  giá trị dark.
- Token con dùng viền mềm (như `--td-field-border`, `--td-checkbox-border`, `--td-switch-edge`) đều đi theo. Nút
  secondary **không** nằm trong danh sách này: từ 0.20.0 viền của nó là `--td-btn-secondary-border` riêng, nên khối
  trên đặt thẳng token đó.
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

Khi có attribute này, mọi bề mặt (`.td-glass-surface`, `.td-glass-tint`) chuyển sang **nền đặc**, không blur: nền lấy
từ `--td-glass-solid` (thanh lightbox lấy `--td-glass-clear-solid`). Nút vốn đã đặc nên không đổi.

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

| Điều kiện | Bề mặt / nút trở thành |
|---|---|
| Trình duyệt không hỗ trợ `backdrop-filter` | Nền đặc `--td-glass-solid` (tránh chữ đè thẳng lên nội dung phía sau) |
| `prefers-reduced-transparency: reduce` (hiện chỉ Chromium) | Nền đặc, không blur |
| `html[data-td-glass="off"]` | Như dòng trên |
| `prefers-contrast: more` | Nền `--td-color-surface`, chữ `--td-color-text`, viền `currentcolor`, không blur, không shadow (cả nút); thanh lightbox thành đen + viền trắng |
| `forced-colors: active` (Windows High Contrast) | Màu hệ thống `Canvas` / `CanvasText` / `ButtonFace` / `ButtonText`, không shadow, không filter |
| `prefers-reduced-motion: reduce` | Chuyển động chỉ còn crossfade 120ms, không nhún; sheet modal / toast không trượt |

Vì fallback dùng `--td-glass-solid`, nếu site đổi nền bề mặt (`--td-glass-bg` / `-bg-strong`) sang tông giấy riêng thì
**nhớ đổi cả** `--td-glass-solid` cho khớp.

## Tinh chỉnh bề mặt cho hợp site

| Muốn | Chỉnh | Lưu ý |
|---|---|---|
| Bề mặt ngả màu giấy của site | `--td-glass-bg`, `--td-glass-bg-strong`, `--td-glass-solid` | `-bg-strong` đủ đục để chữ ≥ 4.5:1 trên nền tối nhất có thể nằm sau |
| Mờ hơn / ít mờ hơn | `--td-glass-blur` | Giữ nhẹ (≤ 20px) — blur tốn GPU |
| Bóng nhẹ / đậm hơn | `--td-glass-shadow`, `--td-glass-shadow-lg`, `--td-btn-lift` | Một lớp shadow mềm là đủ |
| Viền rõ hơn | `--td-glass-border` | |
| Bo góc | `--td-glass-radius`, `--td-glass-pad` | `--td-glass-radius-inner` tự tính lại |
| Bỏ blur | `--td-glass-blur: none;` (chỉ bỏ blur) hoặc `data-td-glass="off"` trên `<html>` (bỏ blur + nền đặc) | Fallback trợ năng vẫn đúng |

```css
:root {
  --td-glass-bg: oklch(98% 0.01 80 / 0.9);
  --td-glass-bg-strong: oklch(98% 0.01 80 / 0.94);
  --td-glass-solid: #f7f3ea;               /* modal + nền đặc khi fallback: khớp giấy của site (tooltip: --td-tooltip-bg) */
}
:root[data-td-theme="dark"] {
  --td-glass-solid: #1a1714;
}
```

## Ví dụ đầu-cuối: đổi màu thương hiệu (accent)

Giả sử site dùng đỏ `#b3261e` làm màu chính.

**Bước 1 — token gốc (light).**

```css
/* site-theme.css — không layer */
:root {
  --td-accent: #b3261e;           /* checkbox, slider, pagination, ghost, viền focus ô nhập, link hovercard */
  --td-accent-contrast: #fff;     /* chữ trên nền đỏ: 6.5:1 */
  --td-focus: #b3261e;
  --td-focus-ring: 0 0 0 3px rgb(179 38 30 / 35%); /* vòng focus của nút / checkbox / switch */
  /* 0.21.0: primary mặc định đen — muốn primary đỏ theo thương hiệu, map đủ ba token: */
  --td-btn-primary-bg: var(--td-accent-fill);
  --td-btn-primary-fg: var(--td-accent-contrast);
  --td-btn-primary-hover: color-mix(in srgb, var(--td-accent-fill) 92%, #000);
}
```

**Bước 2 — dark theme (nếu site dùng dark).** Từ 0.16.0 bước 1 là đủ: `:root` không layer của bạn thắng cả giá trị
dark của kit (kể cả primary đảo sáng của dark), và nền trang active + nút primary đã map ở bước 1 (`--td-accent-fill`)
ở dark tự lấy accent tối đi 20% (`#b3261e` →
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
- Nút primary mặc định **đen** (0.21.0) — chỉ theo accent khi bạn map như bước 1.
- Nút `success` / `danger` / `info` / `warning` dùng bộ [pastel](#màu-pastel-0210) (`--td-btn-{v}-bg`).
- Toast dùng bộ [pastel](#màu-pastel-0210) theo loại (`--td-toast-{type}-bg/-fg/-border`), không dùng accent.

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
   `--td-checkbox-color: var(--td-accent)`) thì phải ghi đè token con, không phải token gốc (bẫy số 2 ở trên).
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
| td-tree (và cây trong popup của td-tree-select) | `--td-tree-*` — `--td-tree-indent` (thụt mỗi cấp, `1.25rem`), `--td-tree-row-h` (chiều cao hàng, `2rem`), `--td-tree-row-hover` / `-selected` / `-active` / `-active-line`, `--td-tree-check-radius` (0.29.0) | `:root` | [tree.md](../components/tree.md) |
| td-tree-select | dùng `--td-field-*` (ô) + `--td-dropdown-search-*` (ô tìm) + `--td-tree-*` (cây) | `:root` | [tree-select.md](../components/tree-select.md) |
| td-number-input | dùng `--td-field-*` (hộp = dáng ô nhập) + `--td-number-affix-fg` (chữ tiền tố / hậu tố, `var(--td-color-text-muted)`), `--td-number-affix-gap` (0.30.0) | `:root` | [number-input.md](../components/number-input.md) |
| td-repeater | `--td-repeater-gap` (khoảng cách trong dòng + đệm dòng, `var(--td-space-sm)`), `--td-repeater-btn-size` (`2rem`, ≥ 44px trên cảm ứng), `--td-repeater-btn-fg` / `-fg-hover` / `-bg-hover` / `-disabled-fg`, `--td-repeater-divider` (0.30.0) | `:root` | [repeater.md](../components/repeater.md) |
| td-media-field | `--td-media-field-w` (bề rộng host, `100%`), `--td-media-field-empty-h` (khung rỗng khi không có `aspect-ratio`, `10rem`), `--td-media-field-max-h` (trần chiều cao ảnh khi không có `aspect-ratio`, `24rem`) (0.32.0) | `:root` (hoặc trên từng host) | [media-field.md](../components/media-field.md) |
| td-media-picker | không có token riêng: vỏ dùng `--td-modal-*`, lưới dùng `--td-media-grid-*` (0.32.0) | `:root` | [media-picker.md](../components/media-picker.md) |
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
| td-drawer | `--td-drawer-*` (per-instance `--td-drawer-w`: trên host, chép sang root lúc mở) | `:root` | [drawer.md](../components/drawer.md) |
| Skeleton (`.td-skeleton`) | `--td-skeleton-*` (bảng trên) | `:root` (riêng `--td-skeleton-lines` trên phần tử) | [loading.md](../components/loading.md#skeleton-khối-giữ-chỗ-thuần-css) |

Ví dụ (từ 0.16.0 ghi đè trên `:root` là đủ; ghi trên class cũ vẫn chạy):

```css
:root { --td-lb-panel-w: 26rem; }
```

Lưu ý: rule không layer của bạn thắng **mọi** rule trong layer, kể cả rule có `@media` của kit (ví dụ `:root
{ --td-lb-btn: 36px }` thắng cả giá trị 44px trên màn cảm ứng). Nếu bạn chỉ muốn đổi trên desktop, tự bọc override trong
media query tương ứng.

## Không bao giờ đụng vào token private

Token có gạch dưới (`--_td-glass-fill`, `--_td-glass-filter`, `--_td-btn-lift`…) là **private**: kit gán chúng trong
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
