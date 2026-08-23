/**
 * PixivDownloader 外部来源适配器的规范化类型。
 *
 * 这些类型与 PixivDownloader 的表结构解耦：sqlite-reader 负责把外部表行转换为
 * ExternalPixivArtwork，后续匹配 / 同步代码只依赖这里的 DTO，不依赖外部表名。
 */

export const PIXIV_SITE = "pixiv";
export const PIXIV_DOWNLOADER_PROVIDER = "pixiv-downloader";

export interface ExternalPixivArtworkTag {
  name: string;
  translatedName: string | null;
}

/** PixivDownloader artworks 表一行的规范化视图。 */
export interface ExternalPixivArtwork {
  artworkId: number;
  title: string;
  folder: string;
  moveFolder: string | null;
  moved: boolean;
  deleted: boolean;
  r18: boolean | null;
  isAi: boolean | null;
  pageCount: number;
  authorId: number | null;
  authorName: string | null;
  tags: ExternalPixivArtworkTag[];
  /** PixivDownloader 中 series_id = 0 或 NULL 表示不属于系列。 */
  seriesId: number | null;
  seriesOrder: number | null;
}

/** path_prefixes 表一行。 */
export interface ExternalPixivPathPrefix {
  id: number;
  path: string;
}

/** 从外部数据库读出的完整快照。 */
export interface ExternalPixivSnapshot {
  artworks: ExternalPixivArtwork[];
  pathPrefixes: ExternalPixivPathPrefix[];
}

/** 用户在后台分别配置的三项 PixivDownloader 设置。 */
export interface PixivDownloaderConfig {
  dbPath: string;
  downloadRoot: string;
  mangaRootId: string;
}

export interface PixivSchemaIssue {
  table: string;
  missingColumns: string[];
}

export interface PixivSchemaInspectionResult {
  ok: boolean;
  missing: PixivSchemaIssue[];
  missingTables: string[];
  warnings: string[];
  tableCounts: {
    artworks: number;
    authors: number;
    tags: number;
    artworkTags: number;
    pathPrefixes: number;
  };
  inspectedAt: string;
}

export type PixivConnectionCheckResult =
  | { ok: true; schema: PixivSchemaInspectionResult }
  | { ok: false; status: "missing_settings" | "db_not_found" | "not_a_file" | "open_failed" | "schema_incompatible" | "unknown_path"; message: string; schema?: PixivSchemaInspectionResult };

export type PixivPathResolveFailure =
  | { kind: "empty_folder" }
  | { kind: "unknown_prefix"; placeholder: string }
  | { kind: "path_escape"; resolvedPath: string };

export type PixivPathResolveResult =
  | {
      ok: true;
      absolutePath: string;
      usedMoveFolder: boolean;
      existsOnDisk: boolean;
    }
  | {
      ok: false;
      failure: PixivPathResolveFailure;
      usedMoveFolder: boolean;
    };

export type PixivSyncEntryAction =
  | "updated"
  | "skipped"
  | "unmatched"
  | "conflict"
  | "path_error"
  | "error";

export type PixivSyncSkipReason =
  | "deleted_in_source"
  | "manual_title_protected"
  | "no_change";

export interface PixivSyncEntry {
  artworkId: string;
  title: string | null;
  resolvedPath: string | null;
  action: PixivSyncEntryAction;
  reason: string | null;
  matchedComicId: string | null;
  matchedComicTitle: string | null;
  matchedLocalFileId: string | null;
  matchedBy: "source" | "path" | null;
  titleUpdated: boolean;
  sourceCreated: boolean;
  tagCount: number;
  existsOnDisk: boolean;
}

export interface PixivSyncStats {
  total: number;
  updated: number;
  skipped: number;
  unmatched: number;
  conflict: number;
  pathError: number;
  error: number;
}

export interface PixivSyncSummary {
  sessionId: string;
  provider: typeof PIXIV_DOWNLOADER_PROVIDER;
  status: "completed" | "failed";
  stats: PixivSyncStats;
  scanSessionId: string | null;
  scanAddedCount: number | null;
  startedAt: string;
  finishedAt: string;
  errorSummary: string | null;
}

export interface PixivSyncPreviewResult {
  ok: boolean;
  config: PixivDownloaderConfig;
  schema: PixivSchemaInspectionResult | null;
  stats: PixivSyncStats;
  entries: PixivSyncEntry[];
  error: string | null;
}

export interface PixivSyncRunResult {
  ok: boolean;
  preview: PixivSyncPreviewResult;
  summary: PixivSyncSummary | null;
}
