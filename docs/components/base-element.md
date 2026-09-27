[Tài liệu](../README.md) › [Components](README.md) › Base element

# Tự viết component — `TdBaseElement`, `TdFormElement`, `<td-sample>`

Mọi component của kit đều kế thừa hai base class này. Site dùng chúng để viết component **riêng** (ví dụ thẻ sản phẩm
của dwp, ô nhập slug của 135) mà vẫn cùng cách render, dọn dẹp, escape và tham gia form như component của kit. Trang này
đi từ ví dụ nhỏ nhất (`td-sample`, có sẵn trong gói) tới một control form hoàn chỉnh.

Chỉ tự viết component khi kit không có sẵn và không cấu hình được bằng attribute/hook. Nếu chỉ cần đổi màu, nhãn hay
thêm icon, xem [Theming](../customization/theming.md), [Hooks](../customization/hooks.md), [Icons](icons.md) trước.

| | |
|---|---|
| Import | `import { TdBaseElement } from '@dazzxq/td-components/base'` · `import { TdFormElement } from '@dazzxq/td-components/form-element'` · ví dụ: `import '@dazzxq/td-components/sample'` |
| Loại | Base class (JS) + một custom element mẫu `<td-sample>` |
| Form-associated | `TdBaseElement`: không · `TdFormElement`: có (ElementInternals) |
| Từ phiên bản | `TdBaseElement` 0.1.0 · `TdFormElement` 0.2.0 |

Cả hai class cũng có trong entry gốc: `import { TdBaseElement, TdFormElement } from '@dazzxq/td-components'`.

## Ví dụ nhanh: `<td-sample>`

`td-sample` là component demo của kit: một thẻ có tiêu đề, bộ đếm và nút "Increment".

```html
<td-sample label="Bộ đếm" count="0"></td-sample>

<script type="module">
  import '@dazzxq/td-components/sample';
  document.querySelector('td-sample')
    .addEventListener('count-change', (e) => console.log('count =', e.detail.count));
</script>
```

| Attribute | Kiểu | Mặc định | Mô tả |
|---|---|---|---|
| `label` | string | `Sample` | Tiêu đề (escape) |
| `count` | number | `0` | Giá trị đếm |
| `disabled` | boolean | vắng | Vô hiệu nút |

| Event | detail | Khi nào | bubbles? |
|---|---|---|---|
| `count-change` | `{ count: number }` | Bấm nút khi không `disabled` | có (composed) |

Style của nó (`.td-sample`, `.td-sample__title`, `.td-sample__count`) nằm trong `td.css`; nút dùng contract `.td-btn`.

### Toàn bộ mã nguồn, giải thích từng phần

```js
import { TdBaseElement } from '@dazzxq/td-components/base';

export class TdSample extends TdBaseElement {
  // (1) Attribute được theo dõi: đổi một trong số này → render lại.
  static get observedAttributes() { return ['label', 'count', 'disabled']; }
  // (2) Attribute boolean: có mặt = true, vắng = false.
  static get booleanAttributes() { return ['disabled']; }

  // (3) Trả về CHUỖI HTML. Mọi giá trị động phải đi qua escapeHtml.
  render() {
    const label = this.escapeHtml(this.getAttribute('label') || 'Sample');
    const count = parseInt(this.getAttribute('count') || '0', 10); // số: ép kiểu thay vì escape
    const isDisabled = this.hasAttribute('disabled');
    return `<div class="td-sample">`
      + `<h3 class="td-sample__title">${label}</h3>`
      + `<p class="td-sample__count">Count: ${count}</p>`
      + `<button type="button" class="td-btn td-btn--primary td-btn--sm"${isDisabled ? ' disabled' : ''}>`
      + '<span class="td-btn__label">Increment</span></button>'
      + '</div>';
  }

  // (4) Chạy sau MỖI lần render: gắn listener vào DOM vừa tạo, bằng this.listen().
  afterRender() {
    const btn = this.querySelector('button');
    if (btn) {
      this.listen(btn, 'click', () => {
        if (this.hasAttribute('disabled')) return;
        const newCount = parseInt(this.getAttribute('count') || '0', 10) + 1;
        this.setAttribute('count', String(newCount)); // (5) đổi attribute → tự render lại
        this.emit('count-change', { count: newCount }); // (6) CustomEvent bubbles + composed
      });
    }
  }
}

// (7) Đăng ký có kiểm tra: import hai lần không ném lỗi.
if (!customElements.get('td-sample')) {
  customElements.define('td-sample', TdSample);
}
```

