import fs from "node:fs";

import Database from "better-sqlite3";

import { describePixivSchemaIssues, inspectPixivDownloaderSchema } from "./schema-inspector";
import type {
  ExternalPixivArtwork,
  ExternalPixivSnapshot,
  PixivConnectionCheckResult,
} from "./types";

/**
 * 以只读方式打开 PixivDownloader SQLite 数据库。
 *
 * - 使用独立连接，绝不 ATTACH 到 MangaTest 业务连接。
 * - readonly + fileMustExist 保证不写入、不创建、不修复外部数据库。
 */
export function openPixivDatabaseReadonly(dbPath: string): Database.Database {
  return new Database(dbPath, { readonly: true, fileMustExist: true });
}

export function checkPixivDatabaseConnection(dbPath: string): PixivConnectionCheckResult {
  if (!dbPath.trim()) {
    return { ok: false, status: "missing_settings", message: "请先配置 PixivDownloader 数据库路径。" };
  }

  let stat: fs.Stats;
  try {
    stat = fs.statSync(dbPath);
  } catch {
    return { ok: false, status: "db_not_found", message: `找不到数据库文件：${dbPath}` };
  }

  if (!stat.isFile()) {
    return { ok: false, status: "not_a_file", message: `配置的路径不是文件：${dbPath}` };
  }

  let sqlite: Database.Database;
  try {
    sqlite = openPixivDatabaseReadonly(dbPath);
  } catch (error) {
    return {
      ok: false,
      status: "open_failed",
      message: `无法只读打开数据库：${error instanceof Error ? error.message : String(error)}`,
    };
  }

  try {
    const schema = inspectPixivDownloaderSchema(sqlite);
    if (!schema.ok) {
      return {
        ok: false,
        status: "schema_incompatible",
        message: `PixivDownloader 数据库 schema 不兼容：${describePixivSchemaIssues(schema)}`,
        schema,
      };
    }

    return { ok: true, schema };
  } finally {
    sqlite.close();
  }
}

interface ArtworkRow {
  artwork_id: number;
  title: string;
  folder: string;
  count: number;
  R18: number | null;
  is_ai: number | null;
  author_id: number | null;
  author_name: string | null;
  series_id: number | null;
  series_order: number | null;
  moved: number | null;
  move_folder: string | null;
  deleted: number | null;
}

interface ArtworkTagRow {
  artwork_id: number;
  name: string;
  translated_name: string | null;
}

interface PathPrefixRow {
  id: number;
  path: string;
}

function normalizeSeriesId(seriesId: number | null): number | null {
  // PixivDownloader 用 0 表示“不属于任何系列”。
  if (seriesId === null || seriesId === undefined || seriesId === 0) {
    return null;
  }
  return Number(seriesId);
}

/** 批量读取作品、作者、标签、系列信息和路径前缀，转换为规范化快照。 */
export function loadPixivSnapshot(sqlite: Database.Database): ExternalPixivSnapshot {
  const artworkRows = sqlite
    .prepare(
      `
      SELECT a.artwork_id, a.title, a.folder, a.count, a."R18", a.is_ai,
             a.author_id, a.series_id, a.series_order, a.moved, a.move_folder, a.deleted,
             au.name AS author_name
      FROM artworks a
      LEFT JOIN authors au ON au.author_id = a.author_id
      ORDER BY a.artwork_id
      `,
    )
    .all() as ArtworkRow[];

  const tagRows = sqlite
    .prepare(
      `
      SELECT at.artwork_id, t.name, t.translated_name
      FROM artwork_tags at
      INNER JOIN tags t ON t.tag_id = at.tag_id
      ORDER BY at.artwork_id, t.tag_id
      `,
    )
    .all() as ArtworkTagRow[];

  const tagsByArtwork = new Map<number, ExternalPixivArtwork["tags"]>();
  for (const row of tagRows) {
    const list = tagsByArtwork.get(row.artwork_id) ?? [];
    if (row.name && row.name.trim()) {
      list.push({ name: row.name.trim(), translatedName: row.translated_name?.trim() || null });
    }
    tagsByArtwork.set(row.artwork_id, list);
  }

  const pathPrefixes = (sqlite
    .prepare("SELECT id, path FROM path_prefixes ORDER BY id")
    .all() as PathPrefixRow[]).map((row) => ({ id: Number(row.id), path: row.path }));

  const artworks: ExternalPixivArtwork[] = artworkRows.map((row) => ({
    artworkId: Number(row.artwork_id),
    title: row.title ?? "",
    folder: row.folder ?? "",
    moveFolder: row.move_folder?.trim() ? row.move_folder : null,
    moved: Boolean(row.moved),
    deleted: Boolean(row.deleted),
    r18: row.R18 === null || row.R18 === undefined ? null : Boolean(row.R18),
    isAi: row.is_ai === null || row.is_ai === undefined ? null : Boolean(row.is_ai),
    pageCount: Number(row.count ?? 0),
    authorId: row.author_id === null || row.author_id === undefined ? null : Number(row.author_id),
    authorName: row.author_name?.trim() || null,
    tags: tagsByArtwork.get(Number(row.artwork_id)) ?? [],
    seriesId: normalizeSeriesId(row.series_id === null || row.series_id === undefined ? null : Number(row.series_id)),
    seriesOrder:
      row.series_order === null || row.series_order === undefined ? null : Number(row.series_order),
  }));

  return { artworks, pathPrefixes };
}
