import { randomUUID } from "node:crypto";

import { and, asc, desc, eq, max } from "drizzle-orm";

import { bootstrapDatabase, getDb, operationLogs, videoEpisodes, videos } from "@/modules/core/db";

type VideoMergeStatus = "readable" | "missing_local_file" | "hidden" | "deleted";

export interface VideoMergeResult {
  sourceVideoId: string;
  sourceDisplayTitle: string;
  sourceStatus: VideoMergeStatus;
  targetVideoId: string;
  targetDisplayTitle: string;
  episodeId: string;
  physicalFilesTouched: false;
}

interface VideoMergeLogDetail {
  episodeId: string;
  previousEpisodeSortOrder: number;
  previousStatus: VideoMergeStatus;
  previousHiddenAt: string | null;
  targetVideoId: string;
  targetDisplayTitle: string;
  physicalFilesTouched: false;
}

export interface VideoMergeRepository {
  mergeAsEpisode(sourceVideoId: string, targetVideoId: string): Promise<VideoMergeResult>;
  restoreMergedVideo(sourceVideoId: string): Promise<VideoMergeResult>;
}

export function createVideoMergeRepository(): VideoMergeRepository {
  return {
    async mergeAsEpisode(sourceVideoId, targetVideoId) {
      bootstrapDatabase();
      if (sourceVideoId === targetVideoId) throw new Error("不能把视频合并到自己。");

      const db = getDb();
      const source = getVideoForMerge(sourceVideoId);
      const target = getVideoForMerge(targetVideoId);
      if (!source) throw new Error("找不到要合并的视频。");
      if (!target) throw new Error("找不到目标视频。");
      if (source.status !== "readable") throw new Error("只有当前可读的视频可以合并为集数。");
      if (target.status !== "readable") throw new Error("目标视频必须是可读状态。");
      if (source.parentVideoId || source.mergedAsEpisodeId) throw new Error("这个视频已经被合并为集数。");
      if (target.parentVideoId || target.mergedAsEpisodeId) throw new Error("不能合并到已经作为集数的视频。");

      const sourceEpisodes = db
        .select({ id: videoEpisodes.id, sortOrder: videoEpisodes.sortOrder, isMissing: videoEpisodes.isMissing })
        .from(videoEpisodes)
        .where(eq(videoEpisodes.videoId, sourceVideoId))
        .orderBy(asc(videoEpisodes.sortOrder), asc(videoEpisodes.createdAt))
        .all();
      if (sourceEpisodes.length !== 1 || sourceEpisodes[0]?.isMissing) throw new Error("仅支持把单集可读视频合并为一个集数。");

      const episode = sourceEpisodes[0];
      const nextSortOrder = Number(
        db.select({ value: max(videoEpisodes.sortOrder) }).from(videoEpisodes).where(eq(videoEpisodes.videoId, targetVideoId)).get()?.value ?? -1,
      ) + 1;
      const now = new Date().toISOString();
      const detail: VideoMergeLogDetail = {
        episodeId: episode.id,
        previousEpisodeSortOrder: episode.sortOrder,
        previousStatus: source.status,
        previousHiddenAt: source.hiddenAt,
        targetVideoId,
        targetDisplayTitle: target.displayTitle,
        physicalFilesTouched: false,
      };

      db.transaction((tx) => {
        tx.update(videoEpisodes)
          .set({ videoId: targetVideoId, sortOrder: nextSortOrder, updatedAt: now })
          .where(eq(videoEpisodes.id, episode.id))
          .run();
        tx.update(videos)
          .set({ status: "hidden", parentVideoId: targetVideoId, mergedAsEpisodeId: episode.id, hiddenAt: now, updatedAt: now })
          .where(eq(videos.id, sourceVideoId))
          .run();
        tx.insert(operationLogs).values({
          id: randomUUID(),
          operation: "merge_video_episode",
          targetType: "video",
          targetId: sourceVideoId,
          summary: `合并视频为集数：${source.displayTitle} -> ${target.displayTitle}`,
          detailJson: JSON.stringify(detail),
          createdAt: now,
        }).run();
      });

      return {
        sourceVideoId,
        sourceDisplayTitle: source.displayTitle,
        sourceStatus: "hidden",
        targetVideoId,
        targetDisplayTitle: target.displayTitle,
        episodeId: episode.id,
        physicalFilesTouched: false,
      };
    },

    async restoreMergedVideo(sourceVideoId) {
      bootstrapDatabase();
      const db = getDb();
      const source = getVideoForMerge(sourceVideoId);
      if (!source) throw new Error("找不到要恢复的视频。");
      if (!source.parentVideoId || !source.mergedAsEpisodeId) throw new Error("这个视频没有处于合并集数状态。");

      const target = getVideoForMerge(source.parentVideoId);
      const mergeLog = getLatestMergeLog(sourceVideoId);
      const parentVideoId = source.parentVideoId;
      const mergedEpisodeId = source.mergedAsEpisodeId;
      const episodeSortOrder = mergeLog?.previousEpisodeSortOrder ?? 0;
      const previousStatus = mergeLog?.previousStatus ?? "readable";
      const previousHiddenAt = mergeLog?.previousHiddenAt ?? null;
      const now = new Date().toISOString();
      db.transaction((tx) => {
        tx.update(videoEpisodes)
          .set({ videoId: sourceVideoId, sortOrder: episodeSortOrder, updatedAt: now })
          .where(and(eq(videoEpisodes.id, mergedEpisodeId), eq(videoEpisodes.videoId, parentVideoId)))
          .run();
        tx.update(videos)
          .set({ status: previousStatus, parentVideoId: null, mergedAsEpisodeId: null, hiddenAt: previousHiddenAt, updatedAt: now })
          .where(eq(videos.id, sourceVideoId))
          .run();
        tx.insert(operationLogs).values({
          id: randomUUID(),
          operation: "restore",
          targetType: "video",
          targetId: sourceVideoId,
          summary: `恢复合并视频：${source.displayTitle}`,
          detailJson: JSON.stringify({
            restoredFromMerge: true,
            targetVideoId: parentVideoId,
            targetDisplayTitle: target?.displayTitle ?? mergeLog?.targetDisplayTitle ?? null,
            episodeId: mergedEpisodeId,
            physicalFilesTouched: false,
          }),
          createdAt: now,
        }).run();
      });

      return {
        sourceVideoId,
        sourceDisplayTitle: source.displayTitle,
        sourceStatus: previousStatus,
        targetVideoId: parentVideoId,
        targetDisplayTitle: target?.displayTitle ?? mergeLog?.targetDisplayTitle ?? "",
        episodeId: mergedEpisodeId,
        physicalFilesTouched: false,
      };
    },
  };
}

