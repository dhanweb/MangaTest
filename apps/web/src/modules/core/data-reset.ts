import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import path from "node:path";

import { sql } from "drizzle-orm";

import {
  bootstrapDatabase,
  cacheEntries,
  chapters,
  chapterTags,
  cloudScanEntries,
  cloudScanSessions,
  collectionComics,
  collections,
  comicResources,
  comics,
  comicSources,
  comicTags,
  downloadTaskFinalizations,
  downloadTaskPreparations,
  downloadTasks,
  downloadTaskTransfers,
  getDb,
  getSqlite,
  localFiles,
  mangaRoots,
  mediaAssets,
  operationLogs,
  pages,
  readingProgress,
  scanSessions,
  settings,
  tags,
} from "@/modules/core/db";
import { getRuntimeSettings } from "@/modules/core/settings";

export interface DataResetOptions {
  clearCache: boolean;
  clearLibrary: boolean;
  clearDownloads: boolean;
}

export interface DataResetSummary {
  comics: number;
  localFiles: number;
  chapters: number;
  pages: number;
  tags: number;
  readingProgress: number;
  comicSources: number;
  comicResources: number;
  collections: number;
  collectionComics: number;
  scanSessions: number;
  mediaAssets: number;
  cacheEntries: number;
  downloadTasks: number;
  cloudScanSessions: number;
  operationLogs: number;
  settings: number;
  mangaRoots: number;
  preserved: {
    settings: true;
    mangaRoots: true;
  };
}

