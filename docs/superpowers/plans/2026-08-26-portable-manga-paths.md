# Portable Manga Paths and Lossless Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the manga library, Reader, generated media assets, and admin path workflow portable between one active Windows or WSL backend without changing manga business identities or moving real files.

**Architecture:** Store operating-system paths in per-runtime manga root locations while treating `mangaRootId + portableRelativePath` as the stable local-file identity. Route all filesystem access through `modules/local-files`, add an offline-root gate before reconciliation, and provide a backup-first dry-run/apply migration service.

**Tech Stack:** Next.js App Router, TypeScript, Node filesystem/path APIs, SQLite with better-sqlite3 and Drizzle, Vitest, Mantine admin UI.

## Global Constraints

- Windows or WSL is the only active backend; never open one SQLite from both.
- Migration never creates, moves, renames, or deletes real manga files.
- Preserve comic, local-file, chapter, page, tag, source, merge, and reading-progress IDs.
- Stable file identity is `manga_root_id + portable relative_path`.
- Portable relative paths use `/` and reject absolute, drive, UNC, NUL, and parent traversal input.
- A missing runtime location means `unconfigured`/`offline`, not that all child files are missing.
- Keep legacy absolute columns synchronized during this release for one-version rollback.
- Do not add a new production dependency.
- Follow route/UI -> application service -> repository/filesystem adapter boundaries.

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/web/src/modules/core/runtime-paths/runtime-profile.ts` | Detect Windows, WSL, or Linux profile with explicit override |
| `apps/web/src/modules/core/runtime-paths/index.ts` | Export runtime profile contracts |
| `apps/web/src/modules/local-files/portable-relative-path.ts` | Validate/convert portable relative paths and safe child resolution |
| `apps/web/src/modules/local-files/manga-root-locations.repository.ts` | Persist one location per root/profile |
| `apps/web/src/modules/local-files/root-location.service.ts` | Verify and resolve current-profile roots/files |
| `apps/web/src/modules/library/path-migration.ts` | Inventory, dry-run fingerprint, blockers, backup, transactional apply, invariants |
| `apps/web/src/modules/library/scan-library-root.ts` | Gate scan and missing reconciliation on root availability |
| `apps/web/src/modules/local-files/file-enumerator.ts` | Emit portable relative paths and logical cache identities |
| `apps/web/src/modules/reader/page-images.ts` | Resolve a page through local-file root + relative path |
| `apps/web/src/modules/media-assets/index.ts` | Use entity/file facts rather than absolute path in cache keys |
| `apps/web/src/app/api/admin/path-migration/preview/route.ts` | Read-only migration report |
| `apps/web/src/app/api/admin/path-migration/apply/route.ts` | Fingerprint-checked backup/apply operation |
| `apps/web/src/app/admin/paths/path-migration-dialog.tsx` | Runtime/location status, preview, confirmation, result |

---

### Task 1: Runtime profile and portable relative-path primitives

**Files:**
- Create: `apps/web/src/modules/core/runtime-paths/runtime-profile.ts`
- Create: `apps/web/src/modules/core/runtime-paths/runtime-profile.test.ts`
- Create: `apps/web/src/modules/core/runtime-paths/index.ts`
- Create: `apps/web/src/modules/local-files/portable-relative-path.ts`
- Create: `apps/web/src/modules/local-files/portable-relative-path.test.ts`
- Modify: `apps/web/src/modules/local-files/index.ts`

**Interfaces:**
- Produces `RuntimeProfile`, `RuntimeEnvironment`, `detectRuntimeEnvironment()`.
- Produces `PortableRelativePath`, `parsePortableRelativePath()`, `toPortableRelativePath()`, `resolvePortableChild()`.

- [ ] **Step 1: Write runtime-profile failing tests**

```ts
import { describe, expect, it } from "vitest";
import { detectRuntimeEnvironment } from "./runtime-profile";

