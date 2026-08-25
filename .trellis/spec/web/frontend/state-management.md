# State Management

> How state is managed in this project.

---

## Overview

<!--
Document your project's state management conventions here.

Questions to answer:
- What state management solution do you use?
- How is local vs global state decided?
- How do you handle server state?
- What are the patterns for derived state?
-->

Local page state owns search predicates, filter values, visible slices,
mutation loading, and selected stable row keys. Admin presentation components
do not keep a second copy of those values. URL or admin-tab persistence remains
owned by the page adapter (`useAdminTabState` where already established).

---

## State Categories

<!-- Local state, global state, server state, URL state -->

Use `AdminDataTable` selection with a `ReadonlySet<string>` keyed by a stable
domain identifier. Selecting or clearing the current page changes only keys
on that page; keys selected on another page remain in the set.

---

## When to Use Global State

<!-- Criteria for promoting state to global -->

Use `clampPage(page, total, pageSize)` after filtering, deletion, or page-size
changes. The empty result page is always `1`, and the shell reports a clamped
page through the controlled `onPageChange` callback.

---

## Server State

<!-- How server data is cached and synchronized -->

The web MVP currently uses React local state and existing admin-tab state
helpers. Do not introduce a global store or data-fetching framework for a
shared presentation component.

---

## Common Mistakes

<!-- State management mistakes your team has made -->

Avoid index-based selection and avoid duplicating pagination logic in each
page. Keep filtering and slicing in the page, then pass the resulting rows and
total to `AdminCrudList`/`AdminDataTable`.
