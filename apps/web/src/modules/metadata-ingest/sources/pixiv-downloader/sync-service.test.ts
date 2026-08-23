import { randomUUID } from "node:crypto";
import path from "node:path";

import Database from "better-sqlite3";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createArtworkDir, createPixivFixtureDb, createSyncWorkspace, insertLocalComic, type FixtureOptions } from "./pixiv-fixture";

interface SetupExtras {
  workspace: { workspace: string; downloadRoot: string; dbPath: string; mangaTestDbPath: string };
  sqlite: Database.Database;
  mangaRootId: string;
}

type DynamicModule = typeof import("./sync-service");

async function setup(fixture: FixtureOptions): Promise<SetupExtras & DynamicModule> {
  vi.resetModules();
  const workspace = await createSyncWorkspace("pixiv-sync");
  process.env.MANGATEST_DB_PATH = workspace.mangaTestDbPath;

  const fixtureDb = createPixivFixtureDb(workspace.dbPath, fixture);
  fixtureDb.close();

  const core = await import("@/modules/core/db");
  core.bootstrapDatabase();
  const sqlite = core.getSqlite();
  const mangaRootId = randomUUID();
  sqlite
    .prepare("INSERT INTO manga_roots (id, absolute_path, display_name, scan_mode, is_enabled) VALUES (?, ?, ?, ?, 1)")
    .run(mangaRootId, workspace.downloadRoot, "Pixiv Root", "children_as_comics");

  const settingsModule = await import("@/modules/core/settings");
  await settingsModule.saveRuntimeSettings({
    pixivDownloaderDbPath: workspace.dbPath,
    pixivDownloaderDownloadRoot: workspace.downloadRoot,
    pixivDownloaderMangaRootId: mangaRootId,
  });

  const syncModule = await import("./sync-service");

  return {
    workspace,
    sqlite,
    mangaRootId,
    ...syncModule,
  };
}

function selectComicRow(sqlite: Database.Database, comicId: string) {
  return sqlite
    .prepare(
      "SELECT display_title AS displayTitle, display_title_source AS displayTitleSource, display_title_source_site AS site, display_title_source_id AS sourceId, file_title AS fileTitle FROM comics WHERE id = ?",
    )
    .get(comicId) as {
    displayTitle: string;
    displayTitleSource: string;
    site: string | null;
    sourceId: string | null;
    fileTitle: string;
  } | undefined;
}

function selectComicTags(sqlite: Database.Database, comicId: string) {
  return sqlite
    .prepare(
      "SELECT t.canonical AS canonical, t.display_name_zh AS displayNameZh, ct.source AS source FROM comic_tags ct JOIN tags t ON t.id = ct.tag_id WHERE ct.comic_id = ? ORDER BY t.canonical",
    )
    .all(comicId) as Array<{ canonical: string; displayNameZh: string | null; source: string }>;
}

function openFixtureWritable(dbPath: string) {
  return new Database(dbPath);
}

afterEach(() => {
  delete process.env.MANGATEST_DB_PATH;
  vi.resetModules();
});

