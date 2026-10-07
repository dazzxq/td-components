[Tài liệu](../README.md) › [Components](README.md) › Hint

# Gợi ý dưới ô — `helper-text` và `<td-hint>`

Một dòng chỉ dẫn ngắn (1–2 câu) dưới một ô nhập: định dạng mong đợi, giới hạn, lý do cần thông tin. Từ 0.54.0 **mọi**
form control của kit có cùng một gợi ý (`helper-text`) với cùng DOM, cùng token, cùng luật với lỗi; `<td-hint>` thêm hai
việc mà chữ thường không làm được:

- gợi ý có **nội dung giàu** (link, `<code>`) cho control của kit;
- gợi ý cho control **không phải của kit** (`<input>`, `<select>` của site, một nhóm tự làm).

| | |
|---|---|
| Import | `import '@dazzxq/td-components/hint'` (class: `import { TdHint } from '@dazzxq/td-components'`) — chỉ cần cho `<td-hint for>`; `helper-text` có sẵn trong mọi control |
| Loại | Custom element (không render: con của nó là nội dung của trang) |
| Form-associated | không |
| Từ phiên bản | 0.54.0 |

Cần `td.css` trên trang (xem [Cài đặt](../getting-started/installation.md)).

## Ví dụ nhanh

```html
<!-- 1. chữ thường: mọi control của kit -->
<td-input-field name="tax" label="Mã số thuế" helper-text="10 hoặc 13 chữ số"></td-input-field>
<td-dropdown name="city" label="Thành phố" helper-text="Nơi giao hàng"></td-dropdown>
<td-toggle name="notify" label="Nhận email" helper-text="Tối đa một email mỗi tuần"></td-toggle>

<!-- 2. nội dung giàu: <td-hint> là CON của control -->
<td-input-field name="slug" label="Đường dẫn">
  <td-hint>Chỉ chữ thường và <code>-</code>. Xem <a href="/huong-dan/slug">hướng dẫn</a>.</td-hint>
</td-input-field>

<!-- 3. control của site: <td-hint for="id"> đứng riêng -->
<label for="note">Ghi chú giao hàng</label>
<textarea id="note" name="note" aria-describedby="note-hint"></textarea>
<td-hint for="note" id="note-hint">Không ghi số điện thoại ở đây.</td-hint>

<script type="module">
  import '@dazzxq/td-components/input-field';
  import '@dazzxq/td-components/hint';
</script>
```

## Cách dùng

### `helper-text` trên mọi form control

Có trên cả 19 form control: input-field, number-input, choice-group, media-field, media-gallery, dropdown,
chip-input, tree-select, datetime-picker, datetime-range, color-picker, slider, otp-input, scan-input, check-matrix,
dropzone, tree, checkbox, toggle.

```js
const f = document.querySelector('td-dropdown');
f.helperText = 'Nơi giao hàng';      // = setAttribute('helper-text', …)
f.setHelper('Đang tải danh sách…');  // runtime; setHelper('') = ẩn
f.helperMessage;                     // chữ đang áp ('' = không có)
```

- Đổi `helper-text` / `setHelper()` cập nhật **tại chỗ**: không render lại, focus và vị trí con trỏ giữ nguyên.
- Luật "đặt sau cùng thắng" (như lỗi): `setHelper()` thay attribute; đặt attribute sau đó lại thay `setHelper()`.
- Chữ luôn là **text** (gán bằng `textContent`), không bao giờ là HTML. Cần link / `<code>` → `<td-hint>` con.
- Gợi ý nằm ngay dưới control, **trước** dòng lỗi. input-field / number-input / choice-group: trong footer (cùng hàng
  với bộ đếm ký tự). Checkbox / toggle: thẳng **dưới chữ nhãn** (không dưới ô tick / công tắc), không nhãn thì dưới
  control.

### Có lỗi thì gợi ý ẩn

Khi control hiện lỗi (`error-text`, `setError()`, lỗi validate), gợi ý **ẩn** và **rời khỏi** mô tả của control
(`aria-describedby`); hết lỗi (`clearError()`, reset form) gợi ý trở lại. Một chỗ chữ dưới ô, không hai dòng chồng nhau.

