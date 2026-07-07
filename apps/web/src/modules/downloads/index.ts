import { randomUUID } from "node:crypto";
import path from "node:path";

import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { bootstrapDatabase, comicResources, comics, comicSources, downloadTasks, getDb, operationLogs } from "@/modules/core/db";
import { getRuntimeSettings } from "@/modules/core/settings";

import { getDownloadProviderAdapter, listDownloadProviderAdapters } from "./providers/registry";
import type { DownloadProviderReadiness, DownloadProviderResourceSnapshot } from "./providers/types";

export { getDownloadProviderAdapter, listDownloadProviderAdapters };
export type { DownloadProviderAdapter, DownloadProviderReadiness, DownloadProviderResourceSnapshot } from "./providers/types";

export const DOWNLOAD_PROVIDERS = ["openlist", "builtin-http", "aria2"] as const;
export type DownloadProvider = (typeof DOWNLOAD_PROVIDERS)[number];

export const DOWNLOAD_TASK_STATUSES = ["queued", "running", "failed", "completed", "cancel_requested", "canceled"] as const;
export type DownloadTaskStatus = (typeof DOWNLOAD_TASK_STATUSES)[number];

export const COMIC_RESOURCE_TYPES = ["magnet", "torrent", "http", "openlist"] as const;
export type ComicResourceType = (typeof COMIC_RESOURCE_TYPES)[number];

const DOWNLOAD_TASK_EVENT_OPERATIONS = ["download_task_create", "download_task_cancel", "download_task_retry"] as const;
export type DownloadTaskEventOperation = (typeof DOWNLOAD_TASK_EVENT_OPERATIONS)[number];

export interface CreateDownloadTaskInput {
  comicResourceId: string;
  provider?: DownloadProvider;
  targetDirectory?: string | null;
}

export interface CreateDownloadTaskResult {
  created: boolean;
  task: DownloadTaskRecord;
}

export interface UpdateDownloadTaskResult {
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

export interface DownloadTaskEventRecord {
  id: string;
  operation: DownloadTaskEventOperation;
  taskId: string;
  summary: string;
  comicTitle: string | null;
  resourceLabel: string | null;
  redactedResource: string | null;
  provider: DownloadProvider | null;
  previousStatus: DownloadTaskStatus | null;
  status: DownloadTaskStatus | null;
  retryCount: number | null;
  createdAt: string;
}

export type DownloadDispatchPlanStatus = "idle" | "blocked" | "ready";

export interface DownloadDispatchResourceRecord {
  id: string;
  comicId: string | null;
  comicTitle: string;
  resourceType: ComicResourceType;
  displayLabel: string;
  redactedResource: string;
  sourceSite: string | null;
}

export interface DownloadDispatchPlan {
  status: DownloadDispatchPlanStatus;
  reason: string;
  checkedAt: string;
  provider: DownloadProvider | null;
  adapterLabel: string | null;
  task: DownloadTaskRecord | null;
  resource: DownloadDispatchResourceRecord | null;
  readiness: DownloadProviderReadiness | null;
}

export interface DownloadWorkerTickResult {
  executed: boolean;
  reason: string;
  plan: DownloadDispatchPlan;
}

interface DownloadTaskEventDetail {
  taskId: string;
  comicResourceId: string;
  comicId: string | null;
  comicTitle: string;
  resourceType: ComicResourceType | null;
  resourceLabel: string;
  redactedResource: string;
  sourceSite: string | null;
  provider: DownloadProvider;
  previousStatus: DownloadTaskStatus | null;
  status: DownloadTaskStatus;
  targetDirectory: string | null;
  retryCount: number;
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
  const targetDirectory = await resolveDownloadTargetDirectory(input.targetDirectory);
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

