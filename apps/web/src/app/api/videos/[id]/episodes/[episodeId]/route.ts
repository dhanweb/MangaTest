import { createVideoMergeRepository, createVideoRepository } from "@/modules/video-library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; episodeId: string }> }) {
  const { id: videoId, episodeId } = await params;
  const payload = await request.json().catch(() => null) as { title?: unknown } | null;
  if (typeof payload?.title !== "string") return Response.json({ error: "title is required." }, { status: 400 });

  try {
    const repository = createVideoRepository();
    await repository.updateEpisodeTitle(videoId, episodeId, payload.title);
    const video = await repository.getDetail(videoId);
    return video ? Response.json({ video }) : Response.json({ error: "视频不存在。" }, { status: 404 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "保存集标题失败。";
    const status = message.includes("找不到") ? 404 : 400;
    return Response.json({ error: message }, { status });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; episodeId: string }> }) {
  const { id: targetVideoId, episodeId } = await params;

  try {
    const merge = await createVideoMergeRepository().removeMergedEpisode(targetVideoId, episodeId);
    const repository = createVideoRepository();
    return Response.json({ videos: await repository.listAdminRows(), video: await repository.getDetail(targetVideoId), merge });
  } catch (error) {
    const message = error instanceof Error ? error.message : "移除集数失败。";
    const status = message.includes("找不到") ? 404 : 400;
    return Response.json({ error: message }, { status });
  }
}
