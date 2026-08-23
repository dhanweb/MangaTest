import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
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
  localFiles,
  operationLogs,
  videoResources,
  videoRoots,
} from "@/modules/core/db";
import { getRuntimeSettings, type RuntimeSettings } from "@/modules/core/settings";
import { createMangaRootRepository, scanMangaRoot, type MangaRootRecord } from "@/modules/library";
import { scanVideoRoot } from "@/modules/video-library";
import { DOWNLOAD_IMPORT_DIRECTORY_NAME } from "@/modules/local-files";

import {
  ensureOpenListToken,
  listOpenListDirectory,
  listOpenListOfflineTasks,
  normalizeOpenListResourcePath,
  resolveOpenListDownloadLink,
  submitOpenListOfflineDownload,
} from "./providers/openlist/connection";
import {
  DEFAULT_OPENLIST_DUPLICATE_SEARCH_ROOT,
  normalizeOpenListLocateRoot,
} from "./openlist-duplicate-locate";
import {
  buildIndexAmbiguousMessage,
  buildIndexNotFoundMessage,
  buildIndexRecoveredMessage,
  buildPendingDuplicateRecoveryMessage,
  isLibraryIndexRematchCandidateError,
  isOpenListDuplicateOfflineError,
  isPendingDuplicateRecoveryError,
  isRecoverableDuplicateOfflineError,
} from "./openlist-duplicate-error";
import {
  DEFAULT_OPENLIST_LIBRARY_INDEX_TTL_MINUTES,
  ensureOpenListLibraryIndex,
  getLatestCompletedIndexSession,
  isIndexSessionFresh,
  startOpenListLibraryIndexInBackground,
  __resetOpenListLibraryIndexInFlightForTests,
} from "./openlist-library-index";
import { matchTaskHintsAgainstIndex } from "./openlist-duplicate-recover";
import { cancelAria2Download, cleanupAria2TempDir, downloadWithAria2 } from "./providers/aria2/client";
import { getDownloadProviderAdapter, listDownloadProviderAdapters } from "./providers/registry";
import type { DownloadProviderReadiness, DownloadProviderResourceSnapshot } from "./providers/types";

export { getDownloadProviderAdapter, listDownloadProviderAdapters };
export type { DownloadProviderAdapter, DownloadProviderReadiness, DownloadProviderResourceSnapshot } from "./providers/types";

export const DOWNLOAD_PROVIDERS = ["openlist", "builtin-http", "aria2"] as const;
export type DownloadProvider = (typeof DOWNLOAD_PROVIDERS)[number];

export const DOWNLOAD_TASK_STATUSES = ["queued", "submitted", "downloading", "running", "failed", "completed", "cancel_requested", "canceled"] as const;
export type DownloadTaskStatus = (typeof DOWNLOAD_TASK_STATUSES)[number];

export const DOWNLOAD_TASK_TYPES = ["offline", "transfer"] as const;
export type DownloadTaskType = (typeof DOWNLOAD_TASK_TYPES)[number];

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

const DOWNLOAD_TASK_EVENT_OPERATIONS = [
  "download_task_create",
  "download_task_cancel",
  "download_task_retry",
  "download_task_pull_back",
] as const;
export type DownloadTaskEventOperation = (typeof DOWNLOAD_TASK_EVENT_OPERATIONS)[number];

export const CREATE_TRANSFER_FROM_OFFLINE_FAILURE_CODES = [
  "not_offline_task",
  "openlist_disabled",
  "openlist_base_url_missing",
  "openlist_token_missing",
  "remote_list_timeout",
  "remote_list_http_error",
  "remote_list_api_error",
  "remote_list_empty",
  "remote_list_failed",
  "task_create_failed",
] as const;
export type CreateTransferFromOfflineFailureCode = (typeof CREATE_TRANSFER_FROM_OFFLINE_FAILURE_CODES)[number];

export type CreateTransferFromOfflineResult =
  | {
      ok: true;
      task: DownloadTaskRecord;
      message: string;
      details: {
        remotePath: string;
        remoteFilePath: string;
        fileName: string;
        fileSize: number;
        comicTitle: string;
        matchedBy: "title" | "resource_label" | "parent_dir" | "largest_file";
      };
    }
  | {
      ok: false;
      task?: undefined;
      code: CreateTransferFromOfflineFailureCode;
      message: string;
      details: {
        remotePath?: string;
        comicTitle?: string;
        openlistCode?: number | null;
        httpStatus?: number | null;
        fileCount?: number;
        dirCount?: number;
        errorName?: string;
        errorMessage?: string;
      };
    };

export interface CreateDownloadTaskInput {
  comicResourceId: string;
  provider?: DownloadProvider;
  taskType?: DownloadTaskType;
  targetDirectory?: string | null;
}

export interface VideoDownloadTaskRecord {
  id: string;
  title: string;
  resourceUrl: string;
  provider: "aria2";
  status: DownloadTaskStatus;
  targetDirectory: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
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
  /** Full resource URL (e.g. magnet) for local admin display; not for public pages. */
  resourceUrl: string | null;
  sourceSite: string | null;
  provider: DownloadProvider;
  taskType: DownloadTaskType;
  status: DownloadTaskStatus;
  offlineTaskId: string | null;
  remoteTaskId: string | null;
  remotePath: string | null;
  targetDirectory: string | null;
  errorMessage: string | null;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
  /** Local library comic created/matched after successful download finalization scan. */
  importedComicId?: string | null;
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
  taskType: DownloadTaskType;
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

const ACTIVE_TASK_STATUSES: DownloadTaskStatus[] = ["queued", "running", "submitted", "downloading", "cancel_requested"];
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
  const taskType = input.taskType
    ? normalizeDownloadTaskType(input.taskType)
    : (provider === "openlist" ? "offline" as const : "transfer" as const);

  if (!isProviderCompatibleWithResourceType(provider, resource.resourceType)) {
    throw new Error(`资源类型 ${resource.resourceType} 不能使用 ${provider} 下载。`);
  }

  const existingTask = db
    .select({ id: downloadTasks.id })
    .from(downloadTasks)
    .where(and(
      eq(downloadTasks.comicResourceId, comicResourceId),
      eq(downloadTasks.provider, provider),
      eq(downloadTasks.taskType, taskType),
      inArray(downloadTasks.status, ACTIVE_TASK_STATUSES),
    ))
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
      taskType,
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

  await dispatchTaskNow(taskId);

  return {
    created: true,
    task: getDownloadTaskById(taskId) ?? task,
  };
}