describe("detectRuntimeEnvironment", () => {
  it("detects Windows", () => {
    expect(detectRuntimeEnvironment({ platform: "win32", env: {}, procVersion: "" }).profile).toBe("windows");
  });
  it("detects WSL", () => {
    expect(detectRuntimeEnvironment({ platform: "linux", env: { WSL_DISTRO_NAME: "Ubuntu" }, procVersion: "" }).profile).toBe("wsl");
  });
  it("honors a valid explicit override", () => {
    expect(detectRuntimeEnvironment({ platform: "linux", env: { MANGATEST_PATH_PROFILE: "linux" }, procVersion: "microsoft" }).profile).toBe("linux");
  });
  it("rejects an invalid explicit override", () => {
    expect(() => detectRuntimeEnvironment({ platform: "linux", env: { MANGATEST_PATH_PROFILE: "mac" }, procVersion: "" })).toThrow(/MANGATEST_PATH_PROFILE/);
  });
});
```

- [ ] **Step 2: Implement runtime-profile detection**

```ts
export const runtimeProfiles = ["windows", "wsl", "linux"] as const;
export type RuntimeProfile = (typeof runtimeProfiles)[number];

export interface RuntimeEnvironment {
  profile: RuntimeProfile;
  platform: NodeJS.Platform;
  wslDistroName: string | null;
}

export function detectRuntimeEnvironment(input: {
  platform: NodeJS.Platform;
  env: Record<string, string | undefined>;
  procVersion: string;
}): RuntimeEnvironment {
  const override = input.env.MANGATEST_PATH_PROFILE?.trim();
  if (override && !runtimeProfiles.includes(override as RuntimeProfile)) {
    throw new Error(`MANGATEST_PATH_PROFILE must be one of: ${runtimeProfiles.join(", ")}`);
  }
  const profile: RuntimeProfile = override as RuntimeProfile ||
    (input.platform === "win32" ? "windows" :
      input.platform === "linux" && Boolean(input.env.WSL_DISTRO_NAME || input.env.WSL_INTEROP || /microsoft/i.test(input.procVersion)) ? "wsl" : "linux");
  return { profile, platform: input.platform, wslDistroName: input.env.WSL_DISTRO_NAME ?? null };
}
```

- [ ] **Step 3: Write portable-path failing tests**

```ts
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parsePortableRelativePath, resolvePortableChild, toPortableRelativePath } from "./portable-relative-path";

describe("portable relative paths", () => {
  it("converts native separators", () => expect(toPortableRelativePath("Comic\\001.jpg")).toBe("Comic/001.jpg"));
  it.each(["/etc/passwd", "D:/comic", "D:\\comic", "//server/share", "../comic", "comic/../page.jpg", "comic\0page.jpg"])("rejects %s", value => {
    expect(() => parsePortableRelativePath(value)).toThrow();
  });
  it("resolves inside the configured root", () => {
    const root = path.resolve("library");
    expect(resolvePortableChild(root, parsePortableRelativePath("Comic/001.jpg"))).toBe(path.join(root, "Comic", "001.jpg"));
  });
});
```

- [ ] **Step 4: Implement portable-path primitives and exports**

```ts
import path from "node:path";

export type PortableRelativePath = string & { readonly __portableRelativePath: unique symbol };

export function parsePortableRelativePath(input: string): PortableRelativePath {
  if (!input || input.includes("\0") || input.includes("\\") || input.startsWith("/") || /^[A-Za-z]:/.test(input) || input.startsWith("//")) {
    throw new Error("Invalid portable relative path.");
  }
  const segments = input.split("/");
  if (segments.some(segment => segment === "" || segment === "." || segment === "..")) throw new Error("Portable relative path escapes its root.");
  return input as PortableRelativePath;
}

export function toPortableRelativePath(input: string): PortableRelativePath {
  return parsePortableRelativePath(input.split(path.sep).join("/").replaceAll("\\", "/"));
}

