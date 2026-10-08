[Tài liệu](../README.md) › [Components](README.md) › Icons

# Icon — `tdIcon()` và `<td-icon>`

Mọi icon của kit được vẽ **theo tên** từ một registry duy nhất (hình học Lucide, tên do td đặt). Bạn gọi
`tdIcon('close')` để nhận về một phần tử SVG dựng sẵn, hoặc đặt thẻ `<td-icon name="close">` trong HTML. Site thêm icon
riêng bằng `registerIcons()` với **dữ liệu** (không phải chuỗi SVG). Không hardcode chuỗi SVG trong code site nữa;
cũng không dùng font icon (Font Awesome…) cho UI mới.

| | |
|---|---|
| Import | `import { tdIcon, registerIcons, hasIcon, listIcons, resolveIconName } from '@dazzxq/td-components/icons'` · façade: `import '@dazzxq/td-components/icon-element'` (class: `import { TdIconElement } from '@dazzxq/td-components/icon-element'`, hoặc từ entry gốc `@dazzxq/td-components` từ 0.16.0) · dữ liệu: `@dazzxq/td-components/icons.json` |
| Loại | API JS (hàm) + custom element tuỳ chọn `<td-icon>` |
| Form-associated | không |
| Từ phiên bản | 0.6.0 ([ADR 0010](../internal/decisions/0010-icon-registry.md)); alias từ 0.18.0 |

Module `./icons` **không có side effect** khi import (không định nghĩa element nào). Chỉ `./icon-element` mới định
nghĩa `<td-icon>` — và từ 0.16.0 entry gốc `@dazzxq/td-components` (barrel) cũng import nó, nên import barrel là có
`<td-icon>`. Từ 0.17.0 entry gốc cũng re-export `tdIcon`, `registerIcons`, `hasIcon`, `listIcons`, `fillIconSlots`
(`import { tdIcon } from '@dazzxq/td-components'`); `svgStringToDefinition` / `renderIconDefinition` vẫn chỉ có ở
`./icons`.

## Ví dụ nhanh

```js
import { tdIcon } from '@dazzxq/td-components/icons';

const btn = document.querySelector('#close-btn');     // <button aria-label="Đóng">
btn.appendChild(tdIcon('close'));                      // icon trang trí

const note = document.querySelector('#note');
note.prepend(tdIcon('info', { size: 'l', label: 'Thông tin' })); // icon có nghĩa → role="img"
```

```html
<script type="module">import '@dazzxq/td-components/icon-element';</script>

<td-icon name="download"></td-icon>
<td-icon name="warning" size="l" label="Cảnh báo"></td-icon>
<td-icon name="star" size="32"></td-icon>
```

## Danh sách icon core

71 icon (0.59.0: + `price`). Tên là tên **ngữ nghĩa** của td; cột phải là tên gốc bên Lucide. Bảng dưới là nhóm nền; các nhóm
thêm sau (nút thao tác, toggle, theme, kho / danh mục) liệt kê ở các đoạn tiếp theo — danh sách đầy đủ: `listIcons()`.

| Tên td | Lucide | | Tên td | Lucide |
|---|---|---|---|---|
| `close` | x | | `info` | info |
| `check` | check | | `success` | circle-check-big |
| `prev` | chevron-left | | `error` | circle-alert |
| `next` | chevron-right | | `warning` | triangle-alert |
| `up` | chevron-up | | `eye` | eye |
| `down` | chevron-down | | `eye-off` | eye-off |
| `back` | chevron-left | | `zoom-in` | zoom-in |
| `plus` | plus | | `zoom-out` | zoom-out |
| `minus` | minus | | `inbox` | inbox |
| `more` | ellipsis | | `star` | star |
| `search` | search | | `upload` | upload |
| `calendar` | calendar | | `link` | link |
| `fullscreen` | maximize | | `image` | image |
| `download` | download | | `sort` | chevrons-up-down |
| `external` | external-link | | `trash` | trash-2 |
| `pencil` | pencil | | `copy` | copy |
| `log-out` | log-out | | `menu` | menu |
| `rotate-cw` | rotate-cw | | `grip` | grip-vertical |
| `video` | video | | `file` | file |
| `filter` | sliders-horizontal | | `crop` | crop |
| `crosshair` | crosshair | | `rotate-ccw` | rotate-ccw |

`crop`, `crosshair`, `rotate-ccw` (0.35.0): toolbar của [cropper](cropper.md) (điểm trọng tâm, đặt lại).

