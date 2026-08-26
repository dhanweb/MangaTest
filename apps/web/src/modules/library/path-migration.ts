import { createHash, randomUUID } from "node:crypto";
import { stat as defaultStat } from "node:fs/promises";

import { eq } from "drizzle-orm";

import {
  bootstrapDatabase,
  createSqliteBackupFile,
  downloadTaskTransfers,
  getDb,
  getSqlite,
  localFiles,
  mangaRootLocations,
  mangaRoots,
  operationLogs,
} from "@/modules/core/db";
import {
  detectCurrentRuntimeEnvironment,
  runtimeProfiles,
  type RuntimeProfile,
} from "@/modules/core/runtime-paths";

import {
  normalizeAbsolutePathForProfile,
} from "@/modules/local-files/manga-root-locations.repository";
import { parsePortableRelativePath, resolvePortableChild } from "@/modules/local-files/portable-relative-path";

export interface PathMigrationRootMapping {
  rootId: string;
  targetPath?: string | null;
}

export interface PathMigrationInput {
  targetProfile: RuntimeProfile;
  rootMappings?: PathMigrationRootMapping[];
}

export interface PathMigrationRootReport {
  rootId: string;
  sourcePath: string;
  suggestedTargetPath: string | null;
  targetPath: string | null;
  status: "ready" | "unmappable" | "offline";
  localFileCount: number;
}

export interface PathMigrationBlocker {
  code: "active_transfer" | "unmappable_path" | "target_offline";
  recordId: string;
  message: string;
}

export interface PathMigrationReport {
  fingerprint: string;
  sourceProfile: RuntimeProfile;
  targetProfile: RuntimeProfile;
  roots: PathMigrationRootReport[];
  blockers: PathMigrationBlocker[];
  invariants: Record<string, { count: number; idDigest: string }>;
  canApply: boolean;
}

export interface PathMigrationResult {
  backupFilename: string;
  backupPath: string;
  report: PathMigrationReport;
  invariantsBefore: PathMigrationReport["invariants"];
  invariantsAfter: PathMigrationReport["invariants"];
  updatedRootCount: number;
  updatedLocalFileCount: number;
}

export class PathMigrationError extends Error {
  constructor(
    public readonly code: "invalid_input" | "stale_report" | "blocked" | "backup_required" | "invariant_mismatch",
    message: string,
  ) {
    super(message);
    this.name = "PathMigrationError";
  }
}

export interface PathMigrationDependencies {
  stat?: typeof defaultStat;
  createBackup?: typeof createSqliteBackupFile;
}

