[Tài liệu](../README.md) › [Nâng cấp](README.md) › Bảng đổi class

# Bảng đổi class: legacy → BEM token-native

Từ 0.7.0 tới 0.10.0 mọi component bỏ class Tailwind và class tự đặt kiểu cũ, chuyển sang class **BEM** được style
bởi `td.css`. Nếu site có CSS (hoặc JS, test) nhắm vào phần **bên trong** component theo class cũ, dùng bảng này để
đổi selector. Kit **không ship alias** cho class cũ ([ADR 0008](../internal/decisions/0008-drop-tailwind-token-css.md)):
selector cũ chỉ im lặng không còn khớp gì.

Mọi dòng trong bảng đối chiếu với source (nếu lệch, tin source): markup trong `src/**/*.js` và CSS trong
`src/styles/components/*.css`. Cột "Nguồn legacy" cho biết class cũ đến từ đâu:

- **td ≤ 0.x** — markup cũ của chính td-components thời dùng Tailwind (trước bản ghi ở cột "Từ bản").
- **dcms** — thư viện dcms-components gốc (component được port sang td ở 0.12.0).
- **dwp / 135** — code riêng của site dwp (WordPress) và 135 (PHP thuần) trước khi dùng td.

## Cách dùng bảng này

1. Tìm trong CSS / JS / test của site mọi chỗ dùng class cũ, ví dụ:

   ```bash
   grep -rnE "td-(input|modal|toast|tooltip|dropdown|slider|pagination|tab|empty|table|dtp|checkmark|toggle)-" \
     --include='*.css' --include='*.js' --include='*.php' .
   grep -rn "toast-item\|dcms-chip-search-field\|dcms-form-error-note\|dwp-menu" \
     --include='*.css' --include='*.js' --include='*.php' .
   ```

2. Thay theo bảng. Chú ý cột **Trạng thái**: trạng thái (đang mở, đang chọn, lỗi, disabled…) **không còn là class**
   mà là attribute.
3. Đặt CSS tuỳ biến ngoài `@layer` (CSS không layer luôn thắng `td.css`), xem
   [styling.md](../customization/styling.md). Ưu tiên ghi đè token `--td-*` thay vì style class bên trong
   ([theming.md](../customization/theming.md)).

**Luật trạng thái:** JS của kit không bật/tắt class để đổi giao diện. Trạng thái nằm ở `aria-*`, `[hidden]`,
`:checked` / `:disabled`, `data-state` và vài `data-*` khác. Ví dụ selector:

```css
/* Trước: class trạng thái do JS bật/tắt */
.td-dtp-wheel-option.selected { font-weight: 700; }
.td-toggle-track--active { background: green; }

/* Sau: selector theo attribute / pseudo-class */
.td-dtp-wheel__option[aria-selected="true"] { font-weight: 700; }
.td-switch__input:checked + .td-switch__track { background: green; }
```

Ký hiệu trong bảng: `.a` / `.b` nghĩa là dòng tương ứng từng cặp; `(+ __x)` là phần tử con mới không có bản cũ;
"bỏ" nghĩa là phần tử không còn tồn tại.

---

## td-button

`import '@dazzxq/td-components/button'` — bản BEM từ **0.7.0**.

| Nguồn legacy | Class cũ | Class / attribute hiện tại | Trạng thái | Từ bản |
|---|---|---|---|---|
| td ≤ 0.6 | `<button>` với utility Tailwind | `button.td-btn.td-btn--{primary\|secondary\|success\|danger\|warning\|info}.td-btn--{sm\|md\|lg}` (+ `.td-btn--full`, `.td-btn--custom`) | `:disabled`, `[aria-busy="true"]` + `[aria-disabled="true"]` khi `loading` | 0.7.0 |
| td ≤ 0.6 | spinner `svg.animate-spin` | `span.td-btn__spinner.td-spinner.td-spinner--sm` > `svg.td-spinner__svg` (`circle.td-spinner__track`, `circle.td-spinner__arc`) | `[hidden]` khi không loading | 0.7.0 |
| td ≤ 0.6 | `span` chữ / `<i class="fa …">` | `span.td-btn__label` / `span.td-btn__icon` (icon registry `svg.td-icon`) | — | 0.7.0 |

Ghi chú: `.td-btn--custom` được thêm khi dùng `color` / `text-color`; màu riêng lấy từ custom property
`--td-btn-bg` / `--td-btn-fg` trên host. Thuộc tính `icon` nhận class Font Awesome vẫn in
`span.td-btn__icon > i.{class}` nhưng đó là đường deprecated.

## td-checkbox

`import '@dazzxq/td-components/checkbox'` — bản BEM từ **0.7.0**.

| Nguồn legacy | Class cũ | Class / attribute hiện tại | Trạng thái | Từ bản |
|---|---|---|---|---|
| td ≤ 0.6 | (không có khối gốc) | `label.td-checkbox.td-checkbox--{sm\|md\|lg}` | — | 0.7.0 |
| td ≤ 0.6 | `.td-checkbox-input` | `input.td-checkbox__input` | `:checked`, `:disabled`, `[aria-invalid="true"]` | 0.7.0 |
| td ≤ 0.6 | `.td-checkmark` / `.td-checkmark-icon` | `span.td-checkbox__mark` / `span.td-checkbox__icon` > `svg.td-checkbox__svg` | theo `.td-checkbox__input:checked ~ …` | 0.7.0 |
| td ≤ 0.6 | `.td-checkbox-label` | `span.td-checkbox__label` | — | 0.7.0 |
| td ≤ 0.6 | `.td-checkbox--disabled` | bỏ | `.td-checkbox__input:disabled` | 0.7.0 |
| td ≤ 0.6 | custom property `--td-cb-color` trên host | `--td-checkbox-color` (host, hoặc thuộc tính `color`) | — | 0.7.0 |
| — | (không có) | thuộc tính / property `indeterminate` trên host → `input.indeterminate` native | `.td-checkbox__input:indeterminate ~ .td-checkbox__mark` (vạch ngang) | 0.36.0 |

