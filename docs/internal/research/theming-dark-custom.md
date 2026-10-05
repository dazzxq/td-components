# Nghiên cứu: dark mode chính thức + màu tuỳ biến tự cân tương phản

> Trạng thái: **nghiên cứu, chưa implement** (2026-10-05, trên `main` v0.35.0). Đầu vào cho plan của bản theming kế
> tiếp. Yêu cầu của owner: hỗ trợ cả light và dark; ngoài ra cho site chọn màu nền/accent riêng (vd. 135: trang be kem,
> bảng/menu trắng) và **kit tự tính** chữ, viền, hover… bên trong để đọc dễ trên nền đã chọn.

Phương pháp: đọc `tokens.css`, `theme-dark.css`, 44 file `src/styles/components/*.css`, JS dưới `src/`; script kiểm kê
(regex màu theo ngữ cảnh layer); chạy `demo.html` (Vite, cổng 5195) bằng Playwright Chromium ở **4 theme × 2 bề rộng
(1280, 390) × 39 section** + 6 trạng thái overlay (dropdown mở, menu, toast + tooltip, modal, datetime picker, focus);
đo tương phản **từng phần tử có chữ** (màu chữ composite trên nền hiệu dụng); thử theme theo vùng; prototype bộ sinh
palette + fuzz 20 000 nền ngẫu nhiên. Ảnh chụp (không commit, trong scratchpad của phiên):
`…/scratchpad/theming-audit/` — `{theme}-{width}-{NN}.png` theo section, `montage/{width}-{NN}.png` (4 theme cạnh
nhau), `montage/ov-*.png` (overlay), `measure.json` (số đo).

Bốn theme thử:

| Theme | Cách dựng | Ý nghĩa |
|---|---|---|
| `light` | mặc định | baseline |
| `dark` | `<html data-td-theme="dark">` | dark thử nghiệm hiện có |
| `beige` | rule không layer `:root{--td-color-bg:#ece5d8;--td-color-surface:#f5efe3;--td-color-surface-muted:#ece5d8;--td-color-border:#d9cfbd}` + nền trang `#ece5d8` | việc một site như 135 **làm được hôm nay** bằng token ngữ nghĩa |
| `navy` | như trên với `#16233a / #1e2d48 / #2e4166`, **không** bật dark | "màu riêng không phải light/dark" — đúng thứ owner muốn kit tự xử lý |

---

## 1. Kiểm kê màu cứng

### 1.1 Tin tốt: rule component gần như sạch

Ngoài layer `td.tokens`, rule component **chỉ đọc token**. Màu literal còn lại trong rule:

| File | Dòng | Literal | Đánh giá |
|---|---|---|---|
| `lightbox.css` | 248–869 (20 chỗ) | `#fff`, `#000`, `#26262a`, `#1c1c1f`, `rgb(255 255 255 / 14%)`, `#ffd60a`… | Cố ý: lightbox luôn tối (nền là ảnh). Giữ, nhưng nên gom vào token `--td-lb-*` cho đồng bộ |
| `button.css` | 181 | `color: #1d4ed8` (hover ghost khi không có `color-mix`) | **Lỗi dark/custom**: xanh đậm trên nền tối → 2.54:1 (trên `#1c1c1e`). Chỉ ảnh hưởng engine < Chrome 111 / FF 113 |
| `button.css` | 158, 162 | `color-mix(… 92%, #000)` | Hover tối đi 8 % — trên nền tối nên *sáng* lên (đã đúng cho primary dark bằng token riêng, không cho `--custom`/alias tint) |
| `switch.css` | 102 | `box-shadow: 0 1px 3px rgb(0 0 0 / 18%)` | Bóng thumb; vô hại, nên thành token |
| `skeleton.css` 56/58, `tabs.css` 165–177, `datetime-picker.css` 296 | `#000` trong `mask-image` | Mask chỉ dùng alpha — **không phải màu**, bỏ qua |
| `media-picker.css` | 203 | `--td-media-grid-tick-on-fg: #fff` | Chữ trên nền `--td-color-success`; dark success `#22c55e` + trắng = 2.3:1 → nên dùng `--td-color-on-status` |

JS: không component nào ghi màu cứng vào DOM. Có **ba bản sao** thuật toán chọn chữ đen/trắng theo WCAG:
`dom-utils.js` (`getAccessibleTextColor`, `contrastRatio`), `td-button.js` (`_getContrastColor`, hover
`rgb(0 0 0 / 12%)` / `rgb(255 255 255 / 30%)`), `td-tooltip.js` (dòng 716–718), `td-pagination.js` (267). Đây là
"prior art" cho bộ sinh palette — nên gom về một module.

