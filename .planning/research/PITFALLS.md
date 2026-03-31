# Pitfalls Research

**Domain:** Shared Web Components UI Library (migrating from vanilla JS)
**Researched:** 2026-03-31
**Confidence:** HIGH

## Critical Pitfalls

### 1. Memory Leaks từ Event Listeners Không Cleanup

**Severity:** HIGH
**Warning signs:** Page chậm dần sau nhiều lần open/close modal hoặc dropdown. Event handlers fire nhiều lần.
**Context:** DCMS hiện tại đã có vấn đề này ở Tooltip, NotificationDropdown, Dropdown.

**Prevention:**
- `TdBaseElement` có `_cleanups` array, mỗi `addEventListener` tự push `removeEventListener` vào
- `disconnectedCallback` chạy tất cả cleanups
- Helper method: `this.listen(target, event, handler)` tự track

**Phase:** Phase 1 (base class)

---

### 2. `connectedCallback` Chạy Nhiều Lần

**Severity:** HIGH
**Warning signs:** Component render trùng lặp, event listeners bị duplicate.
**Context:** Browser gọi `connectedCallback` mỗi khi element được move trong DOM (appendChild khác parent). Đây là gotcha phổ biến nhất của Web Components.

**Prevention:**
- Check `this._initialized` flag trong connectedCallback
- Hoặc dùng pattern: setup trong constructor, bind/unbind trong connected/disconnected
- KHÔNG render lại toàn bộ trong connectedCallback nếu đã render rồi

**Phase:** Phase 1 (base class)

---

### 3. Attributes vs Properties Confusion

**Severity:** MEDIUM
**Warning signs:** `element.checked = true` không work, phải dùng `element.setAttribute('checked', '')`.
**Context:** HTML attributes là strings. JS properties có thể là bất kỳ type. Web Components cần sync 2 chiều.

**Prevention:**
- Implement getter/setter cho mỗi observed attribute
- `attributeChangedCallback` → update internal state → re-render
- Property setter → update attribute → trigger attributeChangedCallback
- Base class có helper: `static get observedAttributes` + auto-generate getters/setters

**Phase:** Phase 1 (base class)

---

### 4. Tailwind Classes Không Có Trong Host Page

**Severity:** MEDIUM
**Warning signs:** Component render đúng nhưng không có style (classes bị purge).
**Context:** Tailwind purge/scan chỉ tìm classes trong project files. Component library ở folder khác → classes bị miss.

**Prevention:**
- Consumer phải thêm path vào `tailwind.config.js`:
  ```js
  content: [
    './node_modules/@dazzxq/td-components/src/**/*.js'
  ]
  ```
- Document rõ trong README
- Có thể ship 1 Tailwind preset/plugin để tự thêm

**Phase:** Phase 1 (setup/docs)

---

### 5. innerHTML XSS Khi Render User Content

**Severity:** HIGH
**Warning signs:** User input render thẳng qua innerHTML không escape.
**Context:** DCMS hiện tại có risk này ở một số components dùng innerHTML.

**Prevention:**
- Base class có `this.safeHTML()` method escape HTML entities
- Prefer DOM API (createElement, textContent) cho user content
- innerHTML chỉ cho template tĩnh (không chứa user data)
- Linting rule: grep cho innerHTML patterns có template literal interpolation

**Phase:** Phase 1 (base class), enforce xuyên suốt

---

### 6. Custom Element Name Collision

**Severity:** LOW
**Warning signs:** `customElements.define` throw error vì tag name đã registered.
**Context:** Nếu consumer import component 2 lần, hoặc 2 versions cùng tồn tại.

**Prevention:**
- Wrap define trong check: `if (!customElements.get('td-toggle')) customElements.define(...)`
- Prefix `td-` giảm collision với library khác

**Phase:** Phase 1 (base class hoặc registration helper)

---

### 7. Over-Engineering Base Class

**Severity:** MEDIUM
**Warning signs:** Base class > 200 lines, components đơn giản phải implement nhiều method không cần.
**Context:** Solo dev tendency là build "perfect" base class trước khi có component nào dùng.

**Prevention:**
- Build base class minimal, chỉ có: lifecycle hooks, cleanup tracking, attribute helpers
- Thêm features vào base class KHI có ≥2 components cần
- Không reactive system, không virtual DOM, không template engine

**Phase:** Phase 1

---

### 8. Storybook Config Overhead

**Severity:** LOW
**Warning signs:** Storybook không render Web Components đúng, hoặc Tailwind classes không work trong Storybook.
**Context:** Storybook cần config riêng cho Web Components + Tailwind.

**Prevention:**
- Dùng `@storybook/web-components-vite` (official support)
- Import Tailwind CSS trong `.storybook/preview.js`
- Test Storybook setup sớm, trước khi viết nhiều stories

**Phase:** Phase 1 hoặc 2 (Storybook setup)

## Migration-Specific Pitfalls

### 9. Migrate Quá Nhiều Cùng Lúc

**Severity:** MEDIUM
**Prevention:** Migrate 4-5 core components trước. Validate architecture works. Rồi mới migrate phần còn lại.

### 10. API Không Tương Thích Ngược

**Severity:** LOW (vì đang refactor hoàn toàn)
**Prevention:** Document API mới rõ ràng. DCMS project sẽ dùng API mới khi migrate.
