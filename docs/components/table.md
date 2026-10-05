[Tài liệu](../README.md) › [Components](README.md) › Table

# Bảng dữ liệu — `<td-table>`

Bảng dữ liệu có sắp xếp theo cột, phân trang (trên + dưới), trạng thái đang tải (skeleton), trạng thái rỗng,
header dính khi cuộn, nút thao tác theo hàng, **dạng card tự động khi chỗ đặt hẹp** (từ 0.34.0) và **chọn dòng**
theo khoá (một / nhiều, chọn cả trang, Shift chọn dải, giữ qua trang — từ 0.37.0), **bộ lọc ngoài + chế độ
`controlled`** cho đồng bộ URL và **ẩn / hiện cột** (từ 0.39.0). Cột và dữ liệu đưa vào bằng **JS property** (`columns`, `data`), hỗ trợ cả chế độ client (bảng tự
sort + cắt trang) lẫn chế độ server (bạn tự gọi API mỗi trang). Dùng cho danh sách dạng hàng/cột; **không** dùng để
dàn layout (dùng CSS grid) và không dùng cho bảng tĩnh vài dòng không cần sort/phân trang (viết `<table>` thường).

| | |
|---|---|
| Import | `import '@dazzxq/td-components/table'` (class: `import { TdTable } from '@dazzxq/td-components'`) |
| Loại | Custom element |
| Form-associated | có từ 0.37.0, **chỉ để gửi khoá đã chọn** khi có `name` (không phải control nhập liệu: không `value` / validation) |
| Từ phiên bản | 0.1.0 (token-native từ 0.10.0: cần `td.css`) |

Import `table` tự import luôn `td-pagination`, `td-empty-state` và `TdMenu` (bảng dùng chúng bên trong), bạn không
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
- Mặc định `widthType` là `'flexible'`: `width` bị bỏ qua, chỉ `minWidth` / `maxWidth` được áp.
- `table-layout: fixed` (class `td-table--fixed`) **chỉ bật khi MỌI cột** là `widthType: 'fixed'` có `width` hợp lệ
  (từ 0.34.0; trước đó chỉ cần một cột có `width` hoặc `ellipsis` → cả bảng chia đều cột, chữ bị cắt "iPh…").
- `ellipsis: true` → nội dung một dòng, cắt bằng `…`, toàn văn nằm trong `title` (hover thấy). Nội dung bị giới hạn
  bằng `max-inline-size`: `maxWidth` của cột nếu có, không thì token `--td-table-ellipsis-max` (mặc định `18rem`).
- `nowrap: true` → giá trị không xuống dòng. **Mặc định bật cho `align: 'right'`** (số tiền không rớt "₫" xuống
  dòng); tắt bằng `nowrap: false`.

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

### 8. Nút thao tác theo hàng (`actions` + `row-action`)

```js
table.columns = [
  { key: 'code', label: 'Mã đơn', sortable: true },
  { key: 'total', label: 'Tổng tiền', align: 'right' },
  {
    key: 'act',
    label: 'Thao tác',
    actions: [
      { id: 'edit', label: 'Sửa', icon: 'pencil' },
      { id: 'print', label: 'In hoá đơn', hidden: (row) => !row.paid },
      { id: 'delete', label: 'Xoá', variant: 'danger', disabled: (row) => row.locked },
    ],
  },
];
table.addEventListener('row-action', (e) => {
  const { id, row, rowIndex } = e.detail; // id của action, object hàng, chỉ số hàng trong trang hiện tại
  if (id === 'edit') openEditor(row.code);
});
// hoặc: table.onRowAction = ({ id, row }) => { … };
```

- Mỗi action là một nút nhỏ `td-btn td-btn--sm td-btn--{variant}`. `variant` qua whitelist (`primary`, `secondary`,
  `success`, `danger`, `warning`, `info`, `ghost`; khác → `secondary`). `icon` là tên icon trong registry (không có → bỏ
  qua). `label` luôn là **text** (escape), không nhận HTML.
- `hidden(row)` true → action không render cho hàng đó; `disabled(row)` true → nút `disabled` (không phát sự kiện).
  Cũng nhận boolean. Hàm ném lỗi → coi là `true` (ẩn / khoá) + `console.error`.
- Chế độ bảng: các nút nằm inline trong ô. Chế độ card: **≤ 2** action hiện thẳng ở chân card; **> 2** → một nút
  "Thao tác" (icon `more`, nhãn `TdTable.labels.actions`) mở [`TdMenu`](menu.md) (APG menu button: Enter / Space / ↓
  mở, phím mũi tên chọn, Esc đóng); chọn một mục → `row-action` phát **đúng một lần**, focus trở về nút "Thao tác".
  Cả hai bộ nút cùng nằm trong DOM, CSS chỉ hiện một bộ theo chế độ (bộ kia `display: none` → không trùng tab stop).
- Cột có `actions` mặc định có vai trò card `actions` (chân card); `render` và giá trị `row[key]` của cột đó bị bỏ qua.
- Cột `render` tự viết nút vẫn dùng được; ở card nó nằm nguyên trong ô (đặt `card: 'actions'` để nằm ở chân card).
  Kit không đổi được node tuỳ ý của bạn thành menu.
- **Nút chỉ icon ở card** (0.36.1): ở dạng card, action có `icon` hợp lệ (và nút "Thao tác") chỉ hiện icon — nút
  vuông 32px (chuột) / 44 × 44px (cảm ứng), cách nhau 4px / 8px. Chữ vẫn nằm trong DOM (ẩn kiểu `td-sr-only`) nên tên
  đọc của nút **không đổi**, không cần `aria-label`. Dạng bảng giữ icon + chữ. Không có tooltip: icon phải **tự rõ
  nghĩa** (`pencil` = sửa, `trash` = xoá…); không thì bỏ `icon` để nút giữ chữ ở card.

### 9. Responsive: bảng thành card khi chỗ đặt hẹp

Từ 0.34.0 `td-table` tự chuyển thành **dạng card** khi **chính nó** hẹp (container query trên host, không phải theo
viewport): đặt bảng trong cột hẹp 320px của trang desktop cũng thành card, đặt full màn hình điện thoại cũng vậy.
Card là CSS thuần trên **cùng một DOM** — đổi độ rộng không render lại, không mất focus, sort / phân trang / loading /
empty / server mode / `max-height` giữ nguyên.

```html
<td-table title="Đơn hàng"></td-table>                     <!-- auto: card khi bảng < 720px -->
<td-table title="Đơn hàng" card-below="sm"></td-table>     <!-- card khi < 480px -->
<td-table title="Đơn hàng" card-below="lg"></td-table>     <!-- card khi < 1024px -->
<td-table title="Đơn hàng" layout="table"></td-table>      <!-- luôn là bảng (cuộn ngang) — hành vi cũ -->
<td-table title="Đơn hàng" layout="cards"></td-table>      <!-- luôn là card -->
```

| `layout` | Hành vi |
|---|---|
| `auto` (mặc định, cả giá trị lạ) | Card khi bề rộng của **bảng** nhỏ hơn ngưỡng `card-below`: `sm` = 480, `md` = 720 (mặc định, cả giá trị lạ), `lg` = 1024 (breakpoint của kit, [ADR 0014](../internal/decisions/0014-breakpoints-container-queries.md)). |
| `table` | Luôn là bảng: cuộn ngang bên trong `.td-table__scroll` (vùng cuộn focus được khi tràn), như trước 0.34. |
| `cards` | Luôn là card ở mọi độ rộng. |

**Vai trò cột trên card** (`card` trong `ColumnDef`, in ra `data-card` trên `th` / `td`):

| `card` | Trên card | Mặc định cho |
|---|---|---|
| `'lead'` (0.36.1) | Định danh ngắn (ID, mã, số thứ tự) **trước** primary trên dòng đầu: chữ nhỏ màu nhạt, số đều (`tabular-nums`), không nhãn; 12px chuột / 14px cảm ứng. Nhiều cột `lead` → nối nhau | cột **đầu tiên** khi một cột khác khai báo `card: 'primary'` |
| `'primary'` | Dòng đầu, chữ đậm (dài thì xuống dòng, không đẩy `lead`) | cột **đầu tiên** (khi không cột nào khai báo `primary`) |
| `'secondary'` | Cặp "nhãn: giá trị", xếp theo **độ dài nội dung**: cặp ngắn đứng chung dòng, cặp dài chiếm cả dòng (0.36.1; trước đó 1 cặp / dòng dưới 480px, 2 cặp từ 480px) | các cột còn lại |
| `'meta'` | Dòng chữ phụ (nhỏ, màu nhạt), các cột meta nối bằng " · " | — |
| `'actions'` | Cuối dòng meta, căn cuối (không đủ chỗ thì xuống dòng, vẫn căn cuối; không có meta → dòng riêng sau các cặp) | cột có `actions` |
| `false` | Không hiện trên card (vẫn ở DOM, vẫn hiện ở dạng bảng) | — |

