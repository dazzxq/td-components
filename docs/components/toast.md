[Tài liệu](../README.md) › [Components](README.md) › Toast

# Toast — `TdToast`

`TdToast` hiện thông báo ngắn ở góc màn hình rồi tự biến mất: "Đã lưu", "Không kết nối được", … Người dùng không cần
làm gì và vẫn thao tác được với trang.

Dùng toast cho phản hồi không bắt buộc đọc. Khi người dùng **phải** đọc / xác nhận (lỗi chặn luồng, thao tác nguy
hiểm) hãy dùng [modal](modal.md) (`TdModal.error`, `TdModal.confirm`). Lỗi gắn với một ô nhập nên hiện ngay tại ô đó
(xem [form validation](form-validation.md)), không phải toast.

| | |
|---|---|
| Import | `import { TdToast } from '@dazzxq/td-components/toast'` |
| Loại | API JS tĩnh (không phải custom element) |
| Form-associated | không |
| Từ phiên bản | 0.1.0 (token-native từ 0.9.0; viên thuốc kiểu dcms, không icon từ 0.21.0; **6 vị trí + màu đặc từ 0.36.0**) |

Cần `td.css`. Không cần khởi tạo: vùng chứa toast được tạo ở lần gọi đầu tiên.

## Ví dụ nhanh

```js
import { TdToast } from '@dazzxq/td-components/toast';

TdToast.success('Đã lưu bài viết');
TdToast.error('Không lưu được, thử lại sau');
```

## Cách dùng

### Bốn loại

```js
TdToast.success('Đã gửi email');          // 4 giây
TdToast.info('Có 3 bình luận mới');       // 4 giây
TdToast.warning('Sắp hết dung lượng');    // 4 giây
TdToast.error('Mất kết nối');             // 5 giây (lỗi mặc định lâu hơn)
```

### Đổi thời gian hiển thị, hoặc toast "dính" (sticky)

```js
TdToast.success('Đã lưu', 2000);                      // 2 giây
TdToast.show('Đang đồng bộ ở nền…', 'info', 8000);    // show(message, type, duration)
TdToast.error('Phiên đăng nhập đã hết hạn', 0);       // 0 = không tự tắt; người dùng click vào toast (bàn phím: Tab tới nút Đóng)
```

### Sau một thao tác async

```js
try {
  await savePost();
  TdToast.success('Đã lưu');
} catch (err) {
  TdToast.error(`Lỗi: ${err.message}`);   // message là text, không lo chèn HTML
}
```

### Nhiều toast cùng lúc

Gọi liên tiếp nhiều lần là an toàn: toast được xếp hàng và hiện cách nhau 80ms (tránh giật), tối đa
`TdToast.MAX_VISIBLE` (mặc định `5`) cái cùng lúc; cái cũ nhất bị đẩy ra trước (FIFO).

```js
TdToast.MAX_VISIBLE = 3;   // đặt một lần khi khởi động site
```

### Đóng toast bằng code

Mọi lần gọi trả về một **handle** `{ close() }`. Handle đại diện cho **yêu cầu**, nên gọi `close()` lúc nào cũng được:
toast còn trong hàng đợi → bị bỏ (không bao giờ hiện); đã hiện → đóng như khi bấm vào toast. Gọi lại `close()` không làm gì.

```js
const saving = TdToast.info('Đang đồng bộ…', 0);   // sticky
await sync();
saving.close();
TdToast.success('Đã đồng bộ');

TdToast.clear();   // bỏ mọi toast đang chờ và đóng mọi toast đang hiện (vd. khi chuyển trang trong SPA)
```

### Đổi nhãn (nút Đóng + tiền tố loại cho trình đọc màn hình)

