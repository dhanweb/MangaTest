/**
 * Single-flight paginated scan of the flat OpenList library root for 10008 recovery.
 * Layout: {root}/{mangaName}/{archive}.zip|cbz
 */

import { randomUUID } from "node:crypto";

import { and, desc, eq } from "drizzle-orm";

import {
  bootstrapDatabase,
  getDb,
  openlistLibraryIndexEntries,
  openlistLibraryIndexSessions,
} from "@/modules/core/db";

import {
  DEFAULT_OPENLIST_DUPLICATE_SEARCH_ROOT,
  isOpenListArchiveName,
  joinOpenListLocatePath,
  normalizeOpenListLocateRoot,
  type LocateListDirectory,
} from "./openlist-duplicate-locate";

export const DEFAULT_OPENLIST_LIBRARY_INDEX_TTL_MINUTES = 10;
const DEFAULT_PER_PAGE = 100;
const DEFAULT_MAX_LIST_CALLS = 5000;

export type OpenListLibraryIndexSessionRecord = {
  id: string;
  provider: string;
  rootPath: string;
  status: "running" | "completed" | "failed";
  startedAt: string;
  finishedAt: string | null;
  totalCount: number;
  fileCount: number;
  directoryCount: number;
  archiveCount: number;
  listCallCount: number;
  errorSummary: string | null;
};

export type OpenListLibraryIndexArchive = {
  remotePath: string;
  parentPath: string;
  name: string;
  sizeBytes: number | null;
  depth: number;
};

export type OpenListLibraryIndexEntry = {
  remotePath: string;
  parentPath: string;
  name: string;
  kind: "file" | "directory";
  sizeBytes: number | null;
  depth: number;
};

type EnsureResult = {
  sessionId: string;
  status: "running" | "completed" | "failed";
  joined: boolean;
  reusedCompleted: boolean;
  started: boolean;
};

const inFlightScans = new Map<string, Promise<OpenListLibraryIndexSessionRecord>>();

export function getRunningIndexSession(root: string): OpenListLibraryIndexSessionRecord | null {
  bootstrapDatabase();
  const rootPath = normalizeOpenListLocateRoot(root);
  const row = getDb()
    .select()
    .from(openlistLibraryIndexSessions)
    .where(
      and(
        eq(openlistLibraryIndexSessions.provider, "openlist"),
        eq(openlistLibraryIndexSessions.rootPath, rootPath),
        eq(openlistLibraryIndexSessions.status, "running"),
      ),
    )
    .get();
  return row ? mapSession(row) : null;
}

export function getLatestCompletedIndexSession(root: string): OpenListLibraryIndexSessionRecord | null {
  bootstrapDatabase();
  const rootPath = normalizeOpenListLocateRoot(root);
  const row = getDb()
    .select()
    .from(openlistLibraryIndexSessions)
    .where(
      and(
        eq(openlistLibraryIndexSessions.provider, "openlist"),
        eq(openlistLibraryIndexSessions.rootPath, rootPath),
        eq(openlistLibraryIndexSessions.status, "completed"),
      ),
    )
    .orderBy(desc(openlistLibraryIndexSessions.finishedAt))
    .get();
  return row ? mapSession(row) : null;
}

export function isIndexSessionFresh(
  session: OpenListLibraryIndexSessionRecord,
  ttlMinutes: number = DEFAULT_OPENLIST_LIBRARY_INDEX_TTL_MINUTES,
): boolean {
  if (session.status !== "completed" || !session.finishedAt) return false;
  const finishedMs = Date.parse(session.finishedAt);
  if (!Number.isFinite(finishedMs)) return false;
  const ttlMs = Math.max(0, ttlMinutes) * 60_000;
  return Date.now() - finishedMs < ttlMs;
}

export function listIndexArchives(sessionId: string): OpenListLibraryIndexArchive[] {
  bootstrapDatabase();
  const rows = getDb()
    .select()
    .from(openlistLibraryIndexEntries)
    .where(eq(openlistLibraryIndexEntries.sessionId, sessionId))
    .all();

  return rows
    .filter((row) => row.kind === "file" && isOpenListArchiveName(row.name))
    .map((row) => ({
      remotePath: row.remotePath,
      parentPath: row.parentPath,
      name: row.name,
      sizeBytes: row.sizeBytes ?? null,
      depth: row.depth,
    }));
}