`grip` (0.31.0): tay nắm kéo của [sortable](sortable.md) và repeater `sortable`.

Nhóm icon cho màn quản trị (CMS) — `trash`, `pencil`, `copy`, `log-out`, `menu`, `rotate-cw`, `zoom-out` — có từ
0.17.0 (hình học đối chiếu Lucide `lucide-static` 1.48.0). Ví dụ nút chỉ có icon trong bảng quản trị:

```html
<td-button variant="secondary" size="sm" icon="pencil" aria-label="Sửa"></td-button>
<td-button variant="danger" size="sm" icon="trash" aria-label="Xoá"></td-button>
```

`video`, `file`, `filter` có từ 0.32.0 (khung rỗng của [media field](media-field.md), nút "Bộ lọc" của
[media picker](media-picker.md)); `filter` vẽ theo Lucide `sliders-horizontal`.

`lock`, `clock`, `sun`, `moon`, `monitor` có từ 0.52.0: ổ khoá / đồng hồ trên núm [toggle](toggle.md) (`locked`,
`tone="warning"`) và công tắc theme Tự động (`monitor`) / Sáng (`sun`) / Tối (`moon`) của
[choice group `segmented`](choice-group.md#7-thanh-chọn-segmented-0520).

`archive`, `restore`, `category`, `brand`, `product`, `ban` có từ **0.56.0** (màn quản lý kho / danh mục; hình học
Lucide `lucide-static` 1.52.0):

| Tên td | Lucide | Dùng cho | Alias |
|---|---|---|---|
| `archive` | archive | lưu trữ | — |
| `restore` | archive-restore | khôi phục (khỏi lưu trữ) | `archive-restore` |
| `category` | folder-tree | danh mục / cây thư mục | `folder-tree` |
| `brand` | tag | nhãn hiệu / hãng | `tag`, `trademark` |
| `product` | package | sản phẩm / hộp | `package` |
| `ban` | ban | ngừng / chặn (nút `discontinue`) | — |
| `price` (0.59.0) | banknote | giá / tiền (tờ tiền, không ký hiệu `$` — hợp VNĐ) | `banknote` |

Gắn **nhãn / tag**: dùng `tag` (alias của `brand` từ 0.56.0) — không có icon riêng thứ hai. Không alias `badge-dollar-sign` /
`circle-dollar-sign` (hình khác).

Không có alias `box`: Lucide có icon `box` **khác hình** (khối lập phương). Logo hãng thật (brand icon) không vào core
([ADR 0010](../internal/decisions/0010-icon-registry.md)) — site đăng ký bằng `registerIcons()`. **Lưu ý nâng cấp:** tên
core mới làm `registerIcons()` của site **ném lỗi** nếu site đã dùng đúng tên đó
([breaking-changes § 0.56.0](../upgrading/breaking-changes.md)).

Danh sách luôn đúng nhất là lấy từ code, vì site có thể đã đăng ký thêm:

```js
import { listIcons } from '@dazzxq/td-components/icons';
console.log(listIcons()); // ['close', 'check', …, + icon site đã đăng ký]
```

Hoặc chạy `npm run storybook` và mở **Foundations/Icons** (lưới mọi icon, đổi cỡ được).

### Tên alias (0.18.0)

Một số tên quen thuộc (tên Lucide / Font Awesome) được nhận như **alias** của icon core — cùng một bảng cho JS
(`tdIcon`, `hasIcon`, `<td-icon>`, `td-button icon`, menu, tabs…) và PHP (`td_icon`), lưu ở mục `aliases` của
`src/icons/icons.json`:

| Alias | → Icon core |
|---|---|
| `x` | `close` |
| `chevron-left` / `chevron-right` / `chevron-up` / `chevron-down` | `prev` / `next` / `up` / `down` |
| `ellipsis` | `more` |
| `external-link` | `external` |
| `expand` | `fullscreen` |
| `pen` | `pencil` |
| `archive-restore` (0.56.0) | `restore` |
| `folder-tree` (0.56.0) | `category` |
| `tag` / `trademark` (0.56.0) | `brand` |
| `package` (0.56.0) | `product` |
| `banknote` (0.59.0) | `price` |

- SVG vẽ ra giống hệt icon đích, và `data-icon` là **tên core** (`tdIcon('x')` → `data-icon="close"`).
- Alias chỉ áp khi tên đó **không** phải icon core và chưa được site đăng ký: site `registerIcons({ pen: … })` thì
  icon của site thắng (giống PHP).
- `listIcons()` chỉ liệt kê tên thật, không có alias. Muốn biết tên thật của một tên bất kỳ: `resolveIconName(name)`
  (trả tên đã đăng ký, tên đích của alias, hoặc `null`).

## Cách dùng

### 1. Icon trang trí trong nút đã có nhãn

```js
const btn = document.createElement('button');
btn.type = 'button';
btn.append(tdIcon('download', { size: 's' }), ' Tải xuống');
```

Nút đã có chữ → để icon trang trí (mặc định, `aria-hidden="true"`). Nút **chỉ có icon** thì đặt tên cho **nút**
(`aria-label="Tải xuống"`), icon vẫn để trang trí.

### 2. Icon mang nghĩa đứng một mình

```js
cell.appendChild(tdIcon('success', { label: 'Đã duyệt' }));
```

`label` khác rỗng → svg có `role="img" aria-label="Đã duyệt"` kèm `<title>Đã duyệt</title>` (hover thấy tooltip). `label`
được đặt bằng `textContent`/attribute, không bao giờ thành HTML.

### 3. Kích thước

```js
tdIcon('star');               // mặc định 'm' → class td-icon--m (1.25rem)
tdIcon('star', { size: 's' }); // 1rem
tdIcon('star', { size: 'l' }); // 1.5rem
tdIcon('star', { size: 32 });  // số nguyên 8–128 → width="32" height="32" (px), không có class cỡ
```

Cỡ chữ `'s' | 'm' | 'l'` theo token (đổi được bằng CSS). Số nguyên ngoài 8–128, số lẻ (`12.5`) hoặc chuỗi lạ → `'m'`.
Cỡ số dùng attribute `width`/`height` (không phải inline style), nên không vi phạm CSP.

### 4. Màu

Icon vẽ bằng `currentColor` (nét hoặc tô) nên **lấy màu chữ** của phần tử cha:

```css
.status--ok { color: var(--td-color-success, #15803d); } /* icon bên trong đổi màu theo */
```

```js
const ok = tdIcon('success', { class: 'my-icon--ok' }); // thêm class của site
```

`class` nhận danh sách class cách nhau bởi khoảng trắng; token không hợp lệ (có `"`, `<`…) bị lọc bỏ.

### 5. Thẻ `<td-icon>` (không cần viết JS)

```html
<td-icon name="calendar" size="s"></td-icon>
<td-icon name="error" label="Lỗi"></td-icon>
```

| Attribute | Kiểu | Mặc định | Mô tả |
|---|---|---|---|
| `name` | string | — | Tên icon. Không tồn tại → thẻ rỗng + cảnh báo console. |
| `size` | `s` \| `m` \| `l` \| số nguyên | `m` | Chuỗi toàn chữ số (`"24"`) được hiểu là px. |
| `label` | string | — | Có → icon mang nghĩa (`role="img"`). |

Đổi attribute → vẽ lại. Nếu server đã render sẵn `svg.td-icon[data-icon]` đúng tên bên trong thẻ, lần gắn
đầu tiên **giữ nguyên** SVG đó (không vẽ trùng). `<td-icon>` có `display: inline-flex; line-height: 0`, không ảnh hưởng bố
cục.

### 6. Icon trong component khác

Nhiều component nhận **tên icon** trực tiếp: `td-button icon="download"`, `td-tabs` (`tabs[].icon`), `td-empty-state
icon="search"`, thanh công cụ của lightbox, mục của menu… Icon bạn `registerIcons()` dùng được ở tất cả những chỗ này.

## API (`@dazzxq/td-components/icons`)

| Hàm | Chữ ký | Mô tả |
|---|---|---|
| `tdIcon` | `(name: string, opts?: { size?: 's'\|'m'\|'l'\|number, label?: string, class?: string }) => SVGSVGElement \| null` | Dựng phần tử SVG bằng `createElementNS`. Tên không tồn tại → `null` + `console.warn('tdIcon: unknown icon "…"')`. Mỗi lần gọi trả về một node **mới**. |
| `registerIcons` | `(defs: Record<string, IconDef>) => void` | Đăng ký icon của site. Ném lỗi nếu có mục không hợp lệ (xem dưới). |
| `hasIcon` | `(name: string) => boolean` | Tên đã có trong registry chưa (tính cả alias từ 0.18.0). |
| `resolveIconName` | `(name: string) => string \| null` | Tên đã đăng ký → chính nó; alias → tên core đích; không có → `null`. (0.18.0) |
| `listIcons` | `() => string[]` | Mọi tên hiện có (core + đã đăng ký), theo thứ tự thêm. Không gồm alias. |
| `fillIconSlots` | `(root: ParentNode) => void` | Tìm mọi `[data-td-icon="tên"]` trong `root` và thay nội dung bằng icon (tuỳ chọn `data-td-icon-size`, `data-td-icon-class`). Dùng khi bạn render HTML chuỗi (xem [base-element](base-element.md)). Gọi lại nhiều lần vẫn đúng. |
| `svgStringToDefinition` | `(str: string) => IconDef \| null` | Chuyển chuỗi SVG thành định nghĩa đã kiểm tra, hoặc `null`. Dùng cho dữ liệu cũ (ví dụ `icon` của `td-empty-state` là chuỗi SVG). |
| `renderIconDefinition` | `(def: IconDef, opts?: { size?, class? }) => SVGSVGElement \| null` | Vẽ một định nghĩa mà không đăng ký (`data-icon="custom"`). Định nghĩa được kiểm tra lại, không hợp lệ → `null`. |

(Trước 0.16.0 module còn export `_validateIconDefinition`; từ 0.16.0 hàm này là nội bộ, không còn export. Kiểm tra
một định nghĩa bằng `svgStringToDefinition` / `renderIconDefinition` hoặc bắt lỗi của `registerIcons`.)

## Đăng ký icon của site — `registerIcons()`

```js
import { registerIcons, tdIcon } from '@dazzxq/td-components/icons';

registerIcons({
  'site-camera': {
    viewBox: '0 0 24 24',   // tuỳ chọn, mặc định '0 0 24 24'
    paint: 'stroke',        // 'stroke' (mặc định, nét 2px kiểu Lucide) | 'fill' (tô đặc)
    nodes: [
      ['path', { d: 'M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z' }],
      ['circle', { cx: 12, cy: 13, r: 3 }],
    ],
  },
  'site-dot': { paint: 'fill', nodes: [['circle', { cx: 12, cy: 12, r: 4 }]] },
});

document.body.appendChild(tdIcon('site-camera'));
```

Gọi `registerIcons()` **một lần**, sớm (trong file khởi động của site), trước khi component cần icon đó render.

### Quy tắc an toàn (định nghĩa chỉ là dữ liệu)

| Quy tắc | Chi tiết |
|---|---|
| Tên | Khớp `^[a-z][a-z0-9-]{0,63}$` (chữ thường, số, gạch nối, bắt đầu bằng chữ). |
| Không ghi đè | Tên đã tồn tại (kể cả core) → `Error: registerIcons: "x" already exists`. Nên đặt tiền tố site: `site-…`, `dwp-…`. |
| Tất cả hoặc không gì | Một mục sai → **không mục nào** trong lần gọi đó được đăng ký. |
| Định nghĩa | Phải là object (chuỗi SVG → lỗi "must be an object"). |
| `viewBox` | 4 số cách nhau một khoảng trắng, ví dụ `0 0 24 24`. |
| `paint` | `'stroke'` hoặc `'fill'`. |
| `nodes` | Mảng không rỗng, tối đa **64** phần tử, mỗi phần tử `[tag, attrs]`. |
| Tag cho phép | `path`, `circle`, `rect`, `line`, `polyline`, `polygon`, `ellipse`. Không `g`, `use`, `image`, `text`, `script`, `foreignObject`… |
| Attribute cho phép | `d` (ký tự lệnh path + số), `points` (số), `cx cy r rx ry x y x1 y1 x2 y2 width height` (một số), `fill-rule` / `clip-rule` (`nonzero`\|`evenodd`), `opacity` / `fill-opacity` / `stroke-opacity` (0–1). |
| Bị từ chối | `style`, `class`, `href`, `on*`, `fill`/`stroke` trên từng hình, `url(…)`, giá trị có `"` `<` `;`…; giá trị dài hơn 8 000 ký tự. |

Lỗi là `TypeError` (hoặc `Error` với tên trùng) có thông điệp nêu rõ icon + attribute sai, ví dụ
`icon "site-b": tag "use" not allowed`. Định nghĩa được **sao chép và đóng băng** khi đăng ký, sửa object gốc sau đó
không ảnh hưởng.

Chuyển một icon Lucide/SVG có sẵn sang định nghĩa: lấy các phần tử con của thẻ svg (thường là `path`/`circle`/`rect`),
chép attribute hình học vào `nodes`; bỏ `class`, `stroke`, `fill` của từng hình. Hoặc dùng `svgStringToDefinition(chuỗi)`
trong console để thử — trả `null` nghĩa là SVG có thành phần không được phép.

## Markup (hợp đồng SSR)

`tdIcon('close')` sinh ra đúng markup sau; `td_icon('close')` của [adapter PHP](../guides/php-adapter.md#td_icon-và-icon-riêng-của-site)
(`php/td.php`) render cùng markup từ `icons.json`:

```html
<svg class="td-icon td-icon--m" data-icon="close" viewBox="0 0 24 24" fill="none"
     stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
     aria-hidden="true" focusable="false"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
```

- `paint: 'fill'` → chỉ `fill="currentColor"` (không có các attribute stroke).
- Có `label` → thay `aria-hidden` bằng `role="img" aria-label="…"` và thêm `<title>` làm con đầu tiên.
- Cỡ số → `width`/`height`, không có class `td-icon--*`.

Adapter PHP đọc dữ liệu từ `src/icons/icons.json` của thư mục kit đã vendor (export `./icons.json`). Cấu trúc:
`{ "icons": { "<tên>": { "lucide": "…", "viewBox": "…", "paint": "stroke|fill", "nodes": [["path", {"d": "…"}], …] } } }`.
Xem [Adapter PHP](../guides/php-adapter.md) và [WordPress & PHP](../guides/wordpress-php.md).

### Icon trong markup render sẵn

Trong các mẫu markup của tài liệu (nút, switch, menu, dropdown…), chỗ nào có icon thì **đừng** tự gõ SVG: chọn một
trong ba cách dưới, cả ba ra cùng một `svg.td-icon[data-icon]` đầy đủ `viewBox` + hình.

1. **PHP (khuyên dùng khi render phía server):** `<?= td_icon('check', 's') ?>` — cỡ `s`/`m`/`l` (giá trị khác → `m`),
   tham số thứ ba là nhãn (icon mang nghĩa). Tên không tồn tại → chuỗi rỗng.
2. **Slot + JS:** in slot rỗng `<span data-td-icon="check" data-td-icon-size="s" aria-hidden="true"></span>` rồi gọi
   `fillIconSlots(root)` sau khi DOM sẵn sàng. `data-td-icon-size` nhận `s`/`m`/`l` hoặc số px (`"40"`);
   `data-td-icon-class` thêm class cho svg. Gọi lại nhiều lần vẫn đúng (nội dung slot được thay).

   ```js
   import { fillIconSlots } from '@dazzxq/td-components/icons'; // hoặc từ '@dazzxq/td-components'
   fillIconSlots(document.querySelector('#toolbar'));
   ```

3. **HTML tĩnh không PHP, không JS:** chép nguyên geometry từ `src/icons/icons.json` theo đúng khuôn ở trên (ví dụ
   `check` là `<path d="M20 6 9 17l-5-5"/>`, `down` là `<path d="m6 9 6 6 6-6"/>`). Cách này không tự cập nhật khi kit
   đổi icon — chỉ dùng khi không còn lựa chọn khác.

Component tự render (thẻ `<td-*>`, `TdMenu`, `TdModal`…) tự điền icon của nó — ba cách trên chỉ cho markup **bạn** in ra.

## Tuỳ biến giao diện

| Token | Mặc định | Tác dụng |
|---|---|---|
| `--td-icon-s` | `1rem` | Cỡ `s` |
| `--td-icon-m` | `1.25rem` | Cỡ `m` (mặc định) |
| `--td-icon-l` | `1.5rem` | Cỡ `l` |
| `--td-icon-stroke` | `2` | Độ dày nét (CSS `stroke-width` trên `.td-icon`, thắng attribute `stroke-width="2"`) |

```css
:root { --td-icon-stroke: 1.5; }        /* nét mảnh hơn cho toàn site */
.toolbar .td-icon { --td-icon-stroke: 2.5; }
```

Class: `.td-icon` (khối), `.td-icon--s|m|l`; thuộc tính nhận diện `data-icon="tên"` (icon vẽ từ định nghĩa rời là
`data-icon="custom"`).

## Trợ năng

- Mặc định **trang trí**: `aria-hidden="true"` + `focusable="false"` (IE/Edge cũ không đưa SVG vào vòng Tab).
- Có `label`: `role="img"` + `aria-label` + `<title>`. Chỉ dùng khi icon **đứng một mình và mang thông tin** (ví dụ icon
  trạng thái trong ô bảng). Nếu cạnh icon đã có chữ, hoặc icon nằm trong nút đã có `aria-label`, để trang trí — gắn
  `label` sẽ làm trình đọc đọc lặp.
- Icon theo `currentColor` nên theo luôn forced colors / chế độ tương phản cao.

## Bảo mật

- Icon được dựng bằng `createElementNS` + `setAttribute`, **không bao giờ** `innerHTML` → an toàn CSP và XSS.
- `registerIcons()` chỉ nhận dữ liệu qua allowlist ở trên; chuỗi markup bị từ chối.
- `svgStringToDefinition()` parse chuỗi như `image/svg+xml` (không phải HTML), từ chối DTD/ENTITY, chuỗi > 32 000 ký tự,
  lỗi parser, attribute gốc ngoài danh sách (`xmlns`, `xmlns:xlink`, `viewBox`, `fill`, `stroke`, `stroke-width`,
  `stroke-linecap`, `stroke-linejoin`, `width`, `height`, `class`, `aria-hidden`, `focusable`, `role`, `version`) hoặc có
  `url(`/`javascript:`, thiếu `viewBox`; phần tử con phải qua cùng allowlist với `registerIcons`. Không vẽ một phần.
- Brand icon (logo mạng xã hội…) **không** vào core; site tự đăng ký sau khi xét giấy phép.

## Thêm icon vào core (người bảo trì kit)

1. Sửa `src/icons/icons.json`: thêm mục `"<tên>": { "lucide": "<tên gốc>", "viewBox": "0 0 24 24", "paint": "stroke",
   "nodes": [...] }` (hình học chép từ Lucide).
2. `npm run build:icons` → sinh lại `src/icons/registry.js` (file sinh ra, không sửa tay).
3. `npm run check:icons` (có trong `npm test`) báo lỗi nếu `registry.js` lệch với `icons.json`.

Thêm alias: thêm `"<alias>": "<tên core>"` vào mục `aliases` rồi `npm run build:icons`. Build báo lỗi nếu alias trùng
tên một icon core, sai dạng tên, hoặc trỏ tới icon không tồn tại.

Giấy phép: hình học từ [Lucide](https://lucide.dev) (ISC; phần kế thừa Feather: MIT), xem `THIRD_PARTY_NOTICES.md` trong
gói. Tập icon cố ý nhỏ: registry theo tên không tree-shake từng icon, nên dung lượng được giữ bằng cách chỉ thêm icon
kit thực sự dùng.

## Lưu ý & lỗi thường gặp

- **`tdIcon()` trả `null`** khi sai tên → `appendChild(null)` sẽ ném lỗi. Kiểm tra `hasIcon(name)` nếu tên đến từ dữ liệu.
- **Đăng ký trùng tên ném lỗi** (kể cả đăng ký lại cùng định nghĩa, ví dụ module chạy hai lần). Bọc bằng
  `if (!hasIcon('site-x')) registerIcons({...})` khi không chắc. (Lưu ý: `hasIcon('pen')` là `true` vì `pen` là alias,
  dù `registerIcons({ pen: … })` vẫn được phép — nên đặt tên icon site có tiền tố, ví dụ `site-pen`.)
- **Một node chỉ ở một chỗ**: muốn cùng icon ở hai nơi thì gọi `tdIcon()` hai lần.
- `size: '24'` (chuỗi) trong `tdIcon()` **không** được hiểu là px (→ `m`); truyền số `24`. (Riêng `<td-icon size="24">` và
  `data-td-icon-size="24"` thì chuỗi số được chuyển sang số.)
- Icon trông quá đậm/nhạt so với chữ: chỉnh `--td-icon-stroke`, không sửa `stroke-width` trong định nghĩa.

## Xem thêm

- [Mở rộng: đăng ký icon](../customization/extending.md) · [Tự viết component](base-element.md) (`fillIconSlots`)
- [WordPress & PHP](../guides/wordpress-php.md) · [CSP](../guides/csp.md) · [Bảo mật](../guides/security.md)
