import { randomUUID } from "node:crypto";

import { and, desc, eq, max } from "drizzle-orm";

import { bootstrapDatabase, chapters, comics, getDb, operationLogs } from "@/modules/core/db";

type MergeableComicStatus = "readable" | "missing_local_file" | "remote_only" | "hidden" | "deleted";

export interface ComicMergeResult {
  sourceComicId: string;
  sourceDisplayTitle: string;
  sourceStatus: MergeableComicStatus;
  targetComicId: string;
  targetDisplayTitle: string;
  chapterId: string;
  physicalFilesTouched: false;
}

interface MergeLogDetail {
  chapterId: string;
  previousChapterTitle: string | null;
  previousHiddenAt: string | null;
  previousSortOrder: number;
  previousStatus: MergeableComicStatus;
  targetComicId: string;
  targetDisplayTitle: string;
  physicalFilesTouched: false;
}

export interface ComicMergeRepository {
  mergeAsChapter(sourceComicId: string, targetComicId: string): Promise<ComicMergeResult>;
  restoreMergedComic(sourceComicId: string): Promise<ComicMergeResult>;
}

export function createComicMergeRepository(): ComicMergeRepository {
  return {
    async mergeAsChapter(sourceComicId, targetComicId) {
      bootstrapDatabase();

      if (sourceComicId === targetComicId) {
        throw new Error("不能把漫画合并到自己。");
      }

      const db = getDb();
      const source = getComicForMerge(sourceComicId);
      const target = getComicForMerge(targetComicId);

      if (!source) {
        throw new Error("找不到要合并的漫画。");
      }

      if (!target) {
        throw new Error("找不到目标漫画。");
      }

      if (source.status !== "readable") {
        throw new Error("只有当前可读的漫画可以合并为章节。");
      }

      if (target.status !== "readable") {
        throw new Error("目标漫画必须是可读状态。");
      }

      if (source.parentComicId || source.mergedAsChapterId) {
        throw new Error("这本漫画已经被合并为章节。");
      }

      if (target.parentComicId || target.mergedAsChapterId) {
        throw new Error("不能合并到已经作为章节的漫画。");
      }

      const sourceChapters = db
        .select({
          id: chapters.id,
          title: chapters.title,
          sortOrder: chapters.sortOrder,
        })
        .from(chapters)
        .where(eq(chapters.comicId, sourceComicId))
        .orderBy(chapters.sortOrder)
        .all();

      if (sourceChapters.length !== 1) {
        throw new Error("MVP 仅支持把单章节漫画合并为目标漫画的一章。");
      }

      const chapter = sourceChapters[0];
      const nextSortOrder = Number(
        db.select({ value: max(chapters.sortOrder) }).from(chapters).where(eq(chapters.comicId, targetComicId)).get()?.value ?? -1,
      ) + 1;
      const now = new Date().toISOString();
      const detail: MergeLogDetail = {
        chapterId: chapter.id,
        previousChapterTitle: chapter.title,
        previousHiddenAt: source.hiddenAt,
        previousSortOrder: chapter.sortOrder,
        previousStatus: source.status,
        targetComicId,
        targetDisplayTitle: target.displayTitle,
        physicalFilesTouched: false,
      };

      db.transaction((tx) => {
        tx.update(chapters)
          .set({
            comicId: targetComicId,
            sortOrder: nextSortOrder,
            title: chapter.title ?? source.displayTitle,
            updatedAt: now,
          })
          .where(eq(chapters.id, chapter.id))
          .run();

        tx.update(comics)
          .set({
            status: "hidden",
            parentComicId: targetComicId,
            mergedAsChapterId: chapter.id,
            hiddenAt: now,
            updatedAt: now,
          })
          .where(eq(comics.id, sourceComicId))
          .run();

        tx.insert(operationLogs)
          .values({
            id: randomUUID(),
            operation: "merge_chapter",
            targetType: "comic",
            targetId: sourceComicId,
            summary: `合并漫画为章节：${source.displayTitle} -> ${target.displayTitle}`,
            detailJson: JSON.stringify(detail),
            createdAt: now,
          })
          .run();
      });

      return {
        sourceComicId,
        sourceDisplayTitle: source.displayTitle,
        sourceStatus: "hidden",
        targetComicId,
        targetDisplayTitle: target.displayTitle,
        chapterId: chapter.id,
        physicalFilesTouched: false,
      };
    },

    async restoreMergedComic(sourceComicId) {
      bootstrapDatabase();

      const db = getDb();
      const source = getComicForMerge(sourceComicId);

      if (!source) {
        throw new Error("找不到要恢复的漫画。");
      }

      if (!source.parentComicId || !source.mergedAsChapterId) {
        throw new Error("这本漫画没有处于合并章节状态。");
      }

      const mergedAsChapterId = source.mergedAsChapterId;
      const target = getComicForMerge(source.parentComicId);
      const mergeLog = getLatestMergeLog(sourceComicId);
      const previousStatus = mergeLog?.previousStatus ?? "readable";
      const previousChapterTitle = mergeLog?.previousChapterTitle ?? null;
      const previousSortOrder = mergeLog?.previousSortOrder ?? 0;
      const previousHiddenAt = mergeLog?.previousHiddenAt ?? null;
      const now = new Date().toISOString();

      db.transaction((tx) => {
        tx.update(chapters)
          .set({
            comicId: sourceComicId,
            sortOrder: previousSortOrder,
            title: previousChapterTitle,
            updatedAt: now,
          })
          .where(eq(chapters.id, mergedAsChapterId))
          .run();

        tx.update(comics)
          .set({
            status: previousStatus,
            parentComicId: null,
            mergedAsChapterId: null,
            hiddenAt: previousHiddenAt,
            updatedAt: now,
          })
          .where(eq(comics.id, sourceComicId))
          .run();

        tx.insert(operationLogs)
          .values({
            id: randomUUID(),
            operation: "restore",
            targetType: "comic",
            targetId: sourceComicId,
            summary: `恢复合并漫画为独立记录：${source.displayTitle}`,
            detailJson: JSON.stringify({
              restoredFromMerge: true,
              targetComicId: source.parentComicId,
              targetDisplayTitle: target?.displayTitle ?? mergeLog?.targetDisplayTitle ?? null,
              chapterId: mergedAsChapterId,
              status: previousStatus,
              physicalFilesTouched: false,
            }),
            createdAt: now,
          })
          .run();
      });

      return {
        sourceComicId,
        sourceDisplayTitle: source.displayTitle,
        sourceStatus: previousStatus,
        targetComicId: source.parentComicId,
        targetDisplayTitle: target?.displayTitle ?? mergeLog?.targetDisplayTitle ?? "",
        chapterId: mergedAsChapterId,
        physicalFilesTouched: false,
      };
    },
  };
}

