import { randomUUID } from "node:crypto";

import { and, desc, eq, inArray } from "drizzle-orm";

import { bootstrapDatabase, comicSources, comicTags, comics, getDb, metadataSyncEntries, metadataSyncSessions, tags } from "@/modules/core/db";
import { getRuntimeSettings } from "@/modules/core/settings";
import { scanMangaRoot } from "@/modules/library/scan-library-root";
import { normalizeSortTitle } from "@/modules/library/title-utils";
import { createComicTagAssignmentRepository } from "@/modules/tags/comic-tags.repository";
import { createTagRepository, type SaveTagInput } from "@/modules/tags/tags.repository";
import { createCanonicalTag } from "@/modules/tags";

import {
  findPixivLocalPathMatch,
  findPixivSourceMatch,
  resolvePixivMatch,
  type PixivMatchResolution,
} from "./comic-matcher";
import { createPixivPathResolver } from "./path-resolver";
import { checkPixivDatabaseConnection, loadPixivSnapshot, openPixivDatabaseReadonly } from "./sqlite-reader";
import { describePixivSchemaIssues, inspectPixivDownloaderSchema } from "./schema-inspector";
import {
  PIXIV_DOWNLOADER_PROVIDER,
  PIXIV_SITE,
  type ExternalPixivArtwork,
  type PixivConnectionCheckResult,
  type PixivDownloaderConfig,
  type PixivSchemaInspectionResult,
  type PixivSyncEntry,
  type PixivSyncEntryAction,
  type PixivSyncPreviewResult,
  type PixivSyncRunResult,
  type PixivSyncStats,
  type PixivSyncSummary,
} from "./types";
import { ensurePixivDownloaderMangaRoot } from "./managed-root";

const ENTRY_INSERT_BATCH_SIZE = 50;

export interface PixivConfigOverride {
  dbPath?: string;
  downloadRoot?: string;
  mangaRootId?: string;
}

/** 读取并校验 PixivDownloader 设置，并按下载根目录解析受管媒体路径。 */
export async function getPixivDownloaderConfig(override?: PixivConfigOverride): Promise<PixivDownloaderConfig> {
  const settings = await getRuntimeSettings();
  const dbPath = (override?.dbPath ?? settings.pixivDownloaderDbPath ?? "").trim();
  const downloadRoot = (override?.downloadRoot ?? settings.pixivDownloaderDownloadRoot ?? "").trim();

  if (!dbPath) {
    throw new Error("请先在设置中配置 PixivDownloader 数据库文件路径。");
  }
  if (!downloadRoot) {
    throw new Error("请先在设置中配置 PixivDownloader 下载根目录。");
  }
  const root = await ensurePixivDownloaderMangaRoot(downloadRoot);
  return { dbPath, downloadRoot, mangaRootId: root.id };
}

export async function checkPixivDownloaderConnection(override?: PixivConfigOverride): Promise<PixivConnectionCheckResult> {
  let config: PixivDownloaderConfig;
  try {
    config = await getPixivDownloaderConfig(override);
  } catch (error) {
    return { ok: false, status: "missing_settings", message: error instanceof Error ? error.message : "配置不完整。" };
  }

  return checkPixivDatabaseConnection(config.dbPath);
}

interface PlannedEntry {
  artwork: ExternalPixivArtwork;
  resolvedPath: string | null;
  usedMoveFolder: boolean;
  existsOnDisk: boolean;
  action: PixivSyncEntryAction;
  reason: string | null;
  match: PixivMatchResolution;
  comic: {
    id: string;
    displayTitle: string;
    displayTitleSource: string;
    displayTitleSourceSite: string | null;
    displayTitleSourceId: string | null;
    originalTitle: string | null;
    metadataQueryTitle: string | null;
  } | null;
  sourceRecordId: string | null;
  titleUpdateAllowed: boolean;
  willUpdateTitle: boolean;
  tagInputs: SaveTagInput[];
  newTagCount: number;
}

interface SyncPlan {
  config: PixivDownloaderConfig;
  schema: PixivSchemaInspectionResult;
  planned: PlannedEntry[];
  stats: PixivSyncStats;
}