Lỗi (error contract): `span.td-field-error#{host-id}-error` sau `label.td-checkbox`.

## td-toggle

`import '@dazzxq/td-components/toggle'` — bản BEM từ **0.7.0**. Khối CSS tên là `.td-switch`.

| Nguồn legacy | Class cũ | Class / attribute hiện tại | Trạng thái | Từ bản |
|---|---|---|---|---|
| td ≤ 0.6 | `.td-toggle-root` + `label[role=switch]` | `label.td-switch.td-switch--{sm\|md\|lg}` + `input.td-switch__input[type=checkbox][role=switch]` | `:checked`, `:disabled`; `[data-pending]` trên `.td-switch` khi `commit()` đang chạy (0.13.0) | 0.7.0 |
| td ≤ 0.6 | `.td-toggle-track` / `.td-toggle-track--active` | `span.td-switch__track` | `.td-switch__input:checked + .td-switch__track` | 0.7.0 |
| td ≤ 0.6 | `.td-toggle-thumb` / `.td-toggle-thumb--active` | `span.td-switch__thumb` | như trên | 0.7.0 |
| td ≤ 0.6 | `.td-toggle-icon` (hai cái) | `span.td-switch__icon.td-switch__icon--off` / `span.td-switch__icon.td-switch__icon--on` | — | 0.7.0 |
| td ≤ 0.6 | `.td-toggle-label` | `span.td-switch__label` | — | 0.7.0 |

## TdLoading và spinner

`import { TdLoading } from '@dazzxq/td-components/loading'` — bản BEM từ **0.7.0**.

| Nguồn legacy | Class cũ | Class / attribute hiện tại | Trạng thái | Từ bản |
|---|---|---|---|---|
| td ≤ 0.6 | `#td-loading` (Tailwind + `.hidden`) | `div#td-loading.td-loading[role=status]` | `[hidden]`, `[data-state="open"]`, `[aria-busy="true"]` | 0.7.0 |
| td ≤ 0.6 | `.td-loading-card` | `div.td-loading__card.td-glass-surface.td-glass-surface--strong` | — | 0.7.0 |
| td ≤ 0.6 | `.td-circular-spinner` | `span.td-loading__spinner.td-spinner.td-spinner--lg` | — | 0.7.0 |
| td ≤ 0.6 | `.td-loading-message` | `p#td-loading-message.td-loading__message` | — | 0.7.0 |
| td ≤ 0.6 | `.td-spinner-track` / `.td-spinner-arc` / `.td-spinner-arc-inline` | `circle.td-spinner__track` / `circle.td-spinner__arc` (trong `svg.td-spinner__svg`) | — | 0.7.0 |

Spinner dùng chung: `.td-spinner.td-spinner--{sm|md|lg}`; màu qua custom property `--td-spinner-color`,
`--td-spinner-track`.

## Thông báo lỗi dùng chung

| Nguồn legacy | Class cũ | Class / attribute hiện tại | Trạng thái | Từ bản |
|---|---|---|---|---|
| td ≤ 0.6 | (mỗi component một kiểu) | `span.td-field-error#{host-id}-error` | control có `[aria-invalid="true"]` + `aria-errormessage` | 0.7.0 |

## td-input-field

`import '@dazzxq/td-components/input-field'` — bản BEM từ **0.8.0**.

| Nguồn legacy | Class cũ | Class / attribute hiện tại | Trạng thái | Từ bản |
|---|---|---|---|---|
| td ≤ 0.7 | `.td-input-field` / `.td-input-wrapper` | `div.td-field.td-field--{sm\|md\|lg}` (+ `.td-field--textarea` hoặc `.td-field--editable`); lớp wrapper bị bỏ | — | 0.8.0 |
| td ≤ 0.7 | `.td-input-label` (+ `span.text-red-500` cho dấu `*`) | `label.td-field__label` (+ `span.td-field__required[aria-hidden]`) | — | 0.8.0 |
| td ≤ 0.7 | `.td-input` (+ `.td-input-{type}`, `.td-input-textarea`, `.td-input-editable`) | `.td-field__control` (`input`, `textarea` hoặc `div[contenteditable][role=textbox]`) | `:focus-visible`, `:disabled`, `[aria-invalid="true"]`, `:placeholder-shown`, `:empty` | 0.8.0 |
| td ≤ 0.7 | `.td-placeholder` | bỏ (placeholder của ô editable vẽ bằng `:empty::before`) | `:empty` | 0.8.0 |
| td ≤ 0.7 | `.td-input-counter` | `div.td-field__counter` (trong `div.td-field__footer`) | `[data-state="limit"]` khi đạt giới hạn | 0.8.0 |
| td ≤ 0.7 | `.td-input-note` | `div.td-field__note` (helper) + `span.td-field-error` (lỗi, hiện cùng lúc) | `[hidden]` | 0.8.0 |
| td ≤ 0.53 | gợi ý riêng từng control (5 control) | `div.td-field__note#{id}-note` trên **mọi** form control (media giữ `.td-media-*__help`); `<td-hint>` cho nội dung giàu; gợi ý **ẩn** khi có lỗi | `[hidden]`, `td-hint[data-td-suppressed]` | 0.54.0 |
| td ≤ 0.53 | (không có) | `td-toggle` `.td-switch__state > .td-switch__state-on / -off` (chữ trạng thái nhìn thấy) | `:checked` của input | 0.54.0 |

