[Tài liệu](../README.md) › [Components](README.md) › Toggle

# Toggle (switch) — `<td-toggle>`

Công tắc bật/tắt, dựa trên `<input type="checkbox" role="switch">` native, tham gia `<form>` được. Dùng cho cài đặt có
hiệu lực ngay (bật thông báo, bật chế độ…), có thể kèm lưu lên server ngay bằng `commit()`. Nếu lựa chọn chỉ có hiệu
lực khi bấm "Lưu" hay "Gửi" (ví dụ đồng ý điều khoản trong form), dùng [checkbox](checkbox.md).

| | |
|---|---|
| Import | `import '@dazzxq/td-components/toggle';` (class: `import { TdToggle } from '@dazzxq/td-components';`) |
| Loại | Custom element |
| Form-associated | có |
| Từ phiên bản | 0.1.0 (mặc định uncontrolled từ 0.2.0, input native `role="switch"` từ 0.7.0, `commit()` từ 0.13.0, hydrate SSR tại chỗ từ 0.26.0, `tone` / `locked` từ 0.52.0, host `inline-flex` căn giữa cạnh chữ từ 0.53.2) |

Cần `td.css` trên trang (xem [Cài đặt](../getting-started/installation.md)).

## Ví dụ nhanh

```html
<td-toggle name="notifications" label="Nhận email thông báo" checked></td-toggle>

<script type="module">
  import '@dazzxq/td-components/toggle';
</script>
```

## Cách dùng

### Uncontrolled (mặc định): công tắc tự đổi

```html
<td-toggle id="dark" label="Chế độ tối"></td-toggle>
```

```js
document.getElementById('dark').addEventListener('change', (e) => {
  console.log('Bây giờ đang', e.detail.checked ? 'bật' : 'tắt');
});
```

Người dùng bấm → công tắc tự đổi trạng thái, attribute `checked` được cập nhật, rồi phát một event `change` với trạng
thái mới.

### Controlled: trang quyết định có đổi hay không

Thêm `controlled`: bấm vào công tắc **không** tự đổi, chỉ phát `change` với trạng thái **được yêu cầu**. Code của bạn
tự đặt `checked` nếu chấp nhận.

```html
<td-toggle id="beta" controlled label="Dùng thử tính năng beta"></td-toggle>
```

```js
const t = document.getElementById('beta');
t.addEventListener('change', (e) => {
  if (confirm('Bật tính năng beta?')) {
    t.checked = e.detail.checked; // chấp nhận
  }
  // không làm gì = từ chối, công tắc giữ nguyên
});
```

Chấp nhận đồng bộ ngay trong handler (như trên) hay sau đó đều được; kit tự đồng bộ lại input bên trong.

### Lưu lên server ngay: `commit()`

`commit(fn, next?)` là cách "lạc quan" (optimistic): công tắc đổi **ngay** sang trạng thái mới, hiện trạng thái chờ
trong lúc `fn` chạy, rồi giữ nguyên nếu thành công hoặc **tự quay lại** nếu thất bại.

```html
<td-toggle id="notify" controlled label="Nhận thông báo"></td-toggle>
```

```js
import '@dazzxq/td-components/toggle';
import { TdToast } from '@dazzxq/td-components/toast';

const t = document.getElementById('notify');

t.addEventListener('change', (e) => {
  t.commit(async (next) => {
    const res = await fetch('/api/settings/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: next }),
    });
    return res.ok; // trả về false → công tắc quay lại trạng thái cũ
  }, e.detail.checked);
});

t.addEventListener('commit-error', (e) => {
  TdToast.error('Không lưu được cài đặt, vui lòng thử lại.');
  console.warn('Đã quay về', e.detail.checked, e.detail.error);
});
```

Quy tắc của `commit(fn, next?)`:

- `next` là trạng thái muốn đặt (boolean). Bỏ qua hoặc không phải boolean → đảo trạng thái hiện tại.
- Ngay khi gọi: đặt `checked = next`, bật trạng thái chờ (input có `aria-busy="true"`, khối `.td-switch` có
  `data-pending`, núm công tắc nhấp nháy mờ). Trong lúc chờ, **mọi thao tác bấm bị bỏ qua** (không đổi, không phát
  `change`).