### 1.2 Tin xấu: các token **gốc** là literal "giả định nền trắng", không suy ra từ surface

142 token component là **dẫn xuất** (`var(--td-color-*)`, `var(--td-control-*)`…) — tốt. Nhưng những token gốc mà
chúng dẫn xuất từ lại là hằng số light:

| Token | Giá trị | Hệ quả khi site đổi `--td-color-surface` |
|---|---|---|
| `--td-control-bg` | `#fff` | **Mọi ô nhập** (field, dropdown trigger, dtp, number, OTP, chip-input, tree-select, dropzone, tree search, alt của media-field) vẫn trắng |
| `--td-glass-solid` / `--td-glass-bg(-strong)` | `#fff` / `rgb(255 255 255 / 90–94%)` | Modal, popup dropdown/menu/hovercard, datetime picker, scroll-top vẫn trắng |
| `--td-gray-50…950` | ramp xám lạnh | `--td-field-bg-disabled` (gray-100), `--td-field-label` (gray-700), `--td-field-placeholder` (gray-600), `--td-slider-track`, `--td-badge-neutral-bg`, `--td-btn-secondary-bg` lệch tông với nền ấm |
| `--td-color-hover(-strong)`, `--td-hairline`, `--td-glass-border`, `--td-btn-secondary-border` | `rgb(0 0 0 / 5–12%)` | Đúng trên mọi nền sáng (alpha), **sai** trên nền tối tuỳ biến (vô hình) |
| `--td-color-skeleton` / `--td-color-sheen` | gray-100 / `rgb(255 255 255 / 60%)` | Khối skeleton **sáng hơn** nền be (đảo affordance) |
| `--td-chip-bg` | `#ebebeb` (comment: "= 8 % đen trên field #fff") | Tính sẵn cho nền trắng |
| alert (16), badge, pastel (12), toast | hex light/dark cặp đôi | Đúng cho 2 theme dựng sẵn, không thích nghi nền tuỳ biến |
| `--td-btn-primary-bg` | `#18181b` | Trên nền tối tuỳ biến (navy) nút primary chìm (≈1.3:1 với nền) |
| `--td-tooltip-bg` | `#18181b` cả hai theme | Dark: `#18181b` trên `#111113` = **1.06:1**, chỉ còn viền 12 % trắng |

### 1.3 Token màu không có giá trị dark

Literal (không dẫn xuất) mà `theme-dark.css` / khối dark của component **không** đặt lại:
`--td-shadow-1/2/3` (dùng ở table, tabs, slider, media-picker — alpha 6–12 % gần như vô hình trên nền tối),
`--td-switch-on` (`#16a34a` — ổn, 5.2:1), `--td-switch-thumb`, `--td-field-focus` (fallback `#3b82f6`, ổn),
`--td-media-grid-tick-*` (trên ảnh — ổn), `--td-tooltip-bg/-fg` (cố ý, nhưng xem 1.06:1 ở trên). Thang
`--td-gray-*` không có bản dark (đúng: nó là primitive) — nhưng vì vậy component nào đọc thẳng gray-* phải tự có
nhánh dark (field.css có, switch.css:98 `var(--td-gray-600)` fallback thì không).

### 1.4 Lỗi kiến trúc: theme **không scope được** (đã đo)

Mọi token dẫn xuất được khai báo trên `:root` nên `var()` được giải **tại `:root`** rồi mới kế thừa (docs đã ghi
"bẫy số 2"). Thử trong demo:

```text
<div data-td-theme="dark">           → --td-color-text vẫn #1c1c1e (selector chỉ là :root[data-td-theme])
<div style="--td-color-text:#fff;     → div thấy #fff, nhưng .td-table__cell vẫn rgb(28,28,30),
     --td-color-surface:#000;            ô nhập vẫn rgb(255,255,255), badge vẫn rgb(240,240,242)
     --td-control-bg:#000">
```

Tức là **"thẻ tối trong trang sáng" hiện không làm được bằng token gốc**; site phải ghi đè từng token con. Thêm vào đó
14 module portal ra `<body>` (dropdown, chip-input, tree-select, menu, hovercard, tooltip, toast, modal, drawer, loading,
lightbox, media-picker…) nên kể cả khi sửa selector, popup mở từ vùng tối vẫn ra theme của `<html>`.

Light **không** khai báo `color-scheme: light`, và không có `color-scheme` theo vùng → ô native (`<input type=date>`,
scrollbar, `<select>`) không theo vùng tối.

---

## 2. Audit đo được (demo, 4 theme)