```js
// đặt một lần khi khởi động; áp dụng cho toast tạo sau đó
TdToast.labels.close = 'Close';   // aria-label của nút Đóng (ẩn, chỉ hiện khi Tab tới), mặc định 'Đóng'
TdToast.labels.types = {          // tiền tố đọc trước nội dung, chỉ dành cho trình đọc màn hình (0.21.0)
  success: 'Success:', error: 'Error:', warning: 'Warning:', info: 'Info:',
};
TdToast.labels.types.info = '';   // chuỗi rỗng = bỏ tiền tố cho loại đó; loại không khai báo → mặc định tiếng Việt
```

Mặc định: `success` → `"Thành công:"`, `error` → `"Lỗi:"`, `warning` → `"Cảnh báo:"`, `info` → `"Thông tin:"`.
Vì toast không còn icon, tiền tố này (cùng `role="alert"` cho lỗi) là thứ giúp người không nhìn được màu biết loại
thông báo — đừng tắt nó nếu không có cách báo loại khác.

### Chọn vị trí (0.36.0)

Sáu vị trí **logic** (theo chiều viết — trang RTL tự đảo trái / phải): `top-start`, `top-center`, `top-end` (mặc
định, trên-phải), `bottom-start`, `bottom-center`, `bottom-end` (`TdToast.PLACEMENTS`).

```js
// toàn cục — đặt một lần khi khởi động (site PHP: trong file JS chung)
TdToast.configure({ placement: 'bottom-center' });
TdToast.configure({ placement: null });              // bỏ cấu hình → về token cũ / mặc định

// theo lần gọi — tham số thứ ba là số (thời gian, như cũ) HOẶC object
TdToast.error('Mất kết nối', { placement: 'bottom-end' });             // thời gian mặc định của error(): 5 giây
TdToast.success('Đã lưu', { placement: 'top-center', duration: 2000 });
TdToast.show('Đang đồng bộ…', 'info', { placement: 'bottom-start', duration: 0 });
```

**Thứ tự ưu tiên**: `placement` của lần gọi > `TdToast.configure()` > token neo cũ (nếu site đã đổi) > `top-end`.
Giá trị sai (vd. `'top-right'`) → một cảnh báo console cho mỗi giá trị, rồi dùng bậc kế. Vị trí được **chốt lúc gọi
`show()`**: đổi `configure()` sau đó không dời toast đang chờ / đang hiện.

Mỗi vị trí là một chồng riêng; **toast mới nhất nằm sát mép** (chồng trên: mới nhất trên cùng; chồng dưới: mới nhất
dưới cùng). Giới hạn `MAX_VISIBLE`, FIFO, `clear()` và tạm dừng vẫn là **toàn cục** (rê chuột lên một chồng → mọi toast
cùng dừng). Hiện / ẩn trượt từ mép của chồng: `*-start` từ mép đầu dòng, `*-end` từ mép cuối dòng, `top-center` từ
trên xuống, `bottom-center` từ dưới lên.

Khoảng cách tới mép: `--td-toast-offset-top` (`5rem`), `--td-toast-offset-bottom` (`1rem`), `--td-toast-offset-inline`
(`1rem`) — luôn cộng vùng an toàn (tai thỏ / thanh home: mép trên / dưới không gần hơn `inset + 8px`).

#### Token vị trí cũ vẫn chạy

Site đã chuyển toast bằng 6 token neo cũ (ví dụ 135 / dwp giữa-dưới) **không phải sửa gì**: khi một trong
`--td-toast-top/-bottom/-inline-start/-inline-end/-shift/-align` khác giá trị ship, toast **không có** `placement` (lần gọi
lẫn `configure()`) vào "chồng legacy" định vị đúng như 0.35 (thứ tự cũ: mới nhất dưới cùng). Lần gọi có `placement` thì
vẫn vào chồng tên tương ứng.

```css
/* cách cũ (vẫn hỗ trợ): giữa phía dưới */
:root {
  --td-toast-top: auto;
  --td-toast-bottom: 1.5rem;
  --td-toast-inline-end: auto;
  --td-toast-inline-start: 50%;
  --td-toast-shift: -50%;
  --td-toast-align: center;
}
```

