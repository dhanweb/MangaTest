# Unified Admin CRUD and Application UI Primitives — Execution Checklist

## Working Rules

- Implement in the order below; do not start application-wide migration before the comics/videos pilot is accepted.
- Preserve all current API calls, domain conditions, tab-state keys, form actions, and confirmation messages.
- Use Mantine and existing dependencies only.
- Keep each migration wave reviewable and run its focused checks before moving on.

## Task 1: Record the UI contract and add pure list-state helpers

**Files**

- Modify: `docs/plan.md`
- Create: `apps/web/src/components/admin-ui/admin-list-state.ts`
- Create: `apps/web/src/components/admin-ui/admin-list-state.test.ts`
- Create: `apps/web/src/components/admin-ui/types.ts`

**Deliverable**: semantic UI contracts and tested page/selection helpers with no rendered UI changes.

- [ ] Add the approved component/adoption rules to the product plan.
- [ ] Add tests for `clampPage`, `getRowNumber`, selectable-current-page keys, select-all, deselect-all, disabled rows, and selection preservation across pages.
- [ ] Run `npm run test -w apps/web -- admin-list-state.test.ts`; expect all focused tests to pass.
- [ ] Implement the minimal pure helpers and shared generic types.
- [ ] Run the focused test again and `npm run typecheck -w apps/web`.
- [ ] Commit as `feat(web): define admin list UI contracts`.

## Task 2: Implement typed button, icon-button, and tag primitives

**Files**

- Create: `apps/web/src/components/ui/app-button.tsx`
- Create: `apps/web/src/components/ui/app-tag.tsx`
- Modify: `apps/web/src/components/ui/app-components.tsx`
- Modify: `apps/web/src/lib/theme.tsx`

**Deliverable**: strict, semantic application controls (`AppButton`, `AppLinkButton`, `AppIconButton`, and `AppTag`) with compatibility exports.

- [ ] Add type-level fixtures/usages covering every tone, variant, size, icons, loading, disabled, native submit type, link rendering, icon-button label, static tag, interactive tag, and removable tag.
- [ ] Run `npm run typecheck -w apps/web`; expect failure until the new exports exist.
- [ ] Implement the single semantic tone map and the typed components.
- [ ] Replace the `any` prop contracts in `app-components.tsx` with re-exports/typed compatibility aliases.
- [ ] Run lint and typecheck; manually inspect all tone/variant combinations in a temporary development showcase, then remove the showcase.
- [ ] Commit as `feat(web): add unified button and tag primitives`.

## Task 3: Implement the fixed-layout modal and confirmation service

**Files**

- Create: `apps/web/src/components/ui/app-modal.tsx`
- Create: `apps/web/src/components/ui/app-confirm-dialog.tsx`
- Modify: `apps/web/src/components/ui/app-components.tsx`
- Modify: `apps/web/src/lib/theme.tsx`

**Deliverable**: one modal contract with fixed header/footer, scroll body, optional dragging, and queued asynchronous confirmation.

- [ ] Add unit tests for the confirmation queue reducer/state machine: resolve confirm/cancel once, serialize requests, and resolve outstanding requests false on teardown.
- [ ] Run the focused test and observe it fail before implementation.
- [ ] Implement the modal flex layout and footer nowrap behavior from `design.md`.
- [ ] Implement `AppConfirmProvider`, `useAppConfirm`, and `AppConfirmDialog`; mount the provider inside `Providers`.
- [ ] Verify with a tall-body fixture at 390x844, 768x1024, and 1440x900 that only the body scrolls and footer buttons stay visible/on one line. Verify Tab, Shift+Tab, Escape, overlay click, close guard, and focus restoration.
- [ ] Commit as `feat(web): add fixed-layout modal and confirmations`.

## Task 4: Implement `AdminDataTable` and `AdminCrudList`

**Files**