describe("pixiv downloader sync service", () => {
  it("binds first match by resolved absolute path, updates title, and writes artist/general tags", async () => {
    const ctx = await setup({
      artworks: [
        {
          artworkId: 100001,
          title: "Pixiv Title A",
          folder: "{0}/100001",
          authorId: 5,
          authorName: "ArtistA",
          tags: [
            { name: "原神", translatedName: "Genshin Impact" },
            { name: "女の子", translatedName: "女孩子" },
          ],
        },
      ],
    });

    await createArtworkDir(ctx.workspace.downloadRoot, 100001);
    const comicId = randomUUID();
    insertLocalComic(ctx.sqlite, {
      comicId,
      localFileId: randomUUID(),
      mangaRootId: ctx.mangaRootId,
      absolutePath: path.join(ctx.workspace.downloadRoot, "100001"),
      relativePath: "100001",
      displayTitle: "100001",
    });

    const result = await ctx.runPixivDownloaderSync();
    expect(result.ok).toBe(true);
    expect(result.summary?.stats.updated).toBe(1);

    const comic = selectComicRow(ctx.sqlite, comicId);
    expect(comic).toMatchObject({
      displayTitle: "Pixiv Title A",
      displayTitleSource: "metadata",
      site: "pixiv",
      sourceId: "100001",
      fileTitle: "100001",
    });

    const sources = ctx.sqlite
      .prepare("SELECT site, source_id AS sourceId, original_title AS originalTitle, raw_metadata_json AS raw FROM comic_sources")
      .all() as Array<{ site: string; sourceId: string; originalTitle: string; raw: string }>;
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({ site: "pixiv", sourceId: "100001", originalTitle: "Pixiv Title A" });
    const raw = JSON.parse(sources[0].raw) as { seriesId: number | null; authorName: string | null; resolvedPath: string };
    expect(raw.seriesId).toBeNull();
    expect(raw.authorName).toBe("ArtistA");
    expect(raw.resolvedPath).toBe(path.join(ctx.workspace.downloadRoot, "100001"));

    const tags = selectComicTags(ctx.sqlite, comicId);
    expect(tags.map((tag) => tag.canonical)).toEqual(["artist:artista", "general:原神", "general:女の子"]);
    expect(tags.every((tag) => tag.source === "metadata")).toBe(true);
    expect(tags.find((tag) => tag.canonical === "general:原神")?.displayNameZh).toBeNull();
    expect(tags.find((tag) => tag.canonical === "general:女の子")?.displayNameZh).toBe("女孩子");

    const entry = result.preview.entries[0];
    expect(entry).toMatchObject({ artworkId: "100001", action: "updated", matchedBy: "path", titleUpdated: true });

    const sessionEntries = ctx.sqlite
      .prepare("SELECT action FROM metadata_sync_entries")
      .all() as Array<{ action: string }>;
    expect(sessionEntries).toHaveLength(1);
  });

  it("keeps repeat sync idempotent without duplicating sources or tags", async () => {
    const ctx = await setup({
      artworks: [
        {
          artworkId: 100002,
          title: "Pixiv Title B",
          folder: "{0}/100002",
          authorId: 6,
          authorName: "ArtistB",
          tags: [{ name: "tag one" }],
        },
      ],
    });

    await createArtworkDir(ctx.workspace.downloadRoot, 100002);
    const comicId = randomUUID();
    insertLocalComic(ctx.sqlite, {
      comicId,
      localFileId: randomUUID(),
      mangaRootId: ctx.mangaRootId,
      absolutePath: path.join(ctx.workspace.downloadRoot, "100002"),
      relativePath: "100002",
    });

    await ctx.runPixivDownloaderSync();
    const tagCountAfterFirst = selectComicTags(ctx.sqlite, comicId).length;

    const second = await ctx.runPixivDownloaderSync();
    expect(second.summary?.stats).toMatchObject({ total: 1, updated: 0, skipped: 1, unmatched: 0, conflict: 0 });

    expect(
      (ctx.sqlite.prepare("SELECT count(*) AS c FROM comic_sources WHERE site = 'pixiv'").get() as { c: number }).c,
    ).toBe(1);
    expect(selectComicTags(ctx.sqlite, comicId)).toHaveLength(tagCountAfterFirst);
    expect(
      (ctx.sqlite.prepare("SELECT count(*) AS c FROM tags WHERE canonical LIKE 'general:%' OR canonical LIKE 'artist:%'").get() as { c: number }).c,
    ).toBe(2);

    const secondEntry = second.preview.entries[0];
    expect(secondEntry.action).toBe("skipped");
    expect(secondEntry.reason).toBe("no_change");
  });

  it("never overwrites a manually edited display title but still refreshes source metadata", async () => {
    const ctx = await setup({
      artworks: [
        { artworkId: 100010, title: "Pixiv Original", folder: "{0}/100010", authorId: 7, authorName: "ArtistC" },
      ],
    });

    await createArtworkDir(ctx.workspace.downloadRoot, 100010);
    const comicId = randomUUID();
    insertLocalComic(ctx.sqlite, {
      comicId,
      localFileId: randomUUID(),
      mangaRootId: ctx.mangaRootId,
      absolutePath: path.join(ctx.workspace.downloadRoot, "100010"),
      relativePath: "100010",
    });

    await ctx.runPixivDownloaderSync();

    const metadataRepository = (await import("@/modules/library/comic-metadata.repository")).createComicMetadataRepository();
    await metadataRepository.updateMetadata(comicId, { displayTitle: "My Manual Title" });

    const fixtureDb = openFixtureWritable(ctx.workspace.dbPath);
    fixtureDb.prepare("UPDATE artworks SET title = ? WHERE artwork_id = ?").run("Pixiv Renamed", 100010);
    fixtureDb.close();

    const second = await ctx.runPixivDownloaderSync();
    expect(second.summary?.stats.updated).toBe(0);

    const comic = selectComicRow(ctx.sqlite, comicId);
    expect(comic).toMatchObject({ displayTitle: "My Manual Title", displayTitleSource: "manual" });

    const source = ctx.sqlite
      .prepare("SELECT original_title AS originalTitle FROM comic_sources WHERE site = 'pixiv' AND source_id = '100010'")
      .get() as { originalTitle: string };
    expect(source.originalTitle).toBe("Pixiv Renamed");

    expect(second.preview.entries[0].reason).toBe("manual_title_protected");
  });

  it("re-matches by source identity after the artwork folder changes", async () => {
    const ctx = await setup({
      artworks: [
        { artworkId: 100020, title: "Pixiv Old Title", folder: "{0}/100020", authorId: 8, authorName: "ArtistD" },
      ],
    });

    await createArtworkDir(ctx.workspace.downloadRoot, 100020);
    const comicId = randomUUID();
    insertLocalComic(ctx.sqlite, {
      comicId,
      localFileId: randomUUID(),
      mangaRootId: ctx.mangaRootId,
      absolutePath: path.join(ctx.workspace.downloadRoot, "100020"),
      relativePath: "100020",
    });

    await ctx.runPixivDownloaderSync();

    const fixtureDb = openFixtureWritable(ctx.workspace.dbPath);
    fixtureDb.prepare("UPDATE artworks SET folder = ?, moved = 1, move_folder = ?, title = ? WHERE artwork_id = ?").run(
      "{0}/100020",
      "{0}/moved/100020",
      "Pixiv New Title",
      100020,
    );
    fixtureDb.close();

    const second = await ctx.runPixivDownloaderSync();
    const entry = second.preview.entries[0];
    expect(entry.action).toBe("updated");
    expect(entry.matchedBy).toBe("source");
    expect(entry.titleUpdated).toBe(true);

    const comic = selectComicRow(ctx.sqlite, comicId);
    expect(comic?.displayTitle).toBe("Pixiv New Title");
    expect(
      (ctx.sqlite.prepare("SELECT count(*) AS c FROM comics").get() as { c: number }).c,
    ).toBe(1);
  });

  it("records a conflict when source identity and path point to different comics", async () => {
    const ctx = await setup({
      artworks: [
        { artworkId: 100030, title: "Conflict Artwork", folder: "{0}/100030", authorId: 9, authorName: "ArtistE" },
      ],
    });

    await createArtworkDir(ctx.workspace.downloadRoot, 100030);

    const comicA = randomUUID();
    const comicB = randomUUID();
    insertLocalComic(ctx.sqlite, {
      comicId: comicA,
      localFileId: randomUUID(),
      mangaRootId: ctx.mangaRootId,
      absolutePath: path.join(ctx.workspace.downloadRoot, "elsewhere"),
      relativePath: "elsewhere",
      displayTitle: "Comic A",
    });
    ctx.sqlite
      .prepare("INSERT INTO comic_sources (id, comic_id, site, source_id, source_url, original_title) VALUES (?, ?, 'pixiv', '100030', ?, ?)")
      .run(randomUUID(), comicA, "https://www.pixiv.net/artworks/100030", "Conflict Artwork");

    insertLocalComic(ctx.sqlite, {
      comicId: comicB,
      localFileId: randomUUID(),
      mangaRootId: ctx.mangaRootId,
      absolutePath: path.join(ctx.workspace.downloadRoot, "100030"),
      relativePath: "100030",
      displayTitle: "Comic B",
    });

    const result = await ctx.runPixivDownloaderSync();
    expect(result.summary?.stats).toMatchObject({ conflict: 1, updated: 0 });

    const entry = result.preview.entries[0];
    expect(entry.action).toBe("conflict");
    expect(entry.reason).toBe("identity_path_mismatch");

    expect(selectComicRow(ctx.sqlite, comicB)?.displayTitle).toBe("Comic B");
    expect(
      (ctx.sqlite.prepare("SELECT count(*) AS c FROM comic_tags WHERE comic_id = ?").get(comicB) as { c: number }).c,
    ).toBe(0);
  });

  it("records unmatched artworks without creating comics", async () => {
    const ctx = await setup({
      artworks: [{ artworkId: 100040, title: "No Local Copy", folder: "{0}/100040" }],
    });

    const result = await ctx.runPixivDownloaderSync();
    expect(result.summary?.stats).toMatchObject({ unmatched: 1, updated: 0 });
    expect(result.preview.entries[0]).toMatchObject({ action: "unmatched", reason: "no_local_match" });
    expect((ctx.sqlite.prepare("SELECT count(*) AS c FROM comics").get() as { c: number }).c).toBe(0);
  });

  it("records path escape instead of matching outside the download root", async () => {
    const ctx = await setup({
      artworks: [{ artworkId: 100050, title: "Escaped", folder: "{0}/../outside-library/100050" }],
    });

    const result = await ctx.runPixivDownloaderSync();
    expect(result.summary?.stats).toMatchObject({ pathError: 1, updated: 0 });
    expect(result.preview.entries[0].action).toBe("path_error");
    expect(result.preview.entries[0].reason?.startsWith("path_escape")).toBe(true);
  });

  it("prefers move_folder when moved is effective", async () => {
    const ctx = await setup({
      artworks: [
        {
          artworkId: 100060,
          title: "Moved Artwork",
          folder: "{0}/100060-old",
          moveFolder: "{0}/100060-new",
          moved: true,
          authorId: 11,
          authorName: "ArtistF",
        },
      ],
    });

    await createArtworkDir(ctx.workspace.downloadRoot, "100060-new");
    const comicId = randomUUID();
    insertLocalComic(ctx.sqlite, {
      comicId,
      localFileId: randomUUID(),
      mangaRootId: ctx.mangaRootId,
      absolutePath: path.join(ctx.workspace.downloadRoot, "100060-new"),
      relativePath: "100060-new",
    });

    const result = await ctx.runPixivDownloaderSync();
    expect(result.summary?.stats.updated).toBe(1);
    expect(result.preview.entries[0].resolvedPath).toBe(path.join(ctx.workspace.downloadRoot, "100060-new"));
    expect(selectComicRow(ctx.sqlite, comicId)?.displayTitle).toBe("Moved Artwork");
  });

  it("opens the external database strictly read-only", async () => {
    const ctx = await setup({ artworks: [] });
    const external = (await import("./sqlite-reader")).openPixivDatabaseReadonly(ctx.workspace.dbPath);

    expect(() => external.exec("CREATE TABLE should_fail (id INTEGER)")).toThrow();
    expect(() => external.prepare("INSERT INTO artworks (artwork_id, title, folder, count, extensions, time) VALUES (1, 'x', 'y', 1, 'jpg', 1)").run()).toThrow();

    external.close();
  });

  it("stops the whole sync when the external schema is incompatible", async () => {
    const ctx = await setup({ omitTables: ["artwork_tags"], artworks: [{ artworkId: 100070, title: "T", folder: "{0}/100070" }] });

    const check = await ctx.checkPixivDownloaderConnection();
    expect(check.ok).toBe(false);
    if (!check.ok) {
      expect(check.status).toBe("schema_incompatible");
      expect(check.message).toContain("artwork_tags");
    }

    const preview = await ctx.previewPixivDownloaderSync();
    expect(preview.ok).toBe(false);
    expect(preview.error).toContain("artwork_tags");

    expect(
      (ctx.sqlite.prepare("SELECT count(*) AS c FROM metadata_sync_sessions").get() as { c: number }).c,
    ).toBe(0);
  });

  it("runs scan-and-sync end to end from a real directory scan", async () => {
    vi.resetModules();
    const workspace = await createSyncWorkspace("pixiv-scan-sync");
    process.env.MANGATEST_DB_PATH = workspace.mangaTestDbPath;

    const jpeg = await sharp({ create: { width: 8, height: 12, channels: 3, background: "#ef3b91" } })
      .jpeg()
      .toBuffer();
    const artworkDir = path.join(workspace.downloadRoot, "100080");
    const { mkdir, writeFile } = await import("node:fs/promises");
    await mkdir(artworkDir, { recursive: true });
    await writeFile(path.join(artworkDir, "001.jpg"), jpeg);

    const fixtureDb = createPixivFixtureDb(workspace.dbPath, {
      artworks: [
        { artworkId: 100080, title: "Scanned Pixiv Title", folder: "{0}/100080", authorId: 12, authorName: "ArtistG", tags: [{ name: "beautiful girl" }] },
      ],
    });
    fixtureDb.close();

    const core = await import("@/modules/core/db");
    core.bootstrapDatabase();
    const sqlite = core.getSqlite();
    const mangaRootId = randomUUID();
    sqlite
      .prepare("INSERT INTO manga_roots (id, absolute_path, display_name, scan_mode, is_enabled) VALUES (?, ?, ?, ?, 1)")
      .run(mangaRootId, workspace.downloadRoot, "Pixiv Root", "children_as_comics");

    const settingsModule = await import("@/modules/core/settings");
    await settingsModule.saveRuntimeSettings({
      pixivDownloaderDbPath: workspace.dbPath,
      pixivDownloaderDownloadRoot: workspace.downloadRoot,
      pixivDownloaderMangaRootId: mangaRootId,
    });

    const { runPixivDownloaderSync } = await import("./sync-service");
    const result = await runPixivDownloaderSync({ scanFirst: true });

    expect(result.ok).toBe(true);
    expect(result.summary?.scanAddedCount).toBe(1);
    expect(result.summary?.stats.updated).toBe(1);

    const comic = sqlite
      .prepare("SELECT display_title AS displayTitle, display_title_source AS source, file_title AS fileTitle FROM comics")
      .get() as { displayTitle: string; source: string; fileTitle: string };
    expect(comic).toMatchObject({ displayTitle: "Scanned Pixiv Title", source: "metadata", fileTitle: "100080" });
    expect(
      (sqlite.prepare("SELECT count(*) AS c FROM comic_tags ct JOIN tags t ON t.id = ct.tag_id WHERE t.canonical = 'artist:artistg'").get() as { c: number }).c,
    ).toBe(1);
  });
});
