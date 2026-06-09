# td-components v0.3.0 — CSP-strict hardening plan

> **Goal:** make every component render with ZERO CSP-blocking style constructs, so the library
> works under a strict `Content-Security-Policy: default-src 'self'` (NO `style-src 'unsafe-inline'`).
> Driver: the s3 dashboard (`dash.duyet.vn`, internet-exposed, credential-holding) ships
> `default-src 'self'` and renders these components — under that CSP they currently break.
> Outcome: release **v0.3.0** "CSP-strict compatible", then re-vendor into the dashboard (separate,
> in the s3 repo) and resume 04-05 Task 3 with the strict CSP intact.

---

## Locked context — PROVEN facts (empirical, Playwright + enforced CSP header, 2026-06-10)

Two spikes ran against a real enforced header `default-src 'self'; style-src 'self'` (no unsafe-inline):

| Style construct | Result under strict CSP | Verdict |
|---|---|---|
| Declarative `style="…"` (incl. via `innerHTML`) | **BLOCKED** (computed style not applied; CSP violation) | must remove |
| JS-injected `<style>` element (`createElement('style')` + text) | **BLOCKED** (`.sheet` is `null`; CSP violation) | must remove |
| `el.style.prop = …` / `el.style.setProperty(...)` / `el.style.cssText = …` (CSSOM) | **ALLOWED** (applied, no violation) | ✅ use this |
| `new CSSStyleSheet().replaceSync(css)` + `document.adoptedStyleSheets` (incl. `@keyframes`) | **ALLOWED** (applied, no violation) | ✅ use this |

### The refactor toolkit (all CSP-safe, zero `unsafe-inline`) — pick the RIGHT tool per construct

1. **Per-element scalar/box styles** that were a declarative `style="X:Y"` → apply via **CSSOM after render**: static → `el.style.cssText = '…'` (or set individual props); dynamic (`${color}`, `${pct}%`, `${size}px`) → `el.style.setProperty('width', pct + '%')`. Keep all EXISTING Tailwind `class="…"` usage untouched (classes are CSP-fine) — only the inline `style=` leftovers move.

2. **Anything that needs a SELECTOR — pseudo-classes (`:hover`/`:focus`/`:active`/`:disabled`), state combinators (`:checked + x`, sibling `~`), `::before`/`::after`, `@keyframes`, `@media`, or a rule shared across many nodes → a CONSTRUCTABLE STYLESHEET** (NOT per-element CSSOM — CSSOM cannot express selectors/pseudos/keyframes). Use STABLE class/data-attribute selectors (e.g. `.td-checkbox[data-checked] .box`), NOT a unique-per-instance class. Build the sheet's text ONCE per component module and adopt it via the shared helper below. Per-instance *scalar* overrides still go on the element via CSSOM (tool 1).

3. **SVG `style="…"` → SVG presentation attributes** (`opacity`, `width`, `height`, `fill`, `stroke`, `stroke-dasharray`…) which are NOT a CSS context (not gated by CSP); SVG animation (`stroke-dasharray`/`animation`) → the shared adopted sheet (tool 2).

4. **Shared adoption helper (NEW, `src/utils/adopt-styles.js`) — single owner, feature-detected, lazy, idempotent (fixes the unsafe-adoption issue):**
   ```js
   // Adopt a component's static stylesheet ONCE, browser-only, never throwing in node/SSR or
   // unsupported browsers. Returns true if adopted, false if unsupported (caller may then fall back).
   const _adopted = new WeakSet();      // per-document idempotency
   export function adoptStyles(css, key) {
     if (typeof document === 'undefined') return false;                 // node/SSR: no-op
     if (typeof CSSStyleSheet === 'undefined' || !('adoptedStyleSheets' in Document.prototype)) return false; // old browser
     const root = document;
     root.__tdAdopted ??= new Map();
     if (root.__tdAdopted.has(key)) return true;                        // duplicate guard (one sheet per key per doc)
     const sheet = new CSSStyleSheet();
     sheet.replaceSync(css);
     root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];     // never reassign-clobber
     root.__tdAdopted.set(key, sheet);
     return true;
   }
   ```
   - Called LAZILY from a component's first `connectedCallback`/render — NEVER at module top-level (so importing the package in node/SSR or an old browser cannot throw).
   - **Unsupported-browser semantics (must be explicit):** `adoptStyles` returns `false`; the component still renders structurally (Tailwind classes + CSSOM scalars apply); only the selector/keyframe-driven embellishments are absent. This is the documented graceful degradation. (No `<link>`/CSS-file fallback — the lib ships no CSS by design.)