function emptyStats(): PixivSyncStats {
  return { total: 0, updated: 0, skipped: 0, unmatched: 0, conflict: 0, pathError: 0, error: 0 };
}

function toEntryAction(action: PixivSyncEntryAction): keyof PixivSyncStats {
  switch (action) {
    case "updated":
      return "updated";
    case "skipped":
      return "skipped";
    case "unmatched":
      return "unmatched";
    case "conflict":
      return "conflict";
    case "path_error":
      return "pathError";
    case "error":
      return "error";
  }
}

/** 构建完整同步计划：读外部库 → 路径解析 → 匹配 → 判定动作。不产生任何写入。 */
async function buildSyncPlan(): Promise<{ plan: SyncPlan | null; error: string | null }> {
  const config = await getPixivDownloaderConfig();
  const external = openPixivDatabaseReadonly(config.dbPath);

  try {
    const schema = inspectPixivDownloaderSchema(external);
    if (!schema.ok) {
      return { plan: null, error: `PixivDownloader 数据库 schema 不兼容：${describePixivSchemaIssues(schema)}` };
    }

    const snapshot = loadPixivSnapshot(external);
    const resolver = createPixivPathResolver({
      downloadRoot: config.downloadRoot,
      pathPrefixes: snapshot.pathPrefixes,
    });

    const db = getDb();
    const planned: PlannedEntry[] = [];
    const stats = emptyStats();

    for (const artwork of snapshot.artworks) {
      const artworkId = String(artwork.artworkId);
      const resolved = resolver.resolve(artwork);
      const plannedBase = {
        artwork,
        resolvedPath: resolved.ok ? resolved.absolutePath : null,
        usedMoveFolder: resolved.usedMoveFolder,
        existsOnDisk: resolved.ok ? resolved.existsOnDisk : false,
        comic: null,
        sourceRecordId: null,
        titleUpdateAllowed: false,
        willUpdateTitle: false,
        tagInputs: [],
        newTagCount: 0,
      };

      if (artwork.deleted) {
        planned.push({ ...plannedBase, action: "skipped", reason: "deleted_in_source", match: { kind: "unmatched" } });
        continue;
      }

      if (!resolved.ok) {
        const reason =
          resolved.failure.kind === "unknown_prefix"
            ? `unknown_prefix:${resolved.failure.placeholder}`
            : resolved.failure.kind === "path_escape"
              ? `path_escape:${resolved.failure.resolvedPath}`
              : "empty_folder";
        planned.push({ ...plannedBase, action: "path_error", reason, match: { kind: "unmatched" } });
        continue;
      }

      const sourceMatch = findPixivSourceMatch(artworkId);
      const pathMatch = findPixivLocalPathMatch(resolved.absolutePath);
      const match = resolvePixivMatch(sourceMatch, pathMatch);

      if (match.kind === "conflict") {
        planned.push({ ...plannedBase, action: "conflict", reason: "identity_path_mismatch", match });
        continue;
      }

      if (match.kind === "unmatched") {
        planned.push({ ...plannedBase, action: "unmatched", reason: "no_local_match", match });
        continue;
      }

      const comic = db
        .select({
          id: comics.id,
          displayTitle: comics.displayTitle,
          displayTitleSource: comics.displayTitleSource,
          displayTitleSourceSite: comics.displayTitleSourceSite,
          displayTitleSourceId: comics.displayTitleSourceId,
          originalTitle: comics.originalTitle,
          metadataQueryTitle: comics.metadataQueryTitle,
        })
        .from(comics)
        .where(eq(comics.id, match.comicId))
        .get();

      if (!comic) {
        planned.push({ ...plannedBase, action: "error", reason: "matched_comic_missing", match });
        continue;
      }

      const titleUpdateAllowed = canAutoUpdateDisplayTitle(comic, artworkId);
      const willUpdateTitle = titleUpdateAllowed && artwork.title.trim() !== "" && comic.displayTitle !== artwork.title;

      const tagInputs = buildTagInputs(artwork);
      const newTagCount = await countNewComicTags(comic.id, tagInputs);
      const sourceCreated = !sourceMatch;
      const willWriteAnything = willUpdateTitle || sourceCreated || newTagCount > 0;

      let reason: string | null = null;
      if (!willWriteAnything) {
        reason = titleUpdateAllowed ? "no_change" : comic.displayTitleSource === "manual" ? "manual_title_protected" : "no_change";
      }

      planned.push({
        artwork,
        resolvedPath: plannedBase.resolvedPath,
        usedMoveFolder: plannedBase.usedMoveFolder,
        existsOnDisk: plannedBase.existsOnDisk,
        action: willWriteAnything ? "updated" : "skipped",
        reason,
        match,
        comic,
        sourceRecordId: sourceMatch?.sourceRecordId ?? null,
        titleUpdateAllowed,
        willUpdateTitle,
        tagInputs,
        newTagCount,
      });
    }

    stats.total = planned.length;
    for (const item of planned) {
      stats[toEntryAction(item.action)] += 1;
    }

    return { plan: { config, schema, planned, stats }, error: null };
  } finally {
    external.close();
  }
}

