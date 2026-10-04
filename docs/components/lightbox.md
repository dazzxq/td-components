[Tài liệu](../README.md) › [Components](README.md) › Lightbox

# Lightbox — `TdLightbox`

`TdLightbox` là trình xem ảnh/video toàn màn hình: gallery có vùng bấm trước/sau hai bên (chuột) hoặc nút trên toolbar
(cảm ứng), bộ đếm, chú thích, zoom (pinch, double-tap, click), vuốt để chuyển/đóng, fullscreen, nút tải xuống, panel
thông tin (hai cột trên desktop, bottom sheet trên mobile), dải ảnh nhỏ (filmstrip, tuỳ chọn), tải sẵn ảnh kề, màn báo
lỗi ảnh và các hook để mỗi site tự cắm video player, lịch sử trình duyệt, nút toolbar riêng. Dùng cho ảnh trong bài viết,
album, thư viện media. **Không** dùng để hiện form hay hộp thoại xác nhận (dùng [`TdModal`](modal.md)).

| | |
|---|---|
| Import | `import { TdLightbox } from '@dazzxq/td-components/lightbox'` |
| Loại | API JS tĩnh (static class), không có tag |
| Form-associated | không |
| Từ phiên bản | 0.6.0 (handle `setPanel` / `addToolbarButton`, `itemEl` / `groupEl`, `attrPrefix` / `filter`: 0.15.0; vùng bấm hai bên, `filmstrip`, `thumb`, tải sẵn, màn lỗi, hiệu ứng trượt: 0.24.0) |
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
  thumb?: string,             // 0.24.0: ảnh nhỏ cho filmstrip; phải qua isAllowedUrl (không có → src / poster)
  caption?: string,           // chú thích (text)
  alt?: string,               // alt của <img> (text)
  provider?: string,          // mặc định 'html5'; tên tuỳ ý cho video hook ('youtube', 'vimeo'…)
  data?: any,                 // dữ liệu của bạn, trả lại trong ctx.item.data; nếu là Element → ctx.itemEl
}
```

- Một chuỗi được hiểu là `{ src: chuỗi }`.
- Item có `src` không qua `isAllowedUrl` bị **loại** khỏi gallery; `poster` / `thumb` không hợp lệ thì chỉ bị bỏ
  trường đó (thumbnail rơi về `src` với ảnh, `poster` với video).
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

Markup trigger chuẩn cho server render là các ví dụ ở trên (bảng attribute đầy đủ:
[WordPress & PHP › Lightbox](../guides/wordpress-php.md#lightbox-tdlightboxbindroot--attrprefix--mặc-định-prefix-td)). Lightbox không
có helper PHP; fixture `test/contracts/lightbox.html` trong repo kit chỉ dùng cho test (không nằm trong gói npm).

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
- Bố cục: màn hình **≥ 1024px** → hai cột (ảnh | panel rộng `--td-lb-panel-w`), zoom bị cắt theo cột ảnh; **< 1024px** →
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
chuyển slide, không đóng). Trên máy có chuột, nút trước / sau là hai đĩa nhỏ hai bên player, hoặc về toolbar khi cột
quá hẹp (xem [Điều hướng](#8-điều-hướng-chuột-cảm-ứng-bàn-phím-0240)).

### 8. Điều hướng: chuột, cảm ứng, bàn phím (0.24.0)

Trước 0.24.0 nút trước / sau chỉ nằm trên toolbar góc phải. Từ 0.24.0, **trên máy có chuột** (`(hover: hover) and
(pointer: fine)`) **chính hai nút đó** được chuyển ra hai bên cột ảnh (kiểu Facebook / Google Photos), không tạo nút
trùng — vẫn một điểm Tab cho mỗi hành động, nhãn giữ "Ảnh trước" / "Ảnh sau":

- Mỗi bên là một **dải bấm** rộng `clamp(64px, 15%, 240px)` của cột ảnh, cao từ dưới toolbar tới cách đáy 56px (chừa
  chú thích). Bấm chỗ nào trong dải cũng chuyển ảnh (quay vòng); giữa dải có **đĩa tối 48px** với mũi tên trắng, luôn
  hiện khi gallery > 1 ảnh. Con trỏ trong dải là `pointer`; giữa ảnh vẫn `zoom-in` / `zoom-out`.
- Bấm **giữa ảnh** vẫn phóng to 2× tại điểm bấm (bấm lại để thu); bấm ngoài ảnh và ngoài dải vẫn đóng. Nhấn chuột trong
  dải rồi kéo quá 8px → không chuyển.
- **Đang phóng to:** dải thu lại chỉ còn đĩa 48px ở giữa mép (phần còn lại của ảnh vẫn rê để xem / bấm để thu); bấm
  đĩa → chuyển ảnh và bỏ zoom.
- **Video:** không có dải lớn; chỉ hai đĩa 48px giữa mép, không đè player. Cột quá hẹp (khoảng trống mỗi bên < 64px) →
  hai nút về lại toolbar cho slide đó. Kit tự tính lại khi player dựng xong (kể cả hook bất đồng bộ) hoặc đổi kích thước.
- **Cảm ứng / bút:** dải **không bao giờ** kích hoạt bằng chạm (tránh bấm nhầm khi vuốt) — vuốt ngang để chuyển, vuốt
  xuống để đóng, kể cả khi bắt đầu vuốt trong dải. Thiết bị cảm ứng (không chuột): từ 0.36.0 hai nút là **đĩa 48px**
  hai bên ảnh (chạm là chuyển) từ 480px, và nằm trên **thanh đáy** dưới 480px — không còn trên toolbar.
- **Bàn phím:** `←` / `→` như cũ; Tab tới đúng một nút trước và một nút sau; focus ring vẽ quanh đĩa.
- **RTL** (`dir="rtl"`): "trước" ở mép phải (inline-start), mũi tên lật; `←` = ảnh sau.
- Bộ đếm là vùng `role="status" aria-live="polite"` → trình đọc màn hình đọc "2 / 5" khi chuyển, focus không đổi.

Overlay mang `data-nav="side" | "side-compact" | "toolbar"` (chế độ hiện tại) để site đọc khi cần.

**Điều hướng trên điện thoại (0.36.0, sửa 2026-10-05):** dưới 480px nút trước / sau **và** bộ đếm chuyển xuống một
**thanh đáy** cố định "‹ 3 / 12 ›" (cùng nút, cùng vùng thông báo — không bản sao), nút ≥ 44px, nằm trên vùng an toàn
đáy và **phía trên** filmstrip / tay nắm panel; chạm là chuyển ảnh, không bao giờ ẩn hay tự ẩn. Một ảnh → không có thanh.
Màn cảm ứng từ 480px và màn nằm ngang thấp (≤ 500px): hai đĩa 48px hai bên ảnh. Vuốt ngang vẫn chuyển ảnh (RTL: vuốt
sang phải = ảnh sau); cử chỉ bắt đầu sát mép trái / phải (24px) để trình duyệt xử lý (vuốt lùi trang). Panel dạng sheet chỉ
kéo lên / xuống từ **tay nắm**; vuốt trong nội dung panel chỉ cuộn.

**Màn hẹp < 480px (0.36.0):** toolbar 6–7 nút (≈ 300px) từng đè lên cụm Quay lại + bộ đếm ở góc trái. Dưới 480px
(`@media (max-width: 479.98px)`, chuột lẫn cảm ứng) toolbar chỉ giữ **tải xuống**, **một** nút riêng có `pinned: true`
(ví dụ bật/tắt panel), nút **"Thêm"** và **đóng**:

- Nút trước / sau rời toolbar xuống thanh đáy (xem trên) — không bao giờ nằm trong "Thêm".
- Fullscreen và các nút riêng còn lại vào menu **"Thêm"** (`TdMenu`, APG menu button: `Enter` / `Space` / `↓` mở,
  focus vào mục đầu, chọn mục = bấm chính nút đó → `onClick(ctx, button)` nhận nút gốc như trên desktop). "Thêm" chỉ
  hiện khi có ít nhất một mục; nhãn `labels.more`.
- Chỉ CSS quyết định theo bề rộng (đổi cỡ khi đang mở cũng đúng); ≥ 480px toolbar như cũ, không có "Thêm".
- Nút riêng tự mở popup neo vào `button` (ví dụ `TdMenu.open(button, …)`) nên đặt `pinned: true` — trong menu "Thêm"
  nút gốc đang ẩn nên popup không neo được.

### 9. Filmstrip — dải ảnh nhỏ (0.24.0, tuỳ chọn)

```js
TdLightbox.open(items, { filmstrip: true });     // luôn hiện (gallery ≥ 2 ảnh)
TdLightbox.open(items, { filmstrip: 'auto' });   // chỉ khi ≥ 8 ảnh
TdLightbox.bind(document, { filmstrip: 'auto' }); // bind() truyền tiếp như mọi option
```

- Mặc định `false` (bố cục cũ không đổi). Gallery 1 ảnh → không hiện.
- Khi bật, cột ảnh thành các hàng: ảnh (hàng trên, ảnh / video co trong hàng này) → chú thích (hàng riêng, tối đa 3 dòng,
  không đè ảnh) → dải thumbnail. Chế độ panel: dải chỉ nằm trong cột ảnh.
- Mỗi thumbnail là `<button aria-label="Ảnh {n}">` chứa `<img alt="" loading="lazy">` từ `item.thumb` → `src` (ảnh) /
  `poster` (video, kèm dấu play). Video không có `thumb` / `poster` hợp lệ → ô tối có dấu play (không `<img>`). Thumbnail
  đang xem có `aria-current="true"` (viền trắng), tự cuộn vào giữa dải. Bấm thumbnail → chuyển tới ảnh đó.
- Dải cuộn ngang bằng vuốt (cảm ứng) / bánh xe-trackpad; thao tác trong dải không bao giờ chuyển ảnh hay đóng lightbox.
- Màn hình thấp (≤ 500px — điện thoại xoay ngang, 0.34.0): dải **ẩn và hàng của nó thu về 0** (ảnh nhận phần chiều cao
  đó); thanh công cụ gọn hơn (khoảng cách / padding / lề trên nhỏ lại), nút vẫn giữ `--td-lb-btn` (44px khi cảm ứng).

### 10. Tải sẵn, lỗi ảnh, hiệu ứng trượt (0.24.0)

- **Tải sẵn ảnh kề:** ảnh đang xem tải xong → kit tải ngầm ảnh trước và ảnh sau (chỉ ảnh, bỏ video; có quay vòng), cùng
  URL nên lần chuyển sau lấy từ cache. Mỗi ảnh kề được tải **tối đa một lần** trong phiên; huỷ khi đóng / thay gallery.
  Bỏ qua khi người dùng bật tiết kiệm dữ liệu (`navigator.connection.saveData`). Option `preload`:
  - `'same-origin'` (**mặc định**): chỉ tải sẵn ảnh **cùng origin** với trang — không gửi request tới host ngoài cho ảnh
    người dùng chưa xem (tránh rò IP / theo dõi qua ảnh do người khác nhập).
  - `'all'`: tải sẵn cả ảnh khác origin — dùng khi media nằm trên **CDN tin cậy** của site
    (`TdLightbox.bind(document, { preload: 'all' })`).
  - `false`: tắt hẳn.

  Request tải sẵn không gửi `Referer` (`referrerPolicy = 'no-referrer'`), không đặt `crossOrigin`.
- **Ảnh lỗi:** thay vì khung trống, hiện khối `role="alert"`: "Không tải được ảnh" + nút **Thử lại** (tải lại cùng URL)
  và **Ảnh sau** (khi gallery > 1 ảnh). Thử lại nhận focus nếu focus đang ở trong lightbox mà không ở nút nào khác.
  Nhãn: `labels.loadError`, `labels.retry`, `labels.next`.
- **Trượt khi chuyển:** ảnh mới trượt nhẹ 24px + hiện dần 160ms theo hướng đi (nút, phím, vuốt, thumbnail,
  `goTo()` — thumbnail / `goTo` đi đường ngắn nhất có quay vòng), chỉ bắt đầu khi ảnh mới đã sẵn sàng. Chuyển nhanh
  liên tục → chỉ ảnh cuối trượt. `prefers-reduced-motion` → không trượt.

### 11. Lắng nghe sự kiện

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
| `goTo(i)` | Tới vị trí `i` (làm tròn xuống, kẹp vào khoảng hợp lệ); hướng trượt = đường ngắn nhất có quay vòng |
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
| `isAllowedUrl` | `(url, item) => boolean` | `defaultIsAllowedUrl` | Chính sách URL cho `src`, `poster`, `thumb`, link tải |
| `download` | `(item, ctx) => string \| null` | ảnh cùng origin | URL của nút tải xuống |
| `downloads` | `(item, ctx) => Array<{ label, url, filename? }>` | — | Nhiều biến thể tải (0.17.0); có cả `download` → `downloads` thắng. Xem [Hook downloads](#hook-downloads-nhiều-biến-thể) |
| `video` | `(item, mount, { signal }) => player \| Promise<player> \| null` | `<video>` native | Cắm player |
| `history` | `false \| true \| adapter` | `false` | Nút Back của trình duyệt đóng lightbox |
| `panel` | `false \| true \| (ctx) => Element \| null` | `false` | Panel thông tin |
| `toolbar` | `Array<spec>` | `[]` | Nút toolbar riêng |
| `preload` | `false \| 'same-origin' \| 'all'` | `'same-origin'` | Tải sẵn ảnh kề (0.24.0); `'all'` khi media ở CDN tin cậy. Xem [mục 10](#10-tải-sẵn-lỗi-ảnh-hiệu-ứng-trượt-0240) |
| `filmstrip` | `false \| true \| 'auto'` | `false` | Dải thumbnail dưới ảnh (0.24.0); `'auto'` = khi ≥ 8 ảnh. Xem [Filmstrip](#9-filmstrip--dải-ảnh-nhỏ-0240-tuỳ-chọn) |
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
| `more` | `Thêm` | Nút menu tràn của toolbar khi < 480px (0.36.0) |
| `counter` | ``(i, n) => `${i} / ${n}` `` | Bộ đếm (hàm; `i` bắt đầu từ 1) |
| `loadError` | `Không tải được ảnh` | Chữ trong khối lỗi ảnh (0.24.0) |
| `retry` | `Thử lại` | Nút thử lại trong khối lỗi (0.24.0); nút "Ảnh sau" của khối lỗi dùng `next` |
| `thumb` | ``(n) => `Ảnh ${n}` `` | `aria-label` của thumbnail filmstrip (hàm; `n` bắt đầu từ 1; 0.24.0) |

Chỉ khoá có trong bảng được nhận; giá trị sai kiểu bị bỏ qua (giữ mặc định; `counter` / `thumb` phải là hàm). Nhãn
gán vào `aria-label` và `title` (nhãn của khối lỗi là chữ hiện trên nút), luôn bằng `textContent`.

```js
TdLightbox.open(items, { labels: { prev: 'Previous', next: 'Next', counter: (i, n) => `${i} of ${n}` } });
```

### Hook isAllowedUrl (chính sách URL)

`defaultIsAllowedUrl` (fail closed): `https:` luôn được; `http:` chỉ khi **trang** đang là `http:` (không hạ cấp từ
HTTPS); mọi scheme khác (`data:`, `blob:`, `file:`, `javascript:`…) bị từ chối. Hook throw → URL bị từ chối.

**URL chuẩn hoá (0.24.0):** trước khi gọi `isAllowedUrl`, kit resolve mỗi URL (`src`, `poster`, `thumb`, link tải) **một
lần** theo `document.baseURI` — giống hệt cách trình duyệt resolve, kể cả khi trang có `<base href>` — rồi đưa **URL tuyệt
đối** đó cho hook, và lưu / dùng đúng giá trị đó (`item.src`, `ctx.item`, detail của event, `href` link tải đều là URL
tuyệt đối). Nhờ vậy chính sách luôn thấy origin thật mà trình duyệt sẽ tải. `defaultIsAllowedUrl` cũng resolve theo
`document.baseURI`.

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
| `pinned` | `boolean` | 0.36.0: `true` → vẫn ở toolbar khi < 480px (nút `pinned` **đầu tiên đang hiện**; còn lại vào menu "Thêm"). Dành cho nút bật/tắt panel |

Spec thiếu `id`/`onClick` bị bỏ qua. Không có icon → nút hiện chữ `label` (`[data-text]`). Không nhận chuỗi SVG/HTML.
Nút được chèn **trước** nút "Thêm" + nút đóng (nút đóng luôn cuối), mang `data-extra="{id}"` (và `data-overflow` khi
dưới 480px nó vào menu "Thêm"), và bị gỡ khi đóng lightbox hoặc khi
`open()` mới. Nút có `[data-on]` hoặc `[aria-pressed="true"]` được tô vàng — dùng cho nút bật/tắt.

### Hook isForeignLayerOpen (nhường bàn phím)

Trả `true` → lightbox **không** xử lý phím (mũi tên, `F`, `Escape`, `Tab`) vì một lớp khác đang ở trên.

Mặc định: `true` khi có một lớp bàn phím của kit nằm **trên** lightbox (modal, menu, hovercard, loading…). Từ 0.21.1
modal nằm **dưới** (lightbox được mở từ trong modal) không còn chặn phím của lightbox. Site có overlay riêng (không
phải của kit) thì truyền hàm của mình. Lưu ý: hàm của bạn **thay thế** mặc định (hàm mặc định không được export), nên
hãy tự gộp các kiểm tra của kit (ví dụ dưới chặn khi có bất kỳ modal nào — đừng dùng nếu bạn mở lightbox từ modal):

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
| `--td-lb-panel-bg` | `var(--td-glass-clear-solid)` (`#141416`) | Nền panel / sheet (đặc) |
| `--td-lb-fg` | `#fff` | Màu chữ/icon |
| `--td-lb-drag` | (JS ghi qua CSSOM) | Khoảng vuốt xuống hiện tại — không tự đặt |
| `--td-lb-nav-w` | `clamp(64px, 15%, 240px)` | Độ rộng dải bấm hai bên (% của cột ảnh; 0.24.0) |
| `--td-lb-nav-bottom` | `56px` | Khoảng chừa dưới dải bấm (chú thích); có filmstrip: `8px` |
| `--td-lb-disc` | `48px` | Đường kính đĩa mũi tên |
| `--td-lb-disc-bg` / `--td-lb-disc-bg-hover` | `var(--td-glass-clear-bg)` (88 %) / `rgb(44 44 48 / 92%)` | Nền đĩa / khi rê chuột |
| `--td-lb-disc-border` | `rgb(255 255 255 / 40%)` | Viền đĩa (≥ 3:1 trên ảnh đen — contrast gate) |
| `--td-lb-thumb-size` | `56px` (cảm ứng: `44px`) | Cạnh thumbnail filmstrip |
| `--td-lb-thumb-gap` | `6px` | Khoảng cách thumbnail |
| `--td-lb-thumb-radius` | `6px` | Bo góc thumbnail |
| `--td-lb-thumb-ring` | `#fff` | Viền thumbnail đang xem |
| `--td-lb-filmstrip-pad` | `10px` | Padding dọc của dải |
| `--td-lb-filmstrip-h` | `thumb-size + 2 × pad` | Chiều cao hàng filmstrip (cộng safe-area đáy) |
| `--td-lb-filmstrip-bg` | `transparent` | Nền dải |
| `--td-lb-slide-dist` / `--td-lb-slide-dur` | `24px` / `160ms` | Hiệu ứng trượt khi chuyển ảnh |

