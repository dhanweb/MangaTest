# Current UI Audit

## Evidence Sources

- `docs/plan.md:1085-1087` establishes Mantine and the prototype `App*` wrappers as the preferred UI foundation.
- `apps/web/package.json` already includes `@mantine/core`, `@mantine/hooks`, `lucide-react`, and `react-draggable`; no new production dependency is needed.
- `apps/web/src/lib/theme.tsx` defines pink/ink palettes and default Mantine control sizes.
- `apps/web/src/components/ui/app-components.tsx` is the current shared wrapper, but it combines unrelated components and exposes permissive `any` props for buttons and badges.

## Current Problems

### List layout duplication

- `apps/web/src/app/admin/comics/comics-panel.tsx:59-110` puts refresh in the heading and search/status in a second row.
- `apps/web/src/app/admin/videos/videos-panel.tsx:23-27` repeats the same split layout and implements a different pagination UI.
- Manga management owns fixed-right action-cell styles at `comics-panel.tsx:132-195`; other tables do not share that behavior.
- Status pills are locally implemented in manga, video, paths, files, downloads, and detail panels.

### Table ownership inventory

The following eleven files own application record tables and are migration targets:

1. `apps/web/src/app/admin/comics/comics-panel.tsx`
2. `apps/web/src/app/admin/videos/videos-panel.tsx`
3. `apps/web/src/app/admin/tags/tags-panel.tsx`
4. `apps/web/src/app/admin/paths/paths-panel.tsx`
5. `apps/web/src/app/admin/paths/video-paths-panel.tsx`
6. `apps/web/src/app/admin/files/files-panel.tsx`
7. `apps/web/src/app/admin/collections/collections-panel.tsx`
8. `apps/web/src/app/admin/downloads/downloads-panel.tsx`
9. `apps/web/src/app/admin/pixiv-sync/pixiv-sync-panel.tsx`
10. `apps/web/src/app/admin/comics/[id]/comic-admin-detail-panel.tsx`
11. `apps/web/src/app/admin/videos/[id]/video-admin-detail-panel.tsx`

Top-level catalog screens need the full CRUD/list shell. Detail and operational tables need only the base data-table layer.

### Modal layout duplication

- `apps/web/src/components/ui/app-components.tsx:168-261` provides a draggable Mantine modal but no footer slot and no default body-only scrolling.
- `apps/web/src/app/admin/tags/tags-panel.tsx:279-322` and `apps/web/src/app/admin/files/files-panel.tsx:477-501` render footer actions inside the body stack.
- `apps/web/src/app/admin/comics/[id]/comic-admin-detail-panel.tsx:596-674` locally repairs the modal layout with page-specific flex/overflow rules, proving the behavior belongs in the shared modal.
- Direct Mantine modals remain in manga cover preview and video merge flows.
- Eight native `window.confirm` call sites bypass application styling and accessible async dialog behavior.

### Control inconsistency

- Feature code contains more than 200 `AppButton` usages, 26 direct Mantine `ActionIcon` occurrences, direct Mantine badges, raw button elements, and many hand-built status/tag pills.
- Existing `AppButton` uses an arbitrary-prop index signature to support polymorphism. A separate typed `AppLinkButton` avoids keeping that escape hatch.
- Page-local CSS still owns several button/tag hover selectors, so migration must remove selectors only after the last consumer moves.

## Testing Constraints

- `apps/web/vitest.config.ts` uses `environment: "node"`.
- The repository currently has no Playwright files or browser/component test configuration.
- Pagination and selection algorithms can receive focused Vitest coverage without new dependencies.
- Fixed columns, responsive toolbars, focus trapping, and modal viewport/scroll behavior require a repeatable browser matrix during this task.

## Resulting Recommendation

- Build `AdminDataTable<T>` plus `AdminCrudList`, not one network-aware CRUD engine.
- Pilot manga and video lists before broad migration.
- Build strict semantic `AppButton`/`AppLinkButton`/`AppIconButton`, `AppTag`, and a fixed-layout `AppModal` plus asynchronous confirmation provider.
- Migrate in page-sized commits because settings, downloads, Pixiv sync, and detail panels are large and contain unrelated business behavior.
