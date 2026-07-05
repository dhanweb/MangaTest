import { createComicMergeRepository } from "@/modules/library/comic-merge.repository";
import { createComicRepository } from "@/modules/library/comics.repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const targetComicId = await parseTargetComicId(request);

  if (!targetComicId) {
    return Response.json({ error: "targetComicId is required." }, { status: 400 });
  }

  try {
    const merge = await createComicMergeRepository().mergeAsChapter(id, targetComicId);
    const comics = await createComicRepository().listAdminRows();
    return Response.json({ comics, merge });
  } catch (error) {
    const message = error instanceof Error ? error.message : "合并章节失败。";
    const status = message.includes("找不到") ? 404 : 400;

    return Response.json({ error: message }, { status });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const merge = await createComicMergeRepository().restoreMergedComic(id);
    const comics = await createComicRepository().listAdminRows();
    return Response.json({ comics, merge });
  } catch (error) {
    const message = error instanceof Error ? error.message : "恢复合并漫画失败。";
    const status = message.includes("找不到") ? 404 : 400;

    return Response.json({ error: message }, { status });
  }
}

async function parseTargetComicId(request: Request) {
  const payload = (await request.json().catch(() => null)) as { targetComicId?: unknown } | null;
  return typeof payload?.targetComicId === "string" && payload.targetComicId.trim() ? payload.targetComicId.trim() : null;
}
