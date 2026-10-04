[Tài liệu](../README.md) › [Components](README.md) › Modal

# Modal — `TdModal` + `TdModalStackManager`

`TdModal` là API JS tĩnh để mở hộp thoại (dialog) chồng lên trang: hộp thoại tuỳ biến (`show`), hộp thoại xác nhận
trả về `Promise<boolean>` (`confirm`) và hộp thoại thông báo kiểu alert (`success` / `error` / `info`). Nhiều modal có
thể mở chồng lên nhau; `TdModalStackManager` giữ sổ sách của chồng modal đó.

Dùng modal khi người dùng **phải** xử lý xong một việc rồi mới quay lại trang (sửa form, xác nhận xoá). Không dùng modal
cho thông báo thoáng qua (dùng [toast](toast.md)), cho trạng thái "đang xử lý" chặn cả trang (dùng
[loading](loading.md)), cho xem ảnh (dùng [lightbox](lightbox.md)) hay cho menu ngữ cảnh (dùng [menu](menu.md)).

| | |
|---|---|
| Import | `import { TdModal } from '@dazzxq/td-components/modal'` · `import { TdModalStackManager } from '@dazzxq/td-components/modal-stack'` |
| Loại | API JS tĩnh (không phải custom element, không đặt thẻ vào HTML) |
| Form-associated | không |
| Từ phiên bản | 0.1.0 (token-native từ 0.9.0, `escapeCloses` từ 0.10.0) |

Cần `td.css` đã được nạp (modal dùng style của `modal.css`, `button.css` và `spinner.css`, tất cả đã gộp trong
`td.css`). Không cần gọi hàm khởi tạo nào: phần tử modal được tạo khi mở và gỡ khỏi DOM khi đóng.

## Ví dụ nhanh

```js
import { TdModal } from '@dazzxq/td-components/modal';

// Hộp thoại xác nhận: await ra true (bấm Xác nhận) hoặc false (Hủy / nút X / closeAll)
const ok = await TdModal.confirm({
  title: 'Xóa bài viết?',
  message: 'Thao tác này không thể hoàn tác.',
  confirmText: 'Xóa',
  confirmVariant: 'danger',
});
if (ok) {
  // xoá...
}
```

## Cách dùng

### 1. Modal chứa form, nút Lưu gọi API (async action)

Truyền `actions` để kit tự dựng nút `.td-btn` ở footer. Nếu `onClick` trả về một Promise (thenable), modal **giữ nguyên
mở**, nút đó hiện spinner (`aria-busy`), các nút khác và nút X bị vô hiệu hoá cho tới khi Promise xong:

- Promise resolve ra `false` → modal vẫn mở (ví dụ server báo lỗi validate).
- Promise bị reject → modal vẫn mở, các nút bật lại, kit ghi `console.warn`.
- Resolve ra bất kỳ giá trị nào khác → modal đóng, `onClose(value)` nhận `value` của action.

```js
import { TdModal } from '@dazzxq/td-components/modal';

const form = document.createElement('form');
form.className = 'my-edit-form';
const input = document.createElement('input');
input.name = 'title';
input.required = true;
form.append(input);

TdModal.show({
  title: 'Sửa tiêu đề',
  body: form,                       // Node: an toàn, ưu tiên dùng
  size: 'lg',
  actions: [
    { label: 'Hủy', value: 'cancel' },
    {
      label: 'Lưu',
      variant: 'primary',
      value: 'saved',
      onClick: async () => {
        if (!form.reportValidity()) return false;          // false → không đóng
        const res = await fetch('/api/post', { method: 'POST', body: new FormData(form) });
        if (!res.ok) return false;                         // giữ modal mở để người dùng sửa
        // không trả về gì → modal đóng với value 'saved'
      },
    },
  ],
  onClose: (value) => {
    if (value === 'saved') console.log('Đã lưu');
  },
});
```

### 2. Hộp thoại thông báo (alert)

`success`, `error`, `info` mở hộp thoại nhỏ có icon và một nút OK. Promise resolve `true` khi bấm OK, `false` khi đóng
bằng cách khác (nút X, `closeAll`).

```js
await TdModal.success({ message: 'Đã lưu bài viết.' });
await TdModal.error({ title: 'Không lưu được', message: 'Mất kết nối tới máy chủ.' });
await TdModal.info({ message: 'Phiên làm việc sắp hết hạn.', okText: 'Đã hiểu' });
```

### 3. Xác nhận có thao tác async

`onConfirm` trả về Promise → nút xác nhận bận cho tới khi Promise xong. Resolve `false` hoặc reject → hộp thoại vẫn mở;
giá trị khác → đóng và `confirm()` resolve `true`. Từ 0.16.0 `onConfirm` **đồng bộ** cũng giống `actions`: trả `false`
hoặc ném lỗi → hộp thoại vẫn mở (lỗi được ghi `console.error`).