## td-slider

`import '@dazzxq/td-components/slider'` — bản BEM từ **0.8.0**.

| Nguồn legacy | Class cũ | Class / attribute hiện tại | Trạng thái | Từ bản |
|---|---|---|---|---|
| td ≤ 0.7 | `.td-slider-container` | `div.td-slider.td-slider--{sm\|md\|lg}` | `[data-dragging]` khi đang kéo | 0.8.0 |
| td ≤ 0.7 | `.td-slider-main-label` / `.td-slider-value-label` | `span.td-slider__label` / `output.td-slider__value` | — | 0.8.0 |
| td ≤ 0.7 | `.td-slider-wrap` + `.td-slider-track-container` | `div.td-slider__control` | — | 0.8.0 |
| td ≤ 0.7 | `.td-slider-track-bg` / `.td-slider-track-active` | `.td-slider__track` / `.td-slider__fill` | độ dài lấy từ custom property `--td-slider-pct` (0…1) trên host | 0.8.0 |
| td ≤ 0.7 | `.td-slider-thumb` / `.td-slider-input` | `.td-slider__thumb` / `input.td-slider__input[type=range]` | `:focus-visible ~`, `:disabled ~` | 0.8.0 |
| td ≤ 0.7 | `.td-slider-step-marks` / `.td-slider-step-mark` / `.td-slider-step-mark-label` | `span.td-slider__marks` / `span.td-slider__mark` / `span.td-slider__mark-label` | — | 0.8.0 |
| td ≤ 0.7 | `.td-slider-step-labels` | `div.td-slider__range` | — | 0.8.0 |

## td-pagination

`import '@dazzxq/td-components/pagination'` — bản BEM từ **0.8.0**.

| Nguồn legacy | Class cũ | Class / attribute hiện tại | Trạng thái | Từ bản |
|---|---|---|---|---|
| td ≤ 0.7 | `.td-pagination-container` | `nav.td-pagination[aria-label]` | — | 0.8.0 |
| td ≤ 0.7 | `.td-pagination-info` | `p.td-pagination__info` | `[aria-live="polite"]` (không có khi `quiet`) | 0.8.0 |
| td ≤ 0.7 | (không có) | `div.td-pagination__controls` (bọc nút trước/sau + danh sách trang) | — | 0.8.0 |
| td ≤ 0.7 | `.td-pagination-prev` / `.td-pagination-next` | `button.td-pagination__nav.td-pagination__nav--prev` / `--next` (icon `span.td-pagination__icon`) | `[aria-disabled="true"]` | 0.8.0 |
| td ≤ 0.7 | `.td-pagination-pages`, `span[data-page]`, `span[data-active-page]` | `ul.td-pagination__pages` > `li` > `button.td-pagination__page[data-page]` | `[aria-current="page"]` | 0.8.0 |
| td ≤ 0.7 | `span` dấu ba chấm | `li.td-pagination__ellipsis[aria-hidden="true"]` | — | 0.8.0 |

## td-tabs

`import '@dazzxq/td-components/tabs'` — bản BEM từ **0.8.0**.

| Nguồn legacy | Class cũ | Class / attribute hiện tại | Trạng thái | Từ bản |
|---|---|---|---|---|
| td ≤ 0.7 | `.td-tabs-container[data-populated]` | `div.td-tabs.td-tabs--{sm\|md}[role=tablist]` | `data-state="empty\|ready"` | 0.8.0 |
| td ≤ 0.7 | `.td-tabs-indicator` | `span.td-tabs__indicator` | vị trí từ custom property `--td-tabs-ind-x` / `--td-tabs-ind-w` trên `.td-tabs` | 0.8.0 |
| td ≤ 0.7 | `.td-tab-btn` (+ class màu chữ xám) | `button.td-tabs__tab[role=tab]` (+ `span.td-tabs__icon`, `span.td-tabs__label`) | `[aria-selected="true"]` | 0.8.0 |

## td-empty-state

`import '@dazzxq/td-components/empty-state'` — bản BEM từ **0.8.0**.

| Nguồn legacy | Class cũ | Class / attribute hiện tại | Trạng thái | Từ bản |
|---|---|---|---|---|
| td ≤ 0.7 | `.td-empty-state-card` | `div.td-empty-state.td-empty-state--{sm\|md\|lg}` (+ `.td-empty-state--compact`) | — | 0.8.0 |
| td ≤ 0.7 | `.td-empty-icon-wrap` / `.td-empty-icon` | `div.td-empty-state__icon` / `svg.td-icon` bên trong | — | 0.8.0 |
| td ≤ 0.7 | `.td-empty-title` / `.td-empty-message` | `h{2–6}.td-empty-state__title` / `p.td-empty-state__message` | — | 0.8.0 |
| td ≤ 0.7 | `.td-empty-actions` (+ nút Tailwind) | `div.td-empty-state__actions` (+ `button.td-btn.td-btn--{primary\|secondary\|danger}.td-btn--sm`) | `[hidden]` khi không có action | 0.8.0 |

## TdModal

`import { TdModal } from '@dazzxq/td-components/modal'` — bản BEM từ **0.9.0**.

