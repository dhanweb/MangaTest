import fs from "node:fs/promises";
import path from "node:path";

import yauzl from "yauzl";

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
}

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
    pages: await enumerateArchivePages(absolutePath),
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
        pages.push({
          sourceKind: "filesystem",
          internalPath: toPortablePath(path.relative(rootPath, absolutePath)),
          archiveIndex: null,
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

      zipFile.readEntry();
      zipFile.on("entry", (entry) => {
        const archiveIndex = entryIndex;
        entryIndex += 1;

        if (!entry.fileName.endsWith("/") && IMAGE_EXTENSIONS.has(path.extname(entry.fileName).toLowerCase())) {
          pages.push({
            sourceKind: "archive",
            internalPath: toPortablePath(entry.fileName),
            archiveIndex,
          });
        }

        zipFile.readEntry();
      });
      zipFile.once("error", reject);
      zipFile.once("end", () => {
        resolve(pages.sort((a, b) => pathCollator.compare(a.internalPath, b.internalPath)));
      });
    });
  });
}

function compareDirentsByName(a: { name: string }, b: { name: string }) {
  return pathCollator.compare(a.name, b.name);
}

function toPortablePath(input: string) {
  return input.split(path.sep).join("/");
}
