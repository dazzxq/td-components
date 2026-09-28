[Tài liệu](../README.md) › [Components](README.md) › Table

# Bảng dữ liệu — `<td-table>`

Bảng dữ liệu có sắp xếp theo cột, phân trang (trên + dưới), trạng thái đang tải (skeleton), trạng thái rỗng và
header dính khi cuộn. Cột và dữ liệu đưa vào bằng **JS property** (`columns`, `data`), hỗ trợ cả chế độ client (bảng tự
sort + cắt trang) lẫn chế độ server (bạn tự gọi API mỗi trang). Dùng cho danh sách dạng hàng/cột; **không** dùng để
dàn layout (dùng CSS grid) và không dùng cho bảng tĩnh vài dòng không cần sort/phân trang (viết `<table>` thường).

| | |
|---|---|
| Import | `import '@dazzxq/td-components/table'` (class: `import { TdTable } from '@dazzxq/td-components'`) |
| Loại | Custom element |
| Form-associated | không |
| Từ phiên bản | 0.1.0 (token-native từ 0.10.0: cần `td.css`) |

Import `table` tự import luôn `td-pagination` và `td-empty-state` (bảng dùng hai component đó bên trong), bạn không
cần import riêng.

## Ví dụ nhanh

```html
<td-table id="users" title="Danh sách người dùng" per-page="10"></td-table>

<script type="module">
  import '@dazzxq/td-components/table';

  const table = document.getElementById('users');
  table.columns = [
    { key: 'id', label: 'ID', sortable: true, width: '80px', widthType: 'fixed', align: 'right' },
    { key: 'name', label: 'Tên', sortable: true },
    { key: 'email', label: 'Email' },
  ];
  table.data = [
    { id: 1, name: 'An', email: 'an@example.com' },
    { id: 2, name: 'Bình', email: 'binh@example.com' },
  ];
</script>
```

Thứ tự gán `columns` / `data` trước hay sau khi element vào trang đều được: nếu element chưa render, bảng giữ lại giá
trị và dùng khi render lần đầu.

## Cách dùng

### 1. Chế độ client (mặc định): đưa hết dữ liệu, bảng tự sort + phân trang

```js
const table = document.querySelector('td-table');
table.columns = [
  { key: 'name', label: 'Tên', sortable: true },
  { key: 'age', label: 'Tuổi', sortable: true, align: 'right' },
];
table.data = rows;          // mảng object; gán lại → quay về trang 1
```

- Bấm tiêu đề cột `sortable` → sort theo vòng **tăng → giảm → bỏ sort**. Mỗi lần đổi sort bảng quay về trang 1.
- Cách so sánh: nếu cả hai giá trị là `number` → so số; còn lại so chuỗi bằng
  `Intl.Collator('vi', { numeric: true, sensitivity: 'base' })` (chữ có dấu đứng cạnh chữ gốc, "item 9" trước
  "item 10", không phân biệt hoa thường). Giá trị `null`/`undefined` đứng **đầu** khi tăng dần, **cuối** khi giảm dần.
- Cột có `render` vẫn sort theo `row[key]` (giá trị gốc), không theo nội dung đã render.

### 2. Chế độ server: mỗi lần chỉ đưa một trang

```html
<td-table id="orders" title="Đơn hàng" server-mode per-page="20" total-items="0"></td-table>
```

```js
const table = document.getElementById('orders');
table.columns = [
  { key: 'code', label: 'Mã', sortable: true },
  { key: 'total', label: 'Tổng tiền', sortable: true, align: 'right' },
];

let sort = { key: null, direction: null };

async function load(page) {
  table.setLoading(true);
  try {
    const res = await fetch(`/api/orders?page=${page}&sort=${sort.key ?? ''}&dir=${sort.direction ?? ''}`);
    const json = await res.json();
    table.setAttribute('total-items', String(json.total)); // BẮT BUỘC trong server mode
    table.data = json.items;                               // server mode: giữ nguyên trang hiện tại
  } finally {
    table.setLoading(false);
  }
}

table.onPageChange = (page) => load(page);
table.onSort = (s) => {
  sort = s;                 // { key, direction }; direction null = bỏ sort
  table.setPage(1);         // không tự quay về trang 1 trong server mode
  load(1);
};

load(1);
```

