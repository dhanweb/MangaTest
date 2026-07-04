import { asc, desc, eq, sql } from "drizzle-orm";

import { bootstrapDatabase, chapters, comics, getDb, localFiles, pages } from "@/modules/core/db";

export interface LibraryComicCardRecord {
  id: string;
  displayTitle: string;
  fileTitle: string;
  status: "readable" | "missing_local_file" | "remote_only" | "hidden" | "deleted";
  primaryLocalFileId: string | null;
  localFileKind: "directory" | "zip" | "cbz" | null;
  pageCount: number;
  chapterCount: number;
  addedAt: string;
}

export interface LibraryComicAdminRowRecord extends LibraryComicCardRecord {
  updatedAt: string;
  primaryLocalPath: string | null;
  isPrimaryFileMissing: boolean;
}

export interface LibraryChapterRecord {
  id: string;
  title: string | null;
  sortOrder: number;
  pageCount: number;
  addedAt: string;
}

export interface LibraryComicDetailRecord {
  id: string;
  displayTitle: string;
  fileTitle: string;
  originalTitle: string | null;
  status: LibraryComicCardRecord["status"];
  primaryLocalFileId: string | null;
  localFileKind: LibraryComicCardRecord["localFileKind"];
  primaryLocalPath: string | null;
  sizeBytes: number | null;
  pageCount: number;
  chapterCount: number;
  addedAt: string;
  updatedAt: string;
  chapters: LibraryChapterRecord[];
}

export interface ReaderPageRecord {
  id: string;
  chapterId: string;
  chapterTitle: string | null;
  pageNumber: number;
  internalPath: string;
}

export interface ReaderComicRecord {
  id: string;
  displayTitle: string;
  lastReadPageId: string | null;
  pages: ReaderPageRecord[];
  chapters: LibraryChapterRecord[];
}

export interface ComicRepository {
  listReadableCards(limit?: number): Promise<LibraryComicCardRecord[]>;
  listAdminRows(limit?: number): Promise<LibraryComicAdminRowRecord[]>;
  getDetail(id: string): Promise<LibraryComicDetailRecord | null>;
  getReaderData(id: string): Promise<ReaderComicRecord | null>;
}

export function createComicRepository(): ComicRepository {
  return {
    async listReadableCards(limit = 48) {
      bootstrapDatabase();
      const db = getDb();

      const rows = db
        .select({
          id: comics.id,
          displayTitle: comics.displayTitle,
          fileTitle: comics.fileTitle,
          status: comics.status,
          primaryLocalFileId: comics.primaryLocalFileId,
          localFileKind: localFiles.kind,
          pageCount: sql<number>`count(distinct ${pages.id})`,
          chapterCount: sql<number>`count(distinct ${chapters.id})`,
          addedAt: comics.createdAt,
        })
        .from(comics)
        .leftJoin(localFiles, eq(localFiles.id, comics.primaryLocalFileId))
        .leftJoin(chapters, eq(chapters.comicId, comics.id))
        .leftJoin(pages, eq(pages.chapterId, chapters.id))
        .where(eq(comics.status, "readable"))
        .groupBy(comics.id)
        .orderBy(desc(comics.createdAt))
        .limit(limit)
        .all();

      return rows.map((row) => ({
        ...row,
        pageCount: Number(row.pageCount),
        chapterCount: Number(row.chapterCount),
      }));
    },

    async listAdminRows(limit = 200) {
      bootstrapDatabase();
      const db = getDb();

      const rows = db
        .select({
          id: comics.id,
          displayTitle: comics.displayTitle,
          fileTitle: comics.fileTitle,
          status: comics.status,
          primaryLocalFileId: comics.primaryLocalFileId,
          localFileKind: localFiles.kind,
          primaryLocalPath: localFiles.absolutePath,
          isPrimaryFileMissing: localFiles.isMissing,
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
        .orderBy(desc(comics.createdAt))
        .limit(limit)
        .all();

      return rows.map((row) => ({
        ...row,
        pageCount: Number(row.pageCount),
        chapterCount: Number(row.chapterCount),
        isPrimaryFileMissing: Boolean(row.isPrimaryFileMissing),
      }));
    },

    async getDetail(id) {
      bootstrapDatabase();
      const db = getDb();

      const row = db
        .select({
          id: comics.id,
          displayTitle: comics.displayTitle,
          fileTitle: comics.fileTitle,
          originalTitle: comics.originalTitle,
          status: comics.status,
          primaryLocalFileId: comics.primaryLocalFileId,
          localFileKind: localFiles.kind,
          primaryLocalPath: localFiles.absolutePath,
          sizeBytes: localFiles.sizeBytes,
          pageCount: sql<number>`count(distinct ${pages.id})`,
          chapterCount: sql<number>`count(distinct ${chapters.id})`,
          addedAt: comics.createdAt,
          updatedAt: comics.updatedAt,
        })
        .from(comics)
        .leftJoin(localFiles, eq(localFiles.id, comics.primaryLocalFileId))
        .leftJoin(chapters, eq(chapters.comicId, comics.id))
        .leftJoin(pages, eq(pages.chapterId, chapters.id))
        .where(eq(comics.id, id))
        .groupBy(comics.id)
        .get();

      if (!row) {
        return null;
      }

      const chapterRows = db
        .select({
          id: chapters.id,
          title: chapters.title,
          sortOrder: chapters.sortOrder,
          pageCount: chapters.pageCount,
          addedAt: chapters.createdAt,
        })
        .from(chapters)
        .where(eq(chapters.comicId, id))
        .orderBy(asc(chapters.sortOrder), asc(chapters.createdAt))
        .all();

      return {
        ...row,
        pageCount: Number(row.pageCount),
        chapterCount: Number(row.chapterCount),
        chapters: chapterRows,
      };
    },

    async getReaderData(id) {
      bootstrapDatabase();
      const db = getDb();
      const comic = db
        .select({
          id: comics.id,
          displayTitle: comics.displayTitle,
          lastReadPageId: comics.lastReadPageId,
        })
        .from(comics)
        .where(eq(comics.id, id))
        .get();

      if (!comic) {
        return null;
      }

      const chapterRows = db
        .select({
          id: chapters.id,
          title: chapters.title,
          sortOrder: chapters.sortOrder,
          pageCount: chapters.pageCount,
          addedAt: chapters.createdAt,
        })
        .from(chapters)
        .where(eq(chapters.comicId, id))
        .orderBy(asc(chapters.sortOrder), asc(chapters.createdAt))
        .all();

      const pageRows = db
        .select({
          id: pages.id,
          chapterId: pages.chapterId,
          chapterTitle: chapters.title,
          pageNumber: pages.pageNumber,
          internalPath: pages.internalPath,
        })
        .from(pages)
        .innerJoin(chapters, eq(chapters.id, pages.chapterId))
        .where(eq(chapters.comicId, id))
        .orderBy(asc(chapters.sortOrder), asc(pages.pageNumber))
        .all();

      return {
        ...comic,
        chapters: chapterRows,
        pages: pageRows,
      };
    },
  };
}
