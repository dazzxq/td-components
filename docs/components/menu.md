[Tài liệu](../README.md) › [Components](README.md) › Menu

# Menu thao tác — `TdMenu`

`TdMenu` là menu thao tác kiểu "···" (WAI-ARIA APG *Menu Button* + *Menu*): bấm một nút, hiện danh sách lệnh như
Sửa, Chia sẻ, Xoá. Nó là **API JS tĩnh**, không có thẻ custom element; menu được tạo lúc mở, gắn vào `<body>` và gỡ
khi đóng. Dùng khi cần một danh sách **hành động** gắn với một nút. **Không** dùng để chọn giá trị trong form (dùng
[`td-dropdown`](dropdown.md)), không dùng làm menu điều hướng chính của site, và không dùng cho nội dung giàu thông
tin khi rê chuột (dùng [`TdHovercard`](hovercard.md)).

| | |
|---|---|
| Import | `import { TdMenu } from '@dazzxq/td-components/menu'` |
| Loại | API JS tĩnh (static class), không có tag |
| Form-associated | không |
| Từ phiên bản | 0.12.0 (registry tuỳ chọn `define` / `register` / `bindAll`: 0.14.0) |
| CSS | cần `td.css` (phần `src/styles/components/menu.css`) |

Import không có side effect: không có gì chạy, không lắng nghe sự kiện nào cho tới khi bạn gọi `open`, `bind`,
`bindAll` hoặc `button`.

## Ví dụ nhanh

```html
<button type="button" id="post-7-actions" aria-label="Thao tác bài viết">···</button>
```

```js
import { TdMenu } from '@dazzxq/td-components/menu';

const trigger = document.getElementById('post-7-actions');

TdMenu.bind(trigger, [
  { label: 'Sửa', icon: 'plus', hint: 'Ctrl+E', onSelect: () => editPost(7) },
  { label: 'Mở trang', href: '/posts/7', newTab: true },
  { separator: true },
  { label: 'Xoá', danger: true, onSelect: () => deletePost(7) },
]);
```

`bind()` lo mọi thứ: gắn ARIA cho nút (`aria-haspopup="menu"`, `aria-expanded`), bấm để mở/đóng, phím mũi tên để mở,
và trả focus về nút sau khi chọn.

## Cách dùng

### 1. Gắn vào nút có sẵn — `TdMenu.bind()`

```js
const unbind = TdMenu.bind(trigger, items, { align: 'end', label: 'Thao tác bài viết' });
// …khi gỡ nút khỏi trang (SPA):
unbind();
```

`items` có thể là mảng, một hàm `(ctx) => items` (gọi mỗi lần mở, hợp khi danh sách phụ thuộc trạng thái hiện tại),
hoặc **tên** của một menu đã đăng ký (xem mục 5). Gọi `bind()` lần nữa trên cùng nút sẽ **thay** binding cũ.

```js
// Danh sách tính lúc mở: "Ghim" / "Bỏ ghim" theo trạng thái hiện tại
TdMenu.bind(trigger, () => [
  { label: post.pinned ? 'Bỏ ghim' : 'Ghim', onSelect: () => togglePin(post) },
  { label: 'Xoá', danger: true, onSelect: () => deletePost(post.id) },
]);
```

### 2. Để kit tạo luôn nút "···" — `TdMenu.button()`

Tương đương `createMenuButton` của dwp: tạo một `<button class="td-menu-btn">` đã được `bind()` sẵn.

```js
const btn = TdMenu.button({
  icon: 'more',              // tên icon trong registry (mặc định 'more')
  label: '',                 // chữ hiển thị cạnh icon (tuỳ chọn)
  ariaLabel: 'Thao tác bài viết',
  items: [
    { label: 'Sửa', onSelect: () => editPost(7) },
    { label: 'Xoá', danger: true, onSelect: () => deletePost(7) },
  ],
  align: 'end',              // mọi tuỳ chọn khác được chuyển cho bind()/open()
});
card.querySelector('.card__actions').append(btn);
```

