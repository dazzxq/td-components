[Tài liệu](../README.md) › [Components](README.md) › Tree select

# Chọn trong cây — `<td-tree-select>`

Ô chọn một dòng mở ra **cây** trong popup: chọn **một** nút (danh mục cha, chuyên mục chính) hoặc **nhiều** nút
(chuyên mục bài viết). Dựng trên [`<td-tree>`](tree.md): cùng dữ liệu, cùng luật chọn / khoá / lazy / lọc. Có helper
PHP `td_tree_select()` in `<select>` native dùng được **khi không có JS** và nâng cấp **không xô lệch**.

Không dùng khi: danh sách phẳng → [`<td-dropdown>`](dropdown.md); cần chip gỡ được cho nhiều mục →
[`<td-chip-input>`](chip-input.md); cây luôn hiện trong trang (cây quyền) → [`<td-tree>`](tree.md).

| | |
|---|---|
| Import | `import '@dazzxq/td-components/tree-select'` (nạp kèm `td-tree`; class: `import { TdTreeSelect } from '@dazzxq/td-components/tree-select'`) |
| Loại | Custom element |
| Form-associated | có (`ElementInternals`), mỗi giá trị một entry |
| Từ phiên bản | 0.29.0 |

## Ví dụ nhanh

```html
<form>
  <td-tree-select id="parent" name="parent_id" label="Danh mục cha" placeholder="— Không có (gốc) —"
                  allow-clear display="path"></td-tree-select>
</form>

<script type="module">
  import '@dazzxq/td-components/tree-select';

  const el = document.getElementById('parent');
  el.data = [
    { value: 'phone', label: 'Điện thoại', children: [
      { value: 'apple', label: 'Apple', children: [{ value: 'ip15', label: 'iPhone 15' }] },
    ] },
    { value: 'acc', label: 'Phụ kiện' },
  ];
  el.addEventListener('change', (e) => console.log('Cha mới:', e.detail.value));
</script>
```

Server-render bằng PHP (chạy cả khi không JS):

```php
<?= td_tree_select('parent_id', $categoryTree, $category->parent_id, [
    'label' => 'Danh mục cha', 'placeholder' => '— Không có (gốc) —', 'display' => 'path',
    'disable_subtree' => [$category->id],   // chính nó + mọi con cháu không chọn được làm cha
    'element' => true,
]) ?>
```

## Cách dùng

### 1. Một hay nhiều

- **Một** (mặc định): combobox. Có `searchable` (mặc định bật) → ô nhập: đóng thì hiện nhãn đã chọn, mở ra ô trống (nhãn
  đã chọn thành placeholder), gõ là lọc cây tại chỗ. `searchable="false"` → nút bấm.
- **Nhiều** (`multiple`): nút mở popup gồm ô tìm + cây có ô check (Space / Enter lật, popup **giữ mở**). Ô hiện tóm tắt
  chữ "Apple, Samsung +3" (`labels.selectedCount`). Cần chip gỡ được từng mục → dùng `td-chip-input`.
