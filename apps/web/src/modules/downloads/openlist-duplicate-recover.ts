/**
 * Match pending 10008 offline tasks against library index and create transfers.
 */

import {
  DEFAULT_OPENLIST_DUPLICATE_SEARCH_ROOT,
  isOpenListArchiveName,
  joinOpenListLocatePath,
  normalizeOpenListLocateRoot,
  normalizeOpenListMatchName,
  scoreOpenListNameMatch,
} from "./openlist-duplicate-locate";
import {
  buildIndexAmbiguousMessage,
  buildIndexNotFoundMessage,
  buildIndexRecoveredMessage,
  buildPendingDuplicateRecoveryMessage,
  isPendingDuplicateRecoveryError,
} from "./openlist-duplicate-error";
import {
  getLatestCompletedIndexSession,
  isIndexSessionFresh,
  listIndexArchives,
  listIndexEntries,
  type OpenListLibraryIndexArchive,
} from "./openlist-library-index";

const HIGH_SCORE = 80;
const EXACT_SCORE = 100;

export type RecoverMatchFound = {
  status: "found";
  remotePath: string;
  fileName: string;
  sizeBytes: number | null;
  score: number;
};

export type RecoverMatchAmbiguous = {
  status: "ambiguous";
  candidates: Array<{ remotePath: string; fileName: string; sizeBytes: number | null; score: number }>;
};

export type RecoverMatchNotFound = {
  status: "not_found";
  message: string;
};

export type RecoverMatchResult = RecoverMatchFound | RecoverMatchAmbiguous | RecoverMatchNotFound;

export function matchArchiveInIndex(input: {
  root: string;
  hints: string[];
  comicName?: string | null;
  archives: OpenListLibraryIndexArchive[];
  entries?: Array<{ remotePath: string; parentPath: string; name: string; kind: "file" | "directory"; sizeBytes: number | null }>;
}): RecoverMatchResult {
  const root = normalizeOpenListLocateRoot(input.root);
  const hints = input.hints.map((h) => h.trim()).filter(Boolean);
  const msgOpts = { comicName: input.comicName, hints };
  if (hints.length === 0) {
    return { status: "not_found", message: buildIndexNotFoundMessage(root, msgOpts) };
  }

  // Score directories and loose archives at root depth.
  type Scored = {
    kind: "directory" | "file";
    name: string;
    remotePath: string;
    sizeBytes: number | null;
    score: number;
  };

  const scored: Scored[] = [];
  const dirs = new Map<string, { name: string; remotePath: string }>();

  for (const archive of input.archives) {
    if (archive.depth === 1 || archive.parentPath === root) {
      scored.push({
        kind: "file",
        name: archive.name,
        remotePath: archive.remotePath,
        sizeBytes: archive.sizeBytes,
        score: scoreOpenListNameMatch(archive.name, hints),
      });
    } else {
      const parentName = archive.parentPath.split("/").filter(Boolean).pop() ?? "";
      if (parentName) {
        dirs.set(archive.parentPath, { name: parentName, remotePath: archive.parentPath });
      }
    }
  }

  // Also use directory entries if provided.
  for (const entry of input.entries ?? []) {
    if (entry.kind === "directory" && entry.depth === 1) {
      dirs.set(entry.remotePath, { name: entry.name, remotePath: entry.remotePath });
    }
  }

  for (const dir of dirs.values()) {
    scored.push({
      kind: "directory",
      name: dir.name,
      remotePath: dir.remotePath,
      sizeBytes: null,
      score: scoreOpenListNameMatch(dir.name, hints),
    });
  }

  const high = scored.filter((s) => s.score >= HIGH_SCORE).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  if (high.length === 0) {
    return { status: "not_found", message: buildIndexNotFoundMessage(root, msgOpts) };
  }

  const bestScore = high[0]!.score;
  const top = high.filter((s) => s.score === bestScore);
  const uniqueNames = new Set(top.map((s) => normalizeOpenListMatchName(s.name)));
  if (uniqueNames.size > 1) {
    const candidates = [];
    for (const item of top.slice(0, 5)) {
      if (item.kind === "file") {
        candidates.push({
          remotePath: item.remotePath,
          fileName: item.name,
          sizeBytes: item.sizeBytes,
          score: item.score,
        });
      } else {
        const archivesInDir = input.archives.filter((a) => a.parentPath === item.remotePath && isOpenListArchiveName(a.name));
        if (archivesInDir.length === 1) {
          const a = archivesInDir[0]!;
          candidates.push({ remotePath: a.remotePath, fileName: a.name, sizeBytes: a.sizeBytes, score: item.score });
        } else if (archivesInDir.length > 1) {
          const best = pickBestArchive(archivesInDir, hints);
          candidates.push({ remotePath: best.remotePath, fileName: best.name, sizeBytes: best.sizeBytes, score: item.score });
        } else {
          candidates.push({
            remotePath: item.remotePath,
            fileName: item.name,
            sizeBytes: null,
            score: item.score,
          });
        }
      }
    }
    return { status: "ambiguous", candidates };
  }

  const winner = top[0]!;
  if (winner.kind === "file") {
    return {
      status: "found",
      remotePath: winner.remotePath,
      fileName: winner.name,
      sizeBytes: winner.sizeBytes,
      score: winner.score,
    };
  }

  const archivesInDir = input.archives.filter((a) => a.parentPath === winner.remotePath && isOpenListArchiveName(a.name));
  if (archivesInDir.length === 0) {
    return { status: "not_found", message: buildIndexNotFoundMessage(root, msgOpts) };
  }
  if (archivesInDir.length === 1) {
    const a = archivesInDir[0]!;
    return {
      status: "found",
      remotePath: a.remotePath,
      fileName: a.name,
      sizeBytes: a.sizeBytes,
      score: winner.score,
    };
  }

  // Multiple zips under same manga dir: prefer name match, else largest.
  const best = pickBestArchive(archivesInDir, hints);
  const nameScores = archivesInDir.map((a) => scoreOpenListNameMatch(a.name, hints));
  const highNameMatches = nameScores.filter((s) => s >= HIGH_SCORE).length;
  if (highNameMatches > 1 && new Set(archivesInDir.map((a) => normalizeOpenListMatchName(a.name))).size > 1) {
    return {
      status: "ambiguous",
      candidates: archivesInDir.slice(0, 5).map((a) => ({
        remotePath: a.remotePath,
        fileName: a.name,
        sizeBytes: a.sizeBytes,
        score: scoreOpenListNameMatch(a.name, hints),
      })),
    };
  }

  return {
    status: "found",
    remotePath: best.remotePath,
    fileName: best.name,
    sizeBytes: best.sizeBytes,
    score: winner.score,
  };
}

