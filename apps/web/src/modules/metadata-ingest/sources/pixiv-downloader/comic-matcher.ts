import { and, eq } from "drizzle-orm";

import { bootstrapDatabase, comicSources, comics, getDb, localFiles } from "@/modules/core/db";

import { normalizePathForComparison } from "./path-resolver";

/**
 * 匹配规则（docs/plan.md 6.5）：
 *
 * 1. 优先使用 site=pixiv + source_id=artwork_id 的长期幂等身份。
 * 2. 首次关联使用解析后的作品绝对路径匹配 local_files.absolute_path。
 * 3. 标题不参与自动绑定。
 * 4. 来源身份和路径分别指向不同漫画时形成冲突，不做任何自动合并。
 */

export interface PixivSourceMatch {
  sourceRecordId: string;
  comicId: string;
}

export interface PixivLocalPathMatch {
  localFileId: string;
  comicId: string;
  comicDisplayTitle: string;
  absolutePath: string;
}

export type PixivMatchResolution =
  | { kind: "source"; comicId: string; sourceRecordId: string; pathMatch: PixivLocalPathMatch | null }
  | { kind: "path"; comicId: string; localFileId: string; comicDisplayTitle: string }
  | { kind: "conflict"; sourceComicId: string; pathComicId: string }
  | { kind: "unmatched" };

export function findPixivSourceMatch(artworkId: string, site = "pixiv"): PixivSourceMatch | null {
  bootstrapDatabase();
  const db = getDb();
  const row = db
    .select({ id: comicSources.id, comicId: comicSources.comicId })
    .from(comicSources)
    .where(and(eq(comicSources.site, site), eq(comicSources.sourceId, artworkId)))
    .get();

  if (!row || !row.comicId) {
    return null;
  }

  return { sourceRecordId: row.id, comicId: row.comicId };
}

export function findPixivLocalPathMatch(resolvedAbsolutePath: string): PixivLocalPathMatch | null {
  bootstrapDatabase();
  const db = getDb();
  const rows = db
    .select({
      localFileId: localFiles.id,
      comicId: localFiles.comicId,
      absolutePath: localFiles.absolutePath,
      comicDisplayTitle: comics.displayTitle,
    })
    .from(localFiles)
    .leftJoin(comics, eq(comics.id, localFiles.comicId))
    .all();

  const target = normalizePathForComparison(resolvedAbsolutePath);
  const hit = rows.find(
    (row) => row.comicId !== null && normalizePathForComparison(row.absolutePath) === target,
  );

  if (!hit || !hit.comicId) {
    return null;
  }

  return {
    localFileId: hit.localFileId,
    comicId: hit.comicId,
    comicDisplayTitle: hit.comicDisplayTitle ?? "",
    absolutePath: hit.absolutePath,
  };
}

export function resolvePixivMatch(
  sourceMatch: PixivSourceMatch | null,
  pathMatch: PixivLocalPathMatch | null,
): PixivMatchResolution {
  if (sourceMatch && pathMatch && sourceMatch.comicId !== pathMatch.comicId) {
    return {
      kind: "conflict",
      sourceComicId: sourceMatch.comicId,
      pathComicId: pathMatch.comicId,
    };
  }

  if (sourceMatch) {
    return { kind: "source", comicId: sourceMatch.comicId, sourceRecordId: sourceMatch.sourceRecordId, pathMatch };
  }

  if (pathMatch) {
    return {
      kind: "path",
      comicId: pathMatch.comicId,
      localFileId: pathMatch.localFileId,
      comicDisplayTitle: pathMatch.comicDisplayTitle,
    };
  }

  return { kind: "unmatched" };
}
