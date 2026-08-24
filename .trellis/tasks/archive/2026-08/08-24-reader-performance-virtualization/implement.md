# 阅读页窗口化与虚拟化实施计划

## Files and responsibilities

- Modify `apps/web/src/modules/library/comics.repository.ts`: add typed reader manifest and bounded page-window queries; keep legacy `getReaderData` compatibility.
- Modify `apps/web/src/modules/library/comics.repository.test.ts`: verify manifest initial window, global indices, cross-chapter windows and invalid bounds.
- Create `apps/web/src/app/api/reader/[comicId]/pages/route.ts`: validate query parameters and expose the bounded window contract.
- Create `apps/web/src/modules/reader/virtual-layout.ts`: pure page/thumbnail layout calculations and binary-search range selection.
- Create `apps/web/src/modules/reader/virtual-layout.test.ts`: test empty data, single page, chapter boundaries, overscan and clamped ranges.
- Modify `apps/web/src/app/(site)/reader/[id]/page.tsx`: load the bounded manifest instead of the legacy all-pages reader record.
- Modify `apps/web/src/components/reader-view.tsx`: maintain page-window cache, fetch bounded windows, virtualize main pages and thumbnails, and preserve existing controls.
- Modify `apps/web/src/app/globals.css`: add only the spacer/absolute-position styles required by the virtual rails; preserve existing reader colors and controls.

## Ordered execution

### Task 1: Add repository contracts and bounded window queries

- Define manifest/window interfaces in the library repository module.
- Build chapter start indices from the existing `chapters.sortOrder` + `pages.pageNumber` ordering.
- Resolve `lastReadPageIndex` by locating `lastReadPageId` in the same ordered sequence.
- Implement a bounded query that returns at most 96 page rows and fills `chapterTitle` from the joined chapter.
- Add tests for a multi-chapter fixture, a window that crosses a chapter, empty/out-of-range start, and limit clamping.

Validation: `npm run test -w apps/web -- src/modules/library/comics.repository.test.ts`.

### Task 2: Add the reader page-window route

- Parse `start` and `limit` from `URLSearchParams`.
- Call the repository window method with the route `comicId`.
- Return JSON with `comicId`, `startIndex`, `totalPages`, and `pages`; return 404 for an unknown/unreadable comic and 400 only for malformed identifiers if the repository contract requires it.
- Do not expose filesystem paths or bypass the existing page image APIs.

Validation: add route-level assertions if the project’s route test pattern supports them; otherwise exercise the endpoint with a local read-only request after Task 4.

### Task 3: Add pure virtual-layout calculations

- Define a layout input containing ordered page metadata, chapter start indices, content width, divider height, fallback aspect ratio, and overscan counts.
- Return `pageTop`, `pageHeight`, `itemHeight`, and `totalHeight` for each logical page without creating DOM nodes.
- Implement `findPageIndexAtOffset` with binary search and `getVisiblePageRange` with clamping.
- Implement the fixed-row thumbnail range separately so its scroll height and visible window do not depend on image loading.

Validation: run the new unit test file and assert that all returned ranges are within `[0, totalPages - 1]`.

### Task 4: Refactor ReaderView to a bounded page cache and virtual rails

- Replace the initial `comic.pages` full-page rendering path with a page cache seeded by `initialPages`.
- Track the main scroll container width and visible range; when the range approaches an uncached page, fetch one merged window of up to 96 pages.
- Render a fixed-height virtual content spacer and only the visible page items plus overscan. Keep chapter dividers inside their corresponding item and keep the existing top/bottom reader dividers.
- Change page jump to use computed offsets, so a page can be targeted before its DOM node exists; then fetch the target window and update the active page.
- Replace the full thumbnail `pages.map()` with a fixed-row virtual rail. Preserve keyboard activation, active highlighting, and centered thumbnail behavior.
- Remove per-image full-tree aspect-ratio state updates; use stored dimensions with the fallback ratio.
- Keep progress saving and keyboard shortcuts unchanged at the public behavior level.

Validation: run typecheck, then load the 6,170-page comic locally and inspect DOM counts and network request windows.

### Task 5: Update route wiring and styles

- Make the reader page call the new manifest repository method.
- Add spacer/absolute-position CSS with semantic reader classes only; do not change public page layout outside the reader.
- Confirm the legacy `getReaderData` tests still pass and no code path uses the all-pages method for production reader navigation.

Validation: `npm run lint -w apps/web`, `npm run typecheck -w apps/web`, and the focused Vitest suite.

### Task 6: Full verification and handoff

- Run `git diff --check`.
- Run the focused tests, all web tests if feasible, lint, typecheck and build.
- Request the local reader route and verify the initial response is bounded, DOM main-image/button counts are bounded, jump-to-far-page works, and progress requests still use `pageId`.
- Review the diff for unrelated changes and preserve all existing user/agent work.