function getComicForMerge(comicId: string) {
  const db = getDb();
  return db
    .select({
      id: comics.id,
      displayTitle: comics.displayTitle,
      status: comics.status,
      hiddenAt: comics.hiddenAt,
      parentComicId: comics.parentComicId,
      mergedAsChapterId: comics.mergedAsChapterId,
    })
    .from(comics)
    .where(eq(comics.id, comicId))
    .get();
}

function getLatestMergeLog(sourceComicId: string): MergeLogDetail | null {
  const db = getDb();
  const row = db
    .select({ detailJson: operationLogs.detailJson })
    .from(operationLogs)
    .where(and(eq(operationLogs.operation, "merge_chapter"), eq(operationLogs.targetType, "comic"), eq(operationLogs.targetId, sourceComicId)))
    .orderBy(desc(operationLogs.createdAt))
    .limit(1)
    .get();

  if (!row?.detailJson) {
    return null;
  }

  try {
    const parsed = JSON.parse(row.detailJson) as Partial<MergeLogDetail>;

    if (
      typeof parsed.chapterId !== "string" ||
      typeof parsed.targetComicId !== "string" ||
      typeof parsed.targetDisplayTitle !== "string" ||
      typeof parsed.previousSortOrder !== "number"
    ) {
      return null;
    }

    return {
      chapterId: parsed.chapterId,
      previousChapterTitle: typeof parsed.previousChapterTitle === "string" ? parsed.previousChapterTitle : null,
      previousHiddenAt: typeof parsed.previousHiddenAt === "string" ? parsed.previousHiddenAt : null,
      previousSortOrder: parsed.previousSortOrder,
      previousStatus: isMergeableComicStatus(parsed.previousStatus) ? parsed.previousStatus : "readable",
      targetComicId: parsed.targetComicId,
      targetDisplayTitle: parsed.targetDisplayTitle,
      physicalFilesTouched: false,
    };
  } catch {
    return null;
  }
}

function isMergeableComicStatus(value: unknown): value is MergeableComicStatus {
  return value === "readable" || value === "missing_local_file" || value === "remote_only" || value === "hidden" || value === "deleted";
}