**Suy luận vai trò** (0.36.1): bảng kiểu "ID trước" — cột ID đầu tiên không khai báo `card`, cột tiêu đề khai báo
`card: 'primary'` → ID tự thành `lead`, nằm trước tiêu đề trên cùng dòng (trước đây thành cặp "ID: 1" một dòng riêng).
Bảng không khai báo `card` nào giữ nguyên như 0.34 (cột đầu là `primary`). Kit không đoán "cột hẹp = ID".

```js
table.columns = [
  { key: 'id', label: 'ID', sortable: true },                  // → lead (vì title là primary)
  { key: 'title', label: 'Tiêu đề', sortable: true, card: 'primary' },
  { key: 'author', label: 'Tác giả' },                          // → secondary
  { key: 'date', label: 'Ngày', card: 'meta' },
  { key: 'act', label: 'Thao tác', actions: [{ id: 'edit', label: 'Sửa', icon: 'pencil' }] },
];
// Card: "1  Hướng dẫn Web Components" / "Tác giả: Duyệt" / "01/10/2026 ······ [✎]"
```

Muốn cột đầu vẫn là cặp như cũ: `card: 'secondary'` trên cột đó.

Ở dạng card:

- Hàng tiêu đề thành **thanh sắp xếp một hàng** (0.36.1): chỉ cột `sortable` hiện thành chip (cùng
  `button.td-table__sort`, `aria-sort` giữ nguyên, Enter / Space sort, focus ở lại nút); nhiều chip thì thanh **cuộn
  ngang** (ẩn thanh cuộn, bóng mờ ở mép còn chip; Tab tới chip bị khuất tự cuộn vào). Tiêu đề không sort được ẩn kiểu
  `td-sr-only` (vẫn là `columnheader` cho trình đọc màn hình, **không** `display: none`).
- Giá trị `ellipsis` nằm cùng dòng với nhãn của nó, cắt "…" ở mép card (0.36.1; trước đó rơi xuống dòng dưới nhãn).
- Mỗi hàng là một card nền đặc, một đường viền mảnh, không bóng, không kính (minimal surfaces). Zebra tắt; hover /
  focus-within giữ. Skeleton loading cũng có dạng card; empty-state trải hết chiều ngang.
- **Chọn dòng** (0.37.0): ô chọn (`.td-table__card-select`, `order: 0`) đứng đầu dòng đầu của card —
  `[chọn][lead][primary]`; "Chọn tất cả trên trang" là **chip đầu** của thanh sắp xếp (chữ hiện). Xem mục 10.

**Host cần bề rộng từ cha.** Host là `container: td-table / inline-size`: bề rộng của nó không còn phụ thuộc nội dung,
nên đặt bảng ở chỗ "co theo nội dung" (flex item `flex: 0 1 auto` trong hàng flex, `inline-block`, `float`, cột flex
`align-items: flex-start`) sẽ làm bảng co về gần 0. Đặt bảng là block bình thường, item grid, hoặc flex item có
`flex: 1` / `align-self: stretch` / `width: 100%`. Nhờ containment, bảng **không bao giờ đẩy rộng trang**: bảng rộng
cuộn bên trong (cả với `layout="table"`).

**Trình duyệt không có container query** (Chrome / Edge 102–104): `td.css` có sẵn fallback sinh tự động — card bật theo
**viewport** (cùng ngưỡng) thay vì theo bề rộng bảng. Đúng cho trang một cột trên điện thoại; trong cột hẹp trên
desktop thì bảng vẫn là bảng cuộn ngang như trước.

**Bóng mép cuộn ngang** (mọi chế độ): khi bảng rộng hơn khung, mép bị cắt có bóng mờ báo còn nội dung (CSS thuần
`background-attachment: local`, không JS, CSP an toàn). Màu: token `--td-table-edge-shadow`.

**Cảm ứng** (`pointer: coarse`): nút sort (cả chip ở card) và nút thao tác chỉ icon ở card tối thiểu 44 × 44px;
chuột: tối thiểu 24px (chip 32px).

Muốn giữ hành vi cũ ở mọi nơi: `layout="table"`.

### 10. Chọn dòng (`selectable` + `rowKey`) — từ 0.37.0

Bật bằng attribute `selectable` và **bắt buộc** cho bảng biết khoá của dòng (`row-key` / `rowKey`). Thiếu khoá → bảng
**không** hiện cột chọn và in một cảnh báo: chọn theo chỉ số dòng là sai ngay khi sort / đổi trang / dữ liệu đổi.

```html
<td-table id="posts" title="Bài viết" selectable row-key="id" per-page="20"></td-table>
```

```js
const table = document.querySelector('#posts');
table.columns = [{ key: 'id', label: 'ID' }, { key: 'title', label: 'Tiêu đề', card: 'primary' }, { key: 'author', label: 'Tác giả' }];
table.data = posts;
table.addEventListener('select-change', (e) => {
  console.log(e.detail); // { keys: [3, 7], added: [7], removed: [], trigger: 'toggle' }
});
```

**Chế độ** — `selectable` (vắng, `none`, `false`, `0`, `off` = tắt):

- `selectable` / `selectable="multiple"` (giá trị lạ cũng là `multiple`): mỗi dòng một ô tick + ô **"Chọn tất cả trên
  trang"** ở đầu header (ba trạng thái: chưa / một phần / tất cả).
- `selectable="single"`: chọn **một** dòng. Vẫn là ô tick (checkbox độc quyền, không phải radio): chọn dòng B khi A đang
  chọn thì A tự bỏ (một `select-change` có cả `added` lẫn `removed`); bấm lại dòng đang chọn → bỏ chọn (0 dòng). Không có
  ô chọn cả trang, không Shift dải, bỏ qua `max-selected`.
- Đổi `multiple → single` giữ khoá chọn **sau cùng**; tắt → bỏ hết. Đổi chế độ bằng code không phát event.

**Khoá dòng** (`rowKey`): tên trường (`row-key="id"` hoặc `table.rowKey = 'id'`) hoặc hàm
(`table.rowKey = (row) => row.shop + ':' + row.id`). Khoá hợp lệ: chuỗi khác rỗng, số hữu hạn, `bigint`. Bảng so khoá theo `String(key)` — số
`1` và chuỗi `"1"` là **một** dòng (API hay trả lẫn kiểu) — nhưng trả lại **đúng giá trị gốc** bạn đưa (lần đầu thấy) trong
`selectedKeys`. Dòng có khoá sai, khoá trùng (dòng thứ hai trở đi — sau khi so bằng `String(key)`, nên `1` và `"1"` là
trùng; chế độ client so trên **toàn bộ** `data`, chế độ server so trong trang) hoặc `rowKey` ném lỗi → ô tick bị khoá +
một cảnh báo mỗi loại. Đổi `rowKey` → bỏ hết lựa chọn (danh tính đổi), không event. Khoá **không** được in ra DOM.

**Thao tác của người dùng** (chỉ trên ô tick — bấm vào chỗ khác của dòng không chọn, để link / nút trong dòng vẫn dùng
được):

| Thao tác | Kết quả |
|---|---|
| Bấm ô tick / Space | Bật / tắt dòng đó (đặt "mốc") |
| Shift + bấm / Shift + Space | Áp **trạng thái mới của dòng đích** cho cả dải từ mốc tới đích, theo thứ tự **đang hiện** (sau sort), bỏ qua dòng khoá: đích được chọn → cả dải chọn; đích bị bỏ → cả dải bỏ. Mốc ở trang khác (đã đổi trang) → chỉ bật / tắt một dòng |
| Enter | Không làm gì (đúng chuẩn checkbox) |
| Ô "Chọn tất cả trên trang" | Chưa chọn hết các dòng chọn được của **trang này** → chọn hết; đã hết → bỏ các dòng đó. Dòng ở trang khác **không bị đụng** |

Ô header tính trên các dòng **chọn được của trang hiện tại**; bị khoá khi trang rỗng / đang tải / không dòng nào chọn
được. Header không phản ánh lựa chọn ở trang khác — tổng số nằm ở thanh hàng loạt của bạn (dưới).

**Dòng khoá**: `table.rowSelectable = (row) => row.status !== 'locked'` (ném lỗi = khoá). Người dùng không đổi được dòng
khoá; code (API) **vẫn** chọn được (app là nguồn quyền) → dòng hiện "đã chọn + khoá".

**Tối đa** (`max-selected="50"`, số nguyên ≥ 1, chỉ `multiple`): chặn **thao tác của người dùng** (bấm, Shift dải, ô
header) — dừng ở trần, phát `select-limit` + thông báo "Tối đa 50 dòng". **API không bao giờ bị chặn**, kể cả
`{ emit: true }`: lựa chọn đặt bằng code vượt trần được giữ nguyên; khi đó người dùng chỉ bỏ chọn được cho tới khi dưới trần.

