[Tài liệu](../README.md) › [Components](README.md) › Thumb loader

# Thumb loader — tải ảnh nhỏ có nhịp, không icon vỡ

Bộ tải thumbnail dùng chung cả trang. Mỗi lưới ảnh (media picker, trang album, danh sách sản phẩm) có một **loader**
riêng. Mọi loader của trang cùng đi qua một **broker** cho mỗi host ảnh. Ảnh chỉ tải khi lại gần viewport. Ảnh lỗi thì
thử lại, khi bị chặn thì lùi, và **không bao giờ hiện icon ảnh vỡ**.

**Vì sao cần:** CDN của các site có luật WAF giới hạn số request theo IP, **đếm cả cache HIT** (dwp 750/10s, dsuite và
dcms2 2000/10s). Một lưới 60 ảnh, cuộn nhanh, mở picker trong lúc trang album đang tải là vượt luật, CDN chặn 10s, ảnh
vỡ hàng loạt. Thuộc tính `loading="lazy"` không giúp được, vì trình duyệt không biết luật của CDN.

| | |
|---|---|
| Import | `import { createThumbLoader, configureThumbBudget, getThumbBudget } from '@dazzxq/td-components/thumb-loader'` (cũng có trong barrel) |
| Loại | API JS (không phải element) |
| CSS | Kit chỉ tô ô của media picker. Site tự viết CSS cho lưới của mình (xem [CSS](#css)) |
| Từ phiên bản | 0.111.0 |

[Media picker](media-picker.md#thumbnail-tải-có-nhịp--thumbloader-01110) dùng sẵn loader này, site không cần làm gì.
Trang này dành cho site muốn dùng loader cho lưới ảnh **của mình**.

## Ví dụ nhanh

```html
<ul class="album">
  <li data-td-thumb-cell data-id="p_123">
    <img data-td-src="https://cdn.example.com/p_123/320.webp" alt="" decoding="async" referrerpolicy="no-referrer">
  </li>
  …
</ul>
```

```js
import { createThumbLoader, configureThumbBudget } from '@dazzxq/td-components/thumb-loader';

configureThumbBudget({ wafBudget: { limit: 750, windowSeconds: 10 } }); // luật WAF của site, gọi một lần
const loader = createThumbLoader();
loader.scan(document.querySelector('.album'));
```

## Markup

- `<img data-td-src="…">`: **không** có `src` và **không** có `loading="lazy"`. Chỉ loader mới đặt `src` thật.
- Có `srcset` / `sizes` thì in dưới dạng `data-td-srcset` / `data-td-sizes`. Loader chép sang thuộc tính thật lúc cho
  ảnh tải, nên trình duyệt vẫn tự chọn độ rộng. Nên giữ ít biến thể: mỗi biến thể là một URL, tức thêm lượt.
  Candidate thuộc host khác `src` (và không khai trong `hosts` của broker) thì cả `srcset` bị bỏ, chỉ dùng `src`.
  `srcset` dài quá 16 384 ký tự hoặc quá 16 candidate cũng bị bỏ như vậy.
- **Ô** (cell) là phần tử gần nhất có `data-td-thumb-cell`, không có thì là phần tử cha của ảnh. Ô mang trạng thái.
- **Id** của ô dùng để đếm lần thử: `data-id` của ô, rồi `data-id` của ảnh, rồi URL đã chuẩn hoá. Nên đặt `data-id`
  ổn định (id ảnh trong DB) để vẽ lại ô không làm mất sổ đếm.
- URL chỉ nhận `https:`, đường dẫn tương đối, hoặc `http:` khi trang là `http:`. URL khác coi như lỗi ngay, không tải.

## Trạng thái và CSS

Root được `scan` nhận class `td-thumbs-js`. Mỗi ô mang **nhiều nhất một** class trạng thái:

| Class trên ô | Nghĩa |
|---|---|
| (không có) | Đang chờ lại gần viewport, đang xếp hàng, hoặc đang tải |
| `is-thumb-waiting` | Lỗi, đang chờ thử lại (1,5s), hoặc đang chờ cổng mở lại |
| `is-thumb-loaded` | Tải xong (`complete && naturalWidth > 0`) |
| `is-thumb-failed` | Hỏng hẳn sau 3 lần tải. Ảnh không còn `src` |

### CSS

Kit không ship CSS cho lưới của site. Mẫu tối thiểu (giống media picker):

```css
.td-thumbs-js [data-td-thumb-cell] { position: relative; overflow: hidden; background: var(--td-color-surface-muted); }
.td-thumbs-js [data-td-thumb-cell] img[data-td-src] { transition: opacity 150ms ease-out; }
.td-thumbs-js [data-td-thumb-cell]:not(.is-thumb-loaded) img[data-td-src] { opacity: 0; }
@media (prefers-reduced-motion: reduce) {
  .td-thumbs-js [data-td-thumb-cell] img[data-td-src] { transition: none; }
}
```

Shimmer khi chờ và icon khung ảnh mờ khi hỏng: xem `src/styles/components/media-picker.css` (khối v0.111.0). Hai thứ đó
dùng token skeleton (`--td-skeleton-shine`, `--td-skeleton-dur`) và chỉ dùng `::before` / `::after`.

## API

### `createThumbLoader(opts?)`

| Option | Mặc định | Ghi chú |
|---|---|---|
| `scrollRoot` | viewport | Phần tử cuộn chứa lưới. Lưới nằm trong khung cuộn riêng thì **phải** truyền, không thì loader tính sai khoảng cách |
| `budget` | broker của host ảnh | Một broker (kết quả `configureThumbBudget({ budgetKey })`) hoặc một `budgetKey` |
| `onGate({ until, remainingMs })` | — | Gọi khi broker đóng cổng (CDN đang chặn). Dùng để báo người dùng |
| `cellSelector` | `[data-td-thumb-cell]` | |
| `cellOf(img)` / `idOf(img, cell, url)` | — | Ghi đè cách tìm ô / id |

Các option môi trường (`win`, `doc`, `IO`, `MO`, `now`, `timers`) chỉ dành cho test.

| Method | Làm gì |
|---|---|
| `scan(root, { userInitiated })` | Tìm mọi `img[data-td-src]` / `img[data-td-managed-img]` trong `root` và theo dõi chúng. Gọi lại sau mỗi lần thêm ảnh. `userInitiated: true` (nút "Thử lại", mở lại lưới) xoá sổ lỗi của các ô trong `root`, ô hỏng được thử lại từ đầu |
| `release(root)` | Huỷ theo dõi và huỷ lượt đang tải của ảnh trong `root` (nhận cả một `img`). **Gọi trước khi gỡ hoặc thay** DOM, nếu không ảnh cũ vẫn giữ chỗ cho tới khi loader tự phát hiện |
| `observe(root)` | Tuỳ chọn. MutationObserver theo dõi `childList` của `root`: tự scan phần thêm, release phần gỡ. Dùng khi site dựng lại lưới bằng `innerHTML` và không muốn tự gọi |
| `swap(img, url, { priority })` | Đổi ảnh bằng JS (đổi màu sản phẩm): giữ ảnh cũ tới khi ảnh mới tải xong. `priority: 'user'` cho click / chọn dứt khoát, `'hover'` cho rê chuột (chờ 120ms mới tải), bỏ trống là thường. Ảnh chưa từng tải xong thì chỉ đổi URL của ô |
| `pause()` / `resume()` | Tạm dừng / chạy lại hàng đợi của loader này |
| `destroy()` | Gỡ hết. Broker của trang vẫn sống |
| `stats()` | `{ queued, inflight, loaded, failed, gateUntil, rootMargin, scrollDir, fast }`, để debug |

### `configureThumbBudget(opts)` và `getThumbBudget(key)`

Mỗi trang có một broker cho mỗi `budgetKey` (mặc định là host ảnh). Broker giữ xô token, trần đồng thời, hàng đợi ưu
tiên, cổng và sổ đếm lần thử. Tab cùng origin và trang kế trong cùng tab chia sổ qua `localStorage` / `sessionStorage`.

- Không có `budgetKey`: đặt cấu hình mặc định cho mọi broker của trang. Gọi một lần, trước khi tạo loader.
- Có `budgetKey`: tạo hoặc cấu hình lại broker đó, trả về broker.

| Option | Mặc định | Ghi chú |
|---|---|---|
| `wafBudget: { limit, windowSeconds }` | `{ limit: 500, windowSeconds: 10 }` | **Luật WAF của site.** Nhịp = `min(maxRate, 0.4 × limit / windowSeconds)`, burst = `min(6, round(nhịp × 0.3))` |
| `maxRate` | `30` | Trần nhịp (ảnh/giây) |
| `hosts` | `[]` | Các host khác dùng chung luật (cùng zone CDN), để `srcset` nhiều host vẫn dùng được |
| `sharedWindow` | `false` | `true` thì cộng sổ của các tab cùng origin và của trang trước trong cùng tab, rồi chờ khi tổng chạm 60% ngưỡng. Mặc định tắt: đo bằng harness thấy không lợi ở 750 và 2000, còn với 2 tab thì tải chậm hơn mà không bớt lần bị chặn. Cổng chặn vẫn luôn được chia sẻ giữa các tab |
| `rate` / `burst` / `concurrency` / `lookahead` | tính từ `wafBudget` | Override nâng cao, có kẹp. Đồng thời mặc định 6, look-ahead ≤ 4 |

Mạng chậm (Save-Data / 2g) tự hạ xuống 4 ảnh/giây, đồng thời 3.

**Cổng:** 3 id khác nhau lỗi trong 2s, hoặc ô đang thấy lỗi lần 2 kèm một id khác, thì broker coi là CDN đang chặn. Nó
đóng cổng 12s (+ jitter), rồi thử 1–2 ảnh "canary". Canary qua thì mở lại và tăng dần nhịp. Hai canary cùng lỗi thì lùi
24 / 48 / 60s. Sau mỗi lần cổng đóng, nhịp giảm một nửa (sàn 25%) rồi hồi dần.

## Công thức theo site

### Khai luật WAF

```js
configureThumbBudget({ wafBudget: { limit: 750 } });                            // dwp
configureThumbBudget({ wafBudget: { limit: 2000 }, maxRate: 12 }); // dsuite
configureThumbBudget({ wafBudget: { limit: 2000 } });                           // dcms2 (zmag)
```

Media picker nhận cùng object qua `thumbLoader` (xem [media picker](media-picker.md#thumbnail-tải-có-nhịp--thumbloader-01110)).

### Ảnh SSR có sẵn (dsuite, dcms2)

- **Ảnh LCP và vài thẻ trên màn đầu giữ `src` thật** (có thể kèm `fetchpriority="high"`), không đưa qua loader. Ẩn ảnh
  SSR trước khi JS chạy sẽ hại LCP.
- Ảnh khác in dưới dạng `data-td-src` (kèm `<noscript>` có giới hạn nếu cần cho SEO).
- Ảnh SSR đã có `src` mà muốn loader quản lý (phục hồi khi lỗi): thêm `data-td-managed-img`. Lúc `scan`, loader chép
  `src` / `srcset` / `sizes` sang `data-td-*`, rồi:
  - đã tải xong → tính là loaded;
  - đã lỗi trước khi JS chạy → gỡ `src` và thử lại;
  - đang tải trong vùng gần viewport → giữ, chiếm một chỗ đồng thời;
  - chưa tải và ở xa → gỡ `src`, broker lo.
- Một listener `error` (capture) trên root đã scan phục hồi ảnh managed lỗi ngoài lượt tải của loader.
- **Fallback ảnh cũ của site** (ví dụ dcms2 `imgFallback.js`) phải bỏ qua ảnh có `data-td-managed-img` hoặc
  `data-td-src`, không thì hai cơ chế giành nhau.

### Lưới dựng lại bằng `innerHTML`

Gọi `loader.release(root)` trước khi thay và `loader.scan(root)` sau khi thay. Hoặc gọi `loader.observe(root)` một lần.

### Đổi ảnh bằng JS (màu, hover)

`loader.swap(img, url, { priority: 'hover' })` khi rê chuột, `loader.swap(img, url, { priority: 'user' })` khi click. Không đặt `img.src` trực tiếp:
lượt đó không qua broker.
Ảnh thử của `swap` mang theo `referrerpolicy` và `crossorigin` của ảnh đích.

### td-media-field và td-media-gallery (0.112)

Hai component tự nối loader, site không phải làm gì. Markup và helper PHP giữ nguyên (`src` + `loading="lazy"`): JS
nhận quản lý ảnh có sẵn (`data-td-managed-img`, ô là nút mở của field / `__media` của gallery) sau bước kiểm SSR. Tháo
component ra hoặc gán `thumbLoader = false` thì loader dừng trước, rồi ảnh trở lại đúng markup gốc. Cấu hình broker
riêng: `el.thumbLoader = { budgetKey: 'cdn', wafBudget: { limit: 2000 } }`. Trước khi JS chạy, ảnh lỗi vẫn do trình duyệt hiển thị.

## Giới hạn

- **Chính sách cache là của site.** Kit không giả định gì. Gợi ý: tách `max-age` của trình duyệt (dài) khỏi `s-maxage`
  của edge. Revalidate có điều kiện vẫn tốn 1 lượt WAF.
- **Không phối hợp được giữa các origin.** Hai site khác origin cùng dùng một CDN không thấy sổ của nhau, nên nhịp mặc
  định chỉ dùng 40% luật.
- **Mạng chung NAT** (toà soạn nhiều máy): CDN thấy một IP, client không thấy nhau. Cổng mở theo cụm lỗi là lưới cuối.
- Sổ chung qua `localStorage` là phối hợp, không phải trần cứng: vài tab cùng lúc có thể vượt vài lượt.
- Ảnh không có layout box (chính nó hoặc tổ tiên `display: none`: tab, thẻ ẩn) tính là ở xa; hiện ra thì tải (0.112).
- Loader đo khoảng cách theo chiều dọc. Lưới cuộn ngang tải mọi ô trong vùng dọc.
- Ảnh chờ quá 20 giây mà chưa có `load` / `error` thì bị huỷ và tính là một lần lỗi, để host treo không giữ hết slot.
- Loader chỉ dùng class và attribute, không đụng `style` (CSP strict).
