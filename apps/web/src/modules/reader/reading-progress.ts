import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { bootstrapDatabase, chapters, comics, getDb, pages, readingProgress } from "@/modules/core/db";

export interface SaveReadingProgressInput {
  pageId: string;
  progressPercent: number;
}

export interface SavedReadingProgress {
  comicId: string;
  chapterId: string;
  pageId: string;
  pageNumber: number;
  progressPercent: number;
}

export async function saveReadingProgress(input: SaveReadingProgressInput): Promise<SavedReadingProgress | null> {
  bootstrapDatabase();

  const db = getDb();
  const page = db
    .select({
      comicId: chapters.comicId,
      chapterId: pages.chapterId,
      pageId: pages.id,
      pageNumber: pages.pageNumber,
    })
    .from(pages)
    .innerJoin(chapters, eq(chapters.id, pages.chapterId))
    .innerJoin(comics, eq(comics.id, chapters.comicId))
    .where(eq(pages.id, input.pageId))
    .get();

  if (!page) {
    return null;
  }

  const now = new Date().toISOString();
  const progressPercent = clampProgress(input.progressPercent);

  db.transaction((tx) => {
    tx.insert(readingProgress)
      .values({
        id: randomUUID(),
        comicId: page.comicId,
        chapterId: page.chapterId,
        pageId: page.pageId,
        pageNumber: page.pageNumber,
        progressPercent,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: readingProgress.comicId,
        set: {
          chapterId: page.chapterId,
          pageId: page.pageId,
          pageNumber: page.pageNumber,
          progressPercent,
          updatedAt: now,
        },
      })
      .run();

    tx.update(comics)
      .set({
        lastReadChapterId: page.chapterId,
        lastReadPageId: page.pageId,
        lastReadAt: now,
        updatedAt: now,
      })
      .where(eq(comics.id, page.comicId))
      .run();
  });

  return {
    ...page,
    progressPercent,
  };
}

function clampProgress(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}
