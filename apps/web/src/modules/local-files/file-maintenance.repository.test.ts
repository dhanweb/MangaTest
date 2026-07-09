import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("FileMaintenanceRepository", () => {
  afterEach(() => {
    delete process.env.MANGATEST_DB_PATH;
  });

  it("rechecks missing files and restores records whose paths exist again", async () => {
    vi.resetModules();

    const workspace = path.join(os.tmpdir(), `mangatest-file-maintenance-${randomUUID()}`);
    const rootPath = path.join(workspace, "Root");
    const restoredPath = path.join(rootPath, "Restored.cbz");
    const stillMissingPath = path.join(rootPath, "Still Missing.cbz");
    process.env.MANGATEST_DB_PATH = path.join(workspace, "test.sqlite");

    await mkdir(rootPath, { recursive: true });
    await writeFile(restoredPath, Buffer.from("zip-like fixture"));

    const { bootstrapDatabase, comics, getDb, localFiles, mangaRoots } = await import("../core/db");
    const { createFileMaintenanceRepository } = await import("./file-maintenance.repository");
    bootstrapDatabase();
    const db = getDb();
    const rootId = randomUUID();
    const restoredComicId = randomUUID();
    const missingComicId = randomUUID();
    const restoredLocalFileId = randomUUID();
    const missingLocalFileId = randomUUID();

    db.insert(mangaRoots)
      .values({
        id: rootId,
        absolutePath: rootPath,
        displayName: "Root",
        scanMode: "children_as_comics",
      })
      .run();
    db.insert(comics)
      .values([
        {
          id: restoredComicId,
          displayTitle: "Restored",
          fileTitle: "Restored",
          sortTitle: "restored",
          status: "missing_local_file",
        },
        {
          id: missingComicId,
          displayTitle: "Still Missing",
          fileTitle: "Still Missing",
          sortTitle: "still missing",
          status: "missing_local_file",
        },
      ])
      .run();
    db.insert(localFiles)
      .values([
        {
          id: restoredLocalFileId,
          comicId: restoredComicId,
          mangaRootId: rootId,
          kind: "cbz",
          absolutePath: restoredPath,
          relativePath: "Restored.cbz",
          isMissing: true,
          missingSince: "2026-01-01T00:00:00.000Z",
        },
        {
          id: missingLocalFileId,
          comicId: missingComicId,
          mangaRootId: rootId,
          kind: "cbz",
          absolutePath: stillMissingPath,
          relativePath: "Still Missing.cbz",
          isMissing: true,
          missingSince: "2026-01-01T00:00:00.000Z",
        },
      ])
      .run();

    const result = await createFileMaintenanceRepository().recheckMissingFiles();
    const restoredLocalFile = db
      .select({ isMissing: localFiles.isMissing, missingSince: localFiles.missingSince })
      .from(localFiles)
      .where(eq(localFiles.id, restoredLocalFileId))
      .get();
    const restoredComic = db.select({ status: comics.status }).from(comics).where(eq(comics.id, restoredComicId)).get();
    const issues = await createFileMaintenanceRepository().listIssues();

    expect(result).toEqual({ checkedCount: 2, restoredCount: 1, stillMissingCount: 1 });
    expect(restoredLocalFile).toMatchObject({ isMissing: false, missingSince: null });
    expect(restoredComic).toMatchObject({ status: "readable" });
    expect(issues.map((issue) => issue.id)).toEqual([missingLocalFileId]);
  });
});
