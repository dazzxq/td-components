# td-components

Shared UI Web Components library. Drop into any project, import what you need, it just works.

No Shadow DOM -- components render light DOM styled by one CSS file (`td.css`), so your page CSS and `--td-*` tokens reach them. No framework dependency -- vanilla JS Custom Elements that work everywhere.

Each component is **independent** (import only what you need) and **customized through params** -- HTML attributes for scalars, JS properties for data/callbacks. See the **[Component Catalog](docs/components.md)** for every component, its params, and usage examples.

**Docs:** [docs/README.md](docs/README.md) — vision, roadmap, architecture, conventions, decisions.

## Install

```bash
npm install github:dazzxq/td-components
```

## Styles: `td.css` (token kit)

Load the kit stylesheet once. It is reset-free and CSP-safe (plain file, no inline styles).

```js
// Vite / bundler
import '@dazzxq/td-components/td.css';
```

```html
<!-- plain PHP / HTML (add nonce="…" under a nonce-based CSP) -->
<link rel="stylesheet" href="/node_modules/@dazzxq/td-components/td.css">
```

Theme it by overriding public `--td-*` tokens in your own **unlayered** CSS (see
[docs/architecture.md](docs/architecture.md#site-tuỳ-biến-thế-nào)). Dark theme is opt-in:
`<html data-td-theme="dark">`. Turn glass off manually: `<html data-td-glass="off">`.

Every component is **token-native** (td.css only) since 0.10.0; the Tailwind peer dependency was removed in 0.11.0
([ADR 0008](docs/decisions/0008-drop-tailwind-token-css.md)). **Tailwind hosts** can keep Tailwind: td.css is
layered (`@layer td.*`) and every component sets its own font, line-height, box-sizing and borders, so a host
preflight does not alter it (checked by the `legacy+td` CSP profile).

## Usage

### Import a single component (recommended)

```js
import '@dazzxq/td-components/toggle';
// Now <td-toggle> is available in your HTML
```

### Import everything

```js
import '@dazzxq/td-components';
// All components registered
```

### HTML usage

```html
<td-sample label="Hello World" count="0"></td-sample>

<script type="module">
  import '@dazzxq/td-components/sample';

  document.querySelector('td-sample')
    .addEventListener('count-change', (e) => {
      console.log('New count:', e.detail.count);
    });
</script>
```

### Use in a `<form>`

As of **0.2.0**, every form control is a real form-associated custom element — give it a
`name`, drop it in a `<form>`, and it submits in `FormData`/POST, supports `required` and
constraint validation, resets with the form, and is excluded by an ancestor
`<fieldset disabled>` — just like a native control.

```html
<form id="signup">
  <td-input-field name="email" type="email" label="Email" required></td-input-field>
  <td-checkbox name="agree" required label="I agree"></td-checkbox>
  <td-dropdown name="plan" value="pro" required></td-dropdown>
  <button type="submit">Sign up</button>
</form>

<script type="module">
  import '@dazzxq/td-components/input-field';
  import '@dazzxq/td-components/checkbox';
  import '@dazzxq/td-components/dropdown';

  const form = document.getElementById('signup');
  // Provide the options; the dropdown's `value="pro"` resolves to a selection once they load.
  form.querySelector('td-dropdown').options = [{ value: 'pro', label: 'Pro' }];
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;          // native validation, incl. the custom controls
    console.log(Object.fromEntries(new FormData(form)));  // e.g. { email: 'a@b.com', agree: 'on', plan: 'pro' }
  });
</script>
```

**Browser support:** form association uses
[`ElementInternals`](https://developer.mozilla.org/docs/Web/API/ElementInternals), supported
in all current evergreen browsers (Chrome/Edge 77+, Firefox 98+, Safari 16.4+). For older
engines, load a [form-associated CE polyfill](https://www.npmjs.com/package/element-internals-polyfill)
before importing the components.

See the **[Component Catalog](docs/components.md)** for every component's params, and
**[CHANGELOG.md](CHANGELOG.md)** for the 0.2.0 breaking changes.

## Creating Components

Extend `TdBaseElement` to create new components:

```js
import { TdBaseElement } from '@dazzxq/td-components/base';

class TdMyComponent extends TdBaseElement {
  static get observedAttributes() { return ['label']; }

  render() {
    return `<div>${this.escapeHtml(this.getAttribute('label') || '')}</div>`;
  }

  afterRender() {
    const el = this.querySelector('div');
    this.listen(el, 'click', () => {
      this.emit('my-event', { label: this.label });
    });
  }
}

if (!customElements.get('td-my-component')) {
  customElements.define('td-my-component', TdMyComponent);
}
```

## API Reference

### TdBaseElement

| Method | Description |
|--------|-------------|
| `render()` | Override. Return HTML string. Called on connect and attribute change. |
| `afterRender()` | Override. Bind events after render. Called after every render. |
| `listen(target, event, handler, options)` | addEventListener with auto cleanup on disconnect |
| `setTimeout(fn, ms)` | setTimeout with auto cleanup on disconnect |
| `setInterval(fn, ms)` | setInterval with auto cleanup on disconnect |
| `emit(name, detail)` | Dispatch CustomEvent with `bubbles: true, composed: true` |
| `escapeHtml(str)` | Escape HTML entities (`&`, `<`, `>`, `"`, `'`) for safe innerHTML |

### Static Getters (override in subclass)

| Getter | Description |
|--------|-------------|
| `observedAttributes` | Return array of attribute names to watch for changes |
| `booleanAttributes` | Return array of boolean attribute names (subset of observedAttributes) |

Boolean attributes use `hasAttribute()` (present = true, absent = false). String attributes use `getAttribute()`.

## Development

```bash
npm test                 # all three layers: node + browser + csp
npm run test:node        # unit tests (node --test + DOM shim), src/**/*.test.js
npm run test:browser     # real-browser tests (@web/test-runner + Playwright), src/**/*.browser-test.js
npm run test:csp         # strict-CSP parity gate (Playwright), test/csp/
npm run storybook        # Start Storybook at http://localhost:6006
npm run build-storybook  # Static Storybook build
```

## License

MIT
