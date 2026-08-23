import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import Database from "better-sqlite3";

export interface FixtureArtwork {
  artworkId: number;
  title: string;
  folder: string;
  moveFolder?: string | null;
  moved?: boolean;
  deleted?: boolean;
  r18?: boolean | null;
  isAi?: boolean | null;
  count?: number;
  authorId?: number | null;
  authorName?: string | null;
  tags?: Array<{ name: string; translatedName?: string | null }>;
  seriesId?: number | null;
  seriesOrder?: number | null;
}

export interface FixtureOptions {
  artworks?: FixtureArtwork[];
  pathPrefixes?: Array<{ id: number; path: string }>;
  omitTables?: string[];
  omitColumns?: Record<string, string[]>;
  withMangaSeries?: boolean;
}

/** 创建贴近 PixivDownloader 真实 schema 的测试数据库。 */
export function createPixivFixtureDb(dbPath: string, options: FixtureOptions = {}) {
  const db = new Database(dbPath);
  const omit = new Set(options.omitTables ?? []);
  const omitColumns = options.omitColumns ?? {};

  const columnsFor = (table: string, columns: string[]) =>
    columns.filter((column) => !(omitColumns[table] ?? []).includes(column.split(" ")[0]));

  if (!omit.has("artworks")) {
    db.exec(
      `CREATE TABLE artworks (${columnsFor("artworks", [
        "artwork_id INTEGER PRIMARY KEY",
        "title TEXT NOT NULL",
        "folder TEXT NOT NULL",
        "count INTEGER NOT NULL",
        "extensions TEXT NOT NULL",
        "time INTEGER NOT NULL UNIQUE",
        '"R18" INTEGER DEFAULT NULL',
        "is_ai INTEGER DEFAULT NULL",
        "author_id INTEGER DEFAULT NULL",
        "description TEXT DEFAULT NULL",
        "file_name INTEGER NOT NULL DEFAULT 1",
        "file_author_name_id INTEGER",
        "series_id INTEGER DEFAULT NULL",
        "series_order INTEGER DEFAULT NULL",
        "moved INTEGER DEFAULT 0",
        "move_folder TEXT",
        "move_time INTEGER",
        "deleted INTEGER NOT NULL DEFAULT 0",
      ]).join(",")})`,
    );
  }

  if (!omit.has("authors")) {
    db.exec(
      `CREATE TABLE authors (${columnsFor("authors", [
        "author_id INTEGER PRIMARY KEY",
        "name TEXT NOT NULL",
        "updated_time INTEGER NOT NULL",
      ]).join(",")})`,
    );
  }

  if (!omit.has("tags")) {
    db.exec(
      `CREATE TABLE tags (${columnsFor("tags", [
        "tag_id INTEGER PRIMARY KEY AUTOINCREMENT",
        "name TEXT NOT NULL UNIQUE",
        "translated_name TEXT",
      ]).join(",")})`,
    );
  }

  if (!omit.has("artwork_tags")) {
    db.exec(
      `CREATE TABLE artwork_tags (${columnsFor("artwork_tags", [
        "artwork_id INTEGER NOT NULL",
        "tag_id INTEGER NOT NULL",
        "PRIMARY KEY (artwork_id, tag_id)",
      ]).join(",")})`,
    );
  }

  if (!omit.has("path_prefixes")) {
    db.exec(
      `CREATE TABLE path_prefixes (${columnsFor("path_prefixes", [
        "id INTEGER PRIMARY KEY",
        "path TEXT NOT NULL UNIQUE",
      ]).join(",")})`,
    );
  }

  if (options.withMangaSeries) {
    db.exec("CREATE TABLE manga_series (series_id INTEGER PRIMARY KEY, title TEXT NOT NULL, author_id INTEGER, updated_time INTEGER NOT NULL, description TEXT, cover_ext TEXT, cover_folder TEXT)");
  }

  const authors = new Map<number, string>();
  for (const artwork of options.artworks ?? []) {
    if (artwork.authorId != null && artwork.authorName) {
      authors.set(artwork.authorId, artwork.authorName);
    }
  }

  const hasTable = (table: string) => !omit.has(table);
  const hasColumn = (table: string, column: string) => !((omitColumns[table] ?? []).includes(column));
  const lazyPrepare = (sql: string, table: string) => (hasTable(table) ? db.prepare(sql) : null);

  const insertAuthor = lazyPrepare("INSERT OR IGNORE INTO authors (author_id, name, updated_time) VALUES (?, ?, ?)", "authors");
  for (const [authorId, name] of authors) {
    insertAuthor?.run(authorId, name, 1780000000000);
  }

  const insertTag =
    hasTable("tags") && hasColumn("tags", "translated_name")
      ? db.prepare("INSERT OR IGNORE INTO tags (name, translated_name) VALUES (?, ?)")
      : null;
  const selectTag = lazyPrepare("SELECT tag_id AS id FROM tags WHERE name = ?", "tags");
  const insertArtworkTag = lazyPrepare("INSERT OR IGNORE INTO artwork_tags (artwork_id, tag_id) VALUES (?, ?)", "artwork_tags");

  const artworkColumnValues = (artwork: FixtureArtwork): Array<string | number | null> => [
    artwork.artworkId,
    artwork.title,
    artwork.folder,
    artwork.count ?? 1,
    "jpg",
    0, // time 占位，按插入顺序覆写
    artwork.r18 == null ? null : artwork.r18 ? 1 : 0,
    artwork.isAi == null ? null : artwork.isAi ? 1 : 0,
    artwork.authorId ?? null,
    artwork.seriesId ?? 0,
    artwork.seriesOrder ?? (artwork.seriesId ? 1 : null),
    artwork.moved ? 1 : 0,
    artwork.moveFolder ?? null,
    artwork.deleted ? 1 : 0,
  ];
  const artworkColumns = [
    "artwork_id",
    "title",
    "folder",
    "count",
    "extensions",
    "time",
    '"R18"',
    "is_ai",
    "author_id",
    "series_id",
    "series_order",
    "moved",
    "move_folder",
    "deleted",
  ];
  const artworkColumnsPresent = artworkColumns.every((column) => hasColumn("artworks", column.replace(/"/g, "")));
  const insertArtwork =
    hasTable("artworks") && artworkColumnsPresent
      ? db.prepare(`INSERT INTO artworks (${artworkColumns.join(",")}) VALUES (${artworkColumns.map(() => "?").join(",")})`)
      : null;

  let time = 1780000000000;
  for (const artwork of options.artworks ?? []) {
    const values = artworkColumnValues(artwork);
    values[5] = time++;
    insertArtwork?.run(...(values as Array<string | number | null>));

    for (const tag of artwork.tags ?? []) {
      insertTag?.run(tag.name, tag.translatedName ?? null);
      const tagRow = selectTag?.get(tag.name) as { id: number } | undefined;
      if (tagRow) {
        insertArtworkTag?.run(artwork.artworkId, tagRow.id);
      }
    }
  }

  const insertPrefix = lazyPrepare("INSERT OR IGNORE INTO path_prefixes (id, path) VALUES (?, ?)", "path_prefixes");
  for (const prefix of options.pathPrefixes ?? []) {
    insertPrefix?.run(prefix.id, prefix.path);
  }

  return db;
}

export async function createSyncWorkspace(prefix: string) {
  const workspace = path.join(process.env.TEMP ?? path.join(__dirname, "tmp"), `${prefix}-${randomUUID()}`);
  const downloadRoot = path.join(workspace, "pixiv-root");
  await mkdir(downloadRoot, { recursive: true });

  return {
    workspace,
    downloadRoot,
    dbPath: path.join(workspace, "pixiv_download.db"),
    mangaTestDbPath: path.join(workspace, "mangatest.sqlite"),
  };
}

/** 在 MangaTest 测试库里直接插入一条本地漫画记录（display_title_source 默认 scan）。 */
export function insertLocalComic(
  sqlite: Database.Database,
  input: {
    comicId: string;
    localFileId: string;
    mangaRootId: string;
    absolutePath: string;
    relativePath: string;
    displayTitle?: string;
    fileTitle?: string;
    displayTitleSource?: string;
  },
) {
  const fileTitle = input.fileTitle ?? path.basename(input.absolutePath);
  sqlite
    .prepare(
      "INSERT INTO comics (id, display_title, display_title_source, file_title, sort_title, status, primary_local_file_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      input.comicId,
      input.displayTitle ?? fileTitle,
      input.displayTitleSource ?? "scan",
      fileTitle,
      (input.displayTitle ?? fileTitle).toLowerCase(),
      "readable",
      input.localFileId,
    );
  sqlite
    .prepare(
      "INSERT INTO local_files (id, comic_id, manga_root_id, kind, absolute_path, relative_path, is_primary, is_missing) VALUES (?, ?, ?, ?, ?, ?, 1, 0)",
    )
    .run(input.localFileId, input.comicId, input.mangaRootId, "directory", input.absolutePath, input.relativePath);
}

export async function createArtworkDir(downloadRoot: string, artworkId: number | string, files = ["001.jpg"]) {
  const { writeFile } = await import("node:fs/promises");
  const dir = path.join(downloadRoot, String(artworkId));
  await mkdir(dir, { recursive: true });
  for (const file of files) {
    await writeFile(path.join(dir, file), Buffer.from(`fake-${artworkId}-${file}`));
  }
  return dir;
}
