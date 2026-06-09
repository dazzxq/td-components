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

All seven form controls below are **form-associated** (via `ElementInternals`): give one a `name` and drop it in a `<form>`, and it submits in `FormData`/POST, participates in `required`/constraint validation, resets with the form, is excluded by an ancestor `<fieldset disabled>`, and restores on autofill/bfcache — exactly like a native control. No hidden `<input>` mirroring needed.

### `td-button` — `@dazzxq/td-components/button`

A styled button with variants, icons, and a loading state.

```html
<td-button variant="primary" size="md" label="Save"></td-button>
<td-button variant="danger" icon="fas fa-trash" loading></td-button>
```
```js
import '@dazzxq/td-components/button';
document.querySelector('td-button').addEventListener('click', () => save());
```

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `variant` | string | `primary` | `primary` \| `secondary` \| `success` \| `danger` \| `info` \| `warning` |
| `size` | string | `md` | `sm` \| `md` \| `lg` |
| `icon` | string | — | Icon CSS class (e.g. `fas fa-edit`) |
| `icon-position` | string | `left` | `left` \| `right` |
| `loading` | boolean | `false` | Show spinner + disable |
| `disabled` | boolean | `false` | Disable the button |
| `full-width` | boolean | `false` | Stretch to container width |
| `color` | string | — | Custom background color (overrides `variant`) |
| `text-color` | string | auto | Custom text color (auto-contrasted if unset) |
| `label` | string | — | Button text (alternative to `textContent`) |

**Events:** `click` → `{}`

### `td-input-field` — `@dazzxq/td-components/input-field`

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
| `type` | string | `text` | `text` \| `password` \| `email` \| `tel` \| `number` \| `url` \| `search` \| `textarea` \| `contenteditable` |
| `size` | string | `md` | `sm` \| `md` \| `lg` |
| `value` | string | — | Current value |
| `placeholder` | string | — | Placeholder text |
| `disabled` | boolean | `false` | Disable (also via `<fieldset disabled>`) |
| `readonly` | boolean | `false` | Read-only |
| `required` | boolean | `false` | Required (shows asterisk on label) |
| `max-length` | number | — | Char/word limit |
| `limit-type` | string | `char` | `char` \| `word` |
| `min` / `max` / `step` | string | — | Range/step (number type) |
| `label` | string | — | Label text |
| `helper-text` | string | — | Helper text below the field |
| `error-text` | string | — | Error text below the field (red) |
| `field-id` | string | — | `id` forwarded to the inner input (for the internal `<label for>`) |
| `name` | string | — | Form field name (submitted via the host) |
| `rows` | number | `4` | Rows for `textarea` |
| `validate-on` | string | — | Auto-show the inline error on `blur` \| `input` \| `change` |

**Events:** `input` → `{ value }` (on change) · `change` → `{ value }` (on blur)
**Methods:** `getValue()`, `setValue(v)`, `setError(msg)`, `setHelper(msg)`, `setDisabled(bool)`, `setReadOnly(bool)` + standard `checkValidity()`/`reportValidity()`.

> **0.2.0 BREAKING:** the inner `<input>`/`<textarea>` no longer carries a `name`; submission goes through the host's `name`.

### `td-checkbox` — `@dazzxq/td-components/checkbox`

```html
<td-checkbox name="agree" required label="I agree to the terms"></td-checkbox>
<td-checkbox name="plan" value="pro" checked color="#10b981"></td-checkbox>
```

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `checked` | boolean | `false` | Checked state |
| `value` | string | `on` | Submitted value when checked |
| `name` | string | — | Form field name |
| `required` | boolean | `false` | Must be checked for the form to be valid |
| `disabled` | boolean | `false` | Disable (also via `<fieldset disabled>`) |
| `label` | string | — | Label next to the box |
| `size` | string | `md` | `sm` \| `md` \| `lg` |
| `color` | string | `#2196F3` | Checked background/border color |

**Events:** `change` → `{ checked }`

### `td-toggle` — `@dazzxq/td-components/toggle`

A switch. **Uncontrolled by default** (clicking self-toggles like a native checkbox); add `controlled` for the legacy emit-only behavior where you flip `checked` yourself.