export function resolvePortableChild(rootAbsolutePath: string, relativePath: PortableRelativePath): string {
  const root = path.resolve(rootAbsolutePath);
  const target = path.resolve(root, ...relativePath.split("/"));
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Resolved path escapes its root.");
  return target;
}
```

- [ ] **Step 5: Run tests and commit**

Run: `npm run test -w apps/web -- src/modules/core/runtime-paths/runtime-profile.test.ts src/modules/local-files/portable-relative-path.test.ts`

Expected: PASS.

Commit: `feat(core): add runtime profile and portable path primitives`

---

### Task 2: Manga root location schema, bootstrap backfill, and repository

**Files:**
- Modify: `apps/web/src/modules/core/db/schema.ts`
- Modify: `apps/web/src/modules/core/db/bootstrap.ts`
- Modify: `apps/web/src/modules/core/db/index.ts`
- Create: `apps/web/src/modules/local-files/manga-root-locations.repository.ts`
- Create: `apps/web/src/modules/local-files/manga-root-locations.repository.test.ts`

**Interfaces:**
- Consumes `RuntimeProfile`.
- Produces `MangaRootLocationRecord` and repository methods `getForProfile`, `upsert`, `listForRoot`, `markVerification`.

- [ ] **Step 1: Write failing repository/backfill tests**

Seed one legacy manga root, bootstrap twice, and assert exactly one location exists for the detected profile with the legacy absolute path. Test the unique constraints and that `upsert` keeps the same location ID.

- [ ] **Step 2: Add schema contract**

```ts
export const rootLocationStatuses = ["unverified", "available", "offline", "invalid"] as const;
export const mangaRootLocations = sqliteTable("manga_root_locations", {
  id: text("id").primaryKey(),
  mangaRootId: text("manga_root_id").notNull().references(() => mangaRoots.id, { onDelete: "cascade" }),
  runtimeProfile: text("runtime_profile", { enum: runtimeProfiles }).notNull(),
  absolutePath: text("absolute_path").notNull(),
  verificationStatus: text("verification_status", { enum: rootLocationStatuses }).notNull().default("unverified"),
  lastVerifiedAt: text("last_verified_at"),
  lastError: text("last_error"),
  ...timestamps,
}, table => ({
  rootProfileIdx: uniqueIndex("manga_root_locations_root_profile_idx").on(table.mangaRootId, table.runtimeProfile),
  profilePathIdx: uniqueIndex("manga_root_locations_profile_path_idx").on(table.runtimeProfile, table.absolutePath),
}));
```

- [ ] **Step 3: Add idempotent bootstrap backfill**

Create the table/indexes before normal queries. For every root without a current-profile location, insert its legacy `absolute_path` with `verification_status='unverified'`. Do not generate a second-platform location.

- [ ] **Step 4: Implement typed repository**

Normalize `absolutePath` using current platform semantics only when `runtimeProfile` equals the current runtime. Other profile paths are opaque validated strings until verified on that target runtime. Reject conflicting `(profile, path)` ownership.

- [ ] **Step 5: Run tests and commit**

Run: `npm run test -w apps/web -- src/modules/local-files/manga-root-locations.repository.test.ts`

Expected: PASS, including repeated bootstrap.

Commit: `feat(local-files): add runtime manga root locations`

---

### Task 3: Root verification/resolution and offline-safe scanning

**Files:**
- Create: `apps/web/src/modules/local-files/root-location.service.ts`
- Create: `apps/web/src/modules/local-files/root-location.service.test.ts`
- Modify: `apps/web/src/modules/library/scan-library-root.ts`
- Modify: `apps/web/src/modules/library/scan-library-root.test.ts`
- Modify: `apps/web/src/modules/library/scan-all-manga-roots.ts`

**Interfaces:**
- Produces `resolveMangaRoot(rootId)` and `resolveMangaFile(rootId, relativePath)`.
- Scan consumes only an `available` root.

- [ ] **Step 1: Write failing service and scan tests**

Test available directory, missing mount, non-directory location, unconfigured profile, invalid relative path, and path escape. Seed an existing readable comic under an offline root; run scan; assert scan fails/skips without changing `local_files.is_missing` or comic status.

- [ ] **Step 2: Implement verification state**

```ts
export type RootLocationState =
  | { status: "available"; absolutePath: string; profile: RuntimeProfile }
  | { status: "unconfigured"; profile: RuntimeProfile }
  | { status: "offline" | "invalid"; absolutePath: string; profile: RuntimeProfile; reason: string };
