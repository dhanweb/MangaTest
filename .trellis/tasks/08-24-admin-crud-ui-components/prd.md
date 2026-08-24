# Unified Admin CRUD and Application UI Primitives

## Goal

Create a consistent, reusable UI foundation for MangaTest so admin record-management screens share one list/table experience and the entire web application shares one modal, button, icon-button, and tag language. The change must fix the current layout where list refresh actions sit in the page heading instead of on the same toolbar row as search and filters.

## Background and Confirmed Facts

- `docs/plan.md` makes Mantine the primary UI library for workflows matched to the prototype and explicitly prefers the existing `App*` component approach.
- `apps/web/src/components/ui/app-components.tsx` already contains `AppButton`, `AppBadge`, `AppInput`, `AppSelect`, `AppModal`, and `DraggableModal`, but `AppButton`/`AppBadge` accept arbitrary props through `any` and the modal does not own a fixed footer or a default scroll-body layout.
- `apps/web/src/app/admin/comics/comics-panel.tsx:57` renders refresh in the page heading, search/filter in a second row, hand-built pagination, hand-built status tags, and one locally implemented sticky action column.
- `apps/web/src/app/admin/videos/videos-panel.tsx:23` repeats the same heading/toolbar/table/pagination structure with different pagination controls.
- Eleven admin source files currently render Mantine tables directly. Detail and operational tables need the shared table primitive even when a complete CRUD toolbar is inappropriate.
- Current application code mixes `AppButton`, Mantine `ActionIcon`, direct Mantine `Modal`, `DraggableModal`, a base-ui `Dialog`, hand-built tags/status pills, and eight `window.confirm` calls.
- The current modal footer is page content. For example, `apps/web/src/app/admin/comics/[id]/comic-admin-detail-panel.tsx:669` places actions after a scroll area, and `apps/web/src/app/admin/tags/tags-panel.tsx:313` places actions inside the body stack. This allows tall content to push actions outside the usable viewport.
- No browser/component-test dependency is currently configured for `apps/web`; Vitest uses the Node environment. Pure state helpers can be unit tested, while responsive and scroll behavior requires browser verification unless separate UI-test infrastructure is approved later.

## Requirements

### R1. Component boundaries and ownership

- Use Mantine as the implementation foundation and the existing semantic theme tokens; do not add another component library.
- Keep data loading, mutation calls, domain rules, and page-specific filter predicates in their owning page/module.
- Provide two admin layers:
  - `AdminDataTable<T>` for any tabular admin view.
  - `AdminCrudList<T>` for record-management screens that need a unified toolbar, table/content slot, and pagination.
- Keep focused component files and retain `app-components.tsx` as a compatibility barrel during migration.

### R2. Unified admin CRUD/list shell

- Search input, zero or more filters, refresh, batch actions, and create/primary actions occupy one toolbar row on desktop.
- Search grows to consume remaining width. Filters and actions retain usable widths.
- At narrow widths the toolbar may wrap into clearly grouped rows; search and refresh must remain in the same toolbar region and refresh must never return to the page heading.
- The shell accepts controlled search, filter, loading, refresh, and pagination state. It does not fetch or mutate records itself.
- Pagination shows total records, current page, page-size selection, first/last navigation, and standard page-size options of 10, 20, and 50 with a default of 20 for new screens.
- Page changes are clamped when filtering or deletion reduces the total page count.
- The shell supports table content and custom non-tabular list content so existing collection cards or operational panels are not forced into an unsuitable table.

### R3. Unified typed data table

- `AdminDataTable<T>` receives typed column definitions and a stable row-key function.
- It supports loading, empty state, horizontal scrolling, consistent header/row density, hover state, and accessible table markup.
- It supports these special columns without page-local sticky CSS:
  - Sequence column, calculated across pages as `(page - 1) * pageSize + rowIndex + 1`.
  - Multi-select column with select-current-page, indeterminate state, disabled rows, and controlled selected keys.
  - One or more fixed columns, including a fixed-right operation column with an edge shadow and an opaque hover/selected background.
