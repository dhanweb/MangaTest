import { desc } from "drizzle-orm";

import { bootstrapDatabase, getDb } from "@/modules/core/db";
import { scanSessions } from "@/modules/core/db/schema";

import { createQueuedScanSession, type ScanSessionRecord } from "./scan-sessions";

export interface ScanSessionRepository {
  listRecent(limit?: number): Promise<ScanSessionRecord[]>;
  createQueued(mangaRootId: string): Promise<ScanSessionRecord>;
}

export function createScanSessionRepository(): ScanSessionRepository {
  return {
    async listRecent(limit = 8) {
      bootstrapDatabase();
      const db = getDb();
      const rows = db.select().from(scanSessions).orderBy(desc(scanSessions.createdAt)).limit(limit).all();

      return rows.map((row) => ({
        id: row.id,
        mangaRootId: row.mangaRootId ?? "",
        status: row.status,
        addedCount: row.addedCount,
        missingCount: row.missingCount,
        duplicateCandidateCount: row.duplicateCandidateCount,
        recoverableCount: row.recoverableCount,
      }));
    },

    async createQueued(mangaRootId) {
      bootstrapDatabase();
      const record = createQueuedScanSession(mangaRootId);
      const db = getDb();

      db.insert(scanSessions).values(record).run();

      return record;
    },
  };
}