**Why CSSOM is also SAFER (not just CSP-compat):** `el.style.setProperty(prop, value)` parses `value` as a single CSS value — a `;`/`}` can't inject a new declaration or break out (unlike string-built `style="…"`). Still, keep `utils/css-safe.js` (`safeColor`/`safeHexColor`/`safeCssDimension`/`clampNumber`) for any value derived from a public attribute (reject `url(javascript:…)`/`expression(…)`; normalize hex for the slider's `${color}f2` alpha-append).

**State changes must re-apply (fixes the one-time-CSSOM trap):** any component whose appearance depends on state/attributes (checked, disabled, value, open, color, size) MUST funnel scalar styling through a single `_applyStyles()` method called after render AND from the relevant `attributeChangedCallback` branches AND on internal state changes (e.g. check/uncheck). Selector/pseudo/state rules live in the adopted sheet keyed off a stable class/`data-*` the component toggles — so the browser updates them automatically.

**Non-goals / invariants:** no public API/attribute/property/event renamed; **visual output pixel-identical** (parity gate, Task 1); existing `test:node` + `test:browser` stay green; library still ships no CSS file; form-associated (v0.2.0) + XSS-escaping behavior intact.

### Raw-HTML extension points — OUT OF SCOPE for the lib's CSP guarantee (documented; consumer-audited)
Several components accept TRUSTED raw HTML from the consumer and inject it verbatim: `td-empty-state` raw `<svg>` icon, `td-table` column `render(row)` strings, `TdModal.show({ body })`. The lib CANNOT guarantee these are CSP-clean — if the consumer passes `style="…"`/`<style>` through them, CSP will block it. **This plan hardens only LIBRARY-AUTHORED render output.** Requirements: (a) document each raw-HTML hatch in `README`/`CHANGELOG` as "pass CSP-clean content (no inline `style=`/`<style>`) under a strict CSP"; (b) the s3 dashboard re-vendor/Task-3 audit MUST verify it never passes `style=`/`<style>` through these hatches (it already escapes values via `htmlspecialchars`; add a check that no `style=` is hand-written into `col.render`/modal bodies/empty-state icons).

---

## Per-component inventory (source `src/`, v0.2.0 @ d6ba04e) — Task 0 re-confirms exactly

| Component | declarative `style=` | injected `<style>` | keyframes | SVG `style=` | needs adopt-sheet? | dashboard uses? |
|---|---|---|---|---|---|---|
| display/td-table | 17 | – | – | – | maybe (row `:hover`) | ✅ |
| form/td-slider | 10 | – | – | – | maybe (thumb `:active`) | – |
| form/td-toggle | 5 | ✅ | – | ✅ | **✅** (checked/transition) | – |
| form/td-input-field | 5 | – | – | – | maybe (`:focus`) | ✅ |
| display/td-empty-state | 5 | – | – | ✅ | – | ✅ |
| form/td-dropdown | 4 | – | – | ✅ | maybe (open/hover) | – |
| display/td-tabs | 4 | – | – | – | maybe (indicator transition) | ✅ |
| feedback/td-modal | 1 | – | – | – | maybe (backdrop transition) | ✅ |
| feedback/td-toast | 1 | – | – | – | maybe (enter/leave) | ✅ |
| form/td-button | 1 | – | – | – | maybe (`:hover`/`:active`) | ✅ |
| display/td-pagination | 1 | – | – | – | – | ✅ |
| base/td-base-element | 1 | – | – | – | – | ✅ (base) |
| form/td-checkbox | 0 | **✅** | – | – | **✅** (checked/sibling) | ✅ **(affected via `<style>`)** |
| feedback/td-loading | 2 | ✅ (×2) | **✅** | ✅ | **✅** (keyframes) | – |
| form/td-datetime-picker | ✅ | ✅ | – | ? | **✅** | – |
| feedback/td-tooltip | 0 | ? | – | ? | ? | – |
| feedback/td-modal-stack | 0 | – | – | – | – | ✅ (modal dep) |

---

## Tasks

