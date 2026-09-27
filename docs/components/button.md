[Tài liệu](../README.md) › [Components](README.md) › Button

# Button — `<td-button>`

Nút bấm kiểu Liquid Glass: các variant có màu (primary, success, danger, info, warning) là "kính nhuộm màu", secondary là
kính trắng trung tính. Dùng cho mọi hành động (lưu, gửi form, mở modal…). Nếu bạn cần một **đường dẫn** (chuyển trang)
thì dùng thẻ `<a>` thường, không dùng `td-button`. Nếu cần nút có menu con, dùng [menu](menu.md) gắn vào một `td-button`.

| | |
|---|---|
| Import | `import '@dazzxq/td-components/button';` (class: `import { TdButton } from '@dazzxq/td-components';`) |
| Loại | Custom element |
| Form-associated | không (nhưng nút `<button>` bên trong vẫn submit/reset được form bao quanh, xem [Dùng trong form](#dùng-trong-form)) |
| Từ phiên bản | 0.1.0 (token-native từ 0.7.0, Liquid Glass từ 0.14.0, `run()` từ 0.13.0) |

Cần nạp `td.css` một lần trên trang (xem [Cài đặt](../getting-started/installation.md)). Không có `td.css` thì nút
vẫn chạy nhưng không có giao diện.

## Ví dụ nhanh

```html
<td-button variant="primary">Lưu</td-button>
<td-button variant="secondary">Huỷ</td-button>
<td-button variant="danger" icon="close">Xoá</td-button>
<td-button variant="secondary" icon="more" aria-label="Thêm tuỳ chọn"></td-button>

<script type="module">
  import '@dazzxq/td-components/button';
</script>
```

## Cách dùng

### Chọn variant và size

```html
<td-button variant="primary">Primary</td-button>
<td-button variant="secondary">Secondary</td-button>
<td-button variant="success">Success</td-button>
<td-button variant="danger">Danger</td-button>
<td-button variant="info">Info</td-button>
<td-button variant="warning">Warning</td-button>

<td-button size="sm">Nhỏ (32px)</td-button>
<td-button size="md">Vừa (40px)</td-button>
<td-button size="lg">Lớn (48px)</td-button>
```

Giá trị không hợp lệ không báo lỗi mà rơi về mặc định: `variant` lạ → `primary`, `size` lạ → `md`.

### Chữ trên nút: nội dung thẻ hoặc `label`

```html
<td-button>Gửi bài</td-button>          <!-- chữ lấy từ nội dung thẻ -->
<td-button label="Gửi bài"></td-button> <!-- chữ lấy từ attribute label -->
```

Nội dung thẻ chỉ được đọc **một lần** khi phần tử gắn vào trang lần đầu (lấy `textContent`, bỏ khoảng trắng hai đầu).
Mọi thẻ HTML bên trong (ví dụ `<b>`) bị bỏ, chỉ giữ chữ. Muốn đổi chữ sau đó, đổi attribute `label`:

```js
document.querySelector('#send').setAttribute('label', 'Đang chờ duyệt');
```

Nếu không có `label` và cũng không có chữ, nút hiện chữ mặc định `Button` (trừ trường hợp nút chỉ có icon, xem dưới).

### Nút có icon, nút chỉ có icon

```html
<td-button icon="download">Tải về</td-button>
<td-button icon="next" icon-position="right">Tiếp</td-button>

<!-- Chỉ icon: BẮT BUỘC có aria-label, nếu không nút hiện chữ "Button" -->
<td-button variant="secondary" icon="close" aria-label="Đóng"></td-button>
```

`icon` nhận **tên icon trong registry** của kit. Các tên có sẵn: `close check prev next up down back plus minus more
search calendar fullscreen download external info success error warning eye eye-off zoom-in inbox star upload link
image sort`. Bạn có thể đăng ký thêm icon riêng, xem [Icons](icons.md).

Nút chỉ có icon chỉ bỏ phần chữ khi có **đủ** ba điều kiện: có `icon`, có `aria-label`, và không có chữ/`label`.

### Icon kiểu class cũ (Font Awesome…) — đã lỗi thời

Để tương thích code cũ, **bất kỳ giá trị `icon` nào không phải tên trong registry** đều được hiểu là một danh sách
class CSS và render thành thẻ `<i>`:

```html
<td-button icon="fas fa-edit">Sửa</td-button>
<!-- render: <span class="td-btn__icon" aria-hidden="true"><i class="fas fa-edit" aria-hidden="true"></i></span> -->
```

Chi tiết cần biết:

- Hành vi này **deprecated**: vẫn chạy nhưng nên chuyển sang icon registry (đăng ký SVG bằng `registerIcons`, xem
  [Icons](icons.md)).
- Kit **không** nạp Font Awesome hay bộ icon nào. Site tự nạp CSS của bộ icon đó thì `<i>` mới hiện hình.
- Mỗi class được lọc theo mẫu `^[A-Za-z_][A-Za-z0-9_-]*$`; class nào không khớp (có ký tự lạ, dấu ngoặc…) bị bỏ.
  Nếu không còn class nào hợp lệ, không render icon. Nhờ vậy giá trị kiểu `"><img src=x>` không chèn được HTML.
- Bẫy hay gặp: gõ nhầm một tên chưa có trong registry (ví dụ `icon="edit"`) sẽ **không báo lỗi** mà thành
  `<i class="edit">` rỗng, không thấy gì. Kiểm tra bằng `hasIcon('edit')` từ `@dazzxq/td-components/icons`.

### Nút rộng hết khung

```html
<td-button full-width>Đăng nhập</td-button>
```

Khi có `full-width`, cả thẻ `td-button` chuyển thành `display: block` và nút bên trong rộng 100%.

### Màu tuỳ chỉnh

```html
<td-button color="#7c3aed">Tím</td-button>
<td-button color="navy">Xanh navy</td-button>
<td-button color="#fde047" text-color="#1f2937">Vàng, chữ xám đậm</td-button>
```

- `color` ghi đè màu của variant. Nhận mọi màu CSS hợp lệ (hex, `rgb()`, `hsl()`, tên màu…), được kiểm tra qua
  `safeColor` rồi trình duyệt chuẩn hoá. Màu không hợp lệ bị bỏ qua, nút giữ màu variant.
- Màu tuỳ chỉnh luôn là **nền đặc, không phải kính** (không blur). Màu trong suốt (ví dụ `rgba(0,0,128,.5)`) được
  trộn lên nền trắng thành màu đặc trước khi dùng.
- Nếu không có `text-color`, chữ tự chọn **đen hoặc trắng** theo tỉ lệ tương phản WCAG cao hơn so với nền đó.
- `text-color` **chỉ có tác dụng khi có `color`**. Đặt `text-color` một mình trên nút variant thường sẽ không có gì
  xảy ra (muốn đổi màu chữ của variant, override token, xem [Tuỳ biến giao diện](#tuỳ-biến-giao-diện)).
- Hover của nút màu tuỳ chỉnh phủ một lớp làm tối (khi chữ sáng) hoặc làm sáng (khi chữ tối), để hover không bao giờ
  làm giảm tương phản.

Giá trị áp vào bằng CSSOM (`el.style.setProperty('--td-btn-bg', …)`) trên thẻ host, không dùng `style="…"`, nên hợp
lệ với CSP strict.

### Trạng thái loading, và `run()` chống bấm hai lần

Cách đơn giản nhất là `run()`: truyền vào một hàm (thường là async), nút tự bật loading khi hàm chạy và tự tắt khi xong,
kể cả khi hàm lỗi.

```js
import '@dazzxq/td-components/button';

const btn = document.querySelector('#save');
btn.addEventListener('click', async () => {
  try {
    const data = await btn.run(() => fetch('/api/save', { method: 'POST' }).then((r) => r.json()));
    console.log('Đã lưu', data);
  } catch (err) {
    console.error('Lưu lỗi', err); // run() ném lại lỗi của hàm → nhớ catch
  }
});
```

Quy tắc của `run(fn)`:

- `fn` không phải hàm → trả về Promise bị reject với `TypeError('TdButton.run: a function is required')`.
- Trong lúc đang chạy, gọi `run()` lần nữa (kể cả gọi lồng ngay bên trong `fn`) trả về **đúng Promise đang chạy**,
  `fn` không chạy lần hai. Đây là cơ chế chống double submit.
- `loading` được bật trước khi `fn` chạy và **luôn** được gỡ trong `finally` (kể cả khi trước đó bạn đã tự đặt
  `loading`, hoặc nút bị gỡ khỏi trang giữa chừng).
- `fn` bắt đầu chạy sau một microtask (không chạy đồng bộ ngay trong lời gọi `run()`).
- Kết quả của `fn` được trả về qua Promise; lỗi của `fn` được ném lại.
- `run()` **không** kiểm tra `disabled`: gọi bằng code trên nút disabled thì `fn` vẫn chạy.

Bật/tắt loading bằng tay:

```js
btn.setLoading(true);   // = btn.setAttribute('loading', '')
btn.setLoading(false);  // = btn.removeAttribute('loading')
```

```html
<td-button loading>Đang gửi</td-button>
```

Khi loading: nút bên trong có `aria-busy="true"` và `aria-disabled="true"`, chữ và icon bị ẩn (giữ nguyên kích thước
nút), spinner hiện ở giữa, con trỏ là `progress`, và **mọi click bị chặn** (không tới listener của bạn). Khác với
`disabled`, nút loading **vẫn giữ focus** và vẫn nằm trong thứ tự Tab, nên người dùng bàn phím không bị mất vị trí.

### Disabled

```html
<td-button disabled>Không bấm được</td-button>
```

```js
btn.setDisabled(true);  // = setAttribute('disabled', '')
```

`disabled` là disabled native của `<button>`: không click, không focus, ra khỏi thứ tự Tab. Giao diện: nền nhạt đặc,
chữ xám, viền nhạt, không kính, không bóng (xem [Tương phản](#tương-phản-và-các-đánh-đổi-có-chủ-đích)).

### Dùng trong form

`td-button` không phải form-associated, nhưng nó render một `<button>` thật trong light DOM, nên `type` hoạt động với
`<form>` bao quanh như nút thường:

```html
<form id="profile" action="/profile" method="post">
  <td-input-field name="name" label="Họ tên" required></td-input-field>
  <td-button type="submit">Lưu</td-button>
  <td-button type="reset" variant="secondary">Nhập lại</td-button>
  <td-button variant="secondary">Không làm gì với form</td-button>
</form>
```

- `type` mặc định là `button` (bấm **không** submit form). Chỉ nhận `button` | `submit` | `reset`; giá trị khác rơi
  về `button`.
- Nút không có `name`/`value`, nên không gửi dữ liệu gì trong `FormData`.
- Nút `disabled` với `type="submit"` không submit.

### Nút trong bảng, vùng dày đặc hoặc trên bề mặt kính

Trong `.td-table`, trong phần tử có `data-td-density="dense"`, hoặc bên trong một bề mặt kính (`.td-glass-surface`,
ví dụ modal, menu), nút giữ vẻ kính nhưng **bỏ `backdrop-filter` của chính nó** (không lồng kính trong kính, đỡ tốn
hiệu năng khi có nhiều nút):

```html
<div data-td-density="dense">
  <td-button size="sm" variant="secondary">Sửa</td-button>
  <td-button size="sm" variant="danger">Xoá</td-button>
</div>
```

## Attribute

| Attribute | Kiểu | Mặc định | Mô tả |
|---|---|---|---|
| `variant` | string | `primary` | `primary` \| `secondary` \| `success` \| `danger` \| `info` \| `warning`. Giá trị khác → `primary`. |
| `size` | string | `md` | `sm` \| `md` \| `lg` (cao tối thiểu 32 / 40 / 48 px; trên màn cảm ứng tối thiểu 44 px và bo tròn dạng viên thuốc). Giá trị khác → `md`. |
| `label` | string | chữ trong thẻ | Chữ trên nút. Ưu tiên hơn nội dung thẻ. Đổi `label` cập nhật tại chỗ (không mất focus). |
| `icon` | string | — | Tên icon registry (ví dụ `download`). **Deprecated:** giá trị không có trong registry được hiểu là danh sách class (ví dụ `fas fa-edit`) và render `<i>`. |
| `icon-position` | string | `left` | `left` \| `right`. Chỉ `right` có tác dụng; giá trị khác coi như `left`. |
| `loading` | boolean | không | Trạng thái bận: `aria-busy` + `aria-disabled`, spinner, chặn click, **giữ focus**. |
| `disabled` | boolean | không | Disabled native của `<button>`. |
| `full-width` | boolean | không | Nút rộng 100% khung chứa (host thành `display: block`). |
| `color` | string (màu CSS) | — | Nền tuỳ chỉnh, đặc (không kính), ghi đè variant. Qua `safeColor`; không hợp lệ thì bỏ qua. |
| `text-color` | string (màu CSS) | tự động đen/trắng | Màu chữ khi có `color`. Không có `color` thì bị bỏ qua. |
| `type` | string | `button` | `button` \| `submit` \| `reset` (danh sách trắng). |
| `aria-label` | string | — | Chuyển xuống `<button>` bên trong. Bắt buộc với nút chỉ có icon. |

## Property & method

Mỗi attribute ở trên đều có property tương ứng (tên camelCase) phản chiếu attribute: `variant`, `size`, `label`,
`icon`, `iconPosition`, `loading`, `disabled`, `fullWidth`, `color`, `textColor`, `type`, `ariaLabel`. Property kiểu
boolean trả về `true/false`; property chuỗi trả về `''` khi không có attribute. Gán property = đặt attribute.

> Gán property trước khi phần tử gắn vào trang (vừa `createElement`, chưa append — hoặc trước khi module được import)
> vẫn có tác dụng từ 0.16.0. Chi tiết: [Cách hoạt động](../concepts/how-it-works.md).

| Method | Trả về | Mô tả |
|---|---|---|
| `run(fn: () => T \| Promise<T>)` | `Promise<T>` | Chạy `fn` với nút ở trạng thái loading; gỡ loading trong `finally`; trả kết quả / ném lại lỗi. Gọi khi đang chạy → trả về Promise đang chạy. `fn` không phải hàm → reject `TypeError`. (0.13.0) |
| `setLoading(isLoading: boolean)` | `void` | Bật/tắt attribute `loading`. |
| `setDisabled(isDisabled: boolean)` | `void` | Bật/tắt attribute `disabled`. |

Muốn focus nút bằng code, focus phần tử `<button>` bên trong: `el.querySelector('button').focus()` (thẻ
`td-button` tự nó không focus được).

## Event

`td-button` **không phát CustomEvent riêng**. Bạn nghe `click` native của `<button>` bên trong; sự kiện nổi bọt
(bubble) lên thẻ `td-button`, nên gắn listener lên host là đủ:

| Event | detail | Khi nào | bubbles? |
|---|---|---|---|
| `click` (native `MouseEvent`) | — | Người dùng bấm nút (chuột, Enter, Space). Không phát khi `disabled`; bị chặn khi `loading`. | có |

Lưu ý: khi `loading`, click bị chặn ở pha capture trên chính `<button>` (bằng `stopImmediatePropagation`), nên listener
trên host và các phần tử cha ở pha bubble đều không nhận. Listener gắn ở pha capture trên phần tử **cha** thì vẫn chạy
trước khi bị chặn.

## Tuỳ biến giao diện

Token override ở `:root` (hoặc trên một vùng) bằng CSS thường của site. CSS không nằm trong `@layer` của site luôn
thắng các lớp `td.*`. Xem thêm [Theming](../customization/theming.md) và [Styling](../customization/styling.md).

### Token của button

| Token | Mặc định (sáng) | Tác dụng |
|---|---|---|
| `--td-btn-radius` | `var(--td-radius-lg)` | Bo góc (trên màn cảm ứng luôn là viên thuốc `--td-radius-full`). |
| `--td-btn-primary-bg` | `var(--td-accent-fill)` (light #2563eb; dark = accent tối đi 20%) | Màu gốc của primary (dùng làm tint và nền đặc khi tắt kính). Đổi `--td-accent` là đổi theo, cả dark (0.16.0). |
| `--td-btn-primary-fg` | `var(--td-accent-contrast)` (#fff) | Màu chữ primary. |
| `--td-btn-primary-tint` | `var(--td-btn-primary-bg)` | Màu nhuộm kính primary. |
| `--td-btn-primary-alpha` | `94%` | Độ đậm của tint. |
| `--td-btn-primary-film` | `rgb(0 0 0 / 10%)` | Lớp phim làm tối để giữ tương phản chữ. |
| `--td-btn-success-tint` / `-alpha` / `-film` / `-fg` | `#15803d` / `94%` / `rgb(0 0 0 / 13%)` / `#fff` | Success. |
| `--td-btn-danger-tint` / `-alpha` / `-film` / `-fg` | `#b91c1c` / `94%` / `rgb(0 0 0 / 6%)` / `#fff` | Danger. |
| `--td-btn-info-tint` / `-alpha` / `-film` / `-fg` | `#1d4ed8` / `94%` / `rgb(0 0 0 / 6%)` / `#fff` | Info. |
| `--td-btn-warning-tint` / `-alpha` / `-film` / `-fg` | `#f59e0b` / `86%` / `rgb(255 255 255 / 10%)` / `#111113` | Warning: hổ phách sáng + chữ tối. |
| `--td-btn-sheen` | gradient trắng 12% → 3% | Vệt sáng trên nút có màu. |
| `--td-btn-secondary-glass` | `rgb(255 255 255 / 80%)` | Nền kính trắng của secondary (v0.14.3). |
| `--td-btn-secondary-edge` | `var(--td-control-border-soft)` (#d1d1d6) | Viền của secondary. |
| `--td-btn-secondary-bg` | `var(--td-gray-100)` | Nền **đặc** của secondary khi kính bị tắt (trình duyệt không có `color-mix`, reduced transparency, `data-td-glass="off"`, tương phản cao). |
| `--td-btn-disabled-bg` / `-fg` / `-border` | `#f4f4f5` / `#a1a1aa` / `#e4e4e7` | Trạng thái disabled (xám, đặc). |
| `--td-btn-lift` | bóng nhẹ 2 lớp | Bóng nổi của nút. |

Chữ của secondary dùng `--td-glass-fg` (#111113). Hover dùng `--td-glass-glow`, nhấn dùng `--td-glass-press-scale`
(0.97), blur dùng `--td-glass-blur` — đây là token kính chung, xem [Theming](../customization/theming.md).

Theme tối (`<html data-td-theme="dark">`) đổi: `--td-btn-primary-bg` (qua `--td-accent-fill`, accent tối đi 20%, mặc định
≈ #2f68c5), `--td-btn-secondary-glass`
`rgb(40 40 44 / 84%)`, `--td-btn-secondary-edge` `rgb(255 255 255 / 14%)`, `--td-btn-secondary-bg` #2c2c30,
`--td-btn-disabled-bg/-fg/-border` #202024 / #6b6b73 / `rgb(255 255 255 / 6%)`, `--td-btn-lift` đậm hơn. Tint của
success/danger/info/warning giữ nguyên ở cả hai theme.

Ví dụ đổi màu primary theo thương hiệu:

```css
:root {
  --td-btn-primary-bg: #0f766e;
}
```

Sau khi đổi tint, tự kiểm tra tương phản chữ (kit chỉ đo các giá trị mặc định).

### Liquid Glass của button (v0.14.x)

- **Primary / success / danger / info / warning** = kính nhuộm màu (kiểu `.glassProminent` của Apple): tint ở độ đậm
  `--td-btn-*-alpha` + phim tương phản + vệt sáng + viền sáng phía trên + `backdrop-filter` blur.
- **Secondary** = kính trắng 80% với viền mềm `--td-btn-secondary-edge`, không phim xám (v0.14.3 — trước đó
  secondary bị render xám đặc do lỗi độ ưu tiên CSS).
- **Hover** = quầng sáng bên ngoài (glow), không đổi nền phía sau chữ, nên tương phản không đổi. Không hiện glow khi
  nút đang có focus bàn phím (vòng focus luôn nhìn thấy).
- **Nhấn** = thu nhỏ nhẹ (`--td-glass-press-scale`); tắt khi người dùng bật giảm chuyển động.
- **Tự rơi về nền đặc** (không kính, không sheen) khi: `prefers-reduced-transparency: reduce`,
  `<html data-td-glass="off">`, `prefers-contrast: more`, `forced-colors: active`, hoặc trình duyệt không hỗ trợ
  `color-mix()`. Các fallback này dùng biến riêng có `!important`, nên token của site không vô hiệu hoá được chúng.

### Tương phản và các đánh đổi có chủ đích

- Chữ của mọi variant ở trạng thái bình thường đạt **≥ 4.7:1** so với nền hiển thị thật, đo trên nền đen, trắng, ô
  caro và ảnh, ở 3 engine (Chromium, Firefox, WebKit) — cổng kiểm tra `npm run test:contrast`.
- **Disabled cố ý mờ** (v0.14.3): chữ disabled chỉ cần **≥ 2.2:1** (và dưới 3:1) để trông "xám đi" rõ ràng.
  WCAG 1.4.3 / 1.4.11 miễn yêu cầu tương phản cho control không hoạt động. Disabled dùng màu trạng thái đặc, không
  bao giờ dùng `opacity` của cả phần tử (nút mờ trên nền tối sẽ không đọc được).
- **Viền secondary mềm** (~1.5:1) theo `--td-control-border-soft`. Site cần tuân thủ WCAG 1.4.11 nghiêm ngặt (viền
  control ≥ 3:1) đặt:

  ```css
  :root {
    --td-control-border-soft: var(--td-control-border-strong);
    --td-control-border-hover: var(--td-control-border-strong);
  }
  ```

  Lệnh này đổi luôn viền của input, checkbox, toggle, dropdown… và viền secondary button ở theme sáng (theme tối,
  secondary dùng `--td-btn-secondary-edge` riêng; override thêm token đó nếu cần).

## Cấu trúc DOM & class

`td-button` render (light DOM, không Shadow DOM):

```html
<td-button variant="primary" icon="download">
  <button class="td-btn td-btn--primary td-btn--md" type="button">
    <span class="td-btn__icon" data-td-icon="download" data-td-icon-size="s" aria-hidden="true"><svg …></svg></span>
    <span class="td-btn__label">Tải</span>
    <span class="td-btn__spinner td-spinner td-spinner--sm" aria-hidden="true" hidden>
      <svg class="td-spinner__svg" viewBox="0 0 50 50" aria-hidden="true" focusable="false">
        <circle class="td-spinner__track" cx="25" cy="25" r="20"></circle>
        <circle class="td-spinner__arc" cx="25" cy="25" r="20"></circle>
      </svg>
    </span>
  </button>
</td-button>
```

| Class / attribute | Ý nghĩa |
|---|---|
| `.td-btn` | Block nút. |
| `.td-btn--{primary\|secondary\|success\|danger\|info\|warning}` | Variant. |
| `.td-btn--{sm\|md\|lg}` | Size. |
| `.td-btn--full` | `full-width`. |
| `.td-btn--custom` | Đang dùng `color` tuỳ chỉnh (nền đặc từ `--td-btn-bg` / `--td-btn-fg` trên host). |
| `.td-btn__icon` | Ô icon (SVG registry, hoặc `<i>` class cũ). Với `icon-position="right"` nằm sau label. |
| `.td-btn__label` | Chữ. Không có với nút chỉ có icon. |
| `.td-btn__spinner` | Spinner (dùng chung block `.td-spinner`), `hidden` khi không loading. |
| `:disabled` | Trạng thái disabled. |
| `[aria-busy="true"]` | Trạng thái loading. |
| `:focus-visible` | Vòng focus `--td-focus-ring`. |

Biến CSS trên host do JS đặt (CSSOM) khi có `color`: `--td-btn-bg`, `--td-btn-fg`, `--td-btn-hover`.

**Render phía server (PHP/WordPress):** `td.css` style trực tiếp `<button class="td-btn td-btn--primary td-btn--md"
type="button">…</button>`, không cần JS, miễn giữ đúng cấu trúc trên (hợp đồng markup được test ở
`test/contracts/button.html`). Khi đó các tính năng JS (`run()`, loading tự động, icon registry tự điền) không có. Xem
[WordPress & PHP](../guides/wordpress-php.md) và [bảng class cũ](../upgrading/class-map.md).

## Bàn phím & trợ năng

- Là `<button>` native: Tab để tới, Enter hoặc Space để bấm.
- Loading: `aria-busy="true"` + `aria-disabled="true"`, focus giữ nguyên, trình đọc màn hình báo nút đang bận/không
  dùng được. Spinner có `aria-hidden`.
- Disabled: disabled native, ra khỏi thứ tự Tab.
- Icon luôn `aria-hidden`. Nút chỉ có icon phải có `aria-label` (được chuyển xuống `<button>`).
- Vùng bấm trên màn cảm ứng tối thiểu 44 px (`--td-touch-min`).
- Tôn trọng `prefers-reduced-motion` (tắt transition và hiệu ứng nhấn), `prefers-reduced-transparency`,
  `prefers-contrast: more` và `forced-colors` (viền `ButtonText`, bỏ gradient).

Xem [Trợ năng](../guides/accessibility.md).

## Bảo mật

- Chữ (`label` hoặc nội dung thẻ) luôn được escape, chỉ hiện dưới dạng text.
- `color` / `text-color` đi qua `safeColor` rồi được trình duyệt chuẩn hoá; giá trị không phải màu bị bỏ.
- `type` theo danh sách trắng, `icon` class cũ được lọc từng class, nên không chèn được attribute hay HTML.

## Lưu ý & lỗi thường gặp

- **Quên `type="submit"`**: mặc định là `button`, bấm không submit form.
- **Nút chỉ có icon hiện chữ "Button"**: thiếu `aria-label`.
- **Icon không hiện**: tên chưa có trong registry nên bị hiểu là class cũ (xem [phần trên](#icon-kiểu-class-cũ-font-awesome--đã-lỗi-thời)).
- **`text-color` không ăn**: chỉ có tác dụng cùng `color`.
- **Đổi nội dung thẻ sau khi render không cập nhật chữ**: dùng `label`.
- **Quên `catch` khi dùng `run()`**: lỗi của hàm được ném lại, không bắt sẽ thành unhandled rejection.
- **Cần nút mờ đi khi disabled**: đừng tự đặt `opacity`; đổi các token `--td-btn-disabled-*`.

## Xem thêm

- [Theming](../customization/theming.md) — token, theme tối, bật/tắt kính, viền mềm và override WCAG
- [Styling](../customization/styling.md) — `@layer`, override CSS, CSSOM
- [Icons](icons.md) — registry, đăng ký icon riêng
- [Loading](loading.md) — spinner `.td-spinner`, overlay toàn trang
- [Forms](../guides/forms.md) — submit/reset, validation
- [Trợ năng](../guides/accessibility.md)
- [Breaking changes](../upgrading/breaking-changes.md)
