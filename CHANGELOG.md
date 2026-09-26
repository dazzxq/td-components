# Changelog

All notable changes to **td-components** are documented here.

## 0.8.0

Migration **batch 2**: `td-input-field`, `td-slider`, `td-pagination`, `td-tabs`, `td-empty-state` are now
**token-native** (td.css only). Plan: `docs/plans/v0.8.0-batch2.md` (Codex plan-review APPROVE, 3 rounds; inventory +
decisions D1–D19 in `v0.8.0-batch2-inventory.md`). Built in parallel by four agents in isolated worktrees, integrated here.

### Breaking (internal DOM / classes)

- Internal classes renamed to BEM — `docs/migration/class-map.md` (`.td-input*` → `.td-field*`, `.td-slider-*` →
  `.td-slider__*`, `.td-pagination-*` → `.td-pagination__*`, `.td-tab-btn` → `.td-tabs__tab`, `.td-empty-*` →
  `.td-empty-state__*`). These components require `td.css`.

### Behaviour changes

- **One event per kind** for input-field and slider (native `input`/`change` no longer bubble); input-field `change`
  only when the value changed since focus.
- **Tabs keyboard:** APG roles, roving tabindex, ← → Home End move focus, **Enter/Space select** (manual activation);
  `activation="auto"` makes arrows select. Default tablist name "Các thẻ".
- **Pagination:** page numbers are buttons (`aria-current`), focus kept across page changes, `max-pages` is now the
  window of consecutive pages (was only a threshold — bug), current page is a solid accent pill (was red text,
  3.76:1), `current-page` clamped. td-table no longer forces `#ef4444` and names its two paginations.
- **Input-field:** error AND helper show together; form reset clears the error; attribute changes update in place
  (focus + caret kept); the counter at the limit no longer turns the border red; the label is always associated
  (`field-id` verbatim, else `{host-id}-control`).
- **Slider:** default colour is the accent token; `color` accepts any safe CSS colour; `track-color` is applied
  (it was ignored); step marks only when ≤ 50; `role=slider`/`aria-value*` duplicates removed (native range).
- **Empty-state:** raw `<svg>` string `icon` deprecated and validated (see Security); unknown icon names warn and fall
  back to `inbox`; `actions` render `.td-btn` buttons and no longer stack listeners.

### Added

- `aria-required`, `aria-describedby` (helper, counter, error), host `aria-label` forwarding and external
  `<label for>` naming for every form control (shared `_applyAccessibleName` in `TdFormElement`); the error id is also
  in `aria-describedby` for checkbox/switch (AT support for `aria-errormessage` is patchy).
- `TdFormElement`: `_mountErrorNote`, `_describedByIds`, `_syncDescribedBy` hooks; slider + input-field on the error
  contract.
- td-tabs `tab.panel` (managed tabpanel with attribute restore), `activation`, `aria-label`; td-pagination `aria-label`;
  td-empty-state `iconNode`, `heading-level`; td-slider `--td-slider-w`, `aria-valuetext`, knob glass lift while
  dragging; icons `upload`, `link`, `image`; `svgStringToDefinition` / `renderIconDefinition`.
- CSP harness: `_meta.mixed` (td-table: Tailwind + td.css), td-only page body reset (`fixture/harness.css`), 44 new
  token-native baselines; contract fixtures for all five; per-component batch-2 browser suites.

### Fixed

- **External `<label for="host-id">` click** now focuses the inner control (and toggles checkbox/switch) — the base
  class documented it but never did it.
- **Moving an element in the DOM** kept it rendered but dead (listeners were removed on disconnect and never re-bound);
  it now re-renders on reconnect.
- Tabs indicator re-measured on resize (ResizeObserver); the `tabs` setter re-validates the active tab.

### Security

- td-empty-state raw-SVG hatch closed: strings are parsed as `image/svg+xml` and rebuilt from the icon geometry
  allowlist (root attributes allowlisted too); anything else is rejected.

## 0.7.0

Migration **batch 1**: `td-button`, `td-checkbox`, `td-toggle`, `TdLoading` are now **token-native** (td.css only,
no Tailwind, no adopted stylesheets). Plan: `docs/plans/v0.7.0-batch1.md` (Codex plan-review APPROVE, decisions D1–D10).

### Breaking (internal DOM / classes)

- Internal classes renamed to BEM — see `docs/migration/class-map.md`. Public tags, attributes, properties, methods
  and events are unchanged except the behaviour changes below.
- These four components **require `td.css`** (`import '@dazzxq/td-components/td.css'` or `<link>`).
- `td-checkbox` host custom property `--td-cb-color` → `--td-checkbox-color`.