  recordDownloadTaskEvent(task, "download_task_create", {
    status: task.status,
  });

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

export async function listDownloadTaskEvents(limit = 20): Promise<DownloadTaskEventRecord[]> {
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
    .where(and(eq(operationLogs.targetType, "download_task"), inArray(operationLogs.operation, [...DOWNLOAD_TASK_EVENT_OPERATIONS])))
    .orderBy(desc(operationLogs.createdAt))
    .limit(normalizeLimit(limit))
    .all();

  return rows.flatMap((row) => {
    if (!isDownloadTaskEventOperation(row.operation)) {
      return [];
    }

    const detail = parseDownloadTaskEventDetail(row.detailJson);

    return [
      {
        id: row.id,
        operation: row.operation,
        taskId: detail?.taskId ?? row.targetId,
        summary: row.summary,
        comicTitle: detail?.comicTitle ?? null,
        resourceLabel: detail?.resourceLabel ?? null,
        redactedResource: detail?.redactedResource ?? null,
        provider: detail?.provider ?? null,
        previousStatus: detail?.previousStatus ?? null,
        status: detail?.status ?? null,
        retryCount: detail?.retryCount ?? null,
        createdAt: row.createdAt,
      },
    ];
  });
}

export async function planNextDownloadDispatch(): Promise<DownloadDispatchPlan> {
  bootstrapDatabase();

  const nextTaskRow = getDb()
    .select({ id: downloadTasks.id })
    .from(downloadTasks)
    .where(eq(downloadTasks.status, "queued"))
    .orderBy(downloadTasks.createdAt)
    .limit(1)
    .get();

  if (!nextTaskRow) {
    return createDownloadDispatchPlan({
      status: "idle",
      reason: "当前没有排队中的下载任务。",
    });
  }

  const task = getDownloadTaskById(nextTaskRow.id);

  if (!task) {
    return createDownloadDispatchPlan({
      status: "blocked",
      reason: "读取下一条下载任务失败。",
    });
  }

  const adapter = getDownloadProviderAdapter(task.provider);
  const adapterLabel = adapter?.label ?? null;
  const resource = getDownloadProviderResourceSnapshot(task.comicResourceId);

  if (!resource) {
    return createDownloadDispatchPlan({
      status: "blocked",
      reason: "下载任务缺少可用的资源记录。",
      provider: task.provider,
      adapterLabel,
      task,
    });
  }

  if (!adapter) {
    return createDownloadDispatchPlan({
      status: "blocked",
      reason: `找不到 ${task.provider} 的下载 provider adapter。`,
      provider: task.provider,
      task,
      resource: toDownloadDispatchResourceRecord(resource),
    });
  }

  if (!adapter.supportedResourceTypes.includes(resource.resourceType)) {
    return createDownloadDispatchPlan({
      status: "blocked",
      reason: `资源类型 ${resource.resourceType} 不能交给 ${adapter.label} provider。`,
      provider: task.provider,
      adapterLabel: adapter.label,
      task,
      resource: toDownloadDispatchResourceRecord(resource),
      readiness: {
        canDispatch: false,
        code: "incompatible_resource",
        reason: "资源类型与 provider 不兼容。",
      },
    });
  }

  const settings = await getRuntimeSettings();
  const readiness = await adapter.prepare({ task, resource, settings });

  return createDownloadDispatchPlan({
    status: readiness.canDispatch ? "ready" : "blocked",
    reason: readiness.reason,
    provider: task.provider,
    adapterLabel: adapter.label,
    task,
    resource: toDownloadDispatchResourceRecord(resource),
    readiness,
  });
}

export async function runDownloadWorkerTick(): Promise<DownloadWorkerTickResult> {
  const plan = await planNextDownloadDispatch();

  return {
    executed: false,
    reason:
      plan.status === "ready"
        ? "下载 worker 已完成预检，但真实 provider 执行尚未接入。"
        : plan.reason,
    plan,
  };
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

export async function retryDownloadTask(taskId: string): Promise<UpdateDownloadTaskResult> {
  bootstrapDatabase();

  const id = normalizeRequiredText(taskId, "任务 ID");
  const task = getDownloadTaskById(id);

  if (!task) {
    throw new Error("找不到下载任务。");
  }

  if (task.status !== "failed" && task.status !== "canceled") {
    throw new Error("只有失败或已取消的任务可以重试。");
  }

  if (!task.resourceType) {
    throw new Error("这个下载任务缺少资源记录，无法重试。");
  }

  if (!isProviderCompatibleWithResourceType(task.provider, task.resourceType)) {
    throw new Error("下载任务的 provider 与资源类型不兼容，无法重试。");
  }

  const existingActiveTask = getDb()
    .select({ id: downloadTasks.id })
    .from(downloadTasks)
    .where(
      and(
        eq(downloadTasks.comicResourceId, task.comicResourceId),
        eq(downloadTasks.provider, task.provider),
        inArray(downloadTasks.status, ACTIVE_TASK_STATUSES),
        sql`${downloadTasks.id} <> ${id}`,
      ),
    )
    .get();

  if (existingActiveTask) {
    throw new Error("这个资源已有活动下载任务，不能重复重试。");
  }

  const now = new Date().toISOString();
  getDb()
    .update(downloadTasks)
    .set({
      status: "queued",
      errorMessage: null,
      retryCount: task.retryCount + 1,
      updatedAt: now,
    })
    .where(eq(downloadTasks.id, id))
    .run();

  const updatedTask = getDownloadTaskById(id);
  if (!updatedTask) {
    throw new Error("读取重试后的下载任务失败。");
  }

  recordDownloadTaskEvent(updatedTask, "download_task_retry", {
    previousStatus: task.status,
    status: updatedTask.status,
  });

  return {
    task: updatedTask,
  };
}

export async function cancelDownloadTask(taskId: string): Promise<UpdateDownloadTaskResult> {
  bootstrapDatabase();

  const id = normalizeRequiredText(taskId, "任务 ID");
  const task = getDownloadTaskById(id);

  if (!task) {
    throw new Error("找不到下载任务。");
  }

  if (task.status !== "queued" && task.status !== "running") {
    throw new Error("只有排队中或运行中的任务可以取消。");
  }

  const now = new Date().toISOString();
  const nextStatus: DownloadTaskStatus = task.status === "running" ? "cancel_requested" : "canceled";

  getDb()
    .update(downloadTasks)
    .set({
      status: nextStatus,
      updatedAt: now,
    })
    .where(eq(downloadTasks.id, id))
    .run();

  const updatedTask = getDownloadTaskById(id);
  if (!updatedTask) {
    throw new Error("读取取消后的下载任务失败。");
  }

  recordDownloadTaskEvent(updatedTask, "download_task_cancel", {
    previousStatus: task.status,
    status: updatedTask.status,
  });

  return {
    task: updatedTask,
  };
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

function getDownloadProviderResourceSnapshot(comicResourceId: string): DownloadProviderResourceSnapshot | null {
  const row = getDb()
    .select({
      id: comicResources.id,
      comicId: comicResources.comicId,
      comicTitle: comics.displayTitle,
      resourceType: comicResources.resourceType,
      displayLabel: comicResources.displayLabel,
      redactedResource: comicResources.redactedResource,
      resourceUrl: comicResources.resourceUrl,
      sourceSite: comicSources.site,
    })
    .from(comicResources)
    .leftJoin(comics, eq(comics.id, comicResources.comicId))
    .leftJoin(comicSources, eq(comicSources.id, comicResources.comicSourceId))
    .where(eq(comicResources.id, comicResourceId))
    .get();

  if (!row) {
    return null;
  }

  const resourceType = normalizeResourceType(row.resourceType);

  return {
    id: row.id,
    comicId: row.comicId,
    comicTitle: row.comicTitle ?? "未知漫画",
    resourceType,
    displayLabel: row.displayLabel?.trim() || resourceType,
    redactedResource: row.redactedResource?.trim() || "资源已脱敏",
    resourceUrl: row.resourceUrl,
    sourceSite: row.sourceSite,
  };
}

function toDownloadDispatchResourceRecord(resource: DownloadProviderResourceSnapshot): DownloadDispatchResourceRecord {
  return {
    id: resource.id,
    comicId: resource.comicId,
    comicTitle: resource.comicTitle,
    resourceType: resource.resourceType,
    displayLabel: resource.displayLabel,
    redactedResource: resource.redactedResource,
    sourceSite: resource.sourceSite,
  };
}

function createDownloadDispatchPlan(input: {
  status: DownloadDispatchPlanStatus;
  reason: string;
  provider?: DownloadProvider | null;
  adapterLabel?: string | null;
  task?: DownloadTaskRecord | null;
  resource?: DownloadDispatchResourceRecord | null;
  readiness?: DownloadProviderReadiness | null;
}): DownloadDispatchPlan {
  return {
    status: input.status,
    reason: input.reason,
    checkedAt: new Date().toISOString(),
    provider: input.provider ?? null,
    adapterLabel: input.adapterLabel ?? null,
    task: input.task ?? null,
    resource: input.resource ?? null,
    readiness: input.readiness ?? null,
  };
}

function recordDownloadTaskEvent(
  task: DownloadTaskRecord,
  operation: DownloadTaskEventOperation,
  transition: { previousStatus?: DownloadTaskStatus; status: DownloadTaskStatus },
) {
  const detail: DownloadTaskEventDetail = {
    taskId: task.id,
    comicResourceId: task.comicResourceId,
    comicId: task.comicId,
    comicTitle: task.comicTitle,
    resourceType: task.resourceType,
    resourceLabel: task.resourceLabel,
    redactedResource: task.redactedResource,
    sourceSite: task.sourceSite,
    provider: task.provider,
    previousStatus: transition.previousStatus ?? null,
    status: transition.status,
    targetDirectory: task.targetDirectory,
    retryCount: task.retryCount,
  };

  getDb()
    .insert(operationLogs)
    .values({
      id: randomUUID(),
      operation,
      targetType: "download_task",
      targetId: task.id,
      summary: formatDownloadTaskEventSummary(operation, task, transition.previousStatus),
      detailJson: JSON.stringify(detail),
    })
    .run();
}

function formatDownloadTaskEventSummary(operation: DownloadTaskEventOperation, task: DownloadTaskRecord, previousStatus?: DownloadTaskStatus) {
  if (operation === "download_task_cancel") {
    return `取消下载任务：${task.comicTitle}（${formatDownloadTaskStatus(previousStatus)} -> ${formatDownloadTaskStatus(task.status)}）`;
  }

  if (operation === "download_task_retry") {
    return `重试下载任务：${task.comicTitle}（第 ${task.retryCount} 次）`;
  }

  return `创建 ${task.provider} 下载任务：${task.comicTitle}`;
}

function formatDownloadTaskStatus(status: DownloadTaskStatus | undefined) {
  const labels: Record<DownloadTaskStatus, string> = {
    cancel_requested: "取消中",
    canceled: "已取消",
    completed: "已完成",
    failed: "失败",
    queued: "排队中",
    running: "运行中",
  };

  return status ? labels[status] : "未知";
}

function parseDownloadTaskEventDetail(value: string | null): DownloadTaskEventDetail | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Partial<DownloadTaskEventDetail>;

    if (!parsed.taskId || typeof parsed.taskId !== "string") {
      return null;
    }

    return {
      taskId: parsed.taskId,
      comicResourceId: typeof parsed.comicResourceId === "string" ? parsed.comicResourceId : "",
      comicId: typeof parsed.comicId === "string" ? parsed.comicId : null,
      comicTitle: typeof parsed.comicTitle === "string" ? parsed.comicTitle : "未知漫画",
      resourceType: parsed.resourceType && isComicResourceType(parsed.resourceType) ? parsed.resourceType : null,
      resourceLabel: typeof parsed.resourceLabel === "string" ? parsed.resourceLabel : "资源",
      redactedResource: typeof parsed.redactedResource === "string" ? parsed.redactedResource : "资源已脱敏",
      sourceSite: typeof parsed.sourceSite === "string" ? parsed.sourceSite : null,
      provider: parsed.provider && isDownloadProvider(parsed.provider) ? parsed.provider : "aria2",
      previousStatus: parsed.previousStatus && isDownloadTaskStatus(parsed.previousStatus) ? parsed.previousStatus : null,
      status: parsed.status && isDownloadTaskStatus(parsed.status) ? parsed.status : "queued",
      targetDirectory: typeof parsed.targetDirectory === "string" ? parsed.targetDirectory : null,
      retryCount: typeof parsed.retryCount === "number" ? parsed.retryCount : 0,
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

async function resolveDownloadTargetDirectory(inputTargetDirectory: string | null | undefined) {
  const explicitTargetDirectory = normalizeTargetDirectory(inputTargetDirectory);

  if (explicitTargetDirectory) {
    return explicitTargetDirectory;
  }

  const settings = await getRuntimeSettings();

  return normalizeTargetDirectory(settings.downloadDefaultTargetDirectory);
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

function isDownloadTaskEventOperation(value: unknown): value is DownloadTaskEventOperation {
  return DOWNLOAD_TASK_EVENT_OPERATIONS.includes(value as DownloadTaskEventOperation);
}
