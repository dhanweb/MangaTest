# Home Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with review checkpoints.

**Goal:** Add clickable numbered pagination to the public manga homepage while preserving search, sort, and tag filters.

**Architecture:** Keep pagination server-driven through the existing `searchReadableCards({ page, pageSize, query, sort, tags })` repository contract. The homepage will normalize the URL page value and render Mantine's accessible numbered `Pagination` control through the existing client-side router handler.

**Tech Stack:** Next.js App Router, TypeScript, Mantine, Vitest.

## Global Constraints

- `docs/plan.md` remains the source of truth for product scope and module boundaries.
- Public homepage pages show only local readable comics by default.
- Search, sort, and tag query parameters must survive page changes.
- Keep the existing 48-item page size and do not move business/query rules into the client component.

---

### Task 1: Normalize homepage page input

**Files:**
- Modify: `apps/web/src/app/(site)/page.tsx`.
- Modify: `apps/web/src/modules/library/comics.repository.ts`.
- Test: `apps/web/src/modules/library/comics.repository.test.ts`.

**Interfaces:**
- `HomePage` passes a finite positive integer `page` to `searchReadableCards`.

- [ ] **Step 1: Add a page parser and repository clamp**

Parse `params.page` with `Number`, return `1` for missing, non-finite, or values below `1`, and pass that result to the existing repository call. In `searchReadableCards`, count the filtered total before loading rows, clamp requests above the final page to the last page, and return the effective page.

- [ ] **Step 2: Keep all existing filters unchanged**

Continue normalizing `sort`, `q`, and repeated `tag` parameters exactly as the current route does.

### Task 2: Render numbered pagination controls

**Files:**
- Modify: `apps/web/src/app/(site)/library-home.tsx`.

**Interfaces:**
- `PaginationBar` keeps `{ currentPage, totalPages, onPageChange }` and invokes `onPageChange` with a selected positive page number.

- [ ] **Step 1: Replace the text-only page indicator**

Use Mantine `Pagination` with `total={totalPages}`, `value={currentPage}`, `onChange={onPageChange}`, `siblings={1}`, `boundaries={1}`, `withEdges`, and the existing pink theme token.

- [ ] **Step 2: Preserve URL state transitions**

Keep `applySearch({ page })` as the only page-change callback so the router URL retains query, sort, and all selected tag values.

- [ ] **Step 3: Keep empty and single-page states quiet**

Return no pagination controls when `totalPages <= 1`, and keep the current empty-library panel unchanged.

### Task 3: Verify the feature

**Files:**
- Test: `apps/web/src/modules/library/comics.repository.test.ts`.

- [ ] **Step 1: Run the repository pagination test**

Run `npm run test -w apps/web -- src/modules/library/comics.repository.test.ts`; expect the page-two and out-of-range cases to pass.

- [ ] **Step 2: Run typecheck and targeted lint**

Run `npm run typecheck:web` and `npx eslint "src/app/(site)/page.tsx" "src/app/(site)/library-home.tsx"` from `apps/web`; expect exit code 0.

- [ ] **Step 3: Run the production build**

Run `npm run build:web`; expect the route `/` to compile successfully.

- [ ] **Step 4: Verify the running homepage**

Request `/`, `/?page=2&q=...`, and a URL with repeated `tag` parameters; confirm numbered page buttons render when multiple pages exist and the generated page links preserve the active filters.

- [ ] **Step 5: Run `git diff --check`**

Confirm the implementation introduces no whitespace errors.
