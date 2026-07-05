import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
};

export const comicStatuses = [
  "readable",
  "missing_local_file",
  "remote_only",
  "hidden",
  "deleted",
] as const;

export const localFileKinds = ["directory", "zip", "cbz"] as const;
export const mangaRootScanModes = ["children_as_comics"] as const;
export const pageSourceKinds = ["filesystem", "archive"] as const;
export const mediaAssetUses = ["cover", "list_thumbnail", "reader_thumbnail"] as const;
export const cacheEntryKinds = ["archive_file_list", "page_image"] as const;

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  valueType: text("value_type", { enum: ["string", "number", "boolean", "json"] })
    .notNull()
    .default("string"),
  ...timestamps,
});

export const mangaRoots = sqliteTable(
  "manga_roots",
  {
    id: text("id").primaryKey(),
    absolutePath: text("absolute_path").notNull(),
    displayName: text("display_name"),
    scanMode: text("scan_mode", { enum: mangaRootScanModes }).notNull().default("children_as_comics"),
    isEnabled: integer("is_enabled", { mode: "boolean" }).notNull().default(true),
    lastScanSessionId: text("last_scan_session_id"),
    ...timestamps,
  },
  (table) => ({
    pathIdx: uniqueIndex("manga_roots_absolute_path_idx").on(table.absolutePath),
  }),
);

export const scanSessions = sqliteTable(
  "scan_sessions",
  {
    id: text("id").primaryKey(),
    mangaRootId: text("manga_root_id").references(() => mangaRoots.id),
    status: text("status", { enum: ["queued", "running", "completed", "failed", "cancel_requested", "canceled"] })
      .notNull()
      .default("queued"),
    startedAt: text("started_at"),
    finishedAt: text("finished_at"),
    addedCount: integer("added_count").notNull().default(0),
    missingCount: integer("missing_count").notNull().default(0),
    duplicateCandidateCount: integer("duplicate_candidate_count").notNull().default(0),
    recoverableCount: integer("recoverable_count").notNull().default(0),
    errorSummary: text("error_summary"),
    ...timestamps,
  },
  (table) => ({
    rootIdx: index("scan_sessions_root_idx").on(table.mangaRootId),
    statusIdx: index("scan_sessions_status_idx").on(table.status),
  }),
);

export const comics = sqliteTable(
  "comics",
  {
    id: text("id").primaryKey(),
    displayTitle: text("display_title").notNull(),
    fileTitle: text("file_title").notNull(),
    originalTitle: text("original_title"),
    metadataQueryTitle: text("metadata_query_title"),
    sortTitle: text("sort_title").notNull(),
    status: text("status", { enum: comicStatuses }).notNull().default("readable"),
    primaryLocalFileId: text("primary_local_file_id"),
    parentComicId: text("parent_comic_id"),
    mergedAsChapterId: text("merged_as_chapter_id"),
    lastReadChapterId: text("last_read_chapter_id"),
    lastReadPageId: text("last_read_page_id"),
    lastReadAt: text("last_read_at"),
    hiddenAt: text("hidden_at"),
    deletedAt: text("deleted_at"),
    ...timestamps,
  },
  (table) => ({
    statusIdx: index("comics_status_idx").on(table.status),
    sortTitleIdx: index("comics_sort_title_idx").on(table.sortTitle),
    parentIdx: index("comics_parent_idx").on(table.parentComicId),
  }),
);

export const localFiles = sqliteTable(
  "local_files",
  {
    id: text("id").primaryKey(),
    comicId: text("comic_id").references(() => comics.id),
    mangaRootId: text("manga_root_id").references(() => mangaRoots.id),
    kind: text("kind", { enum: localFileKinds }).notNull(),
    absolutePath: text("absolute_path").notNull(),
    relativePath: text("relative_path").notNull(),
    sizeBytes: integer("size_bytes"),
    mtimeMs: integer("mtime_ms"),
    contentHash: text("content_hash"),
    isPrimary: integer("is_primary", { mode: "boolean" }).notNull().default(false),
    isMissing: integer("is_missing", { mode: "boolean" }).notNull().default(false),
    missingSince: text("missing_since"),
    ...timestamps,
  },
  (table) => ({
    comicIdx: index("local_files_comic_idx").on(table.comicId),
    rootPathIdx: uniqueIndex("local_files_root_relative_path_idx").on(table.mangaRootId, table.relativePath),
    hashIdx: index("local_files_hash_idx").on(table.contentHash),
  }),
);

