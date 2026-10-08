[Tài liệu](../README.md) › [Components](README.md) › Checkbox

# Checkbox — `<td-checkbox>`

Ô đánh dấu (tròn theo mặc định, kiểu Apple) dựa trên `<input type="checkbox">` native, tham gia `<form>` như checkbox
thường. Dùng khi người dùng chọn/bỏ chọn một mục hoặc đồng ý điều khoản. Với cài đặt bật/tắt có hiệu lực ngay (ví dụ
"Nhận thông báo"), dùng [toggle](toggle.md). Chọn một trong nhiều lựa chọn thì dùng [dropdown](dropdown.md) hoặc
radio native.

| | |
|---|---|
| Import | `import '@dazzxq/td-components/checkbox';` (class: `import { TdCheckbox } from '@dazzxq/td-components';`) |
| Loại | Custom element |
| Form-associated | có |
| Từ phiên bản | 0.1.0 (form-associated từ 0.2.0, token-native + một event `change` từ 0.7.0, tròn từ 0.14.0, hydrate SSR tại chỗ từ 0.26.0, `indeterminate` + phần hình dùng chung `.td-check` từ 0.36.0, `label-position` từ 0.59.1) |

Cần `td.css` trên trang (xem [Cài đặt](../getting-started/installation.md)).

## Ví dụ nhanh

```html
<td-checkbox name="agree" required label="Tôi đồng ý với điều khoản"></td-checkbox>
<td-checkbox name="plan" value="pro" checked label="Gói Pro"></td-checkbox>

<script type="module">
  import '@dazzxq/td-components/checkbox';
</script>
```

## Cách dùng

### Checkbox có nhãn, không nhãn

```html
<!-- Nhãn hiện cạnh ô, bấm vào nhãn cũng đổi trạng thái -->
<td-checkbox label="Ghi nhớ đăng nhập"></td-checkbox>

<!-- Không nhãn hiển thị (ví dụ ô chọn dòng trong bảng): bắt buộc có aria-label -->
<td-checkbox aria-label="Chọn dòng 12"></td-checkbox>

<!-- Nhãn ở ngoài, trỏ vào id của host -->
<label for="newsletter">Nhận bản tin</label>
<td-checkbox id="newsletter"></td-checkbox>
```

Bấm vào `<label for>` ở ngoài sẽ focus và đổi trạng thái checkbox, giống checkbox native.

### Đọc và đổi trạng thái

```js
const cb = document.querySelector('td-checkbox[name="agree"]');

cb.checked;          // true / false
cb.checked = true;   // = cb.setAttribute('checked', '')
cb.checked = false;  // = cb.removeAttribute('checked')
```

Attribute `checked` luôn khớp với trạng thái hiện tại: khi người dùng bấm, kit tự thêm/xoá attribute. Đổi `checked`
bằng code cập nhật tại chỗ (không render lại, không mất focus) và **không** phát `change`.

### Nghe thay đổi

```js
cb.addEventListener('change', (e) => {
  console.log('checked =', e.detail.checked);
});
```

Mỗi lần người dùng đổi trạng thái (chuột, chạm, phím Space, bấm nhãn) có đúng **một** event `change`.

### Trong form

```html
<form id="order">
  <td-checkbox name="gift" label="Gói quà"></td-checkbox>                  <!-- gửi "on" khi được chọn -->
  <td-checkbox name="plan" value="pro" label="Gói Pro"></td-checkbox>       <!-- gửi "pro" khi được chọn -->
  <td-checkbox name="terms" required label="Đồng ý điều khoản"></td-checkbox>
  <td-button type="submit">Đặt hàng</td-button>
</form>
```

- Được chọn: gửi `name=value` (`value` mặc định là `on`). Không được chọn: không gửi gì (giống checkbox native).
- `required` + chưa chọn → `valueMissing` với thông báo `Vui lòng chọn ô này.` (`TdCheckbox.messages.valueMissing`,
  đổi được cho cả trang), chặn submit.
- Reset form: trả `checked` và `value` về như lúc phần tử gắn vào trang, đồng thời xoá lỗi đang hiện.
- `<fieldset disabled>` bao ngoài làm checkbox disabled (không gửi), attribute `disabled` của nó không bị đổi.
- Khôi phục trạng thái khi trình duyệt khôi phục form (quay lại trang không qua bfcache): `checked` được đặt lại đúng,
  attribute `value` giữ nguyên (0.16.0).

