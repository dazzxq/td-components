# Changelog

All notable changes to **td-components** are documented here.

## 0.4.0

Logic / behavioral / a11y improvements ported from the dcms-components comparison. **Fully
backward-compatible** — no public attribute, property, event, or rendered visual output
changes; CSP parity gate stays at 73/73. New additions only.

### Fixed

- **`td-dropdown`** — `searchable` and `allow-clear` can finally be turned **off**. Their
  internal checks (`_isSearchable()` / `_isAllowClear()`) were written `!hasAttr || hasAttr`,
  which always returned `true`, so the search box and clear option could never be disabled.
  They now default **ON** and turn off only when explicitly set to a falsy value
  (`searchable="false"` / `"0"` / `"off"`, likewise `allow-clear`); a bare/absent attribute
  stays ON.
- **`td-modal.confirm()` promise hang** — dismissing a `confirm()` via the X button, the
  backdrop, or `closeAll()` left its Promise **unresolved forever** (no `onClose` handler).
  Ported dcms's settled-flag + resolve-first pattern: every close path now resolves **exactly
  once** (confirm → `true`; cancel / X / backdrop / `closeAll` → `false`), and a throwing user
  callback (`onConfirm`/`onCancel`) can no longer hang the Promise. `success`/`error`/`info`
  got the same treatment (OK → `true`, dismiss → `false`).

### Added

- **`td-input-field` `type="date"`** — now renders a native `<input type="date">` (calendar
  picker) instead of degrading to `text`. Native `min`/`max` are forwarded to the inner control
  for `date`, and the host independently recomputes range/type validity via its probe so
  constraint validation stays correct. Form-association is unchanged (the host still owns
  submission/validity).
- **`td-toggle` a11y** — the switch now exposes `role="switch"` with `aria-checked` kept in sync
  on every state change, plus `aria-disabled`, keyboard focusability (`tabindex`), and Space/Enter
  operability. No visual change.
- **`src/utils/dom-utils.js` toolbox** (new subpath export `@dazzxq/td-components/dom-utils`) —
  pure, framework-free helpers ported from `dcms-utils.js`: `slugify` (Vietnamese-aware),
  `formatFileSize`, `formatNumber`, `debounce`, `throttle`, `getAccessibleTextColor`,
  `contrastRatio`, plus `parseColorToRgb`/`relativeLuminance`. No component is forced to use it;
  it is an opt-in toolbox. App/Laravel-coupled helpers (CSRF, API-response, image-resize URL)
  were intentionally excluded.

## 0.3.1

`td-button` now supports a `type` attribute (`button`|`submit`|`reset`, default `button`, whitelisted) so it can submit/reset a form (light-DOM inner `<button>`). Backward compatible.

## 0.3.0

**CSP-strict compatible** — no declarative inline styles, no injected `<style>`; styling is
applied via CSSOM (`element.style`) and **constructable stylesheets** (`adoptedStyleSheets`).
The library now renders correctly under a strict `Content-Security-Policy: default-src 'self'`
with **no `style-src 'unsafe-inline'`**. A non-vacuous parity gate (`npm run test:csp`) proves,
under that enforced header, zero CSP violations **and** pixel-identical computed styles vs a
pre-refactor baseline across every component's full state matrix (73 states).

### ⚠️ Compatibility notes (compatibility-impacting minor)

1. **Requires `adoptedStyleSheets`** — Chromium 73+, Safari 16.4+, Firefox 101+. On an older
   browser (or SSR) the constructable-stylesheet helper degrades gracefully: components still
   render structurally (Tailwind utility classes + CSSOM scalars apply); only the
   selector/pseudo-class/`@keyframes` embellishments (hover, checked, spinner animation) are
   absent. No CSS-file fallback (the library ships no CSS by design).
2. **The DOM no longer carries the old inline `style` attributes.** Per-element styling is now
   set imperatively via CSSOM, and shared selector/state/keyframe rules live in an adopted
   stylesheet. Any consumer/integration/test that inspected those inline `style="…"` attributes
   (or an injected `<style>` element) will observe the change. Public attributes, properties,
   events, and rendered visual output are unchanged.
3. **Trusted raw-HTML escape hatches remain the consumer's CSP responsibility** (unchanged from
   0.2.0): `TdModal.show({ body })`, `td-table` column `render(row)`, and `td-empty-state`'s raw
   `<svg>` icon inject consumer HTML verbatim — if you pass `style="…"`/`<style>` through them, a
   strict CSP will block it. This release hardens only **library-authored** render output.

