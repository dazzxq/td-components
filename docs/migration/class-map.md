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

State rule: JS never toggles visual classes; state lives in `aria-*`, `[hidden]`, `:checked`, `data-state`.
