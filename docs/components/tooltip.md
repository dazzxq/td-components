[Tài liệu](../README.md) › [Components](README.md) › Tooltip

# Tooltip — `TdTooltip` (thuộc tính `data-tooltip`)

Tooltip là nhãn chữ nhỏ có mũi tên hiện cạnh một phần tử khi rê chuột, chạm hoặc focus vào nó. Chỉ cần import module
một lần: mọi phần tử có `data-tooltip="…"` trên trang (kể cả phần tử thêm sau này) đều có tooltip. Giao diện và hành vi
giống tooltip của dwp, trên bề mặt **nền đặc** (minimal surfaces 0.20.0: viền mảnh + một bóng mềm, không blur), vẫn giữ
các cải tiến trợ năng của td. Từ 0.21.0 chip mặc định **màu đen chữ trắng** ở cả hai theme, chữ xuống dòng được
**căn giữa** (đổi bằng `data-tooltip-align`).

Dùng tooltip cho **chữ ngắn, bổ sung** (giải thích nút chỉ có icon, tên đầy đủ của chữ viết tắt). Không đặt thông tin
bắt buộc hay nội dung tương tác (link, nút) trong tooltip — dùng [hovercard](hovercard.md) cho nội dung phong phú,
[menu](menu.md) cho danh sách thao tác.

| | |
|---|---|
| Import | `import '@dazzxq/td-components/tooltip'` (tự khởi tạo) · `import { TdTooltip, tdTooltip } from '@dazzxq/td-components/tooltip'` |
| Loại | Attribute khai báo + singleton JS tự khởi tạo |
| Form-associated | không |
| Từ phiên bản | 0.1.0 (giao diện & hành vi dwp + alias `data-dwp-*` từ 0.14.0) |

Cần `td.css`.

## Ví dụ nhanh

```html
<button type="button" class="td-btn td-btn--secondary" data-tooltip="Sao chép liên kết">Sao chép</button>

<script type="module">
  import '@dazzxq/td-components/tooltip';
</script>
```

## Cách dùng

### Chọn phía hiện

```html
<button type="button" data-tooltip="Phía trên (mặc định)">Top</button>
<button type="button" data-tooltip="Phía dưới" data-tooltip-position="bottom">Bottom</button>
<button type="button" data-tooltip="Bên trái" data-tooltip-position="left">Left</button>
<button type="button" data-tooltip="Bên phải" data-tooltip-position="right">Right</button>
```

Nếu phía đã chọn không đủ chỗ, tooltip **lật** sang phía đối diện; nếu vẫn không vừa thì bị ép vào trong màn hình (cách
mép 8px). Với `left` / `right` mà cả hai bên đều không đủ chỗ, tooltip chuyển lên trên (hoặc dưới). Mũi tên luôn chỉ vào
tâm phần tử kích hoạt, kể cả khi chip bị ép vào mép.

### Nút chỉ có icon

```html
<button type="button" class="td-btn td-btn--secondary" aria-label="Tải xuống" data-tooltip="Tải file PDF về máy">
  <td-icon name="download"></td-icon>
</button>

<script type="module">
  import '@dazzxq/td-components/tooltip';
  import '@dazzxq/td-components/icon-element'; // định nghĩa <td-icon>, xem trang Icons
</script>
```

