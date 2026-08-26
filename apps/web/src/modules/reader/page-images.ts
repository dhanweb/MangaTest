import { readFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

import { and, eq } from "drizzle-orm";
import yauzl from "yauzl";

import { bootstrapDatabase, chapters, comics, getDb, localFiles, pages } from "@/modules/core/db";
import { createRootLocationService } from "@/modules/local-files";
import { parsePortableRelativePath, resolvePortableChild } from "@/modules/local-files/portable-relative-path";

const IMAGE_CONTENT_TYPES = new Map([
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
  [".gif", "image/gif"],
  [".bmp", "image/bmp"],
  [".avif", "image/avif"],
]);

export interface ReaderPageImage {
  data: Buffer;
  contentType: string;
  fileName: string;
}

export async function readReaderPageImage(pageId: string): Promise<ReaderPageImage | null> {
  bootstrapDatabase();

  const db = getDb();
  const page = db
    .select({
      id: pages.id,
      sourceKind: pages.sourceKind,
      internalPath: pages.internalPath,
      localFileKind: localFiles.kind,
      mangaRootId: localFiles.mangaRootId,
      localFileRelativePath: localFiles.relativePath,
      isMissing: localFiles.isMissing,
    })
    .from(pages)
    .innerJoin(localFiles, eq(localFiles.id, pages.localFileId))
    .innerJoin(chapters, eq(chapters.id, pages.chapterId))
    .innerJoin(comics, eq(comics.id, chapters.comicId))
    .where(and(eq(pages.id, pageId), eq(comics.status, "readable")))
    .get();

  if (!page || page.isMissing) {
    return null;
  }

  const contentType = getImageContentType(page.internalPath);
  if (!contentType) {
    return null;
  }

  if (!page.mangaRootId) {
    return null;
  }

  const localFilePath = await createRootLocationService()
    .resolveMangaFile(page.mangaRootId, page.localFileRelativePath)
    .catch(() => null);
  if (!localFilePath) {
    return null;
  }

  if (page.sourceKind === "filesystem" && page.localFileKind === "directory") {
    const imagePath = resolveSafeChildPath(localFilePath, page.internalPath);
    if (!imagePath) {
      return null;
    }

    const data = await readFile(/*turbopackIgnore: true*/ imagePath).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT" || error.code === "ENOTDIR") {
        return null;
      }

      throw error;
    });

    return data ? { data, contentType, fileName: path.basename(page.internalPath) } : null;
  }

  if (page.sourceKind === "archive" && (page.localFileKind === "zip" || page.localFileKind === "cbz")) {
    const data = await readArchiveEntry(localFilePath, page.internalPath);
    return data ? { data, contentType, fileName: path.basename(page.internalPath) } : null;
  }

  return null;
}

function resolveSafeChildPath(rootPath: string, internalPath: string) {
  try {
    return resolvePortableChild(rootPath, parsePortableRelativePath(internalPath.replaceAll("\\", "/")));
  } catch {
    return null;
  }
}

function readArchiveEntry(archivePath: string, internalPath: string): Promise<Buffer | null> {
  const portableInternalPath = toPortablePath(internalPath);

  return new Promise((resolve, reject) => {
    yauzl.open(/*turbopackIgnore: true*/ archivePath, { lazyEntries: true }, (openError, zipFile) => {
      if (openError) {
        reject(openError);
        return;
      }

      if (!zipFile) {
        resolve(null);
        return;
      }

      let settled = false;

      function finish(value: Buffer | null) {
        if (settled) {
          return;
        }

        settled = true;
        zipFile?.close();
        resolve(value);
      }

      zipFile.once("error", (error) => {
        if (settled) {
          return;
        }

        settled = true;
        reject(error);
      });

      zipFile.on("entry", (entry) => {
        if (entry.fileName.endsWith("/") || toPortablePath(entry.fileName) !== portableInternalPath) {
          zipFile.readEntry();
          return;
        }

        zipFile.openReadStream(entry, (streamError, stream) => {
          if (streamError) {
            reject(streamError);
            return;
          }

          if (!stream) {
            finish(null);
            return;
          }

          readStreamToBuffer(stream).then(finish, reject);
        });
      });

      zipFile.once("end", () => finish(null));
      zipFile.readEntry();
    });
  });
}

function readStreamToBuffer(stream: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    stream.once("error", reject);
    stream.once("end", () => resolve(Buffer.concat(chunks)));
  });
}

function getImageContentType(filePath: string) {
  return IMAGE_CONTENT_TYPES.get(path.extname(filePath).toLowerCase()) ?? null;
}

function toPortablePath(input: string) {
  return input.replaceAll("\\", "/");
}
