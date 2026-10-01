[Tài liệu](../README.md) › Tuỳ biến › Styling (CSS của site)

# Styling: viết CSS của site cho td-components

[theming.md](theming.md) nói về **token** (đổi màu, cỡ, bề mặt nổi cho cả site). Trang này nói về phần còn lại: khi token
không đủ và bạn cần viết selector CSS chạm vào component. Bạn sẽ biết thứ tự cascade layer, class nào là "hợp đồng"
ổn định để nhắm vào, trạng thái được thể hiện bằng attribute nào, cách đặt giá trị riêng cho một phần tử mà không dùng
`style="…"`, và những override nào an toàn / dễ vỡ.

## Mục lục

- [Không có Shadow DOM: CSS của bạn chạm được mọi thứ](#không-có-shadow-dom-css-của-bạn-chạm-được-mọi-thứ)
- [Thứ tự cascade layer](#thứ-tự-cascade-layer)
- [Hợp đồng class BEM](#hợp-đồng-class-bem)
- [Trạng thái bằng attribute, không bằng class](#trạng-thái-bằng-attribute-không-bằng-class)
- [Giá trị per-instance bằng CSSOM (không `style=""`)](#giá-trị-per-instance-bằng-cssom-không-style)
- [Nhắm một instance duy nhất](#nhắm-một-instance-duy-nhất)
- [Override an toàn và override dễ vỡ](#override-an-toàn-và-override-dễ-vỡ)
- [Font](#font)
- [Dùng lại công thức bề mặt cho phần tử của site](#dùng-lại-công-thức-bề-mặt-cho-phần-tử-của-site)
- [Sống chung với CSS sẵn có của site (kể cả Tailwind)](#sống-chung-với-css-sẵn-có-của-site-kể-cả-tailwind)

## Không có Shadow DOM: CSS của bạn chạm được mọi thứ

Mọi component render vào **light DOM** (DOM thường của trang), không dùng Shadow DOM. Hệ quả:

- Selector của site (`.cta .td-btn`, `#checkout td-dropdown .td-dropdown__trigger`) chạm được phần tử bên trong.
- Token `--td-*` kế thừa bình thường theo cây DOM.
- **Ngược lại**, CSS toàn cục của site cũng chạm vào component. Rule quá rộng như `button { border-radius: 0 }`,
  `input { height: 40px }` hay `* { box-sizing: content-box }` có thể làm hỏng kit. `td.css` không reset gì, nhưng nó
  cũng không tự vệ trước reset của bạn. Nếu site có rule gốc kiểu đó, hãy giới hạn phạm vi (ví dụ
  `:where(.content) button { … }`) hoặc để CSS của kit thắng bằng cách để rule reset của site trong một layer.

Component render bằng `innerHTML` (một lần khi gắn vào trang, và lại khi một attribute được theo dõi thay đổi). Bất kỳ
class / attribute nào **bạn thêm bằng JS vào phần tử bên trong** sẽ **mất** ở lần render sau. Muốn đánh dấu, hãy đặt
class trên **thẻ host** (`<td-button class="cta">`) — host không bị render lại — rồi nhắm con qua host.

## Thứ tự cascade layer

`td.css` bắt đầu bằng:

```css
@layer td.tokens, td.component, td.utilities;
```

Trình duyệt quyết định rule nào thắng theo thứ tự ưu tiên sau (cho khai báo bình thường, không `!important`):

| Ưu tiên (thấp → cao) | Nguồn |
|---|---|
| 1 | Layer khai báo **trước** (ví dụ layer của site nếu nó được khai báo trước `td`) |
| 2 | `td.tokens` |
| 3 | `td.component` |
| 4 | `td.utilities` |
| 5 | Layer khai báo **sau** `td` |
| 6 | **CSS không layer** (CSS "thường" của site) |
| 7 | `style` inline trên phần tử (kể cả do CSSOM `el.style.setProperty` đặt) |

Trong cùng một mức, specificity rồi thứ tự xuất hiện mới được xét. Điểm mấu chốt: **rule không layer của bạn thắng
mọi rule của kit, dù specificity thấp hơn.** Ví dụ rule `.td-btn { … }` (một class) của bạn thắng
`.td-btn--secondary:not(.td-btn--custom)` (specificity hai class) trong `td.component`.

Với `!important` thì thứ tự **đảo ngược**: layer càng sớm càng mạnh, và `!important` trong layer thắng `!important`
không layer. Kit dùng điều này có chủ đích: các fallback trợ năng (giảm trong suốt, tương phản cao, forced colors) gán
biến private `--_td-*` bằng `!important` trong `td.tokens` (layer đầu tiên) để **không** site nào phá được. Vì vậy
đừng cố "thắng" bằng `!important`: vừa không cần (rule thường không layer đã thắng), vừa không thắng được fallback.

### Nếu site dùng `@layer`

Layer được xếp theo **lần đầu** trình duyệt gặp tên. Nếu CSS của site có layer và được nạp trước `td.css`, layer của
site đứng **trước** `td` và thua. Cách xử lý: đặt câu khai báo thứ tự ở đầu file CSS nạp sớm nhất:

```css
@layer td, site;   /* khai báo "td" trước để mọi layer td.* nằm trong nó, "site" đứng sau → thắng */
```

Hoặc đơn giản: để phần override kit **không layer**.

## Hợp đồng class BEM

Class của kit theo quy ước BEM của kit 135: `.td-{block}__{element}--{modifier}`.

- Block: `.td-btn`, `.td-field`, `.td-dropdown`, `.td-modal`, `.td-toast`, `.td-menu`, `.td-table`…
- Element: `.td-btn__label`, `.td-modal__dialog`, `.td-dropdown__option`…
- Modifier: `.td-btn--primary`, `.td-btn--sm`, `.td-modal--lg`, `.td-toast--error`…

Cấu trúc DOM + class của từng component là **markup contract**: ghi trong mục "Cấu trúc DOM & class" của trang
component. Markup render phía server chính thức là [adapter PHP](../guides/php-adapter.md) `php/td.php` ship kèm gói
(`td_button`, `td_link`, `td_field`, `td_dropdown`, `td_toggle`, `td_checkbox`, `td_icon`); component không có helper PHP
thì dùng markup ghi ngay trong trang của nó. Trong repo kit, contract được khoá bằng test: fixture `test/contracts/*.html`
(bản HTML component render ra, so với component thật trong `td-contracts.browser-test.js`) — fixture chỉ để test, không
nằm trong gói npm và icon trong đó viết tắt, đừng copy từ đó. Vì vậy:

- Class / element có trong contract là **ổn định**: đổi chúng là thay đổi phá vỡ và sẽ được ghi trong
  [breaking-changes.md](../upgrading/breaking-changes.md).
- Chi tiết **không** có trong contract (thứ tự thuộc tính CSS bên trong, custom property private `--_td-*`, id tự sinh
  kiểu `td-menu-3`) có thể đổi bất kỳ lúc nào.
- Class legacy (Tailwind / DCMS cũ) đã bỏ từ 0.10–0.11, **không** có alias. Bảng đổi tên: [class-map.md](../upgrading/class-map.md).

Ví dụ nhắm theo contract:

```css
/* Nhãn của mọi nút trong thanh công cụ admin in đậm hơn */
.admin-toolbar .td-btn__label { font-weight: var(--td-fw-bold); }

/* Option đang được chọn trong mọi dropdown: chữ đậm */
.td-dropdown__option[aria-selected="true"] { font-weight: var(--td-fw-semibold); }
```

## Trạng thái bằng attribute, không bằng class

JS của kit **không** bật tắt class để hiển thị trạng thái. Trạng thái nằm ở attribute chuẩn (`aria-*`, `hidden`,
`:checked`, `:disabled`) hoặc `data-*`. Hãy style theo đúng các attribute đó:

| Attribute | Ý nghĩa | Ví dụ ở đâu |
|---|---|---|
| `[hidden]` | Ẩn (nút, ghi chú, footer, menu đóng) | `.td-btn[hidden]`, `.td-dropdown__menu[hidden]` |
| `[data-state="open"]` | Đang mở (sau frame vào) | `.td-modal`, `.td-lightbox`, `.td-tooltip`, `.td-menu`, `.td-loading` |
| `[data-state="opening"\|"closing"\|"entering"]` | Đang chuyển trạng thái | `.td-modal`, `.td-toast` |
| `[data-state="loading"\|"error"]` | Đang tải / lỗi | `.td-hovercard`, `.td-table` (`ready\|loading\|empty`) |
| `[data-state="limit"]` | Bộ đếm ký tự chạm giới hạn | bộ đếm của `.td-field` |
| `[data-placement="top\|bottom\|left\|right"]` | Phía đã chọn khi định vị | menu, dropdown, tooltip, hovercard |
| `[data-align="start\|center\|end"]` | Căn lề của menu | `.td-menu` |
| `[data-covered]` | Modal bị modal khác che (chuyển nền đặc) | `.td-modal` |
| `[data-paused]` | Toast đang tạm dừng đếm giờ | `.td-toast` |
| `[data-active]` | Option đang được điều hướng bàn phím | `.td-dropdown__option` |
| `[data-placeholder]` | Đang hiện placeholder, chưa có giá trị | `.td-dropdown__value`, `.td-dtp__value` |
| `[data-full]` / `[data-empty]` | Chip-input đầy / rỗng | `.td-chip-input` |
| `[data-kind="none\|loading\|error"]` | Loại thông báo trong popup gợi ý | `.td-chip-input__empty` |
| `[data-panel]`, `[data-zoomed]`, `[data-dragging]`, `[data-sheet="open"]` | Trạng thái lightbox | `.td-lightbox`, `.td-lightbox__panel` |
| `[data-custom]` | Tooltip màu tuỳ biến | `.td-tooltip` |
| `[aria-busy="true"]` | Đang bận (nút loading, bảng loading) | `.td-btn`, `.td-table__table` |
| `[aria-invalid="true"]` | Có lỗi | control của field / dropdown / datetime / chip-input |
| `[aria-expanded]`, `[aria-selected]`, `[aria-checked]`, `[aria-current="page"]`, `[aria-sort]` | Trạng thái ARIA chuẩn | trigger, option, item menu, trang hiện tại, cột sắp xếp |

```css
/* Toast lỗi đang tạm dừng: viền dày hơn để người dùng biết nó không tự tắt */
.td-toast--error[data-paused] { outline: 2px solid var(--td-color-error); }

/* Menu mở lên trên: bóng đổ hướng lên */
.td-menu[data-placement="top"] { box-shadow: var(--td-shadow-3); }
```

Danh sách đầy đủ cho từng component ở mục "Cấu trúc DOM & class" của trang component.

## Giá trị per-instance bằng CSSOM (không `style=""`)

Kit tuân thủ CSP nghiêm ngặt: không sinh `style="…"` trong HTML, không chèn `<style>`. Giá trị riêng cho **một**
phần tử (màu tuỳ biến, độ rộng, vị trí) được đặt bằng **CSSOM**:

```js
el.style.setProperty('--td-btn-bg', '#0f766e');
```

CSP `style-src` **không** chặn CSSOM (chỉ chặn attribute `style` trong markup và thẻ `<style>`), nên cách này luôn chạy.
Mọi ví dụ HTML trong tài liệu này cũng không dùng `style="…"`.

Component tự làm việc này cho các attribute sau (giá trị đã được kiểm bằng `safeColor` / `CSS.supports`):

| Attribute / option | Component đặt custom property | Trên phần tử |
|---|---|---|
| `color`, `text-color` | `--td-btn-bg`, `--td-btn-fg`, `--td-btn-hover` (+ class `.td-btn--custom`) | host `td-button` |
| `color` | `--td-checkbox-color` (checkbox) / `--td-switch-on` (toggle) | host |
| `color`, `track-color` | `--td-slider-color`, `--td-slider-track` | host `td-slider` |
| `active-color` | `--td-pagination-active`, `--td-pagination-active-fg` | host `td-pagination` |
| `data-tooltip-color`, `data-tooltip-text-color` | `--td-tooltip-bg`, `--td-tooltip-fg` | `#td-tooltip` |
| `TdModal.show({ width, height, bodyPadding, bodyOverflow })` | `--td-modal-w`, `--td-modal-h`, `--td-modal-body-pad`, `--td-modal-body-overflow` | `.td-modal__dialog` |
| `TdLoadingSpinner.create({ color, trackColor })` | `--td-spinner-color`, `--td-spinner-track` | `.td-spinner` |

Hai lưu ý quan trọng:

1. **Inline thắng mọi stylesheet.** Nếu một nút có `color="…"`, rule CSS của bạn đặt `--td-btn-bg` trên host đó sẽ
   thua giá trị inline. Muốn CSS của site quyết định, đừng dùng attribute màu trên phần tử đó.
2. **Component chỉ gỡ custom property do chính nó đặt** (0.16.0). td-button, td-checkbox, td-toggle, td-slider,
   td-pagination ghi nhớ các property ở bảng trên mà chúng đã đặt từ attribute; khi attribute vắng mặt chỉ những giá
   trị đó bị `removeProperty`. Biến site tự đặt inline trên host (`host.style.setProperty('--td-slider-color', …)`)
   được giữ qua mọi lần render lại. (Trước 0.16.0 nó bị xoá ở lần render kế tiếp.) Nếu **cả** site lẫn attribute cùng
   đặt một biến, attribute thắng, và khi attribute bị gỡ biến đó bị xoá luôn — đặt lại nếu cần.

```js
slider.style.setProperty('--td-slider-color', brand); // giữ nguyên khi slider render lại (0.16.0+)
slider.setAttribute('color', brand);                   // hoặc attribute của component (được kiểm tra an toàn)
slider.parentElement.style.setProperty('--td-slider-color', brand); // hoặc trên phần tử cha (token kế thừa xuống)
```

Khi viết component riêng, theo cùng quy tắc: giá trị động đi qua `_applyStyles()` + `this._setOwnedStyle(name, value)`
(đặt khi có giá trị, chỉ gỡ cái mình đã đặt), xem [extending.md](extending.md#tự-viết-component).

## Nhắm một instance duy nhất

**Component nằm tại chỗ** (button, field, checkbox, toggle, slider, dropdown trigger, datetime trigger, chip-input,
table, tabs, pagination, empty-state): đặt `id` hoặc class trên host.

```html
<td-button id="btn-publish" class="cta" variant="primary">Xuất bản</td-button>
```

```css
#btn-publish .td-btn { min-width: 12rem; }
.cta { --td-btn-radius: var(--td-radius-full); }   /* token trên host: kế thừa vào .td-btn bên trong */
```

**Phần tử được đưa ra `<body>`** (portal) không nằm dưới host, nên selector `#host .x` không chạm tới. Mỗi loại có cách
riêng:

| Phần tử portal | Cách nhắm |
|---|---|
| Menu của `td-dropdown` | `id="{host-id}-menu"`: `#country-menu` cho `<td-dropdown id="country">` |
| Popup gợi ý `td-chip-input` | `id="{host-id}-menu"` |
| `TdModal` | `TdModal.show()` trả về id của `.td-modal`; hoặc thêm class trong `onShow(root)` |
| `TdMenu` | `TdMenu.open()` trả về handle có `element` → `handle.element.classList.add('menu--post')` |
| Tooltip | Một phần tử duy nhất `#td-tooltip`; màu riêng bằng `data-tooltip-color` trên trigger |
| Hovercard | Một phần tử duy nhất `#td-hovercard`; đặt class lên node nội dung bạn trả về |
| Toast | `#td-toast-container .td-toast--{type}` (không có id từng toast) |
| Loading | `#td-loading` |
| Lightbox | `.td-lightbox` (chỉ có một) |

```js
import { TdModal } from '@dazzxq/td-components/modal';

TdModal.show({
  title: 'Chọn ảnh bìa',
  body: pickerNode,
  onShow: (root) => root.classList.add('modal--media'),   // root = .td-modal (portal trong <body>)
});
```

```css
.modal--media .td-modal__body { padding: 0; }
```

## Override an toàn và override dễ vỡ

| An toàn (ổn định qua các bản) | Dễ vỡ (có thể hỏng khi nâng cấp) |
|---|---|
| Ghi đè token public `--td-*` | Ghi đè token private `--_td-*` |
| Nhắm class / element trong markup contract | Nhắm theo cấu trúc (`> div:nth-child(2)`, `span + span`) |
| Nhắm trạng thái qua `aria-*` / `data-state` / `[hidden]` | Nhắm id tự sinh (`#td-menu-3`, `#…-opt-4`) |
| Class / id đặt trên host | Class thêm bằng JS vào phần tử bên trong (mất khi render lại) |
| Đặt màu qua attribute (`color`, `active-color`) | `host.style.setProperty(...)` cho property component tự quản |
| `data-td-glass="off"` (hoặc token `--td-glass-blur`) để bỏ blur | Tự viết `backdrop-filter: none` / `background` đặc lên `.td-glass-surface` (phá fallback tương phản) |
| Đổi `display` của host (`td-button { display: block }`) | Đổi `position` / `z-index` của lớp nổi (modal, menu, toast) — dùng bộ `--td-z-*` thay vào |

Một số điều **không nên** làm dù CSS cho phép:

- Đặt `opacity` lên nút / control để "làm mờ": kit dùng màu trạng thái đặc cho disabled; `opacity` làm tụt tương phản
  của chữ.
- Thêm `backdrop-filter` cho phần tử **nằm trong** bề mặt nổi (menu, modal) hoặc cho control: blur chỉ dành cho popup
  nhỏ, chồng blur vừa xấu vừa tốn GPU.
- Ẩn vòng focus (`outline: none` / `box-shadow: none` trên `:focus-visible`).

## Font

Kit không tải font nào. Mỗi khối gốc của component đặt `font-family: var(--td-font-sans)` (một số ghi chú lỗi đứng
ngoài khối gốc cũng đặt lại), nên font của `<body>` **không** tự áp vào kit. Để kit dùng font của site:

```css
:root {
  --td-font-sans: "Be Vietnam Pro", -apple-system, "Segoe UI", Roboto, sans-serif;
  --td-font-mono: "JetBrains Mono", ui-monospace, monospace;
}
```

Tự tải font như bình thường (`<link>` Google Fonts hoặc `@font-face` trong CSS của site). Với CSP, nhớ cho phép nguồn
font trong `font-src` (và `style-src` nếu dùng stylesheet của Google Fonts). Cỡ chữ đi qua `--td-text-*`, độ đậm qua
`--td-fw-*` (xem [theming.md › Chữ](theming.md#chữ)).

Nên giữ font có đủ dấu tiếng Việt (nhãn mặc định của kit là tiếng Việt).

## Dùng lại công thức bề mặt cho phần tử của site

Các class công thức bề mặt trong `td.css` là public (tên còn chữ `glass` vì là API cũ; từ 0.20.0 là **minimal
surfaces**: nền + viền mảnh + một shadow mềm, blur 12px nhẹ), dùng được cho phần tử nổi của site (thanh công cụ, dock):

| Class | Dùng khi |
|---|---|
| `.td-glass-surface` | Bề mặt nổi mặc định (nền 90 % + blur 12px) |
| `.td-glass-surface--strong` | Popup nhỏ có chữ (nền 94 %) |
| `.td-glass-surface--lg` | Bóng sâu hơn (`--td-glass-shadow-lg`) |
| `.td-glass-surface--clear` | Thanh tối trên ảnh / video (như lightbox) |
| `.td-glass-dim` / `.td-glass-dim--text` | Deprecated 0.20.0: không còn vẽ gì |
| `.td-glass-tint` | **Một** hành động chính trên thanh nổi (capsule đặc, cao ≥ `--td-touch-min`) |

```html
<nav class="site-dock td-glass-surface td-glass-surface--strong" aria-label="Công cụ">
  <td-button variant="secondary" icon="plus" aria-label="Thêm"></td-button>
  <a class="td-glass-tint" href="/new">Viết bài</a>
</nav>
```

- Không tự viết `backdrop-filter` / nền cho phần tử nổi: thêm class công thức, để kit lo fallback trợ năng.
- Button luôn là màu đặc, không blur (ở đâu cũng vậy).
- `--td-glass-wash` đã bỏ ở 0.20.0 (toast trung tính, màu trạng thái ở icon).
- Luật đầy đủ nằm trong tài liệu nội bộ `docs/internal/design/liquid-glass.md` ("Minimal surfaces"); tóm tắt: control
  đặc, blur chỉ cho popup nhỏ, không gradient / viền sáng / glow / scale trang trí.

## Sống chung với CSS sẵn có của site (kể cả Tailwind)

- `td.css` **không** reset / normalize (không đụng `body`, `button`, `*`). Có thể nạp cạnh CSS của dwp, 135 hay một
  site dùng Tailwind. Kit kiểm tra điều này bằng profile CSP `legacy+td` (Tailwind của host + `td.css`).
- Preflight của Tailwind (reset `button`, `img`, `border-style`) nằm trong `@layer base` của Tailwind. Nếu Tailwind được
  nạp trước `td.css`, layer của Tailwind đứng trước `td` → CSS của kit thắng reset của Tailwind (đúng ý). Nếu bạn cần
  một utility Tailwind thắng kit, dùng CSS không layer hoặc khai báo thứ tự layer như ở
  [trên](#nếu-site-dùng-layer).
- Đừng thêm class Tailwind vào phần tử **bên trong** component: chúng mất khi render lại (xem đầu trang). Đặt trên host.

## Xem thêm

- [theming.md](theming.md): danh mục token và chế độ dark / tắt kính.
- [hooks.md](hooks.md): tuỳ biến bằng JS.
- [../guides/csp.md](../guides/csp.md): cấu hình CSP cho site.
- [../concepts/how-it-works.md](../concepts/how-it-works.md): light DOM, lifecycle, lớp nổi.
- [../upgrading/class-map.md](../upgrading/class-map.md): bảng class cũ → mới.