- `multiple cascade`: cây quyền ba trạng thái, giá trị = lá đã check — xem [luật cascade](tree.md#3-cascade--cây-quyền-ba-trạng-thái).

### 2. Hiển thị (`display`, `placeholder`, `allow-clear`)

- `display="path"` (một): "Điện thoại › Apple › iPhone 15" thay vì chỉ "iPhone 15".
- `placeholder`: chữ khi trống.
- `allow-clear`: nút × (anh em của ô, không lồng trong nút) xoá các giá trị **không khoá**; ẩn khi không có gì xoá được.
- Giá trị bị cắt `…` (ô hẹp, 0.34.0): phần tử hiện giá trị (`.td-tree-select__value`, hoặc ô `<input>` khi đóng) có `title` = chữ đầy đủ (nhiều: cả danh sách); không có khi vừa chỗ / đang là placeholder / đang gõ.

### 3. Khoá (vẫn gửi đúng một lần)

Nút `disabled` (và cả nhánh) là **khoá**: người dùng không đổi được, nhưng giá trị khoá đã chọn **vẫn được gửi** — như
[`<td-tree>`](tree.md#4-nút-khoá-khoá-hiển-thị-vẫn-được-gửi):

- một, lựa chọn đang **khoá** → không chọn được nút khác, không có nút ×;
- nhiều → nút × chỉ gỡ mục không khoá;
- `setValue()` bằng code đặt tuỳ ý. **Server vẫn phải tự kiểm quyền.**

### 4. Nhánh tải chậm + nhãn cho giá trị chưa tải

```html
<td-tree-select name="cat" value="ip15" value-label="iPhone 15"></td-tree-select>
<td-tree-select name="cats[]" multiple value='["ip15","dell"]' value-labels='{"ip15":"iPhone 15","dell":"Dell"}'></td-tree-select>
```

`loadChildren` như `td-tree` (latest-request-wins, huỷ khi gỡ phần tử). Host giữ **một** model duy nhất: một nhánh tải
trong popup cập nhật luôn nhãn trên ô. Giá trị nằm trong nhánh chưa tải được giữ (vẫn gửi) và hiện bằng `value-label`
(một) / `value-labels` (nhiều — JSON object `{"value":"nhãn"}`; JSON hỏng → bỏ qua + cảnh báo; thiếu → hiện chính value)
cho tới khi nhánh chứa nó được tải.

### 5. Nâng cấp `<select>` có sẵn (progressive enhancement)

Một `<select>` **con trực tiếp** (thường do `td_tree_select()` in, viết tay cũng được) được đọc ở lần kết nối đầu:

| Trong select | Thành |
|---|---|
| thứ tự option (**preorder**) + `data-level="n"` (vắng = 0) | cây; nhảy cấp > +1 → kẹp về +1 + cảnh báo |
| `data-label` (vắng → chữ của option, đã bỏ khoảng trắng / NBSP thụt đầu) | nhãn |
| `data-description` | mô tả |
| `data-locked`, hoặc `disabled` **không** kèm `data-native-only` | nút **khoá** |
| `disabled data-native-only` | chỉ là ràng buộc của bản không-JS (cha khi `cascade`, option khác khi lựa chọn khoá) — **không** khoá |
| `value=""` | bỏ (placeholder; chữ của option đầu tiên thành `placeholder` nếu host chưa có) |
| `<optgroup>` | làm phẳng |
| `multiple` | `multiple` trên host |
| `<input type="hidden" class="td-tree-select__locked">` con trực tiếp | giá trị khoá đã chọn (rồi bị gỡ) |

`name` / `required` / `disabled` / `aria-label` chuyển lên host **khi host chưa có**; `<label for="{id select}">` trỏ
sang host; select bị gỡ. Select **đang focus** lúc module nạp → chờ nó blur rồi mới nâng cấp (giữ lựa chọn vừa làm).
**Thứ tự ưu tiên giá trị ban đầu:** property `value` gán sớm > attribute `value` > lựa chọn đang sống của select.
Reset → mặc định native của select (option `selected` gốc + input khoá).

**Trước khi JS tải (0.51.1, [ADR 0025](../internal/decisions/0025-pre-upgrade-parity.md)):** host chưa define → select
**đơn** có đúng hộp của control (cao cố định — WebKit bỏ qua `min-height` của select native), chevron CSS, kiểu chữ nhãn
(cả chế độ native). Select **nhiều** ở chế độ native: khi trình duyệt chạy JS (`@media (scripting: enabled)`) cao một
control, cuộn được; tắt JS thì giữ list `size` dòng như cũ. Khác **pixel** còn lại (không khác hộp): chữ option có thụt
NBSP theo cấp và nút × chỉ có sau nâng cấp.

### 6. Thao tác bằng code

```js
el.value = 'apple';                 // một: chuỗi ('' = trống); nhiều: mảng
el.setValue(['ip15', 'dell']);      // im lặng
el.open(); el.close(); el.toggle();
```

`data`, `loadChildren`, `value` gán **trước** khi module nạp vẫn được áp (`value` sớm thắng attribute và select).

## Attribute

| Attribute | Mặc định | Ý nghĩa |
|---|---|---|
| `name` | — | tên trường nguyên văn (`cats[]` cho mảng PHP) |
| `label` | — | nhãn hiển thị (tên của ô **và** cây trong popup) |
| `placeholder` | — | chữ khi trống |
| `multiple` | tắt | chọn nhiều (disclosure + check) |
| `cascade` | tắt | chỉ với `multiple`: ba trạng thái, giá trị = lá |
| `searchable` | bật | tắt bằng `searchable="false"` (một: ô thành nút; nhiều: popup không có ô tìm) |
| `allow-clear` | tắt | nút × xoá các giá trị không khoá |
| `display` | `label` | `path` = đường dẫn đầy đủ (một) |
| `value` | — | giá trị ban đầu: một = chuỗi; nhiều = JSON mảng |
| `value-label` / `value-labels` | — | nhãn cho giá trị chưa tải (mục 4) |
| `disabled`, `required`, `error-text`, `aria-label` | | như mọi control form của kit |

## Property & method

| | |
|---|---|
| `data`, `loadChildren` | như [`td-tree`](tree.md#1-dữ-liệu-data) |
| `value` / `getValue()` / `setValue(v)` | `string` (một) \| `string[]` (nhiều), im lặng |
| `open()` / `close()` / `toggle()` | popup |
| `searchable` | property của flag mặc định bật (`false` → `searchable="false"`) |
| `setError()` / `clearError()` / `checkValidity()` / `reportValidity()` / `focus()` | contract form chung |

Văn bản: `TdTreeSelect.labels` (`search`, `tree` — tên dự phòng khi không có nhãn, `clear`, `selectedCount` — `+{n}`,
`required`); văn bản của cây trong popup: `TdTree.labels`.

## Event

Phát trên **host**, chỉ khi người dùng thao tác (sự kiện của cây trong popup không nổi bọt ra ngoài):

| Event | `detail` |
|---|---|
| `change` | `{ value, added, removed }` (một: `value` là chuỗi) |
| `expanded-change` | `{ value, expanded }` |
| `load-error` | `{ value, error }` |

## Form

Như [`td-tree`](tree.md#form): mỗi giá trị một entry (nhiều: thứ tự cây), `required` → `valueMissing` (mục khoá tính là
có giá trị), state khôi phục = JSON mảng, `<fieldset disabled>` theo `TdFormElement`. Không JS (PHP native): select gửi
như mọi select; lựa chọn **khoá** của `multiple` đi qua input ẩn (đúng một lần), control `disabled` không gửi gì — trước
và sau nâng cấp cùng **tập** giá trị, với hai ngoại lệ đã biết:

- bản native một-giá-trị có option rỗng gửi `name=` rỗng; sau nâng cấp không gửi entry nào (server coi cả hai là trống);
- **không JS, chọn nhiều có mục khoá**: các option đã chọn không khoá gửi trước, mục khoá (input ẩn) gửi **sau**; sau nâng
  cấp mọi giá trị theo thứ tự cây — cùng tập giá trị, khác thứ tự. Server đừng dựa vào thứ tự.

## Tuỳ biến giao diện

Ô dùng token field (`--td-field-bg`, `--td-field-border`, `--td-field-border-hover`, `--td-field-focus`,
`--td-field-focus-ring`, `--td-field-error`, `--td-field-radius-md`, `--td-field-h-md`, `--td-field-placeholder`). Popup là
**popup nhỏ** của Minimal surfaces (nền 94 % + `blur(12px)` + viền mảnh + một bóng mềm, `--td-z-popover`), ô tìm dùng
`--td-dropdown-search-bg` / `--td-dropdown-search-border`, cây trong popup dùng token của [`td-tree`](tree.md#tuỳ-biến-giao-diện)
(`--td-tree-indent`, `--td-tree-row-h`, `--td-tree-row-active`…). Popup nằm ở `<body>`: nhắm riêng bằng `#{host}-menu`.

## Cấu trúc DOM & class

```html
<td-tree-select id="{h}">
  <div class="td-tree-select" data-state="closed|open" [data-multiple]>
    <label class="td-field__label" id="{h}-label" for="{h}-input">Danh mục cha</label>
    <div class="td-tree-select__control" [data-disabled]>
      <!-- một + searchable -->
      <input type="text" class="td-tree-select__input" id="{h}-input" role="combobox" aria-haspopup="tree"
             aria-expanded aria-controls="{h}-tree" [aria-activedescendant] aria-labelledby="{h}-label">
      <!-- một + searchable="false": button role="combobox" aria-haspopup="tree" aria-controls="{h}-tree" -->
      <!-- nhiều: button (disclosure) aria-expanded aria-controls="{h}-menu" aria-describedby="{h}-value" -->
      <button type="button" class="td-tree-select__trigger" id="{h}-trigger" …>
        <span class="td-tree-select__value" id="{h}-value" [data-placeholder]>…</span></button>
      <button type="button" class="td-tree-select__clear" aria-label="Xoá lựa chọn" [hidden]>…</button>
      <span class="td-tree-select__arrow" data-td-icon="down" aria-hidden="true"></span>
    </div>
  </div>
</td-tree-select>

<!-- Con trực tiếp của <body> (tạo lại mỗi lần kết nối) -->
<div class="td-tree-select__menu td-glass-surface td-glass-surface--strong" id="{h}-menu" hidden data-state data-placement>
  <div class="td-tree-select__search-wrap"><input type="search" class="td-tree-select__search" aria-controls="{h}-tree"></div>  <!-- nhiều -->
  <div class="td-tree-select__scroller">
    <td-tree id="{h}-tt" class="td-tree-select__tree"> … <ul role="tree" id="{h}-tree"> … </ul> … </td-tree>
  </div>
</div>
```

Shell SSR (PHP element mode): `<td-tree-select data-td-ssr="tree-select@1" …>` + [nhãn] + `select.td-tree-select__native`
(+ input khoá) — xem [adapter PHP](../guides/php-adapter.md#td_tree_select-0290).

## Bàn phím & trợ năng

**Một = APG combobox, popup `tree`.** Đúng **một** phần tử `role="combobox"` (ô nhập, hoặc nút khi
`searchable="false"`) mang `aria-expanded` / `aria-controls` / `aria-activedescendant`; focus thật **không rời** nó, cây
chạy focus ảo (`data-active`).

| Phím | Hành động |
|---|---|
| ↓ / ↑ | đóng → mở; mở → nút kế / trước |
| Home / End | nút: đầu / cuối; ô nhập: phím con trỏ |
| ← / → / `*` | nút: luôn là phím cây; ô nhập: **chỉ khi ô rỗng** (có chữ → di con trỏ). `*` chỉ mở anh em đã tải (không tải nhánh lazy) |
| Enter | chọn nút đang trỏ + đóng, focus ở lại combobox |
| Space | nút: chọn + đóng (đang đóng → mở; click kích hoạt sinh ra từ phím bị chặn, không mở lại); ô nhập: gõ dấu cách |
| Escape | đóng, focus ở combobox |
| Tab | đóng, đi tiếp |

**Nhiều = disclosure.** Nút (không `role=combobox`) với `aria-expanded` + `aria-controls`; mở → focus vào ô tìm (chuột;
máy cảm ứng → vào cây, không bật bàn phím ảo — 0.34.0). Cây dùng roving tabindex như `td-tree`: ↓ từ ô tìm vào cây, Space / Enter lật check (popup
giữ mở). Escape / Tab ra khỏi popup → đóng + focus về nút.

**Tên truy cập** (cả hai chế độ, kể cả khi popup nằm ở `<body>`): `label` (nhãn nội bộ) > `<label for>` ngoài > `aria-label`
host > `TdTreeSelect.labels.tree` — chép lên **cả** combobox / nút **và** `ul[role=tree]` trong popup. Ô tìm của chế độ
nhiều có `aria-label` = `labels.search`.

Popup đăng ký lớp nổi (`LAYERS.popover`): trong modal, Escape chỉ đóng popup; một modal mới phủ lên → popup đóng (không
trả focus); ô bị cuộn khuất / ẩn → đóng; gỡ phần tử khi đang mở → popup, lớp, listener, timer, request lazy đều được dọn.

## Bảo mật

Như [`td-tree`](tree.md#bảo-mật): mọi chữ qua `textContent`, id từ bộ đếm, không `style=""`. `value-labels` chỉ được
`JSON.parse` và dùng làm text. Khoá chỉ là khoá giao diện — server tự kiểm.

## Cảm ứng

- Hàng trong menu và nút xoá có hình nhấn; hover chỉ trên con trỏ mịn. Hộp control không có hình nhấn (focus ring là phản hồi).

Chuẩn chung: [Cảm ứng](../guides/touch.md).

## Lưu ý & lỗi thường gặp

- **Nhiều mà không có chip**: chủ ý (tóm tắt chữ). Cần chip → `td-chip-input`.
- **`cascade` không kèm `multiple`** bị bỏ qua.
- **`value` của chế độ nhiều** phải là JSON mảng.
- **PHP không JS, chọn một có placeholder**: option rỗng gửi `name=` rỗng — server coi là "không có".
- Gán `data` mới làm mọi request lazy cũ bị huỷ; giá trị được đối chiếu lại (mục 4).

## Xem thêm

- [Tree](tree.md) · [Dropdown](dropdown.md) · [Chip input](chip-input.md)
- [Adapter PHP — `td_tree_select`](../guides/php-adapter.md#td_tree_select-0290)
