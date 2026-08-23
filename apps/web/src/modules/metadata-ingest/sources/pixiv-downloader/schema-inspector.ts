import Database from "better-sqlite3";

import type { PixivSchemaInspectionResult } from "./types";

/**
 * PixivDownloader 数据库必需的表和列。
 * manga_series 仅用于补充系列标题，缺失时降级为 warning，不阻塞同步。
 */
const REQUIRED_COLUMNS: Record<string, string[]> = {
  artworks: [
    "artwork_id",
    "title",
    "folder",
    "moved",
    "move_folder",
    "deleted",
    "author_id",
    "series_id",
    "series_order",
    "count",
  ],
  authors: ["author_id", "name"],
  tags: ["tag_id", "name", "translated_name"],
  artwork_tags: ["artwork_id", "tag_id"],
  path_prefixes: ["id", "path"],
};

const OPTIONAL_TABLES = ["manga_series"];

export function inspectPixivDownloaderSchema(sqlite: Database.Database): PixivSchemaInspectionResult {
  const existingTables = new Set(
    (sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>).map(
      (row) => row.name,
    ),
  );

  const missingTables: string[] = [];
  const missing: PixivSchemaInspectionResult["missing"] = [];
  const warnings: string[] = [];

  for (const [table, requiredColumns] of Object.entries(REQUIRED_COLUMNS)) {
    if (!existingTables.has(table)) {
      missingTables.push(table);
      missing.push({ table, missingColumns: requiredColumns });
      continue;
    }

    const columns = sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    const columnNames = new Set(columns.map((column) => column.name));
    const missingColumns = requiredColumns.filter((column) => !columnNames.has(column));

    if (missingColumns.length > 0) {
      missing.push({ table, missingColumns });
    }
  }

  for (const table of OPTIONAL_TABLES) {
    if (!existingTables.has(table)) {
      warnings.push(`缺少可选表 ${table}，系列标题将无法补充。`);
    }
  }

  const tableCounts = { artworks: 0, authors: 0, tags: 0, artworkTags: 0, pathPrefixes: 0 };
  if (!missingTables.includes("artworks")) {
    tableCounts.artworks = Number(
      (sqlite.prepare("SELECT count(*) AS c FROM artworks").get() as { c: number } | undefined)?.c ?? 0,
    );
  }
  if (!missingTables.includes("authors")) {
    tableCounts.authors = Number(
      (sqlite.prepare("SELECT count(*) AS c FROM authors").get() as { c: number } | undefined)?.c ?? 0,
    );
  }
  if (!missingTables.includes("tags")) {
    tableCounts.tags = Number(
      (sqlite.prepare("SELECT count(*) AS c FROM tags").get() as { c: number } | undefined)?.c ?? 0,
    );
  }
  if (!missingTables.includes("artwork_tags")) {
    tableCounts.artworkTags = Number(
      (sqlite.prepare("SELECT count(*) AS c FROM artwork_tags").get() as { c: number } | undefined)?.c ?? 0,
    );
  }
  if (!missingTables.includes("path_prefixes")) {
    tableCounts.pathPrefixes = Number(
      (sqlite.prepare("SELECT count(*) AS c FROM path_prefixes").get() as { c: number } | undefined)?.c ?? 0,
    );
  }

  return {
    ok: missing.length === 0,
    missing,
    missingTables,
    warnings,
    tableCounts,
    inspectedAt: new Date().toISOString(),
  };
}

export function describePixivSchemaIssues(result: PixivSchemaInspectionResult): string {
  const parts: string[] = [];

  if (result.missingTables.length > 0) {
    parts.push(`缺少表：${result.missingTables.join("、")}`);
  }

  const columnIssues = result.missing
    .filter((issue) => issue.missingColumns.length > 0)
    .map((issue) => `${issue.table} 缺少列 ${issue.missingColumns.join("、")}`);

  return [...parts, ...columnIssues].join("；");
}