| Nguồn legacy | Class cũ | Class / attribute hiện tại | Trạng thái | Từ bản |
|---|---|---|---|---|
| td ≤ 0.8 | gốc `div[id^=td-modal-].fixed.inset-0.hidden` | `div.td-modal.td-modal--{xs\|sm\|md\|lg\|xl\|2xl\|3xl\|4xl\|5xl\|full}` (+ `.td-modal--viewport`) | `[hidden]`, `data-state="opening\|open\|closing"`, `[data-covered]` khi bị dialog khác che | 0.9.0 |
| td ≤ 0.8 | `.td-modal-backdrop` | `div.td-modal__backdrop` | — | 0.9.0 |
| td ≤ 0.8 | các div scroller / aligner | bỏ | — | 0.9.0 |
| td ≤ 0.8 | `.td-modal-content` | `div.td-modal__dialog[role=dialog\|alertdialog][aria-modal="true"]` | — | 0.9.0 |
| td ≤ 0.8 | `.td-modal-header` / `h3.td-modal-title` | `div.td-modal__header` / `h2.td-modal__title` | `[hidden]` | 0.9.0 |
| td ≤ 0.8 | `.td-modal-close` | `button.td-modal__close[aria-label]` (+ `span.td-modal__close-icon`) | `[hidden]` | 0.9.0 |
| td ≤ 0.8 | `.td-modal-body` / `.td-modal-footer` | `div.td-modal__body` / `div.td-modal__footer` | `[hidden]` (footer) | 0.9.0 |
| td ≤ 0.8 | nút footer Tailwind, svg icon của hộp thông báo | `button.td-btn.td-btn--{variant}`; `.td-modal__message.td-modal__message--{success\|error\|info}` > `.td-modal__icon` + `.td-modal__text` | nút đang chạy: `[aria-busy="true"]` | 0.9.0 |

## TdToast

`import { TdToast } from '@dazzxq/td-components/toast'` — bản BEM từ **0.9.0**.

| Nguồn legacy | Class cũ | Class / attribute hiện tại | Trạng thái | Từ bản |
|---|---|---|---|---|
| td ≤ 0.8 | `#td-toast-container` (Tailwind) | `div#td-toast-container.td-toasts` (0.9.0–0.35) → **0.36.0:** `div#td-toast-container.td-toast-root` (portal root, **không** còn `.td-toasts`) | — | 0.9.0 / 0.36.0 |
| td ≤ 0.35 | toast là con trực tiếp của `#td-toast-container` | root > `div.td-toast-lane[data-edge="top\|bottom"]` > `div.td-toasts[data-placement="top-start\|top-center\|top-end\|bottom-start\|bottom-center\|bottom-end"]` > `div.td-toast`; chồng legacy (site đổi token neo cũ) = `div.td-toasts` **không** `data-placement`, con trực tiếp của root | toast: `[data-td-toast-older]` (ẩn khi màn thấp), custom property `--_td-toast-seq` | 0.36.0 |
| td ≤ 0.8 | `.toast-item` (+ class translate / opacity) + div nền màu bên trong | `div.td-toast.td-toast--{success\|error\|warning\|info}` (+ `span.td-toast__type.td-sr-only`, `span.td-toast__message`, `button.td-toast__close`) — 0.9.0–0.20.x còn `.td-glass-surface.td-glass-surface--strong` + `span.td-toast__icon`, bỏ từ 0.21.0 | `data-state="entering\|open\|closing"`, `[data-paused]` | 0.9.0 |

## TdTooltip

`import '@dazzxq/td-components/tooltip'` — bản BEM từ **0.9.0**.

| Nguồn legacy | Class cũ | Class / attribute hiện tại | Trạng thái | Từ bản |
|---|---|---|---|---|
| td ≤ 0.8 | `.td-tooltip` | `div#td-tooltip.td-tooltip.td-glass-surface.td-glass-surface--strong[role=tooltip]` | `[hidden]`, `data-state="open"`, `data-placement="top\|bottom\|left\|right"`, `[data-custom]` (màu riêng) | 0.9.0 |
| td ≤ 0.8 | `.td-tooltip-content` | `span.td-tooltip__content` | — | 0.9.0 |
| td ≤ 0.8 | `.td-tooltip-arrow` | bỏ ở 0.9.0; từ 0.14.0 mũi tên là `.td-tooltip::after` (vị trí qua custom property `--td-tooltip-arrow-x` / `--td-tooltip-arrow-y`, cỡ `--td-tooltip-arrow-size`) | `data-placement` | 0.9.0 / 0.14.0 |

Markup trigger của dwp (`data-dwp-tooltip`, `data-tooltip-pos`, `data-dwp-tooltip-pos`) được nhận trực tiếp từ 0.14.0,
không cần đổi.

## td-dropdown

`import '@dazzxq/td-components/dropdown'` — bản BEM từ **0.9.0**.

| Nguồn legacy | Class cũ | Class / attribute hiện tại | Trạng thái | Từ bản |
|---|---|---|---|---|
| td ≤ 0.8 | `.td-dropdown-container` | `div.td-dropdown` | `data-state="closed\|open"` | 0.9.0 |
| td ≤ 0.8 | `.td-dropdown-button` | `button.td-dropdown__trigger[role=combobox]` | `[aria-expanded]`, `[aria-invalid]` | 0.9.0 |
| td ≤ 0.8 | `.td-dropdown-selected` / `.td-dropdown-arrow` | `span.td-dropdown__value` / `span.td-dropdown__arrow` | `[data-placeholder]` trên `__value` | 0.9.0 |
| td ≤ 0.8 | `.td-dropdown-menu` | `div.td-dropdown__menu.td-glass-surface.td-glass-surface--strong` (gắn vào `<body>`) | `[hidden]`, `data-state`, `data-placement` | 0.9.0 |
| td ≤ 0.8 | `.td-dropdown-search` | `div.td-dropdown__search-wrap` > `input.td-dropdown__search` | — | 0.9.0 |
| td ≤ 0.8 | `.td-dropdown-options` | `div.td-dropdown__options[role=listbox]` | — | 0.9.0 |
| td ≤ 0.8 | `.td-dropdown-option` / `.td-dropdown-option-clear` | `div.td-dropdown__option[role=option]` (+ `span.td-dropdown__option-label`, `span.td-dropdown__check`) / thêm `.td-dropdown__option--clear` | `[aria-selected]`, `[data-active]` | 0.9.0 |
| td ≤ 0.8 | div "không có kết quả" | `p.td-dropdown__empty[role=status]` | — | 0.9.0 |

