import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { bootstrapDatabase, comicResources, comics, comicSources, getDb } from "@/modules/core/db";
import { normalizeSortTitle } from "@/modules/library/title-utils";
import { createComicTagAssignmentRepository } from "@/modules/tags/comic-tags.repository";
import { createTagRepository } from "@/modules/tags/tags.repository";

export type MetadataResourceType = "magnet" | "torrent" | "http" | "openlist";

export interface MetadataIngestTagInput {
  namespace: string;
  name: string;
  displayNameZh?: string | null;
}

export interface MetadataIngestResourceInput {
  type: MetadataResourceType;
  url: string;
  label?: string | null;
}

export interface MetadataIngestPayload {
  comicId?: string;
  site: string;
  sourceUrl: string;
  sourceId?: string | null;
  title?: string | null;
  originalTitle?: string | null;
  coverUrl?: string | null;
  tags?: MetadataIngestTagInput[];
  resources?: MetadataIngestResourceInput[];
}

export interface MetadataImportResult {
  comicId: string;
  comicStatus: "readable" | "missing_local_file" | "remote_only" | "hidden" | "deleted";
  sourceRecordId: string;
  matchedBy: "comic_id" | "source" | "created_remote";
  createdComic: boolean;
  tagCount: number;
  resourceCount: number;
  localReadable: boolean;
}

interface NormalizedMetadataPayload {
  comicId: string | null;
  site: string;
  sourceUrl: string;
  sourceId: string | null;
  title: string;
  originalTitle: string | null;
  coverUrl: string | null;
  tags: MetadataIngestTagInput[];
  resources: Array<Required<MetadataIngestResourceInput> & { redactedResource: string }>;
}

export async function importMetadataPayload(input: MetadataIngestPayload): Promise<MetadataImportResult> {
  bootstrapDatabase();

  const payload = normalizeMetadataPayload(input);
  const db = getDb();
  const now = new Date().toISOString();
  const existingSource = findExistingSource(payload);
  const explicitComic = payload.comicId
    ? db.select().from(comics).where(eq(comics.id, payload.comicId)).get()
    : null;

  if (payload.comicId && !explicitComic) {
    throw new Error("找不到要补充 metadata 的漫画记录。");
  }

  const matchedComic = explicitComic ?? (existingSource ? db.select().from(comics).where(eq(comics.id, existingSource.comicId)).get() : null);
  const matchedBy: MetadataImportResult["matchedBy"] = explicitComic ? "comic_id" : existingSource ? "source" : "created_remote";
  const comicId = matchedComic?.id ?? randomUUID();
  const createdComic = !matchedComic;
  const sourceRecordId = existingSource?.id ?? randomUUID();

  db.transaction((tx) => {
    if (!matchedComic) {
      tx.insert(comics)
        .values({
          id: comicId,
          displayTitle: payload.title,
          fileTitle: payload.title,
          originalTitle: payload.originalTitle,
          metadataQueryTitle: payload.title,
          sortTitle: normalizeSortTitle(payload.title),
          status: "remote_only",
          updatedAt: now,
        })
        .run();
    } else {
      tx.update(comics)
        .set({
          originalTitle: matchedComic.originalTitle ?? payload.originalTitle,
          metadataQueryTitle: matchedComic.metadataQueryTitle ?? payload.title,
          updatedAt: now,
        })
        .where(eq(comics.id, comicId))
        .run();
    }

    if (existingSource) {
      tx.update(comicSources)
        .set({
          comicId,
          sourceUrl: payload.sourceUrl,
          originalTitle: payload.originalTitle ?? payload.title,
          coverUrl: payload.coverUrl,
          rawMetadataJson: JSON.stringify(input),
          updatedAt: now,
        })
        .where(eq(comicSources.id, sourceRecordId))
        .run();
    } else {
      tx.insert(comicSources)
        .values({
          id: sourceRecordId,
          comicId,
          site: payload.site,
          sourceId: payload.sourceId,
          sourceUrl: payload.sourceUrl,
          originalTitle: payload.originalTitle ?? payload.title,
          coverUrl: payload.coverUrl,
          rawMetadataJson: JSON.stringify(input),
          updatedAt: now,
        })
        .run();
    }

    for (const resource of payload.resources) {
      const existingResource = tx
        .select({ id: comicResources.id })
        .from(comicResources)
        .where(
          and(
            eq(comicResources.comicId, comicId),
            eq(comicResources.comicSourceId, sourceRecordId),
            eq(comicResources.resourceType, resource.type),
            eq(comicResources.resourceUrl, resource.url),
          ),
        )
        .get();

      if (existingResource) {
        tx.update(comicResources)
          .set({
            displayLabel: resource.label,
            redactedResource: resource.redactedResource,
            updatedAt: now,
          })
          .where(eq(comicResources.id, existingResource.id))
          .run();
        continue;
      }

      tx.insert(comicResources)
        .values({
          id: randomUUID(),
          comicId,
          comicSourceId: sourceRecordId,
          resourceType: resource.type,
          displayLabel: resource.label,
          resourceUrl: resource.url,
          redactedResource: resource.redactedResource,
          updatedAt: now,
        })
        .run();
    }
  });

  const tagRepository = createTagRepository();
  const comicTagRepository = createComicTagAssignmentRepository();

  for (const tagInput of payload.tags) {
    const tag = await tagRepository.upsert(tagInput);
    await comicTagRepository.addMetadataToComic(comicId, tag.id);
  }

  const comic = db.select({ status: comics.status, primaryLocalFileId: comics.primaryLocalFileId }).from(comics).where(eq(comics.id, comicId)).get();

  if (!comic) {
    throw new Error("保存 metadata 后找不到漫画记录。");
  }

  return {
    comicId,
    comicStatus: comic.status,
    sourceRecordId,
    matchedBy,
    createdComic,
    tagCount: payload.tags.length,
    resourceCount: payload.resources.length,
    localReadable: comic.status === "readable" && Boolean(comic.primaryLocalFileId),
  };
}

