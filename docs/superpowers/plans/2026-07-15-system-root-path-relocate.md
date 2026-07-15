# System Root Path Relocate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow editing only the built-in system manga root absolute path, with an explicit confirm dialog asking whether to physically move comics under that root; when the user chooses yes, move files and rewrite all related library paths; when no, retarget database paths only.

**Architecture:** Keep path editing in the `library` module as an application service (`relocateSystemMangaRoot`). Put filesystem move/copy safety in `local-files`. Admin Paths UI opens a system-only path editor with a two-step confirm modal (new path → move yes/no). Never move/delete files for user roots. Never auto-delete source files without a successful destination write.

**Tech Stack:** Next.js App Router server actions, TypeScript, better-sqlite3/Drizzle, Node `fs/promises` + `path`, Vitest, Mantine `AppModal`/`AppInput`/`AppButton` in `apps/web`.

## Global Constraints

- Only `manga_roots.kind === "system"` may change `absolutePath`.
- User roots stay description/enabled-only (current MVP behavior).
- Physical manga files may move only after explicit user confirmation (`moveFiles: true`).
- Physical file deletion of arbitrary comics remains out of scope; relocating the system root is a directory-level move/rename, not per-comic delete.
- New path must be absolute; do not silently create missing parent directories beyond the destination root itself.
- Destination must not already be another configured manga root.
- Destination must not be nested inside the old root or vice versa in a way that would corrupt a recursive move.
- Preserve `local_files.relativePath`; recompute `absolutePath = path.join(newRoot, relativePath)`.
- Preserve settings except optionally note if `downloadDefaultTargetDirectory` still points at the old root (do not auto-rewrite settings unless it exactly equals old root).
- Write an `operation_logs` entry for every successful relocate.
- Update `docs/plan.md` and `docs/implemented-features.md` in the same change set.
- Follow AGENTS.md module boundaries: routes/actions → library service → local-files filesystem adapter → DB.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `apps/web/src/modules/local-files/root-relocate.ts` | Pure-ish filesystem helpers: validate source/destination, list children, move tree, report failures |
| `apps/web/src/modules/local-files/root-relocate.test.ts` | Filesystem move tests on temp dirs |
| `apps/web/src/modules/library/relocate-system-manga-root.ts` | Application service: authorize system root, orchestrate move + DB rewrite |
| `apps/web/src/modules/library/relocate-system-manga-root.test.ts` | DB + optional move integration tests |
| `apps/web/src/modules/library/manga-roots.repository.ts` | Add low-level `updateAbsolutePath(id, absolutePath)` used only by the service |
| `apps/web/src/modules/core/db/schema.ts` | Add operation enum value `system_root_relocate` |
| `apps/web/src/app/admin/paths/actions.ts` | Server action `relocateSystemMangaRootAction` |
| `apps/web/src/app/admin/paths/system-root-path-dialog.tsx` | UI: edit system root path + move confirm |
| `apps/web/src/app/admin/paths/manga-root-edit-dialog.tsx` | Keep non-path fields; for system roots link/open path editor or embed path field |
| `apps/web/src/app/admin/paths/paths-panel.tsx` | Wire path-edit entry only for `kind === "system"` |
| `apps/web/src/modules/library/index.ts` | Export new service types |
| `docs/plan.md` | Document exception: system root relocate may move files when confirmed |
| `docs/implemented-features.md` | Record completed behavior |

---

### Task 1: Filesystem relocate helpers + tests

**Files:**
- Create: `apps/web/src/modules/local-files/root-relocate.ts`
- Create: `apps/web/src/modules/local-files/root-relocate.test.ts`
- Modify: `apps/web/src/modules/local-files/index.ts` (export new helpers)

**Interfaces:**
- Produces:
  - `validateRootRelocatePaths(input): RootRelocatePathValidation`
  - `moveMangaRootContents(input): Promise<RootRelocateMoveResult>`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/modules/local-files/root-relocate.test.ts
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { moveMangaRootContents, validateRootRelocatePaths } from "./root-relocate";