Nhãn phía trên dùng chung `label.td-field__label`; lỗi dùng `span.td-field-error`.

## td-datetime-picker

`import '@dazzxq/td-components/datetime-picker'` — bản BEM từ **0.10.0**.

| Nguồn legacy | Class cũ | Class / attribute hiện tại | Trạng thái | Từ bản |
|---|---|---|---|---|
| td ≤ 0.9 | `label.block …` (Tailwind) | `label.td-field__label` (+ `span.td-field__required`) | — | 0.10.0 |
| td ≤ 0.9 | `div.relative` | `div.td-dtp` | `data-state="closed\|open"` | 0.10.0 |
| td ≤ 0.9 | `input[readonly]` + `svg` lịch | `button.td-dtp__trigger[role=combobox][aria-haspopup=dialog]` (+ `span.td-dtp__value`, `span.td-dtp__icon`) | `[aria-expanded]`, `[aria-invalid]`, `[data-placeholder]` trên `__value` | 0.10.0 |
| td ≤ 0.9 | thân modal bằng chuỗi HTML (`div.p-4 …`, `h6`, input Tailwind, id `#td-dtp-{uid}-*`) | `.td-dtp-panel` (+ `__group`, `__legend`, `__fields`, `__field`, `__label`, `__input`, `__wheels`, `__preview`, `__error`) | `[aria-invalid]`, `[hidden]` | 0.10.0 |
| td ≤ 0.9 | `.td-dtp-wheel-container` | `div.td-dtp-wheel` | — | 0.10.0 |
| td ≤ 0.9 | `.td-dtp-wheel` (danh sách cuộn) | `.td-dtp-wheel__list[role=listbox]` (+ `.td-dtp-wheel__sep` dấu `:`) | `aria-activedescendant` | 0.10.0 |
| td ≤ 0.9 | `.td-dtp-wheel-option` | `.td-dtp-wheel__option[role=option]` | `[aria-selected="true"]` | 0.10.0 |
| td ≤ 0.9 | `.selected` (JS bật/tắt) | bỏ | `[aria-selected="true"]` | 0.10.0 |
| td ≤ 0.9 | nút footer Tailwind | `button.td-btn.td-btn--{secondary\|primary}` (qua `actions` của TdModal) | — | 0.10.0 |

Dải chọn của bánh xe dùng token `--td-dtp-band-border` (đổi tông ở 0.14.4).

## td-table

`import '@dazzxq/td-components/table'` — bản BEM từ **0.10.0**.

| Nguồn legacy | Class cũ | Class / attribute hiện tại | Trạng thái | Từ bản |
|---|---|---|---|---|
| td ≤ 0.9 | `.td-table-container.td-table-card` | `div.td-table` (+ `.td-table--zebra`, `.td-table--fixed`, `.td-table--scroll-y`) | `data-state="ready\|loading\|empty"` | 0.10.0 |
| td ≤ 0.9 | `.td-table-header-bar` / `h3` | `div.td-table__header` / `h{2–6}.td-table__title` | `[hidden]` | 0.10.0 |
| td ≤ 0.9 | `.td-table-header-pagination` | `div.td-table__pagination` > `td-pagination[quiet]` | `[hidden]` | 0.10.0 |
| td ≤ 0.9 | `.td-table-footer-bar` (+ `.td-table-footer-pagination`) | `div.td-table__footer` > `td-pagination` | `[hidden]` | 0.10.0 |
| td ≤ 0.9 | `div.overflow-x-auto` | `div.td-table__scroll` | `role=region` + `tabindex` chỉ khi đang tràn | 0.10.0 |
| td ≤ 0.9 | `table.w-full` / `.td-table-thead-row` | `table.td-table__table` / `thead.td-table__head` | `[aria-busy]` trên bảng khi loading | 0.10.0 |
| td ≤ 0.9 | `th` (Tailwind) / `.td-table-sort-btn` + svg | `th.td-table__th[scope=col]` / `button.td-table__sort` + `.td-table__sort-icon` | `[aria-sort]` trên `th` | 0.10.0 |
| td ≤ 0.9 | (tbody không class) | `tbody.td-table__body` | — | 0.10.0 |
| td ≤ 0.9 | `.td-table-row` (+ `.td-table-zebra`) | `tr.td-table__row[data-row-idx]` (sọc do `.td-table--zebra` trên khối gốc) | `:hover` | 0.10.0 |
| td ≤ 0.9 | `td` / `.td-table-render-cell` | `td.td-table__cell[data-col][data-col-key]` (+ `.td-table__cell--ellipsis`, `.td-table__cell--px-{0…6}`); dấu hiệu render-cell bị bỏ | — | 0.10.0 |
| td ≤ 0.9 | (không có) | `div.td-table__truncate` (cột `ellipsis`) | — | 0.10.0 |
| td ≤ 0.9 | `td.px-6.py-16` (bảng rỗng) | `tr.td-table__empty-row > td.td-table__empty` | `data-state="empty"` | 0.10.0 |
| td ≤ 0.9 | `.td-table-skel-row` + `.td-table-skel-bar` | `tr.td-table__row--skeleton` + `.td-table__skeleton` | `data-state="loading"` | 0.10.0 |
| (mới) | — | `th.td-table__th--select` (+ `.td-table__th--select-all`) > `button.td-table__select-all[role=checkbox]` + `span.td-table__select-all-label`; `td.td-table__cell--select.td-table__card-select` > `button.td-table__select[role=checkbox]` (mark `.td-check`) | `aria-checked`, `[disabled]`, `tr[data-selected]` | 0.37.0 |
| (mới) | — | Bảng cây: `div.td-table.td-table--tree` > `table[role=treegrid]`; `td.td-table__cell--tree` > `button.td-table__tree-toggle` (> `span.td-table__tree-icon`) hoặc `span.td-table__tree-spacer`; dòng trạng thái `tr.td-table__row--tree-status` > `td.td-table__tree-status` > `span.td-table__tree-status-text` (+ `button.td-table__tree-retry`) | `tr[aria-level][aria-setsize][aria-posinset][aria-expanded][aria-busy][tabindex]`, `td.td-table__tree-status[data-state=loading\|error]`, CSSOM `--td-table-tree-level` | 0.57.0 |

