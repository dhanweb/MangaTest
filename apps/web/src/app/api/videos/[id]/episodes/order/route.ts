import { and, eq, inArray } from "drizzle-orm";

import { bootstrapDatabase, getDb, videoEpisodes } from "@/modules/core/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const payload = await request.json().catch(() => null);
  const episodeIds = Array.isArray(payload?.episodeIds) ? payload.episodeIds.filter((value: unknown): value is string => typeof value === "string") : [];
  bootstrapDatabase();
  const db = getDb();
  const existing = db.select({ id: videoEpisodes.id }).from(videoEpisodes).where(and(eq(videoEpisodes.videoId, id), inArray(videoEpisodes.id, episodeIds))).all();
  if (existing.length !== episodeIds.length) return Response.json({ error: "集数列表不匹配。" }, { status: 400 });
  const now = new Date().toISOString();
  const update = db.transaction((tx) => { for (const [sortOrder, episodeId] of episodeIds.entries()) tx.update(videoEpisodes).set({ sortOrder, updatedAt: now }).where(eq(videoEpisodes.id, episodeId)).run(); });
  void update;
  return Response.json({ ok: true });
}
