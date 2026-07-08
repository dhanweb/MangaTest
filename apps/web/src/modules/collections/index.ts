import { randomUUID } from "node:crypto";

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import {
  bootstrapDatabase,
  collectionComics,
  collections,
  comics,
  getDb,
  localFiles,
  operationLogs,
} from "@/modules/core/db";
import type { LibraryComicCardRecord } from "@/modules/library";

export const COLLECTION_KINDS = ["collection", "queue"] as const;
export type CollectionKind = (typeof COLLECTION_KINDS)[number];

export const COLLECTION_SORT_MODES = ["manual", "recent_added", "title"] as const;
export type CollectionSortMode = (typeof COLLECTION_SORT_MODES)[number];

const COLLECTION_EVENT_OPERATIONS = [
  "collection_create",
  "collection_update",
  "collection_delete",
  "collection_add_comic",
  "collection_remove_comic",
  "collection_reorder",
] as const;
export type CollectionEventOperation = (typeof COLLECTION_EVENT_OPERATIONS)[number];

export interface CollectionDraft {
  name: string;
  description?: string;
  kind?: CollectionKind;
  sortMode?: CollectionSortMode;
}

export interface CollectionUpdateInput {
  name?: string;
  description?: string | null;
  sortMode?: CollectionSortMode;
  isEnabled?: boolean;
}

