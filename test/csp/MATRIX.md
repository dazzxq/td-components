> **0.7.0 note:** td-button, td-checkbox, td-toggle and td-loading are **token-native** (`_meta.tokenNative` in
> `matrix.json`). Their states/selectors below are historical; current selectors live in `matrix.json` and their
> baselines are captured with `td.css` only (`node test/csp/capture-baseline.mjs <components…>`). The default run
> serves td.css only for them, the `legacy+td` run serves Tailwind + td.css against the same baselines.

# Per-component STATE MATRIX (Task 0B parity oracle)

For every component with ≥1 CSP-blocking construct (see `INVENTORY.md`), this enumerates the
states/attributes/interactions whose **styling differs**, the **styled elements** snapshotted, and
how each state is reached. The machine-readable source of truth is `matrix.json`; this is its
human companion. Each `(component, state)` pair has a committed baseline at
`baseline/<component>.<state>.json`, captured pre-refactor under a permissive page with the
deterministic Tailwind fixture — the oracle Task 1 asserts post-refactor parity against.

**Total: 70 states across 14 components.**

## How states are reached (capture mechanics)

- **Custom-element components** (toggle, checkbox, slider, input-field, dropdown, button, tabs,
  pagination, empty-state, table): inserted as `markup` into `#__mount`; they self-upgrade and
  render synchronously on `connectedCallback`. Property-driven ones (dropdown `.options`,
  tabs `.tabs`, table `.columns`/`.data`) use a `setup` JS string instead.
- **Static-class / portaled components** (modal `TdModal.show`, toast `TdToast.<type>`,
  loading `TdLoading.show` / `TdLoadingSpinner.create`): driven by a `setup` JS string; their
  DOM is appended to `document.body` and read with `portal: true`.
- **Pseudo-states**: `input-field.text-focus` calls `el.focus()` on `.td-input` before snapshot
  (labelled `text-focus`). No blocking construct is `:hover`-driven, so only focus is exercised
  here; `:hover`/`:active` selector parity is a Task-1 adopted-sheet concern, not a static baseline.
- **Settle**: after render we await 2×RAF; portaled/RAF-positioned states (dropdown-open, modal,
  toast, tabs) additionally wait `settle` ms so transitions/positioning finish before snapshot.

## Time/layout/random-dependent values EXCLUDED from baselines (determinism)

These are excluded per-state (`excludeProps` in `matrix.json`) because they vary run-to-run and are
**not** produced by the blocking construct being removed. Verified: two independent capture runs
produce byte-identical baselines.