- Selection must use stable row keys, not visible indexes, and preserve selections outside the current page unless the page explicitly clears them.
- Operation cells use the shared button/icon-button components and never wrap by default.

### R4. Unified modal and confirmation behavior

- `AppModal` owns a fixed header, a body that is the only vertically scrollable region, and an optional fixed footer.
- Modal content fits within the viewport using dynamic viewport height; header and footer remain visible with long body content.
- Footer actions remain one line, do not shrink, and remain usable on narrow screens through horizontal scrolling or a documented compact layout.
- The modal supports typed sizes, title as React content, optional description/header extras, footer content, close-button behavior, loading/close guards, and optional desktop dragging.
- Preserve focus trapping, Escape handling, overlay behavior, accessible title/description relationships, and restore focus on close.
- Migrate direct Mantine modals, `DraggableModal` call sites, base-ui dialogs, and destructive `window.confirm` flows to `AppModal` or `AppConfirmDialog`/`useAppConfirm`.

### R5. Unified buttons

- `AppButton` uses strict Mantine-compatible props instead of an `any` index signature.
- Support semantic tones `primary`, `neutral`, `success`, `warning`, `danger`, and `info`.
- Support visual variants `filled`, `light`, `outline`, `subtle`, and `transparent` and sizes `xs`, `sm`, `md`, and `lg`.
- Support left icon, right icon, text-only, icon-only, loading, disabled, submit/reset/button HTML behavior, and full width. Button-styled navigation uses the typed `AppLinkButton` companion instead of an untyped polymorphic escape hatch.
- Add `AppIconButton` for compact actions with a required accessible label or tooltip.
- Centralize default, hover, active, focus-visible, loading, and disabled behavior. Interactive styling must not be recreated in page-local inline styles.

### R6. Unified tags

- Replace `AppBadge` and hand-built status/category pills with `AppTag`.
- `AppTag` supports the same semantic tones, `soft`/`outline`/`filled` variants, sizes, optional icon, optional remove action, and optional link/button rendering.
- Non-interactive tags must not imply clickability. Hover emphasis is enabled only for interactive/removable tags.
- Domain-specific canonical tag translation remains owned by the `tags` module; `AppTag` only owns presentation and interaction chrome.

### R7. Application-wide adoption

- All current admin tables use `AdminDataTable`, including top-level manga/video/path/tag/file/collection/download/Pixiv views and chapter/episode/detail tables where applicable.
- Top-level searchable or pageable record-management screens use `AdminCrudList`; operational/detail tables use `AdminDataTable` directly.
- All visible application buttons use `AppButton`, `AppLinkButton`, or `AppIconButton`, including public site, reader, admin workbench, and admin pages. Plain text links and third-party component internals are not buttons and remain exempt.
- All application-owned modal/confirmation experiences use the unified modal family.
- All status/category/tag pills use `AppTag`; domain presentation may provide a small mapping from domain state to semantic tone.

### R8. Additional reusable pieces found during the audit

- Add `AdminPageHeader` to normalize title, icon, description, and page-level primary actions. Refresh remains in `AdminCrudList`, not in this header.
- Add `AppEmptyState` for table/list empty and no-match states.
- Extract the overflow-aware tooltip text used by dense tables into `OverflowTooltipText`.
- Keep `AppInput`, `AppSelect`, `AppTextarea`, `AppSwitch`, `AppTabs`, and toast as the standard form/feedback primitives, but do not introduce a form-builder abstraction in this task.
- Add `AppConfirmDialog`/`useAppConfirm` because destructive confirmation is repeated and native confirm cannot follow the modal design or accessibility contract.

### R9. Responsive, accessibility, and compatibility

