# Architecture Research

**Domain:** Shared Web Components UI Library (no Shadow DOM, Tailwind CSS)
**Researched:** 2026-03-31
**Confidence:** HIGH

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      Consumer Projects                          │
│  (Laravel/Blade, SPA, any HTML page with Tailwind + bundler)    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                     Entry Point (index.js)                      │
│          Named exports + customElements.define() calls          │
│                                                                 │
├─────────────┬───────────────┬──────────────┬────────────────────┤
│             │               │              │                    │
│  ┌──────────┴──────────┐  ┌─┴────────┐  ┌──┴─────────┐         │
│  │  Complex Components │  │  Simple  │  │  Compound  │         │
│  │  (modal, dropdown,  │  │ (toggle, │  │  (table +  │         │
│  │   notification)     │  │  button, │  │  pagination │         │
│  │                     │  │  checkbox)│  │  + empty)  │         │
│  └──────────┬──────────┘  └─┬────────┘  └──┬─────────┘         │
│             │               │              │                    │
├─────────────┴───────────────┴──────────────┴────────────────────┤
│                                                                 │
│                       TdBaseElement                              │
│        (extends HTMLElement, shared lifecycle, rendering,        │
│         attribute parsing, event emission, cleanup)              │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                     Shared Utilities                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │  utils   │  │  dom     │  │  events  │  │  styles  │        │
│  │(debounce,│  │(position,│  │(emit,    │  │(inject   │        │
│  │ format,  │  │ viewport,│  │ cleanup) │  │ keyframe)│        │
│  │ escape)  │  │ focus)   │  │          │  │          │        │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| `TdBaseElement` | Shared lifecycle, attribute observation, render/update cycle, cleanup tracking, event emission | Extends `HTMLElement`, overridden by each component |
| Simple Components | Self-contained UI with no child components | Single custom element, renders HTML into light DOM |
| Complex Components | Multi-part UI with state machines, external interactions | Custom element composing inner elements, manages global listeners |
| Compound Components | Orchestrate multiple child components | Custom element that instantiates and wires child component elements |
| Shared Utilities | Pure functions, DOM helpers, style injection | ES Module exports, no DOM coupling |
| Entry Point | Registration and tree-shakeable exports | `customElements.define()` calls + re-exports |

## Recommended Project Structure

```
src/
├── base/                       # Base class and core abstractions
│   └── td-base-element.js      # Base class extending HTMLElement
│
├── components/                  # All component implementations
│   ├── button/
│   │   ├── td-button.js         # Component class
│   │   └── td-button.stories.js # Storybook story
│   ├── toggle/
│   │   ├── td-toggle.js
│   │   └── td-toggle.stories.js
│   ├── checkbox/
│   │   ├── td-checkbox.js
│   │   └── td-checkbox.stories.js
│   ├── input-field/
│   │   ├── td-input-field.js
│   │   └── td-input-field.stories.js
│   ├── slider/
│   │   ├── td-slider.js
│   │   └── td-slider.stories.js
│   ├── dropdown/
│   │   ├── td-dropdown.js
│   │   └── td-dropdown.stories.js
│   ├── tabs/
│   │   ├── td-tabs.js
│   │   └── td-tabs.stories.js
│   ├── modal/
│   │   ├── td-modal.js          # Modal element
│   │   ├── modal-stack.js       # Stack manager (internal)
│   │   └── td-modal.stories.js
│   ├── toast/
│   │   ├── td-toast.js
│   │   └── td-toast.stories.js
│   ├── tooltip/
│   │   ├── td-tooltip.js
│   │   └── td-tooltip.stories.js
│   ├── loading/
│   │   ├── td-loading.js
│   │   └── td-loading.stories.js
│   ├── table/
│   │   ├── td-table.js
│   │   └── td-table.stories.js
│   ├── pagination/
│   │   ├── td-pagination.js
│   │   └── td-pagination.stories.js
│   ├── empty-state/
│   │   ├── td-empty-state.js
│   │   └── td-empty-state.stories.js
│   ├── datetime/
│   │   ├── td-datetime.js
│   │   └── td-datetime.stories.js
│   ├── notification/
│   │   ├── td-notification.js
│   │   └── td-notification.stories.js
│   ├── action-buttons/
│   │   ├── td-action-buttons.js
│   │   └── td-action-buttons.stories.js
│   ├── media-picker/
│   │   ├── td-media-picker.js
│   │   └── td-media-picker.stories.js
│   └── post-card/
│       ├── td-post-card.js
│       └── td-post-card.stories.js
│
├── utils/                       # Shared utility functions
│   ├── dom.js                   # DOM helpers (positioning, viewport, focus trap)
│   ├── events.js                # Event emission helpers
│   ├── format.js                # Date, number, file size formatting
│   ├── string.js                # Slug generation, HTML escaping, Vietnamese utils
│   ├── color.js                 # Accessible text color, contrast ratio
│   ├── style.js                 # Style injection, keyframe management
│   └── api.js                   # API response handling, CSRF
│
├── index.js                     # Main entry: define all elements + re-export classes
└── define.js                    # Auto-registration (import for side effects only)

.storybook/                      # Storybook configuration
├── main.js
├── preview.js
└── preview-head.html            # Tailwind CSS link

package.json
```