Nhiều checkbox cùng `name` được gửi thành nhiều cặp, đọc bằng `formData.getAll('name')`.

**Host là control của form (chế độ element, kể cả PHP `helper_text`).** Khi `<td-checkbox>` đã nâng cấp — viết tay, tạo bằng JS,
hoặc PHP `td_checkbox(…, ['helper_text' => …])` (từ 0.54.0 `helper_text` buộc chế độ element) — chính **host** gửi giá trị qua
ElementInternals. `<input>` bên trong chỉ để hiển thị / bàn phím: sau nâng cấp nó **không có `name` / `value`** của form, nên
`input.value` đọc ra `"on"` (mặc định của trình duyệt), không phải giá trị bạn đặt. Đọc trên host (`el.checked`, `el.value`) hoặc
`new FormData(form)`, đừng `querySelector('input').value` / `form.elements['name']` trỏ vào ô bên trong.

```js
const cb = document.querySelector('td-checkbox[name="plan"]');
cb.checked;                          // true / false
cb.value;                            // "pro" (attribute value; mặc định "on")
new FormData(form).getAll('plan');   // ["pro"] khi được chọn, [] khi không
```

### Trạng thái lưng chừng (`indeterminate`, 0.36.0)

Dùng cho ô "chọn tất cả" khi mới chọn **một phần** (ô hiện vạch ngang, trình đọc màn hình đọc "mixed"):

```html
<td-checkbox id="all" indeterminate label="Chọn tất cả"></td-checkbox>
```

```js
const all = document.getElementById('all');
all.indeterminate = true;      // = setAttribute('indeterminate', '') — áp tại chỗ, focus giữ, không event
all.indeterminate = false;
```

Vòng đời:

- **Nguồn** là thuộc tính boolean `indeterminate` trên host (property phản chiếu). Kit chép nó xuống
  `input.indeterminate` native sau mỗi lần render, khi nhận markup SSR, khi gắn lại vào trang và sau `form.reset()`.
- **Người dùng bấm** (chuột, Space, nhãn): trình duyệt tự bỏ lưng chừng → kit gỡ thuộc tính host **trước** rồi phát đúng
  **một** `change { checked }` (không có event riêng cho indeterminate).
- **Đặt bằng code** (`indeterminate = …`) không phát event. Đổi `checked` bằng code **không** xoá lưng chừng (giống
  native) — app tự quản lý, ví dụ khi tính lại "chọn tất cả".
- **Form**: lưng chừng không phải giá trị — FormData chỉ theo `checked`. Reset form trả `checked` về mặc định, **giữ**
  thuộc tính `indeterminate` (đúng native) và áp lại lên input.
- **SSR** `checkbox@1`: PHP không in lưng chừng (markup không đổi); site đặt thuộc tính `indeterminate` lên host in sẵn
  thì kit áp sau khi nhận markup. Input native đã lưng chừng trước khi JS tới → thành thuộc tính host.
- Ô hiện vạch ngay cả khi `checked` (lưng chừng thắng dấu tích).

### Màu và kích thước

```html
<td-checkbox size="sm" label="Nhỏ"></td-checkbox>
<td-checkbox size="lg" label="Lớn" color="#10b981" checked></td-checkbox>
```

`color` đổi màu nền khi được chọn cho riêng phần tử đó. Giá trị đi qua `safeColor`; không hợp lệ thì dùng màu mặc định
(`--td-checkbox-color`, tức màu accent).

### Checkbox vuông

Mặc định tròn (từ 0.14.0). Muốn vuông, đổi token bo góc:

```css
:root { --td-checkbox-radius: 6px; }
```

### Nhãn đứng trước ô tick: `label-position="start"` (0.59.1)

Mặc định nhãn đứng **sau** ô tick. `label-position="start"` đưa nhãn ra **trước**:

```html
<td-checkbox name="show" label="Hiển thị" label-position="start"></td-checkbox>
```