Vì thế hãy viết **chữ lỗi tự đủ nghĩa**: "Mã số thuế phải có 10 hoặc 13 chữ số" thay vì "Sai định dạng" — lúc lỗi người
dùng không còn thấy gợi ý "10 hoặc 13 chữ số".

Luật này áp cho 18 control có error contract. `<td-check-matrix>` không có lỗi riêng nên gợi ý của nó luôn hiện.

### Nội dung giàu: `<td-hint>` là con của control

```html
<td-color-picker name="brand" label="Màu thương hiệu">
  <td-hint>Dạng <code>#RRGGBB</code>. Bảng màu gợi ý: <a href="/brand">brand book</a>.</td-hint>
</td-color-picker>
```

- Control lấy `<td-hint>` con **trực tiếp** đầu tiên (không có `for`) ra **trước** lần render đầu và gắn nó vào đúng
  chỗ của gợi ý (giữ nguyên node của bạn — không clone, không đọc `innerHTML`). Nó sống qua mọi lần control render lại.
- Nó **thắng** `helper-text` (cảnh báo trong console khi có cả hai) và theo **cùng luật lỗi** — kit đặt
  `data-td-suppressed` (không đụng `hidden` của bạn).
- Id: giữ id của bạn; không có thì nhận id gợi ý của control (`{id}-note`; media-field / media-gallery: `{id}-help`).
  Chỉ một phần tử mang id đó.
- Gỡ `<td-hint>` khỏi DOM → gợi ý chữ (`helper-text`, nếu có) trở lại.
- Thêm `<td-hint>` con **sau** khi control đã chạy thì không được nhận — khai báo ngay trong markup, hoặc dùng
  `<td-hint for>` đứng riêng.

### Control của site: `<td-hint for="id">`

```html
<select id="ship" name="ship" aria-describedby="ship-hint">…</select>
<td-hint for="ship" id="ship-hint">Giao trong 2–4 ngày làm việc.</td-hint>
```

- Sau khi module chạy, hint **tự thêm** id của nó vào `aria-describedby` của phần tử có id = `for` (giữ các id có sẵn,
  không thêm trùng) và **gỡ đúng id đó** khi bị gỡ khỏi DOM, khi đổi `for`, khi đổi id, khi bị `hidden`.
- Đích xuất hiện **sau** (render bằng JS), bị đổi id, bị gỡ, bị thay bằng phần tử khác cùng id: hint tự theo (một
  `MutationObserver` dùng chung cho mỗi document / shadow root, chỉ sống khi còn `<td-hint for>` trong đó).
- Đích phải cùng **tree scope** với hint (cùng document, hoặc cùng một shadow root mở) — IDREF của ARIA không vượt
  shadow root. Khác scope → không liên kết + cảnh báo một lần.
- Đích là **control của kit** (`<td-dropdown id="city">`): hint vào mô tả của control **bên trong** (trigger / ô nhập),
  sống qua render lại và theo luật lỗi của control. Thường bạn chỉ cần `helper-text` hoặc `<td-hint>` con — `for` hữu
  ích khi gợi ý phải đặt ở chỗ khác trong layout.
- Đích là phần tử khác (input native…): kit **không** biết lỗi của nó — hint không tự ẩn khi đích có `aria-invalid`.
  Muốn cùng luật: tự đặt `hint.hidden = true` khi hiện lỗi.

### Không JS

`<td-hint>` có kiểu theo **tên thẻ** trong `td.css`: trông y hệt trước và sau khi module chạy, không nháy. Không JS thì
kit không sửa được `aria-describedby` của control — **tự in** nó trong markup (`aria-describedby="note-hint"` như ví dụ);
khi module chạy, id đã có nên không bị thêm trùng.

## PHP

