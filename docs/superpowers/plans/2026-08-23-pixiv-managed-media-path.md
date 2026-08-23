# Pixiv Managed Media Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with review checkpoints.

**Goal:** Remove the manual MangaTest root selector from PixivDownloader configuration and make its download root an automatically managed, locked media path editable only from Pixiv sync.

**Architecture:** Keep the Pixiv source adapter responsible for ensuring its managed library root, while the library repository owns root persistence and rejects ordinary edit/delete operations for `kind=pixiv`. Pixiv sync continues to use the derived root ID internally for scanning and metadata sessions; the UI and user-facing settings only expose the database path and download root.

**Tech Stack:** Next.js App Router, TypeScript, Mantine, Drizzle/better-sqlite3, Vitest.

## Global Constraints

- `docs/plan.md` remains the source of truth and must describe the automatic Pixiv media-path ownership.
- The PixivDownloader SQLite database remains read-only; only MangaTest SQLite and path metadata may be changed.
- Changing the managed path must not move or delete physical manga files.
- Ordinary media-path management must not provide edit or delete controls for Pixiv-managed paths.
- Pixiv scan/sync must resolve its root from the configured absolute download path, not from a user-selected root ID.

---

### Task 1: Document the revised ownership model

**Files:**
- Modify: `docs/plan.md` PixivDownloader configuration, data model, and sync flow sections.
- Create: `docs/superpowers/plans/2026-08-23-pixiv-managed-media-path.md`.

**Interfaces:**
- Produces the source-of-truth rule that Pixiv download roots are `manga_roots.kind=pixiv` and are edited only from Pixiv sync.

- [x] **Step 1: Replace the manual root-selection requirement**

State that only the Pixiv database path and download root are configured, and saving the download root creates or updates the managed media path.

- [x] **Step 2: Record the locked-path behavior**

State that the paths page displays Pixiv roots but cannot edit or delete them, while Pixiv sync remains the owner of changes.

### Task 2: Add a Pixiv-managed manga-root kind and repository guardrails

**Files:**
- Modify: `apps/web/src/modules/core/db/schema.ts`.
- Modify: `apps/web/src/modules/library/manga-roots.ts`.
- Modify: `apps/web/src/modules/library/manga-roots.repository.ts`.
- Modify: `apps/web/src/app/admin/paths/paths-panel.tsx`.
- Modify: `apps/web/src/app/admin/paths/manga-root-edit-dialog.tsx`.
- Test: `apps/web/src/modules/library/manga-roots.repository.test.ts`.

**Interfaces:**
- Produces `mangaRootKinds = ["user", "system", "pixiv"]`.
- Produces `MangaRootRepository.ensureManaged(input: { absolutePath: string; kind: "pixiv"; displayName: string }): Promise<MangaRootRecord>`.
- `updateSettings` and `deleteUnused` reject `kind=pixiv`.

- [ ] **Step 1: Add the kind to the type contract**

Extend the schema and `MangaRootKind` union with `pixiv`, and include the kind in all mapped root records.

- [ ] **Step 2: Implement idempotent managed-root registration**

Normalize and validate the absolute path, reuse an existing row at that path, promote a non-system row to `pixiv`, or insert one new Pixiv row. Keep the operation free of physical file mutations.

- [ ] **Step 3: Enforce server-side immutability**

Reject Pixiv roots in repository update/delete methods so disabling controls in the UI is not the only protection.

- [ ] **Step 4: Lock the paths-page controls**

Show the Pixiv root as `PixivDownloader 下载目录` with a lock marker; keep open-folder and scan actions, but remove the edit dialog and disable delete.

- [ ] **Step 5: Add repository tests**

Verify registration is idempotent, same-path user roots are promoted, and Pixiv roots cannot be updated or deleted.

- [ ] **Step 6: Run the focused test**

Run `npm run test -w apps/web -- src/modules/library/manga-roots.repository.test.ts`; expect all tests to pass.

### Task 3: Derive Pixiv sync configuration from the managed root

**Files:**
- Modify: `apps/web/src/modules/metadata-ingest/sources/pixiv-downloader/types.ts`.
- Modify: `apps/web/src/modules/metadata-ingest/sources/pixiv-downloader/sync-service.ts`.
- Modify: `apps/web/src/app/api/settings/route.ts`.
- Modify: `apps/web/src/app/api/pixiv-downloader/check/route.ts`.
- Test: `apps/web/src/modules/metadata-ingest/sources/pixiv-downloader/sync-service.test.ts`.

**Interfaces:**
- `getPixivDownloaderConfig()` returns `{ dbPath: string; downloadRoot: string; mangaRootId: string }`, where `mangaRootId` is derived by `ensureManaged`.
- The settings PATCH path invokes `ensureManaged` when `pixivDownloaderDownloadRoot` is supplied before persisting the settings.

- [ ] **Step 1: Ensure the root while saving configuration**

Normalize the supplied download root, call `ensurePixivDownloaderMangaRoot` from `managed-root.ts`, and persist the returned root ID only as a derived compatibility value.

- [ ] **Step 2: Remove root-ID dependence from normal config reads**

Resolve the root by absolute download path first; retain old root-ID data only as compatibility input for existing databases and never require a UI selection.

- [ ] **Step 3: Keep connection checking compatible**

Accept requests containing only `dbPath` and `downloadRoot`; ignore the removed UI selector while preserving old request compatibility where safe.

- [ ] **Step 4: Add config behavior tests**

In `sync-service.test.ts`, save only database path and download root, assert a Pixiv manga root is created, and assert repeated config reads reuse the same ID.

### Task 4: Simplify the Pixiv sync UI

**Files:**
- Modify: `apps/web/src/app/admin/pixiv-sync/page.tsx`.
- Modify: `apps/web/src/app/admin/pixiv-sync/pixiv-sync-panel.tsx`.

**Interfaces:**
- `PixivSyncPanel` no longer receives `mangaRoots`.
- Configuration payload contains only `pixivDownloaderDbPath` and `pixivDownloaderDownloadRoot`.

- [ ] **Step 1: Remove the MangaTest root selector**

Delete the root options/state/select and display only the database file and Pixiv download-root inputs.

- [ ] **Step 2: Update copy and confirmation text**

Explain that the download root is automatically registered as a locked media path and that scan/sync use it automatically.

- [ ] **Step 3: Remove root ID from check requests**

Post only `dbPath` and `downloadRoot` to the connection check endpoint.

### Task 5: Verify end-to-end behavior

**Files:**
- Modify: `apps/web/src/modules/library/manga-roots.repository.test.ts`.
- Modify: `apps/web/src/modules/metadata-ingest/sources/pixiv-downloader/sync-service.test.ts`.

- [ ] **Step 1: Run targeted Pixiv and library tests**

Run `npm run test -w apps/web -- src/modules/library/manga-roots.repository.test.ts src/modules/metadata-ingest/sources/pixiv-downloader/sync-service.test.ts`.

- [ ] **Step 2: Run typecheck and lint**

Run `npm run typecheck:web` and `npm run lint:web`.

- [ ] **Step 3: Verify the running app**

Open `/admin/pixiv-sync` and `/admin/paths`, confirm no MangaTest root selector is rendered, and confirm a configured Pixiv root has no edit/delete controls.

- [ ] **Step 4: Run diff checks**

Run `git diff --check` and report any unrelated pre-existing worktree changes separately.
