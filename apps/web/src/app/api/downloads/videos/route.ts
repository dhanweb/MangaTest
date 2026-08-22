import { createVideoDownloadTask, listVideoDownloadTasks } from "@/modules/downloads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ tasks: await listVideoDownloadTasks() });
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload.title !== "string" || typeof payload.resourceUrl !== "string" || typeof payload.videoRootId !== "string") return Response.json({ error: "标题、下载地址和视频根目录均必填。" }, { status: 400 });
  try { return Response.json(await createVideoDownloadTask({ title: payload.title, resourceUrl: payload.resourceUrl, videoRootId: payload.videoRootId, targetDirectory: typeof payload.targetDirectory === "string" ? payload.targetDirectory : undefined }), { status: 201 }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "创建视频下载任务失败。" }, { status: 400 }); }
}
