import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";

import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("collections repository", () => {
  beforeEach(() => {
    if (!process.env.MANGATEST_DB_PATH) {
      process.env.MANGATEST_DB_PATH = path.join(os.tmpdir(), `mangatest-collections-${randomUUID()}.sqlite`);
    }
  });

  afterEach(() => {
    delete process.env.MANGATEST_DB_PATH;
  });

  it("creates a collection, adds readable comics, and lists them in manual order", async () => {
    const sqlite = await bootstrapTestDb();
    const { comicA, comicB } = seedReadableComics(sqlite);
    const { createCollectionRepository } = await import("./index");

    const repository = createCollectionRepository();
    const collection = await repository.create({ name: "我的收藏", kind: "collection" });

    expect(collection.kind).toBe("collection");
    expect(collection.sortMode).toBe("manual");
    expect(collection.comicCount).toBe(0);

    await repository.addComic(collection.id, comicA);
    await repository.addComic(collection.id, comicB);

    const detail = await repository.getDetail(collection.id);
    expect(detail?.comicCount).toBe(2);
    expect(detail?.items.map((item) => item.id)).toEqual([comicA, comicB]);
    expect(detail?.items[0]?.sortOrder).toBe(0);
    expect(detail?.items[1]?.sortOrder).toBe(1);

    // Adding the same comic twice is a no-op.
    await repository.addComic(collection.id, comicA);
    const detailAfterDuplicate = await repository.getDetail(collection.id);
    expect(detailAfterDuplicate?.comicCount).toBe(2);

    // Reorder swaps the manual order.
    await repository.reorder(collection.id, [comicB, comicA]);
    const reordered = await repository.getDetail(collection.id);
    expect(reordered?.items.map((item) => item.id)).toEqual([comicB, comicA]);

    // Remove one comic.
    await repository.removeComic(collection.id, comicA);
    const afterRemove = await repository.getDetail(collection.id);
    expect(afterRemove?.comicCount).toBe(1);
    expect(afterRemove?.items[0]?.id).toBe(comicB);

    // Audit events are recorded.
    const events = await repository.listEvents();
    const operations = events.map((event) => event.operation);
    expect(operations).toContain("collection_create");
    expect(operations).toContain("collection_add_comic");
    expect(operations).toContain("collection_remove_comic");
    expect(operations).toContain("collection_reorder");
  });

  it("rejects adding non-readable comics", async () => {
    const sqlite = await bootstrapTestDb();
    const { comicReadable, comicHidden } = seedReadableComics(sqlite);
    const { createCollectionRepository } = await import("./index");

    const repository = createCollectionRepository();
    const collection = await repository.create({ name: "队列", kind: "queue" });

    await repository.addComic(collection.id, comicReadable);

    await expect(repository.addComic(collection.id, comicHidden)).rejects.toThrow("只能把可读漫画加入收藏夹。");

    const detail = await repository.getDetail(collection.id);
    expect(detail?.comicCount).toBe(1);
  });

  it("updates name, description, sort mode, and enabled flag", async () => {
    const sqlite = await bootstrapTestDb();
    seedReadableComics(sqlite);
    const { createCollectionRepository } = await import("./index");

    const repository = createCollectionRepository();
    const collection = await repository.create({ name: "原名" });

    const updated = await repository.update(collection.id, {
      name: "新名称",
      description: "描述文本",
      sortMode: "title",
      isEnabled: false,
    });

    expect(updated.name).toBe("新名称");
    expect(updated.description).toBe("描述文本");
    expect(updated.sortMode).toBe("title");
    expect(updated.isEnabled).toBe(false);

    const detail = await repository.getDetail(collection.id);
    expect(detail?.name).toBe("新名称");
    expect(detail?.isEnabled).toBe(false);
  });

  it("sorts items by title and recent_added modes", async () => {
    const sqlite = await bootstrapTestDb();
    const { comicA, comicB, comicC } = seedReadableComics(sqlite);
    const { createCollectionRepository } = await import("./index");

    const repository = createCollectionRepository();
    const collection = await repository.create({ name: "排序测试", sortMode: "title" });

    // Add in non-alphabetical order: C, A, B
    await repository.addComic(collection.id, comicC);
    await repository.addComic(collection.id, comicA);
    await repository.addComic(collection.id, comicB);

    const byTitle = await repository.getDetail(collection.id);
    expect(byTitle?.items.map((item) => item.displayTitle)).toEqual(["Alpha Comic", "Beta Comic", "Gamma Comic"]);

    // Switch to recent_added: most recently added first.
    await repository.update(collection.id, { sortMode: "recent_added" });
    const byRecent = await repository.getDetail(collection.id);
    expect(byRecent?.items.map((item) => item.id)).toEqual([comicB, comicA, comicC]);
  });

  it("finds the enabled queue containing a comic", async () => {
    const sqlite = await bootstrapTestDb();
    const { comicA } = seedReadableComics(sqlite);
    const { createCollectionRepository } = await import("./index");

    const repository = createCollectionRepository();
    const queue = await repository.create({ name: "阅读队列", kind: "queue" });
    const collection = await repository.create({ name: "普通收藏", kind: "collection" });

    await repository.addComic(queue.id, comicA);
    await repository.addComic(collection.id, comicA);

    const found = await repository.findQueueContaining(comicA);
    expect(found?.id).toBe(queue.id);
    expect(found?.kind).toBe("queue");

    // Disabled queues are excluded.
    await repository.update(queue.id, { isEnabled: false });
    const foundAfterDisable = await repository.findQueueContaining(comicA);
    expect(foundAfterDisable).toBeNull();
  });

  it("deletes a collection and its memberships", async () => {
    const sqlite = await bootstrapTestDb();
    const { comicA } = seedReadableComics(sqlite);
    const { createCollectionRepository } = await import("./index");

    const repository = createCollectionRepository();
    const collection = await repository.create({ name: "待删除" });
    await repository.addComic(collection.id, comicA);

    await repository.remove(collection.id);

    const detail = await repository.getDetail(collection.id);
    expect(detail).toBeNull();

    const memberships = sqlite
      .prepare("select count(*) as count from collection_comics where collection_id = ?")
      .get(collection.id) as { count: number };
    expect(memberships.count).toBe(0);
  });

  it("resolves queue context with next comic and position", async () => {
    const sqlite = await bootstrapTestDb();
    const { comicA, comicB, comicC } = seedReadableComics(sqlite);
    const { createCollectionRepository } = await import("./index");

    const repository = createCollectionRepository();
    const queue = await repository.create({ name: "阅读队列", kind: "queue" });

    // Add in order: A, B, C
    await repository.addComic(queue.id, comicA);
    await repository.addComic(queue.id, comicB);
    await repository.addComic(queue.id, comicC);

    // First comic: next is B, position 1/3
    const contextFirst = await repository.getQueueContext(comicA);
    expect(contextFirst?.queue.id).toBe(queue.id);
    expect(contextFirst?.position).toBe(1);
    expect(contextFirst?.total).toBe(3);
    expect(contextFirst?.nextComicId).toBe(comicB);
    expect(contextFirst?.nextComicTitle).toBe("Beta Comic");

    // Middle comic: next is C, position 2/3
    const contextMiddle = await repository.getQueueContext(comicB);
    expect(contextMiddle?.position).toBe(2);
    expect(contextMiddle?.nextComicId).toBe(comicC);

    // Last comic: no next, position 3/3
    const contextLast = await repository.getQueueContext(comicC);
    expect(contextLast?.position).toBe(3);
    expect(contextLast?.nextComicId).toBeNull();

    // A comic not in any queue returns null.
    const { comicReadable } = seedReadableComics(sqlite);
    const contextNone = await repository.getQueueContext(comicReadable);
    expect(contextNone).toBeNull();
  });
});

