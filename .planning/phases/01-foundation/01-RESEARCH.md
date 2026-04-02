# Phase 1: Foundation — Research

**Phase:** 01-foundation
**Researched:** 2026-04-02
**Confidence:** HIGH

## 1. TdBaseElement Base Class

### Pattern: Lightweight HTMLElement Wrapper

Base class cần đủ nhẹ để không thành overhead, đủ mạnh để tránh boilerplate.

**Core lifecycle flow:**
```
constructor() → connectedCallback() → render() → [attributeChangedCallback() → render()] → disconnectedCallback() → cleanup()
```

**Key implementation details:**

#### Auto attribute/property sync
```js
// Khai báo trong subclass:
static get observedAttributes() { return ['checked', 'disabled', 'label']; }

// Base class tự sinh getter/setter cho mỗi attribute:
get checked() { return this.hasAttribute('checked'); }
set checked(val) { val ? this.setAttribute('checked', '') : this.removeAttribute('checked'); }

// Boolean attributes: có attribute = true, không có = false
// String attributes: getAttribute() trả về value
```

**Phân biệt boolean vs string attributes:**
- Boolean: `checked`, `disabled`, `open` → `hasAttribute()` 
- String: `label`, `color`, `size` → `getAttribute()`
- Base class cần cách phân biệt. Recommend: `static get booleanAttributes()` return subset of observedAttributes

#### Cleanup tracking pattern
```js
// Base class maintain _cleanups array
listen(target, event, handler, options) {
  target.addEventListener(event, handler, options);
  this._cleanups.push(() => target.removeEventListener(event, handler, options));
}

// Cũng track timers
setTimeout(fn, ms) {
  const id = window.setTimeout(fn, ms);
  this._cleanups.push(() => window.clearTimeout(id));
  return id;
}

// disconnectedCallback chạy tất cả
disconnectedCallback() {
  this._cleanups.forEach(fn => fn());
  this._cleanups = [];
}
```

#### _initialized flag
```js
connectedCallback() {
  if (!this._initialized) {
    this._initialized = true;
    this.render();
    this.afterRender(); // hook cho subclass bind events
  }
}
```

**Tại sao cần:** Browser gọi `connectedCallback` mỗi khi element được move (appendChild vào parent khác). Không có flag → render trùng, event listeners duplicate.

### innerHTML render pattern
```js
render() {
  // Subclass override, return HTML string
  return '<div>...</div>';
}

// Base class gọi:
_doRender() {
  this.innerHTML = this.render();
  this.afterRender(); // re-bind events sau mỗi render
}
```

**XSS prevention:** `escapeHtml()` static method trong base class hoặc utility:
```js
static escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
```

### Event emission helper
```js
emit(name, detail = {}) {
  this.dispatchEvent(new CustomEvent(name, {
    bubbles: true,
    composed: true, // cross shadow DOM boundary (future-proof)
    detail
  }));
}
```

## 2. Storybook 8 + Web Components + Tailwind

### Setup requirements

**Package:** `@storybook/web-components-vite` — official Storybook renderer cho Web Components với Vite builder.

**Install command:**
```bash
npx storybook@latest init --type web_components --builder vite
```

Hoặc manual:
```bash
npm install -D @storybook/web-components-vite @storybook/addon-a11y
```

### Tailwind trong Storybook

**Critical:** Storybook cần import Tailwind CSS để components render đúng.

File `.storybook/preview.js`:
```js
import '../src/styles/tailwind.css'; // hoặc path tới CSS file có @tailwind directives
```

File `src/styles/tailwind.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

File `tailwind.config.js`:
```js
export default {
  content: [
    './src/**/*.js',
    './src/**/*.stories.js',
  ]
}
```

### Story format (CSF + plain HTML)

```js
// td-toggle.stories.js
import '../td-toggle.js'; // import để register custom element

export default {
  title: 'Form/Toggle',
  tags: ['autodocs'],
  argTypes: {
    checked: { control: 'boolean' },
    label: { control: 'text' },
    disabled: { control: 'boolean' },
  },
};

