import { and, asc, desc, eq, like, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";

import { bootstrapDatabase, getDb, tags, videoEpisodes, videoProgress, videoRoots, videos, videoTags } from "@/modules/core/db";

export interface VideoCardRecord {
  id: string;
  displayTitle: string;
  fileTitle: string;
  authorNames: string[];
  status: "readable" | "missing_local_file" | "hidden" | "deleted";
  parentVideoId: string | null;
  mergedAsEpisodeId: string | null;
  episodeCount: number;
  totalDurationSeconds: number;
  watchedPercent: number;
  lastWatchedEpisodeId: string | null;
  addedAt: string;
}

export interface VideoEpisodeRecord {
  id: string;
  title: string;
  sortTitle: string;
  sortOrder: number;
  mergedFromVideoId: string | null;
  relativePath: string;
  absolutePath: string;
  extension: string;
  sizeBytes: number | null;
  durationSeconds: number | null;
  isMissing: boolean;
  progressSeconds: number;
  progressPercent: number;
  isCompleted: boolean;
}

export interface VideoTagRecord {
  id: string;
  namespace: string;
  name: string;
  canonical: string;
  displayNameZh: string | null;
  source: "scan" | "metadata" | "manual";
  isUserEdited: boolean;
}

export interface VideoDetailRecord extends VideoCardRecord {
  videoRootId: string;
  videoRootName: string | null;
  primaryPath: string | null;
  totalSizeBytes: number;
  updatedAt: string;
  episodes: VideoEpisodeRecord[];
  tags: VideoTagRecord[];
}

export interface VideoAdminRowRecord extends VideoCardRecord {
  updatedAt: string;
  primaryPath: string | null;
  isPrimaryFileMissing: boolean;
  videoRootName: string | null;
}

export interface VideoSearchInput {
  query?: string;
  tags?: string[];
  page?: number;
  pageSize?: number;
}

export interface VideoSearchResult {
  items: VideoCardRecord[];
  page: number;
  pageSize: number;
  total: number;
}

export interface VideoTagFilterRecord {
  id: string;
  namespace: string;
  canonical: string;
  label: string;
  videoCount: number;
}

export function createVideoRepository() {
  return {
    async searchReadableCards(input: VideoSearchInput = {}): Promise<VideoSearchResult> {
      bootstrapDatabase();
      const db = getDb();
      const page = Math.max(1, Math.trunc(input.page ?? 1));
      const pageSize = Math.max(12, Math.min(96, Math.trunc(input.pageSize ?? 48)));
      const query = input.query?.trim();
      const selectedTags = Array.from(new Set((input.tags ?? []).map((tag) => tag.trim().toLowerCase()).filter(Boolean)));
      const baseWhere = and(eq(videos.status, "readable"), eq(videoEpisodes.isMissing, false));
      const queryWhere = query
        ? or(
            like(videos.displayTitle, `%${query}%`),
            like(videos.fileTitle, `%${query}%`),
            sql`exists (select 1 from video_tags qvt inner join tags qt on qt.id = qvt.tag_id where qvt.video_id = ${videos.id} and (qt.canonical like ${`%${query.toLowerCase()}%`} or qt.name like ${`%${query.toLowerCase()}%`} or qt.display_name_zh like ${`%${query}%`}))`,
          )
        : undefined;
      const tagWheres = selectedTags.map(
        (canonical) => sql`exists (select 1 from video_tags svt inner join tags st on st.id = svt.tag_id where svt.video_id = ${videos.id} and st.canonical = ${canonical})`,
      );
      const whereClause = and(baseWhere, queryWhere, ...tagWheres);
      const episodeCountSql = sql<number>`count(distinct ${videoEpisodes.id})`;
      const totalDurationSql = sql<number>`coalesce(sum(distinct ${videoEpisodes.durationSeconds}), 0)`;
      const authorNamesSql = videoAuthorNamesSql();
      const rows = db
        .select({
          id: videos.id,
          displayTitle: videos.displayTitle,
          fileTitle: videos.fileTitle,
          authorNames: authorNamesSql,
          status: videos.status,
          parentVideoId: videos.parentVideoId,
          mergedAsEpisodeId: videos.mergedAsEpisodeId,
          episodeCount: episodeCountSql,
          totalDurationSeconds: totalDurationSql,
          lastWatchedEpisodeId: videos.lastWatchedEpisodeId,
          addedAt: videos.createdAt,
        })
        .from(videos)
        .leftJoin(videoEpisodes, eq(videoEpisodes.videoId, videos.id))
        .where(whereClause)
        .groupBy(videos.id)
        .orderBy(desc(videos.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize)
        .all();
      const totalRow = db
        .select({ count: sql<number>`count(distinct ${videos.id})` })
        .from(videos)
        .leftJoin(videoEpisodes, eq(videoEpisodes.videoId, videos.id))
        .where(whereClause)
        .get();
      return {
        items: rows.map((row) => ({ ...row, authorNames: parseAuthorNames(row.authorNames), episodeCount: Number(row.episodeCount), totalDurationSeconds: Number(row.totalDurationSeconds), watchedPercent: 0 })),
        page,
        pageSize,
        total: Number(totalRow?.count ?? 0),
      };
    },

    async listReadableTagFilters(limit = 24): Promise<VideoTagFilterRecord[]> {
      bootstrapDatabase();
      const countSql = sql<number>`count(distinct ${videoTags.videoId})`;
      return getDb()
        .select({
          id: tags.id,
          namespace: tags.namespace,
          canonical: tags.canonical,
          label: sql<string>`coalesce(${tags.displayNameZh}, ${tags.name}, ${tags.canonical})`,
          videoCount: countSql,
        })
        .from(tags)
        .innerJoin(videoTags, eq(videoTags.tagId, tags.id))
        .innerJoin(videos, eq(videos.id, videoTags.videoId))
        .where(eq(videos.status, "readable"))
        .groupBy(tags.id)
        .orderBy(desc(countSql), asc(tags.namespace), asc(tags.name))
        .limit(limit)
        .all()
        .map((row) => ({ ...row, videoCount: Number(row.videoCount) }));
    },

    async listAdminRows(limit = 300): Promise<VideoAdminRowRecord[]> {
      bootstrapDatabase();
      const db = getDb();
      const episodeCountSql = sql<number>`count(distinct ${videoEpisodes.id})`;
      const durationSql = sql<number>`coalesce(sum(distinct ${videoEpisodes.durationSeconds}), 0)`;
      const rows = db
        .select({
          id: videos.id,
          displayTitle: videos.displayTitle,
          fileTitle: videos.fileTitle,
          authorNames: videoAuthorNamesSql(),
          status: videos.status,
          parentVideoId: videos.parentVideoId,
          mergedAsEpisodeId: videos.mergedAsEpisodeId,
          episodeCount: episodeCountSql,
          totalDurationSeconds: durationSql,
          lastWatchedEpisodeId: videos.lastWatchedEpisodeId,
          addedAt: videos.createdAt,
          updatedAt: videos.updatedAt,
          primaryPath: sql<string | null>`min(${videoEpisodes.absolutePath})`,
          isPrimaryFileMissing: sql<boolean>`max(${videoEpisodes.isMissing})`,
          videoRootName: videoRoots.displayName,
        })
        .from(videos)
        .leftJoin(videoEpisodes, eq(videoEpisodes.videoId, videos.id))
        .leftJoin(videoRoots, eq(videoRoots.id, videos.videoRootId))
        .groupBy(videos.id)
        .orderBy(desc(videos.createdAt))
        .limit(limit)
        .all();
      return rows.map((row) => ({ ...row, authorNames: parseAuthorNames(row.authorNames), episodeCount: Number(row.episodeCount), totalDurationSeconds: Number(row.totalDurationSeconds), watchedPercent: 0, isPrimaryFileMissing: Boolean(row.isPrimaryFileMissing) }));
    },

    async getDetail(id: string): Promise<VideoDetailRecord | null> {
      bootstrapDatabase();
      const db = getDb();
      const sourceVideos = alias(videos, "source_video");
      const video = db
        .select({
          id: videos.id,
          displayTitle: videos.displayTitle,
          fileTitle: videos.fileTitle,
          authorNames: videoAuthorNamesSql(),
          status: videos.status,
          parentVideoId: videos.parentVideoId,
          mergedAsEpisodeId: videos.mergedAsEpisodeId,
          lastWatchedEpisodeId: videos.lastWatchedEpisodeId,
          addedAt: videos.createdAt,
          updatedAt: videos.updatedAt,
          videoRootId: videos.videoRootId,
          videoRootName: videoRoots.displayName,
        })
        .from(videos)
        .leftJoin(videoRoots, eq(videoRoots.id, videos.videoRootId))
        .where(eq(videos.id, id))
        .get();
      if (!video) return null;

      const episodeRows = db
        .select({
          id: videoEpisodes.id,
          title: videoEpisodes.title,
          sortTitle: videoEpisodes.sortTitle,
          sortOrder: videoEpisodes.sortOrder,
          mergedFromVideoId: sourceVideos.id,
          relativePath: videoEpisodes.relativePath,
          absolutePath: videoEpisodes.absolutePath,
          extension: videoEpisodes.extension,
          sizeBytes: videoEpisodes.sizeBytes,
          durationSeconds: videoEpisodes.durationSeconds,
          isMissing: videoEpisodes.isMissing,
          progressSeconds: sql<number>`coalesce(${videoProgress.positionSeconds}, 0)`,
          progressPercent: sql<number>`coalesce(${videoProgress.progressPercent}, 0)`,
          isCompleted: sql<boolean>`coalesce(${videoProgress.isCompleted}, 0)`,
        })
        .from(videoEpisodes)
        .leftJoin(sourceVideos, eq(sourceVideos.mergedAsEpisodeId, videoEpisodes.id))
        .leftJoin(videoProgress, and(eq(videoProgress.episodeId, videoEpisodes.id), eq(videoProgress.videoId, id)))
        .where(eq(videoEpisodes.videoId, id))
        .orderBy(asc(videoEpisodes.sortOrder), asc(videoEpisodes.createdAt))
        .all();
      const tagRows = db
        .select({
          id: tags.id,
          namespace: tags.namespace,
          name: tags.name,
          canonical: tags.canonical,
          displayNameZh: tags.displayNameZh,
          source: videoTags.source,
          isUserEdited: videoTags.isUserEdited,
        })
        .from(videoTags)
        .innerJoin(tags, eq(tags.id, videoTags.tagId))
        .where(eq(videoTags.videoId, id))
        .orderBy(asc(tags.namespace), asc(tags.name))
        .all();
      const readableEpisodes = episodeRows.filter((episode) => !episode.isMissing);
      return {
        ...video,
        authorNames: parseAuthorNames(video.authorNames),
        primaryPath: readableEpisodes[0]?.absolutePath ?? episodeRows[0]?.absolutePath ?? null,
        episodeCount: episodeRows.length,
        totalDurationSeconds: episodeRows.reduce((sum, episode) => sum + (episode.durationSeconds ?? 0), 0),
        totalSizeBytes: episodeRows.reduce((sum, episode) => sum + (episode.sizeBytes ?? 0), 0),
        watchedPercent: episodeRows.length ? Math.round(episodeRows.reduce((sum, episode) => sum + episode.progressPercent, 0) / episodeRows.length) : 0,
        episodes: episodeRows.map((episode) => ({ ...episode, isMissing: Boolean(episode.isMissing), isCompleted: Boolean(episode.isCompleted) })),
        tags: tagRows.map((tag) => ({ ...tag, isUserEdited: Boolean(tag.isUserEdited) })),
      };
    },

    async updateEpisodeTitle(videoId: string, episodeId: string, title: string): Promise<void> {
      bootstrapDatabase();
      const normalizedTitle = title.trim();
      if (!normalizedTitle) throw new Error("集标题不能为空。");
      if (normalizedTitle.length > 500) throw new Error("集标题不能超过 500 个字符。");

      const db = getDb();
      const episode = db
        .select({ id: videoEpisodes.id })
        .from(videoEpisodes)
        .where(and(eq(videoEpisodes.id, episodeId), eq(videoEpisodes.videoId, videoId)))
        .get();
      if (!episode) throw new Error("找不到当前视频的集数。");

      db.update(videoEpisodes)
        .set({ title: normalizedTitle, sortTitle: normalizedTitle.toLocaleLowerCase(), updatedAt: new Date().toISOString() })
        .where(eq(videoEpisodes.id, episodeId))
        .run();
    },

    async getEpisode(id: string) {
      bootstrapDatabase();
      return getDb().select().from(videoEpisodes).where(eq(videoEpisodes.id, id)).get() ?? null;
    },
  };
}

function videoAuthorNamesSql() {
  return sql<string | null>`(
    select group_concat(author_tags.label, char(31))
    from (
      select distinct coalesce(author_tag.display_name_zh, author_tag.name) as label
      from video_tags author_video_tags
      inner join tags author_tag on author_tag.id = author_video_tags.tag_id
      where author_video_tags.video_id = ${videos.id}
        and author_tag.namespace in ('artist', 'group')
      order by author_tag.namespace, author_tag.name
    ) author_tags
  )`;
}

function parseAuthorNames(value: string | null) {
  return value ? value.split(String.fromCharCode(31)).map((name) => name.trim()).filter(Boolean) : [];
}

export type VideoRepository = ReturnType<typeof createVideoRepository>;
