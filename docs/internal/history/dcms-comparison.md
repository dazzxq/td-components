# dcms-components vs td-components — Comparative Analysis

> **Ghi chú lưu trữ (2026-09-27):** báo cáo lịch sử, số dòng `file:line` là của thời điểm 2026-06-10.
> Các mục **HIGH/MED** ở §5A đã ship trong **v0.4.0** (modal settled-flag, dom-utils, input `type=date`,
> toggle `role=switch`), trừ table sticky header (còn trong [roadmap](../roadmap.md) batch 4); bug dropdown
> `searchable`/`allow-clear` cũng đã sửa ở v0.4.0. Khuyến nghị §6 "hội tụ dcms về td" **không còn hiệu lực**:
> dcms2 đứng độc lập ([ADR 0007](../decisions/0007-td-canonical-over-dcms.md)).

READ-ONLY report. No code in either repo was modified. Every claim is cited to `file:line`.

- **td-components**: `/Users/theduyet/Documents/Code/components` (the fork, modernized)
- **dcms-components**: `/Users/theduyet/Documents/Code/dcms2/resources/js/components` (the original, evolved independently)

Date of analysis: 2026-06-10.

---

## 1. Language / Architecture verdict (per library)

Both libraries are **vanilla JavaScript ES modules** (no TypeScript, no JSX, no build step for the runtime). The decisive difference is the **component model**.

### td-components — real Custom Elements on a shared base
- Every component is a **Custom Element** extending a base class. Base: `TdBaseElement extends HTMLElement` (`src/base/td-base-element.js:22`) with lifecycle (`connectedCallback`/`disconnectedCallback` at `:37`/`:45`), attribute↔property reflection (`_setupProperties` `:88`), auto-cleanup `listen`/`setTimeout`/`setInterval` (`:117`–`:134`), and `emit()` CustomEvents (`:139`).
- Form controls extend `TdFormElement extends TdBaseElement` (`src/base/td-form-element.js:40`) which is **form-associated via `ElementInternals`** (`static formAssociated = true` `:41`, `this.attachInternals()` `:56`). It implements native form submission, `checkValidity`/`reportValidity` (`:108`/`:111`), `formResetCallback` (`:199`), `formDisabledCallback` for ancestor `<fieldset disabled>` (`:243`), `formStateRestoreCallback` for bfcache/autofill (`:219`), and label-click focus delegation (`:289`).
- Components register themselves: e.g. `customElements.define('td-checkbox', …)` (`src/form/td-checkbox.js:271`).
- **LIGHT DOM** (no Shadow DOM) — Tailwind from the host page styles them. Stated in `td-form-element.js:6`.
- Public surface is exported from `index.js` (20 named exports).

### dcms-components — static factory classes producing DOM nodes
- Components are **static factory classes**, NOT custom elements. Pattern: `export class Button { static create(options = {}) { … return container; } }` (`dcms-button.js:16`); same shape for `Checkbox.create` (`dcms-checkbox.js:23`), `InputField.create` (`dcms-input-field.js:58`), `Toggle.create` (`dcms-toggle.js:15`), `Dropdown` (instance class + `Dropdown.create` factory `dcms-dropdown.js:28/49`).
- `grep` for `customElements.define` / `extends HTMLElement` across `dcms2/resources/js/components/*.js` returns **zero hits** — confirmed not web components.
- Modals/tables/datetime are **static utility classes** (`Modal.show()` `dcms-modal.js:138`; `Datetime.create` `dcms-datetime.js:381`).
- API style is **callback-options** (`onClick`, `onChange`, `onSelect`) and **imperative DOM return values** with methods bolted onto the returned node (`container.getValue = …`, `dcms-checkbox.js:166`).
- It also ships a Laravel/Blade context: these JS factories are consumed by `dcms-app.js`, `resources/js/modules/*`, and Blade views — but the components themselves are plain JS.

### Consequence of the architectural split
This is not cosmetic. It changes how every consumer instantiates and wires components:
- td: declarative `<td-checkbox name="x" required>` in HTML, participates in `<form>` natively, reacts to attribute changes, cleans itself up on removal.
- dcms: imperative `const el = Checkbox.create({onChange}); parent.appendChild(el)`, manual wiring, no native form participation, no attribute reactivity, manual teardown.