```php
// gợi ý cho control của kit: option 'helper_text' (mọi td_* form helper)
echo td_field('tax', '', ['label' => 'Mã số thuế', 'helper_text' => '10 hoặc 13 chữ số', 'element' => true]);
echo td_dropdown('city', $cities, '', ['label' => 'Thành phố', 'helper_text' => 'Nơi giao hàng']);

// control của site: td_hint($for, $content, $o) — id mặc định "{for}-hint"
echo '<textarea id="note" name="note" aria-describedby="note-hint"></textarea>';
echo td_hint('note', 'Không ghi số điện thoại ở đây.');
echo td_hint('slug', Td::html('Xem <a href="/huong-dan/slug">hướng dẫn</a>')); // markup CỦA SITE, không phải input người dùng
```

- `$content` là chuỗi → **chữ** (escape). Markup chỉ qua `Td::html($markup)` (wrapper tin cậy tường minh, như
  `td_carousel`) — template của site tự escape dữ liệu bên trong; **không bao giờ** bọc nội dung người dùng nhập.
- Options: `id` (mặc định `{for}-hint`), `class`, `attrs` (allowlist; `for` / `id` / `class` / `data-td-*` bị giữ).
- `$for` rỗng / có khoảng trắng → không in gì + một cảnh báo cố định.
- Chi tiết `helper_text` từng helper: [PHP adapter](../guides/php-adapter.md#gợi-ý-helper_text-054).

## Attribute

| Attribute | Kiểu | Mặc định | Mô tả |
|---|---|---|---|
| `for` | string | — | Id của phần tử được mô tả (cùng tree scope). Không có `for` + là con trực tiếp của form control kit → gợi ý giàu của control đó |
| `hidden` | boolean | — | Của trang: luôn thắng (ẩn + rời khỏi mô tả) |

Attribute nội bộ `data-td-suppressed`: kit đặt khi control được mô tả đang hiện lỗi. Không tự đặt.

Trên mọi form control: `helper-text` (string) — xem trang của từng control.

## Property & method

| | Mô tả |
|---|---|
| `htmlFor` | Đọc / ghi attribute `for` |
| `control` | Chỉ đọc: phần tử đang được mô tả (`<td-hint for>`), `null` khi chưa liên kết |

Trên mọi form control: `helperText` (phản chiếu `helper-text`), `setHelper(msg)`, `helperMessage` (chỉ đọc).

## Tuỳ biến giao diện

| Token | Mặc định | Dùng cho |
|---|---|---|
| `--td-field-note` | `--td-color-text-muted` | Màu chữ gợi ý (ghi chú của control và `<td-hint>`), ≥ 4.7:1 trên mọi bề mặt (gate contrast) |

Cỡ chữ `--td-text-xs` (cảm ứng: `--td-text-sm`, ≥ 14 px), cách control `--td-space-2xs`. Link trong `<td-hint>` lấy màu
chữ gợi ý + gạch chân; `<code>` dùng `--td-font-mono`.

## Cấu trúc DOM & class

```html
<!-- ghi chú chữ của control (control mới; input-field / number-input / choice-group: trong .td-field__footer) -->
<div class="td-field__note" id="{host-id}-note" [hidden]>…</div>
<!-- media-field / media-gallery giữ DOM cũ (contract @1) -->
<span class="td-media-field__help" id="{id}-help" [hidden]>…</span>
<!-- gợi ý giàu -->
<td-hint [for="…"] id="…" [data-td-suppressed]>…nội dung của trang…</td-hint>
```

Thứ tự mô tả của control: `[id của trang] [mô tả riêng của component] [gợi ý] [lỗi]`.

## Bảo mật

- `helper-text` / `helper_text` luôn là chữ. `<td-hint>` không bao giờ đọc / ghi `innerHTML`: nội dung là node của trang
  (DOM tin cậy của dev). PHP: markup chỉ qua `Td::html()` — xem [security-model §6n](../internal/security-model.md).

## Xem thêm

- [Form controls](README.md), [Toggle](toggle.md) (gợi ý dưới nhãn, `on-text` / `off-text`), [Input field](input-field.md)
- [Trợ năng](../guides/accessibility.md), [Form](../guides/forms.md), [PHP adapter](../guides/php-adapter.md)
