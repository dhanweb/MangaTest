import { createComicChapterOrderRepository } from "@/modules/library/comic-chapter-order.repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const chapters = await createComicChapterOrderRepository().listForComic(id);
    return Response.json({ chapters });
  } catch (error) {
    const message = error instanceof Error ? error.message : "读取章节顺序失败。";
    const status = message.includes("找不到") ? 404 : 400;

    return Response.json({ error: message }, { status });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const chapterIds = await parseChapterIds(request);

  if (!chapterIds) {
    return Response.json({ error: "chapterIds is required." }, { status: 400 });
  }

  try {
    const order = await createComicChapterOrderRepository().updateOrder(id, chapterIds);
    return Response.json({ chapters: order.chapters, order });
  } catch (error) {
    const message = error instanceof Error ? error.message : "保存章节顺序失败。";
    const status = message.includes("找不到") ? 404 : 400;

    return Response.json({ error: message }, { status });
  }
}

async function parseChapterIds(request: Request) {
  const payload = (await request.json().catch(() => null)) as { chapterIds?: unknown } | null;

  if (!Array.isArray(payload?.chapterIds)) {
    return null;
  }

  const chapterIds = payload.chapterIds
    .map((chapterId) => (typeof chapterId === "string" ? chapterId.trim() : ""))
    .filter(Boolean);

  return chapterIds.length === payload.chapterIds.length ? chapterIds : null;
}
