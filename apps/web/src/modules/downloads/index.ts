import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { access, copyFile, mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

import { and, desc, eq, inArray, sql } from "drizzle-orm";

import {
  bootstrapDatabase,
  cloudScanEntries,
  cloudScanSessions,
  comicResources,
  comics,
  comicSources,
  downloadTaskFinalizations,
  downloadTaskPreparations,
  downloadTaskTransfers,
  downloadTasks,
  getDb,
  operationLogs,
} from "@/modules/core/db";
import { getRuntimeSettings, type RuntimeSettings } from "@/modules/core/settings";
import { createMangaRootRepository, scanMangaRoot, type MangaRootRecord } from "@/modules/library";

import { listOpenListDirectory, normalizeOpenListResourcePath, resolveOpenListDownloadLink, submitOpenListOfflineDownload } from "./providers/openlist/connection";
import { cancelAria2Download, cleanupAria2TempDir, downloadWithAria2 } from "./providers/aria2/client";
import { getDownloadProviderAdapter, listDownloadProviderAdapters } from "./providers/registry";
import type { DownloadProviderReadiness, DownloadProviderResourceSnapshot } from "./providers/types";

export { getDownloadProviderAdapter, listDownloadProviderAdapters };
export type { DownloadProviderAdapter, DownloadProviderReadiness, DownloadProviderResourceSnapshot } from "./providers/types";

export const DOWNLOAD_PROVIDERS = ["openlist", "builtin-http", "aria2"] as const;
export type DownloadProvider = (typeof DOWNLOAD_PROVIDERS)[number];

export const DOWNLOAD_TASK_STATUSES = ["queued", "running", "failed", "completed", "cancel_requested", "canceled"] as const;
export type DownloadTaskStatus = (typeof DOWNLOAD_TASK_STATUSES)[number];

export const DOWNLOAD_FINALIZATION_STATUSES = ["completed", "failed"] as const;
export type DownloadFinalizationStatus = (typeof DOWNLOAD_FINALIZATION_STATUSES)[number];

export const DOWNLOAD_PREPARATION_STATUSES = ["ready", "blocked"] as const;
export type DownloadPreparationStatus = (typeof DOWNLOAD_PREPARATION_STATUSES)[number];

export const DOWNLOAD_TRANSFER_STATUSES = ["running", "completed", "failed"] as const;
export type DownloadTransferStatus = (typeof DOWNLOAD_TRANSFER_STATUSES)[number];

export const CLOUD_SCAN_STATUSES = ["running", "completed", "failed"] as const;
export type CloudScanStatus = (typeof CLOUD_SCAN_STATUSES)[number];

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
  finalization?: DownloadTaskFinalizationRecord | null;
  preparation?: DownloadTaskPreparationRecord | null;
  transfer?: DownloadTaskTransferRecord | null;
}

