import { randomUUID, createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { and, asc, eq, inArray } from "drizzle-orm";
import sharp from "sharp";

import { cleanupApplicationCache } from "@/modules/core/cache";
import { getRuntimeSettings } from "@/modules/core/settings";
import { bootstrapDatabase, chapters, comics, localFiles, mediaAssets, pages, getDb } from "@/modules/core/db";
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

export interface ComicCoverRequest {
  comicId: string;
  height?: number;
  skipManualCover?: boolean;
  use?: "cover" | "list_thumbnail";
  width?: number;
}

export interface CachedMediaAsset {
  data: Buffer;
  contentType: string;
  cacheStatus: "hit" | "generated";
}

export interface RegenerateComicCoverResult {
  comicId: string;
  removedCacheCount: number;
  generatedCount: number;
  assets: Array<{
    use: "cover" | "list_thumbnail";
    cacheStatus: CachedMediaAsset["cacheStatus"];
  }>;
  mangaFilesTouched: false;
}

export interface UploadComicCoverResult {
  comicId: string;
  generatedCount: number;
  removedManualCoverCount: number;
  assets: Array<{
    use: "cover" | "list_thumbnail";
    cacheStatus: "uploaded";
  }>;
  mangaFilesTouched: false;
}

const DEFAULT_COVER_WIDTH = 520;
const DEFAULT_COVER_HEIGHT = 780;
const DEFAULT_LIST_COVER_WIDTH = 240;
const DEFAULT_LIST_COVER_HEIGHT = 360;
const DEFAULT_READER_THUMBNAIL_WIDTH = 176;
const DEFAULT_READER_THUMBNAIL_HEIGHT = 264;
const GENERATION_CONCURRENCY = 2;
const MANUAL_COVER_CACHE_PREFIX = "manual-cover";

let activeGenerationCount = 0;
const generationQueue: Array<() => void> = [];

export async function getComicCover(input: ComicCoverRequest): Promise<CachedMediaAsset | null> {
  bootstrapDatabase();

  const db = getDb();
  const use = input.use ?? "cover";
  const width = normalizeDimension(input.width, use === "list_thumbnail" ? DEFAULT_LIST_COVER_WIDTH : DEFAULT_COVER_WIDTH, 1200);
  const height = normalizeDimension(input.height, use === "list_thumbnail" ? DEFAULT_LIST_COVER_HEIGHT : DEFAULT_COVER_HEIGHT, 1200);
  const manualCover = input.skipManualCover
    ? null
    : await readManualCoverAsset({
        comicId: input.comicId,
        height,
        use,
        width,
      });

  if (manualCover) {
    return manualCover;
  }

  const coverPage = findComicCoverPage(input.comicId);

  if (!coverPage) {
    return null;
  }

  const now = new Date().toISOString();
  const sourceVersion = coverPage.localFileContentHash ?? `${coverPage.localFileMtimeMs ?? "unknown-mtime"}:${coverPage.localFileSizeBytes ?? "unknown-size"}`;
  const sourceIdentity = `${coverPage.localFileId}:${coverPage.internalPath}:${sourceVersion}`;
  const cacheKey = createThumbnailCacheKey({
    sourceIdentity,
    width,
    height,
    use,
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
    const sourceImage = await readReaderPageImage(coverPage.pageId);
    if (!sourceImage) {
      return null;
    }

    const data = await sharp(sourceImage.data)
      .resize({ width, height, fit: "cover", withoutEnlargement: true })
      .webp({ quality: use === "list_thumbnail" ? 74 : 80 })
      .toBuffer();
    const runtimeSettings = await getRuntimeSettings();
    const cachePath = await writeMediaCacheFile(
      cacheKey,
      data,
      runtimeSettings.cacheDirectory,
      use === "list_thumbnail" ? "list-covers" : "covers",
    );
    const expiresAt = addDays(now, runtimeSettings.readerThumbnailTtlDays);

    db.insert(mediaAssets)
      .values({
        id: cached?.id ?? randomUUID(),
        comicId: coverPage.comicId,
        chapterId: coverPage.chapterId,
        pageId: coverPage.pageId,
        use,
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

export async function regenerateComicCover(input: { comicId: string }): Promise<RegenerateComicCoverResult> {
  bootstrapDatabase();

  const db = getDb();
  const coverUses = ["cover", "list_thumbnail"] as const;
  const cachedCoverRows = db
    .select({
      id: mediaAssets.id,
      cacheKey: mediaAssets.cacheKey,
      filePath: mediaAssets.filePath,
    })
    .from(mediaAssets)
    .where(and(eq(mediaAssets.comicId, input.comicId), inArray(mediaAssets.use, [...coverUses])))
    .all()
    .filter((row) => !isManualCoverCacheKey(row.cacheKey));

  for (const row of cachedCoverRows) {
    await rm(/*turbopackIgnore: true*/ row.filePath, { force: true }).catch(() => undefined);
    db.delete(mediaAssets).where(eq(mediaAssets.id, row.id)).run();
  }

  const generatedAssets: RegenerateComicCoverResult["assets"] = [];

  for (const use of coverUses) {
    const asset = await getComicCover({
      comicId: input.comicId,
      skipManualCover: true,
      use,
      width: use === "list_thumbnail" ? DEFAULT_LIST_COVER_WIDTH : DEFAULT_COVER_WIDTH,
      height: use === "list_thumbnail" ? DEFAULT_LIST_COVER_HEIGHT : DEFAULT_COVER_HEIGHT,
    });

    if (asset) {
      generatedAssets.push({
        use,
        cacheStatus: asset.cacheStatus,
      });
    }
  }

  return {
    comicId: input.comicId,
    removedCacheCount: cachedCoverRows.length,
    generatedCount: generatedAssets.length,
    assets: generatedAssets,
    mangaFilesTouched: false,
  };
}

export async function uploadComicCover(input: { comicId: string; data: Buffer }): Promise<UploadComicCoverResult> {
  bootstrapDatabase();

  const db = getDb();
  const comic = db.select({ id: comics.id }).from(comics).where(eq(comics.id, input.comicId)).get();

  if (!comic) {
    throw new Error("找不到漫画记录。");
  }

  const coverUses = ["cover", "list_thumbnail"] as const;
  const oldManualRows = db
    .select({
      id: mediaAssets.id,
      cacheKey: mediaAssets.cacheKey,
      filePath: mediaAssets.filePath,
    })
    .from(mediaAssets)
    .where(and(eq(mediaAssets.comicId, input.comicId), inArray(mediaAssets.use, [...coverUses])))
    .all()
    .filter((row) => isManualCoverCacheKey(row.cacheKey));

  for (const row of oldManualRows) {
    await rm(/*turbopackIgnore: true*/ row.filePath, { force: true }).catch(() => undefined);
    db.delete(mediaAssets).where(eq(mediaAssets.id, row.id)).run();
  }

  const now = new Date().toISOString();
  const runtimeSettings = await getRuntimeSettings();
  const generatedAssets: UploadComicCoverResult["assets"] = [];

  for (const use of coverUses) {
    const width = use === "list_thumbnail" ? DEFAULT_LIST_COVER_WIDTH : DEFAULT_COVER_WIDTH;
    const height = use === "list_thumbnail" ? DEFAULT_LIST_COVER_HEIGHT : DEFAULT_COVER_HEIGHT;
    const data = await sharp(input.data)
      .rotate()
      .resize({ width, height, fit: "cover" })
      .webp({ quality: use === "list_thumbnail" ? 78 : 84 })
      .toBuffer();
    const cacheKey = createManualCoverCacheKey({
      comicId: input.comicId,
      height,
      use,
      width,
    });
    const cachePath = await writeMediaCacheFile(cacheKey, data, runtimeSettings.cacheDirectory, "manual-covers");

    db.insert(mediaAssets)
      .values({
        id: randomUUID(),
        comicId: input.comicId,
        chapterId: null,
        pageId: null,
        use,
        cacheKey,
        width,
        height,
        filePath: cachePath,
        sizeBytes: data.byteLength,
        lastAccessAt: now,
        expiresAt: null,
        updatedAt: now,
      })
      .run();
    generatedAssets.push({
      use,
      cacheStatus: "uploaded",
    });
  }

  void cleanupApplicationCache().catch(() => undefined);

  return {
    comicId: input.comicId,
    generatedCount: generatedAssets.length,
    removedManualCoverCount: oldManualRows.length,
    assets: generatedAssets,
    mangaFilesTouched: false,
  };
}

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
  const sourceIdentity = `page:${pageIdentity.pageId}:${pageIdentity.localFileId}:${pageIdentity.internalPath}:${sourceVersion}`;
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
    const cachePath = await writeMediaCacheFile(cacheKey, data, runtimeSettings.cacheDirectory, "reader-thumbnails");
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

function findComicCoverPage(comicId: string) {
  const db = getDb();
  const rows = db
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
    .from(comics)
    .innerJoin(chapters, eq(chapters.comicId, comics.id))
    .innerJoin(pages, eq(pages.chapterId, chapters.id))
    .innerJoin(localFiles, eq(localFiles.id, pages.localFileId))
    .where(and(eq(comics.id, comicId), eq(comics.status, "readable"), eq(localFiles.isMissing, false)))
    .orderBy(asc(chapters.sortOrder), asc(pages.pageNumber))
    .all();

  return rows.find((row) => isCoverLikePath(row.internalPath)) ?? rows[0] ?? null;
}

function isCoverLikePath(internalPath: string) {
  const name = path.basename(internalPath, path.extname(internalPath)).toLocaleLowerCase();
  return name === "cover" || name.startsWith("cover.") || name.startsWith("cover-") || name.startsWith("cover_");
}

async function readManualCoverAsset(input: { comicId: string; height: number; use: "cover" | "list_thumbnail"; width: number }) {
  const db = getDb();
  const now = new Date().toISOString();
  const cacheKey = createManualCoverCacheKey(input);
  const cached = db.select().from(mediaAssets).where(eq(mediaAssets.cacheKey, cacheKey)).get();

  if (!cached) {
    return null;
  }

  const data = await readFile(/*turbopackIgnore: true*/ cached.filePath).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") {
      return null;
    }

    throw error;
  });

  if (!data) {
    db.delete(mediaAssets).where(eq(mediaAssets.id, cached.id)).run();
    return null;
  }

  db.update(mediaAssets)
    .set({
      lastAccessAt: now,
      updatedAt: now,
    })
    .where(eq(mediaAssets.id, cached.id))
    .run();

  return { data, contentType: "image/webp", cacheStatus: "hit" as const };
}

function createManualCoverCacheKey(input: { comicId: string; height: number; use: "cover" | "list_thumbnail"; width: number }) {
  return `${MANUAL_COVER_CACHE_PREFIX}:${input.comicId}:${input.use}:${input.width}x${input.height}`;
}

function isManualCoverCacheKey(cacheKey: string) {
  return cacheKey.startsWith(`${MANUAL_COVER_CACHE_PREFIX}:`);
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

async function writeMediaCacheFile(cacheKey: string, data: Buffer, cacheDirectorySetting: string, mediaDirectoryName: string) {
  const safeFileName = `${createHash("sha256").update(cacheKey).digest("hex")}.webp`;
  const cacheDirectory = path.resolve(/*turbopackIgnore: true*/ process.cwd(), cacheDirectorySetting, mediaDirectoryName);
  const cachePath = path.join(cacheDirectory, safeFileName);
  await mkdir(cacheDirectory, { recursive: true });
  await writeFile(/*turbopackIgnore: true*/ cachePath, data);
  return cachePath;
}

function normalizeDimension(value: number | undefined, fallback: number, max = 512) {
  if (!value || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(48, Math.min(max, Math.round(value)));
}

function addDays(isoDate: string, days: number) {
  const date = new Date(isoDate);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}
