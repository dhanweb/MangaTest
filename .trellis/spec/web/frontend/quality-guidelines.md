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