**A direct file-for-file merge between the two is impossible.** Porting means re-expressing *logic* (validation rules, positioning math, keyboard handling, escaping) inside the other architecture — which is exactly what td-components already did for the form controls (the dcms `[Fix #N]` comments in `dcms-dropdown.js` were ported into `td-dropdown.js`).

---

## 2. Inventory

### td-components (`src/`, excluding tests/stories)
| Component | Purpose |
|---|---|
| `base/td-base-element.js` | Custom-element base: lifecycle, attr/prop sync, cleanup, emit, escapeHtml/safeColor |
| `base/td-form-element.js` | Form-associated base via ElementInternals (submit, validity, reset, fieldset-disabled, restore) |
| `form/td-button.js` | Button: 6 variants, custom color + auto-contrast text, loading, icon, `type` whitelist |
| `form/td-checkbox.js` | Form-associated checkbox, custom color, sizes, SVG check |
| `form/td-toggle.js` | Form-associated switch, uncontrolled-by-default, runtime color, sizes |
| `form/td-input-field.js` | Multi-type input/textarea/contenteditable, counter, full constraint validation |
| `form/td-slider.js` | Range slider (form-associated) |
| `form/td-dropdown.js` | Searchable dropdown, keyboard nav, auto-position, form-associated, pending-value resolve |
| `form/td-datetime-picker.js` | Date/time picker, form-associated, ISO/display/db submit formats |
| `utils/datetime.js` | `TdDateTime` date format/parse/relative helpers |
| `feedback/td-modal.js` | Modal utility class: stacked, sizes, focus trap, confirm/success/error/info |
| `feedback/td-modal-stack.js` | Z-index/backdrop stack manager |
| `feedback/td-toast.js` | Toast notifications (aria-live) |
| `feedback/td-tooltip.js` | Tooltip with arrow positioning, Escape-to-hide |
| `feedback/td-loading.js` | Loading spinner/overlay |
| `display/td-table.js` | Data table: sort, pagination, loading skeleton, zebra, custom render |
| `display/td-tabs.js` | Tabs |
| `display/td-pagination.js` | Pagination control |
| `display/td-empty-state.js` | Empty-state placeholder with actions |
| `utils/escape.js` | `escapeHtml` (string-replace, XSS) |
| `utils/css-safe.js` | `safeColor`/`safeHexColor`/`safeCssDimension`/`clampNumber`/`applyStyles` (CSS-context sanitizers) |
| `utils/adopt-styles.js` | Constructable-stylesheet adoption (CSP-strict) |

### dcms-components (`dcms2/resources/js/components/`)
| Component | Purpose |
|---|---|
| `dcms-button.js` | Button factory (variants, custom color, loading, icon) |
| `dcms-checkbox.js` | Checkbox factory |
| `dcms-toggle.js` | Toggle factory (role=switch) |
| `dcms-input-field.js` | Input factory + **static ID-based helpers** (`getValueById`, `setErrorById`, `focusById`) |
| `dcms-slider.js` | Slider factory |
| `dcms-dropdown.js` | Dropdown (instance class, the `[Fix #N]` hardened version) |
| `dcms-datetime.js` | Datetime: format/parse helpers **+ a full Modal-based calendar picker** (1203 lines) |
| `dcms-utils.js` | Utils: escapeHtml, **formatDate, generateSlug (Vietnamese), copyToClipboard, formatFileSize, formatNumber, debounce/throttle, getAccessibleTextColor/contrast, getCsrfToken, handleApiResponse** + `convertImageResizeUrl` |
| `dcms-modal.js` | Modal utility class (**settled-flag promise pattern**, `closable` on dialogs, `loading()`) |
| `dcms-modal-stack.js` | Z-index/backdrop stack manager |
| `dcms-toast.js` | Toast (aria-live) |
| `dcms-tooltip.js` | Tooltip with arrow positioning |
| `dcms-loading.js` | Loading spinner |
| `dcms-table.js` | Table: sort, pagination, **SortableJS drag-reorder rows**, **sticky header** |
| `dcms-tabs.js` | Tabs factory |
| `dcms-pagination.js` | Pagination (`PaginationSimple`) |
| `dcms-empty-state.js` | Empty-state factory |
| `dcms-notification.js` | **Notification center** (no td equivalent) |
| `dcms-action-buttons.js` | **Action-button cluster** (no td equivalent) |
| `dcms-post-card.js` | **CMS post card** (domain-specific, no td equivalent) |
| `dcms-media-picker.js` | **Media/asset picker** (domain-specific, no td equivalent) |
| `dcms-richtext.js` + `dcms-richtext-toolbar.js` + `dcms-richtext-link-modal.js` | Rich-text editor v1 |
| `dcms-richtext-v2/` (55 files) | **Rich-text editor v2** — modular core/features/toolbar/behaviors (no td equivalent) |
| `dcms-components-entry.js` | Bundle entry |

