# Reader Performance Virtualization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use the inline execution workflow and keep each task independently testable.

**Goal:** Make very large local manga readers responsive by loading bounded page windows and rendering only visible main pages and thumbnails.

**Architecture:** The server returns a compact reader manifest plus a small initial page window. A reader page-window route serves additional pages by comic ID and global index. The client maintains a bounded page cache and uses pure prefix-layout calculations to render virtual main and thumbnail rails without changing the existing page-image or progress contracts.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Drizzle/SQLite, Vitest, existing pageId image and thumbnail APIs.

## Global Constraints

- Keep `apps/web` as the implementation target; do not move logic into `apps/prototype`.
- Keep the dependency flow route/page/component → module service/repository → database or adapter.
- Page image APIs read by `pageId`; never accept arbitrary filesystem paths from the client.
- Do not introduce a `prisma/` directory or database schema migration.
- Preserve local files, chapter ordering, reading progress, queue navigation, and existing reader visual language.
- Do not add a third-party virtualization dependency unless the existing stack cannot support the bounded implementation.

## File Map

- `apps/web/src/modules/library/comics.repository.ts`: reader manifest/window data contract and bounded SQL access.
- `apps/web/src/modules/library/comics.repository.test.ts`: repository regression coverage.
- `apps/web/src/app/api/reader/[comicId]/pages/route.ts`: bounded page-window API.
- `apps/web/src/modules/reader/virtual-layout.ts`: pure layout/range helpers.
- `apps/web/src/modules/reader/virtual-layout.test.ts`: deterministic layout tests.
- `apps/web/src/app/(site)/reader/[id]/page.tsx`: manifest route wiring.
- `apps/web/src/components/reader-view.tsx`: bounded client cache and virtual rails.
- `apps/web/src/app/globals.css`: virtual rail positioning styles.

## Execution Checklist

### Task 1: Repository manifest and windows

- [ ] Add typed manifest/window interfaces.
- [ ] Add ordered chapter start indices and last-read global index.
- [ ] Add bounded cross-chapter page query with limit clamp.
- [ ] Add repository tests for valid, cross-chapter, empty and invalid ranges.

### Task 2: Window API

- [ ] Add `GET /api/reader/:comicId/pages?start=&limit=`.
- [ ] Validate bounds and return only page metadata, never local paths.
- [ ] Verify 404/empty behavior.

### Task 3: Pure layout helpers

- [ ] Add variable-height page prefix positions using stored dimensions.
- [ ] Add binary-search visible range and fixed-row thumbnail range.
- [ ] Add edge-case tests.

### Task 4: Virtualized reader

- [ ] Seed page cache from the manifest window.
- [ ] Fetch merged windows as scroll/jump approaches uncached pages.
- [ ] Render only main page overscan and virtual thumbnail overscan.
- [ ] Preserve active page, keyboard navigation, progress, chapter dividers and queue footer.

### Task 5: Route/styles/verification

- [ ] Wire the route to the manifest.
- [ ] Add minimal virtual rail styles.
- [ ] Run focused tests, lint, typecheck, build, and local 6,170-page smoke checks.
- [ ] Review diff and report remaining gaps.