- Create: `apps/web/src/components/admin-ui/admin-data-table.tsx`
- Create: `apps/web/src/components/admin-ui/admin-crud-list.tsx`
- Create: `apps/web/src/components/admin-ui/admin-page-header.tsx`
- Create: `apps/web/src/components/ui/empty-state.tsx`
- Create: `apps/web/src/components/ui/overflow-tooltip-text.tsx`

**Deliverable**: controlled, domain-free table/list presentation components.

- [ ] Add compile fixtures for ordinary, fixed-right, sequence, selection, disabled-selection, empty, loading, custom-content, and controlled-pagination configurations.
- [ ] Run typecheck and observe missing component failures.
- [ ] Implement selection/sequence columns, fixed offset calculation, sticky surfaces, scroll container, empty/loading rows, and operation-cell nowrap.
- [ ] Implement the single-row desktop toolbar and responsive wrapping, refresh loading state, batch/primary action slots, total/page-size/pagination footer, and page clamping callback.
- [ ] Implement standard page header, empty state, and overflow tooltip text.
- [ ] Run focused state tests, lint, and typecheck.
- [ ] Commit as `feat(web): add reusable admin data table and CRUD list`.

## Task 5: Pilot the shared admin list on comics and videos

**Files**

- Modify: `apps/web/src/app/admin/comics/comics-panel.tsx`
- Modify: `apps/web/src/app/admin/videos/videos-panel.tsx`

**Deliverable**: two fully migrated list pages proving the API before broad rollout.

- [ ] Capture current filtering, tab-state keys, page sizes, status labels, cover preview, links, empty text, and refresh behavior in a migration checklist.
- [ ] Convert both headings to `AdminPageHeader`, with no refresh action in the heading.
- [ ] Convert both toolbars/pagination sections to `AdminCrudList`; place search, status, and refresh on the same desktop row.
- [ ] Convert both tables to typed columns with a page-aware sequence column and a fixed-right operation column. Use `AppTag` for status and `AppButton` for view.
- [ ] Convert comic cover preview from direct Mantine `Modal` to `AppModal`.
- [ ] Verify search resets page, status resets page, page size clamps page, refresh retains intended tab state, fixed action cells remain readable during horizontal scroll, and empty results render correctly.
- [ ] Run lint, typecheck, tests, and build.
- [ ] Commit as `refactor(web): migrate comic and video admin lists`.

## Task 6: Migrate remaining admin tables and list shells

**Files**

- Modify: `apps/web/src/app/admin/tags/tags-panel.tsx`
- Modify: `apps/web/src/app/admin/paths/paths-panel.tsx`
- Modify: `apps/web/src/app/admin/paths/video-paths-panel.tsx`
- Modify: `apps/web/src/app/admin/files/files-panel.tsx`
- Modify: `apps/web/src/app/admin/collections/collections-panel.tsx`
- Modify: `apps/web/src/app/admin/downloads/downloads-panel.tsx`
- Modify: `apps/web/src/app/admin/pixiv-sync/pixiv-sync-panel.tsx`
- Modify: `apps/web/src/app/admin/comics/[id]/comic-admin-detail-panel.tsx`
- Modify: `apps/web/src/app/admin/videos/[id]/video-admin-detail-panel.tsx`

**Deliverable**: every current admin-owned table uses `AdminDataTable`; top-level record lists use `AdminCrudList` or its custom-content slot.

- [ ] Migrate tags and paths first; preserve create/edit actions, form actions, root guards, and search behavior.
- [ ] Migrate files and collections; use controlled multi-select where bulk/merge workflows already support multiple records, without inventing new destructive bulk operations.
- [ ] Migrate downloads and Pixiv sync table-by-table; keep tabs, expansion rows, task controls, and provider behavior in the page.
- [ ] Migrate comic chapter/local-file/source/log tables and video episode tables using the base table only.
- [ ] Use fixed-right action columns wherever the table has row actions; use `AppIconButton` for compact actions and `AppTag` for statuses.
- [ ] Search `apps/web/src/app/admin` for Mantine `Table` imports; expect zero application-owned record table imports.
- [ ] Verify each migrated page at desktop/tablet/mobile widths, then run lint, typecheck, tests, and build.
- [ ] Commit in page-sized commits rather than one large commit.

