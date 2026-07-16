/**
 * Locate an existing OpenList archive under a flat library root when offline
 * submit returns "task already exists" (10008).
 *
 * Expected layout (115 often uses archive-named folder including suffix):
 *   {root}/{fileName.zip}/{fileName.zip}
 * also accepts:
 *   {root}/{mangaName}/{file}.zip|cbz
 */
export const DEFAULT_OPENLIST_DUPLICATE_SEARCH_ROOT = "/115Open/HENTAI/exhentai";

export const OPENLIST_ARCHIVE_EXTENSIONS = [".zip", ".cbz"] as const;

const DEFAULT_MAX_LIST_CALLS = 200;
const DEFAULT_PER_PAGE = 100;
const HIGH_SCORE = 80;
const EXACT_SCORE = 100;

export type LocateListEntry = {
  name: string;
  isDirectory: boolean;
  sizeBytes: number | null;
};

export type LocateListDirectory = (
  path: string,
  options: { page: number; perPage: number; refresh: boolean },
) => Promise<{
  ok: boolean;
  entries: LocateListEntry[];
  hasMore: boolean;
  message?: string;
}>;

export type LocateFound = {
  status: "found";
  remotePath: string;
  fileName: string;
  sizeBytes: number | null;
  mangaDirName: string | null;
  score: number;
};

export type LocateAmbiguous = {
  status: "ambiguous";
  candidates: Array<{
    remotePath: string;
    fileName: string;
    sizeBytes: number | null;
    mangaDirName: string | null;
    score: number;
  }>;
};

export type LocateNotFound = {
  status: "not_found";
  message: string;
  listCallCount: number;
};

export type LocateIncomplete = {
  status: "incomplete";
  message: string;
  listCallCount: number;
};

export type LocateError = {
  status: "error";
  message: string;
  listCallCount: number;
};

export type LocateArchiveResult = LocateFound | LocateAmbiguous | LocateNotFound | LocateIncomplete | LocateError;

export function normalizeOpenListMatchName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\.(zip|cbz)$/i, "")
    .replace(/\s+/g, " ");
}