- Không có `label` và không có `ariaLabel` → nút nhận `aria-label` = `TdMenu.labels.trigger` (mặc định `Tùy chọn`).
- `getItems` là tên thay thế cho `items` (dwp compat); nếu có cả hai thì `items` thắng.
- Icon không có trong registry → nút không có icon (không lỗi).

### 3. Mở bằng code — `TdMenu.open()`

Dùng khi anchor không phải nút bạn quản lý (ví dụ nút trên toolbar của lightbox, một ô bảng):

```js
const handle = TdMenu.open(anchorEl, items, { align: 'start', side: 'top', focus: 'first' });
if (handle) {
  handle.element;   // phần tử .td-menu đang mở
  handle.isOpen;    // true cho tới khi đóng
  handle.close();
}
```

`open()` là **toggle**: gọi lại với cùng anchor khi menu của anchor đó đang mở → đóng và trả `null`. Chỉ có **một menu
mở tại một thời điểm**; mở menu cho anchor khác sẽ đóng menu cũ.

### 4. Mục chọn được: checkbox và radio

```js
let view = 'grid';
let showHidden = false;

TdMenu.bind(trigger, () => [
  { label: 'Dạng lưới', type: 'radio', group: 'view', checked: view === 'grid',
    onSelect: () => { view = 'grid'; render(); } },
  { label: 'Dạng danh sách', type: 'radio', group: 'view', checked: view === 'list',
    onSelect: () => { view = 'list'; render(); } },
  { separator: true },
  { label: 'Hiện mục ẩn', type: 'checkbox', checked: showHidden,
    onSelect: (ctx) => { showHidden = ctx.checked; render(); } },
]);
```

Quan trọng: menu **không bao giờ sửa object item của bạn**. Trạng thái mới đến qua `ctx.checked` trong `onSelect`;
bạn phải lưu vào model của mình (như ví dụ trên), nếu không lần mở sau sẽ hiện trạng thái cũ. Vì vậy nên dùng dạng
hàm `() => items` để mỗi lần mở đọc lại model.

- `checkbox`: bấm là đảo trạng thái **tại chỗ**, menu **vẫn mở**.
- `radio`: bấm chọn một mục trong cùng `group`, menu **đóng**, `ctx.checked` luôn là `true`.
- Item có `checked` (boolean) mà không có `type` → được coi là `radio` (tương thích dwp).

### 5. Registry tuỳ chọn: lõi định nghĩa, module/site thêm mục (0.14.0)

Đây là cơ chế "lõi nhỏ + hook" của menu: một module định nghĩa menu **theo tên**, module khác (plugin, site) chèn
thêm mục mà không phải sửa code của module gốc.

```js
// Module bài viết (lõi)
TdMenu.define('post-actions', (ctx) => [
  { label: 'Sửa', onSelect: (c) => editPost(c.postId) },                 // order mặc định 0
  { label: 'Chia sẻ', onSelect: (c) => sharePost(c.postId) },             // order 10
  { label: 'Xoá', danger: true, order: 2000,                              // luôn cuối
    when: (c) => c.canDelete === '1', onSelect: (c) => deletePost(c.postId) },
]);

// Plugin thống kê (file khác, có thể chạy TRƯỚC hoặc SAU define)
const unregister = TdMenu.register('post-actions', [
  { label: 'Xem thống kê', icon: 'info', onSelect: (c) => openStats(c.postId) },
], { group: 'stats', order: 500 });

TdMenu.has('post-actions'); // true
```

Mở menu theo tên:

```js
TdMenu.open(anchor, 'post-actions', { ctx: { postId: 7, canDelete: '1' } });
TdMenu.bind(trigger, 'post-actions', { ctx: { postId: 7 } });
```

Hoặc **khai báo trong HTML** (hợp với trang render server-side như dwp/135) và gọi `bindAll()` **một lần**:

