[Tài liệu](../README.md) › [Components](README.md) › Pagination

# Phân trang — `<td-pagination>`

Thanh phân trang: dòng thông tin "Hiển thị 1-10 / 240 mục", nút trang trước/sau và một cửa sổ các số trang liên tiếp
(trang đầu và cuối luôn hiện, khoảng trống thành `…`). Component chỉ **hiển thị và báo trang người dùng chọn**; việc tải
dữ liệu của trang đó là của bạn. Nếu bạn đang hiển thị một bảng, dùng luôn [`td-table`](table.md) (đã có hai thanh phân
trang bên trong) thay vì ghép tay.

| | |
|---|---|
| Import | `import '@dazzxq/td-components/pagination'` (class: `import { TdPagination } from '@dazzxq/td-components'`) |
| Loại | Custom element |
| Form-associated | không |
| Từ phiên bản | 0.1.0 (token-native từ 0.8.0: cần `td.css`) |

## Ví dụ nhanh

```html
<td-pagination id="pager" total-items="240" items-per-page="20" current-page="1"></td-pagination>

<script type="module">
  import '@dazzxq/td-components/pagination';

  document.getElementById('pager').addEventListener('page-change', (e) => {
    loadPage(e.detail.page); // tải trang e.detail.page
  });
</script>
```

## Cách dùng

### 1. Danh sách do server trả về

```js
const pager = document.getElementById('pager');

async function loadPage(page) {
  const res = await fetch(`/api/posts?page=${page}`);
  const json = await res.json();
  renderPosts(json.items);
  pager.setAttribute('total-items', String(json.total)); // tổng có thể đổi giữa các lần tải
}

pager.addEventListener('page-change', (e) => loadPage(e.detail.page));
loadPage(1);
```

Khi người dùng bấm, component **tự** cập nhật `current-page` rồi mới phát `page-change`; bạn không cần đặt lại
`current-page`.

### 2. Hai thanh cho cùng một danh sách (trên + dưới)

```html
<td-pagination id="pager-top" quiet aria-label="Phân trang (trên)" total-items="240"></td-pagination>
<ul id="list">…</ul>
<td-pagination id="pager-bottom" aria-label="Phân trang (dưới)" total-items="240"></td-pagination>
```

```js
const top = document.getElementById('pager-top');
const bottom = document.getElementById('pager-bottom');
for (const [src, other] of [[top, bottom], [bottom, top]]) {
  src.addEventListener('page-change', (e) => {
    other.setAttribute('current-page', String(e.detail.page)); // đồng bộ thanh còn lại (im lặng)
    loadPage(e.detail.page);
  });
}
```

- `quiet` trên một thanh để thay đổi trang chỉ được trình đọc màn hình đọc **một lần** (thanh `quiet` không có
  `aria-live`).
- Mỗi thanh cần một `aria-label` khác nhau vì mỗi thanh là một landmark `<nav>`.

### 2b. Danh sách ngắn — chỉ một trang (`hide-single-page`, 0.59.0)

Khi chỉ có **một** trang, nút trước / sau và số "1" không giúp gì. `hide-single-page` ẩn phần nút khi tổng số trang ≤ 1 và
giữ lại **dòng đếm** ("Hiển thị 1-4 / 4 mục"):

```html
<td-pagination total-items="4" items-per-page="10" hide-single-page></td-pagination>
```

- Nhiều trang → như cũ. Đổi `total-items` / `items-per-page` qua lại → bật / tắt tại chỗ (cùng `<nav>`, cùng dòng đếm).
- Dòng đếm vẫn là vùng `aria-live` (trừ khi `quiet`) và **luôn hiện**, kể cả khung < 360 px (dạng "‹ 1 / 1 ›" không dùng).
- Focus đang ở một nút bị ẩn (vd. server trả tổng nhỏ đi) → chuyển sang dòng đếm (`tabindex="-1"` tạm thời, gỡ khi
  rời) — không rơi về `<body>`; trình đọc màn hình đọc câu đếm mới.
- Không bật mặc định: tắt-mở thanh ở mọi site là thay đổi giao diện. Muốn ẩn **cả** dòng đếm thì không render pagination.
- `td-table` có cùng attribute (một dòng đếm duy nhất ở dưới) — xem [Table](table.md).

### 3. Đổi trang bằng code

```js
pager.setPage(3);                          // phát page-change (nếu trang thật sự đổi)
pager.setAttribute('current-page', '3');   // đổi IM LẶNG, không phát event
pager.getState();                          // { totalItems, itemsPerPage, currentPage, totalPages }
```