/** 只读统计：这些标签中有多少尚未绑定到该漫画（标签本身不存在也视为新增）。 */
async function countNewComicTags(comicId: string, tagInputs: SaveTagInput[]): Promise<number> {
  if (tagInputs.length === 0) {
    return 0;
  }

  const db = getDb();
  const canonicals = tagInputs.map((input) => createCanonicalTag(input.namespace, input.name));
  const tagRows = db.select({ id: tags.id, canonical: tags.canonical }).from(tags).where(inArray(tags.canonical, canonicals)).all();
  const tagIdByCanonical = new Map(tagRows.map((row) => [row.canonical, row.id]));

  let newCount = 0;
  for (const canonical of canonicals) {
    const tagId = tagIdByCanonical.get(canonical);
    if (!tagId) {
      newCount += 1;
      continue;
    }

    const bound = db
      .select({ tagId: comicTags.tagId })
      .from(comicTags)
      .where(and(eq(comicTags.comicId, comicId), eq(comicTags.tagId, tagId)))
      .get();
    if (!bound) {
      newCount += 1;
    }
  }

  return newCount;
}

/** 只有扫描生成或同一 pixiv 来源生成的标题允许被同步更新。 */
function canAutoUpdateDisplayTitle(
  comic: {
    displayTitleSource: string;
    displayTitleSourceSite: string | null;
    displayTitleSourceId: string | null;
  },
  artworkId: string,
): boolean {
  if (comic.displayTitleSource === "scan") {
    return true;
  }

  if (comic.displayTitleSource === "metadata") {
    return comic.displayTitleSourceSite === PIXIV_SITE && comic.displayTitleSourceId === artworkId;
  }

  return false;
}

function containsCjk(text: string): boolean {
  return /[\u4e00-\u9fff\u3040-\u30ff\u3400-\u4dbf]/.test(text);
}

/** 作者 → artist:* 标签；Pixiv 标签 → general:* 标签（translated_name 含 CJK 时作为中文展示名）。 */
function buildTagInputs(artwork: ExternalPixivArtwork): SaveTagInput[] {
  const inputs: SaveTagInput[] = [];

  if (artwork.authorName) {
    inputs.push({ namespace: "artist", name: artwork.authorName });
  }

  for (const tag of artwork.tags) {
    if (!tag.name) {
      continue;
    }
    inputs.push({
      namespace: "general",
      name: tag.name,
      displayNameZh: tag.translatedName && containsCjk(tag.translatedName) ? tag.translatedName : null,
    });
  }

  return inputs;
}

function buildRawMetadata(item: PlannedEntry): string {
  return JSON.stringify({
    artworkId: item.artwork.artworkId,
    title: item.artwork.title,
    authorId: item.artwork.authorId,
    authorName: item.artwork.authorName,
    tags: item.artwork.tags,
    seriesId: item.artwork.seriesId,
    seriesOrder: item.artwork.seriesOrder,
    r18: item.artwork.r18,
    isAi: item.artwork.isAi,
    pageCount: item.artwork.pageCount,
    moved: item.artwork.moved,
    usedMoveFolder: item.usedMoveFolder,
    resolvedPath: item.resolvedPath,
    provider: PIXIV_DOWNLOADER_PROVIDER,
    syncedAt: new Date().toISOString(),
  });
}