```html
<button type="button" class="td-menu-btn" aria-label="Thao tác"
        data-td-menu="post-actions" data-td-menu-post-id="7" data-td-menu-can-delete="1">···</button>
```

```js
const unbindAll = TdMenu.bindAll();          // root mặc định = document
// hoặc giới hạn trong một vùng: TdMenu.bindAll(document.querySelector('#feed'))
```

Quy tắc sắp xếp và nhóm:

| Quy tắc | Chi tiết |
|---|---|
| `order` của mục base (`define`) | mặc định `vị trí × 10` (0, 10, 20…) nếu item không tự khai `order` |
| `order` của mục `register` | `item.order` → `opts.order` → mặc định `1000` (nối cuối) |
| Bằng `order` | giữ thứ tự khai báo/đăng ký |
| `group` (tuỳ chọn của `register`) | đổi nhóm giữa hai mục liền nhau → tự chèn separator. Mục base và mục đăng ký không có `group` chung một nhóm mặc định |
| `when(ctx)` | trả `false` → ẩn mục. `when` throw → ẩn mục + `console.warn`. Áp dụng cho **mọi** danh sách, kể cả mảng thường |
| Separator | tự gộp: không có separator ở đầu, cuối, hay hai cái liền nhau |
| `define` lần hai cùng tên | **thay** danh sách base (các mục `register` vẫn giữ) |
| Tên chưa có gì | `open()` → `console.warn` + trả `null` (menu đang mở, nếu có, vẫn mở) |
| Mọi mục bị ẩn | `open()` trả `null` |

Mảng truyền vào `define`/`register` được **sao chép** tại thời điểm gọi; sửa mảng gốc sau đó không ảnh hưởng.
`undefine()` / `unregister()` chỉ gỡ đúng phần đóng góp của chính nó (một `undefine` cũ không gỡ được định nghĩa mới
hơn).

### 6. Ngữ cảnh `ctx`

`ctx` được dựng mỗi lần mở và truyền cho builder `(ctx) => items`, `when(ctx)` và `onSelect(ctx)`:

```text
ctx = {
  ...opts.ctx,                      // dữ liệu bạn truyền qua open()/bind()
  ...data-td-menu-* của anchor,     // camelCase, luôn là CHUỖI
  anchor,                           // phần tử anchor
  name,                             // tên menu đã đăng ký ('' nếu là danh sách thường)
}
onSelect nhận thêm: item (object item gốc của bạn), checked (boolean)
```

- `data-td-menu-post-id="7"` → `ctx.postId === '7'` (chuỗi; tự `Number()` nếu cần). `data-td-menu` (không hậu tố)
  là tên menu, không vào `ctx`.
- Thứ tự ghi đè: `data-td-menu-*` thắng `opts.ctx` khi trùng khoá.
- Các khoá dành riêng bị bỏ qua nếu bạn truyền: `__proto__`, `constructor`, `prototype`, `anchor`, `name`, `item`,
  `checked`.

## Property & method

Tất cả là static trên `TdMenu`.

