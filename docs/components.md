# Component Catalog

A reference for every component in **td-components** — what it does, how to use it, and how to customize it.

## How these components work

Three principles hold for the whole library:

1. **Each component is independent.** Import only the one you need (`import '@dazzxq/td-components/dropdown'`) — there is no shared runtime to set up, no provider to wrap your app in. One import registers one custom element (or one imperative API) and nothing else.
2. **You customize through params, not CSS overrides.** Declarative components are configured with **HTML attributes** (e.g. `size="lg"`, `color="#10b981"`, `required`); list/object data and callbacks are set through **JS properties** (e.g. `el.options = [...]`, `el.columns = [...]`). Imperative components (modal/toast/loading) take an **options object**.
3. **No Shadow DOM.** Components render into light DOM and use your host page's Tailwind classes, so they inherit your fonts/colors and you can always reach inside if you must. (See the [README](../README.md) for the required Tailwind v4 `@source` setup.)

**Reading the tables below:**
- **Attribute** — set in HTML, e.g. `<td-toggle size="lg">`. Boolean attributes are on when present (`required`), off when absent.
- **Property** — set from JS, e.g. `el.options = [...]`. Used for arrays/objects/functions that can't live in an attribute.
- **Event** — a `CustomEvent` you listen for with `addEventListener`; `e.detail` carries the payload.

---

## Form controls

> Catalog state: **v0.4.0**. Every export here is currently **legacy (Tailwind-styled)**; token-native components arrive from v0.5 ([ADR 0008](decisions/0008-drop-tailwind-token-css.md)).

Six controls below — `td-input-field`, `td-checkbox`, `td-toggle`, `td-slider`, `td-dropdown`, `td-datetime-picker` — are **form-associated** (via `ElementInternals`): give one a `name` and drop it in a `<form>`, and it submits in `FormData`/POST, participates in `required`/constraint validation, resets with the form, and is excluded by an ancestor `<fieldset disabled>` — like a native control. No hidden `<input>` mirroring needed.

**Autofill/bfcache state restore** (`formStateRestoreCallback`) is implemented explicitly only for `td-input-field`, `td-dropdown`, and `td-datetime-picker`. `td-slider` relies on the base default (restores `value`); `td-checkbox`/`td-toggle` do **not** restore their checked state.

`td-button` is **not** form-associated: it renders a light-DOM `<button>` whose `type` (`submit`/`reset`) acts on the enclosing form.

### `td-button` — `@dazzxq/td-components/button`

> **Token-native (0.7.0):** needs `td.css`, no Tailwind. Internal classes changed — see [class map](migration/class-map.md).

Solid content-layer button (never glass — the one primary action on a floating bar uses `.td-glass-tint`).

```html
<td-button variant="primary" label="Save"></td-button>
<td-button variant="danger" icon="close" loading>Xoá</td-button>
<td-button variant="secondary" icon="more" aria-label="Thêm"></td-button>
```

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `variant` | string | `primary` | `primary` \| `secondary` \| `success` \| `danger` \| `info` \| `warning` (status colours ≥ 4.5:1) |
| `size` | string | `md` | `sm` \| `md` \| `lg` (32 / 40 / 48 px; 44 px + capsule on touch) |
| `icon` | string | — | Icon **registry name** (e.g. `download`). Deprecated: any other value is treated as a legacy class list (e.g. `fas fa-edit`) |
| `icon-position` | string | `left` | `left` \| `right` |
| `loading` | boolean | `false` | `aria-busy` + `aria-disabled`, spinner, clicks swallowed, **focus kept** |
| `disabled` | boolean | `false` | Native disabled |
| `full-width` | boolean | `false` | Stretch to container width |
| `color` | string | — | Custom background (overrides `variant`) |
| `text-color` | string | auto | Custom text colour (auto: black/white by WCAG contrast; translucent colours composited over white) |
| `label` | string | — | Button text (alternative to `textContent`) |
| `type` | string | `button` | `button` \| `submit` \| `reset` (whitelisted) |
| `aria-label` | string | — | Forwarded to the inner button (icon-only buttons) |

