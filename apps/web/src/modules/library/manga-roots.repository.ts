import { asc, eq, sql } from "drizzle-orm";

import { bootstrapDatabase, getDb } from "@/modules/core/db";
import { localFiles, mangaRoots } from "@/modules/core/db/schema";

import { createMangaRootRecord, type MangaRootDraft, type MangaRootRecord, type MangaRootWithStats } from "./manga-roots";

export interface MangaRootRepository {
  list(): Promise<MangaRootRecord[]>;
  listWithStats(): Promise<MangaRootWithStats[]>;
  create(input: MangaRootDraft): Promise<MangaRootRecord>;
}

export function createMangaRootRepository(): MangaRootRepository {
  return {
    async list() {
      bootstrapDatabase();
      const db = getDb();
      const rows = db.select().from(mangaRoots).orderBy(asc(mangaRoots.createdAt)).all();

      return rows.map((row) => ({
        id: row.id,
        absolutePath: row.absolutePath,
        displayName: row.displayName,
        scanMode: row.scanMode,
        isEnabled: row.isEnabled,
      }));
    },

    async listWithStats() {
      bootstrapDatabase();
      const db = getDb();
      const rows = db
        .select({
          id: mangaRoots.id,
          absolutePath: mangaRoots.absolutePath,
          displayName: mangaRoots.displayName,
          scanMode: mangaRoots.scanMode,
          isEnabled: mangaRoots.isEnabled,
          lastScanSessionId: mangaRoots.lastScanSessionId,
          comicCount: sql<number>`count(distinct ${localFiles.comicId})`,
          createdAt: mangaRoots.createdAt,
        })
        .from(mangaRoots)
        .leftJoin(localFiles, eq(localFiles.mangaRootId, mangaRoots.id))
        .groupBy(mangaRoots.id)
        .orderBy(asc(mangaRoots.createdAt))
        .all();

      return rows.map((row) => ({
        id: row.id,
        absolutePath: row.absolutePath,
        displayName: row.displayName,
        scanMode: row.scanMode,
        isEnabled: row.isEnabled,
        lastScanSessionId: row.lastScanSessionId,
        comicCount: Number(row.comicCount),
      }));
    },

    async create(input) {
      bootstrapDatabase();
      const record = createMangaRootRecord(input);
      const db = getDb();
      const existing = db.select().from(mangaRoots).where(eq(mangaRoots.absolutePath, record.absolutePath)).get();

      if (existing) {
        throw new Error("这个漫画根目录已经存在。");
      }

      db.insert(mangaRoots).values(record).run();

      return record;
    },
  };
}
