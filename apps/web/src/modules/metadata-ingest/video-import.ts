import { randomUUID } from "node:crypto";
import path from "node:path";

import { and, asc, eq } from "drizzle-orm";

import { bootstrapDatabase, getDb, videoRoots, videoSources, videoTags, videos } from "@/modules/core/db";
import { getRuntimeSettings } from "@/modules/core/settings";
import { createVideoDownloadTask, type VideoDownloadTaskRecord } from "@/modules/downloads";
import { createTagRepository } from "@/modules/tags/tags.repository";
import { buildVideoImportSourceKey, normalizeVideoSortTitle, sanitizeVideoDirectoryName } from "@/modules/video-library";

export interface VideoIngestTagInput {
  namespace: string;
  name: string;
  displayNameZh?: string | null;
}

export interface VideoIngestSourceInput {
  type?: string;
  url: string;
  label?: string | null;
  quality?: number | null;
}

export interface VideoIngestPayload {
  videoRootId?: string | null;
  site: string;
  sourceUrl: string;
  sourceId?: string | null;
  title: string;
  originalTitle?: string | null;
  coverUrl?: string | null;
  tags?: VideoIngestTagInput[];
  resources?: VideoIngestSourceInput[];
  video?: {
    durationSeconds?: number | null;
    sources?: VideoIngestSourceInput[];
  } | null;
}

export interface VideoImportResult {
  videoId: string;
  sourceRecordId: string;
  createdVideo: boolean;
  resourceCount: number;
  videoRootId: string;
  task: VideoDownloadTaskRecord;
}

interface NormalizedVideoPayload {
  videoRootId: string | null;
  site: string;
  sourceUrl: string;
  sourceId: string | null;
  title: string;
  originalTitle: string | null;
  coverUrl: string | null;
  tags: VideoIngestTagInput[];
  resources: Array<{ type: "http"; url: string; label: string; quality: number | null }>;
  durationSeconds: number | null;
}

export async function importVideoPayload(input: VideoIngestPayload): Promise<VideoImportResult> {
  bootstrapDatabase();
  const payload = normalizeVideoIngestPayload(input);
  const db = getDb();
  const selectedRoot = payload.videoRootId
    ? db.select().from(videoRoots).where(eq(videoRoots.id, payload.videoRootId)).get()
    : db.select().from(videoRoots).where(eq(videoRoots.isEnabled, true)).orderBy(asc(videoRoots.createdAt)).get();

  if (!selectedRoot) {
    throw new Error("没有可用的视频根目录，请先在管理页面配置并启用视频根目录。");
  }
  if (!selectedRoot.isEnabled) {
    throw new Error("所选视频根目录已停用。");
  }

  const settings = await getRuntimeSettings();
  if (!settings.aria2Enabled || !settings.aria2RpcUrl) {
    throw new Error("请先在设置中启用并配置 aria2。");
  }

  const existingSource = payload.sourceId
    ? db.select().from(videoSources).where(and(eq(videoSources.site, payload.site), eq(videoSources.sourceId, payload.sourceId))).get()
    : db.select().from(videoSources).where(and(eq(videoSources.site, payload.site), eq(videoSources.sourceUrl, payload.sourceUrl))).get();
  const existingVideo = existingSource ? db.select().from(videos).where(eq(videos.id, existingSource.videoId)).get() : null;
  const root = existingVideo
    ? db.select().from(videoRoots).where(eq(videoRoots.id, existingVideo.videoRootId)).get() ?? selectedRoot
    : selectedRoot;
  const videoId = existingVideo?.id ?? randomUUID();
  const sourceRecordId = existingSource?.id ?? randomUUID();
  const sourceKey = existingVideo?.sourceKey ?? buildVideoImportSourceKey(payload.title);
  const now = new Date().toISOString();
  const rawMetadataJson = JSON.stringify(input);

  db.transaction((tx) => {
    if (!existingVideo) {
      tx.insert(videos).values({
        id: videoId,
        videoRootId: root.id,
        sourceKey,
        displayTitle: payload.title,
        fileTitle: payload.title,
        sortTitle: normalizeVideoSortTitle(payload.title),
        status: "missing_local_file",
        createdAt: now,
        updatedAt: now,
      }).run();
    }

    if (existingSource) {
      tx.update(videoSources).set({
        sourceUrl: payload.sourceUrl,
        originalTitle: payload.originalTitle,
        coverUrl: payload.coverUrl,
        rawMetadataJson,
        updatedAt: now,
      }).where(eq(videoSources.id, sourceRecordId)).run();
    } else {
      tx.insert(videoSources).values({
        id: sourceRecordId,
        videoId,
        site: payload.site,
        sourceId: payload.sourceId,
        sourceUrl: payload.sourceUrl,
        originalTitle: payload.originalTitle,
        coverUrl: payload.coverUrl,
        rawMetadataJson,
        createdAt: now,
        updatedAt: now,
      }).run();
    }
  });

  const tagRepository = createTagRepository();
  for (const tagInput of payload.tags) {
    const tag = await tagRepository.upsert(tagInput);
    const existingAssignment = db.select({ isUserEdited: videoTags.isUserEdited }).from(videoTags).where(and(eq(videoTags.videoId, videoId), eq(videoTags.tagId, tag.id))).get();
    if (existingAssignment?.isUserEdited) continue;
    db.insert(videoTags).values({ videoId, tagId: tag.id, source: "metadata", isUserEdited: false, createdAt: now, updatedAt: now }).onConflictDoUpdate({ target: [videoTags.videoId, videoTags.tagId], set: { source: "metadata", isUserEdited: false, updatedAt: now } }).run();
  }

  const targetDirectory = sourceKey.startsWith("dir:下载入库/")
    ? path.join(root.absolutePath, sourceKey.slice("dir:".length))
    : sourceKey.startsWith("dir:")
      ? path.join(root.absolutePath, sourceKey.slice("dir:".length))
      : path.join(root.absolutePath, sanitizeVideoDirectoryName(payload.title));
  const task = await createVideoDownloadTask({
    title: payload.title,
    resourceUrl: payload.resources[0].url,
    videoRootId: root.id,
    targetDirectory,
    videoId,
    videoSourceId: sourceRecordId,
  });

  return {
    videoId,
    sourceRecordId,
    createdVideo: !existingVideo,
    resourceCount: payload.resources.length,
    videoRootId: root.id,
    task: task.task,
  };
}