export const Default = {
  render: (args) => `
    <td-toggle
      ${args.checked ? 'checked' : ''}
      ${args.disabled ? 'disabled' : ''}
      label="${args.label || ''}"
    ></td-toggle>
  `,
  args: { checked: false, label: 'Toggle me', disabled: false },
};

export const Checked = {
  ...Default,
  args: { ...Default.args, checked: true },
};
```

### Addons config
```js
// .storybook/main.js
export default {
  stories: ['../src/**/*.stories.js'],
  addons: [
    '@storybook/addon-essentials', // includes Controls, Actions, Viewport, Docs
    '@storybook/addon-a11y',
  ],
  framework: '@storybook/web-components-vite',
};
```

## 3. Package.json Exports Map

### Granular imports via exports field

```json
{
  "name": "@dazzxq/td-components",
  "type": "module",
  "main": "index.js",
  "exports": {
    ".": "./index.js",
    "./toggle": "./src/form/toggle/td-toggle.js",
    "./button": "./src/form/button/td-button.js",
    "./modal": "./src/feedback/modal/td-modal.js"
  },
  "peerDependencies": {
    "tailwindcss": ">=3.0.0"
  }
}
```

**Consumer usage:**
```js
// Import specific component (tree-shakeable)
import '@dazzxq/td-components/toggle';

// Import all (registers everything)
import '@dazzxq/td-components';
```

**Key:** `exports` field tells Node/bundlers exactly which files map to which import paths. Consumer không thấy internal folder structure.

### index.js — re-exports + registers all

```js
// index.js
export { TdToggle } from './src/form/toggle/td-toggle.js';
export { TdButton } from './src/form/button/td-button.js';
// ... etc
```

Each component file self-registers khi import:
```js
// td-toggle.js (cuối file)
if (!customElements.get('td-toggle')) {
  customElements.define('td-toggle', TdToggle);
}
```

## 4. Auto-registration with Collision Check

```js
// Mỗi component file cuối cùng:
if (!customElements.get('td-toggle')) {
  customElements.define('td-toggle', TdToggle);
}
```

**Tại sao check:** Nếu consumer import component 2 lần (trực tiếp + qua index.js), `customElements.define` throw error nếu tag đã registered. Check trước tránh crash.

## 5. Tailwind Consumer Config

Consumer **phải** thêm path tới component source vào `tailwind.config.js`:

```js
// Consumer's tailwind.config.js
export default {
  content: [
    './resources/**/*.blade.php', // project files
    './node_modules/@dazzxq/td-components/src/**/*.js', // component library
  ]
}
```

**Nếu không:** Tailwind purge sẽ remove classes mà components dùng → components render nhưng không có style.

README phải document rõ bước này.

## 6. Folder Structure (Final)

```
td-components/
├── package.json
├── index.js                    # re-exports all + registers
├── tailwind.config.js          # dev/storybook only
├── README.md
├── .storybook/
│   ├── main.js
│   └── preview.js
├── src/
│   ├── base/
│   │   └── td-base-element.js  # base class
│   ├── utils/
│   │   ├── dom.js              # positioning, focus trap helpers
│   │   ├── escape.js           # escapeHtml
│   │   └── datetime.js         # (phase 2)
│   ├── form/                   # (phase 2)
│   │   ├── toggle/
│   │   ├── button/
│   │   └── ...
│   ├── feedback/               # (phase 3)
│   │   ├── modal/
│   │   └── ...
│   ├── display/                # (phase 4)
│   │   ├── table/
│   │   └── ...
│   └── styles/
│       └── tailwind.css        # @tailwind directives for dev
└── .planning/                  # GSD planning docs
```

## 7. Sample Component for Validation

Phase 1 cần ít nhất 1 sample component để validate architecture works end-to-end:
- TdBaseElement → extend → render → Storybook → import from package

Recommend: viết 1 `td-sample` component đơn giản (hello world with attribute) để test pipeline. Xóa sau khi Phase 2 có components thật.

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Storybook 8 không render Web Components đúng | Dùng @storybook/web-components-vite (official support) |
| Tailwind classes bị purge trong Storybook | Import tailwind.css trong preview.js + content config |
| Base class quá phức tạp | Giữ < 150 lines, chỉ lifecycle + cleanup + attribute sync |
| exports map sai path | Test với `npm pack` + install local trước khi push |