| Chữ ký | Trả về | Mô tả |
|---|---|---|
| `TdMenu.open(anchor, items, opts?)` | `{ element, close(), isOpen } \| null` | Mở menu tại `anchor`. `items`: mảng, `(ctx) => mảng`, hoặc tên đã đăng ký. Trả `null` khi: không có DOM, anchor không phải `HTMLElement` / đã rời DOM, tên không tồn tại, không còn mục nào hiển thị, hoặc đây là lần gọi toggle đóng |
| `TdMenu.close()` | `void` | Đóng menu đang mở (lý do `'api'`); không có menu → không làm gì |
| `TdMenu.isOpen(anchor?)` | `boolean` | Có menu nào mở không; truyền `anchor` → chỉ hỏi menu của anchor đó |
| `TdMenu.bind(trigger, items, opts?)` | `() => void` (unbind) | Nối nút của bạn: ARIA, click toggle (focus mục đầu), `ArrowDown`/`ArrowUp` mở (focus mục đầu/cuối). Nút nằm trong link card: click bị `preventDefault` để không điều hướng. Unbind: gỡ listener, đóng menu của nút nếu đang mở, khôi phục ARIA ban đầu |
| `TdMenu.button(opts?)` | `HTMLButtonElement` | Tạo nút `.td-menu-btn` đã bind. `opts`: `icon`, `label`, `ariaLabel`, `items` \| `getItems`, cộng mọi tuỳ chọn của `open()` |
| `TdMenu.define(name, items)` | `() => void` (undefine) | Khai báo / thay danh sách base của menu tên `name`. Tham số sai → `console.warn` + no-op |
| `TdMenu.register(name, item \| item[], { order?, group? })` | `() => void` (unregister) | Thêm mục vào menu tên `name` (trước hay sau `define` đều được) |
| `TdMenu.has(name)` | `boolean` | Tên có danh sách base hoặc mục đăng ký |
| `TdMenu.bindAll(root = document)` | `() => void` | Trigger khai báo `[data-td-menu="tên"]` trong `root` (event delegation — trigger thêm sau vẫn chạy). Idempotent theo root (gọi lại trả cùng unbind). Trigger đã `bind()` bị bỏ qua; trigger `disabled` / `aria-disabled="true"` không mở |
| `TdMenu.labels` | `{ trigger: 'Tùy chọn' }` | Nhãn mặc định, ghi đè theo site: `TdMenu.labels.trigger = 'Options'` |

