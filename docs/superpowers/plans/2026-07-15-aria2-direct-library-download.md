# Aria2 Direct-to-Library Download Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** implemented in this session.

**Goal:** Make aria2 write files to the final import manga root so completed files stay at the same path aria2 logged; finalize only registers/scans and no longer moves aria2 outputs out of that path.

**Architecture:** Keep the existing transfer → finalization pipeline, but change destination resolution for aria2 writes. `download_task_transfers.temp_file_path` continues to mean “downloaded absolute path” (historical column name). `finalizeDownloadedTask` becomes path-aware: if the file is already under the import root, skip move; if it is still under cache `downloads/tmp/{taskId}`, keep the old move path for non-aria2 HTTP temp downloads.

**Tech Stack:** TypeScript, Node fs, existing downloads module, Vitest.

## Global Constraints

- Do not move/rename completed aria2 outputs away from the download path (aria2 log must remain valid).
- Library must still only scan after transfer completes (finalize step).
- OpenList pure-fetch (no aria2) may keep cache temp + move.
- Cancel must not wipe whole manga roots; only task destination trees.
- `downloadDefaultTargetDirectory` / `{mangaRoot}/下载入库` remains the import root source of truth.

---

## Behavior

| Stage | Before | After (aria2) |
|-------|--------|----------------|
| Download dir | `{cache}/downloads/tmp/{taskId}` | `{importRoot}/` (single file `out`) or `{importRoot}/{uniqueTitle}/` (magnet/multi) |
| Complete | move to import root | **no move** |
| Finalize | move + scan | verify path + scan + write finalization |
| Cancel | delete temp dir | delete task destination under import root if still incomplete |

---

## Tasks

### Task 1: Destination helpers + finalize path-aware logic

**Files:**
- Modify: `apps/web/src/modules/downloads/index.ts`

- [ ] Add `isPathInsideParent(parent, child)` (or reuse assert semantics without throw).
- [ ] Add `resolveUniqueDirectory(candidate)`.
- [ ] Add `resolveAria2DirectPlacement(task, preferredFileName?)` → `{ importRoot, dir, out, expectedFinalPath }`.
- [ ] Change `finalizeDownloadedTask`:
  - If downloaded path under cache temp → existing move into unique final path.
  - If downloaded path under import root → `finalPath = downloadedPath` (if directory comic, keep directory path), no move.
  - Always scan import root and write finalization.

### Task 2: Wire aria2 download functions to direct placement

**Files:**
- Modify: `apps/web/src/modules/downloads/index.ts` (`downloadAria2Task`, OpenList+aria2 branch)
- Modify cancel cleanup paths if needed

- [ ] `downloadAria2Task`: place under import root (title folder for magnet/unknown).
- [ ] OpenList aria2 branch: place with unique final `out` under import root.
- [ ] On cancel/fail for direct paths: cleanup only the task destination file/dir, not whole import root.

### Task 3: Tests + docs

**Files:**
- Create/update download tests if practical (or focused unit tests for placement/finalize helpers)
- Modify: `docs/plan.md`, `docs/implemented-features.md`, plan file note

- [ ] Test finalize does not move when file already under import root.
- [ ] Test aria2 placement resolves under import root not cache tmp.
- [ ] Docs: aria2 downloads directly to import location; temp+move remains for non-aria2 stream path.

---

## Non-goals

- Changing OpenList offline cloud path (`/115Open/Temp`)
- Reworking transfer column names in DB
- Auto file-watcher scan during download
