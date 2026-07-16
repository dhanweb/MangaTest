import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import sharp from "sharp";
import yauzl from "yauzl";

import { bootstrapDatabase, cacheEntries, getDb } from "@/modules/core/db";
import { getRuntimeSettings } from "@/modules/core/settings";

import type { LocalFileKind } from ".";

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".avif"]);
const ARCHIVE_EXTENSIONS = new Set([".zip", ".cbz"]);

const pathCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

export interface LocalComicEntry {
  kind: LocalFileKind;
  absolutePath: string;
  relativePath: string;
  fileTitle: string;
  sizeBytes: number | null;
  mtimeMs: number | null;
  pages: LocalComicPage[];
}

export interface LocalComicPage {
  sourceKind: "filesystem" | "archive";
  internalPath: string;
  archiveIndex: number | null;
  width: number | null;
  height: number | null;
}

/** Staging folder for downloads under a manga root — never treat as a comic title. */
export const DOWNLOAD_IMPORT_DIRECTORY_NAME = "下载入库";

export async function enumerateMangaRootChildren(rootPath: string): Promise<LocalComicEntry[]> {
  const rootStat = await fs.stat(rootPath).catch(() => null);

  if (!rootStat?.isDirectory()) {
    throw new Error("漫画根目录不存在，或不是一个目录。");
  }

  const children = await fs.readdir(rootPath, { withFileTypes: true });
  const entries: LocalComicEntry[] = [];

  for (const child of children.sort(compareDirentsByName)) {
    if (child.name.startsWith(".")) {
      continue;
    }

    // Download landing zone under a library root is not a comic (zip files inside are comics of the dedicated import root).
    if (child.isDirectory() && child.name === DOWNLOAD_IMPORT_DIRECTORY_NAME) {
      continue;
    }

    const absolutePath = path.join(rootPath, child.name);

    if (child.isDirectory()) {
      entries.push(await createDirectoryComicEntry(rootPath, absolutePath));
      continue;
    }

    if (child.isFile() && ARCHIVE_EXTENSIONS.has(path.extname(child.name).toLowerCase())) {
      entries.push(await createArchiveComicEntry(rootPath, absolutePath));
    }
  }

  return entries;
}

async function createDirectoryComicEntry(rootPath: string, absolutePath: string): Promise<LocalComicEntry> {
  const stat = await fs.stat(absolutePath);
  const pages = await enumerateDirectoryPages(absolutePath);

  return {
    kind: "directory",
    absolutePath,
    relativePath: path.relative(rootPath, absolutePath),
    fileTitle: path.basename(absolutePath),
    sizeBytes: null,
    mtimeMs: Math.trunc(stat.mtimeMs),
    pages,
  };
}

async function createArchiveComicEntry(rootPath: string, absolutePath: string): Promise<LocalComicEntry> {
  const stat = await fs.stat(absolutePath);
  const ext = path.extname(absolutePath).toLowerCase();

  return {
    kind: ext === ".cbz" ? "cbz" : "zip",
    absolutePath,
    relativePath: path.relative(rootPath, absolutePath),
    fileTitle: path.basename(absolutePath, ext),
    sizeBytes: stat.size,
    mtimeMs: Math.trunc(stat.mtimeMs),
    pages: await getCachedArchivePages(absolutePath, stat),
  };
}

async function enumerateDirectoryPages(rootPath: string): Promise<LocalComicPage[]> {
  const pages: LocalComicPage[] = [];

  async function visit(directory: string) {
    const children = await fs.readdir(directory, { withFileTypes: true });

    for (const child of children.sort(compareDirentsByName)) {
      if (child.name.startsWith(".") || child.isSymbolicLink()) {
        continue;
      }

      const absolutePath = path.join(directory, child.name);

      if (child.isDirectory()) {
        await visit(absolutePath);
        continue;
      }

      if (child.isFile() && IMAGE_EXTENSIONS.has(path.extname(child.name).toLowerCase())) {
        const dimensions = await readImageDimensions(absolutePath).catch(() => null);
        pages.push({
          sourceKind: "filesystem",
          internalPath: toPortablePath(path.relative(rootPath, absolutePath)),
          archiveIndex: null,
          width: dimensions?.width ?? null,
          height: dimensions?.height ?? null,
        });
      }
    }
  }

  await visit(rootPath);

  return pages.sort((a, b) => pathCollator.compare(a.internalPath, b.internalPath));
}