- `fn(next)` được gọi sau một microtask. Nó có thể trả giá trị thường hoặc Promise.
- Kết quả **bất kỳ khác `false`** (kể cả `undefined`) = thành công: giữ `next`.
- Kết quả đúng bằng `false` → quay về trạng thái cũ, phát `commit-error` với `{ checked: previous, error: null }`.
- `fn` ném lỗi / Promise reject → quay về trạng thái cũ, phát `commit-error` với `{ checked: previous, error }`.
- Với `fn` hợp lệ, Promise trả về của `commit()` **resolve** (không reject) với trạng thái cuối cùng (`true`/`false`)
  kể cả khi `fn` thất bại — lỗi được báo qua event `commit-error`. Ngoại lệ duy nhất: `fn` không phải hàm → reject
  (xem dưới).
- Gọi `commit()` khi đang chờ (kể cả gọi lồng bên trong `fn`) trả về **đúng Promise đang chờ**, `fn` không chạy lần
  hai.
- `commit()` không tự phát thêm `change`.
- `fn` không phải hàm → Promise bị reject với `TypeError('TdToggle.commit: a function is required')`.
- Trạng thái chờ vẫn giữ nếu công tắc bị render lại giữa chừng (đổi `label`, `size`…).

**Dùng `commit()` với toggle `controlled`** (như ví dụ). Với toggle uncontrolled, lúc handler `change` chạy thì công
tắc đã tự đổi sang trạng thái mới, nên `commit(fn, e.detail.checked)` ghi nhận "trạng thái cũ" chính là trạng thái mới:
khi lưu thất bại nó **không quay lại** được trạng thái trước khi bấm. (Gọi `commit()` bằng code, không qua cú bấm,
thì chạy đúng với cả hai chế độ.)

### Trong form

```html
<form id="prefs">
  <td-toggle name="newsletter" label="Nhận bản tin"></td-toggle>            <!-- gửi "on" khi bật -->
  <td-toggle name="mode" value="compact" label="Giao diện gọn"></td-toggle>  <!-- gửi "compact" khi bật -->
  <td-toggle name="tos" required label="Bật để đồng ý"></td-toggle>
</form>
```

- Bật: gửi `name=value` (`value` mặc định `on`). Tắt: không gửi gì.
- `required` + đang tắt → `valueMissing`, thông báo `Vui lòng bật tùy chọn này.` (`TdToggle.messages.valueMissing`,
  đổi được cho cả trang), chặn submit.
- Reset form: trả `checked` và `value` về như lúc gắn vào trang, xoá lỗi.
- `<fieldset disabled>` bao ngoài làm công tắc disabled (không gửi), không đổi attribute `disabled`.
- Trình duyệt khôi phục form (quay lại trang không qua bfcache): trạng thái bật/tắt được đặt lại đúng, attribute
  `value` giữ nguyên (0.16.0).

### Căn dọc cạnh chữ (0.53.2)

Host `<td-toggle>` là `inline-flex` + `vertical-align: middle`: **hộp host đúng bằng hộp công tắc** (trước 0.53.2 host là
`inline-block` nên có thêm khoảng chữ thòng bên dưới — md cao 29 px cho công tắc 24 px — và công tắc bị đẩy lên 2.5 px trong
hàng flex, ~6.5 px trên một dòng chữ thường). Không cần CSS riêng:

```html
<!-- trong ô bảng / hàng flex: công tắc và chữ cùng tâm -->
<div class="status">  <!-- display: inline-flex; align-items: center; gap: 8px -->
  <td-toggle controlled aria-label="Trạng thái gói A" checked></td-toggle><span>Đang dùng</span>
</div>

<!-- trên một dòng chữ: công tắc nằm giữa dòng -->
<p>Trạng thái: <td-toggle controlled aria-label="Trạng thái gói B" checked></td-toggle> Đang dùng</p>
```

- Áp cho mọi cỡ (`sm` / `md` / `lg`), có hay không có `label`, bảng hay dạng card của `td-table`, và cho công tắc PHP
  `td_toggle()` ở chế độ native (`label.td-switch` cũng `vertical-align: middle`).
- Site từng bù lệch bằng CSS riêng (`margin-top: -4px`, `position: relative; top: …` trên `td-toggle`) → **gỡ bỏ**.
- Trên cảm ứng hộp vẫn ≥ 44 px (vùng chạm), căn giữa như trên.

### Màu, kích thước, lỗi

```html
<td-toggle size="sm" label="Nhỏ"></td-toggle>
<td-toggle size="lg" label="Lớn" color="#7c3aed" checked></td-toggle>
<td-toggle label="Đồng bộ" error-text="Không thể bật khi đang offline"></td-toggle>
```

```js
t.setColor('#0ea5e9');          // đổi màu "bật" lúc chạy (= setAttribute('color', …)), không render lại
t.setError('Không thể bật khi đang offline');
t.clearError();
```

