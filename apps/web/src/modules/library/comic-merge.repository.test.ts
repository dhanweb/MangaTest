import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

describe("ComicMergeRepository batch merge", () => {
  afterEach(() => {
    delete process.env.MANGATEST_DB_PATH;
    vi.resetModules();
  });

  it("merges multiple single-chapter comics in order and restores them independently", async () => {
    const workspace = path.join(os.tmpdir(), `mangatest-comic-merge-${randomUUID()}`);
    process.env.MANGATEST_DB_PATH = path.join(workspace, "test.sqlite");

    const { bootstrapDatabase, chapters, comics, getDb, operationLogs } = await import("../core/db");
    bootstrapDatabase();
    const db = getDb();
    const now = new Date().toISOString();
    const targetId = randomUUID();
    const sourceAId = randomUUID();
    const sourceBId = randomUUID();

    db.insert(comics).values([
      { id: targetId, displayTitle: "Target", fileTitle: "Target", sortTitle: "target", status: "readable", createdAt: now, updatedAt: now },
      { id: sourceAId, displayTitle: "Source A", fileTitle: "Source A", sortTitle: "source a", status: "readable", createdAt: now, updatedAt: now },
      { id: sourceBId, displayTitle: "Source B", fileTitle: "Source B", sortTitle: "source b", status: "readable", createdAt: now, updatedAt: now },
    ]).run();

    const targetChapterId = randomUUID();
    const sourceAChapterId = randomUUID();
    const sourceBChapterId = randomUUID();
    db.insert(chapters).values([
      { id: targetChapterId, comicId: targetId, title: "Target chapter", sortOrder: 0, pageCount: 1, createdAt: now, updatedAt: now },
      { id: sourceAChapterId, comicId: sourceAId, title: "A chapter", sortOrder: 0, pageCount: 2, createdAt: now, updatedAt: now },
      { id: sourceBChapterId, comicId: sourceBId, title: "B chapter", sortOrder: 0, pageCount: 3, createdAt: now, updatedAt: now },
    ]).run();

    const repository = (await import("./comic-merge.repository")).createComicMergeRepository();
    const results = await repository.mergeAsChapters([sourceAId, sourceBId], targetId);

    expect(results.map((result) => result.sourceComicId)).toEqual([sourceAId, sourceBId]);
    expect(results.every((result) => result.physicalFilesTouched === false)).toBe(true);
    expect(
      db
        .select({ id: chapters.id, comicId: chapters.comicId, sortOrder: chapters.sortOrder })
        .from(chapters)
        .all()
        .filter((chapter) => chapter.comicId === targetId)
        .sort((left, right) => left.sortOrder - right.sortOrder),
    ).toEqual([
      { id: targetChapterId, comicId: targetId, sortOrder: 0 },
      { id: sourceAChapterId, comicId: targetId, sortOrder: 1 },
      { id: sourceBChapterId, comicId: targetId, sortOrder: 2 },
    ]);
    expect(db.select({ id: comics.id, status: comics.status, parentComicId: comics.parentComicId }).from(comics).all().filter((comic) => comic.id === sourceAId || comic.id === sourceBId)).toEqual([
      { id: sourceAId, status: "hidden", parentComicId: targetId },
      { id: sourceBId, status: "hidden", parentComicId: targetId },
    ]);
    expect(db.select({ id: operationLogs.id }).from(operationLogs).all()).toHaveLength(2);

    await repository.restoreMergedComic(sourceAId);
    await repository.restoreMergedComic(sourceBId);
    expect(db.select({ comicId: chapters.comicId, id: chapters.id }).from(chapters).all().filter((chapter) => chapter.comicId === targetId)).toEqual([{ comicId: targetId, id: targetChapterId }]);
  });
});
