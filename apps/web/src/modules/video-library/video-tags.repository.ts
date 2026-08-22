import { and, asc, eq } from "drizzle-orm";

import { bootstrapDatabase, getDb, tags, videoTags, videos } from "@/modules/core/db";
import type { CanonicalTag } from "@/modules/tags";
import { createTagRepository } from "@/modules/tags/tags.repository";

export type AssignedVideoTag = CanonicalTag & {
  source: "scan" | "metadata" | "manual";
  isUserEdited: boolean;
  assignedAt: string;
};

export async function listVideoTags(videoId: string): Promise<AssignedVideoTag[]> {
  bootstrapDatabase();
  const rows = getDb()
    .select({
      id: tags.id,
      namespace: tags.namespace,
      name: tags.name,
      canonical: tags.canonical,
      displayNameZh: tags.displayNameZh,
      source: videoTags.source,
      isUserEdited: videoTags.isUserEdited,
      assignedAt: videoTags.createdAt,
    })
    .from(videoTags)
    .innerJoin(tags, eq(tags.id, videoTags.tagId))
    .where(eq(videoTags.videoId, videoId))
    .orderBy(asc(tags.namespace), asc(tags.name))
    .all();
  return rows.map((row) => ({ ...row, isUserEdited: Boolean(row.isUserEdited) }));
}

export async function addVideoTag(videoId: string, input: { tagId?: string; name?: string; displayNameZh?: string }) {
  bootstrapDatabase();
  const db = getDb();
  if (!db.select({ id: videos.id }).from(videos).where(eq(videos.id, videoId)).get()) throw new Error("找不到视频记录。");

  let tagId = input.tagId;
  if (!tagId && input.name?.trim()) {
    const tag = await createTagRepository().upsert({ namespace: "general", name: input.name, displayNameZh: input.displayNameZh });
    tagId = tag.id;
  }
  if (!tagId || !db.select({ id: tags.id }).from(tags).where(eq(tags.id, tagId)).get()) throw new Error("请选择或输入标签。");

  const now = new Date().toISOString();
  db.insert(videoTags)
    .values({ videoId, tagId, source: "manual", isUserEdited: true, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: [videoTags.videoId, videoTags.tagId], set: { source: "manual", isUserEdited: true, updatedAt: now } })
    .run();
  return listVideoTags(videoId);
}

export async function removeVideoTag(videoId: string, tagId: string) {
  bootstrapDatabase();
  getDb().delete(videoTags).where(and(eq(videoTags.videoId, videoId), eq(videoTags.tagId, tagId))).run();
  return listVideoTags(videoId);
}