### 4. Màu trang hiện tại riêng cho một thanh

```html
<td-pagination active-color="#0f766e" total-items="90"></td-pagination>
```

Màu chữ trên nút trang hiện tại được **tự chọn đen hoặc trắng** theo độ tương phản WCAG. Nếu màu trong suốt
(`rgb(… / 50%)`), component tính màu thực hiển thị bằng cách chồng lên nền đặc gần nhất của các phần tử cha (nếu không
có thì dùng `--td-color-bg` của trang, cuối cùng là trắng).

`active-color` được ghi thành biến inline `--td-pagination-active` / `--td-pagination-active-fg` trên phần tử. Bỏ
attribute thì component chỉ gỡ những biến **nó** đã đặt; biến inline site tự đặt (`el.style.setProperty('--td-…', …)`)
không bị xoá khi render lại (từ 0.16.0).

### 5. Cửa sổ số trang

```html
<td-pagination total-items="1000" items-per-page="10" current-page="50" max-pages="7"></td-pagination>
```

Hiện: `1 … 47 48 49 50 51 52 53 … 100`. Quy tắc: một cửa sổ `max-pages` trang liên tiếp quanh trang hiện tại (dồn vào
trong khoảng hợp lệ), cộng trang 1 và trang cuối; khoảng trống đúng **một** trang thì hiện luôn số đó, lớn hơn thì hiện
`…`. Tổng số trang ≤ `max-pages` thì hiện hết. Quy tắc này áp khi thanh rộng ≥ 480px; hẹp hơn xem
[Responsive](#responsive-v0340).

### 6. Chữ thông tin riêng cho một thanh (`formatInfo`) — từ 0.57.2

`TdPagination.labels.info` đổi chữ cho **cả site**; muốn chữ khác cho **một** thanh, gán hook `formatInfo`:

```js
const pag = document.querySelector('#orders-pag');
pag.formatInfo = ({ from, to, total, totalPages }) => `${from}–${to} trong ${total} đơn (${totalPages} trang)`;
```

`ctx = { from, to, total, item, page, perPage, totalPages, text }` (`text` = chữ mặc định, để nối thêm). Giá trị trả về là
**text** (ghi bằng `textContent`, không bao giờ thành HTML). Trả không phải chuỗi / ném lỗi → chữ mặc định + **một**
cảnh báo console (mỗi phần tử). Gán lại (kể cả đúng hàm cũ) → dòng thông tin được tính lại **tại chỗ** (nút không dựng lại,
focus giữ nguyên) — dùng khi dữ liệu hook đọc đã đổi mà các attribute thì không. `null` → chữ mặc định. Gán được cả trước
khi element upgrade. `td-table` dùng chính hook này cho [bảng cây](table.md#13-bảng-cây--dòng-lồng-nhau-tree--từ-0570)
(hook của bảng là `formatPageInfo`).

## Responsive (v0.34.0)

Host `<td-pagination>` là **container** (`container: td-pagination / inline-size`): bố cục đổi theo **bề rộng của chính
thanh**, không theo viewport — đặt trong cột 360px của trang desktop cũng gọn như trên điện thoại.

| Bề rộng thanh | Hiển thị |
|---|---|
| ≥ 480px | Như trước: cửa sổ `max-pages` + trang đầu / cuối + `…`; dòng "Hiển thị …" nằm cạnh cụm nút (xuống dòng khi không đủ chỗ) |
| 360 – 479px | **Gọn**: chỉ trang đầu / hiện tại / cuối, mỗi phía có trang bị ẩn thì đúng một `…` (`‹ 1 … 57 … 200 ›`); dòng "Hiển thị …" chiếm một hàng riêng phía trên |
| < 360px | **Trạng thái**: `‹ 57 / 200 ›` — nút trước, chữ "trang hiện tại / tổng số trang" (`labels.status`), nút sau; không còn số trang / `…`; dòng "Hiển thị …" ẩn **khỏi mắt** nhưng vẫn là vùng `aria-live` duy nhất (trình đọc màn hình vẫn đọc khi đổi trang, đúng một lần) |

- **Không gì tràn ra ngoài**, đặc biệt mép trái (trước v0.34.0 nút "Trang trước" có thể lọt ra ngoài mép trái, không
  cuộn tới được). Khung hẹp hơn cả dạng trạng thái (< ~130px) thì cụm nút xuống dòng — vẫn bấm được mọi nút.
- Mỗi `<li>` có `data-rel` tĩnh do JS đặt: `current` · `edge` (trang 1 / trang cuối) · `adjacent` (± 1) · `far` (phần
  còn lại của cửa sổ) · `ellipsis` (`…` thường, hiện ở cả hai dạng) · `gap` (`…` chỉ dạng gọn hiện). CSS ẩn `adjacent` +
  `far` và hiện `gap` khi < 480px — không có JS chạy khi resize. `aria-current`, nhãn nút và live region không đổi.
- Dạng trạng thái (< 360px, cỡ `2xs` chỉ dành cho container — ADR 0014): `span.td-pagination__status` luôn có trong
  markup (dựng lại cùng cụm nút mỗi lần đổi trang) nhưng chỉ hiện ở dạng này; nó `aria-hidden="true"` để không đọc hai
  lần. Ở trang cuối, bấm "Trang sau" thì focus **ở lại** nút đó (giờ `aria-disabled`) thay vì nhảy sang số trang đang ẩn.
- **Cần bề rộng từ cha.** Container `inline-size` làm bề rộng host không còn phụ thuộc nội dung: trong khung co theo
  nội dung (`inline-block`, `float`, `position: absolute` không có `width`, flex item `flex: 0 1 auto`) host **sụp về
  0** và chỉ còn dạng gọn tràn. Cho nó `display: block` trong luồng thường (mặc định), hoặc trong flex: `flex: 1 1 auto;
  min-inline-size: 0` (td-table tự làm vậy cho thanh trong header).
- Trình duyệt không có container query (Chrome / Edge 102–104): td.css có sẵn bản dự phòng theo **viewport** (dạng gọn
  khi viewport < 480px, dạng trạng thái khi viewport < 360px) — đúng cho trang một cột trên điện thoại; trong cột hẹp
  của trang desktop thì như trước.

## Attribute

| Attribute | Kiểu | Mặc định | Mô tả |
|---|---|---|---|
| `total-items` | number | `0` | Tổng số mục. Âm → 0. |
| `items-per-page` | number | `10` | Số mục mỗi trang, tối thiểu 1. |
| `current-page` | number | `1` | Trang hiện tại, bắt đầu từ 1. Khi hiển thị được kẹp vào `[1, totalPages]`. |
| `active-color` | string (màu) | token `--td-pagination-active` | Màu nền nút trang hiện tại. Qua `safeColor`; không hợp lệ → dùng token. |
| `item-label` | string | `TdPagination.labels.item` (`mục`) | Danh từ trong dòng thông tin ("Hiển thị 1-10 / 240 **mục**"), điền vào `{item}`. |
| `max-pages` | number | `5` | Kích thước cửa sổ số trang liên tiếp, kẹp 1–25. |
| `aria-label` | string | `Phân trang` | Tên landmark `<nav>`. |
| `quiet` | boolean | vắng | Dòng thông tin không phải vùng `aria-live` (dùng cho thanh thứ hai của cùng danh sách). |
| `hide-single-page` | boolean | vắng | 0.59.0: tổng số trang ≤ 1 → ẩn phần nút, chỉ còn dòng đếm. Property `hideSinglePage`. Xem [2b](#2b-danh-sách-ngắn--chỉ-một-trang-hide-single-page-0590). |

Số nguyên được đọc bằng `parseInt` (`"20abc"` → 20) và kẹp trong khoảng số nguyên an toàn. Mọi thay đổi attribute
(trừ `active-color`, chỉ đổi màu) dựng lại phần nút nhưng **giữ** `<nav>` và dòng thông tin, nên focus và vùng live được
giữ.

## Property & method

| Thành viên | Chữ ký | Mô tả |
|---|---|---|
| `setPage(page)` | `(number) => void` | Chuyển tới trang (kẹp vào `[1, totalPages]`); nếu khác trang hiện tại thì cập nhật `current-page` **và phát `page-change`**. |
| `getState()` | `() => { totalItems, itemsPerPage, currentPage, totalPages }` | Trạng thái đã kẹp. `totalPages` tối thiểu là 1. |
| `formatInfo` | `(ctx) => string` \| `null` | Chữ dòng thông tin của thanh này (mục 6); kết quả là text. Từ 0.57.2. |
| `TdPagination.labels` | static object | Chữ giao diện, site ghi đè được (xem dưới). |

### `TdPagination.labels`

Chữ mặc định cho cả trang (tiếng Việt, từ 0.16.0). Đổi ngay sau import; áp dụng từ lần render tiếp theo:

```js
import { TdPagination } from '@dazzxq/td-components/pagination';
Object.assign(TdPagination.labels, {
  prev: 'Previous page', next: 'Next page', page: 'Page {n}',
  info: 'Showing {from}–{to} of {total} {item}', item: 'items',
});
```

| Khoá | Mặc định | Dùng ở |
|---|---|---|
| `prev` | `Trang trước` | `aria-label` nút trước |
| `next` | `Trang sau` | `aria-label` nút sau |
| `page` | `Trang {n}` | `aria-label` từng nút số trang (`{n}` = số trang) |
| `info` | `Hiển thị {from}-{to} / {total} {item}` | Dòng thông tin |
| `item` | `mục` | `{item}` khi phần tử không có attribute `item-label` |
| `status` | `{current} / {total}` | Chữ của dạng trạng thái < 360px (`{current}` = trang hiện tại, `{total}` = tổng số trang; 0.34.0) |

`item-label` trên phần tử luôn thắng `labels.item`. Tên landmark (`Phân trang`) đổi bằng attribute `aria-label`.
Mọi nhãn được escape.

Vì kế thừa `TdBaseElement`, các attribute cũng có property tương ứng dạng camelCase (`el.totalItems`, `el.currentPage`,
`el.itemsPerPage`, `el.maxPages`, `el.itemLabel`, `el.activeColor`, `el.quiet`) sau khi element đã vào trang; chúng đọc/ghi
attribute dạng **chuỗi** (ví dụ `el.currentPage` trả `'3'`, không phải số). Dùng `getState()` khi cần số.

## Event

| Event | detail | Khi nào | bubbles? |
|---|---|---|---|
| `page-change` | `{ page }` (số) | Người dùng bấm nút trang / trước / sau, hoặc gọi `setPage()`, **và** trang thật sự đổi. Phát sau khi `current-page` đã được cập nhật. Đổi attribute `current-page` bằng code không phát. | có (composed) |

## Tuỳ biến giao diện

| Token | Mặc định | Tác dụng |
|---|---|---|
| `--td-pagination-active` | `var(--td-accent-fill)` (light = accent; dark = accent tối đi 20%) | Nền + viền nút trang hiện tại. Từ 0.16.0 đi theo `--td-accent` ở cả dark (trước đó dark cố định `#2563eb`). |
| `--td-pagination-active-fg` | `var(--td-accent-contrast)` (dark: `#fff`) | Chữ nút trang hiện tại |
| `--td-pagination-item-size` | `2rem` (cảm ứng: `var(--td-touch-min)`) | Kích thước nút trang / trước / sau. Cả hai giá trị khai báo trên `:root` (từ 0.16.0), nên override ở `:root` thắng cả trên màn cảm ứng. |

Khi có `active-color`, JS ghi hai custom property trên chính host (`--td-pagination-active`, `--td-pagination-active-fg`)
bằng CSSOM; xoá attribute thì chúng bị gỡ và token toàn cục áp lại.

```css
:root { --td-pagination-item-size: 2.25rem; }
.dense td-pagination { --td-pagination-item-size: 1.75rem; }
```

Nếu đổi `--td-pagination-active` bằng CSS, nhớ đổi luôn `--td-pagination-active-fg` sao cho đủ tương phản (≥ 4.5:1) —
chỉ `active-color` mới tự tính màu chữ.

## Cấu trúc DOM & class

```html
<td-pagination>
  <nav class="td-pagination" aria-label="Phân trang">
    <p class="td-pagination__info" aria-live="polite">Hiển thị 1-10 / 30 mục</p>
    <div class="td-pagination__controls">
      <button type="button" class="td-pagination__nav td-pagination__nav--prev" data-nav="prev"
              aria-label="Trang trước" aria-disabled="true">
        <span class="td-pagination__icon" data-td-icon="prev"><svg class="td-icon td-icon--m" data-icon="prev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m15 18-6-6 6-6"/></svg></span>
      </button>
      <span class="td-pagination__status" aria-hidden="true">1 / 3</span> <!-- 0.34.0: chỉ hiện < 360px -->
      <ul class="td-pagination__pages">
        <li data-rel="current"><button type="button" class="td-pagination__page" data-page="1" aria-label="Trang 1" aria-current="page">1</button></li>
        <li data-rel="adjacent"><button type="button" class="td-pagination__page" data-page="2" aria-label="Trang 2">2</button></li>
        <li class="td-pagination__ellipsis" data-rel="gap" aria-hidden="true">…</li>
        <li data-rel="edge"><button type="button" class="td-pagination__page" data-page="3" aria-label="Trang 3">3</button></li>
      </ul>
      <button type="button" class="td-pagination__nav td-pagination__nav--next" data-nav="next" aria-label="Trang sau">…</button>
    </div>
  </nav>
</td-pagination>
```

- Trang hiện tại: `.td-pagination__page[aria-current="page"]` (in đậm; 0.36.0: `::after { content: attr(data-page) }` ẩn giữ
  chỗ bề rộng chữ đậm nên nút trang không rộng ra / các nút bên cạnh không xê dịch khi đổi trang — đo trước khi sửa: lệch tới 2.3 px).
- Nút trước/sau ở đầu/cuối: `[aria-disabled="true"]` (vẫn focus được, click bị chặn).
- 0.59.0 `hide-single-page` + một trang: `nav.td-pagination.td-pagination--single`, `.td-pagination__controls[hidden]`
  (phần nút vẫn được dựng — chỉ ẩn).
- `data-rel` trên mỗi `<li>` (v0.34.0) — xem [Responsive](#responsive-v0340). Markup render sẵn từ server nên có luôn
  `data-rel` + các `<li data-rel="gap">` (thiếu thì dạng gọn trước khi JS chạy sẽ hiện đủ trang) và
  `span.td-pagination__status` (thiếu thì dạng trạng thái trước khi JS chạy chỉ còn hai nút).
- Render phía server: in sẵn đúng khối `<nav class="td-pagination">` ở trên bên trong `<td-pagination>` (icon
  trước/sau: `<?= td_icon('prev') ?>` / `<?= td_icon('next') ?>` của [adapter PHP](../guides/php-adapter.md), hoặc slot
  `data-td-icon` để JS điền — xem [Icons](icons.md#icon-trong-markup-render-sẵn)). Khi JS chạy, component giữ `<nav>` có
  sẵn và chỉ cập nhật dòng thông tin + phần nút. Pagination không có helper PHP; fixture `test/contracts/pagination.html`
  trong repo kit chỉ dùng cho test (không nằm trong gói npm).

## Bàn phím & trợ năng

- Mọi nút là `<button>` thật: Tab qua từng nút, Enter/Space để bấm.
- Sau khi đổi trang, **focus được giữ**: nếu bạn đang ở nút "Trang sau" thì focus ở lại đó; nếu nút đó vừa thành
  `aria-disabled` (tới trang cuối) thì focus chuyển sang nút trang hiện tại; nếu bạn bấm một số trang thì focus ở số đó.
- Nút trước/sau dùng `aria-disabled` thay vì `disabled` để không mất focus khi tới đầu/cuối.
- Dòng thông tin là `aria-live="polite"` (trừ khi `quiet`) → trình đọc màn hình đọc "Hiển thị 11-20 / 240 mục".
- 0.59.0 `hide-single-page`: khi phần nút bị ẩn lúc đang có focus, focus chuyển sang dòng thông tin (không mất focus).
- Nút ≥ 32 px (con trỏ chuột), ≥ `--td-touch-min` trên cảm ứng. Trang hiện tại mặc định ≥ 4.5:1 ở cả sáng và tối.
- Forced colors: trang hiện tại dùng `Highlight`/`HighlightText`.

## Bảo mật

`item-label`, `aria-label`, `TdPagination.labels` và chữ trả về từ `formatInfo` được escape / ghi dạng text; `active-color` qua `safeColor` (giá trị như `red;}` bị bỏ). Số trang tối đa trong
DOM bị chặn bởi `max-pages ≤ 25`, nên giá trị lớn từ API/CMS không làm phình DOM.

## Cảm ứng

- Nút trang và nút trước / sau có hình nhấn; hover chỉ trên con trỏ mịn. Vùng chạm ≥ 44 px trên con trỏ thô.

Chuẩn chung: [Cảm ứng](../guides/touch.md).

## Lưu ý & lỗi thường gặp

- **`setPage()` phát event**, còn `td-table.setPage()` thì không — đừng nhầm hai hành vi.
- `total-items="0"` vẫn hiện trang 1 và hai nút bị vô hiệu; muốn ẩn hẳn thì tự thêm `hidden` cho `<td-pagination>`.
- Nhiều thanh trên một trang cần `aria-label` khác nhau (mỗi thanh là một landmark).
- Listener click được gắn một lần cho cả vòng đời element, nên di chuyển element trong DOM không làm mất `page-change`.

## Xem thêm

- [Table](table.md) (dùng td-pagination bên trong) · [Icons](icons.md) (`prev` / `next`)
- [Theming](../customization/theming.md) · [Trợ năng](../guides/accessibility.md)
