import { randomUUID } from "node:crypto";

import { and, eq, inArray, or, sql } from "drizzle-orm";

import { bootstrapDatabase, comicResources, comics, comicSources, getDb, localFiles } from "@/modules/core/db";
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
  matchedBy: "comic_id" | "source" | "local_title" | "created_remote";
  createdComic: boolean;
  tagCount: number;
  resourceCount: number;
  localReadable: boolean;
}

export interface MetadataSourceStatusInput {
  site: string;
  sourceUrl?: string | null;
  sourceId?: string | null;
  title?: string | null;
  originalTitle?: string | null;
}

export interface MetadataSourceStatusResult {
  imported: boolean;
  matchedBy: "source_id" | "source_url" | null;
  comicId: string | null;
  comicStatus: MetadataImportResult["comicStatus"] | null;
  displayTitle: string | null;
  sourceRecordId: string | null;
  hasLocalFile: boolean;
  isPrimaryFileMissing: boolean;
  localReadable: boolean;
  resourceCount: number;
  localMatchComicId: string | null;
  localMatchDisplayTitle: string | null;
  localMatchStatus: MetadataImportResult["comicStatus"] | null;
  localMatchReadable: boolean;
  localMatchCandidateCount: number;
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

interface ImportComicMatchRecord {
  id: string;
  displayTitle: string;
  originalTitle: string | null;
  metadataQueryTitle: string | null;
  status: MetadataImportResult["comicStatus"];
  primaryLocalFileId: string | null;
  isPrimaryFileMissing: boolean;
}

export async function importMetadataPayload(input: MetadataIngestPayload): Promise<MetadataImportResult> {
  bootstrapDatabase();

  const payload = normalizeMetadataPayload(input);
  const db = getDb();
  const now = new Date().toISOString();
  const existingSource = findExistingSource(payload);
  const explicitComic = payload.comicId ? getImportComicById(payload.comicId) : null;

  if (payload.comicId && !explicitComic) {
    throw new Error("找不到要补充 metadata 的漫画记录。");
  }

  const sourceComic = existingSource ? getImportComicById(existingSource.comicId) : null;
  const localTitleMatch = !explicitComic && !existingSource ? findLocalTitleMatch(payload).match : null;
  const matchedComic = explicitComic ?? sourceComic ?? localTitleMatch;
  const matchedBy: MetadataImportResult["matchedBy"] = explicitComic
    ? "comic_id"
    : existingSource
      ? "source"
      : localTitleMatch
        ? "local_title"
        : "created_remote";
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

  const comic = getImportComicById(comicId);

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
    localReadable: comic.status === "readable" && Boolean(comic.primaryLocalFileId) && !comic.isPrimaryFileMissing,
  };
}

export async function checkMetadataSourceStatus(input: MetadataSourceStatusInput): Promise<MetadataSourceStatusResult> {
  bootstrapDatabase();

  const payload = normalizeSourceStatusInput(input);
  const sourceMatch = findExistingSourceWithMatch(payload);

  if (!sourceMatch.source) {
    const localTitleMatch = findLocalTitleMatch(payload);
    return createEmptySourceStatus(localTitleMatch.match, localTitleMatch.candidateCount);
  }

  const db = getDb();
  const row = db
    .select({
      comicId: comics.id,
      comicStatus: comics.status,
      displayTitle: comics.displayTitle,
      primaryLocalFileId: comics.primaryLocalFileId,
      isPrimaryFileMissing: localFiles.isMissing,
    })
    .from(comics)
    .leftJoin(localFiles, eq(localFiles.id, comics.primaryLocalFileId))
    .where(eq(comics.id, sourceMatch.source.comicId))
    .get();
  const resourceRow = db
    .select({ count: sql<number>`count(*)` })
    .from(comicResources)
    .where(eq(comicResources.comicSourceId, sourceMatch.source.id))
    .get();
  const hasLocalFile = Boolean(row?.primaryLocalFileId);
  const isPrimaryFileMissing = Boolean(row?.isPrimaryFileMissing);

  return {
    imported: true,
    matchedBy: sourceMatch.matchedBy,
    comicId: row?.comicId ?? sourceMatch.source.comicId,
    comicStatus: row?.comicStatus ?? null,
    displayTitle: row?.displayTitle ?? null,
    sourceRecordId: sourceMatch.source.id,
    hasLocalFile,
    isPrimaryFileMissing,
    localReadable: row?.comicStatus === "readable" && hasLocalFile && !isPrimaryFileMissing,
    resourceCount: Number(resourceRow?.count ?? 0),
    localMatchComicId: null,
    localMatchDisplayTitle: null,
    localMatchStatus: null,
    localMatchReadable: false,
    localMatchCandidateCount: 0,
  };
}