describe("root-relocate", () => {
  it("rejects nested destination under source", () => {
    const source = "D:\\data\\manga_store";
    const destination = "D:\\data\\manga_store\\nested";
    const result = validateRootRelocatePaths({ sourcePath: source, destinationPath: destination });
    expect(result.isValid).toBe(false);
    expect(result.reason).toMatch(/嵌套|子目录|冲突/);
  });

  it("moves directory and archive children to the new root", async () => {
    const workspace = path.join(os.tmpdir(), `mangatest-root-move-${randomUUID()}`);
    const source = path.join(workspace, "old-root");
    const destination = path.join(workspace, "new-root");
    await mkdir(path.join(source, "Comic A"), { recursive: true });
    await writeFile(path.join(source, "Comic A", "001.jpg"), "img");
    await writeFile(path.join(source, "Comic B.cbz"), "zip-bytes");

    const result = await moveMangaRootContents({ sourcePath: source, destinationPath: destination });
    expect(result.movedEntryCount).toBe(2);
    await expect(readFile(path.join(destination, "Comic A", "001.jpg"), "utf8")).resolves.toBe("img");
    await expect(readFile(path.join(destination, "Comic B.cbz"), "utf8")).resolves.toBe("zip-bytes");
    await expect(access(path.join(source, "Comic A"))).rejects.toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/modules/local-files/root-relocate.test.ts` (cwd: `apps/web`)

Expected: FAIL module not found / export missing

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/src/modules/local-files/root-relocate.ts
import { mkdir, readdir, rename, rm, stat, cp } from "node:fs/promises";
import path from "node:path";
import { validateAbsolutePath } from "./path-safety";

export interface RootRelocatePathValidation {
  isValid: boolean;
  normalizedSource: string | null;
  normalizedDestination: string | null;
  reason: string | null;
}

export interface RootRelocateMoveResult {
  movedEntryCount: number;
  destinationPath: string;
  sourcePath: string;
}

function isPathInside(parent: string, child: string) {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

export function validateRootRelocatePaths(input: {
  sourcePath: string;
  destinationPath: string;
}): RootRelocatePathValidation {
  const source = validateAbsolutePath(input.sourcePath);
  const destination = validateAbsolutePath(input.destinationPath);
  if (!source.isValid || !source.normalizedPath) {
    return { isValid: false, normalizedSource: null, normalizedDestination: null, reason: source.reason };
  }
  if (!destination.isValid || !destination.normalizedPath) {
    return { isValid: false, normalizedSource: source.normalizedPath, normalizedDestination: null, reason: destination.reason };
  }
  if (source.normalizedPath === destination.normalizedPath) {
    return {
      isValid: false,
      normalizedSource: source.normalizedPath,
      normalizedDestination: destination.normalizedPath,
      reason: "新路径不能与当前路径相同。",
    };
  }
  if (
    isPathInside(source.normalizedPath, destination.normalizedPath) ||
    isPathInside(destination.normalizedPath, source.normalizedPath)
  ) {
    return {
      isValid: false,
      normalizedSource: source.normalizedPath,
      normalizedDestination: destination.normalizedPath,
      reason: "新旧路径不能互相嵌套，否则会破坏目录迁移。",
    };
  }
  return {
    isValid: true,
    normalizedSource: source.normalizedPath,
    normalizedDestination: destination.normalizedPath,
    reason: null,
  };
}

export async function moveMangaRootContents(input: {
  sourcePath: string;
  destinationPath: string;
}): Promise<RootRelocateMoveResult> {
  const validation = validateRootRelocatePaths(input);
  if (!validation.isValid || !validation.normalizedSource || !validation.normalizedDestination) {
    throw new Error(validation.reason ?? "路径无效。");
  }

  const sourcePath = validation.normalizedSource;
  const destinationPath = validation.normalizedDestination;

  const sourceStat = await stat(sourcePath).catch(() => null);
  if (!sourceStat?.isDirectory()) {
    throw new Error("当前系统目录不存在或不是文件夹。");
  }

  await mkdir(destinationPath, { recursive: true });

  const existing = await readdir(destinationPath);
  if (existing.length > 0) {
    throw new Error("目标目录不是空目录。请选择空目录或新路径，避免覆盖已有文件。");
  }

  const entries = await readdir(sourcePath, { withFileTypes: true });
  let movedEntryCount = 0;

  for (const entry of entries) {
    const from = path.join(sourcePath, entry.name);
    const to = path.join(destinationPath, entry.name);
    try {
      await rename(from, to);
    } catch {
      // Cross-device fallback
      await cp(from, to, { recursive: true, errorOnExist: true, force: false });
      await rm(from, { recursive: true, force: true });
    }
    movedEntryCount += 1;
  }

  return { movedEntryCount, destinationPath, sourcePath };
}
```

Export from `apps/web/src/modules/local-files/index.ts`.

- [ ] **Step 4: Run tests and make sure they pass**

Run: `npm test -- src/modules/local-files/root-relocate.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/modules/local-files/root-relocate.ts apps/web/src/modules/local-files/root-relocate.test.ts apps/web/src/modules/local-files/index.ts
git commit -m "feat(local-files): add system root content move helpers"
```

---

### Task 2: Library application service + repository path update

**Files:**
- Create: `apps/web/src/modules/library/relocate-system-manga-root.ts`
- Create: `apps/web/src/modules/library/relocate-system-manga-root.test.ts`
- Modify: `apps/web/src/modules/library/manga-roots.repository.ts`
- Modify: `apps/web/src/modules/core/db/schema.ts` (operation enum)
- Modify: `apps/web/src/modules/library/index.ts`

**Interfaces:**
- Consumes: `validateRootRelocatePaths`, `moveMangaRootContents`
- Produces:

```ts
export interface RelocateSystemMangaRootInput {
  mangaRootId: string;
  nextAbsolutePath: string;
  moveFiles: boolean;
}

export interface RelocateSystemMangaRootResult {
  mangaRootId: string;
  fromPath: string;
  toPath: string;
  moveFiles: boolean;
  movedEntryCount: number;
  updatedLocalFileCount: number;
  updatedFinalizationCount: number;
  downloadDefaultTargetDirectoryUpdated: boolean;
}
```

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/src/modules/library/relocate-system-manga-root.test.ts
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("relocateSystemMangaRoot", () => {
  afterEach(() => {
    delete process.env.MANGATEST_DB_PATH;
    vi.resetModules();
  });

  it("rejects relocating a user root", async () => {
    vi.resetModules();
    const workspace = path.join(os.tmpdir(), `mangatest-relocate-user-${randomUUID()}`);
    process.env.MANGATEST_DB_PATH = path.join(workspace, "test.sqlite");
    await mkdir(workspace, { recursive: true });

    const { bootstrapDatabase, getDb, mangaRoots } = await import("../core/db");
    const { relocateSystemMangaRoot } = await import("./relocate-system-manga-root");
    bootstrapDatabase();
    const id = randomUUID();
    getDb().insert(mangaRoots).values({
      id,
      absolutePath: path.join(workspace, "user-root"),
      kind: "user",
      scanMode: "children_as_comics",
    }).run();

    await expect(
      relocateSystemMangaRoot({
        mangaRootId: id,
        nextAbsolutePath: path.join(workspace, "elsewhere"),
        moveFiles: false,
      }),
    ).rejects.toThrow(/系统/);
  });

  it("moves files and rewrites local_file absolute paths when moveFiles=true", async () => {
    vi.resetModules();
    const workspace = path.join(os.tmpdir(), `mangatest-relocate-move-${randomUUID()}`);
    const oldRoot = path.join(workspace, "old");
    const newRoot = path.join(workspace, "new");
    const comicDir = path.join(oldRoot, "Comic A");
    process.env.MANGATEST_DB_PATH = path.join(workspace, "test.sqlite");

    await mkdir(comicDir, { recursive: true });
    await writeFile(path.join(comicDir, "001.jpg"), "page");

    const { bootstrapDatabase, getDb, comics, localFiles, mangaRoots } = await import("../core/db");
    const { relocateSystemMangaRoot } = await import("./relocate-system-manga-root");
    bootstrapDatabase();
    const db = getDb();
    const rootId = randomUUID();
    const comicId = randomUUID();
    const localFileId = randomUUID();

    db.insert(mangaRoots).values({
      id: rootId,
      absolutePath: oldRoot,
      kind: "system",
      displayName: "系统默认目录",
      scanMode: "children_as_comics",
    }).run();
    db.insert(comics).values({
      id: comicId,
      displayTitle: "Comic A",
      fileTitle: "Comic A",
      sortTitle: "comic a",
    }).run();
    db.insert(localFiles).values({
      id: localFileId,
      comicId,
      mangaRootId: rootId,
      kind: "directory",
      absolutePath: comicDir,
      relativePath: "Comic A",
      isPrimary: true,
    }).run();

    const result = await relocateSystemMangaRoot({
      mangaRootId: rootId,
      nextAbsolutePath: newRoot,
      moveFiles: true,
    });

    expect(result.updatedLocalFileCount).toBe(1);
    expect(result.movedEntryCount).toBeGreaterThanOrEqual(1);
    await expect(readFile(path.join(newRoot, "Comic A", "001.jpg"), "utf8")).resolves.toBe("page");

    const root = db.select().from(mangaRoots).where(/* eq id */).get();
    // assert root.absolutePath === newRoot
    const file = db.select().from(localFiles).where(/* eq localFileId */).get();
    // assert file.absolutePath === path.join(newRoot, "Comic A")
    // assert file.relativePath === "Comic A"
  });

  it("retargets DB paths without moving when moveFiles=false", async () => {
    // seed same as above; call with moveFiles:false;
    // assert old file still exists; DB absolutePath points to newRoot join relativePath
  });
});
```

Fill assertions fully when implementing (no placeholder comments left in committed tests).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/modules/library/relocate-system-manga-root.test.ts`

Expected: FAIL missing module

- [ ] **Step 3: Implement repository + service**

`manga-roots.repository.ts` add:

```ts
async updateAbsolutePath(input: { id: string; absolutePath: string }): Promise<MangaRootRecord> {
  // only updates absolutePath + updatedAt after existence check
}
```

`relocate-system-manga-root.ts` algorithm:

1. `bootstrapDatabase()`
2. Load root by id; throw if missing; throw if `kind !== "system"`
3. `validateRootRelocatePaths({ sourcePath: root.absolutePath, destinationPath: input.nextAbsolutePath })`
4. Ensure destination is not another row in `manga_roots.absolute_path`
5. If `moveFiles`:
   - `moveMangaRootContents({ sourcePath: old, destinationPath: new })`
6. Else:
   - `mkdir(new, { recursive: true })` only for the destination root folder (empty ok)
7. In one SQLite transaction:
   - Update `manga_roots.absolute_path`
   - For every `local_files` with this `manga_root_id`:
     - `absolutePath = path.join(newRoot, relativePath)`
     - re-stat if exists → refresh mtime/size/isMissing; if missing → mark missing
   - Update `download_task_finalizations.final_path` when `final_path` is under old root (prefix replace with path semantics, not naive string replace)
   - If runtime setting `downloadDefaultTargetDirectory` equals old root (normalized), update it to new root via settings repository
   - Insert `operation_logs` with operation `system_root_relocate`
8. Return counts

Add `"system_root_relocate"` to `operation_logs.operation` enum in `schema.ts`.

- [ ] **Step 4: Run tests and make sure they pass**

Run: `npm test -- src/modules/library/relocate-system-manga-root.test.ts src/modules/local-files/root-relocate.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/modules/library/relocate-system-manga-root.ts apps/web/src/modules/library/relocate-system-manga-root.test.ts apps/web/src/modules/library/manga-roots.repository.ts apps/web/src/modules/library/index.ts apps/web/src/modules/core/db/schema.ts
git commit -m "feat(library): relocate system manga root with optional file move"
```

---

### Task 3: Server action + admin UI

**Files:**
- Modify: `apps/web/src/app/admin/paths/actions.ts`
- Create: `apps/web/src/app/admin/paths/system-root-path-dialog.tsx`
- Modify: `apps/web/src/app/admin/paths/manga-root-edit-dialog.tsx`
- Modify: `apps/web/src/app/admin/paths/paths-panel.tsx`

**Interfaces:**
- Consumes: `relocateSystemMangaRoot`
- Produces: `relocateSystemMangaRootAction(state, formData) -> SaveMangaRootState`

- [ ] **Step 1: Add server action**

```ts
// in actions.ts
export async function relocateSystemMangaRootAction(
  _state: SaveMangaRootState,
  formData: FormData,
): Promise<SaveMangaRootState> {
  const id = String(formData.get("mangaRootId") ?? "");
  const nextAbsolutePath = String(formData.get("nextAbsolutePath") ?? "");
  const moveFiles = formData.get("moveFiles") === "true";

  try {
    const result = await relocateSystemMangaRoot({
      mangaRootId: id,
      nextAbsolutePath,
      moveFiles,
    });
    revalidatePath("/admin/paths");
    revalidatePath("/");
    revalidatePath("/admin/files");
    return {
      status: "success",
      message: moveFiles
        ? `系统目录已迁移到 ${result.toPath}，移动 ${result.movedEntryCount} 项，更新 ${result.updatedLocalFileCount} 条文件记录。`
        : `系统目录路径已更新为 ${result.toPath}（未移动文件），更新 ${result.updatedLocalFileCount} 条文件记录。`,
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "迁移系统目录失败。",
    };
  }
}
```

- [ ] **Step 2: Build `SystemRootPathDialog` UI flow**

UX (required):

1. Only rendered when `root.kind === "system"`.
2. Primary control on Paths table / edit dialog: button **编辑路径**.
3. Modal fields:
   - Current path (read-only)
   - New absolute path (editable `AppInput`)
4. On primary click **下一步/保存路径**:
   - open second confirm modal (or same modal step 2):
     - Title: `是否移动目录内的漫画？`
     - Body: show `from → to`, warn that yes will physically move children; no only rewrites DB paths and files remaining at old location may become missing.
     - Buttons:
       - `取消`
       - `否，只改路径` → submit `moveFiles=false`
       - `是，移动文件` → submit `moveFiles=true` (danger/primary)
5. Disable controls while pending; toast success/error via existing `useActionState` pattern from `MangaRootEditDialog`.

Suggested component shape:

```tsx
export function SystemRootPathDialog({ root }: { root: MangaRootWithStats }) {
  // opened, step: "edit" | "confirm"
  // nextPath state
  // useActionState(relocateSystemMangaRootAction)
}
```

- [ ] **Step 3: Wire panel**

In `paths-panel.tsx` actions column:

- Keep existing edit dialog for displayName/enabled.
- For system roots, also show `SystemRootPathDialog`.
- For user roots, path remains read-only (current copy).

Update `MangaRootEditDialog` description for system roots: remove “MVP 不在这里批量改写路径” when system; point to path editor or embed the path field only for system.

- [ ] **Step 4: Manual browser check**

Run: `npm run dev:web` (or use existing `http://127.0.0.1:4317`)

Check:

1. User root edit still cannot change absolute path.
2. System root shows path edit.
3. Confirm dialog has Yes move / No DB-only / Cancel.
4. After move, Paths page shows new path; comic list still readable; reader opens pages.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/admin/paths
git commit -m "feat(admin): system root path edit with move confirmation"
```

---

### Task 4: Docs + safety notes

**Files:**
- Modify: `docs/plan.md`
- Modify: `docs/implemented-features.md`

- [ ] **Step 1: Update plan product rules**

In `docs/plan.md`, near path-repair / physical file safety:

- Add: 系统默认 manga root（`kind=system`）允许在后台修改绝对路径。
- Add: 修改时必须询问是否移动目录内漫画；选择“是”时执行物理迁移并更新 `local_files.absolute_path` 等关联路径；选择“否”时仅改写数据库路径。
- Clarify: 这不影响“禁止静默物理删除漫画原文件”的总规则；迁移是显式确认的维护操作。
- Keep: 用户 manga root 的绝对路径仍不在编辑弹窗中直接批量改写。

- [ ] **Step 2: Update implemented features**

Under Admin / Local Library:

- System default manga root path can be edited.
- Edit prompts whether to move contained manga; yes moves children and rewrites paths; no rewrites DB only.
- Operation log records `system_root_relocate`.

- [ ] **Step 3: Commit**

```bash
git add docs/plan.md docs/implemented-features.md
git commit -m "docs: system manga root path relocation"
```

---

### Task 5: Regression verification

- [ ] **Step 1: Run focused tests**

```bash
cd apps/web
npm test -- src/modules/local-files/root-relocate.test.ts src/modules/library/relocate-system-manga-root.test.ts src/modules/library/manga-roots.repository.test.ts src/modules/local-files/file-maintenance.repository.test.ts
```

Expected: all PASS

- [ ] **Step 2: Manual edge cases**

1. Destination equals existing user root → error.
2. Destination nested under old system root → error.
3. Destination non-empty when `moveFiles=true` → error.
4. Cross-drive path (if available) still succeeds via copy+delete fallback.
5. Settings preserved; if default download dir was exactly old system root, it updates to new root.

- [ ] **Step 3: Final commit only if polish changes remain**

```bash
git status
```

---

## Decision Table (product)

| Choice | Files on disk | `manga_roots.absolute_path` | `local_files.absolute_path` | Notes |
|--------|---------------|-----------------------------|-----------------------------|-------|
| Cancel | unchanged | unchanged | unchanged | no-op |
| No, path only | stay at old location | new path | rewritten to `join(new, relative)` | likely missing until user moves files manually |
| Yes, move | children moved into new root | new path | rewritten to `join(new, relative)` | refuse non-empty destination |

## Non-Goals

- Editing absolute path for user manga roots.
- Moving only selected comics.
- Auto-scanning after relocate (optional follow-up; do not block MVP of this feature).
- Changing cache directory (already separate setting).
- Physical delete of left-behind empty old root folder (optional: leave empty old folder; do not force `rm` of old root itself).

## Self-Review

1. **Spec coverage**
   - Edit only system default path → Task 2/3 guards on `kind === "system"`.
   - Prompt whether to move → Task 3 confirm UI with yes/no/cancel.
   - Yes moves + updates related paths → Task 1 move + Task 2 DB rewrite.
   - Settings not cleared → service only optionally rewrites matching download default dir.

2. **Placeholder scan**
   - Tests in Task 2 include one abbreviated case note; implementer must expand `moveFiles=false` test fully before commit (no TBD left in code).

3. **Type consistency**
   - `RelocateSystemMangaRootInput/Result` names reused by action and UI message formatting.
   - Operation name fixed as `system_root_relocate`.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-15-system-root-path-relocate.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks
2. **Inline Execution** — implement tasks in this session with checkpoints

Which approach?
