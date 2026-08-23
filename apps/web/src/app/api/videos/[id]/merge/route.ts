import { createVideoMergeRepository, createVideoRepository } from "@/modules/video-library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: targetVideoId } = await params;
  const sourceVideoIds = await parseSourceVideoIds(request);
  if (!sourceVideoIds.length) return Response.json({ error: "sourceVideoIds is required." }, { status: 400 });

  try {
    const merge = await createVideoMergeRepository().mergeAsEpisodes(sourceVideoIds, targetVideoId);
    const repository = createVideoRepository();
    return Response.json({ videos: await repository.listAdminRows(), video: await repository.getDetail(targetVideoId), merge });
  } catch (error) {
    const message = error instanceof Error ? error.message : "合并视频失败。";
    const status = message.includes("找不到") ? 404 : 400;
    return Response.json({ error: message }, { status });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: sourceVideoId } = await params;

  try {
    const merge = await createVideoMergeRepository().restoreMergedVideo(sourceVideoId);
    const repository = createVideoRepository();
    return Response.json({ videos: await repository.listAdminRows(), video: await repository.getDetail(sourceVideoId), merge });
  } catch (error) {
    const message = error instanceof Error ? error.message : "恢复合并视频失败。";
    const status = message.includes("找不到") ? 404 : 400;
    return Response.json({ error: message }, { status });
  }
}

async function parseSourceVideoIds(request: Request) {
  const payload = (await request.json().catch(() => null)) as { sourceVideoIds?: unknown; sourceVideoId?: unknown } | null;
  if (Array.isArray(payload?.sourceVideoIds)) {
    return payload.sourceVideoIds.filter((value: unknown): value is string => typeof value === "string").map((value) => value.trim()).filter(Boolean);
  }
  return typeof payload?.sourceVideoId === "string" && payload.sourceVideoId.trim() ? [payload.sourceVideoId.trim()] : [];
}
