# Phase 5: Tailwind v4 Migration - Context

**Gathered:** 2026-04-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Complete the Tailwind v3 → v4 migration. Project already has v4 deps installed (@tailwindcss/postcss@4.2.2, tailwindcss@4.2.2) and v4 CSS entry point (@import "tailwindcss"). This phase removes v3 remnants (tailwind.config.js), updates peerDependencies, verifies all components work with v4, updates Storybook config, and updates README for consumers.

</domain>

<decisions>
## Implementation Decisions

### Config Approach
- **D-01:** Xóa `tailwind.config.js` hoàn toàn. Project không có custom theme nên không cần migrate config — chỉ cần xóa file. CSS-based config (@theme) nếu cần thêm sau.
- **D-02:** `postcss.config.js` giữ nguyên — đã đúng v4 format (`@tailwindcss/postcss`).

### Content Detection
- **D-03:** Dùng v4 automatic content detection (mặc định). Không cần `@source` directive vì tất cả Tailwind classes nằm trong `src/**/*.js` — v4 tự quét được.

### Class Compatibility
- **D-04:** Giữ nguyên `ring-offset-1` trong `td-button.js` và `td-empty-state.js`. Class này vẫn hoạt động trong v4. Không đổi sang outline — giảm risk, đổi sau nếu cần.
- **D-05:** Không có class nào khác bị break. Components chỉ dùng Tailwind class names inline (không @apply, không theme()) nên migration rất an toàn.

### Peer Dependencies & Consumer Impact
- **D-06:** Cập nhật peerDependencies từ `>=3.0.0` thành `>=4.0.0`. Library giờ chỉ hỗ trợ Tailwind v4+.
- **D-07:** Cập nhật README hướng dẫn consumers setup Tailwind v4 (cài @tailwindcss/postcss, sửa postcss config, CSS entry point).

### Claude's Discretion
- Storybook config adjustments nếu cần cho v4 compatibility
- devDependencies cleanup (xóa autoprefixer nếu không cần — v4 tự handle)
- Thứ tự các bước migration để đảm bảo không break giữa chừng

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Config
- `tailwind.config.js` — File cần xóa (v3 config)
- `postcss.config.js` — PostCSS config đã v4 (giữ nguyên)
- `src/styles/tailwind.css` — CSS entry point (đã v4 syntax)
- `package.json` — peerDependencies cần update
- `.storybook/main.js` — Storybook config
- `.storybook/preview.js` — Imports tailwind.css

### Components using ring-offset (verify still works)
- `src/form/td-button.js:170` — `focus-visible:ring-offset-1`
- `src/display/td-empty-state.js:136` — `focus:ring-offset-1`

### README
- `README.md` — Consumer documentation cần update

</canonical_refs>

<code_context>
## Existing Code Insights

### Current Tailwind Setup (Mixed v3/v4)
- `@tailwindcss/postcss@4.2.2` already installed (v4 PostCSS plugin)
- `tailwindcss@4.2.2` already installed
- `postcss.config.js` uses `@tailwindcss/postcss` (v4 correct)
- `src/styles/tailwind.css` uses `@import "tailwindcss"` (v4 correct)
- `tailwind.config.js` still exists with v3 format (needs removal)
- `autoprefixer` in devDependencies — v4 includes this, may be removable

### Component Tailwind Usage Pattern
- All 22+ components use Tailwind classes as inline template strings
- No `@apply` directives anywhere in source
- No `theme()` function calls
- `backdrop-filter` used via inline styles (not Tailwind classes) in modal, toast, tooltip, button, dropdown
- SVG `fill`, `stroke` attributes are SVG native, not Tailwind classes

### Storybook
- `@storybook/web-components-vite@8.6.14` — Vite-based, should work with v4
- `preview.js` imports `tailwind.css` — this is the CSS entry point

</code_context>

<specifics>
## Specific Ideas

No specific requirements — straightforward cleanup migration. Focus on not breaking anything.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 05-tailwind-v4-migration*
*Context gathered: 2026-04-04*