export async function previewPathMigration(
  input: PathMigrationInput,
  dependencies: PathMigrationDependencies = {},
): Promise<PathMigrationReport> {
  bootstrapDatabase();
  const runtimeProfile = detectCurrentRuntimeEnvironment().profile;
  assertProfile(input.targetProfile);

  const db = getDb();
  const stat = dependencies.stat ?? defaultStat;
  const mappings = new Map((input.rootMappings ?? []).map((mapping) => [mapping.rootId, mapping.targetPath?.trim() || null]));
  const roots = db.select().from(mangaRoots).orderBy(mangaRoots.createdAt).all();
  const allLocations = db.select().from(mangaRootLocations).all();
  const sourceProfile = inferSourceProfile({
    roots,
    locations: allLocations,
    currentProfile: runtimeProfile,
    targetProfile: input.targetProfile,
  });
  const locations = allLocations.filter((location) => location.runtimeProfile === sourceProfile);
  const sourceLocationByRoot = new Map(locations.map((location) => [location.mangaRootId, location]));
  const blockers: PathMigrationBlocker[] = [];

  const rootReports: PathMigrationRootReport[] = [];
  for (const root of roots) {
    const sourcePath = sourceLocationByRoot.get(root.id)?.absolutePath ?? root.absolutePath;
    const suggestedTargetPath = suggestTargetPath(sourcePath, sourceProfile, input.targetProfile);
    const targetPathInput = mappings.has(root.id) ? mappings.get(root.id) : suggestedTargetPath;
    let targetPath: string | null = null;
    if (targetPathInput) {
      try {
        targetPath = normalizeAbsolutePathForProfile(targetPathInput, input.targetProfile);
      } catch (error) {
        throw new PathMigrationError(
          "invalid_input",
          error instanceof Error ? error.message : "目标漫画根目录路径无效。",
        );
      }
    }
    const localFileCount = db
      .select({ id: localFiles.id })
      .from(localFiles)
      .where(eq(localFiles.mangaRootId, root.id))
      .all().length;

    let status: PathMigrationRootReport["status"] = "ready";
    if (!targetPath) {
      status = "unmappable";
      blockers.push({
        code: "unmappable_path",
        recordId: root.id,
        message: `无法为漫画根目录 ${root.displayName ?? root.id} 生成目标路径映射。`,
      });
    } else {
      const targetStat = input.targetProfile === runtimeProfile ? await stat(targetPath).catch(() => null) : null;
      if (!targetStat?.isDirectory()) {
        status = "offline";
        blockers.push({
          code: "target_offline",
          recordId: root.id,
          message:
            input.targetProfile === runtimeProfile
              ? `目标漫画根目录不可用：${targetPath}`
              : `目标运行环境为 ${input.targetProfile}，请在目标环境验证这个根目录后再应用迁移。`,
        });
      }
    }

    rootReports.push({
      rootId: root.id,
      sourcePath,
      suggestedTargetPath,
      targetPath,
      status,
      localFileCount,
    });
  }

  const activeTransfers = db
    .select({ id: downloadTaskTransfers.id, taskId: downloadTaskTransfers.downloadTaskId })
    .from(downloadTaskTransfers)
    .where(eq(downloadTaskTransfers.status, "running"))
    .all();
  for (const transfer of activeTransfers) {
    blockers.push({
      code: "active_transfer",
      recordId: transfer.taskId,
      message: "存在正在运行的下载传输，必须先停止后才能迁移。",
    });
  }

  const invariants = collectMigrationInvariants();
  const fingerprint = createMigrationFingerprint({
    sourceProfile,
    targetProfile: input.targetProfile,
    roots: rootReports,
    blockers,
    invariants,
    dataVersion: Number(getSqlite().pragma("data_version", { simple: true }) ?? 0),
  });

  return {
    fingerprint,
    sourceProfile,
    targetProfile: input.targetProfile,
    roots: rootReports,
    blockers,
    invariants,
    canApply: blockers.length === 0 && rootReports.every((root) => root.status === "ready"),
  };
}

