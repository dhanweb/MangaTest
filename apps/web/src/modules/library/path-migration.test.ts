import { randomUUID } from "node:crypto";
import { access, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("path migration", () => {
  afterEach(() => {
    delete process.env.MANGATEST_DB_PATH;
    delete process.env.MANGATEST_PATH_PROFILE;
  });

  it("suggests a WSL path for a Windows drive without writing during preview", async () => {
    vi.resetModules();

    const workspace = path.join(os.tmpdir(), `mangatest-path-preview-${randomUUID()}`);
    const sourcePath = path.join(workspace, "source");
    const targetPath = path.join(workspace, "target");
    process.env.MANGATEST_DB_PATH = path.join(workspace, "test.sqlite");
    process.env.MANGATEST_PATH_PROFILE = "windows";
    await mkdir(sourcePath, { recursive: true });

    const { createMangaRootRepository } = await import("./manga-roots.repository");
    const { getDb, mangaRoots } = await import("../core/db");
    const { previewPathMigration, suggestTargetPath } = await import("./path-migration");
    const root = await createMangaRootRepository().create({ absolutePath: sourcePath, displayName: "Source" });
    const before = getDb().select({ absolutePath: mangaRoots.absolutePath }).from(mangaRoots).where(eq(mangaRoots.id, root.id)).get();

    expect(suggestTargetPath("D:\\hentai\\manga", "windows", "wsl")).toBe("/mnt/d/hentai/manga");
    const report = await previewPathMigration({
      targetProfile: "windows",
      rootMappings: [{ rootId: root.id, targetPath }],
    });

    expect(report.sourceProfile).toBe("windows");
    expect(report.roots.find((item) => item.rootId === root.id)).toMatchObject({
      sourcePath,
      targetPath,
      status: "offline",
    });
    expect(before?.absolutePath).toBe(sourcePath);
  });

  it("applies a verified mapping after backup and preserves business IDs", async () => {
    vi.resetModules();

    const workspace = path.join(os.tmpdir(), `mangatest-path-apply-${randomUUID()}`);
    const sourcePath = path.join(workspace, "source");
    const targetPath = path.join(workspace, "target");
    const comicPath = path.join(sourcePath, "Comic A");
    process.env.MANGATEST_DB_PATH = path.join(workspace, "test.sqlite");
    process.env.MANGATEST_PATH_PROFILE = "windows";
    await mkdir(comicPath, { recursive: true });
    await mkdir(targetPath, { recursive: true });

    const { createMangaRootRepository } = await import("./manga-roots.repository");
    const { applyPathMigration, previewPathMigration } = await import("./path-migration");
    const { bootstrapDatabase, chapters, comics, getDb, getSqlite, localFiles, mangaRoots, pages, readingProgress } = await import("../core/db");
    bootstrapDatabase();
    const root = await createMangaRootRepository().create({ absolutePath: sourcePath, displayName: "Source" });
    const db = getDb();
    const comicId = randomUUID();
    const localFileId = randomUUID();
    const chapterId = randomUUID();
    const pageId = randomUUID();
    const progressId = randomUUID();
    db.insert(comics).values({
      id: comicId,
      displayTitle: "Comic A",
      fileTitle: "Comic A",
      sortTitle: "comic a",
      status: "readable",
      primaryLocalFileId: localFileId,
    }).run();
    db.insert(localFiles).values({
      id: localFileId,
      comicId,
      mangaRootId: root.id,
      kind: "directory",
      absolutePath: comicPath,
      relativePath: "Comic A",
      isPrimary: true,
    }).run();
    db.insert(chapters).values({ id: chapterId, comicId, localFileId, pageCount: 1 }).run();
    db.insert(pages).values({
      id: pageId,
      chapterId,
      localFileId,
      pageNumber: 1,
      sourceKind: "filesystem",
      internalPath: "001.jpg",
    }).run();
    db.insert(readingProgress).values({
      id: progressId,
      comicId,
      chapterId,
      pageId,
      pageNumber: 1,
      progressPercent: 50,
    }).run();

    const input = { targetProfile: "windows" as const, rootMappings: [{ rootId: root.id, targetPath }] };
    const preview = await previewPathMigration(input);
    expect(preview.canApply).toBe(true);
    const result = await applyPathMigration({ ...input, fingerprint: preview.fingerprint, confirmBackup: true });

    expect(result.updatedRootCount).toBe(2);
    expect(result.updatedLocalFileCount).toBe(1);
    await expect(access(result.backupPath)).resolves.toBeUndefined();
    expect(db.select({ absolutePath: mangaRoots.absolutePath }).from(mangaRoots).where(eq(mangaRoots.id, root.id)).get()?.absolutePath).toBe(targetPath);
    expect(db.select({ id: comics.id }).from(comics).where(eq(comics.id, comicId)).get()?.id).toBe(comicId);
    expect(db.select({ id: chapters.id }).from(chapters).where(eq(chapters.id, chapterId)).get()?.id).toBe(chapterId);
    expect(db.select({ id: pages.id }).from(pages).where(eq(pages.id, pageId)).get()?.id).toBe(pageId);
    expect(db.select({ id: readingProgress.id }).from(readingProgress).where(eq(readingProgress.id, progressId)).get()?.id).toBe(progressId);
    expect(db.select({ absolutePath: localFiles.absolutePath }).from(localFiles).where(eq(localFiles.id, localFileId)).get()?.absolutePath).toBe(
      path.join(targetPath, "Comic A"),
    );

    getSqlite().close();
    await rm(workspace, { recursive: true, force: true });
  });

  it("blocks active transfers and rejects stale previews", async () => {
    vi.resetModules();

    const workspace = path.join(os.tmpdir(), `mangatest-path-blockers-${randomUUID()}`);
    const sourcePath = path.join(workspace, "source");
    const targetPath = path.join(workspace, "target");
    process.env.MANGATEST_DB_PATH = path.join(workspace, "test.sqlite");
    process.env.MANGATEST_PATH_PROFILE = "windows";
    await mkdir(sourcePath, { recursive: true });
    await mkdir(targetPath, { recursive: true });

    const { createMangaRootRepository } = await import("./manga-roots.repository");
    const { applyPathMigration, previewPathMigration } = await import("./path-migration");
    const { bootstrapDatabase, downloadTaskTransfers, downloadTasks, getDb } = await import("../core/db");
    bootstrapDatabase();
    const root = await createMangaRootRepository().create({ absolutePath: sourcePath, displayName: "Source" });
    const db = getDb();
    const taskId = randomUUID();
    db.insert(downloadTasks).values({ id: taskId, provider: "test", status: "running", taskType: "transfer" }).run();
    db.insert(downloadTaskTransfers).values({
      id: randomUUID(),
      downloadTaskId: taskId,
      provider: "test",
      status: "running",
      startedAt: new Date().toISOString(),
    }).run();

    const input = { targetProfile: "windows" as const, rootMappings: [{ rootId: root.id, targetPath }] };
    const blocked = await previewPathMigration(input);
    expect(blocked.canApply).toBe(false);
    expect(blocked.blockers.some((blocker) => blocker.code === "active_transfer")).toBe(true);
    await expect(applyPathMigration({ ...input, fingerprint: blocked.fingerprint, confirmBackup: true })).rejects.toMatchObject({ code: "blocked" });

    db.delete(downloadTaskTransfers).run();
    const fresh = await previewPathMigration(input);
    const changedInput = { targetProfile: "windows" as const, rootMappings: [{ rootId: root.id, targetPath: path.join(workspace, "other") }] };
    await expect(applyPathMigration({ ...changedInput, fingerprint: fresh.fingerprint, confirmBackup: true })).rejects.toMatchObject({ code: "stale_report" });
  });

  it("uses a foreign-runtime location when previewing on the destination runtime", async () => {
    vi.resetModules();

    const workspace = path.join(os.tmpdir(), `mangatest-path-destination-${randomUUID()}`);
    process.env.MANGATEST_DB_PATH = path.join(workspace, "test.sqlite");
    process.env.MANGATEST_PATH_PROFILE = "wsl";
    await mkdir(workspace, { recursive: true });

    const { bootstrapDatabase, getDb, getSqlite, mangaRootLocations, mangaRoots } = await import("../core/db");
    const { previewPathMigration } = await import("./path-migration");
    bootstrapDatabase();
    getDb().delete(mangaRoots).run();

    const rootId = randomUUID();
    getDb().insert(mangaRoots).values({
      id: rootId,
      absolutePath: "D:\\hentai\\manga",
      displayName: "Windows source",
      scanMode: "children_as_comics",
    }).run();
    getDb().insert(mangaRootLocations).values({
      id: randomUUID(),
      mangaRootId: rootId,
      runtimeProfile: "windows",
      absolutePath: "D:\\hentai\\manga",
      verificationStatus: "available",
    }).run();

    const report = await previewPathMigration({
      targetProfile: "wsl",
      rootMappings: [{ rootId, targetPath: "/mnt/d/hentai/manga" }],
    });

    expect(report.sourceProfile).toBe("windows");
    expect(report.roots).toMatchObject([{ sourcePath: "D:\\hentai\\manga", suggestedTargetPath: "/mnt/d/hentai/manga" }]);
    expect(report.canApply).toBe(false);

    getSqlite().close();
  });

  it("rolls back all path updates when a local-file identity is invalid", async () => {
    vi.resetModules();

    const workspace = path.join(os.tmpdir(), `mangatest-path-rollback-${randomUUID()}`);
    const sourcePath = path.join(workspace, "source");
    const targetPath = path.join(workspace, "target");
    process.env.MANGATEST_DB_PATH = path.join(workspace, "test.sqlite");
    process.env.MANGATEST_PATH_PROFILE = "windows";
    await mkdir(sourcePath, { recursive: true });
    await mkdir(targetPath, { recursive: true });

    const { createMangaRootRepository } = await import("./manga-roots.repository");
    const { applyPathMigration, previewPathMigration } = await import("./path-migration");
    const { bootstrapDatabase, getDb, getSqlite, localFiles, mangaRoots } = await import("../core/db");
    bootstrapDatabase();
    const root = await createMangaRootRepository().create({ absolutePath: sourcePath, displayName: "Rollback" });
    getDb().insert(localFiles).values({
      id: randomUUID(),
      mangaRootId: root.id,
      kind: "directory",
      absolutePath: path.join(sourcePath, "Comic"),
      relativePath: "../outside",
      isMissing: false,
    }).run();

    const input = { targetProfile: "windows" as const, rootMappings: [{ rootId: root.id, targetPath }] };
    const report = await previewPathMigration(input);
    await expect(applyPathMigration(
      { ...input, fingerprint: report.fingerprint, confirmBackup: true },
      { createBackup: async () => ({ path: "backup.sqlite", filename: "backup.sqlite", sizeBytes: 0 }) },
    )).rejects.toMatchObject({ code: "invariant_mismatch" });

    expect(getDb().select({ absolutePath: mangaRoots.absolutePath }).from(mangaRoots).get()?.absolutePath).toBe(sourcePath);
    expect(getDb().select({ absolutePath: localFiles.absolutePath }).from(localFiles).get()?.absolutePath).toBe(path.join(sourcePath, "Comic"));
    getSqlite().close();
  });
});
