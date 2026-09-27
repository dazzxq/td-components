# Changelog

All notable changes to **td-components** are documented here.

## 0.13.0

Backlog quick wins (all additive, opt-in). Plan: `docs/plans/v0.13.0-backlog.md` (Codex plan-review APPROVE, 2 rounds).

### Added

- `TdButton.run(asyncFn)`: busy (`loading`) while the action runs, cleared in `finally`; re-entrant calls share the
  in-flight promise (no double submit).
- `td-toggle` `commit(asyncFn, next?)`: optimistic persistence with a pending state (`aria-busy`,
  `.td-switch[data-pending]`, activation ignored); resolved `false` / rejection reverts and fires `commit-error`.
- `td-input-field` `autoresize` (textarea): grows with its content via CSS `field-sizing`, `rows` stays the minimum
  (`--td-field-rows`, CSSOM), capped by `--td-field-autoresize-max`, then scrolls.
- `demo.html`: a real form (validation gates `run()`, `commit()` toggle, FormData printed as text).
- GitHub CI workflow `.github/workflows/test.yml` (**not run on GitHub yet** — nothing is pushed during the overnight
  run).
- CSP states `td-toggle.pending`, `td-input-field.textarea-autoresize`; stories for the three APIs.

## 0.12.0

**New components** (token-native, Vietnamese defaults): `TdMenu`, `<td-chip-input>`, `TdFormValidation`. Plan:
`docs/plans/v0.12.0-new-components.md` (Codex plan-review APPROVE, 2 rounds; inventory + decisions D1–D25 in
`v0.12.0-new-components-inventory.md`). Built by three agents in isolated worktrees on a shared base, integrated here.

### Added

- **`TdMenu`** (`./menu`): APG menu button as a static helper (`open`, `close`, `isOpen`, `bind`, `button`) —
  strong-glass popover at `--td-z-popover`, roving focus, type-ahead, checkable items (`menuitemcheckbox` /
  `menuitemradio`), `hint` on any item, `href` whitelist https (http only on an http page; others render disabled), `iconNode` SVG only, caller items
  never mutated (`ctx.checked`), focus back to the
  trigger after a selection. Differences from dwp/135: no outside-press swallowing, no custom-node / secondary-action
  items, scrolling no longer closes the menu.
- **`<td-chip-input>`** (`./chip-input`): editable combobox (APG) collecting chips; local `options` or async
  `search(query, { signal })` (debounce, abort + stale-response guard), `show-on-focus`, `allow-create` + `create()`,
  `max-items`, roving chip keyboard, one status region, FormData value (one entry per item), error contract,
  `search-error` event, `renderOption` / `renderChip` (Node or text).
- **`TdFormValidation`** (`./form-validation`): `validate` / `apply` / `clear` / `attach`; native constraints + JS
  `rules`; server errors scoped to the root (fieldMap, name, dotted → bracket, `[data-field]` wrapper → real control);
  a throwing rule fails closed; focus the first invalid control; optional `role=alert` summary; live revalidation after the first failed submit.
- Shared: `utils/typeahead.js` (`fold`, `nextTypeaheadIndex`; td-dropdown uses it), `placeFloating` `align` option,
  `npm run check:stories` + `src/stories-dom.browser-test.js` (story XSS gate: node for string stories, real browser for
  every story; in `npm test`), `npm run test:engines` (menu Tab in Chromium, Firefox,
  WebKit; in `npm test`), index.js exports, CSP states (menu 6, chip-input 6, form-validation 2), token gate popover
  glass fallbacks.

### Changed

- Constraint messages of td-checkbox, td-toggle and td-slider are Vietnamese (were English).
- `.gitignore` ignores a `node_modules` symlink too.

## 0.11.0

**Tailwind is no longer needed.** Every component has been token-native since 0.10.0; this release removes what was
left. A site needs only `td.css` (plus a bundler for the ES modules). Plan: `docs/plans/v0.11.0-drop-tailwind.md`
(Codex plan-review APPROVE, 2 rounds). ADR 0008 is done; ADR 0002 stays superseded.

### Breaking

- The `tailwindcss` **peer dependency is removed**. Tailwind hosts keep working (td.css is layered and components own
  their font/line-height/box-sizing/borders — the `legacy+td` CSP profile checks it); non-Tailwind hosts no longer get a
  peer warning.
- `td-sample` (export `./sample`) renders `.td-sample` BEM markup with a `.td-btn` button instead of Tailwind classes
  (same attributes and `count-change` event).

### Changed

- Storybook and `demo.html` run on `td.css` only (Tailwind CDN, `src/styles/tailwind.css`, `postcss.config.js` and the
  `@tailwindcss/postcss` devDependency removed; `@tailwindcss/cli` stays for the CSP host-interference fixture).
