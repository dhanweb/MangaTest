import { desc, eq, sql } from "drizzle-orm";

import { getCacheSummary, type CacheSummary } from "@/modules/core/cache";
import { bootstrapDatabase, comics, getDb, localFiles, operationLogs, scanSessions } from "@/modules/core/db";

export interface AdminHealthSummary {
  scanStatus: string;
  missingFiles: number;
  duplicateCandidates: number;
  cacheSizeBytes: number;
  cache: CacheSummary;
  readableComics: number;
  localFiles: number;
  recentDangerousOperations: number;
  latestScanFinishedAt: string | null;
  latestScanError: string | null;
}

export async function getAdminHealthSummary(): Promise<AdminHealthSummary> {
  bootstrapDatabase();

  const db = getDb();
  const [cache, latestScan, missingRow, readableRow, localFileRow, operationRow] = await Promise.all([
    getCacheSummary(),
    Promise.resolve(db.select().from(scanSessions).orderBy(desc(scanSessions.createdAt)).limit(1).get()),
    Promise.resolve(db.select({ count: sql<number>`count(*)` }).from(localFiles).where(eq(localFiles.isMissing, true)).get()),
    Promise.resolve(db.select({ count: sql<number>`count(*)` }).from(comics).where(eq(comics.status, "readable")).get()),
    Promise.resolve(db.select({ count: sql<number>`count(*)` }).from(localFiles).get()),
    Promise.resolve(db.select({ count: sql<number>`count(*)` }).from(operationLogs).get()),
  ]);

  return {
    scanStatus: latestScan?.status ?? "never_scanned",
    missingFiles: Number(missingRow?.count ?? 0),
    duplicateCandidates: latestScan?.duplicateCandidateCount ?? 0,
    cacheSizeBytes: cache.totalSizeBytes,
    cache,
    readableComics: Number(readableRow?.count ?? 0),
    localFiles: Number(localFileRow?.count ?? 0),
    recentDangerousOperations: Number(operationRow?.count ?? 0),
    latestScanFinishedAt: latestScan?.finishedAt ?? null,
    latestScanError: latestScan?.errorSummary ?? null,
  };
}