Nút đã có tên (`aria-label="Tải xuống"`) → tooltip được đọc như **mô tả** bổ sung. Nếu bạn quên `aria-label`, kit tự lấy chữ
tooltip làm `aria-label` và in cảnh báo ra console (xem [Chính sách tên](#chính-sách-tên-truy-cập)).

### Màu tuỳ chỉnh

```html
<span tabindex="0" data-tooltip="Đã xác minh" data-tooltip-color="#15803d">Xác minh</span>
<span tabindex="0" data-tooltip="Beta" data-tooltip-color="#fde047" data-tooltip-text-color="#1f2937">Beta</span>
```

Có `data-tooltip-color` → chip nền đặc màu đó, mũi tên cùng màu. Màu chữ tự chọn đen hoặc trắng theo
độ tương phản WCAG, trừ khi bạn chỉ định `data-tooltip-text-color`.

### Căn chữ (0.21.0)

Chữ dài xuống nhiều dòng mặc định **căn giữa** (token `--td-tooltip-text-align: center`). Đổi cho từng tooltip bằng
`data-tooltip-align` trên phần tử kích hoạt:

```html
<button type="button" aria-label="Xuất báo cáo" data-tooltip="Xuất báo cáo tháng này ra file Excel, gồm cả các đơn đã huỷ"
        data-tooltip-align="start">…</button>
```

Giá trị: `start` (trái với chữ trái-sang-phải), `center`, `end`. Giá trị khác bị bỏ qua (dùng mặc định). Kit chép giá
trị sang chip thành `data-align` (không dùng inline style). Muốn cả site căn trái: `:root { --td-tooltip-text-align: start; }`.

### Markup của dwp dùng nguyên

```html
<a href="/profile" data-dwp-tooltip="Trang cá nhân" data-dwp-tooltip-pos="bottom">Hồ sơ</a>
<button type="button" data-tooltip="Lưu" data-tooltip-pos="right">Lưu</button>
```

### Đổi chữ khi đang hiện

Đổi attribute là đủ; tooltip đang mở cập nhật ngay:

```js
const btn = document.querySelector('#copy');
btn.addEventListener('click', async () => {
  await navigator.clipboard.writeText(location.href);
  btn.setAttribute('data-tooltip', 'Đã sao chép!');
});
```

### Tắt tooltip của một phần tử

Xoá attribute, hoặc đặt `data-tooltip=""` (rỗng). Một `data-tooltip` có mặt nhưng rỗng cũng **tắt luôn**
`data-dwp-tooltip` trên cùng phần tử.

## Attribute

Đặt trên phần tử kích hoạt (bất kỳ phần tử nào):

| Attribute | Kiểu | Mặc định | Mô tả |
|---|---|---|---|
| `data-tooltip` | string | — | Chữ của tooltip (render dạng text). Rỗng → không có tooltip. |
| `data-dwp-tooltip` | string | — | Alias dwp của `data-tooltip`. Nếu có cả hai, `data-tooltip` thắng. |
| `data-tooltip-position` | `top` \| `bottom` \| `left` \| `right` | `top` | Phía ưu tiên. |
| `data-tooltip-pos` | như trên | — | Alias. Thứ tự đọc: `data-tooltip-position` → `data-tooltip-pos` → `data-dwp-tooltip-pos`; attribute đầu tiên có **giá trị hợp lệ** thắng. |
| `data-dwp-tooltip-pos` | như trên | — | Alias dwp. |
| `data-tooltip-color` | màu CSS | — | Nền đặc tuỳ chỉnh. Chỉ nhận: hex (`#rgb`, `#rrggbb`, …), `rgb()/rgba()/hsl()/hsla()` với tham số số, hoặc tên màu chỉ gồm chữ cái. Màu phải **đục hoàn toàn** và trình duyệt nhận ra; màu trong suốt / có alpha / không hợp lệ → quay về chip mặc định. |
| `data-tooltip-text-color` | màu CSS | đen/trắng tự động | Màu chữ; chỉ có tác dụng khi có `data-tooltip-color`. Cùng luật kiểm tra như trên; không hợp lệ → tự động. |
| `data-tooltip-align` | `start` \| `center` \| `end` | `--td-tooltip-text-align` (`center`) | Căn chữ khi xuống dòng (0.21.0). Giá trị khác → mặc định. |

Attribute kit tự đặt lên phần tử kích hoạt (đừng tự đặt):

| Attribute | Khi nào |
|---|---|
| `aria-describedby="… td-tooltip"` | Trong lúc tooltip hiện (thêm id `td-tooltip` vào danh sách sẵn có, gỡ đúng id đó khi ẩn). Bỏ qua khi chữ tooltip trùng tên của phần tử. |
| `aria-label` + `data-td-tooltip-named="title\|tooltip"` | Khi phần tử được hỗ trợ không có tên (xem bên dưới). |

`title` **không** phải nguồn chữ của tooltip. Kit xử lý `title` theo chính sách tên bên dưới để tránh tooltip gốc của
trình duyệt hiện chồng lên.

## Property & method

Import module đã tạo sẵn và khởi tạo một singleton `tdTooltip` (khi `DOMContentLoaded`, hoặc ngay nếu DOM đã sẵn
sàng). **Không** tạo thêm `new TdTooltip()` — chỉ có một phần tử `#td-tooltip` dùng chung.

| Thành viên | Mô tả |
|---|---|
| `tdTooltip.init()` | Khởi tạo (idempotent): tạo/nhận phần tử `#td-tooltip`, gắn listener, áp chính sách tên, theo dõi DOM. |
| `tdTooltip.disconnect()` | Gỡ toàn bộ: listener, observer, đăng ký lớp, phần tử tooltip. Gọi `init()` lại được. |
| `tdTooltip.show(element)` | Hiện tooltip cho `element` (cần có `data-tooltip` / `data-dwp-tooltip` không rỗng). |
| `tdTooltip.hide()` | Ẩn tooltip (mờ dần rồi đặt `[hidden]`). |
| `tdTooltip.position(element)` | Tính lại vị trí (ẩn nếu phần tử không hiển thị / đã cuộn ra khỏi màn hình). |
| `tdTooltip.getTooltipContent(element)` | `string \| null` — chữ sẽ hiển thị. |
| `tdTooltip.getTooltipPosition(element)` | `'top' \| 'bottom' \| 'left' \| 'right'` — phía ưu tiên đã chuẩn hoá. |
| `tdTooltip.isCurrentlyHovering()` | `true` khi tooltip đang hiện và con trỏ ở trên trigger hoặc chip. |
| `tdTooltip.isVisible` | `boolean`, chỉ đọc. |
| `tdTooltip.currentElement` | Trigger hiện tại hoặc `null`, chỉ đọc. |
| `tdTooltip.tooltip` | Phần tử `#td-tooltip`, chỉ đọc. |
| `TdTooltip` | Lớp (xuất ra để tương thích / test). |

```js
import { tdTooltip } from '@dazzxq/td-components/tooltip';

// Hiện tooltip bằng code, ví dụ hướng dẫn người dùng mới
tdTooltip.show(document.querySelector('#new-feature'));
```

Tooltip không phát event nào.

## Hành vi (giống dwp)

**Hiện khi:**

- con trỏ đi vào trigger — với **mọi loại con trỏ**: chuột, bút, cả chạm (touch);
- trigger nhận focus — **bất kỳ** kiểu focus nào (Tab, click, `element.focus()` bằng code).

**Ẩn khi:**

- con trỏ rời trigger (sau 100ms "ân hạn" để con trỏ kịp di sang chính chip — chip rê chuột lên được, theo WCAG 1.4.13);
  di giữa icon và chữ **bên trong** trigger không làm ẩn;
- focus rời trigger;
- chạm / click ở chỗ khác (click vào chính trigger hoặc chip thì không ẩn);
- **bất kỳ** thao tác cuộn nào (kể cả cuộn trong một vùng con), đổi kích thước cửa sổ, cửa sổ mất focus;
- nhấn Escape;
- trigger bị gỡ khỏi DOM, hoặc bị cuộn ra ngoài màn hình.

**Không có hẹn giờ tự ẩn** — tooltip ở lại chừng nào điều kiện hiện còn đúng (hẹn giờ 30 giây kiểu cũ đã bỏ từ 0.9.0).

**Tinh chỉnh trợ năng của td:**

- Khi trigger đang có **focus bàn phím** (`:focus-visible`), chuột lướt qua rồi rời đi **không** làm ẩn, và thao tác cuộn
  (ví dụ trình duyệt tự cuộn trigger vào tầm nhìn) chỉ **định vị lại** thay vì ẩn.
- Nhấc ngón tay không bị coi là "rời đi": tooltip hiện do chạm sẽ ở lại tới khi focus rời, chạm chỗ khác, cuộn hoặc
  Escape. Cú chạm vẫn là một cú click bình thường với trigger (nút vẫn chạy hành động).
- Focus bằng chuột (không phải `:focus-visible`) không giữ tooltip khi con trỏ đã rời trigger.

**Trên các lớp khác:** tooltip ở `--td-z-tooltip` (510), trên cả toast, loading và modal. Tooltip bên trong modal hoạt
động bình thường (tooltip và dialog đều nền đặc). Escape khi có tooltip trên modal chỉ ẩn
tooltip, không ảnh hưởng modal.

## Chính sách tên truy cập

Để tooltip không làm hỏng tên mà trình đọc màn hình đọc ra, kit chỉ đụng vào tên của các trigger **được hỗ trợ**:
`<button>`, `<a href>`, `input[type=button|submit|reset|image]`, và phần tử có `role` là `button`, `link`, `tab` hoặc
`menuitem`. Chính sách áp dụng ngay khi khởi tạo và cho mọi trigger thêm vào sau (kể cả khi `title` / `data-tooltip`
đổi).

| Trigger được hỗ trợ … | Kit làm gì |
|---|---|
| đã có tên (chữ bên trong, `aria-label`, `aria-labelledby`, `<label>`, `alt` của ảnh con, `value` của input …) | Gỡ `title`. Tooltip là **mô tả** (`aria-describedby`) khi hiện; bỏ qua nếu chữ trùng tên. |
| không có tên nhưng có `title` | Chuyển `title` thành `aria-label` (đánh dấu `data-td-tooltip-named="title"`). |
| không có tên, không có `title` | Lấy chữ tooltip làm `aria-label` (đánh dấu `data-td-tooltip-named="tooltip"`) và `console.warn` một lần. Hãy sửa markup: thêm chữ hiển thị, `aria-label` hoặc `<label>`. |

Mọi phần tử khác (ví dụ `<span tabindex="0">`, `<div>`, hay `<a href role="presentation">`) giữ nguyên tên và `title`;
tooltip vẫn hiện và vẫn được liên kết làm mô tả.

## Tuỳ biến giao diện

| Token | Mặc định | Tác dụng |
|---|---|---|
| `--td-tooltip-max-w` | `18rem` | Bề rộng tối đa (chữ dài tự xuống dòng; không bao giờ rộng quá màn hình trừ 16px). |
| `--td-tooltip-pad-y` | `0.4rem` | Padding dọc. |
| `--td-tooltip-pad-x` | `0.6rem` | Padding ngang. |
| `--td-tooltip-radius` | `var(--td-radius-md)` | Bo góc. |
| `--td-tooltip-gap` | `8px` | Khoảng cách tới trigger (JS đọc token này khi định vị). |
| `--td-tooltip-font-size` | `var(--td-text-sm)` | Cỡ chữ (14px). |
| `--td-tooltip-leading` | `1.4` | Line-height. |
| `--td-tooltip-arrow-size` | `8px` | Kích thước mũi tên. |
| `--td-tooltip-dur` | `120ms` | Thời gian mờ dần khi hiện / ẩn. |
| `--td-tooltip-bg` | `#18181b` (dark `#3a3a3e` từ 0.41.0) | Nền chip mặc định (0.21.0: đen, đặc, không blur; dark 0.41.0: chip xám nổi — chip đen chỉ 1.06:1 trên trang tối). |
| `--td-tooltip-fg` | `#fff` | Chữ chip mặc định. |
| `--td-tooltip-border` | `transparent` (dark `rgb(255 255 255 / 16%)`, 0.41.0) | Viền chip; theme tối có viền sáng mờ để chip không chìm vào nền tối. |
| `--td-tooltip-text-align` | `center` | Căn chữ mặc định (0.21.0); `data-tooltip-align` ghi đè cho từng tooltip. |

Muốn chip sáng như 0.20 (nền bề mặt, chữ tối):

```css
:root {
  --td-tooltip-bg: var(--td-glass-solid);
  --td-tooltip-fg: var(--td-glass-fg);
  --td-tooltip-border: var(--td-glass-border);
}
```

Custom property do JS ghi (CSSOM) lên `#td-tooltip` — không tự đặt:

| Property | Ý nghĩa |
|---|---|
| `--td-tooltip-bg`, `--td-tooltip-fg` | Khi dùng `data-tooltip-color`: ghi đè token cùng tên **trên chính chip** bằng màu tuỳ chỉnh. |
| `--td-tooltip-arrow-x` / `--td-tooltip-arrow-y` | Vị trí mũi tên (trên/dưới dùng `x`, trái/phải dùng `y`). |

```css
/* Tooltip rộng và chữ to hơn một chút */
:root {
  --td-tooltip-max-w: 22rem;
  --td-tooltip-font-size: 0.9375rem;
}
```

`prefers-reduced-motion: reduce` → không có hiệu ứng mờ, ẩn ngay lập tức. Tương phản cao → nền `--td-color-surface`, viền rõ, không bóng.
`forced-colors: active` → `Canvas` / `CanvasText`, viền `CanvasText`. `data-td-glass="off"` / giảm trong suốt → chip vẫn
đen (vốn đã đặc).

## Cấu trúc DOM & class

Một phần tử duy nhất dùng chung, gắn vào `<body>`:

```html
<div id="td-tooltip" class="td-tooltip td-glass-surface td-glass-surface--strong" role="tooltip"
     data-state="open" data-placement="top">
  <span class="td-tooltip__content">Sao chép liên kết</span>
</div>
```

| Class / attribute | Ý nghĩa |
|---|---|
| `[hidden]` | Đang ẩn. |
| `[data-state="open"]` | Đã hiện xong (độ mờ 1, nhận con trỏ). Khi ẩn, attribute bị gỡ trước rồi `[hidden]` được đặt sau khi mờ xong. |
| `[data-placement="top\|bottom\|left\|right"]` | Phía thực tế sau khi lật. |
| `[data-custom]` | Đang dùng màu tuỳ chỉnh (nền đặc). |
| `[data-align="start\|center\|end"]` | Căn chữ lấy từ `data-tooltip-align` của trigger (0.21.0); không có → token mặc định. |
| `.td-tooltip::after` | Mũi tên (pseudo-element, cùng nền và viền với chip). |

Nếu trang đã có sẵn `<div id="td-tooltip" class="td-tooltip">` (ví dụ render server-side), kit dùng lại phần tử đó.

## Bàn phím & trợ năng

- Tab tới trigger → tooltip hiện; Tab đi → ẩn. Escape ẩn tooltip (và chỉ tooltip).
- `role="tooltip"` + `aria-describedby` trên trigger trong lúc hiện; tên truy cập được bảo vệ theo
  [chính sách tên](#chính-sách-tên-truy-cập).
- Chip rê chuột lên được và không tự biến mất khi bạn đang đọc (WCAG 1.4.13: dismissible, hoverable, persistent).
- Tooltip không chứa phần tử tương tác nên không nhận focus.
- Phần tử chỉ để hiển thị (như `<span>`) muốn có tooltip với người dùng bàn phím thì cần `tabindex="0"`.

## Bảo mật

Chữ tooltip luôn được render dạng **text** (`textContent`), không bao giờ là HTML — lấy thẳng từ dữ liệu người dùng
vào `data-tooltip` là an toàn (miễn là bạn escape đúng ngữ cảnh **attribute HTML** khi in từ server, ví dụ
`esc_attr()` trong WordPress / `htmlspecialchars()` trong PHP). Màu tuỳ chỉnh đi qua bộ lọc `safeColor` và kiểm tra
độ đục; chuỗi CSS lạ không bao giờ tới CSSOM.

```php
<button type="button" data-tooltip="<?= htmlspecialchars($user['display_name'], ENT_QUOTES, 'UTF-8') ?>">
  <?= htmlspecialchars($user['initials'], ENT_QUOTES, 'UTF-8') ?>
</button>
```

## Cảm ứng

- **Không hiện khi chạm** (0.36.2): bỏ qua `pointerenter` của ngón tay và focus mà cú chạm sinh ra trên cùng trigger (trong 1 s). Chuột, bút, bàn phím (Tab), focus bằng code vẫn hiện như cũ; `aria-describedby` gắn khi tooltip hiện.
- Tooltip là thông tin phụ: **không đặt thông tin bắt buộc trong tooltip** (người dùng điện thoại không bao giờ thấy). Chạm chỗ khác vẫn ẩn tooltip đang hiện.

Chuẩn chung: [Cảm ứng](../guides/touch.md).

## Lưu ý & lỗi thường gặp

- **Tooltip ẩn ngay khi một lớp chặn mới mở (0.21.1):** modal, lightbox hoặc loading mở bằng code khi tooltip đang
  hiện do hover → tooltip ẩn ngay. Trigger bị ẩn (`display: none`, chuyển tab) / bị gỡ → ẩn; tooltip của phần tử được
  focus khi modal mở được đặt lại vị trí khi hiệu ứng vào kết thúc.
- **Escape (0.21.1):** tooltip chỉ nhận Escape khi nó là lớp mở gần nhất hoặc focus đang ở trigger của nó. Tooltip
  hiện do hover mà sau đó có dropdown / menu mở → Escape đóng dropdown / menu trước, lần sau mới đóng tooltip.
- **Tooltip không hiện:** module chưa được import, `td.css` chưa nạp, attribute rỗng, hoặc trigger đang bị cuộn ra
  ngoài / không hiển thị.
- **Nút `disabled`:** phần tử bị disabled không nhận focus và (tuỳ trình duyệt) không phát sự kiện con trỏ, nên tooltip
  có thể không hiện. Bọc nút trong `<span tabindex="0" data-tooltip="…">` nếu cần giải thích vì sao nút bị khoá.
- **`title` biến mất khỏi nút của tôi:** đó là chính sách tên (tránh tooltip gốc trình duyệt hiện chồng). Tên của nút
  vẫn được giữ.
- **Cảnh báo `[td-tooltip] trigger has no accessible name`:** thêm `aria-label` hoặc chữ hiển thị cho nút / link.
- **Đổi `data-tooltip-color` / `data-tooltip-align` / phía khi tooltip đang hiện** chỉ áp dụng ở lần hiện kế tiếp (chỉ chữ được cập nhật trực
  tiếp).
- **Màu có alpha** (`#0008`, `rgba(…, .5)`, `transparent`) bị bỏ qua để chip không bị khó đọc.
- Cuộn trang làm tooltip ẩn là hành vi có chủ đích (giống dwp).

## Xem thêm

- [Hovercard](hovercard.md) (nội dung phong phú khi rê chuột) · [Menu](menu.md)
- [Trợ năng](../guides/accessibility.md) · [Bảo mật](../guides/security.md)
- [Theming](../customization/theming.md) · [Lớp nổi & bàn phím](../concepts/how-it-works.md)
- [Tích hợp WordPress / PHP](../guides/wordpress-php.md)