export async function applyPathMigration(
  input: PathMigrationInput & { fingerprint: string; confirmBackup: boolean },
  dependencies: PathMigrationDependencies = {},
): Promise<PathMigrationResult> {
  if (!input.confirmBackup) {
    throw new PathMigrationError("backup_required", "必须确认迁移前会创建 SQLite 备份。");
  }

  const currentProfile = detectCurrentRuntimeEnvironment().profile;
  if (input.targetProfile !== currentProfile) {
    throw new PathMigrationError("invalid_input", "必须在目标运行环境中应用路径迁移。");
  }

  const beforeReport = await previewPathMigration(input, dependencies);
  if (beforeReport.fingerprint !== input.fingerprint) {
    throw new PathMigrationError("stale_report", "迁移预览已过期，请重新生成预览后再试。");
  }
  if (!beforeReport.canApply) {
    throw new PathMigrationError("blocked", beforeReport.blockers.map((blocker) => blocker.message).join("；"));
  }

  const createBackup = dependencies.createBackup ?? createSqliteBackupFile;
  const backup = await createBackup();
  const db = getDb();
  const sqlite = getSqlite();
  const now = new Date().toISOString();
  let updatedRootCount = 0;
  let updatedLocalFileCount = 0;
  let invariantsAfter: PathMigrationReport["invariants"] | null = null;

  try {
    sqlite.transaction(() => {
      for (const rootReport of beforeReport.roots) {
        if (!rootReport.targetPath) {
          throw new PathMigrationError("invalid_input", "迁移报告缺少目标根目录路径。");
        }

        const locationId = randomUUID();
        db.insert(mangaRootLocations)
          .values({
            id: locationId,
            mangaRootId: rootReport.rootId,
            runtimeProfile: beforeReport.targetProfile,
            absolutePath: rootReport.targetPath,
            verificationStatus: "available",
            lastVerifiedAt: now,
            lastError: null,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [mangaRootLocations.mangaRootId, mangaRootLocations.runtimeProfile],
            set: {
              absolutePath: rootReport.targetPath,
              verificationStatus: "available",
              lastVerifiedAt: now,
              lastError: null,
              updatedAt: now,
            },
          })
          .run();

        db.update(mangaRoots)
          .set({ absolutePath: rootReport.targetPath, updatedAt: now })
          .where(eq(mangaRoots.id, rootReport.rootId))
          .run();
        updatedRootCount += 1;

        const rootFiles = db
          .select({ id: localFiles.id, relativePath: localFiles.relativePath })
          .from(localFiles)
          .where(eq(localFiles.mangaRootId, rootReport.rootId))
          .all();
        for (const file of rootFiles) {
          const relativePath = parsePortableRelativePath(file.relativePath.replaceAll("\\", "/"));
          const absolutePath = resolvePortableChild(rootReport.targetPath, relativePath);
          db.update(localFiles)
            .set({ absolutePath, updatedAt: now })
            .where(eq(localFiles.id, file.id))
            .run();
          updatedLocalFileCount += 1;
        }
      }

      db.insert(operationLogs)
        .values({
          id: randomUUID(),
          operation: "path_migration",
          targetType: "runtime",
          targetId: beforeReport.targetProfile,
          summary: `路径迁移：${beforeReport.sourceProfile} -> ${beforeReport.targetProfile}`,
          detailJson: JSON.stringify({
            sourceProfile: beforeReport.sourceProfile,
            targetProfile: beforeReport.targetProfile,
            reportFingerprint: beforeReport.fingerprint,
            backupFilename: backup.filename,
            rootCount: updatedRootCount,
            localFileCount: updatedLocalFileCount,
            physicalFilesTouched: false,
          }),
          createdAt: now,
        })
        .run();

      invariantsAfter = collectMigrationInvariants();
      if (!sameInvariants(beforeReport.invariants, invariantsAfter)) {
        throw new PathMigrationError("invariant_mismatch", "迁移后业务记录数量或 ID 摘要不一致。");
      }
    })();
  } catch (error) {
    throw error instanceof PathMigrationError
      ? error
      : new PathMigrationError("invariant_mismatch", error instanceof Error ? error.message : "路径迁移事务失败。");
  }

  if (!invariantsAfter) {
    throw new PathMigrationError("invariant_mismatch", "迁移后未能生成业务记录校验摘要。");
  }

  return {
    backupFilename: backup.filename,
    backupPath: backup.path,
    report: beforeReport,
    invariantsBefore: beforeReport.invariants,
    invariantsAfter,
    updatedRootCount,
    updatedLocalFileCount,
  };
}

function inferSourceProfile(input: {
  roots: Array<{ id: string }>;
  locations: Array<{ mangaRootId: string; runtimeProfile: RuntimeProfile }>;
  currentProfile: RuntimeProfile;
  targetProfile: RuntimeProfile;
}) {
  const locationProfiles = new Map<RuntimeProfile, Set<string>>();
  for (const location of input.locations) {
    const rootIds = locationProfiles.get(location.runtimeProfile) ?? new Set<string>();
    rootIds.add(location.mangaRootId);
    locationProfiles.set(location.runtimeProfile, rootIds);
  }

  const coversEveryRoot = (profile: RuntimeProfile) => {
    const rootIds = locationProfiles.get(profile);
    return input.roots.every((root) => rootIds?.has(root.id));
  };

  if (coversEveryRoot(input.currentProfile)) {
    return input.currentProfile;
  }

  return (
    runtimeProfiles.find((profile) => profile !== input.targetProfile && coversEveryRoot(profile)) ??
    input.currentProfile
  );
}