---

## 3. Overlap map

### In both (the comparable surface)
button, checkbox, toggle, input-field, slider, dropdown, datetime (helpers), modal, modal-stack, toast, tooltip, loading, table, tabs, pagination, empty-state, plus the `escapeHtml` utility.

### Unique to td-components
- `TdBaseElement` / `TdFormElement` (the custom-element + ElementInternals base layer).
- `utils/css-safe.js` (CSS-context sanitizers) and `utils/adopt-styles.js` (constructable stylesheets). **These have no dcms counterpart.**
- Storybook + web-test-runner browser tests (CSP-fallback tests, XSS tests).

### Unique to dcms-components
- **Rich-text editor** (v1 + the 55-file v2) — by far the largest body of unique logic (~5k+ lines).
- **Domain/CMS components**: `dcms-media-picker`, `dcms-post-card`, `dcms-action-buttons`, `dcms-notification`.
- **`dcms-utils.js` general toolbox** (slug, formatDate, formatFileSize/Number, debounce/throttle, getAccessibleTextColor, getCsrfToken, handleApiResponse, convertImageResizeUrl).
- **`dcms-datetime.js` calendar picker UI** (td has only the input/parse layer in `datetime.js`; the actual popup calendar lives in dcms, 1203 lines).
- **Table extras**: SortableJS drag-reorder + sticky header.
- **InputField static ID helpers** (`getValueById` etc.).

---

## 4. Per-overlapping-component logic comparison (logic, not styling)

> Cross-cutting truth: for every form control, **td is categorically better on form integration, validity, escaping, and CSP**, because dcms predates ElementInternals and injects per-instance `<style>` with **unsanitized** colors. dcms is occasionally better on a few discrete behaviors that were added there after the fork and never flowed back.

### 4.1 Checkbox — **td wins decisively**
- **Form-submit/validation**: td submits via the host and enforces `required→valueMissing` (`td-checkbox.js:240`–`:249`); supports reset (`:257`) and `<fieldset disabled>` (via base). dcms has **no form participation at all** — it returns a `<label>` with `getValue/setValue` (`dcms-checkbox.js:166`–`:171`); cannot be submitted or validated.
- **XSS/CSS-injection**: dcms interpolates the raw `color` option straight into an injected `<style>` (`dcms-checkbox.js:123`, `:134`) and `_colorToShadow` — **no sanitization**, a CSS-injection vector. td routes color through `safeColor` (`td-checkbox.js:91`) and applies it via CSSOM `setProperty` (`:155`, `:197`), which cannot break out of the declaration.
- **CSP**: dcms appends `<style>` to `document.head` per instance (`dcms-checkbox.js:150`) — blocked by `style-src 'self'`. td adopts ONE constructable sheet of enhancement-only transitions (`:101`) and applies all load-bearing scalars via CSSOM (`:144`+).
- **a11y**: both set `aria-checked`. Parity.
- **Edge case**: dcms leaks a `<style>` element per instance and never removes it (memory growth on churn). td has none.

