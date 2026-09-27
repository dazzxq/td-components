# Class map — legacy → token-native (BEM)

Filled per migration batch ([roadmap](../roadmap.md)). Consumers who styled a component's inner classes
update their selectors using this table when upgrading. No legacy aliases are shipped ([ADR 0008](../decisions/0008-drop-tailwind-token-css.md)).

| Component | Legacy class (≤ v0.5) | Token-native class | State now expressed by | Since |
|---|---|---|---|---|
| td-button | `button` (Tailwind utilities + glass CSSOM) | `.td-btn .td-btn--{variant} .td-btn--{size} [.td-btn--full] [.td-btn--custom]` | `:disabled`, `[aria-busy="true"]` | 0.7.0 |
| td-button | loading `svg.animate-spin` | `.td-btn__spinner.td-spinner` (+ `__svg`, `__track`, `__arc`) | `[hidden]` | 0.7.0 |
| td-button | text `span` / `<i class="fa…">` | `.td-btn__label` / `.td-btn__icon` (registry `svg.td-icon`) | — | 0.7.0 |
| td-checkbox | `.td-checkbox-input` | `.td-checkbox__input` | `:checked`, `:disabled`, `[aria-invalid]` | 0.7.0 |
| td-checkbox | `.td-checkmark` / `.td-checkmark-icon` | `.td-checkbox__mark` / `.td-checkbox__icon` > `svg.td-checkbox__svg` | via `:checked ~` | 0.7.0 |
| td-checkbox | `.td-checkbox-label`, `.td-checkbox--disabled` | `.td-checkbox__label`; disabled via `:disabled` | — | 0.7.0 |
| td-checkbox | host `--td-cb-color` | host `--td-checkbox-color` | — | 0.7.0 |
| td-toggle | `.td-toggle-root` + `label[role=switch]` | `label.td-switch` + `input.td-switch__input[role=switch]` | `:checked`, `:disabled`, `[data-dragging]` | 0.7.0 |
| td-toggle | `.td-toggle-track(--active)` / `.td-toggle-thumb(--active)` | `.td-switch__track` / `.td-switch__thumb` | `:checked +` | 0.7.0 |
| td-toggle | `.td-toggle-icon` ×2, `.td-toggle-label` | `.td-switch__icon--off` / `--on`, `.td-switch__label` | — | 0.7.0 |
| td-loading | `#td-loading` (Tailwind + `.hidden`) | `#td-loading.td-loading` | `[hidden]`, `[data-state="open"]`, `[aria-busy]` | 0.7.0 |
| td-loading | `.td-loading-card`, `.td-circular-spinner`, `.td-loading-message` | `.td-loading__card` (+ glass recipe), `.td-loading__spinner.td-spinner`, `.td-loading__message` | — | 0.7.0 |
| td-loading | `.td-spinner-track/-arc/-arc-inline` | `.td-spinner__track` / `.td-spinner__arc` | — | 0.7.0 |
| (all form controls) | — | `.td-field-error` (error contract note) | — | 0.7.0 |
| td-input-field | `.td-input-field` / `.td-input-wrapper` | `.td-field.td-field--{size}[--textarea\|--editable]` (wrapper removed) | — | 0.8.0 |
| td-input-field | `.td-input-label` (+ `span.text-red-500`) | `.td-field__label` (+ `.td-field__required[aria-hidden]`) | — | 0.8.0 |
| td-input-field | `.td-input(.td-input-{type}\|-textarea\|-editable)` | `.td-field__control` | `:focus-visible`, `:disabled`, `[aria-invalid]`, `:placeholder-shown`, `:empty` | 0.8.0 |
| td-input-field | `.td-placeholder` | removed (`:empty::before`) | `:empty` | 0.8.0 |
| td-input-field | `.td-input-counter` | `.td-field__counter` (in `.td-field__footer`) | `[data-state="limit"]` (count ≥ max) | 0.8.0 |
| td-input-field | `.td-input-note` | `.td-field__note` (helper) + `.td-field-error` (error) | `[aria-invalid]` | 0.8.0 |
| td-slider | `.td-slider-container` | `.td-slider.td-slider--{size}` | `[data-dragging]` | 0.8.0 |
| td-slider | `.td-slider-main-label` / `.td-slider-value-label` | `.td-slider__label` / `output.td-slider__value` | — | 0.8.0 |
| td-slider | `.td-slider-wrap` + `.td-slider-track-container` | `.td-slider__control` | — | 0.8.0 |
| td-slider | `.td-slider-track-bg` / `.td-slider-track-active` | `.td-slider__track` / `.td-slider__fill` | host `--td-slider-pct` | 0.8.0 |
| td-slider | `.td-slider-thumb` / `.td-slider-input` | `.td-slider__thumb` / `.td-slider__input` | `:focus-visible ~`, `:disabled ~` | 0.8.0 |
| td-slider | `.td-slider-step-marks/-mark/-mark-label`, `.td-slider-step-labels` | `.td-slider__marks/__mark/__mark-label`, `.td-slider__range` | — | 0.8.0 |
| td-pagination | `.td-pagination-container` | `nav.td-pagination` | — | 0.8.0 |
| td-pagination | `.td-pagination-info` | `.td-pagination__info` | — | 0.8.0 |
| td-pagination | `.td-pagination-prev/-next` | `.td-pagination__nav--prev/--next` | `[aria-disabled]` | 0.8.0 |
| td-pagination | `.td-pagination-pages`, `span[data-page]`, `span[data-active-page]` | `ul.td-pagination__pages`, `button.td-pagination__page[data-page]` | `[aria-current="page"]` | 0.8.0 |
| td-pagination | ellipsis `span` | `li.td-pagination__ellipsis[aria-hidden]` | — | 0.8.0 |
| td-tabs | `.td-tabs-container[data-populated]` | `.td-tabs.td-tabs--{sm\|md}[role=tablist]` | `data-state="empty\|ready"` | 0.8.0 |
| td-tabs | `.td-tabs-indicator` | `.td-tabs__indicator` | `--td-tabs-ind-x/-w` on `.td-tabs` | 0.8.0 |
| td-tabs | `.td-tab-btn` (+ gray text classes) | `.td-tabs__tab[role=tab]` (+ `__icon`, `__label`) | `[aria-selected]` | 0.8.0 |
| td-empty-state | `.td-empty-state-card` | `.td-empty-state.td-empty-state--{size}[--compact]` | — | 0.8.0 |
| td-empty-state | `.td-empty-icon-wrap` / `.td-empty-icon` | `.td-empty-state__icon` / `svg.td-icon` | — | 0.8.0 |
| td-empty-state | `.td-empty-title` / `.td-empty-message` | `.td-empty-state__title` / `__message` | — | 0.8.0 |
| td-empty-state | `.td-empty-actions` (+ Tailwind buttons) | `.td-empty-state__actions` (+ `.td-btn`) | `[hidden]` | 0.8.0 |
| td-modal | root `div[id^=td-modal-].fixed.inset-0.hidden` | `.td-modal.td-modal--{size}[--viewport]` | `[hidden]`, `data-state`, `[data-covered]` | 0.9.0 |
| td-modal | `.td-modal-backdrop` | `.td-modal__backdrop` | — | 0.9.0 |
| td-modal | scroller/aligner divs | removed | — | 0.9.0 |
| td-modal | `.td-modal-content` | `.td-modal__dialog[role=dialog\|alertdialog][aria-modal]` | — | 0.9.0 |
| td-modal | `.td-modal-header` / `.td-modal-title` (h3) | `.td-modal__header` / `h2.td-modal__title` | `[hidden]` | 0.9.0 |
| td-modal | `.td-modal-close` | `.td-modal__close[aria-label]` | `[hidden]` | 0.9.0 |
| td-modal | `.td-modal-body` / `.td-modal-footer` | `.td-modal__body` / `.td-modal__footer` | `[hidden]` | 0.9.0 |
| td-modal | Tailwind footer buttons, icon svgs | `.td-btn.td-btn--{variant}`, `.td-modal__message/__icon/__text` | `[aria-busy]` | 0.9.0 |
| td-toast | `#td-toast-container` (Tailwind) | `#td-toast-container.td-toasts` | — | 0.9.0 |
| td-toast | `.toast-item` (+ translate/opacity classes) + inner fill div | `.td-toast.td-toast--{type}` (+ `__icon`, `__message`, `__close`) | `data-state`, `[data-paused]` | 0.9.0 |
| td-tooltip | `.td-tooltip` / `.td-tooltip-content` / `.td-tooltip-arrow` | `.td-tooltip[role=tooltip]` / `.td-tooltip__content` / removed | `[hidden]`, `data-state`, `data-placement`, `[data-custom]` | 0.9.0 |
| td-dropdown | `.td-dropdown-container` | `.td-dropdown` | — | 0.9.0 |
| td-dropdown | `.td-dropdown-button` / `-selected` / `-arrow` | `.td-dropdown__trigger[role=combobox]` / `__value` / `__arrow` | `[aria-expanded]`, `[aria-invalid]`, `[data-placeholder]` | 0.9.0 |
| td-dropdown | `.td-dropdown-menu` / `-search` / `-options` | `.td-dropdown__menu` / `__search(-wrap)` / `__options` | `[hidden]`, `data-placement` (`bottom\|top`) | 0.9.0 |
| td-dropdown | `.td-dropdown-option` / `-option-clear` / empty div | `.td-dropdown__option[role=option]` / `--clear` / `__empty` | `[aria-selected]`, `[data-active]` | 0.9.0 |
| td-datetime-picker | host `label.block…` / `div.relative` / `input[readonly]` / calendar `svg` | `label.td-field__label` / `.td-dtp` / `button.td-dtp__trigger[role=combobox][aria-haspopup=dialog]` (+ `__value`, `__icon`) | `data-state`, `[aria-expanded]`, `[aria-invalid]`, `[data-placeholder]` | 0.10.0 |
| td-datetime-picker | modal body HTML string (`div.p-4…`, `h6`, Tailwind inputs, `#td-dtp-{uid}-*` ids) | `.td-dtp-panel` (+ `__group`, `__legend`, `__fields`, `__field`, `__label`, `__input`, `__preview`, `__error`) | `[aria-invalid]`, `[hidden]` | 0.10.0 |
| td-datetime-picker | `.td-dtp-wheel-container` / `.td-dtp-wheel` / `.td-dtp-wheel-option` | `.td-dtp-wheel` / `.td-dtp-wheel__list[role=listbox]` / `.td-dtp-wheel__option[role=option]` (+ `__sep`) | `[aria-selected]`, `aria-activedescendant` | 0.10.0 |
| td-datetime-picker | `.selected` (JS-toggled) | removed | `[aria-selected="true"]` | 0.10.0 |
| td-datetime-picker | Tailwind footer buttons | `.td-btn.td-btn--{secondary\|primary}` (TdModal `actions`) | — | 0.10.0 |
| td-table | `.td-table-container.td-table-card` | `.td-table[--zebra\|--fixed\|--scroll-y]` | `data-state`, `[aria-busy]` | 0.10.0 |
| td-table | `.td-table-header-bar` / `h3` / `.td-table-header-pagination` / `.td-table-footer-bar` | `.td-table__header` / `.td-table__title` / `.td-table__pagination` / `.td-table__footer` | `[hidden]` | 0.10.0 |
| td-table | `div.overflow-x-auto` / `table.w-full` / `.td-table-thead-row` | `.td-table__scroll` / `.td-table__table` / `.td-table__head` | `tabindex`/`role=region` while overflowing | 0.10.0 |
| td-table | `th` (Tailwind) / `.td-table-sort-btn` + svg | `th.td-table__th[scope=col]` / `.td-table__sort` + `.td-table__sort-icon` | `[aria-sort]` | 0.10.0 |
| td-table | `.td-table-row[.td-table-zebra]` / `td` / `.td-table-render-cell` | `.td-table__row` / `.td-table__cell[--ellipsis\|--px-N]` / (marker removed) | `:hover` | 0.10.0 |
| td-table | empty `td.px-6.py-16` / `.td-table-skel-row` + `.td-table-skel-bar` | `.td-table__empty-row > .td-table__empty` / `.td-table__row--skeleton` + `.td-table__skeleton` | `data-state` | 0.10.0 |
| td-menu | `.dwp-menu` / 135 `.td-menu` (hand-written glass) | `.td-menu.td-glass-surface--strong[role=menu]` | `data-state`, `data-placement`, `data-align` | 0.12.0 |
| td-menu | `.dwp-menu__item` (+ `--danger`, `is-checked`, `is-disabled`), `__hint` | `.td-menu__item[--danger]`, `__label`, `__icon`, `__check`, `__hint`, `__separator` | `[aria-checked]`, `[aria-disabled]` | 0.12.0 |
| td-menu | `.dwp-menu-btn` | `.td-menu-btn` (+ `__icon`, `__label`) | `[aria-expanded]` | 0.12.0 |
| td-chip-input | `.dcms-chip-search-field` (Tailwind) / `__chips` / `__input` / `__dropdown` | `.td-chip-input` / `__box` / `__chips` / `__chip` / `__remove` / `__input` / `__menu` / `__options` / `__option[--create]` / `__empty` | `data-state`, `[aria-selected]`, `[hidden]` | 0.12.0 |
| TdFormValidation | `.dcms-form-error-note` / `.dcms-form-validation-summary` | `.td-field-error[data-td-fv]` / `.td-form-summary` (+ `__title`, `__list`, `__item`, `__link`) | `[aria-invalid]` | 0.12.0 |

State rule: JS never toggles visual classes; state lives in `aria-*`, `[hidden]`, `:checked`, `data-state`.
