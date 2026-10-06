[Tài liệu](../README.md) › Tuỳ biến › Theming (token `--td-*`)

# Theming bằng token `--td-*`

Toàn bộ màu, cỡ chữ, bo góc, khoảng cách, chuyển động và bề mặt nổi (minimal surfaces, từ 0.20.0) của td-components đều đi qua
**CSS custom property** tên `--td-*` (gọi là *token*). Component không bao giờ "cứng" một giá trị màu: chúng chỉ đọc
`var(--td-…)`. Vì vậy muốn đổi giao diện cho một site, bạn **không sửa lõi**, chỉ ghi đè token trong CSS của site.

Trang này trả lời: token là gì, có những token công khai nào, ghi đè ở đâu cho chắc thắng, bật light / dark / auto /
tắt kính thế nào, site đổi màu nền (vd. giấy be) bằng **hợp đồng theme** ra sao, và kit tự xử lý các chế độ trợ năng
của hệ điều hành thế nào.

> **0.42.0 — palette tuỳ biến + theme theo vùng:** đưa `bg` + `accent` cho CLI `td-theme` (hoặc trang builder trong
> package) → một file CSS tĩnh với chữ, viền, hover, focus, màu trạng thái đạt WCAG AA, hoặc mã lỗi khi về toán học không
> đạt ([Palette tuỳ biến](#palette-tuỳ-biến-td-theme-0420)). `<section data-td-theme="dark">` trong trang sáng (và ngược
> lại) chạy bằng token gốc, popup mở từ trong vùng theo vùng ([Theme theo vùng](#theme-theo-vùng)).

> **0.41.0 — theme chính thức:** `data-td-theme="light" | "dark" | "auto"` (`auto` theo hệ điều hành, CSS thuần, không
> chớp trắng); dark hết nhãn "thử nghiệm" và được tinh chỉnh trên trang thật; token component đọc từ một bộ token ngữ
> nghĩa (hợp đồng theme) nên site đặt nền / bề mặt một lần là ô nhập, popup, bảng đi theo. Không đặt attribute = light
> **giống từng pixel** 0.40 — trừ hai thay đổi light đã duyệt: vòng focus bàn phím ≥ 3:1 và viền checkbox chọn dòng của
> bảng (lỗi từ 0.37).

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
  - [Màu ngữ nghĩa đặc (0.36.0)](#màu-ngữ-nghĩa-đặc-0360)
  - [Màu pastel (0.21.0, deprecated 0.36.0)](#màu-pastel-0210-deprecated-0360)
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
- [Light / dark / auto](#light--dark--auto)
- [Hợp đồng theme và công thức nền giấy (0.41.0)](#hợp-đồng-theme-và-công-thức-nền-giấy-0410)
- [Palette tuỳ biến: `td-theme` (0.42.0)](#palette-tuỳ-biến-td-theme-0420)
- [Tắt kính: `data-td-glass="off"`](#tắt-kính-data-td-glassoff)
- [Kit tự thích ứng với cài đặt trợ năng](#kit-tự-thích-ứng-với-cài-đặt-trợ-năng)
- [Tinh chỉnh bề mặt cho hợp site](#tinh-chỉnh-bề-mặt-cho-hợp-site)
- [Ví dụ đầu-cuối: đổi màu thương hiệu (accent)](#ví-dụ-đầu-cuối-đổi-màu-thương-hiệu-accent)
- [Theme theo vùng](#theme-theo-vùng) (0.42.0: vùng + popup portal)
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
`:root[data-td-theme="dark"]` (và bản sao `auto` dưới `@media (prefers-color-scheme: dark)`). Rule không layer
`:root { --td-color-bg: #fffaf0 }` của bạn thắng cả rule dark đó (layer thắng specificity). Nếu site có dark theme, hãy
khai báo riêng cho dark, hoặc giới hạn override light:

```css
:root:not([data-td-theme="dark"]) { --td-color-bg: #fffaf0; }
:root[data-td-theme="dark"]       { --td-color-bg: #14120f; }
/* site dùng auto: thêm nhánh tối của auto (xem Light / dark / auto) */
@media (prefers-color-scheme: dark) {
  :root[data-td-theme="auto"]     { --td-color-bg: #14120f; }
}
```

(Với `auto`, rule `:root:not([data-td-theme="dark"])` ở trên cũng khớp nhánh tối của auto — viết nhánh tối sau nó, cùng
specificity nên rule sau thắng.)

**2. Token được tính tại nơi khai báo.** `--td-checkbox-color: var(--td-accent)` (cũng như `--td-btn-ghost-fg`,
`--td-accent-fill`) được khai báo trên `:root`, nên `var(--td-accent)` được "giải" tại `:root` rồi mới kế thừa xuống.
Hệ quả:

- Ghi đè `--td-accent` trên `:root` → checkbox, slider, pagination, nút ghost, viền focus ô nhập… đổi theo. Đúng ý.
  Nút primary và `.td-glass-tint` thì **không** đổi: từ 0.21.0 chúng mặc định **đen** (`--td-btn-primary-bg: #18181b`),
  chỉ theo accent khi site map lại (xem [Button](#button)).
- Ghi đè `--td-accent` trên **một vùng** (`.sidebar { --td-accent: red }`) → **không** làm checkbox trong vùng đó
  đổi, vì `--td-checkbox-color` đã được tính ở `:root`. Muốn đổi theo vùng, ghi đè thẳng token con
  (`.sidebar { --td-checkbox-color: red; --td-btn-ghost-fg: red; }`). Xem [Theme theo vùng](#theme-theo-vùng).
- **Từ 0.42.0:** phần tử có `data-td-theme` (bất kỳ giá trị nào) là một *vùng theme*: token **màu** dẫn xuất được giải
  lại ngay trên nó. Với `<aside class="sidebar" data-td-theme="light">`, đặt `--td-accent` trên chính phần tử có
  attribute (CSS của site: `.sidebar[data-td-theme] { --td-accent: red }`) là checkbox, ghost, slider trong vùng đổi theo.

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
| `--td-shadow-1` | `0 1px 2px rgb(0 0 0 / 6%)` | `0 1px 2px rgb(0 0 0 / 30%)` (0.41.0; trước đó không có giá trị dark) |
| `--td-shadow-2` | `0 2px 8px rgb(0 0 0 / 8%)` | `0 2px 8px rgb(0 0 0 / 40%)` |
| `--td-shadow-3` | `0 8px 24px rgb(0 0 0 / 12%)` | `0 8px 24px rgb(0 0 0 / 50%)` |
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
| `--td-color-surface-raised` | `var(--td-color-surface)` | (theo surface) | **0.41.0.** Bề mặt nổi: ô nhập (`--td-control-bg`), modal / popup đặc / fallback (`--td-glass-solid`). Đặt riêng khi muốn control + popup sáng hơn surface một bậc |
| `--td-color-text` | `var(--td-gray-900)` | `#f5f5f7` | Chữ chính |
| `--td-color-text-muted` | `var(--td-gray-600)` | `#acacb4` (0.41.0, trước `#a1a1aa`) | Chữ phụ — **mọi chữ nhỏ mang nội dung** dùng từ mức này trở lên (≥ 4.7:1) |
| `--td-color-text-subtle` | `var(--td-gray-500)` | `#8a8a93` | Chỉ cho icon, chữ lớn, disabled, trang trí (≈ 3.2:1) — **không** dùng cho chữ nhỏ mang nội dung |
| `--td-color-text-label` | `var(--td-gray-700)` | `#d4d4d8` | **0.41.0.** Nhãn field / control (`--td-field-label`, icon nút thao tác, nút gỡ filter chip) |
| `--td-color-border` | `var(--td-gray-200)` | `#333338` (0.41.0, trước `#2c2c30`) | Viền nhẹ (trang trí, ≈ 1.35:1 ở dark) |
| `--td-color-border-strong` | `var(--td-gray-300)` | `#45454b` | Viền đậm hơn |
| `--td-color-sheen` | `rgb(255 255 255 / 60%)` | `rgb(255 255 255 / 8%)` | Ánh sáng lướt của skeleton (qua `--td-skeleton-shine`) |
| `--td-color-hover` | `rgb(0 0 0 / 5%)` | `rgb(255 255 255 / 6%)` | Nền hover |
| `--td-color-hover-strong` | `rgb(0 0 0 / 8%)` | `rgb(255 255 255 / 10%)` | Nền hover đậm |
| `--td-color-overlay` | `rgb(10 10 12 / 45%)` | `rgb(0 0 0 / 60%)` | Scrim sau modal |
| `--td-color-skeleton` | `var(--td-gray-100)` | `#242427` | Khối skeleton (qua `--td-skeleton-bg`) |
| `--td-color-fill` | `var(--td-gray-100)` | `#2c2c30` | **0.41.0.** Nền phụ trung tính trên surface: switch tắt, nút secondary, badge neutral, filter chip, field disabled |
| `--td-color-fill-strong` | `#ebebeb` | `#3c3c3e` | **0.41.0.** Chip trong ô nhập (`--td-chip-bg`) |
| `--td-color-on-fill` | `#3f3f46` | `#e4e4e7` | **0.41.0.** Chữ trên `--td-color-fill` (badge neutral) |
| `--td-color-success` | `#15803d` | `#22c55e` | Chữ/biểu tượng trạng thái thành công |
| `--td-color-warning` | `#b45309` | `#f59e0b` | Cảnh báo |
| `--td-color-error` | `#b91c1c` | `#f87171` | Lỗi |
| `--td-color-info` | `#1d4ed8` | `#60a5fa` | Thông tin |
| `--td-color-on-status` | `#fff` | `#111113` | Chữ đặt trên nền màu trạng thái |

### Màu ngữ nghĩa đặc (0.36.0)

Bộ màu "bình thường" như dcms2 cho mọi bề mặt **đặc** mang nghĩa trạng thái: nút success / danger / warning / info và
badge (toast: token riêng `--td-toast-*`, cùng tinh thần). `-bg` = nền, `-fg` = chữ (≥ 4.7:1 trên `-bg` **và** trên
`-hover` — cổng tương phản đo), `-hover` = đậm hơn một bậc, `-border` = bậc hover. **Warning luôn chữ tối**: không sắc
vàng / cam nào còn "nhìn ra vàng" đạt 4.5:1 với chữ trắng (amber-500 2.15:1, amber-600 3.19:1). Theme tối dùng **cùng
giá trị** (chữ trắng trên 600/700 vẫn đọc tốt trên trang tối).

| Token (`-bg` / `-fg` / `-hover` = `-border`) | Giá trị | fg / bg | fg / hover |
|---|---|---|---|
| `--td-solid-success-*` | `#15803d` / `#fff` / `#166534` | 5.02 | 7.1 |
| `--td-solid-danger-*` | `#dc2626` / `#fff` / `#b91c1c` | 4.83 | 6.47 |
| `--td-solid-warning-*` | `#f59e0b` / `#18181b` / `#d97706` | 8.25 | 5.56 |
| `--td-solid-info-*` | `#2563eb` / `#fff` / `#1d4ed8` | 5.17 | 6.70 |

Đổi một bộ (ví dụ `--td-solid-danger-bg` + `-hover`) là nút và badge cùng loại đổi theo; muốn chỉ đổi nút, đặt
`--td-btn-{v}-*` (xem [Button](#button)), chỉ đổi badge: `--td-badge-{v}-*` ([badge.md](../components/badge.md)). Alert
giữ nền nhạt cho thân chữ, chỉ vạch mép + icon dùng màu đặc (`--td-alert-{v}-accent`, [alert.md](../components/alert.md)).
Muốn trả về pastel như 0.21–0.35: đoạn CSS ở [Thay đổi phá vỡ › 0.36.0](../upgrading/breaking-changes.md#0360).

### Màu pastel (0.21.0, deprecated 0.36.0)

**Deprecated 0.36.0:** vẫn khai báo (cả theme tối) nhưng **không component nào dùng làm nền mặc định nữa** — giữ để site
khôi phục giao diện pastel (đoạn CSS ở [Thay đổi phá vỡ › 0.36.0](../upgrading/breaking-changes.md#0360)).
Trước 0.36.0, bộ màu ngữ nghĩa **dịu** này dùng chung cho nút success / danger / warning / info, badge mềm và toast: nền nhạt (~100), viền
(~200) và chữ đậm cùng tông (~800/900). Theme tối: màu ngữ nghĩa ~18 % trộn sẵn trên nền tối `#111113` (giá trị **đặc**,
không trong suốt), viền ~30 %, chữ bậc ~200. Chữ đạt ≥ 4.7:1 trên cả nền và viền (cổng tương phản đo).

| Token | Light (`-bg` / `-border` / `-fg`) | Dark (`-bg` / `-border` / `-fg`) |
|---|---|---|
| `--td-pastel-success-*` | `#dcfce7` / `#bbf7d0` / `#14532d` | `#143121` / `#16472a` / `#bbf7d0` |
| `--td-pastel-danger-*` | `#fee2e2` / `#fecaca` / `#7f1d1d` | `#391a1c` / `#542022` / `#fecaca` |
| `--td-pastel-warning-*` | `#fef3c7` / `#fde68a` / `#78350f` | `#3a2a12` / `#553b11` / `#fde68a` |
| `--td-pastel-info-*` | `#dbeafe` / `#bfdbfe` / `#1e3a8a` | `#19253c` / `#1e3357` / `#bfdbfe` |

Từ 0.36.0 đổi `--td-pastel-*` **không** còn đổi nút / badge (chúng đọc `--td-solid-*`).

### Accent và focus

| Token | Mặc định | Dark | Dùng cho |
|---|---|---|---|
| `--td-accent` | `#2563eb` | `#4b8df8` (0.41.0, trước `#3b82f6`: làm chữ ghost trên surface tối chỉ 4.63:1) | Màu thương hiệu: checkbox, slider, pagination, nút ghost, viền focus ô nhập, link hovercard, spinner loading (từ 0.21.0 nút primary + `.td-glass-tint` là **đen**, không theo accent) |
| `--td-accent-contrast` | `#fff` | `#fff` | Chữ đặt trên accent |
| `--td-accent-fill` | `var(--td-accent)` | `color-mix(in srgb, var(--td-accent) 80%, #000)` (trình duyệt không có `color-mix()`: `#2563eb`) | Nền **đặc** mang chữ trắng: trang hiện tại của pagination (0.16.0); nút primary khi site map `--td-btn-primary-bg` về nó |
| `--td-focus` | `#2563eb` | `#60a5fa` | Màu focus đậm (trước 0.21.0 là viền focus ô nhập; nay ô nhập dùng `--td-field-focus` nhạt hơn, xem [input-field](../components/input-field.md#tuỳ-biến-giao-diện)) |
| `--td-focus-ring` | `0 0 0 1px var(--td-color-surface), 0 0 0 3px var(--td-focus)` (0.41.0; trước `0 0 0 3px rgb(37 99 235 / 35%)`) | cùng công thức (trước `rgb(96 165 250 / 45%)`) | Vòng focus bàn phím (`box-shadow`) dùng chung mọi control: vòng đặc 2px sau khe 1px màu bề mặt, ≥ 3:1 với nền ngoài và nền control (0.41.0, owner duyệt) |

`--td-accent-fill` đi theo `--td-accent`: ở dark nó là accent tối đi 20% (mặc định `#4b8df8` → ≈ `#3c71c6`, chữ trắng
≈ 4.8:1), nên đổi **một** token `--td-accent` là trang active (và nút primary nếu bạn map nó về accent) đổi theo ở cả
light lẫn dark. Muốn chỉnh riêng màu nền đặc (ví dụ accent của bạn quá sáng để mang chữ trắng), ghi đè
`--td-accent-fill`.

**Focus ô nhập (0.21.0):** `--td-field-focus` = `color-mix(in srgb, var(--td-accent) 85%, #fff)` (viền nhạt, vẫn
≥ 3:1) và `--td-field-focus-ring` = quầng 3px accent 12 % (dark 22 %) — tự theo `--td-accent`. Áp cho ô nhập, nút mở
dropdown, ô tìm dropdown, chip-input. Nút / checkbox / switch vẫn dùng `--td-focus-ring`.

Đổi `--td-accent` mà không đổi `--td-focus` thì vòng focus vẫn xanh dương. Từ 0.41 `--td-focus-ring` dựng từ
`--td-focus` (vòng đặc 2px sau khe 1px màu surface, ≥ 3:1) — chỉ cần đổi `--td-focus`, **đừng** ghi đè `--td-focus-ring`
bằng quầng trong suốt kiểu cũ (≈ 1.7:1, không đạt). Thường nên đổi cả hai,
xem [ví dụ thương hiệu](#ví-dụ-đầu-cuối-đổi-màu-thương-hiệu-accent).

### Control (ô nhập, viền mềm)

| Token | Mặc định | Dark | Dùng cho |
|---|---|---|---|
| `--td-control-bg` | `var(--td-color-surface-raised)` (0.41.0, trước `#fff`) | (theo raised) | Nền ô nhập, nút không variant |
| `--td-control-fg` | `var(--td-color-text)` | (theo text) | Chữ trong control |
| `--td-control-border` | `var(--td-color-border-strong)` | (theo border-strong) | Viền control chung (nút không variant) |
| `--td-control-radius` | `var(--td-radius-md)` | | Bo góc control |
| `--td-control-border-strong` | `var(--td-gray-500)` | `#8a8a93` | Viền đạt ≥ 3:1 trên nền trắng (3.42:1) |
| `--td-control-border-soft` | `#d1d1d6` | `#76767c` (0.41.0, trước `#3a3a3c`) | **Viền lúc nghỉ** của field, dropdown, datetime, chip-input, toggle, checkbox (light ~1.5:1, v0.14.1; dark ≥ 3:1 với mọi nền kề, 0.41.0) |
| `--td-control-border-hover` | `#aeaeb2` | `#8e8e93` (0.41.0, trước `#636366`) | Viền khi hover, viền option đang active (light ~2.2:1, v0.14.2; dark ≥ 4.7:1) |
| `--td-touch-min` | `44px` | | Vùng chạm tối thiểu trên màn hình cảm ứng |

Xem [Viền control mềm và override chuẩn WCAG nghiêm ngặt](#viền-control-mềm-và-override-chuẩn-wcag-nghiêm-ngặt).

### Button

Button là **màu đặc** (0.20.0): nền `--td-btn-{variant}-bg` + **một** shadow `--td-btn-lift`, không blur / film /
sheen / viền sáng / glow / co khi nhấn. 0.21.0: **primary đen** (dark: đảo sáng). 0.36.0: success / danger / warning /
info **màu đặc** (trỏ vào [bộ màu đặc](#màu-ngữ-nghĩa-đặc-0360); warning chữ tối; 0.21–0.35 là pastel). Hover = nền đặc đọc
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
| `--td-btn-{success,danger,info,warning}-bg` | `var(--td-solid-{v}-bg)` (0.36.0) | như light |
| `--td-btn-{success,danger,info,warning}-fg` | `var(--td-solid-{v}-fg)` | như light |
| `--td-btn-{success,danger,info,warning}-border` | `var(--td-solid-{v}-border)` | như light |
| `--td-btn-{success,danger,info,warning}-hover` | `var(--td-solid-{v}-hover)` (đậm hơn một bậc) | như light |
| `--td-btn-disabled-bg` | `#f4f4f5` | `#202024` |
| `--td-btn-disabled-fg` | `#a1a1aa` | `#6b6b73` |
| `--td-btn-disabled-border` | `#e4e4e7` | `rgb(255 255 255 / 6%)` |
| `--td-btn-lift` | `0 1px 3px rgb(0 0 0 / 10%), 0 4px 10px -2px rgb(0 0 0 / 12%)` (0.21.0) | `0 1px 3px rgb(0 0 0 / 20%), 0 4px 10px -2px rgb(0 0 0 / 24%)` |
| `--td-btn-ghost-fg` | `var(--td-accent)` (#2563eb) | theo `--td-accent` dark (#3b82f6) |
| `--td-btn-ghost-hover-bg` | `var(--td-color-hover)` (`rgb(0 0 0 / 5%)`) | theo `--td-color-hover` dark (`rgb(255 255 255 / 6%)`) |

Ghi chú:

- **Alias tương thích (một chu kỳ, 0.20.0):** `--td-btn-{primary,success,danger,info,warning}-tint` — site nào còn đặt
  (ví dụ `--td-btn-danger-tint`) thì màu đó vẫn thành **nền đặc và viền** của nút, hover đậm 8 %. Chữ vẫn là
  `--td-btn-{v}-fg` (0.36.0: trắng, warning `#18181b`) — tint màu sáng thì đặt kèm `--td-btn-{v}-fg` tối. Kit không còn
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
- Nền nút ngữ nghĩa theo bộ màu đặc `--td-solid-*` (không theo `--td-color-*`) vì dark làm sáng `--td-color-*` cho mục
  đích **chữ**, không hợp làm nền nút.
- Kit có một gate đo tương phản thật (`npm run test:contrast`) cho mọi cặp giá trị mặc định. Gate này **không** chạy trên
  site của bạn: nếu bạn đổi `-bg` / `-fg`, tự kiểm tra chữ trên nút vẫn ≥ 4.5:1.

### Hàng option trong popup (0.36.0)

Dropdown, multi-select (`td-chip-input`), popup của tree-select và menu dùng chung kiểu hàng (giống dcms2): hàng **tràn
mép** (không bo, không khung viền), nền khi hover / chọn / đang active; danh sách chọn một: mục đã chọn **in đậm** + ✓ ở
cuối; danh sách chọn nhiều giữ ô tick chung ở đầu (ADR 0017). Hàng đang active bằng bàn phím có **vạch nhấn ở đầu dòng**
(chỉ báo focus, ≥ 3:1 so với nền popup — contrast gate).

| Token | Mặc định | Ý nghĩa |
|---|---|---|
| `--td-option-pad-x` | `12px` | Lề ngang của chữ trong hàng (và ô tìm phía trên) |
| `--td-option-hover-bg` | `var(--td-color-hover)` | Nền khi rê chuột |
| `--td-option-active-bg` | `var(--td-color-hover-strong)` | Nền hàng active (bàn phím) |
| `--td-option-selected-bg` | `var(--td-color-hover-strong)` | Nền hàng đã chọn |
| `--td-option-active-bar` | `var(--td-accent)` | Màu vạch nhấn của hàng active |
| `--td-option-active-bar-w` | `3px` | Độ dày vạch nhấn |

Token riêng cũ (`--td-dropdown-option-hover/-active/-selected`, `--td-menu-item-hover/-active`) vẫn chạy (mặc định trỏ về
token chung); `--td-dropdown-option-active-line` hết tác dụng.

### Checkbox / switch

| Token | Mặc định | Dark | Dùng cho |
|---|---|---|---|
| `--td-checkbox-color` | `var(--td-accent)` | | Nền checkbox khi được chọn |
| `--td-checkbox-border` | `var(--td-control-border-soft)` | | Viền checkbox lúc nghỉ |
| `--td-switch-on` | `#16a34a` | | Nền toggle khi bật (3.3:1 trên trang trắng) |
| `--td-switch-off` | `var(--td-color-fill)` | (theo fill) | Nền toggle khi tắt |
| `--td-switch-edge` | `var(--td-control-border-soft)` | | Viền toggle |
| `--td-switch-thumb` | `#fff` | | Núm toggle |
| `--td-switch-thumb-on` | `var(--td-switch-thumb)` | | Núm khi bật (0.52.0; `tone` đặt lại) |
| `--td-switch-on-success` / `-on-warning` | `var(--td-color-success)` / `var(--td-color-warning)` | (theo hợp đồng) | Rãnh bật của `tone="success"` / `"warning"` (0.52.0) |
| `--td-switch-thumb-tone` | `var(--td-color-on-status)` | (theo hợp đồng: núm tối) | Núm trên rãnh có tone (0.52.0) |

Ngoài ra `--td-checkbox-radius` (mặc định `50%`, checkbox tròn) nằm trong `checkbox.css`, xem
[checkbox.md](../components/checkbox.md).

Từ 0.36.0 ba token `--td-checkbox-color` / `-border` / `-radius` vẽ **mọi ô tick** của kit (ô tick chung `.td-check`:
media grid / picker, tree chọn nhiều, multiselect, mục checkbox của menu) — xem
[checkbox.md › phần hình dùng chung](../components/checkbox.md#phần-hình-dùng-chung-td-check-0360).
`--td-media-grid-tick-*` chỉ còn cho tick do site in; `--td-tree-check-radius` deprecated (không tác dụng).

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
tooltip đặc **màu đen** (`--td-tooltip-bg`, 0.21.0; dark 0.41.0: chip xám nổi `#3a3a3e` + viền sáng — xem [tooltip](../components/tooltip.md#tuỳ-biến-giao-diện)).
Toast (0.21.0) là viên **đặc pastel** theo loại (`--td-toast-{type}-bg/-fg/-border`, trỏ vào [bộ pastel](#màu-pastel-0210-deprecated-0360)),
không blur, không icon hiển thị — xem [toast](../components/toast.md).

| Token | Mặc định (light) | Dark | Ý nghĩa |
|---|---|---|---|
| `--td-glass-bg` | `rgb(255 255 255 / 90%)` | `rgb(28 28 30 / 90%)` | Nền mặc định của `.td-glass-surface` |
| `--td-glass-bg-strong` | `rgb(255 255 255 / 94%)` | `rgb(28 28 30 / 94%)` | Nền popup nhỏ (có blur) |
| `--td-glass-solid` | `var(--td-color-surface-raised)` (0.41.0, trước `#fff`) | (theo raised) | Nền **đặc** (modal, loading, scroll-top) và nền thay thế khi blur bị tắt / không hỗ trợ / giảm trong suốt |
| `--td-glass-fg` | `#18181b` | `#f5f5f7` | Chữ trên bề mặt |
| `--td-glass-border` | `rgb(0 0 0 / 7%)` | `rgb(255 255 255 / 14%)` (0.41.0, trước 10 %) | Viền mảnh (`border`) — ở dark là thứ tách popup / modal khỏi nền |
| `--td-glass-blur` | `blur(12px)` | | `backdrop-filter` của popup nhỏ |
| `--td-glass-blur-lg` | `blur(12px)` | | Giữ cho tương thích (không còn bề mặt nào blur dày hơn) |
| `--td-glass-shadow` | `0 2px 6px rgb(0 0 0 / 6%), 0 8px 24px rgb(0 0 0 / 12%)` | `0 2px 6px rgb(0 0 0 / 24%), 0 8px 24px rgb(0 0 0 / 40%)` (0.41.0) | Shadow mềm (0.21.0: rõ hơn — lớp tiếp xúc + lớp toả) |
| `--td-glass-shadow-lg` | `0 4px 12px rgb(0 0 0 / 8%), 0 20px 48px rgb(0 0 0 / 18%)` | `0 4px 12px rgb(0 0 0 / 32%), 0 20px 48px rgb(0 0 0 / 56%)` (0.41.0) | Shadow của modal (`.td-glass-surface--lg`) |

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

- Từ 0.41.0 **dark đã ≥ 3:1 sẵn** (viền mềm `#76767c` đạt 3:1 với ô nhập, surface, surface-muted, nền trang — quyết
  định owner); khối dưới chỉ còn đổi light.
- Chỉ cần một khối này cho **cả hai theme**: `--td-control-border-strong` tự có giá trị riêng cho dark (`#8a8a93`),
  và vì override nằm trên cùng phần tử `:root` (không layer, thắng cả giá trị dark của kit) nên dark cũng dùng đúng
  giá trị dark.
- Token con dùng viền mềm (như `--td-field-border`, `--td-checkbox-border`, `--td-switch-edge`) đều đi theo. Nút
  secondary **không** nằm trong danh sách này: từ 0.20.0 viền của nó là `--td-btn-secondary-border` riêng, nên khối
  trên đặt thẳng token đó.
- Ghi chú lịch sử: CHANGELOG 0.14.1 chỉ nhắc `--td-control-border-soft`; từ 0.14.2 phải map **cả hai** như trên.

## Light / dark / auto

Đặt **một** attribute trên `<html>` (từ 0.41.0, dark chính thức — hết "thử nghiệm"):

| `data-td-theme` | Kết quả | `color-scheme` (thanh cuộn, ô native) |
|---|---|---|
| *(không đặt)* | Light, **giống từng pixel** 0.40 (trừ vòng focus và checkbox chọn dòng, xem trên). Không bao giờ tự lật theo hệ điều hành | không đặt (như cũ) |
| `"light"` | Light tường minh | `light` |
| `"dark"` | Dark | `dark` |
| `"auto"` | Light khi hệ điều hành sáng, dark khi hệ điều hành tối — **CSS thuần** (`@media (prefers-color-scheme: dark)`), không JS, đổi ngay khi người dùng đổi cài đặt máy | theo nhánh: `light` / `dark` |

```html
<html lang="vi" data-td-theme="auto">
```

- Đặt attribute trên `<html>` cho cả trang (không phải `<body>`). Từ 0.42.0 attribute cũng chạy trên **một vùng**
  (`<section data-td-theme="dark">`) — xem [Theme theo vùng](#theme-theo-vùng).
- Dark chỉ **đổi token** (trong `@layer td.tokens`), không có CSS component riêng. `auto` không phải bản viết tay: lúc
  build, mỗi rule dark của kit được sao sang nhánh `auto` (nên hai bản không bao giờ lệch).
- Dark 0.41.0 được tinh chỉnh trên trang thật (3 trình duyệt): viền ô nhập / checkbox chưa chọn / switch ≥ 3:1 với mọi
  nền kề, chữ phụ ≥ 4.7:1 cả trên nền hover, accent đọc được làm chữ, tooltip là chip xám nổi, bề mặt nổi có viền sáng
  mảnh + bóng thật. Danh sách giá trị đổi: [breaking-changes § 0.41.0](../upgrading/breaking-changes.md#0410).

### Không chớp trắng (no-FOUC)

Theme phải có **trước lần vẽ đầu**, nếu không trang chớp màu sáng rồi mới tối:

1. **Attribute render từ server.** PHP in sẵn `data-td-theme` theo lựa chọn người dùng — lưu lựa chọn bằng **cookie**
   (server đọc được), không chỉ `localStorage`:

   ```php
   <?php
   $theme = $_COOKIE['td_theme'] ?? 'auto';
   if (!in_array($theme, ['light', 'dark', 'auto'], true)) $theme = 'auto'; // whitelist, không in chuỗi thô
   $scheme = ['light' => 'light', 'dark' => 'dark', 'auto' => 'light dark'][$theme];
   ?>
   <html lang="vi" data-td-theme="<?= $theme ?>">
   <head>
     <meta name="color-scheme" content="<?= $scheme ?>">
     <link rel="stylesheet" href="/assets/td.css">
   ```

2. **`<meta name="color-scheme">` khớp attribute** (`light` / `dark` / `light dark` cho auto) để nền mặc định, thanh cuộn
   và ô tự điền của trình duyệt đúng màu ngay cả trước khi CSS tải xong.
3. **`auto` không cần JS**: chỉ cần attribute; CSS tự chọn nhánh theo hệ điều hành, kể cả khi JavaScript tắt.
4. Nếu site đổi theme bằng JS phía client (nút chuyển light / dark / auto): script **đồng bộ, không phải module**, đặt
   trong `<head>` trước stylesheet (file ngoài `'self'` hoặc có nonce theo CSP — không inline khi CSP cấm). Module
   (`type="module"`, luôn `defer`) chạy **sau** lần vẽ đầu → chớp. Script đó đặt attribute + ghi cookie:

   ```js
   // theme-boot.js — <script src="/assets/theme-boot.js"></script> trong <head>, KHÔNG type="module"
   (function () {
     var m = document.cookie.match(/(?:^|; )td_theme=(light|dark|auto)/);
     document.documentElement.setAttribute('data-td-theme', m ? m[1] : 'auto');
   })();
   ```

   Nút chuyển (code của site, ví dụ trong module của trang): `document.documentElement.setAttribute('data-td-theme', v)`
   rồi `document.cookie = 'td_theme=' + v + '; path=/; max-age=31536000; SameSite=Lax'`. Kit không có component
   chuyển theme (việc của site).

Trước 0.41.0 docs gợi ý một script `matchMedia` tự đặt / gỡ `data-td-theme="dark"`. Bỏ script đó, dùng
`data-td-theme="auto"` (không JS, không chớp, theo kịp khi hệ điều hành đổi).

### Tinh chỉnh riêng cho dark

Rule không layer của site:

```css
:root[data-td-theme="dark"] {
  --td-color-bg: #0d0f12;
  --td-color-surface: #16181d;
}
/* site dùng auto: cùng giá trị cho nhánh tối của auto */
@media (prefers-color-scheme: dark) {
  :root[data-td-theme="auto"] {
    --td-color-bg: #0d0f12;
    --td-color-surface: #16181d;
  }
}
```

Override của site thắng mọi giá trị của kit (kit nằm trong `@layer td.tokens`). Site ghi đè giá trị dark cũ (trước
0.41.0) thì đối chiếu lại với [danh sách đổi](../upgrading/breaking-changes.md#0410).

## Hợp đồng theme và công thức nền giấy (0.41.0)

Từ 0.41.0, token của component (ô nhập, popup, bảng, badge, chip, switch, nút secondary, alert…) **chỉ đọc** từ một
bộ token ngữ nghĩa — *hợp đồng theme*. Site đặt bộ đó (trong CSS không layer) là cả kit đi theo; không còn ô nhập /
popup trắng cứng trên nền màu.

| Nhóm | Token |
|---|---|
| Bề mặt | `--td-color-bg` (nền trang), `--td-color-surface` (thẻ, bảng), `--td-color-surface-muted` (đầu bảng, readonly), `--td-color-surface-raised` (ô nhập + modal / popup đặc; mặc định = surface), `--td-glass-bg`, `--td-glass-bg-strong` (popup nhỏ, có alpha) |
| Mực | `--td-color-text`, `-text-muted`, `-text-subtle`, `-text-label`, `--td-glass-fg` |
| Cấu trúc | `--td-color-border`, `-border-strong`, `--td-hairline`, `--td-glass-border`, `--td-control-border-strong`, `-border-soft`, `-border-hover`, `--td-focus`, `--td-focus-ring` |
| Tương tác / nền phụ | `--td-color-hover`, `-hover-strong`, `-pressed`, `-skeleton`, `-sheen`, `-fill`, `-fill-strong`, `-on-fill` |
| Accent | `--td-accent`, `--td-accent-fill`, `--td-accent-contrast` |
| Trạng thái | `--td-color-{success,warning,error,info}`, `--td-color-on-status`, `--td-pastel-*`, `--td-alert-{info,success,warning,danger}-{bg,border,icon}` |
| Nút | `--td-btn-primary-{bg,fg,hover,pressed}`, `--td-btn-secondary-{hover,pressed,border}`, `--td-btn-disabled-{bg,fg,border}` |
| Độ nổi | `--td-shadow-1..3`, `--td-glass-shadow(-lg)`, `--td-btn-lift`, `--td-color-overlay`, `--td-tooltip-{bg,fg,border}` |

`--td-control-bg`, `--td-glass-solid` (= `surface-raised`), `--td-control-fg` (= text) và `--td-control-border`
(= border-strong) là **bí danh**: đặt token gốc là đủ; vẫn ghi đè riêng được.

Đổi **một vài** token của bộ này là đủ cho một nền sáng khác (ví dụ dưới). Bộ đầy đủ chỉ cần khi nền tối mà không bật
`data-td-theme="dark"` — từ 0.42.0 dùng [`td-theme`](#palette-tuỳ-biến-td-theme-0420) để sinh cả bộ từ `bg` + `accent`
(tự cân tương phản) thay vì viết tay.

**Luật chữ:** `--td-color-text-subtle` (≈ 3.2:1) chỉ cho icon, chữ lớn, disabled, trang trí. Chữ nhỏ mang nội dung dùng
`--td-color-text-muted` trở lên (≥ 4.7:1). Khi đổi màu nền, kiểm `-text-muted` trên **nền tệ nhất** nó nằm (surface-muted,
ô nhập, nền hover).

### Công thức 135: trang giấy be, bảng / menu / ô nhập trắng

```css
/* site-theme.css — không layer, nạp SAU td.css */
:root {
  --td-color-bg: #ece5d8;            /* nền trang giấy */
  --td-color-surface-muted: #ece5d8; /* đầu bảng, ô readonly, nền trang của layout dùng muted */
  --td-color-surface: #fff;          /* thẻ, bảng */
  --td-color-surface-raised: #fff;   /* ô nhập, modal, popup đặc: cùng trắng với bảng */
  --td-color-text-muted: #5c5850;    /* 5.65 trên giấy, 4.75 trên giấy + hover — xám lạnh #6b6b73 chỉ 4.1 */
  --td-color-text-subtle: #78736a;
  --td-color-text-label: #46423b;
  --td-color-border: #d9cfbd;
  --td-color-border-strong: #c9bfae;
  --td-control-border-soft: #cfc6b6;
  --td-control-border-hover: #a89f8f;
  --td-control-border-strong: #7f7668; /* ≥ 3:1 trên giấy và trên trắng */
  --td-color-fill: #f2ede4;          /* switch tắt, nút secondary, badge neutral: ngả ấm */
  --td-color-fill-strong: #e8e1d4;
  --td-color-skeleton: #e6dfd1;      /* tối hơn surface: không thành "lỗ trắng" */
}
```

- Muốn ô nhập / popup **sáng hơn** bảng một bậc: đặt `--td-color-surface-raised` khác `--td-color-surface`. Muốn tất
  cả theo giấy: đặt `surface` + `surface-raised` cùng màu giấy (ô nhập không còn trắng cứng).
- Bộ này là fixture `test/tokens/palettes/beige.css` của gate toàn trang (chữ ≥ 4.7, viền control, không "đảo trắng",
  3 trình duyệt) — copy nguyên là có số đo.
- Dùng cả dark? Bộ trên chỉ cho light; khai báo dưới `:root:not([data-td-theme="dark"])` hoặc thêm bộ dark riêng
  (bẫy số 1).

## Palette tuỳ biến: `td-theme` (0.42.0)

Bộ hợp đồng theme ở trên có ~90 token. Viết tay cho một nền màu (be, navy, xanh thương hiệu…) vừa mệt vừa dễ trượt tương
phản. Từ 0.42.0 kit **tự tính** cả bộ từ vài màu gốc (*seed*) và sinh ra một **file CSS tĩnh**: không JS lúc chạy, không
chớp trắng, chạy được trên sàn trình duyệt cũ (giá trị là hex sRGB tính sẵn, không `color-mix()` / `oklch()`).

### Seed

| Seed | Bắt buộc | Mặc định khi bỏ trống |
|---|---|---|
| `bg` — nền trang | có | — (không bao giờ bị đổi) |
| `accent` — màu nhấn (link, checkbox, nút ghost, focus) | có | — |
| `surface` — thẻ, bảng | | sáng hơn `bg` một bậc (OKLCH +0.04) |
| `raisedSurface` — popup, modal | | = `surface` |
| `controlSurface` — ô nhập, trigger | | = `raisedSurface`; `#fff` = ép ô nhập trắng |
| `success` / `warning` / `danger` / `info` | | màu trạng thái của kit (light hoặc dark theo nền) |

Seed chỉ nhận `#rgb`, `#rrggbb`, `rgb(r g b)` / `rgb(r, g, b)` — **không alpha**, tối đa 64 ký tự. Sai → lỗi input (CLI
thoát mã 2), không sinh gì.

### Kit tính gì

Nền sáng hay tối (*scheme*) = cực đen / trắng tương phản cao hơn trên `bg`. Từ đó, trong không gian OKLCH (giữ hue,
chỉ dịch độ sáng; chroma chỉ giảm khi ra ngoài sRGB), mọi màu được **làm tròn về hex rồi mới đo** WCAG 2.x trên **mọi nền
nó có thể nằm**:

- chữ chính gần cực (mục tiêu 7:1), chữ label, chữ phụ (`-muted`) ≥ 4.7:1 trên mọi bề mặt + nền hover, chữ mờ
  (`-subtle`) ≥ 3.2:1 — thứ bậc chính > label > phụ > mờ luôn giữ;
- viền control: light giữ nét mềm ~1.5:1 (lựa chọn của owner), **dark ≥ 3:1** với mọi màu kề; viền strict ≥ 3:1;
- hover / pressed / fill / skeleton / nút secondary là pha cực vào bề mặt — **không bao giờ** đẩy nền vào vùng chữ
  không đọc được (khi cần, hover đổi chiều thay vì mờ đi);
- accent tách *mực* (chữ, ≥ 4.7 trên mọi bề mặt) và *nền đặc* (nhãn trắng / đen trên nó ≥ 4.7); mỗi màu trạng thái có
  mực, pastel, nền alert, icon;
- bóng, overlay, tooltip theo scheme;
- sau bộ hợp đồng, file sinh còn ghi **token component phụ thuộc sáng / tối** (nền hover / nhấn của nút thao tác, nhãn
  nút ghost khi hover, mục "tạo mới" của dropdown, dòng chọn / sọc bảng, pill tab, nền dropzone, badge accent, tóm tắt lỗi
  form…) — tính tĩnh từ chính palette, nên một theme tối đặt ở khe trang hay dưới tên riêng (nơi rule dark của kit không
  áp) vẫn đúng, và không cần `color-mix()`.

Không cần đọc thêm gì để dùng; file sinh ra **liệt kê đủ hợp đồng** theo thứ tự cố định.

### Dải chết: vì sao có màu nền "không đạt" và kit làm gì

Với nền xám tầm trung (luminance ≈ 0.17–0.19, kiểu `#767676`–`#777777`), **không có màu chữ nào** — kể cả đen tuyền hay
trắng tuyền — đạt 4.7:1. Đây là giới hạn toán học, không phải lỗi của kit. Kit **giữ nguyên nền của site** (không tự đổi
màu thương hiệu), dùng cực đen / trắng tốt nhất và báo mã ổn định `TD_THEME_CONTRAST_UNSATISFIABLE` cho từng cặp trượt.
Cách sửa nằm ở site: nhích `bg` sáng hơn hoặc tối hơn một chút.

### CLI

```bash
npx td-theme --bg '#ece5d8' --accent '#b3261e' --surface '#fff' > td-theme.css
npx td-theme --bg '#16233a' --accent '#3b82f6' --mode dark > td-theme-dark.css   # khe dark + nhánh tối của auto
npx td-theme --bg '#f4faf9' --accent '#0f766e' --name paper > td-theme-paper.css  # data-td-theme="paper"
npx td-theme --preset dark --name night > night.css                                 # giá trị dark CỦA KIT dưới tên "night"
```

| Tham số | Ý nghĩa |
|---|---|
| `--bg`, `--accent`, `--surface`, `--raised-surface`, `--control-surface`, `--success`, `--warning`, `--danger`, `--info` | seed |
| `--mode light` (mặc định) | khe trang: `:root, [data-td-theme]` |
| `--mode dark` | khe `data-td-theme="dark"` + nhánh tối của `auto` |
| `--name <tên>` | theme có tên `data-td-theme="<tên>"` (chữ thường, số, `-`, ≤ 32 ký tự, không `light` / `dark` / `auto`) |
| `--preset light\|dark` | giá trị có sẵn của kit (không sinh) — light / dark dựng sẵn chỉ lấy qua preset, generator không tái tạo chúng |
| `--diagnostics=json` | chẩn đoán dạng một JSON trên stderr (token chuẩn hoá + mã) |
| `--allow-aa-failure` | thoát 0 dù có cặp bắt buộc trượt; file mở đầu bằng comment cảnh báo |
| `--version`, `--help` | |

**Đầu ra:** CSS ra **stdout** (chỉ CSS), chẩn đoán ra **stderr**. CLI không đọc / ghi file — bạn tự chuyển hướng `>`.

| Mã thoát | Nghĩa | stdout |
|---|---|---|
| `0` | ổn (hoặc trượt AA nhưng có `--allow-aa-failure`) | CSS |
| `1` | có cặp bắt buộc trượt WCAG AA (dải chết) | CSS, dòng đầu `/* td-theme: WARNING — … NOT accepted … */` |
| `2` | input / tham số sai | rỗng |
| `3` | lỗi nội bộ (báo lại cho kit) | rỗng |

**Đọc chẩn đoán** (mỗi dòng: mức · mã · token · nền tệ nhất · tỉ lệ < cần):

| Mã | Mức | Nghĩa |
|---|---|---|
| `TD_THEME_CONTRAST_UNSATISFIABLE` | error-AA | không màu nào đạt ngưỡng trên mọi nền của token (dải chết); token giữ cực tốt nhất |
| `TD_THEME_CONTRAST_MISS` | error-AA | trượt dù có màu đạt — lỗi của generator, hãy báo lại |
| `TD_THEME_PREFERRED_MISS` | info | chữ chính dưới mục tiêu 7:1 (vẫn ≥ 4.7) |
| `TD_THEME_ACCENT_ADJUSTED` | warn | mực / nền accent khác seed (đã chỉnh độ sáng để đọc được), kèm `từ → thành` |
| `TD_THEME_GAMUT_REDUCED` | info | màu chỉnh đã mất chroma để nằm trong sRGB |
| `TD_THEME_APCA` | info | Lc APCA của chữ chính / phụ — chỉ tham khảo, cổng là WCAG 2.x |

Chỉ `error-AA` làm CLI thoát 1. Trong CI: để mặc định (fail khi trượt); chỉ dùng `--allow-aa-failure` khi đã chấp nhận rủi ro.

### Trang builder (không cần Node)

Package có sẵn `src/theme/builder/theme-builder.html`: nhập seed (ô text + bảng màu), xem trước control / bảng / menu /
trạng thái / thứ bậc chữ ngay trên palette, bảng tỉ lệ từng cặp bắt buộc + mã chẩn đoán, nút **Copy** / **Tải về**.
Cùng module + serializer với CLI: **cùng seed → cùng từng byte**. Khi có cặp trượt AA, nút xuất bị khoá cho tới khi tick
**"Xuất dù trượt AA"** (file có cùng comment cảnh báo như CLI).

Mở nó qua **bất kỳ web server tĩnh** đang phục vụ thư mục package — `file://` **không chạy** (trình duyệt chặn module
script):

```bash
cd node_modules/@dazzxq/td-components && php -S 127.0.0.1:8080
# hoặc: python3 -m http.server 8080
# mở http://127.0.0.1:8080/src/theme/builder/theme-builder.html
```

Site PHP vốn đã phục vụ `td.css` + module của kit thì mở thẳng đường dẫn tương ứng. Trang tuân CSP strict (không
inline script / style; xem trước bằng constructable stylesheet).

### Dùng file sinh ra

**Thứ tự nạp: `td.css` → file sinh → CSS của site.** File sinh bọc `@layer td.tokens` với **đúng selector + specificity**
của khe kit tương ứng, nạp sau nên thắng kit; CSS không layer của site vẫn thắng cả hai.

Với site PHP, đặt file vào thư mục asset public với **tên có hash nội dung** để cache không giữ bản cũ:

```bash
npx td-theme --bg '#ece5d8' --accent '#b3261e' --surface '#fff' > td-theme.css
h=$(shasum -a 256 td-theme.css | cut -c1-8)   # Linux: sha256sum
mv td-theme.css "public/assets/td-theme.$h.css" && echo "td-theme.$h.css"
```

```php
<link rel="stylesheet" href="/assets/td.css">
<link rel="stylesheet" href="/assets/td-theme.7d92c1ab.css">   <!-- tên in ra ở trên -->
<link rel="stylesheet" href="/assets/site.css">
```

Header của file ghi phiên bản thuật toán + hợp đồng (`palette algorithm 4, THEME_TOKENS v1`) và seed đã chuẩn hoá về
hex. **Sinh lại khi nâng `td-components`** (so header với `npx td-theme --version`); không sửa tay file sinh.
Thuật toán 2 (0.42.1) chỉ thêm một dòng `--td-form-summary-pressed-bg` (= `--td-color-pressed` của palette), mọi giá trị
khác như thuật toán 1; file thuật toán 1 vẫn chạy đúng (thiếu token → mặc định `var(--td-color-pressed)` của kit).
Thuật toán 3 (0.46.0) chỉ thêm hai dòng `--td-diff-added-bg` / `--td-diff-removed-bg` (nền ô của `td-diff`: success /
error phủ lên surface, kẹp để chữ / nhãn / chữ muted ≥ 4.7), mọi giá trị khác như thuật toán 2; file cũ vẫn chạy (thiếu
token → giá trị light / dark của kit — chỉ lệch nếu nền của palette khác xa nền kit).

Dùng palette cho dark: sinh thêm một file `--mode dark` (hoặc `--preset dark` nếu muốn giữ dark của kit) và nạp sau file
light — khe dark có specificity cao hơn, thứ tự giữa hai file không quan trọng.

Từ JS (build của site, hoặc trang admin): `import { generatePalette, toCss } from '@dazzxq/td-components/theme'` — module
thuần, không DOM.

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

Vì fallback dùng `--td-glass-solid` (0.41.0: = `--td-color-surface-raised`), nếu site đổi nền bề mặt (`--td-glass-bg` /
`-bg-strong`) sang tông giấy riêng thì **nhớ đổi cả** `--td-color-surface-raised` (hoặc `--td-glass-solid`) cho khớp.

## Tinh chỉnh bề mặt cho hợp site

| Muốn | Chỉnh | Lưu ý |
|---|---|---|
| Bề mặt ngả màu giấy của site | `--td-color-surface-raised` (0.41.0: modal, ô nhập, fallback), `--td-glass-bg`, `--td-glass-bg-strong` | `-bg-strong` đủ đục để chữ ≥ 4.5:1 trên nền tối nhất có thể nằm sau. Cả trang: [công thức nền giấy](#công-thức-135-trang-giấy-be-bảng--menu--ô-nhập-trắng) |
| Mờ hơn / ít mờ hơn | `--td-glass-blur` | Giữ nhẹ (≤ 20px) — blur tốn GPU |
| Bóng nhẹ / đậm hơn | `--td-glass-shadow`, `--td-glass-shadow-lg`, `--td-btn-lift` | Một lớp shadow mềm là đủ |
| Viền rõ hơn | `--td-glass-border` | |
| Bo góc | `--td-glass-radius`, `--td-glass-pad` | `--td-glass-radius-inner` tự tính lại |
| Bỏ blur | `--td-glass-blur: none;` (chỉ bỏ blur) hoặc `data-td-glass="off"` trên `<html>` (bỏ blur + nền đặc) | Fallback trợ năng vẫn đúng |

```css
:root {
  --td-glass-bg: oklch(98% 0.01 80 / 0.9);
  --td-glass-bg-strong: oklch(98% 0.01 80 / 0.94);
  --td-color-surface-raised: #f7f3ea;      /* 0.41.0: modal, ô nhập + nền đặc khi fallback (tooltip: --td-tooltip-bg) */
}
:root[data-td-theme="dark"] {
  --td-color-surface-raised: #1a1714;
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
  --td-focus: #b3261e;            /* vòng focus của nút / checkbox / switch tự theo (0.41: vòng đặc 2px + khe 1px) */
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
  --td-focus: #f2665c;                       /* vòng focus tự theo */
}
```

Không đặt `--td-accent-fill` thì nền sẽ là 80% của `#f2665c` (≈ `#c2524a`, chữ trắng chỉ ≈ 4.6:1, sát ngưỡng) — với
accent sáng, nên tự chọn fill.

**Bước 3 — kiểm tra những thứ không đi theo accent** (quyết định có đổi không):

- `--td-switch-on` (toggle bật) mặc định xanh lá `#16a34a`, không theo accent.
- Nút primary mặc định **đen** (0.21.0) — chỉ theo accent khi bạn map như bước 1.
- Nút `success` / `danger` / `info` / `warning` dùng bộ [màu đặc](#màu-ngữ-nghĩa-đặc-0360) (`--td-btn-{v}-bg`).
- Toast dùng bộ [pastel](#màu-pastel-0210-deprecated-0360) theo loại (`--td-toast-{type}-bg/-fg/-border`), không dùng accent.

**Bước 4 — kiểm tra tương phản.** Kit chỉ gate giá trị mặc định. Với màu mới, kiểm tra bằng DevTools (hoặc
`contrastRatio()` trong [dom-utils](../components/utilities.md)): chữ trắng trên `--td-accent-fill` ≥ 4.5:1 (light và dark), accent
làm chữ/viền trên nền trang ≥ 3:1.

**Bước 5 — xem thử** trên các trang có nút primary, checkbox đã chọn, slider, pagination, toggle, và bật
`data-td-theme="dark"` nếu có.

## Theme theo vùng

Từ 0.42.0 ([ADR 0020](../internal/decisions/0020-theme-scope-portal.md)) attribute `data-td-theme` chạy trên **bất kỳ
phần tử nào**, không chỉ `<html>`:

```html
<html lang="vi">                                  <!-- trang sáng -->
  …
  <section class="promo" data-td-theme="dark">     <!-- vùng tối: bảng, ô nhập, badge, nút… theo dark -->
    <td-dropdown label="Gói"></td-dropdown>       <!-- menu của nó (ra <body>) cũng tối -->
    <div data-td-theme="light">…</div>             <!-- lồng: sáng lại trong vùng tối -->
  </section>
  <aside data-td-theme="paper">…</aside>          <!-- theme có tên do td-theme --name paper sinh -->
```

- Mọi token **màu / bóng** được giải lại trên phần tử có attribute, nên token gốc là đủ (không cần ghi đè từng token
  con như trước). `color-scheme` (thanh cuộn, ô native) cũng theo vùng.
- Token **hình học** (độ rộng, chữ, khoảng cách, bo góc, z-index, chuyển động) ở lại `:root`: `:root { --td-radius-lg:
  10px }` của site vẫn tới được trong vùng.
- Ghi đè màu **theo vùng**: đặt trên chính phần tử có attribute (CSS của site):

  ```css
  .promo[data-td-theme] { --td-accent: #f59e0b; }   /* checkbox, ghost, focus, slider… trong vùng đổi theo */
  [data-td-theme="dark"] { --td-color-surface: #18181b; } /* mọi vùng dark */
  ```

### Popup mở từ trong vùng

Dropdown, chip-input, tree-select, menu, hovercard, tooltip, modal, drawer, toast, loading, media picker được đưa ra
`<body>` (để không bị cắt). Khi mở từ trong một vùng (phần tử có `data-td-theme` **không phải** `<html>`), kit chép
attribute + **ảnh chụp các token ngữ nghĩa của vùng** lên gốc popup (CSSOM, hợp CSP), và gỡ đúng những gì đã chép khi
đóng. Hợp đồng:

- chỉ **token ngữ nghĩa của hợp đồng theme** (`THEME_TOKENS`: `--td-color-*`, `--td-accent*`, `--td-control-*`,
  `--td-glass-*`, `--td-btn-primary-*`… — bảng [Hợp đồng theme](#hợp-đồng-theme-và-công-thức-nền-giấy-0410)) + `color-scheme`,
  **đặt trên phần tử có `data-td-theme`**, được chép sang popup. Token component trong popup tự giải lại từ chúng;
- token **riêng của component** đặt trên vùng (`.promo[data-td-theme] { --td-checkbox-color: red; --td-option-hover-bg: … }`)
  **không** được chép. Ngoại lệ tự nhiên: rule của site chọn theo **giá trị** attribute (`[data-td-theme="dark"] { … }`,
  file sinh `td-theme --name x`) cũng khớp gốc popup vì attribute được chép theo — kể cả token component trong rule đó;
- override **cục bộ không đánh dấu** (`.card { --td-accent: red }` bên trong vùng, `.card` không có `data-td-theme`) →
  **không** đi theo popup, kể cả token ngữ nghĩa. Muốn popup theo: chuyển override (token ngữ nghĩa) lên phần tử có
  attribute, hoặc viết rule theo giá trị attribute;
- popup lồng (menu mở trong modal của vùng) tự đúng;
- ảnh chụp lấy **lúc mở**: đổi theme khi popup đang mở thì đóng / mở lại;
- lightbox không theo vùng (luôn tối, nền là ảnh).

Overlay gọi bằng code không có "trigger" trong vùng → truyền `themeRoot` (một phần tử bất kỳ trong vùng); không truyền thì
theo theme của trang:

```js
TdModal.show({ title: 'Xoá?', body, themeRoot: section });
TdModal.confirm({ message: 'Chắc chắn?', themeRoot: section });
TdToast.success('Đã lưu', { themeRoot: section });
TdLoading.show({ message: 'Đang tải…', themeRoot: section });
TdMenu.open(button, items, { themeRoot: section });
TdDrawer.open({ title: 'Chi tiết', body, themeRoot: section });
TdMediaPicker.open({ adapter, themeRoot: section });
TdCropper.openDialog({ src, themeRoot: section });
```

Component của kit tự truyền host của nó (datetime-picker / -range, scan-input, media-field), nên không cần làm gì.

**Đổi hành vi so với 0.41 (chỉ khi site dùng vùng):** override **màu** không layer trên `:root` (`:root { --td-accent:
red }`) không còn chảy vào bên trong `[data-td-theme]` — vùng khai báo lại giá trị của theme đó. Ghi đè thêm trên
`[data-td-theme="…"]` nếu muốn. Trang không dùng vùng: không đổi gì. Chi tiết: [breaking-changes § 0.42.0](../upgrading/breaking-changes.md#0420).

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
| td-number-input `stepper` | `--td-number-step-size` (bề rộng nút − / +, `2.5rem`, ≥ 44px trên cảm ứng), `--td-number-step-fg` (icon, `var(--td-control-fg)`), `--td-number-stepper-w` (bề rộng host, `9rem`) (0.49.0) | `:root` (màu: `:root, [data-td-theme]`) | [number-input.md](../components/number-input.md#8-stepper) |
| td-choice-group | `--td-choice-gap`, `--td-choice-h` (`2.5rem`, 44px cảm ứng), `--td-choice-radius`, `--td-choice-swatch-size` (`2rem`); màu: `--td-choice-bg` / `-border` / `-border-hover` (= token control), `--td-choice-selected` (vòng mực 2px, `var(--td-color-text)`), `--td-choice-hint-fg` (`var(--td-color-text-muted)`), `--td-choice-swatch-edge` (`var(--td-color-border-strong)`) (0.49.0); segmented (0.52.0): `--td-choice-seg-bg` (`var(--td-color-hover)`), `-pill` (`var(--td-control-bg)`), `-ring` (`var(--td-color-text-muted)`, ≥ 3:1 với rãnh + viên), `-fg` / `-fg-selected`, `-h` (`2.5rem`; sm 2 / lg 3), `-pad`, `-radius`; hình học ô (0.53.1): `-gap` (`2px`), `-px`, `-font`, `-icon`, `-icon-gap` (md = 0.52; sm / lg đặt lại trên biến thể) — chỉ đọc token hợp đồng theme, không thêm `THEME_TOKENS` | `:root` (màu: `:root, [data-td-theme]`) | [choice-group.md](../components/choice-group.md) |
| td-repeater | `--td-repeater-gap` (khoảng cách trong dòng + đệm dòng, `var(--td-space-sm)`), `--td-repeater-btn-size` (`2rem`, ≥ 44px trên cảm ứng), `--td-repeater-btn-fg` / `-fg-hover` / `-bg-hover` / `-disabled-fg`, `--td-repeater-divider` (0.30.0) | `:root` | [repeater.md](../components/repeater.md) |
| td-media-field | `--td-media-field-w` (bề rộng host, `100%`), `--td-media-field-empty-h` (khung rỗng khi không có `aspect-ratio`, `10rem`), `--td-media-field-max-h` (trần chiều cao ảnh khi không có `aspect-ratio`, `24rem`) (0.32.0) | `:root` (hoặc trên từng host) | [media-field.md](../components/media-field.md) |
| td-cropper | `--td-cropper-h` (chiều cao vùng cắt inline, `min(60vh, 32rem)`), `--td-cropper-dim` (vùng mờ ngoài khung, `rgb(0 0 0 / 55%)`), `--td-cropper-line` (viền trong của khung, trắng), `--td-cropper-line-contrast` (viền ngoài, đen 60 % — khung thấy được trên ảnh trắng lẫn đen), `--td-cropper-handle` (nền tay nắm), `--td-cropper-focus` / `--td-cropper-focus-halo` (vòng focus hai tông trên ảnh: trắng + quầng đen 75 %) (0.35.0). Mặc định qua gate `test:contrast` ≥ 3:1 trên ảnh trắng / đen / vùng mờ; ghi đè thì site tự kiểm. `--_tdc-*` (vị trí do JS đặt) là private | `:root` (hoặc trên từng `td-cropper`) | [cropper.md](../components/cropper.md) |
| td-scan-input | `--td-scan-list-max` (chiều cao tối đa danh sách mã ở chế độ `multiple`, cuộn bên trong, `50vh`), `--td-scan-ready` (màu chỉ báo "Sẵn sàng quét" khi ô focus, `--td-color-success`), `--td-scan-idle` (chỉ báo khi không focus, chữ phụ), `--td-scan-font-size` (cỡ chữ ô nhập, ≥ 16px để iOS không phóng to), `--td-scan-list-bg` / `--td-scan-list-border` / `--td-scan-row-sep` (nền đặc + hairline danh sách), `--td-scan-valid` / `--td-scan-invalid` (trạng thái dòng) (0.38.0). Chữ chỉ báo / dòng lỗi / "Đã quét: n" qua gate `test:contrast` ≥ 4.7 | `:root` (hoặc trên từng `td-scan-input`) | [scan-input.md](../components/scan-input.md) |
| td-check-matrix | `--td-check-matrix-cell-size` (chiều cao ô, `2.25rem`, `2.75rem` trên con trỏ thô), `--td-check-matrix-label-w` (cột nhãn sticky, `clamp(10rem, 28cqi, 18rem)`), `--td-check-matrix-col-w` (cột dữ liệu, `5.5rem`), `--td-check-matrix-max-height` (khung cuộn, `70vh`; attribute `max-height` ghi đè qua CSSOM), `--td-check-matrix-head-bg` / `-group-bg` (header + cột sticky / hàng nhóm, nền đặc, `var(--td-color-surface-muted)`), `--td-check-matrix-row-active` (hàng + header cột đang focus, `var(--td-color-hover)`), `--td-check-matrix-changed` (tam giác "đã đổi", `var(--td-accent)`), `--td-check-matrix-note-mark` (chấm ghi chú, `var(--td-color-text-muted)`) (0.47.0). Mọi màu suy ra từ token theme; chữ ≥ 4.7, dấu hình ≥ 3, mark khoá (60 %) ≥ 2.2 qua `test:contrast` | `:root` (màu: `:root, [data-td-theme]`) | [check-matrix.md](../components/check-matrix.md) |
| td-datetime-range | `--td-dtr-preset-h` (chiều cao chip preset, 44px trên cảm ứng), `--td-dtr-preset-bg` / `-fg` / `-border` / `-hover-bg`, `--td-dtr-preset-on-bg` / `-on-fg` / `-on-pressed` (preset đang khớp, mặc định màu nút primary), `--td-dtr-switch-bg` / `--td-dtr-tab-on-bg` / `--td-dtr-tab-fg` / `--td-dtr-tab-note` (công tắc "Từ \| Đến" < 720px) (0.40.0). Trigger dùng `--td-field-*`, bánh xe `--td-dtp-*`. Chữ preset / công tắc / dòng lỗi qua gate `test:contrast` ≥ 4.7 | `:root` (hoặc trên từng `td-datetime-range`) | [datetime-range.md](../components/datetime-range.md) |
| td-color-picker | `--td-color-picker-width` (độ rộng popup, `17.5rem`), `--td-color-picker-area-height` (vùng 2 chiều, `10rem`; 7rem khi màn hình thấp), `--td-color-picker-swatch` (ô màu trong ô nhập, `1.5rem`) — `:root`; màu: `--td-color-swatch-border` (viền ô màu / preset, `var(--td-control-border-strong)`, ≥ 3:1 với nền ô) và `--td-color-checker` (ô cờ "chưa có màu", `var(--td-color-border)`) — dẫn từ hợp đồng theme, theo vùng (0.48.0). Ô nhập dùng `--td-field-*`, popup `--td-glass-*`. Chữ / icon / mép ô màu qua gate `test:contrast` | `:root` (hoặc trên từng `td-color-picker`) | [color-picker.md](../components/color-picker.md) |
| td-media-picker | viền trạng thái card (0.33.0): `--td-media-picker-card-viewing` (đang xem, mặc định `var(--td-accent)`), `--td-media-picker-card-hover` (mặc định `var(--td-media-picker-card-viewing)`), `--td-media-picker-card-checked` (đã chọn, mặc định `var(--td-color-success)`; thắng đang xem). Cả ba mặc định qua gate `test:contrast` ≥ 3:1 trên surface; ghi đè thì site tự kiểm. Vỏ dùng `--td-modal-*`, lưới dùng `--td-media-grid-*` | `:root` | [media-picker.md](../components/media-picker.md) |
| td-media-grid | `--td-media-grid-*` — cũ: `-cols`, `-gap`, `-radius`, `-tick-*`. Mới (0.33.0): `--td-media-grid-fit` (`object-fit` của ảnh trong ô, `cover` / `contain`), `--td-media-grid-ratio` (tỉ lệ khung ô, mặc định `auto` = cao theo ảnh), `--td-media-grid-selected-ring` (vòng inset của ô đã chọn), `--td-media-grid-selected-scale` (mặc định **`1`**, trước 0.88), `--td-media-grid-tick-inline` (góc tick: `start` \| `end`); với `layout="justified"`: `--td-media-grid-row-ratio` / `-md` / `-sm` (Σ tỉ lệ đích mỗi dòng theo bề rộng **lưới** — 0.34.0: ≥ 1024px `5.5`, 720–1023px `4`, < 720px `2.5`), `--td-media-grid-fallback-ar` (tỉ lệ tạm khi chưa biết kích thước ảnh, `1.5`). Ảnh trong ô do grid đặt kích thước bằng CSSOM inline `!important`: đổi bằng token, **không** đặt CSS lên `img` | `:root` (hoặc trên từng `td-media-grid`) | [media-grid.md](../components/media-grid.md) |
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
| td-filter-chips | `--td-filter-chip-*` — `-bg`, `-fg`, `-label-fg`, `-border`, `-radius`, `-h` (`28px`), `-gap`, `-max` (bề rộng tối đa của giá trị, `16rem`), `-remove-fg` (icon ×, ≥ 4.7:1 trên nền chip), `-remove-hover` (0.39.0). Mặc định qua gate `test:contrast`; ghi đè thì site tự kiểm | `:root` | [filter-chips.md](../components/filter-chips.md) |
| td-steps | Hình học `--td-steps-marker` (`28px`), `--td-steps-line` (`2px`), `--td-steps-gap`; màu `--td-steps-{done,current,upcoming,error}-{bg,fg,border}`, `--td-steps-connector`, `--td-steps-connector-done` (0.45.0) — mặc định là `var()` của hợp đồng theme (accent, surface, viền control, cặp lỗi của alert): dark / palette sinh / theme theo vùng không cần thêm gì | hình học `:root`; màu `:root, [data-td-theme]` | [steps.md](../components/steps.md) |
| td-timeline | Hình học `--td-timeline-marker` (`28px`), `--td-timeline-line` (`2px`), `--td-timeline-gap`; màu `--td-timeline-marker-{bg,fg,border}`, `--td-timeline-connector`, `--td-timeline-day-fg` (0.45.0); tông dùng `--td-alert-{v}-{bg,border,icon}` | hình học `:root`; màu `:root, [data-td-theme]` | [timeline.md](../components/timeline.md) |
| td-diff | `--td-diff-*` — `-added-bg` / `-removed-bg` (nền ô "Sau" / "Trước": light `#eef6f1` / `#fbf2f2`, dark `#1d3026` / `#362628` — token phụ thuộc sáng / tối, **palette `td-theme` tự tính** cho nền của site: chữ / nhãn / chữ muted ≥ 4.7 trên chúng), `-added-fg` / `-removed-fg` / `-changed-fg` (chữ "Thêm" / "Xoá" / "Đổi" = màu ngữ nghĩa), `-muted-fg`, `-border`, `-head-bg`, `-label-w` (`30%`), `-json-max-h` (`24rem`), `-font-mono` (0.46.0). Mặc định qua gate `test:contrast` + `test:page-contrast`; ghi đè thì site tự kiểm | `:root` (màu: `:root, [data-td-theme]`) | [diff.md](../components/diff.md) |
| td-rating (0.50.0) | `--td-rating-*` — `-fill` (`--td-solid-warning-bg`), `-stroke` (`--td-color-warning`, viền sao tô ≥ 3.2), `-empty` (`--td-color-border-strong`, trang trí), `-value-fg`, `-count-fg`, `-size`, `-gap` | màu: `:root, [data-td-theme]` (alias token hợp đồng — palette `td-theme` tự đúng); hình học: `:root` | [rating.md](../components/rating.md#token-css) |
| td-carousel (0.50.0) | `--td-carousel-*` — `-per-view[-sm\|-md\|-lg\|-xl]` (không đặt mặc định), `-slide-size`, `-peek`, `-gap`, `-gutter`, `-btn-size` (36 / coarse 44), `-dot-size`, `-dot` / `-dot-active` (`--td-color-text-subtle` / `--td-color-text`); nút dùng `--td-btn-secondary-*` | màu: `:root, [data-td-theme]`; hình học: `:root` | [carousel.md](../components/carousel.md#token-css) |
| td-tabs | `--td-tabs-*` | `:root` | [tabs.md](../components/tabs.md) |
| td-pagination | `--td-pagination-*` | `:root` (có `@media (pointer: coarse)`) | [pagination.md](../components/pagination.md) |
| td-empty-state | `--td-empty-state-*` | `:root` (`--sm` / `--lg` / `--compact` đặt lại `-pad` / `-gap` trên phần tử) | [empty-state.md](../components/empty-state.md) |
| Icon | `--td-icon-*` (bảng trên) | `:root` | [icons.md](../components/icons.md) |
| Badge (`.td-badge`) | `--td-badge-*` — 0.36.0: nền đặc ngữ nghĩa, `-ink` (outline / stamp), `-border` (viền hex tính sẵn), `--td-badge-shadow`; gồm font `--td-badge-font-family` (mặc định `var(--td-font-sans)`) và `--td-badge-stamp-font-family` (mặc định `var(--td-font-mono)`, 0.19.0). Ghi đè `--td-badge-*-fg` / `-bg` thì site tự kiểm tương phản (gate chỉ đo mặc định) | `:root` | [badge.md](../components/badge.md) |
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