export interface DownloadTaskFinalizationRecord {
  id: string;
  downloadTaskId: string;
  comicResourceId: string | null;
  provider: DownloadProvider;
  status: DownloadFinalizationStatus;
  mangaRootId: string | null;
  finalPath: string | null;
  scanSessionId: string | null;
  errorMessage: string | null;
  finalizedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface DownloadTaskPreparationRecord {
  id: string;
  downloadTaskId: string;
  comicResourceId: string | null;
  provider: DownloadProvider;
  status: DownloadPreparationStatus;
  remotePath: string | null;
  remoteName: string | null;
  sizeBytes: number | null;
  remoteProvider: string | null;
  rawUrlAvailable: boolean;
  preparedAt: string;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DownloadTaskTransferRecord {
  id: string;
  downloadTaskId: string;
  comicResourceId: string | null;
  provider: DownloadProvider;
  status: DownloadTransferStatus;
  tempFilePath: string | null;
  fileName: string | null;
  sizeBytes: number | null;
  bytesWritten: number;
  contentType: string | null;
  startedAt: string;
  finishedAt: string | null;
  errorMessage: string | null;
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

export interface CloudScanEntryRecord {
  id: string;
  sessionId: string;
  provider: DownloadProvider;
  remotePath: string;
  parentPath: string;
  name: string;
  kind: "file" | "directory";
  depth: number;
  sizeBytes: number | null;
  modifiedAt: string | null;
  remoteProvider: string | null;
  rawUrlAvailable: boolean;
  createdAt: string;
}

export interface CloudScanSessionRecord {
  id: string;
  provider: DownloadProvider;
  comicResourceId: string | null;
  comicTitle: string | null;
  resourceLabel: string | null;
  redactedResource: string | null;
  rootPath: string;
  status: CloudScanStatus;
  startedAt: string;
  finishedAt: string | null;
  totalCount: number;
  fileCount: number;
  directoryCount: number;
  importableFileCount: number;
  errorSummary: string | null;
  createdAt: string;
  updatedAt: string;
  previewEntries: CloudScanEntryRecord[];
}

export interface CreateOpenListCloudDirectoryScanInput {
  comicResourceId: string;
}

export interface CreateOpenListCloudDirectoryScanResult {
  scan: CloudScanSessionRecord;
}

export interface ImportOpenListCloudScanResourcesResult {
  createdCount: number;
  skippedCount: number;
  resources: DownloadableResourceRecord[];
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
  finalization: DownloadTaskFinalizationRecord | null;
  reason: string;
  plan: DownloadDispatchPlan;
  transfer: DownloadTaskTransferRecord | null;
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
  magnet: ["openlist", "aria2"],
  torrent: ["aria2"],
  http: ["builtin-http"],
  openlist: ["openlist"],
};

const ACTIVE_TASK_STATUSES: DownloadTaskStatus[] = ["queued", "running", "cancel_requested"];
const DOWNLOAD_IMPORT_DIRECTORY_NAME = "下载入库";
const OPENLIST_CLOUD_SCAN_MAX_PAGES = 5;
const OPENLIST_CLOUD_SCAN_PER_PAGE = 50;

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

  const tasks = rows.map((row) => ({
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

  return attachDownloadTaskFinalizations(attachDownloadTaskTransfers(attachDownloadTaskPreparations(tasks)));
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

export async function createOpenListCloudDirectoryScan(
  input: CreateOpenListCloudDirectoryScanInput,
): Promise<CreateOpenListCloudDirectoryScanResult> {
  bootstrapDatabase();

  const comicResourceId = normalizeRequiredText(input.comicResourceId, "资源 ID");
  const resource = getOpenListCloudScanResourceById(comicResourceId);

  if (!resource) {
    throw new Error("找不到要扫描的 OpenList 资源。");
  }

  if (resource.resourceType !== "openlist") {
    throw new Error("只有 OpenList 资源可以进行云端目录扫描。");
  }

  const rootPath = normalizeOpenListResourcePath(resource.resourceUrl);
  if (!rootPath) {
    throw new Error("OpenList 资源缺少可扫描的远端路径。");
  }

  const now = new Date().toISOString();
  const sessionId = randomUUID();
  getDb()
    .insert(cloudScanSessions)
    .values({
      id: sessionId,
      provider: "openlist",
      comicResourceId,
      rootPath,
      startedAt: now,
      updatedAt: now,
    })
    .run();

  const settings = await getRuntimeSettings();
  const scanPages = await collectOpenListDirectoryPages(rootPath, settings);
  const finishedAt = new Date().toISOString();

  if (!scanPages.ok) {
    getDb()
      .update(cloudScanSessions)
      .set({
        errorSummary: scanPages.message,
        finishedAt,
        status: "failed",
        updatedAt: finishedAt,
      })
      .where(eq(cloudScanSessions.id, sessionId))
      .run();

    return {
      scan: getCloudScanSessionById(sessionId) ?? createFallbackCloudScanSession(sessionId, resource, rootPath, "failed", now, finishedAt, scanPages.message),
    };
  }

  const entries = scanPages.entries.map((entry) => ({
    id: randomUUID(),
    sessionId,
    provider: "openlist" as const,
    remotePath: joinOpenListRemotePath(rootPath, entry.name),
    parentPath: rootPath,
    name: entry.name,
    kind: entry.isDirectory ? ("directory" as const) : ("file" as const),
    depth: 1,
    sizeBytes: entry.sizeBytes,
    modifiedAt: entry.modifiedAt,
    remoteProvider: entry.provider,
    rawUrlAvailable: entry.rawUrlAvailable,
    updatedAt: finishedAt,
  }));
  const fileCount = entries.filter((entry) => entry.kind === "file").length;
  const directoryCount = entries.filter((entry) => entry.kind === "directory").length;
  const importableFileCount = entries.filter((entry) => entry.kind === "file" && entry.rawUrlAvailable).length;

  getDb().transaction((tx) => {
    if (entries.length > 0) {
      tx.insert(cloudScanEntries).values(entries).run();
    }

    tx.update(cloudScanSessions)
      .set({
        directoryCount,
        fileCount,
        finishedAt,
        importableFileCount,
        status: "completed",
        totalCount: scanPages.totalCount ?? entries.length,
        updatedAt: finishedAt,
      })
      .where(eq(cloudScanSessions.id, sessionId))
      .run();
  });

  const scan = getCloudScanSessionById(sessionId);
  if (!scan) {
    throw new Error("读取 OpenList 云端扫描结果失败。");
  }

  return { scan };
}

export async function listOpenListCloudScans(limit = 20): Promise<CloudScanSessionRecord[]> {
  bootstrapDatabase();

  const rows = getDb()
    .select({
      id: cloudScanSessions.id,
      provider: cloudScanSessions.provider,
      comicResourceId: cloudScanSessions.comicResourceId,
      comicTitle: comics.displayTitle,
      resourceLabel: comicResources.displayLabel,
      redactedResource: comicResources.redactedResource,
      rootPath: cloudScanSessions.rootPath,
      status: cloudScanSessions.status,
      startedAt: cloudScanSessions.startedAt,
      finishedAt: cloudScanSessions.finishedAt,
      totalCount: cloudScanSessions.totalCount,
      fileCount: cloudScanSessions.fileCount,
      directoryCount: cloudScanSessions.directoryCount,
      importableFileCount: cloudScanSessions.importableFileCount,
      errorSummary: cloudScanSessions.errorSummary,
      createdAt: cloudScanSessions.createdAt,
      updatedAt: cloudScanSessions.updatedAt,
    })
    .from(cloudScanSessions)
    .leftJoin(comicResources, eq(comicResources.id, cloudScanSessions.comicResourceId))
    .leftJoin(comics, eq(comics.id, comicResources.comicId))
    .orderBy(desc(cloudScanSessions.createdAt))
    .limit(normalizeLimit(limit))
    .all();

  return rows.map((row) => mapCloudScanSessionRow(row, listCloudScanPreviewEntries(row.id)));
}

export async function importOpenListCloudScanResources(sessionId: string): Promise<ImportOpenListCloudScanResourcesResult> {
  bootstrapDatabase();

  const id = normalizeRequiredText(sessionId, "云端扫描 ID");
  const session = getCloudScanImportSessionById(id);

  if (!session) {
    throw new Error("找不到 OpenList 云端扫描记录。");
  }

  if (session.provider !== "openlist") {
    throw new Error("只有 OpenList 云端扫描可以导入为 OpenList 资源。");
  }

  if (session.status !== "completed") {
    throw new Error("只有已完成的云端扫描可以导入资源。");
  }

  if (!session.comicResourceId || !session.comicId) {
    throw new Error("云端扫描缺少原始漫画资源，无法确定导入目标。");
  }

  const entries = listImportableCloudScanEntries(id);
  let createdCount = 0;
  let skippedCount = 0;
  const comicId = session.comicId;
  const comicSourceId = session.comicSourceId;
  const now = new Date().toISOString();

  getDb().transaction((tx) => {
    for (const entry of entries) {
      const existingResource = tx
        .select({ id: comicResources.id })
        .from(comicResources)
        .where(and(eq(comicResources.comicId, comicId), eq(comicResources.resourceType, "openlist"), eq(comicResources.resourceUrl, entry.remotePath)))
        .get();

      if (existingResource) {
        skippedCount += 1;
        continue;
      }

      tx.insert(comicResources)
        .values({
          id: randomUUID(),
          comicId,
          comicSourceId,
          displayLabel: entry.name,
          redactedResource: redactOpenListRemotePath(entry.remotePath, entry.name),
          resourceType: "openlist",
          resourceUrl: entry.remotePath,
          updatedAt: now,
        })
        .run();
      createdCount += 1;
    }
  });

  return {
    createdCount,
    skippedCount,
    resources: await listDownloadableResources(),
  };
}

async function collectOpenListDirectoryPages(rootPath: string, settings: RuntimeSettings) {
  const entries: Array<{
    isDirectory: boolean;
    modifiedAt: string | null;
    name: string;
    provider: string | null;
    rawUrlAvailable: boolean;
    sizeBytes: number | null;
  }> = [];
  let totalCount: number | null = null;

  for (let page = 1; page <= OPENLIST_CLOUD_SCAN_MAX_PAGES; page += 1) {
    const directory = await listOpenListDirectory(rootPath, {
      page,
      perPage: OPENLIST_CLOUD_SCAN_PER_PAGE,
      settings,
    });

    if (!directory.ok || !directory.directory) {
      return {
        ok: false as const,
        entries: [],
        message: `读取 OpenList 目录第 ${page} 页失败：${directory.message}`,
        totalCount,
      };
    }

    entries.push(...directory.directory.entries);
    totalCount = directory.directory.total ?? totalCount;

    const hasMore = directory.directory.hasMore ?? (totalCount != null && entries.length < totalCount);
    if (!hasMore) {
      break;
    }
  }

  return {
    ok: true as const,
    entries,
    message: null,
    totalCount,
  };
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
  bootstrapDatabase();

  const pendingFinalization = getNextPendingDownloadFinalization();
  if (pendingFinalization) {
    const finalization = await finalizeDownloadedTask(pendingFinalization.task, pendingFinalization.transfer);
    const updatedTask = getDownloadTaskById(pendingFinalization.task.id);
    return {
      executed: finalization.status === "completed", finalization,
      reason: finalization.status === "completed" ? "下载临时文件已移动到入库目录，并已触发漫画库扫描。" : finalization.errorMessage ?? "下载临时文件入库失败。",
      plan: createDownloadDispatchPlan({ status: finalization.status === "completed" ? "ready" : "blocked", reason: finalization.status === "completed" ? "下载临时文件已入库并扫描。" : finalization.errorMessage ?? "下载临时文件入库失败。", provider: pendingFinalization.task.provider, task: updatedTask ?? pendingFinalization.task, resource: pendingFinalization.resource }),
      transfer: pendingFinalization.transfer,
    };
  }

  // Poll: check OpenList offline download task status
  const pollResults = await pollOpenListDownloadStatus();
  if (pollResults.length > 0) {
    return {
      executed: true, finalization: null,
      reason: pollResults.join("；"),
      plan: await planNextDownloadDispatch(),
      transfer: null,
    };
  }

  // Loop: process all queued tasks (up to 20 per tick)
  let processed = 0;
  const reasons: string[] = [];
  for (let i = 0; i < 20; i++) {
    const plan = await planNextDownloadDispatch();
    if (plan.status !== "ready" || !plan.task) break;

    const preparation = persistDownloadTaskPreparationFromPlan(plan);

    if (preparation?.status === "ready" && plan.task.provider === "openlist" && plan.task.resourceType === "openlist") {
      const transfer = await downloadPreparedOpenListTask(plan.task, preparation);
      processed++;
      reasons.push(transfer.status === "completed" ? `${plan.task.comicTitle}: 已下载` : `${plan.task.comicTitle}: ${transfer.errorMessage ?? "下载失败"}`);
      continue;
    }

    if (plan.status === "ready" && plan.task.provider === "openlist" && plan.task.resourceType === "magnet") {
      const fullMagnetUrl = plan.task.comicResourceId
        ? getDb().select({ url: comicResources.resourceUrl }).from(comicResources).where(eq(comicResources.id, plan.task.comicResourceId)).get()?.url ?? ""
        : "";
      const savePath = "/115Open/Temp";
      const result = await submitOpenListOfflineDownload(fullMagnetUrl, savePath, "115 Open");
      const now = new Date().toISOString();

      if (result.ok) {
        // Save OL task ID as errorMessage and set status to running for status polling
        getDb().update(downloadTasks).set({ status: "running", errorMessage: JSON.stringify({ olTaskId: result.taskId, olPath: savePath, comicTitle: plan.task.comicTitle }), updatedAt: now }).where(eq(downloadTasks.id, plan.task.id)).run();
        processed++;
        reasons.push(`${plan.task.comicTitle}: 已提交到 OpenList (任务: ${result.taskId})`);
      } else {
        markDownloadTaskFinished(plan.task.id, "failed", result.message, now);
        processed++;
        reasons.push(`${plan.task.comicTitle}: ${result.message}`);
      }
      continue;
    }

    // aria2 direct download (magnet / torrent)
    if (plan.status === "ready" && plan.task.provider === "aria2") {
      const settings = await getRuntimeSettings();
      const uri = plan.task.comicResourceId
        ? getDb().select({ url: comicResources.resourceUrl }).from(comicResources).where(eq(comicResources.id, plan.task.comicResourceId)).get()?.url ?? ""
        : "";

      if (!uri) {
        markDownloadTaskFinished(plan.task.id, "failed", "缺少资源下载地址。", new Date().toISOString());
        processed++;
        reasons.push(`${plan.task.comicTitle}: 缺少资源下载地址`);
        continue;
      }

      const transfer = await downloadAria2Task(plan.task, uri, settings);
      processed++;
      reasons.push(transfer.status === "completed" ? `${plan.task.comicTitle}: 已下载` : `${plan.task.comicTitle}: ${transfer.errorMessage ?? "下载失败"}`);
      continue;
    }

    // Not a supported dispatch path
    reasons.push(`${plan.task.comicTitle}: ${plan.reason}`);
    break;
  }

  if (processed > 0) {
    const plan = await planNextDownloadDispatch();
    return {
      executed: true, finalization: null,
      reason: `处理了 ${processed} 个任务：${reasons.join("；")}`,
      plan: plan ?? createDownloadDispatchPlan({ status: "idle", reason: "所有任务已处理" }),
      transfer: null,
    };
  }

  const plan = await planNextDownloadDispatch();
  return {
    executed: false, finalization: null,
    reason: plan.status === "idle" ? "没有排队中的任务" : plan.reason,
    plan,
    transfer: null,
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
  getDb().delete(downloadTaskFinalizations).where(eq(downloadTaskFinalizations.downloadTaskId, id)).run();
  getDb().delete(downloadTaskTransfers).where(eq(downloadTaskTransfers.downloadTaskId, id)).run();
  getDb().delete(downloadTaskPreparations).where(eq(downloadTaskPreparations.downloadTaskId, id)).run();
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

  // Cancel aria2 download via RPC and clean up temp files
  if (task.provider === "aria2" && task.status === "running") {
    try {
      const settings = await getRuntimeSettings();
      await cancelAria2Download(id, settings.aria2RpcUrl?.trim() || undefined, settings.aria2RpcToken?.trim() || undefined);
      const tempDirectory = resolveDownloadTaskTempDirectory(settings, id);
      await cleanupAria2TempDir(tempDirectory);
    } catch {
      // ignore cleanup errors during cancel
    }
  }

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

export async function deleteDownloadTask(taskId: string): Promise<void> {
  bootstrapDatabase();
  const id = normalizeRequiredText(taskId, "任务 ID");
  const db = getDb();
  db.delete(downloadTaskFinalizations).where(eq(downloadTaskFinalizations.downloadTaskId, id)).run();
  db.delete(downloadTaskTransfers).where(eq(downloadTaskTransfers.downloadTaskId, id)).run();
  db.delete(downloadTaskPreparations).where(eq(downloadTaskPreparations.downloadTaskId, id)).run();
  db.delete(downloadTasks).where(eq(downloadTasks.id, id)).run();
  db.delete(operationLogs).where(and(eq(operationLogs.targetType, "download_task"), eq(operationLogs.targetId, id))).run();
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

  const task: DownloadTaskRecord = {
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

  return {
    ...task,
    finalization: getDownloadTaskFinalizationByTaskId(task.id),
    preparation: getDownloadTaskPreparationByTaskId(task.id),
    transfer: getDownloadTaskTransferByTaskId(task.id),
  };
}

function persistDownloadTaskPreparationFromPlan(plan: DownloadDispatchPlan): DownloadTaskPreparationRecord | null {
  if (plan.provider !== "openlist" || !plan.task || !plan.readiness) {
    return null;
  }

  const details = plan.readiness.details ?? {};
  const remotePath = normalizeOpenListResourcePath(readinessStringDetail(details, "remotePath"));

  if (!remotePath) {
    return null;
  }

  const rawUrlAvailable = details.rawUrlAvailable === true;
  const remoteIsDirectory = details.remoteIsDirectory === true;
  const status: DownloadPreparationStatus = rawUrlAvailable && !remoteIsDirectory ? "ready" : "blocked";
  const now = new Date().toISOString();
  const existing = getDb()
    .select({ id: downloadTaskPreparations.id })
    .from(downloadTaskPreparations)
    .where(eq(downloadTaskPreparations.downloadTaskId, plan.task.id))
    .get();
  const values = {
    comicResourceId: plan.task.comicResourceId || null,
    downloadTaskId: plan.task.id,
    errorMessage: status === "ready" ? null : plan.readiness.reason,
    preparedAt: now,
    provider: plan.provider,
    rawUrlAvailable,
    remoteName: readinessStringDetail(details, "remoteName"),
    remotePath,
    remoteProvider: readinessStringDetail(details, "remoteProvider"),
    sizeBytes: readinessNumberDetail(details, "remoteSizeBytes"),
    status,
    updatedAt: now,
  };

  if (existing) {
    getDb().update(downloadTaskPreparations).set(values).where(eq(downloadTaskPreparations.id, existing.id)).run();
  } else {
    getDb()
      .insert(downloadTaskPreparations)
      .values({
        ...values,
        id: randomUUID(),
      })
      .run();
  }

  return getDownloadTaskPreparationByTaskId(plan.task.id);
}

function attachDownloadTaskPreparations(tasks: DownloadTaskRecord[]): DownloadTaskRecord[] {
  if (tasks.length === 0) {
    return tasks;
  }

  const preparationsByTaskId = listDownloadTaskPreparationMap(tasks.map((task) => task.id));

  return tasks.map((task) => ({
    ...task,
    preparation: preparationsByTaskId.get(task.id) ?? null,
  }));
}

function listDownloadTaskPreparationMap(taskIds: string[]) {
  const rows = getDb()
    .select({
      id: downloadTaskPreparations.id,
      downloadTaskId: downloadTaskPreparations.downloadTaskId,
      comicResourceId: downloadTaskPreparations.comicResourceId,
      provider: downloadTaskPreparations.provider,
      status: downloadTaskPreparations.status,
      remotePath: downloadTaskPreparations.remotePath,
      remoteName: downloadTaskPreparations.remoteName,
      sizeBytes: downloadTaskPreparations.sizeBytes,
      remoteProvider: downloadTaskPreparations.remoteProvider,
      rawUrlAvailable: downloadTaskPreparations.rawUrlAvailable,
      preparedAt: downloadTaskPreparations.preparedAt,
      errorMessage: downloadTaskPreparations.errorMessage,
      createdAt: downloadTaskPreparations.createdAt,
      updatedAt: downloadTaskPreparations.updatedAt,
    })
    .from(downloadTaskPreparations)
    .where(inArray(downloadTaskPreparations.downloadTaskId, taskIds))
    .all();

  return new Map(rows.map((row) => [row.downloadTaskId, mapDownloadTaskPreparationRow(row)]));
}

function getDownloadTaskPreparationByTaskId(downloadTaskId: string): DownloadTaskPreparationRecord | null {
  const row = getDb()
    .select({
      id: downloadTaskPreparations.id,
      downloadTaskId: downloadTaskPreparations.downloadTaskId,
      comicResourceId: downloadTaskPreparations.comicResourceId,
      provider: downloadTaskPreparations.provider,
      status: downloadTaskPreparations.status,
      remotePath: downloadTaskPreparations.remotePath,
      remoteName: downloadTaskPreparations.remoteName,
      sizeBytes: downloadTaskPreparations.sizeBytes,
      remoteProvider: downloadTaskPreparations.remoteProvider,
      rawUrlAvailable: downloadTaskPreparations.rawUrlAvailable,
      preparedAt: downloadTaskPreparations.preparedAt,
      errorMessage: downloadTaskPreparations.errorMessage,
      createdAt: downloadTaskPreparations.createdAt,
      updatedAt: downloadTaskPreparations.updatedAt,
    })
    .from(downloadTaskPreparations)
    .where(eq(downloadTaskPreparations.downloadTaskId, downloadTaskId))
    .get();

  return row ? mapDownloadTaskPreparationRow(row) : null;
}

function mapDownloadTaskPreparationRow(row: {
  id: string;
  downloadTaskId: string;
  comicResourceId: string | null;
  provider: string;
  status: string;
  remotePath: string | null;
  remoteName: string | null;
  sizeBytes: number | null;
  remoteProvider: string | null;
  rawUrlAvailable: boolean;
  preparedAt: string;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}): DownloadTaskPreparationRecord {
  return {
    id: row.id,
    downloadTaskId: row.downloadTaskId,
    comicResourceId: row.comicResourceId,
    provider: normalizeProvider(row.provider),
    status: normalizeDownloadPreparationStatus(row.status),
    remotePath: row.remotePath,
    remoteName: row.remoteName,
    sizeBytes: row.sizeBytes == null ? null : Number(row.sizeBytes),
    remoteProvider: row.remoteProvider,
    rawUrlAvailable: Boolean(row.rawUrlAvailable),
    preparedAt: row.preparedAt,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function downloadPreparedOpenListTask(task: DownloadTaskRecord, preparation: DownloadTaskPreparationRecord): Promise<DownloadTaskTransferRecord> {
  const settings = await getRuntimeSettings();
  const startedAt = new Date().toISOString();
  const safeInitialFileName = sanitizeDownloadFileName(preparation.remoteName ?? task.resourceLabel);
  const tempDirectory = resolveDownloadTaskTempDirectory(settings, task.id);
  const tempFilePath = path.join(tempDirectory, safeInitialFileName);
  let activePartialFilePath = `${tempFilePath}.part`;

  assertPathInside(tempDirectory, tempFilePath);
  markDownloadTaskRunning(task.id, startedAt);

  let transfer = upsertDownloadTaskTransfer({
    bytesWritten: 0,
    comicResourceId: task.comicResourceId || null,
    contentType: null,
    downloadTaskId: task.id,
    errorMessage: null,
    fileName: safeInitialFileName,
    finishedAt: null,
    provider: task.provider,
    sizeBytes: preparation.sizeBytes,
    startedAt,
    status: "running",
    tempFilePath,
  });

  try {
    if (!preparation.remotePath) {
      throw new Error("OpenList 准备记录缺少远端路径。");
    }

    const link = await resolveOpenListDownloadLink(preparation.remotePath, { settings });
    if (!link.ok || link.status !== "file_ready" || !link.rawUrl || !link.resource) {
      throw new Error(link.message);
    }

    const downloadUrl = normalizeHttpDownloadUrl(link.rawUrl);
    const fileName = sanitizeDownloadFileName(link.resource.name || preparation.remoteName || task.resourceLabel);
    const finalTempFilePath = path.join(tempDirectory, fileName);
    const finalPartialFilePath = `${finalTempFilePath}.part`;
    activePartialFilePath = finalPartialFilePath;

    assertPathInside(tempDirectory, finalTempFilePath);
    await mkdir(tempDirectory, { recursive: true });
    await rm(finalPartialFilePath, { force: true });

    // Use aria2 if configured, fall back to fetch
    const aria2RpcUrl = settings.aria2RpcUrl?.trim();
    if (aria2RpcUrl && settings.aria2Enabled) {
      const result = await downloadWithAria2({
        rpcUrl: aria2RpcUrl,
        rpcToken: settings.aria2RpcToken?.trim() || undefined,
        uri: downloadUrl,
        dir: tempDirectory,
        out: fileName,
        taskId: task.id,
      });

      if (!result.success) {
        throw new Error(`aria2 下载失败：${result.errorMessage}`);
      }

      if (!result.files || result.files.length === 0) {
        throw new Error("aria2 下载完成后未返回文件路径。");
      }

      const aria2FilePath = result.files[0];
      const fileStat = await stat(aria2FilePath);
      const finishedAt = new Date().toISOString();
      transfer = upsertDownloadTaskTransfer({
        bytesWritten: fileStat.size,
        comicResourceId: task.comicResourceId || null,
        contentType: null,
        downloadTaskId: task.id,
        errorMessage: null,
        fileName,
        finishedAt,
        provider: task.provider,
        sizeBytes: link.resource.sizeBytes ?? fileStat.size,
        startedAt,
        status: "completed",
        tempFilePath: aria2FilePath,
      });
      markDownloadTaskFinished(task.id, "completed", null, finishedAt);

      return transfer;
    }

    const response = await fetch(downloadUrl, {
      cache: "no-store",
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok || !response.body) {
      throw new Error(`临时文件下载请求失败：HTTP ${response.status}`);
    }

    await pipeline(Readable.fromWeb(response.body as unknown as NodeReadableStream<Uint8Array>), createWriteStream(finalPartialFilePath));
    await rename(finalPartialFilePath, finalTempFilePath);

    const fileStat = await stat(finalTempFilePath);
    const finishedAt = new Date().toISOString();
    transfer = upsertDownloadTaskTransfer({
      bytesWritten: fileStat.size,
      comicResourceId: task.comicResourceId || null,
      contentType: normalizeContentType(response.headers.get("content-type")),
      downloadTaskId: task.id,
      errorMessage: null,
      fileName,
      finishedAt,
      provider: task.provider,
      sizeBytes: link.resource.sizeBytes ?? parseContentLength(response.headers.get("content-length")) ?? fileStat.size,
      startedAt,
      status: "completed",
      tempFilePath: finalTempFilePath,
    });
    markDownloadTaskFinished(task.id, "completed", null, finishedAt);

    return transfer;
  } catch (error) {
    await rm(activePartialFilePath, { force: true }).catch(() => undefined);
    const finishedAt = new Date().toISOString();
    const message = toSafeDownloadErrorMessage(error);
    transfer = upsertDownloadTaskTransfer({
      bytesWritten: 0,
      comicResourceId: task.comicResourceId || null,
      contentType: null,
      downloadTaskId: task.id,
      errorMessage: message,
      fileName: safeInitialFileName,
      finishedAt,
      provider: task.provider,
      sizeBytes: preparation.sizeBytes,
      startedAt,
      status: "failed",
      tempFilePath: null,
    });
    markDownloadTaskFinished(task.id, "failed", message, finishedAt);

    return transfer;
  }
}

async function downloadAria2Task(
  task: DownloadTaskRecord,
  uri: string,
  settings: RuntimeSettings,
): Promise<DownloadTaskTransferRecord> {
  const startedAt = new Date().toISOString();
  const tempDirectory = resolveDownloadTaskTempDirectory(settings, task.id);
  const rpcUrl = settings.aria2RpcUrl?.trim();

  if (!rpcUrl) {
    const finishedAt = new Date().toISOString();
    const message = "aria2 RPC 地址未配置。";
    markDownloadTaskFinished(task.id, "failed", message, finishedAt);
    return upsertDownloadTaskTransfer({
      bytesWritten: 0,
      comicResourceId: task.comicResourceId || null,
      contentType: null,
      downloadTaskId: task.id,
      errorMessage: message,
      fileName: task.resourceLabel,
      finishedAt,
      provider: task.provider,
      sizeBytes: null,
      startedAt,
      status: "failed",
      tempFilePath: null,
    });
  }

  if (!settings.aria2Enabled) {
    const finishedAt = new Date().toISOString();
    const message = "aria2 provider 未启用。";
    markDownloadTaskFinished(task.id, "failed", message, finishedAt);
    return upsertDownloadTaskTransfer({
      bytesWritten: 0,
      comicResourceId: task.comicResourceId || null,
      contentType: null,
      downloadTaskId: task.id,
      errorMessage: message,
      fileName: task.resourceLabel,
      finishedAt,
      provider: task.provider,
      sizeBytes: null,
      startedAt,
      status: "failed",
      tempFilePath: null,
    });
  }

  markDownloadTaskRunning(task.id, startedAt);

  let transfer = upsertDownloadTaskTransfer({
    bytesWritten: 0,
    comicResourceId: task.comicResourceId || null,
    contentType: null,
    downloadTaskId: task.id,
    errorMessage: null,
    fileName: task.resourceLabel,
    finishedAt: null,
    provider: task.provider,
    sizeBytes: null,
    startedAt,
    status: "running",
    tempFilePath: null,
  });

  try {
    await mkdir(tempDirectory, { recursive: true });

    const result = await downloadWithAria2({
      rpcUrl,
      rpcToken: settings.aria2RpcToken?.trim() || undefined,
      uri,
      dir: tempDirectory,
      taskId: task.id,
    });

    if (!result.success) {
      throw new Error(`aria2 下载失败：${result.errorMessage}`);
    }

    if (!result.files || result.files.length === 0) {
      throw new Error("aria2 下载完成后未返回文件路径。");
    }

    const aria2FilePath = result.files[0];
    const fileName = sanitizeDownloadFileName(aria2FilePath.split(/[/\\]/).pop() || task.resourceLabel);

    const fileStat = await stat(aria2FilePath);
    const finishedAt = new Date().toISOString();

    transfer = upsertDownloadTaskTransfer({
      bytesWritten: fileStat.size,
      comicResourceId: task.comicResourceId || null,
      contentType: null,
      downloadTaskId: task.id,
      errorMessage: null,
      fileName,
      finishedAt,
      provider: task.provider,
      sizeBytes: fileStat.size,
      startedAt,
      status: "completed",
      tempFilePath: aria2FilePath,
    });

    markDownloadTaskFinished(task.id, "completed", null, finishedAt);
    return transfer;
  } catch (error) {
    const currentTask = getDownloadTaskById(task.id);
    if (currentTask && currentTask.status !== "running") {
      return upsertDownloadTaskTransfer({
        bytesWritten: 0,
        comicResourceId: task.comicResourceId || null,
        contentType: null,
        downloadTaskId: task.id,
        errorMessage: "任务已被取消。",
        fileName: task.resourceLabel,
        finishedAt: new Date().toISOString(),
        provider: task.provider,
        sizeBytes: null,
        startedAt,
        status: "failed",
        tempFilePath: null,
      });
    }

    const finishedAt = new Date().toISOString();
    const message = toSafeDownloadErrorMessage(error);

    transfer = upsertDownloadTaskTransfer({
      bytesWritten: 0,
      comicResourceId: task.comicResourceId || null,
      contentType: null,
      downloadTaskId: task.id,
      errorMessage: message,
      fileName: task.resourceLabel,
      finishedAt,
      provider: task.provider,
      sizeBytes: null,
      startedAt,
      status: "failed",
      tempFilePath: null,
    });

    markDownloadTaskFinished(task.id, "failed", message, finishedAt);
    return transfer;
  }
}

function attachDownloadTaskTransfers(tasks: DownloadTaskRecord[]): DownloadTaskRecord[] {
  if (tasks.length === 0) {
    return tasks;
  }

  const transfersByTaskId = listDownloadTaskTransferMap(tasks.map((task) => task.id));

  return tasks.map((task) => ({
    ...task,
    transfer: transfersByTaskId.get(task.id) ?? null,
  }));
}

function listDownloadTaskTransferMap(taskIds: string[]) {
  const rows = getDb()
    .select({
      id: downloadTaskTransfers.id,
      downloadTaskId: downloadTaskTransfers.downloadTaskId,
      comicResourceId: downloadTaskTransfers.comicResourceId,
      provider: downloadTaskTransfers.provider,
      status: downloadTaskTransfers.status,
      tempFilePath: downloadTaskTransfers.tempFilePath,
      fileName: downloadTaskTransfers.fileName,
      sizeBytes: downloadTaskTransfers.sizeBytes,
      bytesWritten: downloadTaskTransfers.bytesWritten,
      contentType: downloadTaskTransfers.contentType,
      startedAt: downloadTaskTransfers.startedAt,
      finishedAt: downloadTaskTransfers.finishedAt,
      errorMessage: downloadTaskTransfers.errorMessage,
      createdAt: downloadTaskTransfers.createdAt,
      updatedAt: downloadTaskTransfers.updatedAt,
    })
    .from(downloadTaskTransfers)
    .where(inArray(downloadTaskTransfers.downloadTaskId, taskIds))
    .all();

  return new Map(rows.map((row) => [row.downloadTaskId, mapDownloadTaskTransferRow(row)]));
}

function getDownloadTaskTransferByTaskId(downloadTaskId: string): DownloadTaskTransferRecord | null {
  const row = getDb()
    .select({
      id: downloadTaskTransfers.id,
      downloadTaskId: downloadTaskTransfers.downloadTaskId,
      comicResourceId: downloadTaskTransfers.comicResourceId,
      provider: downloadTaskTransfers.provider,
      status: downloadTaskTransfers.status,
      tempFilePath: downloadTaskTransfers.tempFilePath,
      fileName: downloadTaskTransfers.fileName,
      sizeBytes: downloadTaskTransfers.sizeBytes,
      bytesWritten: downloadTaskTransfers.bytesWritten,
      contentType: downloadTaskTransfers.contentType,
      startedAt: downloadTaskTransfers.startedAt,
      finishedAt: downloadTaskTransfers.finishedAt,
      errorMessage: downloadTaskTransfers.errorMessage,
      createdAt: downloadTaskTransfers.createdAt,
      updatedAt: downloadTaskTransfers.updatedAt,
    })
    .from(downloadTaskTransfers)
    .where(eq(downloadTaskTransfers.downloadTaskId, downloadTaskId))
    .get();

  return row ? mapDownloadTaskTransferRow(row) : null;
}

function mapDownloadTaskTransferRow(row: {
  id: string;
  downloadTaskId: string;
  comicResourceId: string | null;
  provider: string;
  status: string;
  tempFilePath: string | null;
  fileName: string | null;
  sizeBytes: number | null;
  bytesWritten: number;
  contentType: string | null;
  startedAt: string;
  finishedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}): DownloadTaskTransferRecord {
  return {
    id: row.id,
    downloadTaskId: row.downloadTaskId,
    comicResourceId: row.comicResourceId,
    provider: normalizeProvider(row.provider),
    status: normalizeDownloadTransferStatus(row.status),
    tempFilePath: row.tempFilePath,
    fileName: row.fileName,
    sizeBytes: row.sizeBytes == null ? null : Number(row.sizeBytes),
    bytesWritten: Number(row.bytesWritten ?? 0),
    contentType: row.contentType,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function upsertDownloadTaskTransfer(input: {
  bytesWritten: number;
  comicResourceId: string | null;
  contentType: string | null;
  downloadTaskId: string;
  errorMessage: string | null;
  fileName: string | null;
  finishedAt: string | null;
  provider: DownloadProvider;
  sizeBytes: number | null;
  startedAt: string;
  status: DownloadTransferStatus;
  tempFilePath: string | null;
}) {
  const now = new Date().toISOString();
  const existing = getDb()
    .select({ id: downloadTaskTransfers.id })
    .from(downloadTaskTransfers)
    .where(eq(downloadTaskTransfers.downloadTaskId, input.downloadTaskId))
    .get();
  const values = {
    bytesWritten: Math.max(0, Math.trunc(input.bytesWritten)),
    comicResourceId: input.comicResourceId,
    contentType: input.contentType,
    downloadTaskId: input.downloadTaskId,
    errorMessage: input.errorMessage,
    fileName: input.fileName,
    finishedAt: input.finishedAt,
    provider: input.provider,
    sizeBytes: input.sizeBytes == null ? null : Math.max(0, Math.trunc(input.sizeBytes)),
    startedAt: input.startedAt,
    status: input.status,
    tempFilePath: input.tempFilePath,
    updatedAt: now,
  };

  if (existing) {
    getDb().update(downloadTaskTransfers).set(values).where(eq(downloadTaskTransfers.id, existing.id)).run();
  } else {
    getDb()
      .insert(downloadTaskTransfers)
      .values({
        ...values,
        id: randomUUID(),
      })
      .run();
  }

  const transfer = getDownloadTaskTransferByTaskId(input.downloadTaskId);
  if (!transfer) {
    throw new Error("读取下载临时文件记录失败。");
  }

  return transfer;
}

function markDownloadTaskRunning(taskId: string, updatedAt: string) {
  getDb()
    .update(downloadTasks)
    .set({
      errorMessage: null,
      status: "running",
      updatedAt,
    })
    .where(eq(downloadTasks.id, taskId))
    .run();
}

function markDownloadTaskFinished(taskId: string, status: Extract<DownloadTaskStatus, "completed" | "failed">, errorMessage: string | null, updatedAt: string) {
  getDb()
    .update(downloadTasks)
    .set({
      errorMessage,
      status,
      updatedAt,
    })
    .where(eq(downloadTasks.id, taskId))
    .run();
}

function getNextPendingDownloadFinalization() {
  const row = getDb()
    .select({
      taskId: downloadTaskTransfers.downloadTaskId,
    })
    .from(downloadTaskTransfers)
    .where(
      sql`${downloadTaskTransfers.status} = 'completed' and not exists (
        select 1 from download_task_finalizations
        where download_task_finalizations.download_task_id = ${downloadTaskTransfers.downloadTaskId}
      )`,
    )
    .orderBy(downloadTaskTransfers.updatedAt)
    .limit(1)
    .get();

  if (!row) {
    return null;
  }

  const task = getDownloadTaskById(row.taskId);
  const transfer = getDownloadTaskTransferByTaskId(row.taskId);

  if (!task || !transfer || transfer.status !== "completed") {
    return null;
  }

  const resource = getDownloadProviderResourceSnapshot(task.comicResourceId);

  return {
    task,
    transfer,
    resource: resource ? toDownloadDispatchResourceRecord(resource) : null,
  };
}

async function finalizeDownloadedTask(task: DownloadTaskRecord, transfer: DownloadTaskTransferRecord): Promise<DownloadTaskFinalizationRecord> {
  const finalizedAt = new Date().toISOString();

  try {
    if (!transfer.tempFilePath) {
      throw new Error("下载临时文件路径缺失。");
    }

    const settings = await getRuntimeSettings();
    const tempDirectory = resolveDownloadTaskTempDirectory(settings, task.id);
    const tempFilePath = path.resolve(transfer.tempFilePath);

    assertPathInside(tempDirectory, tempFilePath);
    await stat(tempFilePath);

    const importRoot = await resolveDownloadImportRoot(task);
    const finalPath = await resolveUniqueFinalDownloadPath(importRoot.absolutePath, task, transfer);

    assertPathInside(importRoot.absolutePath, finalPath);
    await mkdir(path.dirname(finalPath), { recursive: true });
    await moveFileAcrossDevices(tempFilePath, finalPath);

    const scanResult = await scanMangaRoot(importRoot.id);
    const finalization = upsertDownloadTaskFinalization({
      comicResourceId: task.comicResourceId || null,
      downloadTaskId: task.id,
      errorMessage: null,
      finalPath,
      finalizedAt,
      mangaRootId: importRoot.id,
      provider: task.provider,
      scanSessionId: scanResult.sessionId,
      status: "completed",
    });
    markDownloadTaskFinished(task.id, "completed", null, finalizedAt);

    return finalization;
  } catch (error) {
    const message = toSafeDownloadErrorMessage(error);
    const finalization = upsertDownloadTaskFinalization({
      comicResourceId: task.comicResourceId || null,
      downloadTaskId: task.id,
      errorMessage: message,
      finalPath: null,
      finalizedAt,
      mangaRootId: null,
      provider: task.provider,
      scanSessionId: null,
      status: "failed",
    });
    markDownloadTaskFinished(task.id, "failed", message, finalizedAt);

    return finalization;
  }
}

function attachDownloadTaskFinalizations(tasks: DownloadTaskRecord[]): DownloadTaskRecord[] {
  if (tasks.length === 0) {
    return tasks;
  }

  const finalizationsByTaskId = listDownloadTaskFinalizationMap(tasks.map((task) => task.id));

  return tasks.map((task) => ({
    ...task,
    finalization: finalizationsByTaskId.get(task.id) ?? null,
  }));
}

function listDownloadTaskFinalizationMap(taskIds: string[]) {
  const rows = getDb()
    .select({
      id: downloadTaskFinalizations.id,
      downloadTaskId: downloadTaskFinalizations.downloadTaskId,
      comicResourceId: downloadTaskFinalizations.comicResourceId,
      provider: downloadTaskFinalizations.provider,
      status: downloadTaskFinalizations.status,
      mangaRootId: downloadTaskFinalizations.mangaRootId,
      finalPath: downloadTaskFinalizations.finalPath,
      scanSessionId: downloadTaskFinalizations.scanSessionId,
      errorMessage: downloadTaskFinalizations.errorMessage,
      finalizedAt: downloadTaskFinalizations.finalizedAt,
      createdAt: downloadTaskFinalizations.createdAt,
      updatedAt: downloadTaskFinalizations.updatedAt,
    })
    .from(downloadTaskFinalizations)
    .where(inArray(downloadTaskFinalizations.downloadTaskId, taskIds))
    .all();

  return new Map(rows.map((row) => [row.downloadTaskId, mapDownloadTaskFinalizationRow(row)]));
}

function getDownloadTaskFinalizationByTaskId(downloadTaskId: string): DownloadTaskFinalizationRecord | null {
  const row = getDb()
    .select({
      id: downloadTaskFinalizations.id,
      downloadTaskId: downloadTaskFinalizations.downloadTaskId,
      comicResourceId: downloadTaskFinalizations.comicResourceId,
      provider: downloadTaskFinalizations.provider,
      status: downloadTaskFinalizations.status,
      mangaRootId: downloadTaskFinalizations.mangaRootId,
      finalPath: downloadTaskFinalizations.finalPath,
      scanSessionId: downloadTaskFinalizations.scanSessionId,
      errorMessage: downloadTaskFinalizations.errorMessage,
      finalizedAt: downloadTaskFinalizations.finalizedAt,
      createdAt: downloadTaskFinalizations.createdAt,
      updatedAt: downloadTaskFinalizations.updatedAt,
    })
    .from(downloadTaskFinalizations)
    .where(eq(downloadTaskFinalizations.downloadTaskId, downloadTaskId))
    .get();

  return row ? mapDownloadTaskFinalizationRow(row) : null;
}

function mapDownloadTaskFinalizationRow(row: {
  id: string;
  downloadTaskId: string;
  comicResourceId: string | null;
  provider: string;
  status: string;
  mangaRootId: string | null;
  finalPath: string | null;
  scanSessionId: string | null;
  errorMessage: string | null;
  finalizedAt: string;
  createdAt: string;
  updatedAt: string;
}): DownloadTaskFinalizationRecord {
  return {
    id: row.id,
    downloadTaskId: row.downloadTaskId,
    comicResourceId: row.comicResourceId,
    provider: normalizeProvider(row.provider),
    status: normalizeDownloadFinalizationStatus(row.status),
    mangaRootId: row.mangaRootId,
    finalPath: row.finalPath,
    scanSessionId: row.scanSessionId,
    errorMessage: row.errorMessage,
    finalizedAt: row.finalizedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function upsertDownloadTaskFinalization(input: {
  comicResourceId: string | null;
  downloadTaskId: string;
  errorMessage: string | null;
  finalPath: string | null;
  finalizedAt: string;
  mangaRootId: string | null;
  provider: DownloadProvider;
  scanSessionId: string | null;
  status: DownloadFinalizationStatus;
}) {
  const now = new Date().toISOString();
  const existing = getDb()
    .select({ id: downloadTaskFinalizations.id })
    .from(downloadTaskFinalizations)
    .where(eq(downloadTaskFinalizations.downloadTaskId, input.downloadTaskId))
    .get();
  const values = {
    comicResourceId: input.comicResourceId,
    downloadTaskId: input.downloadTaskId,
    errorMessage: input.errorMessage,
    finalPath: input.finalPath,
    finalizedAt: input.finalizedAt,
    mangaRootId: input.mangaRootId,
    provider: input.provider,
    scanSessionId: input.scanSessionId,
    status: input.status,
    updatedAt: now,
  };

  if (existing) {
    getDb().update(downloadTaskFinalizations).set(values).where(eq(downloadTaskFinalizations.id, existing.id)).run();
  } else {
    getDb()
      .insert(downloadTaskFinalizations)
      .values({
        ...values,
        id: randomUUID(),
      })
      .run();
  }

  const finalization = getDownloadTaskFinalizationByTaskId(input.downloadTaskId);
  if (!finalization) {
    throw new Error("读取下载入库记录失败。");
  }

  return finalization;
}

async function resolveDownloadImportRoot(task: DownloadTaskRecord): Promise<MangaRootRecord> {
  const repository = createMangaRootRepository();
  const roots = await repository.list();
  const targetDirectory = normalizeTargetDirectory(task.targetDirectory);
  const importRootPath =
    targetDirectory ??
    (() => {
      const enabledRoots = roots.filter((root) => root.isEnabled);
      const baseRoot = enabledRoots.find((root) => path.basename(root.absolutePath) !== DOWNLOAD_IMPORT_DIRECTORY_NAME) ?? enabledRoots[0];

      if (!baseRoot) {
        throw new Error("没有可用的 manga root，无法确定下载入库目录。");
      }

      return path.join(baseRoot.absolutePath, DOWNLOAD_IMPORT_DIRECTORY_NAME);
    })();
  const normalizedImportRootPath = path.resolve(importRootPath);
  const existingRoot = roots.find((root) => path.resolve(root.absolutePath) === normalizedImportRootPath);

  if (existingRoot) {
    if (!existingRoot.isEnabled) {
      throw new Error("下载入库目录对应的 manga root 已停用。");
    }

    return existingRoot;
  }

  await mkdir(normalizedImportRootPath, { recursive: true });

  return repository.create({
    absolutePath: normalizedImportRootPath,
    displayName: DOWNLOAD_IMPORT_DIRECTORY_NAME,
  });
}

async function resolveUniqueFinalDownloadPath(importRootPath: string, task: DownloadTaskRecord, transfer: DownloadTaskTransferRecord) {
  const fileName = sanitizeDownloadFileName(transfer.fileName ?? task.resourceLabel);
  const extension = path.extname(fileName).toLowerCase();
  const title = sanitizeDownloadFileName(task.comicTitle);
  const candidate =
    extension === ".zip" || extension === ".cbz"
      ? path.join(importRootPath, `${title}${extension}`)
      : path.join(importRootPath, title, fileName);

  return resolveUniquePath(candidate);
}

async function resolveUniquePath(candidatePath: string) {
  const extension = path.extname(candidatePath);
  const basename = path.basename(candidatePath, extension);
  const directory = path.dirname(candidatePath);
  let currentPath = candidatePath;

  for (let index = 1; await pathExists(currentPath); index += 1) {
    currentPath = path.join(directory, `${basename} (${index})${extension}`);
  }

  return currentPath;
}

async function pathExists(value: string) {
  try {
    await access(value);
    return true;
  } catch {
    return false;
  }
}

async function moveFileAcrossDevices(sourcePath: string, targetPath: string) {
  try {
    await rename(sourcePath, targetPath);
  } catch (error) {
    if (!isCrossDeviceMoveError(error)) {
      throw error;
    }

    await copyFile(sourcePath, targetPath);
    await rm(sourcePath, { force: true });
  }
}

function isCrossDeviceMoveError(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "EXDEV");
}

function getCloudScanSessionById(sessionId: string): CloudScanSessionRecord | null {
  const row = getDb()
    .select({
      id: cloudScanSessions.id,
      provider: cloudScanSessions.provider,
      comicResourceId: cloudScanSessions.comicResourceId,
      comicTitle: comics.displayTitle,
      resourceLabel: comicResources.displayLabel,
      redactedResource: comicResources.redactedResource,
      rootPath: cloudScanSessions.rootPath,
      status: cloudScanSessions.status,
      startedAt: cloudScanSessions.startedAt,
      finishedAt: cloudScanSessions.finishedAt,
      totalCount: cloudScanSessions.totalCount,
      fileCount: cloudScanSessions.fileCount,
      directoryCount: cloudScanSessions.directoryCount,
      importableFileCount: cloudScanSessions.importableFileCount,
      errorSummary: cloudScanSessions.errorSummary,
      createdAt: cloudScanSessions.createdAt,
      updatedAt: cloudScanSessions.updatedAt,
    })
    .from(cloudScanSessions)
    .leftJoin(comicResources, eq(comicResources.id, cloudScanSessions.comicResourceId))
    .leftJoin(comics, eq(comics.id, comicResources.comicId))
    .where(eq(cloudScanSessions.id, sessionId))
    .get();

  return row ? mapCloudScanSessionRow(row, listCloudScanPreviewEntries(row.id)) : null;
}

function getCloudScanImportSessionById(sessionId: string) {
  const row = getDb()
    .select({
      id: cloudScanSessions.id,
      provider: cloudScanSessions.provider,
      comicResourceId: cloudScanSessions.comicResourceId,
      comicId: comicResources.comicId,
      comicSourceId: comicResources.comicSourceId,
      status: cloudScanSessions.status,
    })
    .from(cloudScanSessions)
    .leftJoin(comicResources, eq(comicResources.id, cloudScanSessions.comicResourceId))
    .where(eq(cloudScanSessions.id, sessionId))
    .get();

  return row
    ? {
        id: row.id,
        provider: normalizeProvider(row.provider),
        comicResourceId: row.comicResourceId,
        comicId: row.comicId,
        comicSourceId: row.comicSourceId,
        status: normalizeCloudScanStatus(row.status),
      }
    : null;
}

function listImportableCloudScanEntries(sessionId: string) {
  return getDb()
    .select({
      id: cloudScanEntries.id,
      name: cloudScanEntries.name,
      remotePath: cloudScanEntries.remotePath,
    })
    .from(cloudScanEntries)
    .where(and(eq(cloudScanEntries.sessionId, sessionId), eq(cloudScanEntries.kind, "file"), eq(cloudScanEntries.rawUrlAvailable, true)))
    .orderBy(cloudScanEntries.name)
    .all();
}

function listCloudScanPreviewEntries(sessionId: string): CloudScanEntryRecord[] {
  const rows = getDb()
    .select({
      id: cloudScanEntries.id,
      sessionId: cloudScanEntries.sessionId,
      provider: cloudScanEntries.provider,
      remotePath: cloudScanEntries.remotePath,
      parentPath: cloudScanEntries.parentPath,
      name: cloudScanEntries.name,
      kind: cloudScanEntries.kind,
      depth: cloudScanEntries.depth,
      sizeBytes: cloudScanEntries.sizeBytes,
      modifiedAt: cloudScanEntries.modifiedAt,
      remoteProvider: cloudScanEntries.remoteProvider,
      rawUrlAvailable: cloudScanEntries.rawUrlAvailable,
      createdAt: cloudScanEntries.createdAt,
    })
    .from(cloudScanEntries)
    .where(eq(cloudScanEntries.sessionId, sessionId))
    .orderBy(cloudScanEntries.kind, cloudScanEntries.name)
    .limit(5)
    .all();

  return rows.map((row) => ({
    id: row.id,
    sessionId: row.sessionId,
    provider: normalizeProvider(row.provider),
    remotePath: row.remotePath,
    parentPath: row.parentPath,
    name: row.name,
    kind: normalizeCloudScanEntryKind(row.kind),
    depth: Number(row.depth ?? 1),
    sizeBytes: row.sizeBytes,
    modifiedAt: row.modifiedAt,
    remoteProvider: row.remoteProvider,
    rawUrlAvailable: Boolean(row.rawUrlAvailable),
    createdAt: row.createdAt,
  }));
}

function mapCloudScanSessionRow(
  row: {
    id: string;
    provider: string;
    comicResourceId: string | null;
    comicTitle: string | null;
    resourceLabel: string | null;
    redactedResource: string | null;
    rootPath: string;
    status: string;
    startedAt: string;
    finishedAt: string | null;
    totalCount: number;
    fileCount: number;
    directoryCount: number;
    importableFileCount: number;
    errorSummary: string | null;
    createdAt: string;
    updatedAt: string;
  },
  previewEntries: CloudScanEntryRecord[],
): CloudScanSessionRecord {
  return {
    id: row.id,
    provider: normalizeProvider(row.provider),
    comicResourceId: row.comicResourceId,
    comicTitle: row.comicTitle,
    resourceLabel: row.resourceLabel,
    redactedResource: row.redactedResource,
    rootPath: row.rootPath,
    status: normalizeCloudScanStatus(row.status),
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    totalCount: Number(row.totalCount ?? 0),
    fileCount: Number(row.fileCount ?? 0),
    directoryCount: Number(row.directoryCount ?? 0),
    importableFileCount: Number(row.importableFileCount ?? 0),
    errorSummary: row.errorSummary,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    previewEntries,
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

function getOpenListCloudScanResourceById(comicResourceId: string) {
  const row = getDb()
    .select({
      id: comicResources.id,
      comicTitle: comics.displayTitle,
      displayLabel: comicResources.displayLabel,
      redactedResource: comicResources.redactedResource,
      resourceType: comicResources.resourceType,
      resourceUrl: comicResources.resourceUrl,
    })
    .from(comicResources)
    .leftJoin(comics, eq(comics.id, comicResources.comicId))
    .where(eq(comicResources.id, comicResourceId))
    .get();

  return row
    ? {
        ...row,
        comicTitle: row.comicTitle ?? "未知漫画",
        displayLabel: row.displayLabel?.trim() || row.resourceType || "资源",
        redactedResource: row.redactedResource?.trim() || "资源已脱敏",
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

function createFallbackCloudScanSession(
  sessionId: string,
  resource: NonNullable<ReturnType<typeof getOpenListCloudScanResourceById>>,
  rootPath: string,
  status: CloudScanStatus,
  startedAt: string,
  finishedAt: string,
  errorSummary: string | null,
): CloudScanSessionRecord {
  return {
    id: sessionId,
    provider: "openlist",
    comicResourceId: resource.id,
    comicTitle: resource.comicTitle,
    resourceLabel: resource.displayLabel,
    redactedResource: resource.redactedResource,
    rootPath,
    status,
    startedAt,
    finishedAt,
    totalCount: 0,
    fileCount: 0,
    directoryCount: 0,
    importableFileCount: 0,
    errorSummary,
    createdAt: startedAt,
    updatedAt: finishedAt,
    previewEntries: [],
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

function normalizeDownloadFinalizationStatus(value: unknown): DownloadFinalizationStatus {
  if (isDownloadFinalizationStatus(value)) {
    return value;
  }

  throw new Error("下载入库状态无效。");
}

function normalizeDownloadPreparationStatus(value: unknown): DownloadPreparationStatus {
  if (isDownloadPreparationStatus(value)) {
    return value;
  }

  throw new Error("下载准备状态无效。");
}

function normalizeDownloadTransferStatus(value: unknown): DownloadTransferStatus {
  if (isDownloadTransferStatus(value)) {
    return value;
  }

  throw new Error("下载临时文件状态无效。");
}

function normalizeCloudScanStatus(value: unknown): CloudScanStatus {
  if (isCloudScanStatus(value)) {
    return value;
  }

  throw new Error("云端扫描状态无效。");
}

function normalizeCloudScanEntryKind(value: unknown): CloudScanEntryRecord["kind"] {
  if (value === "file" || value === "directory") {
    return value;
  }

  throw new Error("云端扫描条目类型无效。");
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

function isDownloadFinalizationStatus(value: unknown): value is DownloadFinalizationStatus {
  return DOWNLOAD_FINALIZATION_STATUSES.includes(value as DownloadFinalizationStatus);
}

function isDownloadPreparationStatus(value: unknown): value is DownloadPreparationStatus {
  return DOWNLOAD_PREPARATION_STATUSES.includes(value as DownloadPreparationStatus);
}

function isDownloadTransferStatus(value: unknown): value is DownloadTransferStatus {
  return DOWNLOAD_TRANSFER_STATUSES.includes(value as DownloadTransferStatus);
}

function isCloudScanStatus(value: unknown): value is CloudScanStatus {
  return CLOUD_SCAN_STATUSES.includes(value as CloudScanStatus);
}

function isComicResourceType(value: unknown): value is ComicResourceType {
  return COMIC_RESOURCE_TYPES.includes(value as ComicResourceType);
}

function isDownloadTaskEventOperation(value: unknown): value is DownloadTaskEventOperation {
  return DOWNLOAD_TASK_EVENT_OPERATIONS.includes(value as DownloadTaskEventOperation);
}

function joinOpenListRemotePath(parentPath: string, name: string) {
  return `${parentPath.replace(/\/+$/, "")}/${name.replace(/^\/+/, "")}`;
}

function redactOpenListRemotePath(remotePath: string, name: string) {
  const safeName = name.trim() || remotePath.split("/").filter(Boolean).pop() || "资源";
  return `openlist:/.../${safeName}`;
}

function readinessStringDetail(details: Record<string, boolean | number | string | null>, key: string) {
  const value = details[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readinessNumberDetail(details: Record<string, boolean | number | string | null>, key: string) {
  const value = details[key];
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : null;
}

function resolveDownloadTaskTempDirectory(settings: RuntimeSettings, taskId: string) {
  return path.resolve(process.cwd(), settings.cacheDirectory, "downloads", "tmp", taskId);
}

function sanitizeDownloadFileName(value: string) {
  const sanitized = value
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .slice(0, 180);

  if (!sanitized || sanitized === "." || sanitized === "..") {
    return "download.bin";
  }

  return sanitized;
}

function assertPathInside(parentPath: string, childPath: string) {
  const relativePath = path.relative(parentPath, childPath);
  if (relativePath && (relativePath.startsWith("..") || path.isAbsolute(relativePath))) {
    throw new Error("临时下载路径越界。");
  }
}

function normalizeHttpDownloadUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("unsupported");
    }
    return url.toString();
  } catch {
    throw new Error("OpenList 返回了不支持的下载链接协议。");
  }
}

function parseContentLength(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : null;
}

function normalizeContentType(value: string | null) {
  return value?.trim() || null;
}

function toSafeDownloadErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return "OpenList 临时文件下载失败。";
  }

  const message = error.message.trim();
  if (!message) {
    return "OpenList 临时文件下载失败。";
  }

  if (/https?:\/\//i.test(message) || /sign=/i.test(message) || /token=/i.test(message)) {
    return "OpenList 临时文件下载失败。";
  }

  return message;
}

async function pollOpenListDownloadStatus(): Promise<string[]> {
  const db = getDb();
  const MAX_POLL_RETRIES = 30;
  const now = new Date().toISOString();
  const runningTasks = db.select({ id: downloadTasks.id, errorMessage: downloadTasks.errorMessage, retryCount: downloadTasks.retryCount }).from(downloadTasks)
    .where(and(eq(downloadTasks.status, "running"), eq(downloadTasks.provider, "openlist"))).all();
  if (runningTasks.length === 0) return [];

  const settings = await getRuntimeSettings();
  if (!settings.openlistEnabled || !settings.openlistBaseUrl.trim() || !settings.openlistToken.trim()) return [];
  const baseUrl = settings.openlistBaseUrl.replace(/\/+$/, "");
  const token = settings.openlistToken.trim();
  if (!baseUrl) return [];

  // Fetch task statuses from OpenList
  let olTasks: Array<{ id: string; name: string; state: number; error: string }> = [];
  try {
    for (const kind of ["undone", "done"]) {
      const res = await fetch(`${baseUrl}/api/task/offline_download/${kind}`, {
        method: "GET",
        headers: { Authorization: token },
        signal: AbortSignal.timeout(5000),
      });
      const p = await res.json().catch(() => null);
      if (p?.code === 200 && Array.isArray(p?.data)) olTasks.push(...p.data);
    }
  } catch { /* skip */ }

  const results: string[] = [];

  for (const task of runningTasks) {
    let info: { olTaskId?: string; olPath?: string; comicTitle?: string } = {};
    try { info = JSON.parse(task.errorMessage ?? "{}"); } catch { continue; }
    if (!info.olPath) continue;

    // Check OpenList task status
    const matchedOlTask = info.olTaskId ? olTasks.find((t) => t.id === info.olTaskId) : null;

    if (matchedOlTask) {
      // state: 0=queued, 1=downloading, 2=done, 3=error, 7=error(duplicate)
      if (matchedOlTask.state === 2) {
        // File completed on OpenList, now download it to local manga root
        try {
          const fullTask = getDownloadTaskById(task.id);
          if (fullTask) {
            const transfer = await downloadOpenListCompletedFile(fullTask, info, baseUrl, token);
            if (transfer) {
              // Temp file downloaded, finalize (move to manga root + scan)
              const finalResult = await finalizeDownloadedTask(fullTask, transfer);
              if (finalResult.status === "completed") {
                results.push(`${info.comicTitle || "任务"}: 已下载到 ${finalResult.finalPath}`);
              } else {
                markDownloadTaskFinished(task.id, "failed", finalResult.errorMessage ?? "入库失败", now);
                results.push(`${info.comicTitle || "任务"}: 入库失败`);
              }
              continue;
            }
          }
        } catch (e) {
          markDownloadTaskFinished(task.id, "failed", e instanceof Error ? e.message : "下载失败", now);
          results.push(`${info.comicTitle || "任务"}: ${e instanceof Error ? e.message : "下载失败"}`);
          continue;
        }
        // Fallback: just mark completed if download failed
        markDownloadTaskFinished(task.id, "completed", null, now);
        results.push(`${info.comicTitle || "任务"}: OpenList 下载完成（未拉回本地）`);
        continue;
      }
      if (matchedOlTask.state === 3 || matchedOlTask.state === 7 || matchedOlTask.error) {
        const errMsg = matchedOlTask.error || "OpenList 下载失败";
        markDownloadTaskFinished(task.id, "failed", errMsg, now);
        results.push(`${info.comicTitle || "任务"}: ${errMsg}`);
        continue;
      }
      // Still downloading (state 0 or 1)
      db.update(downloadTasks).set({ retryCount: (task.retryCount ?? 0) + 1, updatedAt: now }).where(eq(downloadTasks.id, task.id)).run();
      continue;
    }

    // Fallback: check target directory for completed file
    try {
      const res = await fetch(`${baseUrl}/api/fs/list`, {
        method: "POST",
        headers: { Authorization: token, "Content-Type": "application/json" },
        body: JSON.stringify({ path: info.olPath, page: 1, per_page: 100, refresh: true }),
        signal: AbortSignal.timeout(5000),
      });
      const p = await res.json().catch(() => null);
      if (p?.code === 200 && p?.data?.content) {
        const files = p.data.content as Array<{ name: string; size: number; is_dir?: boolean }>;
        const title = info.comicTitle ?? "";
        const matched = files.find((f) => !f.is_dir && f.size > 0 && (f.name.includes(title) || title.includes(f.name)));
        if (matched) {
          markDownloadTaskFinished(task.id, "completed", null, now);
          results.push(`${title}: OpenList 下载完成`);
          continue;
        }
      }
    } catch { /* skip */ }

    // Mark as failed if exceeded retry limit
    if ((task.retryCount ?? 0) >= MAX_POLL_RETRIES) {
      markDownloadTaskFinished(task.id, "failed", "OpenList 下载超时", now);
      results.push(`${info.comicTitle || "任务"}: 轮询超时，已标记为失败`);
    } else {
      db.update(downloadTasks).set({ retryCount: (task.retryCount ?? 0) + 1, updatedAt: now }).where(eq(downloadTasks.id, task.id)).run();
    }
  }

  return results;
}

async function downloadOpenListCompletedFile(
  task: DownloadTaskRecord,
  info: { olTaskId?: string; olPath?: string; comicTitle?: string },
  baseUrl: string,
  token: string,
): Promise<DownloadTaskTransferRecord | null> {
  // Find the completed file in the OpenList directory
  const title = info.comicTitle ?? task.comicTitle;
  const listRes = await fetch(`${baseUrl}/api/fs/list`, {
    method: "POST",
    headers: { Authorization: token, "Content-Type": "application/json" },
    body: JSON.stringify({ path: info.olPath || "/115Open/Temp", page: 1, per_page: 100, refresh: true }),
    signal: AbortSignal.timeout(5000),
  });
  const listData = await listRes.json().catch(() => null);
  if (listData?.code !== 200 || !listData?.data?.content) return null;

  const files = listData.data.content as Array<{ name: string; size: number; is_dir?: boolean }>;
  const matchedFile = files.find((f) => !f.is_dir && f.size > 0 && (f.name.includes(title) || title.includes(f.name)));
  if (!matchedFile) return null;

  const remotePath = `${(info.olPath || "/115Open/Temp").replace(/\/$/, "")}/${matchedFile.name}`;

  // Create a fake preparation record with the remote path
  const prep: DownloadTaskPreparationRecord = {
    id: randomUUID(),
    downloadTaskId: task.id,
    comicResourceId: task.comicResourceId || null,
    provider: task.provider,
    status: "ready",
    remotePath,
    remoteName: matchedFile.name,
    sizeBytes: matchedFile.size,
    remoteProvider: null,
    rawUrlAvailable: true,
    errorMessage: null,
    preparedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return downloadPreparedOpenListTask(task, prep);
}