### Structure Rationale

- **`base/`:** Isolated base class makes it clear what every component inherits. Single file because one base class is enough for this library size.
- **`components/{name}/`:** One folder per component co-locates implementation and story. No deeper nesting (no atoms/molecules/organisms). The folder name matches the tag name minus prefix (e.g., `button/` for `<td-button>`). This keeps component count flat and discoverable.
- **`utils/`:** Pure functions split by domain. Components import only what they need. No circular dependencies since utils never import components.
- **`index.js` vs `define.js`:** `index.js` exports classes without registering -- consumers who want to extend or test without side effects import from here. `define.js` calls `customElements.define()` for all components -- consumers who want drop-in registration import this.
- **Stories co-located:** Each component folder contains its own `.stories.js`. This keeps stories close to the source and makes it obvious when a story is missing.

## Architectural Patterns

### Pattern 1: TdBaseElement Base Class

**What:** A shared base class extending `HTMLElement` that standardizes lifecycle, attribute handling, rendering, and cleanup across all components.
**When to use:** Every component in the library extends this.
**Trade-offs:** Adds one layer of indirection but eliminates massive duplication of lifecycle boilerplate. Without it, each component independently manages `connectedCallback`, attribute parsing, event cleanup -- inviting inconsistency.

**Example:**
```javascript
// src/base/td-base-element.js

export class TdBaseElement extends HTMLElement {
  // Track event listeners for auto-cleanup
  _listeners = [];
  _initialized = false;

  // Subclasses override to declare observed attributes
  static get observedAttributes() {
    return [];
  }

  connectedCallback() {
    if (!this._initialized) {
      this._initialized = true;
      this.init();
    }
    this.render();
    this.afterRender();
  }

  disconnectedCallback() {
    this.cleanup();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue !== newValue && this._initialized) {
      this.onAttributeChanged(name, oldValue, newValue);
    }
  }

  // Subclass hooks
  init() {}           // One-time setup (parse initial attributes, etc.)
  render() {}         // Build/rebuild DOM content
  afterRender() {}    // Post-render setup (event listeners, etc.)
  onAttributeChanged(name, oldValue, newValue) {
    this.render();    // Default: re-render on attribute change
  }

  // Helper: track event listeners for auto-cleanup
  on(target, event, handler, options) {
    target.addEventListener(event, handler, options);
    this._listeners.push({ target, event, handler, options });
  }

  // Helper: emit custom event that bubbles
  emit(eventName, detail = {}) {
    this.dispatchEvent(new CustomEvent(eventName, {
      bubbles: true,
      composed: false,  // No Shadow DOM, no need to cross boundaries
      detail
    }));
  }

  // Auto-cleanup all tracked listeners
  cleanup() {
    this._listeners.forEach(({ target, event, handler, options }) => {
      target.removeEventListener(event, handler, options);
    });
    this._listeners = [];
  }

  // Helper: get attribute as specific type
  getAttr(name, fallback = null) {
    return this.getAttribute(name) ?? fallback;
  }

  getBoolAttr(name) {
    return this.hasAttribute(name);
  }

  getNumberAttr(name, fallback = 0) {
    const val = this.getAttribute(name);
    return val !== null ? Number(val) : fallback;
  }

  getJsonAttr(name, fallback = null) {
    try {
      return JSON.parse(this.getAttribute(name));
    } catch {
      return fallback;
    }
  }
}
```