Số phần tử có chữ dưới ngưỡng (4.5:1 thường, 3:1 chữ lớn, 2.2:1 disabled), ở 1280:

| Theme | Chữ dưới ngưỡng | "Đảo trắng" (nền đục sáng hơn surface rõ rệt) |
|---|---|---|
| light | 0 (1 kết quả giả do parser `color(srgb…)` của badge accent) | 0 |
| dark | 0 (như trên) | — (nút/badge sáng hơn nền là đúng thiết kế) |
| beige | **33** | **31** ô nhập trắng (Δ1.15 so với surface) |
| navy | **466** | **85** (ô nhập, nút pastel, alert, badge, skeleton, switch off — đều sáng choang) |

### 2.1 Dark (`data-td-theme="dark"`) — dùng được, cần tinh chỉnh

Không có chữ nào dưới ngưỡng — phần token ngữ nghĩa làm tốt. Vấn đề thị giác (xem `montage/1280-*.png`, `ov-*.png`):

- **Checkbox chưa chọn gần như biến mất**: viền `--td-control-border-soft #3a3a3c` trên `#1c1c1e` = 1.50:1 (cùng tỉ
  lệ với light 1.52:1 theo lựa chọn của owner, nhưng trên nền tối mắt thấy kém hơn rõ — APCA sẽ bắt lỗi này, WCAG 2
  thì không). Tương tự viền ô nhập, viền thẻ media-field, ô alt.
- **Phân tầng bề mặt quá phẳng**: surface `#1c1c1e` vs bg `#111113` = 1.11:1, `--td-color-border #2c2c30` vs
  surface = 1.22:1. Thẻ/section chỉ tách nhau bằng một đường gần như vô hình. Switch off `#2c2c30` vs surface 1.22:1.
- **Bóng đổ vô hiệu**: `--td-shadow-1..3` không có giá trị dark; `--td-glass-shadow` đã ×2 nhưng popup/modal tối vẫn
  dựa vào viền 10 % trắng. Modal dark trên scrim 60 % đen: viền khung rất mờ.
- **Tooltip** đen trên trang đen (1.06:1), chỉ còn viền 12 %.
- **Scroll-top** tối trên nền tối, viền khó thấy (`montage/390-38.png`).
- **Skeleton** ổn (đo pair ≥ gate), shimmer 8 % trắng nhẹ, chấp nhận được.
- **Ảnh/media**: không có giảm sáng ảnh trong dark (không bắt buộc; ảnh trắng nền chói). Lightbox luôn tối — đúng.
- **Code block / `.demo-output`**: theo `--td-color-surface-muted`, đọc được.
- Native: `color-scheme: dark` đã đặt → scrollbar, `<input type=date>` tối theo. Đúng.
- Trạng thái thiết kế: header của file vẫn ghi **EXPERIMENTAL**, roadmap ghi "chưa render thử". Đợt này đã render: cần
  tinh chỉnh border/elevation, chưa cần đập lại.

### 2.2 Beige (135 hôm nay) — "đảo trắng" + chữ muted sát ngưỡng

- **Đảo trắng**: mọi ô nhập, dropdown trigger, dtp, number, OTP, chip-input, tree-select, dropzone, nút tỉ lệ của
  cropper vẫn `#fff` trên `#f5efe3` (`montage/1280-04.png`, `-06`, `-11`, `-35`). Popup dropdown, modal, datetime
  picker, scroll-top cũng trắng (`ov-dropdown`, `ov-modal`, `ov-dtp`). Lưu ý: owner nói 135 *muốn* bảng/menu trắng —
  vấn đề không phải "trắng là sai" mà là **site không chọn được**: ô nhập/popup trắng bất kể, còn bảng lại theo surface
  be (`montage/1280-28.png`: bảng be, không trắng).
- **Chữ muted 4.13–4.22:1** (dưới 4.5) ở tabs label, `th` của bảng, nhãn sort, prompt/tỉ lệ của media-field:
  `--td-color-text-muted #6b6b73` (xám lạnh) đặt trên `surface-muted #ece5d8`. Trên trắng là 5.3:1; kit giả định nền
  trắng khi chọn ink. `--td-color-text-subtle` trên be = 2.99:1.
- **Viền control mềm** `#d1d1d6` trên be = 1.33:1 (trên trắng 1.52) — ô nhập trắng-viền-xám trên nền be trông như
  "dán đè".
- **Lệch tông**: ramp xám lạnh (placeholder, label gray-700, slider track, badge neutral, secondary button) trên giấy
  ấm.
- **Skeleton** `#f0f0f2` sáng hơn nền be → khối trống trông như lỗ trắng; sheen 60 % trắng làm vệt chói
  (`montage/1280-22.png`).