Site mới nên dùng `TdToast.configure({ placement: 'bottom-center' })` thay vì 6 token trên.

## Property & method

| Chữ ký | Mô tả |
|---|---|
| `TdToast.show(message, type = 'info', options = 4000)` | Hiện toast. `message`: text (giá trị rỗng / falsy như `''`, `null`, `0` → không hiện gì). `type`: `'success' \| 'error' \| 'warning' \| 'info'` (giá trị lạ → `info`). `options`: số mili-giây (`0` hoặc âm = sticky) **hoặc** (0.36.0) `{ duration?, placement? }` — thiếu `duration` → 4000. Trả về handle `{ close() }` (từ 0.16.0; trước đó `undefined`). |
| `TdToast.success(message, options = 4000)` | Rút gọn cho `show(message, 'success', …)`; `options` = số hoặc `{ duration?, placement? }` (thiếu `duration` → 4000); trả handle. |
| `TdToast.error(message, options = 5000)` | Rút gọn cho `show(message, 'error', …)`; `options` = số hoặc `{ duration?, placement? }` (thiếu `duration` → 5000); trả handle. |
| `TdToast.warning(message, options = 4000)` | Rút gọn cho `show(message, 'warning', …)`; `options` = số hoặc `{ duration?, placement? }` (thiếu `duration` → 4000); trả handle. |
| `TdToast.info(message, options = 4000)` | Rút gọn cho `show(message, 'info', …)`; `options` = số hoặc `{ duration?, placement? }` (thiếu `duration` → 4000); trả handle. |
| `handle.close()` | (0.16.0) Còn trong hàng đợi 50ms → gỡ khỏi hàng đợi; đang chờ lượt 80ms → huỷ lượt đó; đã hiện → đóng như khi bấm vào toast. Gọi lại → không làm gì. Với `message` rỗng handle vẫn có nhưng không làm gì. |
| `TdToast.clear()` | (0.16.0) Xoá hàng đợi, huỷ mọi lượt đang chờ, đóng mọi toast đang hiện. |
| `TdToast.labels` | (0.16.0) `{ close: 'Đóng', types: { success, error, warning, info } }` — `close`: `aria-label` của nút Đóng; `types` (0.21.0): tiền tố loại cho trình đọc màn hình (`''` = bỏ). Áp dụng cho toast tạo sau khi đổi. |
| `TdToast.configure({ placement })` | (0.36.0) Vị trí toàn cục (một trong `PLACEMENTS`; `null` = bỏ). Giá trị sai → cảnh báo một lần, bỏ qua. Không dời toast đã gọi. |
| `TdToast.PLACEMENTS` | (0.36.0) `['top-start', 'top-center', 'top-end', 'bottom-start', 'bottom-center', 'bottom-end']` (đóng băng). |
| `TdToast.MAX_VISIBLE` | `5`. Số toast hiện cùng lúc tối đa (**toàn hệ thống**, mọi vị trí cộng lại); vượt quá thì cái cũ nhất bị đóng. |
| `TdToast.container` | Portal root `#td-toast-container.td-toast-root` (hoặc `null` trước lần gọi đầu). Chỉ đọc. |
| `TdToast.ensureContainer()` | Tạo vùng chứa nếu chưa có / đã bị gỡ khỏi DOM. Thường không cần gọi tay. |
| `TdToast.getTheme(type)` | Trả `{ type, icon }` đã chuẩn hoá (loại lạ → `info`). Từ 0.21.0 `icon` chỉ còn để tương thích (toast không vẽ icon). |
| `TdToast.getToastZIndex()` | **Lỗi thời.** Trả z-index đã tính của vùng chứa (từ token `--td-z-toast`). |
| `TdToast.TOAST_Z_INDEX_BASE` | **Lỗi thời.** `500`, chỉ còn để tương thích; z-index thật đến từ token `--td-z-toast`. |

## Hành vi