### Pattern 2: Attribute-Driven Configuration with Programmatic Override

**What:** Components accept configuration through HTML attributes for declarative usage, but also expose a programmatic API via properties and methods for dynamic scenarios.
**When to use:** Every component. Attributes for static/Blade templates, properties for JavaScript-driven UIs.
**Trade-offs:** Dual API means slightly more code in each component, but it matches how Web Components are actually used. HTML-first for simple cases, JS for complex ones.

**Example:**
```html
<!-- Declarative (Blade template) -->
<td-toggle label="Dark mode" checked size="md" color="#4ADE80"></td-toggle>

<!-- Programmatic -->
<script>
  const toggle = document.querySelector('td-toggle');
  toggle.checked = true;  // Property setter triggers re-render
  toggle.addEventListener('td-change', (e) => {
    console.log(e.detail.checked);
  });
</script>
```

```javascript
// Inside td-toggle.js
class TdToggle extends TdBaseElement {
  static get observedAttributes() {
    return ['checked', 'label', 'size', 'color', 'disabled'];
  }

  get checked() {
    return this.getBoolAttr('checked');
  }
  set checked(val) {
    if (val) this.setAttribute('checked', '');
    else this.removeAttribute('checked');
  }

  onAttributeChanged() {
    this.render();
  }

  render() {
    // Build toggle UI using this.checked, this.getAttr('label'), etc.
  }
}
```

### Pattern 3: Event-Based Inter-Component Communication

**What:** Components communicate through custom DOM events (not direct method calls or shared state). Parent components listen for child events. Siblings communicate through a common ancestor or document-level events.
**When to use:** Whenever components need to coordinate (e.g., table emits `td-sort`, parent handler fetches new data and sets attributes back on table).
**Trade-offs:** Loose coupling is great for reusability but requires event naming conventions and documentation. No global event bus needed for this library size.

**Event naming convention:** `td-{action}` (e.g., `td-change`, `td-select`, `td-close`, `td-sort`, `td-page-change`).

**Example:**
```javascript
// Table emits sort event
this.emit('td-sort', { key: 'name', direction: 'asc' });

// Consumer listens
document.querySelector('td-table').addEventListener('td-sort', (e) => {
  fetchData({ sort: e.detail.key, order: e.detail.direction });
});
```

### Pattern 4: Singleton Services for Global Concerns

**What:** Modal stack management, toast container, tooltip system, and loading overlay are singletons -- only one instance exists in the page. These are implemented as modules with module-level state rather than per-instance state.
**When to use:** Components that manage page-level overlays, stacking context, or global state.
**Trade-offs:** Singletons are harder to test in isolation but match the reality of how overlays work in a browser.

**Example:**
```javascript
// modal-stack.js -- module-level singleton state
let stack = [];
const BASE_Z = 9999;
const Z_STEP = 100;

export function push(modal) { /* ... */ }
export function pop() { /* ... */ }
export function getTop() { return stack[stack.length - 1] ?? null; }
```

### Pattern 5: Light DOM Rendering with Tailwind

**What:** Components render directly into the light DOM (no Shadow DOM). All styling uses Tailwind utility classes from the host page. Custom CSS (animations, keyframes) uses `td-` prefixed class names injected via `<style>` tags.
**When to use:** Every component in this library.
**Trade-offs:** No style encapsulation -- component CSS could theoretically be overridden by host page styles. This is actually a feature (easy theming) but requires discipline with class naming. The `td-` prefix for custom classes prevents conflicts.

