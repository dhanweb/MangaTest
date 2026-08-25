# Component Guidelines

> How components are built in this project.

---

## Overview

<!--
Document your project's component conventions here.

Questions to answer:
- What component patterns do you use?
- How are props defined?
- How do you handle composition?
- What accessibility standards apply?
-->

Mantine is the implementation foundation. Shared components own visual and
interaction contracts; feature pages own domain rules and network behavior.
Prefer the focused component files for new code and keep the compatibility
barrel working during staged migrations.

---

## Component Structure

<!-- Standard structure of a component file -->

Define exported props as explicit TypeScript types. Use `ReactNode` for slots,
generic row types for tables, and controlled values for search, filters,
selection, loading, and pagination. Do not add an index signature to make a
wrapper accept arbitrary Mantine props.

```tsx
<AdminCrudList
  search={{ value, onChange, placeholder: "搜索...", ariaLabel: "搜索记录" }}
  pagination={{ page, pageSize, total, onPageChange, onPageSizeChange }}
>
  <AdminDataTable rows={rows} columns={columns} getRowKey={(row) => row.id} />
</AdminCrudList>
```

---

## Props Conventions

<!-- How props should be defined and typed -->

Use semantic `tone` (`primary`, `neutral`, `success`, `warning`, `danger`,
`info`) separately from visual `variant`. Use `AppButton` for actions,
`AppLinkButton` for button-styled navigation, `AppIconButton` for compact
actions, and `AppTag` for status/category labels. `AppModal` owns the fixed
header/body/footer layout; put actions in its `footer` slot.

---

## Styling Patterns

<!-- How styles are applied (CSS modules, styled-components, Tailwind, etc.) -->

Every icon-only action supplies a Chinese accessible `label`; the tooltip
defaults to that label. Tables use native table semantics, stable row keys,
and fixed-column widths. `AppModal` keeps only the body scrollable and blocks
Escape, overlay, and close-button dismissal when `preventClose` is true.

Icon-only actions must not omit their accessible label, and static tags must
not look clickable. Use `AppIconButton` and `AppTag` so these states stay
consistent.

---

## Accessibility

<!-- A11y requirements and patterns -->

### Don't: leak feature behavior into shared presentation

```tsx
// Do not fetch or mutate inside AdminCrudList/AdminDataTable.
<AdminCrudList loadRows={loadRows} onDelete={deleteRow} />
```

Instead, keep those functions in the page and pass controlled state plus
rendered action slots.

### Don't: use arbitrary wrapper props

Use typed semantic props and the compatibility fields only while migrating;
do not restore an `any` index signature to `AppButton`, `AppBadge`, or another
shared wrapper.

---

## Common Mistakes

<!-- Component-related mistakes your team has made -->

Do not fetch or mutate data inside `AdminCrudList` or `AdminDataTable`. Keep
those operations in the page and pass controlled state plus rendered action
slots. Do not restore an `any` index signature to shared wrappers.