function findExistingSource(payload: NormalizedMetadataPayload) {
  return findExistingSourceWithMatch(payload).source;
}

function findExistingSourceWithMatch(payload: { site: string; sourceId: string | null; sourceUrl: string | null }) {
  const db = getDb();

  if (payload.sourceId) {
    const bySourceId = db
      .select()
      .from(comicSources)
      .where(and(eq(comicSources.site, payload.site), eq(comicSources.sourceId, payload.sourceId)))
      .get();

    if (bySourceId) {
      return {
        source: bySourceId,
        matchedBy: "source_id" as const,
      };
    }
  }

  const bySourceUrl = payload.sourceUrl
    ? db
        .select()
        .from(comicSources)
        .where(and(eq(comicSources.site, payload.site), eq(comicSources.sourceUrl, payload.sourceUrl)))
        .get()
    : null;

  return {
    source: bySourceUrl ?? null,
    matchedBy: bySourceUrl ? ("source_url" as const) : null,
  };
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

function normalizeSourceStatusInput(input: MetadataSourceStatusInput) {
  if (!input || typeof input !== "object") {
    throw new Error("Metadata status payload 无效。");
  }

  const site = normalizeRequiredText(input.site, "来源站点").toLowerCase();
  const sourceId = normalizeOptionalText(input.sourceId);
  const sourceUrl = input.sourceUrl ? normalizeHttpUrl(input.sourceUrl, "来源 URL") : null;
  const title = normalizeOptionalText(input.title);
  const originalTitle = normalizeOptionalText(input.originalTitle);

  if (!sourceId && !sourceUrl) {
    throw new Error("来源 ID 和来源 URL 至少需要提供一个。");
  }

  return {
    site,
    sourceId,
    sourceUrl,
    title,
    originalTitle,
  };
}

function createEmptySourceStatus(localMatch: ImportComicMatchRecord | null = null, localMatchCandidateCount = 0): MetadataSourceStatusResult {
  return {
    imported: false,
    matchedBy: null,
    comicId: null,
    comicStatus: null,
    displayTitle: null,
    sourceRecordId: null,
    hasLocalFile: false,
    isPrimaryFileMissing: false,
    localReadable: false,
    resourceCount: 0,
    localMatchComicId: localMatch?.id ?? null,
    localMatchDisplayTitle: localMatch?.displayTitle ?? null,
    localMatchStatus: localMatch?.status ?? null,
    localMatchReadable: Boolean(localMatch && localMatch.status === "readable" && localMatch.primaryLocalFileId && !localMatch.isPrimaryFileMissing),
    localMatchCandidateCount,
  };
}

function getImportComicById(comicId: string): ImportComicMatchRecord | null {
  const row = getDb()
    .select({
      id: comics.id,
      displayTitle: comics.displayTitle,
      originalTitle: comics.originalTitle,
      metadataQueryTitle: comics.metadataQueryTitle,
      status: comics.status,
      primaryLocalFileId: comics.primaryLocalFileId,
      isPrimaryFileMissing: localFiles.isMissing,
    })
    .from(comics)
    .leftJoin(localFiles, eq(localFiles.id, comics.primaryLocalFileId))
    .where(eq(comics.id, comicId))
    .get();

  return row
    ? {
        ...row,
        isPrimaryFileMissing: Boolean(row.isPrimaryFileMissing),
      }
    : null;
}

function findLocalTitleMatch(input: { title: string | null; originalTitle: string | null }) {
  const sortTitles = Array.from(new Set([input.title, input.originalTitle].map((title) => (title ? normalizeSortTitle(title) : "")).filter(Boolean)));

  if (sortTitles.length === 0) {
    return {
      match: null,
      candidateCount: 0,
    };
  }

  const rows = getDb()
    .select({
      id: comics.id,
      displayTitle: comics.displayTitle,
      originalTitle: comics.originalTitle,
      metadataQueryTitle: comics.metadataQueryTitle,
      status: comics.status,
      primaryLocalFileId: comics.primaryLocalFileId,
      isPrimaryFileMissing: localFiles.isMissing,
    })
    .from(comics)
    .leftJoin(localFiles, eq(localFiles.id, comics.primaryLocalFileId))
    .where(
      and(
        inArray(comics.sortTitle, sortTitles),
        sql`${comics.primaryLocalFileId} is not null`,
        or(eq(comics.status, "readable"), eq(comics.status, "missing_local_file")),
      ),
    )
    .all()
    .map((row) => ({
      ...row,
      isPrimaryFileMissing: Boolean(row.isPrimaryFileMissing),
    }));

  return {
    match: rows.length === 1 ? rows[0] : null,
    candidateCount: rows.length,
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
