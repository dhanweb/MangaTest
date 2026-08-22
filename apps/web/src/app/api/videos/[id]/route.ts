import { createVideoRepository } from "@/modules/video-library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const video = await createVideoRepository().getDetail(id);
  return video ? Response.json({ video }) : Response.json({ error: "视频不存在。" }, { status: 404 });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const payload = await request.json().catch(() => null);
  const title = typeof payload?.displayTitle === "string" ? payload.displayTitle.trim() : "";
  if (!title) return Response.json({ error: "标题不能为空。" }, { status: 400 });

  const { bootstrapDatabase, getDb, videos } = await import("@/modules/core/db");
  const { eq } = await import("drizzle-orm");
  bootstrapDatabase();
  const result = getDb().update(videos).set({ displayTitle: title, sortTitle: title.toLocaleLowerCase(), updatedAt: new Date().toISOString() }).where(eq(videos.id, id)).run();
  if (result.changes === 0) return Response.json({ error: "视频不存在。" }, { status: 404 });
  return Response.json({ video: await createVideoRepository().getDetail(id) });
}
