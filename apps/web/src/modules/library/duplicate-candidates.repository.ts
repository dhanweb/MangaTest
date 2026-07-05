import { asc, desc, eq, sql } from "drizzle-orm";

import { bootstrapDatabase, chapters, comics, getDb, localFiles, pages } from "@/modules/core/db";

export interface DuplicateCandidateComicRecord {
  id: string;
  displayTitle: string;
  fileTitle: string;
  status: "readable" | "missing_local_file" | "remote_only" | "hidden" | "deleted";
  primaryLocalPath: string | null;
  pageCount: number;
  chapterCount: number;
  addedAt: string;
  updatedAt: string;
}

export interface DuplicateCandidateGroupRecord {
  sortTitle: string;
  totalCount: number;
  readableCount: number;
  candidates: DuplicateCandidateComicRecord[];
}

export interface DuplicateCandidateRepository {
  listGroups(limit?: number): Promise<DuplicateCandidateGroupRecord[]>;
}

export function createDuplicateCandidateRepository(): DuplicateCandidateRepository {
  return {
    async listGroups(limit = 100) {
      bootstrapDatabase();

      const db = getDb();
      const rows = db
        .select({
          id: comics.id,
          displayTitle: comics.displayTitle,
          fileTitle: comics.fileTitle,
          sortTitle: comics.sortTitle,
          status: comics.status,
          primaryLocalPath: localFiles.absolutePath,
          pageCount: sql<number>`count(distinct ${pages.id})`,
          chapterCount: sql<number>`count(distinct ${chapters.id})`,
          addedAt: comics.createdAt,
          updatedAt: comics.updatedAt,
        })
        .from(comics)
        .leftJoin(localFiles, eq(localFiles.id, comics.primaryLocalFileId))
        .leftJoin(chapters, eq(chapters.comicId, comics.id))
        .leftJoin(pages, eq(pages.chapterId, chapters.id))
        .groupBy(comics.id)
        .orderBy(asc(comics.sortTitle), desc(comics.createdAt))
        .all();
      const bySortTitle = new Map<string, DuplicateCandidateComicRecord[]>();

      for (const row of rows) {
        const candidates = bySortTitle.get(row.sortTitle) ?? [];
        candidates.push({
          id: row.id,
          displayTitle: row.displayTitle,
          fileTitle: row.fileTitle,
          status: row.status,
          primaryLocalPath: row.primaryLocalPath,
          pageCount: Number(row.pageCount),
          chapterCount: Number(row.chapterCount),
          addedAt: row.addedAt,
          updatedAt: row.updatedAt,
        });
        bySortTitle.set(row.sortTitle, candidates);
      }

      return [...bySortTitle.entries()]
        .filter(([, candidates]) => candidates.length > 1)
        .map(([sortTitle, candidates]) => ({
          sortTitle,
          totalCount: candidates.length,
          readableCount: candidates.filter((candidate) => candidate.status === "readable").length,
          candidates,
        }))
        .sort((left, right) => right.totalCount - left.totalCount || left.sortTitle.localeCompare(right.sortTitle))
        .slice(0, limit);
    },
  };
}
