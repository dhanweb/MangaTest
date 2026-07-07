import { randomUUID } from "node:crypto";
import path from "node:path";

import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { bootstrapDatabase, comicResources, comics, comicSources, downloadTasks, getDb } from "@/modules/core/db";

export const DOWNLOAD_PROVIDERS = ["openlist", "builtin-http", "aria2"] as const;
export type DownloadProvider = (typeof DOWNLOAD_PROVIDERS)[number];

export const DOWNLOAD_TASK_STATUSES = ["queued", "running", "failed", "completed", "cancel_requested", "canceled"] as const;
export type DownloadTaskStatus = (typeof DOWNLOAD_TASK_STATUSES)[number];

export const COMIC_RESOURCE_TYPES = ["magnet", "torrent", "http", "openlist"] as const;
export type ComicResourceType = (typeof COMIC_RESOURCE_TYPES)[number];

export interface CreateDownloadTaskInput {
  comicResourceId: string;
  provider?: DownloadProvider;
  targetDirectory?: string | null;
}

export interface CreateDownloadTaskResult {
  created: boolean;
  task: DownloadTaskRecord;
}

export interface DownloadableResourceRecord {
  id: string;
  comicId: string;
  comicTitle: string;
  comicStatus: "readable" | "missing_local_file" | "remote_only" | "hidden" | "deleted";
  sourceSite: string | null;
  sourceUrl: string | null;
  sourceTitle: string | null;
  resourceType: ComicResourceType;
  displayLabel: string;
  redactedResource: string;
  defaultProvider: DownloadProvider;
  compatibleProviders: DownloadProvider[];
  activeTaskCount: number;
  latestTaskStatus: DownloadTaskStatus | null;
  updatedAt: string;
}

export interface DownloadTaskRecord {
  id: string;
  comicResourceId: string;
  comicId: string | null;
  comicTitle: string;
  resourceType: ComicResourceType | null;
  resourceLabel: string;
  redactedResource: string;
  sourceSite: string | null;
  provider: DownloadProvider;
  status: DownloadTaskStatus;
  targetDirectory: string | null;
  errorMessage: string | null;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
}

const COMPATIBLE_PROVIDERS: Record<ComicResourceType, DownloadProvider[]> = {
  magnet: ["aria2"],
  torrent: ["aria2"],
  http: ["builtin-http"],
  openlist: ["openlist"],
};

const ACTIVE_TASK_STATUSES: DownloadTaskStatus[] = ["queued", "running", "cancel_requested"];

export async function createDownloadTask(input: CreateDownloadTaskInput): Promise<CreateDownloadTaskResult> {
  bootstrapDatabase();

  const comicResourceId = normalizeRequiredText(input.comicResourceId, "资源 ID");
  const targetDirectory = normalizeTargetDirectory(input.targetDirectory);
  const db = getDb();
  const resource = getResourceById(comicResourceId);

  if (!resource) {
    throw new Error("找不到要下载的漫画资源。");
  }

  const provider = input.provider ? normalizeProvider(input.provider) : getDefaultProviderForResourceType(resource.resourceType);

  if (!isProviderCompatibleWithResourceType(provider, resource.resourceType)) {
    throw new Error(`资源类型 ${resource.resourceType} 不能使用 ${provider} 下载。`);
  }

  const existingTask = db
    .select({ id: downloadTasks.id })
    .from(downloadTasks)
    .where(and(eq(downloadTasks.comicResourceId, comicResourceId), eq(downloadTasks.provider, provider), inArray(downloadTasks.status, ACTIVE_TASK_STATUSES)))
    .orderBy(desc(downloadTasks.createdAt))
    .get();

  if (existingTask) {
    const task = getDownloadTaskById(existingTask.id);
    if (!task) {
      throw new Error("读取已有下载任务失败。");
    }

    return {
      created: false,
      task,
    };
  }

  const taskId = randomUUID();
  const now = new Date().toISOString();

  db.insert(downloadTasks)
    .values({
      id: taskId,
      comicResourceId,
      provider,
      status: "queued",
      targetDirectory,
      updatedAt: now,
    })
    .run();

  const task = getDownloadTaskById(taskId);

  if (!task) {
    throw new Error("创建下载任务失败。");
  }

  return {
    created: true,
    task,
  };
}

