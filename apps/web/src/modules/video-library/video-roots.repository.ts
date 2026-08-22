import { stat } from "node:fs/promises";

import { asc, eq, sql } from "drizzle-orm";

import { bootstrapDatabase, getDb, videoEpisodes, videoRoots, videos } from "@/modules/core/db";

import { createVideoRootRecord, type VideoRootDraft, type VideoRootRecord } from "./video-roots";

export interface VideoRootWithStats extends VideoRootRecord {
  videoCount: number;
  episodeCount: number;
}

export interface VideoRootRepository {
  list(): Promise<VideoRootRecord[]>;
  listWithStats(): Promise<VideoRootWithStats[]>;
  create(input: VideoRootDraft): Promise<VideoRootRecord>;
  updateSettings(input: { id: string; displayName?: string; isEnabled: boolean }): Promise<VideoRootRecord>;
  deleteUnused(id: string): Promise<void>;
}

export function createVideoRootRepository(): VideoRootRepository {
  return {
    async list() {
      bootstrapDatabase();
      return getDb().select().from(videoRoots).orderBy(asc(videoRoots.createdAt)).all();
    },

    async listWithStats() {
      bootstrapDatabase();
      const rows = getDb()
        .select({
          id: videoRoots.id,
          absolutePath: videoRoots.absolutePath,
          displayName: videoRoots.displayName,
          scanMode: videoRoots.scanMode,
          isEnabled: videoRoots.isEnabled,
          lastScanAt: videoRoots.lastScanAt,
          videoCount: sql<number>`count(distinct ${videos.id})`,
          episodeCount: sql<number>`count(distinct ${videoEpisodes.id})`,
        })
        .from(videoRoots)
        .leftJoin(videos, eq(videos.videoRootId, videoRoots.id))
        .leftJoin(videoEpisodes, eq(videoEpisodes.videoRootId, videoRoots.id))
        .groupBy(videoRoots.id)
        .orderBy(asc(videoRoots.createdAt))
        .all();

      return rows.map((row) => ({
        ...row,
        videoCount: Number(row.videoCount),
        episodeCount: Number(row.episodeCount),
      }));
    },

    async create(input) {
      const record = createVideoRootRecord(input);
      const info = await stat(record.absolutePath).catch(() => null);
      if (!info?.isDirectory()) {
        throw new Error("视频根目录不存在，或不是目录。");
      }

      bootstrapDatabase();
      const db = getDb();
      if (db.select({ id: videoRoots.id }).from(videoRoots).where(eq(videoRoots.absolutePath, record.absolutePath)).get()) {
        throw new Error("这个视频根目录已经存在。");
      }

      const now = new Date().toISOString();
      db.insert(videoRoots).values({ ...record, createdAt: now, updatedAt: now }).run();
      return record;
    },

    async updateSettings(input) {
      bootstrapDatabase();
      const db = getDb();
      const existing = db.select().from(videoRoots).where(eq(videoRoots.id, input.id)).get();
      if (!existing) throw new Error("视频根目录不存在。");
      const now = new Date().toISOString();
      db.update(videoRoots)
        .set({ displayName: input.displayName?.trim() || null, isEnabled: input.isEnabled, updatedAt: now })
        .where(eq(videoRoots.id, input.id))
        .run();
      return { ...existing, displayName: input.displayName?.trim() || null, isEnabled: input.isEnabled };
    },

    async deleteUnused(id) {
      bootstrapDatabase();
      const db = getDb();
      const usage = db.select({ count: sql<number>`count(*)` }).from(videoEpisodes).where(eq(videoEpisodes.videoRootId, id)).get();
      if (Number(usage?.count ?? 0) > 0) throw new Error("这个视频路径已有入库记录，不能删除；可以先停用路径。");
      db.delete(videoRoots).where(eq(videoRoots.id, id)).run();
    },
  };
}