```js
const deleted = await TdModal.confirm({
  title: 'Xóa người dùng?',
  message: 'Tài khoản sẽ bị xoá vĩnh viễn.',
  confirmVariant: 'danger',
  onConfirm: async () => {
    const res = await fetch('/api/users/42', { method: 'DELETE' });
    return res.ok;              // false → giữ hộp thoại mở
  },
  onCancel: () => console.log('Người dùng đã huỷ'),
});
```

### 4. Footer tự dựng, đóng bằng code

```js
const saveBtn = document.createElement('button');
saveBtn.type = 'button';
saveBtn.className = 'td-btn td-btn--primary';
saveBtn.textContent = 'Xong';

const id = TdModal.show({
  title: 'Tuỳ chọn',
  body: document.querySelector('#options-template').content.cloneNode(true),
  footer: [saveBtn],
});
saveBtn.addEventListener('click', () => TdModal.closeById(id));
```

### 5. Khởi tạo nội dung sau khi modal đã hiện (`onShow`)

`onShow(root, payload)` chạy **một lần**, sau khi modal chuyển sang `data-state="open"` (khung hình thứ hai), lúc đó
nội dung đã được bố trí nên đo kích thước / khởi tạo thư viện khác là chính xác.

```js
TdModal.show({
  title: 'Bản đồ',
  body: mapContainer,
  size: '3xl',
  onShow: (root, payload) => initMap(root.querySelector('.map'), payload.lat, payload.lng),
  onShowPayload: { lat: 21.03, lng: 105.85 },
});
```

### 6. Chồng modal

Mở modal trong modal hoàn toàn hợp lệ. Modal dưới bị phủ (`[data-covered]`) và bị `inert` (dialog nào cũng nền đặc
từ 0.20.0); modal trên cùng nhận bàn phím. Đóng modal trên thì focus về lại nút đã mở nó trong modal dưới.

```js
TdModal.show({
  title: 'Danh sách',
  body: listEl,
  actions: [{
    label: 'Xoá mục đã chọn',
    variant: 'danger',
    close: false,                         // bấm không đóng modal ngoài
    onClick: async () => {
      if (await TdModal.confirm({ message: 'Xoá các mục đã chọn?' })) removeSelected();
    },
  }],
});
```

### 7. Đóng tất cả (ví dụ khi đăng xuất / đổi route)

```js
TdModal.closeAll();   // đóng từ trên xuống; mỗi modal chạy onClose đúng 1 lần; focus về opener dưới cùng
```

## Property & method

### `TdModal`