Tokens: `--td-btn-radius`, `--td-btn-primary-bg/-fg`, `--td-btn-secondary-*`. Methods: `setLoading(bool)`, `setDisabled(bool)`.
Events: the native `click` of the inner button.

### `td-input-field` — `@dazzxq/td-components/input-field`

> **Token-native (0.8.0):** needs `td.css`, no Tailwind. Internal classes changed — see [class map](migration/class-map.md).


A text/number/textarea/contenteditable field with label, helper/error text, and a char/word counter. The host owns validation; for `email`/`url`/`number` the host computes `typeMismatch`/range/step so the field never double-blocks a form.

```html
<form>
  <td-input-field name="email" type="email" label="Email" required
                  helper-text="We never share it"></td-input-field>
  <td-input-field name="bio" type="textarea" max-length="280" limit-type="char"
                  rows="4" label="Bio"></td-input-field>
</form>
```

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `type` | string | `text` | `text` \| `password` \| `email` \| `tel` \| `number` \| `url` \| `search` \| `date` \| `textarea` \| `contenteditable` (`date` renders a native date picker, since 0.4.0) |
| `size` | string | `md` | `sm` \| `md` \| `lg` |
| `value` | string | — | Current value |
| `placeholder` | string | — | Placeholder text |
| `disabled` | boolean | `false` | Disable (also via `<fieldset disabled>`) |
| `readonly` | boolean | `false` | Read-only |
| `required` | boolean | `false` | Required (shows asterisk on label) |
| `max-length` | number | — | Char/word limit |
| `limit-type` | string | `char` | `char` \| `word` |
| `min` / `max` / `step` | string | — | Range/step (`number`); `min`/`max` also forwarded to `date` |
| `label` | string | — | Label text |
| `helper-text` | string | — | Helper text (`.td-field__note`), shown together with an error |
| `error-text` | string | — | Error (error contract: `.td-field-error` + `aria-invalid`/`aria-errormessage`/`aria-describedby`) |
| `field-id` | string | `{host-id}-control` | `id` of the inner control, used verbatim; the label always points at it |
| `aria-label` | string | — | Name when there is no `label` (else external `<label for="host-id">` is used) |
| `name` | string | — | Form field name (submitted via the host) |
| `rows` | number | `4` | Rows for `textarea` |
| `validate-on` | string | — | Auto-show the inline error on `blur` \| `input` \| `change` |

**Events:** exactly one `input` → `{ value }` per edit · `change` → `{ value }` on blur **only if the value changed**
(0.8.0; the native events no longer bubble).
**Methods:** `getValue()`, `setValue(v)`, `setError(msg)` / `clearError()`, `setHelper(msg)`, `setDisabled(bool)`,
`setReadOnly(bool)` + standard `checkValidity()`/`reportValidity()`. Attribute changes update in place (focus + caret
kept). Counter shows `data-state="limit"` at the limit (no red border). Form reset clears the error.

> **0.2.0 BREAKING:** the inner `<input>`/`<textarea>` no longer carries a `name`; submission goes through the host's `name`.

### `td-checkbox` — `@dazzxq/td-components/checkbox`

> **Token-native (0.7.0):** needs `td.css`, no Tailwind. Internal classes changed — see [class map](migration/class-map.md).

```html
<td-checkbox name="agree" required label="I agree to the terms"></td-checkbox>
<td-checkbox name="plan" value="pro" checked color="#10b981"></td-checkbox>
<td-checkbox aria-label="Chọn dòng"></td-checkbox>
```

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `checked` | boolean | `false` | Checked state (changes update in place — focus kept) |
| `value` | string | `on` | Submitted value when checked |
| `name` / `required` / `disabled` | — | — | Form semantics (`disabled` also via `<fieldset disabled>`) |
| `label` | string | — | Visible label (else host `aria-label`, else external `<label for="host-id">`) |
| `size` | string | `md` | `sm` \| `md` \| `lg` (hit area ≥ 24 px, 44 px on touch) |
| `color` | string | `--td-checkbox-color` (= accent) | Checked fill |
| `error-text` | string | — | Error message (error contract below) |