export interface DataResetResult {
  options: DataResetOptions;
  deleted: {
    comics: number;
    localFiles: number;
    chapters: number;
    pages: number;
    tags: number;
    readingProgress: number;
    comicSources: number;
    comicResources: number;
    collections: number;
    collectionComics: number;
    scanSessions: number;
    mediaAssets: number;
    cacheEntries: number;
    downloadTasks: number;
    cloudScanSessions: number;
    operationLogs: number;
    cacheFilesRemoved: number;
  };
  preserved: {
    settings: number;
    mangaRoots: number;
  };
  summaryAfter: DataResetSummary;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function countRows(table: any): number {
  const db = getDb();
  const row = db.select({ count: sql<number>`count(*)` }).from(table).get();
  return Number(row?.count ?? 0);
}

export async function getDataResetSummary(): Promise<DataResetSummary> {
  bootstrapDatabase();

  return {
    comics: countRows(comics),
    localFiles: countRows(localFiles),
    chapters: countRows(chapters),
    pages: countRows(pages),
    tags: countRows(tags),
    readingProgress: countRows(readingProgress),
    comicSources: countRows(comicSources),
    comicResources: countRows(comicResources),
    collections: countRows(collections),
    collectionComics: countRows(collectionComics),
    scanSessions: countRows(scanSessions),
    mediaAssets: countRows(mediaAssets),
    cacheEntries: countRows(cacheEntries),
    downloadTasks: countRows(downloadTasks),
    cloudScanSessions: countRows(cloudScanSessions),
    operationLogs: countRows(operationLogs),
    settings: countRows(settings),
    mangaRoots: countRows(mangaRoots),
    preserved: {
      settings: true,
      mangaRoots: true,
    },
  };
}

export async function resetApplicationData(options: DataResetOptions): Promise<DataResetResult> {
  bootstrapDatabase();

  if (!options.clearCache && !options.clearLibrary && !options.clearDownloads) {
    throw new Error("请至少选择一项要清空的内容。");
  }

  const db = getDb();
  const sqlite = getSqlite();
  const runtimeSettings = await getRuntimeSettings();

  // Library wipe depends on media_assets / cache_entries foreign keys.
  const shouldClearCacheTables = options.clearCache || options.clearLibrary;
  const shouldClearDownloadTables = options.clearDownloads;

  const mediaAssetFiles = shouldClearCacheTables
    ? db
        .select({ filePath: mediaAssets.filePath })
        .from(mediaAssets)
        .all()
        .map((row) => row.filePath)
        .filter((filePath): filePath is string => Boolean(filePath))
    : [];

  const cacheEntryFiles = shouldClearCacheTables
    ? db
        .select({ filePath: cacheEntries.filePath })
        .from(cacheEntries)
        .all()
        .map((row) => row.filePath)
        .filter((filePath): filePath is string => Boolean(filePath))
    : [];

  const deleted = {
    comics: 0,
    localFiles: 0,
    chapters: 0,
    pages: 0,
    tags: 0,
    readingProgress: 0,
    comicSources: 0,
    comicResources: 0,
    collections: 0,
    collectionComics: 0,
    scanSessions: 0,
    mediaAssets: 0,
    cacheEntries: 0,
    downloadTasks: 0,
    cloudScanSessions: 0,
    operationLogs: 0,
    cacheFilesRemoved: 0,
  };

  const run = sqlite.transaction(() => {
    if (shouldClearDownloadTables) {
      deleted.cloudScanSessions = countRows(cloudScanSessions);
      deleted.downloadTasks = countRows(downloadTasks);
      db.delete(cloudScanEntries).run();
      db.delete(cloudScanSessions).run();
      db.delete(downloadTaskFinalizations).run();
      db.delete(downloadTaskTransfers).run();
      db.delete(downloadTaskPreparations).run();
      db.delete(downloadTasks).run();
    } else if (options.clearLibrary) {
      // Keep download task history, but detach FKs that would block library wipe.
      sqlite.prepare("UPDATE download_task_finalizations SET comic_resource_id = NULL, scan_session_id = NULL").run();
      sqlite.prepare("UPDATE download_task_transfers SET comic_resource_id = NULL").run();
      sqlite.prepare("UPDATE download_task_preparations SET comic_resource_id = NULL").run();
      sqlite.prepare("UPDATE download_tasks SET comic_resource_id = NULL").run();
      sqlite.prepare("UPDATE cloud_scan_sessions SET comic_resource_id = NULL").run();
    }

    if (shouldClearCacheTables) {
      deleted.mediaAssets = countRows(mediaAssets);
      deleted.cacheEntries = countRows(cacheEntries);
      db.delete(mediaAssets).run();
      db.delete(cacheEntries).run();
    }

    if (options.clearLibrary) {
      deleted.collectionComics = countRows(collectionComics);
      deleted.collections = countRows(collections);
      deleted.readingProgress = countRows(readingProgress);
      deleted.pages = countRows(pages);
      deleted.chapters = countRows(chapters);
      deleted.comicResources = countRows(comicResources);
      deleted.comicSources = countRows(comicSources);
      deleted.localFiles = countRows(localFiles);
      deleted.comics = countRows(comics);
      deleted.tags = countRows(tags);
      deleted.scanSessions = countRows(scanSessions);
      deleted.operationLogs = countRows(operationLogs);

      db.delete(collectionComics).run();
      db.delete(collections).run();
      db.delete(readingProgress).run();
      db.delete(chapterTags).run();
      db.delete(comicTags).run();
      db.delete(pages).run();
      db.delete(chapters).run();
      db.delete(comicResources).run();
      db.delete(comicSources).run();

      sqlite
        .prepare(
          "UPDATE comics SET primary_local_file_id = NULL, last_read_chapter_id = NULL, last_read_page_id = NULL, parent_comic_id = NULL, merged_as_chapter_id = NULL",
        )
        .run();
      sqlite.prepare("UPDATE local_files SET comic_id = NULL").run();
      sqlite.prepare("UPDATE manga_roots SET last_scan_session_id = NULL").run();

      db.delete(localFiles).run();
      db.delete(comics).run();
      db.delete(tags).run();
      db.delete(scanSessions).run();
      db.delete(operationLogs).run();
    }
  });

  run();

  const uniqueFiles = [...new Set([...mediaAssetFiles, ...cacheEntryFiles])];
  for (const filePath of uniqueFiles) {
    try {
      await rm(/*turbopackIgnore: true*/ filePath, { force: true });
      deleted.cacheFilesRemoved += 1;
    } catch {
      // Best-effort file cleanup after DB consistency is ensured.
    }
  }

  if (shouldClearCacheTables) {
    const cacheRoot = path.resolve(/*turbopackIgnore: true*/ process.cwd(), runtimeSettings.cacheDirectory);
    for (const subdir of [
      "covers",
      "list-covers",
      "reader-thumbnails",
      "manual-covers",
      "page-images",
      "archive-file-lists",
      "downloads-temp",
    ]) {
      try {
        await rm(/*turbopackIgnore: true*/ path.join(cacheRoot, subdir), { recursive: true, force: true });
      } catch {
        // optional cache subdirectories may not exist
      }
    }
  }

  const scopes: string[] = [];
  if (options.clearCache) scopes.push("缓存");
  if (options.clearLibrary) scopes.push("漫画信息");
  if (options.clearDownloads) scopes.push("下载任务");

  db.insert(operationLogs)
    .values({
      id: randomUUID(),
      operation: "data_reset",
      targetType: "system",
      targetId: "data-reset",
      summary: `清空数据：${scopes.join("、")}（已保留设置与漫画根目录）`,
      detailJson: JSON.stringify({
        options,
        deleted: {
          comics: deleted.comics,
          localFiles: deleted.localFiles,
          downloadTasks: deleted.downloadTasks,
          mediaAssets: deleted.mediaAssets,
          cacheEntries: deleted.cacheEntries,
          cacheFilesRemoved: deleted.cacheFilesRemoved,
        },
      }),
    })
    .run();

  const summaryAfter = await getDataResetSummary();

  return {
    options,
    deleted,
    preserved: {
      settings: summaryAfter.settings,
      mangaRoots: summaryAfter.mangaRoots,
    },
    summaryAfter,
  };
}