- **Hẹn giờ tạm dừng** (WCAG 2.2.1) khi: con trỏ đang ở trên vùng toast, focus đang ở trong vùng toast, hoặc tab trình
  duyệt bị ẩn. Thời gian còn lại được giữ và chạy tiếp khi hết điều kiện. Toast đang tạm dừng có `[data-paused]`.
- **Đóng (kiểu dcms, 0.21.0):** click vào **bất kỳ đâu** trên toast là đóng; không có nút X hiển thị. Nút Đóng
  (`aria-label` = `TdToast.labels.close`, mặc định `"Đóng"`) vẫn nằm trong DOM của mọi toast (kể cả sticky) nhưng
  ẩn bằng mắt cho tới khi được focus **bằng bàn phím** (`:focus-visible`) — nên toast sticky vẫn đóng được bằng Tab +
  Enter. Code đóng bằng `handle.close()` / `TdToast.clear()`.
- **Thời lượng:** `error` 5 giây, các loại khác 4 giây; `duration ≤ 0` → không tự tắt.
- **Hàng đợi:** lần gọi đầu được gom trong 50ms, sau đó mỗi toast hiện cách nhau 80ms. Vì vậy toast không xuất hiện
  "ngay trong cùng dòng code" — đừng truy vấn DOM toast ngay sau khi gọi `show()`.
- **Trên modal / loading:** vùng toast không bao giờ bị `inert` bởi [modal](modal.md) hay [loading](loading.md); nút
  Đóng của toast nằm trong vòng Tab của modal. Toast giữ nguyên bề mặt của nó khi có modal đang mở.
- **Lớp:** `--td-z-toast` (500) — trên modal (400) và loading (480), dưới [tooltip](tooltip.md) (510).

### Responsive (0.34.0, 0.36.0)

- Điện thoại (< 480px): `start` / `center` / `end` của cùng một mép gộp thành **một cột rộng hết** (trừ lề
  `--td-gutter` + vùng an toàn) — một cột ở trên, một cột ở dưới; toast xếp theo thời gian (mới nhất sát mép), trượt dọc.
  Chồng legacy (token cũ) giữ luật 0.34: một cột rộng hết.
- Màn hình thấp (≤ 500px — điện thoại xoay ngang): chỉ **hai toast mới nhất (tính chung mọi vị trí)** hiện; các toast
  khác mang `data-td-toast-older` (vẫn trong DOM, đã được đọc).
- Vùng an toàn (tai thỏ, thanh home): chồng tên `top: max(--td-toast-offset-top, safe-area-inset-top + 8px)` (tương tự
  `bottom`); mép đầu / cuối dòng cộng inset bên đó; `*-center` = `left/right: gutter + inset` mỗi bên. Chồng legacy:
  `top: max(--td-toast-top, safe-area-inset-top + 8px)` như 0.34 (token `auto` giữ `auto`).

## Tuỳ biến giao diện

Toast theo kiểu **dcms** (0.21.0): viên thuốc gọn (bo 12px, padding 12×16, chữ 14px), viền mảnh, một bóng mềm
(`--td-glass-shadow`), **đặc — không blur**, không icon, không nút đóng hiển thị. **Từ 0.36.0 màu là màu đặc**
(như dcms): nền đậm theo loại + chữ trắng, riêng **warning nền vàng + chữ tối** (vàng + chữ trắng chỉ ~2:1, không đọc
được); viền là sắc đậm hơn nền một bậc. Màu đọc token dùng chung `--td-solid-{success,danger,warning,info}-{bg,fg,border}`
(xem [theming](../customization/theming.md)) — đổi ở một chỗ là nút ngữ nghĩa, badge và toast cùng đổi. Tương phản
chữ ≥ 4.7:1 được gate kiểm.

