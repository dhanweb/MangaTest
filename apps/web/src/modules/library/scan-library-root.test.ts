import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import Database from "better-sqlite3";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

const ARCHIVE_FIXTURE_BASE64 =
  "UEsDBBQAAAAIADGf4lxruW0fGAAAABYAAAAHAAAAMDAxLmpwZ0tLzE5VSCxKzsgsS1XIzE1MT1Uw5OUCAFBLAwQUAAAACAAxn+JcMgcrHRgAAAAWAAAABwAAADAwMi5wbmdLS8xOVUgsSs7ILEtVyMxNTE9VMOLlAgBQSwECFAAUAAAACAAxn+Jca7ltHxgAAAAWAAAABwAAAAAAAAAAAAAAAAAAAAAAMDAxLmpwZ1BLAQIUABQAAAAIADGf4lwyBysdGAAAABYAAAAHAAAAAAAAAAAAAAAAAD0AAAAwMDIucG5nUEsFBgAAAAACAAIAagAAAHoAAAAAAA==";

describe("scanMangaRoot", () => {
  it("imports directory and cbz comics, then marks missing local files on rescan", async () => {
    const workspace = path.join(os.tmpdir(), `mangatest-scan-${randomUUID()}`);
    const rootPath = path.join(workspace, "Root");
    const directoryComicPath = path.join(rootPath, "Comic A");
    const dbPath = path.join(workspace, "test.sqlite");
    const jpegFixture = await sharp({
      create: {
        width: 16,
        height: 24,
        channels: 3,
        background: "#ef3b91",
      },
    })
      .jpeg()
      .toBuffer();
    const pngFixture = await sharp({
      create: {
        width: 12,
        height: 18,
        channels: 3,
        background: "#ffffff",
      },
    })
      .png()
      .toBuffer();

    await mkdir(workspace, { recursive: true });
    await mkdir(directoryComicPath, { recursive: true });
    await writeFile(path.join(directoryComicPath, "001.jpg"), jpegFixture);
    await writeFile(path.join(directoryComicPath, "002.png"), pngFixture);
    await writeFile(path.join(rootPath, "Archive Comic.cbz"), Buffer.from(ARCHIVE_FIXTURE_BASE64, "base64"));

    process.env.MANGATEST_DB_PATH = dbPath;

    const { createMangaRootRepository } = await import("./manga-roots.repository");
    const { scanMangaRoot } = await import("./scan-library-root");

    const root = await createMangaRootRepository().create({
      absolutePath: rootPath,
      displayName: "Smoke root",
    });

    const firstScan = await scanMangaRoot(root.id);

    expect(firstScan.addedCount).toBe(2);
    expect(firstScan.pageCount).toBe(4);

    const sqlite = new Database(dbPath);
    expect(countRows(sqlite, "comics")).toBe(2);
    expect(countRows(sqlite, "local_files")).toBe(2);
    expect(countRows(sqlite, "chapters")).toBe(2);
    expect(countRows(sqlite, "pages")).toBe(4);
    expect(countRows(sqlite, "cache_entries", "kind = 'archive_file_list'")).toBe(1);
    expect(tableExists(sqlite, "settings")).toBe(true);
    expect(tableExists(sqlite, "reading_progress")).toBe(true);
    expect(tableExists(sqlite, "media_assets")).toBe(true);
    expect(tableExists(sqlite, "cache_entries")).toBe(true);
    expect(tableExists(sqlite, "operation_logs")).toBe(true);

    const { readReaderPageImage } = await import("../reader/page-images");
    const directoryPage = selectPageBySourceKind(sqlite, "filesystem");
    const secondDirectoryPage = selectPageBySourceKind(sqlite, "filesystem", 1);
    const archivePage = selectPageBySourceKind(sqlite, "archive");
    const directoryImage = await readReaderPageImage(directoryPage.id);
    const archiveImage = await readReaderPageImage(archivePage.id);

    expect(directoryImage?.contentType).toBe("image/jpeg");
    expect(directoryImage?.data.length).toBe(jpegFixture.length);
    expect(archiveImage?.contentType).toBe("image/jpeg");
    expect(archiveImage?.data.length).toBeGreaterThan(0);

    const { getRuntimeSettings, saveRuntimeSettings } = await import("../core/settings");
    const savedSettings = await saveRuntimeSettings({
      cacheDirectory: path.join(workspace, "cache"),
      cacheSizeMb: 1,
      readerThumbnailTtlDays: 7,
    });
    const runtimeSettings = await getRuntimeSettings();

    expect(savedSettings.cacheDirectory).toBe(path.join(workspace, "cache"));
    expect(runtimeSettings.cacheSizeMb).toBe(1);
    expect(runtimeSettings.readerThumbnailTtlDays).toBe(7);

    const { getReaderThumbnail } = await import("../media-assets");
    const generatedThumbnail = await getReaderThumbnail({ pageId: directoryPage.id, width: 88, height: 132 });
    const cachedThumbnail = await getReaderThumbnail({ pageId: directoryPage.id, width: 88, height: 132 });

    expect(generatedThumbnail?.contentType).toBe("image/webp");
    expect(generatedThumbnail?.cacheStatus).toBe("generated");
    expect(cachedThumbnail?.cacheStatus).toBe("hit");
    expect(countRows(sqlite, "media_assets")).toBe(1);

    const { cleanupApplicationCache, getCacheSummary } = await import("../core/cache");
    const cacheSummary = await getCacheSummary();

    expect(cacheSummary.mediaAssetCount).toBe(1);
    expect(cacheSummary.archiveFileListCount).toBe(1);
    expect(cacheSummary.maxSizeBytes).toBe(1024 * 1024);
    expect(cacheSummary.totalSizeBytes).toBeGreaterThan(0);

    sqlite
      .prepare(
        "insert into cache_entries (id, kind, cache_key, metadata_json, size_bytes, last_access_at, expires_at) values (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(randomUUID(), "archive_file_list", "expired:test", '{"pages":[]}', 12, "2000-01-01T00:00:00.000Z", "2000-01-01T00:00:00.000Z");

    const cleanupResult = await cleanupApplicationCache();
    expect(cleanupResult.removedCount).toBeGreaterThanOrEqual(1);
    expect(countRows(sqlite, "cache_entries", "cache_key = 'expired:test'")).toBe(0);

    const { createTagRepository } = await import("../tags/tags.repository");
    const tagRepository = createTagRepository();
    const createdTag = await tagRepository.create({
      namespace: "artist",
      name: "Sample Artist",
      displayNameZh: "示例作者",
    });
    const updatedTag = await tagRepository.update(createdTag.id, {
      namespace: "artist",
      name: "Sample Artist",
      displayNameZh: "示例作者改",
    });
    const tagRows = await tagRepository.listWithCounts();

    expect(createdTag.canonical).toBe("artist:sample artist");
    expect(updatedTag?.displayNameZh).toBe("示例作者改");
    expect(tagRows.some((tag) => tag.id === createdTag.id && tag.comicCount === 0)).toBe(true);

    const comicAId = selectComicIdByFileTitle(sqlite, "Comic A");
    sqlite
      .prepare("insert into comic_tags (comic_id, tag_id, source, is_user_edited) values (?, ?, ?, ?)")
      .run(comicAId, createdTag.id, "manual", 1);

    const { createComicRepository } = await import("./comics.repository");
    const comicRepository = createComicRepository();
    const tagFilters = await comicRepository.listReadableTagFilters();
    const tagSearchResult = await comicRepository.searchReadableCards({ query: "示例作者改", pageSize: 12 });
    const taggedResult = await comicRepository.searchReadableCards({ tags: [createdTag.canonical], pageSize: 12 });

    expect(tagFilters.some((tag) => tag.canonical === createdTag.canonical && tag.comicCount === 1)).toBe(true);
    expect(tagSearchResult.items.map((comic) => comic.id)).toContain(comicAId);
    expect(taggedResult.total).toBe(1);
    expect(taggedResult.items[0]?.id).toBe(comicAId);

    const { saveReadingProgress } = await import("../reader/reading-progress");
    const savedDirectoryProgress = await saveReadingProgress({
      pageId: directoryPage.id,
      progressPercent: 25,
    });
    const updatedDirectoryProgress = await saveReadingProgress({
      pageId: secondDirectoryPage.id,
      progressPercent: 50,
    });
    const savedArchiveProgress = await saveReadingProgress({
      pageId: archivePage.id,
      progressPercent: 150,
    });

    expect(savedDirectoryProgress?.progressPercent).toBe(25);
    expect(updatedDirectoryProgress?.progressPercent).toBe(50);
    expect(savedArchiveProgress?.progressPercent).toBe(100);
    expect(countRows(sqlite, "reading_progress")).toBe(2);
    expect(selectLastReadPageId(sqlite, updatedDirectoryProgress?.comicId ?? "")).toBe(secondDirectoryPage.id);
    expect(selectLastReadPageId(sqlite, savedArchiveProgress?.comicId ?? "")).toBe(archivePage.id);

    const secondScan = await scanMangaRoot(root.id);

    expect(secondScan.addedCount).toBe(0);
    expect(secondScan.missingCount).toBe(0);
    expect(countRows(sqlite, "cache_entries", "kind = 'archive_file_list'")).toBe(1);

    await rm(directoryComicPath, { recursive: true, force: true });

    const thirdScan = await scanMangaRoot(root.id);

    expect(thirdScan.addedCount).toBe(0);
    expect(thirdScan.missingCount).toBe(1);
    expect(countRows(sqlite, "local_files", "is_missing = 1")).toBe(1);

    const publicRowsAfterMissing = await comicRepository.searchReadableCards({ pageSize: 12 });

    expect(publicRowsAfterMissing.items.some((comic) => comic.fileTitle === "Comic A")).toBe(false);

    const repairedComicPath = path.join(rootPath, "Comic A repaired");
    await mkdir(repairedComicPath, { recursive: true });
    await writeFile(path.join(repairedComicPath, "001.jpg"), jpegFixture);

    const { createFileMaintenanceRepository } = await import("../local-files/file-maintenance.repository");
    const missingLocalFileId = selectMissingLocalFileId(sqlite);
    const repairResult = await createFileMaintenanceRepository().repairMissingPath(missingLocalFileId, repairedComicPath);

    expect(repairResult.absolutePath).toBe(repairedComicPath);
    expect(countRows(sqlite, "local_files", "is_missing = 1")).toBe(0);
    expect(countRows(sqlite, "operation_logs", "operation = 'path_repair'")).toBe(1);

    const { createComicMaintenanceRepository } = await import("./comic-maintenance.repository");
    const maintenanceRepository = createComicMaintenanceRepository();
    const publicRowsAfterRepair = await comicRepository.searchReadableCards({ pageSize: 12 });

    expect(publicRowsAfterRepair.items.some((comic) => comic.id === comicAId)).toBe(true);

    const hiddenComic = await maintenanceRepository.changeStatus(comicAId, "hide");
    const publicRowsAfterHide = await comicRepository.searchReadableCards({ pageSize: 12 });

    expect(hiddenComic.previousStatus).toBe("readable");
    expect(hiddenComic.status).toBe("hidden");
    expect(selectComicStatus(sqlite, comicAId).status).toBe("hidden");
    expect(publicRowsAfterHide.items.some((comic) => comic.id === comicAId)).toBe(false);
    expect(countRows(sqlite, "operation_logs", "operation = 'hide'")).toBe(1);

    const deletedComic = await maintenanceRepository.changeStatus(comicAId, "soft_delete");

    expect(deletedComic.previousStatus).toBe("hidden");
    expect(deletedComic.status).toBe("deleted");
    expect(selectComicStatus(sqlite, comicAId).status).toBe("deleted");
    expect(countRows(sqlite, "operation_logs", "operation = 'soft_delete'")).toBe(1);

    const restoredComic = await maintenanceRepository.changeStatus(comicAId, "restore");
    const restoredStatus = selectComicStatus(sqlite, comicAId);
    const publicRowsAfterRestore = await comicRepository.searchReadableCards({ pageSize: 12 });

    expect(restoredComic.previousStatus).toBe("deleted");
    expect(restoredComic.status).toBe("readable");
    expect(restoredStatus.status).toBe("readable");
    expect(restoredStatus.hiddenAt).toBeNull();
    expect(restoredStatus.deletedAt).toBeNull();
    expect(publicRowsAfterRestore.items.some((comic) => comic.id === comicAId)).toBe(true);
    expect(countRows(sqlite, "operation_logs", "operation = 'restore'")).toBe(1);

    const { createSqliteBackupDownload } = await import("../core/db/backup");
    const backup = await createSqliteBackupDownload();
    const backupPath = path.join(workspace, backup.filename);

    await writeFile(backupPath, backup.data);

    const backupSqlite = new Database(backupPath);

    expect(backup.filename).toMatch(/^mangatest-.+\.sqlite$/);
    expect(backup.sizeBytes).toBeGreaterThan(0);
    expect(countRows(backupSqlite, "comics")).toBe(2);
    expect(countRows(backupSqlite, "reading_progress")).toBe(2);
    expect(countRows(backupSqlite, "operation_logs")).toBeGreaterThanOrEqual(4);

    backupSqlite.close();
    sqlite.close();
  });
});

function countRows(sqlite: Database.Database, tableName: string, whereClause = "1 = 1") {
  const row = sqlite.prepare(`select count(*) as count from ${tableName} where ${whereClause}`).get() as {
    count: number;
  };

  return row.count;
}

function tableExists(sqlite: Database.Database, tableName: string) {
  const row = sqlite
    .prepare("select name from sqlite_master where type = 'table' and name = ?")
    .get(tableName) as { name: string } | undefined;

  return row?.name === tableName;
}

function selectPageBySourceKind(sqlite: Database.Database, sourceKind: "filesystem" | "archive", offset = 0) {
  return sqlite
    .prepare("select id from pages where source_kind = ? order by page_number limit 1 offset ?")
    .get(sourceKind, offset) as { id: string };
}

function selectLastReadPageId(sqlite: Database.Database, comicId: string) {
  const row = sqlite.prepare("select last_read_page_id as pageId from comics where id = ?").get(comicId) as
    | { pageId: string | null }
    | undefined;

  return row?.pageId ?? null;
}

function selectMissingLocalFileId(sqlite: Database.Database) {
  const row = sqlite.prepare("select id from local_files where is_missing = 1 limit 1").get() as { id: string };
  return row.id;
}

function selectComicIdByFileTitle(sqlite: Database.Database, fileTitle: string) {
  const row = sqlite.prepare("select id from comics where file_title = ?").get(fileTitle) as { id: string };
  return row.id;
}

function selectComicStatus(sqlite: Database.Database, comicId: string) {
  return sqlite
    .prepare("select status, hidden_at as hiddenAt, deleted_at as deletedAt from comics where id = ?")
    .get(comicId) as {
    status: string;
    hiddenAt: string | null;
    deletedAt: string | null;
  };
}