- Pastel (alert, toast, nút ngữ nghĩa) ổn trên be.

### 2.3 Navy (màu riêng tối, không bật dark) — vỡ hoàn toàn

Đây là minh hoạ trực tiếp cho yêu cầu "tự tính chữ": kit **không suy ra gì từ surface**.

- Chữ chính `#1c1c1e` trên `#1e2d48` = **1.23:1** (heading, label checkbox/switch/tree, ô bảng, pagination, tiêu đề
  empty state…); label field 1.45:1; muted 2.61:1. 466 phần tử.
- Ô nhập, nút pastel, alert, badge, skeleton, switch off, checkbox chưa chọn đều thành **mảng trắng/pastel chói**
  (`montage/1280-01.png`, `-03`, `-22`, `-23`). Nút primary đen gần chìm vào nền navy.
- Popup/modal trắng (đọc được bên trong, nhưng là "đảo").

### 2.4 Theo hạng mục được yêu cầu

| Hạng mục | Light | Dark | Beige | Navy |
|---|---|---|---|---|
| Đảo trắng | — | — | ô nhập, popup, modal, dtp, scroll-top | mọi control, pastel, alert, badge |
| Chữ khó đọc | — | — | muted 4.1–4.2, subtle 3.0 | text 1.23, muted 2.6 |
| Viền biến mất | viền mềm 1.52 (chủ ý) | checkbox/ô nhập 1.50, border 1.22 | 1.33 | viền tối trên tối |
| Focus ring | ổn | ổn (ring 45 %, field focus 5.4:1) | ổn | ổn (accent) |
| Bóng | ổn | gần vô hình (shadow-1..3 không có dark) | ổn | vô hình |
| Ảnh/media | — | không dim (tuỳ chọn) | — | — |
| Code block | ổn | ổn | ổn (be) | chữ tối trên navy |
| Skeleton shimmer | ổn | ổn | khối sáng hơn nền | khối trắng |
| Overlay/backdrop | ổn | scrim 60 % ổn, khung modal mờ | ổn | ổn |
| Scrollbar / control native | `color-scheme` không khai báo | `dark` đúng | — | sáng (không có `color-scheme`) |
| SVG icon `currentColor` | ổn | ổn | ổn | theo chữ → cùng 1.23:1 |
| Chart | n/a | n/a | n/a | n/a |

### 2.5 Lỗ hổng của contrast gate hiện có

`test/tokens/contrast.spec.mjs` + `contrast-page.js` rất tốt cho thứ nó đo (pixel thật, 3 engine, light/dark × 4
backdrop), nhưng:

1. Chỉ đo **giá trị mặc định** của kit. Không có ca "site đổi surface" → beige/navy ở trên lọt hoàn toàn.
2. "Trang" của dark là `#000` thuần, light là `#fff` thuần — không phải `--td-color-bg`/`--td-color-surface` thật.
3. Phủ button, toast, alert, badge, tooltip, focus border, media, OTP/copy/skeleton… nhưng **không** phủ chữ thường
   của bảng, tabs, label field, placeholder, muted/subtle, pagination text — đúng nhóm đang trượt ở beige.
4. Không có kiểm non-text "bề mặt vs nền" (elevation) cho dark.

---

## 3. Phương án

### 3.1 Sàn trình duyệt (hợp đồng đã công bố)

`docs/getting-started/requirements.md`: **Chrome/Edge 102+, Firefox 112+, Safari 16.4+** (do `inert`, ElementInternals).
Tính năng màu (theo hiểu biết đến 2026; **cần kiểm lại caniuse trước khi chốt plan**):

| Tính năng | Chrome/Edge | Firefox | Safari | Có trên sàn? |
|---|---|---|---|---|
| `color-mix()` | 111 | 113 | 16.2 | **Không** (thiếu Chrome 102–110, FF 112) — kit đã bọc `@supports` |
| `oklch()` | 111 | 113 | 15.4 | Không |
| Relative colour syntax `oklch(from var(--x) l c h)` | 119 (đủ ~122) | 128 | 16.4 một phần, 18 đầy đủ | Không |
| `light-dark()` | 123 | 120 | 17.5 | Không |
| `contrast-color()` (tên mới của `color-contrast()`, chỉ trả đen/trắng) | chưa ổn định | ~146 | 26 | Không |
| `@property` | 85 | 128 | 16.4 | Không (FF) |
| Container style query `@container style(--x: …)` | 111 | chưa | 18 | Không |
| `@scope` | 118 | ~146 | 17.4 | Không |