## Vòng đời của `TdBaseElement`

```
new / parser tạo element
   │  constructor(): _initialized = false, _cleanups = []
   ▼
connectedCallback() lần đầu
   │  _initialized = true
   │  _setupProperties()  → sinh property cho từng observed attribute
   │  _doRender():  this.innerHTML = render()  →  afterRender()  →  _applyStyles?.()
   ▼
attributeChangedCallback(name, old, new)
   │  chỉ khi đã khởi tạo và old !== new  →  _doRender() (render lại TOÀN BỘ)
   ▼
disconnectedCallback()
   │  chạy mọi hàm dọn dẹp (listener, timer) đã đăng ký bằng listen / setTimeout / setInterval
   ▼
connectedCallback() lần sau (element bị di chuyển / gắn lại)
      _doRender() một lần nữa để gắn lại listener đã bị gỡ
```

Điều cần nhớ:

- **Render = thay toàn bộ `innerHTML`.** Mọi node con cũ bị thay; trạng thái chỉ nằm trong DOM (chữ người dùng gõ,
  focus, vị trí cuộn) sẽ mất nếu bạn không giữ nó trong JS. Component tương tác nhiều (tabs, table, pagination của kit)
  override `attributeChangedCallback` để **cập nhật tại chỗ** thay vì render lại.
- Attribute đổi **trước** khi element vào trang không gây render; lần connect đầu render với giá trị hiện tại.
- Di chuyển element (remove + append) gây một lần render lại sau khi connect lại.
- `afterRender()` chạy sau **mỗi** lần render (lần đầu, mỗi lần đổi attribute, mỗi lần connect lại).

### Methods và hooks