```css
/* site.css (ngoài @layer → thắng td.tokens). Ghi trên .td-lightbox như trước 0.16.0 vẫn chạy. */
:root {
  --td-lb-panel-w: 26rem;
  --td-lb-backdrop: rgb(0 0 0 / 97%);
}
```

Toolbar và bộ đếm là thanh tối (`td-glass-surface--clear`, 0.20.0: nền `--td-glass-clear-bg` 88 % + `blur(12px)` +
viền mảnh + một bóng mềm; không còn lớp tối cục bộ hay bóng riêng cho icon); panel / sheet là nền đặc. JS chỉ ghi
`transform` của ảnh (zoom) và `--td-lb-drag` qua CSSOM — hợp CSP strict. Chế độ điều hướng, filmstrip, hiệu ứng trượt
(0.24.0) đều là attribute (`data-nav`, `data-filmstrip`, `data-slide`), CSS đọc chúng. Từ 0.24.0 overlay tự đặt
`line-height: 1.5` (trước đó kế thừa từ trang) và `.td-lightbox__col` phủ cả overlay (bấm vào nền của nó = bấm nền).

Con trỏ trigger (0.15.0): `cursor: zoom-in` cho `[data-{p}-lightbox]` / `[data-{p}-lightbox-item]`, `cursor: pointer`
cho `[data-{p}-lightbox-type="video"]` (kể cả item trong group), ship sẵn cho hai prefix `td` và `dwp` (0.15.1 sửa
lỗi trigger video `td` vẫn hiện zoom-in). Prefix khác → site tự thêm CSS. Trong
overlay: ảnh `zoom-in` / `zoom-out` khi đang zoom (chuột), nền `zoom-out`.