function findExistingSource(payload: NormalizedMetadataPayload) {
  const db = getDb();

  if (payload.sourceId) {
    const bySourceId = db
      .select()
      .from(comicSources)
      .where(and(eq(comicSources.site, payload.site), eq(comicSources.sourceId, payload.sourceId)))
      .get();

    if (bySourceId) {
      return bySourceId;
    }
  }

  return db
    .select()
    .from(comicSources)
    .where(and(eq(comicSources.site, payload.site), eq(comicSources.sourceUrl, payload.sourceUrl)))
    .get();
}

function normalizeMetadataPayload(input: MetadataIngestPayload): NormalizedMetadataPayload {
  if (!input || typeof input !== "object") {
    throw new Error("Metadata payload 无效。");
  }

  const site = normalizeRequiredText(input.site, "来源站点").toLowerCase();
  const sourceUrl = normalizeHttpUrl(input.sourceUrl, "来源 URL");
  const sourceId = normalizeOptionalText(input.sourceId);
  const title = normalizeOptionalText(input.title) ?? inferTitleFromUrl(sourceUrl);
  const originalTitle = normalizeOptionalText(input.originalTitle);
  const coverUrl = input.coverUrl ? normalizeHttpUrl(input.coverUrl, "封面 URL") : null;
  const tags = normalizeTags(input.tags);
  const resources = normalizeResources(input.resources);

  return {
    comicId: normalizeOptionalText(input.comicId),
    site,
    sourceUrl,
    sourceId,
    title,
    originalTitle,
    coverUrl,
    tags,
    resources,
  };
}

function normalizeTags(input: MetadataIngestPayload["tags"]): MetadataIngestTagInput[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const seen = new Set<string>();
  const result: MetadataIngestTagInput[] = [];

  for (const tag of input.slice(0, 120)) {
    if (!tag || typeof tag !== "object") {
      continue;
    }

    const namespace = normalizeOptionalText(tag.namespace)?.toLowerCase();
    const name = normalizeOptionalText(tag.name)?.toLowerCase();

    if (!namespace || !name) {
      continue;
    }

    const key = `${namespace}:${name}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push({
      namespace,
      name,
      displayNameZh: normalizeOptionalText(tag.displayNameZh),
    });
  }

  return result;
}

function normalizeResources(input: MetadataIngestPayload["resources"]): NormalizedMetadataPayload["resources"] {
  if (!Array.isArray(input)) {
    return [];
  }

  const seen = new Set<string>();
  const result: NormalizedMetadataPayload["resources"] = [];

  for (const resource of input.slice(0, 24)) {
    if (!resource || typeof resource !== "object" || !isMetadataResourceType(resource.type)) {
      continue;
    }

    const url = normalizeResourceUrl(resource.type, resource.url);
    const key = `${resource.type}:${url}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push({
      type: resource.type,
      url,
      label: normalizeOptionalText(resource.label) ?? resource.type,
      redactedResource: redactResource(resource.type, url),
    });
  }

  return result;
}

function normalizeRequiredText(value: unknown, label: string) {
  const text = normalizeOptionalText(value);

  if (!text) {
    throw new Error(`${label}不能为空。`);
  }

  return text;
}

function normalizeOptionalText(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const text = value.trim();
  return text ? text.slice(0, 2048) : null;
}

function normalizeHttpUrl(value: unknown, label: string) {
  const text = normalizeRequiredText(value, label);

  try {
    const url = new URL(text);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error();
    }
    return url.toString();
  } catch {
    throw new Error(`${label}必须是 http 或 https URL。`);
  }
}

function normalizeResourceUrl(type: MetadataResourceType, value: unknown) {
  const text = normalizeRequiredText(value, "资源链接");

  if (type === "magnet") {
    if (!text.toLowerCase().startsWith("magnet:?")) {
      throw new Error("磁链资源必须以 magnet:? 开头。");
    }
    return text;
  }

  if (type === "openlist") {
    return text;
  }

  return normalizeHttpUrl(text, "资源链接");
}

function isMetadataResourceType(value: unknown): value is MetadataResourceType {
  return value === "magnet" || value === "torrent" || value === "http" || value === "openlist";
}

function inferTitleFromUrl(sourceUrl: string) {
  const url = new URL(sourceUrl);
  const tail = url.pathname.split("/").filter(Boolean).pop();
  return tail ? decodeURIComponent(tail).slice(0, 240) : `${url.hostname} metadata`;
}

function redactResource(type: MetadataResourceType, url: string) {
  if (type === "magnet") {
    const match = /btih:([a-z0-9]+)/i.exec(url);
    return match ? `magnet:?xt=urn:btih:${match[1].slice(0, 8)}...` : "magnet:?...";
  }

  if (type === "openlist") {
    return "openlist:...";
  }

  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname ? "/..." : ""}`;
  } catch {
    return `${type}:...`;
  }
}