**Lựa chọn sống qua** đổi trang, sort, gán `data` (client lẫn server), `columns`, `loading`. Bảng **không** tự bỏ khoá
không còn trong `data` (không phân biệt "bị lọc ẩn" với "đã xoá") — bạn quyết:

```js
// sau khi xoá trên server
table.data = rows; table.deselect(deletedIds);
// đổi bộ lọc → bỏ chọn (nếu muốn)
filter.addEventListener('change', () => { table.clearSelection(); reload(); });
// chỉ giữ lựa chọn trong một trang
table.addEventListener('page-change', () => table.clearSelection({ emit: true }));
```

**Khoá phải duy nhất toàn cục.** Ở server mode bảng chỉ thấy một trang nên không phát hiện được khoá trùng giữa các
trang — hai dòng khác nhau cùng khoá sẽ bị coi là một (lựa chọn, `selectedRows`, form). Dữ liệu nhiều nguồn / nhiều tenant:
dùng khoá ghép, ví dụ `table.rowKey = (r) => \`${r.tenantId}:${r.id}\``. Khoá field chỉ đọc thuộc tính **của chính dòng**
(hoặc getter của class), không bao giờ từ `Object.prototype`.

**Server mode**: bảng chỉ biết trang đang có. Khoá ở trang khác vẫn nằm trong `selectedKeys`; `selectedRows` trả các dòng
**đã từng hiện** của khoá đang chọn (khoá chưa thấy bao giờ bị bỏ qua — dùng `selectedKeys`).

**Sự kiện**: `select-change` chỉ khi **người dùng** đổi (hoặc API với `{ emit: true }`); gán `selectedKeys`,
`select()`… mặc định im lặng. `onSelectChange(keys)` chạy trước event.

#### Thanh thao tác hàng loạt (công thức, không phải component)

Nội dung (hành động, quyền, xác nhận) là của app, nên bảng không có slot — đặt `div` của bạn **trên** bảng:

```html
<div id="bulk" hidden><strong id="bulk-count"></strong>
  <button type="button" class="td-btn td-btn--sm td-btn--danger" id="bulk-delete">Xoá đã chọn</button>
  <button type="button" class="td-btn td-btn--sm td-btn--ghost" id="bulk-clear">Bỏ chọn</button></div>
<td-table id="posts" selectable row-key="id"></td-table>
```

```js
table.addEventListener('select-change', (e) => {
  bulk.hidden = e.detail.keys.length === 0;
  bulkCount.textContent = `${e.detail.keys.length} đã chọn`;
});
bulkClear.addEventListener('click', () => table.clearSelection({ emit: true }));
```

#### "Chọn tất cả N kết quả" (server, kiểu Gmail — công thức)

Ô header chỉ chọn **trang này**. Chỉ khi `select-change` có `trigger: 'page'` **và** ô header thành
`aria-checked="true"` **và** `total-items` lớn hơn số dòng trang → hiện nút "Chọn tất cả {total} kết quả", ghi lại **khung
nhìn** lúc đó (`getState()`: trang, `perPage`, sort; bộ lọc; mảng `data`). Ẩn nút (và bỏ cờ) khi: mọi `select-change`
khác, `page-change`, `sort-change`, đổi bộ lọc / tải lại, gán `data` mới, `setPage()` hay đổi lựa chọn bằng API im lặng
(hai việc cuối không có event — app tự bỏ cờ khi gọi). Trong handler của nút, **kiểm lại** (ô header vẫn `"true"`, cùng
khung nhìn) trước khi bật cờ; không khớp → ẩn nút, không làm gì. Bấm → app giữ cờ `allMatching` + **bộ lọc hiện tại** và gửi **bộ
lọc** (không gửi danh sách khoá) lên server; mọi `select-change` sau đó → bỏ cờ. Bảng không biết cờ này. Demo có ví dụ.

#### Gửi form (`name`)

Có `name` → bảng gửi mỗi khoá đã chọn thành **một mục** form (`String(key)`, thứ tự chọn, **gồm cả khoá ở trang khác**),
không cần tự đồng bộ `<input hidden>`:

```php
<?php
// Trang có form: mở phiên và TẠO token trước khi render (token ngẫu nhiên 256 bit, gắn với phiên).
session_start();
$_SESSION['csrf'] ??= bin2hex(random_bytes(32));
?>
<form method="post" action="/posts/bulk-delete">
  <!-- CSRF: token gắn với phiên, server kiểm trước khi làm gì -->
  <input type="hidden" name="csrf" value="<?= htmlspecialchars($_SESSION['csrf'], ENT_QUOTES) ?>">
  <td-table selectable row-key="id" name="ids[]"></td-table>
  <button type="submit">Xoá đã chọn</button>
</form>
```

```php
<?php
// Mọi chuỗi đều gửi lên được (sửa DOM / tự POST): kiểm CSRF, kiểm hình dạng dữ liệu, rồi kiểm quyền NGAY TRONG câu xoá.
session_start();
$stored = $_SESSION['csrf'] ?? null;
$sent = $_POST['csrf'] ?? null;
// cả hai phải là chuỗi KHÁC RỖNG (phiên chưa có token → hash_equals('', '') sẽ "đúng" — chặn trước)
if ($_SERVER['REQUEST_METHOD'] !== 'POST'
    || !is_string($stored) || $stored === ''
    || !is_string($sent) || $sent === ''
    || !hash_equals($stored, $sent)) {
    http_response_code(403); exit;
}

// 1. Hình dạng: mảng, ≤ 500 phần tử, mỗi phần tử là chuỗi số thập phân, trong khoảng hợp lệ; sai → từ chối cả request.
$raw = $_POST['ids'] ?? null;
if (!is_array($raw) || count($raw) === 0 || count($raw) > 500) { http_response_code(422); exit; }
$ids = [];
foreach ($raw as $v) {
    if (!is_string($v) || !preg_match('/^[1-9][0-9]{0,17}$/', $v)) { http_response_code(422); exit; }
    $ids[$v] = (int) $v; // khoá mảng = bỏ trùng
}
$ids = array_values($ids);

// 2. Quyền + xoá trong MỘT câu, một transaction: điều kiện chủ sở hữu / tenant nằm trong WHERE
//    (không "kiểm từng id rồi xoá" — tránh TOCTOU). Số dòng xoá được ≠ số id → huỷ cả lô.
$in = implode(',', array_fill(0, count($ids), '?'));
$pdo->beginTransaction();
$stmt = $pdo->prepare("DELETE FROM posts WHERE tenant_id = ? AND owner_id = ? AND id IN ($in)");
$stmt->execute([$tenantId, $userId, ...$ids]);
if ($stmt->rowCount() !== count($ids)) { $pdo->rollBack(); http_response_code(403); exit; }
$pdo->commit();
```

Thêm lớp phòng thủ (không thay CSRF token): cookie phiên `SameSite=Lax` / `Strict`, và kiểm header `Origin` (hoặc
`Sec-Fetch-Site: same-origin`) với request đổi dữ liệu.

- Không `name` (hoặc `selectable` tắt / chưa chọn gì) → không gửi gì.
- `form.reset()` → bỏ hết + **một** `select-change` `trigger: 'reset'` (khác input thường vốn im lặng — để thanh hàng
  loạt không lệch).
- `<fieldset disabled>` hoặc `disabled` trên bảng → ô tick bị khoá, lựa chọn giữ nguyên, **không gửi**. Lưu ý: bảng giờ
  là form-associated, nên trình duyệt coi `<td-table disabled>` là **control bị khoá**: mọi cú bấm chuột bên trong (sort,
  phân trang, nút thao tác) cũng bị chặn (đo ở Chromium / Firefox / WebKit). Chỉ muốn khoá việc chọn thì dùng
  `rowSelectable = () => false`.
- Back / bfcache **không** khôi phục lựa chọn (dữ liệu bảng có thể chưa tải lại) — tự đặt `selectedKeys` nếu cần.

### 11. Bộ lọc ngoài + URL (`request-change`, `controlled`) — từ 0.39.0

Bảng **không có** giao diện lọc và **không bao giờ tự lọc dữ liệu** (kể cả chế độ client — app lọc rồi gán `data`).
Thanh lọc là form / component của bạn (thường kèm [`<td-filter-chips>`](filter-chips.md)); bảng chỉ **giữ state** và
**phát yêu cầu**:

- **State** = `{ page, perPage, sort: { key, direction }, filters }`. `filters` là object của app (chuỗi / số / boolean /
  mảng…) — bảng chỉ sao nông + đóng băng, không hiểu nội dung.
- **Event `request-change`** `{ state, reason, requestId }` ở **mọi** chế độ, mỗi khi người dùng đổi trang / sort hoặc
  bạn gọi `setFilters()`. `state` là state **được yêu cầu** (sau thay đổi; sort mới → `page: 1`), đóng băng.
  `reason`: `'page'` | `'sort'` | `'filters'` (`'per-page'` dành sẵn — kit chưa có UI chọn số dòng; tự đổi bằng
  `setState({ perPage })`). `requestId` tăng dần theo từng bảng.
