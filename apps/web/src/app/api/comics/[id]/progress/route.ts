import { eq, sql } from "drizzle-orm";
import { bootstrapDatabase, chapters, getDb, pages, readingProgress } from "@/modules/core/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    bootstrapDatabase();
    const db = getDb();
    const progress = db
      .select({
        id: readingProgress.id,
        chapterId: readingProgress.chapterId,
        pageId: readingProgress.pageId,
        pageNumber: readingProgress.pageNumber,
        progressPercent: readingProgress.progressPercent,
        updatedAt: readingProgress.updatedAt,
        chapterTitle: chapters.title,
        chapterPageCount: sql<number>`(SELECT count(*) FROM ${pages} WHERE ${pages.chapterId} = ${chapters.id})`,
      })
      .from(readingProgress)
      .innerJoin(chapters, eq(chapters.id, readingProgress.chapterId))
      .where(eq(readingProgress.comicId, id))
      .get();
    return Response.json({ progress });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "读取进度失败" }, { status: 500 });
  }
}
