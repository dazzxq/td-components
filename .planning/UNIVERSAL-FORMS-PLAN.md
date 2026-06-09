# td-components — Universal upgrade: form-association (ElementInternals) + style unification

**Created:** 2026-06-09
**Repo:** /Users/theduyet/Documents/Code/components (github:dazzxq/td-components, MIT, v0.1.0)
**Why:** Make this shared library truly "drop into ANY site and it just works" — the two gaps blocking that today are (1) form controls don't reliably participate in native `<form>` submission/validation, and (2) styling is inconsistently coupled to the host's Tailwind. This also unblocks consuming td-components in the s3 dashboard.

<goal>
1. **Form-association (standards-based):** every form control (`td-input-field`, `td-checkbox`, `td-toggle`, `td-slider`, `td-dropdown`, `td-datetime-picker`) becomes a real form-associated custom element via **ElementInternals** — it submits its value in any host `<form>` (FormData/POST), supports `name`/`value`/`checked`/`disabled`/`required`, participates in constraint validation, form reset, and disabled propagation, with proper `<label>` association.
2. **Style unification + Tailwind decoupling:** ONE consistent styling strategy so a component dropped into a plain HTML page (NO Tailwind on the host) still renders correctly. Tailwind becomes OPTIONAL host-overridable polish, not a hard requirement for baseline correctness.
3. **No regressions:** keep the no-Shadow-DOM design, the existing public attributes/events, XSS-safety, and the lifecycle/cleanup model. Bump to 0.2.0.
</goal>