function getVideoForMerge(videoId: string) {
  return getDb()
    .select({
      id: videos.id,
      displayTitle: videos.displayTitle,
      status: videos.status,
      hiddenAt: videos.hiddenAt,
      parentVideoId: videos.parentVideoId,
      mergedAsEpisodeId: videos.mergedAsEpisodeId,
    })
    .from(videos)
    .where(eq(videos.id, videoId))
    .get();
}

function getLatestMergeLog(sourceVideoId: string): VideoMergeLogDetail | null {
  const row = getDb()
    .select({ detailJson: operationLogs.detailJson })
    .from(operationLogs)
    .where(and(eq(operationLogs.operation, "merge_video_episode"), eq(operationLogs.targetType, "video"), eq(operationLogs.targetId, sourceVideoId)))
    .orderBy(desc(operationLogs.createdAt))
    .limit(1)
    .get();
  if (!row?.detailJson) return null;

  try {
    const parsed = JSON.parse(row.detailJson) as Partial<VideoMergeLogDetail>;
    if (typeof parsed.episodeId !== "string" || typeof parsed.previousEpisodeSortOrder !== "number" || typeof parsed.targetVideoId !== "string") return null;
    return {
      episodeId: parsed.episodeId,
      previousEpisodeSortOrder: parsed.previousEpisodeSortOrder,
      previousStatus: isVideoMergeStatus(parsed.previousStatus) ? parsed.previousStatus : "readable",
      previousHiddenAt: typeof parsed.previousHiddenAt === "string" ? parsed.previousHiddenAt : null,
      targetVideoId: parsed.targetVideoId,
      targetDisplayTitle: typeof parsed.targetDisplayTitle === "string" ? parsed.targetDisplayTitle : "",
      physicalFilesTouched: false,
    };
  } catch {
    return null;
  }
}

function isVideoMergeStatus(value: unknown): value is VideoMergeStatus {
  return value === "readable" || value === "missing_local_file" || value === "hidden" || value === "deleted";
}
