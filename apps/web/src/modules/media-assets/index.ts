import { randomUUID, createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { eq } from "drizzle-orm";
import sharp from "sharp";

import { cleanupApplicationCache } from "@/modules/core/cache";
import { getRuntimeSettings } from "@/modules/core/settings";
import { bootstrapDatabase, chapters, localFiles, mediaAssets, pages, getDb } from "@/modules/core/db";
import { readReaderPageImage } from "@/modules/reader/page-images";

export type MediaAssetUse = "cover" | "list_thumbnail" | "reader_thumbnail";

export interface ThumbnailCacheKeyInput {
  sourceIdentity: string;
  width: number;
  height: number;
  use: MediaAssetUse;
}

export function createThumbnailCacheKey(input: ThumbnailCacheKeyInput) {
  return `${input.use}:${input.width}x${input.height}:${input.sourceIdentity}`;
}

export interface ReaderThumbnailRequest {
  pageId: string;
  width?: number;
  height?: number;
}

export interface CachedMediaAsset {
  data: Buffer;
  contentType: string;
  cacheStatus: "hit" | "generated";
}

const DEFAULT_READER_THUMBNAIL_WIDTH = 176;
const DEFAULT_READER_THUMBNAIL_HEIGHT = 264;
const GENERATION_CONCURRENCY = 2;

let activeGenerationCount = 0;
const generationQueue: Array<() => void> = [];

export async function getReaderThumbnail(input: ReaderThumbnailRequest): Promise<CachedMediaAsset | null> {
  bootstrapDatabase();

  const db = getDb();
  const width = normalizeDimension(input.width, DEFAULT_READER_THUMBNAIL_WIDTH);
  const height = normalizeDimension(input.height, DEFAULT_READER_THUMBNAIL_HEIGHT);
  const pageIdentity = db
    .select({
      pageId: pages.id,
      chapterId: pages.chapterId,
      comicId: chapters.comicId,
      internalPath: pages.internalPath,
      localFileId: pages.localFileId,
      localFileMtimeMs: localFiles.mtimeMs,
      localFileSizeBytes: localFiles.sizeBytes,
      localFileContentHash: localFiles.contentHash,
    })
    .from(pages)
    .innerJoin(chapters, eq(chapters.id, pages.chapterId))
    .innerJoin(localFiles, eq(localFiles.id, pages.localFileId))
    .where(eq(pages.id, input.pageId))
    .get();

  if (!pageIdentity) {
    return null;
  }

  const now = new Date().toISOString();
  const sourceVersion =
    pageIdentity.localFileContentHash ?? `${pageIdentity.localFileMtimeMs ?? "unknown-mtime"}:${pageIdentity.localFileSizeBytes ?? "unknown-size"}`;
  const sourceIdentity = `${pageIdentity.localFileId}:${pageIdentity.internalPath}:${sourceVersion}`;
  const cacheKey = createThumbnailCacheKey({
    sourceIdentity,
    width,
    height,
    use: "reader_thumbnail",
  });

  const cached = db.select().from(mediaAssets).where(eq(mediaAssets.cacheKey, cacheKey)).get();
  if (cached) {
    const data = await readFile(/*turbopackIgnore: true*/ cached.filePath).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        return null;
      }

      throw error;
    });

    if (data) {
      db.update(mediaAssets)
        .set({
          lastAccessAt: now,
          updatedAt: now,
        })
        .where(eq(mediaAssets.id, cached.id))
        .run();

      return { data, contentType: "image/webp", cacheStatus: "hit" };
    }
  }

  return enqueueThumbnailGeneration(async () => {
    const sourceImage = await readReaderPageImage(input.pageId);
    if (!sourceImage) {
      return null;
    }

    const data = await sharp(sourceImage.data)
      .resize({ width, height, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 72 })
      .toBuffer();
    const runtimeSettings = await getRuntimeSettings();
    const cachePath = await writeThumbnailCacheFile(cacheKey, data, runtimeSettings.cacheDirectory);
    const expiresAt = addDays(now, runtimeSettings.readerThumbnailTtlDays);

    db.insert(mediaAssets)
      .values({
        id: cached?.id ?? randomUUID(),
        comicId: pageIdentity.comicId,
        chapterId: pageIdentity.chapterId,
        pageId: input.pageId,
        use: "reader_thumbnail",
        cacheKey,
        width,
        height,
        filePath: cachePath,
        sizeBytes: data.byteLength,
        lastAccessAt: now,
        expiresAt,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: mediaAssets.cacheKey,
        set: {
          filePath: cachePath,
          sizeBytes: data.byteLength,
          lastAccessAt: now,
          expiresAt,
          updatedAt: now,
        },
      })
      .run();

    void cleanupApplicationCache().catch(() => undefined);
    return { data, contentType: "image/webp", cacheStatus: "generated" };
  });
}

function enqueueThumbnailGeneration<T>(task: () => Promise<T>) {
  return new Promise<T>((resolve, reject) => {
    const run = () => {
      activeGenerationCount += 1;
      task()
        .then(resolve, reject)
        .finally(() => {
          activeGenerationCount -= 1;
          generationQueue.shift()?.();
        });
    };

    if (activeGenerationCount < GENERATION_CONCURRENCY) {
      run();
      return;
    }

    generationQueue.push(run);
  });
}

async function writeThumbnailCacheFile(cacheKey: string, data: Buffer, cacheDirectorySetting: string) {
  const safeFileName = `${createHash("sha256").update(cacheKey).digest("hex")}.webp`;
  const cacheDirectory = path.resolve(process.cwd(), cacheDirectorySetting, "reader-thumbnails");
  const cachePath = path.join(cacheDirectory, safeFileName);
  await mkdir(cacheDirectory, { recursive: true });
  await writeFile(/*turbopackIgnore: true*/ cachePath, data);
  return cachePath;
}

function normalizeDimension(value: number | undefined, fallback: number) {
  if (!value || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(48, Math.min(512, Math.round(value)));
}

function addDays(isoDate: string, days: number) {
  const date = new Date(isoDate);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}
