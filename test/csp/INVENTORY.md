# CSP-blocking construct inventory (LOCKED — Task 0B)

Source tree: `src/**/*.js` (excluding `*.test.js`, `*.browser-test.js`, `*.stories.js`).
Re-grepped at Task 0B on branch `feat/csp-hardening`. This LOCKS exactly what each hardening
wave must remove. Each count is the number of grep hits for that construct in that file.

Four CSP-blocking constructs (per the Locked-context spike table):
1. **declarative `style="` / `style='`** — including inside template-literal `innerHTML` (BLOCKED under strict CSP).
2. **injected `<style>`** — `document.createElement('style')` or a literal `<style` in a string (BLOCKED).
3. **injected `@keyframes` / `animation:`** — keyframes/animation declared inside injected CSS (BLOCKED with the sheet).
4. **`style=` on SVG nodes** — a *subset* of construct (1); listed separately because the refactor maps these to SVG presentation attributes, not CSSOM.

> Counts in column (1) **include** the SVG-node hits broken out in column (4) (an SVG `style=` is still a declarative `style=`). Column (4) is informational, not additive.

## Per-component table

| Component | (1) declarative `style=` | (2) injected `<style>` | (3) `@keyframes`/`animation:` | (4) SVG `style=` | needs adopt-sheet? | dashboard uses? |
|---|---:|---:|---:|---:|---|---|
| display/td-table | 17 | 0 | 0 | 0 | maybe (row `:hover`) | ✅ |
| form/td-slider | 10 | 0 | 0 | 0 | maybe (thumb `:active`) | – |
| form/td-toggle | 5 | 1 | 0 | 2 | **✅** (checked/transition) | – |
| form/td-input-field | 5 | 0 | 0 | 0 | maybe (`:focus`) | ✅ |
| display/td-empty-state | 5 | 0 | 0 | 1 | – | ✅ |
| form/td-dropdown | 4 | 0 | 0 | 1 | maybe (open/hover) | – |
| display/td-tabs | 4 | 0 | 0 | 0 | maybe (indicator transition) | ✅ |
| feedback/td-modal | 1 | 0 | 0 | 0 | maybe (backdrop transition) | ✅ |
| feedback/td-toast | 1 | 0 | 0 | 0 | maybe (enter/leave) | ✅ |
| form/td-button | 1 | 0 | 0 | 0 | maybe (`:hover`/`:active`) | ✅ |
| display/td-pagination | 1 | 0 | 0 | 0 | – | ✅ |
| form/td-checkbox | 0 | 1 | 0 | 0 | **✅** (checked/sibling) | ✅ (affected via `<style>`) |
| feedback/td-loading | 2 | 2 | 4 (`@keyframes`) + 6 (`animation:`) | 2 | **✅** (keyframes) | – |
| form/td-datetime-picker | 0 | 1 | 0 | 0 | **✅** | – |
| base/td-base-element | 0 | 0 | 0 | 0 | – | ✅ (base) |
| feedback/td-tooltip | 0 | 0 | 0 | 0 | – (uses CSSOM only) | – |
| feedback/td-modal-stack | 0 | 0 | 0 | 0 | – | ✅ (modal dep) |
| utils/css-safe.js | 0\* | 0\* | 0 | 0 | – | – |

\* `css-safe.js` line 2 contains the strings `<style>` and `style="…"` **inside a JSDoc comment only** — not a real construct. Excluded.

**Totals (real constructs):** declarative `style=` = **56**; injected `<style>` = **5** (toggle, checkbox, datetime-picker, loading ×2); `@keyframes` = **4** (loading); `animation:` declarations = **6** (loading); SVG `style=` = **6** (toggle ×2, empty-state ×1, dropdown ×1, loading ×2).

## DEVIATIONS from the plan's inventory table

1. **`base/td-base-element` — plan says 1 declarative `style=`; ACTUAL = 0.** The single grep hit (`td-base-element.js:134`) is a **JSDoc comment** describing `safeColor`, not rendered output. base-element emits no inline/injected style. → **Wave A has no blocking construct to remove in base-element**; it only needs to host the new `adopt-styles`/`css-safe` helpers. The plan's "harden base/td-base-element.js (its 1 declarative style)" is moot.

2. **`form/td-datetime-picker` — plan says "✅ declarative `style=`"; ACTUAL = 0 declarative `style=`.** Its only blocking construct is **1 injected `<style>`** (`td-datetime-picker.js:292`, id `td-datetime-picker-styles`, with `:hover`/`.selected`/`::before` selector rules → needs the adopt-sheet). No inline `style=` and no SVG `style=`. The "needs adopt-sheet ✅" verdict stands.