Chọn màu `color` tự kiểm tra tương phản: nền bật phải ≥ 3:1 với nền trang, và núm trắng phải nhìn rõ trên nó.

### Màu theo trạng thái: `tone` (0.52.0)

```html
<td-toggle label="Bắt buộc 2FA" tone="warning" checked></td-toggle>  <!-- bật, đang chờ: rãnh cam + đồng hồ -->
<td-toggle label="Bắt buộc 2FA" tone="success" checked></td-toggle>  <!-- bật, đã xong: rãnh xanh + dấu tích -->
```

- `tone="success"` / `"warning"` chỉ tô trạng thái **bật**; khi tắt rãnh vẫn xám như mọi công tắc — không cần gỡ `tone`
  khi tắt. Giá trị khác (hoặc không có) → công tắc mặc định.
- Màu lấy từ hợp đồng theme: rãnh = `--td-color-success` / `--td-color-warning`, núm = `--td-color-on-status`. Bộ sinh
  palette giữ các cặp này ≥ 4.7:1, nên rãnh vs nền trang và núm vs rãnh luôn ≥ 3:1 ở sáng, tối, theme theo vùng và
  palette tự sinh. Ở **tối**, núm của công tắc có tone là núm **tối** (mực `on-status` của theme tối) trên rãnh sáng — có
  chủ đích (núm trắng trên cam sáng chỉ 2.15:1).
- **Không chỉ bằng màu:** `warning` đổi dấu tích trên núm thành **đồng hồ** (người mù màu vẫn phân biệt "chờ" và "xong"),
  và trình đọc màn hình nghe thêm **chữ trạng thái** khi công tắc bật: `status-text` nếu có, không thì
  `TdToggle.messages.statusSuccess` ("Đã xác nhận") / `statusWarning` ("Đang chờ"). Chữ nằm trong một `span` ẩn trực
  quan **ngoài** `<label>` (không nhập vào tên), nối qua `aria-describedby` của input — chỉ khi đang bật.
- `status-text` dùng được cả **không** có `tone` (mô tả khi bật của công tắc thường). Tối đa 200 ký tự (cắt).
- `color` **thắng** phần màu (rãnh theo `color`, núm trắng mặc định); `tone` vẫn cho icon + chữ trạng thái. Đừng đặt cả
  hai — site dùng `setColor('#f59e0b')` (như dcms2) nên chuyển sang `tone`.
- Đổi `tone` / `status-text` lúc chạy là **vá tại chỗ** (không render lại, input đang focus vẫn focus).

### Khoá: `locked` + `locked-reason` (0.52.0)

```html
<td-toggle name="tfa" label="Bắt buộc 2FA" checked locked locked-reason="Chính sách công ty bắt buộc 2FA cho quản trị viên"></td-toggle>
```

`locked` đóng băng **trạng thái hiện tại** (bật hoặc tắt) với **người dùng** — khác `disabled`:

| | `disabled` | `locked` |
|---|---|---|
| Tab / focus | không | **có** |
| Gửi trong form | không | **có** (`name=value` khi bật) |
| Kiểm tra `required` | bỏ qua | như thường |
| Chuột, chạm, Space, `<label>` | không | **không đổi** |
| Event `change` | không | **không bao giờ** |
| `commit()` | — | **bỏ qua**: trả `Promise` resolve trạng thái hiện tại, `fn` không chạy, không event |
| Code (`el.checked = …`, `form.reset()`) | được | **được** |
| Hình | mờ | không mờ, **ổ khoá** trên núm, con trỏ `not-allowed`, không hover / hình nhấn |
| Trình đọc màn hình | "mờ" | `aria-readonly="true"` + mô tả **"Không thể thay đổi: {lý do}"** |

- Mô tả khoá = `TdToggle.messages.locked` ("Không thể thay đổi") + `": "` + `locked-reason` (không có lý do → chỉ tiền
  tố). Mô tả **mang chính trạng thái khoá**: Chromium chưa xuất `aria-readonly` cho checkbox / switch ra cây trợ năng, nên
  không dựa vào nó một mình (vẫn đặt `aria-readonly`).
- Ưu tiên: `disabled` (host hoặc fieldset) > `locked` > đang chờ `commit()` > `controlled`. Gắn `locked` khi `commit()`
  đang chờ: lần lưu đó vẫn chạy hết (kể cả quay lại khi lỗi).
