import { eq } from "drizzle-orm";

import { bootstrapDatabase, getDb, videos } from "@/modules/core/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const payload = await request.json().catch(() => null);
  const action = payload?.action;
  const status = action === "hide" ? "hidden" : action === "soft_delete" ? "deleted" : action === "restore" ? "readable" : null;
  if (!status) return Response.json({ error: "不支持的状态操作。" }, { status: 400 });
  bootstrapDatabase();
  const now = new Date().toISOString();
  const result = getDb().update(videos).set({ status, hiddenAt: status === "hidden" ? now : null, deletedAt: status === "deleted" ? now : null, updatedAt: now }).where(eq(videos.id, id)).run();
  if (result.changes === 0) return Response.json({ error: "视频不存在。" }, { status: 404 });
  return Response.json({ ok: true, status });
}
