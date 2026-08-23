import { randomUUID } from "node:crypto";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";

import { and, eq } from "drizzle-orm";

import { bootstrapDatabase, getDb, videoEpisodes, videoRoots, videos } from "@/modules/core/db";

import { probeVideoDurationSeconds } from "./media-facts";
import { buildVideoImportSourceKey, naturalCompare, normalizeVideoSortTitle, normalizeVideoTitle } from "./title-utils";

const SUPPORTED_EXTENSIONS = new Set(["mp4", "mkv", "avi", "mov", "webm", "m4v", "ts"]);

type ScannedEpisode = {
  title: string;
  sortTitle: string;
  relativePath: string;
  absolutePath: string;
  extension: string;
  kind: "file" | "directory_episode";
  sizeBytes: number;
  mtimeMs: number;
  durationSeconds: number | null;
};

type ScannedVideo = {
  sourceKey: string;
  fileTitle: string;
  displayTitle: string;
  episodes: ScannedEpisode[];
};

export interface VideoScanResult {
  rootId: string;
  addedCount: number;
  missingCount: number;
  episodeCount: number;
}

export async function scanVideoRoot(videoRootId: string): Promise<VideoScanResult> {
  bootstrapDatabase();
  const db = getDb();
  const root = db.select().from(videoRoots).where(eq(videoRoots.id, videoRootId)).get();
  if (!root) throw new Error("找不到要扫描的视频根目录。");
  if (!root.isEnabled) throw new Error("这个视频根目录已停用。");

  const scanned = await enumerateVideoRoot(root.absolutePath);
  const now = new Date().toISOString();
  const scannedEpisodePaths = new Set(scanned.flatMap((video) => video.episodes.map((episode) => episode.relativePath)));

  return db.transaction((tx) => {
    let addedCount = 0;
    let missingCount = 0;
    let episodeCount = 0;
    const existingEpisodes = tx.select().from(videoEpisodes).where(eq(videoEpisodes.videoRootId, videoRootId)).all();
    const existingByRootPath = new Map(existingEpisodes.map((episode) => [episode.relativePath, episode]));

    for (const existing of existingEpisodes) {
      if (!scannedEpisodePaths.has(existing.relativePath) && !existing.isMissing) {
        missingCount += 1;
        tx.update(videoEpisodes)
          .set({ isMissing: true, missingSince: existing.missingSince ?? now, updatedAt: now })
          .where(eq(videoEpisodes.id, existing.id))
          .run();
      }
    }

    for (const scannedVideo of scanned) {
      const sourceKey = scannedVideo.sourceKey;
      let video = tx
        .select()
        .from(videos)
        .where(and(eq(videos.videoRootId, videoRootId), eq(videos.sourceKey, sourceKey)))
        .get();

      if (!video) {
        const videoId = randomUUID();
        tx.insert(videos).values({
          id: videoId,
          videoRootId,
          sourceKey,
          displayTitle: scannedVideo.displayTitle,
          fileTitle: scannedVideo.fileTitle,
          sortTitle: normalizeVideoSortTitle(scannedVideo.displayTitle),
          status: "readable",
          createdAt: now,
          updatedAt: now,
        }).run();
        video = tx.select().from(videos).where(eq(videos.id, videoId)).get();
        addedCount += 1;
      }

      if (!video) continue;

      const existingForVideo = tx.select().from(videoEpisodes).where(eq(videoEpisodes.videoId, video.id)).all();
      const existingByPath = new Map(existingForVideo.map((episode) => [episode.relativePath, episode]));
      for (const [sortOrder, episode] of scannedVideo.episodes.entries()) {
        const existing = existingByPath.get(episode.relativePath) ?? existingByRootPath.get(episode.relativePath);
        if (existing) {
          const isOwnedByScannedVideo = existing.videoId === video.id;
          tx.update(videoEpisodes)
            .set({
              title: existing.title || episode.title,
              sortTitle: isOwnedByScannedVideo ? episode.sortTitle : existing.sortTitle,
              ...(isOwnedByScannedVideo ? { sortOrder } : {}),
              absolutePath: episode.absolutePath,
              extension: episode.extension,
              kind: episode.kind,
              sizeBytes: episode.sizeBytes,
              mtimeMs: episode.mtimeMs,
              durationSeconds: episode.durationSeconds,
              isMissing: false,
              missingSince: null,
              updatedAt: now,
            })
            .where(eq(videoEpisodes.id, existing.id))
            .run();
        } else {
          tx.insert(videoEpisodes).values({
            id: randomUUID(),
            videoId: video.id,
            videoRootId,
            title: episode.title,
            sortTitle: episode.sortTitle,
            sortOrder,
            absolutePath: episode.absolutePath,
            relativePath: episode.relativePath,
            extension: episode.extension,
            kind: episode.kind,
            sizeBytes: episode.sizeBytes,
            mtimeMs: episode.mtimeMs,
            durationSeconds: episode.durationSeconds,
            isMissing: false,
            createdAt: now,
            updatedAt: now,
          }).run();
        }
        episodeCount += 1;
      }

      const readableEpisodeCount = tx.select({ id: videoEpisodes.id })
        .from(videoEpisodes)
        .where(and(eq(videoEpisodes.videoId, video.id), eq(videoEpisodes.isMissing, false)))
        .all().length;
      const nextStatus = video.parentVideoId || video.mergedAsEpisodeId
        ? "hidden"
        : readableEpisodeCount > 0
          ? (video.status === "hidden" || video.status === "deleted" ? video.status : "readable")
          : "missing_local_file";
      tx.update(videos).set({ status: nextStatus, updatedAt: now }).where(eq(videos.id, video.id)).run();
    }

    tx.update(videoRoots).set({ lastScanAt: now, updatedAt: now }).where(eq(videoRoots.id, videoRootId)).run();
    return { rootId: videoRootId, addedCount, missingCount, episodeCount };
  });
}

