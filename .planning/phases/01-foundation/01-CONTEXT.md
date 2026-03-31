# Phase 1: Foundation - Context

**Gathered:** 2026-03-31
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the foundation for td-components library: TdBaseElement base class, project structure with package.json exports, Storybook setup with Tailwind, and README documentation. This phase produces no end-user components — it produces the architecture that all subsequent components will use.

</domain>

<decisions>
## Implementation Decisions

### Base Class (TdBaseElement)
- **D-01:** Render bằng innerHTML — component override method `render()` trả về HTML string, base class gán vào `this.innerHTML`. Base class cung cấp `escapeHtml()` để chống XSS khi interpolate user data.
- **D-02:** Auto attribute/property sync — khai báo `static get observedAttributes()` return array, base class tự sinh getter/setter cho mỗi attribute. Component không cần viết boilerplate.
- **D-03:** Event listener cleanup qua `this.listen(target, event, handler)` — base class track tất cả listeners, tự remove trong `disconnectedCallback`. Cũng hỗ trợ `this.setTimeout()`, `this.setInterval()` với auto-cleanup.
- **D-04:** Full re-render khi attribute thay đổi — `attributeChangedCallback` gọi lại `this.render()`. Đơn giản, đủ performance cho UI components nhỏ-vừa.
- **D-05:** `_initialized` flag trong `connectedCallback` để tránh render trùng khi element bị move trong DOM.
- **D-06:** Auto-registration với collision check: `if (!customElements.get(tagName)) customElements.define(tagName, Class)`

### Naming Convention
- **D-07:** Tag prefix: `td-` → `<td-toggle>`, `<td-modal>`, `<td-button>`
- **D-08:** Class name: PascalCase với prefix Td → `TdToggle`, `TdModal`, `TdButton`
- **D-09:** File name: `td-[name].js` → `td-toggle.js`, `td-modal.js`
- **D-10:** CSS custom class: BEM với prefix `td-` → `td-toggle`, `td-toggle__thumb`, `td-toggle--checked`

### Package Structure
- **D-11:** Grouped folders theo chức năng: `src/form/`, `src/feedback/`, `src/display/`, `src/utils/`
- **D-12:** Mỗi component 1 folder chứa `.js` + `.stories.js`
- **D-13:** Import by name qua package.json exports: `import '@dazzxq/td-components/toggle'` map tới `./src/form/toggle/td-toggle.js`
- **D-14:** Tailwind là peerDependency — consumer phải thêm component path vào `tailwind.config.js` content

### Storybook
- **D-15:** CSF (Component Story Format) với plain HTML template strings — không dùng lit-html
- **D-16:** Addons: Controls, Actions, A11y, Viewport (tất cả mặc định + @storybook/addon-a11y)
- **D-17:** Tailwind CSS import trong `.storybook/preview.js` để styles hoạt động trong Storybook
- **D-18:** Mỗi component story có `tags: ['autodocs']` để tự sinh documentation

### Claude's Discretion
- CSS animation keyframes injection strategy (inject vào head hay inline)
- Base class có nên cung cấp `emit()` helper cho CustomEvent hay để component tự dispatch
- Storybook build config chi tiết (vite plugins, static assets)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

No external specs — requirements fully captured in decisions above. Reference codebase:

### Source Components (migrate from)
- `/Users/theduyet/Documents/Code/dcms2/resources/js/components/` — 22 original DCMS components to reference for functionality and behavior

### Research
- `.planning/research/ARCHITECTURE.md` — recommended project structure and base class design
- `.planning/research/PITFALLS.md` — critical pitfalls to avoid (connectedCallback duplication, Tailwind purge, innerHTML XSS)
- `.planning/research/STACK.md` — stack decisions (Storybook 8, @storybook/web-components-vite)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- DCMS `dcms-utils.js` — `escapeHtml()`, `debounce()`, `throttle()`, `formatDate()` có thể port sang `src/utils/`

### Established Patterns
- DCMS components dùng static class + factory method pattern — sẽ chuyển sang class extends TdBaseElement
- DCMS components dùng `window.DCMS` namespace — sẽ bỏ, thay bằng ES module exports + customElements.define

### Integration Points
- Package.json exports field cho granular import
- Tailwind config content path cho consumer projects

</code_context>

<specifics>
## Specific Ideas

- User là newbie về Web Components, cần architecture rõ ràng và dễ follow
- User muốn mọi thứ recommended và giải thích kỹ vì sao
- Tất cả Storybook testing addons nên được include

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-foundation*
*Context gathered: 2026-03-31*
