# Phase 3: Feedback & Overlay - Context

**Gathered:** 2026-04-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Migrate 4 feedback/overlay components (Modal + Stack Manager, Toast, Tooltip, Loading) từ DCMS. These are NOT standard Web Components with HTML tags — they use JS API patterns (static methods, auto-init). Port đủ features từ DCMS.

</domain>

<decisions>
## Implementation Decisions

### Modal API
- **D-01:** JS API, không dùng HTML tag. `TdModal.confirm({title, content, onConfirm})` tạo modal, append vào body, remove khi đóng. Giống DCMS.
- **D-02:** Promise-based API song song với callback: `const ok = await TdModal.confirm({...})`
- **D-03:** Modal Stack Manager quản lý z-index stacking, backdrop opacity, body scroll lock. Port nguyên từ DCMS.
- **D-04:** Focus trap — tab wrapping trong modal, auto-focus first input hoặc focusTarget.
- **D-05:** Entrance/exit animation (scale + opacity) qua requestAnimationFrame.

### Toast API
- **D-06:** Static methods: `TdToast.success(msg)`, `.error()`, `.warning()`, `.info()`. Không dùng HTML tag.
- **D-07:** Toast container tự tạo khi gọi lần đầu (fixed top-right).
- **D-08:** Max 5 visible, FIFO eviction. Auto-dismiss với configurable duration. Click to dismiss.
- **D-09:** Dynamic z-index — luôn trên modal stack.

### Tooltip API
- **D-10:** Auto-init global singleton — import file là tự chạy. Mọi element có `data-tooltip` attribute sẽ có tooltip.
- **D-11:** Auto-positioning (top/bottom/left/right), arrow pointer, custom color qua `data-tooltip-color`.
- **D-12:** Internal movement detection — không hide khi di chuột trong button.

### Loading API
- **D-13:** Port nguyên từ DCMS — fullscreen overlay với glass effect + inline spinner (Google-style SVG).
- **D-14:** `TdLoading.show(msg)`, `TdLoading.hide()`. Auto-hide với maxDuration.

### Architecture Note
- Modal, Toast, Loading là utility classes với static methods — KHÔNG extend TdBaseElement (chúng không phải custom elements).
- Tooltip là global singleton, cũng không cần custom element — nhưng CÓ THỂ dùng TdBaseElement nếu muốn `<td-tooltip>` tag wrapper.
- Claude quyết định cách tốt nhất để structure.

### Claude's Discretion
- Modal/Toast/Loading: extend TdBaseElement hay standalone class
- Tooltip: custom element wrapper hay pure JS class
- Animation implementation details
- Z-index base values

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Source Components (migrate from — READ for feature parity)
- `/Users/theduyet/Documents/Code/dcms2/resources/js/components/dcms-modal.js` — Modal source
- `/Users/theduyet/Documents/Code/dcms2/resources/js/components/dcms-modal-stack.js` — Stack manager source
- `/Users/theduyet/Documents/Code/dcms2/resources/js/components/dcms-toast.js` — Toast source
- `/Users/theduyet/Documents/Code/dcms2/resources/js/components/dcms-tooltip.js` — Tooltip source
- `/Users/theduyet/Documents/Code/dcms2/resources/js/components/dcms-loading.js` — Loading source

### Existing Code (extend from)
- `src/base/td-base-element.js` — Base class (if applicable)
- `src/form/td-dropdown.js` — Reference for body-appended overlay pattern (dropdown menu)

### Prior Phase Context
- `.planning/phases/01-foundation/01-CONTEXT.md` — Architecture decisions
- `.planning/phases/02-form-controls/02-CONTEXT.md` — API patterns (events, attributes)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `TdBaseElement` — may or may not be used for these utility classes
- `src/utils/escape.js` — escapeHtml() for modal content
- Dropdown body-append pattern — reference for overlay positioning

### Established Patterns
- JS property for complex data (Phase 2 D-01)
- Standard event names (Phase 2 D-02)
- BEM prefix `td-` for custom CSS classes

### Integration Points
- `package.json` exports — add entry per component
- `index.js` — add re-export per component

</code_context>

<specifics>
## Specific Ideas

- Modal, Toast, Loading dùng JS API (static methods) — không phải HTML tags
- Tooltip auto-init khi import — data-tooltip attribute pattern
- Agents PHẢI đọc DCMS source cho feature parity

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-feedback-overlay*
*Context gathered: 2026-04-02*
