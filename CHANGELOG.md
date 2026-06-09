# Changelog

All notable changes to **td-components** are documented here.

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
