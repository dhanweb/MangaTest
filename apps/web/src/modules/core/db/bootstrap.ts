import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";

import { getSqlite } from "./client";

let bootstrapped = false;

export function bootstrapDatabase() {
  if (bootstrapped) {
    return;
  }

  const sqlite = getSqlite();

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL,
      value_type TEXT NOT NULL DEFAULT 'string',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS manga_roots (
      id TEXT PRIMARY KEY NOT NULL,
      absolute_path TEXT NOT NULL,
      display_name TEXT,
      scan_mode TEXT NOT NULL DEFAULT 'children_as_comics',
      kind TEXT NOT NULL DEFAULT 'user',
      is_enabled INTEGER NOT NULL DEFAULT 1,
      last_scan_session_id TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS manga_roots_absolute_path_idx
      ON manga_roots (absolute_path);

    CREATE TABLE IF NOT EXISTS scan_sessions (
      id TEXT PRIMARY KEY NOT NULL,
      manga_root_id TEXT REFERENCES manga_roots(id),
      status TEXT NOT NULL DEFAULT 'queued',
      started_at TEXT,
      finished_at TEXT,
      added_count INTEGER NOT NULL DEFAULT 0,
      missing_count INTEGER NOT NULL DEFAULT 0,
      duplicate_candidate_count INTEGER NOT NULL DEFAULT 0,
      recoverable_count INTEGER NOT NULL DEFAULT 0,
      error_summary TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE INDEX IF NOT EXISTS scan_sessions_root_idx
      ON scan_sessions (manga_root_id);

    CREATE INDEX IF NOT EXISTS scan_sessions_status_idx
      ON scan_sessions (status);

    CREATE TABLE IF NOT EXISTS comics (
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
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE INDEX IF NOT EXISTS comics_status_idx
      ON comics (status);

    CREATE INDEX IF NOT EXISTS comics_sort_title_idx
      ON comics (sort_title);

    CREATE INDEX IF NOT EXISTS comics_parent_idx
      ON comics (parent_comic_id);

    CREATE TABLE IF NOT EXISTS local_files (
      id TEXT PRIMARY KEY NOT NULL,
      comic_id TEXT REFERENCES comics(id),
      manga_root_id TEXT REFERENCES manga_roots(id),
      kind TEXT NOT NULL,
      absolute_path TEXT NOT NULL,
      relative_path TEXT NOT NULL,
      size_bytes INTEGER,
      mtime_ms INTEGER,
      content_hash TEXT,
      is_primary INTEGER NOT NULL DEFAULT 0,
      is_missing INTEGER NOT NULL DEFAULT 0,
      missing_since TEXT,
      is_ignored INTEGER NOT NULL DEFAULT 0,
      ignored_at TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE INDEX IF NOT EXISTS local_files_comic_idx
      ON local_files (comic_id);

    CREATE UNIQUE INDEX IF NOT EXISTS local_files_root_relative_path_idx
      ON local_files (manga_root_id, relative_path);

    CREATE INDEX IF NOT EXISTS local_files_hash_idx
      ON local_files (content_hash);

    CREATE TABLE IF NOT EXISTS chapters (
      id TEXT PRIMARY KEY NOT NULL,
      comic_id TEXT NOT NULL REFERENCES comics(id),
      local_file_id TEXT REFERENCES local_files(id),
      title TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      page_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE INDEX IF NOT EXISTS chapters_comic_order_idx
      ON chapters (comic_id, sort_order);

    CREATE TABLE IF NOT EXISTS pages (
      id TEXT PRIMARY KEY NOT NULL,
      chapter_id TEXT NOT NULL REFERENCES chapters(id),
      local_file_id TEXT NOT NULL REFERENCES local_files(id),
      page_number INTEGER NOT NULL,
      source_kind TEXT NOT NULL,
      internal_path TEXT NOT NULL,
      archive_index INTEGER,
      width INTEGER,
      height INTEGER,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS pages_chapter_page_idx
      ON pages (chapter_id, page_number);

    CREATE INDEX IF NOT EXISTS pages_local_file_idx
      ON pages (local_file_id);

    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY NOT NULL,
      namespace TEXT NOT NULL,
      name TEXT NOT NULL,
      canonical TEXT NOT NULL,
      display_name_zh TEXT,
      aliases_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS tags_canonical_idx
      ON tags (canonical);

    CREATE INDEX IF NOT EXISTS tags_namespace_name_idx
      ON tags (namespace, name);

    CREATE TABLE IF NOT EXISTS comic_tags (
      comic_id TEXT NOT NULL REFERENCES comics(id),
      tag_id TEXT NOT NULL REFERENCES tags(id),
      source TEXT NOT NULL DEFAULT 'manual',
      is_user_edited INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      PRIMARY KEY (comic_id, tag_id)
    );

    CREATE INDEX IF NOT EXISTS comic_tags_tag_idx
      ON comic_tags (tag_id);

    CREATE TABLE IF NOT EXISTS chapter_tags (
      chapter_id TEXT NOT NULL REFERENCES chapters(id),
      tag_id TEXT NOT NULL REFERENCES tags(id),
      source TEXT NOT NULL DEFAULT 'manual',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      PRIMARY KEY (chapter_id, tag_id)
    );

    CREATE INDEX IF NOT EXISTS chapter_tags_tag_idx
      ON chapter_tags (tag_id);

    CREATE TABLE IF NOT EXISTS reading_progress (
      id TEXT PRIMARY KEY NOT NULL,
      comic_id TEXT NOT NULL REFERENCES comics(id),
      chapter_id TEXT NOT NULL REFERENCES chapters(id),
      page_id TEXT NOT NULL REFERENCES pages(id),
      page_number INTEGER NOT NULL,
      progress_percent INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS reading_progress_comic_idx
      ON reading_progress (comic_id);

    CREATE INDEX IF NOT EXISTS reading_progress_chapter_idx
      ON reading_progress (chapter_id);

    CREATE TABLE IF NOT EXISTS comic_sources (
      id TEXT PRIMARY KEY NOT NULL,
      comic_id TEXT NOT NULL REFERENCES comics(id),
      site TEXT NOT NULL,
      source_id TEXT,
      source_url TEXT NOT NULL,
      original_title TEXT,
      cover_url TEXT,
      raw_metadata_json TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE INDEX IF NOT EXISTS comic_sources_comic_idx
      ON comic_sources (comic_id);

    CREATE UNIQUE INDEX IF NOT EXISTS comic_sources_site_source_idx
      ON comic_sources (site, source_id);

    CREATE TABLE IF NOT EXISTS comic_resources (
      id TEXT PRIMARY KEY NOT NULL,
      comic_id TEXT NOT NULL REFERENCES comics(id),
      comic_source_id TEXT REFERENCES comic_sources(id),
      resource_type TEXT NOT NULL,
      display_label TEXT,
      resource_url TEXT,
      redacted_resource TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE INDEX IF NOT EXISTS comic_resources_comic_idx
      ON comic_resources (comic_id);

    CREATE INDEX IF NOT EXISTS comic_resources_source_idx
      ON comic_resources (comic_source_id);

    CREATE TABLE IF NOT EXISTS download_tasks (
      id TEXT PRIMARY KEY NOT NULL,
      comic_resource_id TEXT REFERENCES comic_resources(id),
      provider TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      target_directory TEXT,
      error_message TEXT,
      retry_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE INDEX IF NOT EXISTS download_tasks_status_idx
      ON download_tasks (status);

    CREATE INDEX IF NOT EXISTS download_tasks_resource_idx
      ON download_tasks (comic_resource_id);

    CREATE TABLE IF NOT EXISTS download_task_preparations (
      id TEXT PRIMARY KEY NOT NULL,
      download_task_id TEXT NOT NULL REFERENCES download_tasks(id),
      comic_resource_id TEXT REFERENCES comic_resources(id),
      provider TEXT NOT NULL,
      status TEXT NOT NULL,
      remote_path TEXT,
      remote_name TEXT,
      size_bytes INTEGER,
      remote_provider TEXT,
      raw_url_available INTEGER NOT NULL DEFAULT 0,
      prepared_at TEXT NOT NULL,
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS download_task_preparations_task_idx
      ON download_task_preparations (download_task_id);

    CREATE INDEX IF NOT EXISTS download_task_preparations_resource_idx
      ON download_task_preparations (comic_resource_id);

    CREATE INDEX IF NOT EXISTS download_task_preparations_provider_status_idx
      ON download_task_preparations (provider, status);

    CREATE TABLE IF NOT EXISTS download_task_transfers (
      id TEXT PRIMARY KEY NOT NULL,
      download_task_id TEXT NOT NULL REFERENCES download_tasks(id),
      comic_resource_id TEXT REFERENCES comic_resources(id),
      provider TEXT NOT NULL,
      status TEXT NOT NULL,
      temp_file_path TEXT,
      file_name TEXT,
      size_bytes INTEGER,
      bytes_written INTEGER NOT NULL DEFAULT 0,
      content_type TEXT,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS download_task_transfers_task_idx
      ON download_task_transfers (download_task_id);

    CREATE INDEX IF NOT EXISTS download_task_transfers_resource_idx
      ON download_task_transfers (comic_resource_id);

    CREATE INDEX IF NOT EXISTS download_task_transfers_provider_status_idx
      ON download_task_transfers (provider, status);

    CREATE TABLE IF NOT EXISTS download_task_finalizations (
      id TEXT PRIMARY KEY NOT NULL,
      download_task_id TEXT NOT NULL REFERENCES download_tasks(id),
      comic_resource_id TEXT REFERENCES comic_resources(id),
      provider TEXT NOT NULL,
      status TEXT NOT NULL,
      manga_root_id TEXT REFERENCES manga_roots(id),
      final_path TEXT,
      scan_session_id TEXT REFERENCES scan_sessions(id),
      error_message TEXT,
      finalized_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS download_task_finalizations_task_idx
      ON download_task_finalizations (download_task_id);

    CREATE INDEX IF NOT EXISTS download_task_finalizations_resource_idx
      ON download_task_finalizations (comic_resource_id);

    CREATE INDEX IF NOT EXISTS download_task_finalizations_provider_status_idx
      ON download_task_finalizations (provider, status);

    CREATE TABLE IF NOT EXISTS cloud_scan_sessions (
      id TEXT PRIMARY KEY NOT NULL,
      provider TEXT NOT NULL,
      comic_resource_id TEXT REFERENCES comic_resources(id),
      root_path TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      started_at TEXT NOT NULL,
      finished_at TEXT,
      total_count INTEGER NOT NULL DEFAULT 0,
      file_count INTEGER NOT NULL DEFAULT 0,
      directory_count INTEGER NOT NULL DEFAULT 0,
      importable_file_count INTEGER NOT NULL DEFAULT 0,
      error_summary TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE INDEX IF NOT EXISTS cloud_scan_sessions_provider_root_idx
      ON cloud_scan_sessions (provider, root_path);

    CREATE INDEX IF NOT EXISTS cloud_scan_sessions_resource_idx
      ON cloud_scan_sessions (comic_resource_id);

    CREATE INDEX IF NOT EXISTS cloud_scan_sessions_status_idx
      ON cloud_scan_sessions (status);

    CREATE TABLE IF NOT EXISTS cloud_scan_entries (
      id TEXT PRIMARY KEY NOT NULL,
      session_id TEXT NOT NULL REFERENCES cloud_scan_sessions(id),
      provider TEXT NOT NULL,
      remote_path TEXT NOT NULL,
      parent_path TEXT NOT NULL,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      depth INTEGER NOT NULL DEFAULT 1,
      size_bytes INTEGER,
      modified_at TEXT,
      remote_provider TEXT,
      raw_url_available INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE INDEX IF NOT EXISTS cloud_scan_entries_session_idx
      ON cloud_scan_entries (session_id);

    CREATE INDEX IF NOT EXISTS cloud_scan_entries_remote_path_idx
      ON cloud_scan_entries (provider, remote_path);

    CREATE TABLE IF NOT EXISTS media_assets (
      id TEXT PRIMARY KEY NOT NULL,
      comic_id TEXT REFERENCES comics(id),
      chapter_id TEXT REFERENCES chapters(id),
      page_id TEXT REFERENCES pages(id),
      use TEXT NOT NULL,
      cache_key TEXT NOT NULL,
      width INTEGER NOT NULL,
      height INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      size_bytes INTEGER,
      last_access_at TEXT,
      expires_at TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS media_assets_cache_key_idx
      ON media_assets (cache_key);

    CREATE INDEX IF NOT EXISTS media_assets_comic_idx
      ON media_assets (comic_id);

    CREATE INDEX IF NOT EXISTS media_assets_page_idx
      ON media_assets (page_id);

    CREATE INDEX IF NOT EXISTS media_assets_last_access_idx
      ON media_assets (last_access_at);

    CREATE TABLE IF NOT EXISTS cache_entries (
      id TEXT PRIMARY KEY NOT NULL,
      kind TEXT NOT NULL,
      cache_key TEXT NOT NULL,
      local_file_id TEXT REFERENCES local_files(id),
      file_path TEXT,
      metadata_json TEXT,
      size_bytes INTEGER,
      last_access_at TEXT,
      expires_at TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS cache_entries_cache_key_idx
      ON cache_entries (cache_key);

    CREATE INDEX IF NOT EXISTS cache_entries_local_file_idx
      ON cache_entries (local_file_id);

    CREATE INDEX IF NOT EXISTS cache_entries_last_access_idx
      ON cache_entries (last_access_at);

    CREATE TABLE IF NOT EXISTS operation_logs (
      id TEXT PRIMARY KEY NOT NULL,
      operation TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      summary TEXT NOT NULL,
      detail_json TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE INDEX IF NOT EXISTS operation_logs_target_idx
      ON operation_logs (target_type, target_id);

    CREATE INDEX IF NOT EXISTS operation_logs_operation_idx
      ON operation_logs (operation);

    CREATE TABLE IF NOT EXISTS collections (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      kind TEXT NOT NULL DEFAULT 'collection',
      sort_mode TEXT NOT NULL DEFAULT 'manual',
      is_enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE INDEX IF NOT EXISTS collections_kind_idx
      ON collections (kind);

    CREATE INDEX IF NOT EXISTS collections_enabled_idx
      ON collections (is_enabled);

    CREATE TABLE IF NOT EXISTS collection_comics (
      collection_id TEXT NOT NULL REFERENCES collections(id),
      comic_id TEXT NOT NULL REFERENCES comics(id),
      sort_order INTEGER NOT NULL DEFAULT 0,
      added_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      PRIMARY KEY (collection_id, comic_id)
    );

    CREATE INDEX IF NOT EXISTS collection_comics_collection_sort_idx
      ON collection_comics (collection_id, sort_order);

    CREATE INDEX IF NOT EXISTS collection_comics_comic_idx
      ON collection_comics (comic_id);
  `);

  ensureColumn("local_files", "is_ignored", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("local_files", "ignored_at", "TEXT");
  ensureColumn("manga_roots", "kind", "TEXT NOT NULL DEFAULT 'user'");

  // Auto-create system manga root if it doesn't exist
  // Resolve to project root: process.cwd() is apps/web when run via workspace
  const isInAppsWeb = process.cwd().replace(/\\/g, "/").endsWith("/apps/web");
  const projectRoot = isInAppsWeb ? path.resolve(process.cwd(), "..") : process.cwd();
  const systemRootPath = path.resolve(projectRoot, "manga_store");
  const systemRootExists = sqlite.prepare("SELECT id FROM manga_roots WHERE kind = 'system'").get();
  if (!systemRootExists) {
    mkdirSync(systemRootPath, { recursive: true });
    const now = new Date().toISOString();
    sqlite.prepare(
      "INSERT OR IGNORE INTO manga_roots (id, absolute_path, display_name, scan_mode, kind, is_enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(randomUUID(), systemRootPath, "系统默认目录", "children_as_comics", "system", 1, now, now);
  }

  bootstrapped = true;
}

function ensureColumn(tableName: string, columnName: string, definition: string) {
  const sqlite = getSqlite();
  const columns = sqlite.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;

  if (columns.some((column) => column.name === columnName)) {
    return;
  }

  sqlite.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}