## Cấu trúc DOM & class

```html
<div class="td-lightbox" role="dialog" aria-modal="true" tabindex="-1" aria-label="Trình xem ảnh"
     data-state="open" data-nav="side|side-compact|toolbar" [data-filmstrip]
     [data-panel] [data-zoomed] [data-dragging] [data-closing-down]>
  <div class="td-lightbox__backdrop"></div>
  <div class="td-lightbox__lead">
    <button class="td-lightbox__btn td-lightbox__back" hidden>…</button>        <!-- chỉ khi có panel -->
    <div class="td-lightbox__counter td-glass-surface td-glass-surface--clear"
         role="status" aria-live="polite" aria-atomic="true">2 / 5</div>
  </div>
  <div class="td-lightbox__col">
    <div class="td-lightbox__stage" [data-slide="next|prev"]>
      <div class="td-lightbox__spinner" hidden></div>                          <!-- hiện nếu ảnh tải > 1 s -->
      <img class="td-lightbox__img" alt="" draggable="false" [data-loading] [data-zoom-anim]>
      <div class="td-lightbox__video" hidden><video class="td-lightbox__video-el">…</video></div>
      <div class="td-lightbox__error" role="alert" hidden>                       <!-- 0.24.0: ảnh lỗi -->
        <svg class="td-lightbox__icon">…</svg>
        <p class="td-lightbox__error-text">Không tải được ảnh</p>
        <div class="td-lightbox__error-actions">
          <button class="td-lightbox__error-btn" data-action="retry">Thử lại</button>
          <button class="td-lightbox__error-btn" data-action="error-next">Ảnh sau</button>
        </div>
      </div>
    </div>
    <div class="td-lightbox__nav">                                              <!-- 0.24.0: dải bấm hai bên -->
      <button class="td-lightbox__btn" data-action="prev">…</button>           <!-- chuột: ở đây; cảm ứng: trong toolbar -->
      <button class="td-lightbox__btn" data-action="next">…</button>
    </div>
    <!-- có filmstrip: .td-lightbox__caption chuyển vào đây (hàng riêng) -->
    <div class="td-lightbox__filmstrip" hidden>                                 <!-- 0.24.0, filmstrip: true | 'auto' -->
      <button class="td-lightbox__thumb" data-index="0" aria-label="Ảnh 1" aria-current="true">
        <img alt="" loading="lazy" decoding="async">
      </button>
      <button class="td-lightbox__thumb" data-index="1" aria-label="Ảnh 2" data-video>
        <span class="td-lightbox__thumb-ph"><span class="td-lightbox__thumb-play" aria-hidden="true"></span></span>
      </button>
    </div>
  </div>
  <div class="td-lightbox__caption" hidden>…</div>
  <aside class="td-lightbox__panel" hidden [data-sheet="open"]>
    <button class="td-lightbox__grab" aria-expanded="false"><span class="td-lightbox__grab-bar"></span></button>
    <div class="td-lightbox__panel-body">…</div>
  </aside>
  <div class="td-lightbox__toolbar td-glass-surface td-glass-surface--clear">
    <!-- data-nav="toolbar" (cảm ứng / video cột hẹp): prev + next nằm ở đây, trước fullscreen -->
    <button class="td-lightbox__btn" data-action="fullscreen" data-overflow>…</button>  <!-- < 480: trong menu "Thêm" -->
    <a class="td-lightbox__btn" data-action="download" href="…" download="…">…</a>
    <button class="td-lightbox__btn" data-action="downloads" aria-haspopup="menu" aria-expanded="false" hidden>…</button>
    <!-- ≥ 2 biến thể từ hook downloads: nút này hiện (link tải ẩn), mở TdMenu -->

    <button class="td-lightbox__btn" data-extra="cover" [data-overflow]>…</button> <!-- nút toolbar riêng -->
    <button class="td-lightbox__btn td-lightbox__more" data-action="more" aria-haspopup="menu" aria-expanded="false"
            [hidden]>…</button>                                       <!-- 0.36.0: chỉ hiện < 480px, mở TdMenu -->
    <button class="td-lightbox__btn td-lightbox__close" data-action="close">…</button>
  </div>
</div>
```

