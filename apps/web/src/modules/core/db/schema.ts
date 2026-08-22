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

export const videoStatuses = ["readable", "missing_local_file", "hidden", "deleted"] as const;

export const localFileKinds = ["directory", "zip", "cbz"] as const;
export const mangaRootScanModes = ["children_as_comics"] as const;
export const videoRootScanModes = ["children_as_videos"] as const;
export const videoFileKinds = ["file", "directory_episode"] as const;
export const videoFileExtensions = ["mp4", "mkv", "avi", "mov", "webm", "m4v", "ts"] as const;
export const pageSourceKinds = ["filesystem", "archive"] as const;
export const mediaAssetUses = ["cover", "list_thumbnail", "reader_thumbnail"] as const;
export const cacheEntryKinds = ["archive_file_list", "page_image"] as const;
export const cloudScanEntryKinds = ["file", "directory"] as const;
export const cloudScanStatuses = ["running", "completed", "failed"] as const;
export const downloadFinalizationStatuses = ["completed", "failed"] as const;
export const downloadPreparationStatuses = ["ready", "blocked"] as const;
export const downloadTransferStatuses = ["running", "completed", "failed"] as const;
export const collectionKinds = ["collection", "queue"] as const;
export const collectionSortModes = ["manual", "recent_added", "title"] as const;

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  valueType: text("value_type", { enum: ["string", "number", "boolean", "json"] })
    .notNull()
    .default("string"),
  ...timestamps,
});

export const mangaRootKinds = ["user", "system"] as const;

export const mangaRoots = sqliteTable(
  "manga_roots",
  {
    id: text("id").primaryKey(),
    absolutePath: text("absolute_path").notNull(),
    displayName: text("display_name"),
    scanMode: text("scan_mode", { enum: mangaRootScanModes }).notNull().default("children_as_comics"),
    kind: text("kind", { enum: mangaRootKinds }).notNull().default("user"),
    isEnabled: integer("is_enabled", { mode: "boolean" }).notNull().default(true),
    lastScanSessionId: text("last_scan_session_id"),
    ...timestamps,
  },
  (table) => ({
    pathIdx: uniqueIndex("manga_roots_absolute_path_idx").on(table.absolutePath),
  }),
);

export const videoRoots = sqliteTable(
  "video_roots",
  {
    id: text("id").primaryKey(),
    absolutePath: text("absolute_path").notNull(),
    displayName: text("display_name"),
    scanMode: text("scan_mode", { enum: videoRootScanModes }).notNull().default("children_as_videos"),
    isEnabled: integer("is_enabled", { mode: "boolean" }).notNull().default(true),
    lastScanAt: text("last_scan_at"),
    ...timestamps,
  },
  (table) => ({
    pathIdx: uniqueIndex("video_roots_absolute_path_idx").on(table.absolutePath),
  }),
);

export const videos = sqliteTable(
  "videos",
  {
    id: text("id").primaryKey(),
    videoRootId: text("video_root_id")
      .notNull()
      .references(() => videoRoots.id),
    sourceKey: text("source_key").notNull(),
    displayTitle: text("display_title").notNull(),
    fileTitle: text("file_title").notNull(),
    sortTitle: text("sort_title").notNull(),
    status: text("status", { enum: videoStatuses }).notNull().default("readable"),
    lastWatchedEpisodeId: text("last_watched_episode_id"),
    lastWatchedPositionSeconds: integer("last_watched_position_seconds"),
    lastWatchedAt: text("last_watched_at"),
    hiddenAt: text("hidden_at"),
    deletedAt: text("deleted_at"),
    ...timestamps,
  },
  (table) => ({
    statusIdx: index("videos_status_idx").on(table.status),
    sortTitleIdx: index("videos_sort_title_idx").on(table.sortTitle),
    rootSourceIdx: uniqueIndex("videos_root_source_idx").on(table.videoRootId, table.sourceKey),
  }),
);