### 4.2 Toggle — **td wins, but dcms has one a11y bit td dropped**
- td: form-associated, `required` (`td-toggle.js:340`), **uncontrolled-by-default** with opt-in `controlled` attr (`:324`), runtime color via attribute (`:117`), CSP-safe scalars (`_scalarStyles` `:164`). Color sanitized via `safeColor` (`:88`).
- dcms: injects per-instance `<style>` with **unsanitized** rgb derived from raw color (`dcms-toggle.js:98`, `parseColor` uses computed style but the gradient string is built into injected CSS), no form participation, `onChange` callback only.
- **a11y regression in td**: dcms sets `role="switch"` + `aria-checked` on the input (`dcms-toggle.js:116`–`:117`). **td-toggle sets neither `role="switch"` nor `aria-checked`** anywhere (grep of `td-toggle.js` shows no `role`/`aria`). For a switch widget this is a real accessibility regression worth fixing in td.

### 4.3 Input-field — **td wins big on validation; dcms has 3 conveniences td lacks**
- **Validation**: td recomputes the full ValidityState off a **detached probe input** and neutralizes value-dependent native types so the inner control can't independently block the host form (`td-input-field.js:60`, `_computeValidity` `:352`, explicit number-grammar check at `:379` to defeat the `<input type=number>` value-sanitization trap). This is genuinely more correct than dcms, which just calls `fieldEl.checkValidity()` and only special-cases empty contenteditable (`dcms-input-field.js:384`–`:413`).
- **Escaping**: td escapes value/placeholder/label before interpolation (`:117`, `:122`, `:123`) and coerces `max-length` to a positive int before use (`:103`). dcms builds DOM imperatively (`textContent`, `.value`), which is also XSS-safe but loses the declarative attribute path.
- **dcms-only conveniences worth noting**:
  1. **`date` input type** is supported (`dcms-input-field.js:249`) with native `min`/`max` (`:259`); td's `_resolveInputType` does **not** list `date` (`td-input-field.js:90`) so `type="date"` degrades to text.
  2. **Static ID-based helpers** `getContainerById`/`getValueById`/`setErrorById`/`focusById` (`dcms-input-field.js:536`–`:640`) — ergonomic for Blade pages that only have an id. td has no equivalent (not needed for a custom element you hold a reference to, but handy for server-rendered pages).
  3. `grayOut`, `width`, `setEditable` options (`dcms-input-field.js:70`, `:66`, `:434`).
- **CSP**: dcms uses `style.cssText`/inline styles heavily; td applies scalars via CSSOM and drives focus styling imperatively. td is CSP-stricter.

### 4.4 Dropdown — **td wins; it is a superset port of the hardened dcms version**
- dcms-dropdown is the already-hardened version (the `[Fix #1..#8]` comments: position:fixed, RAF-throttled scroll, global-listeners-on-open-only, hover-highlight, keyboard nav, unified callback, XSS-escape, string comparison — `dcms-dropdown.js:54`–`:309`). td-dropdown **ports all of them faithfully** and adds:
  - **Form association**: submits the selected value, `required→valueMissing` (`td-dropdown.js:218`–`:226`), reset, state restore.
  - **Pending-value resolution**: a value set before options arrive is remembered and resolved when `options`/`updateData` lands (`:84`–`:88`, `:736`–`:744`) — dcms silently drops a value with no matching option.
  - **Auto-close when the trigger scrolls out of viewport** (`td-dropdown.js:686`) — dcms keeps repositioning.
  - **Auto-cleanup** of the portaled menu on disconnect (`:174`).
- **Bug found in td-dropdown** (not in dcms): `_isSearchable()` and `_isAllowClear()` are written `!has(x) || has(x)` (`td-dropdown.js:103`, `:105`), which **always returns true** — `searchable`/`allow-clear` can never be turned off via attribute. dcms got this right with explicit `!== false` defaults (`dcms-dropdown.js:75`, `:76`). This is a real td bug to fix (independent of any port).
- a11y: both use `aria-haspopup/aria-expanded/role=listbox/role=option/aria-selected`. Parity.

