import { and, asc, eq } from "drizzle-orm";

import { bootstrapDatabase, comicTags, comics, getDb, tags } from "@/modules/core/db";

import type { CanonicalTag } from ".";

export interface AssignedComicTag extends CanonicalTag {
  source: "scan" | "metadata" | "manual";
  isUserEdited: boolean;
  assignedAt: string;
}

export interface ComicTagAssignmentRepository {
  listForComic(comicId: string): Promise<AssignedComicTag[]>;
  addToComic(comicId: string, tagId: string): Promise<AssignedComicTag[]>;
  removeFromComic(comicId: string, tagId: string): Promise<AssignedComicTag[]>;
}

export function createComicTagAssignmentRepository(): ComicTagAssignmentRepository {
  return {
    listForComic: listComicTags,

    async addToComic(comicId, tagId) {
      bootstrapDatabase();
      const db = getDb();
      const now = new Date().toISOString();

      ensureComicExists(comicId);
      ensureTagExists(tagId);

      const existing = db
        .select({ comicId: comicTags.comicId })
        .from(comicTags)
        .where(and(eq(comicTags.comicId, comicId), eq(comicTags.tagId, tagId)))
        .get();

      if (!existing) {
        db.insert(comicTags)
          .values({
            comicId,
            tagId,
            source: "manual",
            isUserEdited: true,
            createdAt: now,
            updatedAt: now,
          })
          .run();
      }

      return listComicTags(comicId);
    },

    async removeFromComic(comicId, tagId) {
      bootstrapDatabase();
      const db = getDb();

      ensureComicExists(comicId);
      ensureTagExists(tagId);

      db.delete(comicTags)
        .where(and(eq(comicTags.comicId, comicId), eq(comicTags.tagId, tagId)))
        .run();

      return listComicTags(comicId);
    },
  };
}

async function listComicTags(comicId: string): Promise<AssignedComicTag[]> {
  bootstrapDatabase();
  const db = getDb();

  const rows = db
    .select({
      id: tags.id,
      namespace: tags.namespace,
      name: tags.name,
      canonical: tags.canonical,
      displayNameZh: tags.displayNameZh,
      source: comicTags.source,
      isUserEdited: comicTags.isUserEdited,
      assignedAt: comicTags.createdAt,
    })
    .from(comicTags)
    .innerJoin(tags, eq(tags.id, comicTags.tagId))
    .where(eq(comicTags.comicId, comicId))
    .orderBy(asc(tags.namespace), asc(tags.name))
    .all();

  return rows.map((row) => ({
    ...row,
    isUserEdited: Boolean(row.isUserEdited),
  }));
}

function ensureComicExists(comicId: string) {
  const row = getDb().select({ id: comics.id }).from(comics).where(eq(comics.id, comicId)).get();

  if (!row) {
    throw new Error("找不到漫画记录。");
  }
}

function ensureTagExists(tagId: string) {
  const row = getDb().select({ id: tags.id }).from(tags).where(eq(tags.id, tagId)).get();

  if (!row) {
    throw new Error("找不到标签。");
  }
}
