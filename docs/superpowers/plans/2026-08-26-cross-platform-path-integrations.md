# Cross-Platform External Path Integrations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the approved runtime-location contract to PixivDownloader, downloads/aria2, video-library, file-manager integration, and PotPlayer without guessing path dialects or changing existing business identities.

**Architecture:** Every external or desktop path carries an explicit source dialect and is translated through known root locations. Pixiv resolves Windows metadata paths to logical manga paths, downloads fail closed on unmappable provider paths, video mirrors manga root locations, and desktop capabilities are platform adapters.

**Tech Stack:** Next.js App Router, TypeScript, Node child processes/filesystem/path APIs, SQLite/Drizzle, better-sqlite3, aria2 JSON-RPC, Vitest, Mantine.

## Global Constraints

- Depends on the reviewed RuntimeProfile, PortableRelativePath, and root-location contracts from `08-26-portable-manga-paths`.
- Every external path declares `windows`, `wsl`, or `linux` dialect.
- Unknown or unmappable paths fail closed before filesystem mutation or download finalization.
- Preserve Pixiv source identity, video/episode/tag/merge/progress IDs, and completed download history.
- Active runtime-specific transfer paths can block migration.
- No simultaneous Windows/WSL SQLite access and no new production dependency.
- Client routes continue to accept entity IDs, not arbitrary filesystem paths.

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/web/src/modules/core/runtime-paths/path-dialect.ts` | Typed external path dialect and drive/mount translation |
| `apps/web/src/modules/metadata-ingest/sources/pixiv-downloader/path-resolver.ts` | Windows metadata path -> logical root/relative path |
| `apps/web/src/modules/metadata-ingest/sources/pixiv-downloader/comic-matcher.ts` | Match by root ID + portable relative path |
| `apps/web/src/modules/downloads/providers/types.ts` | Provider path dialect contract |
| `apps/web/src/modules/downloads/index.ts` | Translate provider path before finalization |
| `apps/web/src/modules/local-files/video-root-locations.repository.ts` | Per-profile video root location persistence |
| `apps/web/src/modules/video-library/scan-video-root.ts` | Resolve video files through logical root |
| `apps/web/src/modules/core/desktop/open-path.ts` | Windows/WSL/Linux file-manager adapters |
| `apps/web/src/modules/core/desktop/potplayer.ts` | Capability detection and native/WSL launch |

---

### Task 1: Explicit path dialect and safe translator

**Files:**
- Create: `apps/web/src/modules/core/runtime-paths/path-dialect.ts`
- Create: `apps/web/src/modules/core/runtime-paths/path-dialect.test.ts`
- Modify: `apps/web/src/modules/core/runtime-paths/index.ts`

**Interfaces:**
- Produces `PathDialect`, `ExternalFilePath`, `windowsDrivePathToWsl`, `wslMountPathToWindows`.

- [ ] **Step 1: Write failing translation tests**

```ts
import { describe, expect, it } from "vitest";
import { windowsDrivePathToWsl, wslMountPathToWindows } from "./path-dialect";

describe("path dialect translation", () => {
  it("maps a local Windows drive to the default WSL mount", () => expect(windowsDrivePathToWsl("D:\\hentai\\漫画")).toBe("/mnt/d/hentai/漫画"));
  it("maps the default WSL mount to Windows", () => expect(wslMountPathToWindows("/mnt/d/hentai/漫画")).toBe("D:\\hentai\\漫画"));
  it.each(["\\\\server\\share", "relative\\path", "C:relative"])("rejects ambiguous Windows path %s", value => expect(() => windowsDrivePathToWsl(value)).toThrow());
  it.each(["/home/user/manga", "/mnt", "/mnt/d/../c"])("rejects non-drive WSL path %s", value => expect(() => wslMountPathToWindows(value)).toThrow());
});
```

- [ ] **Step 2: Implement typed translators**

```ts
import path from "node:path";
export type PathDialect = "windows" | "wsl" | "linux";
export interface ExternalFilePath { dialect: PathDialect; value: string }

