# Research Summary

**Domain:** Shared Web Components UI Library
**Date:** 2026-03-31

## Key Findings

### Stack
- **Web Components (Custom Elements v1)** — browser native, no framework dependency
- **Tailwind CSS** as peerDependency — giữ nguyên từ DCMS, host page cung cấp
- **Vanilla CSS + BEM `td-`** cho animations/keyframes ngoài Tailwind
- **Storybook 8.x** với `@storybook/web-components-vite` cho dev/test
- **ES Modules** — tree-shakeable, import granular
- **KHÔNG dùng:** Lit, Shadow DOM, TypeScript, SASS

### Table Stakes
- Base class `TdBaseElement` với lifecycle management và cleanup tracking
- 22 components migrate từ DCMS giữ nguyên functionality
- Storybook stories cho mỗi component
- Consistent API: attributes in, events out
- Granular import: `import 'td-components/toggle'`

### Architecture
- `TdBaseElement` extends `HTMLElement` — shared lifecycle, cleanup, attribute helpers
- Flat folder structure: `src/components/[name]/td-[name].js`
- Shared utilities: positioning, DOM helpers, escape HTML
- Entry point với tree-shakeable named exports

### Watch Out For
1. **Memory leaks** — `connectedCallback` chạy nhiều lần, event listeners duplicate → base class cần `_initialized` flag + cleanup tracking
2. **Tailwind purge** — consumer phải thêm component path vào `tailwind.config.js` content
3. **innerHTML XSS** — prefer DOM API cho user content, innerHTML chỉ cho static templates
4. **Attribute/property sync** — cần getter/setter cho mỗi observed attribute
5. **Over-engineering base class** — giữ minimal, thêm features khi ≥2 components cần

### Build Order (từ dependencies)
1. Base class + utilities + Storybook setup
2. Simple components (toggle, button, checkbox) — validate architecture
3. Form components (input-field, dropdown, slider)
4. Complex components (modal + stack, toast, tooltip, notification)
5. Display components (table, tabs, pagination, loading, empty-state)
6. Specialized (media-picker, action-buttons, post-card, datetime)