```html
<td-toggle name="notifications" label="Email me" checked></td-toggle>
<td-toggle name="beta" controlled></td-toggle>
```

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `checked` | boolean | `false` | On state |
| `controlled` | boolean | `false` | Emit `change` only — do NOT self-toggle (legacy) |
| `value` | string | `on` | Submitted value when on |
| `name` | string | — | Form field name |
| `required` | boolean | `false` | Must be on for the form to be valid |
| `disabled` | boolean | `false` | Disable (also via `<fieldset disabled>`) |
| `label` | string | — | Label next to the switch |
| `size` | string | `md` | `sm` \| `md` \| `lg` |
| `color` | string | `#4ADE80` | Active color |

**Events:** `change` → `{ checked }`
**Methods:** `setColor(cssColor)`

> **0.2.0 BREAKING:** default behavior changed from controlled (emit-only) to uncontrolled (self-toggling).

### `td-slider` — `@dazzxq/td-components/slider`

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
| `color` | string | `#3b82f6` | Thumb/active track color |
| `track-color` | string | `#e5e7eb` | Inactive track color |
| `label` | string | — | Main label text |
| `show-label` | boolean | `false` | Show the current value label |
| `label-position` | string | `top` | `top` \| `bottom` |
| `show-step-labels` | boolean | `false` | Show min/max labels |
| `show-step-marks` | boolean | `false` | Show step marks on the track |
| `disabled` | boolean | `false` | Disable (also via `<fieldset disabled>`) |

**Events:** `input` → `{ value }` (during drag) · `change` → `{ value }` (on release). Range/step validity is computed against the component value.

### `td-dropdown` — `@dazzxq/td-components/dropdown`

A searchable select with keyboard navigation. Options are supplied as a **JS property**; it submits the selected option's value.

```html
<td-dropdown name="city" required placeholder="Pick a city"></td-dropdown>
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
| `placeholder` | string | `Chọn một tùy chọn` | Placeholder when nothing is selected |
| `searchable` | boolean | on | Search filtering |
| `allow-clear` | boolean | on | Show a "clear" option when something is selected |
| `disabled` | boolean | `false` | Disable (also via `<fieldset disabled>`) |
| `required` | boolean | `false` | A value must be selected for the form to be valid |
| `name` | string | — | Form field name |
| `max-height` | number | `5` | Max visible options before scrolling |
| `value-key` / `label-key` | string | `value` / `label` | Object keys for value/label |

**Properties:** `options: Array<Object>`, `onChange(value)`, `onSelect(item)`
**Events:** `change` → `{ value, item }`
**Methods:** `getValue()`, `setValue(v)`, `getSelectedItem()`, `updateData(arr)`. A value set before its option exists is remembered and resolved when `options`/`updateData()` arrives (async-safe).

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

const id = TdModal.show({ title: 'Edit', body: '<p>…</p>', size: 'lg' });
TdModal.closeById(id);

TdModal.confirm({ message: 'Delete this?', onConfirm: () => del() });
TdModal.success({ message: 'Saved' });
TdModal.error({ message: 'Something went wrong' });
TdModal.info({ message: 'Heads up' });
```

`show(options)` options: `title`, `body` (HTML string or element), `footer` (button elements), `size` (`xs`…`5xl` \| `full`), `width`/`height`, `fullViewport`, `closable`, `showHeader`, `showFooter`, `onClose`, `autoFocus`, `focusTarget`, `bodyPadding`, `bodyOverflow`. Other methods: `close()`, `closeAll()`. Stacked modals are managed by `TdModalStackManager` (`@dazzxq/td-components/modal-stack`).

### `TdToast` — `@dazzxq/td-components/toast`

```js
import { TdToast } from '@dazzxq/td-components/toast';
TdToast.success('Saved');
TdToast.error('Failed', 5000);            // (message, duration ms)
TdToast.show('Custom', 'info', 4000);     // (message, type, duration)
```
`show(message, type, duration)` — `type`: `success` \| `error` \| `warning` \| `info`; `duration` ms (`0` = sticky). Shortcuts: `success` / `error` / `warning` / `info`.

### `TdLoading` — `@dazzxq/td-components/loading`

```js
import { TdLoading, TdLoadingSpinner } from '@dazzxq/td-components/loading';
TdLoading.show('Đang tải...');     // or TdLoading.show({ message, maxDuration })
TdLoading.hide();
const spinnerEl = TdLoading.create({ size: 'md', color: '#3b82f6' }); // inline spinner element
```
Full-screen overlay (`show`/`hide`) plus an inline `TdLoadingSpinner` element via `create({ size, color, trackColor, className })`.