Trạng thái luôn là attribute do JS đặt, không phải class: `data-state="open"`, `data-panel`, `data-zoomed`,
`data-dragging`, `data-closing-down`, `data-nav`, `data-filmstrip` trên overlay; `data-sheet="open"` trên panel;
`data-loading` trên ảnh; `data-slide` trên stage; `aria-current` trên thumbnail; `hidden` cho ẩn/hiện. Prev/next/bộ đếm
ẩn khi gallery chỉ có 1 item; nút fullscreen ẩn khi trình duyệt không hỗ trợ. **0.24.0:** prev / next là cùng hai phần
tử, được JS **di chuyển** giữa `.td-lightbox__nav` và toolbar — CSS / test của site bám vào vị trí của chúng trong
toolbar cần xem lại (trên máy chuột chúng không còn ở toolbar).

## Bàn phím & trợ năng

| Phím | Hành vi |
|---|---|
| `Escape` | Đóng (trừ khi focus đang trong player video) |
| `←` / `→` | Slide trước / sau (bỏ qua khi có phím bổ trợ hoặc focus trong player); RTL: `←` = sau |
| `F` | Bật/tắt fullscreen (khi được hỗ trợ) |
| `Tab` / `Shift+Tab` | **Luôn bị giữ trong lightbox** (cộng các toast đang hiện) |

