import { desc, eq, sql } from "drizzle-orm";

import { getCacheSummary, type CacheSummary } from "@/modules/core/cache";
import { bootstrapDatabase, comics, getDb, localFiles, operationLogs, scanSessions } from "@/modules/core/db";
import { createDuplicateCandidateRepository } from "@/modules/library";

export interface AdminHealthSummary {
  scanStatus: string;
  missingFiles: number;
  duplicateCandidates: number;
  cacheSizeBytes: number;
  cache: CacheSummary;
  readableComics: number;
  localFiles: number;
  recentDangerousOperations: number;
  recentOperations: AdminOperationLogRecord[];
  latestScanFinishedAt: string | null;
  latestScanError: string | null;
}

export interface AdminOperationLogRecord {
  id: string;
  operation: string;
  targetType: string;
  targetId: string;
  summary: string;
  createdAt: string;
}

export async function getAdminHealthSummary(): Promise<AdminHealthSummary> {
  bootstrapDatabase();

  const db = getDb();
  const [cache, duplicateGroups, latestScan, missingRow, readableRow, localFileRow, operationRow, recentOperations] = await Promise.all([
    getCacheSummary(),
    createDuplicateCandidateRepository().listGroups(),
    Promise.resolve(db.select().from(scanSessions).orderBy(desc(scanSessions.createdAt)).limit(1).get()),
    Promise.resolve(db.select({ count: sql<number>`count(*)` }).from(localFiles).where(eq(localFiles.isMissing, true)).get()),
    Promise.resolve(db.select({ count: sql<number>`count(*)` }).from(comics).where(eq(comics.status, "readable")).get()),
    Promise.resolve(db.select({ count: sql<number>`count(*)` }).from(localFiles).get()),
    Promise.resolve(db.select({ count: sql<number>`count(*)` }).from(operationLogs).get()),
    Promise.resolve(
      db
        .select({
          id: operationLogs.id,
          operation: operationLogs.operation,
          targetType: operationLogs.targetType,
          targetId: operationLogs.targetId,
          summary: operationLogs.summary,
          createdAt: operationLogs.createdAt,
        })
        .from(operationLogs)
        .orderBy(desc(operationLogs.createdAt))
        .limit(5)
        .all(),
    ),
  ]);

  return {
    scanStatus: latestScan?.status ?? "never_scanned",
    missingFiles: Number(missingRow?.count ?? 0),
    duplicateCandidates: duplicateGroups.length,
    cacheSizeBytes: cache.totalSizeBytes,
    cache,
    readableComics: Number(readableRow?.count ?? 0),
    localFiles: Number(localFileRow?.count ?? 0),
    recentDangerousOperations: Number(operationRow?.count ?? 0),
    recentOperations,
    latestScanFinishedAt: latestScan?.finishedAt ?? null,
    latestScanError: latestScan?.errorSummary ?? null,
  };
}
