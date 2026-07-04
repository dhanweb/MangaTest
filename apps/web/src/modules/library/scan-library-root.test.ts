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

    const { getReaderThumbnail } = await import("../media-assets");
    const generatedThumbnail = await getReaderThumbnail({ pageId: directoryPage.id, width: 88, height: 132 });
    const cachedThumbnail = await getReaderThumbnail({ pageId: directoryPage.id, width: 88, height: 132 });

    expect(generatedThumbnail?.contentType).toBe("image/webp");
    expect(generatedThumbnail?.cacheStatus).toBe("generated");
    expect(cachedThumbnail?.cacheStatus).toBe("hit");
    expect(countRows(sqlite, "media_assets")).toBe(1);

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
