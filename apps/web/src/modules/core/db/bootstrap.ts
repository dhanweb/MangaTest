import { getSqlite } from "./client";

let bootstrapped = false;

export function bootstrapDatabase() {
  if (bootstrapped) {
    return;
  }

  const sqlite = getSqlite();

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS manga_roots (
      id TEXT PRIMARY KEY NOT NULL,
      absolute_path TEXT NOT NULL,
      display_name TEXT,
      scan_mode TEXT NOT NULL DEFAULT 'children_as_comics',
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
  `);

  bootstrapped = true;
}