### Behaviour changes

- **One `change` event** for `td-checkbox` / `td-toggle` (the inner input's native `change`/`input` no longer bubble
  alongside the CustomEvent).
- **`td-toggle`** is a native `<input type="checkbox" role="switch">` (accessible name, native Space/disabled/focus);
  **Enter no longer toggles** (APG switch pattern).
- **`td-button` loading** keeps focus: `aria-busy` + `aria-disabled` + swallowed clicks instead of native `disabled`
  and a re-render. `disabled`/`loading`/`label` update in place.
- **`td-button` look**: solid fills (glass removed — liquid-glass R1/R7); status variants use the semantic colour
  tokens (all ≥ 4.5:1; the old glass variants were 2.0–3.2:1). Radius token `--td-btn-radius` (14 px; capsule on
  touch). `icon` takes a registry name; other values are a deprecated legacy class list.
- **`td-checkbox` default colour** is the accent token (was `#2196F3`); **`td-toggle` default on-colour** `#16a34a`
  (was `#4ADE80`, 1.7:1) with a 3:1 off-track edge (WCAG 1.4.11).
- **`TdLoading.wrap()` is ref-counted**; the overlay is `role="status"`, holds focus, makes the page `inert`
  (toasts excluded) and locks scroll, restoring all of it exactly once. `z-index` token `--td-z-loading: 480`
  (was 99999: now below toasts).

### Added

- **Error contract** in `TdFormElement` (opt-in; on for checkbox + switch): `setError(msg)`, `clearError()`,
  `errorMessage`, `error-text` attribute → `aria-invalid` + `aria-errormessage` + `.td-field-error` note; cleared on reset.
- **Accessible-name precedence** for checkbox/switch: `label` → host `aria-label` → external `<label for>` via
  `aria-labelledby`. Hit areas ≥ 24 px (44 px on touch).
- **Shared inert lease** `src/utils/inert-lock.js` (security review): TdLoading and td-lightbox no longer make the
  page inert independently — overlapping overlays stack by layer, `inert` is removed only when no overlay needs it,
  body children appended while blocked are covered, the site's own `inert` is never touched.
- `TdCheckableElement` base; `fillIconSlots()` in `@dazzxq/td-components/icons`; shared `.td-spinner`;
  tokens `--td-btn-*`, `--td-checkbox-*`, `--td-switch-*`, `--td-control-border-strong`, `--td-field-error`,
  `--td-z-loading`; `TdLoadingSpinner.create({ label })`; `td-button` forwards `aria-label`; button auto text colour
  by WCAG contrast for any CSS colour (browser-resolved; alpha composited over white).
- CSP harness: token-native profile (`_meta.tokenNative`; td.css-only baselines, 28 states; the `legacy+td` run proves
  host Tailwind cannot alter them); golden markup contracts `test/contracts/{button,checkbox,switch,loading}.html`;
  batch-1 browser suite (contrast, focus, events, naming, error contract, hit targets, loading lifecycle).

### Removed

- `*-csp-fallback.browser-test.js` for checkbox/toggle/loading (they tested the adopted-sheet fallback ADR 0008 removes).

## 0.6.0

First **token-native** component and the shared icon registry. Plan: `docs/plans/v0.6.0-lightbox.md`
(Codex plan-review APPROVE). No change to existing components.

### Security

- Dev tooling: Storybook 8.6.14 → **8.6.18** (GHSA-mjf5-7g4m-gx5w WebSocket hijacking; GHSA-8452-54wp-rmv6
  `.env` leak into builds) + `npm audit fix` (non-breaking). Remaining advisories are dev-only transitive deps
  that need breaking majors (`extract-zip` via `@web/test-runner`'s puppeteer browsers — unused, tests use the
  Playwright launcher; `uuid` via Storybook addons) — tracked in the roadmap. The published package has no runtime
  dependencies.

### Added