async function bootstrapTestDb(): Promise<Database.Database> {
  process.env.MANGATEST_DB_PATH = path.join(os.tmpdir(), `mangatest-collections-${randomUUID()}.sqlite`);
  const { bootstrapDatabase, getSqlite } = await import("../core/db");
  bootstrapDatabase();
  return getSqlite();
}

function seedReadableComics(sqlite: Database.Database): {
  comicA: string;
  comicB: string;
  comicC: string;
  comicHidden: string;
  comicReadable: string;
} {
  const comicA = randomUUID();
  const comicB = randomUUID();
  const comicC = randomUUID();
  const comicHidden = randomUUID();
  const comicReadable = randomUUID();

  const rootId = randomUUID();
  const localFileA = randomUUID();
  const localFileReadable = randomUUID();

  sqlite
    .prepare("insert into manga_roots (id, absolute_path, display_name, scan_mode, is_enabled) values (?, ?, ?, ?, ?)")
    .run(rootId, path.join(os.tmpdir(), `mangatest-root-${randomUUID()}`), "Test Root", "children_as_comics", 1);

  for (const [id, title, status] of [
    [comicA, "Alpha Comic", "readable"],
    [comicB, "Beta Comic", "readable"],
    [comicC, "Gamma Comic", "readable"],
    [comicHidden, "Hidden Comic", "hidden"],
    [comicReadable, "Readable Comic", "readable"],
  ] as const) {
    const localFileId = id === comicA ? localFileA : id === comicReadable ? localFileReadable : randomUUID();
    sqlite
      .prepare("insert into comics (id, display_title, file_title, sort_title, status, primary_local_file_id) values (?, ?, ?, ?, ?, ?)")
      .run(id, title, title, title.toLowerCase(), status, localFileId);
    sqlite
      .prepare("insert into local_files (id, comic_id, manga_root_id, kind, absolute_path, relative_path) values (?, ?, ?, ?, ?, ?)")
      .run(localFileId, id, rootId, "directory", path.join(os.tmpdir(), id), `${id}`);
    const chapterId = randomUUID();
    sqlite
      .prepare("insert into chapters (id, comic_id, sort_order) values (?, ?, ?)")
      .run(chapterId, id, 0);
  }

  return { comicA, comicB, comicC, comicHidden, comicReadable };
}