function pickBestArchive(archives: OpenListLibraryIndexArchive[], hints: string[]): OpenListLibraryIndexArchive {
  let best = archives[0]!;
  let bestScore = scoreOpenListNameMatch(best.name, hints);
  for (const a of archives.slice(1)) {
    const score = scoreOpenListNameMatch(a.name, hints);
    if (score > bestScore) {
      best = a;
      bestScore = score;
    } else if (score === bestScore) {
      const bestSize = best.sizeBytes ?? 0;
      const size = a.sizeBytes ?? 0;
      if (size > bestSize) best = a;
    }
  }
  // If no name match, pick largest.
  if (bestScore < HIGH_SCORE) {
    return archives.reduce((acc, cur) => ((cur.sizeBytes ?? 0) > (acc.sizeBytes ?? 0) ? cur : acc));
  }
  return best;
}

export function getUsableIndexSessionId(root: string, ttlMinutes: number): string | null {
  const completed = getLatestCompletedIndexSession(root);
  if (completed && isIndexSessionFresh(completed, ttlMinutes)) return completed.id;
  return null;
}

export function matchTaskHintsAgainstIndex(input: {
  root: string;
  sessionId: string;
  hints: string[];
  comicName?: string | null;
}): RecoverMatchResult {
  const archives = listIndexArchives(input.sessionId);
  const entries = listIndexEntries(input.sessionId);
  return matchArchiveInIndex({
    root: input.root,
    hints: input.hints,
    comicName: input.comicName,
    archives,
    entries,
  });
}

export {
  buildIndexAmbiguousMessage,
  buildIndexNotFoundMessage,
  buildIndexRecoveredMessage,
  buildPendingDuplicateRecoveryMessage,
  isPendingDuplicateRecoveryError,
  DEFAULT_OPENLIST_DUPLICATE_SEARCH_ROOT,
  normalizeOpenListLocateRoot,
  joinOpenListLocatePath,
  EXACT_SCORE,
};
