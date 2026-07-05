import { asc, eq } from "drizzle-orm";

import { bootstrapDatabase, chapters, comics, getDb } from "@/modules/core/db";
import type { LibraryChapterRecord } from "@/modules/library/comics.repository";

export interface ChapterOrderResult {
  comicId: string;
  chapters: LibraryChapterRecord[];
  physicalFilesTouched: false;
}

export interface ComicChapterOrderRepository {
  listForComic(comicId: string): Promise<LibraryChapterRecord[]>;
  updateOrder(comicId: string, chapterIds: string[]): Promise<ChapterOrderResult>;
}

export function createComicChapterOrderRepository(): ComicChapterOrderRepository {
  return {
    async listForComic(comicId) {
      bootstrapDatabase();
      ensureComicCanOwnChapterOrder(comicId);
      return listChaptersForComic(comicId);
    },

    async updateOrder(comicId, chapterIds) {
      bootstrapDatabase();
      ensureComicCanOwnChapterOrder(comicId);

      const existingChapters = listChaptersForComic(comicId);
      const existingIds = existingChapters.map((chapter) => chapter.id);

      validateChapterIdOrder(existingIds, chapterIds);

      const db = getDb();
      const now = new Date().toISOString();

      db.transaction((tx) => {
        chapterIds.forEach((chapterId, index) => {
          tx.update(chapters)
            .set({
              sortOrder: index,
              updatedAt: now,
            })
            .where(eq(chapters.id, chapterId))
            .run();
        });
      });

      return {
        comicId,
        chapters: listChaptersForComic(comicId),
        physicalFilesTouched: false,
      };
    },
  };
}

function ensureComicCanOwnChapterOrder(comicId: string) {
  const db = getDb();
  const comic = db
    .select({
      id: comics.id,
      parentComicId: comics.parentComicId,
      mergedAsChapterId: comics.mergedAsChapterId,
    })
    .from(comics)
    .where(eq(comics.id, comicId))
    .get();

  if (!comic) {
    throw new Error("找不到漫画记录。");
  }

  if (comic.parentComicId || comic.mergedAsChapterId) {
    throw new Error("已合并为章节的漫画不能调整章节顺序。");
  }
}

function listChaptersForComic(comicId: string): LibraryChapterRecord[] {
  const db = getDb();
  return db
    .select({
      id: chapters.id,
      title: chapters.title,
      sortOrder: chapters.sortOrder,
      pageCount: chapters.pageCount,
      addedAt: chapters.createdAt,
    })
    .from(chapters)
    .where(eq(chapters.comicId, comicId))
    .orderBy(asc(chapters.sortOrder), asc(chapters.createdAt))
    .all();
}

function validateChapterIdOrder(existingIds: string[], nextIds: string[]) {
  if (nextIds.length !== existingIds.length) {
    throw new Error("章节顺序必须包含当前漫画的全部章节。");
  }

  const existingSet = new Set(existingIds);
  const nextSet = new Set(nextIds);

  if (nextSet.size !== nextIds.length) {
    throw new Error("章节顺序不能包含重复章节。");
  }

  if (nextSet.size !== existingSet.size || nextIds.some((id) => !existingSet.has(id))) {
    throw new Error("章节顺序包含不属于当前漫画的章节。");
  }
}