export const videoEpisodes = sqliteTable(
  "video_episodes",
  {
    id: text("id").primaryKey(),
    videoId: text("video_id")
      .notNull()
      .references(() => videos.id),
    videoRootId: text("video_root_id")
      .notNull()
      .references(() => videoRoots.id),
    title: text("title").notNull(),
    sortTitle: text("sort_title").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    absolutePath: text("absolute_path").notNull(),
    relativePath: text("relative_path").notNull(),
    extension: text("extension").notNull(),
    kind: text("kind", { enum: videoFileKinds }).notNull().default("file"),
    sizeBytes: integer("size_bytes"),
    mtimeMs: integer("mtime_ms"),
    durationSeconds: integer("duration_seconds"),
    isMissing: integer("is_missing", { mode: "boolean" }).notNull().default(false),
    missingSince: text("missing_since"),
    ...timestamps,
  },
  (table) => ({
    videoOrderIdx: index("video_episodes_video_order_idx").on(table.videoId, table.sortOrder),
    rootPathIdx: uniqueIndex("video_episodes_root_relative_path_idx").on(table.videoRootId, table.relativePath),
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
    isIgnored: integer("is_ignored", { mode: "boolean" }).notNull().default(false),
    ignoredAt: text("ignored_at"),
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

export const videoTags = sqliteTable(
  "video_tags",
  {
    videoId: text("video_id")
      .notNull()
      .references(() => videos.id),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id),
    source: text("source", { enum: ["scan", "metadata", "manual"] }).notNull().default("manual"),
    isUserEdited: integer("is_user_edited", { mode: "boolean" }).notNull().default(false),
    ...timestamps,
  },
  (table) => ({
    pk: primaryKey({ columns: [table.videoId, table.tagId] }),
    tagIdx: index("video_tags_tag_idx").on(table.tagId),
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

export const videoProgress = sqliteTable(
  "video_progress",
  {
    id: text("id").primaryKey(),
    videoId: text("video_id")
      .notNull()
      .references(() => videos.id),
    episodeId: text("episode_id")
      .notNull()
      .references(() => videoEpisodes.id),
    positionSeconds: integer("position_seconds").notNull().default(0),
    progressPercent: integer("progress_percent").notNull().default(0),
    isCompleted: integer("is_completed", { mode: "boolean" }).notNull().default(false),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => ({
    videoEpisodeIdx: uniqueIndex("video_progress_video_episode_idx").on(table.videoId, table.episodeId),
    videoIdx: index("video_progress_video_idx").on(table.videoId),
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

export const videoSources = sqliteTable(
  "video_sources",
  {
    id: text("id").primaryKey(),
    videoId: text("video_id")
      .notNull()
      .references(() => videos.id),
    site: text("site").notNull(),
    sourceId: text("source_id"),
    sourceUrl: text("source_url").notNull(),
    originalTitle: text("original_title"),
    coverUrl: text("cover_url"),
    rawMetadataJson: text("raw_metadata_json"),
    ...timestamps,
  },
  (table) => ({
    videoIdx: index("video_sources_video_idx").on(table.videoId),
    sourceIdx: uniqueIndex("video_sources_site_source_idx").on(table.site, table.sourceId),
  }),
);

export const videoResources = sqliteTable(
  "video_resources",
  {
    id: text("id").primaryKey(),
    videoId: text("video_id").references(() => videos.id),
    videoSourceId: text("video_source_id").references(() => videoSources.id),
    resourceType: text("resource_type", { enum: ["http", "torrent", "magnet", "openlist"] }).notNull(),
    displayLabel: text("display_label"),
    resourceUrl: text("resource_url"),
    redactedResource: text("redacted_resource"),
    ...timestamps,
  },
  (table) => ({
    videoIdx: index("video_resources_video_idx").on(table.videoId),
    sourceIdx: index("video_resources_source_idx").on(table.videoSourceId),
  }),
);

export const downloadTaskStatuses = ["queued", "submitted", "downloading", "running", "failed", "completed", "cancel_requested", "canceled"] as const;
export const downloadTaskTypes = ["offline", "transfer"] as const;

export const downloadTasks = sqliteTable(
  "download_tasks",
  {
    id: text("id").primaryKey(),
    comicResourceId: text("comic_resource_id").references(() => comicResources.id),
    videoResourceId: text("video_resource_id").references(() => videoResources.id),
    mediaType: text("media_type", { enum: ["comic", "video"] }).notNull().default("comic"),
    provider: text("provider").notNull(),
    status: text("status", { enum: downloadTaskStatuses })
      .notNull()
      .default("queued"),
    taskType: text("task_type", { enum: downloadTaskTypes })
      .notNull()
      .default("transfer"),
    offlineTaskId: text("offline_task_id"),
    remoteTaskId: text("remote_task_id"),
    remotePath: text("remote_path"),
    targetDirectory: text("target_directory"),
    errorMessage: text("error_message"),
    retryCount: integer("retry_count").notNull().default(0),
    ...timestamps,
  },
  (table) => ({
    statusIdx: index("download_tasks_status_idx").on(table.status),
    resourceIdx: index("download_tasks_resource_idx").on(table.comicResourceId),
    videoResourceIdx: index("download_tasks_video_resource_idx").on(table.videoResourceId),
    mediaTypeIdx: index("download_tasks_media_type_idx").on(table.mediaType),
    typeIdx: index("download_tasks_type_idx").on(table.taskType),
    offlineTaskIdx: index("download_tasks_offline_task_idx").on(table.offlineTaskId),
  }),
);

export const downloadTaskPreparations = sqliteTable(
  "download_task_preparations",
  {
    id: text("id").primaryKey(),
    downloadTaskId: text("download_task_id")
      .notNull()
      .references(() => downloadTasks.id),
    comicResourceId: text("comic_resource_id").references(() => comicResources.id),
    provider: text("provider").notNull(),
    status: text("status", { enum: downloadPreparationStatuses }).notNull(),
    remotePath: text("remote_path"),
    remoteName: text("remote_name"),
    sizeBytes: integer("size_bytes"),
    remoteProvider: text("remote_provider"),
    rawUrlAvailable: integer("raw_url_available", { mode: "boolean" }).notNull().default(false),
    preparedAt: text("prepared_at").notNull(),
    errorMessage: text("error_message"),
    ...timestamps,
  },
  (table) => ({
    providerStatusIdx: index("download_task_preparations_provider_status_idx").on(table.provider, table.status),
    resourceIdx: index("download_task_preparations_resource_idx").on(table.comicResourceId),
    taskIdx: uniqueIndex("download_task_preparations_task_idx").on(table.downloadTaskId),
  }),
);

export const downloadTaskTransfers = sqliteTable(
  "download_task_transfers",
  {
    id: text("id").primaryKey(),
    downloadTaskId: text("download_task_id")
      .notNull()
      .references(() => downloadTasks.id),
    comicResourceId: text("comic_resource_id").references(() => comicResources.id),
    provider: text("provider").notNull(),
    status: text("status", { enum: downloadTransferStatuses }).notNull(),
    tempFilePath: text("temp_file_path"),
    fileName: text("file_name"),
    sizeBytes: integer("size_bytes"),
    bytesWritten: integer("bytes_written").notNull().default(0),
    contentType: text("content_type"),
    startedAt: text("started_at").notNull(),
    finishedAt: text("finished_at"),
    errorMessage: text("error_message"),
    ...timestamps,
  },
  (table) => ({
    providerStatusIdx: index("download_task_transfers_provider_status_idx").on(table.provider, table.status),
    resourceIdx: index("download_task_transfers_resource_idx").on(table.comicResourceId),
    taskIdx: uniqueIndex("download_task_transfers_task_idx").on(table.downloadTaskId),
  }),
);

export const downloadTaskFinalizations = sqliteTable(
  "download_task_finalizations",
  {
    id: text("id").primaryKey(),
    downloadTaskId: text("download_task_id")
      .notNull()
      .references(() => downloadTasks.id),
    comicResourceId: text("comic_resource_id").references(() => comicResources.id),
    provider: text("provider").notNull(),
    status: text("status", { enum: downloadFinalizationStatuses }).notNull(),
    mangaRootId: text("manga_root_id").references(() => mangaRoots.id),
    finalPath: text("final_path"),
    scanSessionId: text("scan_session_id").references(() => scanSessions.id),
    errorMessage: text("error_message"),
    finalizedAt: text("finalized_at").notNull(),
    ...timestamps,
  },
  (table) => ({
    providerStatusIdx: index("download_task_finalizations_provider_status_idx").on(table.provider, table.status),
    resourceIdx: index("download_task_finalizations_resource_idx").on(table.comicResourceId),
    taskIdx: uniqueIndex("download_task_finalizations_task_idx").on(table.downloadTaskId),
  }),
);

export const cloudScanSessions = sqliteTable(
  "cloud_scan_sessions",
  {
    id: text("id").primaryKey(),
    provider: text("provider").notNull(),
    comicResourceId: text("comic_resource_id").references(() => comicResources.id),
    rootPath: text("root_path").notNull(),
    status: text("status", { enum: cloudScanStatuses }).notNull().default("running"),
    startedAt: text("started_at").notNull(),
    finishedAt: text("finished_at"),
    totalCount: integer("total_count").notNull().default(0),
    fileCount: integer("file_count").notNull().default(0),
    directoryCount: integer("directory_count").notNull().default(0),
    importableFileCount: integer("importable_file_count").notNull().default(0),
    errorSummary: text("error_summary"),
    ...timestamps,
  },
  (table) => ({
    providerRootIdx: index("cloud_scan_sessions_provider_root_idx").on(table.provider, table.rootPath),
    resourceIdx: index("cloud_scan_sessions_resource_idx").on(table.comicResourceId),
    statusIdx: index("cloud_scan_sessions_status_idx").on(table.status),
  }),
);

export const cloudScanEntries = sqliteTable(
  "cloud_scan_entries",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => cloudScanSessions.id),
    provider: text("provider").notNull(),
    remotePath: text("remote_path").notNull(),
    parentPath: text("parent_path").notNull(),
    name: text("name").notNull(),
    kind: text("kind", { enum: cloudScanEntryKinds }).notNull(),
    depth: integer("depth").notNull().default(1),
    sizeBytes: integer("size_bytes"),
    modifiedAt: text("modified_at"),
    remoteProvider: text("remote_provider"),
    rawUrlAvailable: integer("raw_url_available", { mode: "boolean" }).notNull().default(false),
    ...timestamps,
  },
  (table) => ({
    sessionIdx: index("cloud_scan_entries_session_idx").on(table.sessionId),
    remotePathIdx: index("cloud_scan_entries_remote_path_idx").on(table.provider, table.remotePath),
  }),
);

/** Flat OpenList library root index for 10008 duplicate offline recovery. */
export const openlistLibraryIndexStatuses = ["running", "completed", "failed"] as const;
export const openlistLibraryIndexEntryKinds = ["file", "directory"] as const;

export const openlistLibraryIndexSessions = sqliteTable(
  "openlist_library_index_sessions",
  {
    id: text("id").primaryKey(),
    provider: text("provider").notNull().default("openlist"),
    rootPath: text("root_path").notNull(),
    status: text("status", { enum: openlistLibraryIndexStatuses }).notNull().default("running"),
    startedAt: text("started_at").notNull(),
    finishedAt: text("finished_at"),
    totalCount: integer("total_count").notNull().default(0),
    fileCount: integer("file_count").notNull().default(0),
    directoryCount: integer("directory_count").notNull().default(0),
    archiveCount: integer("archive_count").notNull().default(0),
    listCallCount: integer("list_call_count").notNull().default(0),
    errorSummary: text("error_summary"),
    ...timestamps,
  },
  (table) => ({
    providerRootIdx: index("openlist_library_index_sessions_provider_root_idx").on(table.provider, table.rootPath),
    statusIdx: index("openlist_library_index_sessions_status_idx").on(table.status),
  }),
);

export const openlistLibraryIndexEntries = sqliteTable(
  "openlist_library_index_entries",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => openlistLibraryIndexSessions.id),
    remotePath: text("remote_path").notNull(),
    parentPath: text("parent_path").notNull(),
    name: text("name").notNull(),
    kind: text("kind", { enum: openlistLibraryIndexEntryKinds }).notNull(),
    depth: integer("depth").notNull().default(1),
    sizeBytes: integer("size_bytes"),
    ...timestamps,
  },
  (table) => ({
    sessionIdx: index("openlist_library_index_entries_session_idx").on(table.sessionId),
    remotePathIdx: index("openlist_library_index_entries_remote_path_idx").on(table.remotePath),
    parentIdx: index("openlist_library_index_entries_parent_idx").on(table.parentPath),
  }),
);

export const mediaAssets = sqliteTable(
  "media_assets",
  {
    id: text("id").primaryKey(),
    comicId: text("comic_id").references(() => comics.id),
    chapterId: text("chapter_id").references(() => chapters.id),
    pageId: text("page_id").references(() => pages.id),
    videoId: text("video_id").references(() => videos.id),
    videoEpisodeId: text("video_episode_id").references(() => videoEpisodes.id),
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
    videoIdx: index("media_assets_video_idx").on(table.videoId),
    videoEpisodeIdx: index("media_assets_video_episode_idx").on(table.videoEpisodeId),
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
      enum: [
        "hide",
        "soft_delete",
        "restore",
        "path_repair",
        "merge_chapter",
        "switch_primary_file",
        "cache_cleanup",
        "download_task_create",
        "download_task_cancel",
        "download_task_retry",
        "download_task_pull_back",
        "collection_create",
        "collection_update",
        "collection_delete",
        "collection_add_comic",
        "collection_remove_comic",
        "collection_reorder",
        "ignore_file_issue",
        "data_reset",
        "system_root_relocate",
      ],
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

export const collections = sqliteTable(
  "collections",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    kind: text("kind", { enum: collectionKinds }).notNull().default("collection"),
    sortMode: text("sort_mode", { enum: collectionSortModes }).notNull().default("manual"),
    isEnabled: integer("is_enabled", { mode: "boolean" }).notNull().default(true),
    ...timestamps,
  },
  (table) => ({
    kindIdx: index("collections_kind_idx").on(table.kind),
    enabledIdx: index("collections_enabled_idx").on(table.isEnabled),
  }),
);

export const collectionComics = sqliteTable(
  "collection_comics",
  {
    collectionId: text("collection_id")
      .notNull()
      .references(() => collections.id),
    comicId: text("comic_id")
      .notNull()
      .references(() => comics.id),
    sortOrder: integer("sort_order").notNull().default(0),
    addedAt: text("added_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    ...timestamps,
  },
  (table) => ({
    pk: primaryKey({ columns: [table.collectionId, table.comicId] }),
    collectionSortIdx: index("collection_comics_collection_sort_idx").on(table.collectionId, table.sortOrder),
    comicIdx: index("collection_comics_comic_idx").on(table.comicId),
  }),
);
