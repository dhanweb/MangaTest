import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

import * as schema from "./schema";

const DEFAULT_DB_PATH = path.join(process.cwd(), ".data", "mangatest.sqlite");

let sqlite: Database.Database | null = null;

export function getDatabasePath() {
  return process.env.MANGATEST_DB_PATH || DEFAULT_DB_PATH;
}

export function getSqlite() {
  if (!sqlite) {
    const dbPath = getDatabasePath();
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    sqlite = new Database(dbPath);
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");
  }

  return sqlite;
}

export function getDb() {
  return drizzle(getSqlite(), { schema });
}
