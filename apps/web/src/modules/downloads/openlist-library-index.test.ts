import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  __resetOpenListLibraryIndexInFlightForTests,
  ensureOpenListLibraryIndex,
  getLatestCompletedIndexSession,
  listIndexArchives,
} from "./openlist-library-index";
import type { LocateListDirectory } from "./openlist-duplicate-locate";

describe("openlist-library-index", () => {
  afterEach(() => {
    __resetOpenListLibraryIndexInFlightForTests();
    delete process.env.MANGATEST_DB_PATH;
  });

  async function setupDb() {
    const workspace = path.join(os.tmpdir(), `mangatest-lib-index-${randomUUID()}`);
    const dbPath = path.join(workspace, "test.sqlite");
    await mkdir(workspace, { recursive: true });
    process.env.MANGATEST_DB_PATH = dbPath;
    const { bootstrapDatabase } = await import("../core/db");
    bootstrapDatabase();
    return workspace;
  }

  it("scans flat root paginated and indexes archives", async () => {
    await setupDb();
    const root = "/115Open/HENTAI/exhentai";
    let rootPageCalls = 0;

    const listDirectory: LocateListDirectory = async (listPath, options) => {
      if (listPath === root) {
        rootPageCalls += 1;
        if (options.page === 1) {
          return {
            ok: true,
            hasMore: true,
            entries: [
              { name: "Comic A", isDirectory: true, sizeBytes: 0 },
              { name: "loose.zip", isDirectory: false, sizeBytes: 10 },
            ],
          };
        }
        return {
          ok: true,
          hasMore: false,
          entries: [{ name: "Comic B", isDirectory: true, sizeBytes: 0 }],
        };
      }
      if (listPath === `${root}/Comic A`) {
        return {
          ok: true,
          hasMore: false,
          entries: [{ name: "Comic A.zip", isDirectory: false, sizeBytes: 100 }],
        };
      }
      if (listPath === `${root}/Comic B`) {
        return {
          ok: true,
          hasMore: false,
          entries: [{ name: "Comic B.cbz", isDirectory: false, sizeBytes: 200 }],
        };
      }
      return { ok: true, hasMore: false, entries: [] };
    };

    const first = await ensureOpenListLibraryIndex({ root, listDirectory });
    expect(first.started).toBe(true);
    expect(first.status).toBe("completed");
    expect(rootPageCalls).toBeGreaterThanOrEqual(2);

    const archives = listIndexArchives(first.sessionId);
    expect(archives.map((a) => a.name).sort()).toEqual(["Comic A.zip", "Comic B.cbz", "loose.zip"]);

    // Second ensure within TTL reuses completed index without second scan start
    const second = await ensureOpenListLibraryIndex({ root, listDirectory, ttlMinutes: 10 });
    expect(second.reusedCompleted).toBe(true);
    expect(second.started).toBe(false);
    expect(second.sessionId).toBe(first.sessionId);

    const completed = getLatestCompletedIndexSession(root);
    expect(completed?.id).toBe(first.sessionId);
  });

  it("single-flight: second ensure while running joins", async () => {
    await setupDb();
    const root = "/115Open/HENTAI/exhentai";
    let listStarts = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const listDirectory: LocateListDirectory = async () => {
      listStarts += 1;
      await gate;
      return { ok: true, hasMore: false, entries: [] };
    };

    const p1 = ensureOpenListLibraryIndex({ root, listDirectory, force: true });
    // allow first call to register inFlight
    await new Promise((r) => setTimeout(r, 20));
    const p2 = ensureOpenListLibraryIndex({ root, listDirectory, force: true });
    release();
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.sessionId).toBe(r2.sessionId);
    expect(r1.started || r2.joined || r2.started).toBe(true);
    // Should not start two independent full scans of root from scratch twice as separate sessions
    expect(listStarts).toBeLessThanOrEqual(2);
  });
});