- **`TdLightbox`** (`@dazzxq/td-components/lightbox`, [ADR 0009](docs/decisions/0009-td-lightbox-hooks.md)) —
  clean-room port of the dwp lightbox core, styled by `td.css` (Clear glass chrome + local dim, solid panel):
  - `open(items, options)` → handle, `bind(root, options)` → unbind, events `td-lightbox-open|change|close`;
    no side effects on import, no window globals, no inline styles.
  - Hooks: `isAllowedUrl` (default `https:`, `http:` only on an `http:` page — no cleartext downgrade), `download`, `video` (default native `<video>`; failure-isolated,
    abortable), `history` (off by default; `true` or an adapter with a defined push/back/pop contract incl.
    async-push races), `panel` (caption or custom element; 2-column / bottom sheet), `toolbar` (registry icons),
    `labels` (Vietnamese defaults), `closeOnBackdrop`, `isForeignLayerOpen`.
  - Pointer Events gestures (pinch, pan, double-tap / click zoom, swipe navigate / close / sheet), keyboard
    (Esc, arrows, F, Tab trap that always holds), fullscreen, preload + spinner, render-token stale guards.
  - Fixes vs the dwp original: restores only the `inert` it set, shares the ref-counted scroll lock with the
    modal stack, no selector built from toolbar ids, no `innerHTML` icons, gallery index by element (not src).
- **Icon registry** (`@dazzxq/td-components/icons`, [ADR 0010](docs/decisions/0010-icon-registry.md)) —
  `tdIcon(name, { size, label, class })`, `registerIcons()` (allowlisted data only), `hasIcon`, `listIcons`,
  opt-in `<td-icon>` (`./icon-element`); 24 core icons (Lucide geometry, td names) authored in
  `src/icons/icons.json` (also exported for PHP) → generated `registry.js` (`build:icons` / `check:icons`);
  size tokens `--td-icon-s|m|l`, `--td-icon-stroke`; `THIRD_PARTY_NOTICES.md`.
- Tests: lightbox browser suite (42), icon suite, lightbox page in the token CSP gate (3 engines × self /
  nonce-only: zero violations, zoom, close); markup contract fixture `test/contracts/lightbox.html`.
- Storybook: **Feedback/Lightbox** (gallery, caption panel, hooks, video), **Foundations/Icons**; Foundations/Glass
  stories use registry icons instead of text glyphs.

## 0.5.0

Foundation for the token-driven kit ([ADR 0008](docs/decisions/0008-drop-tailwind-token-css.md),
plan: `docs/plans/v0.5.0-foundation.md`). **No existing component changes appearance**: the legacy
Tailwind components are untouched and the new stylesheet is reset-free (proven by a combined parity run).

### Added

- **`td.css`** (package export `@dazzxq/td-components/td.css`) — one canonical, self-contained stylesheet
  built from `src/styles/` (`npm run build:css`; `npm run check:css` fails when stale):
  - layer order `@layer td.tokens, td.component, td.utilities` declared once;
  - public `--td-*` tokens (type, spacing, neutrals, radius, shadow, z-index, motion, semantic colours,
    accent, controls) and the Liquid Glass token set (Regular, Clear, dim, tint, interaction, geometry);
  - opt-in dark theme via `<html data-td-theme="dark">` (never automatic; experimental values);
  - Liquid Glass recipes `.td-glass-surface` (`--strong`, `--lg`, `--clear`), `.td-glass-dim(--text)`,
    `.td-glass-tint`, with accessibility fallbacks that sites cannot defeat by overriding public tokens:
    no `backdrop-filter`, `prefers-reduced-transparency`, `<html data-td-glass="off">` (manual switch for
    Safari/iOS), `prefers-contrast: more`, `forced-colors` (system colours), `prefers-reduced-motion`;
  - `.td-sr-only`.
- **Token gate** `npm run test:tokens` — Chromium, Firefox and WebKit × CSP `style-src 'self'` and
  nonce-only (`style-src 'nonce-…'; style-src-attr 'none'`): zero violations, token resolution, subtree
  theming, every fallback on every recipe, no automatic dark flip. Uses the newest cached Firefox/WebKit
  when the pinned revision is not installed (`TD_FIREFOX_PATH` / `TD_WEBKIT_PATH` override).
- **Combined legacy parity** `npm run test:csp:combined` — the legacy CSP harness with `td.css` linked after
  the Tailwind fixture must match the same 73 baselines.
- Storybook: `td.css` loaded globally; new **Foundations/Glass** stories (Regular, Strong + Large,
  Clear over media, Clear + text) with `glass` on/off and `theme` light/dark controls.
- Docs: CSS authoring + site override guide (`docs/architecture.md`), class-map skeleton
  (`docs/migration/class-map.md`).

### Verified

- Under nonce-only CSP, CSSOM style writes **and** constructable stylesheets (`adoptedStyleSheets`) are
  applied in all three engines → legacy `adoptStyles` components also work under nonce-only CSP.

## 0.4.1

Bugfix release on the current (Tailwind) architecture. Sources: dcms2 + dwp fixes since 2026-06
(see `docs/history/2026-09-sync-dcms-dwp.md`). No API removals.

### Fixed