- Docs: README setup is `td.css` only; components/architecture/conventions/vision/CLAUDE.md updated.

### Added

- Guard test `src/styles/no-tailwind.test.js`: fails when a non-`td-*` class token appears in component markup or a
  module imports Tailwind. `td-sample` browser suite (td.css only).

## 0.10.0

Migration **batch 4 — the last legacy components**: `td-datetime-picker` and `td-table` are now **token-native**
(td.css only). Every component is now token-native; the Tailwind peer dependency is dropped in 1.0.0. Plan:
`docs/plans/v0.10.0-batch4.md` (Codex plan-review APPROVE, 3 rounds; inventory + decisions D1–D25 in
`v0.10.0-batch4-inventory.md`). Built by two agents in isolated worktrees on a shared base, integrated here.

### Breaking (internal DOM / classes)

- Internal classes renamed to BEM — `docs/migration/class-map.md` (`.td-dtp-wheel-*` → `.td-dtp-wheel__*`, the modal
  body → `.td-dtp-panel__*`; `.td-table-*` → `.td-table__*`). Both components require `td.css`.
- `src/utils/adopt-styles.js` removed (no component uses CSS-in-JS any more; it was never a package export).

### Behaviour changes

- **Datetime-picker:** the trigger is a `button[role=combobox][aria-haspopup=dialog]` (was a readonly input) and is
  updated in place (focus kept); keyboard-operable end to end; Escape closes the dialog (TdModal `escapeCloses`, ADR
  0006 addendum) and discards the edit, as do X and "Đóng"; hour/minute are validated (no more 25:99);
  `getValue()`/`getDBValue()` return `''` when empty, invalid or outside `min`/`max` (was "now"); minutes snap down to `minute-step` when the
  dialog opens; `setDBValue()` ignores garbage and accepts ISO-local; an invalid value submits its raw text.
- **Table:** sorting/paging/data/loading update the table in place (focus stays on the sort button or page control;
  one announcement per page change — the top pagination is `quiet`); `zebra="false"` works (was always on); server mode
  keeps the page when `data` changes (was reset to 1) and requires `total-items` (paginations hidden + warning
  otherwise); the page is clamped; `render` is resolved by column index and gets `(row, rowIdxInPage)`, a Node is
  accepted; `update()` ignores non-array `data`/`columns`; default `empty-text` is "Chưa có dữ liệu để hiển thị.";
  deterministic skeleton, title visible while loading; `th[scope=col]`.

### Added

- Picker: `min` / `max` (date-only bounds expand to 00:00 / 23:59), `error-text` + `setError()`/`clearError()`,
  `aria-label` forwarding, site-overridable `labels` / `messages`; pure parse/format helpers in `utils/datetime.js`
  (`parseDisplay`, `parseDb`, `parseIsoLocal`, `format*`, `isValidParts`, `parseBound`) with node tests.
- Table: `max-height` (sticky header), `cellPaddingClass` (`px-0`…`px-6` → `td-table__cell--px-N`), column `ellipsis`
  (+ auto fixed layout), `empty-title`, `heading-level`, `aria-label` / "Bảng dữ liệu" naming, `sort-change` event,
  `data-col` / `data-col-key` hooks, focusable named scroll region while overflowing.
- TdModal `escapeCloses` option; td-pagination `quiet`; icon `sort`; token `--td-color-sheen`.
- Tests: batch-4 suites (picker 44, table 41, shared), contract fixtures, CSP states (picker 7, table 9 — `_meta.mixed`
  is now empty), token gate sticky-header opacity (light + dark) in 3 engines.

### Fixed

- Idle spinners inside buttons were visible (`.td-spinner { display }` defeated `[hidden]`) — every TdModal action
  button showed a ring.
- `.td-field-error` inherited the host font (serif on unstyled pages).
- Table border colour no longer depends on the host reset (UA `table { border-color: gray }` vs Tailwind preflight).

### Security

- Storybook stories escape every control value (all stories, see 0.9.0 security review); the table stories build row
  content as Nodes. `render` string output stays a documented trusted-HTML hatch.

## 0.9.0

Migration **batch 3 — the floating layer**: `TdModal` / `TdModalStackManager`, `TdToast`, `TdTooltip`, `td-dropdown`
are now **token-native** (td.css only) and Liquid Glass. Plan: `docs/plans/v0.9.0-batch3.md` (Codex plan-review
APPROVE, 4 rounds; inventory + decisions D1–D24 in `v0.9.0-batch3-inventory.md`). Built by four agents in isolated
worktrees on a shared base (`utils/layers.js`, `utils/floating.js`), integrated here.

### Breaking (internal DOM / classes / stacking)