Khác biệt so với chế độ client:

- Bảng **không** tự sort và **không** cắt trang: `data` được hiển thị nguyên như bạn đưa.
- Gán `data` **không** đưa về trang 1 (giữ trang hiện tại).
- `total-items` là **bắt buộc**. Thiếu nó thì hàng vẫn hiện nhưng cả hai thanh phân trang bị ẩn và console in đúng
  một cảnh báo `td-table: server-mode needs \`total-items\`…`.
- `onSort` và `onPageChange` chỉ được gọi trong chế độ server (xem [Hook & tuỳ chọn](#hook--tuỳ-chọn)).

### 3. Ô tuỳ biến bằng `render` (nút, badge, link)

```js
table.columns = [
  { key: 'name', label: 'Tên', sortable: true },
  {
    key: 'actions',
    label: 'Thao tác',
    align: 'right',
    render: (row) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'td-btn td-btn--secondary td-btn--sm';
      btn.textContent = 'Sửa';
      btn.addEventListener('click', () => openEditor(row.id));
      return btn; // trả về Node: cách được khuyến nghị
    },
  },
];
```

`render(row, rowIdxInPage)` nhận object của hàng và **chỉ số hàng trong trang hiện tại** (0-based, không phải chỉ số
trong toàn bộ `data`). Giá trị trả về:

| Trả về | Bảng làm gì |
|---|---|
| `Node` (Element, Text, DocumentFragment…) | `appendChild` vào ô. **Khuyến nghị**: dữ liệu hàng không bao giờ thành markup. |
| `string` | Gán `innerHTML` — coi là **HTML tin cậy do developer viết** (xem [Bảo mật](#bảo-mật)). |
| giá trị khác (`number`, `null`…) | Hiển thị dạng text (`textContent`), `null`/`undefined` → ô trống. |
| (ném lỗi) | Ô đó để trống, lỗi ghi `console.error`; các ô và hàng khác vẫn render (từ 0.16.0). |

Nếu chỉ cần hiện text đã định dạng, trả về chuỗi qua một Text node để tránh HTML:
`render: (row) => document.createTextNode(formatMoney(row.total))`.

### 4. Cột rộng cố định, cắt chữ dài (ellipsis)

```js
table.columns = [
  { key: 'id', label: 'ID', width: '64px', widthType: 'fixed', align: 'right' },
  { key: 'name', label: 'Tên', minWidth: '160px' },
  { key: 'note', label: 'Ghi chú', ellipsis: true },
];
```

- `widthType: 'fixed'` + `width` → ô có `width`, `min-width`, `max-width` bằng nhau.
- Mặc định `widthType` là `'flexible'`: `width` của ô là `auto`, chỉ `minWidth` / `maxWidth` được áp. **Lưu ý**: ở
  chế độ flexible, `width` không được áp làm độ rộng, nhưng một `width` hợp lệ vẫn bật `table-layout: fixed` cho cả
  bảng. Muốn cột rộng đúng `width` thì đặt `widthType: 'fixed'`.
- `ellipsis: true` → nội dung một dòng, cắt bằng `…`, toàn văn nằm trong `title` (hover thấy). Cột ellipsis cũng bật
  `table-layout: fixed`.

### 5. Header dính khi cuộn (sticky header)

```html
<td-table title="Nhật ký" max-height="320px" per-page="50"></td-table>
```

`max-height` nhận **bất kỳ giá trị CSS `max-height` hợp lệ** (`320px`, `50vh`, `min(60vh, 480px)`…). Bảng cuộn bên trong
khung thẻ, hàng tiêu đề dính trên cùng với nền đặc. Giá trị được kiểm bằng `CSS.supports('max-height', v)`, dài tối đa
200 ký tự, cấm `url(`, `var(`, `image-set(`, `;`, `{`, `}`. Giá trị bị từ chối → không sticky + một cảnh báo console.

### 6. Đang tải và rỗng

```js
table.setLoading(true);           // = table.setAttribute('loading', '')
const rows = await fetchRows();
table.data = rows;
table.setLoading(false);
```

- Khi `loading`: `<table aria-busy="true">`, hiện `loading-rows` hàng skeleton (mặc định 5, tối đa 50, `aria-hidden`),
  ẩn hai thanh phân trang, vùng `role="status"` ẩn đọc "Đang tải dữ liệu…". `thead` giữ nguyên nên focus trên nút sort
  không mất.
- Khi không loading và không có hàng: hiện `<td-empty-state compact size="sm">` trong một ô trải hết số cột, với
  `empty-title` / `empty-text` (mặc định "Không có dữ liệu" / "Chưa có dữ liệu để hiển thị."). Heading của empty state
  lấy cấp `heading-level + 1` nếu bảng có `title`, ngược lại là `h3`.

```html
<td-table title="Đơn hàng" empty-title="Chưa có đơn hàng" empty-text="Đơn hàng mới sẽ xuất hiện ở đây."></td-table>
```

### 7. Đổi khoảng đệm ngang của ô (`cellPaddingClass`)

```js
table.cellPaddingClass = 'px-2'; // px-0 … px-6
```

Chỉ nhận đúng 7 giá trị `px-0`…`px-6` (từ vựng cũ của DCMS/Tailwind). Bảng **không** gắn chuỗi `px-2` làm class; nó đổi
thành modifier `td-table__cell--px-2` trên mọi `th`, `td` và ô skeleton. Giá trị khác bị bỏ qua + một cảnh báo.

| Giá trị | Padding ngang |
|---|---|
| `px-0` | `0` |
| `px-1` | `0.25rem` |
| `px-2` | `0.5rem` |
| `px-3` | `0.75rem` |
| `px-4` | `1rem` |
| `px-5` | `1.25rem` |
| `px-6` | `1.5rem` (bằng mặc định `--td-table-cell-px`) |

Muốn giá trị khác, override token `--td-table-cell-px` (xem [Tuỳ biến giao diện](#tuỳ-biến-giao-diện)).

## Attribute

| Attribute | Kiểu | Mặc định | Mô tả |
|---|---|---|---|
| `title` | string | — | Tiêu đề bảng, render thành heading và đặt tên cho bảng (`aria-labelledby`). Vì `title` cũng là attribute HTML toàn cục, trình duyệt hiện nó thành tooltip khi hover lên component. |
| `heading-level` | number | `3` | Cấp heading của tiêu đề, 2–6; ngoài khoảng → 3. |
| `aria-label` | string | — | Tên của bảng khi **không** có `title`. Không có cả hai → `TdTable.labels.table` ("Bảng dữ liệu"). |
| `per-page` | number | `10` | Số hàng mỗi trang, kẹp trong 1–10000. |
| `active-color` | string (màu) | token của td-pagination | Màu nút trang hiện tại, chuyển cho cả hai `td-pagination`. Qua `safeColor`; giá trị không an toàn bị bỏ. |
| `zebra` | tri-state | bật | Kẻ sọc hàng chẵn. **Không phải** boolean: vắng mặt = bật; tắt bằng `zebra="false"`, `"0"` hoặc `"off"`. |
| `max-height` | CSS `max-height` | — | Bảng cuộn bên trong, header dính (xem trên). |
| `loading` | boolean | vắng | Trạng thái đang tải. |
| `loading-rows` | number | `5` | Số hàng skeleton, kẹp 1–50. |
| `empty-title` | string | `TdTable.labels.emptyTitle` | Tiêu đề trạng thái rỗng. |
| `empty-text` | string | `TdTable.labels.emptyText` | Nội dung trạng thái rỗng. |
| `server-mode` | boolean | vắng | Chế độ server: không sort/cắt trang ở client, `data` giữ trang. |
| `total-items` | number | — | Tổng số mục phía server. **Bắt buộc** khi `server-mode`. |

Các attribute `title`, `heading-level`, `zebra`, `max-height` khi đổi sẽ dựng lại cấu trúc bảng; mọi attribute khác
cập nhật tại chỗ (focus được giữ).

## Property & method

| Thành viên | Kiểu / chữ ký | Mô tả |
|---|---|---|
| `columns` | `Array<ColumnDef>` | Định nghĩa cột (bảng dưới). Giá trị không phải mảng → `[]`. Gán lại → dựng lại cấu trúc; nếu cột đang sort không còn `sortable` ở cùng vị trí thì sort bị bỏ. |
| `data` | `Array<object>` | Các hàng. Setter gọi `setData()`. |
| `cellPaddingClass` | `string` | `'px-0'`…`'px-6'` hoặc `''` để bỏ. |
| `zebra` | `boolean` | Getter trả trạng thái thực. `el.zebra = false` ghi `zebra="false"`; `true` xoá attribute (về mặc định bật). |
| `onSort` | `({ key, direction }) => void` | Xem [Hook](#hook--tuỳ-chọn). |
| `onPageChange` | `(page: number) => void` | Xem [Hook](#hook--tuỳ-chọn). |
| `setData(data)` | `(Array) => void` | Thay dữ liệu. Client: về trang 1. Server: giữ trang. |
| `setPage(page)` | `(number) => void` | Chuyển trang (kẹp vào khoảng hợp lệ khi hiển thị). **Không** gọi `onPageChange`, không phát `page-change`. |
| `setLoading(bool)` | `(boolean) => void` | Bật/tắt attribute `loading`. |
| `getState()` | `() => { columns, data, page, perPage, sort: { key, direction } }` | Trạng thái hiện tại; `sort.key` là `key` gốc của cột. |
| `update(opts)` | `({ columns?, data?, page?, onSort?, onPageChange? }) => void` | Gộp nhiều thay đổi một lần. `columns`/`data` không phải mảng bị bỏ qua (không throw). `data` theo quy tắc trang của `setData`, sau đó `page` (nếu có) được áp. |
| `TdTable.labels` | static object | Chuỗi hiển thị, site ghi đè được (xem dưới). |

### `ColumnDef`

| Khoá | Kiểu | Mặc định | Mô tả |
|---|---|---|---|
| `key` | string \| number | — | Khoá lấy giá trị `row[key]`. Có thể trùng, là số (kể cả `0`) hoặc thiếu: cột được xác định theo **vị trí (index)**, không theo `key`. |
| `label` | string | `''` | Tiêu đề cột, luôn được escape. |
| `sortable` | boolean | `false` | Tiêu đề thành nút sort. |
| `width` | CSS dimension | — | Chỉ áp làm độ rộng khi `widthType: 'fixed'`. |
| `widthType` | `'fixed'` \| `'flexible'` | `'flexible'` | Xem cách dùng số 4. |
| `minWidth` / `maxWidth` | CSS dimension | — | Chỉ áp khi flexible. |
| `align` | `'left'` \| `'center'` \| `'right'` \| `'justify'` | — | `text-align` cho cả `th` và `td` của cột. Giá trị khác bị bỏ. |
| `ellipsis` | boolean | `false` | Một dòng, cắt `…`, toàn văn trong `title`. |
| `render` | `(row, rowIdxInPage) => Node \| string \| any` | — | Ô tuỳ biến (xem cách dùng số 3). |

"CSS dimension" = số kèm đơn vị tuỳ chọn trong `px`, `em`, `rem`, `%`, `vh`, `vw`, `ch`, `fr` (ví dụ `120px`, `20%`,
`12rem`). Giá trị khác (có `calc()`, `;`…) bị bỏ qua. Mọi style cột được áp bằng CSSOM, không có `style="…"`.

### `TdTable.labels`

```js
import { TdTable } from '@dazzxq/td-components';
Object.assign(TdTable.labels, {
  table: 'Data table',
  loading: 'Loading…',
  paginationTop: 'Pagination (top)',
  paginationBottom: 'Pagination (bottom)',
  itemLabel: 'items',
  emptyTitle: 'No data',
  emptyText: 'Nothing to show yet.',
});
```

| Khoá | Mặc định | Dùng ở |
|---|---|---|
| `table` | `Bảng dữ liệu` | Tên bảng khi không có `title` / `aria-label` |
| `loading` | `Đang tải dữ liệu…` | Thông báo `role="status"` khi loading |
| `paginationTop` | `Phân trang (trên)` | `aria-label` của phân trang trên |
| `paginationBottom` | `Phân trang (dưới)` | `aria-label` của phân trang dưới |
| `itemLabel` | `mục` | `item-label` của hai phân trang ("Hiển thị 1-10 / 47 mục") |
| `emptyTitle` | `Không có dữ liệu` | Tiêu đề rỗng khi không có `empty-title` |
| `emptyText` | `Chưa có dữ liệu để hiển thị.` | Nội dung rỗng khi không có `empty-text` |

Đổi `labels` trước khi bảng render (ngay sau import). Các nhãn bên trong `td-pagination` ("Trang trước", "Trang N",
"Hiển thị …") đổi qua `TdPagination.labels`, xem [pagination.md](pagination.md#tdpaginationlabels).

## Event

| Event | detail | Khi nào | bubbles? |
|---|---|---|---|
| `sort-change` | `{ key, direction }` — `direction` là `'asc'`, `'desc'` hoặc `null`; `key` là `null` khi bỏ sort | Người dùng bấm nút sort (cả hai chế độ). Phát **trước** `onSort`. | có (composed) |
| `page-change` | `{ page }` | Người dùng đổi trang ở một trong hai `td-pagination` bên trong. Event này phát từ `td-pagination` và nổi bọt qua host, nên nghe trên `td-table` được; `e.target` là phần tử `td-pagination`. | có (composed) |

```js
table.addEventListener('sort-change', (e) => console.log(e.detail)); // { key: 'name', direction: 'asc' }
table.addEventListener('page-change', (e) => console.log(e.detail.page));
```

## Hook & tuỳ chọn

| Hook | Chữ ký | Được gọi khi |
|---|---|---|
| `onSort` | `({ key, direction }) => void` | **Chỉ trong `server-mode`**, sau mỗi lần đổi sort (sau event `sort-change`). Ở chế độ client bảng tự sort và **không** gọi `onSort`; muốn biết sort đổi thì nghe `sort-change`. |
| `onPageChange` | `(page) => void` | **Chỉ trong `server-mode`**, khi người dùng đổi trang. Bảng đồng bộ số trang cho thanh còn lại rồi chờ bạn gán `data` mới. Ở chế độ client, nghe event `page-change`. |

Gán giá trị không phải function → hook bị xoá (`null`). Giá trị trả về bị bỏ qua. Hook ném lỗi → lỗi được ghi
`console.error`, bảng vẫn giữ trạng thái đúng (sort đã đổi, hai thanh phân trang đồng bộ) (từ 0.16.0). Cũng có thể đặt
cả hai qua `update({ onSort, onPageChange })`.

## Tuỳ biến giao diện

Token (khai báo trong `@layer td.tokens`, override bằng CSS không layer của site):

| Token | Mặc định | Tác dụng |
|---|---|---|
| `--td-table-bg` | `var(--td-color-surface)` | Nền thẻ bảng |
| `--td-table-fg` | `var(--td-color-text)` | Màu chữ |
| `--td-table-border` | `var(--td-color-border)` | Viền thẻ, viền header/footer |
| `--td-table-radius` | `var(--td-radius-lg)` | Bo góc thẻ |
| `--td-table-shadow` | `var(--td-shadow-1)` | Bóng thẻ |
| `--td-table-head-bg` | `var(--td-color-surface-muted)` | Nền hàng tiêu đề |
| `--td-table-head-fg` | `var(--td-color-text-muted)` | Chữ tiêu đề cột |
| `--td-table-head-sticky-bg` | `var(--td-color-surface-muted)` | Nền tiêu đề khi sticky (cố ý đặc) |
| `--td-table-sort-icon` | `var(--td-color-text-subtle)` | Màu icon sort khi cột chưa sort |
| `--td-table-row-border` | `var(--td-color-border)` | Đường kẻ giữa các hàng |
| `--td-table-row-hover` | `var(--td-color-hover)` | Nền hàng khi hover / focus-within |
| `--td-table-zebra` | `rgb(0 0 0 / 2%)` (dark: `rgb(255 255 255 / 3%)`) | Nền hàng chẵn khi zebra |
| `--td-table-cell-px` | `1.5rem` | Padding ngang ô |
| `--td-table-cell-py` | `1rem` | Padding dọc ô dữ liệu |
| `--td-table-head-py` | `0.75rem` | Padding dọc ô tiêu đề |
| `--td-table-skeleton` | `var(--td-color-skeleton)` | Màu thanh skeleton |
| `--td-table-sheen` | `var(--td-color-sheen, rgb(255 255 255 / 60%))` (dark: `…8%`) | Vệt sáng shimmer |

`--td-table-max-h` do JS đặt (CSSOM) từ attribute `max-height`; không đặt tay.

```css
/* CSS của site — không bọc trong @layer để thắng td.tokens */
:root {
  --td-table-cell-py: 0.625rem;     /* bảng gọn hơn */
  --td-table-radius: 8px;
}
#orders { --td-table-zebra: transparent; } /* chỉ bảng này */
```

Ẩn cột trên màn hình nhỏ bằng `data-col-key` (có trên mọi `th`/`td`):

```css
@media (max-width: 640px) {
  #users [data-col-key="email"] { display: none; }
}
```

## Cấu trúc DOM & class

Cấu trúc được render **một lần**; dữ liệu, sort, trang, loading và số đếm được cập nhật tại chỗ.

```html
<td-table>
  <div class="td-table td-table--zebra [td-table--fixed] [td-table--scroll-y]" data-state="ready|loading|empty">
    <div class="td-table__header" [hidden]>
      <h3 class="td-table__title" id="{host-id}-title">…</h3>
      <div class="td-table__pagination" [hidden]><td-pagination quiet aria-label="Phân trang (trên)"></td-pagination></div>
    </div>
    <div class="td-table__scroll" [tabindex="0" role="region" aria-labelledby|aria-label]>
      <table class="td-table__table" aria-labelledby="{host-id}-title" | aria-label="…" [aria-busy="true"]>
        <thead class="td-table__head"><tr>
          <th class="td-table__th" scope="col" data-col="0" data-col-key="name" [aria-sort="ascending|descending"]>
            <button type="button" class="td-table__sort" data-sort-col="0">
              <span class="td-table__sort-label">Tên</span>
              <span class="td-table__sort-icon" aria-hidden="true" data-sort-icon="sort"><svg width="14" height="14" class="td-icon" data-icon="sort" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/></svg></span>  <!-- up / down khi đang sort -->
            </button>
          </th>
        </tr></thead>
        <tbody class="td-table__body">
          <tr class="td-table__row" data-row-idx="0">
            <td class="td-table__cell [td-table__cell--ellipsis] [td-table__cell--px-N]" data-col="0" data-col-key="name">…</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="td-table__footer" [hidden]>
      <div class="td-table__pagination td-table__pagination--bottom"><td-pagination aria-label="Phân trang (dưới)"></td-pagination></div>
    </div>
    <p class="td-sr-only" role="status"></p>
  </div>
</td-table>
```

- Modifier của khối: `td-table--zebra`, `td-table--fixed` (table-layout fixed), `td-table--scroll-y` (có `max-height`).
- Trạng thái: `data-state` trên `.td-table`, `aria-busy` trên `table`, `aria-sort` trên `th`, `[hidden]` trên các khung.
- Hàng skeleton: `tr.td-table__row.td-table__row--skeleton[aria-hidden="true"]` > `td > span.td-table__skeleton`.
- Hàng rỗng: `tr.td-table__empty-row > td.td-table__empty[colspan] > td-empty-state`.
- Ô ellipsis: `td.td-table__cell--ellipsis > div.td-table__truncate[title]`.
- Id tiêu đề: `{id của host}-title`, host không có id thì `td-table-{n}-title`.
- Markup chuẩn là khối ở trên (bảng luôn do JS render từ `columns` / `data`; không có helper PHP). Fixture
  `test/contracts/table.html` trong repo kit chỉ dùng cho test (không nằm trong gói npm).

## Bàn phím & trợ năng

- Nút sort là `<button>` thật: Tab tới, Enter/Space để sort. Sau khi sort, **focus ở lại đúng nút** vừa bấm (`thead`
  không bị dựng lại). Cột đang sort có `aria-sort` trên `th`.
- Đổi trang cũng giữ focus trên nút trang; nếu phân trang bị ẩn tạm (loading) rồi hiện lại, focus trả về nút trang
  hiện tại.
- Chỉ phân trang **dưới** có vùng `aria-live`; phân trang trên là `quiet`, nên mỗi lần đổi trang chỉ được đọc một lần.
- Khi bảng rộng/cao hơn khung, `.td-table__scroll` thành `role="region"` có tên và `tabindex="0"` để người dùng bàn
  phím cuộn được (WCAG 2.1.1); hết tràn thì bỏ các attribute đó. Theo dõi bằng `ResizeObserver`.
- Tên bảng: `title` → `aria-labelledby`; không có thì `aria-label` của host; không có nữa thì `TdTable.labels.table`.
- Loading: `aria-busy="true"` + một thông báo trạng thái; skeleton `aria-hidden`.
- Tôn trọng `prefers-reduced-motion` (tắt shimmer, transition) và forced colors (viền `CanvasText`, hover outline).

## Bảo mật

- `label`, `key`, giá trị ô thường, `title`, `empty-title`, `empty-text` **luôn được escape**. Dữ liệu người dùng đưa vào
  `data` hiển thị an toàn khi không dùng `render`.
- `render` trả **chuỗi** = cửa sau HTML tin cậy: chuỗi được gán `innerHTML` nguyên văn. Chỉ trả chuỗi do chính bạn viết;
  nếu phải chèn dữ liệu người dùng vào chuỗi thì tự escape từng giá trị. Cách an toàn nhất là **trả về Node**
  (`textContent`, `createElement`). Chuỗi HTML chứa `style="…"` hay `<script>` cũng là trách nhiệm tuân thủ CSP của bạn.
- `width` / `minWidth` / `maxWidth` qua whitelist dimension, `align` qua whitelist, `max-height` qua `CSS.supports` +
  cấm `url()`/`var()`; `active-color` qua `safeColor`. Chi tiết: [guides/security.md](../guides/security.md).

## Lưu ý & lỗi thường gặp

- **`render` chạy lại mỗi lần cập nhật** (đổi trang, sort, tắt loading, gán `data`…): `tbody` được dựng mới. Vì vậy hàm
  `render` phải tạo Node **mới** mỗi lần gọi (trả về cùng một Node sẽ bị "chuyển" giữa các ô) và nên rẻ.
- **`width` không có tác dụng** nếu thiếu `widthType: 'fixed'` (chỉ bật table-layout fixed). Xem cách dùng số 4.
- **`onSort` / `onPageChange` im lặng ở chế độ client**: đó là thiết kế, hãy nghe event `sort-change` / `page-change`.
- **Server mode quên `total-items`**: phân trang bị ẩn + cảnh báo. Đặt attribute sau mỗi lần tải.
- **Server mode đổi sort không về trang 1**: tự gọi `setPage(1)` rồi tải lại (như ví dụ trên).
- **`zebra="true"` hay `zebra=""` vẫn là bật**; chỉ `false` / `0` / `off` tắt.
- `setPage()` chỉ đổi hiển thị; ở server mode nó **không** gọi `onPageChange`, bạn phải tự tải trang đó.
- `per-page` đổi lớn hơn làm số trang giảm: trang hiện tại được kẹp lại, không rơi vào trạng thái rỗng.
- `title` hiện tooltip trình duyệt khi hover lên cả bảng (hành vi của attribute HTML toàn cục). Nếu không muốn,
  dùng `aria-label` và tự viết heading ngoài bảng.

## Xem thêm

- [Pagination](pagination.md), [Empty state](empty-state.md), [Icons](icons.md) (icon `up` / `down` / `sort`)
- [Theming](../customization/theming.md) · [Styling](../customization/styling.md) · [Hooks](../customization/hooks.md)
- [Bảo mật](../guides/security.md) · [Trợ năng](../guides/accessibility.md)