| Component.state | excluded prop(s) | why |
|---|---|---|
| td-tabs.default, td-tabs.size-sm | `left`, `width` ONLY | indicator left/width are RAF-measured from active-button geometry in `_updateIndicator()`. `opacity` is KEPT (deterministically set to 1 after the construct's initial `opacity:0`) so the oracle catches an invisible-indicator regression. `transform` is also kept (deterministic `none`). |
| td-table.loading | `width` | skeleton bar widths use `Math.random()` (`td-table.js:234`) |
| td-loading.overlay | `transform`, `stroke-dashoffset` | captured under `prefers-reduced-motion: reduce` (overlay HAS a reduced-motion rule pinning dasharray to `90,150`); rotate transform + dashoffset still tick — Task 1 asserts liveness separately |
| td-loading.inline-* | `transform`, `stroke-dashoffset`, `stroke-dasharray` | the inline spinner has **no** reduced-motion rule; arc transform + dashoffset + dasharray all animate live |

## Component matrices

### td-toggle (5 declarative + 1 injected `<style>` + 2 SVG `style=`)
Styled els: `.td-toggle-track`, `.td-toggle-thumb`, `.td-toggle-icon:first-child` (cross),
`.td-toggle-icon:last-child` (check), check `path` (color).
States: `unchecked`, `checked`, `disabled`, `disabled-checked`, `custom-color` (#f59e0b),
`size-sm`, `size-lg`. (7) — later: `pending`, `ssr` (v0.26.0: PHP `td_toggle(…, ['element' => true])` markup `toggle@1`,
hydrated in place under the strict CSP; computed styles identical to `checked`).

### td-checkbox (1 injected `<style>`)
Styled els: `.td-checkmark` (the `:checked ~` bg/border rule), `.td-checkmark-icon` (opacity/scale),
`.td-checkbox-label`.
States: `unchecked`, `checked`, `disabled`, `custom-color` (#10b981), `size-sm`, `size-lg`. (6) — later: `error`, `ssr`
(v0.26.0: PHP `td_checkbox(…, ['element' => true])` markup `checkbox@1`, hydrated in place; styles identical to `checked`).

### td-slider (10 declarative)
Styled els: `.td-slider-container`, `.td-slider-track-bg`, `.td-slider-track-active` (width %),
`.td-slider-thumb` (left/size/opacity), `.td-slider-track-container`, `.td-slider-value-label`,
`.td-slider-step-mark(-label)`, `.td-slider-input`.
States: `min`, `mid`, `max`, `disabled`, `custom-color` (#a855f7), `show-value-label`,
`size-sm`, `size-lg`, `step-marks`. (9)

### td-input-field (5 declarative)
Styled els: `.td-input` / `.td-input-textarea`, `.td-input-note`, `.td-input-counter`.
States: `text`, `text-focus` (focus pseudo), `textarea`, `number`, `size-sm`, `size-lg`,
`disabled`, `error` (red border + note), `note`, `counter`, `counter-full` (count==max → error color). (11) — later additions
incl. `ssr` (v0.26.0: PHP `td_field(…, ['element' => true])` markup `input-field@1` — email, counter, helper — hydrated in place).

### td-dropdown (4 declarative incl. 1 SVG `style=`; menu portaled to body)
Styled els: `.td-dropdown-button`, `.td-dropdown-arrow` (rotate when open), `.td-dropdown-selected`,
and (portaled) `.td-dropdown-search`, `.td-dropdown-options` (max-height).
States: `closed`, `closed-selected`, `open` (portal + settle), `disabled`. (4)
v0.22.0: `.td-dropdown__options` (listbox) no longer scrolls — `.td-dropdown__scroller` inside it does (max-height);
new state `create` (`create-label` + 12 options: listbox, scroller, pinned `.td-dropdown__option--create` + its icon).
v0.26.0: `ssr` (PHP `td_dropdown(…, ['element' => true])` shell `dropdown@1` — label + required star + styled
`select.td-dropdown__native` — upgraded to the trigger under the strict CSP).

### td-button (1 declarative — variant glass OR custom-color inline style)
Styled el: inner `button` (bg/box-shadow/backdrop-filter from `_glassStyles[variant]`, or
bg/color/border from custom color).
States: `primary`, `secondary`, `success`, `danger`, `warning`, `custom-color` (#6366f1),
`disabled`, `loading`. (8) — later additions: `info`, `icon`, `ghost`, `link`, `link-disabled`, and `ssr` (v0.25.0:
the PHP `td_button(…, ['element' => true])` markup `data-td-ssr="button@1"`, hydrated in place under the strict CSP).

### td-tabs (4 declarative)
Styled els: `.td-tabs-container`, `.td-tabs-indicator` (excl. layout-derived left/width only;
opacity/transform kept), `.td-tab-btn`.
States: `default`, `empty` (no tabs), `size-sm`. (3)

### td-pagination (1 declarative — active page color)
Styled el: the active page `<span>` (`.td-pagination-pages > span.font-semibold` /
`:first-child` when current==1).
States: `page1`, `page3`, `custom-color` (#0ea5e9). (3)

### td-empty-state (5 declarative incl. 1 SVG `style=`)
Styled els: `.td-empty-state-card` (border/padding/bg/shadow), `.td-empty-icon` (SVG size/color),
`.td-empty-title` (margin), `.td-empty-actions` (margin + display:none when no actions).
States: `default`, `compact` (half padding), `size-sm`, `size-lg`. (4) — later additions: `actions`, and `ssr`
(v0.26.0: PHP `td_empty()` markup `empty-state@1` with a registry icon + one server action `td_link` element mode,
hydrated in place under the strict CSP).

### td-table (17 declarative; imports td-pagination + td-empty-state)
Styled els: `.td-table-container` (card), `.td-table-row[data-row-idx]` (zebra bg + transition),
header `th[data-sort-key]`, first cell; loading: `#probe > div` (skeleton card), `thead tr`,
`tbody tr` rows.
States: `data` (zebra row 1 tinted), `data-no-zebra` (note: `_isZebra()` is structurally
always-true in v0.2.0, so row 1 is still tinted), `sortable-header`, `loading` (excl. random
widths), `empty` (renders nested td-empty-state). (5)
v0.37.0 row selection (intentional new states, td.css only, no `style`): `selection` (multiple, layout table: header
`mixed`, row 0 selected + its control focused, row 1 not selected, row 2 selected AND locked by `rowSelectable` → mark
50 %), `selection-all` (header `true`), `selection-cards` (layout cards: "Chọn tất cả trên trang" chip first in the sort
bar, selected card accent border), `selection-single` (exclusive checkbox, header text visually hidden).
v0.39.0 (intentional new states, td.css only): `column-menu` (title + "Cột" ghost button, a hidden column = `[hidden]`
th / td `display: none`, the TdMenu of checkbox items open with one locked item + its hint; `min-visible="3"`) and
`controlled-loading` (`controlled` server mode after `setFilters()`: skeleton + `aria-busy` while both paginations stay).
`width` / `height` (+ the menu position) excluded: text boxes follow the platform font metrics (Linux CI).

### td-filter-chips (v0.39.0, new component — td.css only)
States: `default` (720px: a fixed chip + removable chips, label bold, value cut with …, × buttons, "Xoá tất cả"),
`overflow` (320px container: one scrolling row, `data-scroll-end` edge mask, the 10px block padding pulled back, "Xoá tất
cả" pinned), `link` (× and "Xoá tất cả" as links — PHP / no-JS chips). `width` / `height` excluded (font metrics); the
layout budgets are gated by test:responsive and the engines tests. (3)

### td-steps (v0.45.0, new component — td.css only)
States: `horizontal` (720px: the four marker states in one row — done ✓ accent, error ! danger pair, current accent + 2px
ring, upcoming surface + strong border; bold current label, error description), `vertical` (grid marker | text),
`compact` (320px container: labels visually hidden but read, the summary line shown), `clickable` (`navigation="back"`:
`nav` wrapper, a link step + button steps, transparent, no underline). `width` / `height` / `margin-left` excluded up
front (font metrics; `compact` also the resolved insets of the hidden label). (4)

### td-timeline (v0.45.0, new component — td.css only)
States: `grouped` (day groups, neutral + the four tones from the alert pairs, links in the accent, time / meta muted),
`details-open` (native `<details>` without the UA marker, chevron turned, pre-line detail text), `loading` (skeleton rows +
`aria-busy`; the shimmer `transform` excluded), `more` ("Xem thêm" as the secondary td-btn link). `width` / `height` /
`margin-left` excluded up front (font metrics). (4)

### td-diff (v0.46.0, new component — td.css only)
States: `table` (720px host: Trường · Trước · Sau, tinted before / after cells, kind labels, list + / −), `inline` (360px host:
block rows, "Trước" / "Sau" labels, arrow, struck-through before value), `masked` ([ĐÃ ẨN] + "Đã che" badge, server-masked
strings, "không so sánh được", the unsafe-number note), `json-open`, `unchanged-open`, `long-open` (native `<details>` opened:
JSON panes, the unchanged table, "Xem đầy đủ" + a visible ⟨U+202E⟩), `empty` ("Không có thay đổi."), `ssr` (PHP `td_diff()`
markup adopted in place). `width` / `height` / `margin-left` excluded up front (font metrics); the host owns its border colour
and figure margin (Tailwind preflight, combined profile). (8)

### td-rating (v0.50.0, new component — td.css only)
States: `half` (4.5 / 5 with the shown value and the count: the half star's "on" layer clipped by `--_td-rating-fill` from
`data-fill="50"`), `exact` (`precision="exact"`, 3.37: the partly filled star refined to 37 % through CSSOM — 0 violations),
`empty` (no rating: muted text only). `width` / `height` / `margin-left` excluded up front (font metrics). (3)

### td-carousel (v0.50.0, new component — td.css only)
States: `default` (hand-written slides wrapped once, 2 per view, wide inline controls: secondary discs + dots, prev
aria-disabled), `end` (after `goTo(5)`: next aria-disabled, last dot current — `scrollTo()` only), `undefined` (module not
loaded: the PHP frame is a native scroll-snap strip, JS-only controls `visibility: hidden` with their box). `width` /
`height` / `margin-left` (+ `transform` in `end`) excluded up front (font metrics). (3)

### td-modal (1 declarative; portaled to body)
Styled el: `.td-modal-content` (box-shadow + backdrop-filter), `.td-modal-backdrop`.
States: `default` (`TdModal.show({title, body})`). (1)

### td-toast (1 declarative; portaled to body)
Styled el: inner `.toast-item > div` (box-shadow + backdrop-filter; `${theme.bg}` is a Tailwind
class, captured via background-color). Captured after enter transition settles.
States: `info`, `success`, `error`, `warning`. (4)

### td-loading (2 declarative + 2 injected `<style>` + 4 `@keyframes`/6 `animation:` + SVG `style=`)
Overlay styled els: `.td-loading-card`, `.td-circular-spinner`, `.td-spinner-track`,
`.td-spinner-arc` (stroke/dasharray). Inline styled els: `.td-spinner` + its two `<circle>`s.
States: `overlay` (reduced-motion), `inline-sm`, `inline-md`, `inline-lg` (#10b981). (4)

### td-datetime-picker (1 injected `<style id="td-datetime-picker-styles">`; wheel UI portaled into a TdModal)
Styled els (portaled): `.td-dtp-wheel-container` (gradient `background-image` + the `::before`
highlight band), `.td-dtp-wheel-option.selected` (font-size/weight/color/transform). Reached by
`p._open()`. The `::before` pseudo-band can't be keyed by class via `getComputedStyle` here —
its parity is deferred to the Task-1 adopted-sheet check; this baseline locks the directly-styled
container + selected-option rules.
States: `open`. (1)

## EXCLUDED components (no blocking construct → not in matrix)

| Component | Why excluded |
|---|---|
| feedback/td-tooltip | Styles entirely via CSSOM (`el.style.cssText` / `el.style.<prop>`) — CSP-ALLOWED per the spike. Zero blocking constructs; already CSP-clean. |
| feedback/td-modal-stack | Pure z-index/stack manager; no inline/injected style. |
| base/td-base-element | 0 real constructs (its only `style=` grep hit is a JSDoc comment). |
| base/td-form-element, base/sample/td-sample | No render-style constructs. |
| utils/* | No DOM-style constructs (css-safe.js comment only). |

(NOTE: `form/td-datetime-picker` IS a hardening target — it now has a real matrix entry above
(`open` state) capturing its injected-`<style>` rules on the portaled wheel UI. It is no longer
excluded.)
