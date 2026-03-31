# Phase 1: Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-31
**Phase:** 01-foundation
**Areas discussed:** Base class API, Naming & tag, Package structure, Storybook config

---

## Base Class API

### Render Method

| Option | Description | Selected |
|--------|-------------|----------|
| innerHTML (Recommended) | HTML template string, escapeHtml() cho XSS | ✓ |
| DOM API | document.createElement(), an toàn hơn nhưng code dài | |
| Mix cả hai | innerHTML cho static, DOM API cho user input | |

**User's choice:** innerHTML (Recommended)
**Notes:** Đơn giản, dễ đọc, base class cung cấp escapeHtml()

### Attribute/Property Sync

| Option | Description | Selected |
|--------|-------------|----------|
| Auto (Recommended) | Base class tự sinh getter/setter từ observedAttributes | ✓ |
| Manual | Mỗi component tự viết getter/setter | |

**User's choice:** Auto (Recommended)

### Event Listener Cleanup

| Option | Description | Selected |
|--------|-------------|----------|
| this.listen() (Recommended) | Base class track và auto-remove khi disconnect | ✓ |
| Manual cleanup | Mỗi component tự quản lý | |

**User's choice:** this.listen() (Recommended)

### Re-render Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Full re-render (Recommended) | Gọi lại this.render(), đơn giản, đủ performance | ✓ |
| Partial update | Chỉ update phần thay đổi, phức tạp hơn | |

**User's choice:** Full re-render (Recommended)

---

## Naming & Tag

### Tag Prefix

| Option | Description | Selected |
|--------|-------------|----------|
| td- (Recommended) | Ngắn: <td-toggle>, <td-modal> | ✓ |
| tdui- | Rõ hơn nhưng dài: <tdui-toggle> | |

**User's choice:** td- (Recommended)

### Class Name

| Option | Description | Selected |
|--------|-------------|----------|
| TdToggle (Recommended) | PascalCase với prefix Td, map trực tiếp tới tag | ✓ |
| Toggle | Không prefix, ngắn nhưng dễ conflict | |

**User's choice:** TdToggle (Recommended)

---

## Package Structure

### Folder Layout

| Option | Description | Selected |
|--------|-------------|----------|
| Grouped (Recommended) | Nhóm theo chức năng: form/, feedback/, display/ | ✓ |
| Flat | Tất cả trong components/ | |

**User's choice:** Grouped (Recommended)

### Import Path

| Option | Description | Selected |
|--------|-------------|----------|
| By name (Recommended) | import '@dazzxq/td-components/toggle' | ✓ |
| By path | import '@dazzxq/td-components/src/form/toggle/td-toggle.js' | |

**User's choice:** By name (Recommended)

---

## Storybook Config

### Story Format

| Option | Description | Selected |
|--------|-------------|----------|
| CSF + plain HTML (Recommended) | Template string HTML, không cần thêm library | ✓ |
| CSF + lit-html | lit-html template literals, thêm dependency | |

**User's choice:** CSF + plain HTML (Recommended)

### Addons

| Option | Description | Selected |
|--------|-------------|----------|
| Controls (Recommended) | Thay đổi props realtime | ✓ |
| Actions (Recommended) | Log events | ✓ |
| A11y (Recommended) | Kiểm tra accessibility | ✓ |
| Viewport | Test responsive | ✓ |

**User's choice:** Tất cả addons
**Notes:** User nói "recommend test gì cho component thì cứ cho vào"

---

## Claude's Discretion

- CSS animation keyframes injection strategy
- emit() helper cho CustomEvent
- Storybook build config chi tiết

## Deferred Ideas

None
