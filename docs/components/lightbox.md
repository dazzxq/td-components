[Tài liệu](../README.md) › [Components](README.md) › Lightbox

# Lightbox — `TdLightbox`

`TdLightbox` là trình xem ảnh/video toàn màn hình: gallery có nút trước/sau, bộ đếm, chú thích, zoom (pinch, double-tap,
click), vuốt để chuyển/đóng, fullscreen, nút tải xuống, panel thông tin (hai cột trên desktop, bottom sheet trên mobile)
và các hook để mỗi site tự cắm video player, lịch sử trình duyệt, nút toolbar riêng. Dùng cho ảnh trong bài viết,
album, thư viện media. **Không** dùng để hiện form hay hộp thoại xác nhận (dùng [`TdModal`](modal.md)).

| | |
|---|---|
| Import | `import { TdLightbox } from '@dazzxq/td-components/lightbox'` |
| Loại | API JS tĩnh (static class), không có tag |
| Form-associated | không |
| Từ phiên bản | 0.6.0 (handle `setPanel` / `addToolbarButton`, `itemEl` / `groupEl`, `attrPrefix` / `filter`: 0.15.0) |
| CSS | cần `td.css` (`src/styles/components/lightbox.css`) |
| Quyết định kiến trúc | [ADR 0009](../internal/decisions/0009-td-lightbox-hooks.md) |

Import không có side effect: không có global `window.*`, không tự quét trang. Overlay được tạo lần đầu mở và giữ lại
trong `<body>` cho các lần sau.

## Ví dụ nhanh

**Cách 1 — markup + `bind()`** (hợp với trang render server-side):

```html
<div class="gallery" data-td-lightbox-group>
  <a href="/uploads/1.jpg" data-td-lightbox-item><img src="/uploads/1-thumb.jpg" alt="Hoàng hôn"></a>
  <a href="/uploads/2.jpg" data-td-lightbox-item><img src="/uploads/2-thumb.jpg" alt="Bến cảng"></a>
  <figure data-td-lightbox-item>
    <img src="/uploads/3.jpg" alt="Phố cổ">
    <figcaption>Phố cổ lúc 6 giờ sáng</figcaption>
  </figure>
</div>
```

```js
import { TdLightbox } from '@dazzxq/td-components/lightbox';

TdLightbox.bind(document); // một lần: mọi gallery trên trang (kể cả thêm sau) đều mở được
```

**Cách 2 — gọi bằng code**:

```js
const lb = TdLightbox.open([
  { src: '/uploads/1.jpg', caption: 'Hoàng hôn', alt: 'Hoàng hôn trên biển' },
  '/uploads/2.jpg',                                   // chuỗi = { src }
  { type: 'video', src: '/uploads/clip.mp4', poster: '/uploads/clip.jpg' },
], { index: 1 });

if (lb) {
  lb.next();
  lb.close();
}
```

## Cách dùng

### 1. Định dạng item

```ts
{
  type?: 'image' | 'video',   // mặc định 'image' (giá trị khác cũng thành 'image')
  src: string,                // bắt buộc; phải qua isAllowedUrl
  poster?: string,            // ảnh chờ của video; phải qua isAllowedUrl
  caption?: string,           // chú thích (text)
  alt?: string,               // alt của <img> (text)
  provider?: string,          // mặc định 'html5'; tên tuỳ ý cho video hook ('youtube', 'vimeo'…)
  data?: any,                 // dữ liệu của bạn, trả lại trong ctx.item.data; nếu là Element → ctx.itemEl
}
```

- Một chuỗi được hiểu là `{ src: chuỗi }`.
- Item có `src` không qua `isAllowedUrl` bị **loại** khỏi gallery; `poster` không hợp lệ thì chỉ bị bỏ poster.
- Không còn item nào xem được → `open()` trả `null`, không mở gì.
- Item video có `src` hợp lệ → chạy video hook; hook từ chối → hiện `poster` như ảnh.

### 2. Mở bằng code và điều khiển qua handle

```js
const lb = TdLightbox.open(items, { index: 0 });
lb.index;    // vị trí hiện tại (-1 khi handle đã chết)
lb.count;    // số item (0 khi chết)
lb.token;    // id phiên (số tăng dần)
lb.isOpen;   // phiên này còn mở?
lb.goTo(3);  // kẹp vào [0, count-1]
```

Gọi `open()` khi đang mở sẽ **thay gallery** trong cùng overlay (không khoá scroll lại, không push history lại); handle
cũ trở thành "chết" — mọi method của nó là no-op.

### 3. Markup + `bind()`

`TdLightbox.bind(root = document, options)` lắng nghe `click` trên `root` (delegation). Có hai dạng markup:

**Gallery**: `[data-td-lightbox-group]` bao các `[data-td-lightbox-item]` (item có thể lồng sâu, chính group cũng có
thể là item). Item được tìm bằng `querySelectorAll` theo thứ tự tài liệu.

**Ảnh đơn**: `[data-td-lightbox]`, giá trị là URL ảnh, hoặc để trống / `true` / `1` để kit tự tìm nguồn.

```html
<!-- ảnh đơn, nguồn lấy từ <img> bên trong -->
<figure data-td-lightbox data-td-lightbox-caption="Ảnh đơn">
  <img src="/uploads/1.jpg" alt="Ảnh một">
</figure>

<!-- ảnh đơn, URL ảnh lớn nằm ngay trên attribute -->
<img src="/uploads/1-thumb.jpg" alt="Ảnh một" data-td-lightbox="/uploads/1.jpg">

<!-- video trong gallery -->
<div data-td-lightbox-item data-td-lightbox-type="video" data-td-lightbox-src="/uploads/clip.mp4"
     data-td-lightbox-poster="/uploads/clip.jpg" data-td-lightbox-caption="Video bốn"></div>
```

Cách kit đọc một item (`readItem`):

