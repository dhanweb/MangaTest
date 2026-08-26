import { randomUUID } from "node:crypto";

import { and, asc, eq, max } from "drizzle-orm";

import {
  bootstrapDatabase,
  chapters,
  comicResources,
  comicSources,
  comicTags,
  comics,
  getDb,
  localFiles,
  mangaRoots,
  operationLogs,
  pages,
  readingProgress,
  scanSessions,
} from "@/modules/core/db";
import { detectCurrentRuntimeEnvironment } from "@/modules/core/runtime-paths";
import {
  DOWNLOAD_IMPORT_DIRECTORY_NAME,
  createMangaRootLocationRepository,
  createRootLocationService,
  enumerateMangaRootChildren,
} from "@/modules/local-files";
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

    const runtimeProfile = detectCurrentRuntimeEnvironment().profile;
    const locationRepository = createMangaRootLocationRepository();
    if (!locationRepository.getForProfile(mangaRootId, runtimeProfile)) {
      // Roots created by older versions (or direct maintenance tooling) only
      // have the legacy path. Backfill the current profile before scanning;
      // a missing configured location remains visible as unconfigured to the
      // location service and admin workflow.
      locationRepository.upsert({
        mangaRootId,
        runtimeProfile,
        absolutePath: root.absolutePath,
      });
    }

    const rootLocation = await createRootLocationService().resolveMangaRoot(mangaRootId);
    if (rootLocation.status !== "available") {
      throw new Error(
        rootLocation.status === "unconfigured"
          ? "当前运行环境没有配置漫画根目录位置。"
          : rootLocation.reason,
      );
    }

    const entries = await enumerateMangaRootChildren(rootLocation.absolutePath, { cacheIdentity: mangaRootId });
    const scannedPaths = new Set<string>(entries.map((entry) => entry.relativePath));
    const now = new Date().toISOString();

    const result = db.transaction((tx) => {
      let addedCount = 0;
      let missingCount = 0;
      let duplicateCandidateCount = 0;
      let recoverableCount = 0;
      let pageCount = 0;

      const existingFiles = tx.select().from(localFiles).where(eq(localFiles.mangaRootId, mangaRootId)).all();

      for (const file of existingFiles) {
        // Retire mistaken "下载入库" directory comics (staging folder is not a comic).
        const baseName = file.relativePath.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? "";
        if (baseName === DOWNLOAD_IMPORT_DIRECTORY_NAME || file.relativePath === DOWNLOAD_IMPORT_DIRECTORY_NAME) {
          tx.update(localFiles)
            .set({
              isMissing: true,
              missingSince: file.missingSince ?? now,
              isIgnored: true,
              ignoredAt: file.ignoredAt ?? now,
              updatedAt: now,
            })
            .where(eq(localFiles.id, file.id))
            .run();
          if (file.comicId) {
            tx.update(comics)
              .set({
                status: "deleted",
                updatedAt: now,
              })
              .where(eq(comics.id, file.comicId))
              .run();
          }
          continue;
        }

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
        const sortTitle = normalizeSortTitle(entry.fileTitle);
        const existingLocalFile = tx
          .select()
          .from(localFiles)
          .where(and(eq(localFiles.mangaRootId, mangaRootId), eq(localFiles.relativePath, entry.relativePath)))
          .get();

        const comicCandidates = tx
          .select({
            id: comics.id,
            status: comics.status,
            primaryLocalFileId: comics.primaryLocalFileId,
            primaryLocalFileMissing: localFiles.isMissing,
            parentComicId: comics.parentComicId,
            mergedAsChapterId: comics.mergedAsChapterId,
            createdAt: comics.createdAt,
          })
          .from(comics)
          .leftJoin(localFiles, eq(localFiles.id, comics.primaryLocalFileId))
          .where(eq(comics.sortTitle, sortTitle))
          .orderBy(asc(comics.createdAt))
          .all();
        const activeCandidates = comicCandidates.filter(
          (candidate) =>
            (candidate.status === "readable" || candidate.status === "missing_local_file" || candidate.status === "remote_only") &&
            !candidate.parentComicId &&
            !candidate.mergedAsChapterId,
        );
        const matchedComic = [...activeCandidates].sort((left, right) => {
          const priority = (candidate: (typeof activeCandidates)[number]) => {
            if (candidate.status === "remote_only" && !candidate.primaryLocalFileId) return 0;
            if (candidate.primaryLocalFileId && !candidate.primaryLocalFileMissing) return 1;
            if (candidate.primaryLocalFileId) return 2;
            return 3;
          };

          return priority(left) - priority(right) || left.createdAt.localeCompare(right.createdAt);
        })[0];

        const hasDifferentMatchedComic = Boolean(existingLocalFile && matchedComic && matchedComic.id !== existingLocalFile.comicId);
        if (comicCandidates.length > 0 && (!existingLocalFile || hasDifferentMatchedComic)) {
          duplicateCandidateCount += 1;
          if (comicCandidates.some((candidate) => candidate.status === "hidden" || candidate.status === "deleted")) {
            recoverableCount += 1;
          }
        }

        if (existingLocalFile) {
          tx.update(localFiles)
            .set({
              absolutePath: entry.absolutePath,
              sizeBytes: entry.sizeBytes,
              mtimeMs: entry.mtimeMs,
              isMissing: false,
              missingSince: null,
              isIgnored: false,
              ignoredAt: null,
              updatedAt: now,
            })
            .where(eq(localFiles.id, existingLocalFile.id))
            .run();

          if (
            existingLocalFile.comicId &&
            matchedComic &&
            matchedComic.id !== existingLocalFile.comicId &&
            matchedComic.status === "remote_only" &&
            !matchedComic.primaryLocalFileId
          ) {
            const existingComic = tx
              .select({
                id: comics.id,
                status: comics.status,
                primaryLocalFileId: comics.primaryLocalFileId,
                parentComicId: comics.parentComicId,
                mergedAsChapterId: comics.mergedAsChapterId,
                lastReadPageId: comics.lastReadPageId,
              })
              .from(comics)
              .where(eq(comics.id, existingLocalFile.comicId))
              .get();
            const existingFileCount = tx
              .select({ id: localFiles.id })
              .from(localFiles)
              .where(eq(localFiles.comicId, existingLocalFile.comicId))
              .all().length;
            const existingChapterCount = tx
              .select({ id: chapters.id })
              .from(chapters)
              .where(eq(chapters.comicId, existingLocalFile.comicId))
              .all().length;
            const hasMetadata = Boolean(
              tx.select({ id: comicSources.id }).from(comicSources).where(eq(comicSources.comicId, existingLocalFile.comicId)).get() ||
                tx.select({ id: comicResources.id }).from(comicResources).where(eq(comicResources.comicId, existingLocalFile.comicId)).get() ||
                tx.select({ id: comicTags.comicId }).from(comicTags).where(eq(comicTags.comicId, existingLocalFile.comicId)).get() ||
                tx.select({ id: readingProgress.id }).from(readingProgress).where(eq(readingProgress.comicId, existingLocalFile.comicId)).get(),
            );

            if (
              existingComic &&
              (existingComic.status === "readable" || existingComic.status === "missing_local_file") &&
              !existingComic.parentComicId &&
              !existingComic.mergedAsChapterId &&
              !existingComic.lastReadPageId &&
              existingFileCount === 1 &&
              existingChapterCount === 1 &&
              !hasMetadata
            ) {
              tx.update(localFiles)
                .set({
                  comicId: matchedComic.id,
                  isPrimary: true,
                  updatedAt: now,
                })
                .where(eq(localFiles.id, existingLocalFile.id))
                .run();
              tx.update(chapters)
                .set({
                  comicId: matchedComic.id,
                  updatedAt: now,
                })
                .where(eq(chapters.comicId, existingLocalFile.comicId))
                .run();
              tx.update(comics)
                .set({
                  status: "readable",
                  primaryLocalFileId: existingLocalFile.id,
                  updatedAt: now,
                })
                .where(eq(comics.id, matchedComic.id))
                .run();
              tx.update(comics)
                .set({
                  status: "deleted",
                  primaryLocalFileId: null,
                  deletedAt: now,
                  updatedAt: now,
                })
                .where(eq(comics.id, existingLocalFile.comicId))
                .run();
              tx.insert(operationLogs)
                .values({
                  id: randomUUID(),
                  operation: "soft_delete",
                  targetType: "comic",
                  targetId: existingLocalFile.comicId,
                  summary: `扫描时收敛重复漫画记录：${entry.fileTitle}`,
                  detailJson: JSON.stringify({
                    sourceComicId: existingLocalFile.comicId,
                    targetComicId: matchedComic.id,
                    relativePath: entry.relativePath,
                    physicalFilesTouched: false,
                  }),
                  createdAt: now,
                })
                .run();
            }
          }

          continue;
        }

        const comicId = matchedComic?.id ?? randomUUID();
        const localFileId = randomUUID();
        const chapterId = randomUUID();
        const shouldBecomePrimary = !matchedComic?.primaryLocalFileId || Boolean(matchedComic.primaryLocalFileMissing);
        const nextSortOrder = matchedComic
          ? Number(tx.select({ value: max(chapters.sortOrder) }).from(chapters).where(eq(chapters.comicId, matchedComic.id)).get()?.value ?? -1) + 1
          : 0;

        if (matchedComic) {
          tx.update(comics)
            .set({
              status: "readable",
              primaryLocalFileId: shouldBecomePrimary ? localFileId : matchedComic.primaryLocalFileId,
              updatedAt: now,
            })
            .where(eq(comics.id, matchedComic.id))
            .run();
        } else {
          tx.insert(comics)
            .values({
              id: comicId,
              displayTitle: entry.fileTitle,
              displayTitleSource: "scan",
              fileTitle: entry.fileTitle,
              sortTitle,
              status: "readable",
              primaryLocalFileId: localFileId,
            })
            .run();
        }

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
            isPrimary: shouldBecomePrimary,
            isMissing: false,
          })
          .run();

        tx.insert(chapters)
          .values({
            id: chapterId,
            comicId,
            localFileId,
            title: null,
            sortOrder: nextSortOrder,
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
