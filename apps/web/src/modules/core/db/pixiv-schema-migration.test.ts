import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";

import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * 既有数据库兼容性：老库没有 display_title_source 列和 metadata_sync 表。
 * bootstrapDatabase 必须原地迁移并回填标题来源，而不是只对新建库生效。
 */
describe("pixiv metadata sync schema migration", () => {
  afterEach(() => {
    delete process.env.MANGATEST_DB_PATH;
    vi.resetModules();
  });

  it("adds title-source columns and metadata sync tables to a legacy database and backfills provenance", async () => {
    const dbPath = path.join(os.tmpdir(), `mangatest-pixiv-migration-${randomUUID()}.db`);

    // 模拟迁移前的旧库：与当前 schema 相同，但没有 display_title_source 三个新列。
    const legacy = new Database(dbPath);
    legacy.exec(`
      CREATE TABLE comics (
        id TEXT PRIMARY KEY NOT NULL,
        display_title TEXT NOT NULL,
        file_title TEXT NOT NULL,
        original_title TEXT,
        metadata_query_title TEXT,
        sort_title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'readable',
        primary_local_file_id TEXT,
        parent_comic_id TEXT,
        merged_as_chapter_id TEXT,
        last_read_chapter_id TEXT,
        last_read_page_id TEXT,
        last_read_at TEXT,
        hidden_at TEXT,
        deleted_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX comics_status_idx ON comics (status);
      CREATE INDEX comics_sort_title_idx ON comics (sort_title);
      CREATE INDEX comics_parent_idx ON comics (parent_comic_id);

      CREATE TABLE comic_sources (
        id TEXT PRIMARY KEY NOT NULL,
        comic_id TEXT NOT NULL,
        site TEXT NOT NULL,
        source_id TEXT,
        source_url TEXT NOT NULL,
        original_title TEXT,
        cover_url TEXT,
        raw_metadata_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX comic_sources_comic_idx ON comic_sources (comic_id);
      CREATE UNIQUE INDEX comic_sources_site_source_idx ON comic_sources (site, source_id);
    `);

    const scanComic = randomUUID();
    const editedComic = randomUUID();
    const sourceComic = randomUUID();
    const sourceRecordId = randomUUID();
    const now = new Date().toISOString();

    const insertComic = legacy.prepare(
      "INSERT INTO comics (id, display_title, file_title, sort_title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    );
    insertComic.run(scanComic, "100123", "100123", "100123", now, now);
    insertComic.run(editedComic, "My Edited Title", "100456", "my edited title", now, now);
    insertComic.run(sourceComic, "Metadata Title", "100789", "metadata title", now, now);
    legacy
      .prepare("INSERT INTO comic_sources (id, comic_id, site, source_id, source_url, created_at, updated_at) VALUES (?, ?, 'pixiv', '100789', ?, ?, ?)")
      .run(sourceRecordId, sourceComic, "https://www.pixiv.net/artworks/100789", now, now);
    legacy.close();

    process.env.MANGATEST_DB_PATH = dbPath;
    const { bootstrapDatabase, getSqlite } = await import("./index");
    bootstrapDatabase();
    const sqlite = getSqlite();

    const comicColumns = (sqlite.prepare("PRAGMA table_info(comics)").all() as Array<{ name: string }>).map(
      (column) => column.name,
    );
    expect(comicColumns).toContain("display_title_source");
    expect(comicColumns).toContain("display_title_source_site");
    expect(comicColumns).toContain("display_title_source_id");

    const syncTables = (sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>).map(
      (row) => row.name,
    );
    expect(syncTables).toContain("metadata_sync_sessions");
    expect(syncTables).toContain("metadata_sync_entries");

    const byComic = new Map(
      sqlite
        .prepare("SELECT id, display_title_source AS s FROM comics")
        .all()
        .map((row) => [(row as { id: string }).id, (row as { s: string }).s]),
    );

    expect(byComic.get(scanComic)).toBe("scan");
    expect(byComic.get(editedComic)).toBe("manual");
    expect(byComic.get(sourceComic)).toBe("metadata");

    const sourceComicRow = sqlite
      .prepare("SELECT display_title_source_site AS site, display_title_source_id AS sid FROM comics WHERE id = ?")
      .get(sourceComic) as { site: string | null; sid: string | null };
    expect(sourceComicRow).toEqual({ site: "pixiv", sid: "100789" });

    // 二次 bootstrap 幂等，不改变已回填的来源。
    sqlite.close();
    vi.resetModules();
    process.env.MANGATEST_DB_PATH = dbPath;
    const second = await import("./index");
    second.bootstrapDatabase();
    const sqlite2 = second.getSqlite();
    const after = sqlite2
      .prepare("SELECT display_title_source AS s FROM comics WHERE id = ?")
      .get(editedComic) as { s: string };
    expect(after.s).toBe("manual");
    sqlite2.close();
  });
});
