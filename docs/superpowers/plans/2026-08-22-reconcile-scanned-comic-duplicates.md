# Reconcile Scanned Comic Duplicates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reuse an existing metadata-created comic when a matching local ZIP/directory is scanned, and safely collapse the current one-file duplicate case so reader URLs resolve to the metadata comic.

**Architecture:** Keep the behavior inside `modules/library` and the existing scan transaction. Matching uses the normalized `sortTitle`; active records (`readable`, `missing_local_file`, `remote_only`) are candidates, with an empty `remote_only` record preferred so metadata/resources remain attached. If an already-scanned local file belongs to a same-title duplicate, move only its database associations to the preferred record and soft-delete the now-empty duplicate; no physical file is moved.

**Tech Stack:** Next.js App Router, TypeScript, Drizzle ORM, SQLite, Vitest, `yauzl` archive scanning.

## Global Constraints

- `docs/plan.md` is the source of truth for product scope and module boundaries.
- Keep business rules in `modules/library`, not in Route Handlers.
- ZIP/CBZ files remain lazy archive-backed reader files; do not extract them fully.
- Physical files must not be deleted or moved by duplicate reconciliation.
- User-edited display titles and tags must not be overwritten.
- Keep duplicate reconciliation deterministic and idempotent.

---

### Task 1: Add regression coverage for metadata-first scanning and existing duplicates

**Files:**
- Modify: `apps/web/src/modules/library/scan-library-root.test.ts`
- Modify: `apps/web/src/modules/library/scan-library-root.ts`

**Interfaces:**
- `scanMangaRoot(mangaRootId: string)` must return the existing `comicId` through persisted rows when a local entry matches an existing active comic by `sortTitle`.
- A second scan of the same root must not create another comic, local file, chapter, or page for the same relative path.

- [x] **Step 1: Write the failing test**

Add a test that creates a root containing `Matched Comic.cbz`, inserts an existing `remote_only` comic with the same normalized title and source/resource rows, scans the root, and asserts:

```ts
expect(firstScan?.addedCount).toBe(1);
expect(sqlite.prepare("select count(*) as c from comics").get()).toMatchObject({ c: 1 });
expect(sqlite.prepare("select status, primary_local_file_id from comics where id = ?").get(remoteComicId)).toMatchObject({ status: "readable" });
expect(sqlite.prepare("select count(*) as c from local_files where comic_id = ?").get(remoteComicId)).toMatchObject({ c: 1 });
expect(sqlite.prepare("select count(*) as c from pages p join chapters c on c.id = p.chapter_id where c.comic_id = ?").get(remoteComicId)).toMatchObject({ c: 2 });

const secondScan = await scanMangaRoot(root.id);
expect(secondScan.addedCount).toBe(0);
expect(sqlite.prepare("select count(*) as c from comics").get()).toMatchObject({ c: 1 });
expect(sqlite.prepare("select count(*) as c from local_files").get()).toMatchObject({ c: 1 });
```

Also add a one-file historical duplicate fixture: a `remote_only` record and a `readable` same-title record owning the ZIP. After rescanning, assert the remote record becomes readable with the local file/page associations, the old readable record is `deleted` with no primary local file, and the ZIP still exists at its original path.

- [x] **Step 2: Run the focused test to verify it fails**

Run from `apps/web`:

```powershell
npm exec vitest run src/modules/library/scan-library-root.test.ts
```

Expected: the new metadata-first assertion fails because the current scanner always inserts a new comic after finding a same-title candidate.

### Task 2: Make scanning reuse and reconcile same-title records

**Files:**
- Modify: `apps/web/src/modules/library/scan-library-root.ts`

**Interfaces:**
- Add deterministic candidate selection within the existing scan transaction.
- Reuse candidates with status `readable`, `missing_local_file`, or `remote_only`; exclude `hidden` and `deleted` from automatic matching.
- Prefer an active `remote_only` candidate without a local file, then an existing active local candidate, then the earliest candidate by `createdAt`.

- [x] **Step 1: Implement candidate selection**

Replace the single `.get()` duplicate probe with an ordered candidate list by `sortTitle`. Count a candidate as a duplicate candidate, but use the selected candidate instead of unconditionally generating a new comic ID.

- [x] **Step 2: Implement local-file attachment**

When no local file exists for the scanned relative path and a candidate is selected, insert the new `local_files`, `chapters`, and `pages` rows using the selected comic ID. Set `primary_local_file_id` only when the candidate has no primary file or its primary file is missing; transition `remote_only`/`missing_local_file` to `readable` while preserving display/metadata fields.

- [x] **Step 3: Implement one-file historical duplicate reconciliation**

When the scanned path already belongs to a same-title `readable` candidate and an active `remote_only` candidate has no local file, update the existing local file and its chapters to the remote comic, set the remote comic readable/primary, clear the old comic primary pointer, and mark the old comic `deleted`. Perform this only when the old comic owns exactly one local file and one chapter, so multi-chapter or multi-file records are not silently collapsed.

- [x] **Step 4: Keep the scan transaction idempotent**

Continue skipping an existing `(manga_root_id, relative_path)` local file after reconciliation. Do not create a second chapter/page set on subsequent scans, and do not change physical paths.

### Task 3: Verify behavior and update project documentation

**Files:**
- Modify: `docs/implemented-features.md`

- [x] **Step 1: Run focused library tests**

```powershell
npm exec vitest run src/modules/library/scan-library-root.test.ts
```

Expected: all scan-library-root tests pass, including the new metadata-first and historical-duplicate cases.

- [x] **Step 2: Run the relevant download regression tests**

```powershell
npm exec vitest run src/modules/downloads/openlist-download-preparation.test.ts src/modules/downloads/offline-duplicate-recover.test.ts
```

Expected: ZIP/CBZ finalization and offline recovery tests pass.

- [x] **Step 3: Document the behavior**

Add a concise implemented-features note that local scanning reuses matching active metadata records and avoids creating a new comic for an already-known relative path; historical one-file duplicates are soft-deleted only when their local associations are safely reassigned without moving physical files.

- [x] **Step 4: Run diff and type/lint checks**

```powershell
git diff --check
npm exec eslint -- src/modules/library/scan-library-root.ts src/modules/library/scan-library-root.test.ts
npm run typecheck -w apps/web
```

Expected: diff check and targeted lint pass; typecheck has no errors attributable to this change.

**Verification note:** The two new duplicate-reconciliation tests pass, the OpenList ZIP/CBZ regression suite passes (7/7), targeted lint passes, and typecheck passes. The complete `scan-library-root.test.ts` file still has one pre-existing failure at its old magnet-provider assertion: implementation returns `openlist`, while that assertion expects `aria2`.
