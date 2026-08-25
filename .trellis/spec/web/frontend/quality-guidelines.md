# Quality Guidelines

> Code quality standards for frontend development.

---

## Overview

<!--
Document your project's quality standards here.

Questions to answer:
- What patterns are forbidden?
- What linting rules do you enforce?
- What are your testing requirements?
- What code review standards apply?
-->

Run focused state tests, `npm run typecheck -w apps/web`, and a production
build for shared UI changes. Full Vitest and lint results must distinguish
failures introduced by the change from pre-existing repository failures.

---

## Forbidden Patterns

<!-- Patterns that should never be used and why -->

Feature-level code must not directly render Mantine `Table`, `Modal`, or
application-owned confirmation dialogs once its migration wave is complete.
Do not use `window.confirm`, arbitrary `any` prop bags, visible emoji as an
icon-only action, or page-local sticky-column styles.

---

## Required Patterns

<!-- Patterns that must always be used -->

Use typed generic columns and stable keys. Shared controls use semantic tones,
and page-local styling must not recreate button, tag, or fixed-column states.

### Admin UI performance and state gotchas

- Fixed table cells must use the shared fixed-cell class for their opaque
  background states. An inline `backgroundColor` on the cell wins over the
  row hover selector and makes the fixed operation column appear to lose its
  hover style.
- A client-side admin list must not synchronously mount hundreds of rows when
  a filter is cleared. Paginate the visible rows (the default is 20) or use a
  deliberately virtualized surface before adding expensive row action
  controls.
- `AppModal` consumers may provide `bodyHeight`, `bodyMinHeight`, and
  `bodyMaxHeight`; the shared modal must cap content width and body height with
  viewport-relative values so a nested draggable wrapper cannot shrink the
  dialog to its children or push the footer off-screen.

```tsx
// Correct: CSS owns the fixed-cell state transitions.
<Table.Td className="admin-data-table__fixed-cell" />

// Avoid: this masks the shared row hover background.
<Table.Td style={{ backgroundColor: "white" }} />
```

---

## Testing Requirements

<!-- What level of testing is expected -->

Test `clampPage`, page-aware row numbers, disabled-row selection, selection
preservation across pages, and confirmation queue serialization. Verify long
modal content at narrow and desktop widths when browser infrastructure is
available.

---

## Code Review Checklist

<!-- What reviewers should check -->

Reviewers should check that shared components remain domain-free, page state is
controlled by the consumer, fixed columns have deterministic widths, modal
footer actions are outside the scroll body, and new controls use semantic
tones with keyboard-visible focus states.