- The table remains horizontally scrollable at 390px, 768px, and desktop widths; fixed columns must not cover the last data column.
- Toolbar inputs, buttons, pagination, modal header/footer, and selection checkboxes have keyboard-visible focus states.
- Icon-only actions have Chinese accessible names and tooltips.
- Existing URLs, data contracts, mutations, server/client ownership, admin tab-state persistence, and business behavior remain unchanged.
- Existing imports from `@/components/ui/app-components` continue to work during the migration; no all-at-once import break is allowed.

## Acceptance Criteria

- [ ] AC1: On manga and video management pages, search, status filters, refresh, and any primary list action render in the same toolbar on desktop; refresh is absent from the page heading.
- [ ] AC2: At least one migrated table demonstrates page-aware sequence numbers, one demonstrates multi-select/select-current-page, and every applicable record table uses a fixed-right operation column without page-local sticky CSS.
- [ ] AC3: All eleven current admin table-owning source files use `AdminDataTable` directly or through `AdminCrudList`; no page imports Mantine `Table` for an application-owned record table.
- [ ] AC4: Pagination layout and behavior are identical across migrated pageable screens, including total, page size, page buttons, filter reset, and out-of-range page clamping.
- [ ] AC5: A modal with body content taller than the viewport keeps its title, close button, and footer actions visible while only its body scrolls at desktop, tablet, and mobile viewport sizes.
- [ ] AC6: Modal footer buttons remain on one line and usable; submitting/loading state can prevent accidental close.
- [ ] AC7: No application feature directly renders Mantine `Modal`, `DraggableModal`, base-ui `Dialog`, or `window.confirm`; approved third-party internals are exempt.
- [ ] AC8: Normal and icon-only application actions use the strict shared button components and show consistent hover, focus, active, loading, and disabled states for every semantic tone.
- [ ] AC9: Status, category, and removable tags use `AppTag`; interactive tags have consistent hover behavior and non-interactive tags do not.
- [ ] AC10: Existing list filtering, pagination results, selection semantics, mutations, links, and admin tab-state persistence continue to work.
- [ ] AC11: Pure pagination/selection helpers have focused Vitest coverage, and `npm run lint -w apps/web`, `npm run typecheck -w apps/web`, `npm run test -w apps/web`, and `npm run build -w apps/web` pass.
- [ ] AC12: Browser verification covers the admin comics, videos, tags, paths, files, downloads, collections, and both comic/video detail screens at 390px, 768px, and a desktop width, with keyboard and long-content modal checks.

## Out of Scope

- Backend API, database, scanner, downloader, metadata, or domain-rule changes.
- Server-side pagination/search rollout; the components accept controlled totals so it can be added later without redesign.
- Redesigning public manga/reader information architecture.
- Migrating `apps/prototype` or `apps/extension` in this task.
- Introducing TanStack Table, AG Grid, Ant Design, another UI library, a form builder, or a general data-fetching framework.
- Adding Playwright/component-test dependencies solely for this task; browser checks remain manual/agent-driven unless separately approved.

## Key Decisions

- Build composable presentation primitives rather than a CRUD engine that owns APIs or business rules.
- Use semantic `tone` plus visual `variant`; do not overload native button `type`.
- Standardize new pageable views on 20 rows while preserving intentional page sizes during staged migration when changing them would alter user behavior.
- Preserve optional desktop modal dragging, but fixed header/body/footer layout takes priority and dragging must be disabled or constrained when it would move content outside the viewport.
- Migrate in reviewable waves: foundations, pilot pages, remaining admin tables/lists, then application-wide button/modal/tag cleanup.

## Risks and Deferred Items

- `settings/page.tsx`, `downloads-panel.tsx`, `pixiv-sync-panel.tsx`, and both detail panels are large; migration must avoid combining unrelated refactors.
- Fixed columns plus horizontal scrolling require explicit opaque backgrounds for normal, hover, and selected rows to avoid content bleed.
- Async replacement of `window.confirm` needs guarded form submission/navigation to prevent duplicate actions.
- Full automated visual regression infrastructure is deferred; the plan requires repeatable browser matrices and build/type/lint/unit gates.