| Trường | Thứ tự lấy |
|---|---|
| `src` | `data-td-lightbox-src` → giá trị `data-td-lightbox` (nếu không phải rỗng/`true`/`1`) → `a[href]` bao ngoài hoặc bên trong, **chỉ khi** đường dẫn kết thúc bằng đuôi ảnh (`jpg`, `jpeg`, `png`, `webp`, `gif`, `avif`, `svg`) → `currentSrc` / `src` của `<img>` (chính phần tử hoặc `<img>` đầu tiên bên trong) |
| `type` | `data-td-lightbox-type="video"` → video, còn lại ảnh |
| `caption` | `data-td-lightbox-caption` → `<figcaption>` của `<figure>` gần nhất → `alt` của `<img>` |
| `alt` | `alt` của `<img>` |
| `poster` | `data-td-lightbox-poster` |
| `provider` | `data-td-lightbox-provider` (mặc định `html5`) |
| `data` | chính phần tử item → thành `ctx.itemEl` |

Chỉ mục mở ra là **vị trí của phần tử được click trong số item hợp lệ** (item có URL bị từ chối không được tính, và
không bao giờ bị nhầm theo `src` trùng nhau). Click vào chính một item không hợp lệ → không mở, click đi tiếp bình
thường.

Click bị bỏ qua khi: đã `defaultPrevented`, không phải chuột trái, có giữ `Ctrl`/`Cmd`/`Shift`/`Alt` (để mở link ở tab
mới vẫn hoạt động), phần tử nằm ngoài `root`, hoặc `filter` trả `false`. Khi mở, kit gọi `preventDefault()` (link
`<a href>` bao ảnh không điều hướng).

Một `[data-td-lightbox-item]` **không** nằm trong group nào thì không làm gì cả — dùng `[data-td-lightbox]` cho ảnh đơn.

Các tuỳ chọn của `open()` truyền cho `bind()` được áp cho **mọi** gallery mà binding đó mở:

```js
const unbind = TdLightbox.bind(document.querySelector('#article'), {
  panel: true,               // chú thích vào panel bên
  history: true,             // nút Back đóng lightbox
  labels: { dialog: 'Ảnh trong bài' },
});
```

Hợp đồng markup (golden fixture cho adapter SSR của 135 / dwp): `test/contracts/lightbox.html`.

### 4. Đọc markup của dwp — `attrPrefix` và `filter` (0.15.0)

```js
TdLightbox.bind(document, {
  attrPrefix: 'dwp',   // đọc data-dwp-lightbox, -item, -group, -src, -type, -poster, -caption, -provider
  filter: (el, event) => !isOwnedByVideoModule(el), // false → bỏ qua click này (không preventDefault)
});
```

- `attrPrefix` phải khớp `/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/` (vì nó đi vào CSS selector). Sai → `console.warn` và
  dùng `'td'`.
- `filter(el, event)`: `el` là item hoặc trigger đơn được click. Trả `false` → click để nguyên cho code khác xử lý.
  `filter` throw → coi như `false` + `console.warn` (fail closed: không mở).
- `attrPrefix` và `filter` chỉ dành cho `bind()`, không được chuyển xuống `open()`.

### 5. Panel thông tin

```js
// Chú thích vào panel (ảnh không có caption → không có panel)
TdLightbox.open(items, { panel: true });

// Panel tuỳ biến: trả về một Element (hoặc null để ẩn panel ở slide này)
TdLightbox.open(items, {
  panel: (ctx) => {
    const box = document.createElement('div');
    const title = document.createElement('h3');
    title.textContent = ctx.item.caption || 'Không có chú thích';
    const meta = document.createElement('p');
    meta.textContent = `Ảnh ${ctx.index + 1} / ${ctx.count}`;
    box.append(title, meta);
    return box;
  },
});
```

- Renderer chạy lại mỗi khi đổi slide. Chỉ nhận `Element`; **chuỗi bị bỏ qua** (không có đường chèn HTML). Throw hoặc
  trả `null` → không có panel ở slide đó.
- `panel: true` dựng `<p class="td-lightbox__panel-caption">` từ `caption` (text).
- Bố cục: màn hình **> 900px** → hai cột (ảnh | panel rộng `--td-lb-panel-w`), zoom bị cắt theo cột ảnh; **≤ 900px** →
  **bottom sheet** đóng sẵn, chỉ lộ tay nắm (nút `.td-lightbox__grab`, `aria-expanded`, tên = `labels.info`). Chạm tay
  nắm, vuốt lên trên panel (> 32px) hoặc vuốt lên trên ảnh (> 60px) để mở; vuốt xuống (> 32px) khi panel đang ở đầu
  để đóng. Sheet luôn đóng khi mở lightbox và khi panel chuyển sang "không có".
- Khi có panel: dải caption dưới ảnh bị ẩn (tránh lặp), nút **Quay lại** (góc trên trái, `labels.back`) hiện ra và
  đóng lightbox. Panel cuộn về đầu mỗi slide.

Đổi panel khi đang mở (tương đương `setViewerMode` + `setSidePanel` của dwp):

```js
const lb = TdLightbox.open(items);
lb.setPanel((ctx) => buildExifPanel(ctx.item.data)); // bật
lb.refreshPanel();                                   // dữ liệu đổi → render lại
lb.setPanel(false);                                  // tắt (sheet đóng)
```

### 6. Nút toolbar riêng

```js
TdLightbox.open(items, {
  toolbar: [
    {
      id: 'cover',
      label: 'Đặt làm ảnh bìa',
      icon: 'star',                                 // tên trong registry icon
      onClick: (ctx, button) => {
        setCover(ctx.item.data.id);
        button.toggleAttribute('data-on');          // tô vàng trạng thái bật
      },
      visible: (ctx) => ctx.item.type === 'image',  // false → ẩn ở slide này
    },
  ],
});
```

Thêm / bỏ nút khi đang mở:

```js
const remove = lb.addToolbarButton({ id: 'info', label: 'Thông tin', icon: 'info', onClick: () => togglePanel() });
remove();                       // hoặc: lb.removeToolbarButton('info')
```

Mở một `TdMenu` từ nút toolbar — menu nằm lớp trên lightbox nên dùng được ngay:

```js
import { TdMenu } from '@dazzxq/td-components/menu';

TdLightbox.open(items, {
  toolbar: [{
    id: 'more', label: 'Thêm', icon: 'more',
    onClick: (ctx, button) => TdMenu.open(button, [
      { label: 'Sao chép liên kết', onSelect: () => navigator.clipboard.writeText(ctx.item.src) },
      { label: 'Báo cáo ảnh', danger: true, onSelect: () => report(ctx.item.data) },
    ]),
  }],
});
```

### 7. Video

Mặc định: item `provider: 'html5'` → `<video class="td-lightbox__video-el" controls playsinline preload="metadata">`
native. Provider khác → hook mặc định từ chối → hiện `poster`. Muốn player khác (Plyr, YouTube…) thì truyền hook
`video` (xem [Hook video](#hook-video)).

Trên slide video: cử chỉ zoom/vuốt tắt; phím mũi tên / `Escape` khi focus đang trong player thuộc về player (không
chuyển slide, không đóng).

### 8. Lắng nghe sự kiện

```js
document.addEventListener('td-lightbox-change', (e) => {
  const { index, count, item, itemEl, groupEl, token } = e.detail;
  itemEl?.classList.add('is-viewed');
});
```

## Property & method

### Static

| Chữ ký | Trả về | Mô tả |
|---|---|---|
| `TdLightbox.open(items, options?)` | handle \| `null` | Mở (hoặc thay gallery nếu đang mở). `items`: mảng item/chuỗi, hoặc một item đơn. `null` khi không có DOM hoặc không còn item hợp lệ |
| `TdLightbox.close()` | `void` | Đóng (idempotent) |
| `TdLightbox.bind(root = document, options?)` | `() => void` | Click delegation; trả hàm gỡ listener |
| `TdLightbox.isOpen` | `boolean` | **Getter** (không phải hàm): có lightbox đang mở không |

Named export phụ: `defaultIsAllowedUrl(url)` — chính sách URL mặc định, dùng để ghép với allowlist của bạn.

### Handle

| Thành viên | Mô tả |
|---|---|
| `token` | Id của phiên |
| `isOpen` (getter) | Phiên này còn mở (phiên mới hơn thay thế → `false`) |
| `index` (getter) | Vị trí hiện tại; `-1` khi chết |
| `count` (getter) | Số item; `0` khi chết |
| `next()` / `prev()` | Slide sau / trước (vòng quanh; gallery 1 ảnh → không làm gì) |
| `goTo(i)` | Tới vị trí `i` (làm tròn xuống, kẹp vào khoảng hợp lệ) |
| `close()` | Đóng |
| `setPanel(panel)` | Đổi panel lúc đang mở: `false` \| `true` \| `(ctx) => Element \| null`. Bật lại → sheet bắt đầu đóng |
| `refreshPanel()` | Chạy lại renderer panel hiện tại |
| `addToolbarButton(spec)` | Thêm nút (cùng `id` → **thay** nút cũ). Trả `remove()`; `remove` cũ không gỡ được nút thay thế |
| `removeToolbarButton(id)` | Gỡ nút theo id |

Handle của phiên đã đóng/bị thay: mọi method là no-op, `addToolbarButton` trả hàm rỗng.

## Event

Phát trên `document` (`CustomEvent`, `bubbles: false`, không huỷ được).

| Event | detail | Khi nào |
|---|---|---|
| `td-lightbox-open` | `{ index, count, token, item, itemEl, groupEl }` | Sau mỗi lần `open()` (kể cả thay gallery khi đang mở) |
| `td-lightbox-change` | như trên | Mỗi lần hiện một slide — **kể cả slide đầu khi mở**, và phát **trước** `td-lightbox-open` |
| `td-lightbox-close` | như trên (slide cuối cùng) | Khi đóng |

`item` là bản đã chuẩn hoá (URL đã lọc). `itemEl` = `item.data` nếu là `Element` (bind() gán sẵn), ngược lại `null`.
`groupEl` = `[data-*-lightbox-group]` mà bind() tìm thấy, hoặc `options.groupEl` của `open()` nếu là `Element`, ngược
lại `null`.

## Hook & tuỳ chọn

Mọi tuỳ chọn đều không bắt buộc.

| Tuỳ chọn | Kiểu | Mặc định | Mô tả |
|---|---|---|---|
| `index` | `number` | `0` | Slide mở đầu (làm tròn, kẹp) |
| `labels` | `object` | tiếng Việt | Xem [Nhãn](#nhãn-labels) |
| `isAllowedUrl` | `(url, item) => boolean` | `defaultIsAllowedUrl` | Chính sách URL cho `src`, `poster`, link tải |
| `download` | `(item, ctx) => string \| null` | ảnh cùng origin | URL của nút tải xuống |
| `downloads` | `(item, ctx) => Array<{ label, url, filename? }>` | — | Nhiều biến thể tải (0.17.0); có cả `download` → `downloads` thắng. Xem [Hook downloads](#hook-downloads-nhiều-biến-thể) |
| `video` | `(item, mount, { signal }) => player \| Promise<player> \| null` | `<video>` native | Cắm player |
| `history` | `false \| true \| adapter` | `false` | Nút Back của trình duyệt đóng lightbox |
| `panel` | `false \| true \| (ctx) => Element \| null` | `false` | Panel thông tin |
| `toolbar` | `Array<spec>` | `[]` | Nút toolbar riêng |
| `closeOnBackdrop` | `boolean` | `true` | Click nền (ngoài ảnh) để đóng. Khác `TdModal` (không đóng khi click nền): trình xem ảnh không có gì để mất |
| `isForeignLayerOpen` | `() => boolean` | xem dưới | Có lớp khác đang nằm trên lightbox không |
| `groupEl` | `Element` | `null` | Đưa vào `ctx.groupEl` / detail khi mở bằng `open()` |
| `attrPrefix` | `string` | `'td'` | Chỉ cho `bind()` |
| `filter` | `(el, event) => boolean` | — | Chỉ cho `bind()` |

### `ctx`

Các hook `panel`, `download`, `downloads`, `toolbar[].onClick` / `visible` nhận:

```text
ctx = { index, count, item, token, handle, itemEl, groupEl }
```

`handle` là handle của phiên, nên trong hook bạn có thể gọi `ctx.handle.setPanel(…)`, `ctx.handle.goTo(…)`.

### Nhãn (`labels`)

| Khoá | Mặc định | Dùng cho |
|---|---|---|
| `dialog` | `Trình xem ảnh` | `aria-label` của overlay |
| `prev` | `Ảnh trước` | Nút trước |
| `next` | `Ảnh sau` | Nút sau |
| `close` | `Đóng` | Nút đóng |
| `back` | `Quay lại` | Nút quay lại (chế độ panel) |
| `fullscreen` | `Toàn màn hình` | Nút fullscreen |
| `download` | `Tải xuống` | Nút tải |
| `info` | `Thông tin ảnh` | Tay nắm bottom sheet |
| `counter` | ``(i, n) => `${i} / ${n}` `` | Bộ đếm (hàm; `i` bắt đầu từ 1) |

Chỉ khoá có trong bảng được nhận; giá trị sai kiểu bị bỏ qua (giữ mặc định). Nhãn gán vào `aria-label` và `title`.

```js
TdLightbox.open(items, { labels: { prev: 'Previous', next: 'Next', counter: (i, n) => `${i} of ${n}` } });
```

### Hook isAllowedUrl (chính sách URL)

`defaultIsAllowedUrl` (fail closed): `https:` luôn được; `http:` chỉ khi **trang** đang là `http:` (không hạ cấp từ
HTTPS); mọi scheme khác (`data:`, `blob:`, `file:`, `javascript:`…) bị từ chối. URL tương đối được resolve theo trang.
Hook throw → URL bị từ chối.

**Ảnh cross-origin qua HTTPS được phép theo mặc định.** Mỗi ảnh ngoài làm trình duyệt gửi request (IP, User-Agent,
Referer) tới host đó. Nếu nội dung do người dùng nhập (bài viết, bình luận), nên **thu hẹp** bằng allowlist:

```js
import { TdLightbox, defaultIsAllowedUrl } from '@dazzxq/td-components/lightbox';

const MEDIA_ORIGINS = new Set([location.origin, 'https://cdn.example.vn']);

TdLightbox.bind(document, {
  isAllowedUrl: (url) => defaultIsAllowedUrl(url) && MEDIA_ORIGINS.has(new URL(url, location.href).origin),
});
```

Ngược lại, hook này cũng có thể **nới lỏng** chính sách (ví dụ cho `blob:` của ảnh vừa chọn từ máy):

```js
isAllowedUrl: (url) => defaultIsAllowedUrl(url) || url.startsWith('blob:'),
```

Nới lỏng là trách nhiệm của site — đừng bao giờ cho qua `javascript:` hay `data:` từ dữ liệu người dùng.

### Hook download

- Mặc định: chỉ ảnh **cùng origin** mới có nút tải (`href` = `src`). Thuộc tính `download` của `<a>` bị trình duyệt
  bỏ qua với URL khác origin, nên kit không hiện nút có thể gây hiểu nhầm.
- Hook trả URL → nút hiện, `download="{tên file}"` lấy từ đường dẫn. Trả rỗng/`null`/throw → nút ẩn.
- URL trả về vẫn phải qua `isAllowedUrl`.

Ảnh nằm trên CDN khác origin → trỏ tới một proxy cùng origin (server tự kiểm allowlist host và trả
`Content-Disposition: attachment`):

```js
download: (item) => item.type === 'image'
  ? `/media/download?src=${encodeURIComponent(item.src)}`
  : null,
```

### Hook downloads (nhiều biến thể)

`downloads(item, ctx)` trả danh sách `{ label, url, filename? }` (ví dụ ảnh gốc / ảnh nhỏ / WebP). Mỗi lần đổi slide:

1. Gọi hook (ném lỗi hoặc trả không phải mảng → coi như rỗng).
2. **Lọc** từng `url` qua `isAllowedUrl(url, item)` của lightbox (item đang xem).
3. Rẽ nhánh theo số mục **còn lại**: `0` → ẩn nút tải; `1` → nút tải thường `<a download>`; `≥ 2` → nút tải mở một
   [`TdMenu`](menu.md#mục-tải-xuống-download) gồm các `<a download>`.

- `filename` (tuỳ chọn) được lọc ký tự nguy hiểm (`/ \ : * ? " < > |`, ký tự điều khiển); thiếu → vẫn là link tải,
  trình duyệt đặt tên theo URL. `label` thiếu → dùng `filename` hoặc tên file trong URL.
- Menu dùng đúng chính sách của lightbox (`isAllowedUrl(url, item)` với item đang xem), nên scheme site đã cho phép như
  `blob:` vẫn tải được từ menu.
- Có cả `download` và `downloads` → `downloads` thắng (kể cả khi nó trả rỗng: không rơi về `download`).
- Menu tự đóng khi đổi ảnh hoặc đóng lightbox. Bàn phím: `Enter` / `Space` / `↓` / `↑` trên nút mở menu, mũi tên di
  chuyển, `Enter` chọn, `Escape` đóng menu (lightbox vẫn mở, focus về nút tải).

```js
TdLightbox.bind(document, {
  downloads: (item) => item.type === 'image' ? [
    { label: 'Ảnh gốc', url: `/media/download?src=${encodeURIComponent(item.src)}&size=orig`, filename: 'anh-goc.jpg' },
    { label: 'Ảnh 1200px', url: `/media/download?src=${encodeURIComponent(item.src)}&size=1200` },
  ] : [],
});
```

Chính sách phụ thuộc dữ liệu item (ví dụ ảnh riêng tư chỉ cho tải bản nhỏ):

```js
isAllowedUrl: (url, item) => defaultIsAllowedUrl(url) && !(item?.data?.private && url.includes('size=orig')),
```

### Hook video

- `item`: bản sao item; `mount`: phần tử `.td-lightbox__video` để gắn player; `signal`: `AbortSignal`, bị abort khi
  chuyển slide hoặc đóng.
- Trả về object có `destroy()` (đồng bộ hoặc qua Promise). Kit gọi `destroy()` khi rời slide/đóng; một `destroy` throw
  không chặn việc dọn dẹp.
- Trả `null` / object không có `destroy` / throw / Promise reject → xoá mount, hiện `poster` như ảnh (lỗi được
  `console.error`).
- Promise resolve **sau** khi slide đã đổi → kit tự `destroy()` player đó (không phát nhạc nền).

Ví dụ cắm Plyr (site tự cài `plyr` và nạp CSS của Plyr; kit không bundle Plyr):

```js
TdLightbox.bind(document, {
  video: async (item, mount, { signal }) => {
    const youtube = item.provider === 'youtube';
    if (!youtube && item.provider !== 'html5') return null;   // provider lạ → poster
    const { default: Plyr } = await import('plyr');
    if (signal.aborted) return null;

    let target;
    if (youtube) {
      // item.src là URL đầy đủ https://www.youtube.com/watch?v=… (để qua được isAllowedUrl)
      target = document.createElement('div');
      target.setAttribute('data-plyr-provider', 'youtube');
      target.setAttribute('data-plyr-embed-id', new URL(item.src).searchParams.get('v') || '');
    } else {
      target = document.createElement('video');
      target.setAttribute('playsinline', '');
      target.src = item.src;
      if (item.poster) target.poster = item.poster;
    }
    mount.appendChild(target);
    const player = new Plyr(target);
    return { destroy: () => player.destroy() };
  },
});
```

Kiểm tra player bạn chọn dưới CSP của site (Plyr/YouTube cần `frame-src` cho iframe và có thể cần thêm nguồn
`img-src`/`media-src`).

### Hook history

- `false` (mặc định): không đụng history.
- `true`: adapter có sẵn — `history.pushState({ ...history.state, tdLightbox: token }, '')` khi mở, `history.back()`
  khi đóng bằng ✕/Esc/nền/vuốt/API, lắng nghe `popstate`: người dùng bấm Back → lightbox đóng.
- Adapter tự viết: `{ push(token), back(), onPop(cb) }`.

| Hàm | Hợp đồng |
|---|---|
| `push(token)` | Gọi **một lần** khi lightbox mở lần đầu (không gọi lại khi thay gallery). Được trả Promise. Throw hoặc reject = "không push" (khi đóng sẽ không gọi `back()`) |
| `back()` | Gọi khi đóng bằng code **và** trước đó đã push thành công. Được trả Promise; thất bại thì kit hoàn lại bộ đếm để không nuốt lần Back thật tiếp theo |
| `onPop(cb)` | Đăng ký nghe "người dùng quay lại"; gọi `cb()` mỗi lần có pop. Trả về hàm huỷ đăng ký |

Kit tự phân biệt pop do chính `back()` của nó sinh ra với pop của người dùng. Nếu một thao tác history trước chưa xong
(đóng rồi mở lại rất nhanh), phiên mới chạy **không history** (✕/Esc vẫn đóng) để thứ tự history luôn đúng.

Phác thảo adapter cho site dùng Navigation API (như bộ điều hướng của dwp) — site tự điều chỉnh cho controller của mình:

```js
const navHistory = {
  push() {
    const r = navigation.navigate(location.href, {
      history: 'push',
      info: { dwp: true, intent: { owner: 'lightbox', payload: {} } }, // router dwp nhận ra push của lightbox
    });
    r.finished.catch(() => {});               // tránh unhandled rejection
    return r.committed;                       // reject → kit coi là "không push"
  },
  back() {
    const r = navigation.back();
    r.finished.catch(() => {});
    return r.committed;
  },
  onPop(cb) {
    const onNav = (e) => { if (e.navigationType === 'traverse') cb(); };
    navigation.addEventListener('navigate', onNav);
    return () => navigation.removeEventListener('navigate', onNav);
  },
};

TdLightbox.bind(document, { history: navHistory });
```

### Spec nút toolbar

| Trường | Kiểu | Mô tả |
|---|---|---|
| `id` | `string` | **Bắt buộc**, không rỗng. Trùng id trong cùng mảng `toolbar` → nút đầu thắng |
| `onClick` | `(ctx, button) => void` | **Bắt buộc**. `button` là chính nút vừa bấm (đổi trạng thái nút mà không phải dò DOM). Lỗi được `console.error` |
| `label` | `string` | Tên truy cập + `title` (mặc định = `id`) |
| `icon` | `string` | Tên icon trong registry (core hoặc `registerIcons()`) |
| `iconNode` | `SVGElement` | SVG tin cậy do bạn dựng (được clone), dùng khi `icon` không có / không tồn tại |
| `visible` | `(ctx) => boolean` | `false` hoặc throw → ẩn nút ở slide đó |

Spec thiếu `id`/`onClick` bị bỏ qua. Không có icon → nút hiện chữ `label` (`[data-text]`). Không nhận chuỗi SVG/HTML.
Nút được chèn **trước** nút đóng (nút đóng luôn cuối), mang `data-extra="{id}"`, và bị gỡ khi đóng lightbox hoặc khi
`open()` mới. Nút có `[data-on]` hoặc `[aria-pressed="true"]` được tô vàng — dùng cho nút bật/tắt.

### Hook isForeignLayerOpen (nhường bàn phím)

Trả `true` → lightbox **không** xử lý phím (mũi tên, `F`, `Escape`, `Tab`) vì một lớp khác đang ở trên.

Mặc định: `true` khi có một lớp bàn phím của kit nằm trên lightbox (modal, menu, hovercard, loading…) **hoặc** stack
`TdModal` không rỗng. Site có overlay riêng (không phải của kit) thì truyền hàm của mình. Lưu ý: hàm của bạn **thay
thế** mặc định (hàm mặc định không được export), nên hãy tự gộp các kiểm tra của kit:

```js
import { TdModalStackManager } from '@dazzxq/td-components/modal-stack';
import { TdMenu } from '@dazzxq/td-components/menu';

TdLightbox.bind(document, {
  isForeignLayerOpen: () =>
    TdModalStackManager.stack.length > 0
    || TdMenu.isOpen()
    || !!document.querySelector('.site-modal.is-open'),
});
```

## Tuỳ biến giao diện

Lightbox **luôn tối** (nền là ảnh, không theo theme sáng/tối của site) nên token của nó không có giá trị dark riêng. Từ
0.16.0 chúng khai báo trên `:root` (trước đó trên `.td-lightbox`, ghi đè ở `:root` không có tác dụng); riêng
`--td-lb-bar-h` là token dẫn xuất, tính trên `.td-lightbox` nên tự theo `--td-lb-btn` / `--td-lb-bar-pad`:

| Token | Mặc định | Tác dụng |
|---|---|---|
| `--td-lb-dur` | `0.24s` | Thời gian chuyển động chính |
| `--td-lb-dur-fast` | `0.15s` | Hover nút |
| `--td-lb-ease` | `var(--td-ease-out)` | Easing |
| `--td-lb-btn` | `40px` (cảm ứng: `--td-touch-min`) | Kích thước nút |
| `--td-lb-bar-pad` | `var(--td-glass-pad)` | Padding toolbar |
| `--td-lb-bar-h` | tính từ nút + padding | Chiều cao thanh (dùng để canh cụm trên trái) |
| `--td-lb-bar-top` / `--td-lb-bar-side` | `14px` (có safe-area) | Khoảng cách toolbar tới mép |
| `--td-lb-sheet-peek` | `2.25rem` | Phần lộ ra của bottom sheet khi đóng |
| `--td-lb-panel-w` | `22rem` | Độ rộng panel (desktop) |
| `--td-lb-backdrop` | `rgb(8 8 9 / 94%)` | Nền |
| `--td-lb-panel-bg` | `rgb(20 20 22 / 96%)` | Nền panel / sheet (đặc, không kính) |
| `--td-lb-fg` | `#fff` | Màu chữ/icon |
| `--td-lb-drag` | (JS ghi qua CSSOM) | Khoảng vuốt xuống hiện tại — không tự đặt |

```css
/* site.css (ngoài @layer → thắng td.tokens). Ghi trên .td-lightbox như trước 0.16.0 vẫn chạy. */
:root {
  --td-lb-panel-w: 26rem;
  --td-lb-backdrop: rgb(0 0 0 / 97%);
}
```

Toolbar và bộ đếm là kính trong (`td-glass-surface--clear`) có lớp tối cục bộ; panel là nền đặc. JS chỉ ghi
`transform` của ảnh (zoom) và `--td-lb-drag` qua CSSOM — hợp CSP strict.

Con trỏ trigger (0.15.0): `cursor: zoom-in` cho `[data-{p}-lightbox]` / `[data-{p}-lightbox-item]`, `cursor: pointer`
cho `[data-{p}-lightbox-type="video"]` (kể cả item trong group), ship sẵn cho hai prefix `td` và `dwp` (0.15.1 sửa
lỗi trigger video `td` vẫn hiện zoom-in). Prefix khác → site tự thêm CSS. Trong
overlay: ảnh `zoom-in` / `zoom-out` khi đang zoom (chuột), nền `zoom-out`.

## Cấu trúc DOM & class

```html
<div class="td-lightbox" role="dialog" aria-modal="true" tabindex="-1" aria-label="Trình xem ảnh"
     data-state="open" [data-panel] [data-zoomed] [data-dragging] [data-closing-down]>
  <div class="td-lightbox__backdrop"></div>
  <div class="td-lightbox__lead">
    <button class="td-lightbox__btn td-lightbox__back" hidden>…</button>        <!-- chỉ khi có panel -->
    <div class="td-lightbox__counter td-glass-surface td-glass-surface--clear">2 / 5</div>
  </div>
  <div class="td-lightbox__col">
    <div class="td-lightbox__stage">
      <div class="td-lightbox__spinner" hidden></div>                          <!-- hiện nếu ảnh tải > 1 s -->
      <img class="td-lightbox__img" alt="" draggable="false" [data-loading] [data-zoom-anim]>
      <div class="td-lightbox__video" hidden><video class="td-lightbox__video-el">…</video></div>
    </div>
  </div>
  <div class="td-lightbox__caption" hidden>…</div>
  <aside class="td-lightbox__panel" hidden [data-sheet="open"]>
    <button class="td-lightbox__grab" aria-expanded="false"><span class="td-lightbox__grab-bar"></span></button>
    <div class="td-lightbox__panel-body">…</div>
  </aside>
  <div class="td-lightbox__toolbar td-glass-surface td-glass-surface--clear">
    <button class="td-lightbox__btn" data-action="prev">…</button>
    <button class="td-lightbox__btn" data-action="next">…</button>
    <button class="td-lightbox__btn" data-action="fullscreen">…</button>
    <a class="td-lightbox__btn" data-action="download" href="…" download="…">…</a>
    <button class="td-lightbox__btn" data-action="downloads" aria-haspopup="menu" aria-expanded="false" hidden>…</button>
    <!-- ≥ 2 biến thể từ hook downloads: nút này hiện (link tải ẩn), mở TdMenu -->

    <button class="td-lightbox__btn" data-extra="cover">…</button>              <!-- nút toolbar riêng -->
    <button class="td-lightbox__btn td-lightbox__close" data-action="close">…</button>
  </div>
</div>
```

Trạng thái luôn là attribute do JS đặt, không phải class: `data-state="open"`, `data-panel`, `data-zoomed`,
`data-dragging`, `data-closing-down` trên overlay; `data-sheet="open"` trên panel; `data-loading` trên ảnh; `hidden`
cho ẩn/hiện. Prev/next/bộ đếm ẩn khi gallery chỉ có 1 item; nút fullscreen ẩn khi trình duyệt không hỗ trợ.

## Bàn phím & trợ năng

| Phím | Hành vi |
|---|---|
| `Escape` | Đóng (trừ khi focus đang trong player video) |
| `←` / `→` | Slide trước / sau (bỏ qua khi có phím bổ trợ hoặc focus trong player) |
| `F` | Bật/tắt fullscreen (khi được hỗ trợ) |
| `Tab` / `Shift+Tab` | **Luôn bị giữ trong lightbox** (cộng các toast đang hiện) |

- Overlay là `role="dialog"` `aria-modal="true"`; mọi thứ phía sau thành `inert`, scroll trang bị khoá (bộ khoá dùng
  chung, đếm tham chiếu với modal). Kit chỉ khôi phục đúng phần `inert` nó đã đặt.
- Focus: lưu phần tử đang focus khi mở, chuyển focus vào overlay, trả về khi đóng (không cướp focus nếu một lớp khác
  như modal đang giữ nó).
- Đóng lightbox cũng thoát fullscreen.
- `prefers-reduced-motion`: tắt mọi transition; vuốt xuống vẫn đóng, chỉ không trượt. `prefers-contrast: more`: dải
  caption gần đặc. `forced-colors`: panel dùng `Canvas`, viền `CanvasText`.

### Cử chỉ (Pointer Events)

| Cử chỉ | Kết quả |
|---|---|
| Pinch hai ngón | Zoom 1× – 4×; thả dưới ~1.05× → về 1× |
| Double-tap / click chuột lên ảnh | Zoom 2× tại điểm bấm, lần nữa để về 1× |
| Kéo (touch/pen) khi đang zoom | Pan (kẹp trong khung) |
| Rê chuột khi đang zoom | Pan theo vị trí chuột |
| Vuốt ngang > 50px | Slide trước / sau |
| Vuốt xuống > 90px | Đóng (ảnh trượt theo tay trong lúc kéo) |
| Vuốt lên > 60px (có panel, sheet đang đóng) | Mở bottom sheet |

Chuột không vuốt (chỉ touch/pen). Cử chỉ tắt trên slide video. Swipe của bottom sheet dùng Touch Events (panel cuộn
được sẽ làm Pointer Events bị `pointercancel`).

## Bảo mật

Những giả định tin cậy mà site phải biết:

- **`caption`, `alt`, nhãn**: luôn là text. Truyền dữ liệu người dùng thẳng vào được.
- **`panel(ctx)` trả DOM tin cậy**: kit chèn nguyên Element bạn trả. Nếu dựng nó từ dữ liệu người dùng, dùng
  `textContent` (như ví dụ), không dùng `innerHTML` với chuỗi chưa lọc.
- **`toolbar[].iconNode` là SVG tin cậy** (được clone nguyên trạng) — chỉ SVG do code của bạn dựng.
- **`isAllowedUrl` có thể làm yếu chính sách**: hook của bạn thay hoàn toàn mặc định. Ghép với `defaultIsAllowedUrl`
  khi chỉ muốn thu hẹp.
- **`filter` không phải cơ chế phân quyền**: nó chỉ quyết định click nào mở lightbox trên trình duyệt. Ảnh riêng tư
  phải được bảo vệ ở server.
- **Media cross-origin HTTPS được phép mặc định** → rò IP/Referer tới host ngoài; dùng allowlist origin khi nội dung
  do người dùng nhập.
- Link tải (cả từng biến thể của `downloads` và mục trong menu tải) cũng qua `isAllowedUrl`; tên file `filename` được
  lọc ký tự đường dẫn / điều khiển; `attrPrefix` được whitelist trước khi vào selector.

Xem [Hướng dẫn bảo mật](../guides/security.md).

## Lưu ý & lỗi thường gặp

- **`open()` trả `null`**: mọi `src` bị `isAllowedUrl` từ chối — hay gặp nhất là ảnh `http://` trên trang `https://`,
  hoặc `blob:` / `data:` chưa được cho phép.
- **Không thấy nút tải**: ảnh khác origin (mặc định chỉ ảnh cùng origin). Dùng hook `download` trỏ tới proxy.
- **`TdLightbox.isOpen()` báo lỗi "not a function"**: `isOpen` là getter — viết `TdLightbox.isOpen`.
- **Gallery mở sai ảnh**: index tính theo **item hợp lệ**; kiểm tra item nào bị loại do URL.
- **Click vào item không có group không mở**: dùng `[data-td-lightbox]` cho ảnh đơn.
- **Phím mũi tên chuyển ảnh khi overlay riêng của site đang mở**: truyền `isForeignLayerOpen`.
- **`td-lightbox-change` phát hai lần lúc mở?** Không — nó phát một lần cho slide đầu, **trước** `td-lightbox-open`.
- Dưới CSP strict, markup gallery của site không được dùng `style="…"` (bị chặn) — bố cục thumbnail bằng class.

## Chuyển từ dwp lightbox

td không có global hay hàm module-level: mọi thứ nằm trên **handle của phiên** hoặc **tuỳ chọn** truyền vào
`bind()`/`open()`, nên hai trang/hai module không dùng chung trạng thái ngầm. Phần riêng của dwp (gateway, proxy, Plyr,
Navigation API) ở lại dwp dưới dạng hook.

| dwp (`engine/dwp-core/assets/ui/lightbox.js`) | td-components |
|---|---|
| Tự bind `document` khi import; `window.DWP.lightbox` | Không tự chạy, không global: site gọi `TdLightbox.bind(document, { attrPrefix: 'dwp', … })` một lần |
| Markup `data-dwp-lightbox`, `-group`, `-item`, `-src`, `-type`, `-poster`, `-caption`, `-provider` | Giữ nguyên markup, `bind(root, { attrPrefix: 'dwp' })`. Con trỏ zoom-in/pointer đã có sẵn cho prefix `dwp` |
| `setViewerMode('panel' \| 'lightbox')` + `setSidePanel(render)` (global) | Tuỳ chọn `panel: (ctx) => Element \| null` khi mở (bố cục hai cột / sheet **tự bật** khi renderer trả Element); lúc đang mở: `handle.setPanel(render \| false)`, `handle.refreshPanel()`. Mode "dính" toàn trang = truyền `panel` qua `bind()` |
| `addToolbarButton({ id, svg, label, onClick, visible })` (global) | `toolbar: [spec]` khi mở, hoặc `handle.addToolbarButton(spec)` (trả `remove()`), `handle.removeToolbarButton(id)`. **Không nhận chuỗi `svg`**: dùng `icon` (tên registry; đăng ký icon riêng bằng `registerIcons()`) hoặc `iconNode` (SVGElement) |
| Ctx `{ index, count, groupEl, itemEl, item }` | Giống, cộng `token`, `handle` |
| `openItem(itemEl)` / `openVideoItem(itemEl)` (mở tại đúng item, có lọc gateway) | Site tự gom item và gọi `TdLightbox.open(items, { index, groupEl })`; đặt `data: el` cho từng item để có `itemEl`. Bộ lọc gateway → `isAllowedUrl` |
| History qua Navigation API (`navigation.navigate(…, { history: 'push' })`, `navigation.back()`) hoặc `pushState` | `history: true` (pushState/popstate) hoặc adapter `{ push, back, onPop }` — xem [phác thảo Navigation API](#hook-history) |
| Tải ảnh gốc qua proxy `window.DWP.mediaDownloadUrl` + `stripResize` | Hook `download(item, ctx) => url` (tự ghép URL proxy, bỏ tham số resize) |
| Gateway / `window.DWP.gatewayHosts` / `trustedMediaOrigin` | Hook `isAllowedUrl(url, item)` |
| Plyr qua `@dwp/plyr-kit`, gate 3 lớp (type video + `data-dwp-lightbox-video` trên group + nằm trong `[data-dwp-post-card]`) | Hook `video(item, mount, { signal })`; gate đặt trong hook: khi mở bằng `bind()`, `item.data` là phần tử item nên kiểm được `item.data.closest('[data-dwp-post-card]')` — gate không thoả thì trả `null` (rơi về poster) |
| `ownedByVideoModule(itemEl, group)` (nhường click cho `@dwp/video`) | `filter: (el) => !ownedByVideoModule(el, el.closest('[data-dwp-lightbox-group]'))` |
| Né `.dwp-menu` / `.dwp-modal` khi xử lý phím | `isForeignLayerOpen: () => …` |
| Icon chuỗi SVG qua `innerHTML` | Icon từ registry dựng bằng DOM API |

Khác biệt td giữ lại (tốt hơn bản gốc): dải caption dưới ảnh ẩn khi có panel, `Escape` trong player không đóng viewer,
`alt` tách khỏi caption, nút fullscreen ẩn khi không hỗ trợ, index gallery theo phần tử (không theo `src`), chỉ khôi
phục đúng `inert` mà nó đặt.

Ví dụ khởi tạo cho dwp (phác thảo — các hàm `isGatewayUrl`, `stripResize`, `ownedByVideoModule`, `mountPlyr` là code của
dwp):

```js
import { TdLightbox, defaultIsAllowedUrl } from '@dazzxq/td-components/lightbox';

TdLightbox.bind(document, {
  attrPrefix: 'dwp',
  history: navHistory,                                          // adapter Navigation API ở trên
  filter: (el) => !ownedByVideoModule(el, el.closest('[data-dwp-lightbox-group]')),
  isAllowedUrl: (url) => defaultIsAllowedUrl(url) && isGatewayUrl(url),
  download: (item) => {
    const base = window.DWP && window.DWP.mediaDownloadUrl;
    if (!base || item.type !== 'image') return null;
    return `${base}${base.includes('?') ? '&' : '?'}src=${encodeURIComponent(stripResize(item.src))}`;
  },
  video: (item, mount, { signal }) => {
    const el = item.data instanceof Element ? item.data : null;
    const group = el && el.closest('[data-dwp-lightbox-group]');
    const gateOk = group && group.hasAttribute('data-dwp-lightbox-video') && group.closest('[data-dwp-post-card]');
    return gateOk ? mountPlyr(item, mount, signal) : null;       // null → poster
  },
});
```

## Xem thêm

- [Hook & tuỳ chọn theo component](../customization/hooks.md) · [Mở rộng: đăng ký icon](../customization/extending.md)
- [Icons](icons.md) · [Menu](menu.md) · [Modal](modal.md) · [Toast](toast.md)
- [Bảo mật](../guides/security.md) · [CSP](../guides/csp.md) · [Trợ năng](../guides/accessibility.md)
- [Tích hợp WordPress / PHP](../guides/wordpress-php.md) (render markup gallery server-side)
- Nội bộ: [ADR 0009](../internal/decisions/0009-td-lightbox-hooks.md),
  [plan v0.15.0](../internal/plans/v0.15.0-lightbox-parity.md)