export const chapters = sqliteTable(
  "chapters",
  {
    id: text("id").primaryKey(),
    comicId: text("comic_id")
      .notNull()
      .references(() => comics.id),
    localFileId: text("local_file_id").references(() => localFiles.id),
    title: text("title"),
    sortOrder: integer("sort_order").notNull().default(0),
    pageCount: integer("page_count").notNull().default(0),
    ...timestamps,
  },
  (table) => ({
    comicOrderIdx: index("chapters_comic_order_idx").on(table.comicId, table.sortOrder),
  }),
);

export const pages = sqliteTable(
  "pages",
  {
    id: text("id").primaryKey(),
    chapterId: text("chapter_id")
      .notNull()
      .references(() => chapters.id),
    localFileId: text("local_file_id")
      .notNull()
      .references(() => localFiles.id),
    pageNumber: integer("page_number").notNull(),
    sourceKind: text("source_kind", { enum: pageSourceKinds }).notNull(),
    internalPath: text("internal_path").notNull(),
    archiveIndex: integer("archive_index"),
    width: integer("width"),
    height: integer("height"),
    ...timestamps,
  },
  (table) => ({
    chapterPageIdx: uniqueIndex("pages_chapter_page_idx").on(table.chapterId, table.pageNumber),
    localFileIdx: index("pages_local_file_idx").on(table.localFileId),
  }),
);

export const tags = sqliteTable(
  "tags",
  {
    id: text("id").primaryKey(),
    namespace: text("namespace").notNull(),
    name: text("name").notNull(),
    canonical: text("canonical").notNull(),
    displayNameZh: text("display_name_zh"),
    aliasesJson: text("aliases_json").notNull().default("[]"),
    ...timestamps,
  },
  (table) => ({
    canonicalIdx: uniqueIndex("tags_canonical_idx").on(table.canonical),
    namespaceNameIdx: index("tags_namespace_name_idx").on(table.namespace, table.name),
  }),
);

export const comicTags = sqliteTable(
  "comic_tags",
  {
    comicId: text("comic_id")
      .notNull()
      .references(() => comics.id),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id),
    source: text("source", { enum: ["scan", "metadata", "manual"] }).notNull().default("manual"),
    isUserEdited: integer("is_user_edited", { mode: "boolean" }).notNull().default(false),
    ...timestamps,
  },
  (table) => ({
    pk: primaryKey({ columns: [table.comicId, table.tagId] }),
    tagIdx: index("comic_tags_tag_idx").on(table.tagId),
  }),
);

export const chapterTags = sqliteTable(
  "chapter_tags",
  {
    chapterId: text("chapter_id")
      .notNull()
      .references(() => chapters.id),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id),
    source: text("source", { enum: ["scan", "metadata", "manual"] }).notNull().default("manual"),
    ...timestamps,
  },
  (table) => ({
    pk: primaryKey({ columns: [table.chapterId, table.tagId] }),
    tagIdx: index("chapter_tags_tag_idx").on(table.tagId),
  }),
);

