import { randomUUID } from "node:crypto";

import { asc, eq, sql } from "drizzle-orm";

import { bootstrapDatabase, comicTags, getDb, tags } from "@/modules/core/db";

import { createCanonicalTag, type CanonicalTag } from ".";

export interface SaveTagInput {
  namespace: string;
  name: string;
  displayNameZh?: string | null;
}

export interface TagRepository {
  listWithCounts(): Promise<Array<CanonicalTag & { comicCount: number }>>;
  create(input: SaveTagInput): Promise<CanonicalTag>;
  upsert(input: SaveTagInput): Promise<CanonicalTag>;
  update(id: string, input: SaveTagInput): Promise<CanonicalTag | null>;
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

    async create(input) {
      bootstrapDatabase();
      const db = getDb();
      const tag = normalizeTagInput(input);
      const id = randomUUID();

      db.insert(tags)
        .values({
          id,
          ...tag,
        })
        .run();

      return { id, ...tag };
    },

    async upsert(input) {
      bootstrapDatabase();
      const db = getDb();
      const tag = normalizeTagInput(input);
      const now = new Date().toISOString();

      db.insert(tags)
        .values({
          id: randomUUID(),
          ...tag,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: tags.canonical,
          set: {
            namespace: tag.namespace,
            name: tag.name,
            displayNameZh: tag.displayNameZh ? tag.displayNameZh : sql`coalesce(${tags.displayNameZh}, excluded.display_name_zh)`,
            updatedAt: now,
          },
        })
        .run();

      const row = db
        .select({
          id: tags.id,
          namespace: tags.namespace,
          name: tags.name,
          canonical: tags.canonical,
          displayNameZh: tags.displayNameZh,
        })
        .from(tags)
        .where(eq(tags.canonical, tag.canonical))
        .get();

      if (!row) {
        throw new Error("保存标签失败。");
      }

      return row;
    },

    async update(id, input) {
      bootstrapDatabase();
      const db = getDb();
      const tag = normalizeTagInput(input);
      const now = new Date().toISOString();

      db.update(tags)
        .set({
          ...tag,
          updatedAt: now,
        })
        .where(eq(tags.id, id))
        .run();

      const row = db
        .select({
          id: tags.id,
          namespace: tags.namespace,
          name: tags.name,
          canonical: tags.canonical,
          displayNameZh: tags.displayNameZh,
        })
        .from(tags)
        .where(eq(tags.id, id))
        .get();

      return row ?? null;
    },
  };
}

function normalizeTagInput(input: SaveTagInput) {
  const namespace = input.namespace.trim().toLowerCase();
  const name = input.name.trim().toLowerCase();

  if (!namespace || !name) {
    throw new Error("标签分类和名称不能为空。");
  }

  return {
    namespace,
    name,
    canonical: createCanonicalTag(namespace, name),
    displayNameZh: input.displayNameZh?.trim() || null,
  };
}
