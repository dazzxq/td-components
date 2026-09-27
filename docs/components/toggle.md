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
| Từ phiên bản | 0.1.0 (mặc định uncontrolled từ 0.2.0, input native `role="switch"` từ 0.7.0, `commit()` từ 0.13.0) |

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
- `required` + đang tắt → `valueMissing`, thông báo `Vui lòng bật tùy chọn này.`, chặn submit.
- Reset form: trả `checked` và `value` về như lúc gắn vào trang, xoá lỗi.
- `<fieldset disabled>` bao ngoài làm công tắc disabled (không gửi), không đổi attribute `disabled`.
- Autofill / back-forward cache: **không** khôi phục trạng thái bật/tắt (giống [checkbox](checkbox.md)).

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
| `id` | string | tự sinh `td-td-toggle-{n}` | Tự gán nếu thiếu. |

## Property & method

Property phản chiếu attribute: `checked`, `controlled` (boolean), `value`, `name`, `required`, `disabled`, `label`,
`ariaLabel`, `size`, `color`, `errorText`. `value` trả `''` khi không có attribute.

> Property được tạo khi phần tử gắn vào trang lần đầu. Trước đó dùng `setAttribute()`.

| Method / property | Trả về | Mô tả |
|---|---|---|
| `commit(fn: (next: boolean) => any, next?: boolean)` | `Promise<boolean>` | Lưu lạc quan (xem trên). Resolve với trạng thái cuối. (0.13.0) |
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
| `--td-switch-off` | `var(--td-gray-100)` (tối: #2c2c30) | Màu rãnh khi tắt. |
| `--td-switch-edge` | `var(--td-control-border-soft)` | Viền rãnh và núm khi tắt (mềm, v0.14.1). |
| `--td-switch-thumb` | `#fff` | Màu núm. |
| `--td-control-border-hover` | `#aeaeb2` | Viền khi hover công tắc đang tắt (v0.14.2). |
| `--td-switch-w` / `--td-switch-h` / `--td-switch-thumb-d` | md: `2.75rem` / `1.5rem` / `1.125rem` | Kích thước rãnh và núm. Cỡ mặc định (md) khai báo trên `:root` (từ 0.16.0): `:root { --td-switch-w: 3rem; }`. Cỡ `sm` / `lg` đặt lại trên `.td-switch--sm` / `--lg`. Khoảng đệm núm `--td-switch-pad` tự tính trên `.td-switch` từ `-h` và `-thumb-d`. |

Lỗi dùng `--td-field-error` (viền rãnh). Focus dùng `--td-focus-ring`. Hiệu ứng "nhấc núm" khi đang nhấn dùng
`--td-glass-lift-scale` (tắt khi giảm chuyển động).

**Viền mềm và WCAG:** rãnh tắt có viền mềm ~1.5:1 (hover ~2.2:1), thấp hơn 3:1 của WCAG 1.4.11 (có chủ đích); màu
bật mặc định vẫn ≥ 3:1. Site cần tuân thủ nghiêm:

```css
:root {
  --td-control-border-soft: var(--td-control-border-strong);
  --td-control-border-hover: var(--td-control-border-strong);
}
```

Công tắc là control tầng nội dung: rãnh đặc; chỉ núm "nhấc lên" khi đang nhấn. Xem
[Theming](../customization/theming.md).

## Cấu trúc DOM & class

```html
<td-toggle label="Wifi" size="lg">
  <label class="td-switch td-switch--lg">
    <input type="checkbox" role="switch" class="td-switch__input">
    <span class="td-switch__track" aria-hidden="true">
      <span class="td-switch__thumb">
        <span class="td-switch__icon td-switch__icon--off" data-td-icon="close"><svg …></svg></span>
        <span class="td-switch__icon td-switch__icon--on" data-td-icon="check"><svg …></svg></span>
      </span>
    </span>
    <span class="td-switch__label">Wifi</span>
  </label>
  <!-- khi có lỗi: <span class="td-field-error" id="{host-id}-error" data-for="{host-id}">…</span> -->
</td-toggle>
```

| Class / trạng thái | Ý nghĩa |
|---|---|
| `.td-switch` + `.td-switch--{sm\|md\|lg}` | Block (là `<label>`) và size. |
| `.td-switch__input` | Input native `role="switch"`, visually-hidden. |
| `.td-switch__track`, `.td-switch__thumb` | Rãnh và núm. |
| `.td-switch__icon--off` / `--on` | Icon trên núm (dấu X khi tắt, dấu tích khi bật). |
| `.td-switch__label` | Nhãn (chỉ khi có `label`). |
| `.td-switch[data-dragging]` | Đang nhấn giữ (núm nhấc lên). |
| `.td-switch[data-pending]` + input `[aria-busy="true"]` | Đang chờ `commit()`. |
| `.td-switch__input:checked` / `:disabled` / `:focus-visible` / `[aria-invalid="true"]` | Trạng thái. |

Block `.td-switch` giống hợp đồng markup kit 135 / dwp in phía server. Hợp đồng: `test/contracts/switch.html`. Xem
[WordPress & PHP](../guides/wordpress-php.md) và [bảng class cũ](../upgrading/class-map.md).

## Bàn phím & trợ năng

- Input native `role="switch"`: Tab để tới, **Space** để bật/tắt. **Enter không bật/tắt** (từ 0.7.0, theo mẫu switch
  của WAI-ARIA APG).
- Trình đọc màn hình đọc là "công tắc, bật/tắt" nhờ `role="switch"` + trạng thái `checked` native.
- Đổi trạng thái bằng bàn phím hoặc code giữ focus (không render lại).
- Tên truy cập theo thứ tự: `label` → `aria-label` trên host → `<label for="host-id">` ở ngoài.
- Đang chờ `commit()`: `aria-busy="true"` trên input.
- Vùng bấm ≥ 24×24 px, 44 px trên màn cảm ứng.
- Disabled: input disabled native (ra khỏi thứ tự Tab), khối mờ `opacity: 0.5`.
- `prefers-reduced-motion`: tắt chuyển động và hiệu ứng nhấp nháy khi chờ. `forced-colors`: rãnh/núm dùng màu hệ
  thống.

## Bảo mật

`label`, `error-text` là text (escape / `textContent`). `color` qua `safeColor`.

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

## Xem thêm

- [Checkbox](checkbox.md) — dùng chung lớp cơ sở
- [Toast](toast.md) — báo lỗi khi `commit-error`
- [Forms](../guides/forms.md)
- [Hooks](../customization/hooks.md)
- [Theming](../customization/theming.md)
- [Trợ năng](../guides/accessibility.md)
