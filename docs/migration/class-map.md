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

State rule: JS never toggles visual classes; state lives in `aria-*`, `[hidden]`, `:checked`, `data-state`.
