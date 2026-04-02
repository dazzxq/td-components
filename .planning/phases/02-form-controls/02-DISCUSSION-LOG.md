# Phase 2: Form Controls - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.

**Date:** 2026-04-02
**Phase:** 02-form-controls
**Areas discussed:** API design, Migration scope, Styling approach

---

## API Design

### Complex Data Input

| Option | Description | Selected |
|--------|-------------|----------|
| JS property (Recommended) | el.options = [...] qua JS | ✓ |
| JSON attribute | options='[{...}]' trong HTML | |
| Cả hai | Hỗ trợ cả hai cách | |

**User's choice:** JS property (Recommended)

### Event Naming

| Option | Description | Selected |
|--------|-------------|----------|
| Standard names (Recommended) | 'change', 'click' — như native HTML | ✓ |
| Prefixed names | 'td-change', 'td-click' | |

**User's choice:** Standard names (Recommended)

---

## Migration Scope

### Feature Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Port đủ features (Recommended) | Giữ tất cả features DCMS, chỉ đổi architecture | ✓ |
| Simplify + improve | Bỏ bớt, thêm mới | |

**User's choice:** Port đủ features (Recommended)

### DateTime Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Port đủ (Recommended) | Giữ nguyên format, relative time, parse | ✓ |
| Dùng library | Thay bằng date-fns/dayjs | |

**User's choice:** Port đủ (Recommended)

---

## Styling Approach

### Customization Method

| Option | Description | Selected |
|--------|-------------|----------|
| Attributes (Recommended) | size, color, variant attributes → map Tailwind classes | ✓ |
| Tailwind trực tiếp | Consumer tự thêm classes | |

**User's choice:** Attributes (Recommended)

---

## Claude's Discretion

- Dropdown positioning utility
- Dynamic style injection for custom colors
- Dropdown component structure (monolithic vs sub-components)

## Deferred Ideas

None
