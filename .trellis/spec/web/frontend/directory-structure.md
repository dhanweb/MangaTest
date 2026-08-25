# Directory Structure

> How frontend code is organized in this project.

---

## Overview

<!--
Document your project's frontend directory structure here.

Questions to answer:
- Where do components live?
- How are features/modules organized?
- Where are shared utilities?
- How are assets organized?
-->

Shared web UI is split by ownership. `components/ui` contains application-wide
controls and feedback primitives; `components/admin-ui` contains domain-free
admin list presentation. Route files under `src/app` own data loading,
filtering, mutations, and page-specific mapping.

---

## Directory Layout

```
src/
├── app/
├── components/
│   ├── admin-ui/
│   │   ├── admin-crud-list.tsx
│   │   ├── admin-data-table.tsx
│   │   ├── admin-list-state.ts
│   │   ├── admin-page-header.tsx
│   │   └── types.ts
│   └── ui/
│       ├── app-button.tsx
│       ├── app-modal.tsx
│       ├── app-tag.tsx
│       └── app-components.tsx
├── modules/
└── lib/
```

---

## Module Organization

<!-- How should new features be organized? -->

`AdminDataTable<T>` and `AdminCrudList` must not import a domain module or call
an API. A page passes already-filtered rows and controlled state into them.
Keep `app-components.tsx` as a compatibility barrel while call sites migrate;
new code may import the focused files directly.

---

## Naming Conventions

<!-- File and folder naming rules -->

Use kebab-case filenames. Use `Admin*` for admin presentation components and
`App*` for application-wide UI primitives. Pure state helpers live beside the
component that consumes them and have focused Vitest tests.

---

## Examples

<!-- Link to well-organized modules as examples -->

See `src/components/admin-ui/admin-data-table.tsx` for typed table composition
and `src/app/admin/comics/comics-panel.tsx` for the controlled page adapter.