### Task 0A — Deterministic Tailwind fixture + sentinels + explicit Playwright dep (single agent; FIRST — fixes ISSUE-9/10)
- **Deterministic Tailwind fixture (fixes vacuous parity):** build ONE Tailwind v4 CSS using the SAME `@source` model consumers use (`@source` globbing `src/**/*.js` so all utility + arbitrary classes the components emit are compiled). Commit the build input + a pinned `@tailwindcss/cli` version. This fixture is consumed by BOTH the Task-0B baseline capture AND the Task-1 CSP harness — it MUST exist before either.
- **Sentinel validation (runs before any baseline/parity uses the fixture):** assert a known plain utility (e.g. `rounded-xl` → `border-radius: 12px`) AND a known arbitrary utility actually COMPUTE to their expected values when the fixture CSS is applied — if a sentinel is unstyled, the fixture didn't compile and the whole CSP suite FAILS (so "parity match" can never mean "both unstyled").
- **Explicit test dependency (fixes ISSUE-10):** add an EXPLICIT pinned devDependency for the package the CSP harness imports — `playwright-core` (the version the spikes used, 1.60.x) — to `package.json` (do NOT rely on it transitively via `@web/test-runner-playwright`); ensure Chromium is available (the existing `@web/test-runner-playwright` installs it, or `npx playwright install chromium`); regenerate `package-lock.json`.
- **Acceptance:** the fixture builds deterministically from a pinned CLI; both sentinels compute correctly; `playwright-core` is an explicit pinned devDependency and the lockfile is updated.

### Task 0B — Inventory lock + STATE-MATRIX baseline capture (single agent; AFTER 0A)
- Re-grep every `src/**/*.js` (excl. tests/stories) for the four blocking constructs (`style="`/`style='`; `createElement('style')`/`<style`; `@keyframes`/`animation:` in injected CSS; `style=` on SVG nodes). Lock the table above.
- **Per-component STATE MATRIX (fixes narrow-baseline):** for each component, enumerate the states/attributes/interactions whose styling differs — e.g. checkbox/toggle {unchecked, checked, disabled, indeterminate, custom color, sizes}; dropdown {closed, open, selected}; table {loading, data, zebra-on/off, sortable header, hover row}; modal {default, sizes, fullscreen, open/closed, backdrop}; toast {each type, enter/leave}; slider {min/mid/max, disabled, custom color, step marks}; input-field {text/textarea/number, focus, error/note/counter}; loading {spinner sizes, reduced-motion}. Include elements PORTALED to `document.body` (modal, toast, tooltip).
- **Baseline capture:** render each component in EVERY matrix cell under a permissive page (no CSP) WITH the Task-0A Tailwind fixture, and snapshot `getComputedStyle` of the styled elements → `test/csp/baseline/<component>.<state>.json`. This is the parity oracle.
- **Acceptance:** the four-construct checklist matches every grep hit; a baseline JSON exists for every matrix cell of every affected component; the matrix is committed as `test/csp/MATRIX.md`.

### Task 1 — CSP test harness + NON-VACUOUS parity gate (single agent; AFTER 0A+0B; blocks all hardening)
- `test/csp/csp.spec.mjs` (standalone Playwright importing the explicit `playwright-core` dep from Task 0A; like the proven spikes): for EACH component × EACH matrix state, serve a mount page via `page.route().fulfill()` with `content-security-policy: default-src 'self'; style-src 'self'; script-src 'self'` + the component module + the Task-0A compiled Tailwind CSS (all 'self'). Re-run the Task-0A sentinel assertions inside the harness BEFORE parity. Assert:
  1. **ZERO** CSP violations on the console.
  2. **Computed-style parity** vs `baseline/<component>.<state>.json` (sub-pixel tolerance).
  3. Component renders/behaves (root present; no thrown errors; portal elements found on `document.body`).
- **Animation liveness (fixes spinner-can-be-frozen):** for `td-loading`, additionally sample the spinner's `transform`/`stroke-dashoffset` at t0 and t+250ms and assert it CHANGED (animation actually running), plus a `prefers-reduced-motion` case asserting it does NOT animate.
- Add `npm run test:csp`; wire into `npm test` (`test:node && test:browser && test:csp`). It imports the explicit `playwright-core` devDependency declared in Task 0A (not a transitive one).
- **Acceptance:** `npm run test:csp` runs; the sentinel assertions pass (Tailwind real); BEFORE refactor the gate FAILS for every affected component (proves it detects violations — non-vacuous) and PASSES for clean ones.

### Hardening WAVES — dependency-ordered ownership (fixes unsafe parallelization)
Intra-lib deps: `td-table` → imports `td-pagination` + `td-empty-state`; `td-modal` → `td-modal-stack`; all → `td-base-element` + `css-safe`; `td-toggle/td-checkbox/td-loading/td-datetime-picker` → the new `adopt-styles` helper.