`cellPaddingClass` vẫn nhận từ vựng dcms (`px-0` … `px-6`) và chuyển thành `.td-table__cell--px-{n}`.

## td-sample

`import '@dazzxq/td-components/sample'` — bản BEM từ **0.11.0**.

| Nguồn legacy | Class cũ | Class / attribute hiện tại | Trạng thái | Từ bản |
|---|---|---|---|---|
| td ≤ 0.10 | `div.p-4.border.border-gray-200.rounded-lg.shadow-xs` | `div.td-sample` | — | 0.11.0 |
| td ≤ 0.10 | `h3.text-lg.font-bold` / `p.mt-1.text-gray-600` | `h3.td-sample__title` / `p.td-sample__count` | — | 0.11.0 |
| td ≤ 0.10 | `button.… bg-blue-500 …` | `button.td-btn.td-btn--primary.td-btn--sm` > `span.td-btn__label` | `:disabled` | 0.11.0 |

## TdMenu

`import { TdMenu } from '@dazzxq/td-components/menu'` — mới ở **0.12.0**, thay menu tự viết của dwp và 135.

| Nguồn legacy | Class cũ | Class / attribute hiện tại | Trạng thái | Từ bản |
|---|---|---|---|---|
| dwp / 135 | `div.dwp-menu[role=menu]` / 135 `.td-menu` (kính tự viết) | `div.td-menu.td-glass-surface.td-glass-surface--strong[role=menu]` | `data-state="open"`, `data-placement="bottom\|top"`, `data-align="start\|center\|end"` | 0.12.0 |
| dwp | `button.dwp-menu__item[role=menuitem]` | `.td-menu__item[role=menuitem][tabindex=-1]` (`button`, hoặc `a` khi có `href`) | `:focus-visible`, `:hover` | 0.12.0 |
| dwp | `.dwp-menu__item--danger` | `.td-menu__item--danger` | — | 0.12.0 |
| dwp | `span.dwp-menu__label` | `span.td-menu__label` | — | 0.12.0 |
| dwp | `is-checked` + icon sprite | `[role=menuitemradio\|menuitemcheckbox][aria-checked]` + `span.td-menu__check` | `[aria-checked="true"]` | 0.12.0 |
| dwp | `disabled` + `is-disabled` | `[aria-disabled="true"]` (vẫn focus được) | `[aria-disabled="true"]` | 0.12.0 |
| dwp | `small.dwp-menu__hint` (chỉ khi disabled) | `span.td-menu__hint[id]` (mọi item, qua `aria-describedby`) | — | 0.12.0 |
| dwp / 135 | `<i class="dwp-icon …">` / svg dùng `use` (sprite) | `span.td-menu__icon` (icon registry) | — | 0.12.0 |
| dwp | `.dwp-menu__row` / `.dwp-menu__action` / `.dwp-menu__custom` | bỏ (không hỗ trợ item custom node / action phụ) | — | 0.12.0 |
| — | (không có) | `div.td-menu__separator[role=separator]` | — | 0.12.0 |
| dwp | `button.dwp-menu-btn` (+ `span.dwp-menu-btn__label`) | `button.td-menu-btn` (+ `span.td-menu-btn__icon`, `span.td-menu-btn__label`) | `[aria-expanded]` | 0.12.0 |

## td-chip-input

`import '@dazzxq/td-components/chip-input'` — mới ở **0.12.0**, port từ dcms `ChipSearchField`.

| Nguồn legacy | Class cũ | Class / attribute hiện tại | Trạng thái | Từ bản |
|---|---|---|---|---|
| dcms | `div.dcms-chip-search-field` (Tailwind) | `div.td-chip-input` > `div.td-chip-input__box` | `data-state="closed\|open"`, `[data-full]`, `[data-empty]` | 0.12.0 |
| dcms | `div.dcms-chip-search-field__chips[role=list]` | `ul.td-chip-input__chips` > `li.td-chip-input__chip` (+ `span.td-chip-input__chip-label`, `button.td-chip-input__remove`) | `[hidden]` khi chưa có chip | 0.12.0 |
| dcms | `input.dcms-chip-search-field__input` | `input.td-chip-input__input[role=combobox]` | `aria-expanded`, `aria-activedescendant` | 0.12.0 |
| dcms | `div.dcms-chip-search-field__dropdown[role=listbox]` (nằm trong khối) | `div.td-chip-input__menu.td-glass-surface.td-glass-surface--strong` (gắn vào `<body>`) > `div.td-chip-input__options[role=listbox]` | `[hidden]`, `data-state`, `data-placement` | 0.12.0 |
| dcms | option | `div.td-chip-input__option[role=option]` (+ `span.td-chip-input__option-label`, `span.td-chip-input__option-desc`); tạo mới: `.td-chip-input__option--create` | `[aria-selected="true"]` | 0.12.0 |
| dcms | (thông báo rỗng) | `p.td-chip-input__empty` | `data-kind="none\|loading\|error"` | 0.12.0 |