**Example:**
```javascript
render() {
  this.innerHTML = `
    <label class="flex items-center gap-3 cursor-pointer">
      <div class="td-toggle-track relative inline-block w-12 h-6 rounded-full
                  transition-colors duration-300 ${this.checked ? 'bg-green-400' : 'bg-gray-200'}">
        <div class="td-toggle-thumb absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full
                    shadow-md transition-transform duration-300
                    ${this.checked ? 'translate-x-6' : ''}">
        </div>
      </div>
      ${this.getAttr('label') ? `<span class="text-sm font-medium text-gray-700">${this.getAttr('label')}</span>` : ''}
    </label>
  `;
}
```

For animations and CSS that Tailwind cannot express:
```javascript
// Injected once per component type, not per instance
const STYLE_ID = 'td-toggle-styles';
if (!document.getElementById(STYLE_ID)) {
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .td-toggle-thumb {
      transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
  `;
  document.head.appendChild(style);
}
```

## Data Flow

### Attribute/Property Flow (Primary)

```
[HTML Attribute or JS Property]
    |
    v
[attributeChangedCallback / property setter]
    |
    v
[render()] -- rebuilds component innerHTML
    |
    v
[afterRender()] -- attaches event listeners
    |
    v
[User Interaction]
    |
    v
[emit('td-{event}', detail)] -- bubbles up to consumer
    |
    v
[Consumer handler] -- may set new attributes back on component
```

### Modal/Toast/Overlay Flow (Singleton)

```
[Consumer Code]
    |
    v
[<td-modal>.show() or TdModal.open({...})]
    |
    v
[ModalStack.push()] -- assigns z-index, locks body scroll
    |
    v
[Modal DOM injected into document.body]
    |
    v
[User closes]
    |
    v
[ModalStack.pop()] -- recalculates z-indices, unlocks scroll
    |
    v
[emit('td-close', { confirmed: true/false })]
```

### Table + Pagination Compound Flow

```
[<td-table> receives data/columns attributes]
    |
    v
[Renders <table> + instantiates <td-pagination> internally]
    |
    v
[User clicks sort header]
    |
    v
[Client mode: sort locally, re-render]
[Server mode: emit 'td-sort', consumer fetches, sets new data]
    |
    v
[User clicks pagination]
    |
    v
[Client mode: slice data, re-render]
[Server mode: emit 'td-page-change', consumer fetches, sets new data]
```

### Key Data Flows

1. **Attribute-to-render:** Consumer sets HTML attributes or JS properties -> component re-renders. This is the primary data flow for all components.
2. **Event-to-consumer:** User interacts with component -> component emits custom event -> consumer handles event and may update attributes in response.
3. **Singleton overlay management:** Modal/toast/tooltip/loading manage their own DOM nodes appended to `document.body`, coordinated through module-level singleton state (stack manager, container element).
4. **Component composition:** Compound components (table, modal with buttons) instantiate child components internally. Children communicate back to parent via events, not direct method calls.

## Component Dependency Graph and Build Order

Understanding which components depend on which others is critical for phasing the build correctly. This is derived from actual `import` analysis of the DCMS source.

### Dependency Map

```
INDEPENDENT (no component dependencies):
  utils (pure functions)
  empty-state
  button
  toggle
  checkbox
  input-field
  slider
  tabs
  loading
  pagination

DEPENDS ON utils:
  tooltip (uses Utils.getAccessibleTextColor)
  action-buttons (uses Utils for clipboard)

DEPENDS ON other components:
  toast -> modal-stack (reads stack for z-index calculation)
  modal -> modal-stack, button, dropdown (uses Button.create for dialog buttons)
  action-buttons -> utils, toast (shows toast on copy)
  table -> pagination, empty-state
  notification -> toast (via window.DCMS.Toast for feedback)

INTERNAL:
  modal-stack (not a visible component, internal singleton)
```

### Suggested Build Order

```
Phase 1: Foundation
  base/td-base-element.js
  utils/ (all utility modules)
  Storybook setup

Phase 2: Independent Simple Components (no dependencies)
  td-button
  td-toggle
  td-checkbox
  td-input-field
  td-slider
  td-empty-state
  td-loading
  td-tabs
  td-pagination

