# Class map — legacy → token-native (BEM)

Filled per migration batch ([roadmap](../roadmap.md)). Consumers who styled a component's inner classes
update their selectors using this table when upgrading. No legacy aliases are shipped ([ADR 0008](../decisions/0008-drop-tailwind-token-css.md)).

| Component | Legacy class (≤ v0.5) | Token-native class | State now expressed by | Since |
|---|---|---|---|---|
| — | — | — | — | — |

State rule: JS never toggles visual classes; state lives in `aria-*`, `[hidden]`, `:checked`, `data-state`.