export function listIndexEntries(sessionId: string): OpenListLibraryIndexEntry[] {
  bootstrapDatabase();
  return getDb()
    .select()
    .from(openlistLibraryIndexEntries)
    .where(eq(openlistLibraryIndexEntries.sessionId, sessionId))
    .all()
    .map((row) => ({
      remotePath: row.remotePath,
      parentPath: row.parentPath,
      name: row.name,
      kind: row.kind as "file" | "directory",
      sizeBytes: row.sizeBytes ?? null,
      depth: row.depth,
    }));
}

/**
 * Ensure a usable index exists for root.
 * - If scan running: join (return running session)
 * - If completed within TTL and not force: reuse
 * - Else start single-flight scan (awaited)
 */
export async function ensureOpenListLibraryIndex(input: {
  root?: string;
  listDirectory: LocateListDirectory;
  ttlMinutes?: number;
  force?: boolean;
  perPage?: number;
  maxListCalls?: number;
}): Promise<EnsureResult> {
  bootstrapDatabase();
  const rootPath = normalizeOpenListLocateRoot(input.root ?? DEFAULT_OPENLIST_DUPLICATE_SEARCH_ROOT);
  const ttlMinutes = input.ttlMinutes ?? DEFAULT_OPENLIST_LIBRARY_INDEX_TTL_MINUTES;

  const running = getRunningIndexSession(rootPath);
  if (running) {
    const inflight = inFlightScans.get(rootPath);
    if (inflight) {
      const session = await inflight;
      return {
        sessionId: session.id,
        status: session.status,
        joined: true,
        reusedCompleted: false,
        started: false,
      };
    }
    return {
      sessionId: running.id,
      status: "running",
      joined: true,
      reusedCompleted: false,
      started: false,
    };
  }

  if (!input.force) {
    const completed = getLatestCompletedIndexSession(rootPath);
    if (completed && isIndexSessionFresh(completed, ttlMinutes)) {
      return {
        sessionId: completed.id,
        status: "completed",
        joined: false,
        reusedCompleted: true,
        started: false,
      };
    }
  }

  const existingInflight = inFlightScans.get(rootPath);
  if (existingInflight) {
    const session = await existingInflight;
    return {
      sessionId: session.id,
      status: session.status,
      joined: true,
      reusedCompleted: false,
      started: false,
    };
  }

  const sessionId = randomUUID();
  const now = new Date().toISOString();
  getDb()
    .insert(openlistLibraryIndexSessions)
    .values({
      id: sessionId,
      provider: "openlist",
      rootPath,
      status: "running",
      startedAt: now,
      finishedAt: null,
      totalCount: 0,
      fileCount: 0,
      directoryCount: 0,
      archiveCount: 0,
      listCallCount: 0,
      errorSummary: null,
      updatedAt: now,
    })
    .run();

  const scanPromise = runLibraryIndexScan({
    sessionId,
    rootPath,
    listDirectory: input.listDirectory,
    perPage: input.perPage ?? DEFAULT_PER_PAGE,
    maxListCalls: input.maxListCalls ?? DEFAULT_MAX_LIST_CALLS,
  }).finally(() => {
    inFlightScans.delete(rootPath);
  });

  inFlightScans.set(rootPath, scanPromise);
  const session = await scanPromise;
  return {
    sessionId: session.id,
    status: session.status,
    joined: false,
    reusedCompleted: false,
    started: true,
  };
}

/**
 * Start background scan if needed; does not await completion unless already completed/reusable.
 * Returns immediately when a scan is started or joined.
 */