export async function createVideoDownloadTask(input: { title: string; resourceUrl: string; videoRootId: string; targetDirectory?: string | null; videoId?: string | null; videoSourceId?: string | null }) {
  bootstrapDatabase();
  const title = input.title.trim();
  const resourceUrl = input.resourceUrl.trim();
  if (!title) throw new Error("视频标题不能为空。");
  if (!/^https?:\/\//i.test(resourceUrl) && !resourceUrl.startsWith("magnet:")) throw new Error("视频下载地址必须是 http(s) 直链或 magnet。");
  const root = getDb().select().from(videoRoots).where(eq(videoRoots.id, input.videoRootId)).get();
  if (!root) throw new Error("找不到视频根目录。");
  const settings = await getRuntimeSettings();
  if (!settings.aria2Enabled || !settings.aria2RpcUrl) throw new Error("请先在设置中启用并配置 aria2。");
  const targetDirectory = input.targetDirectory?.trim() || path.join(root.absolutePath, "下载入库", sanitizeDownloadName(title));
  await mkdir(targetDirectory, { recursive: true });
  const db = getDb();
  const now = new Date().toISOString();
  const existingResource = input.videoId && input.videoSourceId
    ? db.select({ id: videoResources.id }).from(videoResources).where(and(eq(videoResources.videoId, input.videoId), eq(videoResources.videoSourceId, input.videoSourceId), eq(videoResources.resourceType, resourceUrl.startsWith("magnet:") ? "magnet" : "http"), eq(videoResources.resourceUrl, resourceUrl))).get()
    : null;
  const resourceId = existingResource?.id ?? randomUUID();
  const activeTask = db.select({ id: downloadTasks.id }).from(downloadTasks).where(and(eq(downloadTasks.videoResourceId, resourceId), inArray(downloadTasks.status, ["queued", "submitted", "downloading", "running"]))).get();
  if (activeTask) {
    return { created: false, task: await getVideoDownloadTask(activeTask.id) };
  }
  const taskId = randomUUID();
  if (existingResource) {
    db.update(videoResources).set({ displayLabel: title, resourceUrl, redactedResource: redactDownloadResource(resourceUrl), updatedAt: now }).where(eq(videoResources.id, resourceId)).run();
  } else {
    db.insert(videoResources).values({ id: resourceId, videoId: input.videoId ?? null, videoSourceId: input.videoSourceId ?? null, resourceType: resourceUrl.startsWith("magnet:") ? "magnet" : "http", displayLabel: title, resourceUrl, redactedResource: redactDownloadResource(resourceUrl), createdAt: now, updatedAt: now }).run();
  }
  db.insert(downloadTasks).values({ id: taskId, videoResourceId: resourceId, mediaType: "video", provider: "aria2", taskType: "transfer", status: "queued", targetDirectory, createdAt: now, updatedAt: now }).run();
  void runVideoDownloadTask(taskId, title, resourceUrl, targetDirectory, root.id, settings.aria2RpcUrl, settings.aria2RpcToken);
  return { created: true, task: await getVideoDownloadTask(taskId) };
}

export async function listVideoDownloadTasks(limit = 100): Promise<VideoDownloadTaskRecord[]> {
  bootstrapDatabase();
  const rows = getDb().select({ id: downloadTasks.id, title: videoResources.displayLabel, resourceUrl: videoResources.resourceUrl, provider: downloadTasks.provider, status: downloadTasks.status, targetDirectory: downloadTasks.targetDirectory, errorMessage: downloadTasks.errorMessage, createdAt: downloadTasks.createdAt, updatedAt: downloadTasks.updatedAt }).from(downloadTasks).leftJoin(videoResources, eq(videoResources.id, downloadTasks.videoResourceId)).where(eq(downloadTasks.mediaType, "video")).orderBy(desc(downloadTasks.createdAt)).limit(normalizeLimit(limit)).all();
  return rows.map((row) => ({ id: row.id, title: row.title || "视频下载", resourceUrl: row.resourceUrl || "", provider: "aria2", status: normalizeDownloadTaskStatus(row.status), targetDirectory: row.targetDirectory, errorMessage: row.errorMessage, createdAt: row.createdAt, updatedAt: row.updatedAt }));
}

async function getVideoDownloadTask(taskId: string) {
  const task = (await listVideoDownloadTasks(200)).find((item) => item.id === taskId);
  if (!task) throw new Error("创建视频下载任务失败。");
  return task;
}

async function runVideoDownloadTask(taskId: string, title: string, resourceUrl: string, targetDirectory: string, videoRootId: string, rpcUrl: string, rpcToken: string) {
  const db = getDb();
  const now = new Date().toISOString();
  db.update(downloadTasks).set({ status: "downloading", updatedAt: now }).where(eq(downloadTasks.id, taskId)).run();
  const result = await downloadWithAria2({
    rpcUrl,
    rpcToken: rpcToken || undefined,
    uri: resourceUrl,
    dir: targetDirectory,
    out: /^https?:\/\//i.test(resourceUrl) ? buildVideoDownloadFileName(title, resourceUrl) : undefined,
    taskId,
  });
  const finishedAt = new Date().toISOString();
  if (result.success) {
    db.update(downloadTasks).set({ status: "completed", updatedAt: finishedAt }).where(eq(downloadTasks.id, taskId)).run();
    await scanVideoRoot(videoRootId).catch((error) => db.update(downloadTasks).set({ errorMessage: error instanceof Error ? `下载完成但扫描失败：${error.message}` : "下载完成但扫描失败。", updatedAt: new Date().toISOString() }).where(eq(downloadTasks.id, taskId)).run());
  } else {
    db.update(downloadTasks).set({ status: "failed", errorMessage: result.errorMessage || "aria2 下载失败。", updatedAt: finishedAt }).where(eq(downloadTasks.id, taskId)).run();
  }
}

export async function listDownloadTasks(limit = 100, taskType?: DownloadTaskType): Promise<DownloadTaskRecord[]> {
  bootstrapDatabase();

  const conditions = taskType
    ? [eq(downloadTasks.taskType, taskType)]
    : [];

  const rows = getDb()
    .select({
      id: downloadTasks.id,
      comicResourceId: downloadTasks.comicResourceId,
      provider: downloadTasks.provider,
      status: downloadTasks.status,
      taskType: downloadTasks.taskType,
      offlineTaskId: downloadTasks.offlineTaskId,
      remoteTaskId: downloadTasks.remoteTaskId,
      remotePath: downloadTasks.remotePath,
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
      resourceUrl: comicResources.resourceUrl,
      sourceSite: comicSources.site,
    })
    .from(downloadTasks)
    .leftJoin(comicResources, eq(comicResources.id, downloadTasks.comicResourceId))
    .leftJoin(comics, eq(comics.id, comicResources.comicId))
    .leftJoin(comicSources, eq(comicSources.id, comicResources.comicSourceId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
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
    resourceUrl: row.resourceUrl ?? null,
    sourceSite: row.sourceSite,
    provider: normalizeProvider(row.provider),
    taskType: normalizeDownloadTaskType(row.taskType ?? "transfer"),
    status: normalizeDownloadTaskStatus(row.status),
    offlineTaskId: row.offlineTaskId ?? null,
    remoteTaskId: row.remoteTaskId ?? null,
    remotePath: row.remotePath ?? null,
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

export async function planNextDownloadDispatch(taskType?: DownloadTaskType): Promise<DownloadDispatchPlan> {
  bootstrapDatabase();

  const conditions = [eq(downloadTasks.status, "queued")];
  if (taskType) {
    conditions.push(eq(downloadTasks.taskType, taskType));
  }

  const nextTaskRow = getDb()
    .select({ id: downloadTasks.id })
    .from(downloadTasks)
    .where(and(...conditions))
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

  // 拉回本地已解析出具体远程文件路径时，直接进入 transfer，不再走 magnet 离线提交逻辑。
  if (task.taskType === "transfer" && task.provider === "openlist" && task.remotePath?.trim()) {
    if (!settings.openlistEnabled || !settings.openlistBaseUrl.trim() || !settings.openlistToken.trim()) {
      return createDownloadDispatchPlan({
        status: "blocked",
        reason: "OpenList 未正确配置，无法执行拉回传输。",
        provider: task.provider,
        adapterLabel: adapter.label,
        task,
        resource: toDownloadDispatchResourceRecord(resource),
        readiness: {
          canDispatch: false,
          code: "missing_settings",
          reason: "OpenList 未正确配置。",
        },
      });
    }

    return createDownloadDispatchPlan({
      status: "ready",
      reason: `使用已解析远程路径传输：${task.remotePath}`,
      provider: task.provider,
      adapterLabel: adapter.label,
      task,
      resource: toDownloadDispatchResourceRecord(resource),
      readiness: {
        canDispatch: true,
        code: "ready",
        reason: "远程路径已由拉回流程解析。",
        details: {
          remotePath: task.remotePath,
          remoteName: task.remotePath.split("/").filter(Boolean).pop() ?? task.resourceLabel,
        },
      },
    });
  }

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
  return runTransferWorkerTick();
}

export async function runTransferWorkerTick(): Promise<DownloadWorkerTickResult> {
  bootstrapDatabase();

  const pendingFinalization = getNextPendingDownloadFinalization();
  if (pendingFinalization) {
    const finalization = await finalizeDownloadedTask(pendingFinalization.task, pendingFinalization.transfer);
    const updatedTask = getDownloadTaskById(pendingFinalization.task.id);
    return {
      executed: finalization.status === "completed",
      taskType: "transfer",
      finalization,
      reason: finalization.status === "completed"
        ? "下载临时文件已移动到入库目录，并已触发漫画库扫描。"
        : finalization.errorMessage ?? "下载临时文件入库失败。",
      plan: createDownloadDispatchPlan({
        status: finalization.status === "completed" ? "ready" : "blocked",
        reason: finalization.status === "completed" ? "下载临时文件已入库并扫描。" : finalization.errorMessage ?? "下载临时文件入库失败。",
        provider: pendingFinalization.task.provider,
        task: updatedTask ?? pendingFinalization.task,
        resource: pendingFinalization.resource,
      }),
      transfer: pendingFinalization.transfer,
    };
  }

  let processed = 0;
  const reasons: string[] = [];
  for (let i = 0; i < 20; i++) {
    const plan = await planNextDownloadDispatch("transfer");
    if (plan.status !== "ready" || !plan.task) break;
    const msg = await dispatchTaskNow(plan.task.id);
    if (msg) { processed++; reasons.push(msg); }
  }

  if (processed > 0) {
    const plan = await planNextDownloadDispatch("transfer");
    return {
      executed: true,
      taskType: "transfer",
      finalization: null,
      reason: `处理了 ${processed} 个传输任务：${reasons.join("；")}`,
      plan: plan ?? createDownloadDispatchPlan({ status: "idle", reason: "所有传输任务已处理" }),
      transfer: null,
    };
  }

  const plan = await planNextDownloadDispatch("transfer");
  return {
    executed: false,
    taskType: "transfer",
    finalization: null,
    reason: plan.status === "idle" ? "没有排队中的传输任务" : plan.reason,
    plan,
    transfer: null,
  };
}

export async function runOfflineWorkerTick(): Promise<DownloadWorkerTickResult> {
  bootstrapDatabase();

  // Offline OpenList submit happens at create/retry (dispatchTaskNow). Worker only polls.
  // Safety net: drain pending 10008 recovery when a fresh index is available.
  const recoveryResults = await drainPendingOpenListDuplicateRecoveries();
  const pollResults = await pollOpenListDownloadStatus();
  const messages = [...recoveryResults, ...pollResults];
  if (messages.length > 0) {
    return {
      executed: true,
      taskType: "offline",
      finalization: null,
      reason: messages.join("；"),
      plan: createDownloadDispatchPlan({ status: "idle", reason: "离线任务状态已更新" }),
      transfer: null,
    };
  }

  return {
    executed: false,
    taskType: "offline",
    finalization: null,
    reason: "没有待轮询的已提交离线任务",
    plan: createDownloadDispatchPlan({ status: "idle", reason: "没有待轮询的已提交离线任务" }),
    transfer: null,
  };
}

export async function dispatchTaskNow(taskId: string): Promise<string | null> {
  bootstrapDatabase();

  const task = getDownloadTaskById(taskId);
  if (!task || task.status !== "queued") return null;

  const db = getDb();
  const now = new Date().toISOString();
  const settings = await getRuntimeSettings();

  if (task.taskType === "offline" && task.provider === "openlist" && task.resourceType === "magnet") {
    const uri = task.comicResourceId
      ? db.select({ url: comicResources.resourceUrl }).from(comicResources).where(eq(comicResources.id, task.comicResourceId)).get()?.url ?? ""
      : "";
    const offlineSavePath = resolveOpenListOfflineSavePath(settings);
    const result = await submitOpenListOfflineDownload(uri, offlineSavePath, "115 Open");
    if (result.ok) {
      db.update(downloadTasks).set({ status: "submitted", remoteTaskId: result.taskId, remotePath: offlineSavePath, updatedAt: now }).where(eq(downloadTasks.id, task.id)).run();
      return `${task.comicTitle}: 已提交到 OpenList (任务: ${result.taskId})`;
    }
    if (result.status === "duplicate_task") {
      return enqueueOpenListDuplicateOfflineRecovery(task, settings);
    }
    const msg = result.message || "提交到 OpenList 失败";
    markDownloadTaskFinished(task.id, "failed", msg, now);
    return `${task.comicTitle}: ${msg}`;
  }

  if (task.taskType === "offline" && task.provider === "openlist" && task.resourceType === "openlist") {
    const resource = getDownloadProviderResourceSnapshot(task.comicResourceId);
    if (!resource) {
      markDownloadTaskFinished(task.id, "failed", "缺少资源记录。", now);
      return `${task.comicTitle}: 缺少资源记录`;
    }
    const adapter = getDownloadProviderAdapter(task.provider);
    const readiness = adapter ? await adapter.prepare({ task, resource, settings }) : null;
    if (!readiness?.canDispatch || !readiness.details?.remotePath) {
      markDownloadTaskFinished(task.id, "failed", readiness?.reason || "资源准备失败。", now);
      return `${task.comicTitle}: ${readiness?.reason || "资源准备失败"}`;
    }
    const remotePath = String(readiness.details.remotePath);
    const offlineSavePath = resolveOpenListOfflineSavePath(settings);
    const result = await submitOpenListOfflineDownload(remotePath, offlineSavePath, "115 Open");
    if (result.ok) {
      db.update(downloadTasks).set({ status: "submitted", remoteTaskId: result.taskId, remotePath: offlineSavePath, updatedAt: now }).where(eq(downloadTasks.id, task.id)).run();
      return `${task.comicTitle}: 已提交到 OpenList (任务: ${result.taskId})`;
    }
    const msg = result.message || "提交到 OpenList 失败";
    markDownloadTaskFinished(task.id, "failed", msg, now);
    return `${task.comicTitle}: ${msg}`;
  }

  if (task.taskType === "transfer" && task.provider === "openlist") {
    let remotePath = task.remotePath?.trim() || "";
    let remoteName: string | null = remotePath ? remotePath.split("/").filter(Boolean).pop() ?? null : null;
    let sizeBytes: number | null = null;

    // 拉回任务已带具体文件路径；普通 openlist 资源仍走 adapter 探测。
    if (!remotePath) {
      if (task.resourceType !== "openlist") {
        markDownloadTaskFinished(task.id, "failed", "传输任务缺少远程路径。", now);
        return `${task.comicTitle}: 传输任务缺少远程路径`;
      }
      const resource = getDownloadProviderResourceSnapshot(task.comicResourceId);
      if (!resource) {
        markDownloadTaskFinished(task.id, "failed", "缺少资源记录。", now);
        return `${task.comicTitle}: 缺少资源记录`;
      }
      const adapter = getDownloadProviderAdapter(task.provider);
      const readiness = adapter ? await adapter.prepare({ task, resource, settings }) : null;
      if (!readiness?.canDispatch || !readiness.details?.remotePath) {
        markDownloadTaskFinished(task.id, "failed", readiness?.reason || "资源准备失败。", now);
        return `${task.comicTitle}: ${readiness?.reason || "资源准备失败"}`;
      }
      remotePath = String(readiness.details.remotePath);
      remoteName = readiness.details.remoteName ? String(readiness.details.remoteName) : null;
      sizeBytes = typeof readiness.details.sizeBytes === "number" ? readiness.details.sizeBytes : null;
    }

    const prep: DownloadTaskPreparationRecord = {
      id: randomUUID(),
      downloadTaskId: task.id,
      comicResourceId: task.comicResourceId || null,
      provider: task.provider,
      status: "ready",
      remotePath,
      remoteName,
      sizeBytes,
      remoteProvider: null,
      rawUrlAvailable: true,
      errorMessage: null,
      preparedAt: now,
      createdAt: now,
      updatedAt: now,
    };
    db.update(downloadTasks).set({ status: "downloading", updatedAt: now }).where(eq(downloadTasks.id, task.id)).run();
    const transfer = await downloadPreparedOpenListTask(task, prep);
    return transfer.status === "completed" ? `${task.comicTitle}: 已下载` : `${task.comicTitle}: ${transfer.errorMessage ?? "下载失败"}`;
  }

  if (task.taskType === "transfer" && task.provider === "aria2") {
    const uri = task.comicResourceId
      ? db.select({ url: comicResources.resourceUrl }).from(comicResources).where(eq(comicResources.id, task.comicResourceId)).get()?.url ?? ""
      : "";
    if (!uri) {
      markDownloadTaskFinished(task.id, "failed", "缺少资源下载地址。", now);
      return `${task.comicTitle}: 缺少资源下载地址`;
    }
    db.update(downloadTasks).set({ status: "downloading", updatedAt: now }).where(eq(downloadTasks.id, task.id)).run();
    const transfer = await downloadAria2Task(task, uri, settings);
    return transfer.status === "completed" ? `${task.comicTitle}: 已下载` : `${task.comicTitle}: ${transfer.errorMessage ?? "下载失败"}`;
  }

  return null;
}

export async function listDownloadableResources(limit = 100): Promise<DownloadableResourceRecord[]> {
  bootstrapDatabase();

  const activeTaskCountSql = sql<number>`sum(case when ${downloadTasks.status} in ('queued', 'running', 'submitted', 'downloading', 'cancel_requested') then 1 else 0 end)`;
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

  // Known 10008: skip magnet re-submit (OpenList will reject again) and recover from library index.
  if (
    task.taskType === "offline" &&
    task.provider === "openlist" &&
    isRecoverableDuplicateOfflineError(task.errorMessage)
  ) {
    const settings = await getRuntimeSettings();
    await enqueueOpenListDuplicateOfflineRecovery(task, settings);
    const recovered = getDownloadTaskById(id);
    if (!recovered) {
      throw new Error("读取 10008 恢复后的下载任务失败。");
    }
    recordDownloadTaskEvent(recovered, "download_task_retry", {
      previousStatus: task.status,
      status: recovered.status,
    });
    return { task: recovered };
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

  await dispatchTaskNow(id);

  return {
    task: getDownloadTaskById(id) ?? updatedTask,
  };
}

export async function cancelDownloadTask(taskId: string): Promise<UpdateDownloadTaskResult> {
  bootstrapDatabase();

  const id = normalizeRequiredText(taskId, "任务 ID");
  const task = getDownloadTaskById(id);

  if (!task) {
    throw new Error("找不到下载任务。");
  }

  if (task.status !== "queued" && task.status !== "submitted" && task.status !== "downloading" && task.status !== "running") {
    throw new Error("只有排队中或进行中的任务可以取消。");
  }

  const now = new Date().toISOString();
  const isActive = task.status === "submitted" || task.status === "downloading" || task.status === "running";
  const nextStatus: DownloadTaskStatus = isActive ? "cancel_requested" : "canceled";

  getDb()
    .update(downloadTasks)
    .set({
      status: nextStatus,
      updatedAt: now,
    })
    .where(eq(downloadTasks.id, id))
    .run();

  // Cancel active downloads via aria2 RPC when applicable, then clean incomplete targets.
  if (task.status === "downloading" || task.status === "running") {
    try {
      const settings = await getRuntimeSettings();
      if (task.provider === "aria2" || settings.aria2Enabled) {
        await cancelAria2Download(id, settings.aria2RpcUrl?.trim() || undefined, settings.aria2RpcToken?.trim() || undefined);
      }
      const tempDirectory = resolveDownloadTaskTempDirectory(settings, id);
      await cleanupAria2TempDir(tempDirectory);
      const transfer = getDownloadTaskTransferByTaskId(id);
      if (transfer?.tempFilePath) {
        await cleanupIncompleteDownloadPath(transfer.tempFilePath, settings, id);
      }
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

export type OpenDownloadTaskInFileManagerResult =
  | {
      ok: true;
      openedPath: string;
      targetKind: "file" | "directory";
      message: string;
    }
  | {
      ok: false;
      code: "task_not_found" | "path_missing" | "path_not_found" | "open_failed";
      message: string;
    };

/**
 * Open the download task location with the OS default folder handler
 * (not hard-coded to Windows Explorer).
 */
export async function openDownloadTaskInFileManager(taskId: string): Promise<OpenDownloadTaskInFileManagerResult> {
  bootstrapDatabase();
  const id = normalizeRequiredText(taskId, "任务 ID");
  const task = getDownloadTaskById(id);
  if (!task) {
    return { ok: false, code: "task_not_found", message: "找不到下载任务。" };
  }

  const candidatePaths = [
    task.finalization?.finalPath,
    task.transfer?.tempFilePath,
    task.targetDirectory,
  ]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  if (candidatePaths.length === 0) {
    return {
      ok: false,
      code: "path_missing",
      message: "该任务还没有可打开的本地路径（完成后或下载中才会有路径）。",
    };
  }

  let resolvedPath: string | null = null;
  let targetKind: "file" | "directory" = "directory";

  for (const candidate of candidatePaths) {
    try {
      const absolute = path.resolve(candidate);
      const info = await stat(absolute);
      resolvedPath = absolute;
      targetKind = info.isDirectory() ? "directory" : "file";
      break;
    } catch {
      // try next candidate
    }
  }

  if (!resolvedPath) {
    return {
      ok: false,
      code: "path_not_found",
      message: `本地路径不存在：${candidatePaths[0]}`,
    };
  }

  const openPath = targetKind === "file" ? path.dirname(resolvedPath) : resolvedPath;

  try {
    await openPathWithSystemDefault(openPath);
    return {
      ok: true,
      openedPath: openPath,
      targetKind,
      message: `已在资源管理器打开：${openPath}`,
    };
  } catch (error) {
    return {
      ok: false,
      code: "open_failed",
      message: error instanceof Error ? error.message : "打开文件管理器失败。",
    };
  }
}

function openPathWithSystemDefault(targetPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const platform = process.platform;
    let child;

    if (platform === "win32") {
      // `start` uses the shell association for folders (default file manager), not a hard-coded explorer.exe path.
      child = spawn("cmd", ["/c", "start", "", targetPath], {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      });
    } else if (platform === "darwin") {
      child = spawn("open", [targetPath], { detached: true, stdio: "ignore" });
    } else {
      child = spawn("xdg-open", [targetPath], { detached: true, stdio: "ignore" });
    }

    child.on("error", reject);
    child.unref();
    // Do not wait for the file manager process to exit.
    resolve();
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

export function getDownloadTaskById(taskId: string): DownloadTaskRecord | null {
  const row = getDb()
    .select({
      id: downloadTasks.id,
      comicResourceId: downloadTasks.comicResourceId,
      provider: downloadTasks.provider,
      status: downloadTasks.status,
      taskType: downloadTasks.taskType,
      offlineTaskId: downloadTasks.offlineTaskId,
      remoteTaskId: downloadTasks.remoteTaskId,
      remotePath: downloadTasks.remotePath,
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
      resourceUrl: comicResources.resourceUrl,
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
    resourceUrl: row.resourceUrl ?? null,
    sourceSite: row.sourceSite,
    provider: normalizeProvider(row.provider),
    taskType: normalizeDownloadTaskType(row.taskType ?? "transfer"),
    status: normalizeDownloadTaskStatus(row.status),
    offlineTaskId: row.offlineTaskId ?? null,
    remoteTaskId: row.remoteTaskId ?? null,
    remotePath: row.remotePath ?? null,
    targetDirectory: row.targetDirectory,
    errorMessage: row.errorMessage,
    retryCount: Number(row.retryCount ?? 0),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };

  const withParts = {
    ...task,
    finalization: getDownloadTaskFinalizationByTaskId(task.id),
    preparation: getDownloadTaskPreparationByTaskId(task.id),
    transfer: getDownloadTaskTransferByTaskId(task.id),
  };
  return attachImportedComicIds([withParts])[0] ?? withParts;
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

    // Use aria2 if configured, fall back to fetch.
    // aria2 writes directly into the import root so completed paths stay valid in aria2 logs.
    const aria2RpcUrl = settings.aria2RpcUrl?.trim();
    if (aria2RpcUrl && settings.aria2Enabled) {
      const placement = await resolveAria2DirectPlacement(task, fileName);
      await mkdir(placement.dir, { recursive: true });
      const result = await downloadWithAria2({
        rpcUrl: aria2RpcUrl,
        rpcToken: settings.aria2RpcToken?.trim() || undefined,
        uri: downloadUrl,
        dir: placement.dir,
        out: placement.out ?? fileName,
        taskId: task.id,
        // 115 等存储依赖 link 返回的 User-Agent/Referer；多连接 Range 也易 403。
        headers: link.headers,
        singleConnection: true,
      });

      if (!result.success) {
        await cleanupAria2DirectPlacement(placement).catch(() => undefined);
        throw new Error(`aria2 下载失败：${result.errorMessage}`);
      }

      if (!result.files || result.files.length === 0) {
        await cleanupAria2DirectPlacement(placement).catch(() => undefined);
        throw new Error("aria2 下载完成后未返回文件路径。");
      }

      const aria2FilePath = path.resolve(result.files[0]);
      const fileStat = await stat(aria2FilePath);
      const finishedAt = new Date().toISOString();
      transfer = upsertDownloadTaskTransfer({
        bytesWritten: fileStat.size,
        comicResourceId: task.comicResourceId || null,
        contentType: null,
        downloadTaskId: task.id,
        errorMessage: null,
        fileName: path.basename(aria2FilePath) || fileName,
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
      headers: Object.keys(link.headers).length > 0 ? link.headers : undefined,
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
  const placement = await resolveAria2DirectPlacement(task);
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
    tempFilePath: placement.expectedPath,
  });

  try {
    await mkdir(placement.dir, { recursive: true });

    const result = await downloadWithAria2({
      rpcUrl,
      rpcToken: settings.aria2RpcToken?.trim() || undefined,
      uri,
      dir: placement.dir,
      out: placement.out,
      taskId: task.id,
    });

    if (!result.success) {
      throw new Error(`aria2 下载失败：${result.errorMessage}`);
    }

    if (!result.files || result.files.length === 0) {
      throw new Error("aria2 下载完成后未返回文件路径。");
    }

    const aria2FilePath = path.resolve(result.files[0]);
    const fileName = sanitizeDownloadFileName(path.basename(aria2FilePath) || task.resourceLabel);

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

    // Transfer completed; finalization scans without moving the file.
    markDownloadTaskFinished(task.id, "completed", null, finishedAt);
    return transfer;
  } catch (error) {
    await cleanupAria2DirectPlacement(placement).catch(() => undefined);
    const currentTask = getDownloadTaskById(task.id);
    if (currentTask && (currentTask.status === "cancel_requested" || currentTask.status === "canceled")) {
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
      status: "downloading",
      updatedAt,
    })
    .where(eq(downloadTasks.id, taskId))
    .run();
}


function resolveOpenListOfflineSavePath(settings: RuntimeSettings): string {
  const configured = settings.openlistOfflineSavePath?.trim();
  if (configured) {
    return normalizeOpenListLocateRoot(configured);
  }
  return "/115Open/Temp";
}

function resolveOpenListLibraryScanRoot(settings?: RuntimeSettings | null): string {
  const configured = settings?.openlistLibraryScanRoot?.trim();
  if (configured) {
    return normalizeOpenListLocateRoot(configured);
  }
  return normalizeOpenListLocateRoot(DEFAULT_OPENLIST_DUPLICATE_SEARCH_ROOT);
}

async function enqueueOpenListDuplicateOfflineRecovery(
  task: DownloadTaskRecord,
  settings: RuntimeSettings,
): Promise<string> {
  const now = new Date().toISOString();
  const searchRoot = resolveOpenListLibraryScanRoot(settings);
  const ttlMinutes = DEFAULT_OPENLIST_LIBRARY_INDEX_TTL_MINUTES;

  if (!settings.openlistEnabled || !settings.openlistBaseUrl.trim()) {
    const msg =
      buildIndexNotFoundMessage(searchRoot, { comicName: task.comicTitle }) +
      "（OpenList 未正确配置，无法建立云端库索引。）";
    markDownloadTaskFinished(task.id, "failed", msg, now);
    return `${task.comicTitle}: ${msg}`;
  }

  if (task.comicResourceId) {
    const existingTransfer = getDb()
      .select({ id: downloadTasks.id })
      .from(downloadTasks)
      .where(
        and(
          eq(downloadTasks.comicResourceId, task.comicResourceId),
          eq(downloadTasks.taskType, "transfer"),
          inArray(downloadTasks.status, ACTIVE_TASK_STATUSES),
        ),
      )
      .get();
    if (existingTransfer) {
      markDownloadTaskFinished(task.id, "completed", null, now);
      getDb()
        .update(downloadTasks)
        .set({ remotePath: searchRoot, updatedAt: now, errorMessage: null })
        .where(eq(downloadTasks.id, task.id))
        .run();
      return `${task.comicTitle}: OpenList 任务已存在，已有进行中的传输任务`;
    }
  }

  const pendingMessage = buildPendingDuplicateRecoveryMessage(searchRoot);
  markDownloadTaskFinished(task.id, "failed", pendingMessage, now);

  let listSettings = settings;
  if (!listSettings.openlistToken.trim()) {
    const ensured = await ensureOpenListToken(listSettings, { forceRefresh: true });
    if (!ensured.ok) {
      const msg =
        buildIndexNotFoundMessage(searchRoot, { comicName: task.comicTitle }) + `（${ensured.message}）`;
      markDownloadTaskFinished(task.id, "failed", msg, now);
      return `${task.comicTitle}: ${msg}`;
    }
    listSettings = ensured.settings;
  }

  const listDirectory = createOpenListLocateListDirectory(listSettings);

  const completed = getLatestCompletedIndexSession(searchRoot);
  if (completed && isIndexSessionFresh(completed, ttlMinutes)) {
    const batch = await batchRecoverPendingDuplicateTasks(searchRoot, completed.id);
    if (batch.messages.length > 0) {
      return batch.messages.find((m) => m.includes(task.comicTitle)) ?? `${task.comicTitle}: ${batch.messages[0]}`;
    }
    return `${task.comicTitle}: ${pendingMessage}`;
  }

  startOpenListLibraryIndexInBackground({
    root: searchRoot,
    listDirectory,
    ttlMinutes,
    onComplete: async (session) => {
      if (session.status === "completed") {
        await batchRecoverPendingDuplicateTasks(searchRoot, session.id);
      }
    },
  });

  return `${task.comicTitle}: ${pendingMessage}`;
}

function createOpenListLocateListDirectory(settings: RuntimeSettings) {
  return async (remotePath: string, options: { page: number; perPage: number; refresh: boolean }) => {
    const listed = await listOpenListDirectory(remotePath, {
      page: options.page,
      perPage: options.perPage,
      refresh: options.refresh,
      settings,
    });
    if (!listed.ok || !listed.directory) {
      return {
        ok: false as const,
        entries: [],
        hasMore: false,
        message: listed.message,
      };
    }
    return {
      ok: true as const,
      entries: listed.directory.entries.map((entry) => ({
        name: entry.name,
        isDirectory: entry.isDirectory,
        sizeBytes: entry.sizeBytes,
      })),
      hasMore: Boolean(listed.directory.hasMore),
    };
  };
}

export function listPendingDuplicateRecoveryTasks(): DownloadTaskRecord[] {
  bootstrapDatabase();
  const rows = getDb()
    .select()
    .from(downloadTasks)
    .where(and(eq(downloadTasks.taskType, "offline"), eq(downloadTasks.provider, "openlist"), eq(downloadTasks.status, "failed")))
    .all();

  return rows
    .filter((row) => isRecoverableDuplicateOfflineError(row.errorMessage))
    .map((row) => getDownloadTaskById(row.id))
    .filter((task): task is DownloadTaskRecord => Boolean(task));
}

/** Failed offline tasks that should re-match after a forced library index rescan. */
export function listLibraryIndexRematchTasks(): DownloadTaskRecord[] {
  bootstrapDatabase();
  const rows = getDb()
    .select()
    .from(downloadTasks)
    .where(and(eq(downloadTasks.taskType, "offline"), eq(downloadTasks.provider, "openlist"), eq(downloadTasks.status, "failed")))
    .all();

  return rows
    .filter((row) => isLibraryIndexRematchCandidateError(row.errorMessage))
    .map((row) => getDownloadTaskById(row.id))
    .filter((task): task is DownloadTaskRecord => Boolean(task));
}

export async function batchRecoverPendingDuplicateTasks(
  root?: string,
  sessionId?: string,
  options?: { includeIndexMisses?: boolean },
): Promise<{ recovered: number; ambiguous: number; notFound: number; messages: string[] }> {
  bootstrapDatabase();
  const settings = await getRuntimeSettings();
  const searchRoot = normalizeOpenListLocateRoot(root ?? resolveOpenListLibraryScanRoot(settings));
  const resolvedSessionId = sessionId ?? getLatestCompletedIndexSession(searchRoot)?.id;
  if (!resolvedSessionId) {
    return { recovered: 0, ambiguous: 0, notFound: 0, messages: [] };
  }

  const pending = options?.includeIndexMisses
    ? listLibraryIndexRematchTasks()
    : listPendingDuplicateRecoveryTasks();
  let recovered = 0;
  let ambiguous = 0;
  let notFound = 0;
  const messages: string[] = [];

  for (const task of pending) {
    const result = await recoverOnePendingDuplicateTask(task, searchRoot, resolvedSessionId);
    messages.push(result.message);
    if (result.kind === "recovered") recovered += 1;
    else if (result.kind === "ambiguous") ambiguous += 1;
    else notFound += 1;
  }

  return { recovered, ambiguous, notFound, messages };
}

/**
 * Manual force rescan of OpenList library root (bypasses TTL), then rematch
 * pending 10008 + previous index_not_found / index_ambiguous offline tasks.
 */
export async function rescanOpenListLibraryIndexAndRecover(
  root?: string,
): Promise<{
  ok: boolean;
  started: boolean;
  joined: boolean;
  sessionId: string | null;
  sessionStatus: "running" | "completed" | "failed" | null;
  recovered: number;
  ambiguous: number;
  notFound: number;
  candidateCount: number;
  message: string;
  messages: string[];
}> {
  bootstrapDatabase();
  let settings = await getRuntimeSettings();
  const searchRoot = normalizeOpenListLocateRoot(root ?? resolveOpenListLibraryScanRoot(settings));

  if (!settings.openlistEnabled || !settings.openlistBaseUrl.trim()) {
    return {
      ok: false,
      started: false,
      joined: false,
      sessionId: null,
      sessionStatus: null,
      recovered: 0,
      ambiguous: 0,
      notFound: 0,
      candidateCount: 0,
      message: "OpenList 未启用或未配置地址，无法扫描云端库。",
      messages: [],
    };
  }
  if (!settings.openlistToken.trim()) {
    const ensured = await ensureOpenListToken(settings, { forceRefresh: true });
    if (!ensured.ok) {
      return {
        ok: false,
        started: false,
        joined: false,
        sessionId: null,
        sessionStatus: null,
        recovered: 0,
        ambiguous: 0,
        notFound: 0,
        candidateCount: 0,
        message: ensured.message || "OpenList token 无效。",
        messages: [],
      };
    }
    settings = ensured.settings;
  }

  const candidates = listLibraryIndexRematchTasks();
  const now = new Date().toISOString();
  for (const task of candidates) {
    // Re-queue as pending so batch recover picks them up even after prior index_not_found.
    markDownloadTaskFinished(task.id, "failed", buildPendingDuplicateRecoveryMessage(searchRoot), now);
  }

  const listDirectory = createOpenListLocateListDirectory(settings);
  const ensure = await ensureOpenListLibraryIndex({
    root: searchRoot,
    listDirectory,
    force: true,
  });

  if (ensure.status !== "completed") {
    return {
      ok: false,
      started: ensure.started,
      joined: ensure.joined,
      sessionId: ensure.sessionId,
      sessionStatus: ensure.status,
      recovered: 0,
      ambiguous: 0,
      notFound: 0,
      candidateCount: candidates.length,
      message:
        ensure.status === "running"
          ? `云端库扫描进行中（session ${ensure.sessionId}），请稍后再试或等待完成。`
          : `云端库扫描失败（session ${ensure.sessionId}）。`,
      messages: [],
    };
  }

  const batch = await batchRecoverPendingDuplicateTasks(searchRoot, ensure.sessionId, {
    includeIndexMisses: true,
  });
  const summary =
    `已强制重扫 ${searchRoot}。候选 ${candidates.length}，` +
    `恢复 ${batch.recovered}，多匹配 ${batch.ambiguous}，未找到 ${batch.notFound}。`;

  return {
    ok: true,
    started: ensure.started,
    joined: ensure.joined,
    sessionId: ensure.sessionId,
    sessionStatus: ensure.status,
    recovered: batch.recovered,
    ambiguous: batch.ambiguous,
    notFound: batch.notFound,
    candidateCount: candidates.length,
    message: summary,
    messages: batch.messages,
  };
}

async function recoverOnePendingDuplicateTask(
  task: DownloadTaskRecord,
  searchRoot: string,
  sessionId: string,
): Promise<{ kind: "recovered" | "ambiguous" | "not_found"; message: string }> {
  const now = new Date().toISOString();

  if (task.comicResourceId) {
    const existingTransfer = getDb()
      .select({ id: downloadTasks.id })
      .from(downloadTasks)
      .where(
        and(
          eq(downloadTasks.comicResourceId, task.comicResourceId),
          eq(downloadTasks.taskType, "transfer"),
          inArray(downloadTasks.status, ACTIVE_TASK_STATUSES),
        ),
      )
      .get();
    if (existingTransfer) {
      markDownloadTaskFinished(task.id, "completed", null, now);
      getDb()
        .update(downloadTasks)
        .set({ remotePath: searchRoot, updatedAt: now, errorMessage: null })
        .where(eq(downloadTasks.id, task.id))
        .run();
      return { kind: "recovered", message: `${task.comicTitle}: 已有进行中的传输任务` };
    }
  }

  const resourceLabel = getComicResourceDisplayLabel(task.comicResourceId);
  const hints = [task.comicTitle, resourceLabel, task.resourceLabel].filter((value): value is string => Boolean(value && value.trim()));
  const match = matchTaskHintsAgainstIndex({
    root: searchRoot,
    sessionId,
    hints,
    comicName: task.comicTitle,
  });

  if (match.status === "found") {
    const created = createTransferTaskFromResolvedRemoteFile(task, {
      remotePath: match.remotePath,
      fileName: match.fileName,
      sizeBytes: match.sizeBytes,
    });
    if (!created.ok) {
      markDownloadTaskFinished(task.id, "failed", created.message, now);
      return { kind: "not_found", message: `${task.comicTitle}: ${created.message}` };
    }

    markDownloadTaskFinished(task.id, "completed", null, now);
    getDb()
      .update(downloadTasks)
      .set({
        remotePath: match.remotePath,
        errorMessage: null,
        updatedAt: now,
      })
      .where(eq(downloadTasks.id, task.id))
      .run();

    await dispatchTaskNow(created.task.id);
    const msg = buildIndexRecoveredMessage(match.fileName);
    return { kind: "recovered", message: `${task.comicTitle}: ${msg}` };
  }

  if (match.status === "ambiguous") {
    const msg = buildIndexAmbiguousMessage(
      searchRoot,
      match.candidates.map((c) => c.remotePath),
      { comicName: task.comicTitle },
    );
    markDownloadTaskFinished(task.id, "failed", msg, now);
    return { kind: "ambiguous", message: `${task.comicTitle}: ${msg}` };
  }

  const msg =
    match.message ||
    buildIndexNotFoundMessage(searchRoot, { comicName: task.comicTitle, hints });
  markDownloadTaskFinished(task.id, "failed", msg, now);
  return { kind: "not_found", message: `${task.comicTitle}: ${msg}` };
}

async function drainPendingOpenListDuplicateRecoveries(): Promise<string[]> {
  let settings = await getRuntimeSettings();
  const searchRoot = resolveOpenListLibraryScanRoot(settings);
  const pending = listPendingDuplicateRecoveryTasks();
  if (pending.length === 0) return [];

  const completed = getLatestCompletedIndexSession(searchRoot);
  if (completed && isIndexSessionFresh(completed, DEFAULT_OPENLIST_LIBRARY_INDEX_TTL_MINUTES)) {
    const batch = await batchRecoverPendingDuplicateTasks(searchRoot, completed.id);
    return batch.messages;
  }

  // Promote raw 10008 failures into recovery + start/join background index scan.
  if (!settings.openlistEnabled || !settings.openlistBaseUrl.trim()) {
    return [];
  }
  if (!settings.openlistToken.trim()) {
    const ensured = await ensureOpenListToken(settings, { forceRefresh: true });
    if (!ensured.ok) return [];
    settings = ensured.settings;
  }

  const listDirectory = createOpenListLocateListDirectory(settings);
  for (const task of pending) {
    if (!isPendingDuplicateRecoveryError(task.errorMessage)) {
      const pendingMessage = buildPendingDuplicateRecoveryMessage(searchRoot);
      markDownloadTaskFinished(task.id, "failed", pendingMessage, new Date().toISOString());
    }
  }

  startOpenListLibraryIndexInBackground({
    root: searchRoot,
    listDirectory,
    ttlMinutes: DEFAULT_OPENLIST_LIBRARY_INDEX_TTL_MINUTES,
    onComplete: async (session) => {
      if (session.status === "completed") {
        await batchRecoverPendingDuplicateTasks(searchRoot, session.id);
      }
    },
  });

  return pending.map((task) => `${task.comicTitle}: 已加入云端库恢复队列`);
}

export function createTransferTaskFromResolvedRemoteFile(
  offlineTask: DownloadTaskRecord,
  file: { remotePath: string; fileName: string; sizeBytes: number | null },
): { ok: true; task: DownloadTaskRecord } | { ok: false; message: string } {
  if (!offlineTask.comicResourceId) {
    return { ok: false, message: "离线任务缺少资源记录，无法创建传输任务。" };
  }

  const existing = getDb()
    .select({ id: downloadTasks.id })
    .from(downloadTasks)
    .where(
      and(
        eq(downloadTasks.comicResourceId, offlineTask.comicResourceId),
        eq(downloadTasks.taskType, "transfer"),
        inArray(downloadTasks.status, ACTIVE_TASK_STATUSES),
      ),
    )
    .get();
  if (existing) {
    const task = getDownloadTaskById(existing.id);
    if (task) return { ok: true, task };
  }

  const transferTaskId = randomUUID();
  const now = new Date().toISOString();
  getDb()
    .insert(downloadTasks)
    .values({
      id: transferTaskId,
      comicResourceId: offlineTask.comicResourceId,
      provider: "openlist",
      taskType: "transfer",
      offlineTaskId: offlineTask.id,
      remotePath: file.remotePath,
      status: "queued",
      targetDirectory: offlineTask.targetDirectory,
      updatedAt: now,
    })
    .run();

  const transferTask = getDownloadTaskById(transferTaskId);
  if (!transferTask) {
    return { ok: false, message: "传输任务写入数据库后读取失败。" };
  }

  recordDownloadTaskEvent(transferTask, "download_task_create", {
    status: transferTask.status,
  });

  return { ok: true, task: transferTask };
}

/** Test helper: wait for background library index scans and drain recovery. */
export async function flushOpenListDuplicateRecoveryForTests(timeoutMs = 10_000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const pending = listPendingDuplicateRecoveryTasks();
    if (pending.length === 0) return;
    await drainPendingOpenListDuplicateRecoveries();
    // Give background scan a beat.
    await new Promise((resolve) => setTimeout(resolve, 30));
    const still = listPendingDuplicateRecoveryTasks();
    if (still.length === 0) return;
    const settings = await getRuntimeSettings();
    const root = resolveOpenListLibraryScanRoot(settings);
    const completed = getLatestCompletedIndexSession(root);
    if (completed) {
      await batchRecoverPendingDuplicateTasks(root, completed.id);
      return;
    }
  }
}

export { __resetOpenListLibraryIndexInFlightForTests };

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
      throw new Error("下载文件路径缺失。");
    }

    const settings = await getRuntimeSettings();
    const tempDirectory = resolveDownloadTaskTempDirectory(settings, task.id);
    const downloadedPath = path.resolve(transfer.tempFilePath);
    await stat(downloadedPath);

    const importRoot = await resolveDownloadImportRoot(task);
    let finalPath: string;

    if (isPathInsideParent(tempDirectory, downloadedPath)) {
      // Legacy stream downloads still land in cache temp and must be moved into the import root.
      finalPath = await resolveUniqueFinalDownloadPath(importRoot.absolutePath, task, transfer);
      assertPathInside(importRoot.absolutePath, finalPath);
      await mkdir(path.dirname(finalPath), { recursive: true });
      await moveFileAcrossDevices(downloadedPath, finalPath);
    } else if (isPathInsideParent(importRoot.absolutePath, downloadedPath)) {
      // aria2 direct-to-library: keep the path aria2 wrote so its log remains valid.
      finalPath = downloadedPath;
    } else {
      throw new Error("下载完成路径不在缓存临时目录或入库目录内，拒绝入库。");
    }

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
  const withFinalization = tasks.map((task) => ({
    ...task,
    finalization: finalizationsByTaskId.get(task.id) ?? null,
  }));

  return attachImportedComicIds(withFinalization);
}

function attachImportedComicIds(tasks: DownloadTaskRecord[]): DownloadTaskRecord[] {
  const paths = tasks
    .map((task) => task.finalization?.finalPath?.trim())
    .filter((value): value is string => Boolean(value));

  if (paths.length === 0) {
    return tasks.map((task) => ({ ...task, importedComicId: task.importedComicId ?? null }));
  }

  const uniquePaths = [...new Set(paths.map((value) => path.resolve(value)))];
  const rows = getDb()
    .select({
      absolutePath: localFiles.absolutePath,
      comicId: localFiles.comicId,
    })
    .from(localFiles)
    .where(inArray(localFiles.absolutePath, uniquePaths))
    .all();

  const comicIdByPath = new Map<string, string>();
  for (const row of rows) {
    if (row.comicId) {
      // Store both raw and resolved keys so Windows path forms still match.
      comicIdByPath.set(row.absolutePath, row.comicId);
      comicIdByPath.set(path.resolve(row.absolutePath), row.comicId);
    }
  }

  return tasks.map((task) => {
    const finalPath = task.finalization?.finalPath?.trim();
    if (!finalPath) {
      return { ...task, importedComicId: null };
    }
    const importedComicId =
      comicIdByPath.get(finalPath) ?? comicIdByPath.get(path.resolve(finalPath)) ?? null;
    return { ...task, importedComicId };
  });
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
      const candidateRoots = enabledRoots.filter((root) => path.basename(root.absolutePath) !== DOWNLOAD_IMPORT_DIRECTORY_NAME);
      // Prefer user manga roots for downloads so the system default library is not polluted by default.
      const baseRoot =
        candidateRoots.find((root) => root.kind === "user") ??
        candidateRoots.find((root) => root.kind === "system") ??
        candidateRoots[0] ??
        enabledRoots[0];

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
    downloading: "下载中",
    failed: "失败",
    queued: "排队中",
    running: "运行中",
    submitted: "处理中",
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

function sanitizeDownloadName(value: string) {
  return sanitizeDownloadFileName(value).replace(/\.+/g, ".");
}

const VIDEO_FILE_EXTENSIONS = new Set(["mp4", "mkv", "avi", "mov", "webm", "m4v", "ts"]);

export function buildVideoDownloadFileName(title: string, resourceUrl: string) {
  const safeTitle = sanitizeDownloadFileName(title);
  const titleExtension = path.extname(safeTitle).slice(1).toLowerCase();
  if (VIDEO_FILE_EXTENSIONS.has(titleExtension)) return safeTitle;

  let resourceExtension = "mp4";
  try {
    const urlExtension = path.extname(new URL(resourceUrl).pathname).slice(1).toLowerCase();
    if (VIDEO_FILE_EXTENSIONS.has(urlExtension)) resourceExtension = urlExtension;
  } catch {
    // Use mp4 when the resource URL has no usable video extension.
  }

  return `${safeTitle}.${resourceExtension}`;
}

function redactDownloadResource(value: string) {
  if (value.startsWith("magnet:")) return value.replace(/([?&](?:xt|dn|tr))=[^&]*/gi, "$1=…");
  try {
    const url = new URL(value);
    for (const key of ["token", "sign", "signature", "expires"]) url.searchParams.delete(key);
    return url.toString();
  } catch {
    return "资源已脱敏";
  }
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

function normalizeDownloadTaskType(value: unknown): DownloadTaskType {
  if (isDownloadTaskType(value)) {
    return value;
  }

  throw new Error("下载任务类型无效。");
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

function isDownloadTaskType(value: unknown): value is DownloadTaskType {
  return DOWNLOAD_TASK_TYPES.includes(value as DownloadTaskType);
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


interface Aria2DirectPlacement {
  importRootPath: string;
  dir: string;
  out: string | undefined;
  expectedPath: string;
  mode: "single_file" | "directory";
}

function isPathInsideParent(parentPath: string, childPath: string) {
  const relativePath = path.relative(path.resolve(parentPath), path.resolve(childPath));
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

async function resolveUniqueDirectory(candidatePath: string) {
  let currentPath = candidatePath;
  for (let index = 1; await pathExists(currentPath); index += 1) {
    currentPath = `${candidatePath} (${index})`;
  }
  return currentPath;
}

async function resolveAria2DirectPlacement(task: DownloadTaskRecord, preferredFileName?: string): Promise<Aria2DirectPlacement> {
  const importRoot = await resolveDownloadImportRoot(task);
  const title = sanitizeDownloadFileName(task.comicTitle || task.resourceLabel || "download");
  const preferred = preferredFileName ? sanitizeDownloadFileName(preferredFileName) : "";
  const extension = path.extname(preferred).toLowerCase();

  if (preferred && (extension === ".zip" || extension === ".cbz" || extension === ".rar" || extension === ".cbr" || extension === ".pdf" || extension === ".epub")) {
    const archiveCandidate =
      extension === ".zip" || extension === ".cbz"
        ? path.join(importRoot.absolutePath, `${title}${extension}`)
        : path.join(importRoot.absolutePath, preferred);
    const finalPath = await resolveUniquePath(archiveCandidate);
    return {
      importRootPath: importRoot.absolutePath,
      dir: path.dirname(finalPath),
      out: path.basename(finalPath),
      expectedPath: finalPath,
      mode: "single_file",
    };
  }

  const dir = await resolveUniqueDirectory(path.join(importRoot.absolutePath, title));
  return {
    importRootPath: importRoot.absolutePath,
    dir,
    out: preferred || undefined,
    expectedPath: dir,
    mode: "directory",
  };
}

async function cleanupAria2DirectPlacement(placement: Aria2DirectPlacement) {
  if (placement.mode === "single_file") {
    await rm(placement.expectedPath, { force: true }).catch(() => undefined);
    await rm(`${placement.expectedPath}.aria2`, { force: true }).catch(() => undefined);
    return;
  }

  await rm(placement.dir, { recursive: true, force: true }).catch(() => undefined);
}

async function cleanupIncompleteDownloadPath(downloadPath: string, settings: RuntimeSettings, taskId: string) {
  const resolved = path.resolve(downloadPath);
  const tempDirectory = resolveDownloadTaskTempDirectory(settings, taskId);
  if (isPathInsideParent(tempDirectory, resolved)) {
    await cleanupAria2TempDir(tempDirectory);
    return;
  }

  const statResult = await stat(resolved).catch(() => null);
  if (!statResult) {
    await rm(`${resolved}.aria2`, { force: true }).catch(() => undefined);
    return;
  }

  if (statResult.isDirectory()) {
    await rm(resolved, { recursive: true, force: true }).catch(() => undefined);
    return;
  }

  await rm(resolved, { force: true }).catch(() => undefined);
  await rm(`${resolved}.aria2`, { force: true }).catch(() => undefined);
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
  const submittedTasks = db.select({
    id: downloadTasks.id,
    remoteTaskId: downloadTasks.remoteTaskId,
    remotePath: downloadTasks.remotePath,
    retryCount: downloadTasks.retryCount,
  }).from(downloadTasks)
    .where(and(
      eq(downloadTasks.status, "submitted"),
      eq(downloadTasks.taskType, "offline"),
      eq(downloadTasks.provider, "openlist"),
    )).all();
  if (submittedTasks.length === 0) return [];

  let settings = await getRuntimeSettings();
  if (!settings.openlistEnabled || !settings.openlistBaseUrl.trim()) return [];
  if (!settings.openlistToken.trim()) {
    const ensured = await ensureOpenListToken(settings, { forceRefresh: true });
    if (!ensured.ok) return [];
    settings = ensured.settings;
  }
  if (!settings.openlistBaseUrl.replace(/\/+$/, "")) return [];

  // listOpenListOfflineTasks 内部会在 401/403 时自动登录刷新 token
  const olTasks: Array<{ id: string; name: string; state: number; error: string }> = [
    ...(await listOpenListOfflineTasks("undone", { settings })),
    ...(await listOpenListOfflineTasks("done", { settings })),
  ];

  const results: string[] = [];

  for (const task of submittedTasks) {
    if (!task.remotePath) continue;

    const matchedOlTask = task.remoteTaskId ? olTasks.find((t) => t.id === task.remoteTaskId) : null;

    if (matchedOlTask) {
      if (matchedOlTask.state === 2) {
        const fullTask = getDownloadTaskById(task.id);
        if (!fullTask) continue;
        markDownloadTaskFinished(task.id, "completed", null, now);
        const created = await createTransferTaskFromOfflineTask(fullTask);
        if (created.ok) {
          results.push(`${fullTask.comicTitle}: OpenList 完成，已创建传输任务`);
        } else {
          results.push(
            `${fullTask.comicTitle}: OpenList 完成（未能自动创建传输任务：${created.message}）`,
          );
        }
        continue;
      }
      if (matchedOlTask.state === 3 || matchedOlTask.state === 7 || matchedOlTask.error) {
        const errMsg = matchedOlTask.error || "OpenList 下载失败";
        // OpenList may surface 10008 on the offline task error after a "successful" submit.
        if (isOpenListDuplicateOfflineError({ code: null, message: errMsg })) {
          const fullTask = getDownloadTaskById(task.id);
          if (fullTask) {
            const settings = await getRuntimeSettings();
            const msg = await enqueueOpenListDuplicateOfflineRecovery(fullTask, settings);
            results.push(msg);
            continue;
          }
        }
        markDownloadTaskFinished(task.id, "failed", errMsg, now);
        results.push(`${errMsg}`);
        continue;
      }
      db.update(downloadTasks).set({ retryCount: (task.retryCount ?? 0) + 1, updatedAt: now }).where(eq(downloadTasks.id, task.id)).run();
      continue;
    }

    if ((task.retryCount ?? 0) >= MAX_POLL_RETRIES) {
      markDownloadTaskFinished(task.id, "failed", "OpenList 下载超时", now);
      results.push(`轮询超时，已标记为失败`);
    } else {
      db.update(downloadTasks).set({ retryCount: (task.retryCount ?? 0) + 1, updatedAt: now }).where(eq(downloadTasks.id, task.id)).run();
    }
  }

  return results;
}

export async function createTransferTaskFromOfflineTask(
  offlineTask: DownloadTaskRecord,
): Promise<CreateTransferFromOfflineResult> {
  bootstrapDatabase();

  const comicTitle = offlineTask.comicTitle;
  const settingsForPath = await getRuntimeSettings();
  const remotePath = offlineTask.remotePath ?? resolveOpenListOfflineSavePath(settingsForPath);
  const resourceLabel = getComicResourceDisplayLabel(offlineTask.comicResourceId);

  if (offlineTask.taskType !== "offline") {
    return failCreateTransfer(offlineTask, "not_offline_task", "只能对离线任务创建传输任务。", {
      remotePath,
      comicTitle,
    });
  }

  let settings = await getRuntimeSettings();
  if (!settings.openlistEnabled) {
    return failCreateTransfer(offlineTask, "openlist_disabled", "OpenList 未启用，请先在设置中开启。", {
      remotePath,
      comicTitle,
    });
  }
  if (!settings.openlistBaseUrl.trim()) {
    return failCreateTransfer(offlineTask, "openlist_base_url_missing", "OpenList 地址未配置。", {
      remotePath,
      comicTitle,
    });
  }
  if (!settings.openlistToken.trim()) {
    const ensured = await ensureOpenListToken(settings, { forceRefresh: true });
    if (!ensured.ok) {
      return failCreateTransfer(offlineTask, "openlist_token_missing", ensured.message, {
        remotePath,
        comicTitle,
      });
    }
    settings = ensured.settings;
  }

  const baseUrl = settings.openlistBaseUrl.replace(/\/+$/, "");
  let token = settings.openlistToken.trim();
  // 115 离线下载常把结果落在 savePath 下的同名文件夹里，而不是直接文件；需递归一层查找。
  let listResult = await listOpenListRemoteFilesForPullBack(baseUrl, token, remotePath, {
    matchHints: [comicTitle, resourceLabel, offlineTask.resourceLabel].filter(Boolean) as string[],
  });

  // 列目录认证失败时尝试自动登录并重试一次
  if (
    !listResult.ok &&
    (listResult.httpStatus === 401 ||
      listResult.httpStatus === 403 ||
      listResult.openlistCode === 401 ||
      listResult.openlistCode === 403)
  ) {
    const ensured = await ensureOpenListToken(settings, { forceRefresh: true });
    if (ensured.ok) {
      settings = ensured.settings;
      token = settings.openlistToken.trim();
      listResult = await listOpenListRemoteFilesForPullBack(baseUrl, token, remotePath, {
        matchHints: [comicTitle, resourceLabel, offlineTask.resourceLabel].filter(Boolean) as string[],
      });
    }
  }

  if (!listResult.ok) {
    return failCreateTransfer(offlineTask, listResult.code, listResult.message, {
      remotePath,
      comicTitle,
      openlistCode: listResult.openlistCode,
      httpStatus: listResult.httpStatus,
      errorName: listResult.errorName,
      errorMessage: listResult.errorMessage,
      dirCount: listResult.dirCount,
      fileCount: listResult.fileCount,
    });
  }

  const files = listResult.files;
  if (files.length === 0) {
    const dirHint = listResult.dirCount > 0
      ? `根目录有 ${listResult.dirCount} 个子目录，但一层内未找到可用文件。`
      : "根目录没有任何文件或子目录。";
    return failCreateTransfer(
      offlineTask,
      "remote_list_empty",
      `远程目录无可拉回文件：${remotePath}。${dirHint}`,
      {
        remotePath,
        comicTitle,
        fileCount: 0,
        dirCount: listResult.dirCount,
        openlistCode: 200,
        httpStatus: listResult.httpStatus,
      },
    );
  }

  const remoteFile = pickRemoteFileForPullBack(files, {
    comicTitle,
    resourceLabel,
    resourceDisplayLabel: offlineTask.resourceLabel,
  });

  if (!remoteFile) {
    return failCreateTransfer(
      offlineTask,
      "remote_list_empty",
      `远程目录没有可用文件：${remotePath}。`,
      {
        remotePath,
        comicTitle,
        fileCount: files.length,
        dirCount: listResult.dirCount,
        openlistCode: 200,
        httpStatus: listResult.httpStatus,
      },
    );
  }

  const transferTaskId = randomUUID();
  const now = new Date().toISOString();
  const remoteFilePath = remoteFile.path;
  const db = getDb();

  db.insert(downloadTasks)
    .values({
      id: transferTaskId,
      comicResourceId: offlineTask.comicResourceId,
      provider: "openlist",
      taskType: "transfer",
      offlineTaskId: offlineTask.id,
      remotePath: remoteFilePath,
      status: "queued",
      targetDirectory: offlineTask.targetDirectory,
      updatedAt: now,
    })
    .run();

  const transferTask = getDownloadTaskById(transferTaskId);
  if (!transferTask) {
    return failCreateTransfer(offlineTask, "task_create_failed", "传输任务写入数据库后读取失败。", {
      remotePath: remoteFilePath,
      comicTitle,
      fileCount: files.length,
      dirCount: listResult.dirCount,
    });
  }

  const success: CreateTransferFromOfflineResult = {
    ok: true,
    task: transferTask,
    message: remoteFile.matchedBy === "largest_file"
      ? `标题未精确匹配，已按最大文件创建传输任务：${remoteFile.name}`
      : `已创建传输任务：${remoteFile.name}`,
    details: {
      remotePath,
      remoteFilePath,
      fileName: remoteFile.name,
      fileSize: remoteFile.size,
      comicTitle,
      matchedBy: remoteFile.matchedBy,
    },
  };

  recordPullBackEvent(offlineTask, transferTask, success);
  return success;
}

type OpenListRemoteFile = {
  name: string;
  size: number;
  path: string;
  parentName: string | null;
};

type ListOpenListRemoteFilesResult =
  | { ok: true; files: OpenListRemoteFile[]; httpStatus: number; dirCount: number; fileCount: number }
  | {
      ok: false;
      code: CreateTransferFromOfflineFailureCode;
      message: string;
      httpStatus?: number | null;
      openlistCode?: number | null;
      errorName?: string;
      errorMessage?: string;
      dirCount?: number;
      fileCount?: number;
    };

type OpenListListEntry = { name: string; size: number; is_dir?: boolean };

async function listOpenListDirectoryEntries(
  baseUrl: string,
  token: string,
  remotePath: string,
): Promise<ListOpenListRemoteFilesResult & { entries?: OpenListListEntry[] }> {
  try {
    const listRes = await fetch(`${baseUrl}/api/fs/list`, {
      method: "POST",
      headers: { Authorization: token, "Content-Type": "application/json" },
      body: JSON.stringify({ path: remotePath, page: 1, per_page: 100, refresh: true }),
      signal: AbortSignal.timeout(8000),
    });

    const listData = await listRes.json().catch(() => null) as {
      code?: number;
      message?: string;
      data?: { content?: OpenListListEntry[] | null };
    } | null;

    if (!listRes.ok) {
      return {
        ok: false,
        code: "remote_list_http_error",
        message: `OpenList 列目录 HTTP 失败（${listRes.status}）：${remotePath}`,
        httpStatus: listRes.status,
        openlistCode: typeof listData?.code === "number" ? listData.code : null,
        errorMessage: typeof listData?.message === "string" ? listData.message : undefined,
      };
    }

    if (listData?.code !== 200) {
      const openlistCode = typeof listData?.code === "number" ? listData.code : null;
      const apiMessage = typeof listData?.message === "string" && listData.message.trim()
        ? listData.message.trim()
        : "未知错误";
      return {
        ok: false,
        code: "remote_list_api_error",
        message: `OpenList 列目录失败（code=${openlistCode ?? "?"}）：${apiMessage}；路径 ${remotePath}`,
        httpStatus: listRes.status,
        openlistCode,
        errorMessage: apiMessage,
      };
    }

    const content = Array.isArray(listData?.data?.content) ? listData.data.content : [];
    return {
      ok: true,
      files: [],
      httpStatus: listRes.status,
      dirCount: content.filter((f) => f.is_dir).length,
      fileCount: content.filter((f) => !f.is_dir && Number(f.size) > 0).length,
      entries: content,
    };
  } catch (error) {
    const errorName = error instanceof Error ? error.name : "Error";
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isTimeout = errorName === "TimeoutError" || /timeout|aborted/i.test(errorMessage);

    return {
      ok: false,
      code: isTimeout ? "remote_list_timeout" : "remote_list_failed",
      message: isTimeout
        ? `OpenList 列目录超时（8s）：${remotePath}`
        : `OpenList 列目录请求失败：${sanitizePullBackErrorMessage(errorMessage)}；路径 ${remotePath}`,
      httpStatus: null,
      openlistCode: null,
      errorName,
      errorMessage: sanitizePullBackErrorMessage(errorMessage),
    };
  }
}

function joinOpenListPath(parentPath: string, name: string) {
  return `${parentPath.replace(/\/+$/, "")}/${name}`;
}

function scoreNameMatch(candidate: string, hints: string[]) {
  const normalizedCandidate = candidate.toLowerCase();
  let best = 0;
  for (const hint of hints) {
    const normalizedHint = hint.trim().toLowerCase();
    if (!normalizedHint) continue;
    if (normalizedCandidate === normalizedHint) best = Math.max(best, 100);
    else if (normalizedCandidate.includes(normalizedHint) || normalizedHint.includes(normalizedCandidate)) {
      best = Math.max(best, 80);
    } else {
      // 部分 token 重叠（日文/英文标题混用时有用）
      const tokens = normalizedHint.split(/[\s\[\]()（）_|.-]+/).filter((t) => t.length >= 4);
      const hits = tokens.filter((t) => normalizedCandidate.includes(t)).length;
      if (hits > 0) best = Math.max(best, Math.min(70, hits * 15));
    }
  }
  return best;
}

async function listOpenListRemoteFilesForPullBack(
  baseUrl: string,
  token: string,
  remotePath: string,
  options: { matchHints?: string[] } = {},
): Promise<ListOpenListRemoteFilesResult> {
  const root = await listOpenListDirectoryEntries(baseUrl, token, remotePath);
  if (!root.ok) return root;

  const entries = root.entries ?? [];
  const files: OpenListRemoteFile[] = [];
  const directories = entries.filter((f) => f.is_dir && typeof f.name === "string" && f.name.length > 0);

  for (const entry of entries) {
    if (entry.is_dir || typeof entry.name !== "string" || !entry.name || Number(entry.size) <= 0) continue;
    files.push({
      name: entry.name,
      size: Number(entry.size),
      path: joinOpenListPath(remotePath, entry.name),
      parentName: null,
    });
  }

  // 优先深入“看起来像本次下载结果”的子目录（115 常建同名 .zip 文件夹）
  const hints = options.matchHints ?? [];
  const orderedDirs = [...directories].sort((a, b) => {
    const scoreDiff = scoreNameMatch(b.name, hints) - scoreNameMatch(a.name, hints);
    if (scoreDiff !== 0) return scoreDiff;
    return a.name.localeCompare(b.name);
  });

  for (const dir of orderedDirs) {
    const childPath = joinOpenListPath(remotePath, dir.name);
    const child = await listOpenListDirectoryEntries(baseUrl, token, childPath);
    if (!child.ok || !child.entries) continue;

    for (const entry of child.entries) {
      if (entry.is_dir || typeof entry.name !== "string" || !entry.name || Number(entry.size) <= 0) continue;
      files.push({
        name: entry.name,
        size: Number(entry.size),
        path: joinOpenListPath(childPath, entry.name),
        parentName: dir.name,
      });
    }
  }

  return {
    ok: true,
    files,
    httpStatus: root.httpStatus,
    dirCount: directories.length,
    fileCount: files.length,
  };
}

function getComicResourceDisplayLabel(comicResourceId: string): string | null {
  const row = getDb()
    .select({
      displayLabel: comicResources.displayLabel,
    })
    .from(comicResources)
    .where(eq(comicResources.id, comicResourceId))
    .get();
  const label = row?.displayLabel?.trim();
  return label || null;
}

function pickRemoteFileForPullBack(
  files: OpenListRemoteFile[],
  input: { comicTitle: string; resourceLabel: string | null; resourceDisplayLabel: string | null },
): (OpenListRemoteFile & { matchedBy: "title" | "resource_label" | "parent_dir" | "largest_file" }) | null {
  if (files.length === 0) return null;

  const hints = [input.resourceLabel, input.resourceDisplayLabel, input.comicTitle].filter(Boolean) as string[];

  let best: (OpenListRemoteFile & { matchedBy: "title" | "resource_label" | "parent_dir" | "largest_file"; score: number }) | null = null;

  for (const file of files) {
    const nameScore = scoreNameMatch(file.name, hints);
    const parentScore = file.parentName ? scoreNameMatch(file.parentName, hints) : 0;
    const score = Math.max(nameScore, parentScore);

    let matchedBy: "title" | "resource_label" | "parent_dir" | "largest_file" = "largest_file";
    if (nameScore >= 80 && (input.resourceLabel || input.resourceDisplayLabel)) {
      matchedBy = "resource_label";
    } else if (nameScore >= 80) {
      matchedBy = "title";
    } else if (parentScore >= 80) {
      matchedBy = "parent_dir";
    } else if (score > 0) {
      matchedBy = parentScore >= nameScore ? "parent_dir" : "title";
    }

    if (!best || score > best.score || (score === best.score && file.size > best.size)) {
      best = { ...file, matchedBy: score > 0 ? matchedBy : "largest_file", score };
    }
  }

  if (!best) return null;
  if (best.score > 0) {
    return { name: best.name, size: best.size, path: best.path, parentName: best.parentName, matchedBy: best.matchedBy };
  }

  const largest = [...files].sort((a, b) => b.size - a.size)[0];
  return largest
    ? { ...largest, matchedBy: "largest_file" }
    : null;
}

function failCreateTransfer(
  offlineTask: DownloadTaskRecord,
  code: CreateTransferFromOfflineFailureCode,
  message: string,
  details: Extract<CreateTransferFromOfflineResult, { ok: false }>["details"],
): CreateTransferFromOfflineResult {
  const result: CreateTransferFromOfflineResult = { ok: false, code, message, details };
  console.warn("[downloads/pull-back]", code, message, details);
  recordPullBackEvent(offlineTask, null, result);
  return result;
}

function recordPullBackEvent(
  offlineTask: DownloadTaskRecord,
  transferTask: DownloadTaskRecord | null,
  result: CreateTransferFromOfflineResult,
) {
  try {
    const summary = result.ok
      ? `拉回本地成功：${offlineTask.comicTitle} → ${result.details.fileName}`
      : `拉回本地失败：${offlineTask.comicTitle}（${result.code}） ${result.message}`;

    const detail = {
      offlineTaskId: offlineTask.id,
      transferTaskId: transferTask?.id ?? null,
      comicResourceId: offlineTask.comicResourceId,
      comicId: offlineTask.comicId,
      comicTitle: offlineTask.comicTitle,
      ok: result.ok,
      ...(result.ok
        ? {
            remotePath: result.details.remotePath,
            remoteFilePath: result.details.remoteFilePath,
            fileName: result.details.fileName,
            fileSize: result.details.fileSize,
            matchedBy: result.details.matchedBy,
          }
        : {
            code: result.code,
            message: result.message,
            remotePath: result.details.remotePath ?? offlineTask.remotePath,
            openlistCode: result.details.openlistCode ?? null,
            httpStatus: result.details.httpStatus ?? null,
            fileCount: result.details.fileCount ?? null,
            errorName: result.details.errorName ?? null,
            errorMessage: result.details.errorMessage ?? null,
          }),
    };

    getDb()
      .insert(operationLogs)
      .values({
        id: randomUUID(),
        operation: "download_task_pull_back",
        targetType: "download_task",
        targetId: transferTask?.id ?? offlineTask.id,
        summary,
        detailJson: JSON.stringify(detail),
      })
      .run();
  } catch (error) {
    console.warn("[downloads/pull-back] failed to write operation log", error);
  }
}

function sanitizePullBackErrorMessage(message: string) {
  const trimmed = message.trim();
  if (!trimmed) return "未知错误";
  if (/https?:\/\//i.test(trimmed) || /sign=/i.test(trimmed) || /token=/i.test(trimmed)) {
    return "请求失败（细节已脱敏）";
  }
  return trimmed.slice(0, 240);
}