- Internal classes renamed to BEM — `docs/migration/class-map.md` (`.td-modal-*` → `.td-modal__*`, `.toast-item` →
  `.td-toast`, `.td-tooltip-content` → `.td-tooltip__content` (arrow removed), `.td-dropdown-*` → `.td-dropdown__*`).
  These components require `td.css`.
- **z-index from tokens:** modal `--td-z-modal` 400, dropdown menu `--td-z-popover` 450 (was 10010), toast
  `--td-z-toast` 500 (was 99999), tooltip `--td-z-tooltip` 510 (new token). Sites with fixed chrome above these
  override the whole `--td-z-*` set. `TdModalStackManager.BASE_Z_INDEX` (`@dazzxq/td-components/modal-stack`) is now an opt-in override (default `null`, warns);
  `TOAST_Z_INDEX_BASE` is 500 and `getToastZIndex()` returns the token value (both deprecated).
- `TdToast.getTheme(type)` returns `{ type, icon }` (was Tailwind classes + SVG markup).

### Behaviour changes

- **One keyboard owner for overlays** (`utils/layers.js`): Escape goes only to the top layer (a menu or tooltip closes
  itself; a modal swallows it, so it never reaches a lightbox below); Tab is trapped by the top blocking layer.
  Lightbox and loading moved onto it; the loading overlay now holds Tab focus.
- **Modal:** `role=dialog` + `aria-modal` + `aria-labelledby` (promise dialogs `alertdialog`), X named "Đóng"; focus
  always moves into the dialog on open (`autoFocus:false` now focuses the dialog itself instead of nothing;
  `focusTarget` only if inside it) and is restored to the opener **before** `onClose`; the page behind is `inert`;
  only the body scrolls (old 60/70 vh cap removed); covered stacked dialogs go solid; a promise-returning `onConfirm`
  keeps the dialog open until it settles; a sync `onConfirm` runs before the promise resolves; `onClose(value)` gets the
  footer action's value. Still never closes on ESC/backdrop (ADR 0006); bottom sheet below 640 px kept.
- **Toast:** strong glass + status icon (no coloured fills); every toast has a close button (sticky too); timers
  pause on hover/focus and while the page is hidden; the message text appears one frame after insertion (announced);
  reachable by keyboard while a modal is open.
- **Tooltip:** `role=tooltip` + `aria-describedby` while shown; opens on keyboard focus; never on touch; no 30 s
  auto-hide; hoverable (100 ms grace); Escape dismisses; scroll repositions instead of hiding; long text wraps;
  `title` handling per D15 (see components.md); `data-tooltip-text-color` requires `data-tooltip-color`;
  `disconnect()` fully tears down.
- **Dropdown:** APG select-only combobox — trigger `role=combobox`, options are no longer Tab stops
  (`aria-activedescendant`), clear option in the arrow order, type-ahead; Tab closes the menu; outside click closes on
  `pointerdown`; exactly one `change` per selection; `open()` does nothing while disabled.

### Added

- `utils/layers.js` (`LAYERS`, `register`, `hasActiveAbove`, `trapContainers`, `focusablesIn`, `trapTab`),
  `utils/floating.js` (`placeFloating`, `isReferenceHidden`), `inert-lock` `registerFloating` / `hasFloatingAbove`.
- Modal `actions` (async footer buttons), `onShow(root, payload)` + `onShowPayload`, `messageHtml`, `TdModal.labels`.
- Dropdown `label` attribute and error contract (`error-text`, `setError`, `clearError`), `aria-required`.
- Toast placement tokens `--td-toast-top/-bottom/-inline-start/-inline-end/-align`.
- Tests: layer + integration suites (loading over modal, menu in stacked modals, Escape routing, toast reachable over a
  modal, tooltip over toast), per-component batch-3 suites, contract fixtures for all four, CSP matrix +20 states
  (td-datetime-picker moved to `_meta.mixed`), token gate floating-glass fallbacks (glass off / forced colours / solid
  over a modal) in 3 engines.

### Fixed

- CSP smoke tests for td-tooltip and td-modal-stack exercised nothing (dead event / instance methods on a static
  class); the tooltip is now in the matrix and the stack smoke drives its static API.
- Dropdown menu and tooltip usable inside a modal (floating registrations are exempt from the modal's inert lease).

### Security

- Trusted-HTML hatches documented: modal `body` (string form) and `messageHtml`; `message` and toast text are text only.
- Modal `width`/`height`/`bodyPadding` validated with `CSS.supports` (no `url()`/`var()`) before use.

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
- `renderIconDefinition()` validates its input (it is exported); SVG strings are bounded (32 KB, no DTD, ≤ 64 shapes,
  attribute values ≤ 8 000 chars); td-pagination `max-pages` clamped to 25 (bounded DOM for API/CMS-bound values).

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
