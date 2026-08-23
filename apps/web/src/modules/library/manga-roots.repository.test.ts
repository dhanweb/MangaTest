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
    expect(listedAfterUpdate.find((item) => item.id === root.id)).toMatchObject({
      id: root.id,
      displayName: "Renamed",
      isEnabled: false,
      comicCount: 0,
    });

    await expect(repository.deleteUnused(root.id)).resolves.toEqual({ deleted: true });
    const remainingAfterDelete = await repository.list();
    expect(remainingAfterDelete.some((item) => item.id === root.id)).toBe(false);
    // bootstrap may keep the built-in system root
    expect(remainingAfterDelete.every((item) => item.kind === "system" || item.id !== root.id)).toBe(true);

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

  it("registers Pixiv roots idempotently and protects them from ordinary path management", async () => {
    vi.resetModules();

    const workspace = path.join(os.tmpdir(), `mangatest-pixiv-root-${randomUUID()}`);
    const rootPath = path.join(workspace, "Pixiv");
    process.env.MANGATEST_DB_PATH = path.join(workspace, "test.sqlite");

    await mkdir(rootPath, { recursive: true });

    const { createMangaRootRepository } = await import("./manga-roots.repository");
    const repository = createMangaRootRepository();
    const existing = await repository.create({ absolutePath: rootPath, displayName: "旧路径" });

    const managed = await repository.ensureManaged({
      absolutePath: rootPath,
      displayName: "PixivDownloader 下载目录",
      kind: "pixiv",
    });
    const repeated = await repository.ensureManaged({
      absolutePath: rootPath,
      displayName: "PixivDownloader 下载目录",
      kind: "pixiv",
    });

    expect(managed).toMatchObject({ id: existing.id, kind: "pixiv", isEnabled: true });
    expect(repeated.id).toBe(managed.id);
    await expect(repository.updateSettings({ id: managed.id, displayName: "改名", isEnabled: false })).rejects.toThrow(
      "只能在 Pixiv 同步菜单中修改",
    );
    await expect(repository.deleteUnused(managed.id)).rejects.toThrow("只能在 Pixiv 同步菜单中删除");
  });
});