**Events:** exactly one `change` → `{ checked }` per user toggle (the inner input's native `change` is contained — 0.7.0).
**Error contract** (also `td-toggle`): `setError(msg)`, `clearError()`, `errorMessage`, attribute `error-text` →
`aria-invalid="true"` + `aria-errormessage` on the input and a `.td-field-error` note; cleared on form reset.

### `td-toggle` — `@dazzxq/td-components/toggle`

> **Token-native (0.7.0):** needs `td.css`, no Tailwind. Internal classes changed — see [class map](migration/class-map.md).

A switch (`.td-switch`, native `<input type="checkbox" role="switch">`). **Uncontrolled by default**; add
`controlled` to emit `change` only (you flip `checked`).

```html
<td-toggle name="notifications" label="Email me" checked></td-toggle>
<td-toggle name="beta" controlled aria-label="Beta"></td-toggle>
```

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `checked` | boolean | `false` | On state |
| `controlled` | boolean | `false` | Emit `change` only — do NOT self-toggle |
| `value` / `name` / `required` / `disabled` | — | — | Form semantics |
| `label` | string | — | Visible label (naming precedence as td-checkbox) |
| `size` | string | `md` | `sm` \| `md` \| `lg` |
| `color` | string | `--td-switch-on` (#16a34a) | On colour (default colours meet WCAG 1.4.11 3:1) |
| `error-text` | string | — | Error contract (see td-checkbox) |

**Events:** exactly one `change` → `{ checked }` (the requested state in `controlled` mode).
**Methods:** `setColor(cssColor)`, `setError` / `clearError`.
**Keyboard:** Space (native). **0.7.0:** Enter no longer toggles (APG switch pattern).

> **0.2.0 BREAKING:** default behavior changed from controlled (emit-only) to uncontrolled (self-toggling).

### `td-slider` — `@dazzxq/td-components/slider`

> **Token-native (0.8.0):** needs `td.css`, no Tailwind. Internal classes changed — see [class map](migration/class-map.md).


```html
<td-slider name="volume" min="0" max="100" value="30" show-label></td-slider>
```

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `min` / `max` | number | `0` / `100` | Range bounds |
| `value` | number | `0` | Current value |
| `step` | number | `1` | Step increment |
| `name` | string | — | Form field name |
| `size` | string | `md` | `sm` \| `md` \| `lg` |
| `color` | string | `--td-slider-color` (accent) | Fill/thumb colour (any safe CSS colour) |
| `track-color` | string | `--td-slider-track` | Inactive track colour |
| `error-text` / `aria-label` | string | — | Error contract; name when there is no `label` |
| `label` | string | — | Main label text |
| `show-label` | boolean | `false` | Show the current value label |
| `label-position` | string | `top` | `top` \| `bottom` |
| `show-step-labels` | boolean | `false` | Show min/max labels |
| `show-step-marks` | boolean | `false` | Show step marks on the track |
| `disabled` | boolean | `false` | Disable (also via `<fieldset disabled>`) |

**Events:** exactly one `input` → `{ value }` during drag and one `change` → `{ value }` on release. Range/step validity
is computed against the component value. Native range underneath (keyboard: arrows, Page, Home, End), `aria-valuetext`
formatted to the step; hit area covers the whole control (≥ 24 px, 44 px on touch); width token `--td-slider-w`
(`max-width: 100%`); step marks only when ≤ 50; the knob lifts into glass only while dragged.

### `td-dropdown` — `@dazzxq/td-components/dropdown`

A searchable **select-only combobox** (WAI-ARIA APG). Options are supplied as a **JS property**; it submits the
selected option's value. Token-native since 0.9.0 (requires `td.css`); the menu is a strong-glass popover portaled to
`<body>` at `--td-z-popover` (450), so it works inside modals.

```html
<td-dropdown name="city" label="Thành phố" required placeholder="Chọn thành phố"></td-dropdown>
```
```js
import '@dazzxq/td-components/dropdown';
const dd = document.querySelector('td-dropdown');
dd.options = [{ value: 'hn', label: 'Hà Nội' }, { value: 'sg', label: 'Sài Gòn' }];
dd.addEventListener('change', (e) => console.log(e.detail.value, e.detail.item));
```

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `value` | string | — | Initial selected value |
| `label` | string | — | Visible label (`label.td-field__label` → trigger). Else host `aria-label` or an external `<label for>` names it |
| `placeholder` | string | `Chọn một tùy chọn` | Placeholder when nothing is selected |
| `searchable` | flag | on | Search filtering. Default ON; turn off with `searchable="false"`/`"0"`/`"off"` or `el.searchable = false` |
| `allow-clear` | flag | on | "Không chọn" option when something is selected (part of the arrow order). Same default-ON rule |
| `disabled` | boolean | `false` | Disable (also via `<fieldset disabled>`); `open()` does nothing while disabled |
| `required` | boolean | `false` | A value must be selected for the form to be valid (`aria-required`) |
| `error-text` | string | — | Error contract (same as input-field): `aria-invalid` + error note; also `setError(msg)` / `clearError()` |
| `name` | string | — | Form field name |
| `max-height` | number | `5` | Max visible options before scrolling |
| `value-key` / `label-key` | string | `value` / `label` | Object keys for value/label |

**Keyboard:** closed — ↓ ↑ Enter Space open (Home/End open on the first/last option, typing jumps to a match,
diacritics-insensitive). Open — ↑ ↓ wrap, Home End PageUp PageDown, Enter selects, Escape closes and returns focus to
the trigger, Tab from the search box returns to the trigger, Tab on the trigger closes and moves on. Options are not
Tab stops; the focused control carries `aria-activedescendant`. Clicking outside closes on `pointerdown`.

**Properties:** `options: Array<Object>`, `onChange(value)`, `onSelect(item)`
**Events:** exactly one `change` per selection → `{ value, item }`
**Methods:** `getValue()`, `setValue(v)`, `getSelectedItem()`, `updateData(arr)`, `open()`, `close()`, `setError()`, `clearError()`. A value set before its option exists is remembered and resolved when `options`/`updateData()` arrives (async-safe).

### `td-datetime-picker` — `@dazzxq/td-components/datetime-picker`

Opens a wheel-style date/time modal. Displays `dd/mm/yyyy - hh:mm`; submits **ISO 8601** by default.

```html
<td-datetime-picker name="starts_at" label="Start" required></td-datetime-picker>
<td-datetime-picker name="ends_at" form-value-format="db"></td-datetime-picker>
```

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `value` | string | — | Display-format value (`dd/mm/yyyy - hh:mm`) |
| `placeholder` | string | `dd/mm/yyyy - hh:mm` | Placeholder text |
| `disabled` | boolean | `false` | Disable (also via `<fieldset disabled>`) |
| `required` | boolean | `false` | A valid date must be present for the form to be valid |
| `name` | string | — | Form field name |
| `label` | string | — | Label text |
| `form-value-format` | string | `iso` | Submitted shape: `iso` (`YYYY-MM-DDTHH:mm:00`) \| `display` \| `db` (`YYYY-MM-DD HH:mm:ss`) |
| `minute-step` | number | `1` | Minute increment in the wheel |

**Events:** `change` → `{ value, dbValue }`
**Methods:** `getValue()`, `getDBValue()`, `setValue(displayStr)`, `setDBValue(dbStr)`. With no value it submits nothing (and is `valueMissing` when `required`); a malformed value is reported as `badInput` rather than submitting a stale date.

---

## Feedback (imperative APIs)

These are **not** custom elements you place in markup — you import a class and call static methods. Importing the module is all the setup required (a singleton container is created on demand).

### `TdModal` — `@dazzxq/td-components/modal`

```js
import { TdModal } from '@dazzxq/td-components/modal';

const id = TdModal.show({ title: 'Sửa', body: formEl, size: 'lg' });
TdModal.closeById(id);

TdModal.confirm({ message: 'Xoá mục này?', onConfirm: () => api.delete() }); // → Promise<boolean>
TdModal.success({ message: 'Đã lưu' });
TdModal.error({ message: 'Có lỗi xảy ra' });
TdModal.info({ message: 'Lưu ý' });
```

`show(options)`: `title` (text), `body` (Node preferred; an HTML string is a **trusted** hatch), `footer` (elements) or
`actions` (`[{ label, variant, value, close, disabled, onClick(ctx) }]` → `.td-btn` buttons; an `onClick` returning a
thenable keeps the dialog open with that button busy until it settles — resolved `false`/rejection keep it open),
`size` (`xs`…`5xl` \| `full`), `width`/`height`/`bodyPadding` (validated CSS values), `bodyOverflow`,
`fullViewport`, `closable`, `showHeader`, `showFooter`, `onClose(value)`, `onShow(root, payload)` + `onShowPayload`,
`autoFocus`, `focusTarget`. Other methods: `close()`, `closeAll()`. Default labels: `TdModal.labels`
(`close: 'Đóng'`, `confirm: 'Xác nhận'`, `cancel: 'Hủy'`, `ok: 'OK'`).

`confirm/success/error/info`: `message` is text; `messageHtml` is **trusted** HTML (developer content only).
Promise dialogs use `role="alertdialog"`. A promise-returning `onConfirm` keeps the dialog open until it settles.

**Token-native (0.9.0):** `div[role=dialog][aria-modal=true]` named by its `h2` title, strong-glass dialog over a scrim
at `--td-z-modal` (400); only the body scrolls; below 640 px it is a bottom sheet (unless `fullViewport`). The page
behind is `inert`, Tab is trapped (toast close buttons stay reachable), focus moves into the dialog on open (first
field → first focusable → the dialog; `autoFocus:false` → the dialog; `focusTarget` only if inside it) and returns to
the opener on close. Stacked dialogs: the covered one goes solid (`[data-covered]`). `TdModal.BASE_Z_INDEX` is an
opt-in override (warns); prefer overriding the `--td-z-*` tokens.

**Dismissal (0.4.0):** a modal does **not** close on backdrop click or ESC (prevents accidental loss). It closes only via
the X button, a footer button, or `closeById`/`closeAll`. Escape is swallowed by the modal (it never reaches a
lightbox below). `closable: false` just hides the X (force-action modal). `confirm()` resolves exactly once: confirm →
`true`; cancel / X / `closeAll` → `false`. `success`/`error`/`info`: OK → `true`, dismiss → `false`.

### `TdToast` — `@dazzxq/td-components/toast`

```js
import { TdToast } from '@dazzxq/td-components/toast';
TdToast.success('Đã lưu');
TdToast.error('Thất bại', 5000);          // (message, duration ms)
TdToast.show('Tuỳ chỉnh', 'info', 4000);  // (message, type, duration)
```
`show(message, type, duration)` — `type`: `success` \| `error` \| `warning` \| `info`; `duration` ms (`0` = sticky).
Shortcuts: `success` / `error` / `warning` / `info`. The message is **text only**.

**Token-native (0.9.0):** strong-glass toasts with a registry status icon (no coloured fills), top-right at
`--td-z-toast` (500). Every toast has a close button "Đóng"; timers pause while the stack is hovered or focused (and
while the page is hidden). `role="status"` (polite), errors `role="alert"`. The text is set one frame after insertion
so screen readers announce it. Placement is token-only: `--td-toast-top/-bottom/-inline-start/-inline-end/-align`
(see `toast.css` for a bottom-centre example). Toasts stay keyboard-reachable while a modal is open.

### `TdLightbox` — `@dazzxq/td-components/lightbox`

Token-native image/video viewer (needs `td.css`, **no Tailwind**). [ADR 0009](decisions/0009-td-lightbox-hooks.md).

```js
import { TdLightbox } from '@dazzxq/td-components/lightbox';
const lb = TdLightbox.open(items, options); // → handle | null
lb.next(); lb.prev(); lb.goTo(2); lb.close(); lb.index; lb.count; lb.token; lb.isOpen
const unbind = TdLightbox.bind(root = document, options); // click delegation
```

- **Item** `{ type?: 'image'|'video', src, poster?, caption?, alt?, provider?, data? }` (a string = `{ src }`).
  Items whose URLs fail `isAllowedUrl` are dropped; nothing viewable → `null`.
- **Options** (all optional): `index`, `labels` (Vietnamese defaults; `counter: (i, n) => …`),
  `isAllowedUrl(url, item)` (default: `https:`; `http:` only on an `http:` page; other schemes opt-in), `download(item, ctx) → url|null` (default: same-origin
  images), `video(item, mountEl, { signal }) → {destroy()}|Promise|null` (default native `<video>`; plug Plyr
  here — failures fall back to the poster), `history: false|true|{ push, back, onPop(cb) → unsubscribe }`,
  `panel: false|true|(ctx) → Element|null` (`true` = caption panel; 2 columns ≥ 900px, bottom sheet below),
  `toolbar: [{ id, label, icon?, iconNode?, onClick(ctx, button), visible?(ctx) }]` (`icon` = registry name),
  `closeOnBackdrop` (default `true`), `isForeignLayerOpen()` (default: a td-modal is open → keys deferred).
- **ctx** `{ index, count, item, token, handle }`. **Events** on `document`: `td-lightbox-open|change|close`,
  `detail { index, count, token, item }`.
- **Keyboard** Esc · ← → · F · Tab trapped. **Gestures** (Pointer Events): pinch 1–4×, pan, double-tap /
  mouse click zoom 2×, swipe ← → navigate, swipe ↓ close, swipe ↑ info sheet.
- **Markup contract** for `bind()` / SSR (golden fixture `test/contracts/lightbox.html`):
  `[data-td-lightbox]` single trigger (value = URL, or inner `<img>` / wrapping `<a href>` to an image);
  gallery `[data-td-lightbox-group] > … [data-td-lightbox-item]`, optional `data-td-lightbox-src|type|poster|
  caption|provider`; caption falls back to `<figcaption>` then `alt`. The opened index is the clicked element's
  position among the VALID items.
- History contract, failure isolation and race rules: `docs/plans/v0.6.0-lightbox.md`.

### `TdLoading` — `@dazzxq/td-components/loading`

> **Token-native (0.7.0):** needs `td.css`, no Tailwind. Internal classes changed — see [class map](migration/class-map.md).

```js
import { TdLoading, TdLoadingSpinner } from '@dazzxq/td-components/loading';
TdLoading.show('Đang tải...');            // or show({ message, maxDuration }) — default 30 s safety auto-hide
TdLoading.hide();
await TdLoading.wrap(() => save(), 'Đang lưu...'); // ref-counted across concurrent wraps
const el = TdLoadingSpinner.create({ size: 'md', color: '#3b82f6', label: 'Đang tải' });
```

- Overlay: `role="status"`, scrim + strong glass card, `z-index: var(--td-z-loading)` (above modals, below toasts).
  While shown the page is `inert` (toasts stay live), scroll is locked and focus is held on the card; everything
  is restored exactly once on `hide()`, auto-hide or the last `wrap()` settling (fulfilled or rejected).
- `TdLoadingSpinner.create({ size, color, trackColor, className, label })` → `.td-spinner`; `label` makes it a
  `role="status"`, otherwise it is decorative (`aria-hidden`). Reduced motion stops the rotation.

### `TdTooltip` — `@dazzxq/td-components/tooltip`

Zero-API: importing the module auto-initializes a global singleton. Any element with `data-tooltip` shows a tooltip.

```html
<button data-tooltip="Xoá" data-tooltip-position="bottom">…</button>
<script type="module">import '@dazzxq/td-components/tooltip';</script>
```
Per element: `data-tooltip` (text), `data-tooltip-position` (`top` \| `bottom` \| `left` \| `right`),
`data-tooltip-color` (+ optional `data-tooltip-text-color`; custom colours render a solid chip).

**Token-native (0.9.0):** `role="tooltip"` strong-glass chip (no arrow) at `--td-z-tooltip` (510), linked with
`aria-describedby` while shown. Opens on mouse/pen hover and on keyboard focus, never on touch; stays while the pointer
is on the trigger or the tooltip (100 ms grace) — no auto-hide; Escape dismisses. Long text wraps.
**Naming (conservative):** only for `<button>`, `<a href>`, `input[type=button|submit|reset|image]` and explicit
`role=button|link|tab|menuitem`: a trigger that already has a name loses its `title` (the tooltip is its
description); an unnamed one gets its `title` (else `data-tooltip`, with a console warning) as `aria-label`. Other
elements keep their names and `title` untouched.

---

## Display

### `td-table` — `@dazzxq/td-components/table`

Sortable, paginated data table. Columns and rows are JS properties; supports client and server modes.

```js
import '@dazzxq/td-components/table';
const t = document.querySelector('td-table');
t.columns = [
  { key: 'name', label: 'Name', sortable: true },
  { key: 'age', label: 'Age', align: 'right' },
  { key: 'actions', label: '', render: (row) => `<td-button label="Edit"></td-button>` },
];
t.data = rows;
```

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `per-page` | number | `10` | Items per page |
| `active-color` | string | `#ef4444` | Pagination active color |
| `zebra` | boolean | `true` | Alternating row stripes |
| `loading` | boolean | `false` | Show skeleton |
| `loading-rows` | number | `5` | Skeleton row count |
| `title` | string | — | Optional table title |
| `empty-text` | string | `Không có dữ liệu` | Empty-state text |
| `server-mode` | boolean | `false` | Server-side sort/paginate |
| `total-items` | number | — | Total items (server mode) |

**Properties:** `columns` (with `key`, `label`, `sortable`, `width`, `align`, `render(row)`…), `data`, `onSort({key,direction})`, `onPageChange(page)`.

### `td-tabs` — `@dazzxq/td-components/tabs`

> **Token-native (0.8.0):** needs `td.css`, no Tailwind. Internal classes changed — see [class map](migration/class-map.md).


```js
import '@dazzxq/td-components/tabs';
const tabs = document.querySelector('td-tabs');
tabs.tabs = [{ id: 'a', label: 'Account', panel: 'panel-a' }, { id: 'b', label: 'Billing', icon: 'link' }];
tabs.addEventListener('tab-change', (e) => show(e.detail.tabId));
```

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `size` | string | `md` | `sm` \| `md` |
| `active-tab` | string | — | ID of the initially active tab |
| `activation` | string | `manual` | `manual`: arrows move focus, Enter/Space select · `auto`: arrows also select |
| `aria-label` | string | `Các thẻ` | Tablist name (`aria-labelledby` is forwarded too) |

**Properties:** `tabs` (`{id, label, icon?, panel?}[]` — `icon` is a registry name; a class list is deprecated; `panel`
is an element id: td-tabs sets its `role="tabpanel"`, `aria-labelledby`, `hidden`, `tabindex` and restores them when it
stops managing it), `onChange(tabId)` · **Events:** `tab-change` → `{ tabId }` (once per selection).
**Keyboard:** ← → (wrap, RTL-aware), Home, End move focus; Enter/Space select. Roles `tablist`/`tab`, roving tabindex.

### `td-pagination` — `@dazzxq/td-components/pagination`

> **Token-native (0.8.0):** needs `td.css`, no Tailwind. Internal classes changed — see [class map](migration/class-map.md).


```html
<td-pagination total-items="240" items-per-page="20" current-page="1"></td-pagination>
```

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `total-items` | number | `0` | Total item count |
| `items-per-page` | number | `10` | Page size |
| `current-page` | number | `1` | Current page (1-based) |
| `active-color` | string | `--td-pagination-active` (accent) | Current-page pill colour (text colour chosen for contrast) |
| `item-label` | string | `mục` | Noun in the info text |
| `max-pages` | number | `5` | Window of consecutive page numbers (first/last always shown) |
| `aria-label` | string | `Phân trang` | Name of the `<nav>` landmark |

**Events:** `page-change` → `{ page }`. Page numbers are buttons with `aria-current="page"`; prev/next stay focusable
with `aria-disabled`; focus is kept across page changes; `current-page` is clamped; the info line is `aria-live`.

### `td-empty-state` — `@dazzxq/td-components/empty-state`

> **Token-native (0.8.0):** needs `td.css`, no Tailwind. Internal classes changed — see [class map](migration/class-map.md).


```html
<td-empty-state title="No invoices yet" message="Create your first invoice." size="lg"></td-empty-state>
```

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `icon` | string | `inbox` | Icon registry name. A raw `<svg …>` string is **deprecated**: rendered only if it passes the geometry allowlist, else `inbox` + a warning |
| `title` | string | `Không có dữ liệu` | Title text |
| `message` | string | `Chưa có mục nào được tạo.` | Message text |
| `size` | string | `md` | `sm` \| `md` \| `lg` |
| `compact` | boolean | `false` | Reduced padding |
| `heading-level` | number | `3` | Title heading level (2–6) |

**Properties:** `actions` (`{label, variant?: 'primary'|'secondary'|'danger', onClick}[]`) — `.td-btn` buttons (listeners
replaced, not stacked, on reassignment); `iconNode` — a trusted `SVGElement` (cloned), the supported custom-icon hatch.

---

## Utilities

### Icons — `@dazzxq/td-components/icons`

Render icons by name ([ADR 0010](decisions/0010-icon-registry.md)); never hardcode SVG.

```js
import { tdIcon, registerIcons, hasIcon, listIcons } from '@dazzxq/td-components/icons';
btn.appendChild(tdIcon('close'));                                   // decorative
el.appendChild(tdIcon('info', { size: 'l', label: 'Thông tin' }));  // meaningful (role="img")
registerIcons({ 'site-camera': { viewBox: '0 0 24 24', paint: 'stroke', nodes: [['path', { d: '…' }]] } });
```

- Sizes: `'s' | 'm' | 'l'` (tokens `--td-icon-s|m|l`) or an integer 8–128 (px). Stroke: `--td-icon-stroke`.
- Core set (Lucide geometry, td names): see Storybook **Foundations/Icons** or `listIcons()`. Add core icons in
  `src/icons/icons.json` → `npm run build:icons`. PHP adapters read `@dazzxq/td-components/icons.json`.
- `<td-icon name size label>`: `import '@dazzxq/td-components/icon-element'` (keeps an SSR-rendered child).
- `registerIcons` accepts data only (allowlisted shape tags + geometry attributes), rejects name collisions and
  is all-or-nothing.

### `TdDateTime` — `@dazzxq/td-components/datetime`

Pure static helpers (no DOM): format with custom tokens, parse ISO/timestamp, Vietnamese relative time.

### dom-utils — `@dazzxq/td-components/dom-utils`

Opt-in, framework-free toolbox (0.4.0, ported from `dcms-utils.js`). No component depends on it.

```js
import { slugify, formatFileSize, formatNumber, debounce, throttle,
         getAccessibleTextColor, contrastRatio, parseColorToRgb, relativeLuminance } from '@dazzxq/td-components/dom-utils';
slugify('Tiếng Việt có dấu');          // 'tieng-viet-co-dau'
getAccessibleTextColor('#10b981');     // readable text color for that background
```

---

## Security

Values are sanitized **by context** (HTML text/attribute → `escapeHtml`, CSS → `safeColor`/`safeCssDimension`, enums → whitelist, numbers → coerced). Three **trusted raw-HTML escape hatches** exist — `TdModal.show({ body })`, `td-table` column `render(row)`, `td-empty-state` `<svg>` icon — never pass end-user input through them. Full context table and CSP guarantees: [security.md](security.md).

## See also

- [README](../README.md) — install, Tailwind v4 setup, and how to build your own component on `TdBaseElement`.
- Run `npm run storybook` for a live, interactive gallery of every component and its params.