- **`TdToast` froze the tab on the 6th simultaneous toast.** The FIFO cap looped on
  `_activeToasts.length`, but a toast only left that list after its 180ms exit animation, so the
  `while` never terminated. Toasts now leave the list synchronously (`shift()` + removal before the
  animation).
- **`TdToast` roles** — every toast was `role="alert"` while also declaring `aria-live="polite"`.
  Now `role="status"` (polite) for success/info/warning and `role="alert"` only for errors.
- **Storybook build (and older-target consumer builds) broke** on the top-level
  `await import('./td-modal-stack.js')` in `td-toast.js`. Replaced with a static import.
- **`TdModal` closed in the same frame it opened leaked its focus trap.** The entrance rAFs and the
  50ms auto-focus timer now re-check that the modal is still open, so a modal closed immediately is
  never un-hidden, never traps Tab, and never steals focus. `TdModal.closeAll()` now also removes
  every focus-trap listener (it previously left them attached).
- **Modal scroll lock clobbered the host page.** `TdModalStackManager` wrote
  `document.body.style.overflow = 'hidden'` / `''`, erasing any overflow the page had set and
  turning `<body>` into a scroll container (breaks `position: sticky`). It now uses a shared,
  ref-counted lock on `<html>` (`src/utils/scroll-lock.js`) that restores the page's previous inline
  value exactly. Other overlays can take their own lease (`lockScroll()` → release fn).
- **`td-input-field` `setError('')` erased the helper text**, and focus/blur reset the border from
  the `error-text` *attribute*, dropping a runtime `setError()` border. Error and helper are now
  separate states: the note shows the error if any, otherwise the helper; the red border survives
  focus/blur and the counter; the inner control gets `aria-invalid="true"` while in error. A new
  `error-text` / `helper-text` attribute value replaces an earlier runtime override.
- **`td-dropdown` placement and focus.**
  - The menu no longer clamps `top` to 8px (which covered the trigger / fixed headers): it opens on
    the side with more room and caps the options list height to fit the viewport.
  - Clamped horizontally into the viewport.
  - Closes once the trigger is effectively hidden (within 8px of the viewport edge or not rendered),
    not only when fully off-screen.
  - The delayed search-box focus timer is cancelled on close / disconnect / destroy.
  - Closing while focus is inside the menu returns focus to the trigger.

### Added

- `src/utils/scroll-lock.js` — `lockScroll()` / `isScrollLocked()` (internal utility, used by the
  modal stack; will be shared with `td-lightbox`).
- Browser regression suite `src/feedback/td-regressions-v041.browser-test.js` (B1–B6).

## 0.4.0

Logic / behavioral / a11y improvements ported from the dcms-components comparison. No public
attribute/property/event renames and no rendered visual change; CSP parity gate stays at 73/73.
One **deliberate behavioral change**: `td-modal` no longer dismisses on backdrop-click (see Changed).

### Fixed

- **`td-dropdown`** — `searchable` and `allow-clear` can finally be turned **off**. Their
  internal checks (`_isSearchable()` / `_isAllowClear()`) were written `!hasAttr || hasAttr`,
  which always returned `true`, so the search box and clear option could never be disabled.
  They now default **ON** and turn off only when explicitly set to a falsy value
  (`searchable="false"` / `"0"` / `"off"`, likewise `allow-clear`); a bare/absent attribute
  stays ON. Both the **attribute** and the **JS property** disable them — `el.searchable = false`
  / `el.allowClear = false` write `="false"` (not `removeAttribute`, which the base mapping did,
  leaving the flag stuck ON), and the property getter returns a real boolean.
- **`td-modal.confirm()` promise hang** — dismissing a `confirm()` (X button or `closeAll()`)
  left its Promise **unresolved forever** (no `onClose` handler). Ported dcms's settled-flag +
  resolve-first pattern: every close path now resolves **exactly once** (confirm → `true`;
  cancel / X / `closeAll` → `false`), and a throwing user callback (`onConfirm`/`onCancel`) can
  no longer hang the Promise. `success`/`error`/`info` got the same treatment (OK → `true`,
  dismiss → `false`).

### Changed

- **`td-modal` no longer closes on backdrop-click** (the click-to-dismiss handler was removed),
  and it never closed on ESC — **deliberate**, to prevent **accidental dismissal**. A modal is
  dismissed only via the **X button**, a **footer button**, or programmatically
  (`closeById`/`closeAll`). `closable:false` now solely **hides the X** (force-action modal). The
  Tab focus-trap is unchanged.

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
- Docs: a full [component catalog](docs/components.md) with a security model / context table.

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
