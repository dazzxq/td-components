[Tài liệu](../README.md) › [Components](README.md) › Tree

# Cây (tree) — `<td-tree>`

Cây phân cấp mở / đóng theo mẫu WAI-ARIA APG "Tree View": `role="tree"` / `treeitem` / `group`, một tab stop (roving
tabindex), bàn phím đầy đủ. Ba chế độ chọn: **không chọn** (cây điều hướng — phát `activate`), **chọn một**, **chọn
nhiều** (check độc lập, hoặc `cascade` ba trạng thái cho cây quyền). Nhánh tải chậm (`loadChildren`), ô lọc, gửi được
trong `<form>`. Dùng cho cây danh mục, cây thư mục, chọn chuyên mục bài viết, cây quyền.

Không dùng khi: chọn **một** mục của cây trong form gọn một dòng (chọn danh mục cha) → [`<td-tree-select>`](tree-select.md);
danh sách phẳng → [`<td-dropdown>`](dropdown.md) / [`<td-chip-input>`](chip-input.md).

| | |
|---|---|
| Import | `import '@dazzxq/td-components/tree'` (class: `import { TdTree } from '@dazzxq/td-components/tree'`) |
| Loại | Custom element |
| Form-associated | có (`ElementInternals`), mỗi giá trị một entry |
| Từ phiên bản | 0.29.0 |

## Ví dụ nhanh

```html
<form>
  <td-tree id="cats" name="categories[]" selection="multiple" label="Chuyên mục" searchable
           value='["phone","dell"]'></td-tree>
  <button type="submit">Lưu</button>
</form>

<script type="module">
  import '@dazzxq/td-components/tree';

  document.getElementById('cats').data = [
    { value: 'phone', label: 'Điện thoại', children: [
      { value: 'apple', label: 'Apple', children: [{ value: 'ip15', label: 'iPhone 15' }] },
      { value: 'samsung', label: 'Samsung', description: '12 sản phẩm' },
    ] },
    { value: 'laptop', label: 'Laptop', children: [{ value: 'dell', label: 'Dell' }] },
    { value: 'acc', label: 'Phụ kiện' },
  ];
</script>
```

Form gửi `categories[]=phone&categories[]=dell` (theo thứ tự trong cây).

## Cách dùng

### 1. Dữ liệu (`data`)

Mỗi nút: `{ value, label, children?, hasChildren?, disabled?, description?, expanded? }`.

| Trường | Ý nghĩa |
|---|---|
| `value` | **Chuỗi khác rỗng hoặc số** (ép `String()`), **duy nhất** toàn cây. `''` / `null` / object / mảng / boolean → nút bị **bỏ cùng cả nhánh** + một cảnh báo. Trùng value → nút sau bị **khoá** và không bao giờ vào giá trị (một cảnh báo) |
| `label` | chữ hiển thị (chỉ text; thiếu → dùng `value`) |
| `children` | mảng con = đã có con; `[]` hoặc vắng = lá |
| `hasChildren: true` | (không có `children`) nhánh **tải chậm** qua `loadChildren` (mục 5) |
| `disabled` | **khoá** nút **và cả nhánh** của nó (mục 4) |
| `description` | dòng phụ nhỏ cạnh nhãn (text), đọc qua `aria-describedby` |
| `expanded` | mở sẵn (chỉ nút đã có `children`) |
| `helper-text` | — | **0.54.0** Gợi ý dưới control (chữ, 1–2 câu): ẩn và rời khỏi mô tả khi có lỗi. Nội dung giàu (link, `<code>`): `<td-hint>` con — xem [Hint](hint.md). Property `helperText`, `setHelper(msg)`, `helperMessage`. |

Kit không đổi tên trường (`value-key` / `label-key` không có): dữ liệu khác hình dạng thì app tự map trước khi gán.
`getNode(value)` trả về **chính object** của app.

### 2. Ba chế độ chọn (`selection`)

| `selection` | Enter / Space / bấm hàng | Giá trị | ARIA |
|---|---|---|---|
| `none` (mặc định) | phát `activate { value, node }` | — | không `aria-selected` |
| `single` | chọn nút đó (cha hay lá đều được) | một chuỗi (`''` khi trống) | `aria-selected="true|false"` |
| `multiple` | lật check của nút | mảng, **thứ tự cây** (preorder) | `aria-checked` + `aria-multiselectable` |

