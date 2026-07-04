import { asc, sql } from "drizzle-orm";

import { bootstrapDatabase, comicTags, getDb, tags } from "@/modules/core/db";

import type { CanonicalTag } from ".";

export interface TagRepository {
  listWithCounts(): Promise<Array<CanonicalTag & { comicCount: number }>>;
}

export function createTagRepository(): TagRepository {
  return {
    async listWithCounts() {
      bootstrapDatabase();
      const db = getDb();

      const rows = db
        .select({
          id: tags.id,
          namespace: tags.namespace,
          name: tags.name,
          canonical: tags.canonical,
          displayNameZh: tags.displayNameZh,
          comicCount: sql<number>`count(distinct ${comicTags.comicId})`,
        })
        .from(tags)
        .leftJoin(comicTags, sql`${comicTags.tagId} = ${tags.id}`)
        .groupBy(tags.id)
        .orderBy(asc(tags.namespace), asc(tags.name))
        .all();

      return rows.map((row) => ({
        ...row,
        comicCount: Number(row.comicCount),
      }));
    },
  };
}