function enumerateArchivePages(absolutePath: string): Promise<LocalComicPage[]> {
  return new Promise((resolve, reject) => {
    yauzl.open(absolutePath, { lazyEntries: true }, (openError, zipFile) => {
      if (openError) {
        reject(openError);
        return;
      }

      if (!zipFile) {
        resolve([]);
        return;
      }

      const pages: LocalComicPage[] = [];
      let entryIndex = 0;

      function handleEntry(entry: yauzl.Entry) {
        const archiveIndex = entryIndex;
        entryIndex += 1;

        if (!entry.fileName.endsWith("/") && IMAGE_EXTENSIONS.has(path.extname(entry.fileName).toLowerCase())) {
          zipFile.openReadStream(entry, (streamError, stream) => {
            if (streamError || !stream) {
              pages.push({
                sourceKind: "archive",
                internalPath: toPortablePath(entry.fileName),
                archiveIndex,
                width: null,
                height: null,
              });
              zipFile.readEntry();
              return;
            }

            readImageDimensionsFromStream(stream)
              .then((dimensions) => {
                pages.push({
                  sourceKind: "archive",
                  internalPath: toPortablePath(entry.fileName),
                  archiveIndex,
                  width: dimensions?.width ?? null,
                  height: dimensions?.height ?? null,
                });
              })
              .catch(() => {
                pages.push({
                  sourceKind: "archive",
                  internalPath: toPortablePath(entry.fileName),
                  archiveIndex,
                  width: null,
                  height: null,
                });
              })
              .finally(() => {
                zipFile.readEntry();
              });
          });
          return;
        }

        zipFile.readEntry();
      }

      zipFile.readEntry();
      zipFile.on("entry", handleEntry);
      zipFile.once("error", reject);
      zipFile.once("end", () => {
        resolve(pages.sort((a, b) => pathCollator.compare(a.internalPath, b.internalPath)));
      });
    });
  });
}

async function getCachedArchivePages(absolutePath: string, stat: { size: number; mtimeMs: number }) {
  bootstrapDatabase();

  const db = getDb();
  const now = new Date().toISOString();
  const cacheKey = createArchiveFileListCacheKey(absolutePath, stat);
  const cached = db.select().from(cacheEntries).where(eq(cacheEntries.cacheKey, cacheKey)).get();

  if (cached?.metadataJson) {
    const pages = parseCachedArchivePages(cached.metadataJson);
    if (pages) {
      db.update(cacheEntries)
        .set({
          lastAccessAt: now,
          updatedAt: now,
        })
        .where(eq(cacheEntries.id, cached.id))
        .run();

      return pages;
    }
  }

  const pages = await enumerateArchivePages(absolutePath);
  const metadataJson = JSON.stringify({ pages });
  const runtimeSettings = await getRuntimeSettings();

  db.insert(cacheEntries)
    .values({
      id: cached?.id ?? randomUUID(),
      kind: "archive_file_list",
      cacheKey,
      metadataJson,
      sizeBytes: Buffer.byteLength(metadataJson),
      lastAccessAt: now,
      expiresAt: addDays(now, runtimeSettings.readerThumbnailTtlDays),
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: cacheEntries.cacheKey,
      set: {
        metadataJson,
        sizeBytes: Buffer.byteLength(metadataJson),
        lastAccessAt: now,
        expiresAt: addDays(now, runtimeSettings.readerThumbnailTtlDays),
        updatedAt: now,
      },
    })
    .run();

  return pages;
}

function createArchiveFileListCacheKey(absolutePath: string, stat: { size: number; mtimeMs: number }) {
  return `archive_file_list:${path.resolve(absolutePath)}:${Math.trunc(stat.mtimeMs)}:${stat.size}`;
}

function parseCachedArchivePages(metadataJson: string) {
  try {
    const parsed = JSON.parse(metadataJson) as { pages?: unknown[] };
    if (!Array.isArray(parsed.pages)) {
      return null;
    }

    const pages = parsed.pages.filter(isCachedArchivePage);
    if (pages.some((page) => !("width" in page) || !("height" in page))) {
      return null;
    }

    return pages.map((page) => ({
      sourceKind: "archive" as const,
      internalPath: page.internalPath,
      archiveIndex: page.archiveIndex,
      width: typeof page.width === "number" ? page.width : null,
      height: typeof page.height === "number" ? page.height : null,
    }));
  } catch {
    return null;
  }
}

function isCachedArchivePage(page: unknown): page is LocalComicPage {
  return (
    typeof page === "object" &&
    page !== null &&
    (page as LocalComicPage).sourceKind === "archive" &&
    typeof (page as LocalComicPage).internalPath === "string" &&
    ((typeof (page as LocalComicPage).archiveIndex === "number") ||
      (page as LocalComicPage).archiveIndex === null)
  );
}

function compareDirentsByName(a: { name: string }, b: { name: string }) {
  return pathCollator.compare(a.name, b.name);
}

async function readImageDimensions(filePath: string): Promise<{ width: number; height: number } | null> {
  const metadata = await sharp(filePath).metadata();
  if (metadata.width && metadata.height) {
    return { width: metadata.width, height: metadata.height };
  }
  return null;
}

async function readImageDimensionsFromStream(stream: NodeJS.ReadableStream): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let settled = false;

    const finish = (result: { width: number; height: number } | null) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(result);
    };

    stream.on("data", (chunk: Buffer) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    stream.on("end", async () => {
      try {
        const buffer = Buffer.concat(chunks);
        const metadata = await sharp(buffer).metadata();
        if (metadata.width && metadata.height) {
          finish({ width: metadata.width, height: metadata.height });
        } else {
          finish(null);
        }
      } catch {
        finish(null);
      }
    });
    stream.on("error", () => finish(null));
  });
}

function toPortablePath(input: string) {
  return input.split(path.sep).join("/");
}

function addDays(isoDate: string, days: number) {
  const date = new Date(isoDate);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}
