import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { and, eq } from "drizzle-orm";

import { bootstrapDatabase, comics, getDb, localFiles, operationLogs } from "@/modules/core/db";
import { createRootLocationService } from "./root-location.service";
import { toPortableRelativePath } from "./portable-relative-path";
import { validateAbsolutePath } from "@/modules/local-files/path-safety";

export interface FileMaintenanceIssueRecord {
  id: string;
  comicId: string | null;
  comicTitle: string;
  issueType: "missing" | "root_offline";
  filePath: string;
  expectedSize: string;
  detail: string;
  detectedAt: string;
}

export interface FileMaintenanceRepository {
  listIssues(): Promise<FileMaintenanceIssueRecord[]>;
  recheckMissingFiles(): Promise<{ checkedCount: number; restoredCount: number; stillMissingCount: number }>;
  ignoreMissingIssue(localFileId: string): Promise<{ localFileId: string }>;
  repairMissingPath(localFileId: string, nextAbsolutePath: string): Promise<{ localFileId: string; absolutePath: string }>;
}

export function createFileMaintenanceRepository(): FileMaintenanceRepository {
  return {
    async listIssues() {
      bootstrapDatabase();
      const db = getDb();
      const rows = db
        .select({
          id: localFiles.id,
          comicId: localFiles.comicId,
          comicTitle: comics.displayTitle,
          legacyFilePath: localFiles.absolutePath,
          mangaRootId: localFiles.mangaRootId,
          relativePath: localFiles.relativePath,
          sizeBytes: localFiles.sizeBytes,
          missingSince: localFiles.missingSince,
          updatedAt: localFiles.updatedAt,
        })
        .from(localFiles)
        .leftJoin(comics, eq(comics.id, localFiles.comicId))
        .where(and(eq(localFiles.isMissing, true), eq(localFiles.isIgnored, false)))
        .all();

      const locationService = createRootLocationService();
      const offlineRootIds = new Set<string>();
      const issues: FileMaintenanceIssueRecord[] = [];

      for (const row of rows) {
        const state = row.mangaRootId ? await locationService.resolveMangaRoot(row.mangaRootId) : null;
        if (state && state.status !== "available") {
          if (!offlineRootIds.has(row.mangaRootId!)) {
            offlineRootIds.add(row.mangaRootId!);
            issues.push({
              id: `root-offline:${row.mangaRootId}`,
              comicId: null,
              comicTitle: row.comicTitle ?? "未关联漫画",
              issueType: "root_offline",
              filePath: state.status === "unconfigured" ? "未配置当前运行环境路径" : state.absolutePath,
              expectedSize: "-",
              detail: state.status === "unconfigured" ? "当前运行环境没有配置这个漫画根目录的位置。" : `漫画根目录当前不可用：${state.reason}`,
              detectedAt: row.missingSince ?? row.updatedAt,
            });
          }
          continue;
        }

        const filePath = state?.status === "available" && row.mangaRootId
          ? await locationService.resolveMangaFile(row.mangaRootId, row.relativePath).catch(() => row.legacyFilePath)
          : row.legacyFilePath;
        issues.push({
          id: row.id,
          comicId: row.comicId,
          comicTitle: row.comicTitle ?? "未关联漫画",
          issueType: "missing",
          filePath,
          expectedSize: formatBytes(row.sizeBytes),
          detail: "文件路径不存在，可能是磁盘已断开连接或文件被移动。",
          detectedAt: row.missingSince ?? row.updatedAt,
        });
      }

      return issues;
    },

    async recheckMissingFiles() {
      bootstrapDatabase();
      const db = getDb();
      const missingRows = db
        .select({
          id: localFiles.id,
          comicId: localFiles.comicId,
          legacyAbsolutePath: localFiles.absolutePath,
          mangaRootId: localFiles.mangaRootId,
          relativePath: localFiles.relativePath,
          kind: localFiles.kind,
        })
        .from(localFiles)
        .where(eq(localFiles.isMissing, true))
        .all();

      let restoredCount = 0;
      const now = new Date().toISOString();
      const locationService = createRootLocationService();

      for (const row of missingRows) {
        let absolutePath = row.legacyAbsolutePath;
        if (row.mangaRootId) {
          const root = await locationService.resolveMangaRoot(row.mangaRootId);
          if (root.status !== "available" && root.status !== "unconfigured") {
            continue;
          }
          absolutePath = await locationService.resolveMangaFile(row.mangaRootId, row.relativePath).catch(() => row.legacyAbsolutePath);
        }

        const stat = await fs.stat(absolutePath).catch(() => null);
        const existsAsExpected =
          Boolean(stat) &&
          ((row.kind === "directory" && stat?.isDirectory()) || ((row.kind === "zip" || row.kind === "cbz") && stat?.isFile()));

        if (!existsAsExpected) {
          continue;
        }

        db.transaction((tx) => {
          tx.update(localFiles)
            .set({
              isMissing: false,
              missingSince: null,
              isIgnored: false,
              ignoredAt: null,
              mtimeMs: Math.trunc(stat!.mtimeMs),
              ...(stat!.isFile() ? { sizeBytes: stat!.size } : {}),
              updatedAt: now,
            })
            .where(eq(localFiles.id, row.id))
            .run();

          if (row.comicId) {
            tx.update(comics)
              .set({
                status: "readable",
                updatedAt: now,
              })
              .where(eq(comics.id, row.comicId))
              .run();
          }
        });

        restoredCount += 1;
      }

      return {
        checkedCount: missingRows.length,
        restoredCount,
        stillMissingCount: missingRows.length - restoredCount,
      };
    },

    async ignoreMissingIssue(localFileId) {
      bootstrapDatabase();
      const db = getDb();
      const row = db
        .select({
          id: localFiles.id,
          absolutePath: localFiles.absolutePath,
          isMissing: localFiles.isMissing,
          isIgnored: localFiles.isIgnored,
        })
        .from(localFiles)
        .where(eq(localFiles.id, localFileId))
        .get();

      if (!row) {
        throw new Error("找不到要忽略的本地文件记录。");
      }

      if (!row.isMissing) {
        throw new Error("只能忽略当前缺失的文件问题。");
      }

      if (row.isIgnored) {
        return { localFileId };
      }

      const now = new Date().toISOString();
      db.transaction((tx) => {
        tx.update(localFiles)
          .set({
            isIgnored: true,
            ignoredAt: now,
            updatedAt: now,
          })
          .where(eq(localFiles.id, localFileId))
          .run();

        tx.insert(operationLogs)
          .values({
            id: randomUUID(),
            operation: "ignore_file_issue",
            targetType: "local_file",
            targetId: localFileId,
            summary: "忽略缺失文件问题",
            detailJson: JSON.stringify({ absolutePath: row.absolutePath }),
          })
          .run();
      });

      return { localFileId };
    },

    async repairMissingPath(localFileId, nextAbsolutePath) {
      bootstrapDatabase();
      const validation = validateAbsolutePath(nextAbsolutePath);
      if (!validation.isValid || !validation.normalizedPath) {
        throw new Error(validation.reason ?? "路径无效。");
      }
      const normalizedPath = validation.normalizedPath;

      const db = getDb();
      const row = db
        .select({
          id: localFiles.id,
          comicId: localFiles.comicId,
          kind: localFiles.kind,
          oldAbsolutePath: localFiles.absolutePath,
          mangaRootId: localFiles.mangaRootId,
          relativePath: localFiles.relativePath,
        })
        .from(localFiles)
        .where(eq(localFiles.id, localFileId))
        .get();

      if (!row) {
        throw new Error("找不到要修复的本地文件记录。");
      }

      if (!row.mangaRootId) {
        throw new Error("这个文件记录没有关联 manga root，暂时不能自动修复。");
      }

      const root = await createRootLocationService().resolveMangaRoot(row.mangaRootId);
      if (root.status !== "available") {
        throw new Error(root.status === "unconfigured" ? "当前运行环境没有配置漫画根目录位置。" : root.reason);
      }

      const stat = await fs.stat(normalizedPath).catch(() => null);
      if (!stat) {
        throw new Error("新路径不存在。");
      }

      if (row.kind === "directory" && !stat.isDirectory()) {
        throw new Error("这个记录是目录漫画，新路径也必须是目录。");
      }

      if ((row.kind === "zip" || row.kind === "cbz") && !stat.isFile()) {
        throw new Error("这个记录是压缩包漫画，新路径也必须是文件。");
      }

      const relativePath = path.relative(root.absolutePath, normalizedPath);
      if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
        throw new Error("新路径必须位于原 manga root 下。");
      }
      const portableRelativePath = toPortableRelativePath(relativePath);

      const now = new Date().toISOString();
      db.transaction((tx) => {
        const localFileUpdate = {
          absolutePath: normalizedPath,
          relativePath: portableRelativePath,
          mtimeMs: Math.trunc(stat.mtimeMs),
          isMissing: false,
          missingSince: null,
          isIgnored: false,
          ignoredAt: null,
          updatedAt: now,
          ...(stat.isFile() ? { sizeBytes: stat.size } : {}),
        };

        tx.update(localFiles)
          .set(localFileUpdate)
          .where(eq(localFiles.id, localFileId))
          .run();

        if (row.comicId) {
          tx.update(comics)
            .set({
              status: "readable",
              updatedAt: now,
            })
            .where(eq(comics.id, row.comicId))
            .run();
        }

        tx.insert(operationLogs)
          .values({
            id: randomUUID(),
            operation: "path_repair",
            targetType: "local_file",
            targetId: localFileId,
            summary: "修复缺失文件路径",
            detailJson: JSON.stringify({
              from: row.oldAbsolutePath,
              to: normalizedPath,
            }),
          })
          .run();
      });

      return {
        localFileId,
        absolutePath: normalizedPath,
      };
    },
  };
}

function formatBytes(value: number | null) {
  if (!value) {
    return "-";
  }

  if (value >= 1024 * 1024 * 1024) {
    return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
  }

  if (value >= 1024 * 1024) {
    return `${Math.round(value / 1024 / 1024)} MB`;
  }

  return `${Math.round(value / 1024)} KB`;
}