export function suggestTargetPath(sourcePath: string, sourceProfile: RuntimeProfile, targetProfile: RuntimeProfile): string | null {
  if (sourceProfile === targetProfile) {
    return normalizeAbsolutePathOrNull(sourcePath, targetProfile);
  }

  if (sourceProfile === "windows" && targetProfile === "wsl") {
    const match = /^([A-Za-z]):[\\/](.*)$/.exec(sourcePath.trim());
    if (!match) {
      return null;
    }
    const suffix = match[2].replaceAll("\\", "/");
    return `/mnt/${match[1].toLowerCase()}/${suffix}`;
  }

  if (sourceProfile === "wsl" && targetProfile === "windows") {
    const match = /^\/mnt\/([A-Za-z])(?:\/(.*))?$/.exec(sourcePath.trim());
    if (!match) {
      return null;
    }
    const suffix = (match[2] ?? "").replaceAll("/", "\\");
    return `${match[1].toUpperCase()}:\\${suffix}`;
  }

  if ((sourceProfile === "wsl" && targetProfile === "linux") || (sourceProfile === "linux" && targetProfile === "wsl")) {
    return normalizeAbsolutePathOrNull(sourcePath, targetProfile);
  }

  return null;
}

function normalizeAbsolutePathOrNull(sourcePath: string, runtimeProfile: RuntimeProfile) {
  try {
    return normalizeAbsolutePathForProfile(sourcePath, runtimeProfile);
  } catch {
    return null;
  }
}

function collectMigrationInvariants(): PathMigrationReport["invariants"] {
  const sqlite = getSqlite();
  const tableKeys = [
    "manga_roots",
    "comics",
    "local_files",
    "chapters",
    "pages",
    "tags",
    "comic_tags",
    "comic_sources",
    "comic_resources",
    "reading_progress",
  ] as const;

  return Object.fromEntries(
    tableKeys.map((tableName) => {
      const rows = sqlite.prepare(`SELECT * FROM ${tableName}`).all() as Array<Record<string, unknown>>;
      const ids = rows.map((row) => {
        if (tableName === "local_files" && typeof row.id === "string") {
          return `${row.id}:${row.manga_root_id ?? ""}:${row.relative_path ?? ""}`;
        }
        if (typeof row.id === "string") return row.id;
        if (typeof row.manga_root_id === "string") return `${row.manga_root_id}:${row.relative_path ?? ""}`;
        if (typeof row.comic_id === "string" && typeof row.tag_id === "string") return `${row.comic_id}:${row.tag_id}`;
        return JSON.stringify(row);
      }).sort();
      return [tableName, { count: rows.length, idDigest: createHash("sha256").update(ids.join("\n")).digest("hex") }];
    }),
  );
}

function createMigrationFingerprint(input: {
  sourceProfile: RuntimeProfile;
  targetProfile: RuntimeProfile;
  roots: PathMigrationRootReport[];
  blockers: PathMigrationBlocker[];
  invariants: PathMigrationReport["invariants"];
  dataVersion: number;
}) {
  const canonical = JSON.stringify({
    sourceProfile: input.sourceProfile,
    targetProfile: input.targetProfile,
    roots: input.roots,
    blockers: input.blockers,
    invariants: input.invariants,
    dataVersion: input.dataVersion,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

function sameInvariants(left: PathMigrationReport["invariants"], right: PathMigrationReport["invariants"]) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function assertProfile(value: string): asserts value is RuntimeProfile {
  if (!(["windows", "wsl", "linux"] as string[]).includes(value)) {
    throw new PathMigrationError("invalid_input", "目标运行环境必须是 windows、wsl 或 linux。");
  }
}
