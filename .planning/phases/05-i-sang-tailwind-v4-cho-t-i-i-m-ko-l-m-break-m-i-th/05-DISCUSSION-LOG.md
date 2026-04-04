# Phase 5: Tailwind v4 Migration - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-04
**Phase:** 05-tailwind-v4-migration
**Areas discussed:** Config approach, Content detection, Class compatibility, Peer dependency & consumer impact

---

## Config Approach

| Option | Description | Selected |
|--------|-------------|----------|
| Xóa config.js | Xóa tailwind.config.js, dùng CSS-based config. Project không có custom theme nên chuyển rất đơn giản. | ✓ |
| Giữ config.js + @config | Thêm @config directive trong CSS để v4 đọc file cũ. An toàn hơn nhưng giữ cách làm cũ. | |

**User's choice:** Xóa config.js (Recommended)
**Notes:** None

---

## Content Detection

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-detect | Dùng v4 auto-detection mặc định. V4 tự quét .js files. Đơn giản nhất. | ✓ |
| Tường minh với @source | Thêm @source "../src" trong tailwind.css. An toàn hơn nếu thêm file types khác. | |

**User's choice:** Auto-detect (Recommended)
**Notes:** None

---

## Class Compatibility

| Option | Description | Selected |
|--------|-------------|----------|
| Giữ nguyên | ring-offset-1 vẫn hoạt động trong v4. Không đổi — giảm risk. | ✓ |
| Đổi sang outline | Thay ring-offset-1 bằng outline styles (v4 best practice). Cần test lại focus states. | |

**User's choice:** Giữ nguyên (Recommended)
**Notes:** Chỉ 2 files bị ảnh hưởng: td-button.js, td-empty-state.js

---

## Peer Dependency & Consumer Impact

| Option | Description | Selected |
|--------|-------------|----------|
| >=4.0.0 | Require Tailwind v4+. Rõ ràng library chỉ hỗ trợ v4. | ✓ |
| >=3.0.0 (giữ nguyên) | Không đổi peerDep. Consumers cũ vẫn install được nhưng có thể gặp vấn đề. | |

**User's choice:** >=4.0.0 (Recommended)
**Notes:** Solo dev, các project khác cũng đang đổi v4

| Option | Description | Selected |
|--------|-------------|----------|
| Cập nhật README | Thêm section hướng dẫn Tailwind v4 setup cho consumers. | ✓ |
| Không cần | Solo dev, tự biết cách setup. | |

**User's choice:** Cập nhật README (Recommended)
**Notes:** None

---

## Claude's Discretion

- Storybook config adjustments
- devDependencies cleanup (autoprefixer removal)
- Migration step ordering

## Deferred Ideas

None
