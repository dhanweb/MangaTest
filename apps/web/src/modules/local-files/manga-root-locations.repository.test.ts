import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

describe("MangaRootLocationRepository", () => {
  afterEach(() => {
    delete process.env.MANGATEST_DB_PATH;
    delete process.env.MANGATEST_PATH_PROFILE;
  });

  it("backfills the current runtime location idempotently", async () => {
    vi.resetModules();

    const workspace = path.join(os.tmpdir(), `mangatest-root-locations-${randomUUID()}`);
    const dbPath = path.join(workspace, "test.sqlite");
    const rootPath = path.join(workspace, "Manga");
    process.env.MANGATEST_DB_PATH = dbPath;
    process.env.MANGATEST_PATH_PROFILE = "windows";
    await mkdir(rootPath, { recursive: true });

    const { getSqlite } = await import("../core/db");
    const sqlite = getSqlite();
    sqlite.exec(`
      CREATE TABLE manga_roots (
        id TEXT PRIMARY KEY NOT NULL,
        absolute_path TEXT NOT NULL,
        display_name TEXT,
        scan_mode TEXT NOT NULL DEFAULT 'children_as_comics',
        kind TEXT NOT NULL DEFAULT 'user',
        is_enabled INTEGER NOT NULL DEFAULT 1,
        last_scan_session_id TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
    `);
    const rootId = randomUUID();
    sqlite.prepare("INSERT INTO manga_roots (id, absolute_path) VALUES (?, ?)").run(rootId, rootPath);

    const { bootstrapDatabase, mangaRootLocations } = await import("../core/db");
    bootstrapDatabase();
    bootstrapDatabase();

    const rows = sqlite.prepare("SELECT * FROM manga_root_locations WHERE manga_root_id = ?").all(rootId) as Array<{
      id: string;
      runtime_profile: string;
      absolute_path: string;
      verification_status: string;
    }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      runtime_profile: "windows",
      absolute_path: rootPath,
      verification_status: "unverified",
    });
    expect(sqlite.prepare("SELECT count(*) as count FROM manga_root_locations").get()).toMatchObject({ count: 2 });

    const repository = (await import("./manga-root-locations.repository")).createMangaRootLocationRepository();
    const updated = repository.upsert({
      mangaRootId: rootId,
      runtimeProfile: "windows",
      absolutePath: rootPath,
      verificationStatus: "available",
    });
    expect(updated.id).toBe(rows[0].id);
    expect(updated.verificationStatus).toBe("available");
    expect(repository.listForRoot(rootId)).toHaveLength(1);
    expect(mangaRootLocations).toBeDefined();

    sqlite.close();
  });

  it("rejects a path already owned by another root in the same profile", async () => {
    vi.resetModules();

    const workspace = path.join(os.tmpdir(), `mangatest-root-location-conflict-${randomUUID()}`);
    process.env.MANGATEST_DB_PATH = path.join(workspace, "test.sqlite");
    process.env.MANGATEST_PATH_PROFILE = "windows";
    await mkdir(workspace, { recursive: true });

    const { bootstrapDatabase, getDb, mangaRoots } = await import("../core/db");
    const { createMangaRootLocationRepository } = await import("./manga-root-locations.repository");
    bootstrapDatabase();
    const db = getDb();
    const rootPath = path.join(workspace, "Manga");
    const rootIds = [randomUUID(), randomUUID()];
    db.insert(mangaRoots)
      .values(rootIds.map((id) => ({ id, absolutePath: path.join(workspace, id), scanMode: "children_as_comics" as const })))
      .run();

    const repository = createMangaRootLocationRepository();
    repository.upsert({ mangaRootId: rootIds[0], runtimeProfile: "windows", absolutePath: rootPath });
    expect(() => repository.upsert({ mangaRootId: rootIds[1], runtimeProfile: "windows", absolutePath: rootPath })).toThrow(
      "已经被另一个漫画根目录使用",
    );
  });

  it("does not backfill a foreign-runtime legacy path as the current location", async () => {
    vi.resetModules();

    const workspace = path.join(os.tmpdir(), `mangatest-root-locations-foreign-${randomUUID()}`);
    process.env.MANGATEST_DB_PATH = path.join(workspace, "test.sqlite");
    process.env.MANGATEST_PATH_PROFILE = "wsl";
    await mkdir(workspace, { recursive: true });

    const { getSqlite } = await import("../core/db");
    const sqlite = getSqlite();
    sqlite.exec(`
      CREATE TABLE manga_roots (
        id TEXT PRIMARY KEY NOT NULL,
        absolute_path TEXT NOT NULL,
        display_name TEXT,
        scan_mode TEXT NOT NULL DEFAULT 'children_as_comics',
        kind TEXT NOT NULL DEFAULT 'user',
        is_enabled INTEGER NOT NULL DEFAULT 1,
        last_scan_session_id TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
    `);
    const rootId = randomUUID();
    sqlite.prepare("INSERT INTO manga_roots (id, absolute_path) VALUES (?, ?)").run(rootId, "D:\\hentai\\manga");

    const { bootstrapDatabase } = await import("../core/db");
    bootstrapDatabase();

    expect(sqlite.prepare("SELECT * FROM manga_root_locations WHERE manga_root_id = ?").all(rootId)).toEqual([]);
    sqlite.close();
  });
});
