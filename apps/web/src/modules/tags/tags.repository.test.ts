import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

describe("TagRepository", () => {
  afterEach(() => {
    delete process.env.MANGATEST_DB_PATH;
  });

  it("updates tags, deletes unused tags, and rejects deleting bound tags", async () => {
    vi.resetModules();
    process.env.MANGATEST_DB_PATH = path.join(os.tmpdir(), `mangatest-tags-${randomUUID()}.sqlite`);

    const { comicTags, comics, getDb } = await import("../core/db");
    const { createTagRepository } = await import("./tags.repository");
    const repository = createTagRepository();

    const tag = await repository.create({
      namespace: "artist",
      name: "Sample Artist",
      displayNameZh: "示例作者",
    });
    const updated = await repository.update(tag.id, {
      namespace: "group",
      name: "Sample Group",
      displayNameZh: "示例社团",
    });

    expect(updated).toMatchObject({
      id: tag.id,
      canonical: "group:sample group",
      displayNameZh: "示例社团",
    });

    const unused = await repository.create({ namespace: "female", name: "sole female" });
    await expect(repository.deleteUnused(unused.id)).resolves.toEqual({ deleted: true });

    const comicId = randomUUID();
    getDb()
      .insert(comics)
      .values({
        id: comicId,
        displayTitle: "Tagged Comic",
        fileTitle: "Tagged Comic",
        sortTitle: "tagged comic",
      })
      .run();
    getDb()
      .insert(comicTags)
      .values({
        comicId,
        tagId: tag.id,
        source: "manual",
        isUserEdited: true,
      })
      .run();

    await expect(repository.deleteUnused(tag.id)).rejects.toThrow("已经绑定");
  });
});