| Chữ ký | Trả về | Mô tả |
|---|---|---|
| `TdModal.show(options)` | `string` (id modal) | Mở một modal. Xem [Tuỳ chọn `show()`](#tuỳ-chọn-show). |
| `TdModal.confirm(options)` | `Promise<boolean>` | Hộp thoại xác nhận (`role="alertdialog"`, size `sm`). `true` = bấm nút xác nhận; `false` = Hủy, nút X hoặc `closeAll()`. Resolve **đúng một lần**. |
| `TdModal.success(options)` | `Promise<boolean>` | Thông báo thành công (icon success, nút OK màu `success`). OK → `true`, đóng cách khác → `false`. |
| `TdModal.error(options)` | `Promise<boolean>` | Thông báo lỗi (icon error, nút OK màu `danger`). |
| `TdModal.info(options)` | `Promise<boolean>` | Thông báo thông tin (icon info, nút OK màu `primary`). |
| `TdModal.close()` | `void` | Đóng modal trên cùng. |
| `TdModal.closeById(id)` | `void` | Đóng modal theo id (ở bất kỳ vị trí nào trong chồng). Id không tồn tại → không làm gì. |
| `TdModal.closeAll()` | `void` | Đóng mọi modal, trên cùng trước. |
| `TdModal.labels` | `object` | Nhãn mặc định, sửa được: `{ close: 'Đóng', confirm: 'Xác nhận', cancel: 'Hủy', ok: 'OK', confirmTitle: 'Xác nhận', confirmMessage: 'Bạn có chắc chắn?', successTitle: 'Thành công', errorTitle: 'Lỗi', infoTitle: 'Thông tin' }` (năm khoá cuối từ 0.16.0). |

Không có `TdModal.loading()` — đã bỏ, dùng [`TdLoading`](loading.md).

### `TdModalStackManager` (`@dazzxq/td-components/modal-stack`)

Phần lớn site **không cần** đụng tới lớp này; `TdModal` tự gọi. Các thành phần công khai:

| Thành phần | Kiểu | Mô tả |
|---|---|---|
| `stack` | `Array` | Các instance modal đang mở, dưới → trên. Chỉ đọc (đừng sửa tay). |
| `getTop()` | `() => object \| null` | Instance trên cùng (có `id`, `element`, `dialog`, …). |
| `getStackSize()` | `() => number` | Số modal đang mở. Hữu ích để biết "có modal nào đang mở không". |
| `generateId()` | `() => string` | Sinh id dạng `td-modal-<timestamp>-<random>`. |
| `push(instance)` / `pop()` / `removeById(id)` | | Sổ sách nội bộ; **không** đóng modal. Dùng `TdModal.closeById()` thay thế. |
| `closeAll()` | `() => void` | Giống `TdModal.closeAll()` (gọi `close()` của từng instance). |
| `ensureScrollState()` | `() => void` | Đồng bộ lại khoá cuộn trang với chồng modal (sau khi có lỗi giữa vòng đời modal). |
| `BASE_Z_INDEX` | `number \| null` | Mặc định `null` (dùng token `--td-z-modal`). **Đã lỗi thời.** Gán số → mỗi modal nhận `z-index` inline `BASE + i × Z_INDEX_INCREMENT` và in 1 cảnh báo. Nên override bộ token `--td-z-*` thay vì dùng cái này. |
| `Z_INDEX_INCREMENT` | `number` | `100`. Chỉ có tác dụng khi `BASE_Z_INDEX` là số. |
| `BACKDROP_BASE_OPACITY` / `BACKDROP_OPACITY_INCREMENT` | `number` | `0.5` / `0.05`. Chỉ còn để tương thích (tính vào `instance.backdropOpacity`); không còn được áp lên giao diện — scrim dùng token `--td-glass-scrim`. |

Mỗi instance trong `stack` có thêm `stackIndex`, `zIndex`, `backdropOpacity` (chỉ đọc, để tương thích).

```js
import { TdModalStackManager } from '@dazzxq/td-components/modal-stack';

window.addEventListener('beforeunload', (e) => {
  if (TdModalStackManager.getStackSize() > 0) e.preventDefault(); // còn modal đang mở (có thể chứa form dở)
});
```

## Hook & tuỳ chọn

### Tuỳ chọn `show()`

| Tuỳ chọn | Kiểu | Mặc định | Mô tả |
|---|---|---|---|
| `title` | `string` | `'Modal'` | Tiêu đề, luôn render dạng **text**. |
| `body` | `Node \| string` | `''` | Nội dung. `Node` (ưu tiên) được gắn vào body. `string` được gán bằng `innerHTML` — **cửa HTML tin cậy**, chỉ dành cho markup do developer viết, không bao giờ chứa dữ liệu người dùng. |
| `footer` | `HTMLElement \| HTMLElement[] \| null` | `null` | Phần tử footer tự dựng, gắn nguyên trạng. Bị bỏ qua nếu có `actions`. |
| `actions` | `Array<Action>` | — | Nút footer do kit dựng (thắng `footer`). Xem [Action](#action-nút-footer). |
| `size` | `string` | `'md'` | `xs` (20rem), `sm` (24rem), `md` (32rem), `lg` (42rem), `xl` (48rem), `2xl` (56rem), `3xl` (64rem), `4xl` (72rem), `5xl` (80rem), `full` (100%). Giá trị lạ → `md`. |
| `width` | `string` | `null` | Chiều rộng tuỳ ý (giá trị CSS `width` hợp lệ, ví dụ `'700px'`, `'min(90vw, 50rem)'`). Không nhận `url()`, `var()`, `;{}`, dài quá 200 ký tự. Sai → bỏ qua + `console.warn`. Vẫn bị chặn bởi bề rộng màn hình. |
| `height` | `string` | `null` | Chiều cao tuỳ ý, cùng luật như `width`. |
| `fullViewport` | `boolean` | `false` | Dialog phủ kín màn hình, không bo góc, không thành bottom sheet trên điện thoại. `width`/`height` bị bỏ qua. Body mặc định không padding và `overflow: hidden`. Từ 0.33.0 có **safe area** (tai thỏ / thanh home): header / footer **cộng thêm** `env(safe-area-inset-*)` vào padding gốc, body chỉ nhận inset hai bên (khi không đặt `bodyPadding`); xem ghi chú dưới bảng class. |
| `closable` | `boolean` | `true` | Hiện nút X. `false` chỉ **ẩn nút X** — người dùng phải chọn một nút footer. |
| `escapeCloses` | `boolean` | `false` | Cho phép phím Escape đóng modal (trừ khi đang có action bận). Chỉ bật cho hộp thoại mà đóng không mất dữ liệu (ví dụ bộ chọn ngày). Xem [Vì sao không đóng khi click nền / Escape](#vì-sao-không-đóng-khi-click-nền-hoặc-escape). |
| `showHeader` | `boolean` | `true` | `false` → ẩn header (cả nút X); `title` trở thành `aria-label` của dialog. |
| `showFooter` | `boolean` | `true` | `false` → không render `footer`/`actions`. Footer cũng tự ẩn khi rỗng. |
| `onClose` | `(value) => void` | `null` | Gọi **đúng một lần** cho mọi đường đóng (X, action, `close`/`closeById`/`closeAll`, Escape khi `escapeCloses`), **sau khi** focus đã được trả về. `value` = `value` của action đã bấm, còn lại là `undefined`. Lỗi bị bắt và `console.error`. |
| `onShow` | `(root, payload) => void` | — | Gọi một lần sau khi modal ở trạng thái `open` (khung hình thứ hai). Không gọi nếu modal đã bị đóng trước đó. Lỗi bị bắt và `console.warn`, modal vẫn mở bình thường. `root` là phần tử `.td-modal`. |
| `onShowPayload` | `any` | — | Tham số thứ hai của `onShow`. |
| `autoFocus` | `boolean` | `true` | `false` → focus vào chính dialog thay vì field đầu tiên (tránh bàn phím ảo bật lên trên điện thoại). |
| `focusTarget` | `HTMLElement` | `null` | Phần tử nhận focus ban đầu. Chỉ được dùng khi nó đã gắn vào DOM **và** nằm trong dialog (vì vậy thường là phần tử bạn truyền trong `body`). |
| `bodyPadding` | `string` | — | Padding của body (giá trị CSS `padding` hợp lệ, ví dụ `'0'`, `'2rem 1rem'`). Dùng chuỗi có đơn vị: số trần như `16` bị từ chối (chỉ `0` hợp lệ). |
| `bodyOverflow` | `string` | — | `visible` \| `hidden` \| `auto` \| `scroll` \| `clip`. Giá trị khác → bỏ qua + `console.warn`. |

### Action (nút footer)

```ts
{
  label: string,                 // text của nút (luôn là text)
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'warning' | 'info',  // mặc định / lạ → 'secondary'
  value?: any,                   // truyền cho onClose(value) khi action làm modal đóng
  close?: boolean,               // false → bấm không đóng modal (mặc định đóng)
  disabled?: boolean,            // nút bị disabled từ đầu
  onClick?: (ctx: { id: string, value: any, button: HTMLButtonElement }) => boolean | void | PromiseLike<any>,
}
```

Bảng kết quả của `onClick`:

| `onClick` … | Kết quả |
|---|---|
| không có, hoặc trả về `undefined` / giá trị khác `false` | Đóng modal (trừ khi `close: false`), `onClose(value)`. |
| trả về `false` (đồng bộ) | Giữ mở. |
| ném lỗi (throw) | Giữ mở, `console.error`. |
| trả về Promise | Nút bận (`aria-busy="true"` + `aria-disabled="true"` + spinner), các action khác và nút X `disabled`. Khi xong: resolve `false` → giữ mở; reject → giữ mở + `console.warn`; giá trị khác → đóng (trừ khi `close: false`). |

Trong lúc bận, bấm lại nút đó hay nút khác đều bị bỏ qua, và Escape cũng không đóng modal kể cả khi `escapeCloses`.
Đóng bằng code (`closeById`, `closeAll`) thì **vẫn** đóng được; kết quả Promise về sau bị bỏ qua.

### Tuỳ chọn `confirm()`

| Tuỳ chọn | Kiểu | Mặc định | Mô tả |
|---|---|---|---|
| `title` | `string` | `TdModal.labels.confirmTitle` (`'Xác nhận'`) | Tiêu đề (text). |
| `message` | `string` | `TdModal.labels.confirmMessage` (`'Bạn có chắc chắn?'`) | Nội dung (text). |
| `messageHtml` | `string` | — | Nội dung HTML **tin cậy** (chỉ markup của developer); thắng `message`. |
| `confirmText` | `string` | `TdModal.labels.confirm` (`'Xác nhận'`) | Nhãn nút xác nhận. |
| `cancelText` | `string` | `TdModal.labels.cancel` (`'Hủy'`) | Nhãn nút huỷ. |
| `confirmVariant` | `'primary' \| 'danger' \| 'success' \| 'warning'` | `'primary'` | Màu nút xác nhận. Giá trị khác → `primary`. |
| `onConfirm` | `() => any` | — | Gọi khi bấm xác nhận. Đồng bộ: trả `false` hoặc ném lỗi (ghi `console.error`) → giữ mở (**đổi hành vi 0.16.0**, trước đó resolve `true` và đóng); giá trị khác → `true` và đóng. Trả Promise → nút bận; resolve `false` hoặc reject → giữ mở; giá trị khác → `true` và đóng. |
| `onCancel` | `() => void` | — | Gọi đúng một lần khi bị huỷ (nút Hủy, X, `closeAll`). Lỗi bị nuốt. |

Focus ban đầu của `confirm` nằm ở nút **Hủy** (an toàn cho thao tác nguy hiểm: nhấn Enter nhầm không xoá gì).

### Tuỳ chọn `success()` / `error()` / `info()`

| Tuỳ chọn | Mặc định (`success` / `error` / `info`) | Mô tả |
|---|---|---|
| `title` | `TdModal.labels.successTitle` / `errorTitle` / `infoTitle` (`'Thành công'` / `'Lỗi'` / `'Thông tin'`) | Tiêu đề (text). |
| `message` | `'Thao tác đã hoàn tất'` / `'Đã xảy ra lỗi'` / `''` | Nội dung (text). |
| `messageHtml` | — | HTML **tin cậy**; thắng `message`. |
| `okText` | `TdModal.labels.ok` (`'OK'`) | Nhãn nút OK. |

### Nhãn (i18n)

```js
import { TdModal } from '@dazzxq/td-components/modal';

TdModal.labels.close = 'Close';     // aria-label nút X (đọc khi mỗi modal được tạo)
TdModal.labels.confirm = 'Confirm';
TdModal.labels.cancel = 'Cancel';
TdModal.labels.ok = 'OK';
// từ 0.16.0: tiêu đề / nội dung mặc định của các hộp thoại Promise
TdModal.labels.confirmTitle = 'Confirm';
TdModal.labels.confirmMessage = 'Are you sure?';
TdModal.labels.successTitle = 'Success';
TdModal.labels.errorTitle = 'Error';
TdModal.labels.infoTitle = 'Information';
```

Nội dung mặc định của `success` / `error` (`'Thao tác đã hoàn tất'`, `'Đã xảy ra lỗi'`) **không** nằm trong `labels`;
site dùng ngôn ngữ khác nên luôn truyền `message` cho hai hộp thoại này.

## Tuỳ biến giao diện

Token riêng của modal (đặt trong `:root` hoặc một selector hẹp hơn, xem [theming](../customization/theming.md)):

| Token | Mặc định | Tác dụng |
|---|---|---|
| `--td-modal-w-xs` … `--td-modal-w-5xl` | `20rem`, `24rem`, `32rem`, `42rem`, `48rem`, `56rem`, `64rem`, `72rem`, `80rem` | Bề rộng tối đa theo `size`. |
| `--td-modal-w-full` | `100%` | Bề rộng của `size: 'full'`. |
| `--td-modal-gap` | `var(--td-space-md)` | Khoảng cách từ dialog tới mép màn hình. |
| `--td-modal-radius` | `var(--td-glass-radius)` | Bo góc dialog. |
| `--td-modal-sheet-radius` | `24px` | Bo góc trên của bottom sheet (< 720px; trước 0.34.0: ≤ 640px). |
| `--td-modal-pad-x` | `var(--td-space-lg)` | Padding ngang header / body / footer. |
| `--td-modal-pad-y` | `var(--td-space-md)` | Padding dọc của body. |
| `--td-modal-enter-dur` | `300ms` | (0.22.1, trước là `260ms`) Thời lượng **transform** khi hiện (phóng từ `scale(0.95)` / sheet trượt lên). |
| `--td-modal-enter-ease` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | (0.22.1) Đường cong transform khi hiện — kiểu lò xo, vượt nhẹ quá 1 rồi về. |
| `--td-modal-fade-dur` | `200ms` | (0.22.1) Thời lượng **mờ dần** (opacity) khi hiện. |
| `--td-modal-fade-ease` | `var(--td-modal-ease)` | (0.22.1) Đường cong opacity khi hiện. |
| `--td-modal-ease` | `cubic-bezier(0.25, 0.46, 0.45, 0.94)` | Tên cũ (0.21.0, khi đó là đường cong chung lúc hiện). Từ 0.22.1 là đường cong **mờ dần** (`--td-modal-fade-ease` lấy từ nó); site đã ghi đè vẫn có tác dụng lên phần opacity. Đường cong transform giờ là `--td-modal-enter-ease`. |
| `--td-modal-exit-dur` | `200ms` | (0.22.1, trước là `180ms`) Thời lượng transform khi ẩn (thu về `scale(0.95)`). Đặt dài hơn thì kit chờ đủ rồi mới gỡ khỏi DOM. |
| `--td-modal-exit-fade-dur` | `150ms` | (0.22.1) Thời lượng mờ dần khi ẩn — cả dialog lẫn scrim. |
| `--td-modal-exit-ease` | `cubic-bezier(0.4, 0, 0.2, 1)` | (0.22.1, trước là ease-in) Đường cong khi ẩn (transform, opacity, scrim). |
| `--td-modal-scrim-dur` / `--td-modal-scrim-ease` | `120ms` / `ease-out` | (0.22.1, trước là `240ms` / `ease-in-out`) Scrim mờ dần khi hiện. |
| `--td-modal-sheet-ease` | `cubic-bezier(0.32, 0.72, 0, 1)` | (0.22.1) Đường cong sheet trượt lên trên điện thoại — không vượt (vượt sẽ hở khe dưới đáy). |
| `--td-modal-enter-from` | `scale(0.95)` | (0.22.1, trước là `translateY(12px) scale(0.98)`) Tư thế bắt đầu của dialog (desktop). `none` = chỉ mờ dần. Modal toàn màn hình luôn là `none`. |

Token dùng chung có ảnh hưởng: `--td-z-modal` (`400`), `--td-glass-scrim` (màu lớp phủ nền, không làm mờ),
các token bề mặt (`--td-glass-solid`, `--td-glass-border`, `--td-glass-shadow-lg`, `--td-glass-fg`).

Custom property **theo từng modal** — kit ghi bằng CSSOM từ tuỳ chọn JS lên `.td-modal__dialog`; đừng tự đặt trong CSS
chung trừ khi bạn muốn áp cho mọi modal:

| Property | Từ tuỳ chọn |
|---|---|
| `--td-modal-w` | `width` |
| `--td-modal-h` | `height` |
| `--td-modal-body-pad` | `bodyPadding` |
| `--td-modal-body-overflow` | `bodyOverflow` |

```css
/* Modal rộng hơn một chút cho toàn site, sheet ít bo hơn */
:root {
  --td-modal-w-md: 36rem;
  --td-modal-sheet-radius: 16px;
}
```

Giao diện (0.20.0, minimal surfaces): dialog **nền đặc** `--td-glass-solid` (trắng / `#1c1c1e` ở dark), viền mảnh
`--td-glass-border`, một bóng mềm `--td-glass-shadow-lg`, không blur; scrim phía sau không làm mờ.
Tương phản cao → nền `--td-color-surface`, viền rõ, không bóng.

**Chuyển động (0.22.1, mang từ dcms-modal sang):**

- **Mở:** scrim mờ dần 0 → 1 trong 120ms (`ease-out`); dialog mờ dần trong 200ms
  (`cubic-bezier(0.25, 0.46, 0.45, 0.94)`) và phóng từ `scale(0.95)` về kích thước thật trong 300ms với đường cong lò
  xo `cubic-bezier(0.34, 1.56, 0.64, 1)` (vượt nhẹ ~1–2% rồi về — cảm giác "bật" như dcms).
- **Đóng:** thu về `scale(0.95)` trong 200ms, mờ dần (dialog + scrim) trong 150ms, cùng đường cong
  `cubic-bezier(0.4, 0, 0.2, 1)`. Kit đọc transition dài nhất trong computed style rồi mới gỡ modal khỏi DOM.
- **Điện thoại (< 720px — 0.34.0, trước đó ≤ 640px):** bottom sheet vẫn trượt từ dưới lên (300ms, `--td-modal-sheet-ease`, không vượt) và mờ dần
  200ms; khi đóng trượt xuống 200ms / mờ 150ms.
- **Toàn màn hình (`fullViewport`):** chỉ mờ dần.
- **`prefers-reduced-motion: reduce`:** chỉ mờ dần 120ms (`linear`), không trượt, không scale; khi đóng kit chờ hết lần mờ dần đó (đọc từ computed style) rồi mới gỡ modal.
- **Trang không bị giật ngang (0.22.1):** khi modal mở, trang bị khoá cuộn (`overflow: hidden` trên `<html>`). Với
  thanh cuộn kiểu cổ điển (Windows, macOS bật "luôn hiện thanh cuộn") việc này từng làm mất thanh cuộn → cả trang và
  modal nhảy ngang ~15px giữa animation. Giờ kit giữ chỗ cho thanh cuộn: `scrollbar-gutter: stable` trên `<html>`;
  nếu trình duyệt không hỗ trợ hoặc không giữ được (ví dụ site tự style `::-webkit-scrollbar`) thì cộng bề rộng thanh
  cuộn vào `padding-inline-end` của `<html>` và đặt `--td-scroll-lock-gap` (modal dùng nó để giữ nguyên vị trí).
  Giá trị inline cũ của site trên `<html>` được trả lại y nguyên khi đóng modal cuối cùng.

Đây là ngoại lệ có chủ ý với luật "không scale trang trí" của minimal surfaces — chỉ áp cho modal. Logic trạng thái
(`data-state="opening|open|closing"`) không đổi; chỉ có CSS. Muốn modal chỉ mờ dần (không phóng):

```css
:root { --td-modal-enter-from: none; }
/* Muốn phóng êm, không vượt (không "bật" lò xo): */
:root { --td-modal-enter-ease: cubic-bezier(0.4, 0, 0.2, 1); }
```

## Cấu trúc DOM & class

Mỗi modal đang mở là một phần tử gắn thẳng vào `<body>`:

```html
<div id="td-modal-…" class="td-modal td-modal--md" data-state="open">
  <div class="td-modal__backdrop" aria-hidden="true"></div>
  <div class="td-modal__dialog td-glass-surface td-glass-surface--strong td-glass-surface--lg"
       role="dialog" aria-modal="true" aria-labelledby="td-modal-…-title" tabindex="-1">
    <div class="td-modal__header">
      <h2 class="td-modal__title" id="td-modal-…-title">Tiêu đề</h2>
      <button type="button" class="td-modal__close" aria-label="Đóng">
        <span class="td-modal__close-icon" data-td-icon="close" aria-hidden="true"><svg class="td-icon td-icon--m" data-icon="close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></span>
      </button>
    </div>
    <div class="td-modal__body">…</div>
    <div class="td-modal__footer">…nút .td-btn…</div>
  </div>
</div>
```

| Class / attribute | Ý nghĩa |
|---|---|
| `.td-modal--{xs…5xl\|full}` | Size. |
| `.td-modal--viewport` | `fullViewport: true`. Cao `100dvh` (không dùng `vh`). |
| `[data-state="opening\|open\|closing"]` | Vòng đời. Modal `closing` không nhận click, dialog của nó có `inert`; phần tử bị gỡ sau ~220ms (reduced motion: sau lần mờ dần 120ms). |
| `[data-covered]` | Có modal khác chồng lên trên → dialog chuyển nền đặc. |
| `.td-modal__header[hidden]`, `.td-modal__close[hidden]`, `.td-modal__footer[hidden]` | Ẩn theo `showHeader`, `closable`, footer rỗng. |
| `role="alertdialog"` + `aria-describedby="{id}-message"` | Trên các hộp thoại Promise (`confirm`, `success`, `error`, `info`). |
| `.td-modal__message`, `.td-modal__message--{success\|error\|info}`, `.td-modal__icon`, `.td-modal__text` | Khối nội dung của hộp thoại Promise. |

Chỉ `.td-modal__body` cuộn; header và footer luôn đứng yên. Trên màn hình < 720px (0.34.0; trước đó ≤ 640px) modal thường thành bottom sheet — `fullViewport` thì luôn phủ kín (không có cử
chỉ kéo), trừ `fullViewport`. Khi modal mở, trang được khoá cuộn (một khoá cho cả chồng, đặt trên `<html>` và khôi phục
đúng giá trị `overflow` cũ).

**Safe area của `fullViewport` (0.33.0).** Trên máy có tai thỏ / thanh home (cần `<meta name="viewport"
content="…, viewport-fit=cover">` thì inset mới khác 0), `.td-modal--viewport` **cộng** inset vào padding gốc chứ không
thay: header `padding-top: calc(var(--td-space-sm) + env(safe-area-inset-top, 0px))`, footer `padding-bottom` tương tự
với inset dưới, header / footer hai bên `calc(var(--td-modal-pad-x) + env(safe-area-inset-left|right, 0px))`. Body chỉ
nhận inset trái / phải (không cộng `--td-modal-pad-x`), và chỉ khi không đặt `bodyPadding` (`bodyPadding` vẫn thắng).
Inset bằng 0 (máy tính, đa số trình duyệt) → padding y như trước.

Kit không đọc markup server-render cho modal — modal luôn do JS dựng. Nếu cần nội dung soạn sẵn ở phía server, đặt nó
trong `<template>` rồi truyền `template.content.cloneNode(true)` làm `body`.

## Bàn phím & trợ năng

- **Mở:** focus vào dialog ngay lập tức, rồi (sau khi bố trí xong) chuyển tới: `focusTarget` → field đầu tiên trong
  body (`input`, `textarea`, `select` không disabled) → phần tử focus được đầu tiên không phải nút X → nút X → chính
  dialog. `autoFocus: false` → chính dialog. `confirm` → nút Hủy.
- **Tab / Shift+Tab:** bị giữ trong dialog (focus bị kéo lại nếu lọt ra ngoài). Nút đóng của [toast](toast.md) đang hiện
  cũng nằm trong vòng Tab, để toast không bị "kẹt" sau modal.
- **Escape:** mặc định **không làm gì** nhưng bị modal "nuốt" — không lọt xuống lightbox hay lớp dưới. Với
  `escapeCloses: true`, Escape đóng modal (trừ khi đang bận). Nếu có lớp cao hơn đang mở bên trong modal (menu dropdown,
  tooltip) thì Escape đóng lớp đó trước.
- **Nền:** mọi thứ bên dưới (trang, modal thấp hơn, lightbox) bị `inert` — không click, không focus, trình đọc màn hình
  bỏ qua. Dropdown, menu, tooltip, toast mở ra từ bên trong modal vẫn dùng được.
- **Đóng:** focus trả về phần tử đã mở modal (nếu modal này đang ở trên cùng), **trước** khi `onClose` chạy. Nếu phần tử
  đó không còn, focus về dialog đang ở trên cùng. Đóng một modal ở dưới thì focus không bị xê dịch. `closeAll()` → focus
  về opener của modal dưới cùng.
- **Tên:** dialog được đặt tên bởi `<h2>` tiêu đề (`aria-labelledby`), hoặc `aria-label` = `title` khi
  `showHeader: false`. Hộp thoại Promise có `aria-describedby` trỏ tới nội dung.
- Trên thiết bị cảm ứng (`pointer: coarse`) nút X có vùng chạm tối thiểu `--td-touch-min`.
- Forced colors (Windows High Contrast): viền header/footer, nút X, icon dùng màu hệ thống.

### Vì sao không đóng khi click nền hoặc Escape

Đây là lựa chọn có chủ đích ([ADR 0006](../internal/decisions/0006-modal-no-backdrop-close.md)): modal thường chứa form
đang nhập dở, và một cú click nhầm ra ngoài hay một lần bấm Escape sẽ làm mất dữ liệu. Vì vậy modal chỉ đóng qua nút X,
nút footer, hoặc `close` / `closeById` / `closeAll`. `escapeCloses` là ngoại lệ cho những hộp thoại mà đóng không mất gì
(bộ chọn ngày giờ dùng nó). Click nền **không bao giờ** đóng modal, kể cả khi bật `escapeCloses`. Ngược lại,
[lightbox](lightbox.md) đóng khi click nền vì nó chỉ là trình xem ảnh.

## Bảo mật

| Nơi nhận nội dung | Cách render | Được đưa dữ liệu người dùng? |
|---|---|---|
| `title`, `message`, `label` của action, `confirmText`, `cancelText`, `okText` | text (`textContent`) | Có |
| `body` dạng `Node` | gắn nguyên node | Có (miễn là bạn tự tạo node bằng DOM API / `textContent`) |
| `body` dạng `string` | `innerHTML` | **Không** — cửa HTML tin cậy |
| `messageHtml` | `innerHTML` | **Không** — cửa HTML tin cậy |
| `width`, `height`, `bodyPadding` | CSSOM, kiểm tra bằng `CSS.supports`, cấm `url()` / `var()` | Không nên (chỉ giá trị của developer) |

Nếu cần hiển thị dữ liệu người dùng có định dạng, hãy dựng node bằng `document.createElement` + `textContent`, hoặc
escape theo ngữ cảnh trước (xem [hướng dẫn bảo mật](../guides/security.md)). Modal không dùng `style="…"` hay chèn
`<style>` nên chạy được dưới CSP nghiêm ngặt.

## Lưu ý & lỗi thường gặp

- **Popup trong modal (0.21.1):** modal mới mở bằng code (timer, hết phiên…) đóng mọi dropdown / menu / hovercard
  / tooltip đang mở của lớp dưới — không còn popup nổi trên modal mới, focus và Escape thuộc modal mới. Modal đóng → các
  popup trong nó đóng ngay; focus đang ở ô tìm kiếm của dropdown vẫn được trả về opener của modal.
- **Lightbox mở từ trong modal (0.21.1)** nằm trên modal và dùng được (bàn phím, focus); đóng → modal dùng lại bình
  thường. Modal mở từ lightbox đó lại nằm trên lightbox. Lớp mở sau thắng (z-index CSSOM = z-index thực của lớp dưới +
  1, theo đúng token `--td-z-*` site đã đổi và `TdModalStackManager.BASE_Z_INDEX`); loading / toast / tooltip / popup
  vẫn ở trên.
- **Node truyền vào `body` bị "chuyển" vào modal và bị xoá cùng modal khi đóng.** Nếu bạn lấy một phần tử đang có trên
  trang (`document.querySelector('#form')`), nó sẽ biến mất khỏi trang sau khi đóng. Hãy tạo node mới hoặc clone từ
  `<template>`.
- **Đổi hành vi 0.16.0 — `onConfirm` đồng bộ trả `false` hoặc ném lỗi giữ hộp thoại mở** (giống `onClick` của
  `actions`; lỗi được ghi `console.error`). Trước 0.16.0 hai trường hợp này resolve `true` và đóng. `confirm()` chỉ
  resolve khi người dùng xác nhận thành công hoặc huỷ / đóng, nên code dựa vào "ném lỗi vẫn đóng" cần sửa lại.
- **`closable: false` không làm modal "không đóng được"** — nó chỉ ẩn nút X. Hãy luôn cho người dùng ít nhất một nút
  footer để thoát.
- **`bodyPadding: 16` (số) bị từ chối** với `console.warn`; viết `'16px'` hoặc `'1rem'`.
- **Kiểm tra `console.warn` khi `width`/`height` không có tác dụng** — giá trị bị loại vì không hợp lệ hoặc chứa `var()`.
- **`onShow` không chạy nếu modal bị đóng ngay trong cùng khung hình** mở nó.
- Z-index: mọi modal dùng chung `--td-z-modal` (400) và xếp theo thứ tự DOM. Nếu site có header cố định với z-index
  lớn hơn 400, hãy nâng **cả bộ** token `--td-z-*` thay vì dùng `TdModalStackManager.BASE_Z_INDEX`.
- [Loading](loading.md) (`--td-z-loading` 480) phủ lên trên modal; [toast](toast.md) (500) và [tooltip](tooltip.md)
  (510) hiện trên cả hai.

## Xem thêm

- [Lớp nổi, inert và bàn phím](../concepts/how-it-works.md)
- [Hook & callback theo component](../customization/hooks.md)
- [Theming (token, bề mặt, dark)](../customization/theming.md) · [Styling & override CSS](../customization/styling.md)
- [Trợ năng](../guides/accessibility.md) · [Bảo mật](../guides/security.md) · [CSP](../guides/csp.md)
- [Button](button.md) (class `.td-btn` dùng cho footer tự dựng) · [Datetime picker](datetime-picker.md) (ví dụ `escapeCloses`)
