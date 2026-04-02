# Roadmap: td-components

## Overview

Migrate 22 DCMS components from global namespace JS to a shared Web Components library. Start with base architecture and Storybook, build form controls first (validate the architecture), then overlay/feedback components, then display components. Each phase delivers usable, importable components with stories.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [ ] **Phase 1: Foundation** - Base class, project structure, Storybook setup, package config
- [ ] **Phase 2: Form Controls** - Toggle, button, checkbox, input, slider, dropdown, datetime
- [ ] **Phase 3: Feedback & Overlay** - Modal stack, toast, tooltip, loading
- [ ] **Phase 4: Display & Stories** - Table, tabs, pagination, empty state, complete Storybook coverage

## Phase Details

### Phase 1: Foundation
**Goal**: Developers can create new components by extending TdBaseElement, preview them in Storybook, and install the package from GitHub
**Depends on**: Nothing (first phase)
**Requirements**: BASE-01, BASE-02, BASE-03, BASE-04, BASE-05, BASE-06, DX-01, DX-03, DX-04
**Success Criteria** (what must be TRUE):
  1. A developer can extend TdBaseElement, define observed attributes, and get working lifecycle management with automatic cleanup
  2. Storybook launches and renders a sample component with Tailwind styles applied
  3. A consumer project can `npm install github:dazzxq/td-components` and import a single component without pulling the entire library
  4. README documents install steps, Tailwind content path config, and basic usage
**Plans:** 2 plans

Plans:
- [x] 01-01-PLAN.md — TdBaseElement base class, utilities, project structure, package.json exports
- [x] 01-02-PLAN.md — Storybook setup, sample component, README documentation

### Phase 2: Form Controls
**Goal**: Users can drop in form components (toggle, button, checkbox, input, slider, dropdown) and the datetime utility that cover the same functionality as DCMS originals
**Depends on**: Phase 1
**Requirements**: FORM-01, FORM-02, FORM-03, FORM-04, FORM-05, FORM-06, UTIL-01
**Success Criteria** (what must be TRUE):
  1. Each form component renders correctly with attributes (variants, sizes, disabled, loading) and emits standard change/click events
  2. Dropdown supports search filtering, keyboard navigation (arrow keys, enter, escape), and auto-positions its popup to stay within viewport
  3. Input field shows character counter, validation error text, and supports text/password/email/textarea modes
  4. DateTime utility formats dates with custom tokens and outputs Vietnamese relative time strings
**Plans:** 4 plans
**UI hint**: yes

Plans:
- [x] 02-01-PLAN.md — Toggle, Checkbox, Button components with stories
- [x] 02-02-PLAN.md — DateTime utility with tests, Input Field component with story
- [x] 02-03-PLAN.md — Slider and Dropdown components with stories
- [x] 02-04-PLAN.md — Package exports wiring and Storybook visual verification

### Phase 3: Feedback & Overlay
**Goal**: Users can trigger modals, toasts, tooltips, and loading overlays that handle stacking, positioning, and auto-dismiss correctly
**Depends on**: Phase 2
**Requirements**: FEED-01, FEED-02, FEED-03, FEED-04, FEED-05
**Success Criteria** (what must be TRUE):
  1. Multiple modals can stack with correct z-index ordering, backdrop opacity, focus trap, and body scroll lock
  2. Toast notifications appear in 4 variants, auto-dismiss after timeout, cap at 5 visible with FIFO eviction
  3. Tooltip auto-positions relative to its trigger, shows arrow, and reuses a single global instance
  4. Loading component works as both fullscreen overlay and inline spinner with configurable max duration
**Plans**: TBD
**UI hint**: yes

Plans:
- [ ] 03-01: TBD
- [ ] 03-02: TBD

### Phase 4: Display & Stories
**Goal**: Users can render data tables, tabbed interfaces, pagination, and empty states, with complete Storybook stories for every component in the library
**Depends on**: Phase 3
**Requirements**: DISP-01, DISP-02, DISP-03, DISP-04, DX-02
**Success Criteria** (what must be TRUE):
  1. Table component renders sortable columns, pagination controls, zebra striping, and loading skeleton state
  2. Tabs component switches content panels with icon+label support and smooth transitions
  3. Pagination renders page navigation with ellipsis, info text, and custom active color
  4. Every component in the library has a Storybook story with controls and at least one composition example
**Plans**: TBD
**UI hint**: yes

Plans:
- [ ] 04-01: TBD
- [ ] 04-02: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 0/2 | Not started | - |
| 2. Form Controls | 0/4 | Not started | - |
| 3. Feedback & Overlay | 0/2 | Not started | - |
| 4. Display & Stories | 0/2 | Not started | - |