export function isOpenListArchiveName(name: string): boolean {
  const lower = name.trim().toLowerCase();
  return OPENLIST_ARCHIVE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** Same spirit as pull-back scoreNameMatch: exact=100, includes=80, token overlap<=70. */
export function scoreOpenListNameMatch(candidate: string, hints: string[]): number {
  const normalizedCandidate = normalizeOpenListMatchName(candidate);
  if (!normalizedCandidate) return 0;

  let best = 0;
  for (const hint of hints) {
    const normalizedHint = normalizeOpenListMatchName(hint);
    if (!normalizedHint) continue;
    if (normalizedCandidate === normalizedHint) {
      best = Math.max(best, EXACT_SCORE);
      continue;
    }
    if (normalizedCandidate.includes(normalizedHint) || normalizedHint.includes(normalizedCandidate)) {
      best = Math.max(best, HIGH_SCORE);
      continue;
    }
    const tokens = normalizedHint.split(/[\s\[\]()（）_|.\-]+/).filter((token) => token.length >= 4);
    const hits = tokens.filter((token) => normalizedCandidate.includes(token)).length;
    if (hits > 0) {
      best = Math.max(best, Math.min(70, hits * 15));
    }
  }
  return best;
}

export function joinOpenListLocatePath(parentPath: string, name: string): string {
  const parent = parentPath.replace(/\/+$/, "") || "";
  if (!parent) return `/${name}`.replace(/\/{2,}/g, "/");
  return `${parent}/${name}`.replace(/\/{2,}/g, "/");
}

export function normalizeOpenListLocateRoot(root: string): string {
  const trimmed = root.trim().replace(/\\/g, "/");
  if (!trimmed) return DEFAULT_OPENLIST_DUPLICATE_SEARCH_ROOT;
  const withSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withSlash.replace(/\/+$/, "") || "/";
}

type ScoredChild = {
  name: string;
  isDirectory: boolean;
  sizeBytes: number | null;
  score: number;
  path: string;
};

export async function locateArchiveUnderOpenListRoot(input: {
  root: string;
  hints: string[];
  listDirectory: LocateListDirectory;
  maxListCalls?: number;
  perPage?: number;
}): Promise<LocateArchiveResult> {
  const root = normalizeOpenListLocateRoot(input.root);
  const hints = input.hints.map((hint) => hint.trim()).filter(Boolean);
  const maxListCalls = input.maxListCalls ?? DEFAULT_MAX_LIST_CALLS;
  const perPage = input.perPage ?? DEFAULT_PER_PAGE;
  let listCallCount = 0;

  if (hints.length === 0) {
    return {
      status: "not_found",
      message: "缺少可用于匹配的漫画名称。",
      listCallCount,
    };
  }

  const listOnce = async (path: string, page: number, refresh: boolean) => {
    listCallCount += 1;
    if (listCallCount > maxListCalls) {
      return {
        ok: false as const,
        truncated: true as const,
        entries: [] as LocateListEntry[],
        hasMore: false,
        message: `在 ${root} 下搜索达到 list 上限（${maxListCalls}），未完成扫描。`,
      };
    }
    const result = await input.listDirectory(path, { page, perPage, refresh });
    if (!result.ok) {
      return {
        ok: false as const,
        truncated: false as const,
        entries: [] as LocateListEntry[],
        hasMore: false,
        message: result.message || `读取目录失败：${path}`,
      };
    }
    return {
      ok: true as const,
      truncated: false as const,
      entries: result.entries,
      hasMore: result.hasMore,
      message: undefined as string | undefined,
    };
  };

  const listAllPages = async (path: string, refreshFirstPage: boolean) => {
    const entries: LocateListEntry[] = [];
    let page = 1;
    while (true) {
      const pageResult = await listOnce(path, page, refreshFirstPage && page === 1);
      if (pageResult.truncated) {
        return { ok: false as const, incomplete: true as const, entries, message: pageResult.message || "搜索未完成。" };
      }
      if (!pageResult.ok) {
        return { ok: false as const, incomplete: false as const, entries, message: pageResult.message || "读取目录失败。" };
      }
      entries.push(...pageResult.entries);
      if (!pageResult.hasMore) break;
      page += 1;
    }
    return { ok: true as const, incomplete: false as const, entries, message: undefined as string | undefined };
  };

  const rootList = await listAllPages(root, true);
  if (!rootList.ok) {
    if (rootList.incomplete) {
      return { status: "incomplete", message: rootList.message || "搜索未完成。", listCallCount };
    }
    return { status: "error", message: rootList.message || `无法读取 ${root}`, listCallCount };
  }

  const scored: ScoredChild[] = rootList.entries
    .filter((entry) => entry.name?.trim())
    .map((entry) => ({
      name: entry.name,
      isDirectory: entry.isDirectory,
      sizeBytes: entry.sizeBytes,
      score: scoreOpenListNameMatch(entry.name, hints),
      path: joinOpenListLocatePath(root, entry.name),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  const high = scored.filter((entry) => entry.score >= HIGH_SCORE);
  if (high.length === 0) {
    return {
      status: "not_found",
      message: `已在 ${root} 下按漫画名称查找未找到匹配项。`,
      listCallCount,
    };
  }

  const bestScore = high[0]!.score;
  const top = high.filter((entry) => entry.score === bestScore || (bestScore < EXACT_SCORE && bestScore - entry.score <= 0));
  // Ambiguous if multiple distinct high-confidence names at best score.
  const uniqueTopNames = new Set(top.map((entry) => normalizeOpenListMatchName(entry.name)));
  if (uniqueTopNames.size > 1) {
    const candidates = [];
    for (const entry of top.slice(0, 5)) {
      if (entry.isDirectory) {
        const nested = await resolveArchiveInDirectory(entry, listAllPages);
        if (nested.status === "incomplete") {
          return { status: "incomplete", message: nested.message, listCallCount };
        }
        if (nested.status === "error") {
          return { status: "error", message: nested.message, listCallCount };
        }
        if (nested.status === "found") {
          candidates.push({
            remotePath: nested.remotePath,
            fileName: nested.fileName,
            sizeBytes: nested.sizeBytes,
            mangaDirName: entry.name,
            score: entry.score,
          });
        } else {
          candidates.push({
            remotePath: entry.path,
            fileName: entry.name,
            sizeBytes: entry.sizeBytes,
            mangaDirName: entry.name,
            score: entry.score,
          });
        }
      } else if (isOpenListArchiveName(entry.name)) {
        candidates.push({
          remotePath: entry.path,
          fileName: entry.name,
          sizeBytes: entry.sizeBytes,
          mangaDirName: null,
          score: entry.score,
        });
      }
    }
    return {
      status: "ambiguous",
      candidates: candidates.length > 0
        ? candidates
        : top.slice(0, 5).map((entry) => ({
            remotePath: entry.path,
            fileName: entry.name,
            sizeBytes: entry.sizeBytes,
            mangaDirName: entry.isDirectory ? entry.name : null,
            score: entry.score,
          })),
    };
  }

  const winner = top[0]!;
  if (!winner.isDirectory && isOpenListArchiveName(winner.name)) {
    return {
      status: "found",
      remotePath: winner.path,
      fileName: winner.name,
      sizeBytes: winner.sizeBytes,
      mangaDirName: null,
      score: winner.score,
    };
  }

  if (!winner.isDirectory) {
    return {
      status: "not_found",
      message: `在 ${root} 下匹配到 ${winner.name}，但不是可下载的 zip/cbz。`,
      listCallCount,
    };
  }

  const nested = await resolveArchiveInDirectory(winner, listAllPages);
  if (nested.status === "incomplete") {
    return { status: "incomplete", message: nested.message, listCallCount };
  }
  if (nested.status === "error") {
    return { status: "error", message: nested.message, listCallCount };
  }
  if (nested.status === "not_found") {
    return {
      status: "not_found",
      message: nested.message,
      listCallCount,
    };
  }
  return {
    status: "found",
    remotePath: nested.remotePath,
    fileName: nested.fileName,
    sizeBytes: nested.sizeBytes,
    mangaDirName: winner.name,
    score: winner.score,
  };
}

async function resolveArchiveInDirectory(
  dir: ScoredChild,
  listAllPages: (
    path: string,
    refreshFirstPage: boolean,
  ) => Promise<{ ok: boolean; incomplete: boolean; entries: LocateListEntry[]; message?: string }>,
): Promise<
  | { status: "found"; remotePath: string; fileName: string; sizeBytes: number | null }
  | { status: "not_found"; message: string }
  | { status: "incomplete"; message: string }
  | { status: "error"; message: string }
> {
  const listed = await listAllPages(dir.path, false);
  if (!listed.ok) {
    if (listed.incomplete) {
      return { status: "incomplete", message: listed.message || "搜索未完成。" };
    }
    return { status: "error", message: listed.message || `无法读取 ${dir.path}` };
  }

  const archives = listed.entries
    .filter((entry) => !entry.isDirectory && isOpenListArchiveName(entry.name))
    .map((entry) => ({
      name: entry.name,
      sizeBytes: entry.sizeBytes,
      path: joinOpenListLocatePath(dir.path, entry.name),
      score: scoreOpenListNameMatch(entry.name, [dir.name]),
    }));

  if (archives.length === 0) {
    return {
      status: "not_found",
      message: `匹配到目录 ${dir.path}，但其中没有 zip/cbz 文件。`,
    };
  }

  archives.sort((a, b) => b.score - a.score || (b.sizeBytes ?? 0) - (a.sizeBytes ?? 0) || a.name.localeCompare(b.name));
  const best = archives[0]!;
  return {
    status: "found",
    remotePath: best.path,
    fileName: best.name,
    sizeBytes: best.sizeBytes,
  };
}

export function buildDuplicateNotFoundMessage(root: string, submitMessage?: string | null): string {
  const rootPath = normalizeOpenListLocateRoot(root);
  const prefix = submitMessage?.trim()
    ? `OpenList 返回任务已存在（10008）：${submitMessage.trim()}。`
    : "OpenList 返回任务已存在（10008）。";
  return (
    `${prefix}已在 ${rootPath} 下按漫画名称查找未找到可下载的 zip/cbz。` +
    `请手动确认云端位置，或把漫画目录/zip 移到该根下后重试该任务。`
  );
}

export function buildDuplicateAmbiguousMessage(
  root: string,
  candidates: LocateAmbiguous["candidates"],
): string {
  const rootPath = normalizeOpenListLocateRoot(root);
  const preview = candidates
    .slice(0, 5)
    .map((item) => item.remotePath)
    .join("；");
  return (
    `OpenList 返回任务已存在（10008），在 ${rootPath} 下找到多个相似漫画：${preview}。` +
    "请手动确认正确路径后重试，或整理云端目录名称避免重名。"
  );
}