export function windowsDrivePathToWsl(input: string, mountRoot = "/mnt"): string {
  if (!/^[A-Za-z]:\\/.test(input) || input.startsWith("\\\\")) throw new Error("Only absolute local-drive Windows paths can be suggested for WSL.");
  const drive = input[0].toLowerCase();
  const segments = input.slice(3).split("\\").filter(Boolean);
  if (segments.some(segment => segment === "..")) throw new Error("Windows path traversal is not allowed.");
  return path.posix.join(mountRoot, drive, ...segments);
}

export function wslMountPathToWindows(input: string, mountRoot = "/mnt"): string {
  const normalized = path.posix.normalize(input);
  const escapedMountRoot = mountRoot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = normalized.match(new RegExp(`^${escapedMountRoot}/([a-zA-Z])/(.+)$`));
  if (!match || normalized !== input) throw new Error("Path is not a canonical WSL drive mount.");
  return `${match[1].toUpperCase()}:\\${match[2].split("/").join("\\")}`;
}
```

- [ ] **Step 3: Add root-aware translation tests**

Assert a provider child path is accepted only when it is under the configured source root and returns a portable relative path; sibling-prefix paths such as `D:\manga-other` are rejected.

- [ ] **Step 4: Run tests and commit**

Run: `npm run test -w apps/web -- src/modules/core/runtime-paths/path-dialect.test.ts`

Expected: PASS.

Commit: `feat(core): add explicit path dialect translation`

---

### Task 2: PixivDownloader two-stage logical path resolution

**Files:**
- Modify: `apps/web/src/modules/metadata-ingest/sources/pixiv-downloader/path-resolver.ts`
- Modify: `apps/web/src/modules/metadata-ingest/sources/pixiv-downloader/path-resolver.test.ts`
- Modify: `apps/web/src/modules/metadata-ingest/sources/pixiv-downloader/comic-matcher.ts`
- Modify: `apps/web/src/modules/metadata-ingest/sources/pixiv-downloader/sync-service.ts`
- Modify: `apps/web/src/modules/metadata-ingest/sources/pixiv-downloader/types.ts`

**Interfaces:**
- Produces `{ mangaRootId, relativePath, runtimeAbsolutePath, existsOnDisk }` instead of an unqualified Windows absolute path.

- [ ] **Step 1: Write failing cross-profile resolver tests**

Configure Windows root `D:\hentai\pixiv` and WSL root `/mnt/d/hentai/pixiv`. Resolve `{0}\116308589` from external data in both runtime profiles; assert identical `mangaRootId` and `relativePath === "116308589"`, with runtime absolute paths differing by profile.

- [ ] **Step 2: Separate external Windows parsing from runtime resolution**

Use `path.win32` only to expand Pixiv templates and prove containment under a configured Windows location. Convert the Windows-relative remainder to `PortableRelativePath`, then call current-profile root resolution. Never pass `/mnt/...` to `path.win32.resolve`.

- [ ] **Step 3: Match local files logically**

Change the initial path lookup to query `local_files` by `mangaRootId` and normalized portable `relativePath`. Keep `site=pixiv + sourceId` as first priority and the same conflict behavior.

- [ ] **Step 4: Update preview/result records**

Expose logical root, portable relative path, and current runtime path separately. Historical `resolved_path` remains audit text and is not used as identity.

- [ ] **Step 5: Run tests and commit**

Run: `npm run test -w apps/web -- src/modules/metadata-ingest/sources/pixiv-downloader/path-resolver.test.ts src/modules/metadata-ingest/sources/pixiv-downloader/sync-service.test.ts`

Expected: PASS on Windows and Linux runners.

Commit: `feat(metadata-ingest): resolve Pixiv paths across runtime profiles`

---

### Task 3: Downloads and aria2 provider-path safety

**Files:**
- Modify: `apps/web/src/modules/downloads/providers/types.ts`
- Modify: `apps/web/src/modules/downloads/providers/aria2/client.ts`
- Modify: `apps/web/src/modules/downloads/providers/builtin-http/index.ts`
- Modify: `apps/web/src/modules/downloads/index.ts`
- Create: `apps/web/src/modules/downloads/provider-path.test.ts`
- Modify: `apps/web/src/modules/downloads/aria2-direct-path.test.ts`

**Interfaces:**
- Provider results return `filePath: ExternalFilePath | null`.
- Finalization consumes only a translated current-runtime path with proven import-root containment.

- [ ] **Step 1: Write failing provider-path matrix tests**

Cover Windows aria2 result under Windows root, Windows aria2 result consumed by WSL using configured locations, WSL aria2 result, builtin HTTP runtime-native temp path, missing dialect, sibling-prefix escape, and unknown drive.

- [ ] **Step 2: Add dialect to provider contracts**

Aria2 adapter derives/configures the daemon dialect explicitly in settings; builtin HTTP uses the current runtime profile. Do not infer dialect from slash characters at finalization time.

- [ ] **Step 3: Translate before path.resolve/finalization**

Replace direct `path.resolve(result.files[0])` with a translator that returns a current-runtime absolute path plus logical root/relative identity. Run `assertPathInside` only after translation.

- [ ] **Step 4: Add migration blockers for active transfers**

Any queued/running/failed-recoverable transfer with a runtime-specific temp path that cannot be proven reachable on the target profile adds `active_transfer` blocker. Completed finalizations retain audit path and gain logical root/relative identity when derivable.

- [ ] **Step 5: Run tests and commit**

Run: `npm run test -w apps/web -- src/modules/downloads/provider-path.test.ts src/modules/downloads/aria2-direct-path.test.ts`

Expected: PASS; unknown dialect test proves finalization is not called.

Commit: `fix(downloads): translate provider paths before finalization`

---

### Task 4: Portable video root locations and file consumers

**Files:**
- Modify: `apps/web/src/modules/core/db/schema.ts`
- Modify: `apps/web/src/modules/core/db/bootstrap.ts`
- Create: `apps/web/src/modules/local-files/video-root-locations.repository.ts`
- Create: `apps/web/src/modules/local-files/video-root-locations.repository.test.ts`
- Modify: `apps/web/src/modules/video-library/video-roots.repository.ts`
- Modify: `apps/web/src/modules/video-library/scan-video-root.ts`
- Modify: `apps/web/src/modules/video-library/videos.repository.ts`
- Modify: `apps/web/src/app/api/videos/[id]/stream/route.ts`
- Modify: `apps/web/src/app/api/videos/[id]/cover/route.ts`

**Interfaces:**
- Video location repository mirrors manga location semantics.
- Video file identity is `videoRootId + PortableRelativePath`.

- [ ] **Step 1: Write failing schema/backfill and ID-preservation tests**

Seed video root, video, episodes, tags, merge, and progress. Backfill Windows location, add WSL location, resolve identical media from both, and assert all business IDs and counts stay unchanged.

- [ ] **Step 2: Add `video_root_locations` schema/repository**

Use the same profile/status fields and unique constraints as manga root locations, with `video_root_id` FK.

- [ ] **Step 3: Refactor scan and repositories**

Emit portable episode relative paths; resolve current path before `stat`, duration probe, streaming, cover generation, and admin display. Offline video root must not batch-mark episodes missing.

- [ ] **Step 4: Extend migration report/apply**

Include video root mappings, episode counts/ID digest, target verification, and legacy derived `video_episodes.absolute_path` synchronization.

- [ ] **Step 5: Run tests and commit**

Run: `npm run test -w apps/web -- src/modules/local-files/video-root-locations.repository.test.ts src/modules/video-library`

Expected: PASS with preserved-ID assertions.

Commit: `feat(video-library): resolve episodes through runtime locations`

---

### Task 5: Cross-platform file-manager adapter

**Files:**
- Create: `apps/web/src/modules/core/desktop/open-path.ts`
- Create: `apps/web/src/modules/core/desktop/open-path.test.ts`
- Create: `apps/web/src/modules/core/desktop/index.ts`
- Modify: `apps/web/src/modules/library/open-manga-root-folder.ts`
- Modify: `apps/web/src/app/api/admin/paths/video/[id]/open-folder/route.ts`
- Modify: `apps/web/src/modules/downloads/index.ts`

**Interfaces:**
- Produces `openDirectory(target): Promise<OpenDirectoryResult>` with injectable spawn for tests.

- [ ] **Step 1: Write failing adapter tests**

Assert Windows calls `cmd /c start`, WSL converts `/mnt/d/...` and calls `explorer.exe`, ordinary Linux calls `xdg-open`, non-drive WSL paths return unsupported, and no branch invokes a shell with interpolated user text.

- [ ] **Step 2: Implement adapter contract**

```ts
export type OpenDirectoryResult =
  | { ok: true; mode: "windows" | "wsl_bridge" | "linux"; openedPath: string }
  | { ok: false; code: "path_unavailable" | "unsupported" | "spawn_failed"; message: string };
