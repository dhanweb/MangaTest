import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

describe("ComicRepository pagination", () => {
  afterEach(() => {
    delete process.env.MANGATEST_DB_PATH;
    vi.resetModules();
  });

  it("returns numbered pages and clamps invalid or out-of-range requests", async () => {
    vi.resetModules();
    const workspace = path.join(os.tmpdir(), `mangatest-comic-pagination-${randomUUID()}`);
    process.env.MANGATEST_DB_PATH = path.join(workspace, "test.sqlite");

    const { bootstrapDatabase, comicTags, comics, getDb, localFiles, tags } = await import("../core/db");
    bootstrapDatabase();
    const db = getDb();
    let firstComicId = "";

    for (let index = 0; index < 13; index += 1) {
      const comicId = randomUUID();
      if (index === 0) firstComicId = comicId;
      const localFileId = randomUUID();
      db.insert(comics)
        .values({
          id: comicId,
          displayTitle: `Comic ${index}`,
          fileTitle: `Comic ${index}`,
          sortTitle: `comic ${index}`,
          primaryLocalFileId: localFileId,
        })
        .run();
      db.insert(localFiles)
        .values({
          id: localFileId,
          comicId,
          kind: "directory",
          absolutePath: path.join(workspace, `Comic-${index}`),
          relativePath: `Comic-${index}`,
          isPrimary: true,
        })
        .run();
    }

    const artistTagId = randomUUID();
    const groupTagId = randomUUID();
    const categoryTagId = randomUUID();
    db.insert(tags).values([
      { id: artistTagId, namespace: "artist", name: "alice", canonical: "artist:alice", displayNameZh: "爱丽丝" },
      { id: groupTagId, namespace: "group", name: "circle", canonical: "group:circle" },
      { id: categoryTagId, namespace: "category", name: "action", canonical: "category:action" },
    ]).run();
    db.insert(comicTags).values([
      { comicId: firstComicId, tagId: artistTagId, source: "metadata" },
      { comicId: firstComicId, tagId: groupTagId, source: "metadata" },
      { comicId: firstComicId, tagId: categoryTagId, source: "manual" },
    ]).run();

    const { createComicRepository } = await import("./comics.repository");
    const repository = createComicRepository();
    const secondPage = await repository.searchReadableCards({ page: 2, pageSize: 12 });
    const overflowPage = await repository.searchReadableCards({ page: 99, pageSize: 12 });
    const invalidPage = await repository.searchReadableCards({ page: Number.NaN, pageSize: 12 });

    expect(secondPage).toMatchObject({ page: 2, pageSize: 12, total: 13 });
    expect(secondPage.items).toHaveLength(1);
    expect(overflowPage).toMatchObject({ page: 2, total: 13 });
    expect(overflowPage.items).toHaveLength(1);
    expect(invalidPage.page).toBe(1);

    const authorCard = (await repository.searchReadableCards({ pageSize: 96 })).items.find((item) => item.id === firstComicId);
    expect(authorCard?.authorNames).toEqual(["爱丽丝", "circle"]);
    expect((await repository.getDetail(firstComicId))?.tags.map((tag) => tag.canonical)).toEqual([
      "artist:alice",
      "category:action",
      "group:circle",
    ]);
  });

  it("returns a bounded reader manifest and cross-chapter page windows", async () => {
    vi.resetModules();
    const workspace = path.join(os.tmpdir(), "mangatest-reader-window-" + randomUUID());
    process.env.MANGATEST_DB_PATH = path.join(workspace, "test.sqlite");

    const { bootstrapDatabase, chapters, comics, getDb, localFiles, pages } = await import("../core/db");
    bootstrapDatabase();
    const db = getDb();
    const comicId = randomUUID();
    const localFileId = randomUUID();
    const firstChapterId = randomUUID();
    const secondChapterId = randomUUID();

    db.insert(comics)
      .values({
        id: comicId,
        displayTitle: "Reader window comic",
        fileTitle: "Reader window comic",
        sortTitle: "reader window comic",
        primaryLocalFileId: localFileId,
      })
      .run();
    db.insert(localFiles)
      .values({
        id: localFileId,
        comicId,
        kind: "directory",
        absolutePath: path.join(workspace, "Reader window comic"),
        relativePath: "Reader window comic",
        isPrimary: true,
      })
      .run();
    db.insert(chapters)
      .values([
        { id: firstChapterId, comicId, title: "第一集", sortOrder: 0, pageCount: 2 },
        { id: secondChapterId, comicId, title: "第二集", sortOrder: 1, pageCount: 3 },
      ])
      .run();
    db.insert(pages)
      .values([
        ...Array.from({ length: 2 }, (_, index) => ({
          id: randomUUID(),
          chapterId: firstChapterId,
          localFileId,
          pageNumber: index + 1,
          sourceKind: "filesystem" as const,
          internalPath: "chapter-1/page-" + String(index + 1) + ".jpg",
          width: 100,
          height: 150,
        })),
        ...Array.from({ length: 3 }, (_, index) => ({
          id: randomUUID(),
          chapterId: secondChapterId,
          localFileId,
          pageNumber: index + 1,
          sourceKind: "filesystem" as const,
          internalPath: "chapter-2/page-" + String(index + 1) + ".jpg",
          width: 100,
          height: 150,
        })),
      ])
      .run();

    const { createComicRepository } = await import("./comics.repository");
    const repository = createComicRepository();
    const manifest = await repository.getReaderManifest(comicId);

    expect(manifest).toMatchObject({
      id: comicId,
      totalPages: 5,
      initialStartIndex: 0,
      lastReadPageIndex: null,
    });
    expect(manifest?.chapters.map((chapter) => chapter.startIndex)).toEqual([0, 2]);
    expect(manifest?.initialPages).toHaveLength(5);

    const window = await repository.getReaderPageWindow(comicId, 1, 3);
    expect(window?.pages).toHaveLength(3);
    expect(window?.pages.map((page) => page.chapterTitle)).toEqual(["第一集", "第二集", "第二集"]);
    expect(window?.pages.map((page) => page.pageNumber)).toEqual([2, 1, 2]);

    expect((await repository.getReaderPageWindow(comicId, 99, 48))?.pages).toEqual([]);
    expect(await repository.getReaderPageWindow(randomUUID(), 0, 48)).toBeNull();
  });
});