## TdFormValidation

`import { TdFormValidation } from '@dazzxq/td-components/form-validation'` — mới ở **0.12.0**, port từ dcms.

| Nguồn legacy | Class cũ | Class / attribute hiện tại | Trạng thái | Từ bản |
|---|---|---|---|---|
| dcms | `div.dcms-form-error-note` (+ `style.color`) | `span.td-field-error[data-td-fv]` (control native) hoặc error contract của component td | control có `[aria-invalid="true"]` | 0.12.0 |
| dcms | `div.dcms-form-validation-summary[role=alert]` | `div.td-form-summary[role=alert]` (+ `__title`, `__list`, `__item`, `button.td-form-summary__link`) | — | 0.12.0 |

Với control native (không phải component td), site tự style `[aria-invalid="true"]`.

## TdLightbox

`import { TdLightbox } from '@dazzxq/td-components/lightbox'` — mới ở **0.6.0**, thay lightbox riêng của dwp và 135.

| Nguồn legacy | Class / markup cũ | Hiện tại | Trạng thái | Từ bản |
|---|---|---|---|---|
| 135 | class trạng thái `.is-*` của lightbox 135 | attribute trên `div.td-lightbox[role=dialog]`: `data-state="open"`, `[data-zoomed]`, `[data-dragging]`, `[data-panel]`, `[data-closing-down]`; trên panel: `data-sheet="open"` | như cột trước | 0.6.0 |
| dwp | markup `data-dwp-lightbox*` | giữ nguyên, bind bằng `TdLightbox.bind(root, { attrPrefix: 'dwp' })`; hoặc đổi sang `data-td-lightbox`, `data-td-lightbox-group`, `data-td-lightbox-item`, `data-td-lightbox-src`, `data-td-lightbox-type`, `data-td-lightbox-caption`, `data-td-lightbox-poster` | — | 0.15.0 |

