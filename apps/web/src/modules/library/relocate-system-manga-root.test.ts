import { randomUUID } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("relocateSystemMangaRoot", () => {
  afterEach(() => {
    delete process.env.MANGATEST_DB_PATH;
    vi.resetModules();
  });

  it("rejects relocating a user root", async () => {
    vi.resetModules();
    const workspace = path.join(os.tmpdir(), `mangatest-relocate-user-${randomUUID()}`);
    process.env.MANGATEST_DB_PATH = path.join(workspace, "test.sqlite");
    await mkdir(workspace, { recursive: true });

    const { bootstrapDatabase, getDb, mangaRoots } = await import("../core/db");
    const { relocateSystemMangaRoot } = await import("./relocate-system-manga-root");
    bootstrapDatabase();

    const id = randomUUID();
    getDb()
      .insert(mangaRoots)
      .values({
        id,
        absolutePath: path.join(workspace, "user-root"),
        kind: "user",
        scanMode: "children_as_comics",
      })
      .run();

    await expect(
      relocateSystemMangaRoot({
        mangaRootId: id,
        nextAbsolutePath: path.join(workspace, "elsewhere"),
        moveFiles: false,
      }),
    ).rejects.toThrow(/系统/);
  });

  it("moves files and rewrites local_file absolute paths when moveFiles=true", async () => {
    vi.resetModules();
    const workspace = path.join(os.tmpdir(), `mangatest-relocate-move-${randomUUID()}`);
    const oldRoot = path.join(workspace, "old");
    const newRoot = path.join(workspace, "new");
    const comicDir = path.join(oldRoot, "Comic A");
    process.env.MANGATEST_DB_PATH = path.join(workspace, "test.sqlite");

    await mkdir(comicDir, { recursive: true });
    await writeFile(path.join(comicDir, "001.jpg"), "page");

    const { bootstrapDatabase, getDb, comics, localFiles, mangaRoots } = await import("../core/db");
    const { relocateSystemMangaRoot } = await import("./relocate-system-manga-root");
    bootstrapDatabase();
    const db = getDb();
    const rootId = randomUUID();
    const comicId = randomUUID();
    const localFileId = randomUUID();

    db.insert(mangaRoots)
      .values({
        id: rootId,
        absolutePath: oldRoot,
        kind: "system",
        displayName: "系统默认目录",
        scanMode: "children_as_comics",
      })
      .run();
    db.insert(comics)
      .values({
        id: comicId,
        displayTitle: "Comic A",
        fileTitle: "Comic A",
        sortTitle: "comic a",
      })
      .run();
    db.insert(localFiles)
      .values({
        id: localFileId,
        comicId,
        mangaRootId: rootId,
        kind: "directory",
        absolutePath: comicDir,
        relativePath: "Comic A",
        isPrimary: true,
      })
      .run();

    const result = await relocateSystemMangaRoot({
      mangaRootId: rootId,
      nextAbsolutePath: newRoot,
      moveFiles: true,
    });

    expect(result.updatedLocalFileCount).toBe(1);
    expect(result.movedEntryCount).toBeGreaterThanOrEqual(1);
    await expect(readFile(path.join(newRoot, "Comic A", "001.jpg"), "utf8")).resolves.toBe("page");

    const root = db.select().from(mangaRoots).where(eq(mangaRoots.id, rootId)).get();
    expect(root?.absolutePath).toBe(newRoot);

    const file = db.select().from(localFiles).where(eq(localFiles.id, localFileId)).get();
    expect(file?.absolutePath).toBe(path.join(newRoot, "Comic A"));
    expect(file?.relativePath).toBe("Comic A");
    expect(file?.isMissing).toBe(false);
  });

  it("retargets DB paths without moving when moveFiles=false", async () => {
    vi.resetModules();
    const workspace = path.join(os.tmpdir(), `mangatest-relocate-dbonly-${randomUUID()}`);
    const oldRoot = path.join(workspace, "old");
    const newRoot = path.join(workspace, "new");
    const comicDir = path.join(oldRoot, "Comic A");
    process.env.MANGATEST_DB_PATH = path.join(workspace, "test.sqlite");

    await mkdir(comicDir, { recursive: true });
    await writeFile(path.join(comicDir, "001.jpg"), "page");

    const { bootstrapDatabase, getDb, comics, localFiles, mangaRoots } = await import("../core/db");
    const { relocateSystemMangaRoot } = await import("./relocate-system-manga-root");
    bootstrapDatabase();
    const db = getDb();
    const rootId = randomUUID();
    const comicId = randomUUID();
    const localFileId = randomUUID();

    db.insert(mangaRoots)
      .values({
        id: rootId,
        absolutePath: oldRoot,
        kind: "system",
        displayName: "系统默认目录",
        scanMode: "children_as_comics",
      })
      .run();
    db.insert(comics)
      .values({
        id: comicId,
        displayTitle: "Comic A",
        fileTitle: "Comic A",
        sortTitle: "comic a",
      })
      .run();
    db.insert(localFiles)
      .values({
        id: localFileId,
        comicId,
        mangaRootId: rootId,
        kind: "directory",
        absolutePath: comicDir,
        relativePath: "Comic A",
        isPrimary: true,
      })
      .run();

    const result = await relocateSystemMangaRoot({
      mangaRootId: rootId,
      nextAbsolutePath: newRoot,
      moveFiles: false,
    });

    expect(result.movedEntryCount).toBe(0);
    expect(result.updatedLocalFileCount).toBe(1);
    await expect(readFile(path.join(oldRoot, "Comic A", "001.jpg"), "utf8")).resolves.toBe("page");
    await expect(access(path.join(newRoot, "Comic A", "001.jpg"))).rejects.toBeTruthy();

    const root = db.select().from(mangaRoots).where(eq(mangaRoots.id, rootId)).get();
    expect(root?.absolutePath).toBe(newRoot);

    const file = db.select().from(localFiles).where(eq(localFiles.id, localFileId)).get();
    expect(file?.absolutePath).toBe(path.join(newRoot, "Comic A"));
    expect(file?.isMissing).toBe(true);
  });
});