Named export phụ: `safeMenuHref(href, page = location)` → chuỗi href an toàn hoặc `null` (đúng hàm kit dùng để lọc
`href`, xem [Bảo mật](#bảo-mật)); `sanitizeDownloadName(name)` → tên file đã lọc cho `download` (0.17.0).

### Tuỳ chọn của `open()` / `bind()` / `button()`

| Tuỳ chọn | Kiểu | Mặc định | Mô tả |
|---|---|---|---|
| `align` | `'start' \| 'center' \| 'end'` | `'end'` | Căn menu theo cạnh của anchor (end = mép phải menu thẳng mép phải nút) |
| `side` | `'bottom' \| 'top'` | `'bottom'` | Phía ưu tiên; tự lật khi không đủ chỗ |
| `label` | `string` | — | Có → menu dùng `aria-label`; không có → `aria-labelledby` trỏ tới id của anchor (kit tự gán id `td-menu-trigger-{n}` nếu anchor chưa có) |
| `focus` | `'first' \| 'last'` | `'first'` | Mục được focus khi mở (bỏ qua mục disabled; nếu tất cả disabled thì vẫn focus mục đầu/cuối) |
| `onClose` | `(reason) => void` | — | Gọi sau khi đóng. `reason`: `'select'`, `'escape'`, `'tab'`, `'outside'`, `'hidden'`, `'api'`. Lỗi trong hàm được log, không ném ra |
| `ctx` | `object` | — | Dữ liệu ngữ cảnh (xem [ctx](#6-ngữ-cảnh-ctx)) |
| `isAllowedUrl` | `(url) => boolean` | — | Chính sách URL riêng cho `href` của menu này: **thay** bộ lọc mặc định `safeMenuHref` (bạn chịu trách nhiệm). `false` / ném lỗi → mục disabled. `javascript:` luôn bị chặn. Xem [Mục tải xuống](#mục-tải-xuống-download) |

Trigger khai báo qua `bindAll()` luôn mở với tuỳ chọn mặc định (align `end`, không `onClose`); cần tuỳ chọn riêng thì
dùng `bind()`.

## Hook & tuỳ chọn

### Định dạng item

| Thuộc tính | Kiểu | Mô tả |
|---|---|---|
| `label` | `string` | **Bắt buộc**. Chữ hiển thị, luôn là text (`textContent`). Item không có label bị bỏ |
| `onSelect` (alias `onClick`) | `(ctx) => void \| Promise` | Gọi khi chọn. Lỗi hoặc promise reject được `console.error`, không phá menu. Promise **không được await** |
| `href` | `string` | Biến mục thành `<a>`. Chỉ `https:`, `http:` (khi trang là http) hoặc URL tương đối (hoặc theo option `isAllowedUrl` nếu có). Khác → mục disabled + warn |
| `newTab` | `boolean` | Link mở tab mới: `target="_blank" rel="noopener noreferrer"` |
| `download` | `true \| string` | Chỉ với `href`: link thành `<a download>`. Chuỗi = tên file (đã lọc); `true` = trình duyệt tự đặt tên theo URL |
| `icon` | `string` | Tên icon trong registry (`hasIcon`). Không có → bỏ qua icon, không lỗi |
| `iconNode` | `SVGElement` | SVG bạn tự dựng (tin cậy), được **clone**, gắn `aria-hidden`. Chỉ dùng khi không có `icon` hợp lệ |
| `hint` | `string` | Dòng phụ dưới label (phím tắt, mô tả), là text; trở thành `aria-describedby` |
| `danger` | `boolean` | Kiểu nguy hiểm (màu `--td-menu-danger-fg`) |
| `disabled` | `boolean` | `aria-disabled="true"`: vẫn focus được bằng phím (theo APG) nhưng không kích hoạt được |
| `type` | `'item' \| 'checkbox' \| 'radio'` | Mặc định `'item'` |
| `checked` | `boolean` | Trạng thái của checkbox/radio lúc mở |
| `group` | `string` | Khoá nhóm radio (mặc định `''`) |
| `id` | `string` | Xuất ra `data-item="{id}"` trên phần tử mục (để test/style) |
| `order` | `number` | Chỉ dùng trong registry (menu đặt tên) |
| `when` | `(ctx) => boolean` | Ẩn mục khi trả `false` |
| `{ separator: true }` | — | Đường kẻ phân cách |

`href` chỉ có tác dụng với `type: 'item'`. Mục link vẫn gọi `onSelect` (sau khi trình duyệt bắt đầu điều hướng, với
`ctx.checked = false`).

### Mục tải xuống (`download`)

```js
TdMenu.open(button, [
  { label: 'Ảnh gốc', href: '/media/42/original.jpg', download: 'anh-goc.jpg' },
  { label: 'Ảnh nhỏ', href: '/media/42/small.jpg', download: true }, // tên file lấy từ URL
]);

// Scheme mà bộ lọc mặc định từ chối (blob:, …): truyền chính sách của bạn — nó THAY bộ lọc mặc định.
TdMenu.open(button, [{ label: 'Bản xuất', href: blobUrl, download: 'bao-cao.csv' }], {
  isAllowedUrl: (url) => url.startsWith('blob:') || safeMenuHref(url) !== null,
});
```

- Tên file được lọc: bỏ `/ \ : * ? " < > |` và ký tự điều khiển, cắt dấu chấm / khoảng trắng hai đầu, tối đa 200 ký
  tự. Lọc xong rỗng → `download` không giá trị (trình duyệt tự đặt tên). Export phụ `sanitizeDownloadName(name)`.
- `download` chỉ có hiệu lực khi `href` được chấp nhận (mục bị chặn là nút disabled, không có `download`).
- Trình duyệt chỉ tôn trọng `download` với URL **cùng origin** (hoặc `blob:` / `data:`); URL khác origin thì điều
  hướng bình thường — cần tải file khác origin thì trỏ qua proxy của site.

## Tuỳ biến giao diện

Token khai báo trong `@layer td.tokens` trên `:root`:

| Token | Mặc định | Tác dụng |
|---|---|---|
| `--td-menu-min-w` | `13rem` | Chiều rộng tối thiểu của menu |
| `--td-menu-max-w` | `22rem` | Chiều rộng tối đa (luôn ≤ `100vw - 16px`) |
| `--td-menu-item-py` | `0.6rem` | Padding dọc của mục |
| `--td-menu-item-px` | `0.75rem` | Padding ngang của mục (và lề của separator) |
| `--td-menu-item-hover` | `var(--td-color-hover)` | Nền khi hover |
| `--td-menu-item-active` | `var(--td-color-hover-strong)` | Nền khi focus bằng phím |
| `--td-menu-danger-fg` | `var(--td-color-error)` | Màu chữ mục `danger` |
| `--td-menu-hint-fg` | `var(--td-color-text-muted)` | Màu `hint` |
| `--td-menu-icon-fg` | `var(--td-color-text-muted)` | Màu icon |
| `--td-menu-separator` | `var(--td-color-border)` (dark: `rgb(255 255 255 / 12%)`) | Màu separator |
| `--td-menu-btn-fg` | `var(--td-color-text-muted)` | Màu nút `.td-menu-btn` |
| `--td-menu-btn-fg-hover` | `var(--td-color-text)` | Màu nút khi hover / đang mở |
| `--td-menu-btn-hover` | `var(--td-color-hover)` | Nền nút khi hover / đang mở |
| `--td-menu-btn-size` | `32px` | Kích thước tối thiểu của nút (thiết bị cảm ứng: `--td-touch-min`) |

Menu dùng công thức kính chung (`.td-glass-surface--strong`): padding `--td-glass-pad`, bo góc `--td-glass-radius`,
mục bo góc đồng tâm `--td-glass-radius-inner`. Tắt kính toàn site bằng `<html data-td-glass="off">` (xem
[Theming](../customization/theming.md)).

```css
/* site.css — CSS không nằm trong layer luôn thắng @layer td.* */
:root {
  --td-menu-min-w: 15rem;
  --td-menu-danger-fg: #b42318;
}
```

JS chỉ ghi hình học (top/left, max-height) qua CSSOM. Menu cao tối đa `min(chiều cao viewport − 16px, 448px)`, dài hơn
thì tự cuộn bên trong.

## Cấu trúc DOM & class

Menu (tạo khi mở, gỡ khi đóng; `{m}` = `td-menu-{n}`):

```html
<div class="td-menu td-glass-surface td-glass-surface--strong" id="{m}" role="menu"
     aria-labelledby="{id trigger}" data-state="open" data-placement="bottom" data-align="end">
  <button type="button" class="td-menu__item" role="menuitem" tabindex="-1"
          aria-labelledby="{m}-label-0" aria-describedby="{m}-hint-0" data-item="share">
    <span class="td-menu__label" id="{m}-label-0">Chia sẻ</span>
    <span class="td-menu__icon" data-td-icon="link" aria-hidden="true"><svg…></svg></span>
    <span class="td-menu__hint" id="{m}-hint-0">Sao chép liên kết</span>
  </button>
  <button type="button" class="td-menu__item td-menu__item--danger" role="menuitem" tabindex="-1">…</button>
  <div class="td-menu__separator" role="separator"></div>
  <button type="button" class="td-menu__item" role="menuitemcheckbox" tabindex="-1" aria-checked="true">
    <span class="td-menu__label">Chế độ tối</span>
    <span class="td-menu__check" data-td-icon="check" aria-hidden="true"><svg…></svg></span>
  </button>
  <a class="td-menu__item" role="menuitem" tabindex="-1" href="https://example.com/"
     target="_blank" rel="noopener noreferrer"><span class="td-menu__label">Mở trang</span></a>
  <a class="td-menu__item" role="menuitem" tabindex="-1" href="/media/42/original.jpg"
     download="anh-goc.jpg"><span class="td-menu__label">Ảnh gốc</span></a>
</div>
```

| Selector / attribute | Ý nghĩa |
|---|---|
| `.td-menu[data-placement="bottom\|top"]` | Phía thực tế sau khi tự lật |
| `.td-menu[data-align="start\|center\|end"]` | Căn lề |
| `.td-menu__item[aria-disabled="true"]` | Mục disabled |
| `.td-menu__item[aria-checked="true"] .td-menu__check` | Dấu check hiện |
| `.td-menu__item--danger` | Mục nguy hiểm |
| Trigger `[aria-expanded="true"]` | Menu của trigger đang mở (`.td-menu-btn` tô nền) |

Nút do `TdMenu.button()` tạo (site render server-side có thể in đúng markup này rồi `bind()` hoặc dùng `data-td-menu`):

```html
<button type="button" class="td-menu-btn" aria-haspopup="menu" aria-expanded="false" aria-label="Tùy chọn">
  <span class="td-menu-btn__icon" data-td-icon="more" aria-hidden="true"><svg…></svg></span>
  <span class="td-menu-btn__label">Thêm</span>  <!-- chỉ khi có label -->
</button>
```

Hợp đồng markup đầy đủ (golden fixture): `test/contracts/menu.html`.

### Trigger dùng chung (ownership)

Một trigger có thể được cả `bind()` lẫn một hay nhiều `bindAll()` root "sở hữu" cùng lúc. Kit chụp **một** bản sao
các attribute gốc (`id`, `aria-haspopup`, `aria-expanded`, `aria-controls`) khi chủ sở hữu đầu tiên nhận trigger, và
chỉ khôi phục khi **chủ sở hữu cuối cùng** buông. Nhờ vậy gỡ một binding không làm mất ARIA mà binding khác còn dùng.
Về sự kiện: trigger đã `bind()` thì `bindAll()` bỏ qua click/phím của nó; root lồng nhau không bao giờ xử lý cùng một
click hai lần. `bindAll()` gắn ARIA cho trigger có sẵn ngay khi gọi, và cho trigger thêm sau khi chúng nhận focus / bị
rê chuột / được bấm.

## Bàn phím & trợ năng

| Ở đâu | Phím | Hành vi |
|---|---|---|
| Trigger (`bind` / `bindAll`) | `Enter` / `Space` (nút `<button>` thật), click | Mở/đóng, focus mục đầu |
| Trigger | `ArrowDown` / `ArrowUp` | Mở, focus mục đầu / mục cuối |
| Trong menu | `ArrowDown` / `ArrowUp` | Mục sau / trước (vòng lại), kể cả mục disabled |
| Trong menu | `Home` / `PageUp`, `End` / `PageDown` | Mục đầu / cuối |
| Trong menu | Gõ chữ | Type-ahead: nhảy tới mục bắt đầu bằng chuỗi vừa gõ (reset sau 500 ms), không phân biệt dấu (`đ` = `d`, `ồ` = `o`); gõ lặp một chữ thì vòng qua các mục |
| Trong menu | `Enter` / `Space` | Kích hoạt mục. Mục link: `Enter` theo link tự nhiên, `Space` bấm link |
| Trong menu | `Escape` | Đóng, focus về trigger (phím được "tiêu thụ", không lọt xuống modal bên dưới) |
| Trong menu | `Tab` / `Shift+Tab` | Đóng và đi tiếp: focus rơi vào phần tử **sau / trước** trigger (không quay lại trigger). Trong modal, focus trap của modal tiếp tục |

- Focus thật di chuyển giữa các mục (roving focus, `tabindex="-1"`).
- Chọn một mục thường/radio: đóng menu, **focus trigger trước** rồi mới gọi `onSelect` — nên nếu `onSelect` mở một
  `TdModal`, modal đóng sẽ trả focus về trigger.
- Tên truy cập của mục = label; `hint` là mô tả (`aria-describedby`), không bị đọc lặp.
- Bấm chuột ra ngoài (`pointerdown`) đóng menu và **cú bấm vẫn có tác dụng** (không bị nuốt).
- Anchor bị cuộn khuất hoặc bị gỡ khỏi DOM → menu đóng (lý do `'hidden'`). Cuộn **bên trong** menu dài không đóng menu.
- Menu nằm ở lớp `--td-z-popover` (450): dùng được **trên** `TdModal` và trên lightbox. Menu mở trên modal vẫn giữ
  kính, còn modal bị phủ chuyển sang nền đặc (luật "kính trên cùng thắng").
- `prefers-reduced-motion`: chỉ fade, không scale. `forced-colors`: viền và focus theo màu hệ thống. Thiết bị cảm ứng:
  mục cao tối thiểu `--td-touch-min` (44px).

## Bảo mật

- `label`, `hint`, giá trị `data-td-menu-*`: **luôn là text**, không bao giờ qua `innerHTML`. Có thể truyền thẳng dữ
  liệu người dùng.
- `href` qua `safeMenuHref()`: chuỗi được chuẩn hoá như trình duyệt (bỏ ký tự điều khiển, tab/xuống dòng) rồi resolve;
  chỉ nhận `https:`, hoặc `http:` khi chính trang đang là `http:` (không hạ cấp từ HTTPS). `javascript:`, `data:`,
  `mailto:`, `tel:`, chuỗi không parse được → mục **disabled** + `console.warn`. Cần gửi mail / gọi điện → dùng
  `onSelect`:

  ```js
  { label: 'Gửi email', onSelect: () => { location.href = 'mailto:' + encodeURIComponent(email); } }
  ```

- Option `isAllowedUrl` **thay** `safeMenuHref` cho menu đó: chính sách lỏng (ví dụ trả `true` cho mọi URL) là lỗ
  hổng của bạn. Ghép với `safeMenuHref` và chỉ mở thêm đúng scheme cần (`blob:`). Kit vẫn luôn chặn `javascript:`;
  chính sách ném lỗi → URL bị chặn.
- Tên file `download` luôn được lọc (không có ký tự đường dẫn / điều khiển), kể cả khi lấy từ dữ liệu người dùng.

- `iconNode` là **DOM tin cậy**: chỉ truyền SVG do code của bạn dựng; kit clone nó nguyên trạng.
- `when()` chỉ ẩn mục trên giao diện, **không phải phân quyền**. Server vẫn phải kiểm tra quyền khi xử lý hành động.

Xem thêm [Hướng dẫn bảo mật](../guides/security.md).

## Lưu ý & lỗi thường gặp

- **Checkbox "không nhớ" trạng thái**: đúng thiết kế — kit không sửa item của bạn. Lưu `ctx.checked` vào model và
  dựng lại item từ model (dùng `() => items`).
- **`open()` trả `null`** khi: tên menu chưa đăng ký (xem console), mọi mục bị `when` ẩn, mục nào cũng thiếu `label`,
  anchor chưa gắn vào DOM, hoặc bạn vừa gọi lại `open()` trên anchor đang mở (toggle đóng).
- **Trigger khai báo không mở**: bạn chưa gọi `TdMenu.bindAll()` (không có gì chạy khi import), trigger nằm ngoài
  `root`, trigger `disabled`, hoặc giá trị `data-td-menu` rỗng.
- **Trigger không phải `<button>`**: `bindAll()` không tự thêm `tabindex` hay xử lý `Enter`; hãy dùng `<button>` thật.
- **`ctx.postId` là chuỗi**, không phải số, khi lấy từ `data-td-menu-post-id`.
- `onSelect` async: kit không chờ promise; lỗi reject chỉ được log. Tự hiển thị lỗi (ví dụ `TdToast`) trong hàm.
- Link `mailto:` / `tel:` bị disabled là **cố ý** (fail closed).

## Xem thêm

- [Hook & tuỳ chọn theo component](../customization/hooks.md) · [Mở rộng: menu registry, icon](../customization/extending.md)
- [Icons](icons.md) (tên dùng cho `icon`) · [Modal](modal.md) · [Hovercard](hovercard.md) · [Lightbox](lightbox.md)
  (mở menu từ nút toolbar)
- [Trợ năng](../guides/accessibility.md) · [Bảo mật](../guides/security.md) · [Theming](../customization/theming.md)