export interface CollectionRecord {
  id: string;
  name: string;
  description: string | null;
  kind: CollectionKind;
  sortMode: CollectionSortMode;
  isEnabled: boolean;
  comicCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CollectionItemRecord extends LibraryComicCardRecord {
  sortOrder: number;
  addedAt: string;
}

export interface CollectionDetailRecord extends CollectionRecord {
  items: CollectionItemRecord[];
}

export interface CollectionEventRecord {
  id: string;
  operation: CollectionEventOperation;
  collectionId: string;
  collectionName: string;
  summary: string;
  detail: Record<string, unknown> | null;
  createdAt: string;
}

export interface CollectionRepository {
  list(limit?: number): Promise<CollectionRecord[]>;
  getDetail(id: string): Promise<CollectionDetailRecord | null>;
  create(draft: CollectionDraft): Promise<CollectionRecord>;
  update(id: string, input: CollectionUpdateInput): Promise<CollectionRecord>;
  remove(id: string): Promise<void>;
  addComic(id: string, comicId: string): Promise<CollectionRecord>;
  removeComic(id: string, comicId: string): Promise<CollectionRecord>;
  reorder(id: string, comicIds: string[]): Promise<CollectionRecord>;
  listEvents(limit?: number): Promise<CollectionEventRecord[]>;
  findQueueContaining(comicId: string): Promise<CollectionRecord | null>;
  getQueueContext(comicId: string): Promise<QueueContextRecord | null>;
}

export interface QueueContextRecord {
  queue: CollectionRecord;
  currentComicId: string;
  nextComicId: string | null;
  nextComicTitle: string | null;
  position: number;
  total: number;
}

export function createCollectionRepository(): CollectionRepository {
  return {
    async list(limit = 50) {
      bootstrapDatabase();
      const rows = getDb()
        .select({
          id: collections.id,
          name: collections.name,
          description: collections.description,
          kind: collections.kind,
          sortMode: collections.sortMode,
          isEnabled: collections.isEnabled,
          createdAt: collections.createdAt,
          updatedAt: collections.updatedAt,
          comicCount: sql<number>`(select count(*) from collection_comics where collection_comics.collection_id = ${collections.id})`,
        })
        .from(collections)
        .orderBy(desc(collections.updatedAt))
        .limit(normalizeLimit(limit))
        .all();

      return rows.map(mapCollectionRow);
    },

    async getDetail(id) {
      bootstrapDatabase();
      const row = getDb()
        .select({
          id: collections.id,
          name: collections.name,
          description: collections.description,
          kind: collections.kind,
          sortMode: collections.sortMode,
          isEnabled: collections.isEnabled,
          createdAt: collections.createdAt,
          updatedAt: collections.updatedAt,
        })
        .from(collections)
        .where(eq(collections.id, id))
        .get();

      if (!row) {
        return null;
      }

      const items = listCollectionItems(id, row.sortMode as CollectionSortMode);

      return {
        ...mapCollectionRow({ ...row, comicCount: items.length }),
        items,
      };
    },

    async create(draft) {
      bootstrapDatabase();
      const name = normalizeRequiredText(draft.name, "收藏夹名称");
      const kind = normalizeCollectionKind(draft.kind);
      const sortMode = normalizeCollectionSortMode(draft.sortMode);
      const description = normalizeDescription(draft.description);
      const id = randomUUID();
      const now = new Date().toISOString();

      getDb()
        .insert(collections)
        .values({
          id,
          name,
          description,
          kind,
          sortMode,
          isEnabled: true,
          updatedAt: now,
        })
        .run();

      const record = getCollectionById(id);
      if (!record) {
        throw new Error("创建收藏夹失败。");
      }

      recordCollectionEvent(record, "collection_create", { name });
      return record;
    },

    async update(id, input) {
      bootstrapDatabase();
      const existing = getCollectionById(id);
      if (!existing) {
        throw new Error("找不到收藏夹。");
      }

      const values: Partial<typeof collections.$inferInsert> = { updatedAt: new Date().toISOString() };
      if (typeof input.name === "string") {
        values.name = normalizeRequiredText(input.name, "收藏夹名称");
      }
      if (input.description !== undefined) {
        values.description = normalizeDescription(input.description);
      }
      if (input.sortMode !== undefined) {
        values.sortMode = normalizeCollectionSortMode(input.sortMode);
      }
      if (typeof input.isEnabled === "boolean") {
        values.isEnabled = input.isEnabled;
      }

      getDb().update(collections).set(values).where(eq(collections.id, id)).run();

      const updated = getCollectionById(id);
      if (!updated) {
        throw new Error("读取更新后的收藏夹失败。");
      }

      recordCollectionEvent(updated, "collection_update", {
        previousName: existing.name,
        name: updated.name,
      });
      return updated;
    },

    async remove(id) {
      bootstrapDatabase();
      const existing = getCollectionById(id);
      if (!existing) {
        throw new Error("找不到收藏夹。");
      }

      getDb().transaction((tx) => {
        tx.delete(collectionComics).where(eq(collectionComics.collectionId, id)).run();
        tx.delete(collections).where(eq(collections.id, id)).run();
      });

      recordCollectionEvent(existing, "collection_delete", { name: existing.name });
    },

    async addComic(id, comicId) {
      bootstrapDatabase();
      const collection = getCollectionById(id);
      if (!collection) {
        throw new Error("找不到收藏夹。");
      }

      const comicRow = getDb()
        .select({ id: comics.id, displayTitle: comics.displayTitle, status: comics.status })
        .from(comics)
        .where(eq(comics.id, comicId))
        .get();
      if (!comicRow) {
        throw new Error("找不到漫画。");
      }
      if (comicRow.status !== "readable") {
        throw new Error("只能把可读漫画加入收藏夹。");
      }

      const existingMembership = getDb()
        .select({ sortOrder: collectionComics.sortOrder })
        .from(collectionComics)
        .where(and(eq(collectionComics.collectionId, id), eq(collectionComics.comicId, comicId)))
        .get();
      if (existingMembership) {
        return collection;
      }

      const maxOrderRow = getDb()
        .select({ maxOrder: sql<number>`coalesce(max(${collectionComics.sortOrder}), -1)` })
        .from(collectionComics)
        .where(eq(collectionComics.collectionId, id))
        .get();
      const nextOrder = Number(maxOrderRow?.maxOrder ?? -1) + 1;
      const now = new Date().toISOString();

      getDb()
        .insert(collectionComics)
        .values({
          collectionId: id,
          comicId,
          sortOrder: nextOrder,
          updatedAt: now,
        })
        .run();

      getDb().update(collections).set({ updatedAt: now }).where(eq(collections.id, id)).run();

      const updated = getCollectionById(id);
      if (!updated) {
        throw new Error("读取收藏夹失败。");
      }

      recordCollectionEvent(updated, "collection_add_comic", {
        comicId,
        comicTitle: comicRow.displayTitle,
      });
      return updated;
    },

    async removeComic(id, comicId) {
      bootstrapDatabase();
      const collection = getCollectionById(id);
      if (!collection) {
        throw new Error("找不到收藏夹。");
      }

      const membership = getDb()
        .select({ collectionId: collectionComics.collectionId })
        .from(collectionComics)
        .where(and(eq(collectionComics.collectionId, id), eq(collectionComics.comicId, comicId)))
        .get();
      if (!membership) {
        return collection;
      }

      const comicRow = getDb()
        .select({ displayTitle: comics.displayTitle })
        .from(comics)
        .where(eq(comics.id, comicId))
        .get();
      const now = new Date().toISOString();

      getDb()
        .delete(collectionComics)
        .where(and(eq(collectionComics.collectionId, id), eq(collectionComics.comicId, comicId)))
        .run();
      getDb().update(collections).set({ updatedAt: now }).where(eq(collections.id, id)).run();

      const updated = getCollectionById(id);
      if (!updated) {
        throw new Error("读取收藏夹失败。");
      }

      recordCollectionEvent(updated, "collection_remove_comic", {
        comicId,
        comicTitle: comicRow?.displayTitle ?? "未知漫画",
      });
      return updated;
    },

    async reorder(id, comicIds) {
      bootstrapDatabase();
      const collection = getCollectionById(id);
      if (!collection) {
        throw new Error("找不到收藏夹。");
      }
      if (!Array.isArray(comicIds) || comicIds.some((value) => typeof value !== "string")) {
        throw new Error("排序漫画 ID 列表无效。");
      }

      const now = new Date().toISOString();
      getDb().transaction((tx) => {
        comicIds.forEach((comicId, index) => {
          tx.update(collectionComics)
            .set({ sortOrder: index, updatedAt: now })
            .where(and(eq(collectionComics.collectionId, id), eq(collectionComics.comicId, comicId)))
            .run();
        });
      });

      getDb().update(collections).set({ updatedAt: now }).where(eq(collections.id, id)).run();

      const updated = getCollectionById(id);
      if (!updated) {
        throw new Error("读取收藏夹失败。");
      }

      recordCollectionEvent(updated, "collection_reorder", { count: comicIds.length });
      return updated;
    },

    async listEvents(limit = 20) {
      bootstrapDatabase();
      const rows = getDb()
        .select({
          id: operationLogs.id,
          operation: operationLogs.operation,
          targetId: operationLogs.targetId,
          summary: operationLogs.summary,
          detailJson: operationLogs.detailJson,
          createdAt: operationLogs.createdAt,
        })
        .from(operationLogs)
        .where(
          and(eq(operationLogs.targetType, "collection"), inArray(operationLogs.operation, [...COLLECTION_EVENT_OPERATIONS])),
        )
        .orderBy(desc(operationLogs.createdAt))
        .limit(normalizeLimit(limit))
        .all();

      return rows.flatMap((row) => {
        if (!isCollectionEventOperation(row.operation)) {
          return [];
        }
        const detail = parseCollectionEventDetail(row.detailJson);
        return [
          {
            id: row.id,
            operation: row.operation,
            collectionId: detail?.collectionId ?? row.targetId,
            collectionName: detail?.collectionName ?? "收藏夹",
            summary: row.summary,
            detail: detail?.detail ?? null,
            createdAt: row.createdAt,
          },
        ];
      });
    },

    async findQueueContaining(comicId) {
      bootstrapDatabase();
      const row = getDb()
        .select({
          id: collections.id,
          name: collections.name,
          description: collections.description,
          kind: collections.kind,
          sortMode: collections.sortMode,
          isEnabled: collections.isEnabled,
          createdAt: collections.createdAt,
          updatedAt: collections.updatedAt,
          comicCount: sql<number>`(select count(*) from collection_comics where collection_comics.collection_id = ${collections.id})`,
        })
        .from(collections)
        .innerJoin(collectionComics, eq(collectionComics.collectionId, collections.id))
        .where(and(eq(collectionComics.comicId, comicId), eq(collections.kind, "queue"), eq(collections.isEnabled, true)))
        .orderBy(desc(collections.updatedAt))
        .limit(1)
        .get();

      return row ? mapCollectionRow(row) : null;
    },

    async getQueueContext(comicId) {
      bootstrapDatabase();
      const queue = await this.findQueueContaining(comicId);
      if (!queue) {
        return null;
      }

      const items = listCollectionItems(queue.id, queue.sortMode);
      const currentIndex = items.findIndex((item) => item.id === comicId);
      if (currentIndex < 0) {
        return null;
      }

      const next = currentIndex + 1 < items.length ? items[currentIndex + 1] : null;

      return {
        queue,
        currentComicId: comicId,
        nextComicId: next?.id ?? null,
        nextComicTitle: next?.displayTitle ?? null,
        position: currentIndex + 1,
        total: items.length,
      };
    },
  };
}

function getCollectionById(id: string): CollectionRecord | null {
  const row = getDb()
    .select({
      id: collections.id,
      name: collections.name,
      description: collections.description,
      kind: collections.kind,
      sortMode: collections.sortMode,
      isEnabled: collections.isEnabled,
      createdAt: collections.createdAt,
      updatedAt: collections.updatedAt,
      comicCount: sql<number>`(select count(*) from collection_comics where collection_comics.collection_id = ${collections.id})`,
    })
    .from(collections)
    .where(eq(collections.id, id))
    .get();

  return row ? mapCollectionRow(row) : null;
}

function listCollectionItems(collectionId: string, sortMode: CollectionSortMode): CollectionItemRecord[] {
  const orderClause =
    sortMode === "title"
      ? asc(comics.sortTitle)
      : sortMode === "recent_added"
        ? desc(collectionComics.addedAt)
        : asc(collectionComics.sortOrder);

  const rows = getDb()
    .select({
      id: comics.id,
      displayTitle: comics.displayTitle,
      fileTitle: comics.fileTitle,
      status: comics.status,
      primaryLocalFileId: comics.primaryLocalFileId,
      pageCount: sql<number>`(select count(*) from pages join chapters on chapters.id = pages.chapter_id where chapters.comic_id = ${comics.id})`,
      chapterCount: sql<number>`(select count(*) from chapters where chapters.comic_id = ${comics.id})`,
      sortOrder: collectionComics.sortOrder,
      membershipAddedAt: collectionComics.addedAt,
      localFileKind: localFiles.kind,
    })
    .from(collectionComics)
    .innerJoin(comics, eq(comics.id, collectionComics.comicId))
    .leftJoin(localFiles, eq(localFiles.id, comics.primaryLocalFileId))
    .where(and(eq(collectionComics.collectionId, collectionId), eq(comics.status, "readable")))
    .orderBy(orderClause)
    .all();

  return rows.map((row) => ({
    id: row.id,
    displayTitle: row.displayTitle,
    fileTitle: row.fileTitle,
    status: row.status as CollectionItemRecord["status"],
    primaryLocalFileId: row.primaryLocalFileId,
    localFileKind: (row.localFileKind as CollectionItemRecord["localFileKind"]) ?? null,
    pageCount: Number(row.pageCount ?? 0),
    chapterCount: Number(row.chapterCount ?? 0),
    addedAt: row.membershipAddedAt,
    sortOrder: Number(row.sortOrder ?? 0),
  }));
}

function mapCollectionRow(row: {
  id: string;
  name: string;
  description: string | null;
  kind: string;
  sortMode: string;
  isEnabled: boolean | number;
  createdAt: string;
  updatedAt: string;
  comicCount: number | string | null;
}): CollectionRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    kind: normalizeCollectionKind(row.kind),
    sortMode: normalizeCollectionSortMode(row.sortMode),
    isEnabled: Boolean(row.isEnabled),
    comicCount: Number(row.comicCount ?? 0),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function recordCollectionEvent(
  collection: CollectionRecord,
  operation: CollectionEventOperation,
  detail: Record<string, unknown>,
) {
  getDb()
    .insert(operationLogs)
    .values({
      id: randomUUID(),
      operation,
      targetType: "collection",
      targetId: collection.id,
      summary: formatCollectionEventSummary(operation, collection, detail),
      detailJson: JSON.stringify({
        collectionId: collection.id,
        collectionName: collection.name,
        ...detail,
      }),
    })
    .run();
}

function formatCollectionEventSummary(
  operation: CollectionEventOperation,
  collection: CollectionRecord,
  detail: Record<string, unknown>,
) {
  const name = collection.name;
  switch (operation) {
    case "collection_create":
      return `创建收藏夹：${name}`;
    case "collection_update":
      return `更新收藏夹：${name}`;
    case "collection_delete":
      return `删除收藏夹：${name}`;
    case "collection_add_comic":
      return `加入收藏夹 ${name}：${String(detail.comicTitle ?? "漫画")}`;
    case "collection_remove_comic":
      return `移出收藏夹 ${name}：${String(detail.comicTitle ?? "漫画")}`;
    case "collection_reorder":
      return `重新排序收藏夹：${name}（${Number(detail.count ?? 0)} 本）`;
    default:
      return `收藏夹操作：${name}`;
  }
}

function parseCollectionEventDetail(value: string | null): {
  collectionId: string;
  collectionName: string;
  detail: Record<string, unknown>;
} | null {
  if (!value) {
    return null;
  }
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (typeof parsed.collectionId !== "string" || typeof parsed.collectionName !== "string") {
      return null;
    }
    return {
      collectionId: parsed.collectionId,
      collectionName: parsed.collectionName,
      detail: parsed,
    };
  } catch {
    return null;
  }
}

function normalizeRequiredText(value: unknown, label: string) {
  if (typeof value !== "string") {
    throw new Error(`${label}不能为空。`);
  }
  const text = value.trim();
  if (!text) {
    throw new Error(`${label}不能为空。`);
  }
  if (text.length > 80) {
    throw new Error(`${label}不能超过 80 个字符。`);
  }
  return text;
}

function normalizeDescription(value: unknown) {
  if (value == null) {
    return null;
  }
  if (typeof value !== "string") {
    return null;
  }
  const text = value.trim();
  if (!text) {
    return null;
  }
  return text.slice(0, 280);
}

function normalizeCollectionKind(value: unknown): CollectionKind {
  if (value === "collection" || value === "queue") {
    return value;
  }
  return "collection";
}

function normalizeCollectionSortMode(value: unknown): CollectionSortMode {
  if (value === "manual" || value === "recent_added" || value === "title") {
    return value;
  }
  return "manual";
}

function normalizeLimit(value: number) {
  return Math.max(1, Math.min(200, Math.trunc(value)));
}

function isCollectionEventOperation(value: unknown): value is CollectionEventOperation {
  return COLLECTION_EVENT_OPERATIONS.includes(value as CollectionEventOperation);
}