- Overlay là `role="dialog"` `aria-modal="true"`; mọi thứ phía sau thành `inert`, scroll trang bị khoá (bộ khoá dùng
  chung, đếm tham chiếu với modal). Kit chỉ khôi phục đúng phần `inert` nó đã đặt.
- Focus: lưu phần tử đang focus khi mở, chuyển focus vào overlay, trả về khi đóng (không cướp focus nếu một lớp khác
  như modal đang giữ nó).
- Đóng lightbox cũng thoát fullscreen.
- Bộ đếm là live region lịch sự (đọc "2 / 5" khi chuyển). Khối lỗi ảnh là `role="alert"`; thumbnail là nút thường có
  `aria-label`, ảnh bên trong `alt=""`.
- `prefers-reduced-motion`: tắt mọi transition (kể cả trượt khi chuyển ảnh); vuốt xuống vẫn đóng, chỉ không trượt.
  `prefers-contrast: more`: dải caption gần đặc. `forced-colors`: panel dùng `Canvas`, viền `CanvasText`; đĩa mũi tên
  `ButtonFace` / viền `ButtonText`; thumbnail đang xem viền `Highlight`.

### Cử chỉ (Pointer Events)

| Cử chỉ | Kết quả |
|---|---|
| Pinch hai ngón | Zoom 1× – 4×; thả dưới ~1.05× → về 1× |
| Double-tap / click chuột lên ảnh | Zoom 2× tại điểm bấm, lần nữa để về 1× |
| Click chuột trong dải hai bên (0.24.0) | Ảnh trước / sau (không zoom); kéo > 8px rồi thả → không chuyển |
| Chạm / bút trong dải hai bên | Không kích hoạt dải — đi vào vuốt / pinch / double-tap như trên ảnh |
| Kéo (touch/pen) khi đang zoom | Pan (kẹp trong khung) |
| Rê chuột khi đang zoom | Pan theo vị trí chuột |
| Vuốt ngang > 50px | Slide trước / sau |
| Vuốt xuống > 90px | Đóng (ảnh trượt theo tay trong lúc kéo) |
| Vuốt lên > 60px (có panel, sheet đang đóng) | Mở bottom sheet |