Kết luận: **không có cách CSS-thuần nào tính "chữ đủ tương phản trên nền bất kỳ" chạy được trên sàn.** Ngay cả trên
trình duyệt mới, CSS chỉ có thể *xấp xỉ*: mẹo ngưỡng `oklch(from var(--bg) clamp(0, (0.62 - l) * 999, 1) 0 0)`
chọn đen/trắng theo L của OKLCH, không phải theo tỉ lệ WCAG, và không làm được "muted đúng 4.7:1" (cần tìm kiếm lặp).
`contrast-color()` chỉ trả đen/trắng. CSS mới phù hợp làm **tầng tăng cường**, không phải nguồn sự thật.

### 3.2 Bốn phương án

| | A. CSS-only | B. JS generator (CSSOM) | C. PHP generator (CSS tĩnh) | D. Hybrid: một thuật toán, hai đầu ra |
|---|---|---|---|---|
| Cách | `color-mix`/RCS suy ra từ `--td-surface` | `TdTheme.apply(el, {surface, accent, bg})` tính palette, ghi `el.style.setProperty('--td-…')` | `td_theme_css([...])` sinh file `.css` (hoặc `<style nonce>`) | Thuật toán JS thuần (không DOM) + build script xuất bảng token; PHP port (hoặc gọi file JSON sinh sẵn) |
| Chạy trên sàn | Không (chỉ ≥ Chrome 119/FF 128/Safari 18) | Có | Có | Có |
| Đúng WCAG thật | Không (xấp xỉ L) | Có | Có | Có |
| FOUC | Không | **Có** nếu chạy sau first paint (module defer) | Không | Không với PHP/precompute; JS chỉ cho runtime |
| CSP | Sạch | Sạch (CSSOM được phép — đã đo) | File ngoài sạch; inline cần nonce | Sạch |
| Theme theo vùng | Có nếu sửa selector | Có (scope = element) | Có (selector lớp) | Có |
| Màu động (user chọn màu) | Có | Có | Không (cần reload) | Có (JS) |
| Chi phí | Thấp nhưng không đạt mục tiêu | Trung bình | Trung bình (port thuật toán sang PHP = 2 bản phải giữ đồng bộ) | Trung bình+, nhưng một nguồn sự thật |

**Phản biện thẳng:** port thuật toán sang PHP là cái bẫy bảo trì (solo dev, hai ngôn ngữ, phải giữ kết quả giống từng
byte). Cách rẻ hơn cho 135: **bảng màu của site là hằng số** → chạy generator lúc build/dev (`npx td-theme
--surface '#ece5d8' --accent '#b3261e' > site-theme.css`) rồi `<link>` file đó. Không cần PHP biết thuật toán. JS
runtime chỉ cần khi màu thật sự động (người dùng chọn màu, preview theme trong admin).

### 3.3 Thuật toán tương phản

- **Gate = WCAG 2.x relative luminance** (giữ, vì là chuẩn pháp lý/AA, và gate hiện có dùng nó). Ngưỡng nội bộ như
  hiện tại: chữ 4.7, icon 3.2, non-text 3.0, disabled 2.2.
- **APCA làm cảnh báo phụ**, không làm gate: WCAG 2 chấm sai ở hai đầu — đánh giá quá cao chữ xám trên nền tối (vd.
  viền 1.50:1 "như nhau" ở light/dark nhưng dark trông mất hẳn) và chữ trắng trên màu trung tính. Báo cáo Lc cạnh ratio
  giúp tinh chỉnh dark; WCAG 3 chưa chốt nên không ràng buộc.
- **Không gian điều chỉnh = OKLCH**: giữ hue (và giảm chroma nhẹ) của surface, chỉ dò L bằng chia đôi (24 vòng) đến khi
  đạt ngưỡng. Mực "nhuốm màu giấy" (chroma ~0.012) sửa luôn lỗi lệch tông xám lạnh trên nền ấm.
- Chọn cực: so tỉ lệ với đen vs trắng → `scheme: light|dark` (cũng dùng để đặt `color-scheme`).

**Prototype + fuzz** (`scratchpad/palette-proto.mjs`, 20 000 surface ngẫu nhiên):

| Surface | text | text-muted | text-subtle | border | border-strong | accent dạng chữ |
|---|---|---|---|---|---|---|
| 135 be `#ece5d8` | `#4e4a44` 7.0 | `#67645d` 4.71 | `#827e77` 3.22 | `#cbc6bf` 1.36 | `#87837c` 3.01 | `#1f5ce4` 4.52 |
| navy `#1e2d48` | `#b5b9c1` 7.0 | `#93979f` 4.70 | `#767b82` 3.23 | `#3e4248` 1.36 | `#71767d` 3.01 | `#5093ff` 4.57 |
| kit dark `#1c1c1e` | `#a5a6ae` 7.0 | `#86868e` 4.71 | `#6b6b72` 3.22 | `#333339` 1.36 | `#67676e` 3.03 | `#3d7dff` 4.52 |

