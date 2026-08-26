import { randomUUID } from "node:crypto";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";

import { eq } from "drizzle-orm";

import {
  bootstrapDatabase,
  downloadTaskFinalizations,
  getDb,
  getSqlite,
  localFiles,
  mangaRootLocations,
  mangaRoots,
  operationLogs,
} from "@/modules/core/db";
import { detectCurrentRuntimeEnvironment } from "@/modules/core/runtime-paths";
import { getRuntimeSettings, saveRuntimeSettings } from "@/modules/core/settings";
import {
  moveMangaRootContents,
  rewritePathUnderRoot,
  validateRootRelocatePaths,
} from "@/modules/local-files/root-relocate";

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

export async function relocateSystemMangaRoot(
  input: RelocateSystemMangaRootInput,
): Promise<RelocateSystemMangaRootResult> {
  bootstrapDatabase();

  const db = getDb();
  const sqlite = getSqlite();
  const root = db.select().from(mangaRoots).where(eq(mangaRoots.id, input.mangaRootId)).get();

  if (!root) {
    throw new Error("漫画根目录不存在。");
  }

  if (root.kind !== "system") {
    throw new Error("只能修改系统默认目录的路径。");
  }

  const validation = validateRootRelocatePaths({
    sourcePath: root.absolutePath,
    destinationPath: input.nextAbsolutePath,
  });

  if (!validation.isValid || !validation.normalizedSource || !validation.normalizedDestination) {
    throw new Error(validation.reason ?? "路径无效。");
  }

  const fromPath = validation.normalizedSource;
  const toPath = validation.normalizedDestination;

  const conflict = db.select().from(mangaRoots).where(eq(mangaRoots.absolutePath, toPath)).get();
  if (conflict && conflict.id !== root.id) {
    throw new Error("目标路径已被另一个漫画根目录使用。");
  }

  let movedEntryCount = 0;

  if (input.moveFiles) {
    const moveResult = await moveMangaRootContents({
      sourcePath: fromPath,
      destinationPath: toPath,
    });
    movedEntryCount = moveResult.movedEntryCount;
  } else {
    await mkdir(toPath, { recursive: true });
  }

  const relatedLocalFiles = db
    .select({
      id: localFiles.id,
      relativePath: localFiles.relativePath,
      kind: localFiles.kind,
      absolutePath: localFiles.absolutePath,
    })
    .from(localFiles)
    .where(eq(localFiles.mangaRootId, root.id))
    .all();

  const finalizations = db
    .select({
      id: downloadTaskFinalizations.id,
      finalPath: downloadTaskFinalizations.finalPath,
    })
    .from(downloadTaskFinalizations)
    .all();

  const runtimeSettings = await getRuntimeSettings();
  const oldDownloadTarget = runtimeSettings.downloadDefaultTargetDirectory
    ? path.normalize(runtimeSettings.downloadDefaultTargetDirectory)
    : "";
  const shouldUpdateDownloadTarget = Boolean(oldDownloadTarget) && oldDownloadTarget === fromPath;

  let updatedLocalFileCount = 0;
  let updatedFinalizationCount = 0;
  const now = new Date().toISOString();
  const runtimeProfile = detectCurrentRuntimeEnvironment().profile;

  // Collect filesystem stats outside the transaction (async I/O).
  const localFileUpdates: Array<{
    id: string;
    absolutePath: string;
    sizeBytes: number | null;
    mtimeMs: number | null;
    isMissing: boolean;
    missingSince: string | null;
  }> = [];

  for (const file of relatedLocalFiles) {
    const nextAbsolutePath = path.join(toPath, file.relativePath);
    const fileStat = await stat(nextAbsolutePath).catch(() => null);
    const isMissing = !fileStat;

    localFileUpdates.push({
      id: file.id,
      absolutePath: nextAbsolutePath,
      sizeBytes: fileStat?.isFile() ? fileStat.size : null,
      mtimeMs: fileStat ? Math.trunc(fileStat.mtimeMs) : null,
      isMissing,
      missingSince: isMissing ? now : null,
    });
  }

  const finalizationUpdates: Array<{ id: string; finalPath: string }> = [];
  for (const row of finalizations) {
    if (!row.finalPath) continue;
    const rewritten = rewritePathUnderRoot({
      absolutePath: row.finalPath,
      oldRoot: fromPath,
      newRoot: toPath,
    });
    if (rewritten && rewritten !== row.finalPath) {
      finalizationUpdates.push({ id: row.id, finalPath: rewritten });
    }
  }

  const run = sqlite.transaction(() => {
    db.insert(mangaRootLocations)
      .values({
        id: randomUUID(),
        mangaRootId: root.id,
        runtimeProfile,
        absolutePath: toPath,
        verificationStatus: "available",
        lastVerifiedAt: now,
        lastError: null,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [mangaRootLocations.mangaRootId, mangaRootLocations.runtimeProfile],
        set: {
          absolutePath: toPath,
          verificationStatus: "available",
          lastVerifiedAt: now,
          lastError: null,
          updatedAt: now,
        },
      })
      .run();

    db.update(mangaRoots)
      .set({
        absolutePath: toPath,
        updatedAt: now,
      })
      .where(eq(mangaRoots.id, root.id))
      .run();

    for (const update of localFileUpdates) {
      db.update(localFiles)
        .set({
          absolutePath: update.absolutePath,
          sizeBytes: update.sizeBytes,
          mtimeMs: update.mtimeMs,
          isMissing: update.isMissing,
          missingSince: update.missingSince,
          updatedAt: now,
        })
        .where(eq(localFiles.id, update.id))
        .run();
      updatedLocalFileCount += 1;
    }

    for (const update of finalizationUpdates) {
      db.update(downloadTaskFinalizations)
        .set({
          finalPath: update.finalPath,
          updatedAt: now,
        })
        .where(eq(downloadTaskFinalizations.id, update.id))
        .run();
      updatedFinalizationCount += 1;
    }

    db.insert(operationLogs)
      .values({
        id: randomUUID(),
        operation: "system_root_relocate",
        targetType: "manga_root",
        targetId: root.id,
        summary: input.moveFiles
          ? `迁移系统默认目录并移动文件：${fromPath} -> ${toPath}`
          : `更新系统默认目录路径（未移动文件）：${fromPath} -> ${toPath}`,
        detailJson: JSON.stringify({
          fromPath,
          toPath,
          moveFiles: input.moveFiles,
          movedEntryCount,
          updatedLocalFileCount: localFileUpdates.length,
          updatedFinalizationCount: finalizationUpdates.length,
          downloadDefaultTargetDirectoryUpdated: shouldUpdateDownloadTarget,
        }),
      })
      .run();
  });

  run();

  if (shouldUpdateDownloadTarget) {
    await saveRuntimeSettings({ downloadDefaultTargetDirectory: toPath });
  }

  return {
    mangaRootId: root.id,
    fromPath,
    toPath,
    moveFiles: input.moveFiles,
    movedEntryCount,
    updatedLocalFileCount,
    updatedFinalizationCount,
    downloadDefaultTargetDirectoryUpdated: shouldUpdateDownloadTarget,
  };
}