| Token | Mặc định (sáng) | Tác dụng |
|---|---|---|
| `--td-toast-offset-top` / `-bottom` / `-inline` | `5rem` / `1rem` / `1rem` | (0.36.0) Khoảng cách của 6 vị trí tới mép trên / dưới / đầu-cuối dòng (cộng vùng an toàn). |
| `--td-toast-top` | `5rem` | **Token neo cũ** (chồng legacy): khoảng cách từ đỉnh màn hình (`auto` để bỏ). Đổi bất kỳ token neo nào → toast không có `placement` vào chồng legacy. |
| `--td-toast-bottom` | `auto` | Token neo cũ: khoảng cách từ đáy màn hình. |
| `--td-toast-inline-end` | `1rem` | Token neo cũ: khoảng cách từ mép cuối dòng. |
| `--td-toast-inline-start` | `auto` | Token neo cũ: khoảng cách từ mép đầu dòng. |
| `--td-toast-shift` | `0%` | Token neo cũ: dịch ngang chồng (`-50%` để căn giữa cùng `inline-start: 50%`). |
| `--td-toast-align` | `flex-end` | Token neo cũ: căn các toast trong cột (`flex-start`, `center`, `flex-end`). |
| `--td-toast-gap` | `var(--td-space-xs)` | Khoảng cách giữa các toast. |
| `--td-toast-max-w` | `28rem` | Bề rộng tối đa một toast. |
| `--td-toast-radius` | `12px` | Bo góc (0.20.0: `22px`). |
| `--td-toast-pad-y` / `--td-toast-pad-x` | `0.75rem` / `1rem` | Padding dọc / ngang. |
| `--td-toast-font-size` | `var(--td-text-sm)` (14px) | Cỡ chữ. |
| `--td-toast-shadow` | `var(--td-glass-shadow)` | Bóng (tương phản cao / forced colors → không bóng). |
| `--td-toast-success-bg` / `-fg` / `-border` | `var(--td-solid-success-bg/-fg/-border)` (`#15803d` / `#fff` / `#166534`) | Màu toast thành công. |
| `--td-toast-error-bg` / `-fg` / `-border` | `var(--td-solid-danger-…)` (`#dc2626` / `#fff` / `#b91c1c`) | Màu toast lỗi. |
| `--td-toast-warning-bg` / `-fg` / `-border` | `var(--td-solid-warning-…)` (`#f59e0b` / `#18181b` / `#d97706`) | Màu toast cảnh báo (chữ tối). |
| `--td-toast-info-bg` / `-fg` / `-border` | `var(--td-solid-info-…)` (`#2563eb` / `#fff` / `#1d4ed8`) | Màu toast thông tin (cũng là loại lạ). |
| `--td-toast-{success,error,warning,info}-close-hover` | trắng 16 % (warning: đen 8 %) | (0.36.0) Nền nút Đóng khi hover, theo loại. |
| `--td-toast-close-hover` | `rgb(0 0 0 / 8%)` | **Deprecated** từ 0.36.0 (thay bằng token theo loại ở trên). |
| `--td-toast-enter-shift` | `1rem` | Độ trượt khi hiện / ẩn (ngang hoặc dọc tuỳ vị trí). |
| `--td-toast-enter-dur` / `--td-toast-exit-dur` | `200ms` / `180ms` | Thời lượng hiện / ẩn. Đặt `-exit-dur` dài hơn thì kit chờ hết chuyển động ẩn (đọc từ computed style) rồi mới gỡ toast. |
| `--td-toast-fg`, `--td-toast-close-fg`, `--td-toast-glass-bg`, `--td-toast-{type}-icon`, `--td-toast-*-wash` | — | **Deprecated** (nền trung tính + icon của 0.20.0), vẫn khai báo nhưng không còn tác dụng. |

Ở dark theme (`<html data-td-theme="dark">`) màu đặc giữ nguyên (chữ trắng trên sắc 600 / 700 đọc tốt trên nền tối).
Nếu bạn override màu, hãy override cho cả hai theme và tự kiểm tra tương phản.