function plannedToEntry(item: PlannedEntry, titleUpdated: boolean, sourceCreated: boolean): PixivSyncEntry {
  const matchedComicTitle =
    item.match.kind === "path" ? item.match.comicDisplayTitle : item.comic?.displayTitle ?? null;

  return {
    artworkId: String(item.artwork.artworkId),
    title: item.artwork.title || null,
    resolvedPath: item.resolvedPath,
    action: item.action,
    reason: item.reason,
    matchedComicId: item.comic?.id ?? null,
    matchedComicTitle,
    matchedLocalFileId: item.match.kind === "path" ? item.match.localFileId : item.match.kind === "source" ? item.match.pathMatch?.localFileId ?? null : null,
    matchedBy: item.match.kind === "source" || item.match.kind === "path" ? item.match.kind : null,
    titleUpdated,
    sourceCreated,
    tagCount: item.tagInputs.length,
    existsOnDisk: item.existsOnDisk,
  };
}

/** 预览：只读外部库和本地库，展示将更新 / 保持用户标题 / 未匹配 / 越界 / 冲突。 */
export async function previewPixivDownloaderSync(): Promise<PixivSyncPreviewResult> {
  bootstrapDatabase();

  const { plan, error } = await buildSyncPlan();
  if (!plan) {
    return {
      ok: false,
      config: await getPixivDownloaderConfig().catch(() => ({ dbPath: "", downloadRoot: "", mangaRootId: "" })),
      schema: null,
      stats: emptyStats(),
      entries: [],
      error,
    };
  }

  return {
    ok: true,
    config: plan.config,
    schema: plan.schema,
    stats: plan.stats,
    entries: plan.planned.map((item) => plannedToEntry(item, item.willUpdateTitle, item.match.kind === "path")),
    error: null,
  };
}

export interface RunPixivSyncOptions {
  /** 先对配置的漫画根目录执行一次普通 Library 扫描，再同步。 */
  scanFirst?: boolean;
}

