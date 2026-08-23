import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";

import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import { inspectPixivDownloaderSchema } from "./schema-inspector";
import { createPixivFixtureDb } from "./pixiv-fixture";

function tempDbPath() {
  return path.join(os.tmpdir(), `pixiv-schema-${randomUUID()}.db`);
}

describe("inspectPixivDownloaderSchema", () => {
  const dbs: Database.Database[] = [];

  afterEach(() => {
    for (const db of dbs.splice(0)) {
      db.close();
    }
  });

  it("accepts a schema compatible with PixivDownloader", () => {
    const db = createPixivFixtureDb(tempDbPath(), {
      artworks: [
        {
          artworkId: 1,
          title: "Sample",
          folder: "{0}/1",
          authorId: 10,
          authorName: "Author",
          tags: [{ name: "R-18" }],
        },
      ],
      pathPrefixes: [{ id: 1, path: "D:\\pixiv" }],
    });
    dbs.push(db);

    const result = inspectPixivDownloaderSchema(db);
    expect(result.ok).toBe(true);
    expect(result.missing).toHaveLength(0);
    expect(result.tableCounts.artworks).toBe(1);
    expect(result.tableCounts.authors).toBe(1);
    expect(result.tableCounts.tags).toBe(1);
    expect(result.tableCounts.artworkTags).toBe(1);
    expect(result.tableCounts.pathPrefixes).toBe(1);
  });

  it("reports missing tables", () => {
    const db = createPixivFixtureDb(tempDbPath(), { omitTables: ["artwork_tags", "path_prefixes"] });
    dbs.push(db);

    const result = inspectPixivDownloaderSchema(db);
    expect(result.ok).toBe(false);
    expect(result.missingTables).toContain("artwork_tags");
    expect(result.missingTables).toContain("path_prefixes");
  });

  it("reports missing required columns", () => {
    const db = createPixivFixtureDb(tempDbPath(), {
      omitColumns: { artworks: ["move_folder", "series_id"], tags: ["translated_name"] },
    });
    dbs.push(db);

    const result = inspectPixivDownloaderSchema(db);
    expect(result.ok).toBe(false);

    const artworkIssue = result.missing.find((issue) => issue.table === "artworks");
    expect(artworkIssue?.missingColumns).toEqual(expect.arrayContaining(["move_folder", "series_id"]));

    const tagIssue = result.missing.find((issue) => issue.table === "tags");
    expect(tagIssue?.missingColumns).toEqual(["translated_name"]);
  });

  it("warns when optional manga_series is absent but still passes", () => {
    const db = createPixivFixtureDb(tempDbPath());
    dbs.push(db);

    const result = inspectPixivDownloaderSchema(db);
    expect(result.ok).toBe(true);
    expect(result.warnings.some((warning) => warning.includes("manga_series"))).toBe(true);
  });
});