```css
/* Trả toast về pastel của 0.21–0.35 */
:root {
  --td-toast-success-bg: var(--td-pastel-success-bg); --td-toast-success-fg: var(--td-pastel-success-fg); --td-toast-success-border: var(--td-pastel-success-border);
  --td-toast-error-bg: var(--td-pastel-danger-bg);    --td-toast-error-fg: var(--td-pastel-danger-fg);    --td-toast-error-border: var(--td-pastel-danger-border);
  --td-toast-warning-bg: var(--td-pastel-warning-bg); --td-toast-warning-fg: var(--td-pastel-warning-fg); --td-toast-warning-border: var(--td-pastel-warning-border);
  --td-toast-info-bg: var(--td-pastel-info-bg);       --td-toast-info-fg: var(--td-pastel-info-fg);       --td-toast-info-border: var(--td-pastel-info-border);
  --td-toast-success-close-hover: rgb(0 0 0 / 8%); --td-toast-error-close-hover: rgb(0 0 0 / 8%); --td-toast-info-close-hover: rgb(0 0 0 / 8%);
}
```

Chuyển động: hiện = mờ dần + trượt từ mép của chồng (200ms ease-out; chồng legacy: từ mép cuối dòng như cũ); ẩn =
ngược lại trong 180ms.
`prefers-reduced-motion: reduce` → chỉ đổi độ mờ. Tương phản cao (`prefers-contrast: more`) → viền theo màu chữ, bỏ
bóng; forced colors → `Canvas` / `CanvasText`, viền thật. `data-td-glass="off"` không còn ảnh hưởng toast (vốn đã đặc).

## Cấu trúc DOM & class

Đổi từ 0.21.0: **bỏ** `span.td-toast__icon` và hai class `td-glass-surface td-glass-surface--strong`; **thêm**
`span.td-toast__type.td-sr-only` (tiền tố loại cho trình đọc màn hình). Site nào query `.td-toast__icon` cần bỏ.

**Đổi từ 0.36.0** ([ADR 0016](../internal/decisions/0016-toast-placement.md)): `#td-toast-container` là **portal root**
(`.td-toast-root`, không còn class `.td-toasts`); toast nằm trong root > lane > chồng. Code query
`#td-toast-container > .td-toast` cần đổi thành `#td-toast-container .td-toast`. `.td-toasts` vẫn là chồng.

```html
<div id="td-toast-container" class="td-toast-root">
  <div class="td-toast-lane" data-edge="top">
    <div class="td-toasts" data-placement="top-end">
      <div class="td-toast td-toast--success" style="--_td-toast-seq: 3" role="status" aria-live="polite" data-state="open">
        <span class="td-toast__type td-sr-only">Thành công: </span>
        <span class="td-toast__message">Đã lưu</span>
        <button type="button" class="td-toast__close" aria-label="Đóng"><svg class="td-icon td-icon--s" data-icon="close" …></svg></button>
      </div>
    </div>
  </div>
  <div class="td-toast-lane" data-edge="bottom"></div>
  <!-- chỉ khi site đổi token neo cũ: --> <div class="td-toasts"> … </div>
</div>
```

`style="--_td-toast-seq: N"` được đặt bằng CSSOM (`style.setProperty`, hợp lệ dưới CSP strict) — số thứ tự toàn cục,
dùng làm `order` trong lane < 480.