/** 执行同步：可选先扫描，然后按小批次写入标题 / 来源 / 标签，并记录同步批次和条目。 */
export async function runPixivDownloaderSync(options: RunPixivSyncOptions = {}): Promise<PixivSyncRunResult> {
  bootstrapDatabase();

  const { plan, error } = await buildSyncPlan();

  if (!plan) {
    const config = await getPixivDownloaderConfig().catch(() => ({ dbPath: "", downloadRoot: "", mangaRootId: "" }));
    return {
      ok: false,
      preview: { ok: false, config, schema: null, stats: emptyStats(), entries: [], error },
      summary: null,
    };
  }

  let scanSessionId: string | null = null;
  let scanAddedCount: number | null = null;

  if (options.scanFirst) {
    const scanResult = await scanMangaRoot(plan.config.mangaRootId);
    scanSessionId = scanResult.sessionId;
    scanAddedCount = scanResult.addedCount;

    // 扫描可能新建了 local_file / comic，重新构建计划以获得最新匹配。
    const rebuilt = await buildSyncPlan();
    if (rebuilt.plan) {
      plan.planned = rebuilt.plan.planned;
      plan.stats = rebuilt.plan.stats;
    }
  }

  const db = getDb();
  const sessionId = randomUUID();
  const startedAt = new Date().toISOString();

  db.insert(metadataSyncSessions)
    .values({
      id: sessionId,
      provider: PIXIV_DOWNLOADER_PROVIDER,
      status: "running",
      mangaRootId: plan.config.mangaRootId,
      scanSessionId,
      startedAt,
    })
    .run();

  const entries: PixivSyncEntry[] = [];
  const tagRepository = createTagRepository();
  const comicTagRepository = createComicTagAssignmentRepository();
  const now = startedAt;

  for (const item of plan.planned) {
    if (item.action === "path_error" || item.action === "unmatched" || item.action === "conflict" || item.action === "error") {
      entries.push(plannedToEntry(item, false, false));
      continue;
    }

    if (item.action === "skipped" && item.reason === "deleted_in_source") {
      entries.push(plannedToEntry(item, false, false));
      continue;
    }

    try {
      const comicId = item.comic!.id;
      const artworkId = String(item.artwork.artworkId);
      const sourceUrl = `https://www.pixiv.net/artworks/${artworkId}`;
      const sourceCreated = item.match.kind === "path";

      db.insert(comicSources)
        .values({
          id: item.sourceRecordId ?? randomUUID(),
          comicId,
          site: PIXIV_SITE,
          sourceId: artworkId,
          sourceUrl,
          originalTitle: item.artwork.title || null,
          coverUrl: null,
          rawMetadataJson: buildRawMetadata(item),
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [comicSources.site, comicSources.sourceId],
          set: {
            comicId,
            sourceUrl,
            originalTitle: item.artwork.title || null,
            rawMetadataJson: buildRawMetadata(item),
            updatedAt: now,
          },
        })
        .run();

      let titleUpdated = false;
      if (item.willUpdateTitle) {
        db.update(comics)
          .set({
            displayTitle: item.artwork.title,
            displayTitleSource: "metadata",
            displayTitleSourceSite: PIXIV_SITE,
            displayTitleSourceId: artworkId,
            sortTitle: normalizeSortTitle(item.artwork.title),
            originalTitle: item.comic!.originalTitle ?? (item.artwork.title || null),
            metadataQueryTitle: item.comic!.metadataQueryTitle ?? (item.artwork.title || null),
            updatedAt: now,
          })
          .where(eq(comics.id, comicId))
          .run();
        titleUpdated = true;
      } else {
        if (!item.comic!.originalTitle && item.artwork.title) {
          db.update(comics).set({ originalTitle: item.artwork.title, updatedAt: now }).where(eq(comics.id, comicId)).run();
        }
        if (!item.comic!.metadataQueryTitle && item.artwork.title) {
          db.update(comics)
            .set({ metadataQueryTitle: item.artwork.title, updatedAt: now })
            .where(eq(comics.id, comicId))
            .run();
        }
      }

      for (const tagInput of item.tagInputs) {
        const tag = await tagRepository.upsert(tagInput);
        await comicTagRepository.addMetadataToComic(comicId, tag.id);
      }

      entries.push(plannedToEntry(item, titleUpdated, sourceCreated));
    } catch (entryError) {
      entries.push({
        ...plannedToEntry(item, false, false),
        action: "error",
        reason: entryError instanceof Error ? entryError.message : String(entryError),
      });
    }
  }

  const stats = emptyStats();
  stats.total = entries.length;
  for (const entry of entries) {
    stats[toEntryAction(entry.action)] += 1;
  }

  const finishedAt = new Date().toISOString();
  const errorSummary =
    stats.error > 0 ? `${stats.error} 个作品同步时出错，详见条目结果。` : null;

  db.update(metadataSyncSessions)
    .set({
      status: stats.error > 0 ? "failed" : "completed",
      finishedAt,
      totalArtworkCount: stats.total,
      updatedCount: stats.updated,
      skippedCount: stats.skipped,
      unmatchedCount: stats.unmatched,
      conflictCount: stats.conflict,
      pathErrorCount: stats.pathError,
      errorCount: stats.error,
      errorSummary,
      updatedAt: finishedAt,
    })
    .where(eq(metadataSyncSessions.id, sessionId))
    .run();

  for (let i = 0; i < entries.length; i += ENTRY_INSERT_BATCH_SIZE) {
    const batch = entries.slice(i, i + ENTRY_INSERT_BATCH_SIZE).map((entry) => ({
      id: randomUUID(),
      sessionId,
      artworkId: entry.artworkId,
      title: entry.title,
      resolvedPath: entry.resolvedPath,
      matchedComicId: entry.matchedComicId,
      matchedComicTitle: entry.matchedComicTitle,
      matchedLocalFileId: entry.matchedLocalFileId,
      action: entry.action,
      reason: entry.reason,
      titleUpdated: entry.titleUpdated,
    }));

    if (batch.length > 0) {
      db.insert(metadataSyncEntries).values(batch).run();
    }
  }

  const summary: PixivSyncSummary = {
    sessionId,
    provider: PIXIV_DOWNLOADER_PROVIDER,
    status: stats.error > 0 ? "failed" : "completed",
    stats,
    scanSessionId,
    scanAddedCount,
    startedAt,
    finishedAt,
    errorSummary,
  };

  return {
    ok: stats.error === 0,
    preview: {
      ok: true,
      config: plan.config,
      schema: plan.schema,
      stats,
      entries,
      error: null,
    },
    summary,
  };
}