## Task 7: Migrate all modal and confirmation call sites

**Files**

- Modify: all files reported by `rg -n '<(Modal|AppModal|DraggableModal|Dialog)|window\.confirm' apps/web/src --glob '*.tsx'`
- Key files: settings, tags, files, paths, Pixiv sync, comic detail, video detail, comics list, and collections.

**Deliverable**: all application-owned dialogs share the fixed layout and all confirmations share the accessible confirmation service.

- [ ] Move existing page-local footer button groups into the `footer` slot.
- [ ] Remove page-local modal height/body/header/footer styles now owned by `AppModal`.
- [ ] Replace direct Mantine modal and `DraggableModal` imports with `AppModal`.
- [ ] Replace every `window.confirm` with `useAppConfirm`; guard form resubmission and async actions against double execution.
- [ ] Verify search results show no application-owned direct modal/dialog/native-confirm call sites.
- [ ] Browser-test the largest comic/video merge modals and the smallest confirmation modal with keyboard and narrow viewport checks.
- [ ] Commit as `refactor(web): migrate dialogs to unified modal`.

## Task 8: Migrate buttons, icon buttons, and tags application-wide

**Files**

- Modify: all application files reported by searches for direct Mantine `Button`, `ActionIcon`, raw `<button>`, `Badge`, `AppBadge`, and hand-built status pill styles.
- Include: public site, reader, admin workbench, shared detail views, and all admin pages.

**Deliverable**: one visible interaction/style language across the application.

- [ ] Migrate standard actions to `AppButton`, button-styled navigation to `AppLinkButton`, and map raw colors to semantic tones.
- [ ] Migrate compact icon actions to `AppIconButton` with Chinese labels/tooltips.
- [ ] Migrate status/category/removable pills to `AppTag`; keep domain label/tone mappings adjacent to the owning feature.
- [ ] Remove obsolete page-local hover rules only after confirming they have no remaining consumer.
- [ ] Search for direct controls and classify every remaining match as an approved low-level implementation or migrate it.
- [ ] Keyboard- and pointer-test hover/focus/active/disabled/loading across primary, neutral, success, warning, danger, and info tones.
- [ ] Commit by surface (`admin`, `site`, `reader/workbench`) to preserve rollback granularity.

## Task 9: Final documentation and quality gate

**Files**

- Modify: `.trellis/spec/web/frontend/component-guidelines.md`
- Modify: `.trellis/spec/web/frontend/directory-structure.md`
- Modify: `.trellis/spec/web/frontend/quality-guidelines.md`
- Modify: `docs/plan.md` if implementation discoveries changed the approved contract

**Deliverable**: executable conventions plus a verified migration.

- [ ] Document component selection rules, exact imports, controlled-state ownership, semantic tone mappings, fixed modal layout, table special columns, and forbidden direct usages with real code examples.
- [ ] Run `rg` audits for direct Table/Modal/Dialog/Button/ActionIcon/Badge/native-confirm usages and record justified low-level exceptions.
- [ ] Run `npm run lint -w apps/web`.
- [ ] Run `npm run typecheck -w apps/web`.
- [ ] Run `npm run test -w apps/web`.
- [ ] Run `npm run build -w apps/web`.
- [ ] Perform the browser matrix in AC12 and record any remaining gap before claiming completion.
- [ ] Run `git diff --check`.
- [ ] Commit as `docs(web): codify shared UI conventions`.

## Rollback Points

- After Task 4: additive primitives only; safe to revert without page changes.
- After Task 5: pilot pages can be reverted independently if the generic API is insufficient; update `design.md` before retrying.
- During Tasks 6–8: revert per-page/per-surface commits without removing shared primitives used by already migrated pages.
- Never revert unrelated worktree changes.