Phát hiện từ fuzz (quan trọng cho thiết kế API):

- **39 % nền ngẫu nhiên không thể có chữ 7:1**; với xám, dải luminance 0.10–0.30 (≈ `#595959`–`#939393`) không đạt
  7:1 bằng bất kỳ màu nào. **3 %** không đạt nổi 4.7:1 cho muted (dải ≈ 0.175–0.184). 8 % accent không kéo lên 4.5:1
  được nếu giữ chroma (phải giảm chroma hoặc đổi cực).
  → Generator **phải** có chính sách cho nền tầm trung: (a) đẩy surface ra khỏi vùng chết và báo, hoặc (b) hạ bậc
  (text = muted = cực đen/trắng) và báo cảnh báo, không im lặng.
- "Đạt đúng ngưỡng" không phải "đẹp": text ở đúng 7:1 trên dark ra `#a5a6ae` — quá xám cho chữ chính. Chữ chính nên
  lấy **gần cực** (L 0.97/0.18 nhuốm hue), muted ~4.7–5.5, subtle ≥ 3.2 (chỉ chữ phụ không thiết yếu). Phải giữ thứ bậc
  text > muted > subtle (prototype lộ một ca đảo khi rơi về fallback).

### 3.4 Token dẫn xuất cần có

Đầu vào tối thiểu site cung cấp: `bg` (trang), `surface` (thẻ/bảng/menu), tuỳ chọn `surface-control` (ô nhập), `accent`.
Mọi thứ khác suy ra:

| Nhóm | Token (đã có tên → giữ) | Quy tắc |
|---|---|---|
| Bề mặt | `--td-color-bg`, `--td-color-surface`, `--td-color-surface-muted`, **mới** `--td-color-surface-raised` (popup/modal), `--td-control-bg` (= surface-control ?? raised), `--td-glass-solid` (= raised), `--td-glass-bg(-strong)` (= raised + alpha) | dark: raised sáng hơn (+0.05 L); light: raised sáng hơn hoặc trắng; muted lệch −0.025 L |
| Chữ | `--td-color-text` (gần cực), `-muted` (≥ 4.7 trên **surface-muted**, nền khó nhất), `-subtle` (≥ 3.2), `--td-field-label`, `--td-field-placeholder` (≥ 4.5 trên control-bg) | đo trên nền **tệ nhất** nó có thể nằm (surface, surface-muted, control-bg) |
| Viền | `--td-color-border` (~1.35 trang trí), `--td-color-border-strong` / `--td-control-border-strong` (≥ 3), `--td-control-border-soft/-hover` (giữ lựa chọn owner 1.5 / 2.2, nhưng dark nên nâng — xem 2.1) | |
| Tương tác | `--td-color-hover(-strong)` = mực ở alpha 5/8 % (đổi cực theo scheme), `--td-focus`, `--td-focus-ring`, `--td-field-focus` (≥ 3 vs control-bg **và** bg) | |
| Accent | `--td-accent` (chữ/viền, ≥ 4.5 trên surface), `--td-accent-fill` (nền đặc), `--td-accent-contrast` (đen/trắng tốt hơn trên fill, ≥ 4.5) | |
| Overlay | `--td-color-overlay`, `--td-glass-shadow(-lg)`, `--td-shadow-1..3`, `--td-btn-lift` | dark: alpha cao hơn + có thể thêm viền sáng nhẹ |
| Skeleton | `--td-color-skeleton` (= mực 6–8 % trên surface, **tối hơn** surface ở light), `--td-color-sheen` | |
| Ngữ nghĩa | `--td-color-{success,warning,error,info}` (≥ 4.5 làm chữ trên surface), `--td-color-on-status`, `--td-pastel-{v}-bg/-border/-fg` (= màu ngữ nghĩa ~12–18 % trộn **vào surface**, ink ≥ 4.7 trên fill) | thay 24 hex cặp đôi bằng một quy tắc |
| Nút | `--td-btn-primary-bg/-fg/-hover` (primary "đen" = mực text, dark đảo), `--td-btn-secondary-*`, `--td-btn-disabled-*` (≥ 2.2) | |
| Component | `--td-chip-bg`, `--td-tooltip-bg/-border`, `--td-badge-*`, `--td-alert-*`, `--td-slider-track`, `--td-switch-off` | quy về các token trên, bỏ literal |

