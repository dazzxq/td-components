# Phase 4: Display & Stories - Context

**Gathered:** 2026-04-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Migrate 4 display components (Table, Tabs, Pagination, Empty State) từ DCMS + viết Storybook stories cho tất cả feedback components (Modal, Toast, Tooltip, Loading) chưa có stories từ Phase 3. Wire exports. Final phase.

</domain>

<decisions>
## Implementation Decisions

### Display Components
- **D-01:** Table — extends TdBaseElement. Data qua JS property (`el.data = [{...}]`, `el.columns = [{...}]`). Sort callback qua JS property. Pagination tích hợp trong component (không dùng td-pagination riêng).
- **D-02:** Tabs — extends TdBaseElement. Tabs config qua JS property hoặc child elements. Icon + label, 2 sizes.
- **D-03:** Pagination — extends TdBaseElement. Standalone component (dùng được riêng, không chỉ trong Table). Page nav, ellipsis, info text, custom active color qua attribute.
- **D-04:** Empty State — extends TdBaseElement. Icon/title/message qua attributes. Action buttons qua slots hoặc JS property. 3 sizes, compact mode.

### Stories for Feedback Components
- **D-05:** Viết Storybook stories cho: Modal (show variants, confirm dialog, stacked), Toast (4 variants), Tooltip (positions, colors), Loading (fullscreen, inline spinner). Mỗi component ít nhất 3 story variants.
- **D-06:** Composition stories — ít nhất 1 story kết hợp components: Modal chứa Dropdown, Toast sau form submit, Table với Pagination.

### Claude's Discretion
- Table: sort indicator style (arrow SVG hay text ▲▼)
- Table: skeleton loading implementation
- Tabs: child elements vs JS property cho tab definition
- Empty State: icon format (SVG string attribute hay slot)
- Story variant selection cho mỗi component

</decisions>

<canonical_refs>
## Canonical References

### Source Components (migrate from)
- `/Users/theduyet/Documents/Code/dcms2/resources/js/components/dcms-table.js`
- `/Users/theduyet/Documents/Code/dcms2/resources/js/components/dcms-tabs.js`
- `/Users/theduyet/Documents/Code/dcms2/resources/js/components/dcms-pagination.js`
- `/Users/theduyet/Documents/Code/dcms2/resources/js/components/dcms-empty-state.js`

### Existing Feedback Components (write stories for)
- `src/feedback/td-modal.js`
- `src/feedback/td-toast.js`
- `src/feedback/td-tooltip.js`
- `src/feedback/td-loading.js`

### Existing Code
- `src/base/td-base-element.js` — Base class
- `src/form/td-dropdown.js` — Reference for complex data property pattern

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- TdBaseElement, escapeHtml, all form + feedback components
- Dropdown pattern for JS property data input
- Existing story patterns from form components

### Integration Points
- `package.json` exports — add display component entries
- `index.js` — add re-exports
- `.storybook/` — stories auto-discovered

</code_context>

<specifics>
## Specific Ideas

No specific requirements — Claude decides implementation details based on DCMS source and established patterns.

</specifics>

<deferred>
## Deferred Ideas

None — final phase, discussion stayed within scope

</deferred>

---

*Phase: 04-display-stories*
*Context gathered: 2026-04-03*