- **`setState({ page?, perPage?, sort?, filters?, data?, totalItems?, requestId? })`** — áp **một lần**, **im lặng**
  (không event). Có `data` → tắt `loading`. `requestId` **nhỏ hơn** yêu cầu mới nhất → bỏ qua, trả `false` (phản hồi về
  muộn không ghi đè phản hồi mới — race khi gõ lọc nhanh). `sort` theo `key` của cột (không có / không `sortable` → bỏ
  sort + một cảnh báo). Gọi được **trước khi** bảng vào trang (khôi phục từ URL lúc tải).
- **`setFilters(filters, { resetPage = true })`** — phát `request-change` reason `filters` (về trang 1 trừ khi
  `resetPage: false`). Không `controlled`: bảng giữ luôn `filters` (đọc qua `getState()`) và về trang 1.
- **`controlled`** (chỉ có nghĩa cùng `server-mode`; thiếu `server-mode` → một cảnh báo, bỏ qua): bảng **không tự áp**
  đổi trang / sort. Bấm sort / trang → phát `request-change`, bật skeleton (`loading`, `aria-busy`), **giữ** hai phân
  trang và focus ở đúng nút vừa bấm (aria-sort / trang hiện tại chưa đổi) rồi chờ bạn gọi `setState()`. Yêu cầu mới
  trong lúc chờ được dựng trên **yêu cầu gần nhất** (bấm sort rồi gõ lọc trước khi có kết quả → yêu cầu lọc giữ sort vừa
  bấm; bấm sort lần hai đi tiếp vòng asc → desc → bỏ từ sort đã yêu cầu). Không `controlled` (mặc định) = hành vi cũ +
  event mới.

**Thứ tự event** (thứ tự cũ giữ nguyên, `request-change` chen vào):

| Thao tác | Thứ tự |
|---|---|
| Bấm sort | `sort-change` → `request-change` (reason `sort`) → `onSort` (server mode) |
| Đổi trang | `page-change` (từ `td-pagination`, nổi bọt hết) → `request-change` (reason `page`) → `onPageChange` (server mode) |
| `setFilters()` | `request-change` (reason `filters`) |
| `setState()` / `data =` / `setPage()` | không event |

`controlled` vẫn phát `sort-change` / `page-change` và vẫn gọi `onSort` / `onPageChange` (nếu bạn đặt) — đừng dùng song
song với `request-change` kẻo tải hai lần.

**Công thức đồng bộ URL** (của app — kit không đọc / ghi `location` / `history`):

```html
<form id="filters" role="search">
  <td-input-field id="f-q" name="q" label="Tìm"></td-input-field>
  <td-dropdown id="f-status" name="status" label="Trạng thái"></td-dropdown>
</form>
<td-filter-chips id="chips" empty-focus="f-q"></td-filter-chips>
<td-table id="orders" title="Đơn hàng" server-mode controlled column-menu per-page="20"></td-table>
```

```js
const table = document.querySelector('#orders');
table.columns = columns;

// URL ⇄ state (kiểu giá trị của bộ lọc là của bạn)
const fromUrl = () => {
  const u = new URLSearchParams(location.search);
  return {
    page: Number(u.get('page')) || 1,
    sort: u.get('sort') ? { key: u.get('sort'), direction: u.get('dir') === 'desc' ? 'desc' : 'asc' } : null,
    filters: { q: u.get('q') || '', status: u.get('status') || '' },
  };
};
const toUrl = ({ page, sort, filters }) => {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) if (v !== '' && v != null) u.set(k, v);
  if (sort.key) { u.set('sort', sort.key); u.set('dir', sort.direction); }
  if (page > 1) u.set('page', page);
  return `?${u}`;
};

let ctrl = null;
async function load(state, requestId) {
  ctrl?.abort();
  ctrl = new AbortController();
  try {
    const res = await fetch(`/api/orders${toUrl(state)}`, { signal: ctrl.signal });
    const { rows, total } = await res.json();
    table.setState({ ...state, data: rows, totalItems: total, requestId }); // về muộn → tự bỏ qua
  } catch (e) {
    if (e.name !== 'AbortError') table.setState({ ...state, data: [], totalItems: 0, requestId });
  }
}

table.addEventListener('request-change', (e) => {
  const { state, reason, requestId } = e.detail;
  // lọc / sort: thay URL; đổi trang: thêm vào lịch sử (nút Back quay lại trang trước)
  history[reason === 'page' ? 'pushState' : 'replaceState'](null, '', toUrl(state));
  load(state, requestId);
});

addEventListener('popstate', () => {
  const s = fromUrl();
  table.setState(s);               // giao diện theo URL ngay (im lặng)
  load({ ...table.getState(), ...s }, table.getState().requestId);
});

// lúc tải trang: khôi phục từ URL rồi tải
const first = fromUrl();
table.setState(first);
load({ ...table.getState(), ...first }, 0);

// form của bạn → bảng (debounce ô tìm 300 ms là việc của form)
let t;
document.querySelector('#filters').addEventListener('input', () => {
  clearTimeout(t);
  t = setTimeout(() => table.setFilters(readForm()), 300);
});
```

- Giá trị lọc đến từ **URL** (người dùng sửa được): chỉ đưa vào `setState` / `fetch` qua `URLSearchParams`; server
  kiểm lại từng tham số (whitelist cột sort, kiểu, độ dài). Kit không render `filters` ở đâu cả.
- **Lựa chọn dòng (0.37) không bị đụng** khi lọc / đổi trang (đúng quy tắc mục 10) — muốn bỏ chọn khi đổi bộ lọc:
  gọi `table.clearSelection()` trong handler `request-change` khi `reason === 'filters'`.
