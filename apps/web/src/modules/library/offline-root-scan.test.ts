import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("offline manga root scan", () => {
  afterEach(() => {
    delete process.env.MANGATEST_DB_PATH;
    delete process.env.MANGATEST_PATH_PROFILE;
  });

  it("fails before reconciliation and preserves existing readable files", async () => {
    vi.resetModules();

    const workspace = path.join(os.tmpdir(), `mangatest-offline-root-${randomUUID()}`);
    const dbPath = path.join(workspace, "test.sqlite");
    const missingRootPath = path.join(workspace, "not-mounted");
    process.env.MANGATEST_DB_PATH = dbPath;

    const { bootstrapDatabase, comics, getDb, getSqlite, localFiles } = await import("../core/db");
    const { createMangaRootRepository } = await import("./manga-roots.repository");
    const { scanMangaRoot } = await import("./scan-library-root");
    bootstrapDatabase();
    const root = await createMangaRootRepository().create({ absolutePath: missingRootPath, displayName: "Offline" });
    const comicId = randomUUID();
    const localFileId = randomUUID();
    getDb().insert(comics).values({
      id: comicId,
      displayTitle: "Offline Comic",
      fileTitle: "Offline Comic",
      sortTitle: "offline comic",
      status: "readable",
      primaryLocalFileId: localFileId,
    }).run();
    getDb().insert(localFiles).values({
      id: localFileId,
      comicId,
      mangaRootId: root.id,
      kind: "directory",
      absolutePath: path.join(missingRootPath, "Offline Comic"),
      relativePath: "Offline Comic",
      isMissing: false,
      isPrimary: true,
    }).run();

    await expect(scanMangaRoot(root.id)).rejects.toThrow(/不存在|未挂载|不可用/);

    const localFile = getDb().select({ isMissing: localFiles.isMissing }).from(localFiles).where(eq(localFiles.id, localFileId)).get();
    const comic = getDb().select({ status: comics.status }).from(comics).where(eq(comics.id, comicId)).get();
    expect(localFile?.isMissing).toBe(false);
    expect(comic?.status).toBe("readable");

    getSqlite().close();
    await rm(workspace, { recursive: true, force: true });
  });
});
