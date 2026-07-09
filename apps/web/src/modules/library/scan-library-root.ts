import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { bootstrapDatabase, chapters, comics, getDb, localFiles, mangaRoots, pages, scanSessions } from "@/modules/core/db";
import { enumerateMangaRootChildren } from "@/modules/local-files";
import { normalizeSortTitle } from "@/modules/library/title-utils";

export interface LibraryScanResult {
  sessionId: string;
  addedCount: number;
  missingCount: number;
  duplicateCandidateCount: number;
  recoverableCount: number;
  pageCount: number;
}

export async function scanMangaRoot(mangaRootId: string): Promise<LibraryScanResult> {
  bootstrapDatabase();

  const db = getDb();
  const startedAt = new Date().toISOString();
  const sessionId = randomUUID();

  db.insert(scanSessions)
    .values({
      id: sessionId,
      mangaRootId,
      status: "running",
      startedAt,
    })
    .run();

  try {
    const root = db.select().from(mangaRoots).where(eq(mangaRoots.id, mangaRootId)).get();

    if (!root) {
      throw new Error("找不到要扫描的漫画根目录。");
    }

    if (!root.isEnabled) {
      throw new Error("这个漫画根目录已停用。");
    }

    const entries = await enumerateMangaRootChildren(root.absolutePath);
    const scannedPaths = new Set(entries.map((entry) => entry.relativePath));
    const now = new Date().toISOString();

    const result = db.transaction((tx) => {
      let addedCount = 0;
      let missingCount = 0;
      let duplicateCandidateCount = 0;
      let recoverableCount = 0;
      let pageCount = 0;

      const existingFiles = tx.select().from(localFiles).where(eq(localFiles.mangaRootId, mangaRootId)).all();

      for (const file of existingFiles) {
        if (!scannedPaths.has(file.relativePath) && !file.isMissing) {
          missingCount += 1;
          tx.update(localFiles)
            .set({
              isMissing: true,
              missingSince: now,
              updatedAt: now,
            })
            .where(eq(localFiles.id, file.id))
            .run();
        }

        if (scannedPaths.has(file.relativePath) && file.isMissing) {
          tx.update(localFiles)
            .set({
              isMissing: false,
              missingSince: null,
              isIgnored: false,
              ignoredAt: null,
              updatedAt: now,
            })
            .where(eq(localFiles.id, file.id))
            .run();
        }
      }

      for (const entry of entries) {
        const existingLocalFile = tx
          .select()
          .from(localFiles)
          .where(and(eq(localFiles.mangaRootId, mangaRootId), eq(localFiles.relativePath, entry.relativePath)))
          .get();

        if (existingLocalFile) {
          continue;
        }

        const sortTitle = normalizeSortTitle(entry.fileTitle);
        const duplicateComic = tx.select().from(comics).where(eq(comics.sortTitle, sortTitle)).get();

        if (duplicateComic) {
          duplicateCandidateCount += 1;
          if (duplicateComic.status === "hidden" || duplicateComic.status === "deleted") {
            recoverableCount += 1;
          }
        }

        const comicId = randomUUID();
        const localFileId = randomUUID();
        const chapterId = randomUUID();

        tx.insert(comics)
          .values({
            id: comicId,
            displayTitle: entry.fileTitle,
            fileTitle: entry.fileTitle,
            sortTitle,
            status: "readable",
            primaryLocalFileId: localFileId,
          })
          .run();

        tx.insert(localFiles)
          .values({
            id: localFileId,
            comicId,
            mangaRootId,
            kind: entry.kind,
            absolutePath: entry.absolutePath,
            relativePath: entry.relativePath,
            sizeBytes: entry.sizeBytes,
            mtimeMs: entry.mtimeMs,
            isPrimary: true,
            isMissing: false,
          })
          .run();

        tx.insert(chapters)
          .values({
            id: chapterId,
            comicId,
            localFileId,
            title: null,
            sortOrder: 0,
            pageCount: entry.pages.length,
          })
          .run();

        if (entry.pages.length) {
          tx.insert(pages)
            .values(
              entry.pages.map((page, index) => ({
                id: randomUUID(),
                chapterId,
                localFileId,
                pageNumber: index + 1,
                sourceKind: page.sourceKind,
                internalPath: page.internalPath,
                archiveIndex: page.archiveIndex,
                width: page.width,
                height: page.height,
              })),
            )
            .run();
        }

        addedCount += 1;
        pageCount += entry.pages.length;
      }

      tx.update(scanSessions)
        .set({
          status: "completed",
          finishedAt: now,
          addedCount,
          missingCount,
          duplicateCandidateCount,
          recoverableCount,
          updatedAt: now,
        })
        .where(eq(scanSessions.id, sessionId))
        .run();

      tx.update(mangaRoots)
        .set({
          lastScanSessionId: sessionId,
          updatedAt: now,
        })
        .where(eq(mangaRoots.id, mangaRootId))
        .run();

      return {
        sessionId,
        addedCount,
        missingCount,
        duplicateCandidateCount,
        recoverableCount,
        pageCount,
      };
    });

    return result;
  } catch (error) {
    const finishedAt = new Date().toISOString();

    db.update(scanSessions)
      .set({
        status: "failed",
        finishedAt,
        errorSummary: error instanceof Error ? error.message : "扫描失败。",
        updatedAt: finishedAt,
      })
      .where(eq(scanSessions.id, sessionId))
      .run();

    throw error;
  }
}