```

Use `stat` to distinguish offline from non-directory invalid state and persist verification metadata.

- [ ] **Step 3: Gate scan before enumeration/reconciliation**

Resolve location before `enumerateMangaRootChildren`. If unavailable, finish the scan session with an actionable error summary and return/throw before loading existing local files for missing reconciliation.

- [ ] **Step 4: Ensure all-roots scan reports unavailable roots**

Return per-root status rather than treating offline as an empty successful scan.

- [ ] **Step 5: Run tests and commit**

Run: `npm run test -w apps/web -- src/modules/local-files/root-location.service.test.ts src/modules/library/scan-library-root.test.ts`

Expected: PASS; offline-root assertion proves no missing-state mutation.

Commit: `feat(library): protect offline roots during scans`

---

### Task 4: Backup-first migration dry-run and transactional apply

**Files:**
- Create: `apps/web/src/modules/library/path-migration.ts`
- Create: `apps/web/src/modules/library/path-migration.test.ts`
- Modify: `apps/web/src/modules/core/db/backup.ts`
- Modify: `apps/web/src/modules/library/index.ts`

**Interfaces:**
- Produces `previewPathMigration(input): Promise<PathMigrationReport>`.
- Produces `applyPathMigration(input): Promise<PathMigrationResult>`.

- [ ] **Step 1: Write failing dry-run/apply tests**

Cover Windows drive suggestion, unmappable UNC, dry-run no database writes, active transfer blocker, stale fingerprint rejection, preserved IDs/counts, target verification failure, transaction rollback, and successful WSL location application.

- [ ] **Step 2: Define report contract**

```ts
export interface PathMigrationReport {
  fingerprint: string;
  sourceProfile: RuntimeProfile;
  targetProfile: RuntimeProfile;
  roots: Array<{ rootId: string; sourcePath: string; suggestedTargetPath: string | null; status: "ready" | "unmappable" | "offline"; localFileCount: number }>;
  blockers: Array<{ code: "active_transfer" | "unmappable_path" | "target_offline"; recordId: string; message: string }>;
  invariants: Record<string, { count: number; idDigest: string }>;
  canApply: boolean;
}
```

- [ ] **Step 3: Implement deterministic suggestion and fingerprint**

Convert only `/^[A-Za-z]:[\\/]/` paths to `/mnt/<lower-drive>/...`; preserve Unicode and spaces. Fingerprint canonical JSON of source/target profiles, root mappings, blockers, database `data_version`, and invariant snapshot with SHA-256.

- [ ] **Step 4: Implement backup and apply gate**

Call the existing `sqlite.backup()` path before any transaction. Recompute the report, compare fingerprint, reject blockers, then transactionally upsert target locations and synchronize legacy `local_files.absolute_path = resolve(targetRoot, relativePath)`. Insert an operation log containing profiles, counts, report fingerprint, and backup filename; never mutate filesystem media.

- [ ] **Step 5: Run tests and commit**

Run: `npm run test -w apps/web -- src/modules/library/path-migration.test.ts src/modules/core/data-reset.test.ts`

Expected: PASS with rollback test proving no partial rows.

Commit: `feat(library): add backup-first path migration`

---

### Task 5: Refactor manga filesystem consumers and cache identities

**Files:**
- Modify: `apps/web/src/modules/local-files/file-enumerator.ts`
- Modify: `apps/web/src/modules/library/scan-library-root.ts`
- Modify: `apps/web/src/modules/local-files/file-maintenance.repository.ts`
- Modify: `apps/web/src/modules/reader/page-images.ts`
- Modify: `apps/web/src/modules/media-assets/index.ts`
- Add/modify focused tests beside each module.

**Interfaces:**
- Consumers receive root IDs and portable relative paths, then call root-location service.
- Archive and thumbnail cache keys use logical identity plus file facts.

- [ ] **Step 1: Add failing directory/zip/cbz tests using two runtime locations**

Seed one logical root with two temp directories that represent Windows/WSL locations and identical relative content. Assert both profile runs address the same localFile/page IDs.

- [ ] **Step 2: Emit portable relative paths during enumeration**

Convert `path.relative(root, child)` through `toPortableRelativePath`; join portable segments only inside `resolvePortableChild`.

- [ ] **Step 3: Resolve Reader and maintenance paths from logical identity**

Reader query includes `localFiles.mangaRootId` and `localFiles.relativePath`; resolve the local-file container before directory child or archive entry access. Maintenance uses the same service and reports root offline separately from file missing.

- [ ] **Step 4: Replace path-based cache identities**

Archive list: `archive_file_list:${localFileId}:${mtime}:${size}`. Reader thumbnail: `reader_thumbnail:${pageId}:${localFileId}:${mtime}:${size}:${width}x${height}`. Keep generated cache filesystem location runtime-local.

- [ ] **Step 5: Run tests and commit**

Run: `npm run test -w apps/web -- src/modules/library/scan-library-root.test.ts src/modules/reader src/modules/media-assets`

Expected: PASS for directory and archive readers in both profile fixtures.

Commit: `refactor(web): resolve manga files through root locations`

---

### Task 6: Admin runtime/location and migration workflow

**Files:**
- Create: `apps/web/src/app/api/admin/path-migration/preview/route.ts`
- Create: `apps/web/src/app/api/admin/path-migration/apply/route.ts`
- Create: `apps/web/src/app/admin/paths/path-migration-dialog.tsx`
- Modify: `apps/web/src/app/admin/paths/paths-panel.tsx`
- Modify: `apps/web/src/app/admin/paths/page.tsx`

**Interfaces:**
- Preview accepts `{ targetProfile, rootMappings }` and returns `PathMigrationReport`.
- Apply accepts the same mapping plus `fingerprint` and explicit confirmation boolean.

- [ ] **Step 1: Add route contract tests**

Assert preview is read-only, apply rejects missing confirmation/stale fingerprint/blockers, and errors never expose arbitrary filesystem content.

- [ ] **Step 2: Implement thin routes**

Parse fixed fields, call library application services, return 400 for invalid input, 409 for blockers/stale report, and 200 for a verified result.

- [ ] **Step 3: Implement Mantine migration dialog**

Display current runtime profile; each root's current and proposed location; verification badge; local-file count; blockers; backup filename after apply. Disable apply unless every selected mapping is `ready` and the confirmation checkbox is checked.

- [ ] **Step 4: Distinguish location mapping from physical relocation**

Use copy stating “只更新运行环境路径映射，不移动漫画文件”. Keep the existing physical system-root relocate workflow separate.

- [ ] **Step 5: Browser verify and commit**

Verify `/admin/paths` at desktop/mobile widths: profile visible, offline root actionable, preview works, apply disabled on blockers, no physical-move wording.

Commit: `feat(admin): add cross-platform path migration workflow`

---

### Task 7: Documentation and deployment safeguards

**Files:**
- Modify: `docs/implemented-features.md`
- Create: `docs/windows-wsl-deployment.md`
- Verify: `docs/plan.md`

- [ ] **Step 1: Document supported topology**

State one active backend, runtime-local source/dependencies/SQLite/cache, `/mnt/<drive>` media access, target-platform `npm ci`, and no shared live WAL database.

- [ ] **Step 2: Document backup/restore migration runbook**

Include stop, backup, copy/restore, install dependencies, start target, verify locations, dry-run, apply, first scan, and rollback steps.

- [ ] **Step 3: Record feature status and limitations**

Mark the manga core complete only after Task 6 passes; explicitly defer external integrations to the sibling task.

- [ ] **Step 4: Run documentation check and commit**

Run: `git diff --check -- docs .trellis/tasks/08-26-portable-manga-paths`

Expected: no whitespace errors.

Commit: `docs: add Windows WSL migration runbook`

---

### Task 8: Full child-task quality gate

**Files:**
- Review all files listed above.

- [ ] **Step 1: Run focused and full tests**

Run: `npm run test -w apps/web`

Expected: all tests pass.

- [ ] **Step 2: Run static checks**

Run: `npm run typecheck:web` and `npm run lint:web`.

Expected: exit 0.

- [ ] **Step 3: Run production build**

Run: `npm run build:web`.

Expected: Next.js build succeeds.

- [ ] **Step 4: Run Windows and WSL smoke matrices**

On each target with separately installed dependencies, verify directory/zip/cbz scan, cover, thumbnail, Reader page image, offline root, dry-run, stale fingerprint, and rollback. Compare invariant report counts and ID digests.

- [ ] **Step 5: Run final diff check and commit**

Run: `git diff --check`.

Expected: no errors.

Commit: `test(web): verify portable manga path migration`