export function startOpenListLibraryIndexInBackground(input: {
  root?: string;
  listDirectory: LocateListDirectory;
  ttlMinutes?: number;
  force?: boolean;
  perPage?: number;
  maxListCalls?: number;
  onComplete?: (session: OpenListLibraryIndexSessionRecord) => void | Promise<void>;
}): EnsureResult {
  bootstrapDatabase();
  const rootPath = normalizeOpenListLocateRoot(input.root ?? DEFAULT_OPENLIST_DUPLICATE_SEARCH_ROOT);
  const ttlMinutes = input.ttlMinutes ?? DEFAULT_OPENLIST_LIBRARY_INDEX_TTL_MINUTES;

  const running = getRunningIndexSession(rootPath);
  if (running) {
    const inflight = inFlightScans.get(rootPath);
    if (inflight && input.onComplete) {
      void inflight.then((session) => input.onComplete?.(session));
    }
    return {
      sessionId: running.id,
      status: "running",
      joined: true,
      reusedCompleted: false,
      started: false,
    };
  }

  if (!input.force) {
    const completed = getLatestCompletedIndexSession(rootPath);
    if (completed && isIndexSessionFresh(completed, ttlMinutes)) {
      return {
        sessionId: completed.id,
        status: "completed",
        joined: false,
        reusedCompleted: true,
        started: false,
      };
    }
  }

  if (inFlightScans.has(rootPath)) {
    const inflight = inFlightScans.get(rootPath)!;
    if (input.onComplete) {
      void inflight.then((session) => input.onComplete?.(session));
    }
    const runningAgain = getRunningIndexSession(rootPath);
    return {
      sessionId: runningAgain?.id ?? "unknown",
      status: "running",
      joined: true,
      reusedCompleted: false,
      started: false,
    };
  }

  const sessionId = randomUUID();
  const now = new Date().toISOString();
  getDb()
    .insert(openlistLibraryIndexSessions)
    .values({
      id: sessionId,
      provider: "openlist",
      rootPath,
      status: "running",
      startedAt: now,
      finishedAt: null,
      totalCount: 0,
      fileCount: 0,
      directoryCount: 0,
      archiveCount: 0,
      listCallCount: 0,
      errorSummary: null,
      updatedAt: now,
    })
    .run();

  const scanPromise = runLibraryIndexScan({
    sessionId,
    rootPath,
    listDirectory: input.listDirectory,
    perPage: input.perPage ?? DEFAULT_PER_PAGE,
    maxListCalls: input.maxListCalls ?? DEFAULT_MAX_LIST_CALLS,
  })
    .then(async (session) => {
      if (input.onComplete) {
        await input.onComplete(session);
      }
      return session;
    })
    .finally(() => {
      inFlightScans.delete(rootPath);
    });

  inFlightScans.set(rootPath, scanPromise);
  return {
    sessionId,
    status: "running",
    joined: false,
    reusedCompleted: false,
    started: true,
  };
}

