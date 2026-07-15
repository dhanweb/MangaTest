import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("OpenList offline submit-once", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.MANGATEST_DB_PATH;
  });

  it("createDownloadTask submits magnet offline once; offline worker only polls", async () => {
    const offlineSubmitBodies: unknown[] = [];
    const listCalls: string[] = [];

    vi.stubGlobal("fetch", async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const url = String(input);
      if (url.includes("/api/fs/add_offline_download")) {
        offlineSubmitBodies.push(JSON.parse(String(init?.body ?? "{}")));
        return Response.json({
          code: 200,
          data: { tasks: [{ id: "ol-offline-1" }] },
          message: "success",
        });
      }

      if (url.includes("/api/task/offline_download/")) {
        listCalls.push(url);
        return Response.json({
          code: 200,
          data: [],
          message: "success",
        });
      }

      return Response.json({ code: 200, data: {}, message: "success" });
    });

    const workspace = path.join(os.tmpdir(), `mangatest-offline-once-${randomUUID()}`);
    const dbPath = path.join(workspace, "test.sqlite");
    const rootPath = path.join(workspace, "Root");
    await mkdir(rootPath, { recursive: true });
    process.env.MANGATEST_DB_PATH = dbPath;

    const { bootstrapDatabase, getSqlite } = await import("../core/db");
    const { saveRuntimeSettings } = await import("../core/settings");
    const { createDownloadTask, runOfflineWorkerTick } = await import("./index");

    bootstrapDatabase();
    const sqlite = getSqlite();
    const comicId = randomUUID();
    const mangaRootId = randomUUID();
    const sourceId = randomUUID();
    const resourceId = randomUUID();

    sqlite
      .prepare("insert into manga_roots (id, absolute_path, display_name, scan_mode, is_enabled) values (?, ?, ?, ?, ?)")
      .run(mangaRootId, rootPath, "Root", "children_as_comics", 1);
    sqlite
      .prepare("insert into comics (id, display_title, file_title, sort_title, status) values (?, ?, ?, ?, ?)")
      .run(comicId, "Magnet Comic", "Magnet Comic", "magnet comic", "remote_only");
    sqlite
      .prepare("insert into comic_sources (id, comic_id, site, source_url, original_title) values (?, ?, ?, ?, ?)")
      .run(sourceId, comicId, "plugin", "https://example.test/comic", "Magnet Comic");
    sqlite
      .prepare(
        "insert into comic_resources (id, comic_id, comic_source_id, resource_type, display_label, resource_url, redacted_resource) values (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        resourceId,
        comicId,
        sourceId,
        "magnet",
        "Magnet",
        "magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567",
        "magnet:?xt=urn:btih:...",
      );

    await saveRuntimeSettings({
      cacheDirectory: path.join(workspace, "cache"),
      openlistBaseUrl: "http://127.0.0.1:5244",
      openlistEnabled: true,
      openlistToken: "secret-openlist-token",
    });

    const created = await createDownloadTask({ comicResourceId: resourceId, provider: "openlist" });
    expect(created.created).toBe(true);
    expect(created.task.status).toBe("submitted");
    expect(created.task.remoteTaskId).toBe("ol-offline-1");
    expect(offlineSubmitBodies).toHaveLength(1);

    const tick = await runOfflineWorkerTick();
    expect(tick.taskType).toBe("offline");
    expect(offlineSubmitBodies).toHaveLength(1);
    expect(listCalls.length).toBeGreaterThan(0);

    // Queued offline leftovers must not be submitted by the worker.
    const leftoverId = randomUUID();
    const now = new Date().toISOString();
    sqlite
      .prepare(
        "insert into download_tasks (id, comic_resource_id, provider, task_type, status, target_directory, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(leftoverId, resourceId, "openlist", "offline", "queued", rootPath, now, now);

    const tick2 = await runOfflineWorkerTick();
    expect(tick2.executed).toBe(false);
    expect(offlineSubmitBodies).toHaveLength(1);

    const leftover = sqlite.prepare("select status from download_tasks where id = ?").get(leftoverId) as {
      status: string;
    };
    expect(leftover.status).toBe("queued");
  });
});