### 4.5 Modal — **mixed; dcms has a correctness fix td is MISSING**
- Shared: identical stacked-modal architecture, identical focus trap (`td-modal.js:634` ≈ `dcms-modal.js:224`), same entrance/exit rAF animation, same `_configureModal` sizing logic.
- **td improvements**: glass surface moved from inline `style=` (`dcms-modal.js:95`) into an adopted constructable sheet (`td-modal.js:46`, `:139`) → CSP-safe. `confirm/success/error` message is `escapeHtml`-ed (`td-modal.js:311`) whereas dcms interpolates `message` raw into innerHTML (`dcms-modal.js:636`, `:677`) — **dcms confirm/success/error/info are XSS-exposed if `message` contains user data**. dcms loading() also injects an inline `<style>` block (`dcms-modal.js:834`) → CSP-blocked.
- **dcms correctness fix MISSING in td (high value)**: dcms dialog promises use a **settled-flag + resolve-first pattern** (`dcms-modal.js:603`–`:651`) so that closing a `confirm()` via the X button or backdrop resolves the promise to `false` **exactly once**, and a throwing user callback can't hang the promise. **td-modal.confirm() has NO `onClose` handler** (`td-modal.js:270`–`:317`): if the user dismisses the confirm via X/backdrop, **the promise never resolves** — a real hang bug. Same gap in td `success/error/info` is less severe (those are OK-only) but they too won't resolve on dismiss. This is the single most valuable dcms→td port.
- dcms also marks loading modals explicitly (`isLoading` flag, `dcms-modal.js:159`/`_closeAllLoadingModals` `:303`) and auto-closes loading modals before showing a real dialog. td removed `loading()` from modal in favor of `TdLoading` (`td-modal.js:448`), so this is a deliberate divergence, not a gap.

### 4.6 Table — **td wins on safety/CSP + skeleton; dcms wins on two features**
- td: sort tri-state (`td-table.js:157`), pagination via `<td-pagination>`, loading skeleton, zebra, custom `render(row)` returns trusted HTML but plain cells are escaped (`:298`, documented at `:34`), selector chrome in an adopted sheet (CSP-safe). Sort buttons are real `<button>` (`:351`).
- dcms: **drag-to-reorder rows via SortableJS** (`dcms-table.js:15`, `:468`) and **sticky header in fixed-height mode** (`:221`, `:582`) — neither exists in td. The SortableJS dependency makes drag-reorder a heavier port (new dependency or a hand-rolled DnD).
- Neither table exposes ARIA grid semantics beyond native `<table>`; parity (both could improve).

### 4.7 Datetime — **different scopes**
- td ships only the **input + parse/format/validity layer** (`td-datetime-picker.js`, form-associated with ISO/display/db submit formats `:62`) plus `TdDateTime` helpers (`utils/datetime.js`).
- dcms ships a **full Modal-based calendar popup** (`dcms-datetime.js`, 1203 lines, `Datetime.create` `:381`, range validation `:339`/`:471`, Now/Choose buttons `:629`+, `onChange` `:1077`) **on top of** the same format/parse helpers. The actual calendar-grid UI is dcms-only.
- Verdict: not better/worse — td has the safer *field*, dcms has the richer *picker UI*.

### 4.8 Toast / Tooltip / Loading / Tabs / Pagination / Empty-state — **near-parity; td is the CSP-hardened restatement**
- Toast: both set `aria-live` (assertive for error) (`td-toast.js:180` ≈ `dcms-toast.js:105`). td escapes the message (`:183`).
- Tooltip: same arrow-clamping math (`td-tooltip.js:415` ≈ `dcms-tooltip.js:372`), same Escape-to-hide (`td-tooltip.js:187` ≈ `dcms-tooltip.js:163`). Parity.
- Tabs: **both lack `role="tablist"`/`role="tab"` and arrow-key navigation** (grep of both files: no `role`/Arrow handling). Shared a11y gap. td escapes label/id/icon (`td-tabs.js:133`, `:139`).
- Pagination / Loading / Empty-state: td versions are the escaped, attribute-driven restatements; no logic dcms has that td lacks.

---

## 5. PORT LIST

### A) dcms → td (port INTO td-components)