Chuột không vuốt (chỉ touch/pen). Cử chỉ tắt trên slide video. Swipe của bottom sheet dùng Touch Events (panel cuộn
được sẽ làm Pointer Events bị `pointercancel`). 0.24.0: cử chỉ gắn trên cả `.td-lightbox__col` (stage + dải hai bên),
nên vuốt bắt đầu ở nền ngoài ảnh cũng chuyển / đóng; thao tác trong filmstrip và khối lỗi không thuộc cử chỉ.

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

- **Mở từ trong modal (0.21.1):** lightbox nằm trên modal (trước đây nằm dưới và bị inert), phím mũi tên / Escape
  / Tab chạy bình thường; đóng → focus về nút đã mở nó trong modal. Modal mở từ lightbox nằm trên lightbox.
  `isForeignLayerOpen` mặc định chỉ coi là "lớp lạ" các lớp nằm **trên** lightbox (không còn chặn chỉ vì có modal
  đang mở bên dưới).
- **Popup trong lightbox (0.21.1):** dropdown / menu mở từ panel hay toolbar đóng ngay khi lightbox đóng.
- **`open()` trả `null`**: mọi `src` bị `isAllowedUrl` từ chối — hay gặp nhất là ảnh `http://` trên trang `https://`,
  hoặc `blob:` / `data:` chưa được cho phép.
