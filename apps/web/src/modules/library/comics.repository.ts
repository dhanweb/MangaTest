import { and, asc, desc, eq, like, or, sql } from "drizzle-orm";

import { bootstrapDatabase, chapters, comicTags, comics, getDb, localFiles, pages, tags } from "@/modules/core/db";

export interface LibraryComicCardRecord {
  id: string;
  displayTitle: string;
  fileTitle: string;
  authorNames: string[];
  status: "readable" | "missing_local_file" | "remote_only" | "hidden" | "deleted";
  primaryLocalFileId: string | null;
  localFileKind: "directory" | "zip" | "cbz" | null;
  pageCount: number;
  chapterCount: number;
  addedAt: string;
}

export interface LibraryTagFilterRecord {
  id: string;
  namespace: string;
  canonical: string;
  label: string;
  comicCount: number;
}

export type LibraryComicSortMode = "recent" | "title" | "pages";

export interface LibraryComicSearchInput {
  query?: string;
  sort?: LibraryComicSortMode;
  tags?: string[];
  page?: number;
  pageSize?: number;
}

export interface LibraryComicSearchResult {
  items: LibraryComicCardRecord[];
  page: number;
  pageSize: number;
  total: number;
}

export interface LibraryComicAdminRowRecord extends LibraryComicCardRecord {
  updatedAt: string;
  metadataQueryTitle: string | null;
  originalTitle: string | null;
  primaryLocalPath: string | null;
  isPrimaryFileMissing: boolean;
  parentComicId: string | null;
  mergedAsChapterId: string | null;
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
  metadataQueryTitle: string | null;
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
  authorNames: string[];
  tags: LibraryComicTagRecord[];
}

export interface LibraryComicTagRecord {
  id: string;
  namespace: string;
  name: string;
  canonical: string;
  displayNameZh: string | null;
  source: "scan" | "metadata" | "manual";
  isUserEdited: boolean;
}

export interface ReaderPageRecord {
  id: string;
  chapterId: string;
  chapterTitle: string | null;
  pageNumber: number;
  width: number | null;
  height: number | null;
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
  searchReadableCards(input?: LibraryComicSearchInput): Promise<LibraryComicSearchResult>;
  listReadableTagFilters(limit?: number): Promise<LibraryTagFilterRecord[]>;
  listAdminRows(limit?: number): Promise<LibraryComicAdminRowRecord[]>;
  getDetail(id: string): Promise<LibraryComicDetailRecord | null>;
  getReaderData(id: string): Promise<ReaderComicRecord | null>;
}