| Class / attribute | Ý nghĩa |
|---|---|
| `#td-toast-container.td-toast-root` | (0.36.0) Portal root cố định `inset: 0`, gắn vào `<body>` ở lần gọi đầu. `pointer-events: none` nên trang quanh nó vẫn click được; đăng ký layer một lần. |
| `.td-toast-lane[data-edge="top\|bottom"]` | (0.36.0) Lane mỗi mép: ≥ 480 `display: contents`; < 480 một cột rộng hết. |
| `.td-toasts[data-placement="…"]` | (0.36.0) Chồng của một vị trí (tạo khi dùng lần đầu). Không `data-placement` = chồng legacy (token neo cũ). |
| `[data-td-toast-older]` | (0.36.0) Mọi toast trừ 2 toast mới nhất toàn cục — ẩn khi màn hình thấp (≤ 500px). |
| `.td-toast--{success\|error\|warning\|info}` | Loại (quyết định màu). |
| `.td-toast__type.td-sr-only` | Tiền tố loại (`TdToast.labels.types`), chỉ trình đọc màn hình thấy; điền cùng lúc với nội dung. |
| `.td-toast__message` | Nội dung (text). |
| `.td-toast__close` | Nút Đóng: trong DOM, focus được, chỉ hiện khi `:focus-visible`. |
| `[data-state="entering\|open\|closing"]` | Vòng đời; phần tử bị gỡ sau khi chuyển động ẩn của `closing` chạy xong (tối thiểu 200ms; dài hơn nếu `--td-toast-exit-dur` dài hơn). |
| `[data-paused]` | Hẹn giờ đang tạm dừng. |
| `role="status"` + `aria-live="polite"` | Mọi loại trừ `error`. |
| `role="alert"` + `aria-live="assertive"` | Chỉ `error`. |

## Bàn phím & trợ năng

- Toast **không lấy focus** khi hiện — người dùng không bị gián đoạn.
- Trình đọc màn hình: `success` / `info` / `warning` được đọc lịch sự (không ngắt lời); chỉ `error` ngắt lời. Mỗi toast
  được đọc kèm tiền tố loại ("Thành công: Đã lưu") — màu không bao giờ là tín hiệu duy nhất. Chữ (tiền tố + nội dung)
  được điền vào toast **một khung hình sau** khi toast được chèn, để vùng live region tồn tại trước khi nội dung đổi —
  nhờ vậy lời thông báo được đọc ổn định.
- Nút Đóng focus được bằng Tab (khi đó nó hiện ra, có vòng focus), bấm Enter / Space để đóng. Khi toast đang được focus
  bị đóng, focus chuyển tới nút Đóng của toast kế tiếp; nếu là toast cuối cùng, focus về lại nơi nó đến trước khi vào
  vùng toast. Chuột / chạm: bấm vào toast.
- Khi có modal mở, nút Đóng của toast vẫn nằm trong vòng Tab của modal.
- Trên thiết bị cảm ứng nút Đóng (khi hiện) có vùng chạm tối thiểu `--td-touch-min`. Forced colors: toast và nút Đóng
  dùng màu hệ thống.

## Bảo mật

`message` **luôn** được render dạng text (`textContent`), không bao giờ là HTML — đưa trực tiếp thông báo lỗi từ server
hay dữ liệu người dùng vào là an toàn. Hệ quả: không thể in đậm / chèn link trong toast. Cần nội dung có định dạng thì
dùng [modal](modal.md).

## Lưu ý & lỗi thường gặp

- **Toast không hiện:** kiểm tra `message` có rỗng không (`''`, `null`, `undefined`, `0` đều bị bỏ qua) và `td.css` đã
  được nạp chưa.
- **Đừng dùng toast cho lỗi bắt buộc xử lý.** Toast có thể biến mất trước khi người dùng đọc; lỗi quan trọng nên dùng
  `TdModal.error` hoặc hiện tại chỗ.
- **Toast bị header cố định che:** nâng `--td-toast-offset-top` (chồng legacy: `--td-toast-top`), hoặc nếu header có z-index lớn hơn 500 thì nâng cả bộ token
  `--td-z-*`. `TOAST_Z_INDEX_BASE` không còn tác dụng.
- Đừng xoá `#td-toast-container` bằng tay; nếu nó bị gỡ, lần gọi sau kit tự tạo lại.

## Xem thêm

- [Modal](modal.md) · [Loading](loading.md) · [Icons](icons.md)
- [Theming](../customization/theming.md) · [Styling](../customization/styling.md)
- [Lớp nổi & bàn phím](../concepts/how-it-works.md) · [Trợ năng](../guides/accessibility.md)