- **Không thấy nút tải**: ảnh khác origin (mặc định chỉ ảnh cùng origin). Dùng hook `download` trỏ tới proxy.
- **`TdLightbox.isOpen()` báo lỗi "not a function"**: `isOpen` là getter — viết `TdLightbox.isOpen`.
- **Gallery mở sai ảnh**: index tính theo **item hợp lệ**; kiểm tra item nào bị loại do URL.
- **Click vào item không có group không mở**: dùng `[data-td-lightbox]` cho ảnh đơn.
- **Phím mũi tên chuyển ảnh khi overlay riêng của site đang mở**: truyền `isForeignLayerOpen`.
- **`td-lightbox-change` phát hai lần lúc mở?** Không — nó phát một lần cho slide đầu, **trước** `td-lightbox-open`.
- Dưới CSP strict, markup gallery của site không được dùng `style="…"` (bị chặn) — bố cục thumbnail bằng class.
- **Nút trước / sau "biến mất" khỏi toolbar (0.24.0):** đúng thiết kế trên máy có chuột — chúng nằm ở hai bên ảnh. Trên
  cảm ứng chúng vẫn ở toolbar. Code cần biết vị trí hiện tại đọc `data-nav` trên overlay.
- **Thumbnail filmstrip là ảnh gốc to:** truyền `thumb` (bản nhỏ) cho mỗi item; nó qua cùng `isAllowedUrl` như `src`.

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