3. **`feedback/td-tooltip` — plan marks injected-`<style>`/keyframes/SVG as `?`; ACTUAL = ALL ZERO.** Tooltip styles entirely via **CSSOM** (`el.style.cssText`, `el.style.<prop>` — see `td-tooltip.js:58,89,97,272+`), which the spike proved is **CSP-ALLOWED**. Tooltip has **no CSP-blocking construct** and is **EXCLUDED** from the matrix/baseline (nothing to assert parity on — it is already CSP-clean).

4. **`feedback/td-loading` construct (3) is larger than a single cell implies.** The plan lists "✅ keyframes". Concretely: **4 `@keyframes` blocks** (`td-spinner-rotate`, `td-spinner-dash`, `td-inline-spinner-rotate`, `td-inline-spinner-dash`) and **6 `animation:` declarations** across the overlay `<style>` (lines 53–137) and the inline-spinner `<style>` (lines 271–293), plus the inline arc carries `animation:` inside an SVG `style=` (line 265). All must move to the adopted sheet (overlay + inline) and SVG presentation/sheet (inline arc).

All other rows match the plan exactly.

## Flat hit list (`file:line: snippet`)

### (1) declarative `style=` / `style='`

```
src/display/td-empty-state.js:74:  <svg class="td-empty-icon" ... style="width:${s.icon}px;height:${s.icon}px;color:#9ca3af;">      [SVG]
src/display/td-empty-state.js:94:  style="border-color:rgba(0,0,0,0.12);padding:${padding}px;background-color:rgba(255,255,255,0.6);box-shadow:inset 0 1px 0 rgba(255,255,255,0.8);"
src/display/td-empty-state.js:95:  <div style="margin-bottom:${s.gap}px;">
src/display/td-empty-state.js:98:  <h3 ... style="margin-bottom:${s.gap - 2}px;">
src/display/td-empty-state.js:104: <div class="td-empty-actions ..." style="margin-top:${s.gap + 6}px;${...'display:none;'}">
src/display/td-pagination.js:61:  <span class="px-2 py-1 rounded-md font-semibold cursor-default" style="color:${activeColor}">${item}</span>
src/display/td-table.js:226: <th ... style="${style}">${this.escapeHtml(col.label)}</th>                                    [loading header col]
src/display/td-table.js:231: ' style="background-color:rgba(0,0,0,0.015)"'                                                  [loading zebra row]
src/display/td-table.js:235: <td class="px-6 py-4" style="${style}"><div ... style="width:${w}%"></div></td>                  [loading cell + skeleton bar; TWO style= on one line]
src/display/td-table.js:241: <div class="rounded-xl overflow-hidden" style="background:...;border:...;box-shadow:...;">          [loading card]
src/display/td-table.js:242: <div class="flex ... " style="border-bottom:...;box-shadow:...;">                                  [loading header bar]
src/display/td-table.js:249: <tr class="bg-gray-50/60" style="border-bottom:...;">                                             [loading thead row]
src/display/td-table.js:254: <div class="flex ... " style="border-top:...;background:...;box-shadow:...;">                       [loading footer bar]
src/display/td-table.js:280: <th ... style="${style}" data-sort-key="${attrKey}">                                              [sortable header col]
src/display/td-table.js:287: <th ... style="${style}">${this.escapeHtml(col.label)}</th>                                      [plain header col]
src/display/td-table.js:303: ' style="background-color:rgba(0,0,0,0.015)"'                                                  [data zebra row; assigned but unused — row style is re-applied at :315]
src/display/td-table.js:309: <td class="... td-table-render-cell" style="${style}" data-col-key=... data-row-idx=...>           [render cell]
src/display/td-table.js:313: <td class="px-6 py-4 text-sm text-gray-900" style="${style}">${display}</td>                      [data cell]
src/display/td-table.js:315: <tr class="td-table-row transition-colors" style="transition:...;${zebra...'background-color:...;'}" data-row-idx=...>  [data row]
src/display/td-table.js:321: <div class="flex ..." style="border-bottom:...;box-shadow:...;">                                  [data header bar]
src/display/td-table.js:329: <div class="flex ..." style="border-top:...;background:...;box-shadow:...;">                       [data footer bar]
src/display/td-table.js:335: <div class="td-table-container rounded-xl overflow-hidden" style="background:...;border:...;box-shadow:...;">  [data card]
src/display/td-table.js:340: <tr class="bg-gray-50/60" style="border-bottom:...;">                                             [data thead row]
src/display/td-tabs.js:59:   <div class="td-tabs-container ..." style="background: rgba(0, 0, 0, 0.04);">                       [empty container]
src/display/td-tabs.js:74:   style="position: relative; z-index: 1; background: transparent;"                                  [tab button]
src/display/td-tabs.js:79:   <div class="td-tabs-container ..." style="position: relative; background: rgba(0, 0, 0, 0.04);">       [container]
src/display/td-tabs.js:80:   <div class="td-tabs-indicator" style="position: absolute; ...; transition: ...; width: 0; opacity: 0; ...">  [indicator]
src/feedback/td-loading.js:262: <svg viewBox="0 0 50 50" style="width: 100%; height: 100%;">                                     [inline spinner SVG; SVG]
src/feedback/td-loading.js:265: <circle ... style="stroke-dasharray: 90, 150; animation: td-inline-spinner-dash 1.4s ...;">     [inline arc; SVG + animation:]
src/feedback/td-modal.js:57:  <div class="td-modal-content ..." style="box-shadow: ...; backdrop-filter: ...; -webkit-backdrop-filter: ...;">
src/feedback/td-toast.js:156: <div class="px-4 py-3 rounded-xl ... ${theme.bg} ${theme.hover}" style="box-shadow: ...; backdrop-filter: ...;">
src/form/td-button.js:221:  style="${inlineStyle}"                                                                            [variant glass OR custom color]
src/form/td-dropdown.js:128: <button ... style="background-color: ...; border-color: ...; padding: ...; height: 40px; box-shadow: ...;">  [button]
src/form/td-dropdown.js:130: <svg class="td-dropdown-arrow ..." ... style="${this._isOpen ? 'transform: rotate(180deg);' : ''}">  [arrow; SVG]
src/form/td-dropdown.js:255: style="border-color: rgba(0,0,0,0.08); background: rgba(255,255,255,0.5);"                          [search input; portaled menu]
src/form/td-dropdown.js:259: <div class="td-dropdown-options ..." role="listbox" style="max-height: ${maxHeight * 40}px;">       [options; portaled menu]
src/form/td-input-field.js:149: style="${commonStyle} height: ${textareaHeight}; resize: vertical;"                            [textarea]
src/form/td-input-field.js:164: style="${ceStyle}"                                                                            [contenteditable]
src/form/td-input-field.js:177: style="${commonStyle} height: ${s.h}px;"                                                       [input]
src/form/td-input-field.js:193: <div class="td-input-counter ..." style="font-size: ...; margin-top: ...; text-align: right; color: ${counterColor};">  [counter]
src/form/td-input-field.js:201: <div class="td-input-note mt-1" style="color: ${noteColor}; font-size: 12px;">                       [note]
src/form/td-slider.js:105:  <div class="td-slider-value-label ..." style="color: ${color};">                                  [value label]
src/form/td-slider.js:118:  <div class="td-slider-step-mark absolute" style="left: ${pct}%; ...; background-color: ...; ...">    [step mark]
src/form/td-slider.js:119:  <div class="td-slider-step-mark-label absolute ..." style="font-size: 10px; line-height: 1; ...">    [step mark label]
src/form/td-slider.js:138:  <div class="td-slider-container" style="width: ${preset.width};">
src/form/td-slider.js:141:  <div class="td-slider-wrap relative" style="padding-top: ...; padding-bottom: ...;${...margin-bottom}">
src/form/td-slider.js:142:  <div class="td-slider-track-container relative" style="height: ${trackHeight}px;">
src/form/td-slider.js:143:  <div class="td-slider-track-bg ..." style="background-color: rgba(0,0,0,0.08); box-shadow: ...;">
src/form/td-slider.js:144:  <div class="td-slider-track-active ..." style="background: linear-gradient(...); box-shadow: ...; width: ${percentage}%;">
src/form/td-slider.js:146:  <div class="td-slider-thumb ..." style="width: ...; height: ...; background: ...; left: calc(...); border: ...; box-shadow: ...; transition: ...; z-index: 10;${isDisabled...opacity}">
src/form/td-slider.js:147:  <input type="range" ... ${isDisabled ? 'disabled style="cursor: not-allowed;"' : ''} ...>             [disabled input only]
src/form/td-toggle.js:161: <div class="flex items-center gap-2" style="line-height:1">
src/form/td-toggle.js:162: <label class="${this._uniqueClass} ..." style="vertical-align:middle">
src/form/td-toggle.js:165: <svg viewBox="0 0 12 12" ... class="td-toggle-icon" style="opacity:${crossOpacity};position:${crossPosition}">  [SVG]
src/form/td-toggle.js:168: <svg viewBox="0 0 12 12" ... class="td-toggle-icon" style="opacity:${checkOpacity};position:${checkPosition}">  [SVG]
src/form/td-toggle.js:174: <span class="text-sm font-medium ..." style="line-height:${s.height}px">                            [label]
```

