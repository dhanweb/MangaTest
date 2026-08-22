import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { bootstrapDatabase, getDb, videoEpisodes, videoProgress, videos } from "@/modules/core/db";

export async function saveVideoProgress(input: { videoId: string; episodeId: string; positionSeconds: number; progressPercent: number; isCompleted?: boolean }) {
  bootstrapDatabase();
  const db = getDb();
  const episode = db.select().from(videoEpisodes).where(and(eq(videoEpisodes.id, input.episodeId), eq(videoEpisodes.videoId, input.videoId))).get();
  if (!episode) throw new Error("找不到视频集数。");
  const now = new Date().toISOString();
  const duration = episode.durationSeconds ?? 0;
  const positionSeconds = Math.max(0, Math.min(Math.round(input.positionSeconds), duration || Math.round(input.positionSeconds)));
  const progressPercent = Math.max(0, Math.min(100, Math.round(input.progressPercent)));
  const isCompleted = Boolean(input.isCompleted) || progressPercent >= 90 || (duration > 0 && positionSeconds >= duration - 2);
  const existing = db.select({ id: videoProgress.id }).from(videoProgress).where(and(eq(videoProgress.videoId, input.videoId), eq(videoProgress.episodeId, input.episodeId))).get();
  if (existing) {
    db.update(videoProgress).set({ positionSeconds, progressPercent, isCompleted, updatedAt: now }).where(eq(videoProgress.id, existing.id)).run();
  } else {
    db.insert(videoProgress).values({ id: randomUUID(), videoId: input.videoId, episodeId: input.episodeId, positionSeconds, progressPercent, isCompleted, updatedAt: now }).run();
  }
  db.update(videos).set({ lastWatchedEpisodeId: input.episodeId, lastWatchedPositionSeconds: positionSeconds, lastWatchedAt: now, updatedAt: now }).where(eq(videos.id, input.videoId)).run();
  return { positionSeconds, progressPercent, isCompleted };
}