export async function listDownloadTasks(limit = 100): Promise<DownloadTaskRecord[]> {
  bootstrapDatabase();

  const rows = getDb()
    .select({
      id: downloadTasks.id,
      comicResourceId: downloadTasks.comicResourceId,
      provider: downloadTasks.provider,
      status: downloadTasks.status,
      targetDirectory: downloadTasks.targetDirectory,
      errorMessage: downloadTasks.errorMessage,
      retryCount: downloadTasks.retryCount,
      createdAt: downloadTasks.createdAt,
      updatedAt: downloadTasks.updatedAt,
      comicId: comicResources.comicId,
      comicTitle: comics.displayTitle,
      resourceType: comicResources.resourceType,
      displayLabel: comicResources.displayLabel,
      redactedResource: comicResources.redactedResource,
      sourceSite: comicSources.site,
    })
    .from(downloadTasks)
    .leftJoin(comicResources, eq(comicResources.id, downloadTasks.comicResourceId))
    .leftJoin(comics, eq(comics.id, comicResources.comicId))
    .leftJoin(comicSources, eq(comicSources.id, comicResources.comicSourceId))
    .orderBy(desc(downloadTasks.createdAt))
    .limit(normalizeLimit(limit))
    .all();

  return rows.map((row) => ({
    id: row.id,
    comicResourceId: row.comicResourceId ?? "",
    comicId: row.comicId ?? null,
    comicTitle: row.comicTitle ?? "未知漫画",
    resourceType: row.resourceType && isComicResourceType(row.resourceType) ? row.resourceType : null,
    resourceLabel: row.displayLabel?.trim() || row.resourceType || "资源",
    redactedResource: row.redactedResource?.trim() || "资源已脱敏",
    sourceSite: row.sourceSite,
    provider: normalizeProvider(row.provider),
    status: normalizeDownloadTaskStatus(row.status),
    targetDirectory: row.targetDirectory,
    errorMessage: row.errorMessage,
    retryCount: Number(row.retryCount ?? 0),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

export async function listDownloadableResources(limit = 100): Promise<DownloadableResourceRecord[]> {
  bootstrapDatabase();

  const activeTaskCountSql = sql<number>`sum(case when ${downloadTasks.status} in ('queued', 'running', 'cancel_requested') then 1 else 0 end)`;
  const rows = getDb()
    .select({
      id: comicResources.id,
      comicId: comicResources.comicId,
      comicTitle: comics.displayTitle,
      comicStatus: comics.status,
      sourceSite: comicSources.site,
      sourceUrl: comicSources.sourceUrl,
      sourceTitle: comicSources.originalTitle,
      resourceType: comicResources.resourceType,
      displayLabel: comicResources.displayLabel,
      redactedResource: comicResources.redactedResource,
      activeTaskCount: activeTaskCountSql,
      latestTaskStatus: sql<DownloadTaskStatus | null>`(
        select latest_download_tasks.status
        from download_tasks latest_download_tasks
        where latest_download_tasks.comic_resource_id = ${comicResources.id}
        order by latest_download_tasks.created_at desc
        limit 1
      )`,
      updatedAt: comicResources.updatedAt,
    })
    .from(comicResources)
    .innerJoin(comics, eq(comics.id, comicResources.comicId))
    .leftJoin(comicSources, eq(comicSources.id, comicResources.comicSourceId))
    .leftJoin(downloadTasks, eq(downloadTasks.comicResourceId, comicResources.id))
    .groupBy(comicResources.id)
    .orderBy(desc(comicResources.updatedAt))
    .limit(normalizeLimit(limit))
    .all();

  return rows.map((row) => {
    const resourceType = normalizeResourceType(row.resourceType);

    return {
      id: row.id,
      comicId: row.comicId,
      comicTitle: row.comicTitle,
      comicStatus: row.comicStatus,
      sourceSite: row.sourceSite,
      sourceUrl: row.sourceUrl,
      sourceTitle: row.sourceTitle,
      resourceType,
      displayLabel: row.displayLabel?.trim() || resourceType,
      redactedResource: row.redactedResource?.trim() || "资源已脱敏",
      defaultProvider: getDefaultProviderForResourceType(resourceType),
      compatibleProviders: getCompatibleProvidersForResourceType(resourceType),
      activeTaskCount: Number(row.activeTaskCount ?? 0),
      latestTaskStatus: row.latestTaskStatus ? normalizeDownloadTaskStatus(row.latestTaskStatus) : null,
      updatedAt: row.updatedAt,
    };
  });
}

export function getDefaultProviderForResourceType(resourceType: ComicResourceType): DownloadProvider {
  return COMPATIBLE_PROVIDERS[resourceType][0];
}

export function getCompatibleProvidersForResourceType(resourceType: ComicResourceType): DownloadProvider[] {
  return [...COMPATIBLE_PROVIDERS[resourceType]];
}

export function isProviderCompatibleWithResourceType(provider: DownloadProvider, resourceType: ComicResourceType) {
  return COMPATIBLE_PROVIDERS[resourceType].includes(provider);
}

function getDownloadTaskById(taskId: string): DownloadTaskRecord | null {
  const row = getDb()
    .select({
      id: downloadTasks.id,
      comicResourceId: downloadTasks.comicResourceId,
      provider: downloadTasks.provider,
      status: downloadTasks.status,
      targetDirectory: downloadTasks.targetDirectory,
      errorMessage: downloadTasks.errorMessage,
      retryCount: downloadTasks.retryCount,
      createdAt: downloadTasks.createdAt,
      updatedAt: downloadTasks.updatedAt,
      comicId: comicResources.comicId,
      comicTitle: comics.displayTitle,
      resourceType: comicResources.resourceType,
      displayLabel: comicResources.displayLabel,
      redactedResource: comicResources.redactedResource,
      sourceSite: comicSources.site,
    })
    .from(downloadTasks)
    .leftJoin(comicResources, eq(comicResources.id, downloadTasks.comicResourceId))
    .leftJoin(comics, eq(comics.id, comicResources.comicId))
    .leftJoin(comicSources, eq(comicSources.id, comicResources.comicSourceId))
    .where(eq(downloadTasks.id, taskId))
    .get();

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    comicResourceId: row.comicResourceId ?? "",
    comicId: row.comicId ?? null,
    comicTitle: row.comicTitle ?? "未知漫画",
    resourceType: row.resourceType && isComicResourceType(row.resourceType) ? row.resourceType : null,
    resourceLabel: row.displayLabel?.trim() || row.resourceType || "资源",
    redactedResource: row.redactedResource?.trim() || "资源已脱敏",
    sourceSite: row.sourceSite,
    provider: normalizeProvider(row.provider),
    status: normalizeDownloadTaskStatus(row.status),
    targetDirectory: row.targetDirectory,
    errorMessage: row.errorMessage,
    retryCount: Number(row.retryCount ?? 0),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function getResourceById(comicResourceId: string) {
  const row = getDb()
    .select({
      id: comicResources.id,
      resourceType: comicResources.resourceType,
    })
    .from(comicResources)
    .where(eq(comicResources.id, comicResourceId))
    .get();

  return row
    ? {
        ...row,
        resourceType: normalizeResourceType(row.resourceType),
      }
    : null;
}

function normalizeRequiredText(value: unknown, label: string) {
  if (typeof value !== "string") {
    throw new Error(`${label}不能为空。`);
  }

  const text = value.trim();
  if (!text) {
    throw new Error(`${label}不能为空。`);
  }

  return text;
}

function normalizeTargetDirectory(value: string | null | undefined) {
  if (value == null) {
    return null;
  }

  const text = value.trim();
  if (!text) {
    return null;
  }

  if (!path.isAbsolute(text)) {
    throw new Error("下载目标目录必须是绝对路径。");
  }

  return path.normalize(text);
}

function normalizeLimit(value: number) {
  return Math.max(1, Math.min(500, Math.trunc(value)));
}

function normalizeProvider(value: unknown): DownloadProvider {
  if (isDownloadProvider(value)) {
    return value;
  }

  throw new Error("下载 provider 无效。");
}

function normalizeDownloadTaskStatus(value: unknown): DownloadTaskStatus {
  if (isDownloadTaskStatus(value)) {
    return value;
  }

  throw new Error("下载任务状态无效。");
}

function normalizeResourceType(value: unknown): ComicResourceType {
  if (isComicResourceType(value)) {
    return value;
  }

  throw new Error("漫画资源类型无效。");
}

function isDownloadProvider(value: unknown): value is DownloadProvider {
  return DOWNLOAD_PROVIDERS.includes(value as DownloadProvider);
}

function isDownloadTaskStatus(value: unknown): value is DownloadTaskStatus {
  return DOWNLOAD_TASK_STATUSES.includes(value as DownloadTaskStatus);
}

function isComicResourceType(value: unknown): value is ComicResourceType {
  return COMIC_RESOURCE_TYPES.includes(value as ComicResourceType);
}
