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
  `);

  bootstrapped = true;
}