<locked_decisions>
- **D-1 — ElementInternals is the form mechanism** (operator's choice). `static formAssociated = true` + `this.attachInternals()` + `internals.setFormValue()` + `internals.setValidity()` + the form lifecycle callbacks. NOT the "forward name to an inner input" shortcut (that double-submits once internals is added, and breaks if Shadow DOM is ever introduced).
- **D-2 — Self-contained baseline styling** is the universality target: each component injects its OWN scoped CSS (the per-instance-class pattern `td-checkbox` already uses) so it looks correct WITHOUT the host's Tailwind. Tailwind utility classes may remain ONLY as optional, host-overridable layout sugar — never required for the component to be usable/legible. The hard `tailwindcss` peerDependency is downgraded to optional + documented.
- **D-3 — No Shadow DOM** (unchanged house decision) — so labels, host CSS, and form participation keep working; ElementInternals gives form participation without Shadow DOM.
- **D-4 — Backward compatible EXCEPT the documented 0.2.0 breaking changes (ISSUE-11):** existing attribute names, properties, and emitted events (`change`, `input`, etc.) are preserved and new behavior is additive — WITH three explicitly-documented breaking exceptions in the 0.2.0 changelog: (1) td-toggle default becomes uncontrolled (opt-in `controlled` restores old behavior); (2) td-input-field inner native control(s) no longer carry `name` (host submits); (3) `tailwindcss` becomes an optional peer dependency.
- **D-5 — Browser support:** ElementInternals/form-associated CE is supported in all current evergreen browsers; document a graceful note (and an optional polyfill pointer) for legacy.
</locked_decisions>

<tasks>

<task type="auto">
  <name>Task 0: Reconcile the dirty working tree (do NOT clobber WIP)</name>
  <action>
    **ISSUE-10 — careful, operator-approved WIP handling (do not contaminate, do not lose).** Steps:
      1. Produce a DIFF INVENTORY BY FILE: `git status` + a per-file `git diff` summary of every modified/untracked path (`src/form/td-input-field.js`, `src/form/td-dropdown.js`, `src/styles/tailwind.css`, the `*.stories.js`, untracked `postcss.config.js`) — classify each as (a) coherent feature WIP, (b) incidental/story text, or (c) config. Present this inventory to the OPERATOR and get approval BEFORE committing their work.
      2. **EXCLUDE this plan file** `.planning/UNIVERSAL-FORMS-PLAN.md` from any stash/commit of WIP (it is planning, not their code).
      3. Commit/stash the WIP in **separate units by concern** (don't bundle unrelated story edits with source WIP), each with a descriptive message, on a `feat/universal-forms` branch created for this upgrade. Where the WIP touches input-field/dropdown (which this plan rewrites), fold it in deliberately during Task 2 (note the overlap), not by discarding it.
      4. Result: a clean, known baseline on the branch, the plan file still present, and the operator has approved how their WIP was handled.
  </action>
  <acceptance_criteria>
    - A per-file diff inventory (classified) was produced and operator-approved before any WIP commit.
    - WIP is committed/stashed in separate by-concern units on `feat/universal-forms`; the plan file is NOT included in those; `git status` is otherwise clean.
    - Overlap of WIP with input-field/dropdown is recorded for deliberate folding in Task 2.
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 1: TdFormElement — a form-associated base built on TdBaseElement</name>
  <files>src/base/td-form-element.js, src/base/td-form-element.test.js</files>
  <action>
    Create `TdFormElement extends TdBaseElement` providing the standard form-control contract once, so each control just sets its value:
      - `static formAssociated = true`; `this._internals = this.attachInternals()` in the constructor.
      - Standard reflected props: `name`, `disabled`, `required` (observed attrs); read-only `form`/`validity`/`validationMessage`/`willValidate`; `labels`.
      - `checkValidity()` / `reportValidity()` delegating to internals.
      - A protected `_setFormValue(value, state?)` wrapper around `internals.setFormValue` and `_setValidity({...}, message, anchorEl)` around `internals.setValidity`.
      - **Label association (ISSUE-2):** external `<label for="<host-id>">` targets the CUSTOM ELEMENT (form-associated CEs are labelable; `el.labels` works); the host gets an `id` if missing; the inner native control gets NO colliding `id`; a host-label click focuses the inner control. Tests assert `el.labels` includes the external label, label-click focuses the control, and NO duplicate ids.
      - **Default-state + reset (ISSUE-4):** at `connectedCallback`, capture `_defaultValue`/`_defaultChecked` from the initial attributes ONCE, kept SEPARATE from the live value/checked that mutate during use. `formResetCallback()` restores live state to those defaults (re-render + `_setFormValue`). Define the `state` arg of `setFormValue(value, state)` for cases where display state ≠ submitted value (e.g. dropdown selected-id vs label); implement `formStateRestoreCallback(state, mode)` for autofill/bfcache. Test reset AFTER user interaction, and after late option loading.
      - **Effective-disabled (ISSUE-5):** keep an internal `_effectiveDisabled = (has \`disabled\` attr) OR (last \`formDisabledCallback(true)\` from an ancestor \`<fieldset disabled>\`)`. Rendering + ALL event guards use `_effectiveDisabled`, and fieldset-disabled must NOT reflect onto the `disabled` attribute. Test `<fieldset disabled>` propagation for every control.
      - Keep no Shadow DOM; keep the TdBaseElement render/cleanup model.
    Add a BROWSER-run `td-form-element.test.js` (Task 5 runner): a fixture element in a real `<form>` — assert FormData carries its value, `required`+empty fails `checkValidity()` + blocks submit, reset restores default after interaction, `<fieldset disabled>` removes it, and `el.labels`/label-focus work.
  </action>
  <acceptance_criteria>
    - `td-form-element.js` sets `formAssociated=true`, calls `attachInternals()`, exposes setFormValue/setValidity wrappers + all four form lifecycle callbacks, an `_effectiveDisabled` flag, and captured `_default*` state.
    - REAL-BROWSER tests (Task 5 runner) prove: value submits via FormData; `required`+empty fails validity + blocks submit; reset restores default AFTER user interaction; `<fieldset disabled>` removes it from submission; external `<label for>` is in `el.labels` and focuses the control; no duplicate ids.
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 2: Migrate the six form controls onto TdFormElement</name>
  <files>src/form/td-input-field.js, src/form/td-checkbox.js, src/form/td-toggle.js, src/form/td-slider.js, src/form/td-dropdown.js, src/form/td-datetime-picker.js</files>
  <action>
    Re-base each onto `TdFormElement` and emit the correct submitted value via `_setFormValue`, matching native semantics:
      - **td-input-field**: submit the text value. **ISSUE-7:** REMOVE `name` from EVERY inner native control it can render (`<input>`, `<textarea>`, the contenteditable host) so nothing double-submits; the custom element owns submission via internals. Decide + document inner native validation: NEUTRALIZE the inner control's native constraints (so the browser doesn't show a second validation bubble) and let the HOST own validity via `_setValidity`. Test every mode: text, textarea, number, email, url, contenteditable.
      - **td-checkbox**: native checkbox semantics — `_setFormValue(this.checked ? (this.value ?? 'on') : null)`; submit ONLY when checked; `value` attr default "on".
      - **td-toggle (ISSUE-6 — resolve controlled-vs-uncontrolled):** today td-toggle is CONTROLLED (click emits `change` but does NOT self-toggle). As a form control it must hold its own state. Decision: make it **UNCONTROLLED by default (self-toggles like a native checkbox)** with an **opt-in `controlled` attribute** to preserve the old behavior. This is a BEHAVIOR CHANGE → mark BREAKING in the 0.2.0 changelog (Task 6). Form value = checkbox semantics (value when checked, null otherwise). Tests assert click toggles+submits when uncontrolled, and emits-only (no self-toggle) when `controlled`.
      - **td-slider**: `_setFormValue(String(this.value))`; reflect `min`/`max`/`step`.
      - **td-dropdown**: `_setFormValue(selectedValue)`; keyboard + selection preserved; use the `state` arg for selected-id vs label.
      - **td-datetime-picker (ISSUE-12 — pin the submitted value):** submit a MACHINE value = **ISO 8601** by default (e.g. `2026-06-09` / `2026-06-09T13:45`), independent of the human display format; expose an optional `form-value-format` attribute (`iso` default | `display` | a documented token pattern) to override. The `state` arg may hold the display string. Task 5 asserts the EXACT submitted string for the default (ISO) and for one overridden format.
    **Per-control VALIDITY MATRIX (ISSUE-3)** — wire `internals.setValidity` for each (with a message + anchor element):
      | Control | required → `valueMissing` | other validity |
      |---|---|---|
      | input-field | empty when required | `tooLong` (maxlength), `typeMismatch` (email/url), `rangeUnderflow/Overflow`+`stepMismatch` (number), `patternMismatch` if `pattern` |
      | checkbox / toggle | not checked when required | — |
      | slider | — (always has a value) | `rangeUnderflow/Overflow`, `stepMismatch` |
      | dropdown | no selection when required | — |
      | datetime-picker | empty when required | `rangeUnderflow/Overflow` (min/max), `badInput` for unparseable |
    Custom validation messages are settable via a `setCustomValidity()`-style hook. Preserve every existing public attribute + emitted event; each control implements `formDisabledCallback`/`formResetCallback`.
  </action>
  <acceptance_criteria>
    - Each of the six extends `TdFormElement`; grep shows `_setFormValue` + `setValidity` usage in each.
    - `td-input-field` puts `name` on NO inner native control (input/textarea/contenteditable) — no double submit; the host submits via internals; all six type modes tested.
    - td-toggle's controlled-vs-uncontrolled decision is implemented + the `controlled` opt-in works + flagged BREAKING in the changelog; checkbox/toggle submit `value` only when checked; the others submit their current value — proven by Task 5 real-browser form tests.
    - The validity matrix is implemented: each control's `required` (and range/step/type where applicable) produces the right `validity.*` flag + blocks form submit — proven by tests.
    - No existing observed attribute or emitted event was removed (diff review).
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 3: Style unification — self-contained baseline, Tailwind optional</name>
  <status>DESCOPED 2026-06-09 (operator override) — Tailwind v4 stays a REQUIRED peer dependency; the body below is NOT implemented.</status>
  <!-- DECISION (operator override): every consumer of this lib (incl. the s3 dashboard)
       already loads Tailwind, so reimplementing each component's baseline look as
       plain/scoped CSS is wasted effort + a regression risk. This reverses locked
       decision D-2 ("works without Tailwind") for these owner-controlled consumers.
       Consequences:
         - package.json keeps `tailwindcss: ">=4.0.0"` as a REQUIRED peerDependency
           (NOT optional). README already documents the required v4 `@source` setup — no change.
         - Existing per-instance dynamic self-injected CSS (checkbox/toggle/slider/datetime/
           loading) STAYS — it encodes runtime values Tailwind can't express; unrelated to decoupling.
         - No no-Tailwind smoke test; the shared injectStyle(id,css) refactor (ISSUE-13) is NOT done.
         - 0.2.0 breaking-change list (Task 6) drops "tailwind optional" → TWO breaking changes only:
           toggle uncontrolled-by-default, input-field inner `name` removed.
         - FOLLOW-UP for s3 04-05: the dashboard must load Tailwind v4 with an `@source`
           directive pointing at the vendored td-components/src. -->
  <files>src/base/td-base-element.js, ALL of src/**/*.js (every component that uses Tailwind classes), src/styles/*, README.md, package.json, test/no-tailwind.spec.*</files>
  <action>
    Standardize on the **self-injected, per-instance-scoped CSS** pattern (already used by td-checkbox/td-toggle): factor the helper as a **module-level `injectStyle(id, css)` function** (ISSUE-13) in a shared util (e.g. `src/utils/style.js`) with global dedupe-by-id + a returned cleanup handle — usable by BOTH `TdBaseElement` subclasses AND any non-element utility; `TdBaseElement` exposes a thin `injectStyle()` that delegates to it and registers cleanup. Migrate EVERY component that currently relies on Tailwind classes for baseline look — **ISSUE-8: this is ALL components, not just button/slider/dropdown/datetime**; the survey shows checkbox, toggle, input-field also carry Tailwind utility classes in layout/text paths, and the display/feedback components (table, tabs, pagination, modal, toast, tooltip, loading, empty-state) too. Each ships its essential look as scoped CSS so it renders correctly with NO host Tailwind. Tailwind classes may remain ONLY as optional, host-overridable polish. Update `package.json`: `tailwindcss` → `peerDependenciesMeta: { tailwindcss: { optional: true } }`; README states baseline works without Tailwind.
    **Automated no-Tailwind proof (ISSUE-8):** add a real-browser smoke test (Task 5 runner) that loads EVERY component on a plain HTML page with NO Tailwind stylesheet and asserts computed-style sanity per component (e.g. a button has non-zero padding + a background; inputs have a visible border + min-height; the modal overlays; nothing collapses to 0×0 or unstyled inline text). Grep-only is NOT sufficient.
  </action>
  <acceptance_criteria>
    - The base exposes a shared `injectStyle` helper; EVERY component that used Tailwind for baseline look now injects its own scoped CSS (audit list in the SUMMARY enumerates all components checked).
    - The automated no-Tailwind computed-style smoke test passes for ALL components (each is legible/usable with no Tailwind loaded) — not just a visual eyeball.
    - `package.json` marks `tailwindcss` optional (`peerDependenciesMeta`); README documents "works without Tailwind; Tailwind optional."
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 4: XSS audit + consistency pass across ALL components</name>
  <files>src/**/*.js</files>
  <action>
    **ISSUE-9 — a CONTEXT-BASED security model, not just `escapeHtml`.** The base renders via `innerHTML`, and values flow into DIFFERENT contexts, each needing different handling. Establish + apply per context, and document the helpers:
      - **HTML text** → `escapeHtml()` (existing). 
      - **HTML attribute** (value="…", placeholder="…", aria-…) → an attribute-safe escape (at minimum `&"'<>` ) — add `escapeAttr()` if `escapeHtml` isn't sufficient for unquoted/attr contexts; prefer always-quoted attributes.
      - **CSS value / inline style** (e.g. td-checkbox/td-toggle inject the `color` attribute INTO a stylesheet; sliders inject numeric sizes) → do NOT trust raw attribute values in CSS: VALIDATE/whitelist (e.g. color must match a strict color regex / hex / named-set; sizes must be finite numbers within bounds) before interpolating into CSS. An attacker-controlled `color="…}; …"` must not break out of the rule.
      - **class names** (size/type variants) → enumerate against a whitelist (already done for size/type — keep).
      - **numeric attributes** (rows, max-length, min/max/step, count) → `Number()`-coerce + clamp; never interpolate the raw string.
      - **Trusted raw-HTML escape hatches** → td-table cell renderers, td-modal/td-toast body, td-tooltip content may intentionally accept HTML. DOCUMENT these as explicitly trusted (consumer's responsibility), name them clearly in JSDoc/README, and ensure DEFAULT paths (plain text props) are escaped; the raw hatch must be an explicit opt-in API, never the default for a plain string attribute.
    Audit EVERY component against this model; fix any raw interpolation (the survey shows checkbox/slider under-escape; the color→CSS path is a concrete injection vector). 
  </action>
  <acceptance_criteria>
    - A documented context table exists (HTML text / attribute / CSS / class / numeric / trusted-raw) with the helper used for each; `escapeAttr` added if needed.
    - The CSS-injection vector is closed: `color`/size/numeric attributes are validated/whitelisted/coerced before entering injected CSS (test: `color="red}};x{}"` and `color="<script>"` do NOT alter/escape the rule).
    - XSS fixture tests pass (malicious attribute renders inert; CSS payload contained) for input-field, checkbox, slider, dropdown, table, toast, tooltip at minimum.
    - Every trusted raw-HTML escape hatch is documented as opt-in; plain-string attributes default to escaped.
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 5: Real-BROWSER test harness + form/behavior/no-Tailwind/XSS tests (prove universality)</name>
  <files>package.json, web-test-runner.config.* (or playwright.config.*), test/**, src/form/*.stories.js, demo.html, .github/workflows/* (or a documented `npm test` script)</files>
  <action>
    **ISSUE-1 — establish a REAL-BROWSER test runner FIRST** (this harness is what the tests written in Tasks 1-4 run on; the existing Node + DOM-shim cannot prove `attachInternals()`, native `FormData`, constraint validation, `<fieldset disabled>`, `requestSubmit()`, label association, or `formStateRestore`). Add **@web/test-runner (+ @web/test-runner-playwright)** OR **Playwright Test** with a pinned version, a config, and an `npm test` (+ CI) script that runs headless Chromium. Then add the test suites the other tasks reference:
      - **Form submission** (all six controls): in a real `<form>`, `requestSubmit()` (or submit) → assert `new FormData(form)` has the expected `name`→value: unchecked checkbox/toggle ABSENT, checked → its `value`; input-field typed text (and textarea/number/email/url/contenteditable modes); slider numeric; dropdown selected; datetime value. Assert NO double-entry for input-field.
      - **Validation**: per the Task-2 matrix — `required`+empty blocks submit with the right `validity.*` flag; range/step/type where applicable.
      - **Reset**: after user interaction (and after late option load for dropdown), form reset restores defaults.
      - **State restore (ISSUE-4)**: drive `formStateRestoreCallback(state, 'restore')` per STATEFUL control (esp. dropdown + datetime-picker, where display state ≠ submitted value) and assert the control re-displays + re-submits the restored state; where a real bfcache/autofill trigger isn't scriptable, call the callback directly in-browser and assert the post-restore FormData + visible state (document this as the browser-compatible simulation).
      - **Disabled**: `<fieldset disabled>` ancestor disables UI + interaction + omits from submission for all six.
      - **Labels**: external `<label for>` is in `el.labels` + click focuses the control; no duplicate ids.
      - **No-Tailwind smoke (Task 3 / ISSUE-8)**: load every component with NO Tailwind and assert computed-style sanity.
      - **XSS (Task 4 / ISSUE-9)**: malicious attribute renders inert; `color`/CSS payload contained.
    Update `demo.html` with a "real form submission" section.
  </action>
  <acceptance_criteria>
    - A real-browser runner (pinned @web/test-runner+playwright or Playwright) runs via `npm test` headless and is wired into CI/a documented command; the existing Node shim is NOT used to "prove" form behavior.
    - All suites pass: form-submission (six controls incl. unchecked→absent / checked→value, no double-submit), validity matrix, reset-after-interaction, fieldset-disabled, label association, no-Tailwind computed-style, XSS+CSS-injection.
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 6: Docs + version bump</name>
  <files>README.md, package.json, index.js</files>
  <action>
    README: add a "Use in a `<form>`" section (FormData example), the "works without Tailwind (optional polish)" note, and an ElementInternals browser-support line (+ optional polyfill pointer for legacy). Ensure `index.js`/exports include `./base` form element if it's a public export. Bump `version` to `0.2.0`. A CHANGELOG/README "Breaking changes" section MUST list: (1) td-input-field inner native control(s) no longer carry `name` (submission now via the host element); (2) **td-toggle is now UNCONTROLLED by default (self-toggles)** — use the new `controlled` attribute to restore the old emit-only behavior; (3) `tailwindcss` downgraded to an optional peer dependency.
  </action>
  <acceptance_criteria>
    - README documents form usage + optional-Tailwind + browser support; `package.json` is `0.2.0`; the inner-input `name` change is noted.
  </acceptance_criteria>
</task>

</tasks>

<threats_risks>
- **R-1 (double submit):** adding ElementInternals while td-input-field still forwards `name` to its inner input → the value submits twice. Mitigation: Task 2 removes the inner `name`; Task 5 asserts exactly one value per control.
- **R-2 (behavior regression for existing consumers):** changing the submission path / td-toggle default could break sites relying on the old behavior. Mitigation: attrs/events otherwise preserved; the THREE breaking changes (D-4) are explicitly listed in the 0.2.0 "Breaking changes" changelog with migration notes (the `controlled` opt-in for td-toggle); version bump signals it. This is an accepted, documented break — NOT a silent one.
- **R-3 (style migration breaks looks):** moving Tailwind components to self-injected CSS could change appearance. Mitigation: visual check in Storybook + plain page; keep Tailwind classes as optional polish so Tailwind hosts look identical.
- **R-4 (XSS):** the innerHTML render model is XSS-prone if any value is unescaped. Mitigation: Task 4 audit + fixture tests.
- **R-5 (dirty baseline):** uncommitted WIP could be lost or conflict. Mitigation: Task 0 reconciles it first on a branch.
</threats_risks>

<out_of_scope>
- Rewriting to TypeScript or adding Lit/Shadow DOM (house decisions stand).
- New components beyond the existing set.
- The s3 dashboard consumption itself (that is the separate s3 plan 04-05; it vendors the UPGRADED lib after this lands).
</out_of_scope>