| Thành viên | Chữ ký | Mô tả |
|---|---|---|
| `static observedAttributes` | `get → string[]` | Attribute theo dõi. Mặc định `[]`. |
| `static booleanAttributes` | `get → string[]` | Tập con là boolean. Mặc định `[]`. |
| `render()` | `() => string` | Override. Trả chuỗi HTML của nội dung. Mặc định `''`. |
| `afterRender()` | `() => void` | Override. Gắn listener, điền icon, đồng bộ trạng thái sau render. |
| `_applyStyles()` | `() => void` (tuỳ chọn) | Nếu bạn định nghĩa, được gọi sau `afterRender()` mỗi lần render: nơi đặt style theo từng instance bằng CSSOM (xem [Style](#style-css-và-giá-trị-theo-instance)). |
| `listen(target, event, handler, options?)` | `=> void` | `addEventListener` + tự `removeEventListener` khi disconnect. |
| `setTimeout(fn, ms)` | `=> number` | Như `window.setTimeout`, tự huỷ khi disconnect. Gọi `this.setTimeout`, không phải hàm global. |
| `setInterval(fn, ms)` | `=> number` | Như `window.setInterval`, tự huỷ khi disconnect. |
| `emit(name, detail = {})` | `=> void` | `dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true, detail }))`. Không cancelable. |
| `escapeHtml(str)` | `(any) => string` | Escape `&` `<` `>` `"` `'`. Không phải chuỗi → `String(v ?? '')`. |
| `safeColor(value, fallback = '')` | `(any, string) => string` | Trả `value` nếu là màu CSS an toàn, ngược lại `fallback`. |

### Property tự sinh từ attribute

Ở lần connect đầu, mỗi observed attribute (kebab-case) có một property camelCase trên instance:

| Loại | Getter | Setter |
|---|---|---|
| boolean (`disabled`) | `hasAttribute('disabled')` | truthy → `setAttribute('disabled', '')`, falsy → xoá |
| thường (`count`, `active-color`) | `getAttribute(...) ?? ''` (luôn là **chuỗi**, vắng → `''`) | `null`/`undefined` → xoá attribute; khác → `setAttribute(name, value)` |

```js
const s = document.querySelector('td-sample');
s.count = 5;          // = setAttribute('count', '5') → render lại
s.disabled = true;    // = setAttribute('disabled', '')
s.count;              // '5' (chuỗi)
```

- Property **không** được tạo nếu tên attribute đã có sẵn trên element (ví dụ `title`, `id`, `hidden`) hoặc class của bạn
  đã khai báo getter/setter cùng tên — bạn toàn quyền định nghĩa property đó.
- Accessor được cài ở lần connect đầu. Giá trị gán **trước** đó (element vừa `createElement`, hoặc thẻ đã trong trang
  nhưng class chưa `customElements.define`) nằm tạm trong một property JS thường; lúc connect lớp cơ sở lấy nó ra, xoá
  đi rồi gán lại qua accessor (hoặc qua getter/setter của class bạn, ví dụ `value`), trong khi **chặn render** — nên
  element render đúng **một** lần với giá trị cuối (0.16.0; trước đó giá trị gán sớm bị mất). Việc chặn nằm ở
  `_doRender()`, nên lớp con tự gọi `_doRender()` trong `attributeChangedCallback` cũng an toàn.

## Dọn dẹp: `listen`, `setTimeout`, `setInterval`

Mọi thứ đăng ký qua ba helper này được gỡ khi element rời DOM, nên không rò rỉ listener hay timer khi trang SPA/AJAX thay
nội dung.

```js
afterRender() {
  const input = this.querySelector('input');
  this.listen(input, 'input', () => this._onInput(input.value)); // node mới mỗi lần render: OK
}

connectedCallback() {
  // Listener trên document/window/host: gắn ở connectedCallback, KHÔNG ở afterRender.
  this.listen(document, 'keydown', (e) => this._onKey(e));
  super.connectedCallback();
}
```

- **Đừng** `listen(this, …)` hay `listen(document, …)` trong `afterRender()`: mỗi lần render sẽ cộng thêm một handler
  (chỉ được gỡ khi disconnect). Hoặc gắn ở `connectedCallback()` như trên (gỡ khi disconnect, gắn lại khi connect),
  hoặc gắn **một lần** trong `constructor` bằng `this.addEventListener(...)` với event delegation (cách `td-table` và
  `td-pagination` làm) — listener trên chính host sống cùng element, không cần gỡ.
- Listener gắn vào node con trong `afterRender()` là đúng cách; node cũ bị thay khi render lại nên listener cũ vô hiệu
  theo.
- Tài nguyên khác (`ResizeObserver`, `requestAnimationFrame`, phần tử portal ra `<body>`) phải tự dọn: override
  `disconnectedCallback()` và **gọi `super.disconnectedCallback()`**.

## Escape và an toàn (bắt buộc)

`render()` trả chuỗi HTML được gán thẳng vào `innerHTML`, nên **mọi** giá trị không phải hằng số phải được xử lý theo
ngữ cảnh:

| Ngữ cảnh | Làm gì | Ví dụ |
|---|---|---|
| Text trong thẻ | `this.escapeHtml(v)` | `<h3>${this.escapeHtml(title)}</h3>` |
| Giá trị attribute **có ngoặc kép** | `this.escapeHtml(v)` | `data-id="${this.escapeHtml(id)}"` |
| Số | Ép kiểu (`parseInt`, `Number`) và kẹp khoảng | `Count: ${count}` |
| Giá trị enum (`size`, `variant`) | Whitelist | `['sm','md'].includes(s) ? s : 'md'` |
| Màu | `this.safeColor(v, '')` rồi CSSOM | xem dưới |
| URL (`href`, `src`) | Tự kiểm tra scheme (`https:`, `/`…) — escape **không** chặn `javascript:` | |
| Attribute không ngoặc, tên thẻ, tên attribute, `<script>`, `on*=` | **Không bao giờ** nội suy dữ liệu | |

Khi đã có node, ưu tiên `textContent` / `setAttribute` thay vì ghép chuỗi. Chi tiết:
[guides/security.md](../guides/security.md).

`safeColor(value, fallback)` chấp nhận: hex `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`; `rgb()`, `rgba()`, `hsl()`, `hsla()`
chỉ chứa số, `%`, `deg`, dấu phẩy, `/`, khoảng trắng; tên màu chỉ gồm chữ cái (≤ 24 ký tự, ví dụ `tomato`). Mọi thứ khác
(`var(--x)`, `oklch()`, `red;}`, chuỗi có ngoặc) → `fallback`.

## Style: CSS và giá trị theo instance

Kit không dùng Shadow DOM và CSP-strict: output **không** có `style="…"`, không chèn `<style>`.

1. **CSS tĩnh** của component bạn viết nằm trong stylesheet của site (tải bằng `<link>`), đặt tên BEM riêng và **dùng
   token** `--td-*` để hợp giao diện:

   ```css
   /* site.css — có thể bọc trong @layer td.component để CSS không layer của site vẫn ghi đè được */
   @layer td.component {
     site-product-card { display: block; }
     .site-product-card {
       padding: var(--td-space-md);
       font-family: var(--td-font-sans);
       color: var(--td-color-text);
       background: var(--td-color-surface);
       border: 1px solid var(--td-color-border);
       border-radius: var(--td-radius-lg);
     }
     .site-product-card[data-state="sold-out"] { opacity: 0.6; }
   }
   ```

   Trạng thái thể hiện bằng `aria-*` / `data-state` / `[hidden]`, không bật tắt class hiển thị bằng JS.

2. **Giá trị theo từng instance** (màu từ attribute, độ rộng %, vị trí) đặt bằng CSSOM trong `_applyStyles()`:

   ```js
   _applyStyles() {
     // Đặt khi có màu; khi không có chỉ gỡ giá trị CHÍNH component đã đặt — biến site tự đặt trên host được giữ.
     this._setOwnedStyle('--site-card-accent', this.safeColor(this.getAttribute('accent'), ''));
   }
   ```

   `_setOwnedStyle(name, value)` (0.16.0, trên `TdBaseElement`): `value` khác rỗng → `style.setProperty` và ghi nhớ
   tên; rỗng/`null` → `removeProperty` **chỉ khi** component đã đặt nó trước đó. Dùng nó thay cho cặp
   `setProperty`/`removeProperty` để re-render không xoá biến CSS inline của site.

   `el.style.setProperty()` được CSP cho phép (khác với attribute `style="…"`). Với kích thước tự do, kiểm tra bằng
   `CSS.supports('width', v)` và từ chối `url(`/`var(`. (Helper `applyStyles` / `safeCssDimension` mà component kit
   dùng là **nội bộ**, không export — xem [utilities](utilities.md#tiện-ích-nội-bộ-không-export).)

Tổng quan cách override: [Styling](../customization/styling.md).

## Icon trong component của bạn

Trong chuỗi `render()`, để một "khe" icon rồi điền trong `afterRender()`:

```js
import { fillIconSlots } from '@dazzxq/td-components/icons';

render() {
  return `<button type="button" class="site-x__close" aria-label="Đóng">`
    + `<span data-td-icon="close" data-td-icon-size="s"></span></button>`;
}
afterRender() {
  fillIconSlots(this); // thay mỗi [data-td-icon] bằng <svg> từ registry
}
```

Hoặc dựng thẳng: `btn.appendChild(tdIcon('close', { size: 's' }))`. Xem [Icons](icons.md).

## Component form: `TdFormElement`

`TdFormElement extends TdBaseElement` thêm **form association** bằng `ElementInternals` (không Shadow DOM, không
`<input type="hidden">`): đặt `name` và để trong `<form>` là element của bạn nộp giá trị vào `FormData`, tham gia
`required` / constraint validation, reset theo form, bị vô hiệu bởi `<fieldset disabled>` tổ tiên, và nhận
`<label for="id-của-host">` như control native. Dropdown, input-field, checkbox, toggle, slider, datetime-picker của kit
đều xây trên class này.

### Những gì có sẵn

| Nhóm | Thành viên | Ghi chú |
|---|---|---|
| Khai báo | `static formAssociated = true` | Đã đặt sẵn; constructor gọi `attachInternals()` (lưu ở `this._internals`). |
| Attribute cơ sở | `observedAttributes` = `['name', 'disabled', 'required']`, `booleanAttributes` = `['disabled', 'required']` | Lớp con **phải spread**: `[...super.observedAttributes, 'value', …]`. |
| Đọc trạng thái | `form`, `validity`, `validationMessage`, `willValidate`, `labels` | Uỷ quyền cho internals. |
| Kiểm tra | `checkValidity()`, `reportValidity()`, `setCustomValidity(msg)` | `setCustomValidity('')` chỉ xoá lỗi custom, **không** xoá cờ như `valueMissing` của bạn. |
| Nộp giá trị | `_setFormValue(value, state?)` | `null` = không nộp. `state` (tuỳ chọn) là giá trị hiển thị khi khác giá trị nộp (ví dụ nhãn vs id). |
| Hợp lệ | `_setValidity(flags, message, anchor?)` | `flags` kiểu `ValidityStateFlags` (`valueMissing`, `patternMismatch`, `rangeOverflow`…). Object rỗng = hợp lệ. `anchor` mặc định `_validationAnchor()`. |
| Vô hiệu | `_effectiveDisabled` | `disabled` của host **hoặc** `<fieldset disabled>` tổ tiên. Đọc cờ này khi render/xử lý event. Fieldset không bao giờ ghi ra attribute `disabled`. |
| Id + label | host tự có `id` (`td-{tên-thẻ}-{n}`) trước lần render đầu; click `<label for>` ngoài → focus control bên trong (và bấm nếu là checkbox/radio) | Control bên trong **không** dùng id trùng host. |
| `focus(options)` | chuyển focus vào `_focusTarget()` | |
| Reset | `formResetCallback()` → `_restoreDefaults()` (+ xoá lỗi hiển thị) | Mặc định: nếu `value` là observed attribute thì `this.value = this._defaultValue`. |
| Giá trị mặc định | `_captureDefaults()` chụp **một lần** lúc connect: `_defaultValue` (attribute `value`), `_defaultChecked` (attribute `checked`) | |
| Khôi phục | `formStateRestoreCallback(state, mode)` → `_restoreState(state, mode)` | Autofill / bfcache. Mặc định gán `this.value = state` nếu là chuỗi (checkbox/toggle: đặt lại `checked`). |
| Thông báo | `_msg(key, vars?)` | Đọc `this.constructor.messages[key]`, điền `{tên}` từ `vars` (0.16.0). Cho lớp con có object `static messages` dịch được. |
| Tên truy cập | `_applyAccessibleName(control, hasVisibleLabel)` | Có nhãn hiển thị bên trong → không thêm gì; không thì copy `aria-label` host vào control; không nữa thì dùng id của `<label for="host-id">` làm `aria-labelledby`. |

Hook protected để override:

| Hook | Mặc định | Override khi |
|---|---|---|
| `_focusTarget()` | `querySelector('input, textarea, select, [contenteditable="true"], button, [tabindex]')` | Control thật của bạn khác phần tử đầu tiên khớp. |
| `_validationAnchor()` | `_focusTarget()` | Bong bóng lỗi của trình duyệt nên neo chỗ khác. |
| `_restoreDefaults()` | xem trên | Control có trạng thái sống khác attribute (thường là có). |
| `_restoreState(state, mode)` | xem trên | Giá trị hiển thị ≠ giá trị nộp. |
| `_captureDefaults()` | xem trên | Mặc định không nằm ở `value`/`checked`. |

### Error contract (lỗi hiển thị + a11y)

Bật bằng `static get errorContract() { return true; }` **và** thêm `'error-text'` vào `observedAttributes`. Khi đó có:

| API | Mô tả |
|---|---|
| `setError(message)` | Hiện lỗi. `setError('')` = xoá. |
| `clearError()` | Xoá lỗi (từ `setError` hoặc `error-text`). |
| `errorMessage` | Lỗi đang hiện (`''` = không). |
| attribute `error-text` | Lỗi khai báo (server render). Giá trị attribute mới nhất thắng `setError` trước đó. |

Khi có lỗi, base class thêm `<span class="td-field-error" id="{host-id}-error" data-for="{host-id}">…</span>` (style sẵn
trong `td.css`), đặt `aria-invalid="true"` + `aria-errormessage` trên `_focusTarget()` và gộp id lỗi vào
`aria-describedby` (giữ nguyên id do trang tự thêm). Reset form xoá lỗi. Error contract **chỉ là hiển thị**: nó không đổi
`validity`; muốn chặn submit thì dùng `_setValidity` / `setCustomValidity`.

Tuỳ biến vị trí: `_errorHost()` (mặc định host, ghi chú được append vào đó), `_mountErrorNote(note)`, và
`_describedByIds()` (trả id của ghi chú trợ giúp/bộ đếm để gộp vào `aria-describedby`). **Quan trọng**: render lại thay
`innerHTML` và làm mất ghi chú lỗi, nên gọi `this._applyErrorState()` ở cuối `afterRender()` để dựng lại.

Cách dùng từ phía trang và với `TdFormValidation`: [Form validation](form-validation.md), [Forms](../guides/forms.md).

### Ví dụ hoàn chỉnh: ô nhập slug form-associated

```js
// site-slug-input.js
import { TdFormElement } from '@dazzxq/td-components/form-element';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class SiteSlugInput extends TdFormElement {
  static get observedAttributes() {
    return [...super.observedAttributes, 'value', 'label', 'error-text'];
  }

  static get errorContract() { return true; }

  constructor() {
    super();
    this._value = null; // null = người dùng chưa gõ → dùng attribute `value`
  }

  // Property `value` tự định nghĩa (base class sẽ không sinh accessor đè lên).
  get value() { return this._value ?? this.getAttribute('value') ?? ''; }
  set value(v) {
    this._value = v == null ? '' : String(v);
    const input = this._focusTarget();
    if (input && input.value !== this._value) input.value = this._value; // tại chỗ: giữ focus
    this._sync();
  }

  render() {
    const controlId = this.escapeHtml(`${this.id}-control`);
    const label = this.getAttribute('label') || '';
    return '<div class="site-slug">'
      + (label ? `<label class="site-slug__label" for="${controlId}">${this.escapeHtml(label)}</label>` : '')
      + `<input class="site-slug__control" id="${controlId}" type="text" autocomplete="off"`
      + ` value="${this.escapeHtml(this.value)}"${this._effectiveDisabled ? ' disabled' : ''}>`
      + '</div>';
  }

  afterRender() {
    const input = this._focusTarget();
    if (!input) return;
    this.listen(input, 'input', () => { this._value = input.value; this._sync(); });
    this.listen(input, 'change', (e) => {
      e.stopPropagation();                          // trang chỉ nhận MỘT change: của host
      this.emit('change', { value: this.value });
    });
    this._applyAccessibleName(input, !!this.getAttribute('label'));
    this._sync();
    this._applyErrorState();                        // dựng lại ghi chú lỗi sau render
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (name === 'value' && oldVal !== newVal) this._value = null; // attribute mới thắng giá trị đã gõ
    super.attributeChangedCallback(name, oldVal, newVal);          // luôn gọi super
  }

  /** Đẩy giá trị vào FormData + constraint validation. */
  _sync() {
    const v = this.value;
    this._setFormValue(v === '' ? null : v);
    if (this.hasAttribute('required') && v === '') {
      this._setValidity({ valueMissing: true }, 'Vui lòng nhập đường dẫn.');
    } else if (v !== '' && !SLUG.test(v)) {
      this._setValidity({ patternMismatch: true }, 'Chỉ dùng chữ thường, số và dấu gạch ngang.');
    } else {
      this._setValidity({});
    }
  }

  _restoreDefaults() { this.value = this._defaultValue; }            // form.reset()
  _restoreState(state) { if (typeof state === 'string') this.value = state; } // autofill / bfcache
}

if (!customElements.get('site-slug-input')) {
  customElements.define('site-slug-input', SiteSlugInput);
}
```

```html
<form id="post-form">
  <site-slug-input name="slug" label="Đường dẫn" required value="bai-viet-moi"></site-slug-input>
  <button type="submit">Lưu</button>
  <button type="reset">Đặt lại</button>
</form>

<script type="module">
  import './site-slug-input.js';
  const form = document.getElementById('post-form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    console.log(new FormData(form).get('slug')); // 'bai-viet-moi'
  });
  // Lỗi từ server:
  // form.querySelector('site-slug-input').setError('Đường dẫn đã tồn tại.');
</script>
```

Điều ví dụ này cho bạn "miễn phí": giá trị có trong `FormData`, trình duyệt chặn submit và hiện bong bóng khi trống hoặc
sai định dạng, nút "Đặt lại" trả về `bai-viet-moi`, `<fieldset disabled>` vô hiệu nó, `setError()` hiện ghi chú lỗi có
ARIA đầy đủ.

## Quy ước khi viết component cho site

- **Tên thẻ**: phải có dấu gạch nối; dùng tiền tố của site (`site-`, `dwp-`, `k135-`…), **không** dùng `td-` để tránh
  đụng component tương lai của kit.
- **Đăng ký có kiểm tra** `if (!customElements.get(tag))` để import lặp không ném lỗi.
- **Không sửa lõi**: kế thừa, không monkey-patch class của kit. Method/property bắt đầu bằng `_` là nội bộ, có thể đổi
  giữa các bản 0.x (trừ những hook protected được ghi ở trang này).
- **Event**: dùng `this.emit(tên, detail)`; tên kebab-case (`count-change`). Nếu phát `change`/`input` trên host thì
  chặn event native cùng tên từ control bên trong để trang chỉ nhận một event.
- **Nhãn**: nếu component có chuỗi hiển thị, gom vào `static labels = {…}` để site đổi ngôn ngữ (cách `TdTable.labels`).
- **Trợ năng**: dùng phần tử native (`<button>`, `<input>`) thay vì `div` có `role`; tên truy cập qua
  `_applyAccessibleName` với control form.
- **Kiểm thử**: xem cách kit test (`src/base/td-form-element.browser-test.js` dựng một control tối thiểu và kiểm
  FormData, reset, fieldset, label).

## Lưu ý & lỗi thường gặp

- **Gõ chữ xong, đổi một attribute khác thì chữ mất**: render lại dựng input mới từ attribute. Giữ giá trị sống trong JS
  (như `_value` ở ví dụ) và render từ đó.
- **Handler chạy 2, 3 lần**: bạn `listen(this, …)` / `listen(document, …)` trong `afterRender()`. Chuyển sang
  `connectedCallback()` hoặc constructor.
- **Override `connectedCallback` / `disconnectedCallback` / `attributeChangedCallback` mà quên `super.…`**: không render,
  không dọn dẹp, hoặc mất đồng bộ `disabled`/`error-text` (với `TdFormElement`).
- **Quên spread `super.observedAttributes`** trong lớp con của `TdFormElement`: `name`/`disabled`/`required` không còn
  được theo dõi.
- **Ghi chú lỗi biến mất sau khi đổi attribute**: thiếu `this._applyErrorState()` trong `afterRender()`.
- **Style không ăn**: component của bạn không có CSS trong `td.css`; phải tự viết CSS (không Shadow DOM, CSS toàn cục).
- **Trình duyệt cũ không có `ElementInternals`**: xem [yêu cầu hệ thống](../getting-started/requirements.md).

## Xem thêm

- [Cách component hoạt động](../concepts/how-it-works.md) · [Mở rộng kit](../customization/extending.md)
- [Forms](../guides/forms.md) · [Form validation](form-validation.md) · [Bảo mật](../guides/security.md) ·
  [CSP](../guides/csp.md)
- [Utilities](utilities.md) · [Icons](icons.md)
