# Phase 5: Tailwind v4 Migration - Research

**Researched:** 2026-04-04
**Domain:** Tailwind CSS v3 to v4 migration
**Confidence:** HIGH

## Summary

The Tailwind v4 migration for td-components is largely complete at the infrastructure level -- `@tailwindcss/postcss@4.2.2` is installed, `postcss.config.js` uses the v4 plugin, and `src/styles/tailwind.css` uses `@import "tailwindcss"`. What remains is cleanup (removing `tailwind.config.js`, removing `autoprefixer`), fixing renamed utility classes in component source files, updating `peerDependencies`, and updating README for v4 consumer setup.

The codebase audit found several classes that changed meaning in v4: bare `rounded` (now smaller radius), `shadow-sm` (now a different shadow size), `border` without color (now currentColor instead of gray-200), and `focus:outline-none` (changed from transparent outline to no outline). These are subtle visual regressions that need explicit fixes. The `ring-offset-1` classes are confirmed safe per D-04.

**Primary recommendation:** Delete `tailwind.config.js`, fix the ~15 instances of renamed utility classes across component files, remove `autoprefixer` from devDependencies, update peerDependencies to `>=4.0.0`, update README with v4 consumer instructions including `@source` directive, and visually verify in Storybook.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Delete `tailwind.config.js` entirely. No custom theme to migrate -- just delete the file.
- **D-02:** Keep `postcss.config.js` as-is -- already v4 format (`@tailwindcss/postcss`).
- **D-03:** Use v4 automatic content detection. No `@source` directive needed for the library's own dev/Storybook usage.
- **D-04:** Keep `ring-offset-1` classes as-is in `td-button.js` and `td-empty-state.js`. They still work in v4.
- **D-05:** No `@apply` or `theme()` used anywhere -- safe migration.
- **D-06:** Update peerDependencies from `>=3.0.0` to `>=4.0.0`.
- **D-07:** Update README with v4 setup instructions for consumers.

### Claude's Discretion
- Storybook config adjustments if needed for v4 compatibility
- devDependencies cleanup (remove autoprefixer -- v4 handles it)
- Order of migration steps to ensure nothing breaks mid-way

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

## Architecture Patterns

### Migration Order (Safe Sequence)

The migration must follow this order to avoid breaking the build at any intermediate step:

1. **Fix renamed utility classes first** -- update class names in component source files so they produce correct visual output under v4
2. **Delete `tailwind.config.js`** -- v4 does not auto-detect JS config; since v4 deps are already installed and CSS entry point is v4, the JS config is ignored anyway
3. **Remove `autoprefixer` from devDependencies** -- v4 includes autoprefixer; also remove from postcss.config.js if referenced (it is NOT currently referenced)
4. **Update `package.json` peerDependencies** -- change `tailwindcss: ">=3.0.0"` to `tailwindcss: ">=4.0.0"`
5. **Update README** -- new consumer setup instructions with `@source` directive
6. **Visual verification in Storybook** -- run `npm run storybook` and check all components

### Recommended Project Structure (No changes needed)

The existing structure works perfectly with v4:
```
src/
  styles/
    tailwind.css          # Already v4: @import "tailwindcss"
postcss.config.js         # Already v4: @tailwindcss/postcss
.storybook/
  main.js                 # No changes needed
  preview.js              # Imports tailwind.css -- works as-is
```

### Anti-Patterns to Avoid
- **Do NOT run `npx @tailwindcss/upgrade`** -- the automated tool is designed for full projects; this library has a simple setup and manual changes are safer and more predictable
- **Do NOT add `@config` directive in CSS** -- there is no config to reference after deletion
- **Do NOT add `@source` in the library's own CSS** -- v4 auto-detects `src/**/*.js` files since they are not gitignored

## Utility Class Audit: Renamed/Changed Classes

### Classes That MUST Be Updated