Phần tử bên trong viewer dùng khối `.td-lightbox__*` (`__backdrop`, `__stage`, `__img`, `__video`, `__toolbar`,
`__btn`, `__counter`, `__panel`, `__caption`, …). Markup chuẩn cho trigger: [Lightbox](../components/lightbox.md) và
[WordPress & PHP › Lightbox](../guides/wordpress-php.md#lightbox-tdlightboxbindroot--attrprefix--mặc-định-prefix-td)
(fixture `test/contracts/lightbox.html` của repo kit chỉ dùng cho test, không nằm trong gói npm).

## Ô tick chung và media picker (0.36.0)

Không có class legacy để đổi, nhưng phần tử bên trong đổi — CSS site nhắm phần tử cũ phải sửa. Chi tiết:
[breaking-changes › 0.36.0](breaking-changes.md#0360), [ADR 0017](../internal/decisions/0017-shared-check-mark.md).

| Ở đâu | Trước 0.36 | Từ 0.36.0 |
|---|---|---|
| Mọi "tick để chọn" | hình riêng từng component | `span.td-check.td-check--{sm\|md\|lg}[.td-check--on-media][aria-hidden]` > `svg.td-check__svg` (markup dựng từ chuỗi: bọc thêm `span.td-check__icon`); trạng thái từ ARIA của cha (`aria-pressed` / `aria-checked` / `aria-selected`, `aria-checked="mixed"`, `[data-td-check-mixed]`) |
| `td-media-grid` (tick của kit) | `button.td-media-grid__tick` > `svg.td-icon` | `button.td-media-grid__tick.td-media-grid__tick--mark` (trong suốt) > `span.td-check.td-check--lg.td-check--on-media`; tick của site `[data-td-media-tick]` không đổi |
| `td-tree` (multiple) | `span.td-tree__check` > `span.td-tree__check-on` / `span.td-tree__check-mixed` | `span.td-check.td-check--sm.td-tree__check` (bỏ hai span con) |
| `td-chip-input` (`selection-only`) | `span.td-chip-input__check[data-td-icon]` (ẩn khi chưa chọn) | `span.td-check.td-check--sm.td-chip-input__check` (luôn hiện); dòng "Chọn tất cả" `[data-td-check-mixed]` khi chọn một phần |
| `TdMenu` mục checkbox | `span.td-menu__check[data-td-icon]` (ẩn khi tắt) | `span.td-check.td-check--sm.td-menu__check` (luôn hiện); mục radio giữ `span.td-menu__check` ✓ |
| Media picker toolbar < 1024px | facet trong `.td-media-picker__facets` | thêm `span.td-media-picker__filter` > `td-button.td-media-picker__filter-btn` + `span.td-badge.td-media-picker__filter-count`; `.td-media-picker__facets` ẩn |
| Media picker sheet lọc | (không có) | `div.td-modal.td-modal--sm.td-media-picker-filters` > `.td-media-picker-filters__body` > `.td-media-picker-filters__facet`; `.td-media-picker-filters__footer` > `__clear` · `__apply` |
| Media picker pager < 720px | trong toolbar | cùng node, dời xuống cuối `.td-media-picker__results`, thêm `.td-media-picker__pager--below` |

## Component không có class legacy

- **TdHovercard** (0.14.0): `div#td-hovercard.td-hovercard.td-glass-surface.td-glass-surface--strong[role=dialog]`
  (+ `p.td-hovercard__status`, `span.td-hovercard__spinner`, `span.td-hovercard__text`); trạng thái
  `data-state="loading|open|error|closed"`, `data-placement="bottom|top"`, `[hidden]`. Là bản port hành vi của
  hovercard dwp; không có bảng đổi class vì kit chưa từng ship bản cũ.
- **Icon** (0.6.0): `svg.td-icon.td-icon--{s|m|l}` từ registry.

## Class mới không thay class cũ (0.59.0)

| Class | Ý nghĩa |
|---|---|
| `.td-pagination--single` (+ `.td-pagination__controls[hidden]`) | `hide-single-page` và chỉ một trang: phần nút ẩn, chỉ còn dòng đếm |
| `.td-modal__text--blocks` | `message` của hộp thoại Promise là mảng / Node: `div.td-modal__text` chứa các `<p>` / node |
| `.td-dtp--clearable`, `.td-dtp__clear`, `.td-dtp__clear-icon` | `td-datetime-picker clearable`: gốc dạng lưới, nút xoá là anh em của trigger |
| `.td-dtr-panel__open-end` | Nút "Không hạn" (cùng `.td-dtr-panel__preset`) trong nhóm "Đến" của `td-datetime-range allow-open-end` |

## Class mới không thay class cũ (0.58.0)

| Class | Ý nghĩa |
|---|---|
| `.td-field--floating` | `td-input-field label-mode="floating"`: control (hoặc `.td-field__box`) đứng **trước** `.td-field__label`, nhãn nằm trong ô và nổi lên bằng CSS |
| `.td-field--always-float` | Nhãn luôn nổi (`date` / `month` / `datetime-local` / `time`, có affix) |
| `.td-field--ph-label` | Không có `placeholder` thật: placeholder của control = chữ nhãn, luôn ẩn |

## Class mới không thay class cũ (0.55.0)

| Class | Ý nghĩa |
|---|---|
| `.td-field--affix` > `.td-field__box` | `td-input-field` có tiền tố / hậu tố: hộp mang dáng ô (cùng luật với `.td-number__box`), control trong suốt bên trong |
| `.td-field__affix`, `--prefix`, `--suffix`, `--slot` | Phần tiền tố / hậu tố (chữ / icon trang trí, hoặc vỏ chứa phần tử `[slot]` của trang) |
| `.td-field__affix-icon` > `svg.td-field__affix-svg` | Ô icon trong affix |
| `.td-number__affix-icon` > `svg.td-number__affix-svg` | Ô icon trong affix của `td-number-input` |
| `.td-number__affix--slot` | Vỏ chứa phần tử `[slot]` của trang trong `td-number-input` |

Luật CSS của `.td-number__box` chuyển từ `number-input.css` sang `field.css` (`:is(.td-number__box, .td-field__box)`, cùng
độ ưu tiên, cùng giá trị tính) — CSS của site nhắm `.td-number__box` không đổi tác dụng.

## Không đổi class nhưng đổi giao diện

Các bản sau giữ nguyên class, chỉ đổi cách class đó được vẽ. Không cần sửa selector, nhưng CSS tự viết của site có
thể cần xem lại. Chi tiết và token để chỉnh lại ở [breaking-changes.md](breaking-changes.md).

| Class | Đổi gì | Bản |
|---|---|---|
| `.td-btn--{variant}` | Nền đặc → kính tint (`--td-btn-{v}-tint`, `-alpha`, `-film`, `-fg`, `--td-btn-sheen`); disabled dùng màu đặc thay cho `opacity` | 0.14.0 |
| `.td-btn--secondary` | Kính trắng + viền `--td-btn-secondary-edge` (`--td-btn-secondary-glass`) | 0.14.3 |
| `.td-checkbox__mark` | Tròn mặc định (`--td-checkbox-radius`) | 0.14.0 |
| `.td-toast--{type}` | Kính tint theo loại (`--td-toast-glass-bg`, `--td-toast-{type}-wash`, `--td-toast-{type}-icon`) | 0.14.0 |
| `.td-toast--{type}` | Viên đặc pastel theo loại (`--td-toast-{type}-bg/-fg/-border`), không blur, không icon (DOM đổi — xem bảng trên) | 0.21.0 |
| `.td-btn--primary` | Nền đen `--td-btn-primary-bg` (dark: đảo sáng), không theo `--td-accent` | 0.21.0 |
| `.td-tooltip` | Có mũi tên `::after` | 0.14.0 |
| `.td-btn--{success\|danger\|warning\|info}`, `.td-toast--{type}`, `.td-badge--{v}` | Màu đặc `--td-solid-*` thay pastel (xem breaking-changes) | 0.36.0 |
| `.td-modal__header`, `.td-modal__footer` | < 720px: header ≤ 56px không đường kẻ, footer ≤ 64px, nút footer modal thường chia đều một hàng | 0.36.0 |
| `.td-field__control`, `.td-dropdown__trigger`, `.td-dtp__trigger`, `.td-chip-input__box`, `.td-checkbox__mark`, `.td-switch__track` | Viền mềm lúc nghỉ / hover (`--td-control-border-soft`, `--td-control-border-hover`) | 0.14.1, 0.14.2 |

## Xem thêm

- [breaking-changes.md](breaking-changes.md) — thay đổi hành vi và việc cần làm theo từng bản.
- [styling.md](../customization/styling.md) — `@layer`, hợp đồng class BEM, cách override an toàn.
- [theming.md](../customization/theming.md) — token `--td-*`.
- Trang từng component trong [components/](../components/README.md), mục "Cấu trúc DOM & class".