| Priority | Item | Source → Target | Rationale |
|---|---|---|---|
| **HIGH** | **Modal dialog settled-flag / resolve-on-dismiss** | `dcms-modal.js:603`–`:651` → `td-modal.js confirm/success/error/info` | Fixes a real **promise-hang bug**: td's `confirm()` never resolves when dismissed via X/backdrop (no `onClose`). Also guards throwing callbacks. Architecture-agnostic — pure promise logic. |
| **HIGH** | **`dcms-utils.js` toolbox** (selective) | `dcms-utils.js:81` (generateSlug/Vietnamese), `:150` formatFileSize, `:158` formatNumber, `:167/179` debounce/throttle, `:196` getAccessibleTextColor/contrast, `:254` handleApiResponse | Pure functions, zero architecture coupling. td already needs `getAccessibleTextColor` for `td-button` auto-contrast (currently re-implemented). A `utils/format.js` + `utils/color.js` module is universally useful. Skip `getCsrfToken`/`convertImageResizeUrl` (app-specific). |
| **MED** | **InputField `date` type + native min/max** | `dcms-input-field.js:249`, `:259` → `td-input-field._resolveInputType` (`:90`) + `_computeValidity` | Closes a type gap; `type="date"` currently degrades to text in td. Small, fits the existing probe-validation design. |
| **MED** | **Toggle `role="switch"` + `aria-checked`** | `dcms-toggle.js:116`–`:117` → `td-toggle.js render()` | a11y regression fix; td dropped the switch role. Trivial to add on the inner focus target / host. (Technically a td bug fix, surfaced by the comparison.) |
| **MED** | **Table sticky header (fixed-height mode)** | `dcms-table.js:221`, `:582` → `td-table.js` | Common real-world need for long tables; pure CSS-position logic, CSP-compatible via CSSOM. |
| **LOW** | **InputField ID-based static helpers** | `dcms-input-field.js:536`–`:640` | Only valuable if td components must be driven from server-rendered pages by id. For a custom element you hold a ref to, less needed. Implement as `TdInputField.getById(id)` thin wrappers if desired. |
| **LOW** | **Table drag-reorder rows** | `dcms-table.js:468` (SortableJS) | Useful but pulls in SortableJS (new dependency) or a hand-rolled DnD. Defer unless a consumer needs it. |
| **LOW (large)** | **Calendar popup UI** | `dcms-datetime.js` (1203 lines) | td has only the field; if a visual date *picker* (not just a formatted input) is required, port the calendar grid. Big effort; re-architect off `Modal` into a `td-datetime-picker` popup. |
| **DEFER** | **Rich-text editor (v2), media-picker, post-card, notification, action-buttons** | dcms-richtext-v2/ (55 files), etc. | Largest unique surface, but heavily CMS/domain-specific and architecturally entangled. Port only if td's scope expands to a CMS authoring UI. |

### B) td → dcms (flow improvements BACK to dcms)

