import { asc, eq, sql } from "drizzle-orm";

import { bootstrapDatabase, getDb } from "@/modules/core/db";
import { localFiles, mangaRoots, scanSessions } from "@/modules/core/db/schema";

import { createMangaRootRecord, type MangaRootDraft, type MangaRootRecord, type MangaRootWithStats } from "./manga-roots";

export interface MangaRootRepository {
  list(): Promise<MangaRootRecord[]>;
  listWithStats(): Promise<MangaRootWithStats[]>;
  create(input: MangaRootDraft): Promise<MangaRootRecord>;
  updateSettings(input: MangaRootSettingsUpdate): Promise<MangaRootRecord>;
  deleteUnused(id: string): Promise<{ deleted: boolean }>;
}

export interface MangaRootSettingsUpdate {
  id: string;
  displayName?: string;
  isEnabled: boolean;
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

    async updateSettings(input) {
      bootstrapDatabase();
      const db = getDb();
      const existing = db.select().from(mangaRoots).where(eq(mangaRoots.id, input.id)).get();

      if (!existing) {
        throw new Error("漫画根目录不存在。");
      }

      const now = new Date().toISOString();
      db.update(mangaRoots)
        .set({
          displayName: input.displayName?.trim() || null,
          isEnabled: input.isEnabled,
          updatedAt: now,
        })
        .where(eq(mangaRoots.id, input.id))
        .run();

      return {
        id: existing.id,
        absolutePath: existing.absolutePath,
        displayName: input.displayName?.trim() || null,
        scanMode: existing.scanMode,
        isEnabled: input.isEnabled,
      };
    },

    async deleteUnused(id) {
      bootstrapDatabase();
      const db = getDb();
      const existing = db.select().from(mangaRoots).where(eq(mangaRoots.id, id)).get();

      if (!existing) {
        throw new Error("漫画根目录不存在。");
      }

      const usage = db
        .select({ count: sql<number>`count(*)` })
        .from(localFiles)
        .where(eq(localFiles.mangaRootId, id))
        .get();

      if (Number(usage?.count ?? 0) > 0) {
        throw new Error("这个路径已有入库漫画，不能删除。可以先停用路径，系统不会删除真实文件。");
      }

      db.update(scanSessions).set({ mangaRootId: null, updatedAt: new Date().toISOString() }).where(eq(scanSessions.mangaRootId, id)).run();
      db.delete(mangaRoots).where(eq(mangaRoots.id, id)).run();

      return { deleted: true };
    },
  };
}