export interface PixivSyncSessionRecord {
  id: string;
  provider: string;
  status: string;
  mangaRootId: string | null;
  scanSessionId: string | null;
  startedAt: string;
  finishedAt: string | null;
  totalArtworkCount: number;
  updatedCount: number;
  skippedCount: number;
  unmatchedCount: number;
  conflictCount: number;
  pathErrorCount: number;
  errorCount: number;
  errorSummary: string | null;
}

export interface PixivSyncEntryRecord {
  id: string;
  artworkId: string;
  title: string | null;
  resolvedPath: string | null;
  matchedComicId: string | null;
  matchedComicTitle: string | null;
  matchedLocalFileId: string | null;
  action: string;
  reason: string | null;
  titleUpdated: boolean;
}

export async function listPixivSyncSessions(limit = 20): Promise<PixivSyncSessionRecord[]> {
  bootstrapDatabase();
  const db = getDb();
  const rows = db
    .select()
    .from(metadataSyncSessions)
    .orderBy(desc(metadataSyncSessions.startedAt))
    .limit(Math.max(1, Math.min(limit, 100)))
    .all();

  return rows.map((row) => ({
    id: row.id,
    provider: row.provider,
    status: row.status,
    mangaRootId: row.mangaRootId,
    scanSessionId: row.scanSessionId,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    totalArtworkCount: row.totalArtworkCount,
    updatedCount: row.updatedCount,
    skippedCount: row.skippedCount,
    unmatchedCount: row.unmatchedCount,
    conflictCount: row.conflictCount,
    pathErrorCount: row.pathErrorCount,
    errorCount: row.errorCount,
    errorSummary: row.errorSummary,
  }));
}

export async function getPixivSyncSessionDetail(
  sessionId: string,
): Promise<{ session: PixivSyncSessionRecord; entries: PixivSyncEntryRecord[] } | null> {
  bootstrapDatabase();
  const db = getDb();
  const session = db.select().from(metadataSyncSessions).where(eq(metadataSyncSessions.id, sessionId)).get();

  if (!session) {
    return null;
  }

  const entries = db
    .select()
    .from(metadataSyncEntries)
    .where(eq(metadataSyncEntries.sessionId, sessionId))
    .orderBy(metadataSyncEntries.artworkId)
    .all();

  return {
    session: {
      id: session.id,
      provider: session.provider,
      status: session.status,
      mangaRootId: session.mangaRootId,
      scanSessionId: session.scanSessionId,
      startedAt: session.startedAt,
      finishedAt: session.finishedAt,
      totalArtworkCount: session.totalArtworkCount,
      updatedCount: session.updatedCount,
      skippedCount: session.skippedCount,
      unmatchedCount: session.unmatchedCount,
      conflictCount: session.conflictCount,
      pathErrorCount: session.pathErrorCount,
      errorCount: session.errorCount,
      errorSummary: session.errorSummary,
    },
    entries: entries.map((row) => ({
      id: row.id,
      artworkId: row.artworkId,
      title: row.title,
      resolvedPath: row.resolvedPath,
      matchedComicId: row.matchedComicId,
      matchedComicTitle: row.matchedComicTitle,
      matchedLocalFileId: row.matchedLocalFileId,
      action: row.action,
      reason: row.reason,
      titleUpdated: Boolean(row.titleUpdated),
    })),
  };
}
