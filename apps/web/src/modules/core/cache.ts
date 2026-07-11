import { asc, eq, lt, sql } from "drizzle-orm";

import { getRuntimeSettings } from "@/modules/core/settings";
import { bootstrapDatabase, cacheEntries, getDb, mediaAssets } from "@/modules/core/db";

export interface CacheSummary {
  mediaAssetCount: number;
  archiveFileListCount: number;
  maxSizeBytes: number;
  totalSizeBytes: number;
  mediaAssetSizeBytes: number;
  archiveFileListSizeBytes: number;
  expiredCount: number;
  oldestLastAccessAt: string | null;
}

export async function getCacheSummary(): Promise<CacheSummary> {
  bootstrapDatabase();

  const db = getDb();
  const runtimeSettings = await getRuntimeSettings();

  const mediaAssetCountRow = db
    .select({ count: sql<number>`count(*)` })
    .from(mediaAssets)
    .get();

  const mediaAssetSizeRow = db
    .select({ total: sql<number>`coalesce(sum(size_bytes), 0)` })
    .from(mediaAssets)
    .get();

  const archiveCountRow = db
    .select({ count: sql<number>`count(*)` })
    .from(cacheEntries)
    .where(eq(cacheEntries.kind, "archive_file_list"))
    .get();

  const archiveSizeRow = db
    .select({ total: sql<number>`coalesce(sum(size_bytes), 0)` })
    .from(cacheEntries)
    .where(eq(cacheEntries.kind, "archive_file_list"))
    .get();

  const now = new Date().toISOString();
  const expiredRow = db
    .select({ count: sql<number>`count(*)` })
    .from(cacheEntries)
    .where(lt(cacheEntries.expiresAt, now))
    .get();

  const oldestRow = db
    .select({ lastAccessAt: cacheEntries.lastAccessAt })
    .from(cacheEntries)
    .orderBy(asc(cacheEntries.lastAccessAt))
    .limit(1)
    .get();

  return {
    mediaAssetCount: Number(mediaAssetCountRow?.count ?? 0),
    archiveFileListCount: Number(archiveCountRow?.count ?? 0),
    maxSizeBytes: runtimeSettings.cacheSizeMb * 1024 * 1024,
    totalSizeBytes: Number(mediaAssetSizeRow?.total ?? 0),
    mediaAssetSizeBytes: Number(mediaAssetSizeRow?.total ?? 0),
    archiveFileListSizeBytes: Number(archiveSizeRow?.total ?? 0),
    expiredCount: Number(expiredRow?.count ?? 0),
    oldestLastAccessAt: oldestRow?.lastAccessAt ?? null,
  };
}

export async function cleanupApplicationCache(): Promise<{ removedCount: number }> {
  bootstrapDatabase();

  const db = getDb();
  const now = new Date().toISOString();

  const expired = db
    .select({ id: cacheEntries.id })
    .from(cacheEntries)
    .where(lt(cacheEntries.expiresAt, now))
    .all();

  for (const entry of expired) {
    db.delete(cacheEntries).where(eq(cacheEntries.id, entry.id)).run();
  }

  return { removedCount: expired.length };
}