export const readingProgress = sqliteTable(
  "reading_progress",
  {
    id: text("id").primaryKey(),
    comicId: text("comic_id")
      .notNull()
      .references(() => comics.id),
    chapterId: text("chapter_id")
      .notNull()
      .references(() => chapters.id),
    pageId: text("page_id")
      .notNull()
      .references(() => pages.id),
    pageNumber: integer("page_number").notNull(),
    progressPercent: integer("progress_percent").notNull().default(0),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => ({
    comicIdx: uniqueIndex("reading_progress_comic_idx").on(table.comicId),
    chapterIdx: index("reading_progress_chapter_idx").on(table.chapterId),
  }),
);

export const comicSources = sqliteTable(
  "comic_sources",
  {
    id: text("id").primaryKey(),
    comicId: text("comic_id")
      .notNull()
      .references(() => comics.id),
    site: text("site").notNull(),
    sourceId: text("source_id"),
    sourceUrl: text("source_url").notNull(),
    originalTitle: text("original_title"),
    coverUrl: text("cover_url"),
    rawMetadataJson: text("raw_metadata_json"),
    ...timestamps,
  },
  (table) => ({
    comicIdx: index("comic_sources_comic_idx").on(table.comicId),
    sourceIdx: uniqueIndex("comic_sources_site_source_idx").on(table.site, table.sourceId),
  }),
);

export const comicResources = sqliteTable(
  "comic_resources",
  {
    id: text("id").primaryKey(),
    comicId: text("comic_id")
      .notNull()
      .references(() => comics.id),
    comicSourceId: text("comic_source_id").references(() => comicSources.id),
    resourceType: text("resource_type", { enum: ["magnet", "torrent", "http", "openlist"] }).notNull(),
    displayLabel: text("display_label"),
    resourceUrl: text("resource_url"),
    redactedResource: text("redacted_resource"),
    ...timestamps,
  },
  (table) => ({
    comicIdx: index("comic_resources_comic_idx").on(table.comicId),
    sourceIdx: index("comic_resources_source_idx").on(table.comicSourceId),
  }),
);

export const downloadTasks = sqliteTable(
  "download_tasks",
  {
    id: text("id").primaryKey(),
    comicResourceId: text("comic_resource_id").references(() => comicResources.id),
    provider: text("provider").notNull(),
    status: text("status", { enum: ["queued", "running", "failed", "completed", "cancel_requested", "canceled"] })
      .notNull()
      .default("queued"),
    targetDirectory: text("target_directory"),
    errorMessage: text("error_message"),
    retryCount: integer("retry_count").notNull().default(0),
    ...timestamps,
  },
  (table) => ({
    statusIdx: index("download_tasks_status_idx").on(table.status),
    resourceIdx: index("download_tasks_resource_idx").on(table.comicResourceId),
  }),
);

export const mediaAssets = sqliteTable(
  "media_assets",
  {
    id: text("id").primaryKey(),
    comicId: text("comic_id").references(() => comics.id),
    chapterId: text("chapter_id").references(() => chapters.id),
    pageId: text("page_id").references(() => pages.id),
    use: text("use", { enum: mediaAssetUses }).notNull(),
    cacheKey: text("cache_key").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    filePath: text("file_path").notNull(),
    sizeBytes: integer("size_bytes"),
    lastAccessAt: text("last_access_at"),
    expiresAt: text("expires_at"),
    ...timestamps,
  },
  (table) => ({
    cacheKeyIdx: uniqueIndex("media_assets_cache_key_idx").on(table.cacheKey),
    comicIdx: index("media_assets_comic_idx").on(table.comicId),
    pageIdx: index("media_assets_page_idx").on(table.pageId),
    lastAccessIdx: index("media_assets_last_access_idx").on(table.lastAccessAt),
  }),
);

export const cacheEntries = sqliteTable(
  "cache_entries",
  {
    id: text("id").primaryKey(),
    kind: text("kind", { enum: cacheEntryKinds }).notNull(),
    cacheKey: text("cache_key").notNull(),
    localFileId: text("local_file_id").references(() => localFiles.id),
    filePath: text("file_path"),
    metadataJson: text("metadata_json"),
    sizeBytes: integer("size_bytes"),
    lastAccessAt: text("last_access_at"),
    expiresAt: text("expires_at"),
    ...timestamps,
  },
  (table) => ({
    cacheKeyIdx: uniqueIndex("cache_entries_cache_key_idx").on(table.cacheKey),
    localFileIdx: index("cache_entries_local_file_idx").on(table.localFileId),
    lastAccessIdx: index("cache_entries_last_access_idx").on(table.lastAccessAt),
  }),
);

export const operationLogs = sqliteTable(
  "operation_logs",
  {
    id: text("id").primaryKey(),
    operation: text("operation", {
      enum: ["hide", "soft_delete", "restore", "path_repair", "merge_chapter", "switch_primary_file", "cache_cleanup"],
    }).notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    summary: text("summary").notNull(),
    detailJson: text("detail_json"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => ({
    targetIdx: index("operation_logs_target_idx").on(table.targetType, table.targetId),
    operationIdx: index("operation_logs_operation_idx").on(table.operation),
  }),
);
