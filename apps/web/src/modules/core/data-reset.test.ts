import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

describe("resetApplicationData", () => {
  afterEach(() => {
    delete process.env.MANGATEST_DB_PATH;
    vi.resetModules();
  });

  it("clears selected library/download/cache data while preserving settings and manga roots", async () => {
    vi.resetModules();
    const workspace = path.join(os.tmpdir(), `mangatest-data-reset-${randomUUID()}`);
    const cacheDir = path.join(workspace, "cache");
    const mangaRootPath = path.join(workspace, "Root");
    process.env.MANGATEST_DB_PATH = path.join(workspace, "test.sqlite");

    await mkdir(path.join(mangaRootPath, "Comic A"), { recursive: true });
    await mkdir(path.join(cacheDir, "covers"), { recursive: true });
    const cacheFile = path.join(cacheDir, "covers", "cover.webp");
    await writeFile(cacheFile, Buffer.from("fake-cover"));

    const { bootstrapDatabase, getDb, comics, localFiles, mangaRoots, downloadTasks, mediaAssets, settings } = await import("./db");
    bootstrapDatabase();
    const { saveRuntimeSettings, getRuntimeSettings } = await import("./settings");
    const { resetApplicationData, getDataResetSummary } = await import("./data-reset");

    const db = getDb();
    const now = new Date().toISOString();
    const rootId = randomUUID();
    const comicId = randomUUID();
    const localFileId = randomUUID();
    const assetId = randomUUID();
    const taskId = randomUUID();

    db.insert(mangaRoots)
      .values({
        id: rootId,
        absolutePath: mangaRootPath,
        displayName: "Test Root",
        kind: "user",
        isEnabled: true,
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
        absolutePath: path.join(mangaRootPath, "Comic A"),
        relativePath: "Comic A",
        isPrimary: true,
      })
      .run();

    db.insert(mediaAssets)
      .values({
        id: assetId,
        comicId,
        use: "cover",
        cacheKey: "cover:test",
        width: 100,
        height: 100,
        filePath: cacheFile,
        sizeBytes: 10,
      })
      .run();

    db.insert(downloadTasks)
      .values({
        id: taskId,
        provider: "openlist",
        status: "queued",
        taskType: "transfer",
      })
      .run();

    await saveRuntimeSettings({
      cacheDirectory: cacheDir,
      openlistBaseUrl: "http://127.0.0.1:5244",
      metadataImportToken: "secret-token",
    });

    const before = await getDataResetSummary();
    expect(before.comics).toBe(1);
    expect(before.downloadTasks).toBe(1);
    expect(before.mediaAssets).toBe(1);
    expect(before.settings).toBeGreaterThan(0);
    expect(before.mangaRoots).toBeGreaterThanOrEqual(1);

    const result = await resetApplicationData({
      clearCache: true,
      clearLibrary: true,
      clearDownloads: true,
    });

    expect(result.deleted.comics).toBe(1);
    expect(result.deleted.downloadTasks).toBe(1);
    expect(result.deleted.mediaAssets).toBe(1);
    expect(result.summaryAfter.comics).toBe(0);
    expect(result.summaryAfter.localFiles).toBe(0);
    expect(result.summaryAfter.downloadTasks).toBe(0);
    expect(result.summaryAfter.mediaAssets).toBe(0);
    expect(result.summaryAfter.mangaRoots).toBeGreaterThanOrEqual(1);

    const runtime = await getRuntimeSettings();
    expect(runtime.openlistBaseUrl).toContain("127.0.0.1:5244");
    expect(runtime.metadataImportToken).toBe("secret-token");

    const remainingRoots = db.select().from(mangaRoots).all();
    expect(remainingRoots.some((row) => row.id === rootId || row.absolutePath === mangaRootPath)).toBe(true);

    const remainingSettings = db.select().from(settings).all();
    expect(remainingSettings.length).toBeGreaterThan(0);
  });

  it("can clear only download tasks", async () => {
    vi.resetModules();
    const workspace = path.join(os.tmpdir(), `mangatest-data-reset-downloads-${randomUUID()}`);
    process.env.MANGATEST_DB_PATH = path.join(workspace, "test.sqlite");
    await mkdir(workspace, { recursive: true });

    const { bootstrapDatabase, getDb, comics, downloadTasks } = await import("./db");
    bootstrapDatabase();
    const { resetApplicationData } = await import("./data-reset");

    const db = getDb();
    const comicId = randomUUID();
    db.insert(comics)
      .values({
        id: comicId,
        displayTitle: "Keep Me",
        fileTitle: "Keep Me",
        sortTitle: "keep me",
      })
      .run();
    db.insert(downloadTasks)
      .values({
        id: randomUUID(),
        provider: "aria2",
        status: "queued",
        taskType: "offline",
      })
      .run();

    await resetApplicationData({
      clearCache: false,
      clearLibrary: false,
      clearDownloads: true,
    });

    expect(db.select().from(downloadTasks).all()).toHaveLength(0);
    expect(db.select().from(comics).all()).toHaveLength(1);
  });
});
