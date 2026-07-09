import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

describe("MangaRootRepository", () => {
  afterEach(() => {
    delete process.env.MANGATEST_DB_PATH;
  });

  it("updates root settings and only deletes unused roots", async () => {
    vi.resetModules();

    const workspace = path.join(os.tmpdir(), `mangatest-roots-${randomUUID()}`);
    const rootPath = path.join(workspace, "Root");
    const usedRootPath = path.join(workspace, "Used Root");
    process.env.MANGATEST_DB_PATH = path.join(workspace, "test.sqlite");

    await mkdir(rootPath, { recursive: true });
    await mkdir(usedRootPath, { recursive: true });

    const { createMangaRootRepository } = await import("./manga-roots.repository");
    const { comics, getDb, localFiles } = await import("../core/db");
    const repository = createMangaRootRepository();

    const root = await repository.create({ absolutePath: rootPath, displayName: "Original" });
    const updated = await repository.updateSettings({
      id: root.id,
      displayName: "Renamed",
      isEnabled: false,
    });
    const listedAfterUpdate = await repository.listWithStats();

    expect(updated.displayName).toBe("Renamed");
    expect(updated.isEnabled).toBe(false);
    expect(listedAfterUpdate[0]).toMatchObject({
      id: root.id,
      displayName: "Renamed",
      isEnabled: false,
      comicCount: 0,
    });

    await expect(repository.deleteUnused(root.id)).resolves.toEqual({ deleted: true });
    await expect(repository.list()).resolves.toHaveLength(0);

    const usedRoot = await repository.create({ absolutePath: usedRootPath, displayName: "Used" });
    const db = getDb();
    const comicId = randomUUID();
    db.insert(comics)
      .values({
        id: comicId,
        displayTitle: "Used Comic",
        fileTitle: "Used Comic",
        sortTitle: "used comic",
      })
      .run();
    db.insert(localFiles)
      .values({
        id: randomUUID(),
        comicId,
        mangaRootId: usedRoot.id,
        kind: "directory",
        absolutePath: path.join(usedRootPath, "Used Comic"),
        relativePath: "Used Comic",
        isPrimary: true,
      })
      .run();

    await expect(repository.deleteUnused(usedRoot.id)).rejects.toThrow("已有入库漫画");
  });
});