- Lựa chọn **không đi theo focus**: duyệt bằng mũi tên không bao giờ đổi giá trị (không có `change` ngoài ý muốn).
- `single`: lần render đầu (và mỗi lần gán `data`) tự mở tổ tiên của nút đã chọn; tab stop đặt trên nó.
- `multiple` **độc lập** (mặc định): mỗi nút một ô check riêng, check "Điện thoại" **không** có nghĩa là mọi mục con —
  đúng mô hình "chuyên mục bài viết" của WordPress.

Ô check (0.36.0) là [ô tick chung](checkbox.md#phần-hình-dùng-chung-td-check-0360) cỡ `sm` — **đúng hình `td-checkbox`**
(tròn theo mặc định, ✓ khi `aria-checked="true"`, vạch ngang khi `"mixed"`, mờ khi `aria-disabled`). Trước 0.36 là hộp
vuông 4px riêng ([ADR 0017](../internal/decisions/0017-shared-check-mark.md)).

### 3. `cascade` — cây quyền (ba trạng thái)

> Quyền **theo nhiều vai trò cùng lúc** (quyền × role, có cột khoá, chọn cả cột): dùng
> [`<td-check-matrix>`](check-matrix.md) (0.47.0). `cascade` hợp khi sửa quyền của **một** đối tượng.

`<td-tree selection="multiple" cascade>`: ô check ba trạng thái, **giá trị = chỉ các LÁ đã check** (nút cha là "nhóm",
không phải quyền). Vì sao gửi lá: tập gửi đi không mơ hồ ("cha" không ngầm nghĩa "cả nhánh"), server không phải tự bung
nhánh, thêm quyền con mới vào nhóm sau này không tự cấp ngầm. Không hỗ trợ "gom về cha".

| Luật | |
|---|---|
| 1. Khoá kế thừa xuống | nút `disabled` khoá **cả nhánh**; mở / đóng vẫn được |
| 2. Hiển thị cha | suy từ **mọi lá con cháu, kể cả lá khoá**: tất cả check → `true`, không lá nào → `false`, còn lại → `mixed` (cha không bao giờ hiện "đủ" khi còn lá khoá chưa check) |
| 3. Bấm cha | mọi lá **không khoá** của nhánh đã check → bỏ check chúng; ngược lại → check hết chúng. Lá khoá giữ nguyên (cha `mixed` vì lá khoá vẫn bấm qua lại được, không bao giờ kẹt) |
| 4. Bấm lá | lật lá đó; tổ tiên tính lại (O(độ sâu)) |
| 5. Giá trị ban đầu | value của nút **cha** hoặc value không có trong cây → bỏ + một cảnh báo |
| 6. `cascade` + nhánh lazy | không hỗ trợ khi có `loadChildren` **hoặc** còn nút `hasChildren` chưa tải (không biết lá của nhánh chưa tải; nhánh chưa tải không bao giờ bị coi là lá) → một cảnh báo, chạy như `multiple` độc lập. Gán `data` mới không còn nhánh lazy (và không có hook) → `cascade` có hiệu lực lại, giá trị được đối chiếu (bỏ value cha) |

### 4. Nút khoá: "khoá hiển thị", vẫn được gửi

Khác `<option disabled>` của trình duyệt, một nút **khoá đã chọn vẫn nằm trong giá trị và FormData** (đúng **một**
lần): server kiểu "đồng bộ theo danh sách nhận được" sẽ **thu hồi** quyền khoá nếu form bỏ nó đi. Người dùng không đổi
được trạng thái của nút khoá (bàn phím vẫn tới được, đọc được, mở / đóng được):

- `single` có **lựa chọn khoá** → không chọn được nút nào khác (cây vẫn duyệt / mở được).
- `multiple`: nút khoá không lật được; `cascade` theo luật 3.
- `setValue()` bằng code đặt tuỳ ý (app có quyền); `required` tính cả mục khoá.

> **Server vẫn phải tự kiểm** quyền / khoá — client không bao giờ đáng tin.

**Công thức "chọn danh mục cha" chống vòng:** khi sửa danh mục X, đánh dấu chính X là `disabled` → X và **mọi con
cháu** của nó không chọn được làm cha (luật khoá kế thừa). PHP: `td_tree_select(…, ['disable_subtree' => [$id]])`
(xem [tree-select](tree-select.md)).

### 5. Nhánh tải chậm (`loadChildren`)

```js
tree.loadChildren = async (node, { signal }) => {
  const res = await fetch(`/api/categories/${encodeURIComponent(node.value)}/children`, { signal });
  return res.json(); // mảng nút cùng hình dạng data
};
tree.data = [{ value: 'phone', label: 'Điện thoại', hasChildren: true }];
```

- Mở nút `hasChildren` lần đầu → gọi hook với **object gốc** của app + `AbortSignal`; nút có `aria-busy="true"` (mũi tên
  quay; giảm chuyển động → tĩnh). "Đang tải…" chỉ được đọc sau 400 ms.
- **Latest-request-wins theo từng nút**: gán `data` mới / gỡ phần tử khỏi trang huỷ mọi request (`signal` abort) và
  kết quả về muộn bị **bỏ, kể cả khi hook phớt lờ `signal`**. Thu gọn khi đang tải → kết quả vẫn được nhận và lưu nhưng
  nhánh **không** tự mở lại.
- Kết quả không phải mảng / reject → nút về đóng, `data-load="error"`, thông báo `labels.loadError`, phát `load-error`;
  mở lại = thử lại. Mảng rỗng → nút thành lá.
- Con tải về đi qua đúng luật của `data` (value hợp lệ / trùng, độ sâu, khoá kế thừa từ cha). `*` **không** tải: nó chỉ
  mở các anh em đã có con (như `expandAll()`), nhánh lazy chưa tải giữ nguyên đóng — một phím không bao giờ bắn hàng
  loạt request.
- Giá trị chọn trước nằm trong nhánh **chưa tải** được **giữ** (vẫn gửi, vẫn tính `required`) tới khi một lần tải đưa
  nút đó vào; khi cây đã tải **đủ** mà vẫn không thấy → bỏ + cảnh báo (không phát `change`). Xem [Form](#form).

### 6. Lọc (`searchable` / `filter()`)

`searchable` thêm ô tìm phía trên cây (lọc sau 150 ms); `tree.filter('iphone')` lọc bằng code (`''` = bỏ lọc). Chỉ lọc
**nút đã tải** (không gọi server — tìm từ xa thì app tự đổi `data`), so khớp chuỗi con trên nhãn, **không phân biệt
dấu / hoa thường**. Hiện: nút khớp + mọi tổ tiên (mở **tạm**, xoá chữ thì cây về đúng trạng thái trước); nút khớp có con
hiện ở trạng thái đóng, mở ra thấy **toàn bộ** con. Trình đọc màn hình nghe "{n} kết quả" / "Không tìm thấy kết quả".
↓ từ ô tìm → nút hiện đầu tiên.

### 7. Thao tác bằng code (im lặng)

```js
tree.setValue(['phone', 'dell']);   // multiple: mảng (chuỗi JSON cũng được); single: một value
tree.value;                         // single: 'phone' | ''   multiple: ['phone', 'dell']
tree.expand('phone'); tree.collapse('phone');
tree.expandAll(); tree.collapseAll(); // chỉ nút đã tải, không kích hoạt lazy
tree.getNode('dell');               // object của app (null khi chưa tải / không có)
```

Không phát sự kiện. Gán `data` mới → thế hệ mới (request lazy cũ bị huỷ); giá trị đối chiếu lại theo [Form](#form).

**Gán trước khi định nghĩa:** `data`, `loadChildren`, `value` gán lên phần tử **trước** khi module nạp vẫn được áp khi
nâng cấp; `value` gán sớm thắng attribute `value`.

## Giới hạn kích thước

≤ 5.000 nút trong `data` (vượt → một cảnh báo gợi ý `loadChildren`, vẫn chạy), ≤ 1.000 hàng **đang hiện** cùng lúc, sâu
≤ 16 cấp (sâu hơn bị bỏ + cảnh báo). Chỉ nhánh đang mở có trong DOM (thu gọn = gỡ `group`); mở / đóng / check chỉ cập
nhật phần bị ảnh hưởng. Không có virtualization — cây lớn hơn hãy tải nhánh theo nhu cầu.

## Attribute

| Attribute | Mặc định | Ý nghĩa |
|---|---|---|
| `name` | — | tên trường, **nguyên văn** (`perms[]` cho mảng PHP; kit không tự thêm `[]`) |
| `label` | — | nhãn hiển thị, đặt tên cho cây |
| `selection` | `none` | `none` \| `single` \| `multiple` |
| `cascade` | tắt | `multiple`: ba trạng thái, giá trị = lá (mục 3) |
| `searchable` | tắt | ô lọc phía trên cây |
| `value` | — | giá trị ban đầu (+ mặc định khi reset): `single` = một chuỗi; `multiple` = JSON mảng (`'["a","b"]'`) |
| `disabled` | tắt | khoá cả cây (cũng theo `<fieldset disabled>`) |
| `required` | tắt | phải có ít nhất một giá trị (`valueMissing`) |
| `error-text` | — | lỗi hiển thị (`aria-invalid` trên cây + ghi chú) |
| `aria-label` | — | tên khi không có `label` (chép lên `ul[role=tree]`) |

## Property & method

| | |
|---|---|
| `data` | mảng nút (mục 1) |
| `loadChildren` | `(node, { signal }) => Promise<Array>` |
| `value` / `getValue()` / `setValue(v)` | giá trị hiện tại (im lặng) |
| `expand(value)` / `collapse(value)` | mở / đóng một nút đã tải (không event) |
| `expandAll()` / `collapseAll()` | mọi nút đã tải |
| `filter(query)` | lọc (mục 6) |
| `getNode(value)` | object gốc của app hoặc `null` |
| `focus()` | focus tab stop của cây |
| `setError(msg)` / `clearError()` / `checkValidity()` / `reportValidity()` | contract form chung |

Văn bản: `TdTree.labels` (`search`, `empty`, `noResults`, `loading`, `loadError`, `results` — `{n}`, `required`).

## Event

Chỉ phát khi **người dùng** thao tác — không phát khi `setValue` / gán `data` / `expand()`.

| Event | `detail` | Khi nào |
|---|---|---|
| `change` | `{ value, added, removed }` | đổi lựa chọn (`single`: `value` là chuỗi, `''` khi trống) |
| `activate` | `{ value, node }` | `selection="none"`: Enter / Space / bấm hàng (nút không khoá) |
| `expanded-change` | `{ value, expanded }` | mở / đóng bằng chuột / bàn phím (không dùng tên `toggle` — trùng sự kiện native) |
| `load-error` | `{ value, error }` | `loadChildren` reject / trả về không phải mảng |

## Form

- Mỗi giá trị **một** entry dưới `name` nguyên văn. `single` → 0 / 1 entry; `multiple` → theo **thứ tự cây**
  (preorder), giá trị chưa tải (lazy) nối sau theo thứ tự nhận.
- `required` → `valueMissing` khi rỗng (mục khoá đã chọn tính là có giá trị).
- **Reset** → giá trị mặc định (attribute `value` / property gán sớm, chụp lúc kết nối lần đầu). **Khôi phục**
  (bfcache) = JSON mảng giá trị.
- **Giá trị chưa có trong cây** (một luật cho `single` lẫn `multiple`): cây **chưa đủ** (chưa có `data`, hoặc còn nhánh
  lazy chưa tải) → **giữ** (vẫn gửi); một lần tải đưa nút vào → thành giá trị thường (đúng vị trí, nhãn thật), không
  phát `change`; cây **đủ** mà vẫn không thấy → **bỏ** + một cảnh báo, không phát `change`.

## Tuỳ biến giao diện

| Token | Mặc định | Tác dụng |
|---|---|---|
| `--td-tree-indent` | `1.25rem` | thụt lề mỗi cấp (trên `ul[role=group]`) |
| `--td-tree-row-h` | `2rem` (cảm ứng: `--td-touch-min`) | chiều cao tối thiểu một hàng |
| `--td-tree-row-hover` | `var(--td-color-hover)` | nền hàng khi rê chuột |
| `--td-tree-row-selected` | `var(--td-color-hover-strong)` | nền hàng đã chọn (`single`) |
| `--td-tree-row-active` / `--td-tree-row-active-line` | `--td-color-hover-strong` / `--td-control-border-hover` | hàng đang trỏ khi focus ảo (trong tree-select) |
| `--td-tree-check-radius` | `var(--td-checkbox-radius)` | **Deprecated 0.36.0, không còn tác dụng** (ô check là ô tick chung). Muốn ô vuông: `--td-checkbox-radius` (đổi cả checkbox và mọi ô tick) |

Ô check dùng `--td-checkbox-color` / `--td-checkbox-border` / `--td-checkbox-radius` / `--td-accent-contrast`; chữ dùng token field
(`--td-field-fg`, `--td-field-note`, `--td-field-fg-disabled`, `--td-field-focus`). Cây là control nội dung: nền đặc,
không blur.

## Cấu trúc DOM & class

```html
<td-tree id="{h}">
  <div class="td-tree" data-selection="none|single|multiple">
    <label class="td-field__label" id="{h}-label">Chuyên mục</label>              <!-- khi có label -->
    <input type="search" class="td-tree__search" aria-controls="{h}-tree">        <!-- khi searchable -->
    <ul role="tree" class="td-tree__list" id="{h}-tree" aria-labelledby="{h}-label" [aria-multiselectable="true"]>
      <li role="treeitem" class="td-tree__item" id="{h}-n{uid}" tabindex="0|-1" aria-level="1" aria-setsize="3"
          aria-posinset="1" aria-labelledby="{h}-n{uid}-l" [aria-describedby] [aria-expanded] [aria-selected | aria-checked]
          [aria-disabled="true"] [aria-busy="true"] [data-load="error"]>
        <div class="td-tree__row">
          <span class="td-tree__toggle" aria-hidden="true"><svg …/></span>
          <span class="td-check td-check--sm td-tree__check" aria-hidden="true"><svg …✓/></span>   <!-- multiple; 0.36.0 -->
          <span class="td-tree__label" id="{h}-n{uid}-l">Điện thoại</span>
          <span class="td-tree__desc" id="{h}-n{uid}-d">…</span>
        </div>
        <ul role="group" class="td-tree__group">…</ul>                              <!-- chỉ khi đang mở -->
      </li>
    </ul>
    <p class="td-tree__empty" hidden>…</p>
    <p class="td-sr-only" id="{h}-status" role="status"></p>
  </div>
</td-tree>
```

`tree` / `group` chỉ chứa `treeitem`; thông báo trống và vùng đọc nằm **ngoài** `ul`. Id lấy từ bộ đếm (`uid`), không
bao giờ từ dữ liệu. Thụt lề bằng lồng `group` (CSS), không `style=""`.

## Bàn phím & trợ năng

| Phím | Hành động |
|---|---|
| ↓ / ↑ | nút hiện kế / trước (không vòng) |
| → | đang đóng → mở; đang mở → con đầu; lá → không gì |
| ← | đang mở → đóng; đóng / lá → nút cha |
| Home / End | nút hiện đầu / cuối |
| chữ cái | type-ahead (500 ms, không phân biệt dấu) |
| `*` | mở mọi anh em cùng cấp **đã tải** (nhánh lazy chưa tải không bị tải) |
| Enter / Space | `single` chọn, `multiple` lật check, `none` phát `activate` |

RTL (`dir="rtl"` tính được) đổi vai ← / →. Một tab stop (roving tabindex); thu gọn nhánh đang chứa focus → focus về nút
đó. Mỗi `treeitem` có `aria-labelledby` (nếu không, tên tính từ nội dung `li` sẽ gộp cả chữ của các con) và
`aria-level` / `aria-setsize` / `aria-posinset` tường minh (khi lọc: tính trên các anh em đang hiện). Tên cây: `label` >
`aria-label` của host > `<label for>` ngoài. Không có PageUp / PageDown, Shift-dải, Ctrl+A.

## Bảo mật

Nhãn, mô tả, dữ liệu tải về và `TdTree.labels` chỉ đi qua `textContent` / `setAttribute` — không có hatch HTML, không
hook render nút. Id từ bộ đếm, không ghép từ dữ liệu. Không `style=""` (CSP strict). Nút khoá chỉ là khoá **giao diện**:
server luôn tự kiểm quyền.

## Cảm ứng

- Hàng cây có hình nhấn (`--td-option-pressed-bg`); hover chỉ trên con trỏ mịn.

Chuẩn chung: [Cảm ứng](../guides/touch.md).

## Lưu ý & lỗi thường gặp

- **`name="perms"` chỉ nhận giá trị cuối trong PHP** — dùng `name="perms[]"`.
- **Gán `value` (JSON) cho `multiple` qua attribute** phải là JSON hợp lệ: `value='["a","b"]'` (nháy đơn bên ngoài).
- **`cascade` cùng `loadChildren` / nút `hasChildren` chưa tải** → cảnh báo, chạy như chọn nhiều độc lập.
- **Dữ liệu > 5.000 nút** → dùng `loadChildren`.
- Cần lưu trạng thái mở → nghe `expanded-change` (kit không tự lưu). Kéo thả sắp xếp, sửa / xoá nút tại chỗ là
  non-goal (ghép bằng `td-table` / menu).

## Xem thêm

- [Tree select](tree-select.md) — chọn nút của cây trong một ô gọn (combobox), có helper PHP `td_tree_select`
- [Chip input](chip-input.md) — chọn nhiều có chip gỡ được
- [Hướng dẫn Form](../guides/forms.md)