```

Use argument arrays and `shell:false`; WSL bridge passes the converted Windows path directly to `explorer.exe`.

- [ ] **Step 3: Replace duplicated open-folder implementations**

Library, video, and downloads load controlled entity/root paths, resolve current runtime location, then call the adapter.

- [ ] **Step 4: Run tests and commit**

Run: `npm run test -w apps/web -- src/modules/core/desktop/open-path.test.ts`

Expected: PASS.

Commit: `refactor(core): centralize cross-platform folder opening`

---

### Task 6: PotPlayer capability and WSL bridge

**Files:**
- Create: `apps/web/src/modules/core/desktop/potplayer.ts`
- Create: `apps/web/src/modules/core/desktop/potplayer.test.ts`
- Modify: `apps/web/src/app/api/videos/[id]/open-potplayer/route.ts`
- Modify: `apps/web/src/modules/core/settings/types.ts`
- Modify: `apps/web/src/modules/core/settings/defaults.ts`
- Modify: `apps/web/src/app/admin/settings/page.tsx`

**Interfaces:**
- Produces `getPotPlayerCapability()` and `openVideoInPotPlayer(episodeId)`.

- [ ] **Step 1: Write failing capability tests**

Cover Windows native executable, WSL-accessible Windows `.exe` plus convertible `/mnt/d` media, WSL media under `/home`, ordinary Linux, missing executable, and failed spawn.

- [ ] **Step 2: Implement capability contract**

```ts
export interface DesktopCapability {
  supported: boolean;
  mode: "native" | "wsl_bridge" | "unsupported";
  reason: string | null;
}
```

WSL launch converts the resolved episode path to Windows, validates configured executable accessibility, and spawns the `.exe` with an argument array. Unsupported cases return a reason without attempting spawn.

- [ ] **Step 3: Update route and settings UI**

Route accepts only video/episode identity already owned by the application. Settings show current capability and explain WSL restrictions.

- [ ] **Step 4: Run tests and commit**

Run: `npm run test -w apps/web -- src/modules/core/desktop/potplayer.test.ts`

Expected: PASS.

Commit: `feat(video): add PotPlayer runtime capability`

---

### Task 7: Integration migration UI, documentation, and quality gate

**Files:**
- Modify: `apps/web/src/modules/library/path-migration.ts`
- Modify: `apps/web/src/app/admin/paths/path-migration-dialog.tsx`
- Modify: `docs/windows-wsl-deployment.md`
- Modify: `docs/implemented-features.md`
- Verify: `docs/plan.md`

- [ ] **Step 1: Extend migration report**

Report Pixiv DB/root locations, video root/episode invariants, download blockers/finalizations, aria2 daemon dialect, open-folder capability, and PotPlayer capability.

- [ ] **Step 2: Extend admin preview**

Group results into Manga, Video, Pixiv, Downloads, and Desktop Integration sections. Disable apply for any path/data blocker; capability-only unsupported integrations may proceed with a visible warning.

- [ ] **Step 3: Update deployment runbook**

Document Windows aria2 versus WSL aria2 configuration, Pixiv SQLite access path, WSL Explorer bridge, PotPlayer limitations, and the requirement to install native npm dependencies separately.

- [ ] **Step 4: Run complete checks**

Run:

```powershell
npm run test -w apps/web
npm run typecheck:web
npm run lint:web
npm run build:web
git diff --check
```

Expected: every command exits 0.

- [ ] **Step 5: Run Windows/WSL smoke matrix and commit**

Verify Pixiv preview/match, aria2/builtin finalization, video scan/stream/poster/progress, open manga/video/download folders, PotPlayer capability, migration dry-run, and rollback on both targets. Compare parent-task invariant counts and ID digests.

Commit: `test(web): verify cross-platform path integrations`
