[Tài liệu](../README.md) › Tuỳ biến › Mở rộng kit

# Mở rộng kit: component riêng, icon, menu plugin, dịch nhãn, kết hợp

Khi token ([theming.md](theming.md)), CSS ([styling.md](styling.md)) và hook ([hooks.md](hooks.md)) chưa đủ, bạn mở
rộng kit **từ phía site** — không sửa lõi. Trang này hướng dẫn năm việc:

1. [Tự viết component](#tự-viết-component) trên nền `TdBaseElement` / `TdFormElement`.
2. [Đăng ký icon](#đăng-ký-icon) riêng của site vào registry dùng chung.
3. [Dùng registry menu cho plugin](#registry-menu-cho-plugin).
4. [Dịch nhãn sang ngôn ngữ khác](#dịch-nhãn-sang-ngôn-ngữ-khác) (mọi object nhãn, và những chữ chưa dịch được).
5. [Kết hợp component](#kết-hợp-component) với nhau.

## Tự viết component

Tài liệu đầy đủ của lớp nền (mọi method, lifecycle, `td-sample`): [base-element.md](../components/base-element.md).
Phần dưới là quy trình thực hành và những luật bạn nên giữ để component của site "cư xử" giống kit.

### Chọn lớp nền

| Lớp | Import | Dùng khi |
|---|---|---|
| `TdBaseElement` | `import { TdBaseElement } from '@dazzxq/td-components/base';` | Component hiển thị / tương tác, **không** gửi giá trị trong `<form>` |
| `TdFormElement` | `import { TdFormElement } from '@dazzxq/td-components/form-element';` | Control có giá trị gửi qua `FormData`, `required`, reset, `<fieldset disabled>` (ElementInternals) |

`TdBaseElement` cho sẵn:

- Render **một lần** khi gắn vào trang: `innerHTML = render()` → `afterRender()` → `_applyStyles()` (nếu có). Khi một
  attribute trong `observedAttributes` đổi, render lại toàn bộ.
- Property tự sinh cho mỗi attribute được theo dõi (`max-value` → `el.maxValue`); attribute trong
  `booleanAttributes` thành property boolean.
- `listen(target, event, handler)`, `setTimeout()`, `setInterval()` tự gỡ khi element rời trang.
- `emit(name, detail)`: phát `CustomEvent` có `bubbles: true, composed: true`.
- `escapeHtml(str)` (cho text và attribute trong chuỗi HTML), `safeColor(value, fallback)` (cho màu đi vào CSS).

`TdFormElement` thêm: `_setFormValue(value, state?)`, `_setValidity(flags, message, anchor)`, `checkValidity()`,
`reportValidity()`, `setCustomValidity()`, reset tự khôi phục attribute `value` ban đầu, `_effectiveDisabled` (tính cả
`<fieldset disabled>`), và — nếu `static get errorContract() { return true; }` — `setError()` / `clearError()` /
attribute `error-text`.

### Luật nên giữ

| Luật | Vì sao |
|---|---|
| Tên thẻ và class dùng **tiền tố của site** (`site-`, `dwp-`), không dùng `td-` | `td-` là của kit; bản sau có thể thêm component trùng tên |
| Mọi giá trị động trong chuỗi HTML đi qua `this.escapeHtml()` | Chống XSS (render bằng `innerHTML`) |
| Không `style="…"`, không `<style>`; giá trị per-instance dùng `_applyStyles()` + `el.style.setProperty('--x', …)` | Kit CSP-strict; CSSOM không bị CSP chặn |
| Màu từ attribute đi qua `this.safeColor()` trước khi vào CSS | Chặn giá trị lạ lọt vào CSS |
| CSS của component nằm trong file CSS của site, **chỉ đọc token** `--td-*` | Tự đổi theo theme, dark, fallback |
| Trạng thái thể hiện bằng `aria-*` / `data-state` / `[hidden]`, không bật tắt class | Giống quy ước của kit, dễ style |
| Guard khi define: `if (!customElements.get(name)) customElements.define(name, Cls)` | Module bị nạp hai lần không ném lỗi |
| Bind event trong `afterRender()` lên **phần tử con** bằng `this.listen()` | Phần tử con được thay mỗi lần render nên listener cũ đi theo; listen lên chính host trong `afterRender()` sẽ bị cộng dồn |

Các hàm `escapeHtml` / `safeColor` **chỉ** có dưới dạng method của lớp nền (file `src/utils/escape.js`,
`css-safe.js` không nằm trong `exports` của package). Tiện ích độc lập có export: `@dazzxq/td-components/dom-utils`
(`debounce`, `throttle`, `contrastRatio`, `getAccessibleTextColor`…), xem [utilities.md](../components/utilities.md).

### Ví dụ: `<site-rating>` gửi được trong form

```js
// site-rating.js
import { TdFormElement } from '@dazzxq/td-components/form-element';
import { fillIconSlots } from '@dazzxq/td-components/icons';

export class SiteRating extends TdFormElement {
  static get observedAttributes() {
    return [...super.observedAttributes, 'value', 'max', 'label', 'color', 'error-text'];
  }

  static get booleanAttributes() { return [...super.booleanAttributes]; }

  static get errorContract() { return true; }        // có setError()/clearError()/error-text

  _max() { return Math.min(10, Math.max(1, parseInt(this.getAttribute('max'), 10) || 5)); }

  _value() { return Math.min(this._max(), Math.max(0, parseInt(this.getAttribute('value'), 10) || 0)); }

  render() {
    const max = this._max();
    const value = this._value();
    const label = this.escapeHtml(this.getAttribute('label') || 'Đánh giá');
    const disabled = this._effectiveDisabled ? ' disabled' : '';
    let stars = '';
    for (let i = 1; i <= max; i += 1) {
      stars += `<button type="button" class="site-rating__star" data-value="${i}"`
        + ` aria-pressed="${i <= value}" aria-label="${i} / ${max}"${disabled}>`
        + '<span data-td-icon="star" aria-hidden="true"></span></button>';
    }
    return `<div class="site-rating" role="group" aria-label="${label}">${stars}</div>`;
  }

  afterRender() {
    fillIconSlots(this);                               // vẽ icon registry vào các slot data-td-icon
    const root = this.querySelector('.site-rating');
    this.listen(root, 'click', (e) => {
      const star = e.target.closest('.site-rating__star');
      if (!star || this._effectiveDisabled) return;
      const n = Number(star.getAttribute('data-value'));
      this.setAttribute('value', String(n));           // → render lại → afterRender → _syncForm
      this.querySelector(`[data-value="${n}"]`)?.focus();   // innerHTML mới: trả focus về nút vừa bấm
      this.emit('change', { value: n });
    });
    this._syncForm();
  }

  _applyStyles() {                                     // gọi sau mỗi render
    // Chỉ gỡ giá trị do chính component đặt: biến site tự đặt inline trên host được giữ (0.16.0).
    this._setOwnedStyle('--site-rating-color', this.safeColor(this.getAttribute('color'), ''));
  }

  _syncForm() {
    const v = this._value();
    this._setFormValue(v ? String(v) : null);          // null = không gửi
    if (this.hasAttribute('required') && !v) {
      this._setValidity({ valueMissing: true }, 'Vui lòng chọn số sao', this._focusTarget());
    } else {
      this._setValidity({});
    }
  }
}

if (!customElements.get('site-rating')) customElements.define('site-rating', SiteRating);
```

```css
/* site.css — chỉ đọc token của kit */
site-rating { display: inline-block; }

.site-rating {
  display: inline-flex;
  gap: var(--td-space-2xs);
  font-family: var(--td-font-sans);
}

.site-rating__star {
  display: inline-grid;
  place-items: center;
  min-width: var(--td-touch-min);
  min-height: var(--td-touch-min);
  padding: 0;
  color: var(--td-control-border-hover);
  background: none;
  border: 0;
  border-radius: var(--td-radius-md);
  cursor: pointer;
}

.site-rating__star[aria-pressed="true"] { color: var(--site-rating-color, var(--td-accent)); }
.site-rating__star:hover:not(:disabled) { background: var(--td-color-hover); }
.site-rating__star:focus-visible { outline: 2px solid transparent; box-shadow: var(--td-focus-ring); }
.site-rating__star:disabled { cursor: not-allowed; color: var(--td-btn-disabled-fg); }
```

```html
<form>
  <site-rating name="rating" label="Chất lượng bài viết" max="5" required></site-rating>
  <td-button type="submit" variant="primary">Gửi</td-button>
</form>
```

Component này tự có: gửi `rating=4` trong `FormData`, chặn submit khi `required` mà chưa chọn, reset về `value` ban
đầu, vô hiệu theo `<fieldset disabled>`, `<label for>` ngoài focus nút đầu, và `setError('…')` hiển thị lỗi giống
control của kit (nên TdFormValidation cũng dùng được với nó).

Đánh đổi của cách "render lại toàn bộ": focus bị mất vì DOM bị thay (ví dụ trên tự trả focus). Component có animation
hoặc nhiều trạng thái tạm (như td-toggle, td-tabs trong kit) nên cập nhật DOM tại chỗ thay vì đổi attribute được theo
dõi.

### Đóng góp component vào lõi kit

Nếu component hữu ích cho mọi site, nó thuộc về repo kit chứ không phải repo site. Quy trình tóm tắt (chi tiết trong
`docs/internal/conventions.md` và `docs/internal/architecture.md`): JS trong `src/<nhóm>/td-<tên>.js`; CSS trong
`src/styles/components/<tên>.css` bọc `@layer td.component { … }` (token trong `@layer td.tokens { :root { … } }`),
thêm vào `src/styles/manifest.json` giữa `glass.css` và `utilities.css`, chạy `npm run build:css`; thêm subpath vào
`exports` của `package.json`, fixture test `test/contracts/<tên>.html` (chỉ trong repo, không ship), markup mẫu trong
trang tài liệu của component, test, story, và cập nhật CHANGELOG.

## Đăng ký icon

Mọi icon của kit (nút, menu, toolbar lightbox, tabs, empty-state, alert) được vẽ **theo tên** từ một registry dùng
chung. Icon core: `close check prev next up down back plus minus more search calendar fullscreen download external
info success error warning eye eye-off zoom-in inbox star upload link image sort` (hình học Lucide). Danh sách luôn
đúng: `listIcons()`.

### Thêm icon của site

```js
// site-icons.js — nạp TRƯỚC module component đầu tiên
import { registerIcons } from '@dazzxq/td-components/icons';

registerIcons({
  'site-camera': {
    viewBox: '0 0 24 24',                 // mặc định '0 0 24 24'
    paint: 'stroke',                      // 'stroke' (nét, mặc định) | 'fill' (tô)
    nodes: [
      ['rect', { x: 3, y: 7, width: 18, height: 13, rx: 2 }],
      ['circle', { cx: 12, cy: 13.5, r: 3.5 }],
      ['path', { d: 'M9 7l1.5-3h3L15 7' }],
    ],
  },
});
```

Rồi dùng tên ở bất kỳ đâu nhận icon:

```html
<td-button variant="secondary" icon="site-camera">Chụp ảnh</td-button>
<td-empty-state icon="site-camera" title="Chưa có ảnh"></td-empty-state>
<span data-td-icon="site-camera" aria-hidden="true"></span>   <!-- slot: vẽ bằng fillIconSlots(root) -->
```

```js
import { tdIcon } from '@dazzxq/td-components/icons';
import { TdMenu } from '@dazzxq/td-components/menu';

button.appendChild(tdIcon('site-camera', { size: 'l', label: 'Chụp ảnh' }));  // label có → role="img"
TdMenu.open(anchor, [{ label: 'Chụp ảnh', icon: 'site-camera', onSelect: capture }]);
```

Phần tử khai báo `<td-icon name="site-camera" size="m" label="">` có sẵn khi import `@dazzxq/td-components/icon-element`.

### Luật của registry

| Luật | Chi tiết |
|---|---|
| Tên | `^[a-z][a-z0-9-]{0,63}$`. Nên có tiền tố site (`site-`, `dwp-`) |
| Trùng tên | Ném lỗi (tên core là dành riêng). Một lần `registerIcons` là **tất cả hoặc không**: một định nghĩa hỏng → không icon nào được thêm |
| Chỉ dữ liệu | Tag cho phép: `path circle rect line polyline polygon ellipse`. Attribute cho phép: hình học (`d`, `points`, `cx`, `cy`, `r`, `rx`, `ry`, `x`, `y`, `x1`…`y2`, `width`, `height`), `fill-rule`, `clip-rule`, `opacity`, `fill-opacity`, `stroke-opacity`. Không `style`, không `href`, không `<g>`, không chuỗi SVG |
| Giới hạn | Tối đa 64 hình mỗi icon, mỗi giá trị ≤ 8000 ký tự, `viewBox` gồm 4 số |
| Màu | Icon luôn dùng `currentColor`; đổi màu bằng `color` của phần tử cha |

**Đăng ký trước khi render.** Component tra tên lúc render. Nếu tên chưa có:

- `td-button` coi giá trị `icon` là danh sách class cũ (kiểu Font Awesome) và render `<i class="site-camera">`;
- `td-empty-state` về icon `inbox` + `console.warn`;
- `tdIcon()` trả `null` + `console.warn`.

Vì vậy hãy import `site-icons.js` trước các module component (hoặc ít nhất trước khi HTML có component được parse).

### Chuyển một file SVG thành định nghĩa

`svgStringToDefinition(str)` (export từ `./icons`) phân tích chuỗi SVG theo cùng allowlist và trả về định nghĩa (hoặc
`null` nếu có thứ không được phép). Hàm cần `DOMParser`, nên chạy trong console trình duyệt, rồi dán kết quả JSON vào
`registerIcons`:

```js
import { svgStringToDefinition } from '@dazzxq/td-components/icons';
console.log(JSON.stringify(svgStringToDefinition(svgText), null, 2));
```

SVG có `<g>`, `transform`, `<use>`, gradient hay `style` sẽ bị từ chối: làm phẳng trong trình vẽ (hoặc lấy icon từ
bộ Lucide) trước.

### Icon dùng một lần

Không muốn đăng ký tên? Các chỗ sau nhận `SVGElement` tin cậy do site tự dựng (được clone): `iconNode` của item menu,
`iconNode` của nút toolbar lightbox, property `iconNode` của `td-empty-state`. Không chỗ nào nhận chuỗi markup.

### Render phía server (PHP)

`td_icon('close')` của [adapter PHP](../guides/php-adapter.md#td_icon-và-icon-riêng-của-site) (`php/td.php`) đọc
`src/icons/icons.json` (export `./icons.json`, file nguồn của icon core) và in đúng markup `tdIcon()` của JS (xem
[Icons › Markup](../components/icons.md#markup-hợp-đồng-ssr)). Icon đăng ký bằng `registerIcons()` của JS **không** có
trong file đó: giữ định nghĩa của site ở một file JSON dữ liệu dùng chung, đăng ký nó cho PHP bằng
`TdComponents\Td::registerIcons(…)` và cho JS bằng `registerIcons(…)`. Xem thêm [WordPress & PHP](../guides/wordpress-php.md).

## Registry menu cho plugin

`TdMenu` có một registry theo tên để nhiều module cùng góp mục vào một menu mà không sửa code của nhau (API đầy đủ ở
[hooks.md › TdMenu](hooks.md#tdmenu), ví dụ đầy đủ ở [công thức 3](hooks.md#3-menu-plugin-thêm-mục-vào-menu-của-lõi)).

Mô hình:

```js
import { TdMenu } from '@dazzxq/td-components/menu';

// Lõi: danh sách gốc (gọi lại define = thay thế)
TdMenu.define('media-actions', (ctx) => [
  { label: 'Chèn vào bài', onSelect: (c) => insert(c.mediaId) },
  { label: 'Xoá', danger: true, onSelect: (c) => remove(c.mediaId) },
]);

// Plugin: góp thêm, trả về hàm gỡ
const unregister = TdMenu.register('media-actions',
  { label: 'Tạo ảnh thu nhỏ', icon: 'image', onSelect: (c) => thumbnail(c.mediaId), when: (c) => c.type === 'image' },
  { group: 'plugin-thumbnail', order: 500 });

// Trang: một lần
TdMenu.bindAll();
```

```html
<button type="button" data-td-menu="media-actions" data-td-menu-media-id="42" data-td-menu-type="image"
        aria-label="Tuỳ chọn tệp">…</button>
```

Quy ước nên theo:

- **Tên menu** là hợp đồng giữa lõi và plugin: đặt theo đối tượng (`post-actions`, `media-actions`), ghi vào tài liệu
  của site.
- **Thứ tự**: mục gốc có `order` = chỉ số × 10 (0, 10, 20…); chừa khoảng để plugin chen vào (15, 25). Không đặt
  `order` → plugin nằm cuối (1000).
- **Nhóm**: mỗi plugin một `group` riêng → kit tự chèn separator giữa các nhóm.
- **Điều kiện**: dùng `when(ctx)` thay vì define lại cả menu. `when` ném lỗi → mục bị ẩn (an toàn).
- **Dữ liệu**: `data-td-menu-*` → `ctx` (camelCase, luôn là **chuỗi**). Dữ liệu không phải chuỗi truyền qua
  `TdMenu.open(anchor, 'name', { ctx: { … } })` hoặc `TdMenu.bind(trigger, 'name', { ctx })`.
- **Gỡ plugin**: gọi `unregister()`; menu đang mở không đổi, lần mở sau không còn mục đó.
- Thứ tự nạp module không quan trọng: registry được đọc lúc **mở** menu. `TdMenu.has(name)` cho biết đã có gì chưa.

## Dịch nhãn sang ngôn ngữ khác

Mọi chữ mặc định của kit là tiếng Việt. Kit không có hệ i18n; thay vào đó mỗi component lộ ra **object nhãn** để site
ghi đè. Cách làm chuẩn: một module `i18n-<ngôn ngữ>.js` nạp **một lần, trước** khi component render, dùng
`Object.assign` (giữ các khoá bạn không dịch).

### Object nhãn có thể ghi đè

| Object | Import | Khoá | Phạm vi / lúc được đọc |
|---|---|---|---|
| `options.labels` (theo từng lần gọi) | `@dazzxq/td-components/lightbox` | `dialog prev next close back fullscreen download info` (chuỗi), `counter(i, n)` (hàm) | Mỗi `TdLightbox.open()` / `bind()` — không có object tĩnh |
| `TdHovercard.labels` | `@dazzxq/td-components/hovercard` | `loading error dialog` | Mỗi lần mở thẻ |
| `TdMenu.labels` | `@dazzxq/td-components/menu` | `trigger` | Khi tạo `TdMenu.button()` |
| `TdModal.labels` | `@dazzxq/td-components/modal` | `close confirm cancel ok confirmTitle confirmMessage successTitle errorTitle infoTitle` (5 khoá cuối từ 0.16.0) | Khi tạo dialog |
| `TdToast.labels` | `@dazzxq/td-components/toast` | `close` (0.16.0), `types` (0.21.0: object `success error warning info` — tiền tố loại cho trình đọc màn hình) | Khi tạo mỗi toast |
| `TdLoading.labels` | `@dazzxq/td-components/loading` | `loading` (0.16.0) | Mỗi `show()` / `wrap()` không truyền `message` |
| `TdDatetimePicker.labels` | `@dazzxq/td-components/datetime-picker` | `title placeholder date day month year time hour minute close now confirm` | Khi render / mở picker |
| `TdDatetimePicker.messages` | như trên | `required format incomplete day month year hour minute date min max` (`{min}` `{max}`) | Khi kiểm tra giá trị |
| `TdInputField.messages` | `@dazzxq/td-components/input-field` | `valueMissing tooLong tooShort patternMismatch badInput typeMismatchEmail typeMismatchUrl rangeUnderflow rangeOverflow stepMismatch dateInvalid dateUnderflow dateOverflow unitChar unitWord` (`{min}` `{max}` `{minLength}` `{maxLength}` `{unit}`) | Khi tính validity / bộ đếm (0.16.0) |
| `TdSlider.messages` | `@dazzxq/td-components/slider` | `rangeUnderflow rangeOverflow stepMismatch` (`{min}` `{max}` `{step}`) | Khi tính validity (0.16.0) |
| `TdCheckbox.messages` / `TdToggle.messages` | `@dazzxq/td-components/checkbox` / `…/toggle` | `valueMissing` | Khi tính validity (0.16.0) |
| `TdChipInput.labels` | `@dazzxq/td-components/chip-input` | `remove create chips added removed duplicate results noResults loading error max required` (`{label}` `{text}` `{n}` `{max}`) | Mỗi lần dùng; `el.messages` ghi đè cho một instance |
| `TdTable.labels` | `@dazzxq/td-components/table` | `table loading paginationTop paginationBottom itemLabel emptyTitle emptyText` | Khi render (cấu trúc) / cập nhật |
| `TdDropdown.labels` | `@dazzxq/td-components/dropdown` | `search none noResults required` | Khi render menu / danh sách / kiểm tra `required` |
| `TdPagination.labels` | `@dazzxq/td-components/pagination` | `prev next page info item` (`{n}`; `{from}` `{to}` `{total}` `{item}`) | Mỗi lần render (`item-label` thắng `item`) |
| `TdEmptyState.labels` | `@dazzxq/td-components/empty-state` | `action` | Khi dựng nút hành động thiếu `label` |
| `TdFormValidation.labels` | `@dazzxq/td-components/form-validation` | `summaryTitle` | Khi hiện summary |
| `TdFormValidation.messages` | như trên | `ruleError valueMissing typeMismatch typeMismatchEmail typeMismatchUrl badInput patternMismatch tooShort tooLong rangeUnderflow rangeOverflow stepMismatch` (`{min}` `{max}` `{minLength}` `{maxLength}` `{step}`) | Khi validate (control **native**) |

Giá trị mặc định từng khoá: [hooks.md](hooks.md) (mục của từng component).

### Chữ đổi được qua attribute / option (không có object nhãn)

| Component | Cách đổi |
|---|---|
| td-dropdown | `placeholder` (chữ trên trigger khi chưa chọn) |
| td-chip-input, td-input-field, td-datetime-picker… | `label`, `placeholder`, `helper-text`, `error-text` |
| td-pagination | `item-label` (mặc định `TdPagination.labels.item`), `aria-label` (mặc định `Phân trang`) |
| td-tabs | `aria-label` (mặc định `Các thẻ`) |
| td-table | `empty-title`, `empty-text`, `aria-label` |
| td-empty-state | `title`, `message` |
| TdLoading | `TdLoading.show('Loading…')`, `TdLoading.wrap(fn, 'Loading…')` — ghi đè `TdLoading.labels.loading` cho một lần |
| TdModal | `title`, `message`, `confirmText`, `cancelText`, `okText` — `message` mặc định của `success` (`Thao tác đã hoàn tất`) và `error` (`Đã xảy ra lỗi`) không lấy từ `TdModal.labels`, phải truyền mỗi lần |
| TdFormValidation | Option `messages` theo từng field (áp cả cho control td) |
| Control form td | `setError(message)` thay thông điệp hiển thị |

### Chữ **chưa** dịch được (cố định trong source)

Biết trước để không mất công tìm:

| Component | Chữ cố định |
|---|---|
| td-datetime-picker | Định dạng hiển thị `dd/mm/yyyy - hh:mm` (chữ nhãn thì dịch được) |

Thông điệp validation của control td được dùng khi trình duyệt hiện bong bóng lỗi (`reportValidity`) hoặc khi
TdFormValidation không có `messages` cho field đó. Muốn đa ngôn ngữ hoàn chỉnh cho form: luôn dùng
`TdFormValidation.attach(form, { messages })` (hoặc `setError`) với thông điệp của bạn.

### Ví dụ: module `i18n-en.js`

```js
import { TdHovercard } from '@dazzxq/td-components/hovercard';
import { TdMenu } from '@dazzxq/td-components/menu';
import { TdModal } from '@dazzxq/td-components/modal';
import { TdToast } from '@dazzxq/td-components/toast';
import { TdLoading } from '@dazzxq/td-components/loading';
import { TdDatetimePicker } from '@dazzxq/td-components/datetime-picker';
import { TdChipInput } from '@dazzxq/td-components/chip-input';
import { TdInputField } from '@dazzxq/td-components/input-field';
import { TdSlider } from '@dazzxq/td-components/slider';
import { TdCheckbox } from '@dazzxq/td-components/checkbox';
import { TdToggle } from '@dazzxq/td-components/toggle';
import { TdTable } from '@dazzxq/td-components/table';
import { TdDropdown } from '@dazzxq/td-components/dropdown';
import { TdPagination } from '@dazzxq/td-components/pagination';
import { TdEmptyState } from '@dazzxq/td-components/empty-state';
import { TdFormValidation } from '@dazzxq/td-components/form-validation';

export const lightboxLabels = {
  dialog: 'Image viewer', prev: 'Previous image', next: 'Next image', close: 'Close', back: 'Back',
  fullscreen: 'Full screen', download: 'Download', info: 'Image details',
  counter: (i, n) => `${i} of ${n}`,
};                                                   // dùng: TdLightbox.bind(document, { labels: lightboxLabels })

Object.assign(TdHovercard.labels, { loading: 'Loading…', error: 'Could not load content.', dialog: 'More info' });
Object.assign(TdMenu.labels, { trigger: 'Options' });
Object.assign(TdModal.labels, { close: 'Close', confirm: 'Confirm', cancel: 'Cancel', ok: 'OK',
  confirmTitle: 'Confirm', confirmMessage: 'Are you sure?', successTitle: 'Success', errorTitle: 'Error',
  infoTitle: 'Information' });
TdToast.labels.close = 'Close';
TdToast.labels.types = { success: 'Success:', error: 'Error:', warning: 'Warning:', info: 'Info:' };
TdLoading.labels.loading = 'Loading...';

Object.assign(TdDatetimePicker.labels, {
  title: 'Pick date and time', date: 'Date', day: 'Day', month: 'Month', year: 'Year',
  time: 'Time', hour: 'Hour', minute: 'Minute', close: 'Close', now: 'Now', confirm: 'Select',
});
Object.assign(TdDatetimePicker.messages, {
  required: 'Please pick a date and time', format: 'Invalid date/time format',
  incomplete: 'Please enter day, month and year', day: 'Day must be 1–31', month: 'Month must be 1–12',
  year: 'Year must be {min}–{max}', hour: 'Hour must be 0–23', minute: 'Minute must be 0–59',
  date: 'Invalid date', min: 'Must not be before {min}', max: 'Must not be after {max}',
});

Object.assign(TdChipInput.labels, {
  remove: 'Remove {label}', create: 'Add “{text}”', chips: 'Selected', added: 'Added {label}',
  removed: 'Removed {label}', duplicate: '{label} is already added', results: '{n} suggestions',
  noResults: 'No suggestions', loading: 'Searching…', error: 'Could not load suggestions',
  max: 'Limit of {max} items reached', required: 'Please add at least one item',
});

Object.assign(TdInputField.messages, {
  valueMissing: 'This field is required', tooLong: 'Over the {maxLength} {unit} limit',
  tooShort: 'At least {minLength} characters', patternMismatch: 'Invalid format', badInput: 'Invalid value',
  typeMismatchEmail: 'Invalid email address', typeMismatchUrl: 'Invalid URL', rangeUnderflow: 'Minimum is {min}',
  rangeOverflow: 'Maximum is {max}', stepMismatch: 'Invalid step', dateInvalid: 'Invalid date',
  dateUnderflow: 'Earliest date is {min}', dateOverflow: 'Latest date is {max}', unitChar: 'characters', unitWord: 'words',
});
Object.assign(TdSlider.messages, {
  rangeUnderflow: 'Minimum is {min}.', rangeOverflow: 'Maximum is {max}.', stepMismatch: 'Must be a multiple of {step}.',
});
TdCheckbox.messages.valueMissing = 'Please tick this box.';
TdToggle.messages.valueMissing = 'Please turn this on.';

Object.assign(TdTable.labels, {
  table: 'Data table', loading: 'Loading data…', paginationTop: 'Pagination (top)',
  paginationBottom: 'Pagination (bottom)', itemLabel: 'items', emptyTitle: 'No data', emptyText: 'Nothing to show yet.',
});

Object.assign(TdDropdown.labels, {
  search: 'Search', none: 'None', noResults: 'No results', required: 'Please choose an option',
});
Object.assign(TdPagination.labels, {
  prev: 'Previous page', next: 'Next page', page: 'Page {n}', info: 'Showing {from}-{to} of {total} {item}', item: 'items',
});
TdEmptyState.labels.action = 'Do it';

TdFormValidation.labels.summaryTitle = 'Please check the following fields:';
Object.assign(TdFormValidation.messages, {
  ruleError: 'This value could not be checked', valueMissing: 'This field is required',
  typeMismatch: 'Invalid value', typeMismatchEmail: 'Invalid email address', typeMismatchUrl: 'Invalid URL',
  badInput: 'Invalid value', patternMismatch: 'Invalid format', tooShort: 'At least {minLength} characters',
  tooLong: 'At most {maxLength} characters', rangeUnderflow: 'Minimum is {min}', rangeOverflow: 'Maximum is {max}',
  stepMismatch: 'Invalid step',
});
```

```html
<html lang="en">
  <script type="module" src="/assets/i18n-en.js"></script>   <!-- trước module khởi tạo trang -->
  <script type="module" src="/assets/app.js"></script>
```

Lưu ý:

- Đặt `lang` trên `<html>` đúng ngôn ngữ (trình đọc màn hình chọn giọng đọc theo đó).
- Object nhãn là **toàn trang** (dùng chung mọi instance). Đổi giữa chừng chỉ có hiệu lực ở lần render / mở sau.
- Khi nâng cấp kit, xem CHANGELOG: bản mới có thể thêm khoá nhãn mới (khoá thiếu sẽ hiện tiếng Việt).

## Kết hợp component

Component được thiết kế để lồng nhau: mỗi lớp nổi đăng ký vào **một** registry lớp chung (`utils/layers.js`) nên thứ
tự bàn phím, `inert` và focus luôn đúng dù bạn mở menu trên lightbox hay dropdown trong modal.

| Lớp (thấp → cao) | Component |
|---|---|
| 350 | TdLightbox |
| 400 | TdModal (và picker của td-datetime-picker, vốn là một TdModal) |
| 450 | TdMenu, TdHovercard, menu của td-dropdown, popup của td-chip-input |
| 480 | TdLoading |
| 500 | TdToast (nút đóng vẫn nằm trong vòng Tab của modal) |
| 510 | Tooltip |

Lớp cao hơn nhận Escape / Tab trước; modal và loading làm `inert` mọi thứ bên dưới. Bên trong kit cũng tự kết hợp:
td-table dùng td-pagination + td-empty-state, td-datetime-picker mở TdModal.

### Modal chứa form + validation + loading nút

```js
import '@dazzxq/td-components/input-field';
import { TdModal } from '@dazzxq/td-components/modal';
import { TdFormValidation } from '@dazzxq/td-components/form-validation';
import { TdToast } from '@dazzxq/td-components/toast';

const form = document.createElement('form');
form.innerHTML = '<td-input-field name="current" type="password" label="Mật khẩu hiện tại" required></td-input-field>'
  + '<td-input-field name="next" type="password" label="Mật khẩu mới" required></td-input-field>';

TdModal.show({
  title: 'Đổi mật khẩu',
  body: form,
  actions: [
    { label: 'Hủy', value: false },
    {
      label: 'Lưu',
      variant: 'primary',
      value: true,
      onClick: async () => {                                  // Promise → nút bận, dialog chờ
        if (!TdFormValidation.validate(form).valid) return false;   // giữ mở
        const res = await fetch('/api/password', { method: 'POST', body: new FormData(form) });
        if (res.status === 422) {
          TdFormValidation.apply(form, (await res.json()).errors);
          return false;                                             // giữ mở, lỗi hiện dưới field
        }
        TdToast.success('Đã đổi mật khẩu');                        // resolve khác false → đóng
      },
    },
  ],
});
```

Chuỗi `innerHTML` ở trên là markup hằng do developer viết (không chứa dữ liệu người dùng), nên an toàn.

### Menu mở từ nút toolbar của lightbox

```js
import { TdLightbox } from '@dazzxq/td-components/lightbox';
import { TdMenu } from '@dazzxq/td-components/menu';
import { TdToast } from '@dazzxq/td-components/toast';

TdLightbox.bind(document, {
  toolbar: [{
    id: 'more',
    label: 'Thêm',
    icon: 'more',
    onClick: (ctx, button) => TdMenu.open(button, [
      { label: 'Sao chép liên kết', icon: 'link',
        onSelect: () => navigator.clipboard.writeText(ctx.item.src).then(() => TdToast.success('Đã sao chép')) },
      { label: 'Mở ảnh gốc', icon: 'external', href: ctx.item.src, newTab: true },
    ], { side: 'top', align: 'end' }),
  }],
});
```

Menu (lớp 450) nằm trên lightbox (350) nên Escape đóng menu trước, lần Escape sau mới đóng lightbox. `ctx` được chụp
lúc bấm: với dữ liệu luôn mới nhất, đọc `ctx.handle.index` khi chọn.

### Dropdown, chip-input, tooltip, hovercard trong modal

Chạy sẵn, không cần cấu hình: popup của chúng nằm ở lớp cao hơn modal (dialog luôn nền đặc, popup giữ bề mặt của
nó). Tab từ menu dropdown quay về trigger, rồi tiếp tục trong vòng Tab của modal.

### Dùng component của kit trong component của site

Trong `render()` của component site, cứ viết thẻ kit như HTML thường và import module của chúng:

```js
import '@dazzxq/td-components/button';
import { TdBaseElement } from '@dazzxq/td-components/base';

class SiteShareBar extends TdBaseElement {
  static get observedAttributes() { return ['url']; }

  render() {
    return '<div class="site-share">'
      + '<td-button variant="secondary" size="sm" icon="link" data-act="copy">Sao chép</td-button>'
      + '</div>';
  }

  afterRender() {
    this.listen(this.querySelector('.site-share'), 'click', (e) => {
      if (e.target.closest('[data-act="copy"]')) navigator.clipboard.writeText(this.getAttribute('url') || location.href);
    });
  }
}

if (!customElements.get('site-share-bar')) customElements.define('site-share-bar', SiteShareBar);
```

Khi component của bạn render lại, các thẻ kit con được tạo mới (mất trạng thái nội bộ như giá trị đang gõ). Đặt thẻ kit
có trạng thái (input, dropdown) ở chỗ **không** bị render lại, hoặc truyền giá trị lại qua attribute.

## Xem thêm

- [base-element.md](../components/base-element.md): tài liệu đầy đủ `TdBaseElement`, `TdFormElement`, `td-sample`.
- [icons.md](../components/icons.md): `tdIcon`, `<td-icon>`, danh sách icon core.
- [menu.md](../components/menu.md): TdMenu đầy đủ.
- [hooks.md](hooks.md): danh mục hook và giá trị mặc định của mọi nhãn.
- [../concepts/how-it-works.md](../concepts/how-it-works.md): light DOM, lifecycle, lớp nổi, i18n nhãn.
- [../guides/security.md](../guides/security.md): escaping theo ngữ cảnh khi tự viết component.