- `required` + khoá ở trạng thái **tắt** = form không bao giờ hợp lệ — lỗi cấu hình của app.
- `locked` / `locked-reason` đổi lúc chạy là vá tại chỗ.
- **Khoá là UI, không phải kiểm soát truy cập.** Trước khi module tải (và khi tắt JS) control là checkbox native:
  checkbox không có `readonly`, CSP cấm `onclick`, còn `disabled` thì mất focus **và** mất khỏi form — nên Space và
  `<label for>` ngoài **vẫn lật được** trong khoảng đó (kit chỉ chặn chuột / chạm trên chính công tắc bằng
  `pointer-events`). **Server phải bỏ qua / từ chối thay đổi của field đang khoá** khi nhận form.

### Công thức: cột 2FA trong danh sách người dùng (0.52.0)

Ba trạng thái: **tắt** (không bắt buộc) · **bật + chờ** (admin đã bật, người dùng chưa quét QR) · **bật + xong** (đã
thiết lập). Tắt cần xác nhận + mã OTP mới; lỗi thì công tắc tự quay lại. Không cần API mới: `controlled` + `commit()`.

```html
<td-toggle id="tfa-7" controlled size="sm" aria-label="Bắt buộc 2FA cho nguyenvana" tone="warning" checked
  status-text="Chờ người dùng quét mã QR khi đăng nhập"
  data-tooltip="Đã bật 2FA — chờ người dùng quét mã QR khi đăng nhập"></td-toggle>
```

```js
import '@dazzxq/td-components/toggle';
import '@dazzxq/td-components/tooltip';
import { TdModal } from '@dazzxq/td-components/modal';

const WAIT = 'Đã bật 2FA — chờ người dùng quét mã QR khi đăng nhập';
const DONE = '2FA đã thiết lập — người dùng nhập mã khi đăng nhập';
const t = document.getElementById('tfa-7');

t.addEventListener('change', async (e) => {
  if (e.detail.checked) {
    // BẬT: lạc quan — tone đặt TRƯỚC commit → khung đầu tiên đã cam (không nháy xanh)
    t.tone = 'warning';
    t.statusText = WAIT;
    t.dataset.tooltip = WAIT;
    t.commit(() => api.post(`/users/7/totp/enable`).then((r) => r.ok)); // false / lỗi → tự tắt lại + commit-error
    return;
  }
  // TẮT: hỏi trước. controlled → công tắc CHƯA đổi, huỷ thì không cần "trả lại"
  const ok = await TdModal.confirm({
    title: 'Tắt xác thực 2FA',
    message: 'Người dùng sẽ không cần nhập mã 2FA khi đăng nhập nữa.',
    confirmText: 'Tắt 2FA',
    confirmVariant: 'danger',
  });
  if (!ok) return;
  // OTP mới (step-up) do API của site đòi — xem otp-input.md mục "Xác thực lại trong modal"
  t.commit(() => fetchWith2FA(`/users/7/totp/disable`, { method: 'POST' }).then((r) => r.ok));
});
t.addEventListener('commit-error', () => showError('Không lưu được thay đổi 2FA')); // toast của site

// Khi server báo người dùng đã quét QR (tải lại danh sách / push): xanh + dấu tích
function markVerified() { t.tone = 'success'; t.statusText = DONE; t.dataset.tooltip = DONE; }
```

- Tắt thành công → `tone` không cần gỡ (rãnh tắt luôn xám); lần bật sau lại đặt `tone="warning"`.
- `data-tooltip` (component [tooltip](tooltip.md)) đặt thẳng trên `<td-toggle>`: hiện khi rê chuột **và** khi Tab vào
  công tắc (đã kiểm ở Chromium / Firefox / WebKit). Tooltip **không** hiện khi chạm (chuẩn cảm ứng): thông tin bắt buộc đã
  nằm ở icon (đồng hồ / dấu tích) + chữ trạng thái cho trình đọc màn hình; trên màn chạm, hiện thêm badge / chữ trong hàng
  nếu cần.