### `TdTooltip` — `@dazzxq/td-components/tooltip`

Zero-API: importing the module auto-initializes a global singleton. Any element with `data-tooltip` shows a tooltip on hover.

```html
<button data-tooltip="Delete" data-tooltip-position="bottom" data-tooltip-color="#ef4444">🗑</button>
<script type="module">import '@dazzxq/td-components/tooltip';</script>
```
Customize per element: `data-tooltip` (text), `data-tooltip-position` (`top` \| `bottom` \| `left` \| `right`), `data-tooltip-color`.

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

```js
import '@dazzxq/td-components/tabs';
const tabs = document.querySelector('td-tabs');
tabs.tabs = [{ id: 'a', label: 'Account' }, { id: 'b', label: 'Billing', icon: '💳' }];
tabs.addEventListener('tab-change', (e) => show(e.detail.tabId));
```

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `size` | string | `md` | `sm` \| `md` |
| `active-tab` | string | — | ID of the initially active tab |

**Properties:** `tabs` (`{id, label, icon?}[]`), `onChange(tabId)` · **Events:** `tab-change` → `{ tabId }`

### `td-pagination` — `@dazzxq/td-components/pagination`

```html
<td-pagination total-items="240" items-per-page="20" current-page="1"></td-pagination>
```

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `total-items` | number | `0` | Total item count |
| `items-per-page` | number | `10` | Page size |
| `current-page` | number | `1` | Current page (1-based) |
| `active-color` | string | `#ef4444` | Active page color |
| `item-label` | string | `mục` | Noun in the info text |
| `max-pages` | number | `5` | Page buttons to show |

**Events:** `page-change` → `{ page }`

### `td-empty-state` — `@dazzxq/td-components/empty-state`

```html
<td-empty-state title="No invoices yet" message="Create your first invoice." size="lg"></td-empty-state>
```

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `icon` | string | inbox SVG | SVG string or icon identifier |
| `title` | string | `Không có dữ liệu` | Title text |
| `message` | string | `Chưa có mục nào được tạo.` | Message text |
| `size` | string | `md` | `sm` \| `md` \| `lg` |
| `compact` | boolean | `false` | Reduced padding |

**Properties:** `actions` (`{label, variant?, onClick}[]`) — renders action buttons.

---

## Security model (XSS)

Components render via `innerHTML`, and values flow into different contexts — each needs a different sanitizer. The library applies these by context:

| Context | Where | Helper / rule |
|---------|-------|---------------|
| **HTML text** | label, message, title, option labels, cell values | `escapeHtml()` |
| **HTML attribute** (quoted) | `value=""`, `placeholder=""`, `data-*`, icon class, `field-id` | `escapeHtml()` (sufficient for quoted attributes — it escapes `& < > " '`) |
| **CSS value** | `color` / `track-color` / `active-color` / `text-color` injected into a `<style>` rule or `style=""` | **`safeColor()`** — whitelists hex / named / `rgb()/hsl()`; anything else falls back to the default (closes the `color="red;}…"` and attribute-breakout vectors) |
| **CSS dimension** | table `col.width/minWidth/maxWidth` | `safeCssDimension()` — number + optional unit only |
| **class names** | size/type/variant | enumerated against a whitelist |
| **numeric** | `rows`, `max-length`, `min/max/step`, counts, page numbers | `Number()`-coerce / `clampNumber()` — never the raw string |

Sanitizers live in `src/utils/escape.js` (`escapeHtml`) and `src/utils/css-safe.js` (`safeColor`, `safeCssDimension`, `clampNumber`); `TdBaseElement` exposes `this.escapeHtml()` and `this.safeColor()`.

**Trusted raw-HTML escape hatches** (opt-in, developer's responsibility — never pass end-user input):
- `TdModal.show({ body })` — `body` is raw HTML/an element by design. (`confirm/success/error/info` escape their `message`.)
- `td-table` column `render(row)` — returns raw cell HTML. Cells without `render` show the escaped plain value.
- `td-empty-state` `icon` — a value starting with `<svg` is injected raw.

Plain-string attributes/props always default to **escaped**; raw HTML is only ever an explicit opt-in.

## See also

- [README](../README.md) — install, Tailwind v4 setup, and how to build your own component on `TdBaseElement`.
- Run `npm run storybook` for a live, interactive gallery of every component and its params.