### 3.5 Chiến lược dark mode

| Lựa chọn | Ưu | Nhược |
|---|---|---|
| Chỉ attribute (hiện tại) | Site light-only không bao giờ bị lật | Site phải tự viết script theo OS |
| Tự theo `prefers-color-scheme` | Không cần code | **Phá vỡ** cam kết hiện tại (135, dwp sẽ tự lật) |
| **Cả hai, site kiểm soát** (đề xuất) | `data-td-theme="light|dark|auto"`; không đặt = light như cũ (tương thích ngược); `auto` dùng `@media (prefers-color-scheme: dark) { :root[data-td-theme="auto"] {…} }` — CSS thuần, **không FOUC**, không JS | Phải nhân đôi khối dark (dưới attribute và dưới media) → sinh bằng `build-css.mjs` từ một nguồn, không viết tay |

- FOUC: attribute phải có trong HTML server render (PHP in `data-td-theme` theo cookie người dùng). Nếu chọn theme bằng
  JS phía client: script **đồng bộ, không module, đặt trong `<head>`** (CSP: file ngoài `'self'` hoặc nonce) — module
  `defer` sẽ chớp trắng. Lưu lựa chọn người dùng: cookie (để PHP đọc được) thay vì chỉ `localStorage`.
- `color-scheme`: khai báo `light` cho light, `dark` cho dark, và **theo vùng** (`[data-td-theme] { color-scheme: … }`);
  thêm `<meta name="color-scheme">` khuyến nghị trong docs để thanh cuộn/autofill đúng trước khi CSS tải.

### 3.6 Theme theo vùng (thẻ tối trong trang sáng)

Hai thay đổi cần thiết, cả hai là **thay đổi kiến trúc** → cần ADR:

1. **Khai báo token dẫn xuất trên "theme scope", không chỉ `:root`**: đổi selector khối token thành
   `:root, [data-td-theme]` (và khối dark thành `[data-td-theme="dark"]`, giữ `:root[data-td-theme="dark"]` cho
   specificity tương thích). Khi đó `--td-table-fg: var(--td-color-text)` được giải lại ở mỗi phần tử có
   `data-td-theme` → "thẻ tối" hoạt động bằng token gốc. Chi phí: ~45 khối `:root` trong 30 file; số custom property
   tính lại chỉ ở các phần tử scope (rẻ). Rủi ro: site đang ghi đè token con trên `:root` (unlayered) vẫn thắng trên
   `:root` nhưng **không** thắng trong scope (scope khai báo lại trong layer, unlayered `:root` chỉ là kế thừa) — đúng
   hành vi mong muốn, nhưng phải ghi vào upgrade note.
2. **Portal mang theo scope**: khi một popup được đưa ra `<body>`, copy `data-td-theme` (và các custom property theme
   đã sinh, nếu dùng JS generator) từ `closest('[data-td-theme]')` của trigger sang root popup. Một helper chung trong
   `utils/layers.js` cho 14 module.

### 3.7 Tương thích ngược với override hiện có của site

- Không đặt gì → render **giống từng pixel** v0.35 (gate CSP parity + contrast phải xanh không đổi baseline).
- Site đang ghi đè token (unlayered `:root`) vẫn thắng: generator ghi vào **layer `td.tokens`** (file sinh ra bọc
  `@layer td.tokens { … }`), hoặc ghi CSSOM inline trên element scope — lưu ý **inline style thắng cả unlayered
  `:root`**, nên JS generator phải bỏ qua token mà site đã đặt tường minh, hoặc ghi lên một `adoptedStyleSheets` trong
  layer (`@layer td.tokens` trong constructable sheet — CSP cho phép, đã đo ở security-model §3).
- Token deprecated giữ nguyên. Hex cặp đôi trong alert/badge/pastel thay bằng quy tắc → giá trị light/dark mặc định
  phải **khóa bằng test** = giá trị cũ (hoặc chấp nhận lệch có chủ đích + recapture baseline + ghi CHANGELOG).
- Docs "bẫy số 2" và "Theme theo vùng: hai giới hạn" sẽ đổi — cập nhật `docs/customization/theming.md`.

### 3.8 Kiểm thử

1. **Mở rộng contrast gate theo palette**: thêm chiều `palette` = {kit light, kit dark, be 135, navy, teal thương hiệu,
   xám tầm trung `#808080`} × engine; "trang" = `--td-color-bg`/`surface` thật thay vì `#000`/`#fff`.
