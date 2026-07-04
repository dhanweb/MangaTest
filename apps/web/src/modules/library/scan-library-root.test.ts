import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

const ARCHIVE_FIXTURE_BASE64 =
  "UEsDBBQAAAAIADGf4lxruW0fGAAAABYAAAAHAAAAMDAxLmpwZ0tLzE5VSCxKzsgsS1XIzE1MT1Uw5OUCAFBLAwQUAAAACAAxn+JcMgcrHRgAAAAWAAAABwAAADAwMi5wbmdLS8xOVUgsSs7ILEtVyMxNTE9VMOLlAgBQSwECFAAUAAAACAAxn+Jca7ltHxgAAAAWAAAABwAAAAAAAAAAAAAAAAAAAAAAMDAxLmpwZ1BLAQIUABQAAAAIADGf4lwyBysdGAAAABYAAAAHAAAAAAAAAAAAAAAAAD0AAAAwMDIucG5nUEsFBgAAAAACAAIAagAAAHoAAAAAAA==";

describe("scanMangaRoot", () => {
  it("imports directory and cbz comics, then marks missing local files on rescan", async () => {
    const workspace = path.join(os.tmpdir(), `mangatest-scan-${randomUUID()}`);
    const rootPath = path.join(workspace, "Root");
    const directoryComicPath = path.join(rootPath, "Comic A");
    const dbPath = path.join(workspace, "test.sqlite");

    await mkdir(workspace, { recursive: true });
    await mkdir(directoryComicPath, { recursive: true });
    await writeFile(path.join(directoryComicPath, "001.jpg"), "fake image 1");
    await writeFile(path.join(directoryComicPath, "002.png"), "fake image 2");
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

    const secondScan = await scanMangaRoot(root.id);

    expect(secondScan.addedCount).toBe(0);
    expect(secondScan.missingCount).toBe(0);

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