| Feasibility | Item | Source | Rationale |
|---|---|---|---|
| **HIGH / easy** | **CSS-context sanitizers** `safeColor`/`safeHexColor`/`safeCssDimension` | `td/utils/css-safe.js` | dcms injects **unsanitized** color into `<style>` in checkbox (`dcms-checkbox.js:123`) and toggle (`dcms-toggle.js:98`). Dropping these helpers in and wrapping the color interpolations closes a CSS-injection class with no architecture change. |
| **HIGH / easy** | **Escape `message` in Modal dialogs** | `td-modal.js:311` pattern | dcms `confirm/success/error/info` interpolate `message` raw (`dcms-modal.js:636`, `:677`, …) — XSS if message carries user data. One-line `escapeHtml(message)` each. |
| **MED** | **Move injected `<style>` blocks to `adoptStyles` (or at least dedupe + cleanup)** | `td/utils/adopt-styles.js` | dcms appends a `<style>` per checkbox/toggle instance to `document.head` and never removes it (`dcms-checkbox.js:150`, `dcms-toggle.js:99`) — CSP-blocked under `style-src 'self'` and a memory leak on churn. Adopting one shared sheet fixes both. Requires moving per-instance color to a CSS var + CSSOM. |
| **MED→HARD** | **ElementInternals form-association** | `td/base/td-form-element.js` | The biggest correctness win, but it requires the **web-component architecture** dcms doesn't use. Cannot flow back as-is; dcms would need a custom-element rewrite (effectively re-converging — see §6). Flagging as the strategic gap, not a drop-in. |
| **MED** | **InputField probe-based full ValidityState** | `td-input-field.js:352` | More correct than dcms's `fieldEl.checkValidity()`. Portable as a standalone function even in dcms's factory model (validate the returned node's value with a detached probe). |

### Universal capabilities (belong in a shared layer, not duplicated)
- `escapeHtml` (both already have it — `td/utils/escape.js` vs `dcms-utils.escapeHtml`).
- The CSS-context sanitizers (`css-safe.js`).
- The format/slug/debounce/color toolbox (`dcms-utils.js`).
- The dropdown positioning math, the tooltip arrow-clamp math, the modal focus-trap, the modal sizing table — all are pure logic currently **duplicated** in both repos.

---

## 6. Divergence risks + re-converge vs stay-separate

### Risks of the current two-fork state
1. **Bug fixes don't propagate.** The dcms dropdown `[Fix #1..#8]` made it into td, but the reverse channel is broken: td's modal promise-hang fix doesn't exist in td precisely because dcms's fix never flowed in, and dcms's XSS-escaping/CSS-sanitizers don't exist in dcms because td's hardening never flowed back. Each repo now has bugs the other already solved (**td modal hang** ↔ **dcms unsanitized-color + raw modal message**).
2. **Duplicated pure logic drifts.** Positioning, focus-trap, sizing tables, format helpers are copy-pasted; they will diverge silently (e.g. the modal full-viewport regex already differs: `td-modal.js:525` strips `rounded-t-3xl|sm:rounded-[20px]` while `dcms-modal.js:406` strips `rounded-t-2xl|sm:rounded-xl`).
3. **Two security postures.** td is CSP-strict + sanitized; dcms is inline-style + unsanitized. Any page that pulls both inherits the weaker posture.
4. **a11y inconsistency.** Switch role exists in dcms but not td; tablist/keyboard nav missing in both.

### Recommendation: **re-converge on the td architecture, in stages — do NOT keep them permanently separate.**
The two libraries share a lineage and ~80% of their *logic*, but only one (td) is on a future-proof foundation (custom elements + ElementInternals + CSP + sanitizers). The dcms factory model is a dead end for form/security correctness. Concretely:

1. **Immediate (independent of convergence):** fix the two real bugs surfaced here —
   - td: the `confirm()` promise hang (`td-modal.js:270`), the `_isSearchable/_isAllowClear` always-true logic (`td-dropdown.js:103/105`), the missing toggle `role="switch"`.
   - dcms: wrap injected colors in `safeColor`, escape modal `message`.
2. **Short term:** extract the **pure, architecture-free logic** (format/slug/color/debounce, css-safe sanitizers, escape) into a shared module both repos import. This stops the duplication drift without forcing dcms onto custom elements yet.
3. **Medium term:** port the HIGH/MED dcms→td items (modal settled-flag, utils toolbox, date type, switch role, sticky header) so **td becomes a strict superset** of dcms's still-relevant component logic.
4. **Long term:** migrate dcms's *consumers* (the Laravel/Blade pages) to the `td-*` custom elements, retiring the dcms factories as td reaches feature parity. Keep dcms's **genuinely unique, CMS-domain pieces** (rich-text v2, media-picker, post-card) as separate add-ons that *depend on* td-components rather than re-implementing primitives.

**Net:** treat td-components as the canonical primitive library and let dcms's CMS-specific widgets sit on top of it. Permanent separation only makes sense for the domain widgets (rich-text/media/post-card) — never for the shared primitives, where divergence is actively producing parallel, opposite bugs.

---

## Files read for this report (evidence base)
td: `index.js`, `src/base/td-base-element.js`, `src/base/td-form-element.js`, `src/utils/{escape,css-safe,adopt-styles}.js`, `src/form/{td-checkbox,td-toggle,td-dropdown,td-input-field}.js`, `src/feedback/td-modal.js`, `src/display/td-table.js`, and grep-scans of `td-{button,tooltip,tabs,toast,pagination,loading,empty-state,datetime-picker}.js`.
dcms: `dcms-{utils,checkbox,toggle,dropdown,input-field,modal}.js` (full), grep-scans of `dcms-{button,tooltip,tabs,toast,pagination,loading,empty-state,datetime,table}.js`, plus directory inventory of `dcms-richtext-v2/` and the domain components.
