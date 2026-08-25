# Type Safety

> Type safety patterns in this project.

---

## Overview

<!--
Document your project's type safety conventions here.

Questions to answer:
- What type system do you use?
- How are types organized?
- What validation library do you use?
- How do you handle type inference?
-->

The web app uses strict TypeScript. Shared UI contracts are explicit exported
types; generic table contracts carry the row type from the page to each cell.
Use `AppTone`, `AppButtonVariant`, and `AppControlSize` instead of raw color
strings in new application-owned controls.

---

## Type Organization

<!-- Where types are defined, shared types vs local types -->

Domain types stay in their owning module. Cross-component presentation types
live in `components/admin-ui/types.ts`; pure state helpers are imported by
both components and tests without importing React.

---

## Validation

<!-- Runtime validation patterns (Zod, Yup, io-ts, etc.) -->

This UI layer receives validated domain records from page/module services.
Runtime parsing belongs at the API/module boundary; presentation components
must not cast unknown API payloads or redefine domain contracts.

---

## Common Patterns

<!-- Type utilities, generics, type guards -->

Prefer discriminated unions for interaction props, generic functions for row
operations, `ReadonlySet<string>` for stable selection, and `ReactNode` for
slots. Compatibility fields are named and finite, not an index signature.

---

## Forbidden Patterns

<!-- any, type assertions, etc. -->

Do not introduce `any` index signatures to shared wrappers. If Mantine
polymorphic types require a compatibility assertion, keep it inside the
wrapper and expose a typed public prop surface.