- **Wave A — shared infrastructure (ONE owner, no parallelism):** create `src/utils/adopt-styles.js` (the feature-detected helper above) + any `css-safe.js` additions; harden `base/td-base-element.js` (its 1 declarative style). These shared files are touched by exactly this task. Gate: `test:node` + `test:csp` for base green.
- **Wave B — LEAF components (parallel, one agent each; depend only on Wave A):** `td-pagination`, `td-empty-state`, `td-modal-stack`, `td-toast`, `td-button`, `td-tabs`, `td-input-field`, `td-slider`, `td-toggle`, `td-checkbox`, `td-dropdown`, `td-datetime-picker`, `td-tooltip`, `td-loading`. Each: remove all four blocking constructs from THAT file only; use the toolkit; funnel state-dependent scalars through `_applyStyles()` re-invoked on attr/state change; selector/pseudo/keyframe rules → adopted sheet via `adoptStyles`; keep its `*.test.js`/`*.browser-test.js` green; pass `test:csp` for all its matrix states. No agent edits a file it doesn't own (esp. base/css-safe/adopt-styles).
- **Wave C — PARENT components (after their leaves; parallel with each other):** `td-table` (after pagination + empty-state), `td-modal` (after modal-stack). Same per-component acceptance.

Per-component acceptance (every wave): zero of the four blocking constructs remain in that file (grep); `test:csp` PASS for ALL its matrix states (zero violations + parity); `test:node` + `test:browser` for it green; no public attribute/property/event renamed; state changes re-apply styling correctly (checked/disabled/value/open/color/size transitions visually correct).

### Final task — Full suite + release (single agent; AFTER all waves)
- `npm run test:node && npm run test:browser && npm run test:csp` — ALL green. Global negative grep proves NO `style="`/`style='`, NO `createElement('style')`/`<style`, NO injected `@keyframes` remain in `src/**` (excl. tests/stories and `css-safe.js`'s doc comment).
- **Release (fixes lockfile + overstated-compat):** bump `package.json` AND regenerate/commit `package-lock.json` → **0.3.0**. `CHANGELOG.md` headline: "**CSP-strict compatible** — no declarative inline styles, no injected `<style>`; styling via CSSOM + constructable stylesheets." Characterize HONESTLY as a **compatibility-impacting minor**: (a) requires `adoptedStyleSheets` (Chromium 73+, Safari 16.4+, Firefox 101+) — older browsers lose only selector/keyframe embellishments, structure intact; (b) the DOM no longer carries the old inline `style` attributes — any consumer/integration that inspected those will observe the change; (c) raw-HTML hatches remain the consumer's CSP responsibility (documented). Commit on `feat/csp-hardening`; **codex-impl-review BEFORE the merge commit**; merge to main; tag `v0.3.0`.

### Handoff (NOT this repo — s3 dashboard, separate session)
Re-vendor hardened components into `dashboard/public/assets/td/`: re-copy used modules + `adopt-styles.js`, update `PROVENANCE.md` (new pinned commit + SHA256SUMS + CSP-hardening note), regen `dashboard/public/assets/td.css`, AUDIT that the dashboard never passes `style=`/`<style>` through the raw-HTML hatches (`col.render`, modal bodies, empty-state icons), confirm CSP stays `default-src 'self'` with NO `unsafe-inline`, then resume 04-05 Task 3.

---

## Risks
- **Visual regression (#1)** — mitigated by the Task-1 non-vacuous parity gate across the full state matrix (baseline before, asserted after) + Storybook for manual eyeballing.
- **Vacuous parity** — mitigated by the Tailwind sentinel assertions (Task 1) that fail if the fixture didn't actually compile the classes.
- **State/selector rules lost to one-time CSSOM** — mitigated by routing selector/pseudo/state/keyframe rules to the adopted stylesheet (tool 2) and re-applying scalars via `_applyStyles()` on every state change (toolkit).
- **`adoptedStyleSheets` support / SSR import** — mitigated by the feature-detected, lazy, never-throwing `adoptStyles` helper + documented graceful degradation + browser floor in the changelog.
- **Raw-HTML hatches** — explicitly out of scope for the lib; pushed to documentation + the dashboard audit.
- **Parallel collisions on shared files** — mitigated by Wave A owning base/css-safe/adopt-styles, and no agent editing a non-owned file.
