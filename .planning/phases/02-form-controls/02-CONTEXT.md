# Phase 2: Form Controls - Context

**Gathered:** 2026-04-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Migrate 6 form components (Toggle, Button, Checkbox, Input Field, Slider, Dropdown) và DateTime utility từ DCMS sang Web Components extending TdBaseElement. Port đủ features, không simplify. Mỗi component có Storybook story.

</domain>

<decisions>
## Implementation Decisions

### API Design
- **D-01:** Simple data qua HTML attributes (checked, disabled, label, size, color, variant). Complex data (dropdown options, table rows) qua JS property assignment: `el.options = [...]`
- **D-02:** Standard event names — 'change' cho form controls, 'click' cho button. Không prefix. Consumer lắng nghe như native HTML elements.
- **D-03:** Events dispatch qua `this.emit(name, detail)` từ TdBaseElement (đã implement Phase 1).

### Migration Scope
- **D-04:** Port đủ features từ DCMS — giữ nguyên tất cả functionality của component gốc. Chỉ đổi architecture (window.DCMS → Web Component).
- **D-05:** DateTime utility port nguyên — format tokens, relative time tiếng Việt, parse ISO/timestamp. Không thay bằng date-fns/dayjs.

### Styling & Customization
- **D-06:** Customization qua attributes — size='sm|md|lg', color='primary|danger|...', variant='outline|solid'. Component map attribute thành Tailwind classes tương ứng.
- **D-07:** Giữ Tailwind classes từ DCMS components gốc — đổi architecture không đổi visual.

### Component-Specific Notes (from DCMS analysis)
- **D-08:** Toggle — checked/disabled boolean attributes, 3 sizes, SVG icons, bounce animation, setColor() runtime
- **D-09:** Button — 6 preset variants (primary/secondary/success/danger/info/warning), custom color, icon left/right, loading state with spinner
- **D-10:** Checkbox — custom SVG checkmark, 3 sizes, custom color, dynamic style injection
- **D-11:** Input Field — text/password/email/tel/number/textarea/contenteditable, character/word counter, label, error/helper text, validation
- **D-12:** Slider — range with step marks, value label, touch support, glass gradient styling
- **D-13:** Dropdown — searchable, keyboard nav (arrow/enter/escape), auto-position (above/below), RAF-throttled scroll, clear button, close on outside click
- **D-14:** DateTime — format (YYYY/MM/DD/HH/mm/ss/A tokens), relative time Vietnamese ("Vừa xong", "X phút trước"), parse ISO/Unix/Date

### Claude's Discretion
- Dropdown positioning utility (reuse from DCMS or write fresh)
- Dynamic style injection strategy for per-instance custom colors (Toggle, Checkbox)
- Whether to split Dropdown into sub-components or keep monolithic

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Source Components (migrate from — READ THESE for feature parity)
- `/Users/theduyet/Documents/Code/dcms2/resources/js/components/dcms-toggle.js` — Toggle source (214 lines)
- `/Users/theduyet/Documents/Code/dcms2/resources/js/components/dcms-button.js` — Button source (677 lines)
- `/Users/theduyet/Documents/Code/dcms2/resources/js/components/dcms-checkbox.js` — Checkbox source (188 lines)
- `/Users/theduyet/Documents/Code/dcms2/resources/js/components/dcms-input-field.js` — Input Field source (633 lines)
- `/Users/theduyet/Documents/Code/dcms2/resources/js/components/dcms-slider.js` — Slider source (413 lines)
- `/Users/theduyet/Documents/Code/dcms2/resources/js/components/dcms-dropdown.js` — Dropdown source (614 lines)
- `/Users/theduyet/Documents/Code/dcms2/resources/js/components/dcms-datetime.js` — DateTime source (300+ lines)

### Base Class (extend from)
- `src/base/td-base-element.js` — TdBaseElement with lifecycle, cleanup, attribute sync, emit, escapeHtml

### Phase 1 Context (architecture decisions — ALREADY LOCKED)
- `.planning/phases/01-foundation/01-CONTEXT.md` — All D-01~D-18 decisions

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `TdBaseElement` — extend for all components (lifecycle, cleanup, attribute sync, emit)
- `src/utils/escape.js` — escapeHtml() for XSS prevention in innerHTML
- `td-sample` — reference implementation showing how to extend TdBaseElement

### Established Patterns (from Phase 1)
- Render: override `render()` return HTML string, base calls `this.innerHTML = this.render()`
- Events: `this.listen(target, event, handler)` for auto-cleanup
- Attributes: `static get observedAttributes()` + `static get booleanAttributes()`
- Registration: `if (!customElements.get('td-xxx')) customElements.define('td-xxx', TdXxx)`
- Stories: CSF + plain HTML template strings, `tags: ['autodocs']`

### Integration Points
- `package.json` exports map — add entry per component
- `index.js` — add re-export per component
- `.storybook/` — stories auto-discovered from `src/**/*.stories.js`

</code_context>

<specifics>
## Specific Ideas

- Port 1:1 từ DCMS — downstream agents PHẢI đọc source DCMS component để hiểu full feature set
- User là newbie, muốn giải thích kỹ và recommend tối ưu

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-form-controls*
*Context gathered: 2026-04-02*
