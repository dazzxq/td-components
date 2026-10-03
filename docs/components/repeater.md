[Tài liệu](../README.md) › [Components](README.md) › Repeater

# Danh sách dòng động — `<td-repeater>`

Danh sách **dòng** người dùng thêm / xoá / sắp xếp được, mỗi dòng là một nhóm field con lặp lại theo một mẫu: "Hộp
gồm" (sạc, cáp, ốp…), quyền lợi gói bảo hành, câu hỏi thường gặp (câu hỏi + trả lời), kênh liên hệ. Giống td-media-grid,
td-repeater **không tự render dòng**: app (HTML viết tay, Blade, PHP) in sẵn mẫu dòng trong `<template>` và các dòng đang
có; element chỉ **nâng cấp tại chỗ** (thêm nút ↑ / ↓ / ×, nút "Thêm dòng", nhãn, thông báo cho trình đọc màn hình).
Field trong dòng là field thật (input native hoặc td-*), **tự gửi form** như mọi field khác — repeater không
form-associated.

**Ranh giới quan trọng:** kit **không bao giờ đặt `name`** cho field trong dòng. Mỗi app một sơ đồ tên (`items[0][name]`
kiểu Laravel, mảng song song `items[name][]`, JSON…), nên việc đánh lại index là của app — kit chỉ phát `rows-change`
sau mọi thay đổi để app làm việc đó (công thức 6 dòng ở [mục 2](#2-đặt-tên-field--công-thức-của-app)).

| | |
|---|---|
| Import | `import '@dazzxq/td-components/repeater'` (class: `import { TdRepeater } from '@dazzxq/td-components'`) |
| Loại | Custom element (nâng cấp markup có sẵn) |
| Form-associated | không (field trong dòng tự gửi) |
| Từ phiên bản | 0.30.0 (token-native: cần `td.css`) |

## Ví dụ nhanh

```html
<form method="post" action="/products/42">
  <td-repeater label="Hộp gồm" min-rows="1" max-rows="20" add-label="Thêm phụ kiện">
    <template>
      <div data-td-row class="box-row">
        <input data-name="box[{i}][name]" aria-label="Phụ kiện">
        <input type="number" data-name="box[{i}][qty]" aria-label="Số lượng" value="1">
      </div>
    </template>
    <!-- dòng server in sẵn: đã có name đúng → chạy cả khi không có JS -->
    <div data-td-row class="box-row">
      <input name="box[0][name]" data-name="box[{i}][name]" aria-label="Phụ kiện" value="Sạc 20W">
      <input type="number" name="box[0][qty]" data-name="box[{i}][qty]" aria-label="Số lượng" value="1">
    </div>
  </td-repeater>
  <button type="submit">Lưu</button>
</form>

<script type="module">
  import '@dazzxq/td-components/repeater';

  const rep = document.querySelector('td-repeater');
  const rename = (rows) => rows.forEach((row, i) => row.querySelectorAll('[data-name]')
    .forEach((el) => el.setAttribute('name', el.dataset.name.replaceAll('{i}', String(i)))));
  await customElements.whenDefined('td-repeater');
  rep.addEventListener('rows-change', (e) => rename(e.detail.rows));
  rename(rep.rows);
</script>
```

## Cách dùng

### 1. Hợp đồng markup

```html
<td-repeater label="…" [min-rows="1"] [max-rows="20"] [add-label="…"]>
  <template><div data-td-row class="…">…field…[<div data-td-row-actions></div>]</div></template>
  <div data-td-row class="…">…field đã có name…</div>   <!-- 0..n dòng server in -->
</td-repeater>
```

- **`<template>` con trực tiếp đầu tiên** chứa **đúng một** phần tử = mẫu một dòng (thiếu `data-td-row` thì kit tự thêm
  vào bản sao). Rỗng hoặc nhiều hơn một phần tử → một cảnh báo console, nút thêm `aria-disabled` (không lỗi JS).
- **Dòng** = con **trực tiếp** của host có `data-td-row`. Bố cục bên trong dòng là của app.
- Vị trí nút: đặt `<div data-td-row-actions></div>` trong dòng (ở mẫu và ở dòng server in) nếu muốn nút nằm ở chỗ cụ thể;
  không có thì kit nối `div.td-repeater__actions` vào **cuối** dòng.
- Template là markup **tin cậy của dev** (đừng nhúng dữ liệu người dùng chưa escape vào đó). `<script>` trong template
  không chạy (CSP chặn inline) — gắn hành vi bằng listener `rows-change`.
- **Không JS:** server in các dòng hiện có (+ vài dòng trống nếu muốn); không có nút nào (nút chỉ do JS tạo → không có nút
  chết). Khi JS nâng cấp, chỉ có nút xuất hiện thêm — không node field nào bị di chuyển hay tạo lại (focus, giá trị đang
  gõ, td-* bên trong đều giữ nguyên).

### 2. Đặt tên field — công thức của app

Kit **không đọc / ghi** `name`, `form`, `value` của bất kỳ thứ gì trong dòng. Kit giữ `data-td-index` (0, 1, 2…) trên mỗi
dòng và phát `rows-change` **đồng bộ** sau mọi thay đổi cấu trúc — của người dùng **và** của code (`addRow()`,
`removeRow()`, `moveRow()`, app tự chèn / gỡ dòng), vì tên phụ thuộc vị trí.

Công thức (một hàm, idempotent — gọi thừa vô hại):

1. Mọi field cần đánh lại index mang `data-name` chứa `{i}`, **ở cả template lẫn dòng server in**
   (`data-name="items[{i}][name]"`). Dòng server in thêm `name` đã đúng (`items[0][name]`) để chạy khi không có JS.
2. Gắn listener rồi **gọi ngay một lần** — listener có thể gắn sau khi `rows-change` lý do `init` đã phát (module tải
   trước script của trang):

```js
const rename = (rows) => rows.forEach((row, i) => row.querySelectorAll('[data-name]')
  .forEach((el) => el.setAttribute('name', el.dataset.name.replaceAll('{i}', String(i)))));
await customElements.whenDefined('td-repeater');
rep.addEventListener('rows-change', (e) => rename(e.detail.rows));
rename(rep.rows);
```

- Áp cho cả input native lẫn host td-* (`<td-input-field data-name="…">`, `<td-number-input data-name="…">`…): `name`
  trên host form-associated đổi lúc nào cũng có hiệu lực ở lần submit sau.
- Server (Laravel / PHP) nhận `items[0][name]`, `items[1][name]`… đúng thứ tự đang hiển thị, kể cả sau khi kéo dòng
  server in lên / xuống.

**Phương án không index** — `items[name][]` + `items[qty][]` (PHP ghép các mảng theo thứ tự DOM, tự đúng khi di chuyển,
không cần `rename`): **chỉ an toàn khi mọi field của dòng luôn được gửi.** Checkbox / td-toggle tắt **không gửi gì** →
mảng đó ngắn hơn, các cột lệch nhau (quyền lợi của dòng 3 rơi vào dòng 2). Có checkbox / toggle / field `disabled` trong
dòng → dùng công thức có index ở trên.

### 3. Thêm, xoá, sắp xếp

- **Thêm** (nút cuối danh sách hoặc `addRow()`): bản sao của template, chèn cuối (hoặc tại `at`). td-* trong dòng mới
  được nâng cấp khi chèn (không `innerHTML` dữ liệu). Người dùng bấm → focus vào phần tử nhập **đầu tiên** của dòng mới +
  thông báo "Đã thêm dòng 3. Có 3 dòng."
- **id duy nhất:** trong dòng **mới clone** mọi `id` (và `field-id` của td-input-field) thành `{id}--r{n}` (`n` đếm tăng
  theo từng repeater, không tái dùng, không lấy từ dữ liệu); tham chiếu **trong cùng dòng** đổi theo: `for`,
  `aria-labelledby`, `aria-describedby`, `aria-controls`, `aria-errormessage`, `aria-owns`, `list`, `field-id`. Tham chiếu
  ra ngoài dòng giữ nguyên. Dòng server in / app tự chèn **không** bị đổi id.
- **Xoá** (×): phát `before-remove` `{ row, index }` **hủy được**. Không hủy → gỡ dòng. Focus đang trong dòng bị xoá → focus
  nút × của dòng thế chỗ (hết dòng sau thì dòng trước, hết dòng → nút thêm) + "Đã xoá dòng 2. Còn 2 dòng."
- **Sắp xếp** (↑ / ↓ — nút thật, Tab tới rồi Enter / Space): "lên" ở dòng 3 = dòng 2 chuyển xuống sau dòng 3. Kit luôn di
  chuyển dòng **hàng xóm**, nên dòng chứa nút đang focus không bị tách khỏi DOM: focus giữ ở nút vừa bấm, td-* trong dòng
  đó không bị connect lại. + "Đã chuyển tới vị trí 2 / 3." Chưa có kéo thả / phím tắt riêng (đến ở v0.31 `td-sortable`).
- **Biên:** dòng đầu không lên, dòng cuối không xuống, ở `min-rows` không xoá, ở `max-rows` không thêm. Nút biên mang
  `aria-disabled="true"` (không `disabled`) → nút đang focus không mất focus khi vừa chạm biên; bấm thì không làm gì + thông
  báo ("Tối đa 20 dòng." / "Cần ít nhất 1 dòng.").

### 4. Xác nhận trước khi xoá

```js
import { TdModal } from '@dazzxq/td-components/modal';

rep.addEventListener('before-remove', async (e) => {
  e.preventDefault();                                   // giữ dòng lại trong lúc hỏi
  const ok = await TdModal.confirm({ message: `Xoá dòng ${e.detail.index + 1}?`, confirmVariant: 'danger' });
  if (ok) rep.removeRow(e.detail.row);                  // API không phát before-remove → không vòng lặp
});
```

Modal trả focus về nút × rồi mới tới `removeRow()` → kit thấy focus nằm trong dòng bị xoá và chuyển nó sang dòng thế chỗ
như khi xoá thường.

### 5. Thay đổi từ bên ngoài

App tự chèn / gỡ / sắp lại con `[data-td-row]` (vd. dựng lại sau khi tải dữ liệu): `MutationObserver` (chỉ con trực tiếp)
dựng lại thứ tự **từ DOM** (DOM là nguồn sự thật), gắn nút / nhãn cho dòng mới, rồi phát **một** `rows-change` lý do
`sync`. Vượt `max-rows` → **giữ hết** (không bao giờ xoá dữ liệu; nút thêm `aria-disabled`, một cảnh báo console); dưới
`min-rows` → nối thêm dòng từ template cho đủ. Thay đổi do chính kit làm không phát `sync` trùng.

## Attribute

| Attribute | Kiểu | Mặc định | Mô tả |
|---|---|---|---|
| `label` | string | — | Nhãn nhóm hiển thị (`div.td-repeater__label`, host `aria-labelledby`). Không có nhãn hiển thị → app đặt `aria-label` trên host để nhóm có tên. |
| `min-rows` | số nguyên 0–200 | `0` | Không bao giờ ít hơn: thiếu thì nối dòng từ template; × ở mức này `aria-disabled`. **Trần cứng 200** (`TdRepeater.MAX_MIN_ROWS`): giá trị lớn hơn (kể cả đổi attribute sau khi nâng cấp) bị **bỏ qua** (như `0`) + một cảnh báo — kit không bao giờ tự clone quá 200 dòng. |
| `max-rows` | số nguyên ≥ 0 (được lớn hơn 200) | không giới hạn | Không thêm quá; dòng đã có (server in nhiều hơn) được giữ hết. `max-rows < min-rows` → `max = min` + cảnh báo. |
| `add-label` | string | `TdRepeater.labels.add` | Chữ trên nút thêm. |

Đổi attribute sau khi nâng cấp → cập nhật tại chỗ (tăng `min-rows` → nối dòng + `rows-change` `sync`).

## Property & method

| Thành viên | Kiểu / chữ ký | Mô tả |
|---|---|---|
| `rows` | `HTMLElement[]` (chỉ đọc) | Các dòng theo thứ tự DOM. |
| `addRow({ at } = {})` | `→ HTMLElement \| null` | Thêm dòng từ template (cuối, hoặc tại index `at`). `null` khi đầy / template sai / chưa nâng cấp. |
| `removeRow(rowOrIndex)` | `→ boolean` | Xoá dòng (phần tử hoặc index). Tôn trọng `min-rows`; **không** phát `before-remove`. |
| `moveRow(from, to)` | `→ boolean` | Chuyển dòng ở `from` tới đúng index `to` (các dòng ở giữa dời chỗ, dòng được chuyển không bị tách khỏi DOM). |
| `TdRepeater.labels` | static | Văn bản (xem dưới). |
| `TdRepeater.MAX_MIN_ROWS` | `200` (static) | Trần của `min-rows` (chống vòng clone vô hạn khi `min-rows` đến từ dữ liệu). |

Ba API đều phát `rows-change` với `source: 'api'`.

```js
import { TdRepeater } from '@dazzxq/td-components/repeater';
Object.assign(TdRepeater.labels, {
  add: 'Add row', row: 'Row {n}', remove: 'Remove row {n}', moveUp: 'Move row {n} up', moveDown: 'Move row {n} down',
  added: 'Row {n} added. {count} rows.', removed: 'Row {n} removed. {count} rows left.',
  moved: 'Moved to position {n} of {count}.', full: 'At most {max} rows.', atMin: 'At least {min} rows.',
});
```

Mặc định: `add` "Thêm dòng", `row` "Dòng {n}", `remove` "Xoá dòng {n}", `moveUp` "Chuyển dòng {n} lên", `moveDown`
"Chuyển dòng {n} xuống", `added` "Đã thêm dòng {n}. Có {count} dòng.", `removed` "Đã xoá dòng {n}. Còn {count} dòng.",
`moved` "Đã chuyển tới vị trí {n} / {count}.", `full` "Tối đa {max} dòng.", `atMin` "Cần ít nhất {min} dòng.".

## Event

| Event | detail | Khi nào | Hủy được? |
|---|---|---|---|
| `rows-change` | `{ reason, source, rows, row?, index?, from?, to? }` | **Đồng bộ** sau mọi thay đổi cấu trúc, khi DOM + `data-td-index` + nhãn đã cập nhật, **trước** focus / thông báo. `reason`: `'init'` (lần nâng cấp đầu), `'add'`, `'remove'`, `'move'`, `'sync'` (thay đổi từ bên ngoài, tăng `min-rows`). `source`: `'user'` / `'api'`. `rows` = mảng dòng mới. | không |
| `before-remove` | `{ row, index }` | Người dùng bấm × (không phát khi gọi `removeRow()`). `preventDefault()` giữ dòng lại. | có |

Không có `change` trên host (tránh lẫn với `change` nổi bọt từ field trong dòng). Event của field trong dòng (`input`,
`change`) vẫn nổi bọt qua host như bình thường.

## Tuỳ biến giao diện

| Token | Mặc định | Tác dụng |
|---|---|---|
| `--td-repeater-gap` | `var(--td-space-sm)` | Khoảng cách giữa các phần trong dòng + đệm trên / dưới mỗi dòng |
| `--td-repeater-btn-size` | `2rem` | Cỡ nút ↑ / ↓ / × (trên màn cảm ứng luôn ≥ 44px) |
| `--td-repeater-btn-fg` / `-fg-hover` / `-bg-hover` | chữ phụ / chữ / nền hover | Màu nút |
| `--td-repeater-btn-disabled-fg` | `var(--td-btn-disabled-fg)` | Icon nút ở biên (`aria-disabled`) |
| `--td-repeater-divider` | `var(--td-color-border)` | Đường mảnh giữa các dòng |

Dòng mặc định `display: flex; flex-wrap: wrap` (nhóm nút đẩy về cuối). App đổi bố cục dòng bằng CSS **không layer** của
mình (luôn thắng `td.css`):

```css
.box-row { display: grid; grid-template-columns: 1fr 6rem auto; }
.box-row > [data-td-row-actions] { justify-self: end; }
```

Lớp nội dung: không nền / bóng, chỉ đường mảnh giữa dòng; nút ghost; nút thêm là `td-btn td-btn--secondary td-btn--sm`.
Không có animation.

## Cấu trúc DOM & class

```html
<td-repeater label="Hộp gồm" class="td-repeater" role="group" aria-labelledby="td-repeater-1-label">
  <div class="td-repeater__label" id="td-repeater-1-label">Hộp gồm</div>
  <template>…</template>
  <div data-td-row class="box-row td-repeater__row" role="group" aria-label="Dòng 1" data-td-index="0">
    …field của app…
    <div class="td-repeater__actions">           <!-- hoặc [data-td-row-actions] của app (được thêm class này) -->
      <button type="button" class="td-repeater__btn td-repeater__btn--up" aria-label="Chuyển dòng 1 lên" aria-disabled="true">↑</button>
      <button type="button" class="td-repeater__btn td-repeater__btn--down" aria-label="Chuyển dòng 1 xuống">↓</button>
      <button type="button" class="td-repeater__btn td-repeater__btn--remove" aria-label="Xoá dòng 1">×</button>
    </div>
  </div>
  <div class="td-repeater__footer">
    <button type="button" class="td-btn td-btn--secondary td-btn--sm td-repeater__add"><svg …/><span class="td-repeater__add-label">Thêm dòng</span></button>
    <span class="td-sr-only" role="status"></span>
  </div>
</td-repeater>
```

- Dòng app tự đặt `aria-labelledby` (vd. trỏ vào tiêu đề câu hỏi) → kit giữ, không thêm `aria-label`.
- Icon nút: registry `up` / `down` / `close` / `plus` (ghi đè bằng `registerIcons`).
- Id nhãn sinh từ bộ đếm, không phải API.

## Bàn phím & trợ năng

| Phím | Tác dụng |
|---|---|
| Tab / Shift+Tab | Qua các field và nút của từng dòng theo thứ tự DOM, rồi nút thêm |
| Enter / Space trên ↑ / ↓ / × / Thêm | Như bấm chuột |

- Host và mỗi dòng là `role="group"` có tên ("Hộp gồm", "Dòng 2") → trình đọc màn hình báo đang ở dòng nào.
- Nút có tên kèm số dòng ("Xoá dòng 2"); nút biên `aria-disabled` vẫn focus được và được đọc là "mờ".
- Thông báo thêm / xoá / chuyển / đầy / tối thiểu qua live region `role="status"` (text).
- `<fieldset disabled>` tổ tiên tắt toàn bộ nút như mọi `<button>`. Nút luôn `type="button"` → không submit form.

## Bảo mật

- `label`, `add-label`, văn bản `labels` đều là text (`textContent` / `setAttribute`). Không có cửa HTML mới.
- Template là markup tin cậy của dev; dòng mới được tạo bằng `importNode` (không `innerHTML` dữ liệu). Id của dòng clone
  sinh từ bộ đếm, không từ dữ liệu.
- `min-rows` có trần 200: một giá trị cực lớn (vd. lấy từ cấu hình / dữ liệu) không thể khiến trang treo vì clone dòng.
- Kit không đặt `name` → không có đường nào để dữ liệu người dùng chọn tên field gửi đi. Server vẫn phải kiểm số dòng
  (`min-rows` / `max-rows` chỉ là UX) và từng giá trị.

## Lưu ý & lỗi thường gặp

- **Submit ra `items[{i}][name]`** (chưa thay `{i}`) hoặc thiếu dòng mới → chưa gắn công thức đặt tên, hoặc quên gọi
  `rename(rep.rows)` ngay sau khi gắn listener.
- **Dòng bị nhân đôi sau khi app dựng lại** → app chèn dòng mới mà không gỡ dòng cũ; kit giữ đúng những gì có trong DOM.
- **Template có hai phần tử gốc** (vd. hai `<input>` không bọc) → bọc trong một `<div data-td-row>`.
- **Nút nằm sai chỗ** → đặt `[data-td-row-actions]` trong mẫu dòng.
- Repeater lồng repeater: không chặn nhưng chưa được kiểm thử.
- Không có tổng / tính toán giữa các dòng, nhân bản dòng, hoàn tác xoá — việc của app.
- Không có helper PHP: nội dung dòng là markup của app. Mẫu Blade:

```blade
<td-repeater label="Hộp gồm" min-rows="1" max-rows="20">
  <template><div data-td-row><input data-name="box[{i}][name]" aria-label="Phụ kiện"></div></template>
  @foreach (old('box', $product->box) as $i => $item)
    <div data-td-row><input name="box[{{ $i }}][name]" data-name="box[{i}][name]" aria-label="Phụ kiện" value="{{ $item['name'] }}"></div>
  @endforeach
</td-repeater>
```

## Xem thêm

- [Number input](number-input.md) · [Input field](input-field.md) · [Modal](modal.md) · [Media grid](media-grid.md)
- [Form](../guides/forms.md) · [Trợ năng](../guides/accessibility.md) · [Theming](../customization/theming.md)