2. **Gate chữ toàn trang** (như script audit ở đây, chạy trên `demo.html` hoặc trang fixture): mọi phần tử có chữ ≥ 4.5
   (disabled ≥ 2.2), mọi control có viền strong ≥ 3 vs nền — chạy với từng palette. Bắt đúng nhóm beige đang trượt.
3. **Fuzz unit test (node --test, không cần browser)**: 10 000 surface/accent ngẫu nhiên có seed → assert mọi token
   dẫn xuất đạt ngưỡng **hoặc** generator trả cảnh báo tường minh cho dải chết; assert thứ bậc text > muted > subtle;
   assert idempotent và tất định (JS = file sinh sẵn).
4. **Kiểm island**: phần tử đục sáng hơn surface > Δ1.12 mà không phải "raised" có chủ đích → fail.
5. **Theme scope**: thẻ `data-td-theme="dark"` trong trang light — bảng, ô nhập, badge, popup portal mở từ trong thẻ
   đều theo dark.
6. **No-FOUC**: Playwright chụp frame đầu (trước khi module tải) với `data-td-theme` server-render và `auto`.
7. Chạy lại CSP gate (CSSOM/adopted sheet dưới nonce-only, 3 engine).

---

## 4. Đề xuất

Làm theo **D (hybrid, một thuật toán)** chia ba bước, không gộp một release: **(1)** sửa nền móng không cần generator —
token gốc suy ra từ surface (`--td-control-bg`, `--td-glass-solid`, skeleton, hover, chip, pastel/alert/badge theo quy
tắc), tooltip/border/elevation dark, `color-scheme` cả light, `data-td-theme="auto"` bằng CSS thuần, và **theme scope
`:root, [data-td-theme]` + portal mang scope** (ADR mới); kèm gate chữ toàn trang với palette be/navy — riêng bước này
đã giải phần lớn "đảo trắng" của 135 (site đặt `surface-control: #fff` nếu muốn ô nhập/menu trắng). **(2)** Module
`src/theme/palette.js` thuần (không DOM; OKLCH dò L, WCAG gate, APCA chỉ báo cáo; gom 4 bản sao contrast hiện có) +
CLI `td-theme` sinh file CSS bọc `@layer td.tokens` cho site PHP (135 dùng file tĩnh, không FOUC, không port PHP).
**(3)** `TdTheme.apply(el, …)` runtime chỉ khi có nhu cầu màu động thật. CSS mới (RCS, `contrast-color()`) chỉ cân
nhắc khi sàn trình duyệt nâng lên ≥ Chrome 119 / Firefox 128 / Safari 18 — hiện tại không dựa vào được. Tránh: tự lật
theo OS mặc định (phá 135/dwp), port thuật toán sang PHP, và hứa "mọi màu đều ra 7:1" (về toán học là không thể với nền
tầm trung — API phải nói rõ và cảnh báo).

### Câu hỏi mở cho owner

1. Dark mặc định: giữ "không đặt = light" (đề xuất) hay cho phép site bật `auto` toàn cục qua một token/attribute?
   Nút chuyển theme cho **người dùng cuối** là việc của kit (component `td-theme-toggle`) hay của site?
2. 135: ô nhập và popup muốn **trắng** (như bảng/menu) hay **theo giấy be**? Bảng hiện tại theo surface (be) — có muốn
   bảng trắng còn thẻ be không? (Quyết định số lượng "tầng" surface: bg / surface / control / raised.)
3. Viền control mềm 1.5:1 (lựa chọn v0.14.1) có giữ ở dark không? Đề xuất nâng dark lên ~2:1 vì checkbox chưa chọn
   gần như biến mất.
4. Với nền "vùng chết" (xám tầm trung) generator nên: tự đẩy surface đi (đổi màu site chọn), hay giữ màu và hạ chuẩn
   kèm cảnh báo console/CLI?
5. Pastel/alert/badge: chấp nhận màu mặc định **đổi nhẹ** (sinh theo quy tắc, có thể lệch vài đơn vị hex so với bây
   giờ, cần recapture baseline) hay bắt buộc giữ y hex cũ cho light/dark?
6. Có cần theme theo vùng **ngay** (thẻ tối trong trang sáng) ở 135/dwp, hay để sau bước 1?
7. Có chấp nhận nâng sàn trình duyệt (vd. Chrome 111 / Firefox 113 / Safari 16.4 để có `color-mix` + `oklch` không
   cần fallback) trong bản theming này không? Nâng sàn giúp bước 1 gọn hơn nhiều.
8. Ảnh trong dark: có muốn tự giảm sáng (`filter: brightness(.9)`) ảnh nội dung không, hay để nguyên?
