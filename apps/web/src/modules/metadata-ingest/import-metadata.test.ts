import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";

import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("metadata ingest", () => {
  afterEach(() => {
    delete process.env.MANGATEST_DB_PATH;
  });

  it("creates a remote-only comic with source, tags, and redacted resources", async () => {
    vi.resetModules();
    process.env.MANGATEST_DB_PATH = tempDbPath("remote");

    const { comicResources, comicSources, comics, getDb } = await import("../core/db");
    const { importMetadataPayload } = await import("./import-metadata");

    const result = await importMetadataPayload({
      site: "Example.Test",
      sourceId: "example.test/gallery/123",
      sourceUrl: "https://example.test/gallery/123",
      title: "Sample Comic",
      originalTitle: "Sample Original Comic",
      coverUrl: "https://example.test/cover.jpg",
      tags: [
        { namespace: "artist", name: "Sample Artist" },
        { namespace: "artist", name: "sample artist" },
        { namespace: "language", name: "Translated" },
      ],
      resources: [
        { type: "magnet", url: "magnet:?xt=urn:btih:abcdef1234567890&dn=private", label: "Magnet" },
        { type: "http", url: "https://example.test/download/sample.cbz?token=private", label: "CBZ" },
      ],
    });

    const db = getDb();
    const comic = db.select().from(comics).where(eq(comics.id, result.comicId)).get();
    const source = db.select().from(comicSources).where(eq(comicSources.id, result.sourceRecordId)).get();
    const resources = db.select().from(comicResources).where(eq(comicResources.comicId, result.comicId)).all();

    expect(result).toMatchObject({
      comicStatus: "remote_only",
      createdComic: true,
      matchedBy: "created_remote",
      resourceCount: 2,
      tagCount: 2,
    });
    expect(comic?.displayTitle).toBe("Sample Comic");
    expect(source?.site).toBe("example.test");
    expect(resources.map((resource) => resource.redactedResource).join(" ")).not.toContain("private");
  });

  it("matches a single local title without overwriting the user display title", async () => {
    vi.resetModules();
    process.env.MANGATEST_DB_PATH = tempDbPath("local-match");

    const { comics, getDb } = await import("../core/db");
    const { normalizeSortTitle } = await import("../library/title-utils");
    const { checkMetadataSourceStatus, importMetadataPayload } = await import("./import-metadata");
    const comicId = randomUUID();

    await insertReadableComic({
      comicId,
      title: "Sample Comic",
      displayTitle: "My Edited Title",
      sortTitle: normalizeSortTitle("Sample Comic"),
    });

    const status = await checkMetadataSourceStatus({
      site: "example.test",
      sourceId: "example.test/gallery/123",
      sourceUrl: "https://example.test/gallery/123",
      title: "Sample Comic",
    });
    const result = await importMetadataPayload({
      site: "example.test",
      sourceId: "example.test/gallery/123",
      sourceUrl: "https://example.test/gallery/123",
      title: "Sample Comic",
      originalTitle: "Sample Original Comic",
    });
    const row = getDb().select().from(comics).where(eq(comics.id, comicId)).get();

    expect(status.localMatchComicId).toBe(comicId);
    expect(result).toMatchObject({ comicId, createdComic: false, matchedBy: "local_title" });
    expect(row?.displayTitle).toBe("My Edited Title");
    expect(row?.originalTitle).toBe("Sample Original Comic");
  });

  it("updates the same source without creating another comic", async () => {
    vi.resetModules();
    process.env.MANGATEST_DB_PATH = tempDbPath("duplicate-source");

    const { importMetadataPayload } = await import("./import-metadata");

    const first = await importMetadataPayload({
      site: "example.test",
      sourceId: "example.test/gallery/456",
      sourceUrl: "https://example.test/gallery/456",
      title: "Duplicate Source Comic",
      resources: [{ type: "http", url: "https://example.test/download/first.cbz", label: "First CBZ" }],
    });
    const second = await importMetadataPayload({
      site: "Example.Test",
      sourceId: "example.test/gallery/456",
      sourceUrl: "https://example.test/gallery/456?ref=updated",
      title: "Duplicate Source Comic Updated",
      resources: [{ type: "http", url: "https://example.test/download/first.cbz", label: "Updated CBZ" }],
    });

    expect(first.comicId).toBe(second.comicId);
    expect(first.sourceRecordId).toBe(second.sourceRecordId);
    expect(second).toMatchObject({ createdComic: false, matchedBy: "source", resourceCount: 1 });
  });

  it("uses an explicit comic target when the popup provides comicId", async () => {
    vi.resetModules();
    process.env.MANGATEST_DB_PATH = tempDbPath("explicit-target");

    const { importMetadataPayload } = await import("./import-metadata");
    const comicId = randomUUID();

    await insertReadableComic({ comicId, title: "Explicit Local Comic", displayTitle: "Explicit Local Comic" });

    const result = await importMetadataPayload({
      comicId,
      site: "example.test",
      sourceId: "example.test/gallery/789",
      sourceUrl: "https://example.test/gallery/789",
      title: "Remote Title",
    });

    expect(result).toMatchObject({ comicId, createdComic: false, matchedBy: "comic_id" });
  });
});

function tempDbPath(name: string) {
  return path.join(os.tmpdir(), `mangatest-metadata-${name}-${randomUUID()}.sqlite`);
}

async function insertReadableComic(input: { comicId: string; title: string; displayTitle: string; sortTitle?: string }) {
  const { bootstrapDatabase, comics, getDb, localFiles, mangaRoots } = await import("../core/db");
  const { normalizeSortTitle } = await import("../library/title-utils");
  const mangaRootId = randomUUID();
  const localFileId = randomUUID();

  bootstrapDatabase();

  getDb()
    .insert(mangaRoots)
    .values({
      id: mangaRootId,
      absolutePath: path.join(os.tmpdir(), `mangatest-root-${randomUUID()}`),
      displayName: "Test Root",
    })
    .run();
  getDb()
    .insert(comics)
    .values({
      id: input.comicId,
      displayTitle: input.displayTitle,
      fileTitle: input.title,
      sortTitle: input.sortTitle ?? normalizeSortTitle(input.title),
      status: "readable",
      primaryLocalFileId: localFileId,
    })
    .run();
  getDb()
    .insert(localFiles)
    .values({
      id: localFileId,
      comicId: input.comicId,
      mangaRootId,
      kind: "directory",
      absolutePath: path.join(os.tmpdir(), `mangatest-root-${randomUUID()}`, input.title),
      relativePath: input.title,
      isPrimary: true,
      isMissing: false,
    })
    .run();
}