- Chính sách bắt buộc 2FA cho một người (không cho admin tắt): `locked locked-reason="…"` — và server từ chối tắt.
- PHP: `td_toggle('tfa', true, '', ['id' => 'tfa-7', 'aria_label' => …, 'size' => 'sm', 'tone' => 'warning',
  'status_text' => …, 'attrs' => ['data-tooltip' => …]])` (luôn ra `<td-toggle>`, xem
  [adapter PHP](../guides/php-adapter.md#td_toggle-và-td_checkbox)); `controlled` không phải option PHP — bật bằng JS
  trước khi nghe `change`: `t.controlled = true` (host PHP có id `tfa-7-host`).

## Attribute

| Attribute | Kiểu | Mặc định | Mô tả |
|---|---|---|---|
| `checked` | boolean | không | Đang bật. Tự cập nhật khi người dùng bấm (uncontrolled). Lúc gắn vào trang là trạng thái mặc định khi reset. |
| `controlled` | boolean | không | Chỉ phát `change`, **không** tự đổi trạng thái. |
| `value` | string | `on` (khi không có attribute) | Giá trị gửi đi khi bật. |
| `name` | string | — | Tên trường trong form. |
| `required` | boolean | không | Bắt buộc bật. |
| `disabled` | boolean | không | Tắt control (cũng qua `<fieldset disabled>`). |
| `label` | string | — | Nhãn hiển thị cạnh công tắc. |
| `aria-label` | string | — | Tên truy cập khi không có `label`. |
| `size` | string | `md` | `sm` \| `md` \| `lg` (rãnh 36×20 / 44×24 / 56×28 px). Khác → `md`. |
| `color` | string (màu CSS) | `--td-switch-on` (#16a34a) | Màu rãnh khi bật, riêng phần tử này (qua `safeColor`). |
| `error-text` | string | — | Dòng lỗi (error contract). |
| `tone` | `success` \| `warning` | — | 0.52.0: màu rãnh khi bật + icon núm (✓ / đồng hồ) + chữ trạng thái mặc định. Khác → bỏ qua. |
| `status-text` | string | — | 0.52.0: mô tả khi **bật** (thay chữ mặc định của `tone`; dùng được không cần `tone`). ≤ 200 ký tự. |
| `locked` | boolean | không | 0.52.0: người dùng không đổi được; vẫn focus, vẫn gửi, không `change`. |
| `locked-reason` | string | — | 0.52.0: lý do; mô tả = `messages.locked` + `": "` + lý do. ≤ 200 ký tự. |
| `id` | string | tự sinh `td-td-toggle-{n}` | Tự gán nếu thiếu. |

## Property & method

Property phản chiếu attribute: `checked`, `controlled` (boolean), `value`, `name`, `required`, `disabled`, `label`,
`ariaLabel`, `size`, `color`, `errorText`, `tone`, `statusText`, `locked` (boolean), `lockedReason` (0.52.0). `value` trả
`''` khi không có attribute.

`TdToggle.messages` (đổi được cho cả trang): `valueMissing` ("Vui lòng bật tùy chọn này."), `statusSuccess`
("Đã xác nhận"), `statusWarning` ("Đang chờ"), `locked` ("Không thể thay đổi") — 0.52.0.

> Gán property trước khi phần tử gắn vào trang (hoặc trước khi module được import) vẫn có tác dụng từ 0.16.0: giá
> trị được áp khi phần tử kết nối lần đầu. Chi tiết: [Cách hoạt động](../concepts/how-it-works.md).

| Method / property | Trả về | Mô tả |
|---|---|---|
| `commit(fn: (next: boolean) => any, next?: boolean)` | `Promise<boolean>` | Lưu lạc quan (xem trên). Resolve với trạng thái cuối. (0.13.0) Đang `locked`: resolve trạng thái hiện tại, `fn` không chạy (0.52.0). |
| `setColor(color: string)` | `void` | Đặt attribute `color` (cập nhật tại chỗ). |
| `setError(message: string)` / `clearError()` | `void` | Error contract. |
| `errorMessage` | `string` (chỉ đọc) | Lỗi đang hiện. |
| `focus(options?)` | `void` | Focus input bên trong. |
| `setCustomValidity(message)` | `void` | Lỗi custom chặn submit; `''` để gỡ. |
| `checkValidity()` / `reportValidity()` | `boolean` | Như native. |
| `form`, `validity`, `validationMessage`, `willValidate`, `labels` | — | Như native (chỉ đọc). |

## Event

| Event | detail | Khi nào | bubbles? |
|---|---|---|---|
| `change` | `{ checked: boolean }` | Người dùng bật/tắt. Uncontrolled: trạng thái mới. Controlled: trạng thái **được yêu cầu** (chưa áp dụng). Đúng một event mỗi lần; không phát khi đổi bằng code, khi disabled hoặc khi đang chờ `commit()`. | có (composed) |
| `commit-error` | `{ checked: boolean, error: any }` | `commit()` thất bại và công tắc đã quay lại. `checked` = trạng thái đã khôi phục; `error` = lỗi bị ném, hoặc `null` khi `fn` trả `false`. | có (composed) |

`change`/`input` native của input bên trong bị chặn tại host.

## Tuỳ biến giao diện

| Token | Mặc định (sáng) | Tác dụng |
|---|---|---|
| `--td-switch-on` | `#16a34a` | Màu rãnh khi bật và màu dấu tích trên núm (3.3:1 trên trang trắng; núm trắng trên nó 3.3:1). Attribute `color` đặt biến này trên host. |
| `--td-switch-off` | `var(--td-color-fill)` (gray-100; tối: #2c2c30) | Màu rãnh khi tắt. |
| `--td-switch-edge` | `var(--td-control-border-soft)` | Viền rãnh và núm khi tắt (mềm, v0.14.1). |
| `--td-switch-thumb` | `#fff` | Màu núm. |
| `--td-switch-thumb-on` | `var(--td-switch-thumb)` | 0.52.0: màu núm khi **bật** (`tone` đặt lại thành `--td-switch-thumb-tone`). |
| `--td-switch-on-success` | `var(--td-color-success)` (tối: #22c55e) | 0.52.0: rãnh bật của `tone="success"`. |
| `--td-switch-on-warning` | `var(--td-color-warning)` (tối: #f59e0b) | 0.52.0: rãnh bật của `tone="warning"`. |
| `--td-switch-thumb-tone` | `var(--td-color-on-status)` (tối: #111113) | 0.52.0: núm trên rãnh có tone. |
| `--td-control-border-hover` | `#aeaeb2` | Viền khi hover công tắc đang tắt (v0.14.2). |
| `--td-switch-w` / `--td-switch-h` / `--td-switch-thumb-d` | md: `2.75rem` / `1.5rem` / `1.125rem` | Kích thước rãnh và núm. Cỡ mặc định (md) khai báo trên `:root` (từ 0.16.0): `:root { --td-switch-w: 3rem; }`. Cỡ `sm` / `lg` đặt lại trên `.td-switch--sm` / `--lg`. Khoảng đệm núm `--td-switch-pad` tự tính trên `.td-switch` từ `-h` và `-thumb-d`. |

Lỗi dùng `--td-field-error` (viền rãnh). Focus dùng `--td-focus-ring`. Từ 0.20.0 núm không còn "nhấc lên" (phóng to)
khi đang nhấn — chỉ trượt.

**Viền mềm và WCAG:** rãnh tắt có viền mềm ~1.5:1 (hover ~2.2:1), thấp hơn 3:1 của WCAG 1.4.11 (có chủ đích); màu
bật mặc định vẫn ≥ 3:1. Site cần tuân thủ nghiêm:

```css
:root {
  --td-control-border-soft: var(--td-control-border-strong);
  --td-control-border-hover: var(--td-control-border-strong);
}
```

Công tắc là control tầng nội dung: rãnh đặc, núm đặc có một bóng mềm. Xem
[Theming](../customization/theming.md).

## Cấu trúc DOM & class

```html
<td-toggle label="Wifi" size="lg">
  <label class="td-switch td-switch--lg">
    <input type="checkbox" role="switch" class="td-switch__input">
    <span class="td-switch__track" aria-hidden="true">
      <span class="td-switch__thumb">
        <span class="td-switch__icon td-switch__icon--off" data-td-icon="close"><svg class="td-icon td-icon--m" data-icon="close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></span>
        <span class="td-switch__icon td-switch__icon--on" data-td-icon="check"><svg class="td-icon td-icon--m" data-icon="check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M20 6 9 17l-5-5"/></svg></span>
      </span>
    </span>
    <span class="td-switch__label">Wifi</span>
  </label>
  <!-- khi có lỗi: <span class="td-field-error" id="{host-id}-error" data-for="{host-id}">…</span> -->
</td-toggle>
```

0.52.0 — có `tone` / `status-text` / `locked` (phần thêm, chỉ khi có attribute):

```html
<td-toggle id="t" label="2FA" tone="warning" checked locked locked-reason="Chính sách">
  <label class="td-switch td-switch--md">
    <input type="checkbox" role="switch" class="td-switch__input" aria-readonly="true" aria-describedby="t-status t-lock">
    <span class="td-switch__track" aria-hidden="true"><span class="td-switch__thumb">
      <span class="td-switch__icon td-switch__icon--off" data-td-icon="close">…</span>
      <span class="td-switch__icon td-switch__icon--on" data-td-icon="clock">…</span>   <!-- check khi không phải warning -->
      <span class="td-switch__icon td-switch__icon--lock" data-td-icon="lock">…</span>  <!-- chỉ khi locked -->
    </span></span>
    <span class="td-switch__label">2FA</span>
  </label>
  <span class="td-switch__status td-sr-only" id="t-status">Đang chờ</span>                       <!-- tone / status-text -->
  <span class="td-switch__lock-reason td-sr-only" id="t-lock">Không thể thay đổi: Chính sách</span> <!-- locked -->
</td-toggle>
```

| Class / trạng thái | Ý nghĩa |
|---|---|
| `.td-switch` + `.td-switch--{sm\|md\|lg}` | Block (là `<label>`) và size. |
| `.td-switch__input` | Input native `role="switch"`, visually-hidden. |
| `.td-switch__track`, `.td-switch__thumb` | Rãnh và núm. |
| `.td-switch__icon--off` / `--on` | Icon trên núm (dấu X khi tắt, dấu tích khi bật; đồng hồ khi `tone="warning"`). |
| `.td-switch__icon--lock` | 0.52.0: ổ khoá trên núm khi `locked` (thay ✕ / ✓ / đồng hồ). |
| `.td-switch__status`, `.td-switch__lock-reason` | 0.52.0: chữ mô tả ẩn trực quan, ngoài `<label>`, nối qua `aria-describedby`. |
| `.td-switch__label` | Nhãn (chỉ khi có `label`). |
| `.td-switch[data-dragging]` | Đang nhấn giữ (hook để site tự style; mặc định không đổi giao diện từ 0.20.0). |
| `.td-switch[data-pending]` + input `[aria-busy="true"]` | Đang chờ `commit()`. |
| `.td-switch__input:checked` / `:disabled` / `:focus-visible` / `[aria-invalid="true"]` | Trạng thái. |

Render phía server: `td_toggle('wifi', true, 'Wifi')` của [adapter PHP](../guides/php-adapter.md#td_toggle-và-td_checkbox)
in đúng block `.td-switch` ở trên (checkbox native `role="switch"`, icon vẽ sẵn, chạy với chỉ `td.css`). Không dùng PHP
thì in tay block trên; icon theo [Icons › markup render sẵn](icons.md#icon-trong-markup-render-sẵn). Các file `test/contracts/*.html` trong repo kit chỉ là **fixture test** (không nằm trong gói npm, icon trong đó viết tắt) — đừng copy từ đó.
Xem [WordPress & PHP](../guides/wordpress-php.md) và [bảng class cũ](../upgrading/class-map.md).

### Hợp đồng SSR `toggle@1` — hydrate tại chỗ (0.26.0)

[`td_toggle` ở chế độ element](../guides/php-adapter.md#td_toggle--td_checkbox-ở-chế-độ-element-0260)
(`'element' => true` hoặc `ssr_elements`) in host `<td-toggle data-td-ssr="toggle@1" name … checked … label … size …>`
chứa đúng block `.td-switch` ở trên (ô icon có `data-td-icon` + SVG sẵn); input native còn giữ `name` / `value` /
`checked` / `required` (+ `id` của caller) để form chạy khi chưa có JS. Khi module nạp, `td-toggle` **nhận** markup đó:

- **Điều kiện nhận:** dấu `toggle@1`; con là `label.td-switch.td-switch--{size}` có đúng input `type="checkbox"
  role="switch"`, rãnh / núm / 2 ô icon (`close` / `check`) và nhãn như `render()` với attribute hiện tại của host;
  attribute ngoài allowlist (`on*`, `style`, `form`, `formaction`, `data-td-*` trên input…) → không nhận.
- **Trạng thái:** `el.checked` / `el.value` gán trước define > trạng thái **sống** của input (người dùng đã gạt trước
  khi JS tới) > attribute; chép lên host (`checked` / `value`), ElementInternals **trước**, rồi gỡ `name` / `value` /
  `checked` / `required` khỏi input (FormData đúng một mục). Không phát `change`. Node input, focus giữ nguyên.
- `<label for="{id input}">` nằm ngoài host chuyển sang host (bấm vẫn gạt + phát đúng một `change`); `id` của input
  được giữ, kể cả khi sau này phải render lại.
- **Reset** → mặc định native (`checked` / `value` PHP in ra).
- **Không khớp** (attribute / phần tử lạ, control thừa, dấu sai schema, nhãn / size lệch, `name` / `required` /
  `disabled` của input khác host) → **render an toàn ngay**, giữ `checked` / `value` / `id`; input đang focus thì focus
  chuyển sang input mới. Không phát `change`. (Không còn "hoãn tới blur" — ADR 0012 mục 5.)
- Gỡ ra rồi gắn lại phần tử đã hydrate: gắn lại tại chỗ sau khi kiểm lại markup; `<td-toggle>` không dấu: như trước.
- **0.52.0 — phần thêm (vẫn `toggle@1`):** `td_toggle` với `tone` / `status_text` / `locked` / `locked_reason` (luôn ở chế
  độ element) in thêm đúng các phần ở mục DOM: ô icon `clock` / `lock`, hai `span` mô tả **sau** `<label>`,
  `aria-readonly` + `aria-describedby` trên input. Chữ của hai `span` là **trạng thái** (lấy lại từ `messages` /
  attribute khi nhận) nên site đổi `messages` không làm hỏng việc nhận tại chỗ. Màu tone + ổ khoá đúng **ngay trước khi
  JS tải** (CSS theo attribute host) — không nháy. Markup không dùng phần thêm giống từng byte 0.51; kit cũ gặp markup
  mới → render an toàn.
## Bàn phím & trợ năng

- Input native `role="switch"`: Tab để tới, **Space** để bật/tắt. **Enter không bật/tắt** (từ 0.7.0, theo mẫu switch
  của WAI-ARIA APG).
- Trình đọc màn hình đọc là "công tắc, bật/tắt" nhờ `role="switch"` + trạng thái `checked` native.
- Đổi trạng thái bằng bàn phím hoặc code giữ focus (không render lại).
- Tên truy cập theo thứ tự: `label` → `aria-label` trên host → `<label for="host-id">` ở ngoài.
- Đang chờ `commit()`: `aria-busy="true"` trên input.
- `tone` (0.52.0): chữ trạng thái là **mô tả** của input khi bật (`aria-describedby`), icon núm đổi hình (✓ / đồng hồ).
- `locked` (0.52.0): vẫn trong thứ tự Tab; `aria-readonly="true"` + mô tả "Không thể thay đổi[: lý do]" (mô tả mang trạng
  thái — xem mục Khoá). Kiểm ở Chromium (cây trợ năng CDP) và DOM ở Firefox / WebKit.
- Vùng bấm ≥ 24×24 px, 44 px trên màn cảm ứng.
- Disabled: input disabled native (ra khỏi thứ tự Tab), khối mờ `opacity: 0.5`.
- `prefers-reduced-motion`: tắt chuyển động và hiệu ứng nhấp nháy khi chờ. `forced-colors`: rãnh/núm dùng màu hệ
  thống.

## Bảo mật

`label`, `error-text`, `status-text`, `locked-reason` là text (escape / `textContent`; PHP `Td::e()`). `color` qua
`safeColor`. `tone` theo allowlist (`success` / `warning`). **`locked` là UI, không phải kiểm soát truy cập**: server phải
bỏ qua / từ chối thay đổi của field khoá (trước khi JS tải hoặc khi tắt JS, checkbox native vẫn lật được).

## Lưu ý & lỗi thường gặp

- **Toggle `controlled` bấm không đổi**: đúng thiết kế; bạn phải tự đặt `checked` trong handler `change`.
- **Code cũ trước 0.2.0** coi toggle là controlled mặc định. Từ 0.2.0 mặc định tự đổi; thêm `controlled` để giữ hành vi
  cũ. Xem [Breaking changes](../upgrading/breaking-changes.md).
- **Dùng Enter để bật/tắt**: không còn hoạt động từ 0.7.0; dùng Space.
- **Gọi `commit()` trong handler `change` của toggle không có `controlled`**: lỗi lưu sẽ không đưa công tắc về trạng thái trước khi bấm (xem
  [Lưu lên server ngay](#lưu-lên-server-ngay-commit)).
- **`commit(fn)` với `fn` hợp lệ không reject khi `fn` thất bại**: đừng dựa vào `catch` để bắt lỗi nghiệp vụ, hãy nghe
  `commit-error` hoặc so sánh giá trị trả về (chỉ `fn` không phải hàm mới reject `TypeError`).
- **Trả `false` trong `fn` = thất bại**. Trả `undefined` (quên `return`) = thành công.
- **`commit()` với `next` sai kiểu** (ví dụ chuỗi `'true'`): bị bỏ qua, công tắc đảo trạng thái hiện tại.
- **Đặt cả `color` và `tone`**: `color` thắng màu; `tone` chỉ còn icon + chữ trạng thái (0.52.0).
- **`locked` không chặn được form khi chưa có JS**: server phải kiểm (0.52.0).
- **Tooltip làm thông tin chính**: tooltip không hiện khi chạm — trạng thái phải đọc được không cần nó (icon + chữ).

## Xem thêm

- [Checkbox](checkbox.md) — dùng chung lớp cơ sở
- [Toast](toast.md) — báo lỗi khi `commit-error`
- [Forms](../guides/forms.md)
- [Hooks](../customization/hooks.md)
- [Theming](../customization/theming.md)
- [Trợ năng](../guides/accessibility.md)