Phase 3: Dependent Components
  td-tooltip (depends: utils)
  td-toast (depends: modal-stack for z-index)
  td-dropdown (standalone but complex -- keyboard nav, positioning)
  td-modal + modal-stack (depends: button, dropdown)

Phase 4: Compound Components
  td-table (depends: pagination, empty-state)
  td-action-buttons (depends: utils, toast)
  td-datetime

Phase 5: Application-Specific Components
  td-notification (depends: toast, API integration)
  td-media-picker (depends: modal, potentially external services)
  td-post-card (display component, may depend on several others)
```

**Phase ordering rationale:**
- Phase 1 must come first because every component inherits from `TdBaseElement` and uses utilities. The base class pattern and conventions established here define the entire library's API surface.
- Phase 2 components are independent -- they can be built and tested in any order within the phase. Starting with these validates the base class design with real components.
- Phase 3 introduces cross-component dependencies. Modal is the most complex and depends on button + dropdown, so those must exist first.
- Phase 4 components compose Phase 2/3 components. Table needs pagination and empty-state.
- Phase 5 components are application-specific and may need revisiting based on how consumer projects actually use them.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1-5 projects using library | Single package from GitHub is fine. No versioning pressure. |
| 5-20 projects | Pin to git tags/commits for stability. Consider semver. |
| 20+ projects | Publish to npm registry. Consider tree-shaking per-component imports. |

### Scaling Priorities

1. **First concern (now):** Ensure each component is independently importable. `import { TdButton } from 'td-components/components/button/td-button.js'` should work alongside `import 'td-components'` (which registers everything).
2. **Second concern (later):** Bundle size. With 22 components, the full bundle is manageable. If a consumer only needs 3 components, per-component imports avoid loading the other 19.

## Anti-Patterns

### Anti-Pattern 1: innerHTML on Every Re-render Without Diffing

**What people do:** Set `this.innerHTML = '...'` in `render()`, destroying and recreating all DOM nodes including event listeners.
**Why it's wrong:** Destroys focus state, kills in-flight animations, detaches event listeners that were bound to child elements after the previous render.
**Do this instead:** For simple components where re-render is infrequent (toggle, checkbox), `innerHTML` is fine -- just re-bind listeners in `afterRender()`. For complex components that update frequently (table sorting, dropdown filtering), update specific DOM nodes rather than replacing the entire tree. Use a `_dirty` flag pattern: only re-render when attributes actually changed.

### Anti-Pattern 2: Global Event Listeners Without Cleanup

**What people do:** Add `document.addEventListener('click', ...)` in `connectedCallback` and forget to remove it in `disconnectedCallback`.
**Why it's wrong:** Memory leaks. If a component is added/removed from DOM multiple times, listeners pile up. The DCMS codebase has this exact problem listed as a motivation for migration.
**Do this instead:** Use the base class `this.on(target, event, handler)` pattern that tracks all listeners. `disconnectedCallback` calls `this.cleanup()` automatically. For listeners that should only exist while open (like dropdown's click-outside), add in `open()` and remove in `close()`.

### Anti-Pattern 3: Direct Component-to-Component Method Calls

**What people do:** `document.querySelector('td-modal').closeAll()` from inside another component.
**Why it's wrong:** Creates tight coupling. Component A needs to know Component B exists and its API. Makes both harder to test and reuse independently.
**Do this instead:** Emit events. If a dropdown needs to close when a modal opens, the modal emits `td-modal-open` and the dropdown listens for it. Or better: let the consumer wire this behavior.

### Anti-Pattern 4: Injecting <style> Per Instance

**What people do:** Create a new `<style>` element for every component instance (the DCMS toggle and checkbox do this -- one `<style>` per toggle/checkbox).
**Why it's wrong:** 50 checkboxes = 50 `<style>` tags in `<head>`. Each has unique class names, making it impossible to share styles.
**Do this instead:** Inject styles once per component type using an ID check: `if (!document.getElementById('td-toggle-styles')) { ... }`. For per-instance color variations, use CSS custom properties: `style="--td-toggle-color: #4ADE80"` and reference in the shared stylesheet as `var(--td-toggle-color, #4ADE80)`.

### Anti-Pattern 5: Factory Methods Instead of Custom Elements

**What people do:** `Toggle.create({ ... })` returns a DOM element. Consumer appends it manually. The DCMS codebase uses this pattern for every component.
**Why it's wrong for Web Components:** Loses the key benefit of custom elements -- declarative HTML usage. Cannot be used in Blade templates as `<td-toggle>`. No lifecycle management. No attribute observation.
**Do this instead:** Define as custom elements (`customElements.define('td-toggle', TdToggle)`). Support both declarative (`<td-toggle checked>`) and programmatic (`document.createElement('td-toggle')`). The factory pattern can remain as a convenience static method, but the primary API is the HTML element itself.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Tailwind CSS | Peer dependency, classes used directly in component templates | Host page must have Tailwind configured. Components use Tailwind classes in light DOM. |
| Font Awesome | Peer dependency for icon support | Some components (action-buttons, empty-state, tabs) reference FA icon classes. Consider making icons configurable via slots or attributes. |
| Storybook | Dev dependency for component development/testing | Storybook must load Tailwind CSS in preview. Stories co-located with components. |
| Host page CSS | Light DOM means host styles apply | `td-` prefix on custom classes prevents conflicts. No encapsulation by design. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Component <-> Consumer | HTML attributes (down) + Custom events (up) | Primary integration contract. Attributes for config, events for feedback. |
| Component <-> Component (sibling) | Events through DOM (bubbling) or consumer-mediated | Components should not reach across to siblings directly. |
| Component <-> Singleton Service | Module imports (modal-stack, toast container) | Internal implementation detail. Singletons manage page-level concerns. |
| Component <-> Base Class | Class inheritance | All components extend TdBaseElement. Base handles lifecycle, cleanup, attribute parsing. |
| Library <-> Bundler | ES Modules, `package.json` exports field | Consumers import via ES Modules. Vite/Webpack/Rollup handle bundling. No runtime build step. |

## Key Architecture Decisions

| Decision | Rationale |
|----------|-----------|
| Light DOM only | Tailwind classes must cascade from host page. Shadow DOM blocks this. No workarounds needed. |
| Single base class, not Lit | Lit adds ~5KB and Shadow DOM conventions. This library is 22 components by one developer. Raw `HTMLElement` extension is simpler and has zero dependencies. |
| Flat component folders, not atomic design | Solo dev, 22 components. Three levels of nesting (atoms/molecules/organisms) is overhead. One folder per component is discoverable. |
| CSS custom properties for per-instance theming | Avoids injecting `<style>` per instance. One shared stylesheet per component type, instances vary via `--td-*` variables. |
| Module-level singletons for overlays | Modal stack, toast container, tooltip are page-level concerns. Class-level static state or module state is the right scope. |
| Attribute + property dual API | Attributes for Blade/HTML templates (declarative), properties for JS (programmatic). Both trigger re-render. |

## Sources

- MDN Web Docs: [Using custom elements](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_custom_elements) -- lifecycle callbacks, observedAttributes, best practices
- [You can use Web Components without the shadow DOM](https://chromamine.com/2024/10/you-can-use-web-components-without-the-shadow-dom/) -- Light DOM patterns
- [The Shadow DOM is an antipattern](https://gomakethings.com/the-shadow-dom-is-an-antipattern/) -- Arguments for light DOM approach
- [Handy Custom Elements' Patterns](https://gist.github.com/WebReflection/ec9f6687842aa385477c4afca625bbf4) -- Base class and event patterns
- [Plain Vanilla Components](https://plainvanillaweb.com/pages/components.html) -- Vanilla JS web component patterns
- DCMS source code analysis: `/Users/theduyet/Documents/Code/dcms2/resources/js/components/` -- 22 component files analyzed for dependency mapping and pattern extraction

---
*Architecture research for: td-components (Shared Web Components UI Library)*
*Researched: 2026-03-31*