- Chip bộ lọc: `<td-filter-chips>` phát `filter-remove` / `filter-clear` → cập nhật form → `table.setFilters()` (xem
  [filter-chips.md](filter-chips.md#nối-với-bảng)).

### 12. Ẩn / hiện cột (`column-menu`, `hiddenColumns`) — từ 0.39.0

```html
<td-table id="orders" title="Đơn hàng" column-menu min-visible="2"></td-table>
```

```js
table.columns = [
  { key: 'code', label: 'Mã đơn', card: 'primary' },          // primary: mặc định KHÔNG ẩn được
  { key: 'customer', label: 'Khách hàng' },
  { key: 'phone', label: 'Số điện thoại', hidden: true },     // ẩn lúc đầu ("Khôi phục mặc định" về đây)
  { key: 'note', label: 'Ghi chú', hideable: false },         // luôn hiện
  { key: 'act', label: 'Thao tác', actions: [/* … */] },      // cột actions: mặc định không ẩn được
];
// app lưu (kit không ghi storage) và gán lại TRƯỚC lần render đầu
table.hiddenColumns = JSON.parse(localStorage.getItem('orders.cols') || 'null'); // null = theo `hidden` của cột
table.addEventListener('columns-change', (e) => {
  localStorage.setItem('orders.cols', JSON.stringify(e.detail.hidden)); // { hidden: ['phone'], reason: 'toggle' | 'reset' }
});
```

- **`column-menu`** → nút **"Cột"** (`td-btn` ghost nhỏ, icon `columns`) ở header, giữa tiêu đề và phân trang trên
  (header hiện cả khi không có tiêu đề). Mở menu (Enter / Space / ↓ / chuột) gồm một mục **checkbox** cho mỗi cột ẩn
  được: Space / Enter / bấm → bật / tắt **tại chỗ, menu không đóng**; phân cách; **"Khôi phục mặc định"** (về `hidden`
  của `columns`, `columns-change` reason `reset`, menu đóng, focus về nút). Ở card: cùng nút, trường của cột ẩn biến
  khỏi card, chip sort của cột ẩn biến khỏi thanh sort.
- **`hideable`** (mặc định `true`; `false` cho cột `card: 'primary'` — kể cả primary mặc định — và cột `actions`) và
  **`hidden`** (trạng thái ban đầu). Cột ẩn được phải có `key` **duy nhất, khác rỗng**; không → cột đó không ẩn được +
  một cảnh báo.
- **`hiddenColumns`** (mảng `key`, thứ tự cột): get / set **im lặng**; `null` = theo `hidden` của `columns`. Key lạ /
  cột không ẩn được bị bỏ qua.
- **`min-visible`** (mặc định 1): số cột **đang hiện** (tính cả cột không ẩn được, không tính cột chọn dòng) không bao giờ
  dưới mức này. Mục cuối còn được phép tắt chuyển `aria-disabled` + gợi ý "Cần ít nhất {n} cột"; bật lại cột khác → mở
  khoá ngay khi menu còn mở. Gán `hiddenColumns` vi phạm → các cột cuối danh sách vẫn hiện + một cảnh báo.
- **Ẩn = thuộc tính `hidden`** trên `th` / `td` / ô skeleton của cột (ra khỏi cây trợ năng, `display: none` cả ở card);
  đổi **tại chỗ**, không dựng lại bảng → focus trong menu giữ nguyên, lựa chọn dòng giữ nguyên. Cột đang sort bị ẩn →
  sort giữ (state không đổi); hiện lại → `aria-sort` đúng. `table-layout: fixed` tính trên các cột **đang hiện**.

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
| `layout` | `auto` \| `table` \| `cards` | `auto` | Dạng hiển thị (xem [Responsive](#9-responsive-bảng-thành-card-khi-chỗ-đặt-hẹp)). Từ 0.34.0. |
| `card-below` | `sm` \| `md` \| `lg` | `md` | Ngưỡng bề rộng bảng (480 / 720 / 1024px) dưới đó `auto` thành card. Từ 0.34.0. |
| `selectable` | `multiple` \| `single` | vắng (tắt) | Chọn dòng (mục 10). Có attribute mà rỗng / giá trị lạ = `multiple`; `none` / `false` / `0` / `off` = tắt. Cần `row-key` / `rowKey`. Từ 0.37.0. |
| `row-key` | string | — | Tên trường khoá của dòng (hoặc property `rowKey`). Đổi → bỏ hết lựa chọn. Từ 0.37.0. |
| `max-selected` | number | — | Trần (số nguyên ≥ 1) cho thao tác **người dùng** ở `multiple`; sai → bỏ qua + cảnh báo. API không bị chặn. Từ 0.37.0. |
| `name` | string | — | Tên field form: gửi mỗi khoá đã chọn một mục. Từ 0.37.0. |
| `disabled` | boolean | vắng | Khoá ô tick (lựa chọn giữ, không gửi form). Trình duyệt còn chặn mọi cú bấm chuột trong bảng (control form bị khoá). Từ 0.37.0. |
| `controlled` | boolean | vắng | Chỉ với `server-mode`: bảng không tự áp đổi trang / sort — phát `request-change`, bật skeleton, chờ `setState()` (mục 11). Thiếu `server-mode` → cảnh báo, bỏ qua. Từ 0.39.0. |
| `column-menu` | boolean | vắng | Nút "Cột" ở header mở menu ẩn / hiện cột (mục 12). Từ 0.39.0. |
| `min-visible` | number | `1` | Số cột đang hiện tối thiểu (≥ 1). Từ 0.39.0. |

Các attribute `title`, `heading-level`, `zebra`, `max-height`, `selectable`, `row-key`, `column-menu` khi đổi sẽ dựng lại cấu trúc bảng; `layout` /
`card-below` chỉ đổi CSS (không render lại); mọi attribute khác cập nhật tại chỗ (focus được giữ).

## Property & method

| Thành viên | Kiểu / chữ ký | Mô tả |
|---|---|---|
| `columns` | `Array<ColumnDef>` | Định nghĩa cột (bảng dưới). Giá trị không phải mảng → `[]`. Gán lại → dựng lại cấu trúc; nếu cột đang sort không còn `sortable` ở cùng vị trí thì sort bị bỏ. |
| `data` | `Array<object>` | Các hàng. Setter gọi `setData()`. |
| `cellPaddingClass` | `string` | `'px-0'`…`'px-6'` hoặc `''` để bỏ. |
| `zebra` | `boolean` | Getter trả trạng thái thực. `el.zebra = false` ghi `zebra="false"`; `true` xoá attribute (về mặc định bật). |
| `onSort` | `({ key, direction }) => void` | Xem [Hook](#hook--tuỳ-chọn). |
| `onPageChange` | `(page: number) => void` | Xem [Hook](#hook--tuỳ-chọn). |
| `onRowAction` | `({ id, row, rowIndex }) => void` | Gọi sau event `row-action` (cả hai chế độ). Từ 0.34.0. |
| `layout` | `'auto' \| 'table' \| 'cards'` | Phản chiếu attribute `layout` (giá trị lạ → `'auto'`; gán `'auto'` xoá attribute). |
| `cardBelow` | `'sm' \| 'md' \| 'lg'` | Phản chiếu attribute `card-below` (mặc định `'md'`). |
| `setData(data)` | `(Array) => void` | Thay dữ liệu. Client: về trang 1. Server: giữ trang. |
| `setPage(page)` | `(number) => void` | Chuyển trang (kẹp vào khoảng hợp lệ khi hiển thị). **Không** gọi `onPageChange`, không phát `page-change`. |
| `setLoading(bool)` | `(boolean) => void` | Bật/tắt attribute `loading`. |
| `getState()` | `() => { columns, data, page, perPage, sort: { key, direction }, filters, totalItems, requestId, selection: { mode, keys } }` | Trạng thái hiện tại; `sort.key` là `key` gốc của cột. `selection` từ 0.37.0 (`mode`: `'none' \| 'multiple' \| 'single'`). 0.39.0: `filters` (đóng băng), `totalItems` (server: `total-items` hoặc `null`; client: số dòng), `requestId` (của `request-change` mới nhất, 0 khi chưa có). |
| `setState(state)` | `({ page?, perPage?, sort?, filters?, data?, totalItems?, requestId? }) => boolean` | Áp một lần, im lặng; `requestId` cũ → bỏ qua, trả `false`; có `data` → tắt `loading`. Gọi được trước khi gắn vào trang (mục 11). Từ 0.39.0. |
| `setFilters(filters, { resetPage })` | `(object, { resetPage?: boolean }) => void` | Phát `request-change` reason `filters` (trang 1 trừ khi `resetPage: false`); không `controlled` → bảng giữ `filters` + về trang đó. Từ 0.39.0. |
| `hiddenColumns` | `string[] \| null` | `key` các cột đang ẩn (get / set im lặng; `null` = theo `hidden` của cột). Từ 0.39.0. |
| `update(opts)` | `({ columns?, data?, page?, onSort?, onPageChange?, rowKey?, rowSelectable?, selectedKeys? }) => void` | Gộp nhiều thay đổi một lần. `columns`/`data` không phải mảng bị bỏ qua (không throw). `data` theo quy tắc trang của `setData`, sau đó `page` (nếu có) được áp. `rowKey` áp trước (nó bỏ lựa chọn), rồi `selectedKeys` (0.37.0). |
| `rowKey` | `string \| (row) => key` | Khoá của dòng (mục 10). Chuỗi = phản chiếu `row-key`. Từ 0.37.0. |
| `rowSelectable` | `(row) => boolean` | `false` / ném lỗi → dòng không chọn được bởi người dùng. Từ 0.37.0. |
| `selectedKeys` | `Array` | Khoá đã chọn (mọi trang, thứ tự chọn, kiểu gốc). Gán = thay toàn bộ (lọc khoá sai, bỏ trùng; `single` giữ cái cuối), **không** event. Từ 0.37.0. |
| `selectedRows` | `Array<object>` (chỉ đọc) | Dòng **đã biết** của các khoá đang chọn (thứ tự chọn); khoá chưa từng thấy bị bỏ qua. Từ 0.37.0. |
| `onSelectChange` | `(keys) => void` | Chạy trước `select-change` (ném → `console.error`, event vẫn phát). Từ 0.37.0. |
| `select(keys, { emit })` / `deselect(keys, { emit })` | `(key \| key[], { emit?: boolean }) => void` | Thêm / bớt khoá. Mặc định im lặng; `{ emit: true }` → hook + event `trigger: 'api'` + thông báo. **Không** áp `max-selected`. Từ 0.37.0. |
| `toggle(key, { emit })` | | Đảo một khoá. Từ 0.37.0. |
| `clearSelection({ emit })` | | Bỏ hết (mọi trang). Tên không phải `clear` để khỏi nhầm "xoá dữ liệu". Từ 0.37.0. |
| `isSelected(key)` | `(key) => boolean` | `1` và `"1"` là một. Từ 0.37.0. |
| `TdTable.labels` | static object | Chuỗi hiển thị, site ghi đè được (xem dưới). |

### `ColumnDef`

| Khoá | Kiểu | Mặc định | Mô tả |
|---|---|---|---|
| `key` | string \| number | — | Khoá lấy giá trị `row[key]`. Có thể trùng, là số (kể cả `0`) hoặc thiếu: cột được xác định theo **vị trí (index)**, không theo `key`. |
| `label` | string | `''` | Tiêu đề cột, luôn được escape. |
| `sortable` | boolean | `false` | Tiêu đề thành nút sort. |
| `width` | CSS dimension | — | Chỉ áp làm độ rộng khi `widthType: 'fixed'`. |
| `widthType` | `'fixed'` \| `'flexible'` | `'flexible'` | Xem cách dùng số 4. Mọi cột `'fixed'` → `table-layout: fixed`. |
| `minWidth` / `maxWidth` | CSS dimension | — | Chỉ áp khi flexible. |
| `align` | `'left'` \| `'center'` \| `'right'` \| `'justify'` | — | `text-align` cho cả `th` và `td` của cột. Giá trị khác bị bỏ. |
| `ellipsis` | boolean | `false` | Một dòng, cắt `…` ở `maxWidth` hoặc `--td-table-ellipsis-max`, toàn văn trong `title`. |
| `nowrap` | boolean | `true` nếu `align: 'right'`, còn lại `false` | Giá trị không xuống dòng (class `td-table__cell--nowrap`). Từ 0.34.0. |
| `card` | `'lead'` \| `'primary'` \| `'secondary'` \| `'meta'` \| `'actions'` \| `false` | cột đầu `primary` (hoặc `lead` khi cột khác khai báo `primary` — 0.36.1), cột có `actions` → `actions`, còn lại `secondary` | Vai trò trên card (xem cách dùng số 9). Từ 0.34.0; `lead` từ 0.36.1. |
| `actions` | `Array<{ id, label, icon?, variant?, hidden?, disabled? }>` | — | Nút thao tác theo hàng (xem cách dùng số 8). Từ 0.34.0. |
| `render` | `(row, rowIdxInPage) => Node \| string \| any` | — | Ô tuỳ biến (xem cách dùng số 3). Nội dung được **nối sau** nhãn card của ô. |
| `hideable` | boolean | `true` (`false` cho cột `primary` và cột `actions`) | Cho phép ẩn cột (menu "Cột", `hiddenColumns`). Cần `key` duy nhất khác rỗng. Từ 0.39.0. |
| `hidden` | boolean | `false` | Ẩn lúc đầu (và khi "Khôi phục mặc định" / `hiddenColumns = null`). Từ 0.39.0. |

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
  actions: 'Actions',
  selectRow: 'Select {label}',
  rowFallback: 'row {n}',
  selectAll: 'Select all on this page',
  selectColumn: 'Select',
  selectedCount: '{n} selected',
  selectedRow: 'Selected {label}',
  deselected: 'Selection cleared',
  selectLimit: 'At most {max} rows',
  columns: 'Columns',
  columnsReset: 'Reset to default',
  columnsMin: 'At least {n} columns',
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
| `actions` | `Thao tác` | Nhãn nút mở menu thao tác ở dạng card (khi > 2 action) |
| `selectRow` | `Chọn {label}` | Tên ô tick mỗi dòng; `{label}` = chữ của ô `primary` (bỏ nhãn card, gọn khoảng trắng, ≤ 80 ký tự), không có thì `rowFallback` (0.37.0) |
| `rowFallback` | `dòng {n}` | Tên dòng khi ô `primary` rỗng (`{n}` = vị trí trong trang) (0.37.0) |
| `selectAll` | `Chọn tất cả trên trang` | Ô chọn cả trang (ẩn kiểu sr-only ở dạng bảng, hiện ở chip card) (0.37.0) |
| `selectColumn` | `Chọn` | Tên cột chọn ở `single` (chỉ cho trình đọc màn hình) (0.37.0) |
| `selectedCount` | `Đã chọn {n} dòng` | Thông báo sau thao tác (`multiple`) (0.37.0) |
| `selectedRow` / `deselected` | `Đã chọn {label}` / `Đã bỏ chọn` | Thông báo sau thao tác (`single`) (0.37.0) |
| `columns` | `Cột` | Nhãn nút `column-menu` (0.39.0) |
| `columnsReset` | `Khôi phục mặc định` | Mục cuối của menu cột (0.39.0) |
| `columnsMin` | `Cần ít nhất {n} cột` | Gợi ý trên mục bị khoá bởi `min-visible` (0.39.0) |
| `selectLimit` | `Tối đa {max} dòng` | Thông báo khi chạm `max-selected` (0.37.0) |

Đổi `labels` trước khi bảng render (ngay sau import). Các nhãn bên trong `td-pagination` ("Trang trước", "Trang N",
"Hiển thị …") đổi qua `TdPagination.labels`, xem [pagination.md](pagination.md#tdpaginationlabels).

## Event

| Event | detail | Khi nào | bubbles? |
|---|---|---|---|
| `sort-change` | `{ key, direction }` — `direction` là `'asc'`, `'desc'` hoặc `null`; `key` là `null` khi bỏ sort | Người dùng bấm nút sort (cả hai chế độ). Phát **trước** `onSort`. | có (composed) |
| `page-change` | `{ page }` | Người dùng đổi trang ở một trong hai `td-pagination` bên trong. Event này phát từ `td-pagination` và nổi bọt qua host, nên nghe trên `td-table` được; `e.target` là phần tử `td-pagination`. | có (composed) |
| `select-change` | `{ keys, added, removed, trigger }` — `keys` = toàn bộ lựa chọn (mọi trang, thứ tự chọn, kiểu gốc); `trigger`: `toggle` \| `range` \| `page` \| `reset` \| `api` | Người dùng đổi lựa chọn (bấm, Space, Shift dải, ô header), `form.reset()`, hoặc API với `{ emit: true }`. **Không** phát khi gán `selectedKeys`, `select()` mặc định, đổi `data` / trang / sort / `selectable` / `rowKey`. Sau `onSelectChange`. Cùng tên với `td-media-grid`. Từ 0.37.0. | có (composed) |
| `select-limit` | `{ max }` | Một thao tác **người dùng** dừng ở `max-selected` (không bao giờ từ API). Từ 0.37.0. | có (composed) |
| `request-change` | `{ state: { page, perPage, sort: { key, direction }, filters }, reason: 'page' \| 'sort' \| 'filters', requestId }` — `state` đóng băng | Người dùng đổi trang / sort (mọi chế độ) hoặc `setFilters()`. Sau `sort-change` / `page-change`, trước `onSort` / `onPageChange` (mục 11). Từ 0.39.0. | có (composed) |
| `columns-change` | `{ hidden: string[], reason: 'toggle' \| 'reset' }` | Người dùng bật / tắt cột hoặc "Khôi phục mặc định" trong menu "Cột". **Không** phát khi gán `hiddenColumns`. Từ 0.39.0. | có (composed) |
| `row-action` | `{ id, row, rowIndex }` — `id` của action, `row` là chính object hàng trong `data`, `rowIndex` là chỉ số hàng **trong trang hiện tại** (như tham số thứ hai của `render`) | Người dùng bấm một nút action (dạng bảng) hoặc chọn một mục trong menu "Thao tác" (dạng card). Phát **trước** `onRowAction`. Từ 0.34.0. | có (composed) |

```js
table.addEventListener('sort-change', (e) => console.log(e.detail)); // { key: 'name', direction: 'asc' }
table.addEventListener('page-change', (e) => console.log(e.detail.page));
```

## Hook & tuỳ chọn

| Hook | Chữ ký | Được gọi khi |
|---|---|---|
| `onSort` | `({ key, direction }) => void` | **Chỉ trong `server-mode`**, sau mỗi lần đổi sort (sau event `sort-change`). Ở chế độ client bảng tự sort và **không** gọi `onSort`; muốn biết sort đổi thì nghe `sort-change`. |
| `onPageChange` | `(page) => void` | **Chỉ trong `server-mode`**, khi người dùng đổi trang. Bảng đồng bộ số trang cho thanh còn lại rồi chờ bạn gán `data` mới. Ở chế độ client, nghe event `page-change`. |
| `onRowAction` | `({ id, row, rowIndex }) => void` | Mọi chế độ, sau event `row-action`. |

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
| `--td-table-skeleton` | `var(--td-skeleton-bg)` | Màu thanh skeleton |
| `--td-table-sheen` | `var(--td-skeleton-shine)` | Vệt sáng shimmer |
| `--td-table-ellipsis-max` | `18rem` | Bề rộng tối đa nội dung ô `ellipsis` (khi cột không có `maxWidth`) |
| `--td-table-edge-shadow` | `rgb(0 0 0 / 14%)` (dark: `/ 55%`) | Bóng mép khi bảng cuộn ngang |
| `--td-table-card-bg` | `var(--td-table-bg)` | Nền card (dạng card) |
| `--td-table-card-border` | `var(--td-table-border)` | Viền card + viền chip sort |
| `--td-table-card-radius` | `var(--td-radius-md)` | Bo góc card |
| `--td-table-card-gap` | `var(--td-space-xs)` | Khoảng cách giữa các card và quanh danh sách card (0.36.1: trước là `--td-space-sm`) |
| `--td-table-card-px` / `--td-table-card-py` | `var(--td-space-sm)` / `var(--td-space-xs)` | Padding trong card (0.36.1: trước là `md` / `sm`) |
| `--td-table-card-cell-py` | `2px` | Padding dọc của mỗi ô trên card (0.36.1) |
| `--td-table-card-pair-min` | `0px` | Bề rộng tối thiểu một cặp `secondary` (0 = theo nội dung; `100%` = một cặp mỗi dòng như trước 0.36.1) (0.36.1) |
| `--td-table-label-fg` | `var(--td-color-text-muted)` | Nhãn "nhãn:", dòng meta và `lead` trên card |
| `--td-table-select-w` | `3rem` | Bề rộng cột chọn (0.37.0) |
| `--td-table-row-selected` | accent 8 % (`color-mix`; fallback `rgb(37 99 235 / 8%)`) | Nền dòng / card đã chọn; hover chồng `--td-table-row-hover` lên (0.37.0) |
| `--td-table-card-selected-border` | `var(--td-accent)` | Viền card đã chọn (≥ 3:1 với nền trang — contrast gate) (0.37.0) |

Từ 0.27.0, hàng skeleton của bảng dùng chung token với class [`.td-skeleton`](loading.md#skeleton-khối-giữ-chỗ-thuần-css):
`--td-table-skeleton` / `--td-table-sheen` mặc định trỏ vào `--td-skeleton-bg` / `--td-skeleton-shine`, còn bo góc và chu
kỳ lướt đọc thẳng `--td-skeleton-radius` / `--td-skeleton-dur`. Đổi `--td-skeleton-*` trên `:root` là bảng và skeleton
của site khớp nhau; ghi đè `--td-table-skeleton` / `--td-table-sheen` vẫn chỉ đổi riêng bảng. Markup không đổi.

`--td-table-max-h` do JS đặt (CSSOM) từ attribute `max-height`; không đặt tay.

```css
/* CSS của site — không bọc trong @layer để thắng td.tokens */
:root {
  --td-table-cell-py: 0.625rem;     /* bảng gọn hơn */
  --td-table-radius: 8px;
}
#orders { --td-table-zebra: transparent; } /* chỉ bảng này */
```

Bảng hẹp tự thành card (xem [Responsive](#9-responsive-bảng-thành-card-khi-chỗ-đặt-hẹp)) — không cần CSS ẩn
cột theo viewport như trước. Muốn bỏ một cột khỏi card thì đặt `card: false` trong `ColumnDef`. Vẫn nhắm được từng
cột bằng `data-col-key` (có trên mọi `th`/`td`) và vai trò bằng `data-card`, ví dụ:

```css
#orders td[data-card="meta"] { font-style: italic; }
```

## Cấu trúc DOM & class

Cấu trúc được render **một lần**; dữ liệu, sort, trang, loading và số đếm được cập nhật tại chỗ.

```html
<td-table [layout="auto|table|cards"] [card-below="sm|md|lg"]>
  <div class="td-table td-table--zebra [td-table--fixed] [td-table--scroll-y]" data-state="ready|loading|empty">
    <div class="td-table__header" [hidden]>
      <h3 class="td-table__title" id="{host-id}-title">…</h3>
      <!-- 0.39.0, chỉ khi column-menu: nút mở TdMenu (mục checkbox mỗi cột ẩn được + "Khôi phục mặc định") -->
      [<button type="button" class="td-btn td-btn--ghost td-btn--sm td-table__columns" aria-haspopup="menu" aria-expanded="false|true">
        <span class="td-table__columns-icon" data-td-icon="columns" aria-hidden="true"><svg…></span>
        <span class="td-table__columns-label">Cột</span></button>]
      <div class="td-table__pagination" [hidden]><td-pagination quiet aria-label="Phân trang (trên)"></td-pagination></div>
    </div>
    <div class="td-table__scroll" [tabindex="0" role="region" aria-labelledby|aria-label]>
      <table class="td-table__table" role="table" aria-labelledby="{host-id}-title" | aria-label="…" [aria-busy="true"]>
        <thead class="td-table__head" role="rowgroup"><tr role="row">
          <!-- 0.37.0, chỉ khi selectable + rowKey: cột chọn (không data-col; cột dữ liệu giữ 0..n−1) -->
          [<th class="td-table__th td-table__th--select td-table__th--select-all" role="columnheader" scope="col" data-card="select">
            <button type="button" class="td-table__select-all" role="checkbox" aria-checked="false|true|mixed" [disabled]>
              <span class="td-check td-check--md" aria-hidden="true">…</span>
              <span class="td-table__select-all-label">Chọn tất cả trên trang</span>
            </button></th>]  <!-- single: th.td-table__th--select > span.td-sr-only "Chọn" -->
          <th class="td-table__th [td-table__th--sortable]" role="columnheader" scope="col" data-col="0" data-col-key="name"
              data-card="lead|primary|secondary|meta|actions|false" [aria-sort="ascending|descending"] [hidden]>  <!-- hidden: cột ẩn (0.39.0) -->
            <button type="button" class="td-table__sort" data-sort-col="0">
              <span class="td-table__sort-label">Tên</span>
              <span class="td-table__sort-icon" aria-hidden="true" data-sort-icon="sort"><svg width="14" height="14" class="td-icon" data-icon="sort" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/></svg></span>  <!-- up / down khi đang sort -->
            </button>
          </th>
        </tr></thead>
        <tbody class="td-table__body" role="rowgroup">
          <tr class="td-table__row" role="row" data-row-idx="0" [data-selected]>
            [<td class="td-table__cell td-table__cell--select td-table__card-select" role="cell" data-card="select">
              <button type="button" class="td-table__select" role="checkbox" aria-checked="true|false" aria-label="Chọn …" [disabled]>
                <span class="td-check td-check--md" aria-hidden="true">…</span></button></td>]
            <td class="td-table__cell [td-table__cell--ellipsis] [td-table__cell--nowrap] [td-table__cell--px-N]"
                role="cell" data-col="0" data-col-key="name" data-card="primary">
              <span class="td-table__cell-label" aria-hidden="true">Tên</span>…giá trị…
            </td>
            <td class="td-table__cell td-table__cell--actions" role="cell" data-col="3" data-col-key="act" data-card="actions">
              <span class="td-table__cell-label" aria-hidden="true">Thao tác</span>
              <div class="td-table__actions [td-table__actions--menu]">
                <!-- td-table__action--icon (0.36.1): action có icon hợp lệ → chỉ icon ở dạng card -->
                <button type="button" class="td-btn td-btn--sm td-btn--secondary td-table__action [td-table__action--icon]" data-action-idx="0" [disabled]>
                  [<span class="td-table__action-icon" data-td-icon="pencil" aria-hidden="true"><svg…></span>]
                  <span class="td-table__action-label">Sửa</span>
                </button>
                <!-- chỉ khi > 2 action hiện: nút menu, chỉ hiện ở dạng card -->
                <button type="button" class="td-btn td-btn--sm td-btn--secondary td-table__actions-menu td-table__action--icon" aria-haspopup="menu" aria-expanded="false">…Thao tác</button>
              </div>
            </td>
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

- Modifier của khối: `td-table--zebra`, `td-table--fixed` (table-layout fixed — chỉ khi mọi cột fixed), `td-table--scroll-y` (có `max-height`).
- `role` tường minh trên `table` / `thead` / `tbody` / `tr` / `th` / `td` (từ 0.34.0): dạng card đổi `display` của
  phần tử bảng, mà WebKit / Chromium bỏ ngữ nghĩa bảng khi đó — role giữ cây `table > rowgroup > row > columnheader /
  cell` ở cả hai dạng.
- `span.td-table__cell-label` (nhãn cột, `aria-hidden`) nằm đầu **mọi ô dữ liệu**, chỉ hiện ở dạng card. Vì vậy
  `td.textContent` gồm cả nhãn; đọc giá trị thì lấy nội dung trừ `.td-table__cell-label` (hoặc đọc từ `data`).
- Trạng thái: `data-state` trên `.td-table`, `aria-busy` trên `table`, `aria-sort` trên `th`, `[hidden]` trên các khung.
- Chọn dòng (0.37.0): trạng thái nằm ở `aria-checked` của nút (mark `.td-check` dùng chung đọc từ đó — ADR 0017);
  `tr[data-selected]` **chỉ để CSS** (không `aria-selected`: ARIA không có nghĩa đó trong `table`). Hàng skeleton có ô
  chọn trống; hàng rỗng `colspan` = số cột + 1.
- Ẩn cột (0.39.0): thuộc tính `hidden` trên `th` / `td` / ô skeleton có `data-col` của cột đó (không bao giờ trên cột
  chọn); hàng rỗng `colspan` = số cột **đang hiện** (+ 1 khi có cột chọn). Đổi tại chỗ, không render lại.
- Hàng skeleton: `tr.td-table__row.td-table__row--skeleton[aria-hidden="true"]` > `td > span.td-table__skeleton`.
- Hàng rỗng: `tr.td-table__empty-row > td.td-table__empty[colspan] > td-empty-state`.
- Ô ellipsis: `td.td-table__cell--ellipsis > span.td-table__cell-label + div.td-table__truncate[title]`.
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
- Dạng card (0.34.0): bảng vẫn đọc như bảng (role tường minh), nhãn trên card `aria-hidden` nên không đọc trùng (ô
  được đặt tên qua `columnheader`). Thanh sắp xếp dùng chính các nút sort của `thead`.
- Menu "Thao tác" là APG menu button (`aria-haspopup="menu"`, `aria-expanded`): Enter / Space / ↓ mở và focus mục đầu,
  ↑ mở và focus mục cuối, Esc đóng và trả focus về nút. Mục bị `disabled(row)` có `aria-disabled` (focus được, không chọn được).
- Loading: `aria-busy="true"` + một thông báo trạng thái; skeleton `aria-hidden`.
- **Chọn dòng (0.37.0)** — vẫn là `role="table"`, **không** chuyển sang `grid`: grid buộc mô hình phím theo ô (mũi tên
  giữa ô, Enter / F2 vào nội dung) xung đột với link / nút / `render` tự do trong ô và với dạng card. Mỗi dòng **một**
  `button[role="checkbox"]` có tên ("Chọn {tên dòng}"), một điểm Tab mỗi dòng (như cột thao tác), không roving. Space
  bật / tắt, Shift+Space chọn dải, Enter không làm gì, mũi tên không làm gì. `single` cũng là checkbox (độc quyền) — không
  dùng `radio` vì radio ngoài `radiogroup` và thiếu phím mũi tên là ARIA sai. Ô "Chọn tất cả trên trang" là
  `columnheader` chứa checkbox ba trạng thái (`aria-checked="mixed"`). Sau mỗi thao tác, `p[role=status]` của bảng đọc
  "Đã chọn {n} dòng" (`single`: "Đã chọn {tên dòng}" / "Đã bỏ chọn"; chạm trần: "Tối đa {max} dòng"); không đè chữ "Đang
  tải". Cảm ứng: ô tick 44 × 44px thật; chuột ≥ 24px. Forced colors: dòng chọn có `outline` Highlight.
- **Controlled (0.39.0)**: bấm sort / trang khi chờ `setState` → skeleton + `aria-busy` + "Đang tải dữ liệu…", focus ở lại
  đúng nút vừa bấm (hai phân trang không bị ẩn trong lúc chờ), `aria-sort` / trang hiện tại chỉ đổi khi `setState` áp.
- **Menu "Cột" (0.39.0)** là APG menu button như menu "Thao tác"; mục là `menuitemcheckbox` (`aria-checked`), Space /
  Enter bật / tắt và menu **không đóng**; mục bị khoá bởi `min-visible` có `aria-disabled` + gợi ý (`aria-describedby`).
  Cột ẩn mang `hidden` → không còn `columnheader` / `cell` trong cây trợ năng.
- Tôn trọng `prefers-reduced-motion` (tắt shimmer, transition) và forced colors (viền `CanvasText`, hover outline).

## Bảo mật

- `label`, `key`, giá trị ô thường, `title`, `empty-title`, `empty-text`, `actions[].label` và
  `TdTable.labels.actions` **luôn được escape** (nhãn action trong menu là `textContent`). `actions[].variant` qua
  whitelist, `actions[].icon` chỉ nhận tên có trong registry. Dữ liệu người dùng đưa vào
  `data` hiển thị an toàn khi không dùng `render`.
- `render` trả **chuỗi** = cửa sau HTML tin cậy: chuỗi được gán `innerHTML` nguyên văn. Chỉ trả chuỗi do chính bạn viết;
  nếu phải chèn dữ liệu người dùng vào chuỗi thì tự escape từng giá trị. Cách an toàn nhất là **trả về Node**
  (`textContent`, `createElement`). Chuỗi HTML chứa `style="…"` hay `<script>` cũng là trách nhiệm tuân thủ CSP của bạn.
- **Chọn dòng (0.37.0)**: khoá chọn là trạng thái **phía client** — form gửi lên được mọi chuỗi, server **luôn** kiểm quyền
  từng khoá. Khoá không in ra DOM (dòng ↔ khoá qua `data-row-idx`). Tên ô tick lấy từ chữ của ô `primary` và được đặt
  bằng `setAttribute` (không đi qua HTML); thông báo dùng `textContent`. `rowKey` / `rowSelectable` / `onSelectChange` là
  callback của dev: ném lỗi → dòng bị khoá (fail closed) / lỗi được ghi, bảng vẫn chạy.
- **Bộ lọc / URL (0.39.0)**: kit **không** đọc / ghi `location`, không render `filters` ở đâu cả, chỉ sao nông + đóng
  băng object bạn đưa. Giá trị lấy từ URL là dữ liệu người dùng: parse bằng `URLSearchParams`, gửi lên server qua
  `URLSearchParams` (không tự ghép chuỗi), server whitelist cột sort / kiểm kiểu + độ dài từng tham số. `requestId` +
  `AbortController` chống phản hồi cũ ghi đè phản hồi mới; `setState` với `requestId` cũ bị bỏ (kể cả khi app quên abort).
  Nhãn cột trong menu "Cột" là `textContent`.
- `width` / `minWidth` / `maxWidth` qua whitelist dimension, `align` qua whitelist, `max-height` qua `CSS.supports` +
  cấm `url()`/`var()`; `active-color` qua `safeColor`. Chi tiết: [guides/security.md](../guides/security.md).

## Cảm ứng

- Nút sắp xếp có hình nhấn; hover hàng chỉ trên con trỏ mịn (hàng không kích hoạt được nên không có hình nhấn). Vuốt ngang bảng cuộn (dạng bảng) không sắp xếp / không chọn.

Chuẩn chung: [Cảm ứng](../guides/touch.md).

## Lưu ý & lỗi thường gặp

- **`render` chạy lại mỗi lần cập nhật** (đổi trang, sort, tắt loading, gán `data`…): `tbody` được dựng mới. Vì vậy hàm
  `render` phải tạo Node **mới** mỗi lần gọi (trả về cùng một Node sẽ bị "chuyển" giữa các ô) và nên rẻ.
- **`width` không có tác dụng** nếu thiếu `widthType: 'fixed'`. Xem cách dùng số 4.
- **Bảng co về gần 0 / biến mất** (0.34.0): host là container `inline-size`, cần bề rộng từ cha — xem "Host cần bề rộng
  từ cha" ở mục 9. Thường gặp khi bảng là con của flex `align-items: flex-start` hoặc hàng flex không có `flex: 1`.
- **Bảng thành card trên trang cũ** (0.34.0): bảng hẹp hơn 720px giờ là card. Giữ dạng bảng: `layout="table"`.
- **`td.textContent` có thêm nhãn cột** (0.34.0): mỗi ô dữ liệu bắt đầu bằng `span.td-table__cell-label`.
- **`onSort` / `onPageChange` im lặng ở chế độ client**: đó là thiết kế, hãy nghe event `sort-change` / `page-change`.
- **Server mode quên `total-items`**: phân trang bị ẩn + cảnh báo. Đặt attribute sau mỗi lần tải.
- **Server mode đổi sort không về trang 1**: tự gọi `setPage(1)` rồi tải lại (như ví dụ trên).
- **`zebra="true"` hay `zebra=""` vẫn là bật**; chỉ `false` / `0` / `off` tắt.
- `setPage()` chỉ đổi hiển thị; ở server mode nó **không** gọi `onPageChange`, bạn phải tự tải trang đó.
- `per-page` đổi lớn hơn làm số trang giảm: trang hiện tại được kẹp lại, không rơi vào trạng thái rỗng.
- **`selectable` mà không có cột chọn** (0.37.0): thiếu `row-key` / `rowKey` — xem cảnh báo trong console.
- **Header "Chọn tất cả" không chọn trang khác**: đúng thiết kế (chỉ trang này); "tất cả kết quả trên server" là công thức
  phía app (mục 10).
- **Lựa chọn còn khoá đã xoá / đã lọc**: bảng không tự bỏ — gọi `deselect(ids)` / `clearSelection()` (mục 10).
- **`<td-table disabled>` chặn cả sort / phân trang bằng chuột** (0.37.0): bảng là form-associated nên trình duyệt coi nó
  là control bị khoá. Chỉ khoá việc chọn: `rowSelectable = () => false`.
- `title` hiện tooltip trình duyệt khi hover lên cả bảng (hành vi của attribute HTML toàn cục). Nếu không muốn,
  dùng `aria-label` và tự viết heading ngoài bảng.

## Xem thêm

- [Pagination](pagination.md), [Empty state](empty-state.md), [Menu](menu.md) (menu "Thao tác"), [Icons](icons.md) (icon `up` / `down` / `sort` / `more`)
- [ADR 0014 — breakpoint + container query](../internal/decisions/0014-breakpoints-container-queries.md)
- [ADR 0018 — `td-table` chọn dòng](../internal/decisions/0018-table-row-selection.md) · [Ô tick chung (ADR 0017)](../internal/decisions/0017-shared-check-mark.md)
- [Theming](../customization/theming.md) · [Styling](../customization/styling.md) · [Hooks](../customization/hooks.md)
- [Bảo mật](../guides/security.md) · [Trợ năng](../guides/accessibility.md)