async function runLibraryIndexScan(input: {
  sessionId: string;
  rootPath: string;
  listDirectory: LocateListDirectory;
  perPage: number;
  maxListCalls: number;
}): Promise<OpenListLibraryIndexSessionRecord> {
  const { sessionId, rootPath, listDirectory, perPage, maxListCalls } = input;
  let listCallCount = 0;
  let totalCount = 0;
  let fileCount = 0;
  let directoryCount = 0;
  let archiveCount = 0;
  const entryBatch: Array<{
    id: string;
    sessionId: string;
    remotePath: string;
    parentPath: string;
    name: string;
    kind: "file" | "directory";
    depth: number;
    sizeBytes: number | null;
  }> = [];

  const flush = () => {
    if (entryBatch.length === 0) return;
    const chunk = entryBatch.splice(0, entryBatch.length);
    for (const entry of chunk) {
      getDb().insert(openlistLibraryIndexEntries).values(entry).run();
    }
  };

  const listPage = async (path: string, page: number, refresh: boolean) => {
    listCallCount += 1;
    if (listCallCount > maxListCalls) {
      return { ok: false as const, truncated: true as const, entries: [], hasMore: false, message: `list 上限 ${maxListCalls}` };
    }
    const result = await listDirectory(path, { page, perPage, refresh });
    if (!result.ok) {
      return {
        ok: false as const,
        truncated: false as const,
        entries: [],
        hasMore: false,
        message: result.message || `读取失败: ${path}`,
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

  const listAllPages = async (path: string, refreshFirst: boolean) => {
    const entries: Array<{ name: string; isDirectory: boolean; sizeBytes: number | null }> = [];
    let page = 1;
    while (true) {
      const pageResult = await listPage(path, page, refreshFirst && page === 1);
      if (pageResult.truncated) {
        return { ok: false as const, incomplete: true as const, entries, message: pageResult.message };
      }
      if (!pageResult.ok) {
        return { ok: false as const, incomplete: false as const, entries, message: pageResult.message };
      }
      entries.push(...pageResult.entries);
      if (!pageResult.hasMore) break;
      page += 1;
    }
    return { ok: true as const, incomplete: false as const, entries, message: undefined as string | undefined };
  };

  try {
    const rootList = await listAllPages(rootPath, true);
    if (!rootList.ok) {
      const finishedAt = new Date().toISOString();
      getDb()
        .update(openlistLibraryIndexSessions)
        .set({
          status: "failed",
          finishedAt,
          listCallCount,
          errorSummary: rootList.message || "root list failed",
          updatedAt: finishedAt,
        })
        .where(eq(openlistLibraryIndexSessions.id, sessionId))
        .run();
      return getSessionById(sessionId)!;
    }

    const directories: Array<{ name: string; path: string }> = [];

    for (const entry of rootList.entries) {
      if (!entry.name?.trim()) continue;
      const remotePath = joinOpenListLocatePath(rootPath, entry.name);
      const kind = entry.isDirectory ? ("directory" as const) : ("file" as const);
      totalCount += 1;
      if (kind === "directory") {
        directoryCount += 1;
        directories.push({ name: entry.name, path: remotePath });
      } else {
        fileCount += 1;
        if (isOpenListArchiveName(entry.name)) archiveCount += 1;
      }
      entryBatch.push({
        id: randomUUID(),
        sessionId,
        remotePath,
        parentPath: rootPath,
        name: entry.name,
        kind,
        depth: 1,
        sizeBytes: entry.sizeBytes,
      });
      if (entryBatch.length >= 50) flush();
    }
    flush();

    for (const dir of directories) {
      const childList = await listAllPages(dir.path, false);
      if (!childList.ok) {
        // Continue other dirs; record error but don't fail entire index unless nothing indexed.
        continue;
      }
      for (const child of childList.entries) {
        if (!child.name?.trim()) continue;
        const remotePath = joinOpenListLocatePath(dir.path, child.name);
        const kind = child.isDirectory ? ("directory" as const) : ("file" as const);
        totalCount += 1;
        if (kind === "directory") directoryCount += 1;
        else {
          fileCount += 1;
          if (isOpenListArchiveName(child.name)) archiveCount += 1;
        }
        entryBatch.push({
          id: randomUUID(),
          sessionId,
          remotePath,
          parentPath: dir.path,
          name: child.name,
          kind,
          depth: 2,
          sizeBytes: child.sizeBytes,
        });
        if (entryBatch.length >= 50) flush();
      }
    }
    flush();

    const finishedAt = new Date().toISOString();
    getDb()
      .update(openlistLibraryIndexSessions)
      .set({
        status: "completed",
        finishedAt,
        totalCount,
        fileCount,
        directoryCount,
        archiveCount,
        listCallCount,
        errorSummary: null,
        updatedAt: finishedAt,
      })
      .where(eq(openlistLibraryIndexSessions.id, sessionId))
      .run();

    return getSessionById(sessionId)!;
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const message = error instanceof Error ? error.message : "index scan failed";
    getDb()
      .update(openlistLibraryIndexSessions)
      .set({
        status: "failed",
        finishedAt,
        listCallCount,
        errorSummary: message,
        updatedAt: finishedAt,
      })
      .where(eq(openlistLibraryIndexSessions.id, sessionId))
      .run();
    return getSessionById(sessionId)!;
  }
}

function getSessionById(sessionId: string): OpenListLibraryIndexSessionRecord | null {
  const row = getDb().select().from(openlistLibraryIndexSessions).where(eq(openlistLibraryIndexSessions.id, sessionId)).get();
  return row ? mapSession(row) : null;
}

function mapSession(row: typeof openlistLibraryIndexSessions.$inferSelect): OpenListLibraryIndexSessionRecord {
  return {
    id: row.id,
    provider: row.provider,
    rootPath: row.rootPath,
    status: row.status as OpenListLibraryIndexSessionRecord["status"],
    startedAt: row.startedAt,
    finishedAt: row.finishedAt ?? null,
    totalCount: row.totalCount,
    fileCount: row.fileCount,
    directoryCount: row.directoryCount,
    archiveCount: row.archiveCount,
    listCallCount: row.listCallCount,
    errorSummary: row.errorSummary ?? null,
  };
}

/** Test helper: clear in-memory scan locks. */
export function __resetOpenListLibraryIndexInFlightForTests() {
  inFlightScans.clear();
}