export function normalizeVideoIngestPayload(input: VideoIngestPayload): NormalizedVideoPayload {
  if (!input || typeof input !== "object") throw new Error("视频 metadata payload 无效。");
  const site = normalizeText(input.site, "来源站点").toLowerCase();
  const sourceUrl = normalizeHttpUrl(input.sourceUrl, "来源 URL");
  const title = normalizeText(input.title, "视频标题");
  const sourceId = optionalText(input.sourceId);
  const originalTitle = optionalText(input.originalTitle);
  const coverUrl = input.coverUrl ? normalizeHttpUrl(input.coverUrl, "封面 URL") : null;
  const sourceInputs = [...(Array.isArray(input.video?.sources) ? input.video.sources : []), ...(Array.isArray(input.resources) ? input.resources : [])];
  const resources = [];
  const seen = new Set<string>();
  for (const source of sourceInputs) {
    if (source?.type && source.type !== "http") continue;
    const url = normalizeHttpUrl(source?.url, "视频资源 URL");
    if (seen.has(url)) continue;
    seen.add(url);
    const quality = Number(source?.quality);
    resources.push({ url, type: "http" as const, label: optionalText(source?.label) ?? "视频直链", quality: Number.isFinite(quality) && quality > 0 ? Math.trunc(quality) : null });
  }
  resources.sort((left, right) => (right.quality ?? 0) - (left.quality ?? 0));
  if (resources.length === 0) throw new Error("官方下载页没有可用的视频下载地址。");

  const duration = Number(input.video?.durationSeconds);
  const tags: VideoIngestTagInput[] = [];
  const tagKeys = new Set<string>();
  for (const tag of Array.isArray(input.tags) ? input.tags : []) {
    const namespace = optionalText(tag?.namespace)?.toLowerCase() ?? "";
    const name = optionalText(tag?.name)?.toLowerCase() ?? "";
    const key = `${namespace}:${name}`;
    if (!namespace || !name || tagKeys.has(key)) continue;
    tagKeys.add(key);
    tags.push({ namespace, name, displayNameZh: optionalText(tag?.displayNameZh) });
    if (tags.length >= 80) break;
  }

  return {
    videoRootId: optionalText(input.videoRootId),
    site,
    sourceUrl,
    sourceId,
    title,
    originalTitle,
    coverUrl,
    tags,
    resources: resources.slice(0, 8),
    durationSeconds: Number.isFinite(duration) && duration >= 0 ? Math.trunc(duration) : null,
  };
}

function normalizeText(value: unknown, label: string) {
  const text = optionalText(value);
  if (!text) throw new Error(`${label}不能为空。`);
  return text;
}

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.replace(/\s+/g, " ").trim() : null;
}

function normalizeHttpUrl(value: unknown, label: string) {
  const text = normalizeText(value, label);
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new Error(`${label}无效。`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error(`${label}必须是 HTTP(S) 地址。`);
  return url.toString();
}