async function enumerateVideoRoot(rootPath: string): Promise<ScannedVideo[]> {
  const entries = await readdir(rootPath, { withFileTypes: true });
  const result: ScannedVideo[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const absolutePath = path.join(rootPath, entry.name);
    if (entry.name === "下载入库" && entry.isDirectory()) {
      const importedEntries = await readdir(absolutePath, { withFileTypes: true });
      for (const importedEntry of importedEntries) {
        if (!importedEntry.isDirectory() || importedEntry.name.startsWith(".")) continue;
        const importedVideo = await scanVideoDirectory(rootPath, path.join(absolutePath, importedEntry.name));
        if (importedVideo) result.push(importedVideo);
      }
      continue;
    }

    if (entry.isDirectory()) {
      const scannedVideo = await scanVideoDirectory(rootPath, absolutePath);
      if (scannedVideo) result.push(scannedVideo);
      continue;
    }

    if (entry.isFile() && isSupportedVideo(entry.name)) {
      result.push({
        sourceKey: `file:${entry.name}`,
        fileTitle: normalizeVideoTitle(entry.name),
        displayTitle: normalizeVideoTitle(entry.name),
        episodes: [await toScannedEpisode(rootPath, entry.name, "file")],
      });
    }
  }

  return result.sort((left, right) => naturalCompare(left.displayTitle, right.displayTitle));
}

async function scanVideoDirectory(rootPath: string, absolutePath: string): Promise<ScannedVideo | null> {
  const files = await readdir(absolutePath, { withFileTypes: true });
  const episodes = await Promise.all(
    files
      .filter((file) => file.isFile() && isSupportedVideo(file.name))
      .sort((left, right) => naturalCompare(left.name, right.name))
      .map((file) => toScannedEpisode(rootPath, path.join(path.relative(rootPath, absolutePath), file.name), "directory_episode")),
  );
  if (!episodes.length) return null;

  const relativeDirectory = path.relative(rootPath, absolutePath).split(path.sep).join("/");
  const displayTitle = normalizeVideoTitle(path.basename(absolutePath));
  return {
    sourceKey: relativeDirectory.startsWith("下载入库/") ? buildVideoImportSourceKey(displayTitle) : `dir:${relativeDirectory}`,
    fileTitle: displayTitle,
    displayTitle,
    episodes,
  };
}

async function toScannedEpisode(rootPath: string, relativePath: string, kind: ScannedEpisode["kind"]): Promise<ScannedEpisode> {
  const absolutePath = path.resolve(rootPath, relativePath);
  const fileInfo = await stat(absolutePath);
  const extension = path.extname(absolutePath).slice(1).toLowerCase();
  return {
    title: normalizeVideoTitle(path.basename(absolutePath)),
    sortTitle: normalizeVideoSortTitle(path.basename(absolutePath)),
    relativePath: path.normalize(relativePath),
    absolutePath,
    extension,
    kind,
    sizeBytes: fileInfo.size,
    mtimeMs: fileInfo.mtimeMs,
    durationSeconds: await probeVideoDurationSeconds(absolutePath),
  };
}

function isSupportedVideo(fileName: string) {
  return SUPPORTED_EXTENSIONS.has(path.extname(fileName).slice(1).toLowerCase());
}