(Note: `td-table.js:235` carries **two** `style=` on one line — the loading `<td>` width style AND the inner skeleton-bar `width:` — counted together in the per-line grep of 17. `td-table.js:303` assigns `zebraStyle` but the data `<tr>` re-applies the zebra bg inline at :315, so :303's variable is dead; both lines still grep as hits.)

### (2) injected `<style>` (`createElement('style')`)

```
src/form/td-checkbox.js:124:        this._styleEl = document.createElement('style');                 [id-less; sibling `:checked ~` + size rules]
src/form/td-datetime-picker.js:292:  const style = document.createElement('style');                  [id 'td-datetime-picker-styles'; :hover/.selected/::before]
src/form/td-toggle.js:123:          this._styleEl = document.createElement('style');                 [id-less; track/thumb --active + transitions]
src/feedback/td-loading.js:53:      const styleEl = document.createElement('style');                    [id 'td-loading-styles'; overlay spinner + keyframes + reduced-motion]
src/feedback/td-loading.js:271:     const style = document.createElement('style');                      [id 'td-spinner-keyframes'; inline keyframes]
```

### (3) `@keyframes` / `animation:` in injected CSS

```
src/feedback/td-loading.js:74:   animation: td-spinner-rotate 1.4s linear infinite;            [overlay .td-circular-spinner]
src/feedback/td-loading.js:95:   animation: td-spinner-dash 1.4s ease-in-out infinite;        [overlay .td-spinner-arc]
src/feedback/td-loading.js:98:   @keyframes td-spinner-rotate { 100% { transform: rotate(360deg); } }
src/feedback/td-loading.js:102:  @keyframes td-spinner-dash { ... }
src/feedback/td-loading.js:128:  animation: td-spinner-rotate 2.8s linear infinite;            [reduced-motion override]
src/feedback/td-loading.js:131:  animation: none;                                             [reduced-motion arc]
src/feedback/td-loading.js:258:  animation: td-inline-spinner-rotate 1.4s linear infinite;    [inline .td-spinner container cssText]
src/feedback/td-loading.js:265:  ...; animation: td-inline-spinner-dash 1.4s ease-in-out infinite;  [inline arc SVG style=]
src/feedback/td-loading.js:274:  @keyframes td-inline-spinner-rotate { 100% { transform: rotate(360deg); } }
src/feedback/td-loading.js:277:  @keyframes td-inline-spinner-dash { ... }
```

(Line 258 is `container.style.cssText` — CSSOM, NOT a blocking construct in itself — but its `animation:` references a keyframe that only exists via the injected `<style>` at :271. The keyframe injection is the blocking construct; the CSSOM line is listed for completeness.)

### (4) `style=` on SVG nodes (subset of construct 1)

```
src/display/td-empty-state.js:74:  <svg class="td-empty-icon" ... style="width:...;height:...;color:#9ca3af;">
src/feedback/td-loading.js:262:    <svg viewBox="0 0 50 50" style="width: 100%; height: 100%;">
src/feedback/td-loading.js:265:    <circle ... style="stroke-dasharray: 90, 150; animation: td-inline-spinner-dash ...;">
src/form/td-dropdown.js:130:       <svg class="td-dropdown-arrow ..." ... style="${this._isOpen ? 'transform: rotate(180deg);' : ''}">
src/form/td-toggle.js:165:        <svg viewBox="0 0 12 12" ... style="opacity:${crossOpacity};position:${crossPosition}">
src/form/td-toggle.js:168:        <svg viewBox="0 0 12 12" ... style="opacity:${checkOpacity};position:${checkPosition}">
```

(SVG `style=` total = **6 hits across 4 components** — toggle ×2, empty-state ×1, dropdown ×1, loading ×2. The per-component table column (4) now reports loading = **2**: the inline `<svg>` wrapper at :262 (`width/height` → SVG presentation attributes) AND the inline `<circle>` at :265 (`stroke-dasharray` + `animation:` → presentation attribute + adopted sheet). Both are addressed in Wave B loading.)
```