- Giá trị: `start` | `end` (mặc định). Giá trị khác (`left`, `START`, rỗng…) = `end`.
- **Chỉ đổi bằng CSS** (`order` trên chữ nhãn): thứ tự DOM, tên truy cập, thứ tự focus và markup SSR giữ nguyên.
- Đi theo hướng chữ: trang RTL thì nhãn nằm bên phải, ô tick bên trái.
- Nhãn + khoảng hở + ô tick vẫn là **một** vùng bấm (một `<label>`); vùng chạm ≥ 44 px trên cảm ứng như cũ.
- Có `helper-text` / `<td-hint>` / lỗi: dòng ghi chú bắt đầu **thẳng mép đầu của nhãn** (không thụt vào).
- Không có `label` (chỉ `aria-label`): attribute không có tác dụng.
- Đổi lúc chạy (`el.labelPosition = 'start'` hoặc `setAttribute`) không render lại: input và focus giữ nguyên.
- `indeterminate`, `size`, `color` dùng chung được.

PHP: `td_checkbox('show', false, 'Hiển thị', ['label_position' => 'start'])` — xem
[PHP adapter](../guides/php-adapter.md#nhãn-đứng-trước-label_position-0591).

### Hiện lỗi (error contract)

```js
cb.setError('Bạn cần đồng ý để tiếp tục');
cb.clearError();     // hoặc cb.setError('')
cb.errorMessage;     // lỗi đang hiện, '' nếu không có
```

```html
<td-checkbox name="terms" label="Đồng ý" error-text="Bạn cần đồng ý để tiếp tục"></td-checkbox>
```

Hiện lỗi = viền ô màu lỗi + `aria-invalid="true"` + `aria-errormessage` trên input + một dòng
`<span class="td-field-error">` bên dưới. `setError()` và `error-text`: cái nào đặt sau cùng thì thắng. Error contract
**không chặn submit**; muốn chặn, dùng thêm `setCustomValidity(msg)`. Xem [Forms](../guides/forms.md).

## Attribute

| Attribute | Kiểu | Mặc định | Mô tả |
|---|---|---|---|
| `checked` | boolean | không | Trạng thái được chọn. Tự cập nhật khi người dùng bấm. Lúc gắn vào trang là trạng thái mặc định khi reset. |
| `value` | string | `on` (khi không có attribute) | Giá trị gửi đi khi được chọn. |
| `name` | string | — | Tên trường trong form. |
| `required` | boolean | không | Bắt buộc chọn (`valueMissing`). |
| `disabled` | boolean | không | Tắt (cũng qua `<fieldset disabled>`). |
| `label` | string | — | Nhãn hiển thị cạnh ô. |
| `aria-label` | string | — | Tên truy cập khi không có `label` (chép xuống input). |
| `size` | string | `md` | `sm` \| `md` \| `lg` (ô 16 / 20 / 24 px). Khác → `md`. |
| `color` | string (màu CSS) | `--td-checkbox-color` | Màu nền khi được chọn, riêng phần tử này. |
| `indeterminate` | boolean | không | 0.36.0: trạng thái lưng chừng (vạch ngang, "mixed"). Người dùng bấm thì tự gỡ. Không gửi trong form. |
| `error-text` | string | — | Dòng lỗi (error contract). |
| `label-position` | `start` \| `end` | `end` | **0.59.1** `start`: nhãn đứng **trước** ô tick (chỉ CSS, DOM không đổi; RTL tự đảo). Khác → `end`. Property `labelPosition`. |
| `id` | string | tự sinh `td-td-checkbox-{n}` | Tự gán nếu thiếu, để `<label for>` và id lỗi hoạt động. |
| `helper-text` | string | — | **0.54.0** Gợi ý dưới control (chữ, 1–2 câu): ẩn và rời khỏi mô tả khi có lỗi. Nội dung giàu (link, `<code>`): `<td-hint>` con — xem [Hint](hint.md). Property `helperText`, `setHelper(msg)`, `helperMessage`. Checkbox / toggle: dưới chữ nhãn (không nhãn: dưới control). |

## Property & method

Property phản chiếu attribute: `checked` (boolean), `value`, `name`, `required`, `disabled`, `label`, `ariaLabel`,
`size`, `color`, `errorText`, `indeterminate` (0.36.0). Lưu ý `value` trả về `''` khi không có attribute, dù giá trị gửi đi khi đó là `on`.
`labelPosition` (0.59.1) luôn trả `'start'` hoặc `'end'`; gán `'start'` thì ghi attribute, gán giá trị khác thì gỡ attribute.

> Gán property trước khi phần tử gắn vào trang (hoặc trước khi module được import) vẫn có tác dụng từ 0.16.0: giá
> trị được áp khi phần tử kết nối lần đầu. Chi tiết: [Cách hoạt động](../concepts/how-it-works.md).

| Method / property | Trả về | Mô tả |
|---|---|---|
| `setError(message: string)` | `void` | Hiện lỗi; `''` để xoá. |
| `clearError()` | `void` | Xoá lỗi. |
| `errorMessage` | `string` (chỉ đọc) | Lỗi đang hiện. |
| `focus(options?)` | `void` | Focus input bên trong. |
| `setCustomValidity(message)` | `void` | Lỗi custom chặn submit; `''` để gỡ. |
| `checkValidity()` / `reportValidity()` | `boolean` | Như native. |
| `form`, `validity`, `validationMessage`, `willValidate`, `labels` | — | Như native (chỉ đọc). |

Trạng thái lưng chừng: xem [`indeterminate`](#trạng-thái-lưng-chừng-indeterminate-0360).

## Event

| Event | detail | Khi nào | bubbles? |
|---|---|---|---|
| `change` | `{ checked: boolean }` | Người dùng đổi trạng thái. Đúng một event mỗi lần. Không phát khi đổi bằng code. | có (composed) |

`change` và `input` native của input bên trong bị chặn tại host.

## Tuỳ biến giao diện

| Token | Mặc định (sáng) | Tác dụng |
|---|---|---|
| `--td-checkbox-color` | `var(--td-accent)` (#2563eb) | Màu nền + viền khi được chọn. Attribute `color` đặt biến này trên host bằng CSSOM. |
| `--td-checkbox-border` | `var(--td-control-border-soft)` (#d1d1d6) | Viền lúc chưa chọn (mềm, v0.14.1). |
| `--td-checkbox-radius` | `50%` | Bo góc ô (tròn). Đặt `6px` cho ô vuông. |
| `--td-control-border-hover` | `#aeaeb2` | Viền khi hover ô chưa chọn (v0.14.2). Token chung của control. |
| `--td-checkbox-box` | `1.25rem` (sm `1rem`, lg `1.5rem`) | Kích thước ô. Cỡ mặc định khai báo trên `:root` (từ 0.16.0): `:root { --td-checkbox-box: 1.1rem; }`. Cỡ `sm` / `lg` đặt lại biến trên `.td-checkbox--sm` / `--lg`; muốn đổi thì nhắm class đó. |

Màu dấu tích là `--td-accent-contrast` (#fff). Nền ô chưa chọn là `--td-control-bg`. Lỗi dùng `--td-field-error`.
Focus dùng `--td-focus-ring`. Theme tối lấy theo token control chung (0.41.0: `--td-control-border-soft` #76767c — ô
chưa chọn ≥ 3:1 với mọi nền kề, `--td-control-border-hover` #8e8e93, accent #4b8df8).

**Viền mềm và WCAG:** viền ô chưa chọn lúc nghỉ ~1.5:1, khi hover ~2.2:1, thấp hơn 3:1 của WCAG 1.4.11 (có chủ đích).
Site cần tuân thủ nghiêm:

```css
:root {
  --td-control-border-soft: var(--td-control-border-strong);
  --td-control-border-hover: var(--td-control-border-strong);
}
```

Checkbox là control tầng nội dung: đặc, không bao giờ là kính. Xem [Theming](../customization/theming.md).

## Cấu trúc DOM & class

```html
<td-checkbox label="Đồng ý" size="sm">
  <label class="td-checkbox td-checkbox--sm">
    <input type="checkbox" class="td-checkbox__input">
    <span class="td-checkbox__mark" aria-hidden="true">
      <span class="td-checkbox__icon" data-td-icon="check"><svg class="td-icon td-icon--m td-checkbox__svg" data-icon="check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M20 6 9 17l-5-5"/></svg></span>
    </span>
    <span class="td-checkbox__label">Đồng ý</span>
  </label>
  <!-- khi có lỗi: <span class="td-field-error" id="{host-id}-error" data-for="{host-id}">…</span> -->
</td-checkbox>
```

| Class / trạng thái | Ý nghĩa |
|---|---|
| `.td-checkbox` + `.td-checkbox--{sm\|md\|lg}` | Block (là `<label>` bao ngoài) và size. |
| `.td-checkbox__input` | Input native, ẩn bằng kỹ thuật visually-hidden (vẫn focus được). |
| `.td-checkbox__mark` | Ô hiển thị. |
| `.td-checkbox__icon` / `.td-checkbox__svg` | Dấu tích (icon registry `check`). |
| `.td-checkbox__label` | Nhãn (chỉ có khi có `label`). |
| `.td-checkbox__input:checked` / `:indeterminate` / `:disabled` / `:focus-visible` / `[aria-invalid="true"]` | Trạng thái; CSS style `.td-checkbox__mark` phía sau bằng combinator `~`. |
| `.td-field-error` | Dòng lỗi, nằm sau `<label>`, trong host. |

Render phía server: `td_checkbox('agree', false, 'Đồng ý')` của [adapter PHP](../guides/php-adapter.md#td_toggle-và-td_checkbox)
in đúng khối `<label class="td-checkbox …">` ở trên (checkbox native, dấu tích vẽ sẵn, chạy với chỉ `td.css`). Không dùng
PHP thì in tay khối trên (trong `<td-checkbox>` hoặc đứng riêng); dấu tích lấy theo
[Icons › markup render sẵn](icons.md#icon-trong-markup-render-sẵn). Các file `test/contracts/*.html` trong repo kit chỉ là **fixture test** (không nằm trong gói npm, icon trong đó viết tắt) — đừng copy từ đó. Xem [WordPress & PHP](../guides/wordpress-php.md) và
[bảng class cũ](../upgrading/class-map.md) (host property `--td-cb-color` đổi thành `--td-checkbox-color` ở 0.7.0).

### Phần hình dùng chung `.td-check` (0.36.0)

Ô của `td-checkbox` là **hình chuẩn của mọi "tick để chọn"** trong kit ([ADR 0017](../internal/decisions/0017-shared-check-mark.md)):
ô tick của [media grid](media-grid.md) / [media picker](media-picker.md), [tree](tree.md) chọn nhiều,
[chip input](chip-input.md) `selection-only`, mục checkbox của [menu](menu.md) đều in cùng một phần hình
`span.td-check` (CSS ở `check.css`) — cùng hộp, dấu ✓, vạch lưng chừng, màu `--td-checkbox-color`, viền
`--td-checkbox-border`, bo `--td-checkbox-radius`. Đổi token checkbox là đổi tất cả. Markup của `td-checkbox` **không
đổi** (vẫn `.td-checkbox__mark`; SSR / golden giữ từng byte).

| Class | Ý nghĩa |
|---|---|
| `.td-check` | Phần hình (luôn `aria-hidden="true"`; ngữ nghĩa ở phần tử chứa). |
| `.td-check--sm` / `--md` / `--lg` | 1rem / 1.25rem / 1.5rem — đúng ba cỡ `td-checkbox`. |
| `.td-check--on-media` | Ô nằm trên ảnh: thêm vành tối mảnh để thấy trên ảnh trắng. |
| `.td-check__svg` | Dấu ✓ (icon `check`; markup dựng từ chuỗi bọc thêm `span.td-check__icon`). |

Trạng thái đọc từ ARIA **sẵn có** của phần tử chứa (cha trực tiếp): bật = `aria-pressed` / `aria-checked` /
`aria-selected="true"`; lưng chừng = `aria-checked="mixed"`; khoá = `aria-disabled="true"` / `:disabled` (mờ 50 %). Không
bao giờ lồng `<td-checkbox>` vào trong một control khác — dùng `.td-check`.

### Hợp đồng SSR `checkbox@1` — hydrate tại chỗ (0.26.0)

[`td_checkbox` ở chế độ element](../guides/php-adapter.md#td_toggle--td_checkbox-ở-chế-độ-element-0260)
(`'element' => true` hoặc `ssr_elements`) in host `<td-checkbox data-td-ssr="checkbox@1" …>` chứa đúng khối
`label.td-checkbox` ở trên (ô dấu tích `data-td-icon="check"` + SVG sẵn); input native còn giữ `name` / `value` /
`checked` / `required` (+ `id` của caller) để form chạy khi chưa có JS. Khi module nạp, `td-checkbox` **nhận** markup đó:

- **Điều kiện nhận:** dấu `checkbox@1`; con là `label.td-checkbox.td-checkbox--{size}` có đúng input
  `type="checkbox"`, ô dấu tích và nhãn như `render()` với attribute hiện tại của host (sau đó tuỳ chọn một dòng lỗi
  `.td-field-error`); attribute ngoài allowlist (`on*`, `style`, `form`, `formaction`, `data-td-*` trên input…) → không
  nhận.
- **Trạng thái:** `el.checked` / `el.value` gán trước define > trạng thái **sống** của input (người dùng tích / bỏ tích,
  script đổi `input.value` trước khi JS tới) > attribute; chép lên host, ElementInternals **trước**, rồi gỡ `name` /
  `value` / `checked` / `required` khỏi input — FormData trước = sau, đúng một mục (cả tên `tags[]`), bỏ tích / disabled
  không gửi. `indeterminate` của input được giữ. Không phát `change`; node input + focus giữ nguyên.
- `<label for="{id input}">` nằm ngoài host chuyển sang host (bấm vẫn tích + phát đúng một `change`); `id` của input
  được giữ, kể cả khi sau này phải render lại. Nhãn bọc (`label.td-checkbox`) vẫn đặt tên cho input.
- **Reset** → mặc định native (`checked` / `value` PHP in ra), không về trạng thái lúc nâng cấp.
- **Không khớp** (attribute / phần tử lạ, control thừa, dấu sai schema, nhãn / size lệch, `name` / `required` /
  `disabled` của input khác host) → **render an toàn ngay**, giữ `checked` / `value` / `indeterminate` / `id`; input
  đang focus thì focus chuyển sang input mới. Không phát `change`. (Không còn "hoãn tới blur" — ADR 0012 mục 5.)
- Gỡ ra rồi gắn lại phần tử đã hydrate: gắn lại tại chỗ sau khi kiểm lại markup (bị sửa lúc tách → render lại giữ
  trạng thái); `<td-checkbox>` không dấu: như trước.

## Bàn phím & trợ năng

- Input là checkbox native: Tab để tới, Space để đổi trạng thái. Lưng chừng → trình đọc màn hình đọc "mixed" (native). Focus bàn phím hiện vòng `--td-focus-ring` quanh ô.
- Đổi trạng thái bằng bàn phím hoặc bằng code đều giữ focus (không render lại).
- Tên truy cập theo thứ tự ưu tiên: `label` → `aria-label` trên host → `<label for="host-id">` ở ngoài (thành
  `aria-labelledby` của input).
- Vùng bấm tối thiểu 24×24 px ở mọi size (WCAG 2.5.8), 44 px trên màn cảm ứng.
- Disabled: input disabled native, cả khối mờ `opacity: 0.5` và con trỏ `not-allowed`.
- `forced-colors`: viền `ButtonText`, khi chọn nền `Highlight`. `prefers-reduced-motion`: tắt chuyển động.

## Bảo mật

`label`, `error-text` hiện dưới dạng text (escape / `textContent`). `color` qua `safeColor`, giá trị không phải màu
bị bỏ.

## Lưu ý & lỗi thường gặp

- **Nghe `click` thay vì `change`**: dùng `change`, `e.detail.checked` là trạng thái mới.
- **Đặt `checked` bằng code rồi chờ `change`**: đổi bằng code không phát event.
- **`value` đọc ra `''`** khi không đặt attribute, dù form gửi `on`.
- **Checkbox không có `label` và `aria-label`**: trình đọc màn hình không đọc được tên.
- **Muốn disabled mờ theo kiểu khác**: `opacity` nằm ở `.td-checkbox:has(.td-checkbox__input:disabled)`, override
  bằng CSS của site.

## Xem thêm

- [Toggle](toggle.md) — công tắc bật/tắt, dùng chung lớp cơ sở với checkbox
- [Forms](../guides/forms.md)
- [Theming](../customization/theming.md) — viền mềm, override WCAG
- [Base element](base-element.md) — `TdFormElement`, error contract
- [Trợ năng](../guides/accessibility.md)
