# td-components

Shared UI Web Components library. Drop into any project, import what you need, it just works.

No Shadow DOM -- components use Tailwind classes from your host page. No framework dependency -- vanilla JS Custom Elements that work everywhere.

## Install

```bash
npm install github:dazzxq/td-components
```

## Tailwind Configuration

Add the component source files to your `tailwind.config.js` content array. This is **required** -- without it, Tailwind will purge the CSS classes used by components and they will render without styles.

```js
// tailwind.config.js
export default {
  content: [
    // ... your project files
    './node_modules/@dazzxq/td-components/src/**/*.js',
  ],
};
```

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
npm run storybook    # Start Storybook at http://localhost:6006
```

## License

MIT