### Changed

- Every component's styling moved off declarative inline `style=`/injected `<style>`:
  per-instance scalars → CSSOM (`utils/css-safe.js` gains `applyStyles(el, map)`); selector,
  pseudo-class, `::before`/`::after`, state-combinator, `@keyframes`, and `@media` rules → a
  single per-component constructable stylesheet adopted once via the new
  **`utils/adopt-styles.js`** (`adoptStyles(css, key)` — feature-detected, lazy, idempotent,
  never throws in node/SSR). Per-instance dynamic values inside selector rules use CSS custom
  properties set via CSSOM. SVG inline styles → SVG presentation attributes.
- `TdBaseElement` calls an optional `_applyStyles()` hook after `afterRender()` on every render
  (initial + observed-attribute re-render), so state-dependent scalars stay correct.

### Added

- `npm run test:csp` — a standalone Playwright CSP parity gate (strict-CSP render + zero
  violations + computed-style parity + animation liveness), wired into `npm test`. Added
  explicit pinned devDeps `playwright-core` and `@tailwindcss/cli` + a deterministic Tailwind
  fixture used as the parity oracle.

## 0.2.0

The form-controls release: every form control is now a real **form-associated custom
element** (via `ElementInternals`), and a context-based XSS model hardens the whole library.

### ⚠️ Breaking changes

1. **`td-toggle` is now UNCONTROLLED by default.** Clicking it self-toggles like a native
   checkbox (and still emits `change`). To restore the old emit-only behavior (where you
   flip `checked` yourself), add the new boolean attribute **`controlled`**:
   ```html
   <td-toggle controlled></td-toggle>
   ```
2. **`td-input-field`'s inner native control no longer carries a `name`.** Submission now
   goes through the host element's `name`. If you relied on the inner `<input name>` (e.g.
   reading it from `FormData` under a different name, or styling `input[name=…]`), use the
   host's `name` instead. No change needed for normal `<form>` usage.

> **Not changed:** `tailwindcss` remains a **required** peer dependency (`>=4.0.0`). The
> baseline still expects Tailwind v4 on the host — see the README for the `@source` setup.

### Added

- **Form association for all form controls** (`td-input-field`, `td-checkbox`, `td-toggle`,
  `td-slider`, `td-dropdown`, `td-datetime-picker`): each submits in a host `<form>`
  (`FormData`/POST), supports `name`/`required`, participates in constraint validation,
  resets with the form, and is excluded by an ancestor `<fieldset disabled>`. Autofill/
  bfcache **state restore** is implemented for `td-input-field`, `td-dropdown`, and
  `td-datetime-picker`. New base class **`TdFormElement`** (exported;
  `@dazzxq/td-components/form-element`).
- `td-datetime-picker`: submits **ISO 8601** by default; `form-value-format="display"|"db"`
  to change the submitted shape.
- `td-input-field`: `min`/`max`/`step` (number), host-computed `typeMismatch`/range/step/
  `tooLong`/`valueMissing` validity.
- CSS-context sanitizers (`src/utils/css-safe.js`): `safeColor`, `safeHexColor`,
  `safeCssDimension`, `clampNumber`; `TdBaseElement.safeColor()`.
- Real-browser test suite (`@web/test-runner` + Playwright) for form behavior and XSS.
- Docs: a full [component catalog](docs/COMPONENTS.md) with a security model / context table.

### Security

- Closed the **`color` → CSS injection / attribute-breakout** vector: all color attributes
  (`color`/`track-color`/`active-color`/`text-color`) across checkbox, toggle, slider,
  button, pagination, and table are validated before entering a `<style>` rule or
  `style=""` attribute.
- **`TdToast` messages are now HTML-escaped** (previously interpolated raw into `innerHTML`).
- `td-table` column keys are escaped in `data-*` attributes; widths are CSS-sanitized and
  `align` is whitelisted; `td-input-field` `max-length` is coerced to a safe integer.
- `TdLoadingSpinner` colors are sanitized before entering the SVG.
- Trusted raw-HTML escape hatches are documented as explicit opt-ins (`TdModal` body,
  `td-table` column `render(row)`, `td-empty-state` raw `<svg>` icon).

## 0.1.0

- Initial release: ~16 vanilla Web Components (no Shadow DOM) on `TdBaseElement`, styled
  with host Tailwind v4. Form/feedback/display families with Storybook.
