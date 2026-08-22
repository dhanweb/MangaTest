import { saveVideoProgress } from "@/modules/video-library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload.videoId !== "string" || typeof payload.episodeId !== "string") return Response.json({ error: "videoId 和 episodeId 必填。" }, { status: 400 });
  try {
    return Response.json({ progress: await saveVideoProgress({ videoId: payload.videoId, episodeId: payload.episodeId, positionSeconds: Number(payload.positionSeconds ?? 0), progressPercent: Number(payload.progressPercent ?? 0), isCompleted: Boolean(payload.isCompleted) }) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "保存视频进度失败。" }, { status: 400 });
  }
}