export function createComicRepository(): ComicRepository {
  return {
    async listReadableCards(limit = 48) {
      const result = await this.searchReadableCards({ pageSize: limit });
      return result.items;
    },

    async searchReadableCards(input = {}) {
      bootstrapDatabase();
      const db = getDb();
      const requestedPage =
        typeof input.page === "number" && Number.isFinite(input.page) ? Math.max(1, Math.trunc(input.page)) : 1;
      const pageSize = Math.max(12, Math.min(96, Math.trunc(input.pageSize ?? 48)));
      const query = input.query?.trim();
      const selectedTags = normalizeSelectedTags(input.tags);
      const baseWhere = and(
        eq(comics.status, "readable"),
        eq(localFiles.isMissing, false),
        // Staging folder "下载入库" is never a library comic.
        sql`${comics.fileTitle} != '下载入库'`,
        sql`${comics.displayTitle} != '下载入库'`,
      );
      const queryWhere = query
        ? or(
            like(comics.displayTitle, `%${query}%`),
            like(comics.fileTitle, `%${query}%`),
            like(comics.metadataQueryTitle, `%${query}%`),
            like(comics.originalTitle, `%${query}%`),
            like(tags.canonical, `%${query.toLocaleLowerCase()}%`),
            like(tags.name, `%${query.toLocaleLowerCase()}%`),
            like(tags.displayNameZh, `%${query}%`),
          )
        : undefined;
      const selectedTagWhere = selectedTags.map(
        (canonical) => sql`exists (
          select 1
          from comic_tags selected_comic_tags
          inner join tags selected_tags on selected_tags.id = selected_comic_tags.tag_id
          where selected_comic_tags.comic_id = ${comics.id}
            and selected_tags.canonical = ${canonical}
        )`,
      );
      const whereClause = and(baseWhere, queryWhere, ...selectedTagWhere);
      const pageCountSql = sql<number>`count(distinct ${pages.id})`;
      const authorNamesSql = comicAuthorNamesSql();
      const sort = input.sort ?? "recent";
      const orderBy =
        sort === "title"
          ? [asc(comics.sortTitle), desc(comics.createdAt)]
          : sort === "pages"
            ? [desc(pageCountSql), desc(comics.createdAt)]
            : [desc(comics.createdAt)];

      const totalRow = db
        .select({ count: sql<number>`count(distinct ${comics.id})` })
        .from(comics)
        .leftJoin(localFiles, eq(localFiles.id, comics.primaryLocalFileId))
        .leftJoin(comicTags, eq(comicTags.comicId, comics.id))
        .leftJoin(tags, eq(tags.id, comicTags.tagId))
        .where(whereClause)
        .get();
      const total = Number(totalRow?.count ?? 0);
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const page = Math.min(requestedPage, totalPages);

      const rows = db
        .select({
          id: comics.id,
          displayTitle: comics.displayTitle,
          fileTitle: comics.fileTitle,
          authorNames: authorNamesSql,
          status: comics.status,
          primaryLocalFileId: comics.primaryLocalFileId,
          localFileKind: localFiles.kind,
          pageCount: pageCountSql,
          chapterCount: sql<number>`count(distinct ${chapters.id})`,
          addedAt: comics.createdAt,
        })
        .from(comics)
        .leftJoin(localFiles, eq(localFiles.id, comics.primaryLocalFileId))
        .leftJoin(chapters, eq(chapters.comicId, comics.id))
        .leftJoin(pages, eq(pages.chapterId, chapters.id))
        .leftJoin(comicTags, eq(comicTags.comicId, comics.id))
        .leftJoin(tags, eq(tags.id, comicTags.tagId))
        .where(whereClause)
        .groupBy(comics.id)
        .orderBy(...orderBy)
        .limit(pageSize)
        .offset((page - 1) * pageSize)
        .all();
      return {
        items: rows.map((row) => ({
          ...row,
          authorNames: parseAuthorNames(row.authorNames),
          pageCount: Number(row.pageCount),
          chapterCount: Number(row.chapterCount),
        })),
        page,
        pageSize,
        total,
      };
    },

    async listReadableTagFilters(limit = 24) {
      bootstrapDatabase();
      const db = getDb();
      const comicCountSql = sql<number>`count(distinct ${comicTags.comicId})`;
      const rows = db
        .select({
          id: tags.id,
          namespace: tags.namespace,
          canonical: tags.canonical,
          label: sql<string>`coalesce(${tags.displayNameZh}, ${tags.name}, ${tags.canonical})`,
          comicCount: comicCountSql,
        })
        .from(tags)
        .innerJoin(comicTags, eq(comicTags.tagId, tags.id))
        .innerJoin(comics, eq(comics.id, comicTags.comicId))
        .innerJoin(localFiles, eq(localFiles.id, comics.primaryLocalFileId))
        .where(and(eq(comics.status, "readable"), eq(localFiles.isMissing, false)))
        .groupBy(tags.id)
        .orderBy(desc(comicCountSql), asc(tags.namespace), asc(tags.name))
        .limit(limit)
        .all();

      return rows.map((row) => ({
        ...row,
        comicCount: Number(row.comicCount),
      }));
    },

    async listAdminRows(limit = 200, options?: { includeDeleted?: boolean }) {
      bootstrapDatabase();
      const db = getDb();
      // Soft-deleted stay in DB for recovery but are excluded by default.
      // Also never list the download-staging folder as a comic (special system directory).
      const notStagingFolderComic = and(
        sql`${comics.fileTitle} != '下载入库'`,
        sql`${comics.displayTitle} != '下载入库'`,
        sql`coalesce(${localFiles.relativePath}, '') != '下载入库'`,
        sql`coalesce(${localFiles.relativePath}, '') not like '%\\下载入库'`,
        sql`coalesce(${localFiles.relativePath}, '') not like '%/下载入库'`,
      );
      const whereClause = options?.includeDeleted
        ? notStagingFolderComic
        : and(sql`${comics.status} != 'deleted'`, notStagingFolderComic);

      const rows = db
        .select({
          id: comics.id,
          displayTitle: comics.displayTitle,
          fileTitle: comics.fileTitle,
          authorNames: comicAuthorNamesSql(),
          metadataQueryTitle: comics.metadataQueryTitle,
          originalTitle: comics.originalTitle,
          status: comics.status,
          primaryLocalFileId: comics.primaryLocalFileId,
          parentComicId: comics.parentComicId,
          mergedAsChapterId: comics.mergedAsChapterId,
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
        .where(whereClause)
        .groupBy(comics.id)
        .orderBy(desc(comics.createdAt))
        .limit(limit)
        .all();

      return rows.map((row) => ({
        ...row,
        authorNames: parseAuthorNames(row.authorNames),
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
          authorNames: comicAuthorNamesSql(),
          metadataQueryTitle: comics.metadataQueryTitle,
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

      const tagRows = db
        .select({
          id: tags.id,
          namespace: tags.namespace,
          name: tags.name,
          canonical: tags.canonical,
          displayNameZh: tags.displayNameZh,
          source: comicTags.source,
          isUserEdited: comicTags.isUserEdited,
        })
        .from(comicTags)
        .innerJoin(tags, eq(tags.id, comicTags.tagId))
        .where(eq(comicTags.comicId, id))
        .orderBy(asc(tags.namespace), asc(tags.name))
        .all();

      return {
        ...row,
        authorNames: parseAuthorNames(row.authorNames),
        pageCount: Number(row.pageCount),
        chapterCount: Number(row.chapterCount),
        chapters: chapterRows,
        tags: tagRows.map((tag) => ({ ...tag, isUserEdited: Boolean(tag.isUserEdited) })),
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
          width: pages.width,
          height: pages.height,
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

function comicAuthorNamesSql() {
  return sql<string | null>`(
    select group_concat(author_tags.label, char(31))
    from (
      select distinct coalesce(author_tag.display_name_zh, author_tag.name) as label
      from comic_tags author_comic_tags
      inner join tags author_tag on author_tag.id = author_comic_tags.tag_id
      where author_comic_tags.comic_id = ${comics.id}
        and author_tag.namespace in ('artist', 'group')
      order by author_tag.namespace, author_tag.name
    ) author_tags
  )`;
}

function parseAuthorNames(value: string | null) {
  return value ? value.split(String.fromCharCode(31)).map((name) => name.trim()).filter(Boolean) : [];
}

function normalizeSelectedTags(input: string[] | undefined) {
  if (!input) {
    return [];
  }

  return Array.from(new Set(input.map((tag) => tag.trim().toLocaleLowerCase()).filter(Boolean))).slice(0, 12);
}