Source: [Tailwind CSS Upgrade Guide](https://tailwindcss.com/docs/upgrade-guide)

| v3 Class | v4 Equivalent | Meaning Change | Files Affected |
|----------|---------------|----------------|----------------|
| `rounded` (bare) | `rounded-sm` | v3: 0.25rem, v4 `rounded`: 0.125rem | `td-sample.js:27`, `td-datetime-picker.js:205,210,215,218,254`, `td-table.js:227,235,236,247` |
| `shadow-sm` | `shadow-xs` | Shadow scale shifted down | `td-sample.js:23` |
| `border` (no color) | `border border-gray-200` | Default changed from gray-200 to currentColor | `td-sample.js:23` (only sample -- dropdown uses inline style override) |

**Confidence: HIGH** -- verified against official upgrade guide and cross-referenced with codebase grep.

### Classes That Are SAFE (No Change Needed)

| Class | Why Safe |
|-------|----------|
| `rounded-lg`, `rounded-xl`, `rounded-md`, `rounded-3xl`, `rounded-[20px]` | Suffixed sizes unchanged in v4 |
| `shadow-xl` | Suffixed sizes unchanged |
| `ring-offset-1` | Still works in v4 (per D-04) |
| `focus:ring-2`, `focus:ring-4` | Explicit width -- not affected by default ring width change (1px vs 3px) |
| `focus:ring-blue-500`, etc. | Explicit color -- not affected by default ring color change |
| `border border-gray-300`, etc. | Explicit color overrides v4 default |
| All opacity modifiers (`bg-black/5`, `border-white/50`) | v4 native syntax, not deprecated `bg-opacity-*` |

### `focus:outline-none` Assessment

Used in 9 locations across 4 components. In v3 this produced `outline: 2px solid transparent; outline-offset: 2px`. In v4 it produces `outline-style: none`. The v3 behavior is now `outline-hidden`.

**Decision needed:** Since all usages pair `focus:outline-none` with `focus:ring-*` (the ring provides the visual focus indicator), and the purpose is to suppress the browser's default outline, `outline-none` in v4 achieves the same user-visible result. **No change required.** The ring utility provides the visible focus indicator regardless.

**Confidence: HIGH** -- both `outline-none` (no outline at all) and `outline-hidden` (transparent outline) suppress the visible browser outline when paired with ring utilities.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Class name migration | Manual find-and-replace one by one | Systematic grep + targeted string replacements | Grep audit already done -- exact locations are known |
| Content detection config | Custom `@source` directives | v4 automatic detection | Library source is in `src/` which v4 auto-scans |
| Autoprefixing | Separate autoprefixer plugin | v4 built-in autoprefixing | v4 includes autoprefixer -- remove the dependency |

## Common Pitfalls

### Pitfall 1: Border Default Color Change
**What goes wrong:** `border` without a color class renders as `currentColor` (often black text color) instead of gray-200
**Why it happens:** v4 changed the default border color from `gray-200` to `currentColor` (browser default)
**How to avoid:** Add explicit `border-gray-200` to any bare `border` usage. Audit found only `td-sample.js` is affected (dropdown uses inline style override).
**Warning signs:** Borders appearing darker/thicker than expected in Storybook

### Pitfall 2: Rounded/Shadow Scale Shift
**What goes wrong:** `rounded` gives 0.125rem instead of 0.25rem; `shadow-sm` gives a different (larger) shadow
**Why it happens:** v4 shifted the scale: `rounded` -> `rounded-xs` value, old `rounded` is now `rounded-sm`
**How to avoid:** Replace `rounded` with `rounded-sm` and `shadow-sm` with `shadow-xs` to preserve v3 visual output
**Warning signs:** Subtle visual differences in border radius and shadow depth

### Pitfall 3: Consumer Setup Breaking Change
**What goes wrong:** Consumers who upgrade td-components but keep Tailwind v3 get no styles
**Why it happens:** peerDependencies changes to `>=4.0.0`, consumers need to also migrate to v4
**How to avoid:** README must clearly document the breaking change and provide step-by-step consumer migration instructions
**Warning signs:** Consumer projects rendering unstyled components after update

### Pitfall 4: Consumer Content Detection
**What goes wrong:** Consumers install td-components but Tailwind v4 does not scan `node_modules` -- component classes are purged
**Why it happens:** v4 automatic content detection excludes `node_modules` by default
**How to avoid:** README must instruct consumers to add `@source` directive:
```css
@import "tailwindcss";
@source "../node_modules/@dazzxq/td-components/src";
```
**Warning signs:** Components render without any Tailwind styles in consumer projects

### Pitfall 5: Stale `tailwind.config.js` Reference
**What goes wrong:** After deleting `tailwind.config.js`, some tool or script still references it
**Why it happens:** v4 does not auto-detect JS config files, but other tools might
**How to avoid:** Grep for `tailwind.config` references in the project before/after deletion
**Warning signs:** Build warnings about missing config file

## Code Examples

### Consumer CSS Setup (v4)
```css
/* consumer's main CSS file */
@import "tailwindcss";
@source "../node_modules/@dazzxq/td-components/src";
```

### Consumer PostCSS Setup (v4)
```js
// postcss.config.js (consumer)
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
```

### Utility Class Fix Pattern
```js
// BEFORE (v3 classes)
class="p-4 border rounded-lg shadow-sm"
class="rounded hover:bg-blue-600"

// AFTER (v4 equivalent preserving v3 visuals)
class="p-4 border border-gray-200 rounded-lg shadow-xs"
class="rounded-sm hover:bg-blue-600"
```

## State of the Art

| Old Approach (v3) | Current Approach (v4) | When Changed | Impact on This Project |
|--------------------|----------------------|--------------|----------------------|
| `tailwind.config.js` JS config | CSS-based `@theme` directive | Tailwind 4.0 (Jan 2025) | Delete config file, no migration needed (no custom theme) |
| `content: [...]` in config | Automatic detection + `@source` | Tailwind 4.0 | Remove content config. Consumers need `@source` for node_modules |
| Separate `autoprefixer` plugin | Built into Tailwind v4 | Tailwind 4.0 | Remove autoprefixer from devDependencies |
| `@tailwind base/components/utilities` | `@import "tailwindcss"` | Tailwind 4.0 | Already done |
| `tailwindcss` PostCSS plugin | `@tailwindcss/postcss` | Tailwind 4.0 | Already done |

## Project Constraints (from CLAUDE.md)

- **No Shadow DOM**: Not affected by this migration
- **No build step required**: Consumers still only need Vite + Tailwind (now v4)
- **Solo dev**: Migration is simple and low-risk -- keep it that way
- **GSD Workflow**: Must use GSD commands for file changes
- **Codex Review**: Must call `/codex-plan-review` after planning and `/codex-impl-review` before commit

## Open Questions

1. **`td-sample.js` worth updating?**
   - What we know: It is a demo/sample component, not a production component
   - What's unclear: Whether to fix its classes or leave it as-is since it is just for demonstration
   - Recommendation: Fix it -- it appears in Storybook and should look correct. Also serves as example code.

2. **Should `tailwindcss` remain in peerDependencies or change to `@tailwindcss/postcss`?**
   - What we know: In v4, consumers need `@tailwindcss/postcss` (or `@tailwindcss/vite`) not `tailwindcss` directly. But `tailwindcss` is still a valid package (it is the core engine).
   - What's unclear: Whether peerDependencies should list `tailwindcss` or the PostCSS/Vite plugin
   - Recommendation: Keep `tailwindcss: ">=4.0.0"` as peerDependency. It is the core package that `@tailwindcss/postcss` depends on, and consumers will have it transitively. This is the standard convention.

## Sources

### Primary (HIGH confidence)
- [Tailwind CSS Upgrade Guide](https://tailwindcss.com/docs/upgrade-guide) - Complete list of breaking changes, renamed utilities, default value changes
- [Tailwind CSS Content Detection Docs](https://tailwindcss.com/docs/detecting-classes-in-source-files) - Automatic detection behavior, `@source` directive, node_modules exclusion
- Codebase audit via grep - All utility class usages in `src/**/*.js`

### Secondary (MEDIUM confidence)
- [Storybook Tailwind CSS recipe](https://storybook.js.org/recipes/tailwindcss) - Storybook + Tailwind integration patterns
- [Storybook + Tailwind v4 issue #31988](https://github.com/storybookjs/storybook/issues/31988) - Known Angular issues (not applicable to web-components-vite)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - v4 deps already installed, only cleanup remaining
- Architecture: HIGH - existing structure already v4-compatible
- Pitfalls: HIGH - verified against official upgrade guide with codebase cross-reference
- Utility class audit: HIGH - systematic grep of all source files against official rename list

**Research date:** 2026-04-04
**Valid until:** 2026-07-04 (stable -- Tailwind v4 is released and documented)
