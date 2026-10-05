[Tài liệu](../README.md) › [Components](README.md) › Button

# Button — `<td-button>`

Nút bấm màu đặc (minimal surfaces, 0.20.0): **primary màu đen** (0.21.0; theme tối đảo thành nền sáng chữ đen),
success / danger / info / warning là **màu đặc ngữ nghĩa** (0.36.0: xanh lá / đỏ / xanh dương chữ trắng, vàng hổ phách
**chữ đậm tối**; trước đó là pastel), secondary là
nền xám nhạt có viền mảnh, ghost là nút chữ không nền. Mỗi nút có một bóng mềm. Dùng cho mọi hành động (lưu, gửi form, mở modal…). Cần một
**đường dẫn trông như nút** (chuyển trang, tải file) thì thêm `href`: `td-button` render `<a>` thật (xem
[Nút dạng link](#nút-dạng-link-href)). Nếu cần nút có menu con, dùng [menu](menu.md) gắn vào một `td-button`.

| | |
|---|---|
| Import | `import '@dazzxq/td-components/button';` (class: `import { TdButton } from '@dazzxq/td-components';`) |
| Loại | Custom element |
| Form-associated | không (nhưng nút `<button>` bên trong vẫn submit/reset được form bao quanh, xem [Dùng trong form](#dùng-trong-form)) |
| Từ phiên bản | 0.1.0 (token-native từ 0.7.0, Liquid Glass 0.14.0 → nút đặc từ 0.20.0, `run()` từ 0.13.0, `ghost` + `href` từ 0.17.0, `name`/`value` + alias icon từ 0.18.0, ARIA trạng thái chuyển xuống từ 0.19.0, hydrate SSR tại chỗ từ 0.25.0) |

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
<td-button variant="ghost">Ghost</td-button>

<td-button size="sm">Nhỏ (32px)</td-button>
<td-button size="md">Vừa (40px)</td-button>
<td-button size="lg">Lớn (48px)</td-button>
```

Giá trị không hợp lệ không báo lỗi mà rơi về mặc định: `variant` lạ → `primary`, `size` lạ → `md`.

### Nút ghost

```html
<td-button variant="ghost">Huỷ</td-button>
<td-button variant="ghost" icon="download" href="/bao-cao.pdf" download>Tải báo cáo</td-button>
```

Từ 0.17.0, `ghost` = nền trong suốt, **không blur, không viền, không bóng**, chữ màu accent (`--td-btn-ghost-fg`,
mặc định `var(--td-accent)`). Hover phủ một lớp nền mờ (`--td-btn-ghost-hover-bg`, mặc định `--td-color-hover`), không
glow. Focus bàn phím có vòng focus như mọi nút. Disabled: vẫn trong suốt, chữ xám (`--td-btn-disabled-fg`).
Dùng cho hành động phụ đặt trên **nền trang** (Huỷ, Xem thêm, liên kết trong toolbar). Không đặt ghost trên ảnh/nền
nhiều màu: chữ accent không có nền riêng nên không bảo đảm tương phản ở đó (cổng tương phản chỉ đo ghost trên nền
trắng/đen của theme).

### Nút dạng link (`href`)

```html
<td-button href="/tai-khoan" variant="secondary">Tài khoản</td-button>
<td-button href="https://example.com/huong-dan" target="_blank" icon="external" icon-position="right">Hướng dẫn</td-button>
<td-button href="/files/bao-cao-2026.pdf" download="bao-cao.pdf" variant="ghost" icon="download">Tải báo cáo</td-button>
```

Từ 0.17.0, có `href` → nút bên trong là `<a class="td-btn td-btn--{variant} td-btn--{size}" href="…">` (cùng các phần con
`.td-btn__icon` / `.td-btn__label` / `.td-btn__spinner`), nên middle-click, mở tab mới, copy link… hoạt động như link
thật. Mọi variant, size, `icon`, `full-width`, `color` dùng được như nút thường.

- **`href`** theo danh sách trắng: `https:` (`http:` chỉ khi chính trang là http — không hạ cấp từ HTTPS), đường dẫn tương đối (`/a`, `a/b`, `../x`, `?q=1`), `#…`,
  `mailto:`, `tel:`. Giá trị khác (`javascript:`, `data:`, `file:`…) bị **bỏ** kèm `console.warn`, và link khi đó hành
  xử như disabled.
- **`target`** chỉ nhận `_blank` | `_self` | `_parent` | `_top` (khác → bỏ). `_blank` tự thêm
  `rel="noopener noreferrer"`.
- **`download`** được chuyển xuống `<a>`. Có tên file thì tên được lọc (bỏ `/ \ : * ? " < > |`, ký tự điều khiển và
  dấu chấm đầu tên); `download` rỗng = tên mặc định của trình duyệt.
- `type`, `name`, `value` và form **không** áp cho link (link không submit form).
- Đổi giá trị `href` cập nhật tại chỗ (giữ focus). Thêm/bỏ hẳn `href` → render lại giữa `<button>` và `<a>`.

Trạng thái của link khác nhau, giống ý nghĩa ở `<button>`:

| | `disabled` | `loading` |
|---|---|---|
| `href` trên `<a>` | gỡ (lưu trên host, bỏ `disabled` là khôi phục) | gỡ tạm (không mở tab mới / middle-click được), hết loading là khôi phục |
| Thứ tự Tab | `tabindex="-1"`: ra khỏi thứ tự Tab (như button disabled) | `tabindex="0"`: **giữ focus**, vẫn trong thứ tự Tab |
| ARIA | `role="link"` + `aria-disabled="true"` | `role="link"` + `aria-busy="true"` + `aria-disabled="true"` |
| Click | bị chặn | bị chặn |
| Giao diện | như nút disabled (cùng token `--td-btn-disabled-*`) | spinner, như nút loading |

Có cả `disabled` và `loading` thì disabled thắng (`tabindex="-1"`, giao diện disabled). `run()` dùng được trên link
(bật loading trong lúc chạy).

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
image sort grip`. Từ 0.18.0 nhận cả **tên alias** (giống PHP): `x` → close, `chevron-left/right/up/down` → prev/next/up/down,
`ellipsis` → more, `external-link` → external, `expand` → fullscreen, `pen` → pencil. Bạn có thể đăng ký thêm icon riêng,
xem [Icons](icons.md).

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
- Gõ nhầm tên (ví dụ `icon="edit"`, `icon="donwload"`): từ 0.18.0, giá trị là **một từ kebab-case chữ thường** mà
  không có trong registry (kể cả sau alias) sẽ `console.warn` **một lần cho mỗi tên** (`td-button: unknown icon
  "edit" …`) rồi vẫn đi đường cũ (`<i class="edit">`, rỗng nếu site không có CSS cho class đó). Danh sách class kiểu
  Font Awesome (`fas fa-edit`, có khoảng trắng) không bị cảnh báo. Kiểm tra trước bằng `hasIcon('edit')` từ
  `@dazzxq/td-components/icons`.

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
- Màu tuỳ chỉnh là **nền đặc** như mọi variant (không blur), cùng một bóng `--td-btn-lift`. Màu trong suốt (ví dụ `rgba(0,0,128,.5)`) được
  trộn lên nền trắng thành màu đặc trước khi dùng.
- Nếu không có `text-color`, chữ tự chọn **đen hoặc trắng** theo tỉ lệ tương phản WCAG cao hơn so với nền đó.
- `text-color` **chỉ có tác dụng khi có `color`**. Đặt `text-color` một mình trên nút variant thường sẽ không có gì
  xảy ra (muốn đổi màu chữ của variant, override token, xem [Tuỳ biến giao diện](#tuỳ-biến-giao-diện)).
- Hover của nút màu tuỳ chỉnh (0.20.0) = nền **đặc** đậm hơn: `color-mix(in srgb, <màu> 92%, #000)`, như mọi variant
  (trình duyệt không có `color-mix()` giữ nguyên nền). Với màu nền rất sáng + chữ tối, hover làm tương phản giảm rất
  nhẹ — chọn `color` đủ tương phản dư.

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

`disabled` là disabled native của `<button>` (với link: xem [Nút dạng link](#nút-dạng-link-href)): không click,
không focus, ra khỏi thứ tự Tab. Giao diện: nền nhạt đặc,
chữ xám, viền nhạt, không bóng (xem [Tương phản](#tương-phản-và-các-đánh-đổi-có-chủ-đích)).

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
- `name` / `value` (0.18.0) được chuyển xuống `<button>` bên trong — đó là **submitter thật**, nên submit native và
  `new FormData(form, e.submitter)` có cặp `name=value` của **đúng nút được bấm**. Đổi / gỡ attribute cập nhật tại chỗ
  (gỡ `name` → không gửi gì). Property `el.name` / `el.value` đọc/ghi attribute. Không có `name` thì nút không gửi dữ
  liệu gì. `form` **không** được chuyển xuống (nút luôn thuộc `<form>` bao quanh).

```html
<form method="post" action="/don-hang/12">
  <td-button type="submit" name="action" value="approve" variant="success">Duyệt</td-button>
  <td-button type="submit" name="action" value="reject" variant="danger">Từ chối</td-button>
</form>
<!-- bấm "Từ chối" → POST action=reject -->
```

- Nút `disabled` với `type="submit"` không submit.

### Nút bật/tắt, nút mở menu (ARIA trạng thái, 0.19.0)

`aria-pressed`, `aria-expanded`, `aria-controls`, `aria-haspopup` đặt trên `<td-button>` được **chuyển xuống**
`<button>` / `<a>` bên trong (phần tử có role mà trình đọc màn hình đọc). Đổi attribute → cập nhật tại chỗ (không
render lại, không mất focus); gỡ attribute → gỡ ở dưới. Host vẫn giữ attribute của bạn.

```html
<!-- nút bật/tắt -->
<td-button variant="secondary" aria-pressed="false" id="bold">Đậm</td-button>
<!-- nút mở menu -->
<td-button variant="secondary" aria-haspopup="menu" aria-expanded="false" aria-controls="user-menu">Tài khoản</td-button>
```

```js
const b = document.getElementById('bold');
b.addEventListener('click', () => b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true')));
```

| Attribute | Giá trị được chuyển |
|---|---|
| `aria-pressed` | `true` \| `false` \| `mixed` |
| `aria-expanded` | `true` \| `false` |
| `aria-haspopup` | `true` \| `false` \| `menu` \| `listbox` \| `tree` \| `grid` \| `dialog` |
| `aria-controls` | nguyên văn (danh sách id cách nhau bởi dấu cách); rỗng / toàn khoảng trắng → không chuyển |

Giá trị ngoài danh sách (ví dụ `aria-pressed="yes"`) **không** được chuyển xuống và có `console.warn` một lần. Chỉ
đúng 4 attribute này (và `aria-label`) được chuyển; các `aria-*` khác nằm lại trên host.

### Nút trong bảng, vùng dày đặc hoặc trên bề mặt nổi

Từ 0.20.0 nút không bao giờ có `backdrop-filter`, nên đặt trong `.td-table`, trong `data-td-density="dense"` hay bên trong
modal / menu đều giống nhau, không cần xử lý riêng (`data-td-density` vẫn đặt được, không còn tác dụng với nút):

```html
<div data-td-density="dense">
  <td-button size="sm" variant="secondary">Sửa</td-button>
  <td-button size="sm" variant="danger">Xoá</td-button>
</div>
```

## Responsive (0.34.0)

Nút một dòng khi đủ chỗ; nhãn dài hơn khung chứa **xuống dòng** (cân dòng bằng `text-wrap: balance`) thay vì đẩy rộng
trang hay bị cắt `…` — nhãn hành động bị cắt có thể đổi nghĩa. Nút không bao giờ rộng hơn khung (`max-inline-size:
100%`). Trên máy cảm ứng nút cao ≥ 44px. Xem [responsive](../concepts/responsive.md).

## Attribute

| Attribute | Kiểu | Mặc định | Mô tả |
|---|---|---|---|
| `variant` | string | `primary` | `primary` \| `secondary` \| `success` \| `danger` \| `info` \| `warning` \| `ghost` (0.17.0). Giá trị khác → `primary`. |
| `size` | string | `md` | `sm` \| `md` \| `lg` (cao tối thiểu 32 / 40 / 48 px; trên màn cảm ứng tối thiểu 44 px và bo tròn dạng viên thuốc). Giá trị khác → `md`. |
| `label` | string | chữ trong thẻ | Chữ trên nút. Ưu tiên hơn nội dung thẻ. Đổi `label` cập nhật tại chỗ (không mất focus). |
| `icon` | string | — | Tên icon registry hoặc alias (ví dụ `download`, `external-link` — 0.18.0). **Deprecated:** giá trị không có trong registry được hiểu là danh sách class (ví dụ `fas fa-edit`) và render `<i>`; một từ kebab-case không có trong registry → `console.warn` một lần (0.18.0). |
| `icon-position` | string | `left` | `left` \| `right`. Chỉ `right` có tác dụng; giá trị khác coi như `left`. |
| `loading` | boolean | không | Trạng thái bận: `aria-busy` + `aria-disabled`, spinner, chặn click, **giữ focus**. |
| `disabled` | boolean | không | Disabled native của `<button>`. |
| `full-width` | boolean | không | Nút rộng 100% khung chứa (host thành `display: block`). |
| `color` | string (màu CSS) | — | Nền tuỳ chỉnh, đặc, ghi đè variant. Qua `safeColor`; không hợp lệ thì bỏ qua. |
| `text-color` | string (màu CSS) | tự động đen/trắng | Màu chữ khi có `color`. Không có `color` thì bị bỏ qua. |
| `type` | string | `button` | `button` \| `submit` \| `reset` (danh sách trắng). |
| `aria-label` | string | — | Chuyển xuống `<button>` / `<a>` bên trong. Bắt buộc với nút chỉ có icon. |
| `href` | string (URL) | — | Có → render `<a>` (nút dạng link). Danh sách trắng: `https:` (`http:` chỉ khi trang là http), tương đối, `#`, `mailto:`, `tel:`. 0.17.0. |
| `target` | string | — | Chỉ với `href`: `_blank` \| `_self` \| `_parent` \| `_top`; `_blank` thêm `rel="noopener noreferrer"`. 0.17.0. |
| `download` | string | — | Chỉ với `href`: chuyển xuống `<a download>`; tên file được lọc ký tự đường dẫn. 0.17.0. |
| `name` | string | — | Chuyển xuống `<button>` bên trong (submitter thật, gửi `name=value` khi submit). Không áp cho link. 0.18.0. |
| `value` | string | — | Đi kèm `name`, chuyển xuống `<button>` bên trong. Không áp cho link. 0.18.0. |
| `aria-pressed` | string | — | `true` \| `false` \| `mixed` → chuyển xuống `<button>` / `<a>`. 0.19.0. |
| `aria-expanded` | string | — | `true` \| `false` → chuyển xuống. 0.19.0. |
| `aria-controls` | string (IDREF) | — | Chuyển xuống nguyên văn (rỗng → bỏ). 0.19.0. |
| `aria-haspopup` | string | — | `true` \| `false` \| `menu` \| `listbox` \| `tree` \| `grid` \| `dialog` → chuyển xuống. 0.19.0. |

## Property & method

Mỗi attribute ở trên đều có property tương ứng (tên camelCase) phản chiếu attribute: `variant`, `size`, `label`,
`icon`, `iconPosition`, `loading`, `disabled`, `fullWidth`, `color`, `textColor`, `type`, `ariaLabel`, `href`,
`target`, `download`, `name`, `value` (0.18.0). Property kiểu
boolean trả về `true/false`; property chuỗi trả về `''` khi không có attribute. Gán property = đặt attribute.

> Gán property trước khi phần tử gắn vào trang (vừa `createElement`, chưa append — hoặc trước khi module được import)
> vẫn có tác dụng từ 0.16.0. Chi tiết: [Cách hoạt động](../concepts/how-it-works.md).

| Method | Trả về | Mô tả |
|---|---|---|
| `run(fn: () => T \| Promise<T>)` | `Promise<T>` | Chạy `fn` với nút ở trạng thái loading; gỡ loading trong `finally`; trả kết quả / ném lại lỗi. Gọi khi đang chạy → trả về Promise đang chạy. `fn` không phải hàm → reject `TypeError`. (0.13.0) |
| `setLoading(isLoading: boolean)` | `void` | Bật/tắt attribute `loading`. |
| `setDisabled(isDisabled: boolean)` | `void` | Bật/tắt attribute `disabled`. |

Muốn focus nút bằng code, focus phần tử `.td-btn` bên trong: `el.querySelector('.td-btn').focus()` (thẻ
`td-button` tự nó không focus được; với `href` phần tử đó là `<a>`).

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
| `--td-btn-primary-bg` | `#18181b` (đen; dark `#f4f4f5`) | Nền đặc của primary (0.21.0: đen, **không** theo accent nữa — xem [Đưa primary về màu accent](#đưa-primary-về-màu-accent)). |
| `--td-btn-primary-fg` | `#fff` (dark `#18181b`) | Màu chữ primary. |
| `--td-btn-primary-hover` | `#3f3f46` (dark `#d4d4d8`) | Nền primary khi hover (0.21.0) — đen không đậm hơn được nên hover **sáng lên**. |
| `--td-btn-primary-border` | `transparent` | Viền primary (0.21.0). |
| `--td-btn-success-bg` / `-fg` / `-border` / `-hover` | `var(--td-solid-success-*)`: `#15803d` / `#fff` / `#166534` / `#166534` | Success đặc (0.36.0; 0.21–0.35 pastel). |
| `--td-btn-danger-bg` / `-fg` / `-border` / `-hover` | `var(--td-solid-danger-*)`: `#dc2626` / `#fff` / `#b91c1c` / `#b91c1c` | Danger đặc. |
| `--td-btn-info-bg` / `-fg` / `-border` / `-hover` | `var(--td-solid-info-*)`: `#2563eb` / `#fff` / `#1d4ed8` / `#1d4ed8` | Info đặc. |
| `--td-btn-warning-bg` / `-fg` / `-border` / `-hover` | `var(--td-solid-warning-*)`: `#f59e0b` / `#18181b` / `#d97706` / `#d97706` | Warning đặc, **chữ tối** (vàng + chữ trắng không bao giờ đạt tương phản). |
| `--td-btn-secondary-bg` / `-fg` | `var(--td-gray-100)` / `var(--td-gray-900)` | Nền đặc + chữ của secondary. |
| `--td-btn-secondary-border` | `rgb(0 0 0 / 12%)` | Viền mảnh của secondary. |
| `--td-btn-secondary-hover` | `var(--td-gray-200)` | Nền secondary khi hover. |
| `--td-btn-disabled-bg` / `-fg` / `-border` | `#f4f4f5` / `#a1a1aa` / `#e4e4e7` | Trạng thái disabled (xám, đặc, không bóng). |
| `--td-btn-lift` | `0 1px 3px rgb(0 0 0 / 10%), 0 4px 10px -2px rgb(0 0 0 / 12%)` (0.21.0: rõ hơn) | **Bóng duy nhất** của nút (ghost / disabled không có). |
| `--td-btn-ghost-fg` | `var(--td-accent)` (#2563eb; dark #3b82f6) | Màu chữ/icon của ghost (0.17.0). |
| `--td-btn-ghost-hover-bg` | `var(--td-color-hover)` (`rgb(0 0 0 / 5%)`; dark `rgb(255 255 255 / 6%)`) | Nền khi hover của ghost (0.17.0). |

**Hover (0.21.0):** mỗi variant có nền đọc token `--td-btn-{v}-hover` của nó (primary `#3f3f46`, ngữ nghĩa = bậc đậm
hơn một nấc — 0.36.0, chữ vẫn ≥ 4.7:1, secondary `--td-btn-secondary-hover`). Nút màu tuỳ chỉnh (`color`) và alias `-tint` vẫn hover bằng
`color-mix(in srgb, <nền> 92%, #000)`. **Đổi `-bg` thì đặt kèm `-hover`**: kit không tự suy hover từ `-bg` của site,
nên nếu chỉ đổi `-bg`, hover vẫn là màu mặc định — trông lệch tông.

Theme tối (`<html data-td-theme="dark">`) đổi: primary **đảo** (`--td-btn-primary-bg` `#f4f4f5`, `-fg` `#18181b`,
`-hover` `#d4d4d8` — nền đen sẽ chìm vào trang tối), nút ngữ nghĩa **giữ cùng màu đặc** như theme sáng (0.36.0),
`--td-btn-secondary-bg` /
`-fg` / `-border` / `-hover` #2c2c30 / #f5f5f7 / `rgb(255 255 255 / 12%)` / #3a3a3e, `--td-btn-disabled-bg/-fg/-border`
#202024 / #6b6b73 / `rgb(255 255 255 / 6%)`, `--td-btn-lift` đậm gấp đôi (20 % / 24 %).

Bảng màu đặc dùng chung (`--td-solid-{success,danger,warning,info}-bg/-fg/-hover/-border`, cũng cho badge): xem
[Theming › Màu ngữ nghĩa đặc](../customization/theming.md#màu-ngữ-nghĩa-đặc-0360). Muốn **trả nút về pastel** như
0.21–0.35: đoạn CSS ở [Thay đổi phá vỡ › 0.36.0](../upgrading/breaking-changes.md#0360). Nút chỉ có icon dạng nút
thao tác (sửa / xoá / xem… như dcms2): dùng [`<td-action-button>`](action-button.md).

#### Đưa primary về màu accent

Trước 0.21.0 primary theo `--td-accent`. Muốn quay lại (đặt đủ nền, chữ **và** hover — chữ mặc định ở dark là `#18181b`):

```css
:root {
  --td-btn-primary-bg: var(--td-accent-fill);
  --td-btn-primary-fg: var(--td-accent-contrast);
  --td-btn-primary-hover: color-mix(in srgb, var(--td-accent-fill) 92%, #000);
}
```

Một khối `:root` không layer là đủ cho **cả hai theme** (CSS không layer của site thắng khối dark nằm trong
`@layer td.tokens` của kit), và `--td-accent-fill` tự tối đi 20 % ở theme tối nên chữ trắng vẫn đọc được.

Ví dụ màu thương hiệu bất kỳ:

```css
:root {
  --td-btn-primary-bg: #0f766e;
  --td-btn-primary-hover: #115e59;
}
```

Sau khi đổi màu nền, tự kiểm tra tương phản chữ (kit chỉ đo các giá trị mặc định).

**Token deprecated (0.20.0)** — vẫn khai báo nhưng không tác dụng: `--td-btn-{v}-alpha`, `--td-btn-{v}-film`,
`--td-btn-sheen`, `--td-btn-secondary-glass` (→ `--td-btn-secondary-bg`), `--td-btn-secondary-edge` (→
`--td-btn-secondary-border`). **Alias một chu kỳ:** `--td-btn-{primary,success,danger,info,warning}-tint` nếu site còn
đặt thì vẫn thành nền **và viền** nút, hover = nền đậm 8 % (`color-mix`); chữ vẫn là `--td-btn-{v}-fg` — từ 0.21.0
chữ mặc định của variant ngữ nghĩa là màu đậm (cho nền pastel); từ 0.36.0 là trắng (warning: `#18181b`) cho nền đặc —
site dùng `-tint` thì kiểm lại `--td-btn-{v}-fg` cho hợp nền của mình. Nên đổi sang `--td-btn-{v}-bg` + `-hover`.

### Giao diện của button (0.20.0 — minimal surfaces)

- **Mọi variant có nền** = màu **đặc** `--td-btn-{v}-bg` + viền `--td-btn-{v}-border` (0.36.0: ngữ nghĩa đặc, viền = bậc
  hover; primary trong suốt) + **một** bóng `--td-btn-lift`. Không blur, không phim, không vệt sáng, không viền sáng.
- **Hover** = nền đặc khác, đọc `--td-btn-{v}-hover` (0.21.0). Không glow, không phóng to.
- **Nhấn** = không thu nhỏ (bỏ press scale).
- **Focus bàn phím** = vòng `--td-focus-ring` (giữ).
- **Ghost / disabled** = không bóng.
- `prefers-contrast: more`: viền `currentcolor`, bỏ bóng. `forced-colors: active`: viền `ButtonText`, bỏ bóng. Các
  fallback này dùng biến riêng có `!important`, nên token của site không vô hiệu hoá được chúng.
- Trước 0.20.0 (0.14.0–0.19.x) nút là "kính nhuộm màu" (tint trong suốt + phim + sheen + blur, glow khi hover).

### Tương phản và các đánh đổi có chủ đích

- Chữ của mọi variant ở trạng thái bình thường đạt **≥ 4.7:1** so với nền hiển thị thật, đo trên nền đen, trắng, ô
  caro và ảnh, ở 3 engine (Chromium, Firefox, WebKit) — cổng kiểm tra `npm run test:contrast`.
- **Ghost** không có nền riêng nên chỉ được đo trên nền trang của theme: trắng (light, ≈ 5.2:1) và đen (dark,
  ≈ 5.7:1). Khi hover, lớp `--td-color-hover` làm tương phản giảm nhẹ (light ≈ 4.6:1 trên trắng, ≈ 4.5:1 trên nền
  `--td-color-bg` #fbfbfa); site cần dư hơn thì đặt `--td-btn-ghost-fg` đậm hơn (ví dụ `#1d4ed8`).
- **Disabled cố ý mờ** (v0.14.3): chữ disabled chỉ cần **≥ 2.2:1** (và dưới 3:1) để trông "xám đi" rõ ràng.
  WCAG 1.4.3 / 1.4.11 miễn yêu cầu tương phản cho control không hoạt động. Disabled dùng màu trạng thái đặc, không
  bao giờ dùng `opacity` của cả phần tử (nút mờ trên nền tối sẽ không đọc được).
- **Viền secondary mảnh** (0.20.0): `--td-btn-secondary-border` (`rgb(0 0 0 / 12%)`, dark `rgb(255 255 255 / 12%)`),
  token riêng của button — **không** theo `--td-control-border-soft`. Site cần tuân thủ WCAG 1.4.11 nghiêm ngặt (viền
  control ≥ 3:1) đặt thẳng token này (một khối `:root` không layer là đủ cho cả hai theme, vì
  `--td-control-border-strong` tự có giá trị dark):

  ```css
  :root {
    --td-btn-secondary-border: var(--td-control-border-strong);
  }
  ```

  Viền của input, checkbox, toggle, dropdown… thì map `--td-control-border-soft` / `-hover` (xem
  [Theming › Viền control mềm](../customization/theming.md#viền-control-mềm-và-override-chuẩn-wcag-nghiêm-ngặt)).

## Cấu trúc DOM & class

`td-button` render (light DOM, không Shadow DOM):

```html
<td-button variant="primary" icon="download">
  <button class="td-btn td-btn--primary td-btn--md" type="button">
    <span class="td-btn__icon" data-td-icon="download" data-td-icon-size="s" aria-hidden="true"><svg class="td-icon td-icon--s" data-icon="download" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/></svg></span>
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
| `.td-btn--{primary\|secondary\|success\|danger\|info\|warning\|ghost}` | Variant. |
| `.td-btn--{sm\|md\|lg}` | Size. |
| `.td-btn--full` | `full-width`. |
| `.td-btn--custom` | Đang dùng `color` tuỳ chỉnh (nền đặc từ `--td-btn-bg` / `--td-btn-fg` trên host). |
| `.td-btn__icon` | Ô icon (SVG registry, hoặc `<i>` class cũ). Với `icon-position="right"` nằm sau label. |
| `.td-btn__label` | Chữ. Không có với nút chỉ có icon. |
| `.td-btn__spinner` | Spinner (dùng chung block `.td-spinner`), `hidden` khi không loading. |
| `:disabled` | Trạng thái disabled (`<button>`). |
| `[aria-disabled="true"]` không kèm `aria-busy` | Trạng thái disabled của link `<a class="td-btn">` (0.17.0). |
| `[aria-busy="true"]` | Trạng thái loading. |
| `:focus-visible` | Vòng focus `--td-focus-ring`. |

Biến CSS trên host do JS đặt (CSSOM) khi có `color`: `--td-btn-bg`, `--td-btn-fg`, `--td-btn-hover`.

Nút dạng link (`href`, 0.17.0) có cùng cấu trúc con, chỉ khác thẻ ngoài:

```html
<td-button href="/tai-khoan" target="_blank">
  <a class="td-btn td-btn--primary td-btn--md" target="_blank" rel="noopener noreferrer" href="/tai-khoan">
    <span class="td-btn__label">Tài khoản</span>
    <span class="td-btn__spinner td-spinner td-spinner--sm" aria-hidden="true" hidden><svg class="td-spinner__svg" viewBox="0 0 50 50" aria-hidden="true" focusable="false"><circle class="td-spinner__track" cx="25" cy="25" r="20"></circle><circle class="td-spinner__arc" cx="25" cy="25" r="20"></circle></svg></span>
  </a>
</td-button>
<!-- disabled: <a class="td-btn …" role="link" aria-disabled="true" tabindex="-1"> (không href) -->
<!-- loading:  <a class="td-btn …" role="link" aria-disabled="true" aria-busy="true" tabindex="0"> (không href) -->
```

**Render phía server (PHP/WordPress):** dùng `td_button()` / `td_link()` của [adapter PHP](../guides/php-adapter.md#td_button-và-td_link)
(`php/td.php`) — in `<button class="td-btn …">` / `<a class="td-btn …">` native đúng cấu trúc bên trong ở trên, icon đã
vẽ sẵn, `td.css` style trực tiếp, không cần JS:

```php
<?= td_button('Tải', ['variant' => 'primary', 'icon' => 'download']) ?>
<?= td_link('Tài khoản', '/tai-khoan', ['variant' => 'primary']) ?>
```

Không dùng PHP thì in tay đúng khối `<button class="td-btn …">` ở trên (icon: `td_icon()`, slot `data-td-icon` +
`fillIconSlots()`, hoặc geometry từ `icons.json` — xem [Icons](icons.md#icon-trong-markup-render-sẵn)). Markup tĩnh không
có các tính năng JS (`run()`, loading tự động). Các file `test/contracts/*.html` trong repo kit chỉ là **fixture test** (không nằm trong gói npm, icon trong đó viết tắt) — đừng copy từ đó. Xem thêm [WordPress & PHP](../guides/wordpress-php.md) và
[bảng class cũ](../upgrading/class-map.md).

### Hợp đồng SSR `button@1` — hydrate tại chỗ (0.25.0)

Muốn **cả** nút có dáng ngay khi chưa có JS **và** đủ tính năng component (`loading`, `run()`, đổi attribute…) mà
không bị "nháy" chữ trần lúc module tải: dùng [chế độ element của adapter PHP](../guides/php-adapter.md#chế-độ-element-ssr--hydrate-tại-chỗ-0250)
(`'element' => true` hoặc `Td::configure(…, ['ssr_elements' => true])`). PHP in host đánh dấu + đúng control mà
`td-button` sẽ tự render:

```html
<td-button data-td-ssr="button@1" variant="primary" size="md" label="Lưu" type="submit" name="action" value="save">
  <button class="td-btn td-btn--primary td-btn--md" type="submit" name="action" value="save"><span class="td-btn__label">Lưu</span><span class="td-btn__spinner td-spinner td-spinner--sm" aria-hidden="true" hidden>…</span></button>
</td-button>
```

Khi module nạp, `td-button` **nhận** markup đó thay vì render lại:

- **Điều kiện nhận** (`canHydrate()`): host có `data-td-ssr="button@1"`; con trực tiếp duy nhất là `.td-btn`; cấu trúc
  bằng đúng cái `render()` sẽ sinh ra với attribute **hiện tại** của host (đọc sau khi đã áp property gán sớm, kể cả
  attribute đổi trước khi define): thẻ (`<a>` ⇔ host có `href`), class variant / size / `full-width`, `type`,
  `target` / `rel` / `download`, icon (tên registry + vị trí), text nhãn, spinner. Host có `color` / `text-color` →
  không nhận. Mọi node được giữ (control, nhãn, ô icon, spinner) chỉ được mang attribute trong **allowlist** đúng với
  những gì helper PHP / `render()` sinh ra — có `on*`, `style`, `formaction`, `form*`, `popovertarget`… → không nhận,
  render lại sạch (hydrate chỉ tin markup của helper kit).
- **Trạng thái áp tại chỗ** (không render lại): `loading`, `disabled`, `name` / `value`, `aria-label`,
  `aria-pressed` / `aria-expanded` / `aria-haspopup` / `aria-controls`, giá trị `href`, spinner `hidden`. Không phát
  sự kiện nào.
- **Giữ nguyên:** node `<button>` / `<a>` (ai đang giữ tham chiếu vẫn đúng), focus, kích thước (không xô layout).
- **Không khớp** → render như cũ, không lỗi. `data-td-ssr` bị gỡ sau lần kết nối đầu (nhận hay không).
- **Gỡ ra rồi gắn lại** (di chuyển node): từ 0.25.0 `td-button` **gắn lại listener tại chỗ**, không render lại (giữ
  node, không nhân đôi listener — kể cả khi attribute cấu trúc đổi trong lúc tách khỏi trang) — áp cho mọi
  `td-button`, kể cả tạo bằng JS. Trước khi gắn lại, markup được **kiểm lại** (`canRebind()`): bị sửa lúc tách
  (cấu trúc, hoặc attribute ngoài allowlist như `formaction`, `style`) → render lại.
- Link SSR có `tabindex` / `role` riêng (qua `attrs` của `td_link`): giữ khi hydrate, `loading` / `disabled` tạm ghi
  đè, tắt state thì **khôi phục** giá trị riêng đó.
- `<td-button>` tạo bằng JS hoặc viết tay **không** có dấu: không đổi gì (render như trước). Trước khi module nạp,
  host viết tay được `td.css` giữ chỗ chiều cao (`min-height` 2.5rem; `size="sm"` 2rem, `size="lg"` 3rem) để đỡ xô
  layout — nhưng chỉ SSR mới hết nháy hẳn.

`TdButton.SSR_SCHEMA` (= `1`) là phiên bản **cấu trúc markup**, không phải phiên bản gói; chỉ tăng khi giả định
hydrate đổi.

## Bàn phím & trợ năng

- Là `<button>` native: Tab để tới, Enter hoặc Space để bấm. Có `href` thì là `<a>` native: Tab để tới, Enter để
  mở (Space cuộn trang như mọi link).
- Link disabled / loading: `href` bị gỡ nên thêm `role="link"` để vẫn được đọc là link (kèm `aria-disabled`).
- Loading: `aria-busy="true"` + `aria-disabled="true"`, focus giữ nguyên, trình đọc màn hình báo nút đang bận/không
  dùng được. Spinner có `aria-hidden`.
- Disabled: disabled native, ra khỏi thứ tự Tab.
- Icon luôn `aria-hidden`. Nút chỉ có icon phải có `aria-label` (được chuyển xuống `<button>`).
- Nút bật/tắt / nút mở menu: đặt `aria-pressed` / `aria-expanded` / `aria-controls` / `aria-haspopup` trên host, kit
  chuyển xuống control bên trong (0.19.0, xem [mục trên](#nút-bậttắt-nút-mở-menu-aria-trạng-thái-0190)). Site tự
  cập nhật giá trị khi trạng thái đổi.
- Vùng bấm trên màn cảm ứng tối thiểu 44 px (`--td-touch-min`).
- Tôn trọng `prefers-reduced-motion` (tắt transition và hiệu ứng nhấn), `prefers-reduced-transparency`,
  `prefers-contrast: more` và `forced-colors` (viền `ButtonText`, bỏ gradient).

Xem [Trợ năng](../guides/accessibility.md).

## Bảo mật

- Chữ (`label` hoặc nội dung thẻ) luôn được escape, chỉ hiện dưới dạng text.
- `color` / `text-color` đi qua `safeColor` rồi được trình duyệt chuẩn hoá; giá trị không phải màu bị bỏ.
- `type` theo danh sách trắng, `icon` class cũ được lọc từng class, nên không chèn được attribute hay HTML.
- ARIA trạng thái (0.19.0): giá trị theo danh sách trắng; `aria-controls` ghi bằng `setAttribute` (chỉ là text của
  attribute, không thành HTML).
- `href` theo danh sách trắng giao thức (`https:`; `http:` chỉ khi trang là http; tương đối, `#`, `mailto:`, `tel:`), chuẩn hoá như trình duyệt trước
  khi kiểm (bỏ ký tự điều khiển/khoảng trắng hai đầu, tab/xuống dòng ở giữa: `" java\tscript:"` vẫn bị chặn).
  `target` theo danh sách trắng, `_blank` luôn có `rel="noopener noreferrer"`; tên file `download` được lọc.

## Cảm ứng

- Hover chỉ áp trên con trỏ mịn (chuột / trackpad); trên điện thoại không có màu hover sau khi chạm.
- Hình nhấn: nền đặc thêm một bậc (`--td-btn-{v}-pressed`; ghost `--td-btn-ghost-pressed`; `--custom` tối 16 %), chỉ đổi màu, áp ngay khi ngón chạm (cả iPhone).
- Vùng chạm ≥ 44 px trên con trỏ thô (đã có từ 0.34).

Chuẩn chung: [Cảm ứng](../guides/touch.md).

## Lưu ý & lỗi thường gặp

- **Quên `type="submit"`**: mặc định là `button`, bấm không submit form.
- **Nút chỉ có icon hiện chữ "Button"**: thiếu `aria-label`.
- **Icon không hiện**: tên chưa có trong registry nên bị hiểu là class cũ (xem [phần trên](#icon-kiểu-class-cũ-font-awesome--đã-lỗi-thời)).
- **`text-color` không ăn**: chỉ có tác dụng cùng `color`.
- **Đổi nội dung thẻ sau khi render không cập nhật chữ**: dùng `label`.
- **Trang PHP: nút hiện chữ trần rồi mới thành nút**: đang in `<td-button>Nhãn</td-button>` tay — dùng chế độ element
  của `td_button()` ([hợp đồng SSR](#hợp-đồng-ssr-button1--hydrate-tại-chỗ-0250)).
- **Quên `catch` khi dùng `run()`**: lỗi của hàm được ném lại, không bắt sẽ thành unhandled rejection.
- **Cần nút mờ đi khi disabled**: đừng tự đặt `opacity`; đổi các token `--td-btn-disabled-*`.

## Xem thêm

- [Theming](../customization/theming.md) — token, theme tối, bật/tắt blur, viền mềm và override WCAG
- [Styling](../customization/styling.md) — `@layer`, override CSS, CSSOM
- [Icons](icons.md) — registry, đăng ký icon riêng
- [Loading](loading.md) — spinner `.td-spinner`, overlay toàn trang
- [Forms](../guides/forms.md) — submit/reset, validation
- [Trợ năng](../guides/accessibility.md)
- [Breaking changes](../upgrading/breaking-changes.md)
